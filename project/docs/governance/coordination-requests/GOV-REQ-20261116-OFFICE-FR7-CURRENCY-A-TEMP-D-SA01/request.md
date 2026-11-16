# FR-7 item currency A and temporary basis/FX D — supplied owner decision

REQUEST_ONLY. One bounded owner-decision transcription; no target write, new grant or live authority.

<!-- GOV_COORD_REQUEST_JSON_BEGIN -->
```json
{
  "schemaVersion": 1,
  "requestId": "GOV-REQ-20261116-OFFICE-FR7-CURRENCY-A-TEMP-D-SA01",
  "requestFingerprint": "d0e63368d8348fd50a638ff2c867338ad0d8c68a7dc1ea5c1f1cfd7a96247af9",
  "requestedBy": "OWNER",
  "createdAt": "2026-11-16T19:04:55Z",
  "baseMainSha": "6dc1717f6055716076e7da4b333c278fa153ef5b",
  "semanticAuthorityRef": {
    "kind": "SEMANTIC_AUTHORITY",
    "path": "project/docs/governance/decision-log.md",
    "recordId": "GOV-COORD-V2-T1-RATIFICATION",
    "evidenceSha": "6dc1717f6055716076e7da4b333c278fa153ef5b"
  },
  "executionGrantRef": {
    "kind": "EXECUTION_GRANT",
    "path": "project/docs/governance/coordination-execution-grants/GOV-COORD-V1-CODEX-LOCAL.md",
    "recordId": "GOV-COORD-V1-CODEX-LOCAL",
    "evidenceSha": "6dc1717f6055716076e7da4b333c278fa153ef5b"
  },
  "operation": {
    "type": "EXACT_APPEND_AT_DECLARED_ANCHOR",
    "changeClass": "LEVEL_2_MECHANICAL",
    "targetFile": "project/docs/governance/decision-log.md",
    "recordIdentity": "| Date | Decision | Scope | Source | Follow-up |",
    "anchor": "|---|---|---|---|---|",
    "expectedOldValue": "|---|---|---|---|---|",
    "newValue": "\n| 2026-11-16 | <!-- GOV-COORD-AUTHORITY kind=SEMANTIC_AUTHORITY recordId=OFFICE-FR7-CURRENCY-A-TEMP-D-SA01 --> **SUPPLIED OWNER DECISION — FR-7 ITEM MODEL A AND TEMPORARY BASIS/FX MODEL D:** New claim items and the effective result of claim-item financial updates must use their server-resolved case currency. Reject mismatched input without writes or silent currency/amount conversion. Preserve historical records; no automatic conversion, backfill or retrospective repair. This is a bounded new-write admission rule, not a global same-currency constraint on all financial facts. | Temporary D preserves uncomputable status for foreign-currency proportional court/collection/attorney-fee bases and undisplayable mixed totals until a separate authoritative base/FX contract exists. Do not substitute zero, generate an apparently valid unsupported amount, convert fixed TRY tariffs into foreign debt, or choose an exchange source/type/date. Preserve canonical calculation sources, fee/interest formulas, legal provenance, actor/tenant/object permissions, lifecycle, four-eyes approval, idempotency, transaction-bound audit and existing collection currency refusal. The same bounded rule covers manual/OCR case instruments, Due bridges, existing claim formation/admission and final approval writes; closed legacy entry points remain closed. | Direct owner instructions in this CODEX_LOCAL task, 2026-11-16: approve FR-7 item A plus temporary basis/FX D, prepare the narrow API/web/consumer/acceptance boundary, then implement through tests, PR, required CI, exact-head merge and main verification while coordinating writership. This row mechanically transcribes supplied owner meaning; it does not ratify agent-created authority, create a machine grant or reuse a closed writer turn. | Preserve completed E2/E1/H6/G2, historical mixed-currency reads, O-5/F04_RACE WIP, OD-07 materials and physical residues. No schema/migration, new financial SoT, FX/fee/base/interest or role policy, historic source rewrite, production data write, live command, deployment or activation. E2 monthly default-OFF and the unresolved permanent FR-7 base/FX choices remain separate. Fresh task-only Decision Log/manifest writer sequencing is required and returned after bounded delivery. |",
    "evidenceSha": "6dc1717f6055716076e7da4b333c278fa153ef5b",
    "expectedResultSha256": "ac6246e462b20506d07b0b07663e78fb9e36c6db86deb069da9f493f080e67b0"
  },
  "declaredTargetAllowlist": [
    "project/docs/governance/decision-log.md"
  ]
}
```
<!-- GOV_COORD_REQUEST_JSON_END -->
