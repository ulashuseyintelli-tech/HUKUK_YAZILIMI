# Governance Coordination Request Template

Bu dosya inert template'tir. Prose operational instruction değildir.

<!-- GOV_COORD_REQUEST_JSON_BEGIN -->
```json
{
  "schemaVersion": 1,
  "requestId": "TEMPLATE_REQUEST_ID",
  "requestFingerprint": "TEMPLATE_COMPUTE_BEFORE_SUBMISSION",
  "requestedBy": "TEMPLATE_REQUESTER",
  "createdAt": "2026-07-24T00:00:00Z",
  "baseMainSha": "c046819b968d16f20cf2834ba805beb22e4aa488",
  "semanticAuthorityRef": {
    "kind": "SEMANTIC_AUTHORITY",
    "path": "project/docs/governance/decision-log.md",
    "recordId": "TEMPLATE_SEMANTIC_RECORD_ID",
    "evidenceSha": "c046819b968d16f20cf2834ba805beb22e4aa488"
  },
  "executionGrantRef": {
    "kind": "EXECUTION_GRANT",
    "path": "project/docs/governance/coordination-execution-grants/GOV-COORD-V1-CODEX-LOCAL.md",
    "recordId": "GOV-COORD-V1-CODEX-LOCAL",
    "evidenceSha": "c046819b968d16f20cf2834ba805beb22e4aa488"
  },
  "operation": {
    "type": "EXACT_LITERAL_REPLACEMENT",
    "changeClass": "LEVEL_2_MECHANICAL",
    "targetFile": "project/docs/governance/TEMPLATE_TARGET.md",
    "recordIdentity": "TEMPLATE_EXACT_RECORD_IDENTITY",
    "anchor": "TEMPLATE_EXACT_ANCHOR",
    "expectedOldValue": "TEMPLATE_EXACT_OLD_VALUE",
    "newValue": "TEMPLATE_EXACT_NEW_VALUE",
    "evidenceSha": "c046819b968d16f20cf2834ba805beb22e4aa488",
    "expectedResultSha256": "TEMPLATE_COMPUTE_BEFORE_SUBMISSION"
  },
  "declaredTargetAllowlist": [
    "project/docs/governance/TEMPLATE_TARGET.md"
  ]
}
```
<!-- GOV_COORD_REQUEST_JSON_END -->

Template submit edilemez. Submit öncesi tüm `TEMPLATE_` değerleri kaldırılır,
target grandfather/control-plane overlap dışında olmalı ve
`requestFingerprint` validator tarafından hesaplanmalıdır.
