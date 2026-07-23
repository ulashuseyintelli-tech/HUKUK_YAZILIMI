import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import fc from 'fast-check';
import {
  POSTGRES_BIGINT_MAX,
  MAX_ATTRIBUTION_COUNT,
  SNAPSHOT_CONTRACT_VERSION,
  SNAPSHOT_SERIALIZATION_VERSION,
  allocateValidatedSnapshotForApply,
  assembleLegalApplicationPlan,
  parseAppliedAmountMinor,
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
  parseSourceLineageSetRef,
  parseSourceVersionSetHash,
  parseTenantId,
  validateCanonicalSnapshot,
  type AssembleLegalApplicationPlanInput,
  type BuildLegalApplicationPlanCommand,
  type LegalApplicationPlanResult,
  type LegalApplicationPlanSuccess,
  type ParseResult,
  type PlannedApplicationAttribution,
  type PureApplyAllocationResult,
  type PureApplyAllocationSuccess,
  type ValidatedCanonicalSnapshotV1,
} from '..';
import {
  canonicalSnapshotRefForHash,
  computeCanonicalSnapshotHash,
  serializeCanonicalJson,
} from '../canonical-snapshot-serializer';
import type { StrictJsonValue } from '../strict-json-parser';

type MutableJsonObject = Record<string, StrictJsonValue>;

const SOURCE_VERSION_SET_HASH = 'c'.repeat(64);

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
  return `binst:v1:sha256:${(index + 20_000)
    .toString(16)
    .padStart(64, '0')}`;
}

function bucket(
  index: number,
  componentType = 'PRINCIPAL',
  balanceMinor = 100n,
  priorityRank = index,
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
    priorityRank,
    bucketBalanceMinor: balanceMinor.toString(),
  };
}

function snapshot(
  canonicalBuckets: readonly MutableJsonObject[],
  receiptAmountMinor: bigint,
  suffix = '1',
): MutableJsonObject {
  return {
    snapshotContractVersion: SNAPSHOT_CONTRACT_VERSION,
    snapshotSerializationVersion: SNAPSHOT_SERIALIZATION_VERSION,
    tenantId: `tenant-${suffix}`,
    caseId: `case-${suffix}`,
    targetCollectionId: `collection-${suffix}`,
    currency: 'TRY',
    minorUnit: 2,
    receiptAmountMinor: receiptAmountMinor.toString(),
    snapshotAsOfDate: '2026-07-23',
    applicationEffectiveDate: '2026-07-23',
    historyBoundaryRef: `history:v${suffix}`,
    engineVersion: 'engine-v1',
    calculationRuleVersion: 'rule-v1',
    policyVersion: 'policy-v1',
    rateTableVersion: 'rate-v1',
    interpretationProfileId: 'interpretation-v1',
    bucketIdentityVersion: 'bucket-v1',
    sourceVersionSet: [{ sourceReference: 'source:1', sourceVersion: suffix }],
    sourceVersionSetHash: SOURCE_VERSION_SET_HASH,
    canonicalBuckets: [...canonicalBuckets],
  };
}

interface Fixture {
  readonly validatedSnapshot: ValidatedCanonicalSnapshotV1;
  readonly command: BuildLegalApplicationPlanCommand;
}

function fixture(
  buckets: readonly MutableJsonObject[],
  receiptAmountMinor: bigint,
  suffix = '1',
): Fixture {
  const snapshotValue = snapshot(buckets, receiptAmountMinor, suffix);
  const canonicalPayload = serializeCanonicalJson(snapshotValue);
  const snapshotHashValue = computeCanonicalSnapshotHash(
    Buffer.from(canonicalPayload, 'utf8'),
  );
  const snapshotRefValue = canonicalSnapshotRefForHash(snapshotHashValue);
  const command: BuildLegalApplicationPlanCommand = Object.freeze({
    tenantId: valueOf(parseTenantId(snapshotValue.tenantId)),
    caseId: valueOf(parseCaseId(snapshotValue.caseId)),
    collectionId: valueOf(
      parseCollectionId(snapshotValue.targetCollectionId),
    ),
    receiptAmountMinor: valueOf(
      parseReceiptAmountMinor(snapshotValue.receiptAmountMinor),
    ),
    currency: valueOf(parseCurrencyCode(snapshotValue.currency)),
    minorUnit: valueOf(parseMinorUnit(snapshotValue.minorUnit)),
    applicationEffectiveDate: valueOf(
      parseEffectiveDate(snapshotValue.applicationEffectiveDate),
    ),
    expectedSnapshotRef: valueOf(parseSnapshotRef(snapshotRefValue)),
    expectedSnapshotHash: valueOf(parseSnapshotHash(snapshotHashValue)),
    expectedSourceVersionSetHash: valueOf(
      parseSourceVersionSetHash(snapshotValue.sourceVersionSetHash),
    ),
    expectedHistoryBoundaryRef: valueOf(
      parseHistoryBoundaryRef(snapshotValue.historyBoundaryRef),
    ),
    idempotencyKey: valueOf(parseIdempotencyKey(`idempotency-${suffix}`)),
    commandHash: valueOf(
      parseCommandHash(
        createHash('sha256').update(canonicalPayload).digest('hex'),
      ),
    ),
  });
  const validation = validateCanonicalSnapshot({
    direction: 'APPLY',
    command: {
      tenantId: snapshotValue.tenantId,
      caseId: snapshotValue.caseId,
      collectionId: snapshotValue.targetCollectionId,
      receiptAmountMinor: snapshotValue.receiptAmountMinor,
      currency: snapshotValue.currency,
      minorUnit: snapshotValue.minorUnit,
      applicationEffectiveDate: snapshotValue.applicationEffectiveDate,
      expectedSnapshotRef: snapshotRefValue,
      expectedSnapshotHash: snapshotHashValue,
      expectedSourceVersionSetHash: snapshotValue.sourceVersionSetHash,
      expectedHistoryBoundaryRef: snapshotValue.historyBoundaryRef,
      idempotencyKey: `idempotency-${suffix}`,
      commandHash: createHash('sha256').update(canonicalPayload).digest('hex'),
    },
    snapshotEnvelope: {
      snapshotRef: snapshotRefValue,
      snapshotHash: snapshotHashValue,
      canonicalPayload,
    },
  });
  if (!validation.ok) {
    throw new Error(`test fixture validation failed: ${validation.error.code}`);
  }
  return Object.freeze({ validatedSnapshot: validation.value, command });
}

function allocationFor(
  value: Fixture,
): PureApplyAllocationResult {
  return allocateValidatedSnapshotForApply({
    validatedSnapshot: value.validatedSnapshot,
    direction: 'APPLY',
    receiptAmountMinor: value.command.receiptAmountMinor,
  });
}

function inputFor(
  value: Fixture,
  overrides: Partial<AssembleLegalApplicationPlanInput> = {},
): AssembleLegalApplicationPlanInput {
  return {
    direction: 'APPLY',
    command: value.command,
    validatedSnapshot: value.validatedSnapshot,
    allocationResult: allocationFor(value),
    ...overrides,
  };
}

function expectSuccess(
  result: LegalApplicationPlanResult,
): LegalApplicationPlanSuccess {
  expect(result.ok).toBe(true);
  if (!result.ok) {
    throw new Error(result.error.code);
  }
  return result;
}

function expectAllocationSuccess(
  result: PureApplyAllocationResult,
): PureApplyAllocationSuccess {
  expect(result.ok).toBe(true);
  if (!result.ok) {
    throw new Error(result.error.code);
  }
  return result;
}

function assertPlanConservation(result: LegalApplicationPlanSuccess): void {
  const sum = result.plan.applications.reduce(
    (total, application) => total + application.appliedAmountMinor,
    0n,
  );
  expect(result.plan.receiptAmountMinor).toBe(
    result.plan.appliedAmountMinor + result.plan.heldRemainderMinor,
  );
  expect(result.plan.appliedAmountMinor).toBe(sum);
  for (const application of result.plan.applications) {
    expect(application.bucketBeforeMinor).toBe(
      application.appliedAmountMinor + application.bucketAfterMinor,
    );
  }
}

function attributionFor(
  result: LegalApplicationPlanSuccess,
  index: number,
): PlannedApplicationAttribution {
  const application = result.plan.applications[index];
  return Object.freeze({
    bucketInstanceId: application.bucketInstanceId,
    sourceLineageSetRef: application.sourceLineageSetRef,
    attributedAmountMinor: application.appliedAmountMinor,
  });
}

describe('TPA-04C-I04 pure legal application plan assembly', () => {
  describe('canonical HELD semantics', () => {
    it('omits runtime heldReason and uses a zero remainder when fully applied', () => {
      const value = fixture([bucket(1, 'COST', 100n)], 100n);
      const result = expectSuccess(
        assembleLegalApplicationPlan(inputFor(value)),
      );
      expect(result.plan.heldRemainderMinor).toBe(0n);
      expect(result.plan.heldReason).toBeUndefined();
      assertPlanConservation(result);
    });

    it('uses NO_ELIGIBLE_OUTSTANDING only for a full valid remainder', () => {
      const value = fixture([bucket(1, 'COST', 0n)], 100n);
      const result = expectSuccess(
        assembleLegalApplicationPlan(inputFor(value)),
      );
      expect(result.plan.appliedAmountMinor).toBe(0n);
      expect(result.plan.heldRemainderMinor).toBe(100n);
      expect(result.plan.heldReason).toBe('NO_ELIGIBLE_OUTSTANDING');
      expect(result.plan.applications).toEqual([]);
      assertPlanConservation(result);
    });

    it('uses EXCESS_OVER_ELIGIBLE_OUTSTANDING only for a partial valid remainder', () => {
      const value = fixture([bucket(1, 'COST', 40n)], 100n);
      const result = expectSuccess(
        assembleLegalApplicationPlan(inputFor(value)),
      );
      expect(result.plan.appliedAmountMinor).toBe(40n);
      expect(result.plan.heldRemainderMinor).toBe(60n);
      expect(result.plan.heldReason).toBe(
        'EXCESS_OVER_ELIGIBLE_OUTSTANDING',
      );
      assertPlanConservation(result);
    });

    it('does not convert validation or allocation failure into HELD', () => {
      const value = fixture([bucket(1, 'COST', 40n)], 100n);
      const failure = Object.freeze({
        ok: false as const,
        error: Object.freeze({ code: 'BUCKET_CONTEXT_UNMAPPED' as const }),
      });
      expect(
        assembleLegalApplicationPlan(
          inputFor(value, { allocationResult: failure }),
        ),
      ).toEqual(failure);
    });
  });

  describe('lossless application mapping and authoritative context', () => {
    it('preserves I03 sequence and every authoritative allocation field', () => {
      const value = fixture(
        [
          bucket(4, 'PRINCIPAL', 10n, 1),
          bucket(2, 'ANCILLARY', 10n, 1),
          bucket(1, 'COST', 10n, 1),
          bucket(3, 'ACCRUED_INTEREST', 10n, 1),
        ],
        40n,
      );
      const allocation = expectAllocationSuccess(allocationFor(value));
      const result = expectSuccess(
        assembleLegalApplicationPlan(
          inputFor(value, { allocationResult: allocation }),
        ),
      );

      expect(result.plan.applications).toHaveLength(
        allocation.allocations.length,
      );
      expect(
        result.plan.applications.map((application) => ({
          componentType: application.componentType,
          componentCode: application.componentCode,
          priorityRank: application.priorityRank,
          bucketContextKey: application.bucketContextKey,
          bucketInstanceId: application.bucketInstanceId,
          sourceLineageSetRef: application.sourceLineageSetRef,
          bucketBeforeMinor: application.bucketBeforeMinor,
          appliedAmountMinor: application.appliedAmountMinor,
          bucketAfterMinor: application.bucketAfterMinor,
        })),
      ).toEqual(allocation.allocations);
      expect(result.plan.applications.map((row) => row.sequence)).toEqual([
        1, 2, 3, 4,
      ]);
      expect(result.plan.applications.map((row) => row.componentType)).toEqual([
        'COST',
        'ANCILLARY',
        'ACCRUED_INTEREST',
        'PRINCIPAL',
      ]);
      expect(result.plan.tenantId).toBe(value.command.tenantId);
      expect(result.plan.caseId).toBe(value.command.caseId);
      expect(result.plan.collectionId).toBe(value.command.collectionId);
      expect(result.plan.currency).toBe(value.command.currency);
      expect(result.plan.minorUnit).toBe(value.command.minorUnit);
      expect(result.plan.historyBoundaryRef).toBe(
        value.command.expectedHistoryBoundaryRef,
      );
    });

    it('rejects context mismatch and non-APPLY direction deterministically', () => {
      const value = fixture([bucket(1, 'COST', 10n)], 10n);
      expect(
        assembleLegalApplicationPlan(inputFor(value, { direction: 'REVERSAL' })),
      ).toEqual({
        ok: false,
        error: { code: 'DIRECTION_NOT_AUTHORIZED' },
      });
      expect(
        assembleLegalApplicationPlan(
          inputFor(value, {
            command: {
              ...value.command,
              tenantId: valueOf(parseTenantId('other-tenant')),
            },
          }),
        ),
      ).toEqual({
        ok: false,
        error: { code: 'TENANT_CONTEXT_MISMATCH' },
      });
    });

    it('rejects forged conservation and allocation-order results with no plan', () => {
      const value = fixture(
        [bucket(1, 'COST', 10n), bucket(2, 'PRINCIPAL', 10n)],
        20n,
      );
      const allocation = expectAllocationSuccess(allocationFor(value));
      const forgedTotal: PureApplyAllocationSuccess = Object.freeze({
        ...allocation,
        totalAppliedMinor: valueOf(parseAppliedAmountMinor('19')),
      });
      expect(
        assembleLegalApplicationPlan(
          inputFor(value, { allocationResult: forgedTotal }),
        ),
      ).toEqual({
        ok: false,
        error: { code: 'CONSERVATION_FAILURE' },
      });

      const reversed: PureApplyAllocationSuccess = Object.freeze({
        ...allocation,
        allocations: Object.freeze([...allocation.allocations].reverse()),
      });
      expect(
        assembleLegalApplicationPlan(
          inputFor(value, { allocationResult: reversed }),
        ),
      ).toEqual({
        ok: false,
        error: { code: 'FORMATION_CONTEXT_INCOMPLETE' },
      });
    });
  });

  describe('attribution isolation and fingerprint determinism', () => {
    it('allows no attribution and excludes attribution presence/order/free text from authority', () => {
      const value = fixture(
        [bucket(1, 'COST', 10n), bucket(2, 'PRINCIPAL', 10n)],
        20n,
      );
      const without = expectSuccess(
        assembleLegalApplicationPlan(inputFor(value)),
      );
      const first = attributionFor(without, 0);
      const second = attributionFor(without, 1);
      const withAttribution = expectSuccess(
        assembleLegalApplicationPlan(
          inputFor(value, {
            attributions: Object.freeze([
              { ...first, note: 'excluded free text' },
              second,
            ]),
          }),
        ),
      );
      const reordered = expectSuccess(
        assembleLegalApplicationPlan(
          inputFor(value, {
            attributions: Object.freeze([second, first]),
          }),
        ),
      );

      expect(without.plan.attributions).toEqual([]);
      expect(withAttribution.plan.attributions).toHaveLength(2);
      expect(withAttribution.plan.attributions[0]).not.toHaveProperty('note');
      expect(withAttribution.plan.planFingerprint).toBe(
        without.plan.planFingerprint,
      );
      expect(reordered.plan.planFingerprint).toBe(
        without.plan.planFingerprint,
      );
      expect(withAttribution.plan.applications).toEqual(
        without.plan.applications,
      );
      expect(withAttribution.plan.heldRemainderMinor).toBe(
        without.plan.heldRemainderMinor,
      );
    });

    it('drops forged or oversized attribution without changing authoritative success', () => {
      const value = fixture([bucket(1, 'COST', 10n)], 10n);
      const baseline = expectSuccess(
        assembleLegalApplicationPlan(inputFor(value)),
      );
      const forged: PlannedApplicationAttribution = Object.freeze({
        bucketInstanceId: baseline.plan.applications[0].bucketInstanceId,
        sourceLineageSetRef: valueOf(
          parseSourceLineageSetRef('forged-lineage'),
        ),
        attributedAmountMinor: baseline.plan.applications[0].appliedAmountMinor,
      });
      const result = expectSuccess(
        assembleLegalApplicationPlan(
          inputFor(value, { attributions: Object.freeze([forged]) }),
        ),
      );
      expect(result.plan.attributions).toEqual([]);
      expect(result.plan.planFingerprint).toBe(
        baseline.plan.planFingerprint,
      );
      expect(result.plan.applications).toEqual(baseline.plan.applications);

      const oversized = Object.freeze(
        Array.from(
          { length: MAX_ATTRIBUTION_COUNT + 1 },
          () => attributionFor(baseline, 0),
        ),
      );
      const bounded = expectSuccess(
        assembleLegalApplicationPlan(
          inputFor(value, { attributions: oversized }),
        ),
      );
      expect(bounded.plan.attributions).toEqual([]);
      expect(bounded.plan.planFingerprint).toBe(
        baseline.plan.planFingerprint,
      );
      expect(bounded.plan.applications).toEqual(baseline.plan.applications);
    });

    it('excludes Collection replay identifiers from the plan fingerprint', () => {
      const value = fixture([bucket(1, 'COST', 10n)], 10n);
      const baseline = expectSuccess(
        assembleLegalApplicationPlan(inputFor(value)),
      );
      const changedCommand: BuildLegalApplicationPlanCommand = Object.freeze({
        ...value.command,
        idempotencyKey: valueOf(parseIdempotencyKey('different-key')),
        commandHash: valueOf(parseCommandHash('different-command-hash')),
      });
      const changed = expectSuccess(
        assembleLegalApplicationPlan(
          inputFor(value, { command: changedCommand }),
        ),
      );
      expect(changed.plan.planFingerprint).toBe(
        baseline.plan.planFingerprint,
      );
      expect(changed.plan).not.toHaveProperty('idempotencyKey');
      expect(changed.plan).not.toHaveProperty('commandHash');
    });

    it('produces the same deeply immutable plan 100 times without mutating inputs', () => {
      const value = fixture([bucket(1, 'COST', 10n)], 15n);
      const allocation = expectAllocationSuccess(allocationFor(value));
      const first = expectSuccess(
        assembleLegalApplicationPlan(
          inputFor(value, { allocationResult: allocation }),
        ),
      );
      const snapshotBefore = value.validatedSnapshot.snapshot.canonicalBuckets.map(
        (item) => item.bucketBalanceMinor,
      );
      const allocationBefore = allocation.allocations.map((item) => ({
        ...item,
      }));

      for (let run = 0; run < 100; run += 1) {
        expect(
          assembleLegalApplicationPlan(
            inputFor(value, { allocationResult: allocation }),
          ),
        ).toEqual(first);
      }
      expect(value.validatedSnapshot.snapshot.canonicalBuckets.map(
        (item) => item.bucketBalanceMinor,
      )).toEqual(snapshotBefore);
      expect(allocation.allocations).toEqual(allocationBefore);
      expect(Object.isFrozen(first)).toBe(true);
      expect(Object.isFrozen(first.plan)).toBe(true);
      expect(Object.isFrozen(first.plan.applications)).toBe(true);
      expect(first.plan.applications.every(Object.isFrozen)).toBe(true);
      expect(Object.isFrozen(first.plan.attributions)).toBe(true);
    });
  });

  describe('bounded property and bigint safety checks', () => {
    it('preserves final conservation, HELD equivalence, mapping and immutability', () => {
      fc.assert(
        fc.property(
          fc.array(fc.bigInt({ min: 0n, max: 1_000_000n }), {
            minLength: 0,
            maxLength: 8,
          }),
          fc.bigInt({ min: 1n, max: 1_000_000n }),
          (balances, receipt) => {
            const buckets = balances.map((balance, index) =>
              bucket(
                index + 1,
                index % 2 === 0 ? 'COST' : 'PRINCIPAL',
                balance,
                index,
              ),
            );
            const value = fixture(buckets, receipt);
            const allocation = expectAllocationSuccess(allocationFor(value));
            const allocationBefore = allocation.allocations.map((item) => ({
              ...item,
            }));
            const snapshotBefore =
              value.validatedSnapshot.snapshot.canonicalBuckets.map((item) => ({
                bucketInstanceId: item.bucketInstanceId,
                bucketBalanceMinor: item.bucketBalanceMinor,
              }));
            const result = expectSuccess(
              assembleLegalApplicationPlan(
                inputFor(value, { allocationResult: allocation }),
              ),
            );
            assertPlanConservation(result);
            expect(result.plan.applications).toHaveLength(
              allocation.allocations.length,
            );
            expect(
              result.plan.applications.map((row) => row.appliedAmountMinor),
            ).toEqual(
              allocation.allocations.map((row) => row.appliedAmountMinor),
            );
            expect(allocation.allocations).toEqual(allocationBefore);
            expect(
              value.validatedSnapshot.snapshot.canonicalBuckets.map((item) => ({
                bucketInstanceId: item.bucketInstanceId,
                bucketBalanceMinor: item.bucketBalanceMinor,
              })),
            ).toEqual(snapshotBefore);

            if (allocation.remainingAmountMinor === 0n) {
              expect(result.plan.heldReason).toBeUndefined();
            } else if (allocation.totalAppliedMinor === 0n) {
              expect(result.plan.heldReason).toBe(
                'NO_ELIGIBLE_OUTSTANDING',
              );
            } else {
              expect(result.plan.heldReason).toBe(
                'EXCESS_OVER_ELIGIBLE_OUTSTANDING',
              );
            }
            return true;
          },
        ),
        { numRuns: 100 },
      );
    });

    it('keeps attribution non-interfering across bounded permutations', () => {
      fc.assert(
        fc.property(fc.integer({ min: 0, max: 1000 }), (seed) => {
          const value = fixture(
            [bucket(1, 'COST', 10n), bucket(2, 'PRINCIPAL', 10n)],
            20n,
          );
          const baseline = expectSuccess(
            assembleLegalApplicationPlan(inputFor(value)),
          );
          const entries = [
            attributionFor(baseline, 0),
            attributionFor(baseline, 1),
          ];
          const attributions =
            seed % 2 === 0 ? entries : Object.freeze([...entries].reverse());
          const projected = expectSuccess(
            assembleLegalApplicationPlan(
              inputFor(value, { attributions }),
            ),
          );
          expect(projected.plan.planFingerprint).toBe(
            baseline.plan.planFingerprint,
          );
          expect(projected.plan.applications).toEqual(
            baseline.plan.applications,
          );
          return true;
        }),
        { numRuns: 100 },
      );
    });

    it.each([
      BigInt(Number.MAX_SAFE_INTEGER) + 2n,
      POSTGRES_BIGINT_MAX,
    ])('preserves exact bigint amount %s without rounding', (amount) => {
      const value = fixture([bucket(1, 'COST', amount)], amount);
      const result = expectSuccess(
        assembleLegalApplicationPlan(inputFor(value)),
      );
      expect(result.plan.receiptAmountMinor).toBe(amount);
      expect(result.plan.appliedAmountMinor).toBe(amount);
      expect(result.plan.applications[0].appliedAmountMinor).toBe(amount);
      assertPlanConservation(result);
    });
  });

  describe('security and dormant architecture', () => {
    it('contains no IO, generated ID/time, writer, legacy authority or monetary Number conversion', () => {
      const sources = [
        'legal-application-plan-builder.ts',
        'plan-fingerprint.ts',
      ]
        .map((file) => readFileSync(join(__dirname, '..', file), 'utf8'))
        .join('\n');
      expect(sources).not.toMatch(
        /Prisma|process\.env|Date\.|new Date|Math\.random|randomUUID|fetch\(/,
      );
      expect(sources).not.toMatch(
        /ClaimItem|collectedAmount|LedgerAllocation|CollectionAllocation|TBK100AllocatorService|SummaryEngine|CaseBalanceService|ClaimBucketAssembler/,
      );
      expect(sources).not.toMatch(
        /LegalApplicationWriter|CollectionService|Audit|Outbox|EventEmitter/,
      );
      expect(sources).not.toMatch(/Number\(|parseFloat|parseInt|toFixed/);
      expect(sources).not.toMatch(/localeCompare|Intl\.Collator/);
    });

    it('does not expose raw payload, replay identifiers or persistence identity in the plan', () => {
      const value = fixture([bucket(1, 'COST', 10n)], 10n);
      const result = expectSuccess(
        assembleLegalApplicationPlan(inputFor(value)),
      );
      const keys = Object.keys(result.plan);
      expect(keys).not.toEqual(
        expect.arrayContaining([
          'canonicalPayload',
          'idempotencyKey',
          'commandHash',
          'actor',
          'createdAt',
          'id',
        ]),
      );
      expect(
        JSON.stringify(result.plan, (_key, value) =>
          typeof value === 'bigint' ? value.toString() : value,
        ),
      ).not.toContain('ClaimItem');
    });
  });
});

function compileTimeReadonlySurface(result: LegalApplicationPlanSuccess): void {
  // @ts-expect-error readonly applications cannot be extended
  result.plan.applications.push(result.plan.applications[0]);
  // @ts-expect-error readonly plan fields cannot be reassigned
  result.plan.heldRemainderMinor = 0n;
}

void compileTimeReadonlySurface;
