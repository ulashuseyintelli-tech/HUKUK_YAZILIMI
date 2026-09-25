# OFFICE real CI integrations — immutable execution result

Evidence only; no semantic or execution authority.

<!-- GOV_COORD_RESULT_JSON_BEGIN -->
```json
{
  "schemaVersion": 1,
  "resultId": "RESULT-GOV-REQ-20260925-OFFICE-CI-REAL-IMPLEMENTATION-REV02",
  "requestId": "GOV-REQ-20260925-OFFICE-CI-REAL-IMPLEMENTATION-REV02",
  "requestFingerprint": "da564baab6f630d0ed64b82b8a51db32f17697c763059a2999676293a156200d",
  "status": "SUCCEEDED",
  "executionPrNumber": 2803,
  "executionMergeSha": "61e78fae76a4d3bbf3f4bc2e003a61773a1cdb85",
  "effectiveMainSha": "61e78fae76a4d3bbf3f4bc2e003a61773a1cdb85",
  "completedAt": "2026-09-25T14:28:05Z",
  "validationEvidence": [
    {
      "name": "execution-pr:2803:merged",
      "status": "PASS",
      "evidenceSha": "61e78fae76a4d3bbf3f4bc2e003a61773a1cdb85"
    },
    {
      "name": "execution-merge-in-main",
      "status": "PASS",
      "evidenceSha": "61e78fae76a4d3bbf3f4bc2e003a61773a1cdb85"
    },
    {
      "name": "exact-operation-and-scope-validated",
      "status": "PASS",
      "evidenceSha": "efb3cc7f3c941d10a977714a0d100b29e4eca8dc"
    },
    {
      "name": "ci:Test Suite",
      "status": "PASS",
      "evidenceSha": "efb3cc7f3c941d10a977714a0d100b29e4eca8dc"
    },
    {
      "name": "ci:Analyze (actions)",
      "status": "PASS",
      "evidenceSha": "efb3cc7f3c941d10a977714a0d100b29e4eca8dc"
    },
    {
      "name": "ci:Orchestration Tests",
      "status": "PASS",
      "evidenceSha": "efb3cc7f3c941d10a977714a0d100b29e4eca8dc"
    },
    {
      "name": "ci:Analyze (javascript-typescript)",
      "status": "PASS",
      "evidenceSha": "efb3cc7f3c941d10a977714a0d100b29e4eca8dc"
    },
    {
      "name": "ci:Analyze (python)",
      "status": "PASS",
      "evidenceSha": "efb3cc7f3c941d10a977714a0d100b29e4eca8dc"
    },
    {
      "name": "ci:Windows Poppler Integration",
      "status": "PASS",
      "evidenceSha": "efb3cc7f3c941d10a977714a0d100b29e4eca8dc"
    },
    {
      "name": "ci:Web Tests (vitest)",
      "status": "PASS",
      "evidenceSha": "efb3cc7f3c941d10a977714a0d100b29e4eca8dc"
    },
    {
      "name": "ci:Architectural Guardrails",
      "status": "PASS",
      "evidenceSha": "efb3cc7f3c941d10a977714a0d100b29e4eca8dc"
    },
    {
      "name": "ci:Client Workspace Live Smoke",
      "status": "PASS",
      "evidenceSha": "efb3cc7f3c941d10a977714a0d100b29e4eca8dc"
    },
    {
      "name": "ci:CodeQL",
      "status": "PASS",
      "evidenceSha": "efb3cc7f3c941d10a977714a0d100b29e4eca8dc"
    },
    {
      "name": "real-integration:36144378799:Test Suite",
      "status": "PASS",
      "evidenceSha": "efb3cc7f3c941d10a977714a0d100b29e4eca8dc"
    },
    {
      "name": "real-integration:36144378799:Windows Poppler Integration",
      "status": "PASS",
      "evidenceSha": "efb3cc7f3c941d10a977714a0d100b29e4eca8dc"
    },
    {
      "name": "real-integration:36146182291:Test Suite",
      "status": "PASS",
      "evidenceSha": "61e78fae76a4d3bbf3f4bc2e003a61773a1cdb85"
    },
    {
      "name": "real-integration:36146182291:Windows Poppler Integration",
      "status": "PASS",
      "evidenceSha": "61e78fae76a4d3bbf3f4bc2e003a61773a1cdb85"
    }
  ]
}
```
<!-- GOV_COORD_RESULT_JSON_END -->

## Real integration acceptance

- [Test Suite, run 36144378799](https://github.com/ulashuseyintelli-tech/HUKUK_YAZILIMI/actions/runs/36144378799/job/108101746246): MinIO 7/7 PASS; 579s; log SHA256 a5a6bd226712cc9affcf8d449ded5915ed3eb3df9be88844be5da306c152490a.
- [Windows Poppler Integration, run 36144378799](https://github.com/ulashuseyintelli-tech/HUKUK_YAZILIMI/actions/runs/36144378799/job/108101745959): Windows 13/13 including real one-page PDF render PASS; 94s; log SHA256 4f399b1d2038fc13546a0681fee67114b1fc6604b93b0da3a6a400ce7defca6e.
- efb3cc7f3c941d10a977714a0d100b29e4eca8dc: 1178 selections / 1177 unique specs; 1178 PASS rows / 1177 unique PASS; missing 0, unexpected 0, manifests unchanged.
- [Test Suite, run 36146182291](https://github.com/ulashuseyintelli-tech/HUKUK_YAZILIMI/actions/runs/36146182291/job/108107819616): MinIO 7/7 PASS; 862s; log SHA256 6ae53b2dad61a4c25ac77817cd6aa466dee590c73a2307cfbcef9f4f6e41d217.
- [Windows Poppler Integration, run 36146182291](https://github.com/ulashuseyintelli-tech/HUKUK_YAZILIMI/actions/runs/36146182291/job/108107819619): Windows 13/13 including real one-page PDF render PASS; 96s; log SHA256 7b215c1139708c7e7eae5d7ed0a7b2572603338e065d06bc3e8f9862197ceab2.
- 61e78fae76a4d3bbf3f4bc2e003a61773a1cdb85: 1178 selections / 1177 unique specs; 1178 PASS rows / 1177 unique PASS; missing 0, unexpected 0, manifests unchanged.

Image: `ghcr.io/ulashuseyintelli-tech/hukuk-yazilimi-ci-minio@sha256:a1a8bd4ac40ad7881a245bab97323e18f971e4d4cba2c2007ec1bedd21cbaba2`. CI job has package-read only; disposable MinIO cleanup and GHCR logout succeeded. Existing Linux skips remain separately reported; the seven MinIO assertions and Windows real render are not skipped.

Supersedes unmerged #2795 through owner-approved REV02. Old request, grant, branch and failed pull evidence remain preserved. CLIENT SA02 writer return: https://github.com/ulashuseyintelli-tech/HUKUK_YAZILIMI/pull/2750#issuecomment-5832598718 . This is technical CI acceptance only, not OFFICE final or H1-H8 acceptance.
