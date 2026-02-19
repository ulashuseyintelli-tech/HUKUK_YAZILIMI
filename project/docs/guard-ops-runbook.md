# Guard Operasyon Runbook

Operational Guard Phase — promote/evaluate pipeline koruma katmanı.

İlgili alert kuralları: `ops/prometheus/guard-alerts.yml` (A1–A5, A8/A8e, A9)
İlgili metrikler: `SimulationMetricsService` (guard tripwire metrics + drift guard metrics)

---

## CAS Conflict Storm

**Alert:** `GuardCASConflictStorm` (A1, severity: warning)

### Belirtiler
- `rate(escalation_state_conflict_total[5m])` eşiği aşıyor
- Escalation state CAS retry sayısı artıyor
- Evaluate pipeline latency artışı

### Olası Nedenler
1. Aynı incident için concurrent escalation evaluation (cron overlap)
2. DB connection pool tükenmesi → retry storm
3. Yüksek trafik altında write contention

### Aksiyon Adımları
1. `escalation_state_conflict_total` rate grafiğini kontrol edin
2. Concurrent cron job'ları kontrol edin — overlap varsa cron schedule'ı ayarlayın
3. DB connection pool kullanımını kontrol edin
4. Gerekirse guard degrade mode'u aktive edin:
   - Config: `tenantOverrides[tenantId].degradeModeActive = true`
   - Bu, PROMOTE/EVALUATE operasyonlarını HOLD'a zorlar

### Eskalasyon
- 5 dakikadan fazla devam ederse → DB team'e eskalasyon
- Connection pool tükenmesi varsa → infra team

---

## DB Timeout Spike

**Alert:** `GuardDBTimeoutSpike` (A2, severity: critical)

### Belirtiler
- `rate(db_write_timeout_total[5m])` eşiği aşıyor
- Pipeline response time artışı
- 503 hata oranı artışı (kill-switch tetiklenirse)

### Olası Nedenler
1. Disk I/O saturasyonu
2. Lock contention (uzun süren transaction'lar)
3. Connection pool exhaustion
4. DB replica lag (read timeout'lar için)

### Aksiyon Adımları
1. `db_write_timeout_total` ve `db_read_timeout_total` rate'lerini kontrol edin
2. DB slow query log'larını inceleyin
3. Active connection sayısını kontrol edin
4. Ciddi ise kill-switch ile hard block uygulayın:
   - Config: `tenantOverrides[tenantId].killSwitchActive = true`
   - Bu, tüm istekleri 503 ile reddeder (DB'ye dokunmaz)
5. Root cause çözüldükten sonra kill-switch'i kapatın

### Eskalasyon
- Immediate: DBA team'e eskalasyon
- 10 dakikadan fazla devam ederse → incident açın

---

## Clock Skew Breach

**Alert:** `GuardClockSkewBreach` (A3, severity: warning)

### Belirtiler
- `clock_skew_compensated_ms` p99 > 500ms
- Guard kararlarında STALE_FAILSAFE mode artışı
- Evaluate path HOLD oranı artışı

### Olası Nedenler
1. NTP senkronizasyon hatası
2. Container clock drift (VM migration sonrası)
3. Cross-region latency (multi-region deployment)

### Aksiyon Adımları
1. `clock_skew_compensated_ms` histogram'ını kontrol edin
2. NTP daemon durumunu kontrol edin: `timedatectl status`
3. Container runtime clock sync'i doğrulayın
4. Gerekirse evaluate path'i degrade mode'a alın
5. Clock skew düzeldikten sonra guard config'i normal'e döndürün

### Eskalasyon
- Infra team'e NTP/clock sync sorunu olarak eskalasyon

---

## Alert Fire Latency

**Alert:** `GuardAlertFireLatencyBreach` (A4, severity: critical — paging)

### Belirtiler
- `alert_fire_latency_seconds` > 2× evaluation interval (120s)
- Alert'ler gecikmeli tetikleniyor
- Monitoring blind spot riski

### Olası Nedenler
1. Prometheus rule evaluation yavaşlaması
2. Alertmanager queue backlog
3. Notification channel (Slack/PagerDuty) rate limiting
4. Prometheus storage I/O sorunu

### Aksiyon Adımları
1. Prometheus rule evaluation duration'ı kontrol edin
2. Alertmanager queue durumunu kontrol edin
3. Notification channel health'i doğrulayın
4. Prometheus TSDB compaction durumunu kontrol edin

### Eskalasyon
- Immediate: SRE/platform team'e eskalasyon
- Bu alert tetiklendiğinde diğer alert'ler de gecikmiş olabilir

---

## Kill-Switch Management

**Alert:** `GuardKillSwitchEnabled` (A5, severity: info)

### Belirtiler
- `kill_switch_state == 1` — bir veya daha fazla tenant/operation için aktif
- Tüm istekler 503 ile reddediliyor (ilgili tenant/operation için)

### Kullanım Senaryoları
- Acil incident müdahalesi: DB corruption, data leak riski
- Planlı bakım: migration, schema change
- Canary rollout: yeni tenant'lar için kademeli açılış

### Aksiyon Adımları
1. Kill-switch'in neden aktive edildiğini kontrol edin (incident ticket)
2. Root cause çözüldüyse kill-switch'i kapatın:
   - Config: `tenantOverrides[tenantId].killSwitchActive = false`
3. Kill-switch kapatıldıktan sonra `kill_switch_state` gauge'ın 0'a düştüğünü doğrulayın
4. Pipeline'ın normal çalıştığını doğrulayın (promote/evaluate success rate)

### Dikkat
- Kill-switch kısa süreli incident müdahalesi için tasarlanmıştır
- 30 dakikadan fazla aktif kalması → alert tetiklenir
- Uzun süreli devre dışı bırakma için degrade mode tercih edin


---

## Canary Rollout Prosedürü

Guard sisteminin production'da kademeli aktive edilmesi. Per-tenant üç modlu kontrol: `disabled` → `shadow` → `enforce`.

### Pilot Tenant Seçim Kriterleri

Aşağıdaki 4 kriter ile 3–5 tenant seçilir:

1. **Orta trafik**: Çok düşük trafik sinyal üretmez; çok yüksek trafik riskli. Hedef: günlük request sayısı medyanın %25–%75 bandında.
2. **Temsil kabiliyeti**: En az 1–2 farklı dependency profile (DB yoğun vs CPU yoğun tenant).
3. **Düşük business kritikliği**: İlk 48 saat için düşük blast-radius — test/staging benzeri veya düşük gelir etkili tenant.
4. **İyi gözlemlenebilirlik**: Tenant'ın request tracing ve metrics coverage'ı tam (distributed tracing aktif, custom metrics emit ediyor).

**Pilot tenant aday sorgusu (referans):**

```sql
-- Son 7 günde orta trafik bandındaki tenant'ları listele
-- Gerçek tablo/kolon adlarını ortamınıza göre uyarlayın
SELECT
  tenant_id,
  COUNT(*) AS request_count_7d,
  NTILE(4) OVER (ORDER BY COUNT(*)) AS traffic_quartile
FROM request_log
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY tenant_id
HAVING NTILE(4) OVER (ORDER BY COUNT(*)) IN (2, 3)  -- Q2–Q3 bandı
ORDER BY request_count_7d DESC;
```

Sorgu sonucundan business kritikliği düşük + observability tam olan 3–5 tenant seçilir.

### Aşama 0 — Hazırlık (disabled)

Tüm tenant'lar `globalGuardMode: 'disabled'` ile başlar. Guard sistemi wired ama zero compute — hiç snapshot üretilmez, hiç telemetry emit edilmez.

**Kontrol listesi:**
- [ ] Tüm guard testleri yeşil (296+ test)
- [ ] Grafana dashboard erişilebilir
- [ ] Alert kuralları (A1–A7) yüklü
- [ ] Promote gate stat paneli görünür (5 kriter)
- [ ] Kill-switch erişimi ops ekibinde hazır
- [ ] Pilot tenant listesi belirlenmiş (3–5 adet)

### Aşama 1 — Pilot Tenant Shadow

Pilot tenant'lar `shadow` moduna alınır (3–5 tenant).

```json
{
  "tenantOverrides": {
    "pilot-tenant-1": { "guardMode": "shadow" },
    "pilot-tenant-2": { "guardMode": "shadow" },
    "pilot-tenant-3": { "guardMode": "shadow" }
  }
}
```

**Aktivasyon sonrası doğrulama (ilk 15 dakika):**
- [ ] `guard_decision_total{guardMode="shadow"}` metriği görünür
- [ ] `guard_shadow_would_enforce_total` metriği görünür
- [ ] `guard_snapshot_duration_seconds_bucket{guardMode="shadow"}` metriği görünür (A7 gate'i buna bağlı)
- [ ] Pipeline response time'da anlamlı artış yok (< 15ms p99 overhead — pilot eşiği)
- [ ] Hata oranında artış yok

**48 saat gözlem kontrol listesi:**
- [ ] wouldEnforce rate ≤ %10 (pilot eşiği)
- [ ] Latency overhead ≤ 15ms p99 (pilot eşiği)
- [ ] A1–A7 alert yok
- [ ] Pipeline success rate delta < %0.1

**İlk 10 dakika notu (warm-up):**
SignalWindowEngine window boyutu (default 300s) nedeniyle ilk 5–10 dakika sinyal verisi yetersiz olabilir. Bu sürede wouldEnforce oranı yüksek çıkabilir — bu beklenen davranıştır. İlk 10 dakikayı KPI değerlendirmesinden hariç tutun.

**Config propagation delay notu:**
Config provider cache'li ise (örn. 60s TTL), guardMode değişikliği ±60s gecikmeyle yansıyabilir. Bu kritik değildir ama ops ekibi rollout anında bu gecikmeyi bilmelidir. StaticGuardConfigProvider (test/dev) per-request'tir, cache yoktur.

**wouldEnforce yüksekse olası nedenler:**
1. Threshold/allowlist tuning gerekiyor (eşikler çok sıkı)
2. Sinyal staleness sorunu (signal provider stale veri raporluyor)
3. Sinyal kalibrasyon hatası (casConflictRate/dbTimeoutRate gerçek olmayan yüksek değer üretiyor — provider'ın veri kaynağını doğrulayın)

**Latency yüksekse olası nedenler:**
1. Signal provider hot path optimizasyonu gerekiyor (cache, batch)
2. Config provider yavaş (config fetch süresi)
3. SignalWindowEngine hesaplama karmaşıklığı (window boyutu küçültme)

### Aşama 2 — Grup Shadow

Pilot başarılı ise tenant grubu shadow'a alınır.

**Kontrol listesi:**
- [ ] Pilot tenant 48 saat sorunsuz
- [ ] wouldEnforce rate < %5 (shadow'da enforce edilseydi oranı)
- [ ] A1–A5 alert'lerden hiçbiri tetiklenmemiş
- [ ] Latency overhead < 10ms p99

### Aşama 3 — Pilot Enforce (Promote Gate)

Pilot tenant `enforce` moduna geçirilir. Bu adım promote gate kriterlerini gerektirir.

```json
{
  "tenantOverrides": {
    "pilot-tenant": { "guardMode": "enforce" }
  }
}
```

**Promote gate kriterleri (tümü sağlanmalı):**
- [ ] Shadow'da wouldEnforce rate ≤ %5 (son 48 saat)
- [ ] Shadow'da latency overhead ≤ 10ms p99
- [ ] A1–A5 alert yok (son 48 saat)
- [ ] A6 drift alert yok (son 48 saat)
- [ ] A7 latency alert yok (son 48 saat)
- [ ] Shadow telemetry'de beklenmeyen karar paterni yok
- [ ] Dashboard promote gate paneli: 5/5 PASS

**Kontrol listesi:**
- [ ] Enforce sonrası pipeline success rate stabil
- [ ] HOLD/BLOCK_503 oranı beklenen aralıkta
- [ ] 48 saat gözlem süresi

### Aşama 4 — Global Enforce

Tüm tenant'lar enforce moduna geçirilir.

```json
{
  "globalGuardMode": "enforce"
}
```

### Rollback Prosedürü (NR-8: Anında, Stateless, Config-Only)

Guard mode geçişleri anında ve stateless'tır. Restart gerekmez.

**Tenant bazlı rollback:**
```json
{
  "tenantOverrides": {
    "problem-tenant": { "guardMode": "shadow" }
  }
}
```

**Global rollback:**
```json
{
  "globalGuardMode": "shadow"
}
```

**Acil rollback (zero compute):**
```json
{
  "globalGuardMode": "disabled"
}
```

### KPI Gate Tablosu — Aşama Bazlı Eşikler

Production adoption sprint: `pilot → group2 → group3 → global` kademeli geçiş.
Her aşamada promote gate kriterleri sağlanmalı. Eşikler aşama ilerledikçe sıkılaşır.

| KPI | Pilot Shadow | Grup Shadow | Pilot Enforce | Global Enforce |
|-----|-------------|-------------|---------------|----------------|
| wouldEnforce rate | ≤ %10 | ≤ %5 | — | — |
| Gerçek enforce (HOLD+BLOCK) rate | — | — | ≤ %5 | ≤ %3 |
| Latency overhead p99 | ≤ 15ms | ≤ 10ms | ≤ 10ms | ≤ 10ms |
| A1–A5 alert (son N saat) | 0 (48h) | 0 (48h) | 0 (24h) | 0 (72h) |
| A6 drift alert | 0 (48h) | 0 (48h) | — | — |
| A7 latency alert | 0 (48h) | 0 (48h) | 0 (24h) | 0 (72h) |
| Gözlem süresi | 48 saat | 48 saat | 24 saat | 72 saat |
| Pipeline success rate delta | < %0.1 düşüş | < %0.1 düşüş | < %0.5 düşüş | < %0.1 düşüş |

**Aşama geçiş kuralları:**

1. **Pilot Shadow → Grup Shadow**: Pilot tenant 48 saat sorunsuz, tüm KPI'lar sağlanıyor
2. **Grup Shadow → Pilot Enforce**: Tüm grup tenant'ları 48 saat sorunsuz, wouldEnforce ≤ %5
3. **Pilot Enforce → Global Enforce**: Pilot tenant 24 saat enforce'da sorunsuz, gerçek enforce rate ≤ %5
4. **Global Enforce**: Tüm tenant'lar 72 saat enforce'da sorunsuz, gerçek enforce rate ≤ %3

**Rollback trigger'ları (herhangi biri tetiklenirse anında rollback):**

| Trigger | Aksiyon |
|---------|---------|
| wouldEnforce rate > %15 (shadow) | shadow → disabled, root cause araştır |
| Gerçek enforce rate > %10 (enforce) | enforce → shadow |
| Latency p99 > 20ms | mevcut aşama → önceki aşama |
| Herhangi A1–A5 critical alert | enforce → shadow (veya disabled) |
| Pipeline success rate > %1 düşüş | enforce → shadow |
| A6 drift alert 30dk+ devam | shadow'da kal, promote erteleme |
| A7 latency alert 30dk+ devam | shadow'da kal, promote erteleme |

**Haftalık rapor formatı (shadow vs enforce):**

```
Hafta: [tarih aralığı]
Aşama: [pilot shadow / grup shadow / pilot enforce / global enforce]
Tenant sayısı: [shadow: N, enforce: M, disabled: K]
wouldEnforce rate: [%X.XX] (hedef: ≤ %5)
Gerçek enforce rate: [%X.XX] (hedef: ≤ %3)
Latency p99: [Xms] (hedef: ≤ 10ms)
Alert sayısı: [0]
Pipeline success rate: [%99.XX]
Sonraki adım: [promote / bekle / rollback]
```

### Kill-Switch vs Mode Rollback Farkı

| Özellik | Kill-Switch | Mode Rollback |
|---------|-------------|---------------|
| Etki | Tüm istekleri 503 ile reddet | Guard compute'u kapat/shadow'a al |
| Pipeline | Tamamen durur | Normal çalışır |
| Kullanım | Acil incident (DB corruption vb.) | Guard sistemi sorunlu |
| Geri dönüş | `killSwitchActive: false` | `guardMode: 'shadow'` veya `'disabled'` |
| Restart | Gerekmez | Gerekmez |


---

## Drift Triage

**Alert:** `GuardDriftDetectedShadow` (A8, severity: warning) / `GuardDriftDetectedEnforce` (A8e, severity: critical)

### Belirtiler
- `simulation_drift_total` artış gösteriyor
- Shadow modda: wouldEnforce=true telemetry, trafik kesilmez
- Enforce modda: BLOCK_503 + DRIFT_BLOCKED, trafik aktif olarak kesiliyor

### Drift Tipleri ve Kaynakları

| DriftType | Anlam | Olası Kaynak |
|-----------|-------|-------------|
| SCHEMA | expectedSchemaVersion ≠ actualSchemaVersion | DB migration uyumsuzluğu, rolling deploy sırasında schema farkı |
| RULESET | expectedRuleHash ≠ actualRuleHash | Rule engine config değişikliği, stale cache |
| CONFIG | expectedConfigRevision ≠ actualConfigRevision | Config store güncelleme, propagation delay |
| CARRIER_WRITE | writeCount > 1 | Write-once invariant ihlali, duplicate write bug |

### Aksiyon Adımları

1. `simulation_drift_total` by `type` label'ını kontrol edin — hangi drift tipi?
2. Drift tipine göre expected vs actual kaynağını doğrulayın:
   - SCHEMA: DB migration durumunu kontrol edin (`SELECT version FROM schema_migrations`)
   - RULESET: Rule engine config hash'ini karşılaştırın
   - CONFIG: Config store revision'ını kontrol edin
   - CARRIER_WRITE: Son write log'larını inceleyin
3. Drift kaynağı bulunana kadar:
   - Shadow modda: izlemeye devam edin, enforce'a geçmeyin
   - Enforce modda: `driftGuardEnabled: false` ile drift guard'ı devre dışı bırakın

### Devre Dışı Bırakma (Acil)

```json
{
  "tenantOverrides": {
    "<tenant-id>": { "driftGuardEnabled": false }
  }
}
```

Restart gerekmez. Config propagation delay'e dikkat (cache TTL kadar gecikme olabilir).

### Eskalasyon
- Shadow + 30dk devam → config/deploy team'e eskalasyon
- Enforce + herhangi bir drift → anında incident, driftGuardEnabled=false ile devre dışı bırak

---

## Drift Provider Error

**Alert:** `GuardDriftProviderError` (A9, severity: warning)

### Belirtiler
- `drift_provider_errors_total` artış gösteriyor
- reasonCodes'ta `DRIFT_PROVIDER_ERROR` görünüyor
- Shadow modda: trafik kesilmez ama drift guard fail-closed (BLOCK_503 kararı verilir, shadow swallow eder)
- Enforce modda: trafik kesiliyor (BLOCK_503 + DRIFT_PROVIDER_ERROR)

### Olası Nedenler
1. Config store erişim hatası (network, auth, timeout)
2. DriftInputProvider implementasyon bug'ı (null pointer, parse error)
3. Dependency injection hatası (provider doğru wire edilmemiş)

### Aksiyon Adımları

1. Provider log'larını kontrol edin — exception stack trace
2. Config store / header source erişilebilirliğini doğrulayın
3. Provider'ın bağımlılıklarını kontrol edin (DB connection, external service)
4. Gerekirse drift guard'ı devre dışı bırakın:
   ```json
   { "tenantOverrides": { "<tenant-id>": { "driftGuardEnabled": false } } }
   ```

### Metric Ayrımı
- `drift_provider_errors_total` = provider erişim hatası (pipeline health)
- `simulation_drift_total` = structural drift tespit (config drift)
- Bu iki metric birbirinden bağımsızdır. Provider error structural drift metriğine dahil edilmez.

### Eskalasyon
- 5dk devam → backend team'e eskalasyon
- Enforce modda → anında driftGuardEnabled=false, sonra root cause


---

## Shadow Pilot — Daily Ops Checklist

Tek sayfalık operasyonel kontrol listesi. Shadow pilot süresince sabah ve akşam uygulanır.

### Değişkenler

| Parametre | Değer |
|-----------|-------|
| Mode | `shadow` (downgrade aktif, enforce kapalı) |
| Flag | `driftGuardEnabled: true` |
| Kill-switch | hazır, runbook prosedürü doğrulanmış |
| Rollback | `driftGuardEnabled: false` veya kill-switch ON (hangisi daha hızlıysa) |

---

### Sabah Kontrolü (09:00)

| # | Metrik / Sorgu | Beklenen | Aksiyon (ihlal durumunda) |
|---|---------------|----------|--------------------------|
| S1 | `rate(simulation_drift_total[5m])` | 0 veya çok düşük (< 0.01/s) | Drift tipi incele → Drift Triage bölümüne git |
| S2 | `rate(drift_provider_errors_total[5m])` | 0 | Provider log'larını kontrol et → Provider Error bölümüne git |
| S3 | `sum(increase(simulation_drift_total[12h]))` | 0 (gece boyunca toplam) | > 0 ise: hangi type label? Deterministik mi yoksa spike mı? |
| S4 | `sum(increase(drift_provider_errors_total[12h]))` | 0 (gece boyunca toplam) | > 0 ise: provider health kontrol, dependency erişilebilirliği |
| S5 | `guard_shadow_would_enforce_total` (son 12h trend) | Stabil veya azalan | Artış trendi → threshold/allowlist tuning gerekebilir |
| S6 | `guard_snapshot_duration_seconds` p99 | < 15ms (pilot eşiği) | Yüksekse → signal provider / config provider performans kontrolü |
| S7 | HTTP 503 toplam (NR-3 uyumu) | Beklenmeyen artış yok | Artış varsa → kill-switch veya guard kaynaklı mı ayırt et |

**Go / No-Go kararı (sabah):**
- S1–S4 hepsi 0 + S5 stabil + S6 eşik altı + S7 sürpriz yok → ✅ GO, pilot devam
- Herhangi biri ihlal → ⚠️ triage başlat, gerekirse rollback

---

### Akşam Kontrolü (18:00)

| # | Metrik / Sorgu | Beklenen | Aksiyon (ihlal durumunda) |
|---|---------------|----------|--------------------------|
| A1 | `sum(increase(simulation_drift_total[9h]))` | 0 (gün içi toplam) | > 0 ise: drift event'leri triage et, deterministik mi? |
| A2 | `sum(increase(drift_provider_errors_total[9h]))` | 0 | > 0 ise: root cause belirle, tekrarlayan mı? |
| A3 | `simulation_drift_total` by `type` label dağılımı | Boş veya tek tip | Birden fazla type → config/schema/ruleset ayrı ayrı incele |
| A4 | wouldEnforce rate trendi (gün içi) | ≤ %10 (pilot eşiği) | > %10 → threshold tuning, promote erteleme |
| A5 | A8/A8e/A9 alert fire sayısı (gün içi) | 0 | > 0 ise: alert detaylarını incele, false positive mı? |
| A6 | Latency p99 trendi (gün içi) | < 15ms, stabil | Artış trendi → sonraki gün dikkatle izle |

**Gün sonu değerlendirme:**
- Tüm metrikler temiz → ✅ pilot devam, ertesi gün sabah kontrolüne geç
- Drift event var ama deterministik + triage edilebilir → ⚠️ root cause fix planla, pilot devam
- Spike veya açıklanamayan anomali → 🛑 rollback değerlendir

---

### Faz Geçiş Takvimi

| Faz | Süre | Kapsam | Çıkış Kriteri |
|-----|------|--------|---------------|
| T0 — Deploy + Gözlem | 30–60 dk | Canary: 1 tenant / ~%1 trafik | S1–S7 hepsi temiz |
| T+1 — Go / No-Go | 24 saat | Aynı kapsam | Provider error düşük/stabil, drift deterministik, 503 sürpriz yok |
| T+2–T+7 — Genişletme | Her adımda ≥ 24 saat | %1 → %5 → %10 → tüm tenantlar (shadow) | Her adımda sabah/akşam checklist temiz |
| T+7 — Shadow Çıktı Raporu | — | Tüm shadow verisi | Top drift reasons, provider error dağılımı, enforce hazırlık kararı |

**Rollback trigger'ları (herhangi fazda):**

| Durum | Aksiyon |
|-------|---------|
| `drift_provider_errors_total` spike | `driftGuardEnabled: false` veya kill-switch ON |
| Structural drift fırtınası (açıklanamayan) | `driftGuardEnabled: false` |
| Beklenmeyen 503 artışı | Kill-switch kontrol, guard kaynaklı ise rollback |
| wouldEnforce > %15 | Shadow → disabled, root cause araştır |

---

### Enforce'a Geçiş Minimum Barajı

Shadow pilot sonunda enforce kararı için aşağıdaki tüm kriterler sağlanmalıdır:

| Kriter | Eşik |
|--------|------|
| Wide shadow süresi | ≥ 7 gün (tüm tenantlar shadow) |
| Structural drift spike | 0 veya hepsi fixlenmiş |
| Provider errors | Rare + explainable (tekrarlayan root cause yok) |
| Runbook exercised | En az 1 gerçek vaka ile işletilmiş |
| wouldEnforce rate | ≤ %5 (son 48 saat) |
| Latency overhead p99 | ≤ 10ms (son 48 saat) |
| A8/A8e/A9 alert | 0 (son 7 gün) |

Tüm kriterler sağlanmadan enforce'a geçilmez.

---

### Shadow Çıktı Raporu Şablonu (T+7)

```
Shadow Pilot Raporu — [tarih aralığı]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Kapsam: [tenant sayısı] tenant, [gün] gün shadow
Toplam request: [N]

Structural Drift:
  - Toplam event: [N]
  - Tip dağılımı: SCHEMA=[N], RULESET=[N], CONFIG=[N], CARRIER_WRITE=[N]
  - Top 3 root cause: [açıklama]
  - Fix durumu: [hepsi fixlendi / N adet açık]

Provider Error:
  - Toplam event: [N]
  - Root cause dağılımı: [açıklama]
  - Tekrarlayan root cause: [var/yok]

Performans:
  - Latency p99: [X]ms (hedef: ≤ 10ms)
  - wouldEnforce rate: %[X.XX] (hedef: ≤ %5)

Alert Geçmişi:
  - A8 (shadow drift): [N] kez
  - A9 (provider error): [N] kez

Karar: [ ] Enforce'a hazır  [ ] Ek shadow gerekli  [ ] Rollback
Gerekçe: [açıklama]
```

### Shadow Çıktı Raporu — Örnek (Simülasyon)

Aşağıdaki rapor gerçek verilerle değil, beklenen senaryo ile doldurulmuştur.
Gerçek sayılar gelince bu şablonun kopyası üzerinden doldurulur.

```
Shadow Pilot Raporu — 2026-02-18 / 2026-02-25
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Kapsam: 12 tenant, 7 gün shadow
Toplam request: 184.320

Structural Drift:
  - Toplam event: 3
  - Tip dağılımı: SCHEMA=0, RULESET=1, CONFIG=2, CARRIER_WRITE=0
  - Top 3 root cause:
    1. CONFIG×2: T+2 günü config store propagation delay (cache TTL=60s,
       deploy sırasında 2 request eski revision gördü). Deterministik, beklenen.
    2. RULESET×1: T+4 günü rule engine hot-reload sırasında 1 request
       eski hash ile eşleşti. Tek seferlik, tekrarlamadı.
  - Fix durumu: Hepsi açıklandı, root cause fix gerekmez (transient)

Provider Error:
  - Toplam event: 1
  - Root cause dağılımı: Config store timeout (T+3, 09:14 UTC, 1.2s spike)
  - Tekrarlayan root cause: Yok (tek seferlik network blip)

Performans:
  - Latency p99: 6.8ms (hedef: ≤ 10ms) ✅
  - wouldEnforce rate: %1.6 (hedef: ≤ %5) ✅

Alert Geçmişi:
  - A8 (shadow drift): 1 kez (T+2, CONFIG drift, 5m içinde resolve)
  - A8e (enforce drift): 0 kez
  - A9 (provider error): 1 kez (T+3, timeout, 5m içinde resolve)

Enforce Barajı Kontrolü:
  ✅ Wide shadow süresi: 7 gün
  ✅ Structural drift spike: 0 (3 event hepsi transient, açıklandı)
  ✅ Provider errors: 1 (rare + explainable)
  ✅ Runbook exercised: T+2 drift triage, T+3 provider error triage
  ✅ wouldEnforce rate: %1.6 ≤ %5
  ✅ Latency p99: 6.8ms ≤ 10ms
  ✅ A8/A8e/A9 (son 7 gün): 2 fire, hepsi 5m içinde resolve, son 72h = 0

Karar: [x] Enforce'a hazır  [ ] Ek shadow gerekli  [ ] Rollback
Gerekçe: 7 gün wide shadow tamamlandı. 3 structural drift event hepsi
transient (deploy/reload sırasında beklenen). Provider error tek seferlik
network blip. Latency ve wouldEnforce hedef altında. Enforce pilot
(1 tenant) ile başlanabilir.

Enforce pilot scope: 1 tenant + <%1 trafik + 24 saat gözlem +
rollback (kill-switch) denemesi yapılmış olmalı.

Sonraki adım: Pilot enforce — en düşük trafikli tenant ile başla,
24 saat gözlem sonrası genişlet.
```

---

## E0 — Enforcement Run Sheet (T0–T+24)

Enforce pilot başlatma prosedürü. Shadow çıktı raporu "enforce'a hazır" kararı verildikten sonra uygulanır.

### Ön Koşullar (enforce pilot başlamadan önce)

| # | Koşul | Doğrulama |
|---|-------|-----------|
| E0.1 | Shadow çıktı raporu: "enforce'a hazır" kararı | Rapor imzalı, ekip onayı var |
| E0.2 | Task 8 kapalı: promote.service.ts placeholder kaldırılmış | Code review + merge |
| E0.3 | Kill-switch rollback denemesi yapılmış | Shadow'da en az 1 kez test edilmiş (config → metric → geri alma) |
| E0.4 | Pilot tenant seçilmiş | En düşük trafikli tenant, <%1 toplam trafik |
| E0.5 | Ops ekibi hazır | Sabah 09:00–10:00 arası başlatma (gün boyu gözlem imkanı) |

---

### T0 — Enforce Aktive (dakika 0)

```json
{
  "tenantOverrides": {
    "<pilot-tenant>": { "guardMode": "enforce" }
  }
}
```

İlk 15 dakika doğrulama:

| # | Kontrol | Beklenen | Fail → Aksiyon |
|---|---------|----------|----------------|
| E1 | `guard_decision_total{guardMode="enforce",tenantId="<pilot>"}` görünür | > 0 | Config propagation kontrol (cache TTL) |
| E2 | HTTP 503 oranı (pilot tenant) | Shadow'daki wouldEnforce rate ile tutarlı | > %5 → anında shadow'a rollback |
| E3 | `simulation_drift_total{guardMode="enforce"}` | 0 | > 0 → anında `driftGuardEnabled: false` |
| E4 | `drift_provider_errors_total{guardMode="enforce"}` | 0 | > 0 → anında `driftGuardEnabled: false` |
| E5 | Pipeline success rate (pilot tenant) | Düşüş < %0.5 | > %0.5 düşüş → shadow'a rollback |
| E6 | Latency p99 (pilot tenant) | ≤ 10ms overhead | > 15ms → shadow'a rollback |

15 dakika sonucu:
- E1–E6 hepsi temiz → ✅ gözleme devam
- Herhangi biri fail → 🛑 anında rollback, root cause triage

---

### T0+1h — İlk Saat Kontrolü

| # | Kontrol | Beklenen |
|---|---------|----------|
| E7 | Gerçek enforce (HOLD+BLOCK) rate | ≤ %5 |
| E8 | BLOCK_503 reason code dağılımı | Beklenen pattern (STALE, THRESHOLD vb.) — DRIFT:* yok |
| E9 | Tenant pipeline normal çalışıyor | promote/evaluate success rate stabil |
| E10 | A8e alert (enforce drift) | 0 |

---

### T0+4h — Yarım Gün Kontrolü

| # | Kontrol | Beklenen |
|---|---------|----------|
| E11 | Gerçek enforce rate trendi | Stabil veya azalan |
| E12 | Latency p99 trendi | Stabil, ≤ 10ms |
| E13 | Drift metric | 0 (hâlâ) |
| E14 | Provider error metric | 0 (hâlâ) |
| E15 | Diğer tenant'lar etkilenmemiş | Shadow/disabled tenant'larda anomali yok |

---

### T0+8h — Gün Sonu Değerlendirme (akşam 18:00)

| # | Kontrol | Beklenen | Aksiyon |
|---|---------|----------|---------|
| E16 | Gün içi toplam BLOCK_503 | Beklenen aralıkta | Beklenenden yüksekse → threshold tuning planla |
| E17 | Gün içi toplam HOLD | Beklenen aralıkta | Beklenenden yüksekse → signal quality kontrol |
| E18 | A1–A5, A8/A8e, A9 alert | 0 | > 0 → triage, gerekirse rollback |
| E19 | Pipeline success rate delta | < %0.5 düşüş | > %0.5 → ertesi gün dikkatle izle |

Gün sonu kararı:
- E16–E19 temiz → ✅ enforce pilot devam, ertesi gün sabah kontrolüne geç
- Anomali var ama açıklanabilir → ⚠️ devam, ertesi gün yakın izleme
- Açıklanamayan anomali → 🛑 shadow'a rollback

---

### T+24h — Enforce Pilot Go/No-Go

| Kriter | Eşik | Sonuç |
|--------|------|-------|
| Gerçek enforce rate | ≤ %5 (24h) | |
| Latency p99 | ≤ 10ms (24h) | |
| Drift event | 0 (24h) | |
| Provider error | 0 (24h) | |
| A1–A9 alert | 0 (24h) | |
| Pipeline success rate | < %0.5 düşüş | |
| Kill-switch rollback test | Yapıldı (E0.3) | |

Karar:
- Tümü PASS → ✅ Enforce genişletme: sonraki tenant grubu (%5 trafik)
- 1–2 minor fail → ⚠️ 24 saat daha pilot, root cause fix
- Critical fail → 🛑 Shadow'a rollback, SD-1 shadow'da kal

---

### Rollback Prosedürü (Enforce → Shadow)

Standart rollback (config-only):
```json
{
  "tenantOverrides": {
    "<pilot-tenant>": { "guardMode": "shadow" }
  }
}
```

Acil rollback (drift guard devre dışı):
```json
{
  "tenantOverrides": {
    "<pilot-tenant>": { "driftGuardEnabled": false }
  }
}
```

Panik rollback (kill-switch):
```json
{
  "tenantOverrides": {
    "<pilot-tenant>": { "killSwitchActive": true }
  }
}
```

Rollback sırası: config → driftGuardEnabled → kill-switch. Her biri stateless, restart gerekmez.

Rollback sonrası doğrulama:
1. `guard_decision_total{guardMode="enforce",tenantId="<pilot>"}` rate → 0'a düşmeli
2. HTTP 503 oranı → pre-enforce seviyesine dönmeli
3. Pipeline success rate → normale dönmeli

---

### SD-2 Hazırlığı (Shadow Verisi Gelince)

Shadow pilot verisi toplandıktan sonra SD-2 üç parçaya bölünür:

1. **Remediation workflow** — drift event'leri için ticket/enrichment otomasyonu
2. **LKG fallback** — Last Known Good snapshot ile fail-safe recovery
3. **D2.5 enforcement field refactor** — resolver enforcement field mimari iyileştirmesi

SD-2 planlaması shadow çıktı raporundaki drift pattern'lerine göre önceliklendirilir.


---

## T0 Shadow Deploy Run Sheet (Canary)

### Kapsam
- 1 tenant, <%1 trafik
- Shadow mod (downgrade aktif, enforce kapalı)

### Pre-Deploy Checklist
- [ ] Guard test suite green
- [ ] Grafana dashboard erişilebilir
- [ ] Alert kuralları (A1–A9) yüklü
- [ ] Kill-switch erişimi hazır
- [ ] Canary tenant seçilmiş (<%1 trafik)
- [ ] Config hazır: `guardMode='shadow'`, `driftGuardEnabled=true`

### Deploy Sonrası Doğrulama (30–60 dk)

Canary tenant shadow modda aktive edildikten sonra aşağıdaki metrikler 30–60 dakika boyunca izlenir:

| Metrik | PromQL | Beklenen | Alarm Eşiği |
|--------|--------|----------|-------------|
| Structural Drift Rate | `rate(simulation_drift_total[5m])` | 0 (normal) | >0 sürekli |
| Provider Error Rate | `rate(drift_provider_errors_total[5m])` | 0 (normal) | >0 spike |
| HTTP 503 Trend (NR-3) | `rate(http_responses_total{status="503"}[5m])` | Baseline ile aynı | Artış |

**NR-3 invariant:** Shadow modda resolver `BLOCK_503` kararı üretebilir; interceptor bu kararı downgrade eder (proceed); user-facing 503 oluşmaz. Dolayısıyla 503 artışı gözlenirse guard kaynaklı değildir — harici kaynak araştırılmalıdır. Guard kaynaklı olduğu belirlenirse anında rollback tetiklenir.

### Metrik Politikası (SD-1 Referans)

- `simulation_drift_total`: Yalnız structural drift (DRIFT:* prefix reason codes — DRIFT:STRUCTURAL, DRIFT:CONFIG vb.). Provider failure veya kill-switch olaylarını İÇERMEZ.
- `drift_provider_errors_total`: Yalnız provider failure (DRIFT_PROVIDER_ERROR). Structural drift olaylarını İÇERMEZ.
- reasonCodes ve fingerprint: Prometheus label DEĞİLDİR. Yalnızca structured log / request context'te bulunur. Prometheus label'ları: `type`, `operation`, `guardMode`, `tenantId`.

### Hızlı Rollback Tetikleyicileri (İlk Saat)

| Tetikleyici | Aksiyon | Mekanizma |
|-------------|---------|-----------|
| Provider error spike | Anında rollback | `driftGuardEnabled: false` (birinci tercih) |
| Structural drift flood (tek tenant'ta sürekli) | Anında rollback | `driftGuardEnabled: false` |
| Beklenmeyen 503 artışı | Rollback + root cause | `killSwitchActive: true` (acil) veya `driftGuardEnabled: false` |

**Rollback mekanizmaları (tercih sırasına göre):**

> **Prova (T0 rollback rehearsal):** kill-switch ile yapılır — sistemin anında "görünmez" olduğunun kanıtıdır.
> **Gerçek rollback:** en düşük blast-radius olan `driftGuardEnabled: false` tercih edilir; acil durumda kill-switch.

1. `driftGuardEnabled: false` → Drift guard devre dışı, guard compute devam eder ama drift kontrolü atlanır. Gerçek rollback birinci tercihi.
2. `killSwitchActive: true` → Tüm guard compute'u durdurur. Prova ve acil durum için.
3. `guardMode: 'disabled'` → Zero compute. En agresif.

→ Bkz. [Drift Triage](#drift-triage) bölümü
→ Bkz. [Drift Provider Error](#drift-provider-error) bölümü

### Rollback Doğrulama Provası (5 dk)

1. Kill-switch ON (`killSwitchActive: true`) — 2 dk bekle
2. Dashboard'da doğrula: drift metrikleri artmayı durdurdu, provider error paneli normalize oldu
3. Kill-switch OFF (`killSwitchActive: false`) — 3 dk bekle
4. Dashboard'da doğrula: `guard_decision_total{guardMode="shadow"}` rate prova öncesi seviyeye döndü
5. Provayı "rollback prosedürü test edildi" olarak kaydet

→ Bkz. [Kill-Switch Management](#kill-switch-management) bölümü

### Log/Telemetry Sanity

1. 3 örnek request seç (canary tenant'tan)
2. Her request'te `request.guardDecision` set edilmiş mi kontrol et
3. reasonCodes doğrula:
   - Drift varsa: `DRIFT:*` (ör. DRIFT:STRUCTURAL, DRIFT:CONFIG)
   - Provider error varsa: `DRIFT_PROVIDER_ERROR`
   - Kill-switch aktifse: `KILL_SWITCH_ACTIVE`
4. guardDecision set edilmemişse → Telemetry wiring failure → interceptor kodu incele

### T+1 Go/No-Go (Sabah Checklist)

→ Bkz. [Shadow Pilot — Daily Ops Checklist](#shadow-pilot--daily-ops-checklist) bölümü

Karar matrisi:

| Durum | Karar | Aksiyon |
|-------|-------|---------|
| S1–S7 tümü clean | "devam" | T+2 genişlet (daha fazla tenant veya trafik) |
| Herhangi bir S item fail | "dur" | Rollback + triage |

### Enforce Geçiş Ön Koşulu

- Enforce moduna geçiş için Task 8.1 (promote.service.ts placeholder kaldırma) tamamlanmış ve merge edilmiş OLMALIDIR.
- Task 8.1 tamamlanmadan shadow → enforce geçişi YAPILAMAZ.
