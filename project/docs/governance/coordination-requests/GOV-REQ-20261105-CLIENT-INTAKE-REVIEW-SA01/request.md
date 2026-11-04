# Intake review management — direct owner decision transcription request

Request-only. No decision-log write or product acceptance is claimed. A fresh writer turn is required before execution.

<!-- GOV_COORD_REQUEST_JSON_BEGIN -->
```json
{
  "schemaVersion": 1,
  "requestId": "GOV-REQ-20261105-CLIENT-INTAKE-REVIEW-SA01",
  "requestFingerprint": "8166dc193dd3af1d4fd0982e2a7761481a1401c56b45092ba6b6133a9b7d5d0b",
  "requestedBy": "CODEX_LOCAL",
  "createdAt": "2026-11-04T21:17:48Z",
  "baseMainSha": "e82805c1b5e137460ad7642c71ec6b301cac14a0",
  "semanticAuthorityRef": {
    "kind": "SEMANTIC_AUTHORITY",
    "path": "project/docs/governance/decision-log.md",
    "recordId": "GOV-COORD-V2-T1-RATIFICATION",
    "evidenceSha": "e82805c1b5e137460ad7642c71ec6b301cac14a0"
  },
  "executionGrantRef": {
    "kind": "EXECUTION_GRANT",
    "path": "project/docs/governance/coordination-execution-grants/GOV-COORD-V1-CODEX-LOCAL.md",
    "recordId": "GOV-COORD-V1-CODEX-LOCAL",
    "evidenceSha": "e82805c1b5e137460ad7642c71ec6b301cac14a0"
  },
  "operation": {
    "type": "EXACT_APPEND_AT_DECLARED_ANCHOR",
    "changeClass": "LEVEL_2_MECHANICAL",
    "targetFile": "project/docs/governance/decision-log.md",
    "recordIdentity": "| Date | Decision | Scope | Source | Follow-up |",
    "anchor": "|---|---|---|---|---|",
    "expectedOldValue": "|---|---|---|---|---|",
    "newValue": "\n| 2026-11-05 | <!-- GOV-COORD-AUTHORITY kind=SEMANTIC_AUTHORITY recordId=CLIENT-INTAKE-REVIEW-MANAGE-LINK-SA01 --> **INTAKE REVIEW PERMISSION ADMINISTRATION AND EXISTING PROMOTION LINK — OWNER APPROVED BOUNDED DELIVERY:** An active same-tenant ADMIN may grant/revoke only personal GLOBAL client.intake.review ALLOW, preserving effective DENY precedence and VIEWER write denial. Permission mutation and audit are atomic. Existing review consumer/actor-profile requirements remain; permission administration does not grant review or promotion to ADMIN by title. | Add only a minimal ADMIN UI/API, bounded subject projection and existing-review-detail link to the existing field-level promotion screen. Server capability consumes existing promotion eligibility plus VIEWER write denial; review grant never substitutes for promotion eligibility. Preserve revocation history, tenant checks, existing promotion invariants and separate audit. No new role matrix, four-eyes requirement, schema/migration, public intake/token/send change, ASSET/CONTACT UI activation, or general object-scope expansion. Approved decisions 1b and 2–6 and unready choices remain outside this first delivery. | Direct owner approved 1–6 with proposed subanswers, then explicitly requested implementation through PR, mandatory CI, exact-head merge and main verification with no live action. OWNER-AUTHORITY.txt SHA256 9fececaee280874885a62c789ada710e2ec74f606bc32f198d5375a01d5707af; boundary R01 SHA256 6bbeb1fd91ebed9f7e6fff60efc6de91bf7fa2fdcf8b3ef5091688a6f36f4c34. Transcription of owner authority, not agent ratification or reusable grant. | Record execution requires a fresh single-row decision-log writer turn; closed CLIENT handoffs are not reused. F04_RACE manifest WIP is preserved; its writer order is separate. Source delivery, test/CI, publication and product acceptance remain distinct. This record grants no live operation or Office/Client seal. |",
    "evidenceSha": "e82805c1b5e137460ad7642c71ec6b301cac14a0",
    "expectedResultSha256": "076907c7a4a94374f4f7c65902f88d32509ba90148942d2e58b4ac9c41aae5dc"
  },
  "declaredTargetAllowlist": [
    "project/docs/governance/decision-log.md"
  ]
}
```
<!-- GOV_COORD_REQUEST_JSON_END -->
