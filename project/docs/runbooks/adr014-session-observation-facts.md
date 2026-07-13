# ADR-014 Session / Control Observation Fact Contract

```text
Workstream: ADR014-PE-06B1
Contract version: 1
Status: implementation preparation / non-authoritative
Runtime activation: none
Representative evidence: not produced
PR-11: not authorized
Runtime cutover: not authorized
```

## Purpose

This contract provides immutable, deterministic and PII-safe facts for future ADR-014 local
evidence-session observability. It records only caller-supplied bounded facts. It does not
start a session, inspect a manifest, emit telemetry or infer readiness, evidence acceptance or
authority.

The contract preserves the existing boundaries of:

- PE-03 local evidence-session lifecycle;
- PE-04 sampling-manifest validity and coverage;
- PE-05 session, dataset and control observability vocabulary; and
- PE-06A disabled local evidence harness.

PE-06A `PREPARED` remains a preparation result only. It is not execution authorization,
evidence acceptance, PR-11 eligibility or runtime-cutover readiness.

## Implementation surface

Source:

```text
project/apps/api/src/scripts/adr014-session-observation-facts.ts
```

The module has no CLI entrypoint, `main()` function, Nest bootstrap, database access,
filesystem access, network access, scheduler, metric emitter, event emitter, audit writer or
persistence dependency. Importing it has no operational side effect.

## Producer ownership

Producer ownership is fixed by fact kind; callers cannot override it.

| Fact kind | Producer |
|---|---|
| `SESSION`, `PHASE`, `MANIFEST`, `COVERAGE`, `BOUNDARY` | `ADR014_LOCAL_EVIDENCE_SESSION_ORCHESTRATOR` |
| `CONTROL` | `ADR014_CONTROL_OBSERVER` |
| `HEALTH` | `ADR014_INSTRUMENTATION_HEALTH_OBSERVER` |

The producer names describe future fact ownership only. The contract creates none of those
runtime producers and activates no session or control.

## Bounded vocabularies

### Session and phase

PE-03 session states are preserved exactly:

```text
DRAFT
ENVIRONMENT_VERIFIED
ACCESS_APPROVED
EXECUTION_AUTHORIZED
ACTIVE
CAPTURE_COMPLETE
VALIDATION_PENDING
VALIDATED
CLOSED
REJECTED
ABORTED
INVALIDATED
```

Phases are `EXECUTION`, `CAPTURE` and `VALIDATION`. Phase results are `STARTED`, `COMPLETED`
and `FAILED`.

Execution outcomes are a separate dimension:

```text
SUCCESS
ERROR
TIMEOUT
CANCELLED
```

The factory accepts `EXECUTION + COMPLETED` only with `SUCCESS`. `ERROR`, `TIMEOUT` and
`CANCELLED` require `EXECUTION + FAILED` and the explicit phase-failure value `FAILED`.
Capture and validation facts never carry an execution outcome. A future session orchestrator
may separately record the PE-03 terminal state `ABORTED`; this fact contract does not infer the
transition.

### Manifest

Manifest source state:

```text
ABSENT / DRAFT / APPROVED / SUPERSEDED / INVALID
```

PE-04 evidence validity remains a separate field:

```text
VALID / VALID_WITH_WARNING / INCOMPLETE / REJECTED / INVALIDATED
```

The contract records an explicit pair without deciding manifest approval or creating a
manifest.

### Coverage and boundaries

Coverage categories are `REQUIRED`, `EDGE`, `CURRENCY` and `LIFECYCLE`. Results are:

```text
COMPLETE / PARTIAL / MISSING / INVALID / NOT_EVALUATED
```

Only the downstream canonical policy may interpret readiness. This contract performs no such
interpretation and does not convert missing or unevaluated coverage into success.

Boundary types are `TENANT`, `CLIENT`, `DATASET` and `ENVIRONMENT`. Results are `PASS`, `FAIL`
and `NOT_EVALUATED`.

### Control and health

Control results are:

```text
CONFIGURED / NOT_CONFIGURED / BLOCKED / UNAVAILABLE
```

They deliberately exclude `ENABLED` and `DISABLED`, which could be confused with a feature
flag, PE-06A harness state or runtime authority.

Instrumentation components are `METRIC`, `LOG`, `AUDIT` and `ALERT`. Health results are:

```text
HEALTHY / DEGRADED / FAILED / UNKNOWN / NOT_CONFIGURED
```

The module does not synthesize `HEALTHY`. It only creates a fact from an explicitly supplied,
bounded value and does not verify instrumentation.

## Security and data-minimization boundary

Observation facts contain only:

- contract version;
- fact kind;
- fixed producer owner; and
- bounded status/category fields for that fact kind.

They never contain session, manifest, tenant, client, case, debtor, creditor or person
identifiers; Git SHA; currency amount; principal, interest or fee payload; raw error; stack;
free text; arbitrary metadata; credential; token; or document content.

Opaque correlation references belong only to the separately governed structured-event layer.
They are not accepted or returned by this fact contract and are never metric labels.

Every factory copies allowlisted bounded primitives into a newly frozen object. Invalid or
extra runtime values are rejected with the constant error code
`INVALID_ADR014_OBSERVATION_FACT`; rejected values are never echoed.

## Determinism and immutability

Factories do not read the clock, random sources, environment variables, process state, Git or
external configuration. Equal inputs therefore produce equal serialized output. All exported
vocabulary collections, producer mappings and returned facts are frozen.

The producer-by-kind mapping uses a compile-time exhaustive `Record`; adding a fact kind
without assigning its producer fails TypeScript compilation. The discriminated fact union and
tests likewise require exhaustive handling.

## Example

```ts
const fact = createAdr014BoundaryObservationFact('TENANT', 'NOT_EVALUATED');
```

The resulting fact reports only a bounded observation. It does not verify a boundary, emit a
metric or event, authorize access, start evidence collection or change runtime behavior.

## Explicit non-goals

- metric or structured-event emission;
- session, manifest, dataset or evidence creation;
- real-data access or representative execution;
- audit correlation, writer activation or persistence;
- dashboard or alert implementation;
- financial calculation, readiness or blocker changes;
- consumer switch, PR-11 implementation or runtime cutover.
