/**
 * WP-4d-1 — WarnOnlyAuditService testleri (Phase 2 warn-only; BLOCK YOK).
 * Seçili tenant-only op için PERMISSION_WOULD_DENY audit'i yazar; best-effort; hard/legal/CPE op'ları atlar.
 */

import { WarnOnlyAuditService } from "../warn-only-audit.service";

const mkAudit = () => ({ log: jest.fn().mockResolvedValue(undefined) });

describe("WP-4d-1 WarnOnlyAuditService", () => {
  it("(1+2+5) cases.responsibilityAt → PERMISSION_WOULD_DENY doğru payload (tenant/actor/perm/scope/guard/phase)", async () => {
    const audit = mkAudit();
    const svc = new WarnOnlyAuditService(audit as any);
    await svc.recordWouldDeny("cases.responsibilityAt", {
      tenantId: "t1",
      actorUserId: "u1",
      entityId: "case-9",
      requestPath: "/cases/:id/responsibility-at",
    });
    expect(audit.log).toHaveBeenCalledTimes(1);
    const arg = audit.log.mock.calls[0][0];
    expect(arg.action).toBe("PERMISSION_WOULD_DENY");
    expect(arg.entityType).toBe("PERMISSION");
    expect(arg.tenantId).toBe("t1");
    expect(arg.userId).toBe("u1");
    expect(arg.entityId).toBe("case-9");
    expect(arg.metadata).toMatchObject({
      event: "PERMISSION_WOULD_DENY",
      operation: "cases.responsibilityAt",
      requiredPermission: "cases.viewResponsibilityHistory",
      requiredScope: "OFFICE",
      currentGuard: "TENANT_ONLY",
      enforcementPhase: "PHASE_2_WARN_ONLY",
      allowedByCurrentBehavior: true,
      wouldBeRestrictedUnderRbac: true,
      requestPath: "/cases/:id/responsibility-at",
    });
    expect(arg.metadata.note).toMatch(/not blocked/i);
  });

  it("(4) audit.log throw etse bile recordWouldDeny THROW ETMEZ (best-effort)", async () => {
    const audit = { log: jest.fn().mockRejectedValue(new Error("db down")) };
    const svc = new WarnOnlyAuditService(audit as any);
    await expect(
      svc.recordWouldDeny("cases.responsibilityAt", { tenantId: "t1", requestPath: "/x" }),
    ).resolves.toBeUndefined();
    expect(audit.log).toHaveBeenCalledTimes(1);
  });

  it("(kapsam) ADMIN_HARD_GUARD op (office.updateSmtpSettings) → event YAZILMAZ (zaten sert)", async () => {
    const audit = mkAudit();
    const svc = new WarnOnlyAuditService(audit as any);
    await svc.recordWouldDeny("office.updateSmtpSettings", { tenantId: "t1", requestPath: "/x" });
    expect(audit.log).not.toHaveBeenCalled();
  });

  it("(kapsam) haritada olmayan op → event YAZILMAZ", async () => {
    const audit = mkAudit();
    const svc = new WarnOnlyAuditService(audit as any);
    await svc.recordWouldDeny("does.notExist", { tenantId: "t1", requestPath: "/x" });
    expect(audit.log).not.toHaveBeenCalled();
  });

  it("(varsayılan) actorUserId yoksa userId undefined, metadata.actorUserId null", async () => {
    const audit = mkAudit();
    const svc = new WarnOnlyAuditService(audit as any);
    await svc.recordWouldDeny("cases.responsibilityAt", { tenantId: "t1", requestPath: "/x" });
    const arg = audit.log.mock.calls[0][0];
    expect(arg.userId).toBeUndefined();
    expect(arg.metadata.actorUserId).toBeNull();
    expect(arg.entityId).toBe("cases.responsibilityAt"); // entityId yoksa operation string'i
  });
});
