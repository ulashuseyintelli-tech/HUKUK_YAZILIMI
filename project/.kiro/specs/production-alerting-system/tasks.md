# Implementation Plan: Production Alerting System

## Overview

Bu plan, calc-preview modülü için kapsamlı üretim uyarı sistemi implementasyonunu tanımlar. Plan, tasarım dokümanındaki contract'ların birebir hayata geçmesini sağlar.

**Temel Prensipler:**
- Her sprint bir DoD (Definition of Done) ile biter
- Checkpoint'ler kritik entegrasyon noktalarını doğrular
- Property testler CI'da "kilit" görevi görür
- **TÜM TESTLER ZORUNLU** - Alerting'de test "nice-to-have" değil, ürünün kendisi

## Test Sınıflandırması

### A) Gate Testler (Mutlaka zorunlu, CI'da bloklar)
Bunlar olmadan merge yok:
- Determinism testleri (makeAlertKey, makeCorrelationId, Clock)
- IncidentStore invariants (aynı alertKey → aynı incident, restart-safe, **concurrent create atomicity**)
- Suppression/Inhibit çekirdeği (SECURITY no-suppress, maintenance clamp, parent-child)
- Trend deterministik (aynı input → aynı output, minSampleCount)
- StateMachine çekirdeği (DEGRADED mapping, manualReset kombinasyon, cooldown)
- Flapping escalation (3/5 eşikleri)

### B) Safety Net Testler (Zorunlu, sprint sonunda tamamlanabilir)
- fast-check property-based testlerin tamamı (12+)
- Golden scenario testleri (multi-tenant → global outage)
- Notification retry/backoff + idempotency testleri

**Safety Net B Gate Politikası:**
- Sprint 0–6: B = warning gate (merge'i bloklamaz)
- Sprint 7'den itibaren: B = hard blocker (state machine + dedupe geldiğinde)
- Release branch'e merge: B testleri zorunlu

### C) Nice-to-have (Opsiyonel)
- Load/perf testleri
- Chaos testleri
- Uzun süreli soak testler

## Tasks

- [x] 1. Sprint 0: Repo Foundations & Contracts
  - [x] 1.1 Core types ve enums oluştur
    - `alerting/types/alerting.types.ts` dosyasında Severity, Category, OwnerTeam, TenantScope, AlertType tanımla
    - _Requirements: 15.1, 15.2, 15.5_
  
  - [x] 1.2 Data models oluştur
    - `alerting/models/alerting.models.ts` dosyasında NormalizedSignal, Alert, AlertPayload, Incident, GlobalOutage modelleri
    - _Requirements: 15.1-15.7_
  
  - [x] 1.3 Configuration tanımla
    - `alerting/config/alerting.config.ts` dosyasında AlertingConfig + GlobalOutageConfig + defaults
    - _Requirements: 1.5, 2.3, 2.4, 9.5, 10.4, 12.1_
  
  - [x] 1.4 Deterministic hash utilities oluştur
    - `alerting/core/hash.ts` - stable hash wrapper (node/crypto)
    - `alerting/core/keys.ts` - makeAlertKey(), makeCorrelationId(), makeIdempotencyKey()
    - _Requirements: 13.2, 16.1_
  
  - [x] 1.5 Clock interface implement et
    - `alerting/core/clock.interface.ts` - IClock interface
    - `alerting/core/clock.ts` - SystemClock + FakeClock
    - _Requirements: 1.1-1.4, 9.2, 12.2_
  
  - [x] 1.6 Error taxonomy oluştur
    - `alerting/errors/alerting.errors.ts` - CollectorError, StoreError, NotifyError, InvalidConfigError
    - _Requirements: Error Handling_
  
  - [x] 1.7 Sprint 0 unit testleri yaz (Gate A)
    - Deterministic hash snapshot testleri
    - Clock interface testleri (FakeClock advance/setTime)
    - makeAlertKey, makeCorrelationId determinism
    - _Requirements: 13.2_

- [ ] 2. Sprint 1: Incident Store
  - [ ] 2.1 Incident Store interface tanımla
    - `alerting/stores/incident-store.interface.ts` - IIncidentStore
    - create/get/findActiveByAlertKey/findByCorrelationId/resolve/listActiveGlobalOutages
    - _Requirements: 13.1, 16.1, 16.2_
  
  - [ ] 2.2 In-Memory Incident Store implement et
    - `alerting/stores/inmemory-incident-store.ts`
    - Map tabanlı + TTL/cooldown state
    - alertKey index, correlationId index
    - _Requirements: 12.2, 13.1_
  
  - [ ] 2.3 Redis Incident Store implement et
    - `alerting/stores/redis-incident-store.ts`
    - Key design: inc:{incidentId}, active:{alertKey}, corr:{correlationId}
    - Atomicity: Lua script veya WATCH-MULTI
    - _Requirements: 12.2, 13.1_
  
  - [ ] 2.4 Incident Store invariant testleri yaz (Gate A)
    - Aynı alertKey → aynı active incident
    - Resolve → active mapping temizlenir
    - CorrelationId lookup çalışır
    - Restart-safe (serialize→restore veya Redis emülasyonu)
    - **Concurrent create atomicity:** concurrent create on same alertKey → exactly one active incident (Promise.all ile simüle)
    - **Property 8: Cooldown Bastırma**
    - **Property 9: CorrelationId Deterministik Üretim**
    - **Validates: Requirements 12.2, 13.1, 13.2**

- [ ] 3. Checkpoint 1 - Hafıza ve Determinism Kapısı
  - Ensure all tests pass, ask the user if questions arise.
  - **Gate A testleri zorunlu:** keys determinism, clock fake/system, incident store invariants
  - DoD: build green + deterministic snapshot testleri + incident store invariants

- [ ] 4. Sprint 2: Signal Collectors + Normalizer
  - [ ] 4.1 Security Collector implement et
    - `alerting/collectors/security.collector.ts`
    - JTI anomaly, cross-tenant attempt sinyalleri
    - JtiAnomalyDetectorService entegrasyonu
    - _Requirements: 3.1, 3.2_
  
  - [ ] 4.2 Health Collector implement et
    - `alerting/collectors/health.collector.ts`
    - DEGRADED enter/exit, failures, manualResetRequired
    - CircuitBreakerService entegrasyonu
    - _Requirements: 1.1-1.4, 2.1, 2.2_
  
  - [ ] 4.3 Capacity Collector implement et
    - `alerting/collectors/capacity.collector.ts`
    - Rate limit, queue depth, CPU/mem sinyalleri
    - _Requirements: 5.1-5.6_
  
  - [ ] 4.4 Integrity Collector implement et
    - `alerting/collectors/integrity.collector.ts`
    - Audit trail failures, status mismatch
    - _Requirements: 6.1, 6.2_
  
  - [ ] 4.5 Hygiene Collector implement et
    - `alerting/collectors/hygiene.collector.ts`
    - Validation error spike
    - _Requirements: 7.1_
  
  - [ ] 4.6 Normalizer implement et
    - `alerting/normalizer/normalizer.ts`
    - normalize(rawEvent) -> NormalizedSignal
    - evidenceRef, dimensions, component standardizasyonu
    - _Requirements: 15.1-15.7_
  
  - [ ] 4.7 Collector golden testleri yaz (Gate A)
    - Her collector için en az 1 golden örnek
    - Normalize determinism testleri
    - _Requirements: 3.1, 3.2, 5.1-5.6_

- [ ] 5. Sprint 3: Tenant Scope Resolver + Correlation Engine
  - [ ] 5.1 Tenant Scope Resolver implement et
    - `alerting/scope/tenant-scope-resolver.ts`
    - 3+ tenant / 5 dk window kuralı
    - Global tetikleyiciler (management/cross-tenant, critical deps)
    - _Requirements: 10.1, 10.2, 10.3, 10.4_
  
  - [ ] 5.2 Correlation Engine implement et
    - `alerting/correlation/correlation-engine.ts`
    - windowBucket(5m) + rootDimension + componentCluster
    - findRelatedIncidents, recordCorrelation
    - _Requirements: 13.1, 13.2, 13.3_
  
  - [ ] 5.3 Scope ve Correlation property testleri yaz (Gate A)
    - **Property 6: Tenant Scope Belirleme**
    - **Property 9: CorrelationId Deterministik Üretim**
    - Multi-tenant scope kuralı testi
    - **Validates: Requirements 10.1, 10.2, 13.1, 13.2**
  
  - [ ] 5.4 E2E pipeline testleri yaz (Safety Net B)
    - collect→normalize→scope→correlate senaryoları
    - _Requirements: 10.1-10.4, 13.1-13.3_

- [ ] 6. Checkpoint 2 - Pipeline Doğruluğu
  - Ensure all tests pass, ask the user if questions arise.
  - **Gate A testleri zorunlu:** normalize + scope + correlation determinism, multi-tenant scope kuralı
  - DoD: Collect→Normalize→Scope→Correlate e2e çalışıyor

- [ ] 7. Sprint 4: Global Outage Detector + Parent-Child Inhibit
  - [ ] 7.1 Global Outage Detector interface tanımla
    - `alerting/outage/global-outage-detector.interface.ts`
    - shouldEscalateToGlobal, declareGlobalOutage, resolveGlobalOutage, shouldInhibitChild
    - _Requirements: 17.4_
  
  - [ ] 7.2 Global Outage Detector implement et
    - `alerting/outage/global-outage-detector.ts`
    - Multi-tenant escalation (>=5 tenant, >=10 dk)
    - Critical dependency down
    - Manual declaration
    - _Requirements: 17.4_
  
  - [ ] 7.3 Parent-Child Inhibit implement et
    - `alerting/outage/should-inhibit-child.ts`
    - Category filter (CAPACITY, AVAILABILITY)
    - Tenant scope filter
    - IncidentStore entegrasyonu
    - _Requirements: 17.4_
  
  - [ ] 7.4 Global Outage testleri yaz (Gate A)
    - Global outage active iken child alert suppress testi
    - suppressed_alert_count metrik testi
    - _Requirements: 17.4, 17.5_

- [ ] 8. Sprint 5: Suppression/Inhibit Engine
  - [ ] 8.1 Suppression Engine implement et
    - `alerting/suppress/suppression-engine.ts`
    - maintenanceMode clamp (CAPACITY/AVAILABILITY max P2)
    - SECURITY no-suppress (sadece dedupe/aggregate)
    - Parent-child inhibit hook
    - _Requirements: 14.1, 14.2, 17.1, 17.2, 17.3_
  
  - [ ] 8.2 Suppression metrikleri implement et
    - suppressed_alert_count{reason,category,component}
    - inhibited_child_alert_count{parentType}
    - _Requirements: 17.5_
  
  - [ ] 8.3 Suppression property testleri yaz (Gate A)
    - **Property 4: SECURITY No-Suppress/No-Cooldown**
    - **Property 10: Maintenance Clamp**
    - SECURITY asla suppress edilmez testi
    - Maintenance clamp çalışır testi
    - Parent-child inhibit çalışır testi
    - **Validates: Requirements 3.5, 12.3, 14.1, 14.2, 17.1, 17.2**

- [ ] 9. Sprint 6: Trend Analyzer
  - [ ] 9.1 Window Store implement et
    - `alerting/trend/window-store.ts`
    - Ring buffer (component+alertType dimension) keyed
    - _Requirements: 18.2_
  
  - [ ] 9.2 Slope Calculator implement et
    - `alerting/trend/slope.ts`
    - Deterministik slope (basit regression veya delta)
    - _Requirements: 18.1, 18.3_
  
  - [ ] 9.3 Burn Rate Calculator implement et
    - `alerting/trend/burn-rate.ts`
    - SLO config ile budget consumption
    - _Requirements: 18.4_
  
  - [ ] 9.4 Trend Analyzer implement et
    - `alerting/trend/trend-analyzer.ts`
    - minSampleCount enforcement
    - Rolling window + slope yöntemi
    - _Requirements: 18.1-18.6_
  
  - [ ] 9.5 Trend Analyzer property testleri yaz (Gate A)
    - **Property 12: Trend Hesaplama**
    - Fixed input dataset → expected slope/burn-rate snapshot
    - Aynı input → aynı output determinism
    - minSampleCount enforce testi
    - **Validates: Requirements 18.1, 18.6**

- [ ] 10. Checkpoint 3 - Noise Control ve Matematik
  - Ensure all tests pass, ask the user if questions arise.
  - **Gate A testleri zorunlu:** suppression/inhibit çekirdek, trend analyzer determinism + minSampleCount
  - DoD: Suppression + Trend + Outage tamam

- [ ] 11. Sprint 7: Alert State Machine + Flapping + Recovery
  - [ ] 11.1 Alert State Machine implement et
    - `alerting/state/alert-state-machine.ts`
    - OPEN/RESOLVED lifecycle
    - cooldownAfterResolveMs (30 dk)
    - _Requirements: 8.1, 8.2, 12.1, 12.2_
  
  - [ ] 11.2 Flap Tracker implement et
    - `alerting/state/flap-tracker.ts`
    - 3/5 flap per 60m thresholds
    - Rolling 60 dk window
    - _Requirements: 9.1-9.5_
  
  - [ ] 11.3 Recovery Events implement et
    - INCIDENT_RESOLVED event
    - RECOVERY_WITH_FLAPPING_RISK event
    - resolvedAt, durationMs, rootCauseHint, resolutionReason
    - _Requirements: 8.1, 8.2, 8.3_
  
  - [ ] 11.4 DEGRADED Duration Policy implement et
    - 15/30 dk eşikleri
    - P3 → P2 → P1 escalation
    - _Requirements: 1.1-1.5_
  
  - [ ] 11.5 Manual Reset Policy implement et
    - Kombinasyon koşulu (manualResetRequired + failures/duration)
    - _Requirements: 2.1-2.4_
  
  - [ ] 11.6 State Machine property testleri yaz (Gate A)
    - **Property 1: DEGRADED Süre → Severity Mapping**
    - **Property 2: Manuel Reset Kombinasyon Koşulu**
    - **Property 5: Flap Count → Severity Mapping**
    - DEGRADED 15/30 mapping testi
    - manualResetRequired kombinasyon koşulu testi
    - Cooldown çalışır testi
    - 3/5 flap eşikleri doğru testi
    - **Validates: Requirements 1.1-1.5, 2.1-2.4, 9.1-9.5**

- [ ] 12. Sprint 8: Dedupe/Aggregator + Router + Ownership
  - [ ] 12.1 Dedupe Aggregator implement et
    - `alerting/dedupe/dedupe-aggregator.ts`
    - alertKey dedupe (15 dk window)
    - SECURITY dedupe/aggregation (cooldown yok)
    - _Requirements: 16.1, 16.2, 16.3_
  
  - [ ] 12.2 Router implement et
    - `alerting/routing/router.ts`
    - Category → OwnerTeam mapping
    - Severity → EscalationPolicy mapping
    - _Requirements: 11.1-11.6_
  
  - [ ] 12.3 Payload Builder implement et
    - `alerting/payload/payload-builder.ts`
    - Zorunlu alanlar validation
    - recommendation + runbookRef bağlama
    - _Requirements: 15.1-15.7_
  
  - [ ] 12.4 Dedupe ve Router property testleri yaz (Gate A)
    - **Property 7: Category → OwnerTeam Routing**
    - **Property 11: Dedupe Window**
    - Aynı alertKey tekrarlarında incident alertCount artar testi
    - Router ownership mapping testi
    - **Validates: Requirements 11.1-11.6, 16.1**

- [ ] 13. Checkpoint 4 - Ürünleşme Kapısı
  - Ensure all tests pass, ask the user if questions arise.
  - **Gate A testleri zorunlu:** state machine lifecycle + cooldown, flapping escalation, dedupe aggregator, router ownership
  - DoD: StateMachine+Trend+Suppression+Flap tamam; incident lifecycle doğru

- [ ] 14. Sprint 9: Notification Service
  - [ ] 14.1 Notification Service interface tanımla
    - `alerting/notify/notification-service.interface.ts`
    - send, getStatus, listDeadLetters, retryDeadLetter
    - _Requirements: 15.1-15.7_
  
  - [ ] 14.2 Notification Service implement et
    - `alerting/notify/notification-service.ts`
    - At-least-once delivery
    - Retry 3 (1/2/4s exponential backoff)
    - Dead letter queue
    - Idempotency key
    - _Requirements: 15.1-15.7_
  
  - [ ] 14.3 Notification adapters implement et
    - `alerting/notify/adapters/webhook.adapter.ts`
    - `alerting/notify/adapters/slack.adapter.ts`
    - `alerting/notify/adapters/console.adapter.ts`
    - _Requirements: 15.1-15.7_
  
  - [ ] 14.4 Failure handling implement et
    - Notify failure → metric only (P2 alert yok)
    - notification_delivery_failed metriği
    - _Requirements: Error Handling_
  
  - [ ] 14.5 Notification Service testleri yaz (Safety Net B)
    - Retry/backoff testleri
    - Dead letter queue testleri
    - Idempotency testleri
    - _Requirements: 15.1-15.7_

- [ ] 15. Sprint 10: Property-Based Tests + CI
  - [ ] 15.1 Property test suite oluştur
    - `alerting/__tests__/alerting.property.spec.ts`
    - 12 temel property için fast-check testleri
    - _Requirements: All_
  
  - [ ] 15.2 Property 1-4 testleri implement et (Safety Net B)
    - **Property 1: DEGRADED Süre → Severity Mapping**
    - **Property 2: Manuel Reset Kombinasyon Koşulu**
    - **Property 3: SECURITY P0 Üretimi**
    - **Property 4: SECURITY No-Suppress/No-Cooldown**
    - **Validates: Requirements 1.1-1.5, 2.1-2.4, 3.1-3.5**
  
  - [ ] 15.3 Property 5-8 testleri implement et (Safety Net B)
    - **Property 5: Flap Count → Severity Mapping**
    - **Property 6: Tenant Scope Belirleme**
    - **Property 7: Category → OwnerTeam Routing**
    - **Property 8: Cooldown Bastırma**
    - **Validates: Requirements 9.1-9.5, 10.1-10.4, 11.1-11.6, 12.1-12.3**
  
  - [ ] 15.4 Property 9-12 testleri implement et (Safety Net B)
    - **Property 9: CorrelationId Deterministik Üretim**
    - **Property 10: Maintenance Clamp**
    - **Property 11: Dedupe Window**
    - **Property 12: Trend Hesaplama**
    - **Validates: Requirements 13.1-13.3, 14.1-14.2, 16.1, 18.1-18.6**
  
  - [ ] 15.5 Golden scenario testleri yaz (Safety Net B)
    - Multi-tenant → global outage escalation → child inhibit
    - Maintenance clamp senaryosu
    - SECURITY no-suppress senaryosu
    - DEGRADED → P2 → P1 escalation
    - _Requirements: All_
  
  - [ ] 15.6 CI/CD pipeline konfigüre et
    - `.github/workflows/alerting-tests.yml`
    - Test + coverage gate
    - Flakey test guard (FakeClock everywhere)
    - Gate A testleri: hard blocker (tüm sprint'lerde)
    - Safety Net B testleri: Sprint 0-6 warning gate, Sprint 7+ hard blocker
    - Release branch merge: B testleri zorunlu
    - _Requirements: All_

- [ ] 16. Final Checkpoint - Production Guardrail
  - Ensure all tests pass, ask the user if questions arise.
  - **Tüm Gate A testleri zorunlu**
  - **Tüm Safety Net B testleri zorunlu**
  - DoD: Property suite + CI gate ile production "guardrail" kilitli

## Notes

- **TÜM TESTLER ZORUNLU** - Opsiyonel test yok
- **Gate A testleri:** CI'da hard blocker, merge engelleyici (tüm sprint'lerde)
- **Safety Net B testleri:** Sprint 0-6 warning gate, Sprint 7+ hard blocker, release branch'e merge zorunlu
- **Concurrent atomicity testi:** IncidentStore'da race condition önleme için kritik
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties
- Unit tests validate specific examples and edge cases
- FakeClock kullanımı tüm zaman-bağımlı testlerde zorunlu
- SECURITY kategorisi için cooldown/suppress istisnaları kritik
- Date.now() doğrudan kullanım YASAK - IClock interface kullan
