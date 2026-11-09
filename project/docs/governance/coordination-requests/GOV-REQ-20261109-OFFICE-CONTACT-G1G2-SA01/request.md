# G1/G2 supplied contact-management owner decision

Request-only; fresh narrow Decision Log, manifest and O-5 writer sequencing is pending.

<!-- GOV_COORD_REQUEST_JSON_BEGIN -->
```json
{
  "schemaVersion": 1,
  "requestId": "GOV-REQ-20261109-OFFICE-CONTACT-G1G2-SA01",
  "requestFingerprint": "32efa5e2e04174264cdbd37ce6afb8ff4608b5e5e7beebefd379442c5341fccd",
  "requestedBy": "CODEX_LOCAL",
  "createdAt": "2026-11-09T13:35:15Z",
  "baseMainSha": "ae7072810544d1572e6eda082240f4bd24d2a68e",
  "semanticAuthorityRef": {
    "kind": "SEMANTIC_AUTHORITY",
    "path": "project/docs/governance/decision-log.md",
    "recordId": "GOV-COORD-V2-T1-RATIFICATION",
    "evidenceSha": "ae7072810544d1572e6eda082240f4bd24d2a68e"
  },
  "executionGrantRef": {
    "kind": "EXECUTION_GRANT",
    "path": "project/docs/governance/coordination-execution-grants/GOV-COORD-V1-CODEX-LOCAL.md",
    "recordId": "GOV-COORD-V1-CODEX-LOCAL",
    "evidenceSha": "ae7072810544d1572e6eda082240f4bd24d2a68e"
  },
  "operation": {
    "type": "EXACT_APPEND_AT_DECLARED_ANCHOR",
    "changeClass": "LEVEL_2_MECHANICAL",
    "targetFile": "project/docs/governance/decision-log.md",
    "recordIdentity": "| Date | Decision | Scope | Source | Follow-up |",
    "anchor": "|---|---|---|---|---|",
    "expectedOldValue": "|---|---|---|---|---|",
    "newValue": "\n| 2026-11-09 | <!-- GOV-COORD-AUTHORITY kind=SEMANTIC_AUTHORITY recordId=OFFICE-CONTACT-G1G2-SA01 --> **G1/G2 CONTACT MANAGEMENT — SUPPLIED OWNER MODEL A:** Preserve existing F01 eligibility and projections. Additional action-specific personal permissions require active User and active canonical StaffMember in the same proven tenant/office, excluding VIEWER writes. G1 office fields: address, city, district, postalCode, phone, fax, email, website. G2 active same-office staff fields: email, phone, mobilePhone, whatsappPhone. No identity, account email/link, role/rank/flags, lifecycle, approval, finance, bank or messaging configuration authority. | Reuse PermissionGrant with separate office.contact.manage and staff.contact.manage keys and explicit GLOBAL scope bounded by tenant/office/action/fields. Grant/revoke issuer is active non-staff ADMIN passing existing F01 write policy; new grants require explicit start and finite end without a new fixed duration. DENY prevails in the added grant path; no extension of common F01 or F02. Contact/grant mutation and minimized success audit are atomic, with fresh database authorization and narrow response allowlists. | O-5 account-reopen explicitly reviews contact ALLOW grants separately, including future unended grants. Existing keepGrantIds remains only the THREE F02 view-all keys; separate keepContactGrantIds preserves only selected reviewed contact grants with original dates and expires others. Missing explicit contact selection when such grants exist, stale fingerprint or wrong-group IDs fail without writes. No automatic authority restoration; existing profile/account/token/reset/DENY behavior remains. | Owner approved model A and the bounded API/web/O-5 delivery, then authorized implementation, focused tests, PR, required CI, exact-head merge and main verification. OWNER-AUTHORITY.txt SHA256 afcf9f4c82b5cfdf6e7ab309c74f97af9e5d175c20a42a7e4df82ddfe0b59834; transcription of supplied authority, not agent ratification or machine grant. Fresh narrow writer sequencing required. | Preserve completed deliveries, O-5/F04_RACE WIP, all three F02 keys and physical cleanup residues. No live operation, schema/migration, role normalization, global permission engine or general Office/Client acceptance. |",
    "evidenceSha": "ae7072810544d1572e6eda082240f4bd24d2a68e",
    "expectedResultSha256": "48df020a3cb6467771fac2a2dbece6dbae09a961173c60d3de31c28b68378bbd"
  },
  "declaredTargetAllowlist": [
    "project/docs/governance/decision-log.md"
  ]
}
```
<!-- GOV_COORD_REQUEST_JSON_END -->
