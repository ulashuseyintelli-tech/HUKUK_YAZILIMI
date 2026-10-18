# OFFICE + CLIENT SA02 — question-bound owner decisions

Request only. No Decision Log or product mutation. The prior SA01 release is closed; execution requires a fresh SA02-only writer release with no competing write. product-backlog.md remains CLIENT-owned.

<!-- GOV_COORD_REQUEST_JSON_BEGIN -->
```json
{
  "schemaVersion": 1,
  "requestId": "GOV-REQ-20261018-OFFICE-CLIENT-APPROVED-SA02",
  "requestFingerprint": "f2e82af662e700f302e1226620811bece3979078ae57a705d2c42221c5062f8b",
  "requestedBy": "CODEX_LOCAL",
  "createdAt": "2026-10-18T02:21:27Z",
  "baseMainSha": "0ec7ee4a96dac671d9fac3f5c6feb58bd25373fd",
  "semanticAuthorityRef": {
    "kind": "SEMANTIC_AUTHORITY",
    "path": "project/docs/governance/decision-log.md",
    "recordId": "GOV-COORD-V2-T1-RATIFICATION",
    "evidenceSha": "0ec7ee4a96dac671d9fac3f5c6feb58bd25373fd"
  },
  "executionGrantRef": {
    "kind": "EXECUTION_GRANT",
    "path": "project/docs/governance/coordination-execution-grants/GOV-COORD-V1-CODEX-LOCAL.md",
    "recordId": "GOV-COORD-V1-CODEX-LOCAL",
    "evidenceSha": "0ec7ee4a96dac671d9fac3f5c6feb58bd25373fd"
  },
  "operation": {
    "type": "EXACT_APPEND_AT_DECLARED_ANCHOR",
    "changeClass": "LEVEL_2_MECHANICAL",
    "targetFile": "project/docs/governance/decision-log.md",
    "recordIdentity": "| Date | Decision | Scope | Source | Follow-up |",
    "anchor": "|---|---|---|---|---|",
    "expectedOldValue": "|---|---|---|---|---|",
    "newValue": "\n| 2026-10-18 | <!-- GOV-COORD-AUTHORITY kind=SEMANTIC_AUTHORITY recordId=OFFICE-CLIENT-APPROVED-CLOSEOUT-R01-SA02 --> **OFFICE-CLIENT-APPROVED-CLOSEOUT-R01-SA02 — OWNER CLARIFICATIONS AND NARROW DV207 MANAGEMENT AMENDMENT**: K07 payment rejects ExpenseRequest.status CANCELLED; the independent expenseApprovalStatus distribution axis remains separate and its REJECTED value is not converted into a payment ban. K09 preserves existing pending-document deletion authority with normal-error compensation; no automatic recovery guarantee after process crash is introduced. | K17 adds a separate bounded same-tenant ADMIN personal grant/revoke delivery only for client.notification-history.audit, explicit GLOBAL scope and transactionally coupled audit. Revoke expires existing ALLOW records instead of deleting them; existing DENY precedence and VIEWER history-access denial remain. No general permission-management surface or other permission key is authorized. | Explicit question-bound owner replies in this CODEX_LOCAL task on 2026-10-18; preserved OWNER-ANSWERS-SA02.txt SHA256 6e33b0d4c865f883dd40aaa0c540a048144dc201760e9f1738d1995900c10c64. Mechanically records supplied owner decisions; not agent ratification or a reusable execution grant. | Existing approved PR/required-CI/exact-head merge/main verification authority remains task-bounded. Preserve #2965/#2967 writers and CLIENT governance ownership; protected execution requires a fresh SA02-only sequential writer release. No live operation, migration, schema expansion, guard/workflow weakening or unrelated scope. Prior SA01 release is closed and cannot be reused. |",
    "evidenceSha": "0ec7ee4a96dac671d9fac3f5c6feb58bd25373fd",
    "expectedResultSha256": "a119e55ada9305b002cdbf297cd9b6f83a1861cefbcf03b73a2064fa9cb3ca90"
  },
  "declaredTargetAllowlist": [
    "project/docs/governance/decision-log.md"
  ]
}
```
<!-- GOV_COORD_REQUEST_JSON_END -->
