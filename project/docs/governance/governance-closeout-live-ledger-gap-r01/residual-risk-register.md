# Residual risk register

| ID | Residual | Disposition |
|---|---|---|
| LR-01 | Filesystem atomic rename and exclusive lock are host-local; distributed multi-host closeout is not supported. | Accepted bounded architecture: this runner is single-operator/task-local and creates no standing service. Conflicts fail closed. |
| LR-02 | A merge can succeed while ledger consumption fails because of an OS write error. | Explicit `MERGE_SUCCEEDED_LEDGER_CONSUMPTION_FAILED`; GitHub merge state prevents a second merge call; task is not CLOSED. |
| LR-03 | Required-check names come from branch protection and can change after materialization. | Live runner re-discovers and requires exact set equality; drift rematerializes, never edits the old ledger. |
| LR-04 | Schema-v1 recovery semantics remain for historical tasks. | Isolated compatibility path; the new materializer writes only v2 and this task's dogfood requires v2. |
| LR-05 | Terminal dogfood values cannot be committed into the same exact-head PR. | Task-local non-secret ledger/result persist the terminal record; canonical audit files define the locator and verification contract. |
| LR-06 | Full repository TypeScript baseline remains independently non-clean. | Out of scope under program lock; no new product TypeScript surface is added. |

No production activation, product capability, schema, migration, queue, scheduler or Windows
orphan cleanup is included.
