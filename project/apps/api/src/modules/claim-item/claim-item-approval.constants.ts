export const CLAIM_ITEM_HIGH_IMPACT_ACTION_CODE = 'CLAIM_ITEM_HIGH_IMPACT_CHANGE';
export const CLAIM_ITEM_TARGET_TYPE = 'CLAIM_ITEM';
export const CLAIM_ITEM_CASE_TARGET_TYPE = 'CLAIM_ITEM_CASE';
export const CLAIM_ITEM_INTENT_VERSION = 'OWN29D_CLAIM_ITEM_HIGH_IMPACT_V1';

/**
 * OWN-29-D user-mutation impact vocabulary. These sets are shared by the
 * existing ClaimItem user boundary and the canonical write gate so approval
 * routing cannot drift between the two surfaces.
 */
export const CLAIM_ITEM_LOW_IMPACT_USER_FIELDS = [
  'description',
  'referenceNo',
  'sortOrder',
] as const;

export const CLAIM_ITEM_HIGH_IMPACT_USER_FIELDS = [
  'amount',
  'itemType',
  'currency',
  'interestType',
  'interestTypeCode',
  'interestRate',
  'interestStartDate',
  'interestEndDate',
  'dueDate',
  'interestAccrualStatus',
  'interestStartDateProvenance',
  'noInterestReason',
  'noInterestConfirmedById',
  'isAllDebtorsLiable',
  'liableDebtorIds',
  'status',
] as const;

export type ClaimItemOperation = 'CREATE' | 'UPDATE' | 'DELETE';
export type ClaimItemPatch = Record<string, unknown>;

export interface ClaimItemHighImpactSavedIntent {
  version: typeof CLAIM_ITEM_INTENT_VERSION;
  operation: ClaimItemOperation;
  caseId: string;
  claimItemId?: string;
  proposedPatch: ClaimItemPatch;
  currentSnapshot: Record<string, unknown> | null;
  currentSnapshotHash: string | null;
  reason: string;
}
