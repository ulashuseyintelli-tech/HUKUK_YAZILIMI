# ADR-014 PE-06E Local Observability Surfaces

## Status and boundary

```text
Status: PREPARATION-ONLY
Default mode: DISABLED
Active mode: TEST_ONLY
Locality: OWNER_CONTROLLED_LOCAL_ONLY
Runtime emission: NONE
Persistence: NOT_CONFIGURED
External delivery: NOT_CONFIGURED
```

This contract completes the local, default-disabled preparation surface for ADR-014 audit
correlation, evidence references, dashboard queries, and alert rules. It does not start an
evidence session, read data, emit telemetry, persist audit records, deliver alerts, or grant
execution, financial, evidence, primary-display, PR-11, or runtime-cutover authority.

## Audit reference chain

The pure `appendAudit` operation creates an immutable reference chain from caller-supplied,
bounded, PII-safe facts. Each entry has a monotonic sequence, parent reference, canonical SHA,
session reference, caller-supplied UTC timestamp, and deterministic SHA-256 audit reference.
The operation validates the complete supplied chain before appending and fails closed for
tampering, discontinuity, malformed input, or backdated entries.

The chain is append-only at contract level. It is returned in memory and is not an `AuditLog`,
durable audit record, business fact, or legal evidence record. No writer is activated.

## Evidence reference sealing

The pure `sealEvidence` operation accepts exactly one reference and digest for each required
index member:

1. metric window,
2. dashboard snapshot,
3. alert inventory,
4. audit chain.

It validates controlled reference formats, exact SHA-256 digest formats, audit-chain integrity,
canonical SHA continuity, and session continuity. It then prepares a deterministic immutable
reference seal. A superseding seal may point to a prior seal; it never mutates or deletes the
prior reference.

`REFERENCE_SEALED` means only that the supplied reference index was normalized and sealed by
this pure contract. Artifact bytes and caller-supplied digests are not independently fetched or
verified. The result is explicitly `authority: NONE`, `official: false`, and `persisted: false`.
It is a non-official derived reference contract, not official snapshot or evidence acceptance.

## Local monitoring surface

The contract exposes four inert, read-only dashboard sections:

- session overview,
- financial integrity,
- performance and reliability,
- evidence operations.

Queries reference only existing PE-05 and PE-06 metric names. They are abstract query
descriptors, not deployed PromQL, database queries, dashboards, or runtime call-sites.

Alert descriptors are rule-only and have `delivery: NOT_CONFIGURED`. They add no notification
channel, evaluation scheduler, numeric threshold, escalation route, or authority. The
financial-discrepancy rule preserves the canonical zero-cent requirement: any observed non-zero
financial discrepancy is a hard-stop signal. Evaluation windows and delivery remain separately
owner-gated.

`adr014_execution_requests_total` and `adr014_control_events_total` remain absent because a
canonical execution/control producer does not exist. Absence is not reported as zero or healthy.

## Safe use

Production/default construction returns `DISABLED` before inspecting caller input. `TEST_ONLY`
may be used only for deterministic contract tests or later separately authorized local
preparation. It does not authorize representative evidence or local real-data access.

## Remaining gates

```text
Representative evidence: ABSENT / BLOCKING
CAN-CUT-02: OPEN / needs owner decision
PR-11: NOT AUTHORIZED
Runtime cutover: NOT AUTHORIZED
Official snapshot / evidence lifecycle: OWNER-GATED
Audit persistence and writer activation: NOT CONFIGURED
Dashboard deployment and alert delivery: NOT CONFIGURED
```

After PE-06E closure, the next step is `OWNER DECISION REQUIRED — Representative Evidence
Preparation`. No evidence execution or runtime activation follows automatically.
