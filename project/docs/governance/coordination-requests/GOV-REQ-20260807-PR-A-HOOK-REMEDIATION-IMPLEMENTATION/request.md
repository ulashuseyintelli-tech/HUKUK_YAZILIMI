# D2 request

<!-- GOV_COORD_REQUEST_JSON_BEGIN -->
```json
{
  "schemaVersion": 1,
  "requestId": "GOV-REQ-20260807-PR-A-HOOK-REMEDIATION-IMPLEMENTATION",
  "requestFingerprint": "eb9d619e700a7445abf40740532eee80dcce8f9093582ba791928d4ceffeabcc",
  "requestedBy": "OWNER",
  "createdAt": "2026-08-07T00:00:00Z",
  "baseMainSha": "b26a67b3729a1858677f19e9be6ec50bf3f78b14",
  "semanticAuthorityRef": {
    "kind": "SEMANTIC_AUTHORITY",
    "path": "project/docs/governance/decision-log.md",
    "recordId": "GOV-COORD-PR-A-HOOK-REMEDIATION-R01-SA01",
    "evidenceSha": "b26a67b3729a1858677f19e9be6ec50bf3f78b14"
  },
  "executionGrantRef": {
    "kind": "EXECUTION_GRANT",
    "path": "project/docs/governance/coordination-execution-grants/GOV-COORD-PR-A-HOOK-REMEDIATION-R01-EG-IMPLEMENTATION.md",
    "recordId": "GOV-COORD-PR-A-HOOK-REMEDIATION-R01-EG-IMPLEMENTATION",
    "evidenceSha": "b26a67b3729a1858677f19e9be6ec50bf3f78b14"
  },
  "operation": {
    "type": "EXACT_REGISTERED_CHANGESET",
    "changeClass": "LEVEL_2_MECHANICAL",
    "targetFile": ".github/workflows/ci.yml",
    "recordIdentity": "GOV-COORD-PR-A-HOOK-REMEDIATION-R01-IMPLEMENTATION",
    "anchor": "f27eca8065916c68ab97958351a4c159d3998f7559cc940d5c5c418c3915ea73",
    "expectedOldValue": "93ee8fe0f58d4e84e4d2cf0e9f62ada5196e78bc",
    "newValue": "93ee8fe0f58d4e84e4d2cf0e9f62ada5196e78bc",
    "evidenceSha": "b26a67b3729a1858677f19e9be6ec50bf3f78b14",
    "expectedResultSha256": "a3dcee9b23b59292f0181a69283b99aef8e0b41b2f3665af5e778ff4f9e43c5f"
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
