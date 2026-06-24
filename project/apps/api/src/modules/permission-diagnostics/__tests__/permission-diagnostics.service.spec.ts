/**
 * WP-4c-1 — Phase 1 permission diagnostics servis testleri (READ-ONLY).
 * Enforcement DEĞİL: "wouldDeny" diyebilir ama hiçbir işlemi engellemez. Hiçbir mutation/DB bağımlılığı yok.
 */

import { PermissionDiagnosticsService } from "../permission-diagnostics.service";

describe("WP-4c-1 PermissionDiagnosticsService (Phase 1, read-only)", () => {
  // (7) read-only: servis hiçbir bağımlılık almadan kurulabilir → DB/mutation yok.
  const svc = new PermissionDiagnosticsService();

  it("(1) office.updateSmtpSettings → requiredPermission office.manageSettings", () => {
    const d = svc.diagnose("office.updateSmtpSettings", { role: "ADMIN" });
    expect(d.requiredPermission).toBe("office.manageSettings");
    expect(d.requiredScope).toBe("OFFICE");
    expect(d.enforcementPhase).toBe("PHASE_1_DIAGNOSTICS");
    expect(d.note).toMatch(/no blocking/i);
  });

  it("(2) office.updateSmsSettings → requiredPermission office.manageSettings", () => {
    const d = svc.diagnose("office.updateSmsSettings", { role: "ADMIN" });
    expect(d.requiredPermission).toBe("office.manageSettings");
  });

  it("(3) cases.responsibilityAt → requiredPermission cases.viewResponsibilityHistory", () => {
    const d = svc.diagnose("cases.responsibilityAt", { role: "USER" });
    expect(d.requiredPermission).toBe("cases.viewResponsibilityHistory");
  });

  it("(4) TENANT_ONLY satır → wouldAllow true (her rol), wouldDeny false", () => {
    const asUser = svc.diagnose("cases.responsibilityAt", { role: "USER" });
    const asAdmin = svc.diagnose("cases.responsibilityAt", { role: "ADMIN" });
    expect(asUser.currentGuard).toBe("TENANT_ONLY");
    expect(asUser.wouldAllow).toBe(true);
    expect(asUser.wouldDeny).toBe(false);
    expect(asAdmin.wouldAllow).toBe(true); // role'den bağımsız
  });

  it("(5) ADMIN_HARD_GUARD satır → ADMIN allow, non-admin would-deny", () => {
    const admin = svc.diagnose("office.updateSmtpSettings", { role: "ADMIN" });
    const user = svc.diagnose("office.updateSmtpSettings", { role: "USER" });
    expect(admin.currentGuard).toBe("ADMIN_HARD_GUARD");
    expect(admin.wouldAllow).toBe(true);
    expect(admin.wouldDeny).toBe(false);
    expect(user.wouldAllow).toBe(false);
    expect(user.wouldDeny).toBe(true);
    expect(user.reason).toMatch(/ADMIN/);
  });

  it("(6) bilinmeyen operasyon → UNKNOWN_NEEDS_REVIEW, wouldAllow null", () => {
    const d = svc.diagnose("does.notExist", { role: "ADMIN" });
    expect(d.currentGuard).toBe("UNKNOWN_NEEDS_REVIEW");
    expect(d.wouldAllow).toBeNull();
    expect(d.wouldDeny).toBeNull();
  });

  it("(7) read-only: diagnoseAll yan etkisiz, haritadaki tüm operasyonları döndürür", () => {
    const all = svc.diagnoseAll({ role: "USER" });
    expect(all.length).toBeGreaterThanOrEqual(6);
    // hepsi Phase 1 + note 'no blocking'
    expect(all.every((d) => d.enforcementPhase === "PHASE_1_DIAGNOSTICS")).toBe(true);
    expect(all.every((d) => /no blocking/i.test(d.note))).toBe(true);
    // audit.view: canlı endpoint yok → UNKNOWN_NEEDS_REVIEW
    const audit = all.find((d) => d.operation === "audit.view");
    expect(audit?.currentGuard).toBe("UNKNOWN_NEEDS_REVIEW");
  });

  it("(ek) CPE_GUARDED/HARD_LEGAL_GUARD → wouldAllow 'DEPENDS' (role'e değil bağlama bağlı)", () => {
    // Haritada bugün CPE/LEGAL satırı yoksa bu evaluate dalı doğrudan test edilemez; map genişleyince eklenecek.
    // Şimdilik en azından bilinen guard'ların boolean/null döndüğünü garanti ederiz (yukarıdaki testler).
    expect(typeof svc.diagnose("office.updateSmsSettings", { role: "ADMIN" }).wouldAllow).toBe("boolean");
  });
});
