# D2 request

<!-- GOV_COORD_REQUEST_JSON_BEGIN -->
```json
{
  "schemaVersion": 1,
  "requestId": "GOV-REQ-20260805-MERGE-FLOW-ORCH-MIRROR-SYNC-SA",
  "requestFingerprint": "00d6d55d067da4de3be9d29f38ab98a86729b5c39476a6213e2a13784c2a688d",
  "requestedBy": "OWNER",
  "createdAt": "2026-08-05T00:00:00Z",
  "baseMainSha": "3a3d5c3420eb9ffe005401bb4e86225ee604b2a4",
  "semanticAuthorityRef": {
    "kind": "SEMANTIC_AUTHORITY",
    "path": "project/docs/governance/decision-log.md",
    "recordId": "GOV-COORD-V2-T1-RATIFICATION",
    "evidenceSha": "3a3d5c3420eb9ffe005401bb4e86225ee604b2a4"
  },
  "executionGrantRef": {
    "kind": "EXECUTION_GRANT",
    "path": "project/docs/governance/coordination-execution-grants/GOV-COORD-V1-CODEX-LOCAL.md",
    "recordId": "GOV-COORD-V1-CODEX-LOCAL",
    "evidenceSha": "3a3d5c3420eb9ffe005401bb4e86225ee604b2a4"
  },
  "operation": {
    "type": "EXACT_APPEND_AT_DECLARED_ANCHOR",
    "changeClass": "LEVEL_2_MECHANICAL",
    "targetFile": "project/docs/governance/decision-log.md",
    "recordIdentity": "| Date | Decision | Scope | Source | Follow-up |",
    "anchor": "|---|---|---|---|---|",
    "expectedOldValue": "|---|---|---|---|---|",
    "newValue": "\n| 2026-08-05 | <!-- GOV-COORD-AUTHORITY kind=SEMANTIC_AUTHORITY recordId=GOV-COORD-ORCH-MIRROR-SYNC-R01-SA01 --> **GOV-COORD-ORCH-MIRROR-SYNC-R01-SA01 — TASK-BOUND SEMANTIC AUTHORITY: ORCHESTRATOR MIRROR-SYNC PREREQUISITE** — Owner karari (bu oturum, PR #2206 BLOCKED_EXACT raporuna yanit): `OWNER DECISION: AUTHORIZE ORCHESTRATOR MIRROR-SYNC PREREQUISITE`. Yetki KAPSAMI: YALNIZ `project/scripts/orchestration-v2/orchestrator/orchestrator.cjs` dosyasinda `IMMUTABLE_FORBIDDEN` dizisine TAM IKI literal ekleme: `project/scripts/gh-guard-readonly.ps1`, `project/scripts/gh-guard-readonly.test.cjs`. | ACIKCA KAPSAM DISI: Wildcard, refactor, listeyi dinamiklestirme, test dosyasi degisikligi, baska dosya; Stage S'in `protected-paths.json` M edit'i (#2205/#2206) veya onun task-bound EG/SA zinciri (`GOV-COORD-STAGE-S-GHGUARD-SCOPE-R01`) bu kayitla degistirilmez, genisletilmez. | Owner gerekcesi (verbatim): \"orchestrator.cjs eklenirse Stage S SA01'in acik tek-dosya sinirini ihlal eder, registered request/EG tuple'ini bozar, PR kendi yetkisinin disina cikar, CI'i duzeltirken governance ihlali uretiriz.\" Bu nedenle iki ayri yetki alani iki ayri PR zincirinde tutulur. | Bu kayit tek basina implementation veya execution yetkisi VERMEZ; execution, standing `GOV-COORD-V1-CODEX-LOCAL` grant'ina bagli ayri bir classic-append request/execution/result ucluyle yapilir. |",
    "evidenceSha": "3a3d5c3420eb9ffe005401bb4e86225ee604b2a4",
    "expectedResultSha256": "f70047f97ad497ade5336f027cd2aaff3c19bac2ddf30ad9b5572349bbb64f8e"
  },
  "declaredTargetAllowlist": [
    "project/docs/governance/decision-log.md"
  ]
}
```
<!-- GOV_COORD_REQUEST_JSON_END -->
