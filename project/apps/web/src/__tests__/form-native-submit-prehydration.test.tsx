/**
 * HİDRASYON ÖNCESİ / YEREL FORM GÖNDERİMİ — parola ve kimlik formları.
 *
 * Ölçülen kusur (2026-10-01, başsız Edge): `<form onSubmit>` `method` taşımıyordu. React işleyicisi
 * bağlanmadan (hidrasyon öncesi) ya da işleyiciyi atlayan `form.submit()` ile gönderilen form tarayıcının
 * varsayılan yöntemiyle (GET) gidiyor, `name` taşıyan alanlar adrese yazılıyordu:
 * `/auth/login?tenantSlug=…&email=…&password=…`.
 *
 * Bu test her form için üç durumu ölçer:
 *   1. SUNUCU HTML'i (hidrasyon öncesi tarayıcının gördüğü): form yöntemi POST → alanlar adrese değil
 *      gövdeye gider; gönder düğmesi KAPALI → tıklama / Enter ile gönderilemez; React işleyicisi yoktur.
 *   2. HİDRASYON SONRASI: düğme açılır, gönderim React işleyicisine düşer (yerel gönderim engellenir).
 *   3. YALNIZ İSTEMCİDE ÇİZİM (sunucu HTML'i yok): düğme ilk çizimden itibaren açıktır — kapalı aralık
 *      yalnız "DOM'da form var ama işleyicisi yok" durumunu kapsar.
 *
 * jsdom gezinme yapmaz; "alanlar nereye gider" sorusu formun DOM'daki `method` değerinden okunur (tarayıcının
 * kendi yorumu). Gerçek tarayıcı ölçümü teslim raporundadır.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import type { ReactElement } from "react";

import LoginPage from "@/app/auth/login/page";
import AcceptInvitePage from "@/app/auth/accept-invite/page";
import OfficeResetPasswordPage from "@/app/auth/reset-password/page";
import OfficeForgotPasswordPage from "@/app/auth/forgot-password/page";
import AccountRecoveryPage from "@/app/auth/account-recovery/page";
import PortalLoginPage from "@/app/portal/login/page";
import PortalProfilePage from "@/app/portal/profile/page";
import PortalResetPasswordPage from "@/app/portal/reset-password/page";
import PortalForgotPasswordPage from "@/app/portal/forgot-password/page";
import SecuritySettingsPage from "@/app/(dashboard)/settings/security/page";
import { ClientPortalTab } from "@/components/client/client-portal-tab";

const loginMock = vi.fn().mockResolvedValue(undefined);
const apiMock = {
  getAuthCapabilities: vi.fn().mockResolvedValue({ passwordRecoveryEnabled: false }),
  acceptInvite: vi.fn().mockResolvedValue({ ok: true, userId: "u1" }),
  resetPassword: vi.fn().mockResolvedValue({ ok: true }),
  forgotPassword: vi.fn().mockResolvedValue({ success: true }),
  findTenantsForEmail: vi.fn().mockResolvedValue({ status: "NONE" }),
  changeMyPassword: vi.fn().mockResolvedValue({ ok: true }),
  enablePortalAccess: vi.fn().mockResolvedValue({}),
  disablePortalAccess: vi.fn().mockResolvedValue({}),
  clearToken: vi.fn(),
};
let searchParams = new URLSearchParams();

vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ login: loginMock }) }));
vi.mock("@/lib/api", () => ({ api: new Proxy({}, { get: (_t, key: string) => (apiMock as Record<string, unknown>)[key] }) }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => searchParams,
  usePathname: () => "/",
}));

type FormCase = {
  /** Sayfa / bileşen */
  id: string;
  element: () => ReactElement;
  /** `useSearchParams` içeriği (davet token'ı sorgu dizesinde gelir) */
  search?: string;
  /** Adres parçası (sıfırlama token'ı `#token=` ile gelir; yalnız hidrasyondan sonra okunur) */
  hash?: string;
  /** Yerel gönderimde tarayıcının göndereceği (name taşıyan) alanlar */
  namedFields: string[];
};

const FORMS: FormCase[] = [
  { id: "/auth/login", element: () => <LoginPage />, namedFields: ["tenantSlug", "email", "password", "rememberMe"] },
  { id: "/auth/accept-invite", element: () => <AcceptInvitePage />, search: "token=davet-token", namedFields: ["password", "confirm"] },
  { id: "/auth/reset-password", element: () => <OfficeResetPasswordPage />, hash: "#token=sifirlama-token", namedFields: ["password", "passwordConfirmation"] },
  { id: "/auth/forgot-password", element: () => <OfficeForgotPasswordPage />, namedFields: ["tenantSlug", "email"] },
  { id: "/auth/account-recovery", element: () => <AccountRecoveryPage />, namedFields: ["email"] },
  { id: "/portal/login", element: () => <PortalLoginPage />, namedFields: [] },
  { id: "/portal/profile", element: () => <PortalProfilePage />, namedFields: [] },
  { id: "/portal/reset-password", element: () => <PortalResetPasswordPage />, hash: "#token=sifirlama-token", namedFields: [] },
  { id: "/portal/forgot-password", element: () => <PortalForgotPasswordPage />, namedFields: [] },
  { id: "/settings/security", element: () => <SecuritySettingsPage />, namedFields: ["currentPassword", "newPassword", "confirmPassword"] },
  { id: "ClientPortalTab", element: () => <ClientPortalTab clientId="c1" hasPortalAccess={false} onChanged={() => {}} />, namedFields: [] },
];

function prepare(c: FormCase) {
  searchParams = new URLSearchParams(c.search ?? "");
  window.history.replaceState(null, "", `/${c.hash ?? ""}`);
}

/** Sunucunun ürettiği HTML'i React OLMADAN belgeye koyar — hidrasyon öncesi tarayıcının gördüğü durum. */
function mountServerHtml(c: FormCase) {
  prepare(c);
  const host = document.createElement("div");
  host.innerHTML = renderToString(c.element());
  document.body.appendChild(host);
  const form = host.querySelector("form") as HTMLFormElement;
  const submit = form.querySelector('button[type="submit"]') as HTMLButtonElement;
  return { host, form, submit };
}

/** Sunucu HTML'indeki alanları kullanıcının yazdığı gibi doldurur (React yok; değer yalnız DOM'da durur). */
function fillValid(form: HTMLFormElement) {
  for (const el of Array.from(form.querySelectorAll("input"))) {
    if (el.type === "checkbox") continue;
    el.value = el.type === "email" ? "olcum@example.test" : "Olcum-Degeri-123456";
  }
}

const namedFieldsOf = (form: HTMLFormElement) =>
  Array.from(form.elements)
    .map((el) => (el as HTMLInputElement).name)
    .filter(Boolean);

describe("yerel form gönderimi — parola / kimlik formları", () => {
  beforeEach(() => {
    // Alt bileşenler ve portal sayfaları gerçek `fetch` kullanır; test hermetik kalsın.
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => {})));
    localStorage.clear();
    sessionStorage.clear();
  });
  afterEach(() => {
    cleanup();
    document.body.innerHTML = "";
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("ölçülen form sayısı sabittir (liste boşalırsa test kör olur)", () => {
    expect(FORMS.map((f) => f.id)).toHaveLength(11);
  });

  describe.each(FORMS)("$id", (c) => {
    it("sunucu HTML'i: yöntem POST → alanlar adrese yazılmaz; gönder düğmesi kapalı", () => {
      const { form, submit } = mountServerHtml(c);

      expect(form.getAttribute("method")).toBe("post");
      // Tarayıcının yorumu (yansıyan DOM özelliği): "get" olsaydı alanlar sorgu dizesine yazılırdı.
      expect(form.method).toBe("post");
      // Yerel gönderimde gidecek alanlar — POST olduğu için gövdede; kayıt amaçlı sabitlenir.
      expect(namedFieldsOf(form)).toEqual(c.namedFields);

      expect(form.querySelectorAll('button[type="submit"], input[type="submit"]')).toHaveLength(1);
      expect(submit.disabled).toBe(true);
    });

    it("sunucu HTML'i: kapalı düğmeye tıklamak gönderim başlatmaz; React işleyicisi henüz yoktur", () => {
      const { host, form, submit } = mountServerHtml(c);
      const onSubmit = vi.fn();
      host.addEventListener("submit", onSubmit);

      // Alanlar geçerli değerlerle dolu: gönderimi durduran şey `required` doğrulaması DEĞİL, kapalı düğmedir
      // (boş bırakılsaydı düğme açıkken de gönderim başlamaz, test hiçbir şey ölçmezdi).
      fillValid(form);
      expect(form.checkValidity()).toBe(true);

      submit.click();
      expect(onSubmit).not.toHaveBeenCalled();

      // İşleyici bağlı değil: bir gönderim olayı engellenmeden geçer (dönüş true = preventDefault çağrılmadı).
      // Bu aralıkta alanların nereye gideceğini yalnız formun yöntemi belirler.
      expect(fireEvent.submit(form)).toBe(true);
    });

    it("hidrasyon sonrası: düğme açılır, gönderim React işleyicisine düşer (yerel gönderim engellenir)", async () => {
      const { host, form, submit } = mountServerHtml(c);
      expect(submit.disabled).toBe(true);

      render(c.element(), { container: host, hydrate: true });

      await waitFor(() => expect(submit.disabled).toBe(false));
      // Hidrasyon aynı düğümleri devralır (form yeniden yaratılmaz).
      expect(host.querySelector("form")).toBe(form);
      expect(form.method).toBe("post");

      let notPrevented = true;
      await act(async () => {
        notPrevented = fireEvent.submit(form);
      });
      expect(notPrevented).toBe(false);
    });

    it("yalnız istemcide çizim: düğme ilk çizimden itibaren açıktır, yöntem yine POST", async () => {
      prepare(c);
      const { container } = render(c.element());
      const form = container.querySelector("form") as HTMLFormElement;
      const submit = form.querySelector('button[type="submit"]') as HTMLButtonElement;

      expect(form.method).toBe("post");
      await waitFor(() => expect(submit.disabled).toBe(false));
    });
  });
});
