/**
 * A2 (owner kararı 2026-10-03, seçenek b) — dosya avukat çekmecesi ("Bu dosya için kaydet") PATCH payload'ı:
 * YALNIZ çekmece açıldığından beri DEĞİŞEN alanlar.
 *
 * Sunucu (K2, #2821) casePermissions / canSign alanının gövdede BULUNMASINA bakar; değeri değişmese de gönderilen
 * yetki alanı ofis yönetim yetkisi ister. Eski çekmece rol, imza yetkisi, yetkiler ve bildirimi her kayıtta
 * gönderdiği için yönetim yetkisi olmayan kullanıcının yalnız bildirim ya da rol değişikliği de 403 alıyordu.
 * Sunucu kuralı GEVŞETİLMEZ: gerçekten değiştirilen yetki alanı yine yönetim yetkisi ister. Rol değişince
 * çekmece yetkileri rol varsayılanına çeker; varsayılan mevcut yetkilerden farklıysa bu bir yetki değişikliğidir.
 */

import type { ApiHttpError } from '@/lib/api-error';

// A adayı (R27) uyarlaması: main'deki `@/lib/case-lawyer-permissions` (K3 kararı A, d71333d6) R27'de yok ve adaya
// alınmadı. Yedi yetki anahtarı ile çekmece biçimi burada tanımlanır; R27 çekmecesinin `lawyerPermissions` durumuyla
// aynı biçimdir. Gönderilen gövde ve karşılaştırma kuralı main ile aynıdır.
const CASE_LAWYER_PERMISSION_DISPLAY_KEYS = [
  'canEditCase',
  'canGenerateDocs',
  'canSyncUYAP',
  'canViewFinance',
  'canEditFinance',
  'canChangeStatus',
  'canEditParties',
] as const;

type CaseLawyerDisplayPermissions = Record<(typeof CASE_LAWYER_PERMISSION_DISPLAY_KEYS)[number], boolean> & {
  receivesNotifications: boolean;
};

export type CaseLawyerCaseRole = 'RESPONSIBLE' | 'ASSIGNED' | 'ASSISTANT' | 'INTERN';

/** Çekmecenin "Bu dosya için kaydet" ile yazılan alanları (açılış anındaki ve güncel hâl aynı biçimde tutulur). */
export interface CaseLawyerEditState {
  caseRole?: CaseLawyerCaseRole;
  canSign?: boolean | null;
  permissions: CaseLawyerDisplayPermissions;
}

export interface CaseLawyerPatchPayload {
  role?: Exclude<CaseLawyerCaseRole, 'RESPONSIBLE'>;
  canSign?: boolean;
  casePermissions?: CaseLawyerDisplayPermissions;
  receiveNotifications?: boolean;
}

/// <remarks>
/// Çağrıldığı yerler:
/// - cases/[id]/page.tsx → handleSaveCasePermissions (avukat çekmecesi yetki sekmesi)
/// </remarks>
export function buildCaseLawyerPatch(initial: CaseLawyerEditState, current: CaseLawyerEditState): CaseLawyerPatchPayload {
  const patch: CaseLawyerPatchPayload = {};
  // WP-1d-5-6: hukuki sorumlu ekseni yalnız kanonik uçtan değişir; RESPONSIBLE bu yoldan hiçbir durumda gönderilmez.
  const initialRole = initial.caseRole ?? 'ASSIGNED';
  const currentRole = current.caseRole ?? 'ASSIGNED';
  if (currentRole !== initialRole && currentRole !== 'RESPONSIBLE' && initialRole !== 'RESPONSIBLE') {
    patch.role = currentRole;
  }
  if (!!current.canSign !== !!initial.canSign) patch.canSign = !!current.canSign;
  // Bildirim tercihi yetki SAYILMAZ (sunucuda ayrı alan): yetki karşılaştırması yalnız yedi yetki anahtarına bakar.
  if (CASE_LAWYER_PERMISSION_DISPLAY_KEYS.some((key) => !!current.permissions[key] !== !!initial.permissions[key])) {
    patch.casePermissions = { ...current.permissions };
  }
  if (!!current.permissions.receivesNotifications !== !!initial.permissions.receivesNotifications) {
    patch.receiveNotifications = !!current.permissions.receivesNotifications;
  }
  return patch;
}

export const CASE_PERMISSION_GRANT_FORBIDDEN = 'CASE_PERMISSION_GRANT_FORBIDDEN';

/// <remarks>
/// Çağrıldığı yerler:
/// - cases/[id]/page.tsx → handleSaveCasePermissions ve personel çekmecesi kaydı
/// </remarks>
export function caseAssignmentSaveErrorMessage(error: unknown, fallback: string): string {
  const body = (error as ApiHttpError | null | undefined)?.body;
  const code = body && typeof body === 'object' ? (body as { code?: unknown }).code : undefined;
  if (code === CASE_PERMISSION_GRANT_FORBIDDEN) {
    return 'Dosya yetkilerini yalnız ofis yönetimi değiştirebilir (ADMIN, ortak, yönetici ya da yetkilendirilmiş avukat). Yetki alanlarını eski hâlinde bırakarak rol ve bildirim değişikliklerini kaydedebilirsiniz.';
  }
  return fallback;
}
