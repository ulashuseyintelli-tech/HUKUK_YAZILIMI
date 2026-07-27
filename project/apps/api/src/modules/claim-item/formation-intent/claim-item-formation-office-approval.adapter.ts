import { randomUUID } from 'node:crypto';
import {
  OfficeApprovalExecutionStatus,
  OfficeApprovalStatus,
  Prisma,
  type ClaimItemFormationIntent,
  type OfficeApprovalRequest,
} from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { stableJsonHash } from '../../permission-diagnostics/guided-edge/canonical-json';
import { CLAIM_ITEM_HIGH_IMPACT_ACTION_CODE } from '../claim-item-approval.constants';
import {
  CLAIM_ITEM_FORMATION_APPROVAL_REF_VERSION,
  CLAIM_ITEM_FORMATION_APPROVAL_TARGET_TYPE,
  CLAIM_ITEM_FORMATION_INTENT_CONTRACT_VERSION,
  ClaimItemFormationAdmissionError,
  type ClaimFormationJsonValue,
  type ClaimItemFormationApprovalRefV1,
} from './claim-item-formation-intent.contract';
import {
  validateLegalBasisProjectionBindingPersistenceEnvelope,
  type LegalBasisProjectionBindingPersistenceEnvelopeV1,
} from './legal-basis-projection-binding-persistence';

export interface PersistClaimItemFormationIntentInput {
  readonly tenantId: string;
  readonly caseId: string;
  readonly requesterUserId: string;
  readonly createdAt: Date;
  readonly expiresAt: Date;
  readonly idempotencyKey: string;
  readonly normalizedInputChecksum: string;
  readonly normalizedInputContractVersion: string;
  readonly intentChecksum: string;
  readonly checksumAlgorithm: 'SHA-256';
  readonly canonicalSerializationVersion: string;
  readonly correlationId: string;
  readonly causationId: string | null;
  readonly sourceIdentityVersion: string;
  readonly sourceType: 'CASE_DOCUMENT';
  readonly sourceId: string;
  readonly sourceSlot: string;
  readonly sourceIdentityHash: string;
  readonly sourceVersionId: string;
  readonly sourceVersion: string;
  readonly canonicalSourceFingerprint: string;
  readonly fingerprintAlgorithm: 'SHA-256';
  readonly fingerprintVersion: string;
  readonly sourceResolutionContractVersion: string;
  readonly sourceResolutionHash: string;
  readonly componentCategory: string;
  readonly componentSubtypeCode: string;
  readonly componentSubtypeVersion: string;
  readonly componentSubtypeChecksum: string;
  readonly legalBasisCode: string;
  readonly legalBasisVersion: string;
  readonly legalBasisChecksum: string;
  readonly legalBasisRegistryReleaseId: string;
  readonly legalBasisRegistryReleaseChecksum: string;
  readonly legalBasisResolutionContractVersion: string;
  readonly legalBasisResolutionHash: string;
  readonly legalBasisProjectionBinding?: LegalBasisProjectionBindingPersistenceEnvelopeV1;
  readonly originalAmountMinor: bigint;
  readonly demandedAmountMinor: bigint;
  readonly currency: string;
  readonly minorUnit: number;
  readonly effectiveAt: Date;
  readonly liabilityContextVersion: string;
  readonly liabilityContextCanonicalPayload: string;
  readonly liabilityContextHash: string;
  readonly interestEligibility: string;
  readonly interestPolicyRef: string | null;
  readonly interestPolicyVersion: string | null;
  readonly ruleRef: string | null;
  readonly ruleVersion: string | null;
  readonly evidenceRefsContractVersion: string;
  readonly evidenceRefsCanonicalPayload: string;
  readonly evidenceRefsHash: string;
  readonly provenanceContractVersion: string;
  readonly provenanceCanonicalPayload: string;
  readonly provenanceHash: string;
}

export interface ClaimItemFormationAdmissionResult {
  readonly intent: ClaimItemFormationIntent;
  readonly approval: OfficeApprovalRequest;
  readonly replayed: boolean;
}

/**
 * Receivable-specific transaction adapter.
 *
 * OfficeApprovalService.createPendingRequest() owns its own Prisma boundary and
 * writes audit after create. It therefore cannot atomically bind an immutable
 * ClaimItemFormationIntent. This adapter deliberately reuses the existing
 * OfficeApproval row contract without changing the generic Office state machine.
 */
export class ClaimItemFormationOfficeApprovalAdapter {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async createAtomic(
    input: PersistClaimItemFormationIntentInput,
  ): Promise<ClaimItemFormationAdmissionResult> {
    const projectionBinding = validateLegalBasisProjectionBindingPersistenceEnvelope(
      input.legalBasisProjectionBinding,
    );
    try {
      return await this.prisma.$transaction(async (tx) =>
        this.createInTransaction(tx, input, projectionBinding),
      );
    } catch (error) {
      if (!this.isUniqueConflict(error)) throw error;
      const existing = await this.findExisting(input.tenantId, input.idempotencyKey);
      if (!existing) throw error;
      return this.reconcileExisting(existing, input.intentChecksum, projectionBinding);
    }
  }

  private async createInTransaction(
    tx: Prisma.TransactionClient,
    input: PersistClaimItemFormationIntentInput,
    projectionBinding: LegalBasisProjectionBindingPersistenceEnvelopeV1 | undefined,
  ): Promise<ClaimItemFormationAdmissionResult> {
    const existing = await tx.claimItemFormationIntent.findUnique({
      where: {
        tenantId_idempotencyKey: {
          tenantId: input.tenantId,
          idempotencyKey: input.idempotencyKey,
        },
      },
    });
    if (existing) {
      const approval = await tx.officeApprovalRequest.findFirst({
        where: { id: existing.approvalRequestId, tenantId: input.tenantId },
      });
      return this.reconcileExisting(
        { intent: existing, approval },
        input.intentChecksum,
        projectionBinding,
      );
    }

    const formationIntentId = randomUUID();
    const approvalRequestId = randomUUID();
    const savedIntent: ClaimItemFormationApprovalRefV1 = Object.freeze({
      version: CLAIM_ITEM_FORMATION_APPROVAL_REF_VERSION,
      tenantId: input.tenantId,
      caseId: input.caseId,
      formationIntentId,
      intentChecksum: input.intentChecksum,
      sourceIdentityHash: input.sourceIdentityHash,
    });
    const payloadHash = stableJsonHash(savedIntent);

    const approval = await tx.officeApprovalRequest.create({
      data: {
        id: approvalRequestId,
        tenantId: input.tenantId,
        actionCode: CLAIM_ITEM_HIGH_IMPACT_ACTION_CODE,
        targetType: CLAIM_ITEM_FORMATION_APPROVAL_TARGET_TYPE,
        targetRef: formationIntentId,
        requesterUserId: input.requesterUserId,
        status: OfficeApprovalStatus.PENDING_APPROVAL,
        executionStatus: OfficeApprovalExecutionStatus.NOT_RUN,
        savedIntent: savedIntent as unknown as Prisma.JsonObject,
        payloadHash,
        reason: null,
        idempotencyKey: this.approvalIdempotencyKey(input.idempotencyKey),
        expiresAt: input.expiresAt,
      },
    });

    const intent = await tx.claimItemFormationIntent.create({
      data: {
        id: formationIntentId,
        tenantId: input.tenantId,
        caseId: input.caseId,
        contractVersion: CLAIM_ITEM_FORMATION_INTENT_CONTRACT_VERSION,
        createdAt: input.createdAt,
        expiresAt: input.expiresAt,
        idempotencyKey: input.idempotencyKey,
        normalizedInputChecksum: input.normalizedInputChecksum,
        normalizedInputContractVersion: input.normalizedInputContractVersion,
        intentChecksum: input.intentChecksum,
        checksumAlgorithm: input.checksumAlgorithm,
        canonicalSerializationVersion: input.canonicalSerializationVersion,
        approvalRequestId,
        approvalReferenceVersion: CLAIM_ITEM_FORMATION_APPROVAL_REF_VERSION,
        approvalReferenceHash: payloadHash,
        requesterUserId: input.requesterUserId,
        correlationId: input.correlationId,
        causationId: input.causationId,
        sourceIdentityVersion: input.sourceIdentityVersion,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        sourceSlot: input.sourceSlot,
        sourceIdentityHash: input.sourceIdentityHash,
        sourceVersionId: input.sourceVersionId,
        sourceVersion: input.sourceVersion,
        canonicalSourceFingerprint: input.canonicalSourceFingerprint,
        fingerprintAlgorithm: input.fingerprintAlgorithm,
        fingerprintVersion: input.fingerprintVersion,
        sourceResolutionContractVersion: input.sourceResolutionContractVersion,
        sourceResolutionHash: input.sourceResolutionHash,
        componentCategory: input.componentCategory,
        componentSubtypeCode: input.componentSubtypeCode,
        componentSubtypeVersion: input.componentSubtypeVersion,
        componentSubtypeChecksum: input.componentSubtypeChecksum,
        legalBasisCode: input.legalBasisCode,
        legalBasisVersion: input.legalBasisVersion,
        legalBasisChecksum: input.legalBasisChecksum,
        legalBasisRegistryReleaseId: input.legalBasisRegistryReleaseId,
        legalBasisRegistryReleaseChecksum: input.legalBasisRegistryReleaseChecksum,
        legalBasisResolutionContractVersion: input.legalBasisResolutionContractVersion,
        legalBasisResolutionHash: input.legalBasisResolutionHash,
        legalBasisProjectionBindingContractVersion:
          projectionBinding?.contractVersion ?? null,
        legalBasisProjectionBindingCanonicalPayload:
          projectionBinding?.canonicalPayload ?? null,
        legalBasisProjectionBindingChecksum: projectionBinding?.checksum ?? null,
        originalAmountMinor: input.originalAmountMinor,
        demandedAmountMinor: input.demandedAmountMinor,
        currency: input.currency,
        minorUnit: input.minorUnit,
        effectiveAt: input.effectiveAt,
        liabilityContextVersion: input.liabilityContextVersion,
        liabilityContextCanonicalPayload: input.liabilityContextCanonicalPayload,
        liabilityContextHash: input.liabilityContextHash,
        interestEligibility: input.interestEligibility,
        interestPolicyRef: input.interestPolicyRef,
        interestPolicyVersion: input.interestPolicyVersion,
        ruleRef: input.ruleRef,
        ruleVersion: input.ruleVersion,
        evidenceRefsContractVersion: input.evidenceRefsContractVersion,
        evidenceRefsCanonicalPayload: input.evidenceRefsCanonicalPayload,
        evidenceRefsHash: input.evidenceRefsHash,
        provenanceContractVersion: input.provenanceContractVersion,
        provenanceCanonicalPayload: input.provenanceCanonicalPayload,
        provenanceHash: input.provenanceHash,
      },
    });

    await this.audit.logInTransaction(tx, {
      tenantId: input.tenantId,
      action: 'OFFICE_APPROVAL_REQUESTED',
      entityType: 'OFFICE_APPROVAL',
      entityId: approval.id,
      userId: input.requesterUserId,
      correlationId: input.correlationId,
      metadata: {
        actionCode: approval.actionCode,
        targetType: approval.targetType,
        targetRef: approval.targetRef,
        status: approval.status,
        executionStatus: approval.executionStatus,
        payloadHash: approval.payloadHash,
        requesterUserId: approval.requesterUserId,
      },
    });

    return Object.freeze({ intent, approval, replayed: false });
  }

  private async findExisting(
    tenantId: string,
    idempotencyKey: string,
  ): Promise<{ intent: ClaimItemFormationIntent; approval: OfficeApprovalRequest | null } | null> {
    const intent = await this.prisma.claimItemFormationIntent.findUnique({
      where: { tenantId_idempotencyKey: { tenantId, idempotencyKey } },
    });
    if (!intent) return null;
    const approval = await this.prisma.officeApprovalRequest.findFirst({
      where: { id: intent.approvalRequestId, tenantId },
    });
    return { intent, approval };
  }

  private reconcileExisting(
    existing: {
      intent: ClaimItemFormationIntent;
      approval: OfficeApprovalRequest | null;
    },
    requestedIntentChecksum: string,
    requestedProjectionBinding: LegalBasisProjectionBindingPersistenceEnvelopeV1 | undefined,
  ): ClaimItemFormationAdmissionResult {
    if (
      existing.intent.intentChecksum !== requestedIntentChecksum ||
      existing.intent.legalBasisProjectionBindingContractVersion !==
        (requestedProjectionBinding?.contractVersion ?? null) ||
      existing.intent.legalBasisProjectionBindingCanonicalPayload !==
        (requestedProjectionBinding?.canonicalPayload ?? null) ||
      existing.intent.legalBasisProjectionBindingChecksum !==
        (requestedProjectionBinding?.checksum ?? null) ||
      !existing.approval ||
      existing.approval.targetType !== CLAIM_ITEM_FORMATION_APPROVAL_TARGET_TYPE ||
      existing.approval.targetRef !== existing.intent.id ||
      existing.approval.payloadHash !== existing.intent.approvalReferenceHash ||
      !this.matchesTypedReference(existing.approval.savedIntent, existing.intent)
    ) {
      throw new ClaimItemFormationAdmissionError('DUPLICATE_FORMATION_CONFLICT');
    }
    return Object.freeze({
      intent: existing.intent,
      approval: existing.approval,
      replayed: true,
    });
  }

  private matchesTypedReference(
    savedIntent: ClaimFormationJsonValue | Prisma.JsonValue,
    intent: ClaimItemFormationIntent,
  ): boolean {
    if (!savedIntent || typeof savedIntent !== 'object' || Array.isArray(savedIntent)) return false;
    const reference = savedIntent as Record<string, unknown>;
    return (
      reference.version === CLAIM_ITEM_FORMATION_APPROVAL_REF_VERSION &&
      reference.tenantId === intent.tenantId &&
      reference.caseId === intent.caseId &&
      reference.formationIntentId === intent.id &&
      reference.intentChecksum === intent.intentChecksum &&
      reference.sourceIdentityHash === intent.sourceIdentityHash &&
      stableJsonHash(savedIntent) === intent.approvalReferenceHash
    );
  }

  private approvalIdempotencyKey(intentIdempotencyKey: string): string {
    return `claim-item-formation:${intentIdempotencyKey}`;
  }

  private isUniqueConflict(error: unknown): boolean {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
  }
}
