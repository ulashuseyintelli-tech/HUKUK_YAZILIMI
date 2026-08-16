/**
 * WSMR-A4-AB-17 — DebtorStep#loadDebtors ("Borçlu Rehberi") okuma hatası davranışsal testleri.
 *
 * KUSUR (fix öncesi): `loadDebtors` hatayı yalnız `console.error` ile yutuyordu ve
 * `existingDebtors` SESSİZCE boş diziye ZORLANIYORDU. Bu, gerçek "sistemde kayıtlı
 * borçlu yok" durumuyla bir okuma arızasını AYIRT EDİLEMEZ kılıyordu — kullanıcı,
 * aslında sistemde kayıtlı bir borçluyu (rehberden) bulamayınca onu tekrar/mükerrer
 * olarak yeni kayıt açarak ekleyebilirdi (TCKN/VKN eşleşme kontrolü es geçilirdi).
 *
 * Seri zincirin 2. halkası (A4-AB-16→20, owner GO).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { useState } from "react";

const apiGet = vi.fn();
const apiPost = vi.fn();
vi.mock("@/lib/api", () => ({
  api: { get: (...a: any[]) => apiGet(...a), post: (...a: any[]) => apiPost(...a) },
}));

vi.mock("../NewDebtorModal", () => ({
  NewDebtorModal: ({ onSave }: any) => (
    <div data-testid="new-debtor-modal">
      <button onClick={() => onSave?.({ id: "new-1", type: "INDIVIDUAL", name: "Yeni Borçlu" })}>
        Kaydet (stub)
      </button>
    </div>
  ),
}));

import { DebtorStep } from "../DebtorStep";
import type { CaseDebtor } from "@/types/debtor";

function Harness() {
  const [debtors, setDebtors] = useState<CaseDebtor[]>([]);
  return <DebtorStep selectedDebtors={debtors} onDebtorsChange={setDebtors} />;
}

const DEBTOR_1 = { id: "d1", type: "INDIVIDUAL", name: "Ali Veli", identityNo: "11111111110" };
const DEBTOR_2 = { id: "d2", type: "INDIVIDUAL", name: "Veli Ali", identityNo: "22222222220" };

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("WSMR-A4-AB-17: DebtorStep#loadDebtors (Borçlu Rehberi) okuma hatası", () => {
  beforeEach(() => {
    apiGet.mockReset();
    apiPost.mockReset();
  });

  it("[1] ağ hatası (ilk yükleme): 'Borçlu bulunamadı' YAZILMAZ, görünür hata bandı + retry gösterilir", async () => {
    apiGet.mockRejectedValue(new Error("network down"));
    render(<Harness />);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Borçlular yüklenemedi.");
    expect(screen.queryByText("Borçlu bulunamadı")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tekrar dene" })).toBeInTheDocument();
  });

  it("[2] malformed gövde (dizi değil): crash etmez, aynı ERROR muamelesi görülür", async () => {
    apiGet.mockResolvedValue({ data: { message: "beklenmedik" } });
    render(<Harness />);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Borçlular yüklenemedi.");
  });

  it("[3] gerçek boş (başarılı, boş dizi): 'Borçlu bulunamadı' DOĞRU gösterilir, hata YOK", async () => {
    apiGet.mockResolvedValue({ data: { data: [] } });
    render(<Harness />);

    await screen.findByText("Borçlu bulunamadı");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("[4] gerçek başarı: rehber listesi render edilir, hata YOK", async () => {
    apiGet.mockResolvedValue({ data: { data: [DEBTOR_1, DEBTOR_2] } });
    render(<Harness />);

    await screen.findByText("Ali Veli");
    expect(screen.getByText("Veli Ali")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("[5] retry başarılı: hata bandı temizlenir, rehber render edilir", async () => {
    apiGet
      .mockRejectedValueOnce(new Error("network down"))
      .mockResolvedValueOnce({ data: { data: [DEBTOR_1] } });
    render(<Harness />);

    await screen.findByRole("alert");
    fireEvent.click(screen.getByRole("button", { name: "Tekrar dene" }));

    await screen.findByText("Ali Veli");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(apiGet).toHaveBeenCalledTimes(2);
  });

  it("[6] başarı sonrası ikinci okuma (handleDebtorSaved tetikli yenileme) başarısız olursa: ÖNCEKİ liste SİLİNMEZ, bayat bandı gösterilir", async () => {
    apiGet
      .mockResolvedValueOnce({ data: { data: [DEBTOR_1] } })
      .mockRejectedValueOnce(new Error("network down"));
    render(<Harness />);

    await screen.findByText("Ali Veli");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    // Yeni borçlu kaydetme akışı (handleDebtorSaved) rehberi YENİDEN yükler — "Şahıs"
    // metni sayfada İKİ yerde geçiyor (başlık hızlı-ekle + tip filtresi); İLKİ hızlı-ekle.
    fireEvent.click(screen.getAllByText("Şahıs")[0]);
    await screen.findByTestId("new-debtor-modal");
    fireEvent.click(screen.getByText("Kaydet (stub)"));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Liste bayat olabilir.");
    // Önceki başarılı veri hâlâ DOM'da — "Borçlu bulunamadı" İLE DEĞİŞTİRİLMEDİ.
    expect(screen.getByText("Ali Veli")).toBeInTheDocument();
    expect(screen.queryByText("Borçlu bulunamadı")).not.toBeInTheDocument();
  });

  it("[7] çift-retry: hızlı art arda iki tıklama tek aktif isteğe düşer (in-flight koruması)", async () => {
    apiGet.mockRejectedValueOnce(new Error("network down"));
    render(<Harness />);
    await screen.findByRole("alert");
    expect(apiGet).toHaveBeenCalledTimes(1);

    const retry = deferred<any>();
    apiGet.mockReturnValueOnce(retry.promise);

    const retryButton = screen.getByRole("button", { name: "Tekrar dene" });
    fireEvent.click(retryButton);
    fireEvent.click(retryButton); // ikinci tık — in-flight guard'a takılmalı

    retry.resolve({ data: { data: [DEBTOR_1] } });
    await screen.findByText("Ali Veli");

    // İlk deneme (1) + yalnız TEK retry çağrısı (2) = toplam 2, 3 DEĞİL.
    expect(apiGet).toHaveBeenCalledTimes(2);
  });

  it("[8] unmount güvenliği: fetch sonuçlanmadan unmount edilirse hata/uyarı fırlamaz", async () => {
    const pending = deferred<any>();
    apiGet.mockReturnValue(pending.promise);

    const { unmount } = render(<Harness />);
    unmount();
    pending.resolve({ data: { data: [DEBTOR_1] } });

    await new Promise((r) => setTimeout(r, 0));
    // Bu noktaya kadar throw/unhandled rejection olmadan ulaşmak testin kendisidir.
    expect(true).toBe(true);
  });

  it("[9] taze yeniden-bağlanma bağımsızlığı: önceki mount'un hata durumu YENİ mount'a SIZMAZ (wizard/case kimlik izolasyonu)", async () => {
    apiGet.mockRejectedValueOnce(new Error("network down"));
    const { unmount } = render(<Harness />);
    await screen.findByRole("alert");
    unmount();
    cleanup();

    // Sihirbazda bir sonraki "Borçlular" adımı ziyareti — TAMAMEN YENİ bir mount
    // (bileşen ölü kod barındırmıyor, tüm state/ref'ler taze başlar).
    apiGet.mockResolvedValueOnce({ data: { data: [DEBTOR_2] } });
    render(<Harness />);

    await screen.findByText("Veli Ali");
    // Önceki mount'un hatası bu YENİ mount'ta GÖRÜNMEZ.
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
