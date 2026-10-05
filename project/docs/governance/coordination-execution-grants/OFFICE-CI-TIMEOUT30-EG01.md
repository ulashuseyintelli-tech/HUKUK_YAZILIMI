# OFFICE CI Test Suite timeout — exact task-bound grant

<!-- GOV-COORD-AUTHORITY kind=EXECUTION_GRANT recordId=OFFICE-CI-TIMEOUT30-EG01 -->

Mechanical materialization of the explicit owner #2914 handoff and canonical OFFICE-CI-TIMEOUT30-SA01. Single-use 20 -> 30 Test Suite timeout only, plus the supplied adjacent comments; no performance improvement claim. Preserve all other workflow behavior and required gates. This record does not create owner authority.

<!-- GOV_COORD_GENERIC_EXECUTION_GRANT_JSON_BEGIN -->
```json
{
  "schemaVersion": 1,
  "taskId": "OFFICE-CI-TIMEOUT30-IMPLEMENTATION",
  "semanticAuthorityId": "OFFICE-CI-TIMEOUT30-SA01",
  "executionGrantId": "OFFICE-CI-TIMEOUT30-EG01",
  "grantNonce": "fb039f284111406a25d2cf3d900d88dba0395cb8d45548dde1df8bd317c10d24",
  "baseSha": "ddfe04ac6854c3842f5ca83a121d50dbf809ad7c",
  "publicationBindingSha": "ddfe04ac6854c3842f5ca83a121d50dbf809ad7c",
  "executionMode": "EXACT_REGISTERED_CHANGESET",
  "effectiveFrom": "2026-10-05T14:12:32Z",
  "expiresAt": "2026-10-12T14:12:32Z",
  "modifiedPaths": [
    {
      "path": ".github/workflows/ci.yml",
      "expectedBaseMode": "100644",
      "expectedBaseSha256": "74e3a158032b9d61ec5ed7b35f0b40b1f794c4e526b6b00ff5323d39f2a83c96",
      "expectedResultMode": "100644",
      "expectedResultSha256": "e682aadaf85d49e0eedd7082e2351e91d839595d3050811bc131aa9b5381f616"
    }
  ],
  "createdPaths": [],
  "expectedResultSha256": "05abe0c90d22b27c1840a8dd81c892af3287bd1279d55f3da99a48574c68f653"
}
```
<!-- GOV_COORD_GENERIC_EXECUTION_GRANT_JSON_END -->
