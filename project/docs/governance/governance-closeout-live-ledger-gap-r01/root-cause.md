# Live-ledger gap root cause

**Task:** `GOVERNANCE-CLOSEOUT-LIVE-LEDGER-GAP-R01`

**Audit base:** `d5c2f04200f3e99517d73105749dd7776efac555`

**Classification:** `G. MULTIPLE_CAUSES` (`A + C + D + E + F`)

## Reproduction

The canonical core was invoked with identical structurally valid PR, head, scope and CI
observations. Without a ledger, the two modes returned:

```text
dry-run : DRY_RUN_ELIGIBLE / MERGE_GATE_VALIDATED
live    : BLOCKED / PREFLIGHT / MERGE_AUTHORITY_LEDGER_REQUIRED
```

This reproduces the owner-ratified W0/W1/W2 failure shape without mutating GitHub.

## Exact breakpoint

`closeout/cli.cjs` previously only forwarded an operator-supplied `--ledger` path.
`gh-adapter.cjs:authorityLedgerEntry()` returned `null` when that file did not exist.
`closeout.cjs:checkAuthorityBinding()` then stopped a live run before PR discovery with
`MERGE_AUTHORITY_LEDGER_REQUIRED`.

The canonical `validateAuthorityRecordAtRef()` resolver existed and independently resolved
SA01 and EG01 at the audit base, but no call path connected it to closeout materialization.
No component produced a ledger; operators had to hand-author JSON.

## Causes

| Class | Verified cause |
|---|---|
| A | No merge-authority materializer existed. |
| C | The canonical authority resolver was not wired into closeout. |
| D | Schema v1 lacked the distinct SA/EG refs, program, base, status-qualified scope, scope digest, required-check SHA binding and merge method. |
| E | Consumption used non-atomic `writeFileSync`; schema v1 allowed same-task/same-PR consumed recovery rather than strict v2 reuse rejection. |
| F | Dry-run emitted structural eligibility without a machine-readable live-authority readiness axis. |

`B. MATERIALIZER_NOT_WIRED` is not separately selected because there was no materializer to
wire. The ledger requirement itself was correct and remains mandatory.
