/**
 * PORTAL-RESET-FORM-01 — portal giriş / şifremi unuttum / şifre sıfırla: devralma (hidrasyon) öncesi doldurulan
 * alanlar, istemci tarafı boş / biçimsiz giriş denetimi, tek gönderim.
 *
 * Ölçülen kusur (üretim derlemesi, başsız Edge): alanlar `useState` ile KONTROLLÜYKEN sayfa React tarafından
 * devralınmadan önce yazılan / yapıştırılan / otomatik doldurulan değerler ekranda görünüyor ama duruma girmiyordu.
 * 2026-10-02'de gönderimde boş gövde gidiyordu (şifremi unuttum: `{ email: "" }` → 201 → "E-posta Gönderildi",
 * e-posta yok). #2894 sonrası main'de (2026-10-03) devralmadan hemen sonraki çizim alanları siliyor; tarayıcının
 * alan denetimi kapalıysa boş gövde yine gidiyor. Gönder düğmesinin devralmaya kadar kapalı olması alanı durumla
 * eşitlemez.
 *
 * İstenen: API'ye giden değerler gönderim anında alanlarda görünen değerlerdir; erken girilen değer kendiliğinden
 * silinmez; boş / biçimsiz giriş istek üretmeden açık uyarı verir (hesap var / yok ayrımı yapan yeni mesaj yok);
 * tek kullanıcı gönderimi tek istektir; parola / adres konsola yazılmaz; reset-password token akışı değişmez.
 *
 * Model: sunucu HTML'i React OLMADAN belgeye konur, alan OLAY ÜRETMEDEN (ya da React dinlemezken üretilen
 * olaylarla) doldurulur, sonra aynı düğümler devralınır ve gönderilir. Gerçek tuş vuruşu ve Enter ile örtük
 * gönderim jsdom'da birebir modellenmez; üretim derlemesi ölçümü (dört doldurma biçimi × düğme / Enter, çift
 * tıklama, Enter + tıklama) teslim kanıtındadır.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import type { ReactElement } from "react";

import PortalLoginPage from "@/app/portal/login/page";
import PortalForgotPasswordPage from "@/app/portal/forgot-password/page";
import PortalResetPasswordPage from "@/app/portal/reset-password/page";

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: pushMock }) }));

const API_BASE = "https://api.olcum.test";
const EMAIL = "erken@olcum.test";
const PASS = "Olcum-Erken-1!";
const NEWPASS = "Yeni-Olcum-123";
const TOKEN = "olcumtoken0123456789abcdef";
const SENSITIVE = [EMAIL, PASS, NEWPASS, TOKEN];

const LOGIN = `${API_BASE}/api/portal/login`;
const FORGOT = `${API_BASE}/api/portal/forgot-password`;
const RESET = `${API_BASE}/api/portal/reset-password`;

const fetchMock = vi.fn();
const CONSOLE_METHODS = ["log", "info", "warn", "error", "debug"] as const;
let consoleSpies: Array<ReturnType<typeof vi.spyOn>> = [];

/** Belirli uca giden gövdeler (çözülmüş). */
function bodiesTo(url: string): Array<Record<string, unknown>> {
  return fetchMock.mock.calls
    .filter((c) => String(c[0]) === url)
    .map((c) => JSON.parse(String((c[1] as RequestInit).body)));
}

/** Yanıtı testin elinde tutulan istek: çözülene dek gönderim "yolda" kalır. */
function pendingResponse() {
  let resolve!: (r: unknown) => void;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

const ok = (body: unknown) => ({ ok: true, json: async () => body });
const fail = (message: string) => ({ ok: false, json: async () => ({ message }) });
const loginOk = () => ok({ token: "portal-oturum-belirteci", user: { id: "pu1", clientName: "Ölçüm Müvekkil" } });

type Fill = (input: HTMLInputElement, value: string) => void;

/** Devralma öncesi doldurma biçimleri (jsdom'da modellenebilenler). */
const PRE_FILL: Array<{ id: string; fill: Fill }> = [
  {
    id: "yalnız değer (olay yok — form geri yüklemesi / sessiz otomatik doldurma modeli)",
    fill: (input, value) => {
      input.value = value;
    },
  },
  {
    id: "değer + input / change olayı, React dinlemezken (yapıştırma / eklenti otomatik doldurma modeli)",
    fill: (input, value) => {
      input.value = value;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    },
  },
];

/** Sunucunun ürettiği HTML'i React OLMADAN belgeye koyar — devralma öncesi tarayıcının gördüğü durum. */
function mountServerHtml(element: ReactElement) {
  const host = document.createElement("div");
  host.innerHTML = renderToString(element);
  document.body.appendChild(host);
  const form = host.querySelector("form") as HTMLFormElement;
  const inputs = Array.from(form.querySelectorAll("input")) as HTMLInputElement[];
  const submit = form.querySelector('button[type="submit"]') as HTMLButtonElement;
  return { host, form, inputs, submit };
}

/** Aynı düğümleri devralır; gönder düğmesi açılana dek bekler. */
async function hydrateInto(dom: ReturnType<typeof mountServerHtml>, element: ReactElement) {
  expect(dom.submit.disabled).toBe(true); // #2894 / token: devralmadan önce kapalı
  render(element, { container: dom.host, hydrate: true });
  await waitFor(() => expect(dom.submit.disabled).toBe(false));
  // Devralma aynı düğümleri kullanır (alanlar yeniden yaratılmaz).
  expect(Array.from(dom.form.querySelectorAll("input"))).toEqual(dom.inputs);
}

/** Yalnız istemcide çizim + devralmadan sonra olaylı yazma (normal kullanıcı). */
function clientRendered(element: ReactElement, values: string[]) {
  const { container } = render(element);
  const form = container.querySelector("form") as HTMLFormElement;
  const inputs = Array.from(form.querySelectorAll("input")) as HTMLInputElement[];
  values.forEach((v, i) => fireEvent.change(inputs[i], { target: { value: v } }));
  const submit = form.querySelector('button[type="submit"]') as HTMLButtonElement;
  return { form, inputs, submit };
}

/** Tarayıcının kendi alan denetimini kapatır: sayfanın kendi denetimi ölçülür (denetimi atlanan istemci modeli). */
function disableBrowserValidation(form: HTMLFormElement) {
  form.noValidate = true;
}

function consoleCallsWithSensitiveValues(): string[] {
  const hits: string[] = [];
  for (const spy of consoleSpies) {
    for (const call of spy.mock.calls) {
      const text = call.map((a: unknown) => (typeof a === "string" ? a : (() => { try { return JSON.stringify(a); } catch { return String(a); } })())).join(" ");
      if (SENSITIVE.some((s) => text.includes(s))) hits.push(text.slice(0, 120));
    }
  }
  return hits;
}

beforeEach(() => {
  pushMock.mockReset();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("NEXT_PUBLIC_API_URL", API_BASE);
  localStorage.clear();
  sessionStorage.clear();
  window.history.replaceState(null, "", "/");
  consoleSpies = CONSOLE_METHODS.map((m) => vi.spyOn(console, m));
});

afterEach(() => {
  // Hiçbir senaryo parola, token ya da adresi konsola yazmaz.
  expect(consoleCallsWithSensitiveValues()).toEqual([]);
  consoleSpies.forEach((s) => s.mockRestore());
  cleanup();
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------------------------------------------
describe("Portal giriş", () => {
  describe.each(PRE_FILL)("devralma ÖNCESİ doldurma: $id", ({ fill }) => {
    it("iki alan devralmadan sonra dolu kalır; giden gövde gönderim anında görünen değerlerdir", async () => {
      fetchMock.mockResolvedValue(loginOk());
      const dom = mountServerHtml(<PortalLoginPage />);
      fill(dom.inputs[0], EMAIL);
      fill(dom.inputs[1], PASS);
      await hydrateInto(dom, <PortalLoginPage />);

      expect(dom.inputs.map((i) => i.value)).toEqual([EMAIL, PASS]);
      const visible = { email: dom.inputs[0].value, password: dom.inputs[1].value };
      fireEvent.click(dom.submit);

      await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/portal"));
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(bodiesTo(LOGIN)).toEqual([visible]);
      expect(localStorage.getItem("portal_token")).toBe("portal-oturum-belirteci");
    });
  });

  it("erken doldurulmuş alanlar + devralmadan sonra 'şifreyi göster' → alanlar silinmez, gövde tam gider", async () => {
    fetchMock.mockResolvedValue(loginOk());
    const dom = mountServerHtml(<PortalLoginPage />);
    dom.inputs[0].value = EMAIL;
    dom.inputs[1].value = PASS;
    await hydrateInto(dom, <PortalLoginPage />);

    fireEvent.click(dom.form.querySelector('button[type="button"]') as HTMLButtonElement);
    await waitFor(() => expect(dom.inputs[1].type).toBe("text"));
    expect(dom.inputs.map((i) => i.value)).toEqual([EMAIL, PASS]);

    fireEvent.click(dom.submit);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(bodiesTo(LOGIN)).toEqual([{ email: EMAIL, password: PASS }]);
  });

  it("e-posta devralmadan önce, parola devralmadan sonra yazıldı → e-posta silinmez, ikisi de gider", async () => {
    fetchMock.mockResolvedValue(loginOk());
    const dom = mountServerHtml(<PortalLoginPage />);
    dom.inputs[0].value = EMAIL;
    await hydrateInto(dom, <PortalLoginPage />);

    fireEvent.change(dom.inputs[1], { target: { value: PASS } });
    expect(dom.inputs[0].value).toBe(EMAIL);

    fireEvent.click(dom.submit);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(bodiesTo(LOGIN)).toEqual([{ email: EMAIL, password: PASS }]);
  });

  it("taban: devralmadan sonra yazan kullanıcı — uç, yöntem, başlık ve gövde değişmez; 401 mesajı gösterilir, alanlar kalır", async () => {
    fetchMock.mockResolvedValue(fail("Geçersiz e-posta veya şifre"));
    const { submit, inputs } = clientRendered(<PortalLoginPage />, [EMAIL, "Yanlis-Parola-9"]);
    fireEvent.click(submit);

    await screen.findByText("Geçersiz e-posta veya şifre");
    const [url, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(LOGIN);
    expect(opts.method).toBe("POST");
    expect(opts.headers).toEqual({ "Content-Type": "application/json" });
    expect(bodiesTo(LOGIN)).toEqual([{ email: EMAIL, password: "Yanlis-Parola-9" }]);
    expect(inputs.map((i) => i.value)).toEqual([EMAIL, "Yanlis-Parola-9"]);
    expect(pushMock).not.toHaveBeenCalled();
  });

  describe("boş / biçimsiz giriş — istek yok, açık uyarı", () => {
    it.each([
      { durum: "e-posta boş", email: "", password: PASS, uyari: "E-posta adresinizi girin." },
      { durum: "e-posta yalnız boşluk", email: "   ", password: PASS, uyari: "E-posta adresinizi girin." },
      { durum: "e-posta biçimsiz", email: "erken-olcum", password: PASS, uyari: "Geçerli bir e-posta adresi girin." },
      { durum: "e-posta alan adı eksik", email: "erken@", password: PASS, uyari: "Geçerli bir e-posta adresi girin." },
      { durum: "parola boş", email: EMAIL, password: "", uyari: "Şifrenizi girin." },
    ])("$durum", async ({ email, password, uyari }) => {
      const { form, submit } = clientRendered(<PortalLoginPage />, [email, password]);
      disableBrowserValidation(form);
      fireEvent.click(submit);

      await screen.findByText(uyari);
      expect(fetchMock).not.toHaveBeenCalled();
      expect(submit.disabled).toBe(false);
    });

    it("alan adında nokta olmayan adres engellenmez (tarayıcının type=email kuralı kadar); parola KIRPILMADAN gider", async () => {
      fetchMock.mockResolvedValue(loginOk());
      const { form, submit } = clientRendered(<PortalLoginPage />, ["erken@olcum", " P4ss bosluklu "]);
      disableBrowserValidation(form);
      fireEvent.click(submit);
      await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/portal"));
      expect(bodiesTo(LOGIN)).toEqual([{ email: "erken@olcum", password: " P4ss bosluklu " }]);
    });

    it("uyarıdan sonra düzeltilen giriş tek istekle gider; uyarı kalkar", async () => {
      fetchMock.mockResolvedValue(loginOk());
      const { form, submit, inputs } = clientRendered(<PortalLoginPage />, ["", PASS]);
      disableBrowserValidation(form);
      fireEvent.click(submit);
      await screen.findByText("E-posta adresinizi girin.");

      fireEvent.change(inputs[0], { target: { value: EMAIL } });
      fireEvent.click(submit);
      await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/portal"));
      expect(bodiesTo(LOGIN)).toEqual([{ email: EMAIL, password: PASS }]);
      expect(screen.queryByText("E-posta adresinizi girin.")).toBeNull();
    });
  });

  describe("tek kullanıcı gönderimi tek istek", () => {
    it("çift tıklama (ikinci tıklama düğme yeniden çizilmeden gelir) → tek istek", async () => {
      const pending = pendingResponse();
      fetchMock.mockReturnValue(pending.promise);
      const { submit } = clientRendered(<PortalLoginPage />, [EMAIL, PASS]);

      await act(async () => {
        submit.click();
        submit.click();
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);

      await act(async () => {
        pending.resolve(loginOk());
      });
      await waitFor(() => expect(pushMock).toHaveBeenCalledTimes(1));
    });

    it("aynı görevde iki requestSubmit (ör. Enter + tıklama) → tek istek", async () => {
      const pending = pendingResponse();
      fetchMock.mockReturnValue(pending.promise);
      const { form } = clientRendered(<PortalLoginPage />, [EMAIL, PASS]);

      await act(async () => {
        form.requestSubmit();
        form.requestSubmit();
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      await act(async () => {
        pending.resolve(loginOk());
      });
    });

    it("başarılı girişten sonra (yönlendirme sürerken) yeni gönderim istek üretmez", async () => {
      fetchMock.mockResolvedValue(loginOk());
      const { form, submit } = clientRendered(<PortalLoginPage />, [EMAIL, PASS]);
      fireEvent.click(submit);
      await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/portal"));

      await act(async () => {
        fireEvent.submit(form);
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("hata yanıtından sonra kilit açılır: yeniden deneme yeni istek üretir", async () => {
      fetchMock.mockResolvedValueOnce(fail("Geçersiz e-posta veya şifre")).mockResolvedValueOnce(loginOk());
      const { submit } = clientRendered(<PortalLoginPage />, [EMAIL, PASS]);

      fireEvent.click(submit);
      await screen.findByText("Geçersiz e-posta veya şifre");
      await waitFor(() => expect(submit.disabled).toBe(false));

      fireEvent.click(submit);
      await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/portal"));
      expect(bodiesTo(LOGIN)).toEqual([{ email: EMAIL, password: PASS }, { email: EMAIL, password: PASS }]);
    });
  });
});

// ---------------------------------------------------------------------------------------------------------------
describe("Portal şifremi unuttum", () => {
  const NEUTRAL = "Eğer bu e-posta adresiyle kayıtlı bir hesap varsa, şifre sıfırlama bağlantısı gönderildi.";

  describe.each(PRE_FILL)("devralma ÖNCESİ doldurma: $id", ({ fill }) => {
    it("adres devralmadan sonra alanda kalır ve aynen gönderilir", async () => {
      fetchMock.mockResolvedValue(ok({ success: true }));
      const dom = mountServerHtml(<PortalForgotPasswordPage />);
      fill(dom.inputs[0], EMAIL);
      await hydrateInto(dom, <PortalForgotPasswordPage />);

      expect(dom.inputs[0].value).toBe(EMAIL);
      const visible = dom.inputs[0].value;
      fireEvent.click(dom.submit);

      await screen.findByText("E-posta Gönderildi");
      expect(bodiesTo(FORGOT)).toEqual([{ email: visible }]);
    });
  });

  it("erken yazılıp devralmadan sonra düzeltilen adres: gönderim anındaki son değer gider", async () => {
    fetchMock.mockResolvedValue(ok({ success: true }));
    const dom = mountServerHtml(<PortalForgotPasswordPage />);
    dom.inputs[0].value = "erken@ol";
    await hydrateInto(dom, <PortalForgotPasswordPage />);
    expect(dom.inputs[0].value).toBe("erken@ol");

    fireEvent.change(dom.inputs[0], { target: { value: EMAIL } });
    fireEvent.click(dom.submit);
    await screen.findByText("E-posta Gönderildi");
    expect(bodiesTo(FORGOT)).toEqual([{ email: EMAIL }]);
  });

  it("taban: devralmadan sonra yazan kullanıcı — uç, yöntem, gövde ve hesap var / yok ayrımı yapmayan metin değişmez", async () => {
    fetchMock.mockResolvedValue(ok({ success: true }));
    const { submit } = clientRendered(<PortalForgotPasswordPage />, [EMAIL]);
    fireEvent.click(submit);

    await screen.findByText("E-posta Gönderildi");
    const [url, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(FORGOT);
    expect(opts.method).toBe("POST");
    expect(opts.headers).toEqual({ "Content-Type": "application/json" });
    expect(bodiesTo(FORGOT)).toEqual([{ email: EMAIL }]);
    expect(screen.getByText(NEUTRAL)).toBeInTheDocument();
  });

  it("taban: sunucu hatası (ör. hız sınırı) mesajı gösterilir; adres alanda kalır", async () => {
    fetchMock.mockResolvedValue(fail("Çok fazla deneme. Lütfen biraz sonra tekrar deneyin."));
    const { submit, inputs } = clientRendered(<PortalForgotPasswordPage />, [EMAIL]);
    fireEvent.click(submit);

    await screen.findByText("Çok fazla deneme. Lütfen biraz sonra tekrar deneyin.");
    expect(screen.queryByText("E-posta Gönderildi")).toBeNull();
    expect(inputs[0].value).toBe(EMAIL);
  });

  describe("boş / biçimsiz giriş — istek yok, açık uyarı, 'gönderildi' ekranı yok", () => {
    it.each([
      { durum: "boş", email: "", uyari: "E-posta adresinizi girin." },
      { durum: "yalnız boşluk", email: "   ", uyari: "E-posta adresinizi girin." },
      { durum: "biçimsiz", email: "erken-olcum", uyari: "Geçerli bir e-posta adresi girin." },
      { durum: "alan adı eksik", email: "erken@", uyari: "Geçerli bir e-posta adresi girin." },
    ])("$durum", async ({ email, uyari }) => {
      const { form, submit } = clientRendered(<PortalForgotPasswordPage />, [email]);
      disableBrowserValidation(form);
      fireEvent.click(submit);

      await screen.findByText(uyari);
      expect(fetchMock).not.toHaveBeenCalled();
      expect(screen.queryByText("E-posta Gönderildi")).toBeNull();
    });
  });

  describe("tek kullanıcı gönderimi tek istek", () => {
    it("çift tıklama (ikinci tıklama düğme yeniden çizilmeden gelir) → tek istek", async () => {
      const pending = pendingResponse();
      fetchMock.mockReturnValue(pending.promise);
      const { submit } = clientRendered(<PortalForgotPasswordPage />, [EMAIL]);

      await act(async () => {
        submit.click();
        submit.click();
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      await act(async () => {
        pending.resolve(ok({ success: true }));
      });
      await screen.findByText("E-posta Gönderildi");
      expect(bodiesTo(FORGOT)).toEqual([{ email: EMAIL }]);
    });

    it("aynı görevde iki requestSubmit → tek istek", async () => {
      const pending = pendingResponse();
      fetchMock.mockReturnValue(pending.promise);
      const { form } = clientRendered(<PortalForgotPasswordPage />, [EMAIL]);

      await act(async () => {
        form.requestSubmit();
        form.requestSubmit();
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      await act(async () => {
        pending.resolve(ok({ success: true }));
      });
    });

    it("yanıt beklenirken forma ikinci gönderim olayı (düğme kapalıyken) → yine tek istek", async () => {
      const pending = pendingResponse();
      fetchMock.mockReturnValue(pending.promise);
      const { form, submit } = clientRendered(<PortalForgotPasswordPage />, [EMAIL]);

      fireEvent.click(submit);
      await waitFor(() => expect(submit.disabled).toBe(true)); // "Gönderiliyor..."
      fireEvent.submit(form);

      expect(fetchMock).toHaveBeenCalledTimes(1);
      await act(async () => {
        pending.resolve(ok({ success: true }));
      });
      await screen.findByText("E-posta Gönderildi");
    });

    it("hata yanıtından sonra kilit açılır: yeniden gönderim yeni istek üretir", async () => {
      fetchMock.mockResolvedValueOnce(fail("Geçici sunucu hatası")).mockResolvedValueOnce(ok({ success: true }));
      const { submit, inputs } = clientRendered(<PortalForgotPasswordPage />, [EMAIL]);

      fireEvent.click(submit);
      await screen.findByText("Geçici sunucu hatası");
      await waitFor(() => expect(submit.disabled).toBe(false));
      expect(inputs[0].value).toBe(EMAIL);

      fireEvent.click(submit);
      await screen.findByText("E-posta Gönderildi");
      expect(bodiesTo(FORGOT)).toEqual([{ email: EMAIL }, { email: EMAIL }]);
    });
  });
});

// ---------------------------------------------------------------------------------------------------------------
describe("Portal şifre sıfırla", () => {
  const RESET_PATH = `/portal/reset-password#token=${TOKEN}`;

  describe.each(PRE_FILL)("devralma ÖNCESİ doldurma: $id", ({ fill }) => {
    it("iki alan token okunduktan sonra dolu kalır; { token, password } gider; token akışı değişmez", async () => {
      fetchMock.mockResolvedValue(ok({ success: true }));
      window.history.replaceState(null, "", RESET_PATH);
      const dom = mountServerHtml(<PortalResetPasswordPage />);
      fill(dom.inputs[0], NEWPASS);
      fill(dom.inputs[1], NEWPASS);
      await hydrateInto(dom, <PortalResetPasswordPage />);

      // Token okundu ve adresten temizlendi (CLIENT-SEC-P01 — değişmedi).
      expect(window.location.hash).toBe("");
      expect(window.location.href).not.toContain(TOKEN);
      expect(dom.inputs.map((i) => i.value)).toEqual([NEWPASS, NEWPASS]);

      const visible = dom.inputs[0].value;
      fireEvent.click(dom.submit);
      await screen.findByText("Şifreniz Güncellendi");
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(RESET);
      expect(String(url)).not.toContain(TOKEN);
      expect(JSON.stringify(opts.headers)).not.toContain(TOKEN);
      expect(bodiesTo(RESET)).toEqual([{ token: TOKEN, password: visible }]);
      expect(JSON.stringify({ ...localStorage, ...sessionStorage })).not.toContain(TOKEN);
    });
  });

  it("ilk alan devralmadan önce, tekrar alanı devralmadan sonra yazıldı → ikisi de korunur ve gider", async () => {
    fetchMock.mockResolvedValue(ok({ success: true }));
    window.history.replaceState(null, "", RESET_PATH);
    const dom = mountServerHtml(<PortalResetPasswordPage />);
    dom.inputs[0].value = NEWPASS;
    await hydrateInto(dom, <PortalResetPasswordPage />);

    fireEvent.change(dom.inputs[1], { target: { value: NEWPASS } });
    expect(dom.inputs[0].value).toBe(NEWPASS);
    fireEvent.click(dom.submit);
    await screen.findByText("Şifreniz Güncellendi");
    expect(bodiesTo(RESET)).toEqual([{ token: TOKEN, password: NEWPASS }]);
  });

  it("taban: başarıdan sonra giriş sayfasına yönlendirme ve form kaldırma değişmez", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    fetchMock.mockResolvedValue(ok({ success: true }));
    window.history.replaceState(null, "", RESET_PATH);
    const { submit } = clientRendered(<PortalResetPasswordPage />, []);
    await waitFor(() => expect(submit.disabled).toBe(false));
    const inputs = Array.from(document.querySelectorAll("form input")) as HTMLInputElement[];
    fireEvent.change(inputs[0], { target: { value: NEWPASS } });
    fireEvent.change(inputs[1], { target: { value: NEWPASS } });
    fireEvent.click(submit);

    await screen.findByText("Şifreniz Güncellendi");
    expect(screen.queryByRole("button", { name: /Şifreyi Güncelle/ })).toBeNull();
    await act(async () => {
      vi.advanceTimersByTime(1600);
    });
    expect(pushMock).toHaveBeenCalledWith("/portal/login");
  });

  it.each([
    { durum: "kısa parola", password: "kisa1", tekrar: "kisa1", uyari: "Şifre en az 8 karakter olmalıdır." },
    { durum: "eşleşmeyen parola", password: NEWPASS, tekrar: `${NEWPASS}x`, uyari: "Şifreler eşleşmiyor." },
    { durum: "iki alan boş (tarayıcı denetimi kapalı)", password: "", tekrar: "", uyari: "Şifre en az 8 karakter olmalıdır." },
  ])("taban: $durum → mevcut uyarı, istek yok", async ({ password, tekrar, uyari }) => {
    window.history.replaceState(null, "", RESET_PATH);
    const { form, submit } = clientRendered(<PortalResetPasswordPage />, []);
    await waitFor(() => expect(submit.disabled).toBe(false));
    const inputs = Array.from(form.querySelectorAll("input")) as HTMLInputElement[];
    fireEvent.change(inputs[0], { target: { value: password } });
    fireEvent.change(inputs[1], { target: { value: tekrar } });
    disableBrowserValidation(form);
    fireEvent.click(submit);

    await screen.findByText(uyari);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("taban: adreste token yok → düğme kapalı; gönderim olayı zorlansa da istek yok, mevcut uyarı", async () => {
    window.history.replaceState(null, "", "/portal/reset-password");
    const { form, submit } = clientRendered(<PortalResetPasswordPage />, [NEWPASS, NEWPASS]);
    await screen.findByText(/Bağlantı geçersiz görünüyor/);
    expect(submit.disabled).toBe(true);

    fireEvent.submit(form);
    await screen.findByText(/Bağlantı geçersiz \(token bulunamadı\)/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  describe("tek kullanıcı gönderimi tek istek", () => {
    async function readyForm() {
      window.history.replaceState(null, "", RESET_PATH);
      const r = clientRendered(<PortalResetPasswordPage />, [NEWPASS, NEWPASS]);
      await waitFor(() => expect(r.submit.disabled).toBe(false));
      return r;
    }

    it("çift tıklama (ikinci tıklama düğme yeniden çizilmeden gelir) → tek istek", async () => {
      const pending = pendingResponse();
      fetchMock.mockReturnValue(pending.promise);
      const { submit } = await readyForm();

      await act(async () => {
        submit.click();
        submit.click();
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      await act(async () => {
        pending.resolve(ok({ success: true }));
      });
      await screen.findByText("Şifreniz Güncellendi");
      expect(bodiesTo(RESET)).toEqual([{ token: TOKEN, password: NEWPASS }]);
    });

    it("aynı görevde iki requestSubmit → tek istek", async () => {
      const pending = pendingResponse();
      fetchMock.mockReturnValue(pending.promise);
      const { form } = await readyForm();

      await act(async () => {
        form.requestSubmit();
        form.requestSubmit();
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      await act(async () => {
        pending.resolve(ok({ success: true }));
      });
    });

    it("hata yanıtından sonra kilit açılır: yeniden deneme aynı token ile yeni istek üretir", async () => {
      fetchMock.mockResolvedValueOnce(fail("Geçici sunucu hatası")).mockResolvedValueOnce(ok({ success: true }));
      const { submit } = await readyForm();

      fireEvent.click(submit);
      await screen.findByText("Geçici sunucu hatası");
      await waitFor(() => expect(submit.disabled).toBe(false));

      fireEvent.click(submit);
      await screen.findByText("Şifreniz Güncellendi");
      expect(bodiesTo(RESET)).toEqual([
        { token: TOKEN, password: NEWPASS },
        { token: TOKEN, password: NEWPASS },
      ]);
    });
  });
});
