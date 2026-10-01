/**
 * Alacak özeti (GET /claim-items/case/:caseId/summary) — toplamların PARA BİRİMİ BAĞLAMI.
 *
 * Ölçülen kusur (main 6917e8aa, gerçek HTTP + disposable PostgreSQL): özet etkin kalem tutarlarını para birimine
 * bakmadan topluyor ve yanıtı SON kalemin para birimiyle etiketliyordu. 10.000 USD + 5.000 EUR + 2.000 TRY anaparalı
 * dosyada `totals.principal` ve `totals.grandTotal` 17.000, `currency` ise kalem sırasına göre "TRY" ya da "EUR"
 * dönüyor; panel bunu "₺17.000,00" olarak gösteriyordu.
 *
 * Bu yardımcı tutar ÇEVİRMEZ, para birimleri arasında toplama YAPMAZ ve yanıtın mevcut alanlarını DEĞİŞTİRMEZ.
 * Yalnız şunu bildirir: özetin tek toplamları geçerli tek tutar mıdır; değilse para birimi bazında toplamlar nedir?
 *
 * KAPSAM DIŞI (owner kararı): bir dosyada kalem başına farklı para birimine izin verilip verilmeyeceği ve dövizli
 * takipte kur. Burada kural SEÇİLMEZ; kayıtlar olduğu gibi raporlanır.
 *
 * Dayanak: RECEIVABLE-GOVERNANCE REC-ALLOC-008 (çapraz para birimi toplamı ve çevirme yapılmaz; eksik para birimi
 * bağlamı 0 değildir), REC-FX-001 / REC-FX-002 (yetkili kur sözleşmesi olmadan çevirme yok).
 */

/** Özetin kategori toplamları (yanıttaki `totals` ile aynı alanlar). */
export interface ClaimSummaryTotals {
  principal: number;
  preInterest: number;
  postInterest: number;
  totalInterest: number;
  expense: number;
  fee: number;
  attorneyFee: number;
  penalty: number;
  tax: number;
  other: number;
  grandTotal: number;
}

/** Özetin kalem kaydından okuduğu alanlar. */
export interface ClaimSummaryItemInput {
  readonly itemType: string;
  /** Kayıttaki tutar (Prisma Decimal / sayı). */
  readonly amount: unknown;
  /** Kayıttaki para birimi (şemada zorunlu; boşsa kalemin para birimi BİLİNMİYOR sayılır). */
  readonly currency?: string | null;
}

export type ClaimSummaryCurrencyState = 'KALEM_YOK' | 'TEK_PARA_BIRIMI' | 'KARMA_PARA_BIRIMI' | 'PARA_BIRIMI_EKSIK';

export type ClaimSummaryCurrencyReason =
  | 'FARKLI_PARA_BIRIMLERI_TEK_TOPLAMDA_BIRLESTIRILEMEZ'
  | 'KALEM_PARA_BIRIMI_EKSIK';

export interface ClaimSummaryCurrencyTotals {
  readonly paraBirimi: string;
  readonly kalemSayisi: number;
  /** Yalnız bu para birimindeki kalemlerin toplamları (çevrilmez, başka para birimiyle birleştirilmez). */
  readonly totals: ClaimSummaryTotals;
}

export interface ClaimSummaryCurrencyStatus {
  readonly durum: ClaimSummaryCurrencyState;
  /** Yanıtın tek toplamları (`currency` + `totals.*` + `items[].amount`) geçerli tek tutar olarak gösterilebilir mi? */
  readonly toplamGosterilebilir: boolean;
  readonly gerekce: ClaimSummaryCurrencyReason | null;
  /** Kullanıcıya gösterilecek açıklama (toplam gösterilebiliyorsa null). */
  readonly mesaj: string | null;
  /** Etkin kalemlerin tek para birimi; kalem yoksa ya da tek para birimi belirlenemiyorsa null. */
  readonly alacakParaBirimi: string | null;
  /** Etkin kalemlerde kayıtlı para birimleri (sıralı, tekil). */
  readonly paraBirimleri: readonly string[];
  /** Para birimi kayıtlı olmayan kalem sayısı; bu kalemler para birimi bazındaki hiçbir toplama girmez. */
  readonly paraBirimiEksikKalemSayisi: number;
  /** Kategori toplamları — para birimi bazında. Tek para birimli dosyada tek satırdır ve `totals` ile aynıdır. */
  readonly toplamlarParaBirimiBazinda: readonly ClaimSummaryCurrencyTotals[];
}

const round2 = (value: number): number => Math.round(value * 100) / 100;

const normalizeCurrency = (value: string | null | undefined): string => String(value ?? '').trim().toUpperCase();

/**
 * Kalem türlerini özet kategorilerine toplar. Verilen kalemler arasında para birimi AYRIMI YAPMAZ: çağıran, tek para
 * birimli bir kalem kümesi verdiğinde sonuç geçerli tutardır.
 *
 * Cagrildigi yerler:
 * - ClaimItemService.getClaimSummary() -> GET /claim-items/case/:caseId/summary (`totals`; etkin kalemlerin tümü)
 * - buildClaimSummaryCurrencyStatus() -> para birimi bazında toplamlar (her para biriminin kendi kalemleri)
 */
export function sumClaimSummaryTotals(items: readonly ClaimSummaryItemInput[]): ClaimSummaryTotals {
  const totals: ClaimSummaryTotals = {
    principal: 0,
    preInterest: 0,
    postInterest: 0,
    totalInterest: 0,
    expense: 0,
    fee: 0,
    attorneyFee: 0,
    penalty: 0,
    tax: 0,
    other: 0,
    grandTotal: 0,
  };

  for (const item of items) {
    const amount = Number(item.amount || 0);
    switch (item.itemType) {
      case 'PRINCIPAL':
        totals.principal += amount;
        break;
      case 'INTEREST':
      case 'PRE_INTEREST':
        totals.preInterest += amount;
        totals.totalInterest += amount;
        break;
      case 'POST_INTEREST':
        totals.postInterest += amount;
        totals.totalInterest += amount;
        break;
      case 'EXPENSE':
        totals.expense += amount;
        break;
      case 'FEE':
        totals.fee += amount;
        break;
      case 'ATTORNEY_FEE':
        totals.attorneyFee += amount;
        break;
      case 'PENALTY':
      case 'CHECK_PENALTY':
      case 'CONTRACTUAL_PENALTY':
        totals.penalty += amount;
        break;
      case 'TAX_KDV':
      case 'TAX_BSMV':
      case 'TAX_KKDF':
        totals.tax += amount;
        break;
      default:
        totals.other += amount;
    }
    totals.grandTotal += amount;
  }

  return {
    principal: round2(totals.principal),
    preInterest: round2(totals.preInterest),
    postInterest: round2(totals.postInterest),
    totalInterest: round2(totals.totalInterest),
    expense: round2(totals.expense),
    fee: round2(totals.fee),
    attorneyFee: round2(totals.attorneyFee),
    penalty: round2(totals.penalty),
    tax: round2(totals.tax),
    other: round2(totals.other),
    grandTotal: round2(totals.grandTotal),
  };
}

/**
 * Cagrildigi yerler:
 * - ClaimItemService.getClaimSummary() -> GET /claim-items/case/:caseId/summary (`paraBirimiDurumu` bloğu)
 */
export function buildClaimSummaryCurrencyStatus(items: readonly ClaimSummaryItemInput[]): ClaimSummaryCurrencyStatus {
  const itemsByCurrency = new Map<string, ClaimSummaryItemInput[]>();
  let paraBirimiEksikKalemSayisi = 0;
  for (const item of items) {
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
    return { paraBirimi, kalemSayisi: currencyItems.length, totals: sumClaimSummaryTotals(currencyItems) };
  });

  const karma = paraBirimleri.length > 1;
  const eksik = paraBirimiEksikKalemSayisi > 0;

  let durum: ClaimSummaryCurrencyState;
  let gerekce: ClaimSummaryCurrencyReason | null;
  if (eksik) {
    durum = 'PARA_BIRIMI_EKSIK';
    gerekce = 'KALEM_PARA_BIRIMI_EKSIK';
  } else if (karma) {
    durum = 'KARMA_PARA_BIRIMI';
    gerekce = 'FARKLI_PARA_BIRIMLERI_TEK_TOPLAMDA_BIRLESTIRILEMEZ';
  } else {
    durum = paraBirimleri.length === 1 ? 'TEK_PARA_BIRIMI' : 'KALEM_YOK';
    gerekce = null;
  }

  const mesajlar: string[] = [];
  if (eksik) {
    mesajlar.push(
      `${paraBirimiEksikKalemSayisi} alacak kaleminin para birimi kayıtlı değil. Bu kalemler hiçbir toplama dahil edilmedi; ` +
        'tek toplam gösterilmedi.',
    );
  }
  if (karma) {
    mesajlar.push(
      `Dosyada birden fazla para biriminde alacak kalemi var (${paraBirimleri.join(', ')}). Tutarlar çevrilmedi ve tek ` +
        'toplamda birleştirilmedi; toplamlar para birimi bazında gösterilir.',
    );
  }

  return {
    durum,
    toplamGosterilebilir: !eksik && !karma,
    gerekce,
    mesaj: mesajlar.length > 0 ? mesajlar.join(' ') : null,
    alacakParaBirimi: !eksik && paraBirimleri.length === 1 ? paraBirimleri[0] : null,
    paraBirimleri,
    paraBirimiEksikKalemSayisi,
    toplamlarParaBirimiBazinda,
  };
}
