/**
 * P02 kullanılabilirlik notu (owner 18.11.2026) — dar ve uzun pencereler: kalem düzenleme (U-5) ve borçlu sorumluluğu seçimi (U-6).
 *
 * Yerleşim sözleşmesi (alan, kural ve istek DEĞİŞMEZ):
 *  - pencere bir diyalogdur (`role="dialog"`, `aria-modal`), başlığa bağlıdır;
 *  - yalnız alan gövdesi kayar; işlem düğmeleri gövdenin DIŞINDA, her zaman görünür;
 *  - masaüstünde iki sütun (md / lg), küçük ekranda tek sütun (sütun sınıfı yalnız kesme noktasıyla);
 *  - seçim çekmecesinde işlem düğmeleri SOLA yaslı kalır (yüzen "Hızlı İşlemler" düğmesi sağ altta);
 *  - Escape pencereyi kapatır.
 * jsdom yerleşim ölçmez; çalışan arayüzdeki ölçüm ayrı kayıttadır. Tutarlar SENTETİK.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const apiMock = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn(),
  getCaseClaimLiability: vi.fn(),
  previewClaimLiability: vi.fn(),
  requestClaimLiability: vi.fn(),
  getClaimLiabilityHistory: vi.fn(),
}));
vi.mock("@/lib/api", () => ({ api: apiMock }));

import { ClaimItemPanel } from "../ClaimItemPanel";

const totals = { principal: 0, preInterest: 0, postInterest: 0, totalInterest: 0, expense: 0, fee: 0, attorneyFee: 1000, penalty: 0, tax: 0, other: 100, grandTotal: 1100 };
const ITEMS = [
  {
    id: "vu", itemType: "ATTORNEY_FEE", amount: 1000, currency: "TRY", description: "Sentetik vekâlet ücreti", status: "ACTIVE",
    isCalculated: false, attorneyFeeBasis: null, interestAccrualStatus: "UNKNOWN", interestType: "YASAL", interestTypeCode: "LEGAL_3095",
  },
  {
    id: "yg", itemType: "YARGILAMA_GIDERI", amount: 100, currency: "TRY", description: "Sentetik gider", status: "ACTIVE",
    isCalculated: false, interestAccrualStatus: "UNKNOWN", interestType: "YASAL", interestTypeCode: "LEGAL_3095",
  },
];

function yanitlar() {
  const summary = {
    caseId: "case-1", currency: "TRY", items: [], totals, calculationDate: "2026-03-01T00:00:00.000Z",
    paraBirimiDurumu: {
      durum: "TEK_PARA_BIRIMI", toplamGosterilebilir: true, gerekce: null, mesaj: null, alacakParaBirimi: "TRY",
      paraBirimleri: ["TRY"], paraBirimiEksikKalemSayisi: 0, toplamlarParaBirimiBazinda: [{ paraBirimi: "TRY", kalemSayisi: 2, totals }],
    },
  };
  apiMock.get.mockImplementation((url: string) => Promise.resolve(url.endsWith("/summary") ? { data: { data: summary } } : { data: { data: ITEMS } }));
  apiMock.getCaseClaimLiability.mockResolvedValue({
    kalemler: ITEMS.map((i) => ({
      claimItemId: i.id, kalemTuru: i.itemType, aciklama: i.description, paraBirimi: "TRY", kalemDurumu: "ACTIVE",
      sorumlulukTuru: "BELIRLENMEDI", secimId: null, secimSurumu: null, tavanKapsami: null, tutar: i.amount, tahsilEdilen: 0,
      ortakKalan: i.amount, atifsizMahsup: 0, uzlasiyor: true, engeller: [], borcluGerekli: true, taraflar: [],
    })),
    borclular: [
      { caseDebtorId: "cd-1", debtorId: "b1", ad: "Sentetik Borçlu 1", rol: "ASIL_BORCLU", etkin: true },
      { caseDebtorId: "cd-2", debtorId: "b2", ad: "Sentetik Borçlu 2", rol: "ASIL_BORCLU", etkin: true },
    ],
    dosyaKalani: [{ paraBirimi: "TRY", kalan: 1100 }],
    borcluGerekli: true,
    secimYazmaAcik: true,
    aciklamalar: { belirlenmedi: "n", tavanKapsami: "t", asanOdeme: "a", isleyenFaiz: "f" },
  });
  apiMock.getClaimLiabilityHistory.mockResolvedValue({ surumler: [] });
}

/** Düğme kapsayıcısı kaydırılan gövdenin içinde değil; gövde kayar. */
function gövdeDışındaDüğmeler(body: HTMLElement, actions: HTMLElement) {
  expect(body.className).toContain("overflow-y-auto");
  expect(body.contains(actions)).toBe(false);
  expect(actions.className).not.toContain("overflow-y-auto");
}

beforeEach(() => {
  Object.values(apiMock).forEach((fn) => fn.mockReset());
  vi.spyOn(window, "alert").mockImplementation(() => undefined);
  yanitlar();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("U-5 kalem düzenleme penceresi", () => {
  async function aç() {
    render(<ClaimItemPanel caseId="case-1" readOnly metadataEdit />);
    await screen.findByText("Alacak Kalemleri (2)");
    const satir = screen.getByText("Sentetik vekâlet ücreti").closest("div.p-4") as HTMLElement;
    fireEvent.click(satir.querySelector("button[title^='Metadata']") as HTMLElement);
    return screen.findByTestId("claim-item-edit-dialog");
  }

  it("diyalog başlığa bağlı; iki alan grubu; masaüstünde iki sütun; düğmeler kayan gövdenin dışında", async () => {
    const dialog = await aç();
    expect(dialog.getAttribute("role")).toBe("dialog");
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(document.getElementById(dialog.getAttribute("aria-labelledby") ?? "")?.textContent).toBe("Kalem Metadata Düzenle");
    expect(dialog.className).toContain("md:max-w-3xl");

    const body = screen.getByTestId("claim-item-edit-body");
    expect(body.className).toContain("md:grid-cols-2");
    expect(body.className).not.toMatch(/(^|\s)grid-cols-2/);
    const kalem = within(screen.getByTestId("claim-item-edit-group-item"));
    const faiz = within(screen.getByTestId("claim-item-edit-group-interest"));
    expect(kalem.getByText("Kalem bilgileri")).toBeTruthy();
    expect(kalem.getByText("Vekâlet Ücreti Türü")).toBeTruthy();
    expect(faiz.getByText("Faiz")).toBeTruthy();
    expect(faiz.getByTestId("claim-item-interest-accrual-status-select")).toBeTruthy();
    expect(faiz.getByTestId("claim-item-interest-start-date")).toBeTruthy();

    const actions = screen.getByTestId("claim-item-edit-actions");
    gövdeDışındaDüğmeler(body, actions);
    expect(within(actions).getByRole("button", { name: "İptal" })).toBeTruthy();
    expect(within(actions).getByRole("button", { name: "Kaydet" })).toBeTruthy();
  });

  it("yüksek etkili değişiklikte düğme 'Onaya Gönder' olur ve görünür alanda kalır; Escape kapatır", async () => {
    await aç();
    fireEvent.change(screen.getByTestId("claim-item-interest-accrual-status-select"), { target: { value: "ACCRUES" } });
    const actions = screen.getByTestId("claim-item-edit-actions");
    expect(within(actions).getByRole("button", { name: "Onaya Gönder" })).toBeTruthy();
    fireEvent.keyDown(screen.getByTestId("claim-item-interest-accrual-status-select"), { key: "Escape" });
    await waitFor(() => expect(screen.queryByTestId("claim-item-edit-dialog")).toBeNull());
    expect(apiMock.put).not.toHaveBeenCalled();
  });
});

describe("U-6 borçlu sorumluluğu seçimi", () => {
  async function aç() {
    render(<ClaimItemPanel caseId="case-1" />);
    fireEvent.click(await screen.findByTestId("claim-item-liability-select-vu"));
    await screen.findByTestId("claim-liability-drawer");
    return screen.getByRole("dialog", { name: "Borçlu sorumluluğu seçimi" });
  }

  it("geniş ekranda iki sütun; işlem düğmeleri kayan gövdenin dışında ve sola yaslı", async () => {
    const dialog = await aç();
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(dialog.className).toContain("lg:max-w-5xl");
    const body = screen.getByTestId("claim-liability-body");
    expect(body.className).toContain("lg:grid-cols-2");
    expect(within(screen.getByTestId("claim-liability-column-selection")).getByText("Sorumluluk türü")).toBeTruthy();
    fireEvent.click(screen.getByTestId("claim-liability-mode-PROPORTIONAL"));
    expect(within(screen.getByTestId("claim-liability-column-review")).getByTestId("claim-liability-basis")).toBeTruthy();

    const actions = screen.getByTestId("claim-liability-actions");
    gövdeDışındaDüğmeler(body, actions);
    expect(actions.className).toContain("justify-start");
    expect(within(actions).getByTestId("claim-liability-preview-button")).toBeTruthy();
    expect(within(actions).getByTestId("claim-liability-request-button")).toBeTruthy();
  });

  it("Escape çekmeceyi kapatır; istek gönderilmez", async () => {
    await aç();
    fireEvent.keyDown(screen.getByTestId("claim-liability-mode-PROPORTIONAL"), { key: "Escape" });
    await waitFor(() => expect(screen.queryByTestId("claim-liability-drawer")).toBeNull());
    expect(apiMock.requestClaimLiability).not.toHaveBeenCalled();
    expect(apiMock.previewClaimLiability).not.toHaveBeenCalled();
  });
});
