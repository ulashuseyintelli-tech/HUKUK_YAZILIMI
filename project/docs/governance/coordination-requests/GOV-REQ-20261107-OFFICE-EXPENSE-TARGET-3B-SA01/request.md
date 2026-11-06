# Office/Client 3b — supplied canonical expense target decision

Request-only; no protected target is written. New narrow writer sequencing is required. Earlier closed turns are not reused.

<!-- GOV_COORD_REQUEST_JSON_BEGIN -->
```json
{
  "schemaVersion": 1,
  "requestId": "GOV-REQ-20261107-OFFICE-EXPENSE-TARGET-3B-SA01",
  "requestFingerprint": "2b2d13588d494589b062523a00ea59e0c7fbb285527a668c37227030308f6906",
  "requestedBy": "CODEX_LOCAL",
  "createdAt": "2026-11-06T21:29:58Z",
  "baseMainSha": "6eab28d5fcf9e08e4ecc23b353bff6299ca8a0af",
  "semanticAuthorityRef": {
    "kind": "SEMANTIC_AUTHORITY",
    "path": "project/docs/governance/decision-log.md",
    "recordId": "GOV-COORD-V2-T1-RATIFICATION",
    "evidenceSha": "6eab28d5fcf9e08e4ecc23b353bff6299ca8a0af"
  },
  "executionGrantRef": {
    "kind": "EXECUTION_GRANT",
    "path": "project/docs/governance/coordination-execution-grants/GOV-COORD-V1-CODEX-LOCAL.md",
    "recordId": "GOV-COORD-V1-CODEX-LOCAL",
    "evidenceSha": "6eab28d5fcf9e08e4ecc23b353bff6299ca8a0af"
  },
  "operation": {
    "type": "EXACT_APPEND_AT_DECLARED_ANCHOR",
    "changeClass": "LEVEL_2_MECHANICAL",
    "targetFile": "project/docs/governance/decision-log.md",
    "recordIdentity": "| Date | Decision | Scope | Source | Follow-up |",
    "anchor": "|---|---|---|---|---|",
    "expectedOldValue": "|---|---|---|---|---|",
    "newValue": "\n| 2026-11-07 | <!-- GOV-COORD-AUTHORITY kind=SEMANTIC_AUTHORITY recordId=OFFICE-EXPENSE-TARGET-3B-SA01 --> **OFFICE/CLIENT 3b / KI-221–MK-13 — SUPPLIED OWNER DECISION RECORDED:** Expense creation targets the canonical CaseClient creditor relationship. With no eligible target reject creation; with exactly one eligible target automatic selection is allowed; with multiple eligible targets require explicit selection. Never silently select legacy Case.clientId or the first row. An explicit invalid target is rejected, not replaced. | Reuse the existing ExpenseRequest.clientId as Client identity, validating case, both tenant boundaries and ALACAKLI/ORTAK_ALACAKLI membership in the writing transaction for manual, package, opening and stage creation. Retain action-specific actor authorization independently. Bind new stage idempotency to the target while preserving provable historical same-target replay without rewriting historical rows. Show target-selection requirements without falsely claiming creation or sending; preserve independent case/stage progression. No allocation engine, shares, schema/migration, backfill, retargeting old requests or new stage workflow. | Owner approved package choices 1–6 and expressly authorized prepared bounded 3b implementation through focused tests, PR, required CI, exact-head merge and main verification. OWNER-AUTHORITY.txt SHA256 e9570dc3b1e476337839164be9eb69ec2a0599aad838a98f01c4ae7880a187e9; approved package SHA256 fa117c3df2711f8e7881d4f937038e20d6bdd40306519032c74a9bc42b60899c. Mechanical transcription of supplied owner authority, not agent ratification or machine grant. | Preserve completed 3a and existing approval, distribution, finance, lifecycle and authorization rules; preserve O-5, F04_RACE WIP and cleanup residues. Fresh narrow writer sequencing and return are required for this row and the new acceptance manifest entry; earlier turns are closed. No production or general Office/Client acceptance is claimed. |",
    "evidenceSha": "6eab28d5fcf9e08e4ecc23b353bff6299ca8a0af",
    "expectedResultSha256": "be26fa4c7ab2fa6892e301a3908bfb71c2c2e9ea4299cd00ba2f9dd8be43c873"
  },
  "declaredTargetAllowlist": [
    "project/docs/governance/decision-log.md"
  ]
}
```
<!-- GOV_COORD_REQUEST_JSON_END -->
