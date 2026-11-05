# Office 2b / KI-048 — supplied owner-decision transcription request

Request-only; fresh writer coordination is pending. No Decision Log target or manifest write, product acceptance or live operation is claimed.

<!-- GOV_COORD_REQUEST_JSON_BEGIN -->
```json
{
  "schemaVersion": 1,
  "requestId": "GOV-REQ-20261105-OFFICE-TASK-CANCEL-2B-SA01",
  "requestFingerprint": "a23fd89181377c5f603e57800b2afff4da71ef2679ae3d8c1ed88793310af7b8",
  "requestedBy": "CODEX_LOCAL",
  "createdAt": "2026-11-05T20:15:22Z",
  "baseMainSha": "9122f19b379adeab13c14fd0343446e2a87b7769",
  "semanticAuthorityRef": {
    "kind": "SEMANTIC_AUTHORITY",
    "path": "project/docs/governance/decision-log.md",
    "recordId": "GOV-COORD-V2-T1-RATIFICATION",
    "evidenceSha": "9122f19b379adeab13c14fd0343446e2a87b7769"
  },
  "executionGrantRef": {
    "kind": "EXECUTION_GRANT",
    "path": "project/docs/governance/coordination-execution-grants/GOV-COORD-V1-CODEX-LOCAL.md",
    "recordId": "GOV-COORD-V1-CODEX-LOCAL",
    "evidenceSha": "9122f19b379adeab13c14fd0343446e2a87b7769"
  },
  "operation": {
    "type": "EXACT_APPEND_AT_DECLARED_ANCHOR",
    "changeClass": "LEVEL_2_MECHANICAL",
    "targetFile": "project/docs/governance/decision-log.md",
    "recordIdentity": "| Date | Decision | Scope | Source | Follow-up |",
    "anchor": "|---|---|---|---|---|",
    "expectedOldValue": "|---|---|---|---|---|",
    "newValue": "\n| 2026-11-05 | <!-- GOV-COORD-AUTHORITY kind=SEMANTIC_AUTHORITY recordId=OFFICE-TASK-CANCEL-2B-SA01 --> **OFFICE 2b / KI-048 — OWNER APPROVED REASONED TASK CANCELLATION WITHOUT PHYSICAL DELETION:** Manual cancellation requires an active write-authorized task creator or same-tenant ADMIN, within the currently applied task object scope; VIEWER, assignment, rank and ReportingLine alone grant no cancellation. Preserve the task and its history; record actor, prior/new state and reason durably. This narrowly supersedes earlier preservation of the unrestricted task cancellation/deletion policy, not other action-specific rights. | Only task cancellation/history API and existing task-list UI, bypass guards for legacy DELETE and generic create/update CANCELLED transitions, focused tests and one new core-lifecycle HTTP/disposable-DB spec. Add only the cancellation-history schema/migration needed for this record; apply it only to an owned disposable test DB. Domain reason and safe audit are atomic; no raw reason in AuditLog. Preserve completion/reopening, trusted Client/expense system paths, current task-view scope flag/default and DENY precedence; do not enable flags or claim all OFP-03a history is complete. | Direct owner approved decision-package 1–6, read the bounded 2b preparation, and explicitly authorized additive schema/migration, focused tests, PR, required CI, exact-head merge and main verification. OWNER-AUTHORITY.txt SHA256 e03035a1f331591a64500b82c5aa509af9e3a57d8b3bd5bceebb0f9d1d6f9a81; approved package R01 SHA256 fa117c3df2711f8e7881d4f937038e20d6bdd40306519032c74a9bc42b60899c. Supplied-authority transcription only, not agent ratification or reusable authority. | Coordinate fresh single-row Decision Log and new-spec core-lifecycle writer turns; no reuse of closed turns. Preserve completed intake, 1b, AK-1c, O-5, all F04_RACE WIP and old cleanup residues. No backfill, data purge, general role/assignment redesign, live migration/deploy, production DB write or general Office/Client seal. |",
    "evidenceSha": "9122f19b379adeab13c14fd0343446e2a87b7769",
    "expectedResultSha256": "27e3117191aea91263ed6a0b38a5b0738aac5a51f3a08b3e06646096719b3c0b"
  },
  "declaredTargetAllowlist": [
    "project/docs/governance/decision-log.md"
  ]
}
```
<!-- GOV_COORD_REQUEST_JSON_END -->
