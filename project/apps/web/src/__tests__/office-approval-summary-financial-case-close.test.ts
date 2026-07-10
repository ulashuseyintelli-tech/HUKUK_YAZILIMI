import { describe, expect, it } from "vitest";
import { projectFinancialCaseClose } from "@/components/office-approval/summary/financial-case-close.projector";

describe("projectFinancialCaseClose", () => {
  it("OWN-29-C savedIntent için güvenli özet üretir", () => {
    const result = projectFinancialCaseClose({
      version: "OWN29C_FINANCIAL_CASE_CLOSE_V1",
      caseId: "case-1",
      status: "HITAM",
      reason: "tam ödeme",
    }, {});

    expect(result.kind).toBe("summary");
    expect(result.fields).toEqual([
      { label: "Dosya", value: "case-1" },
      { label: "Kapanış Durumu", value: "HITAM" },
      { label: "Gerekçe", value: "tam ödeme" },
    ]);
  });

  it("versiyon/hedef/status eksikse unsafe döner", () => {
    expect(projectFinancialCaseClose({ status: "HITAM" }, {}).kind).toBe("unsafe");
    expect(projectFinancialCaseClose({ version: "WRONG", caseId: "case-1", status: "HITAM" }, {}).kind).toBe("unsafe");
  });
});
