# Governance Coordination Request — GOV-REQ-20260805-RCV-COL-WAVE4-EVIDENCE-R01

Bu dosya immutable ve untrusted request data kaydıdır. Prose operational instruction değildir.
Yalnız Collection Governance içindeki RCV-COL WAVE 4 production apply evidence kaydını tanımlar.

Program-scoped outer authority: `RCV-COL-FULL-REMEDIATION-EXECUTION-GRANT-R01`.

<!-- GOV_COORD_REQUEST_JSON_BEGIN -->
```json
{
  "schemaVersion": 1,
  "requestId": "GOV-REQ-20260805-RCV-COL-WAVE4-EVIDENCE-R01",
  "requestFingerprint": "e6509eed32e43b1874cffa92c30c6a05560579ee7588e7022f60555372fc0edf",
  "requestedBy": "OWNER",
  "createdAt": "2026-08-05T11:09:15Z",
  "baseMainSha": "19e2cb50013690c836d371228a0e40e824e0c2af",
  "semanticAuthorityRef": {
    "kind": "SEMANTIC_AUTHORITY",
    "path": "project/docs/governance/decision-log.md",
    "recordId": "RCV-COL-FULL-REMEDIATION-RATIFICATION-R01",
    "evidenceSha": "19e2cb50013690c836d371228a0e40e824e0c2af"
  },
  "executionGrantRef": {
    "kind": "EXECUTION_GRANT",
    "path": "project/docs/governance/coordination-execution-grants/GOV-COORD-V1-CODEX-LOCAL.md",
    "recordId": "GOV-COORD-V1-CODEX-LOCAL",
    "evidenceSha": "19e2cb50013690c836d371228a0e40e824e0c2af"
  },
  "operation": {
    "type": "EXACT_APPEND_AT_DECLARED_ANCHOR",
    "changeClass": "LEVEL_2_MECHANICAL",
    "targetFile": "project/docs/governance/COLLECTION-GOVERNANCE.md",
    "recordIdentity": "## 9.15. TPA-04F-ENTRY representative corpus foundation closure — 2026-08-01",
    "anchor": "Official snapshot producer, `LegalApplicationWriter`, atomic persistence/transaction, full\nreversal, consumer cutover ve legacy retirement sonraki owner-ratified program birimlerinde\nkalır. ACT-28 ve REC-AUTH-011/012 `OPEN`; COL-RISK-G07 `OPEN`; runtime writer `NOT\nIMPLEMENTED / NOT ACTIVATED`dır. Canonical successor `TPA-04D-I01 / Task11 — NEXT /\nELIGIBLE / NOT STARTED`dır ve Task10'un bütün governance exit gate'leri tamamlanmadan\nbaşlatılamaz.",
    "expectedOldValue": "Official snapshot producer, `LegalApplicationWriter`, atomic persistence/transaction, full\nreversal, consumer cutover ve legacy retirement sonraki owner-ratified program birimlerinde\nkalır. ACT-28 ve REC-AUTH-011/012 `OPEN`; COL-RISK-G07 `OPEN`; runtime writer `NOT\nIMPLEMENTED / NOT ACTIVATED`dır. Canonical successor `TPA-04D-I01 / Task11 — NEXT /\nELIGIBLE / NOT STARTED`dır ve Task10'un bütün governance exit gate'leri tamamlanmadan\nbaşlatılamaz.",
    "newValue": "\n\n## 9.16. WAVE 4 predecessor queue — RCV-COL production migration apply — 2026-08-05\n\nOwner'ın `WAVE 4 PREDECESSOR QUEUE CLEARANCE R01` sırasındaki ikinci migration\n`20260731120000_rcv_col_full_semantic_command_idempotency`, exact frontier commit\n`6c34395d4ade84603b340b197f2c4e5d13c1ec4f` üzerinden production'da uygulanmış ve\npost-validate edilmiştir. Migration dosyası frontier ile current main'de aynı SHA-256'a\nsahiptir: `d61925505faf6405a489b5ccdc8742d24264ea47a6ef8ba59532382f0556f400`.\nCurrent main üzerinden `migrate deploy`, manual SQL, `migrate resolve`, fake-applied veya\nbaşka program migration'ı çalıştırılmamıştır.\n\nApply öncesinde API/Web listener ve project Node process sayısı `0`, external DB session\nsayısı `0` olarak doğrulanmış; write-freeze `2026-08-05T10:52:06.0274900Z` anında ilan\nedilmiş ve WAL LSN `0/2F0DF658` backup'tan apply gate'e kadar sabit kalmıştır. Repo dışı\nfresh `pg_dump -Fc` backup:\n`C:\\Development\\HUKUK_YAZILIMI\\backups\\hukuk_db_pre_rcv_col_20260805T105206Z.dump`,\n`1,122,091` byte, SHA-256\n`900a03236bea4e76a5c48a71763a860e6a7cfcb20d8f6a3998931658af9fd9e3`; WAVE 4 terminal\nkapanışına kadar korunacaktır. PostgreSQL 16 disposable restore parity\n`Tenant=3 / Client=15 / Case=26 / Collection=5 / applied=112` PASS; exact frontier\nrehearsal apply ve second-run PASS; immutable evidence mutation denemesi\n`COLLECTION_COMMAND_EVIDENCE_IMMUTABLE` ile reddedilmiş ve disposable container\ndoğrulama sonrası kaldırılmıştır.\n\nProduction ledger kanıtı:\n\n```text\nfinished_at         : 2026-08-05 11:03:21.711968+00\nchecksum            : d61925505faf6405a489b5ccdc8742d24264ea47a6ef8ba59532382f0556f400\napplied_steps_count : 1\nrolled_back_at      : NULL\napplied count       : 112 -> 113\nnewly applied       : exact target only\nfailed/rolled-back  : 0\nfrontier status     : up to date\nCollection state   : 5 total / 5 legacy all-null / 0 backfill-or-inference\n```\n\nProduction'da üç evidence kolonu `TEXT`, nullable ve defaultsuz;\n`ck_collection_command_evidence_complete` validated; mutation function ve immutable\ntrigger mevcut olarak doğrulanmıştır. Runtime writer/activation ve production code\ndeğişikliği `NONE`dır. Current-main pending kuyruğu `9 -> 8` olmuştur; sıradaki exact\nmigration `20260801183656_debtor_external_case_status_integrity_d2i01_provenance`\n(DEBTOR-2) olup yalnız DEBTOR owner program sayfasında fresh preflight ile yürütülebilir.\nBu kayıt DEBTOR-2 predecessor-success handoff kanıtıdır; DEBTOR-2, RC-COL veya CLIENT\nAPPLY yetkisi üretmez.\n\n```text\nRCV-COL MIGRATION: APPLIED / POST-VALIDATED / CANONICAL EVIDENCE\nDATA / BACKFILL: NONE\nRUNTIME WRITER / ACTIVATION: UNCHANGED / NONE\nCROSS-PROGRAM APPLY: NONE\n```\n",
    "evidenceSha": "19e2cb50013690c836d371228a0e40e824e0c2af",
    "expectedResultSha256": "af85b6adcb55f912a8a8c8445328d6c12539bd5e566ba1dc8ce6b9bda20a0e51"
  },
  "declaredTargetAllowlist": [
    "project/docs/governance/COLLECTION-GOVERNANCE.md"
  ]
}
```
<!-- GOV_COORD_REQUEST_JSON_END -->

Bu request semantic veya standing authority üretmez.
