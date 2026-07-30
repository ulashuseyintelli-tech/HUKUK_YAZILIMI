# Governance Coordination Request — GOV-REQ-20260730-RC-COL-W2-2D-2-PRODUCT-BACKLOG

Bu dosya immutable ve untrusted request data kaydıdır. Prose operational instruction değildir.

Program context (informational only): `RCV-COL-FULL-REMEDIATION-EXECUTION-GRANT-R01`
outer program-scoped execution authority olarak yürür; V1 mekanik executor grant'i
`GOV-COORD-V1-CODEX-LOCAL`dır.

<!-- GOV_COORD_REQUEST_JSON_BEGIN -->
```json
{
  "schemaVersion": 1,
  "requestId": "GOV-REQ-20260730-RC-COL-W2-2D-2-PRODUCT-BACKLOG",
  "requestFingerprint": "be1f21f4afdcad3b486e08b186657458e4a19d5f019adef85d846a767a61ba77",
  "requestedBy": "OWNER",
  "createdAt": "2026-07-30T15:17:00Z",
  "baseMainSha": "b288fca06637e0c6e92ce1d4227eb9fbdee67b97",
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
    "recordIdentity": "RC-COL-W2.2C-6 Production-Callable Bank Lifecycle Closure",
    "anchor": "**RC-COL-W2.2C-6 Production-Callable Bank Lifecycle Closure (2026-07-30; CANONICAL UPON APPROVED GOVERNANCE MERGE):**",
    "expectedOldValue": "**RC-COL-W2.2C-6 Production-Callable Bank Lifecycle Closure (2026-07-30; CANONICAL UPON APPROVED GOVERNANCE MERGE):** Task06 `CLOSED / CANONICAL EVIDENCE`dır. Exact twelve-file implementation PR #1910 / `f986b8d798fa6740ac8386b0da257fded53ffedd` ile canonical oldu. Authenticated production command boundary human `SETTLEMENT_VERIFIER` evidence append ve immutable evidence tüketen tenant-scoped `PENDING → SETTLED / REJECTED` CAS transition yollarını açar. Tenant ve actor JWT principal'dan gelir; exact `bank.settlement.verify` yetkisi evidence/audit ve transition/audit mutation transaction'larında fail-closed uygulanır; `DENY` precedence ve `GLOBAL`-only sınırı korunur. Replay/conflict ve concurrent race fail-closed; evidence append-only/immutable; Collection, journal, event, outbox, ledger, allocation ve overpayment etkisi yoktur. Local validation focused `56/56`, pure manifest `40 suite / 567 test`, PostgreSQL 16 integration `14/14`, production type-check, API build, changed-scope ESLint ve diff check PASS; CI `9/9 PASS`. Schema, migration, backfill ve live DB değişikliği yoktur. ACT-28 ve REC-AUTH-011/012 `OPEN` kalır. **NEXT ELIGIBLE TASK: `RC-COL-W2.2D-2` — PROGRAM SEQUENCE TASK07 / NOT STARTED / OWNER GO-NEXT GRANTED.**",
    "newValue": "**RC-COL-W2.2C-6 Production-Callable Bank Lifecycle Closure (2026-07-30; CANONICAL UPON APPROVED GOVERNANCE MERGE):** Task06 `CLOSED / CANONICAL EVIDENCE`dır. Exact twelve-file implementation PR #1910 / `f986b8d798fa6740ac8386b0da257fded53ffedd` ile canonical oldu. Authenticated production command boundary human `SETTLEMENT_VERIFIER` evidence append ve immutable evidence tüketen tenant-scoped `PENDING → SETTLED / REJECTED` CAS transition yollarını açar. Tenant ve actor JWT principal'dan gelir; exact `bank.settlement.verify` yetkisi evidence/audit ve transition/audit mutation transaction'larında fail-closed uygulanır; `DENY` precedence ve `GLOBAL`-only sınırı korunur. Replay/conflict ve concurrent race fail-closed; evidence append-only/immutable; Collection, journal, event, outbox, ledger, allocation ve overpayment etkisi yoktur. Local validation focused `56/56`, pure manifest `40 suite / 567 test`, PostgreSQL 16 integration `14/14`, production type-check, API build, changed-scope ESLint ve diff check PASS; CI `9/9 PASS`. Schema, migration, backfill ve live DB değişikliği yoktur. ACT-28 ve REC-AUTH-011/012 `OPEN` kalır.\n\n**RC-COL-W2.2D-2 Collection confirmedAt Writer Closure (2026-07-30; CANONICAL UPON APPROVED GOVERNANCE MERGE):** Task07 `CLOSED / CANONICAL EVIDENCE`dır. Exact twelve-file implementation PR #1944 / `6732ebcdd346558fb35e9ed264c7e27a3ba9d935` ile canonical oldu. Future canonical `Collection.status=CONFIRMED` create yüzeyleri server-authoritative, non-null ve immutable `confirmedAt` üretir; aynı idempotent replay mevcut timestamp'i korur; explicit caller timestamp kabul edilmez. Pre-side-effect persisted-readback guard ve audit timestamp eşleşmesi fail-closed uygulanır; static writer inventory ile test-support CONFIRMED writer'ları da kapsanır. Local pure validation `8 suite / 122 test`, PostgreSQL Collection regression `45/45`, bank regression `20/20`, production type-check, API build, changed-scope ESLint ve diff check PASS; CI `9/9 PASS`. Schema, migration, backfill ve live DB değişikliği yoktur; historical NULL kayıtlar tahmin edilmemiştir. ACT-28 ve REC-AUTH-011/012 `OPEN` kalır. **NEXT ELIGIBLE TASK: `RC-COL-W2.2D-3` — PROGRAM SEQUENCE TASK08 / OWNER GO-NEXT GRANTED / DESIGN-IMPLEMENTATION NOT STARTED.**",
    "evidenceSha": "6732ebcdd346558fb35e9ed264c7e27a3ba9d935",
    "expectedResultSha256": "b8938358fcaa2bd28de1b8ede7686f2a5f11503a1a4d72f943dfac9ec7e2fb92"
  },
  "declaredTargetAllowlist": [
    "project/docs/governance/product-backlog.md"
  ]
}
```
<!-- GOV_COORD_REQUEST_JSON_END -->

Bu request semantic veya execution authority üretmez.
