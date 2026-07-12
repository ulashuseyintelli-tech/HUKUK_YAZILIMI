# ADR-014 Metrics, Audit, Dashboard and Alert Operational Contract

**Workstream:** `ADR014-PE-05`
**Status:** `DEFINED / CANONICAL`
**Primary verdict:** `OPERATIONAL_CONTRACT_READY`
**Authority:** Docs/governance operational-observability contract only
**Runtime cutover:** `NOT AUTHORIZED`

## 1. Purpose and authority boundary

This contract joins the canonical zero-cent discrepancy rule with the PE-02 evidence
lifecycle, PE-03 owner-controlled local evidence-session boundary and PE-04 representative
dataset/sampling contract. It defines the observability contract required before a future
representative execution can produce reviewable evidence.

It does not implement monitoring, create a dashboard, activate an alert, open an evidence
session, read or materialize a dataset, measure a baseline, produce representative evidence,
authorize PR-11 or authorize runtime cutover. Metrics, logs, audit events, dashboards and
alerts are operational evidence surfaces; none is legal-balance or financial authority.

The following remain binding:

- comparable financial differences require exact zero-cent equality;
- every non-zero financial discrepancy fails closed;
- mandatory `UNKNOWN`, `NOT_COMPARABLE`, `UNAVAILABLE` or missing evidence fails closed;
- `Projection Ownership / Derived Read Contract` is not legal-balance authority;
- the canonical calculation remains `SHADOW_ONLY` and the legacy production consumer remains
  primary until a separately authorized cutover;
- representative execution, PR-11 and runtime cutover require their own explicit owner gates.

## 2. Canonical inputs

This contract is subordinate to the System Constitution, ratified Debtor and Receivable
Governance, TM3/DBIND boundaries, ADR-014, the canonical split plan, Cutover Authorization
Policy and PE-01 through PE-04 contracts. Draft, proposed, owner-review or unmerged PR content
does not create authority.

The repository capability inventory below was verified on canonical baseline
`d755bec1418a718eb4a537d69968799384a843e5`. PR #1159 remains open, on an older base, held for
owner review and non-canonical; its code is not counted as capability or evidence.

## 3. Current capability inventory

| Capability | Classification | Verified current state | PE-05 disposition |
|---|---|---|---|
| Prometheus registry and `/metrics` aggregation | `CANONICAL_AND_IMPLEMENTED` | Global `PROM_REGISTRY`, `MetricsRegistryModule` and metrics aggregator are wired | Reuse; do not create a second registry |
| HTTP request/error counters | `PARTIAL` | `http_responses_total{status,method}` exists; no ADR-014 success/error/timeout family | Extend only in a separately authorized implementation task |
| Latency timer infrastructure | `PARTIAL` | ADR-014 total shadow duration histogram exists; component and evidence-phase timers do not | Existing histogram is retained; missing families are prerequisites |
| ADR-014 shadow comparison metrics | `CANONICAL_AND_IMPLEMENTED` | Request, duration, comparison and readiness-blocker families are registered | Preserve names and bounded labels; add no duplicate family |
| PE-01A bounded metrics coverage | `PARTIAL` | Zero-cent classifier outcomes are observable through four families, but session/dataset/control coverage is absent | Extend the existing provider/registry in a future narrow implementation |
| Structured operational logging | `PARTIAL` | Nest logging and a sanitized server `ErrorLog` path exist; no typed ADR-014 event envelope | ADR-014 envelope is an `IMPLEMENTATION_PREREQUISITE` |
| Generic operational audit sink | `CANONICAL_AND_IMPLEMENTED` | `AuditService`/`AuditLog` exists for generic audit records | Reuse only after ADR-014 event and durability semantics are proven |
| ADR-014 operational audit chain | `ABSENT` | No durable session/manifest/metric/alert correlation writes exist | `IMPLEMENTATION_PREREQUISITE` |
| Request correlation | `PARTIAL` | Global request ID middleware propagates an opaque request reference into server error records | Session/evidence correlation remains absent |
| Durable ADR-014 correlation chain | `ABSENT` | No durable SHA → session → manifest → evidence reference index | `IMPLEMENTATION_PREREQUISITE` |
| Generic Grafana dashboard | `CANONICAL_AND_IMPLEMENTED` | Guard dashboard/provisioning exists outside ADR-014 | Infrastructure precedent only; not ADR-014 evidence |
| ADR-014 operational dashboard | `ABSENT` | Case-level shadow-diff UI is diagnostic, not the required operational dashboard | `IMPLEMENTATION_PREREQUISITE` |
| Generic Prometheus alert rules | `CANONICAL_AND_IMPLEMENTED` | Redrive/simulation/guard rule groups exist outside ADR-014 | Infrastructure precedent only |
| ADR-014 alert rules | `ABSENT` | No ADR-014 rule group or hard-stop taxonomy is implemented | `IMPLEMENTATION_PREREQUISITE` |
| Alert delivery configuration | `PARTIAL` | Alertmanager file has placeholder receivers and unrelated routes; deployment/delivery is not verified | ADR-014 role routing is `OPERATIONS_GATED` |
| ADR-014 evidence package/manifest instance | `ABSENT` | Canonical contracts exist; no package, seal or manifest instance exists | Future authorized execution prerequisite |
| Retention/immutable evidence reference | `PARTIAL` | Governance defines versioning/supersession; no ADR-014 durable sealing implementation | Storage/delivery choice is owner/operations-gated |
| Frontend fallback telemetry | `NON_DURABLE` | In-memory counters, `console` events and telemetry TODOs exist | Must not be used as evidence or monitoring source |
| Settings performance screen | `UNSAFE` | Values are mock data | Must not be represented as measured telemetry |
| Calc-preview metrics/trace/bundle facilities | `OUT_OF_SCOPE` | Separate bounded context, process-memory surfaces and different authority | No implicit reuse or authority transfer |
| Console/TODO telemetry gaps | `NON_DURABLE` | Frontend shadow errors and fallback alerts use `console`; monitoring delivery TODOs remain | Replace only through a separate authorized task |

The inventory describes current implementation, not approval to modify it. Generic capability
does not become ADR-014 evidence merely because a compatible technology exists.

## 4. Metric catalogue

### 4.1 Rules shared by all metric families

- Metric names use the `adr014_` prefix.
- Counters are monotonic; state is represented by a gauge with exactly one active bounded state.
- Histogram percentiles are derived by the monitoring query. `p50`, `p95` and `p99` are never
  label values and are not separately written as raw metric samples.
- Existing metric names are retained. A future implementation maps the contract to the existing
  provider and registry and must not create parallel or semantically duplicate series.
- A missing, stale or incomplete mandatory metric window is evidence failure, not a zero or pass.

### 4.2 Session metrics

| Metric family | Type | Required bounded labels | Meaning |
|---|---|---|---|
| `adr014_evidence_sessions_total` | Counter | `result` | session start, completion, abort and invalidation counts |
| `adr014_evidence_session_state` | Gauge | `session_state` | one-hot current state for the active authorized session |
| `adr014_evidence_phase_duration_seconds` | Histogram | `phase`, `result` | execution, capture and validation duration |

`result` is bounded to `STARTED`, `COMPLETED`, `ABORTED`, `INVALIDATED`, `FAILED`. `phase` is
bounded to `EXECUTION`, `CAPTURE`, `VALIDATION`. A session UUID is never a label.

### 4.3 Request and performance metrics

| Metric family | Type | Required bounded labels | Meaning |
|---|---|---|---|
| `adr014_shadow_requests_total` | Counter | existing bounded `outcome` | existing request count; retained |
| `adr014_shadow_request_duration_seconds` | Histogram | existing bounded `outcome` | existing total shadow request duration; retained |
| `adr014_execution_requests_total` | Counter | `result` | success, error and timeout counts without inventing a second total |
| `adr014_calculation_duration_seconds` | Histogram | `component`, `result` | legacy, canonical and shadow-comparison durations |

`component` is bounded to `LEGACY`, `CANONICAL`, `SHADOW_COMPARE`. p50/p95/p99 are computed
from histograms over the sealed metric window.

### 4.4 Comparison and readiness metrics

| Metric family | Type | Required bounded labels | Meaning |
|---|---|---|---|
| `adr014_shadow_comparisons_total` | Counter | existing `financial_field`, `comparison_result`, `severity` | existing exact/non-zero/unknown/not-comparable/unavailable comparison outcomes |
| `adr014_financial_discrepancies_total` | Counter | `financial_field`, `discrepancy_code` | explicit non-zero financial discrepancy count |
| `adr014_missing_evidence_total` | Counter | `failure_code` | mandatory comparison/evidence absence |
| `adr014_integrity_failures_total` | Counter | `integrity_type`, `result` | currency and authority integrity failures |
| `adr014_readiness_blockers_total` | Counter | existing bounded `blocker_category` | existing blocker count; retained |
| `adr014_primary_display_safety_total` | Counter | `result` | `safeForPrimaryDisplay` true/false distribution |

The explicit discrepancy family must reconcile with non-zero outcomes in the existing
comparison family. A discrepancy can never be downgraded by a warning-only metric.

### 4.5 Dataset and coverage metrics

| Metric family | Type | Required bounded labels | Meaning |
|---|---|---|---|
| `adr014_dataset_manifest_state` | Gauge | `source_state`, `evidence_validity` | manifest attachment and validity state |
| `adr014_dataset_coverage_state` | Gauge | `coverage_category`, `result` | required, edge, currency and lifecycle coverage |
| `adr014_boundary_verification_total` | Counter | `boundary_type`, `result` | tenant/client boundary verification result |

Coverage state reports contract categories only; it never exposes tenant, client, case,
person or manifest instance identifiers.

### 4.6 Operational control metrics

| Metric family | Type | Required bounded labels | Meaning |
|---|---|---|---|
| `adr014_kill_switch_state` | Gauge | `result` | configured control state; not activation authority |
| `adr014_control_events_total` | Counter | `failure_code`, `severity` | configuration drift, SHA mismatch, source-write attempt, egress violation, audit-reference failure, capture failure and secret exposure |
| `adr014_instrumentation_health` | Gauge | `component`, `result` | metric/log/audit/alert capture health |

## 5. Bounded-cardinality and PII contract

Allowed labels are bounded enums such as `result`, `severity`, `discrepancy_code`,
`financial_field`, `readiness_state`, `source_state`, `session_state`, `evidence_validity`,
`currency_integrity`, `authority_integrity`, `environment_type`, `coverage_category` and
`failure_code`.

Metric labels must not contain tenant/client/case/debtor/person IDs, file or document numbers,
session UUIDs, database keys, monetary values, raw error text, stack traces, free text, email,
phone, address, identity number, credential or token. Correlation is never solved through a
high-cardinality metric label.

## 6. Structured operational logging

Every ADR-014 operational event uses a versioned, typed envelope:

```text
event_type
event_version
timestamp
severity
component
operation
result
failure_code
canonical_sha_reference
environment_reference
session_reference
manifest_reference
trace_reference
evidence_reference
```

References are controlled opaque values. Logs contain no raw case data, party identity,
debtor/client name, address, phone/email, TCKN/VKN, legal document, full financial payload,
secret/credential/token or uncontrolled free text. Required monetary detail belongs in the
authorized evidence artifact and is reached through a controlled evidence reference.

Operational logs may support diagnosis, but are not by themselves legal/financial acceptance
evidence. They cannot silently correct results, suppress discrepancies or substitute missing
audit/evidence records. This contract authorizes no external telemetry endpoint, data export,
remote processing or third-party delivery; the PE-03 local/no-egress boundary remains binding.

## 7. Correlation and traceability

The durable reference chain is:

```text
Canonical SHA
→ Environment ID
→ Session ID
→ Dataset Manifest
→ Execution
→ Metric Window
→ Log Events
→ Audit Events
→ Alert Events
→ Evidence Package
→ Validation
→ Sign-off
```

Metrics use bounded labels only. Logs use controlled opaque references. Audit records hold the
durable state-transition/reference chain. The sealed evidence package contains the complete
authorized reference index. Request IDs can connect a request to logs but do not replace the
session/evidence chain. Current durable ADR-014 correlation is absent and is an
`IMPLEMENTATION_PREREQUISITE`.

## 8. Operational audit

Operational audit is separate from diagnostic logging and from legal evidence. The following
events require durable audit:

- access approval and execution authorization;
- session activation, abort and invalidation;
- canonical SHA pinning and dataset-manifest attachment;
- configuration and kill-switch changes;
- source-write and external-egress detection;
- evidence-capture completion, validation, rejection and acceptance;
- retention and destruction/retirement decisions;
- explicit PR-11 owner decision.

Each record contains actor role, action, target reference, previous state, new state, reason
code, timestamp, canonical SHA, session/environment reference and authorization reference.
Audit overwrite, silent deletion, backdated mutation, unattributed state change and
free-text-only authorization are prohibited. Corrections use append-only supersession. This
contract does not implement or migrate audit storage.

## 9. Dashboard contract

### 9.1 Session Overview

Shows environment, pinned canonical SHA, session state, dataset-manifest status, execution
window, validation status, evidence validity and owner-gate status.

### 9.2 Financial Integrity

Shows exact-match rate, non-zero discrepancy count and field breakdown, unknown/not-comparable/
unavailable counts, currency and authority failures, readiness blockers and
`safeForPrimaryDisplay` distribution. Any non-zero financial discrepancy is an unambiguous,
dominant hard-stop indicator; it cannot be hidden by an aggregate success rate.

### 9.3 Performance and Reliability

Shows request volume, derived p50/p95/p99, error and timeout rates, legacy/canonical/shadow
duration comparison, available resource saturation indicators and metric-capture health.

### 9.4 Evidence and Operations

Shows coverage, audit completeness, alert history, active incidents, kill-switch state,
evidence-package status, missing sign-offs and retention state.

A green dashboard is not PR-11 authorization. A safe dashboard is not runtime cutover
authorization. A dashboard snapshot alone is not representative evidence.

## 10. Operational readiness state model

| State | Meaning and permission boundary |
|---|---|
| `NOT_CONFIGURED` | required observability contract has no verified implementation |
| `INSTRUMENTATION_INCOMPLETE` | one or more mandatory metrics/log/audit/alert paths are absent or unverified |
| `READY_FOR_DRY_VALIDATION` | contract is implemented sufficiently for synthetic/no-data validation only |
| `READY_FOR_BASELINE_MEASUREMENT` | dry validation and capture completeness passed; no measurement authority implied |
| `BASELINE_IN_PROGRESS` | separately authorized baseline window is active |
| `BASELINE_COMPLETE` | metric window is closed and complete; validation still required |
| `REPRESENTATIVE_EXECUTION_BLOCKED` | access, execution, environment, manifest or control gate is missing |
| `REPRESENTATIVE_EXECUTION_AUTHORIZED` | explicit owner execution authorization exists for the pinned session only |
| `EVIDENCE_INCOMPLETE` | required package item/reference/sign-off is absent |
| `EVIDENCE_VALIDATED` | technical and legal/financial validation passed; no PR-11 approval implied |
| `EVIDENCE_REJECTED` | evidence is invalid, contradictory or fails a mandatory criterion |
| `OWNER_REVIEW_REQUIRED` | complete validated package awaits explicit owner decision |

Transitions are audit-backed. Failure or missing evidence moves the session to a blocking state;
it never defaults to readiness. Monitoring ready is not execution authorized; execution
authorized is not evidence valid; evidence valid is not PR-11 approved; PR-11 approved is not
runtime cutover approved.

## 11. Alert taxonomy

| Severity | Meaning |
|---|---|
| `INFO` | state transition or non-actionable operational record |
| `WARNING` | optional/non-financial degradation that does not invalidate mandatory evidence |
| `CRITICAL` | urgent operational failure whose session/evidence effect is deterministically assessed |
| `HARD_STOP` | mandatory control, financial-integrity or authority failure; execution/evidence cannot proceed |

`HARD_STOP` includes non-zero financial discrepancy; unknown mandatory financial comparison;
mandatory `NOT_COMPARABLE`; currency/authority-integrity failure; canonical SHA mismatch;
unauthorized execution; source write; external egress; secret exposure; audit-chain failure;
and missing dataset manifest.

`WARNING` is limited to near-capacity condition, optional telemetry degradation, non-critical
dashboard delay or optional diagnostic metadata absence. It may never classify a non-zero
financial difference or missing mandatory evidence.

## 12. Alert routing

Every alert definition includes alert code, severity, trigger, bounded deduplication key,
owner, primary recipient role, escalation role, required response, acknowledgement requirement,
resolution evidence, session impact and evidence impact.

| Alert domain | Primary role | Escalation role | Required routing rule |
|---|---|---|---|
| Metric/service/configuration/comparison failure | Technical Reviewer / Operator | Operations, then Owner for hard stop | preserve raw event reference and assess capture validity |
| Session/capacity/timeout/delivery/kill-switch event | Operations | Owner | stop or contain session when required |
| Financial discrepancy/evidence-acceptance blocker | Legal / Financial Reviewer | Owner | hard stop; no tolerance or suppression |
| Unauthorized access/egress/secret/data-boundary failure | Privacy / Access Reviewer | Owner | contain, invalidate and preserve audit evidence |
| Any `HARD_STOP` or authorization decision | Owner | none; owner decision is final gate | explicit acknowledgement and resolution evidence required |

This is role routing only. It chooses no email, telephone, SaaS receiver or third-party service.
Delivery channel configuration is an owner/operations decision.

## 13. Alert delivery and failure semantics

Alert lifecycle states are `GENERATED`, `QUEUED`, `DELIVERED`, `ACKNOWLEDGED`, `RESOLVED`,
`FAILED_DELIVERY` and `SUPPRESSED_BY_POLICY`. Generation and delivery are separate facts.

Hard-stop delivery failure, unknown alert owner, missing escalation path, unacknowledged active
hard stop and an alert event without an audit reference are fail-closed. Policy suppression
must be explicit, bounded, audited and cannot suppress a financial discrepancy or mandatory
evidence failure. Resolution requires evidence; a closed notification alone is not resolution.

## 14. Baseline monitoring standard

A future authorized baseline window records canonical SHA, environment ID, session ID, dataset
manifest, execution window, request volume, warm-up period, measurement period, derived
p50/p95/p99, error count/rate, timeout count/rate, resource summary, metric completeness and
observed incidents.

The canonical performance criteria are referenced without change:

```text
p95 regression <= 20%
p99 regression <= 30%
material error/timeout increase = 0
```

This contract neither measures a baseline nor invents a numeric meaning for `material`.
Measurement requires a separately authorized owner-controlled local evidence session and
approved manifest. Incomplete metric windows are invalid, not passing.

## 15. Retention and integrity

No arbitrary retention duration is created here.

| Artifact | Owner | Mutation/supersession | Retirement/destruction | Evidence value |
|---|---|---|---|---|
| Metric-window export/reference | Operations | sealed window immutable; corrections supersede | owner/operations decision, audit required | operational measurement input |
| Structured-log reference | Operations | source event immutable; derived index may supersede | owner/operations policy, audit required | diagnostic support only |
| Audit record | Governance/audit owner | append-only; overwrite forbidden | explicit owner decision and preserved tombstone/reference | durable state/authorization evidence |
| Alert event | Alert owner/Operations | lifecycle append-only | owner/operations policy with audit trail | incident and response evidence |
| Dashboard snapshot/reference | Dashboard owner | snapshot immutable; newer snapshot supersedes | tied to evidence-package policy | presentation reference, not standalone evidence |
| Evidence package | Owner/evidence custodian | immutable after seal; versioned supersession only | explicit retention/retirement decision | review/sign-off package |

Canonical governance records retain their existing append-only rules. Storage technology,
retention periods and destruction mechanism remain owner/operations-gated.

## 16. Evidence-package integration

The PE-02 monitoring sub-package contains metric definitions and versions, metric-window
references, dashboard snapshot/reference, alert inventory, triggered alerts, delivery and
acknowledgement status, audit-chain references, observed discrepancies, baseline comparison,
instrumentation gaps, validation result and reviewer sign-off.

The package must also identify missing artifacts explicitly. A metric export or screenshot
alone is not representative evidence. Package validity is determined separately and is
fail-closed when a mandatory reference, audit link, signature or capture is absent.

## 17. Ownership matrix

Legend: `A` accountable, `R` responsible, `C` consulted, `I` informed, `—` no authority.

| Responsibility | Owner | Operator / Developer | Technical Reviewer | Operations | Legal / Financial | Privacy / Access | Observer |
|---|---:|---:|---:|---:|---:|---:|---:|
| Metric definition | A | R | R | C | C | C | I |
| Metric implementation approval | A | R | R | C | C | C | I |
| Dashboard ownership | A | C | C | R | C | C | I |
| Alert ownership/routing | A | C | C | R | C | C | I |
| Alert acknowledgement | A | R | C | R | C | C | I |
| Incident response | A | R | C | R | C | C | I |
| Audit validation | A | C | R | R | C | C | I |
| Evidence validation | A | C | R | C | R | R | I |
| Retention decision | A | I | C | R | C | C | I |
| Evidence acceptance | A | I | C | C | R | C | I |
| PR-11 approval | A | — | C | C | C | C | I |

Final PR-11 approval is an explicit owner decision only. No role, metric, dashboard or evidence
state can infer it.

## 18. Implementation-gap classification

| Capability | Gap class | Required disposition before representative evidence |
|---|---|---|
| Prometheus registry/exposition | `EXISTING_AND_SUFFICIENT` | reuse singleton registry and current endpoint |
| Total ADR-014 latency histogram | `EXISTING_BUT_PARTIAL` | add bounded component and evidence-phase coverage without duplicate semantics |
| Timeout metric | `IMPLEMENTATION_PREREQUISITE` | implement explicit bounded timeout result |
| ADR-014 comparison metrics | `EXISTING_BUT_PARTIAL` | reconcile current families with discrepancy/evidence/integrity catalogue |
| Durable structured logs | `IMPLEMENTATION_PREREQUISITE` | implement typed PII-safe envelope and controlled references |
| Durable audit correlation | `IMPLEMENTATION_PREREQUISITE` | implement ADR-014 event writes and append-only reference chain |
| ADR-014 dashboard | `CONTRACT_ONLY` | implement/provision four views; data source/access is `OPERATIONS_GATED` |
| ADR-014 alert rules | `CONTRACT_ONLY` | implement taxonomy/rules and tests |
| Alert delivery | `OPERATIONS_GATED` | choose and verify channels/receivers/escalation outside this contract |
| Evidence-reference sealing | `IMPLEMENTATION_PREREQUISITE` | implement versioned immutable index before accepted evidence |
| Session-level observability | `IMPLEMENTATION_PREREQUISITE` | implement session state, duration and control metrics |
| Kill-switch audit | `IMPLEMENTATION_PREREQUISITE` | implement state-change audit; activation remains separately authorized |
| Storage/retention duration | `OWNER_GATED` | owner/operations decision; no duration inferred |
| Representative execution | `OWNER_GATED` | separate access and execution authorization after prerequisites |
| Additional optional resource metrics | `FUTURE_OPTIONAL` | only when source exists and cardinality remains bounded |
| New financial threshold or presentation tolerance | `NOT_REQUIRED` | forbidden; canonical thresholds and zero-cent rule remain |

Implementation gaps do not block closure of this contract, but they block representative
evidence readiness. They remain under existing `CCB-001 / CAN-CUT-02`; no new backlog ID is
created.

## 19. Master Register and next step

This contract links `CCB-001`, `CAN-CUT-02`, `ADR014-PE-01`, `ADR014-PE-01A`,
`ADR014-PE-02`, `ADR014-PE-03`, `ADR014-PE-04` and `ADR014-PE-05`. `MR-040` remains
`OPEN / NON-BLOCKING / UNTOUCHED`.

Representative environment activation, manifest instance/selection, baseline measurement and
representative evidence are absent and blocking. PR-11 and runtime cutover remain not
authorized.

The single next eligible task is:

```text
ADR014-PE-05A — Metrics, Audit and Alert Implementation Preparation
```

PE-05A may analyze and prepare the narrow implementation plan against this catalogue; it does
not receive implementation, session, evidence, PR-11 or cutover authority from this document.

## 20. Final disposition

```text
Primary verdict: OPERATIONAL_CONTRACT_READY
PE-05 status: CLOSED / CANONICAL after approved merge
Representative evidence: ABSENT / BLOCKING
PR-11: NOT AUTHORIZED
Runtime cutover: NOT AUTHORIZED
Runtime/schema/migration impact: NONE
Financial authority impact: NONE
```
