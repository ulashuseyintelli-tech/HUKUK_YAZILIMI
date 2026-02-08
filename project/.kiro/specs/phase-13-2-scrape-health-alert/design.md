# Design Document — Phase 13.2: Scrape Health Alert

## Genel Bakış (Overview)

Phase 13.2, Prometheus scrape failure'ı tespit eden tek bir alert rule ekler. Bu, Phase 13 architecture.md'deki G1 gap'ini kapatır: "up == 0 → tüm alert'ler sessiz kalır" kör noktası.

**Çıktılar:**
- `ops/prometheus/redrive-alerts.yml` güncelleme — 5. alert rule eklenir
- `docs/redrive-ops-runbook.md` güncelleme — scrape failure playbook bölümü
- `redrive-ops-artifacts.spec.ts` güncelleme — mevcut testlere yeni alert dahil edilir

## Mimari (Architecture)

Phase 13.2, Phase 13 diyagramındaki "⚠️ up == 0 → tüm alert'ler sessiz kalır (kör nokta)" boşluğunu doldurur.

```
┌──────────────────────────────────────────────────────────────────┐
│                    Prometheus Server                              │
│                                                                   │
│  up{job="hukuk-api-redrive"}                                     │
│    1 = scrape OK                                                  │
│    0 = scrape FAIL ──► RedriveScrapeDown (YENİ — Phase 13.2)    │
│    absent = job yok ─┘  severity: critical                     │
│                         for: 2m                                   │
│                                                                   │
│  redrive-alerts.yml (Phase 13 — 4 alert LOCKED + 1 yeni)        │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │ RedriveRateCheckFailed   │ critical │ LOCKED               │  │
│  │ RedriveTxDurationHigh    │ warning  │ LOCKED               │  │
│  │ RedriveKillSwitchActive  │ warning  │ LOCKED               │  │
│  │ RedriveDepthExceeded     │ warning  │ LOCKED               │  │
│  │ RedriveScrapeDown        │ critical │ ★ YENİ (Phase 13.2) │  │
│  └────────────────────────────────────────────────────────────┘  │
│                       │                                           │
│                       │ fire                                      │
│                       ▼                                           │
│  Alertmanager (Phase 13.1 — LOCKED, config değişmez)             │
│    severity=critical → pagerduty-critical (mevcut route)         │
│    team=backend, component=redrive → match eder                  │
└──────────────────────────────────────────────────────────────────┘
```

### Yeni Alert Detayı

| Alan | Değer | Gerekçe |
|------|-------|---------|
| `alert` | `RedriveScrapeDown` | Naming convention: `Redrive` prefix + failure mode |
| `expr` | `(up{job="hukuk-api-redrive"} == 0) OR absent(up{job="hukuk-api-redrive"})` | `up == 0`: target down; `absent()`: job kaldırılmış/rename |
| `for` | `2m` | ~8 scrape cycle, geçici timeout süzme |
| `severity` | `critical` | Meta-monitoring — tüm observability devre dışı kalır |
| `team` | `backend` | Mevcut contract |
| `component` | `redrive` | Mevcut contract |
| `summary` | "Prometheus redrive scrape başarısız" | Kısa, net |
| `description` | Detaylı açıklama — scrape fail sonuçları | Ops bağlamı |
| `runbook` | `docs/redrive-ops-runbook.md#<anchor>` | Yeni bölüme link |

### Routing Davranışı (Alertmanager — değişiklik yok)

**Alert Label Contract (Routing Garantisi — spec seviyesinde kilitli):**

| Label/Annotation | Değer | Routing Etkisi |
|-------------------|-------|----------------|
| `severity` | `critical` | → `pagerduty-critical` receiver (Phase 13.1 route) |
| `team` | `backend` | → `team=backend` route match |
| `component` | `redrive` | → `component=redrive` route match + inhibition `equal` |
| `runbook` | `docs/redrive-ops-runbook.md#5-scrape-health--redrivescrapedown` | Ops doc §5 link — CI-enforced (Property 3) |

Bu label set'i eksik veya yanlış olursa alert `slack-default` catch-all'a düşer. CI testleri (Property 1 + Property 3) bu kontratı enforce eder.

| Alert | Labels | Route Match | Receiver |
|-------|--------|-------------|----------|
| `RedriveScrapeDown` | `severity: critical, team: backend, component: redrive` | `team=backend, component=redrive, severity=critical` | `pagerduty-critical` |

Phase 13.1 route tree'si bu alert'i otomatik olarak yakalar. Ek config gerekmez.

### Inhibition Etkisi

`RedriveScrapeDown` (critical) aktifken, Phase 13.1 inhibition kuralı gereği aynı component'teki warning alert'ler susturulur. Bu **doğru davranıştır** çünkü:
- Scrape fail olduğunda warning alert'ler zaten tetiklenemez (metrik yok)
- Eğer scrape kısmen çalışıyorsa (edge case), critical zaten PagerDuty'ye gider — warning gürültüsü gereksiz

## Bileşenler ve Arayüzler (Components and Interfaces)

### 1. Alert Rule (redrive-alerts.yml'e eklenecek)

```yaml
      # ─────────────────────────────────────────────────────────────────
      # Alert 5: RedriveScrapeDown
      # Prometheus scrape başarısız — tüm redrive alert'leri sessiz kalır
      # Bu, "alert'lerin alert'i" — meta-monitoring.
      # up metriği Prometheus built-in'dir, uygulama tarafında üretilmez.
      # ─────────────────────────────────────────────────────────────────
      - alert: RedriveScrapeDown
        expr: >-
          (up{job="hukuk-api-redrive"} == 0)
          or
          absent(up{job="hukuk-api-redrive"})
        for: 2m
        labels:
          severity: critical
          team: backend
          component: redrive
        annotations:
          summary: "Prometheus redrive scrape başarısız"
          description: >-
            up{job="hukuk-api-redrive"} == 0 veya absent — Prometheus, redrive
            /metrics endpoint'ine ulaşamıyor veya job tanımı kaldırılmış.
            Bu durumda mevcut 4 alert rule tetiklenemez (metrik verisi yok).
            Pod durumu, network erişimi ve endpoint health kontrol edilmeli.
          runbook: "docs/redrive-ops-runbook.md#5-scrape-health--redrivescrapedown"
```

### 2. Ops Doc Güncellemesi — §5 Scrape Health / RedriveScrapeDown

Mevcut §0'daki "Scrape Health İzleme" alt bölümü kısa ve bilgilendirici. Yeni §5, tam Runbook DoD yapısında playbook bölümü olacak:

```markdown
## §5 Scrape Health / RedriveScrapeDown

### 1. What it means
Prometheus, redrive `/metrics` endpoint'ine ulaşamıyor veya job tanımı kaldırılmış/rename edilmiş. `(up{job="hukuk-api-redrive"} == 0) OR absent(up{job="hukuk-api-redrive"})` durumu 2 dakikadan fazla sürüyor.

### 2. Impact / Blast radius
- **Tüm 4 redrive alert'i sessiz kalır** — metrik verisi olmadan rule'lar tetiklenemez
- Kill-switch, rate limit, depth, tx duration sorunları tespit edilemez
- Bu, observability katmanının tamamen devre dışı kalması demektir

### 3. Immediate actions (max 7 adım)
| # | Adım | Komut / Kontrol |
|---|------|-----------------|
| 1 | Pod durumunu kontrol et | `kubectl get pods -l app=hukuk-api` |
| 2 | Pod loglarını kontrol et | `kubectl logs -l app=hukuk-api --tail=50` |
| 3 | Endpoint erişimini test et | `curl -s http://<pod-ip>:<port>/metrics | head -5` |
| 4 | Prometheus targets UI kontrol et | `<PROMETHEUS_URL>/targets` — target state: UP/DOWN |
| 5 | Network policy kontrol et | `kubectl get networkpolicy -n <namespace>` |
| 6 | Prometheus scrape config kontrol et | `job_name: hukuk-api-redrive` mevcut mu? |
| 7 | Son başarılı scrape zamanını kontrol et | Prometheus UI: `up{job="hukuk-api-redrive"}` |

### 4. Deep dive
- Prometheus scrape error logları: `<PROMETHEUS_URL>/targets` → error column
- Pod restart count: `kubectl get pods -l app=hukuk-api -o wide`
- OOMKilled / CrashLoopBackOff kontrolü
- DNS resolution: `nslookup <service-name>.<namespace>.svc.cluster.local`

### 5. Rollback / Disable path
- Pod restart: `kubectl rollout restart deployment/hukuk-api`
- Scrape config geçici devre dışı bırakma: Prometheus config'den job kaldır (dikkat: tüm metrikler kaybolur)
- Alert geçici susturma: `amtool silence add alertname=RedriveScrapeDown`

### İlgili Alert
- `RedriveScrapeDown` — severity: critical, for: 2m

### İlgili PromQL
```promql
(up{job="hukuk-api-redrive"} == 0) or absent(up{job="hukuk-api-redrive"})
```

### ❌ Yapma Listesi
1. **Scrape failure'ı görmezden gelme** — tüm alert'ler sessiz kalır, kör nokta oluşur
2. **Pod'u silmeden önce logları al** — root cause analizi için log gerekli
3. **Alert'i kalıcı olarak susturma** — silence geçici olmalı, root cause çözülmeli

### ⚠️ Job Label Bağımlılığı
- Alert expr `job="hukuk-api-redrive"` kullanır
- Bu değer Prometheus scrape config'indeki `job_name` ile birebir eşleşmelidir
- Job adı değişirse alert expr de güncellenmelidir
```

### 3. Test Güncellemeleri

Mevcut test dosyasında güncellenmesi gereken noktalar:

1. **`EXPECTED_ALERT_NAMES` listesi:** `'RedriveScrapeDown'` eklenir
2. **Per-alert severity spot check:** `RedriveScrapeDown` → `severity: critical` testi eklenir
3. **Property 3 reverse mapping:** §5 bölümü orphan kontrolünden hariç tutulur VEYA yeni alert'in §5'e link'i doğrulanır
4. **Property 3 design matrix:** `RedriveScrapeDown` → `scrape-health` fragment eşleşmesi eklenir

**Not:** `up` metriği Prometheus built-in olduğundan Property 2 (metrik isim tutarlılığı) testinde `carrier_redrive_*` pattern'ine uymaz — bu test değişiklik gerektirmez.

## Doğruluk Özellikleri (Correctness Properties)

### Property 1 (genişletilmiş): Alert Yapısal Bütünlük (INV-13.1 — 5 alert)

Mevcut Property 1, 5. alert'i de kapsayacak şekilde otomatik genişler (`EXPECTED_ALERT_NAMES` güncellemesi ile).

### Property 3 (genişletilmiş): Alert ↔ Runbook Çift Yönlü Eşleşme (INV-13.3 — 5 alert)

Yeni alert'in runbook annotation'ı §5'e işaret eder. Bidirectional mapping korunur.

## Hata Yönetimi (Error Handling)

| Hata Senaryosu | Etki | Önlem |
|----------------|------|-------|
| Yanlış job adı | Alert hiç tetiklenmez | Ops doc'ta job label bağımlılığı belgelendi |
| Job rename/kaldırma | `up` time series absent → `== 0` tek başına tetiklenmez | `absent()` kombinasyonu ile yakalanır |
| `for: 2m` çok uzun | Gerçek down'da 2 dk kör kalınır | Başlangıç değeri — prod'da ayarlanabilir |
| `for: 2m` çok kısa | Geçici timeout'larda false positive | 2m ≈ 8 scrape cycle, makul denge |

## Test Stratejisi (Testing Strategy)

Mevcut test dosyasına minimal güncelleme — yeni describe block gerekmez:

1. `EXPECTED_ALERT_NAMES` → 5 alert
2. Per-alert severity spot check → `RedriveScrapeDown: critical`
3. Design matrix → `RedriveScrapeDown: scrape-health`
4. Tüm mevcut testler geçmeye devam eder

Test dosya konumu (değişmez):
```
apps/api/src/modules/calc-preview/diagnostics/object-store/manifest-retry/__tests__/
  redrive-ops-artifacts.spec.ts
```
