/**
 * PR-1.2 — "Bildirim/dağıtım hazırlama" yetkisinin TEK KANONİK PREDİKATI.
 *
 * Kural (değişmedi): bağlı avukat, VEYA `MUHASEBE` tipinde ve
 * `canPrepareCollectionDisposition` verilmiş personel.
 *
 * Bu predikat daha önce yalnız `DispositionPostingService.isPrepareEligible()`
 * içindeydi. X1 ofis projeksiyonunun `canCreateFinancialDisclosure` bayrağını
 * SUNUCU TARAFINDA hesaplayabilmesi için buraya çıkarıldı; iki yerde ayrı ayrı
 * yazılmaz. Enforcement hâlâ backend'dedir — bayrak yalnız UI görünürlüğü içindir
 * ve nihai yetki kararı DEĞİLDİR.
 */
export interface PrepareEligibilityUser {
  readonly isActive: boolean;
  readonly tenantId: string;
  readonly lawyer: { readonly id: string } | null;
  readonly staffMember: {
    readonly staffType: string | null;
    readonly canPrepareCollectionDisposition: boolean | null;
  } | null;
}

/** Prisma `include` şekli — DispositionPostingService bunu kullanır. */
export const PREPARE_ELIGIBILITY_INCLUDE = {
  lawyer: { select: { id: true } },
  staffMember: { select: { staffType: true, canPrepareCollectionDisposition: true } },
} as const;

/**
 * Prisma `select` şekli — office projeksiyonu aktörü ZATEN okuduğu için bu parça
 * mevcut select'e eklenir; ikinci sorgu açılmaz.
 */
export const PREPARE_ELIGIBILITY_SELECT = {
  lawyer: { select: { id: true, lawyerRank: true, canApproveOfficeActions: true } },
  staffMember: { select: { staffType: true, canPrepareCollectionDisposition: true } },
} as const;

export function isPrepareEligibleUser(
  user: PrepareEligibilityUser | null | undefined,
  tenantId: string,
): boolean {
  if (!user || !user.isActive || user.tenantId !== tenantId) return false;
  if (user.lawyer) return true;
  return (
    !!user.staffMember &&
    user.staffMember.staffType === 'MUHASEBE' &&
    user.staffMember.canPrepareCollectionDisposition === true
  );
}
