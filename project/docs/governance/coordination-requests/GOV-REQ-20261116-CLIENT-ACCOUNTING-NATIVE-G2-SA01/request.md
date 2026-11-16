# Financial G2 native-currency summary — supplied owner decision

REQUEST_ONLY. One bounded owner decision transcription; no target write, new grant or live authority.

<!-- GOV_COORD_REQUEST_JSON_BEGIN -->
```json
{
  "schemaVersion": 1,
  "requestId": "GOV-REQ-20261116-CLIENT-ACCOUNTING-NATIVE-G2-SA01",
  "requestFingerprint": "df0e3dfbf6563d33b42241f183f9bb10a7ee63d12ddb2f203dd50316ebeff411",
  "requestedBy": "OWNER",
  "createdAt": "2026-11-16T11:54:07Z",
  "baseMainSha": "93291fa4d2a9fbfa310803a2b5c3fc2272de9d13",
  "semanticAuthorityRef": {
    "kind": "SEMANTIC_AUTHORITY",
    "path": "project/docs/governance/decision-log.md",
    "recordId": "GOV-COORD-V2-T1-RATIFICATION",
    "evidenceSha": "93291fa4d2a9fbfa310803a2b5c3fc2272de9d13"
  },
  "executionGrantRef": {
    "kind": "EXECUTION_GRANT",
    "path": "project/docs/governance/coordination-execution-grants/GOV-COORD-V1-CODEX-LOCAL.md",
    "recordId": "GOV-COORD-V1-CODEX-LOCAL",
    "evidenceSha": "93291fa4d2a9fbfa310803a2b5c3fc2272de9d13"
  },
  "operation": {
    "type": "EXACT_APPEND_AT_DECLARED_ANCHOR",
    "changeClass": "LEVEL_2_MECHANICAL",
    "targetFile": "project/docs/governance/decision-log.md",
    "recordIdentity": "| Date | Decision | Scope | Source | Follow-up |",
    "anchor": "|---|---|---|---|---|",
    "expectedOldValue": "|---|---|---|---|---|",
    "newValue": "\n| 2026-11-16 | <!-- GOV-COORD-AUTHORITY kind=SEMANTIC_AUTHORITY recordId=CLIENT-ACCOUNTING-NATIVE-G2-SA01 --> **SUPPLIED OWNER DECISION — FINANCIAL G2 MODEL A:** Prepare and implement a rate-free native-currency General Account summary, independently of FR-7. Preserve current monetary sources, formulas, source status/sign and canonical CaseClient attribution. Separate currencies and preserve client-specific versus case-wide shared context; no common TRY total, FX conversion, new financial SoT or role authority. | A complete source-consistent read or explicit unavailable result is required. Unproven currency, attribution or calculation cannot be replaced by zero or silently omitted. Do not make historical E2 statements a current-balance SoT. Preserve existing legacy single-currency API/reader selection, journal/shadow boundaries, CL-R12 remaining computation, offset/reversal, HELD and distinct-case counting. G2 currency selection is read-only and must not implicitly change existing payment/offset, movement or statement operation contexts. | Direct owner instructions in this CODEX_LOCAL task, 2026-11-16: G2 A approved within the prepared narrow API/web/consumer/acceptance boundary; implement, temporarily take only the decision row and manifest writer turns, then return them; complete tests, PR, required CI, exact-head merge and main verification. This is supplied owner meaning, not agent ratification, self-authorisation or a new machine grant. | No schema/migration, backfill, source rewrite, new permission, interest/fee/base/FX rule, money movement, cron, dispatch, E2/E1/H6 change or live operation. The E2 default-OFF activation boundary and all FR-7 rate/base choices remain separate. Preserve O-5/F04_RACE WIP, OD-07, old evidence and physical residues. Fresh task-only row/manifest assignment is direct owner assignment, not CLIENT acknowledgement or reuse of any closed handoff; return each after its bounded delivery. |",
    "evidenceSha": "93291fa4d2a9fbfa310803a2b5c3fc2272de9d13",
    "expectedResultSha256": "f1d26d3e12fc148b3e0564af21e5d4f478e9b4108e843488393d1b81894768e9"
  },
  "declaredTargetAllowlist": [
    "project/docs/governance/decision-log.md"
  ]
}
```
<!-- GOV_COORD_REQUEST_JSON_END -->
