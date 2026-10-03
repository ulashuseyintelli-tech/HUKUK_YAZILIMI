/**
 * Müvekkil Genel Cari — PARA BİRİMİ KAPSAMI (G1).
 *
 * Ölçülen kusur (main 81ab9466, gerçek HTTP + disposable PostgreSQL): Genel Cari sayfası özeti sabit TL ile ister
 * (`currency=TRY`). Müvekkilin USD dosyası TL görünümünde sessizce dışarıda kalıyor: dosya satırında "₺0,00" yazıyor, üstte
 * hiçbir uyarı yok; 700 USD müvekkil alacağı olan dosya sıfır borçlu görünüyordu.
 *
 * Bu yardımcı HESAP YAPMAZ, tutar ÇEVİRMEZ, para birimleri arasında toplama YAPMAZ ve özetin mevcut alanlarını DEĞİŞTİRMEZ.
 * Yalnız şunu bildirir (sunucu, doğru büro + müvekkil kapsamından): bu görünümün istediği para biriminin dışında kalan
 * kayıt / dosya var mı, hangi para biriminde, hangi dosyada? Böylece ekran, kapsam dışı değeri GERÇEK SIFIRDAN ayırabilir.
 *
 * KAPSAM DIŞI (owner kararı): döviz özeti, para birimi başına ayrı özet bloğu (G2), kur ve çevirme.
 *
 * Dayanak: RECEIVABLE-GOVERNANCE REC-ALLOC-008 (çapraz para birimi toplamı ve çevirme yapılmaz; eksik para birimi bağlamı
 * 0 değildir), REC-FX-001 / REC-FX-002 (yetkili kur sözleşmesi olmadan çevirme yok), RECEIVABLE §15.2 (UI hesap yapmaz).
 */

/** Özetin para birimi bağlamını okuduğu kayıt kaynakları. */
export type ClientAccountingCurrencySource =
  | 'Collection'
  | 'CollectionDisposition'
  | 'ClientPayout'
  | 'CaseBalance'
  | 'BalanceLedger'
  | 'ExpenseRequest'
  | 'ClientOffset';

/** İstenen para biriminin DIŞINDA kalan kayıt gözlemi (`currency` veritabanındaki ham değerdir). */
export interface ClientAccountingCurrencyObservation {
  readonly caseId: string;
  readonly source: ClientAccountingCurrencySource;
  readonly currency: string | null | undefined;
  readonly count: number;
}

export interface ClientAccountingCurrencyScopeCaseInput {
  readonly caseId: string;
  /** Dosyanın kayıtlı para birimi (Case.currency). */
  readonly caseCurrency: string | null | undefined;
}

/**
 * Dosya satırının bu görünümdeki kapsamı:
 *  - TAM   : dosya bu para biriminde ve para birimi dışı kayıt yok → satırdaki değerler geçerli (sıfır GERÇEK sıfırdır).
 *  - KISMI : dosya bu para biriminde ama başka para biriminde kayıt da var → değerler yalnız bu para biriminin kayıtlarıdır.
 *  - DISI  : dosyanın kayıtlı para birimi bu görünümünkinden farklı → dosya para birimine bağlı değerler (müvekkil borcu,
 *            ödenen, borçlu tahsilatı, dağıtım bekleyen) bu görünümde YOKTUR; sıfır diye gösterilemez.
 */
export type ClientAccountingCaseCurrencyScope = 'TAM' | 'KISMI' | 'DISI';

export interface ClientAccountingCaseCurrencyScopeInfo {
  readonly kapsam: ClientAccountingCaseCurrencyScope;
  /** Dosyanın kayıtlı para birimi (Case.currency). */
  readonly dosyaParaBirimi: string;
  /** Bu görünümün dışında kalan, belirli para birimleri (sıralı, tekil; dosyanın kendi para birimi farklıysa o da dahil). */
  readonly kapsamDisiParaBirimleri: readonly string[];
  /** Para birimi boş / belirlenemeyen kayıt sayısı (bu görünümün toplamlarına girmez; sıfır varsayılmaz). */
  readonly belirsizParaBirimiKayitSayisi: number;
  /** Kullanıcıya gösterilecek açıklama (kapsam TAM ise null). */
  readonly mesaj: string | null;
}

export interface ClientAccountingCurrencyStatus {
  /** Bu görünümün (özetin) para birimi. */
  readonly istenenParaBirimi: string;
  /** Müvekkilin bu görünümün dışında kayıt / dosyası var mı (belirsiz para birimli kayıt dahil)? */
  readonly kapsamDisiKayitVar: boolean;
  /** Bu görünümün dışında kalan belirli para birimleri (sıralı, tekil). */
  readonly kapsamDisiParaBirimleri: readonly string[];
  /** Dosya para birimi bu görünümünkinden farklı olan dosya sayısı. */
  readonly kapsamDisiDosyaSayisi: number;
  /** Bu para biriminde olup başka para biriminde kayıt da içeren dosya sayısı. */
  readonly kismiKapsamDosyaSayisi: number;
  readonly belirsizParaBirimiKayitSayisi: number;
  /** Bu görünümdeki toplamlar yalnız bu para biriminin kayıtlarıdır; çevrilmez, başka para birimiyle birleştirilmez. */
  readonly yalnizIstenenParaBirimi: true;
  /** Kullanıcıya gösterilecek açıklama (kapsam dışı kayıt yoksa null). */
  readonly mesaj: string | null;
}

export interface ClientAccountingCurrencyScopeResult {
  readonly durum: ClientAccountingCurrencyStatus;
  readonly dosyalar: ReadonlyMap<string, ClientAccountingCaseCurrencyScopeInfo>;
}

const normalize = (value: string | null | undefined): string => String(value ?? '').trim();

/**
 * Cagrildigi yerler:
 * - ClientSettlementReadService.getClientAccountingSummary() -> GET /clients/:clientId/accounting/summary (`paraBirimiDurumu`
 *   ve `caseBreakdown[].paraBirimiKapsami` alanları)
 */
export function buildClientAccountingCurrencyScope(input: {
  readonly requestedCurrency: string;
  readonly cases: readonly ClientAccountingCurrencyScopeCaseInput[];
  /** Yalnız istenen para biriminin DIŞINDAKİ kayıtlar; istenen para birimindeki kayıtlar buraya verilmez. */
  readonly observations: readonly ClientAccountingCurrencyObservation[];
}): ClientAccountingCurrencyScopeResult {
  const requested = normalize(input.requestedCurrency);

  const foreign = new Map<string, Set<string>>();
  const undetermined = new Map<string, number>();
  for (const observation of input.observations) {
    if (!(observation.count > 0)) continue;
    const code = normalize(observation.currency);
    if (code === requested) continue; // istenen para birimi kapsam içidir
    if (code === '') {
      undetermined.set(observation.caseId, (undetermined.get(observation.caseId) ?? 0) + observation.count);
    } else {
      const set = foreign.get(observation.caseId) ?? new Set<string>();
      set.add(code);
      foreign.set(observation.caseId, set);
    }
  }

  const dosyalar = new Map<string, ClientAccountingCaseCurrencyScopeInfo>();
  const allForeign = new Set<string>();
  let kapsamDisiDosyaSayisi = 0;
  let kismiKapsamDosyaSayisi = 0;
  let belirsizToplam = 0;

  for (const caseInput of input.cases) {
    if (dosyalar.has(caseInput.caseId)) continue;
    const dosyaParaBirimi = normalize(caseInput.caseCurrency);
    const outOfView = dosyaParaBirimi !== requested;
    const currencies = new Set(foreign.get(caseInput.caseId) ?? []);
    if (outOfView && dosyaParaBirimi !== '') currencies.add(dosyaParaBirimi);
    const belirsiz = undetermined.get(caseInput.caseId) ?? 0;
    const kapsamDisiParaBirimleri = [...currencies].sort();

    const kapsam: ClientAccountingCaseCurrencyScope = outOfView
      ? 'DISI'
      : kapsamDisiParaBirimleri.length > 0 || belirsiz > 0
        ? 'KISMI'
        : 'TAM';

    let mesaj: string | null = null;
    if (kapsam === 'DISI') {
      mesaj =
        `Bu dosya ${dosyaParaBirimi || 'belirsiz para birimli'} cinsindendir: bu para birimi ${requested} görünümünün ` +
        'toplamına dahil değildir. Dosya para birimine bağlı değerler (müvekkil borcu, ödenen, borçlu tahsilatı, dağıtım ' +
        'bekleyen) bu görünümde yoktur; sıfır anlamına gelmez.';
    } else if (kapsam === 'KISMI') {
      const parts: string[] = [];
      if (kapsamDisiParaBirimleri.length > 0) parts.push(`${kapsamDisiParaBirimleri.join(', ')} cinsinden kayıtlar`);
      if (belirsiz > 0) parts.push(`para birimi belirlenemeyen ${belirsiz} kayıt`);
      mesaj = `${parts.join(' ve ')} ${requested} görünümünün toplamına dahil değildir; tutarlar çevrilmedi ve birleştirilmedi.`;
    }

    dosyalar.set(caseInput.caseId, {
      kapsam,
      dosyaParaBirimi,
      kapsamDisiParaBirimleri,
      belirsizParaBirimiKayitSayisi: belirsiz,
      mesaj,
    });

    for (const code of kapsamDisiParaBirimleri) allForeign.add(code);
    belirsizToplam += belirsiz;
    if (kapsam === 'DISI') kapsamDisiDosyaSayisi += 1;
    if (kapsam === 'KISMI') kismiKapsamDosyaSayisi += 1;
  }

  const kapsamDisiParaBirimleri = [...allForeign].sort();
  const kapsamDisiKayitVar = kapsamDisiParaBirimleri.length > 0 || belirsizToplam > 0;

  let mesaj: string | null = null;
  if (kapsamDisiKayitVar) {
    const parts: string[] = [];
    if (kapsamDisiParaBirimleri.length > 0) parts.push(`${kapsamDisiParaBirimleri.join(', ')} cinsinden kayıtları`);
    if (belirsizToplam > 0) parts.push(`para birimi belirlenemeyen ${belirsizToplam} kaydı`);
    mesaj =
      `Bu görünüm yalnız ${requested} kayıtlarını kapsar. Bu müvekkilin ${parts.join(' ve ')} var; bu tutarlar toplamlara ` +
      'dahil değildir, çevrilmedi ve birleştirilmedi.';
  }

  return {
    durum: {
      istenenParaBirimi: requested,
      kapsamDisiKayitVar,
      kapsamDisiParaBirimleri,
      kapsamDisiDosyaSayisi,
      kismiKapsamDosyaSayisi,
      belirsizParaBirimiKayitSayisi: belirsizToplam,
      yalnizIstenenParaBirimi: true,
      mesaj,
    },
    dosyalar,
  };
}
