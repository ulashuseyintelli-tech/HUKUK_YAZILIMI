/**
 * KI-019 / F02-D — manuel eskalasyon tetiğinin KİRACI kapsamı (saf; DB yok).
 *
 * Kanıtlanan sözleşme:
 *  1. Kapsam verilmezse (cron giriş noktası) tenant seçimi AYNEN `ACTIVE_TENANT_WHERE` (tüm aktif kiracılar).
 *  2. `scope.tenantId` verilirse seçim `{ ...ACTIVE_TENANT_WHERE, id }` — ACTIVE yüklemi korunur, tek kiracı.
 *  3. Controller: tenantId'siz aktör 403 (servis çağrılmaz); tenantId'li aktör servisi kendi kiracısıyla çağırır.
 *  4. Controller sınıfı JwtAuthGuard + ViewerWriteDenyGuard taşır (VIEWER → 403, kapalı salt-okuyucu kuralı).
 */
import { ForbiddenException } from "@nestjs/common";
import { GUARDS_METADATA } from "@nestjs/common/constants";
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard";
import { ViewerWriteDenyGuard } from "../../auth/guards/viewer-write-deny.guard";
import { ACTIVE_TENANT_WHERE } from "../../tenant/tenant-lifecycle";
import { EscalationController } from "../escalation.controller";
import { OperationalEscalationService } from "../operational-escalation.service";

const build = () => {
  const prisma = { tenant: { findMany: jest.fn().mockResolvedValue([]) } } as any;
  const svc = new OperationalEscalationService(prisma, {} as any, { report: jest.fn().mockResolvedValue(undefined) } as any);
  return { prisma, svc };
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

describe("KI-019 — EscalationController.run", () => {
  it("tenantId yoksa 403 ESCALATION_MANUAL_RUN_DENIED_NO_TENANT; servis ÇAĞRILMAZ", () => {
    const service = { processEscalations: jest.fn() };
    const ctrl = new EscalationController(service as any);
    expect(() => ctrl.run(undefined)).toThrow(ForbiddenException);
    try { ctrl.run(""); } catch (e) {
      expect((e as ForbiddenException).getResponse()).toEqual({ reasonCode: "ESCALATION_MANUAL_RUN_DENIED_NO_TENANT" });
    }
    expect(service.processEscalations).not.toHaveBeenCalled();
  });

  it("tenantId varsa servis YALNIZ aktörün kiracısıyla çağrılır (global kapsam HTTP'den seçilemez)", async () => {
    const service = { processEscalations: jest.fn().mockResolvedValue({ processed: 0, notified: 0, skipped: 0, failed: 0 }) };
    const ctrl = new EscalationController(service as any);
    await ctrl.run("tenant-A");
    expect(service.processEscalations).toHaveBeenCalledTimes(1);
    const [now, scope] = service.processEscalations.mock.calls[0];
    expect(now).toBeInstanceOf(Date);
    expect(scope).toEqual({ tenantId: "tenant-A" });
  });

  it("sınıf düzeyi guard zinciri: JwtAuthGuard + ViewerWriteDenyGuard (VIEWER yazma reddi)", () => {
    const guards: unknown[] = Reflect.getMetadata(GUARDS_METADATA, EscalationController) ?? [];
    expect(guards).toContain(JwtAuthGuard);
    expect(guards).toContain(ViewerWriteDenyGuard);
  });
});
