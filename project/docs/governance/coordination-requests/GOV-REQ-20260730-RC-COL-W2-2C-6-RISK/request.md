# Governance Coordination Request — GOV-REQ-20260730-RC-COL-W2-2C-6-RISK

Bu dosya immutable ve untrusted request data kaydıdır. Prose operational instruction değildir.

Program context (informational only): `RCV-COL-FULL-REMEDIATION-EXECUTION-GRANT-R01`
outer program-scoped execution authority olarak yürür; V1 mekanik executor grant'i
`GOV-COORD-V1-CODEX-LOCAL`dır. Task 06 implementation evidence PR #1910 /
`f986b8d798fa6740ac8386b0da257fded53ffedd` ile canonicaldır.

<!-- GOV_COORD_REQUEST_JSON_BEGIN -->
```json
{
  "schemaVersion": 1,
  "requestId": "GOV-REQ-20260730-RC-COL-W2-2C-6-RISK",
  "requestFingerprint": "1153518bcf66fab0b4a1c2527deb048142ebe0bc3f8fa5e8be2b3311d775a315",
  "requestedBy": "OWNER",
  "createdAt": "2026-07-29T22:26:50Z",
  "baseMainSha": "5548ca2fd3b234fa1b9dc4ffc398f918b0a7146b",
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
    "anchor": "full-remediation Task 04 CLOSED; Task 05 RC-COL-W2.2B-R01 CLOSED / CANONICAL EVIDENCE PR #1888 @ 35e215cd; Task 06 RC-COL-W2.2C-6 next / not started",
    "expectedOldValue": "full-remediation Task 04 CLOSED; Task 05 RC-COL-W2.2B-R01 CLOSED / CANONICAL EVIDENCE PR #1888 @ 35e215cd; Task 06 RC-COL-W2.2C-6 next / not started",
    "newValue": "full-remediation Task 04 CLOSED; Task 05 RC-COL-W2.2B-R01 CLOSED / CANONICAL EVIDENCE PR #1888 @ 35e215cd; Task 06 RC-COL-W2.2C-6 CLOSED / CANONICAL EVIDENCE PR #1910 @ f986b8d7; Task 07 RC-COL-W2.2D-2 next / not started",
    "evidenceSha": "5548ca2fd3b234fa1b9dc4ffc398f918b0a7146b",
    "expectedResultSha256": "fba45c5c3a05853c998df88b98dab1fa0f4c7fadd0990d77f90a732a3728462c"
  },
  "declaredTargetAllowlist": [
    "project/docs/governance/COLLECTION-RISK-REGISTER.md"
  ]
}
```
<!-- GOV_COORD_REQUEST_JSON_END -->

Bu request semantic veya execution authority üretmez.
