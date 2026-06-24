/**
 * WP-4d-2 — ReportController warn-only audit (Phase 2; BLOCK YOK).
 * dashboard + exportCases başarılı çağrıda PERMISSION_WOULD_DENY audit yazar; response AYNEN döner;
 * best-effort (audit hatası endpoint'i kırmaz). Gerçek WarnOnlyAuditService + mock AuditService ile uçtan uca.
 */

import { ReportController } from "../report.controller";
import { WarnOnlyAuditService } from "../../permission-diagnostics/warn-only-audit.service";

function mk(auditOverride?: { log: jest.Mock }) {
  const service = {
    getDashboardStats: jest.fn().mockResolvedValue({ totalCases: 5 }),
    exportCasesAsCsv: jest.fn().mockResolvedValue("col1,col2\n1,2"),
  };
  const audit = auditOverride ?? { log: jest.fn().mockResolvedValue(undefined) };
  const warn = new WarnOnlyAuditService(audit as any);
  const controller = new ReportController(service as any, warn);
  return { controller, service, audit };
}

describe("WP-4d-2 ReportController warn-only", () => {
  it("(1+2+5) dashboard → response DEĞİŞMEZ + PERMISSION_WOULD_DENY (reports.view/OFFICE/TENANT_ONLY)", async () => {
    const { controller, service, audit } = mk();
    const res = await controller.getDashboard("t1", "u1");
    expect(res).toEqual({ success: true, data: { totalCases: 5 } }); // response aynen
    expect(service.getDashboardStats).toHaveBeenCalledWith("t1");
    expect(audit.log).toHaveBeenCalledTimes(1);
    const arg = (audit.log as jest.Mock).mock.calls[0][0];
    expect(arg.action).toBe("PERMISSION_WOULD_DENY");
    expect(arg.entityType).toBe("PERMISSION");
    expect(arg.userId).toBe("u1");
    expect(arg.metadata).toMatchObject({
      operation: "reports.dashboard",
      requiredPermission: "reports.view",
      requiredScope: "OFFICE",
      currentGuard: "TENANT_ONLY",
      enforcementPhase: "PHASE_2_WARN_ONLY",
      allowedByCurrentBehavior: true,
      wouldBeRestrictedUnderRbac: true,
      requestPath: "/reports/dashboard",
    });
  });

  it("(3+4+5) exportCases → response DEĞİŞMEZ + PERMISSION_WOULD_DENY (reports.export/OFFICE)", async () => {
    const { controller, service, audit } = mk();
    const res = await controller.exportCases("t1", "u1");
    expect(res).toMatchObject({ success: true, data: "col1,col2\n1,2", contentType: "text/csv" });
    expect(service.exportCasesAsCsv).toHaveBeenCalled();
    const arg = (audit.log as jest.Mock).mock.calls[0][0];
    expect(arg.metadata).toMatchObject({
      operation: "reports.exportCases",
      requiredPermission: "reports.export",
      requiredScope: "OFFICE",
      currentGuard: "TENANT_ONLY",
      requestPath: "/reports/export/cases",
    });
  });

  it("(6) audit failure endpoint'i KIRMAZ (best-effort): dashboard yine response döner", async () => {
    const audit = { log: jest.fn().mockRejectedValue(new Error("db down")) };
    const { controller } = mk(audit);
    const res = await controller.getDashboard("t1", "u1");
    expect(res).toEqual({ success: true, data: { totalCases: 5 } });
  });

  it("(7+8) existing davranış korunur; non-admin user da kullanabilir (hard deny yok)", async () => {
    const { controller, audit } = mk();
    const res = await controller.getDashboard("t1", "non-admin-user");
    expect(res.success).toBe(true);
    expect(audit.log).toHaveBeenCalledTimes(1); // warn-only emit, ama block yok
  });
});
