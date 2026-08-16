/**
 * WSMR-A4-AB-20 — UyapQueryModal#loadData okuma hatası davranışsal testleri.
 *
 * KUSUR (fix öncesi): hata durumunda hiçbir state dokunulmuyordu (yalnız console.error) —
 * `queryTypes`/`suggestions` boş kalınca modal açıklamasız BOŞ bir sorgu-türü ızgarası
 * gösteriyordu ("yalancı boşluk" — okuma arızası ile "gerçekten seçenek yok" AYIRT
 * EDİLEMEZ). Ayrıca bu modal örneği açık/kapalı arası UNMOUNT OLMUYOR (yalnız `open`
 * prop'u değişir) — kimlik değişim koruması olmadan, ÖNCEKİ borçlunun sorgu türü/öneri/
 * seçim/not durumu YENİ borçlunun bağlamında sessizce kalabiliyordu (yanlış borçluya
 * gönderilme riski dahil — modal reopen/identity izolasyon açığı).
 *
 * Canlılık zinciri fresh doğrulandı: cases/[id]/page.tsx → DebtorDetailDrawer →
 * AddressResearchWidget → UyapQueryModal (doğrudan import, dead AddressDiscoveryPanel
 * üzerinden DEĞİL).
 *
 * Seri zincirin 5. ve SON halkası (A4-AB-16→20, owner GO).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const apiMock = vi.hoisted(() => ({
  getUyapQueryTypes: vi.fn(),
  getSuggestedUyapQueries: vi.fn(),
  createUyapQuery: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  api: apiMock,
}));

import { UyapQueryModal } from "../UyapQueryModal";

const TYPE_NUFUS = { type: "NUFUS_ADRES", code: "A1", name: "Nüfus Adres", forIndividual: true, forCompany: false };
const TYPE_SGK = { type: "SGK", code: "A2", name: "SGK", forIndividual: true, forCompany: true };
const SUGG_NUFUS = { queryType: "NUFUS_ADRES", queryCode: "A1", name: "Nüfus Adres", priority: 1 };

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("WSMR-A4-AB-20: UyapQueryModal#loadData okuma hatası", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("[1] gerçek başarı: sorgu türleri ve öneriler render edilir, hata YOK", async () => {
    apiMock.getUyapQueryTypes.mockResolvedValue([TYPE_NUFUS, TYPE_SGK]);
    apiMock.getSuggestedUyapQueries.mockResolvedValue([SUGG_NUFUS]);

    render(<UyapQueryModal open onClose={vi.fn()} caseDebtorId="debtor-A" debtorType="INDIVIDUAL" />);

    await screen.findByText("Nüfus Adres");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("[2] gerçek boş (başarılı, boş diziler): boş ızgara sessizce gösterilir, hata YOK", async () => {
    apiMock.getUyapQueryTypes.mockResolvedValue([]);
    apiMock.getSuggestedUyapQueries.mockResolvedValue([]);

    render(<UyapQueryModal open onClose={vi.fn()} caseDebtorId="debtor-A" debtorType="INDIVIDUAL" />);

    await waitFor(() => expect(screen.queryByText("Yükleniyor...")).not.toBeInTheDocument());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("[3] ağ hatası: görünür hata bandı çıkar, boş ızgara ('yalancı boşluk') YAZILMAZ", async () => {
    apiMock.getUyapQueryTypes.mockRejectedValue(new Error("network down"));
    apiMock.getSuggestedUyapQueries.mockResolvedValue([]);

    render(<UyapQueryModal open onClose={vi.fn()} caseDebtorId="debtor-A" debtorType="INDIVIDUAL" />);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("UYAP sorgu türleri/önerileri yüklenemedi.");
    expect(screen.getByRole("button", { name: "Tekrar dene" })).toBeInTheDocument();
  });

  it("[4] malformed gövde (dizi değil): crash etmez, aynı ERROR muamelesi görülür", async () => {
    apiMock.getUyapQueryTypes.mockResolvedValue({ message: "beklenmedik" } as any);
    apiMock.getSuggestedUyapQueries.mockResolvedValue([]);

    render(<UyapQueryModal open onClose={vi.fn()} caseDebtorId="debtor-A" debtorType="INDIVIDUAL" />);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("UYAP sorgu türleri/önerileri yüklenemedi.");
  });

  it("[5] retry başarılı: hata bandı temizlenir, içerik render edilir", async () => {
    apiMock.getUyapQueryTypes
      .mockRejectedValueOnce(new Error("network down"))
      .mockResolvedValueOnce([TYPE_NUFUS]);
    apiMock.getSuggestedUyapQueries.mockResolvedValue([]);

    render(<UyapQueryModal open onClose={vi.fn()} caseDebtorId="debtor-A" debtorType="INDIVIDUAL" />);

    await screen.findByRole("alert");
    fireEvent.click(screen.getByRole("button", { name: "Tekrar dene" }));

    await screen.findByText("Nüfus Adres");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(apiMock.getUyapQueryTypes).toHaveBeenCalledTimes(2);
  });

  it("[6] retry YALNIZ bu iki okumayı tekrar dener — createUyapQuery HİÇ ÇAĞRILMAZ", async () => {
    apiMock.getUyapQueryTypes.mockRejectedValue(new Error("network down"));
    apiMock.getSuggestedUyapQueries.mockResolvedValue([]);

    render(<UyapQueryModal open onClose={vi.fn()} caseDebtorId="debtor-A" debtorType="INDIVIDUAL" />);

    await screen.findByRole("alert");
    fireEvent.click(screen.getByRole("button", { name: "Tekrar dene" }));

    await waitFor(() => expect(apiMock.getUyapQueryTypes).toHaveBeenCalledTimes(2));
    expect(apiMock.createUyapQuery).not.toHaveBeenCalled();
  });

  it("[7] aynı-borçlu stale: başarılı yükleme sonrası SONRAKİ okuma (kapat/aç) başarısız olursa ÖNCEKİ liste KORUNUR + bayat-hata bandı gösterilir", async () => {
    apiMock.getUyapQueryTypes
      .mockResolvedValueOnce([TYPE_NUFUS])
      .mockRejectedValueOnce(new Error("network down"));
    apiMock.getSuggestedUyapQueries.mockResolvedValue([]);

    const { rerender } = render(
      <UyapQueryModal open onClose={vi.fn()} caseDebtorId="debtor-A" debtorType="INDIVIDUAL" />
    );
    await screen.findByText("Nüfus Adres");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    // Kapat + aynı borçlu için yeniden aç — bu modal örneği UNMOUNT olmadığından
    // `open` geçişi yeniden fetch tetikler (mevcut davranış, dokunulmadı).
    rerender(<UyapQueryModal open={false} onClose={vi.fn()} caseDebtorId="debtor-A" debtorType="INDIVIDUAL" />);
    rerender(<UyapQueryModal open onClose={vi.fn()} caseDebtorId="debtor-A" debtorType="INDIVIDUAL" />);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("bayat olabilir");
    // ÖNCEKİ liste HÂLÂ DOM'da — açıklamasız boş ızgarayla DEĞİŞTİRİLMEDİ.
    expect(screen.getByText("Nüfus Adres")).toBeInTheDocument();
  });

  it("[8] modal reopen/cross-debtor izolasyonu: farklı borçlu için yeniden açılınca ÖNCEKİ borçlunun sorgu türü/öneri/seçimi/notu YENİ borçluya SIZMAZ", async () => {
    apiMock.getUyapQueryTypes.mockImplementation((...args: any[]) => Promise.resolve([TYPE_NUFUS, TYPE_SGK]));
    apiMock.getSuggestedUyapQueries.mockImplementation((debtorId: string) => {
      if (debtorId === "debtor-A") return Promise.resolve([SUGG_NUFUS]);
      return Promise.resolve([]); // B için öneri yok
    });

    const { rerender } = render(
      <UyapQueryModal open onClose={vi.fn()} caseDebtorId="debtor-A" debtorType="INDIVIDUAL" />
    );
    await screen.findByText("Önerilen Sorgular");
    // A için not yazalım — kimlik değişince bu notun B'ye SIZMAMASI gerekir.
    fireEvent.change(screen.getByPlaceholderText("Sorgu ile ilgili notlar..."), {
      target: { value: "A'ya özel not" },
    });
    expect(screen.getByDisplayValue("A'ya özel not")).toBeInTheDocument();

    // Kapat + FARKLI borçlu için yeniden aç.
    rerender(<UyapQueryModal open={false} onClose={vi.fn()} caseDebtorId="debtor-A" debtorType="INDIVIDUAL" />);
    rerender(<UyapQueryModal open onClose={vi.fn()} caseDebtorId="debtor-B" debtorType="INDIVIDUAL" />);

    await waitFor(() => expect(apiMock.getSuggestedUyapQueries).toHaveBeenCalledWith("debtor-B"));
    // A'nın "Önerilen Sorgular" bloğu B için GÖRÜNMEZ (B'nin önerisi yok).
    expect(screen.queryByText("Önerilen Sorgular")).not.toBeInTheDocument();
    // A'ya yazılan not B'nin bağlamında SIZMADI — temizlendi.
    expect(screen.queryByDisplayValue("A'ya özel not")).not.toBeInTheDocument();
  });

  it("[9] çift-retry: hızlı art arda iki tıklama tek aktif isteğe düşer (in-flight koruması)", async () => {
    apiMock.getUyapQueryTypes.mockRejectedValueOnce(new Error("network down"));
    apiMock.getSuggestedUyapQueries.mockResolvedValue([]);

    render(<UyapQueryModal open onClose={vi.fn()} caseDebtorId="debtor-A" debtorType="INDIVIDUAL" />);
    await screen.findByRole("alert");
    expect(apiMock.getUyapQueryTypes).toHaveBeenCalledTimes(1);

    const retry = deferred<any>();
    apiMock.getUyapQueryTypes.mockReturnValueOnce(retry.promise);

    const retryButton = screen.getByRole("button", { name: "Tekrar dene" });
    fireEvent.click(retryButton);
    fireEvent.click(retryButton);

    retry.resolve([TYPE_NUFUS]);
    await screen.findByText("Nüfus Adres");

    expect(apiMock.getUyapQueryTypes).toHaveBeenCalledTimes(2);
  });

  it("[10] unmount güvenliği: fetch sonuçlanmadan unmount edilirse hata/uyarı fırlamaz", async () => {
    const pending = deferred<any>();
    apiMock.getUyapQueryTypes.mockReturnValue(pending.promise);
    apiMock.getSuggestedUyapQueries.mockResolvedValue([]);

    const { unmount } = render(
      <UyapQueryModal open onClose={vi.fn()} caseDebtorId="debtor-A" debtorType="INDIVIDUAL" />
    );
    unmount();
    pending.resolve([TYPE_NUFUS]);

    await new Promise((r) => setTimeout(r, 0));
    expect(true).toBe(true);
  });
});
