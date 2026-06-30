# ACCT-3D Distribution Recommendation Operator Usage

**Status:** Accepted operator/developer usage note for the ACCT-3 advisory endpoint.
**Scope:** Documentation-only. No runtime behavior, schema, migration, controller, authorization, posting, writer, legal ledger, TBK100, or test logic change.
**Related:** `acct-3a-distribution-recommendation-design-gate.md`, `tm3-collection-disposition-boundary.md`, `ADR-010-ACCOUNTING-JOURNAL-SOT-NORTH-STAR.md`.

## Purpose

Distribution Recommendation gives the operator an editable preview for splitting a `HELD_PENDING_DISTRIBUTION` collection disposition into candidate distribution lines.

It is an FE pre-fill / operator preview. It is not approval, posting, legal ledger output, TBK100 statement output, or an `AccountingJournal` write. Persisted distribution lines are created only through the existing `POST /collection-dispositions/:id/recommend` lifecycle action, and financial effect remains gated by the existing approve/post lifecycle.

## Endpoint

```http
POST /collection-dispositions/:id/distribution-recommendation
```

The route returns the recommendation envelope under `data`.

The endpoint is a preview route and carries `Cache-Control: no-store` in the current controller surface.

## Auth And Tenant Boundary

- JWT is required.
- Current behavior is JWT-only; there is no method-level `AdminGuard` on this route.
- A non-admin JWT can call the route under the existing locked behavior.
- `tenantId` is taken only from the authenticated request context.
- `tenantId` in query string or request body is ignored and must not influence lookup or response generation.
- The disposition read is tenant-scoped by authenticated tenant and source disposition id.

This note documents the existing boundary; it does not authorize an auth behavior change.

## Request Contract

The request body may be empty. When attorney fee input is supplied, FAZ-1a accepts only manual amount mode:

```json
{
  "attorneyFee": {
    "mode": "AMOUNT",
    "amount": "33333.33",
    "note": "manual fee"
  }
}
```

Rules:

- `attorneyFee.mode` must be `AMOUNT`.
- `attorneyFee.amount` must be a faithful decimal string, not a JSON number.
- `attorneyFee.amount` must be finite, non-negative, at most 2 decimal places, and must not exceed `gross`.
- `attorneyFee.note` is optional and is carried to the manual fee suggested line.
- `RATE`, fee automation, rate/base precedence, and fee agreement modeling are future-phase work and are not part of this contract.

## Response Contract

The response is advisory and preview-oriented. Core fields:

| Field | Meaning |
|---|---|
| `dispositionId` | Source `CollectionDisposition` id. |
| `status` | Source status; generation is valid only for `HELD_PENDING_DISTRIBUTION`. |
| `currency` | Source disposition currency. |
| `gross` | Source disposition `totalAmount` as a faithful decimal string. |
| `beneficiaryScope` | Source beneficiary scope. `SINGLE_CASE_CLIENT` can produce lines; cluster scope remains manual in FAZ-1a. |
| `recommendOnly` | Always `true`; caller must use the existing lifecycle endpoint to persist selected lines. |
| `financialEffect` | Always `false`; the route does not post or write accounting effect. |
| `suggestedLines` | Editable candidate lines for FE pre-fill. Current origins are manual fee and client payable residual. |
| `sumCheck` | Advisory evidence for suggested line total and gross equality where lines are produced. |
| `expenseModule` | Candidate-only expense visibility; auto-apply is disabled. |
| `warnings` | Human-readable preview warnings, not legal or accounting statements. |

Expected advisory invariants:

- `recommendOnly=true`
- `financialEffect=false`
- No call to `recommend()`, `approve()`, `post()`, `AccountingJournalWriterService`, or journal write paths.
- Suggested lines are operator-editable candidates; they do not become persisted distribution lines until the separate recommend lifecycle action.

## Suggested Lines

For `SINGLE_CASE_CLIENT`, current FAZ-1a output may include:

| Type | Origin | Boundary |
|---|---|---|
| `CONTRACTUAL_FEE_WITHHELD` | `FEE_MANUAL` | Manual attorney fee. It is not client-attributed. |
| `CLIENT_PAYABLE` | `CLIENT_PAYABLE_RESIDUAL` | Gross minus manual fee, attributed to the disposition `caseClientId`. |

If manual fee equals gross, the response may contain only the fee line and a zero-residual warning.

## Cluster Boundary

`CASE_CREDITOR_CLUSTER` remains manual in FAZ-1a.

The recommendation endpoint must not introduce a cluster share-ratio engine or implicit creditor allocation. Cluster-scope responses are advisory-only, return no suggested distribution lines, and warn the operator to enter lines manually.

## Expense Boundary

Expense reimbursement is candidate-only in this phase.

- `expenseModule.autoApplyEnabled=false`
- `expenseModule.disabledReason=EXPENSE_APPROVAL_FIELD_MISSING`
- Expense candidates may be listed for operator visibility.
- Expense candidates must stay outside `suggestedLines`.
- `CLIENT_EXPENSE_REIMBURSEMENT` auto-apply requires a later approved phase with the required approval/data model.

## Non-Goals

This endpoint and this ACCT-3D documentation do not authorize:

- approval
- posting
- legal ledger mutation or TBK100 statement behavior
- `AccountingJournal` write behavior
- schema or migration changes
- controller or auth behavior changes
- posting/writer behavior changes
- fee rate automation
- cluster share-ratio automation
- expense auto-apply
