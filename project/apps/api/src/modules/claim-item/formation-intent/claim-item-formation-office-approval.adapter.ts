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
  CLAIM_ITEM_FORMATION_BATCH_APPROVAL_REF_VERSION,
  CLAIM_ITEM_FORMATION_BATCH_APPROVAL_TARGET_TYPE,
  CLAIM_ITEM_FORMATION_BATCH_MAX_SIZE,
  CLAIM_ITEM_FORMATION_INTENT_CONTRACT_VERSION,
  ClaimItemFormationAdmissionError,
  type ClaimFormationJsonValue,
  type ClaimItemFormationApprovalRefV1,
  type ClaimItemFormationBatchApprovalRefV1,
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
  readonly sourceType: 'CASE_DOCUMENT' | 'CASE_INSTRUMENT';
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
  readonly legalBasisProjectionBinding: LegalBasisProjectionBindingPersistenceEnvelopeV1;
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

/**
 * K3 (owner GO 2026-09-28) — tek OfficeApproval talebine bağlı toplu formation. Kalemler onaydan ÖNCE yazılmaz;
 * yalnız değişmez intent'ler + tek onay talebi + tek talep denetimi aynı transaction'da oluşur.
 */
export interface PersistClaimItemFormationBatchInput {
  /** Toplu talebin idempotensi anahtarı (tekrarlanan istek aynı toplu talebi döner). */
  readonly batchIdempotencyKey: string;
  readonly items: readonly PersistClaimItemFormationIntentInput[];
  /**
   * Transaction içinde, İLK yazmadan önce çalışır (ör. talep sahibinin kilitli GÜNCEL yetkisi). Fırlatırsa hiçbir
   * satır yazılmaz.
   */
  readonly authorizeInTransaction?: (tx: Prisma.TransactionClient) => Promise<void>;
}

export interface ClaimItemFormationBatchAdmissionResult {
  readonly approval: OfficeApprovalRequest;
  readonly intents: readonly ClaimItemFormationIntent[];
  readonly replayed: boolean;
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
    if (!projectionBinding) {
      throw new ClaimItemFormationAdmissionError('INVALID_FORMATION_CONTEXT');
    }
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
    projectionBinding: LegalBasisProjectionBindingPersistenceEnvelopeV1,
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
      data: this.intentCreateData(input, projectionBinding, {
        formationIntentId,
        approvalRequestId,
        approvalReferenceVersion: CLAIM_ITEM_FORMATION_APPROVAL_REF_VERSION,
        approvalReferenceHash: payloadHash,
        approvalBatchPosition: 0,
      }),
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

  /** Tekli ve toplu yolun ORTAK intent satırı (alan eşlemesi tek yerde). */
  private intentCreateData(
    input: PersistClaimItemFormationIntentInput,
    projectionBinding: LegalBasisProjectionBindingPersistenceEnvelopeV1,
    binding: {
      readonly formationIntentId: string;
      readonly approvalRequestId: string;
      readonly approvalReferenceVersion: string;
      readonly approvalReferenceHash: string;
      readonly approvalBatchPosition: number;
    },
  ): Prisma.ClaimItemFormationIntentUncheckedCreateInput {
    return {
      id: binding.formationIntentId,
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
      approvalRequestId: binding.approvalRequestId,
      approvalReferenceVersion: binding.approvalReferenceVersion,
      approvalReferenceHash: binding.approvalReferenceHash,
      approvalBatchPosition: binding.approvalBatchPosition,
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
        projectionBinding.contractVersion,
      legalBasisProjectionBindingCanonicalPayload:
        projectionBinding.canonicalPayload,
      legalBasisProjectionBindingChecksum: projectionBinding.checksum,
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
    };
  }

  /**
   * K3 — toplu formation: tek onay talebi (hedef CLAIM_ITEM_FORMATION_BATCH, değişmez toplu referans) + N intent
   * (konum 0..N-1) + tek talep denetimi, TEK transaction. Aynı `batchIdempotencyKey` ile tekrar → aynı talep
   * (replayed); farklı içerik → DUPLICATE_FORMATION_CONFLICT. Eşzamanlı çift istekte biri yazar, diğeri P2002 sonrası
   * mevcut toplu talebi uzlaştırır.
   */
  async createBatchAtomic(
    input: PersistClaimItemFormationBatchInput,
  ): Promise<ClaimItemFormationBatchAdmissionResult> {
    const bindings = this.validateBatch(input);
    try {
      return await this.prisma.$transaction(async (tx) =>
        this.createBatchInTransaction(tx, input, bindings),
      );
    } catch (error) {
      if (!this.isUniqueConflict(error)) throw error;
      const existing = await this.findExistingBatch(
        this.prisma,
        input.items[0].tenantId,
        input.batchIdempotencyKey,
      );
      if (!existing) throw error;
      return this.reconcileBatch(existing, input.items, bindings);
    }
  }

  private validateBatch(
    input: PersistClaimItemFormationBatchInput,
  ): LegalBasisProjectionBindingPersistenceEnvelopeV1[] {
    const items = input.items;
    if (
      !Array.isArray(items) ||
      items.length < 1 ||
      items.length > CLAIM_ITEM_FORMATION_BATCH_MAX_SIZE ||
      !/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/.test(input.batchIdempotencyKey)
    ) {
      throw new ClaimItemFormationAdmissionError('INVALID_FORMATION_CONTEXT');
    }
    const first = items[0];
    const sameScope = items.every(
      (item) =>
        item.tenantId === first.tenantId &&
        item.caseId === first.caseId &&
        item.requesterUserId === first.requesterUserId &&
        item.correlationId === first.correlationId &&
        item.createdAt.getTime() === first.createdAt.getTime() &&
        item.expiresAt.getTime() === first.expiresAt.getTime(),
    );
    if (
      !sameScope ||
      new Set(items.map((item) => item.idempotencyKey)).size !== items.length ||
      new Set(items.map((item) => item.sourceIdentityHash)).size !== items.length
    ) {
      throw new ClaimItemFormationAdmissionError('INVALID_FORMATION_CONTEXT');
    }
    return items.map((item) => {
      const binding = validateLegalBasisProjectionBindingPersistenceEnvelope(
        item.legalBasisProjectionBinding,
      );
      if (!binding) throw new ClaimItemFormationAdmissionError('INVALID_FORMATION_CONTEXT');
      return binding;
    });
  }

  private async createBatchInTransaction(
    tx: Prisma.TransactionClient,
    input: PersistClaimItemFormationBatchInput,
    bindings: readonly LegalBasisProjectionBindingPersistenceEnvelopeV1[],
  ): Promise<ClaimItemFormationBatchAdmissionResult> {
    const first = input.items[0];
    if (input.authorizeInTransaction) await input.authorizeInTransaction(tx);

    const existing = await this.findExistingBatch(tx, first.tenantId, input.batchIdempotencyKey);
    if (existing) return this.reconcileBatch(existing, input.items, bindings);

    const reusedKey = await tx.claimItemFormationIntent.findFirst({
      where: {
        tenantId: first.tenantId,
        idempotencyKey: { in: input.items.map((item) => item.idempotencyKey) },
      },
      select: { id: true },
    });
    if (reusedKey) {
      // Eşzamanlı aynı istek: diğer transaction bu arada commit etmiş olabilir (READ COMMITTED) → toplu kaydı yeniden
      // oku ve aynı içerikse replay olarak uzlaştır; yoksa anahtar başka bir içeriğe bağlıdır.
      const committed = await this.findExistingBatch(tx, first.tenantId, input.batchIdempotencyKey);
      if (committed) return this.reconcileBatch(committed, input.items, bindings);
      throw new ClaimItemFormationAdmissionError('DUPLICATE_FORMATION_CONFLICT');
    }

    const batchId = randomUUID();
    const approvalRequestId = randomUUID();
    const intentIds = input.items.map(() => randomUUID());
    const savedIntent: ClaimItemFormationBatchApprovalRefV1 = Object.freeze({
      version: CLAIM_ITEM_FORMATION_BATCH_APPROVAL_REF_VERSION,
      tenantId: first.tenantId,
      caseId: first.caseId,
      batchId,
      items: Object.freeze(
        input.items.map((item, position) =>
          Object.freeze({
            position,
            formationIntentId: intentIds[position],
            intentChecksum: item.intentChecksum,
            sourceIdentityHash: item.sourceIdentityHash,
          }),
        ),
      ),
    });
    const payloadHash = stableJsonHash(savedIntent as unknown as ClaimFormationJsonValue);

    const approval = await tx.officeApprovalRequest.create({
      data: {
        id: approvalRequestId,
        tenantId: first.tenantId,
        actionCode: CLAIM_ITEM_HIGH_IMPACT_ACTION_CODE,
        targetType: CLAIM_ITEM_FORMATION_BATCH_APPROVAL_TARGET_TYPE,
        targetRef: batchId,
        requesterUserId: first.requesterUserId,
        status: OfficeApprovalStatus.PENDING_APPROVAL,
        executionStatus: OfficeApprovalExecutionStatus.NOT_RUN,
        savedIntent: savedIntent as unknown as Prisma.JsonObject,
        payloadHash,
        reason: null,
        idempotencyKey: this.batchApprovalIdempotencyKey(input.batchIdempotencyKey),
        expiresAt: first.expiresAt,
      },
    });

    const intents: ClaimItemFormationIntent[] = [];
    for (const [position, item] of input.items.entries()) {
      intents.push(
        await tx.claimItemFormationIntent.create({
          data: this.intentCreateData(item, bindings[position], {
            formationIntentId: intentIds[position],
            approvalRequestId,
            approvalReferenceVersion: CLAIM_ITEM_FORMATION_BATCH_APPROVAL_REF_VERSION,
            approvalReferenceHash: payloadHash,
            approvalBatchPosition: position,
          }),
        }),
      );
    }

    await this.audit.logInTransaction(tx, {
      tenantId: first.tenantId,
      action: 'OFFICE_APPROVAL_REQUESTED',
      entityType: 'OFFICE_APPROVAL',
      entityId: approval.id,
      userId: first.requesterUserId,
      correlationId: first.correlationId,
      metadata: {
        actionCode: approval.actionCode,
        targetType: approval.targetType,
        targetRef: approval.targetRef,
        status: approval.status,
        executionStatus: approval.executionStatus,
        payloadHash: approval.payloadHash,
        requesterUserId: approval.requesterUserId,
        batchSize: intents.length,
      },
    });

    return Object.freeze({ approval, intents: Object.freeze(intents), replayed: false });
  }

  private async findExistingBatch(
    db: Prisma.TransactionClient | PrismaService,
    tenantId: string,
    batchIdempotencyKey: string,
  ): Promise<{ approval: OfficeApprovalRequest; intents: ClaimItemFormationIntent[] } | null> {
    const approval = await db.officeApprovalRequest.findUnique({
      where: {
        tenantId_idempotencyKey: {
          tenantId,
          idempotencyKey: this.batchApprovalIdempotencyKey(batchIdempotencyKey),
        },
      },
    });
    if (!approval) return null;
    const intents = await db.claimItemFormationIntent.findMany({
      where: { tenantId, approvalRequestId: approval.id },
      orderBy: { approvalBatchPosition: 'asc' },
    });
    return { approval, intents };
  }

  private reconcileBatch(
    existing: { approval: OfficeApprovalRequest; intents: ClaimItemFormationIntent[] },
    requested: readonly PersistClaimItemFormationIntentInput[],
    bindings: readonly LegalBasisProjectionBindingPersistenceEnvelopeV1[],
  ): ClaimItemFormationBatchAdmissionResult {
    const { approval, intents } = existing;
    const reference = approval.savedIntent as unknown as ClaimItemFormationBatchApprovalRefV1 | null;
    const consistent =
      approval.targetType === CLAIM_ITEM_FORMATION_BATCH_APPROVAL_TARGET_TYPE &&
      approval.actionCode === CLAIM_ITEM_HIGH_IMPACT_ACTION_CODE &&
      !!reference &&
      reference.version === CLAIM_ITEM_FORMATION_BATCH_APPROVAL_REF_VERSION &&
      approval.targetRef === reference.batchId &&
      stableJsonHash(approval.savedIntent as ClaimFormationJsonValue) === approval.payloadHash &&
      Array.isArray(reference.items) &&
      reference.items.length === requested.length &&
      intents.length === requested.length &&
      intents.every((intent, position) => {
        const item = requested[position];
        const ref = reference.items[position];
        return (
          intent.approvalBatchPosition === position &&
          intent.approvalReferenceVersion === CLAIM_ITEM_FORMATION_BATCH_APPROVAL_REF_VERSION &&
          intent.approvalReferenceHash === approval.payloadHash &&
          intent.intentChecksum === item.intentChecksum &&
          intent.idempotencyKey === item.idempotencyKey &&
          intent.legalBasisProjectionBindingContractVersion === bindings[position].contractVersion &&
          intent.legalBasisProjectionBindingCanonicalPayload === bindings[position].canonicalPayload &&
          intent.legalBasisProjectionBindingChecksum === bindings[position].checksum &&
          ref?.position === position &&
          ref?.formationIntentId === intent.id &&
          ref?.intentChecksum === intent.intentChecksum &&
          ref?.sourceIdentityHash === intent.sourceIdentityHash
        );
      });
    if (!consistent) throw new ClaimItemFormationAdmissionError('DUPLICATE_FORMATION_CONFLICT');
    return Object.freeze({ approval, intents: Object.freeze([...intents]), replayed: true });
  }

  private batchApprovalIdempotencyKey(batchIdempotencyKey: string): string {
    return `claim-item-formation-batch:${batchIdempotencyKey}`;
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
    requestedProjectionBinding: LegalBasisProjectionBindingPersistenceEnvelopeV1,
  ): ClaimItemFormationAdmissionResult {
    if (
      existing.intent.intentChecksum !== requestedIntentChecksum ||
      existing.intent.legalBasisProjectionBindingContractVersion !==
        requestedProjectionBinding.contractVersion ||
      existing.intent.legalBasisProjectionBindingCanonicalPayload !==
        requestedProjectionBinding.canonicalPayload ||
      existing.intent.legalBasisProjectionBindingChecksum !==
        requestedProjectionBinding.checksum ||
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
