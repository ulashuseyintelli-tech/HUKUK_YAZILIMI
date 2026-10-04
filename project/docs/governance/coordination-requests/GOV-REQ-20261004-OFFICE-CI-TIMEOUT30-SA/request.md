# OFFICE CI Test Suite timeout 20 -> 30 — sa request

Owner-supplied exact scope; historical #2914 remains open and unmerged.

<!-- GOV_COORD_REQUEST_JSON_BEGIN -->
```json
{
  "schemaVersion": 1,
  "requestId": "GOV-REQ-20261004-OFFICE-CI-TIMEOUT30-SA",
  "requestFingerprint": "61c7113e03010a61b00842e76e5afcb947e21dba052310d281597ad78379a9ed",
  "requestedBy": "CODEX_LOCAL",
  "createdAt": "2026-10-04T19:09:24Z",
  "baseMainSha": "549b8344c1c97537f95d4b69c9ad12d0a3ebd8af",
  "semanticAuthorityRef": {
    "kind": "SEMANTIC_AUTHORITY",
    "path": "project/docs/governance/decision-log.md",
    "recordId": "GOV-COORD-V2-T1-RATIFICATION",
    "evidenceSha": "549b8344c1c97537f95d4b69c9ad12d0a3ebd8af"
  },
  "executionGrantRef": {
    "kind": "EXECUTION_GRANT",
    "path": "project/docs/governance/coordination-execution-grants/GOV-COORD-V1-CODEX-LOCAL.md",
    "recordId": "GOV-COORD-V1-CODEX-LOCAL",
    "evidenceSha": "549b8344c1c97537f95d4b69c9ad12d0a3ebd8af"
  },
  "operation": {
    "type": "EXACT_APPEND_AT_DECLARED_ANCHOR",
    "changeClass": "LEVEL_2_MECHANICAL",
    "targetFile": "project/docs/governance/decision-log.md",
    "recordIdentity": "| Date | Decision | Scope | Source | Follow-up |",
    "anchor": "|---|---|---|---|---|",
    "expectedOldValue": "|---|---|---|---|---|",
    "newValue": "\n| 2026-10-04 | <!-- GOV-COORD-AUTHORITY kind=SEMANTIC_AUTHORITY recordId=OFFICE-CI-TIMEOUT30-SA01 --> **OFFICE-CI-TIMEOUT30-SA01 — OWNER TEST SUITE TIMEOUT AMENDMENT / #2914 HANDOFF**: Owner authorizes CODEX_LOCAL to change only jobs.test-suite.timeout-minutes from 20 to 30 and its three adjacent explanation lines. This narrowly supersedes OFFICE-CI-REAL-SA01 no-timeout-increase for this single Test Suite value only; all other SA01/SA02 constraints remain. | Exact target is .github/workflows/ci.yml from 08d175bcb7a700773de178bbc3aa3dfeafa64de1: base SHA256 74e3a158032b9d61ec5ed7b35f0b40b1f794c4e526b6b00ff5323d39f2a83c96 -> target e682aadaf85d49e0eedd7082e2351e91d839595d3050811bc131aa9b5381f616; implementation is one file, 4 additions / 4 deletions. Test coverage, manifests, workers, test commands, all other job/step limits, triggers, concurrency, job/check names and permissions remain unchanged. This is not a performance improvement. | Owner original decision 2026-10-03 22:25 TSI item 5, 2026-10-04 18:47 TSI item 1, and explicit OWNER GO / CODEX_LOCAL / #2914 handoff in this task. Supplied owner decision is recorded mechanically; no agent self-authorisation. | Follow existing V1 request -> grant -> execution -> result, with a separate exact task-bound EG. Owner grants IF GO-COMPLETE for each verified exact-head merge only after repository gates and mandatory checks including Architectural Guardrails and Web Tests (vitest), successful CI and idle main CI. No auto-merge, force-push, bypass or weakened guards. Gate failure stops the chain as BLOCKED. Keep #2914 open as historical evidence without merging it; OFFICE no longer writes ci.yml. SA request/execution require unchanged decision-log; execution requires the pinned base ci.yml or owner-notified re-preparation. Final acceptance: execution Test Suite/Guardrails PASS, post-merge main Test Suite green, result SUCCEEDED. No product/runtime/deployment authority. |",
    "evidenceSha": "549b8344c1c97537f95d4b69c9ad12d0a3ebd8af",
    "expectedResultSha256": "2385464cf5d2a03db68c03cd9c8b6d4401add87cd133ce54db6993959a97ad27"
  },
  "declaredTargetAllowlist": [
    "project/docs/governance/decision-log.md"
  ]
}
```
<!-- GOV_COORD_REQUEST_JSON_END -->
