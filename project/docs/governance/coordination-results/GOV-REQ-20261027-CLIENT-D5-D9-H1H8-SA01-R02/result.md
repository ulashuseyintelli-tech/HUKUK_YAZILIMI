# Ek142 bounded record delivery — immutable result

Records the observed repository execution of an already-given owner decision, with successful exact-head PR/main checks. It does not repeat or upgrade the underlying live evidence, erase unsuccessful history, authorize a live action or close the existing residual pool.

<!-- GOV_COORD_RESULT_JSON_BEGIN -->
```json
{
  "schemaVersion": 1,
  "resultId": "RESULT-GOV-REQ-20261027-CLIENT-D5-D9-H1H8-SA01-R02",
  "requestId": "GOV-REQ-20261027-CLIENT-D5-D9-H1H8-SA01-R02",
  "requestFingerprint": "2e64992a4a5e9bb85c0a7a0043dd7f0403050f8c6990a8fec488c228f8fa5256",
  "status": "SUCCEEDED",
  "executionPrNumber": 3029,
  "executionMergeSha": "473ee37ff5122ad928cb868fbbd4297377cb7638",
  "effectiveMainSha": "473ee37ff5122ad928cb868fbbd4297377cb7638",
  "completedAt": "2026-10-27T17:49:43Z",
  "validationEvidence": [
    {
      "name": "execution-pr:Test Suite",
      "status": "PASS",
      "evidenceSha": "1f11dd29da5ddae18a0ace5bbd3bb9eaaa114096"
    },
    {
      "name": "execution-pr:Analyze (actions)",
      "status": "PASS",
      "evidenceSha": "1f11dd29da5ddae18a0ace5bbd3bb9eaaa114096"
    },
    {
      "name": "execution-pr:Orchestration Tests",
      "status": "PASS",
      "evidenceSha": "1f11dd29da5ddae18a0ace5bbd3bb9eaaa114096"
    },
    {
      "name": "execution-pr:Analyze (javascript-typescript)",
      "status": "PASS",
      "evidenceSha": "1f11dd29da5ddae18a0ace5bbd3bb9eaaa114096"
    },
    {
      "name": "execution-pr:Analyze (python)",
      "status": "PASS",
      "evidenceSha": "1f11dd29da5ddae18a0ace5bbd3bb9eaaa114096"
    },
    {
      "name": "execution-pr:Windows Poppler Integration",
      "status": "PASS",
      "evidenceSha": "1f11dd29da5ddae18a0ace5bbd3bb9eaaa114096"
    },
    {
      "name": "execution-pr:Web Tests (vitest)",
      "status": "PASS",
      "evidenceSha": "1f11dd29da5ddae18a0ace5bbd3bb9eaaa114096"
    },
    {
      "name": "execution-pr:Architectural Guardrails",
      "status": "PASS",
      "evidenceSha": "1f11dd29da5ddae18a0ace5bbd3bb9eaaa114096"
    },
    {
      "name": "execution-pr:Client Workspace Live Smoke",
      "status": "PASS",
      "evidenceSha": "1f11dd29da5ddae18a0ace5bbd3bb9eaaa114096"
    },
    {
      "name": "execution-pr:CodeQL",
      "status": "PASS",
      "evidenceSha": "1f11dd29da5ddae18a0ace5bbd3bb9eaaa114096"
    },
    {
      "name": "merge-main:CI:run-40551606255",
      "status": "PASS",
      "evidenceSha": "473ee37ff5122ad928cb868fbbd4297377cb7638"
    },
    {
      "name": "merge-main:Push on main:run-40551606608",
      "status": "PASS",
      "evidenceSha": "473ee37ff5122ad928cb868fbbd4297377cb7638"
    },
    {
      "name": "merge-main:GOV-COORD-V2 Orchestration Tests:run-40551606414",
      "status": "PASS",
      "evidenceSha": "473ee37ff5122ad928cb868fbbd4297377cb7638"
    },
    {
      "name": "exact-merged-target:89086e65a89aa772bf207001bb45014ee4282d73dbafa8e77f06e04268c86ea0",
      "status": "PASS",
      "evidenceSha": "473ee37ff5122ad928cb868fbbd4297377cb7638"
    }
  ]
}
```
<!-- GOV_COORD_RESULT_JSON_END -->
