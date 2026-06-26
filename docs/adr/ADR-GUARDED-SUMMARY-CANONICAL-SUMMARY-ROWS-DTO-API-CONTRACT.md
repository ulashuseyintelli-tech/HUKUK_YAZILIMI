# ADR: Guarded Summary Canonical Summary Rows DTO/API Contract Design

## Status

Proposed.

This is a docs-only contract design finalization.

This ADR does not implement `canonicalSummaryRows`.

This ADR does not add DTO/interface source code.

This ADR does not change any API contract in this PR.

## Context

TM20 established the generic canonical summary row direction. The target legacy
financial rows are:

- `tazminat`
- `komisyon`
- `takipOncesiFaiz`

TM20 rejected three separate top-level fields for those rows. A field-specific
DTO would encode early product and legal assumptions before canonical formula
ownership is settled. The contract must be row-oriented, versioned, and able to
carry status, authority, totals participation, allocation semantics, legal
basis, and provenance per row.

TM22 added a backend characterization test for the current boundary. It does
not say legacy formulas are correct canonical behavior. It says the target rows
are not canonical row authority today, legacy/raw presence does not imply
canonical promotion, the shadow report remains `SHADOW_ONLY`, and primary
display remains unchanged.

TM23 planned shadow-only exposure. It kept these architecture decisions:

- `GET /cases/:id/calculation-summary` remains the legacy primary display DTO.
- `CaseBalanceDisplay` or an equivalent canonical balance display model is the
  likely owner of future canonical row evidence.
- `balance-display-shadow-diff` or an equivalent shadow response is the first
  external exposure surface.
- Primary UI behavior remains unchanged until a later explicit promotion gate.

Current primary display flow:

```text
HesapOzetiPanel
  -> useCaseCalculation()
  -> GET /cases/:id/calculation-summary
  -> CaseController.getCalculationSummary()
  -> CaseService.getCalculationSummary()
```

Current shadow evidence flow:

```text
useBalanceShadowDiff()
  -> GET /interest-engine/case/:caseId/balance/display/shadow-diff
  -> BalanceDisplayShadowDiffController.getShadowDiff()
  -> BalanceDisplayShadowDiffService.compare()
  -> CaseService.getCalculationSummary()
  -> CaseBalanceService.computeCaseBalance()
  -> toCaseBalanceDisplay()
```

The shadow endpoint is read-only. Its controller obtains `tenantId` from auth
context and forwards `tenantId`, `caseId`, and the effective date into both
legacy and canonical evidence paths. `CaseBalanceService.computeCaseBalance()`
currently reads case, claim item, ledger, collection, held overpayment, and
blocked overpayment evidence under the same `tenantId + caseId` scope.

## Decision

`canonicalSummaryRows` will be a generic row array.

The first owning model should be `CaseBalanceDisplay` or an equivalent canonical
balance display model. The owner must be a canonical display contract that is
downstream of the ledger/balance engine, not the legacy calculation-summary
primary DTO.

The first external exposure should be `balance-display-shadow-diff` or an
equivalent shadow-only response. The first exposure must preserve:

- `mode: SHADOW_ONLY`
- `primaryDisplayUnchanged: true`
- no rendered value changes
- no primary cutover

`GET /cases/:id/calculation-summary` remains legacy until a later explicit
cutover decision. Adding `canonicalSummaryRows` to that response is not approved
by this ADR.

Primary display remains unchanged. `HesapOzetiPanel`,
`buildGuardedPrimaryCalculationResult()`, and the guarded pilot runtime surface
are not changed by this ADR.

## Conceptual Placement

`canonicalSummaryRows` should live under the canonical/shadow balance display
contract, not under the legacy calculation-summary primary contract.

The exact implementation nesting is left to the implementation PR, but the
contract intent is:

```text
Shadow balance display response
  mode: "SHADOW_ONLY"
  primaryDisplayUnchanged: true
  canonical balance display evidence:
    canonicalSummaryRows: CanonicalSummaryRow[]
```

or, if the future implementation exposes the full canonical display object:

```text
CaseBalanceDisplay
  tenantId
  caseId
  authority
  generatedAt
  asOfDate
  totals
  buckets
  canonicalSummaryRows: CanonicalSummaryRow[]
```

This is conceptual only. No DTO or API source is added here.

## Conceptual Row Shape

The row shape must be explicit enough for audit, fail-closed behavior,
compatibility, and future primary eligibility.

```text
CanonicalSummaryRow {
  rowId: "tazminat" | "komisyon" | "takipOncesiFaiz" | string
  labelKey: string
  displayKey?: string
  amount: number | null
  currency: string
  status: "SUPPORTED" | "NOT_APPLICABLE" | "UNSUPPORTED" | "ERROR"
  sourceAuthority: "CANONICAL" | "LEGACY" | "DERIVED" | "UNKNOWN"
  calculatedAt: string
  asOfDate: string
  includedInTotals: CanonicalSummaryRowTotals
  affectsPaymentAllocation: boolean
  allocationCategory:
    | "EXPENSE"
    | "ACCRUED_INTEREST"
    | "ATTORNEY_FEE"
    | "OTHER_ANCILLARY"
    | "PRINCIPAL"
    | "OVERPAYMENT"
    | "UNSUPPORTED"
    | "UNKNOWN"
  calculationBasis: CanonicalSummaryCalculationBasis
  legalBasis: CanonicalSummaryLegalBasis
  provenance: CanonicalSummaryProvenance
  unsupportedReason?: string
  diagnostics: CanonicalSummaryDiagnostic[]
  contractVersion: string
}
```

Required top-level fields:

- `rowId`
- `labelKey` or `displayKey`
- `amount`
- `currency`
- `status`
- `sourceAuthority`
- `asOfDate` or `calculatedAt`
- `includedInTotals`
- `affectsPaymentAllocation`
- `allocationCategory`
- `calculationBasis`
- `legalBasis`
- `provenance`
- `unsupportedReason`
- `diagnostics`
- `version` or `contractVersion`

## Required Row IDs

The first contract must cover these stable row IDs:

| Row ID | Meaning | Current contract state |
| --- | --- | --- |
| `tazminat` | Check/related compensation row candidate | Backend canonical row authority is absent today. |
| `komisyon` | Commission row candidate | Rate/source/legal basis remains an open formula decision. |
| `takipOncesiFaiz` | Pre-enforcement interest row candidate | Relationship to accrued interest remains an open formula decision. |

Rows may be returned as `UNSUPPORTED`, `NOT_APPLICABLE`, or `ERROR`. Returning
the row does not by itself make it primary eligible.

## Status Semantics

`SUPPORTED` means the row is understood, computable for this case/date/currency,
has enough canonical evidence, and carries a finite `amount`.

`NOT_APPLICABLE` means the row is understood and canonical applicability checks
show it does not apply to this case/date/currency. A zero amount is valid only
when the row explicitly declares `NOT_APPLICABLE` and gives the reason.

`UNSUPPORTED` means the row is recognized by the contract but the product/legal
or engine decision needed to compute it is not approved. It must not be treated
as zero. It blocks primary promotion for that row.

`ERROR` means the row attempted to compute but failed validation, dependency,
currency, context, or arithmetic checks. It blocks primary promotion for that
row.

Primary eligibility requires a passing status:

- `SUPPORTED` with a finite amount, or
- `NOT_APPLICABLE` with explicit canonical applicability evidence and explicit
  zero/null semantics approved by the implementation contract.

`UNSUPPORTED` and `ERROR` are never primary eligible.

## Amount Semantics

Zero is a valid amount when the row status makes zero meaningful:

- `SUPPORTED` may return `0` when the canonical formula says the amount is zero.
- `NOT_APPLICABLE` may return `0` when canonical applicability says the row does
  not apply and the row records that reason.

`null` amount is not equivalent to zero.

A missing row is not equivalent to zero.

An `UNSUPPORTED` row must not be treated as zero.

An `ERROR` row must not be treated as zero.

Malformed, non-numeric, `NaN`, `Infinity`, or otherwise non-finite amounts must
fail closed.

Currency must be explicit. It must remain consistent with the current case
balance currency behavior. Multi-currency or unknown-currency rows are not
primary eligible unless a later contract version explicitly defines safe
semantics.

## Source Authority Semantics

Allowed `sourceAuthority` values:

- `CANONICAL`
- `LEGACY`
- `DERIVED`
- `UNKNOWN`

Only `CANONICAL` rows with passing status semantics are primary eligible.

`LEGACY` means the row originated from the existing legacy
calculation-summary path. It may be useful for shadow comparison, but legacy/raw
presence must not be promoted by presence alone.

`DERIVED` means the row was derived by transformation or reconciliation rather
than directly owned by canonical balance display evidence. It is shadow evidence
only unless a later contract version explicitly promotes its authority.

`UNKNOWN` blocks primary promotion.

Mixed authority blocks primary promotion. A row cannot borrow amount from
legacy summary, legal basis from a canonical source, and allocation semantics
from an unresolved mapper while claiming primary eligibility.

## Inclusion And Totals Semantics

Each row must declare whether and how it participates in display totals. The
contract should not infer this from label, row order, or legacy field presence.

Conceptual shape:

```text
CanonicalSummaryRowTotals {
  takipTutari: "INCLUDED" | "EXCLUDED" | "UNSUPPORTED" | "UNKNOWN"
  toplamBorc: "INCLUDED" | "EXCLUDED" | "UNSUPPORTED" | "UNKNOWN"
  sonBorc: "INCLUDED" | "EXCLUDED" | "UNSUPPORTED" | "UNKNOWN"
  kalanBorc: "INCLUDED" | "EXCLUDED" | "UNSUPPORTED" | "UNKNOWN"
  toplamTahsilat: "INCLUDED" | "EXCLUDED" | "UNSUPPORTED" | "UNKNOWN"
  kalanAnapara: "INCLUDED" | "EXCLUDED" | "UNSUPPORTED" | "UNKNOWN"
  otherDisplayTotals?: Record<string, "INCLUDED" | "EXCLUDED" | "UNSUPPORTED" | "UNKNOWN">
}
```

The required totals set is:

- `takipTutari`
- `toplamBorc`
- `sonBorc`
- `kalanBorc`
- `toplamTahsilat`
- `kalanAnapara`
- other relevant display totals, if introduced by a later contract version

This ADR does not change formulas. It only requires the future row contract to
make totals participation explicit. If the implementation cannot safely state a
row's totals participation, it must use `UNSUPPORTED` or `UNKNOWN` and remain
shadow-only.

## Payment Allocation Semantics

`affectsPaymentAllocation` must be explicit for every row.

`allocationCategory` must be explicit or `UNSUPPORTED`.

The first shadow contract may set:

```text
affectsPaymentAllocation: false
allocationCategory: "UNSUPPORTED"
```

when allocation semantics are not yet approved. That is safer than silently
mapping the row into an existing category.

`PaymentApplication` and category mapping remain unresolved unless separately
approved.

`PaymentDesignation` refactor is not required for the first shadow contract.

`ClaimItem` refactor is not required for the first shadow contract.

Restricted/earmarked payment behavior remains outside this first contract unless
the PaymentDesignation/PaymentScope design is implemented and read by the
allocator in the same approved epic.

## Legal Basis, Calculation Basis, And Provenance

`calculationBasis` must identify the approved calculation source and inputs
without freezing legacy formulas as desired canonical behavior.

`legalBasis` must be explicit enough for audit. It may be `UNSUPPORTED` while
product/legal work is pending.

`provenance` must be explicit enough to answer:

- which canonical evidence was read
- which date/currency context was used
- which tenant/case scope produced the row
- whether legacy data was consulted only for shadow comparison
- why the row is unsupported, not applicable, or unsafe

Persistent DB-backed provenance is out of scope for the first shadow contract
unless separately approved.

Source references must preserve tenant/case scoping. A row must not reference
cross-tenant evidence or a client-provided tenant authority.

## Versioning And Backwards Compatibility

Adding `canonicalSummaryRows` to a response is an API contract change when it is
implemented.

The first implementation must be additive and shadow-only.

Clients must safely ignore unknown rows and unknown fields.

Row IDs must be stable.

Status enum changes must be additive or versioned.

`contractVersion` must be present at either row level or response-envelope level.

Primary display must ignore `canonicalSummaryRows` until a later explicit
promotion gate approves consumption.

Removing or renaming a row ID is a breaking contract change.

Changing zero/null/missing semantics is a breaking contract change unless
versioned.

Changing source authority semantics is a breaking contract change unless
versioned.

## Fail-Closed Behavior

The future implementation must block primary promotion when any of these occur:

- required row is missing
- row has `UNSUPPORTED` status
- row has `ERROR` status
- row has `UNKNOWN` source authority
- row has `LEGACY` source authority
- row has `DERIVED` source authority without later explicit promotion approval
- row amount is malformed or non-finite
- row currency is missing, mixed, or unsafe
- totals participation is `UNKNOWN` for a primary-required total
- allocation participation is unknown when payment allocation would be affected
- row provenance is missing required tenant/case/date/currency context
- mixed authority is detected
- `MahsupDetayPanel` context remains mixed authority

`MahsupDetayPanel` and `mahsupDetayPanelContext` remain blocked for controlled
primary cutover until a separate canonicalization strategy is approved.

## Tenant And Case Access

No runtime tenant/case access behavior changes in TM24.

Future implementation must preserve these rules:

- `tenantId` comes from auth context only.
- Client/body/query `tenantId` is not authoritative.
- Case, claim, ledger, collection, overpayment, and canonical row reads remain
  scoped by `tenantId + caseId`.
- No cross-tenant cache or shared row computation.
- No row may be reused across tenant/case boundaries.
- Provenance references must carry tenant/case scope or be scoped by a parent
  response that carries tenant/case scope.
- Shadow comparison must compare legacy and canonical evidence in the same
  tenant/case/date context.

## Testing Requirements For The First Implementation PR

The first implementation PR must prove:

- `calculation-summary` remains legacy.
- `canonicalSummaryRows` is shadow-only.
- `primaryDisplayUnchanged` remains true.
- `tazminat`, `komisyon`, and `takipOncesiFaiz` row IDs are stable.
- Status semantics distinguish `SUPPORTED`, `NOT_APPLICABLE`, `UNSUPPORTED`,
  and `ERROR`.
- Zero, null, missing row, unsupported row, and error row are distinct.
- `UNSUPPORTED` and `ERROR` fail closed.
- `UNKNOWN`, `LEGACY`, and unsafe `DERIVED` source authority fail closed.
- Tenant/case access guard is preserved.
- Legacy/raw presence does not imply canonical promotion.
- No legacy numeric formula is frozen as desired canonical behavior unless the
  formula decision is explicitly approved.
- Multi-currency or currency mismatch behavior remains fail-closed unless
  explicitly versioned.
- `MahsupDetayPanel` remains blocked for mixed authority.

## Explicitly Forbidden In The First Implementation PR

- primary cutover
- `HesapOzetiPanel` changes
- `buildGuardedPrimaryCalculationResult()` changes
- calculation-summary primary contract replacement
- PaymentDesignation refactor
- ClaimItem refactor
- DB schema or migration unless separately approved
- frontend rendered value changes
- visible source labels
- telemetry or diagnostics additions
- formula changes
- currency formatting changes
- dependency or lockfile changes
- generated file changes
- guarded pilot expansion
- mixed-authority fix

## Pseudocode Contract Example

Illustrative only. Values below are placeholders and do not imply formula
correctness.

```text
{
  "mode": "SHADOW_ONLY",
  "primaryDisplayUnchanged": true,
  "contractVersion": "canonical-summary-rows.v1",
  "canonicalSummaryRows": [
    {
      "rowId": "tazminat",
      "labelKey": "accountSummary.tazminat",
      "amount": 0,
      "currency": "TRY",
      "status": "NOT_APPLICABLE",
      "sourceAuthority": "CANONICAL",
      "asOfDate": "YYYY-MM-DD",
      "calculatedAt": "ISO-8601",
      "includedInTotals": {
        "takipTutari": "EXCLUDED",
        "toplamBorc": "EXCLUDED",
        "sonBorc": "EXCLUDED",
        "kalanBorc": "EXCLUDED",
        "toplamTahsilat": "EXCLUDED",
        "kalanAnapara": "EXCLUDED"
      },
      "affectsPaymentAllocation": false,
      "allocationCategory": "UNSUPPORTED",
      "calculationBasis": { "kind": "CANONICAL_APPLICABILITY", "formulaVersion": null },
      "legalBasis": { "kind": "NOT_APPLICABLE", "reference": null },
      "provenance": { "tenantScoped": true, "caseScoped": true, "legacyUsedAsAuthority": false },
      "unsupportedReason": null,
      "diagnostics": [],
      "contractVersion": "canonical-summary-rows.v1"
    },
    {
      "rowId": "komisyon",
      "labelKey": "accountSummary.komisyon",
      "amount": null,
      "currency": "TRY",
      "status": "UNSUPPORTED",
      "sourceAuthority": "UNKNOWN",
      "asOfDate": "YYYY-MM-DD",
      "calculatedAt": "ISO-8601",
      "includedInTotals": {
        "takipTutari": "UNSUPPORTED",
        "toplamBorc": "UNSUPPORTED",
        "sonBorc": "UNSUPPORTED",
        "kalanBorc": "UNSUPPORTED",
        "toplamTahsilat": "EXCLUDED",
        "kalanAnapara": "EXCLUDED"
      },
      "affectsPaymentAllocation": false,
      "allocationCategory": "UNSUPPORTED",
      "calculationBasis": { "kind": "UNAPPROVED", "formulaVersion": null },
      "legalBasis": { "kind": "UNRESOLVED", "reference": null },
      "provenance": { "tenantScoped": true, "caseScoped": true, "legacyUsedAsAuthority": false },
      "unsupportedReason": "Commission canonical legal/rate basis is not approved.",
      "diagnostics": [{ "code": "CANONICAL_ROW_UNSUPPORTED", "severity": "BLOCKER" }],
      "contractVersion": "canonical-summary-rows.v1"
    },
    {
      "rowId": "takipOncesiFaiz",
      "labelKey": "accountSummary.takipOncesiFaiz",
      "amount": "<finite canonical amount placeholder>",
      "currency": "TRY",
      "status": "SUPPORTED",
      "sourceAuthority": "CANONICAL",
      "asOfDate": "YYYY-MM-DD",
      "calculatedAt": "ISO-8601",
      "includedInTotals": {
        "takipTutari": "INCLUDED",
        "toplamBorc": "INCLUDED",
        "sonBorc": "INCLUDED",
        "kalanBorc": "INCLUDED",
        "toplamTahsilat": "EXCLUDED",
        "kalanAnapara": "EXCLUDED"
      },
      "affectsPaymentAllocation": true,
      "allocationCategory": "ACCRUED_INTEREST",
      "calculationBasis": { "kind": "CANONICAL_ENGINE", "formulaVersion": "<approved-version>" },
      "legalBasis": { "kind": "APPROVED_REFERENCE", "reference": "<approved-reference>" },
      "provenance": { "tenantScoped": true, "caseScoped": true, "legacyUsedAsAuthority": false },
      "unsupportedReason": null,
      "diagnostics": [],
      "contractVersion": "canonical-summary-rows.v1"
    }
  ]
}
```

## Planning Matrix

| Contract area | Required decision | Current recommendation | API impact when implemented | Formula risk | Tenant/access risk | Primary cutover risk | First implementation allowed? | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Row container placement | Where `canonicalSummaryRows` lives | Canonical/shadow balance display contract | Additive API field | Low | Low if tenant/case scope is preserved | Low if ignored by primary | Yes, shadow-only | Do not place under legacy calculation-summary first. |
| Row ID stability | Stable IDs for target rows | `tazminat`, `komisyon`, `takipOncesiFaiz` | Additive row contract | Low | Low | Medium if renamed later | Yes | Renames are breaking. |
| Status enum | Supported/not applicable/unsupported/error semantics | `SUPPORTED`, `NOT_APPLICABLE`, `UNSUPPORTED`, `ERROR` | Additive enum | Medium | Low | High if misread by primary | Yes | Unsupported/error block promotion. |
| Amount semantics | Zero/null/missing/non-finite behavior | Distinct semantics with fail-closed non-finite values | Contract semantics | Medium | Low | High if zero inferred from missing | Yes | Null and missing are not zero. |
| Source authority | Authority values and promotion gate | `CANONICAL`, `LEGACY`, `DERIVED`, `UNKNOWN`; only canonical can promote | Contract semantics | Medium | Low | High | Yes | Legacy/raw presence is shadow evidence only. |
| Inclusion/totals semantics | Per-total participation | Explicit per total: included/excluded/unsupported/unknown | Contract semantics | High | Low | High | Yes, as metadata | Does not change formulas. |
| Payment allocation fields | Whether row affects allocation and category | Explicit boolean plus category or unsupported | Contract semantics | High | Medium | High | Yes, with unsupported allowed | PaymentApplication mapping remains open. |
| Legal basis/provenance | Audit evidence level | Explicit legal/calculation basis and provenance | Contract semantics | Medium | Medium | Medium | Yes | Persistent provenance is not required first. |
| Versioning/backwards compatibility | Contract evolution rules | Additive/versioned with stable row IDs | Additive API field now; breaking changes versioned | Low | Low | Medium | Yes | Unknown rows/fields must be ignored safely. |
| balance-display-shadow-diff exposure | First external surface | Recommended first external shadow response | Additive response change | Medium | Low if auth tenant retained | Low if not rendered | Yes | Must keep `SHADOW_ONLY` and primary unchanged. |
| calculation-summary exposure | Whether legacy primary response changes | Do not expose there first | High if changed | High | Medium | High | No | Keep legacy until explicit cutover. |
| Frontend shadow parsing | Client read without render | Later parse-only consumer may be allowed | Client API type change | Low | Low | Low | Later | Must not change visible UI values. |
| Frontend primary rendering | Render canonical rows as primary | Blocked | User-facing behavior change | High | Low | Very high | No | Requires separate promotion gate. |
| MahsupDetayPanel | Mixed authority resolution | Remains blocked | None in first implementation | Medium | Low | Very high | No | Needs separate canonicalization strategy. |
| DB-backed provenance | Persistent row provenance | Out of scope first | Schema/API change if added | Medium | Medium | Medium | No | Revisit only if audit requirements demand it. |

## Open Questions

- `komisyon` rate, source, legal basis, and product semantics.
- `takipOncesiFaiz` calculation basis and its relationship to
  `ACCRUED_INTEREST`.
- `tazminat` legal basis and provenance source.
- `PaymentApplication` and allocation category mapping.
- Whether persistent DB-backed provenance is required.
- `MahsupDetayPanel` canonicalization strategy.
- Multi-currency primary eligibility and row-level currency reconciliation.
- Whether `DERIVED` rows can ever be primary eligible under a later version.

## Implementation Acceptance Criteria

A later implementation PR can be accepted only if it satisfies all of these:

1. It is additive and shadow-only.
2. It exposes `canonicalSummaryRows` only through `balance-display-shadow-diff`
   or an equivalent shadow response unless a separate ADR approves another
   surface.
3. It does not modify `GET /cases/:id/calculation-summary` primary behavior.
4. It does not change rendered `HesapOzetiPanel` values.
5. It keeps `mode: SHADOW_ONLY` and `primaryDisplayUnchanged: true`.
6. It returns the three target row IDs with explicit status semantics.
7. It distinguishes zero, null, missing, unsupported, error, and non-finite
   amount cases.
8. It marks source authority explicitly and blocks non-canonical authority from
   primary promotion.
9. It records totals participation explicitly without changing formulas.
10. It records payment allocation semantics explicitly or marks them
    unsupported.
11. It preserves auth-context tenant and `tenantId + caseId` read scoping.
12. It adds tests proving legacy/raw presence does not imply canonical
    promotion.
13. It adds tests proving unsupported/error/unknown/mixed authority fail closed.
14. It adds tests proving calculation-summary remains legacy.
15. It does not introduce DB schema, migration, dependency, lockfile, generated
    file, telemetry, visible label, guarded pilot, or primary cutover changes.

## Non-Goals

TM24 does not:

- implement DTOs
- implement API fields
- add tests
- change backend production source
- change frontend source
- change formulas
- change tenant/case access behavior
- change DB schema or migrations
- change dependencies or lockfiles
- change generated files
- change `HesapOzetiPanel`
- change `buildGuardedPrimaryCalculationResult()`
- perform primary cutover

## Outcome

The future `canonicalSummaryRows` DTO/API design is finalized as a docs-only
decision. The owner remains `CaseBalanceDisplay` or an equivalent canonical
balance display model. The first external exposure remains
`balance-display-shadow-diff` or an equivalent shadow response.

`calculation-summary` remains legacy. Adding `canonicalSummaryRows` remains a
future API contract change, not performed here. Status, amount, source
authority, fail-closed, versioning, tenant/case access, and first implementation
acceptance criteria are documented here for the next implementation planning
step.
