# GOV-REQ-20261126-F03-MASTER-R02 — verified result

The owner-authorized exact record was applied by execution PR #3367, squash 05fb58b8ab8c6f6b095d345d6921dd7c99b1d31c. Target SHA256 0ef61b0b9769b9e31788f2972ec91d2adb4bebfe10bbb6a573f9a61bb36e7520; all listed checks were observed successful at their exact heads. The F03/R8 candidates and live systems were not changed. Manual matching-head closeout used the connected GitHub tool because the local closeout adapter fails with gh HTTP 401.

<!-- GOV_COORD_RESULT_JSON_BEGIN -->
```json
{
  "schemaVersion": 1,
  "resultId": "RESULT-GOV-REQ-20261126-F03-MASTER-R02",
  "requestId": "GOV-REQ-20261126-F03-MASTER-R02",
  "requestFingerprint": "8da1b59a19ac523309f698dff26418e66d216faacd748191a601f5880ef5ac10",
  "status": "SUCCEEDED",
  "executionPrNumber": 3367,
  "executionMergeSha": "05fb58b8ab8c6f6b095d345d6921dd7c99b1d31c",
  "effectiveMainSha": "05fb58b8ab8c6f6b095d345d6921dd7c99b1d31c",
  "completedAt": "2026-11-26T23:22:07Z",
  "validationEvidence": [
    {
      "name": "exact-target-sha256:0ef61b0b9769b9e31788f2972ec91d2adb4bebfe10bbb6a573f9a61bb36e7520",
      "status": "PASS",
      "evidenceSha": "05fb58b8ab8c6f6b095d345d6921dd7c99b1d31c"
    },
    {
      "name": "CI:Architectural Guardrails:check-140215997364",
      "status": "PASS",
      "evidenceSha": "24783087d5f9e4d77c9b97f06d74b36ac1f49ac1"
    },
    {
      "name": "CI:Client Workspace Live Smoke:check-140213068371",
      "status": "PASS",
      "evidenceSha": "24783087d5f9e4d77c9b97f06d74b36ac1f49ac1"
    },
    {
      "name": "CI:CodeQL:check-140210642832",
      "status": "PASS",
      "evidenceSha": "24783087d5f9e4d77c9b97f06d74b36ac1f49ac1"
    },
    {
      "name": "CI:Windows Poppler Integration:check-140210412834",
      "status": "PASS",
      "evidenceSha": "24783087d5f9e4d77c9b97f06d74b36ac1f49ac1"
    },
    {
      "name": "CI:Web Tests (vitest):check-140210412826",
      "status": "PASS",
      "evidenceSha": "24783087d5f9e4d77c9b97f06d74b36ac1f49ac1"
    },
    {
      "name": "CI:Test Suite:check-140210412561",
      "status": "PASS",
      "evidenceSha": "24783087d5f9e4d77c9b97f06d74b36ac1f49ac1"
    },
    {
      "name": "CI:Orchestration Tests:check-140210412364",
      "status": "PASS",
      "evidenceSha": "24783087d5f9e4d77c9b97f06d74b36ac1f49ac1"
    },
    {
      "name": "CI:Analyze (python):check-140210409753",
      "status": "PASS",
      "evidenceSha": "24783087d5f9e4d77c9b97f06d74b36ac1f49ac1"
    },
    {
      "name": "CI:Analyze (csharp):check-140210409743",
      "status": "PASS",
      "evidenceSha": "24783087d5f9e4d77c9b97f06d74b36ac1f49ac1"
    },
    {
      "name": "CI:Analyze (actions):check-140210409722",
      "status": "PASS",
      "evidenceSha": "24783087d5f9e4d77c9b97f06d74b36ac1f49ac1"
    },
    {
      "name": "CI:Analyze (javascript-typescript):check-140210409472",
      "status": "PASS",
      "evidenceSha": "24783087d5f9e4d77c9b97f06d74b36ac1f49ac1"
    }
  ]
}
```
<!-- GOV_COORD_RESULT_JSON_END -->
