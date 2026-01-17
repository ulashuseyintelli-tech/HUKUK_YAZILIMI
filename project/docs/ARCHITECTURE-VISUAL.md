# Calc-Preview Mimari Görselleştirmesi

> **Tarih:** 2026-01-16  
> **Durum:** Phase 5 Tamamlandı — Mimari Mühürlendi

---

## ⚠️ Liderlik Notu

> **"Bu diyagram günceldir. Güncel değilse, sistem de değildir."**

Bu görsel:
- Yeni feature'a başlamadan önce açılacak
- "Bu nereye oturuyor?" sorusunu sessizce cevaplayacak
- Yanlış fikirleri tartışmadan eleyen bir filtre olacak

Mimari tamamlanmadı; **mühürlendi**.

---

## 1. Üst Düzey Mimari

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                                   FRONTEND                                       │
│  ┌─────────────────────────────────────────────────────────────────────────┐    │
│  │  usePreviewCoordinator()                                                 │    │
│  │  ├── Unified endpoint çağrısı                                           │    │
│  │  ├── Fallback mekanizması (kill switch + rollout)                       │    │
│  │  └── Telemetry (success/fallback tracking)                              │    │
│  └─────────────────────────────────────────────────────────────────────────┘    │
│                                      │                                           │
│                                      ▼                                           │
│  ┌─────────────────────────────────────────────────────────────────────────┐    │
│  │  PreviewStatusBanner                                                     │    │
│  │  ├── FULL (yeşil) │ PARTIAL (amber) │ UNAVAILABLE (kırmızı)             │    │
│  │  └── UX Guidance (backend-driven)                                        │    │
│  └─────────────────────────────────────────────────────────────────────────┘    │
│                                                                                  │
│  ❌ YASAK ZONE: Math.round, hesaplaFaiz(), TCMB_ORANLARI                        │
└─────────────────────────────────────────────────────────────────────────────────┘
                                       │
                                       │ POST /calc/preview/light
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              API GATEWAY                                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                           │
│  │ Rate Limit   │  │ Auth/RBAC    │  │ Request Hash │                           │
│  │ Guard        │  │ Guard        │  │ Generator    │                           │
│  └──────────────┘  └──────────────┘  └──────────────┘                           │
└─────────────────────────────────────────────────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           CALC-PREVIEW MODULE                                    │
│                                                                                  │
│  ┌─────────────────────────────────────────────────────────────────────────┐    │
│  │                      CalcPreviewController                               │    │
│  │  POST /calc/preview/light ─────────────────────────────────────────────▶│    │
│  │  GET  /calc/metrics ───────────────────────────────────────────────────▶│    │
│  │  GET  /calc/circuit-breaker/status ────────────────────────────────────▶│    │
│  │  GET  /calc/trace/:traceId ────────────────────────────────────────────▶│    │
│  └─────────────────────────────────────────────────────────────────────────┘    │
│                                      │                                           │
│                                      ▼                                           │
│  ┌─────────────────────────────────────────────────────────────────────────┐    │
│  │                      CalcPreviewService                                  │    │
│  │  ┌───────────────────────────────────────────────────────────────────┐  │    │
│  │  │                     ORCHESTRATION ONLY                             │  │    │
│  │  │  • Request validation                                              │  │    │
│  │  │  • Engine çağrıları (paralel)                                      │  │    │
│  │  │  • Response birleştirme                                            │  │    │
│  │  │  • Status belirleme (FULL/PARTIAL/UNAVAILABLE)                     │  │    │
│  │  │  • UX Guidance üretimi                                             │  │    │
│  │  │  • Cache yönetimi (version-pinned)                                 │  │    │
│  │  │                                                                     │  │    │
│  │  │  ❌ KENDİ HESAPLAMA YAPMAZ                                         │  │    │
│  │  └───────────────────────────────────────────────────────────────────┘  │    │
│  └─────────────────────────────────────────────────────────────────────────┘    │
│                                      │                                           │
│         ┌────────────────────────────┼────────────────────────────┐              │
│         │                            │                            │              │
│         ▼                            ▼                            ▼              │
│  ┌─────────────┐            ┌─────────────┐            ┌─────────────┐          │
│  │  Interest   │            │    Fee      │            │   Policy    │          │
│  │  Engine     │            │   Engine    │            │   Engine    │          │
│  │  .preview() │            │  .preview() │            │ .softCheck()│          │
│  └─────────────┘            └─────────────┘            └─────────────┘          │
│         │                            │                            │              │
│         └────────────────────────────┼────────────────────────────┘              │
│                                      │                                           │
└──────────────────────────────────────┼──────────────────────────────────────────┘
                                       │
                    ┌──────────────────┼──────────────────┐
                    │                  │                  │
                    ▼                  ▼                  ▼
             ┌───────────┐      ┌───────────┐      ┌───────────┐
             │   Rate    │      │  Tariff   │      │  Policy   │
             │ Provider  │      │ Provider  │      │  Rules    │
             │  (TCMB)   │      │ (Tarife)  │      │  (Gates)  │
             └───────────┘      └───────────┘      └───────────┘
```

---

## 2. Dayanıklılık Katmanları

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                          RESILIENCE LAYERS                                       │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  Layer 1: RATE LIMITING                                                          │
│  ┌─────────────────────────────────────────────────────────────────────────┐    │
│  │  Token Bucket Algorithm                                                  │    │
│  │  ├── Burst: 20 requests                                                 │    │
│  │  ├── Steady: 5 req/sec                                                  │    │
│  │  ├── Tenant overrides (premium)                                         │    │
│  │  └── Global safety: 1000 req/min                                        │    │
│  └─────────────────────────────────────────────────────────────────────────┘    │
│                                      │                                           │
│                                      ▼                                           │
│  Layer 2: CIRCUIT BREAKER                                                        │
│  ┌─────────────────────────────────────────────────────────────────────────┐    │
│  │                                                                          │    │
│  │    CLOSED ──(failures ≥ threshold)──▶ OPEN                              │    │
│  │       ▲                                  │                               │    │
│  │       │                                  │ (resetTimeout)                │    │
│  │       │                                  ▼                               │    │
│  │       └──(successes ≥ threshold)── HALF_OPEN                            │    │
│  │                                                                          │    │
│  │  Per-dependency config:                                                  │    │
│  │  ├── interest_engine: 5 failures, 30s reset                             │    │
│  │  ├── fee_engine: 5 failures, 30s reset                                  │    │
│  │  ├── rate_provider: 3 failures (critical), 60s reset                    │    │
│  │  └── cache: 10 failures (tolerant), 10s reset                           │    │
│  └─────────────────────────────────────────────────────────────────────────┘    │
│                                      │                                           │
│                                      ▼                                           │
│  Layer 3: CACHE (Version-Pinned)                                                 │
│  ┌─────────────────────────────────────────────────────────────────────────┐    │
│  │  Cache Key = requestHash + engineVersion + ruleVersion                   │    │
│  │  ├── Deploy sonrası stale yok                                           │    │
│  │  ├── Stale-while-revalidate (degraded mode)                             │    │
│  │  └── TTL: 5 min (hot), 1 hour (warm)                                    │    │
│  └─────────────────────────────────────────────────────────────────────────┘    │
│                                      │                                           │
│                                      ▼                                           │
│  Layer 4: FALLBACK (Deterministic)                                               │
│  ┌─────────────────────────────────────────────────────────────────────────┐    │
│  │  FallbackResult<T> {                                                     │    │
│  │    value: T,                                                             │    │
│  │    source: 'CACHED_STALE' | 'DEFAULT' | 'UNAVAILABLE',                  │    │
│  │    evidence: { circuitState, dependency, reason, timestamp }            │    │
│  │  }                                                                       │    │
│  └─────────────────────────────────────────────────────────────────────────┘    │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Gözlemlenebilirlik Katmanları

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                        OBSERVABILITY LAYERS                                      │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  ┌─────────────────────────────────────────────────────────────────────────┐    │
│  │                         TRACE BUNDLE (Phase 5.1)                         │    │
│  │  ┌─────────────────────────────────────────────────────────────────┐    │    │
│  │  │  TraceContext                                                    │    │    │
│  │  │  ├── traceId (UUID)                                             │    │    │
│  │  │  ├── requestHash                                                │    │    │
│  │  │  ├── tenantId (PII-safe)                                        │    │    │
│  │  │  ├── versions { engine, rule, rate, tariff, policy }            │    │    │
│  │  │  └── timestamps { start, end, duration }                        │    │    │
│  │  └─────────────────────────────────────────────────────────────────┘    │    │
│  │  ┌─────────────────────────────────────────────────────────────────┐    │    │
│  │  │  TraceEvents[]                                                   │    │    │
│  │  │  ├── DEPENDENCY_CALL (provider, latency, status)                │    │    │
│  │  │  ├── CACHE_HIT / CACHE_MISS                                     │    │    │
│  │  │  ├── BREAKER_STATE_CHANGE                                       │    │    │
│  │  │  ├── POLICY_CHECK (outcome, reasons)                            │    │    │
│  │  │  └── FALLBACK_USED (source, evidence)                           │    │    │
│  │  └─────────────────────────────────────────────────────────────────┘    │    │
│  │  Sampling: 1% default, 100% on CRITICAL/ERROR                           │    │
│  │  Retention: 7-30 days (severity-based)                                  │    │
│  └─────────────────────────────────────────────────────────────────────────┘    │
│                                                                                  │
│  ┌─────────────────────────────────────────────────────────────────────────┐    │
│  │                          METRICS (Phase 4.1)                             │    │
│  │  ├── calc_preview_latency_ms (p50, p95, p99)                            │    │
│  │  ├── calc_preview_success_rate                                          │    │
│  │  ├── calc_preview_fallback_rate                                         │    │
│  │  ├── calc_preview_cache_hit_rate                                        │    │
│  │  ├── calc_preview_breaker_state                                         │    │
│  │  └── calc_preview_dependency_latency                                    │    │
│  │                                                                          │    │
│  │  SLO Thresholds:                                                         │    │
│  │  ├── p95 < 200ms (cache hit)                                            │    │
│  │  ├── success rate > 99%                                                 │    │
│  │  └── fallback rate < 2%                                                 │    │
│  └─────────────────────────────────────────────────────────────────────────┘    │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Test & Güvenlik Katmanları

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                         TEST & QUALITY LAYERS                                    │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  ┌─────────────────────────────────────────────────────────────────────────┐    │
│  │                    GOLDEN SCENARIOS (Phase 5.2)                          │    │
│  │  ├── simple-interest-30-days                                            │    │
│  │  ├── segmented-interest-rate-change                                     │    │
│  │  ├── policy-block-statute-of-limitations                                │    │
│  │  └── degraded-mode-provider-down                                        │    │
│  │                                                                          │    │
│  │  Diff Classification: NOISE → MINOR → MAJOR → CRITICAL                  │    │
│  │  Baseline Governance: CODEOWNERS + expiry + audit                       │    │
│  └─────────────────────────────────────────────────────────────────────────┘    │
│                                                                                  │
│  ┌─────────────────────────────────────────────────────────────────────────┐    │
│  │                    CONTRACT TESTS (Phase 5.6)                            │    │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                      │    │
│  │  │    Rate     │  │   Tariff    │  │   Policy    │                      │    │
│  │  │  Provider   │  │  Provider   │  │   Engine    │                      │    │
│  │  │  Contract   │  │  Contract   │  │  Contract   │                      │    │
│  │  └─────────────┘  └─────────────┘  └─────────────┘                      │    │
│  │                                                                          │    │
│  │  2 Katman:                                                               │    │
│  │  ├── Schema (Zod) - shape validation                                    │    │
│  │  └── Semantic - domain invariants                                       │    │
│  └─────────────────────────────────────────────────────────────────────────┘    │
│                                                                                  │
│  ┌─────────────────────────────────────────────────────────────────────────┐    │
│  │                    CHAOS / FAULT INJECTION (Phase 5.3)                   │    │
│  │  Fault Modes:                                                            │    │
│  │  ├── LATENCY (delay injection)                                          │    │
│  │  ├── ERROR (forced failures)                                            │    │
│  │  ├── TIMEOUT (connection timeout)                                       │    │
│  │  ├── CORRUPT (invalid response)                                         │    │
│  │  ├── PARTIAL (incomplete data)                                          │    │
│  │  ├── RATE_LIMIT (429 simulation)                                        │    │
│  │  └── CIRCUIT_OPEN (forced open)                                         │    │
│  │                                                                          │    │
│  │  ⚠️ PROD'DA DISABLED (ChaosModule.forRoot() → boş modül)                │    │
│  └─────────────────────────────────────────────────────────────────────────┘    │
│                                                                                  │
│  ┌─────────────────────────────────────────────────────────────────────────┐    │
│  │                    LOAD / SOAK TEST (Phase 5.5)                          │    │
│  │  ├── Soak: 1 hour, p95 < 200ms, success > 99%, memory < 20% growth      │    │
│  │  ├── Burst: p95 < 300ms, success > 95%, rate limited < 20%              │    │
│  │  └── Chaos-Soak: p95 < 500ms, success > 90%, fallback < 15%             │    │
│  └─────────────────────────────────────────────────────────────────────────┘    │
│                                                                                  │
│  ┌─────────────────────────────────────────────────────────────────────────┐    │
│  │                    SWEEP (Phase 5.7)                                     │    │
│  │  ├── TypeScript strict mode (noUnusedLocals, noUnusedParameters)        │    │
│  │  ├── ESLint architectural rules (no chaos in prod)                      │    │
│  │  ├── Module boundary sweep (import graph analysis)                      │    │
│  │  ├── Build artifact sweep (no test code in prod)                        │    │
│  │  └── Env flag validation (single source)                                │    │
│  └─────────────────────────────────────────────────────────────────────────┘    │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 5. Modül Yapısı

```
calc-preview/
├── calc-preview.module.ts          # Ana modül
├── calc-preview.controller.ts      # HTTP endpoints
├── calc-preview.service.ts         # Orchestration (hesaplama YOK)
├── types.ts                        # Request/Response types
│
├── metrics/                        # Phase 4.1
│   └── calc-preview-metrics.service.ts
│
├── rate-limit/                     # Phase 4.2
│   ├── calc-preview-rate-limit.service.ts
│   └── calc-preview-rate-limit.guard.ts
│
├── breaker/                        # Phase 4.3
│   └── calc-preview-circuit-breaker.service.ts
│
├── cache/                          # Phase 4.4
│   └── calc-preview-cache.service.ts
│
├── trace/                          # Phase 5.1
│   ├── trace-context.ts
│   ├── trace-collector.service.ts
│   ├── trace-storage.service.ts
│   └── trace.controller.ts
│
├── regression/                     # Phase 5.2
│   ├── golden-scenarios/
│   ├── regression-runner.ts
│   ├── diff-classifier.ts
│   └── GOVERNANCE.md
│
├── chaos/                          # Phase 5.3 (PROD'DA DISABLED)
│   ├── chaos.module.ts
│   ├── chaos.controller.ts
│   └── fault-injector.service.ts
│
├── load-test/                      # Phase 5.5
│   ├── k6/
│   │   ├── soak-test.js
│   │   ├── burst-test.js
│   │   └── chaos-soak-test.js
│   ├── load-test-runner.ts
│   └── load-test-reporter.ts
│
├── contracts/                      # Phase 5.6
│   ├── providers/
│   │   ├── rate-provider/
│   │   ├── tariff-provider/
│   │   └── policy-engine/
│   └── tools/
│
└── sweep/                          # Phase 5.7
    ├── env-flags.ts
    ├── module-boundary-sweep.ts
    ├── build-artifact-sweep.ts
    ├── integration-sweep.spec.ts
    └── eslint-architecture.rules.js
```

---

## 6. CI/CD Pipeline

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              CI/CD PIPELINE                                      │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  PR Açıldığında:                                                                 │
│  ┌─────────────────────────────────────────────────────────────────────────┐    │
│  │  ├── lint                    (ESLint + architectural rules)             │    │
│  │  ├── typecheck               (TypeScript strict)                        │    │
│  │  ├── unit-tests              (Jest)                                     │    │
│  │  ├── contract-tests          (Schema + Semantic)                        │    │
│  │  ├── regression-tests        (Golden scenarios)                         │    │
│  │  ├── sweep                   (Module boundary + build artifact)         │    │
│  │  └── build                   (tsconfig.prod.json)                       │    │
│  └─────────────────────────────────────────────────────────────────────────┘    │
│                                                                                  │
│  Nightly:                                                                        │
│  ┌─────────────────────────────────────────────────────────────────────────┐    │
│  │  ├── load-test (soak)        (1 hour, SLO validation)                   │    │
│  │  ├── load-test (burst)       (Rate limit validation)                    │    │
│  │  └── load-test (chaos-soak)  (Fault injection + recovery)               │    │
│  └─────────────────────────────────────────────────────────────────────────┘    │
│                                                                                  │
│  Deploy Öncesi:                                                                  │
│  ┌─────────────────────────────────────────────────────────────────────────┐    │
│  │  ├── regression-gate         (CRITICAL diff = 0)                        │    │
│  │  ├── contract-gate           (Schema + semantic pass)                   │    │
│  │  └── build-artifact-sweep    (No chaos/test in prod)                    │    │
│  └─────────────────────────────────────────────────────────────────────────┘    │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 7. Tek Kaynak Zinciri

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                         TEK KAYNAK ZİNCİRİ                                       │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  UI ──▶ CalcPreviewService ──▶ InterestEngineService ──▶ RateProvider (TCMB)   │
│                            ──▶ FeeEngineService ──▶ TariffProvider              │
│                            ──▶ PolicyEngineService ──▶ PolicyRules              │
│                                                                                  │
│  ✅ Orchestrator hesaplama YAPMIYOR                                             │
│  ✅ Gerçek engine'ler kullanılıyor                                              │
│  ✅ Preview = Full calculation (audit hariç)                                    │
│  ✅ Drift riski SIFIR                                                           │
│                                                                                  │
│  ═══════════════════════════════════════════════════════════════════════════    │
│                                                                                  │
│  Frontend'de YASAK:                                                              │
│  ❌ Math.round(tutar * oran)                                                    │
│  ❌ principal * 0.24 * days / 365                                               │
│  ❌ TCMB_ORANLARI tablosu                                                       │
│  ❌ hesaplaFaiz(), hesaplaVekalet()                                             │
│                                                                                  │
│  API erişilemezse:                                                               │
│  ✅ "Hesaplanamadı" göster                                                      │
│  ❌ Tahmini değer gösterme                                                      │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 8. Phase 5 Tamamlanma Durumu

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                         PHASE 5 COMPLETION STATUS                                │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  Phase 5.1 ✅ Trace Bundle                                                       │
│  ├── TraceContext + TraceEvents                                                 │
│  ├── Sampling (1% default, 100% critical)                                       │
│  ├── PII/KVKK compliant                                                         │
│  └── Trace endpoints (get, download, recent, stats)                             │
│                                                                                  │
│  Phase 5.2 ✅ Golden Scenarios                                                   │
│  ├── Regression runner + diff classifier                                        │
│  ├── Baseline governance (CODEOWNERS + expiry)                                  │
│  └── JUnit XML + JSON reports                                                   │
│                                                                                  │
│  Phase 5.3 ✅ Chaos / Fault Injection                                            │
│  ├── 7 fault modes                                                              │
│  ├── Test-only endpoints                                                        │
│  └── ChaosModule.forRoot() - prod'da sıfır saldırı yüzeyi                       │
│                                                                                  │
│  Phase 5.4 ✅ Operasyonel Hijyen                                                 │
│  ├── Trace RBAC + retention                                                     │
│  ├── Access audit                                                               │
│  └── Baseline governance                                                        │
│                                                                                  │
│  Phase 5.5 ✅ Load / Soak Test                                                   │
│  ├── k6 scripts (soak, burst, chaos-soak)                                       │
│  ├── SLO thresholds                                                             │
│  └── CI workflow (nightly + manual)                                             │
│                                                                                  │
│  Phase 5.6 ✅ Contract Tests                                                     │
│  ├── Rate provider contract                                                     │
│  ├── Tariff provider contract                                                   │
│  ├── Policy engine contract                                                     │
│  └── Schema + semantic validation                                               │
│                                                                                  │
│  Phase 5.7 ✅ Compile / Lint / Integration Sweep                                 │
│  ├── TypeScript strict mode                                                     │
│  ├── ESLint architectural rules                                                 │
│  ├── Module boundary sweep                                                      │
│  ├── Build artifact sweep                                                       │
│  └── Env flag validation                                                        │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘

                    ╔═══════════════════════════════════════╗
                    ║  PHASE 5 TAMAMLANDI                   ║
                    ║  Kod artık direniyor.                 ║
                    ║  Şimdi ekip ve kararlar direnmeli.    ║
                    ╚═══════════════════════════════════════╝
```
