# ADR: C-Prime Plus Payment Designation Canonical Collection Model

Status: Accepted

Date: 2026-06-23

## Scope

This ADR fixes the canonical model for collection, claim balance, payment designation, payment application, overpayment, and the current `ClaimItem`/`LedgerAllocation` transition semantics.

This document is a design decision record. It does not by itself change runtime behavior, schema, migrations, services, controllers, UI, or calculation output.

## Decision

The system will not perform a pure clean rewrite. It will also not perform a display-only cutover.

The accepted model is:

```text
C-Prime Plus Payment Designation Canonical Model
```

The existing TBK100 allocation core, segmented interest engine, append-only `LedgerEntry` spine, reversal approach, and `CollectionOverpayment` projection idea are preserved.

The following semantics will be broken or retired through later implementation phases:

- `ClaimItem.collectedAmount` as canonical payment truth.
- The derived `ClaimItem` remaining semantics as canonical legal balance truth.
- `ClaimItem.remainingAmount` must be treated as derived semantics/projection, not as an independent canonical balance column.
- `LedgerAllocation.claimItemId` as the canonical payment target.
- Automatic "one evidence document = one principal debt" modeling.
- Display dual authority between legacy calculation summary and canonical balance.

The following source/projection roles are accepted:

- `PaymentDesignation` / `PaymentScope`: payment intent and legal application scope.
- `PaymentApplication`: category-based application result.
- `LedgerEntry`: append-only money event spine.
- `computeBalance`: canonical balance projection.
- `BalanceComponent`: projection/display bucket, not source of truth.
- `Overpayment`: money that cannot be applied to debt; separate HELD projection, never negative debt.
- `EvidenceDocument` / `CaseInstrument` / `CaseDocument`: provenance and legal evidence, not payment target.
- Current `ClaimItem`: transitional claim input/projection record, not canonical collection or balance source of truth in its current shape.

Reference decision: #394 overpayment rule is preserved. Fazla tahsilat borc degildir; borcu negatife dusurmez; ayri HELD/projection olarak tutulur.

## Core Rule

Collection is not applied to an evidence document.

However, a payment may carry a legally meaningful designation/scope:

```text
PaymentDesignation / PaymentScope = which legal subset may this payment be applied within?
PaymentApplication = how the money was applied to balance categories inside that scope.
```

Correct algorithm:

```text
1. Receive payment.
2. Determine whether a PaymentDesignation / PaymentScope exists.
3. If scope exists, restrict the allocatable debt universe to that scope.
4. Run TBK100/category allocation inside that scope.
5. Scope excess does not automatically flow to another debt; it becomes HELD/restricted overpayment.
6. If no scope exists, general case-level allocation may run.
```

Therefore:

```text
Earmark/designation = allocator input event.
Earmark/designation is not merely a read-model filter.
Earmark/designation is not a PaymentApplication target.
```

## Explicit Prohibitions

The following are prohibited canonical targets:

```text
PaymentApplication -> EvidenceDocument
PaymentApplication -> CaseInstrument
PaymentApplication -> check/promissory note/invoice
PaymentApplication -> PeriodicObligation
```

The following UI or domain language is prohibited as canonical meaning:

```text
check paid
promissory note closed
invoice collected
payment posted to document
ClaimItem collected
```

Correct language:

```text
Applied to case balance
Payment designation scope
Application result
Principal balance reduced
Interest base updated
Overpayment held separately
```

## Merge-Blocking Invariants

### MUST: PaymentDesignation Without Allocator Read Is Dead State

`PaymentDesignation` schema and the `payment-mapper.ts -> Payment` domain type threading plus `computeBalance` / allocator reading must land in the same implementation epic.

`PaymentDesignation` tables or fields must not be merged unless the allocator input reads and enforces them.

Open prohibition:

```text
PaymentDesignation fields/tables cannot merge before they are threaded into allocator input and read by computeBalance.
```

Reason:

The current collection-to-payment mapping flows through `payment-mapper.ts`. If designation data is persisted but dropped before the domain `Payment` type or ignored by `computeBalance`, TBK101/TBK102 exists only on paper while default TBK100 silently applies. This repeats the known "field exists, allocator does not read it" failure mode.

### SHOULD: Instrument-Backed Designation Targets CaseInstrument First

For instrument-backed debts, designation should target stable provenance:

```text
designatedInstrumentId + category/scope
```

`designatedClaimItemId` may be used only for legacy/non-instrument claim rows and must not be treated as the canonical payment target.

Accepted target semantics:

```ts
PaymentDesignation {
  designatedInstrumentId?: string; // primary for instrument-backed scope
  designatedClaimItemId?: string;  // legacy/non-instrument only
}
```

Reason:

Later phases will remove or limit automatic per-instrument `PRINCIPAL` ClaimItem generation. If Phase 4 designation targets temporary per-instrument ClaimItems, Phase 5 breaks those targets. `CaseInstrument` is the more stable provenance anchor, while the allocator resolves instrument scope into principal/category scope.

### SHOULD: Default Imputation Is Parametric When No Designation Exists

When no designation exists, default imputation must not be a single fixed natural order.

The default policy must be parameterized by claim type, collection channel, and legal context.

Specific locked example:

```text
In alimony salary seizure, current alimony has priority.
Nafaka maas haczinde cari donem/cari ay onceliklidir.
Apply first to the current month/current period; only excess goes to accumulated arrears.
Blind oldest-first or arrears-first policy is wrong for this context.
```

This is a Phase 4 policy-design requirement and does not require immediate implementation in Phase 1.

## Seven Question Decisions

### Q1: ClaimGroup Width

`ClaimGroup` is narrow.

Default:

```text
one enforcement case = implicit single group
```

`ClaimGroup` may be introduced only for real independent legal pools, such as:

- Non-joint debtor liability sets.
- Secured versus unsecured pools.
- Precautionary versus main enforcement pools.
- Different collateral or sale-proceeds scopes.
- Truly independent legal claim groups.

`ClaimGroup` must not be introduced merely because the case has multiple checks, invoices, due dates, interest starts, or document numbers.

No physical `ClaimGroup` table is introduced in the current phase.

### Q2: BalanceComponent Source Role

`BalanceComponent` is projection/display only.

It is not source of truth and must not become a written balance table in this phase.

Canonical balance display comes from `computeBalance` canonical output. Do not compute legal balance with an ad hoc formula such as:

```text
demand - sum(LedgerAllocation) + interest
```

That formula risks double-counting interest and treating transitional allocation rows as canonical truth.

### Q3: PaymentApplication Evidence Target Ban

The ban is correct.

`PaymentApplication` records category application:

```text
EXPENSE
ACCRUED_INTEREST
ATTORNEY_FEE
OTHER_ANCILLARY
PRINCIPAL
OVERPAYMENT
```

Evidence or period information may appear only as PaymentDesignation/PaymentScope input, not as final application target.

### Q4: PeriodicObligation

`PeriodicObligation` is not a final payment target.

It may become a PaymentScope context for rent/alimony periods:

```text
May 2026 alimony
January 2026 rent
March 2026 rent difference
```

Any settlement/paid status for periods must be append-only event/projection design, not mutable canonical truth.

Physical `PeriodicObligation` settlement tables are out of scope for this phase.

### Q5: Overpayment In Multi-Scope Cases

Overpayment is calculated relative to the applicable scope.

If a payment is restricted to debt A:

```text
A debt: 100000
B debt: 200000
Payment: 150000
Designation: for A debt

Correct:
100000 -> A scoped balance
50000  -> HELD/restricted overpayment

Wrong:
100000 -> A
50000  -> B
```

Scope excess does not automatically flow to another group, debtor, document, or obligation.

Future scope references stored on overpayment should use a fixed-shape DTO, not free-form JSON.

Future `RE_ALLOCATED` / `TRANSFERRED` behavior must use a compensating-entry reversal contract aligned with the append-only spine.

### Q6: PR #404

PR #404 is not closed and is not cherry-picked.

The branch is revised/rebased and made merge-ready only after guard fixes.

Preserved idea:

```text
Overpayment does not reduce debt below zero.
It is stored as CollectionOverpayment / HELD projection.
```

Merge gates:

- `excludedOutstanding` guard.
- Case/collection/ledger/overpayment currency alignment.
- Restricted/earmarked unsupported hard-gate until PaymentDesignation exists.
- Reversal behavior tests.
- Diagnostic tests.
- Tenant/case guard tests.

If excluded legitimate debt exists, the system has not safely read the debt universe. In that case:

```text
do not write overpayment
emit diagnostic
mark allocation incomplete/unsafe
```

Do not replace this with:

```text
overpayment = amount - allocatedAmount - excludedOutstanding
```

### Q7: FinancialEvent

No separate `FinancialEvent` / `BalanceSnapshot` source-of-truth spine is introduced.

`LedgerEntry` remains the append-only money event spine.

`domainEventIngest` remains audit/timeline/outbox style infrastructure, not a second money source of truth.

## Suggested Domain Shape

Illustrative only; not a Phase 1 schema instruction:

```ts
PaymentDesignation {
  id: string
  tenantId: string
  caseId: string
  collectionId: string

  mode: 'NONE' | 'DEBTOR_DESIGNATED' | 'CREDITOR_RECEIPT' | 'COERCIVE_COLLECTION' | 'MANUAL_LEGAL_DECISION'

  designatedDebtorId?: string
  designatedInstrumentId?: string // primary for instrument-backed scope
  designatedClaimItemId?: string  // legacy/non-instrument only
  designatedPeriodId?: string
  designatedClaimGroupId?: string

  designationText?: string
  designationSource: 'BANK_DESCRIPTION' | 'UYAP_DESCRIPTION' | 'MANUAL_ENTRY' | 'RECEIPT' | 'COURT_ORDER'
  isBinding?: boolean
  legalBasis: 'TBK_101' | 'TBK_102' | 'TBK_100' | 'IIK' | 'MANUAL_REVIEW'
}
```

Where possible, `mode` should be derived from reliable collection source signals rather than trusted as a manual free-form value. For example, `BANK_SEIZURE` and `SALARY_SEIZURE` should map toward `COERCIVE_COLLECTION` policy.

Illustrative `PaymentApplication`:

```ts
PaymentApplication {
  id: string
  tenantId: string
  caseId: string
  collectionId: string
  calculationRunId: string

  scopeId?: string
  category: 'EXPENSE' | 'ACCRUED_INTEREST' | 'ATTORNEY_FEE' | 'OTHER_ANCILLARY' | 'PRINCIPAL' | 'OVERPAYMENT'
  amount: number
  currency: string
  applicationOrder: number
  policyCode: 'TBK100_DEFAULT' | 'TBK101_DESIGNATED_SCOPE' | 'COERCIVE_COLLECTION' | 'MANUAL'
  isSystemGenerated: boolean
}
```

Prohibited field:

```ts
evidenceDocumentId
```

## Phase Plan

### Phase 0: ADR And Semantic Audit

Outputs:

- This ADR.
- ClaimItem semantic audit.
- Display authority audit.
- PaymentDesignation/PaymentScope audit.
- PR #404 merge-gate audit.

### Phase 1: PR #404 Overpayment Guard Fix

Scope:

- `excludedOutstanding` guard.
- Currency alignment guard.
- Restricted/earmarked unsupported hard-gate.
- Diagnostic/event/log pattern consistent with existing architecture.
- Reversal tests.
- Tenant/case guard tests.

Non-goals:

- PaymentDesignation schema.
- ClaimGroup table.
- PeriodicObligation table.
- BalanceComponent source table.
- FinancialEvent/BalanceSnapshot spine.
- Display cutover.
- Alimony scheduler fix.
- Principal submodel refactor.

### Phase 2: Scheduler Alimony Type Fix

Ensure alimony periods do not silently materialize as ordinary principal claim debt and do not create double-count risk on manual resave/backfill paths.

### Phase 3: Display Authority Audit

Audit before cutover:

- `calculation-summary`.
- `computeBalance`.
- `HesapOzetiPanel`.
- Legacy interest stubs.
- Impact of current `ClaimItem` semantics on canonical input.

No blind display cutover.

### Phase 4: PaymentDesignation / PaymentScope Epic

Design and implement:

- DTO/schema.
- Domain `Payment` threading.
- `payment-mapper.ts` support.
- `computeBalance` / allocator reading.
- Voluntary/coercive distinction.
- Parametric imputation policy.
- Restricted overpayment behavior.
- Tests.

### Phase 5: Principal Submodel Refactor

Remove or limit automatic per-evidence `PRINCIPAL` ClaimItem creation.

`CaseInstrument` remains provenance. Principal/bucket generation moves to case/legal-scope level. Interest-specific needs move to interest accrual base/lot concepts rather than document-paid semantics.

## Multitenant And Impact Scope

All future implementation must remain tenant-scoped.

Collection, LedgerEntry, allocation result, overpayment, designation, and case balance reads/writes must remain on the same `tenantId` and `caseId` line.

This ADR directly affects future changes to:

- `CollectionService.create()`.
- `SummaryEngineService.allocatePaymentToLedgerInTx()`.
- `CaseBalanceService.computeCaseBalance()`.
- `payment-mapper.ts`.
- `LedgerEntry` / `LedgerAllocation` interpretation.
- `CollectionOverpayment`.
- `ClaimItem` semantics.
- Balance display surfaces.

This ADR itself changes only:

- `docs/adr/ADR-C-PRIME-PLUS-PAYMENT-DESIGNATION.md`
