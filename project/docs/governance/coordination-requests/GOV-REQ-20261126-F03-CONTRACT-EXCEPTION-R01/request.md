# GOV-REQ-20261126-F03-CONTRACT-EXCEPTION-R01

Owner-authorized F03 preparation completion. Fresh main binding at 6239eeaa4cf9b09bb671ca38805d77b9b4ab6252; source template GOV-REQ-20261126-F03-DECISIONS-R01 remains unchanged as provenance. Original owner decisions, the fixed migration exception, F03-before-R8 order and maintenance-only rollback are bounded by the direct 2026-11-26 owner instruction. No live authority is granted.

<!-- GOV_COORD_REQUEST_JSON_BEGIN -->
```json
{
  "schemaVersion": 1,
  "requestId": "GOV-REQ-20261126-F03-CONTRACT-EXCEPTION-R01",
  "requestFingerprint": "603eb5b7bbd96b3068c214e616a41434ae4ac4042fd85dded9f2500703349dc1",
  "requestedBy": "OWNER",
  "createdAt": "2026-11-26T22:10:41Z",
  "baseMainSha": "6239eeaa4cf9b09bb671ca38805d77b9b4ab6252",
  "semanticAuthorityRef": {
    "kind": "SEMANTIC_AUTHORITY",
    "path": "project/docs/governance/decision-log.md",
    "recordId": "F03-CANDIDATE-R01-PREPARATION-DECISIONS-20261126",
    "evidenceSha": "6239eeaa4cf9b09bb671ca38805d77b9b4ab6252"
  },
  "executionGrantRef": {
    "kind": "EXECUTION_GRANT",
    "path": "project/docs/governance/coordination-execution-grants/GOV-COORD-V1-CODEX-LOCAL.md",
    "recordId": "GOV-COORD-V1-CODEX-LOCAL",
    "evidenceSha": "6239eeaa4cf9b09bb671ca38805d77b9b4ab6252"
  },
  "operation": {
    "type": "EXACT_APPEND_AT_DECLARED_ANCHOR",
    "changeClass": "LEVEL_2_MECHANICAL",
    "targetFile": "project/docs/governance/cross-workstream-migration-execution-contract.md",
    "recordIdentity": "# Cross-Workstream Migration Execution Contract\n\n```text\nBelge yolu : project/docs/governance/cross-workstream-migration-execution-contract.md\nDurum      : CANO",
    "anchor": "bir migration, runtime veya\nGO-OPERATE yetkisi üretmez; yalnız gelecekteki bir GO-MIGRATE'in izleyeceği\nprosedürü ve o yetkinin nasıl doğrulanacağını tanımlar.\n",
    "expectedOldValue": "bir migration, runtime veya\nGO-OPERATE yetkisi üretmez; yalnız gelecekteki bir GO-MIGRATE'in izleyeceği\nprosedürü ve o yetkinin nasıl doğrulanacağını tanımlar.\n",
    "newValue": "\n\n## 11. F03 candidate R01 — owner-approved one-candidate exception (2026-11-26)\n\nCanonical owner decision locator:\n`decision-log.md` → `F03-CANDIDATE-R01-PREPARATION-DECISIONS-20261126`.\nThis is a bounded exception to §3.3's source-directory requirement and §4's\nmain-queue subset/order provisions, not a general replacement of this contract.\n\n| Binding | Exact value |\n|---|---|\n| Candidate | `1794a0f736182903472b1b3967fd78f38974bce2` |\n| Tree | `1f899cc673db4ed4176d6c2c61f0225bf648388b` |\n| Base | R7 `31c8f763c18905c37a12304d000cae9c2560237a` |\n| Pending migration 1 | `20261125100000_task_history_events`; SQL SHA-256 `8036acbc4618c4492ec5adc86d00a8604e5f1a8a640724f547f9c2a5f37df781` |\n| Pending migration 2 | `20261125120000_task_first_review`; SQL SHA-256 `def6714f9e1349b966f6af0e8e91667fc03dde35526bc615b2749819f61aa100` |\n\nOnly the immutable candidate's complete 145-directory inventory (unchanged 143\nR7 migrations plus these two) may be the source of one `prisma migrate deploy`.\nThe previous main migrations `20261115180000_poa_case_links` and\n`20261116010000_client_statement_native_currency_sets` are excluded. This F03 run\nmust not apply them or mark them applied. Their later application requires their\nowners' separate authority and a current-chain rehearsal. Current live state is\nunmeasured. No fictitious application record is permitted.\n\nFresh live-base and checksum inventory must match R7 plus exactly this pending\npair before any separately authorized execution. Any SHA/tree, SQL-byte hash,\nlive-base or actual pending-set difference stops the exception. It is not\nautomatically transferred to another candidate, release order or train.\n\nAll other entry, backup/restore-test, writer/process quiescence, lock-drain,\nintrospection, data-invariant, failure and authority gates remain in force.\nNo file is removed/renamed from the directory to choose SQL; no manual SQL\napplication, ledger mutation, `migrate resolve`, reorder or automatic restart\nafter a migration failure is permitted. Migration must be verified before its\nconsumer runtime is opened.\n\nThis clause grants no live read, data-copy, migration, deployment, restore or\nfeature-activation authority. F03 is first; R8 is a separate owner's later\ncandidate. A F03-free rollback stays in technically proven maintenance with\nall task writers/restarters off; the old API/runtime is never automatically\nrestarted. The separate owner decision governs that bounded operating choice.\n",
    "evidenceSha": "6239eeaa4cf9b09bb671ca38805d77b9b4ab6252",
    "expectedResultSha256": "32321602a2b04401179ea326c894b901ee0d5f55d70280ae847c42d84270ac5e"
  },
  "declaredTargetAllowlist": [
    "project/docs/governance/cross-workstream-migration-execution-contract.md"
  ]
}
```
<!-- GOV_COORD_REQUEST_JSON_END -->
