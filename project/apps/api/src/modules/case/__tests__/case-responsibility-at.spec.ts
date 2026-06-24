/**
 * WP-1d-3 — combined read-only temporal endpoint GET /cases/:id/responsibility-at?asOf=.
 * Service (getResponsibilityAt): iki mevcut temporal metodu birleştirir + 404 (case tenant yok).
 * Controller: asOf parse (400 invalid · default now) + delege. Reconstruction WP-1d-1/1d-2'de test edildi.
 */

import { NotFoundException, BadRequestException } from "@nestjs/common";
import { TemporalResponsibilityService } from "../temporal-responsibility.service";
import { CaseController } from "../case.controller";

const ASOF = new Date("2026-06-15T00:00:00.000Z");

// ---- Service: getResponsibilityAt (combine + 404) ----
function makeService(opts: { caseInTenant?: any; op?: any; legal?: any } = {}) {
  const caseFindFirst = jest.fn(async () => ("caseInTenant" in opts ? opts.caseInTenant : { id: "c1" }));
  const service = new TemporalResponsibilityService({ case: { findFirst: caseFindFirst } } as any);
  jest.spyOn(service, "getOperationOwnerAt").mockResolvedValue(
    opts.op ?? {
      caseId: "c1", asOf: ASOF.toISOString(),
      operationOwner: { type: "LAWYER", id: "law-op", confidence: "EVENT_CONFIRMED", sourceEventId: "ev-op" },
      horizon: { instrumentationStartedAt: "2026-06-01T00:00:00.000Z" },
    } as any,
  );
  jest.spyOn(service, "getLegalResponsibleLawyerAt").mockResolvedValue(
    opts.legal ?? {
      caseId: "c1", asOf: ASOF.toISOString(),
      legalResponsibleLawyer: { lawyerId: "law-legal", confidence: "INFERRED_FROM_SNAPSHOT" },
      horizon: { instrumentationStartedAt: "2026-06-02T00:00:00.000Z", note: "snapshot" },
    } as any,
  );
  return { service, caseFindFirst };
}

describe("WP-1d-3 TemporalResponsibilityService.getResponsibilityAt", () => {
  it("op-owner + legal-responsible birleştirir + horizon merge", async () => {
    const { service } = makeService();
    const r = await service.getResponsibilityAt("t1", "c1", ASOF);
    expect(r.operationOwner).toMatchObject({ type: "LAWYER", id: "law-op", confidence: "EVENT_CONFIRMED" });
    expect(r.legalResponsibleLawyer).toMatchObject({ lawyerId: "law-legal", confidence: "INFERRED_FROM_SNAPSHOT" });
    expect(r.horizon.operationOwnerInstrumentationStartedAt).toBe("2026-06-01T00:00:00.000Z");
    expect(r.horizon.legalResponsibleInstrumentationStartedAt).toBe("2026-06-02T00:00:00.000Z");
    expect(r.asOf).toBe(ASOF.toISOString());
  });

  it("confidence passthrough (endpoint değiştirmez)", async () => {
    const { service } = makeService({
      op: { caseId: "c1", asOf: ASOF.toISOString(), operationOwner: { type: "NONE", id: null, confidence: "UNKNOWN_BEFORE_HORIZON" }, horizon: {} },
      legal: { caseId: "c1", asOf: ASOF.toISOString(), legalResponsibleLawyer: { lawyerId: null, confidence: "UNKNOWN_BEFORE_HORIZON" }, horizon: {} },
    });
    const r = await service.getResponsibilityAt("t1", "c1", ASOF);
    expect(r.operationOwner.confidence).toBe("UNKNOWN_BEFORE_HORIZON");
    expect(r.legalResponsibleLawyer.confidence).toBe("UNKNOWN_BEFORE_HORIZON");
  });

  it("case bu tenant'ta yok → NotFoundException (event-yok ≠ dosya-yok)", async () => {
    const { service } = makeService({ caseInTenant: null });
    await expect(service.getResponsibilityAt("t1", "cX", ASOF)).rejects.toBeInstanceOf(NotFoundException);
  });

  it("tenant boundary: case.findFirst tenant-scoped", async () => {
    const { service, caseFindFirst } = makeService();
    await service.getResponsibilityAt("t1", "c1", ASOF);
    expect(caseFindFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "c1", tenantId: "t1" }, select: { id: true } }));
  });
});

// ---- Controller: asOf parse + delegation ----
// NOT: WP-4d-1 getResponsibilityAt'e userId (2. param) + warnOnlyAudit ctor arg'ı, WP-4e-1 ise
// permissionHardGuard ctor arg'ı ekledi. Bu yardımcılar getResponsibilityAt'i etkilemez (yalnız delete +
// warn-only emit) ama ctor/çağrı imzaları güncel tutulmalı (aksi halde bu spec kırılır).
function makeController(getResp = jest.fn(async () => ({ ok: true }))) {
  const temporal = { getResponsibilityAt: getResp } as any;
  const warnOnly = { recordWouldDeny: jest.fn().mockResolvedValue(undefined) } as any;
  const hardGuard = { assertBridgeAdmin: jest.fn().mockResolvedValue(undefined) } as any;
  const controller = new CaseController({} as any, {} as any, {} as any, temporal, warnOnly, hardGuard);
  return { controller, getResp };
}

describe("WP-1d-3 CaseController.getResponsibilityAt (endpoint)", () => {
  it("explicit asOf → service parsed Date ile çağrılır", async () => {
    const { controller, getResp } = makeController();
    await controller.getResponsibilityAt("t1", "u1", "c1", "2026-06-15T00:00:00.000Z");
    expect(getResp).toHaveBeenCalledWith("t1", "c1", new Date("2026-06-15T00:00:00.000Z"));
  });

  it("asOf yok → new Date() (Date instance) ile çağrılır", async () => {
    const { controller, getResp } = makeController();
    await controller.getResponsibilityAt("t1", "u1", "c1", undefined);
    const passed = getResp.mock.calls[0][2];
    expect(passed).toBeInstanceOf(Date);
    expect(Number.isNaN(passed.getTime())).toBe(false);
  });

  it("invalid asOf → BadRequestException, service çağrılmaz", async () => {
    const { controller, getResp } = makeController();
    await expect(controller.getResponsibilityAt("t1", "u1", "c1", "not-a-date")).rejects.toBeInstanceOf(BadRequestException);
    expect(getResp).not.toHaveBeenCalled();
  });
});
