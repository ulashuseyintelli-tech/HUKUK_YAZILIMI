# Root Authority Bootstrap R01 — State Machine

The state machine is task-specific and single-use. It is not a standing registry and this design
document is not runtime state.

## States

| State | Evidence | Allowed next state |
|---|---|---|
| `DESIGN_DEFINED` | This design is canonical on main | `ISSUED` after separate Grant 1 |
| `ISSUED` | Grant 1 contains exact Stage 1 base/task/branch/M-M-M scope and expiry | `STAGE1_MERGED`, `REVOKED`, `EXPIRED`, `INVALIDATED` |
| `STAGE1_MERGED` | Stage 1 PR merged; unique binding commit and exact blobs resolve on main | `STAGE2_ELIGIBLE`, `REVOKED`, `EXPIRED`, `INVALIDATED` |
| `STAGE2_ELIGIBLE` | Grant 2 pins Stage 1 merge plus exact fresh Stage 2 base/task/branch/M-A scope | `CONSUMED`, `REVOKED`, `EXPIRED`, `INVALIDATED` |
| `CONSUMED` | Stage 2 merged; both refs resolve on fresh main and target binding is exact | terminal |
| `REVOKED` | Owner explicitly revokes the active stage before merge; associated PR is not merged | terminal |
| `EXPIRED` | Grant deadline passes before the authorized stage merge | terminal |
| `INVALIDATED` | Exact base, branch, paths, predecessor, content or competing-writer invariant fails | terminal for that grant; new grant required |

`STAGE1_MERGED` does not itself authorize Stage 2. `STAGE2_ELIGIBLE` requires a separate owner
message using the Stage 2 template.

## Transition rules

```text
DESIGN_DEFINED --Grant 1--> ISSUED
ISSUED --Stage 1 canonical merge + verify--> STAGE1_MERGED
STAGE1_MERGED --Grant 2--> STAGE2_ELIGIBLE
STAGE2_ELIGIBLE --atomic Stage 2 canonical merge + round-trip--> CONSUMED
```

Any ambiguity, mismatch or missing evidence moves the active attempt to `INVALIDATED`; it does
not choose the nearest branch, merge base, marker or record.

## Source of state

State is derived from immutable evidence rather than maintained in a mutable global mode file:

| State fact | Source |
|---|---|
| Design identity | canonical design commit |
| Stage 1 issue/base/expiry | task-specific Owner Grant 1 |
| Stage 1 completion | GitHub merged PR plus canonical Git commit and exact blob verification |
| Stage 2 issue/base/expiry | task-specific Owner Grant 2 |
| Stage 2 completion | GitHub merged PR plus canonical Git commit |
| Consumption | first canonical commit in which both exact authority records resolve |
| Revocation | explicit owner revocation and non-merged PR disposition |

This avoids a separate “write consumption after merge” failure window. Git stores the Stage 2
tree atomically; either both record changes are in the merge or neither is.

## Single-use proof

After `CONSUMED`:

1. The EG path already exists, so an `A` status cannot be reproduced against current main.
2. The SA marker and record already exist, so the absent-record precondition fails.
3. Repeating either marker creates a duplicate and fails closed.
4. Reusing the branch does not change the exact current-main diff requirements.
5. Reusing the protocol for another task fails the exact task/program/record bindings.

Recovery may re-run read-only post-merge resolution for the same merge SHA. Recovery cannot
create another authority pair or another merge.

## Grant lifecycle

Each grant must have one absolute UTC expiry and one exact task/stage. Branch rename, base drift,
allowlist change, owner identity change, target-task change or Stage 1 binding-blob drift
invalidates the grant. Re-issuance requires a new explicit owner message; it is not a task
revision inferred by the executor.

## Target transition

```text
GOVERNANCE-CLOSEOUT-LIVE-LEDGER-GAP-R01

BLOCKED_CANONICAL_AUTHORITY_REFERENCE_MISSING
  → READY FOR EXECUTION
```

The transition occurs only after `CONSUMED` and post-merge round-trip PASS. It does not state that
the live-ledger implementation, dogfood merge or program closure has occurred.
