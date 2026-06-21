import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { PrismaService } from "../../prisma/prisma.service";
import { TenantNotifier } from "./tenant-notifier.service";
import {
  computeCaseTaskEscalationUpdate,
  channelsForCaseTaskTier,
  CaseTaskTier,
  CaseTaskEscalationConfig,
} from "./case-task-escalation-logic";
import { caseTaskEscalationSubject, buildCaseTaskEmailHtml, buildCaseTaskSmsText } from "./case-task-escalation-content";

/**
 * D-G3b — Dosya görevi (case-linked LEGAL_WORKFLOW) owner-first eskalasyon motoru.
 * Operasyonel OperationalEscalationService'ten TAMAMEN AYRI (K-D1): ayrı cron, ayrı alan/enum
 * (case* + CaseTaskTier), ayrı audit tablosu (CaseTaskEscalationEvent). Hedef sorgu DİSJOİNT
 * (LEGAL_WORKFLOW + caseId) → bir görev asla iki motorda işlenmez.
 *
 * FLAG: CASE_TASK_ESCALATION_ENABLED (varsayılan OFF). Kapalıyken cron hiçbir şey yapmaz
 * (prod'da kapalı; açma kararı D-G6). processCaseTaskEscalations() flag'den bağımsız çağrılabilir (test).
 *
 * Reuse: computeCaseTaskEscalationUpdate/channelsForCaseTaskTier (D-G2) · TenantNotifier (D-G1) ·
 * CaseTaskEscalationEvent (D-G3a) · formatRemaining/formatTrDateTime/priorityTr (operasyonel saf helper).
 *
 * <remarks>
 * Çağrıldığı yerler:
 * - @Cron(EVERY_HOUR) scheduledRun() (flag açıksa)
 * </remarks>
 */
@Injectable()
export class CaseTaskEscalationService {
  private readonly logger = new Logger(CaseTaskEscalationService.name);

  constructor(
    private prisma: PrismaService,
    private tenantNotifier: TenantNotifier
  ) {}

  /** Flag açık mı? (env runtime'da okunur — test/açma için kolay override). */
  private isEnabled(): boolean {
    return process.env.CASE_TASK_ESCALATION_ENABLED === "true";
  }

  @Cron(CronExpression.EVERY_HOUR)
  async scheduledRun(): Promise<void> {
    if (!this.isEnabled()) return; // FLAG OFF → çalışmaz (D-G6'da açılır)
    await this.processCaseTaskEscalations();
  }

  /**
   * Tüm tenant'ların caseId'li + LEGAL_WORKFLOW görevlerini (atanmış olsun olmasın) owner-first işler.
   * Lazy-adopt: caseEscalationLevel=null görev RESPONSIBLE'dan başlatılır (creator dokunulmaz).
   * Flag'den BAĞIMSIZ — doğrudan çağrılabilir (test/manuel).
   */
  async processCaseTaskEscalations(
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

      // DİSJOİNT hedef sorgu: operasyonel motor OPERATIONAL_COMPLETENESS işler; bu motor
      // LEGAL_WORKFLOW + caseId. Disjointlik kategori+caseId ile korunur. G4b: `assigneeId`
      // filtresi KALDIRILDI — atanmamış ama geç görev de Dosya Sorumlusu'na eskale olur.
      const tasks = await this.prisma.task.findMany({
        where: {
          tenantId: tenant.id,
          taskCategory: "LEGAL_WORKFLOW",
          caseId: { not: null },
          status: { in: ["PENDING", "IN_PROGRESS"] },
        },
        include: {
          // G4b: RESPONSIBLE = case'in GERÇEK KİŞİ sorumlusu (Lawyer/Staff, legacy sorumluPersonel fallback);
          // task.assignee (doer) eskalasyon alıcısı DEĞİL → assignee include'u kaldırıldı.
          case: {
            select: {
              id: true,
              fileNumber: true,
              responsibleLawyer: { select: { name: true, surname: true, email: true } },
              responsibleStaff: { select: { firstName: true, lastName: true, email: true } },
              sorumluPersonel: { select: { name: true, surname: true, email: true } },
            },
          },
        },
      });

      const cfg: CaseTaskEscalationConfig = {
        ownerDays: office.caseTaskOwnerDays,
        teamLeadDays: office.caseTaskTeamLeadDays,
        managerDays: office.caseTaskManagerDays,
        repeatMonths: office.opRepeatMonths, // FOUNDER periyodik tekrar (operasyonel ile aynı)
        hasTeamLead: (office.escalationTeamLeadLawyerIds?.length || 0) > 0,
      };

      for (const task of tasks) {
        processed++;
        const prevLevel = task.caseEscalationLevel as CaseTaskTier | null;
        const upd = computeCaseTaskEscalationUpdate(
          {
            createdAt: task.createdAt,
            caseEscalationLevel: prevLevel,
            caseLastNotifiedLevel: task.caseLastNotifiedLevel as CaseTaskTier | null,
            caseNextFollowUpAt: task.caseNextFollowUpAt,
          },
          cfg,
          now
        );

        // Audit: tier GERÇEKTEN ilerlediyse iz bırak (lazy-adopt'ta prevLevel=null → TIER_ADVANCED yok).
        if (prevLevel && upd.caseEscalationLevel !== prevLevel) {
          await this.recordEvent(tenant.id, task.caseId as string, task.id, {
            eventType: "TIER_ADVANCED",
            fromLevel: prevLevel,
            toLevel: upd.caseEscalationLevel,
          });
        }

        // retry-safety: guard (caseLastNotifiedLevel) yalnız SENT'te ilerler; zaman çizelgesi her zaman kalıcı.
        let guardToPersist: CaseTaskTier | null = upd.caseLastNotifiedLevel;

        if (upd.notifyTier) {
          const outcome = await this.dispatch(tenant.id, office, task, upd.notifyTier, now, upd.caseNextFollowUpAt);
          if (outcome.result === "SENT") {
            notified++;
            guardToPersist = upd.caseLastNotifiedLevel;
          } else {
            guardToPersist = upd.caseLastNotifiedLevelOnFailure;
            if (outcome.result === "FAILED") {
              failed++;
              this.logger.warn(
                `Dosya görevi eskalasyon gönderimi BAŞARISIZ → guard ilerletilmedi (retry): ` +
                  `tenant ${tenant.id}, task ${task.id}, tier ${upd.notifyTier}`
              );
            } else {
              skipped++;
            }
          }

          await this.recordEvent(tenant.id, task.caseId as string, task.id, {
            eventType: `NOTIFICATION_${outcome.result}`,
            toLevel: upd.notifyTier,
            channel: outcome.channels.length ? outcome.channels.join(",") : null,
            deliveryStatus: outcome.result,
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
            caseEscalationLevel: upd.caseEscalationLevel,
            caseLastNotifiedLevel: guardToPersist,
            caseNextFollowUpAt: upd.caseNextFollowUpAt,
          },
        });
      }
    }

    this.logger.log(
      `Dosya görevi eskalasyon turu: processed=${processed} notified=${notified} skipped=${skipped} failed=${failed}`
    );
    return { processed, notified, skipped, failed };
  }

  /** Append-only audit (best-effort; yazım hatası motoru BOZMAZ). */
  private async recordEvent(
    tenantId: string,
    caseId: string,
    taskId: string,
    ev: {
      eventType: string;
      fromLevel?: CaseTaskTier | null;
      toLevel?: CaseTaskTier | null;
      channel?: string | null;
      deliveryStatus?: string | null;
      metadata?: any;
    }
  ): Promise<void> {
    try {
      await this.prisma.caseTaskEscalationEvent.create({
        data: {
          tenantId,
          caseId,
          taskId,
          eventType: ev.eventType as any,
          fromLevel: (ev.fromLevel as any) ?? null,
          toLevel: (ev.toLevel as any) ?? null,
          channel: ev.channel ?? null,
          deliveryStatus: ev.deliveryStatus ?? null,
          metadata: ev.metadata ?? undefined,
        },
      });
    } catch (e: any) {
      this.logger.warn(`CaseTaskEscalationEvent yazılamadı (task ${taskId}, ${ev.eventType}): ${e?.message}`);
    }
  }

  /** Bir tier için alıcıları çözer. L0=case GERÇEK-KİŞİ owner (Lawyer/Staff, legacy sorumluPersonel fallback); L1=teamLead; L2/L3=Lawyer sorgusu. */
  private async resolveRecipients(
    tenantId: string,
    office: any,
    task: any,
    tier: CaseTaskTier
  ): Promise<{ emails: { name: string; email: string }[]; phones: { name: string; phone: string }[] }> {
    if (tier === "RESPONSIBLE") {
      // G4b: Dosya Sorumlusu = case'in GERÇEK KİŞİ owner'ı (Lawyer/Staff), task.assignee (doer) DEĞİL.
      // Öncelik: responsibleLawyer → responsibleStaff → legacy sorumluPersonel (User) fallback.
      const c = task.case || {};
      const lawyer = c.responsibleLawyer;
      if (lawyer?.email) {
        return { emails: [{ name: `${lawyer.name || ""} ${lawyer.surname || ""}`.trim(), email: lawyer.email }], phones: [] };
      }
      const staff = c.responsibleStaff;
      if (staff?.email) {
        return { emails: [{ name: `${staff.firstName || ""} ${staff.lastName || ""}`.trim(), email: staff.email }], phones: [] };
      }
      const legacy = c.sorumluPersonel; // geçiş dönemi fallback'i (User)
      if (legacy?.email) {
        return { emails: [{ name: `${legacy.name || ""} ${legacy.surname || ""}`.trim(), email: legacy.email }], phones: [] };
      }
      return { emails: [], phones: [] }; // owner yok → dispatch SKIPPED (fail-safe)
    }

    if (tier === "TEAM_LEAD") {
      const ids: string[] = office.escalationTeamLeadLawyerIds || [];
      if (ids.length === 0) return { emails: [], phones: [] }; // K-D2: yapılandırılmamış → skip
      const lawyers = await this.prisma.lawyer.findMany({
        where: { tenantId, isActive: true, id: { in: ids } },
        select: { name: true, surname: true, email: true },
      });
      return {
        emails: lawyers.filter((l) => !!l.email).map((l) => ({ name: `${l.name} ${l.surname}`.trim(), email: l.email as string })),
        phones: [],
      };
    }

    if (tier === "MANAGER") {
      const lawyers = office.escalationManagerLawyerIds?.length
        ? await this.prisma.lawyer.findMany({ where: { tenantId, isActive: true, id: { in: office.escalationManagerLawyerIds } }, select: { name: true, surname: true, email: true } })
        : await this.prisma.lawyer.findMany({ where: { tenantId, isActive: true, lawyerRank: "MANAGER" }, select: { name: true, surname: true, email: true } });
      return {
        emails: lawyers.filter((l) => !!l.email).map((l) => ({ name: `${l.name} ${l.surname}`.trim(), email: l.email as string })),
        phones: [],
      };
    }

    // FOUNDER (+ SMS)
    const founders = office.escalationFounderLawyerIds?.length
      ? await this.prisma.lawyer.findMany({ where: { tenantId, isActive: true, id: { in: office.escalationFounderLawyerIds } }, select: { name: true, surname: true, email: true, mobilePhone: true } })
      : await this.prisma.lawyer.findMany({ where: { tenantId, isActive: true, role: { in: ["OWNER", "PARTNER"] } }, select: { name: true, surname: true, email: true, mobilePhone: true } });
    return {
      emails: founders.filter((l) => !!l.email).map((l) => ({ name: `${l.name} ${l.surname}`.trim(), email: l.email as string })),
      phones: founders.filter((l) => !!l.mobilePhone).map((l) => ({ name: `${l.name} ${l.surname}`.trim(), phone: l.mobilePhone as string })),
    };
  }

  /**
   * Bildirimi TenantNotifier ile gönderir (D-G1). İçerik ŞİMDİLİK BASİT (zengin şablon D-G4).
   * SENT (≥1 teslim) / FAILED (sağlayıcı hatası→retry) / SKIPPED (alıcı/yapılandırma yok).
   */
  private async dispatch(
    tenantId: string,
    office: any,
    task: any,
    tier: CaseTaskTier,
    now: Date,
    nextAt: Date | null
  ): Promise<{ result: "SENT" | "FAILED" | "SKIPPED"; channels: string[]; emailRecipients: number; smsRecipients: number }> {
    const { email, sms } = channelsForCaseTaskTier(tier);
    const recipients = await this.resolveRecipients(tenantId, office, task, tier);

    if (recipients.emails.length === 0 && recipients.phones.length === 0) {
      this.logger.warn(`Dosya görevi eskalasyon skipped: ${tier} alıcısı yok (tenant ${tenantId}, task ${task.id})`);
      return { result: "SKIPPED", channels: [], emailRecipients: 0, smsRecipients: 0 };
    }

    const subject = caseTaskEscalationSubject(task, tier);

    let anySent = false;
    let anyFailed = false;
    const channels: string[] = [];
    let emailRecipients = 0;
    let smsRecipients = 0;

    if (email && office.opEmailEnabled !== false && recipients.emails.length > 0) {
      channels.push("EMAIL");
      emailRecipients = recipients.emails.length;
      for (const r of recipients.emails) {
        const html = buildCaseTaskEmailHtml({ recipientName: r.name, task, tier, now, nextAt });
        const r1 = await this.tenantNotifier.sendEmail(tenantId, r.email, subject, html);
        if (r1 === "SENT") anySent = true;
        else if (r1 === "FAILED") anyFailed = true;
      }
    }
    if (sms && office.opSmsEnabled !== false && recipients.phones.length > 0) {
      channels.push("SMS");
      smsRecipients = recipients.phones.length;
      for (const r of recipients.phones) {
        const msg = buildCaseTaskSmsText({ recipientName: r.name, task, now });
        const r2 = await this.tenantNotifier.sendSms(tenantId, r.phone, msg);
        if (r2 === "SENT") anySent = true;
        else if (r2 === "FAILED") anyFailed = true;
      }
    }

    const result = anySent ? "SENT" : anyFailed ? "FAILED" : "SKIPPED";
    return { result, channels, emailRecipients, smsRecipients };
  }
}
