import { BadRequestException } from '@nestjs/common';

/**
 * Müvekkil ekstresi — PARA BİRİMİ SINIRI (E1).
 *
 * Ölçülen kusur (main 81ab9466, gerçek HTTP + disposable PostgreSQL): ekstre üreticileri kaynak satırların para birimine
 * bakmadan topluyor ve belgeyi sabit TL olarak damgalıyordu. 500 TL avans − 120 TL masraf + 700 USD müvekkil alacağı +
 * 300 USD avans mahsubu içeren dosyada kapanış bakiyesi "₺1.380,00" yazıldı; müvekkil genel ekstresi 700 USD + 1.500 TL'yi
 * tek bakiyede ("₺2.200,00") topladı. Ekstre değişmez bir belge olduğundan yanlış toplam sonradan düzeltilemez.
 *
 * Kural: ekstre yalnız TL kaynak satırlardan üretilir. Ekstreye gerçekten girecek kaynaklardan herhangi birinin para birimi
 * TL değilse ya da belirlenemiyorsa üretim, hiçbir kayıt yazılmadan açık kodla reddedilir. Para birimi dosyanın (Case.currency)
 * ya da ekranın seçimine bağlanmaz: denetlenen şey ekstreye girecek satırların KENDİ para birimidir. Belirlenemeyen para birimi
 * TL ya da sıfır varsayılmaz.
 *
 * KAPSAM DIŞI (owner kararı): döviz ekstresi, para birimi başına ayrı ekstre, kur ve çevirme. Bu yardımcı hesap yapmaz,
 * çevirmez ve mevcut ekstreleri değiştirmez.
 *
 * Dayanak: RECEIVABLE-GOVERNANCE REC-FX-001 / REC-FX-002 (yetkili kur sözleşmesi olmadan çevirme ve çapraz para birimi
 * toplamı yok), CLIENT-GOVERNANCE-CHARTER §35.16 (bir belge = tek para birimi).
 */

/** Ekstrenin desteklenen tek para birimi. */
export const CLIENT_STATEMENT_SUPPORTED_CURRENCY = 'TRY' as const;

/** Ret hata kodu (HTTP 400 gövdesinde `code`). */
export const CLIENT_STATEMENT_UNSUPPORTED_CURRENCY_CODE = 'CLIENT_STATEMENT_UNSUPPORTED_CURRENCY' as const;

export type ClientStatementCurrencyReason = 'NON_TRY_SOURCE' | 'CURRENCY_UNDETERMINED';

/** Ekstreye girecek kaynak kayıt türleri. */
export type ClientStatementCurrencySource =
  | 'BalanceLedger'
  | 'ExpenseRequest'
  | 'ExpensePayment'
  | 'CollectionDisposition'
  | 'ClientPayout'
  | 'ClientOffset';

const SOURCE_LABELS: Readonly<Record<ClientStatementCurrencySource, string>> = {
  BalanceLedger: 'masraf/avans defteri',
  ExpenseRequest: 'masraf talebi',
  ExpensePayment: 'masraf tahsilatı',
  CollectionDisposition: 'tahsilat dağıtımı',
  ClientPayout: 'müvekkile ödeme',
  ClientOffset: 'mahsup',
};

/** Bir kaynaktaki (para birimi, kayıt sayısı) gözlemi. `currency` veritabanındaki ham değerdir. */
export interface ClientStatementCurrencyObservation {
  readonly source: ClientStatementCurrencySource;
  readonly currency: string | null | undefined;
  readonly count: number;
}

export interface ClientStatementCurrencyAssessment {
  readonly supported: boolean;
  readonly reasonCode: ClientStatementCurrencyReason | null;
  /** TL dışı, belirli para birimleri (sıralı, tekil). */
  readonly currencies: readonly string[];
  /** Para birimi boş / belirlenemeyen kayıt sayısı. */
  readonly undeterminedCount: number;
  /** TL dışı ya da belirsiz kayıt içeren kaynaklar (sıralı, tekil). */
  readonly sources: readonly ClientStatementCurrencySource[];
}

/**
 * Gözlemleri sınıflar. YALNIZ tam "TRY" desteklenir; boş / belirsiz değer TL sayılmaz.
 * Sayısı 0 olan gözlem kaynak değildir (gerçekte ekstreye girecek satır yok).
 *
 * Cagrildigi yerler:
 * - ClientStatementService.assertSupportedSourceCurrency() -> create / createClientLevel / supersede üretim öncesi
 */
export function assessClientStatementCurrencies(
  observations: readonly ClientStatementCurrencyObservation[],
): ClientStatementCurrencyAssessment {
  const currencies = new Set<string>();
  const sources = new Set<ClientStatementCurrencySource>();
  let undeterminedCount = 0;

  for (const observation of observations) {
    if (!(observation.count > 0)) continue;
    const raw = observation.currency;
    if (raw === CLIENT_STATEMENT_SUPPORTED_CURRENCY) continue;
    const code = typeof raw === 'string' ? raw.trim() : '';
    if (code === '') {
      undeterminedCount += observation.count;
    } else {
      currencies.add(code);
    }
    sources.add(observation.source);
  }

  const supported = currencies.size === 0 && undeterminedCount === 0;
  return {
    supported,
    reasonCode: supported ? null : currencies.size > 0 ? 'NON_TRY_SOURCE' : 'CURRENCY_UNDETERMINED',
    currencies: [...currencies].sort(),
    undeterminedCount,
    sources: [...sources].sort(),
  };
}

/**
 * Reddin kullanıcıya gösterilen gerekçesi. Tutar ve kayıt kimliği taşımaz (ekranda ve günlükte güvenle gösterilebilir).
 */
export function buildUnsupportedCurrencyMessage(assessment: ClientStatementCurrencyAssessment): string {
  const where = assessment.sources.map((source) => SOURCE_LABELS[source]).join(', ');
  const found =
    assessment.reasonCode === 'NON_TRY_SOURCE'
      ? `TL dışı para biriminde kayıt var (${assessment.currencies.join(', ')})`
      : 'para birimi belirlenemeyen kayıt var';
  return (
    `Ekstre oluşturulamadı: ekstreye girecek kayıtlar arasında ${found}${where ? ` — ${where}` : ''}. ` +
    'Farklı para birimleri tek ekstrede toplanamaz ve döviz ekstresi henüz desteklenmiyor; tutarlar çevrilmedi ve ' +
    'hiçbir ekstre kaydı oluşturulmadı.'
  );
}

/**
 * Desteklenmeyen para birimi → HTTP 400 (`code`, `reasonCode`, `message`; web `message`i olduğu gibi gösterir).
 * Aylık koşu 409'u "mükerrer koşu" saydığı için bilerek 409 DEĞİL.
 */
export function assertClientStatementCurrencySupported(assessment: ClientStatementCurrencyAssessment): void {
  if (assessment.supported) return;
  throw new BadRequestException({
    code: CLIENT_STATEMENT_UNSUPPORTED_CURRENCY_CODE,
    reasonCode: assessment.reasonCode,
    message: buildUnsupportedCurrencyMessage(assessment),
    supportedCurrency: CLIENT_STATEMENT_SUPPORTED_CURRENCY,
    currencies: assessment.currencies,
    undeterminedRecordCount: assessment.undeterminedCount,
    sources: assessment.sources,
  });
}
