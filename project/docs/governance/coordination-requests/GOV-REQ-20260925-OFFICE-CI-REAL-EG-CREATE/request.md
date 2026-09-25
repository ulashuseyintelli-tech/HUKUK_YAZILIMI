# OFFICE real CI integrations — eg request

<!-- GOV_COORD_REQUEST_JSON_BEGIN -->
```json
{
  "schemaVersion": 1,
  "requestId": "GOV-REQ-20260925-OFFICE-CI-REAL-EG-CREATE",
  "requestFingerprint": "c2c6f312769fecd8d1cc65c68b99a5d0775789d936f491e6a3c005ce2f6a40db",
  "requestedBy": "CODEX_LOCAL",
  "createdAt": "2026-09-25T08:00:56Z",
  "baseMainSha": "d68ea16350efc1242caa04994da79299502d0fed",
  "semanticAuthorityRef": {
    "kind": "SEMANTIC_AUTHORITY",
    "path": "project/docs/governance/decision-log.md",
    "recordId": "OFFICE-CI-REAL-SA01",
    "evidenceSha": "d68ea16350efc1242caa04994da79299502d0fed"
  },
  "executionGrantRef": {
    "kind": "EXECUTION_GRANT",
    "path": "project/docs/governance/coordination-execution-grants/GOV-COORD-V1-CODEX-LOCAL.md",
    "recordId": "GOV-COORD-V1-CODEX-LOCAL",
    "evidenceSha": "d68ea16350efc1242caa04994da79299502d0fed"
  },
  "operation": {
    "type": "EXACT_FILE_CREATION",
    "changeClass": "LEVEL_2_MECHANICAL",
    "targetFile": "project/docs/governance/coordination-execution-grants/OFFICE-CI-REAL-EG01.md",
    "recordIdentity": "OFFICE-CI-REAL-IMPLEMENTATION",
    "anchor": "c014026109cb38ec3620c4f8b3e2961fe1eaaca3f48e19c97ae98d7bab4e80bc",
    "expectedOldValue": "ABSENT",
    "newValue": "# OFFICE real CI integrations — exact implementation grant\n\n<!-- GOV-COORD-AUTHORITY kind=EXECUTION_GRANT recordId=OFFICE-CI-REAL-EG01 -->\n\nSingle-use task-bound tuple. No branch-protection change, live operation, image publication or authority bypass.\n\n<!-- GOV_COORD_GENERIC_EXECUTION_GRANT_JSON_BEGIN -->\n```json\n{\n  \"schemaVersion\": 1,\n  \"taskId\": \"OFFICE-CI-REAL-IMPLEMENTATION\",\n  \"semanticAuthorityId\": \"OFFICE-CI-REAL-SA01\",\n  \"executionGrantId\": \"OFFICE-CI-REAL-EG01\",\n  \"grantNonce\": \"c014026109cb38ec3620c4f8b3e2961fe1eaaca3f48e19c97ae98d7bab4e80bc\",\n  \"baseSha\": \"d68ea16350efc1242caa04994da79299502d0fed\",\n  \"publicationBindingSha\": \"d68ea16350efc1242caa04994da79299502d0fed\",\n  \"executionMode\": \"EXACT_REGISTERED_CHANGESET\",\n  \"effectiveFrom\": \"2026-09-25T08:00:56Z\",\n  \"expiresAt\": \"2026-10-02T08:00:56Z\",\n  \"modifiedPaths\": [\n    {\n      \"path\": \".github/workflows/ci.yml\",\n      \"expectedBaseMode\": \"100644\",\n      \"expectedBaseSha256\": \"e248bf0220ee5ca46255b99e7c072700616e55943e61a31dbc2a70e75c6922ec\",\n      \"expectedResultMode\": \"100644\",\n      \"expectedResultSha256\": \"964c4c8c3bd6ddf40bc618a3db07af44ce6d0a1cd9090153761b781fa1d6c87d\"\n    },\n    {\n      \"path\": \"project/docs/governance/office-ci-coverage-r01/OFFICE-CI-COVERAGE-R01.md\",\n      \"expectedBaseMode\": \"100644\",\n      \"expectedBaseSha256\": \"81ae14abf79bb2168b89f554f9d6b539ddc07a3f26f369fdfccdc1e37f5ab281\",\n      \"expectedResultMode\": \"100644\",\n      \"expectedResultSha256\": \"a696f464b589d00ddb90893f36a4ca7889f356eb61efee49a2c21b93ff087405\"\n    }\n  ],\n  \"createdPaths\": [],\n  \"expectedResultSha256\": \"cb88c8c7b6198ec2b4819f7603d7959164135ac5b9b0fd9f85e39208966307c2\"\n}\n```\n<!-- GOV_COORD_GENERIC_EXECUTION_GRANT_JSON_END -->\n",
    "evidenceSha": "d68ea16350efc1242caa04994da79299502d0fed",
    "expectedResultSha256": "955434433b72b51b980b619cb837b79aa2b4cf91bc99ee9f1dd58b3f59c02f78"
  },
  "declaredTargetAllowlist": [
    "project/docs/governance/coordination-execution-grants/OFFICE-CI-REAL-EG01.md"
  ]
}
```
<!-- GOV_COORD_REQUEST_JSON_END -->
