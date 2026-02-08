# Implementation Plan: Phase 13.1 — Alertmanager Routing & Delivery

## Overview

Phase 13.1, Phase 13'te oluşturulan 4 Prometheus alert rule'unun Alertmanager üzerinden deterministik delivery'sini sağlar. Çıktılar: Alertmanager config YAML, ops doc güncellemesi ve opsiyonel validation testi.

## Tasks

- [x] 1. Alertmanager config oluştur — `ops/alertmanager/alertmanager.yml`
  - [x] 1.1 Config iskeletini oluştur
    - `global` bölümü: `resolve_timeout: 5m`
    - 3 receiver tanımı: `slack-default`, `pagerduty-critical`, `slack-warning`
    - PagerDuty receiver: `service_key` placeholder (`<PAGERDUTY_SERVICE_KEY>`)
    - Slack receiver'lar: `api_url` placeholder (`<SLACK_WEBHOOK_URL>`), `channel` placeholder'ları
    - Slack template: `alertname`, `severity`, `summary`, `runbook` alanları
    - `send_resolved: true` (warning Slack receiver'da)
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 2.1, 2.2, 2.3, 2.4, 2.5_
  - [x] 1.2 Route tree tanımla
    - Root route: `receiver: slack-default`, `group_by: [alertname, component]` (component-level aggregation — `service` label yok, intentional)
    - `group_wait: 30s`, `group_interval: 5m`, `repeat_interval: 4h` (root default)
    - Alt route: `match: {team: backend, component: redrive}`
    - Critical alt route: `match: {severity: critical}` → `pagerduty-critical`, `repeat_interval: 1h`
    - Warning alt route: `match: {severity: warning}` → `slack-warning`, `repeat_interval: 2h`
    - `continue: false` her leaf route'ta
    - Catch-all davranışı: label eksik/yanlış → `slack-default` (sessizce kaybolmaz, log-visible)
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 4.1, 4.2, 4.3, 4.4_
  - [x] 1.3 Inhibition kuralı ekle
    - `source_matchers: [severity = "critical"]`
    - `target_matchers: [severity = "warning"]`
    - `equal: [component]` — `service` label contract'ta yok, eklenmez
    - Yorum satırı ile açıklama
    - _Requirements: 5.1, 5.2, 5.3_
  - [x] 1.4 Ortam bazlı override dokümantasyonu
    - Config dosyası başına yorum bloğu: placeholder listesi + env var eşleşmesi
    - Dev/staging alternatifi notu (PagerDuty yerine Slack veya null receiver)
    - _Requirements: 6.1, 6.2, 6.3_

- [x] 2. Ops doc güncellemesi — `docs/redrive-ops-runbook.md` §4 ekle
  - [x] 2.1 §4 Alert Delivery & Triage bölümünü yaz
    - **Runbook DoD yapısı (uyarlanmış — delivery odaklı):**
      - What it means: Alert delivery zinciri açıklaması (Prometheus → Alertmanager → receiver)
      - Impact / Blast radius: Delivery failure'da ne olur (alert fire eder ama notification gelmez)
      - Immediate actions: "Alert gelmiyor" kontrol adımları (max 7 adım)
      - Deep dive: Alertmanager status/alerts UI, receiver config kontrolü, inhibition kontrolü
      - Rollback / Disable path: Config geri alma, receiver değiştirme
    - Config dosya konumu referansı: `ops/alertmanager/alertmanager.yml`
    - Delivery akış matrisi (alert → severity → receiver tablosu)
    - Maintenance / mute mekanizması notu: `amtool silence add`, `mute_time_intervals` referansı, "bakım sonrası silence kaldır" uyarısı
    - TOC güncelleme (§4 ekleme)
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 10.1, 10.2, 10.3_

- [x] 3. Checkpoint — Config tutarlılık kontrolü
  - Route tree'deki tüm receiver isimleri `receivers` bölümünde tanımlı mı?
  - Inhibition rule'daki label'lar Phase 13 alert label contract'ı ile uyumlu mu? (`equal: [component]` — `service` yok, intentional)
  - Timing değerleri (group_wait, group_interval, repeat_interval) tanımlı ve makul mü?
  - Catch-all davranışı: label eksik/yanlış olan alert `slack-default`'a düşüyor mu?
  - Ops doc §4 bölümü mevcut, maintenance/mute notu var ve TOC güncel mi?
  - Config validation komutu belgelenmiş mi? (`amtool check-config` + render sırası)
  - Ensure all checks pass, ask the user if questions arise.

- [x] 4. Config validation testi (opsiyonel)
  - [x]* 4.1 Alertmanager config yapısal bütünlük testi yaz
    - YAML parse → receivers, route, inhibit_rules bölümleri mevcut mu?
    - Receiver isimleri route tree referanslarıyla eşleşiyor mu?
    - `group_by` tanımlı mı?
    - En az 1 inhibition rule var mı?
    - **Validates: Property 1 (INV-13.1.1), Property 3 (INV-13.1.3)**
    - _Requirements: 8.1, 8.2, 8.3_
  - [x]* 4.2 Route determinizm testi yaz
    - Sample alert payload'ları: 4 alert × label set → beklenen receiver eşleşmesi
    - Inhibition senaryosu: critical + warning → warning susturulur
    - **Validates: Property 1 (INV-13.1.1), Property 2 (INV-13.1.2)**

- [x] 5. Final checkpoint — Tüm doğrulamalar geçiyor
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Bu phase yeni uygulama kodu içermez — çıktılar YAML config, doküman güncellemesi ve opsiyonel test dosyasıdır
- Phase 13 alert rule'ları ve label contract'ı LOCKED — değiştirilemez
- Placeholder'lar gerçek secret içermez — ortam bazlı secret yönetimi altyapı kararıdır
- Timing değerleri (group_wait, group_interval, repeat_interval) başlangıç değerleridir — prod trafiğine göre ayarlanmalıdır
- `amtool check-config` komutu Alertmanager CLI gerektirir — CI'da opsiyonel
