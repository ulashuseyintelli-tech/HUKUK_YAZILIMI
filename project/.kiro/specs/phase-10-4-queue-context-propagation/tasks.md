# Phase 10.4 - Queue Context Propagation: Tasks

## PR-10.4.1: P0 Foundation (Types + Validation + Converters)

### Task 1: Create carrier types
- [x] Create `idempotency-carrier.types.ts`
- [x] Define `IdempotencyContextCarrier` interface
- [x] Define `CarrierDropReason` type
- [x] Define `CarrierValidationResult` type

### Task 2: Implement validateCarrier()
- [x] Create `idempotency-carrier.validation.ts`
- [x] Implement MALFORMED check (null, undefined, non-object)
- [x] Implement VERSION_MISMATCH check (version !== 1)
- [x] Implement MISSING_REQUIRED check (requestId, actionId, actionType, resourceType)
- [x] Implement TYPE_ERROR check (resourceId, takeover, previousActorId)
- [x] Extra fields → ignore (forward compat)

### Task 3: Implement converters
- [x] Create `idempotency-carrier.converters.ts`
- [x] Implement `contextToCarrier(ctx)` → carrier
- [x] Implement `carrierToContext(carrier)` → ctx

### Task 4: Unit tests for P0
- [x] Create `__tests__/idempotency-carrier.validation.spec.ts`
- [x] Test all validation scenarios (41 tests)
- [x] Create `__tests__/idempotency-carrier.converters.spec.ts`
- [x] Test round-trip conversion (16 tests)

### Task 5: Export from index
- [ ] Update module exports (deferred to P1)

---

## PR-10.4.2: P1 Runtime (Producer + Consumer + Metrics)

### Task 6: Create carrier metrics
- [x] Create `carrier-metrics.ts`
- [x] Define `audit_degraded_correlation_total{reason}` counter
- [x] Labels: MISSING, VERSION_MISMATCH, MISSING_REQUIRED, MALFORMED, TYPE_ERROR

### Task 7: Implement runJobWithCarrier()
- [x] Create `run-job-with-carrier.ts`
- [x] Validate carrier
- [x] Valid → IdempotencyALS.run(ctx, fn)
- [x] Invalid → warn + metric + fn() (degraded)

### Task 8: Implement enqueueWithContext() (optional wrapper)
- [x] Create `enqueue-with-context.ts`
- [x] Capture ALS context
- [x] Add carrier to payload if context exists

### Task 9: Integration tests for P1
- [x] Create `__tests__/run-job-with-carrier.spec.ts` (24 tests)
- [x] Test ALS restoration
- [x] Test degraded mode
- [x] Test metric emission
- [x] Create `__tests__/enqueue-with-context.spec.ts` (12 tests)

---

## PR-10.4.3: P2 Guardrails (Backlog)

### Task 10: ESLint rule (future)
- [ ] Ban direct queue.add() calls
- [ ] Enforce enqueueWithContext() usage

### Task 11: Dashboard panel (future)
- [ ] Add degraded correlation panel
- [ ] Alert on high degraded rate

---

## Acceptance Criteria

### P0 Complete When:
- [x] All types defined and exported
- [x] validateCarrier() handles all cases per ADR-008
- [x] Converters are round-trip safe
- [x] Unit tests pass (57/57 PASS)

### P1 Complete When:
- [x] runJobWithCarrier() restores ALS correctly
- [x] Degraded mode emits metrics
- [x] Integration tests pass (36 tests)

### Phase 10.4 Complete When:
- [x] P0 + P1 merged
- [x] ADR-008 implementation checklist updated
- [x] PHASE-10-4-LOCK.md created

---

## Test Commands

```bash
# P0 tests
node node_modules/jest/bin/jest.js --testPathPattern="idempotency-carrier" --verbose

# P1 tests
node node_modules/jest/bin/jest.js --testPathPattern="run-job-with-carrier" --verbose

# All Phase 10.4 tests
node node_modules/jest/bin/jest.js --testPathPattern="carrier" --verbose
```
