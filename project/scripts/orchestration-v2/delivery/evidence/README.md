# Delivery evidence

Panels written by `pnpm verify:live --evidence-dir <dir>`.

Each file is one observation of what the system could actually do, at one
commit, through the entrypoints an operator uses. The filename carries the SHA
because that is the only question ever asked of this directory: *what did this
commit deliver?* A directory of timestamps cannot answer it.

These records live under `scripts/` rather than `docs/governance/` on purpose.
They are measurements produced by code, not governance decisions — the canonical
governance tree is a semantic surface with its own writer path, and putting
machine output there would put every future verification run through a
ratification ceremony it does not need.

## Reading one

```text
verdict PASS               targetState === observedState, at this SHA, clean tree
verdict FAIL               they differ — read observedState, not the verdict
verdict STALE              the tree was dirty, or the evidence is from another commit
observedState UNWIRED      the code exists and nothing calls it
observedState WIRED_DISABLED  the code is reachable and deliberately off
```

`UNWIRED` is never `OFF`. That distinction is the reason this directory exists.

## The WP01 baseline

`delivery-evidence-e1aceee874a0-sealed.json` is the pre-repair record: three
capabilities observed as wired, one — `GOV_COORD_V2_POST_MERGE_DELIVERY_CLOSURE`
— observed as `UNWIRED`, overall `FAIL`, exit code 1.

That red line is the pilot's success criterion, not a defect in the run. It
records that on `e1aceee8` no public command could carry a `MERGE_READY` entry
to `CLOSED`, and `completeAfterOwnerMerge` had no caller on any executable path.
WP02 changes the observation; nothing in the verifier may be changed to change
it, and `probeDefinitionSha256` is in every record so that claim is checkable
rather than merely stated.
