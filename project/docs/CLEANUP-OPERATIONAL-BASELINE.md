# Cleanup Operational Baseline

> **Purpose:** İlk 30 gün prod gözlemi için referans değerler
> **Status:** Initial baseline (to be updated after Week 2)
> **Parent:** `docs/CLEANUP-OBSERVABILITY.md`

---

## Quick Reference Card

| Metric | Normal | Warning | Alert |
|--------|--------|---------|-------|
| Success rate | >95% | 80-95% | <80% |
| Run duration P95 | <5 min | 5-7 min | >7 min |
| Lock contention | 0/day | 1-2/day | >3/day |
| Slow tenant ratio | <10% | 10-20% | >20% |
| Threshold breaches | 0/week | 1-2/week | >3/week |
| Backlog growth | <10%/week | 10-25%/week | >50%/week |

---

## Week 1: Observation Mode

### Goal
Veri topla, alarm tetikleme, baseline oluştur.

### Actions
- [ ] Dashboard'u aç, 24 saat izle
- [ ] İlk dry-run çalıştır, backlog estimate al
- [ ] Tenant duration histogram'ını incele
- [ ] En yavaş 5 tenant'ı loglardan bul

### Expected Observations
```
✓ İlk run'lar SUCCESS olmalı
✓ Lock contention = 0 (tek instance)
✓ Slow tenant oranı bilinmiyor (baseline yok)
✓ Failure threshold = 0 (temiz başlangıç)
```

### Red Flags (Immediate Action)
```
⚠ İlk run FAILED → Config hatası, DB bağlantısı kontrol
⚠ Lock stuck >10 min → TTL hesaplaması yanlış
⚠ >50% tenant slow → perTenantBudgetMs çok düşük
```

---

## Week 2: Baseline Establishment

### Goal
Normal değerleri belirle, threshold'ları ayarla.

### Actions
- [ ] 7 günlük ortalama hesapla (her metrik için)
- [ ] P95 değerlerini kaydet
- [ ] Slow tenant listesini çıkar (recurring olanlar)
- [ ] İlk threshold tuning yap

### Baseline Template
```yaml
# Week 2 sonunda doldur
baseline_date: 2026-0X-XX
observation_period_days: 7

metrics:
  run_success_rate_avg: ___%
  run_duration_p95_ms: ___
  slow_tenant_ratio_avg: ___%
  failure_count_total: ___
  threshold_breach_count: ___
  backlog_estimate: ___
  
recurring_slow_tenants:
  - tenant_id: ___
    avg_duration_ms: ___
    
recurring_failures:
  - tenant_id: ___
    failure_count: ___
    error_pattern: ___
```

### Threshold Adjustments
| Parameter | Initial | Week 2 Adjustment |
|-----------|---------|-------------------|
| `failureThreshold` | 3 | Keep if <2 breaches/week |
| `perTenantBudgetMs` | 750 | Increase if >20% slow |
| `slowRatioAlert` | 20% | Tighten if <5% normally |

---

## Week 3-4: Stabilization

### Goal
Alert'leri aktifleştir, playbook'ları test et.

### Actions
- [ ] Alert rule'ları enable et
- [ ] Bir playbook'u simüle et (dry-run failure inject)
- [ ] On-call handoff dokümanı hazırla
- [ ] Backlog trend'i kontrol et

### Success Criteria
```
✓ 7 gün boyunca 0 unexpected alert
✓ Backlog stable veya azalıyor
✓ Slow tenant oranı baseline'da
✓ Success reset metriği çalışıyor (flaky tenant recovery)
```

---

## What's Normal vs What's Not

### Normal Patterns

| Pattern | Why It's OK |
|---------|-------------|
| Occasional slow tenant | Large data volume, expected |
| 1-2 failures/week | Transient network issues |
| Backlog fluctuation ±10% | Snapshot creation varies |
| Success reset after failure | Self-healing working |

### Abnormal Patterns (Investigate)

| Pattern | Possible Cause | Action |
|---------|----------------|--------|
| Same tenant fails 3x | Data corruption, schema issue | Manual inspection |
| Slow ratio increasing | DB degradation, index missing | Query plan analysis |
| Backlog growing >25%/week | Cleanup not keeping up | Increase frequency |
| No success resets | Persistent failures | Check error codes |
| Lock contention daily | Overlapping schedules | Adjust cron timing |

---

## Tenant Health Tiers

### Tier 1: Healthy (Target: >90%)
- Cleanup completes <500ms
- No failures in 30 days
- No special handling needed

### Tier 2: Slow (Target: <8%)
- Cleanup takes 500ms-2s
- Monitor but don't alert
- Consider data archival

### Tier 3: Problematic (Target: <2%)
- Cleanup takes >2s OR recurring failures
- Add to watch list
- May need manual intervention

### Tier Distribution Check
```promql
# Week 2'de çalıştır
# Tier 1
count(snapshot_cleanup_tenant_duration_ms_bucket{le="500"}) / count(snapshot_cleanup_tenant_duration_ms_count)

# Tier 2
count(snapshot_cleanup_tenant_duration_ms_bucket{le="2000"}) / count(snapshot_cleanup_tenant_duration_ms_count) - tier1

# Tier 3
1 - tier1 - tier2
```

---

## Escalation Thresholds

### P3 (Next Business Day)
- Slow ratio >20% for >4 hours
- Lock contention >2/day
- Single tenant at threshold

### P2 (Same Day)
- Success rate <90% for >1 hour
- Backlog growth >50%/week
- Multiple tenants at threshold

### P1 (Immediate)
- Success rate <50%
- Lock stuck >30 min after manual intervention
- Data integrity concern (protected snapshot deleted)

---

## 30-Day Review Checklist

### Metrics Review
- [ ] Success rate trend (should be stable >95%)
- [ ] Duration trend (should be stable or improving)
- [ ] Backlog trend (should be stable or decreasing)
- [ ] Failure pattern analysis (recurring vs transient)

### Configuration Review
- [ ] `failureThreshold` appropriate?
- [ ] `perTenantBudgetMs` appropriate?
- [ ] `maxTenantsPerRun` sufficient?
- [ ] Lock TTL calculation correct?

### Documentation Review
- [ ] Baseline values recorded?
- [ ] Recurring issues documented?
- [ ] Playbooks tested?
- [ ] On-call trained?

### Sign-off
| Role | Name | Date |
|------|------|------|
| Platform Lead | | |
| SRE Lead | | |
| On-call Primary | | |

---

## Appendix: First Run Checklist

Before enabling cleanup in production:

```
Pre-flight:
[ ] Database connection verified
[ ] Redis connection verified (for lock)
[ ] Metrics endpoint accessible
[ ] Dashboard panels loading
[ ] Alert rules in place (disabled)
[ ] Dry-run successful

First real run:
[ ] Start with maxTenantsPerRun=50 (not 500)
[ ] Monitor dashboard live
[ ] Check logs for errors
[ ] Verify deletion counts match expectations
[ ] Verify protected snapshots untouched

Scale up:
[ ] Increase to maxTenantsPerRun=100
[ ] Run for 24 hours
[ ] Increase to maxTenantsPerRun=500
[ ] Enable scheduled runs
[ ] Enable alerts
```

---

## Changelog

| Date | Change | Author |
|------|--------|--------|
| 2026-01-21 | Initial CLEANUP-OPERATIONAL-BASELINE.md created | Kiro |
