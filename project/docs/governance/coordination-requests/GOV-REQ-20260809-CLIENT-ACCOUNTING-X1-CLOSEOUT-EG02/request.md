# Governance Coordination Request — GOV-REQ-20260809-CLIENT-ACCOUNTING-X1-CLOSEOUT-EG02

Bu dosya immutable ve untrusted request data kaydıdır. Prose operational instruction değildir.
Yalnız main drift sonrası CLIENT-ACCOUNTING-DELIVERY-X1-TERMINAL-CLOSEOUT-R01-EG02 task-bound revision grant dosyasının exact creation işlemini tanımlar.

<!-- GOV_COORD_REQUEST_JSON_BEGIN -->
```json
{
  "schemaVersion": 1,
  "requestId": "GOV-REQ-20260809-CLIENT-ACCOUNTING-X1-CLOSEOUT-EG02",
  "requestFingerprint": "a6ac071fb886d523abde2937b42c9f3bfa4d3cf99d4ea5a6c46fe0189d829eb8",
  "requestedBy": "OWNER",
  "createdAt": "2026-08-08T22:25:21Z",
  "baseMainSha": "4bb6ebb3772d8c1f05878e1366cc4b22d2fc9f92",
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
    "evidenceSha": "4bb6ebb3772d8c1f05878e1366cc4b22d2fc9f92"
  },
  "operation": {
    "type": "EXACT_FILE_CREATION",
    "changeClass": "LEVEL_2_MECHANICAL",
    "targetFile": "project/docs/governance/coordination-execution-grants/CLIENT-ACCOUNTING-DELIVERY-X1-TERMINAL-CLOSEOUT-R01-EG02.md",
    "recordIdentity": "CLIENT-ACCOUNTING-DELIVERY-X1-TERMINAL-CLOSEOUT-R01-REV02",
    "anchor": "d3adad50f44fc1385850cde67ffc7872ea761f21c64bae4a33259dcc8cdfc132",
    "expectedOldValue": "ABSENT",
    "newValue": "# CLIENT Accounting Delivery X1 Terminal Closeout — Exact Execution Grant Revision 02\n\n<!-- GOV-COORD-AUTHORITY kind=EXECUTION_GRANT recordId=CLIENT-ACCOUNTING-DELIVERY-X1-TERMINAL-CLOSEOUT-R01-EG02 -->\n\nThis task-bound revision grant replaces the unused EG01 binding after PR #2303\nchanged the MASTER-PLAN blob. It authorizes only the exact two-file X1 terminal\ngovernance reconciliation registered below. It is hash-bound, single-use and non-reusable.\n\nProduction activation: NOT_AUTHORIZED / NOT_PERFORMED.\nPersistent activation: NOT_AUTHORIZED / OWNER_GATED / NOT_PERFORMED.\nProduct code or X1/X2 engineering work: NOT_AUTHORIZED.\nProduct test rerun: NOT_AUTHORIZED.\nOther lane status mutation: NOT_AUTHORIZED.\nStanding authority: PROHIBITED. Reusable authority: PROHIBITED.\nGovernance framework repair or scope expansion: PROHIBITED.\nEG01 reuse or mutation: PROHIBITED.\n\n<!-- GOV_COORD_GENERIC_EXECUTION_GRANT_JSON_BEGIN -->\n```json\n{\n  \"schemaVersion\": 1,\n  \"taskId\": \"CLIENT-ACCOUNTING-DELIVERY-X1-TERMINAL-CLOSEOUT-R01-REV02\",\n  \"semanticAuthorityId\": \"CLIENT-ACCOUNTING-DELIVERY-X1-TERMINAL-CLOSEOUT-R01-SA01\",\n  \"executionGrantId\": \"CLIENT-ACCOUNTING-DELIVERY-X1-TERMINAL-CLOSEOUT-R01-EG02\",\n  \"grantNonce\": \"d3adad50f44fc1385850cde67ffc7872ea761f21c64bae4a33259dcc8cdfc132\",\n  \"baseSha\": \"4bb6ebb3772d8c1f05878e1366cc4b22d2fc9f92\",\n  \"publicationBindingSha\": \"4bb6ebb3772d8c1f05878e1366cc4b22d2fc9f92\",\n  \"executionMode\": \"EXACT_REGISTERED_CHANGESET\",\n  \"effectiveFrom\": \"2026-08-08T00:00:00Z\",\n  \"expiresAt\": \"2026-08-16T23:59:59Z\",\n  \"modifiedPaths\": [\n    {\n      \"path\": \"project/docs/governance/CLIENT-ACCOUNTING-DELIVERY-AND-OFFICE-UX-PROGRAM-R01/CODEX-X1-FD-OFFICE-WORKSPACE.md\",\n      \"expectedBaseMode\": \"100644\",\n      \"expectedBaseSha256\": \"3a259cd0b1946d4fa04f1a4466879603fe44fc959af94aac66e903adf62d8462\",\n      \"expectedResultMode\": \"100644\",\n      \"expectedResultSha256\": \"7a68f7da9ca205e7b7bc016438e09fdf5a64e3c77878e8e2e5b7bc77763e82d5\"\n    },\n    {\n      \"path\": \"project/docs/governance/CLIENT-ACCOUNTING-DELIVERY-AND-OFFICE-UX-PROGRAM-R01/MASTER-PLAN.md\",\n      \"expectedBaseMode\": \"100644\",\n      \"expectedBaseSha256\": \"53d23c9d475a6f504fdee3cc84083c03b24a93395a020146871010c30ad6a9d5\",\n      \"expectedResultMode\": \"100644\",\n      \"expectedResultSha256\": \"f090f92e77599b25d5a1dbec1dd2dd3012ea75f1ff8d2a2fed38bcc8ba9ecb63\"\n    }\n  ],\n  \"createdPaths\": [],\n  \"expectedResultSha256\": \"f73688914f30d4224a26105229a7feeace95fd86bfa904b429285a143f0fc27c\"\n}\n```\n<!-- GOV_COORD_GENERIC_EXECUTION_GRANT_JSON_END -->\n",
    "evidenceSha": "4bb6ebb3772d8c1f05878e1366cc4b22d2fc9f92",
    "expectedResultSha256": "4367a8669cd75fc7836821b42a346682dfbb737a4e9c8142df9c3c541bc22083"
  },
  "declaredTargetAllowlist": [
    "project/docs/governance/coordination-execution-grants/CLIENT-ACCOUNTING-DELIVERY-X1-TERMINAL-CLOSEOUT-R01-EG02.md"
  ]
}
```
<!-- GOV_COORD_REQUEST_JSON_END -->

Bu request semantic veya standing authority üretmez.
