# Reconciliation Decision Log

This file is local to the reconciliation evidence pack. It is not the canonical repository
Decision Log, a semantic authority record, an execution grant, or a machine authority locator.

| Date | Decision | Evidence | Effect |
|---|---|---|---|
| 2026-07-30 | Classify the Stage 1 control-plane blob drift as EXTENDED_BACKWARD_COMPATIBLY. | PR #1906 / 14a4c18b1ef41f0738013605a20abcd64c5e6263; 437 insertions and 0 deletions; exact binding re-derivation; focused 10/10 and full 208/208 governance-coordination tests. | No rebinding recommendation from the observed drift. |
| 2026-07-30 | Classify open PR #1914 as ACTIVE_COMPETING_WRITER. | The open PR modifies decision-log.md and adds a task-specific execution grant; observed merge state CONFLICTING / DIRTY. | Writer gate remains blocked; no action on the foreign PR is authorized. |
| 2026-07-30 | Classify HUKUK_ent_approval as ACTIVE_COMPETING_WRITER. | Staged deletion of decision-log.md, simultaneous untracked file, 6,029 staged deletions, no terminal PR evidence. | Writer gate remains blocked. |
| 2026-07-30 | Classify HUKUK_ccb-001-r as ACTIVE_COMPETING_WRITER. | Two non-canonical commits modify decision-log.md; branch diverges from main; no PR. | Writer gate remains blocked. |
| 2026-07-30 | Keep Stage 2 BLOCKED. | Control-plane gate passes; writer gate fails. | Foreign writer terminal disposition and then a fresh owner Stage 2 grant are required. |

No canonical authority marker is intentionally present in this evidence file.
