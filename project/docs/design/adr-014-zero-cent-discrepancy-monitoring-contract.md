# ADR014-PE-01 — Zero-Cent Discrepancy Taxonomy and Monitoring Contract

**Status:** DEFINED / CANONICAL — repository effect begins with approved merge to `main`
**Date:** 2026-07-12
**Owner:** Ulaş
**Parent authority:** `docs/design/adr-014-cutover-authorization-policy.md`
**Program:** ADR-014 / CCB-001 / CAN-CUT-02 pre-evidence preparation

> **Authority boundary.** This contract operationalizes the already-canonical `0 CENT
> TOLERANCE` decision. It does not define a new financial tolerance, formula, fee policy,
> FX policy or calculation authority. It does not authorize PR-11, a pilot, a feature
> flag, a cohort, a consumer switch, authority promotion or runtime cutover. Code,
> monitoring and dashboard implementation require a separately authorized task.

> **PE-01A implementation reconciliation (2026-07-12).** The separately authorized
> implementation alignment is `CLOSED / CANONICAL` through technical PR #1154 (head
> `54102a50e2399ee5df393b180959bacb52d670ff`, squash
> `52668ff97007a72496f351a701b1dbeaf8fe60d8`, CI `4/4 SUCCESS`). This updates the
> implementation facts below; it does not authorize PR-11, pilot activation, consumer
> switch, primary authority promotion or runtime cutover.

---

## 1. Canonical sources and scope

This contract is read with, and cannot override:

1. `AGENTS.md` and `docs/governance/GOVERNANCE-INDEX.md`;
2. `docs/governance/SYSTEM-CONSTITUTION.md`, especially `SYS-SOT-002/003/005/006`,
   `SYS-FIN-007`, `SYS-EVID-003/005/006`, `SYS-AUTH-007/009/012` and
   `SYS-MIG-007/008`;
3. ratified `DEBTOR-GOVERNANCE.md` and `RECEIVABLE-GOVERNANCE.md`;
4. TM3 and DBIND financial authority boundaries;
5. ADR-014, its split plan and the Cutover Authorization Policy.

The specialized receivable term is **Projection Ownership / Derived Read Contract**.
Projection, trace, non-official snapshot, monitoring and dashboard output never become
calculation, persistence or presentation authority.

Non-normative analysis baseline: `8699d75918e4f12f8de8f86e693e13b88cdce44e`.
Every implementation task must re-fetch and re-verify canonical `main`.

---

## 2. Canonical zero-cent rule

The binding owner decision is:

```text
Financial tolerance: 0 cent
Allowed 1-cent fields: NONE
Any unexplained financial discrepancy: STOP
```

It applies to principal, allocation, payment application, total balance, outstanding,
paid, interest base, currency grouping, reversal result and authority/status/blocker
semantics. A presentation-only exception can exist only after a separate owner decision.
No such exception currently exists.

For fields whose legacy and canonical sources do not express the same semantic fact,
the result is not a tolerated difference. It is `NOT_COMPARABLE / FAIL_CLOSED` until an
approved comparison contract exists.

---

## 3. Verified implementation inventory

The original PE-01 inventory below is retained as the discovery baseline. After PE-01A,
the canonical implementation override is:

- comparable non-zero financial differences are always `MAJOR_DELTA / RED` and block;
- the public `MINOR_DELTA` enum remains backward-compatible but is no longer emitted by
  the financial classifier and is fail-closed if supplied;
- required `UNKNOWN`, missing-side and `NOT_COMPARABLE` financial evidence blocks;
- B1 cost, fee and expense semantics are `NOT_COMPARABLE / UNKNOWN_NEEDS_FOLLOWUP` and
  are no longer readiness-exempt;
- `TOTAL_DEBT_DELTA` is an explicit comparison row;
- missing payment-allocation, interest-base and fee-projection comparison evidence has
  explicit deterministic blocker codes; no synthetic `MATCH` or zero fallback exists;
- `safeForPrimaryDisplay=true` is possible only in the pure readiness function when every
  bounded financial row is exact, all required evidence is present and all other blockers
  are absent; the live shadow path remains fail-closed while required evidence is absent;
- bounded PII-free Prometheus metrics use the existing global `PROM_REGISTRY`.

### 3.1 Shadow classifications, severities and amount statuses

Current types:

```text
Classification:
EXACT_MATCH
EXPECTED_CANONICAL_DIVERGENCE
LEGACY_STUB
LEGACY_AUTHORITY_RISK
CANONICAL_UNSAFE
MISSING_LEGACY_FIELD
MISSING_CANONICAL_FIELD
CURRENCY_MISMATCH
CONTEXT_MISMATCH
BLOCKER

Severity:
GREEN
YELLOW
RED
UNKNOWN_NEEDS_FOLLOWUP

Amount status:
MATCH
MINOR_DELTA
MAJOR_DELTA
LEGACY_ONLY
CANONICAL_ONLY
NOT_COMPARABLE
```

### 3.2 Direct shadow discrepancy codes (PE-01 discovery baseline)

| Group | Codes |
|---|---|
| Total/amount diff | `OUTSTANDING_DELTA`, `PAID_DELTA`, `INTEREST_DELTA`, `COSTS_DELTA`, `ATTORNEY_FEE_DELTA` |
| Bucket diff | `PRINCIPAL_BUCKET_DELTA`, `ACCRUED_INTEREST_BUCKET_DELTA`, `EXPENSE_BUCKET_DELTA`, `ATTORNEY_FEE_BUCKET_DELTA`, `HELD_OVERPAYMENT_BUCKET_DELTA` |
| Source/context blockers | `LEGACY_UNAVAILABLE`, `CANONICAL_DISPLAY_UNAVAILABLE`, `CONTEXT_MISMATCH`, `CANONICAL_DISPLAY_STATUS_UNAVAILABLE`, `CANONICAL_UNSAFE_FOR_PRIMARY_DISPLAY`, `CURRENCY_MISMATCH`, `CANONICAL_CURRENCY_UNSAFE` |
| Source warnings | `SOURCE_SCOPE_MISMATCH`, `CANONICAL_SHADOW_PRESENT_NOT_USED_AS_SOURCE`, `LEGACY_INTEREST_STUB_OR_EMPTY`, `FINAL_DEBT_STATES_MISSING`, `OVERPAYMENT_BLOCKED` |

The shadow report also propagates canonical display diagnostic codes. Current display
codes are:

```text
NO_BUCKETS
REVERSAL_INTEGRITY_INVALID
ZERO_OR_NEGATIVE_PAYMENT
ENGINE_ERROR
CASE_BALANCE_UNAVAILABLE
CURRENCY_MISSING
CURRENCY_UNSUPPORTED
CURRENCY_MISMATCH
REVERSAL_CURRENCY_MISMATCH
LEGACY_CALCULATION_SUMMARY_LIVE
FINAL_DEBT_STATES_MISSING
FINAL_DEBT_STATES_CURRENCY_MISMATCH
CLAIM_ITEM_COLLECTED_AMOUNT_NOT_AUTHORITY
INTEREST_STUB_OR_EMPTY
OVERPAYMENT_HELD_NOT_DISPLAYED
OVERPAYMENT_BLOCKED
RESTRICTED_PAYMENT_DISPLAY_UNSAFE
NAFAKA_PRINCIPAL_DISPLAY_RISK
MULTI_CURRENCY_DISPLAY_UNSAFE
```

`OVERPAYMENT_HELD_NOT_DISPLAYED` and `NAFAKA_PRINCIPAL_DISPLAY_RISK` are declared in the
display type. No production producer for either code was found at the analysis baseline;
the latter has readiness-consumer and test references. They must not be reported as
observed runtime signals until a producer is verified.

### 3.3 Amount severity mapping (PE-01 discovery baseline)

| Current input state | Current result |
|---|---|
| Both values absent | `BLOCKER / NOT_COMPARABLE / UNKNOWN_NEEDS_FOLLOWUP` |
| Legacy absent, canonical present | `MISSING_LEGACY_FIELD / CANONICAL_ONLY / YELLOW` |
| Legacy present, canonical absent | `MISSING_CANONICAL_FIELD / LEGACY_ONLY / YELLOW` |
| Equal after cent normalization | `EXACT_MATCH / MATCH / GREEN` |
| Non-zero delta and `abs(deltaPercent) < 1` | `EXPECTED_CANONICAL_DIVERGENCE / MINOR_DELTA / YELLOW` |
| Non-zero delta and percentage is absent or at least 1% | `EXPECTED_CANONICAL_DIVERGENCE / MAJOR_DELTA / RED` |
| Comparison blocked by context/currency/unsafe display | `NOT_COMPARABLE / RED` |

The `<1%` rule comes from `MINOR_DELTA_PERCENT = 1`. It is percentage-based, not the
canonical exact-minor-unit acceptance rule.

### 3.4 Readiness flow (PE-01 discovery baseline)

```text
GET shadow-diff
→ legacy calculation-summary + canonical CaseBalance are captured
→ CaseBalance is mapped to CaseBalanceDisplay
→ source/context comparability blockers are created
→ total and bucket amount diffs are classified
→ cutoverReadiness() collects:
   - comparability blockers
   - RED amount diffs except B1 exemptions
   - selected canonical display diagnostics/provenance blockers
→ safeForPrimaryDisplay = blockerCodes.length === 0
→ frontend evaluateGuardedPrimaryDisplayPilot() trusts that backend boolean
→ when dormant feature flag + URL gate are enabled and render data exists,
  CANONICAL_PRIMARY_CANDIDATE or PARTIAL_CANONICAL_LEGACY_TOTALS can be selected
```

Other authority/readiness signals remain separately closed:

- `CaseBalanceSnapshotReadiness.primaryDisplayEligible` is always `false`.
- The PR-10 compatibility adapter has `consumerSwitchAuthorized=false`,
  `primaryAuthorityPromoted=false` and `primaryDisplayEligible=false`.
- The guarded-primary frontend path is default-off, but its current gate is not the
  owner-mandated triple gate. Triple-gate implementation belongs to future PR-11 and is
  not authorized by this contract.

### 3.5 B1 exemptions (PE-01 discovery baseline)

The backend explicitly excludes these `RED` codes from readiness blockers:

```text
COSTS_DELTA
ATTORNEY_FEE_DELTA
EXPENSE_BUCKET_DELTA
ATTORNEY_FEE_BUCKET_DELTA
```

The frontend separately detects `RED` `COSTS_DELTA` or `ATTORNEY_FEE_DELTA` and may
choose `PARTIAL_CANONICAL_LEGACY_TOTALS`, retaining selected legacy totals.

Canonical disposition for monitoring and cutover evidence:

```text
TOLERATED: NO
COMPARABLE with exact approved source semantics: 0-cent rule applies
Different/unreconciled source semantics: NOT_COMPARABLE / FAIL_CLOSED
Hybrid presentation: separately observable and policy-defined; never full-canonical parity
```

This disposition does not decide fee calculation authority. Fee/harç policy remains
ADR-013 owner-gated.

The post-PE-01A override at the start of this section supersedes the percentage rule,
RED-only aggregation and B1 exemption behavior described in §§3.3–3.5.

---

## 4. Required discrepancy taxonomy

| Semantic condition | Classification | Severity | Readiness effect | Alert effect |
|---|---|---|---|---|
| Exact authorized financial values, delta exactly 0 minor units | `EXACT_MATCH` | `GREEN` | May satisfy this field only | None |
| Any non-zero financial delta | `FINANCIAL_DISCREPANCY` or equivalent explicit code | `RED` | Block | Stop/page; automatic rollback only in an authorized pilot |
| Required financial value absent on either side | `MISSING_*` | `UNKNOWN_NEEDS_FOLLOWUP` | Block | Investigation; case remains fail-closed |
| Both required values absent | `NOT_COMPARABLE` | `UNKNOWN_NEEDS_FOLLOWUP` | Block | Investigation |
| Sources have different/unapproved semantics | `NOT_COMPARABLE` | `UNKNOWN_NEEDS_FOLLOWUP` | Block full-primary eligibility | Coverage/reconciliation alert |
| Currency/context mismatch | Existing mismatch classification | `RED` | Block | Stop/page |
| Unauthorized authority promotion or blocker/status conflict | `CANONICAL_UNSAFE` / explicit authority code | `RED` | Block | Stop/page |
| Non-financial, pre-classified diagnostic with no authority effect | Existing diagnostic class | `YELLOW` | Cannot make an unsafe result safe | Warning/ticket if operationally actionable |

`MINOR_DELTA` may remain as a compatibility/reporting enum only if it is impossible for
it to make a non-zero financial comparison readiness-safe. Percentage is never an
acceptance tolerance.

`UNKNOWN_NEEDS_FOLLOWUP` is fail-closed. It cannot be treated as a warning that permits
`safeForPrimaryDisplay=true`.

---

## 5. Monitoring contract

### 5.1 Metric catalogue

Names below are the operational contract. Implementation may reuse the existing global
`PROM_REGISTRY`; a second metrics registry is forbidden.

| Metric | Type | Bounded labels | Purpose |
|---|---|---|---|
| `adr014_shadow_requests_total` | Counter | `outcome` | Request count: success/unavailable/error/timeout |
| `adr014_shadow_request_duration_seconds` | Histogram | `outcome` | Latency distribution; p50/p95/p99 are dashboard queries |
| `adr014_shadow_timeouts_total` | Counter | `stage` | Legacy, canonical or orchestration timeout |
| `adr014_shadow_comparisons_total` | Counter | `field`, `status`, `severity` | Exact/unavailable/unknown/blocker comparison counts |
| `adr014_financial_discrepancies_total` | Counter | `field`, `comparison_status` | Every non-zero or non-comparable required financial field |
| `adr014_readiness_blockers_total` | Counter | `code` | Backend readiness blocker counts |
| `adr014_source_availability_total` | Counter | `source`, `state` | Legacy/canonical availability |
| `adr014_currency_integrity_total` | Counter | `result`, `currency_group` | Currency grouping and mismatch outcomes |
| `adr014_authority_consistency_total` | Counter | `result`, `code` | Authority/status/readiness consistency |
| `adr014_dataset_coverage` | Gauge | `scenario`, `currency_group`, `evidence_class` | Edge-case and representative evidence coverage |
| `adr014_kill_switch_state` | Gauge | `environment` | Future authorized kill-switch state; design-only until PR-11 |
| `adr014_operational_audit_total` | Counter | `action`, `result` | Audit-event delivery health, not the audit record itself |

Histogram buckets must follow the approved platform convention or a measured baseline;
this contract does not invent bucket boundaries.

Forbidden metric labels:

```text
tenantId, caseId, userId, requestId, person/client/debtor identity,
raw error message, raw evidence reference, arbitrary currency or reason text
```

Allowed enumerations must be code-owned and bounded. Currency labels collapse to the
approved supported set plus `MULTI`, `UNKNOWN` and `OTHER`.

### 5.2 PII-safe operational log contract

Operational logs may carry:

```text
eventName, occurredAt, requestId, environment, outcome,
field enum, discrepancy code, classification, severity,
comparisonStatus, isZeroDelta, sourceVersion
```

They must not carry raw names, TCKN/VKN, address/contact data, free text, raw tenant/case
IDs, legacy/canonical amount payloads or database credentials. Where case-level evidence
correlation is required, use an approved purpose-bound pseudonymous reference. Exact
amount evidence belongs in a separately authorized, access-controlled evidence package,
not ordinary operational logs.

Operational logs are not LegalEvidence and do not become canonical facts.

### 5.3 Operational audit contract

Current shadow comparison is read-only and has no module-specific `AuditService` write.
Future operational audit requirements are:

- kill-switch, feature-flag and allowlist changes: actor, time, reason, affected cohort,
  previous/new state and correlation ID;
- evidence-package acceptance and sign-off: approver role, decision, evidence reference,
  source versions and timestamp;
- re-activation: new owner GO reference;
- audit delivery failure: metric and alert, without silently dropping the action record.

An audit metric is not a substitute for the immutable audit record.

### 5.4 Evidence reference contract

A pre-pilot evidence item must reference:

```text
canonical SHA
environment identity without credentials
dataset manifest/version
engine/source version
policy/contract version
run start/end
request and tenant coverage counts
metric/dashboard snapshot reference
discrepancy summary
sign-off references
integrity hash/manifest where authorized
```

The current request-time shadow report has `generatedAt`, `sourceVersion` and provenance,
but no immutable evidence-package reference. It is diagnostic input, not a completed
evidence package.

---

## 6. Alert contract

| Signal | Required alert | Stop/rollback semantics |
|---|---|---|
| Non-zero financial discrepancy | `RED / PAGE` | Immediate stop; automatic rollback only after authorized pilot machinery exists |
| Tenant/case leakage | `RED / PAGE` | Immediate stop and security escalation |
| Unauthorized authority promotion | `RED / PAGE` | Immediate stop |
| Canonical primary with blocker/unknown | `RED / PAGE` | Immediate stop |
| Zero-fill of unavailable value | `RED / PAGE` | Immediate stop |
| Currency/context mismatch | `RED / PAGE` | Immediate stop |
| Kill-switch failure | `RED / PAGE` | Immediate stop |
| Legacy/canonical unavailable for a case | `UNKNOWN / INVESTIGATE` | Case fail-closed; aggregate paging threshold requires owner/baseline decision |
| p95 > 20% or p99 > 30% regression | `YELLOW/RED operational` | Manual owner/operations decision under canonical policy |
| Material error/timeout increase | Baseline-dependent operational alert | No interpretation before baseline |
| Dataset edge-case gap | `UNKNOWN / BLOCK EVIDENCE ACCEPTANCE` | PR-11 authorization remains blocked |

No new discrepancy or rollout threshold is created here.

---

## 7. Dashboard contract

The required dashboard is operational monitoring, not a legal-balance UI. Minimum panels:

1. **Traffic and latency:** request rate, success/error/timeout, p50/p95/p99.
2. **Financial exactness:** exact vs non-zero vs non-comparable by bounded field.
3. **Readiness and authority:** blocker codes, unknowns, unsafe results and authority conflicts.
4. **Source availability:** legacy/canonical availability and orchestration failures.
5. **Currency integrity:** supported groups, mismatch and unsafe multi/unknown outcomes.
6. **Dataset coverage:** mandatory edge cases, evidence class, tenant/request coverage counts.
7. **Operational control:** future kill-switch state, activation/deactivation audit health,
   rollback duration and alert delivery.
8. **Evidence package:** current evidence run/version/reference and sign-off completeness.

Dashboard links or screenshots are evidence references only when captured in the approved
evidence package. The existing `BalanceShadowDiffPanel` is a case-level diagnostic panel,
not this operational dashboard.

---

## 8. Acceptance matrix

| Field/condition | GREEN | YELLOW | RED | UNKNOWN / fail-closed |
|---|---|---|---|---|
| Principal | Exact 0-cent comparable match | Non-financial explanatory diagnostic only | Any non-zero delta, invalid allocation or authority conflict | Missing/not comparable principal evidence |
| Interest | Exact 0-cent comparable match | Non-authoritative explanation only | Any non-zero accrued/PRE/POST reconciliation delta | Missing/stub with no proven zero-interest semantics |
| Fee | Exact match only under an approved comparable source contract | Typed `NOT_CALCULATED` diagnostic; never zero fallback | Non-zero comparable delta or unauthorized fee authority | Different/unapproved source semantics or unavailable projection |
| Cost | Exact match under approved comparable source semantics | Non-authoritative coverage diagnostic | Non-zero comparable delta | Legacy/canonical source semantics not reconciled |
| Expense | Exact match under approved comparable source semantics | Non-authoritative coverage diagnostic | Non-zero comparable delta | Unavailable or not comparable |
| Paid/payment application | Exact 0-cent match | None for financial acceptance | Any non-zero application/allocation delta | Allocation comparison evidence absent |
| Remaining/outstanding | Exact 0-cent match | None for financial acceptance | Any non-zero delta | Required side absent/not comparable |
| Total | Exact 0-cent match | None for financial acceptance | Any non-zero delta | Direct total comparison absent or source semantics unresolved |
| Currency | Same approved currency group | Informational supported-group note | Mismatch, cross-currency aggregation or unsafe top-level currency | Missing/unsupported currency |
| Authority | All authority/status/blocker signals consistent and non-promoted | Informational legacy/shadow provenance | Unauthorized promotion or contradictory status | Authority evidence missing |
| Readiness | All required case-level comparisons exact and all blockers absent; still not global cutover authorization | Operational diagnostic only | Any blocker or non-zero financial delta | Any required unknown/not-comparable field |
| Legacy unavailable | Never | Never | Source unavailable where comparison is required | May be recorded as unavailable, but readiness remains blocked |
| Canonical unavailable | Never | Never | Source unavailable | Readiness blocked; no fallback-as-success |
| Unknown | Never | Never for financial acceptance | If security/authority hard trigger is known | Default: `UNKNOWN_NEEDS_FOLLOWUP`, readiness blocked |

Post-PE-01A, `Total` has a direct `TOTAL_DEBT_DELTA` row. `Allocation/payment
application`, `interest base` and fee projection still lack approved direct
legacy/canonical comparison contracts; their absence is now represented by explicit
`MISSING_*_COMPARISON_EVIDENCE` blockers and cannot be interpreted as `GREEN`.

---

## 9. PE-01 discovery gaps and PE-01A disposition

| ID | Gap | Current effect | Required alignment |
|---|---|---|---|
| PE01-G01 | `MINOR_DELTA_PERCENT = 1` | Non-zero financial delta below 1% can be `YELLOW` | Any non-zero minor-unit delta blocks |
| PE01-G02 | Readiness collects `RED` diffs only | `UNKNOWN_NEEDS_FOLLOWUP` can be non-blocking | Required unknown/not-comparable fields block |
| PE01-G03 | Missing one side is `YELLOW` | Required financial evidence can remain non-blocking | Fail-closed missing-source mapping |
| PE01-G04 | Four B1 cost/fee codes are exempt even when `RED` | `safeForPrimaryDisplay=true` is possible | Comparable→0-cent; otherwise NOT_COMPARABLE/fail-closed |
| PE01-G05 | No direct total-debt diff | Total can be selected without its own comparison row | Add explicit total evidence or keep not-comparable |
| PE01-G06 | No direct allocation/payment-application or interest-base diff | Absence may be mistaken for parity | Add evidence mapping or explicit coverage blocker |
| PE01-G07 | Canonical diagnostics are mostly re-emitted as `YELLOW` | Original blocker semantics can be obscured in diagnostics list | Preserve typed severity; readiness remains source of truth |
| PE01-G08 | Snapshot/compatibility eligibility false, shadow `safeForPrimaryDisplay` may be true | Similar names express different gates | Rename or document case-level vs global gate; no authority promotion |
| PE01-G09 | Only global HTTP response count exists | No ADR-014 latency, timeout or discrepancy metrics | Implement bounded metric contract |
| PE01-G10 | No module-specific operational log/audit/evidence reference | Evidence cannot be durably correlated | PII-safe log plus separately authorized audit/evidence path |
| PE01-G11 | No operational dashboard or alert routing | Hard-zero breaches are not operationally observable | Implement dashboard and alert contract before evidence run |
| PE01-G12 | Guarded path uses default-off flag + URL gate | Does not satisfy mandatory triple gate | PR-11 owner-gated scope; no implementation under PE-01 |

These are implementation alignment gaps, not evidence of an active production cutover.
PR-11 and runtime cutover remain NOT AUTHORIZED.

PE-01A disposition:

| Gap | Disposition |
|---|---|
| PE01-G01..G06 | CLOSED by zero-cent classification, all-financial-status blocker aggregation, B1 fail-closed mapping, direct total row and explicit missing-evidence blockers |
| PE01-G07 | Readiness alignment CLOSED; diagnostic list remains non-authoritative and readiness remains the source of truth |
| PE01-G08 | CLOSED for this scope: guarded evidence consumes backend `safeForPrimaryDisplay`; global authority eligibility remains false and no promotion occurred |
| PE01-G09 | CLOSED: bounded metrics added to existing global registry |
| PE01-G10 | OPEN / DOCUMENTED GAP: no new durable audit/evidence-reference or safe correlation contract was authorized |
| PE01-G11 | OPEN / DOCUMENTED GAP: operational dashboard and alert routing are not implemented |
| PE01-G12 | OWNER-GATED: PR-11/pilot/feature activation/runtime cutover remain NOT AUTHORIZED |

---

## 10. PE-01A implementation allowlist result

The separately authorized PE-01A patch remained limited to the following shadow/readiness
surface and tests:

```text
project/apps/api/src/modules/balance-display-shadow-diff/
  balance-display-shadow-diff.types.ts
  balance-display-shadow-diff.service.ts
  balance-display-shadow-diff.module.ts
  balance-display-shadow-diff.metrics.ts
  __tests__/balance-display-shadow-diff.service.spec.ts
  __tests__/balance-display-shadow-diff.readiness.spec.ts
  __tests__/balance-display-shadow-diff.metrics.spec.ts
  __tests__/balance-display-shadow-diff.guarded-cutover-evidence.spec.ts

project/docs/design/adr-014-zero-cent-discrepancy-monitoring-contract.md
```

Permitted change classes:

```text
mapping, enum, severity, readiness, metric, PII-safe operational log,
dashboard contract, documentation, acceptance/test matrix
```

Explicitly forbidden:

```text
calculation logic or financial algorithm
schema/migration/backfill/historical repair
feature flag or cohort activation
consumer switch or authority promotion
pilot/runtime cutover
PR-11 scope expansion
fee/harç or FX authority
new metrics registry
AuditLog mutation without separate authorization and privacy review
```

The metrics implementation uses the existing global `PROM_REGISTRY`; the current metrics
aggregator exposes these registry metrics without a parallel stack.

---

## 11. Master Register and closure

- No new backlog ID is created.
- The work remains under existing `CCB-001` and its `CAN-CUT-02` milestone.
- `CAN-CUT-02` remains `OPEN / needs-owner-decision`.
- Representative evidence remains `ABSENT / BLOCKING`.
- PR-11 implementation/pilot and runtime cutover remain `NOT AUTHORIZED`.
- PE-01 docs/taxonomy and PE-01A implementation alignment are `CLOSED / CANONICAL`.
- Technical evidence: API production type-check and changed-file ESLint PASS; shadow module
  `76/76`, affected web `110/110`, golden/adapter/reversal regression `84/84`; GitHub CI
  `4/4 SUCCESS`, merge state `CLEAN` before squash.
- Bounded metric instrumentation is implemented; durable log/audit correlation,
  dashboard/alert routing and representative evidence remain open preparation/evidence
  gaps and are not falsely marked complete.
- Physical technical worktree residue is tracked separately as `MR-040 / OPEN /
  NON-BLOCKING`; it does not reopen PE-01A.
- Next eligible task is `ADR014-PE-02 — Evidence/Data-Access Procedure`, interpreted with
  the canonical local-owner/office real-data policy. It does not authorize a data copy,
  PR-11 or cutover.

```text
Primary verdict: PASS_READY_FOR_CLOSE
PE-01A final status: CLOSED / CANONICAL
```
