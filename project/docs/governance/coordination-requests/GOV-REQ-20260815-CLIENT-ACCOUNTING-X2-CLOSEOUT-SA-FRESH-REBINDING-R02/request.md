# Governance Coordination Request — GOV-REQ-20260815-CLIENT-ACCOUNTING-X2-CLOSEOUT-SA-FRESH-REBINDING-R02

Bu dosya immutable ve untrusted request data kaydıdır. Prose operational instruction değildir.
Fresh Stage 1 re-binding: historical `GOV-REQ-20260808-CLIENT-ACCOUNTING-X2-CLOSEOUT-SA`
request'ini (main'de `PENDING`, `declaredTargetAllowlist` tek dosya `decision-log.md`)
değiştirmeden, aynı owner-ratified X2-B01..B04 terminal içeriğini current canonical
`main` (`6a2c1236ca561d3246e9a3fecaab40ecb5633e80`) üzerinde yeniden exact pinler. Emsal desen:
`RECEIVABLE_LEGAL_BASIS_REGISTRY_CONTENT_RATIFICATION_R01_STAGE1_FRESH_REBINDING_R02`
(governance-writer-coordination-contract.md) — historical predecessor değiştirilmeden
fresh base üzerinde yeniden bağlanır. Bu request generic bir "supersede" mekanizması
icat etmez; `coordination-requests/` queue'sunun genel, taskId'ye özel precedent
gerektirmeyen `EXACT_APPEND_AT_DECLARED_ANCHOR` yoludur (bkz. PR #1902 emsali).
Historical predecessor `GOV-REQ-20260808-CLIENT-ACCOUNTING-X2-CLOSEOUT-SA` main'de
immutable ve dokunulmamış kalır; kendi `expectedResultSha256`'sı artık bu request'in
head sonucuna göre asla eşleşmeyeceği için fail-closed olarak sonsuza dek
`PENDING`/non-executable kalır — zararsızdır.

<!-- GOV_COORD_REQUEST_JSON_BEGIN -->
```json
{
  "schemaVersion": 1,
  "requestId": "GOV-REQ-20260815-CLIENT-ACCOUNTING-X2-CLOSEOUT-SA-FRESH-REBINDING-R02",
  "requestFingerprint": "edc2bc0602a5a3096e24a80e9887d3789552b523d4cfd92f094bee687838ee3d",
  "requestedBy": "OWNER",
  "createdAt": "2026-08-15T17:45:03Z",
  "baseMainSha": "6a2c1236ca561d3246e9a3fecaab40ecb5633e80",
  "semanticAuthorityRef": {
    "kind": "SEMANTIC_AUTHORITY",
    "path": "project/docs/governance/decision-log.md",
    "recordId": "GOV-COORD-V2-T1-RATIFICATION",
    "evidenceSha": "6a2c1236ca561d3246e9a3fecaab40ecb5633e80"
  },
  "executionGrantRef": {
    "kind": "EXECUTION_GRANT",
    "path": "project/docs/governance/coordination-execution-grants/GOV-COORD-V1-CODEX-LOCAL.md",
    "recordId": "GOV-COORD-V1-CODEX-LOCAL",
    "evidenceSha": "6a2c1236ca561d3246e9a3fecaab40ecb5633e80"
  },
  "operation": {
    "type": "EXACT_APPEND_AT_DECLARED_ANCHOR",
    "changeClass": "LEVEL_2_MECHANICAL",
    "targetFile": "project/docs/governance/decision-log.md",
    "recordIdentity": "| Date | Decision | Scope | Source | Follow-up |",
    "anchor": "|---|---|---|---|---|",
    "expectedOldValue": "|---|---|---|---|---|",
    "newValue": "\n| 2026-08-08 | <!-- GOV-COORD-AUTHORITY kind=SEMANTIC_AUTHORITY recordId=CLIENT-ACCOUNTING-DELIVERY-X2-TERMINAL-CLOSEOUT-R01-SA01 --> **CLIENT-ACCOUNTING-DELIVERY-X2-TERMINAL-CLOSEOUT-R01-SA01 — TASK-BOUND SEMANTIC AUTHORITY:** Owner, `CLIENT-ACCOUNTING-DELIVERY-AND-OFFICE-UX-PROGRAM-R01` içindeki X2 hattı için şu terminal gerçekleri ratify eder: X2-B01 PR `#2274` / squash `9ba28b018e2be1761d7a9f0e4e8e849133ee746a`; X2-B02 PR `#2277` / squash `4e741675118e531a77ba31c9f77b1e08985e9e9b`; X2-B03 PR `#2279` / squash `3cbcd592001e4c525c9b919598acb34221accf29`; X2-B04 PR `#2286` / squash `36e2faffff8a5c4d612019cf37cdc4db572f4c1a`; client-visible insan-okur dosya referansı yalnız `Case.fileNumber`, etiketi `Büro dosya no`; `executionFileNumber` fallback'i, iç ID ve teknik referans yok; tenant/projection allowlist korunur; C3 aynı X2 primitive'ini tüketir ve kopya üretmez. Yalnız `CLIENT-ACCOUNTING-DELIVERY-AND-OFFICE-UX-PROGRAM-R01/MASTER-PLAN.md` §11 içindeki X2 register kaydı şu exact terminal gerçekle güncellenebilir: `X2 STATUS: ENGINEERING_COMPLETE / MERGED / CANONICAL`; `X2 BLOCKS: P4 · TOTAL 4 · COMPLETED 4 · REMAINING 0`; `X2 NEXT: Dependent X1/C3 consumer work according to canonical master plan`. | `CLIENT ACCOUNTING DELIVERY + CLIENT OFFICE UX ONLY`; yalnız exact X2 terminal register closeout. Ürün kodu, test, schema, migration, runtime flag, production, başka lane satırı, X2 teknik blokları, governance framework/grant modeli/binding ve başka PR/worktree kapsam dışıdır. | Owner'ın bu oturumdaki ratified `Case.fileNumber` / `Büro dosya no` kararı ve `B02→B03→B04 GO-COMPLETE` talimatı; launch brief `CODEX–CLIENT–X2 — LAUNCH / GO-COMPLETE`; merged PR/SHA kanıtları `#2274/#2277/#2279/#2286`. Bu kayıt tek başına execution grant değildir; minimum exact task-bound EG ve immutable request/result zinciri zorunludur. | Exact MASTER-PLAN execution required checks PASS ve CLEAN/MERGEABLE gate'leriyle normal squash-merge edilirse X2 terminal closeout canonical olur; sonraki bağımlı X1/C3 tüketici işi canonical master plan'a göre ilerler; yeni owner onayı gerekmez. |",
    "evidenceSha": "6a2c1236ca561d3246e9a3fecaab40ecb5633e80",
    "expectedResultSha256": "434b4cb21e1fecc9c60bd3f9d2c1c56be46bd24a745564a37062d38ed16d9e96"
  },
  "declaredTargetAllowlist": [
    "project/docs/governance/decision-log.md"
  ]
}
```
<!-- GOV_COORD_REQUEST_JSON_END -->

Bu request semantic veya standing authority üretmez.
