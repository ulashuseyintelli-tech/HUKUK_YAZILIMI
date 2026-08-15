import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent, cleanup } from "@testing-library/react";
import fs from "node:fs";
import path from "node:path";
import PortalPoasPage from "@/app/portal/poas/page";

/**
 * CLIENT-P2-U03-I04 — portal PoA sayfasının, backend'in artık explicit-select ile döndüğü
 * daraltılmış response şekline uyumunu doğrular. Production page.tsx DEĞİŞTİRİLMEDİ — sayfa
 * zaten yalnız approved alanları tüketiyordu (consumer FOUND, ama bounded adaptation
 * gerekmedi). Bu spec yalnız yeni bounded contract'la mevcut davranışın DEĞİŞMEDİĞİNİ kanıtlar.
 */
const BASE_POA = {
  id: "poa-1",
  notaryName: "İstanbul 5. Noterliği",
  notaryCity: "İstanbul",
  journalNo: "2026/123",
  poaNumber: "VEK-001",
  dateIssued: "2026-01-01T00:00:00.000Z",
  isLimited: false,
  validUntil: null,
  status: "ACTIVE",
  canCollect: true,
  canWaive: false,
  canSettle: true,
  canRelease: false,
  lawyers: [{ lawyer: { name: "Ahmet", surname: "Yılmaz", barNumber: "12345" } }],
};

function stubFetch(response: any) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
}

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: any) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("Portal PoA page — CLIENT-P2-U03-I04 explicit projection", () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem("portal_token", "test-token");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("[1] onaylı alanlar render edilir (notaryName, notaryCity, journalNo, dateIssued)", async () => {
    stubFetch({ ok: true, json: async () => [BASE_POA] });
    render(<PortalPoasPage />);
    await waitFor(() => expect(screen.getByText(/Yevmiye No: 2026\/123/)).toBeTruthy());
    expect(screen.getByText(/İstanbul 5\. Noterliği/)).toBeTruthy();
    expect(screen.getByText(/İstanbul/)).toBeTruthy();
    expect(screen.getByText(/1\.01\.2026|01\.01\.2026/)).toBeTruthy();
  });

  it("[2] avukat name/surname render edilir", async () => {
    stubFetch({ ok: true, json: async () => [BASE_POA] });
    render(<PortalPoasPage />);
    await waitFor(() => expect(screen.getByText(/Av\. Ahmet Yılmaz/)).toBeTruthy());
  });

  it("[3] barNumber veride olsa bile hiçbir yerde görsel olarak render edilmez (mevcut UI kullanmıyor)", async () => {
    stubFetch({ ok: true, json: async () => [BASE_POA] });
    render(<PortalPoasPage />);
    await waitFor(() => expect(screen.getByText(/Av\. Ahmet Yılmaz/)).toBeTruthy());
    expect(screen.queryByText(/12345/)).toBeNull();
  });

  it("[4] filePath fixture'a sızdırılsa bile hiç render edilmez (legacy/beklenmedik alan)", async () => {
    const poisoned = { ...BASE_POA, filePath: "/data/poa/leaked.pdf" };
    stubFetch({ ok: true, json: async () => [poisoned] });
    render(<PortalPoasPage />);
    await waitFor(() => expect(screen.getByText(/Yevmiye No: 2026\/123/)).toBeTruthy());
    expect(screen.queryByText(/leaked\.pdf/)).toBeNull();
  });

  it("[5] internal join ID'leri (lawyers[].id/lawyerId) fixture'da olsa bile render edilmez", async () => {
    const poisoned = {
      ...BASE_POA,
      lawyers: [{ id: "join-1", lawyerId: "lawyer-1", lawyer: { name: "Ahmet", surname: "Yılmaz", barNumber: "12345" } }],
    };
    stubFetch({ ok: true, json: async () => [poisoned] });
    render(<PortalPoasPage />);
    await waitFor(() => expect(screen.getByText(/Av\. Ahmet Yılmaz/)).toBeTruthy());
    expect(screen.queryByText(/join-1/)).toBeNull();
    expect(screen.queryByText(/lawyer-1/)).toBeNull();
  });

  it("[6] sayfa dosya metadata'sına (fileSize/mimeType) bağımlı değildir", async () => {
    stubFetch({ ok: true, json: async () => [BASE_POA] });
    render(<PortalPoasPage />);
    await waitFor(() => expect(screen.getByText(/Yevmiye No: 2026\/123/)).toBeTruthy());
  });

  it("[7] EXPIRED durumu badge'i render edilir", async () => {
    stubFetch({ ok: true, json: async () => [{ ...BASE_POA, status: "EXPIRED" }] });
    render(<PortalPoasPage />);
    await waitFor(() => expect(screen.getByText("Süresi Dolmuş")).toBeTruthy());
  });

  it("[8] REVOKED durumu badge'i render edilir", async () => {
    stubFetch({ ok: true, json: async () => [{ ...BASE_POA, status: "REVOKED" }] });
    render(<PortalPoasPage />);
    await waitFor(() => expect(screen.getByText("İptal Edilmiş")).toBeTruthy());
  });

  it("[9] süresiz (isLimited=false) vekalet 'Süresiz' badge'i gösterir", async () => {
    stubFetch({ ok: true, json: async () => [BASE_POA] });
    render(<PortalPoasPage />);
    await waitFor(() => expect(screen.getByText("Süresiz")).toBeTruthy());
  });

  it("[10] süreli (isLimited=true) + uzak validUntil tarih-bazlı badge gösterir", async () => {
    const limited = { ...BASE_POA, isLimited: true, validUntil: "2035-01-01T00:00:00.000Z" };
    stubFetch({ ok: true, json: async () => [limited] });
    render(<PortalPoasPage />);
    await waitFor(() => expect(screen.getByText(/2035/)).toBeTruthy());
  });

  it("[11] yetki rozetleri (canCollect/canSettle true, canWaive/canRelease false) doğru render edilir", async () => {
    stubFetch({ ok: true, json: async () => [BASE_POA] });
    render(<PortalPoasPage />);
    await waitFor(() => expect(screen.getByText("Ahzu Kabza")).toBeTruthy());
    expect(screen.getByText("Sulh")).toBeTruthy();
    expect(screen.queryByText("Feragat")).toBeNull();
    expect(screen.queryByText("İbra")).toBeNull();
  });

  it("[12] mevcut loading davranışı korunur (fetch çözülmeden spinner görünür)", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
    const { container } = render(<PortalPoasPage />);
    expect(container.querySelector(".animate-spin")).toBeTruthy();
  });

  it("[13] mevcut boş-liste davranışı korunur (gerçek-empty, hata bandı YOK)", async () => {
    stubFetch({ ok: true, json: async () => [] });
    render(<PortalPoasPage />);
    await waitFor(() => expect(screen.getByText("Henüz vekalet kaydı bulunmuyor")).toBeTruthy());
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("[14] ağ hatası artık 'Henüz vekalet kaydı bulunmuyor' İLE KARIŞMAZ — görünür hata bandı gösterilir (WSMR-A4-AB-7)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    render(<PortalPoasPage />);
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(screen.queryByText("Henüz vekalet kaydı bulunmuyor")).toBeNull();
  });
});

/**
 * WSMR-A4-AB-7 — `app/portal/poas/page.tsx#loadPoas`.
 *
 * ERİŞİLEBİLİRLİK: `page.tsx` App Router'da `/portal/poas` route'unun KENDİSİ; ayrıca
 * `src/app/portal/layout.tsx:268` `<Link href="/portal/poas">` ile koşulsuz sekme olarak
 * bağlanıyor. Canlı, koşulsuz erişilebilir — davranışsal patch uygulandı (kaldırma YOK).
 *
 * KUSUR: `loadData` hatayı yalnız `console.error` ile YUTUYORDU; `res.ok` HİÇ kontrol
 * edilmiyordu (hata gövdesi dizi değilse `poas.map` gizlice ÇÖKEBİLİRDİ); okuma hatası
 * "Henüz vekalet kaydı bulunmuyor" (gerçekten-boş) ile AYNI ekrana düşüyordu. Vekaletname
 * varlığı/yokluğu hukuki belge durumudur — okuma hatası "vekalet yok" GİBİ GÖSTERİLEMEZ.
 *
 * MİMARİ NOT (dürüst kapsam sınırı): bu sayfanın TEK yükleme tetikleyicisi mount + hata-
 * kapılı retry'dır (messages/page.tsx'teki `setInterval` veya cases/[id]/page.tsx'teki
 * prop-bağımlı refetch YOK). Bu yüzden "başarılı veri sonrası YENİ bir okuma başarısız
 * olur" senaryosu bu SAYFADA canlı/gözlemlenebilir bir UI yolu ile ÜRETİLEMEZ (retry
 * düğmesi yalnız hata varken görünür; başarı anında hem veri hem loadError=null aynı
 * render'da işlenir). "Önceki başarılı veri hata sırasında SİLİNMEZ" değişmezi bu yüzden
 * KAYNAK-KİLİDİ testiyle (R6) doğrulanır — davranışsal olarak zaten `cases/[id]/page.tsx`
 * (A4-AB-1/A4-AB-2) ve `TebligatPanel.tsx` (A4-AB-6) ile AYNI kod şeklini kullanır.
 */
describe("WSMR-A4-AB-7 — loadPoas okuma hatası", () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem("portal_token", "test-token");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    cleanup();
  });

  it("[R1] ilk yükleme hatası (network) → görünür ERROR + retry düğmesi, sahte boşluk-onayı YOK", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    render(<PortalPoasPage />);
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(screen.getByRole("button", { name: /Tekrar dene/ })).toBeTruthy();
    expect(screen.queryByText("Henüz vekalet kaydı bulunmuyor")).toBeNull();
  });

  it("[R1b] 403 HTTP durumu da ERROR sayılır (eskiden res.ok HİÇ kontrol edilmiyordu)", async () => {
    stubFetch({ ok: false, status: 403, json: async () => ({ message: "Yasak" }) });
    render(<PortalPoasPage />);
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(screen.queryByText("Henüz vekalet kaydı bulunmuyor")).toBeNull();
  });

  it("[R1c] 500 HTTP durumu da ERROR sayılır", async () => {
    stubFetch({ ok: false, status: 500, json: async () => ({ message: "Sunucu hatası" }) });
    render(<PortalPoasPage />);
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(screen.queryByText("Henüz vekalet kaydı bulunmuyor")).toBeNull();
  });

  it("[R2] retry başarı: hata bandı kalkar, veri render edilir", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 500 })
      .mockResolvedValueOnce({ ok: true, json: async () => [BASE_POA] });
    vi.stubGlobal("fetch", fetchMock);
    render(<PortalPoasPage />);
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: /Tekrar dene/ }));
    await waitFor(() => expect(screen.getByText(/Yevmiye No: 2026\/123/)).toBeTruthy());
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("[R3] retry YALNIZ POA kaynağını çağırır (tüm fetch çağrıları aynı endpoint'e gider)", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 500 })
      .mockResolvedValueOnce({ ok: true, json: async () => [] });
    vi.stubGlobal("fetch", fetchMock);
    render(<PortalPoasPage />);
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: /Tekrar dene/ }));
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    expect(fetchMock).toHaveBeenCalledTimes(2);
    for (const call of fetchMock.mock.calls) {
      expect(String(call[0])).toMatch(/\/api\/portal\/poas$/);
    }
  });

  it("[R4] başarılı gerçek-boş liste: ERROR bandı YOK, gerçek-boş metni gösterilir", async () => {
    stubFetch({ ok: true, json: async () => [] });
    render(<PortalPoasPage />);
    await waitFor(() => expect(screen.getByText("Henüz vekalet kaydı bulunmuyor")).toBeTruthy());
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("[R5] malformed gövde (dizi değil) → ERROR sayılır, çökme YOK, nötr yer tutucu gösterilir", async () => {
    stubFetch({ ok: true, json: async () => ({ unexpected: "shape" }) });
    render(<PortalPoasPage />);
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(screen.queryByText("Henüz vekalet kaydı bulunmuyor")).toBeNull();
    expect(screen.getByText("—")).toBeTruthy();
  });

  it("[R6] KAYNAK-KİLİDİ: catch bloğu setPoas([]) ÇAĞIRMAZ — önceki başarılı veri hata sırasında SİLİNMEZ", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "../page.tsx"), "utf8");
    const setPoasCalls = src.match(/setPoas\(/g) ?? [];
    // Tek çağrı yeri: yalnız başarı yolunda (`setPoas(data)`). catch bloğu hiç çağırmaz.
    expect(setPoasCalls.length).toBe(1);
    // `catch` blok GÖVDESİNİ (kelimenin yorum-metni içindeki geçişlerini DEĞİL) izole eder:
    // `catch (e) {` ile onu izleyen `finally {` arasındaki metin.
    const catchBodyMatch = src.match(/catch\s*\([^)]*\)\s*\{([\s\S]*?)\}\s*finally\s*\{/);
    expect(catchBodyMatch).not.toBeNull();
    expect(catchBodyMatch![1]).not.toMatch(/setPoas\(/);
  });

  it("[R7] çift hızlı retry tıklaması: in-flight guard İKİNCİ isteği hiç başlatmaz (eski yanıt yeniyi asla ezemez)", async () => {
    const d2 = deferred<any>();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 500 })
      .mockReturnValueOnce(d2.promise as any);
    vi.stubGlobal("fetch", fetchMock);
    render(<PortalPoasPage />);
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    const retryBtn = screen.getByRole("button", { name: /Tekrar dene/ });
    fireEvent.click(retryBtn);
    fireEvent.click(retryBtn); // in-flight guard + disabled attribute -> YOK SAYILMALI
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2)); // 1 ilk + 1 retry, İKİNCİ retry YOK
    d2.resolve({ ok: true, json: async () => [] });
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  });

  it("[R8] unmount sonrası gecikmeli yanıt state güncellemesi/unhandled rejection ÜRETMEZ", async () => {
    const rejections: unknown[] = [];
    const onUnhandledRejection = (err: unknown) => rejections.push(err);
    process.on("unhandledRejection", onUnhandledRejection);
    try {
      const d = deferred<any>();
      vi.stubGlobal("fetch", vi.fn().mockReturnValue(d.promise));
      const { unmount } = render(<PortalPoasPage />);
      unmount();
      d.resolve({ ok: true, json: async () => [BASE_POA] });
      await new Promise((r) => setTimeout(r, 0));
      expect(rejections).toEqual([]);
    } finally {
      process.off("unhandledRejection", onUnhandledRejection);
    }
  });

  it("[R9] belge açma/indirme davranışı: bu sayfada YOK (regresyon konusu değil — statik doğrulama)", async () => {
    stubFetch({ ok: true, json: async () => [BASE_POA] });
    render(<PortalPoasPage />);
    await waitFor(() => expect(screen.getByText(/Yevmiye No: 2026\/123/)).toBeTruthy());
    expect(screen.queryByText(/İndir|Aç$/)).toBeNull();
    const src = fs.readFileSync(path.resolve(__dirname, "../page.tsx"), "utf8");
    expect(src).not.toMatch(/download|verified-download/i);
  });
});
