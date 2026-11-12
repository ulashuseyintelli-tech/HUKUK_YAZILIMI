# CL-R10 supplied owner FD recovery instruction transcription

Request-only: append exactly one supplied owner row through V1 request/execution/result. Fresh single-row release or direct owner assignment is required before Decision Log execution; previous CL-R08 and other writer turns are closed. Independent product preparation does not write protected targets. No new schema/cron, provider bypass, ambiguous resend, terminal counter reset, live operation or owner WIP mutation.

<!-- GOV_COORD_REQUEST_JSON_BEGIN -->
```json
{
  "schemaVersion": 1,
  "requestId": "GOV-REQ-20261113-CLIENT-FD-RECOVERY-CLR10-SA01",
  "requestFingerprint": "37316b54360c172eb38d1ed217714d800ed71e9cf01afba5da8a12b0ebb65f73",
  "requestedBy": "CODEX_LOCAL",
  "createdAt": "2026-11-12T21:51:25Z",
  "baseMainSha": "3bed1b872f0f083a7d375d444afcec3daf02c1c4",
  "semanticAuthorityRef": {
    "kind": "SEMANTIC_AUTHORITY",
    "path": "project/docs/governance/decision-log.md",
    "recordId": "GOV-COORD-V2-T1-RATIFICATION",
    "evidenceSha": "3bed1b872f0f083a7d375d444afcec3daf02c1c4"
  },
  "executionGrantRef": {
    "kind": "EXECUTION_GRANT",
    "path": "project/docs/governance/coordination-execution-grants/GOV-COORD-V1-CODEX-LOCAL.md",
    "recordId": "GOV-COORD-V1-CODEX-LOCAL",
    "evidenceSha": "3bed1b872f0f083a7d375d444afcec3daf02c1c4"
  },
  "operation": {
    "type": "EXACT_APPEND_AT_DECLARED_ANCHOR",
    "changeClass": "LEVEL_2_MECHANICAL",
    "targetFile": "project/docs/governance/decision-log.md",
    "recordIdentity": "| Date | Decision | Scope | Source | Follow-up |",
    "anchor": "|---|---|---|---|---|",
    "expectedOldValue": "|---|---|---|---|---|",
    "newValue": "\n| 2026-11-13 | <!-- GOV-COORD-AUTHORITY kind=SEMANTIC_AUTHORITY recordId=CLIENT-FD-RECOVERY-CLR10-SA01 --> **CL-R10 A - SUPPLIED OWNER BOUNDED FD RECOVERY GO:** Implement evidence-based recovery for KI-228 and KI-229. | Only trustworthy definite rejection permits explicit resend. Persist approved-provider acceptance plus message ID and SENT audit before final guarded publication; recover matching durable acceptance without transport. Unknown, missing-ID and unclassified legacy evidence remains blocked, not PUBLISHED. Preserve existing actor/tenant/approval/recipient/snapshot checks and single publication; no new human approval. Bounded Charter 43.2 clarification permits the accepted-evidence branch without weakening 35.10/35.11. | Direct owner GO in this CODEX_LOCAL task; transcript SHA256 de670d30edc55c5355466d6cd79f31cc9a1cce6c0e8470ab112c77ddc0464c8c. Mechanical transcription of supplied authority, not agent ratification or a machine grant. | Focused HTTP/disposable-DB tests, PR, required CI, exact-head squash merge and main verification. No automatic recovery guarantee before first durable acceptance evidence; no CL-R07 timer/count policy, schema, cron, external-proof entry or live operation. Preserve completed work, O-5/F04_RACE and residues; fresh writer sequencing required. |",
    "evidenceSha": "3bed1b872f0f083a7d375d444afcec3daf02c1c4",
    "expectedResultSha256": "dcc088fe5c5bc22547f03a54e261b3364175e5b53bf318ce4fc1ea7cca1993c8"
  },
  "declaredTargetAllowlist": [
    "project/docs/governance/decision-log.md"
  ]
}
```
<!-- GOV_COORD_REQUEST_JSON_END -->
