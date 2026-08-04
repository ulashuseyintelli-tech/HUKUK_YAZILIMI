# CLIENT-X1 Governance Reconciliation R02 — Exact Execution Grant

<!-- GOV-COORD-AUTHORITY kind=EXECUTION_GRANT recordId=CLIENT-X1-GOV-RECON-R02-EG01 -->

This task-bound grant authorizes only the exact two-file governance reconciliation
registered below. It is hash-bound, single-use and non-reusable.

Production activation: NOT_AUTHORIZED.
Persistent flag activation: OWNER-GATED / NOT PERFORMED.
Standing authority: PROHIBITED. Reusable authority: PROHIBITED.

<!-- GOV_COORD_GENERIC_EXECUTION_GRANT_JSON_BEGIN -->
```json
{
  "schemaVersion": 1,
  "taskId": "CODEX-CLIENT-X1-GOVERNANCE-RECONCILIATION-R02",
  "semanticAuthorityId": "CLIENT-X1-GOV-RECON-R02-SA01",
  "executionGrantId": "CLIENT-X1-GOV-RECON-R02-EG01",
  "grantNonce": "0f30b57abd9157f60be1171210b5132b7a11d3fcb97186b648683fb8197f4167",
  "baseSha": "c0c2107ee198af82525a3b1243d051af36aeb303",
  "publicationBindingSha": "c0c2107ee198af82525a3b1243d051af36aeb303",
  "executionMode": "EXACT_REGISTERED_CHANGESET",
  "effectiveFrom": "2026-08-03T00:00:00Z",
  "expiresAt": "2026-08-10T23:59:59Z",
  "modifiedPaths": [
    {
      "path": "project/docs/governance/CLIENT-MODULE-TERMINAL-COMPLETION-PROGRAM-R01/CODEX-CLIENT-X1.md",
      "expectedBaseMode": "100644",
      "expectedBaseSha256": "1bd19068237c241600542e9bdcb409b1d3a28519beff0484018a9ee7a3050b30",
      "expectedResultMode": "100644",
      "expectedResultSha256": "1849e6426fd5f3d433e911391f17ed23671f32ec5cde7b792c3aa1053b08b96a"
    },
    {
      "path": "project/docs/governance/CLIENT-MODULE-TERMINAL-COMPLETION-PROGRAM-R01/MASTER-PLAN.md",
      "expectedBaseMode": "100644",
      "expectedBaseSha256": "0eac3749bf84dd443d6f50fe35ce2317d43c1df5f5114a0975270822bfe7ad18",
      "expectedResultMode": "100644",
      "expectedResultSha256": "776a842dbacf3db04ef11084a01fac71383a44a9489218e5007a1b75c83d2e14"
    }
  ],
  "createdPaths": [],
  "expectedResultSha256": "20fe94a0ebae28086cfa217c8c91d0d2b6d02604a37b618cab15b33b4f9bde30"
}
```
<!-- GOV_COORD_GENERIC_EXECUTION_GRANT_JSON_END -->
