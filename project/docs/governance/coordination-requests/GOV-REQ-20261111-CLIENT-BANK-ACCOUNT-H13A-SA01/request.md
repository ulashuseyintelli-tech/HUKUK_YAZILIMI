# H-13/A supplied Client bank profile decision

Request-only. Fresh direct-owner writer assignment is limited to this single Decision Log row. Product and test/inventory registration remain a separate delivery. Prior closed turns are not reused.

<!-- GOV_COORD_REQUEST_JSON_BEGIN -->
```json
{
  "schemaVersion": 1,
  "requestId": "GOV-REQ-20261111-CLIENT-BANK-ACCOUNT-H13A-SA01",
  "requestFingerprint": "d1152ee4edbb62fff8f1298534ad3011ce06c839387b5302c08a559fa96a4e75",
  "requestedBy": "CODEX_LOCAL",
  "createdAt": "2026-11-10T21:04:15Z",
  "baseMainSha": "f1b5eab8a0886c3d0040ade1c5dae8a48074df03",
  "semanticAuthorityRef": {
    "kind": "SEMANTIC_AUTHORITY",
    "path": "project/docs/governance/decision-log.md",
    "recordId": "GOV-COORD-V2-T1-RATIFICATION",
    "evidenceSha": "f1b5eab8a0886c3d0040ade1c5dae8a48074df03"
  },
  "executionGrantRef": {
    "kind": "EXECUTION_GRANT",
    "path": "project/docs/governance/coordination-execution-grants/GOV-COORD-V1-CODEX-LOCAL.md",
    "recordId": "GOV-COORD-V1-CODEX-LOCAL",
    "evidenceSha": "f1b5eab8a0886c3d0040ade1c5dae8a48074df03"
  },
  "operation": {
    "type": "EXACT_APPEND_AT_DECLARED_ANCHOR",
    "changeClass": "LEVEL_2_MECHANICAL",
    "targetFile": "project/docs/governance/decision-log.md",
    "recordIdentity": "| Date | Decision | Scope | Source | Follow-up |",
    "anchor": "|---|---|---|---|---|",
    "expectedOldValue": "|---|---|---|---|---|",
    "newValue": "\n| 2026-11-11 | <!-- GOV-COORD-AUTHORITY kind=SEMANTIC_AUTHORITY recordId=CLIENT-BANK-ACCOUNT-H13A-SA01 --> **H-13/A - SUPPLIED OWNER MODEL A:** Client bank profile writes use only existing ClientBankAccount and a bounded profile screen; new CLIENT registrations through generic BankAccount are rejected. | Existing sensitive Client action authority AND active same-tenant canonical actor-case-CaseClient scope are required; scope alone creates no write/approval right and ADMIN/title is no object shortcut. Server resolves the child parent. Allow only bankName, branchName, iban, accountHolder and isPrimary; preserve omitted IBAN and reject masked/invalid IBAN input and identity/ORM fields. Serialize same-client duplicate/primary changes and minimized audit in the same transaction; recheck current identity/authority/scope after actual waits. Return masked IBAN only. | Owner approved model A and boundaries 1-3, activated implementation and then explicitly authorized the H-13/A commit/push/PR/required-CI/exact-head squash-merge/main-validation chain and only this row, two test registrations and one new-controller inventory entry. Supplied owner authority transcript SHA256 571833bf9fcae981e65617be300e052743a8919e36f098cc6118d5a744784aae; this is mechanical transcription, not agent ratification or a machine grant. | Fresh direct-owner writer turns are bounded to this row and the named test/inventory entries and must be returned. Preserve existing BankAccount records/history, TENANT registration, financial writers, intake/1b/K7.3, O-5/F04_RACE WIP and physical residues. No data migration/dual write, new SoT/FX/role/permission policy, showInDocuments activation, live action, identity-less Client or general Phase 4 acceptance. |",
    "evidenceSha": "f1b5eab8a0886c3d0040ade1c5dae8a48074df03",
    "expectedResultSha256": "699010cd2dd2d3bc7d77f4f3e51f3d1daeecfd94e2f0cdcca45c10006789c34c"
  },
  "declaredTargetAllowlist": [
    "project/docs/governance/decision-log.md"
  ]
}
```
<!-- GOV_COORD_REQUEST_JSON_END -->
