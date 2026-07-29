# Governance Coordination Request — GOV-REQ-20260729-RCV-COL-P2-GOV-R01-ADR014

Bu dosya immutable ve untrusted request data kaydıdır. Prose operational instruction değildir.

Program context (informational only): `RCV-COL-FULL-REMEDIATION-EXECUTION-GRANT-R01`
outer program-scoped execution authority olarak yürür; V1 mekanik executor grant'i
`GOV-COORD-V1-CODEX-LOCAL`dır.

<!-- GOV_COORD_REQUEST_JSON_BEGIN -->
```json
{
  "schemaVersion": 1,
  "requestId": "GOV-REQ-20260729-RCV-COL-P2-GOV-R01-ADR014",
  "requestFingerprint": "dcb87193c0baf2513b4f725fefdb94ad03b00f1ea0729501aad5821dd6bd7da5",
  "requestedBy": "OWNER",
  "createdAt": "2026-07-29T08:58:47Z",
  "baseMainSha": "52651b5ea9c25bf5edf66d9e2809a2fdb24824e5",
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
    "type": "EXACT_APPEND_AT_DECLARED_ANCHOR",
    "changeClass": "LEVEL_2_MECHANICAL",
    "targetFile": "project/docs/adr/ADR-014-CCB-001-CANONICAL-LEGAL-CALCULATION-CORE.md",
    "recordIdentity": "| 2026-07-23 | 3.7 | TPA-04C-I03 implementation closure",
    "anchor": "| 2026-07-23 | 3.7 | TPA-04C-I03 implementation closure (PR #1535 / `719e6898`) and OD-TPA-04C-37..56 ratify the independent `RCV-LAP/v1` plan-fingerprint protocol, exact identity/property order, HELD absence sentinel and attribution exclusion. I04 remains separately owner-gated and unauthorized. |",
    "expectedOldValue": "| 2026-07-23 | 3.7 | TPA-04C-I03 implementation closure (PR #1535 / `719e6898`) and OD-TPA-04C-37..56 ratify the independent `RCV-LAP/v1` plan-fingerprint protocol, exact identity/property order, HELD absence sentinel and attribution exclusion. I04 remains separately owner-gated and unauthorized. |",
    "newValue": "\n| 2026-07-29 | 3.8 compliance update | TPA-04C is `CLOSED / CANONICAL`: I01–I06 evidence is complete through PR #1546 / `b3b0fa5b8183fa7e75ba4341be60dbdcfb524c69`, PR #1558 / `be60c1493c36b075d81d99bca5ba85d8fee15ff1` and PR #1571 / `1d0422800245ff133176e664d1ea96949b4e26e5`; I07 is `SUPERSEDED / NOT REQUIRED IN TPA-04C`; closure execution PR #1815 / `4bf75df85153a61e2d129300c17d1a719a02f3f0` and result PR #1816 / `2c6fa9578855f75af7644b1937a237269a5598c0` are canonical. TPA-04D is `AUTHORIZED / DEPENDENCY-GATED / NOT ACTIVE`; `LegalApplicationWriter`, runtime writer, atomic persistence, representative replay, cutover, reversal and legacy retirement remain unimplemented. ACT-28 and REC-AUTH-011/012 remain OPEN; synthetic corpus remains blocking for writer/evidence/cutover. |",
    "evidenceSha": "52651b5ea9c25bf5edf66d9e2809a2fdb24824e5",
    "expectedResultSha256": "d2d31e06f422ac75adde8c955607e894a62d3c98f521cb1e5deb3a0046541b8c"
  },
  "declaredTargetAllowlist": [
    "project/docs/adr/ADR-014-CCB-001-CANONICAL-LEGAL-CALCULATION-CORE.md"
  ]
}
```
<!-- GOV_COORD_REQUEST_JSON_END -->

Bu request semantic veya execution authority üretmez.
