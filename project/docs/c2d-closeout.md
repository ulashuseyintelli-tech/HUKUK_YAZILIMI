# C-2D Closeout — Offset Audit Detail Projection

**Epic Status:** CLOSED.

**Work level:** Faster / low.

**Base:** `origin/main@ff28a370318648304868a086658227ba2676d9e3`.

## Final Verification

| Phase | Status | PR | Merge commit | Scope |
|---|---|---|---|---|
| C-2C | MERGED | #638 | `5117ffaed86c4f02d6b2ec569cecd1687f5b1cac` | Frontend-only history/reverse UI polish |
| C-2D-1 | MERGED | #644 | `1e992f9caf30f66332d3509341edac81d73bac91` | Read-only offset detail projection |
| C-2D-2 | MERGED | #646 | `494e22d3cd74bd51a487864348d232a664ea0635` | QA smoke and backlog review docs |

Verified final state:

- Schema change: none in C-2D.
- Migration change: none in C-2D.
- Financial behavior change: none.
- Offset apply behavior change: none.
- Offset reverse behavior change: none.
- Ledger behavior change: none.
- Statement behavior change: none.
- Payout behavior change: none.
- Authorization model change: none.
- Tenant isolation: preserved.
- API contract change: read-only `GET /client-offsets/:offsetId/detail` only.
- Canonical main: verified aligned with `origin/main` at closeout start.

## Product Goal

C-2D made offset history review safer and more useful by adding a read-only detail projection for each offset row. The goal was operational visibility, not accounting mutation.

The user can inspect who created an offset, which sources it links to, whether it reverses or is reversed by another offset, and the sanitized audit timeline without exposing raw audit metadata.

## Implemented Scope

- Read-only backend endpoint: `GET /client-offsets/:offsetId/detail`.
- Tenant-scoped offset/source/audit projection.
- Source labels for payable and expense legs.
- Actor display information.
- Sanitized audit events with action, actor display, timestamp, and safe summary.
- Frontend API client method for offset detail.
- OffsetDrawer row detail expansion UI.
- Focused backend tests for tenant isolation, projection, audit sanitization, and no write calls.
- Focused frontend tests for lazy detail loading, source/audit display, and raw metadata absence.
- QA smoke checkpoint with backlog classification.

## Explicitly Excluded Scope

- No Prisma schema change.
- No migration.
- No ledger logic change.
- No statement generation change.
- No payout behavior change.
- No offset apply/reverse mutation behavior change.
- No authorization `ActionCode` or permission model change.
- No backend `canReverse` truth.
- No backend `alreadyReversed` truth.
- No raw audit metadata projection to UI.

## Validation Summary

C-2D validation evidence:

- PR #644 CI: 3/3 SUCCESS.
- PR #646 CI: 3/3 SUCCESS.
- Backend focused Jest: `client-offset.service.spec.ts --runInBand` passed, including C-2D detail projection tests.
- Frontend focused Vitest: `offset-drawer.test.tsx` and `client-offset-api-unwrap.test.ts` passed.
- Web typecheck passed during C-2D-1 and C-2D-2 validation.
- `git diff --check` clean in implementation/checkpoint PRs.

## Final Architecture State

Offset read/write boundaries remain separated:

- Write side: existing apply/reverse endpoints remain unchanged.
- Read side: `GET /client-offsets/:offsetId/detail` exposes only safe detail projection.
- Reversal state remains derived from canonical `REVERSAL.reversesOffsetId` list data on the frontend.
- Detail projection may show factual `reversesOffsetId` and `reversedByOffsetId` but does not become a reversal eligibility authority.
- Audit detail is sanitized and does not leak raw metadata.

## Temporary Notes / TODO Review

Search found no C-2D temporary TODO or temporary implementation note requiring removal.

The C-2D-1 `OffsetDrawer` comment explaining the read-only detail query is intentional architecture context, not a temporary note.

## Product Backlog Review

Backlog items moved into `project/docs/governance/product-backlog.md`:

### POLISH

1. Detail/Kapat button copy toggle.
   - Reason: Current `Detay` button works, but toggling to `Kapat` when expanded would make state clearer.

2. Optional seeded live browser screenshot smoke.
   - Reason: Component tests cover behavior; seeded browser smoke would add visual confidence when a stable QA fixture is available.

### DEFER

1. Audit timeline pagination/grouping.
   - Reason: Current one-offset audit timeline is sufficient. Pagination/grouping should wait for real long-history pressure.

2. Richer source label rules.
   - Reason: Current case/expense/payable labels satisfy C-2D. Richer labels need product-specific display rules.

### PRODUCT DECISION

1. Future user-authored audit description sanitization policy.
   - Reason: Current ClientOffset descriptions are system-generated. If future audit descriptions include user-authored text, policy must decide whether `description` can be shown as `safeSummary` or must be mapped to action-only safe labels.

## Closeout Decision

C-2D is closed. No runtime patch is required.

## NEXT RECOMMENDED STEP

Active Phase: None from C-2D.

Recommended next work: Audit description sanitization policy — GO-ANALYZE.

Why: It has the highest risk-adjusted value among the remaining backlog items. It is product/security/legal boundary work, can be done read-only/design-first, and prevents future raw user-authored audit text from accidentally becoming UI-visible.

Backlog Review Required: YES.

READY candidates: none without owner approval.

New Product Backlog items: C2D-POLISH-1, C2D-POLISH-2, C2D-DEFER-1, C2D-DEFER-2, C2D-PD-1.

Pending architecture decisions: Future user-authored audit description sanitization policy.

## ÖNERİLEN ÇALIŞMA SEVİYESİ

Faster / low for closeout/backlog maintenance.

For the recommended next work, use GO-ANALYZE with High/Ultra because it is security/legal product boundary analysis, not UI polish.
