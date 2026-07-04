import { describe, it, expect } from "vitest";
import { projectChangeStatus } from "@/components/office-approval/summary/change-status.projector";

describe("projectChangeStatus", () => {
  it("status + reason -> summary, iki alan da render edilir", () => {
    const result = projectChangeStatus({ status: "HITAM", reason: "Dosya kapandı" }, {});
    expect(result.kind).toBe("summary");
    expect(result.fields).toEqual([
      { label: "Yeni Durum", value: "HITAM" },
      { label: "Gerekçe", value: "Dosya kapandı" },
    ]);
  });

  it("yalnız status (reason yok) -> yalnız Yeni Durum alanı", () => {
    const result = projectChangeStatus({ status: "ISLEMDE" }, {});
    expect(result.kind).toBe("summary");
    expect(result.fields).toEqual([{ label: "Yeni Durum", value: "ISLEMDE" }]);
  });

  it("reason null ise atlanır (uydurma yok)", () => {
    const result = projectChangeStatus({ status: "ISLEMDE", reason: null }, {});
    expect(result.fields).toEqual([{ label: "Yeni Durum", value: "ISLEMDE" }]);
  });

  it("reason boş string ise atlanır", () => {
    const result = projectChangeStatus({ status: "ISLEMDE", reason: "   " }, {});
    expect(result.fields).toEqual([{ label: "Yeni Durum", value: "ISLEMDE" }]);
  });

  it("status yoksa veya string değilse -> unsafe", () => {
    expect(projectChangeStatus({}, {}).kind).toBe("unsafe");
    expect(projectChangeStatus({ status: 123 }, {}).kind).toBe("unsafe");
    expect(projectChangeStatus(null, {}).kind).toBe("unsafe");
    expect(projectChangeStatus("HITAM", {}).kind).toBe("unsafe");
  });
});
