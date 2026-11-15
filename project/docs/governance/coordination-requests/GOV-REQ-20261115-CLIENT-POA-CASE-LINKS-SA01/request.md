# Explicit POA case links — supplied owner decision

REQUEST_ONLY: one owner-approved Decision Log row through the existing V1 chain. No target write, product implementation, reusable grant, prior-turn reuse or live authority is created by this request.

<!-- GOV_COORD_REQUEST_JSON_BEGIN -->
```json
{
  "schemaVersion": 1,
  "requestId": "GOV-REQ-20261115-CLIENT-POA-CASE-LINKS-SA01",
  "requestFingerprint": "7b92d93a0ab4d9d15b37ad408361b3e72e7919ad6ee3ead0d59d47356be90401",
  "requestedBy": "OWNER",
  "createdAt": "2026-11-15T19:16:07Z",
  "baseMainSha": "97a8eb60c4fe3e6198fe735773f4be6b0ef1bec6",
  "semanticAuthorityRef": {
    "kind": "SEMANTIC_AUTHORITY",
    "path": "project/docs/governance/decision-log.md",
    "recordId": "GOV-COORD-V2-T1-RATIFICATION",
    "evidenceSha": "97a8eb60c4fe3e6198fe735773f4be6b0ef1bec6"
  },
  "executionGrantRef": {
    "kind": "EXECUTION_GRANT",
    "path": "project/docs/governance/coordination-execution-grants/GOV-COORD-V1-CODEX-LOCAL.md",
    "recordId": "GOV-COORD-V1-CODEX-LOCAL",
    "evidenceSha": "97a8eb60c4fe3e6198fe735773f4be6b0ef1bec6"
  },
  "operation": {
    "type": "EXACT_APPEND_AT_DECLARED_ANCHOR",
    "changeClass": "LEVEL_2_MECHANICAL",
    "targetFile": "project/docs/governance/decision-log.md",
    "recordIdentity": "| Date | Decision | Scope | Source | Follow-up |",
    "anchor": "|---|---|---|---|---|",
    "expectedOldValue": "|---|---|---|---|---|",
    "newValue": "\n| 2026-11-15 | <!-- GOV-COORD-AUTHORITY kind=SEMANTIC_AUTHORITY recordId=CLIENT-POA-CASE-LINKS-SA01 --> **SUPPLIED OWNER DECISION — EXPLICIT POA CASE LIST:** Owner approved 1-A, 2-B and 3-A: prepare and implement a separate additive POA-to-case link, with only individually declared canonical cases forming a closed list. A parent/child case, later proceeding or similar file number does not inherit a link. | Link the existing ClientPowerOfAttorney to existing canonical CaseClient and Case records in the same tenant/client. Preserve current POA_UPDATE action eligibility plus actor-object scope on every target; a link grants no new role, financial capability, legal-operation sufficiency or send permission. The existing client POA management screen is the bounded writer; case creation and UYAP projections retain their current contracts. Additive schema/migration engineering and disposable-DB validation are within this task; no backfill or automatic legacy linking. | Direct owner approval in this CODEX_LOCAL task, 2026-11-15: 1-A, 2-B and 3-A approved; implement the bounded POA-case link including additive schema/migration, coordinate writers, complete tests, PR, required CI, exact-head merge and main verification. This row transcribes supplied owner meaning, not agent ratification or a machine execution grant. | Preserve completed CL-R14/A and UYAP/I15-D1 decisions and actual gates. Do not activate new operation families or a general POA scope evaluator. No live operation, production migration/apply, new SoT/FX/role, parent record deletion or bulk legacy rewrite. Protect O-5/F04_RACE, Claude OD-07 and physical residues; use fresh bounded writer turns and return them after delivery. |",
    "evidenceSha": "97a8eb60c4fe3e6198fe735773f4be6b0ef1bec6",
    "expectedResultSha256": "a02386e73b7bdd3e57a09a779b101096105eba55cd41e2b3b9de43c26177d55f"
  },
  "declaredTargetAllowlist": [
    "project/docs/governance/decision-log.md"
  ]
}
```
<!-- GOV_COORD_REQUEST_JSON_END -->
