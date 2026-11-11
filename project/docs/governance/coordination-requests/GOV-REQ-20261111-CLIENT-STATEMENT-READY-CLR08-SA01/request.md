# CL-R08 supplied owner decision transcription

Request-only. Append exactly one supplied owner decision row through the existing V1 request/execution/result chain. Fresh single-row writer release or direct owner assignment is required before target execution; previous portal-email/H13/K73 turns are closed and are not reused. The bounded Charter/CAD references need their own exact authorised task-bound changeset. Independent product/test preparation does not write protected targets. No monthly PDF/H6, shared template, delivery ledger, portal permission, live operation or owner WIP change.

<!-- GOV_COORD_REQUEST_JSON_BEGIN -->
```json
{
  "schemaVersion": 1,
  "requestId": "GOV-REQ-20261111-CLIENT-STATEMENT-READY-CLR08-SA01",
  "requestFingerprint": "9e2dc6836b7721d7e0f9e27a838c2a8369d72401b06d5fabc414b171a68f7025",
  "requestedBy": "CODEX_LOCAL",
  "createdAt": "2026-11-11T16:33:04Z",
  "baseMainSha": "aef31f2425a4ea3ab93acef9884f0cf4678c22f0",
  "semanticAuthorityRef": {
    "kind": "SEMANTIC_AUTHORITY",
    "path": "project/docs/governance/decision-log.md",
    "recordId": "GOV-COORD-V2-T1-RATIFICATION",
    "evidenceSha": "aef31f2425a4ea3ab93acef9884f0cf4678c22f0"
  },
  "executionGrantRef": {
    "kind": "EXECUTION_GRANT",
    "path": "project/docs/governance/coordination-execution-grants/GOV-COORD-V1-CODEX-LOCAL.md",
    "recordId": "GOV-COORD-V1-CODEX-LOCAL",
    "evidenceSha": "aef31f2425a4ea3ab93acef9884f0cf4678c22f0"
  },
  "operation": {
    "type": "EXACT_APPEND_AT_DECLARED_ANCHOR",
    "changeClass": "LEVEL_2_MECHANICAL",
    "targetFile": "project/docs/governance/decision-log.md",
    "recordIdentity": "| Date | Decision | Scope | Source | Follow-up |",
    "anchor": "|---|---|---|---|---|",
    "expectedOldValue": "|---|---|---|---|---|",
    "newValue": "\n| 2026-11-11 | <!-- GOV-COORD-AUTHORITY kind=SEMANTIC_AUTHORITY recordId=CLIENT-STATEMENT-READY-CLR08-SA01 --> **CL-R08 - SUPPLIED OWNER REMOVAL DECISION:** Remove ONLY the automatic ready-email trigger after case-level ClientStatement creation. | Preserve statement generation, period locking, calculations, transactional audit, existing permissions and accepted client-level monthly PDF/H6 delivery. Preserve shared STATEMENT_READY template, render/token contract, delivery adapters and ledger. No replacement automatic message or portal visibility is authorized. | Direct owner decision and bounded implementation GO in this CODEX_LOCAL task; transcript SHA256 cd98271a9730a26725691914669b4e06ea853f45bf024da015ada81df4b2d8f0. Mechanical transcription of supplied authority, not agent ratification or a machine grant. | Reconcile Charter section 23.10 / CAD POL-1 only by a bounded reference to this decision and the existing CAD owner-ratified monthly-delivery scope; no historical acceptance reopening or wider disclosure authority. Authorize focused tests, PR, required CI, exact-head merge and main verification; no live operation. Fresh narrow writer coordination is required, prior closed turns are not reused, and O-5/F04_RACE WIP and physical residues remain preserved. |",
    "evidenceSha": "aef31f2425a4ea3ab93acef9884f0cf4678c22f0",
    "expectedResultSha256": "d18de174ff955dca68ba08b73801976a78b94f62a5e79c166d82ae5dd327d17a"
  },
  "declaredTargetAllowlist": [
    "project/docs/governance/decision-log.md"
  ]
}
```
<!-- GOV_COORD_REQUEST_JSON_END -->
