/**
 * Açılış masraf talebi "otomatik oluşturulmadı" uyarısı (dosya sayfası).
 *
 * Kural: karar ve metin SUNUCUDANDIR (GET /expense-requests/case/:caseId/opening-status). Müvekkilli dosyada hiç masraf
 * talebi yokken ve sunucu peşin harcın hesaplanamadığını bildiriyorsa neden + gereken bilgi görünür; talep varsa uyarı
 * yoktur. Okuma hatası "uyarı yok" ile karıştırılmaz. Yalnız ağ katmanı taklit edilir.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { OpeningExpenseNotice } from "../OpeningExpenseNotice";
import { apiClient } from "@/lib/api/client";
import type { OpeningExpenseAutomationStatus } from "@/lib/opening-expense-status";

vi.mock("@/lib/api/client", () => ({
  apiClient: {
    get: vi.fn(),
  },
}));

const apiGet = apiClient.get as unknown as ReturnType<typeof vi.fn>;

const SUNUCU_MESAJI = "Açılış masraf talebi otomatik oluşturulmadı: dosya para birimi USD. Peşin harç hesaplanmadı.";

const durum = (override: Partial<OpeningExpenseAutomationStatus> = {}): OpeningExpenseAutomationStatus => ({
  caseId: "case-1",
  clientAssigned: true,
  openingRequestExists: false,
  activeExpenseRequestCount: 0,
  automaticCalculation: {
    calculable: false,
    reasonCode: "OPENING_EXPENSE_FX_BASIS_POLICY_MISSING",
    message: SUNUCU_MESAJI,
    requiredInfo: ["Peşin harç tutarı (TL)"],
    notCalculableItems: [{ itemCode: "PESIN_HARC", label: "Peşin Harç" }],
    caseCurrency: "USD",
    basisCurrencies: ["USD"],
    tariffCurrency: "TRY",
  },
  ...override,
});

describe("OpeningExpenseNotice", () => {
  // Gövde süslü parantezli: ok işlevi mock'u DÖNDÜRÜRSE vitest onu test sonu temizliği sayıp argümansız çağırır
  beforeEach(() => {
    apiGet.mockReset();
  });

  it("dövizli dosyada talep yokken: sunucunun nedeni ve gereken bilgi görünür; durum ucu dosya kimliğiyle sorgulanır", async () => {
    apiGet.mockResolvedValue({ data: durum() });
    render(<OpeningExpenseNotice caseId="case-1" />);

    const uyari = await screen.findByTestId("acilis-masraf-talebi-uyari");
    expect(uyari).toHaveTextContent(SUNUCU_MESAJI);
    expect(screen.getByTestId("acilis-masraf-talebi-gereken-bilgi")).toHaveTextContent("Gereken bilgi: Peşin harç tutarı (TL)");
    expect(apiGet).toHaveBeenCalledTimes(1);
    expect(apiGet).toHaveBeenCalledWith("/expense-requests/case/case-1/opening-status");
    // İstemci tutar üretmez: uyarıda rakam yok (sunucu metninde de yok)
    expect(uyari.textContent).not.toMatch(/\d/);
  });

  it.each([
    ["otomatik hesap yapılabiliyor", durum({ automaticCalculation: { calculable: true } })],
    ["açılış talebi var", durum({ openingRequestExists: true, activeExpenseRequestCount: 1 })],
    ["elle oluşturulmuş talep var", durum({ activeExpenseRequestCount: 1 })],
    ["müvekkil atanmamış", durum({ clientAssigned: false })],
  ])("%s → uyarı yok", async (_baslik, status) => {
    apiGet.mockResolvedValue({ data: status });
    const { container } = render(<OpeningExpenseNotice caseId="case-1" />);

    await waitFor(() => expect(apiGet).toHaveBeenCalledTimes(1));
    await Promise.resolve();
    expect(screen.queryByTestId("acilis-masraf-talebi-uyari")).toBeNull();
    expect(screen.queryByTestId("acilis-masraf-talebi-durum-okunamadi")).toBeNull();
    expect(container.textContent).toBe("");
  });

  it("durum okunamazsa bu açıkça yazılır (uyarı yokmuş gibi boş kalmaz)", async () => {
    apiGet.mockRejectedValue(new Error("ağ hatası"));
    render(<OpeningExpenseNotice caseId="case-1" />);

    expect(await screen.findByTestId("acilis-masraf-talebi-durum-okunamadi")).toHaveTextContent("Açılış masraf talebi durumu okunamadı.");
    expect(screen.queryByTestId("acilis-masraf-talebi-uyari")).toBeNull();
  });

  it("yenileme anahtarı değişince durum yeniden okunur; talep oluşmuşsa uyarı kalkar", async () => {
    apiGet.mockResolvedValueOnce({ data: durum() });
    const view = render(<OpeningExpenseNotice caseId="case-1" refreshKey={1} />);
    await screen.findByTestId("acilis-masraf-talebi-uyari");

    apiGet.mockResolvedValueOnce({ data: durum({ activeExpenseRequestCount: 1 }) });
    view.rerender(<OpeningExpenseNotice caseId="case-1" refreshKey={2} />);

    await waitFor(() => expect(screen.queryByTestId("acilis-masraf-talebi-uyari")).toBeNull());
    expect(apiGet).toHaveBeenCalledTimes(2);
  });
});
