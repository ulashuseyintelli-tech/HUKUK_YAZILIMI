import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import ResetPasswordPage from "@/app/auth/reset-password/page";

const resetPasswordMock = vi.fn().mockResolvedValue({ ok: true });
const pushMock = vi.fn();

vi.mock("@/lib/api", () => ({
  api: { resetPassword: (...args: any[]) => resetPasswordMock(...args) },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
  useSearchParams: () => new URLSearchParams("token=raw-test-token"),
}));

/** OFFICE-AUTH-P02 — reset-password formu: token aktarımı, confirmation, generic hata, yönlendirme. */
describe("ResetPasswordPage — OFFICE-AUTH-P02", () => {
  beforeEach(() => {
    resetPasswordMock.mockClear();
    pushMock.mockClear();
  });

  function fillPasswords(password: string, confirmation: string) {
    fireEvent.change(document.querySelector('input[name="password"]')!, { target: { value: password } });
    fireEvent.change(document.querySelector('input[name="passwordConfirmation"]')!, { target: { value: confirmation } });
  }

  it("[1] URL'deki token api.resetPassword'a doğru şekilde iletilir", async () => {
    render(<ResetPasswordPage />);
    fillPasswords("brand-new-password-2026", "brand-new-password-2026");
    fireEvent.click(screen.getByRole("button", { name: /Parolayı Güncelle/i }));

    await waitFor(() =>
      expect(resetPasswordMock).toHaveBeenCalledWith("raw-test-token", "brand-new-password-2026", "brand-new-password-2026")
    );
  });

  it("[2] parola ve tekrarı eşleşmiyorsa api ÇAĞRILMADAN client-side hata gösterilir", async () => {
    render(<ResetPasswordPage />);
    fillPasswords("brand-new-password-2026", "farkli-bir-parola-1234");
    fireEvent.click(screen.getByRole("button", { name: /Parolayı Güncelle/i }));

    await waitFor(() => expect(screen.getByText("Yeni parola ve tekrarı eşleşmiyor")).toBeTruthy());
    expect(resetPasswordMock).not.toHaveBeenCalled();
  });

  it("[3] başarılı reset sonrası login sayfasına yönlendirilir", async () => {
    vi.useFakeTimers();
    render(<ResetPasswordPage />);
    fillPasswords("brand-new-password-2026", "brand-new-password-2026");
    fireEvent.click(screen.getByRole("button", { name: /Parolayı Güncelle/i }));

    await vi.waitFor(() => expect(screen.getByText(/Parolanız güncellendi/i)).toBeTruthy());
    vi.advanceTimersByTime(1600);
    expect(pushMock).toHaveBeenCalledWith("/auth/login");
    vi.useRealTimers();
  });

  it("[4] backend reddi (expired/consumed/geçersiz) → tek, generic hata mesajı — sebep detaylandırılmaz", async () => {
    resetPasswordMock.mockRejectedValueOnce(new Error("Geçersiz veya süresi dolmuş token"));
    render(<ResetPasswordPage />);
    fillPasswords("brand-new-password-2026", "brand-new-password-2026");
    fireEvent.click(screen.getByRole("button", { name: /Parolayı Güncelle/i }));

    await waitFor(() =>
      expect(screen.getByText(/Bu bağlantı geçersiz veya süresi dolmuş\. Yeni bir sıfırlama bağlantısı isteyin\./i)).toBeTruthy()
    );
    expect(screen.getByRole("link", { name: /Yeni bağlantı iste/i })).toBeTruthy();
  });
});
