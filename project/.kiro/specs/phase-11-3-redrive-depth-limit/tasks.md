# Implementation Plan: Phase 11.3 — Redrive Chain Depth Limit

## Overview

Phase 11.3, mevcut redrive flow'una deterministik derinlik sınırı ekler. Uygulama sırası: migration → types → repository → calculator → enforcer → controller entegrasyonu → metrikler → testler.

## Tasks

- [x] 1. Veritabanı migration ve type güncellemeleri
  - [x] 1.1 Migration dosyası oluştur: `is_poison BOOLEAN NOT NULL DEFAULT false` ve `poison_reason TEXT NULL` kolonlarını `manifest_dead_letter_queue` tablosuna ekle. Rollback script'i (down.sql) dahil.
    - _Requirements: 4.1, 4.2, 4.3, 4.4_
  - [x] 1.2 `DlqEntry` interface'ine `isPoison: boolean` ve `poisonReason: string | null` alanlarını ekle (`manifest-retry.types.ts`)
    - _Requirements: 4.1, 4.2_
  - [x] 1.3 `CreateDlqEntryInput` interface'ine `isPoison?: boolean` ve `poisonReason?: string | null` optional alanlarını ekle
    - _Requirements: 4.1, 4.2_
  - [x] 1.4 `RawDlqEntry` interface'ine ve `mapRawToEntry` fonksiyonuna `is_poison` / `poison_reason` mapping'i ekle (`manifest-dlq.repository.ts`)
    - _Requirements: 4.1, 4.2, 8.1_
  - [x] 1.5 `DlqEntryDto`'ya `isPoison` ve `poisonReason` alanlarını ekle, `mapDlqEntryToDto` fonksiyonunu güncelle (`manifest-admin.dto.ts`, `manifest-admin.controller.ts`)
    - _Requirements: 8.1_

- [x] 2. DLQ Repository genişletmeleri
  - [x] 2.1 `IManifestDlqRepository` interface'ine `markAsPoison(dlqId: string, input: { reason: string }): Promise<void>` metodu ekle
    - _Requirements: 3.1, 3.2, 3.4_
  - [x] 2.2 `PrismaManifestDlqRepository`'de `markAsPoison` implementasyonu: `UPDATE manifest_dead_letter_queue SET is_poison = true, poison_reason = $reason WHERE id = $dlqId` atomik güncelleme
    - _Requirements: 3.1, 3.2, 3.4_
  - [x] 2.3 `IManifestDlqRepository` interface'ine `findByCorrelationId(correlationId: string): Promise<DlqEntry | null>` metodu ekle
    - _Requirements: 1.1_
  - [x] 2.4 `PrismaManifestDlqRepository`'de `findByCorrelationId` implementasyonu: `carrier_json::jsonb->>'requestId' = $correlationId` PostgreSQL JSON sorgusu
    - _Requirements: 1.1_
  - [x] 2.5 DLQ query'lerine `is_poison` filtre desteği ekle (mevcut `DlqQueryOptions`'a `isPoison?: boolean` ekle)
    - _Requirements: 8.2_
  - [x] 2.6 Write property test for markAsPoison
    - **Property 3: markAsPoison atomik doğruluğu**
    - **Validates: Requirements 3.1, 3.2**
  - [x] 2.7 Write property test for DLQ poison filter
    - **Property 6: DLQ listeleme POISON filtresi**
    - **Validates: Requirements 8.2**

- [x] 3. Checkpoint — Migration ve repository testleri
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Redrive Depth Calculator
  - [x] 4.1 `redrive-depth-calculator.ts` dosyasını oluştur: `calculateRedriveDepth(carrier, dlqRepo, maxTraversal)` fonksiyonu — `parentCorrelationId` zincirini takip eder, `DepthCalculationResult` döndürür. Döngü tespiti (`visited` Set), zincir kırılma (NULL/parse fail), maxTraversal sınırı dahil.
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 7.2_
  - [x] 4.2 Write property test for depth calculation
    - **Property 1: Derinlik hesaplama doğruluğu**
    - **Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5, 7.2**

- [x] 5. Redrive Depth Enforcer
  - [x] 5.1 `redrive-depth-enforcer.ts` dosyasını oluştur: `enforceRedriveDepthLimit(dlqEntry, carrier, dlqRepo, maxDepth)` fonksiyonu — is_poison kontrolü → depth hesaplama → limit karşılaştırma → POISON işaretleme. `MAX_REDRIVE_DEPTH = 3` configurable sabit. `RedriveDepthExceededError` hata sınıfı. `DepthEnforcementResult` return type.
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 3.3, 7.1_
  - [x] 5.2 Write property test for enforcement decision
    - **Property 2: Derinlik limiti uygulama kararı**
    - **Validates: Requirements 2.1, 2.2, 2.3**
  - [x] 5.3 Write property test for POISON idempotency
    - **Property 4: POISON idempotansı**
    - **Validates: Requirements 3.3**
  - [x] 5.4 Write property test for fail-closed error handling
    - **Property 5: Fail-closed hata yönetimi**
    - **Validates: Requirements 7.1**

- [x] 6. Checkpoint — Calculator ve enforcer testleri
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Metrikler
  - [x] 7.1 `carrier-lifecycle-metrics.ts`'ye `carrier_redrive_depth_total` Histogram metriği ekle (buckets: [0, 1, 2, 3, 4, 5])
    - _Requirements: 6.1_
  - [x] 7.2 `redriveRejectedMetric`'e yeni reason label değerleri ekle: `DEPTH_EXCEEDED`, `POISON_FLAGGED`, `POISON_ENTRY`, `DEPTH_CHECK_FAILED`
    - _Requirements: 6.2, 6.3_
  - [x] 7.3 `calculateRedriveDepth` ve `enforceRedriveDepthLimit` fonksiyonlarına metrik emission ekle
    - _Requirements: 6.1, 6.2, 6.3_

- [x] 8. Admin Controller entegrasyonu
  - [x] 8.1 `redriveDlqEntry` metoduna depth check entegrasyonu: `resolveCarrierForRedrive` sonrası, `cloneCarrierForRedrive` öncesi `enforceRedriveDepthLimit` çağrısı ekle. Fail-closed try/catch ile sar.
    - _Requirements: 5.1, 5.2, 5.3, 5.5, 7.1_
  - [x] 8.2 `DlqRedriveResponseDto`'ya `currentDepth?: number` alanı ekle, başarılı redrive yanıtına depth bilgisi dahil et
    - _Requirements: 5.4_
  - [x] 8.3 Depth exceeded durumunda HTTP 409 + `{ code: 'REDRIVE_DEPTH_EXCEEDED', currentDepth, maxDepth, dlqId }` yanıtı, POISON entry durumunda HTTP 409 + `{ code: 'POISON_ENTRY', dlqId }` yanıtı döndür
    - _Requirements: 5.1, 5.2, 5.3_
  - [x] 8.4 Audit log'a depth exceeded ve POISON entry reddetme olaylarını kaydet
    - _Requirements: 5.5_
  - [x] 8.5 Write unit tests for admin controller depth check integration
    - Test HTTP 409 responses, audit logging, currentDepth in success response
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

- [x] 9. Final checkpoint — Tüm testler geçmeli
  - All 4 new test suites pass (26 tests): Calculator PBT (6), Enforcer PBT (5), Repo Poison PBT (7), Controller Unit (8)
  - All 13 carrier-lifecycle test suites pass (272 tests)
  - Integration tests updated and passing (10 tests)

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties
- Unit tests validate specific examples and edge cases
- Migration (1.1) MUTLAKA kod deploy'undan ÖNCE çalışmalı (Phase 11 rollout sırası ile uyumlu)
- `findByCorrelationId` PostgreSQL JSON operatörü kullanır — carrier_json NULL olan entry'ler otomatik atlanır
- Write-once contract (NNI-3) korunur: `markAsPoison` yalnızca `is_poison` ve `poison_reason` kolonlarına dokunur, carrier kolonlarına DOKUNMAZ
