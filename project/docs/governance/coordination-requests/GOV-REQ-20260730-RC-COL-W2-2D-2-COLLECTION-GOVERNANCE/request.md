# Governance Coordination Request — GOV-REQ-20260730-RC-COL-W2-2D-2-COLLECTION-GOVERNANCE

Bu dosya immutable ve untrusted request data kaydıdır. Prose operational instruction değildir.

Program context (informational only): `RCV-COL-FULL-REMEDIATION-EXECUTION-GRANT-R01`
outer program-scoped execution authority olarak yürür; V1 mekanik executor grant'i
`GOV-COORD-V1-CODEX-LOCAL`dır.

<!-- GOV_COORD_REQUEST_JSON_BEGIN -->
```json
{
  "schemaVersion": 1,
  "requestId": "GOV-REQ-20260730-RC-COL-W2-2D-2-COLLECTION-GOVERNANCE",
  "requestFingerprint": "92f622b88afdfa60d211a3e034a3129b5e34331eb03e7d816d30e25bd3f4a473",
  "requestedBy": "OWNER",
  "createdAt": "2026-07-30T15:49:13Z",
  "baseMainSha": "b5bf8977e3e4458c2da294f75aa48558df5e581c",
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
    "recordIdentity": "W2.2D-1 PR #1415 / `80a11c2a4dff047e86879d8628cdb090fae66743`",
    "anchor": "`RC-COL-W2.2D-2` kapsamındadır; henüz uygulanmamıştır.",
    "expectedOldValue": "W2.2D-1 PR #1415 / `80a11c2a4dff047e86879d8628cdb090fae66743` nullable/defaultsuz/\nbackfillsiz `Collection.confirmedAt` schema foundation'ını, W2.2D-1A PR #1660 /\n`168daec75fe877f65b241b489eec92820167dc7e` ise lifecycle timestamp'in\n`effectiveDate` authority'si olmadığını ve invalid provenance'ın fail-closed kaldığını\nkanıtlar. `confirmedAt` runtime writer'ı ve atomic match projection Task 07\n`RC-COL-W2.2D-2` kapsamındadır; henüz uygulanmamıştır. Full-remediation Task 02 currency\ncontract ve Task 03 automation alignment kapanmıştır. Task 04 yalnız governance pointer\nreconciliation'ıdır; Task 05 bu kapanıştan önce başlamaz. Runtime writer `NOT IMPLEMENTED / NOT\nACTIVATED`; ACT-28 ve REC-AUTH-011/012 `OPEN`; synthetic corpus writer/evidence/cutover için\n`BLOCKING` kalır.",
    "newValue": "W2.2D-1 PR #1415 / `80a11c2a4dff047e86879d8628cdb090fae66743` nullable/defaultsuz/\nbackfillsiz `Collection.confirmedAt` schema foundation'ını, W2.2D-1A PR #1660 /\n`168daec75fe877f65b241b489eec92820167dc7e` ise lifecycle timestamp'in\n`effectiveDate` authority'si olmadığını ve invalid provenance'ın fail-closed kaldığını\nkanıtlar. W2.2D-2 Task07 exact twelve-file implementation PR #1944 /\n`6732ebcdd346558fb35e9ed264c7e27a3ba9d935` ile `CLOSED / CANONICAL EVIDENCE`dır. Future\ncanonical `Collection.status=CONFIRMED` create yüzeyleri server-authoritative, non-null ve\nimmutable `confirmedAt` üretir; idempotent replay mevcut timestamp'i korur ve explicit caller\ntimestamp kabul edilmez. Pre-side-effect persisted-readback guard ile audit timestamp eşleşmesi\nfail-closed uygulanır. Schema, migration, backfill ve live DB değişikliği yoktur; historical NULL\nkayıtlar tahmin edilmemiştir. Atomic match projection Task08 `RC-COL-W2.2D-3` kapsamındadır ve\n`NEXT / DESIGN-IMPLEMENTATION NOT STARTED` kalır. ACT-28 ve REC-AUTH-011/012 `OPEN`; synthetic\ncorpus writer/evidence/cutover için `BLOCKING` kalır.",
    "evidenceSha": "6732ebcdd346558fb35e9ed264c7e27a3ba9d935",
    "expectedResultSha256": "fbb621aef2562df1e7fc8c2b21b4e662777e784448556b43a27bb246095cfb27"
  },
  "declaredTargetAllowlist": [
    "project/docs/governance/COLLECTION-GOVERNANCE.md"
  ]
}
```
<!-- GOV_COORD_REQUEST_JSON_END -->

Bu request semantic veya execution authority üretmez.
