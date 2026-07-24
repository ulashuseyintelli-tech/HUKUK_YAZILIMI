import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import PortalCasesPage from "@/app/portal/cases/page";

/**
 * CLIENT-P2-U03-TRACK-B-U00B — case-list sayfasının (`portal/cases/page.tsx`), backend'in
 * artık `collections`'sız döndüğü daraltılmış response şekline uyumunu doğrular: "Alacak"
 * kolonu (principalAmount) render edilmeye devam eder, "Tahsilat" kolonu ve onun
 * `totalCollected` türetmesi kaldırıldı — §33.4 Financial Disclosure Gate ile çelişen, U00'ın
 * case-detail kapsamındaki aynı kaldırmasının case-list ikizi (owner ruling, 2026-07-24).
 */
const APPROVED_CASE_LIST = [
  {
    id: "case-1",
    fileNumber: "2026/123",
    executionFileNumber: "2026/456",
    type: "ILAMSIZ",
    caseStatus: "DERDEST",
    caseDate: "2026-01-01T00:00:00.000Z",
    principalAmount: "1000",
    workflowStage: "SEIZURE",
    createdAt: "2026-01-02T00:00:00.000Z",
    debtors: [{ debtor: { name: "Ahmet Yılmaz" } }],
  },
];

function stubFetch(response: any) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
}

describe("Portal case-list page — CLIENT-P2-U03-TRACK-B-U00B explicit projection", () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem("portal_token", "test-token");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("[1] onaylı case satırları render edilir (fileNumber, debtor adı, durum)", async () => {
    stubFetch({ ok: true, json: async () => APPROVED_CASE_LIST });
    render(<PortalCasesPage />);
    await waitFor(() => expect(screen.getByText("2026/123")).toBeTruthy());
    expect(screen.getByText("Ahmet Yılmaz")).toBeTruthy();
    expect(screen.getByText("Derdest")).toBeTruthy();
  });

  it("[2] 'Alacak' kolonu (principalAmount) render edilmeye devam eder", async () => {
    stubFetch({ ok: true, json: async () => APPROVED_CASE_LIST });
    render(<PortalCasesPage />);
    await waitFor(() => expect(screen.getByText("2026/123")).toBeTruthy());
    expect(screen.getByText("Alacak")).toBeTruthy();
    expect(screen.getByText("1.000 ₺")).toBeTruthy();
  });

  it("[3] TRACK-B-U00B: 'Tahsilat' kolonu artık hiç render edilmez", async () => {
    stubFetch({ ok: true, json: async () => APPROVED_CASE_LIST });
    render(<PortalCasesPage />);
    await waitFor(() => expect(screen.getByText("2026/123")).toBeTruthy());
    expect(screen.queryByText("Tahsilat")).toBeNull();
  });

  it("[4] TRACK-B-U00B: response'ta eski/yabancı bir `collections` alanı olsa bile hiçbir tahsilat tutarı render edilmez (defansif)", async () => {
    stubFetch({
      ok: true,
      json: async () => [
        { ...APPROVED_CASE_LIST[0], collections: [{ amount: "999999", date: "2026-02-01T00:00:00.000Z" }] },
      ],
    });
    render(<PortalCasesPage />);
    await waitFor(() => expect(screen.getByText("2026/123")).toBeTruthy());
    expect(screen.queryByText(/999999/)).toBeNull();
    expect(screen.queryByText("Tahsilat")).toBeNull();
  });

  it("[5] TRACK-B-U00B: `collections` alanı response'ta hiç yokken (yeni gerçek sözleşme) sayfa güvenle render edilir, çökmez", async () => {
    const { collections: _removed, ...withoutCollections } = { ...APPROVED_CASE_LIST[0] } as any;
    stubFetch({ ok: true, json: async () => [withoutCollections] });
    render(<PortalCasesPage />);
    await waitFor(() => expect(screen.getByText("2026/123")).toBeTruthy());
    expect(screen.getByText("Alacak")).toBeTruthy();
  });

  it("[6] mevcut arama/filtreleme davranışı korunur (dosya no ile filtrelenir)", async () => {
    stubFetch({
      ok: true,
      json: async () => [
        ...APPROVED_CASE_LIST,
        { ...APPROVED_CASE_LIST[0], id: "case-2", fileNumber: "2026/999", debtors: [{ debtor: { name: "Diğer Borçlu" } }] },
      ],
    });
    render(<PortalCasesPage />);
    await waitFor(() => expect(screen.getByText("2026/123")).toBeTruthy());
    expect(screen.getByText("2026/999")).toBeTruthy();
  });

  it("[7] mevcut boş-liste davranışı korunur", async () => {
    stubFetch({ ok: true, json: async () => [] });
    render(<PortalCasesPage />);
    await waitFor(() => expect(screen.getByText("Henüz dosya bulunmuyor")).toBeTruthy());
  });
});
