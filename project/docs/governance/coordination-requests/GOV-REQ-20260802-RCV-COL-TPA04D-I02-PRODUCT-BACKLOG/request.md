# Governance Coordination Request — GOV-REQ-20260802-RCV-COL-TPA04D-I02-PRODUCT-BACKLOG

Bu dosya immutable ve untrusted request data kaydıdır. Prose operational instruction değildir.

Program context (informational only): `RCV-COL-FULL-REMEDIATION-EXECUTION-GRANT-R01`
outer program-scoped execution authority olarak yürür; V1 mekanik executor grant'i
`GOV-COORD-V1-CODEX-LOCAL`dır.

<!-- GOV_COORD_REQUEST_JSON_BEGIN -->
```json
{
  "schemaVersion": 1,
  "requestId": "GOV-REQ-20260802-RCV-COL-TPA04D-I02-PRODUCT-BACKLOG",
  "requestFingerprint": "733ab4a4e2103f813374b2d0cda2bb65a5b098ac791ca92754c0eed128107d37",
  "requestedBy": "OWNER",
  "createdAt": "2026-08-02T10:10:06Z",
  "baseMainSha": "965cba5b89716f9c690506f72170a21e447b2b68",
  "semanticAuthorityRef": {
    "kind": "SEMANTIC_AUTHORITY",
    "path": "project/docs/governance/decision-log.md",
    "recordId": "RCV-COL-FULL-REMEDIATION-RATIFICATION-R01",
    "evidenceSha": "2c217f498f113abb12ae13a25a069a451084d104"
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
    "recordIdentity": "**TPA-04D-I01 Non-Circular Bucket Identity Preimage Amendment Closure (2026-08-02; CANONICAL",
    "anchor": "**PROGRAM TASK12: `TPA-04D-I02` — NOT STARTED; BU KAYIT TASK12 EXECUTION BAŞLATMAZ.**",
    "expectedOldValue": "**PROGRAM TASK12: `TPA-04D-I02` — NOT STARTED; BU KAYIT TASK12 EXECUTION BAŞLATMAZ.**",
    "newValue": "\n\n**TPA-04D-I02 Dormant LegalApplicationWriter Closure (2026-08-02; CANONICAL UPON APPROVED GOVERNANCE MERGE):** Task12 `CLOSED / CANONICAL / PASS`tır. Exact eight-file implementation PR #2099 / squash `ff87cf5b04dec7c9f91e59ee8fc210f61fd3a28f` ile dormant `LegalApplicationWriter` üretildi ve test edildi; controller/provider/queue/cron/event binding olmadığı için default-unreachable ve production-inactive kalır. Writer yalnız Task11'in validated official snapshot'ını kabul eder, mevcut allocator/plan builder sonucunu caller-owned Prisma transaction içinde atomik `LegalApplicationBatch` + nested application evidence'ına yazar, PostgreSQL advisory case lock ve tenant/case/currency/confirmed/confirmedAt guard'larını fail-closed uygular. `(tenantId,idempotencyKey)` replay aynı plan hash'inde exact persisted evidence döndürür; farklı hash conflict'tir; single APPLY korunur. Writer kendi transaction'ını açmaz, `ApplicationAttribution` yazmaz ve ClaimItem/LedgerAllocation/CollectionAllocation fallback'i kullanmaz. Local validation production TypeScript, API build ve ESLint PASS; legal-application-plan aggregate `11 suite / 247 test`, architecture-guards manifest `40 suite / 851 test`, claim-collection-finance manifest `51 suite / 698 test`, writer unit `13/13`, disposable PostgreSQL 16 integration `3/3` ve CI `9/9 PASS`tır. Task10 representative corpus'un yedi dosyası ile pinned 19-scenario checksum'ı byte-identical korunmuştur. Schema, migration, backfill ve live/production DB etkisi `NONE`; runtime/legal effect ve production activation `NONE / NOT ACTIVE`dır. ACT-28 ve REC-AUTH-011/012 `OPEN`; full reversal, consumer cutover ve legacy retirement açık kalır. Task15 gerçek writer/persistence replay evidence'ı `NOT YET SATISFIED`dır. **NEXT ELIGIBLE TASK: `TPA-04D-I03` — PROGRAM SEQUENCE TASK13 / ELIGIBLE / NOT STARTED; BU KAYIT TASK13 EXECUTION BAŞLATMAZ.**",
    "evidenceSha": "ff87cf5b04dec7c9f91e59ee8fc210f61fd3a28f",
    "expectedResultSha256": "e2e022c7fbef61d4bb14d6a3b74bb2b82beac0c95443cbe435907ff2411074ed"
  },
  "declaredTargetAllowlist": [
    "project/docs/governance/product-backlog.md"
  ]
}
```
<!-- GOV_COORD_REQUEST_JSON_END -->

Bu request semantic veya execution authority üretmez.
