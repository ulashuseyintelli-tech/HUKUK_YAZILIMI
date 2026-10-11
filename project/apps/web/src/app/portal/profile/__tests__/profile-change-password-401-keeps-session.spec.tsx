import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import PortalProfilePage from "@/app/portal/profile/page";
import { PORTAL_SESSION_REJECTED_EVENT } from "@/lib/portal-session";

/**
 * REGRESYON KORUMASI — şifre değiştirme ucunun 401'i OTURUM REDDİ DEĞİLDİR.
 *
 * Sunucu "mevcut şifre yanlış" durumunu da 401 ile bildirir. Portal oturum reddi kuralı
 * (`@/lib/portal-session`) bu çağrıya UYGULANMAZ: mevcut şifresini yanlış yazan kullanıcı
 * oturumdan atılmaz, sunucunun metni görünür. Bu test, biri ileride "her 401'de çıkış"
 * kuralını profil sayfasına da bağlarsa kırılır. (Profil sayfasının kaynağı bu yamada değişmedi.)
 */
describe("PortalProfilePage — şifre değiştirme 401'i oturumu KORUR", () => {
  const fetchMock = vi.fn();
  const rejectedEvents = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    rejectedEvents.mockClear();
    vi.stubGlobal("fetch", fetchMock);
    localStorage.setItem("portal_token", "T1");
    localStorage.setItem("portal_user", JSON.stringify({ clientName: "Test Müvekkil" }));
    window.addEventListener(PORTAL_SESSION_REJECTED_EVENT, rejectedEvents);
  });
  afterEach(() => {
    window.removeEventListener(PORTAL_SESSION_REJECTED_EVENT, rejectedEvents);
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it("401 'Mevcut şifre yanlış' → oturum işareti ve kullanıcı bilgisi yerinde, olay yok, metin görünür", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 401, json: async () => ({ message: "Mevcut şifre yanlış" }) });
    render(<PortalProfilePage />);
    const inputs = document.querySelectorAll("form input");
    fireEvent.change(inputs[0], { target: { value: "yanlis-eski" } });
    fireEvent.change(inputs[1], { target: { value: "12345678" } });
    fireEvent.change(inputs[2], { target: { value: "12345678" } });
    fireEvent.submit(document.querySelector("form")!);

    await waitFor(() => expect(screen.getByText("Mevcut şifre yanlış")).toBeTruthy());
    expect(String(fetchMock.mock.calls[0][0])).toContain("/api/portal/change-password");
    expect(localStorage.getItem("portal_token")).toBe("T1");
    expect(localStorage.getItem("portal_user")).not.toBeNull();
    expect(rejectedEvents).not.toHaveBeenCalled();
  });
});
