import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import LoginPage from "@/app/auth/login/page";

const loginMock = vi.fn().mockResolvedValue(undefined);

vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ login: loginMock }),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
}));

/**
 * OFFICE-AUTH-P01 — login formu: şifre gözü mevcut, "Beni hatırla" controlled checkbox
 * ve login() çağrısına dördüncü argüman olarak doğru şekilde iletiliyor.
 */
describe("LoginPage — OFFICE-AUTH-P01", () => {
  beforeEach(() => {
    loginMock.mockClear();
    localStorage.clear();
  });

  it("[1] şifre alanında görünürlük toggle'ı render edilir", () => {
    render(<LoginPage />);
    expect(screen.getByRole("button", { name: "Şifreyi göster" })).toBeTruthy();
  });

  it("[2] 'Beni hatırla' işaretlenmeden submit → login(email, password, tenantSlug, false)", async () => {
    render(<LoginPage />);
    fireEvent.change(screen.getByPlaceholderText("kurum-adi"), { target: { value: "telli-hukuk" } });
    fireEvent.change(screen.getByPlaceholderText("ornek@email.com"), { target: { value: "a@x.com" } });
    fireEvent.change(document.querySelector('input[name="password"]')!, { target: { value: "sifre123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Giriş Yap" }));

    await waitFor(() => expect(loginMock).toHaveBeenCalledWith("a@x.com", "sifre123456", "telli-hukuk", false));
  });

  it("[3] 'Beni hatırla' işaretlenip submit → login(...,true) çağrılır", async () => {
    render(<LoginPage />);
    fireEvent.change(screen.getByPlaceholderText("kurum-adi"), { target: { value: "telli-hukuk" } });
    fireEvent.change(screen.getByPlaceholderText("ornek@email.com"), { target: { value: "a@x.com" } });
    fireEvent.change(document.querySelector('input[name="password"]')!, { target: { value: "sifre123456" } });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Giriş Yap" }));

    await waitFor(() => expect(loginMock).toHaveBeenCalledWith("a@x.com", "sifre123456", "telli-hukuk", true));
  });

  it("[4] 'Kayıt olun' bağlantısı artık YOK (register hotfix — fail-closed)", () => {
    render(<LoginPage />);
    expect(screen.queryByRole("link", { name: /kayıt olun/i })).toBeNull();
  });

  it("[5] localStorage'da kayıtlı giriş varsa kurum/e-posta otomatik dolar ve 'Beni hatırla' işaretlenir", async () => {
    localStorage.setItem("rememberedLogin", JSON.stringify({ tenantSlug: "telli-hukuk", email: "ulastelli@tellihukuk.com" }));
    render(<LoginPage />);

    await waitFor(() => {
      expect((screen.getByPlaceholderText("kurum-adi") as HTMLInputElement).value).toBe("telli-hukuk");
      expect((screen.getByPlaceholderText("ornek@email.com") as HTMLInputElement).value).toBe("ulastelli@tellihukuk.com");
      expect(screen.getByRole("checkbox")).toBeChecked();
    });
  });

  it("[6] 'Beni hatırla' işaretliyken başarılı girişte kurum/e-posta localStorage'a kaydedilir (parola hariç)", async () => {
    render(<LoginPage />);
    fireEvent.change(screen.getByPlaceholderText("kurum-adi"), { target: { value: "telli-hukuk" } });
    fireEvent.change(screen.getByPlaceholderText("ornek@email.com"), { target: { value: "a@x.com" } });
    fireEvent.change(document.querySelector('input[name="password"]')!, { target: { value: "sifre123456" } });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Giriş Yap" }));

    await waitFor(() => {
      const saved = JSON.parse(localStorage.getItem("rememberedLogin")!);
      expect(saved).toEqual({ tenantSlug: "telli-hukuk", email: "a@x.com" });
    });
    expect(localStorage.getItem("rememberedLogin")).not.toContain("sifre123456");
  });

  it("[7] 'Beni hatırla' işaretsizken başarılı girişte önceden kayıtlı giriş bilgisi temizlenir", async () => {
    localStorage.setItem("rememberedLogin", JSON.stringify({ tenantSlug: "eski-kurum", email: "eski@x.com" }));
    render(<LoginPage />);
    // Önceki kayıt bulunduğu için mount sonrası checkbox otomatik işaretlenir; testte bilinçli olarak kaldırıyoruz.
    await waitFor(() => expect(screen.getByRole("checkbox")).toBeChecked());
    fireEvent.click(screen.getByRole("checkbox"));
    expect(screen.getByRole("checkbox")).not.toBeChecked();

    fireEvent.change(screen.getByPlaceholderText("kurum-adi"), { target: { value: "telli-hukuk" } });
    fireEvent.change(screen.getByPlaceholderText("ornek@email.com"), { target: { value: "a@x.com" } });
    fireEvent.change(document.querySelector('input[name="password"]')!, { target: { value: "sifre123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Giriş Yap" }));

    await waitFor(() => expect(loginMock).toHaveBeenCalledWith("a@x.com", "sifre123456", "telli-hukuk", false));
    expect(localStorage.getItem("rememberedLogin")).toBeNull();
  });
});
