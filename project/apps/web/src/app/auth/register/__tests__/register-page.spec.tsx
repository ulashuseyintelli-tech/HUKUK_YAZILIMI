import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import RegisterPage from "@/app/auth/register/page";

/**
 * OFFICE-AUTH-P01 register hotfix — önceki davranış: handleSubmit hiçbir API çağırmadan
 * console.log(plaintext parola dahil form verisi) yapıp sahte /dashboard yönlendirmesi
 * yapıyordu. Artık form/parola alanı YOK — sayfa fail-closed, yalnız "kullanılamıyor" mesajı.
 */
describe("RegisterPage — OFFICE-AUTH-P01 hotfix", () => {
  afterEach(() => vi.restoreAllMocks());

  it("[1] hiçbir parola/form input'u RENDER ETMEZ (anonim kayıt bu görevde aktif değil)", () => {
    render(<RegisterPage />);
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(document.querySelector('input[type="password"]')).toBeNull();
    expect(document.querySelector("form")).toBeNull();
  });

  it("[2] kullanıcıya kaydın şu an kullanılamadığını AÇIKÇA belirtir", () => {
    render(<RegisterPage />);
    expect(screen.getByRole("heading", { name: /kullanılamıyor/i })).toBeTruthy();
    expect(screen.getByText(/devre dışı/i)).toBeTruthy();
  });

  it("[3] render sırasında console.log ÇAĞRILMAZ (eski davranış: plaintext parola loglanıyordu)", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    render(<RegisterPage />);
    expect(logSpy).not.toHaveBeenCalled();
  });

  it("[4] giriş sayfasına dönüş linki sunar (kullanıcı kilitli kalmaz)", () => {
    render(<RegisterPage />);
    const link = screen.getByRole("link", { name: /giriş sayfasına dön/i });
    expect(link.getAttribute("href")).toBe("/auth/login");
  });
});
