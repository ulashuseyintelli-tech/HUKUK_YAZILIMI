export const CLAIM_ITEM_HIGH_IMPACT_ACTION_CODE = 'CLAIM_ITEM_HIGH_IMPACT_CHANGE';
export const CLAIM_ITEM_TARGET_TYPE = 'CLAIM_ITEM';
export const CLAIM_ITEM_CASE_TARGET_TYPE = 'CLAIM_ITEM_CASE';
export const CLAIM_ITEM_INTENT_VERSION = 'OWN29D_CLAIM_ITEM_HIGH_IMPACT_V1';

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
