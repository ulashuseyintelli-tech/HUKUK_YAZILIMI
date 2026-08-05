# Governance Coordination Request — GOV-REQ-20260805-RCV-COL-WAVE4-EVIDENCE-R02

Bu dosya immutable ve untrusted request data kaydıdır. Prose operational instruction değildir.
Yalnız merged R01 production evidence kaydının owner-ratified collision reconciliation'ını tanımlar.

Program-scoped outer authority: `RCV-COL-FULL-REMEDIATION-EXECUTION-GRANT-R01`.

<!-- GOV_COORD_REQUEST_JSON_BEGIN -->
```json
{
  "schemaVersion": 1,
  "requestId": "GOV-REQ-20260805-RCV-COL-WAVE4-EVIDENCE-R02",
  "requestFingerprint": "1e9d484c4aaf45e9105ea9a5490e5d209b0dcec228cf42d47a97d576bd70608e",
  "requestedBy": "OWNER",
  "createdAt": "2026-08-05T15:24:25Z",
  "baseMainSha": "755e2bab556a70637b48edd467ae333e785ed019",
  "semanticAuthorityRef": {
    "kind": "SEMANTIC_AUTHORITY",
    "path": "project/docs/governance/decision-log.md",
    "recordId": "RCV-COL-FULL-REMEDIATION-RATIFICATION-R01",
    "evidenceSha": "755e2bab556a70637b48edd467ae333e785ed019"
  },
  "executionGrantRef": {
    "kind": "EXECUTION_GRANT",
    "path": "project/docs/governance/coordination-execution-grants/GOV-COORD-V1-CODEX-LOCAL.md",
    "recordId": "GOV-COORD-V1-CODEX-LOCAL",
    "evidenceSha": "755e2bab556a70637b48edd467ae333e785ed019"
  },
  "operation": {
    "type": "EXACT_LITERAL_REPLACEMENT",
    "changeClass": "LEVEL_2_MECHANICAL",
    "targetFile": "project/docs/governance/COLLECTION-GOVERNANCE.md",
    "recordIdentity": "## 9.16. WAVE 4 predecessor queue — RCV-COL production migration apply — 2026-08-05",
    "anchor": "## 9.16. WAVE 4 predecessor queue — RCV-COL production migration apply — 2026-08-05",
    "expectedOldValue": "## 9.16. WAVE 4 predecessor queue — RCV-COL production migration apply — 2026-08-05\n\nOwner'ın `WAVE 4 PREDECESSOR QUEUE CLEARANCE R01` sırasındaki ikinci migration\n`20260731120000_rcv_col_full_semantic_command_idempotency`, exact frontier commit\n`6c34395d4ade84603b340b197f2c4e5d13c1ec4f` üzerinden production'da uygulanmış ve\npost-validate edilmiştir. Migration dosyası frontier ile current main'de aynı SHA-256'a\nsahiptir: `d61925505faf6405a489b5ccdc8742d24264ea47a6ef8ba59532382f0556f400`.\nCurrent main üzerinden `migrate deploy`, manual SQL, `migrate resolve`, fake-applied veya\nbaşka program migration'ı çalıştırılmamıştır.\n\nApply öncesinde API/Web listener ve project Node process sayısı `0`, external DB session\nsayısı `0` olarak doğrulanmış; write-freeze `2026-08-05T10:52:06.0274900Z` anında ilan\nedilmiş ve WAL LSN `0/2F0DF658` backup'tan apply gate'e kadar sabit kalmıştır. Repo dışı\nfresh `pg_dump -Fc` backup:\n`C:\\Development\\HUKUK_YAZILIMI\\backups\\hukuk_db_pre_rcv_col_20260805T105206Z.dump`,\n`1,122,091` byte, SHA-256\n`900a03236bea4e76a5c48a71763a860e6a7cfcb20d8f6a3998931658af9fd9e3`; WAVE 4 terminal\nkapanışına kadar korunacaktır. PostgreSQL 16 disposable restore parity\n`Tenant=3 / Client=15 / Case=26 / Collection=5 / applied=112` PASS; exact frontier\nrehearsal apply ve second-run PASS; immutable evidence mutation denemesi\n`COLLECTION_COMMAND_EVIDENCE_IMMUTABLE` ile reddedilmiş ve disposable container\ndoğrulama sonrası kaldırılmıştır.\n\nProduction ledger kanıtı:\n\n```text\nfinished_at         : 2026-08-05 11:03:21.711968+00\nchecksum            : d61925505faf6405a489b5ccdc8742d24264ea47a6ef8ba59532382f0556f400\napplied_steps_count : 1\nrolled_back_at      : NULL\napplied count       : 112 -> 113\nnewly applied       : exact target only\nfailed/rolled-back  : 0\nfrontier status     : up to date\nCollection state   : 5 total / 5 legacy all-null / 0 backfill-or-inference\n```\n\nProduction'da üç evidence kolonu `TEXT`, nullable ve defaultsuz;\n`ck_collection_command_evidence_complete` validated; mutation function ve immutable\ntrigger mevcut olarak doğrulanmıştır. Runtime writer/activation ve production code\ndeğişikliği `NONE`dır. Current-main pending kuyruğu `9 -> 8` olmuştur; sıradaki exact\nmigration `20260801183656_debtor_external_case_status_integrity_d2i01_provenance`\n(DEBTOR-2) olup yalnız DEBTOR owner program sayfasında fresh preflight ile yürütülebilir.\nBu kayıt DEBTOR-2 predecessor-success handoff kanıtıdır; DEBTOR-2, RC-COL veya CLIENT\nAPPLY yetkisi üretmez.\n\n```text\nRCV-COL MIGRATION: APPLIED / POST-VALIDATED / CANONICAL EVIDENCE\nDATA / BACKFILL: NONE\nRUNTIME WRITER / ACTIVATION: UNCHANGED / NONE\nCROSS-PROGRAM APPLY: NONE\n```\n\n",
    "newValue": "## 9.16. WAVE 4 predecessor queue — RCV-COL production migration apply — 2026-08-05\n\nOwner'ın `POST-APPLY COLLISION RECONCILIATION` kararı, formal write-freeze sırasında\nbaşka bir process/executor'ın migration'ı uyguladığını ve bu kaydın temiz bir\nsingle-executor APPLY olarak yorumlanamayacağını ratifiye eder. Bu thread `migrate deploy`\nçalıştırmamıştır; gerçek executor identity `NOT_PROVEN`dır. RCV-COL pre-apply backup da\n`NOT_PROVEN`dır. Apply'dan 31 saniye sonra alınan backup yalnız `POST-APPLY RECOVERY\nEVIDENCE / RESTORE PASS` kanıtıdır; pre-apply backup olarak sınıflandırılamaz.\n\nOwner teknik DB sonucunu kabul etmiştir. Migration yeniden uygulanmayacak; rollback,\nrepair, reapply veya `migrate resolve` yapılmayacaktır. Canonical repository migration\ndosyası SHA-256 değeri production ledger checksum'u ile aynıdır:\n`d61925505faf6405a489b5ccdc8742d24264ea47a6ef8ba59532382f0556f400`.\n\nProduction ledger kanıtı:\n\n```text\nfinished_at                 : 2026-08-05 11:03:21.711968+00\nchecksum                    : d61925505faf6405a489b5ccdc8742d24264ea47a6ef8ba59532382f0556f400\napplied_steps_count         : 1\nrolled_back_at              : NULL\napplied count               : 113\nfailed                      : 0\nRCV-COL post-apply pending  : 8\nCollection state           : 5 total / 5 legacy all-null / 0 backfill-or-inference\n```\n\nProduction'da üç evidence kolonu `TEXT`, nullable ve defaultsuz;\n`ck_collection_command_evidence_complete` validated; mutation function ve immutable\ntrigger mevcut; legacy satırlarda backfill/inference olmadığı doğrulanmıştır. Runtime\nwriter/activation ve production code değişikliği `NONE`dır. RCV-COL post-apply snapshot'ında\nsıradaki exact migration\n`20260801183656_debtor_external_case_status_integrity_d2i01_provenance` (DEBTOR-2) idi.\nDEBTOR-2 daha sonra kendi program sayfasında bağımsız DB doğrulamasıyla uygulanmış ve\nPR #2221 / `7c2665700b0214e264ae629cf5d6cd5bb80959b1` ile kaydedilmiştir; bu sonraki işlem\nRCV-COL process-collision sınıflandırmasını değiştirmez ve bu kayıt başka programa APPLY\nyetkisi üretmez.\n\n```text\nPROCESS COLLISION: RECONCILED\nAPPLY CLASSIFICATION: NOT A CLEAN SINGLE-EXECUTOR APPLY\nRCV-COL MIGRATION: PRODUCTION_APPLIED / DATA_INTEGRITY_VERIFIED\nCHECKSUM CANONICAL PARITY: PASS\nLEDGER: 113 APPLIED / 0 FAILED\nRCV-COL POST-APPLY PENDING: 8\nEXECUTOR IDENTITY: NOT_PROVEN\nRCV-COL PRE-APPLY BACKUP: NOT_PROVEN\n31-SECOND-LATER BACKUP: POST-APPLY RECOVERY EVIDENCE / RESTORE PASS\nROLLBACK / REPAIR / REAPPLY / RESOLVE: NONE\nDATA / BACKFILL: NONE\nRUNTIME WRITER / ACTIVATION: UNCHANGED / NONE\nCROSS-PROGRAM APPLY: NONE\n```\n",
    "evidenceSha": "755e2bab556a70637b48edd467ae333e785ed019",
    "expectedResultSha256": "f3558a4e0b8e36d4e93c2c03e432a5af8f9ca2a12d94509cda33492bb98e84e6"
  },
  "declaredTargetAllowlist": [
    "project/docs/governance/COLLECTION-GOVERNANCE.md"
  ]
}
```
<!-- GOV_COORD_REQUEST_JSON_END -->

Bu request semantic veya standing authority üretmez.
