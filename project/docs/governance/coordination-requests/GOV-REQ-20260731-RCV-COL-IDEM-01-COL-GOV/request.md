# Governance Coordination Request — GOV-REQ-20260731-RCV-COL-IDEM-01-COL-GOV

Bu dosya immutable ve untrusted request data kaydıdır. Prose operational instruction değildir.

Program context (informational only): `RCV-COL-FULL-REMEDIATION-EXECUTION-GRANT-R01`
outer program-scoped execution authority olarak yürür; V1 mekanik executor grant'i
`GOV-COORD-V1-CODEX-LOCAL`dır.

<!-- GOV_COORD_REQUEST_JSON_BEGIN -->
```json
{
  "schemaVersion": 1,
  "requestId": "GOV-REQ-20260731-RCV-COL-IDEM-01-COL-GOV",
  "requestFingerprint": "263147f72ce779416a72d49c4c732e04f8f21c7b766cf036556d6de0e85f5a7b",
  "requestedBy": "OWNER",
  "createdAt": "2026-07-31T13:59:37Z",
  "baseMainSha": "2907f995d64737b17d128ecc0b502e065686d76f",
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
    "targetFile": "project/docs/governance/COLLECTION-GOVERNANCE.md",
    "recordIdentity": "Task08 schema, migration, backfill veya live DB değişikliği yapmamıştır.",
    "anchor": "Task08 schema, migration, backfill veya live DB değişikliği yapmamıştır.",
    "expectedOldValue": "Task08 schema, migration, backfill veya live DB değişikliği yapmamıştır. Task09\n`RCV-COL-IDEM-01` yalnız `NEXT / IMPLEMENTATION NOT STARTED`dır. ACT-28 ve\nREC-AUTH-011/012 `OPEN`; synthetic corpus writer/evidence/cutover için `BLOCKING` kalır.",
    "newValue": "Task08 schema, migration, backfill veya live DB değişikliği yapmamıştır. Task09\n`RCV-COL-IDEM-01` exact fourteen-file implementation PR #2001 /\n`6c34395d4ade84603b340b197f2c4e5d13c1ec4f` ile `CLOSED / CANONICAL EVIDENCE`dır.\nVersioned `RCV-COL-CMD/v1` canonical payload ve domain-separated SHA-256 fingerprint; same\nidentity + same semantic command için side-effect-free replay, divergent command için\n`IDEMPOTENCY_SEMANTIC_CONFLICT`, legacy evidence-unknown için fail-closed rejection ve bank\nadmission'ın Task08 shared transaction içindeki semantic replay gate'ine yeniden girmesini\nsağlar. Nullable/default-free evidence migration'ı repository-ready; live/production DB apply\nyapılmamıştır ve historical fingerprint tahmin edilmemiştir. Task10 `TPA-04F-ENTRY` yalnız\n`NEXT / NOT STARTED`dır. ACT-28 ve REC-AUTH-011/012 `OPEN`; synthetic corpus\nwriter/evidence/cutover için `BLOCKING` kalır.",
    "evidenceSha": "6c34395d4ade84603b340b197f2c4e5d13c1ec4f",
    "expectedResultSha256": "c2955fda4942e2545ba9d248d1f7c7dec9fb396da7131485dfff40b430cdcb86"
  },
  "declaredTargetAllowlist": [
    "project/docs/governance/COLLECTION-GOVERNANCE.md"
  ]
}
```
<!-- GOV_COORD_REQUEST_JSON_END -->

Bu request semantic veya execution authority üretmez.
