# OFFICE-CI-REAL — GHCR owner amendment request

Request only; decision-log execution waits for a new, narrow CLIENT writer handoff.

<!-- GOV_COORD_REQUEST_JSON_BEGIN -->
```json
{
  "schemaVersion": 1,
  "requestId": "GOV-REQ-20260925-OFFICE-CI-REAL-GHCR-SA",
  "requestFingerprint": "fe9d9698293a723ca56333cffc5bc89bb140bacce084deeab779380cbeb4d7a2",
  "requestedBy": "CODEX_LOCAL",
  "createdAt": "2026-09-25T10:14:03Z",
  "baseMainSha": "14ab4ee101c5460ddac2a01935d3b6ee937a59dd",
  "semanticAuthorityRef": {
    "kind": "SEMANTIC_AUTHORITY",
    "path": "project/docs/governance/decision-log.md",
    "recordId": "GOV-COORD-V2-T1-RATIFICATION",
    "evidenceSha": "14ab4ee101c5460ddac2a01935d3b6ee937a59dd"
  },
  "executionGrantRef": {
    "kind": "EXECUTION_GRANT",
    "path": "project/docs/governance/coordination-execution-grants/GOV-COORD-V1-CODEX-LOCAL.md",
    "recordId": "GOV-COORD-V1-CODEX-LOCAL",
    "evidenceSha": "14ab4ee101c5460ddac2a01935d3b6ee937a59dd"
  },
  "operation": {
    "type": "EXACT_APPEND_AT_DECLARED_ANCHOR",
    "changeClass": "LEVEL_2_MECHANICAL",
    "targetFile": "project/docs/governance/decision-log.md",
    "recordIdentity": "| Date | Decision | Scope | Source | Follow-up |",
    "anchor": "|---|---|---|---|---|",
    "expectedOldValue": "|---|---|---|---|---|",
    "newValue": "\n| 2026-09-25 | <!-- GOV-COORD-AUTHORITY kind=SEMANTIC_AUTHORITY recordId=OFFICE-CI-REAL-SA02 --> **OFFICE-CI-REAL-SA02 — OWNER GHCR SOURCE AMENDMENT**: Owner explicitly approved transferring the previously verified MinIO image, without rebuild, to project-controlled GHCR after hosted Docker Hub pull was denied. This narrowly supersedes SA01's prohibition on uploading to another registry for this MinIO copy only; all remaining SA01 scope and acceptance constraints remain. Task ownership remains CODEX_LOCAL and the OFFICE-CI-REAL objective is unchanged. | Verify source identity, platform, config and layers; publish the existing image only to ghcr.io/ulashuseyintelli-tech/hukuk-yazilimi-ci-minio; pin the independently verified target digest. CI receives package read only, never persistent package write. Update the existing implementation through fresh exact content bindings; preserve the previous request/grant/candidate and Windows real-render evidence. | Owner source decision and device-authorization completion in this CODEX_LOCAL task, 2026-09-25. This is a mechanical record of supplied owner authority, not agent self-authorisation. Source local pin sha256:14cea493d9a34af32f524e538b8346cf79f3321eff8e708c1e2960462bd8936e; verified linux/amd64 target sha256:a1a8bd4ac40ad7881a245bab97323e18f971e4d4cba2c2007ec1bedd21cbaba2. | No image rebuild, live-container commit/export, live data/volumes/config transfer, random mirror/latest, guard bypass or protection weakening. CLIENT retains decision-log writer ownership except a separately confirmed single amendment execution turn. New exact machine binding required; old EG01 hashes cannot authorize changed bytes. Seven MinIO assertions and real Windows render must PASS on hosted CI; exact-head required checks, merge, main sync and post-merge CI/CodeQL remain mandatory. No OFFICE final or H1-H8 acceptance. |",
    "evidenceSha": "14ab4ee101c5460ddac2a01935d3b6ee937a59dd",
    "expectedResultSha256": "5d7f36b311761f71341eb00dc7be13d8e73e28722c4c5269dc8a4de74b0fa11c"
  },
  "declaredTargetAllowlist": [
    "project/docs/governance/decision-log.md"
  ]
}
```
<!-- GOV_COORD_REQUEST_JSON_END -->
