# Phase 11 — Carrier Resilience & Audit Completeness: Design

**Status:** Draft  
**Created:** 2026-02-06  
**Depends On:** Phase 10.5 (LOCKED)

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         PHASE 11 ARCHITECTURE                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────┐    ┌─────────────────┐    ┌─────────────────────────────┐ │
│  │   Queue     │───▶│  Worker Inbound │───▶│  Job Execution              │ │
│  │   Payload   │    │  (11.1)         │    │  (with/without ALS)         │ │
│  └─────────────┘    └─────────────────┘    └─────────────────────────────┘ │
│        │                    │                           │                   │
│        │                    ▼                           │                   │
│        │            ┌───────────────┐                   │                   │
│        │            │ Degraded Mode │                   │                   │
│        │            │ (warn+metric) │                   │                   │
│        │            └───────────────┘                   │                   │
│        │                                                │                   │
│        │                                                ▼                   │
│        │                                    ┌─────────────────────────────┐ │
│        │                                    │  DLQ Insert (11.2)          │ │
│        │                                    │  + carrier_json storage     │ │
│        │                                    └─────────────────────────────┘ │
│        │                                                │                   │
│        │                                                ▼                   │
│        │                                    ┌─────────────────────────────┐ │
│        │                                    │  Admin Redrive              │ │
│        │                                    │  + depth check (11.3)       │ │
│        │                                    │  + carrier from DLQ         │ │
│        │                                    └─────────────────────────────┘ │
│        │                                                                    │
│        └────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  OPTIONAL (P3):                                                             │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │  11.4 Carrier Compression                                               ││
│  │  ┌─────────────┐    ┌─────────────┐                                     ││
│  │  │ STORAGE     │    │ WIRE        │                                     ││
│  │  │ gzip+base64 │    │ gzip+base64 │                                     ││
│  │  │ (DLQ/DB)    │    │ (queue)     │                                     ││
│  │  └─────────────┘    └─────────────┘                                     ││
│  └─────────────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Dependency Graph

```
11.0 Migration ──────▶ 11.2 DLQ Carrier Storage ──────▶ 11.3 Redrive Depth Limit
                                                              (P3 Optional)

11.1 Worker Degraded Mode (independent)

11.4 Carrier Compression (P3 Optional, parallel)
```

| Task | Depends On | Priority |
|------|------------|----------|
| 11.0 | Phase 10.5 | P2 (COMMIT) |
| 11.1 | Phase 10.5 | P2 (COMMIT) |
| 11.2 | 11.0 | P2 (COMMIT) |
| 11.3 | 11.2 | P3 (OPTIONAL) |
| 11.4 | - | P3 (OPTIONAL) |

---

## Task 11.0: DLQ Carrier Column Migration

### Schema Changes

```sql
-- Migration: 20260206_phase11_dlq_carrier_columns.sql

ALTER TABLE manifest_dead_letter_queue
ADD COLUMN carrier_json TEXT NULL;

ALTER TABLE manifest_dead_letter_queue
ADD COLUMN carrier_version SMALLINT NULL;

ALTER TABLE manifest_dead_letter_queue
ADD COLUMN carrier_truncated BOOLEAN NOT NULL DEFAULT false;

-- Comments
COMMENT ON COLUMN manifest_dead_letter_queue.carrier_json IS 
  'Phase 11: Full V2 carrier JSON snapshot at DLQ insert time';
COMMENT ON COLUMN manifest_dead_letter_queue.carrier_version IS 
  'Phase 11: Carrier schema version (1 or 2)';
COMMENT ON COLUMN manifest_dead_letter_queue.carrier_truncated IS 
  'Phase 11: True if carrier was truncated during storage';
```

### Backfill Strategy

**NO BACKFILL** - Existing DLQ entries will have:
- `carrier_json = NULL`
- `carrier_version = NULL`
- `carrier_truncated = false`

Rationale: Historical carriers were not persisted; we cannot reconstruct them.

### Rollback

```sql
ALTER TABLE manifest_dead_letter_queue DROP COLUMN carrier_truncated;
ALTER TABLE manifest_dead_letter_queue DROP COLUMN carrier_version;
ALTER TABLE manifest_dead_letter_queue DROP COLUMN carrier_json;
```

---

## Task 11.1: Worker Inbound Degraded Mode

### Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     WORKER INBOUND FLOW (11.1)                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Job Payload                                                                │
│       │                                                                     │
│       ▼                                                                     │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │  1. Extract carrier from payload                                        ││
│  │     carrier = job.data.idempotencyContext                               ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│       │                                                                     │
│       ▼                                                                     │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │  2. Validate carrier                                                    ││
│  │     result = validateAndUpgradeCarrier(carrier)                         ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│       │                                                                     │
│       ├──────────────────────────────────────────────────────────────────┐  │
│       │ valid                                                            │  │
│       ▼                                                                  │  │
│  ┌─────────────────────────────────────────────────────────────────────┐ │  │
│  │  3a. Normal Mode                                                    │ │  │
│  │      - Restore ALS context                                          │ │  │
│  │      - Run job with full correlation                                │ │  │
│  └─────────────────────────────────────────────────────────────────────┘ │  │
│                                                                          │  │
│       │ invalid                                                          │  │
│       ▼                                                                  │  │
│  ┌─────────────────────────────────────────────────────────────────────┐ │  │
│  │  3b. Degraded Mode                                                  │ │  │
│  │      - Log warn with reason                                         │ │  │
│  │      - Emit carrier_degraded_total{reason}                          │ │  │
│  │      - Run job WITHOUT ALS context                                  │ │  │
│  │      - Audit event includes degradedContext                         │ │  │
│  └─────────────────────────────────────────────────────────────────────┘ │  │
│       │                                                                  │  │
│       └──────────────────────────────────────────────────────────────────┘  │
│       │                                                                     │
│       ▼                                                                     │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │  4. Job Execution (success or failure)                                  ││
│  │     - Job NEVER fails due to carrier issues                             ││
│  │     - Failure = business logic failure only                             ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### DegradedContext Type

```typescript
/**
 * Degraded context for audit events when carrier is invalid.
 */
export interface DegradedContext {
  /** Always true when present */
  readonly isDegraded: true;
  
  /** Reason for degradation (FIXED ENUM) */
  readonly reason: CarrierDropReason;
  
  /** 
   * First 500 chars of carrier JSON (sanitized).
   * Undefined if carrier was null/undefined.
   */
  readonly carrierSnapshot?: string;
}

/**
 * Carrier drop reasons (FIXED ENUM - do not add without ADR update).
 */
export type CarrierDropReason =
  | 'VERSION_MISMATCH'   // version !== 1 && version !== 2
  | 'MISSING_REQUIRED'   // requestId, actionId, etc. missing
  | 'MALFORMED'          // not an object, null, undefined
  | 'TYPE_ERROR'         // field type mismatch
  | 'UPGRADE_FAILED';    // V1→V2 upgrade threw error
```

### Carrier Snapshot Sanitization

**Rule:** `carrierSnapshot` is best-effort; serialization failure does not block audit emission.

```typescript
function sanitizeCarrierSnapshot(carrier: unknown): string | undefined {
  if (carrier == null) return undefined;
  
  try {
    const json = JSON.stringify(carrier);
    // Max 500 chars
    if (json.length > 500) {
      return json.slice(0, 497) + '...';
    }
    return json;
  } catch {
    // Best-effort: don't block audit on serialization failure
    return '[unserializable]';
  }
}
```

### Audit Event Extension

```typescript
// manifest-admin-audit.types.ts extension
export interface AuditEventInput {
  // ... existing fields ...
  
  /** 
   * Phase 11: Degraded context when carrier was invalid.
   * Present only when job ran in degraded mode.
   */
  degradedContext?: DegradedContext;
}
```

---

## Task 11.2: DLQ Carrier Storage

### Storage Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     DLQ CARRIER STORAGE FLOW (11.2)                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Job Failure (exhausted/poison)                                             │
│       │                                                                     │
│       ▼                                                                     │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │  1. Prepare carrier for storage                                         ││
│  │     - Get current V2 carrier                                            ││
│  │     - Apply size limit (allowTruncation: true)                          ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│       │                                                                     │
│       ▼                                                                     │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │  2. Serialize carrier                                                   ││
│  │     carrierJson = JSON.stringify(carrier)                               ││
│  │     carrierVersion = carrier.version                                    ││
│  │     carrierTruncated = (sizeResult.action === 'TRUNCATED')              ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│       │                                                                     │
│       ▼                                                                     │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │  3. Atomic DLQ insert                                                   ││
│  │     INSERT INTO manifest_dead_letter_queue (                            ││
│  │       ...,                                                              ││
│  │       carrier_json,                                                     ││
│  │       carrier_version,                                                  ││
│  │       carrier_truncated                                                 ││
│  │     ) VALUES (...);                                                     ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│       │                                                                     │
│       ▼                                                                     │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │  4. Emit metrics                                                        ││
│  │     - carrier_dlq_storage_total                                         ││
│  │     - carrier_size_enforcement_total{action}                            ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Admin Redrive with Stored Carrier

```typescript
async redriveFromDlq(dlqId: string, operatorId: string): Promise<RedriveResult> {
  const dlqEntry = await this.dlqRepo.findById(dlqId);
  
  // Try to use stored carrier
  let sourceCarrier: IdempotencyContextCarrierV2 | null = null;
  
  if (dlqEntry.carrierJson) {
    try {
      const parsed = JSON.parse(dlqEntry.carrierJson);
      sourceCarrier = ensureCarrierV2(parsed);
    } catch (e) {
      this.logger.warn('Failed to parse stored carrier, using fallback', { dlqId });
      // Fallback to minimal carrier
    }
  }
  
  if (!sourceCarrier) {
    // Fallback: create minimal carrier from DLQ entry
    sourceCarrier = createMinimalCarrierFromDlq(dlqEntry);
  }
  
  // Clone for redrive (existing logic)
  const cloneResult = cloneCarrierForRedrive(sourceCarrier, {
    dlqName: 'manifest_dlq',
    operatorId,
  });
  
  // ... rest of redrive logic
}
```

---

## Task 11.3: Redrive Chain Depth Limit (P3)

### Depth Calculation

```typescript
/**
 * Calculate redrive depth by traversing parentCorrelationId chain.
 * 
 * @param carrier Current carrier
 * @param dlqRepo DLQ repository for chain lookup
 * @returns Depth (0 = original, 1 = first redrive, etc.)
 */
async function calculateRedriveDepth(
  carrier: IdempotencyContextCarrierV2,
  dlqRepo: ManifestDlqRepository,
): Promise<number> {
  let depth = 0;
  let currentParentId = carrier.parentCorrelationId;
  
  while (currentParentId && depth < MAX_REDRIVE_DEPTH + 1) {
    // Look up parent in DLQ by correlationId
    const parentEntry = await dlqRepo.findByCorrelationId(currentParentId);
    if (!parentEntry?.carrierJson) break;
    
    const parentCarrier = JSON.parse(parentEntry.carrierJson);
    currentParentId = parentCarrier.parentCorrelationId;
    depth++;
  }
  
  return depth;
}
```

### Depth Limit Enforcement

```typescript
const MAX_REDRIVE_DEPTH = 3;

async function enforceRedriveDepthLimit(
  carrier: IdempotencyContextCarrierV2,
  dlqRepo: ManifestDlqRepository,
): Promise<void> {
  const depth = await calculateRedriveDepth(carrier, dlqRepo);
  
  if (depth >= MAX_REDRIVE_DEPTH) {
    // Mark as POISON
    await dlqRepo.markAsPoison(carrier.requestId, {
      reason: 'REDRIVE_DEPTH_EXCEEDED',
      depth,
      maxDepth: MAX_REDRIVE_DEPTH,
    });
    
    // Emit metric
    redriveRejectedMetric.inc({ reason: 'DEPTH_EXCEEDED' });
    
    throw new RedriveDepthExceededError(depth, MAX_REDRIVE_DEPTH);
  }
}
```

### POISON Flag

```sql
-- Add to DLQ table (11.3 migration)
ALTER TABLE manifest_dead_letter_queue
ADD COLUMN is_poison BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE manifest_dead_letter_queue
ADD COLUMN poison_reason TEXT NULL;

COMMENT ON COLUMN manifest_dead_letter_queue.is_poison IS 
  'Phase 11.3: True if entry exceeded redrive depth limit';
COMMENT ON COLUMN manifest_dead_letter_queue.poison_reason IS 
  'Phase 11.3: Reason for poison flag (REDRIVE_DEPTH_EXCEEDED)';
```

---

## Task 11.4: Carrier Compression (P3)

### Two-Mode Design

| Mode | Use Case | Encoding | Storage |
|------|----------|----------|---------|
| STORAGE_COMPRESSION | DLQ/DB persistence | gzip + base64 | `carrier_json` column |
| WIRE_COMPRESSION | Queue payload | gzip + base64 | `idempotencyContext` field |

### Compression Threshold

| Mode | Threshold | Default State |
|------|-----------|---------------|
| STORAGE_COMPRESSION | 1KB | Enabled (DLQ storage) |
| WIRE_COMPRESSION | 1KB | **Disabled** (queue payload) |

**Note:** WIRE_COMPRESSION is disabled by default in Phase 11. Enable only after DLQ storage is stable and proven in production.

### Storage Compression

```typescript
interface CompressedCarrier {
  encoding: 'gzip+base64';
  payload: string;
}

function compressCarrier(carrier: IdempotencyContextCarrierV2): CompressedCarrier {
  const json = JSON.stringify(carrier);
  const compressed = gzipSync(Buffer.from(json, 'utf-8'));
  return {
    encoding: 'gzip+base64',
    payload: compressed.toString('base64'),
  };
}

function decompressCarrier(compressed: CompressedCarrier): IdempotencyContextCarrierV2 {
  if (compressed.encoding !== 'gzip+base64') {
    throw new Error(`Unknown encoding: ${compressed.encoding}`);
  }
  const buffer = Buffer.from(compressed.payload, 'base64');
  const json = gunzipSync(buffer).toString('utf-8');
  return JSON.parse(json);
}
```

### Wire Compression

```typescript
// Queue payload with optional compression
interface QueuePayload {
  bundleId: string;
  idempotencyContext: IdempotencyContextCarrierV2 | CompressedCarrier | null;
}

// Inbound normalize stage
function normalizeInboundCarrier(
  context: IdempotencyContextCarrierV2 | CompressedCarrier | null
): IdempotencyContextCarrierV2 | null {
  if (!context) return null;
  
  if ('encoding' in context && context.encoding === 'gzip+base64') {
    return decompressCarrier(context);
  }
  
  return context as IdempotencyContextCarrierV2;
}
```

---

## Metrics

### New Metrics (Phase 11)

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `carrier_degraded_total` | Counter | `reason` | Jobs running in degraded mode |
| `carrier_dlq_storage_total` | Counter | - | Carriers stored in DLQ |
| `carrier_dlq_storage_truncated_total` | Counter | - | Carriers truncated during DLQ storage |
| `carrier_redrive_depth_total` | Histogram | - | Redrive chain depth distribution |
| `carrier_compressed_total` | Counter | `mode` | Carriers compressed (storage/wire) |
| `carrier_decompressed_total` | Counter | `mode` | Carriers decompressed |

### Label Enums (FIXED)

```typescript
// reason label for carrier_degraded_total
type DegradedReason = 
  | 'VERSION_MISMATCH'
  | 'MISSING_REQUIRED'
  | 'MALFORMED'
  | 'TYPE_ERROR'
  | 'UPGRADE_FAILED';

// mode label for compression metrics
type CompressionMode = 'storage' | 'wire';
```

---

## Risk Register

| Risk | Impact | Mitigation |
|------|--------|------------|
| Schema lock during migration | High | Use `ALTER TABLE ... ADD COLUMN` (no lock for NULL columns) |
| Carrier JSON too large | Medium | Enforce 4KB limit, truncate failureHistory |
| Depth calculation performance | Low | Cache depth in carrier, limit chain traversal |
| Compression CPU overhead | Low | Only compress if size > threshold |
| Rollout order violation | High | Strict dependency: 11.0 → 11.2 → 11.3 |

### Backout Plan

| Task | Backout Steps |
|------|---------------|
| 11.0 | Drop columns (no data loss for existing entries) |
| 11.1 | Revert worker code (jobs will fail on invalid carrier) |
| 11.2 | Revert DLQ insert code (carrier_json stays NULL) |
| 11.3 | Revert depth check (infinite redrive possible) |
| 11.4 | Revert compression (larger payloads) |

---

## References

- [ADR-008 v1.3](../../../docs/adr/ADR-008-QUEUE-JOB-CONTEXT-PROPAGATION.md)
- [Phase 10.5 LOCK](../phase-10-5-cross-queue-consistency/PHASE-10-5-LOCK.md)
- [carrier-lifecycle.types.ts](../../../apps/api/src/modules/calc-preview/diagnostics/object-store/manifest-retry/idempotency/carrier-lifecycle/carrier-lifecycle.types.ts)
