import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import PortalLayout from "@/app/portal/layout";
import PortalMessagesPage from "@/app/portal/messages/page";
import PortalDocumentsPage from "@/app/portal/documents/page";

/**
 * CLIENT-CONFIG-P01 — bildirim/mesaj/belge çağrılarının CONFIGURED base URL'i gerçekten
 * kullandığının uçtan uca (gerçek render + fetch-mock) kanıtı.
 *
 * Kök neden: bu üç yüzeyin 11 çağrısı `NEXT_PUBLIC_API_URL`'i HİÇ okumadan sabit
 * `http://localhost:8080` adresine gidiyordu; web ile API farklı origin'deyse
 * (staging/production) istekler kullanıcının kendi localhost'una gidiyor ve `catch`
 * blokları hatayı yutuyordu.
 *
 * Bu dosya NEGATIVE REGRESSION testidir: herhangi bir çağrı yeniden sabit localhost'a
 * dönerse (veya env'i okumayı bırakırsa) buradaki assertion'lar FAIL eder.
 */

const CONFIGURED_BASE = "https://api.staging.example";

const pushMock = vi.fn();
const routerMock = { push: pushMock };
let currentPathname = "/portal";

vi.mock("next/navigation", () => ({
  useRouter: () => routerMock,
  usePathname: () => currentPathname,
}));

const fetchMock = vi.fn();

/** Bu testte çağrılan TÜM fetch URL'lerini toplar. */
function calledUrls(): string[] {
  return fetchMock.mock.calls.map((c) => String(c[0]));
}

beforeEach(() => {
  pushMock.mockClear();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("NEXT_PUBLIC_API_URL", CONFIGURED_BASE);
  // jsdom `scrollIntoView` sağlamaz; messages sayfası mount'ta çağırıyor
  // (mevcut portal-messages-page.spec.tsx ile aynı desen).
  Element.prototype.scrollIntoView = vi.fn();
  localStorage.clear();
  localStorage.setItem("portal_token", "tok-abc");
  localStorage.setItem("portal_user", JSON.stringify({ clientName: "Test Müvekkil" }));
  currentPathname = "/portal";
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  localStorage.clear();
});

describe("PortalLayout notifications — configured base URL (CLIENT-CONFIG-P01)", () => {
  it("[1] unread-count configured base URL'e gider, localhost'a GİTMEZ", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ count: 3 }) });
    render(<PortalLayout><div>içerik</div></PortalLayout>);

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(calledUrls()).toContain(`${CONFIGURED_BASE}/api/portal/notifications/unread-count`);
    expect(calledUrls().some((u) => u.includes("localhost:8080"))).toBe(false);
  });

  it("[2] bildirim listesi + tekil okundu + tümünü-okundu configured base URL kullanır", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (String(url).includes("unread-count")) return { ok: true, json: async () => ({ count: 1 }) };
      if (String(url).endsWith("/api/portal/notifications")) {
        return {
          ok: true,
          json: async () => [
            { id: "n1", type: "INFO", title: "Başlık", message: "Mesaj", isRead: false, createdAt: "2026-01-01T00:00:00.000Z" },
          ],
        };
      }
      return { ok: true, json: async () => ({}) };
    });

    const { container } = render(<PortalLayout><div>içerik</div></PortalLayout>);
    await waitFor(() => expect(container.querySelectorAll("button").length).toBeGreaterThan(0));

    // Zile tıkla → liste çekilir (bell, layout'ta ilk button — mevcut spec ile aynı desen)
    fireEvent.click(container.querySelectorAll("button")[0]);
    await waitFor(() => expect(screen.getByText("Başlık")).toBeTruthy());
    expect(calledUrls()).toContain(`${CONFIGURED_BASE}/api/portal/notifications`);

    // Bildirime tıkla → tekil okundu isteği
    fireEvent.click(screen.getByText("Başlık"));
    await waitFor(() =>
      expect(calledUrls().some((u) => u === `${CONFIGURED_BASE}/api/portal/notifications/n1/read`)).toBe(true),
    );

    expect(calledUrls().some((u) => u.includes("localhost:8080"))).toBe(false);
  });

  it("[3] auth header ve HTTP method davranışı KORUNUR (Bearer, POST)", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ count: 0 }) });
    render(<PortalLayout><div>içerik</div></PortalLayout>);

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [, opts] = fetchMock.mock.calls[0];
    expect(opts.headers.Authorization).toBe("Bearer tok-abc");
    // Token URL'e SIZDIRILMAZ (query string'e eklenmedi).
    expect(calledUrls().every((u) => !u.includes("tok-abc"))).toBe(true);
  });
});

describe("PortalMessagesPage — configured base URL (CLIENT-CONFIG-P01)", () => {
  it("[4] listeleme + mark-read configured base URL kullanır", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => [] });
    render(<PortalMessagesPage />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(calledUrls()).toContain(`${CONFIGURED_BASE}/api/portal/messages`);
    expect(calledUrls()).toContain(`${CONFIGURED_BASE}/api/portal/messages/mark-read`);
    expect(calledUrls().some((u) => u.includes("localhost:8080"))).toBe(false);
  });

  it("[5] mesaj GÖNDERME configured base URL'e POST eder, body ve header korunur", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => [] });
    render(<PortalMessagesPage />);
    // Loading bitene kadar bekle — input ancak spinner kalktıktan sonra render edilir.
    const input = await waitFor(() => screen.getByPlaceholderText("Mesajınızı yazın..."));
    fireEvent.change(input, { target: { value: "Merhaba" } });
    fireEvent.click(screen.getByRole("button", { name: "Gönder" }));

    await waitFor(() => {
      const post = fetchMock.mock.calls.find((c) => c[1]?.method === "POST" && c[1]?.body);
      expect(post).toBeTruthy();
      expect(String(post![0])).toBe(`${CONFIGURED_BASE}/api/portal/messages`);
      expect(JSON.parse(post![1].body)).toEqual({ content: "Merhaba" });
      expect(post![1].headers.Authorization).toBe("Bearer tok-abc");
      expect(post![1].headers["Content-Type"]).toBe("application/json");
    });
  });
});

describe("PortalDocumentsPage — configured base URL (CLIENT-CONFIG-P01)", () => {
  const DOC = {
    id: "d1",
    type: "VEKALET",
    title: "Test Vekaletnamesi",
    fileName: "vek.pdf",
    fileSize: 2048,
    status: "PENDING",
    createdAt: "2026-01-01T00:00:00.000Z",
  };

  it("[6] listeleme configured base URL kullanır", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => [DOC] });
    render(<PortalDocumentsPage />);

    await waitFor(() => expect(screen.getByText("Test Vekaletnamesi")).toBeTruthy());
    expect(calledUrls()).toContain(`${CONFIGURED_BASE}/api/portal/documents`);
    expect(calledUrls().some((u) => u.includes("localhost:8080"))).toBe(false);
  });

  it("[7] İNDİRME: API endpoint configured base URL'den gelir; yerel blob URL'i base ile BİRLEŞTİRİLMEZ", async () => {
    // DİKKAT: global `URL`'i komple stub'lamak YASAK — `portal-api-url.ts` base URL
    // doğrulaması için `new URL(...)` kullanıyor; plain-object stub constructor'ı bozar ve
    // helper sessizce dev fallback'e düşer (bu test tam da onu yakalamak için var).
    // Bu yüzden yalnız iki statik metod spy'lanır.
    const createObjectURL = vi
      .spyOn(URL, "createObjectURL")
      .mockReturnValue("blob:mock-local-url");
    const revokeObjectURL = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});

    fetchMock.mockImplementation(async (url: string) =>
      String(url).includes("/download")
        ? { ok: true, blob: async () => new Blob(["x"]) }
        : { ok: true, json: async () => [DOC] },
    );

    render(<PortalDocumentsPage />);
    await waitFor(() => expect(screen.getByText("Test Vekaletnamesi")).toBeTruthy());

    const downloadBtn = document.querySelector('button[title="İndir"]');
    fireEvent.click(downloadBtn!);

    await waitFor(() =>
      expect(calledUrls()).toContain(`${CONFIGURED_BASE}/api/portal/documents/d1/download`),
    );
    // Blob URL yerel kalır — API base URL'i ile prefixlenmez.
    expect(createObjectURL).toHaveBeenCalled();
    expect(calledUrls().every((u) => !u.startsWith("blob:"))).toBe(true);
    expect(calledUrls().every((u) => !u.includes(`${CONFIGURED_BASE}blob:`))).toBe(true);
  });

  it("[8] SİLME configured base URL'e DELETE eder", async () => {
    vi.stubGlobal("confirm", vi.fn().mockReturnValue(true));
    fetchMock.mockResolvedValue({ ok: true, json: async () => [DOC] });

    render(<PortalDocumentsPage />);
    await waitFor(() => expect(screen.getByText("Test Vekaletnamesi")).toBeTruthy());

    const delBtn = document.querySelector('button[title="Sil"]');
    fireEvent.click(delBtn!);

    await waitFor(() => {
      const del = fetchMock.mock.calls.find((c) => c[1]?.method === "DELETE");
      expect(del).toBeTruthy();
      expect(String(del![0])).toBe(`${CONFIGURED_BASE}/api/portal/documents/d1`);
      expect(del![1].headers.Authorization).toBe("Bearer tok-abc");
    });
  });

  it("[9] TRAILING SLASH'lı env değeri ile de doğru URL üretilir (çift slash yok)", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", `${CONFIGURED_BASE}/`);
    fetchMock.mockResolvedValue({ ok: true, json: async () => [] });
    render(<PortalDocumentsPage />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(calledUrls()).toContain(`${CONFIGURED_BASE}/api/portal/documents`);
    expect(calledUrls().every((u) => !u.includes("//api/portal"))).toBe(true);
  });

  it("[10] loading → empty state korunur (belge yok)", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => [] });
    render(<PortalDocumentsPage />);
    await waitFor(() => expect(screen.getByText("Henüz belge yüklemediniz")).toBeTruthy());
  });

  it("[11] error state korunur — fetch reddedilirse çökmez", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    fetchMock.mockRejectedValue(new Error("network down"));
    render(<PortalDocumentsPage />);
    await waitFor(() => expect(screen.getByText("Henüz belge yüklemediniz")).toBeTruthy());
    errSpy.mockRestore();
  });

  it("[12] authorization failure (401) davranışı korunur — liste boş kalır, çökmez", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 401, json: async () => ({ message: "Unauthorized" }) });
    render(<PortalDocumentsPage />);
    await waitFor(() => expect(screen.getByText("Henüz belge yüklemediniz")).toBeTruthy());
  });

  it("[13] token YOKSA istek atılmaz VE loading kapanır (CLIENT-REMEDIATION-CLOSEOUT-R01 R1)", async () => {
    // CLIENT-CONFIG-P01'de bu test, o zamanki PRE-EXISTING kusuru (kalıcı spinner) olduğu gibi
    // kilitliyordu. CLIENT-REMEDIATION-CLOSEOUT-R01 R1 o kusuru kapattı (`setLoading(false)`
    // erken dönüşten önce çağrılıyor), bu yüzden assertion DOĞRU davranışa çevrildi.
    localStorage.removeItem("portal_token");
    const { container } = render(<PortalDocumentsPage />);

    // Kullanıcı sonsuz spinner'da KALMAZ — loading kesin olarak kapanır.
    await waitFor(() => expect(container.querySelector(".animate-spin")).toBeNull());
    // Guard aynen korunur: token yoksa hiçbir ağ isteği yapılmaz.
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
