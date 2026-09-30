/**
 * Dosya avukat yetkilerinin GÖSTERİMİ — sunucunun gerçek kararıyla aynı (K3 kararı A, owner GO 2026-09-30).
 *
 * Sunucu yalnız dosyadaki `CaseLawyer.casePermissions` değerine bakar; anahtar `=== true` değilse izin YOKTUR
 * (bkz. API ClaimItemWriteGateService.resolveObjectPermission). Avukatın büro varsayılanı (`Lawyer.defaultPermissions`)
 * çalışma anında dosya yetkisi SAYILMAZ — yalnız dosya açılışında, yönetimce açıkça belirlenmişse anlık kopya olarak
 * dosyaya yazılır. Önceki gösterim boş yetkiyi büro varsayılanına, o da yoksa "tümü açık"a düşürüyordu; bu hâliyle
 * kaydedilen çekmece sessizce TÜM yetkileri veriyordu.
 */

export const CASE_LAWYER_PERMISSION_DISPLAY_KEYS = [
  'canEditCase',
  'canGenerateDocs',
  'canSyncUYAP',
  'canViewFinance',
  'canEditFinance',
  'canChangeStatus',
  'canEditParties',
] as const;

export type CaseLawyerDisplayPermissions = Record<(typeof CASE_LAWYER_PERMISSION_DISPLAY_KEYS)[number], boolean> & {
  receivesNotifications: boolean;
};

/// <remarks>
/// Çağrıldığı yerler:
/// - cases/[id]/page.tsx → handleLawyerClick (avukat çekmecesi yetki sekmesi)
/// </remarks>
export function caseLawyerPermissionsForDisplay(
  stored: unknown,
  receivesNotifications: boolean | null | undefined,
): { permissions: CaseLawyerDisplayPermissions; defined: boolean } {
  const record =
    stored && typeof stored === 'object' && !Array.isArray(stored) ? (stored as Record<string, unknown>) : {};
  const permissions = { receivesNotifications: receivesNotifications ?? true } as CaseLawyerDisplayPermissions;
  let defined = false;
  for (const key of CASE_LAWYER_PERMISSION_DISPLAY_KEYS) {
    permissions[key] = record[key] === true;
    if (typeof record[key] === 'boolean') defined = true;
  }
  return { permissions, defined };
}
