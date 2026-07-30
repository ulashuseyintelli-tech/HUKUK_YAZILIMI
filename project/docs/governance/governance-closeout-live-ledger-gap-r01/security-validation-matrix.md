# Security validation matrix

Primary executable evidence:
`project/scripts/orchestration-v2/closeout/merge-authority-ledger.test.cjs`.

| # | Required negative/positive boundary | Executable coverage |
|---:|---|---|
| 1 | Valid SA01 + EG01 resolves | exact materialization success |
| 2 | Same SA/EG ref | locator collision reject |
| 3 | Missing SA | resolver reject |
| 4 | Missing EG | resolver reject |
| 5 | Wrong task | SA and EG mismatch rejects |
| 6 | Wrong program | program mismatch reject |
| 7 | Wrong owner identity | SA/EG and issuedBy rejects |
| 8 | Wrong execution mode | `GO-COMPLETE` exact check |
| 9 | Missing PR | missing payload reject |
| 10 | Wrong PR | number mismatch reject |
| 11 | Head drift | authorized-head reject |
| 12 | Base drift | PR-base and current-base rejects |
| 13 | Scope drift | exact path/status set reject |
| 14 | Wrong branch | base/head branch rejects |
| 15 | Required check pending | pending reject |
| 16 | Required check failure | failure reject |
| 17 | Checked SHA mismatch | checked-head reject |
| 18 | Missing ledger | fail-closed read |
| 19 | Malformed ledger | JSON/schema reject |
| 20 | Conflicting ledgers | active-candidate conflict reject |
| 21 | Revoked ledger | status reject |
| 22 | Expired ledger | status/time reject |
| 23 | Consumed ledger | status reject |
| 24 | Consumed reuse | second consumption reject |
| 25 | Wrong repository | identity reject |
| 26 | Wrong merge method | non-squash reject |
| 27 | Partial write | temporary file ignored |
| 28 | Digest tamper | entry/ledger digest reject |
| 29 | Manual fallback remains gated | SA exact field check |
| 30 | Cross-task authority reuse | materialize/consume rejects |

Additional executable cases cover unsafe authority paths, invalid SHA shapes, empty scope,
undiscoverable checks, CI/ledger bypass weakening, reusable grant weakening, terminal
`INVALIDATED`, live scope/check/branch/repository mismatch, deterministic serialization and
exclusive existing-ledger conflict.

Local result before publication: `61/61 PASS`, including `57` explicit negative security
tests; representative bare-Git flow is counted separately. CI remains the publication source
of truth.
