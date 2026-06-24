/**
 * WP-1d-4c-1 — CaseController.getResponsibilityHistory query parse + delegation (READ-ONLY).
 */

import { BadRequestException } from "@nestjs/common";
import { CaseController } from "../case.controller";

function mk() {
  const history = { getResponsibilityHistory: jest.fn().mockResolvedValue({ caseId: "c1", events: [] }) };
  // ctor: caseService, ocr, responsibleCandidates, temporal, warnOnly, hardGuard, responsibilityHistory
  const controller = new CaseController({} as any, {} as any, {} as any, {} as any, {} as any, {} as any, history as any);
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
