# Cleanup Observability Guide

> **Status:** Production Ready
> **Stack:** Prometheus + Grafana (syntax adaptable to Datadog/CloudWatch)
> **Parent:** `.kiro/specs/phase-11-cleanup-orchestration/PHASE-11-LOCK.md`

---

## Table of Contents

1. [Metric Contract](#metric-contract)
2. [Dashboard Panels](#dashboard-panels)
3. [Alert Rules](#alert-rules)
4. [Alert Playbook](#alert-playbook)
5. [Backlog Estimation](#backlog-estimation)
6. [Threshold Tuning](#threshold-tuning)

---

## Metric Contract

### Core Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `snapshot_cleanup_run_total` | Counter | `result` | Total cleanup runs by result |
| `snapshot_cleanup_run_duration_ms` | Histogram | `result` | Run duration distribution |
| `snapshot_cleanup_tenant_duration_ms` | Histogram | — | Per-tenant cleanup duration |
| `snapshot_cleanup_deleted_total` | Counter | — | Total snapshots deleted |
| `snapshot_cleanup_protected_total` | Counter | — | Total protected snapshots encountered |
| `snapshot_cleanup_failures_total` | Counter | — | Total tenant cleanup failures |
| `snapshot_cleanup_failure_threshold_reached_total` | Counter | — | Failure threshold breach events |
| `snapshot_cleanup_success_resets_total` | Counter | — | Failure counter resets (success after failure) |
| `snapshot_cleanup_slow_tenant_total` | Counter | — | Slow tenant detections |
| `snapshot_cleanup_backlog_estimate` | Gauge | — | Estimated deletable snapshots (weekly) |

### Label Values

**`result` label:**
- `SUCCESS` — All tenants processed successfully
- `PARTIAL_FAILURE` — Some tenants failed
- `FAILED` — All tenants failed
- `SKIPPED_LOCKED` — Run skipped due to lock contention
- `DRY_RUN` — Dry run completed

### Cardinality Rules

```
❌ FORBIDDEN: tenantId as metric label
   - Reason: 1000+ tenants = cardinality explosion
   - Reason: tenantId may be PII-adjacent

✅ ALLOWED: tenantId in structured logs
   - Use: Debugging specific tenant issues
   - Format: JSON structured log with tenantId field
```

---

## Dashboard Panels

### Panel Group 1: Health Overview

#### 1.1 Run Success Rate (Stat)
```promql
sum(rate(snapshot_cleanup_run_total{result="SUCCESS"}[1h])) 
/ 
sum(rate(snapshot_cleanup_run_total[1h])) * 100
```
**Thresholds:** Green > 95%, Yellow > 80%, Red ≤ 80%

#### 1.2 Runs by Result (Time Series)
```promql
sum by (result) (rate(snapshot_cleanup_run_total[5m]))
```

#### 1.3 Run Duration P95 (Stat)
```promql
histogram_quantile(0.95, 
  sum(rate(snapshot_cleanup_run_duration_ms_bucket[1h])) by (le)
)
```
**Thresholds:** Green < 300000ms, Yellow < 450000ms, Red ≥ 450000ms

#### 1.4 Lock Contention Rate (Stat)
```promql
sum(rate(snapshot_cleanup_run_total{result="SKIPPED_LOCKED"}[1h]))
```
**Thresholds:** Green = 0, Yellow ≤ 2/hr, Red > 2/hr

---

### Panel Group 2: Tenant Performance

#### 2.1 Tenant Duration Distribution (Heatmap)
```promql
sum(rate(snapshot_cleanup_tenant_duration_ms_bucket[5m])) by (le)
```

#### 2.2 Slow Tenant Rate (Time Series)
```promql
rate(snapshot_cleanup_slow_tenant_total[5m])
```

#### 2.3 Tenant Failure Rate (Time Series)
```promql
rate(snapshot_cleanup_failures_total[5m])
```

#### 2.4 Success Reset Rate (Time Series)
```promql
rate(snapshot_cleanup_success_resets_total[5m])
```
**Note:** High reset rate = flaky tenants recovering. Low rate during failures = persistent issues.

---

### Panel Group 3: Failure Policy

#### 3.1 Threshold Breaches (Stat)
```promql
sum(increase(snapshot_cleanup_failure_threshold_reached_total[24h]))
```
**Thresholds:** Green = 0, Yellow ≤ 2, Red > 2

#### 3.2 Failure vs Success Resets (Time Series)
```promql
# Failures
rate(snapshot_cleanup_failures_total[5m])

# Resets (success after failure)
rate(snapshot_cleanup_success_resets_total[5m])
```
**Interpretation:** Resets should track failures with delay. No resets = stuck tenants.

#### 3.3 Consecutive Failure Heatmap (Table)
```promql
# Requires log-based metric or custom query
# Shows tenants approaching threshold
```

---

### Panel Group 4: Impact & Backlog

#### 4.1 Deletion Rate (Time Series)
```promql
rate(snapshot_cleanup_deleted_total[5m])
```

#### 4.2 Protected Snapshot Rate (Time Series)
```promql
rate(snapshot_cleanup_protected_total[5m])
```

#### 4.3 Backlog Estimate (Gauge)
```promql
snapshot_cleanup_backlog_estimate
```
**Note:** Updated weekly via scheduled dry-run job.

#### 4.4 Backlog Trend (Time Series)
```promql
snapshot_cleanup_backlog_estimate
```
**Range:** 4 weeks for trend analysis

---

## Alert Rules

### Alert 1: CleanupLockSpike
```yaml
alert: CleanupLockSpike
expr: sum(rate(snapshot_cleanup_run_total{result="SKIPPED_LOCKED"}[1h])) > 3
for: 5m
labels:
  severity: P3
  team: platform
annotations:
  summary: "Cleanup lock contention detected"
  description: "More than 3 SKIPPED_LOCKED events in the last hour. Check for stuck locks or overlapping schedules."
  runbook: "#playbook-lock-spike"
```

### Alert 2: CleanupThresholdReached
```yaml
alert: CleanupThresholdReached
expr: increase(snapshot_cleanup_failure_threshold_reached_total[1h]) > 0
for: 0m
labels:
  severity: P2
  team: platform
annotations:
  summary: "Cleanup failure threshold reached for tenant(s)"
  description: "One or more tenants have hit consecutive failure threshold. Check logs for tenantId and error details."
  runbook: "#playbook-threshold-reached"
```

### Alert 3: CleanupSlowRatio
```yaml
alert: CleanupSlowRatio
expr: |
  sum(rate(snapshot_cleanup_slow_tenant_total[1h])) 
  / 
  sum(rate(snapshot_cleanup_run_total{result=~"SUCCESS|PARTIAL_FAILURE"}[1h])) 
  > 0.2
for: 15m
labels:
  severity: P3
  team: platform
annotations:
  summary: "High ratio of slow tenant cleanups"
  description: "More than 20% of tenants are exceeding perTenantBudgetMs. Consider increasing budget or investigating slow tenants."
  runbook: "#playbook-slow-ratio"
```

### Alert 4: CleanupBacklogGrowth
```yaml
alert: CleanupBacklogGrowth
expr: |
  (snapshot_cleanup_backlog_estimate - snapshot_cleanup_backlog_estimate offset 7d) 
  / 
  snapshot_cleanup_backlog_estimate offset 7d 
  > 0.5
for: 1h
labels:
  severity: P2
  team: platform
annotations:
  summary: "Cleanup backlog growing rapidly"
  description: "Deletable snapshot backlog increased >50% week-over-week. Cleanup may not be keeping up with snapshot creation."
  runbook: "#playbook-backlog-growth"
```

### Alert 5: CleanupProtectedAnomaly
```yaml
alert: CleanupProtectedAnomaly
expr: |
  snapshot_cleanup_protected_total 
  > 
  avg_over_time(snapshot_cleanup_protected_total[7d]) + 3 * stddev_over_time(snapshot_cleanup_protected_total[7d])
for: 30m
labels:
  severity: P3
  team: platform
annotations:
  summary: "Unusual spike in protected snapshots"
  description: "Protected snapshot count is >3σ above 7-day average. May indicate mass legal hold application or bug."
  runbook: "#playbook-protected-anomaly"
```

---

## Alert Playbook

### Playbook: Lock Spike {#playbook-lock-spike}

**Trigger:** `CleanupLockSpike` — SKIPPED_LOCKED > 3/hour

**Diagnosis Steps:**
1. Check if multiple cleanup triggers are scheduled too close together
2. Verify lock TTL is sufficient: `lockTtlMs = maxTenantsPerRun * perTenantBudgetMs + safetyMarginMs`
3. Check for stuck lock in Redis: `GET snapshot:cleanup:orchestrator:global`

**Resolution:**
- If overlapping schedules: Adjust cron timing
- If stuck lock: Wait for TTL expiry OR `DEL snapshot:cleanup:orchestrator:global`
- If TTL too short: Increase `safetyMarginMs` or reduce `maxTenantsPerRun`

**Escalation:** If lock stuck >30min and manual delete fails → P2 escalation

---

### Playbook: Threshold Reached {#playbook-threshold-reached}

**Trigger:** `CleanupThresholdReached` — failure_threshold_reached > 0

**Diagnosis Steps:**
1. Find affected tenant(s) in logs: `grep "Failure threshold reached" | jq '.tenantId'`
2. Check `cleanup_failure_state` table for error codes
3. Identify error pattern: TRANSIENT_ERROR vs DATABASE_ERROR vs UNKNOWN

**Resolution:**
- TRANSIENT_ERROR: Usually self-healing, monitor for reset
- DATABASE_ERROR: Check DB health, connection pool, query performance
- UNKNOWN: Deep dive into tenant data, may need manual intervention

**Escalation:** If same tenant hits threshold 3x in 24h → P1 escalation

---

### Playbook: Slow Ratio {#playbook-slow-ratio}

**Trigger:** `CleanupSlowRatio` — slow_tenant / processed > 20%

**Diagnosis Steps:**
1. Check tenant duration histogram for outliers
2. Identify slow tenants from logs: `grep "Slow tenant detected" | jq '.tenantId, .durationMs'`
3. Analyze slow tenant characteristics: snapshot count, data size

**Resolution:**
- If few outliers: Consider tenant-specific investigation
- If widespread: Increase `perTenantBudgetMs` (affects lock TTL)
- If DB bottleneck: Check query plans, indexes, connection pool

**Escalation:** If slow ratio >50% for >1h → P2 escalation

---

### Playbook: Backlog Growth {#playbook-backlog-growth}

**Trigger:** `CleanupBacklogGrowth` — backlog week-over-week > 50%

**Diagnosis Steps:**
1. Compare deletion rate vs snapshot creation rate
2. Check if cleanup is running (no SKIPPED_LOCKED)
3. Verify retention policy hasn't changed

**Resolution:**
- If cleanup not running: Fix trigger mechanism
- If creation outpacing deletion: Increase `maxTenantsPerRun` or run frequency
- If retention changed: Expected behavior, adjust alert threshold

**Escalation:** If backlog >2x baseline for >2 weeks → P2 escalation

---

### Playbook: Protected Anomaly {#playbook-protected-anomaly}

**Trigger:** `CleanupProtectedAnomaly` — protected_total spike > 3σ

**Diagnosis Steps:**
1. Check for recent mass legal hold operations
2. Verify no bug in protection logic (LEGAL_HOLD, PROMOTED, baseline)
3. Review recent deployments affecting snapshot status

**Resolution:**
- If intentional legal hold: Document and adjust baseline
- If bug: Rollback deployment, investigate root cause
- If false positive: Tune alert threshold

**Escalation:** If unexplained spike >10x normal → P2 escalation

---

## Backlog Estimation

### Approved Strategy: Weekly Scheduled Dry-Run

```typescript
// Scheduled job (e.g., Sunday 03:00 UTC)
const result = await orchestrator.runOnce({ 
  dryRun: true,
  emitPerTenantMetrics: false 
});

// Emit backlog gauge
metrics.setBacklogEstimate(result.totalDeleted);
```

**Why dry-run over direct DB query:**
- Uses `buildDeletableWhere()` — same criteria as real cleanup
- No kriter drift risk when deletion rules change
- Validates full pipeline (tenant discovery → filtering → counting)

**Frequency:** Weekly (Sunday 03:00 UTC recommended)
- Low overhead (read-only)
- Sufficient for trend analysis
- Avoids lock contention with regular runs

### Rejected Alternative: Direct DB COUNT

```sql
-- ❌ NOT RECOMMENDED
SELECT COUNT(*) FROM simulation_snapshot 
WHERE expires_at < NOW() 
  AND status = 'STANDARD'
  AND is_baseline = false;
```

**Why rejected:**
- Criteria can drift from `buildDeletableWhere()`
- Doesn't account for tenant filtering logic
- May miss edge cases (e.g., promoted snapshots)

---

## Threshold Tuning

### Initial Values (Conservative)

| Parameter | Initial | Rationale |
|-----------|---------|-----------|
| `failureThreshold` | 3 | Allow transient failures before alert |
| `perTenantBudgetMs` | 750ms | P95 tenant cleanup time + buffer |
| `slowRatioAlert` | 20% | Significant but not panic-worthy |
| `backlogGrowthAlert` | 50% | Week-over-week growth threshold |

### Tuning Process

1. **Week 1-2:** Collect baseline metrics, no alerts
2. **Week 3:** Enable alerts with conservative thresholds
3. **Week 4+:** Tighten thresholds based on observed patterns

### Tightening Guidelines

| Metric | When to Tighten | Target |
|--------|-----------------|--------|
| `failureThreshold` | <1 threshold breach/week | 2 |
| `slowRatioAlert` | <5% slow tenants normally | 10% |
| `backlogGrowthAlert` | Stable backlog trend | 25% |

### Loosening Guidelines

| Metric | When to Loosen | Max |
|--------|----------------|-----|
| `failureThreshold` | >5 breaches/day (noisy) | 5 |
| `perTenantBudgetMs` | >30% slow tenants | 1500ms |
| `slowRatioAlert` | Alert fatigue | 30% |

---

## Grafana Dashboard JSON

> Export available at: `dashboards/cleanup-observability.json` (to be created)

### Quick Import

1. Create new dashboard in Grafana
2. Add panels using PromQL queries above
3. Set refresh interval: 30s
4. Set time range: Last 6 hours (default)

### Recommended Layout

```
┌─────────────────────────────────────────────────────────────┐
│ Row 1: Health Overview (4 stat panels)                      │
├─────────────────────────────────────────────────────────────┤
│ Row 2: Tenant Performance (4 time series)                   │
├─────────────────────────────────────────────────────────────┤
│ Row 3: Failure Policy (3 panels)                            │
├─────────────────────────────────────────────────────────────┤
│ Row 4: Impact & Backlog (4 panels)                          │
└─────────────────────────────────────────────────────────────┘
```

---

## Changelog

| Date | Change | Author |
|------|--------|--------|
| 2026-01-21 | Initial CLEANUP-OBSERVABILITY.md created | Kiro |
