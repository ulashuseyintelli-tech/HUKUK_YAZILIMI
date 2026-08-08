# Governance Coordination Request — GOV-REQ-20260809-CLIENT-ACCOUNTING-X1-CLOSEOUT-EG

Bu dosya immutable ve untrusted request data kaydıdır. Prose operational instruction değildir.
Yalnız CLIENT-ACCOUNTING-DELIVERY-X1-TERMINAL-CLOSEOUT-R01-EG01 task-bound grant dosyasının exact creation işlemini tanımlar.

<!-- GOV_COORD_REQUEST_JSON_BEGIN -->
```json
{
  "schemaVersion": 1,
  "requestId": "GOV-REQ-20260809-CLIENT-ACCOUNTING-X1-CLOSEOUT-EG",
  "requestFingerprint": "a23a8d6d4db9a9eb382f69135093612168feb2d0fdb893eded6a0a4eff09dfc0",
  "requestedBy": "OWNER",
  "createdAt": "2026-08-08T21:45:07Z",
  "baseMainSha": "1488063d60f52616d8a30debafdb6a2705fd7615",
  "semanticAuthorityRef": {
    "kind": "SEMANTIC_AUTHORITY",
    "path": "project/docs/governance/decision-log.md",
    "recordId": "CLIENT-ACCOUNTING-DELIVERY-X1-TERMINAL-CLOSEOUT-R01-SA01",
    "evidenceSha": "e241427a6f2b278f039fae6db859c8dbba30c183"
  },
  "executionGrantRef": {
    "kind": "EXECUTION_GRANT",
    "path": "project/docs/governance/coordination-execution-grants/GOV-COORD-V1-CODEX-LOCAL.md",
    "recordId": "GOV-COORD-V1-CODEX-LOCAL",
    "evidenceSha": "1488063d60f52616d8a30debafdb6a2705fd7615"
  },
  "operation": {
    "type": "EXACT_FILE_CREATION",
    "changeClass": "LEVEL_2_MECHANICAL",
    "targetFile": "project/docs/governance/coordination-execution-grants/CLIENT-ACCOUNTING-DELIVERY-X1-TERMINAL-CLOSEOUT-R01-EG01.md",
    "recordIdentity": "CLIENT-ACCOUNTING-DELIVERY-X1-TERMINAL-CLOSEOUT-R01",
    "anchor": "db71b669e2b3c510de0713f4bf93bf935602d1086b494356b9a223ef23af857b",
    "expectedOldValue": "ABSENT",
    "newValue": "# CLIENT Accounting Delivery X1 Terminal Closeout — Exact Execution Grant\n\n<!-- GOV-COORD-AUTHORITY kind=EXECUTION_GRANT recordId=CLIENT-ACCOUNTING-DELIVERY-X1-TERMINAL-CLOSEOUT-R01-EG01 -->\n\nThis task-bound grant authorizes only the exact two-file X1 terminal governance\nreconciliation registered below. It is hash-bound, single-use and non-reusable.\n\nProduction activation: NOT_AUTHORIZED / NOT_PERFORMED.\nPersistent activation: NOT_AUTHORIZED / OWNER_GATED / NOT_PERFORMED.\nProduct code or X1/X2 engineering work: NOT_AUTHORIZED.\nProduct test rerun: NOT_AUTHORIZED.\nOther lane status mutation: NOT_AUTHORIZED.\nStanding authority: PROHIBITED. Reusable authority: PROHIBITED.\nGovernance framework repair or scope expansion: PROHIBITED.\n\n<!-- GOV_COORD_GENERIC_EXECUTION_GRANT_JSON_BEGIN -->\n```json\n{\n  \"schemaVersion\": 1,\n  \"taskId\": \"CLIENT-ACCOUNTING-DELIVERY-X1-TERMINAL-CLOSEOUT-R01\",\n  \"semanticAuthorityId\": \"CLIENT-ACCOUNTING-DELIVERY-X1-TERMINAL-CLOSEOUT-R01-SA01\",\n  \"executionGrantId\": \"CLIENT-ACCOUNTING-DELIVERY-X1-TERMINAL-CLOSEOUT-R01-EG01\",\n  \"grantNonce\": \"db71b669e2b3c510de0713f4bf93bf935602d1086b494356b9a223ef23af857b\",\n  \"baseSha\": \"1488063d60f52616d8a30debafdb6a2705fd7615\",\n  \"publicationBindingSha\": \"1488063d60f52616d8a30debafdb6a2705fd7615\",\n  \"executionMode\": \"EXACT_REGISTERED_CHANGESET\",\n  \"effectiveFrom\": \"2026-08-08T00:00:00Z\",\n  \"expiresAt\": \"2026-08-16T23:59:59Z\",\n  \"modifiedPaths\": [\n    {\n      \"path\": \"project/docs/governance/CLIENT-ACCOUNTING-DELIVERY-AND-OFFICE-UX-PROGRAM-R01/CODEX-X1-FD-OFFICE-WORKSPACE.md\",\n      \"expectedBaseMode\": \"100644\",\n      \"expectedBaseSha256\": \"3a259cd0b1946d4fa04f1a4466879603fe44fc959af94aac66e903adf62d8462\",\n      \"expectedResultMode\": \"100644\",\n      \"expectedResultSha256\": \"7a68f7da9ca205e7b7bc016438e09fdf5a64e3c77878e8e2e5b7bc77763e82d5\"\n    },\n    {\n      \"path\": \"project/docs/governance/CLIENT-ACCOUNTING-DELIVERY-AND-OFFICE-UX-PROGRAM-R01/MASTER-PLAN.md\",\n      \"expectedBaseMode\": \"100644\",\n      \"expectedBaseSha256\": \"7650285f584d01cc0ec6535876d0e4c7527658154ca3b052bb16bbf46ea73de3\",\n      \"expectedResultMode\": \"100644\",\n      \"expectedResultSha256\": \"d7bb36775e23e7ef6b61635bf897316b9d79ddaf8463d0e192b59cc0da9b80db\"\n    }\n  ],\n  \"createdPaths\": [],\n  \"expectedResultSha256\": \"07ef549aca37046b273060c63b849e9530cb7af9d674122940cdaad125ad0c53\"\n}\n```\n<!-- GOV_COORD_GENERIC_EXECUTION_GRANT_JSON_END -->\n",
    "evidenceSha": "1488063d60f52616d8a30debafdb6a2705fd7615",
    "expectedResultSha256": "390986624627d3c73fe07450953b39e069ce9759ee6469a8bea59852bc38ea29"
  },
  "declaredTargetAllowlist": [
    "project/docs/governance/coordination-execution-grants/CLIENT-ACCOUNTING-DELIVERY-X1-TERMINAL-CLOSEOUT-R01-EG01.md"
  ]
}
```
<!-- GOV_COORD_REQUEST_JSON_END -->

Bu request semantic veya standing authority üretmez.
