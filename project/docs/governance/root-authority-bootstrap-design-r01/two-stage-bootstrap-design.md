# Root Authority Bootstrap R01 — Two-Stage Design

```text
Protocol mode ID:
GOVERNANCE_CLOSEOUT_LIVE_LEDGER_GAP_R01_ROOT_AUTHORITY_BOOTSTRAP_R01

Design status:
OWNER-RATIFICATION-READY UPON APPROVED MERGE

Implementation authority:
NONE
```

## Mandatory sequence

```text
OWNER GRANT 1
→ STAGE 1 CONTROL-PLANE BINDING PR
→ STAGE 1 CI / SQUASH MERGE / POST-MERGE VERIFY
→ OWNER GRANT 2
→ STAGE 2 AUTHORITY MATERIALIZATION PR
→ STAGE 2 CI / SQUASH MERGE / POST-MERGE RESOLUTION
→ BOOTSTRAP MODE CONSUMED
→ TARGET TASK READY
```

Stage 1 and Stage 2 never share a PR, branch, task identity or grant. Stage 1 cannot write the
authority records. Stage 2 cannot change the coordination script, tests or contract.

## Stage 1 — control-plane binding

```text
Task ID:
GOVERNANCE-CLOSEOUT-LIVE-LEDGER-GAP-R01-AUTHORITY-BOOTSTRAP-CONTROL-PLANE-BINDING-R01

Classifier mode:
GOVERNANCE_CLOSEOUT_LIVE_LEDGER_GAP_R01_AUTHORITY_BOOTSTRAP_CONTROL_PLANE_BINDING_R01

Branch:
codex/governance-closeout-live-ledger-gap-r01-authority-bootstrap-binding-r01

Base:
exact 40-hex origin/main SHA stated in Owner Grant 1

Changed paths:
M project/scripts/governance-coordination.cjs
M project/scripts/governance-coordination.test.cjs
M project/docs/governance/governance-writer-coordination-contract.md
```

Stage 1 adds one task-specific constant, classifier, validator and focused test matrix. It must
pin the exact Stage 2 task, branch, M/A path set, record IDs, owner identity, program/target task,
record content invariants and marker rules. It must not create an authority record, generic root
registry, wildcard matcher, prefix authority or reusable grant.

Stage 1 terminal transition:

```text
ISSUED → STAGE1_MERGED
```

The transition is valid only after the Stage 1 PR is squash-merged and the unique canonical
commit containing the Stage 1 task ID is resolvable from fresh main.

## Stage 2 — authority materialization

```text
Task ID:
GOVERNANCE-CLOSEOUT-LIVE-LEDGER-GAP-R01-AUTHORITY-MATERIALIZATION-R01

Classifier mode:
GOVERNANCE_CLOSEOUT_LIVE_LEDGER_GAP_R01_AUTHORITY_MATERIALIZATION_R01

Branch:
codex/governance-closeout-live-ledger-gap-r01-authority-bootstrap

Required predecessor:
exact Stage 1 canonical squash SHA stated in Owner Grant 2

Base:
fresh exact origin/main SHA stated in Owner Grant 2; must descend from Stage 1

Changed paths:
M project/docs/governance/decision-log.md
A project/docs/governance/coordination-execution-grants/
  GOVERNANCE-CLOSEOUT-LIVE-LEDGER-GAP-R01-EG01.md
```

No audit companion file is required in Stage 2. PR evidence, CI, Git history and post-merge
resolution provide the audit trail without enlarging the authority materialization surface.

Stage 2 validates all of the following before merge:

1. The base equals the exact Grant 2 base and descends from the discovered Stage 1 merge.
2. The Stage 1 script, test and contract blobs have not changed since that merge.
3. The exact branch and M/A two-path set match.
4. The semantic marker appears exactly once and identifies its exact decision-log row.
5. The execution marker appears exactly once in the new grant file.
6. The execution grant binds exactly once to the semantic record's kind, path and record ID.
7. Both records carry the exact program, target task, owner identity, issue date and security
   boundaries ratified on 2026-07-29.
8. Neither record nor exact marker exists in the Stage 2 base.

## Canonical authority records

### Semantic authority

```text
recordType : SEMANTIC_AUTHORITY
recordId   : GOVERNANCE-CLOSEOUT-LIVE-LEDGER-GAP-R01-SA01
programId  : GOVERNANCE-CLOSEOUT-OPERABILITY-REMEDIATION-R01
taskId     : GOVERNANCE-CLOSEOUT-LIVE-LEDGER-GAP-R01
ownerName  : Av. Ulaş Hüseyin Telli
ownerRole  : Repository Owner / Semantic Authority
decision   : RATIFIED
issuedAt   : 2026-07-29
status     : ACTIVE_AFTER_APPROVED_MERGE
```

Exact marker, placed on the same decision-log row immediately before the bold record identity:

```html
<!-- GOV-COORD-AUTHORITY kind=SEMANTIC_AUTHORITY recordId=GOVERNANCE-CLOSEOUT-LIVE-LEDGER-GAP-R01-SA01 -->
```

Required semantic invariants:

```text
exactTaskBinding       : REQUIRED
exactPrBinding         : REQUIRED
exactHeadBinding       : REQUIRED
exactScopeBinding      : REQUIRED
requiredChecksBinding  : REQUIRED
singleUseConsumption   : REQUIRED
staleReuse             : PROHIBITED
manualFallback         : EMERGENCY_ONLY
productionActivation   : NOT_AUTHORIZED
standingAuthority      : PROHIBITED
```

### Execution grant

```text
recordType       : EXECUTION_GRANT
recordId         : GOVERNANCE-CLOSEOUT-LIVE-LEDGER-GAP-R01-EG01
programId        : GOVERNANCE-CLOSEOUT-OPERABILITY-REMEDIATION-R01
taskId           : GOVERNANCE-CLOSEOUT-LIVE-LEDGER-GAP-R01
ownerName        : Av. Ulaş Hüseyin Telli
executionMode    : GO-COMPLETE
workspaceModule  : SHARED_CONTROL_PLANE
issuedAt         : 2026-07-29
status           : ACTIVE_AFTER_APPROVED_MERGE / SINGLE_TASK
```

Exact marker:

```html
<!-- GOV-COORD-AUTHORITY kind=EXECUTION_GRANT recordId=GOVERNANCE-CLOSEOUT-LIVE-LEDGER-GAP-R01-EG01 -->
```

The grant must contain exactly these semantic binding lines:

```text
semanticAuthorityRef.kind     : SEMANTIC_AUTHORITY
semanticAuthorityRef.path     : project/docs/governance/decision-log.md
semanticAuthorityRef.recordId : GOVERNANCE-CLOSEOUT-LIVE-LEDGER-GAP-R01-SA01
```

It must also carry exact `stage1PredecessorSha` and `stage2BaseSha` values from Grant 2,
authorized phases, scope constraints, prohibited actions and terminal dogfood conditions.

## Machine locator format

The repository reader already defines the locator. No `governance://` URI is introduced.
After Stage 2 merge, consumers use:

```json
{
  "kind": "SEMANTIC_AUTHORITY",
  "path": "project/docs/governance/decision-log.md",
  "recordId": "GOVERNANCE-CLOSEOUT-LIVE-LEDGER-GAP-R01-SA01",
  "evidenceSha": "<STAGE2_SQUASH_MERGE_SHA>"
}
```

```json
{
  "kind": "EXECUTION_GRANT",
  "path": "project/docs/governance/coordination-execution-grants/GOVERNANCE-CLOSEOUT-LIVE-LEDGER-GAP-R01-EG01.md",
  "recordId": "GOVERNANCE-CLOSEOUT-LIVE-LEDGER-GAP-R01-EG01",
  "evidenceSha": "<STAGE2_SQUASH_MERGE_SHA>"
}
```

The references are distinct because both canonical path and record identity differ.

## Eligibility and consumption

```text
TARGET_READY =
  Stage2 PR is MERGED
  AND Stage2 merge is in fresh main ancestry
  AND SA resolves exactly once
  AND EG resolves exactly once
  AND references are distinct
  AND program/task binding is exact
  AND EG binds exactly to SA
  AND bootstrap status derives as CONSUMED
```

Consumption is derived atomically from the first canonical merge containing both valid records.
No third post-merge mutation is required. A second use fails because the expected Stage 2 `M/A`
change set, absent-base precondition and unique-marker rules can no longer hold against canonical
main.

Target readiness does not mean target completion, production activation or live dogfood success.
