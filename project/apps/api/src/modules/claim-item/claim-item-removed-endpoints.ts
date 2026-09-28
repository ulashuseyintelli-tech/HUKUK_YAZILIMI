import { GoneException } from '@nestjs/common';

/**
 * Kaldırılmış ClaimItem işlevleri için sabit hata sözleşmesi (owner GO 2026-09-28, seçenek B).
 *
 * `POST /claim-items/case/:caseId/add-interest` ve `.../recalculate-interest` 2026-01-15'ten (51f704c9) beri hiçbir
 * şey yazmıyor, düz `Error` fırlatıp 500 dönüyordu. İşlev geri getirilmez; rota korunur ve kontrollü 410 döner.
 * Bu bir onay/oluşum akışı DEĞİLDİR — bilinçli olarak FORMATION_CONTEXT_REQUIRED kullanılmaz.
 */
export const CLAIM_ITEM_ENDPOINT_REMOVED_CODE = 'CLAIM_ITEM_ENDPOINT_REMOVED';
export const CLAIM_ITEM_ADD_INTEREST_REMOVED_MESSAGE =
  'Faiz kalemi ekleme işlevi kaldırıldı; bu uç alacak kalemi yazmaz. Faiz hesabı interest-engine üzerindedir.';
export const CLAIM_ITEM_RECALCULATE_INTEREST_REMOVED_MESSAGE =
  'Faiz yeniden hesaplama işlevi kaldırıldı; bu uç alacak kalemi yazmaz. Faiz hesabı interest-engine üzerindedir.';

export function throwClaimItemEndpointRemoved(message: string): never {
  throw new GoneException({ code: CLAIM_ITEM_ENDPOINT_REMOVED_CODE, message });
}
