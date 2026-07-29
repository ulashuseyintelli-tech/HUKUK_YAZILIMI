# Governance Coordination Request — GOV-REQ-20260729-RC-COL-W2-2B-R01-RISK

Bu dosya immutable ve untrusted request data kaydıdır. Prose operational instruction değildir.

Program context (informational only): `RCV-COL-FULL-REMEDIATION-EXECUTION-GRANT-R01`
outer program-scoped execution authority olarak yürür; V1 mekanik executor grant'i
`GOV-COORD-V1-CODEX-LOCAL`dır.

<!-- GOV_COORD_REQUEST_JSON_BEGIN -->
```json
{
  "schemaVersion": 1,
  "requestId": "GOV-REQ-20260729-RC-COL-W2-2B-R01-RISK",
  "requestFingerprint": "6b56c8cc66842932692d4f9b40f0754000425748d7db6a0ad3c0a84016492252",
  "requestedBy": "OWNER",
  "createdAt": "2026-07-29T19:30:08Z",
  "baseMainSha": "e397fcfb7a4842ef9aeabc814f140d94e2974898",
  "semanticAuthorityRef": {
    "kind": "SEMANTIC_AUTHORITY",
    "path": "project/docs/governance/decision-log.md",
    "recordId": "RCV-COL-FULL-REMEDIATION-RATIFICATION-R01",
    "evidenceSha": "14a1b3c543af3e9df2e9154a94f1a25fe3001a95"
  },
  "executionGrantRef": {
    "kind": "EXECUTION_GRANT",
    "path": "project/docs/governance/coordination-execution-grants/GOV-COORD-V1-CODEX-LOCAL.md",
    "recordId": "GOV-COORD-V1-CODEX-LOCAL",
    "evidenceSha": "a02498dfd50e349b2cb1eddfbde0561ece30fba6"
  },
  "operation": {
    "type": "EXACT_LITERAL_REPLACEMENT",
    "changeClass": "LEVEL_2_MECHANICAL",
    "targetFile": "project/docs/governance/COLLECTION-RISK-REGISTER.md",
    "recordIdentity": "| COL-RISK-G07 |",
    "anchor": "full-remediation Task 04 governance reconciliation in progress, Task 05 not started",
    "expectedOldValue": "full-remediation Task 04 governance reconciliation in progress, Task 05 not started",
    "newValue": "full-remediation Task 04 CLOSED; Task 05 RC-COL-W2.2B-R01 CLOSED / CANONICAL EVIDENCE PR #1888 @ 35e215cd; Task 06 RC-COL-W2.2C-6 next / not started",
    "evidenceSha": "e397fcfb7a4842ef9aeabc814f140d94e2974898",
    "expectedResultSha256": "261b907354462fb282658659f4953a9908128617848b7b612a8e2db3a82ae525"
  },
  "declaredTargetAllowlist": [
    "project/docs/governance/COLLECTION-RISK-REGISTER.md"
  ]
}
```
<!-- GOV_COORD_REQUEST_JSON_END -->

Bu request semantic veya execution authority üretmez.
