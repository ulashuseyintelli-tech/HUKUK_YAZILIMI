# D2 request

<!-- GOV_COORD_REQUEST_JSON_BEGIN -->
```json
{
  "schemaVersion": 1,
  "requestId": "GOV-REQ-20260805-MERGE-FLOW-STAGE-E-GHGUARD-DIAGNOSTIC-SA",
  "requestFingerprint": "ac1ce96bb5ca6867eef589d3ef1d2878203bb5bfb8cd757470a243c797337f23",
  "requestedBy": "OWNER",
  "createdAt": "2026-08-05T00:00:00Z",
  "baseMainSha": "19e2cb50013690c836d371228a0e40e824e0c2af",
  "semanticAuthorityRef": {
    "kind": "SEMANTIC_AUTHORITY",
    "path": "project/docs/governance/decision-log.md",
    "recordId": "GOV-COORD-V2-T1-RATIFICATION",
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
    "targetFile": "project/docs/governance/decision-log.md",
    "recordIdentity": "| Date | Decision | Scope | Source | Follow-up |",
    "anchor": "|---|---|---|---|---|",
    "expectedOldValue": "|---|---|---|---|---|",
    "newValue": "\n| 2026-08-05 | <!-- GOV-COORD-AUTHORITY kind=SEMANTIC_AUTHORITY recordId=GOV-COORD-STAGE-E-GHGUARD-DIAGNOSTIC-R01-SA01 --> **GOV-COORD-STAGE-E-GHGUARD-DIAGNOSTIC-R01-SA01 — TASK-BOUND SEMANTIC AUTHORITY: STAGE-E CANONICAL READ-ONLY GH-GUARD DIAGNOSTIC** — Owner karari: \"REPOSITORY-WIDE-MERGE-FLOW-REMEDIATION-R01 REMAINING WORK — SEQUENTIAL OWNER GO-COMPLETE\", AŞAMA 1 — STAGE E. Yetki KAPSAMI: `project/scripts/gh-guard-readonly.ps1` (A) + `project/scripts/gh-guard-readonly.test.cjs` (A) + `.github/workflows/ci.yml` dosyasında SADECE bu yeni test dosyasını çalıştıran tek satırlık ekleme (M). Script salt-okunur GET-only olmalı; PATCH/PUT/POST/DELETE veya mutation GraphQL yasak; `-Repair`/`-VerifyLockdown`/`lockBranch:true` yazma kodu yasak; eksik/malformed `lock_branch` fail-closed exit 2; secret/token çıktısı yasak; testler gerçek GitHub'a yazmaz (stub/fixture); dosyalar kendiliğinden çalışan hook değildir. | ACIKCA KAPSAM DIŞI: AŞAMA 2 (PR-A taxonomy/installer/adapter) ve AŞAMA 3 (final certification); Stage S SA/EG kimlikleri (`GOV-COORD-STAGE-S-GHGUARD-SCOPE-R01-*`) bu kayıtla değiştirilmez, genişletilmez, referans alınmaz. | Owner karari kaynağı: bu oturum, \"REPOSITORY-WIDE-MERGE-FLOW-REMEDIATION-R01 REMAINING WORK — SEQUENTIAL OWNER GO-COMPLETE\" talimatı, AŞAMA 1. | Bu kayıt tek başına implementation veya execution yetkisi VERMEZ; execution, generic base-side authority zinciriyle (task-bound EG oluşturma + registered changeset) ayrı adımlarda yapılır. |",
    "evidenceSha": "19e2cb50013690c836d371228a0e40e824e0c2af",
    "expectedResultSha256": "ba1a3946729fa0dae12b1720c2e4b4e0490cf2eef72b0c9174ca66b5f8d3e4ce"
  },
  "declaredTargetAllowlist": [
    "project/docs/governance/decision-log.md"
  ]
}
```
<!-- GOV_COORD_REQUEST_JSON_END -->
