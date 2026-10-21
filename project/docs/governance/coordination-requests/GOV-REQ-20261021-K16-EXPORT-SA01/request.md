# K16 choice 3 — explicit owner decision transcription request

Request only; generic export product delivery is separate. Fresh direct-owner-assigned single-row turn; no closed release is reused.

<!-- GOV_COORD_REQUEST_JSON_BEGIN -->
```json
{
  "schemaVersion": 1,
  "requestId": "GOV-REQ-20261021-K16-EXPORT-SA01",
  "requestFingerprint": "0757c5e14f01d65abdc8c7c60ae6c81b4540aa24a5bc14f31d266bf8ff3f7869",
  "requestedBy": "CODEX_LOCAL",
  "createdAt": "2026-10-21T18:14:21Z",
  "baseMainSha": "fc578428e4fd9c1218a0f6714119605262caa492",
  "semanticAuthorityRef": {
    "kind": "SEMANTIC_AUTHORITY",
    "path": "project/docs/governance/decision-log.md",
    "recordId": "GOV-COORD-V2-T1-RATIFICATION",
    "evidenceSha": "fc578428e4fd9c1218a0f6714119605262caa492"
  },
  "executionGrantRef": {
    "kind": "EXECUTION_GRANT",
    "path": "project/docs/governance/coordination-execution-grants/GOV-COORD-V1-CODEX-LOCAL.md",
    "recordId": "GOV-COORD-V1-CODEX-LOCAL",
    "evidenceSha": "fc578428e4fd9c1218a0f6714119605262caa492"
  },
  "operation": {
    "type": "EXACT_APPEND_AT_DECLARED_ANCHOR",
    "changeClass": "LEVEL_2_MECHANICAL",
    "targetFile": "project/docs/governance/decision-log.md",
    "recordIdentity": "| Date | Decision | Scope | Source | Follow-up |",
    "anchor": "|---|---|---|---|---|",
    "expectedOldValue": "|---|---|---|---|---|",
    "newValue": "\n| 2026-10-21 | <!-- GOV-COORD-AUTHORITY kind=SEMANTIC_AUTHORITY recordId=OFFICE-CLIENT-K16-EXPORT-SA01 --> **K16 CHOICE 3 — OWNER APPROVED MASKED GENERIC EXPORT AND EXPLICIT OBJECT DERIVATION**: General client/case XLSX, PDF and CSV exports use list-level field minimization: mask TCKN/VKN/identityNo, IBAN, phone and email where represented; omit full street addresses and free notes. Communication-detail visibility does not grant full export. Purpose-authorized legal document generators retain their necessary raw fields; that exception does not extend to general export. | For these generic exports only, an active same-tenant non-VIEWER real Lawyer through CaseLawyer or active Staff through CaseStaff.canView=true derives scope through same-tenant cases and canonical CaseClient. No-case/unlinked/unproven rows are excluded; ADMIN/title, ReportingLine, global flags and legacy clientId alone grant nothing. Preserve tenant isolation, filters, selected IDs and response formats; no new legal, financial action, mutation, approval or sending authority. | Direct owner approved choices 1–4 and choice-3 delivery through PR, mandatory CI, exact-head merge and main verification; then expressly answered “Dar ilişkiyi maskeli genel ihracata da uygula” and “Yalnız bu satır ve manifest için devral; WIP’i koru ve iade et”. OWNER-EXPORT-DECISION.txt SHA256 e9bcc0ef349dd5fa5497abff6802ac1d945da8bedf96ab3c83fdca4420328ca9; transcription of explicit owner authority, not agent ratification or reusable grant. | Fresh one-row writer turn only; return decision-log.md to CLIENT after execution. Only this delivery test entry may update domain-integration; preserve F04_RACE WIP unchanged. Preserve #3001, O-4, K17 and completed audit work. AI choice 4, standalone debtor export, live/provider operations, new schema/migration and general OFFICE/H-service acceptance remain outside this delivery. |",
    "evidenceSha": "fc578428e4fd9c1218a0f6714119605262caa492",
    "expectedResultSha256": "43aaac566b3a397b1bf4df24a5244990c9acdd806fa60abf93aaa157fd8e7d01"
  },
  "declaredTargetAllowlist": [
    "project/docs/governance/decision-log.md"
  ]
}
```
<!-- GOV_COORD_REQUEST_JSON_END -->
