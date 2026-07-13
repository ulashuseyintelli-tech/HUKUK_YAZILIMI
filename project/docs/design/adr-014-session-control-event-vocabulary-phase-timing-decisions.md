# ADR014-PE-06C0 — Session / Control Event Vocabulary and Phase Timing Decisions

**Status:** DEFINED / CANONICAL AFTER APPROVED MERGE / OWNER DECISIONS COMPLETE
**Date:** 2026-07-13
**Program:** ADR-014 / CCB-001 / CAN-CUT-02 pre-evidence observability
**Authority boundary:** Governance decision contract only. No runtime call-site, telemetry activation,
session execution, data access, persistence, representative evidence, PR-11 or runtime cutover.

## 1. Purpose and canonical boundary

This contract closes the two explicit blockers preserved by PE-06B2:

```text
PE-06C0-BLOCKER-01  canonical session/control structured-event vocabulary absent
PE-06C0-BLOCKER-02  authoritative phase-duration source absent
```

It preserves the PE-05A2 v1 shadow event contract, the PE-06A disabled harness, the PE-06B1
seven-family fact contract and the PE-06B2 default-disabled producer. It creates no second event
system and changes no calculation, readiness, blocker, Collection, Ledger, API, DTO, schema,
migration or financial authority behavior.

## 2. Owner decisions

### OD-C0-01 — Event Contract Versioning

**QUESTION:** How is the PE-05A2 v1 shadow event contract preserved?
**OPTIONS:** A — extend v1 directly; B — same envelope family with a v2 profile.
**SELECTED OPTION:** **B — SAME ENVELOPE FAMILY / V2 PROFILE.**
**RATIONALE:** v1 is shadow-comparison-specific and already canonical. Extending its vocabulary
would blur semantics and make compatibility harder to prove.
**CANONICAL CONSEQUENCE:** v1 remains immutable. Session/control events use version `2` in the
same canonical envelope family. No replacement or second event system is created.
**IMPLEMENTATION ELIGIBILITY:** PE-06C1 may define and test the v2 profile.
**EXPLICITLY NOT AUTHORIZED:** v1 mutation, new logger/sink, runtime emission or activation.

### OD-C0-02 — Event Profile Identity

**QUESTION:** How is the v2 session/control profile identified?
**OPTIONS:** explicit `event_profile`; event-type namespace only.
**SELECTED OPTION:** **Explicit `event_profile: SESSION_CONTROL`.**
**RATIONALE:** An explicit discriminator makes v1/v2 parsing exhaustive without overloading event
names. The two alternatives are not combined.
**CANONICAL CONSEQUENCE:** v2 uses `event_version: '2'` plus
`event_profile: 'SESSION_CONTROL'`; v1 serialization has no new field.
**IMPLEMENTATION ELIGIBILITY:** A versioned union in the existing envelope family.
**EXPLICITLY NOT AUTHORIZED:** adding `event_profile` to v1 or accepting arbitrary profiles.

### OD-C0-03 — Fact-to-Event Mapping Ownership

**QUESTION:** Which layer owns exact fact-to-event projection?
**OPTIONS:** fact factory; PE-06B2 mapper boundary; orchestrator; sink.
**SELECTED OPTION:** **PE-06B2 fact-to-event mapper boundary.**
**RATIONALE:** Construction, projection, lifecycle timing and delivery are separate responsibilities.
**CANONICAL CONSEQUENCE:** Fact factory constructs immutable facts; mapper projects events;
future orchestrator owns lifecycle timing/ordering; sink owns delivery only.
**IMPLEMENTATION ELIGIBILITY:** Pure, exhaustive mapping in PE-06C1.
**EXPLICITLY NOT AUTHORIZED:** mapper decisions by sink or lifecycle inference by fact factories.

### OD-C0-04 — Session Lifecycle Vocabulary

**QUESTION:** Which session lifecycle observations are telemetry events?
**OPTIONS:** one untyped event; bounded state-specific events; audit-only lifecycle.
**SELECTED OPTION:** **Bounded state-specific observation events.**
**RATIONALE:** Exact state mapping is deterministic and avoids free-text metadata. Authority-bearing
decisions remain audit facts; telemetry only observes an already-established state.
**CANONICAL CONSEQUENCE:** The exact event types are:

```text
ADR014_SESSION_REQUESTED                 ← DRAFT
ADR014_SESSION_ENVIRONMENT_VERIFIED      ← ENVIRONMENT_VERIFIED
ADR014_SESSION_ACCESS_STATE_OBSERVED     ← ACCESS_APPROVED
ADR014_SESSION_EXECUTION_AUTH_STATE_OBSERVED ← EXECUTION_AUTHORIZED
ADR014_SESSION_STARTED                   ← ACTIVE
ADR014_SESSION_CAPTURE_COMPLETED         ← CAPTURE_COMPLETE
ADR014_SESSION_VALIDATION_STARTED        ← VALIDATION_PENDING
ADR014_SESSION_VALIDATED                 ← VALIDATED
ADR014_SESSION_CLOSED                    ← CLOSED
ADR014_SESSION_REJECTED                  ← REJECTED
ADR014_SESSION_ABORTED                   ← ABORTED
ADR014_SESSION_INVALIDATED               ← INVALIDATED
```

Access approval and execution authorization decisions themselves are `AUDIT_ONLY_FUTURE`.
Their observation events do not create or substitute authority.
**IMPLEMENTATION ELIGIBILITY:** All twelve state-to-event mappings are eligible in PE-06C1 tests
and default-disabled projection.
**EXPLICITLY NOT AUTHORIZED:** approval, authorization, session transition or durable audit writes.

### OD-C0-05 — Execution Request Result Vocabulary

**QUESTION:** What is the bounded execution-request result vocabulary?
**OPTIONS:** collapsed success/error; exact decision/result states.
**SELECTED OPTION:** **`ACCEPTED`, `REJECTED`, `NOT_AUTHORIZED`, `INVALID_STATE`, `UNAVAILABLE`,
`ERROR`.**
**RATIONALE:** Absence of authority, an explicit authorized rejection and an invalid lifecycle state
are materially different.
**CANONICAL CONSEQUENCE:** `NOT_AUTHORIZED` means required authorization is absent;
`REJECTED` means an authorized decision-maker explicitly rejected the request;
`INVALID_STATE` means lifecycle prerequisites are unmet.
**IMPLEMENTATION ELIGIBILITY:** Vocabulary and tests only. The seven PE-06B1 fact families contain
no execution-request fact, so no request metric/event may be inferred from session state.
**EXPLICITLY NOT AUTHORIZED:** request handling, authorization or synthetic request counts.

### OD-C0-06 — Phase Lifecycle Vocabulary

**QUESTION:** Which phase event types are canonical?
**OPTIONS:** include phase-level `ABORTED`; keep abort session-level.
**SELECTED OPTION:** **`ADR014_PHASE_STARTED`, `ADR014_PHASE_COMPLETED`,
`ADR014_PHASE_FAILED`, `ADR014_PHASE_TIMEOUT`, `ADR014_PHASE_CANCELLED`; no phase-level
`ABORTED`.**
**RATIONALE:** PE-06B1 already separates phase failure/outcome from terminal session abort.
**CANONICAL CONSEQUENCE:** `ABORTED` remains a session terminal state only.
**IMPLEMENTATION ELIGIBILITY:** Exact PHASE fact mapping in PE-06C1.
**EXPLICITLY NOT AUTHORIZED:** timeout/cancellation behavior or phase execution.

### OD-C0-07 — TIMEOUT / CANCELLED / ABORTED / FAILED

**QUESTION:** How are the four outcomes distinguished?
**OPTIONS:** collapse them; preserve separate semantics.
**SELECTED OPTION:** **Preserve separate semantics.**
**RATIONALE:** They have different operational and audit meanings.
**CANONICAL CONSEQUENCE:** `TIMEOUT` = authorized time boundary exceeded; `CANCELLED` = intentional
stop before normal completion; `FAILED` = technical/deterministic processing failure;
`ABORTED` = session-level terminal state caused by failure, timeout, cancellation or boundary
breach. `TIMEOUT ≠ FAILED`, `CANCELLED ≠ FAILED`.
**IMPLEMENTATION ELIGIBILITY:** Vocabulary and mapping tests.
**EXPLICITLY NOT AUTHORIZED:** a timeout boundary, timer, cancellation handler or abort transition.

### OD-C0-08 — Control Event Vocabulary

**QUESTION:** Which control events are eligible before a runtime control surface exists?
**OPTIONS:** all change events; observed state only.
**SELECTED OPTION:** **Only `ADR014_CONTROL_STATE_OBSERVED` is implementation-eligible.**
**RATIONALE:** No authorized runtime control mutation surface exists.
**CANONICAL CONSEQUENCE:** `CONTROL_CHANGE_REQUESTED`, `CONTROL_CHANGE_REJECTED`,
`CONTROL_CHANGE_AUTHORIZED`, `CONTROL_CHANGE_APPLIED`, `CONTROL_CHANGE_FAILED` are bounded
`AUDIT_ONLY_FUTURE / OWNER_GATED` vocabulary and are not PE-06C1 telemetry events. A frontend
flag or environment variable is not control authority.
**IMPLEMENTATION ELIGIBILITY:** Default-disabled mapping of existing CONTROL facts only.
**EXPLICITLY NOT AUTHORIZED:** control mutation, activation or change-event emission.

### OD-C0-09 — Health Event Vocabulary

**QUESTION:** Which health vocabulary is canonical?
**OPTIONS:** introduce `UNAVAILABLE/INVALID`; preserve PE-06B1 health states.
**SELECTED OPTION:** **Preserve PE-06B1 exactly:** `HEALTHY`, `DEGRADED`, `FAILED`, `UNKNOWN`,
`NOT_CONFIGURED`, projected by `ADR014_INSTRUMENTATION_HEALTH_OBSERVED`.
**RATIONALE:** Adding states would mutate the fact contract.
**CANONICAL CONSEQUENCE:** Health is instrumentation state only; it is not financial readiness,
legal validity, evidence acceptance or PR-11 eligibility.
**IMPLEMENTATION ELIGIBILITY:** Exhaustive default-disabled mapping.
**EXPLICITLY NOT AUTHORIZED:** readiness or authority inference from health.

### OD-C0-10 — Phase Duration Source

**QUESTION:** Which layer supplies phase duration?
**OPTIONS:** A — fact factory clock; B — producer clock; C — orchestrator-owned monotonic timing.
**SELECTED OPTION:** **C — future local session orchestrator-owned monotonic timing.**
**RATIONALE:** Fact factories and mappers stay deterministic and clock-free; the lifecycle owner
measures the lifecycle it controls.
**CANONICAL CONSEQUENCE:** The orchestrator supplies duration through a separate immutable
projection context. The fact contract is unchanged.
**IMPLEMENTATION ELIGIBILITY:** PE-06C1 may define/validate the context and map it in tests.
**EXPLICITLY NOT AUTHORIZED:** runtime measurement, orchestrator or timer activation.

### OD-C0-11 — Clock Model

**QUESTION:** What clock model applies?
**OPTIONS:** wall clock for all uses; separated monotonic/wall/domain time.
**SELECTED OPTION:** **Separated clock model.**
**RATIONALE:** Duration, operational timestamp and legal/financial as-of have different semantics.
**CANONICAL CONSEQUENCE:** Duration uses an injected monotonic seconds source, future Node backing
`performance.now() / 1000`; event timestamps use UTC ISO-8601 wall-clock with explicit `Z`;
legal/financial as-of remains an explicit domain input. Duration must be finite and `>= 0`;
negative/NaN/infinite values fail closed. Wall-clock drift is never used to calculate duration.
**IMPLEMENTATION ELIGIBILITY:** Pure validator and injected test clock in PE-06C1.
**EXPLICITLY NOT AUTHORIZED:** hidden `Date.now()` timing or legal-date inference.

### OD-C0-12 — Phase Timing Ownership

**QUESTION:** Which layer owns each timing responsibility?
**OPTIONS:** shared ownership; explicit split.
**SELECTED OPTION:** **Explicit split.**
**RATIONALE:** Ownership must match lifecycle authority.
**CANONICAL CONSEQUENCE:** Future orchestrator owns phase start/end and duration; producer accepts
supplied context; fact factory constructs facts; mapper projects supplied duration; metric observes
it.
**IMPLEMENTATION ELIGIBILITY:** Types and tests only in PE-06C1.
**EXPLICITLY NOT AUTHORIZED:** producer- or mapper-invented duration.

### OD-C0-13 — Gauge Reset Ownership

**QUESTION:** Who owns gauge set/reset and stale cleanup?
**OPTIONS:** mapper; one global producer; split canonical producers.
**SELECTED OPTION:** **Split canonical producer ownership is preserved.**
**RATIONALE:** PE-06B1 already assigns different owners by fact kind.
**CANONICAL CONSEQUENCE:** Future session orchestrator owns session/manifest/coverage session-scoped
gauge lifecycle; control observer owns kill-switch gauge lifecycle; health observer owns health
gauge lifecycle. Mapper owns none. Terminal session transition triggers session-scoped reset.
Process initialization must be explicit; no stale value is treated as current.
**IMPLEMENTATION ELIGIBILITY:** Reset contract tests only; no gauge activation in PE-06C1.
**EXPLICITLY NOT AUTHORIZED:** runtime registry mutation or an invented `UNKNOWN/INACTIVE` fact state.

### OD-C0-14 — Stale-State Semantics

**QUESTION:** How are restart, abort, missing terminal event and registry reset handled?
**OPTIONS:** reconstruct state from metrics; fail closed and require source observation.
**SELECTED OPTION:** **Fail closed; never reconstruct canonical state from metrics.**
**RATIONALE:** Gauges are operational projections, not lifecycle authority.
**CANONICAL CONSEQUENCE:** Missing/stale state is not healthy, complete or authorized. A future
orchestrator emits explicit initialization and terminal observations; missing terminal state makes
the affected monitoring/evidence window incomplete.
**IMPLEMENTATION ELIGIBILITY:** Deterministic stale-state tests and documentation.
**EXPLICITLY NOT AUTHORIZED:** state recovery or evidence repair from metric samples.

### OD-C0-15 — Runtime Call-Site Gate

**QUESTION:** May PE-06C1 add production call-sites?
**OPTIONS:** yes; no.
**SELECTED OPTION:** **NO.**
**RATIONALE:** PE-06C1 is contract completion, not activation.
**CANONICAL CONSEQUENCE:** Only pure default-disabled mappings and tests are eligible.
**IMPLEMENTATION ELIGIBILITY:** No-call-site technical slice.
**EXPLICITLY NOT AUTHORIZED:** module wiring, bootstrap, controller/service call-site or session producer.

### OD-C0-16 — Telemetry Activation Gate

**QUESTION:** What telemetry behavior is eligible?
**OPTIONS:** definitions plus emission; definitions/mappings only.
**SELECTED OPTION:** **Definitions and disabled mappings only.**
**RATIONALE:** Monitoring readiness is not execution authorization.
**CANONICAL CONSEQUENCE:** Metric/event definitions and tests may be added; runtime emission,
activation configuration and representative-session telemetry remain separately owner-gated.
**IMPLEMENTATION ELIGIBILITY:** Default-disabled test-only projection.
**EXPLICITLY NOT AUTHORIZED:** emission, activation or external delivery.

### OD-C0-17 — PII / Financial Payload Boundary

**QUESTION:** What payload boundary applies?
**OPTIONS:** unrestricted operational metadata; exact allowlist/minimization.
**SELECTED OPTION:** **Exact allowlist/minimization.**
**RATIONALE:** SYS-EVID-005, SYS-AUTH-012 and the PE-03 no-egress boundary are binding.
**CANONICAL CONSEQUENCE:** No tenant/client/case/person/debtor identifier in metric labels; no
monetary value, financial delta, raw exception, stack, free text, legal-document payload,
secret/token or arbitrary metadata in metrics/events. Opaque references are never metric labels
and are allowed only in explicitly typed trusted event fields.
**IMPLEMENTATION ELIGIBILITY:** Forbidden-field, PII and cardinality tests.
**EXPLICITLY NOT AUTHORIZED:** raw business identifiers or financial payloads.

### OD-C0-18 — External Egress

**QUESTION:** May PE-06C1 use an external telemetry destination?
**OPTIONS:** allowed; forbidden.
**SELECTED OPTION:** **FORBIDDEN.**
**RATIONALE:** PE-03 establishes an owner-controlled local/no-egress boundary.
**CANONICAL CONSEQUENCE:** PE-06C1 is local in-process preparation only.
**IMPLEMENTATION ELIGIBILITY:** Existing local test sink only.
**EXPLICITLY NOT AUTHORIZED:** cloud logger, remote collector, third-party sink or network egress.

## 3. V2 bounded event vocabulary

```text
event_version: 2
event_profile: SESSION_CONTROL

components:
  SESSION | PHASE | MANIFEST | COVERAGE | BOUNDARY | CONTROL | INSTRUMENTATION_HEALTH

operations:
  OBSERVE_SESSION | OBSERVE_PHASE | OBSERVE_MANIFEST | OBSERVE_COVERAGE |
  VERIFY_BOUNDARY | OBSERVE_CONTROL | OBSERVE_HEALTH | EVALUATE_EXECUTION_REQUEST

results:
  OBSERVED | STARTED | COMPLETED | ACCEPTED | SUCCESS | ERROR | TIMEOUT | CANCELLED | FAILED |
  REJECTED | NOT_AUTHORIZED | INVALID_STATE | UNAVAILABLE | BLOCKED | ABORTED | INVALIDATED

failure_codes:
  NONE | AUTHORIZATION_ABSENT | REQUEST_REJECTED | INVALID_LIFECYCLE_STATE |
  SOURCE_UNAVAILABLE | PHASE_PROCESSING_ERROR | PHASE_TIMEOUT | PHASE_CANCELLED |
  SESSION_ABORTED | SESSION_INVALIDATED | MANIFEST_ABSENT | MANIFEST_INVALID |
  MANIFEST_REJECTED | COVERAGE_MISSING | COVERAGE_INVALID | BOUNDARY_FAILED |
  BOUNDARY_NOT_EVALUATED | CONTROL_NOT_CONFIGURED | CONTROL_BLOCKED |
  CONTROL_UNAVAILABLE | INSTRUMENTATION_DEGRADED |
  INSTRUMENTATION_FAILED | INSTRUMENTATION_UNKNOWN | INSTRUMENTATION_NOT_CONFIGURED
```

The vocabulary is an exact allowlist. `event_type` values are those fixed in OD-C0-04,
OD-C0-06, OD-C0-08 and OD-C0-09 plus:

```text
ADR014_MANIFEST_STATE_OBSERVED
ADR014_COVERAGE_STATE_OBSERVED
ADR014_BOUNDARY_RESULT_OBSERVED
```

Execution-request result vocabulary is defined by OD-C0-05 but remains source-blocked and has no
PE-06C1 event type until a separately authorized producer exists.

### 3.1 V2 envelope fields

V2 preserves the PE-05A2 envelope family and adds only the mandatory profile discriminator:

```text
event_type
event_version = 2
event_profile = SESSION_CONTROL
timestamp
severity
component
operation
result
failure_code
canonical_sha_reference
environment_reference
session_reference?     (controlled opaque reference)
manifest_reference?    (controlled opaque reference)
trace_reference?       (controlled opaque reference)
evidence_reference?    (controlled opaque reference)
```

`canonical_sha_reference` is a strict lowercase 40-character SHA. `timestamp` is a caller-supplied
UTC ISO-8601 wall-clock observation and never a duration source. Environment and optional
correlation references are trusted controlled opaque references; they are never metric labels.
Missing/invalid mandatory context blocks event projection rather than producing `UNKNOWN` success.

### 3.2 Exact SESSION mapping

| Fact state | Event type | Severity | Result | Failure code |
|---|---|---|---|---|
| `DRAFT` | `ADR014_SESSION_REQUESTED` | `INFO` | `OBSERVED` | `NONE` |
| `ENVIRONMENT_VERIFIED` | `ADR014_SESSION_ENVIRONMENT_VERIFIED` | `INFO` | `SUCCESS` | `NONE` |
| `ACCESS_APPROVED` | `ADR014_SESSION_ACCESS_STATE_OBSERVED` | `INFO` | `OBSERVED` | `NONE` |
| `EXECUTION_AUTHORIZED` | `ADR014_SESSION_EXECUTION_AUTH_STATE_OBSERVED` | `INFO` | `OBSERVED` | `NONE` |
| `ACTIVE` | `ADR014_SESSION_STARTED` | `INFO` | `STARTED` | `NONE` |
| `CAPTURE_COMPLETE` | `ADR014_SESSION_CAPTURE_COMPLETED` | `INFO` | `COMPLETED` | `NONE` |
| `VALIDATION_PENDING` | `ADR014_SESSION_VALIDATION_STARTED` | `INFO` | `STARTED` | `NONE` |
| `VALIDATED` | `ADR014_SESSION_VALIDATED` | `INFO` | `SUCCESS` | `NONE` |
| `CLOSED` | `ADR014_SESSION_CLOSED` | `INFO` | `COMPLETED` | `NONE` |
| `REJECTED` | `ADR014_SESSION_REJECTED` | `CRITICAL` | `REJECTED` | `REQUEST_REJECTED` |
| `ABORTED` | `ADR014_SESSION_ABORTED` | `CRITICAL` | `ABORTED` | `SESSION_ABORTED` |
| `INVALIDATED` | `ADR014_SESSION_INVALIDATED` | `HARD_STOP` | `INVALIDATED` | `SESSION_INVALIDATED` |

All rows use component `SESSION` and operation `OBSERVE_SESSION`. The two authority-state rows
observe state only. They cannot prove the approval/authorization action without the future durable
audit record.

### 3.3 Exact PHASE mapping

| Fact condition | Event type | Severity | Result | Failure code |
|---|---|---|---|---|
| Any `STARTED` | `ADR014_PHASE_STARTED` | `INFO` | `STARTED` | `NONE` |
| `EXECUTION / COMPLETED / SUCCESS` | `ADR014_PHASE_COMPLETED` | `INFO` | `SUCCESS` | `NONE` |
| `EXECUTION / FAILED / ERROR` | `ADR014_PHASE_FAILED` | `CRITICAL` | `ERROR` | `PHASE_PROCESSING_ERROR` |
| `EXECUTION / FAILED / TIMEOUT` | `ADR014_PHASE_TIMEOUT` | `CRITICAL` | `TIMEOUT` | `PHASE_TIMEOUT` |
| `EXECUTION / FAILED / CANCELLED` | `ADR014_PHASE_CANCELLED` | `CRITICAL` | `CANCELLED` | `PHASE_CANCELLED` |
| `CAPTURE` or `VALIDATION / COMPLETED` | `ADR014_PHASE_COMPLETED` | `INFO` | `COMPLETED` | `NONE` |
| `CAPTURE` or `VALIDATION / FAILED` | `ADR014_PHASE_FAILED` | `CRITICAL` | `FAILED` | `PHASE_PROCESSING_ERROR` |

All rows use component `PHASE` and operation `OBSERVE_PHASE`. Duration is accepted only on a
terminal `COMPLETED` or `FAILED` fact and only through valid orchestrator-supplied projection
context. `STARTED` never observes a duration.

### 3.4 Exact MANIFEST, COVERAGE, BOUNDARY, CONTROL and HEALTH mapping

All MANIFEST facts use `ADR014_MANIFEST_STATE_OBSERVED / MANIFEST / OBSERVE_MANIFEST`.
Precedence is evidence validity first, then source state:

| Condition | Severity | Result | Failure code |
|---|---|---|---|
| source `ABSENT` | `HARD_STOP` | `BLOCKED` | `MANIFEST_ABSENT` |
| source `INVALID` | `HARD_STOP` | `FAILED` | `MANIFEST_INVALID` |
| validity `REJECTED` | `HARD_STOP` | `REJECTED` | `MANIFEST_REJECTED` |
| validity `INVALIDATED` | `HARD_STOP` | `INVALIDATED` | `SESSION_INVALIDATED` |
| validity `INCOMPLETE` | `CRITICAL` | `BLOCKED` | `SOURCE_UNAVAILABLE` |
| validity `VALID_WITH_WARNING` | `WARNING` | `OBSERVED` | `NONE` |
| validity `VALID` with other source states | `INFO` | `OBSERVED` | `NONE` |

All COVERAGE facts use `ADR014_COVERAGE_STATE_OBSERVED / COVERAGE / OBSERVE_COVERAGE`:

| Result | Severity | Event result | Failure code |
|---|---|---|---|
| `COMPLETE` | `INFO` | `SUCCESS` | `NONE` |
| `PARTIAL` | `WARNING` | `OBSERVED` | `NONE` |
| `MISSING` | `HARD_STOP` | `BLOCKED` | `COVERAGE_MISSING` |
| `INVALID` | `HARD_STOP` | `FAILED` | `COVERAGE_INVALID` |
| `NOT_EVALUATED` | `HARD_STOP` | `UNAVAILABLE` | `SOURCE_UNAVAILABLE` |

All BOUNDARY facts use `ADR014_BOUNDARY_RESULT_OBSERVED / BOUNDARY / VERIFY_BOUNDARY`:

| Result | Severity | Event result | Failure code |
|---|---|---|---|
| `PASS` | `INFO` | `SUCCESS` | `NONE` |
| `FAIL` | `HARD_STOP` | `FAILED` | `BOUNDARY_FAILED` |
| `NOT_EVALUATED` | `HARD_STOP` | `UNAVAILABLE` | `BOUNDARY_NOT_EVALUATED` |

All CONTROL facts use `ADR014_CONTROL_STATE_OBSERVED / CONTROL / OBSERVE_CONTROL`:

| Result | Severity | Event result | Failure code |
|---|---|---|---|
| `CONFIGURED` | `INFO` | `OBSERVED` | `NONE` |
| `NOT_CONFIGURED` | `HARD_STOP` | `BLOCKED` | `CONTROL_NOT_CONFIGURED` |
| `BLOCKED` | `HARD_STOP` | `BLOCKED` | `CONTROL_BLOCKED` |
| `UNAVAILABLE` | `HARD_STOP` | `UNAVAILABLE` | `CONTROL_UNAVAILABLE` |

All HEALTH facts use
`ADR014_INSTRUMENTATION_HEALTH_OBSERVED / INSTRUMENTATION_HEALTH / OBSERVE_HEALTH`:

| Result | Severity | Event result | Failure code |
|---|---|---|---|
| `HEALTHY` | `INFO` | `SUCCESS` | `NONE` |
| `DEGRADED` | `WARNING` | `OBSERVED` | `INSTRUMENTATION_DEGRADED` |
| `FAILED` | `HARD_STOP` | `FAILED` | `INSTRUMENTATION_FAILED` |
| `UNKNOWN` | `HARD_STOP` | `UNAVAILABLE` | `INSTRUMENTATION_UNKNOWN` |
| `NOT_CONFIGURED` | `HARD_STOP` | `UNAVAILABLE` | `INSTRUMENTATION_NOT_CONFIGURED` |

## 4. Exact fact-to-event decision matrix

| Fact family | Event profile / event type | Severity | Component / operation | Result / failure code | Metric projection | Event projection | Audit projection | Runtime source | Owner gate / disposition |
|---|---|---|---|---|---|---|---|---|---|
| `SESSION` | v2 `SESSION_CONTROL`; exact state events in OD-C0-04 | Exact §3.2 mapping; invalidated `HARD_STOP` | `SESSION / OBSERVE_SESSION` | Exact §3.2 mapping | Existing state gauge plus terminal/start counter rules below | `IMPLEMENTATION_ELIGIBLE` | Approval/authorization/terminal transitions `AUDIT_ONLY_FUTURE` | Future local session orchestrator | Default-disabled only; runtime owner gate |
| `PHASE` | v2; exact events in OD-C0-06 | started/completed `INFO`; failed/timeout/cancelled `CRITICAL` | `PHASE / OBSERVE_PHASE` | exact phase outcome and bounded failure code | Duration histogram only with valid supplied context | `IMPLEMENTATION_ELIGIBLE` | Future lifecycle audit only | Future local session orchestrator | Mapping eligible; timing/emission owner-gated |
| `MANIFEST` | v2 `ADR014_MANIFEST_STATE_OBSERVED` | Exact §3.4 mapping; mandatory invalid states `HARD_STOP` | `MANIFEST / OBSERVE_MANIFEST` | Exact §3.4 mapping | Existing manifest gauge | `IMPLEMENTATION_ELIGIBLE` | Approval/supersession/invalidation `AUDIT_ONLY_FUTURE` | Future local session orchestrator | Observation only; no approval authority |
| `COVERAGE` | v2 `ADR014_COVERAGE_STATE_OBSERVED` | Exact §3.4 mapping; missing/invalid/not-evaluated `HARD_STOP` | `COVERAGE / OBSERVE_COVERAGE` | Exact §3.4 mapping | Existing coverage gauge | `IMPLEMENTATION_ELIGIBLE` | `OUT_OF_SCOPE` | Future local session orchestrator | Default-disabled only |
| `BOUNDARY` | v2 `ADR014_BOUNDARY_RESULT_OBSERVED` | Exact §3.4 mapping; fail/not-evaluated `HARD_STOP` | `BOUNDARY / VERIFY_BOUNDARY` | `SUCCESS`, `FAILED` or `UNAVAILABLE` | Existing boundary counter | `IMPLEMENTATION_ELIGIBLE` | Boundary breach `AUDIT_ONLY_FUTURE` | Future local session orchestrator | Fail event does not itself mutate session |
| `CONTROL` | v2 `ADR014_CONTROL_STATE_OBSERVED` | Exact §3.4 mapping; non-configured/blocked/unavailable `HARD_STOP` | `CONTROL / OBSERVE_CONTROL` | Existing control result projected without authority inference | Existing kill-switch gauge only | `IMPLEMENTATION_ELIGIBLE` for observed state | Change events `AUDIT_ONLY_FUTURE` | Future control observer | Change behavior/emission owner-gated |
| `HEALTH` | v2 `ADR014_INSTRUMENTATION_HEALTH_OBSERVED` | Exact §3.4 mapping; failed/unknown/not-configured `HARD_STOP` | `INSTRUMENTATION_HEALTH / OBSERVE_HEALTH` | Exact PE-06B1 health result | Existing health gauge | `IMPLEMENTATION_ELIGIBLE` | `OUT_OF_SCOPE` | Future health observer | Never readiness/authority |

All seven families are decided. None is `UNDECIDED`. “Implementation eligible” means pure,
default-disabled projection and tests only.

## 5. Metric decisions for PE-06C1

| Metric | Type / labels / values | Producer and reset owner | Default-disabled and call-site status | Evidence value | Decision |
|---|---|---|---|---|---|
| `adr014_evidence_sessions_total` | Counter; label `result`; exact values `STARTED`, `COMPLETED`, `ABORTED`, `INVALIDATED`, `FAILED` | Future session orchestrator; counter has no reset | No registration/emission/call-site in PE-06C1 | Operational count only | `IMPLEMENTATION_ELIGIBLE`: ACTIVE→STARTED, CLOSED→COMPLETED, ABORTED→ABORTED, INVALIDATED→INVALIDATED, REJECTED→FAILED; intermediate states do not increment |
| `adr014_execution_requests_total` | Counter; label `result`; values OD-C0-05 | Future execution-request owner; no reset | Source absent; no call-site | Operational request count only | `BLOCKED / EXECUTION_REQUEST_SOURCE_ABSENT`; never inferred from session state |
| `adr014_evidence_phase_duration_seconds` | Histogram; labels `phase`, `result`; phase `EXECUTION/CAPTURE/VALIDATION`; result `COMPLETED/FAILED/TIMEOUT/CANCELLED` | Future session orchestrator supplies monotonic duration; no reset | Mapping/validation tests only; no timer/call-site | Performance input only | `IMPLEMENTATION_ELIGIBLE` with immutable supplied duration context; STARTED facts do not observe duration; execution `SUCCESS→COMPLETED`, `ERROR→FAILED` |
| `adr014_control_events_total` | Counter; canonical PE-05 labels remain `failure_code`, `severity` | Future control-event producer; no reset | Source absent; no call-site | Operational incident count only | `BLOCKED / CONTROL_EVENT_SOURCE_ABSENT`; CONTROL state facts continue to map only to `adr014_kill_switch_state` |

The task proposal's possible `control,result` labels are not adopted because the canonical PE-05
contract already fixes `failure_code,severity`. No existing metric is renamed or reinterpreted.

## 6. V1 compatibility and V2 profile tests

PE-06C1 must prove:

```text
PE-05A2 v1 event types unchanged
v1 serialization unchanged
v1 result/severity semantics unchanged
no v1 field removed or reinterpreted
v2 uses the same envelope family with event_version=2 and event_profile=SESSION_CONTROL
v1/v2 discrimination is exhaustive
v2 vocabulary and mappings are exact allowlists
forbidden PII/financial/free-text/arbitrary fields fail closed
all seven fact-family mappings are exhaustive
duration validation is deterministic and clock-free
disabled mode has no observable side effect
```

## 7. PE-06C1 exact eligible scope

PE-06C1 may implement only:

- the v2 `SESSION_CONTROL` contract in the existing envelope family without changing v1;
- pure exhaustive mapping for the seven existing PE-06B1 fact families;
- the session counter mapping;
- immutable phase-duration projection context and validation;
- the phase-duration histogram description mapping;
- explicit typed blockers for absent execution-request and control-event sources;
- unit, compatibility, security, cardinality, determinism and no-authority tests;
- a non-authoritative runbook and explicit CI selection if required.

PE-06C1 may not add a production call-site, registry registration, metric/event emission, runtime
clock, session orchestrator, timeout/cancellation behavior, control mutation, audit persistence,
writer activation, environment/dataset access, external egress, evidence execution, PR-11 or
runtime cutover.

## 8. Preserved receivable boundaries and remaining gaps

Fee/harç policy, official snapshot, frozen FX observation/conversion, partial reversal/refund,
exact UYAP mapping, UYAP submit activation, Collection writer, Ledger provenance and duplicate
allocator disposition remain outside this contract. `ADR-014-PR4-DEBT-A` and
`ADR-014-PR4-DEBT-B` remain unchanged; a non-authorizing pre-PR-11 risk order may be
`DEBT-B revalidation → DEBT-A revalidation`.

Remaining gaps after this decision contract:

```text
production session/control producers and call-sites
runtime metric/event emission and activation
execution-request producer
control-event producer
durable audit/correlation and evidence sealing
dashboard/alert implementation and delivery
local environment/session activation
approved manifest instance and dataset selection
measured local baseline and representative evidence
explicit owner PR-11 decision
```

## 9. Final disposition

```text
PE-06C0: CLOSED / CANONICAL / OWNER DECISIONS DEFINED after approved merge
Owner decisions: OD-C0-01 through OD-C0-18 COMPLETE
Fact-to-event matrix: 7/7 DECIDED
Primary verdict: DECISIONS_COMPLETE
Representative evidence: ABSENT / BLOCKING
CAN-CUT-02: OPEN / needs-owner-decision
PR-11: NOT AUTHORIZED
Runtime cutover: NOT AUTHORIZED
Next eligible task: ADR014-PE-06C1 — Default-Disabled Observation Contract Completion
```
