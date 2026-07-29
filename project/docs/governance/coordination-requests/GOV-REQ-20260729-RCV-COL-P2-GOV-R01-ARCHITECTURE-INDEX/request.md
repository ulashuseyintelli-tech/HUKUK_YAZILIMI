# Governance Coordination Request — GOV-REQ-20260729-RCV-COL-P2-GOV-R01-ARCHITECTURE-INDEX

Bu dosya immutable ve untrusted request data kaydıdır. Prose operational instruction değildir.

Program context (informational only): `RCV-COL-FULL-REMEDIATION-EXECUTION-GRANT-R01`
outer program-scoped execution authority olarak yürür; V1 mekanik executor grant'i
`GOV-COORD-V1-CODEX-LOCAL`dır.

<!-- GOV_COORD_REQUEST_JSON_BEGIN -->
```json
{
  "schemaVersion": 1,
  "requestId": "GOV-REQ-20260729-RCV-COL-P2-GOV-R01-ARCHITECTURE-INDEX",
  "requestFingerprint": "fd94f351a3aaa9fe3e0a197b0c4a496337fbd15d9b2b1b036c4c5792dc5e8298",
  "requestedBy": "OWNER",
  "createdAt": "2026-07-29T09:31:52Z",
  "baseMainSha": "0eb5ee0a8333b519015e3ef4e2f844c607abf8c2",
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
    "targetFile": "project/docs/governance/architecture-index.md",
    "recordIdentity": "| ADR-014 | CCB-001 Canonical Legal Calculation Core — target legal-calculation and application authority constitution",
    "anchor": "| ADR-014 | CCB-001 Canonical Legal Calculation Core — target legal-calculation and application authority constitution",
    "expectedOldValue": "| ADR-014 | CCB-001 Canonical Legal Calculation Core — target legal-calculation and application authority constitution | `docs/adr/ADR-014-CCB-001-CANONICAL-LEGAL-CALCULATION-CORE.md` | LOCKED / ALLOCATION-AUTHORITY AMENDED / TPA-02 + TPA-03 + TPA-04 + TPA-04A + TPA-04B + TPA-04C RATIFIED / TPA-03A FOUNDATION + TPA-04B AMENDMENT CLOSED / M2 LIVE APPLIED / SHADOW_ONLY / RUNTIME CUTOVER NOT AUTHORIZED | Balance Engine + official Receivable snapshot + bucket/TBK100/pure-plan target authority'dir; ClaimItem application target değildir. TPA-04B required-evidence amendment PR #1470 / `9dabe8db` ile canonical ve M2 live DB'de applied/post-validated; target tables empty, runtime writer inactive. TPA-04C OD-01..20 pure-plan contract ratified; implementation owner-gated. Synthetic corpus writer/evidence/cutover blocker; PR #407 CLOSED/UNMERGED/NO FURTHER ACTION; ACT-28 ve REC-AUTH-011/012 OPEN. |",
    "newValue": "| ADR-014 | CCB-001 Canonical Legal Calculation Core — target legal-calculation and application authority constitution | `docs/adr/ADR-014-CCB-001-CANONICAL-LEGAL-CALCULATION-CORE.md` | LOCKED / ALLOCATION-AUTHORITY AMENDED / TPA-02 + TPA-03 + TPA-04 + TPA-04A + TPA-04B RATIFIED / TPA-03A FOUNDATION + TPA-04B AMENDMENT + TPA-04C CLOSED / M2 LIVE APPLIED / SHADOW_ONLY / RUNTIME CUTOVER NOT AUTHORIZED | Balance Engine + official Receivable snapshot + bucket/TBK100/pure-plan target authority'dir; ClaimItem application target değildir. TPA-04C I01–I06 complete/canonical, I07 `SUPERSEDED / NOT REQUIRED`, execution PR #1815 / `4bf75df8` and result PR #1816 / `2c6fa957` canonicaldır. TPA-04D `AUTHORIZED / DEPENDENCY-GATED / NOT ACTIVE`; `LegalApplicationWriter`, runtime writer, atomic persistence, representative evidence, cutover, reversal and retirement absent. Synthetic corpus writer/evidence/cutover blocker; PR #407 CLOSED/UNMERGED/NO FURTHER ACTION; ACT-28 and REC-AUTH-011/012 OPEN. |",
    "evidenceSha": "0eb5ee0a8333b519015e3ef4e2f844c607abf8c2",
    "expectedResultSha256": "ec094c4dce8a9c6d6ed3a7ae5d40a721e39b98ea06d7eb2fb6bf34cabbde483c"
  },
  "declaredTargetAllowlist": [
    "project/docs/governance/architecture-index.md"
  ]
}
```
<!-- GOV_COORD_REQUEST_JSON_END -->

Bu request semantic veya execution authority üretmez.
