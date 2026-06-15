import { describe, it, expect } from "vitest";
import { buildDebtorQuery } from "@/lib/debtor-query";

describe("buildDebtorQuery (PR-D3 server-side liste)", () => {
  it("page + limit her zaman set edilir", () => {
    const q = new URLSearchParams(buildDebtorQuery({ page: 2, limit: 25 }));
    expect(q.get("page")).toBe("2");
    expect(q.get("limit")).toBe("25");
    expect(q.get("search")).toBeNull();
    expect(q.get("type")).toBeNull();
  });

  it("search trim'lenip eklenir; boş/whitespace eklenmez", () => {
    expect(new URLSearchParams(buildDebtorQuery({ page: 1, limit: 25, search: "  ahmet " })).get("search")).toBe("ahmet");
    expect(new URLSearchParams(buildDebtorQuery({ page: 1, limit: 25, search: "   " })).get("search")).toBeNull();
    expect(new URLSearchParams(buildDebtorQuery({ page: 1, limit: 25, search: "" })).get("search")).toBeNull();
  });

  it("type gönderilir; 'ALL' gönderilmez (tüm türler)", () => {
    expect(new URLSearchParams(buildDebtorQuery({ page: 1, limit: 25, type: "ESTATE" })).get("type")).toBe("ESTATE");
    expect(new URLSearchParams(buildDebtorQuery({ page: 1, limit: 25, type: "INDIVIDUAL" })).get("type")).toBe("INDIVIDUAL");
    expect(new URLSearchParams(buildDebtorQuery({ page: 1, limit: 25, type: "ALL" })).get("type")).toBeNull();
  });

  it("Tereke (ESTATE) filtresi + arama + sayfa birlikte", () => {
    const q = new URLSearchParams(buildDebtorQuery({ page: 3, limit: 25, search: "miras", type: "ESTATE" }));
    expect(q.get("page")).toBe("3");
    expect(q.get("search")).toBe("miras");
    expect(q.get("type")).toBe("ESTATE");
  });

  it("PR-D5-c: sortBy verilince sortBy+sortOrder eklenir; yoksa hiçbiri (backend default)", () => {
    const sorted = new URLSearchParams(buildDebtorQuery({ page: 1, limit: 25, sortBy: "name", sortOrder: "asc" }));
    expect(sorted.get("sortBy")).toBe("name");
    expect(sorted.get("sortOrder")).toBe("asc");
    // sortOrder normalize: geçersiz → desc
    expect(new URLSearchParams(buildDebtorQuery({ page: 1, limit: 25, sortBy: "type", sortOrder: "x" })).get("sortOrder")).toBe("desc");
    // sortBy yok → sort param yok
    const none = new URLSearchParams(buildDebtorQuery({ page: 1, limit: 25 }));
    expect(none.get("sortBy")).toBeNull();
    expect(none.get("sortOrder")).toBeNull();
  });
});
