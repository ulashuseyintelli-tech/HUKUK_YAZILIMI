import {
  ClientFinancialDisclosureStatus,
  OfficeApprovalStatus,
  Prisma,
  type CollectionDispositionLineType,
  type PrismaClient,
} from '@prisma/client';
import { stableJsonHash } from '../permission-diagnostics/guided-edge/canonical-json';
import { canonicalMoney, domainSeparatedHash } from './client-financial-disclosure-canonical';
import {
  DISCLOSURE_APPROVER_CANDIDATE_SELECT,
  isDisclosureApproverEligible,
} from './client-financial-disclosure-approval-eligibility';
import {
  CLIENT_FINANCIAL_DISCLOSURE_APPROVAL_INTENT_CONTRACT_VERSION,
  CLIENT_FINANCIAL_DISCLOSURE_APPROVAL_TARGET_TYPE,
  CLIENT_FINANCIAL_DISCLOSURE_APPROVE_ACTION_CODE,
  CLIENT_FINANCIAL_DISCLOSURE_NOTIFICATION_CONTENT_CONTRACT_VERSION,
  ClientFinancialDisclosureApprovalAuthorizationError,
  ClientFinancialDisclosureApprovalError,
  type CompleteContentApprovalInput,
  type CompleteOfficeApprovalInput,
  type DisclosureApprovalIntentV1,
  type DisclosureApprovalTransitionResult,
  type RequestContentApprovalInput,
  type RequestOfficeApprovalInput,
} from './client-financial-disclosure-approval.contract';
import {
  createClientFinancialDisclosureRenderInput,
  parseClientFinancialDisclosureRenderOutput,
  serializeClientFinancialDisclosureRenderOutput,
} from './client-financial-disclosure-renderer.contract';
import { renderClientFinancialDisclosure } from './client-financial-disclosure-renderer';
import { verifyPersistedDisclosureSnapshot } from './client-financial-disclosure-writer.service';

/** Onaya kapalı terminal yaşam döngüsü durumları (§41.4). */
const TERMINAL_STATUSES: readonly ClientFinancialDisclosureStatus[] = [
  ClientFinancialDisclosureStatus.SUPERSEDED,
  ClientFinancialDisclosureStatus.CANCELLED,
  ClientFinancialDisclosureStatus.REVERSED,
];

const VERSION_SELECT = {
  id: true,
  tenantId: true,
  disclosureId: true,
  version: true,
  status: true,
  snapshotHash: true,
  currency: true,
  totalCollected: true,
  clientNetAmount: true,
  officeApprovalRequestId: true,
  officeApprovedById: true,
  officeApprovedAt: true,
  contentApprovedById: true,
  contentApprovedAt: true,
  notificationContent: true,
  notificationContentHash: true,
  approvedRecipientEmail: true,
  approvedRecipientPortalUserId: true,
  publishedAt: true,
  supersedesVersionId: true,
  supersededAt: true,
  cancelledAt: true,
  reversedAt: true,
  correctionReason: true,
  supersededByVersion: { select: { id: true } },
  lines: { select: { type: true, amount: true, sortOrder: true } },
  disclosure: { select: { currentVersionId: true, case: { select: { fileNumber: true } } } },
} as const;

type LoadedVersion = {
  id: string;
  tenantId: string;
  disclosureId: string;
  version: number;
  status: ClientFinancialDisclosureStatus;
  snapshotHash: string;
  currency: string;
  totalCollected: unknown;
  clientNetAmount: unknown;
  officeApprovalRequestId: string | null;
  officeApprovedById: string | null;
  officeApprovedAt: Date | null;
  contentApprovedById: string | null;
  contentApprovedAt: Date | null;
  notificationContent: string | null;
  notificationContentHash: string | null;
  approvedRecipientEmail: string | null;
  approvedRecipientPortalUserId: string | null;
  publishedAt: Date | null;
  supersedesVersionId: string | null;
  supersededAt: Date | null;
  cancelledAt: Date | null;
  reversedAt: Date | null;
  correctionReason: string | null;
  supersededByVersion: { id: string } | null;
  lines: ReadonlyArray<{
    type: CollectionDispositionLineType;
    amount: unknown;
    sortOrder: number;
  }>;
  disclosure: { currentVersionId: string | null; case: { fileNumber: string } };
};

/**
 * CLIENT-P2-U03-TRACK-B-I03 — APPROVAL WORKFLOW AND INTEGRITY GATES
 *
 * Canonical sözleşme: charter §35 (mimari) + §41 (owner approval kararları, PR #1761).
 *
 * DORMANT SINIR (§38.4 emsali): bu sınıf BİLEREK bir Nest provider DEĞİLDİR ve production
 * call-site'ı YOKTUR. HTTP controller, REST route, GraphQL resolver, portal fetch veya
 * client-visible DTO ÜRETMEZ; gönderim/yayınlama/bildirim dispatch KAPSAM DIŞIDIR (I04).
 *   APPROVED != PUBLISHED · APPROVAL ELIGIBLE != APPROVAL GRANTED
 *
 * Yaşam döngüsü (§41.5) — YALNIZ bu dört geçiş, atlamalar reddedilir:
 * ```text
 * DRAFT -> OFFICE_APPROVAL_PENDING -> OFFICE_APPROVED
 *       -> CONTENT_APPROVAL_PENDING -> CONTENT_APPROVED
 * ```
 *
 * Her geçiş TEK transaction içindedir ve üç katman birlikte uygulanır (§41.4):
 *   1. `pg_advisory_xact_lock` — aynı versiyonun eşzamanlı yazarlarını serileştirir,
 *   2. application pre-check — yeterlilik, four-eyes, stale-onay, hash doğrulaması,
 *   3. KOŞULLU `updateMany` — beklenen statü + boş approver alanı `where`de; `count !== 1`
 *      ise geçiş REDDEDİLİR. Uygulama pre-check'ine TEK BAŞINA güvenilmez.
 */
export class ClientFinancialDisclosureApprovalService {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * `DRAFT → OFFICE_APPROVAL_PENDING` (§5.1). Talep TAM OLARAK bu versiyona ve bu
   * `snapshotHash`e bağlanır; `OfficeApprovalRequest.actionCode` canonical disclosure
   * action'ıdır. Aynı versiyon + aynı hash için ikinci aktif talep ÜRETİLMEZ (idempotent).
   */
  async requestOfficeApproval(
    input: RequestOfficeApprovalInput,
  ): Promise<DisclosureApprovalTransitionResult> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        await this.lockVersion(tx, input.tenantId, input.disclosureVersionId);
        const version = await this.loadVersion(tx, input.tenantId, input.disclosureVersionId);
        this.assertNotTerminal(version);
        await this.assertActorInTenant(tx, input.requesterUserId, input.tenantId);

        // Idempotent replay: aynı requester + aynı hash için zaten aktif bir talep varsa
        // ikinci talep AÇILMAZ, canonical mevcut sonuç döner.
        if (version.status === ClientFinancialDisclosureStatus.OFFICE_APPROVAL_PENDING) {
          const existing = version.officeApprovalRequestId
            ? await tx.officeApprovalRequest.findFirst({
                where: { id: version.officeApprovalRequestId, tenantId: input.tenantId },
                select: {
                  id: true,
                  actionCode: true,
                  targetType: true,
                  targetRef: true,
                  requesterUserId: true,
                  savedIntent: true,
                },
              })
            : null;
          if (
            existing &&
            existing.actionCode === CLIENT_FINANCIAL_DISCLOSURE_APPROVE_ACTION_CODE &&
            existing.targetType === CLIENT_FINANCIAL_DISCLOSURE_APPROVAL_TARGET_TYPE &&
            existing.targetRef === version.id &&
            existing.requesterUserId === input.requesterUserId &&
            this.readIntent(existing.savedIntent)?.snapshotHash === version.snapshotHash
          ) {
            return {
              disclosureVersionId: version.id,
              previousStatus: version.status,
              status: version.status,
              replayed: true,
              approvalRequestId: existing.id,
            };
          }
          throw new ClientFinancialDisclosureApprovalError('DISCLOSURE_APPROVAL_STATUS_INVALID');
        }

        this.assertExactStatus(version, ClientFinancialDisclosureStatus.DRAFT);
        await this.assertSnapshotFresh(tx, version);

        const intent: DisclosureApprovalIntentV1 = {
          contractVersion: CLIENT_FINANCIAL_DISCLOSURE_APPROVAL_INTENT_CONTRACT_VERSION,
          tenantId: version.tenantId,
          disclosureId: version.disclosureId,
          disclosureVersionId: version.id,
          version: version.version,
          snapshotHash: version.snapshotHash,
        };

        const request = await tx.officeApprovalRequest.create({
          data: {
            tenantId: version.tenantId,
            actionCode: CLIENT_FINANCIAL_DISCLOSURE_APPROVE_ACTION_CODE,
            targetType: CLIENT_FINANCIAL_DISCLOSURE_APPROVAL_TARGET_TYPE,
            targetRef: version.id,
            requesterUserId: input.requesterUserId,
            status: OfficeApprovalStatus.PENDING_APPROVAL,
            savedIntent: intent as unknown as Prisma.InputJsonValue,
            payloadHash: stableJsonHash(intent),
            // Tenant-scoped `@@unique([tenantId, idempotencyKey])` → aynı versiyon+hash için
            // ikinci talep DB seviyesinde de engellenir (son savunma katmanı).
            idempotencyKey: `${CLIENT_FINANCIAL_DISCLOSURE_APPROVE_ACTION_CODE}:${version.id}:${version.snapshotHash}`,
          },
          select: { id: true },
        });

        const moved = await tx.clientFinancialDisclosureVersion.updateMany({
          where: {
            id: version.id,
            tenantId: version.tenantId,
            status: ClientFinancialDisclosureStatus.DRAFT,
            officeApprovalRequestId: null,
          },
          data: {
            status: ClientFinancialDisclosureStatus.OFFICE_APPROVAL_PENDING,
            officeApprovalRequestId: request.id,
          },
        });
        this.assertSingleTransition(moved.count);

        return {
          disclosureVersionId: version.id,
          previousStatus: ClientFinancialDisclosureStatus.DRAFT,
          status: ClientFinancialDisclosureStatus.OFFICE_APPROVAL_PENDING,
          replayed: false,
          approvalRequestId: request.id,
        };
      });
    } catch (error) {
      throw this.mapError(error);
    }
  }

  /**
   * `OFFICE_APPROVAL_PENDING → OFFICE_APPROVED` (§5.2). Geçiş öncesi ZORUNLU kapılar:
   * approver yeterliliği · requester ≠ approver · aynı tenant · talep TAM OLARAK bu
   * versiyona ait · talebin `snapshotHash`i persist edilen hash ile aynı ·
   * `verifyPersistedSnapshot() === MATCH` · statü TAM OLARAK `OFFICE_APPROVAL_PENDING`.
   */
  async completeOfficeApproval(
    input: CompleteOfficeApprovalInput,
  ): Promise<DisclosureApprovalTransitionResult> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        await this.lockVersion(tx, input.tenantId, input.disclosureVersionId);
        const version = await this.loadVersion(tx, input.tenantId, input.disclosureVersionId);
        this.assertNotTerminal(version);

        // Idempotent replay: aynı talep + aynı approver ile zaten onaylanmışsa ikinci geçiş YOK.
        if (
          version.status === ClientFinancialDisclosureStatus.OFFICE_APPROVED &&
          version.officeApprovalRequestId === input.approvalRequestId &&
          version.officeApprovedById === input.approverUserId
        ) {
          return {
            disclosureVersionId: version.id,
            previousStatus: version.status,
            status: version.status,
            replayed: true,
            approvalRequestId: input.approvalRequestId,
          };
        }

        this.assertExactStatus(version, ClientFinancialDisclosureStatus.OFFICE_APPROVAL_PENDING);

        const request = await tx.officeApprovalRequest.findFirst({
          where: { id: input.approvalRequestId, tenantId: input.tenantId },
          select: {
            id: true,
            actionCode: true,
            targetType: true,
            targetRef: true,
            requesterUserId: true,
            status: true,
            savedIntent: true,
            payloadHash: true,
          },
        });
        if (!request) {
          throw new ClientFinancialDisclosureApprovalError('DISCLOSURE_APPROVAL_REQUEST_NOT_FOUND');
        }
        if (
          request.actionCode !== CLIENT_FINANCIAL_DISCLOSURE_APPROVE_ACTION_CODE ||
          request.targetType !== CLIENT_FINANCIAL_DISCLOSURE_APPROVAL_TARGET_TYPE ||
          request.targetRef !== version.id ||
          version.officeApprovalRequestId !== request.id
        ) {
          throw new ClientFinancialDisclosureApprovalError('DISCLOSURE_APPROVAL_REQUEST_MISMATCH');
        }
        if (request.status !== OfficeApprovalStatus.PENDING_APPROVAL) {
          throw new ClientFinancialDisclosureApprovalError('DISCLOSURE_APPROVAL_REQUEST_CONSUMED');
        }

        const intent = this.readIntent(request.savedIntent);
        if (!intent || intent.disclosureVersionId !== version.id) {
          throw new ClientFinancialDisclosureApprovalError('DISCLOSURE_APPROVAL_REQUEST_MISMATCH');
        }
        // Stale-onay kapısı: talep TAM OLARAK persist edilen hash'e bağlıdır; savedIntent'in
        // kendisi de payloadHash ile doğrulanır (talep gövdesi sonradan oynanmış olamaz).
        if (
          intent.snapshotHash !== version.snapshotHash ||
          stableJsonHash(intent) !== request.payloadHash
        ) {
          throw new ClientFinancialDisclosureApprovalError('DISCLOSURE_APPROVAL_STALE_SNAPSHOT');
        }

        // §41.2 KARAR 2 — requester kendi talebini ONAYLAYAMAZ (fail-closed).
        if (request.requesterUserId === input.approverUserId) {
          throw new ClientFinancialDisclosureApprovalAuthorizationError(
            'DISCLOSURE_APPROVAL_SELF_APPROVAL_FORBIDDEN',
          );
        }
        await this.assertApproverEligible(tx, input.approverUserId, version.tenantId);
        await this.assertSnapshotFresh(tx, version);

        const moved = await tx.clientFinancialDisclosureVersion.updateMany({
          where: {
            id: version.id,
            tenantId: version.tenantId,
            status: ClientFinancialDisclosureStatus.OFFICE_APPROVAL_PENDING,
            officeApprovalRequestId: request.id,
            officeApprovedById: null,
          },
          data: {
            status: ClientFinancialDisclosureStatus.OFFICE_APPROVED,
            officeApprovedAt: new Date(),
            officeApprovedById: input.approverUserId,
          },
        });
        this.assertSingleTransition(moved.count);

        const decided = await tx.officeApprovalRequest.updateMany({
          where: {
            id: request.id,
            tenantId: version.tenantId,
            status: OfficeApprovalStatus.PENDING_APPROVAL,
          },
          data: {
            status: OfficeApprovalStatus.APPROVED,
            approverUserId: input.approverUserId,
            decidedAt: new Date(),
          },
        });
        this.assertSingleTransition(decided.count);

        return {
          disclosureVersionId: version.id,
          previousStatus: ClientFinancialDisclosureStatus.OFFICE_APPROVAL_PENDING,
          status: ClientFinancialDisclosureStatus.OFFICE_APPROVED,
          replayed: false,
          approvalRequestId: request.id,
        };
      });
    } catch (error) {
      throw this.mapError(error);
    }
  }

  /**
   * `OFFICE_APPROVED → CONTENT_APPROVAL_PENDING` (§5.3). İçerik onayı İKİNCİ bir
   * `OfficeApprovalRequest` DEĞİLDİR (§41.2 KARAR 5): versiyon üzerinde ayrı, denetlenebilir
   * bir lifecycle transition'dır. Bildirim içeriği serbest metinden ALINMAZ; tenant-scoped
   * versiyon projection'ı deterministik renderer'dan geçirilir. Renderer output'u ve alıcı
   * bağlaması canonical `notificationContentHash` ile mühürlenir; tamamlamada doğrulanır.
   */
  async requestContentApproval(
    input: RequestContentApprovalInput,
  ): Promise<DisclosureApprovalTransitionResult> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        await this.lockVersion(tx, input.tenantId, input.disclosureVersionId);
        const version = await this.loadVersion(tx, input.tenantId, input.disclosureVersionId);
        this.assertNotTerminal(version);
        await this.assertActorInTenant(tx, input.requesterUserId, input.tenantId);

        const recipientEmail = input.approvedRecipientEmail?.trim() ?? '';
        if (recipientEmail.length === 0) {
          throw new ClientFinancialDisclosureApprovalError('DISCLOSURE_APPROVAL_CONTENT_REQUIRED');
        }
        const recipientPortalUserId = input.approvedRecipientPortalUserId ?? null;

        if (version.status !== ClientFinancialDisclosureStatus.CONTENT_APPROVAL_PENDING) {
          this.assertExactStatus(version, ClientFinancialDisclosureStatus.OFFICE_APPROVED);
        }
        await this.assertSnapshotFresh(tx, version);
        const content = this.renderNotificationContent(version);
        const contentHash = this.notificationContentHash({
          tenantId: version.tenantId,
          disclosureVersionId: version.id,
          snapshotHash: version.snapshotHash,
          notificationContent: content,
          approvedRecipientEmail: recipientEmail,
          approvedRecipientPortalUserId: recipientPortalUserId,
        });

        // Idempotent replay: aynı içerik+alıcı ile zaten hazırlanmışsa ikinci geçiş YOK.
        if (version.status === ClientFinancialDisclosureStatus.CONTENT_APPROVAL_PENDING) {
          if (version.notificationContentHash === contentHash) {
            return {
              disclosureVersionId: version.id,
              previousStatus: version.status,
              status: version.status,
              replayed: true,
            };
          }
          throw new ClientFinancialDisclosureApprovalError('DISCLOSURE_APPROVAL_STATUS_INVALID');
        }

        const moved = await tx.clientFinancialDisclosureVersion.updateMany({
          where: {
            id: version.id,
            tenantId: version.tenantId,
            status: ClientFinancialDisclosureStatus.OFFICE_APPROVED,
            contentApprovedById: null,
          },
          data: {
            status: ClientFinancialDisclosureStatus.CONTENT_APPROVAL_PENDING,
            notificationContent: content,
            notificationContentHash: contentHash,
            approvedRecipientEmail: recipientEmail,
            approvedRecipientPortalUserId: recipientPortalUserId,
          },
        });
        this.assertSingleTransition(moved.count);

        return {
          disclosureVersionId: version.id,
          previousStatus: ClientFinancialDisclosureStatus.OFFICE_APPROVED,
          status: ClientFinancialDisclosureStatus.CONTENT_APPROVAL_PENDING,
          replayed: false,
        };
      });
    } catch (error) {
      throw this.mapError(error);
    }
  }

  /**
   * `CONTENT_APPROVAL_PENDING → CONTENT_APPROVED` (§5.4). Geçiş öncesi ZORUNLU kapılar:
   * content approver yeterliliği · content approver ≠ requester · content approver ≠ office
   * approver (§41.2 KARAR 4 four-eyes) · aynı tenant · `verifyPersistedSnapshot() === MATCH` ·
   * `notificationContentHash` MATCH · versiyon superseded/cancelled/reversed DEĞİL ·
   * statü TAM OLARAK `CONTENT_APPROVAL_PENDING`.
   */
  async completeContentApproval(
    input: CompleteContentApprovalInput,
  ): Promise<DisclosureApprovalTransitionResult> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        await this.lockVersion(tx, input.tenantId, input.disclosureVersionId);
        const version = await this.loadVersion(tx, input.tenantId, input.disclosureVersionId);
        this.assertNotTerminal(version);

        if (
          version.status === ClientFinancialDisclosureStatus.CONTENT_APPROVED &&
          version.contentApprovedById === input.contentApproverUserId
        ) {
          return {
            disclosureVersionId: version.id,
            previousStatus: version.status,
            status: version.status,
            replayed: true,
          };
        }

        this.assertExactStatus(version, ClientFinancialDisclosureStatus.CONTENT_APPROVAL_PENDING);

        if (
          !version.notificationContent ||
          !version.notificationContentHash ||
          !version.approvedRecipientEmail
        ) {
          throw new ClientFinancialDisclosureApprovalError('DISCLOSURE_APPROVAL_CONTENT_REQUIRED');
        }
        // İçerik bütünlüğü: persist edilen içerik+alıcı bağlaması yeniden hash'lenir. İçerik veya
        // alıcı onaydan SONRA değişmiş olamaz — değişmişse geçiş fail-closed reddedilir (§41.4).
        const recomputedContentHash = this.notificationContentHash({
          tenantId: version.tenantId,
          disclosureVersionId: version.id,
          snapshotHash: version.snapshotHash,
          notificationContent: version.notificationContent,
          approvedRecipientEmail: version.approvedRecipientEmail,
          approvedRecipientPortalUserId: version.approvedRecipientPortalUserId,
        });
        if (recomputedContentHash !== version.notificationContentHash) {
          throw new ClientFinancialDisclosureApprovalError(
            'DISCLOSURE_APPROVAL_CONTENT_HASH_MISMATCH',
          );
        }
        this.assertSealedRenderedContent(version.notificationContent);

        if (!version.officeApprovalRequestId || !version.officeApprovedById) {
          throw new ClientFinancialDisclosureApprovalError('DISCLOSURE_APPROVAL_REQUEST_NOT_FOUND');
        }
        const request = await tx.officeApprovalRequest.findFirst({
          where: { id: version.officeApprovalRequestId, tenantId: version.tenantId },
          select: { id: true, requesterUserId: true, savedIntent: true },
        });
        if (!request) {
          throw new ClientFinancialDisclosureApprovalError('DISCLOSURE_APPROVAL_REQUEST_NOT_FOUND');
        }
        // Ofis onayından sonra finansal içerik değişmiş olamaz.
        if (this.readIntent(request.savedIntent)?.snapshotHash !== version.snapshotHash) {
          throw new ClientFinancialDisclosureApprovalError('DISCLOSURE_APPROVAL_STALE_SNAPSHOT');
        }

        // §41.2 KARAR 2/4 — requester hiçbir aşamayı onaylayamaz.
        if (request.requesterUserId === input.contentApproverUserId) {
          throw new ClientFinancialDisclosureApprovalAuthorizationError(
            'DISCLOSURE_APPROVAL_SELF_APPROVAL_FORBIDDEN',
          );
        }
        // §41.2 KARAR 4 — ZORUNLU four-eyes: ofis onaylayıcısı içerik onaylayıcısı OLAMAZ.
        if (version.officeApprovedById === input.contentApproverUserId) {
          throw new ClientFinancialDisclosureApprovalAuthorizationError(
            'DISCLOSURE_APPROVAL_FOUR_EYES_VIOLATION',
          );
        }
        await this.assertApproverEligible(tx, input.contentApproverUserId, version.tenantId);
        await this.assertSnapshotFresh(tx, version);

        const moved = await tx.clientFinancialDisclosureVersion.updateMany({
          where: {
            id: version.id,
            tenantId: version.tenantId,
            status: ClientFinancialDisclosureStatus.CONTENT_APPROVAL_PENDING,
            contentApprovedById: null,
          },
          data: {
            status: ClientFinancialDisclosureStatus.CONTENT_APPROVED,
            contentApprovedAt: new Date(),
            contentApprovedById: input.contentApproverUserId,
          },
        });
        this.assertSingleTransition(moved.count);

        return {
          disclosureVersionId: version.id,
          previousStatus: ClientFinancialDisclosureStatus.CONTENT_APPROVAL_PENDING,
          status: ClientFinancialDisclosureStatus.CONTENT_APPROVED,
          replayed: false,
        };
      });
    } catch (error) {
      throw this.mapError(error);
    }
  }

  // ── Ortak kapılar ────────────────────────────────────────────────────────────

  /** Aynı versiyonun eşzamanlı geçiş yazarlarını serileştirir (I02 advisory-lock emsali). */
  private async lockVersion(
    tx: Prisma.TransactionClient,
    tenantId: string,
    versionId: string,
  ): Promise<void> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`client-financial-disclosure-approval:${tenantId}:${versionId}`}, 0))`;
  }

  private async loadVersion(
    tx: Prisma.TransactionClient,
    tenantId: string,
    versionId: string,
  ): Promise<LoadedVersion> {
    const version = await tx.clientFinancialDisclosureVersion.findFirst({
      where: { id: versionId, tenantId },
      select: VERSION_SELECT,
    });
    if (!version) {
      throw new ClientFinancialDisclosureApprovalError('DISCLOSURE_APPROVAL_VERSION_NOT_FOUND');
    }
    return version;
  }

  private assertNotTerminal(version: LoadedVersion): void {
    if (
      version.supersededAt !== null ||
      version.cancelledAt !== null ||
      version.reversedAt !== null ||
      TERMINAL_STATUSES.includes(version.status)
    ) {
      throw new ClientFinancialDisclosureApprovalError('DISCLOSURE_APPROVAL_VERSION_TERMINAL');
    }
  }

  /** §41.5: geçersiz atlamalar reddedilir — statü TAM OLARAK beklenen değer olmalıdır. */
  private assertExactStatus(
    version: LoadedVersion,
    expected: ClientFinancialDisclosureStatus,
  ): void {
    if (version.status !== expected) {
      throw new ClientFinancialDisclosureApprovalError('DISCLOSURE_APPROVAL_STATUS_INVALID');
    }
  }

  /** §41.4: her geçişten HEMEN ÖNCE snapshot bütünlüğü; MISMATCH → hiçbir mutasyon YOK. */
  private async assertSnapshotFresh(
    tx: Prisma.TransactionClient,
    version: LoadedVersion,
  ): Promise<void> {
    const verdict = await verifyPersistedDisclosureSnapshot(tx, {
      tenantId: version.tenantId,
      versionId: version.id,
    });
    if (verdict.verdict !== 'MATCH') {
      throw new ClientFinancialDisclosureApprovalError('DISCLOSURE_APPROVAL_STALE_SNAPSHOT');
    }
  }

  /** Aktör tenant kapsamı (requester için; onay yetkisi ARAMAZ). */
  private async assertActorInTenant(
    tx: Prisma.TransactionClient,
    userId: string,
    tenantId: string,
  ): Promise<void> {
    const actor = await tx.user.findUnique({
      where: { id: userId },
      select: { id: true, isActive: true, tenantId: true },
    });
    if (!actor || !actor.isActive || actor.tenantId !== tenantId) {
      throw new ClientFinancialDisclosureApprovalAuthorizationError(
        'DISCLOSURE_APPROVAL_TENANT_MISMATCH',
      );
    }
  }

  /** §41.3 canonical yeterlilik — saf predikat tek kaynaktır, burada kopyalanmaz. */
  private async assertApproverEligible(
    tx: Prisma.TransactionClient,
    userId: string,
    tenantId: string,
  ): Promise<void> {
    const candidate = await tx.user.findUnique({
      where: { id: userId },
      select: DISCLOSURE_APPROVER_CANDIDATE_SELECT,
    });
    if (!candidate || candidate.tenantId !== tenantId) {
      throw new ClientFinancialDisclosureApprovalAuthorizationError(
        'DISCLOSURE_APPROVAL_TENANT_MISMATCH',
      );
    }
    if (!isDisclosureApproverEligible(candidate, tenantId)) {
      throw new ClientFinancialDisclosureApprovalAuthorizationError(
        'DISCLOSURE_APPROVAL_NOT_ELIGIBLE',
      );
    }
  }

  /**
   * Koşullu `updateMany` sonucunu doğrular. `count !== 1` → başka bir yazar bu versiyonu
   * zaten ilerletmiş demektir; geçiş REDDEDİLİR ve transaction geri alınır (kısmi yazma YOK).
   */
  private assertSingleTransition(count: number): void {
    if (count !== 1) {
      throw new ClientFinancialDisclosureApprovalError(
        'DISCLOSURE_APPROVAL_CONCURRENT_TRANSITION',
      );
    }
  }

  private notificationContentHash(input: {
    readonly tenantId: string;
    readonly disclosureVersionId: string;
    readonly snapshotHash: string;
    readonly notificationContent: string;
    readonly approvedRecipientEmail: string;
    readonly approvedRecipientPortalUserId: string | null;
  }): string {
    return domainSeparatedHash(CLIENT_FINANCIAL_DISCLOSURE_NOTIFICATION_CONTENT_CONTRACT_VERSION, {
      contractVersion: CLIENT_FINANCIAL_DISCLOSURE_NOTIFICATION_CONTENT_CONTRACT_VERSION,
      tenantId: input.tenantId,
      disclosureVersionId: input.disclosureVersionId,
      snapshotHash: input.snapshotHash,
      notificationContent: input.notificationContent,
      approvedRecipientEmail: input.approvedRecipientEmail,
      approvedRecipientPortalUserId: input.approvedRecipientPortalUserId,
    });
  }

  /**
   * Builds the approval candidate only from this tenant-scoped persisted version. Publication
   * stores and later consumes the serialized result; it never invokes the renderer again.
   */
  private renderNotificationContent(version: LoadedVersion): string {
    const output = renderClientFinancialDisclosure(
      createClientFinancialDisclosureRenderInput({
        disclosureId: version.id,
        version: version.version,
        fileNumber: version.disclosure.case.fileNumber,
        currency: version.currency,
        totalCollected: canonicalMoney(version.totalCollected as never),
        clientNetAmount: canonicalMoney(version.clientNetAmount as never),
        lines: [...version.lines]
          .sort((left, right) => left.sortOrder - right.sortOrder)
          .map((line) => ({
            type: line.type,
            amount: canonicalMoney(line.amount as never),
          })),
        approvedAt: (version.contentApprovedAt ?? version.officeApprovedAt)?.toISOString() ?? null,
        notifiedAt: version.publishedAt?.toISOString() ?? null,
        publishedAt: version.publishedAt?.toISOString() ?? null,
        isCurrentEffective:
          version.status === ClientFinancialDisclosureStatus.PUBLISHED &&
          version.disclosure.currentVersionId === version.id,
        supersedesDisclosureId: version.supersedesVersionId,
        supersededByDisclosureId: version.supersededByVersion?.id ?? null,
        isReversed:
          version.reversedAt !== null ||
          version.status === ClientFinancialDisclosureStatus.REVERSED,
        correctionReason: version.correctionReason,
        remittanceStatus:
          version.reversedAt !== null ||
          version.status === ClientFinancialDisclosureStatus.REVERSED
            ? 'REVERSED'
            : version.status === ClientFinancialDisclosureStatus.SUPERSEDED
              ? 'CORRECTED'
              : 'PUBLISHED',
      }),
    );
    return serializeClientFinancialDisclosureRenderOutput(output);
  }

  private assertSealedRenderedContent(content: string): void {
    try {
      parseClientFinancialDisclosureRenderOutput(content);
    } catch {
      throw new ClientFinancialDisclosureApprovalError(
        'DISCLOSURE_APPROVAL_CONTENT_HASH_MISMATCH',
      );
    }
  }

  /** `savedIntent` JSON'ını güvenli okur — biçim beklenmedikse `null` (fail-closed). */
  private readIntent(value: Prisma.JsonValue | null): DisclosureApprovalIntentV1 | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const candidate = value as Record<string, unknown>;
    if (
      candidate.contractVersion !== CLIENT_FINANCIAL_DISCLOSURE_APPROVAL_INTENT_CONTRACT_VERSION ||
      typeof candidate.tenantId !== 'string' ||
      typeof candidate.disclosureId !== 'string' ||
      typeof candidate.disclosureVersionId !== 'string' ||
      typeof candidate.version !== 'number' ||
      typeof candidate.snapshotHash !== 'string'
    ) {
      return null;
    }
    return candidate as unknown as DisclosureApprovalIntentV1;
  }

  /**
   * Ham Prisma hatası, SQLSTATE veya stack trace consumer'a ASLA sızdırılmaz; finansal
   * payload, alıcı e-postası ve bildirim içeriği hata gövdesine YAZILMAZ (I02 `mapError` emsali).
   */
  private mapError(error: unknown): unknown {
    if (
      error instanceof ClientFinancialDisclosureApprovalError ||
      error instanceof ClientFinancialDisclosureApprovalAuthorizationError
    ) {
      return error;
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        // Aynı versiyon+hash için ikinci aktif talep veya ikinci onay bağlaması.
        return new ClientFinancialDisclosureApprovalError(
          'DISCLOSURE_APPROVAL_CONCURRENT_TRANSITION',
        );
      }
      if (error.code === 'P2025') {
        return new ClientFinancialDisclosureApprovalError('DISCLOSURE_APPROVAL_VERSION_NOT_FOUND');
      }
      return new ClientFinancialDisclosureApprovalError(
        'DISCLOSURE_APPROVAL_CONCURRENT_TRANSITION',
      );
    }

    return error;
  }
}
