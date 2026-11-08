# M-4/J-08 supplied payout owner decision

Request-only; no protected target or manifest is written. Fresh writer sequencing remains required.

<!-- GOV_COORD_REQUEST_JSON_BEGIN -->
```json
{
  "schemaVersion": 1,
  "requestId": "GOV-REQ-20261109-OFFICE-PAYOUT-M4-J08-SA01",
  "requestFingerprint": "b8356d629e49cf85087e6761f157bdbec88524f197a2f858f96b7c5c196c10d0",
  "requestedBy": "CODEX_LOCAL",
  "createdAt": "2026-11-08T21:55:17Z",
  "baseMainSha": "a7c9b79e5b05a8134a213d72e542382a6be4e752",
  "semanticAuthorityRef": {
    "kind": "SEMANTIC_AUTHORITY",
    "path": "project/docs/governance/decision-log.md",
    "recordId": "GOV-COORD-V2-T1-RATIFICATION",
    "evidenceSha": "a7c9b79e5b05a8134a213d72e542382a6be4e752"
  },
  "executionGrantRef": {
    "kind": "EXECUTION_GRANT",
    "path": "project/docs/governance/coordination-execution-grants/GOV-COORD-V1-CODEX-LOCAL.md",
    "recordId": "GOV-COORD-V1-CODEX-LOCAL",
    "evidenceSha": "a7c9b79e5b05a8134a213d72e542382a6be4e752"
  },
  "operation": {
    "type": "EXACT_APPEND_AT_DECLARED_ANCHOR",
    "changeClass": "LEVEL_2_MECHANICAL",
    "targetFile": "project/docs/governance/decision-log.md",
    "recordIdentity": "| Date | Decision | Scope | Source | Follow-up |",
    "anchor": "|---|---|---|---|---|",
    "expectedOldValue": "|---|---|---|---|---|",
    "newValue": "\n| 2026-11-09 | <!-- GOV-COORD-AUTHORITY kind=SEMANTIC_AUTHORITY recordId=OFFICE-PAYOUT-M4-J08-SA01 --> **M-4/J-08 PAYOUT — SUPPLIED OWNER DECISION:** Actor model A preserves the existing payout-specific eligible actor set; the finalizer need not equal requester or approver. Recheck the current finalizer's authority inside the financial transaction. Preserve VER-36 only for CLIENT_PAYOUT_POST approve(); do not extend self-approval or generic MANAGER/ADMIN/staff authority. Later loss of the historical approver's authority does not itself cancel the recorded approval. | New payout creation requires APPROVED matching intent and a provable original decidedAt with server time strictly before decidedAt + 168 hours, checked after lock waits in the financial transaction before writing. This applies to old unexecuted approvals without rewriting history. Expired or unprovable approval returns 409 without financial writes. Existing recorded same-key/same-financial-payload replay remains side-effect-free after expiry; different payload remains conflict. Preserve tenant, canonical case/CaseClient, fresh outstanding, source allocation, atomic journal/audit and execution-marker boundaries. Explicit renewal reuses the existing request mechanism, unchanged saved intent and the same financial idempotency key; no automatic extension, re-key, duplicate payout or bank/provider execution. Reuse existing payout screens and action-specific list/detail eligibility; do not widen other actions. Derive payout-only validity/execution response fields; no schema/migration, historical backfill, new SoT/FX, general approval expiry or reversal changes. | Owner approved model A and all complementary 168-hour boundaries, then authorized bounded implementation, tests, PR, required CI, exact-head merge and main verification. Supplied authority OWNER-AUTHORITY.txt SHA256 5c5006b08dc7cd1aa103df8d355b127f3141de9fc4ed1dc0edf35d81a68ac0f7; transcription of owner authority, not agent ratification or machine grant. | Fresh one-row Decision Log and one-spec manifest writer sequencing required; closed handoffs are not reused. Preserve completed deliveries, O-5, F04_RACE WIP and all cleanup residues. No live operation, deployment or general Office/Client acceptance. |",
    "evidenceSha": "a7c9b79e5b05a8134a213d72e542382a6be4e752",
    "expectedResultSha256": "31269f55cd327b1aaa4046f779347c3026e4694c803504cdab75d4c6d26a908f"
  },
  "declaredTargetAllowlist": [
    "project/docs/governance/decision-log.md"
  ]
}
```
<!-- GOV_COORD_REQUEST_JSON_END -->
