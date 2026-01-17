# Self-serve Diagnostics - Tasks

## Overview

Tenant admin'lerin sistemin durumunu anlayabilmesi için Diagnostics API. Mevcut altyapıyı (TraceBundle, CircuitBreaker, RateLimit, Cache, Metrics) RBAC ile birleştirip tenant-isolated bir okuma/özetleme yüzü.

**3 Sprint Yapısı:**
1. Sprint 1: Read-only health + metrics + guards
2. Sprint 2: Trace list/detail + redaction + audit
3. Sprint 3: Incident summary + polish + golden/contract tests

---

## Sprint 1: Health & Metrics Foundation

### Task 1.1: Core Types & Interfaces ✅ DONE

**Requirement:** REQ-1.1, REQ-2.1, REQ-6.1
**File:** `diagnostics/diagnostics.types.ts`

**Acceptance Criteria:**
- [x] All types from design.md Data Models section implemented
- [x] Exported from module index
- [x] No `any` types

---

### Task 1.2: RBAC Guard (Defense in Depth - First Line) ✅ DONE

**Requirement:** REQ-6.1, REQ-6.2, REQ-6.3, REQ-6.4, REQ-6.5, REQ-6.6
**File:** `diagnostics/guards/diagnostics-rbac.guard.ts`

**Tenant Resolution Kuralı (Netleştirme):**
| Rol | tenantScope Kaynağı | Başka Tenant Seçimi |
|-----|---------------------|---------------------|
| `tenant-admin` | Sadece auth context (token/header) | ❌ YASAK |
| `internal-ops` | Auth context VEYA `?tenantId=...` query param | ✅ İZİNLİ |
| `system` | Auth context VEYA `?tenantId=...` query param | ✅ İZİNLİ |

**Cross-tenant 403 Senaryosu:**
- `tenant-admin` token'ı `tenant-A` için
- Request'te `?tenantId=tenant-B` veya `x-target-tenant-id: tenant-B` header'ı var
- Guard → 403 Forbidden

**Acceptance Criteria:**
- [x] Guard implements CanActivate
- [x] Anonymous → 401 UnauthorizedException
- [x] tenant-admin cross-tenant → 403 ForbiddenException
- [x] internal-ops → always allowed (can use ?tenantId param)
- [x] Unit tests for all 3 roles

---

### Task 1.3: Rate Limit Guard (with Burst) ✅ DONE

**Requirement:** REQ-8.1, REQ-8.2, REQ-8.3, REQ-8.4, REQ-8.5, REQ-8.6
**File:** `diagnostics/guards/diagnostics-rate-limit.guard.ts`

**İki Bucket Modeli (Netleştirme):**
```
Request → [Burst Check (10/sec)] → [Minute Check (60/min)] → Allow
              ↓ fail                    ↓ fail
            429 (retry: 1s)          429 (retry: Xms)
```

| Bucket | Limit | Window | Amaç |
|--------|-------|--------|------|
| Burst | 10 req | 1 saniye | Admin panel refresh spam önleme |
| Minute (general) | 60 req | 1 dakika | Normal kullanım |
| Minute (trace-detail) | 30 req | 1 dakika | Expensive endpoint |

**Kural:** İKİSİ DE geçmeli. Biri fail ederse 429.

**Acceptance Criteria:**
- [x] Token bucket per tenant per endpoint type
- [x] Burst check (10 req/sec max) - ayrı bucket
- [x] Minute check (60/min general, 30/min trace-detail) - ayrı bucket
- [x] 429 includes retryAfter in response
- [x] Unit tests for limit exhaustion

---

### Task 1.4: Diagnostics Aggregator (Health Sources) ✅ DONE

**Requirement:** REQ-1.2, REQ-1.3, REQ-1.4, REQ-1.5
**File:** `diagnostics/diagnostics-aggregator.service.ts`

**Acceptance Criteria:**
- [x] Reuses existing services (no new data sources)
- [x] Handles partial failures gracefully
- [x] Returns `unavailable` flag if source unreachable
- [x] Unit tests with mocked dependencies

---

### Task 1.5: Diagnostics Service (Health + Metrics) ✅ DONE

**Requirement:** REQ-1.1, REQ-1.6, REQ-1.7, REQ-2.1
**File:** `diagnostics/diagnostics.service.ts`

**Acceptance Criteria:**
- [x] `tenantScope` is REQUIRED parameter (Defense in Depth - Last Line)
- [x] No overload without tenantScope
- [x] Health status derivation: INCIDENT if success < 95% OR p95 > 2000ms OR breakers >= 2
- [x] Metrics aggregation for all windows
- [x] Unit tests for status derivation logic

---

### Task 1.6: Diagnostics Controller (Health + Metrics Endpoints) ✅ DONE

**Requirement:** REQ-1.1, REQ-2.1
**File:** `diagnostics/diagnostics.controller.ts`

**Acceptance Criteria:**
- [x] Both guards applied via @UseGuards
- [x] @TenantContext() decorator extracts context
- [x] Window validation (400 for invalid)
- [x] Integration test for full flow

---

### Task 1.7: Module Registration ✅ DONE

**Requirement:** N/A (infrastructure)
**File:** `diagnostics/diagnostics.module.ts`

**Acceptance Criteria:**
- [x] Module compiles without errors
- [x] All dependencies injected correctly
- [x] Health endpoint returns 200 with valid response

---

### Sprint 1 Checkpoint ✅ COMPLETE

**Exit Criteria:**
- [x] `GET /calc/diagnostics/health` returns valid response
- [x] `GET /calc/diagnostics/metrics?window=15m` returns valid response
- [x] RBAC guard blocks cross-tenant access
- [x] Rate limit guard enforces 60/min + burst
- [x] All unit tests passing

---

## Sprint 2: Traces & Redaction

### Task 2.1: Trace Types ✅ DONE

**Requirement:** REQ-3.1, REQ-4.1
**File:** `diagnostics/diagnostics.types.ts` (extend)

```typescript
// Add trace-related types:
// - TraceListQuery
// - DiagnosticsTraceSummary
// - DiagnosticsTraceListResponse
// - DiagnosticsTraceDetailResponse
```

**Acceptance Criteria:**
- [x] All trace types from design.md implemented
- [x] Pagination types included
- [x] Query validation types

---

### Task 2.2: Redaction Service (Allowlist-Based) ✅ DONE

**Requirement:** REQ-7.1, REQ-7.2, REQ-7.3, REQ-7.4, REQ-7.5, REQ-7.6, REQ-7.7
**File:** `diagnostics/diagnostics-redaction.service.ts`

```typescript
// Implement DiagnosticsRedactionService:
// - SAFE_FIELDS allowlist (UI DTO fields)
// - redactTrace(trace: TraceBundle): TraceBundle
// - Recursive traversal for unknown fields (with logging)
// - PII patterns: TCKN, phone, email, debtor name, address
```

**Acceptance Criteria:**
- [x] Allowlist-based (SAFE_FIELDS set)
- [x] Unknown field redaction logged
- [x] TCKN → 11 asterisks
- [x] Phone → +90*******XX
- [x] Email → a***@***.com
- [x] Debtor name → X***
- [x] Address → [ADRES GİZLİ]

---

### Task 2.3: Redaction Snapshot Tests (PII Leak Prevention) ✅ DONE

**Requirement:** REQ-7.1 (test coverage)
**File:** `diagnostics/__tests__/redaction.snapshot.spec.ts`

```typescript
// Snapshot tests for redaction:
// - Fixture with known PII
// - Assert: no PII patterns after redaction
// - Snapshot comparison for regression
```

**Acceptance Criteria:**
- [x] Fixture contains all PII types
- [x] Post-redaction: TCKN_PATTERN.test() === false
- [x] Post-redaction: PHONE_PATTERN.test() === false
- [x] Post-redaction: EMAIL_PATTERN.test() === false
- [x] Snapshot file committed

---

### Task 2.4: Audit Service ✅ DONE

**Requirement:** REQ-10.1, REQ-10.2, REQ-10.3, REQ-10.4, REQ-10.5, REQ-10.6
**File:** `diagnostics/diagnostics-audit.service.ts`

```typescript
// Implement DiagnosticsAuditService:
// - logAccess(entry: DiagnosticsAuditEntry): void
// - logTraceAccess(ctx, traceId, action, allowed, reason?): void
// - Ring buffer (MAX_LOGS = 100000)
// - Console log for external aggregation
```

**Acceptance Criteria:**
- [x] All access logged with required fields
- [x] Trace access logged with traceId and action
- [x] Ring buffer prevents memory leak
- [x] JSON format for log aggregation

---

### Task 2.5: Aggregator Extension (Traces) ✅ DONE

**Requirement:** REQ-3.1, REQ-4.1
**File:** `diagnostics/diagnostics-aggregator.service.ts` (extend)

```typescript
// Add trace methods to Aggregator:
// - queryTraces(tenantId: string, query: TraceListQuery): TraceBundle[]
// - getTrace(tenantId: string, traceId: string): TraceBundle | undefined
// 
// ⚠️ CRITICAL: tenantId parameter REQUIRED
```

**Acceptance Criteria:**
- [x] `tenantId` is REQUIRED (no global query)
- [x] Filtering by severity, status, time range
- [x] Pagination support (cursor-based)
- [x] Returns undefined for not found (not throws)

---

### Task 2.6: Service Extension (Traces) ✅ DONE

**Requirement:** REQ-3.1, REQ-4.1
**File:** `diagnostics/diagnostics.service.ts` (extend)

```typescript
// Add trace methods to Service:
// - getTraces(tenantScope: string, query: TraceListQuery): Promise<DiagnosticsTraceListResponse>
// - getTraceDetail(tenantScope: string, traceId: string): Promise<DiagnosticsTraceDetailResponse>
// 
// ⚠️ CRITICAL: tenantScope parameter REQUIRED (Defense in Depth)
```

**Acceptance Criteria:**
- [x] `tenantScope` is REQUIRED (no overload without it)
- [x] Redaction applied before response
- [x] Audit logged for trace access
- [x] Size limiting (10MB max, truncate if larger)
- [x] 404 for not found, 403 for wrong tenant

---

### Task 2.7: Controller Extension (Trace Endpoints) ✅ DONE

**Requirement:** REQ-3.1, REQ-4.1
**File:** `diagnostics/diagnostics.controller.ts` (extend)

```typescript
// Add trace endpoints:
// - GET /calc/diagnostics/traces
// - GET /calc/diagnostics/traces/:traceId
```

**Acceptance Criteria:**
- [x] Query validation (since required, max 24h range)
- [x] Pagination in response
- [x] 400 for invalid query
- [x] 404 for not found trace
- [x] 403 for cross-tenant access

---

### Sprint 2 Checkpoint ✅ COMPLETE

**Exit Criteria:**
- [x] `GET /calc/diagnostics/traces` returns paginated list
- [x] `GET /calc/diagnostics/traces/:traceId` returns redacted trace
- [x] PII redaction snapshot tests passing
- [x] Audit logs written for all trace access
- [x] Cross-tenant access blocked (403)
- [x] Size limiting works (truncation)

---

## Sprint 3: Incidents & Quality

### Task 3.1: Incident Types ✅ DONE

**Requirement:** REQ-5.1
**File:** `diagnostics/diagnostics.types.ts` (extend)

```typescript
// Add incident types:
// - IncidentType, IncidentSeverity
// - DiagnosticsIncident
// - DiagnosticsIncidentResponse
// - IncidentDetectionConfig
```

**Acceptance Criteria:**
- [x] All incident types from design.md
- [x] Default config constants

---

### Task 3.2: Incident Detection Logic ✅ DONE

**Requirement:** REQ-5.2, REQ-5.3, REQ-5.4, REQ-5.5, REQ-5.6, REQ-5.7
**File:** `diagnostics/diagnostics-incident.service.ts`

```typescript
// Implement incident detection:
// - CIRCUIT_BREAKER_OPEN: breaker state change
// - HIGH_ERROR_RATE: success < 95%
// - RATE_LIMIT_EXHAUSTED: bucket empty
// - DEGRADED_SERVICE: fallback active
// - SLO_BREACH: p95 > 2000ms
```

**Acceptance Criteria:**
- [x] All 5 incident types detected
- [x] Severity assignment (WARNING vs CRITICAL)
- [x] Recommendation text for each type
- [x] Ongoing vs resolved tracking

---

### Task 3.3: Aggregator Extension (Incidents) ✅ DONE

**Requirement:** REQ-5.1
**File:** `diagnostics/diagnostics-aggregator.service.ts` (extend)

```typescript
// Add incident method:
// - buildDetectionContext(tenantId: string): DetectionContext
```

**Acceptance Criteria:**
- [x] Builds context from metrics, breakers, rate-limit
- [x] Deduplicates similar incidents (in incident service)
- [x] Orders by startedAt descending

---

### Task 3.4: Service Extension (Incidents) ✅ DONE

**Requirement:** REQ-5.1
**File:** `diagnostics/diagnostics.service.ts` (extend)

```typescript
// Add incident method:
// - getRecentIncidents(tenantScope: string): Promise<DiagnosticsIncidentResponse>
```

**Acceptance Criteria:**
- [x] `tenantScope` REQUIRED
- [x] Summary stats (total, ongoing, resolved, bySeverity)
- [x] Period in response

---

### Task 3.5: Controller Extension (Incidents Endpoint) ✅ DONE

**Requirement:** REQ-5.1
**File:** `diagnostics/diagnostics.controller.ts` (extend)

```typescript
// Add incident endpoint:
// - GET /calc/diagnostics/incidents/recent
```

**Acceptance Criteria:**
- [x] Returns last 24h incidents
- [x] Ordered by startedAt descending
- [x] Summary included

---

### Task 3.6: Property-Based Tests ✅ DONE

**Requirement:** All properties from design.md
**File:** `diagnostics/__tests__/diagnostics.property.spec.ts`

```typescript
// Implement property tests for:
// - Property 1: Tenant Isolation
// - Property 2: Health Status Derivation
// - Property 10: PII Redaction Round-Trip
// - Property 11: Trace Detail Access Control
// - Property 15: Rate Limiting
```

**Acceptance Criteria:**
- [x] fast-check library used
- [x] Minimum 100 iterations per property
- [x] All 5 critical properties covered
- [x] Test tags include requirement references

---

### Task 3.7: Contract Tests ✅ DONE

**Requirement:** N/A (quality)
**File:** `diagnostics/__tests__/diagnostics.contract.spec.ts`

```typescript
// Contract tests for API responses:
// - Health response schema validation
// - Metrics response schema validation
// - Trace list response schema validation
// - Incident response schema validation
```

**Acceptance Criteria:**
- [x] Zod schemas for all responses
- [x] Schema validation in tests
- [x] Backward compatibility check

---

### Task 3.8: Golden Scenario Tests ✅ DONE

**Requirement:** N/A (quality)
**File:** `diagnostics/__tests__/diagnostics.golden.spec.ts`

```typescript
// Golden scenarios:
// - Healthy system → status: OK
// - Degraded system (1 breaker open) → status: DEGRADED
// - Incident system (2+ breakers, low success) → status: INCIDENT
// - Trace redaction golden output
```

**Acceptance Criteria:**
- [x] Snapshot files committed
- [x] Deterministic fixtures
- [x] CI runs golden tests

---

### Task 3.9: Integration Tests ✅ DONE

**Requirement:** N/A (quality)
**File:** `diagnostics/__tests__/diagnostics.integration.spec.ts`

```typescript
// Integration tests:
// - Full request flow (Controller → Service → Aggregator)
// - RBAC enforcement end-to-end
// - Rate limiting end-to-end
// - Audit logging verification
```

**Acceptance Criteria:**
- [x] NestJS testing module used
- [x] Real guards applied
- [x] Database/storage mocked
- [x] All endpoints covered

---

### Task 3.10: Documentation ✅ DONE

**Requirement:** N/A (documentation)
**Files:** 
- `diagnostics/README.md`
- `docs/DIAGNOSTICS-API.md`

```markdown
// Documentation:
// - API reference (all endpoints)
// - RBAC roles and permissions
// - Rate limits
// - Error codes
// - Example requests/responses
```

**Acceptance Criteria:**
- [x] All endpoints documented
- [x] Example curl commands
- [x] Error response examples
- [x] RBAC matrix

---

### Sprint 3 Checkpoint ✅ COMPLETE

**Exit Criteria:**
- [x] `GET /calc/diagnostics/incidents/recent` returns incidents
- [x] All 5 incident types detected correctly
- [x] Property tests passing (100+ iterations)
- [x] Contract tests passing
- [x] Golden tests passing
- [x] Integration tests passing
- [x] Documentation complete

---

## Final Checklist

### Invariants Verified

| Invariant | Test Coverage |
|-----------|---------------|
| Tenant isolation | Property 1, Integration |
| RBAC defense in depth | Unit tests for guard + service |
| PII redaction | Property 10, Snapshot tests |
| Rate limiting | Property 15, Integration |
| Audit logging | Property 17, Integration |

### Files Created

```
diagnostics/
├── diagnostics.types.ts
├── diagnostics.module.ts
├── diagnostics.controller.ts
├── diagnostics.service.ts
├── diagnostics-aggregator.service.ts
├── diagnostics-redaction.service.ts
├── diagnostics-audit.service.ts
├── diagnostics-incident.service.ts
├── guards/
│   ├── diagnostics-rbac.guard.ts
│   └── diagnostics-rate-limit.guard.ts
├── __tests__/
│   ├── redaction.snapshot.spec.ts
│   ├── diagnostics.property.spec.ts
│   ├── diagnostics.contract.spec.ts
│   ├── diagnostics.golden.spec.ts
│   ├── diagnostics.integration.spec.ts
│   ├── diagnostics.service.spec.ts
│   ├── diagnostics-rbac.guard.spec.ts
│   └── diagnostics-rate-limit.guard.spec.ts
├── README.md
└── index.ts
```

### Exit Criteria (Phase Complete) ✅

- [x] All 3 sprints complete
- [x] All endpoints functional
- [x] RBAC enforced at guard AND service level
- [x] PII redaction with snapshot tests
- [x] Rate limiting with burst protection
- [x] Audit logging for all access
- [x] Property tests (5 critical properties)
- [x] Contract tests (schema validation)
- [x] Golden tests (deterministic scenarios)
- [x] Integration tests (full flow)
- [x] Documentation complete
