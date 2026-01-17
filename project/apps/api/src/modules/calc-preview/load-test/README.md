# Phase 5.5 - Load/Soak Test Suite

> "Ferrari'yi dyno'ya sokmadan otoyola çıkma"

## Amaç

Phase 5'in "mezar taşı" - sistemin sadece doğru değil, **uzun süre doğru kalabileceğini** kanıtlamak.

## Test Senaryoları

### 1. Soak Test (1 Saat)

**Ne test ediyor:**
- Sabit yük altında dayanıklılık
- Memory leak tespiti
- p95/p99 drift (latency artışı)
- Trace retention pressure
- Cache eviction davranışı

**Başarı kriterleri:**
- p95 < 200ms
- p99 < 500ms
- Success rate > 99%
- Memory growth < 20%
- Breaker flaps < 5/hour

```bash
# Çalıştırma
k6 run k6/soak-test.js

# CI'da
k6 run --out json=artifacts/soak-results.json k6/soak-test.js
```

### 2. Burst Test (10 Dakika)

**Ne test ediyor:**
- Rate limiting çalışıyor mu?
- Burst capacity yeterli mi?
- Recovery süresi kabul edilebilir mi?

**Başarı kriterleri:**
- p95 < 300ms (burst sırasında)
- Success rate > 95%
- Rate limited requests > 0 (beklenen)
- Rate limited rate < 20%

```bash
k6 run k6/burst-test.js
```

### 3. Chaos Soak Test (30 Dakika)

**Ne test ediyor:**
- Circuit breaker gerçekten çalışıyor mu?
- Fallback mekanizması doğru mu?
- Recovery otomatik mi?
- Evidence üretiliyor mu?

**Başarı kriterleri:**
- Success rate > 90% (chaos ile)
- Fallback rate < 15%
- Breaker activations > 0
- Recovery events > 0

```bash
# Chaos endpoints aktif olmalı
ENABLE_CHAOS_ENDPOINTS=true k6 run k6/chaos-soak-test.js
```

### 4. Stress Test (15 Dakika)

**Ne test ediyor:**
- Sistemin kırılma noktası
- Graceful degradation
- Recovery after overload

```bash
k6 run k6/stress-test.js
```

## SLO Thresholds

| Metric | Soak | Burst | Chaos | Stress |
|--------|------|-------|-------|--------|
| p95 latency | <200ms | <300ms | <500ms | <1000ms |
| p99 latency | <500ms | <1000ms | <2000ms | <3000ms |
| Success rate | >99% | >95% | >90% | >80% |
| Error rate | <1% | <5% | <10% | <20% |
| Fallback rate | <2% | <5% | <15% | <20% |
| Memory growth | <20% | <30% | <25% | <50% |
| Breaker flaps/hr | <5 | <10 | <20 | <30 |

## CI Integration

```yaml
# .github/workflows/load-test.yml
name: Load Tests

on:
  schedule:
    - cron: '0 2 * * *'  # Nightly at 2 AM
  workflow_dispatch:
    inputs:
      test_type:
        description: 'Test type'
        required: true
        default: 'soak'
        type: choice
        options:
          - soak
          - burst
          - chaos
          - stress

jobs:
  load-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup k6
        uses: grafana/setup-k6-action@v1
      
      - name: Start API
        run: |
          cd apps/api
          npm run start:test &
          sleep 30
      
      - name: Run Load Test
        run: |
          cd apps/api/src/modules/calc-preview/load-test/k6
          k6 run --out json=artifacts/${{ inputs.test_type }}-results.json ${{ inputs.test_type }}-test.js
      
      - name: Upload Results
        uses: actions/upload-artifact@v4
        with:
          name: load-test-results
          path: artifacts/
```

## Rapor Formatları

### Console Output
```
═══════════════════════════════════════════════════════════════
  SOAK TEST SUMMARY
═══════════════════════════════════════════════════════════════

  Total Requests: 36,000
  Request Rate:   10.0 req/s

  Latency:
    p50: 45ms
    p95: 120ms
    p99: 280ms

  Rates:
    Success:    99.2%
    Fallback:   0.8%
    Cache Hit:  65.3%
    Error:      0.8%

  Thresholds:
    ✅ http_req_duration: p(95)<200
    ✅ http_req_duration: p(99)<500
    ✅ success_rate: rate>0.99
    ✅ fallback_rate: rate<0.02

═══════════════════════════════════════════════════════════════
```

### JSON Output
```json
{
  "testName": "Soak Test (1 Hour)",
  "timestamp": "2026-01-16T10:00:00Z",
  "duration": 3600000,
  "status": "PASSED",
  "summary": {
    "totalRequests": 36000,
    "successRate": 0.992,
    "latency": { "p50": 45, "p95": 120, "p99": 280 },
    "memory": { "growthPercent": 8.5 }
  }
}
```

### HTML Dashboard
- Interactive charts (Chart.js)
- Latency over time
- RPS & success rate
- Memory usage trend

## Memory Leak Detection

Test sırasında memory snapshot'ları alınır:
- Her 1 dakikada bir heap snapshot
- Start vs End karşılaştırması
- Growth > 20% → WARNING
- Growth > 50% → FAIL

Potansiyel leak kaynakları:
- Trace ring buffer (max 1000)
- Metrics snapshots (max 10000)
- Rate limit buckets (auto-cleanup)
- Circuit breaker failure records

## Breaker Flapping Detection

Flapping = CLOSED → OPEN → HALF_OPEN → OPEN döngüsü

Tespit:
- 5 dakika içinde 4+ state change → FLAP event
- Flaps/hour > threshold → FAIL

Çözüm:
- halfOpenTrialLimit artır
- halfOpenFailureThreshold artır
- resetTimeoutMs artır

## Trace Retention Pressure

Test sırasında trace storage izlenir:
- Traces created vs deleted
- Storage used (MB)
- Pressure = used / max capacity

Pressure > 80% → WARNING
Pressure > 95% → FAIL (auto-cleanup çalışmıyor)

## Troubleshooting

### Test başarısız olursa

1. **p95 drift**: Cache eviction veya GC pressure
2. **Memory growth**: Trace/metrics cleanup kontrol et
3. **Breaker flapping**: Dependency health kontrol et
4. **High fallback rate**: Engine availability kontrol et

### Lokal çalıştırma

```bash
# API'yi test modunda başlat
cd apps/api
NODE_ENV=test npm run start

# Ayrı terminalde k6 çalıştır
cd src/modules/calc-preview/load-test/k6
k6 run soak-test.js
```

## Sonraki Adımlar

1. ✅ Load/Soak test altyapısı
2. ⏳ Contract tests (provider schema)
3. ⏳ Compile/lint sweep
4. ⏳ Phase 6 - Ürün genişletme
