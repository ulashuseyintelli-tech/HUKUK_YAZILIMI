# Requirements Document — Phase 13.2: Scrape Health Alert

## Giriş

Phase 13.2, Phase 13 architecture.md'de tespit edilen G1 gap'ini kapatır: `up == 0` scrape health alert'i tanımsız — Prometheus scrape failure durumunda mevcut 4 alert sessiz kalır.

**Motivasyon (G1 Gap):** Scrape fail olduğunda metrik verisi gelmez → alert rule'lar tetiklenmez → "metrik gelmiyor = alert yok" kör noktası oluşur. Bu, tüm observability katmanını devre dışı bırakabilir.

**Bağımlılık:**
- Phase 13 Ops Doc & Alert Rules (CLOSED) — 4 alert rule, label contract LOCKED
- Phase 13.1 Alertmanager Routing (CLOSED) — delivery zinciri kurulu, routing config mevcut

**Ön Koşul:** Prometheus server kurulu ve `up` metriği otomatik olarak scrape edilen her job için üretilir (Prometheus built-in davranışı).

## Kapsam Dışı (Non-Goals)

- Mevcut 4 alert rule'da değişiklik (Phase 13 LOCKED)
- Alertmanager config değişikliği (Phase 13.1 LOCKED — yeni alert mevcut routing'e otomatik girer)
- Grafana dashboard oluşturma
- Yeni uygulama kodu
- p99 eşik kalibrasyonu (G3 — ayrı iş kalemi)
- Multi-job scrape health (yalnızca redrive job'u scope'ta)

## Sözlük (Glossary)

- **`up` metriği:** Prometheus'un her scrape target'ı için otomatik ürettiği built-in metrik. `1` = scrape başarılı, `0` = scrape başarısız.
- **Scrape failure:** Prometheus'un `/metrics` endpoint'ine ulaşamaması — network hatası, pod crash, endpoint down, timeout vb.
- **Kör nokta (blind spot):** Scrape fail olduğunda hiçbir alert tetiklenemez çünkü metrik verisi yoktur.

## Label Contract — Yeni Alert

Yeni alert, Phase 13 label contract'ını takip eder:

| Label | Değer | Gerekçe |
|-------|-------|---------|
| `severity` | `critical` | Scrape failure tüm observability'yi devre dışı bırakır — en yüksek severity |
| `team` | `backend` | Mevcut contract ile tutarlı |
| `component` | `redrive` | Mevcut contract ile tutarlı |

**Routing davranışı:** `severity: critical` + `team: backend` + `component: redrive` → Phase 13.1 route tree'sine göre `pagerduty-critical` receiver'a gider. Ek Alertmanager config değişikliği gerekmez.

## Gereksinimler

### Gereksinim 1: Scrape Health Alert Rule (FR-13.2.1)

**User Story:** Bir SRE mühendisi olarak, Prometheus scrape'inin başarısız olduğunu bilmek istiyorum, böylece "metrik gelmiyor = alert yok" kör noktasından haberdar olurum.

#### Kabul Kriterleri

1. THE Alert SHALL `(up{job="hukuk-api-redrive"} == 0) OR absent(up{job="hukuk-api-redrive"})` ifadesini kullanmalıdır — hem "target down" hem "job yok/rename edildi" durumunu yakalar. `absent()` Prometheus built-in fonksiyonudur; job tamamen kaldırılırsa `up` time series absent olur ve `== 0` tek başına tetiklenmez.
2. THE Alert SHALL `for: 2m` kullanmalıdır — geçici scrape timeout'larını süzmek için (tek bir başarısız scrape'te hemen tetiklenmemeli). Varsayılan eval interval 15s ise ~8 cycle, 30s ise ~4 cycle; her iki durumda da makul denge.
3. THE Alert SHALL `severity: critical` label'ı taşımalıdır — scrape failure tüm alert'leri devre dışı bırakır
4. THE Alert SHALL `team: backend` ve `component: redrive` label'larını taşımalıdır (mevcut contract)
5. THE Alert SHALL `summary`, `description` ve `runbook` annotation'larını içermelidir
6. THE Alert adı `RedriveScrapeDown` olmalıdır
7. THE Alert `runbook` annotation'ı `docs/redrive-ops-runbook.md#` ile başlamalı ve ops doc'taki ilgili bölüme işaret etmelidir

### Gereksinim 2: Alert Rules Dosyası Güncellemesi (FR-13.2.2)

**User Story:** Bir DevOps mühendisi olarak, yeni alert'in mevcut alert rules dosyasına eklenmesini istiyorum, böylece tek dosyada tüm redrive alert'leri yönetilir.

#### Kabul Kriterleri

1. THE Alert SHALL mevcut `ops/prometheus/redrive-alerts.yml` dosyasına eklenmelidir (yeni dosya oluşturulmamalı)
2. THE Alert SHALL mevcut `redrive_alerts` group'una eklenmelidir
3. THE Dosya SHALL mevcut 4 alert'i değiştirmemelidir (LOCKED)
4. THE Dosya SHALL `amtool` veya `promtool check rules` ile hatasız validate edilmelidir

### Gereksinim 3: Ops Doc Güncellemesi (FR-13.2.3)

**User Story:** Bir operatör olarak, scrape failure durumunda ne yapacağımı bilmek istiyorum, böylece kör noktayı hızlıca tespit ve çözebilirim.

#### Kabul Kriterleri

1. THE Ops_Doc SHALL mevcut §0 bölümündeki "Scrape Health İzleme" alt bölümünü genişletmelidir — veya yeni bir §5 bölümü eklenmelidir (hangisi daha uygunsa)
2. THE Bölüm SHALL Runbook DoD yapısını takip etmelidir: What it means, Impact/Blast radius, Immediate actions (max 7 adım), Deep dive, Rollback/Disable path
3. THE Bölüm SHALL `RedriveScrapeDown` alert'inin ne anlama geldiğini açıklamalıdır
4. THE Bölüm SHALL scrape failure kontrol adımlarını içermelidir (pod status, network, endpoint health, Prometheus targets UI)
5. THE TOC SHALL yeni bölüm ile güncellenmelidir (eğer yeni § ekleniyorsa)
6. THE Bölüm SHALL "İlgili Alert" alt bölümünde `RedriveScrapeDown` alert'ini referans vermelidir

### Gereksinim 4: Test Güncellemesi (FR-13.2.4)

**User Story:** Bir geliştirici olarak, yeni alert'in mevcut CI test suite'ine dahil edilmesini istiyorum, böylece regresyon koruması devam eder.

#### Kabul Kriterleri

1. THE Test SHALL mevcut `redrive-ops-artifacts.spec.ts` dosyasındaki testlerin yeni alert'i kapsayacak şekilde güncellenmesini sağlamalıdır
2. THE Phase 13 Property 1 (yapısal bütünlük) testleri SHALL `EXPECTED_ALERT_NAMES` listesine `RedriveScrapeDown` eklenmelidir
3. THE Phase 13 Property 3 (alert ↔ runbook eşleşme) testleri SHALL yeni alert'in runbook anchor'ını doğrulamalıdır
4. THE Tüm mevcut testler SHALL geçmeye devam etmelidir (regresyon yok)

### Gereksinim 5: Non-Functional Requirements (NFR-13.2.1)

#### Kabul Kriterleri

1. THE Phase 13.2 SHALL yeni uygulama kodu içermemelidir
2. THE Phase 13.2 SHALL mevcut 4 alert rule'u değiştirmemelidir (LOCKED)
3. THE Phase 13.2 SHALL Alertmanager config'ini değiştirmemelidir (Phase 13.1 LOCKED — yeni alert mevcut routing'e otomatik girer)
4. THE `for: 2m` değeri SHALL başlangıç değeridir — prod ortamında scrape interval'e göre ayarlanabilir
5. THE `job` label değeri (`hukuk-api-redrive`) SHALL Prometheus scrape config'indeki job adı ile eşleşmelidir — farklı job adı kullanılıyorsa alert expr güncellenmeli

## Tasarım Kararları

### PromQL: `absent()` Kombinasyonu Gerekçesi

- `up{job="hukuk-api-redrive"} == 0` — target down durumunu yakalar (scrape fail, pod crash, endpoint unreachable)
- `absent(up{job="hukuk-api-redrive"})` — job tamamen kaldırılmış veya rename edilmiş durumu yakalar (time series absent → `== 0` tek başına tetiklenmez)
- `OR` kombinasyonu her iki kör noktayı kapatır — gerçek meta-monitoring
- `absent()` Prometheus built-in fonksiyonudur, regex'e ihtiyaç yoktur

### `for: 2m` Gerekçesi

- Prometheus default scrape interval: 15s (eval interval 15s ise ~8 cycle, 30s ise ~4 cycle)
- 2m ≈ 8 scrape cycle — tek bir timeout veya geçici network blip'i filtrelenir
- `for: 0m` kullanılırsa her geçici scrape failure'da false positive üretir
- `for: 5m` kullanılırsa gerçek down durumunda 5 dk kör kalınır
- 2m, "hızlı tespit + false positive azaltma" dengesi

### `severity: critical` Gerekçesi

- Scrape failure = tüm 4 alert sessiz kalır
- Bu, "alert'lerin alert'i" — meta-monitoring
- Warning olarak tanımlanırsa inhibition kuralı gereği critical aktifken susturulabilir (yanlış davranış)
- Critical olarak tanımlanırsa PagerDuty'ye gider — doğru, çünkü tüm observability devre dışı

### Job Label Stratejisi

- `up{job="hukuk-api-redrive"}` — spesifik job filter
- `up{job=~".*redrive.*"}` regex alternatifi var ama gereksiz genişlik riski taşır
- Spesifik job adı, Prometheus scrape config'indeki `job_name` ile birebir eşleşmeli
- Job adı değişirse alert expr de güncellenmeli — bu bağımlılık ops doc'ta belgelenmeli
- `absent()` kombinasyonu sayesinde job rename/kaldırma durumu da yakalanır

### Alert Label Contract (Routing Garantisi)

Yeni alert'in Phase 13.1 routing'e deterministik girmesi için aşağıdaki label set'i **zorunludur** ve spec seviyesinde kilitlidir:

| Label/Annotation | Değer | Routing Etkisi |
|-------------------|-------|----------------|
| `severity` | `critical` | → `pagerduty-critical` receiver |
| `team` | `backend` | → `team=backend` route match |
| `component` | `redrive` | → `component=redrive` route match + inhibition `equal` |
| `runbook` | `docs/redrive-ops-runbook.md#<§5-anchor>` | Ops doc link — CI-enforced |

Bu label set'i eksik veya yanlış olursa alert `slack-default` catch-all'a düşer — routing deterministik kalmaz. CI testleri (Property 1) bu kontratı enforce eder.
