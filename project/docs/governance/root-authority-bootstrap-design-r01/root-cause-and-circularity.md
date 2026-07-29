# Root Authority Bootstrap R01 — Root Cause and Circularity

```text
Program      : GOVERNANCE-CLOSEOUT-OPERABILITY-REMEDIATION-R01
Design task  : ROOT-AUTHORITY-BOOTSTRAP-DESIGN-R01
Module       : SHARED_CONTROL_PLANE
Status       : DESIGN ONLY / OWNER-RATIFICATION-READY UPON APPROVED MERGE
Audit base   : 6daac3c6e8763f84fe6c21f47b689e0a10918b0d
Authority    : NONE — this document is not an authority registry
```

## Verified root cause

The current Governance Coordination V1 reader requires every normal request to carry two
distinct canonical references:

```text
semanticAuthorityRef
executionGrantRef
```

The references resolve only when an exact, unique marker exists in a canonical Git blob and
the reference's `evidenceSha` is in the evaluated main ancestry. The current request validator
also pins normal requests to the V1 `GOV-COORD-V1-CODEX-LOCAL` execution grant.

The records required by `GOVERNANCE-CLOSEOUT-LIVE-LEDGER-GAP-R01` do not yet exist. Creating
them requires both of these protected mutations:

```text
M project/docs/governance/decision-log.md
A project/docs/governance/coordination-execution-grants/
  GOVERNANCE-CLOSEOUT-LIVE-LEDGER-GAP-R01-EG01.md
```

Normal execution cannot authorize those writes because it requires the same missing authority
pair before validation. Non-bootstrap control-plane changes are rejected. The result is the
confirmed circular dependency:

```text
canonical SA + EG required to authorize protected materialization
                    ↑                         ↓
       protected materialization creates canonical SA + EG
```

## Why existing bootstrap modes cannot be reused

The repository contains task-specific bootstrap bindings for RCV-COL, HCR-08, PB01 and KC01.
Each binding is fixed to its own task, branch, path/status set and predecessor conditions. Their
contract text explicitly denies wildcard, prefix and reusable authority. Reusing one would
violate its exact classifier and its ratified semantic boundary.

The original `BOOTSTRAP` mode is also unavailable: it is fixed to the historical V1 bootstrap
base and branch. It is not a root producer for future tasks.

Therefore the safe solution is not to relax normal validation or reinterpret an old record. It
is a new, exact, single-use two-stage binding whose implementation requires a separate owner
grant.

## Base-model evaluation

| Model | Assessment | Disposition |
|---|---|---|
| A — owner-ratified exact Stage 1 base | Strongest Stage 1 protection; binds the reviewed contract and writer version | SELECTED for Stage 1 |
| B — freshness-controlled capture after owner decision | Useful operational preflight but insufficient unless the captured SHA is part of the grant | SUPPORTING CONTROL ONLY |
| C — ancestry-constrained binding | Appropriate for discovering the unknown Stage 1 squash SHA and requiring Stage 2 ancestry | SELECTED for Stage 2 predecessor |
| D — moving-main tolerant exact merge-base | Allows unrelated drift and increases review ambiguity | REJECTED as the primary model |

Selected model:

```text
Stage 1:
  Grant 1 pins one exact origin/main SHA.
  Validator requires exact equality, exact branch and exact M/M/M scope.

Stage 2:
  Validator discovers the unique canonical Stage 1 squash commit.
  Grant 2 pins that commit and one fresh exact Stage 2 base SHA.
  The Stage 2 base must equal the Grant 2 value and descend from Stage 1.
  The three Stage 1 binding blobs must be unchanged from the discovered Stage 1 commit.
```

This hybrid prevents stale-base reuse, unrelated contract drift, silent scope expansion and
execution against a different writer version.

## Canonical constraints consumed

- [AGENTS.md](../../../../AGENTS.md) supplies execution, isolation, merge and cleanup rules.
- [Governance Writer Coordination Contract V1](../governance-writer-coordination-contract.md)
  supplies distinct-reference and exact-marker rules.
- [System Constitution](../SYSTEM-CONSTITUTION.md) keeps ratification, implementation, merge and
  closure as separate states.
- [Two-stage design](./two-stage-bootstrap-design.md) defines the proposed bounded protocol.

## Scope conclusion

The design task changes only this design directory. It does not implement the bootstrap,
materialize authority, change closeout behavior or authorize the target task.
