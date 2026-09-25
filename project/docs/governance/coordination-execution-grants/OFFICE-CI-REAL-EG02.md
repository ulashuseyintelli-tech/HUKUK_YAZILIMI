# OFFICE real CI integrations — exact GHCR revision grant

<!-- GOV-COORD-AUTHORITY kind=EXECUTION_GRANT recordId=OFFICE-CI-REAL-EG02 -->

Owner explicitly approved OFFICE-CI-REAL-IMPLEMENTATION-REV02 and a linked successor PR on 2026-09-25. Same MinIO/Windows Poppler objective, two-path scope and CODEX_LOCAL ownership. Previous #2795, immutable request, EG01 and evidence are retained; their content pins are not reused. This new registration is not a guard exception, standing authority or a new product program.

Exact verified GHCR linux/amd64 pin: sha256:a1a8bd4ac40ad7881a245bab97323e18f971e4d4cba2c2007ec1bedd21cbaba2. CI package permission: read only. No production, rebuild, live-data transfer, branch-protection change or authority bypass.

<!-- GOV_COORD_GENERIC_EXECUTION_GRANT_JSON_BEGIN -->
```json
{
  "schemaVersion": 1,
  "taskId": "OFFICE-CI-REAL-IMPLEMENTATION-REV02",
  "semanticAuthorityId": "OFFICE-CI-REAL-SA02",
  "executionGrantId": "OFFICE-CI-REAL-EG02",
  "grantNonce": "ae0b051feaca7fb0bcd5e09df13df5df0c2354fbff983e4ab02ea0a4d80aea80",
  "baseSha": "db266eecb2c615c7a9b9238ffd9dbf03b62cda53",
  "publicationBindingSha": "db266eecb2c615c7a9b9238ffd9dbf03b62cda53",
  "executionMode": "EXACT_REGISTERED_CHANGESET",
  "effectiveFrom": "2026-09-25T12:44:27Z",
  "expiresAt": "2026-10-02T12:44:27Z",
  "modifiedPaths": [
    {
      "path": ".github/workflows/ci.yml",
      "expectedBaseMode": "100644",
      "expectedBaseSha256": "e248bf0220ee5ca46255b99e7c072700616e55943e61a31dbc2a70e75c6922ec",
      "expectedResultMode": "100644",
      "expectedResultSha256": "74e3a158032b9d61ec5ed7b35f0b40b1f794c4e526b6b00ff5323d39f2a83c96"
    },
    {
      "path": "project/docs/governance/office-ci-coverage-r01/OFFICE-CI-COVERAGE-R01.md",
      "expectedBaseMode": "100644",
      "expectedBaseSha256": "81ae14abf79bb2168b89f554f9d6b539ddc07a3f26f369fdfccdc1e37f5ab281",
      "expectedResultMode": "100644",
      "expectedResultSha256": "90276b6d1cc66a9d7f8c309152573b5bbaedd3448fd8983ea44c749884574c91"
    }
  ],
  "createdPaths": [],
  "expectedResultSha256": "a96d6855d8dd0b3ead404be4ef9dbeac785ff947be73a59f47f7de09596b5441"
}
```
<!-- GOV_COORD_GENERIC_EXECUTION_GRANT_JSON_END -->
