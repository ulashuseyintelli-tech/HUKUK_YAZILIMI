# Phase 10.5 — Cross-Queue Consistency: Tasks

## Task Overview

| Task | Description | Priority | Est. |
|------|-------------|----------|------|
| T1 | Carrier V2 Types | P0 | 1h |
| T2 | Retry Carrier Mutator | P0 | 2h |
| T3 | DLQ Carrier Enricher | P0 | 2h |
| T4 | Redrive Carrier Cloner | P0 | 2h |
| T5 | Carrier Size Limiter | P1 | 2h |
| T6 | Worker Integration | P0 | 2h |
| T7 | Admin Controller Integration | P0 | 1h |
| T8 | ADR-008 v1.3 Update | P1 | 1h |
| T9 | Integration Tests | P0 | 2h |
| T10 | Lock Document | P0 | 0.5h |

**Total Estimate:** ~15.5h

---

## Task 1: Carrier V2 Types
- [x] Extend `IdempotencyCarrier` to `IdempotencyCarrierV2`
- [x] Add retry tracking fields (`attemptNumber`, `lastFailedAt`, `failureHistory`)
- [x] Add DLQ tracking fields (`dlqReason`, `movedToDlqAt`, `finalAttemptNumber`)
- [x] Add redrive tracking fields (`parentCorrelationId`, `redriveSource`, `redrivenAt`, `redrivenBy`)
- [x] Define `FailureEntry` type
- [x] Define `DlqReason` union type
- [x] Export all types

**Acceptance:**
- Types compile without errors
- JSDoc comments on all fields

---

## Task 2: Retry Carrier Mutator
- [x] Create `retry-carrier-mutator.ts`
- [x] Implement `mutateCarrierForRetry(carrier, failure)`
- [x] Increment `attemptNumber`
- [x] Set `lastFailedAt` to current timestamp
- [x] Append to `failureHistory` (capped at 10)
- [x] Implement `appendFailure()` helper
- [x] Implement `truncate()` for error messages (200 chars)
- [x] Create `retry-carrier-mutator.spec.ts`
  - [x] Test: attemptNumber increments
  - [x] Test: lastFailedAt is ISO timestamp
  - [x] Test: failureHistory appends correctly
  - [x] Test: failureHistory caps at 10 entries
  - [x] Test: error message truncation
  - [x] Test: V1 carrier auto-upgrades to V2

**Acceptance:**
- All tests pass
- Metric `carrier_retry_mutation_total` increments

---

## Task 3: DLQ Carrier Enricher
- [x] Create `dlq-carrier-enricher.ts`
- [x] Implement `enrichCarrierForDlq(carrier, reason)`
- [x] Set `dlqReason` (EXHAUSTED | POISON | MANUAL)
- [x] Set `movedToDlqAt` to current timestamp
- [x] Set `finalAttemptNumber` from current attemptNumber
- [x] Create `dlq-carrier-enricher.spec.ts`
  - [x] Test: EXHAUSTED reason
  - [x] Test: POISON reason
  - [x] Test: MANUAL reason
  - [x] Test: movedToDlqAt is ISO timestamp
  - [x] Test: finalAttemptNumber preserved
  - [x] Test: correlationId unchanged

**Acceptance:**
- All tests pass
- Metric `carrier_dlq_enrichment_total{reason}` increments

---

## Task 4: Redrive Carrier Cloner
- [x] Create `redrive-carrier-cloner.ts`
- [x] Implement `cloneCarrierForRedrive(original, ctx)`
- [x] Generate new `correlationId`
- [x] Generate new `requestId`
- [x] Preserve `tenantId`, `userId`
- [x] Reset `attemptNumber` to 0 (first attempt)
- [x] Set `parentCorrelationId` to original
- [x] Set `redriveSource` from context
- [x] Set `redrivenAt` to current timestamp
- [x] Set `redrivenBy` from context
- [x] Clear DLQ fields
- [x] Create `redrive-carrier-cloner.spec.ts`
  - [x] Test: new correlationId generated
  - [x] Test: parentCorrelationId links to original
  - [x] Test: attemptNumber resets to 0
  - [x] Test: tenantId/userId preserved
  - [x] Test: DLQ fields cleared
  - [x] Test: redrive metadata set correctly

**Acceptance:**
- All tests pass
- Metric `carrier_redrive_clone_total{source_dlq}` increments

---

## Task 5: Carrier Size Limiter
- [x] Create `carrier-size-limiter.ts`
- [x] Define `MAX_CARRIER_SIZE_BYTES = 4096`
- [x] Implement `enforceCarrierSizeLimit(carrier)`
- [x] Return `SizeLimitResult` with action
- [x] Implement `truncateCarrier()` (keep last 3 failures)
- [x] Throw `CarrierSizeExceededError` if still too large
- [x] Create `carrier-size-limiter.spec.ts`
  - [x] Test: small carrier passes (action=ok)
  - [x] Test: large carrier truncated (action=truncated)
  - [x] Test: huge carrier rejected (throws)
  - [x] Test: truncation keeps last 3 failures
  - [x] Test: size calculation is accurate

**Acceptance:**
- All tests pass
- Metric `carrier_size_enforcement_total{action}` increments

---

## Task 6: Worker Integration
- [x] Create `worker-carrier-handler.ts` helper module
- [x] Implement `normalizeInboundCarrier()` for V1→V2 upgrade
- [x] Implement `handleRetryCarrier()` for retry path mutation
- [x] Implement `handleDlqCarrier()` for DLQ path enrichment
- [x] Implement `WorkerCarrierSizeExceededError` with error code
- [x] Create `worker-carrier-handler.spec.ts` unit tests
- [x] Create `worker-carrier-lifecycle.integration.spec.ts`
  - [x] IT-7: V1 carrier upgrade on inbound
  - [x] IT-8: Retry path mutation
  - [x] IT-9: Oversize carrier rejection
  - [x] IT-10: DLQ path enrichment
  - [x] IT-11: Correlation preservation
  - [x] IT-12: Metrics label policy

**Acceptance:**
- Worker correctly mutates carrier on retry
- Worker correctly enriches carrier on DLQ move
- Size limits enforced with CARRIER_SIZE_EXCEEDED error code
- No high-cardinality labels in metrics

---

## Task 7: Admin Controller Integration
- [x] Update `manifest-admin.controller.ts` redrive endpoint
- [x] Call `cloneCarrierForRedrive` with operator context
- [x] Enqueue with cloned carrier
- [x] Update audit log with redrive action
- [x] Add controller test for redrive carrier behavior

**Acceptance:**
- Redrive creates new correlationId
- Parent link established
- Audit trail complete

---

## Task 8: ADR-008 v1.3 Update
- [x] Add "Carrier Lifecycle Rules" section
- [x] Document retry path behavior
- [x] Document DLQ path behavior
- [x] Document redrive path behavior
- [x] Add "When NOT to Propagate" anti-patterns section
- [x] Add decision tree diagram
- [x] Update version to 1.3

**Acceptance:**
- ADR-008 v1.3 complete
- Anti-patterns documented

---

## Task 9: Integration Tests
- [x] Create `carrier-lifecycle.integration.spec.ts`
- [x] Test: Job success → no carrier mutation
- [x] Test: Job fail → retry → carrier mutated
- [x] Test: Job fail → exhaust → DLQ → carrier enriched
- [x] Test: DLQ → redrive → carrier cloned
- [x] Test: Full cycle with size limits
- [x] Test: Correlation chain traceable

**Acceptance:**
- All integration tests pass
- Full lifecycle covered

---

## Task 10: Lock Document
- [x] Create `PHASE-10-5-LOCK.md`
- [x] Document all implemented components
- [x] Include test results summary
- [x] Include metrics list
- [x] Mark 10.x series as COMPLETE

**Acceptance:**
- Lock document complete
- Ready for sign-off

---

## Edge Cases to Test

| Edge Case | Expected Behavior |
|-----------|-------------------|
| V1 carrier in retry path | Auto-upgrade to V2 |
| Null carrier in retry path | Create fresh V2 carrier |
| Carrier at size limit | Pass through (action=ok) |
| Carrier 1 byte over limit | Truncate (action=truncated) |
| Carrier with 100 failures | Truncate to 3 |
| Redrive of already-redriven job | Chain parentCorrelationId |
| POISON DLQ reason | No retry, immediate DLQ |
| MANUAL DLQ reason | Operator-triggered move |

---

## Test Count Target

| Suite | Expected Tests |
|-------|----------------|
| retry-carrier-mutator.spec | 8 |
| dlq-carrier-enricher.spec | 8 |
| redrive-carrier-cloner.spec | 8 |
| carrier-size-limiter.spec | 8 |
| carrier-lifecycle.integration.spec | 10 |
| **Total** | **42** |
