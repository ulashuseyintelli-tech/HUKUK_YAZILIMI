/**
 * Otomatik açılış masraf talebi — "oluşturulmadı" sonucunun gösterimi.
 *
 * Dövizli / karma dosyada peşin harç matrahı TL olarak hesaplanamaz; sunucu yanlış ya da eksik tutarlı talebi kayda
 * geçirmez ve nedeni bildirir. Buradaki yardımcılar yalnız sunucunun kararını ve metnini GÖSTERİR: istemci hesap
 * yapmaz, kur ya da tutar önermez, hangi dosyada talep oluşmayacağına kendisi karar vermez.
 */

export interface OpeningExpenseNotCalculableItem {
  itemCode: string;
  label: string;
}

/** Sunucunun "peşin harç hesaplanamaz" kararı (GET /expense-requests/case/:caseId/opening-status). */
export interface OpeningExpenseNotCalculable {
  calculable: false;
  reasonCode: string;
  message: string;
  requiredInfo: string[];
  notCalculableItems: OpeningExpenseNotCalculableItem[];
  caseCurrency: string;
  basisCurrencies: string[];
  tariffCurrency: string;
}

export interface OpeningExpenseAutomationStatus {
  caseId: string;
  clientAssigned: boolean;
  openingRequestExists: boolean;
  activeExpenseRequestCount: number;
  automaticCalculation: { calculable: true } | OpeningExpenseNotCalculable;
}

/** Dosya açılış yanıtındaki `openingExpenseRequest` alanı (yalnız talep OLUŞTURULMADIYSA gelir). */
export interface OpeningExpenseNotCreatedOutcome extends Omit<OpeningExpenseNotCalculable, "calculable"> {
  status: "NOT_CREATED";
  expenseEmailRequested: boolean;
  expenseEmailSent: boolean;
}

const requiredInfoSentence = (requiredInfo: readonly string[] | undefined): string =>
  requiredInfo && requiredInfo.length > 0 ? ` Gereken bilgi: ${requiredInfo.join("; ")}.` : "";

/** Dosya açılış yanıtındaki sonucun kullanıcıya gösterilecek özeti (talep oluşturulduysa / alan yoksa null). */
export function describeOpeningExpenseOutcome(outcome: OpeningExpenseNotCreatedOutcome | null | undefined): string | null {
  if (!outcome || outcome.status !== "NOT_CREATED") return null;
  const reason = String(outcome.message || outcome.reasonCode || "").trim();
  const email = outcome.expenseEmailRequested && !outcome.expenseEmailSent ? " Masraf e-postası GÖNDERİLMEDİ." : "";
  return `Dosya oluşturuldu. ${reason}${requiredInfoSentence(outcome.requiredInfo)}${email}`;
}

export interface OpeningExpenseNotice {
  message: string;
  requiredInfo: string[];
}

/**
 * Dosya sayfasındaki kalıcı uyarı: müvekkilli dosyada HİÇ masraf talebi yokken ve sunucu otomatik hesabın
 * yapılamadığını bildiriyorsa gösterilir. Talep varsa (otomatik ya da elle) uyarı gösterilmez.
 */
export function openingExpenseNoticeOf(status: OpeningExpenseAutomationStatus | null | undefined): OpeningExpenseNotice | null {
  if (!status || !status.clientAssigned) return null;
  if (status.openingRequestExists || status.activeExpenseRequestCount > 0) return null;
  const calculation = status.automaticCalculation;
  if (!calculation || calculation.calculable) return null;
  return { message: calculation.message, requiredInfo: calculation.requiredInfo ?? [] };
}
