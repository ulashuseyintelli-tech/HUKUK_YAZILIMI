# D2 request

<!-- GOV_COORD_REQUEST_JSON_BEGIN -->
```json
{
  "schemaVersion": 1,
  "requestId": "GOV-REQ-20260807-PR-A-HOOK-REMEDIATION-IMPLEMENTATION-R02",
  "requestFingerprint": "f91516a67a184cc1914a350612223dd89535ae8bc7576a8631f9a28d205480e2",
  "requestedBy": "OWNER",
  "createdAt": "2026-08-08T00:00:00Z",
  "baseMainSha": "3e96ad105d0406f8c6e50ae8d70c416562dc3a43",
  "semanticAuthorityRef": {
    "kind": "SEMANTIC_AUTHORITY",
    "path": "project/docs/governance/decision-log.md",
    "recordId": "GOV-COORD-PR-A-HOOK-REMEDIATION-R01-SA01",
    "evidenceSha": "3e96ad105d0406f8c6e50ae8d70c416562dc3a43"
  },
  "executionGrantRef": {
    "kind": "EXECUTION_GRANT",
    "path": "project/docs/governance/coordination-execution-grants/GOV-COORD-PR-A-HOOK-REMEDIATION-R01-EG-IMPLEMENTATION-R02.md",
    "recordId": "GOV-COORD-PR-A-HOOK-REMEDIATION-R01-EG-IMPLEMENTATION-R02",
    "evidenceSha": "3e96ad105d0406f8c6e50ae8d70c416562dc3a43"
  },
  "operation": {
    "type": "EXACT_REGISTERED_CHANGESET",
    "changeClass": "LEVEL_2_MECHANICAL",
    "targetFile": ".github/workflows/ci.yml",
    "recordIdentity": "GOV-COORD-PR-A-HOOK-REMEDIATION-R01-IMPLEMENTATION-R02",
    "anchor": "8dfad9a1ee5c79994a58e211cbb8b079330b1137e1010190e7f6fba6bd6c6d9c",
    "expectedOldValue": "94ddb97578898882a59a3de1c756d5676b6cfe44",
    "newValue": "94ddb97578898882a59a3de1c756d5676b6cfe44",
    "evidenceSha": "3e96ad105d0406f8c6e50ae8d70c416562dc3a43",
    "expectedResultSha256": "c2795f20d126b153405a76e816b07df6b0223f3b33ec146bb551604bb564fcb4"
  },
  "declaredTargetAllowlist": [
    ".github/workflows/ci.yml",
    "project/scripts/install-pr-status-hook.cjs",
    "project/scripts/install-pr-status-hook.test.cjs",
    "project/scripts/pr-status-hook-adapter.cjs",
    "project/scripts/pr-status-hook-adapter.test.cjs",
    "project/scripts/pr-status-hook-launcher.cjs",
    "project/scripts/pr-status-hook-launcher.test.cjs"
  ]
}
```
<!-- GOV_COORD_REQUEST_JSON_END -->
