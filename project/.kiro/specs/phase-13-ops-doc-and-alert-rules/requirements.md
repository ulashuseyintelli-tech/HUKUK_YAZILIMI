# Requirements Document — Phase 13: Ops Doc & Alert Rules

## Giriş

Phase 13, DLQ redrive mekanizmasının operasyonel dokümanını (runbook) ve Prometheus alert kurallarını oluşturur. Phase 11.x mimariyi kilitledi, Phase 12 observability ve kill-switch ekledi; Phase 13 "metrikler var ama ne zaman, nasıl müdahale edilir?" sorusunu cevaplar.

Bu phase yeni uygulama kodu içermez — çıktılar bir markdown runbook ve bir Prometheus alerting rules YAML dosyasıdır.

**Bağımlılık:** Phase 12 Redrive Operational Safeguards (DONE/LOCKED) — tx duration histogram, kill-switch, kill-switch metrikleri mevcut.

**Ön Koşul:** `/metrics` endpoint'i mevcut ve Prometheus tarafından scrape edilebilir durumda olmalıdır (Phase 12 sonrası). Scrape yapılandırması yoksa alert rules aktif edilemez.

## Kapsam Dışı (Non-Goals)

- Yeni NestJS modülü veya uygulama kodu
- Yeni metrik tanımı (mevcut metrikler yeterli)
- Grafana dashboard JSON'ları (ayrı iş kalemi)
- SLO/SLA tanımları (organizasyonel karar, spec dışı)
- `/metrics` endpoint'ine auth eklenmesi (altyapı kararı — ops doc'ta uyarı olarak belgelenir)

## Sözlük (Glossary)

- **Ops_Doc**: Operatör ve SRE mühendisleri için adım-adım prosedür ve referans içeren markdown runbook dosyası. Her bölüm: Trigger/Sinyal → İlk Kontrol → Aksiyonlar → Yapma Listesi yapısını takip eder.
- **Alert_Rule**: Prometheus alerting rule — belirli bir metrik koşulu sağlandığında tetiklenen uyarı tanımı (YAML formatında).
- **Kill_Switch**: `REDRIVE_DISABLED` env var ile `POST /redrive` endpoint'ini devre dışı bırakan mekanizma (Phase 12).
- **TX_Duration**: `atomicRedrive` transaction süresi — `carrier_redrive_tx_duration_seconds` histogram metriği ile ölçülür (Phase 12).
- **Rate_Limit**: Correlation chain bazında üstel backoff ile redrive hız sınırlaması (Phase 11.4).
- **p99**: 99. yüzdelik dilim — isteklerin %99'unun altında kaldığı süre değeri.
- **Kalibrasyon**: Alert eşik değerlerinin gerçek production verisine göre ayarlanması prosedürü.
- **Runbook_Ref**: Alert annotation'ında ilgili ops doc bölümüne verilen referans bağlantısı.

## Metrik + Label Contract (LOCKED — Cardinality Guard)

Phase 13'ün referans aldığı tüm metrikler Phase 11.3, 11.4 ve 12'de kilitlenmiştir. Aşağıdaki tablo, alert rule expr'larında ve ops doc PromQL sorgularında kullanılacak kesin metrik isimlerini, tiplerini ve label set'lerini tanımlar. Bu contract dışında metrik referansı yapılamaz.

| Metrik | Tip | Labels | Cardinality | Phase |
|--------|-----|--------|-------------|-------|
| `carrier_redrive_tx_duration_seconds` | Histogram | **none** | 1 | 12 |
| `carrier_redrive_kill_switch_active` | Gauge | **none** | 1 | 12 |
| `carrier_redrive_disabled_total` | Counter | **none** | 1 | 12 |
| `carrier_redrive_rate_check_failed_total` | Counter | **none** | 1 | 11.4 |
| `carrier_redrive_rate_limited_total` | Counter | `gate` (precheck\|tx) | 2 | 11.4 |
| `carrier_redrive_backoff_seconds` | Histogram | **none** | 1 | 11.4 |
| `carrier_redrive_backoff_applied_total` | Counter | `count_bucket` | N (bounded) | 11.4 |
| `carrier_redrive_depth_exceeded_total` | Counter | **none** | 1 | 11.3 |
| `carrier_redrive_success_total` | Counter | **none** | 1 | — |

**Cardinality kuralı:** Label'sız metrikler cardinality = 1. `gate` label'ı 2 değer alır (precheck, tx). `count_bucket` bounded'dır. Alert expr'larında `by()` clause kullanılırken bu label set'e uyulmalıdır — ek label eklenmez.

**Ops doc'ta belgeleme:** Her metriğin label durumu (var/yok, intentional) ops doc'un ilgili bölümünde açıkça yazılmalıdır.

## TX Duration p99 Hesap Yöntemi (LOCKED)

`RedriveTxDurationHigh` alert'inde kullanılan p99 değeri **Prometheus `histogram_quantile()` fonksiyonu** ile server-side hesaplanır. App içinde hesaplanan custom gauge veya summary değildir.

**Kesin PromQL:**
```promql
histogram_quantile(0.99,
  sum(rate(carrier_redrive_tx_duration_seconds_bucket[5m])) by (le)
)
```

**Aggregation kuralı:** `sum(...) by (le)` ile instance/pod bazında değil, servis bazında aggregate edilir. Bu, multi-pod deployment'ta doğru p99 hesabı sağlar.

**Min sample guard:** Düşük trafik hacminde p99 anlamsız olabilir. Alert expr'ında `and` clause ile minimum gözlem sayısı guard'ı eklenmelidir:
```promql
histogram_quantile(0.99, sum(rate(carrier_redrive_tx_duration_seconds_bucket[5m])) by (le))
  > 2
and
  sum(rate(carrier_redrive_tx_duration_seconds_count[5m])) > 0.1
```
Bu, 5 dakikada en az ~30 gözlem (0.1 req/s × 300s) olmasını gerektirir. Kalibrasyon prosedüründe bu eşik production trafiğine göre ayarlanır.

## Runbook Minimum İçerik Standardı (Definition of Done)

Ops doc'taki her playbook bölümü (§1 Kill-Switch, §2 Rate Limiting, §3 TX Duration) aşağıdaki 5 maddelik yapıyı **zorunlu olarak** içermelidir:

1. **What it means (Semantik)** — Bu sinyal/durum ne anlama geliyor? Kullanıcı etkisi nedir?
2. **Impact / Blast radius** — Etki alanı: hangi endpoint'ler, hangi kullanıcılar, hangi veri akışları etkilenir?
3. **Immediate actions (5 dk içinde)** — İlk 5 dakikada yapılacak acil aksiyonlar (max 7 adım)
4. **Deep dive (Araştırma)** — Log, trace, DB check, PromQL sorguları ile kök neden analizi adımları
5. **Rollback / Disable path** — Geri alma veya devre dışı bırakma prosedürü (kill-switch dahil)

Bu 5 madde her bölümde explicit başlık veya alt başlık olarak yer almalıdır. Eksik madde olan bölüm "tamamlanmış" sayılmaz.

## Gereksinimler

### Gereksinim 1: Ops Doc — Kill-Switch Prosedürü (FR-13.1)

**User Story:** Bir operatör olarak, incident anında kill-switch'i nasıl etkinleştirip devre dışı bırakacağımı ve doğrulama adımlarını bilmek istiyorum, böylece panik anında bile doğru adımları takip edebilirim.

#### Kabul Kriterleri

1. THE Ops_Doc SHALL kill-switch bölümünde tetikleyici sinyalleri belgelemelidir (hangi metrik/HTTP durumu kill-switch kullanımını gerektirir)
2. THE Ops_Doc SHALL kill-switch'i etkinleştirmek için maksimum 7 adımlık sıralı talimatlar içermelidir (env var ayarlama, pod restart, doğrulama)
3. THE Ops_Doc SHALL kill-switch'i devre dışı bırakmak (rollback) için adım-adım talimatlar içermelidir
4. THE Ops_Doc SHALL kill-switch etkinleştirme sonrası doğrulama adımlarını içermelidir (`carrier_redrive_kill_switch_active == 1` kontrolü, `carrier_redrive_disabled_total` artışı kontrolü, HTTP 503 yanıt kontrolü)
5. THE Ops_Doc SHALL kill-switch'in etkilediği ve etkilemediği endpoint'leri açıkça listelemelidir (`POST /redrive` etkilenir; read-only DLQ endpoint'leri ve `POST /resolve` etkilenmez)
6. THE Ops_Doc SHALL kill-switch bölümünde en az 1 maddelik "Yapma" listesi içermelidir (örn. "Kill-switch aktifken resolve endpoint'ini devre dışı bırakmayın")
7. THE Ops_Doc SHALL kill-switch'in ne zaman kullanılması gerektiğine dair karar kriterlerini içermelidir (örn. tx duration spike, downstream servis arızası, veri tutarsızlığı şüphesi)
8. THE Ops_Doc SHALL kill-switch bölümünde Runbook DoD yapısını takip etmelidir: (1) What it means / semantik, (2) Impact / blast radius, (3) Immediate actions, (4) Deep dive, (5) Rollback / disable path

### Gereksinim 2: Ops Doc — Rate Limiting Operasyonel Rehber (FR-13.2)

**User Story:** Bir SRE mühendisi olarak, rate limiting konfigürasyonunu ve ilgili metrikleri anlamak istiyorum, böylece backoff parametrelerini tune edebilir ve retry storm'ları tespit edebilirim.

#### Kabul Kriterleri

1. THE Ops_Doc SHALL mevcut backoff konfigürasyon değerlerini tablo formatında listelemelidir (`baseMs`, `capExponent`, `maxBackoffMs`, `jitterPct` ve varsayılan değerleri)
2. THE Ops_Doc SHALL her konfigürasyon parametresinin ne anlama geldiğini ve değiştirildiğinde sistemin nasıl etkileneceğini açıklamalıdır
3. THE Ops_Doc SHALL rate limiting ile ilgili metrikleri ve her birinin ne anlama geldiğini listelemelidir (`carrier_redrive_rate_limited_total`, `carrier_redrive_rate_check_failed_total`, `carrier_redrive_backoff_seconds`, `carrier_redrive_backoff_applied_total`)
4. THE Ops_Doc SHALL `carrier_redrive_rate_check_failed_total > 0` durumunun kritik olduğunu ve acil araştırma gerektirdiğini belgelemelidir (tetikleyici sinyal)
5. THE Ops_Doc SHALL rate limit parametrelerini tune etmek için örnek PromQL sorguları içermelidir
6. THE Ops_Doc SHALL rate limiting bölümünde en az 1 maddelik "Yapma" listesi içermelidir (örn. "baseMs'i 0'a ayarlamayın — cooldown'ı tamamen devre dışı bırakır")
7. THE Ops_Doc SHALL rate limiting bölümünde izlenecek aksiyonları sıralı adımlar halinde belgelemelidir (retry storm tespit → metrik kontrol → parametre ayarlama)
8. THE Ops_Doc SHALL rate limiting bölümünde Runbook DoD yapısını takip etmelidir: (1) What it means / semantik, (2) Impact / blast radius, (3) Immediate actions, (4) Deep dive, (5) Rollback / disable path

### Gereksinim 3: Ops Doc — TX Duration İzleme (FR-13.3)

**User Story:** Bir SRE mühendisi olarak, `atomicRedrive` transaction süresinin dağılımını nasıl yorumlayacağımı ve ne zaman müdahale edeceğimi bilmek istiyorum, böylece contention ve yavaşlamayı proaktif olarak tespit edebilirim.

#### Kabul Kriterleri

1. THE Ops_Doc SHALL `carrier_redrive_tx_duration_seconds` histogram metriğinin ne ölçtüğünü açıklamalıdır (tx begin → commit/rollback, tüm outcome'lar dahil)
2. THE Ops_Doc SHALL p50, p95 ve p99 değerlerinin nasıl hesaplanacağını PromQL sorguları ile göstermelidir
3. THE Ops_Doc SHALL normal operasyonda beklenen p50/p95/p99 aralıklarını başlangıç referans değerleri olarak belgelemelidir (kalibrasyon öncesi tahmini değerler)
4. THE Ops_Doc SHALL tx duration alert eşik değerinin kalibrasyon prosedürünü belgelemelidir: production verisinden p99 baseline çıkarma → eşik belirleme → periyodik gözden geçirme
5. THE Ops_Doc SHALL tx duration yüksek olduğunda izlenecek eskalasyon adımlarını sıralı olarak içermelidir (DB contention kontrolü, connection pool durumu, lock-wait analizi)
6. THE Ops_Doc SHALL tx duration bölümünde en az 1 maddelik "Yapma" listesi içermelidir (örn. "Bucket sınırlarını değiştirmeyin — mevcut histogram verisi bozulur")
7. THE Ops_Doc SHALL tx duration bölümünde Runbook DoD yapısını takip etmelidir: (1) What it means / semantik, (2) Impact / blast radius, (3) Immediate actions, (4) Deep dive, (5) Rollback / disable path

### Gereksinim 4: Ops Doc — /metrics Güvenlik Notu (FR-13.4)

**User Story:** Bir DevOps mühendisi olarak, `/metrics` endpoint'inin güvenlik durumunu bilmek istiyorum, böylece production ortamında uygun erişim kontrolü sağlayabilirim.

#### Kabul Kriterleri

1. THE Ops_Doc SHALL `/metrics` endpoint'inin auth içermediğini açıkça belgelemelidir
2. THE Ops_Doc SHALL production ortamında `/metrics` endpoint'inin korunması için minimum güvenlik gereksinimlerini belgelemelidir: (a) public erişime kapalı olmalı, (b) internal network kısıtlaması veya IP allowlist uygulanmalı, (c) mümkünse ayrı port veya sidecar ile expose edilmeli
3. THE Ops_Doc SHALL bu güvenlik notunu belgenin başında kritik uyarı olarak göze çarpacak şekilde yerleştirmelidir

### Gereksinim 5: Prometheus Alert Rules — Rate Check Failed (FR-13.5)

**User Story:** Bir SRE mühendisi olarak, rate limit pre-check'in fail-closed tetiklediğinde anında haberdar olmak istiyorum, böylece olası bir bug veya veri bozulmasını hızla araştırabilirim.

#### Kabul Kriterleri

1. THE Alert_Rule SHALL `RedriveRateCheckFailed` adında bir alert tanımlamalıdır
2. THE Alert_Rule SHALL `carrier_redrive_rate_check_failed_total` metriğinin artışını tespit etmelidir (`increase()` veya `rate()` fonksiyonu ile)
3. THE Alert_Rule SHALL severity label'ını `critical` olarak ayarlamalıdır
4. THE Alert_Rule SHALL açıklayıcı `summary` ve `description` annotation'ları içermelidir
5. THE Alert_Rule SHALL `runbook` annotation'ında ops doc'taki Rate Limiting bölümüne referans vermelidir

### Gereksinim 6: Prometheus Alert Rules — TX Duration High (FR-13.6)

**User Story:** Bir SRE mühendisi olarak, `atomicRedrive` transaction süresinin p99 değeri eşiği aştığında uyarı almak istiyorum, böylece DB contention veya yavaşlamayı erken tespit edebilirim.

#### Kabul Kriterleri

1. THE Alert_Rule SHALL `RedriveTxDurationHigh` adında bir alert tanımlamalıdır
2. THE Alert_Rule SHALL `carrier_redrive_tx_duration_seconds` histogram metriğinin p99 değerini `histogram_quantile()` fonksiyonu ile hesaplamalıdır — `sum(rate(..._bucket[5m])) by (le)` ile servis bazında aggregate edilmelidir (instance/pod bazında değil)
3. THE Alert_Rule SHALL başlangıç eşik değerini belgelemelidir (kalibrasyon öncesi makul bir varsayılan) — bu değer ops doc'taki kalibrasyon prosedürüne göre ayarlanmalıdır
4. THE Alert_Rule SHALL severity label'ını `warning` olarak ayarlamalıdır
5. THE Alert_Rule SHALL `runbook` annotation'ında ops doc'taki TX Duration İzleme bölümüne referans vermelidir
6. THE Alert_Rule SHALL düşük trafik hacminde false positive önlemek için minimum gözlem sayısı guard'ı içermelidir (`and sum(rate(..._count[5m])) > threshold`)

### Gereksinim 7: Prometheus Alert Rules — Kill-Switch Active (FR-13.7)

**User Story:** Bir operatör olarak, kill-switch'in belirli bir süreden fazla aktif kaldığında uyarı almak istiyorum, böylece kill-switch'in kapatılmasının unutulmasını önleyebilirim.

#### Kabul Kriterleri

1. THE Alert_Rule SHALL `RedriveKillSwitchActive` adında bir alert tanımlamalıdır
2. THE Alert_Rule SHALL `carrier_redrive_kill_switch_active == 1` koşulunu belirli bir süre (`for` clause) boyunca kontrol etmelidir
3. THE Alert_Rule SHALL severity label'ını `warning` olarak ayarlamalıdır
4. THE Alert_Rule SHALL `runbook` annotation'ında ops doc'taki Kill-Switch Prosedürü bölümüne referans vermelidir

### Gereksinim 8: Prometheus Alert Rules — Depth Exceeded (FR-13.8)

**User Story:** Bir SRE mühendisi olarak, redrive derinlik limitinin aşıldığı durumlardan haberdar olmak istiyorum, böylece poison entry'leri ve tekrarlayan hataları takip edebilirim.

#### Kabul Kriterleri

1. THE Alert_Rule SHALL `RedriveDepthExceeded` adında bir alert tanımlamalıdır
2. THE Alert_Rule SHALL `carrier_redrive_depth_exceeded_total` metriğinin artışını tespit etmelidir
3. THE Alert_Rule SHALL severity label'ını `warning` olarak ayarlamalıdır
4. THE Alert_Rule SHALL açıklayıcı annotation'lar içermelidir

### Gereksinim 9: Alert ↔ Playbook Bağları (FR-13.9)

**User Story:** Bir SRE mühendisi olarak, bir alert tetiklendiğinde hangi runbook bölümüne bakacağımı bilmek istiyorum, böylece doğru prosedürü hızla bulabilirim.

#### Kabul Kriterleri

1. THE Alert_Rule dosyasındaki her alert `runbook` annotation'ı içermelidir — ops doc'taki ilgili bölüme referans verir
2. THE Ops_Doc'taki her bölüm, hangi alert'in o bölümü tetiklediğini belgelemelidir
3. THE Alert_Rule ↔ Ops_Doc bağları birebir eşleşmelidir — her alert en az bir runbook bölümüne, her runbook bölümü en az bir alert'e bağlı olmalıdır

### Gereksinim 10: Alert Rules Dosya Formatı ve Konumu (FR-13.10)

**User Story:** Bir DevOps mühendisi olarak, alert kurallarının standart Prometheus alerting rules formatında ve proje içinde uygun konumda olmasını istiyorum, böylece CI/CD pipeline'ına kolayca entegre edebilirim.

#### Kabul Kriterleri

1. THE Alert_Rule dosyası standart Prometheus alerting rules YAML formatında olmalıdır (`groups` → `rules` yapısı)
2. THE Alert_Rule dosyası proje kök dizininde veya `ops/` dizininde uygun bir konumda bulunmalıdır
3. THE Alert_Rule dosyasındaki tüm alert'ler şu standart label set'i içermelidir: `severity` (critical/warning), `team: backend`, `component: redrive` — routing ve filtreleme deterministic olur
4. THE Alert_Rule dosyasındaki tüm alert'ler `runbook` annotation'ında **repo-relative path** formatı kullanmalıdır (örn. `docs/redrive-ops-runbook.md#section-anchor`) — CI tutarlılık checkpoint'i için URL değil path
5. THE Alert_Rule dosyasındaki `runbook` annotation path'leri ops doc dosya konumu ile birebir eşleşmelidir

### Gereksinim 11: Ops Doc Dosya Formatı ve Konumu (FR-13.11)

**User Story:** Bir operatör olarak, ops doc'un kolay erişilebilir ve okunabilir bir formatta olmasını istiyorum, böylece incident anında hızlıca referans olarak kullanabilirim.

#### Kabul Kriterleri

1. THE Ops_Doc markdown formatında olmalıdır
2. THE Ops_Doc proje kök dizininde veya `docs/` dizininde uygun bir konumda bulunmalıdır
3. THE Ops_Doc içindekiler tablosu (table of contents) içermelidir
4. THE Ops_Doc tüm PromQL sorgularını kod blokları içinde göstermelidir

### Gereksinim 12: /metrics Scrape Ön Koşulu (FR-13.12)

**User Story:** Bir DevOps mühendisi olarak, alert kurallarının çalışabilmesi için `/metrics` endpoint'inin Prometheus tarafından scrape edildiğinden emin olmak istiyorum, böylece "doküman yazdık ama ölçemiyoruz" durumuna düşmeyiz.

#### Kabul Kriterleri

1. THE Ops_Doc SHALL alert kurallarının aktif edilebilmesi için `/metrics` endpoint'inin Prometheus tarafından scrape edilmesinin ön koşul olduğunu açıkça belgelemelidir
2. THE Ops_Doc SHALL scrape yapılandırması yoksa alert rules'un aktif edilemeyeceğini uyarı olarak belgelemelidir
3. THE Ops_Doc SHALL temel Prometheus scrape config örneği içermelidir (job_name, target, scrape_interval)

### Gereksinim 13: Non-Functional Requirements (NFR-13.1)

#### Kabul Kriterleri

1. THE Phase 13 SHALL yeni uygulama kodu içermemelidir — çıktılar yalnızca markdown ve YAML dosyalarıdır (non-invasive)
2. THE Phase 13 SHALL Phase 11.4 ve Phase 12 metrik isimlerini ve label contract'larını değiştirmemelidir (LOCKED backward compatibility)
3. THE Ops_Doc'taki her playbook bölümü 5 dakikada uygulanabilir olmalıdır — maksimum 7 sıralı adım (operator usability)
4. THE Ops_Doc'taki tüm PromQL sorguları mevcut metrik isimleri ve label'ları ile uyumlu olmalıdır
5. THE Ops_Doc SHALL scrape health izleme gereksinimini belgelemelidir — "metric gelmiyor = alert yok" durumunu önlemek için dashboard'da scrape health paneli veya `up` metriği kontrolü önerilmelidir
6. THE Ops_Doc SHALL her metriğin label durumunu (var/yok, intentional) ilgili bölümde açıkça belgelemelidir — cardinality guard olarak
