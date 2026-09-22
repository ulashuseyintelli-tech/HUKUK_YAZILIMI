# OFFICE #2737 S2 — semantic authority record request

Owner-authorized decision recording only. This request does not authorize its own execution or ci.yml writes.

<!-- GOV_COORD_REQUEST_JSON_BEGIN -->
```json
{
  "schemaVersion": 1,
  "requestId": "GOV-REQ-20260922-OFFICE-2737-S2-SA",
  "requestFingerprint": "e706a25aa1f988184b52a969dfdeee4897f41645b47e5157912b29671723d5e9",
  "requestedBy": "CODEX_LOCAL",
  "createdAt": "2026-09-22T15:01:34Z",
  "baseMainSha": "d294a42d53d052f55159d206b38feb6a361a8f5e",
  "semanticAuthorityRef": {
    "kind": "SEMANTIC_AUTHORITY",
    "path": "project/docs/governance/decision-log.md",
    "recordId": "GOV-COORD-V2-T1-RATIFICATION",
    "evidenceSha": "d294a42d53d052f55159d206b38feb6a361a8f5e"
  },
  "executionGrantRef": {
    "kind": "EXECUTION_GRANT",
    "path": "project/docs/governance/coordination-execution-grants/GOV-COORD-V1-CODEX-LOCAL.md",
    "recordId": "GOV-COORD-V1-CODEX-LOCAL",
    "evidenceSha": "d294a42d53d052f55159d206b38feb6a361a8f5e"
  },
  "operation": {
    "type": "EXACT_APPEND_AT_DECLARED_ANCHOR",
    "changeClass": "LEVEL_2_MECHANICAL",
    "targetFile": "project/docs/governance/decision-log.md",
    "recordIdentity": "| Date | Decision | Scope | Source | Follow-up |",
    "anchor": "|---|---|---|---|---|",
    "expectedOldValue": "|---|---|---|---|---|",
    "newValue": "\n| 2026-09-22 | <!-- GOV-COORD-AUTHORITY kind=SEMANTIC_AUTHORITY recordId=OFFICE-2737-S2-SA01 --> **OFFICE-2737-S2-SA01 — TASK-BOUND OWNER DECISION RECORD**: Owner assigned this session CODEX_LOCAL executor for OFFICE #2737 S2, with conditional IF GO-COMPLETE. Complete the merged S1b manifest consolidation through the existing request -> grant -> execution -> result chain. Only implementation target: M `.github/workflows/ci.yml`; remove the eight redundant direct Jest steps after verifying every affected file is selected from the manifests and DB prerequisites remain enforced. S1b PR #2737 squash `06647f1f7ddd4b987c275bb431bab50b68667721` is retained. | Exact ci.yml base SHA256 `382ec45edbb2b570f2e12ed5c1c7224ae624bcb4fe80ae453e1d1d3b7deda965`; target SHA256 `e248bf0220ee5ca46255b99e7c072700616e55943e61a31dbc2a70e75c6922ec`. No lost/unexpected selected files; four existing open specs stay outside scope; existing unrelated duplicate stays unchanged. No guard, policy, application, DB, runtime, migration or production change. C1-C4 and owner decisions O-1/O-2/O-3/O-7 excluded. P1/A3 and AUTH-01 closures preserved. | Owner message in CODEX_LOCAL session: CODEX_LOCAL — OFFICE #2737 S2 YURUTUCU ATAMASI, 2026-09-22. Current source base `d294a42d53d052f55159d206b38feb6a361a8f5e`; preceding CLIENT #2750 delivery preserved. This is a record of that explicit decision, not agent self-authorisation. | Separate exact task-bound execution grant is mandatory before ci.yml execution; this SA alone is not a machine grant. Each request/execution/result PR uses task-bound conditional merge authority only after required CI, exact head, mergeability and no writer conflict; main CI must be idle before merge. CLIENT retains its files until sequential ownership release. Post-merge CI/CodeQL and safe main sync required; no historical test reruns without reason. |",
    "evidenceSha": "d294a42d53d052f55159d206b38feb6a361a8f5e",
    "expectedResultSha256": "c2ff4d7e788cea4146c75830b55a572037d4ab13d7518e7d01b0c86d6d519f22"
  },
  "declaredTargetAllowlist": [
    "project/docs/governance/decision-log.md"
  ]
}
```
<!-- GOV_COORD_REQUEST_JSON_END -->
