# GOV-REQ-20261126-F03-CONTRACT-EXCEPTION-R01 — verified result

The owner-authorized exact record was applied by execution PR #3363, squash 97e8e2be4929ae3ac6033abfa7fd88857326fb03. Target SHA256 32321602a2b04401179ea326c894b901ee0d5f55d70280ae847c42d84270ac5e; all listed checks were observed successful at their exact heads. The F03/R8 candidates and live systems were not changed. Manual matching-head closeout used the connected GitHub tool because the local closeout adapter fails with gh HTTP 401.

<!-- GOV_COORD_RESULT_JSON_BEGIN -->
```json
{
  "schemaVersion": 1,
  "resultId": "RESULT-GOV-REQ-20261126-F03-CONTRACT-EXCEPTION-R01",
  "requestId": "GOV-REQ-20261126-F03-CONTRACT-EXCEPTION-R01",
  "requestFingerprint": "603eb5b7bbd96b3068c214e616a41434ae4ac4042fd85dded9f2500703349dc1",
  "status": "SUCCEEDED",
  "executionPrNumber": 3363,
  "executionMergeSha": "97e8e2be4929ae3ac6033abfa7fd88857326fb03",
  "effectiveMainSha": "97e8e2be4929ae3ac6033abfa7fd88857326fb03",
  "completedAt": "2026-11-26T22:57:10Z",
  "validationEvidence": [
    {
      "name": "exact-target-sha256:32321602a2b04401179ea326c894b901ee0d5f55d70280ae847c42d84270ac5e",
      "status": "PASS",
      "evidenceSha": "97e8e2be4929ae3ac6033abfa7fd88857326fb03"
    },
    {
      "name": "CI:Architectural Guardrails:check-140207683628",
      "status": "PASS",
      "evidenceSha": "2935a316d64966f371b7b07b5ff8d992d1c053e1"
    },
    {
      "name": "CI:Client Workspace Live Smoke:check-140204697521",
      "status": "PASS",
      "evidenceSha": "2935a316d64966f371b7b07b5ff8d992d1c053e1"
    },
    {
      "name": "CI:CodeQL:check-140202315974",
      "status": "PASS",
      "evidenceSha": "2935a316d64966f371b7b07b5ff8d992d1c053e1"
    },
    {
      "name": "CI:Windows Poppler Integration:check-140202071341",
      "status": "PASS",
      "evidenceSha": "2935a316d64966f371b7b07b5ff8d992d1c053e1"
    },
    {
      "name": "CI:Web Tests (vitest):check-140202071318",
      "status": "PASS",
      "evidenceSha": "2935a316d64966f371b7b07b5ff8d992d1c053e1"
    },
    {
      "name": "CI:Test Suite:check-140202071067",
      "status": "PASS",
      "evidenceSha": "2935a316d64966f371b7b07b5ff8d992d1c053e1"
    },
    {
      "name": "CI:Orchestration Tests:check-140202070756",
      "status": "PASS",
      "evidenceSha": "2935a316d64966f371b7b07b5ff8d992d1c053e1"
    },
    {
      "name": "CI:Analyze (actions):check-140202067012",
      "status": "PASS",
      "evidenceSha": "2935a316d64966f371b7b07b5ff8d992d1c053e1"
    },
    {
      "name": "CI:Analyze (python):check-140202066964",
      "status": "PASS",
      "evidenceSha": "2935a316d64966f371b7b07b5ff8d992d1c053e1"
    },
    {
      "name": "CI:Analyze (csharp):check-140202066947",
      "status": "PASS",
      "evidenceSha": "2935a316d64966f371b7b07b5ff8d992d1c053e1"
    },
    {
      "name": "CI:Analyze (javascript-typescript):check-140202066699",
      "status": "PASS",
      "evidenceSha": "2935a316d64966f371b7b07b5ff8d992d1c053e1"
    }
  ]
}
```
<!-- GOV_COORD_RESULT_JSON_END -->
