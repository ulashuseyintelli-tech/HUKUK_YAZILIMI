# Design Document: Self-serve Diagnostics

## Overview

Self-serve Diagnostics, tenant admin'lerin sistemin durumunu anlayabilmesi için tek bir API katmanı sağlar. Mevcut altyapıyı (TraceBundle, CircuitBreaker, RateLimit, Cache, Metrics) RBAC ile birleştirip tenant-isolated bir "Diagnostics API" haline getirir.

**Temel Prensipler:**
- Mevcut servisleri yeniden kullanma (yeni veri kaynağı yok)
- Tenant isolation her katmanda zorunlu
- PII maskeleme response seviyesinde
- Rate limiting diagnostics'e özel bucket

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        DiagnosticsController                         │
│  GET /health  │  GET /metrics  │  GET /traces  │  GET /incidents    │
└───────────────────────────────┬─────────────────────────────────────┘
                                │
                    ┌───────────▼───────────┐
                    │  DiagnosticsRBACGuard │ ← Tenant isolation
                    └───────────┬───────────┘
                                │
                    ┌───────────▼───────────┐
                    │  DiagnosticsRateLimit │ ← Ayrı bucket
                    └───────────┬───────────┘
                                │
                    ┌───────────▼───────────┐
                    │  DiagnosticsService   │
                    └───────────┬───────────┘
                                │
        ┌───────────────────────┼───────────────────────┐
        │                       │                       │
┌───────▼───────┐   ┌───────────▼───────────┐   ┌───────▼───────┐
│ Aggregator    │   │ RedactionService      │   │ AuditLogger   │
│ (data merge)  │   │ (PII masking)         │   │ (access log)  │
└───────┬───────┘   └───────────────────────┘   └───────────────┘
        │
        ├──────────────────┬──────────────────┬──────────────────┐
        │                  │                  │                  │
┌───────▼───────┐  ┌───────▼───────┐  ┌───────▼───────┐  ┌───────▼───────┐
│ CircuitBreaker│  │ RateLimitSvc  │  │ CacheService  │  │ TraceStorage  │
│ Service       │  │               │  │               │  │ Service       │
└───────────────┘  └───────────────┘  └───────────────┘  └───────────────┘
```

## Components and Interfaces

### DiagnosticsController

HTTP endpoint'lerini expose eden controller. Tüm endpoint'ler `/calc/diagnostics/` prefix'i altında.

```typescript
@Controller('calc/diagnostics')
@UseGuards(DiagnosticsRBACGuard, DiagnosticsRateLimitGuard)
export class DiagnosticsController {
  constructor(
    private readonly diagnosticsService: DiagnosticsService,
  ) {}

  @Get('health')
  getHealth(@TenantContext() ctx: TenantAccessContext): Promise<DiagnosticsHealthResponse>;

  @Get('metrics')
  getMetrics(
    @TenantContext() ctx: TenantAccessContext,
    @Query('window') window?: MetricsWindow,
  ): Promise<DiagnosticsMetricsResponse>;

  @Get('traces')
  getTraces(
    @TenantContext() ctx: TenantAccessContext,
    @Query() query: TraceListQuery,
  ): Promise<DiagnosticsTraceListResponse>;

  @Get('traces/:traceId')
  getTraceDetail(
    @TenantContext() ctx: TenantAccessContext,
    @Param('traceId') traceId: string,
  ): Promise<DiagnosticsTraceDetailResponse>;

  @Get('incidents/recent')
  getRecentIncidents(
    @TenantContext() ctx: TenantAccessContext,
  ): Promise<DiagnosticsIncidentResponse>;
}
```

### DiagnosticsService

Ana iş mantığı servisi. Aggregator'dan veri alır, redaction uygular, audit loglar.

```typescript
@Injectable()
export class DiagnosticsService {
  constructor(
    private readonly aggregator: DiagnosticsAggregator,
    private readonly redaction: DiagnosticsRedactionService,
    private readonly audit: DiagnosticsAuditService,
  ) {}

  async getHealth(ctx: TenantAccessContext): Promise<DiagnosticsHealthResponse>;
  async getMetrics(ctx: TenantAccessContext, window: MetricsWindow): Promise<DiagnosticsMetricsResponse>;
  async getTraces(ctx: TenantAccessContext, query: TraceListQuery): Promise<DiagnosticsTraceListResponse>;
  async getTraceDetail(ctx: TenantAccessContext, traceId: string): Promise<DiagnosticsTraceDetailResponse>;
  async getRecentIncidents(ctx: TenantAccessContext): Promise<DiagnosticsIncidentResponse>;
}
```

### DiagnosticsAggregator

Farklı kaynaklardan veri toplayan bileşen. Yeni veri üretmez, mevcut servisleri sorgular.

```typescript
@Injectable()
export class DiagnosticsAggregator {
  constructor(
    private readonly circuitBreaker: CalcPreviewCircuitBreakerService,
    private readonly rateLimit: CalcPreviewRateLimitService,
    private readonly cache: VersionedCacheService,
    private readonly traceStorage: TraceStorageService,
    private readonly metrics: CalcPreviewMetricsService,
  ) {}

  // Health aggregation
  getCircuitBreakerStatuses(): Record<DependencyName, CircuitStatus>;
  getRateLimitStatus(tenantId: string): RateLimitStatus;
  getCacheStats(): CacheStats;
  
  // Metrics aggregation
  getMetricsForWindow(tenantId: string, window: MetricsWindow): AggregatedMetrics;
  
  // Trace aggregation
  queryTraces(tenantId: string, query: TraceListQuery): TraceBundle[];
  getTrace(traceId: string): TraceBundle | undefined;
  
  // Incident detection
  detectIncidents(tenantId: string, since: Date): DetectedIncident[];
}
```

### DiagnosticsRBACGuard

Tenant isolation sağlayan NestJS guard. Controller seviyesinde uygulanır.

**RBAC Enforcement Kuralı (Defense in Depth):**

> ⚠️ **KRİTİK KURAL:** Guard tek başına yeterli DEĞİL. Service başka bir yerden çağrılırsa (internal reuse, cron, future refactor) RBAC bypass riski doğar.

| Katman | Rol | Zorunluluk |
|--------|-----|------------|
| Guard | First line | Controller seviyesi check |
| Service | Last line | `tenantScope` parametresi ZORUNLU |
| Repository | Data layer | `tenantScope`'suz query YASAK |

**Kural:** `DiagnosticsService.getTraceDetail(tenantScope, traceId)` gibi; `tenantScope`'suz overload YASAK. "Global read" fonksiyonu OLMAYACAK.

```typescript
@Injectable()
export class DiagnosticsRBACGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const ctx = this.extractTenantContext(request);
    
    // Anonymous erişim yasak
    if (ctx.role === 'anonymous') {
      throw new UnauthorizedException('Authentication required');
    }
    
    // tenant-admin sadece kendi tenant'ına erişebilir
    if (ctx.role === 'tenant-admin') {
      const requestedTenantId = this.extractRequestedTenantId(request);
      if (requestedTenantId && requestedTenantId !== ctx.tenantId) {
        throw new ForbiddenException('Access denied: cannot access other tenant data');
      }
    }
    
    // internal-ops her şeye erişebilir
    return true;
  }
}

// Service seviyesinde tenantScope ZORUNLU
// tenantScope'suz overload YASAK
interface DiagnosticsServiceContract {
  // ✅ DOĞRU: tenantScope zorunlu
  getTraceDetail(tenantScope: string, traceId: string): Promise<TraceBundle>;
  getTraces(tenantScope: string, query: TraceListQuery): Promise<TraceBundle[]>;
  
  // ❌ YANLIŞ: tenantScope'suz overload YASAK
  // getTraceDetail(traceId: string): Promise<TraceBundle>; // FORBIDDEN
}
```

### DiagnosticsRateLimitGuard

Diagnostics endpoint'leri için ayrı rate limit bucket.

```typescript
@Injectable()
export class DiagnosticsRateLimitGuard implements CanActivate {
  private readonly buckets = new Map<string, TokenBucket>();
  
  // Diagnostics-specific limits
  private readonly GENERAL_LIMIT = 60;      // 60 req/min
  private readonly TRACE_DETAIL_LIMIT = 30; // 30 req/min (expensive)
  private readonly BURST_LIMIT = 10;        // Burst capacity (admin panel refresh spam için)
  private readonly BURST_WINDOW_MS = 1000;  // 1 saniye içinde max 10 request
  
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const tenantId = this.extractTenantId(request);
    const endpoint = this.extractEndpoint(request);
    
    const limit = endpoint.includes('/traces/') 
      ? this.TRACE_DETAIL_LIMIT 
      : this.GENERAL_LIMIT;
    
    const bucket = this.getOrCreateBucket(tenantId, endpoint);
    
    // Burst check first
    if (!this.checkBurst(bucket)) {
      throw new HttpException({
        statusCode: 429,
        message: 'Burst limit exceeded for diagnostics',
        retryAfter: 1, // 1 second for burst
      }, 429);
    }
    
    if (!this.checkAndConsume(bucket, limit)) {
      throw new HttpException({
        statusCode: 429,
        message: 'Rate limit exceeded for diagnostics',
        retryAfter: this.calculateRetryAfter(bucket),
      }, 429);
    }
    
    return true;
  }
  
  private checkBurst(bucket: TokenBucket): boolean {
    const now = Date.now();
    const recentRequests = bucket.requests.filter(t => now - t < 1000).length;
    return recentRequests < this.BURST_LIMIT;
  }
}
```

### DiagnosticsRedactionService

PII maskeleme servisi. Response seviyesinde uygulanır.

**Redaction Kuralları (Sertleştirilmiş):**

> ⚠️ **KRİTİK:** Recursive redaction tehlikeli. Yanlış maskeleme ya fazla maskeleyip debug'ı öldürür ya da eksik maskeleyip KVKK riski yaratır.

| Kural | Açıklama |
|-------|----------|
| Allowlist tabanlı | UI DTO alanları `SAFE_FIELDS` set'inde tanımlı |
| Recursive fallback | Sadece "unknown fields" için, ve HER ZAMAN loglanır |
| Snapshot testleri | Fixture üzerinden PII leak test (CI'da zorunlu) |
| Fail-closed | Redaction hatası → response bloklanır (500) |

**Test Zorunluluğu:**
```typescript
// __tests__/redaction.snapshot.spec.ts
// Fixture: known PII içeren trace
// Assert: redact sonrası hiçbir PII pattern match etmemeli
```

```typescript
@Injectable()
export class DiagnosticsRedactionService {
  private readonly logger = new Logger('DiagnosticsRedaction');
  
  // Allowlist: Bu alanlar redaction'a tabi DEĞİL (safe fields)
  private readonly SAFE_FIELDS = new Set([
    'traceId', 'requestId', 'tenantId', 'clientId', 'endpoint', 'mode',
    'startedAt', 'finishedAt', 'durationMs', 'version', 'service', 'commit', 'build',
    'fingerprint', 'principalAmount', 'currency', 'interestType', 'startDate', 'endDate',
    'caseType', 'debtorCount', 'skipInterest', 'skipFee', 'skipPolicy',
    'hits', 'misses', 'staleServed', 'hit', 'miss', 'stale', 'ttlSec',
    'state', 'openedAt', 'halfOpenTrials', 'halfOpenFailures', 'from', 'to', 'reason', 'at',
    'applied', 'burst', 'steadyPerSec', 'remainingTokens', 'retryAfterMs',
    'name', 'callId', 'outcome', 'domainValid', 'source', 'circuitState',
    'softCheck', 'code', 'severity', 'status', 'totals', 'interest', 'fees', 'total',
    'enabled', 'category', 'diffSummary',
  ]);
  
  // Regex patterns for PII detection
  private readonly TCKN_PATTERN = /\b\d{11}\b/g;
  private readonly PHONE_PATTERN = /\+?90?\s*\d{3}\s*\d{3}\s*\d{2}\s*\d{2}/g;
  private readonly EMAIL_PATTERN = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  
  /**
   * Trace bundle'ı redact et
   */
  redactTrace(trace: TraceBundle): TraceBundle {
    return this.redactObject(trace, []) as TraceBundle;
  }
  
  /**
   * Recursive object redaction with path tracking
   */
  private redactObject(obj: unknown, path: string[]): unknown {
    if (typeof obj === 'string') {
      return this.redactString(obj, path);
    }
    if (Array.isArray(obj)) {
      return obj.map((item, i) => this.redactObject(item, [...path, `[${i}]`]));
    }
    if (obj && typeof obj === 'object') {
      const result: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(obj)) {
        const fieldPath = [...path, key];
        
        // Safe field: skip redaction
        if (this.SAFE_FIELDS.has(key)) {
          result[key] = value;
          continue;
        }
        
        // Unknown field: apply redaction and log
        if (!this.SAFE_FIELDS.has(key) && typeof value === 'string') {
          this.logger.debug(`Redacting unknown field: ${fieldPath.join('.')}`);
        }
        
        result[key] = this.redactObject(value, fieldPath);
      }
      return result;
    }
    return obj;
  }
  
  /**
   * String redaction with pattern matching
   */
  private redactString(str: string, path: string[]): string {
    let result = str;
    let redacted = false;
    
    // TCKN: 11 asterisks
    if (this.TCKN_PATTERN.test(result)) {
      result = result.replace(this.TCKN_PATTERN, '***********');
      redacted = true;
    }
    
    // Phone: +90*******XX
    if (this.PHONE_PATTERN.test(result)) {
      result = result.replace(this.PHONE_PATTERN, (match) => {
        const digits = match.replace(/\D/g, '');
        return `+90*******${digits.slice(-2)}`;
      });
      redacted = true;
    }
    
    // Email: a***@***.com
    if (this.EMAIL_PATTERN.test(result)) {
      result = result.replace(this.EMAIL_PATTERN, (match) => {
        const [local, domain] = match.split('@');
        const ext = domain.split('.').pop();
        return `${local[0]}***@***.${ext}`;
      });
      redacted = true;
    }
    
    if (redacted) {
      this.logger.debug(`PII redacted at path: ${path.join('.')}`);
    }
    
    return result;
  }
  
  /**
   * Debtor name redaction (explicit field)
   */
  redactDebtorName(name: string): string {
    if (!name || name.length === 0) return name;
    return `${name[0]}***`;
  }
  
  /**
   * Address redaction (complete mask)
   */
  redactAddress(_address: string): string {
    return '[ADRES GİZLİ]';
  }
}
```

### DiagnosticsAuditService

Erişim loglarını kaydeden servis.

```typescript
@Injectable()
export class DiagnosticsAuditService {
  private readonly logger = new Logger('DiagnosticsAudit');
  private readonly auditLogs: DiagnosticsAuditLog[] = [];
  private readonly MAX_LOGS = 100000;
  
  /**
   * Endpoint erişimini logla
   */
  logAccess(entry: DiagnosticsAuditEntry): void {
    const log: DiagnosticsAuditLog = {
      ...entry,
      timestamp: new Date().toISOString(),
      id: randomUUID(),
    };
    
    this.auditLogs.push(log);
    
    // Ring buffer
    if (this.auditLogs.length > this.MAX_LOGS) {
      this.auditLogs.shift();
    }
    
    // Console log for external aggregation
    this.logger.log(JSON.stringify(log));
  }
  
  /**
   * Trace erişimini logla (detaylı)
   */
  logTraceAccess(
    ctx: TenantAccessContext,
    traceId: string,
    action: 'VIEW' | 'DOWNLOAD',
    allowed: boolean,
    reason?: string,
  ): void {
    this.logAccess({
      userId: ctx.userId,
      tenantId: ctx.tenantId,
      role: ctx.role,
      endpoint: `/calc/diagnostics/traces/${traceId}`,
      action,
      resourceId: traceId,
      resourceType: 'trace',
      clientIp: ctx.clientIp,
      allowed,
      reason,
    });
  }
}
```

## Data Models

### Request/Response Types

```typescript
// ============================================================================
// TENANT CONTEXT
// ============================================================================

interface TenantAccessContext {
  userId: string;
  tenantId: string;
  role: 'tenant-admin' | 'internal-ops' | 'system';
  clientIp?: string;
  userAgent?: string;
}

// ============================================================================
// HEALTH
// ============================================================================

type HealthStatus = 'OK' | 'DEGRADED' | 'INCIDENT';

interface DiagnosticsHealthResponse {
  status: HealthStatus;
  timestamp: string;
  tenantId: string;
  cache: {
    hitRate: number;      // 0-100
    missRate: number;     // 0-100
    staleRate: number;    // 0-100
  };
  circuitBreakers: Record<string, {
    state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
    openedAt?: string;
    nextRetryAt?: string;
  }>;
  rateLimit: {
    remaining: number;
    capacity: number;
    blocked: boolean;
  };
  policyEngine: {
    available: boolean;
    lastCheck: string;
  };
  // INCIDENT detection criteria
  incidentCriteria?: {
    successRateBelow95: boolean;
    p95Above2000ms: boolean;
    openBreakerCount: number;
    criticalTraceCount: number;
  };
}

// ============================================================================
// METRICS
// ============================================================================

type MetricsWindow = '5m' | '15m' | '30m' | '1h' | '6h' | '24h';

interface DiagnosticsMetricsResponse {
  window: MetricsWindow;
  tenantId: string;
  timestamp: string;
  latency: {
    p50: number;
    p95: number;
    p99: number;
  };
  rates: {
    success: number;      // 0-100
    fallback: number;     // 0-100
    stale: number;        // 0-100
    error: number;        // 0-100
  };
  counts: {
    total: number;
    success: number;
    fallback: number;
    error: number;
  };
}

// ============================================================================
// TRACES
// ============================================================================

interface TraceListQuery {
  since: string;          // ISO 8601 - REQUIRED
  until?: string;         // ISO 8601 - defaults to now
  severity?: 'INFO' | 'WARN' | 'CRITICAL';
  status?: 'OK' | 'DEGRADED' | 'UNAVAILABLE';
  cursor?: string;
  limit?: number;         // default 20, max 100
}

interface DiagnosticsTraceSummary {
  traceId: string;
  timestamp: string;
  status: 'OK' | 'DEGRADED' | 'UNAVAILABLE';
  durationMs: number;
  hasWarnings: boolean;
  hasFallback: boolean;
}

interface DiagnosticsTraceListResponse {
  traces: DiagnosticsTraceSummary[];
  pagination: {
    total: number;
    limit: number;
    cursor?: string;
    nextCursor?: string;
    hasMore: boolean;
  };
  query: {
    since: string;
    until: string;
    severity?: string;
    status?: string;
  };
}

interface DiagnosticsTraceDetailResponse {
  trace: TraceBundle;     // Redacted
  truncated: boolean;
  truncationReason?: string;
  originalSizeBytes?: number;
}

// ============================================================================
// INCIDENTS
// ============================================================================

type IncidentType = 
  | 'CIRCUIT_BREAKER_OPEN'
  | 'HIGH_ERROR_RATE'
  | 'RATE_LIMIT_EXHAUSTED'
  | 'DEGRADED_SERVICE'
  | 'SLO_BREACH';

type IncidentSeverity = 'WARNING' | 'CRITICAL';

interface DiagnosticsIncident {
  id: string;
  type: IncidentType;
  severity: IncidentSeverity;
  startedAt: string;
  endedAt?: string;       // undefined if ongoing
  affectedDependency?: string;
  description: string;
  recommendation: string;
  metrics?: {
    errorRate?: number;
    p95Latency?: number;
    affectedRequests?: number;
  };
}

interface DiagnosticsIncidentResponse {
  incidents: DiagnosticsIncident[];
  period: {
    from: string;
    to: string;
  };
  summary: {
    total: number;
    ongoing: number;
    resolved: number;
    bySeverity: Record<IncidentSeverity, number>;
  };
}

// ============================================================================
// AUDIT
// ============================================================================

interface DiagnosticsAuditEntry {
  userId: string;
  tenantId: string;
  role: string;
  endpoint: string;
  action?: 'VIEW' | 'DOWNLOAD' | 'QUERY';
  resourceId?: string;
  resourceType?: 'trace' | 'metrics' | 'health' | 'incident';
  clientIp?: string;
  allowed: boolean;
  reason?: string;
}

interface DiagnosticsAuditLog extends DiagnosticsAuditEntry {
  id: string;
  timestamp: string;
}
```

### Incident Detection Logic

```typescript
interface IncidentDetectionConfig {
  // SLO thresholds
  successRateSLO: number;           // 95%
  p95LatencySLO: number;            // 2000ms
  
  // Incident thresholds
  openBreakerThreshold: number;     // 2
  criticalTraceThreshold: number;   // 5
  
  // Time windows
  evaluationWindowMs: number;       // 15 minutes
  minDurationForIncidentMs: number; // 5 minutes
}

const DEFAULT_INCIDENT_CONFIG: IncidentDetectionConfig = {
  successRateSLO: 95,
  p95LatencySLO: 2000,
  openBreakerThreshold: 2,
  criticalTraceThreshold: 5,
  evaluationWindowMs: 15 * 60 * 1000,
  minDurationForIncidentMs: 5 * 60 * 1000,
};
```


## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Tenant Isolation

*For any* diagnostics request from a tenant-admin role, all data in the response (health, metrics, traces, incidents) SHALL belong to the requesting tenant's tenantId. No data from other tenants SHALL ever be visible.

**Validates: Requirements 1.8, 2.10, 3.11, 4.2, 5.9, 6.1-6.6**

---

### Property 2: Health Status Derivation

*For any* system state:
- If at least one circuit breaker is OPEN, health status SHALL be DEGRADED or INCIDENT
- If success rate < 95% OR p95 > 2000ms OR open breaker count >= 2 OR critical trace count >= 5 (in last 15 min), health status SHALL be INCIDENT

**Validates: Requirements 1.6, 1.7**

---

### Property 3: Health Response Completeness

*For any* health response, the following fields SHALL be present and valid:
- cache.hitRate, cache.missRate, cache.staleRate: numbers in range [0, 100]
- circuitBreakers: record with all known dependencies
- rateLimit.remaining <= rateLimit.capacity
- policyEngine.available: boolean

**Validates: Requirements 1.2, 1.3, 1.4, 1.5**

---

### Property 4: Metrics Response Completeness

*For any* metrics response, the following fields SHALL be present:
- latency.p50, latency.p95, latency.p99: non-negative numbers
- rates.success, rates.fallback, rates.stale, rates.error: numbers in range [0, 100]
- counts.total >= counts.success + counts.error

**Validates: Requirements 2.2, 2.3, 2.4, 2.5, 2.6**

---

### Property 5: Valid Window Values

*For any* metrics request:
- If window is one of ['5m', '15m', '30m', '1h', '6h', '24h'], request SHALL succeed
- If window is any other value, request SHALL return 400 Bad Request

**Validates: Requirements 2.8, 2.9**

---

### Property 6: Trace List Filtering

*For any* trace list response with filters applied:
- If severity filter is set, all traces SHALL have matching severity
- If status filter is set, all traces SHALL have matching status
- If until filter is set, all traces SHALL have timestamp <= until

**Validates: Requirements 3.2, 3.4, 3.5**

---

### Property 7: Trace List Pagination

*For any* trace list with cursor-based pagination:
- Consecutive pages SHALL NOT contain overlapping traces
- If limit is not specified, response SHALL contain at most 20 traces
- If limit > 100, response SHALL contain at most 100 traces

**Validates: Requirements 3.6, 3.7**

---

### Property 8: Trace List Time Range Validation

*For any* trace list request:
- If since parameter is missing, request SHALL return 400 Bad Request
- If (until - since) > 24 hours, request SHALL return 400 Bad Request

**Validates: Requirements 3.3, 3.8, 3.9**

---

### Property 9: Trace Summary Completeness

*For any* trace in a trace list response, the following fields SHALL be present:
- traceId: non-empty string
- timestamp: valid ISO 8601 string
- status: one of ['OK', 'DEGRADED', 'UNAVAILABLE']
- durationMs: non-negative number
- hasWarnings: boolean
- hasFallback: boolean

**Validates: Requirements 3.10**

---

### Property 10: PII Redaction Round-Trip

*For any* trace response (list or detail), applying PII detection patterns SHALL find no matches:
- No 11-digit TCKN patterns
- No phone number patterns (+90...)
- No email patterns (x@y.z)
- No raw debtor names (if known field)

**Validates: Requirements 3.12, 4.5, 7.1-7.7**

---

### Property 11: Trace Detail Access Control

*For any* trace detail request:
- If traceId does not exist, response SHALL be 404
- If trace.tenantId != requester.tenantId AND role is tenant-admin, response SHALL be 403

**Validates: Requirements 4.3, 4.4**

---

### Property 12: Incident Time Range

*For any* incident in the recent incidents response, incident.startedAt SHALL be within the last 24 hours.

**Validates: Requirements 5.1**

---

### Property 13: Incident Ordering

*For any* incident list response, incidents SHALL be ordered by startedAt descending (most recent first).

**Validates: Requirements 5.8**

---

### Property 14: Incident Completeness

*For any* incident in the response, the following fields SHALL be present:
- id: non-empty string
- type: valid IncidentType
- severity: 'WARNING' or 'CRITICAL'
- startedAt: valid ISO 8601 string
- description: non-empty string
- recommendation: non-empty string

**Validates: Requirements 5.6, 5.7**

---

### Property 15: Rate Limiting

*For any* tenant making diagnostics requests:
- After 60 requests in 1 minute to general endpoints, subsequent requests SHALL return 429
- After 30 requests in 1 minute to trace detail endpoint, subsequent requests SHALL return 429
- 429 response SHALL include Retry-After header

**Validates: Requirements 8.1-8.6**

---

### Property 16: Size Limiting

*For any* trace detail response:
- If original trace size > 10MB, response SHALL be truncated
- Truncated response SHALL include truncated: true and truncationReason

**Validates: Requirements 9.1-9.5**

---

### Property 17: Audit Logging

*For any* diagnostics endpoint call, an audit log entry SHALL be created containing:
- userId, tenantId, endpoint, timestamp, clientIp
- For trace access: traceId and action (VIEW/DOWNLOAD)

**Validates: Requirements 3.13, 4.7, 10.1-10.6**

## Error Handling

### HTTP Status Codes

| Status | Condition |
|--------|-----------|
| 200 | Başarılı response |
| 400 | Invalid parameters (window, time range, etc.) |
| 401 | Authentication missing or invalid |
| 403 | Tenant isolation violation |
| 404 | Trace not found |
| 429 | Rate limit exceeded |
| 500 | Internal server error |

### Error Response Format

```typescript
interface DiagnosticsErrorResponse {
  statusCode: number;
  error: string;
  message: string;
  details?: {
    field?: string;
    validValues?: string[];
    retryAfter?: number;
  };
}
```

### Degraded Mode Behavior

1. **Aggregator Partial Failure**: Eğer bir kaynak (örn. metrics) erişilemezse, diğer kaynaklar hala döner. Erişilemeyen kaynak için `null` veya `unavailable` flag'i set edilir.

2. **Redaction Failure**: Redaction servisi başarısız olursa, trace response'u tamamen bloklanır (PII sızıntısı önlenir). 500 döner.

3. **Audit Failure**: Audit logging başarısız olursa, request yine de işlenir ama bir warning metric emit edilir.

## Testing Strategy

### Unit Tests

Unit testler şu senaryoları kapsar:
- DiagnosticsRedactionService: Her PII tipi için maskeleme
- DiagnosticsAggregator: Veri birleştirme mantığı
- Health status derivation: INCIDENT koşulları
- Incident detection: Her incident tipi için detection

### Property-Based Tests

Property testler fast-check kütüphanesi ile yazılır. Her test minimum 100 iterasyon çalışır.

```typescript
// Örnek: Tenant Isolation Property
describe('Property 1: Tenant Isolation', () => {
  it('tenant-admin only sees own tenant data', () => {
    fc.assert(
      fc.property(
        fc.record({
          requestTenantId: fc.string(),
          dataTenantId: fc.string(),
        }),
        ({ requestTenantId, dataTenantId }) => {
          // Setup: Create data for dataTenantId
          // Act: Request as tenant-admin for requestTenantId
          // Assert: If requestTenantId !== dataTenantId, data should not be visible
        }
      ),
      { numRuns: 100 }
    );
  });
});
```

### Test Tagging

Her property test şu formatta tag'lenir:
```typescript
/**
 * Feature: self-serve-diagnostics
 * Property 1: Tenant Isolation
 * Validates: Requirements 1.8, 2.10, 3.11, 4.2, 5.9, 6.1-6.6
 */
```

### Integration Tests

Integration testler şu senaryoları kapsar:
- Full request flow: Controller → Service → Aggregator → Response
- RBAC enforcement: Guard'ların doğru çalışması
- Rate limiting: Bucket'ların doğru tükenmesi
- Audit logging: Log'ların doğru yazılması


---

## Design Sertleştirmeleri (Production-Critical)

Bu bölüm, production'da en çok acıtan iki noktayı özetler.

### 1. RBAC Defense in Depth

> ⚠️ **Guard tek başına yeterli DEĞİL.**

| Katman | Kontrol | Bypass Riski |
|--------|---------|--------------|
| Guard (Controller) | First line | Internal reuse, cron, refactor |
| Service | Last line | Yok (tenantScope zorunlu) |
| Repository | Data layer | Yok (tenantScope'suz query yasak) |

**Kural:** Her service metodu `tenantScope` parametresi alır. "Global read" overload'u YASAK.

```typescript
// ✅ DOĞRU
getTraceDetail(tenantScope: string, traceId: string): Promise<TraceBundle>;

// ❌ YANLIŞ - YASAK
getTraceDetail(traceId: string): Promise<TraceBundle>;
```

### 2. Recursive PII Redaction Kuralları

> ⚠️ **Yanlış maskeleme ya debug'ı öldürür ya KVKK riski yaratır.**

| Kural | Açıklama |
|-------|----------|
| Allowlist tabanlı | `SAFE_FIELDS` set'indeki alanlar redaction'a tabi DEĞİL |
| Unknown field fallback | Recursive traversal + HER ZAMAN loglanır |
| Fail-closed | Redaction hatası → 500 (PII sızıntısı önlenir) |
| Snapshot testleri | CI'da zorunlu, fixture üzerinden PII leak test |

**Test Zorunluluğu:**
```typescript
// Post-redaction assertions:
expect(TCKN_PATTERN.test(redactedTrace)).toBe(false);
expect(PHONE_PATTERN.test(redactedTrace)).toBe(false);
expect(EMAIL_PATTERN.test(redactedTrace)).toBe(false);
```

### 3. Rate Limit Burst Protection

| Limit | Değer | Amaç |
|-------|-------|------|
| General | 60/min | Normal kullanım |
| Trace Detail | 30/min | Expensive endpoint |
| Burst | 10/sec | Admin panel refresh spam |

---

## Design Status

**Status:** ✅ APPROVED (Sertleştirilmiş)

Kullanıcı onayı: 2 sertleştirme (RBAC defense in depth + recursive redaction kuralları) eklendi.

Tasks.md'ye geçiş hazır.
