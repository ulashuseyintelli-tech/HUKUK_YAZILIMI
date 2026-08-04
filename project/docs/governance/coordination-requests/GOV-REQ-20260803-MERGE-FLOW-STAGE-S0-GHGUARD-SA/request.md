# D2 request

<!-- GOV_COORD_REQUEST_JSON_BEGIN -->
```json
{
  "schemaVersion": 1,
  "requestId": "GOV-REQ-20260803-MERGE-FLOW-STAGE-S0-GHGUARD-SA",
  "requestFingerprint": "0d8d8a0af23cd3cedda1100901e9b313ae372deaed6fc7dee7a667e59b8d9ea2",
  "requestedBy": "OWNER",
  "createdAt": "2026-08-03T00:00:00Z",
  "baseMainSha": "9efe0d4c59251e10c0f76027fdb7a0232bd508d1",
  "semanticAuthorityRef": {
    "kind": "SEMANTIC_AUTHORITY",
    "path": "project/docs/governance/decision-log.md",
    "recordId": "GOV-COORD-V2-T1-RATIFICATION",
    "evidenceSha": "9efe0d4c59251e10c0f76027fdb7a0232bd508d1"
  },
  "executionGrantRef": {
    "kind": "EXECUTION_GRANT",
    "path": "project/docs/governance/coordination-execution-grants/GOV-COORD-V1-CODEX-LOCAL.md",
    "recordId": "GOV-COORD-V1-CODEX-LOCAL",
    "evidenceSha": "9efe0d4c59251e10c0f76027fdb7a0232bd508d1"
  },
  "operation": {
    "type": "EXACT_APPEND_AT_DECLARED_ANCHOR",
    "changeClass": "LEVEL_2_MECHANICAL",
    "targetFile": "project/docs/governance/decision-log.md",
    "recordIdentity": "| Date | Decision | Scope | Source | Follow-up |",
    "anchor": "|---|---|---|---|---|",
    "expectedOldValue": "|---|---|---|---|---|",
    "newValue": "\n| 2026-08-03 | <!-- GOV-COORD-AUTHORITY kind=SEMANTIC_AUTHORITY recordId=GOV-COORD-STAGE-S-GHGUARD-SCOPE-R01-SA01 --> **GOV-COORD-STAGE-S-GHGUARD-SCOPE-R01-SA01 — TASK-BOUND SEMANTIC AUTHORITY: STAGE-S GH-GUARD SCOPE REGISTRATION** — Yetki KAPSAMI: YALNIZ `project/docs/governance/governance-writer-coordination-protected-paths.json` dosyasinda TEK M operasyonu ile `coordinationControlPlane` listesine TAM IKI exact kayit eklenmesi: `project/scripts/gh-guard-readonly.ps1` ve `project/scripts/gh-guard-readonly.test.cjs`. Wildcard veya dizin kaydi YASAK; ucuncu path YASAK; baska dosya YASAK. | ACIKCA KAPSAM DISI: Stage E (A dosyalari ve testin CI baglantisi), `.github/workflows/ci.yml`, PR-A tuple dosyalari. | Owner karari: D1-R2 CONDITIONAL GO; anchor tasarimi PROVISIONALLY ACCEPTED. | Bu kayit tek basina implementation veya execution yetkisi VERMEZ; replay ve tuketim hukumleri execution grant ve request lifecycle kayitlarinda kalir. |",
    "evidenceSha": "9efe0d4c59251e10c0f76027fdb7a0232bd508d1",
    "expectedResultSha256": "ae313a5831771a26c6c20ee607c0019516cddfc89c126622241a68b733794417"
  },
  "declaredTargetAllowlist": [
    "project/docs/governance/decision-log.md"
  ]
}
```
<!-- GOV_COORD_REQUEST_JSON_END -->
