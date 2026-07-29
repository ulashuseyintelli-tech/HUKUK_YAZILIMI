# TR01 Production Public-Key Trust-Root Formal Governance Closure Execution Grant

<!-- GOV-COORD-AUTHORITY kind=EXECUTION_GRANT recordId=RCV-CLAIM-FORM-P02-S08-D02-TR01-CLOSURE-R01-GRANT -->

```text
GRANT ID:
RCV-CLAIM-FORM-P02-S08-D02-TR01-CLOSURE-R01-GRANT

GRANT TYPE:
EXECUTION_GRANT

OWNER:
Ulaş Hüseyin Telli

TASK:
RCV-CLAIM-FORM-P02-S08-D02-TR01

semanticAuthorityRef.kind     : SEMANTIC_AUTHORITY
semanticAuthorityRef.path     : project/docs/governance/decision-log.md
semanticAuthorityRef.recordId : RCV-CLAIM-FORM-P02-S08-D02-TR01-CLOSURE-R01

EXECUTOR CAPABILITY:
CODEX_LOCAL — BOUNDED PROTECTED-PATH WRITER

ORCHESTRATOR:
CURRENT SESSION

TASK OWNERSHIP TRANSFER:
NONE

BASE IMPLEMENTATION SHA:
3472052b2efb08d5e3fbcda7ce0654b012225689

ALLOWED OPERATION CLASS:
ONE-TIME TR01 PRODUCTION PUBLIC-KEY TRUST-ROOT FORMAL GOVERNANCE RECONCILIATION
```

## Exact target allowlist

1. `project/docs/governance/RCV-PHASE-1-AUTHORIZATION.md`
2. `project/docs/governance/canonicalization-register.md`
3. `project/docs/governance/product-backlog.md`
4. `project/docs/governance/GOVERNANCE-INDEX.md`

The closure base must descend from both implementation squash
`3472052b2efb08d5e3fbcda7ce0654b012225689` and the merge that makes this semantic
authority and execution grant canonical.

## Authorized semantic changes

1. Record `RCV-CLAIM-FORM-P02-S08-D02-TR01` as `CLOSED / CANONICAL / PASS` with
   implementation PR #1901 and the exact squash evidence above.
2. Register `RCV-CLAIM-LEGAL-PUBLIC-KEY-TRUST-ROOT@1` as the immutable,
   repository-backed production verification trust root with exactly three
   role-separated Ed25519 signer entries and checksum
   `062056266b90107780f2f749eba3b55a994738503f354c273ac83e25fdddd247`.
3. Preserve verification authority as `ACTIVE`, runtime as `DORMANT`, signing
   authority as `NOT_ACTIVE`, production signature as `NONE`, database as
   `UNCHANGED`, and schema/migration as `NONE`.
4. Record AWS KMS parity as verified only through redacted public evidence and
   preserve the restored no-`kms:Sign` key-policy boundary.
5. Set the next eligible task only to
   `RCV-CLAIM-FORM-P02-S08-D02-LB01 — OWNER GO REQUIRED / NOT STARTED`.
6. Keep D02-F01, D02-I01/I02/I03, I04, I05, production signing, signed release
   and runtime activation ineligible and unauthorized.
7. Preserve all historical SR01, PB01, KC01 and Claim Formation records.

## Prohibited

- Any fifth target file
- Code, test, workflow, schema, or migration change
- AWS account ID, key ARN, IAM principal ARN, credential, token, private material,
  or unredacted CloudTrail event
- KMS key, alias, tag, policy or signer-principal mutation
- `kms:Sign`, production signing or signed Legal Basis release
- Runtime activation, live database apply, historical backfill or data mutation
- D02-F01, D02-I01/I02/I03, I04 or I05 authorization
- Reusable authority
- Owner WIP mutation

## Merge authority

```text
EX-ANTE OWNER GO-COMPLETE
```

## Merge conditions

- Exact four-file allowlist
- Required validation and CI PASS
- PR CLEAN / MERGEABLE
- Expected head unchanged
- No semantic competing writer
- Owner WIP untouched

## Expiry

This grant expires automatically when the single TR01 formal-closure PR is merged,
closed without merge, or its exact task/branch/path binding changes.

```text
REUSABLE AUTHORITY:
NONE
```
