# PR-7: AsyncLocalStorage Context Refactor

Phase 10.3 - Idempotency Hardening

## Overview

`req.idempotencyContext` bağımlılığını kaldırıp AsyncLocalStorage (ALS) ile değiştiriyoruz.
Bu refactor, controller bağımlılığını sıfırlar ve future background jobs için altyapı hazırlar.

## Current State (PR-6)

```
┌─────────────────────────────────────────────────────────────────┐
│ Request Flow (Current)                                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  HTTP Request                                                   │
│       │                                                         │
│       ▼                                                         │
│  ┌─────────────────┐                                           │
│  │ IdempotencyGate │                                           │
│  │   Interceptor   │                                           │
│  └────────┬────────┘                                           │
│           │                                                     │
│           │ req.idempotencyContext = { ... }  ← COUPLING       │
│           ▼                                                     │
│  ┌─────────────────┐                                           │
│  │   Controller    │                                           │
│  │   (handler)     │                                           │
│  └────────┬────────┘                                           │
│           │                                                     │
│           │ req.idempotencyContext  ← PASSED VIA REQUEST       │
│           ▼                                                     │
│  ┌─────────────────┐                                           │
│  │  AuditService   │                                           │
│  │  (enrichment)   │                                           │
│  └─────────────────┘                                           │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

Problems:
1. Service'ler request object'e bağımlı
2. Background jobs'ta context propagation zor
3. Test isolation karmaşık
```

## Target State (PR-7)

```
┌─────────────────────────────────────────────────────────────────┐
│ Request Flow (PR-7)                                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  HTTP Request                                                   │
│       │                                                         │
│       ▼                                                         │
│  ┌─────────────────┐                                           │
│  │ IdempotencyGate │                                           │
│  │   Interceptor   │                                           │
│  └────────┬────────┘                                           │
│           │                                                     │
│           │ idempotencyContextStore.run(context, () => ...)    │
│           ▼                                                     │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              AsyncLocalStorage<IdempotencyContext>       │   │
│  │  ┌─────────────────────────────────────────────────┐    │   │
│  │  │ actionId, requestId, actionType, resourceType,  │    │   │
│  │  │ resourceId, takeover, previousActorId           │    │   │
│  │  └─────────────────────────────────────────────────┘    │   │
│  └─────────────────────────────────────────────────────────┘   │
│           │                                                     │
│           │ getIdempotencyContext()  ← NO REQUEST DEPENDENCY   │
│           ▼                                                     │
│  ┌─────────────────┐  ┌─────────────────┐  ┌───────────────┐   │
│  │  AuditService   │  │  DLQ Repository │  │ Future: Jobs  │   │
│  │  (enrichment)   │  │  (correlation)  │  │ (propagation) │   │
│  └─────────────────┘  └─────────────────┘  └───────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

Benefits:
1. Service'ler request'ten bağımsız
2. Background jobs için explicit context pass
3. Test isolation basit (runInContext helper)
```

## File Changes

### 1. NEW: idempotency-context.ts

```typescript
/**
 * AsyncLocalStorage wrapper for IdempotencyContext.
 * 
 * Usage:
 * - Interceptor: idempotencyContextStore.run(context, () => next.handle())
 * - Service: const ctx = getIdempotencyContext()
 */

import { AsyncLocalStorage } from 'async_hooks';

export interface IdempotencyContext {
  actionId: string;
  requestId: string;
  actionType: string;
  resourceType: string;
  resourceId: string | null;
  takeover: boolean;
  previousActorId: string | null;
}

// Singleton ALS instance
const idempotencyContextStore = new AsyncLocalStorage<IdempotencyContext>();

/**
 * Get current idempotency context from ALS.
 * Returns undefined if not in an idempotency-gated request.
 */
export function getIdempotencyContext(): IdempotencyContext | undefined {
  return idempotencyContextStore.getStore();
}

/**
 * Run callback with idempotency context.
 * Used by interceptor to wrap handler execution.
 */
export function runWithIdempotencyContext<T>(
  context: IdempotencyContext,
  callback: () => T,
): T {
  return idempotencyContextStore.run(context, callback);
}

/**
 * Test helper: run callback with mock context.
 */
export function runInTestContext<T>(
  context: Partial<IdempotencyContext>,
  callback: () => T,
): T {
  const fullContext: IdempotencyContext = {
    actionId: context.actionId ?? 'test-action-id',
    requestId: context.requestId ?? 'test-request-id',
    actionType: context.actionType ?? 'TEST_ACTION',
    resourceType: context.resourceType ?? 'TEST_RESOURCE',
    resourceId: context.resourceId ?? null,
    takeover: context.takeover ?? false,
    previousActorId: context.previousActorId ?? null,
  };
  return idempotencyContextStore.run(fullContext, callback);
}
```

### 2. MODIFY: idempotency-gate.interceptor.ts

```diff
- // Set req.idempotencyContext
- req.idempotencyContext = idempotencyContext;
- 
- return next.handle().pipe(...)

+ // Run handler with ALS context
+ return runWithIdempotencyContext(idempotencyContext, () => 
+   next.handle().pipe(...)
+ );
```

### 3. MODIFY: manifest-admin-audit.service.ts

```diff
+ import { getIdempotencyContext } from '../idempotency/idempotency-context';

  append(input: AuditEventInput): void {
+   // Auto-enrich from ALS if available
+   const ctx = getIdempotencyContext();
+   if (ctx && !input.actionId) {
+     input.actionId = ctx.actionId;
+   }
    // ... rest of append logic
  }
```

## Guardrails

### 1. Fire-and-Forget Async Yasak

```typescript
// ❌ WRONG: Context lost after await
async function badExample() {
  const ctx = getIdempotencyContext(); // OK here
  setTimeout(() => {
    const ctx2 = getIdempotencyContext(); // UNDEFINED!
  }, 100);
}

// ✅ CORRECT: Capture context before async boundary
async function goodExample() {
  const ctx = getIdempotencyContext();
  setTimeout(() => {
    // Use captured ctx, not getIdempotencyContext()
    doSomething(ctx);
  }, 100);
}
```

### 2. Queue/Job Boundary

```typescript
// ❌ WRONG: ALS doesn't cross process boundaries
queue.add('job', { data });

// ✅ CORRECT: Explicit context in job payload
const ctx = getIdempotencyContext();
queue.add('job', { 
  data, 
  idempotencyContext: ctx ? { actionId: ctx.actionId } : null 
});
```

## Test Strategy

### Unit Tests

```typescript
describe('AuditService with ALS', () => {
  it('should auto-enrich actionId from context', () => {
    runInTestContext({ actionId: 'test-123' }, () => {
      auditService.append({ eventType: 'ADMIN_ACTION', ... });
      expect(lastEvent.actionId).toBe('test-123');
    });
  });

  it('should work without context (backward compat)', () => {
    // No runInTestContext wrapper
    auditService.append({ eventType: 'ADMIN_ACTION', actionId: 'explicit-456', ... });
    expect(lastEvent.actionId).toBe('explicit-456');
  });
});
```

### Concurrency Tests

```typescript
describe('ALS Isolation', () => {
  it('should isolate context between parallel requests', async () => {
    const results = await Promise.all([
      runInTestContext({ actionId: 'req-1' }, async () => {
        await delay(10);
        return getIdempotencyContext()?.actionId;
      }),
      runInTestContext({ actionId: 'req-2' }, async () => {
        await delay(5);
        return getIdempotencyContext()?.actionId;
      }),
    ]);
    
    expect(results).toEqual(['req-1', 'req-2']); // No cross-contamination
  });
});
```

## Migration Plan

### Phase 1: Add ALS (Non-Breaking)
1. Create `idempotency-context.ts`
2. Interceptor: set both `req.idempotencyContext` AND ALS
3. Services: prefer ALS, fallback to explicit param

### Phase 2: Migrate Consumers
1. AuditService: use `getIdempotencyContext()`
2. Remove `req.idempotencyContext` reads from services

### Phase 3: Cleanup
1. Remove `req.idempotencyContext` assignment
2. Remove backward compat fallbacks
3. Update tests

## DoD Checklist

- [x] `idempotency-context.ts` created with ALS wrapper
- [x] Interceptor uses `IdempotencyALS.run()` (PR-7.1)
- [x] AuditService uses `getIdempotencyContext()` for auto-enrichment (PR-7.2)
- [x] Existing tests pass (backward compat)
- [x] New concurrency tests added (11 tests)
- [x] No `req.idempotencyContext` reads in services (PR-7.3)

## Risks

| Risk | Mitigation |
|------|------------|
| Node.js version | Already on 18+ ✅ |
| Async boundary context loss | Guardrail documentation + code review |
| Test complexity | `runInTestContext` helper |
| Performance | ALS overhead negligible (<1μs) |

## References

- [Node.js AsyncLocalStorage](https://nodejs.org/api/async_context.html)
- [NestJS Execution Context](https://docs.nestjs.com/fundamentals/execution-context)


---

## PR-7.1 Implementation Notes (2026-02-03)

### Actual Implementation vs Design

| Design | Actual |
|--------|--------|
| `runWithIdempotencyContext()` | `IdempotencyALS.run()` directly |
| `idempotencyContextStore` | `IdempotencyALS` (exported) |
| `runInTestContext()` | Not needed, direct `IdempotencyALS.run()` in tests |

### Key Decisions

1. **Direct ALS export**: `IdempotencyALS` exported for flexibility, but services should use `getIdempotencyContext()`
2. **Observable wrapper**: Used `new Observable()` to wrap `IdempotencyALS.run()` for RxJS compatibility
3. **Backward compat**: `req.idempotencyContext` kept with TODO comment for PR-7.2 removal
4. **Takeover audit moved**: Now emitted inside ALS scope (was outside before)

### Test Coverage

```
idempotency-context.spec.ts: 11 tests
├── getIdempotencyContext: 3 tests
├── hasIdempotencyContext: 2 tests
├── context isolation: 2 tests
├── CACHED/IN_PROGRESS paths: 2 tests
└── takeover context: 2 tests

idempotency-gate.integration.spec.ts: 12 tests (unchanged, all pass)
```

### Next Steps

1. **PR-7.2**: Migrate `manifest-admin-audit.service.ts` to use `getIdempotencyContext()`
2. **PR-7.3**: (Optional) Job/queue boundary explicit context pass
3. **PR-7.4**: Remove `req.idempotencyContext` (breaking change)


---

## PR-7.2 Implementation Notes (2026-02-04)

### Actual Implementation

**manifest-admin-audit.service.ts**
```typescript
import { getIdempotencyContext } from '../idempotency/idempotency-context';

append(input: AuditEventInput): void {
  // Check buffer overflow first (optimization)
  if (this.buffer.length >= this.config.maxBufferSize) {
    this.handleBufferOverflow();
    return;
  }
  
  // PR-7.2: Enrich from ALS context (input takes precedence)
  const ctx = getIdempotencyContext();
  
  const event: AuditEvent = {
    ...input,
    // ... other fields ...
    actionId: input.actionId ?? ctx?.actionId ?? null,
    takeoverFrom: input.takeoverFrom ?? (ctx?.takeover ? ctx.previousActorId ?? null : null),
    // ... other fields ...
  };
  
  this.buffer.push(event);
}
```

### Key Decisions

1. **ctx retrieval placement**: After buffer overflow check (optimization - no ALS access if dropping)
2. **Enrichment scope**: Only `actionId` and `takeoverFrom` (not `actionType`/`resourceType` - those are event semantics)
3. **No WARN guardrail**: Removed IDEMPOTENCY_TAKEOVER ctx check (unnecessary noise)
4. **takeoverFrom expression**: Simplified to handle undefined previousActorId

### Test Coverage

```
PR-7.2: ALS enrichment (6 tests)
├── actionId enrichment from ALS
├── actionId input override protection
├── takeoverFrom enrichment (takeover=true)
├── takeoverFrom no enrichment (takeover=false)
├── takeoverFrom input override protection
└── backward compat (no ALS context)
```

### Enrichment Flow

```
append(input)
    │
    ├─ Buffer overflow? → drop, return
    │
    └─ ctx = getIdempotencyContext()
         │
         ├─ ctx undefined (no ALS scope)
         │    │
         │    └─ actionId = input.actionId ?? null
         │       takeoverFrom = input.takeoverFrom ?? null
         │
         └─ ctx defined (inside ALS.run)
              │
              ├─ actionId = input.actionId ?? ctx.actionId ?? null
              │
              └─ takeoverFrom = input.takeoverFrom ??
                   (ctx.takeover ? ctx.previousActorId ?? null : null)
```

### Next Steps

1. **PR-7.3**: (Optional) Job/queue boundary explicit context pass
2. **PR-7.4**: Remove `req.idempotencyContext` (breaking change)


---

## PR-7.3 Implementation Notes (2026-02-04)

### Changes

**idempotency-gate.interceptor.ts**
- Removed `req.idempotencyContext = idempotencyContext` assignment
- Removed TODO comment
- ALS is now the only context propagation mechanism

### Verification

```bash
# No req.idempotencyContext assignments remain
grep -r "req\.idempotencyContext\s*=" → 0 matches
```

### Test Results

- idempotency-context.spec: 11/11 ✅
- idempotency-gate.integration.spec: 12/12 ✅
- manifest-admin-audit.service.spec: 21/21 ✅

### PR-7 Complete

All three sub-PRs are now complete:
- PR-7.1: ALS wrapper + interceptor refactor ✅
- PR-7.2: AuditService ALS enrichment ✅
- PR-7.3: Backward compat cleanup ✅

The `req.idempotencyContext` pattern has been fully replaced with AsyncLocalStorage.


---

## ADR-007 + CI Grep Gate (2026-02-04)

### ADR-007: ALS-Only Context Access

Decision record created at `docs/adr/ADR-007-ALS-ONLY-CONTEXT-ACCESS.md`.

Key points:
- `req.idempotencyContext` pattern is banned
- Services must use `getIdempotencyContext()` from `idempotency-context.ts`
- Queue/job payloads must include context explicitly
- No fire-and-forget async inside `ALS.run()` scope

### CI Grep Gate

Added to `.github/workflows/ci.yml`:

```yaml
- name: Check for banned req.idempotencyContext (ADR-007)
  run: |
    if grep -r "req\.idempotencyContext\s*=" apps/api/src/; then
      echo "❌ ADR-007 VIOLATION"
      exit 1
    fi
    echo "✅ ADR-007 compliant"
```

This prevents regression to the old pattern.

### Final DoD Checklist (Updated)

- [x] `idempotency-context.ts` created with ALS wrapper
- [x] Interceptor uses `IdempotencyALS.run()` (PR-7.1)
- [x] AuditService uses `getIdempotencyContext()` for auto-enrichment (PR-7.2)
- [x] Existing tests pass (backward compat)
- [x] New concurrency tests added (11 tests)
- [x] No `req.idempotencyContext` reads in services (PR-7.3)
- [x] ADR-007 created (decision record)
- [x] CI grep gate added (regression prevention)


---

## ADR-008: Queue/Job Boundary Contract (2026-02-04)

ADR-008 created to lock the contract for cross-process context propagation.

**Key Points:**
- `IdempotencyContextCarrier` typed payload for queue/job data
- Producer: capture context before enqueue
- Consumer: restore ALS via `IdempotencyALS.run(carrierToContext(carrier), fn)`
- No PII in carrier
- Version field for forward compatibility

**Relationship:**
- ADR-007: HTTP request boundary (ALS-only)
- ADR-008: Process boundary (explicit carrier)

**Status:** Contract locked, implementation deferred until queue infrastructure is added.

See: `docs/adr/ADR-008-QUEUE-JOB-CONTEXT-PROPAGATION.md`
