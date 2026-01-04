# İcrabot Modülü - v23

UYAP entegrasyonlu icra takip otomasyon sistemi.
v1-v23 blueprint'lerinden entegre edilmiştir.

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
