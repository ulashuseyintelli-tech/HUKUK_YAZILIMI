# Idempotency Gate Runbook

Phase 10.3 - PR-6.1

## Quick Reference

| Alert | Severity | First Response |
|-------|----------|----------------|
| TakeoverSpike | warning/critical | Check handler latency |
| ErrorBudgetBurn | warning/critical | Check error distribution |
| GateLatency | warning | Check DB connection pool |
| SuccessRate | warning/critical | Check downstream services |

---

## 1. Takeover Spike

### Symptoms
- `IdempotencyTakeoverSpikeWarning` or `IdempotencyTakeoverSpikeCritical` firing
- High `idempotency_takeover_total` rate

### Diagnosis

```bash
# 1. Check takeover rate by action type
curl -s "prometheus:9090/api/v1/query?query=sum%20by%20(action_type)%20(rate(idempotency_takeover_total[5m]))"

# 2. Check handler execution times
curl -s "prometheus:9090/api/v1/query?query=histogram_quantile(0.95,sum(rate(manifest_retry_job_duration_seconds_bucket[5m]))%20by%20(le))"

# 3. Check for specific actor abuse
# Query audit logs for high takeover count per actor
```

### Resolution

1. **Handler too slow**: 
   - Increase lease timeout (default: 30s)
   - Optimize handler code
   - Check downstream service latency

2. **Lease timeout too short**:
   - Increase `leaseSeconds` in `@IdempotencyAction` decorator
   - Default: 30s, max: 300s

3. **Actor abuse**:
   - Check takeover rate limiter logs
   - Consider reducing per-actor limit (default: 5/5min)
   - Escalate to security if pattern persists

---

## 2. Error Budget Burn

### Symptoms
- `IdempotencyErrorBudgetBurnFast` (14.4x) or `IdempotencyErrorBudgetBurnMedium` (6x) firing
- `IdempotencyErrorBudgetLow` (<25%) or `IdempotencyErrorBudgetCritical` (<10%)

### Diagnosis

```bash
# 1. Check current error rate
curl -s "prometheus:9090/api/v1/query?query=1-(sum(rate(idempotency_action_total{outcome=\"SUCCESS\"}[1h]))/sum(rate(idempotency_action_total[1h])))"

# 2. Check error distribution by code
curl -s "prometheus:9090/api/v1/query?query=sum%20by%20(error_code)%20(rate(idempotency_action_total{outcome=\"FAILED\"}[1h]))"

# 3. Check recent deployments
git log --oneline -10
```

### Resolution

1. **High failure rate**:
   - Check error codes in audit logs
   - Identify failing action types
   - Check downstream service health

2. **Budget < 25%**:
   - Freeze non-critical changes
   - Schedule incident review

3. **Budget < 10%**:
   - Feature freeze
   - All hands on reliability
   - Daily SLO review until recovery

---

## 3. Gate Latency Regression

### Symptoms
- `IdempotencyGateLatencyHigh` (p95 >100ms) firing
- `IdempotencyGateLatencyBudgetBurn` firing

### Diagnosis

```bash
# 1. Check latency percentiles
curl -s "prometheus:9090/api/v1/query?query=histogram_quantile(0.95,sum(rate(idempotency_gate_latency_seconds_bucket[5m]))%20by%20(le))"

# 2. Check DB connection pool
curl -s "prometheus:9090/api/v1/query?query=pg_stat_activity_count"

# 3. Check table size
psql -c "SELECT pg_size_pretty(pg_total_relation_size('manifest_admin_actions'));"
```

### Resolution

1. **DB connection pool exhausted**:
   - Increase pool size
   - Check for connection leaks
   - Restart affected pods

2. **Table bloat**:
   - Run cleanup job manually
   - Check `expires_at` index usage
   - Consider VACUUM ANALYZE

3. **Lock contention**:
   - Check for long-running transactions
   - Review concurrent request patterns

---

## 4. Success Rate Low

### Symptoms
- `IdempotencySuccessRateLow` (<95%) or `IdempotencySuccessRateCritical` (<90%) firing

### Diagnosis

```bash
# 1. Check outcome distribution
curl -s "prometheus:9090/api/v1/query?query=sum%20by%20(outcome)%20(rate(idempotency_action_total[1h]))"

# 2. Check error codes
# Query audit logs: SELECT error_code, COUNT(*) FROM manifest_admin_audit_log WHERE outcome='FAILED' GROUP BY error_code

# 3. Check downstream services
curl -s "prometheus:9090/api/v1/query?query=up{job=\"object-store\"}"
```

### Resolution

1. **Downstream service failure**:
   - Check object store health
   - Check circuit breaker state
   - Failover if necessary

2. **Client errors (4xx)**:
   - Review recent API changes
   - Check client SDK versions
   - Update documentation if needed

3. **Rate limiting**:
   - Check rate limiter metrics
   - Adjust limits if legitimate traffic

---

## Escalation Path

| Level | Contact | When |
|-------|---------|------|
| L1 | On-call engineer | Alert fires |
| L2 | Team Lead | >30min unresolved |
| L3 | Engineering Manager | Budget <10% or critical |

---

## Revision History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-02-03 | Initial runbook |
