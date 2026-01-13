/**
 * Policy Engine Shared Types
 * 
 * TEK KAYNAK: Tüm policy/gate tanımları buradan import edilmeli
 * 
 * @see ARCHITECTURE.md - Source of Truth Matrix
 */

// ═══════════════════════════════════════════════════════════════════════════
// SCOPE - Aksiyon kapsamı
// ═══════════════════════════════════════════════════════════════════════════

export enum Scope {
  /** Dosya seviyesi */
  CASE = 'CASE',
  /** Borçlu seviyesi */
  DEBTOR = 'DEBTOR',
  /** Varlık seviyesi */
  ASSET = 'ASSET',
  /** Masraf seviyesi */
  EXPENSE = 'EXPENSE',
}

// ═══════════════════════════════════════════════════════════════════════════
// RISK LEVEL - Risk seviyesi
// ═══════════════════════════════════════════════════════════════════════════

export enum RiskLevel {
  /** Geri alınamaz, mali/hukuki etki */
  HIGH = 'HIGH',
  /** Hukuki sonuç doğurabilir */
  MEDIUM = 'MEDIUM',
  /** Sadece sorgu, yan etkisi yok */
  LOW = 'LOW',
}

// ═══════════════════════════════════════════════════════════════════════════
// ACTION CODE - Aksiyon kodları
// ═══════════════════════════════════════════════════════════════════════════

export enum ActionCode {
  // UYAP Actions
  UYAP_SEND = 'UYAP_SEND',
  UYAP_QUERY = 'UYAP_QUERY',

  // Expense Actions
  REQUEST_EXPENSE = 'REQUEST_EXPENSE',
  APPROVE_EXPENSE = 'APPROVE_EXPENSE',
  RECORD_EXPENSE_PAYMENT = 'RECORD_EXPENSE_PAYMENT',

  // Notification Actions
  SEND_NOTIFICATION = 'SEND_NOTIFICATION',
  SEND_DEBTOR_MSG = 'SEND_DEBTOR_MSG',
  SEND_PAYMENT_ORDER = 'SEND_PAYMENT_ORDER',
  NOTIFICATION_DELIVERED = 'NOTIFICATION_DELIVERED',

  // Asset Query Actions
  QUERY_ASSETS = 'QUERY_ASSETS',
  QUERY_BANK_ACCOUNTS = 'QUERY_BANK_ACCOUNTS',
  QUERY_VEHICLES = 'QUERY_VEHICLES',

  // Enforcement Actions
  TRIGGER_HACIZ = 'TRIGGER_HACIZ',
  REQUEST_SALE = 'REQUEST_SALE',
  REQUEST_ENFORCEMENT = 'REQUEST_ENFORCEMENT',
  PROCEED_TO_ENFORCEMENT = 'PROCEED_TO_ENFORCEMENT',
  EVICTION_REQUEST = 'EVICTION_REQUEST',

  // Case Lifecycle Actions
  CLOSE_CASE = 'CLOSE_CASE',
  FINALIZE_CASE = 'FINALIZE_CASE',
  ARCHIVE_CASE = 'ARCHIVE_CASE',
  REOPEN_CASE = 'REOPEN_CASE',
  CONVERT_FROM_MTS = 'CONVERT_FROM_MTS',
  RECORD_COLLECTION = 'RECORD_COLLECTION',

  // Special Case Type Actions
  ADD_NAFAKA_PERIOD = 'ADD_NAFAKA_PERIOD',
  UPDATE_EXCHANGE_RATE = 'UPDATE_EXCHANGE_RATE',
}

// ═══════════════════════════════════════════════════════════════════════════
// DECISION CODE - Karar kodları
// ═══════════════════════════════════════════════════════════════════════════

export enum DecisionCode {
  /** İzin verildi */
  OK = 'OK',
  /** İzin verildi ama uyarı var */
  OK_WITH_WARNING = 'OK_WITH_WARNING',
  /** Gate tarafından bloklandı */
  GATE_BLOCKED = 'GATE_BLOCKED',
  /** Geçersiz state transition */
  INVALID_TRANSITION = 'INVALID_TRANSITION',
  /** Eksik context bilgisi */
  MISSING_CONTEXT = 'MISSING_CONTEXT',
  /** Dosya bulunamadı */
  CASE_NOT_FOUND = 'CASE_NOT_FOUND',
  /** Sistem hatası - bloklandı (HIGH risk) */
  SYSTEM_ERROR_BLOCKED = 'SYSTEM_ERROR_BLOCKED',
  /** Lock timeout */
  LOCK_TIMEOUT = 'LOCK_TIMEOUT',
  /** Concurrent modification */
  CONCURRENT_MODIFICATION = 'CONCURRENT_MODIFICATION',
  /** Resolver hatası - bloklandı */
  RESOLVER_ERROR_BLOCKED = 'RESOLVER_ERROR_BLOCKED',
}

// ═══════════════════════════════════════════════════════════════════════════
// GATE CODE - Gate kodları
// ═══════════════════════════════════════════════════════════════════════════

export enum GateCode {
  // Case-level gates
  CASE_CLOSED = 'CASE_CLOSED',
  CASE_ARCHIVED = 'CASE_ARCHIVED',
  UNPAID_BLOCKING_EXPENSE = 'UNPAID_BLOCKING_EXPENSE',
  NO_ARTICLE_4_REQUEST = 'NO_ARTICLE_4_REQUEST',
  NO_POWER_OF_ATTORNEY = 'NO_POWER_OF_ATTORNEY',
  UYAP_DISABLED = 'UYAP_DISABLED',
  AUTOMATION_DISABLED = 'AUTOMATION_DISABLED',

  // Debtor-level gates
  NO_VALID_ADDRESS = 'NO_VALID_ADDRESS',
  NOTIFICATION_NOT_DELIVERED = 'NOTIFICATION_NOT_DELIVERED',
  WAITING_PERIOD_NOT_ELAPSED = 'WAITING_PERIOD_NOT_ELAPSED',
  HIGH_RISK_DEBTOR = 'HIGH_RISK_DEBTOR',

  // Asset-level gates
  HACIZ_ALREADY_APPLIED = 'HACIZ_ALREADY_APPLIED',

  // Validation gates (from validation-gate module)
  GATE_1_CASE_CREATION = 'GATE_1_CASE_CREATION',
  GATE_2_ORNEK1_GENERATION = 'GATE_2_ORNEK1_GENERATION',
  GATE_3_SERVICE_OF_PROCESS = 'GATE_3_SERVICE_OF_PROCESS',
  GATE_4_UYAP_INTEGRATION = 'GATE_4_UYAP_INTEGRATION',
}

// ═══════════════════════════════════════════════════════════════════════════
// GATE SEVERITY - Gate şiddeti
// ═══════════════════════════════════════════════════════════════════════════

export type GateSeverity = 'HARD' | 'SOFT';

// ═══════════════════════════════════════════════════════════════════════════
// INTERFACES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Gate uyarısı
 */
export interface GateWarning {
  code: string;
  message: string;
  severity: 'INFO' | 'WARNING';
}

/**
 * State bilgisi
 */
export interface StateInfo {
  scope: Scope;
  currentState: string;
  contextId?: string;
  version?: number;
}

/**
 * Gate kontrol sonucu
 */
export interface GateResult {
  /** Bloklandı mı? */
  blocked: boolean;
  /** Bloklayan gate kodu */
  gateCode?: string;
  /** Blok nedeni */
  reason: string;
  /** Gate şiddeti */
  severity?: GateSeverity;
  /** Kullanılan fact key'leri */
  factsUsed?: string[];
  /** Soft gate uyarıları */
  softWarnings?: GateWarning[];
}

/**
 * Aksiyon context'i
 */
export interface ActionContext {
  debtorId?: string;
  assetId?: string;
  expenseId?: string;
  metadata?: Record<string, unknown>;
  expectedStateVersion?: number;
}

/**
 * Policy kararı
 */
export interface PolicyDecision {
  allowed: boolean;
  reason: string;
  code: DecisionCode;
  blockedBy?: {
    gateCode: string;
    severity: GateSeverity;
  };
  state?: StateInfo;
  factsUsed?: string[];
  warnings?: GateWarning[];
  decisionId?: string;
  traceId?: string;
}

/**
 * Aksiyon sonucu
 */
export interface ActionResult {
  success: boolean;
  errorCode?: string;
  errorMessage?: string;
  newFacts?: Record<string, unknown>;
  expectedStateVersion?: number;
}

/**
 * Execution response
 */
export interface ExecutionResponse {
  success: boolean;
  code?: string;
  stateVersion?: number;
  shouldRetry?: boolean;
}

/**
 * Önerilen aksiyon
 */
export interface RecommendedAction {
  actionCode: ActionCode;
  priority: number;
  reason: string;
  scope: Scope;
  context?: ActionContext;
  gatePreCheck?: {
    blocked: boolean;
    gateCode?: string;
    reason?: string;
  };
}

/**
 * Policy evidence (audit için)
 */
export interface PolicyEvidence {
  decisionId: string;
  traceId: string;
  actionCode: ActionCode;
  caseId: string;
  decision: PolicyDecision;
  factsSnapshot: Record<string, unknown>;
  timestamp: string;
  ruleVersion: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// VALIDATION RESULT (validation-gate uyumluluğu için)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Validasyon hatası
 */
export interface ValidationError {
  id: string;
  path: string;
  severity: 'ERROR' | 'WARNING';
  message: string;
  field?: string;
}

/**
 * Gate validasyon sonucu (validation-gate uyumluluğu)
 */
export interface GateValidationResult {
  gateId: GateCode;
  gateName: string;
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
  checkedFields: string[];
  missingFields: string[];
  suggestions?: string[];
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * ActionCode için risk seviyesi
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
};

/**
 * Risk seviyesine göre ActionCode'ları getir
 */
export function getActionsByRiskLevel(level: RiskLevel): ActionCode[] {
  return Object.entries(ACTION_RISK_LEVELS)
    .filter(([_, riskLevel]) => riskLevel === level)
    .map(([actionCode]) => actionCode as ActionCode);
}

/**
 * HIGH risk aksiyon mu?
 */
export function isHighRiskAction(actionCode: ActionCode): boolean {
  return ACTION_RISK_LEVELS[actionCode] === RiskLevel.HIGH;
}

/**
 * Lock gerekli mi? (HIGH risk aksiyonlar için)
 */
export function isLockRequired(actionCode: ActionCode): boolean {
  return isHighRiskAction(actionCode);
}

/**
 * Fail mode: CLOSED (blokla) veya OPEN (izin ver)
 */
export function getFailMode(actionCode: ActionCode): 'CLOSED' | 'OPEN' {
  return isHighRiskAction(actionCode) ? 'CLOSED' : 'OPEN';
}
