import { BadRequestException } from '@nestjs/common';

/**
 * Vekâlet ücretinin hukuki kaynağı — yapısal ayrım (owner K1, 13.11.2026).
 *
 * - JUDGMENT_AWARDED: ilamda hükmedilen vekâlet ücreti (takibin KONUSU olan alacak).
 * - ENFORCEMENT_TARIFF: takip (icra) vekâlet ücreti (tarifeden doğan takip gideri).
 * - null / yok: BİLİNMİYOR. Açıklama, etiket, kaynak belge türü ya da tutardan ÇIKARIM YAPILMAZ; eski kayıtlar
 *   toplu dönüştürülmez. Değer yalnız açık girdiyle yazılır.
 *
 * Alan YALNIZ itemType=ATTORNEY_FEE kalemde dolu olabilir (DB CHECK kısıtı
 * `ClaimItem_attorneyFeeBasis_itemType_check` ile aynı kural; API burada 400 ile erken reddeder).
 *
 * SAF: DB / prisma yok.
 */
export enum AttorneyFeeBasis {
  JUDGMENT_AWARDED = 'JUDGMENT_AWARDED',
  ENFORCEMENT_TARIFF = 'ENFORCEMENT_TARIFF',
}

export const ATTORNEY_FEE_BASIS_ITEM_TYPE_MISMATCH = 'ATTORNEY_FEE_BASIS_ITEM_TYPE_MISMATCH' as const;

const ATTORNEY_FEE_ITEM_TYPE = 'ATTORNEY_FEE';

/**
 * Kalemin (yazımdan sonraki) etkin türü ile etkin vekâlet ücreti kaynağı uyumlu mu? Uyumsuzsa 400.
 *
 * /// <remarks>
 * /// Çağrıldığı yerler:
 * ///  - ClaimItemService.create() / update() / assertUpdateInvariants() → POST /claim-items, PUT /claim-items/:id
 * ///  - OfficeApprovalDomainSyncService (onaylanan CREATE / UPDATE niyetinin uygulanması)
 * ///  - buildClaimItemData() → POST /cases, POST /cases/historical-import, POST /cases/:id/dues (Due → ClaimItem)
 * /// </remarks>
 */
export function assertAttorneyFeeBasisMatchesItemType(itemType: unknown, attorneyFeeBasis: unknown): void {
  if (attorneyFeeBasis === null || attorneyFeeBasis === undefined) return;
  if (itemType === ATTORNEY_FEE_ITEM_TYPE) return;
  throw new BadRequestException({
    code: ATTORNEY_FEE_BASIS_ITEM_TYPE_MISMATCH,
    message: 'Vekâlet ücreti kaynağı (attorneyFeeBasis) yalnız vekâlet ücreti (ATTORNEY_FEE) kaleminde verilebilir.',
  });
}

/**
 * Yama (patch) + mevcut kayıt → yazımdan sonraki etkin değer. Yamada alan VARSA (null dahil) yama kazanır.
 */
export function effectiveField(
  patch: Record<string, unknown>,
  current: Record<string, unknown> | null | undefined,
  field: string,
): unknown {
  return Object.prototype.hasOwnProperty.call(patch, field) ? patch[field] : current?.[field];
}
