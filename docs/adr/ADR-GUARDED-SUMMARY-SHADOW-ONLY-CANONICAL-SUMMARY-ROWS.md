# ADR: Guarded Summary Shadow-Only Canonical Summary Rows Exposure Plan

Status: Proposed

Date: 2026-06-26

## Status

Proposed.

Docs-only.

No implementation in this ADR.

## Purpose

This document plans how `canonicalSummaryRows` should enter the guarded summary
architecture as shadow-only evidence before any primary display promotion.

The target rows are:

- `tazminat`
- `komisyon`
- `takipOncesiFaiz`

The plan exists to sequence future work. It does not add DTO fields, change API
responses, change backend producers, change frontend consumers, or alter the
rendered `HesapOzetiPanel` values.

## Non-goals

TM23 does not:

- implement `canonicalSummaryRows`
- change backend production source
- change frontend source
- add or modify tests
- change DTOs or API contracts
- change formulas
- change tenant or case access behavior
- change DB schema or add migrations
- change dependency, lockfile, generated, or formatting artifacts
- alter currency formatting
- broaden the guarded pilot scope
- add telemetry, diagnostics surfaces, feature flags, or visible UI source labels
- remove legacy rows
- canonicalize legacy-only rows
- fix `MahsupDetayPanel` mixed authority
- wire TM12, TM14, or TM16 into rendered UI
- change `HesapOzetiPanel`
- change `buildGuardedPrimaryCalculationResult()` or its return shape
- perform primary cutover
- refactor PaymentDesignation
- refactor ClaimItem

## Current State After TM20 And TM22

TM20 decided that `tazminat`, `komisyon`, and `takipOncesiFaiz` require a generic
backend canonical row contract before frontend canonicalization. The ADR rejected
three independent top-level DTO fields and required explicit row status,
provenance, inclusion, and allocation semantics.

TM22 added a backend characterization test for the current shadow/display
boundary. The test locks the present state in CI:

- `tazminat`, `komisyon`, and `takipOncesiFaiz` are not canonical row authority
  today.
- legacy/raw presence does not imply canonical promotion.
- shadow output remains `SHADOW_ONLY`.
- primary display remains unchanged.

The live primary path remains legacy:

```text
HesapOzetiPanel
  -> useCaseCalculation()
  -> GET /cases/:id/calculation-summary
  -> CaseController.getCalculationSummary()
  -> CaseService.getCalculationSummary()
```

The shadow/canonical observation path remains separate:

```text
HesapOzetiPanel / useBalanceShadowDiff()
  -> GET /interest-engine/case/:caseId/balance/display/shadow-diff
  -> BalanceDisplayShadowDiffController.getShadowDiff()
  -> BalanceDisplayShadowDiffService.compare()
  -> CaseBalanceService.computeCaseBalance()
  -> toCaseBalanceDisplay()
```

## Proposed Shadow-Only Exposure Sequence

`canonicalSummaryRows` should enter the system in staged form:

- Stage 0: keep the TM22 state as the baseline. No canonical row authority exists
  for the three target rows.
- Stage 1: introduce an internal backend canonical summary row producer in the
  case balance display path.
- Stage 2: expose `canonicalSummaryRows` only through
  `balance-display-shadow-diff` or an equivalent shadow-only response.
- Stage 3: add backend tests for shadow-only exposure, fail-closed row status,
  tenant/case scoping, and unchanged primary display.
- Stage 4: allow frontend shadow-only parsing without rendering and without
  changing `HesapOzetiPanel` values.
- Stage 5: only after all gates, consider controlled primary display promotion.

This sequence does not approve primary cutover.

## Recommended DTO Ownership

The likely owner is `CaseBalanceDisplay` or an equivalent canonical balance
display model, not `calculation-summary`.

Rationale:

- `calculation-summary` is the current legacy primary display DTO.
- `CaseBalanceDisplay` already carries canonical authority, totals, buckets,
  diagnostics, unsafe sources, provenance, tenantId, caseId, and as-of context.
- `BalanceDisplayShadowDiffService.compare()` already combines legacy
  `calculation-summary` with canonical display evidence in a read-only
  `SHADOW_ONLY` report.

The internal producer may be a pure helper owned by the case balance display
module, but the first public exposure should remain shadow-only.

## Recommended Response Boundary

The first external response boundary should be
`GET /interest-engine/case/:caseId/balance/display/shadow-diff` or an equivalent
shadow response.

`GET /cases/:id/calculation-summary` should remain legacy for now.

When implemented, adding `canonicalSummaryRows` to any response is an API
contract change even if the field is shadow-only. TM23 only documents the plan;
it does not perform that contract change.

## Conceptual canonicalSummaryRows Row Shape

This is a conceptual shape, not a DTO implementation:

```ts
interface CanonicalSummaryRowPlan {
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
    sourcePath: string;
    sourceIds?: string[];
    warnings?: string[];
  };
  diagnostics?: Array<{
    code: string;
    severity: 'INFO' | 'WARNING' | 'BLOCKER';
    message: string;
  }>;
}
```

## Required Target Row IDs

The first row set is closed and explicit:

- `tazminat`
- `komisyon`
- `takipOncesiFaiz`

Future row IDs may be added only after they receive the same authority,
provenance, inclusion, allocation, and fail-closed semantics.

## Required Status Semantics

`SUPPORTED` means the backend can provide canonical authority for the row for
the requested case and as-of date.

`NOT_APPLICABLE` means the row is explicitly not applicable for the requested
case and as-of date. A zero amount can be canonical only under this status or
under `SUPPORTED` with a proven zero amount.

`UNSUPPORTED` means the backend knows the row exists as a display concern but
cannot provide canonical authority yet.

`ERROR` means the backend attempted row production but could not produce a safe
canonical row.

`UNSUPPORTED`, `ERROR`, malformed rows, missing rows, and aggregate-only values
must fail closed for primary promotion.

## Zero, Null, And Missing Semantics

Zero is not automatically safe.

- `amount = 0` with `SUPPORTED` can mean a proven zero amount.
- `amount = 0` with `NOT_APPLICABLE` can mean the row does not apply.
- `amount = null` with `UNSUPPORTED` or `ERROR` is not display authority.
- a missing row is not display authority.
- an aggregate bucket such as `ACCRUED_INTEREST` is not row authority for
  `takipOncesiFaiz` by itself.

Primary promotion must treat missing, null-unsafe, aggregate-only, unsupported,
and errored rows as blockers.

## Source Authority Semantics

The source authority for `canonicalSummaryRows` must be canonical balance/display
evidence, not legacy `calculation-summary` raw fields.

Legacy fields may be present in the shadow report for comparison, but they must
not be interpreted as canonical rows. TM22 already characterizes this boundary.

A future implementation should keep authority labels explicit:

- `LEGACY_DISPLAY` for current `calculation-summary`
- `SHADOW_ONLY` for shadow display evidence before cutover
- `CANONICAL` only on row-level contracts that satisfy the required semantics

## Inclusion And Totals Semantics

Each row must state how it relates to totals. The row amount alone is not enough.

The backend must declare whether the row is included in:

- `takipTutari`
- `toplamBorc`
- `sonBorc`
- `kalanBorc`
- `toplamTahsilat`
- `kalanAnapara`

Rows may also be `displayOnly` or `detailOnly`. The implementation must avoid
silently double-counting rows that are already represented in canonical buckets
or projections.

## Payment Allocation Semantics

Row exposure does not solve payment allocation semantics.

A canonical row may affect allocation only when the backend can map it to a
stable category such as principal, interest, cost, ancillary, held overpayment,
or a later PaymentApplication category.

PaymentDesignation and PaymentApplication remain separate domain work. The first
shadow-only row implementation must not imply that restricted payments,
earmarks, instrument-specific application, or ClaimItem-derived collected amounts
are canonical allocation authority.

## MahsupDetayPanel Blocker Handling

`MahsupDetayPanel` and `mahsupDetayPanelContext` remain hard mixed-authority
blockers.

A backend row contract for `tazminat`, `komisyon`, and `takipOncesiFaiz` is
necessary but not sufficient to make the mahsup detail surface canonical-safe.

Any future implementation must keep this separation explicit. Shadow-only row
exposure must not mark the detail panel as canonical-safe and must not make the
rendered primary UI look fully canonical while details remain legacy, empty, or
mixed.

## Tenant And Case Access Requirements

Future implementation must preserve the existing tenant/case guard model:

- tenantId comes only from auth context, not client body or query.
- caseId comes from the route parameter.
- all case, claim, ledger, collection, overpayment, and diagnostic reads stay
  scoped by `tenantId` and `caseId`.
- cross-tenant mismatch must not become comparable canonical evidence.
- shadow-only response must remain read-only and must not persist calculated
  rows as a side effect.

TM23 does not change access behavior.

## Provenance, Legal Basis, And Source Reference Plan

A row is not sufficiently canonical without source explanation.

Future rows should carry enough provenance to answer:

- which engine or helper produced the row
- which source path and source IDs were used
- which legal basis or product rule applies
- which rate or fixed amount basis was applied
- whether warnings or blockers affected the row

Persistent DB-backed provenance is out of scope until product/legal requirements
say source references must survive independently of the shadow response. If that
becomes mandatory, DB/schema work should be designed separately.

## Formula And Rules Unresolved Questions

These decisions remain unresolved for implementation:

- whether `komisyon` is cost, ancillary, bank commission, instrument-derived
  charge, or another category for each case type
- why legacy `CaseService.getCalculationSummary()` uses a different commission
  basis than `CekTazminatService` characterization tests
- whether `tazminat` should come from instrument facts, ClaimItem semantics,
  engine rules, or another source
- how explicit `PRE_INTEREST` amounts interact with computed pre-enforcement
  interest
- whether `takipOncesiFaiz` is demanded amount, computed amount, segmented
  interest, or a display split from aggregate `ACCRUED_INTEREST`
- how old `INTEREST` and `POST_INTEREST` records should be treated without
  unsafe normalization or double counting

No formulas are changed by TM23.

## Testing Plan

Future implementation PRs should add tests before or with source changes.

Required backend tests:

- primary display remains unchanged
- `calculation-summary` remains legacy
- `canonicalSummaryRows` are shadow-only
- target rows have explicit status semantics
- unsupported, missing, malformed, and aggregate-only rows fail closed
- zero is accepted only under `SUPPORTED` or `NOT_APPLICABLE`
- tenant/case scoping is preserved
- legacy/raw fields are not promoted to canonical rows
- no numeric legacy formula is frozen as desired canonical behavior unless the
  specific formula has a separate legal/product decision

Future frontend tests may parse shadow metadata without rendering it, but they
must not change `HesapOzetiPanel` rendered values.

## Implementation Sequencing

Stage 0: Current state locked by TM22.

Stage 1: Add an internal backend canonical summary row producer in the case
balance display path.

Stage 2: Expose rows only through `balance-display-shadow-diff` or an equivalent
shadow-only response.

Stage 3: Add backend tests for unchanged primary display, legacy
`calculation-summary`, shadow-only rows, fail-closed row semantics, and tenant
scoping.

Stage 4: Add frontend shadow-only parsing without rendering and without changing
`HesapOzetiPanel`.

Stage 5: Consider controlled primary promotion only after all backend, frontend,
mahsup detail, legal/accounting, and product gates are satisfied.

## Rollback And Fail-Closed Behavior

The first implementation must be removable without changing primary display.

If row production fails, returns `UNSUPPORTED`, returns `ERROR`, omits a target
row, or produces malformed data, the system must:

- keep primary display on legacy authority
- keep `primaryDisplayUnchanged = true` for shadow responses
- report blockers or diagnostics in shadow evidence
- avoid substituting aggregate buckets or legacy raw fields as canonical rows
- avoid silent zero fallback

## Explicitly Forbidden Changes For The First Implementation PR

The first implementation PR must not:

- change rendered `HesapOzetiPanel` values
- change `buildGuardedPrimaryCalculationResult()` or its return shape
- change `calculation-summary` primary behavior
- add top-level `tazminat`, `komisyon`, or `takipOncesiFaiz` canonical DTO fields
- use legacy raw values as canonical row authority
- use aggregate `ACCRUED_INTEREST` alone as `takipOncesiFaiz`
- silently treat missing rows as zero
- implement PaymentDesignation or ClaimItem refactors
- change DB schema or migrations unless a separate provenance decision requires
  it
- broaden guarded pilot scope or perform primary cutover

## Required Design Decisions

TM23 takes these positions:

1. `canonicalSummaryRows` should not originate from `calculation-summary`.
2. `calculation-summary` should remain legacy for now.
3. The likely owner is `CaseBalanceDisplay` or an equivalent canonical balance
   display model.
4. The first external exposure should be `balance-display-shadow-diff` or an
   equivalent shadow response.
5. Shadow-only exposure must not change primary display behavior.
6. Shadow-only exposure is still an API contract change when implemented.
7. A type-only DTO skeleton is premature unless tied to an implementation PR.
8. `MahsupDetayPanel` remains a hard mixed-authority blocker.
9. Payment allocation/category semantics are not solved by row exposure alone.
10. DB/schema work stays out of scope unless persistent provenance/source
    references become mandatory.

## Planning Matrix

| Stage | Candidate change | Files likely touched later | API contract impact | Source-code impact | Formula risk | Tenant/access risk | DB/schema risk | UI/user-facing risk | Test coverage needed | Allowed in first implementation PR? | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 0 | Docs-only exposure plan | `docs/adr/...` | No | No | None | None | None | None | `git diff --check` | Yes | TM23 only documents sequencing. |
| 1 | Backend internal canonical row builder | api display helper/service files | No if internal only | Yes | Medium | Medium | None | None | unit tests for statuses and row source | Yes | Should be pure/read-only and owned by display path. |
| 2 | Case balance display object extension | `case-balance-display.ts`, tests | Yes if response changes | Yes | Medium | Medium | None | Low if not consumed | DTO/contract tests | Maybe | Prefer when paired with shadow response tests. |
| 3 | `balance-display-shadow-diff` shadow response extension | shadow diff types/service/controller tests | Yes | Yes | Medium | Medium | None | Low if not rendered | shadow-only/primary-unchanged tests | Yes | Recommended first external exposure. |
| 4 | `calculation-summary` extension | case controller/service/types/tests | High | Yes | High | Medium | None | High | legacy compatibility tests | No | Keep legacy for now. |
| 5 | Frontend shadow-only parsing | shadow diff API types/hook/tests | Yes consumed client-side | Yes | Low | Low | None | Low if not rendered | parse-only tests | Later | Must not change `HesapOzetiPanel`. |
| 6 | Frontend primary rendering | guarded display/panel/tests | High | Yes | High | Medium | None | High | full guarded cutover suite | No | Requires all gates and sign-off. |
| 7 | MahsupDetayPanel canonicalization | panel/context/backend detail DTOs | High | Yes | High | Medium | Maybe | High | mixed-authority tests | No | Separate hard blocker. |
| 8 | Payment allocation/category work | allocation/domain/payment mapper/schema maybe | High | Yes | High | High | Maybe | Medium | allocation + designation tests | No | Row exposure does not solve this. |
| 9 | DB-backed provenance/source references | schema/migrations/services/tests | High | Yes | Medium | High | High | Low | migration + provenance tests | No | Only if persistent provenance becomes mandatory. |

## Acceptance Statement

Shadow-only `canonicalSummaryRows` exposure is now planned.

`calculation-summary` remains legacy for now. The likely DTO owner is the case
balance display object. The first external surface should be
`balance-display-shadow-diff` or an equivalent shadow response. Primary UI stays
unchanged. No DTO, API, source, test, or runtime implementation is performed by
TM23.