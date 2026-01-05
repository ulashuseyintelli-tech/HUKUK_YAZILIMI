# İcrabot Modülü - v38

UYAP entegrasyonlu icra takip otomasyon sistemi.
v1-v38 blueprint'lerinden entegre edilmiştir.

## Özellikler

### v38 Yenilikleri (Enterprise Layer)

44. **PII Masking (v38)**
    - Kişisel verilerin rol bazlı maskelenmesi
    - TCKN, telefon, email, adres maskeleme
    - KVKK uyumluluğu
    - `PiiMaskingService`: PII maskeleme
    - `POST /icrabot/enterprise/pii/test-mask`
    - `GET /icrabot/enterprise/pii/should-mask`

45. **Audit Chain (v38)**
    - Immutable audit log with SHA-256 hash chain
    - Değiştirilemez kayıt zinciri
    - Chain integrity doğrulama
    - `AuditChainService`: Audit log yönetimi
    - `POST /icrabot/enterprise/audit/log`
    - `GET /icrabot/enterprise/audit/verify/:tenantId`

46. **Approval Workflow (v38)**
    - Yüksek etkili aksiyonlar için onay workflow'u
    - Risk level ve lock bazlı zorunlu onay
    - Rol bazlı onay yetkisi
    - `ApprovalWorkflowService`: Onay yönetimi
    - `GET /icrabot/enterprise/approval/check-required`
    - `POST /icrabot/enterprise/approval/request`
    - `POST /icrabot/enterprise/approval/decide`
    - `GET /icrabot/enterprise/approval/pending/:tenantId`

47. **Job Leasing (v38)**
    - Multi-worker ölçekleme için job leasing
    - SELECT FOR UPDATE SKIP LOCKED pattern
    - Lease timeout ve cleanup
    - `JobLeasingService`: Job lease yönetimi
    - `POST /icrabot/enterprise/leasing/acquire`
    - `POST /icrabot/enterprise/leasing/release`
    - `POST /icrabot/enterprise/leasing/extend`
    - `POST /icrabot/enterprise/leasing/cleanup/:tenantId`

48. **Backpressure (v38)**
    - Rate limiting ve backpressure yönetimi
    - UYAP yavaşladığında otomatik throttle
    - Fail rate bazlı cooldown
    - `BackpressureService`: Backpressure yönetimi
    - `GET /icrabot/enterprise/backpressure/status/:tenantId`
    - `POST /icrabot/enterprise/backpressure/record-action/:tenantId`
    - `POST /icrabot/enterprise/backpressure/enable-throttle`
    - `POST /icrabot/enterprise/backpressure/disable-throttle/:tenantId`

49. **Plan Limits (v38)**
    - FREE/PRO/ENTERPRISE plan kotaları
    - Dosya, job, kullanıcı limitleri
    - Feature bazlı erişim kontrolü
    - `PlanLimitsService`: Plan limit yönetimi
    - `GET /icrabot/enterprise/plan/limits/:plan`
    - `GET /icrabot/enterprise/plan/usage/:tenantId`
    - `GET /icrabot/enterprise/plan/summary/:tenantId`
    - `GET /icrabot/enterprise/plan/can-create-case/:tenantId`
    - `GET /icrabot/enterprise/plan/can-create-job/:tenantId`
    - `GET /icrabot/enterprise/plan/has-feature`

### v37 Yenilikleri (MVP Completion)

41. **Action List (v37)**
    - Dosya için bekleyen aksiyonları listeler
    - Açık kilitler, onay bekleyenler, masraf avansı bekleyenler
    - Priority bazlı sıralama (high → medium → low)
    - `ActionListService`: Aksiyon listesi oluşturma
    - `GET /icrabot/actions/:caseId/list`

42. **Risk/Net Report (v37)**
    - Varlık bazlı risk ve beklenen tahsilat raporu
    - Asset'ler için risk skoru ve level
    - Expected recovery (gross, net, costs, probability)
    - Summary istatistikleri
    - `RiskNetReportService`: Risk raporu oluşturma
    - `GET /icrabot/risk-report/:caseId/report`

43. **Weekly Export (v37)**
    - Haftalık özet raporu (stub)
    - Case ve job istatistikleri
    - Highlights ve next steps
    - Sonraki adım: PDF + mail
    - `WeeklyExportService`: Haftalık özet oluşturma
    - `GET /icrabot/weekly-export/weekly`

### v36 Yenilikleri (Health & Validation)

38. **Case Health Report (v36)**
    - Dosya sağlık skoru hesaplama (0-100)
    - Açık lock'lar, başarısız job'lar, eksik bundle'lar
    - Degraded mode durumu
    - Paused recipe'ler
    - `CaseHealthService`: Sağlık raporu hesaplama
    - `GET /icrabot/case-health/:caseId`

39. **UiMap Validator (v36)**
    - Aktif UiMap bundle doğrulama
    - Eksik locator binding tespiti
    - Eksik columns_keys tespiti
    - `UiMapValidatorService`: Bundle doğrulama
    - `GET /icrabot/uimap-validate/validate-active`

40. **Extractor Library (v36)**
    - Örnek extractor şablonları
    - Vehicle, Liens, E-Tebligat, Tahsilat extractors
    - `extractor-library.config.ts`: Default şablonlar

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

### v31 Yenilikleri (Priority + Quotas)

20. **Job Priority (v31)**
    - `IcrabotJobRun.priority` alanı eklendi
    - Düşük değer = yüksek öncelik (default: 100)
    - Plan bundle'da recipe'lere priority eklenebilir
    - Risk level'a göre priority_boost uygulanır

21. **Queue Policy Bundle (v31)**
    - `bundle_kind='queue_policy'` ile concurrency limitleri
    - `global_concurrency`: Toplam eşzamanlı job sayısı
    - `per_case_concurrency`: Dosya başına eşzamanlı job
    - `per_case_write_concurrency`: Dosya başına write job
    - `risk_queues`: Risk level bazlı kotalar ve priority boost
    - `QueuePolicyLoaderService`: Policy yükleme
    - `PriorityDispatcherService`: Priority + quota bazlı dispatch

### v32 Yenilikleri (Ops API)

22. **Recipe Pause/Unpause (v32)**
    - Ops ekibi recipe'leri duraklatabilir
    - Paused recipe'ler orchestrator tarafından planlanmaz
    - `IcrabotRecipePause` modeli (tenantId, recipeId, isPaused, reason)
    - `RecipePauseService`: Pause/unpause işlemleri, cache mekanizması

23. **Cancel Job (v32)**
    - Çalışan veya bekleyen job'lar iptal edilebilir
    - İptal edilen job'lar QUARANTINED durumuna geçer
    - `lastErrorCode: 'CANCELLED'`

24. **SLA Boost (v32)**
    - Job yaşına göre priority boost
    - Stage bazlı SLA policy (max_age_minutes, boost_priority)
    - Uzun süre bekleyen job'lar daha yüksek öncelik alır
    - `SlaBoostService`: SLA policy yükleme ve boost hesaplama
    - `bundle_kind='sla_policy'` ile DB-backed policy

25. **Ops Controller (v32)**
    - `GET /icrabot/ops/queue-dashboard`: Queue durumu özeti
    - `POST /icrabot/ops/pause-recipe`: Recipe duraklat
    - `POST /icrabot/ops/unpause-recipe`: Recipe devam ettir
    - `POST /icrabot/ops/cancel-job`: Job iptal et
    - `POST /icrabot/ops/apply-sla-boost`: SLA boost uygula
    - `GET /icrabot/ops/paused-recipes`: Duraklatılmış recipe'ler

### v33 Yenilikleri (UiMap Recorder)

26. **UiMap Recording (v33)**
    - Selector kayıt sistemi
    - `IcrabotUiMapRecording` modeli (label, selector, meta, approved)
    - Playwright ile element bulma ve selector önerisi (MVP: text= selector)
    - `UiMapRecorderService`: Selector önerisi ve onaylama

27. **Selector Health API (v33)**
    - En çok başarısız olan selector'ları takip
    - Fail rate hesaplama
    - Auto degraded mode için yüksek fail rate tespiti
    - `SelectorHealthService`: Sağlık raporu ve istatistikler

28. **Recorder Controller (v33)**
    - `POST /icrabot/recorder/suggest-by-text`: Text'e göre selector öner
    - `POST /icrabot/recorder/approve`: Recording onayla ve UiMapBundle'a ekle
    - `GET /icrabot/recorder/recordings`: Tüm recording'leri listele
    - `DELETE /icrabot/recorder/recordings/:id`: Recording sil

29. **Health Controller (v33)**
    - `GET /icrabot/health/selector-health`: Selector sağlık raporu
    - `GET /icrabot/health/selector/:key`: Belirli selector istatistikleri
    - `GET /icrabot/health/high-fail-selectors`: Yüksek fail rate'li selector'lar
    - `POST /icrabot/health/clear-old-logs`: Eski logları temizle

### v34 Yenilikleri (Recorder v2)

30. **Multi-Selector Alternatives (v34)**
    - Tek element için birden fazla selector önerisi
    - Alternatif selector türleri:
      - `text=...`: Görünür metin ile eşleşme
      - `css=#id`: ID ile eşleşme
      - `css=[name='...']`: Name attribute ile eşleşme
      - `css=.class`: CSS class ile eşleşme
    - `alternatives` alanı `IcrabotUiMapRecording` modeline eklendi

31. **Auto-Section Guess (v34)**
    - Label önekine göre otomatik section tahmini:
      - `BTN_*` → `buttons`
      - `FIELD_*`, `INPUT_*` → `fields`
      - `TABLE_*` → `tables`
      - `LINK_*` → `actions`
    - Approve sırasında section parametresi opsiyonel

32. **Alt Index Selection (v34)**
    - Approve sırasında alternatif selector seçimi
    - `altIndex` parametresi ile tercih edilen selector belirlenir
    - Seçilen selector `IcrabotUiMapRecording.selector` alanına yazılır

33. **Click Test API (v34)**
    - Selector'ın tıklanabilir olup olmadığını test et
    - MVP: Simülasyon (Playwright olmadan)
    - Production: Playwright ile gerçek click testi
    - `POST /icrabot/recorder-test/click-test`
    - `RecorderTestController`: Click test endpoint'i

### v35 Yenilikleri (Recorder v3)

34. **Selector Stability Score (v35)**
    - Her selector için 0.0-1.0 arası stabilite skoru
    - Heuristic sıralama: id/name (0.9) > css (0.6) > text (0.45) > class (0.3)
    - Generic selector'lar için ceza (tbody tr, div)
    - Attribute constraint'ler için bonus
    - `SelectorScoringService`: Skor hesaplama ve sıralama
    - `stabilityScore` alanı `IcrabotUiMapRecording` modeline eklendi

35. **Auto Click-Test Before Approve (v35)**
    - Approve öncesi otomatik click testi (default: true)
    - Click test başarısız → approve engellenir
    - `force=true` ile zorla onaylama
    - `autoTest=false` ile test atlanabilir
    - Table column selector'lar için test atlanır

36. **Table Column Recorder (v35)**
    - Tablo sütunları için relative selector önerisi
    - `css=td:nth-child(k)` formatında selector
    - UiMap table parsing (v21 columns_keys) için hızlandırıcı
    - `POST /icrabot/recorder/suggest-table-column`
    - `selectorKind: 'table_column'` ile işaretlenir

37. **Selector Kind (v35)**
    - Her recording için selector türü belirleme
    - Türler: `button`, `field`, `table`, `table_column`, `action`, `unknown`
    - `selectorKind` alanı `IcrabotUiMapRecording` modeline eklendi
    - Suggest endpoint'inde `kind` parametresi ile belirtilebilir

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
├── scheduler/                # v15-v31: Job scheduler + Adaptive + Priority
│   ├── scheduler.service.ts
│   ├── adaptive-scheduler.service.ts  # v30
│   ├── orchestrator-v30.service.ts    # v30
│   ├── queue-policy-loader.service.ts # v31
│   └── priority-dispatcher.service.ts # v31
├── ops/                      # v32: Ops API
│   ├── ops.controller.ts
│   ├── recipe-pause.service.ts
│   └── sla-boost.service.ts
├── recorder/                 # v33-v35: UiMap Recorder
│   ├── recorder.controller.ts     # v33-v35: Recorder + Health + Test controllers
│   ├── uimap-recorder.service.ts  # v33-v35: Multi-selector, stability score, table column
│   ├── selector-health.service.ts # v33-v34: Click test API
│   └── selector-scoring.service.ts # v35: Stability score hesaplama
├── health/                   # v36: Case Health & UiMap Validation
│   ├── health.controller.ts       # v36: CaseHealth + UiMapValidate controllers
│   ├── case-health.service.ts     # v36: Dosya sağlık raporu
│   └── uimap-validator.service.ts # v36: UiMap bundle doğrulama
├── mvp/                      # v37: MVP Completion
│   ├── mvp.controller.ts          # v37: ActionList + RiskReport + WeeklyExport controllers
│   ├── action-list.service.ts     # v37: Bekleyen aksiyonlar
│   ├── risk-net-report.service.ts # v37: Varlık bazlı risk raporu
│   └── weekly-export.service.ts   # v37: Haftalık özet (stub)
├── enterprise/               # v38: Enterprise Layer
│   ├── enterprise.controller.ts   # v38: All enterprise controllers
│   ├── pii-masking.service.ts     # v38: PII maskeleme
│   ├── audit-chain.service.ts     # v38: Immutable audit log
│   ├── approval-workflow.service.ts # v38: Onay workflow'u
│   ├── job-leasing.service.ts     # v38: Multi-worker job leasing
│   ├── backpressure.service.ts    # v38: Rate limiting
│   └── plan-limits.service.ts     # v38: Plan kotaları
├── config/                   # Configuration files
│   └── extractor-library.config.ts # v36: Default extractor şablonları
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

## Prisma Modelleri (v14-v38)

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
| IcrabotRecipePause | v32 | Recipe pause durumu |
| IcrabotUiMapRecording | v33-v35 | Selector kayıt sistemi (stability score, selector kind v35) |
| IcrabotAuditLog | v38 | Immutable audit log with hash chain |
| IcrabotApprovalRequest | v38 | Onay talepleri |
| IcrabotApprovalDecision | v38 | Onay kararları |

## Bundle Türleri (v24-v32)

| type | Versiyon | Açıklama |
|------|----------|----------|
| RECIPE | v14 | Recipe tanımları |
| PARAMS | v14 | Parametre bundle'ları |
| UIMAP | v14 | UI selector mapping |
| DECISION_RULES | v24 | Decision rules (fact → actions) |
| RISK | v28 | Risk scoring parametreleri |
| RECOVERY | v28 | Recovery simulation parametreleri |
| PLAN | v29 | Stage-based planning |
| QUEUE_POLICY | v31 | Concurrency limits, quotas |
| SLA_POLICY | v32 | Age-based priority boost |

## Queue Policy Format (v31)

```yaml
policy:
  global_concurrency: 30        # Toplam eşzamanlı job
  per_case_concurrency: 8       # Dosya başına eşzamanlı job
  per_case_write_concurrency: 1 # Dosya başına write job

  # Risk level bazlı kotalar
  risk_queues:
    high_impact_write:
      max_running: 1
      priority_boost: -15       # Negatif = daha yüksek öncelik
    controlled_write:
      max_running: 4
      priority_boost: -5
    read_only:
      max_running: 50
      priority_boost: 0
```

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

## SLA Policy Format (v32)

```yaml
policy:
  stages:
    TEBLIGAT:
      max_age_minutes: 60       # 1 saat
      boost_priority: -10       # Negatif = daha yüksek öncelik
    KESINLESME:
      max_age_minutes: 1440     # 1 gün
      boost_priority: -5
    VARLIK:
      max_age_minutes: 10080    # 7 gün
      boost_priority: 0
    HACIZ:
      max_age_minutes: 4320     # 3 gün
      boost_priority: -5
    TAHSILAT:
      max_age_minutes: 2880     # 2 gün
      boost_priority: -3
```

## Ops API (v32)

```
GET    /icrabot/ops/queue-dashboard        # Queue durumu özeti
POST   /icrabot/ops/pause-recipe           # Recipe duraklat
POST   /icrabot/ops/unpause-recipe         # Recipe devam ettir
POST   /icrabot/ops/cancel-job             # Job iptal et
POST   /icrabot/ops/apply-sla-boost        # SLA boost uygula
GET    /icrabot/ops/paused-recipes         # Duraklatılmış recipe'ler
```

### Queue Dashboard Response
```json
{
  "policy": { ... },
  "countsByStatus": [
    { "status": "QUEUED", "count": 150 },
    { "status": "RUNNING", "count": 12 },
    { "status": "DONE", "count": 5420 }
  ],
  "countsByRisk": [
    { "riskLevel": "READ_ONLY", "count": 4800 },
    { "riskLevel": "HIGH", "count": 320 }
  ],
  "topRecipes": [
    { "recipeId": "SyncSafahatTimeline", "count": 1200 },
    { "recipeId": "FetchETebligat", "count": 890 }
  ],
  "pausedRecipes": [
    { "recipeId": "RunAssetQueries", "reason": "UYAP bakımda" }
  ]
}
```

### Pause Recipe Request
```json
{
  "recipeId": "RunAssetQueries",
  "reason": "UYAP bakımda"
}
```

### Cancel Job Request
```json
{
  "jobId": "job_abc123"
}
```


## Recorder API (v33-v35)

```
POST   /icrabot/recorder/suggest-by-text      # Text'e göre selector öner (v35: stability score)
POST   /icrabot/recorder/suggest-table-column # v35: Table column selector öner
POST   /icrabot/recorder/approve              # Recording onayla (v35: auto click-test)
GET    /icrabot/recorder/recordings           # Tüm recording'leri listele
DELETE /icrabot/recorder/recordings/:id       # Recording sil
```

### Suggest By Text Request (v35)
```json
{
  "label": "BTN_SORGULA",
  "text": "Sorgula",
  "baseUrl": "https://uyap.gov.tr/...",
  "kind": "button"
}
```

### Suggest By Text Response (v35)
```json
{
  "ok": true,
  "id": "rec_abc123",
  "label": "BTN_SORGULA",
  "selector": "css=#btnSorgula",
  "alternatives": ["css=#btnSorgula", "text=Sorgula", "css=.btn-primary"],
  "stabilityScore": 0.9,
  "selectorKind": "button",
  "screenshotPath": null,
  "approved": false,
  "meta": { "text": "Sorgula", "ranked": [...] }
}
```

### Suggest Table Column Request (v35)
```json
{
  "label": "COL_PLAKA",
  "tableRowsSelector": "TABLE_ARACLAR",
  "colIndex": 2
}
```

### Suggest Table Column Response (v35)
```json
{
  "ok": true,
  "id": "rec_xyz789",
  "label": "COL_PLAKA",
  "selector": "css=td:nth-child(2)",
  "alternatives": ["css=td:nth-child(2)"],
  "stabilityScore": 0.6,
  "selectorKind": "table_column",
  "meta": { "tableRowsSelector": "TABLE_ARACLAR", "colIndex": 2, "relative": true }
}
```

### Approve Recording Request (v35)
```json
{
  "recordingId": "rec_abc123",
  "section": "buttons",
  "altIndex": 0,
  "autoTest": true,
  "force": false,
  "baseUrl": "https://uyap.gov.tr/..."
}
```

### Approve Recording Response (v35)
```json
{
  "ok": true,
  "label": "BTN_SORGULA",
  "section": "buttons",
  "selector": "css=#btnSorgula",
  "bundleId": "bundle_123",
  "testResult": { "ok": true, "error": null }
}
```

## Health API (v33)

```
GET    /icrabot/health/selector-health     # Selector sağlık raporu
GET    /icrabot/health/selector/:key       # Belirli selector istatistikleri
GET    /icrabot/health/high-fail-selectors # Yüksek fail rate'li selector'lar
POST   /icrabot/health/clear-old-logs      # Eski logları temizle
```

### Selector Health Response
```json
{
  "ok": true,
  "topFail": [
    { "selectorKey": "BTN_SORGULA", "count": 45 },
    { "selectorKey": "TBL_VARLIKLAR", "count": 23 }
  ],
  "topOk": [
    { "selectorKey": "BTN_GIRIS", "count": 1200 },
    { "selectorKey": "INPUT_TCKN", "count": 890 }
  ],
  "failRate": 0.12,
  "totalLogs": 5420
}
```

## Recorder Test API (v34)

```
POST   /icrabot/recorder-test/click-test   # Selector tıklanabilir mi test et
```

### Click Test Request
```json
{
  "selector": "css=#btnSorgula",
  "baseUrl": "https://uyap.gov.tr/..."
}
```

### Click Test Response
```json
{
  "success": true,
  "error": null,
  "screenshotPath": "/exports/recorder_test/clicktest_123.png"
}
```


## Case Health API (v36)

```
GET    /icrabot/case-health/:caseId        # Dosya sağlık raporu
```

### Case Health Response
```json
{
  "ok": true,
  "caseId": "case_abc123",
  "uyapDosyaId": "2024/12345",
  "workflowStage": "HACIZ",
  "score": 75,
  "degradedMode": false,
  "locksOpen": [
    { "id": "lock_1", "lockType": "MANUAL_REVIEW", "reason": "Yüksek risk", "createdAt": "2026-01-05T10:00:00Z" }
  ],
  "failedJobs": [
    { "id": "job_1", "recipeId": "SyncSafahat", "lastErrorCode": "TIMEOUT", "createdAt": "2026-01-05T09:00:00Z" }
  ],
  "pausedRecipes": [
    { "recipeId": "RunAssetQueries", "reason": "UYAP bakımda" }
  ],
  "bundles": {
    "recipeActive": true,
    "uimapActive": true,
    "decisionRulesActive": true,
    "planActive": true,
    "riskActive": false,
    "recoveryActive": false
  },
  "missingBundles": ["risk", "recovery"]
}
```

### Health Score Calculation
- Base score: 100
- Degraded mode: -25
- Open locks: -10 per lock (max -30)
- Failed jobs: -1 per job (max -20)
- Missing bundles: -10 per bundle

## UiMap Validate API (v36)

```
GET    /icrabot/uimap-validate/validate-active  # Aktif UiMap bundle doğrula
```

### UiMap Validation Response
```json
{
  "ok": true,
  "uimapBundleId": "bundle_xyz",
  "issues": [
    {
      "type": "missing_binding",
      "screen": "ARAC_SORGU",
      "key": "BTN_SORGULA",
      "message": "Menu click key 'BTN_SORGULA' not found in locator_bindings"
    },
    {
      "type": "missing_column",
      "screen": "ARAC_LISTESI",
      "column": "plaka",
      "key": "COL_PLAKA",
      "message": "Column key 'COL_PLAKA' for column 'plaka' not found in locator_bindings"
    }
  ],
  "stats": {
    "totalBindings": 45,
    "totalScreens": 12,
    "totalColumns": 28
  }
}
```

### Validation Issue Types
- `missing_binding`: Locator binding eksik
- `invalid_selector`: Geçersiz selector formatı
- `missing_column`: Table column key eksik

## Extractor Library (v36)

Default extractor şablonları `config/extractor-library.config.ts` dosyasında tanımlıdır:

| Extractor | Açıklama |
|-----------|----------|
| `vehicle_extractor` | Araç bilgileri (plaka, marka, model, yıl) |
| `lien_extractor` | Haciz/rehin bilgileri (alacaklı, tutar, tarih) |
| `etebligat_extractor` | E-tebligat durumu (tarih, sonuç, tebliğ şekli) |
| `tahsilat_extractor` | Tahsilat bilgileri (tutar, tarih, kaynak) |

### Extractor Format
```typescript
{
  id: 'vehicle_extractor',
  name: 'Araç Bilgisi Extractor',
  description: 'UYAP araç sorgu sonuçlarından araç bilgilerini çıkarır',
  factType: 'AssetFound',
  sourceScreen: 'ARAC_SORGU_SONUC',
  columns: {
    plaka: 'COL_PLAKA',
    marka: 'COL_MARKA',
    model: 'COL_MODEL',
    yil: 'COL_YIL',
  },
  transform: {
    asset_type: '"vehicle"',
    plate: 'row.plaka',
    brand: 'row.marka',
    model: 'row.model',
    year: 'parseInt(row.yil)',
  },
}
```


## Action List API (v37)

```
GET    /icrabot/actions/:caseId/list       # Dosya için bekleyen aksiyonlar
```

### Action List Response
```json
{
  "ok": true,
  "caseId": "case_abc123",
  "actions": [
    {
      "type": "LOCK",
      "priority": "high",
      "message": "Açık kilit: MANUAL_REVIEW",
      "detail": "Yüksek risk nedeniyle manuel inceleme gerekiyor",
      "createdAt": "2026-01-05T10:00:00Z"
    },
    {
      "type": "APPROVAL",
      "priority": "high",
      "message": "Avukat incelemesi gerekiyor",
      "detail": "Haciz kararı onayı bekleniyor",
      "createdAt": "2026-01-05T09:00:00Z"
    },
    {
      "type": "PAYMENT",
      "priority": "medium",
      "message": "Masraf avansı bekleniyor",
      "detail": "Yakalama avansı: 6000 TL",
      "createdAt": "2026-01-05T08:00:00Z"
    }
  ],
  "totalCount": 3
}
```

### Action Types
- `LOCK`: Açık kilit (manuel müdahale gerekiyor)
- `APPROVAL`: Onay bekleniyor (avukat/müvekkil)
- `PAYMENT`: Ödeme/avans bekleniyor
- `TASK`: Yüksek riskli iş bekliyor

## Risk/Net Report API (v37)

```
GET    /icrabot/risk-report/:caseId/report  # Varlık bazlı risk raporu
```

### Risk Report Response
```json
{
  "ok": true,
  "caseId": "case_abc123",
  "generatedAt": "2026-01-05T12:00:00Z",
  "totalAssets": 3,
  "assets": [
    {
      "assetId": "fact_1",
      "assetType": "vehicle",
      "assetValue": { "plate": "34ABC123", "brand": "Toyota" },
      "risk": {
        "score": 45,
        "level": "MEDIUM",
        "factors": { "prior_liens": 2, "value_confidence": 0.8 }
      },
      "expectedRecovery": {
        "grossValue": 250000,
        "netValue": 180000,
        "costs": 15000,
        "probability": 0.75
      }
    }
  ],
  "summary": {
    "totalGrossValue": 450000,
    "totalNetValue": 320000,
    "totalCosts": 35000,
    "averageRiskScore": 52,
    "highRiskCount": 1
  }
}
```

### Risk Levels
- `CRITICAL`: score >= 85
- `HIGH`: score >= 70
- `MEDIUM`: score >= 50
- `LOW`: score >= 30
- `MINIMAL`: score < 30

## Weekly Export API (v37)

```
GET    /icrabot/weekly-export/weekly        # Haftalık özet raporu
```

### Weekly Export Response
```json
{
  "ok": true,
  "generatedAt": "2026-01-05T12:00:00Z",
  "tenantId": "tenant_abc",
  "period": {
    "start": "2025-12-29T12:00:00Z",
    "end": "2026-01-05T12:00:00Z"
  },
  "summary": {
    "totalCases": 1250,
    "activeCases": 890,
    "newCases": 45,
    "closedCases": 12,
    "totalJobs": 3500,
    "successfulJobs": 3200,
    "failedJobs": 85
  },
  "highlights": [
    "45 yeni dosya açıldı",
    "12 dosya kapatıldı",
    "3200 otomasyon işi başarıyla tamamlandı"
  ],
  "nextSteps": [
    "PDF generation",
    "Mail dispatch",
    "Detailed analytics"
  ]
}
```

## MVP Tamamlama Durumu (v37)

v37 ile MVP tamamlanmış sayılır:

| Özellik | Durum | Açıklama |
|---------|-------|----------|
| Case Digital Twin | ✅ | Mevcut Case modeli |
| Task Orchestrator | ✅ | Recipe planlama ve çalıştırma |
| Rules Engine | ✅ | Decision rules + predicates |
| State Machine | ✅ | Workflow stage yönetimi |
| Scheduler | ✅ | Adaptive scheduling + priority |
| Audit/Evidence | ✅ | Kanıt paketi export |
| Admin Panel | ✅ | Job monitor + audit report |
| Bundle Management | ✅ | DB-backed bundles |
| Recipe Runner | ✅ | UI worker + DSL |
| Degraded Mode | ✅ | Auto degraded mode |
| Case Lock | ✅ | Concurrency guard |
| Fact Extraction | ✅ | Table parsing + extractors |
| Decision Engine | ✅ | Predicates + actions |
| Compute Modules | ✅ | Risk + recovery |
| Plan Loader | ✅ | Stage-based planning |
| Queue Policy | ✅ | Concurrency limits |
| Ops API | ✅ | Pause/unpause + SLA boost |
| UiMap Recorder | ✅ | Selector recording + health |
| Case Health | ✅ | Health score + validation |
| Action List | ✅ | Pending actions |
| Risk Report | ✅ | Asset-based risk |
| Weekly Export | ⚠️ | Stub (PDF + mail bekliyor) |

## Enterprise API (v38)

### PII Masking API

```
POST   /icrabot/enterprise/pii/test-mask     # PII maskeleme testi
GET    /icrabot/enterprise/pii/should-mask   # Alan maskelenmeli mi?
```

#### Test Mask Request
```json
{
  "data": {
    "tckn": "12345678901",
    "phone": "05551234567",
    "email": "test@example.com",
    "address": "Atatürk Cad. No:123 Kadıköy/İstanbul"
  },
  "role": "VIEWER"
}
```

#### Test Mask Response
```json
{
  "masked": {
    "tckn": "******8901",
    "phone": "***67",
    "email": "t***@***",
    "address": "Atatü...anbul"
  }
}
```

### Audit Chain API

```
POST   /icrabot/enterprise/audit/log              # Audit event kaydet
GET    /icrabot/enterprise/audit/verify/:tenantId # Chain doğrula
```

#### Log Event Request
```json
{
  "tenantId": "tenant_123",
  "caseId": "case_abc",
  "userId": "user_456",
  "action": "JOB_STARTED",
  "payload": { "recipeId": "SyncSafahat", "jobId": "job_789" }
}
```

#### Verify Chain Response
```json
{
  "ok": true,
  "valid": true,
  "checkedCount": 1500
}
```

### Approval Workflow API

```
GET    /icrabot/enterprise/approval/check-required    # Onay gerekli mi?
POST   /icrabot/enterprise/approval/request           # Onay talebi oluştur
POST   /icrabot/enterprise/approval/decide            # Karar ver
GET    /icrabot/enterprise/approval/pending/:tenantId # Bekleyen talepler
```

#### Create Request
```json
{
  "tenantId": "tenant_123",
  "caseId": "case_abc",
  "requestedByUserId": "user_456",
  "reason": "Yüksek riskli haciz işlemi",
  "riskLevel": "HIGH_IMPACT_WRITE"
}
```

#### Submit Decision
```json
{
  "tenantId": "tenant_123",
  "approvalRequestId": "req_789",
  "userId": "admin_001",
  "userRole": "ADMIN",
  "decision": "APPROVE",
  "note": "Onaylandı"
}
```

### Job Leasing API

```
POST   /icrabot/enterprise/leasing/acquire           # Lease al
POST   /icrabot/enterprise/leasing/release           # Lease bırak
POST   /icrabot/enterprise/leasing/extend            # Lease uzat
POST   /icrabot/enterprise/leasing/cleanup/:tenantId # Expired lease temizle
```

#### Acquire Lease Request
```json
{
  "tenantId": "tenant_123",
  "workerId": "worker_001",
  "leaseTtlSeconds": 60
}
```

#### Acquire Lease Response
```json
{
  "ok": true,
  "job": {
    "id": "run_abc",
    "jobId": "job_123",
    "recipeId": "SyncSafahat",
    "caseId": "case_xyz",
    "priority": 100,
    "leasedUntil": "2026-01-05T12:01:00Z",
    "leasedBy": "worker_001"
  }
}
```

### Backpressure API

```
GET    /icrabot/enterprise/backpressure/status/:tenantId       # Durum
POST   /icrabot/enterprise/backpressure/record-action/:tenantId # Aksiyon kaydet
POST   /icrabot/enterprise/backpressure/enable-throttle        # Throttle aç
POST   /icrabot/enterprise/backpressure/disable-throttle/:tenantId # Throttle kapat
GET    /icrabot/enterprise/backpressure/config                 # Config
```

#### Backpressure Status Response
```json
{
  "ok": true,
  "isThrottled": false,
  "currentActionsPerMinute": 45,
  "currentFailRate": 0.08,
  "throttledUntil": null,
  "reason": null
}
```

#### Enable Throttle Request
```json
{
  "tenantId": "tenant_123",
  "durationSeconds": 900,
  "reason": "UYAP bakımda"
}
```

### Plan Limits API

```
GET    /icrabot/enterprise/plan/limits/:plan              # Plan limitleri
GET    /icrabot/enterprise/plan/usage/:tenantId           # Kullanım
GET    /icrabot/enterprise/plan/summary/:tenantId         # Özet
GET    /icrabot/enterprise/plan/can-create-case/:tenantId # Dosya oluşturulabilir mi?
GET    /icrabot/enterprise/plan/can-create-job/:tenantId  # Job oluşturulabilir mi?
GET    /icrabot/enterprise/plan/has-feature               # Feature var mı?
```

#### Plan Limits Response
```json
{
  "ok": true,
  "limits": {
    "maxCases": 5000,
    "maxJobsPerDay": 20000,
    "maxUsersPerTenant": 20,
    "maxStorageGb": 50,
    "features": ["basic_automation", "scheduled_sync", "reports", "api_access"]
  }
}
```

#### Usage Summary Response
```json
{
  "ok": true,
  "plan": "PRO",
  "limits": { ... },
  "usage": {
    "currentCases": 1250,
    "jobsToday": 5400,
    "usersCount": 8,
    "storageUsedGb": 12.5
  },
  "percentages": {
    "cases": 25,
    "jobsToday": 27,
    "users": 40,
    "storage": 25
  }
}
```

### Plan Types

| Plan | Max Cases | Max Jobs/Day | Max Users | Storage | Features |
|------|-----------|--------------|-----------|---------|----------|
| FREE | 200 | 500 | 3 | 1 GB | basic_automation, manual_sync |
| PRO | 5,000 | 20,000 | 20 | 50 GB | + scheduled_sync, reports, api_access |
| ENTERPRISE | 200,000 | 500,000 | 1,000 | 1 TB | + sso, audit_export, custom_workflows, priority_support |

### User Roles (PII & Approval)

| Role | PII Access | Approval Authority |
|------|------------|-------------------|
| ADMIN | Full | All requests |
| LAWYER | Full | HIGH_IMPACT_WRITE, LOCK_EXECUTION_ACTIONS |
| OPS | Phone, Email | None |
| VIEWER | None | None |
