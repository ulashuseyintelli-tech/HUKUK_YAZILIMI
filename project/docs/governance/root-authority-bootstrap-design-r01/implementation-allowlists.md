# Root Authority Bootstrap R01 — Implementation Allowlists

All lists are complete status/path sets. A similar path, additional file, rename or deletion is
outside the relevant grant.

## Current design task

Authorized repository prefix:

```text
project/docs/governance/root-authority-bootstrap-design-r01/**
```

Materialized design files:

```text
A project/docs/governance/root-authority-bootstrap-design-r01/root-cause-and-circularity.md
A project/docs/governance/root-authority-bootstrap-design-r01/two-stage-bootstrap-design.md
A project/docs/governance/root-authority-bootstrap-design-r01/bootstrap-state-machine.md
A project/docs/governance/root-authority-bootstrap-design-r01/security-invariants.md
A project/docs/governance/root-authority-bootstrap-design-r01/failure-recovery.md
A project/docs/governance/root-authority-bootstrap-design-r01/stage1-owner-grant-template.md
A project/docs/governance/root-authority-bootstrap-design-r01/stage2-owner-grant-template.md
A project/docs/governance/root-authority-bootstrap-design-r01/implementation-allowlists.md
A project/docs/governance/root-authority-bootstrap-design-r01/validation-plan.md
A project/docs/governance/root-authority-bootstrap-design-r01/decision-log.md
A project/docs/governance/root-authority-bootstrap-design-r01/bootstrap-design.json
```

No index change is required. The owner explicitly selected the successor directory and every
artifact links to the rest of the pack. Adding an index path would exceed the exact design grant.

## Proposed Stage 1 allowlist

```text
M project/scripts/governance-coordination.cjs
M project/scripts/governance-coordination.test.cjs
M project/docs/governance/governance-writer-coordination-contract.md
```

No fourth path is required. The existing script owns classifiers, validators, canonical Git
readers and CLI dispatch; the adjacent test file owns focused fixtures; the contract owns the
ratified one-time binding record. A separate state file would create unnecessary mutable authority.

Stage 1 expressly excludes:

```text
project/docs/governance/decision-log.md
project/docs/governance/coordination-execution-grants/**
project/scripts/orchestration-v2/closeout/**
project/docs/runbooks/pr-closeout.md
```

## Proposed Stage 2 allowlist

```text
M project/docs/governance/decision-log.md
A project/docs/governance/coordination-execution-grants/GOVERNANCE-CLOSEOUT-LIVE-LEDGER-GAP-R01-EG01.md
```

No audit companion is proposed for Stage 2. Authority records remain in their existing canonical
stores and the merge/CI/PR history provides evidence. Design or audit files cannot satisfy a
locator.

Stage 2 expressly excludes:

```text
project/scripts/governance-coordination.cjs
project/scripts/governance-coordination.test.cjs
project/docs/governance/governance-writer-coordination-contract.md
project/docs/governance/root-authority-bootstrap-design-r01/**
```

## Future target implementation

The closeout ledger task's implementation allowlist is not designed or authorized here. It must
be discovered and validated in `GOVERNANCE-CLOSEOUT-LIVE-LEDGER-GAP-R01` after the two refs are
canonical. Product modules, production settings, W3, Windows orphan cleanup and TypeScript debt
remain outside the program lock.
