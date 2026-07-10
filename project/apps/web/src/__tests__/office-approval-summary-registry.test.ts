import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/components/office-approval/summary/collection-disposition-post.projector", () => ({
  projectCollectionDispositionPost: vi.fn(),
}));
vi.mock("@/components/office-approval/summary/change-status.projector", () => ({
  projectChangeStatus: vi.fn(),
}));
vi.mock("@/components/office-approval/summary/financial-case-close.projector", () => ({
  projectFinancialCaseClose: vi.fn(),
}));

import { getApprovalSummary } from "@/components/office-approval/summary/registry";
import { projectCollectionDispositionPost } from "@/components/office-approval/summary/collection-disposition-post.projector";
import { projectChangeStatus } from "@/components/office-approval/summary/change-status.projector";
import { projectFinancialCaseClose } from "@/components/office-approval/summary/financial-case-close.projector";

beforeEach(() => {
  vi.mocked(projectCollectionDispositionPost).mockReset();
  vi.mocked(projectChangeStatus).mockReset();
  vi.mocked(projectFinancialCaseClose).mockReset();
});

describe("getApprovalSummary (registry)", () => {
  it("bilinmeyen actionCode -> unsafe, hiçbir projector çağrılmaz", () => {
    const result = getApprovalSummary("SOME_UNKNOWN_ACTION", { anything: true });
    expect(result.kind).toBe("unsafe");
    expect(result.reason).toMatch(/güvenli özet üretilemiyor/);
    expect(projectCollectionDispositionPost).not.toHaveBeenCalled();
    expect(projectChangeStatus).not.toHaveBeenCalled();
    expect(projectFinancialCaseClose).not.toHaveBeenCalled();
  });

  it("COLLECTION_DISPOSITION_POST + summary sonucu -> action-behavior-catalog'dan impactNotes eklenir", () => {
    vi.mocked(projectCollectionDispositionPost).mockReturnValue({
      kind: "summary",
      fields: [{ label: "X", value: "Y" }],
    });
    const result = getApprovalSummary("COLLECTION_DISPOSITION_POST", { any: true });
    expect(result.kind).toBe("summary");
    expect(result.impactNotes).toBeDefined();
    expect(result.impactNotes).toContain("Tahsilat dağıtımı onaylanır.");
  });

  it("CHANGE_STATUS + summary sonucu -> catalog girdisi yok, impactNotes eklenmez", () => {
    vi.mocked(projectChangeStatus).mockReturnValue({
      kind: "summary",
      fields: [{ label: "Yeni Durum", value: "HITAM" }],
    });
    const result = getApprovalSummary("CHANGE_STATUS", { status: "HITAM" });
    expect(result.kind).toBe("summary");
    expect(result.impactNotes).toBeUndefined();
  });

  it("FINANCIAL_CASE_CLOSE + summary sonucu -> action-behavior-catalog'dan impactNotes eklenir", () => {
    vi.mocked(projectFinancialCaseClose).mockReturnValue({
      kind: "summary",
      fields: [{ label: "Kapanış Durumu", value: "HITAM" }],
    });
    const result = getApprovalSummary("FINANCIAL_CASE_CLOSE", {
      version: "OWN29C_FINANCIAL_CASE_CLOSE_V1",
      caseId: "case-1",
      status: "HITAM",
    });
    expect(result.kind).toBe("summary");
    expect(result.impactNotes).toContain("Dosya finansal kapanış statüsüne geçirilir.");
  });

  it("projector unsafe dönerse -> impactNotes eklenmez, unsafe aynen geçer", () => {
    vi.mocked(projectCollectionDispositionPost).mockReturnValue({
      kind: "unsafe",
      fields: [],
      reason: "test-reason",
    });
    const result = getApprovalSummary("COLLECTION_DISPOSITION_POST", {});
    expect(result).toEqual({ kind: "unsafe", fields: [], reason: "test-reason" });
  });

  it("projector THROW ederse -> registry yakalar, unsafe döner (crash yok)", () => {
    vi.mocked(projectCollectionDispositionPost).mockImplementation(() => {
      throw new Error("beklenmeyen hata");
    });
    const result = getApprovalSummary("COLLECTION_DISPOSITION_POST", {});
    expect(result.kind).toBe("unsafe");
    expect(result.reason).toMatch(/güvenli özet üretilemiyor/);
  });
});
