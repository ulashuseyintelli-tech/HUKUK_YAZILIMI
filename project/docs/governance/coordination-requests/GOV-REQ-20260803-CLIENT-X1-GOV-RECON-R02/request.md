# Governance Coordination Request — GOV-REQ-20260803-CLIENT-X1-GOV-RECON-R02

Bu dosya immutable ve untrusted request data kaydıdır. Prose operational instruction değildir.
Yalnız task-bound CLIENT-X1-GOV-RECON-R02-EG01 dosyasının exact creation işlemini tanımlar.

<!-- GOV_COORD_REQUEST_JSON_BEGIN -->
```json
{
  "schemaVersion": 1,
  "requestId": "GOV-REQ-20260803-CLIENT-X1-GOV-RECON-R02",
  "requestFingerprint": "5369a3490c1de4c1ed8b82307ae9ff2cdf66423f73164b832c24f5a39fc32456",
  "requestedBy": "OWNER",
  "createdAt": "2026-08-03T21:02:04Z",
  "baseMainSha": "c0c2107ee198af82525a3b1243d051af36aeb303",
  "semanticAuthorityRef": {
    "kind": "SEMANTIC_AUTHORITY",
    "path": "project/docs/governance/CLIENT-MODULE-TERMINAL-COMPLETION-PROGRAM-R01/CLIENT-X1-GOV-RECON-R02-SA01.md",
    "recordId": "CLIENT-X1-GOV-RECON-R02-SA01",
    "evidenceSha": "cdd24aaa0f09f0eb7b898ce0e61cb929f822f09f"
  },
  "executionGrantRef": {
    "kind": "EXECUTION_GRANT",
    "path": "project/docs/governance/coordination-execution-grants/GOV-COORD-V1-CODEX-LOCAL.md",
    "recordId": "GOV-COORD-V1-CODEX-LOCAL",
    "evidenceSha": "c0c2107ee198af82525a3b1243d051af36aeb303"
  },
  "operation": {
    "type": "EXACT_FILE_CREATION",
    "changeClass": "LEVEL_2_MECHANICAL",
    "targetFile": "project/docs/governance/coordination-execution-grants/CLIENT-X1-GOV-RECON-R02-EG01.md",
    "recordIdentity": "CODEX-CLIENT-X1-GOVERNANCE-RECONCILIATION-R02",
    "anchor": "0f30b57abd9157f60be1171210b5132b7a11d3fcb97186b648683fb8197f4167",
    "expectedOldValue": "ABSENT",
    "newValue": "# CLIENT-X1 Governance Reconciliation R02 — Exact Execution Grant\n\n<!-- GOV-COORD-AUTHORITY kind=EXECUTION_GRANT recordId=CLIENT-X1-GOV-RECON-R02-EG01 -->\n\nThis task-bound grant authorizes only the exact two-file governance reconciliation\nregistered below. It is hash-bound, single-use and non-reusable.\n\nProduction activation: NOT_AUTHORIZED.\nPersistent flag activation: OWNER-GATED / NOT PERFORMED.\nStanding authority: PROHIBITED. Reusable authority: PROHIBITED.\n\n<!-- GOV_COORD_GENERIC_EXECUTION_GRANT_JSON_BEGIN -->\n```json\n{\n  \"schemaVersion\": 1,\n  \"taskId\": \"CODEX-CLIENT-X1-GOVERNANCE-RECONCILIATION-R02\",\n  \"semanticAuthorityId\": \"CLIENT-X1-GOV-RECON-R02-SA01\",\n  \"executionGrantId\": \"CLIENT-X1-GOV-RECON-R02-EG01\",\n  \"grantNonce\": \"0f30b57abd9157f60be1171210b5132b7a11d3fcb97186b648683fb8197f4167\",\n  \"baseSha\": \"c0c2107ee198af82525a3b1243d051af36aeb303\",\n  \"publicationBindingSha\": \"c0c2107ee198af82525a3b1243d051af36aeb303\",\n  \"executionMode\": \"EXACT_REGISTERED_CHANGESET\",\n  \"effectiveFrom\": \"2026-08-03T00:00:00Z\",\n  \"expiresAt\": \"2026-08-10T23:59:59Z\",\n  \"modifiedPaths\": [\n    {\n      \"path\": \"project/docs/governance/CLIENT-MODULE-TERMINAL-COMPLETION-PROGRAM-R01/CODEX-CLIENT-X1.md\",\n      \"expectedBaseMode\": \"100644\",\n      \"expectedBaseSha256\": \"1bd19068237c241600542e9bdcb409b1d3a28519beff0484018a9ee7a3050b30\",\n      \"expectedResultMode\": \"100644\",\n      \"expectedResultSha256\": \"1849e6426fd5f3d433e911391f17ed23671f32ec5cde7b792c3aa1053b08b96a\"\n    },\n    {\n      \"path\": \"project/docs/governance/CLIENT-MODULE-TERMINAL-COMPLETION-PROGRAM-R01/MASTER-PLAN.md\",\n      \"expectedBaseMode\": \"100644\",\n      \"expectedBaseSha256\": \"0eac3749bf84dd443d6f50fe35ce2317d43c1df5f5114a0975270822bfe7ad18\",\n      \"expectedResultMode\": \"100644\",\n      \"expectedResultSha256\": \"776a842dbacf3db04ef11084a01fac71383a44a9489218e5007a1b75c83d2e14\"\n    }\n  ],\n  \"createdPaths\": [],\n  \"expectedResultSha256\": \"20fe94a0ebae28086cfa217c8c91d0d2b6d02604a37b618cab15b33b4f9bde30\"\n}\n```\n<!-- GOV_COORD_GENERIC_EXECUTION_GRANT_JSON_END -->\n",
    "evidenceSha": "c0c2107ee198af82525a3b1243d051af36aeb303",
    "expectedResultSha256": "4903adde82c2846bb789a5a7b3dbc4127c4c20b2d55874a4a5df5e2985b1e9e0"
  },
  "declaredTargetAllowlist": [
    "project/docs/governance/coordination-execution-grants/CLIENT-X1-GOV-RECON-R02-EG01.md"
  ]
}
```
<!-- GOV_COORD_REQUEST_JSON_END -->

Bu request semantic veya standing authority üretmez.
