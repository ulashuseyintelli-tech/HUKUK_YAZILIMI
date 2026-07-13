# ADR014-PE-06D Local Session Orchestrator Dry-Validation

## Status and boundary

This module is a test-only, default-disabled dry-validation shell. It verifies that the
canonical PE-06A preparation gate, PE-06B1 fact factories and PE-06C1 metric/event mappers can
be composed without real data, environment activation or runtime telemetry.

It is not an evidence runner and does not create representative evidence, baseline evidence,
readiness, PR-11 eligibility or runtime-cutover authority.

```text
Default mode: DISABLED
Only active mode: TEST_ONLY
Input data: synthetic fixture contract only
Production call-site: none
Persistence: none
External egress: none
```

## Dry-validation chain

```text
PE-06A preparation request and independent canonical-SHA constraint
→ deterministic bounded session-transition plan
→ caller-injected monotonic test clock
→ PE-06B1 fact factories through the PE-06C1 producer boundary
→ same-family v2 SESSION_CONTROL event projection
→ bounded metric projection
→ immutable in-memory validation result
```

The orchestrator does not inspect Git, process state or environment variables. The event
timestamp and canonical SHA remain caller-supplied PE-06C1 context. Phase duration is the
difference between two finite, non-negative values from an injected monotonic clock. A
decreasing, invalid or throwing clock fails closed; no wall-clock fallback exists.

## Scenarios

The bounded synthetic scenarios are:

- `SESSION_SUCCESS`
- `PHASE_FAILURE`
- `PHASE_TIMEOUT`
- `PHASE_CANCELLED`
- `SESSION_ABORTED`
- `INVALID_STATE_TRANSITION`

The successful fixture traverses all seven PE-06B1 fact families. Failure, timeout and
cancellation preserve the canonical distinction between phase outcome and terminal session
`ABORTED`. Invalid transitions and missing PE-06A authorization references return only bounded
blocker codes and no partial projections.

## Security and authority constraints

The implementation has no CLI or `main`, Nest bootstrap, scheduler, database/filesystem/network
access, production data source, metric registry, event logger, audit writer or persistence. It
does not accept business identifiers, monetary values, raw exceptions, free text or arbitrary
metadata. Importing it performs no work.

`DRY_VALIDATED` means only that a synthetic deterministic fixture composed the existing
contracts successfully. Synthetic output is not representative evidence and cannot satisfy
`CAN-CUT-02`, authorize PR-11 or enable runtime cutover.

## Protected state

```text
Representative evidence: ABSENT / BLOCKING
CAN-CUT-02: OPEN / needs-owner-decision
PR-11: NOT AUTHORIZED
Runtime cutover: NOT AUTHORIZED
```
