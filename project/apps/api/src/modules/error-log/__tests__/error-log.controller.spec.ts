import "reflect-metadata";
import { ErrorLogController } from "../error-log.controller";
import { AdminGuard } from "../../auth/guards/admin.guard";

// NestJS @UseGuards metadata anahtarı (stabil: GUARDS_METADATA).
const GUARDS_METADATA = "__guards__";
function methodGuards(method: string): any[] {
  return Reflect.getMetadata(GUARDS_METADATA, (ErrorLogController.prototype as any)[method]) || [];
}

describe("ErrorLogController — RBAC wiring (yalnız ADMIN okur)", () => {
  it("GET list, GET stats, POST resolve → AdminGuard ile korunur", () => {
    expect(methodGuards("getLogs")).toContain(AdminGuard);
    expect(methodGuards("getStats")).toContain(AdminGuard);
    expect(methodGuards("resolve")).toContain(AdminGuard);
  });
  it("POST /log → AdminGuard ile KORUNMAZ (authenticated frontend endpoint'i)", () => {
    expect(methodGuards("logError")).not.toContain(AdminGuard);
  });
});

describe("AdminGuard — rol kapısı davranışı", () => {
  const guard = new AdminGuard();
  const ctx = (role?: string) =>
    ({
      switchToHttp: () => ({ getRequest: () => ({ user: role ? { role } : undefined }) }),
    }) as any;

  it("ADMIN geçer", () => expect(guard.canActivate(ctx("ADMIN"))).toBe(true));
  it("USER reddedilir", () => expect(() => guard.canActivate(ctx("USER"))).toThrow());
  it("VIEWER reddedilir", () => expect(() => guard.canActivate(ctx("VIEWER"))).toThrow());
  it("rol yok → reddedilir", () => expect(() => guard.canActivate(ctx())).toThrow());
});

describe("ErrorLogController.resolve — resolvedBy spoof engeli", () => {
  it("body.userId verilse bile resolvedBy = req.user.id", async () => {
    const svc = { resolve: jest.fn().mockResolvedValue({}) } as any;
    const c = new ErrorLogController(svc);
    await c.resolve(
      "log1",
      { user: { id: "admin-real", tenantId: "t1" } },
      { resolution: "fixed", userId: "attacker" } as any,
    );
    expect(svc.resolve).toHaveBeenCalledWith("log1", "admin-real", "fixed");
  });
});

describe("ErrorLogController.logError — source/tenant spoof engeli", () => {
  it("body.source=UYAP + body.tenantId=evil + level=INFO → FRONTEND/auth-tenant/WARN", async () => {
    const svc = { log: jest.fn().mockResolvedValue({}) } as any;
    const c = new ErrorLogController(svc);
    await c.logError(
      { user: { id: "u1", tenantId: "t1" } },
      {
        source: "UYAP",
        level: "INFO",
        tenantId: "evil",
        userId: "attacker",
        message: "boom",
        metadata: { authorization: "Bearer s", requestId: "r1" },
      },
    );
    const arg = svc.log.mock.calls[0][0];
    expect(arg.source).toBe("FRONTEND");
    expect(arg.tenantId).toBe("t1");
    expect(arg.userId).toBe("u1");
    expect(arg.level).toBe("WARN");
    expect(arg.metadata).toEqual({ requestId: "r1" });
    expect(arg.metadata.authorization).toBeUndefined();
  });
});
