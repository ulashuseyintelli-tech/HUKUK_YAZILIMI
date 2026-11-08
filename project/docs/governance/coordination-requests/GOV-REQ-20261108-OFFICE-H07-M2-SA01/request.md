# H-07/M-2 supplied owner decision

Request-only; no protected target or manifest is written. F04 and O-5 writer turns are not assumed.

<!-- GOV_COORD_REQUEST_JSON_BEGIN -->
```json
{
  "schemaVersion": 1,
  "requestId": "GOV-REQ-20261108-OFFICE-H07-M2-SA01",
  "requestFingerprint": "a6f602e299110103dd1df35e801e9a2523651afde64f254d0ea2727b30016579",
  "requestedBy": "CODEX_LOCAL",
  "createdAt": "2026-11-08T18:31:29Z",
  "baseMainSha": "161e58b76817bc0f73e57a324288ae7310f4e1f7",
  "semanticAuthorityRef": {
    "kind": "SEMANTIC_AUTHORITY",
    "path": "project/docs/governance/decision-log.md",
    "recordId": "GOV-COORD-V2-T1-RATIFICATION",
    "evidenceSha": "161e58b76817bc0f73e57a324288ae7310f4e1f7"
  },
  "executionGrantRef": {
    "kind": "EXECUTION_GRANT",
    "path": "project/docs/governance/coordination-execution-grants/GOV-COORD-V1-CODEX-LOCAL.md",
    "recordId": "GOV-COORD-V1-CODEX-LOCAL",
    "evidenceSha": "161e58b76817bc0f73e57a324288ae7310f4e1f7"
  },
  "operation": {
    "type": "EXACT_APPEND_AT_DECLARED_ANCHOR",
    "changeClass": "LEVEL_2_MECHANICAL",
    "targetFile": "project/docs/governance/decision-log.md",
    "recordIdentity": "| Date | Decision | Scope | Source | Follow-up |",
    "anchor": "|---|---|---|---|---|",
    "expectedOldValue": "|---|---|---|---|---|",
    "newValue": "\n| 2026-11-08 | <!-- GOV-COORD-AUTHORITY kind=SEMANTIC_AUTHORITY recordId=OFFICE-H07-M2-SA01 --> **H-07/M-2 — SUPPLIED OWNER DECISIONS 1-4:** Case-level statement opening carries the same existing monetary sources/signs as period movement (signed BalanceLedger; matching POSTED client payable/reimbursement; RECORDED payout; payable offset APPLY/REVERSAL). Information rows stay zero; no double-counting advance offsets. Preserve exact tenant/case/canonical creditor/currency boundaries. Client-level arithmetic is unchanged; no new SoT or reconciliation precedence. | Advance writes require explicit source currency and equality with the existing account; mismatch is 409 without partial financial/request/item/journal/success audit/notification effects. First account creation remains only on an already-permitted credit path with explicit currency; expense-payment missing-account refusal and existing 3c reversal remain. No historical retagging, second-currency account, FX conversion or new role/action authority. E1 remains fail-closed, including newly included opening sources; E2 remains OPEN. | A currency-skip task resolves only after committed client-level generation for the exact tenant/client/Turkey-calendar month and supported reason. Task completion plus audit is atomic, AUTO_SYSTEM, idempotent, independent of mail delivery. Old snapshot existence alone, case-level generation, another period or failed generation does not resolve it. Existing web screens use the existing Turkey-day boundaries for new selections and retain original exact ISO boundaries when renewing an unchanged period. | Owner approved 1-4 and the prepared narrow API/web/acceptance scope, then authorized implementation, focused tests, PR, required CI, exact-head squash merge and main verification. Supplied authority evidence OWNER-AUTHORITY.txt SHA256 1dcd4a09db5eb3f36037661c903cd64652486df76674160176e6ddca1775f670; this append transcribes owner authority and is not agent ratification or a machine grant. Preserve completed intake/1b/M3b/Y3/3c, O-5, F04_RACE and cleanup residues. Fresh writer sequencing required; no live operation, migration/backfill, historic statement rewrite or general Office/Client acceptance. |",
    "evidenceSha": "161e58b76817bc0f73e57a324288ae7310f4e1f7",
    "expectedResultSha256": "fb088e0c7d8e467ae8c8c2dddb35cb5c17c78537dee10f481c50fa7757c1898c"
  },
  "declaredTargetAllowlist": [
    "project/docs/governance/decision-log.md"
  ]
}
```
<!-- GOV_COORD_REQUEST_JSON_END -->
