# Phase 10.4 - Queue/Job Context Propagation

## Overview

ADR-008 implementasyonu. Queue/job boundary'de idempotency context propagation.

## Requirements

### P0 - Foundation (Types + Validation + Converters)

1. **REQ-1**: `IdempotencyContextCarrier` type tanımı
   - version: 1 (literal)
   - requestId: string (required)
   - actionId: string (required)
   - actionType: string (required)
   - resourceType: string (required)
   - resourceId: string | null
   - takeover: boolean
   - previousActorId: string | null

2. **REQ-2**: `validateCarrier()` fonksiyonu
   - Input: unknown
   - Output: `{ ok: true; carrier } | { ok: false; reason: CarrierDropReason }`
   - Validation rules per ADR-008

3. **REQ-3**: `contextToCarrier()` converter
   - Input: IdempotencyContext
   - Output: IdempotencyContextCarrier

4. **REQ-4**: `carrierToContext()` converter
   - Input: IdempotencyContextCarrier
   - Output: IdempotencyContext

### P1 - Runtime (Producer + Consumer + Metrics)

5. **REQ-5**: `enqueueWithContext()` producer wrapper
   - ALS içindeyse carrier ekler
   - ALS dışındaysa eklenmez (normal)

6. **REQ-6**: `runJobWithCarrier()` consumer runner
   - Carrier validate eder
   - Valid → ALS.run() ile fn çalıştırır
   - Invalid/missing → warn + metric + fn() (degraded)

7. **REQ-7**: `audit_degraded_correlation_total{reason}` metric
   - Labels: MISSING, VERSION_MISMATCH, MISSING_REQUIRED, MALFORMED, TYPE_ERROR

### P2 - Guardrails

8. **REQ-8**: ESLint rule for direct queue.add() ban (backlog)
9. **REQ-9**: Dashboard panel for degraded correlation (backlog)

## Non-Goals

- Queue technology selection
- Retry/dedup strategy
- Job scheduling patterns

## References

- ADR-008: Queue/Job Boundary Context Propagation
- ADR-007: ALS-Only Context Access
