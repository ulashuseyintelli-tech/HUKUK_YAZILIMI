# Guard Operasyon Runbook

Operational Guard Phase — promote/evaluate pipeline koruma katmanı.

İlgili alert kuralları: `ops/prometheus/guard-alerts.yml` (A1–A5)
İlgili metrikler: `SimulationMetricsService` (guard tripwire metrics)

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
