# Representative live closeout test

Executable evidence:
`project/scripts/orchestration-v2/closeout/representative-live-closeout.test.cjs`.

The test creates a disposable real bare Git remote, clones a canonical `main`, commits structured
SA/EG records, creates a real task worktree and pushes its branch. It then performs:

```text
canonical authority resolve at base SHA
→ exact ledger materialization
→ dry-run with LIVE_AUTHORITY_READY
→ real git merge --squash + commit + push to disposable main
→ merge ancestry verification
→ atomic ledger consumption
→ real worktree and branch cleanup
→ canonical equality verification
→ second-use rejection
```

Only GitHub PR/check observations are represented by the bounded adapter; repository, commits,
branch refs, name-status diff, squash merge, push, cleanup and consumption are real filesystem/Git
operations. No production repository merge occurs in this test.

Local result before publication: `1/1 PASS`.
