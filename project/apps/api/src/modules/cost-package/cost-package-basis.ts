/**
 * Masraf paketi önerisi (POST /cost-packages/compute) — MATRAHA BAĞLI (oranlı) kalemin önerisi hesaplanabilir mi?
 *
 * Ölçülen kusur (main 8727e5d2, gerçek HTTP + disposable PostgreSQL): paket hesabı yüzde kuralını (`calcRule.type =
 * 'percentage'`, `base: 'principalAmount'`) dosya anaparasının SAYISINA para birimine bakmadan uygular. "UYAP Öncesi /
 * Takip Açılış Masrafları" paketinde 1.000.000 USD / EUR anaparalı dosyanın peşin harç önerisi 5.000 TL, paket toplamı
 * 5.857,90 TL — 1.000.000 TL'lik dosyayla AYNI; USD + TRY anaparalı dosyada da aynı. Öneri masraf talebi penceresine dolu
 * gelir; kaydedilirse PENDING / BLOCKING talep ve muhasebe günlüğü olur.
 *
 * Owner ara kararı (2026-10-01): kur / matrah sözleşmesi yokken yanlış tutarlı otomatik masraf tutarı kesinleşmiş gibi
 * oluşmaz / sunulmaz; eksik tutar 0 sayılmaz; sessizce atlanmaz, neden ve tamamlanması gereken bilgi gösterilir; TL
 * dosyanın davranışı değişmez.
 *
 * Bu yardımcı HESAP YAPMAZ, tutar ÇEVİRMEZ ve kayıt YAZMAZ; kur tarihi, kur türü ya da matrah kuralı SEÇMEZ. Yalnız şunu
 * bildirir: hangi kalemin önerisi matraha bağlıdır ve matrah TL değilken eksik kalan öneri nasıl anlatılır? Matrahın TL
 * olup olmadığı kararı açılış masraf setiyle AYNI kaynaktan gelir (opening-expense-basis.ts).
 *
 * KAPSAM DIŞI (owner kararı): dövizli takipte oranlı kalemin hangi tutar ve kur üzerinden hesaplanacağı; istekle gelen
 * anapara sayısının (`principalAmount`) para birimi — beyan edilmediği için dövizli / karma dosyada TL matrah sayılmaz.
 *
 * Dayanak: RECEIVABLE-GOVERNANCE REC-FX-002 (yetkili kur sözleşmesi olmadan çevirme yok), REC-FEE-003 (eksik hukuki /
 * tarife verisi sessiz 0 ya da varsayılan üretmez).
 */
import type { PrismaClient } from '@prisma/client';
import {
  evaluateOpeningExpenseBasis,
  openingExpenseBasisInputOfCase,
  OPENING_EXPENSE_TARIFF_CURRENCY,
  OpeningExpenseBasisNotCalculable,
} from '@/modules/expense-request/opening-expense-basis';

export const COST_PACKAGE_FX_BASIS_POLICY_MISSING = 'COST_PACKAGE_FX_BASIS_POLICY_MISSING' as const;

/**
 * Yüzde kuralının para birimi TAŞIMAYAN (adet) tabanları. Bu listede OLMAYAN her taban parasal matrah sayılır: yeni bir
 * taban sınıflandırılmadan eklenirse dövizli dosyada kalemin önerisi üretilmez (güvenli taraf).
 */
const COUNT_BASES: ReadonlySet<string> = new Set(['debtorCount', 'tebligatCount']);

/** Önerisi hesaplanamayan paket kalemi: kalemin tutar DIŞINDAKİ alanları (tutarı YOKTUR; 0 değildir). */
export interface CostPackageNotCalculableItem {
  readonly itemCode: string;
  readonly label: string;
  readonly isEditable: boolean;
  readonly sortOrder: number;
}

/** Eksik öneri: paket kalemlerinin bir kısmı hesaplanamadı. Yalnız eksik sonucu kabul ettiğini beyan eden çağırana döner. */
export interface CostPackageIncompleteSuggestion {
  readonly reasonCode: typeof COST_PACKAGE_FX_BASIS_POLICY_MISSING;
  /** Kullanıcıya gösterilecek neden. */
  readonly message: string;
  /** Önerinin tamamlanabilmesi için gereken bilgi. */
  readonly requiredInfo: readonly string[];
  /** Hesaplanamayan kalemler; `items` içinde YER ALMAZ ve `totalSuggested` bunları İÇERMEZ. */
  readonly notCalculableItems: readonly CostPackageNotCalculableItem[];
  readonly caseCurrency: string;
  /** Dosya para birimi dahil, matrahta görülen para birimleri (sıralı, tekil). */
  readonly basisCurrencies: readonly string[];
  readonly tariffCurrency: typeof OPENING_EXPENSE_TARIFF_CURRENCY;
}

/**
 * Kalemin önerisi parasal matraha (dosya anaparasına) mı bağlı? Sabit tutarlı, adet bazlı ve tanınmayan kural türündeki
 * kalemler (bunlar paket varsayılan tutarını alır) matrahtan bağımsızdır.
 *
 * <remarks>
 * Çağrıldığı yerler:
 * - CostPackageService.computeExpenseRequest() → POST /cost-packages/compute, StageTriggerService.handleUyapPrepare()
 * </remarks>
 */
export function isBasisDependentCalcRule(calcRule: unknown): boolean {
  const rule = (calcRule ?? {}) as { type?: unknown; base?: unknown };
  return rule.type === 'percentage' && !COUNT_BASES.has(String(rule.base));
}

/**
 * <remarks>
 * Çağrıldığı yerler:
 * - CostPackageService.computeExpenseRequest() → POST /cost-packages/compute, StageTriggerService.handleUyapPrepare()
 * </remarks>
 */
export function describeIncompleteSuggestion(
  packageName: string,
  notCalculableItems: readonly CostPackageNotCalculableItem[],
  basis: Pick<OpeningExpenseBasisNotCalculable, 'caseCurrency' | 'basisCurrencies' | 'tariffCurrency'>,
): CostPackageIncompleteSuggestion {
  const context =
    basis.basisCurrencies.length === 1
      ? `dosya para birimi ${basis.caseCurrency}`
      : `dosyada birden fazla para birimi var (${basis.basisCurrencies.join(', ')})`;
  const labels = notCalculableItems.map((item) => item.label).join(', ');
  const itemWord = notCalculableItems.length > 1 ? 'kalemler' : 'kalem';

  return {
    reasonCode: COST_PACKAGE_FX_BASIS_POLICY_MISSING,
    message:
      `${packageName} paketinin önerisi eksik: ${context}. ${labels} anaparaya oran uygulanarak TL olarak hesaplanır; alacağın ` +
      `TL karşılığı için kullanılacak kur (tarih ve tür) sistemde tanımlı değildir. ${labels} hesaplanmadı, tutar çevrilmedi ve ` +
      `eksik tutar 0 sayılmadı; paket toplamı bu ${itemWord} olmadan eksiktir. Masraf talebi, kalemler elle girilerek oluşturulabilir.`,
    requiredInfo: notCalculableItems.map((item) => `${item.label} tutarı (TL)`),
    notCalculableItems,
    caseCurrency: basis.caseCurrency,
    basisCurrencies: basis.basisCurrencies,
    tariffCurrency: basis.tariffCurrency,
  };
}

/** Önerinin eksik olup olmadığının okunması için gereken en küçük okuma yüzeyi (PrismaService ve işlem istemcisi uyar). */
export type CostPackageBasisReadClient = Pick<PrismaClient, 'due' | 'claimItem'>;

/**
 * Paketin matraha bağlı (oranlı) kalemleri bu dosyada hesaplanabiliyor mu? Hesaplanamıyorsa eksik öneriyi anlatır;
 * paket oranlı kalem içermiyorsa ya da matrah TL ise null döner. SALT OKUMA: hesap yapmaz, tutar çevirmez, kayıt yazmaz.
 * Matrah, açılış masraf setiyle AYNI kayıtlardan okunur: anapara kalemleri (Due), yoksa anapara alacak kalemleri.
 *
 * <remarks>
 * Çağrıldığı yerler:
 * - CostPackageService.computeExpenseRequest() → POST /cost-packages/compute, StageTriggerService.handleUyapPrepare()
 * - ExpenseRequestService.createFromPackage() → POST /expense-requests/from-package (eksik paketten kayıt reddi)
 * </remarks>
 */
export async function loadIncompleteSuggestion(
  client: CostPackageBasisReadClient,
  caseRow: { id: string; currency: string },
  pkg: {
    name: string;
    items: ReadonlyArray<{ itemCode: string; label: string; isEditable: boolean; sortOrder: number; calcRule: unknown }>;
  },
): Promise<CostPackageIncompleteSuggestion | null> {
  const notCalculableItems: CostPackageNotCalculableItem[] = pkg.items
    .filter((item) => isBasisDependentCalcRule(item.calcRule))
    .map((item) => ({ itemCode: item.itemCode, label: item.label, isEditable: item.isEditable, sortOrder: item.sortOrder }));
  if (notCalculableItems.length === 0) {
    return null;
  }

  const [dues, claimItems] = await Promise.all([
    client.due.findMany({ where: { caseId: caseRow.id, type: 'PRINCIPAL' }, select: { currency: true } }),
    client.claimItem.findMany({ where: { caseId: caseRow.id, itemType: 'PRINCIPAL' }, select: { currency: true } }),
  ]);
  const basis = evaluateOpeningExpenseBasis(openingExpenseBasisInputOfCase({ currency: caseRow.currency, dues, claimItems }));

  return basis.calculable ? null : describeIncompleteSuggestion(pkg.name, notCalculableItems, basis);
}

/**
 * Eksik öneri reddinin (409) gövdesi: tutar, kalem listesi ya da toplam İÇERMEZ; yalnız neden ve gereken bilgi.
 *
 * <remarks>
 * Çağrıldığı yerler:
 * - CostPackageService.computeExpenseRequest() (beyansız çağıran)
 * - ExpenseRequestService.createFromPackage() (eksik paketten kayıt)
 * </remarks>
 */
export function incompleteSuggestionConflictBody(suggestion: CostPackageIncompleteSuggestion) {
  return {
    code: suggestion.reasonCode,
    message: suggestion.message,
    requiredInfo: suggestion.requiredInfo,
    notCalculableItems: suggestion.notCalculableItems,
    caseCurrency: suggestion.caseCurrency,
    basisCurrencies: suggestion.basisCurrencies,
    tariffCurrency: suggestion.tariffCurrency,
  };
}
