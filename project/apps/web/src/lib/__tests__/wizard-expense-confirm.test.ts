import { describe, expect, it } from "vitest";
import { foreignCurrencyExpenseConfirmCopy, wizardDraftForeignCurrencies } from "../wizard-expense-confirm";

/**
 * Sihirbaz masraf penceresinin gönderim ÖNCESİ metni — taslakta TL dışı para birimi varken vaat verilmez.
 * İstemci hangi dosyada talep oluşmayacağına karar vermez; yalnız taslakta görünen para birimlerini betimler.
 */
describe("wizardDraftForeignCurrencies", () => {
  it("TL taslak: dosya, kalemler ve evrak TRY → boş", () => {
    expect(wizardDraftForeignCurrencies({ caseCurrency: "TRY", listedItemCurrencies: ["TRY", "TRY"], instrumentCurrencies: ["TRY"] })).toEqual([]);
    expect(wizardDraftForeignCurrencies({ caseCurrency: "TRY", listedItemCurrencies: [], instrumentCurrencies: [] })).toEqual([]);
  });

  it("dövizli dosya: dosya para birimi tek başına yeter", () => {
    expect(wizardDraftForeignCurrencies({ caseCurrency: "USD", listedItemCurrencies: [], instrumentCurrencies: [] })).toEqual(["USD"]);
    expect(wizardDraftForeignCurrencies({ caseCurrency: "EUR", listedItemCurrencies: ["EUR"], instrumentCurrencies: [] })).toEqual(["EUR"]);
  });

  it("karma taslak: dosya TRY olsa da listelenen kalemin ya da taranan evrakın para birimi görülür", () => {
    expect(wizardDraftForeignCurrencies({ caseCurrency: "TRY", listedItemCurrencies: ["TRY", "USD"], instrumentCurrencies: [] })).toEqual(["USD"]);
    expect(wizardDraftForeignCurrencies({ caseCurrency: "TRY", listedItemCurrencies: [], instrumentCurrencies: ["EUR"] })).toEqual(["EUR"]);
  });

  it("birden fazla para birimi: sıralı ve tekil; TRY listede yer almaz", () => {
    expect(
      wizardDraftForeignCurrencies({ caseCurrency: "USD", listedItemCurrencies: ["USD", "TRY", "GBP"], instrumentCurrencies: ["EUR", "GBP"] }),
    ).toEqual(["EUR", "GBP", "USD"]);
  });

  it("biçim: boşluk ve küçük harf normalize edilir; boş / tanımsız değer para birimi sayılmaz", () => {
    expect(
      wizardDraftForeignCurrencies({ caseCurrency: " usd ", listedItemCurrencies: ["try", "", null, undefined], instrumentCurrencies: [" Eur"] }),
    ).toEqual(["EUR", "USD"]);
    expect(wizardDraftForeignCurrencies({ caseCurrency: null, listedItemCurrencies: [null], instrumentCurrencies: [undefined] })).toEqual([]);
    expect(wizardDraftForeignCurrencies({ caseCurrency: "", listedItemCurrencies: [""], instrumentCurrencies: [] })).toEqual([]);
  });
});

describe("foreignCurrencyExpenseConfirmCopy", () => {
  it("TL taslak: null — pencere mevcut metniyle aynen gösterilir", () => {
    expect(foreignCurrencyExpenseConfirmCopy([])).toBeNull();
  });

  it("dövizli taslak: sonucu sunucunun belirleyeceğini söyler; e-posta talebin oluşmasına bağlanır", () => {
    expect(foreignCurrencyExpenseConfirmCopy(["USD"])).toEqual({
      message:
        "Takip oluşturulacak. Dosyada TL dışı para birimi var (USD); açılış masraf talebinin otomatik oluşturulup " +
        "oluşturulmayacağını sunucu belirler ve sonuç dosya oluşturulduktan sonra gösterilir. Talep oluşturulursa müvekkile " +
        "masraf talebi e-postası gönderilsin mi?",
      sendEmailLabel: "Oluştur (Talep Oluşursa Mail Gönder)",
    });
  });

  it("birden fazla para birimi metinde virgülle yazılır", () => {
    expect(foreignCurrencyExpenseConfirmCopy(["EUR", "USD"])?.message).toContain("Dosyada TL dışı para birimi var (EUR, USD);");
  });

  it("metin vaat de hüküm de içermez: ne 'hesaplanacak' ne de talebin oluşmayacağı söylenir", () => {
    const copy = foreignCurrencyExpenseConfirmCopy(["USD"])!;
    const text = `${copy.message} ${copy.sendEmailLabel}`;
    expect(text).not.toMatch(/hesaplanacak/);
    expect(text).not.toMatch(/Masraf Maili Gönder/);
    expect(text).not.toMatch(/oluşturulmayacak\b|oluşturulmaz\b|gönderilmeyecek|gönderilmez/);
    expect(copy.message).toContain("sunucu belirler");
    expect(copy.message).toContain("Talep oluşturulursa");
    expect(copy.sendEmailLabel).toContain("Talep Oluşursa");
  });
});
