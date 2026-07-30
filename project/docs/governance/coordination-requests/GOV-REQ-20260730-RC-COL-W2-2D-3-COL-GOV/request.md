# Governance Coordination Request — GOV-REQ-20260730-RC-COL-W2-2D-3-COL-GOV

Bu dosya immutable ve untrusted request data kaydıdır. Prose operational instruction değildir.

Program context (informational only): `RCV-COL-FULL-REMEDIATION-EXECUTION-GRANT-R01`
outer program-scoped execution authority olarak yürür; V1 mekanik executor grant'i
`GOV-COORD-V1-CODEX-LOCAL`dır.

<!-- GOV_COORD_REQUEST_JSON_BEGIN -->
```json
{
  "schemaVersion": 1,
  "requestId": "GOV-REQ-20260730-RC-COL-W2-2D-3-COL-GOV",
  "requestFingerprint": "b3e9c68073636c5e30336fa9d4be08ee92b8f0d5a0392d1a0bd32679cce64359",
  "requestedBy": "OWNER",
  "createdAt": "2026-07-30T19:48:06Z",
  "baseMainSha": "f26bab1f9ac93b6d3f113d82fac845bc6ac6341b",
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
    "recordIdentity": "RC-COL-W2.2D-3",
    "anchor": "W2.2D-1 PR #1415",
    "expectedOldValue": "W2.2D-1 PR #1415 / `80a11c2a4dff047e86879d8628cdb090fae66743` nullable/defaultsuz/\nbackfillsiz `Collection.confirmedAt` schema foundation'ını, W2.2D-1A PR #1660 /\n`168daec75fe877f65b241b489eec92820167dc7e` ise lifecycle timestamp'in\n`effectiveDate` authority'si olmadığını ve invalid provenance'ın fail-closed kaldığını\nkanıtlar. W2.2D-2 Task07 exact twelve-file implementation PR #1944 /\n`6732ebcdd346558fb35e9ed264c7e27a3ba9d935` ile `CLOSED / CANONICAL EVIDENCE`dır. Future\ncanonical `Collection.status=CONFIRMED` create yüzeyleri server-authoritative, non-null ve\nimmutable `confirmedAt` üretir; idempotent replay mevcut timestamp'i korur ve explicit caller\ntimestamp kabul edilmez. Pre-side-effect persisted-readback guard ile audit timestamp eşleşmesi\nfail-closed uygulanır. Schema, migration, backfill ve live DB değişikliği yoktur; historical NULL\nkayıtlar tahmin edilmemiştir. Atomic match projection Task08 `RC-COL-W2.2D-3` kapsamındadır ve\n`NEXT / DESIGN-IMPLEMENTATION NOT STARTED` kalır. ACT-28 ve REC-AUTH-011/012 `OPEN`; synthetic\ncorpus writer/evidence/cutover için `BLOCKING` kalır.",
    "newValue": "W2.2D-1 PR #1415 / `80a11c2a4dff047e86879d8628cdb090fae66743` nullable/defaultsuz/\nbackfillsiz `Collection.confirmedAt` schema foundation'ını, W2.2D-1A PR #1660 /\n`168daec75fe877f65b241b489eec92820167dc7e` ise lifecycle timestamp'in\n`effectiveDate` authority'si olmadığını ve invalid provenance'ın fail-closed kaldığını\nkanıtlar. W2.2D-2 Task07 exact twelve-file implementation PR #1944 /\n`6732ebcdd346558fb35e9ed264c7e27a3ba9d935` ile `CLOSED / CANONICAL EVIDENCE`dır. Future\ncanonical `Collection.status=CONFIRMED` create yüzeyleri server-authoritative, non-null ve\nimmutable `confirmedAt` üretir; idempotent replay mevcut timestamp'i korur ve explicit caller\ntimestamp kabul edilmez. Pre-side-effect persisted-readback guard ile audit timestamp eşleşmesi\nfail-closed uygulanır. W2.2D-3 Task08 exact six-file implementation PR #1969 /\n`392e831c56d7b648dd90b35acb7468a0b2c1cc0c` ile `CLOSED / CANONICAL EVIDENCE`dır. Bank\neligibility doğrulaması, canonical Collection admission ve finansal/event/outbox etkileri,\n`matchedCollectionId` CAS projection'ı ve audit aynı Prisma/PostgreSQL transaction'ında atomik\nçalışır; rollback, deterministic replay/target-conflict ve concurrent single-winner kanıtları\nmevcuttur. Task08 schema, migration, backfill veya live DB değişikliği yapmamıştır. Task09\n`RCV-COL-IDEM-01` yalnız `NEXT / IMPLEMENTATION NOT STARTED`dır. ACT-28 ve\nREC-AUTH-011/012 `OPEN`; synthetic corpus writer/evidence/cutover için `BLOCKING` kalır.",
    "evidenceSha": "392e831c56d7b648dd90b35acb7468a0b2c1cc0c",
    "expectedResultSha256": "b68790aa6e1234bb033f42ee5352d64196378fef25a58df3015ea128d1443a89"
  },
  "declaredTargetAllowlist": [
    "project/docs/governance/COLLECTION-GOVERNANCE.md"
  ]
}
```
<!-- GOV_COORD_REQUEST_JSON_END -->

Bu request semantic veya execution authority üretmez.
