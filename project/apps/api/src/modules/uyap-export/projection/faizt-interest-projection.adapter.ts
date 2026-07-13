import { InterestAccrualStatus, InterestTypeCode } from '@prisma/client';

import {
  resolveUyapInterestProjection,
  UyapFaiztInterestCode,
  UyapProjectionRequiredContext,
} from '../../../config/uyap-interest-crosswalk';
import { mapLegacyClaimItemCompatibilityType } from '../../interest-engine/mapping/interest-type-bridge';
import {
  DecimalSnapshot,
  FaiztProjectionFailureStatus,
  FaiztProjectionInput,
  FaiztProjectionResult,
  RejectedFaiztProjection,
} from './faizt-projection.types';

const NO_CONTEXT = Object.freeze([]) as readonly UyapProjectionRequiredContext[];
const FIXED_CODES: ReadonlySet<InterestTypeCode> = new Set([
  InterestTypeCode.CONTRACTUAL,
  InterestTypeCode.COMMERCIAL_FIXED,
]);

function sourceId(input: FaiztProjectionInput): string {
  return input.sourceKind === 'CLAIM_ITEM' ? input.claimItemId : input.dueId;
}

function reject(
  input: FaiztProjectionInput,
  status: FaiztProjectionFailureStatus,
  detail: string,
  canonicalCode: string | null = input.interestTypeCode,
  requiredContext: readonly UyapProjectionRequiredContext[] = NO_CONTEXT,
): RejectedFaiztProjection {
  return Object.freeze({
    ok: false,
    status,
    sourceId: sourceId(input),
    canonicalCode,
    relationClassification: input.relation.classification,
    requiredContext: Object.freeze([...requiredContext]),
    detail,
  });
}

function relationFailure(input: FaiztProjectionInput): RejectedFaiztProjection | null {
  if (!input.tenantId.trim() || !input.caseId.trim()) {
    return reject(
      input,
      'RELATION_UNCLASSIFIABLE',
      'TENANT_AND_CASE_SCOPE_ARE_REQUIRED',
    );
  }
  if (
    input.relation.tenantId !== input.tenantId ||
    input.relation.caseId !== input.caseId
  ) {
    return reject(
      input,
      'RELATION_UNCLASSIFIABLE',
      'RELATION_SCOPE_DOES_NOT_MATCH_SOURCE',
    );
  }

  const classification = input.relation.classification;
  switch (classification) {
    case 'DUPLICATE_PAIR':
      return reject(input, 'RELATION_DUPLICATE', 'RELATION_HAS_DUPLICATE_STRONG_MARKERS');
    case 'AMOUNT_OR_TYPE_DRIFT':
    case 'INTEREST_IDENTITY_DRIFT':
      return reject(input, 'RELATION_DRIFT', 'RELATION_AUTHORITY_DRIFT');
    case 'MARKER_MISSING':
      return reject(input, 'RELATION_MARKER_MISSING', 'RELATION_MARKER_IS_REQUIRED');
    case 'UNCLASSIFIABLE':
      return reject(input, 'RELATION_UNCLASSIFIABLE', 'RELATION_NOT_DETERMINISTIC');
    default:
      return null;
  }
}

function numericRate(value: DecimalSnapshot): number | null {
  if (value === null || value === undefined) return null;
  try {
    const raw = typeof value === 'number' ? value : value.toString().trim();
    if (raw === '') return Number.NaN;
    return typeof raw === 'number' ? raw : Number(raw);
  } catch {
    return Number.NaN;
  }
}

function canonicalDate(value: Date | string | null): string | null {
  if (value === null) return null;
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value.toISOString().slice(0, 10) : null;
  }
  const match = /^(\d{4}-\d{2}-\d{2})(?:T.*)?$/.exec(value);
  if (!match) return null;
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10) === match[1] ? match[1] : null;
}

function isCanonicalCode(value: string): value is InterestTypeCode {
  return (Object.values(InterestTypeCode) as string[]).includes(value);
}

function hasInterestConfiguration(input: FaiztProjectionInput): boolean {
  return Boolean(
    input.interestTypeCode ||
      input.legacyInterestType ||
      input.interestRate !== null && input.interestRate !== undefined ||
      input.interestStartDate,
  );
}

function isFaiztCode(value: string): value is UyapFaiztInterestCode {
  return /^FAIZT\d{5}$/.test(value);
}

/**
 * Dormant PR-A5-1 FAIZT boundary. It has no exporter, XML, controller, DB,
 * network, logging, or mutation dependency.
 */
export function resolveDormantFaiztProjection(
  input: FaiztProjectionInput,
): FaiztProjectionResult {
  const relationRejected = relationFailure(input);
  if (relationRejected) return relationRejected;

  if (!input.exportEligible || !input.relation.sourceExportEligible) {
    return reject(input, 'SOURCE_NOT_EXPORTABLE', 'SOURCE_LIFECYCLE_NOT_EXPORTABLE');
  }

  if (input.sourceKind === 'NAFAKA_DUE') {
    if (
      input.dueType !== 'NAFAKA' ||
      input.relation.classification !== 'NAFAKA_EXPECTED_DUE_ONLY' ||
      !input.relation.dueIds.includes(input.dueId)
    ) {
      return reject(
        input,
        'RELATION_UNCLASSIFIABLE',
        'NAFAKA_REQUIRES_EXACT_DUE_ONLY_CLASSIFICATION',
      );
    }
    return reject(
      input,
      'NAFAKA_MAPPING_BLOCKED',
      'NO_ACCEPTED_CANONICAL_NAFAKA_FAIZT_MAPPING',
    );
  }

  if (
    !input.relation.claimItemIds.includes(input.claimItemId) ||
    (input.relation.classification !== 'MATCHED_PAIR' &&
      input.relation.classification !== 'CLAIM_ITEM_ONLY')
  ) {
    return reject(
      input,
      'RELATION_UNCLASSIFIABLE',
      'CLAIM_ITEM_SOURCE_NOT_COVERED_BY_RELATION',
    );
  }

  const dueSyncMarker = input.sourceMarker.dueSyncSourceDueId?.trim() || null;
  const backfillMarker = input.sourceMarker.backfillSourceDueId?.trim() || null;
  if (input.relation.classification === 'MATCHED_PAIR') {
    const relationDueId = input.relation.dueIds.length === 1
      ? input.relation.dueIds[0]
      : null;
    const markerConflict =
      dueSyncMarker !== null &&
      backfillMarker !== null &&
      dueSyncMarker !== backfillMarker;
    const markerDueId = dueSyncMarker ?? backfillMarker;
    if (
      input.relation.claimItemIds.length !== 1 ||
      relationDueId === null ||
      markerConflict ||
      markerDueId !== relationDueId
    ) {
      return reject(
        input,
        'RELATION_UNCLASSIFIABLE',
        'MATCHED_PAIR_REQUIRES_ONE_COHERENT_STRONG_MARKER',
      );
    }
  } else if (
    input.relation.dueIds.length !== 0 ||
    input.relation.claimItemIds.length !== 1 ||
    dueSyncMarker !== null ||
    backfillMarker !== null
  ) {
    return reject(
      input,
      'RELATION_UNCLASSIFIABLE',
      'CLAIM_ITEM_ONLY_REQUIRES_NO_DUE_MARKER',
    );
  }

  if (input.interestAccrualStatus === InterestAccrualStatus.NO_INTEREST) {
    if (hasInterestConfiguration(input)) {
      return reject(
        input,
        'INVALID_INTEREST_STATE',
        'NO_INTEREST_CONFIGURATION_CONFLICT',
      );
    }
    return Object.freeze({
      ok: true,
      status: 'NO_INTEREST',
      sourceId: input.claimItemId,
      relationClassification: input.relation.classification,
      omitInterestElement: true,
    });
  }

  if (input.interestAccrualStatus !== InterestAccrualStatus.ACCRUES) {
    return reject(
      input,
      'INVALID_INTEREST_STATE',
      'ACCRUAL_STATUS_NOT_EXPLICITLY_RESOLVED',
    );
  }

  if (input.interestTypeCode === null) {
    return reject(
      input,
      input.legacyInterestType ? 'LEGACY_AMBIGUOUS' : 'UNKNOWN_CANONICAL_CODE',
      input.legacyInterestType
        ? 'LEGACY_ONLY_IDENTITY_IS_NOT_FAIZT_AUTHORITY'
        : 'CANONICAL_INTEREST_IDENTITY_MISSING',
      null,
    );
  }
  if (!isCanonicalCode(input.interestTypeCode)) {
    return reject(
      input,
      'UNKNOWN_CANONICAL_CODE',
      'CANONICAL_INTEREST_IDENTITY_UNKNOWN',
    );
  }
  const canonicalCode = input.interestTypeCode;

  if (input.legacyInterestType) {
    try {
      const compatibility = mapLegacyClaimItemCompatibilityType(
        input.legacyInterestType,
      );
      if (String(compatibility) !== canonicalCode) {
        return reject(
          input,
          'RICH_LEGACY_MISMATCH',
          'RICH_IDENTITY_AND_LEGACY_PROVENANCE_CONFLICT',
          canonicalCode,
        );
      }
    } catch {
      return reject(
        input,
        'RICH_LEGACY_MISMATCH',
        'LEGACY_PROVENANCE_NOT_STRICTLY_COMPATIBLE',
        canonicalCode,
      );
    }
  }

  const rate = numericRate(input.interestRate);
  if (FIXED_CODES.has(canonicalCode)) {
    if (rate === null || !Number.isFinite(rate) || rate <= 0) {
      return reject(
        input,
        'INVALID_RATE',
        'FIXED_RATE_MUST_BE_POSITIVE_FINITE_NUMBER',
        canonicalCode,
      );
    }
  } else if (rate !== null) {
    return reject(
      input,
      'INVALID_RATE',
      'VARIABLE_RATE_CANONICAL_CODE_MUST_NOT_PERSIST_FIXED_RATE',
      canonicalCode,
    );
  }

  const interestStartDate = canonicalDate(input.interestStartDate);
  if (interestStartDate === null) {
    return reject(
      input,
      'MISSING_START_DATE',
      'EXPLICIT_CANONICAL_INTEREST_START_DATE_REQUIRED',
      canonicalCode,
    );
  }

  const projection = resolveUyapInterestProjection({
    interestTypeCode: canonicalCode,
    projection: 'FAIZT',
    interestRate: rate,
  });
  if (projection.ok === false) {
    if (projection.status === 'UNVERIFIED_PROJECTION') {
      return reject(
        input,
        'UNVERIFIED_FAIZT',
        'FAIZT_CELL_NOT_OWNER_ACCEPTED_OR_OFFICIALLY_VERIFIED',
        canonicalCode,
        projection.requiredContext,
      );
    }
    if (projection.status === 'REQUIRED_CONTEXT_MISSING') {
      return reject(
        input,
        'INVALID_RATE',
        'REQUIRED_PROJECTION_CONTEXT_MISSING',
        canonicalCode,
        projection.requiredContext,
      );
    }
    return reject(
      input,
      'UNKNOWN_CANONICAL_CODE',
      'CANONICAL_CODE_NOT_PRESENT_IN_CROSSWALK',
      canonicalCode,
      projection.requiredContext,
    );
  }
  if (!isFaiztCode(projection.code)) {
    return reject(
      input,
      'UNVERIFIED_FAIZT',
      'CROSSWALK_RESULT_IS_NOT_A_FAIZT_CODE',
      canonicalCode,
    );
  }

  return Object.freeze({
    ok: true,
    status: 'PROJECTED',
    sourceId: input.claimItemId,
    sourceAuthority: 'CLAIM_ITEM_RICH',
    relationClassification: input.relation.classification,
    canonicalCode,
    faiztCode: projection.code,
    verification: projection.verification,
    evidence: projection.evidence,
    interestRate: projection.interestRate,
    interestStartDate,
  });
}
