/**
 * MPB-028(a) PR-3 Evidence Activation — LegalTimeShadowController birim testleri.
 *
 * Route şekli + tenant-scoping + servis çağrı sözleşmesini doğrular. Servis mock'lanır;
 * gerçek hesaplama/flag davranışı legal-time-shadow.service.spec.ts ve
 * legal-time-shadow.db-gated.integration.spec.ts kapsamındadır.
 */
import { RequestMethod } from "@nestjs/common";
import { METHOD_METADATA, PATH_METADATA } from "@nestjs/common/constants";
import { LegalTimeShadowController } from "../legal-time-shadow.controller";
import type { LegalTimeShadowService } from "../legal-time-shadow.service";

describe("LegalTimeShadowController — route şekli", () => {
  it("compute: POST legal-time-shadow/tebligat/:tebligatId/compute", () => {
    const controllerPath = Reflect.getMetadata(PATH_METADATA, LegalTimeShadowController);
    const methodPath = Reflect.getMetadata(
      PATH_METADATA,
      LegalTimeShadowController.prototype.compute,
    );
    const method = Reflect.getMetadata(
      METHOD_METADATA,
      LegalTimeShadowController.prototype.compute,
    );

    expect(method).toBe(RequestMethod.POST);
    expect(`${controllerPath}/${methodPath}`).toBe("legal-time-shadow/tebligat/:tebligatId/compute");
  });

  it("evidenceReport: GET legal-time-shadow/evidence-report", () => {
    const controllerPath = Reflect.getMetadata(PATH_METADATA, LegalTimeShadowController);
    const methodPath = Reflect.getMetadata(
      PATH_METADATA,
      LegalTimeShadowController.prototype.evidenceReport,
    );
    const method = Reflect.getMetadata(
      METHOD_METADATA,
      LegalTimeShadowController.prototype.evidenceReport,
    );

    expect(method).toBe(RequestMethod.GET);
    expect(`${controllerPath}/${methodPath}`).toBe("legal-time-shadow/evidence-report");
  });
});

describe("LegalTimeShadowController — compute", () => {
  it("flag açık/diff üretildi: triggered=true, diff servis sonucudur", async () => {
    const diff = { id: "diff-1", deltaDays: 2 };
    const service = {
      computeShadowDiff: jest.fn().mockResolvedValue(diff),
    } as unknown as LegalTimeShadowService;
    const controller = new LegalTimeShadowController(service);

    const result = await controller.compute("tenant-a", "teb-1");

    expect(service.computeShadowDiff).toHaveBeenCalledWith({
      tenantId: "tenant-a",
      tebligatId: "teb-1",
    });
    expect(result).toEqual({ triggered: true, diff });
  });

  it("flag kapalı (servis null döner): triggered=false, diff=null — hiçbir mutasyon iddia edilmez", async () => {
    const service = {
      computeShadowDiff: jest.fn().mockResolvedValue(null),
    } as unknown as LegalTimeShadowService;
    const controller = new LegalTimeShadowController(service);

    const result = await controller.compute("tenant-a", "teb-1");

    expect(result).toEqual({ triggered: false, diff: null });
  });

  it("tenantId auth context'ten, tebligatId path'ten geçirilir (cross-tenant enumeration servise bırakılır)", async () => {
    const service = {
      computeShadowDiff: jest.fn().mockResolvedValue(null),
    } as unknown as LegalTimeShadowService;
    const controller = new LegalTimeShadowController(service);

    await controller.compute("tenant-b", "teb-9");

    expect(service.computeShadowDiff).toHaveBeenCalledWith({
      tenantId: "tenant-b",
      tebligatId: "teb-9",
    });
  });
});

describe("LegalTimeShadowController — evidenceReport", () => {
  it("servis sonucunu olduğu gibi döner (kategori/limit eklemez)", async () => {
    const report = {
      totalCount: 3,
      zeroDeltaCount: 1,
      nonZeroDeltaCount: 2,
      unresolvedCount: 0,
      records: [{ id: "diff-1" }, { id: "diff-2" }, { id: "diff-3" }],
    };
    const service = {
      buildEvidenceReport: jest.fn().mockResolvedValue(report),
    } as unknown as LegalTimeShadowService;
    const controller = new LegalTimeShadowController(service);

    const result = await controller.evidenceReport("tenant-a");

    expect(service.buildEvidenceReport).toHaveBeenCalledWith("tenant-a");
    expect(result).toBe(report);
  });
});
