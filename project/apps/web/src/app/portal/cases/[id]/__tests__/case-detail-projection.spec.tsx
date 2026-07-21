import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import PortalCaseDetailPage from "@/app/portal/cases/[id]/page";

/**
 * CLIENT-P2-U03-I01 — case-detail sayfasının, backend'in artık explicit-select ile
 * döndüğü daraltılmış response şekline uyumunu doğrular: onaylı alanlar render edilir,
 * kaldırılan description/lifecycle alanları sayfayı ÇÖKERTMEZ ve hiç render edilmez,
 * mevcut loading/404/hata davranışı DEĞİŞMEDİ.
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
  debtors: [{ debtor: { name: "Ahmet Yılmaz", type: "PERSON" } }],
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
