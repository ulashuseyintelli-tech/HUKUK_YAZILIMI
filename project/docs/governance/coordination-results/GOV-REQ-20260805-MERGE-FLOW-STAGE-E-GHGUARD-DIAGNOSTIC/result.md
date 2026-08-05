# Governance Coordination Result — RESULT-GOV-REQ-20260805-MERGE-FLOW-STAGE-E-GHGUARD-DIAGNOSTIC

Bu dosya immutable execution outcome evidence kaydıdır. Semantic veya execution
authority üretmez.

<!-- GOV_COORD_RESULT_JSON_BEGIN -->
```json
{
  "schemaVersion": 1,
  "resultId": "RESULT-GOV-REQ-20260805-MERGE-FLOW-STAGE-E-GHGUARD-DIAGNOSTIC",
  "requestId": "GOV-REQ-20260805-MERGE-FLOW-STAGE-E-GHGUARD-DIAGNOSTIC",
  "requestFingerprint": "2b01ef3b46efea1138448f9c335f54c9807d06551d2f1586bfdc8ad690eedca8",
  "status": "SUCCEEDED",
  "executionPrNumber": 2233,
  "executionMergeSha": "e78b835b20452c965079aa3efd9aa06b4e1e0e12",
  "effectiveMainSha": "e78b835b20452c965079aa3efd9aa06b4e1e0e12",
  "completedAt": "2026-08-05T00:00:00Z",
  "validationEvidence": [
    {"name": "request-path:project/docs/governance/coordination-requests/GOV-REQ-20260805-MERGE-FLOW-STAGE-E-GHGUARD-DIAGNOSTIC/request.md", "status": "PASS", "evidenceSha": "e78b835b20452c965079aa3efd9aa06b4e1e0e12"},
    {"name": "execution-pr:2233:merged", "status": "PASS", "evidenceSha": "e78b835b20452c965079aa3efd9aa06b4e1e0e12"},
    {"name": "execution-merge-in-main", "status": "PASS", "evidenceSha": "e78b835b20452c965079aa3efd9aa06b4e1e0e12"},
    {"name": "operation-type:EXACT_REGISTERED_CHANGESET", "status": "PASS", "evidenceSha": "e78b835b20452c965079aa3efd9aa06b4e1e0e12"},
    {"name": "changed-path:.github/workflows/ci.yml", "status": "PASS", "evidenceSha": "e78b835b20452c965079aa3efd9aa06b4e1e0e12"},
    {"name": "changed-path:project/scripts/gh-guard-readonly.ps1", "status": "PASS", "evidenceSha": "e78b835b20452c965079aa3efd9aa06b4e1e0e12"},
    {"name": "changed-path:project/scripts/gh-guard-readonly.test.cjs", "status": "PASS", "evidenceSha": "e78b835b20452c965079aa3efd9aa06b4e1e0e12"},
    {"name": "ci-log-observed:node --test scripts/gh-guard-readonly.test.cjs ran, tests 10 pass 10", "status": "PASS", "evidenceSha": "ae0701c37f2c47a9bcd031d7d557f6b14e25b67a"},
    {"name": "ci:9-of-9-success", "status": "PASS", "evidenceSha": "ae0701c37f2c47a9bcd031d7d557f6b14e25b67a"}
  ]
}
```
<!-- GOV_COORD_RESULT_JSON_END -->

Bu result yalnız merged execution ve observed validation evidence kaydıdır.
