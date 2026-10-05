# OFFICE CI Test Suite timeout — immutable execution result

Evidence only; no semantic or execution authority.

<!-- GOV_COORD_RESULT_JSON_BEGIN -->
```json
{
  "schemaVersion": 1,
  "resultId": "RESULT-GOV-REQ-20261004-OFFICE-CI-TIMEOUT30-EG-CREATE",
  "requestId": "GOV-REQ-20261004-OFFICE-CI-TIMEOUT30-EG-CREATE",
  "requestFingerprint": "8c7866cff43fdb834c478c2b00a0abacdedbc3e866206acf9b2f952b8a67add7",
  "status": "SUCCEEDED",
  "executionPrNumber": 2937,
  "executionMergeSha": "fda7ea15eb4a9bf704881dbc35b62654067b07d5",
  "effectiveMainSha": "fda7ea15eb4a9bf704881dbc35b62654067b07d5",
  "completedAt": "2026-10-05T15:53:41Z",
  "validationEvidence": [
    {
      "name": "execution-pr:2937:merged",
      "status": "PASS",
      "evidenceSha": "fda7ea15eb4a9bf704881dbc35b62654067b07d5"
    },
    {
      "name": "execution-merge-in-main",
      "status": "PASS",
      "evidenceSha": "fda7ea15eb4a9bf704881dbc35b62654067b07d5"
    },
    {
      "name": "exact-operation-and-scope-validated",
      "status": "PASS",
      "evidenceSha": "a5581c170b5bf7801070028ca1bf624e8d62ec4f"
    },
    {
      "name": "ci:Test Suite",
      "status": "PASS",
      "evidenceSha": "a5581c170b5bf7801070028ca1bf624e8d62ec4f"
    },
    {
      "name": "ci:Analyze (actions)",
      "status": "PASS",
      "evidenceSha": "a5581c170b5bf7801070028ca1bf624e8d62ec4f"
    },
    {
      "name": "ci:Orchestration Tests",
      "status": "PASS",
      "evidenceSha": "a5581c170b5bf7801070028ca1bf624e8d62ec4f"
    },
    {
      "name": "ci:Analyze (javascript-typescript)",
      "status": "PASS",
      "evidenceSha": "a5581c170b5bf7801070028ca1bf624e8d62ec4f"
    },
    {
      "name": "ci:Analyze (python)",
      "status": "PASS",
      "evidenceSha": "a5581c170b5bf7801070028ca1bf624e8d62ec4f"
    },
    {
      "name": "ci:Windows Poppler Integration",
      "status": "PASS",
      "evidenceSha": "a5581c170b5bf7801070028ca1bf624e8d62ec4f"
    },
    {
      "name": "ci:Web Tests (vitest)",
      "status": "PASS",
      "evidenceSha": "a5581c170b5bf7801070028ca1bf624e8d62ec4f"
    },
    {
      "name": "ci:Architectural Guardrails",
      "status": "PASS",
      "evidenceSha": "a5581c170b5bf7801070028ca1bf624e8d62ec4f"
    },
    {
      "name": "ci:Client Workspace Live Smoke",
      "status": "PASS",
      "evidenceSha": "a5581c170b5bf7801070028ca1bf624e8d62ec4f"
    },
    {
      "name": "ci:CodeQL",
      "status": "PASS",
      "evidenceSha": "a5581c170b5bf7801070028ca1bf624e8d62ec4f"
    },
    {
      "name": "main-ci:GOV-COORD-V2 Orchestration Tests:run-37333534344:attempt-1",
      "status": "PASS",
      "evidenceSha": "fda7ea15eb4a9bf704881dbc35b62654067b07d5"
    },
    {
      "name": "main-ci:Push on main:run-37333534722:attempt-1",
      "status": "PASS",
      "evidenceSha": "fda7ea15eb4a9bf704881dbc35b62654067b07d5"
    },
    {
      "name": "main-ci:CI:run-37333534348:attempt-1",
      "status": "PASS",
      "evidenceSha": "fda7ea15eb4a9bf704881dbc35b62654067b07d5"
    }
  ]
}
```
<!-- GOV_COORD_RESULT_JSON_END -->

Post-merge main checks at `fda7ea15eb4a9bf704881dbc35b62654067b07d5`:

- [GOV-COORD-V2 Orchestration Tests — SUCCESS, attempt 1](https://github.com/ulashuseyintelli-tech/HUKUK_YAZILIMI/actions/runs/37333534344)
- [Push on main — SUCCESS, attempt 1](https://github.com/ulashuseyintelli-tech/HUKUK_YAZILIMI/actions/runs/37333534722)
- [CI — SUCCESS, attempt 1](https://github.com/ulashuseyintelli-tech/HUKUK_YAZILIMI/actions/runs/37333534348)
