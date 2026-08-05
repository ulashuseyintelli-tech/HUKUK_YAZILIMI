# Governance Coordination Request — GOV-REQ-20260805-RC-COL-WAVE4-EVIDENCE-R01

Bu dosya immutable ve untrusted request data kaydıdır. Prose operational instruction değildir.
Yalnız Collection Governance içindeki RC-COL WAVE 4 production apply evidence kaydını tanımlar.

Program-scoped outer authority: `RCV-COL-FULL-REMEDIATION-EXECUTION-GRANT-R01`.

<!-- GOV_COORD_REQUEST_JSON_BEGIN -->
```json
{
  "schemaVersion": 1,
  "requestId": "GOV-REQ-20260805-RC-COL-WAVE4-EVIDENCE-R01",
  "requestFingerprint": "c7488787dd067d460055b3a91b8fdf8c4327f273279bdc8091e0a12bf6df86c3",
  "requestedBy": "OWNER",
  "createdAt": "2026-08-05T19:40:45Z",
  "baseMainSha": "d5a2ec6467f3c698fed23c6e73126c08acd16465",
  "semanticAuthorityRef": {
    "kind": "SEMANTIC_AUTHORITY",
    "path": "project/docs/governance/decision-log.md",
    "recordId": "RCV-COL-FULL-REMEDIATION-RATIFICATION-R01",
    "evidenceSha": "d5a2ec6467f3c698fed23c6e73126c08acd16465"
  },
  "executionGrantRef": {
    "kind": "EXECUTION_GRANT",
    "path": "project/docs/governance/coordination-execution-grants/GOV-COORD-V1-CODEX-LOCAL.md",
    "recordId": "GOV-COORD-V1-CODEX-LOCAL",
    "evidenceSha": "d5a2ec6467f3c698fed23c6e73126c08acd16465"
  },
  "operation": {
    "type": "EXACT_APPEND_AT_DECLARED_ANCHOR",
    "changeClass": "LEVEL_2_MECHANICAL",
    "targetFile": "project/docs/governance/COLLECTION-GOVERNANCE.md",
    "recordIdentity": "## 9.16. WAVE 4 predecessor queue — RCV-COL production migration apply — 2026-08-05",
    "anchor": "```text\nPROCESS COLLISION: RECONCILED\nAPPLY CLASSIFICATION: NOT A CLEAN SINGLE-EXECUTOR APPLY\nRCV-COL MIGRATION: PRODUCTION_APPLIED / DATA_INTEGRITY_VERIFIED\nCHECKSUM CANONICAL PARITY: PASS\nLEDGER: 113 APPLIED / 0 FAILED\nRCV-COL POST-APPLY PENDING: 8\nEXECUTOR IDENTITY: NOT_PROVEN\nRCV-COL PRE-APPLY BACKUP: NOT_PROVEN\n31-SECOND-LATER BACKUP: POST-APPLY RECOVERY EVIDENCE / RESTORE PASS\nROLLBACK / REPAIR / REAPPLY / RESOLVE: NONE\nDATA / BACKFILL: NONE\nRUNTIME WRITER / ACTIVATION: UNCHANGED / NONE\nCROSS-PROGRAM APPLY: NONE\n```",
    "expectedOldValue": "```text\nPROCESS COLLISION: RECONCILED\nAPPLY CLASSIFICATION: NOT A CLEAN SINGLE-EXECUTOR APPLY\nRCV-COL MIGRATION: PRODUCTION_APPLIED / DATA_INTEGRITY_VERIFIED\nCHECKSUM CANONICAL PARITY: PASS\nLEDGER: 113 APPLIED / 0 FAILED\nRCV-COL POST-APPLY PENDING: 8\nEXECUTOR IDENTITY: NOT_PROVEN\nRCV-COL PRE-APPLY BACKUP: NOT_PROVEN\n31-SECOND-LATER BACKUP: POST-APPLY RECOVERY EVIDENCE / RESTORE PASS\nROLLBACK / REPAIR / REAPPLY / RESOLVE: NONE\nDATA / BACKFILL: NONE\nRUNTIME WRITER / ACTIVATION: UNCHANGED / NONE\nCROSS-PROGRAM APPLY: NONE\n```",
    "newValue": "\n\n## 9.17. WAVE 4 predecessor queue — RC-COL production migration apply — 2026-08-05\n\nOwner'ın `WAVE 4 PREDECESSOR QUEUE CLEARANCE R01` sırasındaki dördüncü migration\n`20260802120000_bank_tenant_fk_name_reconciliation_r01`, exact frontier commit\n`0c799a7d90a5782d921a546a1cd4ed09d6a609b0` üzerinden production'da tek hedef olarak\nuygulanmış ve post-validate edilmiştir. Frontier artifact 115 migration içerir; hedef\nartifact'ın son ve apply öncesi tek pending migration'ıdır. Migration dosyası frontier ile\ncurrent main'de aynı SHA-256'a sahiptir:\n`b9f0111114be9625a0c59974b2ad5a5b5a5c593ae4605024b947bbed0386a1fe`. Current main\nüzerinden `migrate deploy`, manual SQL, `migrate resolve`, fake-applied veya başka program\nmigration'ı çalıştırılmamıştır.\n\nApply öncesinde HUKUK API/Web container ve project process sayısı `0`, external DB client /\nactive transaction sayısı `0` ve waiting lock sayısı `0` olarak doğrulanmış; formal\nwrite-freeze `2026-08-05T22:37:10.028+03:00` anında ilan edilmiştir. Repo dışı fresh\n`pg_dump -Fc` backup:\n`C:\\Development\\HUKUK_YAZILIMI\\backups\\hukuk_db_pre_rc_col_wave4_20260805T193710Z.dump`,\n`1,125,242` byte, SHA-256\n`b5159be87ba55c2e5cee41c1c4d051bb78c8c29b781b191e08632dc5d889f0ee`; WAVE 4 terminal\nkapanışına kadar korunacaktır. PostgreSQL 16.14 disposable restore parity `114 applied /\n0 failed`, target absent, iki eski FK validated ve `BankSettlementEvidence=0 /\nBankTransaction=0` PASS; disposable container doğrulama sonrası kaldırılmıştır.\n\nProduction apply bu task'ın Prisma süreci tarafından `2026-08-05T22:38:10.990+03:00` ile\n`2026-08-05T22:38:11.493+03:00` arasında çalıştırılmış; CLI yalnız hedef migration'ı\nuyguladığını ve tüm migration'ların başarıyla tamamlandığını raporlamıştır. Ledger kanıtı:\n\n```text\nstarted_at          : 2026-08-05 19:38:11.439872+00\nfinished_at         : 2026-08-05 19:38:11.451027+00\nchecksum            : b9f0111114be9625a0c59974b2ad5a5b5a5c593ae4605024b947bbed0386a1fe\napplied_steps_count : 1\nrolled_back_at      : NULL\nlogs                 : NULL\napplied count       : 114 -> 115\nnewly applied       : exact target only\nfailed/rolled-back  : 0\nfrontier status     : up to date\ncurrent-main pending: 7 -> 6\n```\n\nEski FK adları production'da `0`; canonical yeni adlar `2/2`, validated ve önceki FK\ntanımlarıyla semantik olarak eşittir. `BankSettlementEvidence` ve `BankTransaction` satır\nsayıları apply öncesi/sonrası `0 -> 0`dır; data mutation/backfill yoktur. Rollback, repair,\nreapply, `migrate resolve` veya manual SQL yapılmamıştır. Current-main kuyruğunda yalnız\naltı CLIENT migration'ı kalır; ilk pending\n`20260802190000_client_identity_active_partial_unique`dır. Bu kayıt CLIENT C3 / ADIM 0 için\n`115 applied / 6 CLIENT pending` predecessor-success kanıtıdır; CLIENT APPLY veya başka\nprogram mutation yetkisi üretmez.\n\n```text\nRC-COL MIGRATION: PRODUCTION_APPLIED / POST-VALIDATED / CANONICAL EVIDENCE\nAPPLY CLASSIFICATION: CLEAN SINGLE-TARGET FRONTIER APPLY\nCHECKSUM CANONICAL PARITY: PASS\nLEDGER: 115 APPLIED / 0 FAILED\nCURRENT-MAIN PENDING: 6 CLIENT MIGRATIONS\nPRE-APPLY BACKUP / DISPOSABLE RESTORE: PASS / RETAINED\nCONSTRAINT RENAME: 2/2 VALIDATED\nDATA / BACKFILL: NONE\nROLLBACK / REPAIR / REAPPLY / RESOLVE / MANUAL SQL: NONE\nCROSS-PROGRAM APPLY: NONE\nNEXT: CLIENT C3 / ADIM 0 FRESH RE-RUN — SEPARATE PROGRAM PAGE\n```\n",
    "evidenceSha": "d5a2ec6467f3c698fed23c6e73126c08acd16465",
    "expectedResultSha256": "4ea56d54bed05127fd40833674e01a3cc93b8b0e36252730a84891a4ec347405"
  },
  "declaredTargetAllowlist": [
    "project/docs/governance/COLLECTION-GOVERNANCE.md"
  ]
}
```
<!-- GOV_COORD_REQUEST_JSON_END -->

Bu request semantic veya standing authority üretmez.
