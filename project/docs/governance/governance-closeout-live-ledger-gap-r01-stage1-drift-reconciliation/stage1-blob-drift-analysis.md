# Stage 1 Blob Drift Analysis

Document role: reconciliation evidence; not semantic authority, execution authority, or a machine locator.

Program: GOVERNANCE-CLOSEOUT-OPERABILITY-REMEDIATION-R01

Task: GOVERNANCE-CLOSEOUT-LIVE-LEDGER-GAP-R01-STAGE1-DRIFT-AND-WRITER-RECONCILIATION-R01

Audit base: ebb82762a6ecf24c214b6b6a5d2fede8caa4c206

Stage 1 predecessor: 790d2a956dad05e39c8fde71cc3e19e1f2425cf3

## Result

STAGE 1 DRIFT CLASSIFICATION: EXTENDED_BACKWARD_COMPATIBLY

The three Stage 1 blobs are not byte-equal to the predecessor. All three changes came from one
canonical successor commit, PR #1906 squash commit
14a4c18b1ef41f0738013605a20abcd64c5e6263. That commit added the separate, task-bound TR01
authority-bootstrap binding for PR #1903. It did not delete or replace any existing line in the
three files.

| File | Stage 1 blob | Audit-base blob | Delta in PR #1906 |
|---|---|---|---|
| project/scripts/governance-coordination.cjs | 9257bf85994507695612b60cf8434b647da8b23a | a5ea2bc05db868483618573cb31d2699a4c09d7b | 246 insertions, 0 deletions |
| project/scripts/governance-coordination.test.cjs | 7b88a1651a01c723db7becbd2e0ffb9077d811c2 | 2d8bc23be477d1347330f53e48bced2bc3ab00ff | 145 insertions, 0 deletions |
| project/docs/governance/governance-writer-coordination-contract.md | 910f062ecb8a689cb43a9cc8feb7c0470f7ac694 | 88064c929bb01c2ae2022213570291a234d36d24 | 46 insertions, 0 deletions |

## Source attribution

| Evidence | Value |
|---|---|
| Source PR | #1906, MERGED |
| Source task | RCV-CLAIM-FORM-D02-TR01-AUTHORITY-BOOTSTRAP-CONTROL-PLANE-BINDING-R01 |
| Source base | 75790c059acb69a558ba2f835179dcedbbef2a45 |
| Source head | e9c68ed58dd9b50fcf1a8ee525eac42fc8b532c2 |
| Squash commit | 14a4c18b1ef41f0738013605a20abcd64c5e6263 |
| PR checks | 9/9 PASS |

## Semantic effect

PR #1906 introduced a distinct constant, classifier branch, validators, tests, exports, and
contract section for the TR01 closure-authority pair. Its identities do not overlap the root
bootstrap:

- different task and mode IDs;
- different Stage 1 and Stage 2 branch names;
- different semantic and execution record IDs;
- a different execution-grant path;
- exact path-set matching rather than wildcard or prefix matching.

The root-bootstrap constant, program and target-task identity, Stage 1 base/branch/M-M-M set,
Stage 2 branch/M-A set, SA01/EG01 identities, distinct-reference rule, single-use state rules,
and fail-closed error behavior remain present and unchanged.

## Behavioral evidence

- Root-authority focused tests: 10/10 PASS on audit-base-equivalent control-plane blobs.
- Full governance-coordination suite: 208/208 PASS.
- The isolation test explicitly exercises the root mode alongside the added TR01 mode.
- Wrong base, wrong branch, path drift, wrong task, duplicate mode, revoked/expired state,
  consumed reuse, audit-as-authority, and record-identity mismatch remain rejected.

Conclusion: byte equality failed because a separate exact binding was appended. The root
binding was extended with an isolated sibling mode and was not weakened or superseded.
