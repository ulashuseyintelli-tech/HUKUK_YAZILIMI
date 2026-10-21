# K16 choice 2 — explicit owner decision transcription request

Request only; product delivery is separate. Fresh one-row writer coordination is required; prior turns are closed.

<!-- GOV_COORD_REQUEST_JSON_BEGIN -->
```json
{
  "schemaVersion": 1,
  "requestId": "GOV-REQ-20261021-K16-INTERNAL-READ-SA01",
  "requestFingerprint": "1a028280d838af816150949152450401709c0413a957bd8def9a7106a36aa31d",
  "requestedBy": "CODEX_LOCAL",
  "createdAt": "2026-10-21T06:08:05Z",
  "baseMainSha": "c0d8a317b19fe9be7ee35e2d1dcb835d583bb964",
  "semanticAuthorityRef": {
    "kind": "SEMANTIC_AUTHORITY",
    "path": "project/docs/governance/decision-log.md",
    "recordId": "GOV-COORD-V2-T1-RATIFICATION",
    "evidenceSha": "c0d8a317b19fe9be7ee35e2d1dcb835d583bb964"
  },
  "executionGrantRef": {
    "kind": "EXECUTION_GRANT",
    "path": "project/docs/governance/coordination-execution-grants/GOV-COORD-V1-CODEX-LOCAL.md",
    "recordId": "GOV-COORD-V1-CODEX-LOCAL",
    "evidenceSha": "c0d8a317b19fe9be7ee35e2d1dcb835d583bb964"
  },
  "operation": {
    "type": "EXACT_APPEND_AT_DECLARED_ANCHOR",
    "changeClass": "LEVEL_2_MECHANICAL",
    "targetFile": "project/docs/governance/decision-log.md",
    "recordIdentity": "| Date | Decision | Scope | Source | Follow-up |",
    "anchor": "|---|---|---|---|---|",
    "expectedOldValue": "|---|---|---|---|---|",
    "newValue": "\n| 2026-10-21 | <!-- GOV-COORD-AUTHORITY kind=SEMANTIC_AUTHORITY recordId=OFFICE-CLIENT-K16-INTERNAL-READ-SA01 --> **K16 CHOICE 2 — OWNER APPROVED INTERNAL CLIENT READ FIELDS AND EXPLICIT OBJECT DERIVATION**: Internal client list/search mask TCKN/VKN/identityNo, IBAN, phone and email; omit full street address and free notes. Independently authorized communication detail may return phone/email/address, while identity/IBAN remain masked and free notes remain omitted. ADMIN/title alone does not unmask or grant object access. | For these internal client HTTP reads only, an active same-tenant non-VIEWER real Lawyer with CaseLawyer, or active Staff with CaseStaff.canView=true, derives client read scope solely through a same-tenant case and canonical CaseClient. No-case/unlinked/unproven objects are denied; no legacy Case.clientId fallback, role/title/ReportingLine/global or audit-grant shortcut. This explicit narrow derivation satisfies OFF/OD-10; it grants no legal action, mutation, approval or sending authority. | Owner approved choices 1–4 and choice-2 delivery, then expressly approved this proposed relation derivation and PR/required-CI/exact-head merge/main verification in CODEX_LOCAL on 2026-10-21. OWNER-OBJECT-DECISION.txt SHA256 e1f66d42c42defa7d97095863f6240b3251cba077a14452e98a9463cf38b492a; transcription of explicit owner authority, not agent ratification or reusable grant. | Preserve O-4, #2963, K17, #2991/#2993, raw internal/mutation/document readers and edit data: unchanged masked identities or omitted hidden notes must not overwrite source values. Fresh single-row writer coordination required; prior turns closed. Export/AI choices 3–4, new grant/schema/migration, live/provider operations and general OFFICE/H-service acceptance remain outside this delivery. |",
    "evidenceSha": "c0d8a317b19fe9be7ee35e2d1dcb835d583bb964",
    "expectedResultSha256": "bc4a3bdb6a16b362fe94f7ff313d2ce3228132819ac2e29feccf3649721325a5"
  },
  "declaredTargetAllowlist": [
    "project/docs/governance/decision-log.md"
  ]
}
```
<!-- GOV_COORD_REQUEST_JSON_END -->
