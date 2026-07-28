# RCV-CLAIM-FORM-HCR-08 Final Closure Execution Grant

<!-- GOV-COORD-AUTHORITY kind=EXECUTION_GRANT recordId=RCV-CLAIM-FORM-HCR-08-FINAL-CLOSURE-AUDIT-R01-GRANT -->

```text
GRANT ID:
RCV-CLAIM-FORM-HCR-08-FINAL-CLOSURE-AUDIT-R01-GRANT

GRANT TYPE:
EXECUTION_GRANT

OWNER:
Ulaş Hüseyin Telli

TASK:
RCV-CLAIM-FORM-HCR-08-FINAL-CLOSURE-AUDIT-R01

EXECUTOR CAPABILITY:
CODEX_LOCAL — BOUNDED PROTECTED-PATH WRITER

ORCHESTRATOR:
CURRENT SESSION

TASK OWNERSHIP TRANSFER:
NONE

BASE SHA:
14d0f2931ac464321278e05f81ffc5053a8a7719

ALLOWED OPERATION CLASS:
ONE-TIME PROTECTED GOVERNANCE RECONCILIATION
```

## Exact target allowlist

1. `project/docs/governance/RCV-PHASE-1-AUTHORIZATION.md`
2. `project/docs/governance/canonicalization-register.md`
3. `project/docs/governance/decision-log.md`

Phase B base'i yukarıdaki exact base SHA'nın ve bu grant'i canonical yapan Phase A
squash merge commit'inin descendant'ı olmak zorundadır.

## Authorized semantic changes

1. Stale living `Current workstream: WS04` pointer'ını historical, superseded ve
   non-authoritative olarak yeniden sınıflandırmak.
2. D02 / PB01'i canonical current Claim Formation pointer'ı olarak kaydetmek.
3. S05 `CLEANUP PENDING` current state'ini Git-cleaned / completed ve fiziksel
   orphan'ı non-blocking olarak supersede etmek.
4. HCR-08 final closure kaydını append etmek.
5. Bütün historical kayıtları ve provenance'ı korumak.

## Prohibited

- Any fourth file
- Code change
- Test implementation change
- Workflow change
- Schema change
- Migration change
- Runtime activation
- Production mutation
- Historical record deletion
- Reusable grant creation
- Program sequence beyond the exact PB01 next pointer
- Owner WIP mutation

## Merge authority

```text
EX-ANTE OWNER GO-COMPLETE
```

## Merge conditions

- Exact three-file diff
- Required validation PASS
- Required CI PASS
- PR CLEAN / MERGEABLE
- Expected head unchanged
- No semantic competing writer
- Owner WIP untouched

## Expiry

This grant expires automatically when the single HCR-08 execution PR is merged,
closed without merge, or its exact base/branch/path binding changes.

```text
REUSABLE AUTHORITY:
NONE
```
