/**
 * Sihirbaz — masraf penceresinin gönderim ÖNCESİ metni (taslakta TL dışı para birimi varken).
 *
 * Otomatik açılış masraf talebinin oluşturulup oluşturulmayacağına SUNUCU karar verir; karar dosya açıldıktan sonra
 * bildirilir (bkz. lib/opening-expense-status). Taslakta TL dışı para birimi varken pencere "açılış masrafları
 * hesaplanacak" / "masraf maili gönder" vaadini VERMEZ: sonucu sunucunun belirleyeceğini ve dosya oluşturulduktan sonra
 * gösterileceğini söyler. Buradaki yardımcılar hesap yapmaz, kur ya da tutar önermez ve hangi dosyada talep
 * oluşmayacağına karar vermez; yalnız taslakta GÖRÜNEN para birimlerini betimler. TL taslakta pencere mevcut metniyle
 * aynen gösterilir.
 */

const TARIFF_CURRENCY = "TRY";

const currencyCode = (value: unknown): string => (typeof value === "string" ? value.trim().toUpperCase() : "");

export interface WizardDraftCurrencies {
  /** Dosya para birimi (caseData.currency). */
  caseCurrency?: string | null;
  /** Listelenen alacak kalemlerinin para birimleri. */
  listedItemCurrencies: readonly (string | null | undefined)[];
  /** Taramadan gelen evrak kayıtlarının para birimleri. */
  instrumentCurrencies: readonly (string | null | undefined)[];
}

/** Taslakta görünen TL dışı para birimleri: dosya + listelenen kalemler + taranan evrak (sıralı, tekil). */
export function wizardDraftForeignCurrencies(draft: WizardDraftCurrencies): string[] {
  const codes = [draft.caseCurrency, ...draft.listedItemCurrencies, ...draft.instrumentCurrencies]
    .map(currencyCode)
    .filter((code) => code !== "" && code !== TARIFF_CURRENCY);
  return [...new Set(codes)].sort();
}

export interface ExpenseConfirmCopy {
  message: string;
  sendEmailLabel: string;
}

/** Taslakta TL dışı para birimi varken masraf penceresinin vaat içermeyen metni; TL taslakta null (mevcut metin aynen). */
export function foreignCurrencyExpenseConfirmCopy(foreignCurrencies: readonly string[]): ExpenseConfirmCopy | null {
  if (foreignCurrencies.length === 0) return null;
  return {
    message:
      `Takip oluşturulacak. Dosyada TL dışı para birimi var (${foreignCurrencies.join(", ")}); açılış masraf talebinin ` +
      "otomatik oluşturulup oluşturulmayacağını sunucu belirler ve sonuç dosya oluşturulduktan sonra gösterilir. " +
      "Talep oluşturulursa müvekkile masraf talebi e-postası gönderilsin mi?",
    sendEmailLabel: "Oluştur (Talep Oluşursa Mail Gönder)",
  };
}
