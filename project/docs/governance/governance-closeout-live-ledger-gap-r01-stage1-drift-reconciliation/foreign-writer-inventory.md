# Foreign Decision-Log Writer Inventory

Document role: read-only inventory. No foreign branch, worktree, index, commit, or file was
modified.

Observation base: ebb82762a6ecf24c214b6b6a5d2fede8caa4c206

## Open PR writer

PR #1914 is OPEN and modifies project/docs/governance/decision-log.md. Its exact identity is:

| Field | Observed value |
|---|---|
| Title | docs(governance): authorize KC01/TR01 ownership reconciliation |
| Head ref | codex/rcv-claim-form-kc01-tr01-ownership-authority-bootstrap-r01 |
| Head SHA | df17d686381f21eeccad0cf6bbf376ff88e253a2 |
| Base SHA | abd06a6b221faba42671104df0302114d4ec9ba5 |
| Changed paths | M decision-log.md; A task-specific execution grant |
| Mergeability at observation | CONFLICTING / DIRTY |
| Owner | Ulaş Hüseyin Telli |

Disposition: ACTIVE_COMPETING_WRITER.

## HUKUK_ent_approval

| Field | Observed value |
|---|---|
| Path | C:\Development\HUKUK_YAZILIMI\HUKUK_ent_approval |
| Branch | claude/debtor-enterprise-approval-authorization-p0-i01 |
| HEAD | d4f0e5be3c8e8ab18b18fe35ed6290cad39d7e80 |
| Merge base with main | d4f0e5be3c8e8ab18b18fe35ed6290cad39d7e80 |
| Upstream | origin/main |
| Main relationship | HEAD is canonical ancestor; 0 ahead / 121 behind at observation |
| Associated PR | NONE FOUND |
| Remote branch | NONE FOUND |
| Worktree registration | locked with reason initializing |
| Staged paths | 6,029 deletions |
| decision-log index state | staged deletion |
| decision-log working-tree state | untracked file at the same path |
| Committed decision-log divergence | NONE |
| Nominal task identity | DEBTOR enterprise approval authorization P0 I01, from branch only |
| Explicit current owner/task record | NOT FOUND |

The worktree is not a terminal merged residual: its index contains an active staged deletion of
the protected writer surface. The simultaneous staged-delete/untracked-file state is recorded
without inferring why it exists.

Disposition: ACTIVE_COMPETING_WRITER.

## HUKUK_ccb-001-r

| Field | Observed value |
|---|---|
| Path | C:\Development\HUKUK_YAZILIMI\HUKUK_ccb-001-r |
| Branch | codex/ccb-001-pr1-pr6-rescue |
| HEAD | 961bbaf38d3ab1a7c7a691fbd56880ca3f6ffcc8 |
| Merge base with main | 7b222c509b0b70d13a76d92eb327994bf877bca1 |
| Upstream | origin/codex/ccb-001-pr1-pr6-rescue |
| Main relationship | diverged; 7 branch-only commits / 946 main-only commits at observation |
| Remote branch | 4263b26a3ae85b0a1710600e4eaae211ac93f149 |
| Associated PR | NONE FOUND |
| Working tree | clean |
| decision-log status | committed modification not in canonical main |
| Writer commits | 0a169f231ad1e27795dc58597c99f96d1059dcf4 and 961bbaf38d3ab1a7c7a691fbd56880ca3f6ffcc8 |
| Task identity | CCB-001 / CCB-001-R reconciliation |
| Latest commit author | Ulaş Hüseyin Telli |

The absence of an open PR and a clean working tree do not make this terminal. The branch contains
unmerged decision-log content and is not an ancestor of canonical main.

Disposition: ACTIVE_COMPETING_WRITER.

## Mutation statement

PR #1914 and both worktrees were inspected with read-only Git and GitHub commands. No comment,
review, merge, close, reset, clean, checkout, add, commit, push, branch movement, file copy, or
worktree removal was performed on those foreign writers.
