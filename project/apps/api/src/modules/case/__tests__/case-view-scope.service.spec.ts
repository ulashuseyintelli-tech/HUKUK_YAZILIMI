import { ExecutionContext, ForbiddenException, NotFoundException } from "@nestjs/common";
import { CASE_VIEW_ALL_KEY, CASE_VIEW_SCOPE_FLAG, caseViewScopeWhere } from "../case-view-scope";
import { Reflector } from "@nestjs/core";
import { CASE_VIEW_SCOPE_PARAM, CaseViewScopeGuard, CaseViewScoped } from "../case-view-scope.guard";
import { CaseViewScopeService } from "../case-view-scope.service";

/**
 * F02 P3-D1 / P3-D2 — CaseViewScopeService + CaseViewScopeGuard saf sözleşmesi (DB yok; Prisma ve izin servisi taklit).
 * Bayrak kapalı → hiçbir sorgu, hiçbir ret. Açık → fail-closed 403; kapsam dışı / yok / geçersiz kimlik → aynı 404;
 * artefakt sorgusu artefakt + bağlı dosya kiracısını ve kapsamı birlikte ister.
 */
function build(opts: { resolution?: "ALLOW" | "DENY" | "NONE"; caseFound?: boolean; artifactFound?: boolean; noWorkScope?: boolean } = {}) {
  const prisma = {
    case: { findFirst: jest.fn(async () => (opts.caseFound === false ? null : { id: "c1" })) },
    documentArtifact: { findFirst: jest.fn(async () => (opts.artifactFound === false ? null : { id: "a1" })) },
  };
  const workScope = { resolve: jest.fn(async () => opts.resolution ?? "NONE") };
  const svc = new CaseViewScopeService(prisma as never, opts.noWorkScope ? undefined : (workScope as never));
  return { prisma, workScope, svc };
}
const ctx = (user: unknown, params: Record<string, unknown>) =>
  ({ switchToHttp: () => ({ getRequest: () => ({ user, params }) }) }) as unknown as ExecutionContext;

describe("F02 P3-D2 — CaseViewScopeService / CaseViewScopeGuard (saf)", () => {
  const original = process.env[CASE_VIEW_SCOPE_FLAG];
  afterEach(() => {
    if (original === undefined) delete process.env[CASE_VIEW_SCOPE_FLAG];
    else process.env[CASE_VIEW_SCOPE_FLAG] = original;
  });

  describe("bayrak KAPALI", () => {
    beforeEach(() => delete process.env[CASE_VIEW_SCOPE_FLAG]);

    it("servis ve kapı hiçbir sorgu atmaz, hiçbir şeyi reddetmez (aktör / servis olmasa da)", async () => {
      const { prisma, workScope, svc } = build({ noWorkScope: true });
      await expect(svc.scopeWhere("t1", undefined)).resolves.toBeNull();
      await expect(svc.assertCaseVisible("t1", undefined, undefined)).resolves.toBeUndefined();
      await expect(svc.isArtifactVisible("t1", null, "x")).resolves.toBe(true);
      await expect(new CaseViewScopeGuard(undefined).canActivate(ctx(undefined, {}))).resolves.toBe(true);
      expect(prisma.case.findFirst).not.toHaveBeenCalled();
      expect(prisma.documentArtifact.findFirst).not.toHaveBeenCalled();
      expect(workScope.resolve).not.toHaveBeenCalled();
    });
  });

  describe("bayrak AÇIK", () => {
    beforeEach(() => {
      process.env[CASE_VIEW_SCOPE_FLAG] = "true";
    });

    it.each([
      ["aktör yok", "t1", undefined, false],
      ["kiracı yok", "", "u1", false],
      ["izin servisi yok", "t1", "u1", true],
    ])("FAIL-CLOSED 403 CASE_VIEW_SCOPE_UNRESOLVED: %s; sorgu atılmaz", async (_n, tenant, actor, noWorkScope) => {
      const { prisma, svc } = build({ noWorkScope: noWorkScope as boolean });
      await expect(svc.assertCaseVisible(tenant as string, actor as string | undefined, "c1")).rejects.toMatchObject({ response: { code: "CASE_VIEW_SCOPE_UNRESOLVED" } });
      await expect(svc.isArtifactVisible(tenant as string, actor as string | undefined, "a1")).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.case.findFirst).not.toHaveBeenCalled();
    });

    it("kapı: servis yoksa 403; kiracı ve aktör yalnız kimliği doğrulanmış kullanıcıdan, dosya kimliği yoldan okunur", async () => {
      await expect(new CaseViewScopeGuard(undefined).canActivate(ctx({ id: "u1", tenantId: "t1" }, { caseId: "c1" }))).rejects.toBeInstanceOf(ForbiddenException);
      const { prisma, svc } = build();
      await expect(new CaseViewScopeGuard(svc).canActivate(ctx({ id: "u1", tenantId: "t1" }, { caseId: "c1" }))).resolves.toBe(true);
      expect(prisma.case.findFirst).toHaveBeenCalledWith({ where: { id: "c1", tenantId: "t1", AND: [caseViewScopeWhere("t1", "u1")] }, select: { id: true } });
    });

    it("P3-D3: kapı dosya kimliğini meta verideki parametre adından okur (CaseViewScoped('id')); varsayılan caseId", async () => {
      class Probe {
        @CaseViewScoped("id") byId() {}
        @CaseViewScoped() byCaseId() {}
      }
      expect(Reflect.getMetadata(CASE_VIEW_SCOPE_PARAM, Probe.prototype.byId)).toBe("id");
      const { prisma, svc } = build();
      const guard = new CaseViewScopeGuard(svc, new Reflector());
      const withHandler = (handler: unknown, params: Record<string, unknown>) =>
        ({ getHandler: () => handler, switchToHttp: () => ({ getRequest: () => ({ user: { id: "u1", tenantId: "t1" }, params }) }) }) as unknown as ExecutionContext;
      await guard.canActivate(withHandler(Probe.prototype.byId, { id: "c-id", caseId: "c-other" }));
      expect(prisma.case.findFirst).toHaveBeenNthCalledWith(1, expect.objectContaining({ where: expect.objectContaining({ id: "c-id", tenantId: "t1" }) }));
      await guard.canActivate(withHandler(Probe.prototype.byCaseId, { id: "x", caseId: "c-case" }));
      expect(prisma.case.findFirst).toHaveBeenNthCalledWith(2, expect.objectContaining({ where: expect.objectContaining({ id: "c-case", tenantId: "t1" }) }));
    });

    it("DENY / NONE → varsayılan kapsam AND katmanında; ALLOW → yalnız kiracı (D1 anahtarı)", async () => {
      const d = build({ resolution: "DENY" });
      await d.svc.assertCaseVisible("t1", "u1", "c1");
      expect(d.workScope.resolve).toHaveBeenCalledWith(expect.anything(), "t1", "u1", CASE_VIEW_ALL_KEY);
      expect(d.prisma.case.findFirst.mock.calls[0]).toEqual([{ where: { id: "c1", tenantId: "t1", AND: [caseViewScopeWhere("t1", "u1")] }, select: { id: true } }]);
      const al = build({ resolution: "ALLOW" });
      await al.svc.assertCaseVisible("t1", "u1", "c1");
      expect(al.prisma.case.findFirst.mock.calls[0]).toEqual([{ where: { id: "c1", tenantId: "t1" }, select: { id: true } }]);
    });

    it("kapsam dışı / yok ve geçersiz dosya kimliği → aynı 404 'Dosya bulunamadı'", async () => {
      const { svc } = build({ caseFound: false });
      await expect(svc.assertCaseVisible("t1", "u1", "c1")).rejects.toThrow(new NotFoundException("Dosya bulunamadı"));
      for (const bad of [undefined, "", 42]) {
        await expect(build().svc.assertCaseVisible("t1", "u1", bad)).rejects.toThrow(new NotFoundException("Dosya bulunamadı"));
      }
    });

    it("artefakt: artefakt kiracısı + bağlı dosyanın kiracısı + kapsam tek sorguda; bulunamazsa false", async () => {
      const { prisma, svc } = build({ resolution: "NONE" });
      await expect(svc.isArtifactVisible("t1", "u1", "a1")).resolves.toBe(true);
      expect(prisma.documentArtifact.findFirst).toHaveBeenCalledWith({
        where: { id: "a1", tenantId: "t1", case: { tenantId: "t1", AND: [caseViewScopeWhere("t1", "u1")] } },
        select: { id: true },
      });
      await expect(build({ artifactFound: false }).svc.isArtifactVisible("t1", "u1", "a1")).resolves.toBe(false);
      await expect(build().svc.isArtifactVisible("t1", "u1", "")).resolves.toBe(false);
      const al = build({ resolution: "ALLOW" });
      await al.svc.isArtifactVisible("t1", "u1", "a1");
      expect(al.prisma.documentArtifact.findFirst.mock.calls[0]).toEqual([{ where: { id: "a1", tenantId: "t1", case: { tenantId: "t1" } }, select: { id: true } }]);
    });
  });
});
