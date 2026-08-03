# D2 request

<!-- GOV_COORD_REQUEST_JSON_BEGIN -->
```json
{
  "schemaVersion": 1,
  "requestId": "GOV-REQ-20260803-MERGE-FLOW-STAGE-S0-GHGUARD-SA",
  "requestFingerprint": "028eb094ce77d7950a8dda1b8c1727afc0eea912eb2bb616e5e2fb3bba4c08d8",
  "requestedBy": "OWNER",
  "createdAt": "2026-08-03T00:00:00Z",
  "baseMainSha": "c0c2107ee198af82525a3b1243d051af36aeb303",
  "semanticAuthorityRef": {
    "kind": "SEMANTIC_AUTHORITY",
    "path": "project/docs/governance/decision-log.md",
    "recordId": "GOV-COORD-V2-T1-RATIFICATION",
    "evidenceSha": "c0c2107ee198af82525a3b1243d051af36aeb303"
  },
  "executionGrantRef": {
    "kind": "EXECUTION_GRANT",
    "path": "project/docs/governance/coordination-execution-grants/GOV-COORD-V1-CODEX-LOCAL.md",
    "recordId": "GOV-COORD-V1-CODEX-LOCAL",
    "evidenceSha": "c0c2107ee198af82525a3b1243d051af36aeb303"
  },
  "operation": {
    "type": "EXACT_APPEND_AT_DECLARED_ANCHOR",
    "changeClass": "LEVEL_2_MECHANICAL",
    "targetFile": "project/docs/governance/decision-log.md",
    "recordIdentity": "| Date | Decision | Scope | Source | Follow-up |",
    "anchor": "|---|---|---|---|---|",
    "expectedOldValue": "|---|---|---|---|---|",
    "newValue": "\n| 2026-08-03 | <!-- GOV-COORD-AUTHORITY kind=SEMANTIC_AUTHORITY recordId=GOV-COORD-STAGE-S-GHGUARD-SCOPE-R01-SA01 --> **GOV-COORD-STAGE-S-GHGUARD-SCOPE-R01-SA01 — TASK-BOUND SEMANTIC AUTHORITY: STAGE-S GH-GUARD SCOPE REGISTRATION** — Yetki KAPSAMI: YALNIZ `project/docs/governance/governance-writer-coordination-protected-paths.json` dosyasinda TEK M operasyonu ile `coordinationControlPlane` listesine TAM IKI exact kayit eklenmesi: `project/scripts/gh-guard-readonly.ps1` ve `project/scripts/gh-guard-readonly.test.cjs`. Wildcard veya dizin kaydi YASAK; ucuncu path YASAK; baska dosya YASAK. | ACIKCA KAPSAM DISI: Stage E (A dosyalari ve testin CI baglantisi), `.github/workflows/ci.yml`, PR-A tuple dosyalari. | Owner karari: D1-R2 CONDITIONAL GO; anchor tasarimi PROVISIONALLY ACCEPTED. | Bu kayit tek basina implementation veya execution yetkisi VERMEZ; replay ve tuketim hukumleri execution grant ve request lifecycle kayitlarinda kalir. |",
    "evidenceSha": "c0c2107ee198af82525a3b1243d051af36aeb303",
    "expectedResultSha256": "ae313a5831771a26c6c20ee607c0019516cddfc89c126622241a68b733794417"
  },
  "declaredTargetAllowlist": [
    "project/docs/governance/decision-log.md"
  ]
}
```
<!-- GOV_COORD_REQUEST_JSON_END -->
