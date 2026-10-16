/**
 * GÜV-01 P3 (DV-201) — davet kabul sayfası: token adres PARÇASINDAN (`#token=`) okunur; geçiş süresince
 * ESKİ `?token=` bağlantıları da desteklenir. Her iki yolda token okunur okunmaz `history.replaceState`
 * ile adresten silinir; yalnız bellekte tutulur ve yalnız kabul POST gövdesinde (`api.acceptInvite`) gider.
 *
 * jsdom gerçek gezinme yapmaz; adres `history.pushState` ile kurulur, `window.location` jsdom'un kendi
 * yorumudur. Next'in `useSearchParams`'ı burada geçerli adresin sorgu dizesini (değişene dek aynı nesne)
 * döndüren bir saplamadır — gerçek yönlendirici `replaceState` sonrası sorgu dizesini bu biçimde eşitler.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import AcceptInvitePage from "@/app/auth/accept-invite/page";

const acceptInviteMock = vi.fn();
const pushMock = vi.fn();

vi.mock("@/lib/api", () => ({
  api: { acceptInvite: (...args: unknown[]) => acceptInviteMock(...args) },
}));

let cachedSearch: string | null = null;
let cachedParams = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
  useSearchParams: () => {
    if (cachedSearch !== window.location.search) {
      cachedSearch = window.location.search;
      cachedParams = new URLSearchParams(window.location.search);
    }
    return cachedParams;
  },
}));

const PATH = "/auth/accept-invite";
const FRAG_TOKEN = "parca-belirteci-Abc123_-xyz";
const QUERY_TOKEN = "sorgu-belirteci-Def456_-uvw";
const PASSWORD = "Yeni-Parola-2026";

function openAt(url: string) {
  window.history.pushState(null, "", url);
}

function fillAndSubmit() {
  fireEvent.change(document.querySelector('input[name="password"]')!, { target: { value: PASSWORD } });
  fireEvent.change(document.querySelector('input[name="confirm"]')!, { target: { value: PASSWORD } });
  fireEvent.click(screen.getByRole("button", { name: /Parolayı belirle ve etkinleştir/i }));
}

const submitButton = () => screen.getByRole("button", { name: /Parolayı belirle ve etkinleştir/i });

describe("AcceptInvitePage — GÜV-01 P3 davet belirteci adresten okunup temizlenir", () => {
  beforeEach(() => {
    acceptInviteMock.mockReset();
    acceptInviteMock.mockResolvedValue({ ok: true, userId: "u1" });
    pushMock.mockReset();
    cachedSearch = null;
    openAt(PATH);
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    openAt(PATH);
  });

  it("[P3-W1] yeni bağlantı (#token=): token parçadan alınır, kabul POST'una gider; adreste ve geçmiş girdisinde token kalmaz", async () => {
    openAt(`${PATH}#token=${FRAG_TOKEN}`);
    const historyLength = window.history.length;
    render(<AcceptInvitePage />);

    await waitFor(() => expect(window.location.hash).toBe(""));
    expect(window.location.href).toBe(`${window.location.origin}${PATH}`);
    expect(window.location.href).not.toContain(FRAG_TOKEN);
    // replaceState geçerli girdiyi DEĞİŞTİRİR: token'lı ek bir geçmiş girdisi oluşmaz ("geri" ile dönülemez).
    expect(window.history.length).toBe(historyLength);

    fillAndSubmit();
    await waitFor(() => expect(acceptInviteMock).toHaveBeenCalledWith(FRAG_TOKEN, PASSWORD));
    expect(acceptInviteMock).toHaveBeenCalledTimes(1);
  });

  it("[P3-W2] eski bağlantı (?token=): geçiş için sorgu dizesinden alınır, kabul POST'una gider; adreste token kalmaz", async () => {
    openAt(`${PATH}?token=${QUERY_TOKEN}`);
    render(<AcceptInvitePage />);

    await waitFor(() => expect(window.location.search).toBe(""));
    expect(window.location.href).toBe(`${window.location.origin}${PATH}`);
    expect(window.location.href).not.toContain(QUERY_TOKEN);

    fillAndSubmit();
    await waitFor(() => expect(acceptInviteMock).toHaveBeenCalledWith(QUERY_TOKEN, PASSWORD));
  });

  it("[P3-W3] token okunduktan sonra history.replaceState çağrılır (parça ve sorgu yolu); hedef adres token taşımaz", async () => {
    const spy = vi.spyOn(window.history, "replaceState");

    openAt(`${PATH}#token=${FRAG_TOKEN}`);
    const first = render(<AcceptInvitePage />);
    await waitFor(() => expect(spy).toHaveBeenCalledWith(null, "", PATH));
    first.unmount();

    spy.mockClear();
    openAt(`${PATH}?token=${QUERY_TOKEN}`);
    render(<AcceptInvitePage />);
    await waitFor(() => expect(spy).toHaveBeenCalledWith(null, "", PATH));

    for (const call of spy.mock.calls) {
      expect(String(call[2])).not.toContain(FRAG_TOKEN);
      expect(String(call[2])).not.toContain(QUERY_TOKEN);
    }
    expect(submitButton()).not.toBeDisabled();
  });

  it("[P3-W4] parça ve sorgu birlikte gelirse parça kazanır; ikisi de temizlenir, başka sorgu parametreleri korunur", async () => {
    openAt(`${PATH}?lang=tr&token=${QUERY_TOKEN}#token=${FRAG_TOKEN}`);
    render(<AcceptInvitePage />);

    await waitFor(() => expect(window.location.hash).toBe(""));
    expect(window.location.search).toBe("?lang=tr");
    expect(window.location.href).not.toContain(FRAG_TOKEN);
    expect(window.location.href).not.toContain(QUERY_TOKEN);

    fillAndSubmit();
    await waitFor(() => expect(acceptInviteMock).toHaveBeenCalledWith(FRAG_TOKEN, PASSWORD));
  });

  it("[P3-W5] React StrictMode (etki iki kez çalışır): ikinci, boş okuma önceki geçerli token'ı EZMEZ", async () => {
    openAt(`${PATH}#token=${FRAG_TOKEN}`);
    render(
      <StrictMode>
        <AcceptInvitePage />
      </StrictMode>,
    );
    await waitFor(() => expect(window.location.hash).toBe(""));
    await waitFor(() => expect(submitButton()).not.toBeDisabled());

    fillAndSubmit();
    await waitFor(() => expect(acceptInviteMock).toHaveBeenCalledWith(FRAG_TOKEN, PASSWORD));
  });

  it("[P3-W6] token'sız açılış: mevcut 'geçersiz' iletisi gösterilir, gönder düğmesi kapalı, kabul isteği ve adres değişikliği YOK", async () => {
    const spy = vi.spyOn(window.history, "replaceState");
    render(<AcceptInvitePage />);

    await waitFor(() => expect(screen.getByText("Davet bağlantısı geçersiz (token bulunamadı).")).toBeTruthy());
    expect(submitButton()).toBeDisabled();
    expect(acceptInviteMock).not.toHaveBeenCalled();
    expect(spy).not.toHaveBeenCalled();
  });

  it("[P3-W7] token konsola, localStorage / sessionStorage'a ve çereze YAZILMAZ; GET / fetch isteğinde yer almaz (başarı + ret yolu)", async () => {
    const consoleSpies = (["log", "info", "warn", "error", "debug", "trace"] as const).map((m) =>
      vi.spyOn(console, m).mockImplementation(() => {}),
    );
    const setItemSpy = vi.spyOn(Storage.prototype, "setItem");
    const fetchSpy = vi.fn(() => new Promise<Response>(() => {}));
    vi.stubGlobal("fetch", fetchSpy);
    localStorage.clear();
    sessionStorage.clear();

    // Başarı yolu (yeni bağlantı) + ret yolu (eski bağlantı; sunucu iletisi gösterilir).
    openAt(`${PATH}#token=${FRAG_TOKEN}`);
    const ok = render(<AcceptInvitePage />);
    await waitFor(() => expect(window.location.hash).toBe(""));
    fillAndSubmit();
    await waitFor(() => expect(acceptInviteMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByText(/Parolanız belirlendi/i)).toBeTruthy());
    ok.unmount();

    acceptInviteMock.mockRejectedValueOnce({ body: { message: "Geçersiz veya süresi dolmuş davet" } });
    openAt(`${PATH}?token=${QUERY_TOKEN}`);
    render(<AcceptInvitePage />);
    await waitFor(() => expect(window.location.search).toBe(""));
    fillAndSubmit();
    await waitFor(() => expect(screen.getByText("Geçersiz veya süresi dolmuş davet")).toBeTruthy());

    const leaked = (v: unknown) => {
      const s = (() => {
        try {
          return typeof v === "string" ? v : JSON.stringify(v);
        } catch {
          return String(v);
        }
      })();
      return s.includes(FRAG_TOKEN) || s.includes(QUERY_TOKEN);
    };
    for (const spy of consoleSpies) {
      for (const call of spy.mock.calls) expect(call.some(leaked)).toBe(false);
    }
    for (const call of setItemSpy.mock.calls) expect(call.some(leaked)).toBe(false);
    for (const store of [localStorage, sessionStorage]) {
      for (let i = 0; i < store.length; i++) {
        const k = store.key(i)!;
        expect(leaked(k) || leaked(store.getItem(k))).toBe(false);
      }
    }
    expect(leaked(document.cookie)).toBe(false);
    for (const call of fetchSpy.mock.calls as unknown[][]) expect(call.some(leaked)).toBe(false);
    expect(window.location.href).not.toContain(FRAG_TOKEN);
    expect(window.location.href).not.toContain(QUERY_TOKEN);
    // Token yalnız kabul çağrısının argümanı olarak gider (api.acceptInvite → POST gövdesi).
    expect(acceptInviteMock.mock.calls.map((c) => c[0])).toEqual([FRAG_TOKEN, QUERY_TOKEN]);
  });

  it("[P3-W8] başarılı kabul sonrası giriş sayfasına yönlendirilir (mevcut davranış)", async () => {
    vi.useFakeTimers();
    try {
      openAt(`${PATH}#token=${FRAG_TOKEN}`);
      act(() => {
        render(<AcceptInvitePage />);
      });
      fillAndSubmit();
      await vi.waitFor(() => expect(screen.getByText(/Parolanız belirlendi/i)).toBeTruthy());
      act(() => {
        vi.advanceTimersByTime(1600);
      });
      expect(pushMock).toHaveBeenCalledWith("/auth/login");
    } finally {
      vi.useRealTimers();
    }
  });
});
