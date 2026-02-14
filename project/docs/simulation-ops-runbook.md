# Simulation API Operasyonel Runbook

> **Amaç:** Simulation API (promote, escalation, scenario ranker) operasyonel prosedürleri, metrik referansları ve incident müdahale rehberi.
> **Durum:** Sprint 3 — Ops Readiness (Task 8.2)
> **Bağımlılıklar:** Sprint 2F (Simulation API base), Sprint 3 (Promote, Escalation Hysteresis, ScenarioRanker, Audit Wiring)

---

## İçindekiler

- [§0 Kritik Uyarılar](#0-kritik-uyarılar)
- [§1 Kill-Switch Prosedürü](#1-kill-switch-prosedürü)
- [§2 Promote Drift Triage](#2-promote-drift-triage)
- [§3 Escalation Misfire Triage](#3-escalation-misfire-triage)
- [§4 Audit Gap Triage](#4-audit-gap-triage)

---

## §0 Kritik Uyarılar

### ⚠️ Simulation Kill-Switch Kapsamı

> **DİKKAT:** `SIMULATION_ENABLED=false` ayarlandığında **tüm mutation endpoint'leri** HTTP 503 döner. Read endpoint'leri etkilenmez.

**Engellenen mutation endpoint'leri (503):**

| Endpoint | Açıklama |
|----------|----------|
| `POST /incidents/:id/simulate` | Simülasyon başlatma |
| `POST /incidents/:id/runs/:runId/export-bundle` | Export bundle |
| `POST /legal-holds/:snapshotId/archive` | Archive |
| `POST /v1/incidents/:id/simulations/:runId/promote` | Promote (Sprint 3) |
| `POST /v1/incidents/:id/simulations/rank` | Scenario ranking (Sprint 3) |
| `POST /v1/incidents/:id/simulations` | v1 alias simulate (Sprint 3) |

**Etkilenmeyen read endpoint'leri:**

| Endpoint | Açıklama |
|----------|----------|
| `GET /v1/incidents/:id/simulations/:runId` | Run detayı |
| `GET /incidents/:id/runs` | Run listesi |
| `GET /incidents/:id/runs/latest` | Son run |
| Tüm GET endpoint'leri | Okuma işlemleri her zaman açık |

### ⚠️ Prometheus Scrape Ön Koşulu

> Bu runbook'taki tüm PromQL sorguları, simulation metriklerinin Prometheus tarafından scrape edilmesini gerektirir. Scrape yoksa alert'ler tetiklenmez.

```yaml
scrape_configs:
  - job_name: 'hukuk-api-simulation'
    scrape_interval: 15s
    metrics_path: '/metrics'
    static_configs:
      - targets: ['<API_HOST>:<API_PORT>']
```

### ⚠️ Metrik Kaynağı

Tüm simulation metrikleri `SimulationMetricsService` tarafından üretilir:

| Metrik | Tip | Labels | Açıklama |
|--------|-----|--------|----------|
| `promote_success_total` | Counter | — | Başarılı promote sayısı |
| `promote_failure_total` | Counter | `reason` | Başarısız promote sayısı |
| `drift_detected_total` | Counter | `incidentId` | Drift tespit edilen promote sayısı |
| `escalation_churn_total` | Counter | `incidentId`, `direction` | Eskalasyon seviye geçişi sayısı |
| `escalation_state_conflict_total` | Counter | — | CAS conflict sayısı |

---

## §1 Kill-Switch Prosedürü

### 1. What it means (Semantik)

Kill-switch, `SIMULATION_ENABLED=false` environment variable'ı ile tüm simulation mutation endpoint'lerini **HTTP 503 Service Unavailable** yanıtı ile reddeden acil müdahale mekanizmasıdır.

**Çalışma prensibi:**
- `SimulationFeatureFlagGuard` request path'ini `MUTATION_PATTERNS` listesine karşı kontrol eder
- Kill-switch aktifken mutation endpoint'leri guard seviyesinde short-circuit edilir — downstream çağrılar yapılmaz
- Belt-and-suspenders: `PromoteService` içinde de `featureFlag.isSimulationEnabled()` kontrolü vardır
- Yanıt body'sinde `SIMULATION_DISABLED` hata kodu döner

**Kullanıcı etkisi:**
- Promote, rank ve simulate istekleri 503 ile reddedilir
- Read endpoint'leri (run listesi, run detayı) çalışmaya devam eder
- Escalation evaluation (cron/background) tetiklenmez


---

### 2. Impact / Blast radius

**Etkilenen:**

| Endpoint | Durum | Yanıt |
|----------|-------|-------|
| `POST /v1/incidents/:id/simulations/:runId/promote` | ❌ Engellenir | HTTP 503 — `SIMULATION_DISABLED` |
| `POST /v1/incidents/:id/simulations/rank` | ❌ Engellenir | HTTP 503 — `SIMULATION_DISABLED` |
| `POST /v1/incidents/:id/simulations` | ❌ Engellenir | HTTP 503 — `SIMULATION_DISABLED` |
| `POST /incidents/:id/simulate` | ❌ Engellenir | HTTP 503 — `SIMULATION_DISABLED` |

**Etkilenmeyen:**

| Endpoint | Durum | Açıklama |
|----------|-------|----------|
| `GET /v1/incidents/:id/simulations/:runId` | ✅ Normal | Run detayı erişilebilir |
| `GET /incidents/:id/runs` | ✅ Normal | Run listesi erişilebilir |
| Tüm read-only endpoint'ler | ✅ Normal | Okuma işlemleri etkilenmez |

**Metrik etkisi:**
- `promote_failure_total{reason="SIMULATION_DISABLED"}` → her reddedilen promote'ta artar (service seviyesinde)
- Diğer simulation metrikleri artmaz (downstream çağrılar yapılmaz)

---

### 3. Immediate actions — Etkinleştirme adımları (max 7 adım)

> ⏱️ **Hedef:** İlk 5 dakika içinde tamamlanmalıdır.

| # | Adım | Detay |
|---|------|-------|
| 1 | **Incident kanalında duyuru yap** | Slack/ops kanalına: "Simulation kill-switch etkinleştiriliyor — neden: `<kısa açıklama>`" |
| 2 | **`SIMULATION_ENABLED=false` env var ayarla** | K8s: ConfigMap/Secret güncellemesi veya deployment env değişikliği |
| 3 | **Pod'ları rolling restart yap** | `kubectl rollout restart deployment/<api-deployment>` |
| 4 | **503 doğrula** | `curl -s -o /dev/null -w "%{http_code}" -X POST https://<API_HOST>/v1/incidents/test/simulations/test/promote` → 503 beklenir |
| 5 | **Read endpoint çalışıyor mu?** | `curl -s -o /dev/null -w "%{http_code}" https://<API_HOST>/incidents/test/runs` → 200 veya 404 (503 olmamalı) |
| 6 | **Metrik doğrula** | PromQL: `increase(promote_failure_total{reason="SIMULATION_DISABLED"}[5m])` artıyor mu? |
| 7 | **Incident log'a kaydet** | Zaman, neden, kim açtı — incident tracking sistemine kayıt |

---

### 4. Deep dive (Araştırma)

#### Tetikleyici sinyaller — Ne zaman kill-switch kullanılmalı?

| # | Sinyal | PromQL / Kontrol | Açıklama |
|---|--------|------------------|----------|
| 1 | **Promote failure spike** | `increase(promote_failure_total[5m]) > 5` | Promote başarısızlık oranı anormal |
| 2 | **Drift spike** | `increase(drift_detected_total[5m]) > 3` | Veri değişimi veya deploy uyumsuzluğu |
| 3 | **Escalation churn** | `increase(escalation_churn_total[15m]) > 4` | Flip-flop — hysteresis config hatası olabilir |
| 4 | **CAS conflict spike** | `increase(escalation_state_conflict_total[5m]) > 2` | Concurrent write contention |
| 5 | **Downstream servis arızası** | Servis health check'leri | Phase 7 veya snapshot store erişilemez |

**Doğrulama PromQL sorguları:**

```promql
# Promote failure rate
increase(promote_failure_total[5m])
```

```promql
# Drift detection rate
increase(drift_detected_total[5m])
```

```promql
# Escalation churn rate
sum(increase(escalation_churn_total[15m]))
```

```promql
# CAS conflict rate
increase(escalation_state_conflict_total[5m])
```

#### Karar kriterleri

| Durum | Karar | Gerekçe |
|-------|-------|---------|
| Promote failure > 5 / 5dk, **sürekli** | Kill-switch **AÇIK** | Sistemik hata — downstream sorun |
| Drift spike > 3 / 5dk, **sürekli** | Kill-switch **AÇIK** | Veri tutarsızlığı — promote güvenli değil |
| CAS conflict > 2 / 5dk | Kill-switch **AÇIK** | DB contention — concurrent evaluation çakışması |
| Escalation churn > 4 / 15dk | İzle, config kontrol et | Hysteresis parametreleri yanlış olabilir |
| Geçici spike (< 5 dk) | İzle, kill-switch **KAPALI** | Geçici anomali normal olabilir |

---

### 5. Rollback / Disable path — Devre dışı bırakma adımları

> Kill-switch'i devre dışı bırakmadan önce **incident'ın çözüldüğünden** emin olun.

| # | Adım | Detay |
|---|------|-------|
| 1 | **Incident kanalında duyuru yap** | "Simulation kill-switch devre dışı bırakılıyor — incident çözüldü" |
| 2 | **`SIMULATION_ENABLED` env var'ı kaldır veya `true` yap** | K8s: ConfigMap/Secret güncellemesi |
| 3 | **Pod'ları rolling restart yap** | `kubectl rollout restart deployment/<api-deployment>` |
| 4 | **Promote doğrula** | Test promote isteği → 503 dönmemeli |
| 5 | **Metrikleri doğrula** | `promote_success_total` artıyor mu? `promote_failure_total{reason="SIMULATION_DISABLED"}` artmıyor mu? |
| 6 | **Incident log'u güncelle** | Kill-switch kapatma zamanı, kim kapattı |

---

### ❌ Yapma Listesi

1. **Kill-switch'i restart olmadan env var değiştirerek devre dışı bırakmaya çalışmayın** — Env var değişikliği pod restart olmadan uygulanmaz.

2. **Kill-switch aktifken read endpoint'leri de kapatmayın** — Read endpoint'leri observability için gereklidir. Run listesi ve detayları incident anında da erişilebilir olmalıdır.

---

### 📋 İlgili Alert

| Alert | Severity | `for` | Açıklama |
|-------|----------|-------|----------|
| `SimulationKillSwitchActive` | warning | 30m | Kill-switch 30 dakikadan fazla aktif — kapatılması unutulmuş olabilir |


---

## §2 Promote Drift Triage

### 1. What it means (Semantik)

Promote drift, simülasyon çalıştırıldığı andaki evidence snapshot ile promote anındaki taze snapshot arasında anlamlı fark tespit edilmesi durumudur. `PromoteService` drift guard'ı, `calculateDrift(stored, fresh)` ile drift skoru hesaplar; skor eşiği aşarsa promote **HTTP 409 DRIFT_DETECTED** ile reddedilir.

**Çalışma prensibi:**
- Promote isteği geldiğinde commit-öncesi canonical snapshot alınır
- Stored evidence snapshot ile taze snapshot karşılaştırılır
- `driftScore >= DRIFT_THRESHOLD` → 409 DRIFT_DETECTED + top contributor listesi
- `driftScore < DRIFT_THRESHOLD` → 202 ACCEPTED + requestId

**Kullanıcı etkisi:**
- Drift tespit edildiğinde promote reddedilir — operatör simülasyonu yeniden çalıştırmalıdır
- Sürekli drift spike, veri kaynağında hızlı değişim veya deploy sonrası uyumsuzluk gösterir

**İlgili metrikler:**

| Metrik | Tip | Labels | Açıklama |
|--------|-----|--------|----------|
| `drift_detected_total` | Counter | `incidentId` | Drift tespit edilen promote sayısı |
| `promote_failure_total` | Counter | `reason` | Başarısız promote sayısı (reason=DRIFT_DETECTED dahil) |
| `promote_success_total` | Counter | — | Başarılı promote sayısı |

---

### 2. Impact / Blast radius

| Senaryo | Etki | Açıklama |
|---------|------|----------|
| **Tek incident drift** | Yalnızca o incident'ın promote'u reddedilir | Diğer incident'lar etkilenmez |
| **Yaygın drift spike** | Birçok incident'ın promote'u reddedilir | Veri kaynağında global değişim veya deploy uyumsuzluğu |
| **False positive drift** | Promote gereksiz yere reddedilir | Drift threshold çok düşük veya snapshot timing sorunu |

**Etkilenen:**

| Endpoint | Durum | Yanıt |
|----------|-------|-------|
| `POST /v1/incidents/:id/simulations/:runId/promote` | ⚠️ 409 ile reddedilir | `DRIFT_DETECTED` + driftScore + topContributors |

**Etkilenmeyen:**

| Endpoint | Durum |
|----------|-------|
| `POST /v1/incidents/:id/simulations` | ✅ Normal — yeni simülasyon başlatılabilir |
| `POST /v1/incidents/:id/simulations/rank` | ✅ Normal — ranking etkilenmez |
| Tüm GET endpoint'leri | ✅ Normal |

---

### 3. Immediate actions (max 7 adım)

> ⏱️ **Hedef:** İlk 5 dakika içinde tamamlanmalıdır.

| # | Adım | Detay |
|---|------|-------|
| 1 | **Drift spike kapsamını belirle** | Tek incident mi, yaygın mı? `sum by (incidentId) (increase(drift_detected_total[5m]))` |
| 2 | **Son deploy zamanını kontrol et** | Deploy sonrası drift spike normal olabilir — deploy zamanı ile örtüşüyor mu? |
| 3 | **Veri kaynağı değişikliği var mı?** | Evidence snapshot'ların bağlı olduğu veri kaynağında güncelleme yapıldı mı? |
| 4 | **Top contributor'ları incele** | 409 response body'sindeki `topContributors` listesi — hangi metrikler drift'e neden oluyor? |
| 5 | **Geçici mi sürekli mi?** | `rate(drift_detected_total[15m])` — 15 dakika sonra hâlâ artıyor mu? |
| 6 | **Geçiciyse: bekle** | Deploy sonrası veya veri güncelleme sonrası geçici drift normal — simülasyonlar yeniden çalıştırılabilir |
| 7 | **Sürekli ise: kill-switch değerlendir** | → §1 Kill-Switch Prosedürü'ne gidin |

---

### 4. Deep dive (Araştırma)

**PromQL sorguları:**

```promql
# Drift detection rate — incident bazında
sum by (incidentId) (rate(drift_detected_total[5m]))
```

```promql
# Promote success vs failure oranı
rate(promote_success_total[5m]) / (rate(promote_success_total[5m]) + rate(promote_failure_total[5m]))
```

```promql
# Drift spike zamanlaması — son 1 saat
increase(drift_detected_total[1h])
```

#### Kök neden analizi

| Olası Neden | Kontrol | Aksiyon |
|-------------|---------|--------|
| **Deploy sonrası veri uyumsuzluğu** | Deploy zamanı ile drift spike örtüşüyor | Geçici — simülasyonları yeniden çalıştır |
| **Veri kaynağı güncellemesi** | Evidence bağımlı veri kaynağında değişiklik | Beklenen — simülasyonları yeniden çalıştır |
| **Snapshot timing sorunu** | Aynı incident için tekrarlayan drift | Snapshot alım zamanlamasını araştır |
| **Drift threshold çok düşük** | Düşük driftScore ile sık 409 | Threshold değerini gözden geçir |

---

### 5. Rollback / Recovery

| Durum | Aksiyon |
|-------|--------|
| Deploy sonrası geçici drift | Simülasyonları yeniden çalıştır — yeni snapshot'lar güncel veriyi yansıtır |
| Veri kaynağı güncellemesi | Simülasyonları yeniden çalıştır |
| Sürekli drift (kök neden belirsiz) | Kill-switch etkinleştir → kök neden analizi → düzelt → kill-switch kapat |
| False positive (threshold çok düşük) | `DRIFT_THRESHOLD` değerini artır (config/env var) → pod restart |

---

### ❌ Yapma Listesi

1. **Drift'i görmezden gelip promote'u zorlamayın** — Drift guard, stale evidence ile production'a geçişi önler. Bypass mekanizması yoktur ve olmamalıdır.

2. **Drift threshold'u 0'a ayarlamayın** — Tüm promote'lar reddedilir.

---

### 📋 İlgili Alert'ler

| Alert | Severity | `for` | Açıklama |
|-------|----------|-------|----------|
| `PromoteFailureRateHigh` | warning | 0m | `promote_failure_total` son 5dk'da > 5 |
| `DriftDetectedSpikeHigh` | warning | 0m | `drift_detected_total` son 5dk'da > 3 |


---

## §3 Escalation Misfire Triage

### 1. What it means (Semantik)

Escalation misfire, eskalasyon seviye geçişlerinin beklenenden sık veya yanlış tetiklenmesi durumudur. İki ana sinyal:

- **Escalation churn (flip-flop):** Seviye geçişleri çok sık — hysteresis ve hold-down mekanizmalarına rağmen L1↔L2↔L3 arası hızlı geçişler
- **CAS conflict spike:** Aynı incident için concurrent escalation evaluation çakışması — `escalation_state` tablosunda optimistic concurrency (version) conflict

**Çalışma prensibi:**
- `evaluateEscalation()` pure function: metrik değerine göre ESCALATE / DEESCALATE / HOLD / ACCUMULATE kararı verir
- Hysteresis band: escalate ve deescalate eşikleri ayrıdır — band içinde seviye değişmez
- Hold-down: seviye geçişi sonrası cooldown süresi — bu sürede yeniden geçiş yapılamaz
- Stable window: de-eskalasyon için ardışık N run veya T dakika boyunca eşik altında kalma koşulu
- CAS: `UPDATE ... WHERE version = $1` — max 2 retry, 3. denemede 409 `ESCALATION_STATE_CONFLICT`

**Kullanıcı etkisi:**
- Churn: Gereksiz eskalasyon/de-eskalasyon bildirimleri — operatör yorgunluğu (alert fatigue)
- CAS conflict: Escalation evaluation geçici olarak başarısız — sonraki evaluation düzeltir

**İlgili metrikler:**

| Metrik | Tip | Labels | Açıklama |
|--------|-----|--------|----------|
| `escalation_churn_total` | Counter | `incidentId`, `direction` (up/down) | Seviye geçişi sayısı |
| `escalation_state_conflict_total` | Counter | — | CAS conflict sayısı (max 2 retry sonrası) |

---

### 2. Impact / Blast radius

| Senaryo | Etki | Açıklama |
|---------|------|----------|
| **Churn (flip-flop)** | Operatör yorgunluğu | Sık seviye geçişi bildirimleri — gerçek eskalasyon sinyali gürültüde kaybolur |
| **CAS conflict** | Geçici evaluation hatası | Sonraki cron cycle düzeltir — kalıcı değilse sorun yok |
| **Sürekli CAS conflict** | Escalation evaluation durur | Concurrent evaluation overlap — cron scheduling sorunu |

**Etkilenen:**

| Bileşen | Durum | Açıklama |
|---------|-------|----------|
| Escalation evaluation | ⚠️ Geçici hata | CAS conflict sonrası retry, 3. denemede 409 |
| Audit log | ⚠️ Eksik kayıt olabilir | CAS conflict'te audit event `ESCALATION_STATE_CONFLICT` yazılır |

**Etkilenmeyen:**

| Bileşen | Durum |
|---------|-------|
| Promote endpoint | ✅ Normal — escalation'dan bağımsız |
| Scenario ranker | ✅ Normal |
| Read endpoint'leri | ✅ Normal |

---

### 3. Immediate actions (max 7 adım)

> ⏱️ **Hedef:** İlk 5 dakika içinde tamamlanmalıdır.

| # | Adım | Detay |
|---|------|-------|
| 1 | **Churn mu, CAS conflict mi?** | `increase(escalation_churn_total[15m])` vs `increase(escalation_state_conflict_total[5m])` — hangisi yüksek? |
| 2 | **Churn ise: incident bazlı kontrol** | `sum by (incidentId) (increase(escalation_churn_total[15m]))` — tek incident mi, yaygın mı? |
| 3 | **Direction dağılımı** | `sum by (direction) (increase(escalation_churn_total[15m]))` — up mu down mu baskın? |
| 4 | **CAS conflict ise: cron overlap kontrol** | Aynı incident için birden fazla evaluation aynı anda mı çalışıyor? |
| 5 | **Metrik kaynağını kontrol et** | Escalation'ı tetikleyen metrik değeri anormal mi? Spike → normal → spike dizisi var mı? |
| 6 | **Hysteresis config kontrol et** | `escalateThreshold`, `deescalateThreshold`, `holdDownMinutes`, `stableWindowRunCount` değerleri uygun mu? |
| 7 | **Durdurulamıyorsa: kill-switch** | → §1 Kill-Switch Prosedürü'ne gidin |

---

### 4. Deep dive (Araştırma)

**PromQL sorguları:**

```promql
# Escalation churn rate — incident bazında
sum by (incidentId, direction) (rate(escalation_churn_total[15m]))
```

```promql
# CAS conflict rate
rate(escalation_state_conflict_total[5m])
```

```promql
# Churn vs conflict karşılaştırma
increase(escalation_churn_total[15m]) / increase(escalation_state_conflict_total[15m])
```

#### Kök neden analizi

| Olası Neden | Kontrol | Aksiyon |
|-------------|---------|--------|
| **Hysteresis band çok dar** | `escalateThreshold` ve `deescalateThreshold` farkı küçük | Band genişliğini artır (fark en az 0.2 olmalı) |
| **Hold-down süresi çok kısa** | `holdDownMinutes` < 10 | Hold-down süresini artır (önerilen: 15-30 dk) |
| **Stable window çok kısa** | `stableWindowRunCount` < 3 veya `stableWindowMinutes` < 5 | Stable window parametrelerini artır |
| **Metrik kaynağı oscillation** | Metrik değeri eşik etrafında salınıyor | Metrik kaynağını smoothing/averaging ile stabilize et |
| **Cron overlap** | Aynı incident için concurrent evaluation | Cron scheduling'i düzelt — distributed lock veya leader election |
| **DB contention** | Yüksek CAS conflict oranı | Connection pool, query performance kontrol et |

#### Hysteresis Config Referans Tablosu

| Parametre | Varsayılan | Açıklama |
|-----------|-----------|----------|
| `escalateThreshold` | 0.8 | Eskalasyon tetikleme eşiği |
| `deescalateThreshold` | 0.6 | De-eskalasyon tetikleme eşiği |
| `stableWindowRunCount` | 5 | Ardışık eşik-altı run sayısı |
| `stableWindowMinutes` | 10 | Stable window minimum süresi (dk) |
| `holdDownMinutes` | 15 | Seviye geçişi sonrası cooldown (dk) |

---

### 5. Rollback / Recovery

| Durum | Aksiyon |
|-------|--------|
| Hysteresis config hatası | Config parametrelerini düzelt → pod restart |
| Cron overlap | Cron scheduling'i düzelt — tek evaluation per incident |
| Metrik oscillation | Metrik kaynağını stabilize et veya threshold'ları ayarla |
| Sürekli CAS conflict | DB contention araştır, connection pool kontrol et |
| Kontrol altına alınamıyor | Kill-switch etkinleştir → kök neden analizi |

---

### ❌ Yapma Listesi

1. **CAS retry sayısını artırmayın** — Max 2 retry (3 toplam deneme) tasarım kararıdır. Artırmak contention'ı gizler, kök nedeni çözmez.

2. **Hysteresis'i devre dışı bırakmayın** — Hysteresis olmadan escalation flip-flop kaçınılmazdır. Parametreleri ayarlayın, mekanizmayı kapatmayın.

3. **Hold-down'u 0'a ayarlamayın** — Cooldown olmadan seviye geçişleri anlık olur — churn patlar.

---

### 📋 İlgili Alert'ler

| Alert | Severity | `for` | Açıklama |
|-------|----------|-------|----------|
| `EscalationChurnHigh` | warning | 0m | `escalation_churn_total` son 15dk'da > 4 |
| `EscalationConflictSpikeHigh` | critical | 0m | `escalation_state_conflict_total` son 5dk'da > 2 |


---

## §4 Audit Gap Triage

### 1. What it means (Semantik)

Audit gap, simülasyon yaşam döngüsü olaylarının (promote, escalation, simulation start/complete/fail) `DiagnosticsAuditService`'e yazılamaması veya eksik yazılması durumudur.

**Çalışma prensibi:**
- `SimulationAuditAdapter` tüm yaşam döngüsü olaylarını `DiagnosticsAuditService.logAccessAttempt`'e delege eder
- In-memory `Set<string>` ile idempotency key hash'i tutulur — duplicate baskılama
- Audit write **fire-and-forget**: try-catch ile sarmalanır, hata business flow'u engellemez
- Audit write hatası → log warning + metrik (varsa), promote/escalation kararı etkilenmez

**Kullanıcı etkisi:**
- Audit gap varsa: RCA (Root Cause Analysis) yapılamaz, abuse pattern görülemez, compliance ihlali olabilir
- False positive hysteresis kanıtlanamaz
- Forensic iz eksik kalır

**İlgili audit event type'ları:**

| Event Type | Tetikleyici |
|------------|-------------|
| `PROMOTE_ACCEPTED` | Başarılı promote |
| `PROMOTE_DRIFT_BLOCKED` | Drift nedeniyle reddedilen promote |
| `ESCALATION_TRIGGERED` | Eskalasyon seviye yükseltme |
| `DEESCALATION_TRIGGERED` | Eskalasyon seviye düşürme |
| `ESCALATION_STATE_CONFLICT` | CAS conflict (max retry sonrası) |
| `SIMULATION_STARTED` | Simülasyon başlatma |
| `SIMULATION_COMPLETED` | Simülasyon tamamlanma |
| `SIMULATION_FAILED` | Simülasyon hata |

---

### 2. Impact / Blast radius

| Senaryo | Etki | Açıklama |
|---------|------|----------|
| **Tek event eksik** | Kısmi forensic iz | Belirli bir olayın kaydı yok — RCA zorlaşır |
| **Yaygın audit gap** | Forensic iz tamamen eksik | Compliance ihlali riski — tüm olaylar kayıp |
| **Idempotency Set overflow** | Memory pressure | In-memory Set büyürse GC pressure artabilir (Sprint 3 scope — Phase 9'da DB'ye taşınır) |

**Etkilenen:**

| Bileşen | Durum | Açıklama |
|---------|-------|----------|
| Audit log | ⚠️ Eksik kayıt | Fire-and-forget — hata sessizce yutulur |
| RCA capability | ⚠️ Azalır | Eksik audit = eksik forensic iz |

**Etkilenmeyen:**

| Bileşen | Durum |
|---------|-------|
| Promote endpoint | ✅ Normal — audit hatası promote'u engellemez |
| Escalation evaluation | ✅ Normal — audit hatası kararı etkilemez |
| Tüm endpoint'ler | ✅ Normal — fire-and-forget semantiği |

---

### 3. Immediate actions (max 7 adım)

> ⏱️ **Hedef:** İlk 10 dakika içinde tamamlanmalıdır.

| # | Adım | Detay |
|---|------|-------|
| 1 | **Audit gap kapsamını belirle** | Hangi event type'lar eksik? Promote audit var mı, escalation audit var mı? |
| 2 | **DiagnosticsAuditService durumunu kontrol et** | Ring buffer dolu mu? Servis ayakta mı? |
| 3 | **Application loglarını kontrol et** | `SimulationAuditAdapter` warning logları var mı? (fire-and-forget catch bloğu) |
| 4 | **Memory kullanımını kontrol et** | In-memory idempotency Set büyümüş mü? Pod memory pressure var mı? |
| 5 | **Son deploy zamanını kontrol et** | Deploy sonrası audit gap normal olabilir — pod restart ile Set sıfırlanır |
| 6 | **Promote/escalation metrikleri ile cross-check** | `promote_success_total` artıyor ama audit kaydı yoksa → audit gap kesin |
| 7 | **Acil değilse: izle** | Audit gap business flow'u engellemez — kök neden analizi yapılabilir |

---

### 4. Deep dive (Araştırma)

**Cross-check PromQL sorguları:**

```promql
# Promote success rate — audit ile karşılaştırma baseline'ı
rate(promote_success_total[5m])
```

```promql
# Escalation churn rate — audit ile karşılaştırma baseline'ı
sum(rate(escalation_churn_total[5m]))
```

> **Not:** Sprint 3'te audit event count için ayrı bir Prometheus metriği yoktur. Audit gap tespiti, promote/escalation metrikleri ile audit log kayıt sayısının cross-check'i ile yapılır. Sprint 4'te `audit_event_written_total` counter'ı eklenebilir.

#### Kök neden analizi

| Olası Neden | Kontrol | Aksiyon |
|-------------|---------|--------|
| **DiagnosticsAuditService hatası** | Servis logları, ring buffer durumu | Servisi restart et veya ring buffer'ı temizle |
| **Memory pressure** | Pod memory kullanımı, GC logları | Pod resource limit'lerini artır |
| **Idempotency Set büyümesi** | Uzun süredir restart olmamış pod | Pod restart — Set sıfırlanır |
| **Fire-and-forget exception** | Application loglarında warning | Exception kaynağını araştır |

---

### 5. Rollback / Recovery

| Durum | Aksiyon |
|-------|--------|
| DiagnosticsAuditService hatası | Servisi restart et |
| Memory pressure | Pod restart veya resource limit artır |
| Idempotency Set overflow | Pod restart (Set sıfırlanır) |
| Sürekli audit gap | Kök neden analizi — DiagnosticsAuditService'i araştır |

> **Önemli:** Audit gap, business flow'u engellemez. Acil müdahale gerektirmez ancak compliance açısından kök neden çözülmelidir.

---

### ❌ Yapma Listesi

1. **Audit write'ı senkron yapmayın** — Fire-and-forget tasarım kararıdır. Senkron audit, promote ve escalation latency'sini artırır ve hata durumunda business flow'u engeller.

2. **Audit gap nedeniyle kill-switch etkinleştirmeyin** — Audit gap operasyonel bir sorun değildir, forensic bir sorundur. Kill-switch yalnızca business flow sorunları için kullanılmalıdır.

---

### 📋 İlgili Alert

| Alert | Severity | `for` | Açıklama |
|-------|----------|-------|----------|
| — | — | — | Sprint 3'te audit-specific alert yoktur. Cross-check ile tespit edilir. Sprint 4'te `AuditEventDropped` alert'i eklenebilir. |

---

## İlgili Dosyalar

| Dosya | Konum | Açıklama |
|-------|-------|----------|
| Alert rules | `ops/prometheus/simulation-alerts.yml` | 5 alert kuralı (Sprint 3) |
| Alertmanager config | `ops/alertmanager/alertmanager.yml` | Route tree — `component=simulation` |
| Metrics service | `apps/api/src/.../simulation-metrics.service.ts` | Prometheus counter'ları |
| Feature flag guard | `apps/api/src/.../guards/simulation-feature-flag.guard.ts` | Kill-switch guard |
| Feature flag service | `apps/api/src/.../simulation-feature-flag.service.ts` | `SIMULATION_ENABLED` env var |
| Audit adapter | `apps/api/src/.../simulation-audit.adapter.ts` | Audit wiring |
| Promote service | `apps/api/src/.../promote.service.ts` | Promote pipeline |
| Escalation hysteresis | `apps/api/src/.../escalation-hysteresis.ts` | Hysteresis pure function |
| Ops runbook (bu dosya) | `docs/simulation-ops-runbook.md` | Bu dosya |
