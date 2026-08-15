import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent, cleanup } from "@testing-library/react";
import PortalHomePage from "@/app/portal/page";

const pushMock = vi.fn();
// KARARLI referans (mevcut portal-api-base-url-usage.spec.tsx / A4-AB-9 case-list-projection
// deseniyle AYNI) — her `useRouter()` çağrısında YENİ bir obje döndürmek `loadCases`'in
// `[router]` bağımlılığını "değişti" sanıp useEffect'i beklenmedik yeniden tetikler (WSMR-A4-
// AB-9'da tam bu hata 4 testi FAIL etmişti; burada baştan doğru desenle başlanıyor).
const routerMock = { push: pushMock };
vi.mock("next/navigation", () => ({
  useRouter: () => routerMock,
}));

/**
 * CLIENT-POL-F-R01 — Portal dashboard (ana sayfa) finansal aggregate remediation.
 *
 * Bu dosya, portal ana sayfası için ilk test kapsamıdır (audit bulgusu: `portal/page.tsx`
 * için hiç spec dosyası yoktu — bu yüzden §22.10/§22.11 ihlali aylarca yakalanamadı).
 *
 * Kapatılan ihlaller:
 *  - "Toplam Alacak" = cross-case `Σ principalAmount` (CANLI, sıfır olmayan finansal aggregate)
 *    → Charter §22.10 "claimed amount total ... NOT AUTHORIZED"; "`principalAmount` canonical
 *      aggregate source DEĞİLDİR"
 *  - "Tahsil Edilen" = `Σ collections` (TRACK-B-U00B'de API'den kaldırılan alana bağlı ölü kod)
 *    → §22.10 "collected amount total ... NOT AUTHORIZED"
 *
 * KORUNANLAR (negatif remediation olmamalı):
 *  - "Toplam Dosya"/"Aktif Dosya" — §23.6 "pagination/kayıt-sayısı business aggregate DEĞİLDİR"
 *  - "Son Dosyalar" satırlarında TEKİL case `principalAmount` — §23.9 single-object presentation
 */

const fetchMock = vi.fn();

const CASES = [
  {
    id: "c1",
    fileNumber: "2026/111",
    caseStatus: "DERDEST",
    caseDate: "2026-01-15T00:00:00.000Z",
    principalAmount: "1000",
    debtors: [{ debtor: { name: "Borçlu Bir" } }],
  },
  {
    id: "c2",
    fileNumber: "2026/222",
    caseStatus: "HITAM",
    caseDate: "2026-02-20T00:00:00.000Z",
    principalAmount: "2500",
    debtors: [{ debtor: { name: "Borçlu İki" } }],
  },
];

function mockCasesResponse(payload: unknown) {
  fetchMock.mockResolvedValue({ ok: true, json: async () => payload });
}

describe("PortalHomePage — CLIENT-POL-F-R01 financial aggregate remediation", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    localStorage.clear();
    localStorage.setItem("portal_token", "t-123");
    localStorage.setItem("portal_user", JSON.stringify({ clientName: "Test Müvekkil" }));
    pushMock.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it("[1] cross-case finansal aggregate kartları RENDER EDİLMEZ ('Toplam Alacak' / 'Tahsil Edilen')", async () => {
    mockCasesResponse(CASES);
    render(<PortalHomePage />);

    await waitFor(() => expect(screen.getByText("Toplam Dosya")).toBeTruthy());
    expect(screen.queryByText("Toplam Alacak")).toBeNull();
    expect(screen.queryByText("Tahsil Edilen")).toBeNull();
  });

  it("[2] cross-case toplam TUTAR hiçbir yerde görünmez (1000+2500=3500 sızmıyor)", async () => {
    mockCasesResponse(CASES);
    const { container } = render(<PortalHomePage />);

    await waitFor(() => expect(screen.getByText("Toplam Dosya")).toBeTruthy());
    // Σ principalAmount = 3500 — hiçbir formatta render edilmemeli.
    const text = container.textContent ?? "";
    expect(text).not.toContain("3.500");
    expect(text).not.toContain("3500");
  });

  it("[3] ölü `collections` referansı kaldırıldı — API stray `collections` döndürse bile tutar render edilmez", async () => {
    // Defansif: eski/legacy bir API yanıtı yanlışlıkla `collections` taşısa bile
    // dashboard bunu hiç okumamalı (§22.10 collected amount total yasağı).
    mockCasesResponse([
      { ...CASES[0], collections: [{ amount: "777", date: "2026-03-01", type: "BANKA" }] },
    ]);
    const { container } = render(<PortalHomePage />);

    await waitFor(() => expect(screen.getByText("Toplam Dosya")).toBeTruthy());
    expect(screen.queryByText("Tahsil Edilen")).toBeNull();
    expect(container.textContent ?? "").not.toContain("777");
  });

  it("[4] KORUNAN: non-financial sayaçlar render edilir (Toplam Dosya=2, Aktif Dosya=1)", async () => {
    mockCasesResponse(CASES);
    render(<PortalHomePage />);

    await waitFor(() => expect(screen.getByText("Toplam Dosya")).toBeTruthy());
    expect(screen.getByText("Aktif Dosya")).toBeTruthy();
    // DERDEST 1 adet → aktif 1; toplam 2.
    const values = screen.getAllByText(/^[0-9]+$/).map((el) => el.textContent);
    expect(values).toContain("2");
    expect(values).toContain("1");
  });

  it("[5] KORUNAN: 'Son Dosyalar' satırlarında TEKİL case principalAmount gösterilmeye devam eder (§23.9)", async () => {
    mockCasesResponse(CASES);
    render(<PortalHomePage />);

    await waitFor(() => expect(screen.getByText("2026/111")).toBeTruthy());
    // Tekil (single-object) tutarlar izinli — toplanmadıkları için ihlal değil.
    expect(screen.getByText(/1\.000\s*₺/)).toBeTruthy();
    expect(screen.getByText(/2\.500\s*₺/)).toBeTruthy();
    expect(screen.getByText("Borçlu Bir")).toBeTruthy();
  });

  it("[6] loading state korunur (fetch çözülmeden spinner)", async () => {
    fetchMock.mockReturnValue(new Promise(() => {})); // hiç çözülmez
    const { container } = render(<PortalHomePage />);
    expect(container.querySelector(".animate-spin")).toBeTruthy();
    expect(screen.queryByText("Toplam Dosya")).toBeNull();
  });

  it("[7] empty state korunur (dosya yok)", async () => {
    mockCasesResponse([]);
    render(<PortalHomePage />);

    await waitFor(() => expect(screen.getByText("Henüz dosya bulunmuyor")).toBeTruthy());
    // Boş listede de finansal aggregate YOK (0 ₺ gibi yanıltıcı değer de gösterilmez).
    expect(screen.queryByText("Toplam Alacak")).toBeNull();
    expect(screen.queryByText("Tahsil Edilen")).toBeNull();
  });

  it("[8] WSMR-A4-AB-10: ağ hatası artık sıfır sayaç/'Henüz dosya bulunmuyor' İLE KARIŞMAZ — görünür ERROR", async () => {
    fetchMock.mockRejectedValue(new Error("network down"));
    render(<PortalHomePage />);

    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(screen.queryByText("Toplam Dosya")).toBeNull();
    expect(screen.queryByText("Henüz dosya bulunmuyor")).toBeNull();
    expect(screen.queryByText("Toplam Alacak")).toBeNull();
  });

  it("[9] navigation korunur — 'Tümünü Gör' ve dosya satırı linkleri doğru hedeflere gider", async () => {
    mockCasesResponse(CASES);
    render(<PortalHomePage />);

    await waitFor(() => expect(screen.getByText("2026/111")).toBeTruthy());
    expect(screen.getByRole("link", { name: /Tümünü Gör/ }).getAttribute("href")).toBe("/portal/cases");
    const caseLink = screen.getByText("2026/111").closest("a");
    expect(caseLink?.getAttribute("href")).toBe("/portal/cases/c1");
  });
});

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: any) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/**
 * WSMR-A4-AB-10 — `app/portal/page.tsx#loadCases`.
 *
 * ERİŞİLEBİLİRLİK: `page.tsx` App Router'da `/portal` route'unun KENDİSİ — hem
 * `layout.tsx`'te koşulsuz sekme, hem `login/page.tsx:41` `router.push("/portal")` ile
 * girişten SONRAKİ varsayılan iniş noktası. Canlı, koşulsuz erişilebilir.
 *
 * TÜKETİCİLER: `loadCases` sonucu "Toplam Dosya" (`cases.length`), "Aktif Dosya"
 * (DERDEST/İŞLEMDE filtre sayısı) sayaçlarını VE "Son Dosyalar" (ilk 5) önizleme
 * listesini/CTA linklerini besler — case-list/case-detail sayfalarına AYRI, kendi tüketici
 * yüzeyleri.
 *
 * SÖZLEŞME: A4-AB-9 ile AYNI endpoint (`getClientCases` — liste, 404 kavramı yok, 403 yok,
 * `PortalAuthGuard` ayrı 401). Kod KÖRLEMESİNE kopyalanmadı — bu sayfaya özgü tüketiciler
 * (sayaçlar + önizleme) için ayrı JSX/render dalları yazıldı; yeni bir paylaşılan
 * abstraction/hook ÜRETİLMEDİ (tek kullanım, mevcut mimariye uygun dar patch).
 */
describe("WSMR-A4-AB-10 — loadCases okuma hatası (portal ana sayfa)", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    localStorage.clear();
    localStorage.setItem("portal_token", "t-123");
    localStorage.setItem("portal_user", JSON.stringify({ clientName: "Test Müvekkil" }));
    pushMock.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
    cleanup();
  });

  it("[R1] gerçek veri: doğru sayaç/özet render edilir (regresyon)", async () => {
    mockCasesResponse(CASES);
    render(<PortalHomePage />);
    await waitFor(() => expect(screen.getByText("2026/111")).toBeTruthy());
    const values = screen.getAllByText(/^[0-9]+$/).map((el) => el.textContent);
    expect(values).toContain("2");
    expect(values).toContain("1");
  });

  it("[R2] gerçek boş liste: sayaçlar 0, 'Henüz dosya bulunmuyor', ERROR bandı YOK", async () => {
    mockCasesResponse([]);
    render(<PortalHomePage />);
    await waitFor(() => expect(screen.getByText("Henüz dosya bulunmuyor")).toBeTruthy());
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("[R3] ilk yükleme 500 hatası → sahte sıfır/empty YOK, görünür ERROR + retry", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500 });
    render(<PortalHomePage />);
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(screen.queryByText("Toplam Dosya")).toBeNull();
    expect(screen.queryByText("Henüz dosya bulunmuyor")).toBeNull();
    expect(screen.getByRole("button", { name: /Tekrar dene/ })).toBeTruthy();
  });

  it("[R4] retry başarı: hata kalkar, gerçek özet render edilir", async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: false, status: 500 })
      .mockResolvedValueOnce({ ok: true, json: async () => CASES });
    render(<PortalHomePage />);
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: /Tekrar dene/ }));
    await waitFor(() => expect(screen.getByText("2026/111")).toBeTruthy());
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("[R4b] retry YALNIZ loadCases'i (liste kaynağını) tekrar çağırır", async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: false, status: 500 })
      .mockResolvedValueOnce({ ok: true, json: async () => [] });
    render(<PortalHomePage />);
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: /Tekrar dene/ }));
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    expect(fetchMock).toHaveBeenCalledTimes(2);
    for (const call of fetchMock.mock.calls) {
      expect(String(call[0])).toMatch(/\/api\/portal\/cases$/);
    }
  });

  it("[R5] malformed 200 gövdesi (dizi değil) → ERROR, çökme YOK", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ unexpected: "shape" }) });
    render(<PortalHomePage />);
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(screen.queryByText("Henüz dosya bulunmuyor")).toBeNull();
  });

  it("[R5b] boş 200 gövdesi (null) → ERROR, çökme YOK", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => null });
    render(<PortalHomePage />);
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
  });

  it("[R6] başarılı özet sonrası manuel yenileme hatası: ÖNCEKİ özet/liste korunur + bayat bandı", async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => CASES })
      .mockResolvedValueOnce({ ok: false, status: 500 });
    render(<PortalHomePage />);
    await waitFor(() => expect(screen.getByText("2026/111")).toBeTruthy());
    expect(screen.queryByRole("alert")).toBeNull();
    fireEvent.click(screen.getByTitle("Yenile"));
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    // Özet/liste HÂLÂ ekranda — SİLİNMEDİ, yalnız bayat olduğu bantta belirtildi.
    expect(screen.getByText("2026/111")).toBeTruthy();
    const values = screen.getAllByText(/^[0-9]+$/).map((el) => el.textContent);
    expect(values).toContain("2");
    expect(screen.getByText(/bayat olabilir/)).toBeTruthy();
  });

  it("[R7] çift hızlı retry tıklaması: in-flight guard İKİNCİ isteği hiç başlatmaz (eski yanıt yeniyi ezemez)", async () => {
    const d2 = deferred<any>();
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500 }).mockReturnValueOnce(d2.promise as any);
    render(<PortalHomePage />);
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    const retryBtn = screen.getByRole("button", { name: /Tekrar dene/ });
    fireEvent.click(retryBtn);
    fireEvent.click(retryBtn); // in-flight guard + disabled attribute -> YOK SAYILMALI
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2)); // 1 ilk + 1 retry, İKİNCİ YOK
    d2.resolve({ ok: true, json: async () => [] });
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  });

  it("[R8] unmount sonrası gecikmeli yanıt state güncellemesi/unhandled rejection ÜRETMEZ", async () => {
    const rejections: unknown[] = [];
    const onUnhandledRejection = (err: unknown) => rejections.push(err);
    process.on("unhandledRejection", onUnhandledRejection);
    try {
      const d = deferred<any>();
      fetchMock.mockReturnValue(d.promise);
      const { unmount } = render(<PortalHomePage />);
      unmount();
      d.resolve({ ok: true, json: async () => CASES });
      await new Promise((r) => setTimeout(r, 0));
      expect(rejections).toEqual([]);
    } finally {
      process.off("unhandledRejection", onUnhandledRejection);
    }
  });

  it("[R9] 401 ile gerçek-boş liste AYRILIR: 401'de sıfır sayaç/'Henüz dosya bulunmuyor' GÖSTERİLMEZ, login'e yönlendirilir + token temizlenir", async () => {
    localStorage.setItem("portal_token", "expired-token");
    fetchMock.mockResolvedValue({ ok: false, status: 401 });
    render(<PortalHomePage />);
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/portal/login"));
    expect(screen.queryByText("Toplam Dosya")).toBeNull();
    expect(screen.queryByText("Henüz dosya bulunmuyor")).toBeNull();
    expect(localStorage.getItem("portal_token")).toBeNull();
  });

  it("[R9b] gerçek-boş liste (200 + []) 401 ile KARIŞMAZ — login'e yönlendirme OLMAZ", async () => {
    mockCasesResponse([]);
    render(<PortalHomePage />);
    await waitFor(() => expect(screen.getByText("Henüz dosya bulunmuyor")).toBeTruthy());
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("[R10] tenant dışı dosya/toplam sızıntısı yok: ERROR mesajı ham sunucu gövdesini YANSITMAZ", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ message: "İç hata: 47 dosya, tenant-xyz" }),
    });
    render(<PortalHomePage />);
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(screen.queryByText(/47 dosya/)).toBeNull();
    expect(screen.queryByText(/tenant-xyz/)).toBeNull();
  });

  it("[R11] ana sayfa → dosya listesi/detayı navigasyonu regresyonsuz (hata sonrası retry ile kurtarılan veri üzerinden de)", async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: false, status: 500 })
      .mockResolvedValueOnce({ ok: true, json: async () => CASES });
    render(<PortalHomePage />);
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: /Tekrar dene/ }));
    await waitFor(() => expect(screen.getByText("2026/111")).toBeTruthy());
    expect(screen.getByRole("link", { name: /Tümünü Gör/ }).getAttribute("href")).toBe("/portal/cases");
    expect(screen.getByText("2026/111").closest("a")?.getAttribute("href")).toBe("/portal/cases/c1");
  });
});
