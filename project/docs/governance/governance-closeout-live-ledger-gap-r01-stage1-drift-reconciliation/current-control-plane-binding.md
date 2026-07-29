# Current Control-Plane Binding

Document role: read-only re-derivation of the canonical control plane; not authority.

Audit base: ebb82762a6ecf24c214b6b6a5d2fede8caa4c206

## Root-bootstrap identity

| Field | Canonical value | Result |
|---|---|---|
| Protocol mode ID | GOVERNANCE_CLOSEOUT_LIVE_LEDGER_GAP_R01_ROOT_AUTHORITY_BOOTSTRAP_R01 | PASS |
| Program ID | GOVERNANCE-CLOSEOUT-OPERABILITY-REMEDIATION-R01 | PASS |
| Target task | GOVERNANCE-CLOSEOUT-LIVE-LEDGER-GAP-R01 | PASS |
| Workspace module | SHARED_CONTROL_PLANE | PASS |
| Owner name | Av. Ulaş Hüseyin Telli | PASS |
| Owner role | Repository Owner / Semantic Authority | PASS |
| Issued date | 2026-07-29 | PASS |

## Stage 1 binding

| Field | Canonical value |
|---|---|
| Task | GOVERNANCE-CLOSEOUT-LIVE-LEDGER-GAP-R01-AUTHORITY-BOOTSTRAP-CONTROL-PLANE-BINDING-R01 |
| Mode | GOVERNANCE_CLOSEOUT_LIVE_LEDGER_GAP_R01_AUTHORITY_BOOTSTRAP_CONTROL_PLANE_BINDING_R01 |
| Owner-pinned base | 35e215cde413dd3de42093f967c01b4929f37fed |
| Head ref | codex/governance-closeout-live-ledger-gap-r01-authority-bootstrap-binding-r01 |
| Scope | M governance-coordination.cjs; M governance-coordination.test.cjs; M governance-writer-coordination-contract.md |
| Canonical predecessor | 790d2a956dad05e39c8fde71cc3e19e1f2425cf3 |

The canonical history contains one introduction of the Stage 1 task identity. Duplicate active
mode discovery therefore returns no duplicate.

## Stage 2 prospective binding

| Field | Canonical value |
|---|---|
| Task | GOVERNANCE-CLOSEOUT-LIVE-LEDGER-GAP-R01-AUTHORITY-MATERIALIZATION-R01 |
| Mode | GOVERNANCE_CLOSEOUT_LIVE_LEDGER_GAP_R01_AUTHORITY_MATERIALIZATION_R01 |
| Head ref | codex/governance-closeout-live-ledger-gap-r01-authority-bootstrap |
| Modified path | project/docs/governance/decision-log.md |
| Added path | project/docs/governance/coordination-execution-grants/GOVERNANCE-CLOSEOUT-LIVE-LEDGER-GAP-R01-EG01.md |
| Semantic record | SEMANTIC_AUTHORITY / GOVERNANCE-CLOSEOUT-LIVE-LEDGER-GAP-R01-SA01 |
| Execution record | EXECUTION_GRANT / GOVERNANCE-CLOSEOUT-LIVE-LEDGER-GAP-R01-EG01 |

The two references differ by kind, path, and record ID. The current canonical base contains
neither the SA01 exact marker nor the EG01 file.

## Lifecycle behavior

- A consumed state is rejected.
- Revoked and expired states are rejected.
- More than one active mode is rejected.
- Missing or non-ancestor predecessor is rejected.
- Stage 1 binding-blob drift is rejected by the prospective Stage 2 validator.
- Wrong task, branch, status/path set, authority path, record identity, owner identity,
  program, and target task are rejected.
- Consumption remains derived from the atomic merge containing both exact records.

This re-derivation proves the binding remains deterministic. It does not waive the fresh
Stage 2 base, writer, owner-grant, or materialization gates.
