# Client 1b — supplied owner-decision transcription request

Request-only. No protected target write or product acceptance is claimed. Fresh writer coordination is pending.

<!-- GOV_COORD_REQUEST_JSON_BEGIN -->
```json
{
  "schemaVersion": 1,
  "requestId": "GOV-REQ-20261105-CLIENT-OBJECT-SCOPE-1B-SA01",
  "requestFingerprint": "ddc48bf9cbd4a323d618949510dbe6ce349232af1d1300ee5b9cd8b4290d3a73",
  "requestedBy": "CODEX_LOCAL",
  "createdAt": "2026-11-04T23:16:01Z",
  "baseMainSha": "89671ef1c083d9f14dbe9aabecad8c79dcce78d0",
  "semanticAuthorityRef": {
    "kind": "SEMANTIC_AUTHORITY",
    "path": "project/docs/governance/decision-log.md",
    "recordId": "GOV-COORD-V2-T1-RATIFICATION",
    "evidenceSha": "89671ef1c083d9f14dbe9aabecad8c79dcce78d0"
  },
  "executionGrantRef": {
    "kind": "EXECUTION_GRANT",
    "path": "project/docs/governance/coordination-execution-grants/GOV-COORD-V1-CODEX-LOCAL.md",
    "recordId": "GOV-COORD-V1-CODEX-LOCAL",
    "evidenceSha": "89671ef1c083d9f14dbe9aabecad8c79dcce78d0"
  },
  "operation": {
    "type": "EXACT_APPEND_AT_DECLARED_ANCHOR",
    "changeClass": "LEVEL_2_MECHANICAL",
    "targetFile": "project/docs/governance/decision-log.md",
    "recordIdentity": "| Date | Decision | Scope | Source | Follow-up |",
    "anchor": "|---|---|---|---|---|",
    "expectedOldValue": "|---|---|---|---|---|",
    "newValue": "\n| 2026-11-05 | <!-- GOV-COORD-AUTHORITY kind=SEMANTIC_AUTHORITY recordId=CLIENT-OBJECT-SCOPE-1B-SA01 --> **CLIENT 1b — OWNER APPROVED CANONICAL OBJECT SCOPE FOR EXISTING MUTATIONS AND CHILD ACCESS:** Existing action-specific authority AND an active same-tenant actor-to-case-to-canonical-CaseClient relationship are required together. Reuse the existing K16 Lawyer/CaseLawyer or Staff/CaseStaff.canView relation; ADMIN/title, creator, ReportingLine and legacy Case.clientId alone confer no object access. The relationship grants no action, approval or sending authority. | Protect the approved existing Client update/lifecycle, direct child reads/writes and legacy-equivalent external actor entries. Resolve the actual child parent server-side and validate the particular case when supplied. Recheck writes in their existing transaction context; preserve action policy, lifecycle/no-op, maker-checker, idempotency, audit and masking. Out-of-scope update duplicate errors expose no other Client id/name. Preserve completed #3044 create-dedup and #3076 intake permission/navigation delivery. No new financial policy, scope exception, role matrix, schema/migration or live operation. | Direct owner approved decision-package 1b, then explicitly authorized the bounded implementation, tests, PR, required CI, exact-head squash merge, main verification and safe owned cleanup. OWNER-AUTHORITY.txt SHA256 26cb866707354ccae01a4f2acba121d02cd300ef18fb05092edafe6147ff107c; approved package R01 SHA256 fa117c3df2711f8e7881d4f937038e20d6bdd40306519032c74a9bc42b60899c. This is transcription of supplied owner authority, not agent ratification or a reusable grant. | A fresh one-row Decision Log writer turn and a separate narrow new-spec manifest turn are required; prior closed releases are not reused. Preserve O-5/#3078 ownership, all F04_RACE WIP and existing physical cleanup residues. Only this bounded source/CI delivery is authorized; no general Office/Client seal or next-task activation. |",
    "evidenceSha": "89671ef1c083d9f14dbe9aabecad8c79dcce78d0",
    "expectedResultSha256": "19b23998e6f5c2a54c1eba25ee122a3f21efe3524d344007214ef11715e8acbb"
  },
  "declaredTargetAllowlist": [
    "project/docs/governance/decision-log.md"
  ]
}
```
<!-- GOV_COORD_REQUEST_JSON_END -->
