# OFFICE-SC-F03 Dedicated OFFICE E2E — Execution Grant

<!-- GOV-COORD-AUTHORITY kind=EXECUTION_GRANT recordId=OFFICE-SC-F03-DEDICATED-OFFICE-E2E-R01-EG01 -->

```text
recordType : EXECUTION_GRANT
recordId : OFFICE-SC-F03-DEDICATED-OFFICE-E2E-R01-EG01
programId : OFFICE-P4-AUTHORIZATION-COMPLETION-R01
taskId : OFFICE-SC-F03-DEDICATED-OFFICE-E2E-R01-AUTHORITY-MATERIALIZATION-R01
targetTaskId : OFFICE-SC-F03-DEDICATED-OFFICE-E2E-R01
ownerName : Av. Ulaş Hüseyin Telli
ownerRole : Repository Owner / Semantic Authority
executionMode : GO-COMPLETE — F03 IMPLEMENTATION PR ONLY
workspaceModule : OFFICE
issuedAt : 2026-08-15
status : ACTIVE_AFTER_APPROVED_MERGE_SINGLE_TASK
semanticAuthorityRef.kind : SEMANTIC_AUTHORITY
semanticAuthorityRef.path : project/docs/governance/decision-log.md
semanticAuthorityRef.recordId : OFFICE-SC-F03-DEDICATED-OFFICE-E2E-R01-SA01
singleUseConsumption : REQUIRED
branch : codex/office-f03-dedicated-e2e-r01
scope : M project/apps/api/src/modules/office/__tests__/office-e2e.db-gated.integration.spec.ts
database : DISPOSABLE POSTGRESQL ONLY
authoritativeDatabase : PROHIBITED
productBehavior : UNCHANGED
approvalPolicy : UNCHANGED
cap09aProducer : DORMANT_CANONICAL / NOT_AUTHORIZED / DO_NOT_OPEN
runtime : BLOCKED_BY_RUNTIME_MODEL
productionActivation : NOT_AUTHORIZED
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

## Exact authorized implementation scope

The implementation PR is limited to this exact tuple:

`M project/apps/api/src/modules/office/__tests__/office-e2e.db-gated.integration.spec.ts`

The file may add only the canonical F03 dedicated, manifest-bound OFFICE E2E
matrix: authorized same-tenant success, unauthorized `403`, cross-tenant
invisibility, generic `CHANGE_STATUS` self-approval denial, CAP-09A Staff
deactivation AuditLog read-back, Staff and linked User rollback on audit failure,
and Office Approval differential regression proof.

## Boundaries and validation

- The suite uses only disposable PostgreSQL. Authoritative/local operational
  databases and real tenant data are prohibited.
- ReportingLine may be used only as organizational evidence and cannot become
  policy authority.
- No product service, schema, migration, DB operation, flag, runtime or
  production activation change is authorized.
- CAP-09A producer remains `DORMANT_CANONICAL / NOT_AUTHORIZED / DO NOT OPEN`.
- Focused, negative, DB read-back, transactional rollback, Office Approval
  differential, manifest-bound regression, changed-file lint, differential
  typecheck, exact-scope and required CI gates are mandatory.

## Terminal rule

This grant is single-use and bound to the exact task, branch and one-file scope.
It becomes active only after this authority materialization is canonical. It is
`CONSUMED / EXPIRED` after the implementation PR is squash-merged, post-merge
acceptance and cleanup pass, and the terminal report is issued. It cannot be
transferred, expanded or reused.
