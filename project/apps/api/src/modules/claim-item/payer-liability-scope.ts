import { BadRequestException } from '@nestjs/common';

/**
 * K3-L — tahsilatın mahsup kapsamı, HESABINA (ADINA) ödeme yapılan borçluya göre.
 *
 * Kimlikler AYRIDIR (owner kararı 2026-09-29): parayı gönderen kişi, hesabına ödeme yapılan borçlu (`Collection.
 * caseDebtorId` → Debtor.id) ve tahsilatı ileten icra dairesi birbirine DÖNÜŞTÜRÜLMEZ. Kalem bazlı sorumluluk
 * (`ClaimItem.isAllDebtorsLiable` / `liableDebtorIds`): bir borçlu hesabına yapılan tahsilat YALNIZ o borçlunun sorumlu
 * olduğu kalemlere mahsup edilir (ciranta hesabına ödeme keşideciye ait çek tazminatını kapatamaz). Tüm kalemleri tüm
 * borçlulara açık dosyada davranış DEĞİŞMEZ.
 *
 * Gerçekleşmiş tahsilat REDDEDİLMEZ (owner kararı 2026-09-29): hesabına ödeme yapılan borçlu belli değilse veya o borçlunun
 * sorumlu olduğu kalem yoksa tahsilat kaydedilir, otomatik mahsup BEKLETİLİR (`allocationHoldReason`). Mahsup motoru
 * (SummaryEngine) bu kuralı savunma katmanı olarak hata ile uygular; tahsilat yolu mahsubu hiç çağırmaz.
 */
export type PayerLiabilityScopeErrorCode = 'ON_BEHALF_DEBTOR_REQUIRED' | 'ON_BEHALF_DEBTOR_NOT_LIABLE';

const MESSAGES: Record<PayerLiabilityScopeErrorCode, string> = {
  ON_BEHALF_DEBTOR_REQUIRED:
    'Bu dosyada yalnız bazı borçlulara ait alacak kalemi var; tahsilatın hangi borçlu hesabına yapıldığı belirtilmeden mahsup yapılamaz.',
  ON_BEHALF_DEBTOR_NOT_LIABLE: 'Hesabına ödeme yapılan borçlunun sorumlu olduğu etkin alacak kalemi yok; mahsup yapılamaz.',
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
 * ///  - SummaryEngineService.allocatePaymentToLedgerInTx() → kalıcı TBK100 dağıtımı (savunma katmanı)
 * ///  (Önizleme aynı kuralı hasRestrictedLiability / isItemLiableForDebtor ile uygular — CasePaymentPreviewService.preview())
 * /// </remarks>
 */
export function scopeItemsToPayer<T extends LiabilityScopedItem>(
  items: readonly T[],
  onBehalfDebtorId: string | null | undefined,
): T[] {
  const hold = allocationHoldReason(items, onBehalfDebtorId);
  if (hold) throw new PayerLiabilityScopeError(hold);
  if (!hasRestrictedLiability(items)) return [...items];
  return items.filter((item) => isItemLiableForDebtor(item, onBehalfDebtorId as string));
}

/**
 * Otomatik mahsup bekletilmeli mi? Kısıtlı kalem yoksa ASLA (null). Varsa hesabına ödeme yapılan borçlu yoksa veya o
 * borçlunun sorumlu olduğu kalem yoksa bekletme sebebi.
 *
 * /// <remarks>
 * /// Çağrıldığı yerler:
 * ///  - CollectionService.create() → tahsilat kaydedilir, mahsup bekletilir
 * ///  - scopeItemsToPayer() → aynı karar (savunma katmanı)
 * /// </remarks>
 */
export function allocationHoldReason(
  items: readonly LiabilityScopedItem[],
  onBehalfDebtorId: string | null | undefined,
): PayerLiabilityScopeErrorCode | null {
  if (!hasRestrictedLiability(items)) return null;
  if (!onBehalfDebtorId) return 'ON_BEHALF_DEBTOR_REQUIRED';
  return items.some((item) => isItemLiableForDebtor(item, onBehalfDebtorId)) ? null : 'ON_BEHALF_DEBTOR_NOT_LIABLE';
}
