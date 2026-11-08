# Office/Client 3c — supplied source-bound full reversal decision

Request-only; protected target and manifest are not written. Preserve completed unpaid cancellation and all unrelated work.

<!-- GOV_COORD_REQUEST_JSON_BEGIN -->
```json
{
  "schemaVersion": 1,
  "requestId": "GOV-REQ-20261108-OFFICE-EXPENSE-REVERSAL-3C-SA01",
  "requestFingerprint": "c590e5e5fdf18e06166dc1cd3c8f24b07edbe4d4df68801936398ab50a03b5dd",
  "requestedBy": "CODEX_LOCAL",
  "createdAt": "2026-11-08T09:33:24Z",
  "baseMainSha": "e95a3082a8a60935f92906d29652c3fdffbe54d6",
  "semanticAuthorityRef": {
    "kind": "SEMANTIC_AUTHORITY",
    "path": "project/docs/governance/decision-log.md",
    "recordId": "GOV-COORD-V2-T1-RATIFICATION",
    "evidenceSha": "e95a3082a8a60935f92906d29652c3fdffbe54d6"
  },
  "executionGrantRef": {
    "kind": "EXECUTION_GRANT",
    "path": "project/docs/governance/coordination-execution-grants/GOV-COORD-V1-CODEX-LOCAL.md",
    "recordId": "GOV-COORD-V1-CODEX-LOCAL",
    "evidenceSha": "e95a3082a8a60935f92906d29652c3fdffbe54d6"
  },
  "operation": {
    "type": "EXACT_APPEND_AT_DECLARED_ANCHOR",
    "changeClass": "LEVEL_2_MECHANICAL",
    "targetFile": "project/docs/governance/decision-log.md",
    "recordIdentity": "| Date | Decision | Scope | Source | Follow-up |",
    "anchor": "|---|---|---|---|---|",
    "expectedOldValue": "|---|---|---|---|---|",
    "newValue": "\n| 2026-11-08 | <!-- GOV-COORD-AUTHORITY kind=SEMANTIC_AUTHORITY recordId=OFFICE-EXPENSE-REVERSAL-3C-SA01 --> **OFFICE/CLIENT 3c — SUPPLIED OWNER DECISION, SOURCE-BOUND FULL EXPENSE PAYMENT REVERSAL:** Activate only the prepared actor-facing full correction of an original ExpensePayment. Keep the original payment/history and link its compensating records. This separately authorizes the reversal HTTP/UI slice excluded from OFFICE-EXPENSE-CANCEL-3C-SA01; the completed unpaid-cancellation/history-protection slice remains unchanged. | Require active same-tenant PARTNER/MANAGER subject-specific execution AND canonical actor-case-CaseClient scope. Resolve actual parent, original journal, CREDIT and case-owned CaseBalance server-side; caller supplies only a reason. Full original amount and exact source currency/account only, no fallback or conversion. Validate source completeness and bindings before success/replay. Under the source balance lock in the same transaction reject a negative resulting balance with 409 and no financial writes or success audit. Journal mirror, original-credit-linked DEBIT, parent recomputation, completed reversal and audit are atomic/idempotent; inconsistent partial state fails closed. Existing internal reversal/general balance policy stays unchanged. | Owner approved the source-bound full-reversal proposal, chose rejection in the new path for negative resulting balance, and authorized this exact bounded scope through focused tests, PR, required CI, exact-head merge and main verification. OWNER-AUTHORITY.txt SHA256 c98967b3fc3f3ad301f182256bd34eff8806598409bd4cc7300f8b960147911b; approved package SHA256 fa117c3df2711f8e7881d4f937038e20d6bdd40306519032c74a9bc42b60899c. Mechanical transcription of supplied owner authority, not agent ratification or a machine grant. | Preserve completed deliveries, O-5, all F04_RACE WIP and cleanup residues. Fresh one-row Decision Log and single new acceptance-manifest entry writer sequencing only; no earlier closed turn reused. No partial reversal, bank refund/money-out, automatic cancellation, actual-expense/legal-ledger reversal, global balance formula/authority change, schema/migration/backfill, live operation or general Office/Client acceptance. |",
    "evidenceSha": "e95a3082a8a60935f92906d29652c3fdffbe54d6",
    "expectedResultSha256": "f772edd7106434265642e397cc07d232cd11e182d820f547ea08e022d42bc71e"
  },
  "declaredTargetAllowlist": [
    "project/docs/governance/decision-log.md"
  ]
}
```
<!-- GOV_COORD_REQUEST_JSON_END -->
