# ACCT-2A Trial Balance Diagnostic Endpoint

> Status: Operator/developer usage note.
> Scope: Documentation only. No runtime behavior, writer behavior, schema, migration, legal ledger, or TBK100 change.

## Purpose

`GET /accounting-journal/trial-balance` exposes persisted AccountingJournal trial-balance evidence for admin diagnostics.

This endpoint is not a reporting product, not a financial statement surface, and not an operator-facing accounting report. It is a read-only evidence endpoint used to inspect whether persisted journal lines are balanced within the requested scope and to support ADR-010 faithfulness work before any future source-of-truth cutover decision.

## Endpoint

```http
GET /accounting-journal/trial-balance
```

The endpoint has no body contract. All supported caller input is query-string based, except tenant identity, which is taken only from the authenticated user context.

## Top-Level Response Contract

The response is a diagnostic evidence contract. It is intentionally scoped to persisted journal evidence and should not be treated as a financial statement or legal ledger view.

| Field | Meaning |
|---|---|
| `tenantId` | Authenticated tenant used for the read; this must match auth context, not caller-supplied query/body tenant data. |
| `filters` | Normalized filters applied by the read model, including authenticated `tenantId` and any accepted query filters. |
| `rows` | Account-code and currency-level Trial Balance rows. |
| `totals` | Per-currency debit/credit totals for the returned evidence scope. |
| `sourceBreakdown` | Per-source, per-currency aggregate rows derived from persisted journal entry source metadata. |
| `diagnostics` | Evidence quality diagnostics for balance, scope, date basis, counts, and warning codes. |
| `reconciliation` | Additive reconciliation evidence explaining persisted journal aggregate basis, source coverage, and warning details. |

## Auth And Tenant Boundary

- JWT is required.
- Admin permission is required.
- Tenant is read only from `@CurrentUser('tenantId')`.
- `tenantId` from query or body is not accepted as authority and must not be used for tenant selection.
- A caller cannot request another tenant by adding `?tenantId=...`; the authenticated tenant wins.

## Supported Filters

All filters are optional. The service always applies the authenticated tenant scope.

| Query | Meaning |
|---|---|
| `currency` | Limit rows to one currency code. |
| `caseId` | Limit rows to one case dimension. |
| `clientId` | Limit rows to one client dimension. |
| `caseClientId` | Limit rows to one case-client dimension. |
| `accountCode` | Limit rows to one accounting account code. |
| `sourceType` | Limit rows by journal source type. |
| `sourceAction` | Limit rows by source action string. |
| `entryType` | Limit rows by journal entry type. |
| `postedFrom` | Inclusive lower bound for journal entry `postedAt`; ISO date or datetime. |
| `postedTo` | Inclusive upper bound for journal entry `postedAt`; ISO date or datetime. |

### Enum Filters

`accountCode` values:

- `CASH_CLEARING`
- `CLIENT_PAYABLE`
- `CLIENT_EXPENSE_REIMBURSEMENT_PAYABLE`
- `CLIENT_EXPENSE_RECEIVABLE`
- `ATTORNEY_FEE_REVENUE`
- `FIRM_EXPENSE_REIMBURSEMENT`
- `CLIENT_ADVANCE_BALANCE`

`sourceType` values:

- `COLLECTION_DISPOSITION_LINE`
- `CLIENT_PAYOUT`
- `CLIENT_OFFSET`
- `BALANCE_LEDGER`
- `ACCOUNTING_JOURNAL_ENTRY`

`entryType` values:

- `COLLECTION_DISTRIBUTION_POSTED`
- `CLIENT_PAYOUT_RECORDED`
- `CLIENT_OFFSET_APPLIED`
- `CLIENT_OFFSET_REVERSED`
- `CLIENT_ADVANCE_LEDGER_RECORDED`
- `ACCOUNTING_JOURNAL_REVERSAL`

Invalid enum values or invalid `postedFrom` / `postedTo` values return `400 Bad Request`.

## Date Basis

Trial Balance filtering uses journal entry `postedAt`.

This is intentional for the current diagnostic boundary: the endpoint reads persisted journal evidence as posted, not a legal/effective-date ledger projection. Diagnostics include `dateBasis: "postedAt"` and currently expose `missingEffectiveDateColumn: true` to make that limitation explicit.

## Response Diagnostics

The response includes `diagnostics` to describe the evidence quality of the returned scope.

| Field | Meaning |
|---|---|
| `balanced` | Whether total debit equals total credit for the returned evidence scope. |
| `dimensionScoped` | Whether filters narrow the result to a dimension where partial-entry imbalance can be expected. |
| `partialEntryScope` | Whether filters may include only part of one or more journal entries. |
| `dateBasis` | Date column used for filtering; currently always `postedAt`. |
| `generatedAt` | Server timestamp when the diagnostic report was generated. |
| `lineCount` | Number of journal lines included in the evidence scope. |
| `entryCount` | Number of distinct journal entries represented by the evidence scope. |
| `currencyCount` | Number of currencies represented by the evidence scope. |
| `evidenceStatus` | Summary status: `NO_LINES`, `BALANCED`, `IMBALANCED`, or `DIMENSION_SCOPED`. |
| `unbalancedCurrencies` | Per-currency imbalance evidence, including debit, credit, and difference. |
| `missingEffectiveDateColumn` | Explicit marker that effective-date filtering is not part of the current persisted journal contract. |
| `missingSourceVersionColumn` | Explicit marker that source-version evidence is not part of the current persisted journal contract. |
| `warningCodes` | Machine-readable warning codes, for example `NO_JOURNAL_LINES`, `TRIAL_BALANCE_IMBALANCE`, or `DIMENSION_SCOPED_IMBALANCE`. |

## Reconciliation Evidence

The response can include `reconciliation`, an additive evidence object that explains how the Trial Balance result was derived from persisted AccountingJournal data.

`reconciliation` is admin diagnostic-only evidence. It is not a reporting surface, not a legal ledger view, and not an operator accounting statement. Do not present it as a financial statement or as proof that AccountingJournal has become authoritative. It supports ACCT-2 / ADR-010 faithfulness inspection before any future source-of-truth cutover decision.

| Field | Meaning |
|---|---|
| `evidenceSource` | Evidence origin; currently `PERSISTED_ACCOUNTING_JOURNAL`. |
| `aggregateBasis` | Aggregate strategy used by the read model; currently `DB_AGGREGATE`. |
| `tenantScoped` | Confirms the evidence is scoped to the authenticated tenant. |
| `dateBasis` | Date column used for filtering; currently always `postedAt`. |
| `amountBasis` | Amount field used for totals; currently `AccountingJournalLine.amount`. |
| `directionBasis` | Debit/credit field used for totals; currently `AccountingJournalLine.direction`. |
| `entryJoinBasis` | Join used to connect lines to entry metadata. |
| `balanced` | Whether total debit equals total credit for the returned evidence scope. |
| `evidenceStatus` | Summary status mirrored from diagnostics: `NO_LINES`, `BALANCED`, `IMBALANCED`, or `DIMENSION_SCOPED`. |
| `lineCount` | Number of journal lines included in the evidence scope. |
| `entryCount` | Number of distinct journal entries represented by the evidence scope. |
| `currencyCount` | Number of currencies represented by the evidence scope. |
| `sourceCount` | Number of source buckets represented in source coverage. |
| `sourceCoverage` | Per-source aggregate coverage; see below. |
| `warnings` | Reconciliation warning objects with machine-readable `code` and human-readable `message`. |

`sourceCoverage` rows are grouped by `sourceType` and `sourceAction`.

| Field | Meaning |
|---|---|
| `sourceType` | Journal source type represented by the bucket. |
| `sourceAction` | Source action represented by the bucket. |
| `entryCount` | Number of journal entries in the bucket. |
| `lineCount` | Number of journal lines in the bucket. |
| `currencyCount` | Number of currencies in the bucket. |
| `currencies` | Sorted list of currency codes represented by the bucket. |
| `balanced` | Whether debit equals credit inside that source bucket for the returned scope. |

### Reconciliation Warning Codes

| Code | Meaning |
|---|---|
| `NO_JOURNAL_LINES` | No persisted journal lines matched the requested scope. |
| `DIMENSION_SCOPED_IMBALANCE` | The requested dimension scope is imbalanced; this can happen when filters include only part of one or more entries. |
| `TRIAL_BALANCE_IMBALANCE` | The unscoped returned evidence is imbalanced. |
| `DIMENSION_SCOPED_EVIDENCE` | Filters narrow the journal evidence scope and may include partial entries. |
| `MISSING_SOURCE_METADATA` | Some grouped journal line evidence did not have matching source metadata in the joined journal entries. |
| `SOURCE_BREAKDOWN_IMBALANCE` | At least one source bucket is imbalanced within the returned evidence scope. |

### Consumption Boundaries

- Tenant scope comes only from the authenticated user context; `tenantId` query/body values are not authority.
- Period scope uses `postedAt`; it is not an effective-date, legal-ledger, or TBK100 period projection.
- Currency totals are aggregated per currency. There is no FX conversion and no single-currency statement view.
- Dimension filters such as `caseId`, `clientId`, `caseClientId`, or `accountCode` can produce partial-entry evidence. Treat `DIMENSION_SCOPED_EVIDENCE` and `DIMENSION_SCOPED_IMBALANCE` as scope diagnostics, not automatic writer defects.
- The evidence object intentionally does not expose raw source IDs, idempotency material, source hashes, metadata JSON, or actor/poster identifiers.
- Future UI consumption should use a separate admin diagnostic projection. This response shape is not a customer-facing or operator accounting report contract.

## ADR-010 Faithfulness Role

ADR-010 defines AccountingJournal as the north-star financial-event source of truth, but it does not move authority today. The current endpoint is part of the additive/shadow evidence path:

- It reads persisted `AccountingJournalEntry` and `AccountingJournalLine` evidence.
- It helps prove journal balance and later journal-vs-legal-ledger faithfulness.
- It does not make AccountingJournal authoritative.
- It does not change TBK100 legal authority.
- It does not cut over `LedgerEntry` / `LedgerAllocation` storage.

Use this endpoint as a diagnostic harness for ACCT-2 Trial Balance work, not as a customer-facing report or legal ledger replacement.

## Explicit Non-Goals

This endpoint and this documentation do not introduce or authorize:

- runtime posting behavior changes
- journal writer changes
- schema changes
- migrations
- legal ledger changes
- TBK100 calculation or allocation changes
- financial statement/reporting product behavior
- source-of-truth cutover

## References

- [ADR-010: AccountingJournal North-Star Source of Truth](../adr/ADR-010-ACCOUNTING-JOURNAL-SOT-NORTH-STAR.md)
- [Active Roadmap: PHASE 2 Trial Balance](../governance/active-roadmap.md)
- [Product Backlog: ACCT-2 Trial Balance](../governance/product-backlog.md)
