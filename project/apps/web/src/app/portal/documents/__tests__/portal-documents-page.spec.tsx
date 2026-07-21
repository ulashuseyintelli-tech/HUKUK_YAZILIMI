import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent, within } from "@testing-library/react";
import PortalDocumentsPage from "@/app/portal/documents/page";

/**
 * CLIENT-P2-U03-I02 — portal documents sayfasının, backend'in artık explicit-select ile
 * döndüğü daraltılmış response şekline uyumunu doğrular: onaylı alanlar render edilir,
 * reviewNote/filePath response'ta bulunsa bile (legacy/beklenmedik alan) hiç render
 * edilmez veya kullanılmaz, mevcut upload/download/delete/loading/empty davranışı DEĞİŞMEDİ.
 */
const DOC_1 = {
  id: "doc-1",
  type: "VEKALET",
  title: "Şirket Vekaletnamesi",
  description: "Test açıklama metni",
  fileName: "vekalet.pdf",
  fileSize: 2048,
  status: "PENDING",
  createdAt: "2026-01-01T00:00:00.000Z",
};

const DOC_2 = {
  id: "doc-2",
  type: "KIMLIK",
  title: "Nüfus Cüzdanı Fotokopisi",
  fileName: "kimlik.pdf",
  fileSize: 1024,
  status: "APPROVED",
  createdAt: "2026-01-02T00:00:00.000Z",
};

const APPROVED_DOCUMENTS = [DOC_1, DOC_2];

function buildFetchRouter(opts: {
  list: any;
  listAfterUpload?: any;
  uploadResponse?: any;
  downloadOk?: boolean;
  deleteOk?: boolean;
}) {
  let listCallCount = 0;
  return vi.fn((url: string, init?: any) => {
    const method = (init?.method || "GET").toUpperCase();
    if (method === "GET" && url.endsWith("/api/portal/documents")) {
      listCallCount++;
      const body = listCallCount === 1 ? opts.list : (opts.listAfterUpload ?? opts.list);
      return Promise.resolve({ ok: true, json: async () => body });
    }
    if (method === "POST" && url.endsWith("/api/portal/documents/upload")) {
      return Promise.resolve({ ok: true, json: async () => opts.uploadResponse ?? { ...DOC_1, id: "doc-new" } });
    }
    if (url.includes("/download")) {
      return Promise.resolve({ ok: opts.downloadOk !== false, blob: async () => new Blob(["x"]) });
    }
    if (method === "DELETE") {
      return Promise.resolve({ ok: opts.deleteOk !== false });
    }
    return Promise.reject(new Error(`Unhandled fetch: ${method} ${url}`));
  });
}

describe("Portal documents page — CLIENT-P2-U03-I02 explicit projection", () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem("portal_token", "test-token");
    window.URL.createObjectURL = vi.fn(() => "blob:mock-url");
    window.URL.revokeObjectURL = vi.fn();
    window.confirm = vi.fn(() => true);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("[1] onaylı belge listesi render edilir", async () => {
    vi.stubGlobal("fetch", buildFetchRouter({ list: APPROVED_DOCUMENTS }));
    render(<PortalDocumentsPage />);
    await waitFor(() => expect(screen.getByText("Şirket Vekaletnamesi")).toBeTruthy());
    expect(screen.getByText("Nüfus Cüzdanı Fotokopisi")).toBeTruthy();
  });

  it("[2] title render edilir", async () => {
    vi.stubGlobal("fetch", buildFetchRouter({ list: APPROVED_DOCUMENTS }));
    render(<PortalDocumentsPage />);
    await waitFor(() => expect(screen.getByText("Şirket Vekaletnamesi")).toBeTruthy());
  });

  it("[3] client-provided description render edilir", async () => {
    vi.stubGlobal("fetch", buildFetchRouter({ list: APPROVED_DOCUMENTS }));
    render(<PortalDocumentsPage />);
    await waitFor(() => expect(screen.getByText("Test açıklama metni")).toBeTruthy());
  });

  it("[4] document type (label) render edilir", async () => {
    vi.stubGlobal("fetch", buildFetchRouter({ list: APPROVED_DOCUMENTS }));
    render(<PortalDocumentsPage />);
    await waitFor(() => expect(screen.getByText("Vekaletname")).toBeTruthy());
    expect(screen.getByText("Kimlik Belgesi")).toBeTruthy();
  });

  it("[5] file size render edilir", async () => {
    vi.stubGlobal("fetch", buildFetchRouter({ list: APPROVED_DOCUMENTS }));
    render(<PortalDocumentsPage />);
    await waitFor(() => expect(screen.getByText("2.0 KB")).toBeTruthy());
    expect(screen.getByText("1.0 KB")).toBeTruthy();
  });

  it("[6] status badge render edilir", async () => {
    vi.stubGlobal("fetch", buildFetchRouter({ list: APPROVED_DOCUMENTS }));
    render(<PortalDocumentsPage />);
    await waitFor(() => expect(screen.getByText("Beklemede")).toBeTruthy());
    expect(screen.getByText("Onaylandı")).toBeTruthy();
  });

  it("[7] created date render edilir", async () => {
    vi.stubGlobal("fetch", buildFetchRouter({ list: APPROVED_DOCUMENTS }));
    render(<PortalDocumentsPage />);
    await waitFor(() => expect(screen.getByText("Şirket Vekaletnamesi")).toBeTruthy());
    const expectedDate = new Date(DOC_1.createdAt).toLocaleDateString("tr-TR");
    expect(screen.getByText(expectedDate)).toBeTruthy();
  });

  it("[8] indirme id ve fileName kullanır", async () => {
    const fetchMock = buildFetchRouter({ list: APPROVED_DOCUMENTS });
    vi.stubGlobal("fetch", fetchMock);
    render(<PortalDocumentsPage />);
    await waitFor(() => expect(screen.getByText("Şirket Vekaletnamesi")).toBeTruthy());

    const realCreateElement = document.createElement.bind(document);
    let capturedAnchor: HTMLAnchorElement | null = null;
    const createElSpy = vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      const el = realCreateElement(tag);
      if (tag === "a") capturedAnchor = el as HTMLAnchorElement;
      return el;
    });

    const downloadButtons = screen.getAllByTitle("İndir");
    fireEvent.click(downloadButtons[0]);

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/api/portal/documents/doc-1/download"),
        expect.anything()
      )
    );
    await waitFor(() => expect(capturedAnchor?.download).toBe("vekalet.pdf"));

    createElSpy.mockRestore();
  });

  it("[9]/[10] yalnız PENDING belgede silme aksiyonu gösterilir", async () => {
    vi.stubGlobal("fetch", buildFetchRouter({ list: APPROVED_DOCUMENTS }));
    render(<PortalDocumentsPage />);
    await waitFor(() => expect(screen.getByText("Şirket Vekaletnamesi")).toBeTruthy());

    const rows = screen.getAllByRole("row").slice(1);
    const pendingRow = rows.find((r) => within(r).queryByText("Şirket Vekaletnamesi"))!;
    const approvedRow = rows.find((r) => within(r).queryByText("Nüfus Cüzdanı Fotokopisi"))!;

    expect(within(pendingRow).queryByTitle("Sil")).toBeTruthy();
    expect(within(approvedRow).queryByTitle("Sil")).toBeNull();
    expect(within(pendingRow).queryByTitle("İndir")).toBeTruthy();
    expect(within(approvedRow).queryByTitle("İndir")).toBeTruthy();
  });

  it("[11] reviewNote fixture'da olsa bile render edilmez (legacy alan)", async () => {
    const rejectedWithLegacyNote = {
      ...DOC_1,
      id: "doc-3",
      title: "Reddedilen Belge",
      status: "REJECTED",
      reviewNote: "Eksik imza sayfası",
    };
    vi.stubGlobal("fetch", buildFetchRouter({ list: [rejectedWithLegacyNote] }));
    render(<PortalDocumentsPage />);
    await waitFor(() => expect(screen.getByText("Reddedilen Belge")).toBeTruthy());
    expect(screen.queryByText(/Eksik imza sayfası/)).toBeNull();
    expect(screen.queryByText(/^Not:/)).toBeNull();
  });

  it("[12] sayfa filePath'e bağımlı değildir (fixture'da hiç yok, çökme olmaz)", async () => {
    vi.stubGlobal("fetch", buildFetchRouter({ list: APPROVED_DOCUMENTS }));
    render(<PortalDocumentsPage />);
    await waitFor(() => expect(screen.getByText("Şirket Vekaletnamesi")).toBeTruthy());
    expect(screen.getByText("Nüfus Cüzdanı Fotokopisi")).toBeTruthy();
  });

  it("[13] upload başarılı olunca liste yenilenir", async () => {
    const newDoc = { ...DOC_1, id: "doc-new", title: "Yeni Yüklenen Belge" };
    const fetchMock = buildFetchRouter({
      list: [DOC_1],
      listAfterUpload: [DOC_1, newDoc],
      uploadResponse: newDoc,
    });
    vi.stubGlobal("fetch", fetchMock);
    const { container } = render(<PortalDocumentsPage />);
    await waitFor(() => expect(screen.getByText("Şirket Vekaletnamesi")).toBeTruthy());

    fireEvent.click(screen.getByText("Belge Yükle"));
    fireEvent.change(screen.getByPlaceholderText("Belge başlığı"), { target: { value: "Yeni Yüklenen Belge" } });
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(["dummy content"], "yeni.pdf", { type: "application/pdf" });
    fireEvent.change(fileInput, { target: { files: [file] } });
    fireEvent.click(screen.getByText("Yükle"));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/api/portal/documents/upload"),
        expect.objectContaining({ method: "POST" })
      )
    );
    await waitFor(() => expect(screen.getByText("Yeni Yüklenen Belge")).toBeTruthy());
  });

  it("[14] mevcut loading davranışı korunur (fetch çözülmeden spinner görünür)", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
    const { container } = render(<PortalDocumentsPage />);
    expect(container.querySelector(".animate-spin")).toBeTruthy();
  });

  it("[15] mevcut boş-liste davranışı korunur", async () => {
    vi.stubGlobal("fetch", buildFetchRouter({ list: [] }));
    render(<PortalDocumentsPage />);
    await waitFor(() => expect(screen.getByText("Henüz belge yüklemediniz")).toBeTruthy());
  });
});
