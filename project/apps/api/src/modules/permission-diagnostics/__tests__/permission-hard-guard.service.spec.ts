/**
 * WP-4e-1 — PermissionHardGuardService bridge guard testleri (Phase 3; gerçek 403).
 * ADMIN → izinli; non-ADMIN → 403 + PERMISSION_DENIED audit. Audit best-effort (hata 403'ü korur, 500 yapmaz).
 * cases.delete diagnostics map'te DEĞİL → fallback ile payload üretilir (operation/OFFICE/TENANT_ONLY).
 */

import { ForbiddenException } from "@nestjs/common";
import { PermissionHardGuardService } from "../permission-hard-guard.service";

const mkAudit = () => ({ log: jest.fn().mockResolvedValue(undefined) });

describe("WP-4e-1 PermissionHardGuardService (cases.delete bridge guard)", () => {
  it("(3+4) ADMIN → izinli; throw YOK, PERMISSION_DENIED audit YAZILMAZ", async () => {
    const audit = mkAudit();
    const svc = new PermissionHardGuardService(audit as any);
    await expect(
      svc.assertBridgeAdmin("cases.delete", { tenantId: "t1", actorUserId: "admin1", role: "ADMIN", entityId: "c1", requestPath: "/cases/:id" }),
    ).resolves.toBeUndefined();
    expect(audit.log).not.toHaveBeenCalled();
  });

  it("(1+2) non-ADMIN → ForbiddenException + PERMISSION_DENIED audit (doğru payload)", async () => {
    const audit = mkAudit();
    const svc = new PermissionHardGuardService(audit as any);
    await expect(
      svc.assertBridgeAdmin("cases.delete", { tenantId: "t1", actorUserId: "u1", role: "USER", entityId: "case-9", requestPath: "/cases/:id" }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(audit.log).toHaveBeenCalledTimes(1);
    const arg = (audit.log as jest.Mock).mock.calls[0][0];
    expect(arg.action).toBe("PERMISSION_DENIED");
    expect(arg.entityType).toBe("PERMISSION");
    expect(arg.userId).toBe("u1");
    expect(arg.entityId).toBe("case-9");
    expect(arg.metadata).toMatchObject({
      event: "PERMISSION_DENIED",
      operation: "cases.delete",
      requiredPermission: "cases.delete",
      requiredScope: "OFFICE",
      currentGuard: "TENANT_ONLY",
      enforcementPhase: "PHASE_3_HARD_ENFORCE",
      requestPath: "/cases/:id",
      bridgeGuard: "ADMIN_ONLY",
    });
    expect(arg.metadata.reason).toMatch(/bridge authority for cases\.delete/);
  });

  it("(7) audit.log throw etse bile 403 KORUNUR (best-effort; 500 olmaz)", async () => {
    const audit = { log: jest.fn().mockRejectedValue(new Error("db down")) };
    const svc = new PermissionHardGuardService(audit as any);
    await expect(
      svc.assertBridgeAdmin("cases.delete", { tenantId: "t1", role: "USER", requestPath: "/x" }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("VIEWER / undefined rol da non-ADMIN sayılır → 403", async () => {
    const svc = new PermissionHardGuardService(mkAudit() as any);
    await expect(svc.assertBridgeAdmin("cases.delete", { tenantId: "t1", role: "VIEWER", requestPath: "/x" })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(svc.assertBridgeAdmin("cases.delete", { tenantId: "t1", requestPath: "/x" })).rejects.toBeInstanceOf(ForbiddenException);
  });
});
