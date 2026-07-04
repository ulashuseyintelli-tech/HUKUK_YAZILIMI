import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/components/office-approval/summary/collection-disposition-post.projector", () => ({
  projectCollectionDispositionPost: vi.fn(),
}));
vi.mock("@/components/office-approval/summary/change-status.projector", () => ({
  projectChangeStatus: vi.fn(),
}));

import { getApprovalSummary } from "@/components/office-approval/summary/registry";
import { projectCollectionDispositionPost } from "@/components/office-approval/summary/collection-disposition-post.projector";
import { projectChangeStatus } from "@/components/office-approval/summary/change-status.projector";

beforeEach(() => {
  vi.mocked(projectCollectionDispositionPost).mockReset();
  vi.mocked(projectChangeStatus).mockReset();
});

describe("getApprovalSummary (registry)", () => {
  it("bilinmeyen actionCode -> unsafe, hiçbir projector çağrılmaz", () => {
    const result = getApprovalSummary("SOME_UNKNOWN_ACTION", { anything: true });
    expect(result.kind).toBe("unsafe");
    expect(result.reason).toMatch(/güvenli özet üretilemiyor/);
    expect(projectCollectionDispositionPost).not.toHaveBeenCalled();
    expect(projectChangeStatus).not.toHaveBeenCalled();
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
