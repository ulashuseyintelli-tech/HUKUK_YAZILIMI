# CL-R08 — eg request

Only the existing supplied owner decision is mechanically registered. Fresh task writer assignment covers only the Decision Log row and two specified references; prior closed turns are not reused. Product #3200 remains separately gated. No live operation, shared template/ledger change or broader portal authority.

<!-- GOV_COORD_REQUEST_JSON_BEGIN -->
```json
{
  "schemaVersion": 1,
  "requestId": "GOV-REQ-20261111-CLIENT-STATEMENT-READY-CLR08-EG-CREATE",
  "requestFingerprint": "bb2d0b351b24688cd6112ab693a257cf392423b1ea480cf3532a8cc94bb38b34",
  "requestedBy": "CODEX_LOCAL",
  "createdAt": "2026-11-11T21:29:32Z",
  "baseMainSha": "4c6c3f8b61915616d4f528e5869e22223e45fa29",
  "semanticAuthorityRef": {
    "kind": "SEMANTIC_AUTHORITY",
    "path": "project/docs/governance/decision-log.md",
    "recordId": "CLIENT-STATEMENT-READY-CLR08-SA01",
    "evidenceSha": "4c6c3f8b61915616d4f528e5869e22223e45fa29"
  },
  "executionGrantRef": {
    "kind": "EXECUTION_GRANT",
    "path": "project/docs/governance/coordination-execution-grants/GOV-COORD-V1-CODEX-LOCAL.md",
    "recordId": "GOV-COORD-V1-CODEX-LOCAL",
    "evidenceSha": "4c6c3f8b61915616d4f528e5869e22223e45fa29"
  },
  "operation": {
    "type": "EXACT_FILE_CREATION",
    "changeClass": "LEVEL_2_MECHANICAL",
    "targetFile": "project/docs/governance/coordination-execution-grants/CLIENT-STATEMENT-READY-CLR08-EG01.md",
    "recordIdentity": "CLIENT-STATEMENT-READY-CLR08-REFERENCES",
    "anchor": "974b01d2d1d343f51ee9aafb0eaf7806d84579dbae6320e9f36d780c8e4435fa",
    "expectedOldValue": "ABSENT",
    "newValue": "# CL-R08 — exact owner-approved Charter/CAD scope references\n\n<!-- GOV-COORD-AUTHORITY kind=EXECUTION_GRANT recordId=CLIENT-STATEMENT-READY-CLR08-EG01 -->\n\nMechanical materialization of the supplied CL-R08 owner GO and canonical CLIENT-STATEMENT-READY-CLR08-SA01. Exactly the two approved scope-reference additions; no automatic replacement message, portal/aggregate permission, historical acceptance reopening or shared template/ledger change. This record does not create/expand owner authority. Fresh direct-owner writer assignment is recorded in #2750 comment 6801519307.\n\n<!-- GOV_COORD_GENERIC_EXECUTION_GRANT_JSON_BEGIN -->\n```json\n{\n  \"schemaVersion\": 1,\n  \"taskId\": \"CLIENT-STATEMENT-READY-CLR08-REFERENCES\",\n  \"semanticAuthorityId\": \"CLIENT-STATEMENT-READY-CLR08-SA01\",\n  \"executionGrantId\": \"CLIENT-STATEMENT-READY-CLR08-EG01\",\n  \"grantNonce\": \"974b01d2d1d343f51ee9aafb0eaf7806d84579dbae6320e9f36d780c8e4435fa\",\n  \"baseSha\": \"4c6c3f8b61915616d4f528e5869e22223e45fa29\",\n  \"publicationBindingSha\": \"4c6c3f8b61915616d4f528e5869e22223e45fa29\",\n  \"executionMode\": \"EXACT_REGISTERED_CHANGESET\",\n  \"effectiveFrom\": \"2026-11-11T21:29:32Z\",\n  \"expiresAt\": \"2026-11-18T21:29:32Z\",\n  \"modifiedPaths\": [\n    {\n      \"path\": \"project/docs/governance/CLIENT-ACCOUNTING-DELIVERY-AND-OFFICE-UX-PROGRAM-R01/MASTER-PLAN.md\",\n      \"expectedBaseMode\": \"100644\",\n      \"expectedBaseSha256\": \"b9174d9e64828efa5dfc9888e0a8a5faa17ad2a84696d75cebc7173adcbf1509\",\n      \"expectedResultMode\": \"100644\",\n      \"expectedResultSha256\": \"fc62415f2ce5240d137c7cb9d5e79d1284df78de07d52470fdc0695e390f81d6\"\n    },\n    {\n      \"path\": \"project/docs/governance/CLIENT-GOVERNANCE-CHARTER.md\",\n      \"expectedBaseMode\": \"100644\",\n      \"expectedBaseSha256\": \"c89d7825f06f28a14f3bd13b6de6a6f63ed7fb592e3045d36576617facd86700\",\n      \"expectedResultMode\": \"100644\",\n      \"expectedResultSha256\": \"7bcf44c7e7c2448ee7a197e603592d92005a94d6c2fa05e21625590fbf6b3e8d\"\n    }\n  ],\n  \"createdPaths\": [],\n  \"expectedResultSha256\": \"a9c9569a61f4e480ecdae6416d81043ae05f50810170e6ccedc83a5ce5db3b70\"\n}\n```\n<!-- GOV_COORD_GENERIC_EXECUTION_GRANT_JSON_END -->\n",
    "evidenceSha": "4c6c3f8b61915616d4f528e5869e22223e45fa29",
    "expectedResultSha256": "10c99bf708f8ce1dfcaf20308558c0779f01f925e04e090166be728855746dbb"
  },
  "declaredTargetAllowlist": [
    "project/docs/governance/coordination-execution-grants/CLIENT-STATEMENT-READY-CLR08-EG01.md"
  ]
}
```
<!-- GOV_COORD_REQUEST_JSON_END -->
