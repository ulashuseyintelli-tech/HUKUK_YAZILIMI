# Root Authority Bootstrap R01 — Validation Plan

## Design PR validation

The current design PR must demonstrate:

1. All eleven expected files exist under the authorized directory and no other path changes.
2. `bootstrap-design.json` parses and byte-equals deterministic two-space JSON serialization plus
   one LF newline.
3. Every relative Markdown link resolves to an existing repository file.
4. The two grant templates contain all required exact identities and only documented placeholders.
5. The state machine has a disposition for every transition and requested recovery case.
6. All twenty required negative security cases map to a fail-closed result.
7. Existing governance files outside the design directory are byte-unchanged.
8. Repository governance self-test, repository validation and instruction policy pass.

Applicable commands:

```text
node project/scripts/governance-coordination.cjs self-test
node project/scripts/governance-coordination.cjs validate-repository
node project/scripts/instruction-policy.cjs verify \
  --head-ref codex/root-authority-bootstrap-design-r01 \
  --changed-paths <exact-comma-separated-design-paths>
```

The full `governance-coordination.test.cjs` suite may be run for regression confidence. If it is
not run or does not complete, it is reported factually and never presented as PASS.

## Stage 1 validation

Preconditions:

- Grant 1 exists as an explicit owner message with no placeholders.
- `base == Grant1.stage1BaseSha == fresh origin/main`.
- Exact Stage 1 branch and M/M/M paths.
- No competing writer or owner-WIP overlap.

Required implementation tests:

- Positive classification of the exact Stage 1 tuple.
- Wrong base, branch, task, mode, each missing path, each additional path and each wrong status.
- Contract missing every required literal one at a time.
- No Stage 2 authority path in the Stage 1 diff.
- No prefix/similar branch acceptance.
- Full existing governance-coordination suite.

PR-scope command shape:

```text
node project/scripts/governance-coordination.cjs validate-pr-scope \
  --base <GRANT1_BASE_SHA> \
  --head <STAGE1_HEAD_SHA> \
  --head-ref codex/governance-closeout-live-ledger-gap-r01-authority-bootstrap-binding-r01
```

Post-merge:

- GitHub PR is `MERGED` with a non-null merge SHA.
- Fresh main contains one unique commit introducing the exact Stage 1 task ID.
- The script, test and contract blobs at fresh main equal the merged Stage 1 blobs.
- Stage 2 remains unauthorized until Grant 2.

## Stage 2 validation

Preconditions:

- Grant 2 exists as an explicit owner message with no placeholders.
- Discovered Stage 1 merge equals Grant 2 predecessor.
- `base == Grant2.stage2BaseSha == fresh origin/main` and descends from Stage 1.
- Stage 1 binding blobs are unchanged.
- Exact Stage 2 branch and M/A paths.
- Base contains neither proposed record nor exact marker.

Required implementation tests:

- Exact positive materialization fixture.
- All twenty cases in [security-invariants.md](./security-invariants.md).
- Exact SA row location and field-content validation.
- Exact EG marker, field-content and SA binding validation.
- Same-ref, wrong-task, wrong-program, wrong-owner and wrong-date rejection.
- Missing, duplicate and conflicting marker rejection.
- Design/audit authority-path rejection.
- Deterministic two-output generation.
- Injected failure between render/replace steps leaves no changed canonical target.
- Full existing governance-coordination suite.

PR-scope command shape:

```text
node project/scripts/governance-coordination.cjs validate-pr-scope \
  --base <GRANT2_BASE_SHA> \
  --head <STAGE2_HEAD_SHA> \
  --head-ref codex/governance-closeout-live-ledger-gap-r01-authority-bootstrap
```

## Post-merge round-trip

On fresh canonical main:

1. Build both locator objects using Stage 2 squash SHA as `evidenceSha`.
2. Resolve each through `validateAuthorityRecordAtRef` or its canonical public wrapper.
3. Assert different path/record identities.
4. Assert exact program/target-task/owner/execution-mode content.
5. Run wrong-task, missing-record and duplicate/conflict fixtures against immutable Git refs.
6. Derive bootstrap status as `CONSUMED`.
7. Confirm a second Stage 2 M/A classification is impossible against fresh main.

Only then may the target task move to `READY FOR EXECUTION`.

## CI and merge gates

For both future stages and this design task:

- Required checks must reach terminal success.
- Expected PR head, remote head and local head must match.
- Changed paths must exactly match the applicable allowlist.
- PR must be clean and mergeable with no competing writer.
- Merge is squash-only under the task-specific owner `GO-COMPLETE` authority.
- Main sync, post-merge resolution and safe cleanup are required before closure.
