const legalApplicationPlanBrand: unique symbol = Symbol('LegalApplicationPlanBrand');

type Brand<T, Name extends string> = T & {
  readonly [legalApplicationPlanBrand]: Name;
};

export const POSTGRES_BIGINT_MAX = 9223372036854775807n;
export const POSTGRES_INTEGER_MAX = 2147483647;

export const SNAPSHOT_CONTRACT_VERSION = 'CanonicalReceivableApplicationSnapshotV1' as const;
export const SNAPSHOT_SERIALIZATION_VERSION = 'RCV-CAS/v1' as const;

export const CANONICAL_CURRENCY_CODES = ['TRY', 'USD', 'EUR', 'GBP', 'CHF'] as const;

export type PrimitiveParseErrorCode =
  | 'TYPE_MISMATCH'
  | 'EMPTY'
  | 'NON_CANONICAL_WHITESPACE'
  | 'INVALID_FORMAT'
  | 'OUT_OF_RANGE'
  | 'UNSUPPORTED_VALUE';

export interface PrimitiveParseError {
  readonly code: PrimitiveParseErrorCode;
  readonly field: string;
}

export type ParseResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: PrimitiveParseError };

export type TenantId = Brand<string, 'TenantId'>;
export type CaseId = Brand<string, 'CaseId'>;
export type CollectionId = Brand<string, 'CollectionId'>;
export type SnapshotRef = Brand<string, 'SnapshotRef'>;
export type SnapshotHash = Brand<string, 'SnapshotHash'>;
export type SourceVersionSetHash = Brand<string, 'SourceVersionSetHash'>;
export type HistoryBoundaryRef = Brand<string, 'HistoryBoundaryRef'>;
export type BucketContextKey = Brand<string, 'BucketContextKey'>;
export type BucketInstanceId = Brand<string, 'BucketInstanceId'>;
export type SourceLineageSetRef = Brand<string, 'SourceLineageSetRef'>;
export type ComponentCode = Brand<string, 'ComponentCode'>;
export type PolicyVersion = Brand<string, 'PolicyVersion'>;
export type RuleVersion = Brand<string, 'RuleVersion'>;
export type EngineVersion = Brand<string, 'EngineVersion'>;
export type RateVersion = Brand<string, 'RateVersion'>;
export type InterpretationVersion = Brand<string, 'InterpretationVersion'>;
export type BucketIdentityVersion = Brand<string, 'BucketIdentityVersion'>;
export type SnapshotContractVersion = Brand<
  typeof SNAPSHOT_CONTRACT_VERSION,
  'SnapshotContractVersion'
>;
export type SerializationVersion = Brand<
  typeof SNAPSHOT_SERIALIZATION_VERSION,
  'SerializationVersion'
>;
export type CommandHash = Brand<string, 'CommandHash'>;
export type PlanFingerprint = Brand<string, 'PlanFingerprint'>;
export type IdempotencyKey = Brand<string, 'IdempotencyKey'>;
export type SourceReference = Brand<string, 'SourceReference'>;
export type SourceVersion = Brand<string, 'SourceVersion'>;

export type MinorAmount = Brand<bigint, 'MinorAmount'>;
export type ReceiptAmountMinor = Brand<bigint, 'ReceiptAmountMinor'>;
export type BucketBalanceMinor = Brand<bigint, 'BucketBalanceMinor'>;
export type AppliedAmountMinor = Brand<bigint, 'AppliedAmountMinor'>;
export type HeldRemainderMinor = Brand<bigint, 'HeldRemainderMinor'>;
export type UnsignedMinorAmountString = Brand<string, 'UnsignedMinorAmountString'>;
export type MinorUnit = Brand<number, 'MinorUnit'>;
export type CurrencyCode = (typeof CANONICAL_CURRENCY_CODES)[number];

export type CanonicalIsoDate = Brand<string, 'CanonicalIsoDate'>;
export type SnapshotDate = Brand<string, 'SnapshotDate'>;
export type EffectiveDate = Brand<string, 'EffectiveDate'>;

type AnyMinorAmount =
  | MinorAmount
  | ReceiptAmountMinor
  | BucketBalanceMinor
  | AppliedAmountMinor
  | HeldRemainderMinor;

function success<T>(value: T): ParseResult<T> {
  return { ok: true, value };
}

function failure(field: string, code: PrimitiveParseErrorCode): ParseResult<never> {
  return { ok: false, error: { field, code } };
}

function parseCanonicalNonBlank<T extends string>(input: unknown, field: string): ParseResult<T> {
  if (typeof input !== 'string') {
    return failure(field, 'TYPE_MISMATCH');
  }

  if (input.length === 0) {
    return failure(field, 'EMPTY');
  }

  if (input.trim() !== input) {
    return failure(field, 'NON_CANONICAL_WHITESPACE');
  }

  return success(input as T);
}

function createNonBlankParser<T extends string>(field: string): (input: unknown) => ParseResult<T> {
  return (input: unknown): ParseResult<T> => parseCanonicalNonBlank<T>(input, field);
}

export const parseTenantId = createNonBlankParser<TenantId>('tenantId');
export const parseCaseId = createNonBlankParser<CaseId>('caseId');
export const parseCollectionId = createNonBlankParser<CollectionId>('collectionId');
export const parseHistoryBoundaryRef =
  createNonBlankParser<HistoryBoundaryRef>('historyBoundaryRef');
export const parseSourceLineageSetRef =
  createNonBlankParser<SourceLineageSetRef>('sourceLineageSetRef');
export const parseComponentCode = createNonBlankParser<ComponentCode>('componentCode');
export const parsePolicyVersion = createNonBlankParser<PolicyVersion>('policyVersion');
export const parseRuleVersion = createNonBlankParser<RuleVersion>('ruleVersion');
export const parseEngineVersion = createNonBlankParser<EngineVersion>('engineVersion');
export const parseRateVersion = createNonBlankParser<RateVersion>('rateVersion');
export const parseInterpretationVersion =
  createNonBlankParser<InterpretationVersion>('interpretationVersion');
export const parseBucketIdentityVersion =
  createNonBlankParser<BucketIdentityVersion>('bucketIdentityVersion');
export const parseCommandHash = createNonBlankParser<CommandHash>('commandHash');
export const parsePlanFingerprint = createNonBlankParser<PlanFingerprint>('planFingerprint');
export const parseIdempotencyKey = createNonBlankParser<IdempotencyKey>('idempotencyKey');
export const parseSourceReference = createNonBlankParser<SourceReference>('sourceReference');
export const parseSourceVersion = createNonBlankParser<SourceVersion>('sourceVersion');

const SHA256_LOWERCASE_HEX = /^[0-9a-f]{64}$/;
const SNAPSHOT_REF = /^rcv-app-snapshot:v1:sha256:[0-9a-f]{64}$/;
const BUCKET_CONTEXT_KEY = /^bctx:v1:sha256:[0-9a-f]{64}$/;
const BUCKET_INSTANCE_ID = /^binst:v1:sha256:[0-9a-f]{64}$/;

function parseSha256<T extends string>(input: unknown, field: string): ParseResult<T> {
  if (typeof input !== 'string') {
    return failure(field, 'TYPE_MISMATCH');
  }

  return SHA256_LOWERCASE_HEX.test(input)
    ? success(input as T)
    : failure(field, 'INVALID_FORMAT');
}

function parsePrefixedSha256<T extends string>(
  input: unknown,
  field: string,
  pattern: RegExp,
): ParseResult<T> {
  if (typeof input !== 'string') {
    return failure(field, 'TYPE_MISMATCH');
  }

  return pattern.test(input) ? success(input as T) : failure(field, 'INVALID_FORMAT');
}

export function parseSnapshotHash(input: unknown): ParseResult<SnapshotHash> {
  return parseSha256<SnapshotHash>(input, 'snapshotHash');
}

export function parseSourceVersionSetHash(input: unknown): ParseResult<SourceVersionSetHash> {
  return parseSha256<SourceVersionSetHash>(input, 'sourceVersionSetHash');
}

export function parseSnapshotRef(input: unknown): ParseResult<SnapshotRef> {
  return parsePrefixedSha256<SnapshotRef>(input, 'snapshotRef', SNAPSHOT_REF);
}

export function parseBucketContextKey(input: unknown): ParseResult<BucketContextKey> {
  return parsePrefixedSha256<BucketContextKey>(input, 'bucketContextKey', BUCKET_CONTEXT_KEY);
}

export function parseBucketInstanceId(input: unknown): ParseResult<BucketInstanceId> {
  return parsePrefixedSha256<BucketInstanceId>(input, 'bucketInstanceId', BUCKET_INSTANCE_ID);
}

export function parseSnapshotContractVersion(input: unknown): ParseResult<SnapshotContractVersion> {
  return input === SNAPSHOT_CONTRACT_VERSION
    ? success(input as SnapshotContractVersion)
    : failure('snapshotContractVersion', 'UNSUPPORTED_VALUE');
}

export function parseSerializationVersion(input: unknown): ParseResult<SerializationVersion> {
  return input === SNAPSHOT_SERIALIZATION_VERSION
    ? success(input as SerializationVersion)
    : failure('serializationVersion', 'UNSUPPORTED_VALUE');
}

const UNSIGNED_DECIMAL_INTEGER = /^(0|[1-9][0-9]*)$/;

function parseMinorAmountAs<T extends bigint>(input: unknown, field: string): ParseResult<T> {
  if (typeof input !== 'string') {
    return failure(field, 'TYPE_MISMATCH');
  }

  if (!UNSIGNED_DECIMAL_INTEGER.test(input)) {
    return failure(field, 'INVALID_FORMAT');
  }

  const value = BigInt(input);
  if (value > POSTGRES_BIGINT_MAX) {
    return failure(field, 'OUT_OF_RANGE');
  }

  return success(value as T);
}

export function parseMinorAmount(input: unknown): ParseResult<MinorAmount> {
  return parseMinorAmountAs<MinorAmount>(input, 'minorAmount');
}

export function parseReceiptAmountMinor(input: unknown): ParseResult<ReceiptAmountMinor> {
  return parseMinorAmountAs<ReceiptAmountMinor>(input, 'receiptAmountMinor');
}

export function parseBucketBalanceMinor(input: unknown): ParseResult<BucketBalanceMinor> {
  return parseMinorAmountAs<BucketBalanceMinor>(input, 'bucketBalanceMinor');
}

export function parseAppliedAmountMinor(input: unknown): ParseResult<AppliedAmountMinor> {
  return parseMinorAmountAs<AppliedAmountMinor>(input, 'appliedAmountMinor');
}

export function parseHeldRemainderMinor(input: unknown): ParseResult<HeldRemainderMinor> {
  return parseMinorAmountAs<HeldRemainderMinor>(input, 'heldRemainderMinor');
}

export function formatMinorAmount(value: AnyMinorAmount): UnsignedMinorAmountString {
  return value.toString() as UnsignedMinorAmountString;
}

export function parseMinorUnit(input: unknown): ParseResult<MinorUnit> {
  if (typeof input !== 'number') {
    return failure('minorUnit', 'TYPE_MISMATCH');
  }

  if (!Number.isInteger(input)) {
    return failure('minorUnit', 'INVALID_FORMAT');
  }

  if (input < 0 || input > POSTGRES_INTEGER_MAX) {
    return failure('minorUnit', 'OUT_OF_RANGE');
  }

  return success(input as MinorUnit);
}

export function parseCurrencyCode(input: unknown): ParseResult<CurrencyCode> {
  if (typeof input !== 'string') {
    return failure('currency', 'TYPE_MISMATCH');
  }

  return (CANONICAL_CURRENCY_CODES as readonly string[]).includes(input)
    ? success(input as CurrencyCode)
    : failure('currency', 'UNSUPPORTED_VALUE');
}

const CANONICAL_ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) {
    return isLeapYear(year) ? 29 : 28;
  }

  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

function parseIsoDateAs<T extends string>(input: unknown, field: string): ParseResult<T> {
  if (typeof input !== 'string') {
    return failure(field, 'TYPE_MISMATCH');
  }

  const match = CANONICAL_ISO_DATE.exec(input);
  if (match === null) {
    return failure(field, 'INVALID_FORMAT');
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  if (year === 0 || month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) {
    return failure(field, 'INVALID_FORMAT');
  }

  return success(input as T);
}

export function parseCanonicalIsoDate(input: unknown): ParseResult<CanonicalIsoDate> {
  return parseIsoDateAs<CanonicalIsoDate>(input, 'date');
}

export function parseSnapshotDate(input: unknown): ParseResult<SnapshotDate> {
  return parseIsoDateAs<SnapshotDate>(input, 'snapshotDate');
}

export function parseEffectiveDate(input: unknown): ParseResult<EffectiveDate> {
  return parseIsoDateAs<EffectiveDate>(input, 'effectiveDate');
}
