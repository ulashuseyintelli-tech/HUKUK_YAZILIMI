# CLIENT Accounting Delivery X1 Terminal Closeout — Exact Execution Grant Revision 02

<!-- GOV-COORD-AUTHORITY kind=EXECUTION_GRANT recordId=CLIENT-ACCOUNTING-DELIVERY-X1-TERMINAL-CLOSEOUT-R01-EG02 -->

This task-bound revision grant replaces the unused EG01 binding after PR #2303
changed the MASTER-PLAN blob. It authorizes only the exact two-file X1 terminal
governance reconciliation registered below. It is hash-bound, single-use and non-reusable.

Production activation: NOT_AUTHORIZED / NOT_PERFORMED.
Persistent activation: NOT_AUTHORIZED / OWNER_GATED / NOT_PERFORMED.
Product code or X1/X2 engineering work: NOT_AUTHORIZED.
Product test rerun: NOT_AUTHORIZED.
Other lane status mutation: NOT_AUTHORIZED.
Standing authority: PROHIBITED. Reusable authority: PROHIBITED.
Governance framework repair or scope expansion: PROHIBITED.
EG01 reuse or mutation: PROHIBITED.

<!-- GOV_COORD_GENERIC_EXECUTION_GRANT_JSON_BEGIN -->
```json
{
  "schemaVersion": 1,
  "taskId": "CLIENT-ACCOUNTING-DELIVERY-X1-TERMINAL-CLOSEOUT-R01-REV02",
  "semanticAuthorityId": "CLIENT-ACCOUNTING-DELIVERY-X1-TERMINAL-CLOSEOUT-R01-SA01",
  "executionGrantId": "CLIENT-ACCOUNTING-DELIVERY-X1-TERMINAL-CLOSEOUT-R01-EG02",
  "grantNonce": "d3adad50f44fc1385850cde67ffc7872ea761f21c64bae4a33259dcc8cdfc132",
  "baseSha": "4bb6ebb3772d8c1f05878e1366cc4b22d2fc9f92",
  "publicationBindingSha": "4bb6ebb3772d8c1f05878e1366cc4b22d2fc9f92",
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
      "expectedBaseSha256": "53d23c9d475a6f504fdee3cc84083c03b24a93395a020146871010c30ad6a9d5",
      "expectedResultMode": "100644",
      "expectedResultSha256": "f090f92e77599b25d5a1dbec1dd2dd3012ea75f1ff8d2a2fed38bcc8ba9ecb63"
    }
  ],
  "createdPaths": [],
  "expectedResultSha256": "f73688914f30d4224a26105229a7feeace95fd86bfa904b429285a143f0fc27c"
}
```
<!-- GOV_COORD_GENERIC_EXECUTION_GRANT_JSON_END -->
