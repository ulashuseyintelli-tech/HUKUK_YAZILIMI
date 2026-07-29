# Root Authority Bootstrap R01 — Stage 1 Owner Grant Template

> INERT TEMPLATE. This file is not an owner grant, semantic authority, execution grant or
> machine locator. The owner must copy, complete and send it as a separate decision after this
> design is canonical.

```text
# OWNER RATIFICATION AND EXECUTION GRANT — STAGE 1

OWNER:
Av. Ulaş Hüseyin Telli

OWNER ROLE:
Repository Owner / Semantic Authority

PROGRAM:
GOVERNANCE-CLOSEOUT-OPERABILITY-REMEDIATION-R01

DESIGN:
ROOT-AUTHORITY-BOOTSTRAP-DESIGN-R01

CANONICAL DESIGN MERGE SHA:
{{DESIGN_SQUASH_MERGE_SHA}}

TASK:
GOVERNANCE-CLOSEOUT-LIVE-LEDGER-GAP-R01-AUTHORITY-BOOTSTRAP-CONTROL-PLANE-BINDING-R01

MODE:
GOVERNANCE_CLOSEOUT_LIVE_LEDGER_GAP_R01_AUTHORITY_BOOTSTRAP_CONTROL_PLANE_BINDING_R01

EXECUTION GRANT:
GO-COMPLETE — STAGE 1 ONLY

EXACT BASE SHA:
{{STAGE1_ORIGIN_MAIN_SHA}}

EXACT BRANCH:
codex/governance-closeout-live-ledger-gap-r01-authority-bootstrap-binding-r01

EXACT CHANGED-PATH SET:
M project/scripts/governance-coordination.cjs
M project/scripts/governance-coordination.test.cjs
M project/docs/governance/governance-writer-coordination-contract.md

EXPIRY UTC:
{{STAGE1_EXPIRY_UTC}}

OWNER DECISION:
RATIFIED / BINDING

I authorize only the task-specific, exact-base-bound, exact-branch-bound,
exact-path-bound and single-use Stage 1 control-plane binding described by the
canonical ROOT-AUTHORITY-BOOTSTRAP-DESIGN-R01 design.

Stage 1 shall pin the exact Stage 2 task, branch, M/A allowlist, SA/EG record IDs,
program/target task, owner identity, marker/content invariants and the canonical
Stage 1 predecessor-discovery rule.

Stage 1 shall not write decision-log.md, create an execution-grant record,
materialize SA/EG authority, mutate closeout implementation, enable production,
or create wildcard, prefix, global, standing or reusable authority.

CI, exact head, exact scope, CLEAN/MERGEABLE and no-competing-writer gates remain
mandatory. On PASS, this grant authorizes squash-merge, main sync, safe cleanup and
post-merge verification for Stage 1 only.

STAGE 2:
NOT AUTHORIZED

TARGET IMPLEMENTATION:
NOT STARTED BY THIS GRANT

ONAY BEKLENIYOR:
NO — FOR STAGE 1 ONLY
```

## Completion checklist before sending

- Replace every `{{...}}` token.
- Verify the design SHA and Stage 1 base are 40 lowercase hexadecimal Git SHAs.
- Verify the Stage 1 base equals fresh `origin/main` immediately before the decision.
- Choose an absolute UTC expiry.
- Do not add Stage 2 or target implementation authority to this message.
