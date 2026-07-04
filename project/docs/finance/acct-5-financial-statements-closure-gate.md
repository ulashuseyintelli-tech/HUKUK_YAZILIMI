# ACCT-5 Financial Statements Closure Gate

**Status:** Closed by owner decision.
**Scope:** Documentation/status-only closure review for ACCT-5 design gate and ACCT-5A through ACCT-5C. No code, schema, migration, UI, posting, writer, legal ledger, or TBK100 behavior change.
**Reviewed on:** 2026-07-01.
**Canonical HEAD reviewed:** `f1a5e212c4c2bb248de1bdb2b84fe5dc467f07a4`.

## Decision

ACCT-5 is **CLOSED** by owner decision. Owner karari: ACCT-5 fazi kapatildi. READY FOR OWNER CLOSURE -> CLOSED.

No remaining ACCT-5-specific read-contract, projection-service, HTTP/controller-boundary, documentation, schema, migration, UI, posting, writer, legal-ledger, or TBK100 blocker was found.

## Purpose

This gate reviews whether ACCT-5 Financial Statements has remaining read-contract, projection-service, HTTP/controller-boundary, documentation, schema, migration, posting, writer, legal-ledger, or TBK100 work after ACCT-5A through ACCT-5C.

Conclusion: ACCT-5 is technically ready for owner closure. No blocking backend contract, projection, HTTP boundary, docs/status, schema, migration, posting, writer, legal ledger, or TBK100 work remains in the ACCT-5A-C scope.

## Merge Evidence

| Slice | Evidence | PR | Squash SHA |
|---|---|---|---|
| ACCT-5 design gate | Financial Statements architecture and safety boundary | #725 | `55ec85a240ef207a5f6b088145fc965ae053fcc2` |
| ACCT-5A | Financial Statement read DTO/type contract and focused spec | #727 | `f39c81ecf7f2652de042d030b53ce0c23eff946c` |
| ACCT-5B | Read-only projection service contract and focused spec | #728 | `4edea70f458a502ca4002905401597d1b9b5c2ee` |
| ACCT-5C | HTTP/controller boundary contract and smoke coverage | #730 | `ad25c224bd5915b600e3ac984714e5e73a699b85` |
| Final canonical HEAD at closure review | Later canonical state after #731 and #732 | - | `f1a5e212c4c2bb248de1bdb2b84fe5dc467f07a4` |

The final canonical HEAD differs from ACCT-5C because #731 and #732 were merged after #730. Repo evidence shows #731 changed only `project/apps/api/src/modules/client-settlement/client-settlement.module.ts` to declare a client accounting shadow provider. Repo evidence shows #732 adds expense payment journal source skeleton schema/types/tests. Neither later merge alters the ACCT-5 Financial Statement read contract, projection service, controller, HTTP smoke tests, UI, posting/writer behavior, legal ledger behavior, or TBK100 behavior.

## Reviewed Sources

- `CLAUDE.md`
- `project/docs/finance/acct-5-financial-statements-design-gate.md`
- `project/apps/api/src/modules/accounting-journal/accounting-journal-financial-statement.types.ts`
- `project/apps/api/src/modules/accounting-journal/__tests__/accounting-journal-financial-statement.contract.spec.ts`
- `project/apps/api/src/modules/accounting-journal/accounting-journal-financial-statement.projection.service.ts`
- `project/apps/api/src/modules/accounting-journal/__tests__/accounting-journal-financial-statement.projection.service.spec.ts`
- `project/apps/api/src/modules/accounting-journal/accounting-journal-financial-statement.controller.ts`
- `project/apps/api/src/modules/accounting-journal/__tests__/accounting-journal-financial-statement.http-smoke.spec.ts`
- `project/apps/api/src/modules/accounting-journal/accounting-journal-trial-balance.controller.ts`
- `project/apps/api/src/modules/accounting-journal/accounting-journal-trial-balance.module.ts`
- `project/docs/governance/active-roadmap.md`
- `project/docs/governance/product-backlog.md`

## Contract Readiness

ACCT-5A locks the first narrow Financial Statement read contract:

- `statementType` is explicitly limited to `CLIENT_CASE_STATEMENT`.
- tenant context is part of the request contract and is not represented as query override material.
- period is explicit and uses `dateBasis: postedAt`.
- currency is explicit; no silent FX or reporting-currency conversion fields are exposed.
- scope is limited to `caseId`, `clientId`, and nullable `caseClientId`.
- response exposes `surface: FINANCIAL_STATEMENT` and `sourceBasis: JOURNAL_DERIVED_PROJECTION`.
- opening, movements, closing, and reconciliation metadata are included.
- raw internal journal, idempotency, metadata, actor, legal ledger, TBK100, Trial Balance row, and diagnostic fields are forbidden from the read response contract.

## Projection Service Readiness

ACCT-5B locks the read-only projection service boundary:

- projection reads persisted `AccountingJournalLine` rows only.
- source scope is tenant, period, currency, case, client, and optional case-client.
- journal entry date basis is `postedAt`.
- account scope is the narrow `CLIENT_PAYABLE` client-case statement account.
- response remains a Financial Statement reporting surface, not Trial Balance diagnostics.
- reconciliation keeps Trial Balance and legal-ledger comparison as evidence metadata only.
- tests assert no posting, writer, legal ledger, or TBK100 paths are called.
- unsupported statement type and non-`postedAt` date basis are rejected before DB read.

## HTTP Boundary Readiness

ACCT-5C locks the read-only HTTP boundary:

- route: `GET /accounting-journal/financial-statements`.
- class guard: `JwtAuthGuard`.
- method guard: `AdminGuard`.
- no JWT returns `401` and does not call the projection service.
- non-admin JWT returns `403` and does not call the projection service.
- admin JWT returns the Financial Statement projection response contract.
- query `tenantId` spoofing is ignored; authenticated tenant context wins.
- invalid `statementType`, invalid `dateBasis`, invalid `from`/`to`, and missing required query values return `400` before service delegation.
- success response asserts statement type, period, currency, tenant context, scope, opening, movement, closing, and reconciliation fundamentals.

## Reporting Versus Diagnostic Boundary

The design gate and specs keep Financial Statements separate from diagnostic/admin/debug surfaces:

- Trial Balance remains an admin diagnostic evidence endpoint.
- Financial Statement response is a product/reporting statement surface with periodized movement semantics.
- Trial Balance evidence appears only as reconciliation status, not as Trial Balance rows/totals/diagnostics/source breakdown.
- ACCT-5 does not expand into ACCT-6 firm-wide reporting, dashboards, cross-tenant analytics, or report packs.
- legal ledger and TBK100 remain authority boundaries; ACCT-5 does not present the journal-derived projection as legal entitlement proof.

## Closure Boundary

ACCT-5 remains bounded to the first read-only Financial Statement contract, projection service, and HTTP boundary. It does not authorize:

- schema or migration work
- UI work
- new journal posting behavior
- writer changes
- source-of-truth cutover
- legal ledger behavior changes
- TBK100 recalculation or reinterpretation
- ACCT-6 reporting expansion

Any expansion beyond this scope requires a later approved task or design gate.

## Result

ACCT-5 is ready for owner closure because the design boundary is documented, the read contract is typed and spec-locked, the projection service is read-only and spec-locked, the HTTP boundary is smoke-tested, and no remaining ACCT-5A-C blocker was found.
