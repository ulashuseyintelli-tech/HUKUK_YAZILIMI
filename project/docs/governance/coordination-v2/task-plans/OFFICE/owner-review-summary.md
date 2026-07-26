# OFFICE — T5 Task Plan Authoring: Owner Review Summary

```text
Program            : OFFICE
Disposition        : NO_RATIFIABLE_BOUNDED_TASK_PLAN
plan.draft.json    : NOT PRODUCED (nothing ratifiable to draft — see §3)
Planner            : CLAUDE (planner lane, §15.1)
Future executor    : CODEX (planner may not execute what it plans)
Base               : origin/main @ b5061d77
Authored           : 2026-07-26, GO-ANALYZE
Authority produced : NONE — this document ratifies nothing and grants nothing
```

## 1. What was asked

Identify OFFICE's next genuinely owner-gated, bounded workstream and, if one
exists, author an immutable task plan for owner ratification (§15).

## 2. The candidate that exists

The owner **did** select the Phase 2 first unit. `decision-log.md:30`
(2026-07-22) records `OFFICE PHASE 2 / W-P2-α — CAP-09
AUDIT-ATTRIBUTION-STANDARD OWNER GO-DECIDE`, choosing option ② *Audit-Attribution
Standard (CAP-09)* and naming three delivery slices:

```text
SLICE 1  CAP-09A-GOV            ← the only slice this record authorizes
SLICE 2  CAP-09A-FOUNDATION
SLICE 3  CAP-09A-CONSUMER-01    ← the bounded code candidate
```

`CAP-09A-CONSUMER-01` is the strongest bounded candidate in either program:

- Owner-accepted CONFIRMED code-level finding `STF-PRD-AUDIT-001`
  (`OFFICE-RISK-REGISTER.md:185,190`)
- Genuinely narrow target: bring `StaffService.remove()` to the transactional
  audit parity `LawyerService.delete()` already has. Verified unimplemented —
  `apps/api/src/modules/staff/staff.service.ts` contains zero `auditLog`
  occurrences; `lawyer/lawyer.service.ts` contains two.
- Owner-authored `outOfScope` already exists (CaseStaff and other consumers
  explicitly not included)
- Zero schema, zero migration, no legal/financial semantics to settle — the
  target is defined by parity with existing code

## 3. Why it is nevertheless not ratifiable today

Two independent gates, either one sufficient:

1. **Implementation authority is absent.** The same owner record authorizes
   *only* SLICE 1 and states implementation authority `NONE`. A plan cannot be
   ratified into an execution grant against a slice the owner has not
   authorized.
2. **Its declared predecessor is not closed.** SLICE 2 (`CAP-09A-FOUNDATION`)
   is neither authorized nor closed, so contract §3 `ELIGIBLE` — which requires
   every declared predecessor `CLOSED` — is unreachable. Re-sequencing SLICE 3
   ahead of SLICE 2 would be an owner decomposition decision (§15.5), not a
   planner decision.

Drafting a plan for SLICE 3 would therefore either encode an authority the
owner has not given, or silently re-order an owner-declared slice sequence.
Both are forbidden to the planner, so no plan is drafted.

## 4. Candidates examined and rejected

| Candidate | Why not ratifiable |
|---|---|
| `CAP-09A-CONSUMER-01` (SLICE 3) | Unauthorized + predecessor SLICE 2 not closed (§3, §15.5) |
| `CAP-09A-FOUNDATION` (SLICE 2) | Not authorized by the owner record; only SLICE 1 is |
| `CANDIDATE-K2` (Bulk Case-Assignment) | `BLOCKED_ON_PRODUCT_DECISION` — a product decision is not an implementable task |
| `CANDIDATE-K3` (Legal-Responsible Promotion Re-check) | `DEFERRED` / `NOT_SELECTED` |
| `OFFICE-AUTH-P02-HARDENING-R01` | Register is **stale**: all five residuals are already implemented — see §5 |
| Portal reset-token transport | Already in flight as another session's PR #1613; duplicating it would collide |

## 5. Two stale registers found (owner attention, not fixed here)

Both would mislead the next agent. Neither is corrected by this task —
amending a roadmap or register is outside a GO-ANALYZE planning brief.

**a. `product-backlog.md` claims work that is done.** The entry reads
`Status: OPEN / NOT IMPLEMENTED` and `NEXT ELIGIBLE ACTION:
OFFICE-AUTH-P02-HARDENING-R01`, but every one of its five owner-ratified
residuals is present in code:

| Residual | Evidence |
|---|---|
| 1. composite `(tenantId,userId)` FK + partial unique index | `migrations/20260721010000_office_auth_p02_hardening_r01_composite_fk/migration.sql:12,20`; `schema.prisma:372` |
| 2. feature flag + `GET /api/auth/capabilities` | `auth.controller.ts:21`; `password-reset.service.ts:40` |
| 3. SERIALIZABLE + P2034 retry | `password-reset.service.ts:126,146` |
| 4. audit taxonomy | `password-reset.service.ts:117,181,198` — three distinct actions |
| 5. reset link via URL fragment | `password-reset.service.ts:49`; `apps/web/src/app/auth/reset-password/page.tsx:24-28` |

An agent trusting that register would re-implement finished work.

**b. `OFFICE-DELIVERY-MANIFEST.md` §8 is five days behind.** It still records
`NEXT ELIGIBLE UNIT: NONE`, `CURRENT SELECTED DELIVERY UNIT: NONE` and
`NEXT OWNER-GATED UNIT: Phase 2 First-Unit Selection` as of 2026-07-17, while
the selection happened 2026-07-22. The manifest is declared the delivery-status
authority, so the gap matters.

Related imprecision: `OFFICE-RISK-REGISTER.md:190` says the owner
"yetkilendirmiştir" SLICE 3, while `decision-log.md:30` — the authoritative
closure source per `OFFICE-OWNER-DECISIONS.md:9` — authorizes only SLICE 1.

## 6. What would make OFFICE ratifiable

One owner action, in either form:

```text
either  authorize SLICE 2 (CAP-09A-FOUNDATION), let it close, then SLICE 3
        becomes ELIGIBLE and a plan can be drafted against it
or      explicitly re-sequence CAP-09A-CONSUMER-01 ahead of SLICE 2 and
        authorize it directly (an owner decomposition decision)
```

Until then OFFICE has a well-shaped candidate and no authority to plan against
it.

---

**EXECUTION AUTHORITY: NOT GRANTED.** This document produces no owner decision,
no grant, no ratification and no implementation authority.
