# CLIENT Accounting Delivery X1 Terminal Closeout — Exact Execution Grant Revision 03

<!-- GOV-COORD-AUTHORITY kind=EXECUTION_GRANT recordId=CLIENT-ACCOUNTING-DELIVERY-X1-TERMINAL-CLOSEOUT-R01-EG03 -->

This task-bound revision grant replaces unused EG01/EG02 bindings after PRs #2303
and #2310 changed the MASTER-PLAN blob. It authorizes only the exact two-file X1
terminal governance reconciliation registered below. It is hash-bound, single-use
and non-reusable.

Production activation: NOT_AUTHORIZED / NOT_PERFORMED.
Persistent activation: NOT_AUTHORIZED / OWNER_GATED / NOT_PERFORMED.
Product code or X1/X2 engineering work: NOT_AUTHORIZED.
Product test rerun: NOT_AUTHORIZED.
Other lane status mutation: NOT_AUTHORIZED.
Standing authority: PROHIBITED. Reusable authority: PROHIBITED.
Governance framework repair or scope expansion: PROHIBITED.
EG01/EG02 reuse or mutation: PROHIBITED.

<!-- GOV_COORD_GENERIC_EXECUTION_GRANT_JSON_BEGIN -->
```json
{
  "schemaVersion": 1,
  "taskId": "CLIENT-ACCOUNTING-DELIVERY-X1-TERMINAL-CLOSEOUT-R01-REV03",
  "semanticAuthorityId": "CLIENT-ACCOUNTING-DELIVERY-X1-TERMINAL-CLOSEOUT-R01-SA01",
  "executionGrantId": "CLIENT-ACCOUNTING-DELIVERY-X1-TERMINAL-CLOSEOUT-R01-EG03",
  "grantNonce": "034f160cd0e8b28b6c5a9eb996d8a3b4cbcb4b7c203852e9afe0ed312afb761a",
  "baseSha": "ac25c6c17db1c25372d6c11dfd03df3bfcdde53c",
  "publicationBindingSha": "ac25c6c17db1c25372d6c11dfd03df3bfcdde53c",
  "executionMode": "EXACT_REGISTERED_CHANGESET",
  "effectiveFrom": "2026-08-08T00:00:00Z",
  "expiresAt": "2026-08-16T23:59:59Z",
  "modifiedPaths": [
    {
      "path": "project/docs/governance/CLIENT-ACCOUNTING-DELIVERY-AND-OFFICE-UX-PROGRAM-R01/CODEX-X1-FD-OFFICE-WORKSPACE.md",
      "expectedBaseMode": "100644",
      "expectedBaseSha256": "3a259cd0b1946d4fa04f1a4466879603fe44fc959af94aac66e903adf62d8462",
      "expectedResultMode": "100644",
      "expectedResultSha256": "7a68f7da9ca205e7b7bc016438e09fdf5a64e3c77878e8e2e5b7bc77763e82d5"
    },
    {
      "path": "project/docs/governance/CLIENT-ACCOUNTING-DELIVERY-AND-OFFICE-UX-PROGRAM-R01/MASTER-PLAN.md",
      "expectedBaseMode": "100644",
      "expectedBaseSha256": "f0c3f5a977797382291815ecaf867a2790968a0b40ebf6b3722f5ddb2ad04949",
      "expectedResultMode": "100644",
      "expectedResultSha256": "78bc045666e7e6cb028fb4fe16d17c0dc1f9330e6cdcf7ac138649dd0ebb40be"
    }
  ],
  "createdPaths": [],
  "expectedResultSha256": "dcf79ee6daa48a1b86f4ca68311bafd42e2139caf7ff2f1cda174c3ec81e8c4b"
}
```
<!-- GOV_COORD_GENERIC_EXECUTION_GRANT_JSON_END -->
