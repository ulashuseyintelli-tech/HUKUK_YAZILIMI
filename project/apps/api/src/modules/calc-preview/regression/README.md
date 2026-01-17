# Phase 5.2 - Golden Scenarios + Regression Gate

> **"Tek kaynak yemini"** - Her release'te otomatik doğrulama

## Amaç

Her release'te şu yemini otomatik okutmak:
- **Tek kaynak:** preview çıktısı + trace bundle deterministik ve beklenenle uyumlu
- **Sessiz sapma yok:** özellikle policy alanı, dependency davranışı, cache/breaker evidence

## Klasör Yapısı

```
regression/
├── scenarios/           # Golden scenario JSON dosyaları
│   ├── 001-basic-tcmb-avans.json
│   ├── 002-multi-segment-rate-change.json
│   └── ...
├── baselines/           # Beklenen çıktılar (snapshot)
│   ├── 001-basic-tcmb-avans.expected.json
│   ├── 001-basic-tcmb-avans.trace.expected.json
│   └── ...
├── allowlists/          # Tolerans ve bilinen farklar
│   ├── rounding-tolerance.json
│   ├── known-diffs.json
│   └── flaky-fields.json
├── runner/              # Test runner ve yardımcılar
│   ├── regression-runner.ts
│   ├── compare/
│   ├── normalizers/
│   └── reporters/
└── README.md
```

## Scenario Formatı

```json
{
  "id": "001",
  "name": "basic-tcmb-avans",
  "request": {
    "tenantId": "t_demo",
    "payload": { "...": "preview request body" }
  },
  "expect": {
    "status": "OK",
    "tolerances": {
      "moneyAbs": 0.01,
      "moneyRel": 0.000001
    },
    "must": {
      "policy.softCheck.outcome": ["PASS", "WARN"],
      "result.totals.totalPayable": "number"
    },
    "forbid": {
      "result.status": ["UNAVAILABLE"],
      "shadowCompare.severity": ["CRITICAL"]
    },
    "traceAssertions": {
      "noPII": true,
      "maxDurationMs": 1500,
      "breakerNeverOpen": ["interest_engine", "fee_engine"],
      "cacheNamespaceHitRateMin": {
        "rate_provider": 0.3
      }
    }
  }
}
```

## Kullanım

```bash
# Tüm senaryoları çalıştır
pnpm test:regression

# Tek senaryo çalıştır
pnpm test:regression --scenario=001

# Baseline güncelle (sadece release manager)
pnpm test:regression:update-baseline
```

## CI/CD Gate

- **PR'larda:** Tüm senaryolar çalışır, CRITICAL varsa fail
- **Main branch:** MAJOR için de fail
- **Nightly:** Full suite + chaos tests

## Severity Levels

| Severity | Açıklama | CI Davranışı |
|----------|----------|--------------|
| NOISE | Sub-cent rounding, ordering | Pass |
| MINOR | < 0.1% fark, non-critical missing | Warn |
| MAJOR | 0.1-1% fark, type mismatch | Fail on main |
| CRITICAL | > 1% fark, policy gate farkı | Always fail |
