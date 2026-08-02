import { randomUUID } from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import { describeDb } from '../../../../../test/describe-db';
import type { BuildLegalApplicationPlanCommand } from '../contracts';
import {
  LegalApplicationWriter,
  type WriteLegalApplicationPlanInput,
} from '../legal-application-writer';
import {
  OFFICIAL_SNAPSHOT_READ_CONTRACT_VERSION,
  produceOfficialReceivableSnapshotFromReadModel,
  type OfficialReceivableSnapshotReadModelV1,
  type ProduceOfficialSnapshotCommandV1,
} from '../official-receivable-snapshot-producer';
import {
  parseCaseId,
  parseCollectionId,
  parseCommandHash,
  parseCurrencyCode,
  parseEffectiveDate,
  parseHistoryBoundaryRef,
  parseIdempotencyKey,
  parseMinorUnit,
  parseReceiptAmountMinor,
  parseSnapshotHash,
  parseSnapshotRef,
  parseSourceVersionSetHash,
  parseTenantId,
  type ParseResult,
} from '../primitives';

const CREATED_AT = new Date('2026-08-02T00:00:00.000Z');

function must<T>(result: ParseResult<T>): T {
  if (!result.ok) {
    throw new Error(`${result.error.field}:${result.error.code}`);
  }
  return result.value;
}

function officialWriterInput(label: string): WriteLegalApplicationPlanInput {
  const suffix = `${label}-${randomUUID().slice(0, 8)}`;
  const producerCommand: ProduceOfficialSnapshotCommandV1 = {
    tenantId: `t12-tenant-${suffix}`,
    caseId: `t12-case-${suffix}`,
    targetCollectionId: `t12-collection-${suffix}`,
    receiptAmountMinor: '1000',
    currency: 'TRY',
    minorUnit: 2,
    snapshotAsOfDate: '2026-08-02',
    applicationEffectiveDate: '2026-08-02',
  };
  const readModel: OfficialReceivableSnapshotReadModelV1 = {
    readContractVersion: OFFICIAL_SNAPSHOT_READ_CONTRACT_VERSION,
    readConsistency: 'SINGLE_TRANSACTION',
    sourceConcurrencySafe: true,
    identityInputProvenance: 'FINAL_SNAPSHOT_INDEPENDENT',
    tenantId: producerCommand.tenantId,
    caseId: producerCommand.caseId,
    snapshotAsOfDate: producerCommand.snapshotAsOfDate,
    applicationEffectiveDate: producerCommand.applicationEffectiveDate,
    historyBoundaryRef: `history-boundary:t12:${suffix}`,
    engineVersion: 'receivable-engine:v1',
    calculationRuleVersion: 'calculation-rule:v1',
    policyVersion: 'tbk100-policy:v1',
    rateTableVersion: 'rate-table:v1',
    interpretationProfileId: 'interpretation-profile:v1',
    formationContextAvailable: true,
    targetCollection: {
      collectionId: producerCommand.targetCollectionId,
      tenantId: producerCommand.tenantId,
      caseId: producerCommand.caseId,
      status: 'CONFIRMED',
      canonicalAdmission: 'PASSED',
      finality: 'FINAL',
      receiptAmountMinor: producerCommand.receiptAmountMinor,
      currency: producerCommand.currency,
      minorUnit: producerCommand.minorUnit,
      sourceReference: `collection:${producerCommand.targetCollectionId}`,
      sourceVersion: 'confirmed:v1',
    },
    receivableSources: [
      {
        sourceReference: `formation:${producerCommand.caseId}`,
        sourceVersion: 'formation:v1',
      },
    ],
    collectionHistory: [],
    applicationHistory: [],
    buckets: [
      {
        componentType: 'ACCRUED_INTEREST',
        componentCode: 'INTEREST_DEFAULT',
        sourceLineageSetRef: `lineage:interest:${suffix}`,
        legalBasisRef: 'legal-basis:tbk100:v1',
        effectiveContextRef: 'effective-period:2026-08',
        interestRuleRef: 'interest-rule:default:v1',
        priorityPolicyRef: 'priority-policy:tbk100',
        priorityPolicyVersion: 'v1',
        priorityRank: 30,
        liabilityContextRef: `liability:interest:${suffix}`,
        currency: producerCommand.currency,
        minorUnit: producerCommand.minorUnit,
        bucketBalanceMinor: '250',
      },
      {
        componentType: 'PRINCIPAL',
        componentCode: 'PRINCIPAL_STANDARD',
        sourceLineageSetRef: `lineage:principal:${suffix}`,
        legalBasisRef: 'legal-basis:tbk100:v1',
        effectiveContextRef: 'effective-period:2026-08',
        priorityPolicyRef: 'priority-policy:tbk100',
        priorityPolicyVersion: 'v1',
        priorityRank: 40,
        liabilityContextRef: `liability:principal:${suffix}`,
        currency: producerCommand.currency,
        minorUnit: producerCommand.minorUnit,
        bucketBalanceMinor: '2000',
      },
    ],
    legacyAuthority: {
      evidenceCompleteness: 'PROVEN',
      claimItemCollectedAmount: 'NON_AUTHORITATIVE',
      ledgerAllocation: 'NON_AUTHORITATIVE',
      collectionAllocation: 'NON_AUTHORITATIVE',
    },
  };
  const produced = produceOfficialReceivableSnapshotFromReadModel(
    producerCommand,
    readModel,
  );
  if (!produced.ok) {
    throw new Error(produced.error.code);
  }
  const snapshot = produced.snapshotEnvelope.snapshot;
  const command: BuildLegalApplicationPlanCommand = Object.freeze({
    tenantId: must(parseTenantId(producerCommand.tenantId)),
    caseId: must(parseCaseId(producerCommand.caseId)),
    collectionId: must(parseCollectionId(producerCommand.targetCollectionId)),
    receiptAmountMinor: must(
      parseReceiptAmountMinor(producerCommand.receiptAmountMinor),
    ),
    currency: must(parseCurrencyCode(producerCommand.currency)),
    minorUnit: must(parseMinorUnit(producerCommand.minorUnit)),
    applicationEffectiveDate: must(
      parseEffectiveDate(producerCommand.applicationEffectiveDate),
    ),
    expectedSnapshotRef: must(parseSnapshotRef(produced.snapshotEnvelope.snapshotRef)),
    expectedSnapshotHash: must(
      parseSnapshotHash(produced.snapshotEnvelope.snapshotHash),
    ),
    expectedSourceVersionSetHash: must(
      parseSourceVersionSetHash(snapshot.sourceVersionSetHash),
    ),
    expectedHistoryBoundaryRef: must(
      parseHistoryBoundaryRef(snapshot.historyBoundaryRef),
    ),
    idempotencyKey: must(parseIdempotencyKey(`t12-writer:${suffix}`)),
    commandHash: must(parseCommandHash(`t12-command:${suffix}`)),
  });
  return Object.freeze({
    command,
    snapshotEnvelope: produced.snapshotEnvelope,
    createdAt: CREATED_AT,
  });
}

describeDb('TPA-04D-I02 dormant writer — real PostgreSQL', () => {
  const prisma = new PrismaClient();
  const writer = new LegalApplicationWriter();

  async function seedFoundation(input: WriteLegalApplicationPlanInput): Promise<void> {
    await prisma.tenant.create({
      data: {
        id: input.command.tenantId,
        name: input.command.tenantId,
        slug: input.command.tenantId,
      },
    });
    await prisma.case.create({
      data: {
        id: input.command.caseId,
        tenantId: input.command.tenantId,
        fileNumber: input.command.caseId,
        type: 'GENERAL_EXECUTION',
      },
    });
    await prisma.collection.create({
      data: {
        id: input.command.collectionId,
        tenantId: input.command.tenantId,
        caseId: input.command.caseId,
        amount: new Prisma.Decimal('10.00'),
        currency: input.command.currency,
        type: 'TAHSILAT',
        date: CREATED_AT,
        status: 'CONFIRMED',
        confirmedAt: CREATED_AT,
        idempotencyKey: `t12-source:${input.command.collectionId}`,
      },
    });
  }

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('commits batch and applications atomically under the database constraints', async () => {
    const input = officialWriterInput('atomic');
    await seedFoundation(input);

    const result = await prisma.$transaction((transaction) =>
      writer.writeApply(transaction, input),
    );
    expect(result.replayed).toBe(false);

    const persisted = await prisma.legalApplicationBatch.findUniqueOrThrow({
      where: { id: result.batchId },
      include: { applications: { orderBy: { sequence: 'asc' } } },
    });
    const applied = persisted.applications.reduce(
      (sum, application) => sum + application.appliedAmountMinor,
      0n,
    );
    expect(persisted.receiptAmountMinor).toBe(
      applied + persisted.heldRemainderMinor,
    );
    expect(persisted.applications).toHaveLength(result.plan.applications.length);
    expect(persisted.applications.map((application) => application.bucketInstanceId)).toEqual(
      result.plan.applications.map((application) => application.bucketInstanceId),
    );
  });

  it('leaves no partial legal evidence when the caller-owned transaction rolls back', async () => {
    const input = officialWriterInput('rollback');
    await seedFoundation(input);

    await expect(
      prisma.$transaction(async (transaction) => {
        await writer.writeApply(transaction, input);
        throw new Error('injected-after-writer');
      }),
    ).rejects.toThrow('injected-after-writer');

    expect(
      await prisma.legalApplicationBatch.count({
        where: {
          tenantId: input.command.tenantId,
          collectionId: input.command.collectionId,
        },
      }),
    ).toBe(0);
  });

  it('serializes concurrent identical commands into one create and one replay', async () => {
    const input = officialWriterInput('concurrency');
    await seedFoundation(input);
    const left = new PrismaClient();
    const right = new PrismaClient();
    try {
      const results = await Promise.all([
        left.$transaction((transaction) => writer.writeApply(transaction, input)),
        right.$transaction((transaction) => writer.writeApply(transaction, input)),
      ]);
      expect(results.map((result) => result.replayed).sort()).toEqual([false, true]);
      expect(new Set(results.map((result) => result.batchId)).size).toBe(1);
      expect(
        await prisma.legalApplicationBatch.count({
          where: {
            tenantId: input.command.tenantId,
            collectionId: input.command.collectionId,
          },
        }),
      ).toBe(1);
    } finally {
      await Promise.all([left.$disconnect(), right.$disconnect()]);
    }
  });
});
