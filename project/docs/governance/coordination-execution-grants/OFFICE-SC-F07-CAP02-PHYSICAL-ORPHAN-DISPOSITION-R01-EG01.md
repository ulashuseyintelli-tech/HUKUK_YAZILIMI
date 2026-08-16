# OFFICE-SC-F07 CAP-02 Physical Orphan Disposition — Execution Grant

<!-- GOV-COORD-AUTHORITY kind=EXECUTION_GRANT recordId=OFFICE-SC-F07-CAP02-PHYSICAL-ORPHAN-DISPOSITION-R01-EG01 -->

```text
recordType : EXECUTION_GRANT
recordId : OFFICE-SC-F07-CAP02-PHYSICAL-ORPHAN-DISPOSITION-R01-EG01
programId : OFFICE-P4-AUTHORIZATION-COMPLETION-R01
taskId : OFFICE-SC-F07-CAP02-PHYSICAL-ORPHAN-DISPOSITION-R01-AUTHORITY-MATERIALIZATION-R01
targetTaskId : OFFICE-SC-F07-CAP02-PHYSICAL-ORPHAN-DISPOSITION-R01
ownerName : Av. Ulaş Hüseyin Telli
ownerRole : Repository Owner / Semantic Authority
executionMode : GO-COMPLETE — F07 EXECUTION/CLOSURE PR ONLY
workspaceModule : OFFICE / SHARED_CONTROL_PLANE
issuedAt : 2026-08-16
status : ACTIVE_AFTER_APPROVED_MERGE_SINGLE_TASK
semanticAuthorityRef.kind : SEMANTIC_AUTHORITY
semanticAuthorityRef.path : project/docs/governance/decision-log.md
semanticAuthorityRef.recordId : OFFICE-SC-F07-CAP02-PHYSICAL-ORPHAN-DISPOSITION-R01-SA01
singleUseConsumption : REQUIRED
branch : codex/office-f07-orphan-disposition-r01
scope.1 : A project/docs/governance/office-p4-authz-r01/f07-cap02-physical-orphan-disposition.md
scope.2 : M project/docs/governance/office-spring-cleaning-reconciliation-r01/successor-execution-order.md
scope.3 : M project/docs/governance/office-spring-cleaning-reconciliation-r01/successor-task-register.json
physicalTargetCount : 2
physicalTarget.p6a : C:\Development\HUKUK_YAZILIMI\HY_office_p6a_runtime_truth
physicalTarget.p3_reportingline : C:\Development\HUKUK_YAZILIMI\HY_office_p3_reportingline
preflightInventory : READ_ONLY / PER_TARGET / REQUIRED
recoverability : FIRST
dirtyUnmergedUnknownContent : PRESERVE
recursivePhysicalDelete : PROHIBITED
reparseTargetTraversal : PROHIBITED
W3F07 : PROHIBITED / UNTOUCHED
otherPhysicalTargets : PROHIBITED
productCode : PROHIBITED
policyChange : PROHIBITED
schemaMigrationDatabase : NONE
runtime : BLOCKED_BY_RUNTIME_MODEL
productionActivation : NONE
transfer : PROHIBITED
expansion : PROHIBITED
staleReuse : PROHIBITED
wrongTaskReuse : PROHIBITED
ciBypass : PROHIBITED
standingAuthority : PROHIBITED
reusableAuthority : PROHIBITED
globalAuthority : PROHIBITED
terminalDisposition : CONSUMED / EXPIRED
```

## Exact authorized execution and closure scope

This grant is limited to the exact three-path repository tuple and the two
absolute physical targets recorded above. The execution must inventory each
target read-only before any disposition and may mutate a target only when all
owner-ratified permanent-cleanup gates pass. The evidence and living successor
records must state the actual outcome; a preserved residual cannot be reported
as cleaned.

## Boundaries and validation

- Dirty, unmerged, active-owner or unknown content is preserved. Unknown
  provenance is fail-closed.
- Recursive physical deletion, broad/wildcard parent cleanup and reparse-target
  traversal are prohibited. Registered worktree cleanup follows the canonical
  worktree cleanup runbook.
- `C:\Development\HY_WT\W3F07`, its owner WIP, every other worktree and the
  canonical repository root remain untouched.
- No product code, policy, schema, migration, database operation, flag, runtime
  or production activation change is authorized.
- Exact-scope validation, SA/EG validation, JSON/register consistency,
  governance self-test, full governance suite, repository validation,
  `git diff --check` and required CI are mandatory.

## Terminal rule

This grant becomes active only after this authority materialization PR is
canonical. It is exact-task, exact-branch, exact-scope and single-use. It becomes
`CONSUMED / EXPIRED` only after the execution/closure PR is squash-merged,
post-merge acceptance and cleanup pass, and the terminal report is issued. It
cannot be transferred, expanded or reused.
