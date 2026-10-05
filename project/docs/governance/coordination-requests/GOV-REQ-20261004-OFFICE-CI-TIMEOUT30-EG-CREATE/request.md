# OFFICE CI Test Suite timeout 20 -> 30 — eg request

Owner-supplied exact scope; historical #2914 remains open and unmerged.

<!-- GOV_COORD_REQUEST_JSON_BEGIN -->
```json
{
  "schemaVersion": 1,
  "requestId": "GOV-REQ-20261004-OFFICE-CI-TIMEOUT30-EG-CREATE",
  "requestFingerprint": "8c7866cff43fdb834c478c2b00a0abacdedbc3e866206acf9b2f952b8a67add7",
  "requestedBy": "CODEX_LOCAL",
  "createdAt": "2026-10-05T14:12:32Z",
  "baseMainSha": "ddfe04ac6854c3842f5ca83a121d50dbf809ad7c",
  "semanticAuthorityRef": {
    "kind": "SEMANTIC_AUTHORITY",
    "path": "project/docs/governance/decision-log.md",
    "recordId": "OFFICE-CI-TIMEOUT30-SA01",
    "evidenceSha": "ddfe04ac6854c3842f5ca83a121d50dbf809ad7c"
  },
  "executionGrantRef": {
    "kind": "EXECUTION_GRANT",
    "path": "project/docs/governance/coordination-execution-grants/GOV-COORD-V1-CODEX-LOCAL.md",
    "recordId": "GOV-COORD-V1-CODEX-LOCAL",
    "evidenceSha": "ddfe04ac6854c3842f5ca83a121d50dbf809ad7c"
  },
  "operation": {
    "type": "EXACT_FILE_CREATION",
    "changeClass": "LEVEL_2_MECHANICAL",
    "targetFile": "project/docs/governance/coordination-execution-grants/OFFICE-CI-TIMEOUT30-EG01.md",
    "recordIdentity": "OFFICE-CI-TIMEOUT30-IMPLEMENTATION",
    "anchor": "fb039f284111406a25d2cf3d900d88dba0395cb8d45548dde1df8bd317c10d24",
    "expectedOldValue": "ABSENT",
    "newValue": "# OFFICE CI Test Suite timeout — exact task-bound grant\n\n<!-- GOV-COORD-AUTHORITY kind=EXECUTION_GRANT recordId=OFFICE-CI-TIMEOUT30-EG01 -->\n\nMechanical materialization of the explicit owner #2914 handoff and canonical OFFICE-CI-TIMEOUT30-SA01. Single-use 20 -> 30 Test Suite timeout only, plus the supplied adjacent comments; no performance improvement claim. Preserve all other workflow behavior and required gates. This record does not create owner authority.\n\n<!-- GOV_COORD_GENERIC_EXECUTION_GRANT_JSON_BEGIN -->\n```json\n{\n  \"schemaVersion\": 1,\n  \"taskId\": \"OFFICE-CI-TIMEOUT30-IMPLEMENTATION\",\n  \"semanticAuthorityId\": \"OFFICE-CI-TIMEOUT30-SA01\",\n  \"executionGrantId\": \"OFFICE-CI-TIMEOUT30-EG01\",\n  \"grantNonce\": \"fb039f284111406a25d2cf3d900d88dba0395cb8d45548dde1df8bd317c10d24\",\n  \"baseSha\": \"ddfe04ac6854c3842f5ca83a121d50dbf809ad7c\",\n  \"publicationBindingSha\": \"ddfe04ac6854c3842f5ca83a121d50dbf809ad7c\",\n  \"executionMode\": \"EXACT_REGISTERED_CHANGESET\",\n  \"effectiveFrom\": \"2026-10-05T14:12:32Z\",\n  \"expiresAt\": \"2026-10-12T14:12:32Z\",\n  \"modifiedPaths\": [\n    {\n      \"path\": \".github/workflows/ci.yml\",\n      \"expectedBaseMode\": \"100644\",\n      \"expectedBaseSha256\": \"74e3a158032b9d61ec5ed7b35f0b40b1f794c4e526b6b00ff5323d39f2a83c96\",\n      \"expectedResultMode\": \"100644\",\n      \"expectedResultSha256\": \"e682aadaf85d49e0eedd7082e2351e91d839595d3050811bc131aa9b5381f616\"\n    }\n  ],\n  \"createdPaths\": [],\n  \"expectedResultSha256\": \"05abe0c90d22b27c1840a8dd81c892af3287bd1279d55f3da99a48574c68f653\"\n}\n```\n<!-- GOV_COORD_GENERIC_EXECUTION_GRANT_JSON_END -->\n",
    "evidenceSha": "ddfe04ac6854c3842f5ca83a121d50dbf809ad7c",
    "expectedResultSha256": "2b33754fc6153ab8371daf669e1b94886cc3024a1b0e14da25f053989f74fc7c"
  },
  "declaredTargetAllowlist": [
    "project/docs/governance/coordination-execution-grants/OFFICE-CI-TIMEOUT30-EG01.md"
  ]
}
```
<!-- GOV_COORD_REQUEST_JSON_END -->
