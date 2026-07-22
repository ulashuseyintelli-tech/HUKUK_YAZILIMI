import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import PortalMessagesPage from "@/app/portal/messages/page";

/**
 * CLIENT-P2-U03-I03 — portal messages sayfasının, backend'in artık explicit-select ile
 * döndüğü daraltılmış response şekline uyumunu doğrular: onaylı alanlar render edilir,
 * senderId response'ta bulunsa bile (legacy/beklenmedik alan) hiç render edilmez veya
 * kullanılmaz, mevcut send/mark-read/polling/loading/empty davranışı DEĞİŞMEDİ.
 */
const CLIENT_MSG = {
  id: "msg-1",
  content: "Merhaba, dosyam hakkında bilgi alabilir miyim?",
  senderType: "CLIENT",
  senderName: "Müvekkil",
  isRead: false,
  createdAt: "2026-01-01T10:00:00.000Z",
};

const OFFICE_MSG = {
  id: "msg-2",
  content: "Elbette, size yardımcı olalım.",
  senderType: "OFFICE",
  senderName: "Av. Test Avukat",
  isRead: true,
  createdAt: "2026-01-01T10:05:00.000Z",
};

function buildFetchRouter(opts: {
  list: any;
  listAfterSend?: any;
  sendResponse?: any;
}) {
  let listCallCount = 0;
  return vi.fn((url: string, init?: any) => {
    const method = (init?.method || "GET").toUpperCase();
    if (url.endsWith("/api/portal/messages/mark-read")) {
      return Promise.resolve({ ok: true, json: async () => ({ success: true }) });
    }
    if (url.endsWith("/api/portal/messages")) {
      if (method === "GET") {
        listCallCount++;
        const body = listCallCount === 1 ? opts.list : (opts.listAfterSend ?? opts.list);
        return Promise.resolve({ ok: true, json: async () => body });
      }
      if (method === "POST") {
        return Promise.resolve({ ok: true, json: async () => opts.sendResponse ?? {} });
      }
    }
    return Promise.reject(new Error(`Unhandled fetch: ${method} ${url}`));
  });
}

describe("Portal messages page — CLIENT-P2-U03-I03 explicit projection", () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem("portal_token", "test-token");
    Element.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("[1] CLIENT mesajı render edilir", async () => {
    vi.stubGlobal("fetch", buildFetchRouter({ list: [CLIENT_MSG] }));
    render(<PortalMessagesPage />);
    await waitFor(() => expect(screen.getByText(CLIENT_MSG.content)).toBeTruthy());
  });

  it("[2] OFFICE mesajı render edilir", async () => {
    vi.stubGlobal("fetch", buildFetchRouter({ list: [OFFICE_MSG] }));
    render(<PortalMessagesPage />);
    await waitFor(() => expect(screen.getByText(OFFICE_MSG.content)).toBeTruthy());
  });

  it("[3] senderName render edilir", async () => {
    vi.stubGlobal("fetch", buildFetchRouter({ list: [CLIENT_MSG, OFFICE_MSG] }));
    render(<PortalMessagesPage />);
    await waitFor(() => expect(screen.getByText("Müvekkil")).toBeTruthy());
    expect(screen.getByText("Av. Test Avukat")).toBeTruthy();
  });

  it("[4] content render edilir", async () => {
    vi.stubGlobal("fetch", buildFetchRouter({ list: [CLIENT_MSG] }));
    render(<PortalMessagesPage />);
    await waitFor(() => expect(screen.getByText(CLIENT_MSG.content)).toBeTruthy());
  });

  it("[5] timestamp render edilir", async () => {
    vi.stubGlobal("fetch", buildFetchRouter({ list: [CLIENT_MSG] }));
    render(<PortalMessagesPage />);
    await waitFor(() => expect(screen.getByText(CLIENT_MSG.content)).toBeTruthy());
    const expectedTimestamp = new Date(CLIENT_MSG.createdAt).toLocaleString("tr-TR");
    expect(screen.getByText(expectedTimestamp)).toBeTruthy();
  });

  it("[6] CLIENT/OFFICE görsel yönelimi korunur", async () => {
    vi.stubGlobal("fetch", buildFetchRouter({ list: [CLIENT_MSG, OFFICE_MSG] }));
    render(<PortalMessagesPage />);
    await waitFor(() => expect(screen.getByText(CLIENT_MSG.content)).toBeTruthy());

    const clientBubble = screen.getByText(CLIENT_MSG.content).parentElement;
    const clientOuter = clientBubble?.parentElement;
    expect(clientOuter?.className).toContain("justify-end");
    expect(clientBubble?.className).toContain("bg-blue-600");

    const officeBubble = screen.getByText(OFFICE_MSG.content).parentElement;
    const officeOuter = officeBubble?.parentElement;
    expect(officeOuter?.className).toContain("justify-start");
    expect(officeBubble?.className).toContain("bg-gray-100");
  });

  it("[7] senderId fixture'da olsa bile hiçbir yerde render edilmez (legacy alan)", async () => {
    const legacyMsg = { ...CLIENT_MSG, senderId: "leaked-internal-actor-id" };
    vi.stubGlobal("fetch", buildFetchRouter({ list: [legacyMsg] }));
    render(<PortalMessagesPage />);
    await waitFor(() => expect(screen.getByText(CLIENT_MSG.content)).toBeTruthy());
    expect(screen.queryByText(/leaked-internal-actor-id/)).toBeNull();
  });

  it("[8] sayfa clientId/tenantId/caseId'e bağımlı değildir (fixture'da hiç yok, çökme olmaz)", async () => {
    vi.stubGlobal("fetch", buildFetchRouter({ list: [CLIENT_MSG, OFFICE_MSG] }));
    render(<PortalMessagesPage />);
    await waitFor(() => expect(screen.getByText(CLIENT_MSG.content)).toBeTruthy());
    expect(screen.getByText(OFFICE_MSG.content)).toBeTruthy();
  });

  it("[9] mesaj gönderme başarılı olunca input temizlenir", async () => {
    const fetchMock = buildFetchRouter({ list: [] });
    vi.stubGlobal("fetch", fetchMock);
    render(<PortalMessagesPage />);
    await waitFor(() => expect(screen.getByText("Henüz mesaj yok")).toBeTruthy());

    const textarea = screen.getByPlaceholderText("Mesajınızı yazın...") as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "Yeni mesajım" } });
    expect(textarea.value).toBe("Yeni mesajım");

    fireEvent.click(screen.getByText("Gönder"));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/api/portal/messages"),
        expect.objectContaining({ method: "POST" })
      )
    );
    await waitFor(() => expect(textarea.value).toBe(""));
  });

  it("[10] mesaj gönderme başarılı olunca liste yenilenir", async () => {
    const fetchMock = buildFetchRouter({ list: [CLIENT_MSG], listAfterSend: [CLIENT_MSG, OFFICE_MSG] });
    vi.stubGlobal("fetch", fetchMock);
    render(<PortalMessagesPage />);
    await waitFor(() => expect(screen.getByText(CLIENT_MSG.content)).toBeTruthy());

    const textarea = screen.getByPlaceholderText("Mesajınızı yazın...");
    fireEvent.change(textarea, { target: { value: "Yeni mesajım" } });
    fireEvent.click(screen.getByText("Gönder"));

    await waitFor(() => expect(screen.getByText(OFFICE_MSG.content)).toBeTruthy());
  });

  it("[11] Enter gönderir; Shift+Enter göndermez", async () => {
    const fetchMock = buildFetchRouter({ list: [] });
    vi.stubGlobal("fetch", fetchMock);
    render(<PortalMessagesPage />);
    await waitFor(() => expect(screen.getByText("Henüz mesaj yok")).toBeTruthy());

    const textarea = screen.getByPlaceholderText("Mesajınızı yazın...") as HTMLTextAreaElement;

    fireEvent.change(textarea, { target: { value: "Shift enter denemesi" } });
    fireEvent.keyPress(textarea, { key: "Enter", code: "Enter", shiftKey: true });
    await new Promise((r) => setTimeout(r, 10));
    expect(
      fetchMock.mock.calls.some(
        ([url, init]: any) => url.endsWith("/api/portal/messages") && (init?.method || "GET").toUpperCase() === "POST"
      )
    ).toBe(false);

    fireEvent.keyPress(textarea, { key: "Enter", code: "Enter", shiftKey: false });
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/api/portal/messages"),
        expect.objectContaining({ method: "POST" })
      )
    );
  });

  it("[12] mark-as-read isteği mount'ta çağrılır", async () => {
    const fetchMock = buildFetchRouter({ list: [CLIENT_MSG] });
    vi.stubGlobal("fetch", fetchMock);
    render(<PortalMessagesPage />);
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/api/portal/messages/mark-read"),
        expect.objectContaining({ method: "POST" })
      )
    );
  });

  it("[13] mevcut loading davranışı korunur (fetch çözülmeden spinner görünür)", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
    const { container } = render(<PortalMessagesPage />);
    expect(container.querySelector(".animate-spin")).toBeTruthy();
  });

  it("[14] mevcut boş-liste davranışı korunur", async () => {
    vi.stubGlobal("fetch", buildFetchRouter({ list: [] }));
    render(<PortalMessagesPage />);
    await waitFor(() => expect(screen.getByText("Henüz mesaj yok")).toBeTruthy());
  });

  it("[15] 10 saniyelik polling korunur ve unmount interval'ı temizler", async () => {
    vi.useFakeTimers();
    const fetchMock = buildFetchRouter({ list: [CLIENT_MSG] });
    vi.stubGlobal("fetch", fetchMock);

    const { unmount } = render(<PortalMessagesPage />);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());

    const listCallsBefore = fetchMock.mock.calls.filter(([u]: any) => u.endsWith("/api/portal/messages")).length;

    await vi.advanceTimersByTimeAsync(10000);
    const listCallsAfterOneTick = fetchMock.mock.calls.filter(([u]: any) => u.endsWith("/api/portal/messages")).length;
    expect(listCallsAfterOneTick).toBeGreaterThan(listCallsBefore);

    unmount();
    const listCallsAtUnmount = fetchMock.mock.calls.filter(([u]: any) => u.endsWith("/api/portal/messages")).length;
    await vi.advanceTimersByTimeAsync(30000);
    const listCallsAfterUnmount = fetchMock.mock.calls.filter(([u]: any) => u.endsWith("/api/portal/messages")).length;
    expect(listCallsAfterUnmount).toBe(listCallsAtUnmount);
  });
});
