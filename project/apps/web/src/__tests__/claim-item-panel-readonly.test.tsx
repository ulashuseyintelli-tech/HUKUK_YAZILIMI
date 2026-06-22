import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
// Doğrudan import (barrel DEĞİL): barrel ProfessionalClaimItemForm→interest-type-resolver→
// @shared/types zincirini çeker, vitest bu alias'ı çözmez. @/lib/api mock'landığı için
// ClaimItemPanel'in kendi import zinciri test ortamında güvenli.
import { ClaimItemPanel } from "@/components/claim-item/ClaimItemPanel";
import { api } from "@/lib/api";

// PR-5a: readOnly — mutation aksiyonları gizli. PR-5c: metadataEdit — yalnız metadata düzenlenir.
vi.mock("@/lib/api", () => ({
  api: { get: vi.fn(), post: vi.fn(), delete: vi.fn(), put: vi.fn() },
}));

const get = api.get as unknown as ReturnType<typeof vi.fn>;
const put = api.put as unknown as ReturnType<typeof vi.fn>;

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

const LOCK_NOTE = "Tutar ve kalem tipi, bakiye cutover tamamlanana kadar düzenlenemez.";

function primeApi() {
  get.mockImplementation((url: string) =>
    url.endsWith("/summary")
      ? Promise.resolve({ data: { data: mockSummary } })
      : Promise.resolve({ data: { data: mockItems } }),
  );
  put.mockResolvedValue({ data: { data: { ...mockItems[0] } } });
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

  it("readOnly (metadataEdit yok): Düzenle butonu render EDİLMEZ", async () => {
    render(<ClaimItemPanel caseId="c1" readOnly />);
    await waitFor(() => expect(screen.getByText("TOPLAM ALACAK")).toBeTruthy());
    expect(screen.queryByText("Düzenle")).toBeNull();
  });

  it("readOnly=false (varsayılan): mutation butonları görünür (regresyon)", async () => {
    render(<ClaimItemPanel caseId="c1" />);
    await waitFor(() => expect(screen.getByText("Ana Para Ekle")).toBeTruthy());
    expect(screen.getByText("Faizleri Yeniden Hesapla")).toBeTruthy();
  });
});

describe("ClaimItemPanel — PR-5c metadata-only edit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    primeApi();
  });

  it("metadataEdit: kalem satırında 'Düzenle' butonu görünür", async () => {
    render(<ClaimItemPanel caseId="c1" readOnly metadataEdit />);
    await waitFor(() => expect(screen.getByText("Düzenle")).toBeTruthy());
    // Mutation aksiyonları yine gizli (readOnly korunur):
    expect(screen.queryByTitle("Sil")).toBeNull();
    expect(screen.queryByText("Ana Para Ekle")).toBeNull();
  });

  it("Düzenle modalı: tutar ve kalem tipi alanları KİLİTLİ (disabled), açıklama düzenlenebilir", async () => {
    render(<ClaimItemPanel caseId="c1" readOnly metadataEdit />);
    await waitFor(() => expect(screen.getByText("Düzenle")).toBeTruthy());
    fireEvent.click(screen.getByText("Düzenle"));

    // Kilitli alanlar: title=LOCK_NOTE taşıyan 2 input (Kalem Tipi + Tutar), ikisi de disabled.
    const locked = screen.getAllByTitle(LOCK_NOTE);
    expect(locked).toHaveLength(2);
    locked.forEach((el) => expect((el as HTMLInputElement).disabled).toBe(true));

    // Açıklama düzenlenebilir (disabled DEĞİL).
    const desc = screen.getByPlaceholderText("Açıklama...") as HTMLInputElement;
    expect(desc.disabled).toBe(false);
  });

  it("KIRMIZI ÇİZGİ: kaydet payload'u YALNIZ metadata içerir — amount/itemType/finansal alanlar SIZMAZ", async () => {
    render(<ClaimItemPanel caseId="c1" readOnly metadataEdit />);
    await waitFor(() => expect(screen.getByText("Düzenle")).toBeTruthy());
    fireEvent.click(screen.getByText("Düzenle"));

    const desc = screen.getByPlaceholderText("Açıklama...") as HTMLInputElement;
    fireEvent.change(desc, { target: { value: "Güncellenmiş açıklama" } });
    fireEvent.click(screen.getByText("Kaydet"));

    await waitFor(() => expect(put).toHaveBeenCalledTimes(1));
    const [url, payload] = put.mock.calls[0];
    expect(url).toBe("/claim-items/i1");

    // Metadata var:
    expect(payload).toHaveProperty("description", "Güncellenmiş açıklama");

    // Finansal/yapısal alanlar ASLA gönderilmez:
    expect(payload).not.toHaveProperty("amount");
    expect(payload).not.toHaveProperty("itemType");
    expect(payload).not.toHaveProperty("currency");
    expect(payload).not.toHaveProperty("status");
    expect(payload).not.toHaveProperty("collectedAmount");
    expect(payload).not.toHaveProperty("demandedAmount");
  });
});
