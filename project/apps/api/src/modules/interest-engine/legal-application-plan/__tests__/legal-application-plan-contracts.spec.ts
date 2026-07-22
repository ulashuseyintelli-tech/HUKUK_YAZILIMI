import {
  CANONICAL_CURRENCY_CODES,
  LEGAL_APPLICATION_COMPONENT_RANKS,
  LEGAL_APPLICATION_COMPONENT_TYPES,
  LEGAL_APPLICATION_DIRECTIONS,
  LEGAL_APPLICATION_HELD_REASONS,
  LEGAL_APPLICATION_PLAN_ERROR_CODES,
  POSTGRES_BIGINT_MAX,
  POSTGRES_INTEGER_MAX,
  SNAPSHOT_CONTRACT_VERSION,
  SNAPSHOT_SERIALIZATION_VERSION,
  formatMinorAmount,
  parseAppliedAmountMinor,
  parseBucketBalanceMinor,
  parseBucketContextKey,
  parseBucketInstanceId,
  parseCanonicalIsoDate,
  parseCaseId,
  parseCollectionId,
  parseCommandHash,
  parseCurrencyCode,
  parseEffectiveDate,
  parseHeldRemainderMinor,
  parseHistoryBoundaryRef,
  parseIdempotencyKey,
  parseMinorAmount,
  parseMinorUnit,
  parseReceiptAmountMinor,
  parseSerializationVersion,
  parseSnapshotContractVersion,
  parseSnapshotDate,
  parseSnapshotHash,
  parseSnapshotRef,
  parseSourceVersionSetHash,
  parseTenantId,
  type BuildLegalApplicationPlanCommand,
  type CaseId,
  type HeldRemainder,
  type LegalApplicationComponentType,
  type LegalApplicationHeldReason,
  type LegalApplicationPlanErrorCode,
  type LegalApplicationPlanResult,
  type ParseResult,
  type TenantId,
} from '..';

function valueOf<T>(result: ParseResult<T>): T {
  if (!result.ok) {
    throw new Error(`${result.error.field}:${result.error.code}`);
  }

  return result.value;
}

function expectFailure<T>(result: ParseResult<T>, code: string): void {
  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.error.code).toBe(code);
  }
}

describe('legal application plan I01 primitives', () => {
  describe('unsigned minor-unit money boundary', () => {
    it.each(['0', '1', POSTGRES_BIGINT_MAX.toString()])(
      'accepts canonical persistence-safe amount %s',
      (input) => {
        const parsed = parseMinorAmount(input);
        expect(parsed.ok).toBe(true);
        if (parsed.ok) {
          expect(formatMinorAmount(parsed.value)).toBe(input);
        }
      },
    );

    it.each([
      '-1',
      (POSTGRES_BIGINT_MAX + 1n).toString(),
      '1.0',
      '1e3',
      '+1',
      ' 1',
      '1 ',
      '',
      '00',
      '01',
      'abc',
    ])('rejects non-canonical amount %j', (input) => {
      expect(parseMinorAmount(input).ok).toBe(false);
    });

    it('rejects non-string wire amounts instead of coercing them', () => {
      expectFailure(parseMinorAmount(1), 'TYPE_MISMATCH');
      expectFailure(parseMinorAmount(1n), 'TYPE_MISMATCH');
    });

    it('keeps amount roles nominally distinct while using bigint at runtime', () => {
      const receipt = valueOf(parseReceiptAmountMinor('25'));
      const bucket = valueOf(parseBucketBalanceMinor('25'));
      const applied = valueOf(parseAppliedAmountMinor('20'));
      const held = valueOf(parseHeldRemainderMinor('5'));

      expect(receipt).toBe(25n);
      expect(bucket).toBe(25n);
      expect(applied).toBe(20n);
      expect(held).toBe(5n);
      expect(formatMinorAmount(receipt)).toBe('25');
    });
  });

  describe('currency and minor-unit boundary', () => {
    it.each(CANONICAL_CURRENCY_CODES)('accepts repository currency %s', (currency) => {
      expect(valueOf(parseCurrencyCode(currency))).toBe(currency);
    });

    it.each(['try', 'JPY', '', ' TRY'])('rejects unsupported currency %j', (currency) => {
      expect(parseCurrencyCode(currency).ok).toBe(false);
    });

    it.each([0, 2, POSTGRES_INTEGER_MAX])('accepts persistence-safe minorUnit %s', (minorUnit) => {
      expect(valueOf(parseMinorUnit(minorUnit))).toBe(minorUnit);
    });

    it.each([-1, 1.5, POSTGRES_INTEGER_MAX + 1])('rejects invalid minorUnit %s', (minorUnit) => {
      expect(parseMinorUnit(minorUnit).ok).toBe(false);
    });

    it('does not coerce a string minor unit', () => {
      expectFailure(parseMinorUnit('2'), 'TYPE_MISMATCH');
    });
  });

  describe('hash and reference syntax', () => {
    const hash = 'a'.repeat(64);

    it('accepts exact lowercase SHA-256 syntax', () => {
      expect(valueOf(parseSnapshotHash(hash))).toBe(hash);
      expect(valueOf(parseSourceVersionSetHash(hash))).toBe(hash);
    });

    it.each(['A'.repeat(64), 'a'.repeat(63), 'a'.repeat(65), `${'a'.repeat(63)}g`])(
      'rejects malformed SHA-256 %j',
      (candidate) => {
        expect(parseSnapshotHash(candidate).ok).toBe(false);
      },
    );

    it('accepts only the canonical snapshot reference prefix', () => {
      const expected = `rcv-app-snapshot:v1:sha256:${hash}`;
      expect(valueOf(parseSnapshotRef(expected))).toBe(expected);
      expect(parseSnapshotRef(`snapshot:v1:sha256:${hash}`).ok).toBe(false);
    });

    it('accepts only canonical bucket identity prefixes', () => {
      const context = `bctx:v1:sha256:${hash}`;
      const instance = `binst:v1:sha256:${hash}`;

      expect(valueOf(parseBucketContextKey(context))).toBe(context);
      expect(valueOf(parseBucketInstanceId(instance))).toBe(instance);
      expect(parseBucketContextKey(instance).ok).toBe(false);
      expect(parseBucketInstanceId(context).ok).toBe(false);
    });
  });

  describe('canonical ISO date boundary', () => {
    it.each(['2026-07-22', '2024-02-29', '0001-01-01'])('accepts valid date %s', (date) => {
      expect(valueOf(parseCanonicalIsoDate(date))).toBe(date);
      expect(valueOf(parseSnapshotDate(date))).toBe(date);
      expect(valueOf(parseEffectiveDate(date))).toBe(date);
    });

    it.each([
      '2026-02-29',
      '2026-04-31',
      '0000-01-01',
      '2026-7-22',
      '2026-07-22T00:00:00Z',
      '2026-07-22+03:00',
      ' 2026-07-22',
      '',
    ])('rejects non-canonical or impossible date %j', (date) => {
      expect(parseCanonicalIsoDate(date).ok).toBe(false);
    });
  });

  describe('opaque identifiers and versions', () => {
    it('rejects empty and non-canonically padded identifiers', () => {
      expectFailure(parseTenantId(''), 'EMPTY');
      expectFailure(parseTenantId(' tenant-1'), 'NON_CANONICAL_WHITESPACE');
      expectFailure(parseCaseId('case-1 '), 'NON_CANONICAL_WHITESPACE');
    });

    it('keeps identifiers nominally distinct', () => {
      const tenantId = valueOf(parseTenantId('tenant-1'));
      const caseId = valueOf(parseCaseId('case-1'));
      const collectionId = valueOf(parseCollectionId('collection-1'));

      expect(tenantId).toBe('tenant-1');
      expect(caseId).toBe('case-1');
      expect(collectionId).toBe('collection-1');
      expect(valueOf(parseIdempotencyKey('command-1'))).toBe('command-1');
      expect(valueOf(parseCommandHash('command-hash'))).toBe('command-hash');
      expect(valueOf(parseHistoryBoundaryRef('history-v1'))).toBe('history-v1');
    });

    it('pins snapshot contract and serialization versions without normalization', () => {
      expect(valueOf(parseSnapshotContractVersion(SNAPSHOT_CONTRACT_VERSION))).toBe(
        SNAPSHOT_CONTRACT_VERSION,
      );
      expect(valueOf(parseSerializationVersion(SNAPSHOT_SERIALIZATION_VERSION))).toBe(
        SNAPSHOT_SERIALIZATION_VERSION,
      );
      expect(parseSnapshotContractVersion('V1').ok).toBe(false);
      expect(parseSerializationVersion('rcv-cas/v1').ok).toBe(false);
    });
  });
});

describe('legal application plan I01 closed type surface', () => {
  const componentCoverage = {
    COST: true,
    ANCILLARY: true,
    ACCRUED_INTEREST: true,
    PRINCIPAL: true,
  } as const satisfies Readonly<Record<LegalApplicationComponentType, true>>;

  const heldReasonCoverage = {
    NO_ELIGIBLE_OUTSTANDING: true,
    EXCESS_OVER_ELIGIBLE_OUTSTANDING: true,
  } as const satisfies Readonly<Record<LegalApplicationHeldReason, true>>;

  const errorCodeCoverage = {
    SNAPSHOT_UNAVAILABLE: true,
    SNAPSHOT_CONTRACT_UNSUPPORTED: true,
    SNAPSHOT_SERIALIZATION_INVALID: true,
    SNAPSHOT_HASH_MISMATCH: true,
    SNAPSHOT_REF_MISMATCH: true,
    SOURCE_VERSION_INCOMPLETE: true,
    FORMATION_CONTEXT_INCOMPLETE: true,
    POLICY_VERSION_MISSING: true,
    FEE_AUTHORITY_UNRESOLVED: true,
    BUCKET_CONTEXT_UNMAPPED: true,
    BUCKET_IDENTITY_INVALID: true,
    DUPLICATE_BUCKET_CONTEXT: true,
    CURRENCY_OR_MINOR_UNIT_INVALID: true,
    EFFECTIVE_DATE_MISMATCH: true,
    HISTORY_BOUNDARY_UNAUTHORIZED: true,
    SNAPSHOT_STALE: true,
    SOURCE_CONCURRENCY_UNSAFE: true,
    RECEIPT_AMOUNT_INVALID: true,
    AMOUNT_OUT_OF_RANGE: true,
    CONSERVATION_FAILURE: true,
    DIRECTION_NOT_AUTHORIZED: true,
    TENANT_CONTEXT_MISMATCH: true,
    CASE_CONTEXT_MISMATCH: true,
  } as const satisfies Readonly<Record<LegalApplicationPlanErrorCode, true>>;

  it('pins the exhaustive component set and rank contract', () => {
    expect(Object.keys(componentCoverage)).toEqual(LEGAL_APPLICATION_COMPONENT_TYPES);
    expect(LEGAL_APPLICATION_COMPONENT_RANKS).toEqual({
      COST: 10,
      ANCILLARY: 20,
      ACCRUED_INTEREST: 30,
      PRINCIPAL: 40,
    });
  });

  it('pins the initial builder direction to APPLY only', () => {
    expect(LEGAL_APPLICATION_DIRECTIONS).toEqual(['APPLY']);
  });

  it('pins the exhaustive HELD reason set', () => {
    expect(Object.keys(heldReasonCoverage)).toEqual(LEGAL_APPLICATION_HELD_REASONS);
  });

  it('pins the exhaustive machine-readable error set', () => {
    expect(Object.keys(errorCodeCoverage)).toEqual(LEGAL_APPLICATION_PLAN_ERROR_CODES);
  });
});

function compileTimeContractChecks(
  command: BuildLegalApplicationPlanCommand,
  result: LegalApplicationPlanResult,
  held: HeldRemainder,
): void {
  // @ts-expect-error raw strings cannot cross a branded identifier boundary
  const tenantId: TenantId = 'tenant-1';
  // @ts-expect-error distinct branded identifiers are not interchangeable
  const caseId: CaseId = command.tenantId;
  // @ts-expect-error immutable command facts cannot be reassigned
  command.tenantId = command.tenantId;
  // @ts-expect-error immutable HELD facts cannot be reassigned
  held.reason = 'NO_ELIGIBLE_OUTSTANDING';
  // @ts-expect-error initial builder direction is APPLY-only
  const unauthorizedDirection: 'APPLY' = 'REVERSAL';

  void tenantId;
  void caseId;
  void unauthorizedDirection;

  if (result.ok) {
    result.plan.applications.forEach((application) => {
      void application.bucketContextKey;
    });
  } else {
    void result.error.code;
  }
}

void compileTimeContractChecks;
