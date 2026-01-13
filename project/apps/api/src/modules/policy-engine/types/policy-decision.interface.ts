import { Scope } from './scope.enum';

/**
 * Karar kodları
 */
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

/**
 * Gate uyarısı
 */
export interface GateWarning {
  /** Uyarı kodu */
  code: string;
  /** Uyarı mesajı */
  message: string;
  /** Uyarı seviyesi */
  severity: 'INFO' | 'WARNING';
}

/**
 * State bilgisi
 */
export interface StateInfo {
  /** Scope */
  scope: Scope;
  /** Mevcut state */
  currentState: string;
  /** Context ID (debtorId, assetId, etc.) */
  contextId?: string;
  /** State version (CAS için) */
  version?: number;
}

/**
 * CPE'nin bir aksiyon için verdiği karar
 */
export interface PolicyDecision {
  /** İzin verildi mi? */
  allowed: boolean;
  
  /** Karar nedeni (Türkçe, kullanıcıya gösterilebilir) */
  reason: string;
  
  /** Karar kodu */
  code: DecisionCode;
  
  /** Bloklayan gate bilgisi (eğer bloklandıysa) */
  blockedBy?: {
    gateCode: string;
    severity: 'HARD' | 'SOFT';
  };
  
  /** Mevcut state bilgisi */
  state?: StateInfo;
  
  /** Kullanılan fact key'leri (değerler değil, KVKK) */
  factsUsed?: string[];
  
  /** Soft gate uyarıları */
  warnings?: GateWarning[];
  
  /** Karar ID'si (DecisionLog'dan) */
  decisionId?: string;
  
  /** Trace ID (distributed tracing için) */
  traceId?: string;
}

/**
 * Aksiyon context'i
 */
export interface ActionContext {
  /** Borçlu ID (DEBTOR scope için) */
  debtorId?: string;
  
  /** Varlık ID (ASSET scope için) */
  assetId?: string;
  
  /** Masraf ID (EXPENSE scope için) */
  expenseId?: string;
  
  /** Ek metadata */
  metadata?: Record<string, unknown>;
  
  /** Beklenen state version (CAS için) */
  expectedStateVersion?: number;
}

/**
 * Aksiyon sonucu
 */
export interface ActionResult {
  /** Başarılı mı? */
  success: boolean;
  
  /** Hata kodu (başarısızsa) */
  errorCode?: string;
  
  /** Hata mesajı */
  errorMessage?: string;
  
  /** Yeni fact'ler (state güncellemesi için) */
  newFacts?: Record<string, unknown>;
  
  /** Beklenen state version (CAS için) */
  expectedStateVersion?: number;
}

/**
 * Execution response
 */
export interface ExecutionResponse {
  /** Başarılı mı? */
  success: boolean;
  
  /** Hata kodu */
  code?: string;
  
  /** Yeni state version */
  stateVersion?: number;
  
  /** Retry gerekli mi? (concurrent modification durumunda) */
  shouldRetry?: boolean;
}

/**
 * Önerilen aksiyon
 */
export interface RecommendedAction {
  /** Aksiyon kodu */
  actionCode: string;
  
  /** Öncelik (1-100, düşük = yüksek öncelik) */
  priority: number;
  
  /** Öneri nedeni */
  reason: string;
  
  /** Scope */
  scope: Scope;
  
  /** Context */
  context?: ActionContext;
  
  /** Gate pre-check sonucu (opsiyonel) */
  gatePreCheck?: {
    blocked: boolean;
    gateCode?: string;
    reason?: string;
  };
}
