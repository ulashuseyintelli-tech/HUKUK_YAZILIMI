# Office/Client 3c — supplied unpaid cancellation decision

Request-only; protected target and test manifest are not written. Fresh narrow writer sequencing is required; closed 3a/3b turns are not reused.

<!-- GOV_COORD_REQUEST_JSON_BEGIN -->
```json
{
  "schemaVersion": 1,
  "requestId": "GOV-REQ-20261107-OFFICE-EXPENSE-CANCEL-3C-SA01",
  "requestFingerprint": "fdbf34f5763c4bd25b0b24ebfe9fef21fbcdaea281a730d4e404ebc75442c6c5",
  "requestedBy": "CODEX_LOCAL",
  "createdAt": "2026-11-06T23:44:56Z",
  "baseMainSha": "41b4cea99f20cc1235f7ca8a7f244c0fce34aa60",
  "semanticAuthorityRef": {
    "kind": "SEMANTIC_AUTHORITY",
    "path": "project/docs/governance/decision-log.md",
    "recordId": "GOV-COORD-V2-T1-RATIFICATION",
    "evidenceSha": "41b4cea99f20cc1235f7ca8a7f244c0fce34aa60"
  },
  "executionGrantRef": {
    "kind": "EXECUTION_GRANT",
    "path": "project/docs/governance/coordination-execution-grants/GOV-COORD-V1-CODEX-LOCAL.md",
    "recordId": "GOV-COORD-V1-CODEX-LOCAL",
    "evidenceSha": "41b4cea99f20cc1235f7ca8a7f244c0fce34aa60"
  },
  "operation": {
    "type": "EXACT_APPEND_AT_DECLARED_ANCHOR",
    "changeClass": "LEVEL_2_MECHANICAL",
    "targetFile": "project/docs/governance/decision-log.md",
    "recordIdentity": "| Date | Decision | Scope | Source | Follow-up |",
    "anchor": "|---|---|---|---|---|",
    "expectedOldValue": "|---|---|---|---|---|",
    "newValue": "\n| 2026-11-07 | <!-- GOV-COORD-AUTHORITY kind=SEMANTIC_AUTHORITY recordId=OFFICE-EXPENSE-CANCEL-3C-SA01 --> **OFFICE/CLIENT 3c — SUPPLIED OWNER DECISION, UNPAID CANCELLATION SLICE:** An expense request without payment history may be cancelled with a reason. Preserve requests, payment history and evidence; zero paidTotal alone is not proof of no payment history. Paid-request reversal/refund activation is outside this slice. | Require a non-empty reason and trusted actor for cancellation. Reuse the existing parent-row transaction lock; verify actual payment history before cancellation/deletion. Append actor/reason/before-after cancellation audit in the same transaction; retries cannot overwrite the first reason or duplicate success audit. Preserve existing unpaid PENDING deletion behavior otherwise. Connect only the existing case Finance cancellation path and refresh its real source; retain action-specific authorization, tenant and VIEWER rules. Cancellation does not reverse actual expense, journal or balance records. | Owner approved ready package choices 1–6 and expressly authorized this prepared unpaid-cancellation/history-protection slice through focused tests, PR, required CI, exact-head merge and main verification. OWNER-AUTHORITY.txt SHA256 7ee1cd3013f75c4906ca9bfd2a1a3aede68498d42d13e701290ca5b6c9769ac1; approved package SHA256 fa117c3df2711f8e7881d4f937038e20d6bdd40306519032c74a9bc42b60899c. Mechanical transcription of supplied owner authority, not agent ratification or a machine grant. | Preserve completed 3a/3b, O-5, all F04_RACE WIP and cleanup residues. Fresh narrow writer sequencing is required for this single row and new acceptance manifest entry; prior turns are closed. No payment-reversal HTTP/UI activation, refund, new financial permission/formula, schema/migration/backfill, production or general 3c/Office/Client closure. |",
    "evidenceSha": "41b4cea99f20cc1235f7ca8a7f244c0fce34aa60",
    "expectedResultSha256": "309e8fa48ebf2225683b6eb2f0a24a28027a3dfd1e7784d76284b202969da599"
  },
  "declaredTargetAllowlist": [
    "project/docs/governance/decision-log.md"
  ]
}
```
<!-- GOV_COORD_REQUEST_JSON_END -->
