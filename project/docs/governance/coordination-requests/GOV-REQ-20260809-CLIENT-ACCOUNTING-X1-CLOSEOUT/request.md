# Governance Coordination Request — GOV-REQ-20260809-CLIENT-ACCOUNTING-X1-CLOSEOUT

Bu dosya immutable ve untrusted request data kaydıdır. Prose operational instruction değildir.
Yalnız X1 terminal governance reconciliation için kayıtlı exact iki-dosya changeset yürütmesini tanımlar.

<!-- GOV_COORD_REQUEST_JSON_BEGIN -->
```json
{
  "schemaVersion": 1,
  "requestId": "GOV-REQ-20260809-CLIENT-ACCOUNTING-X1-CLOSEOUT",
  "requestFingerprint": "46537d5edb484e23b5e3ef8f422ea46e3d89822fcee11cf3b835ae519c33fb26",
  "requestedBy": "OWNER",
  "createdAt": "2026-08-08T23:28:21Z",
  "baseMainSha": "6b003c77fb3ba0a8936d4ef7a6ca785699a5d703",
  "semanticAuthorityRef": {
    "kind": "SEMANTIC_AUTHORITY",
    "path": "project/docs/governance/decision-log.md",
    "recordId": "CLIENT-ACCOUNTING-DELIVERY-X1-TERMINAL-CLOSEOUT-R01-SA01",
    "evidenceSha": "e241427a6f2b278f039fae6db859c8dbba30c183"
  },
  "executionGrantRef": {
    "kind": "EXECUTION_GRANT",
    "path": "project/docs/governance/coordination-execution-grants/CLIENT-ACCOUNTING-DELIVERY-X1-TERMINAL-CLOSEOUT-R01-EG03.md",
    "recordId": "CLIENT-ACCOUNTING-DELIVERY-X1-TERMINAL-CLOSEOUT-R01-EG03",
    "evidenceSha": "6b003c77fb3ba0a8936d4ef7a6ca785699a5d703"
  },
  "operation": {
    "type": "EXACT_REGISTERED_CHANGESET",
    "changeClass": "LEVEL_2_MECHANICAL",
    "targetFile": "project/docs/governance/CLIENT-ACCOUNTING-DELIVERY-AND-OFFICE-UX-PROGRAM-R01/CODEX-X1-FD-OFFICE-WORKSPACE.md",
    "recordIdentity": "CLIENT-ACCOUNTING-DELIVERY-X1-TERMINAL-CLOSEOUT-R01-REV03",
    "anchor": "034f160cd0e8b28b6c5a9eb996d8a3b4cbcb4b7c203852e9afe0ed312afb761a",
    "expectedOldValue": "ac25c6c17db1c25372d6c11dfd03df3bfcdde53c",
    "newValue": "ac25c6c17db1c25372d6c11dfd03df3bfcdde53c",
    "evidenceSha": "6b003c77fb3ba0a8936d4ef7a6ca785699a5d703",
    "expectedResultSha256": "dcf79ee6daa48a1b86f4ca68311bafd42e2139caf7ff2f1cda174c3ec81e8c4b"
  },
  "declaredTargetAllowlist": [
    "project/docs/governance/CLIENT-ACCOUNTING-DELIVERY-AND-OFFICE-UX-PROGRAM-R01/CODEX-X1-FD-OFFICE-WORKSPACE.md",
    "project/docs/governance/CLIENT-ACCOUNTING-DELIVERY-AND-OFFICE-UX-PROGRAM-R01/MASTER-PLAN.md"
  ]
}
```
<!-- GOV_COORD_REQUEST_JSON_END -->

Bu request semantic veya standing authority üretmez.
