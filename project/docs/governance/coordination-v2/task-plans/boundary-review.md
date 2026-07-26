# T5 Task Plan Authoring — Independent Adversarial Review

```text
Reviewed           : OFFICE + COLLECTION dispositions (2026-07-26)
Planner            : CLAUDE (session agent)
Adversarial review : SEPARATE agent instance, read-only, instructed to REFUTE
                     and to default to "the planner was wrong" when uncertain
Base               : origin/main @ b5061d77
Mandate            : contract §15.2 — planner and adversarial reviewer may not
                     be the same agent or session
```

Both dispositions were **UPHELD on result**. The review nevertheless refuted or
qualified four points, two of which changed the stated reasoning materially.
Every finding below was then re-verified independently by the planner before
being recorded here.

## Findings

| # | Item tested | Verdict |
|---|---|---|
| 1 | Any bounded OFFICE task the planner missed | **PARTIALLY REFUTED** |
| 2 | Are the five OFFICE-AUTH-P02-HARDENING-R01 residuals really implemented | UPHELD |
| 3 | Is `Collection.confirmedAt` really unused in production code | UPHELD (one nuance) |
| 4 | Could a semantics-free W2.2D-1 sub-slice be ratified | UPHELD (must be named, not omitted) |
| 5 | Any missed program-independent constraint | **PARTIALLY REFUTED** |
| 6 | Does an open PR already cover a candidate | UPHELD |

## 1 — The planner's OFFICE reasoning was stale (accepted)

The planner reported that OFFICE had no selected delivery unit, citing
`OFFICE-DELIVERY-MANIFEST.md` §8. That section is dated 2026-07-17. The owner
selected the Phase 2 first unit on **2026-07-22** (`decision-log.md:30`,
CAP-09 Audit-Attribution Standard, three named slices).

Re-verified by the planner: the decision-log entry exists as described.

The result does not change — `CAP-09A-CONSUMER-01` is unauthorized and its
predecessor SLICE 2 is not closed — but the *reason* does. The correct reason is
"a bounded candidate exists but is unauthorized and predecessor-blocked", not
"no unit is selected".

This is a discipline failure worth recording plainly: the planner applied a
freshness test to `product-backlog.md` and caught a stale entry there, then
failed to apply the same test to `OFFICE-DELIVERY-MANIFEST.md §8` and
`active-roadmap.md`.

## 3 — Nuance on `confirmedAt` (accepted)

The substantive claim holds: no production code reads or writes the field's
meaning. The reviewer added that `case/case.service.ts:3866` spreads the whole
collection object, so an always-null `confirmedAt` is already serialized to
clients. No behaviour depends on it, but the field is on the wire.

## 4 — The rejected option had to be named (accepted)

The reviewer agreed a test-only characterization slice is shapeable on the W2.1A
precedent and that proposing it would be an owner decomposition act — but noted
the planner should have stated and rejected the option explicitly rather than
omitting it. It is now named in the COLLECTION summary §5.

## 5 — A real defect in the ratified V2 contract (accepted, escalated)

Contract §1 lists these as immutable global forbidden paths:

```text
project/prisma/     ← does not exist
project/deploy/     ← does not exist
project/ops/            exists
project/node_modules/
```

The real schema and migration surface is `project/apps/api/prisma/`, which is
**not** in the list. Verified by the planner: `project/prisma` and
`project/deploy` are absent from the tree; `project/apps/api/prisma` is present
and holds `schema.prisma` plus all migrations.

So §15.2's mechanical check — `boundary ∩ immutable global forbidden = ∅` —
would **pass** for a task boundary that adds a production migration under
`project/apps/api/prisma/migrations/`. The stated rationale for those entries
(`PRODUCTION_SCHEMA_MIGRATION_RUNTIME` is `DENIED` in V1 §3) is therefore not
enforced by the path list that is supposed to enforce it.

This cuts against the planner's own reasoning rather than for it: a
schema-touching boundary would not have been blocked mechanically. It is
recorded as a defect in the ratified contract and **not patched here** — amending
a ratified contract is an owner act, outside a GO-ANALYZE planning brief.

## 6 — No duplication

Open PRs at review time were #1613 (CLIENT portal reset-token transport, a
separate workstream) and #1605 (orchestration CI workflow). Neither touches
OFFICE CAP-09 / `staff.service.ts` nor COLLECTION W2.2D.

## Additional constraint surfaced by the review

`OFFICE-RISK-REGISTER.md:190` states the owner "yetkilendirmiştir" SLICE 3,
while `decision-log.md:30` — the authoritative closure source per
`OFFICE-OWNER-DECISIONS.md:9` — authorizes only SLICE 1. A register overstates
an authority the decision log does not grant. Recorded for owner attention; not
corrected here.

---

```text
OFFICE DISPOSITION     : UPHELD  (reasoning corrected)
COLLECTION DISPOSITION : UPHELD  (unregistered PR #1415 surfaced)
STRONGEST COUNTER-CASE : CAP-09A-CONSUMER-01 — best-shaped candidate in either
                         program; fails on authority and predecessor, not on shape
CONTRACT DEFECT        : §1 immutable-forbidden list points at non-existent
                         directories; real migration surface uncovered
```
