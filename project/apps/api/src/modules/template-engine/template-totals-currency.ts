/**
 * Belge şablonu toplamları — PARA BİRİMİ BAĞLAMI ve resmî çıktı ret kapısının karar mantığı.
 *
 * Ölçülen kusur (main 6681b1d5, gerçek HTTP + disposable PostgreSQL): dosya kaydından üretilen belgelerde toplam, alacak
 * kalemlerinin tutarı para birimine bakılmadan toplanarak bulunuyor ve DOSYA para birimiyle etiketleniyor. USD dosyada
 * 10.000 USD + 5.000 EUR + 2.000 TRY anapara → takip talebi / ödeme emri / icra emri / Word / PDF "17.000,00 $", XML
 * `<Total>17000</Total><Currency>USD</Currency>`; aynı kalemler TRY dosyada "17.000,00 TL". Kalemleri TRY kayıtlı USD
 * dosyada satırlar "TL", toplam "10.250,00 $". Dava dilekçeleri tutarı sabit "TL" ile yazıyor (USD dosyada "10.250 TL").
 *
 * OWNER KARARI (2026-10-03, "KARMA PARA BİRİMLİ BELGE: B"): yanlış tek toplam üreten resmî çıktı akışı REDDEDİLİR; format
 * (PDF / Word / XML / UDF / metin / merkezi uç) seçerek atlanamaz; hata belgenin neden üretilemediğini söyler. Bu GEÇİCİ
 * korumadır — para birimi bazında doğru resmî belge tasarımının tamamlandığı anlamına GELMEZ; kur / çevirme yoktur.
 * Tek para birimli geçerli akışlar (TL ve dövizli) bayt bayt aynı kalır.
 *
 * Bu yardımcı belge METNİNİ DEĞİŞTİRMEZ, tutar ÇEVİRMEZ ve para birimleri arasında toplama YAPMAZ. Yalnız şunu bildirir:
 * belgeye basılacak toplam (tutar + para birimi etiketi) geçerli tek tutar mıdır; değilse para birimi bazında toplamlar
 * nedir? Karar `toplamGosterilebilir`dir.
 *
 * Dayanak: RECEIVABLE-GOVERNANCE REC-ALLOC-008 (çapraz para birimi toplamı ve çevirme yapılmaz; eksik para birimi
 * bağlamı 0 değildir), REC-FX-001 / REC-FX-002 (yetkili kur sözleşmesi olmadan çevirme yok), §15.2 (şablon ayrı bakiye
 * üretemez).
 */
import { computeTemplateTotals, type TemplateTotals } from './template-case-classification';

/** Belgeye giren kalemden okunan alanlar (belgenin kalem satırında basılan değerler). */
export interface TemplateTotalsCurrencyItem {
  readonly type: string;
  readonly amount: number;
  /** Kalem satırında basılan para birimi; boşsa kalemin para birimi BİLİNMİYOR sayılır. */
  readonly currency?: string | null;
}

/** Belgenin toplamı hangi para birimiyle etiketlediği. */
export type TemplateTotalsLabelSource =
  | 'DOSYA_PARA_BIRIMI' // takip talebi / ödeme emri / icra emri / XML / UDF: `totals.currency` = dosya para birimi
  | 'SABIT_TL'; // dava dilekçeleri: şablon metninde sabit "TL"

export interface TemplateTotalsLabel {
  readonly paraBirimi: string;
  readonly kaynak: TemplateTotalsLabelSource;
}

export type TemplateTotalsCurrencyState =
  | 'KALEM_YOK'
  | 'TEK_PARA_BIRIMI'
  /** Kalemler tek para biriminde, ama belgenin toplam etiketi başka bir para birimi */
  | 'ETIKET_UYUSMUYOR'
  | 'KARMA_PARA_BIRIMI'
  | 'PARA_BIRIMI_EKSIK';

export type TemplateTotalsCurrencyReason =
  | 'FARKLI_PARA_BIRIMLERI_TEK_TOPLAMDA_BIRLESTIRILEMEZ'
  | 'TOPLAM_ETIKETI_KALEM_PARA_BIRIMIYLE_UYUSMUYOR'
  | 'KALEM_PARA_BIRIMI_EKSIK';

export interface TemplateTotalsCurrencyRow {
  readonly paraBirimi: string;
  readonly kalemSayisi: number;
  /** Yalnız bu para birimindeki kalemlerin toplamları (çevrilmez, başka para birimiyle birleştirilmez). */
  readonly totals: TemplateTotals;
}

export interface TemplateTotalsCurrencyStatus {
  readonly durum: TemplateTotalsCurrencyState;
  /** Belgeye basılacak toplam (tutar + para birimi etiketi) geçerli tek tutar mı? `false` ise resmî çıktı REDDEDİLİR. */
  readonly toplamGosterilebilir: boolean;
  readonly gerekce: TemplateTotalsCurrencyReason | null;
  /** Belgenin neden üretilemediğini söyleyen açıklama (toplam geçerliyse null). */
  readonly mesaj: string | null;
  readonly toplamEtiketi: TemplateTotalsLabel;
  /** Belgeye giren kalemlerin tek para birimi; kalem yoksa ya da tek para birimi belirlenemiyorsa null. */
  readonly alacakParaBirimi: string | null;
  /** Belgeye giren kalemlerde kayıtlı para birimleri (sıralı, tekil). */
  readonly paraBirimleri: readonly string[];
  /** Para birimi kayıtlı olmayan kalem sayısı; bu kalemler para birimi bazındaki hiçbir toplama girmez. */
  readonly paraBirimiEksikKalemSayisi: number;
  /** Belge toplamları — para birimi bazında. Geçerli tek toplamda tek satırdır ve belgenin `totals` değeriyle aynıdır. */
  readonly toplamlarParaBirimiBazinda: readonly TemplateTotalsCurrencyRow[];
}

const normalizeCurrency = (value: string | null | undefined): string => String(value ?? '').trim().toUpperCase();

/**
 * Belgeye giren kalemlerden toplamın para birimi durumunu çıkarır. Belge verisini DEĞİŞTİRMEZ.
 *
 * /// <remarks>
 * /// Çağrıldığı yerler:
 * ///  - TemplateEngineService.assertTotalsCurrencyValid() → dosya kaydından belge üreten TÜM yollar (ret kapısı)
 * /// </remarks>
 */
export function buildTemplateTotalsCurrencyStatus(
  claimItems: readonly TemplateTotalsCurrencyItem[],
  label: TemplateTotalsLabel,
): TemplateTotalsCurrencyStatus {
  const toplamEtiketi: TemplateTotalsLabel = { paraBirimi: normalizeCurrency(label.paraBirimi), kaynak: label.kaynak };

  const itemsByCurrency = new Map<string, TemplateTotalsCurrencyItem[]>();
  let paraBirimiEksikKalemSayisi = 0;
  for (const item of claimItems) {
    const currency = normalizeCurrency(item.currency);
    if (!currency) {
      paraBirimiEksikKalemSayisi += 1;
      continue;
    }
    const bucket = itemsByCurrency.get(currency);
    if (bucket) bucket.push(item);
    else itemsByCurrency.set(currency, [item]);
  }

  const paraBirimleri = [...itemsByCurrency.keys()].sort();
  const toplamlarParaBirimiBazinda = paraBirimleri.map((paraBirimi) => {
    const currencyItems = itemsByCurrency.get(paraBirimi) ?? [];
    return { paraBirimi, kalemSayisi: currencyItems.length, totals: computeTemplateTotals(currencyItems, paraBirimi) };
  });

  const eksik = paraBirimiEksikKalemSayisi > 0;
  const karma = paraBirimleri.length > 1;
  const etiketUyusmuyor = paraBirimleri.length === 1 && paraBirimleri[0] !== toplamEtiketi.paraBirimi;
  const dilekce = toplamEtiketi.kaynak === 'SABIT_TL';

  let durum: TemplateTotalsCurrencyState;
  let gerekce: TemplateTotalsCurrencyReason | null;
  let mesaj: string | null;
  if (eksik) {
    durum = 'PARA_BIRIMI_EKSIK';
    gerekce = 'KALEM_PARA_BIRIMI_EKSIK';
    mesaj =
      `${paraBirimiEksikKalemSayisi} alacak kaleminin para birimi kayıtlı değil; belgeye geçerli tek bir toplam yazılamaz.`;
  } else if (karma) {
    durum = 'KARMA_PARA_BIRIMI';
    gerekce = 'FARKLI_PARA_BIRIMLERI_TEK_TOPLAMDA_BIRLESTIRILEMEZ';
    mesaj =
      `Dosyada birden fazla para biriminde alacak kalemi var (${paraBirimleri.join(', ')}). ` +
      (dilekce
        ? 'Dilekçe tutarları çevirmeden tek sayıda toplar ve sabit "TL" ile yazar; bu tutar geçerli değildir.'
        : `Belge tutarları çevirmeden tek sayıda toplar ve dosya para birimiyle (${toplamEtiketi.paraBirimi}) etiketler; ` +
          'bu toplam geçerli değildir.');
  } else if (etiketUyusmuyor) {
    durum = 'ETIKET_UYUSMUYOR';
    gerekce = 'TOPLAM_ETIKETI_KALEM_PARA_BIRIMIYLE_UYUSMUYOR';
    mesaj =
      `Alacak kalemleri ${paraBirimleri[0]} para biriminde kayıtlı; ` +
      (dilekce
        ? 'dilekçe ise tutarı sabit "TL" ile yazıyor, yani yazılacak para birimi kalemlerin para birimini göstermiyor.'
        : `belge toplamı ise dosya para birimiyle (${toplamEtiketi.paraBirimi}) etiketlenecek, yani toplam satırındaki ` +
          'para birimi kalemlerin para birimini göstermiyor.');
  } else {
    durum = paraBirimleri.length === 1 ? 'TEK_PARA_BIRIMI' : 'KALEM_YOK';
    gerekce = null;
    mesaj = null;
  }

  return {
    durum,
    toplamGosterilebilir: gerekce === null,
    gerekce,
    mesaj,
    toplamEtiketi,
    alacakParaBirimi: !eksik && paraBirimleri.length === 1 ? paraBirimleri[0] : null,
    paraBirimleri,
    paraBirimiEksikKalemSayisi,
    toplamlarParaBirimiBazinda,
  };
}

/** Reddedilen üretimin hata kodu (400). */
export const TEMPLATE_TOTALS_CURRENCY_REJECTION_CODE = 'BELGE_TOPLAMI_PARA_BIRIMI_GECERSIZ';

/**
 * Reddedilen üretimin kullanıcıya dönen açıklaması: neden üretilemedi + ne yapılmadı + geçici korumanın sınırı.
 *
 * /// <remarks>
 * /// Çağrıldığı yerler:
 * ///  - TemplateEngineService.assertTotalsCurrencyValid() → BadRequestException gövdesi
 * /// </remarks>
 */
export function formatTemplateTotalsCurrencyRejection(status: TemplateTotalsCurrencyStatus): string {
  return (
    `Resmî belge üretilemedi: ${status.mesaj} Tutarlar çevrilmedi ve belge üretilmedi; hiçbir biçimde (PDF, Word, XML, ` +
    'UDF, metin) üretilmez. Bu geçici bir korumadır; para birimi bazında resmî belge tasarımının tamamlandığı anlamına ' +
    'gelmez. Alacak kalemlerinin para birimlerini kontrol edin.'
  );
}
