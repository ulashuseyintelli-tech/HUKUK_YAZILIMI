# D2 request

<!-- GOV_COORD_REQUEST_JSON_BEGIN -->
```json
{
  "schemaVersion": 1,
  "requestId": "GOV-REQ-20260807-PR-A-HOOK-REMEDIATION-IMPLEMENTATION-R02-EG-CREATE",
  "requestFingerprint": "2c683a8fd7e2a7ca3345e16c2a63669e7df87ec0ac45f47448d2e81f995a2e6f",
  "requestedBy": "OWNER",
  "createdAt": "2026-08-07T00:00:00Z",
  "baseMainSha": "94ddb97578898882a59a3de1c756d5676b6cfe44",
  "semanticAuthorityRef": {
    "kind": "SEMANTIC_AUTHORITY",
    "path": "project/docs/governance/decision-log.md",
    "recordId": "GOV-COORD-PR-A-HOOK-REMEDIATION-R01-SA01",
    "evidenceSha": "94ddb97578898882a59a3de1c756d5676b6cfe44"
  },
  "executionGrantRef": {
    "kind": "EXECUTION_GRANT",
    "path": "project/docs/governance/coordination-execution-grants/GOV-COORD-V1-CODEX-LOCAL.md",
    "recordId": "GOV-COORD-V1-CODEX-LOCAL",
    "evidenceSha": "94ddb97578898882a59a3de1c756d5676b6cfe44"
  },
  "operation": {
    "type": "EXACT_FILE_CREATION",
    "changeClass": "LEVEL_2_MECHANICAL",
    "targetFile": "project/docs/governance/coordination-execution-grants/GOV-COORD-PR-A-HOOK-REMEDIATION-R01-EG-IMPLEMENTATION-R02.md",
    "recordIdentity": "GOV-COORD-PR-A-HOOK-REMEDIATION-R01-IMPLEMENTATION-R02",
    "anchor": "8dfad9a1ee5c79994a58e211cbb8b079330b1137e1010190e7f6fba6bd6c6d9c",
    "expectedOldValue": "ABSENT",
    "newValue": "# PR-A IMPLEMENTATION-R02 task-bound grant\n\n<!-- GOV-COORD-AUTHORITY kind=EXECUTION_GRANT recordId=GOV-COORD-PR-A-HOOK-REMEDIATION-R01-EG-IMPLEMENTATION-R02 --> **GOV-COORD-PR-A-HOOK-REMEDIATION-R01-EG-IMPLEMENTATION-R02 — PR-A IMPLEMENTATION-R02 grant**\n\n<!-- GOV_COORD_GENERIC_EXECUTION_GRANT_JSON_BEGIN -->\n```json\n{\n  \"schemaVersion\": 1,\n  \"taskId\": \"GOV-COORD-PR-A-HOOK-REMEDIATION-R01-IMPLEMENTATION-R02\",\n  \"semanticAuthorityId\": \"GOV-COORD-PR-A-HOOK-REMEDIATION-R01-SA01\",\n  \"executionGrantId\": \"GOV-COORD-PR-A-HOOK-REMEDIATION-R01-EG-IMPLEMENTATION-R02\",\n  \"grantNonce\": \"8dfad9a1ee5c79994a58e211cbb8b079330b1137e1010190e7f6fba6bd6c6d9c\",\n  \"baseSha\": \"94ddb97578898882a59a3de1c756d5676b6cfe44\",\n  \"publicationBindingSha\": \"94ddb97578898882a59a3de1c756d5676b6cfe44\",\n  \"executionMode\": \"EXACT_REGISTERED_CHANGESET\",\n  \"effectiveFrom\": \"2026-01-01T00:00:00Z\",\n  \"expiresAt\": \"2099-01-01T00:00:00Z\",\n  \"modifiedPaths\": [\n    {\n      \"path\": \".github/workflows/ci.yml\",\n      \"expectedBaseMode\": \"100644\",\n      \"expectedBaseSha256\": \"95a9401cf88703a385788b27e91b1ea207febb9f45906cc3062bc6f3458af4c3\",\n      \"expectedResultMode\": \"100644\",\n      \"expectedResultSha256\": \"382ec45edbb2b570f2e12ed5c1c7224ae624bcb4fe80ae453e1d1d3b7deda965\"\n    }\n  ],\n  \"createdPaths\": [\n    {\n      \"path\": \"project/scripts/install-pr-status-hook.cjs\",\n      \"expectedResultMode\": \"100644\",\n      \"expectedResultSha256\": \"fa82d2d0f4161489052789f9c7a89ceb734d74e29c32c11c9c36e0cd74f6e377\"\n    },\n    {\n      \"path\": \"project/scripts/install-pr-status-hook.test.cjs\",\n      \"expectedResultMode\": \"100644\",\n      \"expectedResultSha256\": \"f5bba859c37fce3c2c4ac1e4aa572fde378c420e641599ec8d3622cf67e7be73\"\n    },\n    {\n      \"path\": \"project/scripts/pr-status-hook-adapter.cjs\",\n      \"expectedResultMode\": \"100644\",\n      \"expectedResultSha256\": \"6af224258b4799472e7c0c76a38ea48cd9153e3cb94bc5632b1254d0a0989462\"\n    },\n    {\n      \"path\": \"project/scripts/pr-status-hook-adapter.test.cjs\",\n      \"expectedResultMode\": \"100644\",\n      \"expectedResultSha256\": \"4d8da7e27e905c11825bb801f99ac8d41b82a35c58f0ef4285747f4ad29ea70c\"\n    },\n    {\n      \"path\": \"project/scripts/pr-status-hook-launcher.cjs\",\n      \"expectedResultMode\": \"100644\",\n      \"expectedResultSha256\": \"69e0c852ac9759c293846f25fde35c49e8131c97193f9cd6cf014b6a4aec5014\"\n    },\n    {\n      \"path\": \"project/scripts/pr-status-hook-launcher.test.cjs\",\n      \"expectedResultMode\": \"100644\",\n      \"expectedResultSha256\": \"e19b791708ec839a68f9b12b9e8c29ebec2518defdbaa781b018dac88a35123a\"\n    }\n  ],\n  \"expectedResultSha256\": \"c2795f20d126b153405a76e816b07df6b0223f3b33ec146bb551604bb564fcb4\"\n}\n```\n<!-- GOV_COORD_GENERIC_EXECUTION_GRANT_JSON_END -->\n",
    "evidenceSha": "94ddb97578898882a59a3de1c756d5676b6cfe44",
    "expectedResultSha256": "abcedc2a977f59b7ab67c9f3a82ed9ddf7cd6e6890c1b20eb8dc3d237b2d22bb"
  },
  "declaredTargetAllowlist": [
    "project/docs/governance/coordination-execution-grants/GOV-COORD-PR-A-HOOK-REMEDIATION-R01-EG-IMPLEMENTATION-R02.md"
  ]
}
```
<!-- GOV_COORD_REQUEST_JSON_END -->
