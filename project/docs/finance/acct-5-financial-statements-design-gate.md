# ACCT-5 Financial Statements Design Gate

**Status:** Design gate locked for implementation planning.
**Scope:** Documentation-only architecture and safety boundary for ACCT-5 Financial Statements before runtime work. No code, schema, migration, posting, writer, legal ledger, or TBK100 behavior change.
**Related:** `docs/adr/ADR-010-ACCOUNTING-JOURNAL-SOT-NORTH-STAR.md`, `docs/finance/acct-2a-trial-balance-diagnostic-endpoint.md`, `docs/finance/acct-3-distribution-recommendation-closure-gate.md`, `docs/finance/acct-4-offset-payout-closure-gate.md`, `docs/governance/active-roadmap.md` PHASE 5, `docs/governance/product-backlog.md` ACCT-5.

## Purpose

ACCT-5 may start only as a journal-derived financial statement read-model phase after the ACCT-1 journal foundation and ACCT-2 Trial Balance faithfulness evidence are available. This gate separates financial statements from Trial Balance diagnostics, AccountingJournal posting, the current legal ledger, TBK100 rules, and broader firm reporting.

The immediate goal is to prevent a statement feature from accidentally becoming a writer, source-of-truth cutover, legal-ledger projection, or TBK100 recalculation path.

## Repo Evidence Reviewed

- `CLAUDE.md`
- `docs/governance/active-roadmap.md`
- `docs/governance/product-backlog.md`
- `docs/adr/ADR-010-ACCOUNTING-JOURNAL-SOT-NORTH-STAR.md`
- `docs/finance/acct-2a-trial-balance-diagnostic-endpoint.md`
- `docs/finance/acct-3-distribution-recommendation-closure-gate.md`
- `docs/finance/acct-4-offset-payout-closure-gate.md`
- `apps/api/src/modules/accounting-journal/accounting-journal-trial-balance.controller.ts`
- `apps/api/src/modules/accounting-journal/accounting-journal-trial-balance.service.ts`
- `apps/api/src/modules/client-statement/client-statement.controller.ts`
- `apps/api/src/modules/client-statement/client-statement.service.ts`

## Current Program Position

Active roadmap PHASE 5 defines Financial Statements as `Cari/ekstre/finansal tablolar journal-turevi`. Product Backlog ACCT-5 keeps it in `BACKLOG` with these gates:

- depends on ACCT-1 and ACCT-2
- unlock condition: `Journal + Trial Balance faithfulness kanitlandi`
- target value: canonical-source client/company statements
- target technical direction: journal-derived projection readers aligned with ADR-010

Therefore ACCT-5 implementation must not begin as a source-writing phase. It starts as a read-model contract only after the journal and Trial Balance evidence path is ready.

## Boundary Decisions

### Trial Balance Diagnostic Boundary

`GET /accounting-journal/trial-balance` is an admin-only diagnostic endpoint. Its documented contract says it is not a reporting product, not a financial statement surface, and not an operator-facing accounting report.

ACCT-5 must not reuse that endpoint response as a financial statement contract. Trial Balance remains an evidence harness for:

- debit/credit balance evidence
- account and currency aggregates
- source coverage diagnostics
- ADR-010 faithfulness inspection
- warnings about scoped or incomplete evidence

Financial statements need a separate statement/read-model contract with product semantics. A green Trial Balance is a precondition signal, not the statement itself.

### AccountingJournal Boundary

ADR-010 defines AccountingJournal as the north-star financial-event source of truth direction, but execution remains gated. ACCT-5 must read from journal-derived projections only when the preceding phases prove the evidence chain.

ACCT-5 does not authorize:

- new journal posting behavior
- journal writer changes
- new entry types or source mappings
- idempotency-key changes
- source-of-truth cutover
- direct mutation of AccountingJournal rows from statement generation

A financial statement reader may aggregate posted journal evidence, but it must not write journal entries, repair journal entries, or backfill missing sources.

### Legal Ledger Boundary

`LedgerEntry` and `LedgerAllocation` remain the current TBK100/legal ledger storage. ADR-010 allows that storage to become journal-derived later only after shadow/prove/legal-signoff, but that cutover is not ACCT-5.

ACCT-5 financial statements must not present themselves as legal ledger replacement or legal entitlement proof. If a statement needs legal-ledger comparison, that comparison is evidence or reconciliation metadata, not a storage authority move.

### TBK100 Boundary

TBK100 rules remain legal authority for interest and allocation order. ACCT-5 does not recalculate, reinterpret, or override TBK100.

Financial statements may display amounts that are already produced by approved upstream legal/accounting flows. They must not derive new TBK100 allocation results, change legal allocation order, or treat journal projection math as a substitute for TBK100 legal calculation.

### Reporting Boundary

ACCT-5 is financial statements. ACCT-6 is firm-wide reporting.

ACCT-5 may define client/case/account statement contracts such as period, currency, opening balance, movement lines, closing balance, and reconciliation metadata. It must not expand into firm-wide dashboards, management reporting, cross-tenant analytics, KPI reporting, or aggregate report packs. Those belong to ACCT-6.

## Diagnostic/Admin/Debug Versus Reporting Surface

Diagnostic/admin/debug surfaces are evidence tools for technical and accounting verification. They may expose warning codes, source coverage, balance evidence, and scope diagnostics. They are not customer/operator financial statements.

Reporting/statement surfaces are product-facing read models. They need stable period, currency, tenant, account, case/client scope, and display semantics. They should expose confidence or reconciliation status when evidence is incomplete, but they should not leak raw idempotency material, source hashes, metadata JSON, actor identifiers, or internal diagnostics as primary content.

ACCT-5 should keep both layers separate:

| Layer | Audience | Purpose | Allowed Source | Not Allowed |
|---|---|---|---|---|
| Trial Balance diagnostic | Admin/developer | Evidence that journal lines balance and faithfulness can be inspected | Persisted AccountingJournal aggregates | Operator report, customer statement, legal ledger proof |
| Financial Statement read model | Operator/customer-facing product path after gate | Periodized financial statement projection | Journal-derived statement projection, with reconciliation status | Writer calls, TBK100 recalculation, source-of-truth cutover |
| ACCT-6 Reporting | Firm management | Firm-wide reports and dashboards | Statement/report projections after ACCT-5 | Implemented inside ACCT-5 |

## Minimum ACCT-5 Contract Shape

The first ACCT-5 contract should be read-only and explicit about scope:

- authenticated tenant context is the only tenant authority
- period is explicit and normalized
- currency is explicit; no silent FX conversion
- statement type is explicit, for example client statement, case statement, or account statement
- source basis is explicit, for example journal-derived projection
- date basis is explicit and must not silently switch between `postedAt`, effective date, paid date, or legal allocation date
- opening, movements, and closing are computed from the same declared basis
- reconciliation status is included when Trial Balance or legal-ledger faithfulness evidence is incomplete
- raw internal journal metadata is not exposed as a product-facing field

## Preconditions For Runtime Work

Before any ACCT-5 runtime implementation:

1. ACCT-1 journal writer/posting foundation is present for the required sources.
2. ACCT-2 Trial Balance evidence is available for the intended scope and currencies.
3. The statement basis is selected explicitly: posted date, effective date, or another approved date basis.
4. Currency behavior is selected explicitly: per-currency statements first, with no FX conversion unless a separate approved design gate exists.
5. The first statement surface is limited to one narrow scope; do not start with all financial statements at once.
6. Product copy distinguishes statement/reconciliation evidence from legal ledger/TBK100 authority.

## Explicit Non-Goals

This design gate does not introduce or authorize:

- code changes
- schema or migration work
- posting or writer behavior
- legal ledger behavior changes
- TBK100 rule changes
- Trial Balance endpoint behavior changes
- ClientStatement lifecycle changes
- ACCT-6 firm-wide reporting
- source-of-truth cutover

## First Small Implementation Task

Recommended first implementation task: **ACCT-5A Financial Statement Read Contract Spec**.

Scope ACCT-5A to a docs/test-level contract only:

- choose one narrow statement type, preferably a read-only journal-derived client/case statement projection
- define DTO fields for tenant-auth context, period, currency, date basis, source basis, opening, movements, closing, and reconciliation status
- add focused service spec fixtures proving that the projection reads from prepared journal evidence and does not call posting/writer/legal-ledger/TBK100 mutation paths
- do not add controller routes, schema, migrations, writer calls, or runtime behavior until ACCT-5A contract is accepted

## Result

ACCT-5 can proceed to implementation planning only as a read-only, journal-derived financial statement projection phase. Trial Balance remains diagnostic evidence, AccountingJournal writer behavior remains outside ACCT-5, legal ledger/TBK100 authority is unchanged, and firm-wide reporting remains ACCT-6.