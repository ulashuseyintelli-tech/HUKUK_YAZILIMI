# C-2D-2 — Offset Detail QA Smoke / Backlog Review

**Status:** COMPLETED.

**Work level:** Faster / low.

**Base:** `origin/main@de19455e4743f532c531a00704ee486667930800`.

**Scope:** QA smoke and backlog classification only. No financial behavior, schema, migration, API contract, authorization, ledger, statement, payout, offset apply, offset reverse, or audit write change is introduced by this checkpoint.

## Impact Scope

- Runtime impact: none.
- Multitenant impact: none; this checkpoint only verifies tenant-scoped behavior already merged in C-2D-1.
- Schema impact: none.
- Migration impact: none.
- API contract impact: none.
- Financial/accounting impact: none.
- UI implementation impact: none; no C-2D-2 UI patch was needed.

## Smoke Verification

### Endpoint

`GET /client-offsets/:offsetId/detail` was reviewed through the merged controller/service/tests.

Verified:

- `tenantId` is taken from authenticated request context only.
- Offset lookup is scoped by `{ id, tenantId }`.
- Source joins for case, caseClient, expenseRequest, actor, reverse linkage, and audit are tenant-scoped.
- Cross-tenant or missing offset hard-fails with `NotFoundException` before source/audit reads.
- Response does not include backend `canReverse` or `alreadyReversed` truth.
- Response does not expose raw audit metadata.

### Drawer

`OffsetDrawer` history tab was reviewed through the merged component and focused tests.

Verified:

- Detail panel opens lazily from a history row.
- Loading state is present: `Detay yukleniyor`.
- Error state is present: `Detay alinamadi.`.
- Empty history state is present: `Henuz mahsup yok.`.
- Source labels are rendered from the detail projection.
- Actor display is rendered from the detail projection.
- Audit timeline renders safe summaries, actor display, action, and timestamp.
- Raw metadata such as `DIRECT_CAPABILITY` is not rendered.

### Reverse Relationship

Verified:

- Frontend still derives already-reversed state from canonical `REVERSAL.reversesOffsetId` list data.
- Backend detail projection does not introduce `canReverse` / `alreadyReversed` truth.
- Detail projection may show factual `reversesOffsetId` / `reversedByOffsetId` links only.

### Audit Visibility

Verified:

- Detail endpoint projects `action`, actor display, `createdAt`, and `safeSummary`.
- Raw audit metadata is not selected by the read service and is not rendered by the UI.
- Current ClientOffset audit descriptions are system-generated summaries for apply/reverse operations.

## Validation Evidence

Focused validation used the existing C-2D-1 smoke tests:

- Backend focused Jest: `client-offset.service.spec.ts --runInBand`.
- Frontend focused Vitest: `offset-drawer.test.tsx client-offset-api-unwrap.test.ts`.
- Web typecheck: `tsc --noEmit --pretty false`.

## Backlog Classification

### BUG

None found in the C-2D-1 detail projection smoke review.

### POLISH

1. Detail expand button copy could optionally toggle between `Detay` and `Kapat`.
   - Reason: current behavior is clear enough, but a toggled label would make expanded state more explicit.
   - Status: defer; not required for contract correctness.

2. Real browser screenshot smoke with seeded offset data can be added later.
   - Reason: component tests cover the interaction path; a live seeded browser pass would add visual confidence.
   - Status: defer until a seeded QA environment is available.

### DEFER

1. Audit timeline pagination or grouping.
   - Reason: current endpoint returns the full offset audit history for one offset. Pagination is unnecessary unless real data shows long timelines.

2. Rich source labels beyond current case/expense/payable summary.
   - Reason: current labels satisfy C-2D-1 scope. Additional labels may require product-specific display rules.

### NEW PRODUCT DECISION

1. Audit description sanitization policy for future user-authored descriptions.
   - Reason: C-2D-1 does not expose metadata, and current ClientOffset descriptions are system-generated. If future audit descriptions include free text from users, a product/security decision should define whether description can be shown as `safeSummary` or must be mapped to action-only labels.

## Decision

C-2D-1 detail projection is production-smoke ready. No runtime patch is recommended from C-2D-2.

## NEXT RECOMMENDED STEP

Active phase: C-2D.

Recommended next work: C-2D closeout or move the `Audit description sanitization policy` item to Product Backlog for future decision.

Backlog Review Required: YES.

READY candidates: none.

New Product Backlog items:

- Audit description sanitization policy for future user-authored audit descriptions.
- Optional live browser screenshot smoke with seeded offset data.

Pending architecture decisions: none.

## ÖNERİLEN ÇALIŞMA SEVİYESİ

Faster / low.

Reason: follow-up is backlog triage or docs/checkpoint only; no code, migration, or financial behavior change.
