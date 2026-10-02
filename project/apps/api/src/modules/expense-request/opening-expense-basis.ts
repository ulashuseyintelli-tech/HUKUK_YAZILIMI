/**
 * Açılış masraf seti — PEŞİN HARÇ MATRAHI TL olarak hesaplanabilir mi?
 *
 * Ölçülen kusur (main 6917e8aa, gerçek HTTP + disposable PostgreSQL): otomatik açılış masraf seti peşin harcı (TL
 * tarifesi oranı) anapara kalemlerinin SAYISINA para birimine bakmadan uygular. 10.000 USD anaparalı dosyada peşin harç
 * 10.000 TL'ymiş gibi 120,00 TL bulunuyor; talep (toplam 1.431,10 TL) PENDING / BLOCKING kayıt olarak ve muhasebe
 * günlüğüne yazılıyordu.
 *
 * Owner ara kararı (2026-10-01): kur / matrah sözleşmesi yokken yanlış tutarlı otomatik masraf talebi kayda geçmez;
 * dosya açılışı engellenmez; eksik tutar 0 sayılmaz ve talep tamamlanmış gösterilmez. Mevcut sözleşme tutarı eksik
 * (kısmi) talebi desteklemez — kalem tutarı ve talep toplamı zorunludur, talep oluşurken muhasebe günlüğüne yazılır ve
 * UYAP kapısını kilitler — bu yüzden otomatik talep OLUŞTURULMAZ; neden ve tamamlanması gereken bilgi bildirilir.
 *
 * Bu yardımcı HESAP YAPMAZ, tutar ÇEVİRMEZ ve kayıt YAZMAZ; kur tarihi, kur türü ya da matrah kuralı SEÇMEZ. Yalnız şunu
 * bildirir: matrahı oluşturan tutarların tamamı tarife para biriminde mi?
 *
 * Dayanak: RECEIVABLE-GOVERNANCE REC-FX-002 (yetkili kur sözleşmesi olmadan çevirme yok), REC-FEE-003 (eksik hukuki /
 * tarife verisi sessiz 0 ya da varsayılan üretmez).
 */

import type { OpeningExpenseEmailNotSentStatus } from './opening-expense-email-outcome';

/** Açılış masraf kalemlerinin (harç / gider) tarifesinin para birimi. */
export const OPENING_EXPENSE_TARIFF_CURRENCY = 'TRY' as const;

export const OPENING_EXPENSE_FX_BASIS_POLICY_MISSING = 'OPENING_EXPENSE_FX_BASIS_POLICY_MISSING' as const;

/** Tarife ORANININ matraha uygulanmasıyla bulunan açılış kalemleri (sabit tutarlı kalemler burada yer almaz). */
const RATE_BASED_OPENING_ITEMS = [{ itemCode: 'PESIN_HARC', label: 'Peşin Harç' }] as const;

export interface OpeningExpenseBasisInput {
  /** Dosya para birimi (Case.currency). */
  readonly caseCurrency?: string | null;
  /** Peşin harç matrahını oluşturan kayıtların para birimleri (kalem yoksa boş: matrah dosya anaparasıdır). */
  readonly basisRecordCurrencies: readonly (string | null | undefined)[];
}

export interface OpeningExpenseNotCalculableItem {
  readonly itemCode: string;
  readonly label: string;
}

export interface OpeningExpenseBasisCalculable {
  readonly calculable: true;
}

export interface OpeningExpenseBasisNotCalculable {
  readonly calculable: false;
  readonly reasonCode: typeof OPENING_EXPENSE_FX_BASIS_POLICY_MISSING;
  /** Kullanıcıya gösterilecek neden. */
  readonly message: string;
  /** Talebin oluşturulabilmesi için tamamlanması gereken bilgi. */
  readonly requiredInfo: readonly string[];
  /** Hesaplanamayan kalemler (tutarları YOKTUR; 0 değildir). */
  readonly notCalculableItems: readonly OpeningExpenseNotCalculableItem[];
  readonly caseCurrency: string;
  /** Dosya para birimi dahil, matrahta görülen para birimleri (sıralı, tekil). */
  readonly basisCurrencies: readonly string[];
  readonly tariffCurrency: typeof OPENING_EXPENSE_TARIFF_CURRENCY;
}

export type OpeningExpenseBasisDecision = OpeningExpenseBasisCalculable | OpeningExpenseBasisNotCalculable;

/** Otomatik açılış masraf setinin durumu (salt okuma). */
export interface OpeningExpenseAutomationStatus {
  readonly caseId: string;
  readonly clientAssigned: boolean;
  /** İptal edilmemiş OPENING aşamalı talep var mı? */
  readonly openingRequestExists: boolean;
  /** Dosyadaki iptal edilmemiş masraf talebi sayısı (elle oluşturulanlar dahil). */
  readonly activeExpenseRequestCount: number;
  readonly automaticCalculation: OpeningExpenseBasisDecision;
  /** Yalnız gönderilmemiş (PENDING) açılış talebinin SON e-posta denemesi başarısızsa gelir; aksi hâlde alan yoktur. */
  readonly openingRequestEmail?: OpeningExpenseEmailNotSentStatus;
}

/** Dosya açılış yanıtındaki sonuç: otomatik açılış masraf talebi OLUŞTURULMADI. */
export interface OpeningExpenseNotCreatedOutcome extends Omit<OpeningExpenseBasisNotCalculable, 'calculable'> {
  readonly status: 'NOT_CREATED';
  /** Kullanıcı masraf e-postası istemiş miydi? Talep oluşmadığı için e-posta GÖNDERİLMEZ. */
  readonly expenseEmailRequested: boolean;
  readonly expenseEmailSent: false;
}

const normalizeCurrency = (value: string | null | undefined, fallback: string): string => {
  const code = String(value ?? '').trim().toUpperCase();
  return code || fallback;
};

/**
 * Açılış masraf setinin asıl alacak seçimiyle AYNI öncelik: anapara kalemleri (Due) varsa onlar, yoksa anapara alacak
 * kalemleri (ClaimItem), o da yoksa dosya anaparası (dosya para biriminde).
 *
 * <remarks>
 * Çağrıldığı yerler:
 * - ExpenseRequestService.createOpeningExpenseSet() (yazma koruması)
 * - ExpenseRequestService.evaluateOpeningExpenseBasisForCase() (salt okuma)
 * </remarks>
 */
export function openingExpenseBasisInputOfCase(caseItem: {
  currency?: string | null;
  dues?: readonly { currency?: string | null }[] | null;
  claimItems?: readonly { currency?: string | null }[] | null;
}): OpeningExpenseBasisInput {
  const dues = caseItem.dues ?? [];
  const claimItems = caseItem.claimItems ?? [];
  const basisRecords = dues.length > 0 ? dues : claimItems;
  return {
    caseCurrency: caseItem.currency,
    basisRecordCurrencies: basisRecords.map((record) => record.currency),
  };
}

/**
 * <remarks>
 * Çağrıldığı yerler:
 * - ExpenseRequestService.createOpeningExpenseSet() → POST /expense-requests/case/:caseId/opening ve dosya açılışı
 * - ExpenseRequestService.evaluateOpeningExpenseBasisForCase() → CaseService.create(), GET .../opening-status
 * </remarks>
 */
export function evaluateOpeningExpenseBasis(input: OpeningExpenseBasisInput): OpeningExpenseBasisDecision {
  const tariff = OPENING_EXPENSE_TARIFF_CURRENCY;
  // Şemada para birimi alanları zorunludur (varsayılan TRY); boş değer yalnız savunma amaçlı ele alınır.
  const caseCurrency = normalizeCurrency(input.caseCurrency, tariff);
  const recordCurrencies = [...new Set(input.basisRecordCurrencies.map((currency) => normalizeCurrency(currency, caseCurrency)))].sort();
  const basisCurrencies = [...new Set([caseCurrency, ...recordCurrencies])].sort();

  if (basisCurrencies.length === 1 && basisCurrencies[0] === tariff) {
    return { calculable: true };
  }

  let context: string;
  if (basisCurrencies.length === 1) {
    context = `dosya para birimi ${caseCurrency}`;
  } else if (recordCurrencies.length <= 1) {
    context = `dosya para birimi (${caseCurrency}) ile anapara kalemlerinin para birimi (${recordCurrencies[0]}) uyuşmuyor`;
  } else {
    context = `anapara kalemleri birden fazla para biriminde (${recordCurrencies.join(', ')})`;
  }

  return {
    calculable: false,
    reasonCode: OPENING_EXPENSE_FX_BASIS_POLICY_MISSING,
    message:
      `Açılış masraf talebi otomatik oluşturulmadı: ${context}. Peşin harç TL tarifesindeki oranla hesaplanır; alacağın TL ` +
      'karşılığı için kullanılacak kur (tarih ve tür) sistemde tanımlı değildir. Peşin harç hesaplanmadı, tutar çevrilmedi ' +
      've eksik tutarla talep oluşturulmadı. Masraf talebi, kalemler elle girilerek oluşturulabilir.',
    requiredInfo: ['Peşin harç tutarı (TL)'],
    notCalculableItems: RATE_BASED_OPENING_ITEMS,
    caseCurrency,
    basisCurrencies,
    tariffCurrency: tariff,
  };
}

/**
 * <remarks>
 * Çağrıldığı yerler:
 * - CaseService.create() → POST /cases yanıtındaki `openingExpenseRequest` alanı
 * </remarks>
 */
export function buildOpeningExpenseNotCreatedOutcome(
  decision: OpeningExpenseBasisNotCalculable,
  expenseEmailRequested: boolean,
): OpeningExpenseNotCreatedOutcome {
  return {
    status: 'NOT_CREATED',
    reasonCode: decision.reasonCode,
    message: decision.message,
    requiredInfo: decision.requiredInfo,
    notCalculableItems: decision.notCalculableItems,
    caseCurrency: decision.caseCurrency,
    basisCurrencies: decision.basisCurrencies,
    tariffCurrency: decision.tariffCurrency,
    expenseEmailRequested,
    expenseEmailSent: false,
  };
}
