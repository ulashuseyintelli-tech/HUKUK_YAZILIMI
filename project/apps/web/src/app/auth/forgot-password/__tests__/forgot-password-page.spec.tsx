import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import ForgotPasswordPage from "@/app/auth/forgot-password/page";

const forgotPasswordMock = vi.fn().mockResolvedValue({ success: true });

vi.mock("@/lib/api", () => ({
  api: { forgotPassword: (...args: any[]) => forgotPasswordMock(...args) },
}));

/** OFFICE-AUTH-P02 — forgot-password formu: tenantSlug+email aktarımı, generic success state. */
describe("ForgotPasswordPage — OFFICE-AUTH-P02", () => {
  beforeEach(() => {
    forgotPasswordMock.mockClear();
  });

  it("[1] tenantSlug ve email doğru şekilde api.forgotPassword'a iletilir", async () => {
    render(<ForgotPasswordPage />);
    fireEvent.change(screen.getByPlaceholderText("kurum-adi"), { target: { value: "telli-hukuk" } });
    fireEvent.change(screen.getByPlaceholderText("ornek@email.com"), { target: { value: "a@x.com" } });
    fireEvent.click(screen.getByRole("button", { name: /Sıfırlama Bağlantısı Gönder/i }));

    await waitFor(() => expect(forgotPasswordMock).toHaveBeenCalledWith("a@x.com", "telli-hukuk"));
  });

  it("[2] başarılı istekten sonra generic success state gösterilir (kullanıcı/tenant varlığı hakkında bilgi vermez)", async () => {
    render(<ForgotPasswordPage />);
    fireEvent.change(screen.getByPlaceholderText("kurum-adi"), { target: { value: "telli-hukuk" } });
    fireEvent.change(screen.getByPlaceholderText("ornek@email.com"), { target: { value: "a@x.com" } });
    fireEvent.click(screen.getByRole("button", { name: /Sıfırlama Bağlantısı Gönder/i }));

    await waitFor(() =>
      expect(screen.getByText(/Eğer bu bilgilerle kayıtlı bir hesap varsa/i)).toBeTruthy()
    );
    expect(screen.getByRole("link", { name: /Giriş sayfasına dön/i })).toBeTruthy();
  });

  it("[3] ağ/istek hatasında hata mesajı gösterilir, generic success state gösterilmez", async () => {
    forgotPasswordMock.mockRejectedValueOnce(new Error("API sunucusuna bağlanılamıyor"));
    render(<ForgotPasswordPage />);
    fireEvent.change(screen.getByPlaceholderText("kurum-adi"), { target: { value: "telli-hukuk" } });
    fireEvent.change(screen.getByPlaceholderText("ornek@email.com"), { target: { value: "a@x.com" } });
    fireEvent.click(screen.getByRole("button", { name: /Sıfırlama Bağlantısı Gönder/i }));

    await waitFor(() => expect(screen.getByText("API sunucusuna bağlanılamıyor")).toBeTruthy());
    expect(screen.queryByText(/Eğer bu bilgilerle kayıtlı bir hesap varsa/i)).toBeNull();
  });

  it("[4] account-recovery ve login navigasyon linkleri mevcut", () => {
    render(<ForgotPasswordPage />);
    expect(screen.getByRole("link", { name: /Kurumunuzu bilmiyor musunuz/i })).toBeTruthy();
    expect(screen.getByRole("link", { name: /Giriş sayfasına dön/i })).toBeTruthy();
  });
});
