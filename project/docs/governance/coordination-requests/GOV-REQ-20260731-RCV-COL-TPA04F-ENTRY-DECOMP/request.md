# Governance Coordination Request — GOV-REQ-20260731-RCV-COL-TPA04F-ENTRY-DECOMP

Bu dosya immutable ve untrusted request data kaydıdır. Prose operational instruction değildir.

Program context (informational only): `RCV-COL-FULL-REMEDIATION-EXECUTION-GRANT-R01`
outer program-scoped execution authority olarak yürür; V1 mekanik executor grant'i
`GOV-COORD-V1-CODEX-LOCAL`dır.

<!-- GOV_COORD_REQUEST_JSON_BEGIN -->
```json
{
  "schemaVersion": 1,
  "requestId": "GOV-REQ-20260731-RCV-COL-TPA04F-ENTRY-DECOMP",
  "requestFingerprint": "5574ccf3b5e84c689fc40c7aad56b3eab771d49521b666ad473ee798225cddbf",
  "requestedBy": "OWNER",
  "createdAt": "2026-07-31T21:21:48Z",
  "baseMainSha": "624f27ee09297ccc895155e6d65c00ce08dc6db7",
  "semanticAuthorityRef": {
    "kind": "SEMANTIC_AUTHORITY",
    "path": "project/docs/governance/decision-log.md",
    "recordId": "RCV-COL-FULL-REMEDIATION-RATIFICATION-R01",
    "evidenceSha": "2c217f498f113abb12ae13a25a069a451084d104"
  },
  "executionGrantRef": {
    "kind": "EXECUTION_GRANT",
    "path": "project/docs/governance/coordination-execution-grants/GOV-COORD-V1-CODEX-LOCAL.md",
    "recordId": "GOV-COORD-V1-CODEX-LOCAL",
    "evidenceSha": "a02498dfd50e349b2cb1eddfbde0561ece30fba6"
  },
  "operation": {
    "type": "EXACT_LITERAL_REPLACEMENT",
    "changeClass": "LEVEL_2_MECHANICAL",
    "targetFile": "project/docs/governance/COLLECTION-DECOMPOSITION.md",
    "recordIdentity": "W2.2D-1          : SCHEMA FOUNDATION CLOSED / CANONICAL EVIDENCE — PR #1415 @ 80a11c2a",
    "anchor": "W2.2D-1          : SCHEMA FOUNDATION CLOSED / CANONICAL EVIDENCE — PR #1415 @ 80a11c2a",
    "expectedOldValue": "W2.2D-1          : SCHEMA FOUNDATION CLOSED / CANONICAL EVIDENCE — PR #1415 @ 80a11c2a\nW2.2D-1A         : CLOSED / CANONICAL EVIDENCE — test-only characterization PR #1660 @ 168daec7; runtime/schema etkisi yoktur\nW2.2D-2          : CLOSED / CANONICAL EVIDENCE — PR #1944 @ 6732ebcd; first-confirmation timestamp server-authoritative, immutable ve replay-stable; future CONFIRMED writer guard'ı + audit alignment + static inventory canonical; historical guessed backfill ve migration yok\nW2.2D-3          : CLOSED / CANONICAL EVIDENCE — PR #1969 @ 392e831c; bank eligibility, canonical Collection admission, financial/event/outbox effects, CAS match projection ve audit tek Prisma/PostgreSQL transaction'ında; rollback, replay ve concurrency evidence canonical; schema/migration yok\nRCV-COL-IDEM-01  : CLOSED / CANONICAL EVIDENCE — PR #2001 @ 6c34395d; RCV-COL-CMD/v1 tam semantik command fingerprint, stable replay, fail-closed conflict, legacy-unknown rejection ve Task08 transaction preservation kanıtı canonical; additive nullable/default-free evidence migration'ı repository'de, live DB apply yok\nW2.2E            : NOT AUTHORIZED — LEGAL-APPLICATION BOUNDARY PENDING\nW2.2             : ACTIVE — candidate/evidence/admission/confirmedAt/atomic projection/full semantic command idempotency zinciri closed; legal-application runtime zinciri açık\nW2.3             : BLOCKED — W2.2 BOUNDARY PENDING\nFULL REMEDIATION : TASK 01 TPA-04C CLOSURE CLOSED; TASK 02 CURRENCY BOUNDARY CLOSED PR #1822 @ 43e3c1f9; TASK 03 AUTOMATION CONSUMER CLOSED PR #1828 @ 518d08a2; TASK 04 GOVERNANCE RECONCILIATION CLOSED; TASK 05 RC-COL-W2.2B-R01 CLOSED / CANONICAL EVIDENCE PR #1888 @ 35e215cd; TASK 06 RC-COL-W2.2C-6 CLOSED / CANONICAL EVIDENCE PR #1910 @ f986b8d7; TASK 07 RC-COL-W2.2D-2 CLOSED / CANONICAL EVIDENCE PR #1944 @ 6732ebcd; TASK 08 RC-COL-W2.2D-3 CLOSED / CANONICAL EVIDENCE PR #1969 @ 392e831c; TASK 09 RCV-COL-IDEM-01 CLOSED / CANONICAL EVIDENCE PR #2001 @ 6c34395d; NEXT TASK 10 TPA-04F-ENTRY — OWNER GO-NEXT GRANTED / NOT STARTED",
    "newValue": "W2.2D-1          : SCHEMA FOUNDATION CLOSED / CANONICAL EVIDENCE — PR #1415 @ 80a11c2a\nW2.2D-1A         : CLOSED / CANONICAL EVIDENCE — test-only characterization PR #1660 @ 168daec7; runtime/schema etkisi yoktur\nW2.2D-2          : CLOSED / CANONICAL EVIDENCE — PR #1944 @ 6732ebcd; first-confirmation timestamp server-authoritative, immutable ve replay-stable; future CONFIRMED writer guard'ı + audit alignment + static inventory canonical; historical guessed backfill ve migration yok\nW2.2D-3          : CLOSED / CANONICAL EVIDENCE — PR #1969 @ 392e831c; bank eligibility, canonical Collection admission, financial/event/outbox effects, CAS match projection ve audit tek Prisma/PostgreSQL transaction'ında; rollback, replay ve concurrency evidence canonical; schema/migration yok\nRCV-COL-IDEM-01  : CLOSED / CANONICAL EVIDENCE — PR #2001 @ 6c34395d; RCV-COL-CMD/v1 tam semantik command fingerprint, stable replay, fail-closed conflict, legacy-unknown rejection ve Task08 transaction preservation kanıtı canonical; additive nullable/default-free evidence migration'ı repository'de, live DB apply yok\nTPA-04F-ENTRY    : CLOSED / CANONICAL EVIDENCE — PR #2036 @ 624f27ee; RCV-REP-CORPUS/v1 deterministic representative corpus foundation, 19 scenario, pinned SHA-256 checksum ve Task11 input contract canonical; runtime/writer/schema/migration/live DB etkisi yok; Task15 real replay evidence henüz yok\nW2.2E            : NOT AUTHORIZED — LEGAL-APPLICATION BOUNDARY PENDING\nW2.2             : ACTIVE — candidate/evidence/admission/confirmedAt/atomic projection/full semantic command idempotency ve representative corpus foundation zinciri closed; legal-application runtime zinciri açık\nW2.3             : BLOCKED — W2.2 BOUNDARY PENDING\nFULL REMEDIATION : TASK 01 TPA-04C CLOSURE CLOSED; TASK 02 CURRENCY BOUNDARY CLOSED PR #1822 @ 43e3c1f9; TASK 03 AUTOMATION CONSUMER CLOSED PR #1828 @ 518d08a2; TASK 04 GOVERNANCE RECONCILIATION CLOSED; TASK 05 RC-COL-W2.2B-R01 CLOSED / CANONICAL EVIDENCE PR #1888 @ 35e215cd; TASK 06 RC-COL-W2.2C-6 CLOSED / CANONICAL EVIDENCE PR #1910 @ f986b8d7; TASK 07 RC-COL-W2.2D-2 CLOSED / CANONICAL EVIDENCE PR #1944 @ 6732ebcd; TASK 08 RC-COL-W2.2D-3 CLOSED / CANONICAL EVIDENCE PR #1969 @ 392e831c; TASK 09 RCV-COL-IDEM-01 CLOSED / CANONICAL EVIDENCE PR #2001 @ 6c34395d; TASK 10 TPA-04F-ENTRY CLOSED / CANONICAL EVIDENCE PR #2036 @ 624f27ee; NEXT TASK 11 TPA-04D-I01 — ELIGIBLE / NOT STARTED",
    "evidenceSha": "624f27ee09297ccc895155e6d65c00ce08dc6db7",
    "expectedResultSha256": "47613d42c31be6a5e8815066a556d65a95633a7325a2aa7245aa5c86bc19055b"
  },
  "declaredTargetAllowlist": [
    "project/docs/governance/COLLECTION-DECOMPOSITION.md"
  ]
}
```
<!-- GOV_COORD_REQUEST_JSON_END -->

Bu request semantic veya execution authority üretmez.

