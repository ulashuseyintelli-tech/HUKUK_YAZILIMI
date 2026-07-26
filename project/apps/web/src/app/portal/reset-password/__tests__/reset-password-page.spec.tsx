import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import ResetPasswordPage from "@/app/portal/reset-password/page";

const pushMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

const fetchMock = vi.fn();

/**
 * CLIENT-P2-CREDENTIAL-RECOVERY-P01 — /portal/reset-password sayfası: minimum uzunluk +
 * eşleşme validasyonu client-side'da uygulanır (accept-invite/page.tsx ile aynı desen).
 *
 * CLIENT-SEC-P01 (reset-token transport hardening) — token artık URL query'den DEĞİL,
 * FRAGMENT'tan (#token=...) okunur; okunduktan hemen sonra `history.replaceState` ile
 * adres çubuğundan temizlenir; yalnız request BODY ile gönderilir; local/sessionStorage'a
 * ASLA yazılmaz; eski `?token=` linkleri KABUL EDİLMEZ. OFFICE emsali:
 * app/auth/reset-password/__tests__/reset-password-page.spec.tsx (OFFICE-AUTH-P02-HARDENING-R01).
 */
function setLocation(search: string, hash: string) {
  window.history.pushState(null, "", `/portal/reset-password${search}${hash}`);
}

describe("PortalResetPasswordPage — CLIENT-P2-CREDENTIAL-RECOVERY-P01 + CLIENT-SEC-P01", () => {
  beforeEach(() => {
    pushMock.mockClear();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    setLocation("", "#token=RAW_TOKEN_123");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
    sessionStorage.clear();
  });

  function fillPasswords(password: string, confirmation: string) {
    fireEvent.change(screen.getByPlaceholderText("En az 8 karakter"), { target: { value: password } });
    fireEvent.change(screen.getByPlaceholderText("Şifrenizi tekrar girin"), { target: { value: confirmation } });
  }

  it("[1] 8 karakterden kısa şifre → hata gösterilir, fetch ÇAĞRILMAZ", async () => {
    render(<ResetPasswordPage />);
    fillPasswords("kisa1", "kisa1");
    fireEvent.click(screen.getByRole("button", { name: /Şifreyi Güncelle/ }));

    await waitFor(() => expect(screen.getByText(/en az 8 karakter/i)).toBeTruthy());
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("[2] şifreler eşleşmiyor → hata gösterilir, fetch ÇAĞRILMAZ", async () => {
    render(<ResetPasswordPage />);
    fillPasswords("GecerliSifre1", "FarkliSifre1");
    fireEvent.click(screen.getByRole("button", { name: /Şifreyi Güncelle/ }));

    await waitFor(() => expect(screen.getByText(/eşleşmiyor/i)).toBeTruthy());
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("[3] geçerli+eşleşen şifre → FRAGMENT'tan okunan ham token + password ile POST /api/portal/reset-password", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ success: true }) });
    render(<ResetPasswordPage />);
    await waitFor(() => expect(screen.getByRole("button", { name: /Şifreyi Güncelle/ })).not.toBeDisabled());
    fillPasswords("GecerliSifre1", "GecerliSifre1");
    fireEvent.click(screen.getByRole("button", { name: /Şifreyi Güncelle/ }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, opts] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/api/portal/reset-password");
    expect(JSON.parse(opts.body)).toEqual({ token: "RAW_TOKEN_123", password: "GecerliSifre1" });
  });

  it("[4] CLIENT-SEC-P01: token YALNIZ request body'de gider — istek URL'inde veya header'da taşınmaz", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ success: true }) });
    render(<ResetPasswordPage />);
    await waitFor(() => expect(screen.getByRole("button", { name: /Şifreyi Güncelle/ })).not.toBeDisabled());
    fillPasswords("GecerliSifre1", "GecerliSifre1");
    fireEvent.click(screen.getByRole("button", { name: /Şifreyi Güncelle/ }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, opts] = fetchMock.mock.calls[0];
    // URL yüzeyi token'dan tamamen arınmış olmalı (access log / Referer sızıntısı yok).
    expect(String(url)).not.toContain("RAW_TOKEN_123");
    expect(String(url)).not.toMatch(/[?&]token=/);
    // Özel bir token transport header'ı EKLENMEMİŞ olmalı.
    expect(JSON.stringify(opts.headers ?? {})).not.toContain("RAW_TOKEN_123");
    // Token yalnız body'de.
    expect(JSON.parse(opts.body).token).toBe("RAW_TOKEN_123");
  });

  it("[5] CLIENT-SEC-P01: token okunduktan hemen sonra fragment URL'den temizlenir (history.replaceState)", async () => {
    render(<ResetPasswordPage />);
    await waitFor(() => expect(window.location.hash).toBe(""));
    expect(window.location.pathname).toBe("/portal/reset-password");
    // Temizlik sonrası token hiçbir görünür URL yüzeyinde kalmamalı.
    expect(window.location.href).not.toContain("RAW_TOKEN_123");
  });

  it("[6] CLIENT-SEC-P01: ESKİ `?token=` query linki KABUL EDİLMEZ — submit devre dışı, fetch YOK", async () => {
    setLocation("?token=OLD_QUERY_TOKEN", "");
    render(<ResetPasswordPage />);

    await waitFor(() => expect(screen.getByText(/Bağlantı geçersiz görünüyor/i)).toBeTruthy());
    expect(screen.getByRole("button", { name: /Şifreyi Güncelle/ })).toBeDisabled();
    // Query'deki değer hiçbir koşulda token olarak benimsenmemeli.
    fillPasswords("GecerliSifre1", "GecerliSifre1");
    fireEvent.click(screen.getByRole("button", { name: /Şifreyi Güncelle/ }));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("[7] CLIENT-SEC-P01: fragment'ta token YOK → uyarı + yeni bağlantı isteme yolu korunur", async () => {
    setLocation("", "");
    render(<ResetPasswordPage />);

    await waitFor(() => expect(screen.getByText(/Bağlantı geçersiz görünüyor/i)).toBeTruthy());
    expect(screen.getByRole("button", { name: /Şifreyi Güncelle/ })).toBeDisabled();
    // Owner invariant: kullanıcı her zaman yeni bir sıfırlama linki talep edebilmeli.
    const link = screen.getByRole("link", { name: /Yeni bağlantı iste/i });
    expect(link.getAttribute("href")).toBe("/portal/forgot-password");
  });

  it("[8] CLIENT-SEC-P01: ham token local/sessionStorage'a ASLA yazılmaz", async () => {
    const setItemSpy = vi.spyOn(Storage.prototype, "setItem");
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ success: true }) });
    render(<ResetPasswordPage />);
    await waitFor(() => expect(screen.getByRole("button", { name: /Şifreyi Güncelle/ })).not.toBeDisabled());
    fillPasswords("GecerliSifre1", "GecerliSifre1");
    fireEvent.click(screen.getByRole("button", { name: /Şifreyi Güncelle/ }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    // Hiçbir setItem çağrısı ham token'ı (veya parolayı) taşımamalı.
    for (const call of setItemSpy.mock.calls) {
      expect(String(call[1])).not.toContain("RAW_TOKEN_123");
      expect(String(call[1])).not.toContain("GecerliSifre1");
    }
    // Depolama yüzeyinin tamamı token'dan arınmış olmalı.
    expect(JSON.stringify({ ...localStorage })).not.toContain("RAW_TOKEN_123");
    expect(JSON.stringify({ ...sessionStorage })).not.toContain("RAW_TOKEN_123");
    setItemSpy.mockRestore();
  });

  it("[9] CLIENT-SEC-P01: başarılı reset sonrası form kaldırılır — ham token tekrar gönderilemez", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ success: true }) });
    render(<ResetPasswordPage />);
    await waitFor(() => expect(screen.getByRole("button", { name: /Şifreyi Güncelle/ })).not.toBeDisabled());
    fillPasswords("GecerliSifre1", "GecerliSifre1");
    fireEvent.click(screen.getByRole("button", { name: /Şifreyi Güncelle/ }));

    // Başarı panelinde form (ve dolayısıyla tekrar gönderim yolu) artık yok.
    await waitFor(() => expect(screen.getByText(/Şifreniz Güncellendi/i)).toBeTruthy());
    expect(screen.queryByRole("button", { name: /Şifreyi Güncelle/ })).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
