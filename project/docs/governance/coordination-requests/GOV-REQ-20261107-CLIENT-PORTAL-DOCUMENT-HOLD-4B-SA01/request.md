# Client 4b — supplied owner pending-document hold boundary

Request-only; no protected target or manifest write. Fresh single-row writer turn remains separately required.

<!-- GOV_COORD_REQUEST_JSON_BEGIN -->
```json
{
  "schemaVersion": 1,
  "requestId": "GOV-REQ-20261107-CLIENT-PORTAL-DOCUMENT-HOLD-4B-SA01",
  "requestFingerprint": "ee91b3f331c87d827c09e5fa83122af40adade498af017739c877b112ede9d4a",
  "requestedBy": "CODEX_LOCAL",
  "createdAt": "2026-11-07T09:07:02Z",
  "baseMainSha": "9362daa583f22c3734ea6106eacb7f59d9622471",
  "semanticAuthorityRef": {
    "kind": "SEMANTIC_AUTHORITY",
    "path": "project/docs/governance/decision-log.md",
    "recordId": "GOV-COORD-V2-T1-RATIFICATION",
    "evidenceSha": "9362daa583f22c3734ea6106eacb7f59d9622471"
  },
  "executionGrantRef": {
    "kind": "EXECUTION_GRANT",
    "path": "project/docs/governance/coordination-execution-grants/GOV-COORD-V1-CODEX-LOCAL.md",
    "recordId": "GOV-COORD-V1-CODEX-LOCAL",
    "evidenceSha": "9362daa583f22c3734ea6106eacb7f59d9622471"
  },
  "operation": {
    "type": "EXACT_APPEND_AT_DECLARED_ANCHOR",
    "changeClass": "LEVEL_2_MECHANICAL",
    "targetFile": "project/docs/governance/decision-log.md",
    "recordIdentity": "| Date | Decision | Scope | Source | Follow-up |",
    "anchor": "|---|---|---|---|---|",
    "expectedOldValue": "|---|---|---|---|---|",
    "newValue": "\n| 2026-11-07 | <!-- GOV-COORD-AUTHORITY kind=SEMANTIC_AUTHORITY recordId=CLIENT-PORTAL-DOCUMENT-HOLD-4B-SA01 --> **CLIENT 4b — SUPPLIED OWNER LEGAL-HOLD DELETE BOUNDARY:** An applicable active legal hold also blocks physical deletion of a pending portal document. Preserve its record and content; separately authorized review/state actions retain their existing rules. | Reuse existing tenant-scoped CLIENT/CASE/record-family hold semantics, including RELEASE_REQUESTED as active. Resolve client/case from the stored document, not browser input. Protect DB deletion/staging and final physical unlink against hold-state writers; a hold committed in the intermediate window prevents unlink and triggers normal-error compensation. Preserve K09 authorized pending-document deletion, storage containment and normal-error recovery; no process-crash recovery guarantee. Hold absence is not new deletion authority. | Owner approved package choices 1-6 and now authorizes the prepared 4b scope through focused tests, PR, required CI, exact-head merge and main verification. OWNER-AUTHORITY.txt SHA256 241b8ba87288f4c5f1b0cbd328c94af3c76a11961d516a8601bb127a5edad52f; package SHA256 fa117c3df2711f8e7881d4f937038e20d6bdd40306519032c74a9bc42b60899c. This mechanically transcribes supplied owner instructions, not agent ratification or a machine grant. | Fresh single-row writer turn required; prior 4a and other turns are closed. Extend existing selected tests rather than adding an unnecessary manifest entry. Preserve completed work, O-5/F04_RACE WIP and cleanup residues. No changed hold authorities, general retention/deletion policy, schema/migration, anonymization, bulk operation, other package choice, production or general Office/Client acceptance. |",
    "evidenceSha": "9362daa583f22c3734ea6106eacb7f59d9622471",
    "expectedResultSha256": "85c94b6d125f6e0a67b251f7073bce5b4d47b6753007f3c34f50103e22285ba6"
  },
  "declaredTargetAllowlist": [
    "project/docs/governance/decision-log.md"
  ]
}
```
<!-- GOV_COORD_REQUEST_JSON_END -->
