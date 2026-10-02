/**
 * Masraf önizlemesi (POST /fee-engine/preview) — tutarların PARA BİRİMİ BAĞLAMI.
 *
 * Ölçülen kusur (main 6681b1d5, gerçek tarayıcı + derlenmiş API + disposable PostgreSQL): sihirbazın alacak kalemi
 * formundaki "Hesap Özeti" bu önizlemenin TL tarifesi tutarlarını kalemin para birimi simgesiyle basıyor ve döviz
 * anaparayla tek toplamda birleştiriyordu (10.000 USD → "Vekalet Ücreti 11.000,00 $ / SON BORÇ 21.652,26 $"; TL kalemle
 * aynı sayılar). İstek para birimi taşımıyordu; yanıt USD / EUR / TRY için birebir aynıydı.
 *
 * Bu yardımcı HESAP YAPMAZ, tutar ÇEVİRMEZ ve yeni kural TANIMLAMAZ. Dosya hesap özetinin para birimi kararını
 * (`buildCalculationSummaryCurrencyStatus`, #2872) tek kalemlik önizleme girdisine uygular; alan adları hesap özetiyle
 * aynıdır. Dövizli alacakta harç / vekalet ücreti kuralı (tutar ve kur) owner kararıdır.
 *
 * Dayanak: RECEIVABLE-GOVERNANCE REC-FX-001 / REC-FX-002 (yetkili kur sözleşmesi olmadan çevirme yok), REC-FEE-003.
 */
import {
  buildCalculationSummaryCurrencyStatus,
  type CalculationSummaryCurrencyStatus,
} from '../case/case-calculation-summary-currency';

/**
 * Hesap özeti kararının önizlemeye uyan kısmı: para birimi bazında tutar listeleri yoktur (önizleme tek tutar alır ve
 * bu tutar takip tutarıdır, asıl alacak değil).
 */
export type FeePreviewCurrencyStatus = Omit<
  CalculationSummaryCurrencyStatus,
  'asilAlacakParaBirimiBazinda' | 'tahsilatParaBirimiBazinda'
>;

export interface FeePreviewCurrencyInput {
  /** Önizlemenin matrahı (takip tutarı) — kalemin para biriminde. */
  readonly principalAmount: number;
  /** Alacak kaleminin para birimi. Bildirilmezse karar ÜRETİLMEZ (para birimi göndermeyen çağıran → yanıt aynen). */
  readonly currency?: unknown;
  /** Dosya para birimi. Bildirilmezse kalemin para birimi dosya para birimi sayılır. */
  readonly caseCurrency?: unknown;
}

/** Bildirilmiş para birimi kodu; boş / yalnız boşluk bildirilmemiş sayılır (harf normalleştirmesi hesap özeti yardımcısındadır). */
const currencyCode = (value: unknown): string | null => String(value ?? '').trim() || null;

/**
 * Cagrildigi yerler:
 * - FeeEngineController.preview() -> POST /fee-engine/preview (`data.paraBirimiDurumu` bloğu)
 */
export function buildFeePreviewCurrencyStatus(input: FeePreviewCurrencyInput): FeePreviewCurrencyStatus | null {
  const currency = currencyCode(input.currency);
  if (!currency) return null;

  const status = buildCalculationSummaryCurrencyStatus({
    caseCurrency: currencyCode(input.caseCurrency) ?? currency,
    principalAmounts: [{ amount: input.principalAmount, currency }],
    penaltyAmounts: [],
    collectionAmounts: [],
    heldAmounts: [],
  });

  return {
    dosyaParaBirimi: status.dosyaParaBirimi,
    tarifeParaBirimi: status.tarifeParaBirimi,
    durum: status.durum,
    toplamGosterilebilir: status.toplamGosterilebilir,
    gerekce: status.gerekce,
    mesaj: status.mesaj,
    alacakParaBirimi: status.alacakParaBirimi,
    alanlar: status.alanlar,
  };
}
