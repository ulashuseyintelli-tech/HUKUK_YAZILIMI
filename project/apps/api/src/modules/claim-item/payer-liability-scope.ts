import { BadRequestException } from '@nestjs/common';

/**
 * K3-L (owner kararları 2026-09-28) — tahsilatın ödeyen borçluya göre kapsamı.
 *
 * Kalem bazlı sorumluluk (`ClaimItem.isAllDebtorsLiable` / `liableDebtorIds`, kimlik = Debtor.id): bir borçlunun
 * ödemesi YALNIZ o borçlunun sorumlu olduğu kalemlere mahsup edilir (ör. ciranta ödemesi keşideciye ait çek
 * tazminatını kapatamaz). Dosyada yalnız bazı borçlulara bağlı bir kalem varken ödeyen borçlusu belirtilmemiş tahsilat
 * REDDEDİLİR (owner kararı 2). Tüm kalemleri tüm borçlulara açık dosyada davranış DEĞİŞMEZ (ödeyen yok sayılır).
 */
export type PayerLiabilityScopeErrorCode = 'PAYER_DEBTOR_REQUIRED' | 'PAYER_NOT_LIABLE_FOR_ANY_ITEM';

const MESSAGES: Record<PayerLiabilityScopeErrorCode, string> = {
  PAYER_DEBTOR_REQUIRED:
    'Bu dosyada yalnız bazı borçlulara ait alacak kalemi var; tahsilatı yapan borçlu seçilmelidir.',
  PAYER_NOT_LIABLE_FOR_ANY_ITEM: 'Seçilen borçlunun sorumlu olduğu etkin alacak kalemi yok.',
};

export class PayerLiabilityScopeError extends BadRequestException {
  constructor(readonly code: PayerLiabilityScopeErrorCode) {
    super({ code, message: MESSAGES[code] });
  }
}

export interface LiabilityScopedItem {
  readonly isAllDebtorsLiable: boolean;
  readonly liableDebtorIds: readonly string[] | null;
}

/** Dosyada yalnız bazı borçlulara bağlı (kısıtlı) kalem var mı? */
export function hasRestrictedLiability(items: readonly Pick<LiabilityScopedItem, 'isAllDebtorsLiable'>[]): boolean {
  return items.some((item) => item.isAllDebtorsLiable === false);
}

/** Kalem, verilen borçlunun (Debtor.id) sorumluluğunda mı? */
export function isItemLiableForDebtor(item: LiabilityScopedItem, debtorId: string): boolean {
  return item.isAllDebtorsLiable || (item.liableDebtorIds ?? []).includes(debtorId);
}

/**
 * Mahsup edilebilecek kalemler. Kısıtlı kalem yoksa girdi aynen döner (bugünkü davranış).
 *
 * /// <remarks>
 * /// Çağrıldığı yerler:
 * ///  - SummaryEngineService.allocatePaymentToLedgerInTx() → kalıcı TBK100 dağıtımı
 * ///  (Önizleme aynı kuralı hasRestrictedLiability / isItemLiableForDebtor ile uygular — CasePaymentPreviewService.preview())
 * /// </remarks>
 */
export function scopeItemsToPayer<T extends LiabilityScopedItem>(
  items: readonly T[],
  payerDebtorId: string | null | undefined,
): T[] {
  if (!hasRestrictedLiability(items)) return [...items];
  if (!payerDebtorId) throw new PayerLiabilityScopeError('PAYER_DEBTOR_REQUIRED');
  const scoped = items.filter((item) => isItemLiableForDebtor(item, payerDebtorId));
  if (scoped.length === 0) throw new PayerLiabilityScopeError('PAYER_NOT_LIABLE_FOR_ANY_ITEM');
  return scoped;
}
