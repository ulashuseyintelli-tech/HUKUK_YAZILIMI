import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import PortalCaseDetailPage from "@/app/portal/cases/[id]/page";

/**
 * CLIENT-P2-U03-I01 + CLIENT-P2-U03-TRACK-A-I01 — case-detail sayfasının, backend'in artık
 * explicit-select ile döndüğü daraltılmış response şekline uyumunu doğrular: onaylı alanlar
 * render edilir, kaldırılan description/lifecycle alanları sayfayı ÇÖKERTMEZ ve hiç render
 * edilmez, mevcut loading/404/hata davranışı DEĞİŞMEDİ. Track-A-I01: muvekkilNotu, 12-değerli
 * DebtorRole label-map (+ unexpected-value fallback), debtor lawyer name/barNo render.
 */
const pushMock = vi.fn();
const routerMock = { push: pushMock };

vi.mock("next/navigation", () => ({
  useRouter: () => routerMock,
  useParams: () => ({ id: "case-1" }),
}));

const APPROVED_CASE_DETAIL = {
  id: "case-1",
  fileNumber: "2026/123",
  executionFileNumber: "2026/456",
  type: "ILAMSIZ",
  caseStatus: "DERDEST",
  workflowStage: "SEIZURE",
  caseDate: "2026-01-01T00:00:00.000Z",
  principalAmount: "1000",
  muvekkilNotu: "Dosyanız aktif olarak takip edilmektedir.",
  debtors: [
    {
      role: "ASIL_BORCLU",
      debtorLawyerName: "Ayşe Vekil",
      debtorLawyerBarNo: "34567",
      debtor: { name: "Ahmet Yılmaz", type: "PERSON" },
    },
  ],
  collections: [{ id: "col-1", date: "2026-02-01T00:00:00.000Z", type: "BANKA", amount: "500" }],
  dues: [{ id: "due-1", type: "ASIL_ALACAK", amount: "1000", dueDate: "2026-01-01T00:00:00.000Z", currency: "TRY" }],
};

function stubFetch(response: any) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
}

describe("Portal case detail page — CLIENT-P2-U03-I01 explicit projection", () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem("portal_token", "test-token");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("[1] onaylı case header alanları render edilir (fileNumber, executionFileNumber, caseStatus)", async () => {
    stubFetch({ ok: true, json: async () => APPROVED_CASE_DETAIL });
    render(<PortalCaseDetailPage />);
    await waitFor(() => expect(screen.getByText("2026/123")).toBeTruthy());
    expect(screen.getByText(/İcra No: 2026\/456/)).toBeTruthy();
    expect(screen.getByText("Derdest")).toBeTruthy();
  });

  it("[2] onaylı debtor alanları render edilir (debtor.name, debtor.type)", async () => {
    stubFetch({ ok: true, json: async () => APPROVED_CASE_DETAIL });
    render(<PortalCaseDetailPage />);
    await waitFor(() => expect(screen.getByText("Ahmet Yılmaz")).toBeTruthy());
    expect(screen.getByText("Şahıs")).toBeTruthy();
  });

  it("[2a] TRACK-A-I01: muvekkilNotu doluyken 'Müvekkil Notu' bölümü render edilir", async () => {
    stubFetch({ ok: true, json: async () => APPROVED_CASE_DETAIL });
    render(<PortalCaseDetailPage />);
    await waitFor(() => expect(screen.getByText("Müvekkil Notu")).toBeTruthy());
    expect(screen.getByText("Dosyanız aktif olarak takip edilmektedir.")).toBeTruthy();
  });

  it("[2b] TRACK-A-I01: muvekkilNotu yok/boşken 'Müvekkil Notu' bölümü hiç render edilmez", async () => {
    stubFetch({ ok: true, json: async () => ({ ...APPROVED_CASE_DETAIL, muvekkilNotu: null }) });
    render(<PortalCaseDetailPage />);
    await waitFor(() => expect(screen.getByText("Ahmet Yılmaz")).toBeTruthy());
    expect(screen.queryByText("Müvekkil Notu")).toBeNull();
  });

  it.each([
    ["ASIL_BORCLU", "Asıl Borçlu"],
    ["MUTESELSIL_KEFIL", "Müteselsil Kefil"],
    ["CIRANTA", "Ciranta"],
    ["MUHATAP", "Muhatap"],
    ["MIRASCI", "Mirasçı"],
    ["TASFIYE_MEMURU", "Tasfiye Memuru"],
    ["IFLAS_MASASI", "İflas Masası"],
  ])("[2c-%s] TRACK-A-I01: DebtorRole '%s' → '%s' Türkçe etiketiyle render edilir", async (role, label) => {
    stubFetch({
      ok: true,
      json: async () => ({
        ...APPROVED_CASE_DETAIL,
        debtors: [{ role, debtor: { name: "Test Borçlu", type: "PERSON" } }],
      }),
    });
    render(<PortalCaseDetailPage />);
    await waitFor(() => expect(screen.getByText("Test Borçlu")).toBeTruthy());
    expect(screen.getByText(label)).toBeTruthy();
  });

  it("[2d] TRACK-A-I01: beklenmeyen/gelecek bir DebtorRole değeri sayfayı ÇÖKERTMEZ, nötr fallback gösterir", async () => {
    stubFetch({
      ok: true,
      json: async () => ({
        ...APPROVED_CASE_DETAIL,
        debtors: [{ role: "FUTURE_UNKNOWN_ROLE_X", debtor: { name: "Test Borçlu", type: "PERSON" } }],
      }),
    });
    render(<PortalCaseDetailPage />);
    await waitFor(() => expect(screen.getByText("Test Borçlu")).toBeTruthy());
    expect(screen.getByText("Hukuki Taraf")).toBeTruthy();
    expect(screen.queryByText("FUTURE_UNKNOWN_ROLE_X")).toBeNull();
  });

  it("[2e] TRACK-A-I01: debtor lawyer name + barNo ikisi de varsa birleşik gösterilir", async () => {
    stubFetch({ ok: true, json: async () => APPROVED_CASE_DETAIL });
    render(<PortalCaseDetailPage />);
    await waitFor(() => expect(screen.getByText("Ahmet Yılmaz")).toBeTruthy());
    expect(screen.getByText("Av. Ayşe Vekil (Baro No: 34567)")).toBeTruthy();
  });

  it("[2f] TRACK-A-I01: yalnız debtorLawyerName varsa yalnız isim gösterilir", async () => {
    stubFetch({
      ok: true,
      json: async () => ({
        ...APPROVED_CASE_DETAIL,
        debtors: [{ role: "ASIL_BORCLU", debtorLawyerName: "Ayşe Vekil", debtor: { name: "Test Borçlu", type: "PERSON" } }],
      }),
    });
    render(<PortalCaseDetailPage />);
    await waitFor(() => expect(screen.getByText("Test Borçlu")).toBeTruthy());
    expect(screen.getByText("Av. Ayşe Vekil")).toBeTruthy();
  });

  it("[2g] TRACK-A-I01: yalnız debtorLawyerBarNo varsa yalnız baro no gösterilir", async () => {
    stubFetch({
      ok: true,
      json: async () => ({
        ...APPROVED_CASE_DETAIL,
        debtors: [{ role: "ASIL_BORCLU", debtorLawyerBarNo: "34567", debtor: { name: "Test Borçlu", type: "PERSON" } }],
      }),
    });
    render(<PortalCaseDetailPage />);
    await waitFor(() => expect(screen.getByText("Test Borçlu")).toBeTruthy());
    expect(screen.getByText("Baro No: 34567")).toBeTruthy();
  });

  it("[2h] TRACK-A-I01: debtor lawyer name/barNo ikisi de yoksa boş placeholder satır render edilmez", async () => {
    stubFetch({
      ok: true,
      json: async () => ({
        ...APPROVED_CASE_DETAIL,
        debtors: [{ role: "ASIL_BORCLU", debtor: { name: "Test Borçlu", type: "PERSON" } }],
      }),
    });
    render(<PortalCaseDetailPage />);
    await waitFor(() => expect(screen.getByText("Test Borçlu")).toBeTruthy());
    expect(screen.queryByText(/^Av\./)).toBeNull();
    expect(screen.queryByText(/^Baro No:/)).toBeNull();
  });

  it("[3] collection satırları type/amount/date ile render edilir, description sütunu YOK", async () => {
    stubFetch({ ok: true, json: async () => APPROVED_CASE_DETAIL });
    render(<PortalCaseDetailPage />);
    await waitFor(() => expect(screen.getByText("BANKA")).toBeTruthy());
    expect(screen.queryByText("Açıklama")).toBeNull();
  });

  it("[4] due satırları type/amount ile render edilir, description gösterilmez", async () => {
    stubFetch({ ok: true, json: async () => APPROVED_CASE_DETAIL });
    render(<PortalCaseDetailPage />);
    await waitFor(() => expect(screen.getByText("ASIL_ALACAK")).toBeTruthy());
  });

  it("[5] raw lifecycle timeline bölümü YOK (\"İşlem Geçmişi\" başlığı render edilmez)", async () => {
    stubFetch({ ok: true, json: async () => APPROVED_CASE_DETAIL });
    render(<PortalCaseDetailPage />);
    await waitFor(() => expect(screen.getByText("2026/123")).toBeTruthy());
    expect(screen.queryByText("İşlem Geçmişi")).toBeNull();
  });

  it("[6] kaldırılan alanların (lifecycleEvents/description/id) yokluğu sayfayı ÇÖKERTMEZ", async () => {
    const minimalResponse = {
      fileNumber: "2026/999",
      caseStatus: "ISLEMDE",
      workflowStage: "INITIAL",
      debtors: [],
      collections: [],
      dues: [],
    };
    stubFetch({ ok: true, json: async () => minimalResponse });
    render(<PortalCaseDetailPage />);
    await waitFor(() => expect(screen.getByText("2026/999")).toBeTruthy());
    expect(screen.getByText("Borçlu bilgisi yok")).toBeTruthy();
    expect(screen.getByText("Alacak kalemi yok")).toBeTruthy();
  });

  it("[7a] mevcut loading davranışı korunur (fetch çözülmeden spinner görünür)", () => {
    stubFetch(new Promise(() => {}));
    const { container } = render(<PortalCaseDetailPage />);
    expect(container.querySelector(".animate-spin")).toBeTruthy();
  });

  it("[7b] mevcut 404 davranışı korunur (/portal/cases'e yönlendirir)", async () => {
    stubFetch({ ok: false, status: 404 });
    render(<PortalCaseDetailPage />);
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/portal/cases"));
  });

  it("[7c] mevcut genel hata davranışı korunur (\"Dosya bulunamadı\" gösterilir)", async () => {
    stubFetch({ ok: false, status: 500 });
    render(<PortalCaseDetailPage />);
    await waitFor(() => expect(screen.getByText("Dosya bulunamadı")).toBeTruthy());
  });
});
