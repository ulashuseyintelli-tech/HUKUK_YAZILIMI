# Ordered 5a / 5b / 6a — supplied owner decisions

Request-only: one already approved owner instruction is transcribed as one Decision Log row. Products remain separate and sequential; no protected target is written by this request.

<!-- GOV_COORD_REQUEST_JSON_BEGIN -->
```json
{
  "schemaVersion": 1,
  "requestId": "GOV-REQ-20261107-OFFICE-CLIENT-ORDERED-5A5B6A-SA01",
  "requestFingerprint": "32858a0d9fa7f382d9c790a117e39dc98631f2e408f6d84946128f332490f898",
  "requestedBy": "CODEX_LOCAL",
  "createdAt": "2026-11-07T20:42:38Z",
  "baseMainSha": "54212ce902c8fb015038754ef78b44edb5d0674f",
  "semanticAuthorityRef": {
    "kind": "SEMANTIC_AUTHORITY",
    "path": "project/docs/governance/decision-log.md",
    "recordId": "GOV-COORD-V2-T1-RATIFICATION",
    "evidenceSha": "54212ce902c8fb015038754ef78b44edb5d0674f"
  },
  "executionGrantRef": {
    "kind": "EXECUTION_GRANT",
    "path": "project/docs/governance/coordination-execution-grants/GOV-COORD-V1-CODEX-LOCAL.md",
    "recordId": "GOV-COORD-V1-CODEX-LOCAL",
    "evidenceSha": "54212ce902c8fb015038754ef78b44edb5d0674f"
  },
  "operation": {
    "type": "EXACT_APPEND_AT_DECLARED_ANCHOR",
    "changeClass": "LEVEL_2_MECHANICAL",
    "targetFile": "project/docs/governance/decision-log.md",
    "recordIdentity": "| Date | Decision | Scope | Source | Follow-up |",
    "anchor": "|---|---|---|---|---|",
    "expectedOldValue": "|---|---|---|---|---|",
    "newValue": "\n| 2026-11-07 | <!-- GOV-COORD-AUTHORITY kind=SEMANTIC_AUTHORITY recordId=OFFICE-CLIENT-ORDERED-5A-5B-6A-SA01 --> **SUPPLIED OWNER DECISIONS — ORDERED 5a / 5b / 6a:** 5a: Yeni üretim FD alıcısı ilgili müvekkil/iletişim kaydıyla bağlı olsun; serbest ve ilişkisiz adres kullanılmasın. Onay, seçilen alıcı ve içerik/snapshot'a bağlı kalsın; bunlar değişirse eski onay kullanılmasın. 5b: Yeni büroya onaylı başlangıç şablonları tenant'a ait kopya olarak sağlansın. Mevcut büroların düzenlenmiş şablonları üzerine yazılmasın. Eksik şablon veya sağlayıcı, gerçek gönderim başarısı gibi gösterilmesin. 6a: Mevcut müvekkile atfen personelin kaydettiği onay/beyan defteri, mevcut yetki ve nesne kapsamıyla iç çalışma alanında gösterilsin. Ekran bunu doğrulanmış dış müvekkil kararı diye sunmasın. PORTAL kanal etiketi tek başına Fact A sayılmasın. | Existing FD recipient selection/consumer and approval seals; existing default-template onboarding only, with no overwrite or historical-tenant bulk conversion; existing internal ClientApprovalRequest/Event read UI, with no new portal principal/signature/decision authority or 6b automatic trigger. Preserve current action-specific authority, tenant/object scope, lifecycle, four-eyes, idempotency and safe projections. Separate sequential product PRs require exact-head CI/merge/main acceptance; no live operation. | Owner explicitly approved the consolidated 4d → 5a → 5b → 6a instruction and complete conditional delivery without interim approvals. OWNER-AUTHORITY.txt SHA256 8dc548ac9f783037f2f9e61860ae3951e71fe15dd59b597b8d541f18f28aa5db; approved package SHA256 fa117c3df2711f8e7881d4f937038e20d6bdd40306519032c74a9bc42b60899c. Supplied-owner transcription only, not agent ratification or a machine grant. | One fresh task-bound writer row only: #2750/6712750028; not CLIENT acknowledgement and not reuse of closed 4d/earlier turns. Return after exact execution/main acceptance. No Charter, backlog, other row or manifest write in this SA turn. Preserve completed work, O-5/F04_RACE and all eleven existing physical residues; 4d remains closed. |",
    "evidenceSha": "54212ce902c8fb015038754ef78b44edb5d0674f",
    "expectedResultSha256": "63690598c4d7319d97f9ed74db034dc3df06b7aa56564c18083c44e55add84e7"
  },
  "declaredTargetAllowlist": [
    "project/docs/governance/decision-log.md"
  ]
}
```
<!-- GOV_COORD_REQUEST_JSON_END -->
