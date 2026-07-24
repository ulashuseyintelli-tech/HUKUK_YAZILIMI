# GOV-COORD-V1-CODEX-LOCAL — Standing Execution Grant

```text
Grant ID              : GOV-COORD-V1-CODEX-LOCAL
Executor              : CODEX_LOCAL
Owner-ratified        : 2026-07-24
Effective-from main   : c046819b968d16f20cf2834ba805beb22e4aa488
Activation            : APPROVED BOOTSTRAP MERGE + MANUAL_QUEUE_RUN
Secondary executor    : DISABLED
Failover              : SEPARATE OWNER ACTIVATION REQUIRED
Lease                 : NONE
Auto-merge            : OFF
```

## Granted capabilities

| Capability | Granted |
|---|---|
| `CREATE_REQUEST_ONLY_PR` | YES |
| `VALIDATE_REQUEST` | YES |
| `CREATE_EXECUTION_PR` | YES |
| `RUN_VALIDATION` | YES |
| `CREATE_RESULT_ONLY_PR` | YES |

Grant yalnız `governance-writer-coordination-contract.md` içindeki exact
precondition ve PR-mode sınırlarıyla kullanılabilir.

## Explicit denials

```text
AUTO_MERGE
RECONCILIATION
POLICY_CHANGE
PROGRAM_SEQUENCE_CHANGE
PRODUCTION_SCHEMA_MIGRATION_RUNTIME
OWNER_WIP_MUTATION
FAILOVER_WITHOUT_OWNER_ACTIVATION
FREE_FORM_GOVERNANCE_EDIT
```

## Level 2 operation allowlist

```text
EXACT_APPEND_AT_DECLARED_ANCHOR
EXACT_LITERAL_REPLACEMENT
EXACT_REFERENCE_REWRITE
DETERMINISTIC_REGISTER_REGENERATION
```

## Non-delegation

- Bu grant Claude veya başka bir executor'a devredilemez.
- Request creator olmak executor olmak anlamına gelmez.
- Analysis/review ownership execution authority üretmez.
- `semanticAuthorityRef` olmadan bu grant tek başına governance değişikliği
  yetkisi üretmez.
- Aynı record hem semantic authority hem execution grant olarak kullanılamaz.

## Merge ve activation

Bu grant:

- Bootstrap approved merge olmadan active değildir.
- PR merge yetkisi vermez.
- Manual merger authority'yi owner'dan almaz.
- Scheduler, lease, auto-merge veya queue polling yetkisi vermez.
- Pilot seçmez ve gerçek request oluşturmaz.
