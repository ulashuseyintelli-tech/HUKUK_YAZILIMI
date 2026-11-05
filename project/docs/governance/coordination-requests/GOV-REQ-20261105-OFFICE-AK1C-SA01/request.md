# Office 2a / AK-1c — supplied owner-decision transcription request

Request-only. Fresh writer coordination remains pending; no target write or product acceptance is claimed.

<!-- GOV_COORD_REQUEST_JSON_BEGIN -->
```json
{
  "schemaVersion": 1,
  "requestId": "GOV-REQ-20261105-OFFICE-AK1C-SA01",
  "requestFingerprint": "e9a8d7fb850364e92bf5acb0d95e1c751aba81fb7146d9a3be2447f0b47ba95a",
  "requestedBy": "CODEX_LOCAL",
  "createdAt": "2026-11-05T12:36:32Z",
  "baseMainSha": "26a7670ff5ed99070b43ec71dce41ecf05cea456",
  "semanticAuthorityRef": {
    "kind": "SEMANTIC_AUTHORITY",
    "path": "project/docs/governance/decision-log.md",
    "recordId": "GOV-COORD-V2-T1-RATIFICATION",
    "evidenceSha": "26a7670ff5ed99070b43ec71dce41ecf05cea456"
  },
  "executionGrantRef": {
    "kind": "EXECUTION_GRANT",
    "path": "project/docs/governance/coordination-execution-grants/GOV-COORD-V1-CODEX-LOCAL.md",
    "recordId": "GOV-COORD-V1-CODEX-LOCAL",
    "evidenceSha": "26a7670ff5ed99070b43ec71dce41ecf05cea456"
  },
  "operation": {
    "type": "EXACT_APPEND_AT_DECLARED_ANCHOR",
    "changeClass": "LEVEL_2_MECHANICAL",
    "targetFile": "project/docs/governance/decision-log.md",
    "recordIdentity": "| Date | Decision | Scope | Source | Follow-up |",
    "anchor": "|---|---|---|---|---|",
    "expectedOldValue": "|---|---|---|---|---|",
    "newValue": "\n| 2026-11-05 | <!-- GOV-COORD-AUTHORITY kind=SEMANTIC_AUTHORITY recordId=OFFICE-AK1C-STAFF-ADMIN-SA01 --> **OFFICE 2a / AK-1c — OWNER APPROVED STAFF-LINKED ADMIN EXCLUSION FOR LEGAL RESPONSIBLE LAWYER CHANGE:** A staff-linked ADMIN must not use the technical ADMIN shortcut to change the legal responsible lawyer. Evaluate staff-link denial before ADMIN acceptance for this operation. This narrowly amends the initial ADMIN-only legal-responsibility bridge contract; it grants no action to another role. | Only PATCH /cases/:id/legal-responsible-lawyer and its service authorization, focused regressions and isolated HTTP/DB acceptance. Resolve actor identity and staff linkage from the DB, preserve tenant/target/reason/no-op-conflict constraints and atomic clear-before-set plus success audit. Keep other ADMIN/F01/action-specific rights unchanged; no general PARTNER/MANAGER/delegate permission, approval redesign, lifecycle exception, schema/migration or live operation. | Direct owner approved decision-package 1–6 and then explicitly authorized bounded 2a implementation, focused tests, PR, required CI, exact-head merge and main verification. OWNER-AUTHORITY.txt SHA256 47a55af9d169e98c864538af71d4ad3803fcd6db102e03d3f31a849d573580e3; approved package R01 SHA256 fa117c3df2711f8e7881d4f937038e20d6bdd40306519032c74a9bc42b60899c. This is supplied-authority transcription, not agent ratification or a reusable grant. | Fresh single-row Decision Log and narrowly needed test-manifest writer turns must be coordinated; earlier closed turns are not reused. Preserve completed intake/1b/O-5, all F04_RACE WIP and existing cleanup residues. Source/CI delivery only; no general Office/Client or live acceptance. |",
    "evidenceSha": "26a7670ff5ed99070b43ec71dce41ecf05cea456",
    "expectedResultSha256": "f342f2753f4b2663bd0dd60096b21381b8c94dd4e13ecb4617d7012a9794d251"
  },
  "declaredTargetAllowlist": [
    "project/docs/governance/decision-log.md"
  ]
}
```
<!-- GOV_COORD_REQUEST_JSON_END -->
