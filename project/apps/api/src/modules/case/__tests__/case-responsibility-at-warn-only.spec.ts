/**
 * WP-4d-1 — CaseController.getResponsibilityAt warn-only davranışı.
 * Response AYNEN döner; ek olarak best-effort PERMISSION_WOULD_DENY audit emit edilir. Hard deny YOK.
 */

import { BadRequestException } from "@nestjs/common";
import { CaseController } from "../case.controller";

function mkController() {
  const temporal = {
    getResponsibilityAt: jest.fn().mockResolvedValue({ caseId: "c1", asOf: "X", operationOwner: {}, legalResponsibleLawyer: {} }),
  };
  const warn = { recordWouldDeny: jest.fn().mockResolvedValue(undefined) };
  const controller = new CaseController(
    {} as any, // caseService (kullanılmaz)
    {} as any, // ocrService
    {} as any, // responsibleCandidatesService
    temporal as any,
    warn as any,
  );
  return { controller, temporal, warn };
}

describe("WP-4d-1 CaseController.getResponsibilityAt warn-only", () => {
  it("(1+3) başarılı çağrı → response DEĞİŞMEZ + warn-only audit emit edilir", async () => {
    const { controller, temporal, warn } = mkController();
    const res = await controller.getResponsibilityAt("t1", "u1", "c1", undefined);
    expect(res).toMatchObject({ caseId: "c1", asOf: "X" }); // service sonucu aynen
    expect(temporal.getResponsibilityAt).toHaveBeenCalledWith("t1", "c1", expect.any(Date));
    expect(warn.recordWouldDeny).toHaveBeenCalledWith("cases.responsibilityAt", {
      tenantId: "t1",
      actorUserId: "u1",
      entityId: "c1",
      requestPath: "/cases/:id/responsibility-at",
    });
  });

  it("(6) geçersiz asOf → BadRequestException; service ve audit ÇAĞRILMAZ (mevcut error path korunur)", async () => {
    const { controller, temporal, warn } = mkController();
    await expect(controller.getResponsibilityAt("t1", "u1", "c1", "not-a-date")).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(temporal.getResponsibilityAt).not.toHaveBeenCalled();
    expect(warn.recordWouldDeny).not.toHaveBeenCalled();
  });

  it("(geçerli asOf) service'e Date olarak geçer + audit emit edilir", async () => {
    const { controller, temporal, warn } = mkController();
    await controller.getResponsibilityAt("t1", "u1", "c1", "2026-06-01T00:00:00.000Z");
    const passed = temporal.getResponsibilityAt.mock.calls[0][2];
    expect(passed instanceof Date).toBe(true);
    expect(Number.isNaN(passed.getTime())).toBe(false);
    expect(warn.recordWouldDeny).toHaveBeenCalledTimes(1);
  });

  it("(7) hard deny YOK: emit sonrası response yine döner (non-admin de kullanabilir; rol kapısı yok)", async () => {
    const { controller, warn } = mkController();
    const res = await controller.getResponsibilityAt("t1", "non-admin-user", "c1", undefined);
    expect(res).toBeDefined();
    expect(warn.recordWouldDeny).toHaveBeenCalled();
  });
});
