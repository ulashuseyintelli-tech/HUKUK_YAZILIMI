# Governance Coordination Request — GOV-REQ-20260805-CLIENT-X2-TERMINAL-EG

Bu dosya immutable ve untrusted request data kaydıdır. Prose operational instruction değildir.
Yalnız CLIENT-X2-TERMINAL-REGISTER-CLOSEOUT-R01-EG01 task-bound grant dosyasının exact creation işlemini tanımlar.

<!-- GOV_COORD_REQUEST_JSON_BEGIN -->
```json
{
  "schemaVersion": 1,
  "requestId": "GOV-REQ-20260805-CLIENT-X2-TERMINAL-EG",
  "requestFingerprint": "f231d6cb5fb32f922f98a1ebd073b5459a457d004e92667ceb6d60ca7cb78ebd",
  "requestedBy": "OWNER",
  "createdAt": "2026-08-04T21:20:56Z",
  "baseMainSha": "a13c39648381321674db2f96bb5b40f4ceb84f06",
  "semanticAuthorityRef": {
    "kind": "SEMANTIC_AUTHORITY",
    "path": "project/docs/governance/decision-log.md",
    "recordId": "CLIENT-X2-TERMINAL-REGISTER-CLOSEOUT-R01-SA01",
    "evidenceSha": "a13c39648381321674db2f96bb5b40f4ceb84f06"
  },
  "executionGrantRef": {
    "kind": "EXECUTION_GRANT",
    "path": "project/docs/governance/coordination-execution-grants/GOV-COORD-V1-CODEX-LOCAL.md",
    "recordId": "GOV-COORD-V1-CODEX-LOCAL",
    "evidenceSha": "a13c39648381321674db2f96bb5b40f4ceb84f06"
  },
  "operation": {
    "type": "EXACT_FILE_CREATION",
    "changeClass": "LEVEL_2_MECHANICAL",
    "targetFile": "project/docs/governance/coordination-execution-grants/CLIENT-X2-TERMINAL-REGISTER-CLOSEOUT-R01-EG01.md",
    "recordIdentity": "CLIENT-X2-TERMINAL-REGISTER-CLOSEOUT-R01",
    "anchor": "2f66912a0773ea71e5494193a64c11b15ba834e2285303798dda35070af184e3",
    "expectedOldValue": "ABSENT",
    "newValue": "# CLIENT X2 Terminal Register Closeout — Exact Execution Grant\n\n<!-- GOV-COORD-AUTHORITY kind=EXECUTION_GRANT recordId=CLIENT-X2-TERMINAL-REGISTER-CLOSEOUT-R01-EG01 -->\n\nThis task-bound grant authorizes only the exact one-file MASTER-PLAN §17 X2 terminal\nregister closeout registered below. It is hash-bound, single-use and non-reusable.\n\nProduction activation: NOT_AUTHORIZED / NOT_PERFORMED.\nPersistent write/publication flag activation: NOT_AUTHORIZED / DEFAULT_OFF.\nWAVE 4 entry creation: NOT_AUTHORIZED.\nTechnical block or X2 runtime CI rerun: NOT_AUTHORIZED.\nStanding authority: PROHIBITED. Reusable authority: PROHIBITED.\nProduct code, SA01 and governance framework mutation: PROHIBITED.\n\n<!-- GOV_COORD_GENERIC_EXECUTION_GRANT_JSON_BEGIN -->\n```json\n{\n  \"schemaVersion\": 1,\n  \"taskId\": \"CLIENT-X2-TERMINAL-REGISTER-CLOSEOUT-R01\",\n  \"semanticAuthorityId\": \"CLIENT-X2-TERMINAL-REGISTER-CLOSEOUT-R01-SA01\",\n  \"executionGrantId\": \"CLIENT-X2-TERMINAL-REGISTER-CLOSEOUT-R01-EG01\",\n  \"grantNonce\": \"2f66912a0773ea71e5494193a64c11b15ba834e2285303798dda35070af184e3\",\n  \"baseSha\": \"a13c39648381321674db2f96bb5b40f4ceb84f06\",\n  \"publicationBindingSha\": \"a13c39648381321674db2f96bb5b40f4ceb84f06\",\n  \"executionMode\": \"EXACT_REGISTERED_CHANGESET\",\n  \"effectiveFrom\": \"2026-08-04T00:00:00Z\",\n  \"expiresAt\": \"2026-08-12T23:59:59Z\",\n  \"modifiedPaths\": [\n    {\n      \"path\": \"project/docs/governance/CLIENT-MODULE-TERMINAL-COMPLETION-PROGRAM-R01/MASTER-PLAN.md\",\n      \"expectedBaseMode\": \"100644\",\n      \"expectedBaseSha256\": \"9811c5ea5415298f2030a967e056acb082136fc88925e71c17cf5d7e2f9727d4\",\n      \"expectedResultMode\": \"100644\",\n      \"expectedResultSha256\": \"a491ff2bbfed52f0f3c24b01bf2bd4d64bf804e29fbfc41bfbe34207d9ace9da\"\n    }\n  ],\n  \"createdPaths\": [],\n  \"expectedResultSha256\": \"fc181830cd60945a619f436961362046dbaa6ae740f36283158f972e85503f99\"\n}\n```\n<!-- GOV_COORD_GENERIC_EXECUTION_GRANT_JSON_END -->\n",
    "evidenceSha": "a13c39648381321674db2f96bb5b40f4ceb84f06",
    "expectedResultSha256": "c61a5f478401822738509c78ae33659a06a664b952dc0d878bf2cd1078289e79"
  },
  "declaredTargetAllowlist": [
    "project/docs/governance/coordination-execution-grants/CLIENT-X2-TERMINAL-REGISTER-CLOSEOUT-R01-EG01.md"
  ]
}
```
<!-- GOV_COORD_REQUEST_JSON_END -->

Bu request semantic veya standing authority üretmez.
