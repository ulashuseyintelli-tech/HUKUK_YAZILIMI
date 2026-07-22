import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import fc from 'fast-check';
import {
  LEGAL_APPLICATION_COMPONENT_RANKS,
  POSTGRES_BIGINT_MAX,
  SNAPSHOT_CONTRACT_VERSION,
  SNAPSHOT_SERIALIZATION_VERSION,
  allocateValidatedSnapshotForApply,
  compareBucketContextKeysUtf8,
  compareUnsignedByteSequences,
  legalApplicationComponentRank,
  validateCanonicalSnapshot,
  type BucketContextKey,
  type CanonicalSnapshotValidationResult,
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

function contextKey(index: number): string {
  return `bctx:v1:sha256:${index.toString(16).padStart(64, '0')}`;
}

function instanceId(index: number): string {
  return `binst:v1:sha256:${(index + 20_000).toString(16).padStart(64, '0')}`;
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
): MutableJsonObject {
  return {
    snapshotContractVersion: SNAPSHOT_CONTRACT_VERSION,
    snapshotSerializationVersion: SNAPSHOT_SERIALIZATION_VERSION,
    tenantId: 'tenant-1',
    caseId: 'case-1',
    targetCollectionId: 'collection-1',
    currency: 'TRY',
    minorUnit: 2,
    receiptAmountMinor: receiptAmountMinor.toString(),
    snapshotAsOfDate: '2026-07-23',
    applicationEffectiveDate: '2026-07-23',
    historyBoundaryRef: 'history:v1',
    engineVersion: 'engine-v1',
    calculationRuleVersion: 'rule-v1',
    policyVersion: 'policy-v1',
    rateTableVersion: 'rate-v1',
    interpretationProfileId: 'interpretation-v1',
    bucketIdentityVersion: 'bucket-v1',
    sourceVersionSet: [{ sourceReference: 'source:1', sourceVersion: '1' }],
    sourceVersionSetHash: SOURCE_VERSION_SET_HASH,
    canonicalBuckets: [...canonicalBuckets],
  };
}

function validationRequest(snapshotValue: MutableJsonObject): Record<string, unknown> {
  const canonicalPayload = serializeCanonicalJson(snapshotValue);
  const snapshotHash = computeCanonicalSnapshotHash(Buffer.from(canonicalPayload, 'utf8'));
  const snapshotRef = canonicalSnapshotRefForHash(snapshotHash);
  return {
    direction: 'APPLY',
    command: {
      tenantId: snapshotValue.tenantId,
      caseId: snapshotValue.caseId,
      collectionId: snapshotValue.targetCollectionId,
      receiptAmountMinor: snapshotValue.receiptAmountMinor,
      currency: snapshotValue.currency,
      minorUnit: snapshotValue.minorUnit,
      applicationEffectiveDate: snapshotValue.applicationEffectiveDate,
      expectedSnapshotRef: snapshotRef,
      expectedSnapshotHash: snapshotHash,
      expectedSourceVersionSetHash: snapshotValue.sourceVersionSetHash,
      expectedHistoryBoundaryRef: snapshotValue.historyBoundaryRef,
      idempotencyKey: 'idempotency-1',
      commandHash: createHash('sha256').update(canonicalPayload).digest('hex'),
    },
    snapshotEnvelope: { snapshotRef, snapshotHash, canonicalPayload },
  };
}

function validatedSnapshot(
  buckets: readonly MutableJsonObject[],
  receiptAmountMinor: bigint,
): ValidatedCanonicalSnapshotV1 {
  const result = validateCanonicalSnapshot(validationRequest(snapshot(buckets, receiptAmountMinor)));
  if (!result.ok) {
    throw new Error(`test fixture validation failed: ${result.error.code}`);
  }
  return result.value;
}

function allocate(
  buckets: readonly MutableJsonObject[],
  receiptAmountMinor: bigint,
): PureApplyAllocationResult {
  return allocateValidatedSnapshotForApply({
    validatedSnapshot: validatedSnapshot(buckets, receiptAmountMinor),
    direction: 'APPLY',
    receiptAmountMinor,
  });
}

function expectSuccess(result: PureApplyAllocationResult): PureApplyAllocationSuccess {
  expect(result.ok).toBe(true);
  if (!result.ok) {
    throw new Error(result.error.code);
  }
  return result;
}

function expectValidationFailure(
  result: CanonicalSnapshotValidationResult,
  expectedCode: string,
): void {
  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.error.code).toBe(expectedCode);
  }
}

function deterministicPermutation<T>(values: readonly T[], seed: number): T[] {
  const result = [...values];
  let state = seed + 1;
  for (let index = result.length - 1; index > 0; index -= 1) {
    state = (state * 1664525 + 1013904223) >>> 0;
    const target = state % (index + 1);
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}

function assertConservation(result: PureApplyAllocationSuccess, receipt: bigint): void {
  const sum = result.allocations.reduce(
    (total, allocation) => total + allocation.appliedAmountMinor,
    0n,
  );
  expect(receipt).toBe(sum + result.remainingAmountMinor);
  expect(result.totalAppliedMinor).toBe(sum);
  let runningRemaining = receipt;
  for (const allocation of result.allocations) {
    expect(allocation.bucketBeforeMinor).toBe(
      allocation.appliedAmountMinor + allocation.bucketAfterMinor,
    );
    expect(allocation.appliedAmountMinor).toBeGreaterThan(0n);
    expect(allocation.appliedAmountMinor).toBeLessThanOrEqual(runningRemaining);
    expect(allocation.bucketAfterMinor).toBeGreaterThanOrEqual(0n);
    runningRemaining -= allocation.appliedAmountMinor;
  }
  expect(runningRemaining).toBe(result.remainingAmountMinor);
}

describe('TPA-04C-I03 pure APPLY ordering and exact-minor-unit allocation core', () => {
  describe('canonical component and bucket ordering', () => {
    it('maps every closed component through the exact exhaustive rank switch', () => {
      expect(legalApplicationComponentRank('COST')).toBe(10);
      expect(legalApplicationComponentRank('ANCILLARY')).toBe(20);
      expect(legalApplicationComponentRank('ACCRUED_INTEREST')).toBe(30);
      expect(legalApplicationComponentRank('PRINCIPAL')).toBe(40);
      expect(LEGAL_APPLICATION_COMPONENT_RANKS).toEqual({
        COST: 10,
        ANCILLARY: 20,
        ACCRUED_INTEREST: 30,
        PRINCIPAL: 40,
      });
    });

    it('applies COST, ANCILLARY, ACCRUED_INTEREST, then PRINCIPAL regardless of input order', () => {
      const input = [
        bucket(4, 'PRINCIPAL'),
        bucket(3, 'ACCRUED_INTEREST'),
        bucket(2, 'ANCILLARY'),
        bucket(1, 'COST'),
      ];
      const result = expectSuccess(allocate(input, 400n));
      expect(result.allocations.map((row) => row.componentType)).toEqual([
        'COST',
        'ANCILLARY',
        'ACCRUED_INTEREST',
        'PRINCIPAL',
      ]);
    });

    it('orders same-component buckets by numeric priority, then UTF-8 context-key bytes', () => {
      const input = [
        bucket(9, 'COST', 1n, 2),
        bucket(8, 'COST', 1n, 1),
        bucket(7, 'COST', 1n, 1),
      ];
      const result = expectSuccess(allocate(input, 3n));
      expect(result.allocations.map((row) => row.bucketContextKey)).toEqual([
        contextKey(7),
        contextKey(8),
        contextKey(9),
      ]);
    });

    it('produces the same allocations for 100 deterministic input permutations', () => {
      const input = [
        bucket(1, 'COST', 11n, 2),
        bucket(2, 'COST', 12n, 1),
        bucket(3, 'ANCILLARY', 13n, 0),
        bucket(4, 'ACCRUED_INTEREST', 14n, 0),
        bucket(5, 'PRINCIPAL', 15n, 0),
      ];
      const baseline = expectSuccess(allocate(input, 60n));
      for (let seed = 0; seed < 100; seed += 1) {
        expect(expectSuccess(allocate(deterministicPermutation(input, seed), 60n))).toEqual(
          baseline,
        );
      }
    });
  });

  describe('UTF-8 byte comparator', () => {
    it('handles ASCII, prefix, late-byte and exact-equality relations', () => {
      expect(compareUnsignedByteSequences(Buffer.from('a'), Buffer.from('b'))).toBe(-1);
      expect(compareUnsignedByteSequences(Buffer.from('ab'), Buffer.from('abc'))).toBe(-1);
      expect(compareUnsignedByteSequences(Buffer.from('abc1'), Buffer.from('abc2'))).toBe(-1);
      expect(compareUnsignedByteSequences(Buffer.from('same'), Buffer.from('same'))).toBe(0);
    });

    it('uses unsigned UTF-8 byte order instead of locale ordering', () => {
      expect(compareUnsignedByteSequences(Buffer.from('z', 'utf8'), Buffer.from('ä', 'utf8'))).toBe(
        -1,
      );
      const left = validatedSnapshot([bucket(1)], 1n).snapshot.canonicalBuckets[0]
        .bucketContextKey;
      const right = validatedSnapshot([bucket(2)], 1n).snapshot.canonicalBuckets[0]
        .bucketContextKey;
      expect(compareBucketContextKeysUtf8(left, right)).toBe(-1);
    });

    it('is antisymmetric and transitive', () => {
      const a = Buffer.from('a');
      const b = Buffer.from('b');
      const c = Buffer.from('c');
      expect(compareUnsignedByteSequences(a, b)).toBe(
        -compareUnsignedByteSequences(b, a),
      );
      expect(compareUnsignedByteSequences(a, b)).toBeLessThan(0);
      expect(compareUnsignedByteSequences(b, c)).toBeLessThan(0);
      expect(compareUnsignedByteSequences(a, c)).toBeLessThan(0);
    });
  });

  describe('exact bigint allocation', () => {
    it.each([
      ['one bucket exact fill', [bucket(1, 'COST', 100n)], 100n, [100n], 0n],
      ['one bucket partial fill', [bucket(1, 'COST', 100n)], 40n, [40n], 0n],
      ['receipt exceeds one bucket', [bucket(1, 'COST', 40n)], 100n, [40n], 60n],
      [
        'multiple buckets exact total',
        [bucket(1, 'COST', 20n), bucket(2, 'ANCILLARY', 30n)],
        50n,
        [20n, 30n],
        0n,
      ],
      [
        'partial final bucket',
        [bucket(1, 'COST', 20n), bucket(2, 'ANCILLARY', 30n)],
        35n,
        [20n, 15n],
        0n,
      ],
      [
        'receipt exhausted before later component',
        [bucket(1, 'COST', 20n), bucket(2, 'PRINCIPAL', 30n)],
        20n,
        [20n],
        0n,
      ],
    ])('%s', (_name, buckets, receipt, expectedApplied, expectedRemaining) => {
      const result = expectSuccess(
        allocate(buckets as readonly MutableJsonObject[], receipt as bigint),
      );
      expect(result.allocations.map((row) => row.appliedAmountMinor)).toEqual(expectedApplied);
      expect(result.remainingAmountMinor).toBe(expectedRemaining);
      assertConservation(result, receipt as bigint);
    });

    it('skips zero balances and preserves full remaining for empty/all-zero bucket sets', () => {
      const mixed = expectSuccess(
        allocate([bucket(1, 'COST', 0n), bucket(2, 'PRINCIPAL', 5n)], 7n),
      );
      expect(mixed.allocations).toHaveLength(1);
      expect(mixed.remainingAmountMinor).toBe(2n);

      for (const buckets of [[], [bucket(1, 'COST', 0n)]]) {
        const result = expectSuccess(allocate(buckets, 7n));
        expect(result.allocations).toEqual([]);
        expect(result.totalAppliedMinor).toBe(0n);
        expect(result.remainingAmountMinor).toBe(7n);
      }
    });

    it.each([1n, BigInt(Number.MAX_SAFE_INTEGER) + 2n, POSTGRES_BIGINT_MAX])(
      'keeps %s exact without monetary Number conversion',
      (amount) => {
        const result = expectSuccess(allocate([bucket(1, 'COST', amount)], amount));
        expect(result.totalAppliedMinor).toBe(amount);
        expect(result.remainingAmountMinor).toBe(0n);
        assertConservation(result, amount);
      },
    );
  });

  describe('typed failures and validated-only boundary', () => {
    it('rejects unsupported direction and forged receipt amounts deterministically', () => {
      const value = validatedSnapshot([bucket(1)], 10n);
      const cases: ReadonlyArray<readonly [unknown, bigint, string]> = [
        ['REVERSAL', 10n, 'DIRECTION_NOT_AUTHORIZED'],
        ['APPLY', 0n, 'RECEIPT_AMOUNT_INVALID'],
        ['APPLY', -1n, 'RECEIPT_AMOUNT_INVALID'],
        ['APPLY', POSTGRES_BIGINT_MAX + 1n, 'RECEIPT_AMOUNT_INVALID'],
        ['APPLY', 9n, 'RECEIPT_AMOUNT_INVALID'],
      ];
      for (const [direction, receiptAmountMinor, code] of cases) {
        const result = allocateValidatedSnapshotForApply({
          validatedSnapshot: value,
          direction,
          receiptAmountMinor,
        });
        expect(result).toEqual({ ok: false, error: { code } });
      }
    });

    it('rejects forged bucket amount, duplicate context and unsupported component before I03', () => {
      const negative = bucket(1);
      negative.bucketBalanceMinor = '-1';
      expectValidationFailure(
        validateCanonicalSnapshot(validationRequest(snapshot([negative], 1n))),
        'SNAPSHOT_SERIALIZATION_INVALID',
      );

      const aboveMax = bucket(1);
      aboveMax.bucketBalanceMinor = (POSTGRES_BIGINT_MAX + 1n).toString();
      expectValidationFailure(
        validateCanonicalSnapshot(validationRequest(snapshot([aboveMax], 1n))),
        'AMOUNT_OUT_OF_RANGE',
      );

      const duplicate = bucket(2);
      duplicate.bucketContextKey = contextKey(1);
      expectValidationFailure(
        validateCanonicalSnapshot(
          validationRequest(snapshot([bucket(1), duplicate], 1n)),
        ),
        'DUPLICATE_BUCKET_CONTEXT',
      );

      expectValidationFailure(
        validateCanonicalSnapshot(
          validationRequest(snapshot([bucket(1, 'UNSUPPORTED')], 1n)),
        ),
        'BUCKET_CONTEXT_UNMAPPED',
      );
    });
  });

  describe('determinism and immutability', () => {
    it('returns the same deeply frozen result 100 times without mutating input', () => {
      const value = validatedSnapshot(
        [bucket(2, 'PRINCIPAL', 5n), bucket(1, 'COST', 5n)],
        8n,
      );
      const inputOrder = value.snapshot.canonicalBuckets.map((item) => item.bucketContextKey);
      const first = expectSuccess(
        allocateValidatedSnapshotForApply({
          validatedSnapshot: value,
          direction: 'APPLY',
          receiptAmountMinor: 8n,
        }),
      );
      for (let index = 0; index < 100; index += 1) {
        expect(
          allocateValidatedSnapshotForApply({
            validatedSnapshot: value,
            direction: 'APPLY',
            receiptAmountMinor: 8n,
          }),
        ).toEqual(first);
      }
      expect(value.snapshot.canonicalBuckets.map((item) => item.bucketContextKey)).toEqual(
        inputOrder,
      );
      expect(Object.isFrozen(first)).toBe(true);
      expect(Object.isFrozen(first.allocations)).toBe(true);
      expect(first.allocations.every(Object.isFrozen)).toBe(true);
    });
  });

  describe('bounded property checks', () => {
    it('preserves conservation, nonnegativity, upper bounds and zero neutrality', () => {
      fc.assert(
        fc.property(
          fc.array(fc.bigInt({ min: 0n, max: 1_000_000n }), {
            minLength: 0,
            maxLength: 12,
          }),
          fc.bigInt({ min: 1n, max: 1_000_000n }),
          (balances, receipt) => {
            const buckets = balances.map((balance, index) =>
              bucket(index + 1, index % 2 === 0 ? 'COST' : 'PRINCIPAL', balance, index % 3),
            );
            const result = expectSuccess(allocate(buckets, receipt));
            const withoutZeroBuckets = expectSuccess(
              allocate(
                buckets.filter((_, index) => balances[index] !== 0n),
                receipt,
              ),
            );
            const eligibleTotal = balances.reduce((sum, balance) => sum + balance, 0n);
            assertConservation(result, receipt);
            expect(withoutZeroBuckets).toEqual(result);
            expect(result.remainingAmountMinor).toBeGreaterThanOrEqual(0n);
            expect(result.totalAppliedMinor).toBeLessThanOrEqual(receipt);
            expect(result.totalAppliedMinor).toBeLessThanOrEqual(eligibleTotal);
            for (const row of result.allocations) {
              expect(row.appliedAmountMinor).toBeLessThanOrEqual(row.bucketBeforeMinor);
              expect(row.appliedAmountMinor).toBeLessThanOrEqual(receipt);
            }
            return true;
          },
        ),
        { numRuns: 100 },
      );
    });

    it('preserves component/priority precedence, permutation invariance and repeated determinism', () => {
      fc.assert(
        fc.property(fc.integer({ min: 0, max: 1_000_000 }), (seed) => {
          const buckets = [
            bucket(1, 'PRINCIPAL', 7n, 2),
            bucket(2, 'COST', 0n, 2),
            bucket(3, 'COST', 5n, 1),
            bucket(4, 'ANCILLARY', 6n, 0),
            bucket(5, 'ACCRUED_INTEREST', 4n, 0),
          ];
          const originalKeys = buckets.map((item) => item.bucketContextKey);
          const first = expectSuccess(allocate(buckets, 20n));
          const permuted = expectSuccess(
            allocate(deterministicPermutation(buckets, seed), 20n),
          );
          const repeated = expectSuccess(allocate(buckets, 20n));
          expect(permuted).toEqual(first);
          expect(repeated).toEqual(first);
          expect(buckets.map((item) => item.bucketContextKey)).toEqual(originalKeys);
          expect(first.allocations.map((row) => row.componentType)).toEqual([
            'COST',
            'ANCILLARY',
            'ACCRUED_INTEREST',
            'PRINCIPAL',
          ]);
          return true;
        }),
        { numRuns: 100 },
      );
    });
  });

  describe('fault and architectural review', () => {
    it('locks the causal guards that detect rank/min/remaining/zero/conservation faults', () => {
      const rankSource = readFileSync(join(__dirname, '..', 'allocation-order.ts'), 'utf8');
      const coreSource = readFileSync(join(__dirname, '..', 'apply-allocation-core.ts'), 'utf8');
      expect(rankSource).toContain("case 'COST':");
      expect(rankSource).toContain("case 'ANCILLARY':");
      expect(rankSource).toContain("case 'ACCRUED_INTEREST':");
      expect(rankSource).toContain("case 'PRINCIPAL':");
      expect(coreSource).toContain('bucket.bucketBalanceMinor < remainingBeforeMinor');
      expect(coreSource).toContain('remainingBeforeMinor - appliedMinor');
      expect(coreSource).toContain('bucket.bucketBalanceMinor === 0n');
      expect(coreSource).toContain('allocationSumMinor !== totalAppliedMinor');
      expect(coreSource).not.toMatch(/localeCompare|Intl\.Collator|Math\.max/);
    });

    it('has no IO, legacy authority, monetary Number conversion, HELD/fingerprint or attribution', () => {
      const sources = ['allocation-order.ts', 'apply-allocation-core.ts']
        .map((file) => readFileSync(join(__dirname, '..', file), 'utf8'))
        .join('\n');
      expect(sources).not.toMatch(/Prisma|process\.env|Date\.|new Date|Math\.random|fetch\(/);
      expect(sources).not.toMatch(
        /ClaimItem|collectedAmount|LedgerAllocation|CollectionAllocation|TBK100AllocatorService|SummaryEngine|CaseBalanceService|ClaimBucketAssembler/,
      );
      expect(sources).not.toMatch(/Number\(|parseFloat|parseInt|toFixed/);
      expect(sources).not.toMatch(/heldReason|planFingerprint|attribution|LegalApplicationWriter/);
    });
  });
});

function compileTimeReadonlySurface(
  success: PureApplyAllocationSuccess,
  contextKeyValue: BucketContextKey,
): void {
  // @ts-expect-error readonly arrays do not permit push
  success.allocations.push(success.allocations[0]);
  // @ts-expect-error readonly results cannot be reassigned
  success.remainingAmountMinor = 0n;
  void contextKeyValue;
}

void compileTimeReadonlySurface;
