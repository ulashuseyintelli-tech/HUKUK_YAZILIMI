# ADR-007: ALS-Only Context Access

**Status:** Accepted  
**Date:** 2026-02-04  
**Deciders:** Platform Team  
**Related:** PR-7 (Phase 10.3 Idempotency Hardening)

## Context

Idempotency context was previously propagated via `req.idempotencyContext` on the Express request object. This pattern had several issues:

1. **Tight coupling**: Services needed access to the request object
2. **Test complexity**: Mocking request objects in unit tests was cumbersome
3. **Boundary leakage**: Context could accidentally leak across async boundaries
4. **Type safety**: No compile-time guarantees on context shape

## Decision

Use Node.js AsyncLocalStorage (ALS) as the **only** mechanism for idempotency context propagation.

### Rules

1. **ALS-only access**: Services must use `getIdempotencyContext()` from `idempotency-context.ts`
2. **No request object context**: `req.idempotencyContext` pattern is banned
3. **Explicit boundary crossing**: Queue/job payloads must include context explicitly (ALS doesn't cross process boundaries)
4. **No fire-and-forget async**: All async operations inside `ALS.run()` must complete before the scope exits

### Implementation

```typescript
// ✅ CORRECT: Use ALS helper
import { getIdempotencyContext } from '../idempotency/idempotency-context';

const ctx = getIdempotencyContext();
if (ctx) {
  audit.append({ actionId: ctx.actionId, ... });
}

// ❌ BANNED: Request object access
const ctx = req.idempotencyContext; // NEVER DO THIS
```

### Queue/Job Boundary

```typescript
// ✅ CORRECT: Explicit context in job payload
const ctx = getIdempotencyContext();
queue.add('job', { 
  data, 
  idempotencyContext: ctx ? { actionId: ctx.actionId } : null 
});

// ❌ WRONG: Assuming ALS crosses process boundaries
queue.add('job', { data }); // Context lost!
```

## Consequences

### Positive

- Clean separation: services don't need request object
- Type-safe: `IdempotencyContext` interface enforced at compile time
- Testable: `IdempotencyALS.run()` in tests, no request mocking
- Deterministic: parallel request isolation guaranteed

### Negative

- Learning curve: developers must understand ALS semantics
- Explicit boundary handling: queue/job context must be passed manually

### Neutral

- Node.js 16+ required (already satisfied)
- Negligible performance overhead (<1μs per context access)

## Compliance

CI enforces this decision via grep gate:

```yaml
# .github/workflows/ci.yml
- name: Check for banned req.idempotencyContext
  run: |
    if grep -r "req\.idempotencyContext\s*=" apps/api/src/; then
      echo "ERROR: req.idempotencyContext assignment found"
      exit 1
    fi
```

## References

- [Node.js AsyncLocalStorage](https://nodejs.org/api/async_context.html)
- [PR-7-ALS-ARCHITECTURE.md](../.kiro/specs/phase-10-3-idempotency-hardening/PR-7-ALS-ARCHITECTURE.md)
