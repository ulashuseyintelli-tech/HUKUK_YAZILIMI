import { Injectable, Logger, BadRequestException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { OfficeService } from "../office/office.service";
import { fetchWithTimeout } from "../../common/fetch-with-timeout.util";
import { maskEmail, maskPhone } from "../../common/pii-mask.util";
import * as nodemailer from "nodemailer";

export interface SendEmailDto {
  clientId: string;
  caseId?: string;
  type: string; // MASRAF_ISTEK, GENEL_BILGILENDIRME, RAPOR, HATIRLATMA
  subject: string;
  body: string;
  templateId?: string;
  dedupeKey?: string; // Faz 3 idempotency anahtarı (opsiyonel; ClientNotification.dedupeKey'e yazılır)
}

export interface SendSmsDto {
  clientId: string;
  caseId?: string;
  type: string;
  body: string;
}

/**
 * SMS bağlantı testi sonucu.
 * - "verified": sağlayıcıya gerçekten bağlanıldı ve kimlik doğrulandı (SMS gönderilmedi).
 * - "unverified": ayarlar mevcut ama bu sağlayıcı için gerçek test desteklenmiyor → YEŞİL/başarı DEĞİL.
 * - "error": sağlayıcı kimliği/bağlantıyı reddetti veya ağ hatası.
 */
export type SmsTestStatus = "verified" | "unverified" | "error";
export interface SmsTestResult {
  status: SmsTestStatus;
  message: string;
  provider?: string;
  balance?: string;
}

/**
 * NetGSM bakiye (balance/list/get) yanıtını yorumlar. SMS GÖNDERMEZ.
 * Başarı: ilk token sayısal bakiye. Bilinen hata kodları (30/40/50/60/70) → kesin hata (definite).
 * Diğer beklenmeyen yanıtlar → belirsiz (definite=false → çağıran "doğrulanamadı/uyarı" gösterir).
 */
export function parseNetGsmBalance(
  raw: string
): { ok: boolean; balance?: string; error?: string; definite?: boolean } {
  const text = (raw || "").trim();
  if (!text) return { ok: false, error: "Boş yanıt", definite: false };

  const first = text.split(/\s+/)[0];
  const errorCodes: Record<string, string> = {
    "30": "Geçersiz kullanıcı adı, şifre veya API erişim izni yok",
    "40": "Gönderici adı (başlık) sistemde tanımlı değil",
    "50": "Abone hesabı aktif değil",
    "60": "Hesap özelliği uygun değil",
    "70": "Hatalı parametre",
  };
  if (errorCodes[first]) return { ok: false, error: errorCodes[first], definite: true };

  const amount = Number(first.replace(",", "."));
  if (!Number.isNaN(amount)) return { ok: true, balance: first };

  return { ok: false, error: `Beklenmeyen yanıt: ${text.slice(0, 80)}`, definite: false };
}

/**
 * İleti Merkezi bakiye (get-balance) XML yanıtını yorumlar. SMS GÖNDERMEZ.
 * <code>200</code> → doğrulandı (varsa <amount>/<credits> bakiye). Diğer kod → kesin hata.
 * Kod bulunamazsa → belirsiz (definite=false).
 */
export function parseIletiMerkeziBalance(
  raw: string
): { ok: boolean; balance?: string; error?: string; definite?: boolean } {
  const text = (raw || "").trim();
  if (!text) return { ok: false, error: "Boş yanıt", definite: false };

  const codeMatch = text.match(/<code>\s*(\d+)\s*<\/code>/i);
  const code = codeMatch ? codeMatch[1] : undefined;

  if (code && code !== "200") {
    const msgMatch = text.match(/<message>\s*([^<]*)<\/message>/i);
    return { ok: false, error: msgMatch ? msgMatch[1].trim() : `Hata kodu ${code}`, definite: true };
  }

  if (code === "200") {
    const amtMatch =
      text.match(/<amount>\s*([^<]+?)\s*<\/amount>/i) ||
      text.match(/<credits?>\s*([^<]+?)\s*<\/credits?>/i);
    return { ok: true, balance: amtMatch ? amtMatch[1].trim() : undefined };
  }

  return { ok: false, error: "Doğrulanamadı (beklenmeyen yanıt)", definite: false };
}

@Injectable()
export class ClientNotificationService {
  private readonly logger = new Logger(ClientNotificationService.name);

  constructor(
    private prisma: PrismaService,
    private officeService: OfficeService
  ) {}

  /**
   * Bildirim Kontrol Merkezi — büro bildirim altyapısının CANLI sağlık/teşhis özeti.
   *
   * Yalnızca GERÇEKTEN gönderim yapan kaynaklardan beslenir:
   *  - ClientNotification: tebrik motoru + manuel müvekkil e-posta/SMS (son 24s sayaç, son gönderimler, hata grupları)
   *  - EscalationEvent: geciken görev eskalasyonu bildirim sonuçları (AYRI sayaç — ClientNotification yazmaz, çift sayım yok)
   *  - Office ayarları: SMTP/SMS/tebrik/eskalasyon "hazır mı" bilgisi (sırlar OKUNMAZ)
   *
   * Hukuki e-tebligat NotificationQueue (simüle statü + teslimatsız) BİLİNÇLİ olarak DIŞARIDA bırakılır;
   * dahil edilse sahte metrik üretirdi. Sırlar (smtpPass/smsApiKey/smsApiSecret) response'a KONMAZ —
   * burada yalnız host/gönderen/sağlayıcı/başlık okunur.
   *
   * /// <remarks>
   * Çağrıldığı yerler:
   * - ClientNotificationController.getOverview() → GET /client-notifications/overview (ADMIN-gate) — Bildirim Kontrol Merkezi sayfası
   * </remarks>
   */
  async getNotificationOverview(tenantId: string) {
    const now = new Date();
    const since24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const since7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Kanal/motor hazır-mı bilgisi (office getter'ları sırları zaten redakte eder)
    const [smtp, sms, greeting, escalation] = await Promise.all([
      this.officeService.getSmtpSettings(tenantId),
      this.officeService.getSmsSettings(tenantId),
      this.officeService.getGreetingSettings(tenantId),
      this.officeService.getEscalationSettings(tenantId),
    ]);

    const [cnStatusGroups, escDeliveryGroups, recentRows, failedRows] = await Promise.all([
      // Son 24 saat: gerçek müvekkil/tebrik gönderimleri, status bazında
      this.prisma.clientNotification.groupBy({
        by: ["status"],
        where: { tenantId, createdAt: { gte: since24h } },
        _count: { _all: true },
      }),
      // Son 24 saat: eskalasyon bildirim sonuçları (ClientNotification'dan AYRI kaynak)
      this.prisma.escalationEvent.groupBy({
        by: ["deliveryStatus"],
        where: {
          tenantId,
          createdAt: { gte: since24h },
          eventType: { in: ["NOTIFICATION_SENT", "NOTIFICATION_FAILED"] },
        },
        _count: { _all: true },
      }),
      // Son gönderimler (en yeni 20) — "gitti mi?" sorusu
      this.prisma.clientNotification.findMany({
        where: { tenantId },
        orderBy: { createdAt: "desc" },
        take: 20,
        select: {
          id: true,
          createdAt: true,
          channel: true,
          type: true,
          status: true,
          subject: true,
          errorMessage: true,
          client: {
            select: { displayName: true, firstName: true, lastName: true, companyName: true },
          },
        },
      }),
      // "Neden gitmedi?" — son 7 günün başarısızları (hata mesajına göre gruplanır)
      this.prisma.clientNotification.findMany({
        where: { tenantId, status: "FAILED", createdAt: { gte: since7d } },
        orderBy: { createdAt: "desc" },
        take: 200,
        select: { errorMessage: true, channel: true, createdAt: true },
      }),
    ]);

    const sumGroup = (
      groups: Array<Record<string, any>>,
      key: string,
      value: string
    ) => groups.filter((g) => g[key] === value).reduce((s, g) => s + (g._count?._all ?? 0), 0);

    const last24hSent = sumGroup(cnStatusGroups as any, "status", "SENT");
    const last24hFailed = sumGroup(cnStatusGroups as any, "status", "FAILED");
    const last24hPending = sumGroup(cnStatusGroups as any, "status", "PENDING");
    const last24hEscalationSent = sumGroup(escDeliveryGroups as any, "deliveryStatus", "SENT");
    const last24hEscalationFailed = sumGroup(escDeliveryGroups as any, "deliveryStatus", "FAILED");

    // Hata teşhisi: aynı hata mesajını grupla (neden gitmedi?)
    const failureMap = new Map<
      string,
      { reason: string; count: number; channel: string | null; lastSeenAt: Date }
    >();
    for (const r of failedRows) {
      const reason = (r.errorMessage || "Bilinmeyen hata").trim();
      const existing = failureMap.get(reason);
      if (existing) {
        existing.count += 1;
        if (r.createdAt > existing.lastSeenAt) existing.lastSeenAt = r.createdAt;
      } else {
        failureMap.set(reason, { reason, count: 1, channel: r.channel ?? null, lastSeenAt: r.createdAt });
      }
    }
    const failureGroups = Array.from(failureMap.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)
      .map((f) => ({
        reason: f.reason,
        count: f.count,
        channel: f.channel,
        lastSeenAt: f.lastSeenAt.toISOString(),
      }));

    const displayNameOf = (c: any): string | null =>
      c?.displayName ||
      [c?.firstName, c?.lastName].filter(Boolean).join(" ").trim() ||
      c?.companyName ||
      null;

    const recentDeliveries = recentRows.map((r) => ({
      id: r.id,
      createdAt: r.createdAt.toISOString(),
      channel: r.channel,
      type: r.type,
      status: r.status,
      subject: r.subject,
      recipientName: displayNameOf((r as any).client),
      errorMessage: r.errorMessage,
    }));

    // Motor durumları — gerçeğe sadık (POA "teslimat eksik" = kuyruğa yazılıyor, gönderen yok)
    const escChannels = [
      escalation.opEmailEnabled && "EMAIL",
      escalation.opSmsEnabled && "SMS",
    ].filter(Boolean) as string[];
    const escAssignees =
      (escalation.escalationManagerLawyerIds?.length || 0) +
      (escalation.escalationFounderLawyerIds?.length || 0);

    const engines = {
      greeting: {
        key: "greeting",
        status: greeting.autoGreetingEnabled ? "ACTIVE" : "OFF",
        time: greeting.autoGreetingTime || null,
      },
      escalation: {
        key: "escalation",
        status: "ACTIVE", // operasyonel eskalasyon cron'u koşulsuz çalışır
        reminderDays: escalation.opReminderDays ?? null,
        founderDays: escalation.opFounderDays ?? null,
        channels: escChannels,
        assignees: escAssignees,
        last24hSent: last24hEscalationSent,
        last24hFailed: last24hEscalationFailed,
      },
      poa: {
        key: "poa",
        status: "ATTENTION", // teslimat eksik: NotificationQueue'ya yazılıyor ama gönderen motor yok
        reason: "DELIVERY_NOT_WIRED",
      },
    };

    const channels = {
      email: {
        configured: !!smtp.smtpHost,
        host: smtp.smtpHost || null,
        sender: smtp.smtpFromEmail || smtp.smtpUser || null,
      },
      sms: {
        configured: !!sms.smsProvider,
        provider: sms.smsProvider || null,
        title: sms.smsSender || null,
      },
    };

    const activeEngines = [engines.greeting, engines.escalation].filter(
      (e) => e.status === "ACTIVE"
    ).length;
    const attentionEngines = [engines.poa].filter((e) => e.status === "ATTENTION").length;
    // Planlandı listesi statiktir (motoru olmayan, sahte aktiflik gösterilmeyen özellikler)
    const plannedEngines = 5;

    return {
      generatedAt: now.toISOString(),
      channels,
      engines,
      stats: {
        last24hSent,
        last24hFailed,
        last24hPending,
        last24hEscalationSent,
        last24hEscalationFailed,
        activeEngines,
        attentionEngines,
        plannedEngines,
      },
      recentDeliveries,
      failureGroups,
    };
  }

  /**
   * Bildirim Kontrol Merkezi — seçili GERÇEK müvekkile GERÇEK [TEST] bildirimi (PR-N3).
   *
   * Mevcut sendEmail/sendSms yolunu type:"TEST" + NÖTR içerikle yeniden kullanır:
   * gerçek gönderim yapılır ve sonuç ClientNotification'a (SENT/FAILED) loglanır.
   * Yeni model / migration / transport YOK; rastgele alıcı YOK (clientId zorunlu, tenant-scoped).
   * Alıcı yanıtta maskelenir; sağlayıcı hata mesajı sır/uzunluk açısından sanitize edilir.
   *
   * /// <remarks>
   * Çağrıldığı yerler:
   * - ClientNotificationController.testSend() → POST /client-notifications/test-send (ADMIN) — Kontrol Merkezi "Gerçek Test Gönderimi"
   * </remarks>
   */
  async testSend(
    tenantId: string,
    userId: string,
    params: { clientId: string; channel: "EMAIL" | "SMS" }
  ): Promise<{
    success: boolean;
    channel: "EMAIL" | "SMS";
    status: "SENT" | "FAILED";
    recipient?: string;
    notificationId?: string;
    errorMessage?: string;
  }> {
    const { clientId, channel } = params;
    // Nötr, [TEST] etiketli içerik — dosya/borç/vekalet/müvekkil verisi İÇERMEZ.
    const TEST_SUBJECT = "[TEST] Hukuk Platform Bildirim Testi";
    const TEST_EMAIL_HTML =
      "<p>Bu bir <strong>test bildirimidir</strong>.</p>" +
      "<p>Bu mesaj, hukuk platformundaki e-posta bildirim kanalının çalıştığını doğrulamak " +
      "amacıyla gönderilmiştir. Herhangi bir dosya, borç, vekalet veya hukuki işlem bildirimi değildir.</p>";
    const TEST_SMS_TEXT =
      "[TEST] Hukuk Platform test mesajıdır. Herhangi bir hukuki işlem bildirimi değildir.";

    try {
      if (channel === "EMAIL") {
        const r = await this.sendEmail(tenantId, userId, {
          clientId,
          type: "TEST",
          subject: TEST_SUBJECT,
          body: TEST_EMAIL_HTML,
        });
        return {
          success: true,
          channel,
          status: "SENT",
          recipient: maskEmail(r.recipient),
          notificationId: r.notificationId,
        };
      }
      const r = await this.sendSms(tenantId, userId, {
        clientId,
        type: "TEST",
        body: TEST_SMS_TEXT,
      });
      return {
        success: true,
        channel,
        status: "SENT",
        recipient: maskPhone(r.recipient),
        notificationId: r.notificationId,
      };
    } catch (error: any) {
      // sendEmail/sendSms başarısızlıkta BadRequestException FIRLATIR (ve gönderim-hatasında
      // FAILED satırını zaten yazar). Burada dürüst bir FAILED sonucuna çeviriyoruz ki UI anında
      // gösterebilsin; sağlayıcı ham mesajındaki olası sırları redakte ediyoruz.
      return {
        success: false,
        channel,
        status: "FAILED",
        errorMessage: this.sanitizeTestError(error?.message),
      };
    }
  }

  /** Test gönderim hata mesajını UI'a vermeden önce sır/uzunluk açısından temizler. */
  private sanitizeTestError(message?: string): string {
    const raw = (message || "Gönderim başarısız").toString();
    return raw
      .replace(/\b(pass(?:word)?|secret|api[_-]?key|api[_-]?secret|token)\b\s*[:=]?\s*\S+/gi, "$1=***")
      .slice(0, 300);
  }

  // E-posta gönder
  async sendEmail(tenantId: string, userId: string, dto: SendEmailDto) {
    // Müvekkil bilgilerini al
    const client = await this.prisma.client.findFirst({
      where: { id: dto.clientId, tenantId },
      include: { contacts: true },
    });

    if (!client) {
      throw new BadRequestException("Müvekkil bulunamadı");
    }

    // E-posta adresini bul
    const emailContact = client.contacts?.find(
      (c) => c.type === "EMAIL" && c.isPrimary
    ) || client.contacts?.find((c) => c.type === "EMAIL");
    
    const recipientEmail = emailContact?.value || client.email;

    if (!recipientEmail) {
      throw new BadRequestException("Müvekkilin e-posta adresi bulunamadı");
    }

    // SMTP ayarlarını al
    const smtpSettings = await this.officeService.getFullSmtpSettings(tenantId);

    if (!smtpSettings.smtpHost || !smtpSettings.smtpUser) {
      throw new BadRequestException(
        "E-posta ayarları yapılandırılmamış. Lütfen Büro Ayarları > E-posta bölümünden SMTP ayarlarını yapın."
      );
    }

    // Nodemailer transporter oluştur
    const transporter = nodemailer.createTransport({
      host: smtpSettings.smtpHost,
      port: smtpSettings.smtpPort || 587,
      secure: smtpSettings.smtpSecure || false,
      auth: {
        user: smtpSettings.smtpUser,
        pass: smtpSettings.smtpPass,
      },
    } as nodemailer.TransportOptions);

    // Bildirim kaydı oluştur
    const notification = await this.prisma.clientNotification.create({
      data: {
        tenantId,
        clientId: dto.clientId,
        caseId: dto.caseId,
        channel: "EMAIL",
        type: dto.type,
        subject: dto.subject,
        body: dto.body,
        status: "PENDING",
        sentById: userId,
        metadata: dto.templateId ? { templateId: dto.templateId } : undefined,
        dedupeKey: dto.dedupeKey,
      },
    });

    try {
      // E-posta gönder
      const fromName = smtpSettings.smtpFromName || "Hukuk Bürosu";
      const fromEmail = smtpSettings.smtpFromEmail || smtpSettings.smtpUser;

      await transporter.sendMail({
        from: `"${fromName}" <${fromEmail}>`,
        to: recipientEmail,
        subject: dto.subject,
        html: dto.body,
      });

      // Başarılı - durumu güncelle
      await this.prisma.clientNotification.update({
        where: { id: notification.id },
        data: {
          status: "SENT",
          sentAt: new Date(),
        },
      });

      this.logger.log(`E-posta gönderildi: ${maskEmail(recipientEmail)}`);

      return {
        success: true,
        notificationId: notification.id,
        recipient: recipientEmail,
      };
    } catch (error: any) {
      // Hata - durumu güncelle
      await this.prisma.clientNotification.update({
        where: { id: notification.id },
        data: {
          status: "FAILED",
          errorMessage: error.message,
        },
      });

      this.logger.error(`E-posta gönderilemedi: ${error.message}`);
      throw new BadRequestException(`E-posta gönderilemedi: ${error.message}`);
    }
  }

  // SMS gönder (NetGSM API)
  async sendSms(tenantId: string, userId: string, dto: SendSmsDto) {
    const client = await this.prisma.client.findFirst({
      where: { id: dto.clientId, tenantId },
      include: { contacts: true },
    });

    if (!client) {
      throw new BadRequestException("Müvekkil bulunamadı");
    }

    // Telefon numarasını bul
    const phoneContact = client.contacts?.find(
      (c) => c.type === "MOBILE" && c.isPrimary
    ) || client.contacts?.find((c) => c.type === "MOBILE");
    
    let recipientPhone = phoneContact?.value || client.phone;

    if (!recipientPhone) {
      throw new BadRequestException("Müvekkilin telefon numarası bulunamadı");
    }

    // Telefon numarasını formatla (90 ile başlamalı)
    recipientPhone = this.formatPhoneNumber(recipientPhone);

    // SMS ayarlarını al
    const smsSettings = await this.officeService.getFullSmsSettings(tenantId);

    if (!smsSettings.smsProvider || !smsSettings.smsApiKey) {
      throw new BadRequestException(
        "SMS ayarları yapılandırılmamış. Lütfen Büro Ayarları > SMS bölümünden ayarları yapın."
      );
    }

    // Bildirim kaydı oluştur
    const notification = await this.prisma.clientNotification.create({
      data: {
        tenantId,
        clientId: dto.clientId,
        caseId: dto.caseId,
        channel: "SMS",
        type: dto.type,
        body: dto.body,
        status: "PENDING",
        sentById: userId,
      },
    });

    try {
      let result;
      
      const smsConfig = {
        smsApiKey: smsSettings.smsApiKey || "",
        smsApiSecret: smsSettings.smsApiSecret || "",
        smsSender: smsSettings.smsSender || "",
      };

      if (smsSettings.smsProvider === "NETGSM") {
        result = await this.sendNetGsmSms(smsConfig, recipientPhone, dto.body);
      } else if (smsSettings.smsProvider === "ILETI_MERKEZI") {
        result = await this.sendIletiMerkeziSms(smsConfig, recipientPhone, dto.body);
      } else {
        throw new BadRequestException(`Desteklenmeyen SMS sağlayıcı: ${smsSettings.smsProvider}`);
      }

      // Başarılı - durumu güncelle
      await this.prisma.clientNotification.update({
        where: { id: notification.id },
        data: {
          status: "SENT",
          sentAt: new Date(),
          metadata: { smsResult: result },
        },
      });

      this.logger.log(`SMS gönderildi: ${maskPhone(recipientPhone)}`);

      return {
        success: true,
        notificationId: notification.id,
        recipient: recipientPhone,
      };
    } catch (error: any) {
      // Hata - durumu güncelle
      await this.prisma.clientNotification.update({
        where: { id: notification.id },
        data: {
          status: "FAILED",
          errorMessage: error.message,
        },
      });

      this.logger.error(`SMS gönderilemedi: ${error.message}`);
      throw new BadRequestException(`SMS gönderilemedi: ${error.message}`);
    }
  }

  // Telefon numarasını formatla
  private formatPhoneNumber(phone: string): string {
    // Boşlukları ve özel karakterleri temizle
    let cleaned = phone.replace(/[\s\-\(\)\.]/g, "");
    
    // +90 ile başlıyorsa + işaretini kaldır
    if (cleaned.startsWith("+")) {
      cleaned = cleaned.substring(1);
    }
    
    // 0 ile başlıyorsa 90 ekle
    if (cleaned.startsWith("0")) {
      cleaned = "90" + cleaned.substring(1);
    }
    
    // 5 ile başlıyorsa (sadece numara) 90 ekle
    if (cleaned.startsWith("5") && cleaned.length === 10) {
      cleaned = "90" + cleaned;
    }
    
    return cleaned;
  }

  // NetGSM API ile SMS gönder
  private async sendNetGsmSms(
    settings: { smsApiKey: string; smsApiSecret: string; smsSender: string },
    phone: string,
    message: string
  ): Promise<any> {
    const url = "https://api.netgsm.com.tr/sms/send/get";
    
    const params = new URLSearchParams({
      usercode: settings.smsApiKey,
      password: settings.smsApiSecret,
      gsmno: phone,
      message: message,
      msgheader: settings.smsSender || "HUKUKBURO",
      filter: "0",
    });

    const response = await fetchWithTimeout(`${url}?${params.toString()}`, undefined, 10_000);
    const result = await response.text();

    // NetGSM yanıt kodları
    // 00: Başarılı, 20: Mesaj metni boş, 30: Geçersiz kullanıcı, vb.
    const code = result.split(" ")[0];
    
    if (code !== "00" && !result.startsWith("00")) {
      const errorMessages: Record<string, string> = {
        "20": "Mesaj metni boş",
        "30": "Geçersiz kullanıcı adı veya şifre",
        "40": "Gönderen adı sistemde tanımlı değil",
        "50": "Abone hesabı aktif değil",
        "51": "Abone hesabı aktif değil",
        "70": "Hatalı sorgulama",
        "80": "Gönderim tarihi hatalı",
        "85": "Mükerrer gönderim",
      };
      throw new Error(errorMessages[code] || `NetGSM hatası: ${result}`);
    }

    return { provider: "NETGSM", response: result };
  }

  // İleti Merkezi API ile SMS gönder
  private async sendIletiMerkeziSms(
    settings: { smsApiKey: string; smsApiSecret: string; smsSender: string },
    phone: string,
    message: string
  ): Promise<any> {
    const url = "https://api.iletimerkezi.com/v1/send-sms/get";
    
    const params = new URLSearchParams({
      username: settings.smsApiKey,
      password: settings.smsApiSecret,
      text: message,
      receipents: phone,
      sender: settings.smsSender || "HUKUKBURO",
    });

    const response = await fetchWithTimeout(`${url}?${params.toString()}`, undefined, 10_000);
    const result = await response.text();

    // Basit hata kontrolü
    if (result.includes("error") || result.includes("Error")) {
      throw new Error(`İleti Merkezi hatası: ${result}`);
    }

    return { provider: "ILETI_MERKEZI", response: result };
  }

  // SMS bağlantı testi
  /**
   * SMS sağlayıcı bağlantısını GERÇEKTEN doğrular — bakiye/kredi ucunu çağırır, SMS GÖNDERMEZ.
   * Sahte "başarılı" dönmez:
   *  - NETGSM / ILETI_MERKEZI → bakiye ucu ile kimlik+bağlantı doğrulanır (status "verified"),
   *    kimlik reddi/ağ hatası → "error".
   *  - Desteklenmeyen sağlayıcı → "unverified" (ayar kayıtlı ama gerçek test yapılamadı; YEŞİL DEĞİL).
   *
   * <remarks>
   * Çağrıldığı yerler:
   * - ClientNotificationController.testSmsConnection() → POST /client-notifications/test-sms
   *   (Büro Ayarları > SMS > "Test" butonu; office/page.tsx handleTestSms)
   * </remarks>
   */
  async testSmsConnection(tenantId: string): Promise<SmsTestResult> {
    const smsSettings = await this.officeService.getFullSmsSettings(tenantId);

    if (!smsSettings.smsProvider || !smsSettings.smsApiKey) {
      throw new BadRequestException("SMS ayarları yapılandırılmamış");
    }

    const provider = smsSettings.smsProvider;
    const apiKey = smsSettings.smsApiKey || "";
    const apiSecret = smsSettings.smsApiSecret || "";

    try {
      if (provider === "NETGSM") {
        const params = new URLSearchParams({ usercode: apiKey, password: apiSecret });
        const res = await fetchWithTimeout(
          `https://api.netgsm.com.tr/balance/list/get?${params.toString()}`,
          undefined,
          10_000
        );
        const parsed = parseNetGsmBalance(await res.text());
        if (parsed.ok) {
          return {
            status: "verified",
            provider,
            balance: parsed.balance,
            message: `NetGSM bağlantısı doğrulandı${parsed.balance ? ` (kalan kredi: ${parsed.balance})` : ""}`,
          };
        }
        return {
          status: parsed.definite ? "error" : "unverified",
          provider,
          message: parsed.definite
            ? `NetGSM doğrulanamadı: ${parsed.error}`
            : `NetGSM bağlantısı doğrulanamadı (yanıt anlaşılamadı): ${parsed.error}`,
        };
      }

      if (provider === "ILETI_MERKEZI") {
        const params = new URLSearchParams({ username: apiKey, password: apiSecret });
        const res = await fetchWithTimeout(
          `https://api.iletimerkezi.com/v1/get-balance/get?${params.toString()}`,
          undefined,
          10_000
        );
        const parsed = parseIletiMerkeziBalance(await res.text());
        if (parsed.ok) {
          return {
            status: "verified",
            provider,
            balance: parsed.balance,
            message: `İleti Merkezi bağlantısı doğrulandı${parsed.balance ? ` (kalan kredi: ${parsed.balance})` : ""}`,
          };
        }
        return {
          status: parsed.definite ? "error" : "unverified",
          provider,
          message: parsed.definite
            ? `İleti Merkezi doğrulanamadı: ${parsed.error}`
            : `İleti Merkezi bağlantısı doğrulanamadı (yanıt anlaşılamadı): ${parsed.error}`,
        };
      }

      // Desteklenmeyen sağlayıcı: gerçek test yapılamıyor → sahte başarı DÖNME
      return {
        status: "unverified",
        provider,
        message: `Ayarlar kayıtlı ancak "${provider}" için gerçek SMS bağlantı testi desteklenmiyor (bağlantı test edilmedi).`,
      };
    } catch (e: any) {
      return {
        status: "error",
        provider,
        message: `SMS sağlayıcısına bağlanılamadı: ${e.message}`,
      };
    }
  }

  // Müvekkilin bildirim geçmişi
  async getClientNotifications(tenantId: string, clientId: string) {
    return this.prisma.clientNotification.findMany({
      where: { tenantId, clientId },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
  }

  // Dosya bazlı bildirimler
  async getCaseNotifications(tenantId: string, caseId: string) {
    return this.prisma.clientNotification.findMany({
      where: { tenantId, caseId },
      orderBy: { createdAt: "desc" },
      include: {
        client: {
          select: { id: true, displayName: true, firstName: true, lastName: true },
        },
      },
    });
  }

  // E-posta şablonlarını getir
  async getEmailTemplates(tenantId: string, category?: string) {
    return this.prisma.messageTemplate.findMany({
      where: {
        tenantId,
        isActive: true,
        ...(category ? { category: category as any } : {}),
      },
      orderBy: { name: "asc" },
    });
  }

  // E-posta şablonu oluştur
  async createEmailTemplate(
    tenantId: string,
    data: {
      name: string;
      code: string;
      category: string;
      subject: string;
      body: string;
      isDefault?: boolean;
    }
  ) {
    return this.prisma.messageTemplate.create({
      data: {
        tenantId,
        code: data.code,
        name: data.name,
        category: data.category as any,
        channel: 'EMAIL',
        subject: data.subject,
        body: data.body,
        isActive: true,
        isSystem: false,
      },
    });
  }

  // E-posta şablonu güncelle
  async updateEmailTemplate(
    tenantId: string,
    templateId: string,
    data: {
      name?: string;
      subject?: string;
      body?: string;
      isActive?: boolean;
      isDefault?: boolean;
    }
  ) {
    return this.prisma.messageTemplate.update({
      where: { id: templateId },
      data: {
        name: data.name,
        subject: data.subject,
        body: data.body,
        isActive: data.isActive,
      },
    });
  }

  // Varsayılan şablonları oluştur
  async createDefaultTemplates(tenantId: string) {
    const templates = [
      {
        code: "MASRAF_TALEBI",
        name: "Masraf Talebi",
        category: "MASRAF",
        subject: "{{caseNo}} Nolu Dosya - Masraf Talebi",
        body: `<p>Sayın {{clientName}},</p>
<p><strong>{{caseNo}}</strong> numaralı dosyanız için aşağıdaki masrafların karşılanması gerekmektedir:</p>
<p>{{expenseDetails}}</p>
<p><strong>Toplam Tutar: {{totalAmount}} TL</strong></p>
<p>Ödemenizi aşağıdaki hesaba yapabilirsiniz:</p>
<p>{{bankDetails}}</p>
<p>Saygılarımızla,<br>{{officeName}}</p>`,
        isDefault: true,
      },
      {
        code: "GENEL_BILGILENDIRME",
        name: "Genel Bilgilendirme",
        category: "BILGILENDIRME",
        subject: "{{caseNo}} Nolu Dosya Hakkında Bilgilendirme",
        body: `<p>Sayın {{clientName}},</p>
<p><strong>{{caseNo}}</strong> numaralı dosyanız hakkında sizi bilgilendirmek istiyoruz:</p>
<p>{{messageContent}}</p>
<p>Sorularınız için bizimle iletişime geçebilirsiniz.</p>
<p>Saygılarımızla,<br>{{officeName}}</p>`,
        isDefault: true,
      },
      {
        code: "DOSYA_DURUMU",
        name: "Dosya Durum Raporu",
        category: "RAPOR",
        subject: "{{caseNo}} Nolu Dosya - Durum Raporu",
        body: `<p>Sayın {{clientName}},</p>
<p><strong>{{caseNo}}</strong> numaralı dosyanızın güncel durumu aşağıdaki gibidir:</p>
<p><strong>Dosya Durumu:</strong> {{caseStatus}}</p>
<p><strong>Son İşlem:</strong> {{lastAction}}</p>
<p><strong>Toplam Alacak:</strong> {{totalAmount}} TL</p>
<p><strong>Tahsil Edilen:</strong> {{collectedAmount}} TL</p>
<p>Saygılarımızla,<br>{{officeName}}</p>`,
        isDefault: true,
      },
    ];

    for (const template of templates) {
      const existing = await this.prisma.messageTemplate.findFirst({
        where: { tenantId, code: template.code },
      });

      if (!existing) {
        await this.prisma.messageTemplate.create({
          data: { 
            tenantId, 
            code: template.code,
            name: template.name,
            category: template.category as any,
            channel: 'EMAIL',
            subject: template.subject,
            body: template.body,
            isActive: true,
            isSystem: true,
          },
        });
      }
    }

    return { message: "Varsayılan şablonlar oluşturuldu" };
  }

  // SMTP bağlantı testi
  async testSmtpConnection(tenantId: string) {
    const smtpSettings = await this.officeService.getFullSmtpSettings(tenantId);

    if (!smtpSettings.smtpHost || !smtpSettings.smtpUser) {
      throw new BadRequestException("SMTP ayarları yapılandırılmamış");
    }

    const transporter = nodemailer.createTransport({
      host: smtpSettings.smtpHost,
      port: smtpSettings.smtpPort || 587,
      secure: smtpSettings.smtpSecure || false,
      auth: {
        user: smtpSettings.smtpUser,
        pass: smtpSettings.smtpPass,
      },
    } as nodemailer.TransportOptions);

    try {
      await transporter.verify();
      return { success: true, message: "SMTP bağlantısı başarılı" };
    } catch (error: any) {
      throw new BadRequestException(`SMTP bağlantı hatası: ${error.message}`);
    }
  }

  // Toplu e-posta gönder
  async sendBulkEmail(
    tenantId: string,
    userId: string,
    data: {
      recipients: string[];
      subject: string;
      message: string;
      type: "clients" | "debtors";
    }
  ) {
    const { recipients, subject, message, type } = data;
    
    if (!recipients || recipients.length === 0) {
      throw new BadRequestException("En az bir alıcı seçilmelidir");
    }

    // SMTP ayarlarını al
    const smtpSettings = await this.officeService.getFullSmtpSettings(tenantId);
    if (!smtpSettings.smtpHost || !smtpSettings.smtpUser) {
      throw new BadRequestException("SMTP ayarları yapılandırılmamış");
    }

    // Alıcıları getir
    let recipientList: { id: string; email: string | null; name: string }[] = [];
    
    if (type === "clients") {
      const clients = await this.prisma.client.findMany({
        where: { id: { in: recipients }, tenantId },
        select: { id: true, email: true, displayName: true },
      });
      recipientList = clients.map(c => ({ id: c.id, email: c.email, name: c.displayName || "Müvekkil" }));
    } else {
      const debtors = await this.prisma.debtor.findMany({
        where: { id: { in: recipients }, tenantId },
        select: { id: true, email: true, name: true },
      });
      recipientList = debtors.map(d => ({ id: d.id, email: d.email, name: d.name }));
    }

    // E-posta adresi olanları filtrele
    const validRecipients = recipientList.filter(r => r.email);
    
    if (validRecipients.length === 0) {
      throw new BadRequestException("Seçilen alıcıların hiçbirinde e-posta adresi yok");
    }

    // Transporter oluştur
    const transporter = nodemailer.createTransport({
      host: smtpSettings.smtpHost,
      port: smtpSettings.smtpPort || 587,
      secure: smtpSettings.smtpSecure || false,
      auth: {
        user: smtpSettings.smtpUser,
        pass: smtpSettings.smtpPass,
      },
    } as nodemailer.TransportOptions);

    // Her alıcıya e-posta gönder
    const results = { sent: 0, failed: 0, errors: [] as string[] };
    
    for (const recipient of validRecipients) {
      try {
        await transporter.sendMail({
          from: smtpSettings.smtpFromEmail || smtpSettings.smtpUser,
          to: recipient.email!,
          subject: subject,
          html: `<p>Sayın ${recipient.name},</p>${message.replace(/\n/g, "<br>")}`,
        });

        // Bildirim kaydı oluştur
        if (type === "clients") {
          await this.prisma.clientNotification.create({
            data: {
              tenantId,
              clientId: recipient.id,
              type: "BULK_EMAIL",
              channel: "EMAIL",
              subject,
              body: message,
              status: "SENT",
              sentAt: new Date(),
              sentById: userId,
            },
          });
        }

        results.sent++;
      } catch (error: any) {
        results.failed++;
        results.errors.push(`${recipient.email}: ${error.message}`);
      }
    }

    return {
      success: true,
      message: `${results.sent} e-posta gönderildi, ${results.failed} başarısız`,
      details: results,
    };
  }
}
