# Phase 10.4 - Queue Context Propagation: Design

## Overview

ADR-008 implementasyonu. Queue/job boundary'de idempotency context'in typed carrier ile taşınması.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    QUEUE CONTEXT FLOW                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  HTTP Request (ALS active)                                      │
│       │                                                         │
│       │ getIdempotencyContext()                                │
│       ▼                                                         │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  contextToCarrier(ctx) → IdempotencyContextCarrier      │   │
│  └─────────────────────────────────────────────────────────┘   │
│       │                                                         │
│       │ enqueueWithContext(queue, data)                        │
│       ▼                                                         │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Queue Payload                                           │   │
│  │  { ...data, idempotencyContext: carrier }               │   │
│  └─────────────────────────────────────────────────────────┘   │
│       │                                                         │
│       │ Job dequeued by worker                                 │
│       ▼                                                         │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  validateCarrier(payload.idempotencyContext)            │   │
│  │  ├─ valid → carrierToContext() → ALS.run()              │   │
│  │  └─ invalid → warn + metric + run without ALS           │   │
│  └─────────────────────────────────────────────────────────┘   │
│       │                                                         │
│       │ runJobWithCarrier(carrier, fn)                         │
│       ▼                                                         │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Worker Scope (ALS restored or degraded)                 │   │
│  │  getIdempotencyContext() → ctx | undefined              │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Components

### P0: Foundation

#### 1. `idempotency-carrier.types.ts`

```typescript
/**
 * Carrier schema v1 for cross-boundary propagation.
 * PII-free, JSON-serializable.
 */
export interface IdempotencyContextCarrier {
  readonly version: 1;
  readonly requestId: string;
  readonly actionId: string;
  readonly actionType: string;
  readonly resourceType: string;
  readonly resourceId: string | null;
  readonly takeover: boolean;
  readonly previousActorId: string | null;
}

export type CarrierDropReason =
  | 'MALFORMED'
  | 'VERSION_MISMATCH'
  | 'MISSING_REQUIRED'
  | 'TYPE_ERROR';

export type CarrierValidationResult =
  | { valid: true; context: IdempotencyContext }
  | { valid: false; reason: CarrierDropReason };
```

#### 2. `idempotency-carrier.validation.ts`

```typescript
export function validateCarrier(carrier: unknown): CarrierValidationResult;
```

Validation rules:
1. `carrier == null || typeof carrier !== 'object'` → MALFORMED
2. `carrier.version !== 1` → VERSION_MISMATCH
3. Required fields (requestId, actionId, actionType, resourceType) missing/empty → MISSING_REQUIRED
4. Type mismatches (resourceId, takeover, previousActorId) → TYPE_ERROR
5. Extra fields → ignore (forward compatibility)

#### 3. `idempotency-carrier.converters.ts`

```typescript
export function contextToCarrier(ctx: IdempotencyContext): IdempotencyContextCarrier;
export function carrierToContext(carrier: IdempotencyContextCarrier): IdempotencyContext;
```

### P1: Runtime

#### 4. `enqueue-with-context.ts`

```typescript
export function enqueueWithContext<T>(
  queue: Queue<T>,
  data: T,
  opts?: JobsOptions,
): Promise<Job<T & { idempotencyContext?: IdempotencyContextCarrier | null }>>;
```

- ALS içindeyse: carrier ekler
- ALS dışındaysa: carrier null (normal, metric yok)

#### 5. `run-job-with-carrier.ts`

```typescript
export async function runJobWithCarrier<T>(
  carrier: unknown,
  fn: () => Promise<T>,
  logger?: Logger,
): Promise<T>;
```

- validateCarrier() çağırır
- Valid → IdempotencyALS.run(ctx, fn)
- Invalid → warn + metric + fn() (degraded)

#### 6. Metrics

```typescript
// audit_degraded_correlation_total{reason}
// Labels: MISSING, VERSION_MISMATCH, MISSING_REQUIRED, MALFORMED, TYPE_ERROR
```

## Validation Matrix

| Condition | Action | Metric Label |
|-----------|--------|--------------|
| `carrier === null/undefined` | warn + run without ALS | `reason=MISSING` |
| `typeof carrier !== 'object'` | warn + run without ALS | `reason=MALFORMED` |
| `carrier.version !== 1` | warn + drop context | `reason=VERSION_MISMATCH` |
| Required field missing/empty | warn + drop context | `reason=MISSING_REQUIRED` |
| Type mismatch | warn + drop context | `reason=TYPE_ERROR` |
| Extra fields present | ignore (forward compat) | - |
| Valid carrier | restore ALS | - |

## File Structure

```
idempotency/
├── idempotency-context.ts           # Existing (Phase 10.3)
├── idempotency-carrier.types.ts     # NEW: P0
├── idempotency-carrier.validation.ts # NEW: P0
├── idempotency-carrier.converters.ts # NEW: P0
├── enqueue-with-context.ts          # NEW: P1
├── run-job-with-carrier.ts          # NEW: P1
├── carrier-metrics.ts               # NEW: P1
└── __tests__/
    ├── idempotency-carrier.validation.spec.ts  # NEW: P0
    ├── idempotency-carrier.converters.spec.ts  # NEW: P0
    └── run-job-with-carrier.spec.ts            # NEW: P1
```

## Test Strategy

### P0 Tests

1. **validateCarrier()**
   - null → MALFORMED
   - undefined → MALFORMED
   - non-object → MALFORMED
   - version !== 1 → VERSION_MISMATCH
   - missing requestId → MISSING_REQUIRED
   - missing actionId → MISSING_REQUIRED
   - empty string fields → MISSING_REQUIRED
   - resourceId wrong type → TYPE_ERROR
   - takeover wrong type → TYPE_ERROR
   - extra fields → valid (ignored)
   - valid carrier → valid + context

2. **contextToCarrier() / carrierToContext()**
   - Round-trip: ctx → carrier → ctx (equality)
   - Version always 1
   - Null fields preserved

### P1 Tests

3. **runJobWithCarrier()**
   - Valid carrier → ALS active inside fn
   - Invalid carrier → ALS undefined + metric
   - Null carrier → ALS undefined + metric (MISSING)

## References

- ADR-008: Queue/Job Boundary Context Propagation
- ADR-007: ALS-Only Context Access
- Phase 10.3: PHASE-10-3-LOCK.md
