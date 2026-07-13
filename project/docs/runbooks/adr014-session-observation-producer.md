# ADR014-PE-06B2 — Session / Control Observation Producer Preparation

## Status and authority

This contract is preparation-only and default-disabled. It does not start an evidence session, access a dataset, enable a control, emit production telemetry, persist an audit record, accept evidence, authorize PR-11, or authorize runtime cutover.

PE-06B1 remains the only observation-fact contract. PE-06B2 reuses its seven factories and does not add or reinterpret a fact family, producer identity, field, or bounded value.

## Producer boundary

The pure producer path is:

```text
typed bounded input
→ PE-06B1 factory
→ immutable observation fact
→ bounded metric/event projection
→ default NO-OP or test-only in-memory sink
```

`createAdr014ObservationProducer()` defaults to `DISABLED`. The only non-disabled configuration is explicitly named `TEST_ONLY`; there is no environment, URL, query parameter, frontend flag, developer mode, clock, or random fallback. There is no production call-site or module wiring.

In `DISABLED` mode, input is not inspected and no fact, metric projection, event projection, writer call, persistence, or external action occurs.

## Mapping matrix

| Fact | Metric projection | Structured event projection | Audit | Evidence |
| --- | --- | --- | --- | --- |
| `SESSION` | `adr014_evidence_session_state{session_state}` | `BLOCKED` | `OUT_OF_SCOPE` | `OUT_OF_SCOPE` |
| `PHASE` | `BLOCKED / PHASE_DURATION_SOURCE_ABSENT` | `BLOCKED` | `OUT_OF_SCOPE` | `OUT_OF_SCOPE` |
| `MANIFEST` | `adr014_dataset_manifest_state{source_state,evidence_validity}` | `BLOCKED` | `OUT_OF_SCOPE` | `OUT_OF_SCOPE` |
| `COVERAGE` | `adr014_dataset_coverage_state{coverage_category,result}` | `BLOCKED` | `OUT_OF_SCOPE` | `OUT_OF_SCOPE` |
| `BOUNDARY` | `adr014_boundary_verification_total{boundary_type,result}` | `BLOCKED` | `OUT_OF_SCOPE` | `OUT_OF_SCOPE` |
| `CONTROL` | `adr014_kill_switch_state{result}` | `BLOCKED` | `OUT_OF_SCOPE` | `OUT_OF_SCOPE` |
| `HEALTH` | `adr014_instrumentation_health{component,result}` | `BLOCKED` | `OUT_OF_SCOPE` | `OUT_OF_SCOPE` |

The phase contract has no duration source, so a duration value is never synthesized. The canonical PE-05A2 structured-event vocabulary describes shadow comparison only. Session/control facts therefore remain explicitly blocked with `PE05A2_EVENT_VOCABULARY_UNAVAILABLE`; PE-06B2 does not create a second event system or extend the existing envelope.

Mapped values are projection descriptions only. They are not registered with Prometheus and are not emitted. Gauge reset/stale-state ownership remains with a future authorized runtime producer.

## Security and failure behavior

Inputs accept only the exact bounded fields required by PE-06B1. Entity identifiers, opaque references, monetary values, raw exceptions, free text, and metadata bags are rejected rather than ignored. Metric labels are drawn only from canonical bounded enums.

Invalid input and sink failures return stable failure codes. No exception detail is copied into output. Observation preparation failure cannot change financial calculation, readiness, blockers, display authority, or runtime authority.

## Remaining owner gates

- Real session/control producers and call-sites: not implemented.
- Runtime telemetry enablement: owner-gated.
- Structured session/control event vocabulary: unresolved and explicitly blocked.
- Phase timing source and duration measurement: absent.
- Audit/evidence projection and persistence: out of scope.
- Representative evidence: absent and blocking.
- PR-11 and runtime cutover: not authorized.
