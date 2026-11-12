/**
 * Alacak Kalemleri paneli — Yargılama Gideri türünün okunması (owner 12.11.2026 GO-COMPLETE "P02 yargılama gideri temsil engelini gider").
 *
 * Kural: API `itemType = YARGILAMA_GIDERI` kalemi kendi etiketiyle ("Yargılama Gideri") gösterilir; "Diğer" ya da "Masraf"
 * etiketine düşmez, tebligat masrafı olarak yazılmaz. Özet tutarları sunucudan gelir (istemci hesap yapmaz): yargılama gideri
 * masraf toplamında bir kez görünür. EXPENSE kalemi "Masraf" etiketiyle AYNEN kalır. Tutarlar SENTETİK.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { ClaimItemPanel } from "../ClaimItemPanel";
import { api } from "@/lib/api";

vi.mock("@/lib/api", () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

const apiGet = api.get as unknown as ReturnType<typeof vi.fn>;

const toplam = (d: Record<string, number>) => ({
  principal: 0, preInterest: 0, postInterest: 0, totalInterest: 0, expense: 0, fee: 0, attorneyFee: 0, penalty: 0, tax: 0, other: 0, grandTotal: 0, ...d,
});
const kalem = (id: string, itemType: string, amount: number, description: string) => ({
  id, itemType, amount, currency: "TRY", description, status: "ACTIVE", isCalculated: false,
});

function yanitla(items: unknown[], totals: Record<string, number>, ozetKalemleri: unknown[]) {
  const summary = {
    caseId: "case-1",
    currency: "TRY",
    items: ozetKalemleri,
    totals,
    calculationDate: "2026-03-01T00:00:00.000Z",
    paraBirimiDurumu: {
      durum: "TEK_PARA_BIRIMI", toplamGosterilebilir: true, gerekce: null, mesaj: null, alacakParaBirimi: "TRY",
      paraBirimleri: ["TRY"], paraBirimiEksikKalemSayisi: 0, toplamlarParaBirimiBazinda: [{ paraBirimi: "TRY", kalemSayisi: items.length, totals }],
    },
  };
  apiGet.mockImplementation((url: string) => Promise.resolve(url.endsWith("/summary") ? { data: { data: summary } } : { data: { data: items } }));
}

/** Kalem satırının tür etiketi (satırdaki ilk kalın yazı). */
const turEtiketleri = (container: HTMLElement) =>
  Array.from(container.querySelectorAll(".divide-y span.font-medium")).map((el) => (el.textContent ?? "").trim());

// Blok gövde ŞART: beforeEach'ten dönen işlev vitest'te temizlik işlevi sayılır (mockReset taklidin kendisini döndürür).
beforeEach(() => {
  apiGet.mockReset();
});
afterEach(() => {
  cleanup();
});

describe("ClaimItemPanel — Yargılama Gideri türü", () => {
  it("YARGILAMA_GIDERI kalemi kendi etiketiyle görünür; 'Diğer' / 'Masraf' / tebligat değil; masraf toplamı sunucudan bir kez", async () => {
    const totals = toplam({ expense: 415, attorneyFee: 12500, grandTotal: 12915 });
    yanitla(
      [kalem("i1", "ATTORNEY_FEE", 12500, "Sentetik ilam vekâlet ücreti"), kalem("i2", "YARGILAMA_GIDERI", 415, "Sentetik ilam yargılama gideri")],
      totals,
      [
        { type: "ATTORNEY_FEE", label: "Vekalet Ücreti", amount: 12500, count: 1 },
        { type: "YARGILAMA_GIDERI", label: "Yargılama Gideri", amount: 415, count: 1 },
      ],
    );
    const { container } = render(<ClaimItemPanel caseId="case-1" readOnly metadataEdit />);
    await screen.findByText("Alacak Kalemleri (2)");

    expect(turEtiketleri(container)).toEqual(["Vekalet Ücreti", "Yargılama Gideri"]);
    expect(container.textContent).not.toMatch(/Tebligat/);
    expect(screen.getByText("Sentetik ilam yargılama gideri")).toBeTruthy();
  });

  it("gerileme: EXPENSE kalemi 'Masraf' etiketiyle AYNEN; bilinmeyen tür 'Diğer'", async () => {
    const totals = toplam({ expense: 77, other: 5, grandTotal: 82 });
    yanitla(
      [kalem("i1", "EXPENSE", 77, "Sentetik gider"), kalem("i2", "BILINMEYEN_TUR", 5, "Sentetik bilinmeyen")],
      totals,
      [{ type: "EXPENSE", label: "Masraf", amount: 77, count: 1 }],
    );
    const { container } = render(<ClaimItemPanel caseId="case-1" readOnly metadataEdit />);
    await screen.findByText("Alacak Kalemleri (2)");
    expect(turEtiketleri(container)).toEqual(["Masraf", "Diğer"]);
  });
});
