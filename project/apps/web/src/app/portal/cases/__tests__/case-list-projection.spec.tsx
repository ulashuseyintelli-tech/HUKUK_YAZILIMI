import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent, cleanup } from "@testing-library/react";
import PortalCasesPage from "@/app/portal/cases/page";

const pushMock = vi.fn();
// KARARLI referans (mevcut portal-api-base-url-usage.spec.tsx deseniyle AYNI) — her
// `useRouter()` çağrısında YENİ bir obje döndürmek `loadCases`'in `[router]` bağımlılığını
// "değişti" sanıp useEffect'i beklenmedik yeniden tetikler (gerçek Next.js `useRouter`
// KARARLI/memoized referans verir; bu mock ONUNLA TUTARLI olmalı).
const routerMock = { push: pushMock };
vi.mock("next/navigation", () => ({
  useRouter: () => routerMock,
}));

/**
 * CLIENT-P2-U03-TRACK-B-U00B — case-list sayfasının (`portal/cases/page.tsx`), backend'in
 * artık `collections`'sız döndüğü daraltılmış response şekline uyumunu doğrular: "Alacak"
 * kolonu (principalAmount) render edilmeye devam eder, "Tahsilat" kolonu ve onun
 * `totalCollected` türetmesi kaldırıldı — §33.4 Financial Disclosure Gate ile çelişen, U00'ın
 * case-detail kapsamındaki aynı kaldırmasının case-list ikizi (owner ruling, 2026-07-24).
 */
const APPROVED_CASE_LIST = [
  {
    id: "case-1",
    fileNumber: "2026/123",
    executionFileNumber: "2026/456",
    type: "ILAMSIZ",
    caseStatus: "DERDEST",
    caseDate: "2026-01-01T00:00:00.000Z",
    principalAmount: "1000",
    workflowStage: "SEIZURE",
    createdAt: "2026-01-02T00:00:00.000Z",
    debtors: [{ debtor: { name: "Ahmet Yılmaz" } }],
  },
];

function stubFetch(response: any) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
}

describe("Portal case-list page — CLIENT-P2-U03-TRACK-B-U00B explicit projection", () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem("portal_token", "test-token");
    pushMock.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("[1] onaylı case satırları render edilir (fileNumber, debtor adı, durum)", async () => {
    stubFetch({ ok: true, json: async () => APPROVED_CASE_LIST });
    render(<PortalCasesPage />);
    await waitFor(() => expect(screen.getByText("2026/123")).toBeTruthy());
    expect(screen.getByText("Ahmet Yılmaz")).toBeTruthy();
    expect(screen.getByText("Derdest")).toBeTruthy();
  });

  it("[2] 'Alacak' kolonu (principalAmount) render edilmeye devam eder", async () => {
    stubFetch({ ok: true, json: async () => APPROVED_CASE_LIST });
    render(<PortalCasesPage />);
    await waitFor(() => expect(screen.getByText("2026/123")).toBeTruthy());
    expect(screen.getByText("Alacak")).toBeTruthy();
    expect(screen.getByText("1.000 ₺")).toBeTruthy();
  });

  it("[3] TRACK-B-U00B: 'Tahsilat' kolonu artık hiç render edilmez", async () => {
    stubFetch({ ok: true, json: async () => APPROVED_CASE_LIST });
    render(<PortalCasesPage />);
    await waitFor(() => expect(screen.getByText("2026/123")).toBeTruthy());
    expect(screen.queryByText("Tahsilat")).toBeNull();
  });

  it("[4] TRACK-B-U00B: response'ta eski/yabancı bir `collections` alanı olsa bile hiçbir tahsilat tutarı render edilmez (defansif)", async () => {
    stubFetch({
      ok: true,
      json: async () => [
        { ...APPROVED_CASE_LIST[0], collections: [{ amount: "999999", date: "2026-02-01T00:00:00.000Z" }] },
      ],
    });
    render(<PortalCasesPage />);
    await waitFor(() => expect(screen.getByText("2026/123")).toBeTruthy());
    expect(screen.queryByText(/999999/)).toBeNull();
    expect(screen.queryByText("Tahsilat")).toBeNull();
  });

  it("[5] TRACK-B-U00B: `collections` alanı response'ta hiç yokken (yeni gerçek sözleşme) sayfa güvenle render edilir, çökmez", async () => {
    const { collections: _removed, ...withoutCollections } = { ...APPROVED_CASE_LIST[0] } as any;
    stubFetch({ ok: true, json: async () => [withoutCollections] });
    render(<PortalCasesPage />);
    await waitFor(() => expect(screen.getByText("2026/123")).toBeTruthy());
    expect(screen.getByText("Alacak")).toBeTruthy();
  });

  it("[6] mevcut arama/filtreleme davranışı korunur (dosya no ile filtrelenir)", async () => {
    stubFetch({
      ok: true,
      json: async () => [
        ...APPROVED_CASE_LIST,
        { ...APPROVED_CASE_LIST[0], id: "case-2", fileNumber: "2026/999", debtors: [{ debtor: { name: "Diğer Borçlu" } }] },
      ],
    });
    render(<PortalCasesPage />);
    await waitFor(() => expect(screen.getByText("2026/123")).toBeTruthy());
    expect(screen.getByText("2026/999")).toBeTruthy();
  });

  it("[7] mevcut boş-liste davranışı korunur", async () => {
    stubFetch({ ok: true, json: async () => [] });
    render(<PortalCasesPage />);
    await waitFor(() => expect(screen.getByText("Henüz dosya bulunmuyor")).toBeTruthy());
    expect(screen.queryByRole("alert")).toBeNull();
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
 * WSMR-A4-AB-9 — `app/portal/cases/page.tsx#loadCases`.
 *
 * ERİŞİLEBİLİRLİK: `page.tsx` App Router'da `/portal/cases` route'unun KENDİSİ;
 * `layout.tsx`'te koşulsuz sekme olarak bağlı, portalın birincil dosya-listesi görünümü.
 *
 * SÖZLEŞME (backend, doğrulandı — apps/api/src/modules/portal/portal.service.ts
 * #getClientCases): `Case.findMany({ where: { tenantId, showToClient: true, OR: [...] } })`
 * — LİSTE endpoint'i, 404 KAVRAMI YOK (eşleşme yoksa `[]`, genuine SUCCESS_EMPTY).
 * `PortalAuthGuard` ayrı `UnauthorizedException` (401) atar. 403/404 bu endpoint'in
 * sözleşmesinde YOK; beklenmeyen bir 403/404 gelirse genel ERROR sayılır (empty/not-found
 * DEĞİL). Tenant+client filtresi backend'de zaten uygulanıyor — client hiçbir ek hesaplama/
 * filtreleme yapmaz, yalnız gelen (zaten scoped) diziyi render eder; bu yüzden "tenant dışı
 * dosya/toplam sızıntısı" riski yapısal olarak backend'de kapanır.
 *
 * KAPSAM NOTU: bu sayfada arama (`search`) tamamen İSTEMCİ-tarafı `.filter()`'dır — yeni bir
 * fetch TETİKLEMEZ (sunucu-taraflı filtre/pagination YOK). Bu yüzden "hızlı filtre/sayfa
 * değişiminde eski yanıt yeniyi ezmez" maddesi bu sayfada gözlemlenebilir bir senaryo
 * ÜRETMEZ ("varsa" koşulu — owner talimatının kendi diliyle) — jenerasyon token/in-flight
 * guard yine de retry/unmount güvenliği için genel korumayı sağlar.
 */
describe("WSMR-A4-AB-9 — loadCases okuma hatası", () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem("portal_token", "test-token");
    pushMock.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    cleanup();
  });

  it("[R1] ilk yükleme network hatası → 'Henüz dosya bulunmuyor' İDDİA ETMEZ, görünür ERROR + retry", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    render(<PortalCasesPage />);
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(screen.queryByText("Henüz dosya bulunmuyor")).toBeNull();
    expect(screen.getByRole("button", { name: /Tekrar dene/ })).toBeTruthy();
  });

  it("[R1b] ilk yükleme 500 hatası → aynı şekilde ERROR, 'dosyanız yok' İDDİA ETMEZ", async () => {
    stubFetch({ ok: false, status: 500 });
    render(<PortalCasesPage />);
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(screen.queryByText("Henüz dosya bulunmuyor")).toBeNull();
  });

  it("[R2] retry başarı: hata kalkar, veri render edilir", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 500 })
      .mockResolvedValueOnce({ ok: true, json: async () => APPROVED_CASE_LIST });
    vi.stubGlobal("fetch", fetchMock);
    render(<PortalCasesPage />);
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: /Tekrar dene/ }));
    await waitFor(() => expect(screen.getByText("2026/123")).toBeTruthy());
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("[R2b] retry YALNIZ liste kaynağını çağırır (tüm fetch çağrıları aynı endpoint'e gider)", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 500 })
      .mockResolvedValueOnce({ ok: true, json: async () => [] });
    vi.stubGlobal("fetch", fetchMock);
    render(<PortalCasesPage />);
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: /Tekrar dene/ }));
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    expect(fetchMock).toHaveBeenCalledTimes(2);
    for (const call of fetchMock.mock.calls) {
      expect(String(call[0])).toMatch(/\/api\/portal\/cases$/);
    }
  });

  it("[R3] malformed 200 gövdesi (dizi değil) → ERROR sayılır, çökme YOK, 'dosyanız yok' İDDİA ETMEZ", async () => {
    stubFetch({ ok: true, json: async () => ({ unexpected: "shape" }) });
    render(<PortalCasesPage />);
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(screen.queryByText("Henüz dosya bulunmuyor")).toBeNull();
  });

  it("[R3b] boş 200 gövdesi (null) → ERROR sayılır, çökme YOK", async () => {
    stubFetch({ ok: true, json: async () => null });
    render(<PortalCasesPage />);
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
  });

  it("[R4] başarılı liste sonrası manuel yenileme hatası: ÖNCEKİ liste korunur + bayat bandı gösterilir", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => APPROVED_CASE_LIST })
      .mockResolvedValueOnce({ ok: false, status: 500 });
    vi.stubGlobal("fetch", fetchMock);
    render(<PortalCasesPage />);
    await waitFor(() => expect(screen.getByText("2026/123")).toBeTruthy());
    expect(screen.queryByRole("alert")).toBeNull();
    fireEvent.click(screen.getByTitle("Yenile"));
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    // Liste HÂLÂ ekranda — SİLİNMEDİ, yalnız bayat olduğu bantta belirtildi.
    expect(screen.getByText("2026/123")).toBeTruthy();
    expect(screen.getByText(/bayat olabilir/)).toBeTruthy();
  });

  it("[R5] unmount sonrası gecikmeli yanıt state güncellemesi/unhandled rejection ÜRETMEZ", async () => {
    const rejections: unknown[] = [];
    const onUnhandledRejection = (err: unknown) => rejections.push(err);
    process.on("unhandledRejection", onUnhandledRejection);
    try {
      const d = deferred<any>();
      vi.stubGlobal("fetch", vi.fn().mockReturnValue(d.promise));
      const { unmount } = render(<PortalCasesPage />);
      unmount();
      d.resolve({ ok: true, json: async () => APPROVED_CASE_LIST });
      await new Promise((r) => setTimeout(r, 0));
      expect(rejections).toEqual([]);
    } finally {
      process.off("unhandledRejection", onUnhandledRejection);
    }
  });

  it("[R6] 401 ile gerçek-boş liste AYRILIR: 401'de 'Henüz dosya bulunmuyor' GÖSTERİLMEZ, mevcut auth akışına (login) yönlendirilir + token temizlenir", async () => {
    localStorage.setItem("portal_token", "expired-token");
    stubFetch({ ok: false, status: 401 });
    render(<PortalCasesPage />);
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/portal/login"));
    expect(screen.queryByText("Henüz dosya bulunmuyor")).toBeNull();
    expect(localStorage.getItem("portal_token")).toBeNull();
  });

  it("[R6b] gerçek-boş liste (200 + []) 401 ile KARIŞMAZ — login'e yönlendirme OLMAZ", async () => {
    stubFetch({ ok: true, json: async () => [] });
    render(<PortalCasesPage />);
    await waitFor(() => expect(screen.getByText("Henüz dosya bulunmuyor")).toBeTruthy());
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("[R7] tenant dışı dosya/toplam sayısı sızmaz: ERROR mesajı ham sunucu gövdesini/sayısını YANSITMAZ", async () => {
    stubFetch({
      ok: false,
      status: 500,
      json: async () => ({ message: "İç sunucu hatası: 47 dosya bulundu, tenant-xyz" }),
    });
    render(<PortalCasesPage />);
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    // `toActionErrorMessage` iç ayrıntı/format taşımayan güvenli sabit metne düşer —
    // ham sunucu mesajı (olası sayı/tenant sızıntısı) DOM'a YAZILMAZ.
    expect(screen.queryByText(/47 dosya/)).toBeNull();
    expect(screen.queryByText(/tenant-xyz/)).toBeNull();
  });

  it("[R8] liste→detay navigasyonu regresyonsuz: her satırın detay linki doğru caseId'ye gider", async () => {
    stubFetch({ ok: true, json: async () => APPROVED_CASE_LIST });
    render(<PortalCasesPage />);
    await waitFor(() => expect(screen.getByText("2026/123")).toBeTruthy());
    const detailLinks = screen.getAllByRole("link").filter((a) => a.getAttribute("href") === "/portal/cases/case-1");
    expect(detailLinks.length).toBe(1);
  });

  it("[R9] çift hızlı retry tıklaması: in-flight guard İKİNCİ isteği hiç başlatmaz", async () => {
    const d2 = deferred<any>();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 500 })
      .mockReturnValueOnce(d2.promise as any);
    vi.stubGlobal("fetch", fetchMock);
    render(<PortalCasesPage />);
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    const retryBtn = screen.getByRole("button", { name: /Tekrar dene/ });
    fireEvent.click(retryBtn);
    fireEvent.click(retryBtn); // in-flight guard + disabled attribute -> YOK SAYILMALI
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2)); // 1 ilk + 1 retry, İKİNCİ retry YOK
    d2.resolve({ ok: true, json: async () => [] });
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  });
});
