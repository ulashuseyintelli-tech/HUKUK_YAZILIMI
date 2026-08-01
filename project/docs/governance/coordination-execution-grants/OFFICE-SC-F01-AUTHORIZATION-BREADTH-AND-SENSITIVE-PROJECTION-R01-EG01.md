# OFFICE-SC-F01 — Execution Grant

<!-- GOV-COORD-AUTHORITY kind=EXECUTION_GRANT recordId=OFFICE-SC-F01-AUTHORIZATION-BREADTH-AND-SENSITIVE-PROJECTION-R01-EG01 -->

```text
recordType : EXECUTION_GRANT
recordId : OFFICE-SC-F01-AUTHORIZATION-BREADTH-AND-SENSITIVE-PROJECTION-R01-EG01
programId : REPOSITORY-WIDE-CAPABILITY-BINDING-ACTIVATION-AND-OPERABILITY-RECONCILIATION-R01
wave : WAVE 1 — CRITICAL PATH
taskId : OFFICE-SC-F01-AUTHORIZATION-AND-SENSITIVE-PROJECTION-AUTHORITY-MATERIALIZATION-R01
targetTaskId : OFFICE-SC-F01-AUTHORIZATION-BREADTH-AND-SENSITIVE-PROJECTION-R01
ownerName : Av. Ulaş Hüseyin Telli
ownerRole : Repository Owner / Semantic Authority
executionMode : GO-COMPLETE — STAGE 2 ONLY
workspaceModule : OFFICE / SHARED_CONTROL_PLANE
issuedAt : 2026-08-01
status : ACTIVE_AFTER_APPROVED_MERGE_SINGLE_TASK
stage1PredecessorSha : de310fb16aa9681c15770e74e681ed24e64e553e
stage2BaseSha : 9e55f0bf2b65fa3914087e6f5f21ad2c72eedd3e
freshDerivedFieldCount : 109
freshDerivedFieldCountSemantics : UNIQUE_CANONICAL_FIELDS; L1/OL LAWYER SURFACE REUSE NOT DOUBLE-COUNTED
productionActivation : NOT_AUTHORIZED
ciBypass : PROHIBITED
ledgerBypass : PROHIBITED
standingAuthority : PROHIBITED
reusableAuthority : PROHIBITED
globalAuthority : PROHIBITED
semanticAuthorityRef.kind : SEMANTIC_AUTHORITY
semanticAuthorityRef.path : project/docs/governance/decision-log.md
semanticAuthorityRef.recordId : OFFICE-SC-F01-AUTHORIZATION-BREADTH-AND-SENSITIVE-PROJECTION-R01-SA01
singleUseConsumption : REQUIRED
staleReuse : PROHIBITED
wrongTaskReuse : PROHIBITED
```

## Exact authorized Stage 2 scope

The executor may materialize and validate only this exact four-path tuple:

1. `M project/docs/governance/decision-log.md`
2. `A project/docs/governance/office-sc-f01-authorization/office-authorization-decision-matrix.md`
3. `A project/docs/governance/office-sc-f01-authorization/office-sensitive-field-classification-matrix.md`
4. `A project/docs/governance/coordination-execution-grants/OFFICE-SC-F01-AUTHORIZATION-BREADTH-AND-SENSITIVE-PROJECTION-R01-EG01.md`

The field matrix must be derived from the fresh Office, OfficeBankAccount and
Lawyer production schema plus the two exact read entrypoints. The derived count
is canonical for this task; the historical `75` number is neither a target nor
a prerequisite. No field may be invented, removed or copied merely to reach
that historical number. A path with no production surface, including
`leave`/`terminationReason`, is not added.

## Stage and authority boundaries

- This grant is the Stage 2 authority-materialization grant only. The Stage 1
  control-plane binding remains a consumed predecessor and is not reused.
- The grant does not authorize Office implementation, JWT/projection
  remediation, schema, migration, backfill, production activation, dormant
  endpoint activation, cross-tenant enablement, or a new legal or
  authorization policy.
- No `SUPER_ADMIN` enum/role may be created. The canonical approver mapping is
  recorded in the decision matrix and remains subject to action-specific
  narrower policy, self-approval denial and tenant/Office boundaries.
- CI, exact-base, exact-scope, same-file writer and merge-authority gates are
  mandatory. A competing writer or semantic drift makes the tuple
  `BLOCKED_EXACT`; mutation then stops.
- The grant is single-use and task-bound. It cannot be transferred to a
  successor task or used to enter Office implementation.

## Terminal rule

After the Stage 2 governance PR is merged, the final SHA and ancestry are
verified, the exact tuple is revalidated and the grant is consumed once, this
task stops. `OFFICE-SC-F01-AUTHORIZATION-BREADTH-AND-SENSITIVE-PROJECTION-R01`
remains a separate, future implementation task and requires its own explicit
execution authority. The program lock remains active.
