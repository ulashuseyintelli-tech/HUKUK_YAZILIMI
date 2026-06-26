/**
 * ActionCode Enum
 * 
 * Sistemdeki tüm aksiyonların benzersiz kodları.
 * Her aksiyon için risk seviyesi ve scope bilgisi tanımlanmıştır.
 * 
 * @see docs/high-risk-action-matrix.md
 * @see docs/decision-point-inventory.md
 */

export enum ActionCode {
  // ============================================
  // UYAP Actions
  // ============================================
  
  /** UYAP'a dosya gönderimi - HIGH risk, geri alınamaz */
  UYAP_SEND = 'UYAP_SEND',
  
  /** UYAP sorgulaması - LOW risk, sadece okuma */
  UYAP_QUERY = 'UYAP_QUERY',

  // ============================================
  // Expense Actions
  // ============================================
  
  /** Masraf talebi oluşturma - MEDIUM risk, müvekkile maliyet */
  REQUEST_EXPENSE = 'REQUEST_EXPENSE',
  
  /** Masraf onaylama/kesinleştirme - HIGH risk */
  APPROVE_EXPENSE = 'APPROVE_EXPENSE',
  
  /** Masraf ödemesi kaydetme - LOW risk */
  RECORD_EXPENSE_PAYMENT = 'RECORD_EXPENSE_PAYMENT',

  // ============================================
  // Notification Actions
  // ============================================
  
  /** Tebligat gönderimi - HIGH risk, hukuki süreç başlatır */
  SEND_NOTIFICATION = 'SEND_NOTIFICATION',
  
  /** Borçluya mesaj gönderimi - MEDIUM risk */
  SEND_DEBTOR_MSG = 'SEND_DEBTOR_MSG',
  
  /** Ödeme emri gönderimi - HIGH risk */
  SEND_PAYMENT_ORDER = 'SEND_PAYMENT_ORDER',
  
  /** Tebligat teslim edildi kaydı - MEDIUM risk, süre başlatır */
  NOTIFICATION_DELIVERED = 'NOTIFICATION_DELIVERED',

  // ============================================
  // Asset Query Actions
  // ============================================
  
  /** Varlık sorgulama - LOW risk, sadece okuma */
  QUERY_ASSETS = 'QUERY_ASSETS',
  
  /** Banka hesabı sorgulama - LOW risk, sadece okuma */
  QUERY_BANK_ACCOUNTS = 'QUERY_BANK_ACCOUNTS',
  
  /** Araç sorgulama - LOW risk, sadece okuma */
  QUERY_VEHICLES = 'QUERY_VEHICLES',

  // ============================================
  // Enforcement Actions
  // ============================================
  
  /** Haciz tetikleme - HIGH risk, geri alınamaz */
  TRIGGER_HACIZ = 'TRIGGER_HACIZ',
  
  /** Satış talebi - HIGH risk */
  REQUEST_SALE = 'REQUEST_SALE',
  
  /** İcra takibi başlatma - HIGH risk */
  REQUEST_ENFORCEMENT = 'REQUEST_ENFORCEMENT',
  
  /** Kesinleşme aşamasına geçiş - MEDIUM risk */
  PROCEED_TO_ENFORCEMENT = 'PROCEED_TO_ENFORCEMENT',
  
  /** Tahliye talebi - HIGH risk, kira takipleri için */
  EVICTION_REQUEST = 'EVICTION_REQUEST',

  // ============================================
  // Case Lifecycle Actions
  // ============================================
  
  /** Dosya kapatma - HIGH risk */
  CLOSE_CASE = 'CLOSE_CASE',
  
  /** Dosya sonlandırma (tahsil edildi) - HIGH risk */
  FINALIZE_CASE = 'FINALIZE_CASE',
  
  /** Dosya arşivleme - MEDIUM risk */
  ARCHIVE_CASE = 'ARCHIVE_CASE',
  
  /** Dosya yeniden açma - MEDIUM risk */
  REOPEN_CASE = 'REOPEN_CASE',
  
  /** MTS'den normal takibe dönüşüm - MEDIUM risk */
  CONVERT_FROM_MTS = 'CONVERT_FROM_MTS',
  
  /** Tahsilat kaydı - MEDIUM risk */
  RECORD_COLLECTION = 'RECORD_COLLECTION',
  
  /** Ödeme kaydı - LOW risk */
  RECORD_PAYMENT = 'RECORD_PAYMENT',

  // ============================================
  // Special Case Type Actions
  // ============================================
  
  /** Nafaka dönemi ekleme - LOW risk */
  ADD_NAFAKA_PERIOD = 'ADD_NAFAKA_PERIOD',
  
  /** Döviz kuru güncelleme - LOW risk */
  UPDATE_EXCHANGE_RATE = 'UPDATE_EXCHANGE_RATE',

  // ============================================
  // Guided-Open v1 Permission Leaves (P2a)
  // casePermissions → ActionCode (yetki-agaci-guided-open-final.md §10).
  // ADDITIVE: mevcut yapraklar TEKRAR EKLENMEDİ (UYAP_SEND/UYAP_QUERY/TRIGGER_HACIZ/
  // SEND_NOTIFICATION/CLOSE_CASE/ARCHIVE_CASE/APPROVE_EXPENSE/RECORD_COLLECTION/QUERY_* zaten var).
  // ============================================

  /** Dosya içeriği düzenleme - MEDIUM risk (canEditCase) */
  EDIT_CASE = 'EDIT_CASE',

  /** Evrak/belge oluşturma - MEDIUM risk (canGenerateDocs). NOT: resmî gönderim ≠ bu (UYAP_SEND/SEND_*). */
  GENERATE_DOC = 'GENERATE_DOC',

  /** UYAP senkronizasyonu/çekme - LOW risk (canSyncUYAP). ≠ UYAP_SEND (resmî gönderim) · ≠ UYAP_QUERY (tek-sorgu). */
  SYNC_UYAP = 'SYNC_UYAP',

  /** Finans/hesap özeti görüntüleme - LOW risk (canViewFinance) */
  VIEW_FINANCE = 'VIEW_FINANCE',

  /** Finans/masraf/harç düzenleme - MEDIUM risk (canEditFinance) */
  EDIT_FINANCE = 'EDIT_FINANCE',

  /** Dosya statüsü değiştirme - HIGH risk, hukuki sonuç (canChangeStatus) */
  CHANGE_STATUS = 'CHANGE_STATUS',

  /** Taraf/müvekkil/borçlu bilgisi düzenleme - MEDIUM risk, KVKK (canEditParties) */
  EDIT_PARTIES = 'EDIT_PARTIES',

  /** İmza yetkisi - HIGH risk, hukuki geçerlilik (hasSignatureAuthority → validity-route) */
  SIGN = 'SIGN',

  // ============================================
  // Guided-Open P2b-1 pilot leaves (observe hook; ADDITIVE)
  // ============================================

  /** Dosya (hard) silme - HIGH risk, geri-alınamaz (cases.delete) */
  DELETE_CASE = 'DELETE_CASE',

  /** Hukuki sorumlu avukat atama/değiştirme - HIGH risk, kanonik+ADMIN (legal-responsible) */
  ASSIGN_LEGAL_RESPONSIBLE = 'ASSIGN_LEGAL_RESPONSIBLE',

  /** Ofis kimlik bilgisi (SMTP/SMS) yönetimi - HIGH risk, güvenlik (credential) */
  MANAGE_OFFICE_CREDENTIALS = 'MANAGE_OFFICE_CREDENTIALS',
}

/**
 * Risk seviyeleri
 */
export enum RiskLevel {
  /** Geri alınamaz, mali/hukuki etki */
  HIGH = 'HIGH',
  /** Hukuki sonuç doğurabilir */
  MEDIUM = 'MEDIUM',
  /** Sadece sorgu, yan etkisi yok */
  LOW = 'LOW',
}

/**
 * Her ActionCode için risk seviyesi mapping'i
 */
export const ACTION_RISK_LEVELS: Record<ActionCode, RiskLevel> = {
  // HIGH Risk
  [ActionCode.UYAP_SEND]: RiskLevel.HIGH,
  [ActionCode.SEND_NOTIFICATION]: RiskLevel.HIGH,
  [ActionCode.SEND_PAYMENT_ORDER]: RiskLevel.HIGH,
  [ActionCode.TRIGGER_HACIZ]: RiskLevel.HIGH,
  [ActionCode.REQUEST_SALE]: RiskLevel.HIGH,
  [ActionCode.REQUEST_ENFORCEMENT]: RiskLevel.HIGH,
  [ActionCode.CLOSE_CASE]: RiskLevel.HIGH,
  [ActionCode.FINALIZE_CASE]: RiskLevel.HIGH,
  [ActionCode.EVICTION_REQUEST]: RiskLevel.HIGH,
  [ActionCode.APPROVE_EXPENSE]: RiskLevel.HIGH,

  // MEDIUM Risk
  [ActionCode.REQUEST_EXPENSE]: RiskLevel.MEDIUM,
  [ActionCode.SEND_DEBTOR_MSG]: RiskLevel.MEDIUM,
  [ActionCode.NOTIFICATION_DELIVERED]: RiskLevel.MEDIUM,
  [ActionCode.ARCHIVE_CASE]: RiskLevel.MEDIUM,
  [ActionCode.REOPEN_CASE]: RiskLevel.MEDIUM,
  [ActionCode.CONVERT_FROM_MTS]: RiskLevel.MEDIUM,
  [ActionCode.PROCEED_TO_ENFORCEMENT]: RiskLevel.MEDIUM,
  [ActionCode.RECORD_COLLECTION]: RiskLevel.MEDIUM,

  // LOW Risk
  [ActionCode.UYAP_QUERY]: RiskLevel.LOW,
  [ActionCode.QUERY_ASSETS]: RiskLevel.LOW,
  [ActionCode.QUERY_BANK_ACCOUNTS]: RiskLevel.LOW,
  [ActionCode.QUERY_VEHICLES]: RiskLevel.LOW,
  [ActionCode.RECORD_EXPENSE_PAYMENT]: RiskLevel.LOW,
  [ActionCode.ADD_NAFAKA_PERIOD]: RiskLevel.LOW,
  [ActionCode.UPDATE_EXCHANGE_RATE]: RiskLevel.LOW,
  [ActionCode.RECORD_PAYMENT]: RiskLevel.LOW,

  // Guided-Open v1 (P2a) — Record exhaustive olduğu için zorunlu
  [ActionCode.SIGN]: RiskLevel.HIGH,
  [ActionCode.CHANGE_STATUS]: RiskLevel.HIGH,
  [ActionCode.EDIT_CASE]: RiskLevel.MEDIUM,
  [ActionCode.GENERATE_DOC]: RiskLevel.MEDIUM,
  [ActionCode.EDIT_FINANCE]: RiskLevel.MEDIUM,
  [ActionCode.EDIT_PARTIES]: RiskLevel.MEDIUM,
  [ActionCode.SYNC_UYAP]: RiskLevel.LOW,
  [ActionCode.VIEW_FINANCE]: RiskLevel.LOW,

  // Guided-Open P2b-1 pilot (Record exhaustive zorunlu)
  [ActionCode.DELETE_CASE]: RiskLevel.HIGH,
  [ActionCode.ASSIGN_LEGAL_RESPONSIBLE]: RiskLevel.HIGH,
  [ActionCode.MANAGE_OFFICE_CREDENTIALS]: RiskLevel.HIGH,
};

/**
 * Risk seviyesine göre ActionCode'ları getir
 */
export function getActionsByRiskLevel(level: RiskLevel): ActionCode[] {
  return Object.entries(ACTION_RISK_LEVELS)
    .filter(([_, riskLevel]) => riskLevel === level)
    .map(([actionCode]) => actionCode as ActionCode);
}
