import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import PortalProfilePage from "@/app/portal/profile/page";

const fetchMock = vi.fn();

/**
 * D5-SEC-R02 (owner kararı 2026-09-28) — portal profil parola değiştirme sıfırlama sayfasıyla AYNI kurala geçer:
 * yeni parola en az 8 karakter. API de aynı kuralı uygular (PortalChangePasswordDto); mevcut parolalar için zorunlu
 * değişiklik yoktur (yalnız YENİ parola denetlenir).
 */
describe("PortalProfilePage — D5-SEC-R02 yeni parola en az 8 karakter", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    localStorage.setItem("portal_token", "T");
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  function fill(oldPw: string, newPw: string, confirm: string) {
    const inputs = document.querySelectorAll("form input");
    fireEvent.change(inputs[0], { target: { value: oldPw } });
    fireEvent.change(inputs[1], { target: { value: newPw } });
    fireEvent.change(inputs[2], { target: { value: confirm } });
    fireEvent.submit(document.querySelector("form")!);
  }

  it("[1] ipucu metni 8 karakter", () => {
    render(<PortalProfilePage />);
    expect(screen.getByPlaceholderText("En az 8 karakter")).toBeTruthy();
    expect(screen.queryByPlaceholderText("En az 6 karakter")).toBeNull();
  });

  it("[2] 7 karakterlik yeni parola → hata gösterilir, fetch ÇAĞRILMAZ (eskiden 6+ kabul ediliyordu)", async () => {
    render(<PortalProfilePage />);
    fill("eski6c", "1234567", "1234567");
    await waitFor(() => expect(screen.getByText(/en az 8 karakter/i)).toBeTruthy());
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("[3] 8 karakterlik yeni parola + kısa mevcut parola → istek gönderilir; gövde yalnız oldPassword + newPassword", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ success: true }) });
    render(<PortalProfilePage />);
    fill("eski6c", "12345678", "12345678");
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/api/portal/change-password");
    expect(JSON.parse(init.body)).toEqual({ oldPassword: "eski6c", newPassword: "12345678" });
  });
});
