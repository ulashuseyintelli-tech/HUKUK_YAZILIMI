import {
  ClaimItemType,
  InterestAccrualStatus,
  InterestStartDateProvenance,
  InterestType,
} from '@prisma/client';
import {
  buildLegalBasisProjectionBindingPersistenceEnvelope,
  validateLegalBasisProjectionBindingPersistenceEnvelope,
  type LegalBasisProjectionBindingPersistenceEnvelopeV1,
} from './legal-basis-projection-binding-persistence';
import type {
  ExactLegalBasisBindingV1,
  LegalBasisDecisionProjectionSourceV1,
} from './claim-item-formation-resolver.ports';
import type { ClaimItemFormationComponentCategory } from './claim-item-formation-intent.contract';

export const LEGAL_BASIS_PROJECTION_BINDING_CONTRACT_ID =
  'RCV-CLAIM-LEGAL-BASIS-PROJECTION-BINDING' as const;
export const LEGAL_BASIS_PROJECTION_BINDING_CONTRACT_VERSION = '1' as const;
export const LEGAL_BASIS_PROJECTION_SCHEMA_VERSION = 1 as const;
export const LEGAL_BASIS_PROJECTION_SERIALIZATION_ALGORITHM =
  'CANONICAL_JSON_UTF8_V1' as const;
export const LEGAL_BASIS_PROJECTION_CHECKSUM_ALGORITHM = 'SHA-256' as const;
export const LEGAL_SUBTYPE_REGISTRY_ID = 'RCV-CLAIM-LEGAL-SUBTYPE-REGISTRY' as const;

export const LEGAL_SUBTYPE_CODES_V1 = [
  'ADULT_CHILD_EDUCATION_MAINTENANCE',
  'COMMERCIAL_COLLECTION_COST',
  'COMMERCIAL_DEFAULT_INTEREST',
  'CONTRACTUAL_DEFAULT_INTEREST',
  'DEFAULT_INTEREST',
  'DELAY_DAMAGE',
  'FAMILY_SUPPORT_MAINTENANCE',
  'INTERIM_MAINTENANCE',
  'MINOR_CHILD_MAINTENANCE',
  'POVERTY_MAINTENANCE',
  'SEPARATE_LIVING_SPOUSAL_MAINTENANCE',
  'STATUTORY_DEFAULT_INTEREST',
  'STATUTORY_INTEREST',
] as const;
export type LegalSubtypeCodeV1 = (typeof LEGAL_SUBTYPE_CODES_V1)[number];

export interface LegalBasisProjectionAuthorityIdentityV1 {
  readonly releaseId: string;
  readonly releaseVersion: number;
  readonly releaseChecksum: string;
  readonly legalBasisCode: string;
  readonly legalBasisVersion: number;
  readonly legalBasisChecksum: string;
  readonly registryId: typeof LEGAL_SUBTYPE_REGISTRY_ID;
  readonly registryVersion: number;
  readonly registryChecksum: string;
  readonly subtypeCode: LegalSubtypeCodeV1;
  readonly subtypeVersion: number;
  readonly subtypeChecksum: string;
}

export interface LegalBasisClaimItemProjectionV1 {
  readonly itemType: ClaimItemType;
  readonly interestAccrualStatus: InterestAccrualStatus;
  readonly interestType: InterestType | null;
  readonly interestRate: string | null;
  readonly interestStartDate: string | null;
  readonly interestStartDateProvenance: InterestStartDateProvenance | null;
  readonly isAllDebtorsLiable: boolean;
  readonly liableDebtorIds: readonly string[];
}

export interface LegalBasisDecisionProjectionV1
  extends LegalBasisDecisionProjectionSourceV1 {
  readonly canonicalComponentCategory: ClaimItemFormationComponentCategory;
  readonly claimItemProjection: LegalBasisClaimItemProjectionV1;
}

export interface LegalBasisProjectionTemporalContextV1 {
  readonly authorityEffectiveAt: string;
  readonly authorityEffectiveUntil: string | null;
}

export interface LegalBasisProjectionBindingPayloadV1 {
  readonly authorityIdentity: LegalBasisProjectionAuthorityIdentityV1;
  readonly decisionProjection: LegalBasisDecisionProjectionV1;
  readonly temporalContext: LegalBasisProjectionTemporalContextV1;
  readonly integrityMetadata: Readonly<{
    contractId: typeof LEGAL_BASIS_PROJECTION_BINDING_CONTRACT_ID;
    projectionSchemaVersion: typeof LEGAL_BASIS_PROJECTION_SCHEMA_VERSION;
    serializationAlgorithm: typeof LEGAL_BASIS_PROJECTION_SERIALIZATION_ALGORITHM;
    checksumAlgorithm: typeof LEGAL_BASIS_PROJECTION_CHECKSUM_ALGORITHM;
  }>;
}

export interface CreateLegalBasisProjectionBindingInputV1 {
  readonly legalBasis: ExactLegalBasisBindingV1;
  /**
   * Explicitly supplied and validated admission metadata. It is intentionally
   * excluded from the projection checksum so an idempotent retry of the same
   * semantic request does not create a new authority binding.
   */
  readonly admittedAt: string;
}

export type LegalBasisProjectionBindingContractErrorCode =
  | 'PROJECTION_BINDING_INPUT_INVALID'
  | 'PROJECTION_BINDING_AUTHORITY_INVALID'
  | 'PROJECTION_BINDING_DECISION_INVALID'
  | 'PROJECTION_BINDING_TEMPORAL_INVALID'
  | 'PROJECTION_BINDING_IDENTITY_MISMATCH'
  | 'PROJECTION_BINDING_PROJECTION_MISMATCH';

export class LegalBasisProjectionBindingContractError extends Error {
  constructor(readonly code: LegalBasisProjectionBindingContractErrorCode) {
    super(code);
    this.name = 'LegalBasisProjectionBindingContractError';
  }
}

export interface ParsedLegalBasisProjectionBindingV1 {
  readonly envelope: LegalBasisProjectionBindingPersistenceEnvelopeV1;
  readonly payload: LegalBasisProjectionBindingPayloadV1;
}

export function createLegalBasisProjectionBindingV1(
  input: CreateLegalBasisProjectionBindingInputV1,
): ParsedLegalBasisProjectionBindingV1 {
  requireUtcTimestamp(input.admittedAt, 'PROJECTION_BINDING_INPUT_INVALID');
  const payload = buildPayload(input.legalBasis);
  const envelope = buildLegalBasisProjectionBindingPersistenceEnvelope(
    payload as unknown as Readonly<Record<string, unknown>>,
  );
  return Object.freeze({ envelope, payload });
}

export function parseLegalBasisProjectionBindingV1(
  envelope: LegalBasisProjectionBindingPersistenceEnvelopeV1,
): ParsedLegalBasisProjectionBindingV1 {
  const validated = validateLegalBasisProjectionBindingPersistenceEnvelope(envelope);
  if (!validated) fail('PROJECTION_BINDING_INPUT_INVALID');
  const parsed = JSON.parse(validated.canonicalPayload) as unknown;
  const payload = validatePayload(parsed);
  return Object.freeze({ envelope: validated, payload });
}

export function assertLegalBasisProjectionBindingMatches(
  stored: LegalBasisProjectionBindingPersistenceEnvelopeV1,
  resolved: ExactLegalBasisBindingV1,
  admittedAt: string,
): ParsedLegalBasisProjectionBindingV1 {
  const parsedStored = parseLegalBasisProjectionBindingV1(stored);
  const current = createLegalBasisProjectionBindingV1({ legalBasis: resolved, admittedAt });
  if (
    parsedStored.envelope.contractVersion !== current.envelope.contractVersion ||
    parsedStored.envelope.canonicalPayload !== current.envelope.canonicalPayload ||
    parsedStored.envelope.checksum !== current.envelope.checksum
  ) {
    const storedIdentity = JSON.stringify(parsedStored.payload.authorityIdentity);
    const currentIdentity = JSON.stringify(current.payload.authorityIdentity);
    fail(
      storedIdentity === currentIdentity
        ? 'PROJECTION_BINDING_PROJECTION_MISMATCH'
        : 'PROJECTION_BINDING_IDENTITY_MISMATCH',
    );
  }
  return parsedStored;
}

function buildPayload(legalBasis: ExactLegalBasisBindingV1): LegalBasisProjectionBindingPayloadV1 {
  const releaseVersion = positiveVersion(
    legalBasis.projectionAuthority.releaseVersion,
    'PROJECTION_BINDING_AUTHORITY_INVALID',
  );
  const legalBasisVersion = positiveVersion(
    legalBasis.legalBasisVersion,
    'PROJECTION_BINDING_AUTHORITY_INVALID',
  );
  const registryVersion = positiveVersion(
    legalBasis.projectionAuthority.registryVersion,
    'PROJECTION_BINDING_AUTHORITY_INVALID',
  );
  const subtypeVersion = positiveVersion(
    legalBasis.componentSubtypeVersion,
    'PROJECTION_BINDING_AUTHORITY_INVALID',
  );
  const subtypeCode = legalBasis.componentSubtypeCode as LegalSubtypeCodeV1;

  if (
    !opaque(legalBasis.registryReleaseId) ||
    !sha256(legalBasis.registryReleaseChecksum) ||
    !domainCode(legalBasis.legalBasisCode) ||
    !sha256(legalBasis.legalBasisChecksum) ||
    legalBasis.projectionAuthority.registryId !== LEGAL_SUBTYPE_REGISTRY_ID ||
    !sha256(legalBasis.projectionAuthority.registryChecksum) ||
    !LEGAL_SUBTYPE_CODES_V1.includes(subtypeCode) ||
    !sha256(legalBasis.componentSubtypeChecksum)
  ) {
    fail('PROJECTION_BINDING_AUTHORITY_INVALID');
  }

  const decisionProjection = validateDecisionProjection({
    ...legalBasis.decisionProjection,
    canonicalComponentCategory: legalBasis.componentCategory,
    claimItemProjection: legalBasis.claimItemProjection,
  });
  if (
    !decisionProjection.legalBasisBinding.allowedLegalBasisCodes.includes(
      legalBasis.legalBasisCode,
    ) ||
    decisionProjection.canonicalComponentCategory !== legalBasis.componentCategory ||
    decisionProjection.claimItemProjection.itemType !== legalBasis.claimItemProjection.itemType
  ) {
    fail('PROJECTION_BINDING_DECISION_INVALID');
  }

  const authorityEffectiveAt = requireUtcTimestamp(
    legalBasis.effectiveFrom,
    'PROJECTION_BINDING_TEMPORAL_INVALID',
  );
  const authorityEffectiveUntil =
    legalBasis.effectiveTo === null
      ? null
      : requireUtcTimestamp(
          legalBasis.effectiveTo,
          'PROJECTION_BINDING_TEMPORAL_INVALID',
        );
  if (
    authorityEffectiveUntil !== null &&
    new Date(authorityEffectiveUntil).getTime() <= new Date(authorityEffectiveAt).getTime()
  ) {
    fail('PROJECTION_BINDING_TEMPORAL_INVALID');
  }

  return deepFreeze({
    authorityIdentity: {
      releaseId: legalBasis.registryReleaseId,
      releaseVersion,
      releaseChecksum: legalBasis.registryReleaseChecksum,
      legalBasisCode: legalBasis.legalBasisCode,
      legalBasisVersion,
      legalBasisChecksum: legalBasis.legalBasisChecksum,
      registryId: LEGAL_SUBTYPE_REGISTRY_ID,
      registryVersion,
      registryChecksum: legalBasis.projectionAuthority.registryChecksum,
      subtypeCode,
      subtypeVersion,
      subtypeChecksum: legalBasis.componentSubtypeChecksum,
    },
    decisionProjection,
    temporalContext: {
      authorityEffectiveAt,
      authorityEffectiveUntil,
    },
    integrityMetadata: {
      contractId: LEGAL_BASIS_PROJECTION_BINDING_CONTRACT_ID,
      projectionSchemaVersion: LEGAL_BASIS_PROJECTION_SCHEMA_VERSION,
      serializationAlgorithm: LEGAL_BASIS_PROJECTION_SERIALIZATION_ALGORITHM,
      checksumAlgorithm: LEGAL_BASIS_PROJECTION_CHECKSUM_ALGORITHM,
    },
  });
}

function validatePayload(value: unknown): LegalBasisProjectionBindingPayloadV1 {
  const record = exactRecord(value, [
    'authorityIdentity',
    'decisionProjection',
    'integrityMetadata',
    'temporalContext',
  ]);
  const authority = exactRecord(record.authorityIdentity, [
    'legalBasisChecksum',
    'legalBasisCode',
    'legalBasisVersion',
    'registryChecksum',
    'registryId',
    'registryVersion',
    'releaseChecksum',
    'releaseId',
    'releaseVersion',
    'subtypeChecksum',
    'subtypeCode',
    'subtypeVersion',
  ]);
  const temporal = exactRecord(record.temporalContext, [
    'authorityEffectiveAt',
    'authorityEffectiveUntil',
  ]);
  const integrity = exactRecord(record.integrityMetadata, [
    'checksumAlgorithm',
    'contractId',
    'projectionSchemaVersion',
    'serializationAlgorithm',
  ]);

  const legalBasisVersion = positiveVersion(
    authority.legalBasisVersion,
    'PROJECTION_BINDING_AUTHORITY_INVALID',
  );
  const registryVersion = positiveVersion(
    authority.registryVersion,
    'PROJECTION_BINDING_AUTHORITY_INVALID',
  );
  const releaseVersion = positiveVersion(
    authority.releaseVersion,
    'PROJECTION_BINDING_AUTHORITY_INVALID',
  );
  const subtypeVersion = positiveVersion(
    authority.subtypeVersion,
    'PROJECTION_BINDING_AUTHORITY_INVALID',
  );
  if (
    !opaque(authority.releaseId) ||
    !sha256(authority.releaseChecksum) ||
    !domainCode(authority.legalBasisCode) ||
    !sha256(authority.legalBasisChecksum) ||
    authority.registryId !== LEGAL_SUBTYPE_REGISTRY_ID ||
    !sha256(authority.registryChecksum) ||
    !LEGAL_SUBTYPE_CODES_V1.includes(authority.subtypeCode as LegalSubtypeCodeV1) ||
    !sha256(authority.subtypeChecksum) ||
    integrity.contractId !== LEGAL_BASIS_PROJECTION_BINDING_CONTRACT_ID ||
    integrity.projectionSchemaVersion !== LEGAL_BASIS_PROJECTION_SCHEMA_VERSION ||
    integrity.serializationAlgorithm !== LEGAL_BASIS_PROJECTION_SERIALIZATION_ALGORITHM ||
    integrity.checksumAlgorithm !== LEGAL_BASIS_PROJECTION_CHECKSUM_ALGORITHM
  ) {
    fail('PROJECTION_BINDING_AUTHORITY_INVALID');
  }

  const authorityEffectiveAt = requireUtcTimestamp(
    temporal.authorityEffectiveAt,
    'PROJECTION_BINDING_TEMPORAL_INVALID',
  );
  const authorityEffectiveUntil =
    temporal.authorityEffectiveUntil === null
      ? null
      : requireUtcTimestamp(
          temporal.authorityEffectiveUntil,
          'PROJECTION_BINDING_TEMPORAL_INVALID',
        );
  if (
    authorityEffectiveUntil !== null &&
    new Date(authorityEffectiveUntil).getTime() <= new Date(authorityEffectiveAt).getTime()
  ) {
    fail('PROJECTION_BINDING_TEMPORAL_INVALID');
  }

  return deepFreeze({
    authorityIdentity: {
      releaseId: authority.releaseId as string,
      releaseVersion,
      releaseChecksum: authority.releaseChecksum as string,
      legalBasisCode: authority.legalBasisCode as string,
      legalBasisVersion,
      legalBasisChecksum: authority.legalBasisChecksum as string,
      registryId: LEGAL_SUBTYPE_REGISTRY_ID,
      registryVersion,
      registryChecksum: authority.registryChecksum as string,
      subtypeCode: authority.subtypeCode as LegalSubtypeCodeV1,
      subtypeVersion,
      subtypeChecksum: authority.subtypeChecksum as string,
    },
    decisionProjection: validateDecisionProjection(record.decisionProjection),
    temporalContext: { authorityEffectiveAt, authorityEffectiveUntil },
    integrityMetadata: {
      contractId: LEGAL_BASIS_PROJECTION_BINDING_CONTRACT_ID,
      projectionSchemaVersion: LEGAL_BASIS_PROJECTION_SCHEMA_VERSION,
      serializationAlgorithm: LEGAL_BASIS_PROJECTION_SERIALIZATION_ALGORITHM,
      checksumAlgorithm: LEGAL_BASIS_PROJECTION_CHECKSUM_ALGORITHM,
    },
  });
}

function validateDecisionProjection(value: unknown): LegalBasisDecisionProjectionV1 {
  const record = exactRecord(value, [
    'admissionRequirements',
    'allowedFormationPaths',
    'amountSemantics',
    'calculationSemantics',
    'canonicalComponentCategory',
    'claimItemProjection',
    'currencySemantics',
    'finalizationRequirements',
    'forbiddenFormationPaths',
    'interestEligibility',
    'legalBasisBinding',
    'legalCharacter',
    'liabilityCompatibility',
    'requiredEvidenceTypes',
    'requiredSourceTypes',
    'snapshotRequirements',
  ]);
  const category = record.canonicalComponentCategory as ClaimItemFormationComponentCategory;
  if (!['PRINCIPAL', 'COST', 'ANCILLARY', 'ACCRUED_INTEREST'].includes(category)) {
    fail('PROJECTION_BINDING_DECISION_INVALID');
  }
  const binding = exactRecord(record.legalBasisBinding, [
    'allowedLegalBasisCodes',
    'bindingMode',
    'requiredLegalBasisCodes',
  ]);
  const liability = exactRecord(record.liabilityCompatibility, [
    'allowedLiabilityTypes',
    'crossLiabilityUse',
    'scope',
  ]);
  const interest = exactRecord(record.interestEligibility, [
    'componentAccruesFurtherInterest',
    'eligibilityRule',
    'requiresExactInterestPolicy',
    'requiresExactRateAuthority',
  ]);
  const amount = exactRecord(record.amountSemantics, [
    'fixedAtFormation',
    'minorUnitRepresentation',
    'roundingFallback',
    'semanticAuthority',
  ]);
  const currency = exactRecord(record.currencySemantics, [
    'conversion',
    'currencyAuthority',
    'minorUnitAuthority',
  ]);
  const calculation = exactRecord(record.calculationSemantics, [
    'futureAccrual',
    'rule',
    'sourceAmountDerivation',
  ]);
  const claimItem = exactRecord(record.claimItemProjection, [
    'interestAccrualStatus',
    'interestRate',
    'interestStartDate',
    'interestStartDateProvenance',
    'interestType',
    'isAllDebtorsLiable',
    'itemType',
    'liableDebtorIds',
  ]);

  const itemType = claimItem.itemType as ClaimItemType;
  const accrualStatus = claimItem.interestAccrualStatus as InterestAccrualStatus;
  const interestType = claimItem.interestType as InterestType | null;
  const provenance = claimItem.interestStartDateProvenance as InterestStartDateProvenance | null;
  if (
    !Object.values(ClaimItemType).includes(itemType) ||
    itemType === ClaimItemType.OTHER ||
    !Object.values(InterestAccrualStatus).includes(accrualStatus) ||
    (interestType !== null && !Object.values(InterestType).includes(interestType)) ||
    (provenance !== null && !Object.values(InterestStartDateProvenance).includes(provenance)) ||
    (claimItem.interestRate !== null && !decimal(claimItem.interestRate)) ||
    (claimItem.interestStartDate !== null &&
      !utcTimestamp(claimItem.interestStartDate)) ||
    typeof claimItem.isAllDebtorsLiable !== 'boolean'
  ) {
    fail('PROJECTION_BINDING_DECISION_INVALID');
  }

  const allowedLegalBasisCodes = stringList(binding.allowedLegalBasisCodes, false);
  const requiredLegalBasisCodes = stringList(binding.requiredLegalBasisCodes, true);
  if (!['EXACTLY_ONE', 'EXACTLY_ONE_OF'].includes(binding.bindingMode as string)) {
    fail('PROJECTION_BINDING_DECISION_INVALID');
  }
  const allowedLiabilityTypes = stringList(liability.allowedLiabilityTypes, false);
  if (
    liability.crossLiabilityUse !== 'PROHIBITED' ||
    liability.scope !== 'EXACT_SAME_DEBTOR_AND_LIABILITY_RELATIONSHIP' ||
    interest.componentAccruesFurtherInterest !== false ||
    typeof interest.requiresExactInterestPolicy !== 'boolean' ||
    typeof interest.requiresExactRateAuthority !== 'boolean' ||
    amount.minorUnitRepresentation !== 'POSITIVE_INTEGER_STRING' ||
    amount.roundingFallback !== 'PROHIBITED' ||
    typeof amount.fixedAtFormation !== 'boolean' ||
    currency.conversion !== 'PROHIBITED' ||
    currency.minorUnitAuthority !== 'ISO_CURRENCY_MINOR_UNIT' ||
    !['INTEREST_POLICY_ONLY', 'PROHIBITED'].includes(calculation.futureAccrual as string)
  ) {
    fail('PROJECTION_BINDING_DECISION_INVALID');
  }

  return deepFreeze({
    canonicalComponentCategory: category,
    legalCharacter: nonBlank(record.legalCharacter),
    legalBasisBinding: {
      allowedLegalBasisCodes,
      bindingMode: binding.bindingMode as 'EXACTLY_ONE' | 'EXACTLY_ONE_OF',
      requiredLegalBasisCodes,
    },
    requiredSourceTypes: stringList(record.requiredSourceTypes, false),
    requiredEvidenceTypes: stringList(record.requiredEvidenceTypes, false),
    liabilityCompatibility: {
      allowedLiabilityTypes,
      crossLiabilityUse: 'PROHIBITED',
      scope: 'EXACT_SAME_DEBTOR_AND_LIABILITY_RELATIONSHIP',
    },
    interestEligibility: {
      componentAccruesFurtherInterest: false,
      eligibilityRule: nonBlank(interest.eligibilityRule),
      requiresExactInterestPolicy: interest.requiresExactInterestPolicy as boolean,
      requiresExactRateAuthority: interest.requiresExactRateAuthority as boolean,
    },
    amountSemantics: {
      fixedAtFormation: amount.fixedAtFormation as boolean,
      minorUnitRepresentation: 'POSITIVE_INTEGER_STRING',
      roundingFallback: 'PROHIBITED',
      semanticAuthority: nonBlank(amount.semanticAuthority),
    },
    currencySemantics: {
      conversion: 'PROHIBITED',
      currencyAuthority: nonBlank(currency.currencyAuthority),
      minorUnitAuthority: 'ISO_CURRENCY_MINOR_UNIT',
    },
    calculationSemantics: {
      futureAccrual: calculation.futureAccrual as 'INTEREST_POLICY_ONLY' | 'PROHIBITED',
      rule: nonBlank(calculation.rule),
      sourceAmountDerivation: nonBlank(calculation.sourceAmountDerivation),
    },
    allowedFormationPaths: stringList(record.allowedFormationPaths, false),
    forbiddenFormationPaths: stringList(record.forbiddenFormationPaths, false),
    admissionRequirements: stringList(record.admissionRequirements, false),
    finalizationRequirements: stringList(record.finalizationRequirements, false),
    snapshotRequirements: stringList(record.snapshotRequirements, false),
    claimItemProjection: {
      itemType,
      interestAccrualStatus: accrualStatus,
      interestType,
      interestRate: claimItem.interestRate as string | null,
      interestStartDate: claimItem.interestStartDate as string | null,
      interestStartDateProvenance: provenance,
      isAllDebtorsLiable: claimItem.isAllDebtorsLiable as boolean,
      liableDebtorIds: stringList(claimItem.liableDebtorIds, true),
    },
  });
}

function exactRecord(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail('PROJECTION_BINDING_INPUT_INVALID');
  }
  const record = value as Record<string, unknown>;
  const actual = Object.keys(record).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    fail('PROJECTION_BINDING_INPUT_INVALID');
  }
  return record;
}

function positiveVersion(value: unknown, code: LegalBasisProjectionBindingContractErrorCode): number {
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value) || value <= 0) fail(code);
    return value;
  }
  if (typeof value !== 'string' || !/^[1-9][0-9]*$/.test(value)) fail(code);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) fail(code);
  return parsed;
}

function stringList(value: unknown, allowEmpty: boolean): readonly string[] {
  if (
    !Array.isArray(value) ||
    (!allowEmpty && value.length === 0) ||
    value.some((entry) => typeof entry !== 'string' || entry.trim().length === 0) ||
    new Set(value).size !== value.length
  ) {
    fail('PROJECTION_BINDING_DECISION_INVALID');
  }
  return Object.freeze(
    value.map((entry) => normalizeSemanticString(entry as string)),
  ) as readonly string[];
}

function nonBlank(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    fail('PROJECTION_BINDING_DECISION_INVALID');
  }
  return normalizeSemanticString(value);
}

/**
 * Normalize textual semantic values before the existing canonical JSON
 * serializer runs. This keeps equivalent UTF-8 source representations
 * (Windows CRLF vs LF and canonically equivalent Unicode) checksum-equal;
 * array order remains untouched and therefore decision-significant.
 */
function normalizeSemanticString(value: string): string {
  return value.replace(/\r\n?/g, '\n').normalize('NFC');
}

function requireUtcTimestamp(
  value: unknown,
  code: LegalBasisProjectionBindingContractErrorCode,
): string {
  if (!utcTimestamp(value)) fail(code);
  return value;
}

function utcTimestamp(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value) &&
    Number.isFinite(new Date(value).getTime())
  );
}

function sha256(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
}

function opaque(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/.test(value);
}

function domainCode(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Z][A-Z0-9_]{2,63}$/.test(value);
}

function decimal(value: unknown): value is string {
  return typeof value === 'string' && /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/.test(value);
}

function deepFreeze<T>(value: T): Readonly<T> {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}

function fail(code: LegalBasisProjectionBindingContractErrorCode): never {
  throw new LegalBasisProjectionBindingContractError(code);
}
