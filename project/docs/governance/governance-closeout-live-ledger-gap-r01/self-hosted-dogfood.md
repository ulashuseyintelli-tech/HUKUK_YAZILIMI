# Self-hosted dogfood

**Pre-PR state:** `PENDING_SELF_HOSTED_DOGFOOD`

The implementation PR must be closed only by the new live runner. After required CI succeeds:

1. Resolve canonical SA01 and EG01 at the exact current base.
2. Materialize a task-local v2 ledger for the PR's current base/head/name-status scope and required checks.
3. Run `--dry-run`; require `DRY_RUN_STRUCTURALLY_ELIGIBLE` and `LIVE_AUTHORITY_READY`.
4. Run live with the same arguments and ledger; require `mergePerformedBy=LIVE_RUNNER`.
5. Require the exact PR to be squash-merged and the ledger to be `CONSUMED` by that merge SHA.
6. Invoke the runner a second time and require consumed-ledger rejection with no merge call.

The live ledger and terminal runner result are written outside the repository in a task-specific,
non-secret directory because committing either after PR creation would change the authorized head
and invalidate the ledger. The canonical JSON in this directory is the machine-readable dogfood
contract/locator; the final response reports the exact safe external paths and hashes.

Manual fallback is prohibited for this task. A runner/materializer failure yields
`DOGFOOD_FAILED`, not `CLOSED`.
