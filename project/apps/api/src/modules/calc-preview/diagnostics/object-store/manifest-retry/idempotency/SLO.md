# Idempotency Gate SLO Specification

Phase 10.3 - PR-6.1

## Overview

Bu doküman, idempotency gate sistemi için Service Level Objectives (SLO) tanımlarını içerir.
SLO'lar, sistemin operasyonel sağlığını ölçmek ve error budget yönetimi için kullanılır.

## SLO Ownership

| Role | Responsibility |
|------|----------------|
| Owner | Platform Team |
| Escalation | On-call → Team Lead → Engineering Manager |
| Review Cadence | Weekly SLO review meeting |

## SLO Classification

| SLO | Type | Error Budget Bound |
|-----|------|-------------------|
| Gate Availability (%99.9) | Availability | ✅ Yes |
| Gate Latency p95/p99 | Performance | ❌ No |
| Success Rate %95/%99 | Quality | ❌ No |
| Takeover Rate ≤1% | Safety | ❌ No |
| Cache Hit Rate ≥10% | Efficiency | ❌ No |

## Action Type Allowlist

Cardinality control için izin verilen `action_type` değerleri:

| Action Type | Description |
|-------------|-------------|
| `ADMIN_RETRY` | Manual bundle retry |
| `DLQ_REDRIVE` | DLQ entry redrive |
| `DLQ_RESOLVE` | DLQ entry resolution |

**Kural**: Yeni action type eklenirse CI fail veya `unknown_action_type_detected` alert tetiklenir.

---

## SLO Definitions

### SLO-1: Gate Latency (Availability)

**Objective**: Idempotency gate işlemleri hızlı tamamlanmalı.

| Metric | Target | Window |
|--------|--------|--------|
| p50 latency | ≤ 10ms | 5m |
| p95 latency | ≤ 50ms | 5m |
| p99 latency | ≤ 100ms | 5m |

**PromQL**:
```promql
# p95 latency
histogram_quantile(0.95, 
  sum(rate(idempotency_gate_latency_seconds_bucket[5m])) by (le)
)
```

**Error Budget**: 
- Monthly budget: 43.2 minutes (99.9% availability)
- Burn rate alert: >14.4x (1h window) → critical

---

### SLO-2: Success Rate (Reliability)

**Objective**: Idempotency action'ları yüksek başarı oranıyla tamamlanmalı.

| Metric | Target | Window |
|--------|--------|--------|
| Success rate | ≥ 95% | 1h |
| Success rate | ≥ 99% | 24h |

**PromQL**:
```promql
# Success rate (1h)
sum(rate(idempotency_action_total{outcome="SUCCESS"}[1h])) 
/ 
sum(rate(idempotency_action_total[1h]))
```

**Exclusions**:
- `TAKEOVER` outcome: Counted as success (recovery mechanism)
- `FAILED` with `4xx` status: Client error, excluded from SLO

---

### SLO-3: Takeover Rate (Stability)

**Objective**: Takeover'lar nadir olmalı (lease timeout = exceptional case).

| Metric | Target | Window |
|--------|--------|--------|
| Takeover rate | ≤ 1% of PROCEED | 1h |
| Takeover rate | ≤ 0.1% of PROCEED | 24h |

**PromQL**:
```promql
# Takeover rate (1h)
sum(rate(idempotency_takeover_total[1h])) 
/ 
sum(rate(idempotency_gate_result_total{type="PROCEED"}[1h]))
```

**Rationale**:
- High takeover rate indicates:
  - Lease timeout too short
  - Handler execution too slow
  - Potential abuse

---

### SLO-4: Cache Hit Rate (Efficiency)

**Objective**: Duplicate request'ler cache'den serve edilmeli.

| Metric | Target | Window |
|--------|--------|--------|
| Cache hit rate | ≥ 10% (if duplicates exist) | 1h |

**PromQL**:
```promql
# Cache hit rate
sum(rate(idempotency_gate_result_total{type="CACHED"}[1h])) 
/ 
sum(rate(idempotency_gate_result_total[1h]))
```

**Note**: 
- Low cache hit rate is acceptable if there are no duplicate requests.
- This is an informational metric, no alert bound.
- Used for trend analysis and capacity planning.

---

## Error Budget Policy

### Budget Scope

**Error Budget = Gate Availability SLO (%99.9 monthly)**

Only availability-related failures consume error budget:
- Gate service unavailable
- Gate timeout (>100ms p99)
- Unhandled exceptions in gate

**NOT included in error budget**:
- Success Rate (quality metric, separate alerts)
- Takeover Rate (safety metric, separate alerts)
- Cache Hit Rate (efficiency metric, informational)

### Budget Calculation

```
Monthly Error Budget = (1 - SLO Target) × 30 days × 24 hours × 60 minutes

Example (99.9% availability):
= 0.001 × 30 × 24 × 60
= 43.2 minutes/month
```

### Burn Rate Thresholds

| Burn Rate | Window | Severity | Action |
|-----------|--------|----------|--------|
| 14.4x | 1h | Critical | Page on-call |
| 6x | 6h | Warning | Investigate |
| 3x | 24h | Info | Review in standup |

### Budget Exhaustion Actions

| Budget Remaining | Action |
|------------------|--------|
| > 50% | Normal operations |
| 25-50% | Freeze non-critical changes |
| 10-25% | Incident review required |
| < 10% | Feature freeze, focus on reliability |

---

## Alert Tuning Policy

| Period | Allowed Changes | Forbidden |
|--------|-----------------|-----------|
| Days 1-14 | Threshold increase (false-positive reduction) | New alerts, threshold decrease |
| Days 15+ | All changes with review | N/A |

---

## Alert Configuration

### Latency Alerts

```yaml
# SLO-1: Gate Latency
- alert: IdempotencyGateLatencyBudgetBurn
  expr: |
    (
      histogram_quantile(0.95, 
        sum(rate(idempotency_gate_latency_seconds_bucket[1h])) by (le)
      ) > 0.05
    ) and (
      histogram_quantile(0.95, 
        sum(rate(idempotency_gate_latency_seconds_bucket[5m])) by (le)
      ) > 0.05
    )
  for: 2m
  labels:
    severity: critical
    slo: gate_latency
  annotations:
    summary: "Gate latency SLO budget burning fast"
    description: "p95 latency >50ms for both 1h and 5m windows"
```

### Success Rate Alerts

```yaml
# SLO-2: Success Rate
- alert: IdempotencySuccessRateLow
  expr: |
    (
      sum(rate(idempotency_action_total{outcome="SUCCESS"}[1h])) 
      / 
      sum(rate(idempotency_action_total[1h]))
    ) < 0.95
  for: 5m
  labels:
    severity: warning
    slo: success_rate
  annotations:
    summary: "Idempotency success rate below 95%"
    description: "Success rate: {{ $value | humanizePercentage }}"

- alert: IdempotencySuccessRateCritical
  expr: |
    (
      sum(rate(idempotency_action_total{outcome="SUCCESS"}[1h])) 
      / 
      sum(rate(idempotency_action_total[1h]))
    ) < 0.90
  for: 5m
  labels:
    severity: critical
    slo: success_rate
  annotations:
    summary: "Idempotency success rate critically low"
    description: "Success rate: {{ $value | humanizePercentage }}"
```

### Takeover Rate Alerts

```yaml
# SLO-3: Takeover Rate
- alert: IdempotencyTakeoverRateHigh
  expr: |
    (
      sum(rate(idempotency_takeover_total[1h])) 
      / 
      sum(rate(idempotency_gate_result_total{type="PROCEED"}[1h]))
    ) > 0.01
  for: 10m
  labels:
    severity: warning
    slo: takeover_rate
  annotations:
    summary: "Takeover rate exceeds 1% of PROCEED"
    description: "Takeover rate: {{ $value | humanizePercentage }}"

- alert: IdempotencyTakeoverRateCritical
  expr: |
    (
      sum(rate(idempotency_takeover_total[1h])) 
      / 
      sum(rate(idempotency_gate_result_total{type="PROCEED"}[1h]))
    ) > 0.05
  for: 5m
  labels:
    severity: critical
    slo: takeover_rate
  annotations:
    summary: "Takeover rate critically high (>5%)"
    description: "Takeover rate: {{ $value | humanizePercentage }}"
```

---

## Dashboard Panels

### Key Metrics Panel

| Panel | Query | Visualization |
|-------|-------|---------------|
| Gate Latency p95 | `histogram_quantile(0.95, ...)` | Time series |
| Success Rate | `sum(rate(...{outcome="SUCCESS"})) / sum(rate(...))` | Gauge |
| Takeover Rate | `sum(rate(takeover)) / sum(rate(proceed))` | Gauge |
| Error Budget Remaining | `1 - (errors / budget)` | Gauge |

### Action Type Breakdown

| Panel | Query |
|-------|-------|
| Actions by Type | `sum by (action_type) (rate(idempotency_action_total[5m]))` |
| Outcomes by Type | `sum by (action_type, outcome) (rate(idempotency_action_total[5m]))` |
| Takeovers by Type | `sum by (action_type) (rate(idempotency_takeover_total[5m]))` |

---

## Operational Runbook

### High Latency

1. Check database connection pool
2. Check `manifest_admin_actions` table size
3. Check for lock contention
4. Consider index optimization

### Low Success Rate

1. Check error distribution by `errorCode`
2. Check downstream service health
3. Review recent deployments
4. Check for rate limiting issues

### High Takeover Rate

1. Check handler execution times
2. Consider increasing lease timeout
3. Check for stuck handlers
4. Review takeover rate limiter logs

---

---

## Implementation Status

### Alerts
- ✅ SLO alerts integrated into `manifest-retry-alerts.yaml`
- ✅ Alert group: `idempotency_slo`
- ✅ Multi-window burn rate alerts (1h, 6h)
- ✅ Error budget exhaustion alerts (25%, 10%)

### Dashboard
- ✅ Grafana dashboard: `idempotency-slo-dashboard.json`
- ✅ SLO overview gauges (Success Rate, Latency, Takeover Rate, Budget)
- ✅ Latency percentile time series
- ✅ Action breakdown by type and outcome
- ✅ Gate result distribution
- ✅ Error budget tracking panels

### Runbook
- ✅ High latency troubleshooting
- ✅ Low success rate investigation
- ✅ High takeover rate response

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-02-03 | System | Initial SLO specification |
| 1.1 | 2026-02-03 | System | PR-6: Alerts + Dashboard integration |
| 1.2 | 2026-02-03 | System | PR-6.1: SLO classification, ownership, action type allowlist, runbook, error budget scope clarification |

| 1.1 | 2026-02-03 | System | PR-6: Alerts + Dashboard integration |
