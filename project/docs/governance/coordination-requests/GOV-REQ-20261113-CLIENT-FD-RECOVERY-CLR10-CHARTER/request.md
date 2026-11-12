# CL-R10 A — supplied owner Charter successor clarification

One exact append in §43.2. The canonical supplied owner decision is mechanically transcribed; historical I04 text and acceptance are unchanged. Fresh direct owner writer assignment: #2750 comment 6837383205. No other Charter section, CL-R07 policy, schema or live action.

<!-- GOV_COORD_REQUEST_JSON_BEGIN -->
```json
{
  "schemaVersion": 1,
  "requestId": "GOV-REQ-20261113-CLIENT-FD-RECOVERY-CLR10-CHARTER",
  "requestFingerprint": "7704c1cf0005de6b8b8b940ad0d6cdb0adf5ee72c934b080176ba573640b6371",
  "requestedBy": "CODEX_LOCAL",
  "createdAt": "2026-11-12T23:01:14Z",
  "baseMainSha": "4c218e179a8314b9e3127cba6b109b85bcf364d7",
  "semanticAuthorityRef": {
    "kind": "SEMANTIC_AUTHORITY",
    "path": "project/docs/governance/decision-log.md",
    "recordId": "CLIENT-FD-RECOVERY-CLR10-SA01",
    "evidenceSha": "4c218e179a8314b9e3127cba6b109b85bcf364d7"
  },
  "executionGrantRef": {
    "kind": "EXECUTION_GRANT",
    "path": "project/docs/governance/coordination-execution-grants/GOV-COORD-V1-CODEX-LOCAL.md",
    "recordId": "GOV-COORD-V1-CODEX-LOCAL",
    "evidenceSha": "4c218e179a8314b9e3127cba6b109b85bcf364d7"
  },
  "operation": {
    "type": "EXACT_APPEND_AT_DECLARED_ANCHOR",
    "changeClass": "LEVEL_2_MECHANICAL",
    "targetFile": "project/docs/governance/CLIENT-GOVERNANCE-CHARTER.md",
    "recordIdentity": "### 43.2 §35.11 Zorunlu Sırasının Birebir Uygulanması",
    "anchor": "### 43.2 §35.11 Zorunlu Sırasının Birebir Uygulanması\n\n```text\n(1) SEND_PENDING kalici commit edilir              -> beginSend()\n(2) provider cagrisi DB TRANSACTION'I DISINDA      -> dispatchAndPublish() 2. adim\n(3) gercek-provider kabulu + KALICI message ID     -> eksikse SEND_FAILED (§35.10)\n(4) snapshot / icerik hash / alici baglamasi gonderimden ONCE VE SONRA dogrulanir\n(5) PUBLISHED'e TEK idempotent guarded gecis       -> publishedAt + providerMessageId NULL guard'li\n(6) provider-kabul (SENT) ve yayinlama olaylari AYRI AYRI AuditLog'a yazilir\n```",
    "expectedOldValue": "### 43.2 §35.11 Zorunlu Sırasının Birebir Uygulanması\n\n```text\n(1) SEND_PENDING kalici commit edilir              -> beginSend()\n(2) provider cagrisi DB TRANSACTION'I DISINDA      -> dispatchAndPublish() 2. adim\n(3) gercek-provider kabulu + KALICI message ID     -> eksikse SEND_FAILED (§35.10)\n(4) snapshot / icerik hash / alici baglamasi gonderimden ONCE VE SONRA dogrulanir\n(5) PUBLISHED'e TEK idempotent guarded gecis       -> publishedAt + providerMessageId NULL guard'li\n(6) provider-kabul (SENT) ve yayinlama olaylari AYRI AYRI AuditLog'a yazilir\n```",
    "newValue": "\n\n**CL-R10 A — owner-approved bounded successor (2026-11-13):** The NULL message-ID guard above records the original I04 implementation, not a prohibition on persisting provider acceptance before final publication. For the successor bound to `CLIENT-FD-RECOVERY-CLR10-SA01` in `decision-log.md`, approved-provider acceptance, message ID and its attempt-bound SENT audit are committed together before the publication transaction. The existing sealed version/recipient/content/snapshot checks are repeated; the single guarded SEND_PENDING -> PUBLISHED transition matches that exact durable acceptance rather than requiring a NULL message ID. A recovery of this acceptance does not call transport or require another human approval.\n\nOnly trustworthy definite-rejection evidence may release a claim for explicit resend. Unknown, missing-ID and unclassified legacy evidence remains blocked and visible; absence of durable evidence does not prove non-delivery. A crash before the first durable acceptance write has no automatic recovery or exactly-once SMTP guarantee. For this successor only, the supplied decision narrowly supersedes the placement of SENT audit in §35.11(6)/§43.2(6); PUBLISHED audit remains atomic with publication. This clarification preserves the success threshold in §35.10, the invariants in §35.11 and historical acceptances; it imports no CL-R07 timer/attempt policy and creates no new persistent lifecycle, schema, cron, provider-proof entry or forced publication.\n",
    "evidenceSha": "4c218e179a8314b9e3127cba6b109b85bcf364d7",
    "expectedResultSha256": "68d97a6be817a600dc1d1b049e32105ca34df1365fddb8c7c8482a961313bfeb"
  },
  "declaredTargetAllowlist": [
    "project/docs/governance/CLIENT-GOVERNANCE-CHARTER.md"
  ]
}
```
<!-- GOV_COORD_REQUEST_JSON_END -->
