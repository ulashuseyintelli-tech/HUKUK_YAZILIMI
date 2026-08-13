# OFFICE CAP-09A Consumer — Execution Grant

<!-- GOV-COORD-AUTHORITY kind=EXECUTION_GRANT recordId=OFFICE-CAP-09A-CONSUMER-01-R01-EG01 -->

```text
recordType : EXECUTION_GRANT
recordId : OFFICE-CAP-09A-CONSUMER-01-R01-EG01
programId : OFFICE-P4-AUTHORIZATION-COMPLETION-R01
taskId : OFFICE-CAP-09A-CONSUMER-01-R01-GOVERNANCE-MATERIALIZATION-R01
targetTaskId : OFFICE-CAP-09A-CONSUMER-01-R01
ownerName : Av. Ulaş Hüseyin Telli
ownerRole : Repository Owner / Semantic Authority
executionMode : GO-COMPLETE — IMPLEMENTATION PR ONLY
workspaceModule : OFFICE
issuedAt : 2026-08-13
status : ACTIVE_AFTER_APPROVED_MERGE_SINGLE_TASK
semanticAuthorityRef.kind : SEMANTIC_AUTHORITY
semanticAuthorityRef.path : project/docs/governance/decision-log.md
semanticAuthorityRef.recordId : OFFICE-CAP-09A-CONSUMER-01-R01-SA01
singleUseConsumption : REQUIRED
terminalExpiry : AUTOMATIC_WITH_TERMINAL_REPORT
transfer : PROHIBITED
expansion : PROHIBITED
staleReuse : PROHIBITED
wrongTaskReuse : PROHIBITED
productionActivation : NOT_AUTHORIZED
ciBypass : PROHIBITED
ledgerBypass : PROHIBITED
standingAuthority : PROHIBITED
reusableAuthority : PROHIBITED
globalAuthority : PROHIBITED
```

## Exact authorized implementation scope

The executor may materialize and validate only this exact four-path tuple in a
separate implementation PR created after this grant is present on canonical
`main`:

1. `M project/apps/api/src/modules/staff/staff.controller.ts`
2. `M project/apps/api/src/modules/staff/staff.service.ts`
3. `A project/apps/api/src/modules/staff/__tests__/staff-cap09a-consumer.spec.ts`
4. `M project/apps/api/ci-manifests/pure/office-auth-user.txt`

Within that tuple the only authorized behavior is to call the existing
`AuditService` API transactionally from `StaffService` lifecycle mutation paths,
consume the CAP-09A attribution fields under `OFF-INV-08`, preserve tenant scope,
and add focused positive, negative and read-back coverage plus CI-manifest
wiring. The implementation PR has task-bound `GO-COMPLETE` authority after all
local and required CI gates pass.

## Producer and execution boundaries

- `OFFICE-CAP-09A-CONSUMER-01-R01-SA01` is the sole semantic authority for this
  grant. This grant cannot activate before the governance PR that materializes
  both records is merged to canonical `main`.
- CAP-09A producer work remains `DORMANT_CANONICAL / NOT AUTHORIZED / DO NOT
  OPEN`. `AuditLog` schema, `AuditService` body, `audit-metadata-builder`, columns,
  indexes, migrations, DB, flags, runtime and production are prohibited.
- Hard delete is prohibited. Audit records remain append-only. Tenant-scope and
  transactional atomicity are mandatory; an audit write failure must roll back
  the corresponding Staff mutation.
- CLF-O0-01, W3F07 files, `office-approval-executor-cron.service.ts`, F03/F04,
  PermissionGrant writer/admin work and OFFICE-WR01 are outside this grant.
- Focused positive, negative and read-back tests, differential typecheck, the
  OFFICE CI manifest, required CI, exact-scope and clean/mergeable gates are
  mandatory. Bypass is prohibited.

## Terminal rule

The grant is single-use and task-bound. After the implementation PR is
squash-merged, canonical main and post-merge acceptance are verified, cleanup is
completed and the terminal report is issued, the grant expires automatically.
It cannot be transferred, expanded or reused. F03 does not start automatically;
the executor returns to PAGE-O0 for the next owner gate.
