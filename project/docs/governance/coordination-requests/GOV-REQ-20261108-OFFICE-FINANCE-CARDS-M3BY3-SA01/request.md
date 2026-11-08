# Office/Client M3b + Y3 — supplied finance cards and payment decision

Request-only; protected target and manifest are not written. Preserve completed work and all unrelated WIP.

<!-- GOV_COORD_REQUEST_JSON_BEGIN -->
```json
{
  "schemaVersion": 1,
  "requestId": "GOV-REQ-20261108-OFFICE-FINANCE-CARDS-M3BY3-SA01",
  "requestFingerprint": "876598f4a4ce0910cca947570852013056dd8c2160c48c26c2ea5ccfc115e6f2",
  "requestedBy": "CODEX_LOCAL",
  "createdAt": "2026-11-08T15:28:34Z",
  "baseMainSha": "c6fd10293b37aff4435faa34390f9a245804e7e6",
  "semanticAuthorityRef": {
    "kind": "SEMANTIC_AUTHORITY",
    "path": "project/docs/governance/decision-log.md",
    "recordId": "GOV-COORD-V2-T1-RATIFICATION",
    "evidenceSha": "c6fd10293b37aff4435faa34390f9a245804e7e6"
  },
  "executionGrantRef": {
    "kind": "EXECUTION_GRANT",
    "path": "project/docs/governance/coordination-execution-grants/GOV-COORD-V1-CODEX-LOCAL.md",
    "recordId": "GOV-COORD-V1-CODEX-LOCAL",
    "evidenceSha": "c6fd10293b37aff4435faa34390f9a245804e7e6"
  },
  "operation": {
    "type": "EXACT_APPEND_AT_DECLARED_ANCHOR",
    "changeClass": "LEVEL_2_MECHANICAL",
    "targetFile": "project/docs/governance/decision-log.md",
    "recordIdentity": "| Date | Decision | Scope | Source | Follow-up |",
    "anchor": "|---|---|---|---|---|",
    "expectedOldValue": "|---|---|---|---|---|",
    "newValue": "\n| 2026-11-08 | <!-- GOV-COORD-AUTHORITY kind=SEMANTIC_AUTHORITY recordId=OFFICE-FINANCE-CARDS-M3BY3-SA01 --> **OFFICE/CLIENT M3b + Y3 — SUPPLIED OWNER DECISION:** Show client payable separately using the existing server outstanding by canonical CaseClient and explicit currency. Show only source-proven typed EXPENSE_ACTUAL totals, server-calculated in exact decimal by case and currency, explicitly labelled typed-record scope. Generic debit, payment CREDIT, advance offset and 3c payment reversal are excluded. No historical reclassification, client-level expense allocation or new balance formula/precedence. | Activate both payment/receive routes through the unchanged atomic payment command and the Finance payment action. Reuse RECORD_EXPENSE_PAYMENT with mandatory fail-closed CPE, MEDIUM risk and stage independence; preserve existing L2/FINANCIAL classification, actor/tenant, closed/archived/terminal, idempotency, CANCELLED and missing/mismatched-advance rejection. Reads do not create balances or dispatch. No UI financial aggregation, implicit currency conversion or stale-context result. Actual-expense entry and its ADMIN gate remain unchanged. | Owner approved M3b + Y3 and the prepared API/web boundary, then explicitly authorized focused tests, PR, required CI, exact-head merge and main verification. OWNER-AUTHORITY.txt SHA256 a84dc262a2b234fc2ebd98aba9ac3e2a1113059e404c9842a14087098ab10606. This is mechanical transcription of supplied authority, not agent ratification or a machine grant. | Preserve completed deliveries, O-5, F04_RACE and cleanup residues. Fresh one-row Decision Log and one acceptance-manifest writer sequence only; prior closed turns are not reused. No new SoT, currency/FX policy, role/permission/approval authority, account auto-creation, actual-expense write UI, schema/migration/backfill, bank execution, live operation or general Office/Client acceptance. |",
    "evidenceSha": "c6fd10293b37aff4435faa34390f9a245804e7e6",
    "expectedResultSha256": "0c0101df22aacc8cf0f2fbd9a3fec969fde53a98b0af55fc015d017a7002a5ae"
  },
  "declaredTargetAllowlist": [
    "project/docs/governance/decision-log.md"
  ]
}
```
<!-- GOV_COORD_REQUEST_JSON_END -->
