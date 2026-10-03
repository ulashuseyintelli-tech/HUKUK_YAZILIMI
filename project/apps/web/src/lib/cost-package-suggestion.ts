/**
 * Masraf paketi önerisi — EKSİK önerinin gösterimi.
 *
 * Dövizli / karma dosyada matraha bağlı (oranlı) paket kalemi TL olarak hesaplanamaz; sunucu o kalem için tutar üretmez
 * (0 da yazmaz) ve nedeni bildirir. Buradaki tipler ve yardımcı yalnız sunucunun kararını ve metnini GÖSTERMEK içindir:
 * istemci oranlı kalemi kendisi hesaplamaz, kur ya da tutar önermez, hangi kalemin hesaplanamayacağına kendisi karar vermez.
 */

/** Önerisi hesaplanamayan paket kalemi (tutarı YOKTUR; 0 değildir). */
export interface CostPackageNotCalculableItem {
  itemCode: string;
  label: string;
  isEditable: boolean;
  sortOrder: number;
}

/** POST /cost-packages/compute yanıtındaki `incompleteSuggestion` alanı (yalnız öneri EKSİKSE gelir). */
export interface CostPackageIncompleteSuggestion {
  reasonCode: string;
  message: string;
  requiredInfo: string[];
  notCalculableItems: CostPackageNotCalculableItem[];
  caseCurrency: string;
  basisCurrencies: string[];
  tariffCurrency: string;
}

/** Hesaplanamayan kalemlerin adları ("Peşin Harç" ya da "Peşin Harç, Tahsil Harcı"); eksik öneri yoksa boş. */
export function notCalculableLabels(incomplete: CostPackageIncompleteSuggestion | null | undefined): string {
  return (incomplete?.notCalculableItems ?? []).map((item) => item.label).join(", ");
}
