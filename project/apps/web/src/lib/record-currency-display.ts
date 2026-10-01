/**
 * Kayıt tutarı gösterimi — tutar KAYDIN KENDİ para birimiyle yazılır.
 *
 * Kural (RECEIVABLE-GOVERNANCE REC-ALLOC-008, REC-FX-001/002): farklı para birimleri tek sayıda toplanmaz, tutar
 * çevrilmez. Buradaki yardımcılar yalnız ekranda zaten listelenen kayıtların etiketini ve "tek toplam yazılabilir mi"
 * ayrımını verir; kur, çevirme ya da hukuki hesap YOKTUR. Sayı biçimi çağıranda kalır.
 *
 * Kullanıldığı yer:
 * - dosya detayı sayfası "Alacak Kalemleri" / "Ödemeler" bloğu (`app/(dashboard)/cases/[id]/page.tsx`)
 * - OperationDeck "Finans" (tahsilat tutarı / toplamı) ve "Dağıtım & Mutabakat" (dağıtım kaydı tutarı) sekmeleri
 *   (`components/case-detail/OperationDeck.tsx`, `lib/collection-allocation-hold.ts`)
 * - yeni alacak kalemi / yeni ödeme formunun dosya para birimi varsayılanı (`components/finance/DueModal.tsx`,
 *   `components/finance/CollectionModal.tsx`)
 */

/** Para birimi alanı boş gelen kayıt için şema varsayılanı (Due.currency / Collection.currency / Case.currency). */
const DEFAULT_CURRENCY = "TRY";

export interface CurrencyBearingRecord {
  currency?: string | null;
}

/** Kaydın para birimi kodu (ISO, büyük harf); alan boş ya da yoksa şema varsayılanı. */
export function recordCurrencyCode(currency: string | null | undefined): string {
  const code = typeof currency === "string" ? currency.trim().toUpperCase() : "";
  return code || DEFAULT_CURRENCY;
}

/**
 * Tutarın hemen ardına yazılan para birimi eki (baştaki boşluk dahil). TRY'de eskisiyle birebir aynıdır (" ₺"); diğer
 * para birimlerinde ISO kodu yazılır (" USD") — simge eşlemesi tutulmaz, böylece tanınmayan bir para birimi "₺" ile
 * basılmaz.
 */
export function recordCurrencySuffix(currency: string | null | undefined): string {
  const code = recordCurrencyCode(currency);
  return code === DEFAULT_CURRENCY ? " ₺" : ` ${code}`;
}

/**
 * Kayıtların ortak para birimi. Kayıtlar birden fazla para birimindeyse (ya da liste boşsa) null döner:
 * çağıran tek toplam YAZMAZ.
 */
export function sharedRecordCurrency(records: readonly CurrencyBearingRecord[] | null | undefined): string | null {
  const codes = new Set((records ?? []).map((record) => recordCurrencyCode(record?.currency)));
  return codes.size === 1 ? Array.from(codes)[0] : null;
}
