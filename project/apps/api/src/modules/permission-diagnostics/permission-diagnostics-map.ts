// WP-4c-1 — Phase 1 permission diagnostics (READ-ONLY).
// WP-4c-0 envanterindeki seçili yüksek-riskli operasyonları permission leaf + scope + mevcut guard'a eşler.
// Bu HARİTA enforcement DEĞİLDİR; yalnız "bu işlem ileride hangi izni gerektirecek + bugün neyle korunuyor"
// sorusunu cevaplamak içindir. Hiçbir işlem engellenmez. Kapsam dar tutuldu (smtp/sms + birkaç örnek).

export type CurrentGuard =
  | "ADMIN_HARD_GUARD"
  | "TENANT_ONLY"
  | "CPE_GUARDED"
  | "HARD_LEGAL_GUARD_EXISTS"
  | "DECORATIVE_ONLY"
  | "UNKNOWN_NEEDS_REVIEW";

export type PermissionScope = "OWN" | "ASSIGNED" | "TEAM" | "OFFICE" | "ALL" | "N/A";

export interface DiagnosticMapEntry {
  operation: string;
  endpoint: string;
  requiredPermission: string;
  requiredScope: PermissionScope;
  currentGuard: CurrentGuard;
}

// Phase 1 başlangıç kapsamı (dar). Genişletme sonraki PR'lara bırakıldı.
export const PERMISSION_DIAGNOSTICS_MAP: Record<string, DiagnosticMapEntry> = {
  "office.updateSmtpSettings": {
    operation: "office.updateSmtpSettings",
    endpoint: "PUT /office/smtp-settings",
    requiredPermission: "office.manageSettings",
    requiredScope: "OFFICE",
    currentGuard: "ADMIN_HARD_GUARD", // WP-4c-hotfix-1 ile eklendi
  },
  "office.updateSmsSettings": {
    operation: "office.updateSmsSettings",
    endpoint: "PUT /office/sms-settings",
    requiredPermission: "office.manageSettings",
    requiredScope: "OFFICE",
    currentGuard: "ADMIN_HARD_GUARD",
  },
  "cases.responsibilityAt": {
    operation: "cases.responsibilityAt",
    endpoint: "GET /cases/:id/responsibility-at",
    requiredPermission: "cases.viewResponsibilityHistory",
    requiredScope: "OFFICE", // WP-4d-1 kararı: dosya sorumluluk geçmişi ofis-kapsamlı okuma
    currentGuard: "TENANT_ONLY",
  },
  "reports.taskPerformance": {
    operation: "reports.taskPerformance",
    endpoint: "GET /reports/task-performance",
    requiredPermission: "reports.view",
    requiredScope: "OFFICE",
    currentGuard: "ADMIN_HARD_GUARD", // controller'da role==='ADMIN' hardcoded
  },
  "reports.exportCases": {
    operation: "reports.exportCases",
    endpoint: "GET /reports/export/cases",
    requiredPermission: "reports.export",
    requiredScope: "OFFICE",
    currentGuard: "TENANT_ONLY",
  },
  "audit.view": {
    operation: "audit.view",
    endpoint: "(canlı endpoint yok — AuditLog yazılıyor ama kullanıcıya açan GET ucu mevcut değil)",
    requiredPermission: "audit.view",
    requiredScope: "OFFICE",
    currentGuard: "UNKNOWN_NEEDS_REVIEW",
  },
};
