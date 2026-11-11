# Portal email A supplied owner decision request

Request-only R02. SUPERSEDED BY this request: #3191 / GOV-REQ-20261111-CLIENT-PORTAL-EMAIL-A-SA01, whose shorter anchor matched only a prefix of the delimiter. Its unmerged execution branch fcc1a10e5c64a9b6fcb1ec2b5856b5893d671ccc is preserved; no execution PR or main target write occurred. Same task identity CLIENT-PORTAL-EMAIL-A-SA01, owner semantics, executor and exact allowlist; only IMPLEMENTATION_DESIGN / VALIDATION_APPROACH and base revision change under process-rules Task Revision. Append exactly the supplied new owner policy through the V1 chain. Fresh Decision Log writer coordination is required before target execution; prior turns are closed. Product HTTP/DB implementation and its one manifest entry are separately gated.

<!-- GOV_COORD_REQUEST_JSON_BEGIN -->
```json
{
  "schemaVersion": 1,
  "requestId": "GOV-REQ-20261111-CLIENT-PORTAL-EMAIL-A-SA01-R02",
  "requestFingerprint": "5cff6266c67381356b9e4fcb8857138e9837e4fb8a8909e6710b70028b250147",
  "requestedBy": "CODEX_LOCAL",
  "createdAt": "2026-11-11T10:45:40Z",
  "baseMainSha": "3027a2ce1a0fb6bf4e1fb0b1d3a2d818e4864486",
  "semanticAuthorityRef": {
    "kind": "SEMANTIC_AUTHORITY",
    "path": "project/docs/governance/decision-log.md",
    "recordId": "GOV-COORD-V2-T1-RATIFICATION",
    "evidenceSha": "3027a2ce1a0fb6bf4e1fb0b1d3a2d818e4864486"
  },
  "executionGrantRef": {
    "kind": "EXECUTION_GRANT",
    "path": "project/docs/governance/coordination-execution-grants/GOV-COORD-V1-CODEX-LOCAL.md",
    "recordId": "GOV-COORD-V1-CODEX-LOCAL",
    "evidenceSha": "3027a2ce1a0fb6bf4e1fb0b1d3a2d818e4864486"
  },
  "operation": {
    "type": "EXACT_APPEND_AT_DECLARED_ANCHOR",
    "changeClass": "LEVEL_2_MECHANICAL",
    "targetFile": "project/docs/governance/decision-log.md",
    "recordIdentity": "| Date | Decision | Scope | Source | Follow-up |",
    "anchor": "|---|---|---|---|---|",
    "expectedOldValue": "|---|---|---|---|---|",
    "newValue": "\n| 2026-11-11 | <!-- GOV-COORD-AUTHORITY kind=SEMANTIC_AUTHORITY recordId=CLIENT-PORTAL-EMAIL-A-SA01 --> **PORTAL EMAIL MODEL A - SUPPLIED OWNER DECISION:** Active technical portal accounts use global email uniqueness with existing trim and ASCII folding. | Preserve create/reactivate conflict 409 without another account/tenant identity disclosure. Remove exact-spelling priority in login/recovery: any normalized ambiguity (including candidate truncation) selects no account, issues no token, login-success write or email; preserve generic public responses. Inactive accounts do not reserve email; tenant suspension does not release an otherwise active account reservation. Preserve existing session/tokenVersion model and one technical portal account per Client. | Owner supplied the A policy and explicitly authorized bounded implementation, focused HTTP/disposable-DB validation, PR, required CI, exact-head merge and main verification; transcript SHA256 9a1ba92085cbe1dac51ccd80e1770da88266d41ec689b5cc83284c9ba911a061. Mechanical transcription only, not agent ratification or machine grant. | No schema/migration/live operation, legacy record rewriting/merging/transfer or new principal/role/representation. Reuse existing folded resolver and serialized account writer. Coordinate fresh single-row and one manifest-entry writer turns; prior closed turns are not reused. Preserve O-5/F04_RACE and physical residues; return writers after delivery. |",
    "evidenceSha": "3027a2ce1a0fb6bf4e1fb0b1d3a2d818e4864486",
    "expectedResultSha256": "dc747cde554cd29dac9b946ba60e6f69bcc08ed1404b85751fbd3f7bd441c6e6"
  },
  "declaredTargetAllowlist": [
    "project/docs/governance/decision-log.md"
  ]
}
```
<!-- GOV_COORD_REQUEST_JSON_END -->
