/**
 * G4a: ClaimItem SINIFLANDIRMA — TEK OTORİTE.
 *
 * itemType → {principal | interest | cost | ancillary | tax} sınıflandırması. summary-engine'in
 * private mapItemTypeToAncillary + inline masraf/fer'i mantığından BİREBİR çıkarıldı (PR-AO-3 /
 * doc-27 kilitli eşleme). Hem summary-engine (allocation) hem G4a assembler buradan kullanır —
 * ikinci kopya YOK (ledger Q8). Davranış değişmez.
 */

import { AncillaryType } from '../types/domain.types';

/**
 * itemType → AncillaryType eşlemesi (doc-27 / PR-AO-3). Eşlenmeyen → null.
 * PENALTY/CONTRACTUAL_PENALTY/OTHER → DIGER (yalnız CHECK_PENALTY → CEK_TAZMINATI).
 * COMMISSION → KOMISYON (masraf). TAX_* bilinçli HARİÇ (açık hukuki D; field-based, ayrı ele alınır).
 *
 * <remarks>Çağrıldığı yerler:
 * - summary-engine.service mapItemTypeToAncillary() (delege) + resolveResultCategory().
 * - classifyClaimItemType() (aşağıda).
 * - claim-bucket-assembler (G4a).</remarks>
 */
export function mapItemTypeToAncillary(itemType: string): AncillaryType | null {
  const mapping: Record<string, AncillaryType> = {
    FEE: AncillaryType.HARC,
    EXPENSE: AncillaryType.TEBLIGAT_MASRAFI,
    ATTORNEY_FEE: AncillaryType.VEKALET_UCRETI,
    CHECK_PENALTY: AncillaryType.CEK_TAZMINATI,
    PENALTY: AncillaryType.DIGER,
    CONTRACTUAL_PENALTY: AncillaryType.DIGER,
    COMMISSION: AncillaryType.KOMISYON,
    OTHER: AncillaryType.DIGER,
  };
  return mapping[itemType] || null;
}

/** Masraf (cost) kalemi mi? (doc-27: FEE/EXPENSE/COMMISSION = masraf; gerisi fer'i.) */
const COST_ITEM_TYPES: ReadonlySet<string> = new Set(['FEE', 'EXPENSE', 'COMMISSION']);
export function isCostItemType(itemType: string): boolean {
  return COST_ITEM_TYPES.has(itemType);
}

const INTEREST_ITEM_TYPES: ReadonlySet<string> = new Set(['INTEREST', 'PRE_INTEREST', 'POST_INTEREST']);
const TAX_ITEM_TYPES: ReadonlySet<string> = new Set(['TAX_KDV', 'TAX_BSMV', 'TAX_KKDF']);

export type ClaimItemCategory = 'PRINCIPAL' | 'INTEREST' | 'COST' | 'ANCILLARY' | 'TAX' | 'UNKNOWN';

export interface ClaimItemClassification {
  category: ClaimItemCategory;
  /** COST/ANCILLARY için hedef kova (mapItemTypeToAncillary). Diğer kategorilerde undefined. */
  ancillaryType?: AncillaryType;
}

/**
 * itemType'ı kanonik kategoriye sınıflandırır (masraf/fer'i kovası dahil). summary-engine'in
 * build-loop sınıflandırmasıyla AYNI davranış.
 *
 * <remarks>Çağrıldığı yerler: claim-bucket-assembler (G4a).</remarks>
 */
export function classifyClaimItemType(itemType: string): ClaimItemClassification {
  if (itemType === 'PRINCIPAL') return { category: 'PRINCIPAL' };
  if (INTEREST_ITEM_TYPES.has(itemType)) return { category: 'INTEREST' };
  if (TAX_ITEM_TYPES.has(itemType)) return { category: 'TAX' };

  const ancillaryType = mapItemTypeToAncillary(itemType);
  if (ancillaryType == null) return { category: 'UNKNOWN' };
  return { category: isCostItemType(itemType) ? 'COST' : 'ANCILLARY', ancillaryType };
}
