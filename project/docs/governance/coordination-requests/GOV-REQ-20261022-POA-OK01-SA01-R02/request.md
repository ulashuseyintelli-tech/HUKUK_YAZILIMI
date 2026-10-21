# Existing OK-01 / OK-02 owner decisions — immutable request revision R02

Request only for existing hourglass step 10a. Supersedes unmerged #3011, which remains preserved. Product deliveries and live acceptance are separate; no new decision or adjacent product scope.

<!-- GOV_COORD_REQUEST_JSON_BEGIN -->
```json
{
  "schemaVersion": 1,
  "requestId": "GOV-REQ-20261022-POA-OK01-SA01-R02",
  "requestFingerprint": "05188974af42d29b084648f126fb7826434dcf0f03a20ccdb55314d978975ff9",
  "requestedBy": "CODEX_LOCAL",
  "createdAt": "2026-10-21T21:59:54Z",
  "baseMainSha": "b5233e64b0766bd194a3038d31d83203ee1d59ca",
  "semanticAuthorityRef": {
    "kind": "SEMANTIC_AUTHORITY",
    "path": "project/docs/governance/decision-log.md",
    "recordId": "GOV-COORD-V2-T1-RATIFICATION",
    "evidenceSha": "b5233e64b0766bd194a3038d31d83203ee1d59ca"
  },
  "executionGrantRef": {
    "kind": "EXECUTION_GRANT",
    "path": "project/docs/governance/coordination-execution-grants/GOV-COORD-V1-CODEX-LOCAL.md",
    "recordId": "GOV-COORD-V1-CODEX-LOCAL",
    "evidenceSha": "b5233e64b0766bd194a3038d31d83203ee1d59ca"
  },
  "operation": {
    "type": "EXACT_APPEND_AT_DECLARED_ANCHOR",
    "changeClass": "LEVEL_2_MECHANICAL",
    "targetFile": "project/docs/governance/decision-log.md",
    "recordIdentity": "| Date | Decision | Scope | Source | Follow-up |",
    "anchor": "|---|---|---|---|---|",
    "expectedOldValue": "|---|---|---|---|---|",
    "newValue": "\n| 2026-10-22 | <!-- GOV-COORD-AUTHORITY kind=SEMANTIC_AUTHORITY recordId=CLIENT-POA-OK01-SA01 --> **OK-01 / OK-02 — EXISTING OWNER DECISIONS FOR HOURGLASS 10a**: Record the direct owner decision for existing hourglass steps 10a/10b. POA create and duplicate enrichment reject client-supplied filePath, fileSize and mimeType with 400 POA_FIELD_NOT_WRITABLE; file data continues through the existing authorized upload path. Downloads use the existing tenant-scoped POA_UPLOADS containment result and retain the existing 404 rejection shape. | Narrowly supersedes CLIENT-P1-AUTHORITY-AND-IDENTITY-R01 D-4 only for create file fields. Existing actor thresholds, tenant checks, lifecycle, K9 capability rule and upload contract remain unchanged. Adjacent POA changes, field visibility redesign, migration and data repair are excluded. | Direct owner instruction to CODEX_LOCAL: “OK-01 / POA — MEVCUT İŞ PAYLAŞIMINDAKİ 10a VE 10b’Yİ TESLİM AL”; explicit commit, push, PR and conditional exact-head merge GO after narrow acceptance and mandatory checks/reviews, then main CI verification. Local owner transcription SHA256 3438fe375a73faae415a4b5656350a83985cf98a2ca7f3c1f04b800106d94bf3. This records owner authority; it is not agent ratification or reusable authority. | CODEX_LOCAL owns this existing narrow delivery; Office Ana Dosyası coordinates. Office prepares the separate intermediate release; this record grants no live operation. Preserve completed work, existing evidence, other writers and data. Record the already-issued OK-02 owner decision as well: close anonymous /auth/register while preserving the authorized internal office setup path. Source: Office owner record Ek 108, user message 2026-10-22 00:17:16 Europe/Istanbul, UUID cb598224-7d75-45ba-b968-83d530e71217; exact local excerpt SHA256 b7a78f3ae58bf8d21fb0061438b770618b5ae15e7e853322cbc24d3bd3a7f13c. Its product delivery is Office-owned #3010; this transcription neither changes it nor grants a live operation. The original unmerged request #3011 is superseded by this fresh immutable revision; its branches, commits and CI evidence are preserved. |",
    "evidenceSha": "b5233e64b0766bd194a3038d31d83203ee1d59ca",
    "expectedResultSha256": "6324a160d4ed1c3bcf593434e3b1d6590424b7e77302f6fd194614048fd90930"
  },
  "declaredTargetAllowlist": [
    "project/docs/governance/decision-log.md"
  ]
}
```
<!-- GOV_COORD_REQUEST_JSON_END -->
