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

// EXHAUSTIVE: 14 ClaimItemType → 7 AllocationType kovası (silent default yok).
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
  TAX_KDV: AllocationType.OTHER,
  TAX_BSMV: AllocationType.OTHER,
  TAX_KKDF: AllocationType.OTHER,
  OTHER: AllocationType.OTHER,
};

/**
 * ClaimItem.itemType → AllocationType kovası. Bilinmeyen değerde throw (doc-24).
 *
 * Çağrıldığı yerler:
 * - CollectionService.getCollectedBreakdown() → ledger-okuma kırılımı
 */
export function mapClaimItemTypeToAllocationType(itemType: ClaimItemType | string): AllocationType {
  const mapped = ITEM_TYPE_TO_ALLOCATION[itemType as string];
  if (!mapped) {
    throw new Error(`Eşlenmemiş ClaimItemType→AllocationType: "${itemType}"`);
  }
  return mapped;
}
