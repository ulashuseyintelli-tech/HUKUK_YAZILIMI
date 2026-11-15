# CL-R14 model A - supplied owner decision transcription result

Exactly one Decision Log row transcribes the owner-selected schema-free CL-R14 model A. Operation/case scope is not evaluated by generic active-record checks; legacy booleans, wizard nonblocking behavior and actual UYAP send authority gates are preserved. No POA-to-case sufficiency evaluator or unrelated decision is closed. This result certifies the decision transcription only; product PRs, tests, main acceptance, writer returns and remaining decisions are tracked separately. It is not a new machine grant, CLIENT acknowledgement, live operation or general Office/Client acceptance.

<!-- GOV_COORD_RESULT_JSON_BEGIN -->
```json
{
  "schemaVersion": 1,
  "resultId": "RESULT-GOV-REQ-20261115-CLIENT-POA-SCOPE-CLR14-SA01",
  "requestId": "GOV-REQ-20261115-CLIENT-POA-SCOPE-CLR14-SA01",
  "requestFingerprint": "4471f73562d1b8fa11ee193136e1c83649c18b0c9c1c3496d54f81a5a410abfb",
  "status": "SUCCEEDED",
  "executionPrNumber": 3270,
  "executionMergeSha": "bb1c378f28a59f02fd250fd8d69781438e07508a",
  "effectiveMainSha": "71c72d1556816c78ba763fa9d26a543583333f32",
  "completedAt": "2026-11-15T17:32:48Z",
  "validationEvidence": [
    {
      "name": "Exact one-row append and registered target SHA256 dd2eff2c657f75fe1b3ab65e6e2fd1d84404258eb314d7658a14c5c2770909d8",
      "status": "PASS",
      "evidenceSha": "bb1c378f28a59f02fd250fd8d69781438e07508a"
    },
    {
      "name": "One supplied-owner CL-R14/A row; schema-free scope clarity only, legacy booleans/wizard/UYAP gates and OD-07/O-5/F04 preserved",
      "status": "PASS",
      "evidenceSha": "bb1c378f28a59f02fd250fd8d69781438e07508a"
    },
    {
      "name": "Execution-main ci run 43733204998",
      "status": "PASS",
      "evidenceSha": "bb1c378f28a59f02fd250fd8d69781438e07508a"
    },
    {
      "name": "Execution-main codeql run 43733204471",
      "status": "PASS",
      "evidenceSha": "bb1c378f28a59f02fd250fd8d69781438e07508a"
    },
    {
      "name": "Execution-main orchestration run 43733205021",
      "status": "PASS",
      "evidenceSha": "bb1c378f28a59f02fd250fd8d69781438e07508a"
    }
  ]
}
```
<!-- GOV_COORD_RESULT_JSON_END -->
