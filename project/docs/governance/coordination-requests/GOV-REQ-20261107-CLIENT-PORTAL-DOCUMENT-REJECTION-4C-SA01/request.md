# Client 4c — supplied owner safe document rejection boundary

Request-only. Fresh writer sequencing is required before the single Decision Log append; prior turns are closed. No protected target is modified here.

<!-- GOV_COORD_REQUEST_JSON_BEGIN -->
```json
{
  "schemaVersion": 1,
  "requestId": "GOV-REQ-20261107-CLIENT-PORTAL-DOCUMENT-REJECTION-4C-SA01",
  "requestFingerprint": "e7e965218258183bf345cfbbfcf98d67727820e6a145d8ec2c9fbd6900106965",
  "requestedBy": "CODEX_LOCAL",
  "createdAt": "2026-11-07T13:00:43Z",
  "baseMainSha": "7c2da339c64097352de367eab5f8d55105a73aad",
  "semanticAuthorityRef": {
    "kind": "SEMANTIC_AUTHORITY",
    "path": "project/docs/governance/decision-log.md",
    "recordId": "GOV-COORD-V2-T1-RATIFICATION",
    "evidenceSha": "7c2da339c64097352de367eab5f8d55105a73aad"
  },
  "executionGrantRef": {
    "kind": "EXECUTION_GRANT",
    "path": "project/docs/governance/coordination-execution-grants/GOV-COORD-V1-CODEX-LOCAL.md",
    "recordId": "GOV-COORD-V1-CODEX-LOCAL",
    "evidenceSha": "7c2da339c64097352de367eab5f8d55105a73aad"
  },
  "operation": {
    "type": "EXACT_APPEND_AT_DECLARED_ANCHOR",
    "changeClass": "LEVEL_2_MECHANICAL",
    "targetFile": "project/docs/governance/decision-log.md",
    "recordIdentity": "| Date | Decision | Scope | Source | Follow-up |",
    "anchor": "|---|---|---|---|---|",
    "expectedOldValue": "|---|---|---|---|---|",
    "newValue": "\n| 2026-11-07 | <!-- GOV-COORD-AUTHORITY kind=SEMANTIC_AUTHORITY recordId=CLIENT-PORTAL-DOCUMENT-REJECTION-4C-SA01 --> **CLIENT 4c — SUPPLIED OWNER CLIENT-SAFE DOCUMENT REJECTION:** Present a short external-user-appropriate document rejection reason. Internal notes, strategy and detailed internal review/audit reasons must not enter the portal notification body. Preserve internal review attribution and history. | Separate internal note from the explicit client-facing reason in the existing reject consumer. Add only nullable PortalNotification.clientRejectionReason and its additive migration; no backfill or historical row rewrite. Preserve the existing seven-key notification response with a safe rejection projection: legacy or unavailable external reasons use a fixed safe explanation, never raw old message or internal review text. Legacy note-only callers remain supported without disclosure. Keep review and notification atomic and preserve current tenant, VIEWER, action, document lifecycle and single-winner gates. | Owner approved package choices 1-6, then explicitly authorized the prepared 4c scope including additive schema/migration, focused tests, PR, required CI, exact-head merge and main verification without interim approval. OWNER-AUTHORITY.txt SHA256 5d3cad98ac6d399626756514cf7d92d57421ef23d0527c3de7ea80a25f9a5d98; approved package SHA256 fa117c3df2711f8e7881d4f937038e20d6bdd40306519032c74a9bc42b60899c. Supplied-owner transcription only, not agent ratification or a machine execution grant. | Fresh single-row writer coordination required; closed 4b and earlier turns are not reused. Extend existing selected specs where sufficient; no manifest writer turn is requested. Preserve completed work, O-5/F04_RACE WIP and all cleanup residues. No live migration/deployment/data access, historical cleanup, new review authority, 4d read semantics, notification taxonomy expansion, or general Office/Client acceptance. |",
    "evidenceSha": "7c2da339c64097352de367eab5f8d55105a73aad",
    "expectedResultSha256": "ad2ce4c65402ad26548a31b79e4a85f49fb60ae44220c622295771666e944542"
  },
  "declaredTargetAllowlist": [
    "project/docs/governance/decision-log.md"
  ]
}
```
<!-- GOV_COORD_REQUEST_JSON_END -->
