# Implementation Plan: Phase 11.4 — Redrive Rate Limiting / Backoff Guardrail

## Overview

Phase 11.4, mevcut redrive flow'una per-correlation chain bazında cooldown + exponential backoff + jitter ile rate limiting ekler. Uygulama sırası: migration → types/DTO → repo → policy → limiter → controller → metrikler → testler → LOCK. Phase 11.3 pattern'iyle birebir uyumlu.

## Tasks

- [x] 1. Veritabanı migration ve type güncellemeleri
  - [x] 1.1 Migration dosyası oluştur: `last_redriven_at TIMESTAMPTZ NULL`, `redrive_count INTEGER NOT NULL DEFAULT 0`, `next_allowed_redrive_at TIMESTAMPTZ NULL`, `rate_limit_reason TEXT NULL` kolonlarını `manifest_dead_letter_queue` tablosuna ekle. Rollback script (down) dahil. Column comment'lar Phase 11.4 referansı ile.
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6_
  - [x] 1.2 `DlqEntry` interface'ine `lastRedrivenAt: Date | null`, `redriveCount: number`, `nextAllowedRedriveAt: Date | null`, `rateLimitReason: string | null` alanlarını ekle (`manifest-retry.types.ts`)
    - _Requirements: 4.1, 4.2, 4.3, 4.4_
  - [x] 1.3 `CreateDlqEntryInput` interface'ine `redriveCount?: number`, `lastRedrivenAt?: Date | null`, `nextAllowedRedriveAt?: Date | null`, `rateLimitReason?: string | null` optional alanlarını ekle
    - _Requirements: 4.5, 8.1_
  - [x] 1.4 `RawDlqEntry` interface'ine ve `mapRawToEntry` fonksiyonuna `last_redriven_at` / `redrive_count` / `next_allowed_redrive_at` / `rate_limit_reason` mapping'i ekle (`manifest-dlq.repository.ts`)
    - _Requirements: 4.1, 4.2, 4.3, 9.1_
  - [x] 1.5 `DlqEntryDto`'ya `redriveCount`, `lastRedrivenAt`, `nextAllowedRedriveAt`, `rateLimitReason` alanlarını ekle, `mapDlqEntryToDto` fonksiyonunu güncelle (`manifest-admin.dto.ts`, `manifest-admin.controller.ts`)
    - _Requirements: 9.1, 9.2_

- [x] 2. DLQ Repository genişletmeleri
  - [x] 2.1 `IManifestDlqRepository` interface'ine `recordRedriveSuccess(dlqId: string, input: { lastRedrivenAt: Date; nextAllowedRedriveAt: Date }): Promise<void>` metodu ekle
    - _Requirements: 5.1_
  - [x] 2.2 `PrismaManifestDlqRepository`'de `recordRedriveSuccess` implementasyonu: `UPDATE manifest_dead_letter_queue SET redrive_count = redrive_count + 1, last_redriven_at = $1, next_allowed_redrive_at = $2, rate_limit_reason = NULL WHERE id = $3` atomik güncelleme
    - _Requirements: 5.1, 5.2_
  - [x] 2.3 Tüm DLQ SELECT sorgularına yeni kolonları ekle (listing, getById, getByBundleId). Mevcut `is_poison` filtresi bozulmamalı.
    - _Requirements: 9.1_

- [x] 3. Checkpoint — Migration ve repository
  - Task 1-2 implementasyonu onaylandı. Doc düzeltmeleri uygulandı:
    - design.md: `$executeRawUnsafe` → `$executeRaw` (tagged template)
    - design.md: `recordRedriveSuccess` caller contract MUST notu eklendi
    - design.md + requirements.md + tasks.md: `resolveRateLimitKey` → `rootCorrelationId ?? correlationId ?? dlqEntry.id` (requirements kazandı)
    - requirements.md: Gereksinim 1'e fallback (1.3) ve cardinality clamp (1.4) kabul kriterleri eklendi

- [x] 4. Backoff Policy (pure function)
  - [x] 4.1 `redrive-backoff-policy.ts` dosyasını oluştur: `BackoffPolicyConfig` interface, `DEFAULT_BACKOFF_CONFIG` sabiti (base: 30s, capExponent: 7, maxBackoff: 1h, jitterPct: 0.20), `BackoffResult` interface, `computeNextAllowedAt(now, redriveCount, config, rng)` fonksiyonu. RNG injectable (test determinism). Formül: `k = min(redriveCount, capExponent)`, `backoff = min(maxBackoff, base × 2^k)`, `jitter = floor(rng() × jitterPct × backoff)`. Input guard: negative/NaN/Infinity redriveCount → clamp to 0. RNG clamped to [0, 1).
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_
  - [x] 4.2 Write property test for backoff boundedness
    - **Property 1: Backoff Boundedness (INV-11.4.5)** — 4 sub-properties, 200 runs each
    - **Validates: Requirements 3.1, 3.4, 3.5**
  - [x] 4.3 Write property test for policy determinism
    - **Property 6: Policy Determinism** — 200 runs
    - **Validates: Requirements 3.3**
  - [x] 4.4 Write property test for monotonic backoff
    - **Property 7: Monotonic Next Allowed (INV-11.4.2)** — 2 sub-properties (monotonic + >= now)
    - **Validates: Requirements 3.1, 5.1**
  - [x] 4.5 Input guard PBT: negative/NaN/Infinity redriveCount → clamped to 0 (100 runs + 2 unit)
  - [x] 4.6 Unit tests: 9 tests covering redriveCount=0, =1, =cap, >cap, rng=0, rng=0.5, max_backoff cap, backoff table, fractional count
  - **Result: 19 tests passed (10 PBT + 9 unit)**

- [x] 5. Rate Limiter (enforcer)
  - [x] 5.1 `redrive-rate-limiter.ts` dosyasını oluştur: `resolveRateLimitKey(dlqEntry)` fonksiyonu (öncelik: rootCorrelationId → correlationId → dlqEntry.id, max 256 char clamp), `RateLimitCheckResult` interface, `RedriveSuccessResult` interface, `checkRateLimit(dlqEntry, now, config)` fonksiyonu (read-only: NULL nextAllowed → allow, now >= nextAllowed → allow, now < nextAllowed → reject + waitSeconds=ceil((nextAllowed-now)/1000)), `onRedriveEnqueued(dlqId, now, currentRedriveCount, dlqRepo, config, rng)` fonksiyonu (mutating: policy compute → repo recordRedriveSuccess).
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 2.1, 2.2, 5.1, 5.2_
  - [x]* 5.2 Write property test for no early allow
    - **Property 2: No Early Allow (INV-11.4.1)**
    - **Validates: Requirements 2.1**
  - [x]* 5.3 Write property test for reject does not mutate
    - **Property 3: Reject Does Not Mutate Counters (INV-11.4.3)**
    - **Validates: Requirements 5.2**
  - [x]* 5.4 Write property test for success increments once
    - **Property 4: Success Increments Exactly Once (INV-11.4.4)**
    - **Validates: Requirements 5.1**
  - [x]* 5.5 Write property test for fail-closed
    - **Property 5: Fail-Closed (INV-11.4.6)**
    - **Validates: Requirements 7.1**

- [x] 6. Checkpoint — Policy ve limiter testleri
  - All 56 tests pass (19 backoff policy + 37 rate limiter)
  - PBT Properties validated: P1 (Boundedness), P2 (No Early Allow), P3 (Reject No Mutate), P4 (Success +1), P5 (Fail-Closed), P6 (Determinism), P7 (Monotonic)
  - Additional PBTs: Key fallback chain, Clamp/hash determinism, waitSeconds ceil
  - Unit tests: checkRateLimit decision matrix, resolveRateLimitKey priority, clampKey hash, onRedriveEnqueued repo calls

- [x] 7. Metrikler
  - [x] 7.1 `carrier-lifecycle-metrics.ts`'ye 4 yeni metrik tanımlandı (contract'a uygun):
    - `carrier_redrive_rate_limited_total{gate}` — Counter, labels: `precheck` | `tx` (cardinality: 2)
    - `carrier_redrive_rate_check_failed_total` — Counter, label yok (fail-closed, normalde 0)
    - `carrier_redrive_backoff_seconds` — Histogram, buckets: [30, 60, 120, 300, 600, 1800, 3600]
    - `carrier_redrive_backoff_applied_total{count_bucket}` — Counter, labels: `0|1|2|3-4|5-9|10+` (cardinality: 6)
    - `redriveCountBucket()` helper fonksiyonu eklendi
    - _Requirements: 11.1, 11.2, 11.3_
  - [x] 7.2 `resetAllMetrics()` fonksiyonuna 4 yeni metrik eklendi
    - _Requirements: 11.1, 11.2, 11.3_
  - [x] 7.3 Controller'a 4 emission noktası eklendi (pre-check reject, fail-closed, tx reject, success)
    - Emission noktaları `task-7-metrics-contract.md` ile birebir uyumlu
    - Mevcut `redriveRejectedMetric{reason}` emission'ları korundu (backward compat)
    - _Requirements: 11.1, 11.2, 11.3_
  - [x] 7.4 Test'lere metrik assertion'ları eklendi: mevcut 15 teste inline assertion + 4 dedicated metric test
    - 19 test passed (15 mevcut + 4 yeni metric test)
    - _Requirements: 11.1, 11.2, 11.3_

- [x] 8. Admin Controller entegrasyonu
  - [x] 8.1 `redriveDlqEntry` metoduna rate limit check entegrasyonu: `enforceRedriveDepthLimit` (11.3) sonrası, `cloneCarrierForRedrive` öncesi `checkRateLimit(dlqEntry, now)` çağrısı ekle. Fail-closed try/catch ile sar. Rate limited → 409 + `{ code: 'REDRIVE_RATE_LIMITED', nextAllowedAt, waitSeconds }`. Check failed → 409 + `{ code: 'REDRIVE_RATE_LIMIT_CHECK_FAILED' }` (non-retriable).
    - _Requirements: 6.1, 6.2, 6.4, 7.1, 7.2_
  - [x] 8.2 `atomicRedrive` çağrısına `rateLimitGate: { now, nextAllowedRedriveAt }` geçir. Tx içinde cooldown guard + rate limit state update (all-or-nothing). `onRedriveEnqueued` ayrı çağrı kaldırıldı.
    - _Requirements: 5.1, 5.3, 7.1, 7.4_
  - [x] 8.3 `DlqRedriveResponseDto`'ya `redriveCount?: number` ve `nextAllowedRedriveAt?: string` alanlarını ekle, başarılı redrive yanıtına dahil et
    - _Requirements: 6.3_
  - [x] 8.4 Rate limited ve fail-closed durumlarında audit log event'leri ekle: `outcome: 'REJECTED'`, `reason`, `waitSeconds`, `nextAllowedAt`, `redriveCount`, `key`. Success durumunda audit'e `redriveCount` ve `nextAllowedRedriveAt` ekle.
    - _Requirements: 10.1, 10.2_
  - [x] 8.5 Write unit tests for admin controller rate limit integration
    - 15 tests passed: allowed (3), backoff reject (4), fail-closed (1), tx gate (1), concurrency (1), all-or-nothing (1), POISON precondition (1), NULL redriveCount (1), backward compat (1), audit success (1)
    - _Requirements: 6.1, 6.2, 6.3, 7.1, 7.2, 7.4, 10.1, 10.2_

- [x] 8.1-patch. Task 8.1 — Fail-Closed Semantik Düzeltme + Transaction Gate Patch
  - **Tarih:** 2026-02-07 (3 tur review iterasyonu sonrası LOCKED)
  - **Kapsam:** 3 davranışsal sapma düzeltildi:
    1. ✅ RATE_LIMIT_CHECK_FAILED: 500 → 409 (non-retriable, `ConflictException`)
    2. ✅ TOCTOU: Rate limit gate `atomicRedrive` tx'ine taşındı (double-check pattern)
    3. ✅ All-or-nothing: `recordRedriveSuccess` ayrı çağrı → tx içinde merged UPDATE
  - **Değişen dosyalar:** repository, controller, rate-limiter, test spec
  - **Test sonucu:** 89 test / 0 fail (15 controller + 56 PBT/unit + 18 integration/depth)
  - ✅ Spec docs updated (requirements, design, architecture, tasks)
  - **Detay:** `task-8-1-patch.md`

- [x] 9. Final checkpoint — Tüm testler geçmeli
  - **9.1 Regression teyidi:** 101 test / 0 fail / 7 suite (local run, `npx jest --testPathPattern="(redrive-rate-limit|redrive-backoff-policy|redrive-rate-limiter|redrive-depth)"`)
  - **9.2 Spec ↔ kod ↔ test üçgen kontrolü:** Contract'ta listelenen 4 metrik + label setleri, controller'da tekil string literal olarak emit ediliyor ve test'lerde birebir assert ediliyor. Mevcut `redriveRejectedMetric{reason}` emission'ları korunmuş (backward compat). Üçgen tutarlı.
  - **9.3 Drift düzeltme:** `architecture.md` metrik topolojisi bölümü ve `design.md` metrik tanımları bölümü güncel contract'a (Task 7) uyumlu hale getirildi. Eski isimler (`redrive_rate_limited_total{reason}`, `redrive_next_allowed_seconds`, `redrive_backoff_applied_total{bucket}`) → yeni isimler (`carrier_redrive_rate_limited_total{gate}`, `carrier_redrive_backoff_seconds`, `carrier_redrive_backoff_applied_total{count_bucket}`) + emission↔HTTP outcome matrisi eklendi.
  - All new test suites pass: Policy PBT, Limiter PBT, Controller unit
  - All existing carrier-lifecycle test suites unaffected (depth-enforcer, depth-calculator, depth-repo, depth-controller)

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties (INV-11.4.1–11.4.6)
- Unit tests validate specific examples and edge cases
- Migration (1.1) MUTLAKA kod deploy'undan ÖNCE çalışmalı (Phase 11 rollout sırası ile uyumlu)
- `checkRateLimit` read-only: DLQ entry üzerindeki mevcut state'i okur, DB çağrısı yapmaz — PRE-CHECK ONLY, gerçek gate tx'te
- `onRedriveEnqueued` mutating: **deprecated for controller path** — rate limit state artık `atomicRedrive` tx'inde güncellenir
- `RATE_LIMIT_PERSIST_FAILED` senaryosu **kaldırılmıştır** — all-or-nothing tx ile state drift riski yoktur
- `RATE_LIMIT_CHECK_FAILED` → HTTP 409 (non-retriable), 500 DEĞİL — fail-closed = güvenlik freni, retry teşvik edilmemeli
- `waitSeconds` hesaplaması: `ceil((nextAllowedAt - now) / 1000)` — 409 body ve audit aynı değeri görür
- Write-once contract (NNI-3) korunur: rate limit kolonları carrier kolonlarına DOKUNMAZ
- Jitter RNG injectable: test determinism için `rng` parametresi dışarıdan enjekte edilir
