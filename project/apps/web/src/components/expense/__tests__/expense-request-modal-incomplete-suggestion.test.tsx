/**
 * Masraf talebi penceresi (paket modu) — dövizli / karma dosyada EKSİK paket önerisi.
 *
 * Ölçülen kusur: paket önerisi peşin harcı dosya anaparasının SAYISINA para birimine bakmadan uyguluyordu; 1.000.000 USD
 * dosyada pencere "Peşin Harç 5.000 ₺ / Toplam 5.857,9 ₺" ile dolu açılıyor, "Oluştur" bunu PENDING talep + muhasebe
 * günlüğü olarak kaydediyordu.
 *
 * Kural (owner ara kararı 2026-10-01): yanlış tutarlı otomatik masraf tutarı kesinleşmiş gibi sunulmaz; eksik tutar 0
 * sayılmaz; sessizce atlanmaz — neden ve gereken bilgi gösterilir. Karar ve metin SUNUCUDANDIR (POST
 * /cost-packages/compute → `incompleteSuggestion`); istemci oranlı kalemi hesaplamaz, kur ya da tutar önermez. TL dosyada
 * pencere AYNEN kalır. Yalnız ağ katmanı (`@/lib/api`) taklit edilir.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { ExpenseRequestModal } from "../ExpenseRequestModal";
import { api } from "@/lib/api";

vi.mock("@/lib/api", () => ({
  api: {
    getCostPackages: vi.fn(),
    getExpenseCatalog: vi.fn(),
    computeExpenseRequest: vi.fn(),
    createExpenseRequestFromPackage: vi.fn(),
    createExpenseRequest: vi.fn(),
    sendExpenseRequest: vi.fn(),
  },
}));

const mocked = api as unknown as Record<
  "getCostPackages" | "getExpenseCatalog" | "computeExpenseRequest" | "createExpenseRequestFromPackage" | "createExpenseRequest" | "sendExpenseRequest",
  ReturnType<typeof vi.fn>
>;

const OPENING = "UYAP_PRE";
const SEIZURE = "HACIZ";
const PACKAGES = [
  { code: OPENING, name: "UYAP Öncesi / Takip Açılış Masrafları", description: "Açılış masrafları", items: [] },
  { code: SEIZURE, name: "Haciz İşlemi Masrafları", items: [] },
];

const item = (itemCode: string, label: string, amount: number, sortOrder: number, isEditable = false) => ({
  itemCode,
  label,
  suggestedAmount: amount,
  finalAmount: amount,
  isEditable,
  sortOrder,
});

const FIXED_ITEMS = [
  item("BASVURMA_HARCI", "Başvurma Harcı", 615.4, 1),
  item("VEKALET_HARCI", "Vekalet Harcı", 87.5, 2),
  item("DOSYA_GIDERI", "Dosya Gideri", 2, 4),
  item("TEBLIGAT_GIDERI", "Tebligat Gideri", 15, 5, true),
  item("VEKALET_PULU", "Vekalet Pulu", 138, 6),
];
const PESIN_HARC = item("PESIN_HARC", "Peşin Harç", 5000, 3, true);

/** TL dosya: sunucunun bugünkü yanıtı (eksik öneri alanı YOK). */
const TL_SUGGESTION = {
  packageCode: OPENING,
  packageName: "UYAP Öncesi / Takip Açılış Masrafları",
  items: [...FIXED_ITEMS.slice(0, 2), PESIN_HARC, ...FIXED_ITEMS.slice(2)],
  totalSuggested: 5857.9,
  messageTemplateCode: "TPL_UYAP_PRE",
};

const SUNUCU_MESAJI =
  "UYAP Öncesi / Takip Açılış Masrafları paketinin önerisi eksik: dosya para birimi USD. Peşin Harç hesaplanmadı, tutar çevrilmedi.";

/** Dövizli dosya: peşin harç kalem listesinde yok; neden ve gereken bilgi `incompleteSuggestion` içinde. */
const USD_SUGGESTION = {
  packageCode: OPENING,
  packageName: "UYAP Öncesi / Takip Açılış Masrafları",
  items: FIXED_ITEMS,
  totalSuggested: 857.9,
  messageTemplateCode: "TPL_UYAP_PRE",
  incompleteSuggestion: {
    reasonCode: "COST_PACKAGE_FX_BASIS_POLICY_MISSING",
    message: SUNUCU_MESAJI,
    requiredInfo: ["Peşin Harç tutarı (TL)"],
    notCalculableItems: [{ itemCode: "PESIN_HARC", label: "Peşin Harç", isEditable: true, sortOrder: 3 }],
    caseCurrency: "USD",
    basisCurrencies: ["USD"],
    tariffCurrency: "TRY",
  },
};

const SEIZURE_SUGGESTION = {
  packageCode: SEIZURE,
  packageName: "Haciz İşlemi Masrafları",
  items: [item("HACIZ_HARCI", "Haciz Harcı", 500, 1, true), item("HACIZ_YOLLUK", "Haciz Yolluk Gideri", 350, 2, true)],
  totalSuggested: 850,
  messageTemplateCode: null,
};

const renderModal = (initialPackageCode: string = OPENING) =>
  render(
    <ExpenseRequestModal
      isOpen
      onClose={() => undefined}
      caseId="case-1"
      clientId="client-1"
      clientName="Müvekkil A.Ş."
      caseFileNumber="2026/1"
      initialPackageCode={initialPackageCode}
    />,
  );

const submitButton = () => screen.getByRole("button", { name: "Oluştur" });
/** Paket kalemi satırlarındaki tutar girişleri (son ödeme tarihi vb. diğer girişler hariç). */
const amountInputs = () => screen.getAllByRole("spinbutton") as HTMLInputElement[];
const totalBox = () => screen.getByText("Toplam Tutar").closest("div")!.parentElement as HTMLElement;

describe("ExpenseRequestModal — paket önerisi", () => {
  let alertSpy: ReturnType<typeof vi.spyOn>;

  // Gövde süslü parantezli: ok işlevi mock'u DÖNDÜRÜRSE vitest onu test sonu temizliği sayıp argümansız çağırır
  beforeEach(() => {
    for (const fn of Object.values(mocked)) fn.mockReset();
    mocked.getCostPackages.mockResolvedValue(PACKAGES);
    mocked.getExpenseCatalog.mockResolvedValue([]);
    mocked.createExpenseRequestFromPackage.mockResolvedValue({ id: "talep-1" });
    mocked.createExpenseRequest.mockResolvedValue({ id: "talep-2" });
    alertSpy = vi.spyOn(window, "alert").mockImplementation(() => undefined);
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("TL dosya (kontrol): pencere aynen", () => {
    beforeEach(() => {
      mocked.computeExpenseRequest.mockResolvedValue(TL_SUGGESTION);
    });

    it("altı kalem tutarıyla dolu gelir, toplam paket toplamıdır; eksik öneri uyarısı yoktur", async () => {
      renderModal();

      await screen.findByText("Peşin Harç");
      expect(amountInputs().map((input) => input.value)).toEqual(["615.4", "87.5", "5000", "2", "15", "138"]);
      expect(totalBox()).toHaveTextContent("Toplam Tutar5.857,9 ₺");
      expect(screen.queryByTestId("paket-oneri-eksik")).toBeNull();
      expect(screen.queryByTestId("paket-kalem-hesaplanamadi")).toBeNull();
      expect(screen.queryByTestId("masraf-toplam-gosterilemez")).toBeNull();
      expect(screen.queryByTestId("masraf-toplam-belirli-kalemler")).toBeNull();
      expect(submitButton()).toBeEnabled();
    });

    it('"Oluştur": altı kalem bugünkü gövdeyle kaydedilir', async () => {
      renderModal();
      await screen.findByText("Peşin Harç");

      fireEvent.click(submitButton());

      await waitFor(() => expect(mocked.createExpenseRequestFromPackage).toHaveBeenCalledTimes(1));
      const payload = mocked.createExpenseRequestFromPackage.mock.calls[0][0];
      expect(payload).toMatchObject({ caseId: "case-1", clientId: "client-1", packageCode: OPENING, sendEmail: false, paidByLawyer: false });
      expect(payload.items).toEqual(
        TL_SUGGESTION.items.map((entry) => ({
          itemCode: entry.itemCode,
          label: entry.label,
          suggestedAmount: entry.suggestedAmount,
          finalAmount: entry.finalAmount,
          wasOverridden: false,
        })),
      );
    });
  });

  describe("dövizli dosya: sunucu peşin harç için tutar üretmedi", () => {
    beforeEach(() => {
      mocked.computeExpenseRequest.mockResolvedValue(USD_SUGGESTION);
    });

    it("öneri, eksik sonucu gösterebildiği beyan edilerek istenir", async () => {
      renderModal();
      await screen.findByTestId("paket-oneri-eksik");

      expect(mocked.computeExpenseRequest).toHaveBeenCalledTimes(1);
      expect(mocked.computeExpenseRequest).toHaveBeenCalledWith("case-1", OPENING, { acceptIncomplete: true });
    });

    it("peşin harç satırı TUTARSIZ görünür: giriş alanı yok, 0 yok, uydurma tutar yok; diğer kalemler tutarıyla aynen", async () => {
      renderModal();

      const missing = await screen.findByTestId("paket-kalem-hesaplanamadi");
      expect(missing).toHaveTextContent("Peşin Harç");
      expect(missing).toHaveTextContent("Tutar yok — hesaplanamadı (sıfır değildir)");
      expect(missing).toHaveTextContent("HESAPLANAMADI");
      expect(within(missing).queryByRole("spinbutton")).toBeNull();
      expect(missing.textContent).not.toMatch(/\d/);
      // Tutarı olan kalemler: yalnız sunucunun gönderdiği beş kalem
      expect(amountInputs().map((input) => input.value)).toEqual(["615.4", "87.5", "2", "15", "138"]);
      expect(document.body.textContent).not.toMatch(/5\.000|5\.857/);
    });

    it("neden ve gereken bilgi SUNUCU metniyle görünür; sonraki adım söylenir", async () => {
      renderModal();

      const notice = await screen.findByTestId("paket-oneri-eksik");
      expect(notice).toHaveTextContent(SUNUCU_MESAJI);
      expect(screen.getByTestId("paket-oneri-gereken-bilgi")).toHaveTextContent("Gereken bilgi: Peşin Harç tutarı (TL)");
      expect(screen.getByTestId("paket-oneri-sonraki-adim")).toHaveTextContent(
        "Öneri eksik olduğu için bu paketten talep oluşturma kapalıdır. Kalemleri elle girmek için “Manuel Giriş”i kullanın.",
      );
    });

    it("TOPLAM gösterilmez: eldeki kalemlerin toplamı paket toplamı gibi sunulmaz, ayrıca ve adıyla yazılır", async () => {
      renderModal();
      await screen.findByTestId("paket-oneri-eksik");

      expect(screen.getByTestId("masraf-toplam-gosterilemez")).toHaveTextContent("gösterilemez");
      expect(screen.getByTestId("masraf-toplam-belirli-kalemler")).toHaveTextContent("Tutarı belirli kalemler: 857,9 ₺ (Peşin Harç dahil değil)");
      expect(totalBox()).toHaveTextContent("Toplam TutarTutarı belirli kalemler: 857,9 ₺ (Peşin Harç dahil değil)gösterilemez");
    });

    it('KAYIT: "Oluştur" kapalıdır; eksik paket talebi (peşin harçsız ya da 0 tutarlı) gönderilmez', async () => {
      renderModal();
      await screen.findByTestId("paket-oneri-eksik");

      expect(submitButton()).toBeDisabled();
      fireEvent.click(submitButton());
      // Düzenlenebilir kalemin tutarını değiştirmek de kaydı açmaz
      fireEvent.change(amountInputs()[3], { target: { value: "45" } });
      expect(screen.getByTestId("masraf-toplam-belirli-kalemler")).toHaveTextContent("Tutarı belirli kalemler: 887,9 ₺ (Peşin Harç dahil değil)");
      // Eksik önerinin "öneri toplamı" da yoktur: eldeki kalemlerin önerisi paket önerisi gibi yazılmaz
      expect(totalBox()).not.toHaveTextContent("Öneri:");
      expect(submitButton()).toBeDisabled();
      fireEvent.click(submitButton());

      expect(mocked.createExpenseRequestFromPackage).not.toHaveBeenCalled();
      expect(mocked.createExpenseRequest).not.toHaveBeenCalled();
    });

    it("Manuel Giriş etkilenmez: eksik öneri uyarısı ve toplam kısıtı elle giriş modunda yoktur", async () => {
      renderModal();
      await screen.findByTestId("paket-oneri-eksik");

      fireEvent.click(screen.getByRole("button", { name: /Manuel Giriş/ }));

      expect(screen.queryByTestId("paket-oneri-eksik")).toBeNull();
      expect(screen.queryByTestId("paket-kalem-hesaplanamadi")).toBeNull();
      expect(screen.queryByTestId("masraf-toplam-gosterilemez")).toBeNull();
      expect(totalBox()).toHaveTextContent("Toplam Tutar0 ₺");
    });

    it("oranlı kalemi olmayan pakete geçilince: eksik öneri durumu kalkar, pencere bugünkü gibi çalışır", async () => {
      mocked.computeExpenseRequest.mockImplementation(async (_caseId: string, packageCode: string) =>
        packageCode === SEIZURE ? SEIZURE_SUGGESTION : USD_SUGGESTION,
      );
      renderModal();
      await screen.findByTestId("paket-oneri-eksik");

      fireEvent.change(screen.getByRole("combobox"), { target: { value: SEIZURE } });

      await screen.findByText("Haciz Harcı");
      expect(screen.queryByTestId("paket-oneri-eksik")).toBeNull();
      expect(screen.queryByTestId("paket-kalem-hesaplanamadi")).toBeNull();
      expect(amountInputs().map((input) => input.value)).toEqual(["500", "350"]);
      expect(totalBox()).toHaveTextContent("Toplam Tutar850 ₺");
      expect(submitButton()).toBeEnabled();
    });

    it("başka pakete geçilirken öneri alınamazsa: önceki paketin eksik öneri uyarısı yeni paketinmiş gibi kalmaz", async () => {
      mocked.computeExpenseRequest.mockImplementation(async (_caseId: string, packageCode: string) => {
        if (packageCode === SEIZURE) throw new Error("Sunucu hatası");
        return USD_SUGGESTION;
      });
      renderModal();
      await screen.findByTestId("paket-oneri-eksik");

      fireEvent.change(screen.getByRole("combobox"), { target: { value: SEIZURE } });

      await screen.findByText("Kalem bulunamadı");
      expect(screen.queryByTestId("paket-oneri-eksik")).toBeNull();
      expect(screen.queryByTestId("paket-kalem-hesaplanamadi")).toBeNull();
      expect(screen.queryByTestId("masraf-toplam-gosterilemez")).toBeNull();
      expect(totalBox()).toHaveTextContent("Toplam Tutar0 ₺");
      expect(submitButton()).toBeDisabled();
    });

    it("ELLE GİRİŞ YOLU KULLANILABİLİR: eksik pakette Manuel Giriş'e geçilir, katalogdan Peşin Harç seçilip tutar girilir, talep girilen tutarla kaydedilir", async () => {
      mocked.getExpenseCatalog.mockResolvedValue([
        { code: "BASVURMA_HARCI", officeLabel: "Başvurma Harcı", clientLabel: "Başvurma harcı", group: "ICRA_TAKIP", manualDescriptionRequired: false },
        { code: "PESIN_HARC", officeLabel: "Peşin Harç", clientLabel: "Peşin harç", group: "ICRA_TAKIP", manualDescriptionRequired: false },
      ]);
      renderModal();
      await screen.findByTestId("paket-oneri-eksik");

      fireEvent.click(screen.getByRole("button", { name: /Manuel Giriş/ }));
      // Katalog yüklenince kalem türü seçilebilir (seçenekler katalogdan gelir)
      const kalemTuru = (await screen.findByRole("option", { name: "Peşin Harç" })).closest("select") as HTMLSelectElement;
      fireEvent.change(kalemTuru, { target: { value: "PESIN_HARC" } });
      fireEvent.change(screen.getAllByRole("spinbutton")[0], { target: { value: "2150" } });
      expect(totalBox()).toHaveTextContent("Toplam Tutar2.150 ₺");
      expect(submitButton()).toBeEnabled();

      fireEvent.click(submitButton());

      await waitFor(() => expect(mocked.createExpenseRequest).toHaveBeenCalledTimes(1));
      expect(mocked.createExpenseRequest.mock.calls[0][0]).toMatchObject({
        caseId: "case-1",
        clientId: "client-1",
        items: [{ type: "PESIN_HARC", description: "Peşin Harç", amount: 2150 }],
      });
      // Paket yolundan kayıt hiç denenmedi
      expect(mocked.createExpenseRequestFromPackage).not.toHaveBeenCalled();
    });

    it("elle girişle talep kaydedildikten sonra: eksik öneri durumu paket seçilmemiş pencereye taşınmaz", async () => {
      renderModal();
      await screen.findByTestId("paket-oneri-eksik");
      fireEvent.click(screen.getByRole("button", { name: /Manuel Giriş/ }));
      fireEvent.change(screen.getAllByRole("spinbutton")[0], { target: { value: "150" } });

      fireEvent.click(submitButton());

      await waitFor(() => expect(mocked.createExpenseRequest).toHaveBeenCalledTimes(1));
      expect(mocked.createExpenseRequest.mock.calls[0][0]).toMatchObject({
        caseId: "case-1",
        clientId: "client-1",
        items: [{ type: "TEBLIGAT_GIDERI", description: "Tebligat gönderim gideri", amount: 150 }],
      });
      // Kayıt sonrası form sıfırlanır; pencere yeniden paket moduna alınınca (paket seçili değil) eski uyarı görünmez
      await waitFor(() => expect((screen.getAllByRole("spinbutton")[0] as HTMLInputElement).value).toBe(""));
      fireEvent.click(screen.getByRole("button", { name: /Paket Seç/ }));

      expect((screen.getByRole("combobox") as HTMLSelectElement).value).toBe("");
      expect(screen.queryByTestId("paket-oneri-eksik")).toBeNull();
      expect(screen.queryByTestId("paket-kalem-hesaplanamadi")).toBeNull();
      expect(screen.queryByTestId("masraf-toplam-gosterilemez")).toBeNull();
    });
  });

  it("yalnız oranlı kalemden oluşan pakette: tutarı olan kalem yokken de eksik kalem ve neden görünür", async () => {
    mocked.computeExpenseRequest.mockResolvedValue({ ...USD_SUGGESTION, items: [], totalSuggested: 0 });
    renderModal();

    expect(await screen.findByTestId("paket-kalem-hesaplanamadi")).toHaveTextContent("Peşin Harç");
    expect(screen.getByTestId("paket-oneri-eksik")).toHaveTextContent(SUNUCU_MESAJI);
    expect(screen.queryByText("Kalem bulunamadı")).toBeNull();
    expect(screen.queryAllByRole("spinbutton")).toHaveLength(0);
    expect(submitButton()).toBeDisabled();
  });

  it("paket değişirken öneri alınamazsa: önceki paketin kalemleri yeni paketin önerisi gibi kalmaz ve kaydedilemez", async () => {
    mocked.computeExpenseRequest.mockImplementation(async (_caseId: string, packageCode: string) => {
      if (packageCode === SEIZURE) throw new Error("Sunucu hatası");
      return TL_SUGGESTION;
    });
    renderModal();
    await screen.findByText("Peşin Harç");

    fireEvent.change(screen.getByRole("combobox"), { target: { value: SEIZURE } });

    await screen.findByText("Kalem bulunamadı");
    expect(alertSpy).toHaveBeenCalledWith("Masraf hesaplama hatası: Sunucu hatası");
    expect(screen.queryByText("Peşin Harç")).toBeNull();
    expect(screen.queryAllByRole("spinbutton")).toHaveLength(0);
    expect(totalBox()).toHaveTextContent("Toplam Tutar0 ₺");
    expect(submitButton()).toBeDisabled();
  });
});
