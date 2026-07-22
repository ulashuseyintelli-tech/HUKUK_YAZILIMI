import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import PortalLayout from "@/app/portal/layout";

/**
 * CLIENT-P2-U03-I05 — portal layout'un bildirim dropdown'ının, backend'in artık explicit-select
 * ile döndüğü daraltılmış response şekline uyumunu doğrular. Production layout.tsx DEĞİŞTİRİLMEDİ
 * — zaten yalnız approved 7 alanı (kendi `interface Notification`'ı) tüketiyordu. Bu spec yalnız
 * yeni bounded contract'la mevcut davranışın DEĞİŞMEDİĞİNİ kanıtlar.
 *
 * Stable routerMock referansı ZORUNLU (bkz. portal-layout-route-boundary.spec.tsx) — her
 * render'da yeni bir router objesi dönerse token-check effect'i ile birleşip sonsuz render
 * döngüsü oluşur.
 *
 * Bell butonu, unreadCount > 0 iken kendi badge metnini (ör. "3") accessible name'ine dahil
 * eder — bu yüzden role/name sorgusu yerine, header'da yapısal olarak İLK <button> olma
 * özelliğine (bkz. layout.tsx: bell → kullanıcı adı → Çıkış) dayalı bir seçici kullanılır.
 */
const pushMock = vi.fn();
const routerMock = { push: pushMock };

vi.mock("next/navigation", () => ({
  useRouter: () => routerMock,
  usePathname: () => "/portal",
}));

const NOTIF_1 = {
  id: "notif-1",
  type: "MESAJ",
  title: "Yeni Mesaj",
  message: "Av. Test size bir mesaj gönderdi.",
  linkUrl: "/portal/messages",
  isRead: false,
  createdAt: "2026-01-01T10:00:00.000Z",
};

const NOTIF_2 = {
  id: "notif-2",
  type: "BELGE",
  title: "Belgeniz Onaylandı",
  message: '"Vekaletname" başlıklı belgeniz onaylandı.',
  isRead: true,
  createdAt: "2026-01-02T10:00:00.000Z",
};

function buildFetchRouter(opts: { unreadCount: number; list: any; markReadOk?: boolean; markAllOk?: boolean }) {
  return vi.fn((url: string, init?: any) => {
    const method = (init?.method || "GET").toUpperCase();
    if (url.endsWith("/api/portal/notifications/unread-count")) {
      return Promise.resolve({ ok: true, json: async () => ({ count: opts.unreadCount }) });
    }
    if (url.endsWith("/api/portal/notifications/read-all")) {
      return Promise.resolve({ ok: opts.markAllOk !== false, json: async () => ({ success: true }) });
    }
    if (url.includes("/api/portal/notifications/") && url.endsWith("/read")) {
      return Promise.resolve({ ok: opts.markReadOk !== false, json: async () => ({ success: true }) });
    }
    if (url.endsWith("/api/portal/notifications") && method === "GET") {
      return Promise.resolve({ ok: true, json: async () => opts.list });
    }
    return Promise.reject(new Error(`Unhandled fetch: ${method} ${url}`));
  });
}

function clickBell(container: HTMLElement) {
  const buttons = container.querySelectorAll("button");
  fireEvent.click(buttons[0]);
}

describe("PortalLayout notification dropdown — CLIENT-P2-U03-I05 explicit projection", () => {
  beforeEach(() => {
    pushMock.mockClear();
    localStorage.clear();
    localStorage.setItem("portal_token", "test-token");
    localStorage.setItem("portal_user", JSON.stringify({ clientName: "Test Müvekkil" }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("[1] onaylı alanlar render edilir (title, message, createdAt)", async () => {
    vi.stubGlobal("fetch", buildFetchRouter({ unreadCount: 1, list: [NOTIF_1] }));
    const { container } = render(<PortalLayout><div>content</div></PortalLayout>);
    await waitFor(() => expect(container.querySelectorAll("button").length).toBeGreaterThan(0));
    clickBell(container);
    await waitFor(() => expect(screen.getByText("Yeni Mesaj")).toBeTruthy());
    expect(screen.getByText("Av. Test size bir mesaj gönderdi.")).toBeTruthy();
  });

  it("[2] unread count badge doğru sayıyı gösterir", async () => {
    vi.stubGlobal("fetch", buildFetchRouter({ unreadCount: 3, list: [] }));
    render(<PortalLayout><div>content</div></PortalLayout>);
    await waitFor(() => expect(screen.getByText("3")).toBeTruthy());
  });

  it("[3] clientId/caseId/readAt fixture'da olmasa bile dropdown çalışır (sayfa bunlara bağımlı değil)", async () => {
    vi.stubGlobal("fetch", buildFetchRouter({ unreadCount: 1, list: [NOTIF_1, NOTIF_2] }));
    const { container } = render(<PortalLayout><div>content</div></PortalLayout>);
    await waitFor(() => expect(container.querySelectorAll("button").length).toBeGreaterThan(0));
    clickBell(container);
    await waitFor(() => expect(screen.getByText("Yeni Mesaj")).toBeTruthy());
    expect(screen.getByText("Belgeniz Onaylandı")).toBeTruthy();
  });

  it("[4] okunmamış bildirime tıklama mark-as-read çağırır ve linkUrl'e yönlendirir", async () => {
    const fetchMock = buildFetchRouter({ unreadCount: 1, list: [NOTIF_1] });
    vi.stubGlobal("fetch", fetchMock);
    const { container } = render(<PortalLayout><div>content</div></PortalLayout>);
    await waitFor(() => expect(container.querySelectorAll("button").length).toBeGreaterThan(0));
    clickBell(container);
    await waitFor(() => expect(screen.getByText("Yeni Mesaj")).toBeTruthy());

    fireEvent.click(screen.getByText("Yeni Mesaj"));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/api/portal/notifications/notif-1/read"),
        expect.objectContaining({ method: "POST" })
      )
    );
    expect(pushMock).toHaveBeenCalledWith("/portal/messages");
  });

  it("[5] okunmuş bildirime tıklama mark-as-read ÇAĞIRMAZ ama linkUrl varsa yönlendirir", async () => {
    const readWithLink = { ...NOTIF_2, isRead: true, linkUrl: "/portal/documents" };
    const fetchMock = buildFetchRouter({ unreadCount: 0, list: [readWithLink] });
    vi.stubGlobal("fetch", fetchMock);
    const { container } = render(<PortalLayout><div>content</div></PortalLayout>);
    await waitFor(() => expect(container.querySelectorAll("button").length).toBeGreaterThan(0));
    clickBell(container);
    await waitFor(() => expect(screen.getByText("Belgeniz Onaylandı")).toBeTruthy());

    fireEvent.click(screen.getByText("Belgeniz Onaylandı"));

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/portal/documents"));
    expect(
      fetchMock.mock.calls.some(([url]: any) => url.endsWith("/read"))
    ).toBe(false);
  });

  it("[6] 'Tümünü Okundu İşaretle' read-all çağırır", async () => {
    const fetchMock = buildFetchRouter({ unreadCount: 2, list: [NOTIF_1] });
    vi.stubGlobal("fetch", fetchMock);
    const { container } = render(<PortalLayout><div>content</div></PortalLayout>);
    await waitFor(() => expect(screen.getByText("2")).toBeTruthy());
    clickBell(container);
    await waitFor(() => expect(screen.getByText("Yeni Mesaj")).toBeTruthy());

    fireEvent.click(screen.getByText("Tümünü Okundu İşaretle"));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/api/portal/notifications/read-all"),
        expect.objectContaining({ method: "POST" })
      )
    );
  });

  it("[7] mevcut boş-liste davranışı korunur ('Bildirim yok')", async () => {
    vi.stubGlobal("fetch", buildFetchRouter({ unreadCount: 0, list: [] }));
    const { container } = render(<PortalLayout><div>content</div></PortalLayout>);
    await waitFor(() => expect(container.querySelectorAll("button").length).toBeGreaterThan(0));
    clickBell(container);
    await waitFor(() => expect(screen.getByText("Bildirim yok")).toBeTruthy());
  });
});
