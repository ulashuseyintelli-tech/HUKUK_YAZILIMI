import { ClaimItemType } from '@prisma/client';
import { AllocationType } from './dto/collection.dto';

/**
 * G3b — Tahsilat mahsup KIRILIMI okuma-tarafı projeksiyonu (saf, DB'siz).
 *
 * Kanonik mahsup LedgerAllocation'dır (ClaimItem bazlı, P-0). Okuma yüzeyleri
 * (cover/report) kova bazında kırılım ister; bu helper ClaimItem.itemType'ı
 * AllocationType kovasına eşler. Compat fallback'te CollectionAllocation.allocationType
 * zaten AllocationType'tır → aynı breakdown'a toplanır.
 */

export type AllocationBreakdown = Record<AllocationType, number>;

export function emptyBreakdown(): AllocationBreakdown {
  return {
    [AllocationType.PRINCIPAL]: 0,
    [AllocationType.INTEREST]: 0,
    [AllocationType.EXPENSE]: 0,
    [AllocationType.FEE]: 0,
    [AllocationType.ATTORNEY_FEE]: 0,
    [AllocationType.PENALTY]: 0,
    [AllocationType.OTHER]: 0,
  };
}

// EXHAUSTIVE: ClaimItemType → AllocationType kovası (silent default yok).
// TAX_* burada DEĞİL — parent'a (metadata.taxParentCategory) göre çözülür (D).
const ITEM_TYPE_TO_ALLOCATION: Record<string, AllocationType> = {
  PRINCIPAL: AllocationType.PRINCIPAL,
  INTEREST: AllocationType.INTEREST,
  PRE_INTEREST: AllocationType.INTEREST,
  POST_INTEREST: AllocationType.INTEREST,
  EXPENSE: AllocationType.EXPENSE,
  FEE: AllocationType.FEE,
  ATTORNEY_FEE: AllocationType.ATTORNEY_FEE,
  PENALTY: AllocationType.PENALTY,
  CHECK_PENALTY: AllocationType.PENALTY,
  CONTRACTUAL_PENALTY: AllocationType.PENALTY,
  OTHER: AllocationType.OTHER,
};

const TAX_ITEM_TYPES = ['TAX_KDV', 'TAX_BSMV', 'TAX_KKDF'];

/**
 * ClaimItem.itemType → AllocationType kovası (okuma-tarafı). Bilinmeyen değerde throw (doc-24).
 *
 * D (vergi): TAX_* parent'ının niteliğini alır → metadata.taxParentCategory'den kova:
 * PRINCIPAL→PRINCIPAL · INTEREST→INTEREST · COST/ANCILLARY/eksik → OTHER (D-K-S3 + display fallback).
 *
 * Çağrıldığı yerler:
 * - CollectionService.getCollectedBreakdown() → ledger-okuma kırılımı
 */
export function mapClaimItemTypeToAllocationType(
  itemType: ClaimItemType | string,
  metadata?: unknown,
): AllocationType {
  if (TAX_ITEM_TYPES.includes(itemType as string)) {
    const pc = (metadata as any)?.taxParentCategory;
    if (pc === 'PRINCIPAL') return AllocationType.PRINCIPAL;
    if (pc === 'INTEREST') return AllocationType.INTEREST;
    return AllocationType.OTHER; // COST/ANCILLARY/eksik → OTHER (display fallback)
  }
  const mapped = ITEM_TYPE_TO_ALLOCATION[itemType as string];
  if (!mapped) {
    throw new Error(`Eşlenmemiş ClaimItemType→AllocationType: "${itemType}"`);
  }
  return mapped;
}
