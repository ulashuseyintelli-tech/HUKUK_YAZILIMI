import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import ResetPasswordPage from "@/app/portal/reset-password/page";

const pushMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
  useSearchParams: () => new URLSearchParams("token=RAW_TOKEN_123"),
}));

const fetchMock = vi.fn();

/**
 * CLIENT-P2-CREDENTIAL-RECOVERY-P01 — /portal/reset-password sayfası: minimum uzunluk +
 * eşleşme validasyonu client-side'da uygulanır (accept-invite/page.tsx ile aynı desen);
 * geçerli girdide token URL'den okunup backend'e ham olarak POST edilir.
 */
describe("PortalResetPasswordPage — CLIENT-P2-CREDENTIAL-RECOVERY-P01", () => {
  beforeEach(() => {
    pushMock.mockClear();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("[1] 8 karakterden kısa şifre → hata gösterilir, fetch ÇAĞRILMAZ", async () => {
    render(<ResetPasswordPage />);
    fireEvent.change(screen.getByPlaceholderText("En az 8 karakter"), { target: { value: "kisa1" } });
    fireEvent.change(screen.getByPlaceholderText("Şifrenizi tekrar girin"), { target: { value: "kisa1" } });
    fireEvent.click(screen.getByRole("button", { name: /Şifreyi Güncelle/ }));

    await waitFor(() => expect(screen.getByText(/en az 8 karakter/i)).toBeTruthy());
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("[2] şifreler eşleşmiyor → hata gösterilir, fetch ÇAĞRILMAZ", async () => {
    render(<ResetPasswordPage />);
    fireEvent.change(screen.getByPlaceholderText("En az 8 karakter"), { target: { value: "GecerliSifre1" } });
    fireEvent.change(screen.getByPlaceholderText("Şifrenizi tekrar girin"), { target: { value: "FarkliSifre1" } });
    fireEvent.click(screen.getByRole("button", { name: /Şifreyi Güncelle/ }));

    await waitFor(() => expect(screen.getByText(/eşleşmiyor/i)).toBeTruthy());
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("[3] geçerli+eşleşen şifre → URL'deki ham token + password ile POST /api/portal/reset-password", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ success: true }) });
    render(<ResetPasswordPage />);
    fireEvent.change(screen.getByPlaceholderText("En az 8 karakter"), { target: { value: "GecerliSifre1" } });
    fireEvent.change(screen.getByPlaceholderText("Şifrenizi tekrar girin"), { target: { value: "GecerliSifre1" } });
    fireEvent.click(screen.getByRole("button", { name: /Şifreyi Güncelle/ }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, opts] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/api/portal/reset-password");
    expect(JSON.parse(opts.body)).toEqual({ token: "RAW_TOKEN_123", password: "GecerliSifre1" });
  });
});
