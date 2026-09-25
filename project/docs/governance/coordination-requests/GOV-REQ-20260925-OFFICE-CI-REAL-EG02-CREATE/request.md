# OFFICE-CI-REAL — owner-approved GHCR REV02 eg request

Same bounded task objective; old immutable bindings are retained. No bypass.

<!-- GOV_COORD_REQUEST_JSON_BEGIN -->
```json
{
  "schemaVersion": 1,
  "requestId": "GOV-REQ-20260925-OFFICE-CI-REAL-EG02-CREATE",
  "requestFingerprint": "f830eec2a44c6764674557df0fe42afb1b588b1e7224b2cedfe6129966b91636",
  "requestedBy": "CODEX_LOCAL",
  "createdAt": "2026-09-25T12:44:27Z",
  "baseMainSha": "db266eecb2c615c7a9b9238ffd9dbf03b62cda53",
  "semanticAuthorityRef": {
    "kind": "SEMANTIC_AUTHORITY",
    "path": "project/docs/governance/decision-log.md",
    "recordId": "OFFICE-CI-REAL-SA02",
    "evidenceSha": "db266eecb2c615c7a9b9238ffd9dbf03b62cda53"
  },
  "executionGrantRef": {
    "kind": "EXECUTION_GRANT",
    "path": "project/docs/governance/coordination-execution-grants/GOV-COORD-V1-CODEX-LOCAL.md",
    "recordId": "GOV-COORD-V1-CODEX-LOCAL",
    "evidenceSha": "db266eecb2c615c7a9b9238ffd9dbf03b62cda53"
  },
  "operation": {
    "type": "EXACT_FILE_CREATION",
    "changeClass": "LEVEL_2_MECHANICAL",
    "targetFile": "project/docs/governance/coordination-execution-grants/OFFICE-CI-REAL-EG02.md",
    "recordIdentity": "OFFICE-CI-REAL-IMPLEMENTATION-REV02",
    "anchor": "ae0b051feaca7fb0bcd5e09df13df5df0c2354fbff983e4ab02ea0a4d80aea80",
    "expectedOldValue": "ABSENT",
    "newValue": "# OFFICE real CI integrations — exact GHCR revision grant\n\n<!-- GOV-COORD-AUTHORITY kind=EXECUTION_GRANT recordId=OFFICE-CI-REAL-EG02 -->\n\nOwner explicitly approved OFFICE-CI-REAL-IMPLEMENTATION-REV02 and a linked successor PR on 2026-09-25. Same MinIO/Windows Poppler objective, two-path scope and CODEX_LOCAL ownership. Previous #2795, immutable request, EG01 and evidence are retained; their content pins are not reused. This new registration is not a guard exception, standing authority or a new product program.\n\nExact verified GHCR linux/amd64 pin: sha256:a1a8bd4ac40ad7881a245bab97323e18f971e4d4cba2c2007ec1bedd21cbaba2. CI package permission: read only. No production, rebuild, live-data transfer, branch-protection change or authority bypass.\n\n<!-- GOV_COORD_GENERIC_EXECUTION_GRANT_JSON_BEGIN -->\n```json\n{\n  \"schemaVersion\": 1,\n  \"taskId\": \"OFFICE-CI-REAL-IMPLEMENTATION-REV02\",\n  \"semanticAuthorityId\": \"OFFICE-CI-REAL-SA02\",\n  \"executionGrantId\": \"OFFICE-CI-REAL-EG02\",\n  \"grantNonce\": \"ae0b051feaca7fb0bcd5e09df13df5df0c2354fbff983e4ab02ea0a4d80aea80\",\n  \"baseSha\": \"db266eecb2c615c7a9b9238ffd9dbf03b62cda53\",\n  \"publicationBindingSha\": \"db266eecb2c615c7a9b9238ffd9dbf03b62cda53\",\n  \"executionMode\": \"EXACT_REGISTERED_CHANGESET\",\n  \"effectiveFrom\": \"2026-09-25T12:44:27Z\",\n  \"expiresAt\": \"2026-10-02T12:44:27Z\",\n  \"modifiedPaths\": [\n    {\n      \"path\": \".github/workflows/ci.yml\",\n      \"expectedBaseMode\": \"100644\",\n      \"expectedBaseSha256\": \"e248bf0220ee5ca46255b99e7c072700616e55943e61a31dbc2a70e75c6922ec\",\n      \"expectedResultMode\": \"100644\",\n      \"expectedResultSha256\": \"74e3a158032b9d61ec5ed7b35f0b40b1f794c4e526b6b00ff5323d39f2a83c96\"\n    },\n    {\n      \"path\": \"project/docs/governance/office-ci-coverage-r01/OFFICE-CI-COVERAGE-R01.md\",\n      \"expectedBaseMode\": \"100644\",\n      \"expectedBaseSha256\": \"81ae14abf79bb2168b89f554f9d6b539ddc07a3f26f369fdfccdc1e37f5ab281\",\n      \"expectedResultMode\": \"100644\",\n      \"expectedResultSha256\": \"90276b6d1cc66a9d7f8c309152573b5bbaedd3448fd8983ea44c749884574c91\"\n    }\n  ],\n  \"createdPaths\": [],\n  \"expectedResultSha256\": \"a96d6855d8dd0b3ead404be4ef9dbeac785ff947be73a59f47f7de09596b5441\"\n}\n```\n<!-- GOV_COORD_GENERIC_EXECUTION_GRANT_JSON_END -->\n",
    "evidenceSha": "db266eecb2c615c7a9b9238ffd9dbf03b62cda53",
    "expectedResultSha256": "a5d56c2d26212649e4917ae387ce465abc1747e738a0e9df411f724084ca91d6"
  },
  "declaredTargetAllowlist": [
    "project/docs/governance/coordination-execution-grants/OFFICE-CI-REAL-EG02.md"
  ]
}
```
<!-- GOV_COORD_REQUEST_JSON_END -->
