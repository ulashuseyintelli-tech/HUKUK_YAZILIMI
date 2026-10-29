/**
 * KI-019 / F02-D — manuel eskalasyon tetiğinin KİRACI kapsamı (saf; DB yok).
 *
 * Kanıtlanan sözleşme:
 *  1. Kapsam verilmezse (cron giriş noktası) tenant seçimi AYNEN `ACTIVE_TENANT_WHERE` (tüm aktif kiracılar).
 *  2. `scope.tenantId` verilirse seçim `{ ...ACTIVE_TENANT_WHERE, id }` — ACTIVE yüklemi korunur, tek kiracı.
 *  3. Controller: tenantId'siz aktör 403 (servis çağrılmaz); tenantId'li aktör servisi (runManual) kendi kiracısıyla çağırır.
 *  4. Controller sınıfı JwtAuthGuard + ViewerWriteDenyGuard taşır (VIEWER → 403, kapalı salt-okuyucu kuralı).
 *  5. J-26 (owner kararı 2026-10-29, ELEVATED): runManual eşiği scheduler ile AYNI — elevated olmayan USER/ADMIN 403
 *     ESCALATION_MANUAL_RUN_DENIED_NOT_ELEVATED, DB'ye HİÇ inilmez; elevated aktör yalnız kendi kiracısını işler.
 */
import { ForbiddenException } from "@nestjs/common";
import { GUARDS_METADATA } from "@nestjs/common/constants";
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard";
import { ViewerWriteDenyGuard } from "../../auth/guards/viewer-write-deny.guard";
import { ACTIVE_TENANT_WHERE } from "../../tenant/tenant-lifecycle";
import { EscalationController } from "../escalation.controller";
import { OperationalEscalationService } from "../operational-escalation.service";

const build = (eligible = true) => {
  const prisma = { tenant: { findMany: jest.fn().mockResolvedValue([]) } } as any;
  const officeApproval = { isApproverEligible: jest.fn().mockResolvedValue(eligible) };
  const svc = new OperationalEscalationService(prisma, {} as any, { report: jest.fn().mockResolvedValue(undefined) } as any, officeApproval as any);
  return { prisma, svc, officeApproval };
};

const reasonOf = async (p: Promise<unknown>) => {
  try { await p; } catch (e) { return ((e as ForbiddenException).getResponse() as { reasonCode?: string }).reasonCode; }
  return "NO_THROW";
};

describe("KI-019 — OperationalEscalationService.processEscalations kiracı kapsamı", () => {
  it("kapsam yok (cron) → where AYNEN ACTIVE_TENANT_WHERE; id daraltması YOK", async () => {
    const { prisma, svc } = build();
    const res = await svc.processEscalations(new Date());
    expect(res).toEqual({ processed: 0, notified: 0, skipped: 0, failed: 0 });
    expect(prisma.tenant.findMany).toHaveBeenCalledTimes(1);
    const where = prisma.tenant.findMany.mock.calls[0][0].where;
    expect(where).toBe(ACTIVE_TENANT_WHERE);
    expect(where).not.toHaveProperty("id");
  });

  it("scope.tenantId → where = { ...ACTIVE_TENANT_WHERE, id } (ACTIVE yüklemi korunur, tek kiracı)", async () => {
    const { prisma, svc } = build();
    await svc.processEscalations(new Date(), { tenantId: "tenant-A" });
    const where = prisma.tenant.findMany.mock.calls[0][0].where;
    expect(where).toEqual({ ...ACTIVE_TENANT_WHERE, id: "tenant-A" });
  });
});

describe("J-26 — OperationalEscalationService.runManual eşiği (ELEVATED; scheduler ile aynı politika)", () => {
  it("elevated OLMAYAN USER → 403 ESCALATION_MANUAL_RUN_DENIED_NOT_ELEVATED; eligibility (userId, tenantId) ile BİR kez; DB'ye inilmez", async () => {
    const { prisma, svc, officeApproval } = build(false);
    await expect(svc.runManual({ userId: "u-1", tenantId: "tenant-A", role: "USER" })).rejects.toBeInstanceOf(ForbiddenException);
    expect(await reasonOf(svc.runManual({ userId: "u-1", tenantId: "tenant-A", role: "USER" }))).toBe("ESCALATION_MANUAL_RUN_DENIED_NOT_ELEVATED");
    expect(officeApproval.isApproverEligible).toHaveBeenCalledWith("u-1", "tenant-A");
    expect(prisma.tenant.findMany).not.toHaveBeenCalled();
  });

  it("ADMIN tek başına YETMEZ (kart yok) → 403 NOT_ELEVATED; DB'ye inilmez", async () => {
    const { prisma, svc } = build(false);
    expect(await reasonOf(svc.runManual({ userId: "u-admin", tenantId: "tenant-A", role: "ADMIN" }))).toBe("ESCALATION_MANUAL_RUN_DENIED_NOT_ELEVATED");
    expect(prisma.tenant.findMany).not.toHaveBeenCalled();
  });

  it("VIEWER → 403 ESCALATION_MANUAL_RUN_DENIED_VIEWER (kartı PARTNER olsa bile); DB'ye inilmez", async () => {
    const { prisma, svc } = build(true);
    expect(await reasonOf(svc.runManual({ userId: "u-v", tenantId: "tenant-A", role: "VIEWER" }))).toBe("ESCALATION_MANUAL_RUN_DENIED_VIEWER");
    expect(prisma.tenant.findMany).not.toHaveBeenCalled();
  });

  it("userId yok → NO_ACTOR; tenantId yok → NO_TENANT; eligibility sorgusu YOK", async () => {
    const { prisma, svc, officeApproval } = build(true);
    expect(await reasonOf(svc.runManual({ userId: "", tenantId: "tenant-A", role: "ADMIN" }))).toBe("ESCALATION_MANUAL_RUN_DENIED_NO_ACTOR");
    expect(await reasonOf(svc.runManual({ userId: "u-1", tenantId: "", role: "ADMIN" }))).toBe("ESCALATION_MANUAL_RUN_DENIED_NO_TENANT");
    expect(officeApproval.isApproverEligible).not.toHaveBeenCalled();
    expect(prisma.tenant.findMany).not.toHaveBeenCalled();
  });

  it.each(["USER", "ADMIN"])("elevated %s (isApproverEligible=true) → tur YALNIZ aktörün kiracısıyla koşar", async (role) => {
    const { prisma, svc } = build(true);
    const res = await svc.runManual({ userId: "u-e", tenantId: "tenant-A", role });
    expect(res).toEqual({ processed: 0, notified: 0, skipped: 0, failed: 0 });
    expect(prisma.tenant.findMany.mock.calls[0][0].where).toEqual({ ...ACTIVE_TENANT_WHERE, id: "tenant-A" });
  });
});

describe("KI-019 — EscalationController.run", () => {
  it("tenantId yoksa 403 ESCALATION_MANUAL_RUN_DENIED_NO_TENANT; servis ÇAĞRILMAZ", () => {
    const service = { runManual: jest.fn(), processEscalations: jest.fn() };
    const ctrl = new EscalationController(service as any);
    expect(() => ctrl.run(undefined)).toThrow(ForbiddenException);
    try { ctrl.run({ id: "u-1", tenantId: "", role: "ADMIN" }); } catch (e) {
      expect((e as ForbiddenException).getResponse()).toEqual({ reasonCode: "ESCALATION_MANUAL_RUN_DENIED_NO_TENANT" });
    }
    expect(service.runManual).not.toHaveBeenCalled();
    expect(service.processEscalations).not.toHaveBeenCalled();
  });

  it("tenantId varsa yalnız runManual (yetki kapısı) aktörün kimliğiyle çağrılır; gövdeden aktör/tenant OKUNMAZ", async () => {
    const service = { runManual: jest.fn().mockResolvedValue({ processed: 0, notified: 0, skipped: 0, failed: 0 }), processEscalations: jest.fn() };
    const ctrl = new EscalationController(service as any);
    await ctrl.run({ id: "u-1", tenantId: "tenant-A", role: "ADMIN" });
    expect(service.runManual).toHaveBeenCalledTimes(1);
    expect(service.runManual).toHaveBeenCalledWith({ userId: "u-1", tenantId: "tenant-A", role: "ADMIN" });
    expect(service.processEscalations).not.toHaveBeenCalled(); // kapı atlanamaz
  });

  it("sınıf düzeyi guard zinciri: JwtAuthGuard + ViewerWriteDenyGuard (VIEWER yazma reddi)", () => {
    const guards: unknown[] = Reflect.getMetadata(GUARDS_METADATA, EscalationController) ?? [];
    expect(guards).toContain(JwtAuthGuard);
    expect(guards).toContain(ViewerWriteDenyGuard);
  });
});
