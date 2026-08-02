import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  LEGAL_APPLICATION_COMPONENT_RANKS,
  LEGAL_APPLICATION_COMPONENT_TYPES,
  LEGAL_APPLICATION_PLAN_HELD_NONE,
  SNAPSHOT_CONTRACT_VERSION,
  SNAPSHOT_SERIALIZATION_VERSION,
  allocateValidatedSnapshotForApply,
  assembleLegalApplicationPlan,
  fingerprintLegalApplicationPlan,
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
  validateCanonicalSnapshot,
  type BuildLegalApplicationPlanCommand,
  type CanonicalPlanHeldReason,
  type LegalApplicationPlan,
  type LegalApplicationPlanSuccess,
  type ParseResult,
  type PlannedLegalApplication,
  type ValidatedCanonicalSnapshotV1,
} from '..';
import {
  canonicalSnapshotRefForHash,
  computeCanonicalSnapshotHash,
  serializeCanonicalJson,
} from '../canonical-snapshot-serializer';
import type { StrictJsonValue } from '../strict-json-parser';

type MutableJsonObject = Record<string, StrictJsonValue>;

const API_ROOT = join(__dirname, '../../../../..');
const SCHEMA = readFileSync(join(API_ROOT, 'prisma/schema.prisma'), 'utf8');
const FOUNDATION_MIGRATION = readFileSync(
  join(
    API_ROOT,
    'prisma/migrations/20260720174245_legal_application_batch_foundation/migration.sql',
  ),
  'utf8',
);
const EVIDENCE_MIGRATION = readFileSync(
  join(
    API_ROOT,
    'prisma/migrations/20260721002219_legal_application_writer_evidence/migration.sql',
  ),
  'utf8',
);
const SOURCE_VERSION_SET_HASH = 'c'.repeat(64);
const CREATED_AT = '2026-07-24T00:00:00.000Z';

function valueOf<T>(result: ParseResult<T>): T {
  if (!result.ok) {
    throw new Error(`${result.error.field}:${result.error.code}`);
  }
  return result.value;
}

function contextKey(index: number): string {
  return `bctx:v1:sha256:${index.toString(16).padStart(64, '0')}`;
}

function instanceId(index: number): string {
  return `binst:v1:sha256:${(index + 10_000).toString(16).padStart(64, '0')}`;
}

function bucket(
  index: number,
  componentType: (typeof LEGAL_APPLICATION_COMPONENT_TYPES)[number],
  balanceMinor: bigint,
): MutableJsonObject {
  return {
    componentType,
    componentCode: `${componentType}-${index}`,
    bucketContextKey: contextKey(index),
    bucketInstanceId: instanceId(index),
    sourceLineageSetRef: `lineage:${index}`,
    legalBasisRef: 'TBK-100',
    effectivePeriodRef: '2026-07',
    currency: 'TRY',
    minorUnit: 2,
    priorityRank: LEGAL_APPLICATION_COMPONENT_RANKS[componentType],
    bucketBalanceMinor: balanceMinor.toString(),
  };
}

interface PlanFixture {
  readonly command: BuildLegalApplicationPlanCommand;
  readonly validatedSnapshot: ValidatedCanonicalSnapshotV1;
  readonly result: LegalApplicationPlanSuccess;
}

function fixture(
  canonicalBuckets: readonly MutableJsonObject[],
  receiptAmountMinor: bigint,
): PlanFixture {
  const snapshot: MutableJsonObject = {
    snapshotContractVersion: SNAPSHOT_CONTRACT_VERSION,
    snapshotSerializationVersion: SNAPSHOT_SERIALIZATION_VERSION,
    tenantId: 'tenant-i06',
    caseId: 'case-i06',
    targetCollectionId: 'collection-i06',
    currency: 'TRY',
    minorUnit: 2,
    receiptAmountMinor: receiptAmountMinor.toString(),
    snapshotAsOfDate: '2026-07-24',
    applicationEffectiveDate: '2026-07-24',
    historyBoundaryRef: 'history:i06',
    engineVersion: 'engine-v1',
    calculationRuleVersion: 'rule-v1',
    policyVersion: 'policy-v1',
    rateTableVersion: 'rate-v1',
    interpretationProfileId: 'interpretation-v1',
    bucketIdentityVersion: 'bucket-v1',
    sourceVersionSet: [{ sourceReference: 'source:i06', sourceVersion: '1' }],
    sourceVersionSetHash: SOURCE_VERSION_SET_HASH,
    canonicalBuckets: [...canonicalBuckets],
  };
  const canonicalPayload = serializeCanonicalJson(snapshot);
  const snapshotHash = computeCanonicalSnapshotHash(Buffer.from(canonicalPayload, 'utf8'));
  const snapshotRef = canonicalSnapshotRefForHash(snapshotHash);
  const commandHash = createHash('sha256').update('command:i06').digest('hex');
  const rawCommand = {
    tenantId: snapshot.tenantId,
    caseId: snapshot.caseId,
    collectionId: snapshot.targetCollectionId,
    receiptAmountMinor: snapshot.receiptAmountMinor,
    currency: snapshot.currency,
    minorUnit: snapshot.minorUnit,
    applicationEffectiveDate: snapshot.applicationEffectiveDate,
    expectedSnapshotRef: snapshotRef,
    expectedSnapshotHash: snapshotHash,
    expectedSourceVersionSetHash: snapshot.sourceVersionSetHash,
    expectedHistoryBoundaryRef: snapshot.historyBoundaryRef,
    idempotencyKey: 'idempotency:i06',
    commandHash,
  };
  const validation = validateCanonicalSnapshot({
    direction: 'APPLY',
    command: rawCommand,
    snapshotEnvelope: { snapshotRef, snapshotHash, canonicalPayload },
  });
  if (!validation.ok) {
    throw new Error(`fixture validation failed: ${validation.error.code}`);
  }

  const command: BuildLegalApplicationPlanCommand = Object.freeze({
    tenantId: valueOf(parseTenantId(rawCommand.tenantId)),
    caseId: valueOf(parseCaseId(rawCommand.caseId)),
    collectionId: valueOf(parseCollectionId(rawCommand.collectionId)),
    receiptAmountMinor: valueOf(parseReceiptAmountMinor(rawCommand.receiptAmountMinor)),
    currency: valueOf(parseCurrencyCode(rawCommand.currency)),
    minorUnit: valueOf(parseMinorUnit(rawCommand.minorUnit)),
    applicationEffectiveDate: valueOf(
      parseEffectiveDate(rawCommand.applicationEffectiveDate),
    ),
    expectedSnapshotRef: valueOf(parseSnapshotRef(rawCommand.expectedSnapshotRef)),
    expectedSnapshotHash: valueOf(parseSnapshotHash(rawCommand.expectedSnapshotHash)),
    expectedSourceVersionSetHash: valueOf(
      parseSourceVersionSetHash(rawCommand.expectedSourceVersionSetHash),
    ),
    expectedHistoryBoundaryRef: valueOf(
      parseHistoryBoundaryRef(rawCommand.expectedHistoryBoundaryRef),
    ),
    idempotencyKey: valueOf(parseIdempotencyKey(rawCommand.idempotencyKey)),
    commandHash: valueOf(parseCommandHash(rawCommand.commandHash)),
  });
  const allocation = allocateValidatedSnapshotForApply({
    validatedSnapshot: validation.value,
    direction: 'APPLY',
    receiptAmountMinor: command.receiptAmountMinor,
  });
  const firstAllocation = allocation.ok ? allocation.allocations[0] : undefined;
  const result = assembleLegalApplicationPlan({
    direction: 'APPLY',
    command,
    validatedSnapshot: validation.value,
    allocationResult: allocation,
    attributions:
      firstAllocation === undefined
        ? undefined
        : [
            {
              bucketInstanceId: firstAllocation.bucketInstanceId,
              sourceLineageSetRef: firstAllocation.sourceLineageSetRef,
              attributedAmountMinor: firstAllocation.appliedAmountMinor,
            },
          ],
  });
  if (!result.ok) {
    throw new Error(`fixture assembly failed: ${result.error.code}`);
  }
  return Object.freeze({ command, validatedSnapshot: validation.value, result });
}

interface BatchDraft {
  readonly id: string;
  readonly tenantId: LegalApplicationPlan['tenantId'];
  readonly caseId: LegalApplicationPlan['caseId'];
  readonly collectionId: LegalApplicationPlan['collectionId'];
  readonly batchType: LegalApplicationPlan['direction'];
  readonly currency: LegalApplicationPlan['currency'];
  readonly receiptAmountMinor: LegalApplicationPlan['receiptAmountMinor'];
  readonly heldRemainderMinor: LegalApplicationPlan['heldRemainderMinor'];
  readonly snapshotContractVersion: ValidatedCanonicalSnapshotV1['snapshot']['snapshotContractVersion'];
  readonly snapshotSerializationVersion: ValidatedCanonicalSnapshotV1['snapshot']['snapshotSerializationVersion'];
  readonly snapshotRef: LegalApplicationPlan['snapshotRef'];
  readonly snapshotHash: LegalApplicationPlan['snapshotHash'];
  readonly snapshotCanonicalPayload: string;
  readonly sourceVersionSetHash: LegalApplicationPlan['sourceVersionSetHash'];
  readonly snapshotAsOfDate: ValidatedCanonicalSnapshotV1['snapshot']['snapshotAsOfDate'];
  readonly applicationEffectiveDate: LegalApplicationPlan['applicationEffectiveDate'];
  readonly historyBoundaryRef: LegalApplicationPlan['historyBoundaryRef'];
  readonly engineVersion: ValidatedCanonicalSnapshotV1['snapshot']['engineVersion'];
  readonly calculationRuleVersion: ValidatedCanonicalSnapshotV1['snapshot']['calculationRuleVersion'];
  readonly policyVersion: ValidatedCanonicalSnapshotV1['snapshot']['policyVersion'];
  readonly rateTableVersion: ValidatedCanonicalSnapshotV1['snapshot']['rateTableVersion'];
  readonly interpretationProfileId: ValidatedCanonicalSnapshotV1['snapshot']['interpretationProfileId'];
  readonly bucketIdentityVersion: ValidatedCanonicalSnapshotV1['snapshot']['bucketIdentityVersion'];
  readonly minorUnit: LegalApplicationPlan['minorUnit'];
  readonly idempotencyKey: BuildLegalApplicationPlanCommand['idempotencyKey'];
  readonly commandHash: BuildLegalApplicationPlanCommand['commandHash'];
  readonly reversesBatchId: null;
  readonly createdAt: string;
}

interface ApplicationDraft {
  readonly id: string;
  readonly tenantId: LegalApplicationPlan['tenantId'];
  readonly batchId: string;
  readonly componentType: PlannedLegalApplication['componentType'];
  readonly componentCode: PlannedLegalApplication['componentCode'];
  readonly sourceLineageSetRef: PlannedLegalApplication['sourceLineageSetRef'];
  readonly bucketContextKey: PlannedLegalApplication['bucketContextKey'];
  readonly bucketInstanceId: PlannedLegalApplication['bucketInstanceId'];
  readonly sequence: number;
  readonly appliedAmountMinor: PlannedLegalApplication['appliedAmountMinor'];
  readonly bucketBeforeMinor: PlannedLegalApplication['bucketBeforeMinor'];
  readonly bucketAfterMinor: PlannedLegalApplication['bucketAfterMinor'];
  readonly createdAt: string;
}

interface AttributionDraft {
  readonly id: string;
  readonly tenantId: LegalApplicationPlan['tenantId'];
  readonly batchId: string;
  readonly applicationId: string;
  readonly claimItemId: null;
  readonly attributedAmountMinor: PlannedLegalApplication['appliedAmountMinor'] | null;
  readonly createdAt: string;
}

interface PersistenceDraft {
  readonly batch: BatchDraft;
  readonly applications: readonly ApplicationDraft[];
  readonly attributions: readonly AttributionDraft[];
}

/**
 * Test-only compatibility projection. This is deliberately not exported and does not write.
 * I06 proves that the closed I04 plan and snapshot facts fit the TPA-04B persistence contract.
 */
function toPersistenceDraft(value: PlanFixture): PersistenceDraft {
  const { command, validatedSnapshot, result } = value;
  const { plan } = result;
  const batchId = 'batch:i06';
  const applications = plan.applications.map((application, index) =>
    Object.freeze({
      id: `application:i06:${index + 1}`,
      tenantId: plan.tenantId,
      batchId,
      componentType: application.componentType,
      componentCode: application.componentCode,
      sourceLineageSetRef: application.sourceLineageSetRef,
      bucketContextKey: application.bucketContextKey,
      bucketInstanceId: application.bucketInstanceId,
      sequence: application.sequence,
      appliedAmountMinor: application.appliedAmountMinor,
      bucketBeforeMinor: application.bucketBeforeMinor,
      bucketAfterMinor: application.bucketAfterMinor,
      createdAt: CREATED_AT,
    }),
  );
  const applicationsByInstance = new Map(
    applications.map((application) => [application.bucketInstanceId, application]),
  );
  const attributions = plan.attributions.map((attribution, index) => {
    const application = applicationsByInstance.get(attribution.bucketInstanceId);
    if (
      application === undefined ||
      application.sourceLineageSetRef !== attribution.sourceLineageSetRef
    ) {
      throw new Error('attribution does not resolve to its canonical application');
    }
    return Object.freeze({
      id: `attribution:i06:${index + 1}`,
      tenantId: plan.tenantId,
      batchId,
      applicationId: application.id,
      claimItemId: null,
      attributedAmountMinor: attribution.attributedAmountMinor ?? null,
      createdAt: CREATED_AT,
    });
  });
  const snapshot = validatedSnapshot.snapshot;
  return Object.freeze({
    batch: Object.freeze({
      id: batchId,
      tenantId: plan.tenantId,
      caseId: plan.caseId,
      collectionId: plan.collectionId,
      batchType: plan.direction,
      currency: plan.currency,
      receiptAmountMinor: plan.receiptAmountMinor,
      heldRemainderMinor: plan.heldRemainderMinor,
      snapshotContractVersion: snapshot.snapshotContractVersion,
      snapshotSerializationVersion: snapshot.snapshotSerializationVersion,
      snapshotRef: plan.snapshotRef,
      snapshotHash: plan.snapshotHash,
      snapshotCanonicalPayload: validatedSnapshot.canonicalPayload,
      sourceVersionSetHash: plan.sourceVersionSetHash,
      snapshotAsOfDate: snapshot.snapshotAsOfDate,
      applicationEffectiveDate: plan.applicationEffectiveDate,
      historyBoundaryRef: plan.historyBoundaryRef,
      engineVersion: snapshot.engineVersion,
      calculationRuleVersion: snapshot.calculationRuleVersion,
      policyVersion: snapshot.policyVersion,
      rateTableVersion: snapshot.rateTableVersion,
      interpretationProfileId: snapshot.interpretationProfileId,
      bucketIdentityVersion: snapshot.bucketIdentityVersion,
      minorUnit: plan.minorUnit,
      idempotencyKey: command.idempotencyKey,
      commandHash: command.commandHash,
      reversesBatchId: null,
      createdAt: CREATED_AT,
    }),
    applications: Object.freeze(applications),
    attributions: Object.freeze(attributions),
  });
}

function canonicalHeldReason(draft: PersistenceDraft): CanonicalPlanHeldReason {
  if (draft.batch.heldRemainderMinor === 0n) {
    return LEGAL_APPLICATION_PLAN_HELD_NONE;
  }
  return draft.applications.length === 0
    ? 'NO_ELIGIBLE_OUTSTANDING'
    : 'EXCESS_OVER_ELIGIBLE_OUTSTANDING';
}

function fingerprintFromPersistenceDraft(draft: PersistenceDraft) {
  const appliedAmountMinor = draft.applications.reduce(
    (total, application) => total + application.appliedAmountMinor,
    0n,
  ) as LegalApplicationPlan['appliedAmountMinor'];
  const applications: readonly PlannedLegalApplication[] = draft.applications.map(
    (application) =>
      Object.freeze({
        componentType: application.componentType,
        componentCode: application.componentCode,
        sourceLineageSetRef: application.sourceLineageSetRef,
        bucketContextKey: application.bucketContextKey,
        bucketInstanceId: application.bucketInstanceId,
        priorityRank: LEGAL_APPLICATION_COMPONENT_RANKS[application.componentType],
        sequence: application.sequence,
        appliedAmountMinor: application.appliedAmountMinor,
        bucketBeforeMinor: application.bucketBeforeMinor,
        bucketAfterMinor: application.bucketAfterMinor,
      }),
  );
  return fingerprintLegalApplicationPlan({
    direction: draft.batch.batchType,
    tenantId: draft.batch.tenantId,
    caseId: draft.batch.caseId,
    collectionId: draft.batch.collectionId,
    currency: draft.batch.currency,
    minorUnit: draft.batch.minorUnit,
    effectiveDate: draft.batch.applicationEffectiveDate,
    snapshotRef: draft.batch.snapshotRef,
    snapshotHash: draft.batch.snapshotHash,
    sourceVersionSetHash: draft.batch.sourceVersionSetHash,
    historyBoundaryRef: draft.batch.historyBoundaryRef,
    receiptAmountMinor: draft.batch.receiptAmountMinor,
    appliedAmountMinor,
    heldRemainderMinor: draft.batch.heldRemainderMinor,
    heldReason: canonicalHeldReason(draft),
    applications,
  });
}

function block(source: string, kind: 'model' | 'enum', name: string): string {
  const match = source.match(new RegExp(`\\b${kind}\\s+${name}\\s*\\{([\\s\\S]*?)\\n\\}`));
  if (match === null) {
    throw new Error(`${kind} ${name} not found`);
  }
  return match[1];
}

function fieldLine(model: string, name: string): string {
  const line = model
    .split(/\r?\n/u)
    .map((candidate) => candidate.trim())
    .find((candidate) => candidate.startsWith(`${name} `));
  if (line === undefined) {
    throw new Error(`field ${name} not found`);
  }
  return line;
}

describe('TPA-04C-I06 writer compatibility contract', () => {
  describe('TPA-04B schema and migration surface', () => {
    const batchModel = block(SCHEMA, 'model', 'LegalApplicationBatch');
    const applicationModel = block(SCHEMA, 'model', 'LegalApplication');
    const attributionModel = block(SCHEMA, 'model', 'ApplicationAttribution');

    it('keeps APPLY compatible with the persistence enums and the closed component set', () => {
      const batchTypes = block(SCHEMA, 'enum', 'LegalApplicationBatchType')
        .trim()
        .split(/\s+/u);
      const componentTypes = block(SCHEMA, 'enum', 'LegalApplicationComponentType')
        .trim()
        .split(/\s+/u);

      expect(batchTypes).toEqual(['APPLY', 'REVERSAL']);
      expect(componentTypes).toEqual(LEGAL_APPLICATION_COMPONENT_TYPES);
    });

    it('requires every canonical batch evidence field without a default or nullable bridge', () => {
      const requiredEvidenceFields = [
        'snapshotContractVersion',
        'snapshotSerializationVersion',
        'snapshotRef',
        'snapshotHash',
        'snapshotCanonicalPayload',
        'sourceVersionSetHash',
        'snapshotAsOfDate',
        'applicationEffectiveDate',
        'historyBoundaryRef',
        'engineVersion',
        'calculationRuleVersion',
        'policyVersion',
        'rateTableVersion',
        'interpretationProfileId',
        'bucketIdentityVersion',
        'minorUnit',
      ] as const;

      for (const field of requiredEvidenceFields) {
        expect(fieldLine(batchModel, field)).not.toMatch(/\?|@default\(/u);
      }
      expect(fieldLine(batchModel, 'snapshotCanonicalPayload')).toContain('@db.Text');
      expect(fieldLine(batchModel, 'createdAt')).not.toContain('@default(');
      expect(batchModel).toContain('@@unique([tenantId, idempotencyKey])');
      expect(FOUNDATION_MIGRATION).toContain(
        'CREATE UNIQUE INDEX "LegalApplicationBatch_tenantId_collectionId_apply_key"',
      );
      expect(FOUNDATION_MIGRATION).toContain('WHERE "batchType" = \'APPLY\'');
    });

    it('keeps bucket effects complete, unique and transaction-conserving', () => {
      for (const field of [
        'componentCode',
        'sourceLineageSetRef',
        'bucketBeforeMinor',
        'bucketAfterMinor',
      ]) {
        expect(fieldLine(applicationModel, field)).not.toMatch(/\?|@default\(/u);
      }
      expect(applicationModel).toContain('@@unique([tenantId, batchId, sequence])');
      expect(applicationModel).toContain(
        '@@unique([tenantId, batchId, bucketContextKey])',
      );
      expect(applicationModel).toContain(
        '@@unique([tenantId, batchId, bucketInstanceId])',
      );
      expect(EVIDENCE_MIGRATION).toContain(
        'CREATE CONSTRAINT TRIGGER "enforce_legal_application_batch_conservation"',
      );
      expect(EVIDENCE_MIGRATION).toContain(
        'v_receipt_amount <> v_applied_total + v_held_remainder',
      );
      expect(EVIDENCE_MIGRATION).toContain(
        'NEW."bucketBeforeMinor" - NEW."bucketAfterMinor" <> NEW."appliedAmountMinor"',
      );
    });

    it('keeps all relations tenant-safe, restrictive and append-only', () => {
      expect(FOUNDATION_MIGRATION).toMatch(
        /FOREIGN KEY \("tenantId", "collectionId"\)[\s\S]*?ON DELETE RESTRICT/u,
      );
      expect(FOUNDATION_MIGRATION).toMatch(
        /FOREIGN KEY \("tenantId", "batchId"\)[\s\S]*?ON DELETE RESTRICT/u,
      );
      expect(FOUNDATION_MIGRATION).toMatch(
        /FOREIGN KEY \("tenantId", "batchId", "applicationId"\)[\s\S]*?ON DELETE RESTRICT/u,
      );
      expect(FOUNDATION_MIGRATION.match(/EXECUTE FUNCTION raise_immutable_error\(\);/gu))
        .toHaveLength(6);
      expect(fieldLine(attributionModel, 'claimItemId')).toContain('?');
      expect(fieldLine(attributionModel, 'attributedAmountMinor')).toContain('?');
    });
  });

  describe('lossless plan-to-persistence compatibility', () => {
    it('projects exact snapshot, replay and bucket-effect facts without Number coercion', () => {
      const value = fixture(
        [
          bucket(1, 'COST', 40n),
          bucket(2, 'ANCILLARY', 30n),
          bucket(3, 'ACCRUED_INTEREST', 20n),
          bucket(4, 'PRINCIPAL', 100n),
        ],
        250n,
      );
      const draft = toPersistenceDraft(value);

      expect(draft.batch).toMatchObject({
        batchType: 'APPLY',
        receiptAmountMinor: 250n,
        heldRemainderMinor: 60n,
        snapshotContractVersion: SNAPSHOT_CONTRACT_VERSION,
        snapshotSerializationVersion: SNAPSHOT_SERIALIZATION_VERSION,
        snapshotRef: value.validatedSnapshot.snapshotRef,
        snapshotHash: value.validatedSnapshot.snapshotHash,
        snapshotCanonicalPayload: value.validatedSnapshot.canonicalPayload,
        sourceVersionSetHash: value.validatedSnapshot.snapshot.sourceVersionSetHash,
        idempotencyKey: value.command.idempotencyKey,
        commandHash: value.command.commandHash,
        reversesBatchId: null,
      });
      expect(draft.applications.map((application) => application.componentType)).toEqual([
        'COST',
        'ANCILLARY',
        'ACCRUED_INTEREST',
        'PRINCIPAL',
      ]);
      expect(
        draft.applications.reduce(
          (total, application) => total + application.appliedAmountMinor,
          0n,
        ) + draft.batch.heldRemainderMinor,
      ).toBe(draft.batch.receiptAmountMinor);
      expect(draft.applications).toEqual(
        value.result.plan.applications.map((application, index) =>
          expect.objectContaining({
            componentType: application.componentType,
            componentCode: application.componentCode,
            sourceLineageSetRef: application.sourceLineageSetRef,
            bucketContextKey: application.bucketContextKey,
            bucketInstanceId: application.bucketInstanceId,
            sequence: index + 1,
            appliedAmountMinor: application.appliedAmountMinor,
            bucketBeforeMinor: application.bucketBeforeMinor,
            bucketAfterMinor: application.bucketAfterMinor,
          }),
        ),
      );
    });

    it('reconstructs the exact plan fingerprint and HELD reason from persisted authority facts', () => {
      const value = fixture([bucket(1, 'PRINCIPAL', 100n)], 150n);
      const draft = toPersistenceDraft(value);
      const reconstructed = fingerprintFromPersistenceDraft(draft);

      expect(canonicalHeldReason(draft)).toBe('EXCESS_OVER_ELIGIBLE_OUTSTANDING');
      expect(reconstructed).toEqual({
        ok: true,
        planFingerprint: value.result.plan.planFingerprint,
      });
    });

    it('keeps a fully HELD plan compatible with zero application rows', () => {
      const value = fixture([], 100n);
      const draft = toPersistenceDraft(value);
      const reconstructed = fingerprintFromPersistenceDraft(draft);

      expect(value.result.plan.heldReason).toBe('NO_ELIGIBLE_OUTSTANDING');
      expect(draft.applications).toEqual([]);
      expect(draft.batch.heldRemainderMinor).toBe(100n);
      expect(canonicalHeldReason(draft)).toBe('NO_ELIGIBLE_OUTSTANDING');
      expect(reconstructed).toEqual({
        ok: true,
        planFingerprint: value.result.plan.planFingerprint,
      });
    });

    it('keeps attribution optional, application-bound and non-authoritative', () => {
      const value = fixture([bucket(1, 'COST', 25n)], 25n);
      const draft = toPersistenceDraft(value);

      expect(draft.attributions).toHaveLength(1);
      expect(draft.attributions[0]).toEqual({
        id: 'attribution:i06:1',
        tenantId: value.result.plan.tenantId,
        batchId: 'batch:i06',
        applicationId: 'application:i06:1',
        claimItemId: null,
        attributedAmountMinor: 25n,
        createdAt: CREATED_AT,
      });
      expect(fingerprintFromPersistenceDraft(draft)).toEqual({
        ok: true,
        planFingerprint: value.result.plan.planFingerprint,
      });
    });

    it('keeps the closed I01-I06 plan-builder surface pure and free from persistence or legacy imports', () => {
      const packageDirectory = join(__dirname, '..');
      const productionSources = readdirSync(packageDirectory)
        .filter((name) => name.endsWith('.ts') && name !== 'legal-application-writer.ts')
        .map((name) => readFileSync(join(packageDirectory, name), 'utf8'))
        .join('\n');

      expect(productionSources).not.toMatch(
        /@prisma|PrismaClient|LegalApplicationWriter|claim-item|ledger-allocation|collection-allocation/iu,
      );
    });
  });
});
