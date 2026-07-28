# RCV-COL Full Remediation — Program-Scoped Execution Grant

<!-- GOV-COORD-AUTHORITY kind=EXECUTION_GRANT recordId=RCV-COL-FULL-REMEDIATION-EXECUTION-GRANT-R01 -->

```text
Program               : RCV-COL FULL REMEDIATION
Grant status          : ACTIVE AFTER MERGE TO CANONICAL MAIN
Primary executor      : CODEX_LOCAL
Secondary executor    : DISABLED
Failover              : OWNER-ACTIVATED ONLY
Trigger               : MANUAL_QUEUE_RUN
Execution             : DETERMINISTIC SCRIPT + EXPLICIT MERGE ACTION
Auto-merge feature    : OFF
```

## Semantic authority binding

```text
semanticAuthorityRef.kind     : SEMANTIC_AUTHORITY
semanticAuthorityRef.path     : project/docs/governance/decision-log.md
semanticAuthorityRef.recordId : RCV-COL-FULL-REMEDIATION-RATIFICATION-R01
```

## Program-specific allowed capabilities

```text
CREATE_REQUEST_ONLY_PR
VALIDATE_REQUEST
CREATE_EXECUTION_PR
RUN_VALIDATION
CREATE_RESULT_ONLY_PR
EXPLICIT_SQUASH_MERGE_AFTER_CI
RECONCILIATION
PROGRAM_SEQUENCE_CHANGE
PROTECTED_GOVERNANCE_WRITE
CODE_IMPLEMENTATION
SCHEMA_CHANGE
MIGRATION
RUNTIME_CONFIGURATION
CONSUMER_CUTOVER
LEGACY_WRITER_FREEZE
PRODUCTION_ACTIVATION
PROGRAM_CLOSURE
```

Bu yetkiler yalnız `RCV-COL FULL REMEDIATION` programına ve semantic authority
kaydında sıralanan Task 01–20'ye uygulanabilir. Her task kendi task ID'sini,
exact target allowlist'ini, base SHA'sını, test ve acceptance şartlarını,
migration/runtime etkisini ve rollback şartlarını taşır.

## Denied capabilities

```text
OWNER_WIP_MUTATION
UNRELATED_PROGRAM_MUTATION
CONSTITUTION_CHANGE
DOMAIN_LAW_CHANGE
GOVERNANCE_COORDINATION_CONTROL_PLANE_CHANGE
FORCE_PUSH
HISTORY_REWRITE
UNDECLARED_PATH_MUTATION
UNREVIEWED_CREDENTIAL_ACCESS
UNSCOPED_PRODUCTION_DATA_MUTATION
```

## Safety rules

- Canonical root içinde implementasyon yapılmaz; fresh isolated worktree zorunludur.
- Owner WIP korunur ve her task öncesi competing-writer taraması yapılır.
- Database migration önce disposable/test DB'de doğrulanır.
- Para hesapları integer minor-unit kullanır.
- Currency mismatch fail-closed olur.
- Idempotency ve concurrency kanıtı olmadan financial write merge edilmez.
- Bu grant başka programa, Constitution/Domain Law değişikliğine veya governance
  coordination control-plane değişikliğine yetki vermez.
