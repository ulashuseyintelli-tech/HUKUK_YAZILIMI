/**
 * WSMR-A4-AB-15 — DebtorStep#handleUseExistingDebtor okuma hatası davranışsal testleri.
 *
 * KUSUR (fix öncesi): kimliksiz "benzer isim" review'unda kullanıcı "Bunu kullan: {isim}"
 * dediğinde, mevcut borçluyu id ile çekme (`api.get`) başarısız olursa `existing` tanımsız
 * kalıyordu — ama modal YİNE DE "başarılıymış gibi" koşulsuz kapanıyordu. Kullanıcı, seçtiği
 * mevcut borçlunun dosyaya eklendiğini SANIYORDU, oysa `selectedDebtors` hiç değişmemişti.
 * Yeni dosya/takip açma sihirbazının ZORUNLU "Borçlular" adımında bu, fark edilmeden eksik
 * tarafla açılan bir takip dosyasıyla sonuçlanabiliyordu.
 *
 * NewDebtorModal (830+ satır, kendi karmaşık "benzer isim" tespit UI'sine sahip) burada
 * KASITLI olarak stub'lanır — bu bulgu/fix tamamen DebtorStep tarafındaki `onUseExisting`
 * callback'inde (handleUseExistingDebtor); NewDebtorModal'ın kendi iç akışı kapsam dışı.
 *
 * Seri zincirin 5. ve SON halkası (A4-AB-11→15, owner GO).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { useState } from "react";

const apiGet = vi.fn();
const apiPost = vi.fn();
vi.mock("@/lib/api", () => ({
  api: { get: (...a: any[]) => apiGet(...a), post: (...a: any[]) => apiPost(...a) },
}));

vi.mock("../NewDebtorModal", () => ({
  NewDebtorModal: ({ onUseExisting, onClose }: any) => (
    <div data-testid="new-debtor-modal">
      <button onClick={() => onUseExisting?.({ id: "existing-1", name: "Ali Veli" })}>
        Bunu kullan: Ali Veli
      </button>
      <button onClick={onClose}>Kapat Modal</button>
    </div>
  ),
}));

import { DebtorStep } from "../DebtorStep";
import type { CaseDebtor } from "@/types/debtor";

function Harness() {
  const [debtors, setDebtors] = useState<CaseDebtor[]>([]);
  return (
    <div>
      <div data-testid="count">{debtors.length}</div>
      <DebtorStep selectedDebtors={debtors} onDebtorsChange={setDebtors} />
    </div>
  );
}

const FULL_DEBTOR = {
  id: "existing-1",
  type: "INDIVIDUAL",
  name: "Ali Veli",
  identityNo: undefined,
  debtorAddresses: [],
  kepAddress: undefined,
};

// "Şahıs" metni SAYFADA İKİ YERDE geçiyor: başlıktaki "+ Şahıs" hızlı-ekle butonu VE sol
// paneldeki tip filtresi butonu. Header'daki (DOM sırasında İLK) her zaman quick-add butonu.
function openNewDebtorTypeButton() {
  return screen.getAllByText("Şahıs")[0];
}

async function openModalAndUseExisting() {
  render(<Harness />);
  await waitFor(() => expect(apiGet).toHaveBeenCalledWith("/debtors?limit=500"));
  fireEvent.click(openNewDebtorTypeButton());
  await screen.findByTestId("new-debtor-modal");
  fireEvent.click(screen.getByText("Bunu kullan: Ali Veli"));
}

describe("WSMR-A4-AB-15: DebtorStep#handleUseExistingDebtor okuma hatası", () => {
  beforeEach(() => {
    apiGet.mockReset();
    apiPost.mockReset();
    // loadDebtors (mount) → boş rehber; belirli /debtors/{id} çağrıları testlerde override edilir.
    apiGet.mockImplementation((url: string) => {
      if (url === "/debtors?limit=500") return Promise.resolve({ data: { data: [] } });
      return Promise.reject(new Error(`unexpected GET ${url}`));
    });
  });

  it("[1] ağ hatası: modal SESSİZCE 'başarılıymış gibi' kapanmaz, görünür hata bandı + retry gösterilir, borçlu EKLENMEZ", async () => {
    apiGet.mockImplementation((url: string) => {
      if (url === "/debtors?limit=500") return Promise.resolve({ data: { data: [] } });
      if (url === "/debtors/existing-1") return Promise.reject(new Error("network down"));
      return Promise.reject(new Error(`unexpected GET ${url}`));
    });

    await openModalAndUseExisting();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Mevcut borçlu yüklenemedi.");
    expect(alert).toHaveTextContent("Borçlu dosyaya EKLENMEDİ.");
    expect(screen.getByTestId("count").textContent).toBe("0");
    expect(screen.getByRole("button", { name: "Tekrar dene" })).toBeInTheDocument();
  });

  it("[2] malformed gövde (id eksik): crash etmez, aynı ERROR muamelesi görülür, borçlu EKLENMEZ", async () => {
    apiGet.mockImplementation((url: string) => {
      if (url === "/debtors?limit=500") return Promise.resolve({ data: { data: [] } });
      if (url === "/debtors/existing-1") return Promise.resolve({ data: { name: "Ali Veli" } }); // id yok
      return Promise.reject(new Error(`unexpected GET ${url}`));
    });

    await openModalAndUseExisting();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Mevcut borçlu yüklenemedi.");
    expect(screen.getByTestId("count").textContent).toBe("0");
  });

  it("[3] gerçek başarı: borçlu dosyaya eklenir, hata bandı yok, modal kapanır", async () => {
    apiGet.mockImplementation((url: string) => {
      if (url === "/debtors?limit=500") return Promise.resolve({ data: { data: [] } });
      if (url === "/debtors/existing-1") return Promise.resolve({ data: FULL_DEBTOR });
      return Promise.reject(new Error(`unexpected GET ${url}`));
    });

    await openModalAndUseExisting();

    await waitFor(() => expect(screen.getByTestId("count").textContent).toBe("1"));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByTestId("new-debtor-modal")).not.toBeInTheDocument();
  });

  it("[4] retry başarılı: hata bandı temizlenir, borçlu EKLENİR, sayaç 1'e çıkar", async () => {
    let attempt = 0;
    apiGet.mockImplementation((url: string) => {
      if (url === "/debtors?limit=500") return Promise.resolve({ data: { data: [] } });
      if (url === "/debtors/existing-1") {
        attempt += 1;
        if (attempt === 1) return Promise.reject(new Error("network down"));
        return Promise.resolve({ data: FULL_DEBTOR });
      }
      return Promise.reject(new Error(`unexpected GET ${url}`));
    });

    await openModalAndUseExisting();
    await screen.findByRole("alert");

    fireEvent.click(screen.getByRole("button", { name: "Tekrar dene" }));

    await waitFor(() => expect(screen.getByTestId("count").textContent).toBe("1"));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(attempt).toBe(2);
  });

  it("[5] 'Kapat' butonu: hata bandını borçlu eklemeden temizler (retry ZORUNLU değil)", async () => {
    apiGet.mockImplementation((url: string) => {
      if (url === "/debtors?limit=500") return Promise.resolve({ data: { data: [] } });
      if (url === "/debtors/existing-1") return Promise.reject(new Error("network down"));
      return Promise.reject(new Error(`unexpected GET ${url}`));
    });

    await openModalAndUseExisting();
    await screen.findByRole("alert");

    fireEvent.click(screen.getByRole("button", { name: "Kapat" }));

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByTestId("count").textContent).toBe("0");
  });

  it("[6] existingDebtors yerel cache'te varsa: hiç API çağrısı yapılmadan doğrudan eklenir", async () => {
    apiGet.mockImplementation((url: string) => {
      if (url === "/debtors?limit=500")
        return Promise.resolve({ data: { data: [FULL_DEBTOR] } }); // rehberde zaten var
      return Promise.reject(new Error(`unexpected GET ${url}`));
    });

    await openModalAndUseExisting();

    await waitFor(() => expect(screen.getByTestId("count").textContent).toBe("1"));
    // /debtors/existing-1 HİÇ çağrılmadı — yalnız ilk rehber çağrısı (1) yapıldı.
    expect(apiGet).toHaveBeenCalledTimes(1);
  });

  it("[7] zaten seçili borçlu tekrar 'kullanılırsa': mükerrer eklenmez, hata yok, modal kapanır", async () => {
    render(<Harness />);
    await waitFor(() => expect(apiGet).toHaveBeenCalledWith("/debtors?limit=500"));

    // İlk ekleme: doğrudan cache'ten (existingDebtors boş → API'den çekilir, başarı).
    apiGet.mockImplementation((url: string) => {
      if (url === "/debtors?limit=500") return Promise.resolve({ data: { data: [] } });
      if (url === "/debtors/existing-1") return Promise.resolve({ data: FULL_DEBTOR });
      return Promise.reject(new Error(`unexpected GET ${url}`));
    });

    fireEvent.click(openNewDebtorTypeButton());
    await screen.findByTestId("new-debtor-modal");
    fireEvent.click(screen.getByText("Bunu kullan: Ali Veli"));
    await waitFor(() => expect(screen.getByTestId("count").textContent).toBe("1"));

    // İkinci kez aynı adayı "kullan" — selectedDebtors'ta zaten var, tekrar eklenmemeli.
    fireEvent.click(openNewDebtorTypeButton());
    await screen.findByTestId("new-debtor-modal");
    fireEvent.click(screen.getByText("Bunu kullan: Ali Veli"));

    await waitFor(() => expect(screen.queryByTestId("new-debtor-modal")).not.toBeInTheDocument());
    expect(screen.getByTestId("count").textContent).toBe("1");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("[8] farklı bir aday için retry: en son BAŞARISIZ olan adayla dener (yalnız handleUseExistingDebtor'ı tekrar dener, başka mutation tetiklemez)", async () => {
    apiGet.mockImplementation((url: string) => {
      if (url === "/debtors?limit=500") return Promise.resolve({ data: { data: [] } });
      if (url === "/debtors/existing-1") return Promise.reject(new Error("network down"));
      return Promise.reject(new Error(`unexpected GET ${url}`));
    });

    await openModalAndUseExisting();
    await screen.findByRole("alert");

    expect(apiGet).toHaveBeenCalledTimes(2); // 1: rehber, 2: ilk deneme
    fireEvent.click(screen.getByRole("button", { name: "Tekrar dene" }));

    await waitFor(() => expect(apiGet).toHaveBeenCalledTimes(3)); // yalnız 1 ek çağrı
    // apiPost hiçbir zaman çağrılmadı — retry başka bir mutation TETİKLEMEDİ.
    expect(apiPost).not.toHaveBeenCalled();
  });
});
