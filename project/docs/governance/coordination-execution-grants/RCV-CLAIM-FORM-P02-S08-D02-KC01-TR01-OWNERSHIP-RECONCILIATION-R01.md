# KC01/TR01 Ownership Reconciliation Execution Grant

<!-- GOV-COORD-AUTHORITY kind=EXECUTION_GRANT recordId=RCV-CLAIM-FORM-P02-S08-D02-KC01-TR01-OWNERSHIP-RECONCILIATION-R01-GRANT -->

```text
GRANT ID:
RCV-CLAIM-FORM-P02-S08-D02-KC01-TR01-OWNERSHIP-RECONCILIATION-R01-GRANT

GRANT TYPE:
EXECUTION_GRANT

OWNER:
Ulaş Hüseyin Telli

TASK:
RCV-CLAIM-FORM-P02-S08-D02-KC01-TR01-OWNERSHIP-RECONCILIATION-R01

semanticAuthorityRef.kind     : SEMANTIC_AUTHORITY
semanticAuthorityRef.path     : project/docs/governance/decision-log.md
semanticAuthorityRef.recordId : RCV-CLAIM-FORM-P02-S08-D02-KC01-TR01-OWNERSHIP-RECONCILIATION-R01

EXECUTOR CAPABILITY:
CODEX_LOCAL — BOUNDED PROTECTED-PATH WRITER

ORCHESTRATOR:
CURRENT SESSION

TASK OWNERSHIP TRANSFER:
NONE

WORKSPACE MODULES:
RECEIVABLE + OFFICE + CROSS_MODULE / SHARED_CONTROL_PLANE

ALLOWED OPERATION CLASS:
ONE-TIME APPEND-ONLY KC01/TR01 OWNERSHIP AND NEXT-TASK RECONCILIATION
```

## Exact target allowlist

1. `project/docs/governance/GOVERNANCE-INDEX.md`
2. `project/docs/governance/RCV-PHASE-1-AUTHORIZATION.md`
3. `project/docs/governance/canonicalization-register.md`
4. `project/docs/governance/product-backlog.md`

The reconciliation base must descend from implementation squash
`3472052b2efb08d5e3fbcda7ce0654b012225689`, #1907 squash
`76fb4c3440586453f2380a866aeda58322c778bf`, and the merge that makes this
semantic authority and execution grant canonical.

## Authorized semantic changes

1. Preserve KC01 and TR01 historical task identities, technical evidence and
   cryptographic artefacts as valid and canonical.
2. Amend effective current ownership to KMS/trust-root lifecycle =
   `CROSS_MODULE / SHARED_CONTROL_PLANE`, signer identity/eligibility = `OFFICE`,
   and Legal Basis content/signature policy/formation consequence = `RECEIVABLE`.
3. Record KC01 and TR01 as `CLOSED / CANONICAL / OWNERSHIP AMENDED` without
   deleting or rewriting their historical closure records.
4. Preserve verification as `ACTIVE`, runtime as `DORMANT`, signing as
   `NOT_ACTIVE`, production signature and signed release as `NONE`.
5. Set the sole current next task to
   `RECEIVABLE-LEGAL-BASIS-REGISTRY-CONTENT-RATIFICATION-R01 — OWNER GO REQUIRED / NOT STARTED`.
6. Mark `RCV-CLAIM-FORM-P02-S08-D02-LB01` as not current/not eligible, pending
   content ratification and canonical sequence.
7. Preserve UYAP as consumer-only and
   `BLOCKED_BY_RECEIVABLE_LEGAL_BASIS_AUTHORITY`.
8. Preserve the five-module workspace set; create no sixth legal module.

## Prohibited

- Any fifth target file
- Code, test, workflow, schema or migration change
- Cryptographic artefact, manifest, schema, resolver or AWS evidence mutation
- AWS IAM, KMS, key, alias, tag, policy or CloudTrail mutation
- Production signing, signed Legal Basis release or runtime activation
- Office signer-eligibility implementation or completed-status claim
- Historical deletion or rewrite
- D02-LB01, D02-F01, D02-I01/I02/I03, I04, I05 or UYAP binding authorization
- New workspace module, reusable authority or owner WIP mutation

## Merge authority

```text
EX-ANTE OWNER GO-COMPLETE
```

## Merge conditions

- Exact four-file target allowlist
- Append-only/history-preserving reconciliation
- Required validation and CI PASS
- PR CLEAN / MERGEABLE with expected head unchanged
- No semantic competing writer
- Owner WIP untouched

## Expiry

This grant expires automatically when the single ownership-reconciliation PR is
merged, closed without merge, or its exact task/branch/path binding changes.

```text
REUSABLE AUTHORITY:
NONE
```
