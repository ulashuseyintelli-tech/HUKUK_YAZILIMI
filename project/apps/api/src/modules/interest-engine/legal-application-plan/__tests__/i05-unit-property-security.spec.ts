import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import fc from 'fast-check';
import {
  BUCKET_INSTANCE_IDENTITY_CONTRACT_VERSION,
  BUCKET_INSTANCE_IDENTITY_PREIMAGE_FIELDS,
  LEGAL_APPLICATION_COMPONENT_RANKS,
  LEGAL_APPLICATION_PLAN_HELD_NONE,
  MAX_CANONICAL_JSON_DEPTH,
  POSTGRES_BIGINT_MAX,
  SNAPSHOT_CONTRACT_VERSION,
  SNAPSHOT_SERIALIZATION_VERSION,
  allocateValidatedSnapshotForApply,
  assembleLegalApplicationPlan,
  compareBucketContextKeysUtf8,
  fingerprintLegalApplicationPlan,
  formatMinorAmount,
  parseAppliedAmountMinor,
  parseBucketBalanceMinor,
  parseBucketContextKey,
  parseBucketInstanceId,
  parseCaseId,
  parseCollectionId,
  parseCommandHash,
  parseComponentCode,
  parseEffectiveDate,
  parseHeldRemainderMinor,
  parseHistoryBoundaryRef,
  parseIdempotencyKey,
  parseMinorAmount,
  parseMinorUnit,
  parseReceiptAmountMinor,
  parseSnapshotHash,
  parseSnapshotRef,
  parseSourceLineageSetRef,
  parseSourceVersionSetHash,
  parseTenantId,
  produceBucketInstanceId,
  serializeCanonicalLegalApplicationPlanIdentity,
  validateBucketInstanceId,
  validateCanonicalSnapshot,
  type BucketInstanceIdentityPreimageInput,
  type BuildLegalApplicationPlanCommand,
  type CanonicalSnapshotValidationResult,
  type LegalApplicationComponentType,
  type LegalApplicationPlan,
  type LegalApplicationPlanFingerprintResult,
  type LegalApplicationPlanIdentityFacts,
  type LegalApplicationPlanResult,
  type ParseResult,
  type PlannedApplicationAttribution,
  type PlannedLegalApplication,
  type PureApplyAllocationSuccess,
  type ValidatedCanonicalSnapshotV1,
} from '..';
import {
  canonicalSnapshotRefForHash,
  computeCanonicalSnapshotHash,
  serializeCanonicalJson,
} from '../canonical-snapshot-serializer';
import {
  parseStrictJson,
  type StrictJsonValue,
} from '../strict-json-parser';

type MutableJsonObject = Record<string, StrictJsonValue>;

const SOURCE_VERSION_SET_HASH = 'c'.repeat(64);
const GOLDEN_SNAPSHOT_HASH =
  '3f9e63720a4c7dc1f91589793cfeb2a7ceb4cecbf93794d6d38a00a8085c8983';
const GOLDEN_PLAN_FINGERPRINT =
  'rcv-legal-application-plan:v1:sha256:d24ecd30dd1f6f1855fa0fed333ff38f1109556b24d443c3440c8aa0e0535110';
const COMPONENTS = [
  'COST',
  'ANCILLARY',
  'ACCRUED_INTEREST',
  'PRINCIPAL',
] as const satisfies readonly LegalApplicationComponentType[];

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
  return `binst:v1:sha256:${(index + 10_000)
    .toString(16)
    .padStart(64, '0')}`;
}

function identityPreimage(
  overrides: Partial<BucketInstanceIdentityPreimageInput> = {},
): BucketInstanceIdentityPreimageInput {
  return {
    identityContractVersion: BUCKET_INSTANCE_IDENTITY_CONTRACT_VERSION,
    tenantId: 'tenant-identity',
    caseId: 'case-identity',
    sourceVersionSetHash: SOURCE_VERSION_SET_HASH,
    historyBoundaryRef: 'history:identity',
    snapshotAsOfDate: '2026-07-23',
    applicationEffectiveDate: '2026-07-24',
    calculationRuleVersion: 'rule-v1',
    bucketContextKey: contextKey(1),
    ...overrides,
  };
}

function producedIdentity(input: BucketInstanceIdentityPreimageInput): {
  readonly value: string;
  readonly canonicalPreimage: string;
} {
  const result = produceBucketInstanceId(input);
  expect(result.ok).toBe(true);
  if (!result.ok) {
    throw new Error(result.error.code);
  }

  return result;
}

function bucket(
  index: number,
  componentType: LegalApplicationComponentType,
  balanceMinor: bigint,
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
  suffix = 'evidence',
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
    historyBoundaryRef: `history:${suffix}`,
    engineVersion: 'engine-v1',
    calculationRuleVersion: 'rule-v1',
    policyVersion: 'policy-v1',
    rateTableVersion: 'rate-v1',
    interpretationProfileId: 'interpretation-v1',
    bucketIdentityVersion: 'bucket-v1',
    sourceVersionSet: [
      { sourceReference: `source:${suffix}`, sourceVersion: '1' },
    ],
    sourceVersionSetHash: SOURCE_VERSION_SET_HASH,
    canonicalBuckets: [...canonicalBuckets],
  };
}

function validationRequest(
  snapshotValue: MutableJsonObject,
  commandOverrides: Record<string, unknown> = {},
  envelopeOverrides: Record<string, unknown> = {},
  direction: unknown = 'APPLY',
): Record<string, unknown> {
  const canonicalPayload = serializeCanonicalJson(snapshotValue);
  const snapshotHash = computeCanonicalSnapshotHash(
    Buffer.from(canonicalPayload, 'utf8'),
  );
  const snapshotRef = canonicalSnapshotRefForHash(snapshotHash);
  return {
    direction,
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
      idempotencyKey: 'idempotency-evidence',
      commandHash: 'command-hash-evidence',
      ...commandOverrides,
    },
    snapshotEnvelope: {
      snapshotRef,
      snapshotHash,
      canonicalPayload,
      ...envelopeOverrides,
    },
  };
}

function expectValidated(
  result: CanonicalSnapshotValidationResult,
): ValidatedCanonicalSnapshotV1 {
  expect(result.ok).toBe(true);
  if (!result.ok) {
    throw new Error(result.error.code);
  }

  return result.value;
}

function expectPlan(result: LegalApplicationPlanResult): LegalApplicationPlan {
  expect(result.ok).toBe(true);
  if (!result.ok) {
    throw new Error(result.error.code);
  }

  return result.plan;
}

function expectFingerprint(
  result: LegalApplicationPlanFingerprintResult,
): string {
  expect(result.ok).toBe(true);
  if (!result.ok) {
    throw new Error(result.error.code);
  }

  return result.planFingerprint;
}

interface PlanFixture {
  readonly validatedSnapshot: ValidatedCanonicalSnapshotV1;
  readonly command: BuildLegalApplicationPlanCommand;
  readonly allocation: PureApplyAllocationSuccess;
}

function planFixture(
  buckets: readonly MutableJsonObject[],
  receiptAmountMinor: bigint,
  suffix = 'evidence',
): PlanFixture {
  const snapshotValue = snapshot(buckets, receiptAmountMinor, suffix);
  const validatedSnapshot = expectValidated(
    validateCanonicalSnapshot(validationRequest(snapshotValue)),
  );
  const canonicalSnapshot = validatedSnapshot.snapshot;
  const command: BuildLegalApplicationPlanCommand = Object.freeze({
    tenantId: canonicalSnapshot.tenantId,
    caseId: canonicalSnapshot.caseId,
    collectionId: canonicalSnapshot.targetCollectionId,
    receiptAmountMinor: canonicalSnapshot.receiptAmountMinor,
    currency: canonicalSnapshot.currency,
    minorUnit: canonicalSnapshot.minorUnit,
    applicationEffectiveDate: canonicalSnapshot.applicationEffectiveDate,
    expectedSnapshotRef: validatedSnapshot.snapshotRef,
    expectedSnapshotHash: validatedSnapshot.snapshotHash,
    expectedSourceVersionSetHash: canonicalSnapshot.sourceVersionSetHash,
    expectedHistoryBoundaryRef: canonicalSnapshot.historyBoundaryRef,
    idempotencyKey: valueOf(
      parseIdempotencyKey(`idempotency-${suffix}`),
    ),
    commandHash: valueOf(parseCommandHash(`command-hash-${suffix}`)),
  });
  const allocation = allocateValidatedSnapshotForApply({
    validatedSnapshot,
    direction: 'APPLY',
    receiptAmountMinor: command.receiptAmountMinor,
  });
  expect(allocation.ok).toBe(true);
  if (!allocation.ok) {
    throw new Error(allocation.error.code);
  }

  return { validatedSnapshot, command, allocation };
}

function assembleFixture(
  fixture: PlanFixture,
  command = fixture.command,
  attributions?: readonly PlannedApplicationAttribution[],
): LegalApplicationPlan {
  return expectPlan(
    assembleLegalApplicationPlan({
      direction: 'APPLY',
      command,
      validatedSnapshot: fixture.validatedSnapshot,
      allocationResult: fixture.allocation,
      ...(attributions === undefined ? {} : { attributions }),
    }),
  );
}

function identityApplication(
  overrides: Partial<PlannedLegalApplication> = {},
): PlannedLegalApplication {
  return Object.freeze({
    componentType: 'COST',
    componentCode: valueOf(parseComponentCode('COST-MUTATION')),
    priorityRank: 1,
    sourceLineageSetRef: valueOf(
      parseSourceLineageSetRef('lineage:mutation'),
    ),
    bucketContextKey: valueOf(parseBucketContextKey(contextKey(700))),
    bucketInstanceId: valueOf(parseBucketInstanceId(instanceId(700))),
    sequence: 1,
    appliedAmountMinor: valueOf(parseAppliedAmountMinor('100')),
    bucketBeforeMinor: valueOf(parseBucketBalanceMinor('100')),
    bucketAfterMinor: valueOf(parseBucketBalanceMinor('0')),
    ...overrides,
  });
}

function identityFacts(
  overrides: Partial<LegalApplicationPlanIdentityFacts> = {},
): LegalApplicationPlanIdentityFacts {
  const snapshotHash = valueOf(parseSnapshotHash('a'.repeat(64)));
  return {
    direction: 'APPLY',
    tenantId: valueOf(parseTenantId('tenant-mutation')),
    caseId: valueOf(parseCaseId('case-mutation')),
    collectionId: valueOf(parseCollectionId('collection-mutation')),
    currency: 'TRY',
    minorUnit: valueOf(parseMinorUnit(2)),
    effectiveDate: valueOf(parseEffectiveDate('2026-07-23')),
    snapshotRef: valueOf(
      parseSnapshotRef(`rcv-app-snapshot:v1:sha256:${snapshotHash}`),
    ),
    snapshotHash,
    sourceVersionSetHash: valueOf(
      parseSourceVersionSetHash('b'.repeat(64)),
    ),
    historyBoundaryRef: valueOf(
      parseHistoryBoundaryRef('history:mutation'),
    ),
    receiptAmountMinor: valueOf(parseReceiptAmountMinor('125')),
    appliedAmountMinor: valueOf(parseAppliedAmountMinor('100')),
    heldRemainderMinor: valueOf(parseHeldRemainderMinor('25')),
    heldReason: 'EXCESS_OVER_ELIGIBLE_OUTSTANDING',
    applications: Object.freeze([identityApplication()]),
    ...overrides,
  };
}

function deepFrozen(value: unknown, seen = new Set<unknown>()): boolean {
  if (
    value === null ||
    (typeof value !== 'object' && typeof value !== 'function') ||
    seen.has(value)
  ) {
    return true;
  }
  seen.add(value);
  if (!Object.isFrozen(value)) {
    return false;
  }

  return Object.values(value).every((entry) => deepFrozen(entry, seen));
}

function jsonForInspection(value: unknown): string {
  return JSON.stringify(value, (_key, entry: unknown) =>
    typeof entry === 'bigint' ? entry.toString() : entry,
  );
}

function expectedAllocationOrder(
  buckets: readonly MutableJsonObject[],
): readonly string[] {
  return [...buckets]
    .filter((entry) => BigInt(String(entry.bucketBalanceMinor)) > 0n)
    .sort((left, right) => {
      const leftComponent =
        left.componentType as LegalApplicationComponentType;
      const rightComponent =
        right.componentType as LegalApplicationComponentType;
      const rankDelta =
        LEGAL_APPLICATION_COMPONENT_RANKS[leftComponent] -
        LEGAL_APPLICATION_COMPONENT_RANKS[rightComponent];
      if (rankDelta !== 0) {
        return rankDelta;
      }
      const priorityDelta =
        Number(left.priorityRank) - Number(right.priorityRank);
      if (priorityDelta !== 0) {
        return priorityDelta;
      }
      return compareBucketContextKeysUtf8(
        valueOf(parseBucketContextKey(left.bucketContextKey)),
        valueOf(parseBucketContextKey(right.bucketContextKey)),
      );
    })
    .map((entry) => String(entry.bucketContextKey));
}

describe('TPA-04C-I05 unit, property and security evidence expansion', () => {
  describe('primitive parser adversarial and resource-safety matrix', () => {
    it('roundtrips every bounded persistence-safe bigint sample without Number coercion', () => {
      fc.assert(
        fc.property(
          fc.bigInt({ min: 0n, max: POSTGRES_BIGINT_MAX }),
          (amount) => {
            const canonical = amount.toString();
            const parsed = parseMinorAmount(canonical);
            expect(parsed.ok).toBe(true);
            if (parsed.ok) {
              expect(parsed.value).toBe(amount);
              expect(formatMinorAmount(parsed.value)).toBe(canonical);
            }
          },
        ),
        { numRuns: 500, seed: 40_500 },
      );
    });

    it('rejects arbitrary non-canonical amount strings without throwing or leaking input', () => {
      const canonicalAmount = /^(0|[1-9][0-9]*)$/;
      fc.assert(
        fc.property(
          fc.string({ maxLength: 512 }),
          (candidate) => {
            const result = parseMinorAmount(candidate);
            const expected =
              canonicalAmount.test(candidate) &&
              BigInt(candidate) <= POSTGRES_BIGINT_MAX;
            expect(result.ok).toBe(expected);
            if (!result.ok) {
              expect(Object.keys(result.error).sort()).toEqual([
                'code',
                'field',
              ]);
              expect(result.error).not.toHaveProperty('value');
            }
          },
        ),
        { numRuns: 1_000, seed: 40_501 },
      );
    });

    it('keeps anchored hash/reference/date parsers fail-closed on long near-misses', () => {
      const oversized = 'a'.repeat(250_000);
      const cases: readonly ParseResult<unknown>[] = [
        parseSnapshotHash(oversized),
        parseSnapshotRef(`rcv-app-snapshot:v1:sha256:${oversized}Z`),
        parseBucketContextKey(`bctx:v1:sha256:${oversized}Z`),
        parseBucketInstanceId(`binst:v1:sha256:${oversized}Z`),
        parseEffectiveDate(`2026-07-23${oversized}`),
      ];

      expect(cases.every((result) => !result.ok)).toBe(true);
    });
  });

  describe('strict JSON, Unicode and deterministic validation security', () => {
    it('detects escaped duplicate keys and ignores structural tokens inside strings', () => {
      expect(parseStrictJson('{"plain":1,"\\u0070lain":2}')).toEqual({
        ok: false,
        failure: { kind: 'DUPLICATE_MEMBER', path: '$' },
      });
      expect(
        parseStrictJson(
          `{"probe":"${'[{'.repeat(100_000)}","safe":{"value":1}}`,
        ),
      ).toEqual({
        ok: true,
        value: {
          probe: '[{'.repeat(100_000),
          safe: { value: 1 },
        },
      });
    });

    it('pins depth 32 acceptance and depth 33 rejection independently of string content', () => {
      const nested = (depth: number): string =>
        `${'['.repeat(depth)}0${']'.repeat(depth)}`;
      expect(parseStrictJson(nested(MAX_CANONICAL_JSON_DEPTH)).ok).toBe(
        true,
      );
      expect(
        parseStrictJson(nested(MAX_CANONICAL_JSON_DEPTH + 1)),
      ).toEqual({
        ok: false,
        failure: {
          kind: 'MAX_DEPTH',
          actual: MAX_CANONICAL_JSON_DEPTH + 1,
        },
      });
    });

    it('preserves deterministic first-error precedence across compound faults', () => {
      const base = snapshot([bucket(1, 'COST', 100n)], 100n);
      const unsupportedContract = {
        ...base,
        snapshotContractVersion: 'UnsupportedSnapshotV9',
      };
      const unsupportedSerialization = {
        ...base,
        snapshotSerializationVersion: 'RCV-CAS/v999',
      };
      const cases: ReadonlyArray<
        readonly [Record<string, unknown>, string]
      > = [
        [
          validationRequest(
            unsupportedContract,
            { tenantId: 'wrong-tenant' },
            {},
            'REVERSAL',
          ),
          'SNAPSHOT_CONTRACT_UNSUPPORTED',
        ],
        [
          validationRequest(
            unsupportedSerialization,
            { tenantId: 'wrong-tenant' },
            {},
            'REVERSAL',
          ),
          'SNAPSHOT_SERIALIZATION_INVALID',
        ],
        [
          validationRequest(
            base,
            {
              tenantId: 'wrong-tenant',
              receiptAmountMinor: '101',
            },
            {},
            'REVERSAL',
          ),
          'DIRECTION_NOT_AUTHORIZED',
        ],
        [
          validationRequest(base, {
            tenantId: 'wrong-tenant',
            receiptAmountMinor: '101',
          }),
          'TENANT_CONTEXT_MISMATCH',
        ],
        [
          validationRequest(base, {
            receiptAmountMinor: '101',
            applicationEffectiveDate: '2026-07-24',
          }),
          'RECEIPT_AMOUNT_INVALID',
        ],
      ];

      for (const [request, expectedCode] of cases) {
        for (let repetition = 0; repetition < 25; repetition += 1) {
          const result = validateCanonicalSnapshot(request);
          expect(result).toEqual({
            ok: false,
            error: expect.objectContaining({ code: expectedCode }),
          });
        }
      }
    });

    it('never returns raw payload, free text, IBAN-like or PII-like input in errors', () => {
      const secret =
        'TR330006100519786457841326|TC=12345678901|free-text-secret-é';
      const invalid = snapshot([bucket(1, 'COST', 100n)], 100n);
      invalid.historyBoundaryRef = secret.normalize('NFD');
      const result = validateCanonicalSnapshot(validationRequest(invalid));
      expect(result.ok).toBe(false);
      expect(jsonForInspection(result)).not.toContain(secret);
      expect(jsonForInspection(result)).not.toContain('12345678901');
    });
  });

  describe('RCV-CAS/v1 and RCV-LAP/v1 golden vectors', () => {
    it('pins the canonical snapshot bytes, domain hash and snapshot reference', () => {
      const golden = snapshot(
        [
          {
            ...bucket(1, 'COST', 25n, 1),
            componentCode: 'COST-GOLDEN',
            sourceLineageSetRef: 'lineage:cost',
          },
          {
            ...bucket(2, 'PRINCIPAL', 200n, 1),
            componentCode: 'PRINCIPAL-GOLDEN',
            sourceLineageSetRef: 'lineage:principal',
          },
        ],
        125n,
        'golden',
      );
      golden.sourceVersionSet = [
        { sourceReference: 'source:golden', sourceVersion: '1' },
      ];
      const canonicalPayload = serializeCanonicalJson(golden);
      const snapshotHash = computeCanonicalSnapshotHash(
        Buffer.from(canonicalPayload, 'utf8'),
      );

      expect(snapshotHash).toBe(GOLDEN_SNAPSHOT_HASH);
      expect(canonicalSnapshotRefForHash(snapshotHash)).toBe(
        `rcv-app-snapshot:v1:sha256:${GOLDEN_SNAPSHOT_HASH}`,
      );
      expect(canonicalPayload.startsWith('{"applicationEffectiveDate":')).toBe(
        true,
      );
      expect(canonicalPayload.endsWith('"tenantId":"tenant-golden"}')).toBe(
        true,
      );
    });

    it('pins the end-to-end allocation, HELD absence and plan fingerprint vector', () => {
      const value = planFixture(
        [
          {
            ...bucket(1, 'COST', 25n, 1),
            componentCode: 'COST-GOLDEN',
            sourceLineageSetRef: 'lineage:cost',
          },
          {
            ...bucket(2, 'PRINCIPAL', 200n, 1),
            componentCode: 'PRINCIPAL-GOLDEN',
            sourceLineageSetRef: 'lineage:principal',
          },
        ],
        125n,
        'golden',
      );
      const plan = assembleFixture(value);

      expect(value.validatedSnapshot.snapshotHash).toBe(
        GOLDEN_SNAPSHOT_HASH,
      );
      expect(plan.planFingerprint).toBe(GOLDEN_PLAN_FINGERPRINT);
      expect(plan.appliedAmountMinor).toBe(125n);
      expect(plan.heldRemainderMinor).toBe(0n);
      expect(plan).not.toHaveProperty('heldReason');
      expect(
        plan.applications.map((application) => ({
          component: application.componentType,
          amount: application.appliedAmountMinor,
          after: application.bucketAfterMinor,
        })),
      ).toEqual([
        { component: 'COST', amount: 25n, after: 0n },
        { component: 'PRINCIPAL', amount: 100n, after: 100n },
      ]);
    });

    it('keeps snapshot and plan protocols cryptographically domain-separated', () => {
      const facts = identityFacts();
      const identityBytes =
        serializeCanonicalLegalApplicationPlanIdentity(facts);
      expect(Buffer.isBuffer(identityBytes)).toBe(true);
      if (!Buffer.isBuffer(identityBytes)) {
        throw new Error(identityBytes.error.code);
      }

      const snapshotDomainDigest = computeCanonicalSnapshotHash(identityBytes);
      const planDomainDigest = expectFingerprint(
        fingerprintLegalApplicationPlan(facts),
      ).slice('rcv-legal-application-plan:v1:sha256:'.length);
      const unseparatedDigest = createHash('sha256')
        .update(identityBytes)
        .digest('hex');

      expect(planDomainDigest).not.toBe(snapshotDomainDigest);
      expect(planDomainDigest).not.toBe(unseparatedDigest);
      expect(snapshotDomainDigest).not.toBe(unseparatedDigest);
    });
  });

  describe('allocation, conservation, HELD and replay properties', () => {
    const bucketArbitrary = fc.uniqueArray(
      fc.record({
        index: fc.integer({ min: 1, max: 1_000_000 }),
        componentIndex: fc.integer({ min: 0, max: COMPONENTS.length - 1 }),
        balanceMinor: fc.bigInt({ min: 0n, max: 100_000n }),
        priorityRank: fc.integer({ min: 0, max: 100 }),
      }),
      {
        minLength: 1,
        maxLength: 12,
        selector: (entry) => entry.index,
      },
    );

    it('preserves TBK100 ordering, exact-cent conservation and HELD equivalence', () => {
      fc.assert(
        fc.property(
          bucketArbitrary,
          fc.bigInt({ min: 1n, max: 500_000n }),
          (entries, receiptAmountMinor) => {
            const buckets = entries.map((entry) =>
              bucket(
                entry.index,
                COMPONENTS[entry.componentIndex],
                entry.balanceMinor,
                entry.priorityRank,
              ),
            );
            const value = planFixture(
              buckets,
              receiptAmountMinor,
              `property-${entries[0].index}-${receiptAmountMinor}`,
            );
            const plan = assembleFixture(value);
            const totalEligible = entries.reduce(
              (sum, entry) => sum + entry.balanceMinor,
              0n,
            );
            const expectedApplied =
              receiptAmountMinor < totalEligible
                ? receiptAmountMinor
                : totalEligible;
            const expectedHeld = receiptAmountMinor - expectedApplied;

            expect(plan.appliedAmountMinor).toBe(expectedApplied);
            expect(plan.heldRemainderMinor).toBe(expectedHeld);
            expect(receiptAmountMinor).toBe(
              plan.appliedAmountMinor + plan.heldRemainderMinor,
            );
            expect(
              plan.applications.map(
                (application) => application.bucketContextKey,
              ),
            ).toEqual(
              expectedAllocationOrder(buckets).slice(
                0,
                plan.applications.length,
              ),
            );
            for (const application of plan.applications) {
              expect(application.bucketBeforeMinor).toBe(
                application.appliedAmountMinor +
                  application.bucketAfterMinor,
              );
              expect(application.appliedAmountMinor).toBeGreaterThan(0n);
            }
            if (expectedHeld === 0n) {
              expect(plan).not.toHaveProperty('heldReason');
            } else if (expectedApplied === 0n) {
              expect(plan.heldReason).toBe('NO_ELIGIBLE_OUTSTANDING');
            } else {
              expect(plan.heldReason).toBe(
                'EXCESS_OVER_ELIGIBLE_OUTSTANDING',
              );
            }
          },
        ),
        { numRuns: 200, seed: 40_502 },
      );
    });

    it('is deeply immutable and replay-deterministic without generated facts', () => {
      const value = planFixture(
        [
          bucket(1, 'COST', 10n),
          bucket(2, 'ANCILLARY', 20n),
          bucket(3, 'ACCRUED_INTEREST', 30n),
          bucket(4, 'PRINCIPAL', 40n),
        ],
        125n,
        'replay',
      );
      const baseline = assembleFixture(value);
      expect(deepFrozen(baseline)).toBe(true);

      for (let repetition = 0; repetition < 100; repetition += 1) {
        const replay = assembleFixture(value);
        expect(replay).toEqual(baseline);
        expect(replay.planFingerprint).toBe(baseline.planFingerprint);
        expect(deepFrozen(replay)).toBe(true);
      }
      expect(Object.keys(baseline)).not.toEqual(
        expect.arrayContaining([
          'createdAt',
          'updatedAt',
          'timestamp',
          'random',
          'uuid',
          'databaseId',
        ]),
      );
    });
  });

  describe('authoritative fingerprint sensitivity and exclusion matrices', () => {
    it('changes the fingerprint for every independently authoritative fact mutation', () => {
      const base = identityFacts();
      const baseline = expectFingerprint(
        fingerprintLegalApplicationPlan(base),
      );
      const alternateHash = valueOf(parseSnapshotHash('d'.repeat(64)));
      const application = base.applications[0];
      const mutations: ReadonlyArray<
        readonly [
          string,
          (facts: LegalApplicationPlanIdentityFacts) =>
            LegalApplicationPlanIdentityFacts,
        ]
      > = [
        [
          'tenantId',
          (facts) => ({
            ...facts,
            tenantId: valueOf(parseTenantId('tenant-mutated')),
          }),
        ],
        [
          'caseId',
          (facts) => ({
            ...facts,
            caseId: valueOf(parseCaseId('case-mutated')),
          }),
        ],
        [
          'collectionId',
          (facts) => ({
            ...facts,
            collectionId: valueOf(
              parseCollectionId('collection-mutated'),
            ),
          }),
        ],
        ['currency', (facts) => ({ ...facts, currency: 'USD' })],
        [
          'minorUnit',
          (facts) => ({ ...facts, minorUnit: valueOf(parseMinorUnit(3)) }),
        ],
        [
          'effectiveDate',
          (facts) => ({
            ...facts,
            effectiveDate: valueOf(parseEffectiveDate('2026-07-24')),
          }),
        ],
        [
          'snapshotRef',
          (facts) => ({
            ...facts,
            snapshotRef: valueOf(
              parseSnapshotRef(
                `rcv-app-snapshot:v1:sha256:${alternateHash}`,
              ),
            ),
          }),
        ],
        [
          'snapshotHash',
          (facts) => ({ ...facts, snapshotHash: alternateHash }),
        ],
        [
          'sourceVersionSetHash',
          (facts) => ({
            ...facts,
            sourceVersionSetHash: valueOf(
              parseSourceVersionSetHash('e'.repeat(64)),
            ),
          }),
        ],
        [
          'historyBoundaryRef',
          (facts) => ({
            ...facts,
            historyBoundaryRef: valueOf(
              parseHistoryBoundaryRef('history:mutated'),
            ),
          }),
        ],
        [
          'receipt/held',
          (facts) => ({
            ...facts,
            receiptAmountMinor: valueOf(parseReceiptAmountMinor('126')),
            heldRemainderMinor: valueOf(parseHeldRemainderMinor('26')),
          }),
        ],
        [
          'component',
          (facts) => ({
            ...facts,
            applications: Object.freeze([
              identityApplication({ componentType: 'ANCILLARY' }),
            ]),
          }),
        ],
        [
          'componentCode',
          (facts) => ({
            ...facts,
            applications: Object.freeze([
              identityApplication({
                componentCode: valueOf(
                  parseComponentCode('COST-MUTATED'),
                ),
              }),
            ]),
          }),
        ],
        [
          'priorityRank',
          (facts) => ({
            ...facts,
            applications: Object.freeze([
              identityApplication({ priorityRank: 2 }),
            ]),
          }),
        ],
        [
          'bucketContextKey',
          (facts) => ({
            ...facts,
            applications: Object.freeze([
              identityApplication({
                bucketContextKey: valueOf(
                  parseBucketContextKey(contextKey(701)),
                ),
              }),
            ]),
          }),
        ],
        [
          'bucketInstanceId',
          (facts) => ({
            ...facts,
            applications: Object.freeze([
              identityApplication({
                bucketInstanceId: valueOf(
                  parseBucketInstanceId(instanceId(701)),
                ),
              }),
            ]),
          }),
        ],
        [
          'sourceLineageSetRef',
          (facts) => ({
            ...facts,
            applications: Object.freeze([
              identityApplication({
                sourceLineageSetRef: valueOf(
                  parseSourceLineageSetRef('lineage:mutated'),
                ),
              }),
            ]),
          }),
        ],
        [
          'bucketBefore/after',
          (facts) => ({
            ...facts,
            applications: Object.freeze([
              identityApplication({
                bucketBeforeMinor: valueOf(
                  parseBucketBalanceMinor('101'),
                ),
                bucketAfterMinor: valueOf(parseBucketBalanceMinor('1')),
              }),
            ]),
          }),
        ],
        [
          'applied amount',
          (facts) => ({
            ...facts,
            appliedAmountMinor: valueOf(parseAppliedAmountMinor('99')),
            heldRemainderMinor: valueOf(parseHeldRemainderMinor('26')),
            applications: Object.freeze([
              identityApplication({
                appliedAmountMinor: valueOf(
                  parseAppliedAmountMinor('99'),
                ),
                bucketAfterMinor: valueOf(parseBucketBalanceMinor('1')),
              }),
            ]),
          }),
        ],
        [
          'application cardinality/order',
          (facts) => ({
            ...facts,
            appliedAmountMinor: valueOf(parseAppliedAmountMinor('100')),
            applications: Object.freeze([
              identityApplication({
                appliedAmountMinor: valueOf(
                  parseAppliedAmountMinor('50'),
                ),
                bucketBeforeMinor: valueOf(
                  parseBucketBalanceMinor('50'),
                ),
                bucketAfterMinor: valueOf(parseBucketBalanceMinor('0')),
              }),
              identityApplication({
                componentType: 'PRINCIPAL',
                componentCode: valueOf(
                  parseComponentCode('PRINCIPAL-MUTATION'),
                ),
                priorityRank: 2,
                bucketContextKey: valueOf(
                  parseBucketContextKey(contextKey(702)),
                ),
                bucketInstanceId: valueOf(
                  parseBucketInstanceId(instanceId(702)),
                ),
                sourceLineageSetRef: valueOf(
                  parseSourceLineageSetRef('lineage:mutation-2'),
                ),
                sequence: 2,
                appliedAmountMinor: valueOf(
                  parseAppliedAmountMinor('50'),
                ),
                bucketBeforeMinor: valueOf(
                  parseBucketBalanceMinor('50'),
                ),
                bucketAfterMinor: valueOf(parseBucketBalanceMinor('0')),
              }),
            ]),
          }),
        ],
      ];

      for (const [name, mutate] of mutations) {
        const fingerprint = expectFingerprint(
          fingerprintLegalApplicationPlan(mutate(base)),
        );
        expect({ name, fingerprint }).not.toEqual({
          name,
          fingerprint: baseline,
        });
      }
      expect(application.appliedAmountMinor).toBe(100n);
    });

    it('excludes replay identifiers and attribution content from economic authority', () => {
      const value = planFixture(
        [
          bucket(1, 'COST', 50n),
          bucket(2, 'PRINCIPAL', 50n),
        ],
        100n,
        'exclusion',
      );
      const baseline = assembleFixture(value);
      const changedReplayCommand: BuildLegalApplicationPlanCommand =
        Object.freeze({
          ...value.command,
          idempotencyKey: valueOf(
            parseIdempotencyKey('different-idempotency-key'),
          ),
          commandHash: valueOf(parseCommandHash('different-command-hash')),
        });
      const replayChanged = assembleFixture(
        value,
        changedReplayCommand,
      );
      const firstApplication = baseline.applications[0];
      const secondApplication = baseline.applications[1];
      const richAttributions = Object.freeze([
        Object.freeze({
          bucketInstanceId: secondApplication.bucketInstanceId,
          sourceLineageSetRef: secondApplication.sourceLineageSetRef,
          attributedAmountMinor: secondApplication.appliedAmountMinor,
          iban: 'TR330006100519786457841326',
          freeText: 'must-not-cross-boundary',
          claimItemId: 'legacy-claim-item-id',
        }),
        Object.freeze({
          bucketInstanceId: firstApplication.bucketInstanceId,
          sourceLineageSetRef: firstApplication.sourceLineageSetRef,
        }),
      ]) as unknown as readonly PlannedApplicationAttribution[];
      const attributionChanged = assembleFixture(
        value,
        value.command,
        richAttributions,
      );

      expect(replayChanged.planFingerprint).toBe(
        baseline.planFingerprint,
      );
      expect(attributionChanged.planFingerprint).toBe(
        baseline.planFingerprint,
      );
      expect(attributionChanged.applications).toEqual(
        baseline.applications,
      );
      expect(attributionChanged.appliedAmountMinor).toBe(
        baseline.appliedAmountMinor,
      );
      expect(attributionChanged.heldRemainderMinor).toBe(
        baseline.heldRemainderMinor,
      );
      expect(jsonForInspection(attributionChanged)).not.toMatch(
        /TR330006100519786457841326|must-not-cross-boundary|legacy-claim-item-id|iban|freeText|claimItemId/,
      );
    });

    it('rejects inconsistent mutations instead of fingerprinting corrupted facts', () => {
      const base = identityFacts();
      const invalidCases: ReadonlyArray<
        readonly [
          Partial<LegalApplicationPlanIdentityFacts>,
          string,
        ]
      > = [
        [
          {
            heldRemainderMinor: valueOf(parseHeldRemainderMinor('24')),
          },
          'CONSERVATION_FAILURE',
        ],
        [
          {
            heldReason: LEGAL_APPLICATION_PLAN_HELD_NONE,
          },
          'CONSERVATION_FAILURE',
        ],
        [
          {
            applications: Object.freeze([
              identityApplication({
                bucketAfterMinor: valueOf(parseBucketBalanceMinor('1')),
              }),
            ]),
          },
          'CONSERVATION_FAILURE',
        ],
        [
          {
            applications: Object.freeze([
              identityApplication({
                componentType:
                  'LEGACY_CLAIM_ITEM' as LegalApplicationComponentType,
              }),
            ]),
          },
          'FORMATION_CONTEXT_INCOMPLETE',
        ],
      ];

      for (const [overrides, expectedCode] of invalidCases) {
        expect(
          fingerprintLegalApplicationPlan({ ...base, ...overrides }),
        ).toEqual({
          ok: false,
          error: { code: expectedCode },
        });
      }
    });
  });

  describe('TPA-04D-I01 non-circular bucket instance identity', () => {
    it('serializes the ratified nine-field preimage in exact order and hashes it deterministically', () => {
      const input = identityPreimage();
      const first = producedIdentity(input);
      const second = producedIdentity({ ...input });
      const expectedPreimage = JSON.stringify([
        BUCKET_INSTANCE_IDENTITY_CONTRACT_VERSION,
        input.tenantId,
        input.caseId,
        input.sourceVersionSetHash,
        input.historyBoundaryRef,
        input.snapshotAsOfDate,
        input.applicationEffectiveDate,
        input.calculationRuleVersion,
        input.bucketContextKey,
      ]);
      const expectedDigest = createHash('sha256')
        .update(Buffer.from('RCV-BINST/v1\0', 'utf8'))
        .update(Buffer.from(expectedPreimage, 'utf8'))
        .digest('hex');

      expect(BUCKET_INSTANCE_IDENTITY_PREIMAGE_FIELDS).toEqual([
        'identityContractVersion',
        'tenantId',
        'caseId',
        'sourceVersionSetHash',
        'historyBoundaryRef',
        'snapshotAsOfDate',
        'applicationEffectiveDate',
        'calculationRuleVersion',
        'bucketContextKey',
      ]);
      expect(first).toEqual(second);
      expect(first.canonicalPreimage).toBe(expectedPreimage);
      expect(first.value).toBe(`binst:v1:sha256:${expectedDigest}`);
    });

    it('uses the exact RCV-BINST/v1 NUL domain separator', () => {
      const produced = producedIdentity(identityPreimage());
      const withoutNul = createHash('sha256')
        .update(Buffer.from('RCV-BINST/v1', 'utf8'))
        .update(Buffer.from(produced.canonicalPreimage, 'utf8'))
        .digest('hex');
      const wrongDomain = createHash('sha256')
        .update(Buffer.from('RCV-BINST/v2\0', 'utf8'))
        .update(Buffer.from(produced.canonicalPreimage, 'utf8'))
        .digest('hex');

      expect(produced.value).not.toBe(`binst:v1:sha256:${withoutNul}`);
      expect(produced.value).not.toBe(`binst:v1:sha256:${wrongDomain}`);
    });

    it('excludes snapshotRef and snapshotHash from the preimage and rejects circular extras', () => {
      expect(BUCKET_INSTANCE_IDENTITY_PREIMAGE_FIELDS).not.toEqual(
        expect.arrayContaining(['snapshotRef', 'snapshotHash']),
      );
      const firstSnapshot = snapshot([bucket(1, 'COST', 100n)], 100n, 'identity');
      const secondSnapshot = { ...firstSnapshot, receiptAmountMinor: '99' };
      const firstSnapshotHash = computeCanonicalSnapshotHash(
        Buffer.from(serializeCanonicalJson(firstSnapshot), 'utf8'),
      );
      const secondSnapshotHash = computeCanonicalSnapshotHash(
        Buffer.from(serializeCanonicalJson(secondSnapshot), 'utf8'),
      );
      const baseline = producedIdentity(identityPreimage());
      const changedEnvelopeEvidence = producedIdentity(identityPreimage());

      expect(firstSnapshotHash).not.toBe(secondSnapshotHash);
      expect(changedEnvelopeEvidence).toEqual(baseline);
      expect(
        produceBucketInstanceId({
          ...identityPreimage(),
          snapshotRef: `rcv-app-snapshot:v1:sha256:${'a'.repeat(64)}`,
        } as BucketInstanceIdentityPreimageInput),
      ).toEqual({
        ok: false,
        error: { code: 'PREIMAGE_SHAPE_INVALID' },
      });
      expect(
        produceBucketInstanceId({
          ...identityPreimage(),
          snapshotHash: 'b'.repeat(64),
        } as BucketInstanceIdentityPreimageInput),
      ).toEqual({
        ok: false,
        error: { code: 'PREIMAGE_SHAPE_INVALID' },
      });
    });

    it('changes identity when any included semantic field changes', () => {
      const baseline = producedIdentity(identityPreimage()).value;
      const mutations: ReadonlyArray<Partial<BucketInstanceIdentityPreimageInput>> = [
        { tenantId: 'tenant-other' },
        { caseId: 'case-other' },
        { sourceVersionSetHash: 'd'.repeat(64) },
        { historyBoundaryRef: 'history:other' },
        { snapshotAsOfDate: '2026-07-22' },
        { applicationEffectiveDate: '2026-07-25' },
        { calculationRuleVersion: 'rule-v2' },
        { bucketContextKey: contextKey(2) },
      ];

      for (const mutation of mutations) {
        expect(producedIdentity(identityPreimage(mutation)).value).not.toBe(baseline);
      }
    });

    it('shares one producer contract with the validator and detects tampering', () => {
      const input = identityPreimage();
      const produced = producedIdentity(input);

      expect(validateBucketInstanceId(input, produced.value)).toEqual({
        ok: true,
        value: produced.value,
        canonicalPreimage: produced.canonicalPreimage,
      });
      expect(validateBucketInstanceId(input, instanceId(99))).toEqual({
        ok: false,
        error: {
          code: 'BUCKET_INSTANCE_ID_MISMATCH',
          field: 'bucketInstanceId',
        },
      });
      expect(validateBucketInstanceId(input, 'not-an-id')).toEqual({
        ok: false,
        error: {
          code: 'BUCKET_INSTANCE_ID_FORMAT_INVALID',
          field: 'bucketInstanceId',
        },
      });
    });

    it('fails closed for unsupported, malformed and non-canonical preimage inputs', () => {
      const cases: ReadonlyArray<
        readonly [Partial<BucketInstanceIdentityPreimageInput>, string, string]
      > = [
        [{ identityContractVersion: 'RCV-BINST/v2' }, 'IDENTITY_CONTRACT_UNSUPPORTED', 'identityContractVersion'],
        [{ tenantId: ' tenant-identity' }, 'PREIMAGE_FIELD_INVALID', 'tenantId'],
        [{ sourceVersionSetHash: 'ABC' }, 'PREIMAGE_FIELD_INVALID', 'sourceVersionSetHash'],
        [{ snapshotAsOfDate: '2026-02-30' }, 'PREIMAGE_FIELD_INVALID', 'snapshotAsOfDate'],
        [{ applicationEffectiveDate: '24-07-2026' }, 'PREIMAGE_FIELD_INVALID', 'applicationEffectiveDate'],
        [{ bucketContextKey: 'bctx:invalid' }, 'PREIMAGE_FIELD_INVALID', 'bucketContextKey'],
        [{ calculationRuleVersion: 'rule-e\u0301' }, 'PREIMAGE_FIELD_INVALID', 'calculationRuleVersion'],
      ];

      for (const [mutation, code, field] of cases) {
        expect(produceBucketInstanceId(identityPreimage(mutation))).toEqual({
          ok: false,
          error: { code, field },
        });
      }
    });

    it('enforces the same identity derivation at the canonical snapshot boundary', () => {
      const canonicalBucket = bucket(1, 'COST', 100n);
      const snapshotValue = snapshot([canonicalBucket], 100n, 'identity');
      snapshotValue.bucketIdentityVersion = BUCKET_INSTANCE_IDENTITY_CONTRACT_VERSION;
      const identity = producedIdentity(
        identityPreimage({
          tenantId: snapshotValue.tenantId,
          caseId: snapshotValue.caseId,
          sourceVersionSetHash: snapshotValue.sourceVersionSetHash,
          historyBoundaryRef: snapshotValue.historyBoundaryRef,
          snapshotAsOfDate: snapshotValue.snapshotAsOfDate,
          applicationEffectiveDate: snapshotValue.applicationEffectiveDate,
          calculationRuleVersion: snapshotValue.calculationRuleVersion,
          bucketContextKey: canonicalBucket.bucketContextKey,
        }),
      );
      canonicalBucket.bucketInstanceId = identity.value;

      expect(validateCanonicalSnapshot(validationRequest(snapshotValue)).ok).toBe(true);

      canonicalBucket.bucketInstanceId = instanceId(999);
      const tampered = validateCanonicalSnapshot(validationRequest(snapshotValue));
      expect(tampered.ok).toBe(false);
      if (!tampered.ok) {
        expect(tampered.error.code).toBe('BUCKET_IDENTITY_INVALID');
      }
    });
  });

  describe('trust-boundary and dormant architecture isolation', () => {
    it('rejects raw snapshot objects and preserves the compile-time non-forgeable boundary', () => {
      const raw = snapshot([bucket(1, 'COST', 100n)], 100n);
      expect(validateCanonicalSnapshot(raw)).toEqual({
        ok: false,
        error: { code: 'SNAPSHOT_UNAVAILABLE' },
      });
    });

    it('keeps the package free from legacy allocators, persistence and runtime wiring imports', () => {
      const packageDirectory = join(__dirname, '..');
      const productionFiles = readdirSync(packageDirectory)
        .filter((name) => name.endsWith('.ts'))
        .sort();
      const moduleSpecifiers: string[] = [];

      for (const name of productionFiles) {
        const source = readFileSync(
          join(packageDirectory, name),
          'utf8',
        );
        for (const match of source.matchAll(
          /\bfrom\s+['"]([^'"]+)['"]|\brequire\(\s*['"]([^'"]+)['"]\s*\)|\bimport\(\s*['"]([^'"]+)['"]\s*\)/g,
        )) {
          moduleSpecifiers.push(match[1] ?? match[2] ?? match[3]);
        }
        expect(source).not.toMatch(
          /\bDate\.now\(|\bnew Date\(|\bMath\.random\(|\bprocess\.env\b|\bfetch\(|\bsetTimeout\(/,
        );
      }

      expect(moduleSpecifiers).not.toEqual(
        expect.arrayContaining([
          expect.stringMatching(
            /claim-item|summary-engine|collection-allocation|ledger-allocation|@prisma|prisma/i,
          ),
        ]),
      );
      expect(productionFiles).toEqual([
        'allocation-order.ts',
        'apply-allocation-core.ts',
        'bucket-instance-identity.ts',
        'canonical-snapshot-serializer.ts',
        'canonical-snapshot-validator.ts',
        'contracts.ts',
        'index.ts',
        'legal-application-plan-builder.ts',
        'plan-fingerprint.ts',
        'primitives.ts',
        'strict-json-parser.ts',
        'validation-constants.ts',
      ]);
    });
  });
});

function compileTimeNonForgeableBoundary(
  value: ValidatedCanonicalSnapshotV1,
): void {
  // @ts-expect-error the private validator brand prevents a raw object crossing the boundary
  const forged: ValidatedCanonicalSnapshotV1 = {
    snapshotRef: value.snapshotRef,
    snapshotHash: value.snapshotHash,
    canonicalPayload: value.canonicalPayload,
    snapshot: value.snapshot,
  };
  void forged;
}

void compileTimeNonForgeableBoundary;
