# D2 request

<!-- GOV_COORD_REQUEST_JSON_BEGIN -->
```json
{
  "schemaVersion": 1,
  "requestId": "GOV-REQ-20260805-MERGE-FLOW-STAGE-E-GHGUARD-DIAGNOSTIC",
  "requestFingerprint": "2b01ef3b46efea1138448f9c335f54c9807d06551d2f1586bfdc8ad690eedca8",
  "requestedBy": "OWNER",
  "createdAt": "2026-08-05T00:00:00Z",
  "baseMainSha": "d5a2ec6467f3c698fed23c6e73126c08acd16465",
  "semanticAuthorityRef": {
    "kind": "SEMANTIC_AUTHORITY",
    "path": "project/docs/governance/decision-log.md",
    "recordId": "GOV-COORD-STAGE-E-GHGUARD-DIAGNOSTIC-R01-SA01",
    "evidenceSha": "d5a2ec6467f3c698fed23c6e73126c08acd16465"
  },
  "executionGrantRef": {
    "kind": "EXECUTION_GRANT",
    "path": "project/docs/governance/coordination-execution-grants/GOV-COORD-STAGE-E-GHGUARD-DIAGNOSTIC-R01-EG01.md",
    "recordId": "GOV-COORD-STAGE-E-GHGUARD-DIAGNOSTIC-R01-EG01",
    "evidenceSha": "d5a2ec6467f3c698fed23c6e73126c08acd16465"
  },
  "operation": {
    "type": "EXACT_REGISTERED_CHANGESET",
    "changeClass": "LEVEL_2_MECHANICAL",
    "targetFile": ".github/workflows/ci.yml",
    "recordIdentity": "GOV-COORD-STAGE-E-GHGUARD-DIAGNOSTIC-R01",
    "anchor": "1c4ae82eaf6fc9683541fa090c66b0fea4f9265cb08ee551b85ed56c36bcfc99",
    "expectedOldValue": "ba1a6b6cbc3a130fec5d1ea43d9a66b3a1083448",
    "newValue": "ba1a6b6cbc3a130fec5d1ea43d9a66b3a1083448",
    "evidenceSha": "d5a2ec6467f3c698fed23c6e73126c08acd16465",
    "expectedResultSha256": "5c07e978c1732d3d61d3ddd0d0c27e0679f4b0467fcfeb161edf14e29edf0ed8"
  },
  "declaredTargetAllowlist": [
    ".github/workflows/ci.yml",
    "project/scripts/gh-guard-readonly.ps1",
    "project/scripts/gh-guard-readonly.test.cjs"
  ]
}
```
<!-- GOV_COORD_REQUEST_JSON_END -->
