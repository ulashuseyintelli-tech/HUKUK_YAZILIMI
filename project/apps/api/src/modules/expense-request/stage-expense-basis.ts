/**
 * Aşama masraf seti (haciz, satış, yeniden tebligat) — ORANLI kalemlerin matrahı TL olarak hesaplanabilir mi?
 *
 * Ölçülen kusur (main ef16f07f, gerçek HTTP + disposable PostgreSQL): aşama masraf seti haciz harcını ve satış harcını (TL
 * tarifesi oranı) anapara alacak kalemlerinin SAYISINA para birimine bakmadan uygular. 1.000.000 USD anaparalı dosyada
 * haciz seti 4.750 TL, satış seti 13.800 TL bulunuyor — 1.000.000 TL'lik dosyayla AYNI; 1.000.000 USD + 250.000 TRY
 * anaparalı dosyada iki para birimi tek sayıda (1.250.000) toplanıyor. Talep PENDING / BLOCKING kayıt olarak ve muhasebe
 * günlüğüne yazılıyordu.
 *
 * Owner ara kararı (2026-10-01) açılış seti için verildi: kur / matrah sözleşmesi yokken yanlış tutarlı otomatik masraf
 * talebi kayda geçmez; eksik tutar 0 sayılmaz ve talep tamamlanmış gösterilmez. Aşama setleri aynı sınıftır (TL tarifesi
 * oranı × TL olmayan matrah) ve burada aynı kural uygulanır: sözleşme tutarı eksik (kısmi) talebi desteklemediği için
 * set OLUŞTURULMAZ; neden ve tamamlanması gereken bilgi bildirilir. Oranlı kalemi olmayan set (yeniden tebligat) her
 * para biriminde hesaplanabilir: tutarı matraha bağlı değildir.
 *
 * KAPSAM DIŞI (owner kararı): dövizli takipte oranlı kalemin hangi tutar ve kur üzerinden hesaplanacağı; iş akışı
 * yolunda (aşama değişimi → arka plan) oluşturulmayan setin kullanıcıya nasıl gösterileceği.
 *
 * Bu yardımcı HESAP YAPMAZ, tutar ÇEVİRMEZ ve kayıt YAZMAZ; kur tarihi, kur türü ya da matrah kuralı SEÇMEZ.
 *
 * Dayanak: RECEIVABLE-GOVERNANCE REC-FX-002 (yetkili kur sözleşmesi olmadan çevirme yok), REC-FEE-003 (eksik hukuki /
 * tarife verisi sessiz 0 ya da varsayılan üretmez).
 */
import {
  describeExpenseBasisCurrencies,
  OPENING_EXPENSE_TARIFF_CURRENCY,
  OpeningExpenseBasisCalculable,
  OpeningExpenseBasisInput,
  OpeningExpenseNotCalculableItem,
} from './opening-expense-basis';

export const STAGE_EXPENSE_FX_BASIS_POLICY_MISSING = 'STAGE_EXPENSE_FX_BASIS_POLICY_MISSING' as const;

/**
 * Tutarı matrahtan BAĞIMSIZ (sabit ya da adet bazlı) hesaplayıcılar. Bu listede OLMAYAN her hesaplayıcı matraha bağlı
 * sayılır: yeni bir hesaplayıcı sınıflandırılmadan eklenirse dövizli dosyada set oluşturulmaz (güvenli taraf).
 */
const BASIS_INDEPENDENT_CALCULATORS: ReadonlySet<string> = new Set([
  'calculateBasvurmaHarci',
  'calculateVekaletHarci',
  'calculateTebligatGideri',
  'calculateDosyaGideri',
  'calculateVekaletPulu',
  'calculateHacizYolluk',
  'calculateIlanGideri',
]);

export interface StageExpenseTemplateItem {
  readonly code: string;
  readonly label: string;
  readonly calculator: string;
}

/** Masraf seti şablonunun bu kararda kullanılan kısmı (EXPENSE_SET_TEMPLATES girdileriyle yapısal olarak uyumludur). */
export interface StageExpenseTemplate {
  readonly code: string;
  readonly name: string;
  readonly items: readonly StageExpenseTemplateItem[];
}

export interface StageExpenseBasisNotCalculable {
  readonly calculable: false;
  readonly reasonCode: typeof STAGE_EXPENSE_FX_BASIS_POLICY_MISSING;
  readonly stageCode: string;
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

export type StageExpenseBasisDecision = OpeningExpenseBasisCalculable | StageExpenseBasisNotCalculable;

/**
 * Şablonun matraha bağlı (tarife oranı uygulanan) kalemleri.
 *
 * <remarks>
 * Çağrıldığı yerler:
 * - evaluateStageExpenseBasis()
 * </remarks>
 */
export function basisDependentItemsOfTemplate(template: StageExpenseTemplate): OpeningExpenseNotCalculableItem[] {
  return template.items
    .filter((item) => !BASIS_INDEPENDENT_CALCULATORS.has(item.calculator))
    .map((item) => ({ itemCode: item.code, label: item.label }));
}

/**
 * <remarks>
 * Çağrıldığı yerler:
 * - ExpenseRequestService.createStageExpenseSet() → POST /expense-requests/case/:caseId/stage/:stageCode ve
 *   WorkflowEngine.updateCaseStage() (aşama değişiminde arka planda)
 * </remarks>
 */
export function evaluateStageExpenseBasis(template: StageExpenseTemplate, input: OpeningExpenseBasisInput): StageExpenseBasisDecision {
  const notCalculableItems = basisDependentItemsOfTemplate(template);
  // Oranlı kalemi olmayan setin tutarı matraha bağlı değildir → dosya para birimi kararı etkilemez
  if (notCalculableItems.length === 0) {
    return { calculable: true };
  }

  const { tariffCurrencyOnly, caseCurrency, basisCurrencies, context } = describeExpenseBasisCurrencies(input);
  if (tariffCurrencyOnly) {
    return { calculable: true };
  }

  const labels = notCalculableItems.map((item) => item.label).join(', ');
  return {
    calculable: false,
    reasonCode: STAGE_EXPENSE_FX_BASIS_POLICY_MISSING,
    stageCode: template.code,
    message:
      `${template.name} talebi otomatik oluşturulmadı: ${context}. ${labels} TL tarifesindeki oranla hesaplanır; alacağın TL ` +
      `karşılığı için kullanılacak kur (tarih ve tür) sistemde tanımlı değildir. ${labels} hesaplanmadı, tutar çevrilmedi ` +
      've eksik tutarla talep oluşturulmadı. Masraf talebi, kalemler elle girilerek oluşturulabilir.',
    requiredInfo: notCalculableItems.map((item) => `${item.label} tutarı (TL)`),
    notCalculableItems,
    caseCurrency,
    basisCurrencies,
    tariffCurrency: OPENING_EXPENSE_TARIFF_CURRENCY,
  };
}
