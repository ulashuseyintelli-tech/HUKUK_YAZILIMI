# POA boundary — direct owner decision transcription request

Request only for existing hourglass step 10a. Product delivery 10b is separate; no live authority.

<!-- GOV_COORD_REQUEST_JSON_BEGIN -->
```json
{
  "schemaVersion": 1,
  "requestId": "GOV-REQ-20261022-POA-OK01-SA01",
  "requestFingerprint": "8750b4c8c4ce95c15cba4f5586d16c1a2584228eea8d19a2a3d42f2fb39d84f8",
  "requestedBy": "CODEX_LOCAL",
  "createdAt": "2026-10-21T21:35:55Z",
  "baseMainSha": "5a2e1c58a8237f2652c9e94e43c6acb995731269",
  "semanticAuthorityRef": {
    "kind": "SEMANTIC_AUTHORITY",
    "path": "project/docs/governance/decision-log.md",
    "recordId": "GOV-COORD-V2-T1-RATIFICATION",
    "evidenceSha": "5a2e1c58a8237f2652c9e94e43c6acb995731269"
  },
  "executionGrantRef": {
    "kind": "EXECUTION_GRANT",
    "path": "project/docs/governance/coordination-execution-grants/GOV-COORD-V1-CODEX-LOCAL.md",
    "recordId": "GOV-COORD-V1-CODEX-LOCAL",
    "evidenceSha": "5a2e1c58a8237f2652c9e94e43c6acb995731269"
  },
  "operation": {
    "type": "EXACT_APPEND_AT_DECLARED_ANCHOR",
    "changeClass": "LEVEL_2_MECHANICAL",
    "targetFile": "project/docs/governance/decision-log.md",
    "recordIdentity": "| Date | Decision | Scope | Source | Follow-up |",
    "anchor": "|---|---|---|---|---|",
    "expectedOldValue": "|---|---|---|---|---|",
    "newValue": "\n| 2026-10-22 | <!-- GOV-COORD-AUTHORITY kind=SEMANTIC_AUTHORITY recordId=CLIENT-POA-OK01-SA01 --> **OK-01 — OWNER APPROVED POA FILE FIELD WRITE AND DOWNLOAD BOUNDARY**: Record the direct owner decision for existing hourglass steps 10a/10b. POA create and duplicate enrichment reject client-supplied filePath, fileSize and mimeType with 400 POA_FIELD_NOT_WRITABLE; file data continues through the existing authorized upload path. Downloads use the existing tenant-scoped POA_UPLOADS containment result and retain the existing 404 rejection shape. | Narrowly supersedes CLIENT-P1-AUTHORITY-AND-IDENTITY-R01 D-4 only for create file fields. Existing actor thresholds, tenant checks, lifecycle, K9 capability rule and upload contract remain unchanged. Adjacent POA changes, field visibility redesign, migration and data repair are excluded. | Direct owner instruction to CODEX_LOCAL: “OK-01 / POA — MEVCUT İŞ PAYLAŞIMINDAKİ 10a VE 10b’Yİ TESLİM AL”; explicit commit, push, PR and conditional exact-head merge GO after narrow acceptance and mandatory checks/reviews, then main CI verification. Local owner transcription SHA256 3438fe375a73faae415a4b5656350a83985cf98a2ca7f3c1f04b800106d94bf3. This records owner authority; it is not agent ratification or reusable authority. | CODEX_LOCAL owns this existing narrow delivery; Office Ana Dosyası coordinates. Office prepares the separate intermediate release; this record grants no live operation. Preserve completed work, existing evidence, other writers and data. OK-02 remains a separate Office-owned product delivery; no decision about it is created here. |",
    "evidenceSha": "5a2e1c58a8237f2652c9e94e43c6acb995731269",
    "expectedResultSha256": "598fb726e09942ffd067e9384cc696da238c2f182af011c54e4a2f34e4ea3a21"
  },
  "declaredTargetAllowlist": [
    "project/docs/governance/decision-log.md"
  ]
}
```
<!-- GOV_COORD_REQUEST_JSON_END -->
