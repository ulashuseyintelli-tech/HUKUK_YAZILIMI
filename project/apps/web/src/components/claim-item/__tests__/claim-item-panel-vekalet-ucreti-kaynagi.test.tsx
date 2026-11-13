/**
 * Alacak Kalemleri paneli — vekâlet ücretinin hukuki kaynağı (owner K1, 13.11.2026 GO-COMPLETE "İlam kalemleri için yapısal ayrım…").
 *
 * Kural: kaynak YALNIZ kayıtlı `attorneyFeeBasis` alanından gösterilir; açıklama ("İLAM VEKALET ÜCRETİ") türü belirlemez.
 * Boş değer "Türü belirtilmemiş" görünür. Düzenleme penceresinde seçim yüksek etkili alandır: değişirse onaya gönderilir;
 * "Türü belirtilmemiş" seçimi açık null gönderir; değişmezse alan yükte YOKTUR. Vekâlet ücreti dışı kalemde seçim yoktur.
 * Tutarlar SENTETİK.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ClaimItemPanel } from "../ClaimItemPanel";
import { api } from "@/lib/api";

vi.mock("@/lib/api", () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

const apiGet = api.get as unknown as ReturnType<typeof vi.fn>;
const apiPut = api.put as unknown as ReturnType<typeof vi.fn>;

const toplam = (d: Record<string, number>) => ({
  principal: 0, preInterest: 0, postInterest: 0, totalInterest: 0, expense: 0, fee: 0, attorneyFee: 0, penalty: 0, tax: 0, other: 0, grandTotal: 0, ...d,
});
const kalem = (id: string, itemType: string, amount: number, description: string, attorneyFeeBasis?: string | null) => ({
  id, itemType, amount, currency: "TRY", description, status: "ACTIVE", isCalculated: false,
  ...(attorneyFeeBasis === undefined ? {} : { attorneyFeeBasis }),
});

function yanitla(items: unknown[]) {
  const totals = toplam({ attorneyFee: 6000, expense: 250, grandTotal: 6250 });
  const summary = {
    caseId: "case-1",
    currency: "TRY",
    items: [],
    totals,
    calculationDate: "2026-03-01T00:00:00.000Z",
    paraBirimiDurumu: {
      durum: "TEK_PARA_BIRIMI", toplamGosterilebilir: true, gerekce: null, mesaj: null, alacakParaBirimi: "TRY",
      paraBirimleri: ["TRY"], paraBirimiEksikKalemSayisi: 0, toplamlarParaBirimiBazinda: [{ paraBirimi: "TRY", kalemSayisi: items.length, totals }],
    },
  };
  apiGet.mockImplementation((url: string) => Promise.resolve(url.endsWith("/summary") ? { data: { data: summary } } : { data: { data: items } }));
}

const ITEMS = [
  kalem("vu-ilam", "ATTORNEY_FEE", 5000, "Sentetik ilam vekâlet ücreti", "JUDGMENT_AWARDED"),
  kalem("vu-bos", "ATTORNEY_FEE", 1000, "İLAM VEKALET ÜCRETİ", null),
  kalem("yg", "YARGILAMA_GIDERI", 250, "Sentetik yargılama gideri"),
];

async function duzenle(itemId: string) {
  render(<ClaimItemPanel caseId="case-1" readOnly metadataEdit />);
  await screen.findByText("Alacak Kalemleri (3)");
  const satir = screen.getByText(ITEMS.find((i) => i.id === itemId)!.description).closest("div.p-4") as HTMLElement;
  fireEvent.click(satir.querySelector("button[title^='Metadata']") as HTMLElement);
  await screen.findByText("Kalem Metadata Düzenle");
}

beforeEach(() => {
  apiGet.mockReset();
  apiPut.mockReset();
  apiPut.mockResolvedValue({ data: { data: { applied: false, approvalRequired: true } } });
  vi.spyOn(window, "alert").mockImplementation(() => undefined);
  yanitla(ITEMS);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("ClaimItemPanel — vekâlet ücreti kaynağı (attorneyFeeBasis)", () => {
  it("satır rozeti kayıtlı alandan: ILAM → 'İlam vekâlet ücreti'; boş → 'Türü belirtilmemiş' (açıklama 'İLAM …' olsa da); başka kalemde rozet yok", async () => {
    render(<ClaimItemPanel caseId="case-1" readOnly metadataEdit />);
    await screen.findByText("Alacak Kalemleri (3)");
    expect(screen.getByTestId("claim-item-attorney-fee-basis-vu-ilam").textContent).toBe("İlam vekâlet ücreti");
    expect(screen.getByTestId("claim-item-attorney-fee-basis-vu-bos").textContent).toBe("Türü belirtilmemiş");
    expect(screen.queryByTestId("claim-item-attorney-fee-basis-yg")).toBeNull();
  });

  it("boş kaynak → İlam seçilir: PUT yükünde attorneyFeeBasis=JUDGMENT_AWARDED; buton 'Onaya Gönder'", async () => {
    await duzenle("vu-bos");
    const select = screen.getByTestId("claim-item-attorney-fee-basis-select") as HTMLSelectElement;
    expect(select.value).toBe("");
    fireEvent.change(select, { target: { value: "JUDGMENT_AWARDED" } });
    const gonder = screen.getByRole("button", { name: "Onaya Gönder" });
    fireEvent.click(gonder);
    await waitFor(() => expect(apiPut).toHaveBeenCalledTimes(1));
    expect(apiPut.mock.calls[0][0]).toBe("/claim-items/vu-bos");
    expect(apiPut.mock.calls[0][1]).toMatchObject({ attorneyFeeBasis: "JUDGMENT_AWARDED" });
  });

  it("dolu kaynak → 'Türü belirtilmemiş' seçimi açık null gönderir", async () => {
    await duzenle("vu-ilam");
    const select = screen.getByTestId("claim-item-attorney-fee-basis-select") as HTMLSelectElement;
    expect(select.value).toBe("JUDGMENT_AWARDED");
    fireEvent.change(select, { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Onaya Gönder" }));
    await waitFor(() => expect(apiPut).toHaveBeenCalledTimes(1));
    expect(apiPut.mock.calls[0][1]).toHaveProperty("attorneyFeeBasis", null);
  });

  it("kaynak değişmezse alan yükte YOK (yalnız düşük etkili alan → 'Kaydet')", async () => {
    apiPut.mockResolvedValue({ data: { data: { applied: true, approvalRequired: false } } });
    await duzenle("vu-ilam");
    fireEvent.change(screen.getByPlaceholderText("Açıklama..."), { target: { value: "Sentetik yeni açıklama" } });
    fireEvent.click(screen.getByRole("button", { name: "Kaydet" }));
    await waitFor(() => expect(apiPut).toHaveBeenCalledTimes(1));
    expect(apiPut.mock.calls[0][1]).not.toHaveProperty("attorneyFeeBasis");
  });

  it("vekâlet ücreti dışı kalemde (YARGILAMA_GIDERI) kaynak seçimi gösterilmez", async () => {
    await duzenle("yg");
    expect(screen.queryByTestId("claim-item-attorney-fee-basis-select")).toBeNull();
  });
});
