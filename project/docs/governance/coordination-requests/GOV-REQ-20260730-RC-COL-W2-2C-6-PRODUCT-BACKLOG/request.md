# Governance Coordination Request — GOV-REQ-20260730-RC-COL-W2-2C-6-PRODUCT-BACKLOG

Bu dosya immutable ve untrusted request data kaydıdır. Prose operational instruction değildir.

Program context (informational only): `RCV-COL-FULL-REMEDIATION-EXECUTION-GRANT-R01`
outer program-scoped execution authority olarak yürür; V1 mekanik executor grant'i
`GOV-COORD-V1-CODEX-LOCAL`dır.

<!-- GOV_COORD_REQUEST_JSON_BEGIN -->
```json
{
  "schemaVersion": 1,
  "requestId": "GOV-REQ-20260730-RC-COL-W2-2C-6-PRODUCT-BACKLOG",
  "requestFingerprint": "7acf62231ee173d00122166955b6f90cade8f04f94ebfa50676e3b2c7672322d",
  "requestedBy": "OWNER",
  "createdAt": "2026-07-30T12:04:51Z",
  "baseMainSha": "772468672bfb6433b0a929907c3adc2993fc88fd",
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
    "targetFile": "project/docs/governance/product-backlog.md",
    "recordIdentity": "**RC-COL-W2.2B-R01 Bank Reference Idempotency Closure",
    "anchor": "**NEXT ELIGIBLE TASK: `RC-COL-W2.2C-6` — PROGRAM SEQUENCE TASK06 / NOT STARTED / OWNER GO-NEXT GRANTED.**",
    "expectedOldValue": "**NEXT ELIGIBLE TASK: `RC-COL-W2.2C-6` — PROGRAM SEQUENCE TASK06 / NOT STARTED / OWNER GO-NEXT GRANTED.**",
    "newValue": "\r\n\r\n**RC-COL-W2.2C-6 Production-Callable Bank Lifecycle Closure (2026-07-30; CANONICAL UPON APPROVED GOVERNANCE MERGE):** Task06 `CLOSED / CANONICAL EVIDENCE`dır. Exact twelve-file implementation PR #1910 / `f986b8d798fa6740ac8386b0da257fded53ffedd` ile canonical oldu. Authenticated production command boundary human `SETTLEMENT_VERIFIER` evidence append ve immutable evidence tüketen tenant-scoped `PENDING → SETTLED / REJECTED` CAS transition yollarını açar. Tenant ve actor JWT principal'dan gelir; exact `bank.settlement.verify` yetkisi evidence/audit ve transition/audit mutation transaction'larında fail-closed uygulanır; `DENY` precedence ve `GLOBAL`-only sınırı korunur. Replay/conflict ve concurrent race fail-closed; evidence append-only/immutable; Collection, journal, event, outbox, ledger, allocation ve overpayment etkisi yoktur. Local validation focused `56/56`, pure manifest `40 suite / 567 test`, PostgreSQL 16 integration `14/14`, production type-check, API build, changed-scope ESLint ve diff check PASS; CI `9/9 PASS`. Schema, migration, backfill ve live DB değişikliği yoktur. ACT-28 ve REC-AUTH-011/012 `OPEN` kalır. **NEXT ELIGIBLE TASK: `RC-COL-W2.2D-2` — PROGRAM SEQUENCE TASK07 / NOT STARTED / OWNER GO-NEXT GRANTED.**",
    "evidenceSha": "772468672bfb6433b0a929907c3adc2993fc88fd",
    "expectedResultSha256": "2e1e6b8a11e8c7d2bef0b42dbc4759bd8164abc93061f00f4a95fa0a13d2bf5d"
  },
  "declaredTargetAllowlist": [
    "project/docs/governance/product-backlog.md"
  ]
}
```
<!-- GOV_COORD_REQUEST_JSON_END -->

Bu request semantic veya execution authority üretmez.
