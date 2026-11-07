# Client 4d — supplied owner recipient-open meaning

Request-only; no protected target is modified. Only the fresh one-row task-bound turn applies, not any prior closed turn or claimed CLIENT acknowledgement.

<!-- GOV_COORD_REQUEST_JSON_BEGIN -->
```json
{
  "schemaVersion": 1,
  "requestId": "GOV-REQ-20261107-CLIENT-PORTAL-MESSAGE-READ-4D-SA01",
  "requestFingerprint": "f0f8268b8236d75eec412e07e437a3949a012d17f90ecf3071c19fc8afe723f0",
  "requestedBy": "CODEX_LOCAL",
  "createdAt": "2026-11-07T18:53:29Z",
  "baseMainSha": "5b8db7f3875575ed0d0a9bca0a00fbb0cc87ab5a",
  "semanticAuthorityRef": {
    "kind": "SEMANTIC_AUTHORITY",
    "path": "project/docs/governance/decision-log.md",
    "recordId": "GOV-COORD-V2-T1-RATIFICATION",
    "evidenceSha": "5b8db7f3875575ed0d0a9bca0a00fbb0cc87ab5a"
  },
  "executionGrantRef": {
    "kind": "EXECUTION_GRANT",
    "path": "project/docs/governance/coordination-execution-grants/GOV-COORD-V1-CODEX-LOCAL.md",
    "recordId": "GOV-COORD-V1-CODEX-LOCAL",
    "evidenceSha": "5b8db7f3875575ed0d0a9bca0a00fbb0cc87ab5a"
  },
  "operation": {
    "type": "EXACT_APPEND_AT_DECLARED_ANCHOR",
    "changeClass": "LEVEL_2_MECHANICAL",
    "targetFile": "project/docs/governance/decision-log.md",
    "recordIdentity": "| Date | Decision | Scope | Source | Follow-up |",
    "anchor": "|---|---|---|---|---|",
    "expectedOldValue": "|---|---|---|---|---|",
    "newValue": "\n| 2026-11-07 | <!-- GOV-COORD-AUTHORITY kind=SEMANTIC_AUTHORITY recordId=CLIENT-PORTAL-MESSAGE-READ-4D-SA01 --> **CLIENT 4d — SUPPLIED OWNER RECIPIENT-OPEN MEANING:** Read means only the application's record that the recipient actor opened that particular message. Listing, sending and provider acceptance do not mean read. | Existing message lists become read-only. Both current message screens acknowledge only the explicitly opened incoming message; old empty bulk acknowledgements fail closed. Preserve tenant, linked portal account, existing action eligibility and canonical office client/case relation using the existing scope helper. Commit the first read timestamp and bounded actor audit atomically; retries/concurrent opens preserve first-read history. No notification-read change, schema/migration, historical rewrite, per-person receipt system, legal service, comprehension or authenticated client-consent claim. | Owner approved package choices 1-6 and expressly authorized this 4d task through focused tests, PR, required CI, exact-head merge and main verification without interim approval. OWNER-AUTHORITY.txt SHA256 757f623467a60b6e9f2768c56d74bde4bc07c45fb8eec69e6d288fafd5cf4800; approved package SHA256 fa117c3df2711f8e7881d4f937038e20d6bdd40306519032c74a9bc42b60899c. Supplied-owner transcription only; not agent ratification or a machine grant. | Fresh task-bound single-row sequencing notice #2750/6711580404, not CLIENT acknowledgement or reuse of the returned 4c turn. No other Decision Log row, Charter, backlog or manifest write. Existing selected specs extended. Preserve O-5/F04_RACE, completed work and all physical residues. No live operation or general Office/Client closure. |",
    "evidenceSha": "5b8db7f3875575ed0d0a9bca0a00fbb0cc87ab5a",
    "expectedResultSha256": "f2019309cd2da3c982ad13e5185620005bbca240a371fbbde2ec1bb4441955ff"
  },
  "declaredTargetAllowlist": [
    "project/docs/governance/decision-log.md"
  ]
}
```
<!-- GOV_COORD_REQUEST_JSON_END -->
