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
  emails: string[];
  phones: string[]; // yalnız FOUNDER için doldurulur
}

/**
 * Operasyonel eksik görevlerinin (taskCategory=OPERATIONAL_COMPLETENESS) eskalasyon motoru.
 * Saat başı çalışır; büro-geneli config'e (Office) göre STAFF→MANAGER→FOUNDER bildirim atar.
 * Çift-gönderim guard'ı: Task.lastNotifiedLevel (aynı tier'a saat başı tekrar göndermez).
 * Göndericiler office SMTP/SMS yapılandırılmamışsa "skipped" loglar, HİÇBİR ŞEY göndermez.
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
  async processEscalations(now: Date = new Date()): Promise<{ processed: number; notified: number; skipped: number }> {
    let processed = 0;
    let notified = 0;
    let skipped = 0;

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

        // Durumu ÖNCE kalıcı yap (lastNotifiedLevel guard) → bildirim başarısız olsa bile
        // saat başı tekrar gönderim OLMAZ (ulas'ın kritik freni). Gönderim best-effort + log.
        await this.prisma.task.update({
          where: { id: task.id },
          data: {
            escalationLevel: upd.escalationLevel,
            lastNotifiedLevel: upd.lastNotifiedLevel,
            nextFollowUpAt: upd.nextFollowUpAt,
          },
        });

        if (upd.notifyTier) {
          const sent = await this.dispatch(tenant.id, office, task, upd.notifyTier);
          if (sent) notified++;
          else skipped++;
        }
      }
    }

    this.logger.log(`Eskalasyon turu bitti: processed=${processed} notified=${notified} skipped=${skipped}`);
    return { processed, notified, skipped };
  }

  /** Bir tier için alıcıları çözer (config → fallback rank/role). */
  private async resolveRecipients(tenantId: string, office: any, tier: EscalationTier): Promise<Recipients> {
    if (tier === "STAFF") {
      const staff = await this.prisma.staffMember.findMany({
        where: { tenantId, isActive: true, staffType: { in: office.opStaffTypes || [] } },
        select: { email: true },
      });
      return { emails: staff.map((s) => s.email).filter((e): e is string => !!e), phones: [] };
    }

    if (tier === "MANAGER") {
      let lawyers = office.escalationManagerLawyerIds?.length
        ? await this.prisma.lawyer.findMany({ where: { tenantId, isActive: true, id: { in: office.escalationManagerLawyerIds } }, select: { email: true } })
        : await this.prisma.lawyer.findMany({ where: { tenantId, isActive: true, lawyerRank: "MANAGER" }, select: { email: true } });
      return { emails: lawyers.map((l) => l.email).filter((e): e is string => !!e), phones: [] };
    }

    // FOUNDER
    const founders = office.escalationFounderLawyerIds?.length
      ? await this.prisma.lawyer.findMany({ where: { tenantId, isActive: true, id: { in: office.escalationFounderLawyerIds } }, select: { email: true, mobilePhone: true } })
      : await this.prisma.lawyer.findMany({ where: { tenantId, isActive: true, role: { in: ["OWNER", "PARTNER"] } }, select: { email: true, mobilePhone: true } });
    return {
      emails: founders.map((l) => l.email).filter((e): e is string => !!e),
      phones: founders.map((l) => l.mobilePhone).filter((p): p is string => !!p),
    };
  }

  /** Bildirimi ilgili kanallardan gönderir. Hiçbir alıcı yoksa skip+log → false döner. */
  private async dispatch(tenantId: string, office: any, task: any, tier: EscalationTier): Promise<boolean> {
    const { email, sms } = channelsForTier(tier);
    const recipients = await this.resolveRecipients(tenantId, office, tier);

    if (recipients.emails.length === 0 && recipients.phones.length === 0) {
      this.logger.warn(`Eskalasyon skipped: ${tier} alıcısı yok (tenant ${tenantId}, task ${task.id})`);
      return false;
    }

    const subject = `[Operasyonel Görev] ${task.title || "Eksik bilgi"} — ${tier}`;
    const body = `${task.title || "Operasyonel eksik görevi"}\n\n${task.description || ""}\n\nBu görev ${tier} kademesine eskale edildi.`;
    let anySent = false;

    if (email && office.opEmailEnabled !== false) {
      for (const to of recipients.emails) {
        if (await this.sendTenantEmail(tenantId, to, subject, body.replace(/\n/g, "<br>"))) anySent = true;
      }
    }
    if (sms && office.opSmsEnabled !== false) {
      for (const to of recipients.phones) {
        if (await this.sendTenantSms(tenantId, to, `${task.title || "Operasyonel eksik"} — eskalasyon (${tier})`)) anySent = true;
      }
    }
    return anySent;
  }

  /** Tenant SMTP ile ham e-posta gönderir. Yapılandırma yoksa skip+log → false. */
  private async sendTenantEmail(tenantId: string, to: string, subject: string, html: string): Promise<boolean> {
    try {
      const s = await this.officeService.getFullSmtpSettings(tenantId);
      if (!s.smtpHost || !s.smtpUser) {
        this.logger.warn(`E-posta skipped (SMTP yapılandırılmamış): tenant ${tenantId}`);
        return false;
      }
      const transporter = nodemailer.createTransport({
        host: s.smtpHost,
        port: s.smtpPort || 587,
        secure: s.smtpSecure || false,
        auth: { user: s.smtpUser, pass: s.smtpPass },
      } as nodemailer.TransportOptions);
      const from = `"${s.smtpFromName || "Hukuk Bürosu"}" <${s.smtpFromEmail || s.smtpUser}>`;
      await transporter.sendMail({ from, to, subject, html });
      return true;
    } catch (e: any) {
      this.logger.error(`Eskalasyon e-posta hatası (${to}): ${e?.message}`);
      return false;
    }
  }

  /** Tenant SMS sağlayıcısı ile ham SMS gönderir. Yapılandırma/numara yoksa skip+log → false. */
  private async sendTenantSms(tenantId: string, to: string, message: string): Promise<boolean> {
    try {
      const s = await this.officeService.getFullSmsSettings(tenantId);
      if (!s.smsProvider || !s.smsApiKey) {
        this.logger.warn(`SMS skipped (sağlayıcı yapılandırılmamış): tenant ${tenantId}`);
        return false;
      }
      const phone = normalizeTrPhone(to);
      if (!phone) {
        this.logger.warn(`SMS skipped (geçersiz cep numarası): ${to}`);
        return false;
      }
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
          return false;
        }
        return true;
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
          return false;
        }
        return true;
      }
      this.logger.warn(`SMS skipped (desteklenmeyen sağlayıcı ${s.smsProvider})`);
      return false;
    } catch (e: any) {
      this.logger.error(`Eskalasyon SMS hatası (${to}): ${e?.message}`);
      return false;
    }
  }
}
