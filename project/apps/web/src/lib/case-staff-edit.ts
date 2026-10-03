/**
 * PR-ASSIGN-3b — Case-detay personel drawer'ını CaseStaff modeline hizalar.
 *
 * CaseStaff yalnız 3 yetki bool'u taşır: canEdit, canApprove, canView (+ roleOnCase, receiveNotifications).
 * Eski drawer lawyer-kopyası `canSign` + `permissions`{5 ince-taneli} kullanıyordu → CaseStaff'ta YOK,
 * persist OLMUYORDU (backend PR-ASSIGN-3a zaten bunları sessizce ignore ediyor). Bu saf helper'lar
 * drawer ↔ CaseStaff eşlemesini test edilebilir tutar; canSign/permissions tamamen kaldırılır.
 */
export interface CaseStaffEditFields {
  roleOnCase: string;
  canEdit: boolean;
  canApprove: boolean;
  canView: boolean;
  receiveNotifications: boolean;
}

/** getCaseStaff satırının düzenlenebilir alanlarını drawer state'ine çıkar (CaseStaff model default'larıyla). */
export function caseStaffEditFields(se: {
  roleOnCase?: string | null;
  canEdit?: boolean;
  canApprove?: boolean;
  canView?: boolean;
  receiveNotifications?: boolean;
}): CaseStaffEditFields {
  return {
    roleOnCase: se.roleOnCase ?? '',
    canEdit: se.canEdit ?? false,
    canApprove: se.canApprove ?? false,
    canView: se.canView ?? true, // CaseStaff.canView model default = true
    receiveNotifications: se.receiveNotifications ?? true,
  };
}

export interface CaseStaffPatchPayload {
  roleOnCase?: string;
  canEdit?: boolean;
  canApprove?: boolean;
  canView?: boolean;
  receiveNotifications?: boolean;
}

const CASE_STAFF_BOOLEAN_KEYS = ['canEdit', 'canApprove', 'canView', 'receiveNotifications'] as const;

/**
 * Drawer state → PATCH /cases/:id/staff/:caseStaffId payload: YALNIZ çekmece açıldığından beri DEĞİŞEN alanlar
 * (A2, owner kararı 2026-10-03 seçenek b).
 *
 * Sunucu (K2, #2821) canEdit / canApprove / canView alanının gövdede BULUNMASINA bakar; değeri değişmese de
 * gönderilen yetki alanı ofis yönetim yetkisi ister. Eski payload beş alanı her kayıtta gönderdiği için yönetim
 * yetkisi olmayan kullanıcının yalnız rol ya da bildirim değişikliği de 403 alıyordu. Sunucu kuralı GEVŞETİLMEZ:
 * gerçekten değiştirilen yetki alanı yine yönetim yetkisi ister.
 * Değişiklik yoksa boş nesne döner; çağıran istek atmaz. canSign / permissions hiçbir durumda GÖNDERİLMEZ.
 */
export function buildCaseStaffPatch(
  initial: CaseStaffEditFields,
  current: {
    roleOnCase?: string;
    canEdit?: boolean;
    canApprove?: boolean;
    canView?: boolean;
    receiveNotifications?: boolean;
  },
): CaseStaffPatchPayload {
  const patch: CaseStaffPatchPayload = {};
  const roleOnCase = current.roleOnCase ?? '';
  if (roleOnCase !== initial.roleOnCase) patch.roleOnCase = roleOnCase;
  for (const key of CASE_STAFF_BOOLEAN_KEYS) {
    const next = current[key];
    if (typeof next === 'boolean' && next !== initial[key]) patch[key] = next;
  }
  return patch;
}
