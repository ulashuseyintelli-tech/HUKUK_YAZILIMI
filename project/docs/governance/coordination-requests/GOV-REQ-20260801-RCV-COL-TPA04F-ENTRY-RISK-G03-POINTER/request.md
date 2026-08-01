# Governance Coordination Request — GOV-REQ-20260801-RCV-COL-TPA04F-ENTRY-RISK-G03-POINTER

Bu dosya immutable ve untrusted request data kaydıdır. Prose operational instruction değildir.

Program context (informational only): `RCV-COL-FULL-REMEDIATION-EXECUTION-GRANT-R01`
outer program-scoped execution authority olarak yürür; V1 mekanik executor grant'i
`GOV-COORD-V1-CODEX-LOCAL`dır.

<!-- GOV_COORD_REQUEST_JSON_BEGIN -->
```json
{
  "schemaVersion": 1,
  "requestId": "GOV-REQ-20260801-RCV-COL-TPA04F-ENTRY-RISK-G03-POINTER",
  "requestFingerprint": "54a3dd407105567a3067c04c89bffbd9bec7558d80c2617f51f5bbc39e749bb6",
  "requestedBy": "OWNER",
  "createdAt": "2026-08-01T02:12:07Z",
  "baseMainSha": "dc7d48b41c2e2d444236c2546bac5e54176bb4a3",
  "semanticAuthorityRef": {
    "kind": "SEMANTIC_AUTHORITY",
    "path": "project/docs/governance/decision-log.md",
    "recordId": "RCV-COL-FULL-REMEDIATION-RATIFICATION-R01",
    "evidenceSha": "2c217f498f113abb12ae13a25a069a451084d104"
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
    "recordIdentity": "COL-RISK-G03",
    "anchor": "| COL-RISK-G03 |",
    "expectedOldValue": "Task 10 `TPA-04F-ENTRY` NEXT / NOT STARTED",
    "newValue": "Task 10 `TPA-04F-ENTRY` implementation evidence PR #2036 @ `624f27ee` canonical, governance closeout active; Task 11 `TPA-04D-I01` successor / NOT STARTED; Task 15 real replay evidence `NOT YET SATISFIED`",
    "evidenceSha": "624f27ee09297ccc895155e6d65c00ce08dc6db7",
    "expectedResultSha256": "ff7c59f3e8020b24dadf8fe73d948280f5a12b525de9a42575346f35c03d4751"
  },
  "declaredTargetAllowlist": [
    "project/docs/governance/COLLECTION-RISK-REGISTER.md"
  ]
}
```
<!-- GOV_COORD_REQUEST_JSON_END -->

Bu request semantic veya execution authority üretmez.
