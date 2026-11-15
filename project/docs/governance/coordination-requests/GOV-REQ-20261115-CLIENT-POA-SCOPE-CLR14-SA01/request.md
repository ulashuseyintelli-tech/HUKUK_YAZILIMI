# CL-R14 model A — supplied owner decision transcription

Request-only: one fresh exact Decision Log row. Existing request/grant/closed writer turns are not modified or reused. This does not implement POA-to-case sufficiency or change a send gate.

<!-- GOV_COORD_REQUEST_JSON_BEGIN -->
```json
{
  "schemaVersion": 1,
  "requestId": "GOV-REQ-20261115-CLIENT-POA-SCOPE-CLR14-SA01",
  "requestFingerprint": "4471f73562d1b8fa11ee193136e1c83649c18b0c9c1c3496d54f81a5a410abfb",
  "requestedBy": "OWNER",
  "createdAt": "2026-11-15T13:55:44Z",
  "baseMainSha": "91237fb9e16058ed2740d72de0451054b30c3251",
  "semanticAuthorityRef": {
    "kind": "SEMANTIC_AUTHORITY",
    "path": "project/docs/governance/decision-log.md",
    "recordId": "GOV-COORD-V2-T1-RATIFICATION",
    "evidenceSha": "91237fb9e16058ed2740d72de0451054b30c3251"
  },
  "executionGrantRef": {
    "kind": "EXECUTION_GRANT",
    "path": "project/docs/governance/coordination-execution-grants/GOV-COORD-V1-CODEX-LOCAL.md",
    "recordId": "GOV-COORD-V1-CODEX-LOCAL",
    "evidenceSha": "91237fb9e16058ed2740d72de0451054b30c3251"
  },
  "operation": {
    "type": "EXACT_APPEND_AT_DECLARED_ANCHOR",
    "changeClass": "LEVEL_2_MECHANICAL",
    "targetFile": "project/docs/governance/decision-log.md",
    "recordIdentity": "| Date | Decision | Scope | Source | Follow-up |",
    "anchor": "|---|---|---|---|---|",
    "expectedOldValue": "|---|---|---|---|---|",
    "newValue": "\n| 2026-11-15 | <!-- GOV-COORD-AUTHORITY kind=SEMANTIC_AUTHORITY recordId=CLIENT-POA-SCOPE-CLR14-SA01 --> **SUPPLIED OWNER DECISION — CL-R14 MODEL A:** Owner selected the previously prepared schema-free clarity slice for generic POA checks. An active/date-eligible POA record does not establish that an operation or case scope has been assessed; expose that scope was not evaluated rather than implying operation-level sufficiency. | Only the existing generic POA read results and their wizard/UYAP pre-check projections and UI wording. Preserve existing isValid and canProceedToUyap compatibility, selected-lawyer any-match semantics, tenant/object authorization, validity/date calculation, wizard nonblocking warnings and actual UYAP send authority gates including I15-D1. Empty case/lawyer sets must not be described as proof that documents were found. | Direct owner continuation in this CODEX_LOCAL task, 2026-11-15: CL-R14 model A approved; complete focused tests, PR, required CI, exact-head merge and main verification under the existing task-bound authority. This row transcribes supplied owner meaning; it is not agent ratification or a machine grant. | Do not add schema/migration, a POA-to-case evaluator, a general legal scope acceptance map, new SoT/FX/roles, new send permission or live operation. Full operation/case sufficiency remains outside this slice. Preserve completed six deliveries, OD-07/O-5/F04_RACE and physical residues. The separate fresh Intel manifest-only writer turn is returned after its own delivery; no closed Decision Log turn is reused. |",
    "evidenceSha": "91237fb9e16058ed2740d72de0451054b30c3251",
    "expectedResultSha256": "dd2eff2c657f75fe1b3ab65e6e2fd1d84404258eb314d7658a14c5c2770909d8"
  },
  "declaredTargetAllowlist": [
    "project/docs/governance/decision-log.md"
  ]
}
```
<!-- GOV_COORD_REQUEST_JSON_END -->
