# Simulation API — Production Deploy Planı

> **Amaç:** Sprint 3 Simulation API'nin staging → canary → production rollout prosedürü, rollback kriterleri, smoke test listesi ve post-deploy gözlem penceresi.
> **Durum:** Sprint 3 — Checkpoint C PASSED, property-tested hardened (P1-P2-P7-P9-P11)
> **Bağımlılıklar:** Sprint 3 tüm görevler tamamlandı (111 test, 11 suite)
> **Referans:** `docs/simulation-ops-runbook.md`, `.kiro/specs/sprint-3-deploy-ready/architecture.md`

---

## İçindekiler

- [§0 Kritik Uyarılar](#0-kritik-uyarılar)
- [§1 Release Stratejisi (Canary → Full)](#1-release-stratejisi)
- [§2 Pre-flight Checklist](#2-pre-flight-checklist)
- [§3 Smoke Test Senaryoları](#3-smoke-test-senaryoları)
- [§4 Rollback Kriterleri](#4-rollback-kriterleri)
- [§5 Fire Drill (Ops Tatbikatı)](#5-fire-drill)
- [§6 Post-deploy Gözlem Penceresi](#6-post-deploy-gözlem-penceresi)
- [§7 Bilinen Sınırlamalar (Deploy Scope)](#7-bilinen-sınırlamalar)
- [§8 Safety Deepening Geçiş Kriterleri](#8-safety-deepening-geçiş-kriterleri)

---

## §0 Kritik Uyarılar

### ⚠️ Drift Guard Placeholder

> **DİKKAT:** Sprint 3 deploy'unda `PromoteService.calculateDriftPlaceholder()` aktiftir. Bu fonksiyon her zaman `driftScore: 0, shouldBlock: false` döner — yani drift guard fiilen devre dışıdır. Gerçek snapshot wiring (SnapshotStore.getFreshSnapshot + getStoredEvidence) Sprint 4'te yapılacaktır.
>
> **Etki:** Promote istekleri drift kontrolü olmadan kabul edilir. Bu bilinçli bir karardır — Sprint 3'ün amacı pipeline'ın end-to-end çalışmasını doğrulamaktır, drift doğruluğu değil.
>
> **Mitigasyon:** Drift guard aktif olana kadar promote sonuçları manuel diff kontrolü ile doğrulanmalıdır. Bu kontrol atlanırsa risk büyür.

### ⚠️ Kill-Switch Alert Proxy Davranışı

> **DİKKAT:** `SimulationKillSwitchActive` alert'i explicit gauge metric yerine proxy expression kullanır. Kill-switch aktifken promote/drift metrikleri artmıyorsa alert tetiklenmeyebilir (false negative). Alert `for: 30m` ile 30 dakika sonra tetiklenir.
>
> **Etki:** Kısa süreli kill-switch kullanımında (< 30 dakika) alert gelmez. Fire drill'de bu davranış doğrulanmalıdır (bkz. §5).

### ⚠️ SLO Baseline Henüz Yok

> **DİKKAT:** Sprint 3 endpoint'leri için latency SLO tanımlı değildir. İlk 7 günlük gözlem penceresi (§6) baseline ölçümü olarak kullanılacak, SLO hedefleri bu veriye göre belirlenecektir.
>
> **Kural:** Baseline toplanmadan alert threshold değiştirilmez. Aksi halde alert ya hiç çalmaz ya da sürekli çalar.

### ⚠️ DB Migration Güvenlik Notu

> **DİKKAT:** Sprint 3 migration'ı yalnızca yeni tablolar oluşturur (`CREATE TYPE` + `CREATE TABLE` + `CREATE INDEX`). Mevcut tablolara `ALTER TABLE` veya `ADD COLUMN` yok — online-safe, lock riski minimal (boş tablo üzerinde index, milisaniye seviyesi).
>
> Migration Prisma `_prisma_migrations` tablosu ile tracking edilir. SQL seviyesinde idempotent değildir — tekrar çalıştırma `already exists` hatası verir.
>
> **Rollback SQL'i:** Migration dosyasının sonunda yorum olarak mevcut (`DROP TABLE` + `DROP TYPE`).

---

## §1 Release Stratejisi

### Kesin Deploy Sıralaması (Adım Adım)

| Adım | İşlem | Doğrulama | Geri Dönüş |
|------|-------|-----------|------------|
| 1 | Kill-switch ON (`SIMULATION_ENABLED=false`) | Env var doğrula | — |
| 2 | DB migration (`prisma migrate deploy`) | `\d promote_request`, `\d escalation_state` snapshot al | DROP TABLE + DROP TYPE |
| 3 | Schema validation (index, PK, enum doğrulama) | `\di` ile index listesi, `\dT+` ile enum values | — |
| 4 | App deploy (feature flag default OFF) | Health endpoint green | Önceki sürüme rollback |
| 5 | Metrics scrape doğrulama (≥5 dk) | Prometheus UI: `promote_success_total` mevcut | — |
| 6 | Kill-switch doğrulama (mutation → 503) | ST-4, ST-5, ST-6 | — |
| 7 | Smoke test (kill-switch ON hali) | ST-7 (read OK) | — |
| 8 | Kill-switch OFF (Stage 1: canary %1-5) | Mutation endpoint'ler 200/202 | Kill-switch ON |
| 9 | Smoke test (full — ST-1 → ST-12) | Tüm senaryolar geçti | Kill-switch ON |
| 10 | Escalation dry run (ST-9, ST-10) | Audit event + metrik doğrulama | Kill-switch ON |
| 11 | Alert pending doğrulama (fire drill FD-1) | `ALERTS{alertstate="pending"}` görünür | — |
| 12 | 30 dakika gözlem | Metrik trendi stabil, 0 unexpected 5xx | Kill-switch ON |
| 13 | Stage 2: trafik %25 | 1 saat gözlem | Stage 1'e düşür |
| 14 | 4 saat gözlem | Error rate < %1, latency stabil | Stage 1'e düşür |
| 15 | Stage 3: trafik %100 | — | Stage 2'ye düşür |
| 16 | 7 gün baseline toplama | p95 latency, error rate, escalation count, conflict rate | — |
| 17 | SLO tanımı + threshold tuning | Baseline verisine göre | — |

> **Kural:** Adım 11 (pending doğrulama) geçilmeden Stage 2'ye geçilmez. Pending görülmezse R3 riski gerçekleşmiş demektir.

### Aşamalar

| Stage | Açıklama | Kill-Switch | Trafik | Min Bekleme | Geçiş Kriteri |
|-------|----------|-------------|--------|-------------|----------------|
| **Stage 0: Dark Deploy** | Kod deploy, mutation kapalı | `SIMULATION_ENABLED=false` | %0 (mutation) | 30 dakika | Migration başarılı + health green + metrics scrape aktif (≥5 dk veri) |
| **Stage 1: Canary** | Kill-switch açık, düşük trafik | `SIMULATION_ENABLED=true` | %1-5 (ingress weight) | 1 saat | Smoke test'ler geçti + 0 unexpected 5xx + alert yok |
| **Stage 2: Partial** | Trafik artırımı | `SIMULATION_ENABLED=true` | %25 | 4 saat | Metrik trendi stabil + error rate < %1 + latency stabil |
| **Stage 3: Full** | Tam rollout | `SIMULATION_ENABLED=true` | %100 | — | Stage 2 kriterleri 4 saat boyunca sağlandı |

> **Minimum süreler azaltılamaz.** 30 dk (smoke stabilization), 1 saat (alert soak), 4 saat (escalation soak).

### DB Migration Detayları

**Migration güvenlik profili:**

| Özellik | Değer | Risk |
|---------|-------|------|
| Mevcut tablolara lock | Yok — sadece `CREATE TYPE` + `CREATE TABLE` | Minimal |
| Index oluşturma | Boş tablolar üzerinde — `CONCURRENTLY` gereksiz | Milisaniye |
| `ALTER TABLE` | Yok | Sıfır |
| Idempotency | Prisma `_prisma_migrations` tracking ile | SQL seviyesinde hayır |
| Rollback | `DROP TABLE` + `DROP TYPE` (migration dosyasında mevcut) | Forward-fix tercih |

**Migration öncesi schema snapshot:**
```sql
-- Prod'da migration öncesi çalıştır ve çıktıyı sakla:
\dt                          -- mevcut tablo listesi
\d promote_request           -- (migration sonrası) tablo yapısı
\d escalation_state          -- (migration sonrası) tablo yapısı
\di promote_request*         -- index listesi
\dT+ "PromoteRequestStatus"  -- enum values
\dT+ "EscalationLevelEnum"   -- enum values
```

> **Not:** Migration yeni tablolar oluşturduğu için off-peak zorunluluğu yoktur. Ancak convention olarak off-peak tercih edilir.

### Rollback Türleri

| Tür | Ne Yapar | Ne Zaman |
|-----|----------|----------|
| **Kill-switch ON** | Mutation endpoint'ler 503, read devam | İlk müdahale — hızlı, schema'ya dokunmaz |
| **Code Rollback** | Önceki sürüme dön | Kill-switch yetmezse (health/startup sorunu) |
| **Schema Rollback** | Migration geri al | Yalnızca Stage 0'da schema sorunu tespit edilirse |

> **Önemli:** Kill-switch ON sadece mutation'ları kapatır, schema rollback yapmaz. `promote_request` ve `escalation_state` tabloları kalır — bu güvenlidir çünkü read path'ler bu tablolara bağımlı değildir.

---

## §2 Pre-flight Checklist

Deploy öncesi doğrulanması gereken maddeler:

### Altyapı

| # | Madde | Doğrulama Yöntemi |
|---|-------|-------------------|
| PF-1 | `component=simulation` alertmanager route prod config'de mevcut | `alertmanager.yml` diff review |
| PF-2 | `simulation-alerts.yml` prod Prometheus'a yüklenmiş | `promtool check rules` (CI) veya Prometheus UI |
| PF-3 | Runbook linkleri prod repo path'leriyle eşleşiyor | Alert annotation `runbook_url` → `docs/simulation-ops-runbook.md` |
| PF-4 | DB migration staging'de başarılı çalıştı | `prisma migrate deploy` staging log |
| PF-5 | Feature flag default state doğrulandı | `SIMULATION_ENABLED` env var prod config'de `false` (Stage 0 için) |

### Uygulama

| # | Madde | Doğrulama Yöntemi |
|---|-------|-------------------|
| PF-6 | 111/111 test green (CI) | CI pipeline son run |
| PF-7 | Build artifact staging'de deploy edildi ve health green | Staging health endpoint |
| PF-8 | Prometheus scrape staging'de aktif (simulation metrikleri görünüyor) | Prometheus UI: `promote_success_total` mevcut |

### Risk Doğrulamaları

| # | Madde | Referans |
|---|-------|----------|
| PF-9 | R3: Kill-switch proxy alert — prod metrik isimleri uyumlu | `simulation-alerts.yml` expr'leri prod metrik adlarıyla eşleşiyor |
| PF-10 | R4: Rate limit bucket parity — v1 ve non-v1 aynı `acquireToken` key'leri | Code review: `acquireToken(tenantId, incidentId, runId)` path-agnostic |
| PF-11 | Drift guard placeholder bilinen ve kabul edilmiş | Bu doküman §0 referansı |

---

## §3 Smoke Test Senaryoları

Canary açıldıktan sonra (Stage 1) 10 dakika içinde çalıştırılacak doğrulama senaryoları:

### Promote Path

| # | Senaryo | Beklenen | Doğrulama |
|---|---------|----------|-----------|
| ST-1 | `POST /v1/incidents/{id}/simulations/{runId}/promote` (valid) | 202 ACCEPTED + requestId | Response body + `promote_success_total` increment |
| ST-2 | Aynı (incidentId, runId) ile tekrar promote | 202 ALREADY_PROMOTED + aynı requestId | Response body + audit duplicate yok |
| ST-3 | Geçersiz runId ile promote | 404 RUN_NOT_FOUND | Response error code |

### Kill-Switch Path

| # | Senaryo | Beklenen | Doğrulama |
|---|---------|----------|-----------|
| ST-4 | Kill-switch ON → `POST .../promote` | 503 SIMULATION_DISABLED | Response status |
| ST-5 | Kill-switch ON → `POST .../rank` | 503 SIMULATION_DISABLED | Response status |
| ST-6 | Kill-switch ON → `POST /v1/.../simulations` | 503 SIMULATION_DISABLED | Response status |
| ST-7 | Kill-switch ON → `GET /v1/.../simulations/{runId}` | 200 (read etkilenmez) | Response status |

### v1 Alias Path

| # | Senaryo | Beklenen | Doğrulama |
|---|---------|----------|-----------|
| ST-8 | `POST /v1/incidents/{id}/simulations` | Aynı response shape (mevcut simulate ile) | Response body diff |

### Escalation Path

| # | Senaryo | Beklenen | Doğrulama |
|---|---------|----------|-----------|
| ST-9 | Escalation trigger (metrik > threshold) | ESCALATION_TRIGGERED audit event | Audit log + `escalation_churn_total` increment |
| ST-10 | Escalation hold-down (cooldown aktif) | HOLD — seviye değişmez | State version değişmedi |

### Audit Path

| # | Senaryo | Beklenen | Doğrulama |
|---|---------|----------|-----------|
| ST-11 | ST-1 sonrası audit log kontrolü | PROMOTE_ACCEPTED event mevcut | Audit log query |
| ST-12 | ST-2 sonrası audit log kontrolü | Duplicate event yok (tek kayıt) | Audit log count |

---

## §4 Rollback Kriterleri

### Hard Rollback (Anında kill-switch ON + code rollback değerlendirmesi)

Aşağıdakilerden **herhangi biri** gerçekleşirse:

| # | Kriter | Alert | Aksiyon |
|---|--------|-------|---------|
| RB-1 | `PromoteFailureRateHigh` alert sustained (> 5 dakika) | ✅ | Kill-switch ON → triage (§2 runbook) |
| RB-2 | `DriftDetectedSpikeHigh` alert sustained | ✅ | Kill-switch ON → triage (§2 runbook) |
| RB-3 | `EscalationChurnHigh` alert sustained | ✅ | Kill-switch ON → triage (§3 runbook) |
| RB-4 | `EscalationConflictSpikeHigh` alert sustained | ✅ | Kill-switch ON → triage (§3 runbook) |
| RB-5 | Beklenmeyen 5xx artışı (simulation endpoint'lerde) | Manuel | Kill-switch ON → log inceleme |
| RB-6 | DB connection pool exhaustion (promote/escalation kaynaklı) | Manuel | Kill-switch ON → connection pool analizi |
| RB-7 | Alert storm (yanlış threshold — sürekli firing) | Manuel | Kill-switch ON → threshold'u geri al veya inhibit rule ekle |

### Soft Rollback (Gözlem + karar)

| # | Kriter | Aksiyon |
|---|--------|---------|
| RB-8 | Latency p95 baseline'ın 2x üstünde (7 gün sonrası) | Stage düşür (ör: %100 → %25) |
| RB-9 | Tenant bazlı anomali (tek tenant'ta yoğun hata) | Tenant-level investigation |

---

## §5 Fire Drill

Prod'da ilk 24 saat içinde yapılacak ops tatbikatı:

### FD-1: Kill-Switch Tatbikatı

1. `SIMULATION_ENABLED=false` yap
2. 3 mutation endpoint'e istek gönder → 503 doğrula
3. Read endpoint'e istek gönder → 200 doğrula
4. Prometheus'ta `SimulationKillSwitchActive` alert'in **pending** state'e geçtiğini doğrula:
   ```promql
   ALERTS{alertname="SimulationKillSwitchActive", alertstate="pending"}
   ```
   - Not: Alert `for: 30m` olduğu için 2-3 dakikalık test'te **fired** olmaz, sadece **pending** olur
   - Eğer pending bile olmuyorsa → R3 riski gerçekleşmiş demektir, proxy expression prod metrik adlarıyla uyumsuz
5. Alertmanager notification counter'ının artmadığını doğrula (pending, fired değil):
   ```promql
   increase(alertmanager_notifications_total{alertname="SimulationKillSwitchActive"}[5m])
   ```
   Bu değer 0 olmalı (henüz fired olmadı).
6. `SIMULATION_ENABLED=true` yap → endpoint'ler tekrar 200/202 döner
7. **Sonuç not et:** Alert pending oldu mu? Süre? Metrik adları uyumlu mu?

> **Kural:** FD-1 adım 4'te pending görülmeden Stage 2'ye geçilmez.

### FD-2: Runbook Tatbikatı

1. Ekipten bir kişi `docs/simulation-ops-runbook.md` §2 (Promote Drift Triage) adımlarını takip etsin
2. PromQL sorgularını Prometheus UI'da çalıştırsın
3. Adımlar anlaşılır mı, PromQL'ler çalışıyor mu not et
4. Eksik veya belirsiz adım varsa runbook güncelleme ticket'ı aç

### FD-3: Alert Delivery Tatbikatı

1. Prometheus'ta `PromoteFailureRateHigh` alert'in expression'ını geçici olarak `> 0` yap (veya test alert gönder)
2. Alertmanager → Slack/PagerDuty delivery doğrula
3. Orijinal threshold'a geri dön
4. **Sonuç not et:** Alert delivery süresi, doğru channel'a gitti mi?

---

## §6 Post-deploy Gözlem Penceresi

### İlk 24 Saat (Aktif Gözlem)

| Metrik | PromQL | Beklenen |
|--------|--------|----------|
| Promote başarı oranı | `rate(promote_success_total[5m])` | > 0 (canary trafiği varsa) |
| Promote hata oranı | `rate(promote_failure_total[5m])` | ≈ 0 |
| Drift tespit | `rate(drift_detected_total[5m])` | 0 (placeholder aktif) |
| Escalation churn | `rate(escalation_churn_total[5m])` | Düşük, stabil |
| CAS conflict | `rate(escalation_state_conflict_total[5m])` | ≈ 0 |
| 503 profili | `sum(rate(http_responses_total{status="503", path=~".*simulation.*"}[5m]))` | 0 (kill-switch OFF ise) |
| 429 profili | `sum(rate(http_responses_total{status="429", path=~".*simulation.*"}[5m]))` | Düşük |

### İlk 7 Gün (Baseline Ölçümü)

Aşağıdaki metrikler 7 gün boyunca toplanır — SLO tanımı ve alert threshold tuning bu veriye dayanır:

| Metrik | PromQL | Amaç |
|--------|--------|------|
| Latency p50 | `histogram_quantile(0.5, rate(http_request_duration_seconds_bucket{path=~".*simulation.*"}[5m]))` | Normal operasyon profili |
| Latency p95 | `histogram_quantile(0.95, ...)` | SLO hedef adayı |
| Latency p99 | `histogram_quantile(0.99, ...)` | Tail latency profili |
| Error rate | `rate(promote_failure_total[1h]) / rate(promote_success_total[1h])` | Hata oranı trendi |
| Escalation count | `increase(escalation_churn_total[1d])` | Günlük escalation sayısı |
| CAS conflict rate | `increase(escalation_state_conflict_total[1d])` | Concurrency pressure |
| Tenant dağılımı | `topk(10, sum by (incidentId) (promote_success_total))` | Anomali tespiti |

> **Kural:** Baseline toplanmadan alert threshold değiştirilmez. 7 gün sonunda p95 latency + error rate verisiyle SLO tanımlanır.

### 7 Gün Sonrası Karar Noktası

| Durum | Aksiyon |
|-------|---------|
| Tüm metrikler stabil, alert yok | Stage 3 onayı (full rollout kalıcı) |
| Tek tenant anomali | Tenant-level investigation, genel rollout devam |
| Sistemik sorun | Stage düşür veya kill-switch ON |

---

## §7 Bilinen Sınırlamalar (Deploy Scope)

| # | Sınırlama | Etki | Mitigasyon |
|---|-----------|------|------------|
| DS-1 | Drift guard placeholder | Promote istekleri drift kontrolü olmadan kabul edilir | Bilinçli karar — pipeline doğrulaması öncelikli. Manuel diff kontrolü gerekli. |
| DS-2 | Kill-switch alert proxy-based (R3) | Kısa süreli kill-switch'te alert gelmez | `for: 30m` kabul edilebilir, fire drill ile doğrulanır |
| DS-3 | SLO tanımlı değil | Latency rollback kriteri yok | 7 gün baseline → SLO tanımı |
| DS-4 | Audit in-memory Set | Restart'ta duplicate suppression sıfırlanır | Restart sonrası aynı event tekrar yazılabilir — kabul edilebilir |
| DS-5 | promtool/amtool local validation yok | Alert rule syntax CI'da doğrulanmalı | YAML syntax + yapısal doğrulama yapıldı |
| DS-6 | Rate limit canonicalization testi yok (R4) | v1/non-v1 bucket parity formal test yok | acquireToken path-agnostic — code review ile doğrulandı |
| DS-7 | Load karakterizasyonu yapılmadı | Burst/concurrency davranışı prod'da bilinmiyor | Staging'de synthetic burst testi önerilir (bkz. §7.1) |

### §7.1 Staging Synthetic Burst Testi (Önerilen)

Production deploy'dan önce staging'de 15 dakikalık synthetic load testi:

| Senaryo | Açıklama | Beklenen Davranış |
|---------|----------|-------------------|
| SB-1: 10x concurrent promote | 10 paralel promote isteği, aynı incident farklı run'lar | Hepsi 202, idempotency çakışma yok |
| SB-2: Duplicate burst | Aynı (incidentId, runId) ile 50 paralel istek | 1 ACCEPTED + 49 ALREADY_PROMOTED, DB UNIQUE koruması |
| SB-3: Escalation flood | 100 ardışık evaluateEscalation çağrısı, farklı metrik değerleri | CAS retry'lar çalışıyor, conflict metric artıyor, 409 oranı < %5 |
| SB-4: Rate limit saturation | Rate limit threshold'u aşan istek serisi | 429 döner, sonraki istekler bloklanır, metrik artışı doğru |
| SB-5: Kill-switch toggle under load | Aktif trafik varken kill-switch ON/OFF | Geçiş anında 503, sonra normal — partial failure yok |

**Araç:** `autocannon`, `k6`, veya basit `Promise.all` script.

**Başarı kriteri:**
- DB connection pool exhaustion yok
- CAS conflict oranı < %5 (SB-3)
- Idempotency violation yok (SB-2)
- Memory leak belirtisi yok (audit Set büyümesi kontrollü)

> **Not:** Bu test opsiyoneldir ama yüksek önerilir. Yapılmazsa DS-7 riski açık kalır — ilk 24 saat prod gözleminde burst davranışı bilinmez.

---

## §8 Safety Deepening Geçiş Kriterleri

Production stabil olduktan sonra (7 gün gözlem penceresi sonrası) açılacak çalışmalar:

| # | Çalışma | Tetikleyici | Öncelik |
|---|---------|-------------|---------|
| SD-1 | Gerçek snapshot wiring (drift guard aktifleştirme) | Sprint 4 planı | Yüksek |
| SD-2 | P12 property test (audit idempotency) | Opsiyonel — P11 büyük kısmını kapsıyor | Düşük |
| SD-3 | 7.5 opsiyonel testler | Edge case coverage artırma | Düşük |
| SD-4 | promtool/amtool CI gate | CI pipeline güncelleme | Orta |
| SD-5 | `simulation_kill_switch_active` gauge metric | R3 riskini kapatma | Orta |
| SD-6 | SLO tanımı (7 gün baseline sonrası) | Gözlem penceresi tamamlandığında | Yüksek |
| SD-7 | Mutation testing (Stryker) | Test kalitesi ölçümü | Düşük |
