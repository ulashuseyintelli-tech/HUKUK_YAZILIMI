# İcrabot Modülü - v30

UYAP entegrasyonlu icra takip otomasyon sistemi.
v1-v30 blueprint'lerinden entegre edilmiştir.

## Özellikler

### v17-v23 Yenilikleri (UI Automation & Decision Engine)

1. **UI Worker Interface (v17)**
   - `IUIWorker` arayüzü (navigate/click/readTable/fillForm/selectRow)
   - `MockUIWorker`: Test için deterministik dummy data

2. **Locator Resolver (v18)**
   - UiMapBundle içindeki `locator_bindings` anahtarlarını CSS selector'a çevirir
   - Screen-specific ve global bindings desteği

3. **DSL Genişletme (v19)**
   - `waitFor(selectorKey, timeoutMs)`: Element bekle
   - `expectText(selectorKey, text)`: Metin doğrula

4. **Degraded Mode (v19-v21)**
   - Sistem degraded mode'dayken yüksek riskli işlemleri engeller
   - `DegradedModeService`: Activate/deactivate/shouldBlockJob

5. **Selector Health (v20)**
   - `SelectorHealthLog` modeli
   - Selector başarı/başarısızlık istatistikleri
   - Auto degraded mode: Fail rate %30'u geçince otomatik aktif

6. **Download/Upload DSL (v20)**
   - `downloadFile(buttonKey)`: Dosya indir
   - `uploadFile(fieldKey, filePath)`: Dosya yükle

7. **SystemConfig Model (v21)**
   - Tenant bazlı konfigürasyon
   - Degraded mode artık SystemConfig'de tutulur

8. **Case-level Concurrency Guard (v22)**
   - `CaseRunLock` modeli
   - Write job'lar aynı case üzerinde aynı anda çalışmaz
   - Lock timeout: 5 dakika

9. **Fact Extractor (v22-v23)**
   - Structured table rows → Fact kayıtları
   - Extractors config ile veri çıkarımı
   - Condition evaluation (when clause)

10. **Decision Engine (v23)**
    - Fact türlerine göre sonraki recipe'leri belirler
    - MVP: Sabit decision rules mapping
    - AssetFound → PrepareSeizure, TebligatDelivered → DetectFinalization

### v24-v29 Yenilikleri (DB-backed Decision & Compute)

11. **Decision Rules Bundle (v24)**
    - Decision rules artık hardcode değil, DB bundle'dan yüklenir
    - `bundle_kind='decision_rules'` olan ACTIVE ParamBundle kullanılır
    - `DecisionRulesLoaderService`: ACTIVE rules yükler

12. **Decision Predicates (v25)**
    - Koşul destekli decision rules:
      - `fact:Type(field=='value')`
      - `fact:Type(field!='value')`
      - `fact:Type(field in ['a','b'])`
      - Nested field: `attributes.plate`
    - `PredicateEvaluatorService`: Predicate değerlendirme

13. **Then Actions Executor (v26)**
    - Decision engine artık sadece enqueue etmiyor
    - `then` bloğunda desteklenen aksiyonlar:
      - `enqueue: [recipe_id...]`
      - `open_lock: "LOCK_..."`
      - `set_flag: {key: value}`
      - `emit: "EVENT_NAME"` veya `["E1","E2"]`
    - `ActionExecutorService`: Aksiyon çalıştırma

14. **Compute + Decisions (v27)**
    - `then` bloğunda compute desteği:
      - `compute: ["risk = RiskScoring", "expected_recovery = RecoverySimulator"]`
    - `decisions` bloğu ile koşullu aksiyonlar:
      - `if: "risk.score >= 85"` → `then: open_lock / set_flag / emit / enqueue`
    - Hesaplanan sonuçlar `Fact(fact_type="Computed")` olarak yazılır

15. **Parametric Compute (v28)**
    - Risk/Recovery parametreleri DB bundle'dan gelir:
      - `bundle_kind='risk'` ACTIVE → risk params
      - `bundle_kind='recovery'` ACTIVE → recovery params
    - `ComputeParamsLoaderService`: Parametre yükleme
    - `ComputeModulesService`: Risk scoring, recovery simulation

16. **Plan Bundle (v29)**
    - Stage-based planning artık DB plan bundle'dan geliyor
    - `bundle_kind='plan'` olan ACTIVE ParamBundle kullanılır
    - De-dup / cooldown: Aynı recipe sürekli enqueue edilmez
    - `PlanLoaderService`: Plan yükleme ve cooldown kontrolü

### v30 Yenilikleri (Adaptive Scheduling)

17. **Debtor-Scoped Planning (v30)**
    - Recipe'ler artık `scope: 'case' | 'debtor'` belirtebilir
    - `scope: 'debtor'` → Her borçlu için ayrı job oluşturulur
    - `scope: 'case'` → Dosya başına tek job (varsayılan)

18. **Per-Recipe Interval (v30)**
    - Her recipe kendi `interval_seconds` değerine sahip olabilir
    - Global `cooldown_seconds` yerine recipe bazlı cooldown
    - Örnek: Varlık sorgusu 7 gün, tebligat kontrolü 6 saat

19. **Adaptive Scheduling (v30)**
    - Son X saat fail rate'e göre interval otomatik ayarlanır
    - `fail_rate >= hard (0.4)`: interval x2
    - `fail_rate >= soft (0.2)`: interval x1.5
    - `AdaptiveSchedulerService`: Fail rate hesaplama ve interval ayarlama
    - `OrchestratorV30Service`: Debtor-scoped job planlama

### v14-v16 Yenilikleri (Production Engine)

1. **DB-backed Bundles (v14)**
   - RecipeBundle, ParamBundle, UiMapBundle modelleri
   - Draft → Approved → Active yayınlama modeli
   - Bundle clone, validate, archive

2. **Audit Export (v14)**
   - JSON formatında kanıt paketi export
   - Snapshots, Jobs, Evidence
   - SHA-256 hash doğrulama

3. **Scheduler (v15)**
   - 10 dakikalık periyodik job planlama
   - Stage bazlı recipe seçimi
   - Lock kontrolü

4. **Recipe Runner (v16)**
   - ACTIVE bundle'ları yükler
   - Recipe → Steps → Actions döngüsü
   - UI Worker interface
   - JobStep + Snapshot audit trail

### v11 Yenilikleri (Taksit İzleme & Haczedilmezlik)

1. **Taksit İzleme (Installment Tracking)**
2. **Haczedilmezlik Riski (Exemption Risk)**
3. **MTS Fork (Case Fork)**

### v10 Yenilikleri (Uzlaşma & Anomali)

1. **Gerçek Tahsilat Dağıtımı**
2. **Anomali Tespiti**
3. **Uzlaşma Modülü**

### v9 Yenilikleri (Satış Sonrası & Davranış Skoru)

1. **Satış Tamamlanma Takibi**
2. **Tahsilat Dağıtım Simülasyonu**
3. **Borçlu Davranış Skoru**

## Dosya Yapısı

```
icrabot/
├── admin/                    # v12: Admin panel
│   ├── admin.service.ts
│   ├── admin.controller.ts
│   ├── job-monitor.service.ts
│   └── audit-report.service.ts
├── bundle/                   # v14: DB-backed bundles
│   ├── bundle.service.ts
│   └── bundle.controller.ts
├── runner/                   # v16: Recipe runner
│   └── recipe-runner.service.ts
├── scheduler/                # v15: Job scheduler
│   └── scheduler.service.ts
├── export/                   # v14: Audit export
│   └── audit-export.service.ts
├── ui-worker/                # v17-v18: UI automation
│   ├── ui-worker.interface.ts
│   └── locator-resolver.service.ts
├── degraded-mode/            # v19-v21: Degraded mode
│   └── degraded-mode.service.ts
├── case-lock/                # v22: Concurrency guard
│   └── case-lock.service.ts
├── extractor/                # v22-v23: Fact extraction
│   ├── fact-extractor.service.ts
│   └── decision-engine.service.ts
├── decision/                 # v24-v27: DB-backed decision rules
│   ├── decision-rules-loader.service.ts
│   ├── predicate-evaluator.service.ts
│   ├── action-executor.service.ts
│   └── decision-engine-v2.service.ts
├── compute/                  # v27-v28: Parametric compute
│   ├── compute-params-loader.service.ts
│   └── compute-modules.service.ts
├── plan/                     # v29: Plan bundle
│   └── plan-loader.service.ts
├── scheduler/                # v15-v30: Job scheduler + Adaptive
│   ├── scheduler.service.ts
│   ├── adaptive-scheduler.service.ts  # v30
│   └── orchestrator-v30.service.ts    # v30
├── config/                   # Configuration files
├── recipes/                  # 82 recipe definitions
├── types/
├── state-machine.ts
├── recipe.service.ts
├── task-orchestrator.service.ts
├── evidence.service.ts
├── icrabot.service.ts
├── icrabot.controller.ts
└── icrabot.module.ts
```

## Prisma Modelleri (v14-v23)

| Model | Versiyon | Açıklama |
|-------|----------|----------|
| IcrabotBundle | v14 | Recipe/Params/UiMap bundle'ları |
| IcrabotJobRun | v15 | Job çalıştırma kayıtları |
| IcrabotJobStep | v16 | Job adımları |
| IcrabotEvidence | v14 | Kanıt/snapshot kayıtları |
| IcrabotLock | v15 | Dosya kilitleri |
| IcrabotEvidenceExport | v14 | Audit export kayıtları |
| SystemConfig | v21 | Sistem konfigürasyonu |
| SelectorHealthLog | v20 | Selector sağlık logları |
| CaseRunLock | v22 | Case-level concurrency lock |
| IcrabotFact | v22 | Extracted facts |

## Bundle Türleri (v24-v29)

| type | Versiyon | Açıklama |
|------|----------|----------|
| RECIPE | v14 | Recipe tanımları |
| PARAMS | v14 | Parametre bundle'ları |
| UIMAP | v14 | UI selector mapping |
| DECISION_RULES | v24 | Decision rules (fact → actions) |
| RISK | v28 | Risk scoring parametreleri |
| RECOVERY | v28 | Recovery simulation parametreleri |
| PLAN | v29 | Stage-based planning |

## Recipe Sayıları

| Modül | Sayı | Açıklama |
|-------|------|----------|
| session | 1 | UYAP oturum yönetimi |
| sync | 7 | Safahat, evrak, header senkronizasyonu |
| tebligat | 8 | E-tebligat, fiziki tebligat, mazbata |
| kesinlesme | 3 | Kesinleşme tespiti |
| varlik | 17 | Varlık sorguları, AI değerleme, haczedilmezlik |
| haciz | 23 | Haciz hazırlık, araç haciz, post-lien strateji |
| tahsilat | 16 | Tahsilat, uzlaşma, taksit izleme |
| satis | 6 | Satış başlatma, satış takibi |
| finance | 1 | Masraf tahmini |
| **Toplam** | **82** | |

## Decision Rules (v23)

| Fact Type | Next Recipes |
|-----------|--------------|
| AssetFound (vehicle) | PrepareVehicleSeizure, CalculateLienRank |
| AssetFound (bank_account) | PrepareBankSeizure |
| AssetFound (real_estate) | PrepareRealEstateSeizure, CalculateLienRank |
| TebligatDelivered | DetectFinalizationCandidate |
| FinalizationDetected | RunAssetQueriesBatch |
| HacizPlaced | TrackHacizResults, PostLienStrategy |
| PaymentReceived | SyncTahsilat, EvaluateCaseClosure |

## Decision Rules Format (v24-v27)

```yaml
rules:
  - rule_id: R_ASSET_FOUND_VEHICLE
    when: "fact:AssetFound(asset_type=='vehicle')"
    then:
      enqueue:
        - "FetchPriorLiens_Vehicle"
        - "EstimateVehicleValue_AI"
      
  - rule_id: R_VALUATION_COMPLETE
    when: "fact:ValuationEstimate"
    then:
      compute:
        - "risk = RiskScoring"
        - "expected_recovery = RecoverySimulator"
      decisions:
        - if: "risk.score >= 85"
          then:
            open_lock: "LOCK_HIGH_RISK"
            set_flag: {high_risk: true}
        - if: "expected_recovery.flags.ok_for_cost_actions == false"
          then:
            emit: "SKIP_COST_ACTIONS"
```

## Compute Parameters (v28)

### Risk Params (bundle_kind='risk')
```yaml
params:
  risk:
    block_cost_threshold: 70
    block_execution_threshold: 85
    weights:
      rank: 0.35
      prior_claims: 0.20
      uncertainty: 0.20
      value_confidence: 0.15
      lien_activity: 0.10
```

### Recovery Params (bundle_kind='recovery')
```yaml
params:
  recovery:
    min_net_for_cost_actions: 25000
    cost_budgets:
      yakalama_avansi: 6000
      satis_avansi: 15000
      yeniden_tebligat: 1200
```

## Plan Bundle Format (v29-v30)

```yaml
plan:
  cooldown_seconds: 900  # Default fallback

  stages:
    ACILIS:
      recipes:
        - recipe_id: EnsureUYAPSession
          risk_level: read_only
          interval_seconds: 900   # v30: per-recipe interval
          scope: case             # v30: 'case' | 'debtor'
        - recipe_id: SyncSafahatTimeline
          risk_level: read_only
          interval_seconds: 21600
          scope: case
    TEBLIGAT:
      recipes:
        - recipe_id: FetchPreparedETebligatlar_Debtor
          risk_level: read_only
          interval_seconds: 21600
          scope: debtor           # v30: her borçlu için ayrı job
    VARLIK:
      recipes:
        - recipe_id: RunAssetQueries_Debtor
          risk_level: read_only
          interval_seconds: 604800  # 7 gün
          scope: debtor

  # v30: Adaptive scheduling
  adaptive:
    enabled: true
    window_hours: 6           # Son 6 saat fail rate'i kontrol et
    min_samples: 10           # Minimum 10 job olmalı
    fail_rate_soft: 0.2       # %20 fail → interval x1.5
    fail_rate_hard: 0.4       # %40 fail → interval x2
```

## API Endpoints

### Bundle API (v14-v16)
```
GET    /icrabot/bundles                    # Tüm bundle'ları listele
POST   /icrabot/bundles                    # Yeni bundle oluştur
POST   /icrabot/bundles/:id/approve        # Bundle onayla
POST   /icrabot/bundles/:id/promote        # Bundle aktif et
```

### Scheduler API (v15)
```
POST   /icrabot/bundles/scheduler/tick     # Manuel scheduler tick
POST   /icrabot/bundles/scheduler/process-queue  # Kuyruktan job işle
```

### Runner API (v16)
```
POST   /icrabot/bundles/runner/run-job/:jobId    # Job çalıştır
```

### Admin API (v12)
```
GET    /icrabot/admin/recipes              # Recipe listesi
POST   /icrabot/admin/recipes/:id/enable   # Recipe aktif et
GET    /icrabot/admin/jobs                 # Job listesi
POST   /icrabot/admin/jobs/:id/retry       # Job yeniden çalıştır
```

## Degraded Mode (v19-v21)

Sistem degraded mode'dayken:
- HIGH, CRITICAL, MEDIUM risk seviyeli job'lar BLOCKED olur
- READ_ONLY ve LOW risk job'lar çalışmaya devam eder
- Selector fail rate %30'u geçince otomatik aktif olur
- Fail rate %10'un altına düşünce otomatik deaktif olur

## Case Lock (v22)

Write job'lar için case-level concurrency guard:
- Aynı case üzerinde aynı anda sadece 1 write job çalışır
- Lock timeout: 5 dakika
- Expired lock'lar otomatik temizlenir
