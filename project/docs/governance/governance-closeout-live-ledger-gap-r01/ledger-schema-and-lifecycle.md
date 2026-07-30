# Ledger schema and lifecycle

Schema v2 retains top-level `schemaVersion` and `entries`, and adds deterministic entry and
ledger digests. Each entry contains:

```text
programId, taskId
semanticAuthorityRef, executionGrantRef
repository, baseBranch, taskBranch, prNumber
authorizedBaseSha, authorizedHeadSha
allowlist[{status, path, previousPath?}], allowlistDigest
requiredChecks[{name, checkedSha, conclusion}]
mergeMethod
issuedAt, issuedBy, ownerRole
status, lifecycle[], evidenceRefs[]
consumedAt?, consumedByMergeSha?
entryDigest
```

Allowed statuses are closed:

```text
ISSUED → VALIDATED → CONSUMED
          ├────────→ REVOKED
          ├────────→ EXPIRED
          └────────→ INVALIDATED
```

Materialization records `ISSUED` and `VALIDATED` transitions in the immutable lifecycle history.
Only `VALIDATED` authorizes a live merge. Successful merge ancestry verification is followed by
an atomic transition to `CONSUMED` before cleanup. Any second invocation with a consumed v2 entry
is rejected.

Writes use a same-directory temporary file, schema/digest validation and atomic rename while an
exclusive task-ledger lock is held. A partial `.tmp-*` file is never active authority. Conflicting
active entries for the same grant or task/PR fail closed.

Schema v1 remains readable only for unrelated historical recovery. The new materializer never
writes v1, and v1 cannot satisfy this task's v2 dogfood consumption proof.
