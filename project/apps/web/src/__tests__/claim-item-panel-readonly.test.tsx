import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
// Doğrudan import (barrel DEĞİL): barrel ProfessionalClaimItemForm→interest-type-resolver→
// @shared/types zincirini çeker, vitest bu alias'ı çözmez. @/lib/api mock'landığı için
// ClaimItemPanel'in kendi import zinciri test ortamında güvenli.
import { ClaimItemPanel } from "@/components/claim-item/ClaimItemPanel";
import { api } from "@/lib/api";

// PR-5a: ClaimItemPanel readOnly — mutation aksiyonları (ekle/sil/yeniden-hesapla) gizli olmalı.
vi.mock("@/lib/api", () => ({
  api: { get: vi.fn(), post: vi.fn(), delete: vi.fn() },
}));

const get = api.get as unknown as ReturnType<typeof vi.fn>;

const mockItems = [
  { id: "i1", itemType: "PRINCIPAL", amount: 1000, currency: "TRY", description: "Asıl Alacak" },
];
const mockSummary = {
  currency: "TRY",
  totals: {
    principal: 1000, preInterest: 0, postInterest: 0, totalInterest: 0,
    expense: 0, fee: 0, attorneyFee: 0, penalty: 0, tax: 0, other: 0, grandTotal: 1000,
  },
};

function primeApi() {
  get.mockImplementation((url: string) =>
    url.endsWith("/summary")
      ? Promise.resolve({ data: { data: mockSummary } })
      : Promise.resolve({ data: { data: mockItems } }),
  );
}

describe("ClaimItemPanel — PR-5a readOnly surfacing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    primeApi();
  });

  it("readOnly: özet/liste render edilir, mutation butonları render EDİLMEZ", async () => {
    render(<ClaimItemPanel caseId="c1" readOnly />);
    await waitFor(() => expect(screen.getByText("TOPLAM ALACAK")).toBeTruthy());
    // Tüm mutation aksiyonları + deprecated recalculate gizli:
    expect(screen.queryByText("Ana Para Ekle")).toBeNull();
    expect(screen.queryByText("Faiz Ekle")).toBeNull();
    expect(screen.queryByText("Masraf Ekle")).toBeNull();
    expect(screen.queryByText("Vekalet Ücreti")).toBeNull();
    expect(screen.queryByText("Faizleri Yeniden Hesapla")).toBeNull();
    expect(screen.queryByTitle("Sil")).toBeNull();
  });

  it("readOnly=false (varsayılan): mutation butonları görünür (regresyon)", async () => {
    render(<ClaimItemPanel caseId="c1" />);
    await waitFor(() => expect(screen.getByText("Ana Para Ekle")).toBeTruthy());
    expect(screen.getByText("Faizleri Yeniden Hesapla")).toBeTruthy();
  });
});
