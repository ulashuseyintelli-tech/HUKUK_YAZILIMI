# OFFICE CI Test Suite timeout — immutable execution result

Evidence only; no semantic or execution authority.

<!-- GOV_COORD_RESULT_JSON_BEGIN -->
```json
{
  "schemaVersion": 1,
  "resultId": "RESULT-GOV-REQ-20261004-OFFICE-CI-TIMEOUT30-SA",
  "requestId": "GOV-REQ-20261004-OFFICE-CI-TIMEOUT30-SA",
  "requestFingerprint": "61c7113e03010a61b00842e76e5afcb947e21dba052310d281597ad78379a9ed",
  "status": "SUCCEEDED",
  "executionPrNumber": 2919,
  "executionMergeSha": "3b3cb614db9fc186b835462add0836b7da303536",
  "effectiveMainSha": "6b187ef91102f4e4baf3222bf37974dc98d3c161",
  "completedAt": "2026-10-05T13:23:36Z",
  "validationEvidence": [
    {
      "name": "execution-pr:2919:merged",
      "status": "PASS",
      "evidenceSha": "3b3cb614db9fc186b835462add0836b7da303536"
    },
    {
      "name": "execution-merge-in-main",
      "status": "PASS",
      "evidenceSha": "6b187ef91102f4e4baf3222bf37974dc98d3c161"
    },
    {
      "name": "exact-operation-and-scope-validated",
      "status": "PASS",
      "evidenceSha": "d9e9ec31cc56e0581bd6ddb0117f8eb3ca7fea42"
    },
    {
      "name": "ci:Test Suite",
      "status": "PASS",
      "evidenceSha": "d9e9ec31cc56e0581bd6ddb0117f8eb3ca7fea42"
    },
    {
      "name": "ci:Analyze (actions)",
      "status": "PASS",
      "evidenceSha": "d9e9ec31cc56e0581bd6ddb0117f8eb3ca7fea42"
    },
    {
      "name": "ci:Orchestration Tests",
      "status": "PASS",
      "evidenceSha": "d9e9ec31cc56e0581bd6ddb0117f8eb3ca7fea42"
    },
    {
      "name": "ci:Analyze (javascript-typescript)",
      "status": "PASS",
      "evidenceSha": "d9e9ec31cc56e0581bd6ddb0117f8eb3ca7fea42"
    },
    {
      "name": "ci:Analyze (python)",
      "status": "PASS",
      "evidenceSha": "d9e9ec31cc56e0581bd6ddb0117f8eb3ca7fea42"
    },
    {
      "name": "ci:Windows Poppler Integration",
      "status": "PASS",
      "evidenceSha": "d9e9ec31cc56e0581bd6ddb0117f8eb3ca7fea42"
    },
    {
      "name": "ci:Web Tests (vitest)",
      "status": "PASS",
      "evidenceSha": "d9e9ec31cc56e0581bd6ddb0117f8eb3ca7fea42"
    },
    {
      "name": "ci:Architectural Guardrails",
      "status": "PASS",
      "evidenceSha": "d9e9ec31cc56e0581bd6ddb0117f8eb3ca7fea42"
    },
    {
      "name": "ci:Client Workspace Live Smoke",
      "status": "PASS",
      "evidenceSha": "d9e9ec31cc56e0581bd6ddb0117f8eb3ca7fea42"
    },
    {
      "name": "ci:CodeQL",
      "status": "PASS",
      "evidenceSha": "d9e9ec31cc56e0581bd6ddb0117f8eb3ca7fea42"
    },
    {
      "name": "main-ci:Push on main:run-37313934145:attempt-1",
      "status": "PASS",
      "evidenceSha": "6b187ef91102f4e4baf3222bf37974dc98d3c161"
    },
    {
      "name": "main-ci:CI:run-37313932958:attempt-1",
      "status": "PASS",
      "evidenceSha": "6b187ef91102f4e4baf3222bf37974dc98d3c161"
    },
    {
      "name": "main-ci:GOV-COORD-V2 Orchestration Tests:run-37313933006:attempt-1",
      "status": "PASS",
      "evidenceSha": "6b187ef91102f4e4baf3222bf37974dc98d3c161"
    }
  ]
}
```
<!-- GOV_COORD_RESULT_JSON_END -->

Post-merge main checks at `6b187ef91102f4e4baf3222bf37974dc98d3c161`:

- [Push on main — SUCCESS, attempt 1](https://github.com/ulashuseyintelli-tech/HUKUK_YAZILIMI/actions/runs/37313934145)
- [CI — SUCCESS, attempt 1](https://github.com/ulashuseyintelli-tech/HUKUK_YAZILIMI/actions/runs/37313932958)
- [GOV-COORD-V2 Orchestration Tests — SUCCESS, attempt 1](https://github.com/ulashuseyintelli-tech/HUKUK_YAZILIMI/actions/runs/37313933006)
