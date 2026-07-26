import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import PortalMessagesPage from "@/app/portal/messages/page";
import PortalDocumentsPage from "@/app/portal/documents/page";
import PortalCasesPage from "@/app/portal/cases/page";
import PortalPoasPage from "@/app/portal/poas/page";
import PortalLoginPage from "@/app/portal/login/page";
import PortalForgotPasswordPage from "@/app/portal/forgot-password/page";

/**
 * CLIENT-REMEDIATION-CLOSEOUT-R01 — Spring Cleaning final reconciliation.
 *
 * R1 — TOKEN-YOK KALICI SPINNER (2 dosya, aynı kök neden):
 *   `messages/page.tsx` ve `documents/page.tsx` içinde `if (!token) return;` ifadesi
 *   `try/finally`'den ÖNCE çalıştığı için `setLoading(false)` hiç çağrılmıyor ve
 *   `loading` başlangıçta `true` olduğundan kullanıcı KALICI spinner görüyordu.
 *   `layout.tsx` bu kusurdan muaftı (loading kapanışı ayrı effect'te koşulsuz).
 *
 * R2 — SEKİZ SAYFADA SESSİZ LOCALHOST FALLBACK:
 *   module-level `const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080"`
 *   deseni production'da env eksikse sessizce kullanıcının localhost'una düşüyordu.
 *   Sekiz sayfa CLIENT-CONFIG-P01'in canonical `portalApiUrl()` helper'ına taşındı
 *   (dev fallback yalnız config katmanında, production'da fail-fast).
 */

const CONFIGURED_BASE = "https://api.closeout.example";

const pushMock = vi.fn();
const routerMock = { push: pushMock };

vi.mock("next/navigation", () => ({
  useRouter: () => routerMock,
  usePathname: () => "/portal",
  useParams: () => ({ id: "case-9" }),
}));

const fetchMock = vi.fn();

function calledUrls(): string[] {
  return fetchMock.mock.calls.map((c) => String(c[0]));
}

beforeEach(() => {
  pushMock.mockClear();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("NEXT_PUBLIC_API_URL", CONFIGURED_BASE);
  Element.prototype.scrollIntoView = vi.fn();
  localStorage.clear();
  localStorage.setItem("portal_token", "tok-closeout");
  localStorage.setItem("portal_user", JSON.stringify({ clientName: "Test Müvekkil" }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  localStorage.clear();
});

// ---------------------------------------------------------------------------
// R1 — spinner remediation (davranışsal, gerçek render/effect)
// ---------------------------------------------------------------------------

describe("R1 spinner remediation — token yokken loading kesin kapanır", () => {
  it("[R1-1] messages: token YOK → API çağrısı YAPILMAZ", async () => {
    localStorage.removeItem("portal_token");
    render(<PortalMessagesPage />);
    await waitFor(() => expect(screen.getByText(/Mesajlar/i)).toBeTruthy());
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("[R1-2] messages: token YOK → spinner KALMAZ (loading kapanır)", async () => {
    localStorage.removeItem("portal_token");
    const { container } = render(<PortalMessagesPage />);
    await waitFor(() => expect(container.querySelector(".animate-spin")).toBeNull());
  });

  it("[R1-3] documents: token YOK → API çağrısı YAPILMAZ", async () => {
    localStorage.removeItem("portal_token");
    render(<PortalDocumentsPage />);
    await waitFor(() => expect(screen.getByText("Henüz belge yüklemediniz")).toBeTruthy());
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("[R1-4] documents: token YOK → spinner KALMAZ, boş durum gösterilir", async () => {
    localStorage.removeItem("portal_token");
    const { container } = render(<PortalDocumentsPage />);
    await waitFor(() => expect(container.querySelector(".animate-spin")).toBeNull());
    expect(screen.getByText("Henüz belge yüklemediniz")).toBeTruthy();
  });

  it("[R1-5] messages: token VAR happy-path bozulmadı", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => [
        { id: "m1", content: "Merhaba müvekkil", senderType: "OFFICE", senderName: "Av. Test", isRead: true, createdAt: "2026-01-01T00:00:00.000Z" },
      ],
    });
    render(<PortalMessagesPage />);
    await waitFor(() => expect(screen.getByText("Merhaba müvekkil")).toBeTruthy());
    expect(calledUrls()).toContain(`${CONFIGURED_BASE}/api/portal/messages`);
  });

  it("[R1-6] documents: token VAR happy-path bozulmadı", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => [
        { id: "d1", type: "VEKALET", title: "Kapanış Belgesi", fileName: "k.pdf", fileSize: 1024, status: "PENDING", createdAt: "2026-01-01T00:00:00.000Z" },
      ],
    });
    render(<PortalDocumentsPage />);
    await waitFor(() => expect(screen.getByText("Kapanış Belgesi")).toBeTruthy());
    expect(calledUrls()).toContain(`${CONFIGURED_BASE}/api/portal/documents`);
  });

  it("[R1-7] documents: error state bozulmadı (fetch reddi → çökmez, spinner kalmaz)", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    fetchMock.mockRejectedValue(new Error("network down"));
    const { container } = render(<PortalDocumentsPage />);
    await waitFor(() => expect(container.querySelector(".animate-spin")).toBeNull());
    expect(screen.getByText("Henüz belge yüklemediniz")).toBeTruthy();
    errSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// R2 — eight-page config migration (configured base URL gerçekten kullanılıyor)
// ---------------------------------------------------------------------------

describe("R2 config migration — sekiz sayfa canonical helper kullanır", () => {
  it("[R2-1] cases listesi configured base URL'e gider, localhost'a GİTMEZ", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => [] });
    render(<PortalCasesPage />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(calledUrls()).toContain(`${CONFIGURED_BASE}/api/portal/cases`);
    expect(calledUrls().some((u) => u.includes("localhost:8080"))).toBe(false);
  });

  it("[R2-2] poas configured base URL kullanır + Bearer korunur", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => [] });
    render(<PortalPoasPage />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(calledUrls()).toContain(`${CONFIGURED_BASE}/api/portal/poas`);
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe("Bearer tok-closeout");
  });

  it("[R2-3] login (public, POST) configured base URL kullanır; body ve method korunur", async () => {
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({ message: "hatalı" }) });
    render(<PortalLoginPage />);
    const email = document.querySelector('input[type="email"]') as HTMLInputElement;
    const pwd = document.querySelector('input[type="password"]') as HTMLInputElement;
    const { fireEvent } = await import("@testing-library/react");
    fireEvent.change(email, { target: { value: "a@x.com" } });
    fireEvent.change(pwd, { target: { value: "sifre1234" } });
    fireEvent.submit(email.closest("form")!);

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, opts] = fetchMock.mock.calls[0];
    expect(String(url)).toBe(`${CONFIGURED_BASE}/api/portal/login`);
    expect(opts.method).toBe("POST");
    // Public uç: Authorization header'ı EKLENMEZ (mevcut sözleşme korunur).
    expect(JSON.stringify(opts.headers ?? {})).not.toContain("Authorization");
  });

  it("[R2-4] forgot-password (public, POST) configured base URL kullanır", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ success: true }) });
    render(<PortalForgotPasswordPage />);
    const email = document.querySelector('input[type="email"]') as HTMLInputElement;
    const { fireEvent } = await import("@testing-library/react");
    fireEvent.change(email, { target: { value: "a@x.com" } });
    fireEvent.submit(email.closest("form")!);

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(String(fetchMock.mock.calls[0][0])).toBe(`${CONFIGURED_BASE}/api/portal/forgot-password`);
    expect(fetchMock.mock.calls[0][1].method).toBe("POST");
  });

  it("[R2-5] TRAILING SLASH'lı env ile de çift slash üretilmez", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", `${CONFIGURED_BASE}/`);
    fetchMock.mockResolvedValue({ ok: true, json: async () => [] });
    render(<PortalCasesPage />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(calledUrls()).toContain(`${CONFIGURED_BASE}/api/portal/cases`);
    expect(calledUrls().every((u) => !u.includes("//api/portal"))).toBe(true);
  });

  it("[R2-6] NEGATIVE REGRESSION: hiçbir migrate edilmiş sayfa localhost'a istek atmaz", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => [] });
    render(<PortalCasesPage />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    fetchMock.mockClear();
    render(<PortalPoasPage />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    // Sabit localhost yeniden eklenirse bu assertion FAIL eder.
    expect(calledUrls().every((u) => !u.includes("localhost"))).toBe(true);
    // ORIGIN karşılaştırması (prefix/substring DEĞİL): `startsWith(base)` deseni
    // `https://api.closeout.example.evil.com` gibi bir host'u da eşleştirirdi
    // (CodeQL js/incomplete-url-substring-sanitization). Origin eşitliği kesin kontroldür.
    const expectedOrigin = new URL(CONFIGURED_BASE).origin;
    expect(calledUrls().every((u) => new URL(u).origin === expectedOrigin)).toBe(true);
  });
});
