# Authority-to-ledger flow

```text
SA01 marker + structured record at authorized base
+ EG01 marker + structured record at authorized base
+ distinct kind/path/recordId
+ exact program/task/owner/mode/security fields

→ repository identity
→ open PR number
→ current base branch and base SHA
→ task branch and head SHA
→ git diff --name-status <base>...<head>
→ branch-protection required checks on the same head
→ competing-writer scan over scope + SA/EG paths

→ schema-v2 task-local ledger
→ temp write + full digest validation + atomic rename
→ VALIDATED
```

The materializer reuses `governance-coordination.cjs:validateAuthorityRecordAtRef()`; it does
not infer authority from chat, PR prose or audit files. The live runner resolves both records
again at `authorizedBaseSha` before evaluating the PR.

Materialization is an explicit operation and occurs only after the PR exists:

```text
pnpm orch:closeout --materialize-ledger --ledger <task-local-ledger.json> ...
```

The ledger is derived evidence for one merge candidate. It is not a semantic authority record,
execution grant, standing store or reusable grant.
