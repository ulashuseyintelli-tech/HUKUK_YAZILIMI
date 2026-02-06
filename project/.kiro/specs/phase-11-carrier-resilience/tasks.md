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

#### Scope

Add columns to `manifest_dead_letter_queue` table for carrier storage.

#### Files

| File | Action |
|------|--------|
| `apps/api/prisma/migrations/20260206_phase11_dlq_carrier_columns/migration.sql` | CREATE |
| `apps/api/src/modules/.../manifest-retry/manifest-dlq.repository.ts` | UPDATE |
| `apps/api/src/modules/.../manifest-retry/__tests__/manifest-dlq.repository.spec.ts` | UPDATE |

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

- [ ] Migration file created
- [ ] Migration applies without error (forward)
- [ ] Migration rolls back without error (backward)
- [ ] Existing DLQ entries have NULL carrier_json
- [ ] Repository types updated for new columns
- [ ] Unit tests pass

#### Metrics

None (schema-only change).

---

### Task 11.1: Worker Inbound Degraded Mode

**Priority:** P2 | **Size:** S | **Depends On:** Phase 10.5

#### Scope

Invalid carrier → warn + metric, ALS disabled, job continues.

**Guarantee:** Job NEVER fails due to carrier issues.

#### Files

| File | Action |
|------|--------|
| `apps/api/src/modules/.../manifest-retry/idempotency/carrier-lifecycle/degraded-context.types.ts` | CREATE |
| `apps/api/src/modules/.../manifest-retry/idempotency/carrier-lifecycle/worker-carrier-handler.ts` | UPDATE |
| `apps/api/src/modules/.../manifest-retry/idempotency/carrier-lifecycle/carrier-lifecycle-metrics.ts` | UPDATE |
| `apps/api/src/modules/.../manifest-retry/audit/manifest-admin-audit.types.ts` | UPDATE |
| `apps/api/src/modules/.../manifest-retry/idempotency/carrier-lifecycle/__tests__/worker-carrier-handler.spec.ts` | UPDATE |
| `apps/api/src/modules/.../manifest-retry/__tests__/worker-degraded-mode.integration.spec.ts` | CREATE |

#### Type Definitions

```typescript
// degraded-context.types.ts
export interface DegradedContext {
  readonly isDegraded: true;
  readonly reason: CarrierDropReason;
  readonly carrierSnapshot?: string; // max 500 chars
}

export type CarrierDropReason =
  | 'VERSION_MISMATCH'
  | 'MISSING_REQUIRED'
  | 'MALFORMED'
  | 'TYPE_ERROR'
  | 'UPGRADE_FAILED';
```

#### Behavior

| Condition | Action | Metric Label |
|-----------|--------|--------------|
| `carrier === null` | warn + run without ALS | `reason=MALFORMED` |
| `carrier.version` invalid | warn + drop context | `reason=VERSION_MISMATCH` |
| Required field missing | warn + drop context | `reason=MISSING_REQUIRED` |
| Type mismatch | warn + drop context | `reason=TYPE_ERROR` |
| V1→V2 upgrade fails | warn + drop context | `reason=UPGRADE_FAILED` |
| Valid carrier | restore ALS | - |

#### DoD

- [ ] Invalid carrier does not fail job
- [ ] Metric `carrier_degraded_total{reason}` increments correctly
- [ ] Audit event contains `degradedContext` when degraded
- [ ] `carrierSnapshot` is max 500 chars, sanitized
- [ ] Job completes successfully without ALS context
- [ ] Integration test: invalid carrier → job success + degraded metric

#### Metrics

| Metric | Type | Labels |
|--------|------|--------|
| `carrier_degraded_total` | Counter | `reason` (FIXED ENUM) |

---

### Task 11.2: DLQ Carrier Storage

**Priority:** P2 | **Size:** M | **Depends On:** 11.0

#### Scope

Store full V2 carrier JSON on DLQ insert. Admin redrive uses stored carrier.

#### Files

| File | Action |
|------|--------|
| `apps/api/src/modules/.../manifest-retry/manifest-dlq.repository.ts` | UPDATE |
| `apps/api/src/modules/.../manifest-retry/manifest-retry-worker.service.ts` | UPDATE |
| `apps/api/src/modules/.../manifest-retry/manifest-admin.controller.ts` | UPDATE |
| `apps/api/src/modules/.../manifest-retry/idempotency/carrier-lifecycle/carrier-lifecycle-metrics.ts` | UPDATE |
| `apps/api/src/modules/.../manifest-retry/__tests__/manifest-dlq.repository.spec.ts` | UPDATE |
| `apps/api/src/modules/.../manifest-retry/__tests__/dlq-carrier-storage.integration.spec.ts` | CREATE |

#### DLQ Insert Flow

```typescript
// In worker when moving to DLQ
async moveToDlq(job: ManifestRetryJob, carrier: IdempotencyContextCarrierV2): Promise<void> {
  // Apply size limit (allow truncation for storage)
  const sizeResult = enforceCarrierSizeLimit(carrier, { allowTruncation: true });
  
  // Serialize
  const carrierJson = JSON.stringify(sizeResult.carrier);
  const carrierVersion = sizeResult.carrier.version;
  const carrierTruncated = sizeResult.action === 'TRUNCATED';
  
  // Atomic insert
  await this.dlqRepo.insert({
    ...dlqEntry,
    carrierJson,
    carrierVersion,
    carrierTruncated,
  });
  
  // Metrics
  dlqStorageMetric.inc();
  if (carrierTruncated) {
    dlqStorageTruncatedMetric.inc();
  }
}
```

#### Admin Redrive Flow

```typescript
// In admin controller
async redrive(dlqId: string, operatorId: string): Promise<RedriveResult> {
  const dlqEntry = await this.dlqRepo.findById(dlqId);
  
  // Try stored carrier first
  let sourceCarrier: IdempotencyContextCarrierV2;
  
  if (dlqEntry.carrierJson) {
    try {
      sourceCarrier = ensureCarrierV2(JSON.parse(dlqEntry.carrierJson));
    } catch {
      this.logger.warn('Stored carrier invalid, using fallback', { dlqId });
      sourceCarrier = createMinimalCarrierFromDlq(dlqEntry);
    }
  } else {
    // Fallback for pre-11.2 entries
    sourceCarrier = createMinimalCarrierFromDlq(dlqEntry);
  }
  
  // Clone for redrive (existing logic)
  return this.cloneAndRedrive(sourceCarrier, dlqEntry, operatorId);
}
```

#### DoD

- [ ] DLQ insert stores carrier_json atomically
- [ ] carrier_version is set correctly (1 or 2)
- [ ] carrier_truncated is true when truncation occurred
- [ ] Admin redrive uses stored carrier when available
- [ ] Admin redrive falls back to minimal carrier when not available
- [ ] Metric `carrier_dlq_storage_total` increments
- [ ] Metric `carrier_dlq_storage_truncated_total` increments on truncation
- [ ] Integration test: DLQ insert → redrive uses stored carrier

#### Metrics

| Metric | Type | Labels |
|--------|------|--------|
| `carrier_dlq_storage_total` | Counter | - |
| `carrier_dlq_storage_truncated_total` | Counter | - |

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
| 11.1 Degraded Mode | P2 | S | Phase 10.5 | ⬜ TODO |
| 11.2 DLQ Storage | P2 | M | 11.0 | ⬜ TODO |
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
