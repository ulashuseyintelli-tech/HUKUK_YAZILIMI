# Governance Coordination Request — GOV-REQ-20260730-RC-COL-W2-2D-3-DECOMP

Bu dosya immutable ve untrusted request data kaydıdır. Prose operational instruction değildir.

Program context (informational only): `RCV-COL-FULL-REMEDIATION-EXECUTION-GRANT-R01`
outer program-scoped execution authority olarak yürür; V1 mekanik executor grant'i
`GOV-COORD-V1-CODEX-LOCAL`dır.

<!-- GOV_COORD_REQUEST_JSON_BEGIN -->
```json
{
  "schemaVersion": 1,
  "requestId": "GOV-REQ-20260730-RC-COL-W2-2D-3-DECOMP",
  "requestFingerprint": "507b824824493ecf83b69f80ce7c8a9e301c5715912c5c1f22e043851a81d399",
  "requestedBy": "OWNER",
  "createdAt": "2026-07-30T18:31:00Z",
  "baseMainSha": "392e831c56d7b648dd90b35acb7468a0b2c1cc0c",
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
    "recordIdentity": "W2.2D-1          : SCHEMA FOUNDATION CLOSED / CANONICAL EVIDENCE",
    "anchor": "W2.2D-1          : SCHEMA FOUNDATION CLOSED / CANONICAL EVIDENCE — PR #1415 @ 80a11c2a",
    "expectedOldValue": "W2.2D-1          : SCHEMA FOUNDATION CLOSED / CANONICAL EVIDENCE — PR #1415 @ 80a11c2a\nW2.2D-1A         : CLOSED / CANONICAL EVIDENCE — test-only characterization PR #1660 @ 168daec7; runtime/schema etkisi yoktur\nW2.2D-2          : CLOSED / CANONICAL EVIDENCE — PR #1944 @ 6732ebcd; first-confirmation timestamp server-authoritative, immutable ve replay-stable; future CONFIRMED writer guard'ı + audit alignment + static inventory canonical; historical guessed backfill ve migration yok\nW2.2E            : NOT AUTHORIZED — W2.2D ATOMIC PROJECTION BOUNDARY PENDING\nW2.2             : ACTIVE — candidate/evidence/admission guard, D-1/D-1A foundation/evidence ve confirmedAt writer closed; atomic projection, idempotency ve legal-application runtime zinciri açık\nW2.3             : BLOCKED — W2.2 BOUNDARY PENDING\nFULL REMEDIATION : TASK 01 TPA-04C CLOSURE CLOSED; TASK 02 CURRENCY BOUNDARY CLOSED PR #1822 @ 43e3c1f9; TASK 03 AUTOMATION CONSUMER CLOSED PR #1828 @ 518d08a2; TASK 04 GOVERNANCE RECONCILIATION CLOSED; TASK 05 RC-COL-W2.2B-R01 CLOSED / CANONICAL EVIDENCE PR #1888 @ 35e215cd; TASK 06 RC-COL-W2.2C-6 CLOSED / CANONICAL EVIDENCE PR #1910 @ f986b8d7; TASK 07 RC-COL-W2.2D-2 CLOSED / CANONICAL EVIDENCE PR #1944 @ 6732ebcd; NEXT TASK 08 RC-COL-W2.2D-3 — OWNER GO-NEXT GRANTED / DESIGN-IMPLEMENTATION NOT STARTED",
    "newValue": "W2.2D-1          : SCHEMA FOUNDATION CLOSED / CANONICAL EVIDENCE — PR #1415 @ 80a11c2a\nW2.2D-1A         : CLOSED / CANONICAL EVIDENCE — test-only characterization PR #1660 @ 168daec7; runtime/schema etkisi yoktur\nW2.2D-2          : CLOSED / CANONICAL EVIDENCE — PR #1944 @ 6732ebcd; first-confirmation timestamp server-authoritative, immutable ve replay-stable; future CONFIRMED writer guard'ı + audit alignment + static inventory canonical; historical guessed backfill ve migration yok\nW2.2D-3          : CLOSED / CANONICAL EVIDENCE — PR #1969 @ 392e831c; bank eligibility, canonical Collection admission, financial/event/outbox effects, CAS match projection ve audit tek Prisma/PostgreSQL transaction'ında; rollback, replay ve concurrency evidence canonical; schema/migration yok\nW2.2E            : NOT AUTHORIZED — W2.2 IDEMPOTENCY / LEGAL-APPLICATION BOUNDARY PENDING\nW2.2             : ACTIVE — candidate/evidence/admission/confirmedAt/atomic projection zinciri closed; full semantic command hash ve legal-application runtime zinciri açık\nW2.3             : BLOCKED — W2.2 BOUNDARY PENDING\nFULL REMEDIATION : TASK 01 TPA-04C CLOSURE CLOSED; TASK 02 CURRENCY BOUNDARY CLOSED PR #1822 @ 43e3c1f9; TASK 03 AUTOMATION CONSUMER CLOSED PR #1828 @ 518d08a2; TASK 04 GOVERNANCE RECONCILIATION CLOSED; TASK 05 RC-COL-W2.2B-R01 CLOSED / CANONICAL EVIDENCE PR #1888 @ 35e215cd; TASK 06 RC-COL-W2.2C-6 CLOSED / CANONICAL EVIDENCE PR #1910 @ f986b8d7; TASK 07 RC-COL-W2.2D-2 CLOSED / CANONICAL EVIDENCE PR #1944 @ 6732ebcd; TASK 08 RC-COL-W2.2D-3 CLOSED / CANONICAL EVIDENCE PR #1969 @ 392e831c; NEXT TASK 09 RCV-COL-IDEM-01 — OWNER GO-NEXT GRANTED / IMPLEMENTATION NOT STARTED",
    "evidenceSha": "392e831c56d7b648dd90b35acb7468a0b2c1cc0c",
    "expectedResultSha256": "ac15c5758b51dd5d412572de2bee2c40bdd9f5ff7286eae6a124f907db68cbc4"
  },
  "declaredTargetAllowlist": [
    "project/docs/governance/COLLECTION-DECOMPOSITION.md"
  ]
}
```
<!-- GOV_COORD_REQUEST_JSON_END -->

Bu request semantic veya execution authority üretmez.
