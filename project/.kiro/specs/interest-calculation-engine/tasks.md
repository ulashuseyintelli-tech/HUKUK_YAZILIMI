# Implementation Plan: Interest Calculation Engine

## Overview

Faiz Hesaplama Motoru implementasyonu, katman katman ilerleyerek "uçtan uca çalışan" hattı en erken kurmayı hedefler. Her task'ın Definition of Done (DoD) kriteri vardır.

**Teknoloji:** TypeScript, NestJS, Prisma, fast-check (PBT)
**Dizin:** `apps/api/src/modules/interest-engine/`

## Tasks

- [x] 1. Domain Model ve Ortak Tipler ✅ Sprint-0 Complete
  - [x] 1.1 Ortak tipler oluştur: Money, DateRange, PercentRate, Hash, Currency
    - `types/common.types.ts` dosyası ✅
    - Money tek kaynak; tüm hesaplar Money ile
    - _Requirements: 11.1, 13.1_

  - [x] 1.2 Domain entity'leri oluştur: ClaimBucket, Segment, Payment, AllocationStep, AncillaryType
    - `types/domain.types.ts` dosyası ✅
    - Zod schema + runtime validation
    - _Requirements: 11.1, 16.1_

  - [x] 1.3 CalculationRequest ve CalculationResult kontratları
    - `types/calculation.types.ts` dosyası ✅
    - Input hash üretimi deterministik (sıralama, normalize)
    - _Requirements: 11.1, 11.2, 11.4_

  - [x] 1.4 Write unit tests for domain types
    - `__tests__/hello-calculation.smoke.spec.ts` ✅ (36 tests passing)
    - Zod validation edge cases
    - _Requirements: 11.5_

- [x] 2. Strategy Layer (CaseTypeStrategy Registry) ✅
  - [x] 2.1 Strategy interface tanımla: CaseTypeStrategy ✅
    - `strategy/case-type-strategy.interface.ts` ✅
    - buildClaims(), allowedRates(), defaultPolicies() metodları
    - _Requirements: 2.1-2.8_

  - [x] 2.2 Strategy registry implementasyonu ✅
    - `strategy/case-type-strategy.registry.ts` ✅
    - Kambiyo/İlamsız/İlamlı/TTK1530 stratejileri
    - _Requirements: 2.1-2.6_

  - [x] 2.3 Strategy selection servisi ✅
    - `strategy/strategy-selector.service.ts` ✅
    - case metadata → strategy eşlemesi
    - Yanlış/eksik metadata'da açıklayıcı error code
    - _Requirements: 2.7, 2.8_

  - [x]* 2.4 Write unit tests for strategy selection ✅
    - `__tests__/strategy.spec.ts` ✅
    - Her case type için doğru strateji seçimi
    - _Requirements: 2.1-2.6_

- [x] 3. Checkpoint - Domain ve Strategy katmanları ✅
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Rate Provider (Cache + Version + Coverage Map) ✅ Sprint-1 Complete
  - [x] 4.1 RateEntry entity ve Prisma schema
    - `rates/rate-entry.entity.ts` ✅
    - sourceId, versionHash, effectiveDate, annualRate
    - _Requirements: 1.5, 1.7_

  - [x] 4.2 Rate Provider servisi ✅
    - `rates/rate-provider.service.ts` ✅
    - getRatesForPeriod(), getRateAtDate(), getRateTableVersion()
    - Cache + TTL implementasyonu
    - _Requirements: 1.1-1.4, 10.2, 10.3_

  - [x] 4.3 Coverage Map üretimi
    - `rates/coverage-map.builder.ts` ✅
    - coveragePercent, totalDays, coveredDays, gaps, overlaps, hasInferredRates
    - _Requirements: 1.8, 14.7, 14.8_

  - [x] 4.4 Rate Version hash determinism
    - `rates/rate-version-hash.ts` ✅
    - Aynı rate seti → aynı hash (order-independent)
    - _Requirements: 1.7, 15.1_

  - [x] 4.5 Write property test for Rate Version Hash Determinism
    - `__tests__/sprint-1.spec.ts` ✅
    - **Property 11: Rate Version Hash Determinism**
    - **Validates: Requirements 1.7**

  - [x] 4.6 Write unit tests for Coverage Map
    - `__tests__/sprint-1.spec.ts` ✅ (37 tests)
    - Gap detection, overlap detection, coverage percent
    - _Requirements: 1.8, 14.5, 14.6_

- [x] 5. Segment Builder (Canonical Boundary Rules) ✅ Sprint-2 Complete
  - [x] 5.1 Timeline generator
    - `segments/timeline-generator.ts` ✅
    - startDate, endDate, rate changes, enforcementDate, paymentDates
    - _Requirements: 3.7_

  - [x] 5.2 Day count calculator
    - `segments/day-count-calculator.ts` ✅
    - Canonical rule: [start, end) - başlangıç dahil, bitiş hariç
    - Istanbul timezone (Europe/Istanbul)
    - _Requirements: 12.1-12.9_

  - [x] 5.3 Interest formula (tek kaynak fonksiyon)
    - `segments/interest-formula.ts` ✅
    - Formula: principal * annualRate * days / dayCountBasis
    - _Requirements: 3.3, 3.4_

  - [x] 5.4 Segment Builder servisi
    - `segments/segment-builder.service.ts` ✅
    - buildSegments() metodu
    - PRE_ENFORCEMENT / POST_ENFORCEMENT phase ayrımı
    - _Requirements: 3.1, 3.2, 3.5, 3.6_

  - [x]* 5.5 Write property test for Day Count Consistency
    - `__tests__/sprint-2.spec.ts` ✅
    - **Property 6: Day Count Calculation Consistency**
    - **Validates: Requirements 12.3, 12.4, 12.8, 12.9**

  - [x]* 5.6 Write property test for Segment Interest Formula
    - `__tests__/sprint-2.spec.ts` ✅
    - **Property 2: Segment Interest Formula Correctness**
    - **Validates: Requirements 3.3**

  - [x]* 5.7 Write property test for Enforcement Date Phase Separation
    - `__tests__/sprint-2.spec.ts` ✅
    - **Property 12: Enforcement Date Phase Separation**
    - **Validates: Requirements 3.5**

  - [x]* 5.8 Write unit tests for Segment Builder edge cases
    - `__tests__/sprint-2.spec.ts` ✅ (51 tests)
    - Aynı gün, ardışık gün, rate change gününde ödeme
    - _Requirements: 3.1-3.8_

- [x] 6. Checkpoint - Rate Provider ve Segment Builder ✅
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Policy Gate (Mode-based Severity + Evidence) ✅ Sprint-1 Complete
  - [x] 7.1 Anomaly detectors
    - `policy-gate/detectors/index.ts` ✅
    - gap, overlap, negative day, out-of-order payment, excessive rate
    - Her detector evidence üretir (tarih aralığı + gün + id)
    - _Requirements: 5.1-5.8_

  - [x] 7.2 Mode matrix implementasyonu
    - `policy-gate/mode-matrix.ts` ✅
    - PREVIEW: warn + PreviewRecord bayrakları
    - PRODUCTION: gap=BLOCK
    - LEGAL_REPORT: gap/overlap/anomaly/inferred=ERROR
    - _Requirements: 14.1-14.4_

  - [x] 7.3 Policy Gate servisi
    - `policy-gate/policy-gate-v2.service.ts` ✅
    - validate() metodu
    - Decision object: decisionCode, severity, message, evidence
    - _Requirements: 5.9, 14.7, 14.8, 14.9_

  - [x] 7.4 Write property test for Policy Gate Blocking
    - `__tests__/sprint-1.spec.ts` ✅
    - **Property 4: Policy Gate Blocking**
    - **Validates: Requirements 5.9**

  - [x] 7.5 Write property test for Rate Gap Detection
    - `__tests__/sprint-1.spec.ts` ✅
    - **Property 5: Rate Gap Detection**
    - **Validates: Requirements 1.8, 5.1**

  - [x] 7.6 Write unit tests for each anomaly detector
    - `__tests__/sprint-1.spec.ts` ✅
    - Her mod için 1 golden scenario
    - _Requirements: 5.1-5.9_

- [x] 8. Allocation Engine (TBK 100 Hard Rule + Soft Tie-breaker) ✅ Sprint-3 Complete
  - [x] 8.1 TBK 100 core allocator
    - `allocation/tbk100-allocator.service.ts` ✅
    - Sıra: faiz → masraf → fer'i → anapara
    - _Requirements: 4.1-4.4, 16.2_

  - [x] 8.2 Soft policy tie-breaker
    - `allocation/claim-priority.service.ts` ✅
    - claimPriorityRule: OLDEST_DUE_FIRST, HIGHEST_RATE_FIRST, CUSTOM
    - ancillaryPriority: custom ordering
    - _Requirements: 17.4-17.8, 16.3_

  - [x] 8.3 Multi-payment allocation
    - `allocation/allocation-engine.service.ts` ✅
    - allocateMultiplePayments() metodu
    - Ödemeler arası faiz yeniden hesaplama
    - _Requirements: 4.5, 4.6, 4.7, 4.8_

  - [x]* 8.4 Write property test for TBK 100 Allocation Order
    - `__tests__/sprint-3.spec.ts` ✅
    - **Property 3: TBK 100 Allocation Order**
    - **Validates: Requirements 4.1, 4.2, 4.3, 4.4**

  - [x]* 8.5 Write property test for Multi-Claim Priority Order
    - `__tests__/sprint-3.spec.ts` ✅
    - **Property 8: Multi-Claim Priority Order**
    - **Validates: Requirements 17.4, 17.5, 17.6, 17.7**

  - [x]* 8.6 Write property test for Monotonicity Under Additional Payment
    - `__tests__/sprint-3.spec.ts` ✅
    - **Property 13: Monotonicity Under Additional Payment**
    - **Validates: Requirements 4.6, 11.3**

  - [x]* 8.7 Write property test for Idempotent Allocation Steps
    - `__tests__/sprint-3.spec.ts` ✅
    - **Property 14: Idempotent Allocation Steps**
    - **Validates: Requirements 11.3, 4.7**

  - [x]* 8.8 Write unit tests for TBK 100 vs Policy conflict
    - `__tests__/sprint-3.spec.ts` ✅ (42 tests)
    - Çakışma protokolü: "policy asla sınıf atlatamaz"
    - _Requirements: 4.1-4.8, 16.2, 16.3_

- [x] 9. Checkpoint - Policy Gate ve Allocation Engine ✅
  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. Reporter (Legal Text Templates + Parameter Reporting) ✅ Sprint-4 Complete
  - [x] 10.1 Legal text templates
    - `reporter/legal-text-templates.ts` ✅
    - Her InterestTypeCode için Türkçe hukuki metin
    - _Requirements: 6.1, 6.6_

  - [x] 10.2 Segment report generator
    - `reporter/segment-reporter.service.ts` ✅
    - periodStart, periodEnd, days, rate, rateSource, segmentInterest
    - _Requirements: 6.2, 6.3_

  - [x] 10.3 Parameter reporting
    - `reporter/legal-report-renderer.service.ts` ✅
    - roundingScope, sameDayPaymentRule, gapPolicy, rateVersion
    - "Hangi parametrelerle hesaplandı" bölümü
    - _Requirements: 6.4, 6.5, 6.7_

  - [x] 10.4 Disclaimer kuralları
    - `reporter/legal-report-renderer.service.ts` ✅
    - PREVIEW'de zorunlu disclaimer
    - PRODUCTION/LEGAL_REPORT'da yok
    - _Requirements: 14.3, 14.4_

  - [x]* 10.5 Write unit tests for Reporter
    - `__tests__/sprint-4.spec.ts` ✅
    - Her mod için rapor çıktısı kontrolü
    - _Requirements: 6.1-6.7_

- [x] 11. Audit Writer (Record + Trace + KVKK) ✅ Sprint-4 Complete
  - [x] 11.1 CalculationRecord entity ve Prisma schema
    - `audit/calculation-record.entity.ts` ✅
    - inputHash, outputSummary, versions, warnings, calculatedAt, calculatedBy
    - _Requirements: 7.1-7.6, 20.1, 20.2_

  - [x] 11.2 CalculationTrace entity
    - `audit/calculation-trace.entity.ts` ✅
    - segments, allocations, ratesUsed
    - _Requirements: 20.3_

  - [x] 11.3 PreviewRecord entity (ayrı tablo)
    - `audit/preview-record.entity.ts` ✅
    - is_preview=true, non_authoritative=true, disclaimer
    - _Requirements: 14.3, 14.4_

  - [x] 11.4 Audit Writer servisi
    - `audit/audit-writer.service.ts` ✅
    - writeRecord(), writeTrace(), getRecord(), getRecordsForCase()
    - _Requirements: 7.1-7.6_

  - [x] 11.5 Retention policy implementasyonu ✅
    - `audit/retention.service.ts` ✅
    - Record: 90 gün aktif, 10 yıl arşiv
    - Trace: 30 gün aktif, 2 yıl arşiv
    - Preview: 30 gün, sonra silme
    - _Requirements: 20.4-20.7_

  - [x] 11.6 KVKK Masking servisi ✅
    - `audit/masking.service.ts` ✅
    - TC Kimlik, isim, dosya no, tutar maskeleme
    - _Requirements: KVKK m.7_

  - [x] 11.7 RBAC access control ✅
    - `audit/access-control.service.ts` ✅
    - AccessLevel enum, rol-erişim matrisi
    - _Requirements: KVKK m.12_

  - [x] 11.8 Audit Access Log ✅
    - `audit/access-log.service.ts` ✅
    - Immutable, append-only, 5 yıl saklama
    - _Requirements: KVKK m.12_

  - [x]* 11.9 Write unit tests for Audit Writer
    - `__tests__/sprint-4.spec.ts` ✅ (35 tests)
    - Retention, masking, access control
    - _Requirements: 7.1-7.6, 20.1-20.7_

- [x] 12. Checkpoint - Reporter ve Audit Writer ✅
  - Ensure all tests pass, ask the user if questions arise.

- [x] 13. Main Engine Service (Orchestration) ✅
  - [x] 13.1 Interest Engine ana servisi
    - `interest-engine.service.ts` ✅
    - calculate() metodu: strategy → rate → segments → policy → allocation → report → audit
    - _Requirements: 11.1-11.5_

  - [x] 13.2 Input hash generation
    - Deterministik hash (sıralama, normalize) ✅
    - _Requirements: 11.4_

  - [x] 13.3 Version tracking ve pinning
    - rateTableVersion, engineVersion, ruleVersion ✅
    - PRODUCTION/LEGAL_REPORT'ta otomatik pinning
    - _Requirements: 15.1-15.6_

  - [x] 13.4 CalculationTrace JSON export
    - `trace/trace-exporter.service.ts` ✅
    - exportTrace(recordId) → TraceExport JSON
    - Tek fonksiyon, debuggable output
    - _Requirements: 20.3_

  - [x] 13.5 LegalReport render fonksiyonu
    - `reporter/legal-report-renderer.service.ts` ✅
    - renderLegalReport(result) → string
    - UI ve backend aynı fonksiyonu kullanır (shared)
    - _Requirements: 6.1-6.7_

  - [x]* 13.6 Write property test for Determinism (Round Trip)
    - `__tests__/sprint-5.spec.ts` ✅
    - **Property 1: Determinism (Round Trip)**
    - **Validates: Requirements 11.3**

  - [x]* 13.7 Write property test for Segment Sum Equals Total
    - `__tests__/sprint-5.spec.ts` ✅
    - **Property 10: Segment Sum Equals Total**
    - **Validates: Requirements 3.6**

  - [x]* 13.8 Write property test for Rounding Consistency
    - `__tests__/sprint-5.spec.ts` ✅
    - **Property 7: Rounding Consistency**
    - **Validates: Requirements 13.2, 13.3, 13.4, 13.5, 13.6**

  - [x]* 13.9 Write property test for Version Reproducibility
    - `__tests__/sprint-5.spec.ts` ✅
    - **Property 9: Version Reproducibility**
    - **Validates: Requirements 15.6**

- [x] 14. Integration Tests ✅ Sprint-5 Complete
  - [x]* 14.1 Full-flow integration test: PREVIEW mode
    - `__tests__/sprint-5.spec.ts` ✅
    - strategy → rate → segments → policy → allocation → report → audit
    - Gap varken warning, PreviewRecord oluşturma
    - _Requirements: 14.3_

  - [x]* 14.2 Full-flow integration test: PRODUCTION mode
    - `__tests__/sprint-5.spec.ts` ✅
    - Gap varken BLOCK
    - CalculationRecord oluşturma
    - _Requirements: 14.2_

  - [x]* 14.3 Full-flow integration test: LEGAL_REPORT mode
    - `__tests__/sprint-5.spec.ts` ✅
    - Gap/overlap/inferred → ERROR
    - CalculationRecord + CalculationTrace zorunlu
    - _Requirements: 14.1_

- [x] 15. Golden Scenarios (Regression Tests) ✅ Complete
  - [x]* 15.1 Kambiyo çek with multiple rate changes
    - Gerçek hayata benzeyen senaryo
    - Segment split, rate boundary
    - _Requirements: 2.1, 3.2_

  - [x]* 15.2 İlamsız genel with partial payments
    - TBK 100 mahsup sırası
    - _Requirements: 4.1-4.8_

  - [x]* 15.3 TTK 1530 with 30-day rule ✅
    - DUE_DATE_OR_30D policy
    - _Requirements: 2.5_

  - [x]* 15.4 Multi-claim with different start dates ✅
    - claimPriorityRule: OLDEST_DUE_FIRST
    - _Requirements: 17.4-17.11_

  - [x]* 15.5 Döviz alacağı (USD/EUR) with FX conversion ✅
    - TCMB_SATIS kuru
    - _Requirements: 9.1-9.4, 18.1-18.7_

  - [x]* 15.6 Aynı gün ödeme + rate değişim günü
    - Payment boundary + rate boundary çakışması
    - _Requirements: 12.5-12.7, 3.2_

  - [x]* 15.7 Gap + overlap birlikte (LEGAL_REPORT strict)
    - Multiple errors, strict mode
    - _Requirements: 14.1, 14.5, 14.6_

  - [x]* 15.8 Çoklu claim + policy tie-breaker
    - HIGHEST_RATE_FIRST vs OLDEST_DUE_FIRST karşılaştırma
    - _Requirements: 17.5, 17.6_

  - [x]* 15.9 Masraf eklenmesi (sonradan) + monotonicity
    - Geçmiş hesaplama değişmemeli
    - Property 13 validation
    - _Requirements: 4.6, 11.3_

  - [x]* 15.10 RoundingScope TOTAL_ONLY vs PER_SEGMENT
    - Kuruş farkı kontrolü
    - _Requirements: 13.4, 13.5, 13.6_

- [x] 16. Final Checkpoint ✅
  - Ensure all tests pass, ask the user if questions arise.

- [x] 17. Operational Hardening (Sprint-0 items complete)
  - [x] 17.1 Error taxonomy ✅
    - `errors/interest-engine-errors.ts` ✅
    - E_RATE_GAP, E_RATE_OVERLAP, E_ANOMALY_NEGATIVE_DAYS, vb.
    - Her error code için zorunlu evidence alanları (Appendix B)
    - _Requirements: 10.5, 11.5_

  - [x] 17.2 Version pinning enforcement ✅
    - `version/version-pinning.service.ts` ✅
    - PRODUCTION/LEGAL_REPORT'ta zorunlu pinning
    - Otomatik pinleme + rapora yazma
    - _Requirements: 15.1-15.6_

  - [x] 17.3 Metrics ✅
    - `metrics/interest-engine-metrics.service.ts` ✅
    - Cache hit/miss, policy block reasons, avg segment count
    - Dashboard-ready metric isimleri
    - _Requirements: 10.1_

  - [x] 17.4 Controller endpoint ✅
    - `interest-engine.controller.ts` ✅
    - POST /interest-engine/calculate
    - _Requirements: 10.1, 10.4_

  - [x]* 17.5 Write API integration tests ✅
    - `__tests__/operational.spec.ts` ✅
    - HTTP endpoint tests
    - _Requirements: 10.1-10.5_

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties (14 adet)
- Unit tests validate specific examples and edge cases

---

## Sprint Plan

### Sprint-0: Kilitleri Çak (1-2 gün)
**Amaç:** Framework'ü kur, ekip "framework içinde" hareket etsin.

| Task | Açıklama | DoD |
|------|----------|-----|
| 1.1 | Ortak tipler (Money, DateRange, PercentRate) | Tek kaynak, circular deps yok |
| 1.2 | Domain entities (ClaimBucket, Segment, Payment) | Zod validation aktif |
| 17.1 | Error taxonomy + evidence schema | AppError sınıfı + Appendix B uyumlu |
| 17.2 | Version pinning enforcement | PRODUCTION/LEGAL_REPORT pinlenmeden üretilemez |
| 13.4 | TraceExport skeleton | Format sabit, boş bile olsa çalışır |
| 13.5 | LegalReportRenderer skeleton | Başlık + parametre bölümü render eder |
| 15.6 | Mini golden senaryo #1 | Rate değişim günü + START/END_OF_DAY ödeme |

**Sprint-0 Bonus: "Hello Calculation" Demo**

Sabit mock input ile 3 mod testi:
```
Input:
- 1 claim (100.000 TL, 01.01.2025 başlangıç)
- 1 rate değişimi (15.01.2025'te %50 → %55)
- 1 ödeme (20.01.2025, 10.000 TL)

Expected Output:
- PREVIEW → warning (gap yok ama demo), PreviewRecord oluşur
- PRODUCTION → CalculationRecord oluşur, version pinlenir
- LEGAL_REPORT → aynı input, inferred varsa ERROR
```

**Amaç:**
- CI'da 5 saniyede koşan smoke test
- Her sprint sonunda "motor hâlâ yaşıyor mu?" kontrolü
- Yeni gelene sistemi anlatırken açılan tek dosya

**Dosya:** `__tests__/hello-calculation.smoke.spec.ts`

**Çıktı:** Tek PR, framework kilitleri çakılmış + Hello Calculation demo çalışıyor.

---

### Sprint-1: RateProvider + CoverageMap + PolicyGate
**Amaç:** Rate coverage'ı çıkar, PolicyGate kararlarını evidence ile kilitle.

| Task | Açıklama |
|------|----------|
| 4.1-4.6 | Rate Provider (entity, service, coverage map, version hash) |
| 7.1-7.6 | Policy Gate (detectors, mode matrix, decision object) |

**Çıktı:** PolicyGate "hangi durumda ne der" netleşmiş.

---

### Sprint-2: SegmentBuilder Canonical Boundary
**Amaç:** [start,end) kuralı, payment boundary, rate change boundary taş gibi otursun.

| Task | Açıklama |
|------|----------|
| 5.1-5.8 | Segment Builder (timeline, day count, formula, phase separation) |
| 15.6-15.7 | Golden scenarios (boundary edge cases) |

**Çıktı:** Segment hesaplama hatasız.

---

### Sprint-3: Allocation Engine ✅ DONE
**Amaç:** TBK 100 hard rule + soft tie-breaker + idempotent steps + monotonicity.

| Task | Açıklama | Status |
|------|----------|--------|
| 8.1-8.8 | Allocation Engine (TBK 100, tie-breaker, multi-payment) | ✅ Done |
| 15.8-15.9 | Golden scenarios (allocation edge cases) | ⏳ Sprint-5 |

**Çıktı:** Motorun "hukuki çekirdeği" hazır. 42 test geçti.

---

### Sprint-4: Reporter + Audit + Integration ✅ DONE
**Amaç:** Rapor, audit, KVKK katmanları.

| Task | Açıklama | Status |
|------|----------|--------|
| 10.1-10.5 | Reporter (legal text, segment report, disclaimer) | ✅ Done |
| 11.1-11.4, 11.9 | Audit Writer (record, trace, preview) | ✅ Done |
| 11.5-11.8 | KVKK (retention, masking, RBAC, access log) | ✅ Done |
| 14.1-14.3 | Integration tests (3 mod) | ✅ Done |

**Çıktı:** Reporter ve Audit Writer hazır. 35 test geçti.

---

### Sprint-5: Final Polish + Operational ✅ DONE
**Amaç:** Golden scenarios tamamla, metrics, API endpoint.

| Task | Açıklama | Status |
|------|----------|--------|
| 13.1-13.5 | Main Engine (orchestration, trace export, legal report) | ✅ Done |
| 13.6-13.9 | Property tests (determinism, segment sum, rounding, version) | ✅ Done |
| 14.1-14.3 | Integration tests (PREVIEW, PRODUCTION, LEGAL_REPORT) | ✅ Done |
| 15.1-15.10 | Golden scenarios (10 adet - all implemented) | ✅ Done |
| 17.3-17.5 | Operational (metrics, controller, API tests) | ✅ Done |
| 16 | Final checkpoint | ✅ Done |

**Çıktı:** Main Engine + Integration Tests + Golden Scenarios + KVKK + Operational + Strategy Layer tamamlandı. 321 test geçti.

---

### Sprint-6: Entegrasyon ve Tekleştirme ✅ TAMAMLANDI
**Amaç:** Duplikasyonları temizle, tek gerçeklik kaynağı oluştur.

| Task | Açıklama | Status |
|------|----------|--------|
| E.1 | InterestTypeCode tekleştirme | ✅ Done |
| E.2 | Eski types.ts deprecate | ✅ Done |
| E.3 | Rate Provider Prisma entegrasyonu | ✅ Done |
| E.4 | Strategy entegrasyonu (InterestEngineService) | ✅ Done |
| E.5 | Prisma Audit tabloları | ✅ Done |
| E.6 | RateScheduleService deprecated adapter | ✅ Done |
| E.7 | Web enum mapping (UI ↔ API) | ✅ Done |
| E.8 | Module audit provider (prod default) | ✅ Done |

**Detaylı plan:** `.kiro/specs/interest-calculation-engine/integration-plan.md`

**Son Durum (14 Ocak 2026):**
- 321 test geçiyor
- 12 test suite
- Faiz motoru %100 entegre

---

## Appendix A: Checkpoint Definition of Done (DoD)

Her checkpoint için aşağıdaki kriterler sağlanmalıdır:

### Checkpoint 3 (Domain + Strategy)
- **Demo Flow:** Mock rate set ile ClaimBucket → Strategy selection çalışır
- **Minimum Test:** 5 unit test (domain validation) + 1 integration (strategy selection)
- **Reproducibility:** Aynı input → aynı strategy seçimi

### Checkpoint 6 (Rate Provider + Segment Builder)
- **Demo Flow:** Mock rate set ile PREVIEW mode pipeline çalışır (rate → segments)
- **Minimum Test:** 5 unit test (coverage map, day count) + 1 integration (segment generation)
- **Reproducibility:** Aynı input hash → aynı segment listesi

### Checkpoint 9 (Policy Gate + Allocation Engine)
- **Demo Flow:** PREVIEW/PRODUCTION mode pipeline çalışır (policy → allocation)
- **Minimum Test:** 5 unit test (anomaly detectors, TBK 100) + 1 integration (full allocation)
- **Reproducibility:** Aynı input + aynı rate version → aynı AllocationStep[]

### Checkpoint 12 (Reporter + Audit Writer)
- **Demo Flow:** Tüm modlar için rapor + audit kaydı oluşturulur
- **Minimum Test:** 5 unit test (legal text, masking) + 1 integration (record creation)
- **Reproducibility:** Aynı input → aynı legalText + aynı auditLogId

### Checkpoint 16 (Final)
- **Demo Flow:** Uçtan uca 3 mod (PREVIEW/PRODUCTION/LEGAL_REPORT) çalışır
- **Minimum Test:** 14 property test + 10 golden scenario + 3 integration
- **Reproducibility:** Aynı input + aynı versions → birebir aynı CalculationResult

---

## Appendix B: Error Taxonomy ve Evidence Zorunlulukları

Her error code için zorunlu evidence alanları:

| Error Code | Açıklama | Zorunlu Evidence |
|------------|----------|------------------|
| `E_RATE_GAP` | Oran tablosunda boşluk | `gaps[].from`, `gaps[].to`, `gaps[].days` |
| `E_RATE_OVERLAP` | Oran tablosunda çakışma | `overlaps[].date`, `overlaps[].entries[]` |
| `E_INFERRED_RATE` | Varsayılan oran kullanıldı | `inferredPeriod.from`, `inferredPeriod.to` |
| `E_NEGATIVE_DAYS` | Negatif gün sayısı | `startDate`, `endDate`, `calculatedDays` |
| `E_ZERO_DAYS` | Sıfır gün faiz | `startDate`, `endDate` |
| `E_IBRAZ_BEFORE_VADE` | İbraz < vade | `ibrazDate`, `vadeDate` |
| `E_EXCESSIVE_RATE` | Faiz oranı 3x yasal | `contractRate`, `legalRate`, `ratio` |
| `E_INTEREST_ANOMALY` | Faiz beklenen aralık dışı | `effectiveRate`, `expectedMin`, `expectedMax` |
| `E_LONG_SEGMENT` | 180+ gün tek oran | `segmentDays`, `rateCount` |
| `E_MISSING_REQUIRED` | Zorunlu alan eksik | `missingFields[]` |
| `E_INVALID_CURRENCY` | Geçersiz para birimi | `providedCurrency`, `allowedCurrencies[]` |
| `E_ALLOCATION_OVERFLOW` | Mahsup tutarı aşıldı | `paymentAmount`, `totalDebt`, `overflow` |

**Kural:** Hata döndüren her fonksiyon, ilgili evidence alanlarını doldurmalıdır. Evidence olmadan error code döndürmek yasaktır.

---

## Appendix C: Golden Scenarios (10 Adet)

| # | Senaryo | Kritik Test Noktası |
|---|---------|---------------------|
| 1 | Kambiyo çek + multiple rate changes | Segment split, rate boundary |
| 2 | İlamsız genel + partial payments | TBK 100 mahsup sırası |
| 3 | TTK 1530 + 30-day rule | DUE_DATE_OR_30D policy |
| 4 | Multi-claim + different start dates | claimPriorityRule: OLDEST_DUE_FIRST |
| 5 | Döviz alacağı (USD) + FX conversion | TCMB_SATIS kuru |
| 6 | **Aynı gün ödeme + rate değişim günü** | Payment boundary + rate boundary çakışması |
| 7 | **Gap + overlap birlikte (LEGAL_REPORT)** | Strict mode, multiple errors |
| 8 | **Çoklu claim + policy tie-breaker** | HIGHEST_RATE_FIRST vs OLDEST_DUE_FIRST |
| 9 | **Masraf eklenmesi (sonradan) + monotonicity** | Geçmiş hesaplama değişmemeli |
| 10 | **RoundingScope TOTAL_ONLY vs PER_SEGMENT** | Kuruş farkı kontrolü |

**Kural:** Her golden scenario için:
- Input JSON dosyası
- Expected output JSON dosyası
- Snapshot test

---

## Appendix D: Main Engine Kritik Deliverables

### D.1 CalculationTrace JSON Export
```typescript
interface TraceExport {
  version: string;
  exportedAt: string;
  inputHash: string;
  
  // Full trace
  request: CalculationRequest;
  result: CalculationResult;
  segments: Segment[];
  allocations: AllocationStep[];
  ratesUsed: RateEntry[];
  policyDecisions: PolicyDecision[];
  
  // Debug info
  timeline: string[];
  boundaryRules: BoundaryRuleLog[];
}

// Tek fonksiyon: exportTrace(recordId) → TraceExport JSON
```

### D.2 LegalReport Render Fonksiyonu
```typescript
interface LegalReportRender {
  // Tek fonksiyon: aynı input → aynı metin
  renderLegalReport(result: CalculationResult): string;
  
  // Sections
  renderHeader(): string;           // Dosya bilgileri
  renderInterestSummary(): string;  // Faiz özeti
  renderSegmentTable(): string;     // Segment tablosu
  renderAllocationTable(): string;  // Mahsup tablosu
  renderParameters(): string;       // Kullanılan parametreler
  renderDisclaimer(): string;       // PREVIEW için disclaimer
  renderFooter(): string;           // Tarih, sürüm, imza
}

// Kural: UI ve backend aynı render fonksiyonunu kullanır (shared library)
```

---

## Appendix E: Version Pinning Enforcement

### Kural
PRODUCTION ve LEGAL_REPORT modlarında hesaplama yapılırken:
1. `rateTableVersion` zorunlu olarak pinlenir
2. `engineVersion` zorunlu olarak pinlenir
3. `ruleVersion` zorunlu olarak pinlenir

### Enforcement
```typescript
// PREVIEW: version pinning opsiyonel
// PRODUCTION/LEGAL_REPORT: version pinning zorunlu

function enforceVersionPinning(mode: CalculationMode, versions: Versions): void {
  if (mode === CalculationMode.PREVIEW) return;
  
  if (!versions.rateTableVersion) {
    // Otomatik pinle ve rapora yaz
    versions.rateTableVersion = generateCurrentRateTableVersion();
    versions.autoPinned = true;
  }
  
  // Rapora yaz
  result.versionPinning = {
    rateTableVersion: versions.rateTableVersion,
    engineVersion: versions.engineVersion,
    ruleVersion: versions.ruleVersion,
    autoPinned: versions.autoPinned ?? false,
    pinnedAt: new Date().toISOString(),
  };
}
```

### Audit Requirement
Her PRODUCTION/LEGAL_REPORT hesaplamasında `versionPinning` objesi CalculationRecord'a yazılır. Bu, "dün başka çıktı bugün başka çıktı" kabusunu önler.
