# ADR014-PE-06C1 — Default-Disabled Observation Contract Completion

## Status and authority

This contract is preparation-only and default-disabled. It does not start an evidence session, access a dataset, enable a control, emit production telemetry, persist an audit record, accept evidence, authorize PR-11, or authorize runtime cutover.

PE-06B1 remains the only observation-fact contract. PE-06C1 reuses its seven factories and does
not add or reinterpret a fact family, producer identity, field, or bounded value. PE-05A2 v1
serialization and semantics remain immutable. The expanded preparation projection is explicitly
producer contract version `2`; this is independent of the unchanged PE-06B1 fact version `1`.

## Producer boundary

The pure producer path is:

```text
typed bounded input
→ PE-06B1 factory
→ immutable observation fact
→ bounded metric projection + same-family v2 SESSION_CONTROL event projection
→ default NO-OP or test-only in-memory sink
```

`createAdr014ObservationProducer()` defaults to `DISABLED`. The only non-disabled configuration is explicitly named `TEST_ONLY`; there is no environment, URL, query parameter, frontend flag, developer mode, clock, or random fallback. There is no production call-site or module wiring.

In `DISABLED` mode, input is not inspected and no fact, metric projection, event projection, writer call, persistence, or external action occurs.

## Mapping matrix

| Fact | Metric projection | Structured event projection | Audit | Evidence |
| --- | --- | --- | --- | --- |
| `SESSION` | Existing state gauge plus bounded `adr014_evidence_sessions_total{result}` for start/terminal states | v2 exact state event | `OUT_OF_SCOPE` | `OUT_OF_SCOPE` |
| `PHASE` | `adr014_evidence_phase_duration_seconds{phase,result}` only for a terminal fact with supplied finite monotonic duration | v2 exact phase event | `OUT_OF_SCOPE` | `OUT_OF_SCOPE` |
| `MANIFEST` | Existing manifest gauge | v2 `ADR014_MANIFEST_STATE_OBSERVED` | `OUT_OF_SCOPE` | `OUT_OF_SCOPE` |
| `COVERAGE` | Existing coverage gauge | v2 `ADR014_COVERAGE_STATE_OBSERVED` | `OUT_OF_SCOPE` | `OUT_OF_SCOPE` |
| `BOUNDARY` | Existing boundary counter | v2 `ADR014_BOUNDARY_RESULT_OBSERVED` | `OUT_OF_SCOPE` | `OUT_OF_SCOPE` |
| `CONTROL` | Existing kill-switch gauge only | v2 `ADR014_CONTROL_STATE_OBSERVED` | `OUT_OF_SCOPE` | `OUT_OF_SCOPE` |
| `HEALTH` | Existing health gauge | v2 `ADR014_INSTRUMENTATION_HEALTH_OBSERVED` | `OUT_OF_SCOPE` | `OUT_OF_SCOPE` |

The v2 envelope uses `event_version=2` and `event_profile=SESSION_CONTROL` in the existing ADR-014
event family. A caller must supply strict lowercase canonical SHA, UTC timestamp and bounded
environment context. Missing or invalid context produces a typed `BLOCKED_WITH_REASON`; no
`UNKNOWN` success is synthesized. The mapper never reads a clock.

Phase duration is accepted only for terminal phase facts as a caller-supplied finite number of
monotonic seconds. `STARTED` is `VOCABULARY_ONLY` for duration, and absent, negative, NaN or
infinite duration fails closed. No timer or orchestrator is implemented here.

`adr014_execution_requests_total` remains
`BLOCKED_WITH_REASON / EXECUTION_REQUEST_SOURCE_ABSENT`. `adr014_control_events_total` remains
`BLOCKED_WITH_REASON / CONTROL_EVENT_SOURCE_ABSENT`. Neither is inferred from existing facts.

Mapped values are projection descriptions only. They are not registered with Prometheus and are not emitted. Gauge reset/stale-state ownership remains with a future authorized runtime producer.

## Security and failure behavior

Inputs accept only the exact bounded fields required by PE-06B1. Entity identifiers, opaque references, monetary values, raw exceptions, free text, and metadata bags are rejected rather than ignored. Metric labels are drawn only from canonical bounded enums.

Invalid input and sink failures return stable failure codes. No exception detail is copied into output. Observation preparation failure cannot change financial calculation, readiness, blockers, display authority, or runtime authority.

## Remaining owner gates

- Real session/control producers and call-sites: not implemented.
- Runtime telemetry enablement: owner-gated.
- Production session/control event emission and call-sites: not authorized.
- Runtime phase timing measurement/orchestrator: absent and owner-gated.
- Execution-request and control-event metric producers: source absent.
- Audit/evidence projection and persistence: out of scope.
- Representative evidence: absent and blocking.
- PR-11 and runtime cutover: not authorized.
