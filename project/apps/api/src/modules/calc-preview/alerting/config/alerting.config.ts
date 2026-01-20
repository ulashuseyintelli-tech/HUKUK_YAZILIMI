/**
 * Alerting Configuration
 * 
 * Production Alerting System - Sprint 0
 * 
 * Configuration defaults and types for the alerting system.
 * 
 * @see .kiro/specs/production-alerting-system/requirements.md
 * @see .kiro/specs/production-alerting-system/design.md
 */

import { AlertCategory } from '../types/alerting.types';

// ============================================================================
// DEGRADED THRESHOLDS
// ============================================================================

/**
 * DEGRADED mode threshold configuration
 * 
 * @see Requirements 1.1-1.5
 */
export interface DegradedThresholdConfig {
  /** Time before P2 alert (ms) - default 15 minutes */
  degradedWarnAfterMs: number;
  /** Time before P1 alert (ms) - default 30 minutes */
  degradedPageAfterMs: number;
}

export const DEFAULT_DEGRADED_THRESHOLD_CONFIG: DegradedThresholdConfig = {
  degradedWarnAfterMs: 15 * 60 * 1000, // 15 minutes
  degradedPageAfterMs: 30 * 60 * 1000, // 30 minutes
};

// ============================================================================
// MANUAL RESET
// ============================================================================

/**
 * Manual reset alert configuration
 * 
 * @see Requirements 2.1-2.4
 */
export interface ManualResetConfig {
  /** Failure threshold for P1 alert - default 10 */
  manualResetFailureThreshold: number;
  /** Grace period before alert (ms) - default 10 minutes */
  manualResetGracePeriodMs: number;
}

export const DEFAULT_MANUAL_RESET_CONFIG: ManualResetConfig = {
  manualResetFailureThreshold: 10,
  manualResetGracePeriodMs: 10 * 60 * 1000, // 10 minutes
};

// ============================================================================
// FLAPPING DETECTION
// ============================================================================

/**
 * Flapping detection configuration
 * 
 * @see Requirements 9.1-9.5
 */
export interface FlappingConfig {
  /** P2 threshold (flaps per hour) - default 3 */
  flapP2ThresholdPerHour: number;
  /** P1 threshold (flaps per hour) - default 5 */
  flapP1ThresholdPerHour: number;
  /** Rolling window (ms) - default 60 minutes */
  windowMs: number;
}

export const DEFAULT_FLAPPING_CONFIG: FlappingConfig = {
  flapP2ThresholdPerHour: 3,
  flapP1ThresholdPerHour: 5,
  windowMs: 60 * 60 * 1000, // 60 minutes
};

// ============================================================================
// TENANT SCOPE
// ============================================================================

/**
 * Tenant scope resolution configuration
 * 
 * @see Requirements 10.1-10.4
 */
export interface TenantScopeConfig {
  /** Minimum tenants for multi_tenant scope - default 3 */
  multiTenantMinTenants: number;
  /** Window for multi-tenant detection (ms) - default 5 minutes */
  multiTenantWindowMs: number;
  /** Signal types that trigger global scope */
  globalTriggerTypes: string[];
}

export const DEFAULT_TENANT_SCOPE_CONFIG: TenantScopeConfig = {
  multiTenantMinTenants: 3,
  multiTenantWindowMs: 5 * 60 * 1000, // 5 minutes
  globalTriggerTypes: [
    'AUDIT_WRITE_FAILURE',
    'CROSS_TENANT_ATTEMPT',
    'CROSS_TENANT_BLOCKED',
    'GLOBAL_DEGRADED',
  ],
};

// ============================================================================
// COOLDOWN
// ============================================================================

/**
 * Cooldown configuration
 * 
 * @see Requirements 12.1-12.3
 */
export interface CooldownConfig {
  /** Cooldown after resolve (ms) - default 30 minutes */
  cooldownAfterResolveMs: number;
}

export const DEFAULT_COOLDOWN_CONFIG: CooldownConfig = {
  cooldownAfterResolveMs: 30 * 60 * 1000, // 30 minutes
};

// ============================================================================
// DEDUPE
// ============================================================================

/**
 * Dedupe configuration
 * 
 * @see Requirements 16.1-16.3
 */
export interface DedupeConfig {
  /** Dedupe window (ms) - default 15 minutes */
  dedupeWindowMs: number;
  /** Cooldown after resolve (ms) - default 30 minutes */
  cooldownAfterResolveMs: number;
}

export const DEFAULT_DEDUPE_CONFIG: DedupeConfig = {
  dedupeWindowMs: 15 * 60 * 1000, // 15 minutes
  cooldownAfterResolveMs: 30 * 60 * 1000, // 30 minutes
};

// ============================================================================
// TREND ANALYZER
// ============================================================================

/**
 * Trend analyzer configuration
 * 
 * @see Requirements 18.1-18.6
 */
export interface TrendAnalyzerConfig {
  /** Rolling window (ms) - default 5 minutes */
  windowMs: number;
  /** Slope threshold for trend detection */
  slopeThreshold: number;
  /** Minimum sample count for statistical significance - default 10 */
  minSampleCount: number;
  /** Failure rate threshold (%) - default 5 */
  failureRateThreshold: number;
}

export const DEFAULT_TREND_ANALYZER_CONFIG: TrendAnalyzerConfig = {
  windowMs: 5 * 60 * 1000, // 5 minutes
  slopeThreshold: 0.1,
  minSampleCount: 10,
  failureRateThreshold: 5, // 5%
};

// ============================================================================
// GLOBAL OUTAGE
// ============================================================================

/**
 * Global outage detection configuration
 * 
 * @see Requirements 17.4
 */
export interface GlobalOutageConfig {
  /** Minimum tenants for escalation to global - default 5 */
  escalationMinTenants: number;
  /** Minimum duration for escalation (ms) - default 10 minutes */
  escalationMinDurationMs: number;
  /** Critical dependencies list */
  criticalDependencies: string[];
  /** Categories to inhibit during global outage */
  inhibitCategories: AlertCategory[];
}

export const DEFAULT_GLOBAL_OUTAGE_CONFIG: GlobalOutageConfig = {
  escalationMinTenants: 5,
  escalationMinDurationMs: 10 * 60 * 1000, // 10 minutes
  criticalDependencies: ['audit-store', 'policy-engine', 'rate-limiter'],
  inhibitCategories: [AlertCategory.CAPACITY, AlertCategory.AVAILABILITY],
};

// ============================================================================
// NOTIFICATION
// ============================================================================

/**
 * Notification retry policy
 */
export interface RetryPolicy {
  /** Maximum retries - default 3 */
  maxRetries: number;
  /** Initial delay (ms) - default 1000 */
  initialDelayMs: number;
  /** Maximum delay (ms) - default 30000 */
  maxDelayMs: number;
  /** Backoff multiplier - default 2 */
  backoffMultiplier: number;
  /** Retryable error types */
  retryableErrors: string[];
}

export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
  retryableErrors: ['NETWORK_ERROR', 'TIMEOUT', 'SERVER_ERROR'],
};

// ============================================================================
// CAPACITY THRESHOLDS
// ============================================================================

/**
 * Capacity alert thresholds
 * 
 * @see Requirements 5.1-5.6
 */
export interface CapacityThresholdConfig {
  /** Rate limit sustained duration for P1 (ms) - default 5 minutes */
  rateLimitSustainedDurationMs: number;
  /** Queue depth high threshold */
  queueDepthHighThreshold: number;
  /** Queue depth critical threshold */
  queueDepthCriticalThreshold: number;
  /** CPU high threshold (%) */
  cpuHighThreshold: number;
  /** Memory high threshold (%) */
  memoryHighThreshold: number;
  /** File descriptor exhaustion threshold (%) */
  fdExhaustionThreshold: number;
  /** Resource threshold duration (ms) */
  resourceThresholdDurationMs: number;
}

export const DEFAULT_CAPACITY_THRESHOLD_CONFIG: CapacityThresholdConfig = {
  rateLimitSustainedDurationMs: 5 * 60 * 1000, // 5 minutes
  queueDepthHighThreshold: 1000,
  queueDepthCriticalThreshold: 5000,
  cpuHighThreshold: 80,
  memoryHighThreshold: 85,
  fdExhaustionThreshold: 90,
  resourceThresholdDurationMs: 5 * 60 * 1000, // 5 minutes
};

// ============================================================================
// MAIN CONFIG
// ============================================================================

/**
 * Complete alerting configuration
 */
export interface AlertingConfig {
  /** DEGRADED thresholds */
  degraded: DegradedThresholdConfig;
  /** Manual reset config */
  manualReset: ManualResetConfig;
  /** Flapping detection config */
  flapping: FlappingConfig;
  /** Tenant scope config */
  tenantScope: TenantScopeConfig;
  /** Cooldown config */
  cooldown: CooldownConfig;
  /** Dedupe config */
  dedupe: DedupeConfig;
  /** Trend analyzer config */
  trend: TrendAnalyzerConfig;
  /** Global outage config */
  globalOutage: GlobalOutageConfig;
  /** Notification retry policy */
  retry: RetryPolicy;
  /** Capacity thresholds */
  capacity: CapacityThresholdConfig;
  /** Maintenance mode enabled */
  maintenanceMode: boolean;
}

/**
 * Default alerting configuration
 */
export const DEFAULT_ALERTING_CONFIG: AlertingConfig = {
  degraded: DEFAULT_DEGRADED_THRESHOLD_CONFIG,
  manualReset: DEFAULT_MANUAL_RESET_CONFIG,
  flapping: DEFAULT_FLAPPING_CONFIG,
  tenantScope: DEFAULT_TENANT_SCOPE_CONFIG,
  cooldown: DEFAULT_COOLDOWN_CONFIG,
  dedupe: DEFAULT_DEDUPE_CONFIG,
  trend: DEFAULT_TREND_ANALYZER_CONFIG,
  globalOutage: DEFAULT_GLOBAL_OUTAGE_CONFIG,
  retry: DEFAULT_RETRY_POLICY,
  capacity: DEFAULT_CAPACITY_THRESHOLD_CONFIG,
  maintenanceMode: false,
};

/**
 * Create alerting config with overrides
 */
export function createAlertingConfig(
  overrides: Partial<AlertingConfig> = {},
): AlertingConfig {
  return {
    ...DEFAULT_ALERTING_CONFIG,
    ...overrides,
    degraded: { ...DEFAULT_DEGRADED_THRESHOLD_CONFIG, ...overrides.degraded },
    manualReset: { ...DEFAULT_MANUAL_RESET_CONFIG, ...overrides.manualReset },
    flapping: { ...DEFAULT_FLAPPING_CONFIG, ...overrides.flapping },
    tenantScope: { ...DEFAULT_TENANT_SCOPE_CONFIG, ...overrides.tenantScope },
    cooldown: { ...DEFAULT_COOLDOWN_CONFIG, ...overrides.cooldown },
    dedupe: { ...DEFAULT_DEDUPE_CONFIG, ...overrides.dedupe },
    trend: { ...DEFAULT_TREND_ANALYZER_CONFIG, ...overrides.trend },
    globalOutage: { ...DEFAULT_GLOBAL_OUTAGE_CONFIG, ...overrides.globalOutage },
    retry: { ...DEFAULT_RETRY_POLICY, ...overrides.retry },
    capacity: { ...DEFAULT_CAPACITY_THRESHOLD_CONFIG, ...overrides.capacity },
  };
}

// ============================================================================
// RUNBOOK REFERENCES
// ============================================================================

/**
 * Runbook references by category
 */
export const RUNBOOK_REFS: Record<AlertCategory, string> = {
  [AlertCategory.SECURITY]: '/docs/runbooks/SECURITY.md',
  [AlertCategory.AVAILABILITY]: '/docs/runbooks/AVAILABILITY.md',
  [AlertCategory.CAPACITY]: '/docs/runbooks/CAPACITY.md',
  [AlertCategory.INTEGRITY]: '/docs/runbooks/INTEGRITY.md',
  [AlertCategory.HYGIENE]: '/docs/runbooks/HYGIENE.md',
};

/**
 * Get runbook reference for alert type
 */
export function getRunbookRef(category: AlertCategory, alertType?: string): string {
  const baseRef = RUNBOOK_REFS[category];
  if (alertType) {
    return `${baseRef}#${alertType.toLowerCase().replace(/_/g, '-')}`;
  }
  return baseRef;
}

// ============================================================================
// RECOMMENDATIONS
// ============================================================================

/**
 * Default recommendations by alert type
 */
export const DEFAULT_RECOMMENDATIONS: Record<string, string> = {
  // Security
  BREAK_GLASS_JTI_ANOMALY_DETECTED: 'JTI anomali tespit edildi. Grant kullanım paternlerini inceleyin ve gerekirse grant\'ı iptal edin.',
  CROSS_TENANT_ACCESS_ATTEMPT: 'Cross-tenant erişim girişimi tespit edildi. Erişim loglarını inceleyin.',
  CROSS_TENANT_ACCESS_BLOCKED: 'Cross-tenant erişim bloklandı. Güvenlik ekibini bilgilendirin.',
  MANUAL_RESET_REQUIRED: 'Manuel reset gerekli. Circuit breaker durumunu kontrol edin ve gerekirse reset yapın.',
  
  // Availability
  DEGRADED_ENTERED: 'Sistem DEGRADED moduna girdi. Bağımlılık durumlarını kontrol edin.',
  DEGRADED_PERSISTING: 'Sistem uzun süredir DEGRADED modunda. Kök neden analizi yapın.',
  FAILURE_TREND_CRITICAL: 'Kritik hata trendi tespit edildi. Sistem sağlığını kontrol edin.',
  
  // Capacity
  TENANT_RATE_LIMIT_EXHAUSTED: 'Tenant rate limit tükendi. Tenant kullanım paternlerini inceleyin.',
  TENANT_RATE_LIMIT_EXHAUSTED_SUSTAINED: 'Tenant rate limit sürekli tükeniyor. Kapasite artışı değerlendirin.',
  QUEUE_DEPTH_HIGH: 'Queue derinliği yüksek. İşlem kapasitesini kontrol edin.',
  QUEUE_DEPTH_CRITICAL: 'Queue derinliği kritik seviyede. Acil kapasite müdahalesi gerekli.',
  CPU_HIGH: 'CPU kullanımı yüksek. Kaynak optimizasyonu veya ölçeklendirme değerlendirin.',
  MEMORY_HIGH: 'Bellek kullanımı yüksek. Memory leak kontrolü yapın.',
  FD_EXHAUSTION: 'File descriptor tükenmesi riski. Bağlantı yönetimini kontrol edin.',
  
  // Integrity
  AUDIT_WRITE_FAILURE: 'Audit trail yazma hatası. Audit store durumunu kontrol edin.',
  STATUS_MISMATCH: 'Status endpoint uyumsuzluğu. State senkronizasyonunu kontrol edin.',
  
  // Hygiene
  VALIDATION_ERROR_SPIKE: 'Validasyon hatası spike\'ı. Input kalitesini ve UX\'i inceleyin.',
  
  // Recovery
  INCIDENT_RESOLVED: 'Incident çözümlendi. Post-mortem için logları saklayın.',
  RECOVERY_WITH_FLAPPING_RISK: 'Kurtarma sonrası kararsızlık riski. Kök neden analizi yapın.',
  
  // Flapping
  FLAPPING_DETECTED: 'Sistem kararsız (flapping). Kök neden araştırın.',
  FLAPPING_RCA_REQUIRED: 'Ciddi flapping tespit edildi. RCA zorunlu.',
  
  // Global Outage
  GLOBAL_OUTAGE_ACTIVE: 'Global outage aktif. Tüm ekipleri bilgilendirin.',
  GLOBAL_OUTAGE_RESOLVED: 'Global outage çözümlendi. Post-mortem planlayın.',
};

/**
 * Get recommendation for alert type
 */
export function getRecommendation(alertType: string): string {
  return DEFAULT_RECOMMENDATIONS[alertType] || 'Durumu inceleyin ve gerekli aksiyonu alın.';
}
