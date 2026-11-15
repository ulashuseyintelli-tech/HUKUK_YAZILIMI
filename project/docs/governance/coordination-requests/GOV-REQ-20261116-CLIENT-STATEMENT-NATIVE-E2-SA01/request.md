# E2 native-currency document sets — supplied owner decision

REQUEST_ONLY. One bounded owner decision transcription; no target write, reusable authority or live activation.

<!-- GOV_COORD_REQUEST_JSON_BEGIN -->
```json
{
  "schemaVersion": 1,
  "requestId": "GOV-REQ-20261116-CLIENT-STATEMENT-NATIVE-E2-SA01",
  "requestFingerprint": "71f21731b5ee78b0a279597bcf98bfdaf5aedfa867e768d6b8af9e297389e156",
  "requestedBy": "OWNER",
  "createdAt": "2026-11-15T22:24:49Z",
  "baseMainSha": "8b25f53f65cf6df8b024ffff0ea17dd13a7babba",
  "semanticAuthorityRef": {
    "kind": "SEMANTIC_AUTHORITY",
    "path": "project/docs/governance/decision-log.md",
    "recordId": "GOV-COORD-V2-T1-RATIFICATION",
    "evidenceSha": "8b25f53f65cf6df8b024ffff0ea17dd13a7babba"
  },
  "executionGrantRef": {
    "kind": "EXECUTION_GRANT",
    "path": "project/docs/governance/coordination-execution-grants/GOV-COORD-V1-CODEX-LOCAL.md",
    "recordId": "GOV-COORD-V1-CODEX-LOCAL",
    "evidenceSha": "8b25f53f65cf6df8b024ffff0ea17dd13a7babba"
  },
  "operation": {
    "type": "EXACT_APPEND_AT_DECLARED_ANCHOR",
    "changeClass": "LEVEL_2_MECHANICAL",
    "targetFile": "project/docs/governance/decision-log.md",
    "recordIdentity": "| Date | Decision | Scope | Source | Follow-up |",
    "anchor": "|---|---|---|---|---|",
    "expectedOldValue": "|---|---|---|---|---|",
    "newValue": "\n| 2026-11-16 | <!-- GOV-COORD-AUTHORITY kind=SEMANTIC_AUTHORITY recordId=CLIENT-STATEMENT-NATIVE-E2-SA01 --> **SUPPLIED OWNER DECISION — E2 MODEL A:** Prepare and implement native-currency client-level statements as a complete immutable document set with a separate statement for each source currency. Preserve existing financial source ownership, status/sign rules, attribution and non-cash treatment. No FX conversion, common TRY total, new financial SoT or role authority. | The owner explicitly approved preparing the rate-free E2 design independently of FR-7; every rate-dependent option remains outside this narrow supersession. Preserve completed H-07/M-2, E1 source-currency refusal, accepted H6 legacy monthly delivery and CL-R07 retry/reconciliation. Do not reinterpret case-global advances as client-specific money or rewrite legacy snapshots. Group identity, per-currency documents, complete-set delivery binding, duplicate prevention and transactional audit require bounded additive schema/migration engineering. | Direct owner instructions in this CODEX_LOCAL task, 2026-11-16: E2 A model and FR-7-independent rate-free design approved; implement the prepared narrow API/web/document/dedupe/monthly acceptance boundary including additive schema/migration, coordinate writership, complete tests, PR, required CI, exact-head merge and main verification. This row transcribes supplied owner meaning, not agent ratification or a new machine grant. | No partial successful set or silent partial delivery. Invalid/ambiguous source currency fails closed; financial snapshots and audit commit atomically. All currency documents must be ready before the single logical monthly delivery; existing sent/uncertain evidence cannot be bypassed by new currency/set keys. E2 live monthly activation remains OFF. No live operation, production migration/data write, backfill, historic retagging, FX policy or G2 summary expansion. Preserve O-5/F04_RACE/OD-07, old artifacts and closed writer turns; fresh turns are returned after delivery. |",
    "evidenceSha": "8b25f53f65cf6df8b024ffff0ea17dd13a7babba",
    "expectedResultSha256": "21a683285b37ca5335903b4452d23bd4b84b12c9ef64b1b2305809dfa1e92144"
  },
  "declaredTargetAllowlist": [
    "project/docs/governance/decision-log.md"
  ]
}
```
<!-- GOV_COORD_REQUEST_JSON_END -->
