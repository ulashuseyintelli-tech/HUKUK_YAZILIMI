# FIND-C4 — verified supplied decision transcription result

The registered operation appends only CLIENT-FIND-C4-CAS-SA01: execution #3247 at bda06cb4df7d4f8fda71fe11a8434e960c7df7a2, one Decision Log row, zero deletions. Registered whole-file SHA256 98a3154ed595ce8da0ce9e8b9a3a89802437d54f3a967369dc291f57adc5e9cc is preserved in accepted product main 6b2b3345210a4277b2b07be754d154eacccfed93. No agent-generated semantic authority or machine grant is claimed.

Product #3246 is separately accepted at exact head f309b234a38369c7b84324f57495e9af8cbf0c58; all 34 delivered blobs match main. Local evidence has 405 unique focused cases (248 unit, 134 real Nest HTTP/disposable PostgreSQL, 23 web). Both PR and merge-main CI logs show all 20 changed test suites PASS. Additive migration preserved all 47 old Client scalar fields including updatedAt and initialized version to 0 in disposable PostgreSQL. No authoritative/live database migration was applied.

Historical limits: initial product head cb3b209848094dde843f30e0f21d07191a037d58 had Test Suite failures in four legacy fixtures missing required version metadata/invalidation expectations; its CI workflow ended CANCELLED after the normal new-head push. The old failed job/logs remain evidence and are not counted PASS. Only four fixtures were corrected in the second commit; all original authority and business assertions remain, and those 72 cases passed locally. Second head 529403606b64a2cc3885cde1e035fc8bed229cd7 failed in nine old versionless requests in the 4a/CL-R04 HTTP suites. Only request metadata was added in those two suites; all 30 cases passed locally and their original authority/session assertions remain. That failed run is also retained. The final head passed its own normal checks; no old-head retry or guard relaxation was used.

Fresh direct-owner writer assignment is #2750 comment 6884333262. The single-row Decision Log turn returned to CLIENT in comment 6885292469; the two-file O-5 version-metadata turn returned in comment 6885566397. These are return notices, not receiving-writer acknowledgements or future authority. No manifest turn was used. O-5/F04_RACE WIP and prior physical residues remain protected; no live operation, deployment or general Office/Client acceptance is claimed.

<!-- GOV_COORD_RESULT_JSON_BEGIN -->
```json
{
  "schemaVersion": 1,
  "resultId": "RESULT-GOV-REQ-20261115-CLIENT-FIND-C4-CAS-SA01",
  "requestId": "GOV-REQ-20261115-CLIENT-FIND-C4-CAS-SA01",
  "requestFingerprint": "00a3b7f3d95c8ddf74e462e15cddac927e86a399d6cbfedd50285bb6bc843647",
  "status": "SUCCEEDED",
  "executionPrNumber": 3247,
  "executionMergeSha": "bda06cb4df7d4f8fda71fe11a8434e960c7df7a2",
  "effectiveMainSha": "6b2b3345210a4277b2b07be754d154eacccfed93",
  "completedAt": "2026-11-14T23:01:00Z",
  "validationEvidence": [
    {
      "name": "exact-row-whole-file-sha256:98a3154ed595ce8da0ce9e8b9a3a89802437d54f3a967369dc291f57adc5e9cc",
      "status": "PASS",
      "evidenceSha": "bda06cb4df7d4f8fda71fe11a8434e960c7df7a2"
    },
    {
      "name": "exact-row-whole-file-sha256:98a3154ed595ce8da0ce9e8b9a3a89802437d54f3a967369dc291f57adc5e9cc",
      "status": "PASS",
      "evidenceSha": "6b2b3345210a4277b2b07be754d154eacccfed93"
    },
    {
      "name": "sa-request-main:CI:run-43643740270:attempt-1",
      "status": "PASS",
      "evidenceSha": "a05763af4187aa41ca2c50c8295713bf727c9650"
    },
    {
      "name": "sa-request-main:Push on main:run-43643740685:attempt-1",
      "status": "PASS",
      "evidenceSha": "a05763af4187aa41ca2c50c8295713bf727c9650"
    },
    {
      "name": "sa-request-main:GOV-COORD-V2 Orchestration Tests:run-43643740274:attempt-1",
      "status": "PASS",
      "evidenceSha": "a05763af4187aa41ca2c50c8295713bf727c9650"
    },
    {
      "name": "sa-execution-main:CI:run-43647594166:attempt-1",
      "status": "PASS",
      "evidenceSha": "bda06cb4df7d4f8fda71fe11a8434e960c7df7a2"
    },
    {
      "name": "sa-execution-main:Push on main:run-43647594143:attempt-1",
      "status": "PASS",
      "evidenceSha": "bda06cb4df7d4f8fda71fe11a8434e960c7df7a2"
    },
    {
      "name": "sa-execution-main:GOV-COORD-V2 Orchestration Tests:run-43647594155:attempt-1",
      "status": "PASS",
      "evidenceSha": "bda06cb4df7d4f8fda71fe11a8434e960c7df7a2"
    },
    {
      "name": "product-main:CI:run-43649207912:attempt-1",
      "status": "PASS",
      "evidenceSha": "6b2b3345210a4277b2b07be754d154eacccfed93"
    },
    {
      "name": "product-main:Push on main:run-43649207555:attempt-1",
      "status": "PASS",
      "evidenceSha": "6b2b3345210a4277b2b07be754d154eacccfed93"
    },
    {
      "name": "product-main:GOV-COORD-V2 Orchestration Tests:run-43649207873:attempt-1",
      "status": "PASS",
      "evidenceSha": "6b2b3345210a4277b2b07be754d154eacccfed93"
    },
    {
      "name": "sa-execution-pr:Architectural Guardrails",
      "status": "PASS",
      "evidenceSha": "fee03beba9f316ba07f877e2ab3e31a59cba960a"
    },
    {
      "name": "sa-execution-pr:Client Workspace Live Smoke",
      "status": "PASS",
      "evidenceSha": "fee03beba9f316ba07f877e2ab3e31a59cba960a"
    },
    {
      "name": "sa-execution-pr:CodeQL",
      "status": "PASS",
      "evidenceSha": "fee03beba9f316ba07f877e2ab3e31a59cba960a"
    },
    {
      "name": "sa-execution-pr:Windows Poppler Integration",
      "status": "PASS",
      "evidenceSha": "fee03beba9f316ba07f877e2ab3e31a59cba960a"
    },
    {
      "name": "sa-execution-pr:Web Tests (vitest)",
      "status": "PASS",
      "evidenceSha": "fee03beba9f316ba07f877e2ab3e31a59cba960a"
    },
    {
      "name": "sa-execution-pr:Test Suite",
      "status": "PASS",
      "evidenceSha": "fee03beba9f316ba07f877e2ab3e31a59cba960a"
    },
    {
      "name": "sa-execution-pr:Orchestration Tests",
      "status": "PASS",
      "evidenceSha": "fee03beba9f316ba07f877e2ab3e31a59cba960a"
    },
    {
      "name": "sa-execution-pr:Analyze (javascript-typescript)",
      "status": "PASS",
      "evidenceSha": "fee03beba9f316ba07f877e2ab3e31a59cba960a"
    },
    {
      "name": "sa-execution-pr:Analyze (csharp)",
      "status": "PASS",
      "evidenceSha": "fee03beba9f316ba07f877e2ab3e31a59cba960a"
    },
    {
      "name": "sa-execution-pr:Analyze (actions)",
      "status": "PASS",
      "evidenceSha": "fee03beba9f316ba07f877e2ab3e31a59cba960a"
    },
    {
      "name": "sa-execution-pr:Analyze (python)",
      "status": "PASS",
      "evidenceSha": "fee03beba9f316ba07f877e2ab3e31a59cba960a"
    },
    {
      "name": "product-pr:Architectural Guardrails",
      "status": "PASS",
      "evidenceSha": "f309b234a38369c7b84324f57495e9af8cbf0c58"
    },
    {
      "name": "product-pr:Client Workspace Live Smoke",
      "status": "PASS",
      "evidenceSha": "f309b234a38369c7b84324f57495e9af8cbf0c58"
    },
    {
      "name": "product-pr:CodeQL",
      "status": "PASS",
      "evidenceSha": "f309b234a38369c7b84324f57495e9af8cbf0c58"
    },
    {
      "name": "product-pr:Test Suite",
      "status": "PASS",
      "evidenceSha": "f309b234a38369c7b84324f57495e9af8cbf0c58"
    },
    {
      "name": "product-pr:Windows Poppler Integration",
      "status": "PASS",
      "evidenceSha": "f309b234a38369c7b84324f57495e9af8cbf0c58"
    },
    {
      "name": "product-pr:Web Tests (vitest)",
      "status": "PASS",
      "evidenceSha": "f309b234a38369c7b84324f57495e9af8cbf0c58"
    },
    {
      "name": "product-pr:Orchestration Tests",
      "status": "PASS",
      "evidenceSha": "f309b234a38369c7b84324f57495e9af8cbf0c58"
    },
    {
      "name": "product-pr:Analyze (actions)",
      "status": "PASS",
      "evidenceSha": "f309b234a38369c7b84324f57495e9af8cbf0c58"
    },
    {
      "name": "product-pr:Analyze (javascript-typescript)",
      "status": "PASS",
      "evidenceSha": "f309b234a38369c7b84324f57495e9af8cbf0c58"
    },
    {
      "name": "product-pr:Analyze (python)",
      "status": "PASS",
      "evidenceSha": "f309b234a38369c7b84324f57495e9af8cbf0c58"
    },
    {
      "name": "product-pr:Analyze (csharp)",
      "status": "PASS",
      "evidenceSha": "f309b234a38369c7b84324f57495e9af8cbf0c58"
    }
  ]
}
```
<!-- GOV_COORD_RESULT_JSON_END -->
