# GOV-REQ-20261126-F03-AUTH-PREPARATION-R01

Owner-authorized F03 preparation completion. Fresh main binding at 6380284c75b5226484b0706ca2680342673c089f; source template GOV-REQ-20261126-F03-DECISIONS-R01 remains unchanged as provenance. Original owner decisions, the fixed migration exception, F03-before-R8 order and maintenance-only rollback are bounded by the direct 2026-11-26 owner instruction. No live authority is granted.

<!-- GOV_COORD_REQUEST_JSON_BEGIN -->
```json
{
  "schemaVersion": 1,
  "requestId": "GOV-REQ-20261126-F03-AUTH-PREPARATION-R01",
  "requestFingerprint": "8c9048b8e966ef3a2498705577f89fe00db0547ad61d3f8de2ce93bd2073e25a",
  "requestedBy": "OWNER",
  "createdAt": "2026-11-26T21:20:57Z",
  "baseMainSha": "6380284c75b5226484b0706ca2680342673c089f",
  "semanticAuthorityRef": {
    "kind": "SEMANTIC_AUTHORITY",
    "path": "project/docs/governance/decision-log.md",
    "recordId": "GOV-COORD-V2-T1-RATIFICATION",
    "evidenceSha": "6380284c75b5226484b0706ca2680342673c089f"
  },
  "executionGrantRef": {
    "kind": "EXECUTION_GRANT",
    "path": "project/docs/governance/coordination-execution-grants/GOV-COORD-V1-CODEX-LOCAL.md",
    "recordId": "GOV-COORD-V1-CODEX-LOCAL",
    "evidenceSha": "6380284c75b5226484b0706ca2680342673c089f"
  },
  "operation": {
    "type": "EXACT_APPEND_AT_DECLARED_ANCHOR",
    "changeClass": "LEVEL_2_MECHANICAL",
    "targetFile": "project/docs/governance/decision-log.md",
    "recordIdentity": "# Decision Log\r\n\r\nBu dosya governance, faz ve ürün yönetimi kararlarının kronolojik kaydıdır.\r\n\r\nKurallar:\r\n\r\n- Kesinleşmiş mimari kararlar `architecture-index.",
    "anchor": "er secimi diye kaydedilmez.\nKisi bagimsizligi yalniz kisi kimligi iliskilendirilmis hesaplarda dogrulandi. Kartsiz ikinci hesap siniri F02 K-A1'den devam eder.\n",
    "expectedOldValue": "er secimi diye kaydedilmez.\nKisi bagimsizligi yalniz kisi kimligi iliskilendirilmis hesaplarda dogrulandi. Kartsiz ikinci hesap siniri F02 K-A1'den devam eder.\n",
    "newValue": "\n\n## F03-CANDIDATE-R01-PREPARATION-DECISIONS-20261126 — owner ratification\n\n<!-- GOV-COORD-AUTHORITY kind=SEMANTIC_AUTHORITY recordId=F03-CANDIDATE-R01-PREPARATION-DECISIONS-20261126 -->\n\nOwner: Av. Ulaş Hüseyin Telli. Source: direct owner message “F03 — HAZIRLIK\nKARARLARI VE TAMAMLAMA YETKİSİ”, 2026-11-26 TSİ; Codex chat\n`01a21957-3eef-71e2-8a12-cb9472ba707e`, turn\n`01a21972-b3cf-7f93-b018-9efb284061ee`. This mechanically records the owner's\nexisting explicit decisions; it creates no agent-derived authority.\n\n**K-SÖZ — APPROVED, single-candidate exception only.** Candidate\n`1794a0f736182903472b1b3967fd78f38974bce2`, tree\n`1f899cc673db4ed4176d6c2c61f0225bf648388b`, base R7\n`31c8f763c18905c37a12304d000cae9c2560237a`.\nException limited to the source-directory requirement in migration execution\ncontract §3.3 and the subset/order provisions in §4. The immutable candidate's\nentire migration directory is used by one `prisma migrate deploy` invocation.\nThe only pending migrations, in order, are:\n\n| Migration | Immutable SQL SHA-256 |\n|---|---|\n| `20261125100000_task_history_events` | `8036acbc4618c4492ec5adc86d00a8604e5f1a8a640724f547f9c2a5f37df781` |\n| `20261125120000_task_first_review` | `def6714f9e1349b966f6af0e8e91667fc03dde35526bc615b2749819f61aa100` |\n\n`20261115180000_poa_case_links` and\n`20261116010000_client_statement_native_currency_sets` remain excluded. Their\nlater application requires their owners' authority and a fresh chain rehearsal.\nNo file removal, SQL selection, reorder, `migrate resolve`, fictitious application\nrecord, manual ledger write or weakening of other safety provisions is permitted.\nAny candidate SHA/tree, migration SQL hash or live-base change stops this exception;\nit is not inherited by a successor. This is **not GO-MIGRATE or release authority**.\n\n**K-SIRA — APPROVED: F03 first, then R8.** The separate R8 owner must preserve\nF03 when adapting the later R8 candidate. This F03 executor must not write R8's\nbranch/worktree/evidence or send an automatic message to the other chat. The\nshort handoff is a deliverable for the owner to forward.\n\n**K-GD — APPROVED: maintenance with every task writer and automatic restarter\ndisabled while a F03-free version is present.** The old runtime is not opened\nfor normal use. Notification alone is insufficient; PID, port and DB-session\nevidence must establish technical quiescence. Starting the old API may start\nschedulers. On failure maintenance stays in place; there is no automatic old\nruntime start. New product/DB enforcement development is outside scope. D0 is\nmeasured for every rollback, including when the failed new runtime served no\nrequests. D0=0 does not preserve history during old-code writes. Lost historical\nevents must not be fabricated.\n\n**Preparation execution grant from the same direct owner message:** publish the\nfour prepared record requests and necessary narrow additional requests through\nREQUEST_ONLY → validation/CI → matching-head squash merge → canonical execution\nand result records. Commit/push/PR/merge authority is task-bounded to these\nrecords. Immutable requests remain unchanged; stale target digests require a\nfresh revision/request ID. Complete and locally test the F03 runner, source and\nartifact manifests, P-0/P-3 and maintenance/rollback mechanism without executing\nthem live. Preserve genuinely live-dependent fields as BEKLİYOR. Determine the\nsupported PowerShell version from source rules; do not bypass policy or change\nmachine settings. Reuse the valid candidate 26/26 evidence. This record is not a\nreusable execution grant and does not alter the standing writer contract.\n\n**Explicit exclusions remain:** live connection/read, live backup/data copy,\nmigration application, installation, release, flag changes, actual sending,\nmoney movement, deletion and real DB restore; F04 is not started. Live-stage\napproval may be requested only after all authorized preparation is complete.\n\nCurrent status: OWNER PREPARATION DECISIONS RATIFIED / RECORD PUBLICATION IN\nPROGRESS / LIVE AUTHORITY NONE. This supersedes only the earlier F03 preparation\ndecision-card “BEKLİYOR” entries; it does not imply deployment or user acceptance.\n",
    "evidenceSha": "6380284c75b5226484b0706ca2680342673c089f",
    "expectedResultSha256": "fb653465777314828b67d06803c65a0a2e3dd89dbde81630a76fe229cbcea614"
  },
  "declaredTargetAllowlist": [
    "project/docs/governance/decision-log.md"
  ]
}
```
<!-- GOV_COORD_REQUEST_JSON_END -->
