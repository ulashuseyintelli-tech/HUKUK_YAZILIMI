# Phase 13 — Kapanış Mimarisi & Operability Gap Analizi

> **Durum:** Phase 13 DONE — documented-operable
> **Tarih:** 2026-02-08
> **Bağımlılıklar:** Phase 11.3 (Depth), 11.4 (Rate Limit), 12 (Safeguards)

---

## Mimari Diyagram — Uçtan Uca Observability & Ops Akışı

```
┌─────────────────────────────────────────────────────────────────────┐
│                         NestJS API                                   │
│                                                                      │
│  POST /redrive ──► KillSwitch ──► RateLimit ──► DepthCheck ──►      │
│                    Guard          Guard          Guard               │
│                    │              │              │                    │
│                    ▼              ▼              ▼                    │
│                    gauge          counters       counter              │
│                    kill_switch_   rate_limited_  depth_exceeded_      │
│                    active         total          total                │
│                    disabled_      rate_check_    ───────────►        │
│                    total          failed_total     atomicRedrive      │
│                                  backoff_*         │                 │
│                                                    ▼                 │
│                                                  histogram           │
│                                                  tx_duration_        │
│                                                  seconds             │
│                                                                      │
│  GET /metrics ──► MetricsAggregator.toPrometheusText()              │
│       │           ├─ carrier_redrive_*  (9 base metrics)            │
│       │           ├─ audit_*                                         │
│       │           └─ idempotency_*                                   │
│       │                                                              │
│       │  ⚠️ AUTH YOK — internal network / allowlist / sidecar şart  │
└───────┼──────────────────────────────────────────────────────────────┘
        │
        │ scrape (15s interval)
        │ ⚠️ up == 0 → tüm alert'ler sessiz kalır (kör nokta)
        │
┌───────▼──────────────────────────────────────────────────────────────┐
│                      Prometheus Server                                │
│                                                                       │
│  scrape health:  up{job="hukuk-api-redrive"}                         │
│                  └─ 1 = OK, 0 = scrape fail ⚠️ alert tanımsız       │
│                                                                       │
│  ★ redrive-alerts.yml (Phase 13)                                     │
│  ┌─────────────────────────────────────────────────────────────────┐ │
│  │ RedriveRateCheckFailed   │ critical │ for: 0m  │ fail-closed   │ │
│  │ RedriveTxDurationHigh    │ warning  │ for: 5m  │ p99 > 2s     │ │
│  │ RedriveKillSwitchActive  │ warning  │ for: 30m │ gauge == 1   │ │
│  │ RedriveDepthExceeded     │ warning  │ for: 0m  │ poison entry │ │
│  └─────────────────────────────────────────────────────────────────┘ │
│                       │                                               │
│                       │ fire                                          │
│                       ▼                                               │
│              ⚠️ Alertmanager (YAPILANDIRILMAMIŞ)                     │
│                 routing config yok                                    │
│                 receiver tanımsız                                     │
│                 group_wait / repeat_interval ayarlanmamış             │
└───────────────────────┬──────────────────────────────────────────────┘
                        │
                        │ ⚠️ delivery gap
                        ▼
              ┌─────────────────────┐
              │  Slack / PagerDuty  │  ← receiver config gerekli
              │  (henüz bağlı değil)│
              └─────────────────────┘

┌──────────────────────────────────────────────────────────────────────┐
│  Alert → Runbook Link Resolution                                      │
│                                                                       │
│  runbook annotation (repo-relative path):                            │
│    "docs/redrive-ops-runbook.md#<section-anchor>"                    │
│                                                                       │
│  ┌──────────────────────┐    anchor/slug    ┌──────────────────────┐ │
│  │ redrive-alerts.yml   │ ──────────────►   │ redrive-ops-runbook  │ │
│  │                      │   GitHub-style    │ .md                  │ │
│  │ 4 alert              │   slugification   │                      │ │
│  │ 4 runbook annotation │   + NFKD norm.    │ §1 Kill-Switch       │ │
│  │                      │                   │ §2 Rate Limiting     │ │
│  │                      │   CI-enforced ✓   │ §3 TX Duration       │ │
│  │                      │   (51 test)       │                      │ │
│  └──────────────────────┘                   └──────────────────────┘ │
│                                                                       │
│  ⚠️ Kırılganlık: heading rename → anchor kırılır → CI yakalar        │
│     Garanti: deterministik değil, CI-enforced deterministik           │
└──────────────────────────────────────────────────────────────────────┘
```

## Alert ↔ Runbook Eşleşme Matrisi

| Alert | Severity | for | Runbook Bölümü | Tetikleyici |
|-------|----------|-----|----------------|-------------|
| `RedriveRateCheckFailed` | critical | 0m | §2 Rate Limiting | `increase(rate_check_failed_total[5m]) > 0` |
| `RedriveTxDurationHigh` | warning | 5m | §3 TX Duration | `p99 > 2s AND count > 0.1` |
| `RedriveKillSwitchActive` | warning | 30m | §1 Kill-Switch | `kill_switch_active == 1` |
| `RedriveDepthExceeded` | warning | 0m | §2 Rate Limiting | `increase(depth_exceeded_total[5m]) > 0` |

## Olgunluk Seviyesi — Phase 13 Sonrası

| Katman | Durum | Kanıt |
|--------|-------|-------|
| Fail-fast | ✅ DONE | Rate limit (11.4) + Depth limit (11.3) |
| Fail-safe | ✅ DONE | Kill-switch (12) |
| Observable | ✅ DONE | 9 metrik + /metrics endpoint (12) |
| Documented-operable | ✅ DONE | Runbook (708 satır) + 4 alert rule + 51 CI test (13) |
| Fully operable | ⚠️ GAP | Aşağıdaki 3 açık kalem |

---

## Operability Gap Listesi — Phase 13 Sonrası Açık Kalemler

| # | Gap | Risk | Etki | Önerilen Çözüm | Öncelik |
|---|-----|------|------|----------------|---------|
| G1 | `up == 0` scrape health alert'i tanımsız | Scrape failure'da 4 alert sessiz kalır — "metric gelmiyor = alert yok" kör noktası | Tüm observability katmanı devre dışı kalabilir | `up{job="hukuk-api-redrive"} == 0` alert'i ekle (alternatif: scrape health dashboard + pager policy — alert eklenemeyen ortamlarda bilinçli alternatif) | **Yüksek** |
| G2 | Alertmanager routing config yok | Alert fire eder ama hiçbir yere deliver edilmez — Prometheus'ta görünür, ops ekibine ulaşmaz | Alert'ler sadece Prometheus UI'da kalır, notification yok | `alertmanager.yml`: receiver (Slack webhook / PagerDuty key), route (severity bazlı), group_wait/repeat_interval | **Yüksek** |
| G3 | p99 eşik kalibrasyonu yapılmamış | 2s başlangıç eşiği tahmini — gerçek baseline bilinmiyor | False positive (eşik düşükse) veya false negative (eşik yüksekse) | Prod'da 1 hafta veri topla → baseline × 3 = eşik (runbook §3 kalibrasyon prosedürü) | **Orta** (deploy sonrası) |

**G1 + G2 birlikte çözülmeli:** Alertmanager olmadan `up` alert'i de deliver edilemez. Sıralama: G2 → G1 → G3.

---

## Phase 13 Kapanış Notu

Phase 13, DLQ redrive mekanizmasını **documented-operable** seviyesine getirmiştir:
- Runbook: failure-mode bazlı, Runbook DoD (5 madde) her bölümde uygulanmış
- Alert rules: 4 kural, severity dağılımı kontrollü, min sample guard aktif
- CI koruması: 51 test — yapısal bütünlük, metrik tutarlılık, çift yönlü eşleşme, içerik doğrulama

**Fully operable** seviyesi için G1-G3 gap'leri kapatılmalıdır. Bu kalemler Phase 13'ü re-open gerektirmez — ayrı iş kalemleri olarak backlog'a alınmalıdır.
