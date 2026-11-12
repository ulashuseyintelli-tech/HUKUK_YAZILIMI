# CL-R07 supplied owner safe-retry instruction transcription

Request-only: append exactly one supplied owner row through V1 request/execution/result. Fresh single-row release or direct owner assignment is required before Decision Log execution; previous CL-R08 and other writer turns are closed. Independent product preparation does not write protected targets. No new schema/cron, provider bypass, ambiguous resend, terminal counter reset, live operation or owner WIP mutation.

<!-- GOV_COORD_REQUEST_JSON_BEGIN -->
```json
{
  "schemaVersion": 1,
  "requestId": "GOV-REQ-20261112-CLIENT-STATEMENT-RETRY-CLR07-SA01",
  "requestFingerprint": "f724327a3f9fc5b4d1e01fbfdbfe24b6de91d89ae93f83c842c0b7ca8c91dd5d",
  "requestedBy": "CODEX_LOCAL",
  "createdAt": "2026-11-12T09:43:04Z",
  "baseMainSha": "60f90903fa8627c69db3518ce3e496a7a9f39f3a",
  "semanticAuthorityRef": {
    "kind": "SEMANTIC_AUTHORITY",
    "path": "project/docs/governance/decision-log.md",
    "recordId": "GOV-COORD-V2-T1-RATIFICATION",
    "evidenceSha": "60f90903fa8627c69db3518ce3e496a7a9f39f3a"
  },
  "executionGrantRef": {
    "kind": "EXECUTION_GRANT",
    "path": "project/docs/governance/coordination-execution-grants/GOV-COORD-V1-CODEX-LOCAL.md",
    "recordId": "GOV-COORD-V1-CODEX-LOCAL",
    "evidenceSha": "60f90903fa8627c69db3518ce3e496a7a9f39f3a"
  },
  "operation": {
    "type": "EXACT_APPEND_AT_DECLARED_ANCHOR",
    "changeClass": "LEVEL_2_MECHANICAL",
    "targetFile": "project/docs/governance/decision-log.md",
    "recordIdentity": "| Date | Decision | Scope | Source | Follow-up |",
    "anchor": "|---|---|---|---|---|",
    "expectedOldValue": "|---|---|---|---|---|",
    "newValue": "\n| 2026-11-12 | <!-- GOV-COORD-AUTHORITY kind=SEMANTIC_AUTHORITY recordId=CLIENT-STATEMENT-RETRY-CLR07-SA01 --> **CL-R07 - SUPPLIED OWNER BOUNDED RETRY GO:** Implement safe retry and reconciliation for existing monthly client PDF/H6 delivery, using the approved bounded analysis. | Preserve the exact tenant/client/statement/period/recipient/dedupe identity. Reclaim only proven FAILED deliveries under existing 3-attempt, 60-minute retry and 15-minute lease rules. Reconcile exact durable SENT evidence without transport. Uncertain PENDING never authorizes resend; expose operator reconciliation need. No terminal-counter reset, new schema or cron. | Direct owner GO in this CODEX_LOCAL task; transcript SHA256 f202cc562c686a7a37e76a2a4cc7661dde794a1d4838a93bd38ad3397ca32ca8. Mechanical transcription of supplied authority, not agent ratification or a machine grant. | Authorize focused HTTP/disposable-DB tests, PR, required CI, exact-head squash merge and main verification; no live operation. Preserve completed CL-R08/H6 scope, shared template, O-5/F04_RACE WIP and physical residues. Fresh writer coordination is required; no prior closed writer turn is reused. |",
    "evidenceSha": "60f90903fa8627c69db3518ce3e496a7a9f39f3a",
    "expectedResultSha256": "7d8eb09446ebb1e32a46a7ee1c0c223478a63ac4b0bb311dc9c8515e6efdb981"
  },
  "declaredTargetAllowlist": [
    "project/docs/governance/decision-log.md"
  ]
}
```
<!-- GOV_COORD_REQUEST_JSON_END -->
