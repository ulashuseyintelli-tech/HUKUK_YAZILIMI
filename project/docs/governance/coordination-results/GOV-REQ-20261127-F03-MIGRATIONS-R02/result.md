# GOV-REQ-20261127-F03-MIGRATIONS-R02 — verified result

The owner-authorized exact record was applied by execution PR #3368, squash 96a3538d67470a5aa9995529ab803e845eb8aac6. Target SHA256 9c3332e6db4d19ff7e74e0b67db6203e8c4b4b8578e371afe3457899e68454f9; all listed checks were observed successful at their exact heads. The F03/R8 candidates and live systems were not changed. Manual matching-head closeout used the connected GitHub tool because the local closeout adapter fails with gh HTTP 401.

<!-- GOV_COORD_RESULT_JSON_BEGIN -->
```json
{
  "schemaVersion": 1,
  "resultId": "RESULT-GOV-REQ-20261127-F03-MIGRATIONS-R02",
  "requestId": "GOV-REQ-20261127-F03-MIGRATIONS-R02",
  "requestFingerprint": "1876ea8a4e921b7604dd72fe35c10cd4528c3a2d30df8b99f68d72dc40f8b6bf",
  "status": "SUCCEEDED",
  "executionPrNumber": 3368,
  "executionMergeSha": "96a3538d67470a5aa9995529ab803e845eb8aac6",
  "effectiveMainSha": "96a3538d67470a5aa9995529ab803e845eb8aac6",
  "completedAt": "2026-11-26T23:25:22Z",
  "validationEvidence": [
    {
      "name": "exact-target-sha256:9c3332e6db4d19ff7e74e0b67db6203e8c4b4b8578e371afe3457899e68454f9",
      "status": "PASS",
      "evidenceSha": "96a3538d67470a5aa9995529ab803e845eb8aac6"
    },
    {
      "name": "CI:Architectural Guardrails:check-140217261197",
      "status": "PASS",
      "evidenceSha": "eed1c0e0075916293a5a471686c287090b270ae9"
    },
    {
      "name": "CI:Client Workspace Live Smoke:check-140213108829",
      "status": "PASS",
      "evidenceSha": "eed1c0e0075916293a5a471686c287090b270ae9"
    },
    {
      "name": "CI:CodeQL:check-140211561786",
      "status": "PASS",
      "evidenceSha": "eed1c0e0075916293a5a471686c287090b270ae9"
    },
    {
      "name": "CI:Web Tests (vitest):check-140211351582",
      "status": "PASS",
      "evidenceSha": "eed1c0e0075916293a5a471686c287090b270ae9"
    },
    {
      "name": "CI:Windows Poppler Integration:check-140211351329",
      "status": "PASS",
      "evidenceSha": "eed1c0e0075916293a5a471686c287090b270ae9"
    },
    {
      "name": "CI:Orchestration Tests:check-140211351211",
      "status": "PASS",
      "evidenceSha": "eed1c0e0075916293a5a471686c287090b270ae9"
    },
    {
      "name": "CI:Test Suite:check-140211350979",
      "status": "PASS",
      "evidenceSha": "eed1c0e0075916293a5a471686c287090b270ae9"
    },
    {
      "name": "CI:Analyze (javascript-typescript):check-140211342352",
      "status": "PASS",
      "evidenceSha": "eed1c0e0075916293a5a471686c287090b270ae9"
    },
    {
      "name": "CI:Analyze (csharp):check-140211342331",
      "status": "PASS",
      "evidenceSha": "eed1c0e0075916293a5a471686c287090b270ae9"
    },
    {
      "name": "CI:Analyze (actions):check-140211342219",
      "status": "PASS",
      "evidenceSha": "eed1c0e0075916293a5a471686c287090b270ae9"
    },
    {
      "name": "CI:Analyze (python):check-140211342000",
      "status": "PASS",
      "evidenceSha": "eed1c0e0075916293a5a471686c287090b270ae9"
    }
  ]
}
```
<!-- GOV_COORD_RESULT_JSON_END -->
