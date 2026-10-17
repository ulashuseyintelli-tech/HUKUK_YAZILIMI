# OFFICE + CLIENT approved closeout — semantic record request

Request only; no Decision Log or product mutation in this PR. Existing CLIENT ownership is preserved until a separate narrow release.

<!-- GOV_COORD_REQUEST_JSON_BEGIN -->
```json
{
  "schemaVersion": 1,
  "requestId": "GOV-REQ-20261018-OFFICE-CLIENT-APPROVED-SA",
  "requestFingerprint": "5f36523461eb6379bedffd910399c7d2dfcb5235f138d40a222a2d062fa52e05",
  "requestedBy": "CODEX_LOCAL",
  "createdAt": "2026-10-17T22:56:57Z",
  "baseMainSha": "e15bc3795292b26335928393517950a0bbcbe7a5",
  "semanticAuthorityRef": {
    "kind": "SEMANTIC_AUTHORITY",
    "path": "project/docs/governance/decision-log.md",
    "recordId": "GOV-COORD-V2-T1-RATIFICATION",
    "evidenceSha": "e15bc3795292b26335928393517950a0bbcbe7a5"
  },
  "executionGrantRef": {
    "kind": "EXECUTION_GRANT",
    "path": "project/docs/governance/coordination-execution-grants/GOV-COORD-V1-CODEX-LOCAL.md",
    "recordId": "GOV-COORD-V1-CODEX-LOCAL",
    "evidenceSha": "e15bc3795292b26335928393517950a0bbcbe7a5"
  },
  "operation": {
    "type": "EXACT_APPEND_AT_DECLARED_ANCHOR",
    "changeClass": "LEVEL_2_MECHANICAL",
    "targetFile": "project/docs/governance/decision-log.md",
    "recordIdentity": "| Date | Decision | Scope | Source | Follow-up |",
    "anchor": "|---|---|---|---|---|",
    "expectedOldValue": "|---|---|---|---|---|",
    "newValue": "\n| 2026-10-18 | <!-- GOV-COORD-AUTHORITY kind=SEMANTIC_AUTHORITY recordId=OFFICE-CLIENT-APPROVED-CLOSEOUT-R01-SA01 --> **OFFICE-CLIENT-APPROVED-CLOSEOUT-R01-SA01 — OWNER APPROVAL OF AUDIT DECISIONS 1–5 AND PAYMENT SUBDECISIONS**: Owner explicitly approves narrow repository delivery through PR, required CI, exact-head merge and main verification. Decision 1: source-confirmed K03–K06 and K08–K14 repairs, preserving existing role policy; tenant/object/input/concurrency before outcome and currency-report correctness. Decision 2 / K07: hardened payment delivery, never merely opening the gate; ceiling, payment, request total, advance and journal must represent one atomic operation. Cancelled/rejected requests must not reopen through this endpoint and are rejected. Request and advance currencies must explicitly match; missing/mismatch is rejected, with no silent case-currency or current-rate substitution. Idempotency key is mandatory; existing consumers must change in the same delivery; same key/content cannot create a second payment. | Decision 3 / K15: prevent real transfer/sync/balance-success claims from mock-only paths; no new bank integration. Decision 4 / K17: implement only the accepted Ek98 DV207 design through existing CLIENT writer coordination; preserve existing grant mechanism, VIEWER denial, subject boundaries and pagination; IBAN/O4 excluded. Decision 5 / K18: isolated production metadata and actual Nest DI proof only; no product fix before defect is proven. Audit baseline e15bc3795292b26335928393517950a0bbcbe7a5; the approved decision table and user approval are preserved in CODEX session 01a07087-23bd-7e30-8100-fb455f1bfbf6, evidence SHA256 90e4104defc0c93a2164fc9ddfea0a73266d732b993a3378e07824bd2c426a41. | Explicit owner reply in this CODEX_LOCAL task on2026-10-18: decisions1–5 and the three payment subchoices approved, existing authority chain, PR/required CI/merge/main verification, no live operation or scope expansion. This row mechanically records supplied authority; it is not agent self-authorisation or a reusable machine grant. | Separate narrow single-writer deliveries; preserve #2965/#2967 writers, branches and scope. No production/live operation, migration, schema expansion, ACL change, workflow/guard weakening, force push or new business scope. Decision6/H acceptance is NOT approved. Preserve OFFICE R01, H5 access, D6/D7 and H8 budget decisions. Product changes follow ordinary product PR gates; V1 standing governance grant is not product/runtime authority. Protected governance writes require their own valid request/execution/result and current sequential writer release. DV209 proof is not a production defect or automatic final gate. |",
    "evidenceSha": "e15bc3795292b26335928393517950a0bbcbe7a5",
    "expectedResultSha256": "efe1ac5000cc4eb9e3c377286a769a79d35c53882f23d7a809c02aa04df121ba"
  },
  "declaredTargetAllowlist": [
    "project/docs/governance/decision-log.md"
  ]
}
```
<!-- GOV_COORD_REQUEST_JSON_END -->
