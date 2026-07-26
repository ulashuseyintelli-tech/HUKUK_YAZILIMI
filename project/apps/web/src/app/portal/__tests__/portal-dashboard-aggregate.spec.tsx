import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import PortalHomePage from "@/app/portal/page";

/**
 * CLIENT-POL-F-R01 — Portal dashboard (ana sayfa) finansal aggregate remediation.
 *
 * Bu dosya, portal ana sayfası için ilk test kapsamıdır (audit bulgusu: `portal/page.tsx`
 * için hiç spec dosyası yoktu — bu yüzden §22.10/§22.11 ihlali aylarca yakalanamadı).
 *
 * Kapatılan ihlaller:
 *  - "Toplam Alacak" = cross-case `Σ principalAmount` (CANLI, sıfır olmayan finansal aggregate)
 *    → Charter §22.10 "claimed amount total ... NOT AUTHORIZED"; "`principalAmount` canonical
 *      aggregate source DEĞİLDİR"
 *  - "Tahsil Edilen" = `Σ collections` (TRACK-B-U00B'de API'den kaldırılan alana bağlı ölü kod)
 *    → §22.10 "collected amount total ... NOT AUTHORIZED"
 *
 * KORUNANLAR (negatif remediation olmamalı):
 *  - "Toplam Dosya"/"Aktif Dosya" — §23.6 "pagination/kayıt-sayısı business aggregate DEĞİLDİR"
 *  - "Son Dosyalar" satırlarında TEKİL case `principalAmount` — §23.9 single-object presentation
 */

const fetchMock = vi.fn();

const CASES = [
  {
    id: "c1",
    fileNumber: "2026/111",
    caseStatus: "DERDEST",
    caseDate: "2026-01-15T00:00:00.000Z",
    principalAmount: "1000",
    debtors: [{ debtor: { name: "Borçlu Bir" } }],
  },
  {
    id: "c2",
    fileNumber: "2026/222",
    caseStatus: "HITAM",
    caseDate: "2026-02-20T00:00:00.000Z",
    principalAmount: "2500",
    debtors: [{ debtor: { name: "Borçlu İki" } }],
  },
];

function mockCasesResponse(payload: unknown) {
  fetchMock.mockResolvedValue({ ok: true, json: async () => payload });
}

describe("PortalHomePage — CLIENT-POL-F-R01 financial aggregate remediation", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    localStorage.clear();
    localStorage.setItem("portal_token", "t-123");
    localStorage.setItem("portal_user", JSON.stringify({ clientName: "Test Müvekkil" }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it("[1] cross-case finansal aggregate kartları RENDER EDİLMEZ ('Toplam Alacak' / 'Tahsil Edilen')", async () => {
    mockCasesResponse(CASES);
    render(<PortalHomePage />);

    await waitFor(() => expect(screen.getByText("Toplam Dosya")).toBeTruthy());
    expect(screen.queryByText("Toplam Alacak")).toBeNull();
    expect(screen.queryByText("Tahsil Edilen")).toBeNull();
  });

  it("[2] cross-case toplam TUTAR hiçbir yerde görünmez (1000+2500=3500 sızmıyor)", async () => {
    mockCasesResponse(CASES);
    const { container } = render(<PortalHomePage />);

    await waitFor(() => expect(screen.getByText("Toplam Dosya")).toBeTruthy());
    // Σ principalAmount = 3500 — hiçbir formatta render edilmemeli.
    const text = container.textContent ?? "";
    expect(text).not.toContain("3.500");
    expect(text).not.toContain("3500");
  });

  it("[3] ölü `collections` referansı kaldırıldı — API stray `collections` döndürse bile tutar render edilmez", async () => {
    // Defansif: eski/legacy bir API yanıtı yanlışlıkla `collections` taşısa bile
    // dashboard bunu hiç okumamalı (§22.10 collected amount total yasağı).
    mockCasesResponse([
      { ...CASES[0], collections: [{ amount: "777", date: "2026-03-01", type: "BANKA" }] },
    ]);
    const { container } = render(<PortalHomePage />);

    await waitFor(() => expect(screen.getByText("Toplam Dosya")).toBeTruthy());
    expect(screen.queryByText("Tahsil Edilen")).toBeNull();
    expect(container.textContent ?? "").not.toContain("777");
  });

  it("[4] KORUNAN: non-financial sayaçlar render edilir (Toplam Dosya=2, Aktif Dosya=1)", async () => {
    mockCasesResponse(CASES);
    render(<PortalHomePage />);

    await waitFor(() => expect(screen.getByText("Toplam Dosya")).toBeTruthy());
    expect(screen.getByText("Aktif Dosya")).toBeTruthy();
    // DERDEST 1 adet → aktif 1; toplam 2.
    const values = screen.getAllByText(/^[0-9]+$/).map((el) => el.textContent);
    expect(values).toContain("2");
    expect(values).toContain("1");
  });

  it("[5] KORUNAN: 'Son Dosyalar' satırlarında TEKİL case principalAmount gösterilmeye devam eder (§23.9)", async () => {
    mockCasesResponse(CASES);
    render(<PortalHomePage />);

    await waitFor(() => expect(screen.getByText("2026/111")).toBeTruthy());
    // Tekil (single-object) tutarlar izinli — toplanmadıkları için ihlal değil.
    expect(screen.getByText(/1\.000\s*₺/)).toBeTruthy();
    expect(screen.getByText(/2\.500\s*₺/)).toBeTruthy();
    expect(screen.getByText("Borçlu Bir")).toBeTruthy();
  });

  it("[6] loading state korunur (fetch çözülmeden spinner)", async () => {
    fetchMock.mockReturnValue(new Promise(() => {})); // hiç çözülmez
    const { container } = render(<PortalHomePage />);
    expect(container.querySelector(".animate-spin")).toBeTruthy();
    expect(screen.queryByText("Toplam Dosya")).toBeNull();
  });

  it("[7] empty state korunur (dosya yok)", async () => {
    mockCasesResponse([]);
    render(<PortalHomePage />);

    await waitFor(() => expect(screen.getByText("Henüz dosya bulunmuyor")).toBeTruthy());
    // Boş listede de finansal aggregate YOK (0 ₺ gibi yanıltıcı değer de gösterilmez).
    expect(screen.queryByText("Toplam Alacak")).toBeNull();
    expect(screen.queryByText("Tahsil Edilen")).toBeNull();
  });

  it("[8] error state korunur — fetch reddedilirse çökmez, sayfa yine render edilir", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    fetchMock.mockRejectedValue(new Error("network down"));
    render(<PortalHomePage />);

    await waitFor(() => expect(screen.getByText("Toplam Dosya")).toBeTruthy());
    expect(screen.getByText("Henüz dosya bulunmuyor")).toBeTruthy();
    expect(screen.queryByText("Toplam Alacak")).toBeNull();
    errSpy.mockRestore();
  });

  it("[9] navigation korunur — 'Tümünü Gör' ve dosya satırı linkleri doğru hedeflere gider", async () => {
    mockCasesResponse(CASES);
    render(<PortalHomePage />);

    await waitFor(() => expect(screen.getByText("2026/111")).toBeTruthy());
    expect(screen.getByRole("link", { name: /Tümünü Gör/ }).getAttribute("href")).toBe("/portal/cases");
    const caseLink = screen.getByText("2026/111").closest("a");
    expect(caseLink?.getAttribute("href")).toBe("/portal/cases/c1");
  });
});
