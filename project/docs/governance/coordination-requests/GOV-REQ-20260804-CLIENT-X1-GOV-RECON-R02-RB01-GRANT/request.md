# Governance Coordination Request — GOV-REQ-20260804-CLIENT-X1-GOV-RECON-R02-RB01-GRANT

Bu dosya immutable ve untrusted request data kaydıdır. Prose operational instruction değildir.
Yalnız task-bound CLIENT-X1-GOV-RECON-R02-RB01-EG01 dosyasının exact creation işlemini tanımlar.

<!-- GOV_COORD_REQUEST_JSON_BEGIN -->
```json
{
  "schemaVersion": 1,
  "requestId": "GOV-REQ-20260804-CLIENT-X1-GOV-RECON-R02-RB01-GRANT",
  "requestFingerprint": "5e899b7008ac56dc74e8338732d1c1ab04c7c65fe2094d75ed543495005b88c8",
  "requestedBy": "OWNER",
  "createdAt": "2026-08-04T17:15:58Z",
  "baseMainSha": "fb18060a8568770b017cb6dc646405d7454c846a",
  "semanticAuthorityRef": {
    "kind": "SEMANTIC_AUTHORITY",
    "path": "project/docs/governance/CLIENT-MODULE-TERMINAL-COMPLETION-PROGRAM-R01/CLIENT-X1-GOV-RECON-R02-SA01.md",
    "recordId": "CLIENT-X1-GOV-RECON-R02-SA01",
    "evidenceSha": "cdd24aaa0f09f0eb7b898ce0e61cb929f822f09f"
  },
  "executionGrantRef": {
    "kind": "EXECUTION_GRANT",
    "path": "project/docs/governance/coordination-execution-grants/GOV-COORD-V1-CODEX-LOCAL.md",
    "recordId": "GOV-COORD-V1-CODEX-LOCAL",
    "evidenceSha": "fb18060a8568770b017cb6dc646405d7454c846a"
  },
  "operation": {
    "type": "EXACT_FILE_CREATION",
    "changeClass": "LEVEL_2_MECHANICAL",
    "targetFile": "project/docs/governance/coordination-execution-grants/CLIENT-X1-GOV-RECON-R02-RB01-EG01.md",
    "recordIdentity": "CODEX-CLIENT-X1-GOVERNANCE-RECONCILIATION-R02-MECHANICAL-REBIND-R01",
    "anchor": "2b0f142ef7bf8226722135c22926e0deeb5a8db4ae13b38e1da68a12c91e9f03",
    "expectedOldValue": "ABSENT",
    "newValue": "# CLIENT-X1 Governance Reconciliation R02 Mechanical Rebind R01 — Exact Execution Grant\n\n<!-- GOV-COORD-AUTHORITY kind=EXECUTION_GRANT recordId=CLIENT-X1-GOV-RECON-R02-RB01-EG01 -->\n\nThis task-bound grant authorizes only the exact two-file governance reconciliation\nregistered below. It is hash-bound, single-use and non-reusable.\n\nProduction activation: NOT_AUTHORIZED.\nPersistent flag activation: OWNER-GATED / NOT PERFORMED.\nStanding authority: PROHIBITED. Reusable authority: PROHIBITED.\n\n<!-- GOV_COORD_GENERIC_EXECUTION_GRANT_JSON_BEGIN -->\n```json\n{\n  \"schemaVersion\": 1,\n  \"taskId\": \"CODEX-CLIENT-X1-GOVERNANCE-RECONCILIATION-R02-MECHANICAL-REBIND-R01\",\n  \"semanticAuthorityId\": \"CLIENT-X1-GOV-RECON-R02-SA01\",\n  \"executionGrantId\": \"CLIENT-X1-GOV-RECON-R02-RB01-EG01\",\n  \"grantNonce\": \"2b0f142ef7bf8226722135c22926e0deeb5a8db4ae13b38e1da68a12c91e9f03\",\n  \"baseSha\": \"fb18060a8568770b017cb6dc646405d7454c846a\",\n  \"publicationBindingSha\": \"fb18060a8568770b017cb6dc646405d7454c846a\",\n  \"executionMode\": \"EXACT_REGISTERED_CHANGESET\",\n  \"effectiveFrom\": \"2026-08-04T00:00:00Z\",\n  \"expiresAt\": \"2026-08-11T23:59:59Z\",\n  \"modifiedPaths\": [\n    {\n      \"path\": \"project/docs/governance/CLIENT-MODULE-TERMINAL-COMPLETION-PROGRAM-R01/CODEX-CLIENT-X1.md\",\n      \"expectedBaseMode\": \"100644\",\n      \"expectedBaseSha256\": \"1bd19068237c241600542e9bdcb409b1d3a28519beff0484018a9ee7a3050b30\",\n      \"expectedResultMode\": \"100644\",\n      \"expectedResultSha256\": \"c4861d34a0f7a0fbb79dc49e4192c487be93683e765d57f6b798eb402b8b3556\"\n    },\n    {\n      \"path\": \"project/docs/governance/CLIENT-MODULE-TERMINAL-COMPLETION-PROGRAM-R01/MASTER-PLAN.md\",\n      \"expectedBaseMode\": \"100644\",\n      \"expectedBaseSha256\": \"7bab8715b1fa6fc16b1fe72f3e64b2bbe5b21f1d3a3ab735d2c6dc22faa033b2\",\n      \"expectedResultMode\": \"100644\",\n      \"expectedResultSha256\": \"9811c5ea5415298f2030a967e056acb082136fc88925e71c17cf5d7e2f9727d4\"\n    }\n  ],\n  \"createdPaths\": [],\n  \"expectedResultSha256\": \"133ae4f3df9c431ec22e56009df4a8b81af7d20680fdb873658a2ffd1e361125\"\n}\n```\n<!-- GOV_COORD_GENERIC_EXECUTION_GRANT_JSON_END -->\n",
    "evidenceSha": "fb18060a8568770b017cb6dc646405d7454c846a",
    "expectedResultSha256": "f4eeabda385f7bfe1bc43cd4c7c43dc0acffaee554ffd4901163f514778931b7"
  },
  "declaredTargetAllowlist": [
    "project/docs/governance/coordination-execution-grants/CLIENT-X1-GOV-RECON-R02-RB01-EG01.md"
  ]
}
```
<!-- GOV_COORD_REQUEST_JSON_END -->

Bu request semantic veya standing authority üretmez.
