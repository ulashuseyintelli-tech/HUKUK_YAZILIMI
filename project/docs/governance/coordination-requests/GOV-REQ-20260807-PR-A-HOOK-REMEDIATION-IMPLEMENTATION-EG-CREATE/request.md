# D2 request

<!-- GOV_COORD_REQUEST_JSON_BEGIN -->
```json
{
  "schemaVersion": 1,
  "requestId": "GOV-REQ-20260807-PR-A-HOOK-REMEDIATION-IMPLEMENTATION-EG-CREATE",
  "requestFingerprint": "212ce28042e4fc126c73c8564f304f189042f5ebfa17963422035693b970e5ad",
  "requestedBy": "OWNER",
  "createdAt": "2026-08-07T00:00:00Z",
  "baseMainSha": "93ee8fe0f58d4e84e4d2cf0e9f62ada5196e78bc",
  "semanticAuthorityRef": {
    "kind": "SEMANTIC_AUTHORITY",
    "path": "project/docs/governance/decision-log.md",
    "recordId": "GOV-COORD-PR-A-HOOK-REMEDIATION-R01-SA01",
    "evidenceSha": "93ee8fe0f58d4e84e4d2cf0e9f62ada5196e78bc"
  },
  "executionGrantRef": {
    "kind": "EXECUTION_GRANT",
    "path": "project/docs/governance/coordination-execution-grants/GOV-COORD-V1-CODEX-LOCAL.md",
    "recordId": "GOV-COORD-V1-CODEX-LOCAL",
    "evidenceSha": "93ee8fe0f58d4e84e4d2cf0e9f62ada5196e78bc"
  },
  "operation": {
    "type": "EXACT_FILE_CREATION",
    "changeClass": "LEVEL_2_MECHANICAL",
    "targetFile": "project/docs/governance/coordination-execution-grants/GOV-COORD-PR-A-HOOK-REMEDIATION-R01-EG-IMPLEMENTATION.md",
    "recordIdentity": "GOV-COORD-PR-A-HOOK-REMEDIATION-R01-IMPLEMENTATION",
    "anchor": "f27eca8065916c68ab97958351a4c159d3998f7559cc940d5c5c418c3915ea73",
    "expectedOldValue": "ABSENT",
    "newValue": "# PR-A IMPLEMENTATION task-bound grant\n\n<!-- GOV-COORD-AUTHORITY kind=EXECUTION_GRANT recordId=GOV-COORD-PR-A-HOOK-REMEDIATION-R01-EG-IMPLEMENTATION --> **GOV-COORD-PR-A-HOOK-REMEDIATION-R01-EG-IMPLEMENTATION — PR-A IMPLEMENTATION grant**\n\n<!-- GOV_COORD_GENERIC_EXECUTION_GRANT_JSON_BEGIN -->\n```json\n{\n  \"schemaVersion\": 1,\n  \"taskId\": \"GOV-COORD-PR-A-HOOK-REMEDIATION-R01-IMPLEMENTATION\",\n  \"semanticAuthorityId\": \"GOV-COORD-PR-A-HOOK-REMEDIATION-R01-SA01\",\n  \"executionGrantId\": \"GOV-COORD-PR-A-HOOK-REMEDIATION-R01-EG-IMPLEMENTATION\",\n  \"grantNonce\": \"f27eca8065916c68ab97958351a4c159d3998f7559cc940d5c5c418c3915ea73\",\n  \"baseSha\": \"93ee8fe0f58d4e84e4d2cf0e9f62ada5196e78bc\",\n  \"publicationBindingSha\": \"93ee8fe0f58d4e84e4d2cf0e9f62ada5196e78bc\",\n  \"executionMode\": \"EXACT_REGISTERED_CHANGESET\",\n  \"effectiveFrom\": \"2026-01-01T00:00:00Z\",\n  \"expiresAt\": \"2099-01-01T00:00:00Z\",\n  \"modifiedPaths\": [\n    {\n      \"path\": \".github/workflows/ci.yml\",\n      \"expectedBaseMode\": \"100644\",\n      \"expectedBaseSha256\": \"95a9401cf88703a385788b27e91b1ea207febb9f45906cc3062bc6f3458af4c3\",\n      \"expectedResultMode\": \"100644\",\n      \"expectedResultSha256\": \"382ec45edbb2b570f2e12ed5c1c7224ae624bcb4fe80ae453e1d1d3b7deda965\"\n    }\n  ],\n  \"createdPaths\": [\n    {\n      \"path\": \"project/scripts/install-pr-status-hook.cjs\",\n      \"expectedResultMode\": \"100644\",\n      \"expectedResultSha256\": \"fa82d2d0f4161489052789f9c7a89ceb734d74e29c32c11c9c36e0cd74f6e377\"\n    },\n    {\n      \"path\": \"project/scripts/install-pr-status-hook.test.cjs\",\n      \"expectedResultMode\": \"100644\",\n      \"expectedResultSha256\": \"47c4c4cc03d440686d68c3cd4914a2af3db942f3ed7c26a37698bf6d50e8abbd\"\n    },\n    {\n      \"path\": \"project/scripts/pr-status-hook-adapter.cjs\",\n      \"expectedResultMode\": \"100644\",\n      \"expectedResultSha256\": \"6af224258b4799472e7c0c76a38ea48cd9153e3cb94bc5632b1254d0a0989462\"\n    },\n    {\n      \"path\": \"project/scripts/pr-status-hook-adapter.test.cjs\",\n      \"expectedResultMode\": \"100644\",\n      \"expectedResultSha256\": \"4d8da7e27e905c11825bb801f99ac8d41b82a35c58f0ef4285747f4ad29ea70c\"\n    },\n    {\n      \"path\": \"project/scripts/pr-status-hook-launcher.cjs\",\n      \"expectedResultMode\": \"100644\",\n      \"expectedResultSha256\": \"69e0c852ac9759c293846f25fde35c49e8131c97193f9cd6cf014b6a4aec5014\"\n    },\n    {\n      \"path\": \"project/scripts/pr-status-hook-launcher.test.cjs\",\n      \"expectedResultMode\": \"100644\",\n      \"expectedResultSha256\": \"e19b791708ec839a68f9b12b9e8c29ebec2518defdbaa781b018dac88a35123a\"\n    }\n  ],\n  \"expectedResultSha256\": \"a3dcee9b23b59292f0181a69283b99aef8e0b41b2f3665af5e778ff4f9e43c5f\"\n}\n```\n<!-- GOV_COORD_GENERIC_EXECUTION_GRANT_JSON_END -->\n",
    "evidenceSha": "93ee8fe0f58d4e84e4d2cf0e9f62ada5196e78bc",
    "expectedResultSha256": "1ad8b66035de39458ffd1fd77b8cd86178f309bd8310b716356221f0b5a299a7"
  },
  "declaredTargetAllowlist": [
    "project/docs/governance/coordination-execution-grants/GOV-COORD-PR-A-HOOK-REMEDIATION-R01-EG-IMPLEMENTATION.md"
  ]
}
```
<!-- GOV_COORD_REQUEST_JSON_END -->
