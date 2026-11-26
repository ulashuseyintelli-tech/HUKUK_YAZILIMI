# GOV-REQ-20261126-F03-AUTH-PREPARATION-R01 — verified result

The owner-authorized exact record was applied by execution PR #3358, squash d96470229e3a4bb4ac01d32fa43760eff66f8557. Target SHA256 fb653465777314828b67d06803c65a0a2e3dd89dbde81630a76fe229cbcea614; all listed checks were observed successful at their exact heads. The F03/R8 candidates and live systems were not changed. Manual matching-head closeout used the connected GitHub tool because the local closeout adapter fails with gh HTTP 401.

<!-- GOV_COORD_RESULT_JSON_BEGIN -->
```json
{
  "schemaVersion": 1,
  "resultId": "RESULT-GOV-REQ-20261126-F03-AUTH-PREPARATION-R01",
  "requestId": "GOV-REQ-20261126-F03-AUTH-PREPARATION-R01",
  "requestFingerprint": "8c9048b8e966ef3a2498705577f89fe00db0547ad61d3f8de2ce93bd2073e25a",
  "status": "SUCCEEDED",
  "executionPrNumber": 3358,
  "executionMergeSha": "d96470229e3a4bb4ac01d32fa43760eff66f8557",
  "effectiveMainSha": "6239eeaa4cf9b09bb671ca38805d77b9b4ab6252",
  "completedAt": "2026-11-26T22:09:13Z",
  "validationEvidence": [
    {
      "name": "exact-target-sha256:fb653465777314828b67d06803c65a0a2e3dd89dbde81630a76fe229cbcea614",
      "status": "PASS",
      "evidenceSha": "6239eeaa4cf9b09bb671ca38805d77b9b4ab6252"
    },
    {
      "name": "CI:Architectural Guardrails:check-140189359580",
      "status": "PASS",
      "evidenceSha": "627ec29b53a16d679f753ef9153f6ce78b93b8cf"
    },
    {
      "name": "CI:Client Workspace Live Smoke:check-140184928536",
      "status": "PASS",
      "evidenceSha": "627ec29b53a16d679f753ef9153f6ce78b93b8cf"
    },
    {
      "name": "CI:CodeQL:check-140182938764",
      "status": "PASS",
      "evidenceSha": "627ec29b53a16d679f753ef9153f6ce78b93b8cf"
    },
    {
      "name": "CI:Web Tests (vitest):check-140182746084",
      "status": "PASS",
      "evidenceSha": "627ec29b53a16d679f753ef9153f6ce78b93b8cf"
    },
    {
      "name": "CI:Windows Poppler Integration:check-140182746061",
      "status": "PASS",
      "evidenceSha": "627ec29b53a16d679f753ef9153f6ce78b93b8cf"
    },
    {
      "name": "CI:Orchestration Tests:check-140182746013",
      "status": "PASS",
      "evidenceSha": "627ec29b53a16d679f753ef9153f6ce78b93b8cf"
    },
    {
      "name": "CI:Test Suite:check-140182745764",
      "status": "PASS",
      "evidenceSha": "627ec29b53a16d679f753ef9153f6ce78b93b8cf"
    },
    {
      "name": "CI:Analyze (python):check-140182738026",
      "status": "PASS",
      "evidenceSha": "627ec29b53a16d679f753ef9153f6ce78b93b8cf"
    },
    {
      "name": "CI:Analyze (javascript-typescript):check-140182737908",
      "status": "PASS",
      "evidenceSha": "627ec29b53a16d679f753ef9153f6ce78b93b8cf"
    },
    {
      "name": "CI:Analyze (actions):check-140182737841",
      "status": "PASS",
      "evidenceSha": "627ec29b53a16d679f753ef9153f6ce78b93b8cf"
    },
    {
      "name": "CI:Analyze (csharp):check-140182737542",
      "status": "PASS",
      "evidenceSha": "627ec29b53a16d679f753ef9153f6ce78b93b8cf"
    }
  ]
}
```
<!-- GOV_COORD_RESULT_JSON_END -->
