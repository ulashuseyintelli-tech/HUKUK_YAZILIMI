/**
 * Self-serve Diagnostics - Type Definitions
 * 
 * Phase 7A - Sprint 1
 * 
 * Tenant admin'lerin sistemin durumunu anlayabilmesi için
 * Diagnostics API type'ları.
 * 
 * @see .kiro/specs/self-serve-diagnostics/design.md
 */

// ============================================================================
// TENANT CONTEXT (Defense in Depth - First Line)
// ============================================================================

/**
 * Tenant access context - extracted from request
 * Guard'dan Service'e kadar taşınır
 */
export interface TenantAccessContext {
  userId: string;
  tenantId: string;
  role: 'tenant-admin' | 'internal-ops' | 'system';
  clientIp?: string | undefined;
  userAgent?: string | undefined;
}

/**
 * Role permissions
 */
export const ROLE_PERMISSIONS = {
  'tenant-admin': {
    canAccessOwnTenant: true,
    canAccessOtherTenants: false,
    canAccessGlobal: false,
  },
  'internal-ops': {
    canAccessOwnTenant: true,
    canAccessOtherTenants: true,
    canAccessGlobal: true,
  },
  'system': {
    canAccessOwnTenant: true,
    canAccessOtherTenants: true,
    canAccessGlobal: true,
  },
} as const;

// ============================================================================
// HEALTH TYPES
// ============================================================================

export type HealthStatus = 'OK' | 'DEGRADED' | 'INCIDENT';

export interface CircuitBreakerHealthInfo {
  state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  openedAt?: string | undefined;
  nextRetryAt?: string | undefined;
}

export interface CacheHealthInfo {
  hitRate: number;      // 0-100
  missRate: number;     // 0-100
  staleRate: number;    // 0-100
}

export interface RateLimitHealthInfo {
  remaining: number;
  capacity: number;
  blocked: boolean;
}

export interface PolicyEngineHealthInfo {
  available: boolean;
  lastCheck: string;
}

export interface IncidentCriteria {
  successRateBelow95: boolean;
  p95Above2000ms: boolean;
  openBreakerCount: number;
  criticalTraceCount: number;
}

export interface DiagnosticsHealthResponse {
  status: HealthStatus;
  timestamp: string;
  tenantId: string;
  cache: CacheHealthInfo;
  circuitBreakers: Record<string, CircuitBreakerHealthInfo>;
  rateLimit: RateLimitHealthInfo;
  policyEngine: PolicyEngineHealthInfo;
  incidentCriteria?: IncidentCriteria;
}

// ============================================================================
// METRICS TYPES
// ============================================================================

export type MetricsWindow = '5m' | '15m' | '30m' | '1h' | '6h' | '24h';

export const VALID_METRICS_WINDOWS: MetricsWindow[] = ['5m', '15m', '30m', '1h', '6h', '24h'];

export const METRICS_WINDOW_MS: Record<MetricsWindow, number> = {
  '5m': 5 * 60 * 1000,
  '15m': 15 * 60 * 1000,
  '30m': 30 * 60 * 1000,
  '1h': 60 * 60 * 1000,
  '6h': 6 * 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
};

export interface LatencyMetrics {
  p50: number;
  p95: number;
  p99: number;
}

export interface RateMetrics {
  success: number;      // 0-100
  fallback: number;     // 0-100
  stale: number;        // 0-100
  error: number;        // 0-100
}

export interface CountMetrics {
  total: number;
  success: number;
  fallback: number;
  error: number;
}

export interface DiagnosticsMetricsResponse {
  window: MetricsWindow;
  tenantId: string;
  timestamp: string;
  latency: LatencyMetrics;
  rates: RateMetrics;
  counts: CountMetrics;
}

// ============================================================================
// ERROR TYPES
// ============================================================================

export interface DiagnosticsErrorResponse {
  statusCode: number;
  error: string;
  message: string;
  details?: {
    field?: string;
    validValues?: string[];
    retryAfter?: number;
  };
}

// ============================================================================
// TRACE TYPES (Sprint 2)
// ============================================================================

/**
 * Trace list query parameters
 * 
 * Sert kurallar:
 * - since: ZORUNLU
 * - max range: 24 saat
 * - limit max: 100
 */
export interface TraceListQuery {
  since: string;          // ISO 8601 - REQUIRED
  until?: string;         // ISO 8601 - defaults to now
  severity?: TraceSeverityFilter;
  status?: TraceStatusFilter;
  cursor?: string;        // Opaque cursor for pagination
  limit?: number;         // default 20, max 100
}

export type TraceSeverityFilter = 'INFO' | 'WARN' | 'CRITICAL';
export type TraceStatusFilter = 'OK' | 'DEGRADED' | 'UNAVAILABLE';

export const TRACE_QUERY_LIMITS = {
  DEFAULT_LIMIT: 20,
  MAX_LIMIT: 100,
  MAX_RANGE_MS: 24 * 60 * 60 * 1000, // 24 hours
} as const;

/**
 * Trace summary for list view (PII-free)
 */
export interface DiagnosticsTraceSummary {
  traceId: string;
  timestamp: string;
  status: 'OK' | 'DEGRADED' | 'UNAVAILABLE';
  durationMs: number;
  hasWarnings: boolean;
  hasFallback: boolean;
}

/**
 * Trace list response with pagination
 */
export interface DiagnosticsTraceListResponse {
  traces: DiagnosticsTraceSummary[];
  pagination: {
    total: number;
    limit: number;
    cursor?: string | undefined;
    nextCursor?: string | undefined;
    hasMore: boolean;
  };
  query: {
    since: string;
    until: string;
    severity?: string | undefined;
    status?: string | undefined;
  };
}

/**
 * Trace detail response (redacted)
 */
export interface DiagnosticsTraceDetailResponse {
  trace: unknown;         // Redacted TraceBundle
  truncated: boolean;
  truncationReason?: string | undefined;
  originalSizeBytes?: number | undefined;
}

export const TRACE_SIZE_LIMITS = {
  MAX_SIZE_BYTES: 10 * 1024 * 1024, // 10MB
} as const;

/**
 * Cursor for deterministic pagination
 * Format: base64(JSON({ startedAt, traceId }))
 */
export interface TraceCursor {
  startedAt: string;
  traceId: string;
}

// ============================================================================
// AUDIT TYPES (Sprint 2)
// ============================================================================

export type AuditAction = 'LIST' | 'DETAIL' | 'DOWNLOAD'
  // Sprint 3: Simulation lifecycle audit actions
  | 'SIMULATION_STARTED' | 'SIMULATION_COMPLETED' | 'SIMULATION_FAILED'
  | 'PROMOTE_REQUESTED' | 'PROMOTE_ACCEPTED' | 'PROMOTE_DRIFT_BLOCKED'
  | 'ESCALATION_TRIGGERED' | 'DEESCALATION_TRIGGERED' | 'ESCALATION_STATE_CONFLICT';

export interface DiagnosticsAuditEntry {
  id: string;
  timestamp: string;
  actor: {
    userId: string;
    tenantId: string;
    role: TenantAccessContext['role'];
    clientIp?: string | undefined;
  };
  action: AuditAction;
  resource: {
    type: 'trace' | 'traces';
    traceId?: string | undefined;
    query?: Partial<TraceListQuery> | undefined;
  };
  tenantScope: string;
  regionId: string;
  allowed: boolean;
  reason?: string | undefined;
}

// ============================================================================
// SLO THRESHOLDS (Health Status Derivation)
// ============================================================================

export const DIAGNOSTICS_SLO = {
  // INCIDENT thresholds
  SUCCESS_RATE_MIN: 95,           // < 95% → INCIDENT
  P95_LATENCY_MAX_MS: 2000,       // > 2000ms → INCIDENT
  OPEN_BREAKER_THRESHOLD: 2,      // >= 2 open breakers → INCIDENT
  CRITICAL_TRACE_THRESHOLD: 5,    // >= 5 critical traces in 15min → INCIDENT
  
  // DEGRADED thresholds
  DEGRADED_BREAKER_COUNT: 1,      // >= 1 open breaker → DEGRADED
  
  // Evaluation window
  EVALUATION_WINDOW_MS: 15 * 60 * 1000, // 15 minutes
} as const;

// ============================================================================
// RATE LIMIT CONSTANTS (Diagnostics-specific)
// ============================================================================

export const DIAGNOSTICS_RATE_LIMITS = {
  GENERAL_LIMIT: 60,        // 60 req/min for general endpoints
  TRACE_DETAIL_LIMIT: 30,   // 30 req/min for trace detail (expensive)
  BURST_LIMIT: 10,          // 10 req/sec burst capacity
  BURST_WINDOW_MS: 1000,    // 1 second burst window
} as const;

// ============================================================================
// INCIDENT TYPES (Sprint 3)
// ============================================================================

/**
 * Incident type - kanıta dayalı olay tipleri
 * 
 * Her incident tipi belirli bir kaynaktan tespit edilir:
 * - CIRCUIT_BREAKER_OPEN: breaker state change
 * - HIGH_ERROR_RATE: success < 95%
 * - RATE_LIMIT_EXHAUSTED: bucket empty (429 count)
 * - DEGRADED_SERVICE: fallback active
 * - SLO_BREACH: p95 > 2000ms
 */
export type IncidentType =
  | 'CIRCUIT_BREAKER_OPEN'
  | 'HIGH_ERROR_RATE'
  | 'RATE_LIMIT_EXHAUSTED'
  | 'DEGRADED_SERVICE'
  | 'SLO_BREACH';

/**
 * Incident severity
 * 
 * WARNING: Dikkat gerektiren, henüz kritik değil
 * CRITICAL: Acil müdahale gerektiren
 */
export type IncidentSeverity = 'WARNING' | 'CRITICAL';

/**
 * Incident status
 */
export type IncidentStatus = 'ONGOING' | 'RESOLVED';

/**
 * Evidence - incident'ın kanıtı
 * 
 * Her incident'ta şu alanlar olmalı:
 * - source: metrik/trace/breaker snapshot referansı
 * - value: tespit edilen değer
 * - threshold: eşik değeri
 * - timestamp: tespit zamanı
 */
export interface IncidentEvidence {
  source: 'metrics' | 'circuit_breaker' | 'rate_limit' | 'trace';
  metric?: string | undefined;
  value: number | string;
  threshold: number | string;
  timestamp: string;
  traceIds?: string[] | undefined;
  breakerName?: string | undefined;
}

/**
 * Detected incident
 */
export interface DiagnosticsIncident {
  id: string;
  type: IncidentType;
  severity: IncidentSeverity;
  status: IncidentStatus;
  title: string;
  description: string;
  recommendation: string;
  startedAt: string;
  resolvedAt?: string | undefined;
  durationMs?: number | undefined;
  evidence: IncidentEvidence;
  tenantId: string;
  affectedDependencies?: string[] | undefined;
}

/**
 * Incident summary stats
 */
export interface IncidentSummaryStats {
  total: number;
  ongoing: number;
  resolved: number;
  bySeverity: {
    WARNING: number;
    CRITICAL: number;
  };
  byType: Record<IncidentType, number>;
}

/**
 * Incident list response
 */
export interface DiagnosticsIncidentResponse {
  incidents: DiagnosticsIncident[];
  summary: IncidentSummaryStats;
  period: {
    since: string;
    until: string;
  };
  tenantId: string;
  timestamp: string;
}

/**
 * Incident detection configuration
 * 
 * Her incident tipi için eşik değerleri
 */
export interface IncidentDetectionConfig {
  // CIRCUIT_BREAKER_OPEN
  circuitBreaker: {
    /** Kaç breaker açık olunca CRITICAL */
    criticalThreshold: number;
    /** Kaç breaker açık olunca WARNING */
    warningThreshold: number;
    /** Minimum açık kalma süresi (ms) */
    minOpenDurationMs: number;
  };
  
  // HIGH_ERROR_RATE
  errorRate: {
    /** % altında CRITICAL */
    criticalSuccessRate: number;
    /** % altında WARNING */
    warningSuccessRate: number;
    /** Değerlendirme penceresi (ms) */
    windowMs: number;
    /** Minimum istek sayısı (istatistiksel anlamlılık) */
    minRequestCount: number;
  };
  
  // RATE_LIMIT_EXHAUSTED
  rateLimit: {
    /** 429 sayısı üstünde CRITICAL */
    criticalThrottleCount: number;
    /** 429 sayısı üstünde WARNING */
    warningThrottleCount: number;
    /** Değerlendirme penceresi (ms) */
    windowMs: number;
  };
  
  // DEGRADED_SERVICE
  degradedService: {
    /** Fallback oranı % üstünde CRITICAL */
    criticalFallbackRate: number;
    /** Fallback oranı % üstünde WARNING */
    warningFallbackRate: number;
    /** Değerlendirme penceresi (ms) */
    windowMs: number;
  };
  
  // SLO_BREACH
  sloBreach: {
    /** p95 latency ms üstünde CRITICAL */
    criticalP95Ms: number;
    /** p95 latency ms üstünde WARNING */
    warningP95Ms: number;
    /** Değerlendirme penceresi (ms) */
    windowMs: number;
  };
}

/**
 * Default incident detection configuration
 */
export const DEFAULT_INCIDENT_CONFIG: IncidentDetectionConfig = {
  circuitBreaker: {
    criticalThreshold: 2,
    warningThreshold: 1,
    minOpenDurationMs: 30_000, // 30 seconds
  },
  errorRate: {
    criticalSuccessRate: 90,
    warningSuccessRate: 95,
    windowMs: 15 * 60 * 1000, // 15 minutes
    minRequestCount: 10,
  },
  rateLimit: {
    criticalThrottleCount: 50,
    warningThrottleCount: 10,
    windowMs: 15 * 60 * 1000, // 15 minutes
  },
  degradedService: {
    criticalFallbackRate: 20,
    warningFallbackRate: 5,
    windowMs: 15 * 60 * 1000, // 15 minutes
  },
  sloBreach: {
    criticalP95Ms: 3000,
    warningP95Ms: 2000,
    windowMs: 15 * 60 * 1000, // 15 minutes
  },
} as const;

/**
 * Incident type metadata - UI için başlık ve açıklamalar
 */
export const INCIDENT_TYPE_META: Record<IncidentType, {
  title: string;
  descriptionTemplate: string;
  recommendationTemplate: string;
}> = {
  CIRCUIT_BREAKER_OPEN: {
    title: 'Devre Kesici Açık',
    descriptionTemplate: '{breakerName} bağımlılığı için devre kesici açık durumda. Sistem bu bağımlılığa istek göndermiyor.',
    recommendationTemplate: 'Bağımlılık servisinin durumunu kontrol edin. Servis düzeldiğinde devre kesici otomatik kapanacaktır.',
  },
  HIGH_ERROR_RATE: {
    title: 'Yüksek Hata Oranı',
    descriptionTemplate: 'Son {window} içinde başarı oranı %{successRate} seviyesinde (eşik: %{threshold}).',
    recommendationTemplate: 'Hata loglarını inceleyin. En sık görülen hata tiplerini belirleyin ve kök nedeni araştırın.',
  },
  RATE_LIMIT_EXHAUSTED: {
    title: 'Rate Limit Aşıldı',
    descriptionTemplate: 'Son {window} içinde {throttleCount} istek rate limit nedeniyle reddedildi.',
    recommendationTemplate: 'İstek hacmini azaltın veya rate limit kotasını artırın. Spam/bot trafiği olup olmadığını kontrol edin.',
  },
  DEGRADED_SERVICE: {
    title: 'Servis Düşük Performansta',
    descriptionTemplate: 'Son {window} içinde %{fallbackRate} oranında fallback kullanıldı.',
    recommendationTemplate: 'Fallback kullanılan bağımlılıkları kontrol edin. Cache ve circuit breaker durumlarını inceleyin.',
  },
  SLO_BREACH: {
    title: 'SLO İhlali',
    descriptionTemplate: 'p95 latency {p95Ms}ms seviyesinde (eşik: {threshold}ms).',
    recommendationTemplate: 'Yavaş sorguları ve bağımlılık gecikmelerini inceleyin. Cache hit oranını kontrol edin.',
  },
} as const;

// ============================================================================
// TYPE GUARDS
// ============================================================================

export function isValidMetricsWindow(value: string): value is MetricsWindow {
  return VALID_METRICS_WINDOWS.includes(value as MetricsWindow);
}

export function isValidRole(role: string): role is TenantAccessContext['role'] {
  return ['tenant-admin', 'internal-ops', 'system'].includes(role);
}

export function isValidIncidentType(value: string): value is IncidentType {
  return [
    'CIRCUIT_BREAKER_OPEN',
    'HIGH_ERROR_RATE',
    'RATE_LIMIT_EXHAUSTED',
    'DEGRADED_SERVICE',
    'SLO_BREACH',
  ].includes(value);
}

export function isValidIncidentSeverity(value: string): value is IncidentSeverity {
  return ['WARNING', 'CRITICAL'].includes(value);
}


// ============================================================================
// PHASE 8: EVIDENCE TYPES (What-if Simulation)
// ============================================================================

/**
 * Metric types for evidence collection
 * 
 * Phase 8 - Sprint 1A
 * 
 * @see .kiro/specs/whatif-simulation/design.md
 */
export type EvidenceMetricType =
  | 'error_rate'
  | 'latency_p95'
  | 'latency_p99'
  | 'saturation_cpu'
  | 'queue_depth'
  | 'slo_burn_rate';

/**
 * Critical metrics that affect confidence evaluation
 */
export const CRITICAL_EVIDENCE_METRICS: EvidenceMetricType[] = [
  'error_rate',
  'slo_burn_rate',
  'latency_p99',
];

/**
 * Evidence flag types
 */
export type EvidenceFlag = 'LOW_CONFIDENCE' | 'STALE_DATA' | 'STALE_EVIDENCE';

/**
 * Evidence point - single metric measurement
 * 
 * Her metric için:
 * - value: ölçülen değer
 * - confidence: 0..1 arası güven skoru
 * - freshnessSec: verinin yaşı (saniye)
 */
export interface EvidencePoint {
  metric: EvidenceMetricType;
  value: number;
  unit: string; // '%', 'ms', 'count', 'ratio'
  windowSec: number;
  confidence: number; // 0..1
  freshnessSec: number;
  source: 'prometheus' | 'app_metrics' | 'synthetic';
  timestamp: string; // ISO
}

/**
 * Evidence snapshot - belirli anda alınmış metrik kanıt seti
 * 
 * Snapshot-age kuralları (hard):
 * - snapshotAgeSec > 60 ⇒ STALE_EVIDENCE
 * - freshnessSec > 120 olan point varsa ⇒ STALE_DATA
 * - confidence < 0.5 olan kritik metric varsa ⇒ LOW_CONFIDENCE
 */
export interface EvidenceSnapshot {
  snapshotId: string;
  tenantId: string;
  incidentId: string;
  capturedAt: string; // ISO
  points: EvidencePoint[];
  promoted?: boolean;
  derived?: {
    trend?: 'increasing' | 'decreasing' | 'stable';
    variance?: number;
  };
}

/**
 * EvidenceSnapshotView - Read-only projection for SimulationEngine
 * 
 * ⚠️ VIEW ONLY - NOT PERSISTABLE
 * 
 * This is a read-only projection created from SimulationSnapshot.
 * Do NOT persist this object - it lacks derived fields.
 * 
 * Use cases:
 * - SimulationEngine input (baseline/current comparison)
 * - Controller response (read-only view)
 * 
 * NOT for:
 * - Database persistence
 * - Store operations
 * - Audit trail (use SimulationSnapshot instead)
 * 
 * Mapped fields:
 * - snapshotId, tenantId, incidentId: direct copy from SimulationSnapshot
 * - capturedAt: from calcResult.capturedAt or fallback to createdAt
 * - points: extracted via projection (single source of truth = calcResult)
 * - promoted: derived from retentionPolicy (PROMOTED | LEGAL_HOLD)
 * 
 * NOT mapped (intentionally omitted):
 * - derived.trend, derived.variance: calculated by SimulationEngine at runtime
 * 
 * @see snapshot-query.service.ts toEvidenceSnapshot()
 * @see calc-result-projection.ts extractPoints()
 */
export interface EvidenceSnapshotView {
  snapshotId: string;
  tenantId: string;
  incidentId: string;
  capturedAt: string; // ISO
  points: EvidencePoint[];
  promoted: boolean;
  // NOTE: 'derived' is intentionally omitted - this is a VIEW, not persistable entity
}

/**
 * Evidence gate evaluation result
 * 
 * Gate hiyerarşisi: EvidenceGate → PolicyGuard → Executor
 * EvidenceGate fail ⇒ downstream gate'ler çalışmaz
 */
export interface EvidenceGateResult {
  flags: EvidenceFlag[];
  allowAutoEscalation: boolean;
  allowPromote: boolean;
  blockedReason?: string;
  blockedFlags?: EvidenceFlag[];
  snapshotAgeSec: number;
  pointLevelFlags: Array<{
    metric: EvidenceMetricType;
    flags: EvidenceFlag[];
  }>;
}

/**
 * Evidence thresholds configuration
 */
export const EVIDENCE_THRESHOLDS = {
  /** Snapshot age threshold for STALE_EVIDENCE flag (seconds) */
  STALE_EVIDENCE_THRESHOLD_SEC: 60,
  
  /** Point freshness threshold for STALE_DATA flag (seconds) */
  STALE_DATA_THRESHOLD_SEC: 120,
  
  /** Confidence threshold for LOW_CONFIDENCE flag */
  LOW_CONFIDENCE_THRESHOLD: 0.5,
} as const;

/**
 * Type guard for EvidenceMetricType
 */
export function isValidEvidenceMetricType(value: string): value is EvidenceMetricType {
  return [
    'error_rate',
    'latency_p95',
    'latency_p99',
    'saturation_cpu',
    'queue_depth',
    'slo_burn_rate',
  ].includes(value);
}

/**
 * Type guard for EvidenceFlag
 */
export function isValidEvidenceFlag(value: string): value is EvidenceFlag {
  return ['LOW_CONFIDENCE', 'STALE_DATA', 'STALE_EVIDENCE'].includes(value);
}

/**
 * Canonical sort for EvidenceSnapshot points
 * Ensures deterministic ordering for comparison
 */
export function sortEvidencePoints(points: EvidencePoint[]): EvidencePoint[] {
  return [...points].sort((a, b) => a.metric.localeCompare(b.metric));
}
