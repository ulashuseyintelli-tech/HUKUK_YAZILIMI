import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import fc from 'fast-check';
import {
  MAX_BUCKET_COUNT,
  MAX_CANONICAL_ENVELOPE_BYTES,
  MAX_CANONICAL_JSON_DEPTH,
  POSTGRES_BIGINT_MAX,
  SNAPSHOT_CONTRACT_VERSION,
  SNAPSHOT_SERIALIZATION_VERSION,
  validateCanonicalSnapshot,
  type CanonicalSnapshotValidationResult,
  type ValidatedCanonicalSnapshotV1,
} from '..';
import {
  canonicalSnapshotRefForHash,
  computeCanonicalSnapshotHash,
  serializeCanonicalJson,
} from '../canonical-snapshot-serializer';
import type { StrictJsonValue } from '../strict-json-parser';

const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);
const HASH_C = 'c'.repeat(64);

type MutableJsonObject = Record<string, StrictJsonValue>;

function bucket(index = 0, componentType = 'PRINCIPAL'): MutableJsonObject {
  const contextHash = index.toString(16).padStart(64, '0');
  const instanceHash = (index + 20_000).toString(16).padStart(64, '0');
  return {
    componentType,
    componentCode: `${componentType}-01`,
    bucketContextKey: `bctx:v1:sha256:${contextHash}`,
    bucketInstanceId: `binst:v1:sha256:${instanceHash}`,
    sourceLineageSetRef: `lineage:${index}`,
    legalBasisRef: 'TBK-100',
    effectivePeriodRef: '2026-07',
    currency: 'TRY',
    minorUnit: 2,
    priorityRank: index,
    bucketBalanceMinor: '100',
  };
}

function snapshot(overrides: Partial<MutableJsonObject> = {}): MutableJsonObject {
  return {
    snapshotContractVersion: SNAPSHOT_CONTRACT_VERSION,
    snapshotSerializationVersion: SNAPSHOT_SERIALIZATION_VERSION,
    tenantId: 'tenant-1',
    caseId: 'case-1',
    targetCollectionId: 'collection-1',
    currency: 'TRY',
    minorUnit: 2,
    receiptAmountMinor: '100',
    snapshotAsOfDate: '2026-07-22',
    applicationEffectiveDate: '2026-07-22',
    historyBoundaryRef: 'history:v1',
    engineVersion: 'engine-v1',
    calculationRuleVersion: 'rule-v1',
    policyVersion: 'policy-v1',
    rateTableVersion: 'rate-v1',
    interpretationProfileId: 'interpretation-v1',
    bucketIdentityVersion: 'bucket-v1',
    sourceVersionSet: [{ sourceReference: 'source:1', sourceVersion: '1' }],
    sourceVersionSetHash: HASH_C,
    canonicalBuckets: [bucket()],
    ...overrides,
  };
}

function requestFor(
  snapshotValue: MutableJsonObject = snapshot(),
  commandOverrides: Record<string, unknown> = {},
  envelopeOverrides: Record<string, unknown> = {},
  direction: unknown = 'APPLY',
): Record<string, unknown> {
  const canonicalPayload = serializeCanonicalJson(snapshotValue);
  const snapshotHash = computeCanonicalSnapshotHash(Buffer.from(canonicalPayload, 'utf8'));
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
      idempotencyKey: 'idempotency-1',
      commandHash: 'command-hash-1',
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

function requestForRawPayload(
  canonicalPayload: string,
  commandOverrides: Record<string, unknown> = {},
  envelopeOverrides: Record<string, unknown> = {},
): Record<string, unknown> {
  const snapshotHash = computeCanonicalSnapshotHash(Buffer.from(canonicalPayload, 'utf8'));
  const snapshotRef = canonicalSnapshotRefForHash(snapshotHash);
  return {
    direction: 'APPLY',
    command: {
      tenantId: 'tenant-1',
      caseId: 'case-1',
      collectionId: 'collection-1',
      receiptAmountMinor: '100',
      currency: 'TRY',
      minorUnit: 2,
      applicationEffectiveDate: '2026-07-22',
      expectedSnapshotRef: snapshotRef,
      expectedSnapshotHash: snapshotHash,
      expectedSourceVersionSetHash: HASH_C,
      expectedHistoryBoundaryRef: 'history:v1',
      idempotencyKey: 'idempotency-1',
      commandHash: 'command-hash-1',
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

function expectFailure(
  result: CanonicalSnapshotValidationResult,
  code: string,
  reason?: string,
): void {
  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.error.code).toBe(code);
    if (reason !== undefined) {
      expect(result.error.metadata?.reason).toBe(reason);
    }
  }
}

function expectSuccess(result: CanonicalSnapshotValidationResult): ValidatedCanonicalSnapshotV1 {
  expect(result.ok).toBe(true);
  if (!result.ok) {
    throw new Error(result.error.code);
  }
  return result.value;
}

function withNestedDepth(depth: number): MutableJsonObject {
  let value: StrictJsonValue = 'probe';
  for (let index = 0; index < depth; index += 1) {
    value = [value];
  }
  return snapshot({ depthProbe: value });
}

describe('TPA-04C-I02 canonical snapshot validator', () => {
  describe('strict JSON and canonical shape', () => {
    it('accepts exact canonical RCV-CAS/v1 JSON and returns an opaque frozen boundary', () => {
      const value = expectSuccess(validateCanonicalSnapshot(requestFor()));
      expect(value.snapshot.snapshotContractVersion).toBe(SNAPSHOT_CONTRACT_VERSION);
      expect(value.snapshot.canonicalBuckets[0].legalBasisRef).toBe('TBK-100');
      expect(Object.isFrozen(value)).toBe(true);
      expect(Object.isFrozen(value.snapshot)).toBe(true);
      expect(Object.isFrozen(value.snapshot.canonicalBuckets)).toBe(true);
    });

    it('rejects duplicate top-level members before accepting JSON.parse last-wins output', () => {
      const canonical = serializeCanonicalJson(snapshot());
      const duplicate = `{"tenantId":"forged",${canonical.slice(1)}`;
      expectFailure(
        validateCanonicalSnapshot(requestForRawPayload(duplicate)),
        'SNAPSHOT_SERIALIZATION_INVALID',
        'DUPLICATE_JSON_MEMBER',
      );
    });

    it('rejects duplicate nested members', () => {
      const canonical = serializeCanonicalJson(snapshot());
      const duplicate = canonical.replace(
        '"bucketBalanceMinor":"100"',
        '"bucketBalanceMinor":"100","bucketBalanceMinor":"99"',
      );
      expectFailure(
        validateCanonicalSnapshot(requestForRawPayload(duplicate)),
        'SNAPSHOT_SERIALIZATION_INVALID',
        'DUPLICATE_JSON_MEMBER',
      );
    });

    it('rejects malformed syntax', () => {
      expectFailure(
        validateCanonicalSnapshot(requestForRawPayload('{"broken":')),
        'SNAPSHOT_SERIALIZATION_INVALID',
      );
    });

    it('rejects unknown, missing and unexpected-null fields deterministically', () => {
      expectFailure(
        validateCanonicalSnapshot(requestFor(snapshot({ unexpected: 'x' }))),
        'SNAPSHOT_SERIALIZATION_INVALID',
        'UNKNOWN_FIELD',
      );

      const missing = snapshot();
      delete missing.engineVersion;
      expectFailure(
        validateCanonicalSnapshot(requestFor(missing)),
        'SNAPSHOT_SERIALIZATION_INVALID',
        'REQUIRED_FIELD_MISSING',
      );

      expectFailure(
        validateCanonicalSnapshot(requestFor(snapshot({ engineVersion: null }))),
        'SNAPSHOT_SERIALIZATION_INVALID',
        'UNEXPECTED_NULL',
      );
    });

    it('accepts maximum depth for parsing and rejects depth 33 before schema work', () => {
      const atBoundary = validateCanonicalSnapshot(requestFor(withNestedDepth(31)));
      expectFailure(atBoundary, 'SNAPSHOT_SERIALIZATION_INVALID', 'UNKNOWN_FIELD');

      const aboveBoundary = validateCanonicalSnapshot(requestFor(withNestedDepth(32)));
      expectFailure(
        aboveBoundary,
        'SNAPSHOT_SERIALIZATION_INVALID',
        'MAX_DEPTH_EXCEEDED',
      );
      if (!aboveBoundary.ok) {
        expect(aboveBoundary.error.metadata?.configuredMaximum).toBe(MAX_CANONICAL_JSON_DEPTH);
        expect(aboveBoundary.error.metadata?.actual).toBe(33);
      }
    });

    it('accepts a structurally valid payload at exactly 1 MiB and rejects one byte above', () => {
      const value = snapshot();
      const source = (value.sourceVersionSet as MutableJsonObject[])[0];
      const initial = serializeCanonicalJson(value);
      const extra = MAX_CANONICAL_ENVELOPE_BYTES - Buffer.byteLength(initial, 'utf8');
      source.sourceReference = `source:1${'x'.repeat(extra)}`;

      const exactPayload = serializeCanonicalJson(value);
      expect(Buffer.byteLength(exactPayload, 'utf8')).toBe(MAX_CANONICAL_ENVELOPE_BYTES);
      expectSuccess(validateCanonicalSnapshot(requestForRawPayload(exactPayload)));

      const oversized = exactPayload.replace('"sourceVersion":"1"', '"sourceVersion":"11"');
      const failure = validateCanonicalSnapshot(requestForRawPayload(oversized));
      expectFailure(
        failure,
        'SNAPSHOT_SERIALIZATION_INVALID',
        'PAYLOAD_LIMIT_EXCEEDED',
      );
      if (!failure.ok) {
        expect(failure.error.metadata?.actual).toBe(MAX_CANONICAL_ENVELOPE_BYTES + 1);
      }
    });
  });

  describe('Unicode and canonical string limits', () => {
    it('accepts NFC and rejects non-NFC values without normalization', () => {
      expectSuccess(validateCanonicalSnapshot(requestFor(snapshot({ engineVersion: 'sürüm-v1' }))));
      const failure = validateCanonicalSnapshot(
        requestFor(snapshot({ engineVersion: 'su\u0308ru\u0308m-v1' })),
      );
      expectFailure(failure, 'SNAPSHOT_SERIALIZATION_INVALID', 'NON_NFC_STRING');
    });

    it('rejects a non-NFC property name and never echoes it', () => {
      const value = snapshot({ ['e\u0301vil']: 'secret' });
      const failure = validateCanonicalSnapshot(requestFor(value));
      expectFailure(failure, 'SNAPSHOT_SERIALIZATION_INVALID', 'UNKNOWN_FIELD');
      expect(JSON.stringify(failure)).not.toContain('évil');
      expect(JSON.stringify(failure)).not.toContain('secret');
    });

    it('counts Unicode code points rather than UTF-16 code units', () => {
      const atBoundary = bucket();
      atBoundary.componentCode = '😀'.repeat(128);
      expectSuccess(
        validateCanonicalSnapshot(requestFor(snapshot({ canonicalBuckets: [atBoundary] }))),
      );

      const over = bucket();
      over.componentCode = '😀'.repeat(129);
      const failure = validateCanonicalSnapshot(
        requestFor(snapshot({ canonicalBuckets: [over] })),
      );
      expectFailure(failure, 'SNAPSHOT_SERIALIZATION_INVALID', 'STRING_LIMIT_EXCEEDED');
      if (!failure.ok) {
        expect(failure.error.metadata?.actual).toBe(129);
      }
    });

    it('rejects escaped control characters and unpaired surrogates', () => {
      expectFailure(
        validateCanonicalSnapshot(requestFor(snapshot({ engineVersion: 'engine\u0000v1' }))),
        'SNAPSHOT_SERIALIZATION_INVALID',
      );
      expectFailure(
        validateCanonicalSnapshot(requestFor(snapshot({ engineVersion: '\ud800' }))),
        'SNAPSHOT_SERIALIZATION_INVALID',
      );
    });
  });

  describe('unsigned decimal integer strings', () => {
    it.each(['0', '1', POSTGRES_BIGINT_MAX.toString()])('accepts %s', (amount) => {
      const value = bucket();
      value.bucketBalanceMinor = amount;
      expectSuccess(
        validateCanonicalSnapshot(requestFor(snapshot({ canonicalBuckets: [value] }))),
      );
    });

    it.each(['-0', '+1', '01', '00', '1.0', '1e3', '1E3', ' 1', '1 ', '', '-1'])(
      'rejects %j',
      (amount) => {
        const value = bucket();
        value.bucketBalanceMinor = amount;
        expectFailure(
          validateCanonicalSnapshot(requestFor(snapshot({ canonicalBuckets: [value] }))),
          'SNAPSHOT_SERIALIZATION_INVALID',
          'INVALID_INTEGER_STRING',
        );
      },
    );

    it('rejects PostgreSQL BIGINT max + 1', () => {
      const value = bucket();
      value.bucketBalanceMinor = (POSTGRES_BIGINT_MAX + 1n).toString();
      expectFailure(
        validateCanonicalSnapshot(requestFor(snapshot({ canonicalBuckets: [value] }))),
        'AMOUNT_OUT_OF_RANGE',
      );
    });
  });

  describe('domain-separated hash and reference binding', () => {
    it('uses UTF8(RCV-CAS/v1) + NUL + canonical bytes exactly', () => {
      const request = requestFor();
      const envelope = request.snapshotEnvelope as Record<string, unknown>;
      const payload = envelope.canonicalPayload as string;
      const expected = createHash('sha256')
        .update(Buffer.from('RCV-CAS/v1', 'utf8'))
        .update(Buffer.from([0]))
        .update(Buffer.from(payload, 'utf8'))
        .digest('hex');
      expect(envelope.snapshotHash).toBe(expected);
      expectSuccess(validateCanonicalSnapshot(request));
    });

    it.each([
      ['payload-only', (payload: string) => createHash('sha256').update(payload, 'utf8').digest('hex')],
      [
        'wrong-domain',
        (payload: string) =>
          createHash('sha256').update('RCV-CAS/v2\u0000').update(payload, 'utf8').digest('hex'),
      ],
      [
        'missing-NUL',
        (payload: string) =>
          createHash('sha256').update('RCV-CAS/v1').update(payload, 'utf8').digest('hex'),
      ],
    ])('rejects %s hashes', (_label, hashFactory) => {
      const base = requestFor();
      const envelope = base.snapshotEnvelope as Record<string, unknown>;
      const command = base.command as Record<string, unknown>;
      const wrongHash = hashFactory(envelope.canonicalPayload as string);
      const wrongRef = canonicalSnapshotRefForHash(wrongHash);
      envelope.snapshotHash = wrongHash;
      envelope.snapshotRef = wrongRef;
      command.expectedSnapshotHash = wrongHash;
      command.expectedSnapshotRef = wrongRef;
      expectFailure(validateCanonicalSnapshot(base), 'SNAPSHOT_HASH_MISMATCH');
    });

    it('rejects extra newline and one-byte canonical mutations', () => {
      const base = requestFor();
      const envelope = base.snapshotEnvelope as Record<string, unknown>;
      const newlinePayload = `${envelope.canonicalPayload as string}\n`;
      expectFailure(
        validateCanonicalSnapshot(requestForRawPayload(newlinePayload)),
        'SNAPSHOT_SERIALIZATION_INVALID',
      );

      const original = requestFor();
      const originalEnvelope = original.snapshotEnvelope as Record<string, unknown>;
      const mutatedPayload = (originalEnvelope.canonicalPayload as string).replace(
        'engine-v1',
        'engine-v2',
      );
      originalEnvelope.canonicalPayload = mutatedPayload;
      expectFailure(validateCanonicalSnapshot(original), 'SNAPSHOT_HASH_MISMATCH');
    });

    it('rejects uppercase/malformed hashes and malformed/mismatched refs', () => {
      const uppercase = requestFor(snapshot(), {}, { snapshotHash: HASH_A.toUpperCase() });
      expectFailure(validateCanonicalSnapshot(uppercase), 'SNAPSHOT_HASH_MISMATCH');

      expectFailure(
        validateCanonicalSnapshot(
          requestFor(snapshot(), {}, { snapshotRef: 'snapshot:invalid' }),
        ),
        'SNAPSHOT_REF_MISMATCH',
      );

      const mismatched = requestFor();
      const envelope = mismatched.snapshotEnvelope as Record<string, unknown>;
      const command = mismatched.command as Record<string, unknown>;
      const wrongRef = canonicalSnapshotRefForHash(HASH_B);
      envelope.snapshotRef = wrongRef;
      command.expectedSnapshotRef = wrongRef;
      expectFailure(validateCanonicalSnapshot(mismatched), 'SNAPSHOT_REF_MISMATCH');
    });
  });

  describe('command/snapshot binding', () => {
    it.each([
      ['tenantId', 'tenant-2', 'TENANT_CONTEXT_MISMATCH'],
      ['caseId', 'case-2', 'CASE_CONTEXT_MISMATCH'],
      ['collectionId', 'collection-2', 'FORMATION_CONTEXT_INCOMPLETE'],
      ['receiptAmountMinor', '99', 'RECEIPT_AMOUNT_INVALID'],
      ['currency', 'USD', 'CURRENCY_OR_MINOR_UNIT_INVALID'],
      ['minorUnit', 3, 'CURRENCY_OR_MINOR_UNIT_INVALID'],
      ['applicationEffectiveDate', '2026-07-23', 'EFFECTIVE_DATE_MISMATCH'],
      ['expectedSourceVersionSetHash', HASH_A, 'SOURCE_VERSION_INCOMPLETE'],
      ['expectedHistoryBoundaryRef', 'history:v2', 'HISTORY_BOUNDARY_UNAUTHORIZED'],
      ['expectedSnapshotHash', HASH_A, 'SNAPSHOT_HASH_MISMATCH'],
      [
        'expectedSnapshotRef',
        canonicalSnapshotRefForHash(HASH_A),
        'SNAPSHOT_REF_MISMATCH',
      ],
    ])('rejects %s mismatch', (field, value, code) => {
      expectFailure(validateCanonicalSnapshot(requestFor(snapshot(), { [field]: value })), code);
    });

    it('rejects unsupported direction before snapshot binding', () => {
      expectFailure(validateCanonicalSnapshot(requestFor(snapshot(), {}, {}, 'REVERSAL')), 'DIRECTION_NOT_AUTHORIZED');
    });
  });

  describe('bucket structure and bounded identities', () => {
    it('accepts every closed component without applying or sorting it', () => {
      const buckets = ['COST', 'ANCILLARY', 'ACCRUED_INTEREST', 'PRINCIPAL'].map((type, index) =>
        bucket(index, type),
      );
      const value = expectSuccess(
        validateCanonicalSnapshot(requestFor(snapshot({ canonicalBuckets: buckets }))),
      );
      expect(value.snapshot.canonicalBuckets.map((entry) => entry.componentType)).toEqual([
        'COST',
        'ANCILLARY',
        'ACCRUED_INTEREST',
        'PRINCIPAL',
      ]);
    });

    it('rejects unknown components and empty authority evidence', () => {
      expectFailure(
        validateCanonicalSnapshot(
          requestFor(snapshot({ canonicalBuckets: [bucket(0, 'UNKNOWN')] })),
        ),
        'BUCKET_CONTEXT_UNMAPPED',
      );

      for (const field of [
        'componentCode',
        'sourceLineageSetRef',
        'legalBasisRef',
        'effectivePeriodRef',
      ]) {
        const value = bucket();
        value[field] = '';
        expectFailure(
          validateCanonicalSnapshot(requestFor(snapshot({ canonicalBuckets: [value] }))),
          'FORMATION_CONTEXT_INCOMPLETE',
        );
      }

      const interest = bucket();
      interest.interestRuleRef = '';
      expectFailure(
        validateCanonicalSnapshot(requestFor(snapshot({ canonicalBuckets: [interest] }))),
        'FORMATION_CONTEXT_INCOMPLETE',
      );
    });

    it('rejects invalid bucket IDs, duplicate contexts and duplicate instances', () => {
      const invalidContext = bucket();
      invalidContext.bucketContextKey = 'invalid';
      expectFailure(
        validateCanonicalSnapshot(requestFor(snapshot({ canonicalBuckets: [invalidContext] }))),
        'BUCKET_IDENTITY_INVALID',
      );

      const invalidInstance = bucket();
      invalidInstance.bucketInstanceId = 'invalid';
      expectFailure(
        validateCanonicalSnapshot(requestFor(snapshot({ canonicalBuckets: [invalidInstance] }))),
        'BUCKET_IDENTITY_INVALID',
      );

      const duplicateContext = [bucket(1), bucket(2)];
      duplicateContext[1].bucketContextKey = duplicateContext[0].bucketContextKey;
      expectFailure(
        validateCanonicalSnapshot(requestFor(snapshot({ canonicalBuckets: duplicateContext }))),
        'DUPLICATE_BUCKET_CONTEXT',
      );

      const duplicateInstance = [bucket(1), bucket(2)];
      duplicateInstance[1].bucketInstanceId = duplicateInstance[0].bucketInstanceId;
      expectFailure(
        validateCanonicalSnapshot(requestFor(snapshot({ canonicalBuckets: duplicateInstance }))),
        'BUCKET_IDENTITY_INVALID',
      );
    });

    it('rejects bucket currency/minorUnit mismatch and accepts zero balance', () => {
      const wrongCurrency = bucket();
      wrongCurrency.currency = 'USD';
      expectFailure(
        validateCanonicalSnapshot(requestFor(snapshot({ canonicalBuckets: [wrongCurrency] }))),
        'CURRENCY_OR_MINOR_UNIT_INVALID',
      );

      const wrongMinorUnit = bucket();
      wrongMinorUnit.minorUnit = 3;
      expectFailure(
        validateCanonicalSnapshot(requestFor(snapshot({ canonicalBuckets: [wrongMinorUnit] }))),
        'CURRENCY_OR_MINOR_UNIT_INVALID',
      );

      const zero = bucket();
      zero.bucketBalanceMinor = '0';
      expectSuccess(validateCanonicalSnapshot(requestFor(snapshot({ canonicalBuckets: [zero] }))));
    });

    it('pins the 10,000/10,001 count boundary before per-bucket structural work', () => {
      const atBoundary = snapshot({
        canonicalBuckets: Array.from({ length: MAX_BUCKET_COUNT }, () => ({
          bucketBalanceMinor: '0',
        })),
      });
      const boundaryResult = validateCanonicalSnapshot(requestFor(atBoundary));
      expectFailure(
        boundaryResult,
        'SNAPSHOT_SERIALIZATION_INVALID',
        'REQUIRED_FIELD_MISSING',
      );

      const over = snapshot({
        canonicalBuckets: Array.from({ length: MAX_BUCKET_COUNT + 1 }, () => ({
          bucketBalanceMinor: '0',
        })),
      });
      expectFailure(
        validateCanonicalSnapshot(requestFor(over)),
        'SNAPSHOT_SERIALIZATION_INVALID',
        'BUCKET_LIMIT_EXCEEDED',
      );
    });
  });

  describe('deterministic first-error and security surface', () => {
    it('pins precedence across independent faults', () => {
      expectFailure(
        validateCanonicalSnapshot(
          requestFor(snapshot({ snapshotContractVersion: 'unsupported' }), {}, { snapshotHash: HASH_A }),
        ),
        'SNAPSHOT_CONTRACT_UNSUPPORTED',
      );

      const duplicateBuckets = [bucket(1), bucket(2)];
      duplicateBuckets[1].bucketContextKey = duplicateBuckets[0].bucketContextKey;
      expectFailure(
        validateCanonicalSnapshot(
          requestFor(snapshot({ canonicalBuckets: duplicateBuckets }), { tenantId: 'tenant-2' }),
        ),
        'TENANT_CONTEXT_MISMATCH',
      );

      expectFailure(
        validateCanonicalSnapshot(
          requestForRawPayload('{not-json', {}, { snapshotRef: 'invalid' }),
        ),
        'SNAPSHOT_SERIALIZATION_INVALID',
      );

      const nonNfc = requestFor(snapshot({ engineVersion: 'e\u0301' }));
      const envelope = nonNfc.snapshotEnvelope as Record<string, unknown>;
      const command = nonNfc.command as Record<string, unknown>;
      envelope.snapshotHash = HASH_A;
      envelope.snapshotRef = canonicalSnapshotRefForHash(HASH_A);
      command.expectedSnapshotHash = HASH_A;
      command.expectedSnapshotRef = envelope.snapshotRef;
      expectFailure(
        validateCanonicalSnapshot(nonNfc),
        'SNAPSHOT_SERIALIZATION_INVALID',
        'NON_NFC_STRING',
      );
    });

    it('returns the same result 100 times with no generated metadata', () => {
      const input = requestFor(snapshot({ policyVersion: '' }));
      const first = validateCanonicalSnapshot(input);
      for (let index = 0; index < 100; index += 1) {
        expect(validateCanonicalSnapshot(input)).toEqual(first);
      }
      expect(JSON.stringify(first)).not.toMatch(/timestamp|generated|stack/i);
    });

    it('does not leak raw payload, snippets or PII-like values through errors', () => {
      const secret = 'TR120006200000000006672315';
      const input = requestFor(snapshot({ forbiddenField: secret }));
      const serializedError = JSON.stringify(validateCanonicalSnapshot(input));
      expect(serializedError).not.toContain(secret);
      expect(serializedError).not.toContain('forbiddenField');
      expect(serializedError).not.toContain('canonicalPayload');
    });

    it('does not depend on locale, timezone, clock, environment, Prisma or allocation modules', () => {
      const result = validateCanonicalSnapshot(requestFor());
      expectSuccess(result);

      const source = readFileSync(join(__dirname, '..', 'canonical-snapshot-validator.ts'), 'utf8');
      expect(source).not.toMatch(/localeCompare|Date\.|new Date|Math\.random|process\.env/);
      expect(source).not.toMatch(/Prisma|CollectionService|LedgerAllocation|CollectionAllocation/);
      expect(source).not.toMatch(/heldRemainder|appliedAmount|planFingerprint/);
    });
  });

  describe('property-based canonical boundaries', () => {
    it('roundtrips persistence-safe unsigned minor amounts', () => {
      fc.assert(
        fc.property(fc.bigInt({ min: 0n, max: POSTGRES_BIGINT_MAX }), (amount) => {
          const value = bucket();
          value.bucketBalanceMinor = amount.toString();
          return validateCanonicalSnapshot(
            requestFor(snapshot({ canonicalBuckets: [value] })),
          ).ok;
        }),
        { numRuns: 50 },
      );
    });

    it('serializes object keys deterministically without locale-aware ordering', () => {
      fc.assert(
        fc.property(fc.dictionary(fc.string({ minLength: 1, maxLength: 8 }), fc.string()), (record) => {
          const entries = Object.entries(record);
          const reversed = Object.fromEntries([...entries].reverse());
          return (
            serializeCanonicalJson(record as StrictJsonValue) ===
            serializeCanonicalJson(reversed as StrictJsonValue)
          );
        }),
        { numRuns: 50 },
      );
    });

    it('detects canonical one-field mutations under the original hash', () => {
      fc.assert(
        fc.property(fc.stringMatching(/^[A-Za-z][A-Za-z0-9-]{0,20}$/), (engineVersion) => {
          if (engineVersion === 'engine-v1') {
            return true;
          }
          const original = requestFor();
          const envelope = original.snapshotEnvelope as Record<string, unknown>;
          envelope.canonicalPayload = (envelope.canonicalPayload as string).replace(
            'engine-v1',
            engineVersion,
          );
          const result = validateCanonicalSnapshot(original);
          return !result.ok && result.error.code === 'SNAPSHOT_HASH_MISMATCH';
        }),
        { numRuns: 50 },
      );
    });
  });
});

function compileTimeValidatedBoundary(value: ValidatedCanonicalSnapshotV1): void {
  // @ts-expect-error the private validation brand cannot be forged outside the validator
  const forged: ValidatedCanonicalSnapshotV1 = {
    snapshotRef: value.snapshotRef,
    snapshotHash: value.snapshotHash,
    canonicalPayload: value.canonicalPayload,
    snapshot: value.snapshot,
  };
  void forged;
}

void compileTimeValidatedBoundary;
