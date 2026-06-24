/**
 * WP-4e-1 — CaseController.delete Phase 3 hard guard (gerçek 403).
 * Non-ADMIN → 403 (silme ÇAĞRILMAZ) + PERMISSION_DENIED audit. ADMIN → mevcut silme davranışı AYNEN.
 * Gerçek PermissionHardGuardService + mock AuditService + mock CaseService ile uçtan uca.
 */

import { ForbiddenException } from "@nestjs/common";
import { CaseController } from "../case.controller";
import { PermissionHardGuardService } from "../../permission-diagnostics/permission-hard-guard.service";

function mk() {
  const caseService = { delete: jest.fn().mockResolvedValue({ success: true, deleted: true }) };
  const audit = { log: jest.fn().mockResolvedValue(undefined) };
  const hardGuard = new PermissionHardGuardService(audit as any);
  const controller = new CaseController(
    caseService as any,
    {} as any, // ocrService
    {} as any, // responsibleCandidatesService
    {} as any, // temporalResponsibilityService
    {} as any, // warnOnlyAudit (delete'te kullanılmaz)
    hardGuard,
  );
  return { controller, caseService, audit };
}

describe("WP-4e-1 CaseController.delete hard guard", () => {
  it("(1+2) non-ADMIN DELETE → 403; caseService.delete ÇAĞRILMAZ; PERMISSION_DENIED audit yazılır", async () => {
    const { controller, caseService, audit } = mk();
    await expect(controller.delete("t1", "u1", "USER", "case-9")).rejects.toBeInstanceOf(ForbiddenException);
    expect(caseService.delete).not.toHaveBeenCalled();
    expect(audit.log).toHaveBeenCalledTimes(1);
    expect((audit.log as jest.Mock).mock.calls[0][0].action).toBe("PERMISSION_DENIED");
  });

  it("(3+4+8) ADMIN DELETE → mevcut silme davranışı AYNEN; PERMISSION_DENIED audit YAZILMAZ", async () => {
    const { controller, caseService, audit } = mk();
    const res = await controller.delete("t1", "admin1", "ADMIN", "case-9");
    expect(caseService.delete).toHaveBeenCalledWith("t1", "case-9", "admin1");
    expect(res).toMatchObject({ success: true, deleted: true }); // response success path değişmez
    expect(audit.log).not.toHaveBeenCalled();
  });

  it("(5) tenant izolasyonu korunur: ADMIN silmede tenantId aynen service'e geçer", async () => {
    const { controller, caseService } = mk();
    await controller.delete("tenant-X", "admin1", "ADMIN", "c1");
    expect(caseService.delete).toHaveBeenCalledWith("tenant-X", "c1", "admin1");
  });

  it("(7) non-ADMIN'de audit yazımı başarısız olsa bile 403 KORUNUR (best-effort)", async () => {
    const caseService = { delete: jest.fn() };
    const audit = { log: jest.fn().mockRejectedValue(new Error("db down")) };
    const hardGuard = new PermissionHardGuardService(audit as any);
    const controller = new CaseController(caseService as any, {} as any, {} as any, {} as any, {} as any, hardGuard);
    await expect(controller.delete("t1", "u1", "USER", "c1")).rejects.toBeInstanceOf(ForbiddenException);
    expect(caseService.delete).not.toHaveBeenCalled();
  });
});
