# ADR: Guarded Summary Backend Canonical Contract

Status: Proposed

Date: 2026-06-26

## Status

Proposed.

Docs-only.

No implementation in this ADR.

## Scope

This ADR records the minimum backend canonical contract required before guarded
`HesapOzetiPanel` controlled cutover can treat the following rows as canonical:

- `tazminat`
- `komisyon`
- `takipOncesiFaiz`

This document is docs-only. It does not implement runtime behavior, change API
contracts, change database schema, change formulas, wire frontend adoption, or
open primary display cutover.

## Context

The guarded summary work has intentionally moved in small, fail-closed steps:

- TM11 introduced the source authority readiness gate.
- TM12 classified rows by placement and source authority.
- TM13 characterized mixed surfaces and retained legacy boundaries.
- TM14 added the non-rendered guarded summary runtime boundary plan.
- TM15 hardened the boundary plan with test invariants.
- TM16 added a wrapper that carries the guarded result and boundary plan without
  rendering adoption.
- TM17 researched wrapper adoption and stopped production adoption.
- TM18 found backend contract blockers for rows that the frontend cannot
  canonicalize safely.
- TM19 researched the backend contract design and confirmed that `tazminat`,
  `komisyon`, and `takipOncesiFaiz` are not ready for frontend canonicalization.

The current safe posture is deliberate: the frontend may know that these rows
exist, but it must not promote them to canonical authority without a backend
contract that states calculation basis, provenance, inclusion semantics, payment
allocation semantics, and unsupported behavior.

## Problem Statement

Controlled primary cutover is blocked while `tazminat`, `komisyon`, and
`takipOncesiFaiz` remain legacy/backend-contract-required rows.

The frontend must not canonicalize these rows from aggregate canonical buckets,
legacy fields, display labels, or inferred formulas. A future backend contract
must explicitly state whether each row is supported, not applicable,
unsupported, or errored for the requested case and `asOfDate`.

`MahsupDetayPanel` / `mahsupDetayPanelContext` remains a hard mixed-authority
blocker. A backend contract for the three rows is necessary, but it is not
sufficient to make the mahsup detail surface canonical-safe.

## Current Runtime And Source Paths

The live primary UI path is still legacy calculation summary:

```text
HesapOzetiPanel
  -> useCaseCalculation()
  -> GET /cases/:id/calculation-summary
  -> CaseController.getCalculationSummary()
  -> CaseService.getCalculationSummary()
```

The shadow/canonical observation path is separate:

```text
HesapOzetiPanel / useBalanceShadowDiff()
  -> GET /balance-display-shadow-diff/:caseId
  -> BalanceDisplayShadowDiffService
  -> CaseBalanceService.computeCaseBalance()
```

The current guarded display selection is:

```text
displayHesap = guardedPrimaryHesap ?? hesap
```

`buildGuardedPrimaryCalculationResult()` only overwrites the guarded canonical
primary rows. `tazminat`, `komisyon`, and `takipOncesiFaiz` are currently
backend-contract-required rows and remain legacy when a guarded result is
selected.

## Current Row Findings

### `tazminat`

Current producer:

- `CaseService.getCalculationSummary()` in the legacy
  `/cases/:id/calculation-summary` path.

Current authority:

- Legacy calculation summary.
- Not a canonical primary display row.

Current data basis:

- Check cases are detected from `kalemTuru === 'CEK' || kalemTuru === 'CHECK'`.
- Current legacy finding: generated as `asilAlacak * 0.10` for check cases.
- Non-check cases receive `0`.

Current inclusion semantics:

- Included in `takipTutari`.
- Included indirectly in `toplamBorc`, `sonBorc`, and `kalanBorc`.
- Not authority for `toplamTahsilat`.
- Not authority for `kalanAnapara`.

Canonical/shadow status:

- Canonical side has `CHECK_PENALTY` / `CEK_TAZMINATI` concepts.
- The current `CaseBalanceDisplay` contract exposes aggregate buckets such as
  `OTHER_ANCILLARY`; it does not expose a row-level `tazminat` contract.

Why frontend cannot treat it as canonical today:

- The frontend cannot infer whether `CEK_TAZMINATI` is present, supported, not
  applicable, omitted, or aggregated into another bucket.
- The frontend cannot infer legal basis, source evidence, rate source, or
  payment allocation impact from current display aggregates.

### `komisyon`

Current producer:

- `CaseService.getCalculationSummary()` in the legacy
  `/cases/:id/calculation-summary` path.

Current authority:

- Legacy calculation summary.
- Not a canonical primary display row.

Current data basis:

- Check cases are detected from `kalemTuru === 'CEK' || kalemTuru === 'CHECK'`.
- Current legacy finding: generated as `asilAlacak * 0.003` for check cases.
- Non-check cases receive `0`.

Current inclusion semantics:

- Included in `takipTutari`.
- Included indirectly in `toplamBorc`, `sonBorc`, and `kalanBorc`.
- Not authority for `toplamTahsilat`.
- Not authority for `kalanAnapara`.

Canonical/shadow status:

- `KOMISYON` exists as a domain category in canonical/allocation concepts.
- Current display/shadow output does not expose a row-level `komisyon`
  authority contract.

Why frontend cannot treat it as canonical today:

- There is observed rate, category, and source-authority ambiguity.
- Current canonical buckets do not prove whether `komisyon` is supported,
  excluded, included as a cost, or unavailable.
- Frontend canonicalization would hide a legal/accounting decision behind UI
  inference.

### `takipOncesiFaiz`

Current producer:

- `CaseService.getCalculationSummary()` in the legacy
  `/cases/:id/calculation-summary` path.

Current authority:

- Legacy calculation summary.
- Not a canonical primary display row.

Current data basis:

- Current legacy calculation summary initializes `takipOncesiFaiz` as `0`.
- Current legacy interest segments are empty.

Current inclusion semantics:

- Included in `takipTutari` if non-zero.
- Included indirectly in `toplamBorc`, `sonBorc`, and `kalanBorc`.
- Not authority for `toplamTahsilat`.
- Not authority for `kalanAnapara`.

Canonical/shadow status:

- The canonical interest engine has a `preEnforcementInterest` concept.
- The current display/shadow contract exposes aggregate `ACCRUED_INTEREST`.
- Shadow diff compares legacy `takipOncesiFaiz + takipSonrasiFaiz` with
  canonical `ACCRUED_INTEREST`.
- It does not expose `takipOncesiFaiz` as a separate primary row.

Why frontend cannot treat it as canonical today:

- Aggregate `ACCRUED_INTEREST` mixes pre- and post-enforcement interest for
  display comparison.
- The frontend cannot infer split, date range, segment basis, or unsupported
  reason from the aggregate bucket.

## Decision

Use a generic canonical summary row contract rather than three separate
top-level DTO fields.

The contract should be exposed first as a shadow/canonical backend contract
before any primary display promotion. The frontend must keep `tazminat`,
`komisyon`, and `takipOncesiFaiz` as backend-contract-required rows until the
backend contract exists and is tested.

Unsupported or missing target rows must fail closed for controlled primary
cutover. A zero amount is valid only when the backend explicitly reports
`SUPPORTED` or `NOT_APPLICABLE` according to the row semantics. A missing value,
malformed value, aggregate-only value, or `UNSUPPORTED` / `ERROR` status is not
canonical display authority.

The backend contract is separate from:

- diagnostic display separation
- `MahsupDetayPanel` source-model resolution
- primary display cutover
- PaymentDesignation implementation
- ClaimItem refactor

## Minimum Canonical Row Contract

The conceptual contract is:

```ts
interface CanonicalSummaryRow {
  rowId: 'tazminat' | 'komisyon' | 'takipOncesiFaiz' | string;
  amount: number | null;
  currency: string;
  asOfDate: string;
  calculatedAt: string;
  status: 'SUPPORTED' | 'NOT_APPLICABLE' | 'UNSUPPORTED' | 'ERROR';
  sourceAuthority: 'CANONICAL';
  includedInTotals: {
    takipTutari?: boolean;
    toplamBorc?: boolean;
    sonBorc?: boolean;
    kalanBorc?: boolean;
    toplamTahsilat?: boolean;
    kalanAnapara?: boolean;
    displayOnly?: boolean;
    detailOnly?: boolean;
  };
  affectsPaymentAllocation: boolean;
  allocationCategory?: string;
  calculationBasis?: Record<string, unknown>;
  legalBasis?: {
    code?: string;
    label?: string;
    source?: string;
    version?: string;
  };
  rate?: {
    kind: 'PERCENTAGE' | 'FIXED_AMOUNT' | 'SEGMENTED' | 'NONE';
    value?: number;
    source?: string;
  };
  provenance?: {
    engine: string;
    sourceReferences?: string[];
    claimItemIds?: string[];
    instrumentIds?: string[];
    sourceDocumentIds?: string[];
  };
  diagnostics?: string[];
  unsupportedReason?: string;
  sourceVersion?: string;
}
```

This shape is conceptual. This ADR does not add the type, endpoint, DTO field,
schema, migration, or frontend wiring.

## Row Contract Requirements

### `tazminat`

Minimum required fields:

- `rowId = 'tazminat'`
- `amount`
- `currency`
- `status`
- `asOfDate`
- `sourceAuthority`
- `includedInTotals`
- `affectsPaymentAllocation`
- `allocationCategory`, expected to map to the canonical check penalty /
  compensation category if supported
- `calculationBasis.principalAmount`
- `rate`
- `legalBasis`
- `provenance`
- `diagnostics` or `unsupportedReason`

Unresolved questions:

- Which backend source is canonical for this row: direct engine calculation,
  `ClaimItem`, instrument-derived rule, or another contract source?
- Which legal basis and rule version must be surfaced?
- Whether the row must be represented as `CEK_TAZMINATI`, `PENALTY`, or a
  display-specific row mapped from those categories.
- Which source references are required for check/instrument provenance.

### `komisyon`

Minimum required fields:

- `rowId = 'komisyon'`
- `amount`
- `currency`
- `status`
- `asOfDate`
- `sourceAuthority`
- `includedInTotals`
- `affectsPaymentAllocation`
- `allocationCategory`, expected to map to `KOMISYON` if supported
- `calculationBasis.principalAmount`
- `rate`
- `legalBasis`
- `provenance`
- `diagnostics` or `unsupportedReason`

Unresolved questions:

- The rate source must be fixed before primary display promotion.
- The backend must decide whether `komisyon` is a cost, ancillary, penalty-like
  charge, or a display row mapped from a lower-level category.
- The source authority must be explicit because the current runtime and domain
  concepts do not yet provide a row-level display contract.

### `takipOncesiFaiz`

Minimum required fields:

- `rowId = 'takipOncesiFaiz'`
- `amount`
- `currency`
- `status`
- `asOfDate`
- `calculatedAt`
- `sourceAuthority`
- `includedInTotals`
- `affectsPaymentAllocation`
- `allocationCategory`, expected to map to interest if supported
- `calculationBasis` with start date, end date, principal base, rate source,
  day-count basis, and segment identifiers where applicable
- `legalBasis`
- `provenance`
- `diagnostics` or `unsupportedReason`

Unresolved questions:

- How to expose the pre-enforcement split without reusing aggregate
  `ACCRUED_INTEREST` as if it were row-level authority.
- Whether demanded pre-enforcement interest ClaimItems are input configuration,
  display amounts, or excluded from canonical balance until a separate legal
  decision.
- How payment allocation should report reductions against pre-enforcement
  interest versus post-enforcement interest.

## Inclusion And Totals Semantics

For each row, the backend contract must state whether the row is included in:

- `takipTutari`
- `toplamBorc`
- `sonBorc`
- `kalanBorc`
- `toplamTahsilat`
- `kalanAnapara`

The backend contract must also state whether the row is:

- primary display authority
- display-only
- detail-only
- diagnostic-only
- excluded from primary totals

The frontend must not derive these semantics from row labels, current legacy
math, or canonical aggregate buckets.

## Payment Allocation And Mahsup Semantics

For each row, the backend contract must state:

- whether payment allocation can reduce the row
- which allocation category applies
- whether that category is canonical legal authority or only a display bucket
- whether future `PaymentApplication` category output is required before
  primary display promotion
- whether reductions can be shown in `MahsupDetayPanel`

Current canonical concepts include category allocation, but the frontend must
not infer row-level payment impact from aggregate buckets. For example:

- `CHECK_PENALTY` can map to penalty-like or `CEK_TAZMINATI` concepts, but the
  current primary UI row contract is not present.
- `KOMISYON` exists as a category concept, but row-level support and inclusion
  are not established.
- `PRE_INTEREST` / `POST_INTEREST` can be interest concepts, but current display
  comparison uses aggregate `ACCRUED_INTEREST`.

## Date And As-Of Semantics

For each row, the backend contract must state:

- whether the amount depends on `takipTarihi`
- whether the amount depends on `hesapTarihi` / `asOfDate`
- whether the amount accrues over time
- whether the amount is fixed after a legal event
- whether interest segments are involved
- whether same-day payment and rounding rules affect the row

`tazminat` and `komisyon` may be fixed charges in some contexts, but the backend
contract must still report the basis and applicability. `takipOncesiFaiz` is
date and segment sensitive by nature and cannot be promoted from an aggregate
interest bucket.

## Null, Zero, And Unsupported Semantics

Zero amount is not equivalent to unsupported.

Required semantics:

- `amount = 0` with `SUPPORTED` can mean the row was calculated and the result is
  zero.
- `amount = 0` with `NOT_APPLICABLE` can be safe only when backend explicitly
  states that the row does not apply for the case.
- `amount = null` is not canonical unless paired with `NOT_APPLICABLE`,
  `UNSUPPORTED`, or `ERROR` and clear diagnostics.
- missing, malformed, or aggregate-only values are not canonical.
- `UNSUPPORTED` and `ERROR` must block controlled primary cutover for the row.

## Provenance And Legal Basis

Each supported row must expose enough provenance for audit and future tests:

- calculation basis
- principal or source amount used
- rate or fixed-amount source
- legal basis or rule source
- source document, instrument, claim item, or engine references where applicable
- engine/version identifier
- diagnostics for missing or unsupported input

The backend contract must distinguish a legal/accounting decision from a display
formatting decision. The frontend must not fill provenance gaps.

## Tenant And Case Access Considerations

The contract must remain tenant-scoped.

Existing access boundaries must remain unchanged:

- tenant context continues to come from authenticated user context
- case reads must remain scoped by `caseId` and `tenantId`
- claim item, ledger, collection, overpayment, and shadow reads must remain
  scoped to the same tenant/case boundary
- no cross-tenant data exposure is allowed
- adding canonical rows must not bypass existing guards or introduce a looser
  read path

This ADR does not change guards, controller behavior, tenant lookup, or access
policy.

## Alternatives Considered

### A. Explicit Top-Level Canonical Fields

Benefits:

- Easy for the frontend to consume.
- Simple DTO shape for three known rows.

Risks:

- Encourages one-off field growth.
- Makes provenance, unsupported status, and allocation semantics harder to keep
  consistent across rows.
- Can suggest primary readiness before legal/accounting semantics are complete.

Frontend impact:

- Low parsing cost, but high risk of over-trusting fields.

Backend impact:

- Requires bespoke DTO work for each row.

Migration/schema risk:

- None if DTO-only, but later persistence pressure is likely.

Multitenant/access risk:

- Low if implemented in existing guarded paths; still must be audited.

Testability:

- Straightforward field assertions, weaker invariant coverage.

Cutover readiness value:

- Partial. Does not naturally encode fail-closed row status.

Recommendation:

- Not recommended as the primary contract shape.

### B. Generic Canonical Adjustment / Summary Rows

Benefits:

- Gives every row the same status, provenance, inclusion, date, and allocation
  semantics.
- Supports future rows without changing the contract shape.
- Keeps zero, unsupported, error, and not-applicable states explicit.
- Fits guarded cutover because row readiness can be evaluated independently.

Risks:

- Slightly more verbose DTO.
- Requires frontend and tests to respect status semantics instead of merely
  reading numbers.

Frontend impact:

- Requires row lookup and status handling.
- Prevents unsafe inference.

Backend impact:

- Requires a canonical row builder and row-level diagnostics in a future
  implementation PR.

Migration/schema risk:

- None for contract-only design; future persistence remains a separate decision.

Multitenant/access risk:

- Low if built inside existing tenant-scoped read paths.

Testability:

- Strong. Each row can be tested for status, inclusion, provenance, and
  fail-closed behavior.

Cutover readiness value:

- High.

Recommendation:

- Recommended contract shape.

### C. Keep Legacy Diagnostic Only

Benefits:

- Safest short-term runtime posture.
- No backend/API change.
- Avoids pretending aggregate canonical output is row authority.

Risks:

- Does not unblock controlled primary cutover.
- Leaves three rows permanently outside canonical primary display.

Frontend impact:

- No new adoption.

Backend impact:

- No immediate change.

Migration/schema risk:

- None.

Multitenant/access risk:

- None beyond current paths.

Testability:

- Can preserve current invariants, but cannot validate canonical row semantics.

Cutover readiness value:

- Low.

Recommendation:

- Safe fallback, not the target decision.

### D. Shadow-Only Canonical Contract First

Benefits:

- Allows backend contract and diagnostics to mature before primary rendering.
- Supports real evidence collection without user-facing authority changes.
- Keeps primary cutover fail-closed.

Risks:

- Requires discipline so shadow output is not treated as primary-ready too soon.
- May need additional tests around unsupported/error semantics.

Frontend impact:

- None until explicit adoption.

Backend impact:

- Future implementation can add contract output in shadow/canonical paths first.

Migration/schema risk:

- None if implemented as read DTO first.

Multitenant/access risk:

- Low if exposed through existing guarded tenant/case paths.

Testability:

- Strong for readiness evidence.

Cutover readiness value:

- High as a rollout phase.

Recommendation:

- Recommended rollout phase for the generic row contract.

### E. Docs/ADR Before Implementation

Benefits:

- Freezes contract boundaries before implementation.
- Prevents accidental frontend canonicalization.
- Gives later backend/API/test PRs a scope control document.

Risks:

- Does not itself create runtime support.
- Must be followed by implementation and test work before cutover.

Frontend impact:

- No runtime change.

Backend impact:

- No runtime change.

Migration/schema risk:

- None.

Multitenant/access risk:

- None.

Testability:

- Indirect now; future PRs can test against the ADR.

Cutover readiness value:

- High as a planning gate, not as runtime evidence.

Recommendation:

- Recommended current step.

## MahsupDetayPanel Requirement

`MahsupDetayPanel` remains a hard mixed-authority blocker because it can receive
detail data, principal values, and remaining principal values from
`displayHesap`. When guarded primary values are selected, some summary numbers
may be canonical-derived while `mahsupDetaylari` can still be legacy or empty
legacy detail. That can make a mixed surface look coherent even though its
source model is not canonical-safe.

A backend contract for `tazminat`, `komisyon`, and `takipOncesiFaiz` is not
sufficient to unblock `MahsupDetayPanel`.

Before controlled primary cutover, `MahsupDetayPanel` needs one of these:

- authority-separated context
- explicit diagnostic separation
- backend-provided canonical detail model with source and allocation semantics

It must not be presented as canonical-safe merely because the three target rows
receive a backend row contract.

## Cutover Gates

Controlled primary cutover cannot be discussed until all of the following are
true:

- `tazminat`, `komisyon`, and `takipOncesiFaiz` have canonical backend row
  contracts or are separated from the primary surface.
- backend row status semantics are implemented and tested.
- source, provenance, inclusion, date, and allocation semantics are clear.
- `MahsupDetayPanel` mixed authority is resolved or separated.
- fallback/hard no-go behavior remains fail-closed.
- legal/accounting/product sign-off is obtained where required.

Any `UNSUPPORTED`, `ERROR`, missing, malformed, or aggregate-only target row
must block primary promotion for that row.

## Non-Goals

This ADR does not:

- implement backend behavior
- change API contracts
- change DB schema
- add migrations
- change formulas
- change frontend runtime wiring
- change UI rendering
- open primary cutover
- broaden guarded pilot scope
- change `HesapOzetiPanel`
- change `buildGuardedPrimaryCalculationResult()`
- refactor PaymentDesignation
- refactor ClaimItem
- change dependencies or lockfiles
- change generated files
- change currency formatting

## Consequences

The frontend continues to treat `tazminat`, `komisyon`, and
`takipOncesiFaiz` as backend-contract-required rows.

Diagnostic separation remains separate future work.

Backend contract design becomes a prerequisite for later implementation,
contract test, DTO, and primary cutover planning.

Future PRs can reference this ADR for scope control and must not claim guarded
primary readiness until the contract gates above are satisfied.
