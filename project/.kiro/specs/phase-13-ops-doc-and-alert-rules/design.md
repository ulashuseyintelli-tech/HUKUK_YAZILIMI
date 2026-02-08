# Design Document — Phase 13: Ops Doc & Alert Rules

## Genel Bakış (Overview)

Phase 13, DLQ redrive mekanizması için iki operasyonel artefakt üretir:
1. **Ops Doc (Runbook)** — Kill-switch, rate limiting ve tx duration izleme prosedürleri
2. **Prometheus Alert Rules** — Kritik metrik koşullarında tetiklenen uyarı kuralları

Yeni uygulama kodu yazılmaz. Mevcut Phase 11.4 ve Phase 12 metrik isimleri/label'ları değişmez (LOCKED).

**Çıktılar:**
- `docs/redrive-ops-runbook.md` — Operasyonel runbook
- `ops/prometheus/redrive-alerts.yml` — Prometheus alerting rules

## Mimari (Architecture)

Bu phase'de mimari değişiklik yoktur. Mevcut metrik altyapısı (Phase 11.4 + Phase 12) üzerine doküman ve konfigürasyon artefaktları eklenir.

```
┌─────────────────────────────────────────────────────┐
│                   NestJS API                         │
│                                                      │
│  POST /redrive ──► Kill-switch ──► Rate Limit ──►   │
│                    Depth Check ──► atomicRedrive     │
│                                                      │
│  GET /metrics  ──► toPrometheusText()               │
│                    ├─ carrier_redrive_*              │
│                    ├─ audit_*                        │
│                    └─ idempotency_*                  │
└──────────────────────┬──────────────────────────────┘
                       │ scrape
                       ▼
┌──────────────────────────────────────────────────────┐
│              Prometheus Server                        │
│                                                       │
│  ★ redrive-alerts.yml (Phase 13)                     │
│    ├─ RedriveRateCheckFailed    (critical)           │
│    ├─ RedriveTxDurationHigh     (warning)            │
│    ├─ RedriveKillSwitchActive   (warning)            │
│    └─ RedriveDepthExceeded      (warning)            │
│                                                       │
│  Alert ──► Alertmanager ──► PagerDuty / Slack        │
└──────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────┐
│          Ops Doc (Phase 13)                           │
│                                                       │
│  ★ docs/redrive-ops-runbook.md                       │
│    ├─ §1 Kill-Switch Prosedürü                       │
│    ├─ §2 Rate Limiting Rehber                        │
│    ├─ §3 TX Duration İzleme                          │
│    └─ §0 Kritik Uyarılar (/metrics güvenlik)         │
└──────────────────────────────────────────────────────┘
```

### Alert ↔ Runbook Eşleşme Matrisi

| Alert | Severity | Runbook Bölümü |
|-------|----------|----------------|
| `RedriveRateCheckFailed` | critical | §2 Rate Limiting Rehber |
| `RedriveTxDurationHigh` | warning | §3 TX Duration İzleme |
| `RedriveKillSwitchActive` | warning | §1 Kill-Switch Prosedürü |
| `RedriveDepthExceeded` | warning | §2 Rate Limiting Rehber (depth + poison context) |

## Bileşenler ve Arayüzler (Components and Interfaces)

### 1. Ops Doc Yapısı (redrive-ops-runbook.md)

```markdown
# DLQ Redrive Operasyonel Runbook

## ⚠️ Kritik Uyarılar
- /metrics endpoint güvenlik notu
- Prometheus scrape ön koşulu

## İçindekiler
1. Kill-Switch Prosedürü
2. Rate Limiting Operasyonel Rehber
3. TX Duration İzleme

## §1 Kill-Switch Prosedürü
### Tetikleyici Sinyaller
### Etkinleştirme Adımları (max 7)
### Doğrulama
### Rollback (Devre Dışı Bırakma)
### Etki Alanı (etkilenen/etkilenmeyen endpoint'ler)
### ❌ Yapma Listesi

## §2 Rate Limiting Operasyonel Rehber
### Tetikleyici Sinyaller
### Konfigürasyon Tablosu
### Metrik Referansı
### Tune Etme Adımları
### PromQL Sorguları
### ❌ Yapma Listesi

## §3 TX Duration İzleme
### Metrik Açıklaması
### PromQL — p50/p95/p99
### Beklenen Değer Aralıkları
### Kalibrasyon Prosedürü
### Eskalasyon Adımları
### ❌ Yapma Listesi
```

Her bölüm şu yapıyı takip eder (Runbook DoD — zorunlu 5 madde):
1. **What it means (Semantik)** — Bu sinyal/durum ne anlama geliyor? Kullanıcı etkisi nedir?
2. **Impact / Blast radius** — Etki alanı: hangi endpoint'ler, kullanıcılar, veri akışları etkilenir?
3. **Immediate actions (5 dk içinde)** — İlk 5 dakikada yapılacak acil aksiyonlar (max 7 adım)
4. **Deep dive (Araştırma)** — Log, trace, DB check, PromQL sorguları ile kök neden analizi
5. **Rollback / Disable path** — Geri alma veya devre dışı bırakma prosedürü (kill-switch dahil)

Ek olarak her bölümde:
- **Yapma Listesi** — En az 1 madde
- **İlgili Alert Referansı** — Hangi alert bu bölümü tetikler

### 2. Prometheus Alert Rules Yapısı (redrive-alerts.yml)

```yaml
groups:
  - name: redrive_alerts
    rules:
      - alert: RedriveRateCheckFailed
        expr: increase(carrier_redrive_rate_check_failed_total[5m]) > 0
        for: 0m
        labels:
          severity: critical
          team: backend
          component: redrive
        annotations:
          summary: "Redrive rate limit pre-check fail-closed tetiklendi"
          description: >-
            carrier_redrive_rate_check_failed_total artış gösterdi.
            Bu, rate limiter'da bug, veri bozulması veya beklenmeyen hata
            olduğunu gösterir. Acil araştırma gereklidir.
          runbook: "docs/redrive-ops-runbook.md#2-rate-limiting-operasyonel-rehber"

      - alert: RedriveTxDurationHigh
        expr: >-
          histogram_quantile(0.99,
            sum(rate(carrier_redrive_tx_duration_seconds_bucket[5m])) by (le)
          ) > 2
          and
          sum(rate(carrier_redrive_tx_duration_seconds_count[5m])) > 0.1
        for: 5m
        labels:
          severity: warning
          team: backend
          component: redrive
        annotations:
          summary: "atomicRedrive tx p99 süresi eşiği aştı"
          description: >-
            carrier_redrive_tx_duration_seconds p99 değeri 2s üzerinde.
            DB contention, connection pool tükenmesi veya lock-wait
            olabilir. Kalibrasyon prosedürü için runbook'a bakın.
          runbook: "docs/redrive-ops-runbook.md#3-tx-duration-izleme"

      - alert: RedriveKillSwitchActive
        expr: carrier_redrive_kill_switch_active == 1
        for: 30m
        labels:
          severity: warning
          team: backend
          component: redrive
        annotations:
          summary: "Redrive kill-switch 30 dakikadan fazla aktif"
          description: >-
            Kill-switch 30 dakikadır aktif. Incident çözüldüyse
            kill-switch'i devre dışı bırakmayı unutmayın.
          runbook: "docs/redrive-ops-runbook.md#1-kill-switch-proseduru"

      - alert: RedriveDepthExceeded
        expr: increase(carrier_redrive_depth_exceeded_total[5m]) > 0
        for: 0m
        labels:
          severity: warning
          team: backend
          component: redrive
        annotations:
          summary: "Redrive derinlik limiti aşıldı"
          description: >-
            carrier_redrive_depth_exceeded_total artış gösterdi.
            Bir veya daha fazla DLQ entry poison olarak işaretlendi.
            Tekrarlayan hata kaynağını araştırın.
          runbook: "docs/redrive-ops-runbook.md#2-rate-limiting-operasyonel-rehber"
```

### 3. Alert Tasarım Kararları

**RedriveRateCheckFailed — `for: 0m` (anında):**
- Normal operasyonda bu counter 0 olmalıdır
- Herhangi bir artış = bug veya veri bozulması → anında bildirim
- `increase()` 5m penceresi yeterli — scrape interval'e bağlı false positive riski düşük

**RedriveTxDurationHigh — başlangıç eşiği 2s:**
- Bucket'lar: `[0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10]`
- Normal tx süresi 10–500ms aralığında bekleniyor
- 2s başlangıç eşiği muhafazakâr — kalibrasyon sonrası düşürülebilir
- `for: 5m` — geçici spike'ları filtreler, sürekli yavaşlamayı yakalar
- **Aggregation:** `sum(rate(..._bucket[5m])) by (le)` — instance/pod bazında değil, servis bazında aggregate (multi-pod doğru p99)
- **Min sample guard:** `and sum(rate(..._count[5m])) > 0.1` — düşük trafikte false positive önleme (5 dk'da ~30 gözlem minimum)
- **Kalibrasyon prosedürü:** Production'da 1 hafta veri topla → p99 baseline çıkar → baseline × 3 = eşik → 3 ayda bir gözden geçir

**RedriveKillSwitchActive — `for: 30m`:**
- Kill-switch kısa süreli incident müdahalesi için tasarlandı
- 30 dakika sonra "unutulmuş olabilir" uyarısı
- Severity: warning (critical değil — bilinçli bırakılmış olabilir)

**RedriveDepthExceeded — `for: 0m`:**
- Depth exceeded = poison entry oluştu → operatör farkında olmalı
- Severity: warning (otomatik müdahale gerektirmez, araştırma gerektirir)

### 4. Ops Doc İçerik Detayları

#### §1 Kill-Switch Prosedürü — Anahtar İçerik

**Tetikleyici sinyaller:**
- `carrier_redrive_tx_duration_seconds` p99 > eşik (sürekli)
- Downstream servis arızası (queue, DB)
- Veri tutarsızlığı şüphesi (audit log anomalisi)
- `carrier_redrive_rate_check_failed_total` artışı

**Etkinleştirme adımları (7 adım):**
1. Incident kanalında duyuru yap
2. `REDRIVE_DISABLED=true` env var ayarla
3. Pod'ları rolling restart yap
4. `carrier_redrive_kill_switch_active == 1` doğrula
5. Test redrive → HTTP 503 doğrula
6. `carrier_redrive_disabled_total` artışını doğrula
7. Incident log'a kaydet

**Yapma listesi:**
- Kill-switch aktifken `POST /resolve` endpoint'ini devre dışı bırakmayın — resolve incident anında da gereklidir
- Kill-switch'i restart olmadan env var değiştirerek devre dışı bırakmaya çalışmayın — gauge stale kalır

#### §2 Rate Limiting Rehber — Anahtar İçerik

**Konfigürasyon tablosu:**

| Parametre | Varsayılan | Açıklama |
|-----------|-----------|----------|
| `baseMs` | 30,000 (30s) | İlk cooldown süresi |
| `capExponent` | 7 | Üstel artış tavanı (2^7 = 128) |
| `maxBackoffMs` | 3,600,000 (1h) | Maksimum bekleme süresi |
| `jitterPct` | 0.20 (20%) | Thundering herd önleme jitter'ı |

**Metrik referansı:**

| Metrik | Tip | Anlam |
|--------|-----|-------|
| `carrier_redrive_rate_limited_total{gate}` | Counter | Rate limit reddi (precheck / tx) |
| `carrier_redrive_rate_check_failed_total` | Counter | Fail-closed olayları (0 olmalı!) |
| `carrier_redrive_backoff_seconds` | Histogram | Backoff süresi dağılımı |
| `carrier_redrive_backoff_applied_total{count_bucket}` | Counter | Redrive sayısına göre backoff dağılımı |

**Yapma listesi:**
- `baseMs`'i 0'a ayarlamayın — cooldown tamamen devre dışı kalır, retry storm riski
- `jitterPct`'yi 0'a ayarlamayın — thundering herd koruması kaybolur
- Rate limit parametrelerini hot-reload beklemeyin — restart gerektirir

#### §3 TX Duration İzleme — Anahtar İçerik

**PromQL sorguları:**
```promql
# p50 (servis bazında aggregate — sum by (le))
histogram_quantile(0.50, sum(rate(carrier_redrive_tx_duration_seconds_bucket[5m])) by (le))

# p95
histogram_quantile(0.95, sum(rate(carrier_redrive_tx_duration_seconds_bucket[5m])) by (le))

# p99
histogram_quantile(0.99, sum(rate(carrier_redrive_tx_duration_seconds_bucket[5m])) by (le))
```

**Min sample guard:** Düşük trafik hacminde p99 noisy olur. Alert expr'ında `and sum(rate(..._count[5m])) > 0.1` guard'ı ile 5 dakikada ~30 gözlem minimum gerektirilir. **Kritik:** Guard'daki `sum(rate(..._count[5m]))` aynı aggregation boyutunda (service-level, instance/pod bazında değil) hesaplanmalıdır — p99 hesabıyla aynı `sum(...) by (le)` seviyesinde. Aksi halde guard yanlış negatif/pozitif üretir.

**Beklenen değer aralıkları (kalibrasyon öncesi tahmini):**

| Yüzdelik | Beklenen | Uyarı Eşiği |
|----------|----------|-------------|
| p50 | < 100ms | — |
| p95 | < 500ms | — |
| p99 | < 1s | 2s (başlangıç, kalibrasyon ile ayarlanır) |

**Kalibrasyon prosedürü:**
1. Production'da 1 hafta veri topla
2. `histogram_quantile(0.99, ...)` ile p99 baseline çıkar
3. Eşik = baseline × 3 (güvenlik marjı)
4. `redrive-alerts.yml`'deki `RedriveTxDurationHigh` expr'ını güncelle
5. 3 ayda bir gözden geçir

**Eskalasyon adımları:**
1. p99 > eşik → DB connection pool durumunu kontrol et
2. Active query'leri kontrol et (`pg_stat_activity`)
3. Lock-wait durumunu kontrol et (`pg_locks`)
4. Devam ediyorsa → kill-switch etkinleştir (§1'e git)

**Yapma listesi:**
- Histogram bucket sınırlarını değiştirmeyin — mevcut veri bozulur, trend analizi kırılır
- p99 spike'ını tek başına değerlendirmeyin — `carrier_redrive_success_total` ile cross-check yapın (düşük trafik = noisy p99)

## Veri Modelleri (Data Models)

Bu phase'de veri modeli değişikliği yoktur. Mevcut metrikler ve endpoint'ler olduğu gibi kullanılır.

### Mevcut Metrik Envanteri (Referans)

Phase 13'ün kullandığı mevcut metrikler:

| Metrik | Tip | Phase | Labels |
|--------|-----|-------|--------|
| `carrier_redrive_tx_duration_seconds` | Histogram | 12 | none |
| `carrier_redrive_kill_switch_active` | Gauge | 12 | none |
| `carrier_redrive_disabled_total` | Counter | 12 | none |
| `carrier_redrive_rate_check_failed_total` | Counter | 11.4 | none |
| `carrier_redrive_rate_limited_total` | Counter | 11.4 | gate |
| `carrier_redrive_backoff_seconds` | Histogram | 11.4 | none |
| `carrier_redrive_backoff_applied_total` | Counter | 11.4 | count_bucket |
| `carrier_redrive_depth_exceeded_total` | Counter | 11.3 | none |
| `carrier_redrive_success_total` | Counter | — | none |


## Doğruluk Özellikleri (Correctness Properties)

*Bir doğruluk özelliği (property), sistemin tüm geçerli çalışmalarında doğru olması gereken bir davranış veya karakteristiktir — esasen, sistemin ne yapması gerektiğine dair biçimsel bir ifadedir. Özellikler, insan tarafından okunabilir spesifikasyonlar ile makine tarafından doğrulanabilir doğruluk garantileri arasında köprü görevi görür.*

Bu phase uygulama kodu içermediğinden, doğruluk özellikleri artefakt tutarlılığına odaklanır: alert rules YAML'ının yapısal geçerliliği, metrik isimlerinin mevcut envanter ile uyumu ve alert ↔ runbook eşleşmesi.

### Property 1: Alert Yapısal Bütünlük (INV-13.1)

*For any* alert rule in the YAML file, the alert SHALL contain: `severity` label, `team` label, `component: redrive` label, `summary` annotation, `description` annotation, and `runbook` annotation. No alert may be missing any of these required fields.

**Validates: Requirements 5.3, 5.4, 5.5, 6.4, 6.5, 7.3, 7.4, 8.3, 8.4, 9.1, 10.3, 10.4**

### Property 2: Metrik İsim Tutarlılığı (INV-13.2)

*For any* metric name referenced in alert rule expressions or ops doc PromQL queries, the metric name SHALL exist in the known metric inventory (Phase 11.3 + 11.4 + 12 LOCKED metrics). No alert or PromQL query may reference a non-existent or renamed metric.

**Validates: Requirements 13.2, 13.4**

### Property 3: Alert ↔ Runbook Çift Yönlü Eşleşme (INV-13.3)

*For any* alert in the YAML file, the `runbook` annotation SHALL reference a valid section in the ops doc. Conversely, *for any* runbook section in the ops doc, at least one alert SHALL reference that section. The mapping is bidirectional — no orphan alerts, no orphan runbook sections.

**Validates: Requirements 9.1, 9.2, 9.3**

### Property 4: YAML Şema Geçerliliği (INV-13.4)

*For any* valid Prometheus alerting rules YAML file, the file SHALL parse without errors and conform to the `groups` → `rules` structure with required fields (`alert`, `expr`, `labels`, `annotations`).

**Validates: Requirements 10.1**

## Hata Yönetimi (Error Handling)

Bu phase'de uygulama kodu olmadığından runtime hata yönetimi yoktur. Olası hatalar artefakt düzeyindedir:

| Hata Senaryosu | Etki | Önlem |
|----------------|------|-------|
| YAML syntax hatası | Alert rules yüklenemez | YAML lint (CI'da) |
| Yanlış metrik ismi | Alert tetiklenmez (silent failure) | Property 2 ile doğrulama |
| Eksik runbook referansı | Operatör yönlendirilmez | Property 3 ile doğrulama |
| Yanlış PromQL syntax | Alert evaluate edilemez | Prometheus `promtool check rules` ile doğrulama |
| Eşik değeri çok düşük | False positive alert storm | Kalibrasyon prosedürü (ops doc §3) |
| Eşik değeri çok yüksek | Gerçek sorunlar kaçırılır | Periyodik gözden geçirme (3 ayda bir) |

**Önerilen CI kontrolleri:**
1. `yamllint` — YAML syntax doğrulama
2. `promtool check rules` — Prometheus rule syntax doğrulama
3. Metrik isim cross-check — alert expr'larındaki metrik isimleri vs. bilinen envanter

## Test Stratejisi (Testing Strategy)

### Genel Yaklaşım

Bu phase uygulama kodu içermediğinden, geleneksel unit test / property-based test yaklaşımı yerine **artefakt doğrulama testleri** kullanılır. Testler, üretilen dosyaların yapısal ve içerik bütünlüğünü kontrol eder.

### Test Türleri

**1. YAML Schema Validation (Unit Test)**
- Alert rules YAML dosyasını parse et
- `groups` → `rules` yapısını doğrula
- Her rule'da `alert`, `expr`, `labels`, `annotations` alanlarını kontrol et
- `promtool check rules` ile Prometheus uyumluluğunu doğrula

**2. Alert Structural Completeness (Property Test)**
- **Feature: phase-13-ops-doc-and-alert-rules, Property 1: Alert Yapısal Bütünlük**
- Tüm alert'lerin required labels (severity, team, component) ve annotations (summary, description, runbook) içerdiğini doğrula
- Kütüphane: Jest + js-yaml
- Minimum 1 iterasyon (deterministik — tüm alert'ler kontrol edilir)

**3. Metric Name Consistency (Property Test)**
- **Feature: phase-13-ops-doc-and-alert-rules, Property 2: Metrik İsim Tutarlılığı**
- Alert expr'larından ve ops doc PromQL bloklarından metrik isimlerini çıkar
- Bilinen metrik envanteri ile karşılaştır
- Kütüphane: Jest + regex extraction
- Minimum 1 iterasyon (deterministik)

**4. Alert ↔ Runbook Cross-Reference (Property Test)**
- **Feature: phase-13-ops-doc-and-alert-rules, Property 3: Alert ↔ Runbook Çift Yönlü Eşleşme**
- Her alert'in runbook annotation'ının ops doc'ta geçerli bir bölüme işaret ettiğini doğrula
- Her ops doc bölümünün en az bir alert tarafından referans verildiğini doğrula
- Kütüphane: Jest + js-yaml + markdown parsing

**5. Ops Doc Content Validation (Unit Test)**
- Her bölümün (kill-switch, rate-limit, tx-duration) mevcut olduğunu kontrol et
- Her bölümde "Yapma" listesi olduğunu kontrol et
- PromQL sorgularının kod blokları içinde olduğunu kontrol et
- İçindekiler tablosunun mevcut olduğunu kontrol et
- Adım sayısının 7'yi aşmadığını kontrol et

### Test Dosya Konumu

```
apps/api/src/modules/calc-preview/diagnostics/object-store/manifest-retry/__tests__/
  redrive-ops-artifacts.spec.ts
```

### Kütüphane ve Araçlar

- **Jest** — Test runner (mevcut)
- **js-yaml** — YAML parsing
- **promtool** — Prometheus rule validation (CI'da opsiyonel)
