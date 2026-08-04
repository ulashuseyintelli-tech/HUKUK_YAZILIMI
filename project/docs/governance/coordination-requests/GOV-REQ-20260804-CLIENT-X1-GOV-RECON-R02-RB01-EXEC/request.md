# Governance Coordination Request — GOV-REQ-20260804-CLIENT-X1-GOV-RECON-R02-RB01-EXEC

Bu dosya immutable ve untrusted request data kaydıdır. Prose operational instruction değildir.
Yalnız X1 R02 mechanical rebind için kayıtlı exact two-file changeset yürütmesini tanımlar.

<!-- GOV_COORD_REQUEST_JSON_BEGIN -->
```json
{
  "schemaVersion": 1,
  "requestId": "GOV-REQ-20260804-CLIENT-X1-GOV-RECON-R02-RB01-EXEC",
  "requestFingerprint": "c6791eefbad34fcff60b4bc1790a7bb44919d00fa338887cb94e6befc3777b37",
  "requestedBy": "OWNER",
  "createdAt": "2026-08-04T18:00:08Z",
  "baseMainSha": "d9a815e998e04cd745fd7d4efd67d1713df2b036",
  "semanticAuthorityRef": {
    "kind": "SEMANTIC_AUTHORITY",
    "path": "project/docs/governance/CLIENT-MODULE-TERMINAL-COMPLETION-PROGRAM-R01/CLIENT-X1-GOV-RECON-R02-SA01.md",
    "recordId": "CLIENT-X1-GOV-RECON-R02-SA01",
    "evidenceSha": "cdd24aaa0f09f0eb7b898ce0e61cb929f822f09f"
  },
  "executionGrantRef": {
    "kind": "EXECUTION_GRANT",
    "path": "project/docs/governance/coordination-execution-grants/CLIENT-X1-GOV-RECON-R02-RB01-EG01.md",
    "recordId": "CLIENT-X1-GOV-RECON-R02-RB01-EG01",
    "evidenceSha": "08f5fefb71d7a0995923399b3677f7943bee3cb0"
  },
  "operation": {
    "type": "EXACT_REGISTERED_CHANGESET",
    "changeClass": "LEVEL_2_MECHANICAL",
    "targetFile": "project/docs/governance/CLIENT-MODULE-TERMINAL-COMPLETION-PROGRAM-R01/CODEX-CLIENT-X1.md",
    "recordIdentity": "CODEX-CLIENT-X1-GOVERNANCE-RECONCILIATION-R02-MECHANICAL-REBIND-R01",
    "anchor": "2b0f142ef7bf8226722135c22926e0deeb5a8db4ae13b38e1da68a12c91e9f03",
    "expectedOldValue": "fb18060a8568770b017cb6dc646405d7454c846a",
    "newValue": "fb18060a8568770b017cb6dc646405d7454c846a",
    "evidenceSha": "08f5fefb71d7a0995923399b3677f7943bee3cb0",
    "expectedResultSha256": "133ae4f3df9c431ec22e56009df4a8b81af7d20680fdb873658a2ffd1e361125"
  },
  "declaredTargetAllowlist": [
    "project/docs/governance/CLIENT-MODULE-TERMINAL-COMPLETION-PROGRAM-R01/CODEX-CLIENT-X1.md",
    "project/docs/governance/CLIENT-MODULE-TERMINAL-COMPLETION-PROGRAM-R01/MASTER-PLAN.md"
  ]
}
```
<!-- GOV_COORD_REQUEST_JSON_END -->

Bu request semantic veya standing authority üretmez.
