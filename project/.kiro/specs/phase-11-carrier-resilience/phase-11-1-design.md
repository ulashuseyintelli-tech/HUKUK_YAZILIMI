# Phase 11.1 — Worker Inbound Degraded Mode: Design

**Status:** LOCKED  
**Created:** 2026-02-06  
**Depends On:** Phase 10.5 (LOCKED)

---

## Architecture — Inbound Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                  WORKER INBOUND DEGRADED MODE (11.1)                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Queue Payload                                                              │
│       │                                                                     │
│       ▼                                                                     │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │  0. BYTE-LEVEL SIZE CHECK (pre-parse)                                   ││
│  │     rawBytes = Buffer.byteLength(rawPayload)                            ││
│  │     if rawBytes > MAX_CARRIER_BYTES → OVERSIZE (skip parse)             ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│       │                                                                     │
│       ├── OVERSIZE ──────────────────────────────────────────────────────┐  │
│       │                                                                  │  │
│       ▼ (within limit)                                                   │  │
│  ┌─────────────────────────────────────────────────────────────────────┐ │  │
│  │  1. PARSE + VALIDATE                                                │ │  │
│  │     validateInboundCarrier(raw, sizeBytes)                          │ │  │
│  │     → classification: InputClass enum                               │ │  │
│  └─────────────────────────────────────────────────────────────────────┘ │  │
│       │                                                                  │  │
│       ├── VALID_V2 ──────────────────────────────────────────────────┐   │  │
│       │                                                              │   │  │
│       ├── VALID_V1 ──────────────────────────────────────────────┐   │   │  │
│       │                                                          │   │   │  │
│       ├── VERSION_MISMATCH / MALFORMED / TYPE_ERROR /            │   │   │  │
│       │   MISSING_REQUIRED / UPGRADE_FAILED ─────────────────┐   │   │   │  │
│       │                                                      │   │   │   │  │
│       ▼                                                      ▼   ▼   ▼   ▼  │
│  ┌──────────────────────┐  ┌──────────────────────────────────────────────┐│
│  │  DEGRADED PATH       │  │  NORMAL PATH                                ││
│  │  ─────────────────   │  │  ───────────                                ││
│  │  • Build minimal ctx │  │  • V1? upgrade to V2                        ││
│  │  • Emit metric       │  │  • Restore ALS context (FULL)               ││
│  │    (degraded+reason) │  │  • Emit metric (accepted)                   ││
│  │  • Log warn          │  │                                             ││
│  │  • ALS = MINIMAL     │  │                                             ││
│  │    or DISABLED        │  │                                             ││
│  └──────────────────────┘  └──────────────────────────────────────────────┘│
│       │                           │                                        │
│       └───────────┬───────────────┘                                        │
│                   ▼                                                        │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │  JOB EXECUTION                                                          ││
│  │  Job NEVER fails due to carrier issues.                                 ││
│  │  Failure = business logic failure only.                                 ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                   │                                                        │
│                   ▼                                                        │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │  AUDIT EVENT (if applicable)                                            ││
│  │  degradedContext field present when outcome=degraded                     ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Degraded Mode Decision Matrix

| Input Class | Acceptance | Stored Context | DropReason | Metric outcome | Metric reason |
|-------------|------------|----------------|------------|----------------|---------------|
| VALID_V2 | ACCEPT | FULL | — | accepted | — |
| VALID_V1 | ACCEPT (upgrade) | FULL | — | accepted | — |
| VERSION_MISMATCH | DROP_AND_MINIMAL | MINIMAL | VERSION_MISMATCH | degraded | VERSION_MISMATCH |
| MALFORMED | DROP_AND_MINIMAL | MINIMAL | MALFORMED | degraded | MALFORMED |
| TYPE_ERROR | DROP_AND_MINIMAL | MINIMAL | TYPE_ERROR | degraded | TYPE_ERROR |
| MISSING_REQUIRED | DROP_AND_MINIMAL | MINIMAL | MISSING_REQUIRED | degraded | MISSING_REQUIRED |
| OVERSIZE | DROP_AND_MINIMAL | MINIMAL | OVERSIZE | degraded | OVERSIZE |
| UPGRADE_FAILED | DROP_AND_MINIMAL | MINIMAL | UPGRADE_FAILED | degraded | UPGRADE_FAILED |

**Acceptance Semantics:**
- `ACCEPT`: Worker, typed carrier'ı ALS context'e FULL olarak koyar
- `DROP_AND_MINIMAL`: Worker, typed carrier'ı ALS'e koymaz; audit/metrics correlation için minimal context üretir

---

## Type Definitions

### CarrierDropReason (Extended)

```typescript
/**
 * Extended carrier drop reasons for Phase 11.1.
 * 
 * FIXED ENUM — do not add without ADR update.
 * Extends existing CarrierDropReason from idempotency-carrier.types.ts
 */
export type CarrierDropReasonV2 =
  | 'MALFORMED'          // null, undefined, non-object, JSON parse fail
  | 'VERSION_MISMATCH'   // version not in {1, 2}
  | 'MISSING_REQUIRED'   // requestId, actionId, etc. missing/empty
  | 'TYPE_ERROR'         // field type mismatch
  | 'OVERSIZE'           // byte size > MAX_CARRIER_BYTES (pre-parse)
  | 'UPGRADE_FAILED';    // V1→V2 upgrade threw exception
```

### DegradedContext

```typescript
/**
 * Degraded context for audit events when carrier is invalid.
 * Attached to audit event only when outcome=degraded.
 */
export interface DegradedContext {
  /** Always true when present */
  readonly isDegraded: true;
  
  /** Reason for degradation (FIXED ENUM) */
  readonly reason: CarrierDropReasonV2;
  
  /** 
   * First 500 chars of raw carrier JSON (sanitized).
   * undefined if carrier was null/undefined or OVERSIZE.
   * Serialization failure → '[unserializable]'
   */
  readonly carrierSnapshot?: string;
}
```

### MinimalCarrierContext

```typescript
/**
 * Minimal context produced when carrier is dropped.
 * Contains only safe, bounded fields for correlation.
 * 
 * RULES:
 * - No nested payloads
 * - No user-provided large blobs
 * - All fields optional (best-effort extraction from raw carrier)
 */
export interface MinimalCarrierContext {
  /** Carrier version if extractable (may be invalid value) */
  readonly carrierVersion?: number;
  
  /** actionId if extractable */
  readonly actionId?: string;
  
  /** requestId / idempotency key if extractable */
  readonly requestId?: string;
  
  /** Drop reason (always present) */
  readonly dropReason: CarrierDropReasonV2;
  
  /** Timestamp when worker received the payload */
  readonly receivedAt: string; // ISO 8601
}
```

### InboundValidationResult

```typescript
/**
 * Result of inbound carrier validation.
 * 
 * Discriminated union on `mode` field.
 * 
 * DESIGN DECISION — Why no 'NONE' branch:
 * raw=null → MINIMAL (dropReason: MALFORMED, optional fields undefined).
 * MINIMAL already handles "no fields extractable" via optional fields.
 * Two-way switch (FULL|MINIMAL) is simpler for consumers than three-way.
 * 
 * INVARIANTS:
 * - mode='FULL'    → reason is absent, carrier is validated V2
 * - mode='MINIMAL' → reason is REQUIRED, carrier is NOT in ALS
 */
export type InboundValidationResult =
  | {
      readonly mode: 'FULL';
      readonly carrier: IdempotencyContextCarrierV2;
      readonly upgraded: boolean;
    }
  | {
      readonly mode: 'MINIMAL';
      readonly minimalContext: MinimalCarrierContext;
      readonly degradedContext: DegradedContext;
    };
```

---

## Carrier Snapshot Sanitization

```typescript
/**
 * Sanitize raw carrier for audit snapshot.
 * 
 * RULES:
 * - Max 500 chars
 * - Serialization failure → '[unserializable]'
 * - null/undefined → undefined (no snapshot)
 * - OVERSIZE → undefined (no snapshot — we didn't parse it)
 */
function sanitizeCarrierSnapshot(
  raw: unknown,
  reason: CarrierDropReasonV2,
): string | undefined {
  // No snapshot for null/undefined or oversize
  if (raw == null || reason === 'OVERSIZE') return undefined;
  
  try {
    const json = typeof raw === 'string' ? raw : JSON.stringify(raw);
    if (json.length > 500) {
      return json.slice(0, 497) + '...';
    }
    return json;
  } catch {
    return '[unserializable]';
  }
}
```

---

## validateInboundCarrier() — Core Function

```typescript
/**
 * Validate inbound carrier at worker boundary.
 * 
 * CALL ORDER:
 * 1. Byte-level size check (pre-parse, O(1))
 * 2. Null/type check
 * 3. Version check
 * 4. Required field check
 * 5. V1→V2 upgrade (if needed)
 * 
 * GUARANTEE: Never throws. Always returns InboundValidationResult.
 * 
 * @param raw - Raw carrier from job payload (unknown type)
 * @param rawSizeBytes - Pre-computed byte size of raw payload (optional)
 * @returns Validation result (FULL or MINIMAL)
 */
export function validateInboundCarrier(
  raw: unknown,
  rawSizeBytes?: number,
): InboundValidationResult {
  const receivedAt = new Date().toISOString();
  
  // 0. Byte-level oversize check (pre-parse guard)
  if (rawSizeBytes !== undefined && rawSizeBytes > MAX_CARRIER_BYTES) {
    return buildMinimalResult('OVERSIZE', raw, receivedAt);
  }
  
  // 1. Null/undefined check
  if (raw == null) {
    return buildMinimalResult('MALFORMED', raw, receivedAt);
  }
  
  // 2. Object check
  if (typeof raw !== 'object') {
    return buildMinimalResult('MALFORMED', raw, receivedAt);
  }
  
  // 3. Version check
  const version = (raw as Record<string, unknown>).version;
  if (version !== 1 && version !== 2) {
    return buildMinimalResult('VERSION_MISMATCH', raw, receivedAt);
  }
  
  // 4. Already V2 — validate required fields
  if (version === 2) {
    if (!hasRequiredV2Fields(raw)) {
      return buildMinimalResult('MISSING_REQUIRED', raw, receivedAt);
    }
    // Type check critical fields
    if (!typeCheckV2Fields(raw)) {
      return buildMinimalResult('TYPE_ERROR', raw, receivedAt);
    }
    return {
      mode: 'FULL',
      carrier: raw as IdempotencyContextCarrierV2,
      upgraded: false,
    };
  }
  
  // 5. V1 — validate + upgrade
  if (version === 1) {
    if (!hasRequiredV1Fields(raw)) {
      return buildMinimalResult('MISSING_REQUIRED', raw, receivedAt);
    }
    try {
      const v2 = ensureCarrierV2(raw);
      return { mode: 'FULL', carrier: v2, upgraded: true };
    } catch {
      return buildMinimalResult('UPGRADE_FAILED', raw, receivedAt);
    }
  }
  
  // Unreachable (version already checked), but defensive
  return buildMinimalResult('MALFORMED', raw, receivedAt);
}
```

---

## Audit Event Extension

```typescript
// manifest-admin-audit.types.ts — Phase 11.1 extension
export interface AuditEventInput {
  // ... existing fields ...
  
  /** 
   * Phase 11.1: Degraded context when carrier was invalid.
   * Present ONLY when job ran in degraded mode.
   * Absent (undefined) for normal mode jobs.
   */
  degradedContext?: DegradedContext;
}
```

---

## Metrics

### New Metric

| Metric | Type | Labels | Cardinality |
|--------|------|--------|-------------|
| `carrier_inbound_total` | Counter | `outcome`, `reason` | max 14 (2 outcomes × 7 reasons) |

### Label Values (FIXED)

```typescript
// outcome
type InboundOutcome = 'accepted' | 'degraded';

// reason (only set when outcome=degraded)
type InboundReason = CarrierDropReasonV2;
// 'MALFORMED' | 'VERSION_MISMATCH' | 'MISSING_REQUIRED' | 
// 'TYPE_ERROR' | 'OVERSIZE' | 'UPGRADE_FAILED'
```

### Existing Metric Impact

`normalizeInboundCarrier()` in `worker-carrier-handler.ts` currently uses `IWorkerCarrierMetrics.recordCarrierInvalid(reason)`. Phase 11.1 replaces this with the new `carrier_inbound_total` counter for consistency. The old metric calls will be migrated.

---

## Integration Points

### worker-carrier-handler.ts Changes

Mevcut `normalizeInboundCarrier()` fonksiyonu refactor edilecek:

```
BEFORE (Phase 10.5):
  normalizeInboundCarrier(raw) → InboundCarrierResult { carrier, valid, upgraded, invalidReason }
  
AFTER (Phase 11.1):
  validateInboundCarrier(raw, sizeBytes?) → InboundValidationResult { mode: FULL|MINIMAL, ... }
```

`normalizeInboundCarrier()` deprecated olacak, `validateInboundCarrier()` yeni entry point.

### manifest-retry-worker.service.ts Changes

`processOnce()` içinde carrier validation entegre edilecek:
1. Job claim sonrası `validateInboundCarrier()` çağrılır
2. `mode === 'FULL'` → ALS context restore (mevcut davranış)
3. `mode === 'MINIMAL'` → ALS disabled, minimal context set, metric emit
4. Job execution her iki durumda da devam eder

---

## Edge Cases

| Edge Case | Behavior | Test Coverage |
|-----------|----------|---------------|
| `raw = null` | MALFORMED, no snapshot | Unit |
| `raw = undefined` | MALFORMED, no snapshot | Unit |
| `raw = "string"` | MALFORMED, snapshot = string value | Unit |
| `raw = 42` | MALFORMED, snapshot = "42" | Unit |
| `raw = {}` | VERSION_MISMATCH (version undefined) | Unit |
| `raw = { version: 3 }` | VERSION_MISMATCH | Unit |
| `raw = { version: 0 }` | VERSION_MISMATCH | Unit |
| `raw = { version: -1 }` | VERSION_MISMATCH | Unit |
| `raw = { version: 2 }` (no fields) | MISSING_REQUIRED | Unit |
| `raw = { version: 2, requestId: 123 }` | TYPE_ERROR (number not string) | Unit |
| `raw = { version: 1, ...valid }` | ACCEPT, upgraded=true | Unit |
| `raw = { version: 1, requestId: "" }` | MISSING_REQUIRED (empty string) | Unit |
| V1 with valid fields but upgrade throws | UPGRADE_FAILED | Unit |
| 5KB raw payload | OVERSIZE, no parse attempt | Unit |
| Valid V2 carrier | ACCEPT, upgraded=false | Unit |
| Valid V2 carrier at exactly 4096 bytes | ACCEPT (boundary) | Unit |
| Valid V2 carrier at 4097 bytes | OVERSIZE | Unit |
| Snapshot > 500 chars | Truncated to 497 + "..." | Unit |
| Snapshot serialization throws | "[unserializable]" | Unit |
| Snapshot for OVERSIZE | undefined (no snapshot) | Unit |
| Truncated inbound carrier (valid V2, short failureHistory) | ACCEPT as FULL (truncation ≠ invalid) | Unit |
| raw = null, extract fields | MINIMAL: all optional fields undefined, only dropReason+receivedAt | Unit |

### OVERSIZE Parse-Guard Test (MANDATORY — sign-off requirement)

```typescript
// This test MUST prove JSON.parse is never called for oversize payloads.
// Use jest.spyOn(JSON, 'parse') to verify zero calls.
it('OVERSIZE carrier must NOT trigger JSON.parse', () => {
  const parseSpy = jest.spyOn(JSON, 'parse');
  
  const result = validateInboundCarrier(
    { version: 2, requestId: 'x' }, // raw object (won't matter)
    5000, // rawSizeBytes > MAX_CARRIER_BYTES
  );
  
  expect(result.mode).toBe('MINIMAL');
  expect(result.degradedContext.reason).toBe('OVERSIZE');
  expect(parseSpy).not.toHaveBeenCalled();
  
  parseSpy.mockRestore();
});
```

### TRUNCATED_INBOUND — Design Decision

TRUNCATED_INBOUND ayrı bir input class olarak EKLENMEDİ. Gerekçe:
- Truncated carrier (kısaltılmış `failureHistory`) hala valid V2 schema'ya uyar
- `failureHistory` kısa olması validation failure değil
- Carrier valid → ACCEPT as FULL
- İleride "truncated carrier'ı farklı handle et" gerekirse 11.2/11.3'te eklenebilir

---

## Deprecated normalizeInboundCarrier() — Migration Contract

```
RULE: normalizeInboundCarrier() is NOT just @deprecated in comment.
      It MUST be removed from all consumer call sites.
      
MIGRATION:
1. Add validateInboundCarrier() (new entry point)
2. Update all consumers to use validateInboundCarrier()
3. Mark normalizeInboundCarrier() as @deprecated
4. Verify via grep: zero call sites remain (excluding the definition itself)
5. Export preserved for backward compat (external consumers, if any)

VERIFICATION (greppable):
  grep -r "normalizeInboundCarrier" --include="*.ts" | grep -v "deprecated" | grep -v ".spec."
  → Must return ZERO results (excluding definition + re-export)
```

---

## Dependency Graph (within 11.1)

```
degraded-context.types.ts (NEW)
       │
       ├──▶ worker-carrier-handler.ts (UPDATE — add validateInboundCarrier)
       │         │
       │         ├──▶ carrier-lifecycle-metrics.ts (UPDATE — add carrier_inbound_total)
       │         │
       │         └──▶ manifest-admin-audit.types.ts (UPDATE — add degradedContext field)
       │
       └──▶ __tests__/worker-carrier-handler.spec.ts (UPDATE)
       
manifest-retry-worker.service.ts (UPDATE — integrate validation in processOnce)
       │
       └──▶ __tests__/worker-degraded-mode.integration.spec.ts (NEW)
```

---

## Risk Register

| Risk | Impact | Mitigation |
|------|--------|------------|
| Oversize check bypass (sizeBytes not passed) | Low | Default to parse-based validation; oversize is optimization |
| Metric cardinality explosion | Low | FIXED enum, max 14 combinations |
| ALS disabled breaks downstream | Medium | Job already handles null ALS context (Phase 10.5 contract) |
| Audit event size increase | Low | degradedContext is bounded (snapshot max 500 chars) |

