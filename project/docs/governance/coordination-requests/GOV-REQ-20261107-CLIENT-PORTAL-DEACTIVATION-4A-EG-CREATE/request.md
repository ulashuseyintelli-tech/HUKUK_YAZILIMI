# Client 4a — eg request

Only the existing supplied owner decision is mechanically registered. No protected target is written in this request-only PR. Closed writer turns are not reused. Product delivery remains separately gated; no production acceptance is claimed.

<!-- GOV_COORD_REQUEST_JSON_BEGIN -->
```json
{
  "schemaVersion": 1,
  "requestId": "GOV-REQ-20261107-CLIENT-PORTAL-DEACTIVATION-4A-EG-CREATE",
  "requestFingerprint": "465c3bc52be4b3ae4402e0093cdd3d42e1a962b2005b4d0713128f7591202d97",
  "requestedBy": "CODEX_LOCAL",
  "createdAt": "2026-11-07T02:37:36Z",
  "baseMainSha": "7996f71c1b101985e4db38b931a23a4466188f2e",
  "semanticAuthorityRef": {
    "kind": "SEMANTIC_AUTHORITY",
    "path": "project/docs/governance/decision-log.md",
    "recordId": "CLIENT-PORTAL-DEACTIVATION-4A-SA01",
    "evidenceSha": "7996f71c1b101985e4db38b931a23a4466188f2e"
  },
  "executionGrantRef": {
    "kind": "EXECUTION_GRANT",
    "path": "project/docs/governance/coordination-execution-grants/GOV-COORD-V1-CODEX-LOCAL.md",
    "recordId": "GOV-COORD-V1-CODEX-LOCAL",
    "evidenceSha": "7996f71c1b101985e4db38b931a23a4466188f2e"
  },
  "operation": {
    "type": "EXACT_FILE_CREATION",
    "changeClass": "LEVEL_2_MECHANICAL",
    "targetFile": "project/docs/governance/coordination-execution-grants/CLIENT-PORTAL-DEACTIVATION-4A-EG01.md",
    "recordIdentity": "CLIENT-PORTAL-DEACTIVATION-4A-CHARTER",
    "anchor": "1638b4ef39eaa04b263e435ff37ea13f5d601293683f316f92e357ea2fdebc57",
    "expectedOldValue": "ABSENT",
    "newValue": "# Client 4a — exact owner-approved Charter exception grant\n\n<!-- GOV-COORD-AUTHORITY kind=EXECUTION_GRANT recordId=CLIENT-PORTAL-DEACTIVATION-4A-EG01 -->\n\nMechanical materialization of the supplied owner 4a GO and canonical CLIENT-PORTAL-DEACTIVATION-4A-SA01. Only the narrow section 50.3 portal exception and section 18.6 pointer are registered. This record does not create or expand owner authority. Preserve all other child protections and completed acceptance; no runtime, migration or historical-account mutation.\n\n<!-- GOV_COORD_GENERIC_EXECUTION_GRANT_JSON_BEGIN -->\n```json\n{\n  \"schemaVersion\": 1,\n  \"taskId\": \"CLIENT-PORTAL-DEACTIVATION-4A-CHARTER\",\n  \"semanticAuthorityId\": \"CLIENT-PORTAL-DEACTIVATION-4A-SA01\",\n  \"executionGrantId\": \"CLIENT-PORTAL-DEACTIVATION-4A-EG01\",\n  \"grantNonce\": \"1638b4ef39eaa04b263e435ff37ea13f5d601293683f316f92e357ea2fdebc57\",\n  \"baseSha\": \"7996f71c1b101985e4db38b931a23a4466188f2e\",\n  \"publicationBindingSha\": \"7996f71c1b101985e4db38b931a23a4466188f2e\",\n  \"executionMode\": \"EXACT_REGISTERED_CHANGESET\",\n  \"effectiveFrom\": \"2026-11-07T02:37:36Z\",\n  \"expiresAt\": \"2026-11-14T02:37:36Z\",\n  \"modifiedPaths\": [\n    {\n      \"path\": \"project/docs/governance/CLIENT-GOVERNANCE-CHARTER.md\",\n      \"expectedBaseMode\": \"100644\",\n      \"expectedBaseSha256\": \"b6066b35576f479c2789a6411caf5ab411e2f3b4233e5343601228407ac0a8cd\",\n      \"expectedResultMode\": \"100644\",\n      \"expectedResultSha256\": \"c89d7825f06f28a14f3bd13b6de6a6f63ed7fb592e3045d36576617facd86700\"\n    }\n  ],\n  \"createdPaths\": [],\n  \"expectedResultSha256\": \"88ae91c59a905c687c9d664da84f3c33c4c48f013712bf75b650e19e78587276\"\n}\n```\n<!-- GOV_COORD_GENERIC_EXECUTION_GRANT_JSON_END -->\n",
    "evidenceSha": "7996f71c1b101985e4db38b931a23a4466188f2e",
    "expectedResultSha256": "b77b1e5449192449abd712c005dfe91fb635599bcc3e1c80187e0c991027799f"
  },
  "declaredTargetAllowlist": [
    "project/docs/governance/coordination-execution-grants/CLIENT-PORTAL-DEACTIVATION-4A-EG01.md"
  ]
}
```
<!-- GOV_COORD_REQUEST_JSON_END -->
