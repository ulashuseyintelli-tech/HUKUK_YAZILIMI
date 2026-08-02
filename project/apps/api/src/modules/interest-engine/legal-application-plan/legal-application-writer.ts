import { CollectionStatus, Prisma } from '@prisma/client';
import { allocateValidatedSnapshotForApply } from './apply-allocation-core';
import { validateCanonicalSnapshot } from './canonical-snapshot-validator';
import type {
  BuildLegalApplicationPlanCommand,
  CanonicalSnapshotEnvelopeV1,
  LegalApplicationPlan,
  LegalApplicationPlanErrorCode,
  PlannedLegalApplication,
} from './contracts';
import { assembleLegalApplicationPlan } from './legal-application-plan-builder';

export const LEGAL_APPLICATION_WRITER_ERROR_CODES = [
  'WRITER_INPUT_INVALID',
  'WRITER_PLAN_REJECTED',
  'COLLECTION_CONTEXT_MISMATCH',
  'COLLECTION_NOT_CONFIRMED',
  'COLLECTION_CURRENCY_MISMATCH',
  'IDEMPOTENCY_KEY_CONFLICT',
  'COLLECTION_ALREADY_APPLIED',
  'PERSISTED_EVIDENCE_MISMATCH',
  'PERSISTENCE_CONFLICT',
  'PERSISTENCE_FAILURE',
] as const;

export type LegalApplicationWriterErrorCode =
  (typeof LEGAL_APPLICATION_WRITER_ERROR_CODES)[number];

export class LegalApplicationWriterError extends Error {
  constructor(
    readonly code: LegalApplicationWriterErrorCode,
    readonly planErrorCode?: LegalApplicationPlanErrorCode,
  ) {
    super(code);
    this.name = 'LegalApplicationWriterError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export interface WriteLegalApplicationPlanInput {
  readonly command: BuildLegalApplicationPlanCommand;
  readonly snapshotEnvelope: CanonicalSnapshotEnvelopeV1;
  /** Caller-owned transaction timestamp; the writer never reads an independent clock. */
  readonly createdAt: Date;
}

export interface WriteLegalApplicationPlanResult {
  readonly batchId: string;
  readonly replayed: boolean;
  readonly plan: LegalApplicationPlan;
}

interface PersistedApplicationEvidence {
  readonly componentType: PlannedLegalApplication['componentType'];
  readonly componentCode: string;
  readonly sourceLineageSetRef: string;
  readonly bucketContextKey: string;
  readonly bucketInstanceId: string;
  readonly sequence: number;
  readonly appliedAmountMinor: bigint;
  readonly bucketBeforeMinor: bigint;
  readonly bucketAfterMinor: bigint;
}

interface PersistedBatchEvidence {
  readonly id: string;
  readonly batchType: string;
  readonly currency: string;
  readonly receiptAmountMinor: bigint;
  readonly heldRemainderMinor: bigint;
  readonly snapshotContractVersion: string;
  readonly snapshotSerializationVersion: string;
  readonly snapshotRef: string;
  readonly snapshotHash: string;
  readonly snapshotCanonicalPayload: string;
  readonly sourceVersionSetHash: string;
  readonly snapshotAsOfDate: Date;
  readonly applicationEffectiveDate: Date;
  readonly historyBoundaryRef: string;
  readonly engineVersion: string;
  readonly calculationRuleVersion: string;
  readonly policyVersion: string;
  readonly rateTableVersion: string;
  readonly interpretationProfileId: string;
  readonly bucketIdentityVersion: string;
  readonly minorUnit: number;
  readonly commandHash: string;
  readonly reversesBatchId: string | null;
  readonly applications: readonly PersistedApplicationEvidence[];
}

const EXISTING_BATCH_SELECT = Prisma.validator<Prisma.LegalApplicationBatchSelect>()({
  id: true,
  batchType: true,
  currency: true,
  receiptAmountMinor: true,
  heldRemainderMinor: true,
  snapshotContractVersion: true,
  snapshotSerializationVersion: true,
  snapshotRef: true,
  snapshotHash: true,
  snapshotCanonicalPayload: true,
  sourceVersionSetHash: true,
  snapshotAsOfDate: true,
  applicationEffectiveDate: true,
  historyBoundaryRef: true,
  engineVersion: true,
  calculationRuleVersion: true,
  policyVersion: true,
  rateTableVersion: true,
  interpretationProfileId: true,
  bucketIdentityVersion: true,
  minorUnit: true,
  commandHash: true,
  reversesBatchId: true,
  applications: {
    orderBy: { sequence: 'asc' },
    select: {
      componentType: true,
      componentCode: true,
      sourceLineageSetRef: true,
      bucketContextKey: true,
      bucketInstanceId: true,
      sequence: true,
      appliedAmountMinor: true,
      bucketBeforeMinor: true,
      bucketAfterMinor: true,
    },
  },
});

function dateOnlyUtc(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function dateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function validCreatedAt(value: Date): boolean {
  return value instanceof Date && Number.isFinite(value.getTime());
}

function sameApplication(
  persisted: PersistedApplicationEvidence,
  planned: PlannedLegalApplication,
): boolean {
  return (
    persisted.componentType === planned.componentType &&
    persisted.componentCode === planned.componentCode &&
    persisted.sourceLineageSetRef === planned.sourceLineageSetRef &&
    persisted.bucketContextKey === planned.bucketContextKey &&
    persisted.bucketInstanceId === planned.bucketInstanceId &&
    persisted.sequence === planned.sequence &&
    persisted.appliedAmountMinor === planned.appliedAmountMinor &&
    persisted.bucketBeforeMinor === planned.bucketBeforeMinor &&
    persisted.bucketAfterMinor === planned.bucketAfterMinor
  );
}

function persistedEvidenceMatches(
  persisted: PersistedBatchEvidence,
  input: WriteLegalApplicationPlanInput,
  plan: LegalApplicationPlan,
): boolean {
  const snapshot = input.snapshotEnvelope.snapshot;
  return (
    persisted.batchType === 'APPLY' &&
    persisted.currency === plan.currency &&
    persisted.receiptAmountMinor === plan.receiptAmountMinor &&
    persisted.heldRemainderMinor === plan.heldRemainderMinor &&
    persisted.snapshotContractVersion === snapshot.snapshotContractVersion &&
    persisted.snapshotSerializationVersion === snapshot.snapshotSerializationVersion &&
    persisted.snapshotRef === plan.snapshotRef &&
    persisted.snapshotHash === plan.snapshotHash &&
    persisted.snapshotCanonicalPayload === input.snapshotEnvelope.canonicalPayload &&
    persisted.sourceVersionSetHash === plan.sourceVersionSetHash &&
    dateOnly(persisted.snapshotAsOfDate) === snapshot.snapshotAsOfDate &&
    dateOnly(persisted.applicationEffectiveDate) === plan.applicationEffectiveDate &&
    persisted.historyBoundaryRef === plan.historyBoundaryRef &&
    persisted.engineVersion === snapshot.engineVersion &&
    persisted.calculationRuleVersion === snapshot.calculationRuleVersion &&
    persisted.policyVersion === snapshot.policyVersion &&
    persisted.rateTableVersion === snapshot.rateTableVersion &&
    persisted.interpretationProfileId === snapshot.interpretationProfileId &&
    persisted.bucketIdentityVersion === snapshot.bucketIdentityVersion &&
    persisted.minorUnit === plan.minorUnit &&
    persisted.commandHash === input.command.commandHash &&
    persisted.reversesBatchId === null &&
    persisted.applications.length === plan.applications.length &&
    persisted.applications.every((application, index) =>
      sameApplication(application, plan.applications[index]),
    )
  );
}

function preparePlan(input: WriteLegalApplicationPlanInput): LegalApplicationPlan {
  if (!validCreatedAt(input.createdAt)) {
    throw new LegalApplicationWriterError('WRITER_INPUT_INVALID');
  }

  const validation = validateCanonicalSnapshot({
    direction: 'APPLY',
    command: {
      ...input.command,
      receiptAmountMinor: input.command.receiptAmountMinor.toString(),
    },
    snapshotEnvelope: input.snapshotEnvelope,
  });
  if (!validation.ok) {
    throw new LegalApplicationWriterError(
      'WRITER_PLAN_REJECTED',
      validation.error.code,
    );
  }

  const allocation = allocateValidatedSnapshotForApply({
    direction: 'APPLY',
    validatedSnapshot: validation.value,
    receiptAmountMinor: input.command.receiptAmountMinor,
  });
  if (!allocation.ok) {
    throw new LegalApplicationWriterError(
      'WRITER_PLAN_REJECTED',
      allocation.error.code,
    );
  }

  const assembled = assembleLegalApplicationPlan({
    direction: 'APPLY',
    command: input.command,
    validatedSnapshot: validation.value,
    allocationResult: allocation,
  });
  if (!assembled.ok) {
    throw new LegalApplicationWriterError(
      'WRITER_PLAN_REJECTED',
      assembled.error.code,
    );
  }
  return assembled.plan;
}

function mapPersistenceError(error: unknown): LegalApplicationWriterError {
  if (error instanceof LegalApplicationWriterError) {
    return error;
  }
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  ) {
    return new LegalApplicationWriterError('PERSISTENCE_CONFLICT');
  }
  return new LegalApplicationWriterError('PERSISTENCE_FAILURE');
}

/**
 * Dormant TPA-04D-I02 persistence boundary. This class is deliberately not a Nest provider.
 * It never opens a transaction and can only operate through the caller-owned transaction.
 */
export class LegalApplicationWriter {
  /**
   * Cagrildigi yerler:
   * - Production call-site yoktur; yalniz TPA-04D-I02 test/evidence harness'i cagirir.
   */
  async writeApply(
    transaction: Prisma.TransactionClient,
    input: WriteLegalApplicationPlanInput,
  ): Promise<WriteLegalApplicationPlanResult> {
    const plan = preparePlan(input);
    const snapshot = input.snapshotEnvelope.snapshot;

    try {
      await transaction.$executeRaw`
        /* TPA-04D-I02: caller-owned Collection transaction case lock */
        SELECT pg_advisory_xact_lock(hashtextextended(${input.command.caseId}, 0))
      `;

      const collection = await transaction.collection.findFirst({
        where: {
          id: input.command.collectionId,
          tenantId: input.command.tenantId,
          caseId: input.command.caseId,
        },
        select: {
          status: true,
          confirmedAt: true,
          currency: true,
        },
      });
      if (collection === null) {
        throw new LegalApplicationWriterError('COLLECTION_CONTEXT_MISMATCH');
      }
      if (
        collection.status !== CollectionStatus.CONFIRMED ||
        collection.confirmedAt === null
      ) {
        throw new LegalApplicationWriterError('COLLECTION_NOT_CONFIRMED');
      }
      if (collection.currency !== input.command.currency) {
        throw new LegalApplicationWriterError('COLLECTION_CURRENCY_MISMATCH');
      }

      const existing = await transaction.legalApplicationBatch.findUnique({
        where: {
          tenantId_idempotencyKey: {
            tenantId: input.command.tenantId,
            idempotencyKey: input.command.idempotencyKey,
          },
        },
        select: EXISTING_BATCH_SELECT,
      });
      if (existing !== null) {
        if (existing.commandHash !== input.command.commandHash) {
          throw new LegalApplicationWriterError('IDEMPOTENCY_KEY_CONFLICT');
        }
        if (!persistedEvidenceMatches(existing, input, plan)) {
          throw new LegalApplicationWriterError('PERSISTED_EVIDENCE_MISMATCH');
        }
        return Object.freeze({ batchId: existing.id, replayed: true, plan });
      }

      const priorApply = await transaction.legalApplicationBatch.findFirst({
        where: {
          tenantId: input.command.tenantId,
          collectionId: input.command.collectionId,
          batchType: 'APPLY',
        },
        select: { id: true },
      });
      if (priorApply !== null) {
        throw new LegalApplicationWriterError('COLLECTION_ALREADY_APPLIED');
      }

      const created = await transaction.legalApplicationBatch.create({
        data: {
          tenantId: plan.tenantId,
          caseId: plan.caseId,
          collectionId: plan.collectionId,
          batchType: 'APPLY',
          currency: plan.currency,
          receiptAmountMinor: plan.receiptAmountMinor,
          heldRemainderMinor: plan.heldRemainderMinor,
          snapshotContractVersion: snapshot.snapshotContractVersion,
          snapshotSerializationVersion: snapshot.snapshotSerializationVersion,
          snapshotRef: plan.snapshotRef,
          snapshotHash: plan.snapshotHash,
          snapshotCanonicalPayload: input.snapshotEnvelope.canonicalPayload,
          sourceVersionSetHash: plan.sourceVersionSetHash,
          snapshotAsOfDate: dateOnlyUtc(snapshot.snapshotAsOfDate),
          applicationEffectiveDate: dateOnlyUtc(plan.applicationEffectiveDate),
          historyBoundaryRef: plan.historyBoundaryRef,
          engineVersion: snapshot.engineVersion,
          calculationRuleVersion: snapshot.calculationRuleVersion,
          policyVersion: snapshot.policyVersion,
          rateTableVersion: snapshot.rateTableVersion,
          interpretationProfileId: snapshot.interpretationProfileId,
          bucketIdentityVersion: snapshot.bucketIdentityVersion,
          minorUnit: plan.minorUnit,
          idempotencyKey: input.command.idempotencyKey,
          commandHash: input.command.commandHash,
          reversesBatchId: null,
          createdAt: input.createdAt,
          ...(plan.applications.length === 0
            ? {}
            : {
                applications: {
                  create: plan.applications.map((application) => ({
                    componentType: application.componentType,
                    componentCode: application.componentCode,
                    sourceLineageSetRef: application.sourceLineageSetRef,
                    bucketContextKey: application.bucketContextKey,
                    bucketInstanceId: application.bucketInstanceId,
                    sequence: application.sequence,
                    appliedAmountMinor: application.appliedAmountMinor,
                    bucketBeforeMinor: application.bucketBeforeMinor,
                    bucketAfterMinor: application.bucketAfterMinor,
                    createdAt: input.createdAt,
                  })),
                },
              }),
        },
        select: { id: true },
      });

      return Object.freeze({ batchId: created.id, replayed: false, plan });
    } catch (error) {
      throw mapPersistenceError(error);
    }
  }
}
