# K7.3 supplied time-bound access and revocation decision

Request-only. Fresh single-row Decision Log and single-spec manifest writer sequencing is pending; no protected target write is performed.

<!-- GOV_COORD_REQUEST_JSON_BEGIN -->
```json
{
  "schemaVersion": 1,
  "requestId": "GOV-REQ-20261109-CLIENT-K73-ACCESS-SA01",
  "requestFingerprint": "6eb6907ebb0e6e1b8c9f312b79f3716b954c5dc502672d87fb5fb0e8fea5185b",
  "requestedBy": "CODEX_LOCAL",
  "createdAt": "2026-11-09T20:47:21Z",
  "baseMainSha": "68aaccb6f857cdec4ec33b477c4c2011782ce0f8",
  "semanticAuthorityRef": {
    "kind": "SEMANTIC_AUTHORITY",
    "path": "project/docs/governance/decision-log.md",
    "recordId": "GOV-COORD-V2-T1-RATIFICATION",
    "evidenceSha": "68aaccb6f857cdec4ec33b477c4c2011782ce0f8"
  },
  "executionGrantRef": {
    "kind": "EXECUTION_GRANT",
    "path": "project/docs/governance/coordination-execution-grants/GOV-COORD-V1-CODEX-LOCAL.md",
    "recordId": "GOV-COORD-V1-CODEX-LOCAL",
    "evidenceSha": "68aaccb6f857cdec4ec33b477c4c2011782ce0f8"
  },
  "operation": {
    "type": "EXACT_APPEND_AT_DECLARED_ANCHOR",
    "changeClass": "LEVEL_2_MECHANICAL",
    "targetFile": "project/docs/governance/decision-log.md",
    "recordIdentity": "| Date | Decision | Scope | Source | Follow-up |",
    "anchor": "|---|---|---|---|---|",
    "expectedOldValue": "|---|---|---|---|---|",
    "newValue": "\n| 2026-11-09 | <!-- GOV-COORD-AUTHORITY kind=SEMANTIC_AUTHORITY recordId=CLIENT-SPECIAL-CATEGORY-K73-SA01 --> **K7.3 — SUPPLIED OWNER DECISIONS 1-5:** Protect only the existing classified special-category record flow with personal, tenant-bound, explicit client/case and operation-bound finite grants. Existing action-specific eligibility AND canonical object scope remain required; grant alone creates no read/write/export/approval authority. | Issuer is active same-tenant ADMIN without staff linkage; management does not confer content access and self-grant is forbidden. Require explicit validFrom and finite validUntil without invented fixed duration or automatic renewal. Account/profile deactivation, loss of the relevant canonical object relation and an explicitly recorded duty change close affected grants; reactivation/reassignment never revives them. Preserve history, encryption and existing action policies. Grant/revocation/lifecycle hooks and minimized audit are atomic; recheck current database identity, scope and time after lock waits. Existing JWT does not bypass a committed revocation. No recall of previously delivered data is promised. | Owner approved decisions 1-5 and the bounded API/web/consumer plan, then explicitly authorized implementation including additive schema/migration, focused HTTP/disposable-DB tests, PR, required CI, exact-head merge and main validation. Supplied authority transcription OWNER-AUTHORITY.txt SHA256 661b06f294742d787df1505b0f3ca77624c7306b72f50e4893ac90d8678320c0; this row is not agent ratification or machine authority. | Fresh narrow writer coordination is required for this single row and the one-spec domain manifest entry. Preserve G1/G2, O-5 keepGrantIds/keepContactGrantIds, F04_RACE WIP and physical residues. No live deployment/DB/migration, legacy data rewrite, MFA, DIS-D8, competency matrix, periodic-review program, export/download surface or general Office/Client acceptance. |",
    "evidenceSha": "68aaccb6f857cdec4ec33b477c4c2011782ce0f8",
    "expectedResultSha256": "3d8d41e7b181f5dd1b6f1ba5db906b441989cb409fd7f5abcfcb07bf11726160"
  },
  "declaredTargetAllowlist": [
    "project/docs/governance/decision-log.md"
  ]
}
```
<!-- GOV_COORD_REQUEST_JSON_END -->
