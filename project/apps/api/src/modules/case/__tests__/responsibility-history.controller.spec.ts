/**
 * WP-1d-4c-1 — CaseController.getResponsibilityHistory query parse + delegation (READ-ONLY).
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

function mk() {
  const history = { getResponsibilityHistory: jest.fn().mockResolvedValue({ caseId: "c1", events: [] }) };
  // ctor: caseService, ocr, responsibleCandidates, temporal, warnOnly, hardGuard, responsibilityHistory,
  // legalResponsibleLawyerService, guidedOpenObserve (son ikisi getResponsibilityHistory'yi etkilemez)
  const controller = new CaseController(
    {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, history as any,
    {} as any, {} as any,
  );
  return { controller, history };
}

describe("WP-1d-4c-1 CaseController.getResponsibilityHistory", () => {
  it("(10) geçersiz from → BadRequestException; servis çağrılmaz", async () => {
    const { controller, history } = mk();
    await expect(controller.getResponsibilityHistory("t1", "c1", "not-a-date", undefined, undefined, undefined)).rejects.toBeInstanceOf(BadRequestException);
    expect(history.getResponsibilityHistory).not.toHaveBeenCalled();
  });

  it("(10) geçersiz to → BadRequestException", async () => {
    const { controller } = mk();
    await expect(controller.getResponsibilityHistory("t1", "c1", undefined, "xx", undefined, undefined)).rejects.toBeInstanceOf(BadRequestException);
  });

  it("geçerli çağrı → parse edilmiş Date + includeInferred + type ile delegasyon", async () => {
    const { controller, history } = mk();
    await controller.getResponsibilityHistory("t1", "c1", "2026-01-01T00:00:00.000Z", "2026-06-01T00:00:00.000Z", "false", "operationOwner");
    expect(history.getResponsibilityHistory).toHaveBeenCalledWith("t1", "c1", {
      from: new Date("2026-01-01T00:00:00.000Z"),
      to: new Date("2026-06-01T00:00:00.000Z"),
      includeInferred: false,
      type: "operationOwner",
    });
  });

  it("includeInferred default true; type geçersiz → 'all'", async () => {
    const { controller, history } = mk();
    await controller.getResponsibilityHistory("t1", "c1", undefined, undefined, undefined, "garbage");
    expect(history.getResponsibilityHistory).toHaveBeenCalledWith("t1", "c1", {
      from: undefined,
      to: undefined,
      includeInferred: true,
      type: "all",
    });
  });

  it("type=legalResponsibleLawyer passthrough", async () => {
    const { controller, history } = mk();
    await controller.getResponsibilityHistory("t1", "c1", undefined, undefined, "true", "legalResponsibleLawyer");
    const opts = history.getResponsibilityHistory.mock.calls[0][2];
    expect(opts.type).toBe("legalResponsibleLawyer");
    expect(opts.includeInferred).toBe(true);
  });
});
