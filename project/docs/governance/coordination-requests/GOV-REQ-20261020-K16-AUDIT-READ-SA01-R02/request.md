# K16 audit read — owner decision transcription request

Request only. Product delivery is separate. Fresh single-row writer sequencing is required before execution; no previous CLIENT release is reused.

<!-- GOV_COORD_REQUEST_JSON_BEGIN -->
```json
{
  "schemaVersion": 1,
  "requestId": "GOV-REQ-20261020-K16-AUDIT-READ-SA01-R02",
  "requestFingerprint": "8e3ad55712abf2d1cee9752fc37c2acd31974df65900d20620caa7cb96a1fb35",
  "requestedBy": "CODEX_LOCAL",
  "createdAt": "2026-10-20T15:16:09Z",
  "baseMainSha": "0fd24519074319693b1ef7834f5bb57a8b64c49a",
  "semanticAuthorityRef": {
    "kind": "SEMANTIC_AUTHORITY",
    "path": "project/docs/governance/decision-log.md",
    "recordId": "GOV-COORD-V2-T1-RATIFICATION",
    "evidenceSha": "0fd24519074319693b1ef7834f5bb57a8b64c49a"
  },
  "executionGrantRef": {
    "kind": "EXECUTION_GRANT",
    "path": "project/docs/governance/coordination-execution-grants/GOV-COORD-V1-CODEX-LOCAL.md",
    "recordId": "GOV-COORD-V1-CODEX-LOCAL",
    "evidenceSha": "0fd24519074319693b1ef7834f5bb57a8b64c49a"
  },
  "operation": {
    "type": "EXACT_APPEND_AT_DECLARED_ANCHOR",
    "changeClass": "LEVEL_2_MECHANICAL",
    "targetFile": "project/docs/governance/decision-log.md",
    "recordIdentity": "| Date | Decision | Scope | Source | Follow-up |",
    "anchor": "|---|---|---|---|---|",
    "expectedOldValue": "|---|---|---|---|---|",
    "newValue": "\n| 2026-10-20 | <!-- GOV-COORD-AUTHORITY kind=SEMANTIC_AUTHORITY recordId=OFFICE-CLIENT-K16-AUDIT-READ-SA01 --> **K16 AUDIT READ — OWNER APPROVED PURPOSE-BOUND MODEL**: Active same-tenant ADMIN may read the three standard audit endpoints. Other active non-VIEWER actors may read only CASE / HACIZ_REQUEST_SUBMITTED history for a real same-tenant active Lawyer with CaseLawyer linkage (ASSISTANT/INTERN not excluded for this read purpose), or active Staff with CaseStaff.canView=true on that case. This is the explicit narrow access derivation required by OFF/OD-10; it grants no general case/client access, legal action, approval, signing or sending authority. | Non-ADMIN general browsing and user-activity are denied, including own userId; title/rank/delegation alone confer none. Resolve actor from trusted identity and enforce tenant/object scope before query pagination and total. Inactive, VIEWER, missing/invalid relation denied. Preserve #2991 safe projections, completed K17, internal financial audit readers and audit writes. | Owner explicit model approval and task-bound PR/required-CI/exact-head merge/main verification instruction in CODEX_LOCAL on 2026-10-20. Preserved OWNER-GO.txt SHA256 a345fd399144a82b158a90d81f9fd6e264ba0322e7cd813d105f403a8de582ce; mechanical owner-record transcription, not agent ratification or reusable grant. | Unauthorized general audit screen and dashboard show permission denied, not empty/success/stale audit data. No new permission key, generic grant UI, raw endpoint, live action or broader K16 scope. Execution requires a fresh single-row sequential writer turn; prior CLIENT releases are closed. Product delivery and production acceptance remain separate. |",
    "evidenceSha": "0fd24519074319693b1ef7834f5bb57a8b64c49a",
    "expectedResultSha256": "03ebdbdce48bb0814c7f28d097f6b5b8880278a3e11ab6fd93e3ab3c84068283"
  },
  "declaredTargetAllowlist": [
    "project/docs/governance/decision-log.md"
  ]
}
```
<!-- GOV_COORD_REQUEST_JSON_END -->
