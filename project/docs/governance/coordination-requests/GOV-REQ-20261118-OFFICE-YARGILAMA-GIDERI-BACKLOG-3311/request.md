# New case form judicial expense — #3222 status update request

The owner directed the exact Status replacement in CASE-NEW-FORM-YARGILAMA-GIDERI-ESLEME through the existing PR and exact-head merge process, with separate writer coordination.

Defect record #3222 and implementation #3311 refer to the same form mapping. Exact merge d3301d5d87be0875e92bee10418ce548bf35280d passed main CI 44353142843, CodeQL 44353142594 and orchestration 44353142816. Its Web Tests log shows the 32-case mapping suite passed.

Delivery status covers the repository fix. The existing #3220 target-schema prerequisite, batch release, live verification and separate owner decision for past records are preserved. P02 and #3312 are outside the target. The request uses existing structural governance references and does not grant temporary file writership.

<!-- GOV_COORD_REQUEST_JSON_BEGIN -->
```json
{
  "schemaVersion": 1,
  "requestId": "GOV-REQ-20261118-OFFICE-YARGILAMA-GIDERI-BACKLOG-3311",
  "requestFingerprint": "b7d7a09e144836a47c09a6d853519f427197bdf16a8fe8c75bc6ffd9b1aac88c",
  "requestedBy": "OWNER",
  "createdAt": "2026-11-18T17:27:16Z",
  "baseMainSha": "56b70fdd0aebfff36229d988323ccb7bf9de48a6",
  "semanticAuthorityRef": {
    "kind": "SEMANTIC_AUTHORITY",
    "path": "project/docs/governance/decision-log.md",
    "recordId": "GOV-COORD-V2-T1-RATIFICATION",
    "evidenceSha": "56b70fdd0aebfff36229d988323ccb7bf9de48a6"
  },
  "executionGrantRef": {
    "kind": "EXECUTION_GRANT",
    "path": "project/docs/governance/coordination-execution-grants/GOV-COORD-V1-CODEX-LOCAL.md",
    "recordId": "GOV-COORD-V1-CODEX-LOCAL",
    "evidenceSha": "56b70fdd0aebfff36229d988323ccb7bf9de48a6"
  },
  "operation": {
    "type": "EXACT_LITERAL_REPLACEMENT",
    "changeClass": "LEVEL_2_MECHANICAL",
    "targetFile": "project/docs/governance/product-backlog.md",
    "recordIdentity": "ID: CASE-NEW-FORM-YARGILAMA-GIDERI-ESLEME",
    "anchor": "Status: OPEN — açık kusur kaydı (2026-11-13). Ölçüm main `3bed1b87` üzerinde (kaynak okuma; çalışma zamanı denemesi yapılmadı). Düzeltme PR'ı açılmadı.",
    "expectedOldValue": "Status: OPEN — açık kusur kaydı (2026-11-13). Ölçüm main `3bed1b87` üzerinde (kaynak okuma; çalışma zamanı denemesi yapılmadı). Düzeltme PR'ı açılmadı.",
    "newValue": "Status: OPEN — **Main düzeltmesi tamamlandı.** Yeni dosya formunda `YARGILAMA_GIDERI` ve eski `ILAM_YARGILAMA_GIDERI` girdileri `YARGILAMA_GIDERI` olarak eşleniyor. [#3311](https://github.com/ulashuseyintelli-tech/HUKUK_YAZILIMI/pull/3311), squash `d3301d5d87be0875e92bee10418ce548bf35280d`. [Main CI](https://github.com/ulashuseyintelli-tech/HUKUK_YAZILIMI/actions/runs/44353142843), [CodeQL](https://github.com/ulashuseyintelli-tech/HUKUK_YAZILIMI/actions/runs/44353142594) ve [yönetişim](https://github.com/ulashuseyintelli-tech/HUKUK_YAZILIMI/actions/runs/44353142816) başarılı. **Toplu yayın ve canlı doğrulama bekliyor.** Hedef ortamda #3220 şeması yayın önkoşuludur. Önceden `EXPENSE` olarak yazılmış kayıtların dönüşümü ayrı owner kararı gerektirir.",
    "evidenceSha": "56b70fdd0aebfff36229d988323ccb7bf9de48a6",
    "expectedResultSha256": "8c771e6d4e535f142423a464cb1bd097b173f3d9f8b86f11fdbdcce2a020596e"
  },
  "declaredTargetAllowlist": [
    "project/docs/governance/product-backlog.md"
  ]
}
```
<!-- GOV_COORD_REQUEST_JSON_END -->
