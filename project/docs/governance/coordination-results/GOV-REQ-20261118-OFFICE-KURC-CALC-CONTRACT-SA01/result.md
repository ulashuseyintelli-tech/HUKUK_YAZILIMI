# KUR-C calculation contract — verified decision record

The owner-approved evidence-bound calculation contract was recorded in decision-log.md as OFFICE-KURC-CALC-CONTRACT-SA01.

The request PR #3301 passed 11 checks at 66ff2428d7439a380f36a3fa6f371929e135ed16 and was squash-merged as 17b7938614e62cd14eee91e8a86d2384bf1d29b4. Execution PR #3303 passed 11 checks at 85ff0573a2d6a053726b11b6376e24d3023c0fdb and was squash-merged as 5714b0aded32da44883399df65248a217869a07c. The exact merge-SHA CI, CodeQL and orchestration checks passed for both merges. Their run IDs are recorded below.

The execution changed only decision-log.md and added one row. The resulting Git blob SHA256 was 5bd1d315dc1df17e44789595720706d3abf187437a4689b938e14a622e9192bb. The owner-assigned writer turn was returned to CLIENT in [the coordination channel](https://github.com/ulashuseyintelli-tech/HUKUK_YAZILIMI/pull/2750#issuecomment-6963710970).

The recorded decision accepts verified provisions under their documented conditions. Items that depend on unresolved fee base, exchange-rate or partial-payment questions remain uncomputable. The contract forbids zero or estimated results for those items. Each permanent calculation branch requires verified supporting evidence and separate owner approval. FR-7 A and temporary D, E2, E1, H6 and G2 are preserved.

Scope was limited to governance records. Product code and live operations were outside the delivery. The repository closeout fallback used normal branch protection and exact-head squash merge.

<!-- GOV_COORD_RESULT_JSON_BEGIN -->
```json
{
  "schemaVersion": 1,
  "resultId": "RESULT-GOV-REQ-20261118-OFFICE-KURC-CALC-CONTRACT-SA01",
  "requestId": "GOV-REQ-20261118-OFFICE-KURC-CALC-CONTRACT-SA01",
  "requestFingerprint": "66414d0ea78f122831b6b8997c9ab6b5dd5fb32e93f7b07fcff0d487bf85ba64",
  "status": "SUCCEEDED",
  "executionPrNumber": 3303,
  "executionMergeSha": "5714b0aded32da44883399df65248a217869a07c",
  "effectiveMainSha": "359800b06ba5f0f89d8e3fe0bf68790f1055fd2e",
  "completedAt": "2026-11-17T23:11:53Z",
  "validationEvidence": [
    {
      "name": "exact-one-row-target-sha256:5bd1d315dc1df17e44789595720706d3abf187437a4689b938e14a622e9192bb",
      "status": "PASS",
      "evidenceSha": "5714b0aded32da44883399df65248a217869a07c"
    },
    {
      "name": "GOV-COORD-V2 Orchestration Tests:run-44187737245:attempt-1",
      "status": "PASS",
      "evidenceSha": "17b7938614e62cd14eee91e8a86d2384bf1d29b4"
    },
    {
      "name": "CI:run-44187737268:attempt-1",
      "status": "PASS",
      "evidenceSha": "17b7938614e62cd14eee91e8a86d2384bf1d29b4"
    },
    {
      "name": "CodeQL:run-44187737536:attempt-1",
      "status": "PASS",
      "evidenceSha": "17b7938614e62cd14eee91e8a86d2384bf1d29b4"
    },
    {
      "name": "GOV-COORD-V2 Orchestration Tests:run-44193836402:attempt-1",
      "status": "PASS",
      "evidenceSha": "5714b0aded32da44883399df65248a217869a07c"
    },
    {
      "name": "CodeQL:run-44193835750:attempt-1",
      "status": "PASS",
      "evidenceSha": "5714b0aded32da44883399df65248a217869a07c"
    },
    {
      "name": "CI:run-44193836505:attempt-1",
      "status": "PASS",
      "evidenceSha": "5714b0aded32da44883399df65248a217869a07c"
    }
  ]
}
```
<!-- GOV_COORD_RESULT_JSON_END -->
