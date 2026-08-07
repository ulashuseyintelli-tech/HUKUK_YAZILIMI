# D2 request

<!-- GOV_COORD_REQUEST_JSON_BEGIN -->
```json
{
  "schemaVersion": 1,
  "requestId": "GOV-REQ-20260807-PR-A-HOOK-REMEDIATION-SA",
  "requestFingerprint": "819e3a75e687e8e06e46eddb7af58eacb88f0ed6743833f0bcd54dea850ae82a",
  "requestedBy": "OWNER",
  "createdAt": "2026-08-07T00:00:00Z",
  "baseMainSha": "f34c371a83a1e4a4aae1b0252765ba88fe95d3a7",
  "semanticAuthorityRef": {
    "kind": "SEMANTIC_AUTHORITY",
    "path": "project/docs/governance/decision-log.md",
    "recordId": "GOV-COORD-V2-T1-RATIFICATION",
    "evidenceSha": "f34c371a83a1e4a4aae1b0252765ba88fe95d3a7"
  },
  "executionGrantRef": {
    "kind": "EXECUTION_GRANT",
    "path": "project/docs/governance/coordination-execution-grants/GOV-COORD-V1-CODEX-LOCAL.md",
    "recordId": "GOV-COORD-V1-CODEX-LOCAL",
    "evidenceSha": "f34c371a83a1e4a4aae1b0252765ba88fe95d3a7"
  },
  "operation": {
    "type": "EXACT_APPEND_AT_DECLARED_ANCHOR",
    "changeClass": "LEVEL_2_MECHANICAL",
    "targetFile": "project/docs/governance/decision-log.md",
    "recordIdentity": "| Date | Decision | Scope | Source | Follow-up |",
    "anchor": "|---|---|---|---|---|",
    "expectedOldValue": "|---|---|---|---|---|",
    "newValue": "\n| 2026-08-07 | <!-- GOV-COORD-AUTHORITY kind=SEMANTIC_AUTHORITY recordId=GOV-COORD-PR-A-HOOK-REMEDIATION-R01-SA01 --> **GOV-COORD-PR-A-HOOK-REMEDIATION-R01-SA01 — TASK-BOUND SEMANTIC AUTHORITY: PR-A PR-STATUS-HOOK REMEDIATION (STAGED EXECUTION)** — Owner karari: \"REPOSITORY-WIDE-MERGE-FLOW-REMEDIATION-R01 REMAINING WORK — SEQUENTIAL OWNER GO-COMPLETE\", AŞAMA 2 — PR-A, CONDITIONAL GO-COMPLETE + OPTION 2 + STAGED EXECUTION owner düzeltmesi (protected-paths.json kendi kaydettigi dosyayla ayni execution'da kendini yetkilendiremez — self-authorization guvenlik davranisi). Yetki KAPSAMI — TAM UC ayri sonucu yetkilendirir: (1) MIRROR — `project/scripts/orchestration-v2/orchestrator/orchestrator.cjs` `IMMUTABLE_FORBIDDEN` dizisine TAM SEKIZ exact literal ekleme: `project/scripts/pr-status-taxonomy.cjs`, `project/scripts/pr-status-taxonomy.test.cjs`, `project/scripts/pr-status-hook-adapter.cjs`, `project/scripts/pr-status-hook-adapter.test.cjs`, `project/scripts/pr-status-hook-launcher.cjs`, `project/scripts/pr-status-hook-launcher.test.cjs`, `project/scripts/install-pr-status-hook.cjs`, `project/scripts/install-pr-status-hook.test.cjs` — mevcut sira/stil, wildcard/refactor/baska davranis degisikligi YOK; (2) REGISTRATION — `project/docs/governance/governance-writer-coordination-protected-paths.json` `coordinationControlPlane`'e AYNI SEKIZ exact literal; (3) IMPLEMENTATION — `.github/workflows/ci.yml`'e SADECE UC yeni `node --test` satiri (adapter/launcher/install-hook) VE ALTI yeni dosyanin (A) olusturulmasi: `project/scripts/pr-status-hook-adapter.cjs`, `project/scripts/pr-status-hook-adapter.test.cjs`, `project/scripts/pr-status-hook-launcher.cjs`, `project/scripts/pr-status-hook-launcher.test.cjs`, `project/scripts/install-pr-status-hook.cjs`, `project/scripts/install-pr-status-hook.test.cjs`. Yurutme sirasi ZORUNLU: MIRROR once (normal PR, ayri EG yok, bu SA'ya provenance atifla, gercek validatePrScope, 9/9 CI), sonra REGISTRATION (ayri EG: `EG-REGISTRATION`, kendi requestId/grantNonce), sonra IMPLEMENTATION (ayri EG: `EG-IMPLEMENTATION`, farkli requestId/executionGrantId/grantNonce) — REGISTRATION ve IMPLEMENTATION AYNI EG'yi KULLANAMAZ (`GENERIC_EXECUTION_GRANT_REUSED`). | ACIKCA KAPSAM DISI: `~/.claude/hooks/` altindaki repo-disi dosyaya dogrudan elle yama (yalniz canonical installer ile local aktivasyon); `task-disposition-guard.cjs`; ci.yml'e workflow-scope disinda baska degisiklik; #2243 (CLIENT C2-I08, farkli program, dokunulmaz). | Owner karari kaynagi: bu oturum, `OWNER DECISION : STAGED EXECUTION APPROVED`, `ORDER : SA → MIRROR → REGISTRATION → IMPLEMENTATION → LOCAL ACTIVATION`, `SEMANTIC AUTH : ONE TASK-BOUND SA`, `EXEC GRANTS : TWO DISTINCT GRANTS`, `COMBINED COMMIT: LOCAL EVIDENCE ONLY / DO NOT PUSH`, `PROGRAM LOCK : MERGE-FLOW / CONTROL-PLANE ONLY`. | Bu kayit tek basina implementation veya execution yetkisi VERMEZ; her landing kendi execution grant/request/result zincirine tabidir; SA yeniden kullanilabilir, EG/nonce yeniden kullanilamaz; her ayrilmis diff kendi test paketinde 9/9 PASS olmadan merge edilmez. |",
    "evidenceSha": "f34c371a83a1e4a4aae1b0252765ba88fe95d3a7",
    "expectedResultSha256": "7c01e65822ed9afdbec328b907f9634d06b9043658eca5610b3a33ff09df76b6"
  },
  "declaredTargetAllowlist": [
    "project/docs/governance/decision-log.md"
  ]
}
```
<!-- GOV_COORD_REQUEST_JSON_END -->
