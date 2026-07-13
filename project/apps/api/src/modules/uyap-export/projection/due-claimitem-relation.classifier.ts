import { ClaimItemStatus } from '@prisma/client';

import { mapDueTypeToClaimItemType } from '../../case/due-to-claim-item.mapper';
import { DueType } from '../../case/dto/case.dto';
import {
  ClaimItemRelationSnapshot,
  DecimalSnapshot,
  DueRelationSnapshot,
  ReceivableRelationResult,
} from './faizt-projection.types';

type MarkerKind =
  | 'DUE_SYNC'
  | 'BACKFILL'
  | 'BOTH_SAME_SOURCE'
  | 'CONFLICTING'
  | 'NONE';

interface MarkerInfo {
  readonly kind: MarkerKind;
  readonly sourceDueId: string | null;
}

function markerInfo(item: ClaimItemRelationSnapshot): MarkerInfo {
  const dueSync = item.dueSyncSourceDueId?.trim() || null;
  const backfill = item.backfillSourceDueId?.trim() || null;
  if (dueSync && backfill) {
    return dueSync === backfill
      ? { kind: 'BOTH_SAME_SOURCE', sourceDueId: dueSync }
      : { kind: 'CONFLICTING', sourceDueId: null };
  }
  if (dueSync) return { kind: 'DUE_SYNC', sourceDueId: dueSync };
  if (backfill) return { kind: 'BACKFILL', sourceDueId: backfill };
  return { kind: 'NONE', sourceDueId: null };
}

function decimal(value: DecimalSnapshot): string | null {
  if (value === null || value === undefined) return null;
  let raw: string;
  try {
    raw = typeof value === 'number' ? String(value) : value.toString().trim();
  } catch {
    return null;
  }
  if (!/^-?\d+(?:\.\d+)?$/.test(raw)) return null;
  const negative = raw.startsWith('-');
  const unsigned = negative ? raw.slice(1) : raw;
  const [wholeRaw, fractionRaw = ''] = unsigned.split('.');
  const whole = wholeRaw.replace(/^0+(?=\d)/, '') || '0';
  const fraction = fractionRaw.replace(/0+$/, '');
  const normalized = `${whole}${fraction ? `.${fraction}` : ''}`;
  return negative && normalized !== '0' ? `-${normalized}` : normalized;
}

function date(value: Date | string | null): string | null {
  if (value === null) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(parsed.getTime())) return null;
  return parsed.toISOString();
}

function hasInvalidDecimal(value: DecimalSnapshot): boolean {
  return value !== null && value !== undefined && decimal(value) === null;
}

function hasInvalidDate(value: Date | string | null): boolean {
  return value !== null && date(value) === null;
}

function normalized(value: string | null): string | null {
  const result = value?.trim().toUpperCase();
  return result || null;
}

function immutableResult(input: {
  classification: ReceivableRelationResult['classification'];
  tenantId: string;
  caseId: string;
  dueIds?: readonly string[];
  claimItemIds?: readonly string[];
  sourceExportEligible: boolean;
  reasons?: readonly string[];
}): ReceivableRelationResult {
  return Object.freeze({
    classification: input.classification,
    tenantId: input.tenantId,
    caseId: input.caseId,
    dueIds: Object.freeze([...(input.dueIds ?? [])].sort()),
    claimItemIds: Object.freeze([...(input.claimItemIds ?? [])].sort()),
    sourceExportEligible: input.sourceExportEligible,
    reasons: Object.freeze([...(input.reasons ?? [])].sort()),
  });
}

function sourceEligible(
  dues: readonly DueRelationSnapshot[],
  claims: readonly ClaimItemRelationSnapshot[],
): boolean {
  return (
    dues.every((due) => due.exportEligible) &&
    claims.every(
      (claim) => claim.exportEligible && claim.status === ClaimItemStatus.ACTIVE,
    )
  );
}

function amountOrTypeDrift(
  due: DueRelationSnapshot,
  claim: ClaimItemRelationSnapshot,
  expectedItemType: string,
): string[] {
  const reasons: string[] = [];
  if (claim.itemType !== expectedItemType) reasons.push('ITEM_TYPE_MISMATCH');
  if (claim.currency !== due.currency) reasons.push('CURRENCY_MISMATCH');
  const dueAmount = decimal(due.amount);
  const demandedAmount = decimal(claim.demandedAmount);
  const mirrorAmount = decimal(claim.amount);
  if (dueAmount === null || demandedAmount === null || mirrorAmount === null) {
    reasons.push('CURRENT_AMOUNT_STATE_UNSAFE');
  } else {
    if (dueAmount !== demandedAmount) reasons.push('DEMANDED_AMOUNT_MISMATCH');
    if (mirrorAmount !== demandedAmount) reasons.push('AMOUNT_MIRROR_MISMATCH');
  }
  // originalAmount is creation provenance and is intentionally not compared.
  return reasons;
}

function interestIdentityDrift(
  due: DueRelationSnapshot,
  claim: ClaimItemRelationSnapshot,
): string[] {
  const reasons: string[] = [];
  if (normalized(due.interestTypeCode) !== normalized(claim.interestTypeCode)) {
    reasons.push('INTEREST_TYPE_CODE_MISMATCH');
  }
  if (normalized(due.legacyInterestType) !== normalized(claim.legacyInterestType)) {
    reasons.push('LEGACY_INTEREST_MIRROR_MISMATCH');
  }
  if (hasInvalidDecimal(due.interestRate) || hasInvalidDecimal(claim.interestRate)) {
    reasons.push('INTEREST_RATE_INVALID');
  }
  if (decimal(due.interestRate) !== decimal(claim.interestRate)) {
    reasons.push('INTEREST_RATE_MISMATCH');
  }
  if (hasInvalidDate(due.interestStartDate) || hasInvalidDate(claim.interestStartDate)) {
    reasons.push('INTEREST_START_DATE_INVALID');
  }
  if (date(due.interestStartDate) !== date(claim.interestStartDate)) {
    reasons.push('INTEREST_START_DATE_MISMATCH');
  }
  if (
    normalized(due.interestAccrualStatus) !==
    normalized(claim.interestAccrualStatus)
  ) {
    reasons.push('INTEREST_ACCRUAL_STATUS_MISMATCH');
  }
  return reasons;
}

function expectedItemType(dueType: string): string | null | undefined {
  try {
    return mapDueTypeToClaimItemType(dueType as DueType) ?? null;
  } catch {
    return undefined;
  }
}

/**
 * Pure, marker-only relation classifier for the dormant PR-A5-1 boundary.
 * Unmarked records are never paired by amount, date, description, or position.
 */
export function classifyDueClaimItemRelations(input: {
  readonly tenantId: string;
  readonly caseId: string;
  readonly dues: readonly DueRelationSnapshot[];
  readonly claimItems: readonly ClaimItemRelationSnapshot[];
}): readonly ReceivableRelationResult[] {
  if (!input.tenantId.trim() || !input.caseId.trim()) {
    throw new Error('tenantId and caseId are required for relation classification.');
  }

  const dues = [...input.dues].sort((a, b) => a.dueId.localeCompare(b.dueId));
  const claims = [...input.claimItems].sort((a, b) =>
    a.claimItemId.localeCompare(b.claimItemId),
  );
  const dueById = new Map(dues.map((due) => [due.dueId, due]));
  const markers = new Map(claims.map((claim) => [claim.claimItemId, markerInfo(claim)]));
  const consumedDueIds = new Set<string>();
  const consumedClaimIds = new Set<string>();
  const results: ReceivableRelationResult[] = [];

  for (const due of dues) {
    if (due.tenantId !== input.tenantId || due.caseId !== input.caseId) {
      consumedDueIds.add(due.dueId);
      results.push(
        immutableResult({
          classification: 'UNCLASSIFIABLE',
          tenantId: input.tenantId,
          caseId: input.caseId,
          dueIds: [due.dueId],
          sourceExportEligible: false,
          reasons: ['DUE_TENANT_OR_CASE_SCOPE_MISMATCH'],
        }),
      );
    }
  }

  for (const claim of claims) {
    const marker = markers.get(claim.claimItemId)!;
    if (
      claim.tenantId !== input.tenantId ||
      claim.caseId !== input.caseId ||
      marker.kind === 'CONFLICTING'
    ) {
      consumedClaimIds.add(claim.claimItemId);
      results.push(
        immutableResult({
          classification: 'UNCLASSIFIABLE',
          tenantId: input.tenantId,
          caseId: input.caseId,
          claimItemIds: [claim.claimItemId],
          sourceExportEligible: false,
          reasons: [
            marker.kind === 'CONFLICTING'
              ? 'CONFLICTING_STRONG_MARKERS'
              : 'CLAIM_ITEM_TENANT_OR_CASE_SCOPE_MISMATCH',
          ],
        }),
      );
    }
  }

  const strongByDue = new Map<string, ClaimItemRelationSnapshot[]>();
  for (const claim of claims) {
    if (consumedClaimIds.has(claim.claimItemId)) continue;
    const marker = markers.get(claim.claimItemId)!;
    if (!marker.sourceDueId) continue;
    const linked = strongByDue.get(marker.sourceDueId) ?? [];
    linked.push(claim);
    strongByDue.set(marker.sourceDueId, linked);
  }

  for (const claim of claims) {
    if (consumedClaimIds.has(claim.claimItemId)) continue;
    const marker = markers.get(claim.claimItemId)!;
    if (marker.sourceDueId && consumedDueIds.has(marker.sourceDueId)) {
      consumedClaimIds.add(claim.claimItemId);
      results.push(
        immutableResult({
          classification: 'UNCLASSIFIABLE',
          tenantId: input.tenantId,
          caseId: input.caseId,
          claimItemIds: [claim.claimItemId],
          sourceExportEligible: false,
          reasons: ['STRONG_MARKER_POINTS_TO_OUT_OF_SCOPE_DUE'],
        }),
      );
    }
  }

  for (const due of dues) {
    if (consumedDueIds.has(due.dueId)) continue;
    const linked = (strongByDue.get(due.dueId) ?? []).filter(
      (claim) => !consumedClaimIds.has(claim.claimItemId),
    );
    const expected = expectedItemType(due.type);

    if (expected === undefined) {
      consumedDueIds.add(due.dueId);
      linked.forEach((claim) => consumedClaimIds.add(claim.claimItemId));
      results.push(
        immutableResult({
          classification: 'UNCLASSIFIABLE',
          tenantId: input.tenantId,
          caseId: input.caseId,
          dueIds: [due.dueId],
          claimItemIds: linked.map((claim) => claim.claimItemId),
          sourceExportEligible: false,
          reasons: ['UNKNOWN_DUE_TYPE'],
        }),
      );
      continue;
    }

    if (linked.length > 1) {
      consumedDueIds.add(due.dueId);
      linked.forEach((claim) => consumedClaimIds.add(claim.claimItemId));
      results.push(
        immutableResult({
          classification: 'DUPLICATE_PAIR',
          tenantId: input.tenantId,
          caseId: input.caseId,
          dueIds: [due.dueId],
          claimItemIds: linked.map((claim) => claim.claimItemId),
          sourceExportEligible: sourceEligible([due], linked),
          reasons: ['MULTIPLE_STRONG_MARKERS_FOR_DUE'],
        }),
      );
      continue;
    }

    if (expected === null) {
      consumedDueIds.add(due.dueId);
      if (linked.length === 1) {
        consumedClaimIds.add(linked[0].claimItemId);
        results.push(
          immutableResult({
            classification: 'AMOUNT_OR_TYPE_DRIFT',
            tenantId: input.tenantId,
            caseId: input.caseId,
            dueIds: [due.dueId],
            claimItemIds: [linked[0].claimItemId],
            sourceExportEligible: sourceEligible([due], linked),
            reasons: ['NAFAKA_HAS_STRONG_CLAIM_ITEM_MARKER'],
          }),
        );
      } else {
        results.push(
          immutableResult({
            classification: due.exportEligible
              ? 'NAFAKA_EXPECTED_DUE_ONLY'
              : 'UNCLASSIFIABLE',
            tenantId: input.tenantId,
            caseId: input.caseId,
            dueIds: [due.dueId],
            sourceExportEligible: due.exportEligible,
            reasons: [
              due.exportEligible
                ? 'CANONICAL_NAFAKA_DUE_ONLY_EXCEPTION'
                : 'NAFAKA_SOURCE_NOT_EXPORTABLE',
            ],
          }),
        );
      }
      continue;
    }

    if (linked.length === 1) {
      const claim = linked[0];
      consumedDueIds.add(due.dueId);
      consumedClaimIds.add(claim.claimItemId);
      const amountReasons = amountOrTypeDrift(due, claim, expected);
      const interestReasons = interestIdentityDrift(due, claim);
      const classification =
        amountReasons.length > 0
          ? 'AMOUNT_OR_TYPE_DRIFT'
          : interestReasons.length > 0
            ? 'INTEREST_IDENTITY_DRIFT'
            : 'MATCHED_PAIR';
      results.push(
        immutableResult({
          classification,
          tenantId: input.tenantId,
          caseId: input.caseId,
          dueIds: [due.dueId],
          claimItemIds: [claim.claimItemId],
          sourceExportEligible: sourceEligible([due], [claim]),
          reasons: [...amountReasons, ...interestReasons],
        }),
      );
    }
  }

  for (const claim of claims) {
    if (consumedClaimIds.has(claim.claimItemId)) continue;
    const marker = markers.get(claim.claimItemId)!;
    if (marker.sourceDueId && !dueById.has(marker.sourceDueId)) {
      consumedClaimIds.add(claim.claimItemId);
      results.push(
        immutableResult({
          classification: 'UNCLASSIFIABLE',
          tenantId: input.tenantId,
          caseId: input.caseId,
          claimItemIds: [claim.claimItemId],
          sourceExportEligible: false,
          reasons: ['STRONG_MARKER_SOURCE_DUE_NOT_FOUND'],
        }),
      );
    }
  }

  const ordinaryUnlinkedDues = dues.filter(
    (due) =>
      !consumedDueIds.has(due.dueId) && expectedItemType(due.type) !== null,
  );
  const unmarkedClaims = claims.filter(
    (claim) =>
      !consumedClaimIds.has(claim.claimItemId) &&
      markers.get(claim.claimItemId)!.kind === 'NONE',
  );

  if (ordinaryUnlinkedDues.length > 0 && unmarkedClaims.length > 0) {
    ordinaryUnlinkedDues.forEach((due) => consumedDueIds.add(due.dueId));
    unmarkedClaims.forEach((claim) => consumedClaimIds.add(claim.claimItemId));
    results.push(
      immutableResult({
        classification: 'MARKER_MISSING',
        tenantId: input.tenantId,
        caseId: input.caseId,
        dueIds: ordinaryUnlinkedDues.map((due) => due.dueId),
        claimItemIds: unmarkedClaims.map((claim) => claim.claimItemId),
        sourceExportEligible: sourceEligible(ordinaryUnlinkedDues, unmarkedClaims),
        reasons: ['UNMARKED_SOURCES_NOT_HEURISTICALLY_PAIRED'],
      }),
    );
  }

  for (const due of dues) {
    if (consumedDueIds.has(due.dueId)) continue;
    consumedDueIds.add(due.dueId);
    results.push(
      immutableResult({
        classification: 'DUE_ONLY',
        tenantId: input.tenantId,
        caseId: input.caseId,
        dueIds: [due.dueId],
        sourceExportEligible: due.exportEligible,
        reasons: ['NO_STRONG_CLAIM_ITEM_MARKER'],
      }),
    );
  }

  for (const claim of claims) {
    if (consumedClaimIds.has(claim.claimItemId)) continue;
    consumedClaimIds.add(claim.claimItemId);
    results.push(
      immutableResult({
        classification: 'CLAIM_ITEM_ONLY',
        tenantId: input.tenantId,
        caseId: input.caseId,
        claimItemIds: [claim.claimItemId],
        sourceExportEligible: sourceEligible([], [claim]),
        reasons: ['NO_STRONG_DUE_MARKER'],
      }),
    );
  }

  return Object.freeze(
    results.sort(
      (a, b) =>
        a.classification.localeCompare(b.classification) ||
        a.dueIds.join(',').localeCompare(b.dueIds.join(',')) ||
        a.claimItemIds.join(',').localeCompare(b.claimItemIds.join(',')),
    ),
  );
}
