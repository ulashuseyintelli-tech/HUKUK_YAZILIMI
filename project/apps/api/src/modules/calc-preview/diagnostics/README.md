# Diagnostics Module

Self-serve diagnostics API for tenant admins to understand system status.

## Overview

Bu modül, tenant admin'lerin sistemin durumunu anlayabilmesi için read-only bir diagnostics API sağlar. Mevcut altyapıyı (TraceBundle, CircuitBreaker, RateLimit, Cache, Metrics) RBAC ile birleştirip tenant-isolated bir okuma/özetleme yüzü sunar.

## Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/calc/diagnostics/health` | GET | System health status |
| `/calc/diagnostics/metrics` | GET | Performance metrics |
| `/calc/diagnostics/traces` | GET | Trace list (paginated) |
| `/calc/diagnostics/traces/:traceId` | GET | Trace detail (redacted) |
| `/calc/diagnostics/incidents/recent` | GET | Recent incidents |

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     DiagnosticsController                        │
│  ┌─────────────┐  ┌──────────────────┐                          │
│  │ RBAC Guard  │→ │ Rate Limit Guard │→ Endpoints               │
│  └─────────────┘  └──────────────────┘                          │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     DiagnosticsService                           │
│  - tenantScope REQUIRED (Defense in Depth)                       │
│  - Health status derivation                                      │
│  - Metrics aggregation                                           │
│  - Trace access control                                          │
└─────────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│   Aggregator    │ │   Redaction     │ │     Audit       │
│   Service       │ │   Service       │ │    Service      │
└─────────────────┘ └─────────────────┘ └─────────────────┘
```

## Security

### RBAC (Role-Based Access Control)

| Role | Tenant Access | Cross-Tenant |
|------|---------------|--------------|
| `tenant-admin` | Own tenant only | ❌ FORBIDDEN |
| `internal-ops` | Any tenant | ✅ via `?tenantId` |
| `system` | Any tenant | ✅ via `?tenantId` |

### Defense in Depth

1. **Guard (First Line):** RBAC check at request entry
2. **Service (Last Line):** `tenantScope` parameter REQUIRED on all methods

### Rate Limiting

Two-bucket model:

| Bucket | Limit | Window | Purpose |
|--------|-------|--------|---------|
| Burst | 10 req | 1 sec | Spam prevention |
| Minute (general) | 60 req | 1 min | Normal usage |
| Minute (trace-detail) | 30 req | 1 min | Expensive endpoint |

**Rule:** Both buckets must pass. Either fails → 429.

### PII Redaction

Allowlist-based, fail-closed redaction:

| PII Type | Redaction Format |
|----------|------------------|
| TCKN | `***********` (11 asterisks) |
| Phone | `+90*******XX` |
| Email | `a***@***.com` |
| Debtor Name | `A***` |
| Address | `[ADRES GİZLİ]` |

## Health Status Derivation

```
INCIDENT if:
  - success_rate < 95%
  - p95_latency > 2000ms
  - open_breakers >= 2

DEGRADED if:
  - open_breakers >= 1 (and not INCIDENT)

OK otherwise
```

## Incident Types

| Type | Severity | Trigger |
|------|----------|---------|
| `CIRCUIT_BREAKER_OPEN` | WARNING/CRITICAL | Breaker state = OPEN |
| `HIGH_ERROR_RATE` | WARNING/CRITICAL | success < 95%/90% |
| `RATE_LIMIT_EXHAUSTED` | WARNING | Throttle count > threshold |
| `DEGRADED_SERVICE` | WARNING | Fallback rate > 10% |
| `SLO_BREACH` | WARNING/CRITICAL | p95 > 2000ms/3000ms |

## Files

```
diagnostics/
├── diagnostics.types.ts          # Type definitions
├── diagnostics.module.ts         # NestJS module
├── diagnostics.controller.ts     # HTTP endpoints
├── diagnostics.service.ts        # Business logic
├── diagnostics-aggregator.service.ts  # Data aggregation
├── diagnostics-redaction.service.ts   # PII redaction
├── diagnostics-audit.service.ts       # Access logging
├── diagnostics-incident.service.ts    # Incident detection
├── guards/
│   ├── diagnostics-rbac.guard.ts      # RBAC enforcement
│   └── diagnostics-rate-limit.guard.ts # Rate limiting
├── __tests__/
│   ├── diagnostics.service.spec.ts    # Unit tests
│   ├── diagnostics-rbac.guard.spec.ts # Guard tests
│   ├── diagnostics-rate-limit.guard.spec.ts
│   ├── redaction.snapshot.spec.ts     # PII snapshot tests
│   ├── diagnostics.contract.spec.ts   # API contract tests
│   ├── diagnostics.golden.spec.ts     # Golden scenarios
│   ├── diagnostics.property.spec.ts   # Property-based tests
│   └── diagnostics.integration.spec.ts # Integration tests
├── index.ts                      # Module exports
└── README.md                     # This file
```

## Usage Examples

### Get Health Status

```bash
curl -X GET "http://localhost:3000/calc/diagnostics/health" \
  -H "Authorization: Bearer <token>"
```

### Get Metrics

```bash
curl -X GET "http://localhost:3000/calc/diagnostics/metrics?window=15m" \
  -H "Authorization: Bearer <token>"
```

### List Traces

```bash
curl -X GET "http://localhost:3000/calc/diagnostics/traces?since=2026-01-16T00:00:00Z" \
  -H "Authorization: Bearer <token>"
```

### Get Trace Detail

```bash
curl -X GET "http://localhost:3000/calc/diagnostics/traces/trace-001" \
  -H "Authorization: Bearer <token>"
```

### Get Recent Incidents

```bash
curl -X GET "http://localhost:3000/calc/diagnostics/incidents/recent" \
  -H "Authorization: Bearer <token>"
```

## Testing

```bash
# Run all diagnostics tests
pnpm test --filter=api -- --testPathPattern=diagnostics

# Run specific test suites
pnpm test --filter=api -- --testPathPattern=diagnostics.property
pnpm test --filter=api -- --testPathPattern=diagnostics.contract
pnpm test --filter=api -- --testPathPattern=diagnostics.golden
pnpm test --filter=api -- --testPathPattern=diagnostics.integration
```
