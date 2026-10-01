import { describe, expect, it } from "vitest";
import {
  describeOpeningExpenseOutcome,
  openingExpenseNoticeOf,
  type OpeningExpenseAutomationStatus,
  type OpeningExpenseNotCalculable,
  type OpeningExpenseNotCreatedOutcome,
} from "../opening-expense-status";

/**
 * Otomatik açılış masraf talebi "oluşturulmadı" sonucu — gösterim yardımcıları.
 * İstemci yalnız sunucunun kararını ve metnini gösterir; hesap yapmaz, kur ya da tutar önermez.
 */
const SUNUCU_MESAJI =
  "Açılış masraf talebi otomatik oluşturulmadı: dosya para birimi USD. Peşin harç TL tarifesindeki oranla hesaplanır; alacağın TL " +
  "karşılığı için kullanılacak kur (tarih ve tür) sistemde tanımlı değildir. Peşin harç hesaplanmadı, tutar çevrilmedi " +
  "ve eksik tutarla talep oluşturulmadı. Masraf talebi, kalemler elle girilerek oluşturulabilir.";

const hesaplanamaz: OpeningExpenseNotCalculable = {
  calculable: false,
  reasonCode: "OPENING_EXPENSE_FX_BASIS_POLICY_MISSING",
  message: SUNUCU_MESAJI,
  requiredInfo: ["Peşin harç tutarı (TL)"],
  notCalculableItems: [{ itemCode: "PESIN_HARC", label: "Peşin Harç" }],
  caseCurrency: "USD",
  basisCurrencies: ["USD"],
  tariffCurrency: "TRY",
};

const sonuc = (override: Partial<OpeningExpenseNotCreatedOutcome> = {}): OpeningExpenseNotCreatedOutcome => {
  const { calculable: _calculable, ...neden } = hesaplanamaz;
  return { status: "NOT_CREATED", ...neden, expenseEmailRequested: false, expenseEmailSent: false, ...override };
};

const durum = (override: Partial<OpeningExpenseAutomationStatus> = {}): OpeningExpenseAutomationStatus => ({
  caseId: "case-1",
  clientAssigned: true,
  openingRequestExists: false,
  activeExpenseRequestCount: 0,
  automaticCalculation: hesaplanamaz,
  ...override,
});

describe("describeOpeningExpenseOutcome (dosya açılış yanıtı)", () => {
  it("sonuç alanı yoksa (talep oluşturuldu / TL dosya / eski sunucu) mesaj üretmez", () => {
    expect(describeOpeningExpenseOutcome(undefined)).toBeNull();
    expect(describeOpeningExpenseOutcome(null)).toBeNull();
    expect(describeOpeningExpenseOutcome({ ...sonuc(), status: "CREATED" as never })).toBeNull();
  });

  it("oluşturulmadı: sunucunun nedeni ve gereken bilgi aynen yazılır; dosyanın oluşturulduğu açıktır", () => {
    const metin = describeOpeningExpenseOutcome(sonuc());

    expect(metin).toBe(`Dosya oluşturuldu. ${SUNUCU_MESAJI} Gereken bilgi: Peşin harç tutarı (TL).`);
    // İstemci tutar ya da kur ÖNERMEZ: sayı yalnız sunucu metninde olabilir (burada yok)
    expect(metin).not.toMatch(/\d/);
  });

  it("masraf e-postası istenmişse gönderilmediği ayrıca söylenir", () => {
    expect(describeOpeningExpenseOutcome(sonuc({ expenseEmailRequested: true }))).toContain("Masraf e-postası GÖNDERİLMEDİ.");
    expect(describeOpeningExpenseOutcome(sonuc({ expenseEmailRequested: false }))).not.toContain("e-postası");
  });

  it("sunucu mesajı boşsa gerekçe kodu yazılır (boş uyarı gösterilmez)", () => {
    expect(describeOpeningExpenseOutcome(sonuc({ message: "", requiredInfo: [] }))).toBe(
      "Dosya oluşturuldu. OPENING_EXPENSE_FX_BASIS_POLICY_MISSING",
    );
  });
});

describe("openingExpenseNoticeOf (dosya sayfası kalıcı uyarı)", () => {
  it("müvekkilli dosyada hiç talep yokken ve otomatik hesap yapılamıyorken uyarı vardır (sunucu metni)", () => {
    expect(openingExpenseNoticeOf(durum())).toEqual({ message: SUNUCU_MESAJI, requiredInfo: ["Peşin harç tutarı (TL)"] });
  });

  it.each([
    ["durum okunmadı", null],
    ["otomatik hesap yapılabiliyor (TL dosya)", durum({ automaticCalculation: { calculable: true } })],
    ["açılış talebi var (geçmiş kayıt dahil)", durum({ openingRequestExists: true, activeExpenseRequestCount: 1 })],
    ["elle oluşturulmuş talep var", durum({ activeExpenseRequestCount: 1 })],
    ["müvekkil atanmamış (talep zaten oluşturulamaz)", durum({ clientAssigned: false })],
    ["tanınmayan yanıt biçimi", { caseId: "case-1" } as unknown as OpeningExpenseAutomationStatus],
  ])("%s → uyarı yok", (_baslik, status) => {
    expect(openingExpenseNoticeOf(status)).toBeNull();
  });
});
