/**
 * Otomatik açılış masraf talebi — "oluşturulmadı" sonucunun gösterimi.
 *
 * Dövizli / karma dosyada peşin harç matrahı TL olarak hesaplanamaz; sunucu yanlış ya da eksik tutarlı talebi kayda
 * geçirmez ve nedeni bildirir. Buradaki yardımcılar yalnız sunucunun kararını ve metnini GÖSTERİR: istemci hesap
 * yapmaz, kur ya da tutar önermez, hangi dosyada talep oluşmayacağına kendisi karar vermez.
 *
 * Aynı yüzeyler, talep oluşup istenen masraf e-postası GÖNDERİLEMEDİĞİNDE de sunucunun nedenini gösterir (dosya açılış
 * yanıtı + dosya sayfası). E-posta gönderildiyse sunucu alan göndermez ve hiçbir metin değişmez.
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

/**
 * Açılış masraf talebinin istenen e-postası gönderilemedi (GET .../opening-status → `openingRequestEmail`).
 * Alan yalnız talep hâlâ gönderilmemişken ve SON e-posta denemesi başarısızken gelir; neden ve metin sunucudandır.
 */
export interface OpeningExpenseEmailNotSentStatus {
  status: "NOT_SENT";
  reasonCode: string;
  message: string;
  requiredInfo: string[];
  attemptedAt?: string;
}

export interface OpeningExpenseAutomationStatus {
  caseId: string;
  clientAssigned: boolean;
  openingRequestExists: boolean;
  activeExpenseRequestCount: number;
  automaticCalculation: { calculable: true } | OpeningExpenseNotCalculable;
  openingRequestEmail?: OpeningExpenseEmailNotSentStatus;
}

/** Dosya açılış yanıtındaki `openingExpenseRequest` alanı (yalnız talep OLUŞTURULMADIYSA gelir). */
export interface OpeningExpenseNotCreatedOutcome extends Omit<OpeningExpenseNotCalculable, "calculable"> {
  status: "NOT_CREATED";
  expenseEmailRequested: boolean;
  expenseEmailSent: boolean;
}

/**
 * Dosya açılış yanıtındaki `openingExpenseRequest` alanı — talep oluştu ama istenen masraf e-postası gönderilemedi
 * (`EMAIL_NOT_SENT`) ya da e-posta denemesi yanıt süresinde sonuçlanmadı (`EMAIL_RESULT_PENDING`). E-posta
 * gönderildiyse alan gelmez.
 */
export interface OpeningExpenseEmailOutcome {
  status: "EMAIL_NOT_SENT" | "EMAIL_RESULT_PENDING";
  reasonCode: string;
  message: string;
  requiredInfo: string[];
  expenseEmailRequested: boolean;
  expenseEmailSent: boolean;
}

export type OpeningExpenseCaseOpenOutcome = OpeningExpenseNotCreatedOutcome | OpeningExpenseEmailOutcome;

const requiredInfoSentence = (requiredInfo: readonly string[] | undefined): string =>
  requiredInfo && requiredInfo.length > 0 ? ` Gereken bilgi: ${requiredInfo.join("; ")}.` : "";

/**
 * Dosya açılış yanıtındaki sonucun kullanıcıya gösterilecek özeti (alan yoksa — talep oluşturuldu ve istenen e-posta
 * gönderildi / e-posta istenmedi — null).
 */
export function describeOpeningExpenseOutcome(outcome: OpeningExpenseCaseOpenOutcome | null | undefined): string | null {
  if (!outcome) return null;
  const reason = String(outcome.message || outcome.reasonCode || "").trim();
  if (outcome.status === "NOT_CREATED") {
    const email = outcome.expenseEmailRequested && !outcome.expenseEmailSent ? " Masraf e-postası GÖNDERİLMEDİ." : "";
    return `Dosya oluşturuldu. ${reason}${requiredInfoSentence(outcome.requiredInfo)}${email}`;
  }
  if (outcome.status === "EMAIL_NOT_SENT" || outcome.status === "EMAIL_RESULT_PENDING") {
    // Neden cümlesi sunucudandır (gönderilmedi / doğrulanamadı / sonuç henüz belli değil ayrımını sunucu yapar)
    return `Dosya oluşturuldu. ${reason}${requiredInfoSentence(outcome.requiredInfo)}`;
  }
  return null;
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

/**
 * Dosya sayfasındaki kalıcı uyarı: açılış masraf talebinin istenen e-postası gönderilemedi. Sunucu alanı göndermediyse
 * (e-posta gönderildi / hiç istenmedi / talep yok) uyarı yoktur; istemci neden üretmez.
 */
export function openingExpenseEmailNoticeOf(status: OpeningExpenseAutomationStatus | null | undefined): OpeningExpenseNotice | null {
  const email = status?.openingRequestEmail;
  if (!email || email.status !== "NOT_SENT") return null;
  const message = String(email.message || email.reasonCode || "").trim();
  if (!message) return null;
  return { message, requiredInfo: email.requiredInfo ?? [] };
}
