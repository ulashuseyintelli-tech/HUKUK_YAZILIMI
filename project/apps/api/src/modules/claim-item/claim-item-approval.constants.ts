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
  // Vekâlet ücretinin hukuki kaynağı (owner K1, 13.11.2026): alacağın niteliğini değiştirir → onaylı yol.
  'attorneyFeeBasis',
  'noInterestReason',
  'noInterestConfirmedById',
  'isAllDebtorsLiable',
  'liableDebtorIds',
  'status',
] as const;

export type ClaimItemOperation = 'CREATE' | 'UPDATE' | 'DELETE';

/**
 * Seçimlik kalem bazlı borçlu sorumluluğu (karar günlüğü 2026-11-15, K-6): seçim, mevcut "yüksek etkili kalem
 * değişikliği" işlemidir — AYNI işlem kodu (`CLAIM_ITEM_HIGH_IMPACT_CHANGE`), aynı onay geçidi, aynı iki kişi kuralı.
 * Kayıtlı niyete yalnız yeni bir işlem türü eklenir. Tek kalemde hedef kalem (`CLAIM_ITEM`), toplu uygulamada hedef
 * dosyadır (`CLAIM_ITEM_CASE`) ve tek talep olarak onaylanır (ya hep ya hiç).
 */
export const CLAIM_ITEM_LIABILITY_SELECTION_INTENT_VERSION = 'CLAIM_ITEM_LIABILITY_SELECTION_V1';
export const CLAIM_ITEM_LIABILITY_SELECTION_OPERATION = 'LIABILITY_SELECTION';

export interface ClaimItemLiabilitySelectionIntentParty {
  caseDebtorId: string;
  shareWeight: number | null;
  /** İki ondalıklı metin ("8000.00"); sınırsızda / diğer türlerde null. */
  limitAmount: string | null;
  unlimited: boolean;
  sortOrder: number;
}

export interface ClaimItemLiabilitySelectionIntentItem {
  claimItemId: string;
  mode: 'JOINT_AND_SEVERAL' | 'PROPORTIONAL' | 'CAPPED' | 'UNDETERMINED';
  limitScope: 'ITEM_AMOUNT' | null;
  basis: string | null;
  basisNote: string | null;
  basisDocumentId: string | null;
  parties: ClaimItemLiabilitySelectionIntentParty[];
  /** Önizleme anındaki durum özeti; onay yürütmesi dosya kilidi altında yeniden hesaplayıp karşılaştırır. */
  stateDigest: string;
}

export interface ClaimItemLiabilitySelectionSavedIntent {
  version: typeof CLAIM_ITEM_LIABILITY_SELECTION_INTENT_VERSION;
  operation: typeof CLAIM_ITEM_LIABILITY_SELECTION_OPERATION;
  caseId: string;
  appliedVia: 'SINGLE' | 'BULK';
  bulkOperationId: string | null;
  selections: ClaimItemLiabilitySelectionIntentItem[];
  reason: string;
}

/** Onay yürütmesinin kalemin iki eski alanına yazacağı izdüşüm (mevcut okuyucular ve eski sürüm kod için). */
export interface ClaimItemLiabilityProjection {
  claimItemId: string;
  isAllDebtorsLiable: boolean;
  liableDebtorIds: string[];
}
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
