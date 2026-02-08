# Phase 11 — Carrier Resilience & Audit Completeness: Tasks

**Status:** Draft  
**Created:** 2026-02-06  
**Depends On:** Phase 10.5 (LOCKED)

---

## Wave A — COMMIT (P2)

These tasks address operational risk and MUST be completed.

---

### Task 11.0: DLQ Carrier Column Migration

**Priority:** P2 | **Size:** S | **Depends On:** Phase 10.5

**Status:** ✅ DONE (2026-02-06)

#### Scope

Add columns to `manifest_dead_letter_queue` table for carrier storage.

#### Files

| File | Action | Status |
|------|--------|--------|
| `apps/api/prisma/migrations/20260206100000_phase11_dlq_carrier_columns/migration.sql` | CREATE | ✅ |
| `apps/api/prisma/migrations/20260206100000_phase11_dlq_carrier_columns/down.sql` | CREATE | ✅ |
| `apps/api/src/modules/.../manifest-retry/manifest-dlq.repository.ts` | UPDATE | ✅ |
| `apps/api/src/modules/.../manifest-retry/manifest-retry.types.ts` | UPDATE | ✅ |
| `apps/api/src/modules/.../manifest-retry/__tests__/manifest-dlq.repository.spec.ts` | UPDATE | ✅ |

#### Schema Changes

```sql
ALTER TABLE manifest_dead_letter_queue
ADD COLUMN carrier_json TEXT NULL;

ALTER TABLE manifest_dead_letter_queue
ADD COLUMN carrier_version SMALLINT NULL;

ALTER TABLE manifest_dead_letter_queue
ADD COLUMN carrier_truncated BOOLEAN NOT NULL DEFAULT false;
```

#### DoD

- [x] Migration file created
- [x] Down migration (rollback) file created
- [x] Migration uses ADD COLUMN NULL (no table rewrite, minimal lock time)
- [x] Existing DLQ entries have NULL carrier_json (expected)
- [x] Repository types updated for new columns (DlqEntry, CreateDlqEntryInput)
- [x] DLQ entry döndüren tüm SELECT sorguları (getById/getByBundleId/query/queryWithCursor/resolve/atomicRedrive) yeni carrier kolonlarını kapsıyor
- [x] Aggregate/stat sorguları (getStats gibi) carrier kolonlarını seçmez; bu beklenen davranış
- [x] markRedriven() $executeRaw ile status/timestamp update yapar, RETURNING yoktur; DLQ entry okumaz/haritalamaz — "carrier korunması" tartışma konusu değildir
- [x] Repository upsert writes new columns (INSERT + ON CONFLICT UPDATE)
- [x] mapRawToEntry NULL-tolerant (?? null / ?? false) for pre-11.0 entries
- [x] Unit tests updated with carrier field assertions

#### Migration Safety Notes

- ADD COLUMN ... NULL: No table rewrite, minimal lock time (not "lock-free")
- Rollback risk: Down migration removes columns - code must tolerate missing columns first
- Rollout order: Deploy migration → Deploy NULL-tolerant code → Enable feature

#### Metrics

None (schema-only change).

#### Tech Debt (Phase 11.0 scope dışı — kayıt altına alındı)

1. **query() içinde $queryRawUnsafe + string interpolation:**
   Şu an pratikte injection değil (enum-bounded orderBy/status), ama pattern olarak kötü.
   Backlog item: Prisma tagged template + allowlist orderBy mapping (ör. `{created_at: 'created_at', last_failed_at: 'last_failed_at'}`) ile tam güvenli hale getir.

---

### Task 11.1: Worker Inbound Degraded Mode

**Priority:** P2 | **Size:** S | **Depends On:** Phase 10.5

**Status:** ✅ DONE (2026-02-06)

**Spec Docs:** [requirements](./phase-11-1-requirements.md) | [design](./phase-11-1-design.md)

#### Scope

Worker inbound boundary'de carrier validation + degraded mode.
Invalid/oversize/malformed carrier → warn + metric, ALS disabled, job continues.

**Temel Garanti:** Job ASLA carrier sorunları nedeniyle fail olmaz.

#### Files

| File | Action | Description |
|------|--------|-------------|
| `.../carrier-lifecycle/degraded-context.types.ts` | CREATE | DegradedContext, MinimalCarrierContext, CarrierDropReasonV2, InboundValidationResult |
| `.../carrier-lifecycle/worker-carrier-handler.ts` | UPDATE | validateInboundCarrier() eklenir, normalizeInboundCarrier() deprecated |
| `.../carrier-lifecycle/carrier-lifecycle-metrics.ts` | UPDATE | carrier_inbound_total counter eklenir |
| `.../audit/manifest-admin-audit.types.ts` | UPDATE | AuditEventInput'a degradedContext? eklenir |
| `.../manifest-retry-worker.service.ts` | UPDATE | processOnce() içinde validation entegrasyonu |
| `.../carrier-lifecycle/__tests__/worker-carrier-handler.spec.ts` | UPDATE | validateInboundCarrier test cases |
| `.../__tests__/worker-degraded-mode.integration.spec.ts` | CREATE | End-to-end degraded mode integration |

#### Degraded Mode Decision Matrix

| Input Class | Acceptance | Stored Context | DropReason | Metric |
|-------------|------------|----------------|------------|--------|
| VALID_V2 | ACCEPT | FULL | — | accepted |
| VALID_V1 | ACCEPT (upgrade) | FULL | — | accepted |
| VERSION_MISMATCH | DROP_AND_MINIMAL | MINIMAL | VERSION_MISMATCH | degraded |
| MALFORMED | DROP_AND_MINIMAL | MINIMAL | MALFORMED | degraded |
| TYPE_ERROR | DROP_AND_MINIMAL | MINIMAL | TYPE_ERROR | degraded |
| MISSING_REQUIRED | DROP_AND_MINIMAL | MINIMAL | MISSING_REQUIRED | degraded |
| OVERSIZE | DROP_AND_MINIMAL | MINIMAL | OVERSIZE | degraded |
| UPGRADE_FAILED | DROP_AND_MINIMAL | MINIMAL | UPGRADE_FAILED | degraded |

#### Implementation Steps

1. **degraded-context.types.ts** (CREATE)
   - `CarrierDropReasonV2` enum (extends existing + OVERSIZE)
   - `DegradedContext` interface (isDegraded, reason, carrierSnapshot?)
   - `MinimalCarrierContext` interface (carrierVersion?, actionId?, requestId?, dropReason, receivedAt)
   - `InboundValidationResult` discriminated union (mode: FULL | MINIMAL)
   - `sanitizeCarrierSnapshot()` function
   - `buildMinimalResult()` helper

2. **worker-carrier-handler.ts** (UPDATE)
   - Add `validateInboundCarrier(raw, rawSizeBytes?)` → `InboundValidationResult`
   - Validation order: byte-size → null → object → version → required fields → type check → upgrade
   - Mark `normalizeInboundCarrier()` as `@deprecated`
   - Never throws — always returns result

3. **carrier-lifecycle-metrics.ts** (UPDATE)
   - Add `carrierInboundMetric` counter: `carrier_inbound_total{outcome, reason}`
   - outcome: 'accepted' | 'degraded'
   - reason: CarrierDropReasonV2 values

4. **manifest-admin-audit.types.ts** (UPDATE)
   - Add `degradedContext?: DegradedContext` to `AuditEventInput`
   - Add `degradedContext?: DegradedContext` to `AuditEvent`

5. **manifest-retry-worker.service.ts** (UPDATE)
   - `processOnce()`: job claim sonrası `validateInboundCarrier()` çağır
   - FULL → ALS context restore (mevcut davranış)
   - MINIMAL → ALS disabled, metric emit, warn log
   - Job execution her iki durumda devam eder

6. **Tests** (UPDATE + CREATE)
   - Unit: tüm edge case'ler (null, undefined, string, number, {}, version:3, oversize, valid V1/V2, snapshot truncation, snapshot serialization failure)
   - Integration: invalid carrier → job success + degraded metric + audit event with degradedContext

#### DoD

- [x] `validateInboundCarrier()` implemented and exported
- [x] Discriminated union: mode='FULL' → reason absent; mode='MINIMAL' → reason required
- [x] Byte-level oversize check pre-parse (OVERSIZE → no JSON.parse, spy ile kanıt)
- [x] Invalid carrier does not fail job (zero job failures from carrier)
- [x] Metric `carrier_inbound_total{outcome, reason}` increments correctly
- [x] Audit event contains `degradedContext` when degraded
- [x] `carrierSnapshot` max 500 chars, sanitized; serialization failure → '[unserializable]'
- [x] `normalizeInboundCarrier()` marked @deprecated AND removed from all consumer call sites (grep verified)
- [x] MinimalCarrierContext contains only safe bounded fields
- [x] Truncated inbound carrier (valid V2, short failureHistory) → ACCEPT as FULL
- [x] Job completes successfully without ALS context
- [x] Unit tests: all edge cases from design doc (41 tests passing)
- [ ] Integration test: invalid carrier → job success + degraded metric (deferred to worker integration)

#### Mandatory Tests (sign-off'ta aranır)

1. OVERSIZE → JSON.parse çağrılmıyor (jest.spyOn kanıtı)
2. MALFORMED (null) → MINIMAL + reason=MALFORMED
3. VERSION_MISMATCH ({version:3}) → MINIMAL + reason=VERSION_MISMATCH
4. VALID_V2 → FULL + reason yok (undefined)
5. Truncated inbound (valid V2, kısa failureHistory) → FULL (accept)
6. raw=null → MINIMAL, optional fields undefined, sadece dropReason+receivedAt dolu

#### Metrics

| Metric | Type | Labels | Max Cardinality |
|--------|------|--------|-----------------|
| `carrier_inbound_total` | Counter | `outcome` (accepted\|degraded), `reason` (FIXED ENUM) | 14 |

#### Hard Limits

| Constant | Value | Source |
|----------|-------|--------|
| MAX_CARRIER_BYTES | 4096 | Existing `MAX_CARRIER_SIZE_BYTES` |
| MAX_CARRIER_SNAPSHOT_CHARS | 500 | New (11.1) |

---

### Task 11.2: DLQ Carrier Storage

**Priority:** P2 | **Size:** M | **Depends On:** 11.0

**Status:** ✅ DONE (2026-02-06)

**Spec Docs:** [design](./phase-11-2-design.md)

#### Scope

Store full V2 carrier JSON on DLQ insert. Admin redrive uses stored carrier.

#### Non-Negotiable Invariants

1. **Size limiter + truncation flag tek kanonik yer:** `prepareCarrierForDlqStorage()` — başka hiçbir yerde DLQ carrier truncation kararı verilmez
2. **carrier_truncated ⇒ carrier_json IS NOT NULL:** DB constraint + write path logic
3. **Carrier DLQ-insert-path only:** carrier alanlarına SADECE `upsert()` dokunur (INSERT + ON CONFLICT UPDATE). resolve/markRedriven/atomicRedrive carrier kolonlarını SET ETMEZ. Not: aynı bundle yeniden DLQ'ye düşerse carrier güncellenir — bu beklenen davranış (yeni lifecycle'ın carrier'ı).

#### Files

| File | Action | Description |
|------|--------|-------------|
| `.../carrier-lifecycle/dlq-carrier-storage.ts` | CREATE | prepareCarrierForDlqStorage(), resolveCarrierForRedrive(), createMinimalCarrierFromDlq() |
| `.../carrier-lifecycle/carrier-lifecycle-metrics.ts` | UPDATE | dlqStorageMetric, dlqStorageTruncatedMetric |
| `.../manifest-retry-worker.service.ts` | UPDATE | moveToDlq() carrier parameter + storage |
| `.../manifest-admin.controller.ts` | UPDATE | Redrive uses resolveCarrierForRedrive() |
| `.../carrier-lifecycle/index.ts` | UPDATE | New exports |
| `.../carrier-lifecycle/__tests__/dlq-carrier-storage.spec.ts` | CREATE | Unit tests |

#### Implementation Steps

1. **dlq-carrier-storage.ts** (CREATE)
   - `prepareCarrierForDlqStorage(carrier)` → DlqCarrierStorageFields
   - `resolveCarrierForRedrive(dlqEntry)` → IdempotencyContextCarrierV2
   - `createMinimalCarrierFromDlq(dlqEntry)` → IdempotencyContextCarrierV2
   - Both functions NEVER throw

2. **carrier-lifecycle-metrics.ts** (UPDATE)
   - `dlqStorageMetric` counter: `carrier_dlq_storage_total`
   - `dlqStorageTruncatedMetric` counter: `carrier_dlq_storage_truncated_total`

3. **manifest-retry-worker.service.ts** (UPDATE)
   - `moveToDlq()` accepts carrier parameter from validateCarrier result
   - Calls `prepareCarrierForDlqStorage(carrier)` for storage fields
   - Passes carrier fields to `dlqRepo.upsert()`

4. **manifest-admin.controller.ts** (UPDATE)
   - Redrive path uses `resolveCarrierForRedrive(dlqEntry)` instead of creating carrier from scratch
   - Fallback to minimal carrier for pre-11.2 entries

5. **Tests** (CREATE)
   - carrier=null → null fields, truncated=false
   - carrier valid within 4KB → stored as-is, truncated=false
   - carrier over 4KB truncatable → truncated, flag=true
   - carrier over 4KB not truncatable → null (REJECTED), truncated=false
   - resolveCarrierForRedrive with stored carrier → parsed V2
   - resolveCarrierForRedrive with corrupted carrier → minimal fallback
   - resolveCarrierForRedrive with null carrier → minimal fallback
   - prepareCarrierForDlqStorage is only truncation decision point (grep gate)
   - resolve/markRedriven/atomicRedrive don't SET carrier columns (grep gate)

#### DoD

- [ ] `prepareCarrierForDlqStorage()` implemented — single canonical truncation location
- [ ] `resolveCarrierForRedrive()` implemented — never throws, fallback to minimal
- [ ] `createMinimalCarrierFromDlq()` implemented
- [ ] DLQ insert stores carrier_json atomically (single SQL)
- [ ] carrier_truncated ⇒ carrier_json IS NOT NULL (invariant preserved)
- [ ] carrier_version set correctly (1 or 2)
- [ ] resolve/markRedriven/atomicRedrive don't touch carrier columns (grep verified)
- [ ] Admin redrive uses stored carrier when available
- [ ] Admin redrive falls back to minimal carrier when not available
- [ ] Metric `carrier_dlq_storage_total` increments
- [ ] Metric `carrier_dlq_storage_truncated_total` increments on truncation
- [ ] Unit tests: all edge cases
- [ ] Grep gates: single truncation location + first-write only

#### Metrics

| Metric | Type | Labels |
|--------|------|--------|
| `carrier_dlq_storage_total` | Counter | — |
| `carrier_dlq_storage_truncated_total` | Counter | — |

---

## Wave B — OPTIONAL (P3)

These tasks are for scale/future-proofing and MAY be deferred.

---

### Task 11.3: Redrive Chain Depth Limit

**Priority:** P3 | **Size:** S | **Depends On:** 11.2

#### Scope

Limit redrive chain depth to 3. Exceeding triggers POISON flag.

#### Files

| File | Action |
|------|--------|
| `apps/api/prisma/migrations/20260206_phase11_dlq_poison_flag/migration.sql` | CREATE |
| `apps/api/src/modules/.../manifest-retry/manifest-dlq.repository.ts` | UPDATE |
| `apps/api/src/modules/.../manifest-retry/manifest-admin.controller.ts` | UPDATE |
| `apps/api/src/modules/.../manifest-retry/idempotency/carrier-lifecycle/redrive-depth-limiter.ts` | CREATE |
| `apps/api/src/modules/.../manifest-retry/__tests__/redrive-depth-limiter.spec.ts` | CREATE |

#### Schema Changes

```sql
ALTER TABLE manifest_dead_letter_queue
ADD COLUMN is_poison BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE manifest_dead_letter_queue
ADD COLUMN poison_reason TEXT NULL;
```

#### Constants

```typescript
export const MAX_REDRIVE_DEPTH = 3;
```

#### Behavior

| Depth | Action |
|-------|--------|
| 0-2 | Allow redrive |
| 3 | Reject + POISON flag |
| 4+ | Already POISON, reject |

#### DoD

- [ ] Migration adds is_poison and poison_reason columns
- [ ] Depth calculation traverses parentCorrelationId chain
- [ ] 4th redrive attempt is rejected
- [ ] DLQ entry is flagged as POISON
- [ ] Metric `carrier_redrive_rejected_total{reason="DEPTH_EXCEEDED"}` increments
- [ ] POISON entries cannot be redriven (require manual intervention)

#### Metrics

| Metric | Type | Labels |
|--------|------|--------|
| `carrier_redrive_rejected_total` | Counter | `reason` (add DEPTH_EXCEEDED to enum) |
| `carrier_redrive_depth_total` | Histogram | - |

---

### Task 11.4: Carrier Compression

**Priority:** P3 | **Size:** M | **Depends On:** -

#### Scope

Two-mode compression: STORAGE (DLQ/DB) and WIRE (queue payload).

#### Files

| File | Action |
|------|--------|
| `apps/api/src/modules/.../manifest-retry/idempotency/carrier-lifecycle/carrier-compression.ts` | CREATE |
| `apps/api/src/modules/.../manifest-retry/idempotency/carrier-lifecycle/__tests__/carrier-compression.spec.ts` | CREATE |
| `apps/api/src/modules/.../manifest-retry/manifest-dlq.repository.ts` | UPDATE (optional) |
| `apps/api/src/modules/.../manifest-retry/idempotency/enqueue-with-context.ts` | UPDATE (optional) |

#### Compression Format

```typescript
interface CompressedCarrier {
  encoding: 'gzip+base64';
  payload: string;
}
```

#### Compression Threshold

Only compress if `JSON.stringify(carrier).length > 1024` (1KB).

#### DoD

- [ ] `compressCarrier()` produces valid gzip+base64
- [ ] `decompressCarrier()` restores original carrier
- [ ] Compression is transparent to consumers
- [ ] Metric `carrier_compressed_total{mode}` increments
- [ ] Metric `carrier_decompressed_total{mode}` increments
- [ ] Unit tests cover round-trip compression

#### Metrics

| Metric | Type | Labels |
|--------|------|--------|
| `carrier_compressed_total` | Counter | `mode` (storage/wire) |
| `carrier_decompressed_total` | Counter | `mode` (storage/wire) |

---

## Summary

| Task | Priority | Size | Depends On | Status |
|------|----------|------|------------|--------|
| 11.0 Migration | P2 | S | Phase 10.5 | ✅ DONE |
| 11.1 Degraded Mode | P2 | S | Phase 10.5 | ✅ DONE (LOCKED design) |
| 11.2 DLQ Storage | P2 | M | 11.0 | ✅ DONE |
| 11.3 Depth Limit | P3 | S | 11.2 | ⬜ OPTIONAL |
| 11.4 Compression | P3 | M | - | ⬜ OPTIONAL |

---

## Rollout Order

```
1. 11.0 Migration (schema ready)
2. 11.1 Degraded Mode (worker resilience)
3. 11.2 DLQ Storage (carrier persistence)
4. [Optional] 11.3 Depth Limit (redrive safety)
5. [Optional] 11.4 Compression (payload optimization)
```

---

## References

- [requirements.md](./requirements.md)
- [design.md](./design.md)
- [ADR-008 v1.3](../../../docs/adr/ADR-008-QUEUE-JOB-CONTEXT-PROPAGATION.md)
- [Phase 10.5 LOCK](../phase-10-5-cross-queue-consistency/PHASE-10-5-LOCK.md)
