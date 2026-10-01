/**
 * Hesap özeti (legacy calculation-summary) — tutarların PARA BİRİMİ BAĞLAMI.
 *
 * Ölçülen kusur (main 630184e2, gerçek HTTP + disposable PostgreSQL): legacy hesap özeti kalem tutarlarını para birimine
 * bakmadan toplar; harç / masraf / vekalet ücreti ise TL tarifesindendir. 10.000 USD anaparalı dosyada peşin harç,
 * tahsil harcı ve vekalet ücreti 10.000 TL'ymiş gibi hesaplanıyor, sonra USD anapara ile TL masraflar tek sayıda
 * toplanıyor ve ekranda "₺" ile gösteriliyordu.
 *
 * Bu yardımcı HESAP YAPMAZ, tutar ÇEVİRMEZ ve mevcut alanları DEĞİŞTİRMEZ. Yalnız şunu bildirir: özetin her alanı
 * hangi para birimindedir ve geçerli bir tutar mıdır?
 *  - Dövizli alacağa TL tarifesi ORANI uygulanarak bulunan alanlar → HESAPLANAMADI (hangi tutar ve kur üzerinden
 *    hesaplanacağı hukuki / ürün kararıdır; burada kural SEÇİLMEZ).
 *  - Farklı para birimlerini tek sayıda toplayan alanlar → GOSTERILEMEZ.
 *  - Bilinen tutarlar kendi para birimiyle görünür kalır (asıl alacak, tahsilat, sabit TL masraflar).
 *
 * Dayanak: RECEIVABLE-GOVERNANCE REC-ALLOC-008 (çapraz para birimi toplamı ve çevirme yapılmaz; eksik para birimi
 * bağlamı 0 değildir), REC-FX-001 / REC-FX-002 (yetkili kur sözleşmesi olmadan çevirme yok), REC-FEE-003.
 */

/** Harç, masraf ve vekalet ücreti tarifesinin para birimi. */
export const CALCULATION_SUMMARY_TARIFF_CURRENCY = 'TRY' as const;

/** Alacak tarafı: kalem kaydından gelen tutarlar (kalemin kendi para biriminde). */
const CLAIM_FIELDS = [
  'asilAlacak',
  'tazminat',
  'komisyon',
  'takipOncesiFaiz',
  'takipTutari',
  'takipSonrasiFaiz',
  'kalanAnapara',
] as const;

/** Tahsilat tarafı: borçtan düşülen tahsilatlar (tahsilatın kendi para biriminde). */
const RECEIPT_FIELDS = ['toplamTahsilat', 'hesapTarihindenSonrakiTahsilat'] as const;

/** Mahsubu bekletilen tahsilat (bekletme kaydının para biriminde). */
const HELD_RECEIPT_FIELDS = ['mahsubuBekleyenTahsilat'] as const;

/** Tarifeden gelen SABİT TL tutarlar — alacağın para biriminden bağımsızdır. */
const TARIFF_FIXED_FIELDS = ['basvurmaHarci', 'vekaletHarci', 'dosyaGideri', 'tebligatGideri', 'vekaletPulu'] as const;

/** Tarife ORANININ alacak tutarına uygulanmasıyla bulunan TL tutarlar (peşin harcı içeren ara toplam dahil). */
const TARIFF_RATE_FIELDS = [
  'pesinHarc',
  'icraMasraflari',
  'pesinHarcDahilTahsilHarci',
  'pesinHarcHaricTahsilHarci',
  'vekaletUcreti',
] as const;

/** Alacak tarafı ile tarife tarafını tek sayıda toplayan alanlar. */
const TOTAL_FIELDS = ['toplamBorc', 'sonBorc', 'kalanBorc', 'tahsilOranlari'] as const;

export type CalculationSummaryCurrencyField =
  | typeof CLAIM_FIELDS[number]
  | typeof RECEIPT_FIELDS[number]
  | typeof HELD_RECEIPT_FIELDS[number]
  | typeof TARIFF_FIXED_FIELDS[number]
  | typeof TARIFF_RATE_FIELDS[number]
  | typeof TOTAL_FIELDS[number];

export type CalculationSummaryCurrencyState = 'TEK_PARA_BIRIMI_TL' | 'TEK_PARA_BIRIMI_DOVIZ' | 'KARMA_PARA_BIRIMI';

export type CalculationSummaryCurrencyReason =
  | 'DOVIZ_ALACAK_ILE_TL_TARIFE_TEK_TOPLAMDA_BIRLESTIRILEMEZ'
  | 'FARKLI_PARA_BIRIMLERI_TEK_TOPLAMDA_BIRLESTIRILEMEZ'
  | 'DOSYA_VE_KAYIT_PARA_BIRIMI_UYUSMUYOR';

export type CalculationSummaryFieldCurrencyStatus = 'GECERLI' | 'HESAPLANAMADI' | 'GOSTERILEMEZ';

export interface CalculationSummaryFieldCurrency {
  /** Alanın para birimi; alan geçerli tek para birimli bir tutar değilse null. */
  readonly paraBirimi: string | null;
  readonly durum: CalculationSummaryFieldCurrencyStatus;
}

export interface CalculationSummaryCurrencyAmount {
  readonly paraBirimi: string;
  readonly tutar: number;
}

export interface CalculationSummaryCurrencyStatus {
  /** Dosya para birimi (Case.currency). */
  readonly dosyaParaBirimi: string;
  /** Harç / masraf / vekalet ücreti tarifesinin para birimi. */
  readonly tarifeParaBirimi: typeof CALCULATION_SUMMARY_TARIFF_CURRENCY;
  readonly durum: CalculationSummaryCurrencyState;
  /** Toplam borç / son borç / kalan borç tek sayı olarak gösterilebilir mi? */
  readonly toplamGosterilebilir: boolean;
  readonly gerekce: CalculationSummaryCurrencyReason | null;
  /** Kullanıcıya gösterilecek açıklama (toplam gösterilebiliyorsa null). */
  readonly mesaj: string | null;
  /** Alacak tarafının tek para birimi; birden fazla para birimi varsa null. */
  readonly alacakParaBirimi: string | null;
  /** Asıl alacak — para birimi bazında (kayıttaki tutar; çevrilmez, birleştirilmez). */
  readonly asilAlacakParaBirimiBazinda: readonly CalculationSummaryCurrencyAmount[];
  /** Borçtan düşülen tahsilat — para birimi bazında. */
  readonly tahsilatParaBirimiBazinda: readonly CalculationSummaryCurrencyAmount[];
  /** Özetin her alanı için para birimi ve geçerlilik. Mevcut alanların DEĞERİ değişmez. */
  readonly alanlar: Readonly<Record<CalculationSummaryCurrencyField, CalculationSummaryFieldCurrency>>;
}

export interface CalculationSummaryCurrencyAmountInput {
  readonly amount: number;
  /** Kayıttaki para birimi; boşsa dosya para birimi sayılır (şemada alan zorunludur). */
  readonly currency?: string | null;
}

export interface CalculationSummaryCurrencyInput {
  readonly caseCurrency?: string | null;
  /** Özetin asıl alacak olarak topladığı tutarlar (anapara kalemleri; kalem yoksa dosya anaparası). */
  readonly principalAmounts: readonly CalculationSummaryCurrencyAmountInput[];
  /** Kesin çek tazminatı kalemleri. */
  readonly penaltyAmounts: readonly CalculationSummaryCurrencyAmountInput[];
  /** Borçtan düşülen (mahsubu bekletilmeyen) tahsilatlar. */
  readonly collectionAmounts: readonly CalculationSummaryCurrencyAmountInput[];
  /** Mahsubu bekletilen tahsilatlar. */
  readonly heldAmounts: readonly CalculationSummaryCurrencyAmountInput[];
}

const normalizeCurrency = (value: string | null | undefined, fallback: string): string => {
  const code = String(value ?? '').trim().toUpperCase();
  return code || fallback;
};

const toCents = (value: number): number => Math.round((Number(value) + Number.EPSILON) * 100);

/** Para birimi bazında toplam (kuruş tamsayısıyla; para birimleri arasında toplama YOK). */
function sumByCurrency(
  rows: readonly CalculationSummaryCurrencyAmountInput[],
  fallbackCurrency: string,
): CalculationSummaryCurrencyAmount[] {
  const cents = new Map<string, number>();
  for (const row of rows) {
    const currency = normalizeCurrency(row.currency, fallbackCurrency);
    cents.set(currency, (cents.get(currency) ?? 0) + toCents(row.amount));
  }
  return [...cents.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([paraBirimi, value]) => ({ paraBirimi, tutar: value / 100 }));
}

const currenciesOf = (rows: readonly CalculationSummaryCurrencyAmount[]): string[] => rows.map((row) => row.paraBirimi);

/** Tek para birimi varsa onu, hiç kayıt yoksa `fallback`'i, birden fazlaysa null döner. */
const singleCurrency = (currencies: readonly string[], fallback: string): string | null =>
  currencies.length === 0 ? fallback : currencies.length === 1 ? currencies[0] : null;

const valid = (paraBirimi: string): CalculationSummaryFieldCurrency => ({ paraBirimi, durum: 'GECERLI' });
const notComputable: CalculationSummaryFieldCurrency = { paraBirimi: null, durum: 'HESAPLANAMADI' };
const notDisplayable: CalculationSummaryFieldCurrency = { paraBirimi: null, durum: 'GOSTERILEMEZ' };

function fill<F extends CalculationSummaryCurrencyField>(
  fields: readonly F[],
  value: CalculationSummaryFieldCurrency,
): Record<F, CalculationSummaryFieldCurrency> {
  return Object.fromEntries(fields.map((field) => [field, value])) as Record<F, CalculationSummaryFieldCurrency>;
}

/**
 * /// <remarks>
 * /// Çağrıldığı yerler:
 * ///  - CaseService.getCalculationSummary() → GET /cases/:id/calculation-summary (`paraBirimiDurumu` bloğu)
 * /// </remarks>
 */
export function buildCalculationSummaryCurrencyStatus(
  input: CalculationSummaryCurrencyInput,
): CalculationSummaryCurrencyStatus {
  const tariff = CALCULATION_SUMMARY_TARIFF_CURRENCY;
  const dosyaParaBirimi = normalizeCurrency(input.caseCurrency, tariff);

  const asilAlacak = sumByCurrency(input.principalAmounts, dosyaParaBirimi);
  const tazminat = sumByCurrency(input.penaltyAmounts, dosyaParaBirimi);
  const tahsilat = sumByCurrency(input.collectionAmounts, dosyaParaBirimi);
  const bekleyen = sumByCurrency(input.heldAmounts, dosyaParaBirimi);

  const claimCurrencies = [...new Set([...currenciesOf(asilAlacak), ...currenciesOf(tazminat)])].sort();
  const alacakParaBirimi = singleCurrency(claimCurrencies, dosyaParaBirimi);
  const tahsilatParaBirimi = singleCurrency(currenciesOf(tahsilat), alacakParaBirimi ?? dosyaParaBirimi);
  const bekleyenParaBirimi = singleCurrency(currenciesOf(bekleyen), alacakParaBirimi ?? dosyaParaBirimi);

  // Özetin kullandığı her kaydın para birimi + dosya para birimi
  const recordCurrencies = [...new Set([...claimCurrencies, ...currenciesOf(tahsilat), ...currenciesOf(bekleyen)])].sort();
  const allCurrencies = [...new Set([dosyaParaBirimi, ...recordCurrencies])].sort();

  let durum: CalculationSummaryCurrencyState;
  let gerekce: CalculationSummaryCurrencyReason | null;
  let mesaj: string | null;
  if (allCurrencies.length === 1 && allCurrencies[0] === tariff) {
    durum = 'TEK_PARA_BIRIMI_TL';
    gerekce = null;
    mesaj = null;
  } else if (allCurrencies.length === 1) {
    durum = 'TEK_PARA_BIRIMI_DOVIZ';
    gerekce = 'DOVIZ_ALACAK_ILE_TL_TARIFE_TEK_TOPLAMDA_BIRLESTIRILEMEZ';
    mesaj =
      `Alacak ${dosyaParaBirimi} cinsindendir; harç, masraf ve vekalet ücreti TL tarifesindendir. Dövizli alacakta oranlı ` +
      'kalemlerin (peşin harç, tahsil harcı, vekalet ücreti) hangi tutar ve kur üzerinden hesaplanacağı tanımlı değildir: ' +
      'bu kalemler hesaplanmadı, tutarlar çevrilmedi ve farklı para birimleri tek toplamda birleştirilmedi.';
  } else if (recordCurrencies.length <= 1) {
    durum = 'KARMA_PARA_BIRIMI';
    gerekce = 'DOSYA_VE_KAYIT_PARA_BIRIMI_UYUSMUYOR';
    mesaj =
      `Dosya para birimi (${dosyaParaBirimi}) ile kayıtlı tutarların para birimi (${recordCurrencies[0]}) uyuşmuyor. ` +
      'Tutarlar kayıttaki para birimiyle gösterildi; oranlı kalemler hesaplanmadı ve tek toplam gösterilmedi.';
  } else {
    durum = 'KARMA_PARA_BIRIMI';
    gerekce = 'FARKLI_PARA_BIRIMLERI_TEK_TOPLAMDA_BIRLESTIRILEMEZ';
    mesaj =
      `Dosyada birden fazla para biriminde tutar var (${recordCurrencies.join(', ')}). Tutarlar çevrilmedi ve tek toplamda ` +
      'birleştirilmedi; oranlı kalemler (peşin harç, tahsil harcı, vekalet ücreti) hesaplanmadı.';
  }

  const tl = durum === 'TEK_PARA_BIRIMI_TL';
  const alanlar = {
    ...fill(CLAIM_FIELDS, alacakParaBirimi === null ? notDisplayable : valid(alacakParaBirimi)),
    ...fill(RECEIPT_FIELDS, tahsilatParaBirimi === null ? notDisplayable : valid(tahsilatParaBirimi)),
    ...fill(HELD_RECEIPT_FIELDS, bekleyenParaBirimi === null ? notDisplayable : valid(bekleyenParaBirimi)),
    ...fill(TARIFF_FIXED_FIELDS, valid(tariff)),
    ...fill(TARIFF_RATE_FIELDS, tl ? valid(tariff) : notComputable),
    ...fill(TOTAL_FIELDS, tl ? valid(tariff) : notDisplayable),
  };

  return {
    dosyaParaBirimi,
    tarifeParaBirimi: tariff,
    durum,
    toplamGosterilebilir: tl,
    gerekce,
    mesaj,
    alacakParaBirimi,
    asilAlacakParaBirimiBazinda: asilAlacak,
    tahsilatParaBirimiBazinda: tahsilat,
    alanlar,
  };
}
