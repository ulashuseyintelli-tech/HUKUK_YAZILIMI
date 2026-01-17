/**
 * Phase 6A - Explainable Policy Preview Types
 * 
 * Policy kararlarının (PASS/WARN/BLOCK) arkasındaki gerekçeleri
 * açıklayan katman için tip tanımları.
 * 
 * UX Contract: Frontend bu interface'lere güvenir.
 * 
 * @see .kiro/specs/explainable-policy-preview/requirements.md
 * @see .kiro/specs/explainable-policy-preview/design.md
 */

// ============================================================================
// POLICY EXPLANATION - UX CONTRACT (Requirement 3.1)
// ============================================================================

/**
 * Tek bir policy açıklaması.
 * Frontend bu yapıya güvenir - değişiklik breaking change'dir.
 * 
 * @invariant BLOCK outcome → explanations.length > 0
 */
export interface PolicyExplanation {
  /** Original reason code from PolicyEngine */
  reasonCode: string;
  
  /** Human-readable message (Turkish for MVP) */
  message: string;
  
  /** Severity level - determines display priority */
  severity: ExplanationSeverity;
  
  /** What user should do - actionable guidance */
  suggestedAction: string;
  
  /** Which policy rule triggered this (optional) */
  sourceRule?: string;
}

export type ExplanationSeverity = 'INFO' | 'WARNING' | 'ERROR';

// ============================================================================
// EXPLANATION RESULT (Requirement 7.2, 7.3)
// ============================================================================

/**
 * ExplanationService.explain() dönüş tipi.
 * Degraded mode bilgisini içerir.
 */
export interface ExplanationResult {
  /** Açıklamalar dizisi (boş olabilir, null OLMAZ) */
  explanations: PolicyExplanation[];
  
  /** True if explanation service failed and fallback used */
  degraded: boolean;
}

// ============================================================================
// REASON CODE REGISTRY (Requirement 2.1)
// ============================================================================

/**
 * Reason code registry entry.
 * Static mapping - runtime'da değişmez.
 */
export interface ReasonCodeEntry {
  /** Unique code identifier (e.g., 'STATUTE_OF_LIMITATIONS') */
  code: string;
  
  /** i18n key for future multi-language support */
  messageKey: string;
  
  /** Turkish message (MVP) */
  messageTr: string;
  
  /** Severity level */
  severity: ExplanationSeverity;
  
  /** Turkish action text */
  suggestedAction: string;
  
  /** Optional: which policy rule (e.g., 'TBK m.146-161') */
  sourceRule?: string;
}

// ============================================================================
// TRACE EVENT TYPES (Requirement 4.2)
// ============================================================================

/**
 * Trace event emitted when explanations are successfully generated.
 * 
 * PII-FREE: No debtor names, TCKN, addresses, phone, email.
 * No full messages (too verbose for trace storage).
 */
export interface PolicyExplanationGeneratedEvent {
  eventType: 'POLICY_EXPLANATION_GENERATED';
  
  /** ISO 8601 timestamp */
  timestamp: string;
  
  /** Original policy outcome */
  policyOutcome: PolicyOutcome;
  
  /** Number of explanations generated */
  explanationCount: number;
  
  /** List of reason codes (no messages - too verbose) */
  reasonCodes: string[];
  
  /** Count by severity */
  severityCounts: SeverityCounts;
  
  /** True if any unknown code was encountered */
  fallbackUsed: boolean;
}

/**
 * Trace event emitted when explanation generation fails.
 */
export interface PolicyExplanationFailedEvent {
  eventType: 'POLICY_EXPLANATION_FAILED';
  
  /** ISO 8601 timestamp */
  timestamp: string;
  
  /** Error message (no PII) */
  error: string;
  
  /** Original policy outcome (still preserved) */
  policyOutcome: PolicyOutcome;
}

export type PolicyExplanationTraceEvent = 
  | PolicyExplanationGeneratedEvent 
  | PolicyExplanationFailedEvent;

// ============================================================================
// SUPPORTING TYPES
// ============================================================================

export type PolicyOutcome = 'PASS' | 'WARN' | 'BLOCK';

export interface SeverityCounts {
  error: number;
  warning: number;
  info: number;
}

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Fallback explanation for BLOCK with no reasons.
 * Used when invariant would be violated.
 */
export const UNKNOWN_BLOCK_FALLBACK: PolicyExplanation = {
  reasonCode: 'UNKNOWN_BLOCK_REASON',
  message: 'İşlem engellenmiştir. Detaylı bilgi için destek ekibiyle iletişime geçin.',
  severity: 'ERROR',
  suggestedAction: 'Destek talebi oluşturun veya 0850 XXX XX XX numaralı hattı arayın.',
};

/**
 * Degraded mode explanation when ExplanationService fails.
 */
export const DEGRADED_MODE_EXPLANATION: PolicyExplanation = {
  reasonCode: 'EXPLANATION_SERVICE_UNAVAILABLE',
  message: 'Açıklama servisi geçici olarak kullanılamıyor.',
  severity: 'WARNING',
  suggestedAction: 'Lütfen daha sonra tekrar deneyin.',
};

/**
 * Fallback explanation for unknown reason codes.
 */
export const UNKNOWN_CODE_FALLBACK_TEMPLATE = {
  message: 'Bu kural hakkında detaylı bilgi mevcut değil.',
  severity: 'WARNING' as ExplanationSeverity,
  suggestedAction: 'Lütfen destek ekibiyle iletişime geçin.',
};

/**
 * Severity order for sorting (lower = higher priority).
 */
export const SEVERITY_ORDER: Record<ExplanationSeverity, number> = {
  ERROR: 0,
  WARNING: 1,
  INFO: 2,
};
