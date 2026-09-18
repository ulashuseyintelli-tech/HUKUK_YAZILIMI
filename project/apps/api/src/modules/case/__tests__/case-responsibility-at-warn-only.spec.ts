/**
 * WP-4d-1 — CaseController.getResponsibilityAt warn-only davranışı.
 * Response AYNEN döner; ek olarak best-effort PERMISSION_WOULD_DENY audit emit edilir. Hard deny YOK.
 */

// pdf-poppler (npm) modul YUKLENIRKEN os.platform() darwin/win32 degilse process.exit(1)
// cagirir (node_modules/pdf-poppler/index.js). Bu spec'in import zinciri (../case.controller -> ocr.service)
// ocr.service'in ust-seviye require('pdf-poppler')'ini yukler; Linux CI'da bu cagri jest
// surecini oldurup manifestin TAMAMINI dusururdu.
// Bu spec PDF->goruntu donusumunu DOGRULAMAZ: tanilama kosumunda (pdf-poppler yerine sayacli
// stub) convert() cagri sayisi 0 olculdu. Stub bilincli olarak FIRLATIR — donusum ileride
// bu spec'in yoluna girerse test sessizce gecmez, duser.
// Emsal (CI'da kosan): collection/__tests__/receipt-public-entrypoints-authorization.contract.spec.ts
jest.mock('pdf-poppler', () => ({
  convert: async () => {
    throw new Error('pdf-poppler is stubbed in unit tests');
  },
}));

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
    {} as any, // permissionHardGuard (getResponsibilityAt'te kullanılmaz)
    {} as any, // responsibilityHistoryService (kullanılmaz)
    {} as any, // legalResponsibleLawyerService (kullanılmaz)
    {} as any, // guidedOpenObserve (kullanılmaz)
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
