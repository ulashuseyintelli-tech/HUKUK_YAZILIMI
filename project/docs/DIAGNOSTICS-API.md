# Diagnostics API Reference

Self-serve diagnostics API for tenant admins.

## Base URL

```
/calc/diagnostics
```

## Authentication

All endpoints require authentication via Bearer token. The token must include tenant context.

```
Authorization: Bearer <token>
```

## RBAC Matrix

| Role | Own Tenant | Other Tenant | Query Param |
|------|------------|--------------|-------------|
| `tenant-admin` | ✅ | ❌ 403 | Ignored |
| `internal-ops` | ✅ | ✅ | `?tenantId=X` |
| `system` | ✅ | ✅ | `?tenantId=X` |

## Rate Limits

| Endpoint | Burst (1s) | Minute |
|----------|------------|--------|
| All endpoints | 10 req | 60 req |
| `/traces/:traceId` | 10 req | 30 req |

429 response includes `Retry-After` header.

---

## Endpoints

### GET /health

Returns current system health status.

#### Response

```json
{
  "status": "OK | DEGRADED | INCIDENT",
  "timestamp": "2026-01-17T10:00:00Z",
  "tenantId": "tenant-001",
  "cache": {
    "hitRate": 85,
    "missRate": 15,
    "staleRate": 5
  },
  "circuitBreakers": {
    "policy_engine": { "state": "CLOSED" },
    "rate_provider": { "state": "CLOSED" }
  },
  "rateLimit": {
    "remaining": 50,
    "capacity": 60,
    "blocked": false
  },
  "policyEngine": {
    "available": true,
    "lastCheck": "2026-01-17T10:00:00Z"
  },
  "incidentCriteria": {
    "successRateBelow95": false,
    "p95Above2000ms": false,
    "openBreakerCount": 0,
    "criticalTraceCount": 0
  }
}
```

#### Status Derivation

| Status | Condition |
|--------|-----------|
| `INCIDENT` | success < 95% OR p95 > 2000ms OR breakers >= 2 |
| `DEGRADED` | breakers >= 1 |
| `OK` | All healthy |

---

### GET /metrics

Returns performance metrics for specified time window.

#### Query Parameters

| Param | Type | Required | Values |
|-------|------|----------|--------|
| `window` | string | Yes | `5m`, `15m`, `30m`, `1h`, `6h`, `24h` |

#### Response

```json
{
  "window": "15m",
  "tenantId": "tenant-001",
  "timestamp": "2026-01-17T10:00:00Z",
  "latency": {
    "p50": 150,
    "p95": 450,
    "p99": 800
  },
  "rates": {
    "success": 98,
    "fallback": 2,
    "stale": 5,
    "error": 2
  },
  "counts": {
    "total": 1000,
    "success": 980,
    "fallback": 20,
    "error": 20
  }
}
```

#### Errors

| Code | Condition |
|------|-----------|
| 400 | Invalid window value |

---

### GET /traces

Returns paginated list of traces.

#### Query Parameters

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `since` | ISO8601 | Yes | Start time |
| `until` | ISO8601 | No | End time (default: now) |
| `severity` | string | No | Filter by severity |
| `status` | string | No | Filter by status |
| `limit` | number | No | Page size (max 100) |
| `cursor` | string | No | Pagination cursor |

#### Response

```json
{
  "traces": [
    {
      "traceId": "trace-001",
      "timestamp": "2026-01-17T10:00:00Z",
      "status": "OK",
      "durationMs": 250,
      "hasWarnings": false,
      "hasFallback": false
    }
  ],
  "pagination": {
    "total": 100,
    "limit": 20,
    "cursor": "abc123",
    "nextCursor": "def456",
    "hasMore": true
  },
  "query": {
    "since": "2026-01-16T10:00:00Z",
    "until": "2026-01-17T10:00:00Z"
  }
}
```

#### Constraints

- Maximum time range: 24 hours
- Maximum page size: 100

---

### GET /traces/:traceId

Returns detailed trace information (redacted).

#### Path Parameters

| Param | Type | Description |
|-------|------|-------------|
| `traceId` | string | Trace identifier |

#### Response

```json
{
  "trace": {
    "meta": {
      "traceId": "trace-001",
      "timestamp": "2026-01-17T10:00:00Z"
    },
    "result": {
      "status": "OK",
      "durationMs": 250
    }
  },
  "truncated": false
}
```

#### Truncation

If trace exceeds 10MB:

```json
{
  "trace": { "_truncated": true },
  "truncated": true,
  "truncationReason": "Trace size exceeds 10MB limit",
  "originalSizeBytes": 15000000
}
```

#### Errors

| Code | Condition |
|------|-----------|
| 403 | Trace belongs to another tenant |
| 404 | Trace not found |

---

### GET /incidents/recent

Returns recent incidents (last 24 hours).

#### Response

```json
{
  "incidents": [
    {
      "id": "incident-001",
      "type": "CIRCUIT_BREAKER_OPEN",
      "severity": "WARNING",
      "status": "ONGOING",
      "title": "Devre Kesici Açık",
      "description": "policy_engine bağımlılığı için devre kesici açık durumda.",
      "recommendation": "Bağımlılık servisinin durumunu kontrol edin.",
      "startedAt": "2026-01-17T09:55:00Z",
      "evidence": {
        "source": "circuit_breaker",
        "breakerName": "policy_engine",
        "value": "OPEN",
        "threshold": "CLOSED",
        "timestamp": "2026-01-17T09:55:00Z"
      },
      "tenantId": "tenant-001",
      "affectedDependencies": ["policy_engine"]
    }
  ],
  "summary": {
    "total": 1,
    "ongoing": 1,
    "resolved": 0,
    "bySeverity": { "WARNING": 1, "CRITICAL": 0 },
    "byType": {
      "CIRCUIT_BREAKER_OPEN": 1,
      "HIGH_ERROR_RATE": 0,
      "RATE_LIMIT_EXHAUSTED": 0,
      "DEGRADED_SERVICE": 0,
      "SLO_BREACH": 0
    }
  },
  "period": {
    "since": "2026-01-16T10:00:00Z",
    "until": "2026-01-17T10:00:00Z"
  },
  "tenantId": "tenant-001",
  "timestamp": "2026-01-17T10:00:00Z"
}
```

#### Incident Types

| Type | Description | Severity |
|------|-------------|----------|
| `CIRCUIT_BREAKER_OPEN` | Dependency circuit breaker opened | WARNING (1 breaker), CRITICAL (2+) |
| `HIGH_ERROR_RATE` | Success rate below threshold | WARNING (<95%), CRITICAL (<90%) |
| `RATE_LIMIT_EXHAUSTED` | Rate limit bucket depleted | WARNING |
| `DEGRADED_SERVICE` | Fallback responses active | WARNING |
| `SLO_BREACH` | Latency SLO violated | WARNING (>2000ms), CRITICAL (>3000ms) |

---

## Error Responses

All errors follow this format:

```json
{
  "statusCode": 400,
  "error": "Bad Request",
  "message": "Invalid window value: 10m",
  "details": {
    "field": "window",
    "validValues": ["5m", "15m", "30m", "1h", "6h", "24h"]
  }
}
```

### Common Error Codes

| Code | Description |
|------|-------------|
| 400 | Invalid request parameters |
| 401 | Authentication required |
| 403 | Access denied (cross-tenant) |
| 404 | Resource not found |
| 429 | Rate limit exceeded |
| 500 | Internal server error |

---

## PII Redaction

All trace data is automatically redacted before response:

| PII Type | Pattern | Redacted Format |
|----------|---------|-----------------|
| TCKN | 11 digits | `***********` |
| Phone | +90XXXXXXXXXX | `+90*******XX` |
| Email | user@domain.com | `u***@***.com` |
| Debtor Name | Full name | `A***` |
| Address | Any address | `[ADRES GİZLİ]` |

---

## Audit Logging

All trace access is logged:

```json
{
  "timestamp": "2026-01-17T10:00:00Z",
  "tenantId": "tenant-001",
  "actor": "user-123",
  "action": "DETAIL",
  "traceId": "trace-001",
  "allowed": true,
  "sizeBytes": 15000
}
```

Actions: `LIST`, `DETAIL`, `DOWNLOAD`
