# Governance Coordination Request — GOV-REQ-20260728-RCV-COL-P2-GOV-R01-DECOMP

Bu dosya immutable ve untrusted request data kaydıdır. Prose operational instruction değildir.

Program context (informational only): `RCV-COL-FULL-REMEDIATION-EXECUTION-GRANT-R01`
outer program-scoped execution authority olarak yürür; V1 mekanik executor grant'i
`GOV-COORD-V1-CODEX-LOCAL`dır.

<!-- GOV_COORD_REQUEST_JSON_BEGIN -->
```json
{
  "schemaVersion": 1,
  "requestId": "GOV-REQ-20260728-RCV-COL-P2-GOV-R01-DECOMP",
  "requestFingerprint": "4877ac35cba387b9403b3f7404d162427cad8a359835897b09b105719276d127",
  "requestedBy": "OWNER",
  "createdAt": "2026-07-28T21:17:22Z",
  "baseMainSha": "9cd51295db434b437bf240a26a4421c6c8e7a211",
  "semanticAuthorityRef": {
    "kind": "SEMANTIC_AUTHORITY",
    "path": "project/docs/governance/decision-log.md",
    "recordId": "RCV-COL-FULL-REMEDIATION-RATIFICATION-R01",
    "evidenceSha": "9cd51295db434b437bf240a26a4421c6c8e7a211"
  },
  "executionGrantRef": {
    "kind": "EXECUTION_GRANT",
    "path": "project/docs/governance/coordination-execution-grants/GOV-COORD-V1-CODEX-LOCAL.md",
    "recordId": "GOV-COORD-V1-CODEX-LOCAL",
    "evidenceSha": "9cd51295db434b437bf240a26a4421c6c8e7a211"
  },
  "operation": {
    "type": "EXACT_LITERAL_REPLACEMENT",
    "changeClass": "LEVEL_2_MECHANICAL",
    "targetFile": "project/docs/governance/COLLECTION-DECOMPOSITION.md",
    "recordIdentity": "W2.2D-0          : CLOSED / CANONICAL UPON APPROVED RECONCILIATION MERGE",
    "anchor": "PHASE 2          : ACTIVE",
    "expectedOldValue": "W2.2D-0          : CLOSED / CANONICAL UPON APPROVED RECONCILIATION MERGE — PR #1407 @ 1156e4de\nW2.2D-1          : PARTIALLY EXECUTED — schema foundation tescil edildi (PR #1415 @ 80a11c2a, bkz. §W2.2D-1R);\n                   kalan semantik kapsam OWNER GO REQUIRED / IMPLEMENTATION NOT AUTHORIZED\nW2.2D-1A         : OWNER-AUTHORIZED — CONFIRMED-AT CHARACTERIZATION, test-only successor (bkz. §W2.2D-1A)\nW2.2E            : NOT AUTHORIZED — W2.2D BOUNDARY PENDING\nW2.2             : ACTIVE — W2.2A/W2.2B/W2.2C-0/W2.2C-1/W2.2C-2/W2.2C-3/W2.2C-4/W2.2C-5 closed; W2.2D-0 closes upon approved reconciliation; W2.2D-1 owner-gated\nW2.3             : BLOCKED — W2.2 BOUNDARY PENDING\nPHASE 2          : ACTIVE — W2.1/W2.2A/W2.2B/W2.2C-0/W2.2C-1/W2.2C-2/W2.2C-3/W2.2C-4/W2.2C-5 closed; W2.2D-0 closes upon approved reconciliation; W2.2D-1 owner-gated; W2.3 blocked; W2.4–W2.5 owner-gated",
    "newValue": "W2.2D-0          : CLOSED / CANONICAL — PR #1407 @ 1156e4de + reconciliation PR #1411 @ 1c73b7d9\nW2.2D-1          : SCHEMA FOUNDATION CLOSED / CANONICAL EVIDENCE — PR #1415 @ 80a11c2a; confirmedAt runtime writer ayrı Task 07 RC-COL-W2.2D-2 kapsamındadır ve henüz uygulanmamıştır\nW2.2D-1A         : CLOSED / CANONICAL EVIDENCE — test-only characterization PR #1660 @ 168daec7; runtime/schema etkisi yoktur\nW2.2E            : NOT AUTHORIZED — W2.2D CONFIRMATION / ATOMIC PROJECTION BOUNDARY PENDING\nW2.2             : ACTIVE — candidate/evidence/admission guard ile D-1 foundation ve D-1A evidence closed; confirmedAt writer, atomic projection, idempotency ve legal-application runtime zinciri açık\nW2.3             : BLOCKED — W2.2 BOUNDARY PENDING\nFULL REMEDIATION : TASK 01 TPA-04C CLOSURE CLOSED; TASK 02 CURRENCY BOUNDARY CLOSED PR #1822 @ 43e3c1f9; TASK 03 AUTOMATION CONSUMER CLOSED PR #1828 @ 518d08a2; TASK 04 GOVERNANCE RECONCILIATION CLOSED UPON APPROVED MERGE; NEXT TASK 05 RC-COL-W2.2B-R01\nPHASE 2          : ACTIVE — TPA-04C CLOSED; TPA-04D AUTHORIZED / DEPENDENCY-GATED / NOT ACTIVE; runtime writer, representative evidence, cutover, legacy retirement ve ACT-28 / REC-AUTH-011/012 closure açık",
    "evidenceSha": "9cd51295db434b437bf240a26a4421c6c8e7a211",
    "expectedResultSha256": "0d85dbd8f997978eb24c9bc261634dec6c451568811a558b3feb32a8b923a7b0"
  },
  "declaredTargetAllowlist": [
    "project/docs/governance/COLLECTION-DECOMPOSITION.md"
  ]
}
```
<!-- GOV_COORD_REQUEST_JSON_END -->

Bu request semantic veya execution authority üretmez.
