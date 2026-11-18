/**
 * Alacak Kalemleri paneli — anaparasız dosyada üst özet kutusu ve "Alacak Özeti" (owner 18.11.2026).
 *
 * Kural: bilinmeyen faiz "belirlenemedi"; sunucunun hesapladığı gerçek sıfır "0,00"; eksik toplam nihai borç gibi sunulmaz.
 * Kaynak: sunucunun anaparasız dökümü (`calculation-summary.anaparasizKalemDokumu`: faiz toplamı yalnız her kalemin faiz durumu
 * belliyken sayı, aksi hâlde null; nihai borç her zaman null). İstemci hesap yapmaz. Anaparalı dosyada gösterim DEĞİŞMEZ.
 * Tutarlar SENTETİK.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
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
const ANAPARASIZ_KALEMLER = [kalem("i1", "ATTORNEY_FEE", 2000, "Sentetik ilam vekâlet ücreti"), kalem("i2", "YARGILAMA_GIDERI", 146, "Sentetik yargılama gideri")];
const ANAPARASIZ_TOPLAM = toplam({ expense: 146, attorneyFee: 2000, grandTotal: 2146 });

const dokum = (faizToplami: number | null, faizDurumu: "BELIRLENEMEDI" | "HESAPLANMADI" | "HESAPLANDI") => ({
  durum: "NIHAI_TOPLAM_HESAPLANAMADI",
  otorite: "ACIKLAYICI_DOKUM",
  kanonikOtorite: "UNSAFE_FOR_PRIMARY_DISPLAY",
  gerekce: "NO_PRINCIPAL_BASIS",
  paraBirimleri: [{ paraBirimi: "TRY", kalemler: [], kalemTutarlariToplami: 2146, faizToplami, takipOncesiFaizToplami: null, takipSonrasiFaizToplami: null, kalemVeFaizToplami: null }],
  faizDurumu,
  nihaiBorcToplami: null,
  mesaj: "Sentetik açıklayıcı döküm.",
});

/** calc: hesap özeti yanıtı (gövde) ya da Error (okuma hatası). Sarmalı ({ data }) ve düz gövde ikisi de sınanır. */
function yanitla(items: unknown[], totals: Record<string, number>, calc: unknown) {
  const summary = {
    caseId: "case-1", currency: "TRY", items: [], totals, calculationDate: "2026-03-01T00:00:00.000Z",
    paraBirimiDurumu: {
      durum: "TEK_PARA_BIRIMI", toplamGosterilebilir: true, gerekce: null, mesaj: null, alacakParaBirimi: "TRY",
      paraBirimleri: ["TRY"], paraBirimiEksikKalemSayisi: 0, toplamlarParaBirimiBazinda: [{ paraBirimi: "TRY", kalemSayisi: items.length, totals }],
    },
  };
  apiGet.mockImplementation((url: string) => {
    if (url.includes("/calculation-summary")) return calc instanceof Error ? Promise.reject(calc) : Promise.resolve({ data: calc });
    return Promise.resolve(url.endsWith("/summary") ? { data: { data: summary } } : { data: { data: items } });
  });
}

const calcCalls = () => apiGet.mock.calls.filter(([url]) => String(url).includes("/calculation-summary")).length;

beforeEach(() => {
  apiGet.mockReset();
});
afterEach(() => {
  cleanup();
});

describe("ClaimItemPanel — anaparasız dosyada faiz ve toplam", () => {
  it("faiz durumu belirsiz (sunucu faiz toplamı null): 'Toplam Faiz' belirlenemedi, ₺0,00 YAZILMAZ; Toplam Alacak hesaplanamadı", async () => {
    yanitla(ANAPARASIZ_KALEMLER, ANAPARASIZ_TOPLAM, { anaparasizKalemDokumu: dokum(null, "BELIRLENEMEDI") });
    render(<ClaimItemPanel caseId="case-1" readOnly metadataEdit />);
    await screen.findByText("Alacak Kalemleri (2)");

    await waitFor(() => expect(screen.getByTestId("claim-summary-interest-undetermined").textContent).toBe("belirlenemedi"));
    expect(screen.queryByTestId("claim-summary-interest-principal-free")).toBeNull();
    expect(screen.getByTestId("claim-summary-total-not-final").textContent).toBe("hesaplanamadı");
    expect(screen.getByTestId("claim-summary-grand-total-not-final").textContent).toBe("hesaplanamadı");
    expect(screen.getByTestId("claim-summary-principal-free-interest-row").textContent).toContain("belirlenemedi");
    expect(screen.getByTestId("claim-summary-principal-free-note").textContent).toContain("Nihai borç toplamı hesaplanamadı");
    // Kalem toplamı gösterilir ama "nihai borç değildir" notuyla
    expect(document.body.textContent).toMatch(/Kalem tutarları toplamı ₺2\.146,00; nihai borç değildir/);
    // Hiçbir yerde faiz için ₺0,00 yazılmaz
    expect(document.body.textContent).not.toMatch(/Toplam Faiz₺0,00/);
    expect(calcCalls()).toBe(1);
  });

  it("sunucu gerçek sıfır hesapladıysa (faiz toplamı 0) 'Toplam Faiz' ₺0,00 gösterilir", async () => {
    yanitla(ANAPARASIZ_KALEMLER, ANAPARASIZ_TOPLAM, { data: { anaparasizKalemDokumu: dokum(0, "HESAPLANDI") } });
    render(<ClaimItemPanel caseId="case-1" readOnly metadataEdit />);
    await screen.findByText("Alacak Kalemleri (2)");

    await waitFor(() => expect(screen.getByTestId("claim-summary-interest-principal-free").textContent).toBe("₺0,00"));
    expect(screen.queryByTestId("claim-summary-interest-undetermined")).toBeNull();
    expect(screen.getByTestId("claim-summary-total-not-final").textContent).toBe("hesaplanamadı");
  });

  it("sunucu faizi hesapladıysa değeri aynen gösterilir; toplam yine nihai borç değildir", async () => {
    yanitla(ANAPARASIZ_KALEMLER, ANAPARASIZ_TOPLAM, { anaparasizKalemDokumu: dokum(361.35, "HESAPLANDI") });
    render(<ClaimItemPanel caseId="case-1" readOnly metadataEdit />);
    await screen.findByText("Alacak Kalemleri (2)");

    await waitFor(() => expect(screen.getByTestId("claim-summary-interest-principal-free").textContent).toBe("₺361,35"));
    expect(screen.getByTestId("claim-summary-principal-free-interest-row").textContent).toContain("₺361,35");
    expect(screen.getByTestId("claim-summary-grand-total-not-final").textContent).toBe("hesaplanamadı");
  });

  it("hesap özeti okunamazsa (hata) faiz belirlenemedi; ₺0,00 YAZILMAZ; panel çalışır", async () => {
    yanitla(ANAPARASIZ_KALEMLER, ANAPARASIZ_TOPLAM, new Error("Sentetik okuma hatası"));
    render(<ClaimItemPanel caseId="case-1" readOnly metadataEdit />);
    await screen.findByText("Alacak Kalemleri (2)");

    await waitFor(() => expect(screen.getByTestId("claim-summary-interest-undetermined")).toBeTruthy());
    expect(screen.getByTestId("claim-summary-total-not-final").textContent).toBe("hesaplanamadı");
    expect(screen.getByText("Sentetik ilam vekâlet ücreti")).toBeTruthy();
  });

  it("anaparalı dosya: hesap özeti okunmaz; gösterim AYNEN (faiz ve toplam sunucu özetinden)", async () => {
    const totals = toplam({ principal: 10000, totalInterest: 250, preInterest: 250, grandTotal: 10250 });
    yanitla([kalem("i1", "PRINCIPAL", 10000, "Sentetik anapara")], totals, { anaparasizKalemDokumu: dokum(null, "BELIRLENEMEDI") });
    render(<ClaimItemPanel caseId="case-1" readOnly metadataEdit />);
    await screen.findByText("Alacak Kalemleri (1)");

    expect(calcCalls()).toBe(0);
    expect(screen.queryByTestId("claim-summary-interest-undetermined")).toBeNull();
    expect(screen.queryByTestId("claim-summary-total-not-final")).toBeNull();
    expect(document.body.textContent).toContain("₺250,00");
    expect(document.body.textContent).toContain("₺10.250,00");
  });

  it("sunucu dosyanın anaparasız olmadığını söylerse (döküm yok) gösterim AYNEN", async () => {
    const totals = toplam({ expense: 146, grandTotal: 146 });
    yanitla([kalem("i1", "EXPENSE", 146, "Sentetik masraf")], totals, { anaparasizKalemDokumu: null });
    render(<ClaimItemPanel caseId="case-1" readOnly metadataEdit />);
    await screen.findByText("Alacak Kalemleri (1)");

    await waitFor(() => expect(calcCalls()).toBe(1));
    await waitFor(() => expect(screen.queryByTestId("claim-summary-interest-loading")).toBeNull());
    expect(screen.queryByTestId("claim-summary-interest-undetermined")).toBeNull();
    expect(screen.queryByTestId("claim-summary-total-not-final")).toBeNull();
  });
});
