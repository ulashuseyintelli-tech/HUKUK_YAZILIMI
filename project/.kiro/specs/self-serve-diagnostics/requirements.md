# Requirements Document

## Introduction

Self-serve Diagnostics - Tenant admin'lerin "sisteme bakıp anlayabilmesi" için tek bir Diagnostics API.

Phase 7A'nın ilk ve tek giriş noktası. Tenant admin'ler artık:
- "Neden DEGRADED?"
- "Cache hit rate neden düştü?"
- "Breaker niye açık?"
- "Rate limit beni mi kısıtladı?"
- "Şu trace'i ver, kanıtı göstereyim."

sorularına kendi başlarına cevap bulabilecek.

**Temel Fikir:** Zaten elimizde var: metrics + trace + breaker/cache/rate-limit status endpoint'leri. Self-serve = bunları RBAC ile birleştirip tek bir "Diagnostics API" haline getirmek.

## Scope

**In Scope:**
- `/calc/diagnostics/*` endpoint'leri
- Health özet (cache/breaker/rate-limit/policy status)
- Metrics özet (p95, success rate, fallback ratio, stale ratio)
- Trace listesi (RBAC + redaction ile)
- Incident özet (son 24 saat breaker OPEN spike gibi)
- RBAC: tenant admin yalnız kendi tenantScope
- KVKK redaction (PII maskeleme)
- Audit logging (kim hangi trace'i okudu)

**Out of Scope (Non-Goals):**
- Frontend UI components (ayrı task)
- Real-time streaming/WebSocket
- Custom alert configuration
- Historical trend analysis (Phase 7B)
- Cross-tenant comparison (internal-ops only)
- Diagnostics data export (Phase 7B)

## Glossary

- **Diagnostics_Service**: Tüm diagnostics verilerini toplayan ve sunan ana servis
- **Diagnostics_Aggregator**: Metrics, status ve trace verilerini birleştiren bileşen
- **Diagnostics_RBAC**: Tenant isolation sağlayan erişim kontrol katmanı
- **Diagnostics_Redaction**: KVKK uyumlu PII maskeleme servisi
- **Health_Status**: Sistemin genel sağlık durumu (OK/DEGRADED/INCIDENT)
- **Incident**: Breaker OPEN, yüksek hata oranı gibi anormal durumlar
- **Tenant_Admin**: Kendi tenant'ının diagnostics verilerine erişebilen rol
- **Internal_Ops**: Tüm tenant'ların diagnostics verilerine erişebilen rol

## Requirements

### Requirement 1: Health Status Endpoint

**User Story:** As a tenant admin, I want to see my system's overall health status, so that I can quickly understand if there are any issues.

#### Acceptance Criteria

1. WHEN a tenant admin calls `GET /calc/diagnostics/health`, THE Diagnostics_Service SHALL return a health summary with overall status (OK/DEGRADED/INCIDENT)
2. THE health response SHALL include cache status with hit rate, miss rate, and stale serve ratio
3. THE health response SHALL include circuit breaker status for each dependency (CLOSED/OPEN/HALF_OPEN)
4. THE health response SHALL include rate limit status with remaining tokens and capacity
5. THE health response SHALL include policy engine status (available/degraded)
6. IF any circuit breaker is OPEN, THE Health_Status SHALL be DEGRADED
7. THE Health_Status SHALL be INCIDENT when ANY of the following conditions are met in the last 15 minutes:
   - Success rate < 95% (SLO breach)
   - p95 latency > 2000ms (SLO breach)
   - Circuit breaker OPEN count >= 2
   - CRITICAL trace count >= 5
8. THE Diagnostics_RBAC SHALL ensure tenant admin only sees their own tenant's health data

---

### Requirement 2: Metrics Summary Endpoint

**User Story:** As a tenant admin, I want to see my recent performance metrics, so that I can understand system behavior over time.

#### Acceptance Criteria

1. WHEN a tenant admin calls `GET /calc/diagnostics/metrics?window=15m`, THE Diagnostics_Service SHALL return metrics for the specified time window
2. THE metrics response SHALL include p50, p95, p99 latency values in milliseconds
3. THE metrics response SHALL include success rate as a percentage (0-100)
4. THE metrics response SHALL include fallback rate as a percentage
5. THE metrics response SHALL include stale serve rate as a percentage
6. THE metrics response SHALL include total request count for the window
7. WHEN window parameter is not provided, THE Diagnostics_Service SHALL default to 15 minutes
8. THE Diagnostics_Service SHALL support window values: 5m, 15m, 30m, 1h, 6h, 24h
9. IF an invalid window value is provided, THE Diagnostics_Service SHALL return 400 Bad Request with valid options
10. THE Diagnostics_RBAC SHALL ensure tenant admin only sees their own tenant's metrics

---

### Requirement 3: Trace List Endpoint

**User Story:** As a tenant admin, I want to list recent traces filtered by severity, so that I can investigate specific issues.

#### Acceptance Criteria

1. WHEN a tenant admin calls `GET /calc/diagnostics/traces`, THE Diagnostics_Service SHALL return a paginated list of traces
2. THE trace list SHALL support filtering by severity (INFO/WARN/CRITICAL)
3. THE trace list SHALL support filtering by since timestamp (ISO 8601) - REQUIRED parameter
4. THE trace list SHALL support filtering by until timestamp (ISO 8601) - defaults to now
5. THE trace list SHALL support filtering by status (OK/DEGRADED/UNAVAILABLE)
6. THE trace list SHALL support cursor-based pagination with cursor and limit parameters
7. THE default limit SHALL be 20, maximum limit SHALL be 100
8. THE since parameter SHALL be required to prevent unbounded queries
9. THE maximum time range (until - since) SHALL be 24 hours to prevent expensive queries
10. EACH trace summary in the list SHALL include: traceId, timestamp, status, durationMs, hasWarnings, hasFallback
11. THE Diagnostics_RBAC SHALL ensure tenant admin only sees their own tenant's traces
12. THE Diagnostics_Redaction SHALL mask any PII in trace summaries (debtor name, TCKN, address, phone, email)
13. WHEN a trace is accessed, THE Diagnostics_Service SHALL log the access for audit (who, when, which trace)

---

### Requirement 4: Trace Detail Endpoint

**User Story:** As a tenant admin, I want to view a specific trace's full details, so that I can understand exactly what happened in a calculation.

#### Acceptance Criteria

1. WHEN a tenant admin calls `GET /calc/diagnostics/traces/{traceId}`, THE Diagnostics_Service SHALL return the full trace bundle
2. THE Diagnostics_RBAC SHALL verify the trace belongs to the requesting tenant
3. IF the trace does not belong to the tenant, THE Diagnostics_Service SHALL return 403 Forbidden
4. IF the trace does not exist, THE Diagnostics_Service SHALL return 404 Not Found
5. THE Diagnostics_Redaction SHALL mask all PII fields in the trace response
6. THE trace detail SHALL include: meta, input (redacted), cache info, circuit breaker info, rate limit info, dependencies, policy info, warnings, result
7. WHEN a trace detail is accessed, THE Diagnostics_Service SHALL log the access for audit with full context

---

### Requirement 5: Incident Summary Endpoint

**User Story:** As a tenant admin, I want to see recent incidents and anomalies, so that I can understand what went wrong and when.

#### Acceptance Criteria

1. WHEN a tenant admin calls `GET /calc/diagnostics/incidents/recent`, THE Diagnostics_Service SHALL return incidents from the last 24 hours
2. THE incident list SHALL include circuit breaker OPEN events with dependency name and duration
3. THE incident list SHALL include high error rate periods (>10% error rate for >5 minutes)
4. THE incident list SHALL include rate limit exhaustion events
5. THE incident list SHALL include degraded service periods
6. EACH incident SHALL include: type, startedAt, endedAt (if resolved), severity, affectedDependency, recommendation
7. THE recommendation field SHALL provide actionable guidance (e.g., "rate_provider down → stale serve aktif, veriler güncel olmayabilir")
8. THE incidents SHALL be ordered by startedAt descending (most recent first)
9. THE Diagnostics_RBAC SHALL ensure tenant admin only sees their own tenant's incidents

---

### Requirement 6: RBAC and Tenant Isolation

**User Story:** As a system architect, I want strict tenant isolation in diagnostics, so that tenants cannot see each other's data.

#### Acceptance Criteria

1. THE Diagnostics_RBAC SHALL extract tenantId from the authenticated request context
2. THE Diagnostics_RBAC SHALL enforce that tenant-admin role can only access their own tenant's data
3. THE Diagnostics_RBAC SHALL allow internal-ops role to access all tenants' data
4. IF a tenant admin attempts to access another tenant's data, THE Diagnostics_Service SHALL return 403 Forbidden
5. IF authentication is missing or invalid, THE Diagnostics_Service SHALL return 401 Unauthorized
6. THE Diagnostics_RBAC SHALL log all access attempts (allowed and denied) for security audit

---

### Requirement 7: KVKK/PII Redaction

**User Story:** As a compliance officer, I want all PII masked in diagnostics responses, so that we comply with KVKK regulations.

#### Acceptance Criteria

1. THE Diagnostics_Redaction SHALL mask debtor names with format: "B***" (first letter + asterisks)
2. THE Diagnostics_Redaction SHALL mask TCKN with format: "***********" (11 asterisks)
3. THE Diagnostics_Redaction SHALL mask phone numbers with format: "+90*******XX" (last 2 digits visible)
4. THE Diagnostics_Redaction SHALL mask email addresses with format: "a***@***.com" (first letter + domain extension)
5. THE Diagnostics_Redaction SHALL mask physical addresses completely with "[ADRES GİZLİ]"
6. THE Diagnostics_Redaction SHALL process all string fields recursively in trace responses
7. THE Diagnostics_Redaction SHALL NOT modify non-PII fields (amounts, dates, status codes)

---

### Requirement 8: Rate Limiting for Diagnostics

**User Story:** As a system operator, I want diagnostics endpoints rate limited, so that they cannot be abused.

#### Acceptance Criteria

1. THE Diagnostics_Service SHALL apply rate limiting to all diagnostics endpoints
2. THE rate limit for diagnostics SHALL be separate from calc preview rate limit
3. THE default rate limit SHALL be 60 requests per minute per tenant
4. THE rate limit for trace detail endpoint SHALL be 30 requests per minute per tenant (more expensive)
5. WHEN rate limit is exceeded, THE Diagnostics_Service SHALL return 429 Too Many Requests with Retry-After header
6. THE rate limit response SHALL include remaining requests and reset time in headers

---

### Requirement 9: Size Limits for Trace Download

**User Story:** As a system operator, I want trace download size limited, so that large traces don't cause performance issues.

#### Acceptance Criteria

1. THE Diagnostics_Service SHALL enforce a maximum trace size of 10MB for download
2. IF a trace exceeds the size limit, THE Diagnostics_Service SHALL return a truncated version with a warning
3. THE truncated trace SHALL include meta, summary, and a truncation notice
4. THE truncation notice SHALL indicate original size and what was truncated
5. THE Diagnostics_Service SHALL log when truncation occurs for monitoring

---

### Requirement 10: Audit Logging

**User Story:** As a security auditor, I want all diagnostics access logged, so that I can track who accessed what data.

#### Acceptance Criteria

1. WHEN any diagnostics endpoint is called, THE Diagnostics_Service SHALL log: userId, tenantId, endpoint, timestamp, clientIp
2. WHEN a specific trace is accessed, THE Diagnostics_Service SHALL additionally log: traceId, action (VIEW/DOWNLOAD)
3. WHEN access is denied, THE Diagnostics_Service SHALL log: reason, attempted resource
4. THE audit logs SHALL be stored separately from application logs
5. THE audit logs SHALL be retained for minimum 90 days
6. THE audit log format SHALL be consistent with existing TraceAccessService logging

---

### Requirement 11: Response Format (UX Contract)

**User Story:** As a frontend developer, I want stable response formats, so that I can reliably build the diagnostics UI.

#### Acceptance Criteria

1. THE health response SHALL follow this structure:
   ```typescript
   interface DiagnosticsHealthResponse {
     status: 'OK' | 'DEGRADED' | 'INCIDENT';
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
   }
   ```
2. THE metrics response SHALL follow this structure:
   ```typescript
   interface DiagnosticsMetricsResponse {
     window: string;
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
   ```
3. THE trace list response SHALL follow this structure:
   ```typescript
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
   ```
4. THE incident response SHALL follow this structure:
   ```typescript
   interface DiagnosticsIncidentResponse {
     incidents: DiagnosticsIncident[];
     period: {
       from: string;
       to: string;
     };
   }
   ```

## Non-Goals (Explicit)

Bu fazda YAPILMAYACAKLAR:

1. **Frontend UI** - Bu spec sadece backend API; UI ayrı task
2. **Real-time streaming** - WebSocket/SSE yok, polling ile çalışacak
3. **Custom alerts** - Tenant'ların kendi alert kurallarını tanımlaması yok
4. **Historical trends** - 24 saatten uzun trend analizi yok (Phase 7B)
5. **Cross-tenant comparison** - Tenant'lar arası karşılaştırma yok
6. **Data export** - CSV/JSON export yok (Phase 7B)
7. **Diagnostics caching** - Her request fresh data (MVP basitliği)

## Invariants

| Invariant | Enforcement |
|-----------|-------------|
| Tenant isolation | RBAC her endpoint'te zorunlu |
| PII maskeleme | Redaction tüm trace response'larda |
| Rate limit | Diagnostics endpoint'leri ayrı limitli |
| Audit trail | Her erişim loglanır |
| Size limit | Trace download max 10MB |

## Exit Criteria

Phase 7A bitti demek için:
1. ✅ `/calc/diagnostics/health` endpoint çalışıyor
2. ✅ `/calc/diagnostics/metrics` endpoint çalışıyor
3. ✅ `/calc/diagnostics/traces` endpoint çalışıyor (list + detail)
4. ✅ `/calc/diagnostics/incidents/recent` endpoint çalışıyor
5. ✅ RBAC tenant isolation sağlanıyor
6. ✅ KVKK redaction tüm PII'ları maskeliyor
7. ✅ Rate limiting diagnostics endpoint'lerinde aktif
8. ✅ Audit logging tüm erişimleri kaydediyor
