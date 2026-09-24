# OFFICE real CI integrations — owner decision recording request

Request only; no implementation authority is created by this request.

<!-- GOV_COORD_REQUEST_JSON_BEGIN -->
```json
{
  "schemaVersion": 1,
  "requestId": "GOV-REQ-20260925-OFFICE-CI-REAL-SA",
  "requestFingerprint": "13aee3e0b2cf767b46fa1598e49969c971ca37f7bcdfa3c8b5c198990d8f3d58",
  "requestedBy": "CODEX_LOCAL",
  "createdAt": "2026-09-24T22:35:27Z",
  "baseMainSha": "cba6425310665dbf45b8c85122511ec89901e035",
  "semanticAuthorityRef": {
    "kind": "SEMANTIC_AUTHORITY",
    "path": "project/docs/governance/decision-log.md",
    "recordId": "GOV-COORD-V2-T1-RATIFICATION",
    "evidenceSha": "cba6425310665dbf45b8c85122511ec89901e035"
  },
  "executionGrantRef": {
    "kind": "EXECUTION_GRANT",
    "path": "project/docs/governance/coordination-execution-grants/GOV-COORD-V1-CODEX-LOCAL.md",
    "recordId": "GOV-COORD-V1-CODEX-LOCAL",
    "evidenceSha": "cba6425310665dbf45b8c85122511ec89901e035"
  },
  "operation": {
    "type": "EXACT_APPEND_AT_DECLARED_ANCHOR",
    "changeClass": "LEVEL_2_MECHANICAL",
    "targetFile": "project/docs/governance/decision-log.md",
    "recordIdentity": "| Date | Decision | Scope | Source | Follow-up |",
    "anchor": "|---|---|---|---|---|",
    "expectedOldValue": "|---|---|---|---|---|",
    "newValue": "\n| 2026-09-25 | <!-- GOV-COORD-AUTHORITY kind=SEMANTIC_AUTHORITY recordId=OFFICE-CI-REAL-SA01 --> **OFFICE-CI-REAL-SA01 — TASK-BOUND OWNER DECISION RECORD**: Owner assigned CODEX_LOCAL to complete real MinIO and Windows Poppler CI integration through the existing request -> grant -> execution -> result chain, with IF GO-COMPLETE conditional merge and post-merge verification. Preserve #2786 squash `cba6425310665dbf45b8c85122511ec89901e035` and all four manifest-selected specs. | Narrow workflow changes, necessary CI evidence checker/runner support and focused validation, plus the existing `office-ci-coverage-r01/OFFICE-CI-COVERAGE-R01.md` scope record. Linux official manifest runner must execute all seven object-store tests against isolated digest-pinned MinIO; Windows must execute the existing real renderer against the locked pdf-poppler bundled binary. Missing dependencies, selection or skipped real tests must fail. Both integration failures must block PR merge; no continue-on-error or weakened branch protection, no timeout increase. | Owner message in CODEX_LOCAL session, 2026-09-25: OWNER GO — HUKUK_YAZILIMI / CODEX_LOCAL, CI DA GERCEK MINIO + WINDOWS POPPLER ENTEGRASYONUNU TAMAMLA; follow-up explicitly distinguishes local registry errors from hosted CI reachability. This records the supplied owner decision and is not agent self-authorisation. Base `cba6425310665dbf45b8c85122511ec89901e035`. | Separate exact task-bound machine grant mandatory before implementation. Verify required checks at exact head and main idle before each merge; synchronize main and verify post-merge CI/CodeQL and real integration assertions. No renderer rewrite, Linux renderer port, broad dependency update, live operation, migration, upload to another registry, random mirror, latest tag, CLIENT live/DNS/H5 change or cleanup of preserved remnants. Existing local diagnostics retained; actual hosted results required. This is not OFFICE final or H1-H8 acceptance. |",
    "evidenceSha": "cba6425310665dbf45b8c85122511ec89901e035",
    "expectedResultSha256": "c373aebe55994399d050844213f73c9a0220810cd965ed8c0a2d6a330b6ccbff"
  },
  "declaredTargetAllowlist": [
    "project/docs/governance/decision-log.md"
  ]
}
```
<!-- GOV_COORD_REQUEST_JSON_END -->
