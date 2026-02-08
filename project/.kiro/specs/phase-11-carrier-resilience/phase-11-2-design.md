# Phase 11.2 — DLQ Carrier Storage: Design

**Status:** LOCKED  
**Created:** 2026-02-06  
**Depends On:** 11.0 (Migration DONE), 11.1 (Degraded Mode DONE)

---

## Overview

DLQ'ye yazılan her entry'ye carrier JSON snapshot'ı eklenir.
Admin redrive stored carrier'ı kullanır, yoksa minimal fallback üretir.

---

## Non-Negotiable Invariants

### NNI-1: Size limiter + truncation flag tek kanonik yer

```
enforceCarrierSizeLimit(carrier, { allowTruncation: true })
```

Bu çağrı `prepareCarrierForDlqStorage()` içinde yapılır.
Başka hiçbir yerde DLQ carrier truncation kararı verilmez.

### NNI-2: carrier_truncated ⇒ carrier_json IS NOT NULL

DB constraint (Phase 11.0'da eklendi):
```sql
CHECK (carrier_truncated = false OR carrier_json IS NOT NULL)
```

Write path bu invariant'ı ihlal edemez:
- `carrierTruncated = true` → `carrierJson` MUTLAKA dolu
- `carrierJson = null` → `carrierTruncated = false` (default)

### NNI-3: Redrive/resolve/update path'leri carrier alanlarına DOKUNMAZ

Carrier alanlarına SADECE `upsert()` dokunur (INSERT + ON CONFLICT UPDATE):
- `upsert()` INSERT'te carrier yazılır
- `upsert()` ON CONFLICT UPDATE'te carrier güncellenir (aynı bundle yeniden DLQ'ye düşerse — yeni lifecycle'ın carrier'ı yazılır, bu beklenen davranış)
- `resolve()` carrier'a DOKUNMAZ (sadece status/resolved_at/resolved_by)
- `markRedriven()` carrier'a DOKUNMAZ (sadece status/redriven_at/redriven_by)
- `atomicRedrive()` carrier'a DOKUNMAZ (sadece status/redriven_at/redriven_by + job insert)

**Terminoloji:** Bu "first-write only" değil, "DLQ-insert-path only" demek. Aynı bundle birden fazla kez DLQ'ye düşebilir ve her seferinde carrier güncellenir.

---

## Architecture — DLQ Storage Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     DLQ CARRIER STORAGE FLOW (11.2)                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Job Failure (exhausted / poison)                                           │
│       │                                                                     │
│       ▼                                                                     │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │  1. prepareCarrierForDlqStorage(carrier)                                ││
│  │     - enforceCarrierSizeLimit(carrier, { allowTruncation: true })       ││
│  │     - Serialize: JSON.stringify(sizeResult.carrier)                      ││
│  │     - Set: carrierVersion = carrier.version                             ││
│  │     - Set: carrierTruncated = (action === 'TRUNCATED')                  ││
│  │     - REJECTED → carrierJson = null, carrierTruncated = false           ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│       │                                                                     │
│       ▼                                                                     │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │  2. dlqRepo.upsert({ ...dlqEntry, carrierJson, carrierVersion,         ││
│  │                       carrierTruncated })                                ││
│  │     - Atomic with DLQ record (single SQL statement)                     ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│       │                                                                     │
│       ▼                                                                     │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │  3. Emit metrics                                                        ││
│  │     - carrier_dlq_storage_total.inc()                                   ││
│  │     - if truncated: carrier_dlq_storage_truncated_total.inc()           ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Architecture — Admin Redrive with Stored Carrier

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     ADMIN REDRIVE FLOW (11.2)                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Admin triggers redrive(dlqId, operatorId)                                  │
│       │                                                                     │
│       ▼                                                                     │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │  1. Load DLQ entry                                                      ││
│  │     dlqEntry = dlqRepo.getById(dlqId)                                   ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│       │                                                                     │
│       ▼                                                                     │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │  2. Resolve source carrier                                              ││
│  │     if (dlqEntry.carrierJson) {                                         ││
│  │       try: parse + ensureCarrierV2 → stored carrier                     ││
│  │       catch: warn log → fallback to minimal                             ││
│  │     } else {                                                            ││
│  │       fallback: createMinimalCarrierFromDlq(dlqEntry)                   ││
│  │     }                                                                   ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│       │                                                                     │
│       ▼                                                                     │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │  3. Clone for redrive (existing cloneCarrierForRedrive)                 ││
│  │     - New correlationId                                                 ││
│  │     - parentCorrelationId → original                                    ││
│  │     - attemptNumber reset to 0                                          ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Key Function: prepareCarrierForDlqStorage()

```typescript
/**
 * Prepare carrier for DLQ storage.
 * 
 * SINGLE CANONICAL LOCATION for DLQ carrier truncation decisions.
 * 
 * BEHAVIOR:
 * - carrier null → return null fields (no carrier to store)
 * - carrier valid → enforce size limit with allowTruncation: true
 * - OK → store as-is
 * - TRUNCATED → store truncated, set flag
 * - REJECTED → store null (carrier too large even after truncation)
 * 
 * GUARANTEE: Never throws.
 * 
 * @param carrier - V2 carrier from worker context (may be null in degraded mode)
 * @returns DLQ carrier storage fields
 */
export function prepareCarrierForDlqStorage(
  carrier: IdempotencyContextCarrierV2 | null,
): DlqCarrierStorageFields {
  if (carrier == null) {
    return { carrierJson: null, carrierVersion: null, carrierTruncated: false };
  }

  try {
    const sizeResult = enforceCarrierSizeLimit(carrier, { allowTruncation: true });
    
    return {
      carrierJson: JSON.stringify(sizeResult.carrier),
      carrierVersion: sizeResult.carrier.version,
      carrierTruncated: sizeResult.action === 'TRUNCATED',
    };
  } catch {
    // REJECTED: carrier too large even after truncation
    // Store null — invariant: truncated=false when json=null
    return { carrierJson: null, carrierVersion: null, carrierTruncated: false };
  }
}

interface DlqCarrierStorageFields {
  carrierJson: string | null;
  carrierVersion: number | null;
  carrierTruncated: boolean;
}
```

---

## Key Function: resolveCarrierForRedrive()

```typescript
/**
 * Resolve carrier for admin redrive from DLQ entry.
 * 
 * Priority: stored carrier > minimal fallback.
 * 
 * GUARANTEE: Never throws. Always returns a valid V2 carrier.
 */
export function resolveCarrierForRedrive(
  dlqEntry: DlqEntry,
): IdempotencyContextCarrierV2 {
  if (dlqEntry.carrierJson) {
    try {
      return ensureCarrierV2(JSON.parse(dlqEntry.carrierJson));
    } catch {
      // Stored carrier corrupted — fallback
    }
  }
  
  // Fallback: create minimal carrier from DLQ metadata
  return createMinimalCarrierFromDlq(dlqEntry);
}
```

---

## Worker Integration: moveToDlq() Update

```typescript
// manifest-retry-worker.service.ts — moveToDlq() updated
private async moveToDlq(
  job: RetryQueueJob, 
  result: ManifestWriteResult,
  carrier: IdempotencyContextCarrierV2 | null, // Phase 11.2: carrier from validation
): Promise<void> {
  // Phase 11.2: Prepare carrier for storage
  const carrierFields = prepareCarrierForDlqStorage(carrier);
  
  // Insert/update DLQ entry with carrier
  await this.dlqRepo.upsert({
    bundleId: job.bundleId,
    attempt: job.attempt + 1,
    errorCode: result.errorCode ?? ManifestErrorCode.UNKNOWN,
    errorMessage: result.errorMessage,
    firstFailedAt: job.createdAt,
    lastFailedAt: new Date(),
    ...carrierFields,
  });
  
  // Metrics
  dlqStorageMetric.inc();
  if (carrierFields.carrierTruncated) {
    dlqStorageTruncatedMetric.inc();
  }
  
  await this.retryQueue.markDone({ jobId: job.id, reason: 'DLQ' });
}
```

---

## Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `carrier_dlq_storage_total` | Counter | — | Carriers prepared for DLQ storage |
| `carrier_dlq_storage_truncated_total` | Counter | — | Carriers truncated during DLQ storage |

---

## Files

| File | Action | Description |
|------|--------|-------------|
| `.../carrier-lifecycle/dlq-carrier-storage.ts` | CREATE | `prepareCarrierForDlqStorage()`, `resolveCarrierForRedrive()`, `createMinimalCarrierFromDlq()` |
| `.../carrier-lifecycle/carrier-lifecycle-metrics.ts` | UPDATE | `dlqStorageMetric`, `dlqStorageTruncatedMetric` |
| `.../manifest-retry-worker.service.ts` | UPDATE | `moveToDlq()` carrier parameter + storage |
| `.../manifest-admin.controller.ts` | UPDATE | Redrive uses `resolveCarrierForRedrive()` |
| `.../carrier-lifecycle/index.ts` | UPDATE | New exports |
| `.../carrier-lifecycle/__tests__/dlq-carrier-storage.spec.ts` | CREATE | Unit tests |

---

## Edge Cases

| Case | Behavior |
|------|----------|
| carrier = null (degraded mode) | Store null fields, truncated=false |
| carrier valid, within 4KB | Store as-is, truncated=false |
| carrier valid, over 4KB, truncatable | Truncate failureHistory, truncated=true |
| carrier valid, over 4KB, not truncatable | Store null (REJECTED), truncated=false |
| Stored carrier corrupted on redrive | Warn log, fallback to minimal |
| Pre-11.2 DLQ entry (no carrier) | Redrive uses minimal fallback |
| Re-DLQ (same bundle fails again) | ON CONFLICT UPDATE overwrites carrier |

---

## Invariant Verification

| Invariant | Enforced By | Test |
|-----------|-------------|------|
| carrier_truncated ⇒ carrier_json NOT NULL | DB constraint + prepareCarrierForDlqStorage logic | Unit + DB |
| Size limit single canonical location | prepareCarrierForDlqStorage is only caller | grep gate |
| Carrier first-write only (resolve/redrive don't touch) | SQL statements don't SET carrier columns | grep gate |
| resolveCarrierForRedrive never throws | try/catch + fallback | Unit |
| prepareCarrierForDlqStorage never throws | try/catch + null fallback | Unit |
