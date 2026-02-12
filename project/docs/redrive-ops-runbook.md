# DLQ Redrive Operasyonel Runbook

> **Amaç:** DLQ redrive mekanizmasının operasyonel prosedürleri, metrik referansları ve incident müdahale rehberi.
> **Durum:** Phase 13 — Ops Doc & Alert Rules
> **Bağımlılıklar:** Phase 11.3 (Depth Limit), Phase 11.4 (Rate Limiting), Phase 12 (Operational Safeguards)

---

## İçindekiler

- [§0 Kritik Uyarılar](#0-kritik-uyarılar)
  - [/metrics Endpoint Güvenlik Uyarısı](#️-metrics-endpoint-güvenlik-uyarısı)
  - [Prometheus Scrape Ön Koşulu](#️-prometheus-scrape-ön-koşulu)
  - [Scrape Health İzleme](#️-scrape-health-i̇zleme)
- [§1 Kill-Switch Prosedürü](#1-kill-switch-prosedürü)
- [§2 Rate Limiting Operasyonel Rehber](#2-rate-limiting-operasyonel-rehber)
- [§3 TX Duration İzleme](#3-tx-duration-i̇zleme)
- [§4 Alert Delivery & Triage](#4-alert-delivery--triage)
- [§5 Scrape Health / RedriveScrapeDown](#5-scrape-health--redrivescrapedown)

---

## §0 Kritik Uyarılar

### ⚠️ `/metrics` Endpoint Güvenlik Uyarısı

> **DİKKAT:** `/metrics` endpoint'i **auth (kimlik doğrulama) içermez**. Bu endpoint herhangi bir erişim kontrolü olmadan metrik verilerini açık metin olarak döner. Production ortamında bu endpoint'in korunması **altyapı ekibinin sorumluluğundadır**.

**Production ortamında minimum güvenlik gereksinimleri:**

| # | Gereksinim | Açıklama |
|---|-----------|----------|
| (a) | **Public erişime kapalı olmalı** | `/metrics` endpoint'i internet üzerinden erişilebilir olmamalıdır. External load balancer veya ingress üzerinden bu path engellenmelidir. |
| (b) | **Internal network kısıtlaması veya IP allowlist** | Yalnızca Prometheus scraper'ın bulunduğu internal network segmentinden veya belirli IP adreslerinden erişime izin verilmelidir. Kubernetes ortamında NetworkPolicy ile kısıtlama önerilir. |
| (c) | **Mümkünse ayrı port veya sidecar ile expose** | `/metrics` endpoint'i uygulama port'undan (örn. 3000) farklı bir port üzerinden (örn. 9090) veya bir sidecar container aracılığıyla sunulmalıdır. Bu, uygulama trafiği ile metrik trafiğini izole eder. |

> **Not:** Bu güvenlik önlemleri Phase 13 kapsamında uygulanmaz — altyapı kararıdır. Ancak bu önlemler alınmadan production'a geçilmesi **önerilmez**.

---

### ⚠️ Prometheus Scrape Ön Koşulu

> **DİKKAT:** Bu runbook'taki tüm alert kuralları ve PromQL sorguları, `/metrics` endpoint'inin **Prometheus tarafından aktif olarak scrape edilmesini** gerektirir. Scrape yapılandırması yoksa:
>
> - Alert rules **aktif edilemez** — kurallar tanımlı olsa bile metrik verisi olmadan tetiklenmez
> - PromQL sorguları **sonuç döndürmez** — dashboard'lar ve ad-hoc sorgular boş kalır
> - **"Metrik gelmiyor = alert yok"** durumu oluşur — bu, sorunların sessizce kaçırılması anlamına gelir

**Temel Prometheus scrape yapılandırması:**

```yaml
# prometheus.yml — scrape_configs bölümüne ekleyin
scrape_configs:
  - job_name: 'hukuk-api-redrive'
    scrape_interval: 15s
    metrics_path: '/metrics'
    static_configs:
      - targets: ['<API_HOST>:<API_PORT>']
```

> `<API_HOST>` ve `<API_PORT>` değerlerini ortamınıza göre güncelleyin. Kubernetes ortamında `static_configs` yerine `kubernetes_sd_configs` kullanılabilir.

---

### ⚠️ Scrape Health İzleme

Prometheus'un metrik toplamaya devam ettiğinden emin olmak için **scrape health izlemesi** yapılmalıdır. Scrape durduğunda alert'ler de durur — bu, yanlış bir güvenlik hissi yaratır.

**Kontrol yöntemi — `up` metriği:**

```promql
# Scrape başarılı mı? (1 = evet, 0 = hayır)
up{job="hukuk-api-redrive"}
```

| `up` Değeri | Anlam | Aksiyon |
|-------------|-------|---------|
| `1` | Scrape başarılı, metrikler toplanıyor | Normal operasyon |
| `0` | Scrape başarısız — hedef ulaşılamaz veya hata döndü | Acil araştırma: hedef ayakta mı? Network erişimi var mı? `/metrics` endpoint çalışıyor mu? |
| _Metrik yok_ | Job tanımlı değil veya Prometheus yapılandırması eksik | Scrape config'i kontrol edin (yukarıdaki örneğe bakın) |

> **Öneri:** Prometheus dashboard'unda veya Grafana'da bir **scrape health paneli** oluşturun. `up == 0` durumu için ayrı bir alert tanımlamayı değerlendirin — bu, "metric gelmiyor = alert yok" senaryosunu önler.

---

## §1 Kill-Switch Prosedürü

### 1. What it means (Semantik)

Kill-switch, `REDRIVE_DISABLED=true` environment variable'ı ile `POST /dlq/:dlqId/redrive` endpoint'ini **HTTP 503 Service Unavailable** yanıtı ile reddeden acil müdahale mekanizmasıdır.

**Çalışma prensibi:**
- Kill-switch aktif olduğunda, redrive isteği endpoint'e ulaştığı anda **short-circuit** edilir
- Tüm downstream çağrılar (`getById`, depth check, rate check, `atomicRedrive`) **atlanır** — zero side effect
- Yanıt body'sinde `REDRIVE_DISABLED` hata kodu döner

**Kullanıcı etkisi:**
- DLQ entry'leri **redrive edilemez** — tüm redrive istekleri 503 ile reddedilir
- DLQ entry'leri **listelenebilir** (`GET /dlq`) ve **detayları görüntülenebilir** (`GET /dlq/:id`)
- DLQ entry'leri **resolve edilebilir** (`POST /dlq/:dlqId/resolve`) — resolve, kill-switch'ten etkilenmez

**İlgili metrikler (label durumu):**
| Metrik | Tip | Labels | Açıklama |
|--------|-----|--------|----------|
| `carrier_redrive_kill_switch_active` | Gauge | **none** (intentional — tek global switch) | Kill-switch durumu: `1` = aktif, `0` = pasif |
| `carrier_redrive_disabled_total` | Counter | **none** (intentional — tüm redler sayılır) | Kill-switch nedeniyle reddedilen toplam istek sayısı |

---

### 2. Impact / Blast radius

**Etkilenen:**

| Endpoint | Durum | Yanıt |
|----------|-------|-------|
| `POST /dlq/:dlqId/redrive` | ❌ Engellenir | HTTP 503 — `REDRIVE_DISABLED` |

**Etkilenmeyen:**

| Endpoint | Durum | Açıklama |
|----------|-------|----------|
| `GET /dlq` (list) | ✅ Normal | DLQ listesi erişilebilir |
| `GET /dlq/:id` (detail) | ✅ Normal | DLQ detayı erişilebilir |
| `POST /dlq/:dlqId/resolve` | ✅ Normal | Resolve işlemi çalışır — incident anında gereklidir |
| Tüm read-only endpoint'ler | ✅ Normal | Okuma işlemleri etkilenmez |

**Metrik etkisi:**
- `carrier_redrive_disabled_total` → her reddedilen istekte artar
- `carrier_redrive_kill_switch_active` → `1` olur (gauge)
- Diğer redrive metrikleri (`tx_duration`, `rate_limited`, `depth_exceeded` vb.) → artmaz (downstream çağrılar yapılmaz)

---

### 3. Immediate actions — Etkinleştirme adımları (max 7 adım)

> ⏱️ **Hedef:** İlk 5 dakika içinde tamamlanmalıdır.

| # | Adım | Detay |
|---|------|-------|
| 1 | **Incident kanalında duyuru yap** | Slack/ops kanalına: "Kill-switch etkinleştiriliyor — neden: `<kısa açıklama>`" |
| 2 | **`REDRIVE_DISABLED=true` env var ayarla** | K8s: ConfigMap/Secret güncellemesi veya deployment env değişikliği |
| 3 | **Pod'ları rolling restart yap** | `kubectl rollout restart deployment/<api-deployment>` |
| 4 | **Gauge doğrula** | PromQL ile `carrier_redrive_kill_switch_active == 1` olduğunu doğrula |
| 5 | **Test redrive → HTTP 503 doğrula** | `curl -X POST .../dlq/<test-id>/redrive` → 503 yanıtı beklenir |
| 6 | **Counter artışını doğrula** | `carrier_redrive_disabled_total` değerinin arttığını kontrol et |
| 7 | **Incident log'a kaydet** | Zaman, neden, kim açtı — incident tracking sistemine kayıt |

**Doğrulama PromQL sorguları:**

```promql
# Gauge kontrolü — kill-switch aktif mi?
carrier_redrive_kill_switch_active == 1
```

```promql
# Counter kontrolü — reddedilen istek sayısı artıyor mu?
increase(carrier_redrive_disabled_total[5m])
```

**Test komutu:**

```bash
# HTTP 503 doğrulama
curl -s -o /dev/null -w "%{http_code}" -X POST https://<API_HOST>/dlq/<test-dlq-id>/redrive
# Beklenen çıktı: 503
```

---

### 4. Deep dive (Araştırma)

#### Tetikleyici sinyaller — Ne zaman kill-switch kullanılmalı?

Kill-switch aşağıdaki durumlardan **bir veya birkaçı** gözlemlendiğinde etkinleştirilmelidir:

| # | Sinyal | PromQL / Kontrol | Açıklama |
|---|--------|------------------|----------|
| 1 | **TX duration p99 spike (sürekli)** | Aşağıdaki PromQL | `atomicRedrive` transaction süresi anormal şekilde yüksek — DB contention veya lock-wait |
| 2 | **Downstream servis arızası** | Servis health check'leri | Queue, DB veya bağımlı servis erişilemez durumda |
| 3 | **Veri tutarsızlığı şüphesi** | Audit log anomalisi | Audit log'da beklenmeyen pattern — veri bozulması olasılığı |
| 4 | **Rate check fail-closed artışı** | Aşağıdaki PromQL | Rate limiter'da bug veya veri bozulması — fail-closed tetiklendi |

**Doğrulama PromQL sorguları:**

```promql
# TX duration p99 — sürekli yüksek mi?
histogram_quantile(0.99,
  sum(rate(carrier_redrive_tx_duration_seconds_bucket[5m])) by (le)
) > 2
```

```promql
# Rate check fail-closed — artış var mı? (normal: 0)
increase(carrier_redrive_rate_check_failed_total[5m]) > 0
```

```promql
# Redrive başarı oranı — düşüş var mı?
rate(carrier_redrive_success_total[5m])
```

#### Karar kriterleri

| Durum | Karar | Gerekçe |
|-------|-------|---------|
| TX p99 > eşik, **sürekli** (5+ dk) | Kill-switch **AÇIK** | Sürekli yavaşlama = sistemik sorun |
| TX p99 > eşik, **geçici** (< 5 dk) | İzle, kill-switch **KAPALI** | Geçici spike normal olabilir |
| `rate_check_failed_total` artışı | Kill-switch **AÇIK** | Fail-closed = olası bug, acil müdahale |
| Downstream servis tamamen erişilemez | Kill-switch **AÇIK** | Redrive başarısız olacak, gereksiz yük |
| Audit log anomalisi | Kill-switch **AÇIK**, araştırma başlat | Veri bütünlüğü öncelikli |

---

### 5. Rollback / Disable path — Devre dışı bırakma adımları

> Kill-switch'i devre dışı bırakmadan önce **incident'ın çözüldüğünden** emin olun.

| # | Adım | Detay |
|---|------|-------|
| 1 | **Incident kanalında duyuru yap** | "Kill-switch devre dışı bırakılıyor — incident çözüldü" |
| 2 | **`REDRIVE_DISABLED` env var'ı kaldır veya `false` yap** | K8s: ConfigMap/Secret güncellemesi |
| 3 | **Pod'ları rolling restart yap** | `kubectl rollout restart deployment/<api-deployment>` |
| 4 | **Gauge doğrula** | `carrier_redrive_kill_switch_active == 0` olduğunu doğrula |
| 5 | **Test redrive → başarı doğrula** | `curl -X POST .../dlq/<test-id>/redrive` → 200 yanıtı beklenir |
| 6 | **Incident log'u güncelle** | Kill-switch kapatma zamanı, kim kapattı |

**Doğrulama PromQL sorgusu:**

```promql
# Gauge kontrolü — kill-switch pasif mi?
carrier_redrive_kill_switch_active == 0
```

---

### ❌ Yapma Listesi

1. **Kill-switch aktifken `POST /resolve` endpoint'ini devre dışı bırakmayın** — Resolve işlemi incident anında da gereklidir. DLQ entry'lerinin resolve edilmesi, kill-switch'ten bağımsız çalışmalıdır.

2. **Kill-switch'i restart olmadan env var değiştirerek devre dışı bırakmaya çalışmayın** — Env var değişikliği pod restart olmadan uygulanmaz. `carrier_redrive_kill_switch_active` gauge'u stale kalır ve yanlış durum raporlanır.

---

### 📋 İlgili Alert

| Alert | Severity | `for` | Açıklama |
|-------|----------|-------|----------|
| `RedriveKillSwitchActive` | warning | 30m | Kill-switch 30 dakikadan fazla aktif — kapatılması unutulmuş olabilir |

> Kill-switch etkinleştirildiğinde, Slack/ops kanalına **manuel bildirim** yapılmalıdır. Alert yalnızca 30 dakika sonra tetiklenir — ekibin anında haberdar olması için manuel duyuru gereklidir (bkz. Adım 1).

---

## §2 Rate Limiting Operasyonel Rehber

### 1. What it means (Semantik)

Rate limiting, **correlation chain bazında üstel backoff** ile redrive hız sınırlaması uygulayan mekanizmadır (Phase 11.4). Aynı correlation chain'e ait DLQ entry'leri, belirli bir cooldown süresi geçmeden tekrar redrive edilemez.

**Çalışma prensibi:**
- Her redrive denemesinde backoff süresi üstel olarak artar: `baseMs × 2^(redriveCount - 1)`, jitter ile
- Cooldown süresi dolmadan yapılan redrive istekleri **HTTP 409 Conflict** yanıtı ile reddedilir
- Yanıt body'sinde `RATE_LIMITED` hata kodu ve `nextAllowedAt` bilgisi döner
- Rate limiter iki aşamada çalışır: **precheck** (tx öncesi hızlı kontrol) ve **tx** (transaction içi kesin kontrol)

**Fail-closed davranışı:**
- `carrier_redrive_rate_check_failed_total > 0` = rate limiter'da **beklenmeyen hata** oluştu
- Fail-closed gate tetiklendi → **hiçbir redrive yapılamaz** (tüm istekler reddedilir)
- Bu durum olası bir **bug veya veri bozulması** gösterir — **KRİTİK**, acil araştırma gerektirir

**Kullanıcı etkisi:**
- Normal rate limiting: Redrive istekleri HTTP 409 `RATE_LIMITED` ile reddedilir, `nextAllowedAt` bilgisi döner — kullanıcı ne zaman tekrar deneyebileceğini bilir
- Fail-closed: Tüm redrive istekleri reddedilir — kullanıcı hiçbir entry'yi redrive edemez

---

### 2. Impact / Blast radius

| Senaryo | Etki Alanı | Açıklama |
|---------|-----------|----------|
| **Rate limited (normal)** | Yalnızca aynı correlation chain'deki DLQ entry'leri | Diğer correlation chain'ler **bağımsız** çalışır — etkilenmez |
| **Fail-closed (`rate_check_failed`)** | **Tüm redrive istekleri** | Hiçbir redrive yapılamaz — tüm chain'ler etkilenir |
| **Depth exceeded** | Belirli DLQ entry'leri | Entry **poison** olarak işaretlenir — manual intervention gerekebilir |

**Etkilenen endpoint:**

| Endpoint | Rate Limited | Fail-closed |
|----------|-------------|-------------|
| `POST /dlq/:dlqId/redrive` | HTTP 409 (chain bazlı) | HTTP 500 / reddedilir |
| `GET /dlq` (list) | ✅ Etkilenmez | ✅ Etkilenmez |
| `GET /dlq/:id` (detail) | ✅ Etkilenmez | ✅ Etkilenmez |
| `POST /dlq/:dlqId/resolve` | ✅ Etkilenmez | ✅ Etkilenmez |

---

### 3. Immediate actions — Retry storm tespit ve müdahale (max 7 adım)

> ⏱️ **Hedef:** İlk 5 dakika içinde tamamlanmalıdır.

| # | Adım | Detay |
|---|------|-------|
| 1 | **Retry storm tespiti** | `carrier_redrive_rate_limited_total` artış hızını kontrol et — anormal artış retry storm gösterir |
| 2 | **Fail-closed kontrolü** | `carrier_redrive_rate_check_failed_total > 0` mı? Evet ise → **KRİTİK**, Adım 6'ya atla |
| 3 | **Gate dağılımını kontrol et** | `rate_limited_total` hangi gate'de artıyor? `precheck` mi `tx` mi? |
| 4 | **Backoff dağılımını incele** | `carrier_redrive_backoff_seconds` histogram'ını kontrol et — backoff süreleri beklenen aralıkta mı? |
| 5 | **Parametre ayarlama değerlendir** | Retry storm devam ediyorsa `baseMs` artırılabilir (bkz. Deep dive — Konfigürasyon tablosu) |
| 6 | **Fail-closed ise: acil araştırma başlat** | Log'ları incele, son deploy'u kontrol et — bug veya veri bozulması olasılığı |
| 7 | **Durdurulamıyorsa: kill-switch etkinleştir** | Durum kontrol altına alınamıyorsa → §1 Kill-Switch Prosedürü'ne git |

---

### 4. Deep dive (Araştırma)

#### Backoff Konfigürasyon Tablosu

| Parametre | Varsayılan | Açıklama | Değiştirildiğinde Etki |
|-----------|-----------|----------|----------------------|
| `baseMs` | `30000` (30s) | İlk cooldown süresi — aynı chain'e ait ilk redrive sonrası bekleme süresi | **Artırma:** Cooldown uzar, retry storm riski azalır, kullanıcı daha uzun bekler. **Azaltma:** Cooldown kısalır, retry storm riski artar. **0 yapma!** (bkz. Yapma Listesi) |
| `capExponent` | `7` | Üstel artış tavanı — backoff en fazla `2^7 = 128` katına çıkar | **Artırma:** Maksimum backoff süresi artar (daha agresif). **Azaltma:** Backoff daha erken tavana ulaşır |
| `maxBackoffMs` | `3600000` (1 saat) | Mutlak maksimum bekleme süresi — capExponent'ten bağımsız üst sınır | **Artırma:** En kötü durumda daha uzun bekleme. **Azaltma:** Backoff tavanı düşer |
| `jitterPct` | `0.20` (%20) | Thundering herd önleme — backoff süresine ±%20 rastgele sapma ekler | **Artırma:** Daha fazla dağılım, daha az çakışma. **Azaltma:** Daha az dağılım. **0 yapma!** (bkz. Yapma Listesi) |

**Backoff formülü:**

```
backoff = min(baseMs × 2^(redriveCount - 1), maxBackoffMs) × (1 ± jitterPct)
```

**Örnek backoff süreleri (jitter hariç):**

| Redrive # | Hesaplama | Backoff |
|-----------|-----------|---------|
| 1 | 30s × 2^0 | 30s |
| 2 | 30s × 2^1 | 60s |
| 3 | 30s × 2^2 | 120s (2 dk) |
| 4 | 30s × 2^3 | 240s (4 dk) |
| 5 | 30s × 2^4 | 480s (8 dk) |
| 6 | 30s × 2^5 | 960s (16 dk) |
| 7 | 30s × 2^6 | 1920s (32 dk) |
| 8+ | 30s × 2^7 = 3840s → cap 3600s | 3600s (1 saat) |

---

#### Metrik Referans Tablosu

| Metrik | Tip | Labels | Açıklama |
|--------|-----|--------|----------|
| `carrier_redrive_rate_limited_total` | Counter | `gate`: `precheck` \| `tx` (2 değer) | Rate limit nedeniyle reddedilen istek sayısı. `gate` label'ı hangi aşamada reddedildiğini gösterir: `precheck` (tx öncesi hızlı kontrol) veya `tx` (transaction içi kesin kontrol) |
| `carrier_redrive_rate_check_failed_total` | Counter | **none** (intentional — fail-closed global event, label ayrımı gereksiz) | Rate limiter'da beklenmeyen hata sayısı. **Normal değer: 0.** Herhangi bir artış = bug veya veri bozulması → KRİTİK |
| `carrier_redrive_backoff_seconds` | Histogram | **none** (intentional — chain bazlı ayrım cardinality patlatır) | Hesaplanan backoff sürelerinin dağılımı. Tune etme için p50/p95/p99 değerlerine bakılır |
| `carrier_redrive_backoff_applied_total` | Counter | `count_bucket` (bounded — redrive sayısı bucket'ları) | Redrive sayısına göre backoff uygulama dağılımı. Hangi redrive derinliğinde yoğunlaşma olduğunu gösterir |
| `carrier_redrive_depth_exceeded_total` | Counter | **none** (intentional — poison event global sayaç) | Derinlik limiti aşılarak poison olarak işaretlenen entry sayısı |

---

#### PromQL Sorguları — Tune Etme İçin

**Rate limit red oranı (gate bazında):**

```promql
# Son 5 dakikada rate limit nedeniyle reddedilen istek hızı (gate bazında)
sum by (gate) (rate(carrier_redrive_rate_limited_total[5m]))
```

**Fail-closed kontrol (KRİTİK):**

```promql
# Rate check fail-closed — herhangi bir artış KRİTİK
increase(carrier_redrive_rate_check_failed_total[5m]) > 0
```

> ⚠️ **`rate_check_failed_total > 0` KRİTİK UYARI:** Bu metriğin normal operasyonda **her zaman 0** olması gerekir. Herhangi bir artış, rate limiter'da bug, veri bozulması veya beklenmeyen bir hata olduğunu gösterir. **Acil araştırma gerektirir.**
>
> **Deploy sonrası tek spike ayırımı:** Yeni deploy sonrası tek seferlik bir spike görülebilir (örn. migration sırasında geçici veri tutarsızlığı). Bu durumda:
> 1. Spike'ın deploy zamanı ile örtüştüğünü doğrulayın
> 2. Spike sonrası counter'ın sabit kaldığını (artmadığını) doğrulayın
> 3. Devam eden artış varsa → **bug**, acil müdahale gerekir

**Backoff süresi dağılımı:**

```promql
# Backoff süresi p50 — medyan bekleme süresi
histogram_quantile(0.50, sum(rate(carrier_redrive_backoff_seconds_bucket[5m])) by (le))
```

```promql
# Backoff süresi p95 — yüksek bekleme süreleri
histogram_quantile(0.95, sum(rate(carrier_redrive_backoff_seconds_bucket[5m])) by (le))
```

```promql
# Backoff süresi p99 — en uzun bekleme süreleri
histogram_quantile(0.99, sum(rate(carrier_redrive_backoff_seconds_bucket[5m])) by (le))
```

**Redrive derinliğine göre backoff dağılımı:**

```promql
# Hangi redrive derinliğinde yoğunlaşma var?
sum by (count_bucket) (rate(carrier_redrive_backoff_applied_total[5m]))
```

**Depth exceeded artışı:**

```promql
# Derinlik limiti aşılma hızı
rate(carrier_redrive_depth_exceeded_total[5m])
```

**Retry storm tespiti — rate limited artış hızı:**

```promql
# Son 15 dakikada rate limit artış hızı — yüksek değer retry storm gösterir
sum(rate(carrier_redrive_rate_limited_total[15m]))
```

---

### 5. Rollback / Disable path

#### Parametre Geri Alma Prosedürü

Rate limit parametreleri environment variable olarak yapılandırılır. Değişiklik sonrası **pod restart gerektirir** (hot-reload desteklenmez).

| # | Adım | Detay |
|---|------|-------|
| 1 | **Mevcut parametre değerlerini kaydet** | Değişiklik öncesi mevcut env var değerlerini not edin |
| 2 | **Env var'ları eski değerlere geri al** | `baseMs`, `capExponent`, `maxBackoffMs`, `jitterPct` değerlerini varsayılanlara döndürün |
| 3 | **Pod'ları rolling restart yap** | `kubectl rollout restart deployment/<api-deployment>` |
| 4 | **Metrikleri doğrula** | `carrier_redrive_rate_limited_total` ve `carrier_redrive_backoff_seconds` değerlerinin normalleştiğini kontrol edin |

#### Kill-Switch Referansı

Parametre geri alma sorunu çözmüyorsa veya durum kontrol altına alınamıyorsa:

> **→ §1 Kill-Switch Prosedürü'ne gidin** — tüm redrive işlemlerini durdurun, ardından kök neden analizi yapın.

---

### ❌ Yapma Listesi

1. **`baseMs`'i 0'a ayarlamayın** — Cooldown tamamen devre dışı kalır. Aynı chain'e ait entry'ler aralıksız redrive edilebilir hale gelir → **retry storm riski**.

2. **`jitterPct`'yi 0'a ayarlamayın** — Thundering herd koruması kaybolur. Aynı cooldown süresine sahip tüm istekler aynı anda tetiklenir → **eşzamanlı yük patlaması**.

3. **Rate limit parametrelerini hot-reload beklemeyin** — Parametreler uygulama başlangıcında okunur. Env var değişikliği **pod restart olmadan uygulanmaz**. Restart yapılmazsa eski değerler geçerli kalır.

---

### 📋 İlgili Alert'ler

| Alert | Severity | `for` | Açıklama |
|-------|----------|-------|----------|
| `RedriveRateCheckFailed` | **critical** | 0m | Rate limit pre-check fail-closed tetiklendi — olası bug veya veri bozulması. **Anında** tetiklenir. |
| `RedriveDepthExceeded` | warning | 0m | Redrive derinlik limiti aşıldı — DLQ entry poison olarak işaretlendi. Manual intervention gerekebilir. |

> `RedriveRateCheckFailed` alert'i **critical** severity ile tanımlıdır ve `for: 0m` ile **anında** tetiklenir. Bu alert tetiklendiğinde yukarıdaki "Immediate actions" bölümündeki Adım 6'ya gidin.

---

## §3 TX Duration İzleme

### 1. What it means (Semantik)

`carrier_redrive_tx_duration_seconds` histogram metriği, `atomicRedrive` transaction süresini ölçer. Ölçüm, transaction'ın **begin** anından **commit veya rollback** anına kadar geçen süreyi kapsar (`Date.now()` delta, saniye cinsinden).

**Kapsam:**
- **Tüm outcome'lar dahildir:** success, reject (`DlqRedriveError`), unexpected error — outcome ayrımı yapılmaz
- Metrik, transaction'ın toplam süresini ölçer — içerideki bireysel query süreleri değil

**p99 hesaplama yöntemi:**
- p99 değeri Prometheus `histogram_quantile()` fonksiyonu ile **server-side** hesaplanır
- App içinde hesaplanan custom gauge veya summary **DEĞİLDİR** — Prometheus tarafında histogram bucket'larından türetilir
- **Aggregation:** `sum(rate(..._bucket[5m])) by (le)` ile **servis bazında** aggregate edilir — instance/pod bazında değil
- Bu, multi-pod deployment'ta doğru p99 hesabı sağlar

**Kullanıcı etkisi:**
- Yüksek tx duration = yavaş redrive yanıtları → kullanıcı uzun süre bekler
- Çok yüksek tx duration = potansiyel timeout → redrive isteği başarısız olabilir
- DB contention artarsa tüm redrive istekleri yavaşlar → cascade failure riski

**İlgili metrikler (label durumu):**

| Metrik | Tip | Labels | Açıklama |
|--------|-----|--------|----------|
| `carrier_redrive_tx_duration_seconds` | Histogram | **none** (intentional — outcome ayrımı mevcut counter'lardan cross-query ile yapılır) | `atomicRedrive` transaction süresi dağılımı. Bucket'lar: `[0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10]` |

---

### 2. Impact / Blast radius

**Yüksek tx duration'ın etkileri:**

| Etki | Açıklama |
|------|----------|
| **DB contention** | Tüm redrive istekleri yavaşlar, timeout riski artar |
| **Connection pool tükenmesi** | Uzun süren transaction'lar bağlantıları meşgul tutar → yeni bağlantı açılamaz → cascade failure |
| **Lock-wait** | `FOR UPDATE` lock'ları uzun süre tutulur → diğer transaction'lar bekler → domino etkisi |

**Etkilenen:**

| Endpoint | Durum | Açıklama |
|----------|-------|----------|
| `POST /dlq/:dlqId/redrive` | ⚠️ Yavaşlar / Timeout | Transaction süresi doğrudan yanıt süresini etkiler |

**Etkilenmeyen:**

| Endpoint | Durum | Açıklama |
|----------|-------|----------|
| `GET /dlq` (list) | ✅ Normal | Farklı query pattern — `FOR UPDATE` lock kullanmaz |
| `GET /dlq/:id` (detail) | ✅ Normal | Read-only sorgu — transaction lock'larından etkilenmez |
| `POST /dlq/:dlqId/resolve` | ✅ Normal | Farklı transaction — redrive lock'larından bağımsız |
| Tüm read-only endpoint'ler | ✅ Normal | Farklı query pattern, lock contention yok |

---

### 3. Immediate actions — Eskalasyon adımları (max 7 adım)

> ⏱️ **Hedef:** İlk 5 dakika içinde tamamlanmalıdır.

| # | Adım | Detay |
|---|------|-------|
| 1 | **p99 > eşik → DB connection pool durumunu kontrol et** | Aktif bağlantı sayısı, bekleyen bağlantı sayısı, pool kapasitesi |
| 2 | **Active query'leri kontrol et** | `pg_stat_activity` ile uzun süren sorguları listele (aşağıdaki SQL'e bakın) |
| 3 | **Lock-wait durumunu kontrol et** | `pg_locks` ile bekleyen lock'ları incele (aşağıdaki SQL'e bakın) |
| 4 | **Long-running query varsa → kill et (dikkatli!)** | `pg_terminate_backend(pid)` — yalnızca kesin olarak sorunlu olduğu belirlenen query'ler için |
| 5 | **Connection pool ayarlarını kontrol et** | Pool size, idle timeout, connection lifetime değerlerini gözden geçir |
| 6 | **Devam ediyorsa → kill-switch etkinleştir** | **→ §1 Kill-Switch Prosedürü'ne gidin** — tüm redrive işlemlerini durdurun |

**DB kontrol SQL sorguları:**

```sql
-- Active query'ler — uzun süren sorguları listele
SELECT pid, now() - pg_stat_activity.query_start AS duration, query, state
FROM pg_stat_activity
WHERE state != 'idle'
  AND (now() - pg_stat_activity.query_start) > interval '5 seconds'
ORDER BY duration DESC;
```

```sql
-- Lock-wait durumu — bekleyen lock'ları incele
SELECT blocked_locks.pid     AS blocked_pid,
       blocked_activity.usename  AS blocked_user,
       blocking_locks.pid     AS blocking_pid,
       blocking_activity.usename AS blocking_user,
       blocked_activity.query    AS blocked_statement,
       blocking_activity.query   AS current_statement_in_blocking_process
FROM pg_catalog.pg_locks         blocked_locks
JOIN pg_catalog.pg_stat_activity blocked_activity  ON blocked_activity.pid = blocked_locks.pid
JOIN pg_catalog.pg_locks         blocking_locks
    ON blocking_locks.locktype = blocked_locks.locktype
    AND blocking_locks.database IS NOT DISTINCT FROM blocked_locks.database
    AND blocking_locks.relation IS NOT DISTINCT FROM blocked_locks.relation
    AND blocking_locks.page IS NOT DISTINCT FROM blocked_locks.page
    AND blocking_locks.tuple IS NOT DISTINCT FROM blocked_locks.tuple
    AND blocking_locks.virtualxid IS NOT DISTINCT FROM blocked_locks.virtualxid
    AND blocking_locks.transactionid IS NOT DISTINCT FROM blocked_locks.transactionid
    AND blocking_locks.classid IS NOT DISTINCT FROM blocked_locks.classid
    AND blocking_locks.objid IS NOT DISTINCT FROM blocked_locks.objid
    AND blocking_locks.objsubid IS NOT DISTINCT FROM blocked_locks.objsubid
    AND blocking_locks.pid != blocked_locks.pid
JOIN pg_catalog.pg_stat_activity blocking_activity ON blocking_activity.pid = blocking_locks.pid
WHERE NOT blocked_locks.granted;
```

---

### 4. Deep dive (Araştırma)

#### Histogram Metriği Açıklaması

`carrier_redrive_tx_duration_seconds` bir Prometheus **histogram** metriğidir. Prometheus tarafından otomatik olarak 3 alt metrik üretilir:

| Alt Metrik | Açıklama |
|-----------|----------|
| `carrier_redrive_tx_duration_seconds_bucket{le="..."}` | Her bucket sınırının altında kalan gözlem sayısı |
| `carrier_redrive_tx_duration_seconds_sum` | Toplam gözlem süresi (saniye) |
| `carrier_redrive_tx_duration_seconds_count` | Toplam gözlem sayısı |

**Bucket sınırları:** `[0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10]` (saniye)

Bu bucket'lar, 10ms'den 10s'ye kadar olan aralığı logaritmik olarak kapsar. Normal operasyonda gözlemlerin büyük çoğunluğu ilk birkaç bucket'ta (`le="0.1"` — 100ms altı) yoğunlaşmalıdır.

---

#### PromQL Sorguları — p50 / p95 / p99

> **Aggregation kuralı:** Tüm sorgularda `sum(rate(..._bucket[5m])) by (le)` ile **servis bazında** aggregate edilir — instance/pod bazında değil. Bu, multi-pod deployment'ta doğru yüzdelik hesabı sağlar.

**p50 (medyan):**

```promql
histogram_quantile(0.50,
  sum(rate(carrier_redrive_tx_duration_seconds_bucket[5m])) by (le)
)
```

**p95:**

```promql
histogram_quantile(0.95,
  sum(rate(carrier_redrive_tx_duration_seconds_bucket[5m])) by (le)
)
```

**p99:**

```promql
histogram_quantile(0.99,
  sum(rate(carrier_redrive_tx_duration_seconds_bucket[5m])) by (le)
)
```

---

#### Min Sample Guard

Düşük trafik hacminde p99 değeri **noisy** olur — az sayıda gözlemle hesaplanan yüzdelik değerler güvenilir değildir ve false positive alert'lere yol açabilir.

**Guard mekanizması:** Alert expr'ında `and` clause ile minimum gözlem sayısı kontrolü eklenir:

```promql
histogram_quantile(0.99,
  sum(rate(carrier_redrive_tx_duration_seconds_bucket[5m])) by (le)
) > 2
and
sum(rate(carrier_redrive_tx_duration_seconds_count[5m])) > 0.1
```

**Açıklama:**
- `sum(rate(..._count[5m])) > 0.1` → 5 dakikada en az ~30 gözlem (0.1 req/s × 300s) olmasını gerektirir
- **Kritik:** Guard'daki `sum(rate(..._count[5m]))` aynı aggregation boyutunda (service-level, instance/pod bazında değil) hesaplanır — p99 hesabıyla aynı seviyede
- Aksi halde guard yanlış negatif/pozitif üretir

---

#### Beklenen Değer Aralıkları (Kalibrasyon Öncesi Tahmini)

> ⚠️ Aşağıdaki değerler **kalibrasyon öncesi tahmini** değerlerdir. Production verisine göre ayarlanmalıdır (bkz. Kalibrasyon Prosedürü).

| Yüzdelik | Beklenen Aralık | Uyarı Eşiği | Açıklama |
|----------|----------------|-------------|----------|
| p50 | < 100ms | — | Medyan transaction süresi — çoğu tx hızlı tamamlanmalı |
| p95 | < 500ms | — | Yüksek yüzdelik — yavaş tx'ler bu aralıkta olmalı |
| p99 | < 1s | **2s** (başlangıç, kalibrasyon ile ayarlanır) | En yavaş %1 — 2s üzeri anormal |

---

#### Kalibrasyon Prosedürü (Formal)

Alert eşik değeri (başlangıç: `p99_threshold = 2s`, `min_sample_guard = 0.1 req/s`) production verisine dayalı olarak kalibre edilmelidir. Aşağıdaki formal prosedür, tekrarlanabilir ve tutarlı kalibrasyon sağlar.

> **Not:** Bu prosedür pre-deploy olarak hazırlanmıştır. Gerçek kalibrasyon, production'da yeterli veri toplandıktan sonra uygulanır.

##### Gözlem Penceresi Tanımı

- **Süre:** 7 gün (tam bir hafta)
- **Gerekçe:** Hafta içi ve hafta sonu trafik pattern farklılıklarını yakalar. Daha kısa pencere (3 gün) hafta sonu pattern'ini kaçırabilir; daha uzun pencere (14 gün) gereksiz gecikme yaratır.
- **Başlangıç:** Deploy sonrası ilk 24-48 saat **hariç tutulur** (bkz. Gürültü Bastırma)
- **Geçersiz günler:** Bilinen incident günleri, planlı bakım pencereleri ve anormal trafik günleri gözlem penceresinden çıkarılmalıdır

##### Baseline Çıkarma Yöntemi (Median-of-Daily p99)

Tek bir 7 günlük p99 değeri outlier'lara duyarlıdır. Median-of-daily yöntemi daha dayanıklıdır:

1. Her gün için ayrı p99 değeri hesapla (7 değer)
2. Bu 7 değerin **medyanını** al → bu, baseline'dır
3. Outlier günler (incident, deploy, anomali) medyanı etkilemez

**Adım 1 — Günlük p99 çıkarma PromQL sorgusu:**

```promql
# Belirli bir gün için p99 (örn. 2 gün önce, 24 saatlik pencere)
histogram_quantile(0.99,
  sum(rate(carrier_redrive_tx_duration_seconds_bucket[24h] offset 2d)) by (le)
)
```

> Her gün için `offset` değerini ayarlayarak 7 günlük p99 değerlerini çıkarın:
> `offset 2d`, `offset 3d`, ..., `offset 8d` (ilk 48 saat hariç tutulduğu için 2d'den başlar)

**Adım 2 — Median hesaplama:**

7 günlük p99 değerlerini küçükten büyüğe sıralayın, ortadaki (4.) değeri alın. Bu, baseline'dır.

> **Opsiyonel göz:** p50 ve p90 değerlerine de bakılabilir — genel dağılım hakkında ek bağlam sağlar, ancak eşik hesaplamasında yalnızca p99 kullanılır.

##### Eşik Formülü ve Çarpan Seçimi

**Formül:**

```
threshold = baseline × çarpan
```

**Çarpan aralığı:** 1.5 – 2.0

| Çarpan | Ne Zaman Kullanılır | Gerekçe |
|--------|---------------------|---------|
| **1.5×** | Düşük-orta trafik, stabil ortam, düşük p99 varyansı | Daha hassas algılama — gerçek sorunları erken yakalar |
| **1.75×** | Orta trafik, normal varyans | Dengeli yaklaşım — çoğu ortam için uygun başlangıç |
| **2.0×** | Yüksek trafik, değişken ortam, sık false positive geçmişi | Daha fazla tolerans — gürültüyü azaltır |

**Karar kriterleri:**

| Kriter | 1.5× yönünde | 2.0× yönünde |
|--------|-------------|-------------|
| Trafik hacmi | Düşük-orta | Yüksek |
| p99 varyansı (günler arası) | Düşük (stabil) | Yüksek (değişken) |
| False positive geçmişi | Yok veya nadir | Sık |
| Ortam stabilitesi | Stabil altyapı | Değişken (scaling, migration vb.) |

> **Başlangıç önerisi:** İlk kalibrasyon için **1.75×** ile başlayın. 2-4 hafta gözlemleyin; false positive oranına göre yukarı veya aşağı ayarlayın.
>
> **Mevsimsel trafik notu:** Hafta içi/hafta sonu trafik farkı belirginse, 7 günlük gözlem penceresi bu farkı doğal olarak yakalar. Ancak mevsimsel veya kampanya bazlı trafik değişikliklerinde çarpan yeniden değerlendirilmelidir (bkz. Kalibrasyon Tetikleyicileri).

##### Gürültü Bastırma Kuralları

Deploy sonrası ilk 24-48 saat, baseline hesaplamasından **hariç tutulmalıdır**:

| Etki | Açıklama |
|------|----------|
| **Cold start** | Uygulama ilk başlatıldığında JIT compilation, class loading vb. geçici yavaşlama |
| **Cache warming** | Boş cache ile ilk sorgular normalden yavaş çalışır |
| **Connection pool ramp-up** | Bağlantı havuzu dolana kadar geçici gecikme |

- **Minimum hariç tutma:** 24 saat
- **Güvenli marj:** 48 saat (önerilir)
- Gözlem penceresi 7 gün olduğundan, hariç tutulan 48 saat sonrası 7 tam gün veri toplanır

##### Ne Zaman Kalibre Edilmeli / Ne Zaman Kalibre Edilmemeli

**✅ Kalibrasyon tetikleyicileri (yeniden kalibrasyon gerektirir):**

| # | Tetikleyici | Açıklama |
|---|-------------|----------|
| 1 | **Trafik pattern değişikliği** | Kullanıcı sayısı veya istek hacminde kalıcı değişiklik (ör. yeni müşteri onboarding) |
| 2 | **Altyapı değişikliği** | DB upgrade, connection pool ayarı, pod scaling, region değişikliği |
| 3 | **False positive artışı** | Alert sık tetikleniyor ama gerçek sorun yok — eşik muhtemelen çok düşük |
| 4 | **False negative şüphesi** | Bilinen yavaşlama var ama alert tetiklenmedi — eşik muhtemelen çok yüksek |
| 5 | **Periyodik gözden geçirme** | 3 ayda bir — trafik pattern'i ve DB performansı değişebilir |

**❌ Kalibrasyon yapılmaması gereken durumlar:**

| # | Durum | Gerekçe |
|---|-------|---------|
| 1 | **Aktif incident sırasında** | Incident verileri baseline'ı bozar — önce incident'ı çözün |
| 2 | **Bilinen trafik anomalisi sırasında** | Kampanya, load test, migration vb. — normal trafik pattern'ini yansıtmaz |
| 3 | **Deploy sonrası ilk 48 saat içinde** | Cold start ve cache warming etkileri baseline'ı yükseltir (bkz. Gürültü Bastırma) |

##### Min Sample Guard Ayarlama Rehberi

Mevcut `min_sample_guard = 0.1 req/s` (5 dk'da ~30 gözlem) başlangıç değeridir. Gerçek trafik hacmine göre ayarlanması gerekebilir:

| Trafik Senaryosu | Gözlem Hızı | Önerilen Guard | Gerekçe |
|-------------------|-------------|----------------|---------|
| **Çok düşük trafik** | < 0.05 req/s | Guard'ı düşür (ör. 0.02) | Aksi halde alert hiç tetiklenmez — düşük trafik ortamında p99 yüksek olsa bile guard engeller |
| **Normal trafik** | 0.05 – 1.0 req/s | 0.1 (varsayılan) | Yeterli gözlem sayısı — p99 güvenilir |
| **Yüksek trafik** | > 1.0 req/s | 0.1 veya artır (ör. 0.5) | Guard zaten aşılıyor — artırma opsiyonel, daha sıkı filtreleme sağlar |

> **Kontrol PromQL sorgusu — mevcut gözlem hızı:**
>
> ```promql
> # Mevcut gözlem hızı (req/s) — guard ile karşılaştırın
> sum(rate(carrier_redrive_tx_duration_seconds_count[5m]))
> ```
>
> Bu değer sürekli olarak guard değerinin altındaysa, guard'ı düşürmeyi değerlendirin.

##### Post-Kalibrasyon Güncelleme Checklist'i

Kalibrasyon tamamlandığında aşağıdaki adımların **tamamı** uygulanmalıdır. Hiçbir adım atlanmamalıdır.

| # | Adım | Dosya / Konum | Detay |
|---|------|---------------|-------|
| 1 | **Yeni eşik değerini hesapla** | — | `threshold = baseline × çarpan` (yukarıdaki formül ve karar matrisine göre) |
| 2 | **Alert kuralını güncelle** | `ops/prometheus/redrive-alerts.yml` | `RedriveTxDurationHigh` expr'ındaki `> 2` → `> <yeni_eşik>` |
| 3 | **Min sample guard'ı değerlendir** | `ops/prometheus/redrive-alerts.yml` | `> 0.1` → trafik hacmine göre gerekirse güncelle (bkz. Min Sample Guard Rehberi) |
| 4 | **YAML kalibrasyon yorumlarını güncelle** | `ops/prometheus/redrive-alerts.yml` | `p99_threshold` ve `min_sample_guard` yorum değerlerini yeni değerlerle güncelle |
| 5 | **Test'leri güncelle** | `redrive-ops-artifacts.spec.ts` | Eşik değerine bağlı test varsa güncelle (not: test'ler eşik değerini doğrulamaz — yalnızca yapısal kontrol) |
| 6 | **CI çalıştır** | — | `npx jest --testPathPattern="redrive-ops-artifacts" --no-coverage` — tüm test'ler yeşil olmalı |
| 7 | **Runbook'u güncelle** | `docs/redrive-ops-runbook.md` | §3 "Beklenen Değer Aralıkları" tablosundaki eşik değerini güncelle, kalibrasyon tarihini not et |
| 8 | **PR oluştur ve review al** | — | Değişiklikleri (alert rule + test + runbook) tek PR'da toplayın, review'a gönderin |
| 9 | **Deploy** | — | CI yeşil + review onaylı → prod deploy |
| 10 | **Rollback planı** | — | Deploy sonrası false positive artarsa → aşağıdaki rollback prosedürünü uygulayın |

**Rollback prosedürü (false positive artarsa):**

| # | Adım | Detay |
|---|------|-------|
| 1 | Eski eşik değerlerini geri yükle | `ops/prometheus/redrive-alerts.yml` → önceki `> <eski_eşik>` değerine dön |
| 2 | YAML yorumlarını geri al | Kalibrasyon hedefi yorumlarını eski değerlerle güncelle |
| 3 | CI çalıştır | Tüm test'ler yeşil olmalı |
| 4 | Deploy | Eski değerlerle prod deploy |
| 5 | Kök neden analizi | False positive neden arttı? Çarpan mı düşük, trafik pattern mi değişti? |

---

### 5. Rollback / Disable path

#### Kill-Switch Referansı

TX duration sorunu devam ediyorsa ve DB tarafı müdahale yeterli olmuyorsa:

> **→ §1 Kill-Switch Prosedürü'ne gidin** — tüm redrive işlemlerini durdurun, ardından kök neden analizi yapın.

#### DB Tarafı Müdahale

| # | Adım | Detay |
|---|------|-------|
| 1 | **Long-running query kill** | `pg_terminate_backend(pid)` ile sorunlu query'leri sonlandırın (bkz. Immediate actions — SQL sorguları) |
| 2 | **Connection pool restart** | Gerekirse connection pool'u restart edin — stale connection'ları temizler |

---

### ❌ Yapma Listesi

1. **Histogram bucket sınırlarını değiştirmeyin** — Mevcut bucket sınırları `[0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10]` olarak tanımlıdır. Bucket sınırlarını değiştirmek mevcut histogram verisini bozar ve trend analizi kırılır. Yeni bucket'lar eski veri ile uyumsuz olur — karşılaştırma yapılamaz.

2. **p99 spike'ını tek başına değerlendirmeyin** — Düşük trafik hacminde p99 noisy olur. `carrier_redrive_success_total` ile cross-check yapın: düşük trafik + yüksek p99 = muhtemelen noise, yüksek trafik + yüksek p99 = gerçek sorun.

```promql
# Cross-check: Trafik hacmi yeterli mi?
rate(carrier_redrive_success_total[5m])
```

---

### 📋 İlgili Alert

| Alert | Severity | `for` | Açıklama |
|-------|----------|-------|----------|
| `RedriveTxDurationHigh` | warning | 5m | `atomicRedrive` tx p99 süresi eşiği aştı (başlangıç: 2s). DB contention, connection pool tükenmesi veya lock-wait olabilir. |

> `RedriveTxDurationHigh` alert'i `for: 5m` ile tanımlıdır — geçici spike'ları filtreler, yalnızca **sürekli** yavaşlama durumunda tetiklenir. Min sample guard sayesinde düşük trafikte false positive üretmez.


---

## §4 Alert Delivery & Triage

### 1. What it means (Semantik)

Alert delivery zinciri, Prometheus'ta fire eden alert'lerin operatörlere ulaşmasını sağlayan uçtan uca akıştır:

```
Prometheus (alert fire) → Alertmanager (routing + gruplama) → Receiver (Slack / PagerDuty)
```

**Çalışma prensibi:**
- Prometheus, `redrive-alerts.yml`'deki koşullar sağlandığında alert fire eder
- Alertmanager, alert label'larına göre (`severity`, `team`, `component`) doğru receiver'a yönlendirir
- Critical alert'ler → PagerDuty (anında pager), Warning alert'ler → Slack (ops kanalı)

**Kullanıcı etkisi:**
- Delivery zinciri çalışıyorsa: operatör alert'ten haberdar olur, runbook'a bakarak müdahale eder
- Delivery zinciri kırıksa: alert Prometheus'ta fire eder ama **hiçbir notification gelmez** — operatör habersiz kalır

**Config konumu:** `ops/alertmanager/alertmanager.yml`

---

### 2. Impact / Blast radius

| Arıza Noktası | Etki | Sonuç |
|----------------|------|-------|
| **Alertmanager down** | Tüm alert notification'ları durur | Prometheus UI'da alert görünür ama notification gelmez |
| **Receiver config hatalı** | Belirli receiver'a giden notification'lar başarısız | PagerDuty veya Slack'e ulaşmaz — Alertmanager loglarında hata |
| **Placeholder doldurulmamış** | Webhook URL / API key geçersiz | Notification gönderimi başarısız — Alertmanager retry eder, sonunda drop eder |
| **Network erişimi yok** | Alertmanager → Slack/PagerDuty bağlantısı kesilmiş | Notification'lar kuyrukta birikir, timeout sonrası kaybolur |
| **Inhibition yanlış yapılandırılmış** | Warning'ler gereksiz susturulur veya hiç susturulmaz | Gürültü artışı veya sessiz kayıp |

**Kritik fark:** Delivery arızası, alert'in **tetiklenmesini** etkilemez — Prometheus hâlâ alert fire eder. Sorun yalnızca **notification delivery** katmanındadır.

---

### 3. Immediate actions — "Alert gelmiyor" kontrol adımları (max 7 adım)

> ⏱️ **Hedef:** İlk 5 dakika içinde tamamlanmalıdır.

| # | Adım | Detay |
|---|------|-------|
| 1 | **Prometheus'ta alert fire ediyor mu?** | Prometheus UI → Alerts sekmesi → alert'in `firing` durumunda olduğunu doğrula |
| 2 | **Alertmanager ayakta mı?** | `<ALERTMANAGER_URL>/#/status` → status sayfası yükleniyor mu? |
| 3 | **Alertmanager alert'i alıyor mu?** | `<ALERTMANAGER_URL>/#/alerts` → fire eden alert listede görünüyor mu? |
| 4 | **Receiver config doğru mu?** | Placeholder'lar doldurulmuş mu? Webhook URL / API key geçerli mi? |
| 5 | **Network erişimi var mı?** | Alertmanager → Slack/PagerDuty bağlantısını test et |
| 6 | **Inhibition susturuyor mu?** | Critical alert aktifken warning susturulur — `<ALERTMANAGER_URL>/#/silences` ve inhibition kurallarını kontrol et |
| 7 | **Alertmanager loglarını incele** | Notification gönderim hataları logda görünür — `notification_errors_total` metriğini kontrol et |

---

### 4. Deep dive (Araştırma)

#### Delivery Akış Matrisi

| Alert | Severity | Receiver | repeat_interval | Inhibition |
|-------|----------|----------|-----------------|------------|
| `RedriveRateCheckFailed` | critical | pagerduty-critical | 1h | — (source) |
| `RedriveTxDurationHigh` | warning | slack-warning | 2h | Critical aktifken susturulur |
| `RedriveKillSwitchActive` | warning | slack-warning | 2h | Critical aktifken susturulur |
| `RedriveDepthExceeded` | warning | slack-warning | 2h | Critical aktifken susturulur |

#### Catch-All Davranışı

Label eksik veya yanlış olan alert'ler `slack-default` receiver'a düşer (sessizce kaybolmaz):

| Eksik/Yanlış Label | Sonuç |
|---------------------|-------|
| `team` yok/yanlış | `slack-default` |
| `component` yok/yanlış | `slack-default` |
| `severity` yok/geçersiz | `slack-default` |

#### Timing Parametreleri

| Parametre | Değer | Açıklama |
|-----------|-------|----------|
| `group_wait` | 30s | İlk alert sonrası gruplama bekleme süresi |
| `group_interval` | 5m | Gruba yeni alert ekleme aralığı |
| `repeat_interval` (critical) | 1h | Critical tekrar hatırlatma |
| `repeat_interval` (warning) | 2h | Warning tekrar hatırlatma |
| `resolve_timeout` | 5m | Resolve sonrası bekleme |

#### Alertmanager Kontrol URL'leri

| URL | Açıklama |
|-----|----------|
| `<ALERTMANAGER_URL>/#/status` | Config durumu, uptime, cluster bilgisi |
| `<ALERTMANAGER_URL>/#/alerts` | Aktif alert'ler ve grupları |
| `<ALERTMANAGER_URL>/#/silences` | Aktif silence'lar (mute edilmiş alert'ler) |

---

### 5. Rollback / Disable path

#### Config Geri Alma

| # | Adım | Detay |
|---|------|-------|
| 1 | **Önceki config'i geri yükle** | Git'ten önceki `alertmanager.yml` versiyonunu checkout edin |
| 2 | **Alertmanager'ı reload edin** | `curl -X POST <ALERTMANAGER_URL>/-/reload` veya pod restart |
| 3 | **Status doğrula** | `<ALERTMANAGER_URL>/#/status` → config yüklenme zamanını kontrol edin |

#### Receiver Değiştirme

Belirli bir receiver sorunluysa (ör. PagerDuty erişilemez):
1. Route tree'de ilgili receiver'ı geçici olarak `slack-warning` veya `slack-default` ile değiştirin
2. Alertmanager'ı reload edin
3. Sorun çözülünce orijinal receiver'a geri dönün

---

### 🔇 Maintenance / Mute Mekanizması

#### Planlı Bakım Sırasında Alert Susturma

**Yöntem 1 — Alertmanager Silence (ad-hoc):**

```bash
# Belirli component için 2 saatlik silence oluştur
amtool silence add component=redrive --duration=2h --comment="Planlı bakım"

# Aktif silence'ları listele
amtool silence query

# Silence kaldır
amtool silence expire <silence-id>
```

Alternatif olarak Alertmanager UI (`<ALERTMANAGER_URL>/#/silences`) üzerinden de silence oluşturulabilir.

**Yöntem 2 — Mute Time Intervals (zamanlı, Alertmanager v0.24+):**

`alertmanager.yml`'de `time_intervals` tanımlanarak belirli zaman pencerelerinde alert'ler otomatik olarak susturulabilir. Bu, tekrarlayan bakım pencereleri için uygundur.

> ⚠️ **Bakım sonrası silence kaldırmayı unutmayın!** Aktif silence'lar alert delivery'yi engeller. Bakım tamamlandığında `amtool silence expire` veya Alertmanager UI ile silence'ı kaldırın. Unutulan silence = kör nokta.

---

### ❌ Yapma Listesi

1. **Alertmanager config'ini placeholder'larla prod'a deploy etmeyin** — `<SLACK_WEBHOOK_URL>` ve `<PAGERDUTY_SERVICE_KEY>` placeholder'ları gerçek değerlerle değiştirilmeden deploy edilirse notification'lar başarısız olur.

2. **Silence oluşturup kaldırmayı unutmayın** — Bakım sonrası aktif silence, tüm alert delivery'yi engeller. Bu, "metric gelmiyor = alert yok" kadar tehlikeli bir kör noktadır.

---

### 📋 İlgili Config

| Dosya | Konum | Açıklama |
|-------|-------|----------|
| Alertmanager config | `ops/alertmanager/alertmanager.yml` | Route tree, receivers, inhibitions |
| Alert rules | `ops/prometheus/redrive-alerts.yml` | 4 alert kuralı (Phase 13 — LOCKED) |
| Ops runbook | `docs/redrive-ops-runbook.md` | Bu dosya |


---

## §5 Scrape Health / RedriveScrapeDown

### 1. What it means (Semantik)

Prometheus, redrive `/metrics` endpoint'ine ulaşamıyor veya job tanımı kaldırılmış/rename edilmiş. `(up{job="hukuk-api-redrive"} == 0) OR absent(up{job="hukuk-api-redrive"})` durumu 2 dakikadan fazla sürüyor.

**Bu, "alert'lerin alert'i" — meta-monitoring.** Scrape başarısız olduğunda mevcut 4 alert rule tetiklenemez çünkü metrik verisi yoktur.

### 2. Impact / Blast radius

- **Tüm 4 redrive alert'i sessiz kalır** — metrik verisi olmadan rule'lar tetiklenemez
- Kill-switch, rate limit, depth, tx duration sorunları tespit edilemez
- Bu, observability katmanının tamamen devre dışı kalması demektir
- `absent()` durumunda: job tanımı kaldırılmış veya rename edilmiş — Prometheus bu target'ı artık scrape etmiyor

### 3. Immediate actions

| # | Adım | Komut / Kontrol |
|---|------|-----------------|
| 1 | Pod durumunu kontrol et | `kubectl get pods -l app=hukuk-api` |
| 2 | Pod loglarını kontrol et | `kubectl logs -l app=hukuk-api --tail=50` |
| 3 | Endpoint erişimini test et | `curl -s http://<pod-ip>:<port>/metrics \| head -5` |
| 4 | Prometheus targets UI kontrol et | `<PROMETHEUS_URL>/targets` — target state: UP/DOWN |
| 5 | Network policy kontrol et | `kubectl get networkpolicy -n <namespace>` |
| 6 | Prometheus scrape config kontrol et | `job_name: hukuk-api-redrive` mevcut mu? |
| 7 | Son başarılı scrape zamanını kontrol et | Prometheus UI: `up{job="hukuk-api-redrive"}` |

### 4. Deep dive

- Prometheus scrape error logları: `<PROMETHEUS_URL>/targets` → error column
- Pod restart count: `kubectl get pods -l app=hukuk-api -o wide`
- OOMKilled / CrashLoopBackOff kontrolü
- DNS resolution: `nslookup <service-name>.<namespace>.svc.cluster.local`
- Job tanımı kontrolü: Prometheus config'de `job_name: hukuk-api-redrive` mevcut mu?

### 5. Rollback / Disable path

- Pod restart: `kubectl rollout restart deployment/hukuk-api`
- Scrape config geçici devre dışı bırakma: Prometheus config'den job kaldır (dikkat: tüm metrikler kaybolur)
- Alert geçici susturma: `amtool silence add alertname=RedriveScrapeDown`

---

### İlgili Alert

| Alert | Severity | for | Tetikleyici |
|-------|----------|-----|-------------|
| `RedriveScrapeDown` | critical | 2m | `(up{job="hukuk-api-redrive"} == 0) OR absent(up{job="hukuk-api-redrive"})` |

### İlgili PromQL

```promql
(up{job="hukuk-api-redrive"} == 0) or absent(up{job="hukuk-api-redrive"})
```

```promql
up{job="hukuk-api-redrive"}
```

---

### ❌ Yapma Listesi

1. **Scrape failure'ı görmezden gelme** — tüm alert'ler sessiz kalır, observability katmanı tamamen devre dışı kalır
2. **Pod'u silmeden önce logları al** — root cause analizi için log gerekli, silinen pod'un logları kaybolur
3. **Alert'i kalıcı olarak susturma** — silence geçici olmalı, root cause çözülmeli

---

### ⚠️ Job Label Bağımlılığı

- Alert expr `job="hukuk-api-redrive"` kullanır
- Bu değer Prometheus scrape config'indeki `job_name` ile birebir eşleşmelidir
- Job adı değişirse alert expr de güncellenmelidir
- `absent()` kombinasyonu sayesinde job rename/kaldırma durumu da yakalanır — ancak yeni job adıyla alert expr güncellenmezse yeni target izlenemez