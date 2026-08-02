import { createHash } from 'node:crypto';
import { serializeCanonicalJson } from './canonical-snapshot-serializer';
import {
  parseBucketContextKey,
  parseBucketInstanceId,
  parseCaseId,
  parseEffectiveDate,
  parseHistoryBoundaryRef,
  parseRuleVersion,
  parseSnapshotDate,
  parseSourceVersionSetHash,
  parseTenantId,
  type BucketContextKey,
  type BucketInstanceId,
  type CaseId,
  type EffectiveDate,
  type HistoryBoundaryRef,
  type ParseResult,
  type RuleVersion,
  type SnapshotDate,
  type SourceVersionSetHash,
  type TenantId,
} from './primitives';
import type { StrictJsonValue } from './strict-json-parser';

export const BUCKET_INSTANCE_IDENTITY_CONTRACT_VERSION = 'RCV-BINST/v1' as const;

export const BUCKET_INSTANCE_IDENTITY_PREIMAGE_FIELDS = [
  'identityContractVersion',
  'tenantId',
  'caseId',
  'sourceVersionSetHash',
  'historyBoundaryRef',
  'snapshotAsOfDate',
  'applicationEffectiveDate',
  'calculationRuleVersion',
  'bucketContextKey',
] as const;

const DOMAIN_SEPARATOR = Buffer.concat([
  Buffer.from(BUCKET_INSTANCE_IDENTITY_CONTRACT_VERSION, 'utf8'),
  Buffer.from([0]),
]);

type PreimageField = (typeof BUCKET_INSTANCE_IDENTITY_PREIMAGE_FIELDS)[number];

export interface BucketInstanceIdentityPreimageInput {
  readonly identityContractVersion: unknown;
  readonly tenantId: unknown;
  readonly caseId: unknown;
  readonly sourceVersionSetHash: unknown;
  readonly historyBoundaryRef: unknown;
  readonly snapshotAsOfDate: unknown;
  readonly applicationEffectiveDate: unknown;
  readonly calculationRuleVersion: unknown;
  readonly bucketContextKey: unknown;
}

interface CanonicalBucketInstanceIdentityPreimage {
  readonly identityContractVersion: typeof BUCKET_INSTANCE_IDENTITY_CONTRACT_VERSION;
  readonly tenantId: TenantId;
  readonly caseId: CaseId;
  readonly sourceVersionSetHash: SourceVersionSetHash;
  readonly historyBoundaryRef: HistoryBoundaryRef;
  readonly snapshotAsOfDate: SnapshotDate;
  readonly applicationEffectiveDate: EffectiveDate;
  readonly calculationRuleVersion: RuleVersion;
  readonly bucketContextKey: BucketContextKey;
}

export type BucketInstanceIdentityErrorCode =
  | 'PREIMAGE_SHAPE_INVALID'
  | 'IDENTITY_CONTRACT_UNSUPPORTED'
  | 'PREIMAGE_FIELD_INVALID'
  | 'BUCKET_INSTANCE_ID_FORMAT_INVALID'
  | 'BUCKET_INSTANCE_ID_MISMATCH';

export interface BucketInstanceIdentityError {
  readonly code: BucketInstanceIdentityErrorCode;
  readonly field?: PreimageField | 'bucketInstanceId';
}

export type BucketInstanceIdentityProductionResult =
  | {
      readonly ok: true;
      readonly value: BucketInstanceId;
      readonly canonicalPreimage: string;
    }
  | { readonly ok: false; readonly error: BucketInstanceIdentityError };

export type BucketInstanceIdentityValidationResult =
  | {
      readonly ok: true;
      readonly value: BucketInstanceId;
      readonly canonicalPreimage: string;
    }
  | { readonly ok: false; readonly error: BucketInstanceIdentityError };

type UnknownRecord = Readonly<Record<string, unknown>>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactPreimageShape(value: UnknownRecord): boolean {
  const actualKeys = Object.keys(value).sort();
  const requiredKeys = [...BUCKET_INSTANCE_IDENTITY_PREIMAGE_FIELDS].sort();

  return (
    actualKeys.length === requiredKeys.length &&
    actualKeys.every((key, index) => key === requiredKeys[index])
  );
}

function parsedCanonicalValue<T extends string>(
  input: unknown,
  field: PreimageField,
  parser: (value: unknown) => ParseResult<T>,
): T | BucketInstanceIdentityError {
  const parsed = parser(input);
  if (!parsed.ok || typeof input !== 'string' || input.normalize('NFC') !== input) {
    return { code: 'PREIMAGE_FIELD_INVALID', field };
  }

  return parsed.value;
}

function isIdentityError(
  value: string | BucketInstanceIdentityError,
): value is BucketInstanceIdentityError {
  return typeof value !== 'string';
}

function parsePreimage(
  input: unknown,
): CanonicalBucketInstanceIdentityPreimage | BucketInstanceIdentityError {
  if (!isRecord(input) || !hasExactPreimageShape(input)) {
    return { code: 'PREIMAGE_SHAPE_INVALID' };
  }

  if (input.identityContractVersion !== BUCKET_INSTANCE_IDENTITY_CONTRACT_VERSION) {
    return { code: 'IDENTITY_CONTRACT_UNSUPPORTED', field: 'identityContractVersion' };
  }

  const tenantId = parsedCanonicalValue(input.tenantId, 'tenantId', parseTenantId);
  if (isIdentityError(tenantId)) return tenantId;
  const caseId = parsedCanonicalValue(input.caseId, 'caseId', parseCaseId);
  if (isIdentityError(caseId)) return caseId;
  const sourceVersionSetHash = parsedCanonicalValue(
    input.sourceVersionSetHash,
    'sourceVersionSetHash',
    parseSourceVersionSetHash,
  );
  if (isIdentityError(sourceVersionSetHash)) return sourceVersionSetHash;
  const historyBoundaryRef = parsedCanonicalValue(
    input.historyBoundaryRef,
    'historyBoundaryRef',
    parseHistoryBoundaryRef,
  );
  if (isIdentityError(historyBoundaryRef)) return historyBoundaryRef;
  const snapshotAsOfDate = parsedCanonicalValue(
    input.snapshotAsOfDate,
    'snapshotAsOfDate',
    parseSnapshotDate,
  );
  if (isIdentityError(snapshotAsOfDate)) return snapshotAsOfDate;
  const applicationEffectiveDate = parsedCanonicalValue(
    input.applicationEffectiveDate,
    'applicationEffectiveDate',
    parseEffectiveDate,
  );
  if (isIdentityError(applicationEffectiveDate)) return applicationEffectiveDate;
  const calculationRuleVersion = parsedCanonicalValue(
    input.calculationRuleVersion,
    'calculationRuleVersion',
    parseRuleVersion,
  );
  if (isIdentityError(calculationRuleVersion)) return calculationRuleVersion;
  const bucketContextKey = parsedCanonicalValue(
    input.bucketContextKey,
    'bucketContextKey',
    parseBucketContextKey,
  );
  if (isIdentityError(bucketContextKey)) return bucketContextKey;

  return {
    identityContractVersion: BUCKET_INSTANCE_IDENTITY_CONTRACT_VERSION,
    tenantId,
    caseId,
    sourceVersionSetHash,
    historyBoundaryRef,
    snapshotAsOfDate,
    applicationEffectiveDate,
    calculationRuleVersion,
    bucketContextKey,
  };
}

function serializePreimage(preimage: CanonicalBucketInstanceIdentityPreimage): string {
  const orderedValues: StrictJsonValue = [
    preimage.identityContractVersion,
    preimage.tenantId,
    preimage.caseId,
    preimage.sourceVersionSetHash,
    preimage.historyBoundaryRef,
    preimage.snapshotAsOfDate,
    preimage.applicationEffectiveDate,
    preimage.calculationRuleVersion,
    preimage.bucketContextKey,
  ];

  return serializeCanonicalJson(orderedValues);
}

export function produceBucketInstanceId(
  input: BucketInstanceIdentityPreimageInput,
): BucketInstanceIdentityProductionResult {
  const preimage = parsePreimage(input);
  if ('code' in preimage) {
    return { ok: false, error: preimage };
  }

  const canonicalPreimage = serializePreimage(preimage);
  const digest = createHash('sha256')
    .update(DOMAIN_SEPARATOR)
    .update(Buffer.from(canonicalPreimage, 'utf8'))
    .digest('hex');
  const bucketInstanceId = parseBucketInstanceId(`binst:v1:sha256:${digest}`);

  if (!bucketInstanceId.ok) {
    return {
      ok: false,
      error: { code: 'BUCKET_INSTANCE_ID_FORMAT_INVALID', field: 'bucketInstanceId' },
    };
  }

  return { ok: true, value: bucketInstanceId.value, canonicalPreimage };
}

export function validateBucketInstanceId(
  input: BucketInstanceIdentityPreimageInput,
  observedBucketInstanceId: unknown,
): BucketInstanceIdentityValidationResult {
  const produced = produceBucketInstanceId(input);
  if (!produced.ok) {
    return produced;
  }

  const observed = parseBucketInstanceId(observedBucketInstanceId);
  if (!observed.ok) {
    return {
      ok: false,
      error: { code: 'BUCKET_INSTANCE_ID_FORMAT_INVALID', field: 'bucketInstanceId' },
    };
  }

  if (observed.value !== produced.value) {
    return {
      ok: false,
      error: { code: 'BUCKET_INSTANCE_ID_MISMATCH', field: 'bucketInstanceId' },
    };
  }

  return produced;
}
