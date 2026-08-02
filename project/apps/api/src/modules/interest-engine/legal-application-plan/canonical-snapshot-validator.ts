import {
  LEGAL_APPLICATION_COMPONENT_TYPES,
  type BuildLegalApplicationPlanCommand,
  type CanonicalLegalBucketV1,
  type CanonicalReceivableApplicationSnapshotV1,
  type CanonicalSourceVersionV1,
  type LegalApplicationComponentType,
  type LegalApplicationPlanError,
  type LegalApplicationPlanErrorCode,
  type LegalApplicationPlanErrorMetadata,
} from './contracts';
import {
  POSTGRES_BIGINT_MAX,
  POSTGRES_INTEGER_MAX,
  SNAPSHOT_CONTRACT_VERSION,
  SNAPSHOT_SERIALIZATION_VERSION,
  parseBucketBalanceMinor,
  parseBucketContextKey,
  parseBucketIdentityVersion,
  parseBucketInstanceId,
  parseCaseId,
  parseCollectionId,
  parseCommandHash,
  parseComponentCode,
  parseCurrencyCode,
  parseEffectiveDate,
  parseEngineVersion,
  parseHistoryBoundaryRef,
  parseIdempotencyKey,
  parseInterpretationVersion,
  parseMinorUnit,
  parsePolicyVersion,
  parseRateVersion,
  parseReceiptAmountMinor,
  parseRuleVersion,
  parseSerializationVersion,
  parseSnapshotContractVersion,
  parseSnapshotDate,
  parseSnapshotHash,
  parseSnapshotRef,
  parseSourceLineageSetRef,
  parseSourceReference,
  parseSourceVersion,
  parseSourceVersionSetHash,
  parseTenantId,
  type ParseResult,
  type SnapshotHash,
  type SnapshotRef,
} from './primitives';
import {
  canonicalSnapshotRefForHash,
  computeCanonicalSnapshotHash,
  serializeCanonicalJson,
} from './canonical-snapshot-serializer';
import {
  BUCKET_INSTANCE_IDENTITY_CONTRACT_VERSION,
  validateBucketInstanceId,
} from './bucket-instance-identity';
import {
  computeSourceVersionSetHash,
  sortSourceVersionSet,
} from './canonical-snapshot-identity';
import { parseStrictJson, type StrictJsonValue } from './strict-json-parser';
import {
  MAX_BUCKET_COUNT,
  MAX_CANONICAL_ENVELOPE_BYTES,
  MAX_CANONICAL_JSON_DEPTH,
  MAX_COMPONENT_CODE_CODE_POINTS,
  MAX_CONTEXT_IDENTIFIER_CODE_POINTS,
  MAX_EFFECTIVE_PERIOD_REF_CODE_POINTS,
  MAX_HISTORY_BOUNDARY_REF_CODE_POINTS,
  MAX_INTEREST_RULE_REF_CODE_POINTS,
  MAX_LEGAL_BASIS_REF_CODE_POINTS,
  MAX_SOURCE_LINEAGE_SET_REF_CODE_POINTS,
  MAX_VERSION_IDENTIFIER_CODE_POINTS,
} from './validation-constants';

const validatedSnapshotBrand: unique symbol = Symbol('ValidatedCanonicalSnapshotV1');
const UNSIGNED_DECIMAL_INTEGER = /^(0|[1-9][0-9]*)$/;
const CONTROL_OR_UNPAIRED_SURROGATE = /[\u0000-\u001f\u007f-\u009f\ud800-\udfff]/u;

const SNAPSHOT_REQUIRED_FIELDS = [
  'snapshotContractVersion',
  'snapshotSerializationVersion',
  'tenantId',
  'caseId',
  'targetCollectionId',
  'currency',
  'minorUnit',
  'receiptAmountMinor',
  'snapshotAsOfDate',
  'applicationEffectiveDate',
  'historyBoundaryRef',
  'engineVersion',
  'calculationRuleVersion',
  'policyVersion',
  'rateTableVersion',
  'interpretationProfileId',
  'bucketIdentityVersion',
  'sourceVersionSet',
  'sourceVersionSetHash',
  'canonicalBuckets',
] as const;

const SOURCE_VERSION_REQUIRED_FIELDS = ['sourceReference', 'sourceVersion'] as const;

const BUCKET_REQUIRED_FIELDS = [
  'componentType',
  'componentCode',
  'bucketContextKey',
  'bucketInstanceId',
  'sourceLineageSetRef',
  'legalBasisRef',
  'effectivePeriodRef',
  'currency',
  'minorUnit',
  'priorityRank',
  'bucketBalanceMinor',
] as const;

const BUCKET_OPTIONAL_FIELDS = ['interestRuleRef'] as const;

type UnknownRecord = Readonly<Record<string, unknown>>;

export interface ValidatedCanonicalLegalBucketV1 extends CanonicalLegalBucketV1 {
  readonly legalBasisRef: string;
  readonly effectivePeriodRef: string;
  readonly interestRuleRef?: string;
}

export interface ValidatedCanonicalReceivableApplicationSnapshotV1
  extends Omit<CanonicalReceivableApplicationSnapshotV1, 'canonicalBuckets'> {
  readonly canonicalBuckets: readonly ValidatedCanonicalLegalBucketV1[];
}

/** The private symbol makes this boundary structurally non-forgeable outside this module. */
export interface ValidatedCanonicalSnapshotV1 {
  readonly [validatedSnapshotBrand]: true;
  readonly snapshotRef: SnapshotRef;
  readonly snapshotHash: SnapshotHash;
  readonly canonicalPayload: string;
  readonly snapshot: ValidatedCanonicalReceivableApplicationSnapshotV1;
}

export type CanonicalSnapshotValidationResult =
  | { readonly ok: true; readonly value: ValidatedCanonicalSnapshotV1 }
  | { readonly ok: false; readonly error: LegalApplicationPlanError };

interface ParsedEnvelopeEvidence {
  readonly snapshotRef: SnapshotRef;
  readonly snapshotHash: SnapshotHash;
}

interface SnapshotPrimitiveFacts {
  readonly snapshotContractVersion: CanonicalReceivableApplicationSnapshotV1['snapshotContractVersion'];
  readonly snapshotSerializationVersion: CanonicalReceivableApplicationSnapshotV1['snapshotSerializationVersion'];
  readonly tenantId: CanonicalReceivableApplicationSnapshotV1['tenantId'];
  readonly caseId: CanonicalReceivableApplicationSnapshotV1['caseId'];
  readonly targetCollectionId: CanonicalReceivableApplicationSnapshotV1['targetCollectionId'];
  readonly currency: CanonicalReceivableApplicationSnapshotV1['currency'];
  readonly minorUnit: CanonicalReceivableApplicationSnapshotV1['minorUnit'];
  readonly receiptAmountMinor: CanonicalReceivableApplicationSnapshotV1['receiptAmountMinor'];
  readonly snapshotAsOfDate: CanonicalReceivableApplicationSnapshotV1['snapshotAsOfDate'];
  readonly applicationEffectiveDate: CanonicalReceivableApplicationSnapshotV1['applicationEffectiveDate'];
  readonly historyBoundaryRef: CanonicalReceivableApplicationSnapshotV1['historyBoundaryRef'];
  readonly sourceVersionSetHash: CanonicalReceivableApplicationSnapshotV1['sourceVersionSetHash'];
}

interface ParsedVersionEvidence {
  readonly engineVersion: CanonicalReceivableApplicationSnapshotV1['engineVersion'];
  readonly calculationRuleVersion: CanonicalReceivableApplicationSnapshotV1['calculationRuleVersion'];
  readonly policyVersion: CanonicalReceivableApplicationSnapshotV1['policyVersion'];
  readonly rateTableVersion: CanonicalReceivableApplicationSnapshotV1['rateTableVersion'];
  readonly interpretationProfileId: CanonicalReceivableApplicationSnapshotV1['interpretationProfileId'];
  readonly bucketIdentityVersion: CanonicalReceivableApplicationSnapshotV1['bucketIdentityVersion'];
}

type ShapeValidationResult =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly reason: 'UNKNOWN_FIELD' | 'REQUIRED_FIELD_MISSING' | 'UNEXPECTED_NULL';
      readonly path: string;
    };

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isUnknownArray(value: unknown): value is readonly unknown[] {
  return Array.isArray(value);
}

function parsedValue<T>(result: ParseResult<T>): T | undefined {
  return result.ok ? result.value : undefined;
}

function failure(
  code: LegalApplicationPlanErrorCode,
  metadata?: LegalApplicationPlanErrorMetadata,
): CanonicalSnapshotValidationResult {
  const error: LegalApplicationPlanError =
    metadata === undefined ? { code } : { code, metadata };
  return { ok: false, error };
}

function serializationFailure(
  reason?: LegalApplicationPlanErrorMetadata['reason'],
  path?: string,
  configuredMaximum?: number,
  actual?: number,
): CanonicalSnapshotValidationResult {
  if (reason === undefined) {
    return failure('SNAPSHOT_SERIALIZATION_INVALID');
  }

  return failure('SNAPSHOT_SERIALIZATION_INVALID', {
    reason,
    ...(path === undefined ? {} : { path }),
    ...(configuredMaximum === undefined ? {} : { configuredMaximum }),
    ...(actual === undefined ? {} : { actual }),
  });
}

function validateObjectShape(
  value: UnknownRecord,
  requiredFields: readonly string[],
  optionalFields: readonly string[],
  path: string,
): ShapeValidationResult {
  const allowed = new Set([...requiredFields, ...optionalFields]);
  const unknown = Object.keys(value).filter((key) => !allowed.has(key)).sort();
  if (unknown.length > 0) {
    return { ok: false, reason: 'UNKNOWN_FIELD', path: `${path}.<unknown>` };
  }

  for (const field of requiredFields) {
    if (!Object.prototype.hasOwnProperty.call(value, field)) {
      return { ok: false, reason: 'REQUIRED_FIELD_MISSING', path: `${path}.${field}` };
    }
  }

  for (const field of [...requiredFields, ...optionalFields]) {
    if (Object.prototype.hasOwnProperty.call(value, field) && value[field] === null) {
      return { ok: false, reason: 'UNEXPECTED_NULL', path: `${path}.${field}` };
    }
  }

  return { ok: true };
}

function validateSnapshotSchema(snapshot: UnknownRecord): CanonicalSnapshotValidationResult | undefined {
  const topShape = validateObjectShape(snapshot, SNAPSHOT_REQUIRED_FIELDS, [], '$');
  if (!topShape.ok) {
    return serializationFailure(topShape.reason, topShape.path);
  }

  const stringFields = SNAPSHOT_REQUIRED_FIELDS.filter(
    (field) =>
      field !== 'minorUnit' &&
      field !== 'sourceVersionSet' &&
      field !== 'canonicalBuckets',
  );
  for (const field of stringFields) {
    if (typeof snapshot[field] !== 'string') {
      return serializationFailure(undefined, `$.${field}`);
    }
  }

  if (typeof snapshot.minorUnit !== 'number') {
    return serializationFailure(undefined, '$.minorUnit');
  }

  if (!isUnknownArray(snapshot.sourceVersionSet)) {
    return serializationFailure(undefined, '$.sourceVersionSet');
  }

  if (!isUnknownArray(snapshot.canonicalBuckets)) {
    return serializationFailure(undefined, '$.canonicalBuckets');
  }

  for (let index = 0; index < snapshot.sourceVersionSet.length; index += 1) {
    const value = snapshot.sourceVersionSet[index];
    if (!isRecord(value)) {
      return serializationFailure(undefined, `$.sourceVersionSet[${index}]`);
    }

    const shape = validateObjectShape(
      value,
      SOURCE_VERSION_REQUIRED_FIELDS,
      [],
      `$.sourceVersionSet[${index}]`,
    );
    if (!shape.ok) {
      return serializationFailure(shape.reason, shape.path);
    }

    if (typeof value.sourceReference !== 'string' || typeof value.sourceVersion !== 'string') {
      return serializationFailure(undefined, `$.sourceVersionSet[${index}]`);
    }
  }

  return undefined;
}

function isNfc(value: string): boolean {
  return value.normalize('NFC') === value;
}

function containsInvalidUnicode(value: string): boolean {
  return CONTROL_OR_UNPAIRED_SURROGATE.test(value);
}

function codePointCount(value: string): number {
  return Array.from(value).length;
}

function validateNfcValue(value: unknown, path: string): CanonicalSnapshotValidationResult | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  if (!isNfc(value)) {
    return serializationFailure('NON_NFC_STRING', path);
  }

  if (containsInvalidUnicode(value)) {
    return serializationFailure(undefined, path);
  }

  return undefined;
}

function validateKnownNfcStrings(
  command: UnknownRecord,
  snapshot: UnknownRecord,
): CanonicalSnapshotValidationResult | undefined {
  const commandFields = [
    'tenantId',
    'caseId',
    'collectionId',
    'receiptAmountMinor',
    'currency',
    'applicationEffectiveDate',
    'expectedSnapshotRef',
    'expectedSnapshotHash',
    'expectedSourceVersionSetHash',
    'expectedHistoryBoundaryRef',
    'idempotencyKey',
    'commandHash',
  ] as const;

  for (const field of commandFields) {
    const invalid = validateNfcValue(command[field], `$.command.${field}`);
    if (invalid !== undefined) {
      return invalid;
    }
  }

  for (const field of SNAPSHOT_REQUIRED_FIELDS) {
    const invalid = validateNfcValue(snapshot[field], `$.${field}`);
    if (invalid !== undefined) {
      return invalid;
    }
  }

  const sourceVersionSet = snapshot.sourceVersionSet;
  if (isUnknownArray(sourceVersionSet)) {
    for (let index = 0; index < sourceVersionSet.length; index += 1) {
      const source = sourceVersionSet[index];
      if (!isRecord(source)) {
        continue;
      }

      for (const field of SOURCE_VERSION_REQUIRED_FIELDS) {
        const invalid = validateNfcValue(
          source[field],
          `$.sourceVersionSet[${index}].${field}`,
        );
        if (invalid !== undefined) {
          return invalid;
        }
      }
    }
  }

  const buckets = snapshot.canonicalBuckets;
  if (isUnknownArray(buckets)) {
    for (let index = 0; index < buckets.length; index += 1) {
      const bucket = buckets[index];
      if (!isRecord(bucket)) {
        continue;
      }

      for (const field of [...BUCKET_REQUIRED_FIELDS, ...BUCKET_OPTIONAL_FIELDS]) {
        const invalid = validateNfcValue(bucket[field], `$.canonicalBuckets[${index}].${field}`);
        if (invalid !== undefined) {
          return invalid;
        }
      }
    }
  }

  return undefined;
}

function validateLength(
  value: unknown,
  path: string,
  maximum: number,
): CanonicalSnapshotValidationResult | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const actual = codePointCount(value);
  return actual > maximum
    ? serializationFailure('STRING_LIMIT_EXCEEDED', path, maximum, actual)
    : undefined;
}

function validateStringLimits(
  command: UnknownRecord,
  snapshot: UnknownRecord,
): CanonicalSnapshotValidationResult | undefined {
  const commandLimits = [
    ['tenantId', MAX_CONTEXT_IDENTIFIER_CODE_POINTS],
    ['caseId', MAX_CONTEXT_IDENTIFIER_CODE_POINTS],
    ['collectionId', MAX_CONTEXT_IDENTIFIER_CODE_POINTS],
    ['idempotencyKey', MAX_CONTEXT_IDENTIFIER_CODE_POINTS],
  ] as const;

  for (const [field, maximum] of commandLimits) {
    const invalid = validateLength(command[field], `$.command.${field}`, maximum);
    if (invalid !== undefined) {
      return invalid;
    }
  }

  const snapshotLimits = [
    ['tenantId', MAX_CONTEXT_IDENTIFIER_CODE_POINTS],
    ['caseId', MAX_CONTEXT_IDENTIFIER_CODE_POINTS],
    ['targetCollectionId', MAX_CONTEXT_IDENTIFIER_CODE_POINTS],
    ['historyBoundaryRef', MAX_HISTORY_BOUNDARY_REF_CODE_POINTS],
    ['engineVersion', MAX_VERSION_IDENTIFIER_CODE_POINTS],
    ['calculationRuleVersion', MAX_VERSION_IDENTIFIER_CODE_POINTS],
    ['policyVersion', MAX_VERSION_IDENTIFIER_CODE_POINTS],
    ['rateTableVersion', MAX_VERSION_IDENTIFIER_CODE_POINTS],
    ['interpretationProfileId', MAX_VERSION_IDENTIFIER_CODE_POINTS],
    ['bucketIdentityVersion', MAX_VERSION_IDENTIFIER_CODE_POINTS],
  ] as const;

  for (const [field, maximum] of snapshotLimits) {
    const invalid = validateLength(snapshot[field], `$.${field}`, maximum);
    if (invalid !== undefined) {
      return invalid;
    }
  }

  const sourceVersionSet = snapshot.sourceVersionSet;
  if (isUnknownArray(sourceVersionSet)) {
    for (let index = 0; index < sourceVersionSet.length; index += 1) {
      const source = sourceVersionSet[index];
      if (!isRecord(source)) {
        continue;
      }

      const invalid = validateLength(
        source.sourceVersion,
        `$.sourceVersionSet[${index}].sourceVersion`,
        MAX_VERSION_IDENTIFIER_CODE_POINTS,
      );
      if (invalid !== undefined) {
        return invalid;
      }
    }
  }

  const buckets = snapshot.canonicalBuckets;
  if (isUnknownArray(buckets)) {
    for (let index = 0; index < buckets.length; index += 1) {
      const bucket = buckets[index];
      if (!isRecord(bucket)) {
        continue;
      }

      const checks = [
        ['componentCode', MAX_COMPONENT_CODE_CODE_POINTS],
        ['sourceLineageSetRef', MAX_SOURCE_LINEAGE_SET_REF_CODE_POINTS],
        ['legalBasisRef', MAX_LEGAL_BASIS_REF_CODE_POINTS],
        ['effectivePeriodRef', MAX_EFFECTIVE_PERIOD_REF_CODE_POINTS],
        ['interestRuleRef', MAX_INTEREST_RULE_REF_CODE_POINTS],
      ] as const;
      for (const [field, maximum] of checks) {
        const invalid = validateLength(
          bucket[field],
          `$.canonicalBuckets[${index}].${field}`,
          maximum,
        );
        if (invalid !== undefined) {
          return invalid;
        }
      }
    }
  }

  return undefined;
}

function isCanonicalUnsignedDecimal(value: unknown): value is string {
  return typeof value === 'string' && UNSIGNED_DECIMAL_INTEGER.test(value);
}

function validateIntegerStrings(snapshot: UnknownRecord): CanonicalSnapshotValidationResult | undefined {
  if (!isCanonicalUnsignedDecimal(snapshot.receiptAmountMinor)) {
    return serializationFailure('INVALID_INTEGER_STRING', '$.receiptAmountMinor');
  }

  const buckets = snapshot.canonicalBuckets;
  if (!isUnknownArray(buckets)) {
    return undefined;
  }

  for (let index = 0; index < buckets.length; index += 1) {
    const bucket = buckets[index];
    if (isRecord(bucket) && !isCanonicalUnsignedDecimal(bucket.bucketBalanceMinor)) {
      return serializationFailure(
        'INVALID_INTEGER_STRING',
        `$.canonicalBuckets[${index}].bucketBalanceMinor`,
      );
    }
  }

  return undefined;
}

function isNonBlankCanonicalString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.trim() === value;
}

function isLegalApplicationComponentType(value: unknown): value is LegalApplicationComponentType {
  return (
    typeof value === 'string' &&
    (LEGAL_APPLICATION_COMPONENT_TYPES as readonly string[]).includes(value)
  );
}

function validateBucketShape(
  bucket: unknown,
  index: number,
): CanonicalSnapshotValidationResult | undefined {
  const path = `$.canonicalBuckets[${index}]`;
  if (!isRecord(bucket)) {
    return serializationFailure(undefined, path);
  }

  const shape = validateObjectShape(bucket, BUCKET_REQUIRED_FIELDS, BUCKET_OPTIONAL_FIELDS, path);
  if (!shape.ok) {
    return serializationFailure(shape.reason, shape.path);
  }

  const stringFields = [
    'componentType',
    'componentCode',
    'bucketContextKey',
    'bucketInstanceId',
    'sourceLineageSetRef',
    'legalBasisRef',
    'effectivePeriodRef',
    'currency',
    'bucketBalanceMinor',
  ] as const;
  for (const field of stringFields) {
    if (typeof bucket[field] !== 'string') {
      return serializationFailure(undefined, `${path}.${field}`);
    }
  }

  if (bucket.interestRuleRef !== undefined && typeof bucket.interestRuleRef !== 'string') {
    return serializationFailure(undefined, `${path}.interestRuleRef`);
  }

  if (
    typeof bucket.minorUnit !== 'number' ||
    typeof bucket.priorityRank !== 'number' ||
    !Number.isInteger(bucket.priorityRank) ||
    bucket.priorityRank < 0 ||
    bucket.priorityRank > POSTGRES_INTEGER_MAX
  ) {
    return failure('BUCKET_CONTEXT_UNMAPPED');
  }

  if (
    !isNonBlankCanonicalString(bucket.componentCode) ||
    !isNonBlankCanonicalString(bucket.sourceLineageSetRef) ||
    !isNonBlankCanonicalString(bucket.legalBasisRef) ||
    !isNonBlankCanonicalString(bucket.effectivePeriodRef) ||
    (bucket.interestRuleRef !== undefined &&
      !isNonBlankCanonicalString(bucket.interestRuleRef))
  ) {
    return failure('FORMATION_CONTEXT_INCOMPLETE');
  }

  return undefined;
}

function validateBucketCurrencyAndMinorUnit(
  bucket: UnknownRecord,
  snapshot: SnapshotPrimitiveFacts,
): CanonicalSnapshotValidationResult | undefined {
  const currency = parsedValue(parseCurrencyCode(bucket.currency));
  const minorUnit = parsedValue(parseMinorUnit(bucket.minorUnit));
  if (currency === undefined || minorUnit === undefined) {
    return failure('CURRENCY_OR_MINOR_UNIT_INVALID');
  }

  if (currency !== snapshot.currency || minorUnit !== snapshot.minorUnit) {
    return failure('CURRENCY_OR_MINOR_UNIT_INVALID', {
      currency,
      minorUnit,
    });
  }

  return undefined;
}

function parseCommand(command: UnknownRecord): BuildLegalApplicationPlanCommand | undefined {
  const tenantId = parsedValue(parseTenantId(command.tenantId));
  const caseId = parsedValue(parseCaseId(command.caseId));
  const collectionId = parsedValue(parseCollectionId(command.collectionId));
  const receiptAmountMinor = parsedValue(parseReceiptAmountMinor(command.receiptAmountMinor));
  const currency = parsedValue(parseCurrencyCode(command.currency));
  const minorUnit = parsedValue(parseMinorUnit(command.minorUnit));
  const applicationEffectiveDate = parsedValue(
    parseEffectiveDate(command.applicationEffectiveDate),
  );
  const expectedSnapshotRef = parsedValue(parseSnapshotRef(command.expectedSnapshotRef));
  const expectedSnapshotHash = parsedValue(parseSnapshotHash(command.expectedSnapshotHash));
  const expectedSourceVersionSetHash = parsedValue(
    parseSourceVersionSetHash(command.expectedSourceVersionSetHash),
  );
  const expectedHistoryBoundaryRef = parsedValue(
    parseHistoryBoundaryRef(command.expectedHistoryBoundaryRef),
  );
  const idempotencyKey = parsedValue(parseIdempotencyKey(command.idempotencyKey));
  const commandHash = parsedValue(parseCommandHash(command.commandHash));

  if (
    tenantId === undefined ||
    caseId === undefined ||
    collectionId === undefined ||
    receiptAmountMinor === undefined ||
    currency === undefined ||
    minorUnit === undefined ||
    applicationEffectiveDate === undefined ||
    expectedSnapshotRef === undefined ||
    expectedSnapshotHash === undefined ||
    expectedSourceVersionSetHash === undefined ||
    expectedHistoryBoundaryRef === undefined ||
    idempotencyKey === undefined ||
    commandHash === undefined
  ) {
    return undefined;
  }

  return Object.freeze({
    tenantId,
    caseId,
    collectionId,
    receiptAmountMinor,
    currency,
    minorUnit,
    applicationEffectiveDate,
    expectedSnapshotRef,
    expectedSnapshotHash,
    expectedSourceVersionSetHash,
    expectedHistoryBoundaryRef,
    idempotencyKey,
    commandHash,
  });
}

function parseEnvelopeEvidence(envelope: UnknownRecord): ParsedEnvelopeEvidence | undefined {
  const snapshotRef = parsedValue(parseSnapshotRef(envelope.snapshotRef));
  const snapshotHash = parsedValue(parseSnapshotHash(envelope.snapshotHash));
  return snapshotRef === undefined || snapshotHash === undefined
    ? undefined
    : { snapshotRef, snapshotHash };
}

function parseSnapshotPrimitiveFacts(snapshot: UnknownRecord): SnapshotPrimitiveFacts | undefined {
  const snapshotContractVersion = parsedValue(
    parseSnapshotContractVersion(snapshot.snapshotContractVersion),
  );
  const snapshotSerializationVersion = parsedValue(
    parseSerializationVersion(snapshot.snapshotSerializationVersion),
  );
  const tenantId = parsedValue(parseTenantId(snapshot.tenantId));
  const caseId = parsedValue(parseCaseId(snapshot.caseId));
  const targetCollectionId = parsedValue(parseCollectionId(snapshot.targetCollectionId));
  const currency = parsedValue(parseCurrencyCode(snapshot.currency));
  const minorUnit = parsedValue(parseMinorUnit(snapshot.minorUnit));
  const receiptAmountMinor = parsedValue(parseReceiptAmountMinor(snapshot.receiptAmountMinor));
  const snapshotAsOfDate = parsedValue(parseSnapshotDate(snapshot.snapshotAsOfDate));
  const applicationEffectiveDate = parsedValue(
    parseEffectiveDate(snapshot.applicationEffectiveDate),
  );
  const historyBoundaryRef = parsedValue(parseHistoryBoundaryRef(snapshot.historyBoundaryRef));
  const sourceVersionSetHash = parsedValue(
    parseSourceVersionSetHash(snapshot.sourceVersionSetHash),
  );

  if (
    snapshotContractVersion === undefined ||
    snapshotSerializationVersion === undefined ||
    tenantId === undefined ||
    caseId === undefined ||
    targetCollectionId === undefined ||
    currency === undefined ||
    minorUnit === undefined ||
    receiptAmountMinor === undefined ||
    snapshotAsOfDate === undefined ||
    applicationEffectiveDate === undefined ||
    historyBoundaryRef === undefined ||
    sourceVersionSetHash === undefined
  ) {
    return undefined;
  }

  return {
    snapshotContractVersion,
    snapshotSerializationVersion,
    tenantId,
    caseId,
    targetCollectionId,
    currency,
    minorUnit,
    receiptAmountMinor,
    snapshotAsOfDate,
    applicationEffectiveDate,
    historyBoundaryRef,
    sourceVersionSetHash,
  };
}

function parseVersionEvidence(snapshot: UnknownRecord): ParsedVersionEvidence | undefined {
  const engineVersion = parsedValue(parseEngineVersion(snapshot.engineVersion));
  const calculationRuleVersion = parsedValue(
    parseRuleVersion(snapshot.calculationRuleVersion),
  );
  const policyVersion = parsedValue(parsePolicyVersion(snapshot.policyVersion));
  const rateTableVersion = parsedValue(parseRateVersion(snapshot.rateTableVersion));
  const interpretationProfileId = parsedValue(
    parseInterpretationVersion(snapshot.interpretationProfileId),
  );
  const bucketIdentityVersion = parsedValue(
    parseBucketIdentityVersion(snapshot.bucketIdentityVersion),
  );

  if (
    engineVersion === undefined ||
    calculationRuleVersion === undefined ||
    policyVersion === undefined ||
    rateTableVersion === undefined ||
    interpretationProfileId === undefined ||
    bucketIdentityVersion === undefined
  ) {
    return undefined;
  }

  return {
    engineVersion,
    calculationRuleVersion,
    policyVersion,
    rateTableVersion,
    interpretationProfileId,
    bucketIdentityVersion,
  };
}

function parseSourceVersionSet(snapshot: UnknownRecord): readonly CanonicalSourceVersionV1[] | undefined {
  const rawSources = snapshot.sourceVersionSet;
  if (!isUnknownArray(rawSources) || rawSources.length === 0) {
    return undefined;
  }

  const sources: CanonicalSourceVersionV1[] = [];
  const identities = new Set<string>();
  for (const rawSource of rawSources) {
    if (!isRecord(rawSource)) {
      return undefined;
    }

    const sourceReference = parsedValue(parseSourceReference(rawSource.sourceReference));
    const sourceVersion = parsedValue(parseSourceVersion(rawSource.sourceVersion));
    if (sourceReference === undefined || sourceVersion === undefined) {
      return undefined;
    }

    const identity = `${sourceReference}\u0000${sourceVersion}`;
    if (identities.has(identity)) {
      return undefined;
    }
    identities.add(identity);
    sources.push(Object.freeze({ sourceReference, sourceVersion }));
  }

  return Object.freeze(sources);
}

function parseValidatedBuckets(
  snapshot: UnknownRecord,
): readonly ValidatedCanonicalLegalBucketV1[] | undefined {
  const rawBuckets = snapshot.canonicalBuckets;
  if (!isUnknownArray(rawBuckets)) {
    return undefined;
  }

  const buckets: ValidatedCanonicalLegalBucketV1[] = [];
  for (const rawBucket of rawBuckets) {
    if (!isRecord(rawBucket) || !isLegalApplicationComponentType(rawBucket.componentType)) {
      return undefined;
    }

    const componentCode = parsedValue(parseComponentCode(rawBucket.componentCode));
    const bucketContextKey = parsedValue(parseBucketContextKey(rawBucket.bucketContextKey));
    const bucketInstanceId = parsedValue(parseBucketInstanceId(rawBucket.bucketInstanceId));
    const sourceLineageSetRef = parsedValue(
      parseSourceLineageSetRef(rawBucket.sourceLineageSetRef),
    );
    const currency = parsedValue(parseCurrencyCode(rawBucket.currency));
    const minorUnit = parsedValue(parseMinorUnit(rawBucket.minorUnit));
    const bucketBalanceMinor = parsedValue(
      parseBucketBalanceMinor(rawBucket.bucketBalanceMinor),
    );

    if (
      componentCode === undefined ||
      bucketContextKey === undefined ||
      bucketInstanceId === undefined ||
      sourceLineageSetRef === undefined ||
      currency === undefined ||
      minorUnit === undefined ||
      bucketBalanceMinor === undefined ||
      typeof rawBucket.priorityRank !== 'number' ||
      typeof rawBucket.legalBasisRef !== 'string' ||
      typeof rawBucket.effectivePeriodRef !== 'string'
    ) {
      return undefined;
    }

    const bucket: ValidatedCanonicalLegalBucketV1 = Object.freeze({
      componentType: rawBucket.componentType,
      componentCode,
      bucketContextKey,
      bucketInstanceId,
      sourceLineageSetRef,
      legalBasisRef: rawBucket.legalBasisRef,
      effectivePeriodRef: rawBucket.effectivePeriodRef,
      ...(typeof rawBucket.interestRuleRef === 'string'
        ? { interestRuleRef: rawBucket.interestRuleRef }
        : {}),
      currency,
      minorUnit,
      priorityRank: rawBucket.priorityRank,
      bucketBalanceMinor,
    });
    buckets.push(bucket);
  }

  return Object.freeze(buckets);
}

function materializeValidatedSnapshot(
  rawSnapshot: UnknownRecord,
  primitives: SnapshotPrimitiveFacts,
  versions: ParsedVersionEvidence,
  sourceVersionSet: readonly CanonicalSourceVersionV1[],
  canonicalBuckets: readonly ValidatedCanonicalLegalBucketV1[],
): ValidatedCanonicalReceivableApplicationSnapshotV1 {
  return Object.freeze({
    ...primitives,
    ...versions,
    sourceVersionSet,
    sourceVersionSetHash: primitives.sourceVersionSetHash,
    canonicalBuckets,
  });
}

/**
 * Pure trust-boundary validator for RCV-CAS/v1. It performs no allocation, persistence,
 * orchestration, clock, environment, network or database work.
 */
export function validateCanonicalSnapshot(input: unknown): CanonicalSnapshotValidationResult {
  // 01 — envelope presence/basic type
  if (!isRecord(input) || !isRecord(input.command) || !isRecord(input.snapshotEnvelope)) {
    return failure('SNAPSHOT_UNAVAILABLE');
  }

  const commandRecord = input.command;
  const envelopeRecord = input.snapshotEnvelope;
  if (typeof envelopeRecord.canonicalPayload !== 'string') {
    return failure('SNAPSHOT_UNAVAILABLE');
  }

  const canonicalPayload = envelopeRecord.canonicalPayload;

  // 02 — raw payload byte limit
  const payloadBytes = Buffer.byteLength(canonicalPayload, 'utf8');
  if (payloadBytes === 0) {
    return serializationFailure();
  }
  if (payloadBytes > MAX_CANONICAL_ENVELOPE_BYTES) {
    return serializationFailure(
      'PAYLOAD_LIMIT_EXCEEDED',
      '$.snapshotEnvelope.canonicalPayload',
      MAX_CANONICAL_ENVELOPE_BYTES,
      payloadBytes,
    );
  }

  // 03/04/05 — syntax, duplicate members, depth
  const strictJson = parseStrictJson(canonicalPayload);
  if (!strictJson.ok) {
    if (strictJson.failure.kind === 'DUPLICATE_MEMBER') {
      return serializationFailure('DUPLICATE_JSON_MEMBER', strictJson.failure.path);
    }
    if (strictJson.failure.kind === 'MAX_DEPTH') {
      return serializationFailure(
        'MAX_DEPTH_EXCEEDED',
        '$',
        MAX_CANONICAL_JSON_DEPTH,
        strictJson.failure.actual,
      );
    }
    return serializationFailure();
  }

  if (!isRecord(strictJson.value)) {
    return serializationFailure();
  }
  const rawSnapshot = strictJson.value;

  // 06/07 — version pins
  if (rawSnapshot.snapshotContractVersion !== SNAPSHOT_CONTRACT_VERSION) {
    return failure('SNAPSHOT_CONTRACT_UNSUPPORTED');
  }
  if (rawSnapshot.snapshotSerializationVersion !== SNAPSHOT_SERIALIZATION_VERSION) {
    return serializationFailure();
  }

  // 08 — APPLY-only direction
  if (input.direction !== 'APPLY') {
    return failure('DIRECTION_NOT_AUTHORIZED');
  }

  // 09 — command primitive formats
  const command = parseCommand(commandRecord);
  if (command === undefined) {
    if (parsedValue(parseReceiptAmountMinor(commandRecord.receiptAmountMinor)) === undefined) {
      return failure('RECEIPT_AMOUNT_INVALID');
    }
    if (
      parsedValue(parseCurrencyCode(commandRecord.currency)) === undefined ||
      parsedValue(parseMinorUnit(commandRecord.minorUnit)) === undefined
    ) {
      return failure('CURRENCY_OR_MINOR_UNIT_INVALID');
    }
    if (parsedValue(parseEffectiveDate(commandRecord.applicationEffectiveDate)) === undefined) {
      return failure('EFFECTIVE_DATE_MISMATCH');
    }
    return failure('FORMATION_CONTEXT_INCOMPLETE');
  }

  // 10 — snapshot primitive formats
  const envelopeEvidence = parseEnvelopeEvidence(envelopeRecord);
  if (envelopeEvidence === undefined) {
    return failure(
      parsedValue(parseSnapshotHash(envelopeRecord.snapshotHash)) === undefined
        ? 'SNAPSHOT_HASH_MISMATCH'
        : 'SNAPSHOT_REF_MISMATCH',
    );
  }
  const snapshotPrimitives = parseSnapshotPrimitiveFacts(rawSnapshot);
  if (snapshotPrimitives === undefined) {
    if (
      parsedValue(parseCurrencyCode(rawSnapshot.currency)) === undefined ||
      parsedValue(parseMinorUnit(rawSnapshot.minorUnit)) === undefined
    ) {
      return failure('CURRENCY_OR_MINOR_UNIT_INVALID');
    }
    if (parsedValue(parseEffectiveDate(rawSnapshot.applicationEffectiveDate)) === undefined) {
      return failure('EFFECTIVE_DATE_MISMATCH');
    }
    if (parsedValue(parseReceiptAmountMinor(rawSnapshot.receiptAmountMinor)) === undefined) {
      return failure('RECEIPT_AMOUNT_INVALID');
    }
    return failure('FORMATION_CONTEXT_INCOMPLETE');
  }

  // 11/12 — tenant, case and receipt target binding
  if (command.tenantId !== snapshotPrimitives.tenantId) {
    return failure('TENANT_CONTEXT_MISMATCH');
  }
  if (command.caseId !== snapshotPrimitives.caseId) {
    return failure('CASE_CONTEXT_MISMATCH');
  }
  if (command.collectionId !== snapshotPrimitives.targetCollectionId) {
    return failure('FORMATION_CONTEXT_INCOMPLETE');
  }
  if (command.receiptAmountMinor !== snapshotPrimitives.receiptAmountMinor) {
    return failure('RECEIPT_AMOUNT_INVALID');
  }

  // 13/14 — currency/minor-unit binding
  if (
    command.currency !== snapshotPrimitives.currency ||
    command.minorUnit !== snapshotPrimitives.minorUnit
  ) {
    return failure('CURRENCY_OR_MINOR_UNIT_INVALID', {
      currency: snapshotPrimitives.currency,
      minorUnit: snapshotPrimitives.minorUnit,
    });
  }

  // 15 — effective-date binding
  if (command.applicationEffectiveDate !== snapshotPrimitives.applicationEffectiveDate) {
    return failure('EFFECTIVE_DATE_MISMATCH', {
      effectiveDate: snapshotPrimitives.applicationEffectiveDate,
    });
  }

  // 16 — history-boundary binding
  if (command.expectedHistoryBoundaryRef !== snapshotPrimitives.historyBoundaryRef) {
    return failure('HISTORY_BOUNDARY_UNAUTHORIZED', {
      historyBoundaryRef: snapshotPrimitives.historyBoundaryRef,
      expectedHistoryBoundaryRef: command.expectedHistoryBoundaryRef,
    });
  }

  // 17 — source-version and externally supplied hash/ref binding
  if (command.expectedSourceVersionSetHash !== snapshotPrimitives.sourceVersionSetHash) {
    return failure('SOURCE_VERSION_INCOMPLETE', {
      sourceVersionSetHash: snapshotPrimitives.sourceVersionSetHash,
      expectedSourceVersionSetHash: command.expectedSourceVersionSetHash,
    });
  }
  if (command.expectedSnapshotHash !== envelopeEvidence.snapshotHash) {
    return failure('SNAPSHOT_HASH_MISMATCH', {
      snapshotHash: envelopeEvidence.snapshotHash,
      expectedSnapshotHash: command.expectedSnapshotHash,
    });
  }
  if (command.expectedSnapshotRef !== envelopeEvidence.snapshotRef) {
    return failure('SNAPSHOT_REF_MISMATCH', {
      snapshotRef: envelopeEvidence.snapshotRef,
      expectedSnapshotRef: command.expectedSnapshotRef,
    });
  }

  // 18 — exact top/source schema; bucket schema is checked after the count guard
  const schemaFailure = validateSnapshotSchema(rawSnapshot);
  if (schemaFailure !== undefined) {
    return schemaFailure;
  }

  // 19 — NFC/control validation, followed by canonical code-point limits
  const nfcFailure = validateKnownNfcStrings(commandRecord, rawSnapshot);
  if (nfcFailure !== undefined) {
    return nfcFailure;
  }
  const stringLimitFailure = validateStringLimits(commandRecord, rawSnapshot);
  if (stringLimitFailure !== undefined) {
    return stringLimitFailure;
  }

  // 20 — canonical integer strings
  const integerFailure = validateIntegerStrings(rawSnapshot);
  if (integerFailure !== undefined) {
    return integerFailure;
  }

  const rawBuckets = rawSnapshot.canonicalBuckets;
  if (!isUnknownArray(rawBuckets)) {
    return serializationFailure();
  }

  // 21 — bucket count
  if (rawBuckets.length > MAX_BUCKET_COUNT) {
    return serializationFailure(
      'BUCKET_LIMIT_EXCEEDED',
      '$.canonicalBuckets',
      MAX_BUCKET_COUNT,
      rawBuckets.length,
    );
  }

  // 22 — per-bucket exact structure
  for (let index = 0; index < rawBuckets.length; index += 1) {
    const structuralFailure = validateBucketShape(rawBuckets[index], index);
    if (structuralFailure !== undefined) {
      return structuralFailure;
    }
  }

  // 23 — closed component set
  for (const bucket of rawBuckets) {
    if (!isRecord(bucket) || !isLegalApplicationComponentType(bucket.componentType)) {
      return failure('BUCKET_CONTEXT_UNMAPPED');
    }
  }

  // 24 — bucket identity formats, RCV-BINST/v1 integrity, and currency/minor-unit coherence
  const enforcesNonCircularBucketIdentity =
    rawSnapshot.bucketIdentityVersion === BUCKET_INSTANCE_IDENTITY_CONTRACT_VERSION;
  const identityCalculationRuleVersion = enforcesNonCircularBucketIdentity
    ? parsedValue(parseRuleVersion(rawSnapshot.calculationRuleVersion))
    : undefined;
  if (enforcesNonCircularBucketIdentity && identityCalculationRuleVersion === undefined) {
    return failure('BUCKET_IDENTITY_INVALID');
  }

  for (const bucket of rawBuckets) {
    if (!isRecord(bucket)) {
      return failure('BUCKET_IDENTITY_INVALID');
    }
    const bucketContextKey = parsedValue(parseBucketContextKey(bucket.bucketContextKey));
    const bucketInstanceId = parsedValue(parseBucketInstanceId(bucket.bucketInstanceId));
    if (bucketContextKey === undefined || bucketInstanceId === undefined) {
      return failure('BUCKET_IDENTITY_INVALID');
    }
    if (
      enforcesNonCircularBucketIdentity &&
      identityCalculationRuleVersion !== undefined &&
      !validateBucketInstanceId(
        {
          identityContractVersion: BUCKET_INSTANCE_IDENTITY_CONTRACT_VERSION,
          tenantId: snapshotPrimitives.tenantId,
          caseId: snapshotPrimitives.caseId,
          sourceVersionSetHash: snapshotPrimitives.sourceVersionSetHash,
          historyBoundaryRef: snapshotPrimitives.historyBoundaryRef,
          snapshotAsOfDate: snapshotPrimitives.snapshotAsOfDate,
          applicationEffectiveDate: snapshotPrimitives.applicationEffectiveDate,
          calculationRuleVersion: identityCalculationRuleVersion,
          bucketContextKey,
        },
        bucketInstanceId,
      ).ok
    ) {
      return failure('BUCKET_IDENTITY_INVALID', { bucketInstanceId, bucketContextKey });
    }
    const currencyFailure = validateBucketCurrencyAndMinorUnit(bucket, snapshotPrimitives);
    if (currencyFailure !== undefined) {
      return currencyFailure;
    }
  }

  // 25/26 — duplicate identities, never deduplicated or merged
  const contextKeys = new Set<string>();
  const instanceIds = new Set<string>();
  for (const bucket of rawBuckets) {
    if (!isRecord(bucket) || typeof bucket.bucketContextKey !== 'string') {
      return failure('BUCKET_IDENTITY_INVALID');
    }
    if (contextKeys.has(bucket.bucketContextKey)) {
      const bucketContextKey = parsedValue(parseBucketContextKey(bucket.bucketContextKey));
      return failure('DUPLICATE_BUCKET_CONTEXT', {
        ...(bucketContextKey === undefined ? {} : { bucketContextKey }),
      });
    }
    contextKeys.add(bucket.bucketContextKey);

    if (typeof bucket.bucketInstanceId !== 'string') {
      return failure('BUCKET_IDENTITY_INVALID');
    }
    if (instanceIds.has(bucket.bucketInstanceId)) {
      const bucketInstanceId = parsedValue(parseBucketInstanceId(bucket.bucketInstanceId));
      return failure('BUCKET_IDENTITY_INVALID', {
        ...(bucketInstanceId === undefined ? {} : { bucketInstanceId }),
      });
    }
    instanceIds.add(bucket.bucketInstanceId);
  }

  // 27 — persistence-safe amount bounds
  if (BigInt(rawSnapshot.receiptAmountMinor as string) > POSTGRES_BIGINT_MAX) {
    return failure('AMOUNT_OUT_OF_RANGE');
  }
  for (const bucket of rawBuckets) {
    if (
      !isRecord(bucket) ||
      typeof bucket.bucketBalanceMinor !== 'string' ||
      BigInt(bucket.bucketBalanceMinor) > POSTGRES_BIGINT_MAX
    ) {
      return failure('AMOUNT_OUT_OF_RANGE');
    }
  }

  // 28 — required evidence/version completeness
  const versionEvidence = parseVersionEvidence(rawSnapshot);
  if (versionEvidence === undefined) {
    return parsedValue(parsePolicyVersion(rawSnapshot.policyVersion)) === undefined
      ? failure('POLICY_VERSION_MISSING')
      : failure('FORMATION_CONTEXT_INCOMPLETE');
  }
  const sourceVersionSet = parseSourceVersionSet(rawSnapshot);
  if (sourceVersionSet === undefined) {
    return failure('SOURCE_VERSION_INCOMPLETE');
  }
  const validatedBuckets = parseValidatedBuckets(rawSnapshot);
  if (validatedBuckets === undefined) {
    return failure('FORMATION_CONTEXT_INCOMPLETE');
  }

  // Official snapshots bind the declared source set to a deterministic digest and order.
  if (versionEvidence.bucketIdentityVersion === 'RCV-BINST/v1') {
    let canonicalSources: readonly CanonicalSourceVersionV1[];
    let computedSourceVersionSetHash: string;
    try {
      canonicalSources = sortSourceVersionSet(sourceVersionSet);
      computedSourceVersionSetHash = computeSourceVersionSetHash(canonicalSources);
    } catch {
      return failure('SOURCE_VERSION_INCOMPLETE');
    }
    if (
      computedSourceVersionSetHash !== snapshotPrimitives.sourceVersionSetHash ||
      canonicalSources.some(
        (source, index) =>
          source.sourceReference !== sourceVersionSet[index]?.sourceReference ||
          source.sourceVersion !== sourceVersionSet[index]?.sourceVersion,
      )
    ) {
      return failure('SOURCE_VERSION_INCOMPLETE');
    }

  }

  // 29/30 — domain serializer and exact canonical byte equality
  const canonicalReserialization = serializeCanonicalJson(strictJson.value as StrictJsonValue);
  if (canonicalReserialization !== canonicalPayload) {
    return serializationFailure();
  }
  const canonicalEnvelopeBytes = Buffer.from(canonicalPayload, 'utf8');

  // 31/32 — domain-separated SHA-256 and exact equality
  const computedHash = computeCanonicalSnapshotHash(canonicalEnvelopeBytes);
  if (computedHash !== envelopeEvidence.snapshotHash) {
    return failure('SNAPSHOT_HASH_MISMATCH', {
      snapshotHash: envelopeEvidence.snapshotHash,
      expectedSnapshotHash: command.expectedSnapshotHash,
    });
  }

  // 33 — snapshotRef suffix/hash equality
  if (canonicalSnapshotRefForHash(computedHash) !== envelopeEvidence.snapshotRef) {
    return failure('SNAPSHOT_REF_MISMATCH', {
      snapshotRef: envelopeEvidence.snapshotRef,
      expectedSnapshotRef: command.expectedSnapshotRef,
    });
  }

  // 34 — opaque immutable success boundary
  const snapshot = materializeValidatedSnapshot(
    rawSnapshot,
    snapshotPrimitives,
    versionEvidence,
    sourceVersionSet,
    validatedBuckets,
  );
  return {
    ok: true,
    value: Object.freeze({
      [validatedSnapshotBrand]: true as const,
      snapshotRef: envelopeEvidence.snapshotRef,
      snapshotHash: envelopeEvidence.snapshotHash,
      canonicalPayload,
      snapshot,
    }),
  };
}
