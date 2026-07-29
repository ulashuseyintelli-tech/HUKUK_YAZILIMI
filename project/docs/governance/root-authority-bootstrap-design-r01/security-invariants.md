# Root Authority Bootstrap R01 — Security Invariants

All failures are pre-mutation or pre-merge failures. Error codes below are proposed exact codes
for the future Stage 1 implementation; they do not claim current implementation.

| # | Negative case | Required outcome | Proposed code |
|---:|---|---|---|
| 1 | Stage 1 branch mismatch | Reject | `ROOT_BOOTSTRAP_STAGE1_BRANCH_MISMATCH` |
| 2 | Stage 1 base differs from Grant 1 | Reject | `ROOT_BOOTSTRAP_STAGE1_BASE_MISMATCH` |
| 3 | Stage 1 path/status drift | Reject | `ROOT_BOOTSTRAP_STAGE1_SCOPE_MISMATCH` |
| 4 | Stage 1 task or mode mismatch | Reject | `ROOT_BOOTSTRAP_STAGE1_TASK_MISMATCH` |
| 5 | Stage 2 attempted before canonical Stage 1 merge | Reject | `ROOT_BOOTSTRAP_PREDECESSOR_MISSING` |
| 6 | Stage 2 predecessor differs from Grant 2/discovered merge | Reject | `ROOT_BOOTSTRAP_PREDECESSOR_MISMATCH` |
| 7 | Stage 2 branch mismatch | Reject | `ROOT_BOOTSTRAP_STAGE2_BRANCH_MISMATCH` |
| 8 | Stage 2 path/status drift | Reject | `ROOT_BOOTSTRAP_STAGE2_SCOPE_MISMATCH` |
| 9 | Wrong or duplicate SA record ID/marker | Reject | `ROOT_BOOTSTRAP_SA_RECORD_INVALID` |
| 10 | Wrong or duplicate EG record ID/marker | Reject | `ROOT_BOOTSTRAP_EG_RECORD_INVALID` |
| 11 | Same canonical record used for SA and EG | Reject | `AUTHORITY_REFERENCE_COLLISION` |
| 12 | Missing or mismatched owner identity/role | Reject | `ROOT_BOOTSTRAP_OWNER_IDENTITY_MISMATCH` |
| 13 | A second active attempt exists for the exact protocol/stage | Reject | `ROOT_BOOTSTRAP_DUPLICATE_ACTIVE_MODE` |
| 14 | Consumed mode or canonical records are reused | Reject | `ROOT_BOOTSTRAP_MODE_CONSUMED` |
| 15 | Grant is revoked or expired | Reject | `ROOT_BOOTSTRAP_GRANT_INACTIVE` |
| 16 | Program or target task differs | Reject | `ROOT_BOOTSTRAP_TARGET_MISMATCH` |
| 17 | Any unrelated governance/control-plane path changes | Reject | `CONTROL_PLANE_SCOPE_FORBIDDEN` |
| 18 | Design/audit file is supplied as authority source | Reject | `ROOT_BOOTSTRAP_AUTHORITY_PATH_INVALID` |
| 19 | Stage 2 base is not exact or Stage 1 binding blobs drifted | Reject | `ROOT_BOOTSTRAP_STAGE2_BASE_INVALIDATED` |
| 20 | Partial local write, missing pair, parse failure or crash residue | Reject and clean temporary files | `ROOT_BOOTSTRAP_ATOMIC_MATERIALIZATION_FAILED` |

## Positive invariants

- Both stages use explicit equality for branch, task, mode and complete path/status sets.
- Stage 1 uses one owner-pinned 40-hex base; no moving ref is accepted as authority.
- Stage 2 uses one owner-pinned 40-hex base and one exact canonical Stage 1 predecessor.
- SA and EG use different canonical paths and different record IDs.
- Each marker occurs exactly once; raw ID, heading, fuzzy or regex fallback cannot resolve it.
- The EG binds to exactly the SA kind/path/record ID and declares no additional binding field.
- Stage 2 validates exact record content, not only marker presence.
- Existing SA/EG records and markers must be absent at the Stage 2 base.
- Authority resolution uses canonical Git blobs, never unchecked working-tree prose.
- `evidenceSha` for both locators is the Stage 2 squash merge SHA or a later canonical descendant
  that contains that merge.
- An audit/design artifact cannot satisfy either locator.
- No standing scheduler, auto-merge, global owner identity or prefix authority is created.

## Threat boundaries

| Threat | Control |
|---|---|
| Stale reviewed code | exact Stage 1 base and blob pinning |
| Main drift between stages | Grant 2 exact base plus Stage 1 ancestry/blob equality |
| Branch-name imitation | equality, not prefix/substrings |
| Extra-file smuggling | complete status/path set equality |
| Authority collision | distinct kind/path/record ID checks |
| Marker spoofing in prose | exact marker plus exact decision-row location |
| Reuse after merge | M/A status impossibility, absent-record precondition and unique markers |
| Half-authority | one Git tree containing the exact two-path Stage 2 change set |
| Owner-message reinterpretation | two copy-paste grants with explicit values; no inferred locator |
| Audit-as-authority confusion | authority path allowlist limited to Decision Log and EG directory |

## Required test shape

Every negative case requires a focused test that asserts both the exact rejection code and an
unchanged target tree. A test that only observes “some error” is insufficient for cases where
error precedence protects a stronger boundary.
