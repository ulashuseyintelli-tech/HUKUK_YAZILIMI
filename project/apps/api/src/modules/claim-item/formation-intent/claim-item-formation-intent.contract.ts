import { HttpException, HttpStatus } from '@nestjs/common';

export const CLAIM_ITEM_FORMATION_INTENT_CONTRACT_VERSION = 'ClaimItemFormationIntentV1' as const;
export const CLAIM_ITEM_FORMATION_NORMALIZED_INPUT_VERSION =
  'ClaimItemFormationNormalizedInputV1' as const;
export const CLAIM_ITEM_FORMATION_CANONICAL_SERIALIZATION_VERSION =
  'RCV-CLAIM-FORMATION/v1' as const;
export const CLAIM_ITEM_FORMATION_APPROVAL_REF_VERSION =
  'CLAIM_ITEM_FORMATION_APPROVAL_REF_V1' as const;
export const CLAIM_ITEM_FORMATION_APPROVAL_TARGET_TYPE =
  'CLAIM_ITEM_FORMATION_INTENT' as const;
export const CLAIM_ITEM_FORMATION_SOURCE_IDENTITY_VERSION =
  'ClaimItemSourceIdentityV1' as const;
export const CLAIM_ITEM_FORMATION_SOURCE_SLOT = 'PRIMARY_EVIDENCE' as const;
export const CLAIM_ITEM_FORMATION_EXPIRY_MS = 24 * 60 * 60 * 1000;

export const CLAIM_ITEM_FORMATION_COMPONENT_CATEGORIES = [
  'PRINCIPAL',
  'COST',
  'ANCILLARY',
  'ACCRUED_INTEREST',
] as const;
export type ClaimItemFormationComponentCategory =
  (typeof CLAIM_ITEM_FORMATION_COMPONENT_CATEGORIES)[number];

export const CLAIM_ITEM_FORMATION_ADMISSION_ERROR_CODES = [
  'FORMATION_CONTEXT_REQUIRED',
  'INVALID_FORMATION_CONTEXT',
  'UNSUPPORTED_COMPONENT',
  'FORMATION_SOURCE_UNAVAILABLE',
  'SOURCE_FINGERPRINT_MISMATCH',
  'LEGAL_BASIS_REQUIRED',
  'LEGAL_BASIS_VERSION_NOT_FOUND',
  'LEGAL_BASIS_NOT_EFFECTIVE',
  'LEGAL_BASIS_COMPONENT_MISMATCH',
  'LEGAL_BASIS_EVIDENCE_MISMATCH',
  'LEGAL_REVIEW_REQUIRED',
  'DUPLICATE_FORMATION_CONFLICT',
] as const;
export type ClaimItemFormationAdmissionErrorCode =
  (typeof CLAIM_ITEM_FORMATION_ADMISSION_ERROR_CODES)[number];

const ERROR_MESSAGES: Record<ClaimItemFormationAdmissionErrorCode, string> = {
  FORMATION_CONTEXT_REQUIRED: 'Complete claim formation context is required.',
  INVALID_FORMATION_CONTEXT: 'Claim formation context is invalid.',
  UNSUPPORTED_COMPONENT: 'Claim component is not supported for canonical formation.',
  FORMATION_SOURCE_UNAVAILABLE: 'Exact claim formation source is unavailable.',
  SOURCE_FINGERPRINT_MISMATCH: 'Claim formation source fingerprint does not match.',
  LEGAL_BASIS_REQUIRED: 'An exact legal basis is required.',
  LEGAL_BASIS_VERSION_NOT_FOUND: 'Exact legal basis version was not found.',
  LEGAL_BASIS_NOT_EFFECTIVE: 'Legal basis is not effective for the requested formation date.',
  LEGAL_BASIS_COMPONENT_MISMATCH: 'Legal basis is incompatible with the requested component.',
  LEGAL_BASIS_EVIDENCE_MISMATCH: 'Legal basis evidence requirements are not satisfied.',
  LEGAL_REVIEW_REQUIRED: 'Claim formation requires final legal review.',
  DUPLICATE_FORMATION_CONFLICT: 'Idempotency key is already bound to a different formation intent.',
};

export class ClaimItemFormationAdmissionError extends HttpException {
  constructor(readonly code: ClaimItemFormationAdmissionErrorCode) {
    super(
      { code, message: ERROR_MESSAGES[code] },
      code === 'DUPLICATE_FORMATION_CONFLICT' ? HttpStatus.CONFLICT : HttpStatus.BAD_REQUEST,
    );
    this.name = 'ClaimItemFormationAdmissionError';
  }
}

export type ClaimFormationJsonValue =
  | null
  | boolean
  | string
  | number
  | readonly ClaimFormationJsonValue[]
  | { readonly [key: string]: ClaimFormationJsonValue };

export interface HumanClaimItemFormationCommandV1 {
  readonly caseId: string;
  readonly idempotencyKey: string;
  readonly source: Readonly<{
    documentId: string;
    requestedVersionId: string;
  }>;
  readonly component: Readonly<{
    category: ClaimItemFormationComponentCategory;
    subtypeCode: string;
  }>;
  readonly legalBasis: Readonly<{
    code: string;
    requestedVersion: string;
  }>;
  readonly money: Readonly<{
    originalAmountMinor: bigint;
    demandedAmountMinor: bigint;
    currency: string;
    minorUnit: number;
  }>;
  readonly effectiveAt: string;
  readonly liabilityContext: Readonly<{
    payload: ClaimFormationJsonValue;
  }>;
}

export interface HumanClaimItemFormationAdmissionContext {
  readonly tenantId: string;
  readonly actorUserId: string;
  readonly correlationId: string;
  readonly causationId?: string;
}

export interface ClaimItemFormationApprovalRefV1 {
  readonly version: typeof CLAIM_ITEM_FORMATION_APPROVAL_REF_VERSION;
  readonly tenantId: string;
  readonly caseId: string;
  readonly formationIntentId: string;
  readonly intentChecksum: string;
  readonly sourceIdentityHash: string;
}

const OPAQUE_REFERENCE = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/;
const POSITIVE_MINOR_AMOUNT = /^[1-9][0-9]*$/;
const ISO_CURRENCY = /^[A-Z]{3}$/;
const TOP_LEVEL_KEYS = new Set([
  'caseId',
  'idempotencyKey',
  'source',
  'component',
  'legalBasis',
  'money',
  'effectiveAt',
  'liabilityContext',
]);
const SOURCE_KEYS = new Set(['documentId', 'requestedVersionId']);
const COMPONENT_KEYS = new Set(['category', 'subtypeCode']);
const LEGAL_BASIS_KEYS = new Set(['code', 'requestedVersion']);
const MONEY_KEYS = new Set([
  'originalAmountMinor',
  'demandedAmountMinor',
  'currency',
  'minorUnit',
]);
const LIABILITY_KEYS = new Set(['payload']);

export function readFormationCaseId(input: unknown): string {
  const record = requireRecord(input, 'FORMATION_CONTEXT_REQUIRED');
  return requireOpaqueReference(record.caseId, 'FORMATION_CONTEXT_REQUIRED');
}

export function parseHumanClaimItemFormationCommand(
  input: unknown,
): HumanClaimItemFormationCommandV1 {
  const record = requireRecord(input, 'FORMATION_CONTEXT_REQUIRED');
  assertExactKeys(record, TOP_LEVEL_KEYS);

  const source = requireRecord(record.source, 'FORMATION_CONTEXT_REQUIRED');
  const component = requireRecord(record.component, 'FORMATION_CONTEXT_REQUIRED');
  const legalBasis = requireRecord(record.legalBasis, 'LEGAL_BASIS_REQUIRED');
  const money = requireRecord(record.money, 'FORMATION_CONTEXT_REQUIRED');
  const liabilityContext = requireRecord(record.liabilityContext, 'FORMATION_CONTEXT_REQUIRED');
  assertExactKeys(source, SOURCE_KEYS);
  assertExactKeys(component, COMPONENT_KEYS);
  assertExactKeys(legalBasis, LEGAL_BASIS_KEYS);
  assertExactKeys(money, MONEY_KEYS);
  assertExactKeys(liabilityContext, LIABILITY_KEYS);

  const category = component.category;
  if (
    typeof category !== 'string' ||
    category === 'OTHER' ||
    !CLAIM_ITEM_FORMATION_COMPONENT_CATEGORIES.includes(
      category as ClaimItemFormationComponentCategory,
    )
  ) {
    fail('UNSUPPORTED_COMPONENT');
  }

  const subtypeCode = requireOpaqueReference(component.subtypeCode, 'UNSUPPORTED_COMPONENT');
  const effectiveAt = requireIsoTimestamp(record.effectiveAt);
  const currency = requireString(money.currency, 'INVALID_FORMATION_CONTEXT');
  if (!ISO_CURRENCY.test(currency)) fail('INVALID_FORMATION_CONTEXT');
  if (!Number.isSafeInteger(money.minorUnit) || (money.minorUnit as number) < 0 || (money.minorUnit as number) > 6) {
    fail('INVALID_FORMATION_CONTEXT');
  }

  const payload = copyJsonValue(liabilityContext.payload);

  return Object.freeze({
    caseId: requireOpaqueReference(record.caseId, 'FORMATION_CONTEXT_REQUIRED'),
    idempotencyKey: requireOpaqueReference(record.idempotencyKey, 'FORMATION_CONTEXT_REQUIRED'),
    source: Object.freeze({
      documentId: requireOpaqueReference(source.documentId, 'FORMATION_CONTEXT_REQUIRED'),
      requestedVersionId: requireOpaqueReference(
        source.requestedVersionId,
        'FORMATION_CONTEXT_REQUIRED',
      ),
    }),
    component: Object.freeze({
      category: category as ClaimItemFormationComponentCategory,
      subtypeCode,
    }),
    legalBasis: Object.freeze({
      code: requireOpaqueReference(legalBasis.code, 'LEGAL_BASIS_REQUIRED'),
      requestedVersion: requireOpaqueReference(
        legalBasis.requestedVersion,
        'LEGAL_BASIS_REQUIRED',
      ),
    }),
    money: Object.freeze({
      originalAmountMinor: requirePositiveMinorAmount(money.originalAmountMinor),
      demandedAmountMinor: requirePositiveMinorAmount(money.demandedAmountMinor),
      currency,
      minorUnit: money.minorUnit as number,
    }),
    effectiveAt,
    liabilityContext: Object.freeze({ payload }),
  });
}

export function validateHumanClaimItemFormationContext(
  context: HumanClaimItemFormationAdmissionContext,
): void {
  requireOpaqueReference(context.tenantId, 'INVALID_FORMATION_CONTEXT');
  requireOpaqueReference(context.actorUserId, 'INVALID_FORMATION_CONTEXT');
  requireOpaqueReference(context.correlationId, 'INVALID_FORMATION_CONTEXT');
  if (context.causationId !== undefined) {
    requireOpaqueReference(context.causationId, 'INVALID_FORMATION_CONTEXT');
  }
}

function requirePositiveMinorAmount(value: unknown): bigint {
  if (typeof value !== 'string' || !POSITIVE_MINOR_AMOUNT.test(value)) {
    fail('INVALID_FORMATION_CONTEXT');
  }
  return BigInt(value);
}

function requireIsoTimestamp(value: unknown): string {
  if (typeof value !== 'string') fail('INVALID_FORMATION_CONTEXT');
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) {
    fail('INVALID_FORMATION_CONTEXT');
  }
  return parsed.toISOString();
}

function requireString(
  value: unknown,
  code: ClaimItemFormationAdmissionErrorCode,
): string {
  if (typeof value !== 'string') fail(code);
  return value;
}

function requireOpaqueReference(
  value: unknown,
  code: ClaimItemFormationAdmissionErrorCode,
): string {
  if (typeof value !== 'string' || !OPAQUE_REFERENCE.test(value)) fail(code);
  return value;
}

function requireRecord(
  value: unknown,
  code: ClaimItemFormationAdmissionErrorCode,
): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(code);
  return value as Record<string, unknown>;
}

function assertExactKeys(value: Record<string, unknown>, allowed: ReadonlySet<string>): void {
  if (Object.keys(value).some((key) => !allowed.has(key))) {
    fail('INVALID_FORMATION_CONTEXT');
  }
}

function copyJsonValue(value: unknown, depth = 0): ClaimFormationJsonValue {
  if (depth > 24) fail('INVALID_FORMATION_CONTEXT');
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return value;
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) fail('INVALID_FORMATION_CONTEXT');
    return value;
  }
  if (Array.isArray(value)) {
    return Object.freeze(value.map((entry) => copyJsonValue(entry, depth + 1)));
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const result: Record<string, ClaimFormationJsonValue> = {};
    for (const key of Object.keys(record).sort()) {
      if (!OPAQUE_REFERENCE.test(key)) fail('INVALID_FORMATION_CONTEXT');
      if (record[key] === undefined) fail('INVALID_FORMATION_CONTEXT');
      result[key] = copyJsonValue(record[key], depth + 1);
    }
    return Object.freeze(result);
  }
  fail('INVALID_FORMATION_CONTEXT');
}

function fail(code: ClaimItemFormationAdmissionErrorCode): never {
  throw new ClaimItemFormationAdmissionError(code);
}
