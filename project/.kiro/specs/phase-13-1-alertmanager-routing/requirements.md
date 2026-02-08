# Requirements Document — Phase 13.1: Alertmanager Routing & Delivery

## Giriş

Phase 13.1, Phase 13'te oluşturulan Prometheus alert rule'larının uçtan uca delivery zincirini kurar. Phase 13 "documented-operable" seviyesine ulaştı; bu phase, alert'lerin Alertmanager üzerinden deterministik, gürültü kontrollü ve ortam-bilinçli şekilde Slack/PagerDuty'ye ulaşmasını sağlar.

**Motivasyon (G2 Gap):** Phase 13 architecture.md'de tespit edilen G2 gap'i — "Alertmanager routing config yok; alert fire eder ama hiçbir yere deliver edilmez."

**Bağımlılık:** Phase 13 Ops Doc & Alert Rules (DONE/LOCKED) — 4 alert rule, label contract (`severity`, `team: backend`, `component: redrive`), runbook annotation'ları mevcut.

**Ön Koşul:** Prometheus server kurulu ve `redrive-alerts.yml` yüklenmiş olmalıdır. Alertmanager binary/container erişilebilir olmalıdır.

## Kapsam Dışı (Non-Goals)

- SLO/SLA tanımları (organizasyonel karar)
- p99 eşik kalibrasyonu (G3 — prod veri gerektirir, ayrı iş kalemi)
- `up == 0` scrape health alert'i (G1 — ayrı iş kalemi, Phase 13.1 sonrası)
- Yeni Prometheus alert rule eklenmesi (Phase 13 alert set'i LOCKED)
- Grafana dashboard oluşturma
- Yeni uygulama kodu
- Gerçek Slack webhook URL veya PagerDuty integration key (placeholder kullanılır — ortam bazlı secret yönetimi altyapı kararı)

## Sözlük (Glossary)

- **Alertmanager:** Prometheus'tan gelen alert'leri gruplayan, susturan, yönlendiren ve notification gönderen bileşen.
- **Receiver:** Alert notification'ının gönderileceği hedef (Slack channel, PagerDuty service, email vb.).
- **Route:** Alert label'larına göre hangi receiver'a yönlendirileceğini belirleyen kural.
- **Inhibition:** Belirli koşullarda bir alert'in başka bir alert'i susturması kuralı.
- **group_by:** Aynı label değerlerine sahip alert'lerin tek notification olarak gruplanması.
- **group_wait:** İlk alert geldiğinde, aynı gruba ait diğer alert'lerin toplanması için bekleme süresi.
- **group_interval:** Aynı gruba yeni alert eklendiğinde notification gönderme aralığı.
- **repeat_interval:** Aynı alert hâlâ aktifken tekrar notification gönderme aralığı.
- **Delivery Contract:** Alert label'ları → receiver eşleşmesini tanımlayan, deterministik routing garantisi.

## Label → Routing Contract (LOCKED — Phase 13'ten devralınan)

Phase 13'te tanımlanan alert label set'i routing'in temelini oluşturur. Bu label'lar değiştirilemez.

| Label | Değerler | Routing Rolü |
|-------|----------|-------------|
| `severity` | `critical`, `warning` | Receiver seçimi (PagerDuty vs Slack) ve repeat_interval ayrımı |
| `team` | `backend` | Route tree'de team bazlı dallanma |
| `component` | `redrive` | group_by ve filtreleme |

**`service` label durumu:** Phase 13 alert contract'ında `service` label'ı **yoktur** (intentional). Tüm 4 alert aynı component'e (`redrive`) aittir ve ayrı servis/endpoint ayrımı yapılmaz. Bu nedenle `group_by` ve `inhibit_rules.equal` alanlarında `component` yeterlidir — `service` eklenmez. Bu karar bilinçlidir: redrive mekanizması tek bir NestJS modülü içinde çalışır, multi-service ayrımı yoktur.

**Alert → Severity Mapping (Phase 13'ten):**

| Alert | Severity |
|-------|----------|
| `RedriveRateCheckFailed` | critical |
| `RedriveTxDurationHigh` | warning |
| `RedriveKillSwitchActive` | warning |
| `RedriveDepthExceeded` | warning |

## Gereksinimler

### Gereksinim 1: Alertmanager Config Dosyası (FR-13.1.1)

**User Story:** Bir DevOps mühendisi olarak, Alertmanager'ın Prometheus alert'lerini alıp doğru receiver'lara yönlendirmesini istiyorum, böylece alert'ler ops ekibine ulaşır.

#### Kabul Kriterleri

1. THE Config SHALL standart Alertmanager YAML formatında (`alertmanager.yml`) olmalıdır
2. THE Config SHALL proje içinde `ops/alertmanager/` dizininde bulunmalıdır
3. THE Config SHALL `amtool check-config` ile hatasız validate edilmelidir
4. THE Config SHALL global bölümde `resolve_timeout` tanımlamalıdır (varsayılan: 5m)

### Gereksinim 2: Receiver Tanımları (FR-13.1.2)

**User Story:** Bir DevOps mühendisi olarak, critical alert'lerin PagerDuty'ye, warning alert'lerin Slack'e gitmesini istiyorum, böylece severity'ye göre doğru kanaldan haberdar olurum.

#### Kabul Kriterleri

1. THE Config SHALL en az 2 receiver tanımlamalıdır: biri critical (PagerDuty), biri warning (Slack)
2. THE Config SHALL PagerDuty receiver'ında `service_key` veya `routing_key` için placeholder kullanmalıdır (`<PAGERDUTY_SERVICE_KEY>`) — gerçek key ortam bazlı secret olarak yönetilir
3. THE Config SHALL Slack receiver'ında `api_url` için placeholder kullanmalıdır (`<SLACK_WEBHOOK_URL>`) — gerçek URL ortam bazlı secret olarak yönetilir
4. THE Config SHALL bir `default` receiver tanımlamalıdır (hiçbir route match etmezse fallback)
5. THE Config SHALL Slack receiver'ında `channel`, `title`, `text` alanlarını alert bilgileriyle template'lemelidir (en azından `alertname`, `severity`, `summary`, `runbook`)

### Gereksinim 3: Route Tree (FR-13.1.3)

**User Story:** Bir SRE mühendisi olarak, alert'lerin label'larına göre deterministik şekilde doğru receiver'a yönlendirilmesini istiyorum, böylece routing davranışı tahmin edilebilir olur.

#### Kabul Kriterleri

1. THE Config SHALL route tree'de `team: backend` ve `component: redrive` match'i ile redrive alert'lerini yakalamalıdır
2. THE Config SHALL `severity: critical` alert'leri PagerDuty receiver'a yönlendirmelidir
3. THE Config SHALL `severity: warning` alert'leri Slack receiver'a yönlendirmelidir
4. THE Config SHALL `group_by` alanında `["alertname", "component"]` kullanmalıdır — instance/pod bazında gruplama yapılmamalıdır (flap riski). `service` label'ı contract'ta yoktur (intentional — component-level aggregation); bu nedenle `group_by`'a eklenmez.
5. THE Config SHALL route tree'nin deterministik olduğunu garanti etmelidir — aynı label set'i her zaman aynı receiver'a gider
6. THE Config SHALL catch-all davranışını açıkça tanımlamalıdır: `team`, `severity` veya `component` label'ı eksik/yanlış olan alert'ler `slack-default` receiver'a düşmelidir (sessizce kaybolmamalı). Default receiver log-visible olmalıdır — Alertmanager loglarından "hangi alert default'a düştü" görülebilmelidir.

### Gereksinim 4: Gürültü Kontrolü — Timing (FR-13.1.4)

**User Story:** Bir SRE mühendisi olarak, alert notification'larının kontrollü aralıklarla gelmesini istiyorum, böylece deploy spike'ları ve geçici durumlar gereksiz gürültü üretmez.

#### Kabul Kriterleri

1. THE Config SHALL `group_wait` değerini tanımlamalıdır (başlangıç: 30s) — deploy spike'larını süzmek için
2. THE Config SHALL `group_interval` değerini tanımlamalıdır (başlangıç: 5m)
3. THE Config SHALL critical alert'ler için `repeat_interval` tanımlamalıdır (başlangıç: 1h)
4. THE Config SHALL warning alert'ler için `repeat_interval` tanımlamalıdır (başlangıç: 2h)
5. THE Config SHALL timing değerlerinin başlangıç değerleri olduğunu ve prod trafiğine göre ayarlanabileceğini belgelemelidir

### Gereksinim 5: Inhibition Kuralları (FR-13.1.5)

**User Story:** Bir SRE mühendisi olarak, aynı component için critical alert aktifken warning alert'lerin susturulmasını istiyorum, böylece incident anında gereksiz notification gürültüsü azalır.

#### Kabul Kriterleri

1. THE Config SHALL en az 1 inhibition kuralı tanımlamalıdır: aynı `component` için `severity: critical` aktifken `severity: warning` susturulur
2. THE Config SHALL inhibition kuralında `equal` alanında `["component"]` kullanmalıdır — yalnızca aynı component'teki alert'ler birbirini etkiler. `service` label'ı contract'ta olmadığından `equal`'a eklenmez; tüm redrive alert'leri aynı component altında olduğundan bu yeterlidir.
3. THE Config SHALL inhibition kuralının ne yaptığını yorum satırı ile açıklamalıdır

### Gereksinim 6: Ortam Bilinçli Yapılandırma (FR-13.1.6)

**User Story:** Bir DevOps mühendisi olarak, dev/staging/prod ortamlarında farklı receiver'lar ve timing değerleri kullanabilmek istiyorum, böylece dev ortamında gereksiz PagerDuty çağrısı yapılmaz.

#### Kabul Kriterleri

1. THE Config SHALL ortam bazlı override mekanizmasını belgelemelidir (env var placeholder veya ortam bazlı dosya stratejisi)
2. THE Config SHALL placeholder'ların hangi ortam değişkenleriyle doldurulacağını açıkça belgelemelidir
3. THE Config SHALL dev/staging ortamında PagerDuty yerine Slack kullanılmasını önermelidir (veya null receiver)

### Gereksinim 7: Delivery Runbook Bölümü (FR-13.1.7)

**User Story:** Bir operatör olarak, alert delivery zincirinin nasıl çalıştığını ve sorun olduğunda ne yapacağımı bilmek istiyorum, böylece "alert gelmiyor" durumunda triage yapabilirim.

#### Kabul Kriterleri

1. THE Ops_Doc SHALL mevcut `redrive-ops-runbook.md`'ye bir "Alert Delivery & Triage" bölümü eklenmelidir (§0 altına veya yeni §4 olarak)
2. THE Bölüm SHALL alert delivery akışını özetlemelidir (Prometheus → Alertmanager → receiver)
3. THE Bölüm SHALL "alert gelmiyor" durumunda kontrol adımlarını içermelidir (Alertmanager status, receiver config, network)
4. THE Bölüm SHALL Alertmanager config dosyasının konumunu referans vermelidir

### Gereksinim 8: Config Validation (FR-13.1.8)

**User Story:** Bir DevOps mühendisi olarak, Alertmanager config değişikliklerinin CI'da validate edilmesini istiyorum, böylece hatalı config production'a gitmez.

#### Kabul Kriterleri

1. THE Phase SHALL config dosyasının `amtool check-config` ile validate edilebileceğini belgelemelidir — komut: `amtool check-config ops/alertmanager/alertmanager.yml`
2. THE Phase SHALL ortam bazlı override/templating varsa validation sırasını belgelemelidir: render (envsubst/helm) → `amtool check-config` (rendered output üzerinde)
3. THE Phase SHALL* (opsiyonel) Jest testi ile config'in YAML olarak parse edilebilirliğini ve required alanların varlığını doğrulamalıdır

### Gereksinim 10: Maintenance / Mute Mekanizması Dokümantasyonu (FR-13.1.10)

**User Story:** Bir operatör olarak, planlı bakım sırasında alert'leri geçici olarak susturma yöntemini bilmek istiyorum, böylece bakım pencerelerinde gereksiz notification gürültüsü oluşmaz.

#### Kabul Kriterleri

1. THE Ops_Doc §4 bölümü SHALL Alertmanager silence mekanizmasını kısaca belgelemelidir (amtool silence add / Alertmanager UI)
2. THE Ops_Doc §4 bölümü SHALL mute time intervals kavramını referans vermelidir (Alertmanager v0.24+ `mute_time_intervals` / `time_intervals`)
3. THE Ops_Doc §4 bölümü SHALL "bakım sonrası silence kaldırmayı unutma" uyarısını içermelidir

### Gereksinim 9: Non-Functional Requirements (NFR-13.1.1)

#### Kabul Kriterleri

1. THE Phase 13.1 SHALL yeni uygulama kodu içermemelidir — çıktılar YAML config, doküman güncellemesi ve opsiyonel test dosyasıdır
2. THE Phase 13.1 SHALL Phase 13 alert rule'larını ve label contract'ını değiştirmemelidir (LOCKED)
3. THE Config SHALL gerçek secret (webhook URL, API key) içermemelidir — yalnızca placeholder'lar kullanılır
4. THE Config SHALL Alertmanager v0.27+ ile uyumlu olmalıdır
5. THE Phase 13.1 SHALL maintenance/mute mekanizmasını uygulamaz (scope dışı) — yalnızca ops doc'ta dokümante eder
