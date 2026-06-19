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

/**
 * Drawer state → PATCH /cases/:id/staff/:caseStaffId payload.
 * YALNIZ CaseStaff alanları; canSign / permissions GÖNDERİLMEZ (backend 3a zaten ignore ediyordu).
 */
export function buildCaseStaffPatch(s: {
  roleOnCase?: string;
  canEdit?: boolean;
  canApprove?: boolean;
  canView?: boolean;
  receiveNotifications?: boolean;
}): CaseStaffPatchPayload {
  return {
    roleOnCase: s.roleOnCase,
    canEdit: s.canEdit,
    canApprove: s.canApprove,
    canView: s.canView,
    receiveNotifications: s.receiveNotifications,
  };
}
