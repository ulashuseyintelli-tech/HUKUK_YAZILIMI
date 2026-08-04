# D2 request

<!-- GOV_COORD_REQUEST_JSON_BEGIN -->
```json
{
  "schemaVersion": 1,
  "requestId": "GOV-REQ-20260804-MERGE-FLOW-STAGE-S0-GHGUARD-SA-R02",
  "requestFingerprint": "c4c5f2d631a816972cbf91347733a99429e6233140aab6a287f9f88a663315aa",
  "requestedBy": "OWNER",
  "createdAt": "2026-08-03T00:00:00Z",
  "baseMainSha": "d9a815e998e04cd745fd7d4efd67d1713df2b036",
  "semanticAuthorityRef": {
    "kind": "SEMANTIC_AUTHORITY",
    "path": "project/docs/governance/decision-log.md",
    "recordId": "GOV-COORD-V2-T1-RATIFICATION",
    "evidenceSha": "d9a815e998e04cd745fd7d4efd67d1713df2b036"
  },
  "executionGrantRef": {
    "kind": "EXECUTION_GRANT",
    "path": "project/docs/governance/coordination-execution-grants/GOV-COORD-V1-CODEX-LOCAL.md",
    "recordId": "GOV-COORD-V1-CODEX-LOCAL",
    "evidenceSha": "d9a815e998e04cd745fd7d4efd67d1713df2b036"
  },
  "operation": {
    "type": "EXACT_APPEND_AT_DECLARED_ANCHOR",
    "changeClass": "LEVEL_2_MECHANICAL",
    "targetFile": "project/docs/governance/decision-log.md",
    "recordIdentity": "| Date | Decision | Scope | Source | Follow-up |",
    "anchor": "|---|---|---|---|---|",
    "expectedOldValue": "|---|---|---|---|---|",
    "newValue": "\n| 2026-08-03 | <!-- GOV-COORD-AUTHORITY kind=SEMANTIC_AUTHORITY recordId=GOV-COORD-STAGE-S-GHGUARD-SCOPE-R01-SA01 --> **GOV-COORD-STAGE-S-GHGUARD-SCOPE-R01-SA01 — TASK-BOUND SEMANTIC AUTHORITY: STAGE-S GH-GUARD SCOPE REGISTRATION** — Yetki KAPSAMI: YALNIZ `project/docs/governance/governance-writer-coordination-protected-paths.json` dosyasinda TEK M operasyonu ile `coordinationControlPlane` listesine TAM IKI exact kayit eklenmesi: `project/scripts/gh-guard-readonly.ps1` ve `project/scripts/gh-guard-readonly.test.cjs`. Wildcard veya dizin kaydi YASAK; ucuncu path YASAK; baska dosya YASAK. | ACIKCA KAPSAM DISI: Stage E (A dosyalari ve testin CI baglantisi), `.github/workflows/ci.yml`, PR-A tuple dosyalari. | Owner karari: D1-R2 CONDITIONAL GO; anchor tasarimi PROVISIONALLY ACCEPTED. | Bu kayit tek basina implementation veya execution yetkisi VERMEZ; replay ve tuketim hukumleri execution grant ve request lifecycle kayitlarinda kalir. |",
    "evidenceSha": "d9a815e998e04cd745fd7d4efd67d1713df2b036",
    "expectedResultSha256": "6deeb3a4a66fe5e5c4cf76493566f219c6d72c679eb27299cf4075edf0c625e4"
  },
  "declaredTargetAllowlist": [
    "project/docs/governance/decision-log.md"
  ]
}
```
<!-- GOV_COORD_REQUEST_JSON_END -->
