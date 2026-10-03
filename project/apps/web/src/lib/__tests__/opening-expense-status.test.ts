import { describe, expect, it } from "vitest";
import {
  describeOpeningExpenseOutcome,
  openingExpenseEmailNoticeOf,
  openingExpenseNoticeOf,
  type OpeningExpenseAutomationStatus,
  type OpeningExpenseEmailNotSentStatus,
  type OpeningExpenseEmailOutcome,
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

/**
 * Talep oluştu ama istenen masraf e-postası gönderilemedi — neden ve metin sunucudandır; istemci neden üretmez.
 * E-posta gönderildiyse sunucu alan göndermez: hiçbir metin çıkmaz.
 */
const EPOSTA_NEDENI =
  "Büroda varsayılan banka hesabı tanımlı değil; ödeme yapılacak hesap bildirilemediği için masraf e-postası gönderilmedi. " +
  "Bu e-posta kendiliğinden yeniden gönderilmez.";
const EPOSTA_GEREKEN = ["Büro Ayarları → Banka Hesapları: tek bir varsayılan hesap"];

const epostaSonucu = (override: Partial<OpeningExpenseEmailOutcome> = {}): OpeningExpenseEmailOutcome => ({
  status: "EMAIL_NOT_SENT",
  reasonCode: "PAYMENT_ACCOUNT_MISSING",
  message: EPOSTA_NEDENI,
  requiredInfo: EPOSTA_GEREKEN,
  expenseEmailRequested: true,
  expenseEmailSent: false,
  ...override,
});

const epostaDurumu = (override: Partial<OpeningExpenseEmailNotSentStatus> = {}): OpeningExpenseEmailNotSentStatus => ({
  status: "NOT_SENT",
  reasonCode: "PAYMENT_ACCOUNT_MISSING",
  message: EPOSTA_NEDENI,
  requiredInfo: EPOSTA_GEREKEN,
  attemptedAt: "2026-10-01T20:09:04.000Z",
  ...override,
});

/** TL dosya: talep oluşmuş, otomatik hesap yapılabiliyor. */
const talepVar = (override: Partial<OpeningExpenseAutomationStatus> = {}): OpeningExpenseAutomationStatus =>
  durum({ openingRequestExists: true, activeExpenseRequestCount: 1, automaticCalculation: { calculable: true }, ...override });

describe("describeOpeningExpenseOutcome — masraf e-postası gönderilemedi (dosya açılış yanıtı)", () => {
  it("gönderilemedi: dosyanın oluşturulduğu, sunucunun nedeni ve gereken bilgi aynen yazılır", () => {
    expect(describeOpeningExpenseOutcome(epostaSonucu())).toBe(
      `Dosya oluşturuldu. ${EPOSTA_NEDENI} Gereken bilgi: Büro Ayarları → Banka Hesapları: tek bir varsayılan hesap.`,
    );
  });

  it("gereken bilgi yoksa yalnız neden yazılır", () => {
    expect(describeOpeningExpenseOutcome(epostaSonucu({ reasonCode: "DELIVERY_NOT_CONFIRMED", message: "Masraf e-postasının gönderildiği doğrulanamadı.", requiredInfo: [] }))).toBe(
      "Dosya oluşturuldu. Masraf e-postasının gönderildiği doğrulanamadı.",
    );
  });

  it("sonuç süresinde belli olmadıysa sunucunun metni yazılır; istemci 'gönderilmedi' demez", () => {
    const metin = describeOpeningExpenseOutcome(
      epostaSonucu({ status: "EMAIL_RESULT_PENDING", reasonCode: "RESULT_PENDING", message: "Masraf e-postasının sonucu henüz belli değil.", requiredInfo: [] }),
    );

    expect(metin).toBe("Dosya oluşturuldu. Masraf e-postasının sonucu henüz belli değil.");
    expect(metin).not.toMatch(/GÖNDERİLMEDİ|gönderilmedi/);
  });

  it("sunucu mesajı boşsa neden kodu yazılır (boş uyarı gösterilmez)", () => {
    expect(describeOpeningExpenseOutcome(epostaSonucu({ message: "", requiredInfo: [] }))).toBe("Dosya oluşturuldu. PAYMENT_ACCOUNT_MISSING");
  });

  it("'oluşturulmadı' sonucunun metni DEĞİŞMEZ (dövizli dosya)", () => {
    expect(describeOpeningExpenseOutcome(sonuc({ expenseEmailRequested: true }))).toBe(
      `Dosya oluşturuldu. ${SUNUCU_MESAJI} Gereken bilgi: Peşin harç tutarı (TL). Masraf e-postası GÖNDERİLMEDİ.`,
    );
  });
});

describe("openingExpenseEmailNoticeOf (dosya sayfası kalıcı uyarı)", () => {
  it("sunucu e-postanın gönderilemediğini bildiriyorsa neden ve gereken bilgi aynen döner", () => {
    expect(openingExpenseEmailNoticeOf(talepVar({ openingRequestEmail: epostaDurumu() }))).toEqual({ message: EPOSTA_NEDENI, requiredInfo: EPOSTA_GEREKEN });
  });

  it("gereken bilgi alanı yoksa boş liste döner; mesaj boşsa neden kodu gösterilir", () => {
    const eksik = { ...epostaDurumu(), requiredInfo: undefined } as unknown as OpeningExpenseEmailNotSentStatus;

    expect(openingExpenseEmailNoticeOf(talepVar({ openingRequestEmail: eksik }))).toEqual({ message: EPOSTA_NEDENI, requiredInfo: [] });
    expect(openingExpenseEmailNoticeOf(talepVar({ openingRequestEmail: epostaDurumu({ message: "" }) }))).toEqual({
      message: "PAYMENT_ACCOUNT_MISSING",
      requiredInfo: EPOSTA_GEREKEN,
    });
  });

  it.each([
    ["durum okunmadı", null],
    ["alan yok (e-posta gönderildi / hiç istenmedi / talep yok)", talepVar()],
    ["tanınmayan durum değeri", talepVar({ openingRequestEmail: { ...epostaDurumu(), status: "SENT" as never } })],
    ["mesaj da neden kodu da boş", talepVar({ openingRequestEmail: epostaDurumu({ message: "", reasonCode: "" }) })],
  ])("%s → uyarı yok", (_baslik, status) => {
    expect(openingExpenseEmailNoticeOf(status)).toBeNull();
  });

  it("'otomatik oluşturulmadı' uyarısından bağımsızdır: e-posta alanı o uyarıyı üretmez", () => {
    expect(openingExpenseNoticeOf(talepVar({ openingRequestEmail: epostaDurumu() }))).toBeNull();
    expect(openingExpenseEmailNoticeOf(durum())).toBeNull();
  });
});
