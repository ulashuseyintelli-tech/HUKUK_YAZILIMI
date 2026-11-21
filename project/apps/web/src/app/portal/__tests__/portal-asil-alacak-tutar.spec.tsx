import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import PortalHomePage from "@/app/portal/page";
import PortalCasesPage from "@/app/portal/cases/page";
import { formatPortalPrincipalAmount } from "@/lib/portal-principal-amount";

/**
 * F02 kabul K-4 (owner 22.11.2026) — portalda dosya tutarı.
 * Kusur: `principalAmount` NULL iken `Number(null || 0)` → "0 ₺" (bilinmeyen tutar sıfır gibi). Kural: bilinmiyorsa
 * "Tutar belirlenemedi"; gerçek sıfır "0 ₺"; alan yalnız asıl alacağı temsil ettiği için "Asıl alacak" diye etiketlenir,
 * dosyanın toplam borcu diye sunulmaz. Değerler sentetik.
 */
const pushMock = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: pushMock, replace: vi.fn() }), usePathname: () => "/portal" }));
vi.mock("next/link", () => ({ default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a> }));

const satir = (id: string, fileNumber: string, principalAmount: unknown) => ({
  id, fileNumber, executionFileNumber: null, type: "ILAMSIZ", caseStatus: "DERDEST", caseDate: "2026-10-01T00:00:00.000Z",
  principalAmount, workflowStage: "BASLANGIC", createdAt: "2026-10-01T00:00:00.000Z", debtors: [{ debtor: { name: `Sentetik Borçlu ${id}` } }],
});
const LISTE = [satir("a", "2026/1", null), satir("b", "2026/2", "0"), satir("c", "2026/3", "1000")];

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("portal_token", "portal-oturumu-sentetik");
  localStorage.setItem("portal_user", JSON.stringify({ clientName: "Sentetik Müvekkil" }));
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => LISTE }));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe("K-4 — formatPortalPrincipalAmount", () => {
  it("bilinmeyen tutar 'Tutar belirlenemedi'; gerçek sıfır '0 ₺'; tutar Türkçe biçimde", () => {
    for (const v of [null, undefined, "", "  ", "abc"]) expect(formatPortalPrincipalAmount(v)).toBe("Tutar belirlenemedi");
    expect(formatPortalPrincipalAmount("0")).toBe("0 ₺");
    expect(formatPortalPrincipalAmount(0)).toBe("0 ₺");
    expect(formatPortalPrincipalAmount("1000")).toBe("1.000 ₺");
  });
});

describe("K-4 — portal ekranları", () => {
  it("ana sayfa 'Son Dosyalar': NULL tutar 'Tutar belirlenemedi', sıfır '0 ₺'; satır 'Asıl alacak' diye etiketli", async () => {
    render(<PortalHomePage />);
    await waitFor(() => expect(screen.getByText("2026/1")).toBeTruthy());
    const satirMetni = (no: string) => screen.getByText(no).closest("a")?.textContent ?? "";
    expect(satirMetni("2026/1")).toContain("Tutar belirlenemedi");
    expect(satirMetni("2026/1")).not.toContain("₺");
    expect(satirMetni("2026/2")).toContain("0 ₺");
    expect(satirMetni("2026/3")).toMatch(/1\.000\s*₺/);
    for (const no of ["2026/1", "2026/2", "2026/3"]) expect(satirMetni(no)).toContain("Asıl alacak");
    expect(screen.queryByText(/toplam borç/i)).toBeNull();
  });

  it("dosyalar listesi: sütun 'Asıl Alacak'; NULL tutar 'Tutar belirlenemedi', sıfır '0 ₺'", async () => {
    render(<PortalCasesPage />);
    await waitFor(() => expect(screen.getByText("2026/1")).toBeTruthy());
    expect(screen.getByText("Asıl Alacak")).toBeTruthy();
    const hucre = (no: string) => screen.getByText(no).closest("tr")?.textContent ?? "";
    expect(hucre("2026/1")).toContain("Tutar belirlenemedi");
    expect(hucre("2026/1")).not.toContain("₺");
    expect(hucre("2026/2")).toContain("0 ₺");
    expect(hucre("2026/3")).toMatch(/1\.000\s*₺/);
    expect(screen.queryByText(/toplam borç/i)).toBeNull();
  });
});
