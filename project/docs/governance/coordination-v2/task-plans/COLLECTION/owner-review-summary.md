# COLLECTION — T5 Task Plan Authoring: Owner Review Summary

```text
Program            : COLLECTION (RC-COL)
Target workstream  : W2.2D-1 — confirmedAt / projection hardening
Disposition        : NO_RATIFIABLE_BOUNDED_TASK_PLAN
plan.draft.json    : NOT PRODUCED (nothing ratifiable to draft — see §3, §4)
Planner            : CLAUDE (planner lane, §15.1)
Future executor    : CODEX (planner may not execute what it plans)
Base               : origin/main @ b5061d77
Authored           : 2026-07-26, GO-ANALYZE
Authority produced : NONE — this document ratifies nothing and grants nothing
```

## 1. The authorization chain IS proven

Unlike OFFICE, COLLECTION's chain checks out:

```text
W2.1                                     CLOSED / CANONICAL
W2.2A · W2.2B · W2.2C-0..C-5             CLOSED / CANONICAL
W2.2D-0                                  CLOSED / CANONICAL (reconciliation merged;
                                         decision-log.md:75, 2026-07-18)
COL/OD-06A · COL/OD-21                   RECORDED
W2.2D-1                                  named as the next gate
```

`COLLECTION-DECOMPOSITION.md:487` states it explicitly:

```text
W2.2D-1 : OWNER GO REQUIRED / IMPLEMENTATION NOT AUTHORIZED
          — confirmedAt / projection hardening
```

So the blocker is not a missing predecessor. It is what the gate is holding.

## 2. What the gate is actually holding

`COL-RISK-G03` is `PARTIALLY MITIGATED — CONFIRMEDAT / PROJECTION HARDENING
REMAINS`, and its stated exposure is *"External-settlement finality sonrası
canonical Collection confirmation ve unapplied payment lifecycle'ı eksik
(overpayment ile örtük eşitlik riski)"*.

Repository truth on the field itself:

- `apps/api/prisma/schema.prisma:2411` — `confirmedAt DateTime?` exists on
  `Collection`, beside `status CollectionStatus @default(CONFIRMED)`
- **No production code reads or writes it.** A repo-wide search over
  `apps/api/src`, `apps/web/src` and `packages`, excluding tests and fixtures,
  returns nothing. The only hits are a different concept
  (`noInterestAudit.confirmedAt` in case/inventory fixtures) and
  `payment-mapper.spec.ts:98`, which asserts `confirmedAt` is *not* propagated.
- It is nevertheless already on the wire: `case/case.service.ts:3866` spreads
  the whole `collection` object, so `GET /cases/:id/collections` emits an
  always-null `confirmedAt`.

A collection is therefore `CONFIRMED` by default while `confirmedAt` stays
null — which is precisely the implicit-equality ambiguity `COL-RISK-G03` names.

## 3. Why no bounded code task can be drafted

"Hardening" would not harden existing behaviour; there is none. It would
*introduce* the confirmation lifecycle, which requires settling questions the
owner gate is holding:

```text
when is confirmedAt set, and by which command
what does status=CONFIRMED mean while confirmedAt is null
how does unapplied remainder / overpayment interact with confirmation
which projections may expose it, and as what
```

Those are legal/financial semantic decisions under `SYS-FIN-*`. A planner
choosing them would be inventing domain policy, so no plan is drafted.

## 4. Unregistered execution already happened — reconcile before any plan

This is the more serious finding, and it changes what the owner must do first.

```text
PR #1415        MERGED 2026-07-18T18:35:53Z
squash          80a11c2a4dff
branch          codex/rc-col-w2-2d1-confirmed-at
title           feat(collection): add confirmedAt schema foundation
migration       20260718210000_rc_col_w2_2d1_collection_confirmed_at_foundation
```

That is where the schema column came from: **part of W2.2D-1 was already
executed and merged, including a production migration.** No governance record
registers it — the only `1415` / `80a11c2a` match anywhere under
`project/docs/governance/` is an incidental base-SHA mention inside an unrelated
CLIENT record (`decision-log.md:335`).

Meanwhile every register still says `W2.2D-1 OWNER GO REQUIRED /
IMPLEMENTATION NOT AUTHORIZED`. So the repository state and the governance
state disagree about whether W2.2D-1 has begun.

Under contract §15.4, a plan cannot be drafted over an already-merged change
that no record accounts for: any task spec would be pinned against a baseline
whose provenance is unreconciled.

## 5. The semantics-free slice, named and rejected

There is a real precedent for a bounded, semantics-free slice: W2.1A shipped as
*test-only evidence* (PR #1315 / `1d5974e5`), changing no runtime. The
equivalent here would assert that `Collection.confirmedAt` stays null across the
admission path, that `CollectionStatus.CONFIRMED` implies no confirmation
timestamp, and that no allocation or overpayment path reads it.

That would decide no semantics and change no behaviour — it is genuinely
shapeable. It is still **not proposed**, because W2.2D-1 is a single
undecomposed gate: carving a test-only sub-slice means minting a new ID, and
every prior split in this program (W2.2C-0…C-5, W2.2D-0) was an owner
decomposition act. Proposing it would be the planner making a decomposition
decision reserved to the owner (§15.5).

It is recorded here so the owner can take it if they want a bounded T5 target
quickly.

## 6. What would make COLLECTION ratifiable

In order:

```text
1. Reconcile PR #1415 / 80a11c2a into the governance record — decide whether
   the merged schema foundation counts as part of W2.2D-1 and update its status
   accordingly. Without this, any plan is pinned to an unaccounted baseline.
2. Then either
     a. settle the confirmedAt / unapplied-remainder semantics (COL-RISK-G03),
        which makes the full W2.2D-1 plannable, or
     b. authorize a decomposed test-only characterization sub-slice (§5), which
        is plannable immediately and decides nothing.
```

Option (b) is the shorter path to a live T5 pilot; option (a) is what actually
closes `COL-RISK-G03`.

---

**EXECUTION AUTHORITY: NOT GRANTED.** This document produces no owner decision,
no grant, no ratification and no implementation authority.
