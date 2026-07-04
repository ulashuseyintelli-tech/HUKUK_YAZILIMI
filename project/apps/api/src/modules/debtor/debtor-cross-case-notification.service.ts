import { Injectable, Logger } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "@/prisma/prisma.service";
import { AuditService } from "@/modules/audit/audit.service";

/**
 * DBND-D6A-2 — Shared Debtor Cross-Case Persistent Notification.
 *
 * Paylaşılan Debtor'un (birden fazla Case'e CaseDebtor üzerinden bağlı) izlenen alanları
 * (adres/KEP/kimlik/ad-unvan) değiştiğinde, diğer case'lerdeki sorumlu ekibe backend-only,
 * senkron, KALICI (recipientUserId bazlı, PENDING/ACKNOWLEDGED/EXPIRED lifecycle'lı) bir
 * bildirim üretir. Event-bus/pub-sub YOK — çağıran servis (DebtorService) bu metodu
 * doğrudan, kendi mutasyonunun ardından çağırır.
 *
 * DBND-D6A-1 (pull/computed, AuditLog+CaseDebtor üzerinden anlık hesaplanan drawer banner'ı,
 * bkz. DebtorService.getCrossFileDebtorAlerts()) ile KOD BAĞI YOK — aynı domain probleminin
 * (paylaşılan Debtor değişikliği) iki ayrı, bağımsız çözümü. Bu servis DBND-D6A-1'in
 * hesaplama/okuma yollarını import etmez, çağırmaz; yalnız aynı DTO alanını (sourceCaseId)
 * bağımsız olarak kendi amacı için tüketir.
 *
 * Kapsam dışı (owner-locked, bkz. D6 owner karar matrisi): UI, badge/status framework,
 * RESOLVED/DISMISSED lifecycle ayrımı, phone/email/riskLevel/riskNotes/notes tetikleyicileri.
 */

export type DebtorNotificationFieldGroupKey = "ADDRESS" | "KEP_ADDRESS" | "IDENTITY" | "NAME";
type Severity = "INFO" | "WARNING" | "CRITICAL";
type RecipientSource = "RESPONSIBLE_LAWYER" | "FALLBACK_LAWYER" | "TEBLIGAT_STAFF";

const FIELD_GROUP_SEVERITY: Record<DebtorNotificationFieldGroupKey, Severity> = {
  ADDRESS: "CRITICAL",
  KEP_ADDRESS: "CRITICAL",
  IDENTITY: "CRITICAL",
  NAME: "WARNING",
};

// PII sızdırmaz sabit sistem etiketleri (ADR-011: audit/bildirim yüzeylerinde ham kullanıcı
// verisi/eski-yeni değer YOK — yalnız hangi alan grubunun değiştiği, değerler değil).
const FIELD_GROUP_SUMMARY: Record<DebtorNotificationFieldGroupKey, string> = {
  ADDRESS: "Paylaşılan borçlunun adresi güncellendi",
  KEP_ADDRESS: "Paylaşılan borçlunun KEP adresi güncellendi",
  IDENTITY: "Paylaşılan borçlunun kimlik bilgisi güncellendi",
  NAME: "Paylaşılan borçlunun adı/unvanı güncellendi",
};

const NOTIFICATION_EXPIRY_DAYS = 30;

interface ResolvedRecipient {
  userId: string;
  source: RecipientSource;
}

export interface NotifyFieldGroupChangesParams {
  tenantId: string;
  debtorId: string;
  fieldGroups: DebtorNotificationFieldGroupKey[];
  /** Mutasyonun yapıldığı case (varsa) — bugünkü DebtorService.update()/addAddress()/updateAddress()
   * route'ları case bağlamı taşımaz, bu yüzden çoğu çağrıda undefined kalır (bkz GO-IMPLEMENT raporu). */
  sourceCaseId?: string | null;
  actorUserId?: string;
  /** Dedupe/idempotency çapası: aynı mutasyon (veya yarışan eşzamanlı çağrı) için SABİT, sonraki
   * gerçek değişiklik için FARKLI olmalı. Çağıran taraf mutasyon-öncesi bir zaman damgası verir
   * (örn. Debtor.updatedAt-before-update, ya da adres metodları için tek-seferlik `new Date()`). */
  changeGeneration: Date;
}

@Injectable()
export class DebtorCrossCaseNotificationService {
  private readonly logger = new Logger(DebtorCrossCaseNotificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService
  ) {}

  /// <remarks>
  /// Çağrıldığı yerler:
  /// - DebtorService.update() → PUT /debtors/:id (name/identityNo/kepAddress değişimi)
  /// - DebtorService.addAddress() → POST /debtors/:id/addresses (yeni adres = adres değişimi)
  /// - DebtorService.updateAddress() → PUT /debtors/:id/addresses/:addressId (adres içerik değişimi)
  /// Hepsi best-effort/"Safe" çağrılır (syncDebtorTaskByIdSafe deseni) — burada atılan hata çağıranın
  /// asıl mutasyonunu ASLA bloklamaz.
  /// </remarks>
  async notifyFieldGroupChanges(params: NotifyFieldGroupChangesParams): Promise<void> {
    const { tenantId, debtorId, fieldGroups, sourceCaseId, actorUserId, changeGeneration } = params;
    if (fieldGroups.length === 0) return;

    const caseDebtors = await this.prisma.caseDebtor.findMany({
      where: { debtorId, case: { tenantId } },
      select: { id: true, caseId: true, lifecycleStatus: true },
    });

    // Case-bazlı grupla (bir Debtor aynı case'de birden fazla role sahip CaseDebtor satırına
    // sahip olabilir — @@unique([caseId, debtorId, role]) — aksi halde aynı avukata aynı case
    // için 2 bildirim gider). Kaynak case'i (biliniyorsa) tamamen hariç tut (owner req #12).
    const byCase = new Map<string, (typeof caseDebtors)[number]>();
    for (const cd of caseDebtors) {
      if (sourceCaseId && cd.caseId === sourceCaseId) continue;
      const existing = byCase.get(cd.caseId);
      if (!existing || (existing.lifecycleStatus === "PASSIVE" && cd.lifecycleStatus === "ACTIVE")) {
        byCase.set(cd.caseId, cd);
      }
    }
    if (byCase.size === 0) return;

    try {
      await this.prisma.$transaction(async (tx) => {
        for (const [affectedCaseId, caseDebtor] of byCase) {
          const recipients = await this.resolveRecipients(tx, affectedCaseId);
          if (recipients.length === 0) {
            // DBND-D6A-2-SURFACE (owner Q1): teknik olarak mümkün kabul edilir ama anomaly —
            // DB-level invariant EKLENMEZ, yalnız gözlem. Diğer affected case'ler için üretim devam eder.
            this.logger.warn(
              `D6 cross-case notification: no recipient resolved for affected case (tenantId=${tenantId}, debtorId=${debtorId}, affectedCaseId=${affectedCaseId}, affectedCaseDebtorId=${caseDebtor.id})`
            );
            continue;
          }

          for (const fieldGroup of fieldGroups) {
            const severity = FIELD_GROUP_SEVERITY[fieldGroup];
            const changeSummary = FIELD_GROUP_SUMMARY[fieldGroup];
            const expiresAt = new Date(changeGeneration.getTime() + NOTIFICATION_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

            for (const recipient of recipients) {
              const dedupeKey = this.buildDedupeKey({
                tenantId,
                debtorId,
                affectedCaseId,
                recipientUserId: recipient.userId,
                fieldGroup,
                changeGeneration,
              });

              try {
                const created = await tx.debtorCrossCaseNotification.create({
                  data: {
                    tenantId,
                    debtorId,
                    sourceCaseId: sourceCaseId ?? null,
                    affectedCaseId,
                    affectedCaseDebtorId: caseDebtor.id,
                    fieldGroup,
                    severity,
                    changeSummary,
                    recipientUserId: recipient.userId,
                    recipientSource: recipient.source,
                    dedupeKey,
                    expiresAt,
                  },
                });

                await this.audit.logInTransaction(tx, {
                  tenantId,
                  action: "DEBTOR_CROSS_CASE_NOTIFICATION_CREATED",
                  entityType: "DEBTOR_CROSS_CASE_NOTIFICATION",
                  entityId: created.id,
                  userId: actorUserId,
                  metadata: {
                    debtorId,
                    affectedCaseId,
                    affectedCaseDebtorId: caseDebtor.id,
                    fieldGroup,
                    severity,
                    recipientUserId: recipient.userId,
                    recipientSource: recipient.source,
                  },
                });
              } catch (e: any) {
                if (e?.code === "P2002") {
                  continue; // aynı (debtor, case, alıcı, alan-grubu, değişim-anı) için zaten var — dedupe
                }
                throw e;
              }
            }
          }
        }
      });
    } catch (e: any) {
      this.logger.warn(`D6 cross-case notification fan-out failed (debtorId=${debtorId}): ${e?.message ?? e}`);
    }
  }

  /// <remarks>
  /// Çağrıldığı yerler:
  /// - DebtorController.listCrossCaseNotifications() → GET /debtors/cross-case-notifications
  ///   (DBND-D6A-2-SURFACE; ofis-içi "görülmemiş bildirimlerim" listesi — self-scoped, tenantId/
  ///   recipientUserId çağıran controller tarafından yalnız JWT/req.user'dan türetilir)
  /// </remarks>
  async listForRecipient(
    tenantId: string,
    recipientUserId: string,
    status: "PENDING" | "ACKNOWLEDGED" | "EXPIRED" = "PENDING"
  ): Promise<
    Array<{
      id: string;
      debtorId: string;
      affectedCaseId: string;
      affectedCaseFileNumber: string | null;
      fieldGroup: DebtorNotificationFieldGroupKey;
      severity: Severity;
      changeSummary: string;
      status: string;
      createdAt: Date;
      expiresAt: Date;
      acknowledgedAt: Date | null;
    }>
  > {
    const rows = await this.prisma.debtorCrossCaseNotification.findMany({
      where: { tenantId, recipientUserId, status },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        debtorId: true,
        affectedCaseId: true,
        affectedCase: { select: { fileNumber: true } },
        fieldGroup: true,
        severity: true,
        changeSummary: true,
        status: true,
        createdAt: true,
        expiresAt: true,
        acknowledgedAt: true,
      },
    });

    return rows.map((row) => ({
      id: row.id,
      debtorId: row.debtorId,
      affectedCaseId: row.affectedCaseId,
      affectedCaseFileNumber: row.affectedCase?.fileNumber ?? null,
      fieldGroup: row.fieldGroup as DebtorNotificationFieldGroupKey,
      severity: row.severity as Severity,
      changeSummary: row.changeSummary,
      status: row.status,
      createdAt: row.createdAt,
      expiresAt: row.expiresAt,
      acknowledgedAt: row.acknowledgedAt,
    }));
  }

  /** PENDING → ACKNOWLEDGED. Yalnız hedef alıcı + hâlâ PENDING ise geçiş yapar (compare-and-set). */
  async acknowledge(
    tenantId: string,
    notificationId: string,
    recipientUserId: string
  ): Promise<{ acknowledged: boolean }> {
    return this.prisma.$transaction(async (tx) => {
      const now = new Date();
      const result = await tx.debtorCrossCaseNotification.updateMany({
        where: { id: notificationId, tenantId, recipientUserId, status: "PENDING" },
        data: { status: "ACKNOWLEDGED", acknowledgedAt: now },
      });
      if (result.count === 1) {
        await this.audit.logInTransaction(tx, {
          tenantId,
          action: "DEBTOR_CROSS_CASE_NOTIFICATION_ACKNOWLEDGED",
          entityType: "DEBTOR_CROSS_CASE_NOTIFICATION",
          entityId: notificationId,
          userId: recipientUserId,
        });
      }
      return { acknowledged: result.count === 1 };
    });
  }

  /**
   * PENDING → EXPIRED sweep (zaman-aşımı geçen, hâlâ PENDING kayıtlar). Cron'a bağlı DEĞİL —
   * çağrılabilir bir metod (gelecekte bir zamanlayıcı bunu çağırabilir; bu fazın kapsamı değil).
   */
  async expireStaleNotifications(tenantId?: string, now: Date = new Date()): Promise<number> {
    const result = await this.prisma.debtorCrossCaseNotification.updateMany({
      where: {
        status: "PENDING",
        expiresAt: { lte: now },
        ...(tenantId ? { tenantId } : {}),
      },
      data: { status: "EXPIRED", expiredAt: now },
    });
    return result.count;
  }

  /**
   * DBND-D6-INACTIVE-RECIPIENT-SWEEP (Q3 çerçevesi, bkz `docs/design/d6-legal-semantics-triage.md`):
   * Alıcısı artık `User.isActive=false` olan PENDING kayıtları erken EXPIRED'a çevirir — üretim
   * anında yapılan `isActive` kontrolü, üretimden SONRA deaktive olan personeli kapsamıyordu; bu
   * sweep o boşluğu kapatır. Yalnız PENDING etkilenir (ACKNOWLEDGED/EXPIRED dokunulmaz). Her satır
   * için ayrı audit kaydı yazılır (mevcut per-entity audit deseniyle tutarlı).
   */
  /// <remarks>
  /// Çağrıldığı yerler:
  /// - AutomationService.expireInactiveRecipientCrossCaseNotifications() → @Cron EVERY_HOUR
  /// </remarks>
  async expireStaleNotificationsForInactiveRecipients(tenantId?: string, now: Date = new Date()): Promise<number> {
    const inactiveUsers = await this.prisma.user.findMany({
      where: { isActive: false, ...(tenantId ? { tenantId } : {}) },
      select: { id: true },
    });
    if (inactiveUsers.length === 0) return 0;
    const inactiveUserIds = inactiveUsers.map((u) => u.id);

    const pending = await this.prisma.debtorCrossCaseNotification.findMany({
      where: {
        status: "PENDING",
        recipientUserId: { in: inactiveUserIds },
        ...(tenantId ? { tenantId } : {}),
      },
      select: { id: true, tenantId: true, recipientUserId: true },
    });
    if (pending.length === 0) return 0;

    await this.prisma.$transaction(async (tx) => {
      await tx.debtorCrossCaseNotification.updateMany({
        where: { id: { in: pending.map((p) => p.id) }, status: "PENDING" },
        data: { status: "EXPIRED", expiredAt: now },
      });
      for (const notif of pending) {
        await this.audit.logInTransaction(tx, {
          tenantId: notif.tenantId,
          action: "DEBTOR_CROSS_CASE_NOTIFICATION_EXPIRED_INACTIVE_RECIPIENT",
          entityType: "DEBTOR_CROSS_CASE_NOTIFICATION",
          entityId: notif.id,
          metadata: { recipientUserId: notif.recipientUserId },
        });
      }
    });

    return pending.length;
  }

  private async resolveRecipients(
    tx: Prisma.TransactionClient,
    caseId: string
  ): Promise<ResolvedRecipient[]> {
    const caseLawyers = await tx.caseLawyer.findMany({
      where: {
        caseId,
        receiveNotifications: true,
        lawyer: { isActive: true, userId: { not: null }, user: { isActive: true } },
      },
      select: { isResponsible: true, lawyer: { select: { userId: true } } },
    });

    const responsible = caseLawyers.filter((cl) => cl.isResponsible);
    const lawyerPool = responsible.length > 0 ? responsible : caseLawyers;
    const lawyerSource: RecipientSource = responsible.length > 0 ? "RESPONSIBLE_LAWYER" : "FALLBACK_LAWYER";

    const seen = new Set<string>();
    const recipients: ResolvedRecipient[] = [];
    for (const cl of lawyerPool) {
      const userId = cl.lawyer.userId;
      if (!userId || seen.has(userId)) continue;
      seen.add(userId);
      recipients.push({ userId, source: lawyerSource });
    }

    const tebligatStaff = await tx.caseStaff.findMany({
      where: {
        caseId,
        roleOnCase: "TEBLIGAT",
        receiveNotifications: true,
        staffMember: { isActive: true, userId: { not: null }, user: { isActive: true } },
      },
      select: { staffMember: { select: { userId: true } } },
    });
    for (const cs of tebligatStaff) {
      const userId = cs.staffMember.userId;
      if (!userId || seen.has(userId)) continue;
      seen.add(userId);
      recipients.push({ userId, source: "TEBLIGAT_STAFF" });
    }

    return recipients;
  }

  private buildDedupeKey(input: {
    tenantId: string;
    debtorId: string;
    affectedCaseId: string;
    recipientUserId: string;
    fieldGroup: string;
    changeGeneration: Date;
  }): string {
    return [
      "debtor-cross-case",
      input.tenantId,
      input.debtorId,
      input.affectedCaseId,
      input.recipientUserId,
      input.fieldGroup,
      input.changeGeneration.toISOString(),
    ].join(":");
  }
}
