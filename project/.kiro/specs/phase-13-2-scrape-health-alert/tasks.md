# Implementation Plan: Phase 13.2 — Scrape Health Alert

## Overview

Phase 13.2, G1 gap'ini kapatır: `up == 0` scrape health alert'i eklenir. Tek alert rule, ops doc güncellemesi ve mevcut test güncellemesi — küçük ve odaklı phase.

## Tasks

- [ ] 1. Alert rule ekle — `ops/prometheus/redrive-alerts.yml`
  - [ ] 1.1 `RedriveScrapeDown` alert rule'unu mevcut `redrive_alerts` group'una ekle
    - `alert: RedriveScrapeDown`
    - `expr: (up{job="hukuk-api-redrive"} == 0) or absent(up{job="hukuk-api-redrive"})`
    - `for: 2m`
    - Labels: `severity: critical`, `team: backend`, `component: redrive`
    - Annotations: `summary`, `description`, `runbook` (§5'e link)
    - Yorum bloğu: Alert 5 açıklaması
    - Mevcut 4 alert'e dokunma (LOCKED)
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 2.1, 2.2, 2.3_

- [ ] 2. Ops doc güncelle — `docs/redrive-ops-runbook.md`
  - [ ] 2.1 §5 Scrape Health / RedriveScrapeDown bölümünü ekle
    - Runbook DoD yapısı: What it means, Impact, Immediate actions (max 7), Deep dive, Rollback
    - İlgili Alert: `RedriveScrapeDown`
    - İlgili PromQL: `up{job="hukuk-api-redrive"}`
    - ❌ Yapma Listesi (en az 3 madde)
    - ⚠️ Job Label Bağımlılığı notu
    - TOC güncelleme (§5 ekleme)
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

- [ ] 3. Testleri güncelle — `redrive-ops-artifacts.spec.ts`
  - [ ] 3.1 `EXPECTED_ALERT_NAMES` listesine `'RedriveScrapeDown'` ekle
  - [ ] 3.2 Per-alert severity spot check: `RedriveScrapeDown` → `severity: critical` testi ekle
  - [ ] 3.3 Property 3 design matrix: `{ alert: 'RedriveScrapeDown', sectionFragment: 'scrape-health' }` ekle
  - [ ] 3.4 Property 3 reverse mapping: §5 bölümünü orphan kontrolüne dahil et (yeni alert §5'e link veriyor — orphan olmamalı)
  - [ ] 3.5 Task 4.4 ops doc içerik doğrulama: `PLAYBOOK_SECTIONS` listesine §5 ekle (veya §5'i hariç tut — karar: §5 tam playbook formatında ise dahil et)
  - _Requirements: 4.1, 4.2, 4.3, 4.4_

- [ ] 4. Checkpoint — Tutarlılık kontrolü
  - Yeni alert YAML'da mevcut ve parse ediliyor mu?
  - Mevcut 4 alert değişmemiş mi? (LOCKED)
  - Alertmanager config değişmemiş mi? (Phase 13.1 LOCKED)
  - Ops doc §5 mevcut, TOC güncel mi?
  - Tüm testler geçiyor mu? (68 mevcut + güncellemeler)
  - Runbook anchor eşleşmesi doğru mu? (alert annotation → §5 heading)
  - Ensure all checks pass, ask the user if questions arise.

- [ ] 5. Final checkpoint — Tüm doğrulamalar geçiyor
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Bu phase küçük ve odaklıdır — tek alert, tek runbook bölümü, test güncellemesi
- Phase 13 alert rule'ları LOCKED — yalnızca yeni alert eklenir, mevcut değişmez
- Phase 13.1 Alertmanager config LOCKED — yeni alert mevcut routing'e otomatik girer
- `up` metriği Prometheus built-in'dir — uygulama tarafında üretilmez, `carrier_redrive_*` pattern'ine uymaz
- `job="hukuk-api-redrive"` değeri Prometheus scrape config'indeki job adı ile eşleşmelidir
- `for: 2m` başlangıç değeridir — prod ortamında scrape interval'e göre ayarlanabilir
