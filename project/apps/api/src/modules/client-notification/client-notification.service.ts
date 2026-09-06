import { Injectable, Logger, BadRequestException, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { OfficeService } from "../office/office.service";
import { fetchWithTimeout } from "../../common/fetch-with-timeout.util";
import { maskEmail, maskPhone } from "../../common/pii-mask.util";
import * as nodemailer from "nodemailer";

interface PoaRecentDeliveryOverviewRow {
  id: string;
  createdAt: Date;
  status: string;
  recipientEmail: string | null;
  lastError: string | null;
}

const NOTIFICATION_HTML_ALLOWED_TAGS = new Set([
  "b",
  "br",
  "em",
  "i",
  "li",
  "ol",
  "p",
  "strong",
  "u",
  "ul",
]);

/**
 * E-posta gövdesinde yalnız attributesiz temel biçimlendirme etiketlerini korur.
 * Diğer etiketler atılır; metin ve entity başlangıçları HTML-escape edilir.
 */
export function sanitizeNotificationHtml(value: string): string {
  const source = String(value ?? "");
  let output = "";
  let cursor = 0;

  while (cursor < source.length) {
    const tagStart = source.indexOf("<", cursor);
    if (tagStart === -1) {
      output += escapeNotificationHtmlText(source.slice(cursor));
      break;
    }

    output += escapeNotificationHtmlText(source.slice(cursor, tagStart));
    const tagEnd = source.indexOf(">", tagStart + 1);
    if (tagEnd === -1) {
      output += escapeNotificationHtmlText(source.slice(tagStart));
      break;
    }

    const rawTag = source.slice(tagStart + 1, tagEnd);
    const normalizedTag = normalizeNotificationHtmlTag(rawTag);
    if (normalizedTag === undefined) {
      output += escapeNotificationHtmlText(source.slice(tagStart, tagEnd + 1));
    } else if (normalizedTag !== null) {
      output += normalizedTag;
    }
    cursor = tagEnd + 1;
  }

  return output;
}

function normalizeNotificationHtmlTag(rawTag: string): string | null | undefined {
  let cursor = 0;
  while (cursor < rawTag.length && isNotificationHtmlWhitespace(rawTag[cursor])) cursor += 1;

  const closing = rawTag[cursor] === "/";
  if (closing) {
    cursor += 1;
    while (cursor < rawTag.length && isNotificationHtmlWhitespace(rawTag[cursor])) cursor += 1;
  }

  const nameStart = cursor;
  while (cursor < rawTag.length && isNotificationHtmlTagNameChar(rawTag[cursor])) cursor += 1;
  if (cursor === nameStart) return undefined;

  const tag = rawTag.slice(nameStart, cursor).toLowerCase();
  if (!NOTIFICATION_HTML_ALLOWED_TAGS.has(tag)) return null;
  if (tag === "br") return closing ? null : "<br>";
  return closing ? `</${tag}>` : `<${tag}>`;
}

function isNotificationHtmlWhitespace(value: string): boolean {
  return value === " " || value === "\t" || value === "\n" || value === "\r";
}

function isNotificationHtmlTagNameChar(value: string): boolean {
  const code = value.charCodeAt(0);
  return (
    (code >= 48 && code <= 57) ||
    (code >= 65 && code <= 90) ||
    (code >= 97 && code <= 122)
  );
}

function escapeNotificationHtmlText(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * CAD C3 attachment threading (owner-ratified bounded write): mail EKİ yalnız
 * TAŞIMA sırasında geçirilir. İçerik (Buffer) ClientNotification kaydına veya
 * audit metnine ASLA yazılmaz; kalıcı yüzeye yalnız dosya adı/tipi düşer.
 */
export interface ClientNotificationAttachment {
  filename: string;
  content: Buffer | string;
  contentType?: string;
}

export interface SendEmailDto {
  clientId: string;
  caseId?: string;
  type: string; // MASRAF_ISTEK, GENEL_BILGILENDIRME, RAPOR, HATIRLATMA
  subject: string;
  body: string;
  persistedSubject?: string; // Gonderilen subject farkli olabilir; DBde saklanacak safe subject.
  persistedBody?: string; // Gonderilen body farkli olabilir; DBde saklanacak safe body.
  templateId?: string;
  dedupeKey?: string; // Faz 3 idempotency anahtarı (opsiyonel; ClientNotification.dedupeKey'e yazılır)
  /** Opsiyonel mail ekleri — TAŞIMA-ONLY (içerik DB'ye yazılmaz). Verilmezse davranış birebir aynıdır. */
  attachments?: readonly ClientNotificationAttachment[];
  /**
   * G4 (C1-B05-A): önceden atomik claim edilmiş PENDING kaydın id'si. Verildiğinde sendEmail
   * YENİ kayıt OLUŞTURMAZ; kaydı tenant+client+dedupeKey+PENDING ile YENİDEN DOĞRULAYIP (Inv-2)
   * o kayıt üzerinden gönderir. Verilmezse davranış birebir eskisi gibidir (geriye-uyumlu).
   */
  reuseNotificationId?: string;
}

/**
 * G4 atomik claim sonucu (C1-B05-A, Inv-5). Yalnız `ACQUIRED` gönderim yapabilir; diğerleri
 * mevcut kaydı işaret eder. Public DispatchResult şekli DEĞİŞMEZ — dispatcher bunu map eder.
 */
export type NotificationClaimResult =
  | { kind: 'ACQUIRED'; notificationId: string }
  | { kind: 'EXISTING_PENDING'; notificationId: string }
  | { kind: 'EXISTING_SENT'; notificationId: string }
  | { kind: 'EXISTING_FAILED'; notificationId: string };

/**
 * G4 resend reclaim sonucu (C1-B05-A, owner düzeltme-2). resend/force YENİ satır oluşturamaz ve
 * kilitsiz gönderemez. Aynı advisory lock altında YALNIZ FAILED → PENDING atomik geçişiyle mevcut
 * kayıt yeniden sahiplenilir (RECLAIMED). PENDING/SENT → RED; kayıt yoksa NO_RECORD.
 */
export type NotificationReclaimResult =
  | { kind: 'RECLAIMED'; notificationId: string }
  | { kind: 'EXISTING_PENDING'; notificationId: string }
  | { kind: 'EXISTING_SENT'; notificationId: string }
  | { kind: 'NO_RECORD' };

/**
 * C1-B05-B — durable delivery-intent (QUEUED-first). Finansal posting tx'i YALNIZ QUEUED
 * intent oluşturur; provider'a hiç dokunmaz. State ayrımı (owner kararı):
 *   QUEUED   → provider henüz çağrılmadı; güvenle (yeniden) işlenebilir.
 *   PENDING  → provider çağrısı başladı veya sonuç belirsiz; OTOMATİK resend YOK.
 *   SENT     → provider kabul + kalıcı SENT damgası.
 *   FAILED   → pre-provider deterministik veya kesin red; yalnız explicit reclaim.
 */
export interface EnqueueEmailIntentParams {
  clientId: string;
  caseId?: string;
  type: string;
  dedupeKey: string; // stable — timestamp içermez
  templateCode: string;
  /** Render CLAIM anında yapılır (posting tx'i şablona bağımlı DEĞİL); token'lar intent'te taşınır. */
  tokens: Record<string, string>;
}

export type QueuedNotificationClaimResult =
  | { kind: 'CLAIMED'; notificationId: string }
  | { kind: 'NOT_QUEUED'; notificationId: string; status: string }
  | { kind: 'NOT_FOUND' };

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

    const [poaStatusGroups, poaRecentRows, poaFailedRows, poaLastSent, poaLastFailed] = await Promise.all([
      (this.prisma as any).poaExpiryNotificationDelivery.groupBy({
        by: ["status"],
        where: { tenantId },
        _count: { _all: true },
      }),
      (this.prisma as any).poaExpiryNotificationDelivery.findMany({
        where: { tenantId },
        orderBy: { createdAt: "desc" },
        take: 20,
        select: {
          id: true,
          createdAt: true,
          status: true,
          recipientEmail: true,
          recipientSource: true,
          lastError: true,
          client: { select: { displayName: true, firstName: true, lastName: true, companyName: true } },
        },
      }),
      (this.prisma as any).poaExpiryNotificationDelivery.findMany({
        where: { tenantId, status: "FAILED", updatedAt: { gte: since7d } },
        orderBy: { updatedAt: "desc" },
        take: 200,
        select: { lastError: true, updatedAt: true },
      }),
      (this.prisma as any).poaExpiryNotificationDelivery.findFirst({
        where: { tenantId, status: "SENT" },
        orderBy: { sentAt: "desc" },
        select: { sentAt: true, updatedAt: true },
      }),
      (this.prisma as any).poaExpiryNotificationDelivery.findFirst({
        where: { tenantId, status: "FAILED" },
        orderBy: { updatedAt: "desc" },
        select: { updatedAt: true },
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

    const poaExpiry = {
      pending: sumGroup(poaStatusGroups as any, "status", "PENDING"),
      sent: sumGroup(poaStatusGroups as any, "status", "SENT"),
      failed: sumGroup(poaStatusGroups as any, "status", "FAILED"),
      lastSentAt: poaLastSent?.sentAt ? poaLastSent.sentAt.toISOString() : null,
      lastFailureAt: poaLastFailed?.updatedAt ? poaLastFailed.updatedAt.toISOString() : null,
    };

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
    for (const r of poaFailedRows) {
      const reason = (r.lastError || "POA teslimat hatasi").trim();
      const existing = failureMap.get(reason);
      if (existing) {
        existing.count += 1;
        if (r.updatedAt > existing.lastSeenAt) existing.lastSeenAt = r.updatedAt;
      } else {
        failureMap.set(reason, { reason, count: 1, channel: "EMAIL", lastSeenAt: r.updatedAt });
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

    const clientRecentDeliveries = recentRows.map((r) => ({
      id: r.id,
      createdAt: r.createdAt.toISOString(),
      channel: r.channel,
      type: r.type,
      status: r.status,
      subject: r.subject,
      recipientName: displayNameOf((r as any).client),
      errorMessage: r.errorMessage,
    }));

    const poaRecentDeliveries = (poaRecentRows as PoaRecentDeliveryOverviewRow[]).map((r) => ({
      id: r.id,
      createdAt: r.createdAt.toISOString(),
      channel: "EMAIL",
      type: "POA_EXPIRY",
      status: r.status,
      subject: "Vekalet süresi uyarısı",
      recipientName: maskEmail(r.recipientEmail),
      errorMessage: r.lastError,
    }));

    const recentDeliveries = [...clientRecentDeliveries, ...poaRecentDeliveries]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 20);

    // Motor durumları — gerçeğe sadık (POA artık gerçek delivery tablosundan beslenir)
    const escChannels = [
      escalation.opEmailEnabled && "EMAIL",
      escalation.opSmsEnabled && "SMS",
    ].filter(Boolean) as string[];
    // F-B01-03 / OFF-P2-CAP-07: escalation*LawyerIds alanlari S2'dir. ADM01 S2 icin "exact field-level
    // permission" ister, OD-07 "missing policy fails closed" der ve tasiyici henuz yoktur. Bu alanlardan
    // TURETILEN toplam (manager listesi uzunlugu + founder listesi uzunlugu) da S2 turevidir; rol kapisi
    // (ADMIN) alan izni + purpose yerine GECMEZ. Politika tasiyicisi tanimlanana kadar HTTP okuma yuzeyine
    // CIKARILMAZ (yokluk, maskeleme degil) ve yerine turetilmis baska bir alan KONMAZ.
    // Buro Ayarlari sayfasi da ayni omit nedeniyle listeleri GOSTEREMEZ: orada sayi "—" olarak gosterilir
    // (settings/office/page.tsx escAssignedCount === null) ve alanin gizli oldugu ayrica uyarilir.
    // Servis getter'i ve escalation motoru DEGISMEZ: gercek alici listeleri ic tuketicide kullanilmaya devam eder.

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
        last24hSent: last24hEscalationSent,
        last24hFailed: last24hEscalationFailed,
      },
      poa: {
        key: "poa",
        status: "ACTIVE",
        reason: "DELIVERY_WIRED",
        poaExpiry,
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

    const activeEngines = [engines.greeting, engines.escalation, engines.poa].filter(
      (e) => e.status === "ACTIVE"
    ).length;
    const attentionEngines = 0;
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

    // Müvekkil bu tenant'ta gerçekten var mı? Yoksa 404 — gönderim DENENMEZ
    // (cross-tenant / geçersiz id engellenir, hiçbir gerçek mesaj çıkmaz).
    const exists = await this.prisma.client.findFirst({
      where: { id: clientId, tenantId },
      select: { id: true },
    });
    if (!exists) {
      throw new NotFoundException("Müvekkil bulunamadı");
    }

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
        errorMessage: this.sanitizeProviderError(error?.message),
      };
    }
  }

  /** Provider hatasını response, persistence veya log yüzeyine vermeden önce temizler. */
  private sanitizeProviderError(message?: string): string {
    const raw = (message || "Gönderim başarısız").toString();
    return raw
      .replace(/https?:\/\/[^\s?]+\?[^\s]*/gi, (url) => `${url.split("?")[0]}?[REDACTED_QUERY]`)
      .replace(/\/\/([^:/\s]+):([^@\s]+)@/g, "//$1:***@")
      .replace(
        /\b(pass(?:word)?|secret|api[_-]?key|api[_-]?secret|token|usercode|username)\b\s*[:=]?\s*[^\s&,;]+/gi,
        "$1=***"
      )
      .slice(0, 300);
  }

  // E-posta gönder
  async sendEmail(tenantId: string, userId: string, dto: SendEmailDto) {
    // Inv-2: reuse yolu → provider'a ulaşmadan ÖNCE claim kaydını tenant+client+dedupeKey+PENDING ile
    // YENİDEN DOĞRULA ve id'yi al. Pre-send hataları (no-recipient/SMTP) bu claim'i FAILED işaretler
    // (orphan-PENDING bırakılmaz; owner düzeltme-3).
    let claimRowId: string | null = null;
    if (dto.reuseNotificationId) {
      const claimed = await this.prisma.clientNotification.findFirst({
        where: {
          id: dto.reuseNotificationId,
          tenantId,
          clientId: dto.clientId,
          ...(dto.dedupeKey ? { dedupeKey: dto.dedupeKey } : { dedupeKey: null }),
          status: "PENDING",
        },
        select: { id: true },
      });
      if (!claimed) {
        throw new BadRequestException(
          "Claim doğrulaması başarısız (tenant/client/dedupeKey/PENDING eşleşmedi) — gönderim iptal edildi",
        );
      }
      claimRowId = claimed.id;
    }
    const markClaimFailed = async (reason: string): Promise<void> => {
      if (claimRowId) {
        await this.prisma.clientNotification
          .update({ where: { id: claimRowId }, data: { status: "FAILED", errorMessage: reason.slice(0, 300) } })
          .catch(() => undefined);
      }
    };

    // Müvekkil + CANONICAL recipient resolution (TEK source-of-truth): primary EMAIL → any EMAIL → client.email.
    const client = await this.prisma.client.findFirst({
      where: { id: dto.clientId, tenantId },
      include: { contacts: true },
    });
    if (!client) {
      await markClaimFailed("client-not-found");
      throw new BadRequestException("Müvekkil bulunamadı");
    }
    const emailContact =
      client.contacts?.find((c) => c.type === "EMAIL" && c.isPrimary) ||
      client.contacts?.find((c) => c.type === "EMAIL");
    const recipientEmail = emailContact?.value || client.email;
    if (!recipientEmail) {
      // Fail-closed: geçerli alıcı yok → provider çağrısı YOK, claim FAILED (güvenli terminal).
      await markClaimFailed("recipient-missing");
      throw new BadRequestException("Müvekkilin e-posta adresi bulunamadı");
    }

    const smtpSettings = await this.officeService.getFullSmtpSettings(tenantId);
    if (!smtpSettings.smtpHost || !smtpSettings.smtpUser) {
      await markClaimFailed("smtp-not-configured");
      throw new BadRequestException(
        "E-posta ayarları yapılandırılmamış. Lütfen Büro Ayarları > E-posta bölümünden SMTP ayarlarını yapın.",
      );
    }

    const safeHtmlBody = sanitizeNotificationHtml(dto.body);
    const safePersistedBody = sanitizeNotificationHtml(dto.persistedBody ?? dto.body);

    const transporter = nodemailer.createTransport({
      host: smtpSettings.smtpHost,
      port: smtpSettings.smtpPort || 587,
      secure: smtpSettings.smtpSecure || false,
      auth: { user: smtpSettings.smtpUser, pass: smtpSettings.smtpPass },
    } as nodemailer.TransportOptions);

    // Ek TAŞIMA-ONLY: içerik burada tutulmaz, yalnız nodemailer'a devredilir.
    const attachments = dto.attachments?.length
      ? dto.attachments.map((a) => ({
          filename: a.filename,
          content: a.content,
          ...(a.contentType ? { contentType: a.contentType } : {}),
        }))
      : undefined;

    // Kalıcı yüzeye yalnız ek KİMLİĞİ düşer (dosya adı/tipi) — Buffer ASLA yazılmaz.
    const metadata = {
      ...(dto.templateId ? { templateId: dto.templateId } : {}),
      ...(attachments
        ? { attachments: attachments.map((a) => ({ filename: a.filename, contentType: a.contentType ?? null })) }
        : {}),
    };

    // Kayıt: reuse (claim satırı) VEYA yeni oluştur (geriye-uyumlu doğrudan çağıranlar; call-shape korunur).
    const notification: { id: string } = claimRowId
      ? { id: claimRowId }
      : await this.prisma.clientNotification.create({
          data: {
            tenantId,
            clientId: dto.clientId,
            caseId: dto.caseId,
            channel: "EMAIL",
            type: dto.type,
            subject: dto.persistedSubject ?? dto.subject,
            body: safePersistedBody,
            status: "PENDING",
            sentById: userId,
            metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
            dedupeKey: dto.dedupeKey,
          },
        });

    // Provider gönderimi
    const fromName = smtpSettings.smtpFromName || "Hukuk Bürosu";
    const fromEmail = smtpSettings.smtpFromEmail || smtpSettings.smtpUser;
    try {
      await transporter.sendMail({
        from: `"${fromName}" <${fromEmail}>`,
        to: recipientEmail,
        subject: dto.subject,
        ...(attachments ? { attachments } : {}),
        html: safeHtmlBody,
      });
    } catch (error: any) {
      // OWNER SAFETY: provider çağrısı BAŞLADIKTAN sonra outcome sınıflandırması.
      // FAILED yalnız KESİN RED (kalıcı SMTP 5xx yanıtı). Diğer her şey (timeout/connection-reset/
      // transport-exception/4xx/responseCode yok) = SONUÇ BELİRSİZ → PENDING KALIR (güvenli varsayılan;
      // FAILED VARSAYILMAZ). Belirsizde teslim olmuş olabilir → kör resend duplicate riski.
      const safeError = this.sanitizeProviderError(error?.message);
      const rc = typeof error?.responseCode === "number" ? error.responseCode : undefined;
      const definitiveRejection = rc !== undefined && rc >= 500 && rc < 600;
      if (definitiveRejection) {
        await this.prisma.clientNotification.update({
          where: { id: notification.id },
          data: { status: "FAILED", errorMessage: safeError },
        });
        this.logger.error(`E-posta kesin reddedildi (SMTP ${rc}): ${safeError}`);
        throw new BadRequestException(`E-posta gönderilemedi (kesin red)`);
      }
      // Belirsiz sonuç → PENDING kalır (FAILED yapılmaz), delivery-uncertain. Raw error kullanıcıya çıkmaz.
      this.logger.error(
        `E-posta gönderim sonucu BELİRSİZ — kayıt PENDING kalıyor (manuel reconciliation): notif=${notification.id}`,
      );
      throw new BadRequestException("E-posta gönderim sonucu belirsiz — teslim doğrulanamadı (manuel reconciliation gerekir)");
    }

    // Provider KABUL ETTİ. Inv-4 (owner düzeltmesi): SENT damgası AYRI ve ZORUNLU kanıttır.
    // Damga başarısızsa KALICI KANIT YOKTUR → sonuç `sent` DÖNEMEZ; sanitize `failed` throw edilir.
    // Kayıt PENDING KALIR (FAILED'a çevrilmez — mail gitmiş olabilir) → normal dispatch tekrar
    // gönderemez (EXISTING_PENDING skip). Belirsizlik manuel reconciliation ister; kör resend yok.
    try {
      await this.prisma.clientNotification.update({
        where: { id: notification.id },
        data: { status: "SENT", sentAt: new Date() },
      });
    } catch (markError: any) {
      this.logger.error(
        `SENT damgası yazılamadı; kalıcı kanıt yok, kayıt PENDING kalıyor (manuel reconciliation): notif=${notification.id}`,
      );
      throw new BadRequestException(
        "E-posta gönderim sonucu kalıcılaştırılamadı — sonuç belirsiz (manuel reconciliation gerekir)",
      );
    }

    this.logger.log(`E-posta gönderildi: ${maskEmail(recipientEmail)}`);
    return { success: true, notificationId: notification.id, recipient: recipientEmail };
  }

  /**
   * G4 (C1-B05-A) — ATOMİK + KALICI CLAIM. Provider çağrısından ÖNCE, migration OLMADAN.
   * Advisory xact-lock (Inv-3: hashtextextended(tenant|sep|dedupeKey)) altında dedupeKey için
   * mevcut kayıt kontrolü + yoksa PENDING claim satırı create. Lock xact-scoped → COMMIT'te
   * bırakılır; provider ağ çağrısı bu tx'in DIŞINDA yapılır. İki concurrent çağrıdan yalnız biri
   * ACQUIRED alır; diğeri EXISTING_PENDING görür (Inv-1: SENT/PENDING/FAILED üçü de EXISTING —
   * normal dispatch FAILED'ı da retry etmez, retry yalnız resend yolundan force ile).
   */
  async claimNotificationSlot(
    tenantId: string,
    userId: string,
    dto: SendEmailDto,
  ): Promise<NotificationClaimResult> {
    if (!dto.dedupeKey) {
      throw new BadRequestException("claimNotificationSlot: dedupeKey zorunlu");
    }
    const lockKeyText = `client-notification-dispatch|${tenantId}|${dto.dedupeKey}`;
    const safePersistedBody = sanitizeNotificationHtml(dto.persistedBody ?? dto.body);
    const metadata = dto.templateId ? { templateId: dto.templateId } : undefined;

    return this.prisma.$transaction(async (tx) => {
      // Inv-3: deterministic advisory xact lock (tenant + domain-separator + dedupeKey)
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKeyText}, 0))`;

      const existing = await tx.clientNotification.findFirst({
        where: { tenantId, dedupeKey: dto.dedupeKey },
        orderBy: { createdAt: "desc" },
        select: { id: true, status: true },
      });
      if (existing) {
        if (existing.status === "SENT") return { kind: "EXISTING_SENT", notificationId: existing.id };
        if (existing.status === "PENDING") return { kind: "EXISTING_PENDING", notificationId: existing.id };
        // FAILED (veya diğer terminal): normal dispatch RETRY ETMEZ (Inv-1).
        return { kind: "EXISTING_FAILED", notificationId: existing.id };
      }

      const row = await tx.clientNotification.create({
        data: {
          tenantId,
          clientId: dto.clientId,
          caseId: dto.caseId,
          channel: "EMAIL",
          type: dto.type,
          subject: dto.persistedSubject ?? dto.subject,
          body: safePersistedBody,
          status: "PENDING",
          sentById: userId,
          metadata,
          dedupeKey: dto.dedupeKey,
        },
        select: { id: true },
      });
      return { kind: "ACQUIRED", notificationId: row.id };
    });
  }

  /**
   * G4 resend (owner düzeltme-2) — resend/force YENİ satır oluşturmaz ve kilitsiz göndermez.
   * Aynı advisory lock (Inv-3) altında dedupeKey için mevcut kayıt: PENDING→RED, SENT→RED,
   * FAILED→atomik FAILED→PENDING reclaim (aynı satır) → provider'a reuse ile gider. Kayıt yoksa NO_RECORD.
   */
  async reclaimFailedNotificationSlot(
    tenantId: string,
    _userId: string,
    dto: SendEmailDto,
  ): Promise<NotificationReclaimResult> {
    if (!dto.dedupeKey) {
      throw new BadRequestException("reclaimFailedNotificationSlot: dedupeKey zorunlu");
    }
    const lockKeyText = `client-notification-dispatch|${tenantId}|${dto.dedupeKey}`;
    const safePersistedBody = sanitizeNotificationHtml(dto.persistedBody ?? dto.body);

    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKeyText}, 0))`;

      const existing = await tx.clientNotification.findFirst({
        where: { tenantId, dedupeKey: dto.dedupeKey },
        orderBy: { createdAt: "desc" },
        select: { id: true, status: true },
      });
      if (!existing) return { kind: "NO_RECORD" };
      if (existing.status === "SENT") return { kind: "EXISTING_SENT", notificationId: existing.id };
      if (existing.status === "PENDING") return { kind: "EXISTING_PENDING", notificationId: existing.id };

      // FAILED → atomik FAILED→PENDING reclaim (AYNI satır; yeni satır YOK). errorMessage temizlenir,
      // güncel render (subject/body) yazılır; reuse re-verify (Inv-2) bu PENDING satırı doğrular.
      await tx.clientNotification.update({
        where: { id: existing.id },
        data: {
          status: "PENDING",
          errorMessage: null,
          subject: dto.persistedSubject ?? dto.subject,
          body: safePersistedBody,
        },
      });
      return { kind: "RECLAIMED", notificationId: existing.id };
    });
  }

  /**
   * C1-B05-B — QUEUED delivery-intent'i FİNANSAL POSTING TX'İ İÇİNDE kalıcılaştırır (owner outcome-4).
   * Render YAPMAZ (şablon hatası finansal tx'i bozamaz); token'lar metadata'da taşınır. Provider'a
   * dokunmaz. Aynı dedupeKey için mevcut satır varsa yeni satır AÇMAZ (idempotent replay).
   *
   * <remarks>
   * Çağrıldığı yerler:
   * - CaseBalanceService.postExpenseActual() → typed EXPENSE_ACTUAL posting tx'i (aynı transaction)
   * </remarks>
   */
  async enqueueEmailIntentInTransaction(
    tx: Prisma.TransactionClient,
    tenantId: string,
    userId: string,
    params: EnqueueEmailIntentParams,
  ): Promise<{ notificationId: string; created: boolean }> {
    if (!params.dedupeKey) {
      throw new BadRequestException("enqueueEmailIntentInTransaction: dedupeKey zorunlu");
    }
    const existing = await tx.clientNotification.findFirst({
      where: { tenantId, dedupeKey: params.dedupeKey },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    if (existing) {
      return { notificationId: existing.id, created: false };
    }
    const row = await tx.clientNotification.create({
      data: {
        tenantId,
        clientId: params.clientId,
        caseId: params.caseId,
        channel: "EMAIL",
        type: params.type,
        // Nötr placeholder — PII/render İÇERMEZ; gerçek içerik claim anında render edilip yazılır.
        subject: "Bildirim kuyruğa alındı",
        body: "Gerçekleşen masraf bildirimi kuyruğa alındı (henüz gönderilmedi).",
        status: "QUEUED",
        sentById: userId,
        metadata: { intent: "EMAIL_TEMPLATE", templateCode: params.templateCode, tokens: params.tokens },
        dedupeKey: params.dedupeKey,
      },
      select: { id: true },
    });
    return { notificationId: row.id, created: true };
  }

  /**
   * C1-B05-B — atomik QUEUED→PENDING claim (advisory lock altında; commit sonrası provider).
   * YALNIZ QUEUED satır claim edilebilir; PENDING/SENT/FAILED DOKUNULMAZ (PENDING otomatik
   * yeniden gönderilmez — owner crash kuralı). Render edilmiş içerik claim ile birlikte yazılır.
   *
   * <remarks>
   * Çağrıldığı yerler:
   * - NotificationDispatcherService.dispatchQueuedIntent() → render sonrası atomik claim
   * </remarks>
   */
  async claimQueuedNotificationSlot(
    tenantId: string,
    notificationId: string,
    rendered: { subject: string; body: string },
  ): Promise<QueuedNotificationClaimResult> {
    // dedupeKey immutable — lock anahtarı için önce okunur; status kararı LOCK ALTINDA verilir.
    const row = await this.prisma.clientNotification.findFirst({
      where: { id: notificationId, tenantId },
      select: { id: true, dedupeKey: true },
    });
    if (!row || !row.dedupeKey) return { kind: "NOT_FOUND" };
    const lockKeyText = `client-notification-dispatch|${tenantId}|${row.dedupeKey}`;
    const safeBody = sanitizeNotificationHtml(rendered.body);

    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKeyText}, 0))`;
      const current = await tx.clientNotification.findFirst({
        where: { id: notificationId, tenantId },
        select: { id: true, status: true },
      });
      if (!current) return { kind: "NOT_FOUND" };
      if (current.status !== "QUEUED") {
        return { kind: "NOT_QUEUED", notificationId: current.id, status: current.status };
      }
      await tx.clientNotification.update({
        where: { id: current.id },
        data: { status: "PENDING", subject: rendered.subject, body: safeBody },
      });
      return { kind: "CLAIMED", notificationId: current.id };
    });
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
      const safeError = this.sanitizeProviderError(error?.message);
      // Hata - durumu güncelle
      await this.prisma.clientNotification.update({
        where: { id: notification.id },
        data: {
          status: "FAILED",
          errorMessage: safeError,
        },
      });

      this.logger.error(`SMS gönderilemedi: ${safeError}`);
      throw new BadRequestException(`SMS gönderilemedi: ${safeError}`);
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
  // CLIENT-SEC-H2B: atomik tenant-scoped update. `updateMany({id,tenantId})` + count===0 kontrolü
  // ile cross-tenant ve nonexistent template AYNI güvenli sonucu üretir (varlık ifşası yok);
  // read-then-write TOCTOU'suna dönülmez (bkz. office-approval.service.ts'in aynı deseni).
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
    const result = await this.prisma.messageTemplate.updateMany({
      where: { id: templateId, tenantId },
      data: {
        name: data.name,
        subject: data.subject,
        body: data.body,
        isActive: data.isActive,
      },
    });
    if (result.count === 0) {
      throw new NotFoundException("Şablon bulunamadı");
    }
    // updateMany güncellenmiş satırı döndürmez; response-contract'ı korumak için aynı
    // tenant-scope ile yeniden okunur (yukarıdaki updateMany zaten bu tenant'a ait olduğunu
    // kanıtladığından bu okuma güvenlidir).
    return this.prisma.messageTemplate.findFirst({ where: { id: templateId, tenantId } });
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
          text: `Sayın ${recipient.name},\n\n${message}`,
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
