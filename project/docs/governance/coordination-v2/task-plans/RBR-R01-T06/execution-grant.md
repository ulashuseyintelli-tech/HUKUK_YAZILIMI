# RBR-R01-T06 — pre-activation authority materialization execution grant

<!-- GOV-COORD-AUTHORITY kind=EXECUTION_GRANT recordId=RBR-R01-T06-PREACTIVATION-AUTHORITY-EG01 -->

## Grant identity

```text
Grant ID       : RBR-R01-T06-PREACTIVATION-AUTHORITY-GRANT-R01
Task ID        : RBR-R01-T06
Program        : REPOSITORY-WIDE-CAPABILITY-BINDING-ACTIVATION-AND-OPERABILITY-RECONCILIATION-R01
Profile        : BOUNDED_CODE_TASK
Executor lane  : CODEX_LOCAL
Merge policy   : SQUASH; manual merge required; no auto-merge
Validity       : task-scoped and non-reusable
```

## Authorized work

Only the following work is authorized in this task:

1. Materialize the semantic authority and execution grant records in this
   task-plan directory.
2. Materialize the 33-record backend disposition matrix and the twelve exact
   Playbook hardening acceptance criteria.
3. Run the declared governance/schema/diff checks and complete the normal PR
   closeout when required checks pass.

The allowed path root is exactly:

```text
project/docs/governance/coordination-v2/task-plans/RBR-R01-T06/
```

## Hard prohibitions

```text
AppModule binding or any module import change
endpoint/provider registration
production activation or deployment/config mutation
secret access, display or hashing
schema, migration or live-data mutation
W3 start or production-evidence phase reopening
product/application code changes
new business, legal or security policy
```

`RBR-R01-T07` is a declared successor, not part of this grant. This grant
cannot be reused to implement the Playbook hardening itself.

