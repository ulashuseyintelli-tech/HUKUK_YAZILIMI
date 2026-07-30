# Task audit decision log

This file is audit evidence only. It is not SA01, EG01 or a merge authority source.

| Date | Decision | Evidence |
|---|---|---|
| 2026-07-30 | Root cause classified `G. MULTIPLE_CAUSES (A+C+D+E+F)`; ledger requirement preserved. | canonical dry/live reproduction and source map |
| 2026-07-30 | Implement schema v2 as a task-local derived ledger; no global standing authority store. | SA01/EG01 exact constraints |
| 2026-07-30 | Bind PR, current base, head, branch, status-qualified scope, required checks and squash method. | materializer and security tests |
| 2026-07-30 | Consume immediately after verified merge ancestry and before cleanup; reject all v2 reuse. | representative bare-Git test |
| 2026-07-30 | Persist live terminal result outside Git because a same-PR post-merge commit would invalidate exact-head binding. | dogfood and post-merge contracts |

Terminal dogfood disposition remains pending until the real implementation PR completes required
CI and is squash-merged by the live runner.
