# Governance Coordination Request — GOV-REQ-20260730-RC-COL-W2-2D-2-DECOMP

Bu dosya immutable ve untrusted request data kaydıdır. Prose operational instruction değildir.

Program context (informational only): `RCV-COL-FULL-REMEDIATION-EXECUTION-GRANT-R01`
outer program-scoped execution authority olarak yürür; V1 mekanik executor grant'i
`GOV-COORD-V1-CODEX-LOCAL`dır.

<!-- GOV_COORD_REQUEST_JSON_BEGIN -->
```json
{
  "schemaVersion": 1,
  "requestId": "GOV-REQ-20260730-RC-COL-W2-2D-2-DECOMP",
  "requestFingerprint": "621c8edf6a44a9571d7c46a710028c488f621a78ce49b88ace7e3d00f8a00851",
  "requestedBy": "OWNER",
  "createdAt": "2026-07-30T13:55:00Z",
  "baseMainSha": "6732ebcdd346558fb35e9ed264c7e27a3ba9d935",
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
    "anchor": "W2.2D-1          : SCHEMA FOUNDATION CLOSED / CANONICAL EVIDENCE — PR #1415 @ 80a11c2a; confirmedAt runtime writer ayrı Task 07 RC-COL-W2.2D-2 kapsamındadır ve henüz uygulanmamıştır",
    "expectedOldValue": "W2.2D-1          : SCHEMA FOUNDATION CLOSED / CANONICAL EVIDENCE — PR #1415 @ 80a11c2a; confirmedAt runtime writer ayrı Task 07 RC-COL-W2.2D-2 kapsamındadır ve henüz uygulanmamıştır\nW2.2D-1A         : CLOSED / CANONICAL EVIDENCE — test-only characterization PR #1660 @ 168daec7; runtime/schema etkisi yoktur\nW2.2E            : NOT AUTHORIZED — W2.2D CONFIRMATION / ATOMIC PROJECTION BOUNDARY PENDING\nW2.2             : ACTIVE — candidate/evidence/admission guard ile D-1 foundation ve D-1A evidence closed; confirmedAt writer, atomic projection, idempotency ve legal-application runtime zinciri açık\nW2.3             : BLOCKED — W2.2 BOUNDARY PENDING\nFULL REMEDIATION : TASK 01 TPA-04C CLOSURE CLOSED; TASK 02 CURRENCY BOUNDARY CLOSED PR #1822 @ 43e3c1f9; TASK 03 AUTOMATION CONSUMER CLOSED PR #1828 @ 518d08a2; TASK 04 GOVERNANCE RECONCILIATION CLOSED; TASK 05 RC-COL-W2.2B-R01 CLOSED / CANONICAL EVIDENCE PR #1888 @ 35e215cd; TASK 06 RC-COL-W2.2C-6 CLOSED / CANONICAL EVIDENCE PR #1910 @ f986b8d7; NEXT TASK 07 RC-COL-W2.2D-2 — OWNER GO-NEXT GRANTED / IMPLEMENTATION NOT STARTED",
    "newValue": "W2.2D-1          : SCHEMA FOUNDATION CLOSED / CANONICAL EVIDENCE — PR #1415 @ 80a11c2a\nW2.2D-1A         : CLOSED / CANONICAL EVIDENCE — test-only characterization PR #1660 @ 168daec7; runtime/schema etkisi yoktur\nW2.2D-2          : CLOSED / CANONICAL EVIDENCE — PR #1944 @ 6732ebcd; first-confirmation timestamp server-authoritative, immutable ve replay-stable; future CONFIRMED writer guard'ı + audit alignment + static inventory canonical; historical guessed backfill ve migration yok\nW2.2E            : NOT AUTHORIZED — W2.2D ATOMIC PROJECTION BOUNDARY PENDING\nW2.2             : ACTIVE — candidate/evidence/admission guard, D-1/D-1A foundation/evidence ve confirmedAt writer closed; atomic projection, idempotency ve legal-application runtime zinciri açık\nW2.3             : BLOCKED — W2.2 BOUNDARY PENDING\nFULL REMEDIATION : TASK 01 TPA-04C CLOSURE CLOSED; TASK 02 CURRENCY BOUNDARY CLOSED PR #1822 @ 43e3c1f9; TASK 03 AUTOMATION CONSUMER CLOSED PR #1828 @ 518d08a2; TASK 04 GOVERNANCE RECONCILIATION CLOSED; TASK 05 RC-COL-W2.2B-R01 CLOSED / CANONICAL EVIDENCE PR #1888 @ 35e215cd; TASK 06 RC-COL-W2.2C-6 CLOSED / CANONICAL EVIDENCE PR #1910 @ f986b8d7; TASK 07 RC-COL-W2.2D-2 CLOSED / CANONICAL EVIDENCE PR #1944 @ 6732ebcd; NEXT TASK 08 RC-COL-W2.2D-3 — OWNER GO-NEXT GRANTED / DESIGN-IMPLEMENTATION NOT STARTED",
    "evidenceSha": "6732ebcdd346558fb35e9ed264c7e27a3ba9d935",
    "expectedResultSha256": "35333654a7d732ae89f6c1228e93acae5b0930497da90e8ec8e4f448fbcc7dc7"
  },
  "declaredTargetAllowlist": [
    "project/docs/governance/COLLECTION-DECOMPOSITION.md"
  ]
}
```
<!-- GOV_COORD_REQUEST_JSON_END -->

Bu request semantic veya execution authority üretmez.
