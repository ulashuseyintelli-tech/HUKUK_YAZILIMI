# KI-116 — eg-create request only

Existing owner-authorized hourglass step 5. No target write or live command occurs in this request PR.

<!-- GOV_COORD_REQUEST_JSON_BEGIN -->
```json
{
  "schemaVersion": 1,
  "requestId": "GOV-REQ-20261026-CLIENT-KI116-PINS-EG-CREATE",
  "requestFingerprint": "5a57ab6811a6ade47773398be101981bc9343c8d7db102281e51f732276c6985",
  "requestedBy": "CODEX_LOCAL",
  "createdAt": "2026-10-26T19:39:23Z",
  "baseMainSha": "f5706584e3209b825961088521d6f90072e9927c",
  "semanticAuthorityRef": {
    "kind": "SEMANTIC_AUTHORITY",
    "path": "project/docs/governance/decision-log.md",
    "recordId": "CLIENT-KI116-PINS-SA01",
    "evidenceSha": "f5706584e3209b825961088521d6f90072e9927c"
  },
  "executionGrantRef": {
    "kind": "EXECUTION_GRANT",
    "path": "project/docs/governance/coordination-execution-grants/GOV-COORD-V1-CODEX-LOCAL.md",
    "recordId": "GOV-COORD-V1-CODEX-LOCAL",
    "evidenceSha": "f5706584e3209b825961088521d6f90072e9927c"
  },
  "operation": {
    "type": "EXACT_FILE_CREATION",
    "changeClass": "LEVEL_2_MECHANICAL",
    "targetFile": "project/docs/governance/coordination-execution-grants/CLIENT-KI116-PINS-EG01.md",
    "recordIdentity": "CLIENT-KI116-PINS-IMPLEMENTATION",
    "anchor": "1b16f7566d845918c54f8ed70cfd085456d54410277e562cc14f954c1fbd5c44",
    "expectedOldValue": "ABSENT",
    "newValue": "# KI-116 — exact owner-authorized implementation tuple\n\n<!-- GOV-COORD-AUTHORITY kind=EXECUTION_GRANT recordId=CLIENT-KI116-PINS-EG01 -->\n\nMechanical recording of the existing hourglass step-5 owner authority in CLIENT-KI116-PINS-SA01. Eight dist literals and one source/evidence mapping only. No live command, policy change, new program, service acceptance or guard bypass. Historical POA/B closures and all runner/GO guards are preserved.\n\n<!-- GOV_COORD_GENERIC_EXECUTION_GRANT_JSON_BEGIN -->\n```json\n{\n  \"schemaVersion\": 1,\n  \"taskId\": \"CLIENT-KI116-PINS-IMPLEMENTATION\",\n  \"semanticAuthorityId\": \"CLIENT-KI116-PINS-SA01\",\n  \"executionGrantId\": \"CLIENT-KI116-PINS-EG01\",\n  \"grantNonce\": \"1b16f7566d845918c54f8ed70cfd085456d54410277e562cc14f954c1fbd5c44\",\n  \"baseSha\": \"f5706584e3209b825961088521d6f90072e9927c\",\n  \"publicationBindingSha\": \"f5706584e3209b825961088521d6f90072e9927c\",\n  \"executionMode\": \"EXACT_REGISTERED_CHANGESET\",\n  \"effectiveFrom\": \"2026-10-26T19:38:23Z\",\n  \"expiresAt\": \"2026-10-28T19:39:23Z\",\n  \"modifiedPaths\": [\n    {\n      \"path\": \"project/docs/governance/client-c4-live-403-r01/scripts/c4-live-block.ps1\",\n      \"expectedBaseMode\": \"100644\",\n      \"expectedBaseSha256\": \"81c19845716cb9daab14074985edc245a7917acc1465dc107329709f30907e97\",\n      \"expectedResultMode\": \"100644\",\n      \"expectedResultSha256\": \"f59f5c928c4c499d2fdf563e77e20afadd29c85fed6eba130a415bc57eea5599\"\n    },\n    {\n      \"path\": \"project/docs/governance/client-extacc-intake-chain-r01/scripts/extacc-owner-live-block.ps1\",\n      \"expectedBaseMode\": \"100644\",\n      \"expectedBaseSha256\": \"afb28e81da88042dfb2695e848bc06ea4e5e9bdee670929f9096e22615a676d7\",\n      \"expectedResultMode\": \"100644\",\n      \"expectedResultSha256\": \"e1156b62ef605009c9bab6d46c467e2cefd03bb204cecfa2b43b57155123d49d\"\n    },\n    {\n      \"path\": \"project/docs/governance/client-extacc-portal-d4-r01/scripts/d4-owner-live-block.ps1\",\n      \"expectedBaseMode\": \"100644\",\n      \"expectedBaseSha256\": \"4b7cc9f60a3157fff335333f2cb7ebca6e52f8c369042ebef7fd67e4438f2cb2\",\n      \"expectedResultMode\": \"100644\",\n      \"expectedResultSha256\": \"3c3a390f400a301fa2d162746580e7bf0ae27db52bcd1acae9158ab54d4b940a\"\n    },\n    {\n      \"path\": \"project/docs/governance/client-extacc-portal-d5-r01/scripts/d5-owner-live-block.ps1\",\n      \"expectedBaseMode\": \"100644\",\n      \"expectedBaseSha256\": \"98200af14ed6c53a608247ba995d2e3bf85199a9310caf417661e824b0090733\",\n      \"expectedResultMode\": \"100644\",\n      \"expectedResultSha256\": \"a4d1817c06c102b9310f26c4e6a49a8e5a731ac949c8cd968a0ecd9310d0207c\"\n    },\n    {\n      \"path\": \"project/docs/governance/client-extacc-portal-d6-r01/scripts/d6-owner-live-block.ps1\",\n      \"expectedBaseMode\": \"100644\",\n      \"expectedBaseSha256\": \"583d695e6f2d3deb944b824475537d496ec4173d5f0665be91075c3fb3c1a10f\",\n      \"expectedResultMode\": \"100644\",\n      \"expectedResultSha256\": \"e36d317e54befa7ca303875caa1e204f9cb6ed7b03c6c252fe96a4bc8f1d37bc\"\n    },\n    {\n      \"path\": \"project/docs/governance/client-extacc-portal-d7-r01/scripts/d7-owner-live-block.ps1\",\n      \"expectedBaseMode\": \"100644\",\n      \"expectedBaseSha256\": \"cc2b85ab80108af6b4730237caecec50afdc11c52d68fd29447bcc3614e4263d\",\n      \"expectedResultMode\": \"100644\",\n      \"expectedResultSha256\": \"2eb5437f9e4738192650dbcabaecc5f5f71175ffaa4e57ff4b839393af244bf0\"\n    },\n    {\n      \"path\": \"project/docs/governance/client-h5-intake-url-r01/scripts/h5-owner-env-block.ps1\",\n      \"expectedBaseMode\": \"100644\",\n      \"expectedBaseSha256\": \"d0e2a1bbcba1cd113a3744cb4e152585d6eb2b09eb51967e93102eadcdf412bf\",\n      \"expectedResultMode\": \"100644\",\n      \"expectedResultSha256\": \"b8a3a55d9da455923ff51fdd2ad70e2daf55d94c1b8f01ce99ca668870892730\"\n    },\n    {\n      \"path\": \"project/docs/governance/client-h5-intake-url-r01/scripts/h5-owner-live-block.ps1\",\n      \"expectedBaseMode\": \"100644\",\n      \"expectedBaseSha256\": \"41c4dd800df084cab193eb6cdeb34deb57883930518db59ecf3ae786a5135963\",\n      \"expectedResultMode\": \"100644\",\n      \"expectedResultSha256\": \"8605b4db44744638aa00b9ef6db12e3041a8f95d7624d6456dc77f17aa652302\"\n    }\n  ],\n  \"createdPaths\": [\n    {\n      \"path\": \"project/docs/governance/client-acceptance-pins-b-r01/CLIENT-ACCEPTANCE-PINS-B-R01.md\",\n      \"expectedResultMode\": \"100644\",\n      \"expectedResultSha256\": \"b15c121413cd7e1d96c2896ef133dd150df8ff5d8b02a3916a4f59892f16ecab\"\n    }\n  ],\n  \"expectedResultSha256\": \"22d0dca30128cd2a8a1982931277321bab0e6589a5b95c38a79d7f67687bd864\"\n}\n```\n<!-- GOV_COORD_GENERIC_EXECUTION_GRANT_JSON_END -->\n",
    "evidenceSha": "f5706584e3209b825961088521d6f90072e9927c",
    "expectedResultSha256": "c4f07d4bf21c14292c72d234bc2d1f7fd567525cc8105b7871da6c7b7cf68b20"
  },
  "declaredTargetAllowlist": [
    "project/docs/governance/coordination-execution-grants/CLIENT-KI116-PINS-EG01.md"
  ]
}
```
<!-- GOV_COORD_REQUEST_JSON_END -->
