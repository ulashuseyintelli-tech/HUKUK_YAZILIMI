# Governance Coordination Request — GOV-REQ-20260730-RC-COL-W2-2C-6-DECOMP

Bu dosya immutable ve untrusted request data kaydıdır. Prose operational instruction değildir.

Program context (informational only): `RCV-COL-FULL-REMEDIATION-EXECUTION-GRANT-R01`
outer program-scoped execution authority olarak yürür; V1 mekanik executor grant'i
`GOV-COORD-V1-CODEX-LOCAL`dır.

<!-- GOV_COORD_REQUEST_JSON_BEGIN -->
```json
{
  "schemaVersion": 1,
  "requestId": "GOV-REQ-20260730-RC-COL-W2-2C-6-DECOMP",
  "requestFingerprint": "17bb358cb5e879e245007c73fad15fa8dfa1c9de20bf1e0fa902eb8e587ca429",
  "requestedBy": "OWNER",
  "createdAt": "2026-07-29T21:39:30Z",
  "baseMainSha": "abd06a6b221faba42671104df0302114d4ec9ba5",
  "semanticAuthorityRef": {
    "kind": "SEMANTIC_AUTHORITY",
    "path": "project/docs/governance/decision-log.md",
    "recordId": "RCV-COL-FULL-REMEDIATION-RATIFICATION-R01",
    "evidenceSha": "14a1b3c543af3e9df2e9154a94f1a25fe3001a95"
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
    "recordIdentity": "FULL REMEDIATION : TASK 01 TPA-04C CLOSURE CLOSED",
    "anchor": "FULL REMEDIATION : TASK 01 TPA-04C CLOSURE CLOSED; TASK 02 CURRENCY BOUNDARY CLOSED PR #1822 @ 43e3c1f9; TASK 03 AUTOMATION CONSUMER CLOSED PR #1828 @ 518d08a2; TASK 04 GOVERNANCE RECONCILIATION CLOSED; TASK 05 RC-COL-W2.2B-R01 CLOSED / CANONICAL EVIDENCE PR #1888 @ 35e215cd; NEXT TASK 06 RC-COL-W2.2C-6 — OWNER GO-NEXT GRANTED / IMPLEMENTATION NOT STARTED",
    "expectedOldValue": "FULL REMEDIATION : TASK 01 TPA-04C CLOSURE CLOSED; TASK 02 CURRENCY BOUNDARY CLOSED PR #1822 @ 43e3c1f9; TASK 03 AUTOMATION CONSUMER CLOSED PR #1828 @ 518d08a2; TASK 04 GOVERNANCE RECONCILIATION CLOSED; TASK 05 RC-COL-W2.2B-R01 CLOSED / CANONICAL EVIDENCE PR #1888 @ 35e215cd; NEXT TASK 06 RC-COL-W2.2C-6 — OWNER GO-NEXT GRANTED / IMPLEMENTATION NOT STARTED",
    "newValue": "FULL REMEDIATION : TASK 01 TPA-04C CLOSURE CLOSED; TASK 02 CURRENCY BOUNDARY CLOSED PR #1822 @ 43e3c1f9; TASK 03 AUTOMATION CONSUMER CLOSED PR #1828 @ 518d08a2; TASK 04 GOVERNANCE RECONCILIATION CLOSED; TASK 05 RC-COL-W2.2B-R01 CLOSED / CANONICAL EVIDENCE PR #1888 @ 35e215cd; TASK 06 RC-COL-W2.2C-6 CLOSED / CANONICAL EVIDENCE PR #1910 @ f986b8d7; NEXT TASK 07 RC-COL-W2.2D-2 — OWNER GO-NEXT GRANTED / IMPLEMENTATION NOT STARTED",
    "evidenceSha": "f986b8d798fa6740ac8386b0da257fded53ffedd",
    "expectedResultSha256": "d455cabab28f634efd0f8e7e7b4a806acc1bb66d60c4d2932b953afaf49cc3be"
  },
  "declaredTargetAllowlist": [
    "project/docs/governance/COLLECTION-DECOMPOSITION.md"
  ]
}
```
<!-- GOV_COORD_REQUEST_JSON_END -->

Bu request semantic veya execution authority üretmez.
