import { createHash } from 'node:crypto';
import fc from 'fast-check';
import {
  LEGAL_APPLICATION_PLAN_FINGERPRINT_CONTRACT_VERSION,
  LEGAL_APPLICATION_PLAN_HELD_NONE,
  POSTGRES_BIGINT_MAX,
  fingerprintLegalApplicationPlan,
  parseAppliedAmountMinor,
  parseBucketBalanceMinor,
  parseBucketContextKey,
  parseBucketInstanceId,
  parseCaseId,
  parseCollectionId,
  parseComponentCode,
  parseEffectiveDate,
  parseHeldRemainderMinor,
  parseHistoryBoundaryRef,
  parseMinorUnit,
  parseReceiptAmountMinor,
  parseSnapshotHash,
  parseSnapshotRef,
  parseSourceLineageSetRef,
  parseSourceVersionSetHash,
  parseTenantId,
  serializeCanonicalLegalApplicationPlanIdentity,
  type LegalApplicationPlanFingerprintResult,
  type LegalApplicationPlanIdentityFacts,
  type BucketContextKey,
  type BucketInstanceId,
  type ParseResult,
  type PlannedLegalApplication,
} from '..';

function valueOf<T>(result: ParseResult<T>): T {
  if (!result.ok) {
    throw new Error(`${result.error.field}:${result.error.code}`);
  }
  return result.value;
}

function contextKey(index: number): BucketContextKey {
  return valueOf(
    parseBucketContextKey(
      `bctx:v1:sha256:${index.toString(16).padStart(64, '0')}`,
    ),
  );
}

function instanceId(index: number): BucketInstanceId {
  return valueOf(
    parseBucketInstanceId(
      `binst:v1:sha256:${(index + 10_000).toString(16).padStart(64, '0')}`,
    ),
  );
}

function application(
  index: number,
  amount = 10n,
): PlannedLegalApplication {
  const after = 0n;
  return Object.freeze({
    componentType: index === 1 ? 'COST' : 'PRINCIPAL',
    componentCode: valueOf(parseComponentCode(`component-${index}`)),
    priorityRank: index,
    sourceLineageSetRef: valueOf(
      parseSourceLineageSetRef(`lineage:${index}`),
    ),
    bucketContextKey: contextKey(index),
    bucketInstanceId: instanceId(index),
    sequence: index,
    appliedAmountMinor: valueOf(parseAppliedAmountMinor(amount.toString())),
    bucketBeforeMinor: valueOf(
      parseBucketBalanceMinor((amount + after).toString()),
    ),
    bucketAfterMinor: valueOf(parseBucketBalanceMinor(after.toString())),
  });
}

function identityFacts(
  overrides: Partial<LegalApplicationPlanIdentityFacts> = {},
): LegalApplicationPlanIdentityFacts {
  const snapshotHash = valueOf(parseSnapshotHash('a'.repeat(64)));
  const receiptAmountMinor = valueOf(parseReceiptAmountMinor('20'));
  const appliedAmountMinor = valueOf(parseAppliedAmountMinor('20'));
  return {
    direction: 'APPLY',
    tenantId: valueOf(parseTenantId('tenant-1')),
    caseId: valueOf(parseCaseId('case-1')),
    collectionId: valueOf(parseCollectionId('collection-1')),
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
    historyBoundaryRef: valueOf(parseHistoryBoundaryRef('history:v1')),
    receiptAmountMinor,
    appliedAmountMinor,
    heldRemainderMinor: valueOf(parseHeldRemainderMinor('0')),
    heldReason: LEGAL_APPLICATION_PLAN_HELD_NONE,
    applications: Object.freeze([application(1), application(2)]),
    ...overrides,
  };
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

function serializedIdentity(facts: LegalApplicationPlanIdentityFacts): string {
  const result = serializeCanonicalLegalApplicationPlanIdentity(facts);
  expect(Buffer.isBuffer(result)).toBe(true);
  if (!Buffer.isBuffer(result)) {
    throw new Error(result.error.code);
  }
  return result.toString('utf8');
}

describe('TPA-04C-I04 RCV-LAP/v1 plan fingerprint', () => {
  it('serializes the exact top-level and application property order', () => {
    const serialized = serializedIdentity(identityFacts());
    const topLevelKeys = [
      'contractVersion',
      'direction',
      'tenantId',
      'caseId',
      'collectionId',
      'currency',
      'minorUnit',
      'effectiveDate',
      'snapshotRef',
      'snapshotHash',
      'sourceVersionSetHash',
      'historyBoundaryRef',
      'receiptAmountMinor',
      'appliedAmountMinor',
      'heldRemainderMinor',
      'heldReason',
      'applications',
    ];
    let priorIndex = -1;
    for (const key of topLevelKeys) {
      const currentIndex = serialized.indexOf(`"${key}":`);
      expect(currentIndex).toBeGreaterThan(priorIndex);
      priorIndex = currentIndex;
    }

    const firstApplication = serialized.slice(serialized.indexOf('[{') + 1);
    const applicationKeys = [
      'component',
      'componentCode',
      'priorityRank',
      'bucketContextKey',
      'bucketInstanceId',
      'sourceLineageSetRef',
      'bucketBeforeMinor',
      'appliedAmountMinor',
      'bucketAfterMinor',
    ];
    priorIndex = -1;
    for (const key of applicationKeys) {
      const currentIndex = firstApplication.indexOf(`"${key}":`);
      expect(currentIndex).toBeGreaterThan(priorIndex);
      priorIndex = currentIndex;
    }

    expect(serialized).toContain(
      `"contractVersion":"${LEGAL_APPLICATION_PLAN_FINGERPRINT_CONTRACT_VERSION}"`,
    );
    expect(serialized).not.toMatch(
      /idempotencyKey|commandHash|actor|correlation|attribution|ClaimItem|canonicalPayload/,
    );
  });

  it('uses the exact UTF-8 domain separator, NUL byte and reference format', () => {
    const facts = identityFacts();
    const identityBytes = Buffer.from(serializedIdentity(facts), 'utf8');
    const expectedDigest = createHash('sha256')
      .update(Buffer.from('RCV-LAP/v1', 'utf8'))
      .update(Buffer.from([0]))
      .update(identityBytes)
      .digest('hex');
    const fingerprint = expectFingerprint(fingerprintLegalApplicationPlan(facts));

    expect(fingerprint).toBe(
      `rcv-legal-application-plan:v1:sha256:${expectedDigest}`,
    );
    expect(fingerprint).toMatch(
      /^rcv-legal-application-plan:v1:sha256:[0-9a-f]{64}$/,
    );

    const wrongDomain = createHash('sha256')
      .update(Buffer.from('RCV-CAS/v1', 'utf8'))
      .update(Buffer.from([0]))
      .update(identityBytes)
      .digest('hex');
    const missingNul = createHash('sha256')
      .update(Buffer.from('RCV-LAP/v1', 'utf8'))
      .update(identityBytes)
      .digest('hex');
    expect(fingerprint).not.toContain(wrongDomain);
    expect(fingerprint).not.toContain(missingNul);
  });

  it('is identical across 100 repetitions and handles persistence-safe bigint values', () => {
    const amount = POSTGRES_BIGINT_MAX;
    const facts = identityFacts({
      receiptAmountMinor: valueOf(parseReceiptAmountMinor(amount.toString())),
      appliedAmountMinor: valueOf(parseAppliedAmountMinor(amount.toString())),
      applications: Object.freeze([application(1, amount)]),
    });
    const first = expectFingerprint(fingerprintLegalApplicationPlan(facts));
    for (let run = 0; run < 100; run += 1) {
      expect(expectFingerprint(fingerprintLegalApplicationPlan(facts))).toBe(first);
    }
    expect(serializedIdentity(facts)).toContain(`"${amount.toString()}"`);
    expect(serializedIdentity(facts)).not.toContain(
      Number(amount).toString(),
    );
  });

  it.each([
    ['tenant', { tenantId: valueOf(parseTenantId('tenant-2')) }],
    ['case', { caseId: valueOf(parseCaseId('case-2')) }],
    ['collection', { collectionId: valueOf(parseCollectionId('collection-2')) }],
    ['snapshot hash', { snapshotHash: valueOf(parseSnapshotHash('c'.repeat(64))) }],
    [
      'source-version hash',
      {
        sourceVersionSetHash: valueOf(
          parseSourceVersionSetHash('d'.repeat(64)),
        ),
      },
    ],
    [
      'history boundary',
      { historyBoundaryRef: valueOf(parseHistoryBoundaryRef('history:v2')) },
    ],
  ])('changes when the authoritative %s changes', (_name, change) => {
    const baseline = expectFingerprint(
      fingerprintLegalApplicationPlan(identityFacts()),
    );
    const changed = expectFingerprint(
      fingerprintLegalApplicationPlan(identityFacts(change)),
    );
    expect(changed).not.toBe(baseline);
  });

  it('changes for a one-cent application mutation while preserving conservation', () => {
    const baseline = expectFingerprint(
      fingerprintLegalApplicationPlan(identityFacts()),
    );
    const changed = identityFacts({
      receiptAmountMinor: valueOf(parseReceiptAmountMinor('21')),
      appliedAmountMinor: valueOf(parseAppliedAmountMinor('21')),
      applications: Object.freeze([application(1, 11n), application(2)]),
    });
    expect(expectFingerprint(fingerprintLegalApplicationPlan(changed))).not.toBe(
      baseline,
    );
  });

  it('binds the canonical HELD reason through valid full and partial remainder identities', () => {
    const fullyHeld = identityFacts({
      appliedAmountMinor: valueOf(parseAppliedAmountMinor('0')),
      heldRemainderMinor: valueOf(parseHeldRemainderMinor('20')),
      heldReason: 'NO_ELIGIBLE_OUTSTANDING',
      applications: Object.freeze([]),
    });
    const partiallyHeld = identityFacts({
      appliedAmountMinor: valueOf(parseAppliedAmountMinor('10')),
      heldRemainderMinor: valueOf(parseHeldRemainderMinor('10')),
      heldReason: 'EXCESS_OVER_ELIGIBLE_OUTSTANDING',
      applications: Object.freeze([application(1)]),
    });
    expect(
      expectFingerprint(fingerprintLegalApplicationPlan(fullyHeld)),
    ).not.toBe(
      expectFingerprint(fingerprintLegalApplicationPlan(partiallyHeld)),
    );
  });

  it('rejects inconsistent HELD, conservation, direction, ranges and non-NFC identity', () => {
    const cases: ReadonlyArray<
      readonly [Partial<LegalApplicationPlanIdentityFacts>, string]
    > = [
      [{ direction: 'REVERSAL' as 'APPLY' }, 'DIRECTION_NOT_AUTHORIZED'],
      [
        {
          receiptAmountMinor: valueOf(parseReceiptAmountMinor('21')),
        },
        'CONSERVATION_FAILURE',
      ],
      [
        {
          heldReason: 'NO_ELIGIBLE_OUTSTANDING',
        },
        'CONSERVATION_FAILURE',
      ],
      [
        {
          minorUnit: -1 as LegalApplicationPlanIdentityFacts['minorUnit'],
        },
        'AMOUNT_OUT_OF_RANGE',
      ],
      [
        {
          tenantId: 'e\u0301' as LegalApplicationPlanIdentityFacts['tenantId'],
        },
        'FORMATION_CONTEXT_INCOMPLETE',
      ],
    ];
    for (const [change, expectedCode] of cases) {
      const result = fingerprintLegalApplicationPlan(identityFacts(change));
      expect(result).toEqual({ ok: false, error: { code: expectedCode } });
    }
  });

  it('rejects a forged component, priority and application arithmetic', () => {
    const original = application(1);
    const cases: ReadonlyArray<
      readonly [PlannedLegalApplication, string]
    > = [
      [
        { ...original, componentType: 'UNKNOWN' as 'COST' },
        'FORMATION_CONTEXT_INCOMPLETE',
      ],
      [
        { ...original, priorityRank: 1.5 },
        'AMOUNT_OUT_OF_RANGE',
      ],
      [
        {
          ...original,
          bucketAfterMinor: valueOf(parseBucketBalanceMinor('6')),
        },
        'CONSERVATION_FAILURE',
      ],
    ];
    for (const [candidate, expectedCode] of cases) {
      const result = fingerprintLegalApplicationPlan(
        identityFacts({
          receiptAmountMinor: valueOf(parseReceiptAmountMinor('10')),
          appliedAmountMinor: valueOf(parseAppliedAmountMinor('10')),
          applications: Object.freeze([candidate]),
        }),
      );
      expect(result).toEqual({ ok: false, error: { code: expectedCode } });
    }
  });

  it('preserves deterministic fingerprint and authoritative mutation sensitivity under bounded properties', () => {
    fc.assert(
      fc.property(
        fc.bigInt({ min: 1n, max: 1_000_000_000_000_000n }),
        (amount) => {
          const facts = identityFacts({
            receiptAmountMinor: valueOf(
              parseReceiptAmountMinor(amount.toString()),
            ),
            appliedAmountMinor: valueOf(
              parseAppliedAmountMinor(amount.toString()),
            ),
            applications: Object.freeze([application(1, amount)]),
          });
          const first = expectFingerprint(
            fingerprintLegalApplicationPlan(facts),
          );
          const repeated = expectFingerprint(
            fingerprintLegalApplicationPlan(facts),
          );
          const changedAmount = amount + 1n;
          const changed = identityFacts({
            receiptAmountMinor: valueOf(
              parseReceiptAmountMinor(changedAmount.toString()),
            ),
            appliedAmountMinor: valueOf(
              parseAppliedAmountMinor(changedAmount.toString()),
            ),
            applications: Object.freeze([application(1, changedAmount)]),
          });
          expect(repeated).toBe(first);
          expect(
            expectFingerprint(fingerprintLegalApplicationPlan(changed)),
          ).not.toBe(first);
          return true;
        },
      ),
      { numRuns: 100 },
    );
  });
});
