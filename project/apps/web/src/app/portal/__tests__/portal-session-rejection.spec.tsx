import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import PortalLayout from "@/app/portal/layout";
import PortalMessagesPage from "@/app/portal/messages/page";
import PortalDocumentsPage from "@/app/portal/documents/page";
import { PORTAL_SESSION_REJECTED_EVENT } from "@/lib/portal-session";

/**
 * PORTAL OTURUM REDDİ — kapatılmış / geçersiz oturumda giriş sayfasına yönlendirme.
 *
 * Gözlem (canlı kabul koşumları): kapatılmış oturumla açılan ya da yenilenen portal sayfası giriş
 * sayfasına dönmek yerine hata metni gösteriyordu ("Geçersiz token", "Mesajlar yüklenemedi").
 *
 * KAPSAM (bu yama): portal çerçevesi (her özel sayfanın açılışında), Belgelerim, Mesajlar.
 * KAPSAM DIŞI: dosya ayrıntısı, vekâletler, mali beyanlar, profil — o sayfaların kendi okumaları
 * değişmedi; yönlendirmeyi çerçevenin isteği tetikler.
 *
 * Ayrım: yalnız 401 oturum reddidir. Ağ hatası / 5xx / 403 / bozuk gövde oturumu KORUR.
 */
const pushMock = vi.fn();
const routerMock = { push: pushMock };
let currentPathname = "/portal/messages";

vi.mock("next/navigation", () => ({
  useRouter: () => routerMock,
  usePathname: () => currentPathname,
}));

type Reply = { status: number; body?: unknown } | Error | Promise<{ status: number; body?: unknown }>;
type Routes = {
  unreadCount?: () => Reply;
  notifications?: () => Reply;
  markOne?: () => Reply;
  markAll?: () => Reply;
  messages?: () => Reply;
  markRead?: () => Reply;
  send?: () => Reply;
  documents?: () => Reply;
  download?: () => Reply;
  del?: () => Reply;
  upload?: () => Reply;
};

const DOCS = [
  { id: "d1", type: "DIGER", title: "Kira sözleşmesi", fileName: "kira.pdf", fileSize: 1024, status: "PENDING", createdAt: "2026-08-01T10:00:00.000Z" },
];
const MSGS = [
  { id: "m1", content: "İlk mesaj", senderType: "OFFICE", senderName: "Av. Test", isRead: true, createdAt: "2026-01-01T10:00:00.000Z" },
];

const fetchMock = vi.fn();
const rejectedEvents = vi.fn();

function toResponse(r: { status: number; body?: unknown }) {
  return {
    ok: r.status >= 200 && r.status < 300,
    status: r.status,
    json: async () => r.body ?? {},
    blob: async () => new Blob(["%PDF-1.4 gercek"], { type: "application/pdf" }),
  };
}

function primeFetch(routes: Routes) {
  fetchMock.mockImplementation((url: string, init?: RequestInit) => {
    const u = String(url);
    const method = (init?.method || "GET").toUpperCase();
    let pick: (() => Reply) | undefined;
    if (u.endsWith("/api/portal/notifications/unread-count")) pick = routes.unreadCount ?? (() => ({ status: 200, body: { count: 0 } }));
    else if (u.endsWith("/api/portal/notifications/read-all")) pick = routes.markAll ?? (() => ({ status: 200, body: { success: true } }));
    else if (u.includes("/api/portal/notifications/") && u.endsWith("/read")) pick = routes.markOne ?? (() => ({ status: 200, body: { success: true } }));
    else if (u.endsWith("/api/portal/notifications")) pick = routes.notifications ?? (() => ({ status: 200, body: [] }));
    else if (u.endsWith("/api/portal/messages/mark-read")) pick = routes.markRead ?? (() => ({ status: 200, body: { success: true } }));
    else if (u.endsWith("/api/portal/messages") && method === "POST") pick = routes.send ?? (() => ({ status: 201, body: {} }));
    else if (u.endsWith("/api/portal/messages")) pick = routes.messages ?? (() => ({ status: 200, body: MSGS }));
    else if (u.endsWith("/api/portal/documents/upload")) pick = routes.upload ?? (() => ({ status: 201, body: {} }));
    else if (u.includes("/download")) pick = routes.download ?? (() => ({ status: 200 }));
    else if (u.includes("/api/portal/documents/") && method === "DELETE") pick = routes.del ?? (() => ({ status: 200, body: {} }));
    else if (u.endsWith("/api/portal/documents")) pick = routes.documents ?? (() => ({ status: 200, body: DOCS }));
    if (!pick) return Promise.reject(new Error(`beklenmeyen istek: ${method} ${u}`));
    const reply = pick();
    if (reply instanceof Error) return Promise.reject(reply);
    return Promise.resolve(reply).then(toResponse);
  });
}

const callsTo = (suffix: string, method = "GET") =>
  fetchMock.mock.calls.filter(([u, init]) => String(u).endsWith(suffix) && ((init as RequestInit | undefined)?.method || "GET").toUpperCase() === method).length;

/** Verilen uca giden isteklerin Authorization başlıkları (sırayla). */
const authHeadersTo = (suffix: string) =>
  fetchMock.mock.calls
    .filter(([u]) => String(u).endsWith(suffix))
    .map(([, init]) => ((init as RequestInit | undefined)?.headers as Record<string, string> | undefined)?.Authorization);

const NOTIFS = [
  { id: "n1", type: "MESAJ", title: "Yeni Mesaj", message: "Bir mesajınız var.", isRead: false, createdAt: "2026-01-01T10:00:00.000Z" },
];

const openSession = (token = "T1") => {
  localStorage.setItem("portal_token", token);
  localStorage.setItem("portal_user", JSON.stringify({ clientName: "Test Müvekkil" }));
};

/** Elle çözülen yanıt: "istek gitti ama yanıt henüz dönmedi" durumunu kurar. */
function deferred() {
  let resolve!: (r: { status: number; body?: unknown }) => void;
  const promise = new Promise<{ status: number; body?: unknown }>((r) => (resolve = r));
  return { promise, resolve };
}

beforeEach(() => {
  pushMock.mockClear();
  fetchMock.mockReset();
  rejectedEvents.mockClear();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("confirm", vi.fn(() => true));
  localStorage.clear();
  openSession("T1");
  currentPathname = "/portal/messages";
  Element.prototype.scrollIntoView = vi.fn();
  window.addEventListener(PORTAL_SESSION_REJECTED_EVENT, rejectedEvents);
});

afterEach(() => {
  window.removeEventListener(PORTAL_SESSION_REJECTED_EVENT, rejectedEvents);
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  localStorage.clear();
});

const sessionKept = (token = "T1") => {
  expect(localStorage.getItem("portal_token")).toBe(token);
  expect(localStorage.getItem("portal_user")).not.toBeNull();
  expect(rejectedEvents).not.toHaveBeenCalled();
  expect(pushMock).not.toHaveBeenCalled();
};

describe("portal çerçevesi — oturum reddi", () => {
  it("[L1] bildirim sayacı 401 → işaret + kullanıcı bilgisi silinir, girişe TEK yönlendirme, sayfa içeriği gizlenir", async () => {
    primeFetch({ unreadCount: () => ({ status: 401, body: { message: "Geçersiz token" } }) });
    render(<PortalLayout><div>SAYFA İÇERİĞİ</div></PortalLayout>);
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/portal/login"));
    expect(pushMock).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem("portal_token")).toBeNull();
    expect(localStorage.getItem("portal_user")).toBeNull();
    expect(screen.queryByText("SAYFA İÇERİĞİ")).toBeNull();
    expect(screen.queryByText(/Bildirimler okunamadı/)).toBeNull();
  });

  it.each([
    ["500", () => ({ status: 500, body: { message: "iç hata" } }) as Reply],
    ["403", () => ({ status: 403, body: { message: "yetki yok" } }) as Reply],
    ["ağ hatası", () => new TypeError("Failed to fetch") as Reply],
    ["bozuk gövde", () => ({ status: 200, body: { count: "üç" } }) as Reply],
  ])("[L2] bildirim sayacı %s → oturum KORUNUR, yönlendirme YOK, sayfa içeriği görünür", async (_ad, reply) => {
    primeFetch({ unreadCount: reply });
    render(<PortalLayout><div>SAYFA İÇERİĞİ</div></PortalLayout>);
    await waitFor(() => expect(callsTo("/api/portal/notifications/unread-count")).toBe(1));
    await screen.findByText("SAYFA İÇERİĞİ");
    // yanıtın işlenmesi için bir tur bekle
    await act(async () => { await Promise.resolve(); });
    sessionKept();
    expect(screen.getByText("SAYFA İÇERİĞİ")).toBeTruthy();
  });

  it("[L3] bildirim listesi 401 (zile tıklama) → girişe TEK yönlendirme; hata bandı basılmaz", async () => {
    primeFetch({ notifications: () => ({ status: 401, body: { message: "Geçersiz token" } }) });
    const { container } = render(<PortalLayout><div>SAYFA İÇERİĞİ</div></PortalLayout>);
    await screen.findByText("SAYFA İÇERİĞİ");
    fireEvent.click(container.querySelectorAll("button")[0]);
    await waitFor(() => expect(pushMock).toHaveBeenCalledTimes(1));
    expect(localStorage.getItem("portal_token")).toBeNull();
    expect(screen.queryByText(/Bildirimler yüklenemedi/)).toBeNull();
  });

  it("[L4] ret sonrası 30 saniyelik bildirim yoklaması DURUR: yeni istek gönderilmez", async () => {
    vi.useFakeTimers();
    primeFetch({ unreadCount: () => ({ status: 401 }) });
    render(<PortalLayout><div>SAYFA İÇERİĞİ</div></PortalLayout>);
    await vi.waitFor(() => expect(pushMock).toHaveBeenCalledTimes(1));
    const before = fetchMock.mock.calls.length;
    await vi.advanceTimersByTimeAsync(120000);
    expect(fetchMock.mock.calls.length).toBe(before);
    expect(pushMock).toHaveBeenCalledTimes(1);
  });

  it("[L5] oturum değiştiyse (T1 → T2) yoklama YENİ işaretle sürer; eski işaretle istek GÖNDERİLMEZ", async () => {
    vi.useFakeTimers();
    primeFetch({});
    render(<PortalLayout><div>SAYFA İÇERİĞİ</div></PortalLayout>);
    await vi.waitFor(() => expect(callsTo("/api/portal/notifications/unread-count")).toBe(1));
    openSession("T2");
    await vi.advanceTimersByTimeAsync(90000);
    // zamanlayıcı gerçekten ateşledi (3 × 30 sn) ve her istek YENİ oturumla gitti
    expect(authHeadersTo("/api/portal/notifications/unread-count")).toEqual(["Bearer T1", "Bearer T2", "Bearer T2", "Bearer T2"]);
    sessionKept("T2");
  });

  it("[L7] BAŞKA SEKMEDE oturum kapandı (işaret silindi) → bu sekme de girişe yönlenir, içerik gizlenir", async () => {
    primeFetch({});
    render(<PortalLayout><div>SAYFA İÇERİĞİ</div></PortalLayout>);
    await screen.findByText("SAYFA İÇERİĞİ");
    localStorage.removeItem("portal_token");
    act(() => { window.dispatchEvent(new StorageEvent("storage", { key: "portal_token", oldValue: "T1", newValue: null })); });
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/portal/login"));
    // öteki sekme ardından kullanıcı bilgisini de sildi / depolamayı tümden temizledi: yönlendirme yine TEK
    localStorage.removeItem("portal_user");
    act(() => {
      window.dispatchEvent(new StorageEvent("storage", { key: "portal_user", oldValue: "{}", newValue: null }));
      window.dispatchEvent(new StorageEvent("storage", { key: null, oldValue: null, newValue: null }));
    });
    await act(async () => { await Promise.resolve(); });
    expect(pushMock).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("SAYFA İÇERİĞİ")).toBeNull();
  });

  it("[L7c] başka sekme depolamayı TÜMDEN temizledi (anahtar yok) → bu sekme girişe yönlenir", async () => {
    primeFetch({});
    render(<PortalLayout><div>SAYFA İÇERİĞİ</div></PortalLayout>);
    await screen.findByText("SAYFA İÇERİĞİ");
    localStorage.clear();
    act(() => { window.dispatchEvent(new StorageEvent("storage", { key: null, oldValue: null, newValue: null })); });
    await waitFor(() => expect(pushMock).toHaveBeenCalledTimes(1));
    expect(pushMock).toHaveBeenCalledWith("/portal/login");
  });

  it("[L7d] işaret YERİNDEYKEN yalnız kullanıcı bilgisi anahtarı silindi → yönlendirme YOK (oturum sürüyor)", async () => {
    primeFetch({});
    render(<PortalLayout><div>SAYFA İÇERİĞİ</div></PortalLayout>);
    await screen.findByText("SAYFA İÇERİĞİ");
    localStorage.removeItem("portal_user");
    act(() => { window.dispatchEvent(new StorageEvent("storage", { key: "portal_user", oldValue: "{}", newValue: null })); });
    await act(async () => { await Promise.resolve(); });
    expect(pushMock).not.toHaveBeenCalled();
    expect(localStorage.getItem("portal_token")).toBe("T1");
  });

  it("[L7b] başka sekmede YENİ oturum açıldı (işaret değişti) ya da ilgisiz anahtar değişti → yönlendirme YOK", async () => {
    primeFetch({});
    render(<PortalLayout><div>SAYFA İÇERİĞİ</div></PortalLayout>);
    await screen.findByText("SAYFA İÇERİĞİ");
    openSession("T2");
    act(() => {
      window.dispatchEvent(new StorageEvent("storage", { key: "portal_token", oldValue: "T1", newValue: "T2" }));
      window.dispatchEvent(new StorageEvent("storage", { key: "baska-anahtar", oldValue: "x", newValue: null }));
    });
    await act(async () => { await Promise.resolve(); });
    expect(pushMock).not.toHaveBeenCalled();
    expect(screen.getByText("SAYFA İÇERİĞİ")).toBeTruthy();
  });

  it("[L8] tekil okundu 401 → girişe TEK yönlendirme; hata bandı basılmaz", async () => {
    primeFetch({ notifications: () => ({ status: 200, body: NOTIFS }), markOne: () => ({ status: 401 }) });
    const { container } = render(<PortalLayout><div>SAYFA İÇERİĞİ</div></PortalLayout>);
    await screen.findByText("SAYFA İÇERİĞİ");
    fireEvent.click(container.querySelectorAll("button")[0]);
    fireEvent.click(await screen.findByText("Yeni Mesaj"));
    await waitFor(() => expect(pushMock).toHaveBeenCalledTimes(1));
    expect(localStorage.getItem("portal_token")).toBeNull();
    expect(screen.queryByText(/işaretlenemedi/)).toBeNull();
  });

  it("[L9] tümünü okundu 401 → girişe TEK yönlendirme; hata bandı basılmaz", async () => {
    primeFetch({ unreadCount: () => ({ status: 200, body: { count: 1 } }), notifications: () => ({ status: 200, body: NOTIFS }), markAll: () => ({ status: 401 }) });
    const { container } = render(<PortalLayout><div>SAYFA İÇERİĞİ</div></PortalLayout>);
    await screen.findByText("SAYFA İÇERİĞİ");
    fireEvent.click(container.querySelectorAll("button")[0]);
    fireEvent.click(await screen.findByText("Tümünü Okundu İşaretle"));
    await waitFor(() => expect(pushMock).toHaveBeenCalledTimes(1));
    expect(localStorage.getItem("portal_token")).toBeNull();
    expect(screen.queryByText(/işaretlenemedi/)).toBeNull();
  });

  it("[L10] bildirim listesi — GECİKMİŞ RET: liste geçerli oturumla BİR kez yeniden okunur", async () => {
    const pending = deferred();
    let n = 0;
    primeFetch({ notifications: () => (++n === 1 ? pending.promise : { status: 200, body: NOTIFS }) });
    const { container } = render(<PortalLayout><div>SAYFA İÇERİĞİ</div></PortalLayout>);
    await screen.findByText("SAYFA İÇERİĞİ");
    fireEvent.click(container.querySelectorAll("button")[0]);
    await waitFor(() => expect(callsTo("/api/portal/notifications")).toBe(1));
    openSession("T2");
    await act(async () => { pending.resolve({ status: 401 }); await pending.promise; });
    await screen.findByText("Yeni Mesaj");
    expect(authHeadersTo("/api/portal/notifications")).toEqual(["Bearer T1", "Bearer T2"]);
    sessionKept("T2");
  });

  it("[L6] yeniden girişten sonra (yeni işaret + yol değişimi) sayfa içeriği yeniden görünür", async () => {
    primeFetch({ unreadCount: () => ({ status: 401 }) });
    const view = render(<PortalLayout><div>SAYFA İÇERİĞİ</div></PortalLayout>);
    await waitFor(() => expect(pushMock).toHaveBeenCalledTimes(1));
    expect(screen.queryByText("SAYFA İÇERİĞİ")).toBeNull();

    primeFetch({});
    openSession("T2");
    currentPathname = "/portal";
    view.rerender(<PortalLayout><div>SAYFA İÇERİĞİ</div></PortalLayout>);
    await screen.findByText("SAYFA İÇERİĞİ");
    expect(pushMock).toHaveBeenCalledTimes(1);
  });
});

describe("Mesajlar — oturum reddi", () => {
  it("[M1] liste 401 → oturum silinir, olay BİR kez; 'Mesajlar yüklenemedi' ve 'Henüz mesaj yok' GÖSTERİLMEZ", async () => {
    primeFetch({ messages: () => ({ status: 401, body: { message: "Geçersiz token" } }) });
    render(<PortalMessagesPage />);
    await waitFor(() => expect(rejectedEvents).toHaveBeenCalledTimes(1));
    expect(localStorage.getItem("portal_token")).toBeNull();
    expect(localStorage.getItem("portal_user")).toBeNull();
    expect(screen.queryByText(/Mesajlar yüklenemedi/)).toBeNull();
    expect(screen.queryByText("Henüz mesaj yok")).toBeNull();
    expect(screen.queryByText("Geçersiz token")).toBeNull();
  });

  it.each([
    ["500", () => ({ status: 500, body: {} }) as Reply],
    ["403", () => ({ status: 403, body: {} }) as Reply],
    ["ağ hatası", () => new TypeError("Failed to fetch") as Reply],
  ])("[M2] liste %s → oturum KORUNUR; mevcut hata davranışı (hata metni görünür)", async (_ad, reply) => {
    primeFetch({ messages: reply });
    render(<PortalMessagesPage />);
    await waitFor(() => expect(document.querySelector(".text-red-600")).not.toBeNull());
    sessionKept();
  });

  it("[M3] ret sonrası 10 saniyelik yoklama DURUR: yeni istek ve ikinci olay yok", async () => {
    vi.useFakeTimers();
    primeFetch({ messages: () => ({ status: 401 }), markRead: () => ({ status: 401 }) });
    render(<PortalMessagesPage />);
    await vi.waitFor(() => expect(rejectedEvents).toHaveBeenCalledTimes(1));
    const before = fetchMock.mock.calls.length;
    await vi.advanceTimersByTimeAsync(60000);
    expect(fetchMock.mock.calls.length).toBe(before);
    expect(rejectedEvents).toHaveBeenCalledTimes(1);
  });

  it("[M3b] reddedilmiş sayfa örneği, tarayıcıya yeni işaret konsa bile yoklamayı SÜRDÜRMEZ (zamanlayıcı durduruldu)", async () => {
    vi.useFakeTimers();
    primeFetch({ messages: () => ({ status: 401 }), markRead: () => ({ status: 401 }) });
    render(<PortalMessagesPage />);
    await vi.waitFor(() => expect(rejectedEvents).toHaveBeenCalledTimes(1));
    const before = fetchMock.mock.calls.length;
    openSession("T2");
    await vi.advanceTimersByTimeAsync(60000);
    expect(fetchMock.mock.calls.length).toBe(before);
    expect(localStorage.getItem("portal_token")).toBe("T2");
  });

  it("[M4] GECİKMİŞ RET: istek T1 ile gitti, yanıt dönmeden T2 açıldı → T2 TEMİZLENMEZ, olay / hata metni yok", async () => {
    const pending = deferred();
    let n = 0;
    primeFetch({ messages: () => (++n === 1 ? pending.promise : { status: 200, body: MSGS }) });
    render(<PortalMessagesPage />);
    await waitFor(() => expect(callsTo("/api/portal/messages")).toBe(1));
    openSession("T2");
    await act(async () => { pending.resolve({ status: 401, body: { message: "Geçersiz token" } }); await pending.promise; });
    // liste geçerli oturumla BİR kez yeniden okunur — "Henüz mesaj yok" sahte boş durumu görünmez
    await screen.findByText("İlk mesaj");
    expect(authHeadersTo("/api/portal/messages")).toEqual(["Bearer T1", "Bearer T2"]);
    sessionKept("T2");
    expect(screen.queryByText(/Mesajlar yüklenemedi/)).toBeNull();
    expect(screen.queryByText("Henüz mesaj yok")).toBeNull();
  });

  it("[M4b] GECİKMİŞ RET, yeni oturumun okuması da 401 → o oturum reddedilir (olay BİR kez); sonsuz yeniden deneme yok", async () => {
    const pending = deferred();
    let n = 0;
    primeFetch({ messages: () => (++n === 1 ? pending.promise : { status: 401 }) });
    render(<PortalMessagesPage />);
    await waitFor(() => expect(callsTo("/api/portal/messages")).toBe(1));
    openSession("T2");
    await act(async () => { pending.resolve({ status: 401 }); await pending.promise; });
    await waitFor(() => expect(rejectedEvents).toHaveBeenCalledTimes(1));
    expect(callsTo("/api/portal/messages")).toBe(2);
    expect(localStorage.getItem("portal_token")).toBeNull();
  });

  it("[M5] gönderme 401 → oturum reddi: olay BİR kez; 'Mesaj gönderilemedi' basılmaz", async () => {
    primeFetch({ send: () => ({ status: 401 }) });
    render(<PortalMessagesPage />);
    await screen.findByText("İlk mesaj");
    fireEvent.change(screen.getByPlaceholderText("Mesajınızı yazın..."), { target: { value: "Merhaba" } });
    fireEvent.click(screen.getByText("Gönder"));
    await waitFor(() => expect(rejectedEvents).toHaveBeenCalledTimes(1));
    expect(screen.queryByText(/Mesaj gönderilemedi/)).toBeNull();
  });

  it("[M6] gönderme — GECİKMİŞ RET: mesaj GÖNDERİLMEDİ, hata GÖRÜNÜR kalır; yeni oturum korunur", async () => {
    const pending = deferred();
    primeFetch({ send: () => pending.promise });
    render(<PortalMessagesPage />);
    await screen.findByText("İlk mesaj");
    fireEvent.change(screen.getByPlaceholderText("Mesajınızı yazın..."), { target: { value: "Merhaba" } });
    fireEvent.click(screen.getByText("Gönder"));
    await waitFor(() => expect(callsTo("/api/portal/messages", "POST")).toBe(1));
    openSession("T2");
    await act(async () => { pending.resolve({ status: 401 }); await pending.promise; });
    await screen.findByText(/Mesaj gönderilemedi/);
    sessionKept("T2");
  });
});

describe("Belgelerim — oturum reddi", () => {
  it("[D1] liste 401 → oturum silinir, olay BİR kez; sunucunun ret metni ve boş liste GÖSTERİLMEZ", async () => {
    primeFetch({ documents: () => ({ status: 401, body: { message: "Geçersiz token" } }) });
    render(<PortalDocumentsPage />);
    await waitFor(() => expect(rejectedEvents).toHaveBeenCalledTimes(1));
    expect(localStorage.getItem("portal_token")).toBeNull();
    expect(screen.queryByText("Geçersiz token")).toBeNull();
    expect(screen.queryByText("Henüz belge yüklemediniz")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it.each([
    ["500", () => ({ status: 500, body: { message: "iç hata" } }) as Reply],
    ["403", () => ({ status: 403, body: { message: "yetki yok" } }) as Reply],
    ["ağ hatası", () => new TypeError("Failed to fetch") as Reply],
  ])("[D2] liste %s → oturum KORUNUR; mevcut hata davranışı (hata görünür)", async (_ad, reply) => {
    primeFetch({ documents: reply });
    render(<PortalDocumentsPage />);
    await screen.findByRole("alert");
    sessionKept();
  });

  it("[D3] GECİKMİŞ RET (liste): T2 TEMİZLENMEZ, olay / hata bandı yok", async () => {
    const pending = deferred();
    const second = deferred();
    let n = 0;
    primeFetch({ documents: () => (++n === 1 ? pending.promise : second.promise) });
    render(<PortalDocumentsPage />);
    await waitFor(() => expect(callsTo("/api/portal/documents")).toBe(1));
    openSession("T2");
    await act(async () => { pending.resolve({ status: 401, body: { message: "Geçersiz token" } }); await pending.promise; });
    // liste geçerli oturumla BİR kez yeniden okunur; yeniden okuma SÜRERKEN "Henüz belge yüklemediniz"
    // sahte boş durumu GÖRÜNMEZ (yükleme göstergesi kalır)
    await waitFor(() => expect(callsTo("/api/portal/documents")).toBe(2));
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(screen.queryByText("Henüz belge yüklemediniz")).toBeNull();
    expect(document.querySelector(".animate-spin")).not.toBeNull();
    await act(async () => { second.resolve({ status: 200, body: DOCS }); await second.promise; });
    await screen.findByText("Kira sözleşmesi");
    expect(authHeadersTo("/api/portal/documents")).toEqual(["Bearer T1", "Bearer T2"]);
    sessionKept("T2");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByText("Geçersiz token")).toBeNull();
    expect(screen.queryByText("Henüz belge yüklemediniz")).toBeNull();
  });

  it("[D3c] GECİKMİŞ RET, yeni oturumun okuması da 401 → o oturum reddedilir (olay BİR kez); sonsuz yeniden deneme yok", async () => {
    const pending = deferred();
    let n = 0;
    primeFetch({ documents: () => (++n === 1 ? pending.promise : { status: 401 }) });
    render(<PortalDocumentsPage />);
    await waitFor(() => expect(callsTo("/api/portal/documents")).toBe(1));
    openSession("T2");
    await act(async () => { pending.resolve({ status: 401 }); await pending.promise; });
    await waitFor(() => expect(rejectedEvents).toHaveBeenCalledTimes(1));
    expect(callsTo("/api/portal/documents")).toBe(2);
    expect(localStorage.getItem("portal_token")).toBeNull();
    expect(screen.queryByText("Henüz belge yüklemediniz")).toBeNull();
  });

  it("[D3b] GECİKMİŞ RET, geçerli oturum YOK (başka istek oturumu temizlemiş) → yeniden okuma yok, hata bandı yok", async () => {
    const pending = deferred();
    primeFetch({ documents: () => pending.promise });
    render(<PortalDocumentsPage />);
    await waitFor(() => expect(callsTo("/api/portal/documents")).toBe(1));
    localStorage.removeItem("portal_token");
    await act(async () => { pending.resolve({ status: 401, body: { message: "Geçersiz token" } }); await pending.promise; });
    await act(async () => { await Promise.resolve(); });
    expect(callsTo("/api/portal/documents")).toBe(1);
    expect(rejectedEvents).not.toHaveBeenCalled();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByText("Geçersiz token")).toBeNull();
  });

  it("[D4] indirme 401 → oturum reddi: olay BİR kez; hata bandı basılmaz", async () => {
    primeFetch({ download: () => ({ status: 401, body: { message: "Geçersiz token" } }) });
    render(<PortalDocumentsPage />);
    fireEvent.click(await screen.findByTitle("İndir"));
    await waitFor(() => expect(rejectedEvents).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByText("Geçersiz token")).toBeNull();
  });

  it("[D5] silme 401 → oturum reddi: olay BİR kez; 'Belge silinemedi' basılmaz", async () => {
    primeFetch({ del: () => ({ status: 401, body: { message: "Geçersiz token" } }) });
    render(<PortalDocumentsPage />);
    fireEvent.click(await screen.findByTitle("Sil"));
    await waitFor(() => expect(rejectedEvents).toHaveBeenCalledTimes(1));
    await act(async () => { await Promise.resolve(); });
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByText(/Belge silinemedi/)).toBeNull();
  });

  it("[D6] yükleme 401 → oturum reddi: olay BİR kez; 'Belge yüklenemedi' basılmaz", async () => {
    primeFetch({ upload: () => ({ status: 401, body: { message: "Geçersiz token" } }) });
    render(<PortalDocumentsPage />);
    await screen.findByText("Kira sözleşmesi");
    fireEvent.click(screen.getByRole("button", { name: /Belge Yükle/i }));
    fireEvent.change(await screen.findByPlaceholderText("Belge başlığı"), { target: { value: "Kimlik" } });
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [new File(["x"], "kimlik.pdf", { type: "application/pdf" })] } });
    fireEvent.click(screen.getByRole("button", { name: "Yükle" }));
    await waitFor(() => expect(rejectedEvents).toHaveBeenCalledTimes(1));
    await act(async () => { await Promise.resolve(); });
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByText(/Belge yüklenemedi/)).toBeNull();
  });

  it("[D7] indirme 403 → oturum KORUNUR; mevcut hata davranışı (hata görünür)", async () => {
    primeFetch({ download: () => ({ status: 403, body: {} }) });
    render(<PortalDocumentsPage />);
    fireEvent.click(await screen.findByTitle("İndir"));
    await screen.findByRole("alert");
    sessionKept();
  });
});

describe("çerçeve + sayfa birlikte — eşzamanlı retler", () => {
  it("[C1] bildirim sayacı + mesaj listesi + okundu çağrısı aynı anda 401 → girişe TAM BİR yönlendirme", async () => {
    primeFetch({
      unreadCount: () => ({ status: 401 }),
      messages: () => ({ status: 401 }),
      markRead: () => ({ status: 401 }),
    });
    render(<PortalLayout><PortalMessagesPage /></PortalLayout>);
    await waitFor(() => expect(pushMock).toHaveBeenCalledTimes(1));
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(pushMock).toHaveBeenCalledTimes(1);
    expect(pushMock).toHaveBeenCalledWith("/portal/login");
    expect(rejectedEvents).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem("portal_token")).toBeNull();
    expect(fetchMock.mock.calls.length).toBe(3);
    expect(screen.queryByText(/Mesajlar yüklenemedi/)).toBeNull();
  });

  it("[C2] sayfanın reddi çerçeveyi yönlendirir (çerçevenin kendi isteği başarılıyken de)", async () => {
    currentPathname = "/portal/documents";
    primeFetch({ documents: () => ({ status: 401, body: { message: "Geçersiz token" } }) });
    render(<PortalLayout><PortalDocumentsPage /></PortalLayout>);
    await waitFor(() => expect(pushMock).toHaveBeenCalledTimes(1));
    expect(screen.queryByText("Geçersiz token")).toBeNull();
    expect(screen.queryByText("Belgelerim")).toBeNull();
  });
});
