import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import ResetPasswordPage from "@/app/portal/reset-password/page";

const pushMock = vi.fn();
// Stable referans: useEffect(...,[success, router]) her render'da yeni router objesiyle
// gereksiz tekrar tetiklenmesin diye tek bir sabit obje döndürülür.
const routerMock = { push: pushMock };
let searchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => routerMock,
  useSearchParams: () => searchParams,
}));

/**
 * CLIENT-P2-U01 — reset-password web sayfası (daha önce hiç mevcut değildi).
 * Token güvenliği: DOM'da görünür metin değil, console/telemetry'ye yazılmaz.
 */
describe("ResetPasswordPage — CLIENT-P2-U01", () => {
  beforeEach(() => {
    pushMock.mockClear();
    searchParams = new URLSearchParams();
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("[1] token eksik: API çağrısı YAPILMADAN geçersiz-bağlantı durumu gösterilir", () => {
    render(<ResetPasswordPage />);
    expect(screen.getByRole("heading", { name: /geçersiz bağlantı/i })).toBeTruthy();
    expect(document.querySelector("form")).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("[2] şifreler eşleşmiyor: generic hata gösterilir, API çağrısı YAPILMAZ", async () => {
    searchParams = new URLSearchParams({ token: "a".repeat(64) });
    render(<ResetPasswordPage />);

    fireEvent.change(document.querySelector('input[name="newPassword"]')!, { target: { value: "GecerliSifre1" } });
    fireEvent.change(document.querySelector('input[name="confirmPassword"]')!, { target: { value: "FarkliSifre2" } });
    fireEvent.click(screen.getByRole("button", { name: /şifreyi güncelle/i }));

    await waitFor(() => expect(screen.getByText(/eşleşmiyor/i)).toBeTruthy());
    expect(fetch).not.toHaveBeenCalled();
  });

  it("[3] başarılı submit: {token, newPassword} ile POST edilir, başarı ekranı gösterilir, login'e yönlendirilir", async () => {
    const token = "b".repeat(64);
    searchParams = new URLSearchParams({ token });
    (fetch as any).mockResolvedValue({ ok: true, json: async () => ({ success: true }) });

    render(<ResetPasswordPage />);
    fireEvent.change(document.querySelector('input[name="newPassword"]')!, { target: { value: "GecerliSifre1" } });
    fireEvent.change(document.querySelector('input[name="confirmPassword"]')!, { target: { value: "GecerliSifre1" } });
    fireEvent.click(screen.getByRole("button", { name: /şifreyi güncelle/i }));

    await waitFor(() => expect(screen.getByRole("heading", { name: /şifreniz güncellendi/i })).toBeTruthy());

    const [, options] = (fetch as any).mock.calls[0];
    expect(JSON.parse(options.body)).toEqual({ token, newPassword: "GecerliSifre1" });

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/portal/login"), { timeout: 3000 });
  });

  it("[4] API 400 döner (invalid/expired): generic hata gösterilir, sebep detaylandırılmaz", async () => {
    searchParams = new URLSearchParams({ token: "c".repeat(64) });
    (fetch as any).mockResolvedValue({ ok: false, json: async () => ({ message: "Geçersiz veya süresi dolmuş token" }) });

    render(<ResetPasswordPage />);
    fireEvent.change(document.querySelector('input[name="newPassword"]')!, { target: { value: "GecerliSifre1" } });
    fireEvent.change(document.querySelector('input[name="confirmPassword"]')!, { target: { value: "GecerliSifre1" } });
    fireEvent.click(screen.getByRole("button", { name: /şifreyi güncelle/i }));

    await waitFor(() => expect(screen.getByText(/geçersiz veya süresi dolmuş bağlantı/i)).toBeTruthy());
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("[5] token DOM'da görünür metin olarak YER ALMAZ", () => {
    const token = "d".repeat(64);
    searchParams = new URLSearchParams({ token });
    render(<ResetPasswordPage />);
    expect(document.body.textContent).not.toContain(token);
  });

  it("[6] token console'a YAZILMAZ", async () => {
    const token = "e".repeat(64);
    searchParams = new URLSearchParams({ token });
    (fetch as any).mockResolvedValue({ ok: true, json: async () => ({ success: true }) });
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    render(<ResetPasswordPage />);
    fireEvent.change(document.querySelector('input[name="newPassword"]')!, { target: { value: "GecerliSifre1" } });
    fireEvent.change(document.querySelector('input[name="confirmPassword"]')!, { target: { value: "GecerliSifre1" } });
    fireEvent.click(screen.getByRole("button", { name: /şifreyi güncelle/i }));
    await waitFor(() => expect(fetch).toHaveBeenCalled());

    const allLogCalls = [...logSpy.mock.calls, ...errorSpy.mock.calls].flat();
    expect(allLogCalls.some((arg) => typeof arg === "string" && arg.includes(token))).toBe(false);
  });

  it("[7] şifre alanları en az 8 karakter kısıtı client-side'da uygulanır", async () => {
    searchParams = new URLSearchParams({ token: "f".repeat(64) });
    render(<ResetPasswordPage />);

    fireEvent.change(document.querySelector('input[name="newPassword"]')!, { target: { value: "kisa" } });
    fireEvent.change(document.querySelector('input[name="confirmPassword"]')!, { target: { value: "kisa" } });
    fireEvent.click(screen.getByRole("button", { name: /şifreyi güncelle/i }));

    // Not: statik ipucu metni ("En az 8 karakter") formda HER ZAMAN görünür; burada spesifik
    // olarak submit-sonrası HATA mesajını arıyoruz (getByText çift eşleşmede fırlatır).
    await waitFor(() => expect(screen.getByText("Şifre en az 8 karakter olmalıdır")).toBeTruthy());
    expect(fetch).not.toHaveBeenCalled();
  });
});
