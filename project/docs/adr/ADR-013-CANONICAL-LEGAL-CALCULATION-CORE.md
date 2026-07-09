# ADR-013: Canonical Legal Calculation Core

**Status:** Accepted as binding direction; implementation gated by PR sequence
**Date:** 2026-07-05 (original direction); renumbered/scope-clarified on `main` 2026-07-10 (see Revision History)
**Deciders:** Owner - Ulas
**Related:** CCB-001, MPB-011, GOV-ADR-NAMING-000, ADR-010, ADR-012 (Waiting & Progress Policy — unrelated, no naming overlap), `balance-display-shadow-diff`, `balance-shadow-compare`, `InterestEngineService.computeBalance`, `ClaimItem`, `LedgerEntry`, `LedgerAllocation`, `CaseService.getCalculationSummary`

> **Reading note:** This ADR is the CCB-001 constitution. It locks the target architecture and the allowed implementation sequence. It does not authorize immediate cutover, UI switch, legacy deletion, snapshot creation, or hidden fallback.

> **Naming note (owner decision, 2026-07-10):** This document originated on the isolated `codex/ccb-001-pr1-pr6-rescue` branch as a draft numbered `ADR-012-CCB-001-CANONICAL-LEGAL-CALCULATION-CORE.md`. That number collided with `ADR-012-WAITING-PROGRESS-POLICY.md`, which independently became canonical on `main` (PR #1002, `GOV-ADR-NAMING-000`). `GOV-ADR-NAMING-000` initially reserved `ADR-013` narrowly for a "Fee / Harç / Snapshot / Journal architecture" line without creating a file. The owner has since clarified that framing was too narrow: **`ADR-013` is this document — the Canonical Legal Calculation Core — and Fee Projection, Snapshot, Journal, and tariff/statutory-constant/contractual classification are sub-components of this architecture, not separate ADRs.** This is a scope clarification of the reserved target, not a reversal of `GOV-ADR-NAMING-000`'s core naming decision (`ADR-012` remains Waiting & Progress Policy on `main`, unconditionally).

## Context

The owner decision is final:

- Canonical `computeBalance` / `ClaimItem` + TBK100 + Interest Engine is the long-term single calculation authority for claim, case, and enforcement balance.
- Legacy `getCalculationSummary` is not long-term production authority.
- Immediate clean-break cutover is blocked until the canonical hardening PR chain passes.
- Production dual-authority balance is prohibited.

The current repository has canonical building blocks, shadow/diff infrastructure, and legacy production display paths. CCB-001 exists to move from that transitional state to one explainable legal calculation core.

## Decision

The product target is:

```text
Canonical Legal Calculation Core
```

Every production-displayed balance must be derived from the same canonical pipeline:

```text
Case / legal obligation data
-> ClaimItem / legal component model
-> case-scoped payment entry
-> intra-case TBK100 allocation
-> interest base mutation
-> interest engine
-> currency-aware legal balance
-> reversal/refund/cancel netting
-> fee projection layer
-> trace / allocation log
-> canonical balance DTO
-> API / UI / reports / documents / reconciliation
```

`computeBalance` is necessary but not sufficient by itself. Production authority requires the surrounding legal, trace, currency, fee, and DTO contracts.

**Sub-component clarification (added 2026-07-10, does not change the pipeline above):** Fee Projection, Snapshot (`BalanceSnapshot`, PR-8), Journal (see ADR-010 relationship below), and tariff/statutory-constant/contractual classification are architectural sub-components *within* this Canonical Legal Calculation Core — they are not independently-numbered ADRs. Where this document's own text elsewhere (Blocker Classification, Required PR Sequence) already treats them as gated layers of the same pipeline, that framing is the authoritative one.

## Normative Rules

### MUST

1. Use canonical balance as the target single authority.
2. Keep standard manual payment entry case-scoped: the user opens a case and records payment into that case.
3. Apply TBK100 allocation inside the selected case in this order:

```text
costs / enforcement expenses / legal expenses
-> accessory claims / fer'i claims
-> accrued interest
-> principal
```

4. Reduce principal only when allocation reaches principal.
5. Reduce future interest base only by the principal-allocated amount and only from the allocation date forward.
6. Net reversal/refund/cancel effects deterministically:

```text
PAYMENT + matching REVERSAL = zero net legal effect
```

7. Fail closed on missing buckets, unresolved reversal relation, missing FX basis, missing required rate, non-deterministic allocation, missing caseId, or trace-generation failure for production display.
8. Keep foreign currency claims currency-aware. Do not apply TRY statutory interest to foreign-currency principal by default.
9. Produce an explainable trace for production-displayed balances.
10. Keep fee projection separate from core legal balance while presenting both through the canonical DTO.

### MUST NOT

1. Re-open the legacy vs canonical decision.
2. Keep legacy `getCalculationSummary` as independent production authority.
3. Create permanent production dual authority.
4. Implement automatic cross-case payment allocation in the standard manual payment workflow.
5. Silently skip payments when a currency has no matching claim bucket.
6. Switch UI/report/template production display before canonical hardening gates pass.
7. Delete legacy before adapter, fee projection, trace, and golden legal fixtures exist.
8. Create balance snapshots before reversal, NO_BUCKETS, TBK100, interest-base, and FX blockers are fixed.
9. Hide fallback behavior from API/UI/report consumers.

## Legacy Role

Legacy may survive only as:

```text
migration reference
golden fixture source
diagnostic comparison
compatibility wrapper
temporary fee projection reference until migrated
```

Legacy is forbidden as:

```text
production display authority
```

If a legacy endpoint name must remain for compatibility, its implementation must become a canonical + fee-projection wrapper.

## Payment Workflow Policy

Standard manual workflow:

```text
User opens Case A
-> user records payment in Case A
-> system validates receipt/file clues and warns if needed
-> user confirms case selection
-> payment persists with caseId = Case A
-> canonical engine applies TBK100 only inside Case A
```

Allowed warning/audit concepts:

```text
CURRENT_CASE_SELECTED
DEBTOR_DECLARED_THIS_CASE
DEBTOR_DECLARED_DIFFERENT_CASE_BUT_USER_OVERRIDDEN
NO_DECLARATION_USER_CONFIRMED
COURT_OR_OFFICE_DIRECTED
BANK_IMPORT_MANUAL_MATCH
```

Forbidden persisted behavior:

```text
SYSTEM_AUTO_ALLOCATED_TO_OTHER_CASE
```

TBK 101/102 is a warning, validation, receipt-check, suggestion, and audit layer for this workflow. It is not an automatic cross-case allocator for standard manual payment entry.

## Invariants

### Determinism

```text
I-01 Same input set -> same balance.
I-02 Event ordering is deterministic.
I-03 Same-day events have explicit tie-breakers.
I-04 Decimal and rounding rules are explicit.
I-05 Currency rules are explicit.
I-06 Date/timezone cutoffs are explicit.
I-07 Reversal is a compensating event and is netted.
I-08 Negative principal exists only through explicit overpayment modeling.
I-09 Overpayment does not corrupt principal or interest buckets.
I-10 UI balance = API balance = report balance.
I-11 Legal balance reconciles with accounting or explains the difference.
```

### TBK100 / interest base

```text
I-12 Partial payment must not reduce principal unless allocation reaches principal.
I-13 Payment allocated only to costs / fer'i / interest must not reduce future interest base.
I-14 Payment allocated partly to principal must reduce future interest base only by the principal-allocated amount.
I-15 Intra-case allocation order is costs -> fer'i -> accrued interest -> principal.
I-16 Principal allocation is forbidden while a higher-priority bucket remains open.
I-17 Allocation trace shows whether principal was touched.
```

### Currency

```text
I-18 Foreign currency principal must not use TRY statutory rate by default.
I-19 Foreign currency balance must show original currency and TRY equivalent basis.
I-20 FX date, FX source, settlement basis, and display basis are mandatory for production display.
I-21 Missing FX basis is fail-closed.
```

## Blocker Classification

| Topic | Class | Rule |
|---|---:|---|
| Reversal netting | CUTOVER BLOCKER | Cancelled payment must not keep reducing balance. |
| NO_BUCKETS silent skip | CUTOVER BLOCKER | Payment without claim bucket must not disappear. |
| TBK100 intra-case allocation | CUTOVER BLOCKER | Costs / fer'i / interest / principal order is mandatory. |
| Partial payment interest base | CUTOVER BLOCKER | Future interest base changes only by principal allocation. |
| Foreign currency / FX basis | CUTOVER BLOCKER | Currency-aware policy and TRY equivalent basis are required. |
| Fee projection | PRE-CUTOVER REQUIRED | Summary is incomplete without fees/cost projection. |
| Trace / AllocationLog | PRE-CUTOVER REQUIRED | Production display must be explainable. |
| UI legacy primary | PRE-CUTOVER REQUIRED | UI must consume canonical DTO before cutover. |
| Report/template separate formulas | PRE-CUTOVER REQUIRED | No independent formulas outside canonical DTO. |
| TBK101/102 full fallback | FUTURE / WARNING-AUDIT | Not an automatic manual-payment allocator. |
| Bankruptcy/concordat/ranking | FUTURE / GUARDED SCOPE | V1 may guard out of scope. |
| Bank import unmatched payments | FUTURE / DESIGN RESERVED | User matching required before case-scoped payment. |

## Required PR Sequence

This order is mandatory:

```text
PR-0  ADR / constitution documentation
PR-1A Reversal netting verification only
PR-1B Reversal netting fix
PR-2  NO_BUCKETS fail-closed
PR-3  TBK100 intra-case allocation hardening
PR-4  Partial payment interest-base mutation
PR-5  Enforcement date / pre-post interest
PR-6  Currency-aware foreign claim engine
PR-7  Fee Projection Layer
PR-8  Trace / AllocationLog / BalanceSnapshot
PR-9  Golden legal fixture matrix
PR-10 Canonical primary adapter
PR-11 UI/API/report/template switch
PR-12 Legacy fallback disable
PR-13 Shadow/diff cleanup
PR-14 Legacy quarantine/deletion
```

No PR may implement work from a later PR.

## PR Work Protocol

Every CCB-001 PR must start with:

```text
# CCB-001 PR-N WORK PLAN

Current PR:
[PR number + title]

Allowed scope:
[...]

Forbidden scope:
[...]

Relevant owner policies:
[...]

Expected tests:
[...]

Stop conditions:
[...]

No out-of-scope work will be performed.
```

Every CCB-001 PR must end with:

```text
# CCB-001 PR-N COMPLETION REPORT

1. Scope compliance
2. Files changed
3. Behavior changed
4. Tests added/updated
5. Tests run
6. Invariants verified
7. Remaining blockers
8. Next PR recommendation
9. Out-of-scope findings
10. Verdict
```

## Stop Conditions

Stop with `BLOCKED`, `VERIFICATION REQUIRED`, or `OWNER DECISION REQUIRED` if any of these appear:

```text
1. Canonical calculation runs with missing required data.
2. Payment currency has NO_BUCKETS and system silently skips it.
3. Reversal netting is unclear.
4. PAYMENT + REVERSAL does not produce zero net legal effect.
5. TBK100 allocation order is broken.
6. Payment does not reach principal but principal decreases.
7. Payment reaches principal but future interest base does not decrease.
8. Foreign currency principal uses TRY statutory interest by default.
9. FX date/source/TRY equivalent is missing.
10. UI still reads legacy primary fields in a cutover PR.
11. Report/template uses separate formulas.
12. Allocation trace cannot be produced.
13. Summary is called complete without fee projection.
14. Legacy deletion starts early.
15. Snapshot is built on unverified or incorrect calculation.
16. Required behavior conflicts with owner legal policy.
```

## Report Application Compliance Check

Each CCB-001 PR completion report must include this checklist:

```text
# CCB-001 REPORT APPLICATION COMPLIANCE CHECK

A. Context lock
[ ] CCB-001 scope preserved.
[ ] Legacy vs canonical debate not reopened.
[ ] Only current PR scope implemented.
[ ] Future PR work not implemented early.

B. Owner policy compliance
[ ] Canonical target followed.
[ ] Legacy production authority not created.
[ ] Case-scoped payment workflow preserved.
[ ] Automatic cross-case payment allocation not implemented.
[ ] TBK100 intra-case allocation rule preserved.
[ ] Principal effect limited to principal allocation.
[ ] Currency-aware rule not violated.
[ ] Trace/audit requirement addressed or marked blocker.

C. Mathematical correctness
[ ] Same inputs -> same output invariant preserved.
[ ] Rounding/currency/date behavior not left ambiguous.
[ ] Reversal/refund/cancel tested or explicitly out of scope.
[ ] Overpayment not mixed into principal/interest buckets.

D. Legal defensibility
[ ] Legal basis of calculation stated.
[ ] Allocation legal basis produced or missing basis marked blocker.
[ ] UI/report/document effect evaluated.
[ ] Court/expert explainability risk stated.

E. Test compliance
[ ] Fail-first test written first when required.
[ ] Test commands run or non-run reason stated.
[ ] Red/green result reported.
[ ] Golden fixture impact stated.

F. Deletion safety
[ ] Legacy not deleted early.
[ ] Migration/golden/reference parts preserved.
[ ] Wrapper candidates separated.
[ ] Shadow/diff cleanup not done early.

G. Final verdict
Choose exactly one:
[ ] PR COMPLETE
[ ] PR INCOMPLETE
[ ] BLOCKED
[ ] VERIFICATION REQUIRED
[ ] OWNER DECISION REQUIRED

H. Next action
Recommend only the next approved PR in sequence.
```

## Consequences

### Positive

- One legal calculation authority becomes the explicit product target.
- Implementation order is constrained enough to prevent unsafe UI or legacy cleanup jumps.
- Reversal, NO_BUCKETS, TBK100, interest-base, FX, fee, and trace risks are treated as gates, not later polish.

### Negative

- Cutover becomes a multi-PR hardening program.
- UI/API/report consolidation must wait for legal calculation gates.
- Legacy code may remain temporarily as fixture, adapter, or diagnostic reference.

### Neutral

- This ADR changes no runtime behavior by itself.
- Existing shadow/diff tooling remains diagnostic until the required gates are closed.

## References

- `project/apps/api/src/modules/interest-engine/interest-engine.service.ts`
- `project/apps/api/src/modules/interest-engine/orchestration/case-balance.service.ts`
- `project/apps/api/src/modules/interest-engine/orchestration/case-balance-display.ts`
- `project/apps/api/src/modules/balance-display-shadow-diff`
- `project/apps/api/src/modules/case/case.service.ts`
- `project/apps/web/src/components/finance/HesapOzetiPanel.tsx`
- `project/apps/web/src/hooks/useCaseCalculation.ts`
- ADR-010: AccountingJournal North-Star Source of Truth
- CCB-001 Constitution Report, 2026-07-05
- GOV-ADR-NAMING-000 (`decision-log.md`, 2026-07-09): established `ADR-012` = Waiting & Progress Policy on `main`, reserved `ADR-013` for this line
- CCB-001 Branch Merge Reconciliation Analysis (`decision-log.md`, 2026-07-10): scope clarification (Option C) that produced this file

## Revision History

| Date | Version | Change |
|---|---|---|
| 2026-07-05 | 1.0 | Initial CCB-001 constitution ADR, drafted on isolated `codex/ccb-001-pr1-pr6-rescue` branch as `ADR-012-CCB-001-CANONICAL-LEGAL-CALCULATION-CORE.md`. Canonical target accepted, immediate cutover blocked, hardening PR sequence locked. |
| 2026-07-10 | 1.1 | Renumbered to `ADR-013` and created on `main` (this file), resolving the `ADR-012` naming collision with `ADR-012-WAITING-PROGRESS-POLICY.md` (`GOV-ADR-NAMING-000`, PR #1002). Owner clarified `ADR-013`'s scope (Option C): this document — Canonical Legal Calculation Core — is the full scope; Fee Projection, Snapshot, Journal, and tariff/statutory-constant/contractual classification are sub-components within it, not separate ADRs. No substantive rule/invariant/PR-sequence content changed from v1.0. CCB-001 branch implementation itself remains unmerged; this file establishes the architecture record on `main` independent of that merge. |
