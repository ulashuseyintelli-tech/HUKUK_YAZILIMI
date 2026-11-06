# Office/Client 3a / T-3 — supplied pre-send approval decision

Request-only; no protected target is written. New narrow writer sequencing is required. Earlier closed turns are not reused.

<!-- GOV_COORD_REQUEST_JSON_BEGIN -->
```json
{
  "schemaVersion": 1,
  "requestId": "GOV-REQ-20261106-OFFICE-EXPENSE-SEND-3A-SA01",
  "requestFingerprint": "a6eed1db6af482dcd67aa6796809604f1258122cbc929dbc0dcb66f62e557942",
  "requestedBy": "CODEX_LOCAL",
  "createdAt": "2026-11-06T18:36:22Z",
  "baseMainSha": "a5716abb66ebc990282a29dc25409c8dece10ed2",
  "semanticAuthorityRef": {
    "kind": "SEMANTIC_AUTHORITY",
    "path": "project/docs/governance/decision-log.md",
    "recordId": "GOV-COORD-V2-T1-RATIFICATION",
    "evidenceSha": "a5716abb66ebc990282a29dc25409c8dece10ed2"
  },
  "executionGrantRef": {
    "kind": "EXECUTION_GRANT",
    "path": "project/docs/governance/coordination-execution-grants/GOV-COORD-V1-CODEX-LOCAL.md",
    "recordId": "GOV-COORD-V1-CODEX-LOCAL",
    "evidenceSha": "a5716abb66ebc990282a29dc25409c8dece10ed2"
  },
  "operation": {
    "type": "EXACT_APPEND_AT_DECLARED_ANCHOR",
    "changeClass": "LEVEL_2_MECHANICAL",
    "targetFile": "project/docs/governance/decision-log.md",
    "recordIdentity": "| Date | Decision | Scope | Source | Follow-up |",
    "anchor": "|---|---|---|---|---|",
    "expectedOldValue": "|---|---|---|---|---|",
    "newValue": "\n| 2026-11-06 | <!-- GOV-COORD-AUTHORITY kind=SEMANTIC_AUTHORITY recordId=OFFICE-EXPENSE-SEND-3A-SA01 --> **OFFICE/CLIENT 3a / T-3 — SUPPLIED OWNER DECISION RECORDED:** A new expense request, or one whose amount, content or recipient target has changed, requires internal approval before its first real client-facing send by an existing action-eligible approver distinct from its requester. A safe transport retry of the same approved content is not a new business approval. Send approval and distribution-eligibility approval remain separate. | Reuse OfficeApprovalRequest and existing subject-specific eligibility, person-level independence, tenant/object scope and transport idempotency. Cover actual expense dispatch, opening automation, reminder and expense-linked legacy/resend consumers; no system-actor bypass. Bind approval to server-derived content and actual resolved recipient; changed or unproven binding cannot send. No new approval engine, blanket ALL override, role normalization, financial edit route, migration/backfill, new channel or live activation. | Owner approved package 1–6 and expressly authorized implementation of the prepared 3a/T-3 boundary through focused tests, PR, required CI, exact-head merge and main verification. OWNER-AUTHORITY.txt SHA256 e3372ce411a43307430047efb9bc9c69974b74806f32835f9a9d7c333e0dcaa0; approved package SHA256 fa117c3df2711f8e7881d4f937038e20d6bdd40306519032c74a9bc42b60899c. This mechanically transcribes supplied owner authority; it is not agent ratification or a machine grant. | MK-04 historically also denotes distribution approval (T-2); this row concerns only 3a/T-3 pre-send approval. Preserve completed intake, 1b, AK-1c, 2b/2c, distribution/payment/FD rules, O-5, F04_RACE WIP and cleanup residues. Coordinate fresh narrow Decision Log and test-manifest writer turns and return them after delivery. 3b/3c and production/general Office/Client acceptance are outside this task. |",
    "evidenceSha": "a5716abb66ebc990282a29dc25409c8dece10ed2",
    "expectedResultSha256": "d1ea32965759d6b9cb3327a96a399d0be01bd7371f1440e30060cd775fae76dc"
  },
  "declaredTargetAllowlist": [
    "project/docs/governance/decision-log.md"
  ]
}
```
<!-- GOV_COORD_REQUEST_JSON_END -->
