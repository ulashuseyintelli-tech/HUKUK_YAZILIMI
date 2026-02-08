# Design Document — Phase 13.1: Alertmanager Routing & Delivery

## Genel Bakış (Overview)

Phase 13.1, Prometheus alert'lerinin Alertmanager üzerinden deterministik delivery'sini sağlar. Phase 13'te oluşturulan 4 alert rule'un label contract'ı (`severity`, `team: backend`, `component: redrive`) routing'in temelini oluşturur.

**Çıktılar:**
- `ops/alertmanager/alertmanager.yml` — Alertmanager config (route tree + receivers + inhibitions)
- `docs/redrive-ops-runbook.md` güncelleme — §4 Alert Delivery & Triage bölümü
- `redrive-ops-artifacts.spec.ts` güncelleme (opsiyonel) — config validation testi

## Mimari (Architecture)

Phase 13.1, Phase 13 diyagramındaki "⚠️ Alertmanager (YAPILANDIRILMAMIŞ)" boşluğunu doldurur.

```
┌──────────────────────────────────────────────────────────────────┐
│                    Prometheus Server                              │
│                                                                   │
│  redrive-alerts.yml (Phase 13 — LOCKED)                          │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │ RedriveRateCheckFailed   │ critical │ team:backend         │  │
│  │ RedriveTxDurationHigh    │ warning  │ component:redrive    │  │
│  │ RedriveKillSwitchActive  │ warning  │                      │  │
│  │ RedriveDepthExceeded     │ warning  │                      │  │
│  └────────────────────────────────────────────────────────────┘  │
│                       │                                           │
│                       │ alert fire                                │
│                       ▼                                           │
└───────────────────────┬──────────────────────────────────────────┘
                        │
                        ▼
┌──────────────────────────────────────────────────────────────────┐
│              Alertmanager (Phase 13.1 — YENİ)                     │
│                                                                   │
│  ★ ops/alertmanager/alertmanager.yml                             │
│                                                                   │
│  ┌─ Route Tree ────────────────────────────────────────────────┐ │
│  │                                                              │ │
│  │  root (default → slack-default)                              │ │
│  │    │                                                         │ │
│  │    ├─ match: team=backend, component=redrive                 │ │
│  │    │    │                                                    │ │
│  │    │    ├─ match: severity=critical                          │ │
│  │    │    │    → receiver: pagerduty-critical                  │ │
│  │    │    │    repeat_interval: 1h                             │ │
│  │    │    │                                                    │ │
│  │    │    └─ match: severity=warning                           │ │
│  │    │         → receiver: slack-warning                       │ │
│  │    │         repeat_interval: 2h                             │ │
│  │    │                                                         │ │
│  │    └─ (diğer team/component route'ları ileride eklenebilir)  │ │
│  │                                                              │ │
│  └──────────────────────────────────────────────────────────────┘ │
│                                                                   │
│  ┌─ Inhibitions ───────────────────────────────────────────────┐ │
│  │ critical aktifken → aynı component'te warning susturulur     │ │
│  │ equal: [component]                                           │ │
│  └──────────────────────────────────────────────────────────────┘ │
│                                                                   │
│  ┌─ Timing ────────────────────────────────────────────────────┐ │
│  │ group_wait: 30s    (deploy spike süzme)                      │ │
│  │ group_interval: 5m (yeni alert ekleme aralığı)               │ │
│  │ group_by: [alertname, component]                             │ │
│  └──────────────────────────────────────────────────────────────┘ │
│                                                                   │
│                  ┌──────────┬──────────────┐                     │
│                  │          │              │                      │
│                  ▼          ▼              ▼                      │
│           ┌──────────┐ ┌────────┐  ┌────────────┐               │
│           │PagerDuty │ │ Slack  │  │   Slack    │               │
│           │ critical │ │warning │  │  default   │               │
│           │          │ │#redrive│  │ #ops-alerts│               │
│           │          │ │-alerts │  │            │               │
│           └──────────┘ └────────┘  └────────────┘               │
└──────────────────────────────────────────────────────────────────┘
```

### Delivery Akış Matrisi

| Alert | Severity | Route Match | Receiver | repeat_interval |
|-------|----------|-------------|----------|-----------------|
| `RedriveRateCheckFailed` | critical | team=backend, component=redrive, severity=critical | pagerduty-critical | 1h |
| `RedriveTxDurationHigh` | warning | team=backend, component=redrive, severity=warning | slack-warning | 2h |
| `RedriveKillSwitchActive` | warning | team=backend, component=redrive, severity=warning | slack-warning | 2h |
| `RedriveDepthExceeded` | warning | team=backend, component=redrive, severity=warning | slack-warning | 2h |

### Catch-All / Default Receiver Davranışı

| Eksik/Yanlış Label | Sonuç | Neden |
|---------------------|-------|-------|
| `team` label'ı yok veya `backend` değil | `slack-default` receiver'a düşer | Root route catch-all |
| `component` label'ı yok veya `redrive` değil | `slack-default` receiver'a düşer | Alt route match etmez |
| `severity` label'ı yok veya geçersiz | `slack-default` receiver'a düşer | Severity alt route'ları match etmez, parent route'un receiver'ı devralınır |
| Tüm label'lar doğru | Severity'ye göre `pagerduty-critical` veya `slack-warning` | Deterministik routing |

**Tasarım kararı:** Default receiver `null` veya `blackhole` değildir — `slack-default` olarak tanımlanır. Bu sayede yanlış label ile gelen alert sessizce kaybolmaz; Slack'te görünür ve Alertmanager loglarından debug edilebilir. Ops ekibi "beklenmeyen alert default'a düştü" durumunu fark edebilir.

### group_by Kararı — Component-Level Aggregation (Intentional)

`group_by: [alertname, component]` kullanılır. `service` label'ı **bilinçli olarak eklenmez** çünkü:
- Phase 13 alert contract'ında `service` label'ı yoktur
- Tüm 4 alert aynı component'e (`redrive`) aittir
- Redrive mekanizması tek bir NestJS modülü içinde çalışır — multi-service ayrımı yoktur
- `instance` veya `pod` eklenmez — flap riskini artırır ve notification'ları gereksiz çoğaltır

### Inhibition Davranışı

| Senaryo | Sonuç |
|---------|-------|
| `RedriveRateCheckFailed` (critical) aktif + `RedriveTxDurationHigh` (warning) aktif | Warning susturulur — yalnızca critical notification gider |
| `RedriveRateCheckFailed` (critical) aktif + `RedriveKillSwitchActive` (warning) aktif | Warning susturulur |
| Yalnızca warning alert'ler aktif | Normal delivery — inhibition tetiklenmez |

**Neden inhibition?** Incident anında critical alert zaten PagerDuty'ye gidiyor. Aynı component'te warning notification'ları ek gürültü üretir ve dikkat dağıtır. Critical çözülünce warning'ler otomatik olarak tekrar aktif olur.

**`equal` alanı kararı:** Yalnızca `["component"]` kullanılır. `service` label'ı contract'ta olmadığından `equal`'a eklenmez. Tüm redrive alert'leri aynı component (`redrive`) altında olduğundan bu yeterlidir — bir component'in critical'i yalnızca kendi warning'lerini susturur.

## Bileşenler ve Arayüzler (Components and Interfaces)

### 1. Alertmanager Config Yapısı (alertmanager.yml)

```yaml
# ops/alertmanager/alertmanager.yml
# Phase 13.1: Alertmanager Routing & Delivery
#
# Bu config, Phase 13'te tanımlanan 4 redrive alert'inin
# deterministik delivery'sini sağlar.
#
# Placeholder'lar:
#   <PAGERDUTY_SERVICE_KEY> — PagerDuty integration key (ortam bazlı secret)
#   <SLACK_WEBHOOK_URL>     — Slack incoming webhook URL (ortam bazlı secret)
#   <SLACK_CHANNEL_WARNING> — Slack kanal adı (ör. #redrive-alerts)
#   <SLACK_CHANNEL_DEFAULT> — Slack fallback kanal adı (ör. #ops-alerts)

global:
  resolve_timeout: 5m

# ── Receivers ─────────────────────────────────────────────────────

receivers:
  # Fallback receiver — hiçbir route match etmezse
  - name: 'slack-default'
    slack_configs:
      - api_url: '<SLACK_WEBHOOK_URL>'
        channel: '<SLACK_CHANNEL_DEFAULT>'
        title: '[{{ .Status | toUpper }}] {{ .GroupLabels.alertname }}'
        text: >-
          *Severity:* {{ .CommonLabels.severity }}
          *Summary:* {{ .CommonAnnotations.summary }}
          *Runbook:* {{ .CommonAnnotations.runbook }}

  # Critical alert'ler → PagerDuty
  - name: 'pagerduty-critical'
    pagerduty_configs:
      - service_key: '<PAGERDUTY_SERVICE_KEY>'
        description: '{{ .CommonAnnotations.summary }}'
        details:
          severity: '{{ .CommonLabels.severity }}'
          component: '{{ .CommonLabels.component }}'
          runbook: '{{ .CommonAnnotations.runbook }}'
          description: '{{ .CommonAnnotations.description }}'

  # Warning alert'ler → Slack
  - name: 'slack-warning'
    slack_configs:
      - api_url: '<SLACK_WEBHOOK_URL>'
        channel: '<SLACK_CHANNEL_WARNING>'
        title: '[{{ .Status | toUpper }}:{{ .CommonLabels.severity | toUpper }}] {{ .GroupLabels.alertname }}'
        text: >-
          *Alert:* {{ .GroupLabels.alertname }}
          *Severity:* {{ .CommonLabels.severity }}
          *Component:* {{ .CommonLabels.component }}
          *Summary:* {{ .CommonAnnotations.summary }}
          *Description:* {{ .CommonAnnotations.description }}
          *Runbook:* {{ .CommonAnnotations.runbook }}
        send_resolved: true

# ── Route Tree ────────────────────────────────────────────────────

route:
  receiver: 'slack-default'
  group_by: ['alertname', 'component']
  group_wait: 30s
  group_interval: 5m
  repeat_interval: 4h

  routes:
    # Redrive alert'leri — team=backend, component=redrive
    - match:
        team: backend
        component: redrive
      group_by: ['alertname', 'component']

      routes:
        # Critical → PagerDuty (+ kısa repeat)
        - match:
            severity: critical
          receiver: 'pagerduty-critical'
          repeat_interval: 1h
          continue: false

        # Warning → Slack (daha uzun repeat)
        - match:
            severity: warning
          receiver: 'slack-warning'
          repeat_interval: 2h
          continue: false

# ── Inhibition Rules ─────────────────────────────────────────────
# Aynı component için critical aktifken warning susturulur.
# Bu, incident anında gereksiz warning gürültüsünü önler.
# Critical çözülünce warning'ler otomatik olarak tekrar aktif olur.

inhibit_rules:
  - source_matchers:
      - severity = "critical"
    target_matchers:
      - severity = "warning"
    equal: ['component']
```

### 2. Timing Kararları (Gerekçeli)

| Parametre | Değer | Gerekçe |
|-----------|-------|---------|
| `group_wait` | 30s | Deploy sonrası birden fazla alert aynı anda fire edebilir. 30s, ilk alert'ten sonra aynı gruba ait diğerlerinin toplanmasını sağlar. Çok kısa (5s) = her alert ayrı notification, çok uzun (2m) = critical gecikir. |
| `group_interval` | 5m | Mevcut gruba yeni alert eklendiğinde 5m bekle. Prometheus eval_interval (tipik 1m) ile uyumlu — 5m içinde stabilize olmuş alert'ler tek notification olarak gider. |
| `repeat_interval` (critical) | 1h | Critical alert çözülmezse 1 saatte bir hatırlat. Çok sık (15m) = alarm fatigue, çok seyrek (4h) = unutulma riski. |
| `repeat_interval` (warning) | 2h | Warning daha az acil — 2 saatte bir yeterli. Ops ekibi zaten Slack'te görecek. |
| `resolve_timeout` | 5m | Alert resolve olduktan sonra 5m bekle — geçici resolve/re-fire döngüsünü süzer. |

### 3. Ortam Bazlı Override Stratejisi

**Yaklaşım: Placeholder + env var substitution**

Config dosyasında placeholder'lar kullanılır. Deploy pipeline'ında `envsubst` veya Helm values ile gerçek değerler inject edilir.

| Placeholder | Env Var | Dev/Staging | Prod |
|-------------|---------|-------------|------|
| `<PAGERDUTY_SERVICE_KEY>` | `ALERTMANAGER_PAGERDUTY_KEY` | Boş veya test key | Gerçek PagerDuty key |
| `<SLACK_WEBHOOK_URL>` | `ALERTMANAGER_SLACK_WEBHOOK` | Dev Slack webhook | Prod Slack webhook |
| `<SLACK_CHANNEL_WARNING>` | `ALERTMANAGER_SLACK_CHANNEL_WARNING` | `#dev-alerts` | `#redrive-alerts` |
| `<SLACK_CHANNEL_DEFAULT>` | `ALERTMANAGER_SLACK_CHANNEL_DEFAULT` | `#dev-alerts` | `#ops-alerts` |

**Dev/staging alternatifi:** PagerDuty receiver yerine `slack-warning` kullanılabilir (veya `null` receiver tanımlanabilir). Route tree'de ortam bazlı override yapılmaz — receiver config'i ortama göre değişir.

### 4. Ops Doc Güncellemesi — §4 Alert Delivery & Triage

Mevcut `docs/redrive-ops-runbook.md`'ye eklenen yeni bölüm:

```markdown
## §4 Alert Delivery & Triage

### Delivery Akışı
Prometheus → Alertmanager → Receiver (Slack / PagerDuty)

### "Alert gelmiyor" Kontrol Adımları
1. Alertmanager status: `<ALERTMANAGER_URL>/#/status`
2. Alertmanager alerts: `<ALERTMANAGER_URL>/#/alerts`
3. Receiver config doğru mu? Placeholder'lar doldurulmuş mu?
4. Network: Alertmanager → Slack/PagerDuty erişimi var mı?
5. Inhibition: Critical alert warning'i susturuyor olabilir

### Config Konumu
`ops/alertmanager/alertmanager.yml`

### Maintenance / Mute Mekanizması
- Planlı bakım sırasında alert susturma: `amtool silence add` veya Alertmanager UI
- Alertmanager v0.24+ `mute_time_intervals` / `time_intervals` ile zamanlı susturma
- ⚠️ Bakım sonrası silence kaldırmayı unutmayın — aktif silence'lar alert delivery'yi engeller
```

### 5. Config Validation Stratejisi

**Birincil araç:** `amtool check-config`

```bash
# Doğrudan validation (placeholder'sız veya rendered config üzerinde)
amtool check-config ops/alertmanager/alertmanager.yml

# Ortam bazlı override varsa: önce render, sonra validate
envsubst < ops/alertmanager/alertmanager.yml > /tmp/alertmanager-rendered.yml
amtool check-config /tmp/alertmanager-rendered.yml
```

**CI pipeline sırası:** render (envsubst/helm) → `amtool check-config` (rendered output üzerinde) → deploy

**Not:** Placeholder'lı ham config `amtool check-config` ile doğrudan validate edilemez (placeholder'lar geçerli URL/key değildir). CI'da ya rendered config kullanılır ya da Jest testi ile yapısal doğrulama yapılır.

## Veri Modelleri (Data Models)

Bu phase'de veri modeli değişikliği yoktur.

## Doğruluk Özellikleri (Correctness Properties)

### Property 1: Route Determinizmi (INV-13.1.1)

*For any* alert with labels `{team: backend, component: redrive, severity: S}` where S ∈ {critical, warning}, the route tree SHALL deterministically resolve to exactly one receiver: `pagerduty-critical` if S = critical, `slack-warning` if S = warning. No alert may be routed to an ambiguous or undefined receiver.

**Validates: Requirements 3.1, 3.2, 3.3, 3.5**

### Property 2: Inhibition Doğruluğu (INV-13.1.2)

*For any* pair of alerts where both have `component: redrive`, if one has `severity: critical` and the other has `severity: warning`, the warning alert SHALL be inhibited (suppressed) while the critical alert is active. When the critical alert resolves, the warning alert SHALL resume normal delivery.

**Validates: Requirements 5.1, 5.2**

### Property 3: Config Yapısal Bütünlük (INV-13.1.3)

*For any* valid Alertmanager config file, the file SHALL parse without errors, contain at least the required receivers (`slack-default`, `pagerduty-critical`, `slack-warning`), define a route tree with `group_by`, and include at least one inhibition rule.

**Validates: Requirements 1.1, 1.3, 2.1, 2.4, 5.1**

## Hata Yönetimi (Error Handling)

| Hata Senaryosu | Etki | Önlem |
|----------------|------|-------|
| YAML syntax hatası | Alertmanager başlamaz | `amtool check-config` ile CI validation |
| Yanlış receiver adı route'ta | Alert deliver edilmez | Config validation testi |
| Placeholder doldurulmamış | Notification başarısız | Deploy pipeline'da env var kontrolü |
| Slack webhook expired | Warning notification'lar kaybolur | Alertmanager log monitoring |
| PagerDuty key invalid | Critical notification'lar kaybolur | PagerDuty integration health check |
| Inhibition yanlış yapılandırılmış | Warning'ler gereksiz susturulur veya hiç susturulmaz | Property 2 testi |

## Test Stratejisi (Testing Strategy)

### 1. Config Validation (Unit Test — opsiyonel)

- YAML parse → required alanlar mevcut mu?
- Receiver isimleri route tree'deki referanslarla eşleşiyor mu?
- `group_by` alanı tanımlı mı?
- Inhibition rule mevcut mu?
- Kütüphane: Jest + js-yaml

### 2. Route Determinizm Testi (opsiyonel)

- Sample alert payload'ları ile route resolution simülasyonu
- Her alert → beklenen receiver eşleşmesi
- `amtool config routes test` komutu ile (Alertmanager CLI)

### Test Dosya Konumu (opsiyonel)

Mevcut test dosyasına ekleme:
```
apps/api/src/modules/calc-preview/diagnostics/object-store/manifest-retry/__tests__/
  redrive-ops-artifacts.spec.ts
```
