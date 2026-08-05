# D2 request

<!-- GOV_COORD_REQUEST_JSON_BEGIN -->
```json
{
  "schemaVersion": 1,
  "requestId": "GOV-REQ-20260805-MERGE-FLOW-STAGE-E-GHGUARD-DIAGNOSTIC-EG-CREATE",
  "requestFingerprint": "1a13b13014ae55a222764307580c50d77ec2a5dbc5917ba2966ad27c41b52d2e",
  "requestedBy": "OWNER",
  "createdAt": "2026-08-05T00:00:00Z",
  "baseMainSha": "ba1a6b6cbc3a130fec5d1ea43d9a66b3a1083448",
  "semanticAuthorityRef": {
    "kind": "SEMANTIC_AUTHORITY",
    "path": "project/docs/governance/decision-log.md",
    "recordId": "GOV-COORD-STAGE-E-GHGUARD-DIAGNOSTIC-R01-SA01",
    "evidenceSha": "ba1a6b6cbc3a130fec5d1ea43d9a66b3a1083448"
  },
  "executionGrantRef": {
    "kind": "EXECUTION_GRANT",
    "path": "project/docs/governance/coordination-execution-grants/GOV-COORD-V1-CODEX-LOCAL.md",
    "recordId": "GOV-COORD-V1-CODEX-LOCAL",
    "evidenceSha": "ba1a6b6cbc3a130fec5d1ea43d9a66b3a1083448"
  },
  "operation": {
    "type": "EXACT_FILE_CREATION",
    "changeClass": "LEVEL_2_MECHANICAL",
    "targetFile": "project/docs/governance/coordination-execution-grants/GOV-COORD-STAGE-E-GHGUARD-DIAGNOSTIC-R01-EG01.md",
    "recordIdentity": "GOV-COORD-STAGE-E-GHGUARD-DIAGNOSTIC-R01",
    "anchor": "1c4ae82eaf6fc9683541fa090c66b0fea4f9265cb08ee551b85ed56c36bcfc99",
    "expectedOldValue": "ABSENT",
    "newValue": "# Stage-E task-bound grant\n\n<!-- GOV-COORD-AUTHORITY kind=EXECUTION_GRANT recordId=GOV-COORD-STAGE-E-GHGUARD-DIAGNOSTIC-R01-EG01 --> **GOV-COORD-STAGE-E-GHGUARD-DIAGNOSTIC-R01-EG01 — Stage-E grant**\n\n<!-- GOV_COORD_GENERIC_EXECUTION_GRANT_JSON_BEGIN -->\n```json\n{\n  \"schemaVersion\": 1,\n  \"taskId\": \"GOV-COORD-STAGE-E-GHGUARD-DIAGNOSTIC-R01\",\n  \"semanticAuthorityId\": \"GOV-COORD-STAGE-E-GHGUARD-DIAGNOSTIC-R01-SA01\",\n  \"executionGrantId\": \"GOV-COORD-STAGE-E-GHGUARD-DIAGNOSTIC-R01-EG01\",\n  \"grantNonce\": \"1c4ae82eaf6fc9683541fa090c66b0fea4f9265cb08ee551b85ed56c36bcfc99\",\n  \"baseSha\": \"ba1a6b6cbc3a130fec5d1ea43d9a66b3a1083448\",\n  \"publicationBindingSha\": \"ba1a6b6cbc3a130fec5d1ea43d9a66b3a1083448\",\n  \"executionMode\": \"EXACT_REGISTERED_CHANGESET\",\n  \"effectiveFrom\": \"2026-01-01T00:00:00Z\",\n  \"expiresAt\": \"2099-01-01T00:00:00Z\",\n  \"modifiedPaths\": [\n    {\n      \"path\": \".github/workflows/ci.yml\",\n      \"expectedBaseMode\": \"100644\",\n      \"expectedBaseSha256\": \"da948ee8fa1f585d3493a3e44596adf6a29bd331aaa3fb29c5382be848f77089\",\n      \"expectedResultMode\": \"100644\",\n      \"expectedResultSha256\": \"95a9401cf88703a385788b27e91b1ea207febb9f45906cc3062bc6f3458af4c3\"\n    }\n  ],\n  \"createdPaths\": [\n    {\n      \"path\": \"project/scripts/gh-guard-readonly.ps1\",\n      \"expectedResultMode\": \"100644\",\n      \"expectedResultSha256\": \"44cb352d03f33088491f1d728cbad9399cf5f93185f38be1b014374cb8400e2b\"\n    },\n    {\n      \"path\": \"project/scripts/gh-guard-readonly.test.cjs\",\n      \"expectedResultMode\": \"100644\",\n      \"expectedResultSha256\": \"d538fb4b2722bbf850403d550bd026a71eca0836ec5aaee4794773c35dedff5c\"\n    }\n  ],\n  \"expectedResultSha256\": \"5c07e978c1732d3d61d3ddd0d0c27e0679f4b0467fcfeb161edf14e29edf0ed8\"\n}\n```\n<!-- GOV_COORD_GENERIC_EXECUTION_GRANT_JSON_END -->\n",
    "evidenceSha": "ba1a6b6cbc3a130fec5d1ea43d9a66b3a1083448",
    "expectedResultSha256": "c0013db658e03a0eface504a45d82a2b3f95647b67312b60d1a7f2152256da39"
  },
  "declaredTargetAllowlist": [
    "project/docs/governance/coordination-execution-grants/GOV-COORD-STAGE-E-GHGUARD-DIAGNOSTIC-R01-EG01.md"
  ]
}
```
<!-- GOV_COORD_REQUEST_JSON_END -->
