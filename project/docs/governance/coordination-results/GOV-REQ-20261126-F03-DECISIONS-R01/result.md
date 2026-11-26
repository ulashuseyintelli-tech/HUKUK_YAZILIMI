# GOV-REQ-20261126-F03-DECISIONS-R01 — verified result

The owner-authorized exact record was applied by execution PR #3353, squash d7bf6b1e584e4810374897afc7d6c2dd9c0ed33e. Target SHA256 48625982f7a0bbd057a3472156aa1875a9223996e51f337711b3166055c9b9eb; all listed checks were observed successful at their exact heads. The F03/R8 candidates and live systems were not changed. Manual matching-head closeout used the connected GitHub tool because the local closeout adapter fails with gh HTTP 401.

<!-- GOV_COORD_RESULT_JSON_BEGIN -->
```json
{
  "schemaVersion": 1,
  "resultId": "RESULT-GOV-REQ-20261126-F03-DECISIONS-R01",
  "requestId": "GOV-REQ-20261126-F03-DECISIONS-R01",
  "requestFingerprint": "2f4eb2014d37c12e6961601295aa941f200a28cbeb370e1e69002c933a541b9c",
  "status": "SUCCEEDED",
  "executionPrNumber": 3353,
  "executionMergeSha": "d7bf6b1e584e4810374897afc7d6c2dd9c0ed33e",
  "effectiveMainSha": "1d5a4eb50b03c43779747ff60f1a1c61624f8449",
  "completedAt": "2026-11-26T20:59:17Z",
  "validationEvidence": [
    {
      "name": "exact-target-sha256:48625982f7a0bbd057a3472156aa1875a9223996e51f337711b3166055c9b9eb",
      "status": "PASS",
      "evidenceSha": "1d5a4eb50b03c43779747ff60f1a1c61624f8449"
    },
    {
      "name": "CI:Architectural Guardrails:check-140161777464",
      "status": "PASS",
      "evidenceSha": "9d660e59d7de36ce7be90e9c1a09201d7862ed0f"
    },
    {
      "name": "CI:Client Workspace Live Smoke:check-140158877502",
      "status": "PASS",
      "evidenceSha": "9d660e59d7de36ce7be90e9c1a09201d7862ed0f"
    },
    {
      "name": "CI:CodeQL:check-140155593322",
      "status": "PASS",
      "evidenceSha": "9d660e59d7de36ce7be90e9c1a09201d7862ed0f"
    },
    {
      "name": "CI:Test Suite:check-140155348669",
      "status": "PASS",
      "evidenceSha": "9d660e59d7de36ce7be90e9c1a09201d7862ed0f"
    },
    {
      "name": "CI:Windows Poppler Integration:check-140155348556",
      "status": "PASS",
      "evidenceSha": "9d660e59d7de36ce7be90e9c1a09201d7862ed0f"
    },
    {
      "name": "CI:Web Tests (vitest):check-140155348246",
      "status": "PASS",
      "evidenceSha": "9d660e59d7de36ce7be90e9c1a09201d7862ed0f"
    },
    {
      "name": "CI:Orchestration Tests:check-140155347840",
      "status": "PASS",
      "evidenceSha": "9d660e59d7de36ce7be90e9c1a09201d7862ed0f"
    },
    {
      "name": "CI:Analyze (csharp):check-140155342610",
      "status": "PASS",
      "evidenceSha": "9d660e59d7de36ce7be90e9c1a09201d7862ed0f"
    },
    {
      "name": "CI:Analyze (python):check-140155342540",
      "status": "PASS",
      "evidenceSha": "9d660e59d7de36ce7be90e9c1a09201d7862ed0f"
    },
    {
      "name": "CI:Analyze (javascript-typescript):check-140155342485",
      "status": "PASS",
      "evidenceSha": "9d660e59d7de36ce7be90e9c1a09201d7862ed0f"
    },
    {
      "name": "CI:Analyze (actions):check-140155342307",
      "status": "PASS",
      "evidenceSha": "9d660e59d7de36ce7be90e9c1a09201d7862ed0f"
    }
  ]
}
```
<!-- GOV_COORD_RESULT_JSON_END -->
