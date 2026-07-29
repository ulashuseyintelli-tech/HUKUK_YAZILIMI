# Governance Coordination Request — GOV-REQ-20260729-RC-COL-W2-2B-R01-PRODUCT-BACKLOG

Bu dosya immutable ve untrusted request data kaydıdır. Prose operational instruction değildir.

Program context (informational only): `RCV-COL-FULL-REMEDIATION-EXECUTION-GRANT-R01`
outer program-scoped execution authority olarak yürür; V1 mekanik executor grant'i
`GOV-COORD-V1-CODEX-LOCAL`dır.

<!-- GOV_COORD_REQUEST_JSON_BEGIN -->
```json
{
  "schemaVersion": 1,
  "requestId": "GOV-REQ-20260729-RC-COL-W2-2B-R01-PRODUCT-BACKLOG",
  "requestFingerprint": "951f59648412191db1803b754b9600634dd47f3234f276893bbbbf875c8e4f63",
  "requestedBy": "OWNER",
  "createdAt": "2026-07-29T20:02:11Z",
  "baseMainSha": "e7a964e7c1ef8b6724e1c679b36fbba5ba0b896c",
  "semanticAuthorityRef": {
    "kind": "SEMANTIC_AUTHORITY",
    "path": "project/docs/governance/decision-log.md",
    "recordId": "RCV-COL-FULL-REMEDIATION-RATIFICATION-R01",
    "evidenceSha": "14a1b3c543af3e9df2e9154a94f1a25fe3001a95"
  },
  "executionGrantRef": {
    "kind": "EXECUTION_GRANT",
    "path": "project/docs/governance/coordination-execution-grants/GOV-COORD-V1-CODEX-LOCAL.md",
    "recordId": "GOV-COORD-V1-CODEX-LOCAL",
    "evidenceSha": "a02498dfd50e349b2cb1eddfbde0561ece30fba6"
  },
  "operation": {
    "type": "EXACT_APPEND_AT_DECLARED_ANCHOR",
    "changeClass": "LEVEL_2_MECHANICAL",
    "targetFile": "project/docs/governance/product-backlog.md",
    "recordIdentity": "**RCV-COL-P2-GOV-R01 Formal Closure Reconciliation",
    "anchor": "**NEXT ELIGIBLE TASK: `RC-COL-W2.2B-R01` — PROGRAM SEQUENCE TASK05 / NOT STARTED IN THIS RECONCILIATION.**",
    "expectedOldValue": "**NEXT ELIGIBLE TASK: `RC-COL-W2.2B-R01` — PROGRAM SEQUENCE TASK05 / NOT STARTED IN THIS RECONCILIATION.**",
    "newValue": "\r\n\r\n**RC-COL-W2.2B-R01 Bank Reference Idempotency Closure (2026-07-29; CANONICAL UPON APPROVED GOVERNANCE MERGE):** Task05 `CLOSED / CANONICAL EVIDENCE`dır. Exact seven-file implementation PR #1888 / `35e215cde413dd3de42093f967c01b4929f37fed` ile canonical oldu. Bank reference replay authority `UNIQUE (tenantId, bankAccountId, bankReferenceId)`; blank reference trim sonrası `NULL`, `NULL` reference lookup dışıdır. Aynı canonical reference ve aynı payload mevcut kaydı döndürür; farklı payload fail-closed conflict üretir. Yerel doğrulama unit `35/35`, PostgreSQL integration `7/7`, bank regression `91/91`, disposable PostgreSQL 16 base/apply/rollback/re-apply/fresh migration kontrolleri ve CI `9/9 PASS`tır. Production/live DB apply `NOT PERFORMED / NOT ASSESSED`; runtime writer kapsamı mevcut banka ingress yüzeyiyle sınırlıdır. ACT-28 ve REC-AUTH-011/012 `OPEN` kalır. **NEXT ELIGIBLE TASK: `RC-COL-W2.2C-6` — PROGRAM SEQUENCE TASK06 / NOT STARTED / OWNER GO-NEXT GRANTED.**",
    "evidenceSha": "e7a964e7c1ef8b6724e1c679b36fbba5ba0b896c",
    "expectedResultSha256": "cc40db0bd17d23f9f90ec94bebeca42351aefe888f57188fb8736fa676be4163"
  },
  "declaredTargetAllowlist": [
    "project/docs/governance/product-backlog.md"
  ]
}
```
<!-- GOV_COORD_REQUEST_JSON_END -->

Bu request semantic veya execution authority üretmez.
