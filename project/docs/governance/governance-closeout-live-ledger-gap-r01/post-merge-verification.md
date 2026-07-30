# Post-merge verification

**Pre-merge state:** `PENDING`

The live runner performs and reports these checks after GitHub confirms the squash merge:

```text
fetch origin
→ canonical main fast-forward
→ merge SHA ancestor of origin/main
→ atomic ledger VALIDATED → CONSUMED
→ isolated worktree cleanup
→ local and remote task-branch cleanup
→ tracked canonical tree clean
→ main == origin/main
```

Independent terminal verification must then confirm:

- PR state `MERGED` and merge commit equals runner output;
- task-local ledger parses, both digests pass and final status is `CONSUMED`;
- `consumedByMergeSha` equals the PR merge commit;
- second runner invocation is rejected before mutation;
- SA01/EG01 canonical blobs equal the audit-base blobs;
- owner WIP snapshot and the CCB orphan directory remain unchanged;
- no manual fallback was used.

Terminal values cannot be committed into the PR that they describe without changing its head.
They are persisted by `--result-file` beside the task-local ledger and summarized in final closeout.
