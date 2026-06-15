import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { PrismaService } from "../../prisma/prisma.service";
import { OfficeService } from "../office/office.service";
import { fetchWithTimeout } from "../../common/fetch-with-timeout.util";
import { EscalationTier } from "@prisma/client";
import {
  computeEscalationUpdate,
  channelsForTier,
  normalizeTrPhone,
  EscalationConfig,
} from "./escalation-logic";
import * as nodemailer from "nodemailer";

interface Recipients {
  emails: { name: string; email: string }[]; // ad-soyad ile hitap için isim taşınır
  phones: { name: string; phone: string }[]; // yalnız FOUNDER için doldurulur
}

/**
 * Gönderim sonucu (PR-3b.2 retry-safety):
 *  - SENT: en az bir kanal gerçekten teslim etti → guard ilerler.
 *  - FAILED: sağlayıcı hatası/exception (geçici) → guard ilerlemez, sonraki tick retry.
 *  - SKIPPED: gönderecek kimse/yapılandırma yok (benign) → guard ilerlemez (self-heal).
 */
type DispatchResult = "SENT" | "FAILED" | "SKIPPED";

/** Dispatch çıktısı (K2): sonuç + denenen kanallar/alıcı sayıları (EscalationEvent metadata'sı için). */
interface DispatchOutcome {
  result: DispatchResult;
  channels: string[]; // gerçekten denenen kanallar, ör. ["EMAIL"] / ["EMAIL","SMS"]
  emailRecipients: number;
  smsRecipients: number;
}

/**
 * Operasyonel eksik görevlerinin (taskCategory=OPERATIONAL_COMPLETENESS) eskalasyon motoru.
 * Saat başı çalışır; büro-geneli config'e (Office) göre STAFF→MANAGER→FOUNDER bildirim atar.
 * Çift-gönderim guard'ı: Task.lastNotifiedLevel (aynı tier'a saat başı tekrar göndermez).
 * Göndericiler office SMTP/SMS yapılandırılmamışsa "skipped" loglar, HİÇBİR ŞEY göndermez.
 *
 * PR-3b.2 retry-safety: guard (lastNotifiedLevel) gönderim SONUCUNA göre yazılır →
 * yalnız SENT'te ilerler. FAILED (sağlayıcı hatası) / SKIPPED (alıcı/yapılandırma yok)
 * durumunda baseline'da kalır → sonraki tick aynı tier'ı retry eder. Zaman çizelgesi
 * (escalationLevel + nextFollowUpAt) gönderimden bağımsız HER ZAMAN kalıcıdır.
 *
 * <remarks>
 * Çağrıldığı yerler:
 * - @Cron(EVERY_HOUR) processEscalations() (otomatik)
 * - EscalationController.run() → POST /escalation/run (manuel tetik / test)
 * </remarks>
 */
@Injectable()
export class OperationalEscalationService {
  private readonly logger = new Logger(OperationalEscalationService.name);

  constructor(
    private prisma: PrismaService,
    private officeService: OfficeService
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async scheduledRun(): Promise<void> {
    await this.processEscalations();
  }

  /** Tüm tenant'ların açık operasyonel görevlerini işler. Manuel tetikten de çağrılır. */
  async processEscalations(
    now: Date = new Date()
  ): Promise<{ processed: number; notified: number; skipped: number; failed: number }> {
    let processed = 0;
    let notified = 0;
    let skipped = 0;
    let failed = 0;

    const tenants = await this.prisma.tenant.findMany({ include: { office: true } });

    for (const tenant of tenants) {
      const office = tenant.office;
      if (!office) continue;

      const tasks = await this.prisma.task.findMany({
        where: {
          tenantId: tenant.id,
          taskCategory: "OPERATIONAL_COMPLETENESS",
          status: { in: ["PENDING", "IN_PROGRESS"] },
          escalationLevel: { not: null },
        },
        // Mail/SMS şablonunda "hangi müvekkil/borçlu?" sorusunu yanıtlamak için ad alanları çekilir.
        // PR-D4b: borçlu-bağlı görevler için debtor.name de çekilir (debtor-aware dispatch).
        include: {
          client: { select: { displayName: true, firstName: true, lastName: true, companyName: true } },
          debtor: { select: { name: true } },
          // PR-D4e-1: istihbarat görevinde "hangi adres" mailde gösterilsin.
          address: { select: { street: true, district: true, city: true } },
        },
      });

      const cfg: EscalationConfig = {
        reminderDays: office.opReminderDays,
        founderDays: office.opFounderDays,
        repeatMonths: office.opRepeatMonths,
      };

      for (const task of tasks) {
        processed++;
        const upd = computeEscalationUpdate(
          {
            createdAt: task.createdAt,
            escalationLevel: task.escalationLevel,
            lastNotifiedLevel: task.lastNotifiedLevel,
            nextFollowUpAt: task.nextFollowUpAt,
          },
          cfg,
          now
        );

        // K2: tier GERÇEKTEN ilerlediyse append-only iz bırak (FOUNDER periyodik tekrarda tier
        // değişmez → TIER_ADVANCED yok, yalnız NOTIFICATION). best-effort.
        if (task.escalationLevel && upd.escalationLevel !== task.escalationLevel) {
          await this.recordEscalationEvent(tenant.id, task.id, {
            eventType: "TIER_ADVANCED",
            fromLevel: task.escalationLevel,
            toLevel: upd.escalationLevel,
          });
        }

        // PR-3b.2 retry-safety: guard (lastNotifiedLevel) gönderim SONUCUNA göre yazılır.
        // Zaman çizelgesi (escalationLevel + nextFollowUpAt) zamana bağlıdır → HER ZAMAN kalıcı.
        // Guard yalnız SENT'te ilerler; FAILED/SKIPPED'te baseline'da kalır → sonraki tick retry.
        let guardToPersist: EscalationTier | null = upd.lastNotifiedLevel;

        if (upd.notifyTier) {
          const outcome = await this.dispatch(tenant.id, office, task, upd.notifyTier, now, upd.nextFollowUpAt);
          const result = outcome.result;
          if (result === "SENT") {
            notified++;
            guardToPersist = upd.lastNotifiedLevel; // gönderildi → guard ilerler
          } else {
            // FAILED veya SKIPPED → guard ilerlemez (baseline), aynı tier retry edilebilir kalır.
            guardToPersist = upd.lastNotifiedLevelOnFailure;
            if (result === "FAILED") {
              failed++;
              this.logger.warn(
                `Eskalasyon gönderimi BAŞARISIZ → guard ilerletilmedi (retry edilecek): ` +
                  `tenant ${tenant.id}, task ${task.id}, tier ${upd.notifyTier}`
              );
            } else {
              skipped++;
            }
          }

          // K2: dispatch başına TEK aggregated NOTIFICATION_* event (kanal/alıcı detayı metadata'da).
          await this.recordEscalationEvent(tenant.id, task.id, {
            eventType: `NOTIFICATION_${result}` as any,
            toLevel: upd.notifyTier,
            channel: outcome.channels.length ? outcome.channels.join(",") : null,
            deliveryStatus: result,
            metadata: {
              channels: outcome.channels,
              emailRecipients: outcome.emailRecipients,
              smsRecipients: outcome.smsRecipients,
              notifyTier: upd.notifyTier,
            },
          });
        }

        await this.prisma.task.update({
          where: { id: task.id },
          data: {
            escalationLevel: upd.escalationLevel,
            lastNotifiedLevel: guardToPersist,
            nextFollowUpAt: upd.nextFollowUpAt,
          },
        });
      }
    }

    this.logger.log(
      `Eskalasyon turu bitti: processed=${processed} notified=${notified} skipped=${skipped} failed=${failed}`
    );
    return { processed, notified, skipped, failed };
  }

  /**
   * K2: Eskalasyon geçmişine append-only iz yazar. BEST-EFFORT — yazım hatası motoru/retry'ı
   * BOZMAZ (yalnız warn loglar). Append-only: bu kayıtlar asla update/delete edilmez.
   */
  private async recordEscalationEvent(
    tenantId: string,
    taskId: string,
    ev: {
      eventType: string;
      fromLevel?: EscalationTier | null;
      toLevel?: EscalationTier | null;
      channel?: string | null;
      deliveryStatus?: string | null;
      metadata?: any;
    }
  ): Promise<void> {
    try {
      await this.prisma.escalationEvent.create({
        data: {
          tenantId,
          taskId,
          eventType: ev.eventType as any,
          fromLevel: ev.fromLevel ?? null,
          toLevel: ev.toLevel ?? null,
          channel: ev.channel ?? null,
          deliveryStatus: ev.deliveryStatus ?? null,
          metadata: ev.metadata ?? undefined,
        },
      });
    } catch (e: any) {
      this.logger.warn(`EscalationEvent yazılamadı (task ${taskId}, ${ev.eventType}): ${e?.message}`);
    }
  }

  /** Bir tier için alıcıları çözer (config → fallback rank/role). */
  private async resolveRecipients(tenantId: string, office: any, tier: EscalationTier): Promise<Recipients> {
    if (tier === "STAFF") {
      const staff = await this.prisma.staffMember.findMany({
        where: { tenantId, isActive: true, staffType: { in: office.opStaffTypes || [] } },
        select: { firstName: true, lastName: true, email: true },
      });
      return {
        emails: staff
          .filter((s) => !!s.email)
          .map((s) => ({ name: `${s.firstName} ${s.lastName}`.trim(), email: s.email as string })),
        phones: [],
      };
    }

    if (tier === "MANAGER") {
      const lawyers = office.escalationManagerLawyerIds?.length
        ? await this.prisma.lawyer.findMany({ where: { tenantId, isActive: true, id: { in: office.escalationManagerLawyerIds } }, select: { name: true, surname: true, email: true } })
        : await this.prisma.lawyer.findMany({ where: { tenantId, isActive: true, lawyerRank: "MANAGER" }, select: { name: true, surname: true, email: true } });
      return {
        emails: lawyers
          .filter((l) => !!l.email)
          .map((l) => ({ name: `${l.name} ${l.surname}`.trim(), email: l.email as string })),
        phones: [],
      };
    }

    // FOUNDER
    const founders = office.escalationFounderLawyerIds?.length
      ? await this.prisma.lawyer.findMany({ where: { tenantId, isActive: true, id: { in: office.escalationFounderLawyerIds } }, select: { name: true, surname: true, email: true, mobilePhone: true } })
      : await this.prisma.lawyer.findMany({ where: { tenantId, isActive: true, role: { in: ["OWNER", "PARTNER"] } }, select: { name: true, surname: true, email: true, mobilePhone: true } });
    return {
      emails: founders
        .filter((l) => !!l.email)
        .map((l) => ({ name: `${l.name} ${l.surname}`.trim(), email: l.email as string })),
      phones: founders
        .filter((l) => !!l.mobilePhone)
        .map((l) => ({ name: `${l.name} ${l.surname}`.trim(), phone: l.mobilePhone as string })),
    };
  }

  /**
   * Bildirimi ilgili kanallardan gönderir (PR-3b.2).
   * Sonuç: SENT (≥1 kanal teslim) / FAILED (sağlayıcı hatası→retry) / SKIPPED (alıcı/yapılandırma yok).
   * `now` + `nextEscalationAt` mail/SMS şablonunda "kalan süre" ve "ne zaman eskale olur"
   * bilgisini üretmek için kullanılır (motor mantığını DEĞİŞTİRMEZ, yalnız içerik).
   */
  private async dispatch(
    tenantId: string,
    office: any,
    task: any,
    tier: EscalationTier,
    now: Date,
    nextEscalationAt: Date | null
  ): Promise<DispatchOutcome> {
    const { email, sms } = channelsForTier(tier);
    const recipients = await this.resolveRecipients(tenantId, office, tier);

    if (recipients.emails.length === 0 && recipients.phones.length === 0) {
      this.logger.warn(`Eskalasyon skipped: ${tier} alıcısı yok (tenant ${tenantId}, task ${task.id})`);
      return { result: "SKIPPED", channels: [], emailRecipients: 0, smsRecipients: 0 };
    }

    // PR-D4b: muhatap müvekkil VEYA borçlu olabilir → etiket/ad/deep-link entity'den gelir.
    const entity = escalationEntity(task);
    const missingList = humanizeMissingFields(task.missingFields, task.description);
    const link = entity.link;
    const createdStr = formatTrDateTime(task.createdAt);
    const dueStr = task.dueDate ? formatTrDateTime(task.dueDate) : "Belirtilmemiş";
    const remainingStr = formatRemaining(task.dueDate, now);
    const priorityStr = priorityTr(task.priority);
    const escalationLine = nextEscalationLine(tier, nextEscalationAt);

    // PR-D4e-1: istihbarat görevi farklı içerik ("saha teyidi gerekli", "eksik bilgi" DEĞİL).
    const intel = isIntelligenceTask(task);
    const addressText = taskAddressText(task);
    const subject = escalationSubject(task, entity);
    let anySent = false;
    let anyFailed = false;
    const channels: string[] = [];
    let emailRecipients = 0;
    let smsRecipients = 0;

    if (email && office.opEmailEnabled !== false && recipients.emails.length > 0) {
      channels.push("EMAIL");
      emailRecipients = recipients.emails.length;
      for (const r of recipients.emails) {
        const html = intel
          ? // PR-D4e-1: SAHA İSTİHBARATI içeriği (veri eksikliği değil).
            `Sayın ${r.name},<br><br>` +
            `Aşağıdaki <b>saha istihbaratı</b> görevi teyidinizi beklemektedir:<br><br>` +
            `<b>${entity.label}:</b><br>${entity.name}<br><br>` +
            (addressText ? `<b>Adres:</b><br>${addressText}<br><br>` : "") +
            `<b>Görev:</b><br>${task.title || "Saha teyidi"}<br>${(task.description || "").replace(/\n/g, "<br>")}<br><br>` +
            `<b>Son Tamamlama Tarihi:</b><br>${dueStr}<br><br>` +
            `<b>Kalan Süre:</b><br>${remainingStr}<br><br>` +
            `<b>Görev Önceliği:</b><br>${priorityStr}<br><br>` +
            (link ? `<b>Borçluya Git:</b><br><a href="${link}">${link}</a><br><br>` : "") +
            `Lütfen sahada teyit edip sonucu sisteme girin.<br><br>` +
            `<b>Eskalasyon:</b><br>${escalationLine}`
          : `Sayın ${r.name},<br><br>` +
            `Aşağıdaki operasyonel görev sizin çözümünüzü beklemektedir.<br><br>` +
            `<b>${entity.label}:</b><br>${entity.name}<br><br>` +
            `<b>Eksik Bilgiler:</b><br>${missingList.map((m) => `&bull; ${m}`).join("<br>")}<br><br>` +
            `<b>Oluşturulma Tarihi:</b><br>${createdStr}<br><br>` +
            `<b>Son Tamamlama Tarihi:</b><br>${dueStr}<br><br>` +
            `<b>Kalan Süre:</b><br>${remainingStr}<br><br>` +
            `<b>Görev Önceliği:</b><br>${priorityStr}<br><br>` +
            (link ? `<b>Göreve Git:</b><br><a href="${link}">${link}</a><br><br>` : "") +
            `<b>Eskalasyon:</b><br>${escalationLine}`;
        const r1 = await this.sendTenantEmail(tenantId, r.email, subject, html);
        if (r1 === "SENT") anySent = true;
        else if (r1 === "FAILED") anyFailed = true;
      }
    }
    if (sms && office.opSmsEnabled !== false && recipients.phones.length > 0) {
      channels.push("SMS");
      smsRecipients = recipients.phones.length;
      for (const r of recipients.phones) {
        const msg = intel
          ? `Sayın ${r.name}, ${entity.name} için saha teyidi bekliyor${addressText ? ` (${addressText})` : ""}. ` +
            `Kalan süre: ${remainingStr}.` +
            (link ? ` ${link}` : "")
          : `Sayın ${r.name}, ${entity.name} (${entity.label.toLowerCase()}) için bilgiler eksik (${missingList.join(", ")}). ` +
            `Kalan süre: ${remainingStr}.` +
            (link ? ` ${link}` : "");
        const r2 = await this.sendTenantSms(tenantId, r.phone, msg);
        if (r2 === "SENT") anySent = true;
        else if (r2 === "FAILED") anyFailed = true;
      }
    }

    // En az bir teslim → SENT. Aksi halde gerçek hata varsa FAILED (retry), yoksa SKIPPED (self-heal).
    const result: DispatchResult = anySent ? "SENT" : anyFailed ? "FAILED" : "SKIPPED";
    return { result, channels, emailRecipients, smsRecipients };
  }

  /**
   * Tenant SMTP ile ham e-posta gönderir (PR-3b.2).
   * SKIPPED: SMTP yapılandırılmamış. FAILED: gönderim exception'ı (retry). SENT: başarılı.
   */
  private async sendTenantEmail(tenantId: string, to: string, subject: string, html: string): Promise<DispatchResult> {
    const s = await this.officeService.getFullSmtpSettings(tenantId).catch(() => null);
    if (!s || !s.smtpHost || !s.smtpUser) {
      this.logger.warn(`E-posta skipped (SMTP yapılandırılmamış): tenant ${tenantId}`);
      return "SKIPPED";
    }
    try {
      const transporter = nodemailer.createTransport({
        host: s.smtpHost,
        port: s.smtpPort || 587,
        secure: s.smtpSecure || false,
        auth: { user: s.smtpUser, pass: s.smtpPass },
      } as nodemailer.TransportOptions);
      const from = `"${s.smtpFromName || "Hukuk Bürosu"}" <${s.smtpFromEmail || s.smtpUser}>`;
      await transporter.sendMail({ from, to, subject, html });
      return "SENT";
    } catch (e: any) {
      this.logger.error(`Eskalasyon e-posta hatası (${to}): ${e?.message}`);
      return "FAILED";
    }
  }

  /**
   * Tenant SMS sağlayıcısı ile ham SMS gönderir (PR-3b.2).
   * SKIPPED: sağlayıcı yok / numara geçersiz / desteklenmeyen sağlayıcı.
   * FAILED: sağlayıcı hata yanıtı veya exception (retry). SENT: başarılı.
   */
  private async sendTenantSms(tenantId: string, to: string, message: string): Promise<DispatchResult> {
    const s = await this.officeService.getFullSmsSettings(tenantId).catch(() => null);
    if (!s || !s.smsProvider || !s.smsApiKey) {
      this.logger.warn(`SMS skipped (sağlayıcı yapılandırılmamış): tenant ${tenantId}`);
      return "SKIPPED";
    }
    const phone = normalizeTrPhone(to);
    if (!phone) {
      this.logger.warn(`SMS skipped (geçersiz cep numarası): ${to}`);
      return "SKIPPED";
    }
    try {
      if (s.smsProvider === "NETGSM") {
        const params = new URLSearchParams({
          usercode: s.smsApiKey || "",
          password: s.smsApiSecret || "",
          gsmno: phone,
          message,
          msgheader: s.smsSender || "HUKUKBURO",
          filter: "0",
        });
        const res = await fetchWithTimeout(`https://api.netgsm.com.tr/sms/send/get?${params.toString()}`, undefined, 10_000);
        const text = await res.text();
        if (text.split(" ")[0] !== "00" && !text.startsWith("00")) {
          this.logger.error(`NetGSM eskalasyon SMS hatası: ${text}`);
          return "FAILED";
        }
        return "SENT";
      }
      if (s.smsProvider === "ILETI_MERKEZI") {
        const params = new URLSearchParams({
          username: s.smsApiKey || "",
          password: s.smsApiSecret || "",
          text: message,
          receipents: phone,
          sender: s.smsSender || "HUKUKBURO",
        });
        const res = await fetchWithTimeout(`https://api.iletimerkezi.com/v1/send-sms/get?${params.toString()}`, undefined, 10_000);
        const text = await res.text();
        if (/error/i.test(text)) {
          this.logger.error(`İleti Merkezi eskalasyon SMS hatası: ${text}`);
          return "FAILED";
        }
        return "SENT";
      }
      this.logger.warn(`SMS skipped (desteklenmeyen sağlayıcı ${s.smsProvider})`);
      return "SKIPPED";
    } catch (e: any) {
      this.logger.error(`Eskalasyon SMS hatası (${to}): ${e?.message}`);
      return "FAILED";
    }
  }
}

// ───────────────────────── Saf şablon yardımcıları (test edilebilir) ─────────────────────────

/** Müvekkil görünen adı: displayName → ad+soyad → kurum adı → fallback. */
export function clientDisplayName(client: any): string {
  if (!client) return "Bilinmeyen Müvekkil";
  if (client.displayName) return client.displayName;
  const full = `${client.firstName || ""} ${client.lastName || ""}`.trim();
  if (full) return full;
  if (client.companyName) return client.companyName;
  return "Bilinmeyen Müvekkil";
}

const MISSING_FIELD_LABELS: Record<string, string> = {
  phone: "Telefon",
  email: "E-posta",
  iban: "IBAN",
  tckn: "TC Kimlik No",
  vkn: "Vergi Kimlik No",
  address: "Adres",
  taxOffice: "Vergi Dairesi",
  // PR-D4c borçlu completeness kodları
  contact: "Telefon veya E-posta",
  detsisOrName: "DETSİS veya Kurum Adı",
  deceasedName: "Muris Adı",
  heirs: "Mirasçı Bilgisi",
};

/**
 * Eksik alan kodlarını insan-okunur Türkçe etiketlere çevirir.
 * Öncelik: Task.missingFields (Json dizi) → yoksa description'daki "Eksik: a, b" metni.
 */
export function humanizeMissingFields(missingFields: any, description?: string | null): string[] {
  let codes: string[] = [];
  if (Array.isArray(missingFields)) {
    codes = missingFields.map((c) => String(c));
  } else if (description) {
    const m = description.match(/[:：]\s*(.+)$/);
    if (m) codes = m[1].split(/[,\s]+/).filter(Boolean);
  }
  if (codes.length === 0) return ["Eksik bilgi"];
  return codes.map((c) => MISSING_FIELD_LABELS[c] || c);
}

/** TR tarih-saat: "15.06.2026 14:07". */
export function formatTrDateTime(date: Date | string | null | undefined): string {
  if (!date) return "Belirtilmemiş";
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return "Belirtilmemiş";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** Kalan süre: "2 gün 18 saat" / "5 saat" / süresi geçtiyse "SÜRESİ GEÇTİ". */
export function formatRemaining(dueDate: Date | string | null | undefined, now: Date): string {
  if (!dueDate) return "Belirtilmemiş";
  const due = typeof dueDate === "string" ? new Date(dueDate) : dueDate;
  if (isNaN(due.getTime())) return "Belirtilmemiş";
  let ms = due.getTime() - now.getTime();
  if (ms <= 0) return "SÜRESİ GEÇTİ";
  const days = Math.floor(ms / 86_400_000);
  ms -= days * 86_400_000;
  const hours = Math.floor(ms / 3_600_000);
  if (days > 0) return hours > 0 ? `${days} gün ${hours} saat` : `${days} gün`;
  if (hours > 0) return `${hours} saat`;
  const mins = Math.max(1, Math.floor(ms / 60_000));
  return `${mins} dakika`;
}

/** Öncelik enum → Türkçe. */
export function priorityTr(priority: any): string {
  switch (priority) {
    case "LOW": return "Düşük";
    case "HIGH": return "Yüksek";
    case "URGENT": return "Acil";
    case "MEDIUM":
    default: return "Orta";
  }
}

/** PR-2 deep-link: müvekkil düzenleme modalını açar. clientId yoksa boş döner. */
export function taskDeepLink(clientId: string | null | undefined): string {
  if (!clientId) return "";
  const base = (process.env.FRONTEND_URL || "http://localhost:3002").replace(/\/$/, "");
  return `${base}/settings/clients?edit=${clientId}`;
}

/** PR-D4b deep-link: borçlu düzenleme modalını açar. debtorId yoksa boş döner. */
export function debtorDeepLink(debtorId: string | null | undefined): string {
  if (!debtorId) return "";
  const base = (process.env.FRONTEND_URL || "http://localhost:3002").replace(/\/$/, "");
  return `${base}/debtors?edit=${debtorId}`;
}

/**
 * PR-D4b: görevin muhatap varlığını çözer (müvekkil VEYA borçlu). Borçlu-bağlı görevde
 * (clientId yok, debtorId var) doğru etiket/ad/deep-link döner → eskalasyon maili patlamaz.
 */
export function escalationEntity(task: any): { label: string; name: string; link: string } {
  if (!task.clientId && task.debtorId) {
    return {
      label: "Borçlu",
      name: task.debtor?.name || "Bilinmeyen Borçlu",
      link: debtorDeepLink(task.debtorId),
    };
  }
  return {
    label: "Müvekkil",
    name: clientDisplayName(task.client),
    link: taskDeepLink(task.clientId),
  };
}

/** PR-D4e-1: görev subtype'ı DEBTOR_INTELLIGENCE mı? (saha istihbaratı ≠ veri eksikliği). */
export function isIntelligenceTask(task: any): boolean {
  return task?.taskSubType === "DEBTOR_INTELLIGENCE";
}

/** PR-D4e-1: subtype-aware mail konusu. İstihbarat "Bilgileri Eksik" DEĞİL → "Saha İstihbaratı". */
export function escalationSubject(task: any, entity: { label: string; name: string }): string {
  if (isIntelligenceTask(task)) return `[Saha İstihbaratı] ${entity.name}`;
  return `[Operasyonel Görev] ${entity.label} Bilgileri Eksik - ${entity.name}`;
}

/** PR-D4e-1: görevdeki adresi tek satır metne çevirir (istihbarat mailinde gösterilir). */
export function taskAddressText(task: any): string {
  const a = task?.address;
  if (!a) return "";
  return [a.street, a.district, a.city].filter(Boolean).join(", ");
}

/** Bir sonraki eskalasyon kademesi açıklaması. */
export function nextEscalationLine(tier: EscalationTier, nextAt: Date | null): string {
  const dateStr = nextAt ? formatTrDateTime(nextAt) : "ileri tarihte";
  if (tier === "STAFF") return `Tamamlanmazsa ${dateStr} tarihinde yönetici avukatlara bildirilecektir.`;
  if (tier === "MANAGER") return `Tamamlanmazsa ${dateStr} tarihinde kurucu/ortak avukatlara bildirilecektir.`;
  return `Tamamlanmazsa ${dateStr} tarihinde tekrar hatırlatılacaktır.`;
}
