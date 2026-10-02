/**
 * Açılış masraf talebi — MASRAF E-POSTASI GÖNDERİLEMEDİ sonucu (neden + tamamlanması gereken bilgi).
 *
 * Ölçülen kusur (main 6681b1d5, gerçek tarayıcı + derlenmiş API + disposable PostgreSQL + yerel sahte SMTP alıcısı):
 * sihirbazdan "Oluştur ve Masraf Maili Gönder" ile açılan TL dosyada e-posta gönderilemediğinde (varsayılan banka hesabı
 * yok / birden fazla, IBAN yok, müvekkil e-postası yok, SMTP ayarı yok, şablon yok, SMTP reddi, SMTP'ye ulaşılamadı)
 * talep PENDING kalıyor, kullanıcıya hiçbir şey gösterilmiyor, sunucu günlüğü yine "Masraf talebi maili gönderildi"
 * yazıyordu; dosya ise müvekkilden hiç istenmemiş ödemeyi bekleyerek UYAP masraf kapısında kilitli kalıyordu.
 *
 * Owner kararı (2026-10-01): sonuç kullanıcıya gösterilir — dosya açılış yanıtında (sihirbaz uyarısı; e-posta denemesi
 * en çok 10 sn beklenir), dosya sayfasında kalıcı olarak ve görev olarak; günlük satırı sonuca göre yazılır. Başarılı
 * gönderimde akış ve metinler DEĞİŞMEZ. E-postanın gönderilme kuralları (owner sözleşmesi W4: eksik / muğlak ödeme
 * talimatıyla müvekkile e-posta çıkmaz) DEĞİŞMEZ; bu yardımcı yalnız kararı ve nedenini ADLANDIRIR.
 *
 * Bu yardımcı kayıt YAZMAZ, e-posta GÖNDERMEZ ve yeniden deneme kuralı SEÇMEZ.
 */

/** Dosya açılış yanıtının e-posta denemesi için beklediği en uzun süre (owner kararı 2026-10-01). */
export const OPENING_EXPENSE_EMAIL_WAIT_MS = 10_000;

/** Bir masraf talebinin e-posta denemesi sonucunu taşıyan denetim kaydı eylemleri (`ExpenseAuditLog.action`). */
export const EXPENSE_EMAIL_ATTEMPT_ACTIONS = ['EMAIL_SENT', 'EMAIL_FAILED'] as const;

export const OPENING_EXPENSE_EMAIL_REASON_CODES = [
  'PAYMENT_ACCOUNT_MISSING',
  'PAYMENT_ACCOUNT_AMBIGUOUS',
  'PAYMENT_IBAN_MISSING',
  'PAYMENT_ACCOUNT_HOLDER_MISSING',
  'REQUEST_ITEMS_INVALID',
  'TEMPLATE_MISSING',
  'RECIPIENT_MISSING',
  'SMTP_NOT_CONFIGURED',
  'DELIVERY_REJECTED',
  'DELIVERY_UNCERTAIN',
  'DELIVERY_NOT_CONFIRMED',
  'OPENING_REQUEST_NOT_CREATED',
  'SEND_ERROR',
] as const;

export type OpeningExpenseEmailReasonCode = (typeof OPENING_EXPENSE_EMAIL_REASON_CODES)[number];

/** Dağıtıcı düzeyindeki başarısızlığın güvenli (ham sağlayıcı metni içermeyen) nedeni. */
export const EXPENSE_EMAIL_DISPATCH_FAILURE_REASONS = [
  'TEMPLATE_MISSING',
  'RECIPIENT_MISSING',
  'SMTP_NOT_CONFIGURED',
  'DELIVERY_REJECTED',
  'DELIVERY_UNCERTAIN',
] as const;

export type ExpenseEmailDispatchFailureReason = (typeof EXPENSE_EMAIL_DISPATCH_FAILURE_REASONS)[number];

export interface OpeningExpenseEmailFailure {
  readonly reasonCode: OpeningExpenseEmailReasonCode;
  /** Kullanıcıya gösterilecek neden (tam cümle). */
  readonly message: string;
  /** E-postanın gönderilebilmesi için tamamlanması gereken bilgi. */
  readonly requiredInfo: readonly string[];
  /** Görev başlığının dosya numarasından önceki kısmı. */
  readonly taskTitle: string;
}

/** Dosya açılış yanıtındaki sonuç: açılış masraf talebi oluşturuldu, istenen masraf e-postası GÖNDERİLEMEDİ. */
export interface OpeningExpenseEmailNotSentOutcome {
  readonly status: 'EMAIL_NOT_SENT';
  readonly reasonCode: OpeningExpenseEmailReasonCode;
  readonly message: string;
  readonly requiredInfo: readonly string[];
  readonly expenseEmailRequested: true;
  readonly expenseEmailSent: false;
}

/** Dosya açılış yanıtındaki sonuç: e-posta denemesi bekleme süresi içinde sonuçlanmadı (arka planda sürüyor). */
export interface OpeningExpenseEmailResultPendingOutcome {
  readonly status: 'EMAIL_RESULT_PENDING';
  readonly reasonCode: 'RESULT_PENDING';
  readonly message: string;
  readonly requiredInfo: readonly string[];
  readonly expenseEmailRequested: true;
  readonly expenseEmailSent: false;
}

/** Dosya sayfası (GET .../opening-status → `openingRequestEmail`): açılış talebinin son e-posta denemesi başarısız. */
export interface OpeningExpenseEmailNotSentStatus {
  readonly status: 'NOT_SENT';
  readonly reasonCode: OpeningExpenseEmailReasonCode;
  readonly message: string;
  readonly requiredInfo: readonly string[];
  /** Son denemenin kayıt anı (ISO 8601). */
  readonly attemptedAt: string;
}

const NOT_RESENT = 'Bu e-posta kendiliğinden yeniden gönderilmez.';
const TITLE_NOT_SENT = 'Masraf e-postası gönderilemedi';
const TITLE_NOT_CONFIRMED = 'Masraf e-postası doğrulanamadı';

const FAILURES: Record<OpeningExpenseEmailReasonCode, Omit<OpeningExpenseEmailFailure, 'reasonCode'>> = {
  PAYMENT_ACCOUNT_MISSING: {
    message: `Büroda varsayılan banka hesabı tanımlı değil; ödeme yapılacak hesap bildirilemediği için masraf e-postası gönderilmedi. ${NOT_RESENT}`,
    requiredInfo: ['Büro Ayarları → Banka Hesapları: tek bir varsayılan hesap'],
    taskTitle: TITLE_NOT_SENT,
  },
  PAYMENT_ACCOUNT_AMBIGUOUS: {
    message: `Büroda birden fazla varsayılan banka hesabı var; ödeme yapılacak hesap belirsiz olduğu için masraf e-postası gönderilmedi. ${NOT_RESENT}`,
    requiredInfo: ['Büro Ayarları → Banka Hesapları: tek bir varsayılan hesap'],
    taskTitle: TITLE_NOT_SENT,
  },
  PAYMENT_IBAN_MISSING: {
    message: `Varsayılan banka hesabında IBAN yok; masraf e-postası gönderilmedi. ${NOT_RESENT}`,
    requiredInfo: ['Varsayılan banka hesabının IBAN bilgisi'],
    taskTitle: TITLE_NOT_SENT,
  },
  PAYMENT_ACCOUNT_HOLDER_MISSING: {
    message: `Ödeme hesabının sahibi (hesap sahibi ya da büro adı) belirlenemedi; masraf e-postası gönderilmedi. ${NOT_RESENT}`,
    requiredInfo: ['Hesap sahibi ya da büro adı'],
    taskTitle: TITLE_NOT_SENT,
  },
  REQUEST_ITEMS_INVALID: {
    message: `Masraf talebinde geçerli kalem ya da tutar yok; masraf e-postası gönderilmedi. ${NOT_RESENT}`,
    requiredInfo: ['Masraf talebinin kalemleri ve tutarları'],
    taskTitle: TITLE_NOT_SENT,
  },
  TEMPLATE_MISSING: {
    message: `Masraf talebi e-posta şablonu tanımlı değil; masraf e-postası gönderilmedi. ${NOT_RESENT}`,
    requiredInfo: ['Masraf talebi e-posta şablonu (EXPENSE_REQUEST)'],
    taskTitle: TITLE_NOT_SENT,
  },
  RECIPIENT_MISSING: {
    message: `Müvekkilin e-posta adresi kayıtlı değil; masraf e-postası gönderilmedi. ${NOT_RESENT}`,
    requiredInfo: ['Müvekkilin e-posta adresi'],
    taskTitle: TITLE_NOT_SENT,
  },
  SMTP_NOT_CONFIGURED: {
    message: `Büronun e-posta gönderim (SMTP) ayarları yapılmamış; masraf e-postası gönderilmedi. ${NOT_RESENT}`,
    requiredInfo: ['Büro Ayarları → SMTP ayarları'],
    taskTitle: TITLE_NOT_SENT,
  },
  DELIVERY_REJECTED: {
    message: `E-posta sunucusu iletiyi reddetti; masraf e-postası gönderilmedi. ${NOT_RESENT}`,
    requiredInfo: ['Müvekkilin e-posta adresinin ve büro SMTP ayarlarının doğruluğu'],
    taskTitle: TITLE_NOT_SENT,
  },
  DELIVERY_UNCERTAIN: {
    message: `E-posta sunucusundan yanıt alınamadı; masraf e-postasının gönderildiği doğrulanamadı. ${NOT_RESENT}`,
    requiredInfo: ['Büro SMTP ayarlarının ve e-posta sunucusuna erişimin doğruluğu'],
    taskTitle: TITLE_NOT_CONFIRMED,
  },
  DELIVERY_NOT_CONFIRMED: {
    message: `Masraf e-postasının gönderildiği doğrulanamadı. ${NOT_RESENT}`,
    requiredInfo: [],
    taskTitle: TITLE_NOT_CONFIRMED,
  },
  OPENING_REQUEST_NOT_CREATED: {
    message: 'Açılış masraf talebi oluşturulamadı; masraf e-postası gönderilmedi.',
    requiredInfo: [],
    taskTitle: TITLE_NOT_SENT,
  },
  SEND_ERROR: {
    message: `Masraf e-postası gönderilirken beklenmeyen bir hata oluştu; e-posta gönderilmedi. ${NOT_RESENT}`,
    requiredInfo: [],
    taskTitle: TITLE_NOT_SENT,
  },
};

/** Fail-closed kapıların denetim kaydındaki sonuç kodu → neden. */
const GATE_OUTCOME_REASONS: Record<string, OpeningExpenseEmailReasonCode> = {
  'default-account-missing': 'PAYMENT_ACCOUNT_MISSING',
  'default-account-ambiguous': 'PAYMENT_ACCOUNT_AMBIGUOUS',
  'iban-missing-fail-closed': 'PAYMENT_IBAN_MISSING',
  'account-holder-missing': 'PAYMENT_ACCOUNT_HOLDER_MISSING',
  'items-missing': 'REQUEST_ITEMS_INVALID',
  'non-positive-amount': 'REQUEST_ITEMS_INVALID',
};

const isDispatchFailureReason = (value: unknown): value is ExpenseEmailDispatchFailureReason =>
  typeof value === 'string' && (EXPENSE_EMAIL_DISPATCH_FAILURE_REASONS as readonly string[]).includes(value);

/**
 * `EMAIL_FAILED` denetim kaydının ayrıntısından neden kodu. Tanınmayan ya da eski (nedensiz) kayıt tahmin edilmez:
 * `DELIVERY_NOT_CONFIRMED` döner.
 *
 * <remarks>
 * Çağrıldığı yerler:
 * - ExpenseRequestService.getOpeningExpenseAutomationStatus() → GET /expense-requests/case/:caseId/opening-status
 * - ExpenseRequestService.recordOpeningExpenseEmailNotSent() → CaseService.create() (POST /cases)
 * </remarks>
 */
export function openingExpenseEmailReasonOfAuditDetails(details: unknown): OpeningExpenseEmailReasonCode {
  if (!details || typeof details !== 'object' || Array.isArray(details)) return 'DELIVERY_NOT_CONFIRMED';
  const { outcome, reason } = details as { outcome?: unknown; reason?: unknown };
  if (typeof outcome === 'string' && GATE_OUTCOME_REASONS[outcome]) return GATE_OUTCOME_REASONS[outcome];
  if (outcome === 'delivery-not-confirmed' && isDispatchFailureReason(reason)) return reason;
  return 'DELIVERY_NOT_CONFIRMED';
}

/**
 * <remarks>
 * Çağrıldığı yerler:
 * - ExpenseRequestService.getOpeningExpenseAutomationStatus(), ExpenseRequestService.recordOpeningExpenseEmailNotSent()
 * - CaseService.create() → görev / neden okunamadığında genel sonuç
 * </remarks>
 */
export function describeOpeningExpenseEmailFailure(reasonCode: OpeningExpenseEmailReasonCode): OpeningExpenseEmailFailure {
  return { reasonCode, ...FAILURES[reasonCode] };
}

/**
 * <remarks>
 * Çağrıldığı yerler:
 * - CaseService.create() → POST /cases yanıtındaki `openingExpenseRequest` alanı (yalnız e-posta istenmiş ve gönderilememişse)
 * </remarks>
 */
export function buildOpeningExpenseEmailNotSentOutcome(failure: OpeningExpenseEmailFailure): OpeningExpenseEmailNotSentOutcome {
  return {
    status: 'EMAIL_NOT_SENT',
    reasonCode: failure.reasonCode,
    message: failure.message,
    requiredInfo: failure.requiredInfo,
    expenseEmailRequested: true,
    expenseEmailSent: false,
  };
}

/**
 * <remarks>
 * Çağrıldığı yerler:
 * - CaseService.create() → e-posta denemesi OPENING_EXPENSE_EMAIL_WAIT_MS içinde sonuçlanmadıysa
 * </remarks>
 */
export function buildOpeningExpenseEmailResultPendingOutcome(): OpeningExpenseEmailResultPendingOutcome {
  return {
    status: 'EMAIL_RESULT_PENDING',
    reasonCode: 'RESULT_PENDING',
    message:
      'Masraf e-postasının sonucu henüz belli değil. Gönderilemezse dosya sayfasındaki Hesap Özeti panelinde ve Görevler sayfasında bildirilir.',
    requiredInfo: [],
    expenseEmailRequested: true,
    expenseEmailSent: false,
  };
}

/**
 * <remarks>
 * Çağrıldığı yerler:
 * - ExpenseRequestService.getOpeningExpenseAutomationStatus() → GET /expense-requests/case/:caseId/opening-status
 * </remarks>
 */
export function buildOpeningExpenseEmailNotSentStatus(failure: OpeningExpenseEmailFailure, attemptedAt: Date): OpeningExpenseEmailNotSentStatus {
  return {
    status: 'NOT_SENT',
    reasonCode: failure.reasonCode,
    message: failure.message,
    requiredInfo: failure.requiredInfo,
    attemptedAt: attemptedAt.toISOString(),
  };
}
