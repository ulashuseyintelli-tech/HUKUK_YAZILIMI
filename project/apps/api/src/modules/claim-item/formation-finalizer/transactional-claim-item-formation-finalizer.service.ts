import {
  ClaimItemStatus,
  OfficeApprovalExecutionStatus,
  OfficeApprovalStatus,
  Prisma,
  type ClaimItemFormationIntent,
  type ClaimFormationSnapshot,
  type OfficeApprovalRequest,
} from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { buildCanonicalWriteEnvelopeV1 } from '../../../common/canonical-write-envelope';
import { DomainEventIngestService } from '../../icrabot/domain-event-ingest';
import {
  canonicalJsonStringify,
  stableJsonHash,
} from '../../permission-diagnostics/guided-edge/canonical-json';
import {
  appendClaimItemContinuity,
  assertClaimItemCreateStatus,
  type ClaimItemLifecycleRecord,
} from '../claim-item-lifecycle-contract';
import { ClaimItemSourceIntegrityGuard } from '../claim-item-source-integrity.guard';
import { CLAIM_ITEM_HUMAN_WRITE_POLICY_REF } from '../claim-item-writer-routes';
import {
  CLAIM_ITEM_FORMATION_APPROVAL_REF_VERSION,
  CLAIM_ITEM_FORMATION_APPROVAL_TARGET_TYPE,
  CLAIM_ITEM_FORMATION_CANONICAL_SERIALIZATION_VERSION,
  CLAIM_ITEM_FORMATION_INTENT_CONTRACT_VERSION,
  CLAIM_ITEM_FORMATION_NORMALIZED_INPUT_VERSION,
  CLAIM_ITEM_FORMATION_SOURCE_IDENTITY_VERSION,
  type ClaimFormationJsonValue,
} from '../formation-intent/claim-item-formation-intent.contract';
import {
  buildCaseDocumentSourceIdentityHash,
  buildClaimItemFormationIntentChecksum,
  domainSeparatedFormationHash,
  isSha256Hex,
} from '../formation-intent/claim-item-formation-canonical';
import {
  CaseDocumentExactVersionResolverPort,
  LegalBasisExactVersionResolverPort,
  type ClaimItemFormationInterestEligibility,
  type ExactCaseDocumentSourceV1,
  type ExactLegalBasisBindingV1,
} from '../formation-intent/claim-item-formation-resolver.ports';
import { assertLegalBasisEligible } from '../formation-intent/claim-item-formation-legal-basis-eligibility';
import { CLAIM_ITEM_HIGH_IMPACT_ACTION_CODE } from '../claim-item-approval.constants';
import {
  ClaimItemFormationFinalizationError,
  type ClaimItemFormationFinalizationResult,
  type FinalizeClaimItemFormationInput,
} from './claim-item-formation-finalizer.contract';

const SNAPSHOT_CONTRACT_VERSION = 'ClaimFormationSnapshotV1';
const SNAPSHOT_VERSION = 1;

export interface TransactionalClaimItemFormationFinalizerOptions {
  readonly enabled?: boolean;
  readonly clock?: () => Date;
}

type IntentWithSnapshot = ClaimItemFormationIntent & {
  readonly formationSnapshot: ClaimFormationSnapshot | null;
};

/**
 * Dormant S08-I03 transaction boundary.
 *
 * This class is intentionally not a Nest provider and has no production
 * call-site. It may only be invoked by a later owner-gated adapter after the
 * merged migration is live and exact resolver implementations exist.
 */
export class TransactionalClaimItemFormationFinalizerService {
  private readonly enabled: boolean;
  private readonly clock: () => Date;
  private readonly sourceIntegrity = new ClaimItemSourceIntegrityGuard();

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly domainEventIngest: DomainEventIngestService,
    private readonly documentResolver: CaseDocumentExactVersionResolverPort,
    private readonly legalBasisResolver: LegalBasisExactVersionResolverPort,
    options: TransactionalClaimItemFormationFinalizerOptions = {},
  ) {
    this.enabled = options.enabled ?? false;
    this.clock = options.clock ?? (() => new Date());
  }

  async finalize(
    input: FinalizeClaimItemFormationInput,
  ): Promise<ClaimItemFormationFinalizationResult> {
    if (!this.enabled) this.fail('FINALIZER_DISABLED');
    this.assertOpaque(input.tenantId);
    this.assertOpaque(input.formationIntentId);

    return this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`claim-formation-finalizer:${input.tenantId}:${input.formationIntentId}`}, 0))`;

        const intent = (await tx.claimItemFormationIntent.findFirst({
          where: { id: input.formationIntentId, tenantId: input.tenantId },
          include: { formationSnapshot: true },
        })) as IntentWithSnapshot | null;
        if (!intent) this.fail('FORMATION_INTENT_NOT_FOUND');

        const approval = await tx.officeApprovalRequest.findFirst({
          where: { id: intent.approvalRequestId, tenantId: input.tenantId },
        });
        if (!approval) this.fail('FORMATION_APPROVAL_MISMATCH');

        this.assertIntentIntegrity(intent);
        this.assertApprovalBinding(intent, approval);

        if (intent.formationSnapshot) {
          return this.reconcileCompleted(tx, intent, approval);
        }

        const now = this.clock();
        this.assertActive(intent, approval, now);
        const source = await this.revalidateDocument(intent);
        const legalBasis = await this.revalidateLegalBasis(intent, source);
        const evidenceRefs = this.readEvidenceRefs(intent);
        const formationAt = new Date(approval.decidedAt as Date);
        const executionIdentity = domainSeparatedFormationHash(
          'ClaimItemFormationExecutionV1',
          {
            tenantId: intent.tenantId,
            formationIntentId: intent.id,
            intentChecksum: intent.intentChecksum,
          },
        );
        const claimItemId = `claim-formation:${executionIdentity}`;
        const snapshotId = `claim-snapshot:${executionIdentity}`;
        const commandId = `claim-command:${executionIdentity}`;
        const baseEnvelope = buildCanonicalWriteEnvelopeV1({
          tenantId: intent.tenantId,
          caseId: intent.caseId,
          target: { aggregateType: 'ClaimItem' as const, aggregateId: claimItemId },
          actor: { type: 'HUMAN', userId: intent.requesterUserId },
          correlationId: intent.correlationId,
          causationId: intent.causationId ?? `office-approval:${approval.id}`,
          idempotencyKey: `claim-formation-finalizer:${intent.id}`,
          occurredAt: formationAt.toISOString(),
          effectiveAt: intent.effectiveAt.toISOString(),
          source: {
            sourceType: 'USER_DOCUMENT',
            sourceId: intent.sourceId,
            evidenceRefs,
          },
          authority: {
            policyRef: CLAIM_ITEM_HUMAN_WRITE_POLICY_REF,
            legalBasisRef: `${intent.legalBasisCode}:${intent.legalBasisVersion}`,
            approvalRequestId: approval.id,
          },
          currency: intent.currency,
        });
        const envelope = Object.freeze({ ...baseEnvelope, commandId });

        const claimItemData = {
          id: claimItemId,
          ...this.buildClaimItemData(intent, source, legalBasis),
        };
        const guardedData = await this.sourceIntegrity.prepareHumanDocumentCreate(
          {
            tenantId: intent.tenantId,
            caseId: intent.caseId,
            sourceSlot: intent.sourceSlot,
            data: claimItemData,
            envelope,
          },
          tx,
        );
        assertClaimItemCreateStatus(guardedData.status);
        const claimItemPayloadHash = stableJsonHash(this.jsonSafe(guardedData));
        const claimItem = await tx.claimItem.create({ data: guardedData as Prisma.ClaimItemUncheckedCreateInput });

        const snapshotPayload = this.snapshotPayload(
          intent,
          approval,
          source,
          legalBasis,
          claimItemId,
          claimItemPayloadHash,
        );
        const snapshotCanonicalPayload = canonicalJsonStringify(snapshotPayload);
        const snapshotHash = domainSeparatedFormationHash(
          SNAPSHOT_CONTRACT_VERSION,
          snapshotPayload,
        );
        const admissionResult =
          intent.interestEligibility === 'UNRESOLVED'
            ? 'ALLOWED_WITH_POLICY_HOLD'
            : 'ALLOWED';
        const snapshot = await tx.claimFormationSnapshot.create({
          data: {
            id: snapshotId,
            tenantId: intent.tenantId,
            caseId: intent.caseId,
            claimItemId: claimItem.id,
            formationIntentId: intent.id,
            approvalRequestId: approval.id,
            snapshotContractVersion: SNAPSHOT_CONTRACT_VERSION,
            snapshotSerializationVersion: CLAIM_ITEM_FORMATION_CANONICAL_SERIALIZATION_VERSION,
            snapshotVersion: SNAPSHOT_VERSION,
            supersedesSnapshotId: null,
            intentChecksum: intent.intentChecksum,
            approvalReferenceHash: intent.approvalReferenceHash,
            normalizedInputChecksum: intent.normalizedInputChecksum,
            snapshotCanonicalPayload,
            snapshotHash,
            sourceIdentityVersion: intent.sourceIdentityVersion,
            sourceType: intent.sourceType,
            sourceId: intent.sourceId,
            sourceSlot: intent.sourceSlot,
            sourceIdentityHash: intent.sourceIdentityHash,
            sourceVersionId: intent.sourceVersionId,
            sourceVersion: intent.sourceVersion,
            canonicalSourceFingerprint: intent.canonicalSourceFingerprint,
            fingerprintAlgorithm: intent.fingerprintAlgorithm,
            fingerprintVersion: intent.fingerprintVersion,
            sourceResolutionContractVersion: intent.sourceResolutionContractVersion,
            sourceResolutionHash: intent.sourceResolutionHash,
            componentCategory: intent.componentCategory,
            componentSubtypeCode: intent.componentSubtypeCode,
            componentSubtypeVersion: intent.componentSubtypeVersion,
            componentSubtypeChecksum: intent.componentSubtypeChecksum,
            legalBasisCode: intent.legalBasisCode,
            legalBasisVersion: intent.legalBasisVersion,
            legalBasisChecksum: intent.legalBasisChecksum,
            legalBasisRegistryReleaseId: intent.legalBasisRegistryReleaseId,
            legalBasisRegistryReleaseChecksum: intent.legalBasisRegistryReleaseChecksum,
            legalBasisResolutionContractVersion: intent.legalBasisResolutionContractVersion,
            legalBasisResolutionHash: intent.legalBasisResolutionHash,
            originalAmountMinor: intent.originalAmountMinor,
            demandedAmountMinor: intent.demandedAmountMinor,
            currency: intent.currency,
            minorUnit: intent.minorUnit,
            effectiveAt: intent.effectiveAt,
            liabilityContextVersion: intent.liabilityContextVersion,
            liabilityContextCanonicalPayload: intent.liabilityContextCanonicalPayload,
            liabilityContextHash: intent.liabilityContextHash,
            interestEligibility: intent.interestEligibility,
            interestPolicyRef: intent.interestPolicyRef,
            interestPolicyVersion: intent.interestPolicyVersion,
            ruleRef: intent.ruleRef,
            ruleVersion: intent.ruleVersion,
            evidenceRefsContractVersion: intent.evidenceRefsContractVersion,
            evidenceRefsCanonicalPayload: intent.evidenceRefsCanonicalPayload,
            evidenceRefsHash: intent.evidenceRefsHash,
            provenanceContractVersion: intent.provenanceContractVersion,
            provenanceCanonicalPayload: intent.provenanceCanonicalPayload,
            provenanceHash: intent.provenanceHash,
            admissionResult,
            claimItemPayloadHash,
            requesterUserId: intent.requesterUserId,
            approverUserId: approval.approverUserId as string,
            approvalDecidedAt: approval.decidedAt as Date,
            commandId: envelope.commandId,
            correlationId: intent.correlationId,
            causationId: intent.causationId,
            formationAt,
            createdAt: formationAt,
          },
        });

        await appendClaimItemContinuity({
          tx,
          domainEventIngest: this.domainEventIngest,
          envelope,
          operation: 'CREATE',
          before: null,
          after: claimItem as unknown as ClaimItemLifecycleRecord,
          auditAction: 'CLAIM_ITEM_FORMATION_FINALIZED',
          auditUserId: approval.approverUserId as string,
          auditSource: 'CLAIM_ITEM_FORMATION_INTENT',
          approvalRequired: true,
        });

        const completion = await tx.officeApprovalRequest.updateMany({
          where: {
            id: approval.id,
            tenantId: intent.tenantId,
            status: OfficeApprovalStatus.APPROVED,
            executionStatus: OfficeApprovalExecutionStatus.NOT_RUN,
          },
          data: {
            executionStatus: OfficeApprovalExecutionStatus.SUCCEEDED,
            executedAt: formationAt,
          },
        });
        if (completion.count !== 1) this.fail('FORMATION_EXECUTION_CONFLICT');
        await this.audit.logInTransaction(tx, {
          tenantId: intent.tenantId,
          action: 'OFFICE_APPROVAL_EXECUTION_SUCCEEDED',
          entityType: 'OFFICE_APPROVAL',
          entityId: approval.id,
          userId: approval.approverUserId as string,
          correlationId: intent.correlationId,
          metadata: {
            targetType: approval.targetType,
            targetRef: approval.targetRef,
            formationIntentId: intent.id,
            claimItemId: claimItem.id,
            snapshotId: snapshot.id,
            executionStatus: OfficeApprovalExecutionStatus.SUCCEEDED,
          },
        });

        return Object.freeze({
          formationIntentId: intent.id,
          approvalRequestId: approval.id,
          claimItemId: claimItem.id,
          snapshotId: snapshot.id,
          replayed: false,
        });
      },
      // The advisory lock is acquired before the intent read. READ COMMITTED
      // lets a waiting retry observe the first transaction's committed snapshot
      // and return it, instead of failing with a serializable write conflict.
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
    );
  }

  private async reconcileCompleted(
    tx: Prisma.TransactionClient,
    intent: IntentWithSnapshot,
    approval: OfficeApprovalRequest,
  ): Promise<ClaimItemFormationFinalizationResult> {
    const snapshot = intent.formationSnapshot as ClaimFormationSnapshot;
    if (
      approval.status !== OfficeApprovalStatus.APPROVED ||
      approval.executionStatus !== OfficeApprovalExecutionStatus.SUCCEEDED ||
      approval.executedAt === null ||
      snapshot.approvalRequestId !== approval.id ||
      snapshot.intentChecksum !== intent.intentChecksum ||
      snapshot.approvalReferenceHash !== intent.approvalReferenceHash ||
      snapshot.formationIntentId !== intent.id ||
      snapshot.snapshotVersion !== SNAPSHOT_VERSION ||
      snapshot.snapshotContractVersion !== SNAPSHOT_CONTRACT_VERSION ||
      !this.snapshotPayloadMatches(
        snapshot.snapshotCanonicalPayload,
        snapshot.snapshotHash,
      )
    ) {
      this.fail('FORMATION_EXECUTION_CONFLICT');
    }
    const claimItem = await tx.claimItem.findFirst({
      where: {
        id: snapshot.claimItemId,
        tenantId: intent.tenantId,
        caseId: intent.caseId,
      },
      select: { id: true },
    });
    if (!claimItem) this.fail('FORMATION_EXECUTION_CONFLICT');
    return Object.freeze({
      formationIntentId: intent.id,
      approvalRequestId: approval.id,
      claimItemId: claimItem.id,
      snapshotId: snapshot.id,
      replayed: true,
    });
  }

  private assertIntentIntegrity(intent: ClaimItemFormationIntent): void {
    const checksum = buildClaimItemFormationIntentChecksum(intent.contractVersion, intent);
    if (
      intent.contractVersion !== CLAIM_ITEM_FORMATION_INTENT_CONTRACT_VERSION ||
      intent.normalizedInputContractVersion !== CLAIM_ITEM_FORMATION_NORMALIZED_INPUT_VERSION ||
      intent.canonicalSerializationVersion !== CLAIM_ITEM_FORMATION_CANONICAL_SERIALIZATION_VERSION ||
      intent.sourceIdentityVersion !== CLAIM_ITEM_FORMATION_SOURCE_IDENTITY_VERSION ||
      intent.sourceType !== 'CASE_DOCUMENT' ||
      intent.checksumAlgorithm !== 'SHA-256' ||
      intent.fingerprintAlgorithm !== 'SHA-256' ||
      checksum !== intent.intentChecksum ||
      buildCaseDocumentSourceIdentityHash({
        tenantId: intent.tenantId,
        caseId: intent.caseId,
        documentId: intent.sourceId,
      }) !== intent.sourceIdentityHash ||
      !this.canonicalPayloadMatches(intent.liabilityContextCanonicalPayload, intent.liabilityContextHash) ||
      !this.canonicalPayloadMatches(intent.evidenceRefsCanonicalPayload, intent.evidenceRefsHash) ||
      !this.canonicalPayloadMatches(intent.provenanceCanonicalPayload, intent.provenanceHash)
    ) {
      this.fail('FORMATION_INTENT_INTEGRITY_MISMATCH');
    }
  }

  private assertApprovalBinding(
    intent: ClaimItemFormationIntent,
    approval: OfficeApprovalRequest,
  ): void {
    const reference = approval.savedIntent as Record<string, unknown>;
    if (
      approval.actionCode !== CLAIM_ITEM_HIGH_IMPACT_ACTION_CODE ||
      approval.targetType !== CLAIM_ITEM_FORMATION_APPROVAL_TARGET_TYPE ||
      approval.targetRef !== intent.id ||
      approval.requesterUserId !== intent.requesterUserId ||
      approval.payloadHash !== intent.approvalReferenceHash ||
      intent.approvalReferenceVersion !== CLAIM_ITEM_FORMATION_APPROVAL_REF_VERSION ||
      stableJsonHash(approval.savedIntent) !== approval.payloadHash ||
      reference?.version !== CLAIM_ITEM_FORMATION_APPROVAL_REF_VERSION ||
      reference?.tenantId !== intent.tenantId ||
      reference?.caseId !== intent.caseId ||
      reference?.formationIntentId !== intent.id ||
      reference?.intentChecksum !== intent.intentChecksum ||
      reference?.sourceIdentityHash !== intent.sourceIdentityHash ||
      approval.replacementSavedIntent !== null ||
      approval.replacementPayloadHash !== null ||
      approval.expiresAt?.getTime() !== intent.expiresAt.getTime()
    ) {
      this.fail('FORMATION_APPROVAL_MISMATCH');
    }
  }

  private assertActive(
    intent: ClaimItemFormationIntent,
    approval: OfficeApprovalRequest,
    now: Date,
  ): void {
    if (
      !Number.isFinite(now.getTime()) ||
      now.getTime() >= intent.expiresAt.getTime() ||
      approval.status !== OfficeApprovalStatus.APPROVED ||
      approval.executionStatus !== OfficeApprovalExecutionStatus.NOT_RUN ||
      !approval.approverUserId ||
      !approval.decidedAt ||
      approval.decidedAt.getTime() < intent.createdAt.getTime() ||
      approval.decidedAt.getTime() > intent.expiresAt.getTime()
    ) {
      this.fail(
        now.getTime() >= intent.expiresAt.getTime()
          ? 'FORMATION_INTENT_EXPIRED'
          : 'FORMATION_APPROVAL_MISMATCH',
      );
    }
  }

  private async revalidateDocument(
    intent: ClaimItemFormationIntent,
  ): Promise<ExactCaseDocumentSourceV1> {
    const source = await this.documentResolver.resolveExactVersion({
      tenantId: intent.tenantId,
      caseId: intent.caseId,
      documentId: intent.sourceId,
      requestedVersionId: intent.sourceVersionId,
    });
    if (
      !source ||
      source.tenantId !== intent.tenantId ||
      source.caseId !== intent.caseId ||
      source.sourceType !== 'CASE_DOCUMENT' ||
      source.documentId !== intent.sourceId ||
      source.versionId !== intent.sourceVersionId ||
      source.version !== intent.sourceVersion ||
      source.canonicalSourceFingerprint !== intent.canonicalSourceFingerprint ||
      source.fingerprintAlgorithm !== intent.fingerprintAlgorithm ||
      source.fingerprintVersion !== intent.fingerprintVersion ||
      source.resolutionContractVersion !== intent.sourceResolutionContractVersion ||
      source.resolutionHash !== intent.sourceResolutionHash ||
      !source.fingerprintVerified ||
      !source.availableForFormation ||
      !isSha256Hex(source.canonicalSourceFingerprint) ||
      !source.claimItemDocumentSourceType
    ) {
      this.fail('FORMATION_SOURCE_MISMATCH');
    }
    return source;
  }

  private async revalidateLegalBasis(
    intent: ClaimItemFormationIntent,
    source: ExactCaseDocumentSourceV1,
  ): Promise<ExactLegalBasisBindingV1> {
    const liabilityContext = JSON.parse(intent.liabilityContextCanonicalPayload) as ClaimFormationJsonValue;
    const resolution = await this.legalBasisResolver.resolveExactVersion({
      tenantId: intent.tenantId,
      caseId: intent.caseId,
      legalBasisCode: intent.legalBasisCode,
      requestedVersion: intent.legalBasisVersion,
      effectiveAt: intent.effectiveAt.toISOString(),
      componentCategory: intent.componentCategory as any,
      componentSubtypeCode: intent.componentSubtypeCode,
      documentType: source.documentType,
      evidenceClasses: source.evidenceClasses,
      liabilityContext,
    });
    if (!resolution.ok) this.fail('FORMATION_LEGAL_BASIS_MISMATCH');

    // Owner-ratified D2: legal applicability time is the persisted Intent's
    // own `effectiveAt` — never `approval.decidedAt`, never system time.
    const eligibility = assertLegalBasisEligible({
      mode: 'FINALIZATION',
      legalBasis: resolution.value,
      requestedIdentity: {
        legalBasisCode: intent.legalBasisCode,
        legalBasisVersion: intent.legalBasisVersion,
      },
      requestedComponent: {
        category: intent.componentCategory as any,
        subtypeCode: intent.componentSubtypeCode,
      },
      documentType: source.documentType,
      evidenceClasses: source.evidenceClasses,
      effectiveAt: intent.effectiveAt.toISOString(),
      expectedBinding: {
        legalBasisChecksum: intent.legalBasisChecksum,
        registryReleaseId: intent.legalBasisRegistryReleaseId,
        registryReleaseChecksum: intent.legalBasisRegistryReleaseChecksum,
        componentSubtypeVersion: intent.componentSubtypeVersion,
        componentSubtypeChecksum: intent.componentSubtypeChecksum,
        interestEligibility: intent.interestEligibility as ClaimItemFormationInterestEligibility,
        interestPolicyRef: intent.interestPolicyRef,
        interestPolicyVersion: intent.interestPolicyVersion,
        ruleRef: intent.ruleRef,
        ruleVersion: intent.ruleVersion,
        resolutionContractVersion: intent.legalBasisResolutionContractVersion,
        resolutionHash: intent.legalBasisResolutionHash,
      },
    });
    if (!eligibility.ok) {
      this.fail(
        eligibility.failure.code === 'PROJECTION_UNSUPPORTED'
          ? 'FORMATION_PROJECTION_INVALID'
          : 'FORMATION_LEGAL_BASIS_MISMATCH',
      );
    }
    return eligibility.legalBasis;
  }

  private buildClaimItemData(
    intent: ClaimItemFormationIntent,
    source: ExactCaseDocumentSourceV1,
    legalBasis: ExactLegalBasisBindingV1,
  ): Record<string, unknown> {
    const projection = legalBasis.claimItemProjection;
    const originalAmount = this.minorToDecimal(intent.originalAmountMinor, intent.minorUnit);
    const demandedAmount = this.minorToDecimal(intent.demandedAmountMinor, intent.minorUnit);
    return {
      tenantId: intent.tenantId,
      caseId: intent.caseId,
      itemType: projection.itemType,
      originalAmount,
      demandedAmount,
      collectedAmount: new Prisma.Decimal(0),
      amount: demandedAmount,
      currency: intent.currency,
      sourceDocumentId: intent.sourceId,
      sourceDocumentType: source.claimItemDocumentSourceType,
      interestType: projection.interestType,
      interestRate:
        projection.interestRate === null
          ? null
          : this.parseInterestRate(projection.interestRate),
      interestStartDate:
        projection.interestStartDate === null
          ? null
          : new Date(projection.interestStartDate),
      interestAccrualStatus: projection.interestAccrualStatus,
      interestStartDateProvenance: projection.interestStartDateProvenance,
      isAllDebtorsLiable: projection.isAllDebtorsLiable,
      liableDebtorIds: [...projection.liableDebtorIds],
      status: ClaimItemStatus.ACTIVE,
      createdById: intent.requesterUserId,
      metadata: {
        formation: {
          contractVersion: CLAIM_ITEM_FORMATION_INTENT_CONTRACT_VERSION,
          formationIntentId: intent.id,
          intentChecksum: intent.intentChecksum,
          componentCategory: intent.componentCategory,
          componentSubtypeCode: intent.componentSubtypeCode,
          componentSubtypeVersion: intent.componentSubtypeVersion,
          legalBasisCode: intent.legalBasisCode,
          legalBasisVersion: intent.legalBasisVersion,
          legalBasisChecksum: intent.legalBasisChecksum,
          liabilityContextHash: intent.liabilityContextHash,
        },
      },
    };
  }

  private minorToDecimal(value: bigint, minorUnit: number): Prisma.Decimal {
    const sign = value < 0n ? '-' : '';
    const digits = (value < 0n ? -value : value).toString();
    if (minorUnit > 2) {
      const divisor = 10n ** BigInt(minorUnit - 2);
      if (value % divisor !== 0n) this.fail('FORMATION_PROJECTION_INVALID');
      return this.minorToDecimal(value / divisor, 2);
    }
    const padded = digits.padStart(minorUnit + 1, '0');
    const text =
      minorUnit === 0
        ? `${sign}${padded}`
        : `${sign}${padded.slice(0, -minorUnit)}.${padded.slice(-minorUnit)}`;
    const decimal = new Prisma.Decimal(text);
    if (decimal.decimalPlaces() > 2 || decimal.abs().greaterThan('9999999999999.99')) {
      this.fail('FORMATION_PROJECTION_INVALID');
    }
    return decimal;
  }

  private readEvidenceRefs(intent: ClaimItemFormationIntent): string[] {
    const payload = JSON.parse(intent.evidenceRefsCanonicalPayload) as {
      refs?: unknown;
    };
    if (
      !Array.isArray(payload.refs) ||
      payload.refs.length > 32 ||
      payload.refs.some(
        (entry) =>
          typeof entry !== 'string' ||
          !/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/.test(entry),
      ) ||
      new Set(payload.refs).size !== payload.refs.length
    ) {
      this.fail('FORMATION_INTENT_INTEGRITY_MISMATCH');
    }
    return payload.refs as string[];
  }

  private snapshotPayload(
    intent: ClaimItemFormationIntent,
    approval: OfficeApprovalRequest,
    source: ExactCaseDocumentSourceV1,
    legalBasis: ExactLegalBasisBindingV1,
    claimItemId: string,
    claimItemPayloadHash: string,
  ): ClaimFormationJsonValue {
    return {
      version: SNAPSHOT_CONTRACT_VERSION,
      snapshotVersion: SNAPSHOT_VERSION,
      formationIntentId: intent.id,
      approvalRequestId: approval.id,
      claimItemId,
      intentChecksum: intent.intentChecksum,
      approvalReferenceHash: intent.approvalReferenceHash,
      sourceIdentityHash: intent.sourceIdentityHash,
      sourceVersionId: intent.sourceVersionId,
      canonicalSourceFingerprint: intent.canonicalSourceFingerprint,
      documentProjection: source.claimItemDocumentSourceType,
      componentCategory: intent.componentCategory,
      componentSubtypeCode: intent.componentSubtypeCode,
      legalBasisCode: intent.legalBasisCode,
      legalBasisVersion: intent.legalBasisVersion,
      legalBasisResolutionHash: intent.legalBasisResolutionHash,
      claimItemProjection: this.jsonSafe(legalBasis.claimItemProjection) as ClaimFormationJsonValue,
      originalAmountMinor: intent.originalAmountMinor.toString(),
      demandedAmountMinor: intent.demandedAmountMinor.toString(),
      currency: intent.currency,
      minorUnit: intent.minorUnit,
      effectiveAt: intent.effectiveAt.toISOString(),
      liabilityContextHash: intent.liabilityContextHash,
      evidenceRefsHash: intent.evidenceRefsHash,
      provenanceHash: intent.provenanceHash,
      claimItemPayloadHash,
      requesterUserId: intent.requesterUserId,
      approverUserId: approval.approverUserId as string,
      approvalDecidedAt: (approval.decidedAt as Date).toISOString(),
    };
  }

  private canonicalPayloadMatches(payload: string, expectedHash: string): boolean {
    try {
      const value = JSON.parse(payload) as ClaimFormationJsonValue;
      return (
        canonicalJsonStringify(value) === payload &&
        stableJsonHash(value) === expectedHash &&
        isSha256Hex(expectedHash)
      );
    } catch {
      return false;
    }
  }

  private snapshotPayloadMatches(payload: string, expectedHash: string): boolean {
    try {
      const value = JSON.parse(payload) as ClaimFormationJsonValue;
      return (
        canonicalJsonStringify(value) === payload &&
        domainSeparatedFormationHash(SNAPSHOT_CONTRACT_VERSION, value) ===
          expectedHash &&
        isSha256Hex(expectedHash)
      );
    } catch {
      return false;
    }
  }

  private parseInterestRate(value: string): Prisma.Decimal {
    try {
      return new Prisma.Decimal(value);
    } catch {
      this.fail('FORMATION_PROJECTION_INVALID');
    }
  }

  private jsonSafe(value: unknown): Record<string, unknown> {
    return JSON.parse(
      JSON.stringify(value, (_key, entry) => {
        if (typeof entry === 'bigint') return entry.toString();
        if (entry instanceof Prisma.Decimal) return entry.toString();
        return entry;
      }),
    ) as Record<string, unknown>;
  }

  private assertOpaque(value: string): void {
    if (!/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/.test(value)) {
      this.fail('FORMATION_EXECUTION_CONFLICT');
    }
  }

  private fail(code: ConstructorParameters<typeof ClaimItemFormationFinalizationError>[0]): never {
    throw new ClaimItemFormationFinalizationError(code);
  }
}
