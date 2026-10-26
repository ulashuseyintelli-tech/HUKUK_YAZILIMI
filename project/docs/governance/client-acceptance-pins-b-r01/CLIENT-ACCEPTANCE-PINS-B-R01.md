# CLIENT acceptance pins — published B identity (KI-116)

Scope: existing hourglass step 5 only. This record does not authorize a live
command, resend, recovery, publication or migration, and does not grant service
acceptance. Historical D-6/D-7 and OFFICE closures remain unchanged.

## Source and identity

- Repository source baseline: `2b3131b894a2f6cd3d392b06119d752c34c2dae5`.
- Owner instruction: 07 handoff, Ek 131 update, and direct CODEX_LOCAL task
  on 2026-10-26. Handoff SHA256:
  `f19be52f19188683c899a6f5e26fba7d577ca90080e9f9dba2f3ab98e48abaeb`.
- Office measurement dated 2026-10-26 20:13:20 Europe/Istanbul, using the
  D-5 block's ordinal `relative-path + NUL + SHA256 + LF` algorithm.
  Measurement record SHA256:
  `5f4caedc0f2025845eabd92e274d386f21cd442ffa45fcd7beed8c0a22b254cc`.
- API dist: `4E9472EB9E784F76E80C1585CFA1D1DBE44A39A71F3871EE53282944F53ACACC`
  (4056 files).
- WEB BUILD_ID: `JfGpdxFuUrC62aRK7cb4E`.
- Environment digest unchanged:
  `5C776BBEEE018EA5CC8192378D42D742FD4ABC1B6D0E9A3EA671CF463206908D`.

These are Office's recorded runtime measurements; CODEX_LOCAL did not remeasure
the running services, read their configuration, or run live Preflight.

## Exact block set

All paths below are relative to `project/docs/governance/`. Only the dist literal
and its adjacent source comment change. Package, environment and launcher pins,
GO ledgers, rejection gates, recipient handling and runner code remain unchanged.

| Block | Pin |
|---|---|
| `client-c4-live-403-r01/scripts/c4-live-block.ps1` | `ExpLiveDist` |
| `client-extacc-intake-chain-r01/scripts/extacc-owner-live-block.ps1` | `ExpLiveDist` |
| `client-extacc-portal-d4-r01/scripts/d4-owner-live-block.ps1` | `ExpLiveDist` |
| `client-extacc-portal-d5-r01/scripts/d5-owner-live-block.ps1` | `ExpLiveDist` |
| `client-extacc-portal-d6-r01/scripts/d6-owner-live-block.ps1` | `ExpLiveDist` |
| `client-extacc-portal-d7-r01/scripts/d7-owner-live-block.ps1` | `ExpLiveDist` |
| `client-h5-intake-url-r01/scripts/h5-owner-env-block.ps1` | `EXP_DIST` |
| `client-h5-intake-url-r01/scripts/h5-owner-live-block.ps1` | `ExpLiveDist` |

The old R27 dist literal was
`E28A6863CF109A1A3AE1F53E096D5F5C2037E382EF2D8D3EC87FEE3B827E5134`.
The earlier audit already recorded eight active literals versus a nine-file
planning label (L6-F-14). This mapping is the ninth delivery file; an unrelated
historical release block is not added to manufacture a ninth executable target.
The included H5 environment block remains historical and refuses normal execution;
its pre-change environment pin and prohibition on reapplying setup are preserved.
The WEB BUILD_ID is recorded as context; these eight dist gates do not compare it.

## Acceptance boundary

Local isolated checks can establish the exact literal changes, unchanged guards,
package-pin integrity, syntax and rejection behavior. They do not establish that
live Preflight or D-5 passes. A new D-5 run remains a separately authorized,
single-use Office/owner action; the consumed 2026-10-01 authorization is not reused.

On 2026-10-26, PowerShell 7.6.5 validation passed 72 checks across all eight
blocks: AST syntax, unique literal assignment, exact base-to-candidate content
replacement preserving BOM/newlines, and each existing pin comparison accepting
the B digest while rejecting both the previous digest and a foreign digest.
Only those isolated comparison expressions were evaluated; the blocks themselves,
SelfTest and Preflight were not executed. Repository-only verification also passed
all seven runner-package aggregate pins (55 file references). The unchanged guard
and runner bodies are established by exact-content comparison, not by a claimed
live acceptance run. A Windows PowerShell file invocation was denied by its
execution policy; that policy was not changed and no Windows PowerShell PASS is
claimed. Validation outputs are retained in the task's external evidence directory.

## Terminal handoff preparation (hourglass step 15)

This is preparation, not OFFICE or CLIENT final acceptance:

- Step 5 needs its exact-head CI, approved merge and main verification evidence.
- Step 6a remains the new D-5 attempt, with a fresh owner GO; step 6b requires
  observed PASS and owner D-9 acceptance before the decision-log receipt.
- Step 7 remains the genuinely unanswered H1-H8 service signatures. Technical
  results and merged code do not substitute for those signatures.
- Preserve the existing HV-1 through HV-4 backlog handoff and their evidence;
  no pool item or new development phase is activated by this delivery.
- Main, published runtime and functional/service acceptance remain distinct.

The final step-15 receipt must report the actual open items at its publication
time, following the existing 05 handoff and EK-D. No completed behavior is reopened.
