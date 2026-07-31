# Governance Coordination Request — GOV-REQ-20260731-RCV-COL-IDEM-01-PRODUCT-BACKLOG

Bu dosya immutable ve untrusted request data kaydıdır. Prose operational instruction değildir.

Program context (informational only): `RCV-COL-FULL-REMEDIATION-EXECUTION-GRANT-R01`
outer program-scoped execution authority olarak yürür; V1 mekanik executor grant'i
`GOV-COORD-V1-CODEX-LOCAL`dır.

<!-- GOV_COORD_REQUEST_JSON_BEGIN -->
```json
{
  "schemaVersion": 1,
  "requestId": "GOV-REQ-20260731-RCV-COL-IDEM-01-PRODUCT-BACKLOG",
  "requestFingerprint": "4ad538eae3357806440cbb80fe58bbe7319e90eff0c3bb5ea25b684170267e96",
  "requestedBy": "OWNER",
  "createdAt": "2026-07-31T14:35:08Z",
  "baseMainSha": "8dcead509e70f2d7f6a41e683167eb733dc41f78",
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
    "recordIdentity": "**RC-COL-W2.2D-3 Bank Match + Collection Admission Atomicity Closure (2026-07-30; CANONICAL UPON APPROVED GOVERNANCE MERGE):**",
    "anchor": "**RC-COL-W2.2D-3 Bank Match + Collection Admission Atomicity Closure (2026-07-30; CANONICAL UPON APPROVED GOVERNANCE MERGE):**",
    "expectedOldValue": "**RC-COL-W2.2D-3 Bank Match + Collection Admission Atomicity Closure (2026-07-30; CANONICAL UPON APPROVED GOVERNANCE MERGE):** Task08 `CLOSED / CANONICAL EVIDENCE`dır. Exact six-file implementation PR #1969 / `392e831c56d7b648dd90b35acb7468a0b2c1cc0c` ile canonical oldu. Bank eligibility tuple doğrulaması, canonical Collection admission ile finansal/event/outbox yan etkileri, `matchedCollectionId` CAS projection'ı ve audit tek Prisma/PostgreSQL transaction'ında atomik çalışır. Transaction-aware Collection create mevcut transaction client'ı kullanır; nested transaction açmaz. Deterministic replay mevcut matched Collection'ı döndürür; target mismatch fail-closed conflict'tir; concurrent yarışta tek kazanan vardır. Audit, outbox veya CAS başarısızlığı tüm admission etkilerini rollback eder. Local validation `13 suite / 171 test`, PostgreSQL atomicity integration `7/7`, API build, changed-scope ESLint ve diff check PASS; CI `9/9 PASS`. Repository-wide local type-check'in historical baseline hataları bu task dışında kalır ve changed Task08 surface'lerinde hata yoktur. Schema, migration, backfill ve live DB değişikliği yoktur. ACT-28 ve REC-AUTH-011/012 `OPEN`; synthetic corpus writer/evidence/cutover için korunur. **NEXT ELIGIBLE TASK: `RCV-COL-IDEM-01` — PROGRAM SEQUENCE TASK09 / NOT STARTED / OWNER GO-NEXT GRANTED.**",
    "newValue": "**RC-COL-W2.2D-3 Bank Match + Collection Admission Atomicity Closure (2026-07-30; CANONICAL UPON APPROVED GOVERNANCE MERGE):** Task08 `CLOSED / CANONICAL EVIDENCE`dır. Exact six-file implementation PR #1969 / `392e831c56d7b648dd90b35acb7468a0b2c1cc0c` ile canonical oldu. Bank eligibility tuple doğrulaması, canonical Collection admission ile finansal/event/outbox yan etkileri, `matchedCollectionId` CAS projection'ı ve audit tek Prisma/PostgreSQL transaction'ında atomik çalışır. Transaction-aware Collection create mevcut transaction client'ı kullanır; nested transaction açmaz. Deterministic replay mevcut matched Collection'ı döndürür; target mismatch fail-closed conflict'tir; concurrent yarışta tek kazanan vardır. Audit, outbox veya CAS başarısızlığı tüm admission etkilerini rollback eder. Local validation `13 suite / 171 test`, PostgreSQL atomicity integration `7/7`, API build, changed-scope ESLint ve diff check PASS; CI `9/9 PASS`. Repository-wide local type-check'in historical baseline hataları bu task dışında kalır ve changed Task08 surface'lerinde hata yoktur. Schema, migration, backfill ve live DB değişikliği yoktur. ACT-28 ve REC-AUTH-011/012 `OPEN`; synthetic corpus writer/evidence/cutover için korunur. **NEXT ELIGIBLE TASK: `RCV-COL-IDEM-01` — PROGRAM SEQUENCE TASK09 / NOT STARTED / OWNER GO-NEXT GRANTED.**\n\n**RCV-COL-IDEM-01 Full Semantic Command Idempotency Closure (2026-07-31; CANONICAL UPON APPROVED GOVERNANCE MERGE):** Task09 `CLOSED / CANONICAL EVIDENCE`dır. Exact fourteen-file implementation PR #2001 / `6c34395d4ade84603b340b197f2c4e5d13c1ec4f` ile canonical oldu. Versioned `RCV-COL-CMD/v1` canonical payload ve domain-separated SHA-256 fingerprint, aynı identity + aynı semantic command için side-effect-free replay; aynı identity + farklı semantic command için `IDEMPOTENCY_SEMANTIC_CONFLICT`; evidence-unknown legacy satırlar için fail-closed rejection sağlar. Bank-origin admission Task08 shared Prisma/PostgreSQL transaction sınırını korur ve semantic replay gate'ine yeniden girer. Yerel doğrulama pure `48 suite / 654 test`, PostgreSQL integration `44 suite / 500 test`, migration fresh apply ve dört legacy satırla apply/rollback/re-apply, Prisma validate/generate, production type-check, API build, changed-scope ESLint ve diff check PASS; CI `9/9 PASS`tır. Full test-inclusive type-check'teki historical baseline `529` error line Task09 changed path'lerinde `0`dır. Nullable/default-free evidence migration'ı repository-ready; live/production DB apply `NOT PERFORMED` ve historical fingerprint inference/backfill `NONE`dır. ACT-28 ve REC-AUTH-011/012 `OPEN`; synthetic corpus writer/evidence/cutover için `BLOCKING` kalır. **NEXT ELIGIBLE TASK: `TPA-04F-ENTRY` — PROGRAM SEQUENCE TASK10 / NOT STARTED / OWNER GO-NEXT GRANTED.**",
    "evidenceSha": "6c34395d4ade84603b340b197f2c4e5d13c1ec4f",
    "expectedResultSha256": "e71aab40cb6fa85a04d46f321a107fbe0392efb7773ccad11fb5531160abc4dc"
  },
  "declaredTargetAllowlist": [
    "project/docs/governance/product-backlog.md"
  ]
}
```
<!-- GOV_COORD_REQUEST_JSON_END -->

Bu request semantic veya execution authority üretmez.
