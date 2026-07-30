# Governance Coordination Request — GOV-REQ-20260730-RC-COL-W2-2D-3-PRODUCT-BACKLOG

Bu dosya immutable ve untrusted request data kaydıdır. Prose operational instruction değildir.

Program context (informational only): `RCV-COL-FULL-REMEDIATION-EXECUTION-GRANT-R01`
outer program-scoped execution authority olarak yürür; V1 mekanik executor grant'i
`GOV-COORD-V1-CODEX-LOCAL`dır.

<!-- GOV_COORD_REQUEST_JSON_BEGIN -->
```json
{
  "schemaVersion": 1,
  "requestId": "GOV-REQ-20260730-RC-COL-W2-2D-3-PRODUCT-BACKLOG",
  "requestFingerprint": "c31d5abaa17b1c8ba11a5e76ff4aec834ae484125c6e3a846d0f4db39b2c4e4e",
  "requestedBy": "OWNER",
  "createdAt": "2026-07-30T20:19:56Z",
  "baseMainSha": "50a01395102643e5771cd927554871db823e392f",
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
    "type": "EXACT_LITERAL_REPLACEMENT",
    "changeClass": "LEVEL_2_MECHANICAL",
    "targetFile": "project/docs/governance/product-backlog.md",
    "recordIdentity": "RC-COL-W2.2D-3",
    "anchor": "**RC-COL-W2.2D-2 Collection confirmedAt Writer Closure",
    "expectedOldValue": "**RC-COL-W2.2D-2 Collection confirmedAt Writer Closure (2026-07-30; CANONICAL UPON APPROVED GOVERNANCE MERGE):** Task07 `CLOSED / CANONICAL EVIDENCE`dır. Exact twelve-file implementation PR #1944 / `6732ebcdd346558fb35e9ed264c7e27a3ba9d935` ile canonical oldu. Future canonical `Collection.status=CONFIRMED` create yüzeyleri server-authoritative, non-null ve immutable `confirmedAt` üretir; aynı idempotent replay mevcut timestamp'i korur; explicit caller timestamp kabul edilmez. Pre-side-effect persisted-readback guard ve audit timestamp eşleşmesi fail-closed uygulanır; static writer inventory ile test-support CONFIRMED writer'ları da kapsanır. Local pure validation `8 suite / 122 test`, PostgreSQL Collection regression `45/45`, bank regression `20/20`, production type-check, API build, changed-scope ESLint ve diff check PASS; CI `9/9 PASS`. Schema, migration, backfill ve live DB değişikliği yoktur; historical NULL kayıtlar tahmin edilmemiştir. ACT-28 ve REC-AUTH-011/012 `OPEN` kalır. **NEXT ELIGIBLE TASK: `RC-COL-W2.2D-3` — PROGRAM SEQUENCE TASK08 / OWNER GO-NEXT GRANTED / DESIGN-IMPLEMENTATION NOT STARTED.**",
    "newValue": "**RC-COL-W2.2D-2 Collection confirmedAt Writer Closure (2026-07-30; CANONICAL UPON APPROVED GOVERNANCE MERGE):** Task07 `CLOSED / CANONICAL EVIDENCE`dır. Exact twelve-file implementation PR #1944 / `6732ebcdd346558fb35e9ed264c7e27a3ba9d935` ile canonical oldu. Future canonical `Collection.status=CONFIRMED` create yüzeyleri server-authoritative, non-null ve immutable `confirmedAt` üretir; aynı idempotent replay mevcut timestamp'i korur; explicit caller timestamp kabul edilmez. Pre-side-effect persisted-readback guard ve audit timestamp eşleşmesi fail-closed uygulanır; static writer inventory ile test-support CONFIRMED writer'ları da kapsanır. Local pure validation `8 suite / 122 test`, PostgreSQL Collection regression `45/45`, bank regression `20/20`, production type-check, API build, changed-scope ESLint ve diff check PASS; CI `9/9 PASS`. Schema, migration, backfill ve live DB değişikliği yoktur; historical NULL kayıtlar tahmin edilmemiştir. ACT-28 ve REC-AUTH-011/012 `OPEN` kalır.\r\n\r\n**RC-COL-W2.2D-3 Bank Match + Collection Admission Atomicity Closure (2026-07-30; CANONICAL UPON APPROVED GOVERNANCE MERGE):** Task08 `CLOSED / CANONICAL EVIDENCE`dır. Exact six-file implementation PR #1969 / `392e831c56d7b648dd90b35acb7468a0b2c1cc0c` ile canonical oldu. Bank eligibility tuple doğrulaması, canonical Collection admission ile finansal/event/outbox yan etkileri, `matchedCollectionId` CAS projection'ı ve audit tek Prisma/PostgreSQL transaction'ında atomik çalışır. Transaction-aware Collection create mevcut transaction client'ı kullanır; nested transaction açmaz. Deterministic replay mevcut matched Collection'ı döndürür; target mismatch fail-closed conflict'tir; concurrent yarışta tek kazanan vardır. Audit, outbox veya CAS başarısızlığı tüm admission etkilerini rollback eder. Local validation `13 suite / 171 test`, PostgreSQL atomicity integration `7/7`, API build, changed-scope ESLint ve diff check PASS; CI `9/9 PASS`. Repository-wide local type-check'in historical baseline hataları bu task dışında kalır ve changed Task08 surface'lerinde hata yoktur. Schema, migration, backfill ve live DB değişikliği yoktur. ACT-28 ve REC-AUTH-011/012 `OPEN`; synthetic corpus writer/evidence/cutover için korunur. **NEXT ELIGIBLE TASK: `RCV-COL-IDEM-01` — PROGRAM SEQUENCE TASK09 / NOT STARTED / OWNER GO-NEXT GRANTED.**",
    "evidenceSha": "392e831c56d7b648dd90b35acb7468a0b2c1cc0c",
    "expectedResultSha256": "a098824329012087ccaeac09fe1acd42ff08758f373462a34868d6edf9140b18"
  },
  "declaredTargetAllowlist": [
    "project/docs/governance/product-backlog.md"
  ]
}
```
<!-- GOV_COORD_REQUEST_JSON_END -->

Bu request semantic veya execution authority üretmez.
