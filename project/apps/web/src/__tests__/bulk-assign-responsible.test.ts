// M2-G5d-2: toplu gerçek-kişi atama helper'ı (multi-PATCH, Promise.allSettled, partial success).
import { describe, it, expect, vi } from "vitest";
import { bulkAssignResponsible } from "@/lib/bulk-assign-responsible";

describe("bulkAssignResponsible (M2-G5d-2)", () => {
  it("hepsi başarılı → success=tüm id'ler, failed boş; PATCH gövdesi LAWYER", async () => {
    const patch = vi.fn().mockResolvedValue({});
    const res = await bulkAssignResponsible(["c1", "c2", "c3"], { type: "LAWYER", id: "L1" }, patch);
    expect(res.success).toEqual(["c1", "c2", "c3"]);
    expect(res.failed).toEqual([]);
    expect(patch).toHaveBeenCalledTimes(3);
    expect(patch).toHaveBeenCalledWith("c1", { responsibleLawyerId: "L1" });
  });

  it("STAFF → gövde responsibleStaffId", async () => {
    const patch = vi.fn().mockResolvedValue({});
    await bulkAssignResponsible(["c1"], { type: "STAFF", id: "S1" }, patch);
    expect(patch).toHaveBeenCalledWith("c1", { responsibleStaffId: "S1" });
  });

  it("kısmi başarı → success + failed (id + mesaj) doğru ayrılır", async () => {
    const patch = vi.fn().mockImplementation((id: string) =>
      id === "c2" ? Promise.reject(new Error("400 geçersiz")) : Promise.resolve({})
    );
    const res = await bulkAssignResponsible(["c1", "c2", "c3"], { type: "LAWYER", id: "L1" }, patch);
    expect(res.success).toEqual(["c1", "c3"]);
    expect(res.failed).toEqual([{ id: "c2", error: "400 geçersiz" }]);
  });

  it("hepsi başarısız → success boş, failed hepsi; mesajsız hata → fallback metin", async () => {
    const patch = vi.fn().mockRejectedValue({});
    const res = await bulkAssignResponsible(["c1", "c2"], { type: "STAFF", id: "S1" }, patch);
    expect(res.success).toEqual([]);
    expect(res.failed.map((f) => f.id)).toEqual(["c1", "c2"]);
    expect(res.failed[0].error).toBe("Atama başarısız");
  });

  it("boş seçim → patch çağrılmaz, sonuç boş", async () => {
    const patch = vi.fn();
    const res = await bulkAssignResponsible([], { type: "LAWYER", id: "L1" }, patch);
    expect(patch).not.toHaveBeenCalled();
    expect(res).toEqual({ success: [], failed: [] });
  });
});
