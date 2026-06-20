# PR-RE1 - CaseDebtor report/export passive visibility policy

Status: Policy decision record

Scope: Report, export, and generated-output visibility semantics for
`CaseDebtor.lifecycleStatus`. This document does not change schema, migrations,
runtime behavior, API contracts, UI logic, or tests.

Required thesis:

```text
PASSIVE CaseDebtor is historical/audit-visible.
PASSIVE CaseDebtor is not an active operational output subject by default.
```

All reader and export behavior must remain tenant-scoped. Visibility policy must
never be implemented by broadening cross-tenant access or by reading a
`CaseDebtor` relation without its owning case/tenant boundary.

## 1. Output classes

Report/export surfaces must classify each output before deciding whether a
PASSIVE CaseDebtor can appear.

| Output class | Default rule | Label requirement |
| --- | --- | --- |
| Operational output | ACTIVE-only CaseDebtor | Not applicable; PASSIVE is excluded unless an explicit historical/export mode exists |
| Historical output | PASSIVE allowed | PASSIVE must be labelled clearly |
| Summary/report output | Depends on metric semantics | Must state whether the number/list is ACTIVE-only or all-inclusive |
| Legacy reader output | Align or deprecate | If still exposed, default must not silently include PASSIVE |

## 2. Operational outputs

Operational outputs are documents or machine-readable payloads that can be used
to start, continue, or submit legal/enforcement action. These outputs must use
ACTIVE-only CaseDebtor records by default.

Examples:

| Surface | Policy |
| --- | --- |
| UYAP XML/export | ACTIVE-only CaseDebtor by default |
| Takip talebi | ACTIVE-only CaseDebtor by default |
| Odeme emri | ACTIVE-only CaseDebtor by default |
| Template/document generation | ACTIVE-only CaseDebtor by default |

If a future feature needs PASSIVE records in these outputs, it must be explicit
and named as historical/export mode. That mode must not be reachable from the
normal operational create/download flow by accident.

Minimum future implementation expectations:

- The export/generation query filters CaseDebtor records to ACTIVE by default.
- A PASSIVE CaseDebtor cannot become a UYAP taraf in the normal XML output.
- A PASSIVE CaseDebtor cannot appear as a live borclu in normal takip talebi or
  odeme emri output.
- Any historical override must be visibly named and must label PASSIVE records.

## 3. Historical outputs

Historical outputs explain what already happened. They may include PASSIVE
CaseDebtor records because removing them would hide legal/audit context.

Examples:

| Surface | Policy |
| --- | --- |
| Tahsilat history | PASSIVE allowed with label |
| Tebligat history | PASSIVE allowed with label |
| Service history | PASSIVE allowed with label |
| UYAP query history | PASSIVE allowed with label |
| Address research history | PASSIVE allowed with label |
| Institution letter history | PASSIVE allowed with label |
| Asset query history | PASSIVE allowed with label |

Historical inclusion is not permission to create a new operation. A history row
may point to a PASSIVE CaseDebtor, but create/run/retry/update controls must
remain governed by the existing lifecycle writer guards and UI read-only rules.

Minimum future implementation expectations:

- History rows that include CaseDebtor identity also expose `lifecycleStatus` or
  an equivalent display flag.
- UI/export rows render a visible `PASSIVE` label for passive relationships.
- Historical aggregates document whether they include passive-linked rows.

## 4. Reports and summaries

Reports can be operational, historical, or mixed. Each report must declare the
meaning of debtor visibility.

Examples:

| Surface | Policy |
| --- | --- |
| Case debt report | Distinguish active operational debtors from passive/historical debtors |
| Dashboard summaries | State ACTIVE-only vs all-inclusive metric semantics |
| Collection summaries | State whether totals are all-time/history or active-operational |
| Risk and operational dashboards | Prefer ACTIVE-only when the metric drives action |

Case debt report is a mixed report. It may show historical/passive debtors when
the goal is complete case context, but it must not present them as active
operational targets. At minimum, debtor rows must carry the lifecycle state or a
PASSIVE label.

Dashboard summaries must avoid ambiguous names. A count named "active debtor" or
"operational debtor" must be ACTIVE-only. A count that includes passive history
must be named as historical/all-inclusive.

## 5. Legacy reader

The legacy reader:

```text
GET /cases/:caseId/debtors
```

must not remain a silent all-CaseDebtor reader if it is used by active UI,
export, selector, or automation flows.

Policy options:

1. Align it with the ACTIVE-only default.
2. Keep it only for compatibility and mark it legacy/deprecated.
3. Add an explicit historical/include-passive mode if a real historical caller
   exists.

Until a follow-up implementation chooses one option, new code should prefer the
newer ACTIVE-only reader contract and must not route operational outputs through
the legacy reader.

## 6. Regression expectations

Future behavior PRs should add targeted tests near the owning surface instead of
creating one monolithic lifecycle suite.

Expected coverage:

| Area | Expected assertion |
| --- | --- |
| UYAP XML/export | PASSIVE CaseDebtor is excluded from normal operational output |
| Template/document generation | PASSIVE CaseDebtor is excluded from normal takip talebi/odeme emri output |
| Historical reports | PASSIVE-linked rows may appear only with PASSIVE label/flag |
| Case debt report | Active operational debtor and passive/historical debtor are distinguishable |
| Dashboard summaries | Test names and expectations state ACTIVE-only or all-inclusive |
| Legacy reader | Default behavior is ACTIVE-only or the endpoint is explicitly treated as deprecated |

## 7. Non-goals

This policy does not require:

- schema changes;
- migration changes;
- API contract changes in PR-RE1;
- UI behavior changes in PR-RE1;
- backend guard changes in PR-RE1;
- broad `includePassive` propagation;
- stale helper cleanup.

Follow-up implementation PRs should stay narrow and choose one output class at a
time.
