# Client 4a — supplied owner portal exception

Request-only. No protected target or manifest is written. Prior writer handoffs are closed and not reused. The separate exact task-bound Charter grant follows the accepted SA execution.

<!-- GOV_COORD_REQUEST_JSON_BEGIN -->
```json
{
  "schemaVersion": 1,
  "requestId": "GOV-REQ-20261107-CLIENT-PORTAL-DEACTIVATION-4A-SA01",
  "requestFingerprint": "f74fe3de7c40109ecbe452e08927d1eeb3660304d83e26b6edb10be49b621a15",
  "requestedBy": "CODEX_LOCAL",
  "createdAt": "2026-11-07T01:57:02Z",
  "baseMainSha": "90b090cd45a7efba57a7d4be611952020fe0cae6",
  "semanticAuthorityRef": {
    "kind": "SEMANTIC_AUTHORITY",
    "path": "project/docs/governance/decision-log.md",
    "recordId": "GOV-COORD-V2-T1-RATIFICATION",
    "evidenceSha": "90b090cd45a7efba57a7d4be611952020fe0cae6"
  },
  "executionGrantRef": {
    "kind": "EXECUTION_GRANT",
    "path": "project/docs/governance/coordination-execution-grants/GOV-COORD-V1-CODEX-LOCAL.md",
    "recordId": "GOV-COORD-V1-CODEX-LOCAL",
    "evidenceSha": "90b090cd45a7efba57a7d4be611952020fe0cae6"
  },
  "operation": {
    "type": "EXACT_APPEND_AT_DECLARED_ANCHOR",
    "changeClass": "LEVEL_2_MECHANICAL",
    "targetFile": "project/docs/governance/decision-log.md",
    "recordIdentity": "| Date | Decision | Scope | Source | Follow-up |",
    "anchor": "|---|---|---|---|---|",
    "expectedOldValue": "|---|---|---|---|---|",
    "newValue": "\n| 2026-11-07 | <!-- GOV-COORD-AUTHORITY kind=SEMANTIC_AUTHORITY recordId=CLIENT-PORTAL-DEACTIVATION-4A-SA01 --> **CLIENT 4a — SUPPLIED OWNER PORTAL EXCEPTION:** Explicit Client deactivation also disables its same-tenant linked portal account through the existing account-state/tokenVersion mechanism. Client reactivation never automatically reopens portal access; separate existing portal-enable authority is required after Client reactivation. | Owner expressly authorizes the narrow canonical portal exception to Charter section 50.3 and the relevant lifecycle reference, preserving historical OWN-14/D5 acceptance and all other child-record protections. Cover DELETE and actual PUT true-to-false transitions; keep unchanged isActive echoes and existing conditional-write/identity guards. Client state, portal access flag, portal disable/version increment/reset-token clearing and safe audit share one transaction. Serialize portal create/reactivate/disable with Client deactivation; do not bypass existing action authority, tenant or canonical object scope. | Owner approved package choices 1–6 and now explicitly authorizes this prepared 4a scope including the canonical portal exception, focused tests, PR, required CI, exact-head merge and main verification. OWNER-AUTHORITY.txt SHA256 b92f49def13c56c36b6a0ba4a30c4c66ca7094b5426aff3e608a7b92110cdd1a; approved package SHA256 fa117c3df2711f8e7881d4f937038e20d6bdd40306519032c74a9bc42b60899c. Supplied-owner transcription only, not agent ratification or a machine execution grant. | Fresh narrow Decision Log, Charter and new-spec manifest writer sequencing is required. Standing grant is not policy-change authority: the Charter amendment requires the existing exact task-bound grant/request/execution/result chain. Preserve completed intake/1b/AK-1c/2b/2c/3a/3b/3c-unpaid, O-5/F04_RACE WIP and cleanup residues. No general cascade, historical-account backfill/bulk shutdown, new permission/session system, schema/migration, financial action, other package choice, production or general Office/Client closure. |",
    "evidenceSha": "90b090cd45a7efba57a7d4be611952020fe0cae6",
    "expectedResultSha256": "c5a091e04c63a71bd39e2f8aa83905b1806cf4802d2d0d8e855eb9f0841467cb"
  },
  "declaredTargetAllowlist": [
    "project/docs/governance/decision-log.md"
  ]
}
```
<!-- GOV_COORD_REQUEST_JSON_END -->
