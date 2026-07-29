# Root Authority Bootstrap R01 — Stage 2 Owner Grant Template

> INERT TEMPLATE. This file is not an owner grant, semantic authority, execution grant or
> machine locator. It is usable only after Stage 1 is merged and post-merge verified.

```text
# OWNER RATIFICATION AND EXECUTION GRANT — STAGE 2

OWNER:
Av. Ulaş Hüseyin Telli

OWNER ROLE:
Repository Owner / Semantic Authority

PROGRAM:
GOVERNANCE-CLOSEOUT-OPERABILITY-REMEDIATION-R01

TASK:
GOVERNANCE-CLOSEOUT-LIVE-LEDGER-GAP-R01-AUTHORITY-MATERIALIZATION-R01

MODE:
GOVERNANCE_CLOSEOUT_LIVE_LEDGER_GAP_R01_AUTHORITY_MATERIALIZATION_R01

EXECUTION GRANT:
GO-COMPLETE — STAGE 2 ONLY

EXACT STAGE 1 PREDECESSOR SHA:
{{STAGE1_SQUASH_MERGE_SHA}}

EXACT STAGE 2 BASE SHA:
{{STAGE2_ORIGIN_MAIN_SHA}}

EXACT BRANCH:
codex/governance-closeout-live-ledger-gap-r01-authority-bootstrap

EXACT CHANGED-PATH SET:
M project/docs/governance/decision-log.md
A project/docs/governance/coordination-execution-grants/GOVERNANCE-CLOSEOUT-LIVE-LEDGER-GAP-R01-EG01.md

SEMANTIC AUTHORITY RECORD:
kind     = SEMANTIC_AUTHORITY
path     = project/docs/governance/decision-log.md
recordId = GOVERNANCE-CLOSEOUT-LIVE-LEDGER-GAP-R01-SA01

EXECUTION GRANT RECORD:
kind     = EXECUTION_GRANT
path     = project/docs/governance/coordination-execution-grants/GOVERNANCE-CLOSEOUT-LIVE-LEDGER-GAP-R01-EG01.md
recordId = GOVERNANCE-CLOSEOUT-LIVE-LEDGER-GAP-R01-EG01

RECORD PROGRAM/TASK BINDING:
programId = GOVERNANCE-CLOSEOUT-OPERABILITY-REMEDIATION-R01
taskId    = GOVERNANCE-CLOSEOUT-LIVE-LEDGER-GAP-R01

OWNER IDENTITY IN BOTH RECORDS:
ownerName = Av. Ulaş Hüseyin Telli
ownerRole = Repository Owner / Semantic Authority
issuedAt  = 2026-07-29

EXPIRY UTC:
{{STAGE2_EXPIRY_UTC}}

OWNER DECISION:
RATIFIED / BINDING

I confirm that the exact Stage 1 predecessor is canonical and that the exact
Stage 2 base descends from it. I authorize only atomic materialization of the
two distinct records above using the canonical design's exact schemas,
security invariants and non-goals.

The SA shall preserve the fail-closed ledger requirement and require exact
task, PR, head, scope, required-check and single-use bindings. The EG shall
authorize only GOVERNANCE-CLOSEOUT-LIVE-LEDGER-GAP-R01 under GO-COMPLETE and
SHARED_CONTROL_PLANE with the previously ratified dogfood terminal conditions.

No third path, audit-as-authority record, control-plane implementation change,
product mutation, production activation, CI bypass, ledger bypass, auto-merge,
standing authority or reusable authority is authorized.

Expected PR head shall be captured after the authorized commit and must remain
exact through closeout. Any later head or base change requires full revalidation;
base change requires a fresh owner grant.

On required CI PASS, exact head/scope PASS, CLEAN/MERGEABLE and no competing
writer, this grant authorizes Stage 2 squash-merge, main sync, safe cleanup and
post-merge canonical round-trip.

TARGET TASK STATUS AFTER SUCCESS:
READY FOR EXECUTION — NOT COMPLETED

ONAY BEKLENIYOR:
NO — FOR STAGE 2 ONLY
```

## Completion checklist before sending

- Replace every `{{...}}` token.
- Confirm Stage 1 PR is `MERGED` and use its canonical squash SHA.
- Confirm fresh Stage 2 `origin/main` equals the stated base and descends from Stage 1.
- Confirm the three Stage 1 binding blobs have not changed.
- Confirm no open writer touches either Stage 2 path.
- Choose an absolute UTC expiry.
