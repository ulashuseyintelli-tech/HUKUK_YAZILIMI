# Implementation Plan: Phase 13 — Ops Doc & Alert Rules

## Overview

Phase 13, DLQ redrive mekanizması için operasyonel runbook (markdown) ve Prometheus alert rules (YAML) dosyalarını oluşturur. Yeni uygulama kodu yazılmaz — çıktılar doküman ve konfigürasyon artefaktlarıdır.

## Tasks

- [x] 1. Ops Doc oluştur — `docs/redrive-ops-runbook.md`
  - [x] 1.1 Kritik uyarılar bölümünü yaz (§0)
    - `/metrics` endpoint auth içermez uyarısı
    - Production minimum güvenlik: public erişime kapalı, internal network / allowlist / ingress restriction, mümkünse ayrı port / sidecar
    - Scrape health izleme notu: `up` metriği kontrolü, "metric gelmiyor = alert yok" uyarısı
    - Prometheus scrape ön koşulu + temel scrape config örneği
    - _Requirements: 4.1, 4.2, 4.3, 12.1, 12.2, 12.3, 13.5_
  - [x] 1.2 Kill-Switch Prosedürü bölümünü yaz (§1)
    - **Runbook DoD yapısı (zorunlu 5 madde):**
      - What it means: Kill-switch semantiği, kullanıcı etkisi
      - Impact / Blast radius: etkilenen/etkilenmeyen endpoint'ler
      - Immediate actions: Etkinleştirme adımları (max 7 adım: duyuru → env var → restart → doğrulama)
      - Deep dive: Doğrulama adımları (gauge == 1, disabled_total artışı, HTTP 503), karar kriterleri
      - Rollback / Disable path: Devre dışı bırakma adımları
    - Tetikleyici sinyaller (tx duration spike, downstream arıza, veri tutarsızlığı)
    - Yapma listesi (en az 1 madde)
    - İlgili alert referansı: `RedriveKillSwitchActive`
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 9.2_
  - [x] 1.3 Rate Limiting Operasyonel Rehber bölümünü yaz (§2)
    - **Runbook DoD yapısı (zorunlu 5 madde):**
      - What it means: Rate limiting semantiği, retry storm etkisi
      - Impact / Blast radius: hangi kullanıcılar/akışlar etkilenir
      - Immediate actions: Tune etme adımları (sıralı, max 7)
      - Deep dive: Metrik referans tablosu, PromQL sorguları, `rate_check_failed_total > 0` kritik uyarısı
      - Rollback / Disable path: Parametre geri alma, kill-switch referansı
    - Tetikleyici sinyaller (rate_check_failed_total > 0, rate_limited_total artışı)
    - Backoff konfigürasyon tablosu (baseMs, capExponent, maxBackoffMs, jitterPct + varsayılanlar)
    - Parametre açıklamaları ve etki analizi
    - Her metriğin label durumu (var/yok, intentional) açıkça belgelenmeli
    - Yapma listesi (en az 1 madde)
    - İlgili alert referansları: `RedriveRateCheckFailed`, `RedriveDepthExceeded`
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 9.2, 13.6_
  - [x] 1.4 TX Duration İzleme bölümünü yaz (§3)
    - **Runbook DoD yapısı (zorunlu 5 madde):**
      - What it means: TX duration semantiği (histogram_quantile, server-side hesaplama), kullanıcı etkisi
      - Impact / Blast radius: DB contention, connection pool, lock-wait etki alanı
      - Immediate actions: Eskalasyon adımları (sıralı: connection pool → pg_stat_activity → pg_locks → kill-switch)
      - Deep dive: p50/p95/p99 PromQL sorguları (`sum(...) by (le)` ile servis bazında aggregate), kalibrasyon prosedürü
      - Rollback / Disable path: Kill-switch referansı (§1'e git)
    - Histogram metriği açıklaması (ne ölçer, bucket'lar)
    - Beklenen değer aralıkları tablosu (kalibrasyon öncesi tahmini)
    - Min sample guard açıklaması (düşük trafikte p99 noisy olur)
    - Yapma listesi (en az 1 madde)
    - İlgili alert referansı: `RedriveTxDurationHigh`
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 9.2_
  - [x] 1.5 İçindekiler tablosu ve dosya finalizasyonu
    - TOC ekle (tüm bölümlere link)
    - Tüm PromQL sorgularının kod blokları içinde olduğunu doğrula
    - Her bölümde yapma listesi olduğunu doğrula
    - _Requirements: 11.1, 11.2, 11.3, 11.4_

- [x] 2. Prometheus Alert Rules oluştur — `ops/prometheus/redrive-alerts.yml`
  - [x] 2.1 Alert rules YAML dosyasını oluştur
    - `groups` → `rules` yapısı
    - `RedriveRateCheckFailed`: `increase(carrier_redrive_rate_check_failed_total[5m]) > 0`, severity: critical, for: 0m
    - `RedriveTxDurationHigh`: `histogram_quantile(0.99, sum(rate(carrier_redrive_tx_duration_seconds_bucket[5m])) by (le)) > 2 and sum(rate(carrier_redrive_tx_duration_seconds_count[5m])) > 0.1`, severity: warning, for: 5m
    - `RedriveKillSwitchActive`: `carrier_redrive_kill_switch_active == 1`, severity: warning, for: 30m
    - `RedriveDepthExceeded`: `increase(carrier_redrive_depth_exceeded_total[5m]) > 0`, severity: warning, for: 0m
    - Tüm alert'lerde: `team` label, `component: redrive` label
    - Tüm alert'lerde: `summary`, `description`, `runbook` annotation'ları
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 6.1, 6.2, 6.3, 6.4, 6.5, 7.1, 7.2, 7.3, 7.4, 8.1, 8.2, 8.3, 8.4, 9.1, 10.1, 10.2, 10.3, 10.4_

- [x] 3. Checkpoint — Artefakt tutarlılık kontrolü
  - Ops doc'taki tüm metrik isimleri mevcut envanterde var mı?
  - Alert rules'daki tüm metrik isimleri mevcut envanterde var mı?
  - Her alert'in runbook annotation'ı ops doc'ta geçerli bir bölüme işaret ediyor mu?
  - Her ops doc bölümü en az bir alert tarafından referans veriliyor mu?
  - Ensure all checks pass, ask the user if questions arise.

- [x] 4. Artefakt doğrulama testleri
  - [x]* 4.1 Alert yapısal bütünlük testi yaz
    - **Property 1: Alert Yapısal Bütünlük**
    - YAML parse → her alert'te severity, team, component, summary, description, runbook kontrol et
    - **Validates: Requirements 5.3, 5.4, 5.5, 6.4, 6.5, 7.3, 7.4, 8.3, 8.4, 9.1, 10.3, 10.4**
  - [x]* 4.2 Metrik isim tutarlılık testi yaz
    - **Property 2: Metrik İsim Tutarlılığı**
    - Alert expr'larından ve ops doc PromQL bloklarından metrik isimlerini çıkar, bilinen envanter ile karşılaştır
    - **Validates: Requirements 13.2, 13.4**
  - [x]* 4.3 Alert ↔ Runbook eşleşme testi yaz
    - **Property 3: Alert ↔ Runbook Çift Yönlü Eşleşme**
    - Her alert'in runbook annotation'ı geçerli ops doc bölümüne işaret ediyor mu? Her bölüm en az bir alert tarafından referans veriliyor mu?
    - **Validates: Requirements 9.1, 9.2, 9.3**
  - [x]* 4.4 Ops doc içerik doğrulama testi yaz
    - 3 bölüm mevcut mu? Her bölümde yapma listesi var mı? PromQL kod blokları var mı? TOC var mı?
    - **Validates: Requirements 11.3, 11.4, 1.6, 2.6, 3.6**

- [x] 5. Final checkpoint — Tüm doğrulamalar geçiyor
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Bu phase yeni uygulama kodu içermez — çıktılar markdown ve YAML dosyalarıdır
- Phase 11.4 ve Phase 12 metrik isimleri/label'ları LOCKED — değiştirilemez
- `RedriveTxDurationHigh` eşik değeri (2s) başlangıç değeridir — kalibrasyon prosedürüne göre ayarlanmalıdır
