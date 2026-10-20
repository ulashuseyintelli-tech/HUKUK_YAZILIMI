# K16 O-4 — owner decision transcription request

Request only. Product delivery is separate. Fresh single-row writer sequencing is required; no prior CLIENT turn is reused.

<!-- GOV_COORD_REQUEST_JSON_BEGIN -->
```json
{
  "schemaVersion": 1,
  "requestId": "GOV-REQ-20261020-K16-O4-SA01",
  "requestFingerprint": "1a5fd165c0fe7ace0a8e6ae18d188ae91c80ac35f186bc65891701573b529bd6",
  "requestedBy": "CODEX_LOCAL",
  "createdAt": "2026-10-20T18:23:29Z",
  "baseMainSha": "5da5793776b4480aff2a10368acae39c01e248ff",
  "semanticAuthorityRef": {
    "kind": "SEMANTIC_AUTHORITY",
    "path": "project/docs/governance/decision-log.md",
    "recordId": "GOV-COORD-V2-T1-RATIFICATION",
    "evidenceSha": "5da5793776b4480aff2a10368acae39c01e248ff"
  },
  "executionGrantRef": {
    "kind": "EXECUTION_GRANT",
    "path": "project/docs/governance/coordination-execution-grants/GOV-COORD-V1-CODEX-LOCAL.md",
    "recordId": "GOV-COORD-V1-CODEX-LOCAL",
    "evidenceSha": "5da5793776b4480aff2a10368acae39c01e248ff"
  },
  "operation": {
    "type": "EXACT_APPEND_AT_DECLARED_ANCHOR",
    "changeClass": "LEVEL_2_MECHANICAL",
    "targetFile": "project/docs/governance/decision-log.md",
    "recordIdentity": "| Date | Decision | Scope | Source | Follow-up |",
    "anchor": "|---|---|---|---|---|",
    "expectedOldValue": "|---|---|---|---|---|",
    "newValue": "\n| 2026-10-20 | <!-- GOV-COORD-AUTHORITY kind=SEMANTIC_AUTHORITY recordId=OFFICE-CLIENT-K16-O4-SA01 --> **K16 O-4 / DV-200 — OWNER APPROVED HISTORY IBAN MASKING**: Mask every TR IBAN-shaped string (compact or whitespace-separated) in body and metadata.tokens.officeIban in the two client/case notification-history read responses, using existing maskIban first-four/last-four formatting. | Read projection only for all already-authorized content readers; preserve K17 actor/object authorization, restricted status-only fields, array response, X-Next-Cursor, ordering and limits. Stored notification content, metadata, payment e-mails and actual sending remain unchanged. Preserve completed #2963, K17, #2991 and #2993; no new unmask privilege. | Owner approved choices 1–4 and explicitly selected only O-4 for the next bounded PR/required-CI/exact-head merge/main-verification delivery in CODEX_LOCAL on 2026-10-20. OWNER-GO.txt SHA256 8a19d74eaa43775376ff6139fdb32056bd35966f67da85842e1bc386c31f8912; transcription of owner authority, not agent ratification or reusable grant. | Choices 2–4 are approved but outside this implementation. Fresh single-row writer coordination required; closed prior turns cannot be reused. No live operation, provider request, migration, stored-data rewriting or OFFICE/H-service final claim. |",
    "evidenceSha": "5da5793776b4480aff2a10368acae39c01e248ff",
    "expectedResultSha256": "3a8c9b5df3ed255fd952a9d3746f05b1c49445aa36ceeb4f550b23a8e28445f1"
  },
  "declaredTargetAllowlist": [
    "project/docs/governance/decision-log.md"
  ]
}
```
<!-- GOV_COORD_REQUEST_JSON_END -->
