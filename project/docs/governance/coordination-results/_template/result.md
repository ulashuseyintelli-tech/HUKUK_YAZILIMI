# Governance Coordination Result Template

Bu dosya inert template'tir.

<!-- GOV_COORD_RESULT_JSON_BEGIN -->
```json
{
  "schemaVersion": 1,
  "resultId": "TEMPLATE_RESULT_ID",
  "requestId": "TEMPLATE_REQUEST_ID",
  "requestFingerprint": "TEMPLATE_REQUEST_FINGERPRINT",
  "status": "SUCCEEDED",
  "executionPrNumber": 0,
  "executionMergeSha": "TEMPLATE_EXECUTION_MERGE_SHA",
  "effectiveMainSha": "TEMPLATE_EFFECTIVE_MAIN_SHA",
  "completedAt": "2026-07-24T00:00:00Z",
  "validationEvidence": [
    {
      "name": "TEMPLATE_VALIDATION_NAME",
      "status": "PASS",
      "evidenceSha": "TEMPLATE_EVIDENCE_SHA"
    }
  ]
}
```
<!-- GOV_COORD_RESULT_JSON_END -->

Template submit edilemez. Result yalnız merged execution ve observed validation
evidence ile doldurulur.
