# OFFICE #2737 S2 — eg request

<!-- GOV_COORD_REQUEST_JSON_BEGIN -->
```json
{
  "schemaVersion": 1,
  "requestId": "GOV-REQ-20260922-OFFICE-2737-S2-EG-CREATE",
  "requestFingerprint": "47902a579feb954798aaeadf6a3091f6c64c54a10b59907e2e14b5cdfaef0d27",
  "requestedBy": "CODEX_LOCAL",
  "createdAt": "2026-09-22T16:32:07Z",
  "baseMainSha": "07d2fe92b06891f45b34abc2fc09d7d04ed1c0b9",
  "semanticAuthorityRef": {
    "kind": "SEMANTIC_AUTHORITY",
    "path": "project/docs/governance/decision-log.md",
    "recordId": "OFFICE-2737-S2-SA01",
    "evidenceSha": "07d2fe92b06891f45b34abc2fc09d7d04ed1c0b9"
  },
  "executionGrantRef": {
    "kind": "EXECUTION_GRANT",
    "path": "project/docs/governance/coordination-execution-grants/GOV-COORD-V1-CODEX-LOCAL.md",
    "recordId": "GOV-COORD-V1-CODEX-LOCAL",
    "evidenceSha": "07d2fe92b06891f45b34abc2fc09d7d04ed1c0b9"
  },
  "operation": {
    "type": "EXACT_FILE_CREATION",
    "changeClass": "LEVEL_2_MECHANICAL",
    "targetFile": "project/docs/governance/coordination-execution-grants/OFFICE-2737-S2-EG01.md",
    "recordIdentity": "OFFICE-2737-S2-IMPLEMENTATION",
    "anchor": "7003a16fe7cfaa8d54b60c33dd9bf085e00d0052e408f5b3ba77ae7ca8b460bf",
    "expectedOldValue": "ABSENT",
    "newValue": "# OFFICE #2737 S2 — task-bound implementation grant\n\n<!-- GOV-COORD-AUTHORITY kind=EXECUTION_GRANT recordId=OFFICE-2737-S2-EG01 -->\n\nSingle-use exact ci.yml change only; no guard bypass, runtime or production authority.\n\n<!-- GOV_COORD_GENERIC_EXECUTION_GRANT_JSON_BEGIN -->\n```json\n{\n  \"schemaVersion\": 1,\n  \"taskId\": \"OFFICE-2737-S2-IMPLEMENTATION\",\n  \"semanticAuthorityId\": \"OFFICE-2737-S2-SA01\",\n  \"executionGrantId\": \"OFFICE-2737-S2-EG01\",\n  \"grantNonce\": \"7003a16fe7cfaa8d54b60c33dd9bf085e00d0052e408f5b3ba77ae7ca8b460bf\",\n  \"baseSha\": \"07d2fe92b06891f45b34abc2fc09d7d04ed1c0b9\",\n  \"publicationBindingSha\": \"07d2fe92b06891f45b34abc2fc09d7d04ed1c0b9\",\n  \"executionMode\": \"EXACT_REGISTERED_CHANGESET\",\n  \"effectiveFrom\": \"2026-09-22T16:32:07Z\",\n  \"expiresAt\": \"2026-09-29T16:32:07Z\",\n  \"modifiedPaths\": [\n    {\n      \"path\": \".github/workflows/ci.yml\",\n      \"expectedBaseMode\": \"100644\",\n      \"expectedBaseSha256\": \"382ec45edbb2b570f2e12ed5c1c7224ae624bcb4fe80ae453e1d1d3b7deda965\",\n      \"expectedResultMode\": \"100644\",\n      \"expectedResultSha256\": \"e248bf0220ee5ca46255b99e7c072700616e55943e61a31dbc2a70e75c6922ec\"\n    }\n  ],\n  \"createdPaths\": [],\n  \"expectedResultSha256\": \"fd7b0fbb3366b92dbe1424d2e2707d24b3fe26bff0352deb00f26ac3a48a4e16\"\n}\n```\n<!-- GOV_COORD_GENERIC_EXECUTION_GRANT_JSON_END -->\n",
    "evidenceSha": "07d2fe92b06891f45b34abc2fc09d7d04ed1c0b9",
    "expectedResultSha256": "a123bea8340efba62439650155ba341afaa01d3c465289740f2aa4ff61a5e581"
  },
  "declaredTargetAllowlist": [
    "project/docs/governance/coordination-execution-grants/OFFICE-2737-S2-EG01.md"
  ]
}
```
<!-- GOV_COORD_REQUEST_JSON_END -->
