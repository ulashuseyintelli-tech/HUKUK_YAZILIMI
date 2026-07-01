# ACCT-4 Offset / Payout Closure Gate

**Status:** Ready for owner closure.
**Scope:** Closure review for ACCT-4 design gate and ACCT-4A contract lock. Documentation/status-only; no runtime, schema, migration, controller, UI, posting, writer, legal ledger, or TBK100 behavior change.
**Related:** `docs/finance/acct-4-offset-payout-integration-design-gate.md`, PR #718, PR #719, `docs/governance/active-roadmap.md` PHASE 4, `docs/governance/product-backlog.md` ACCT-4.

## Decision

ACCT-4 can be marked **READY FOR OWNER CLOSURE**.

No remaining ACCT-4-specific contract, service-test, documentation, controller-boundary, schema, migration, legal-ledger, or TBK100 blocker was found.

## Merge Evidence

| Item | SHA | Evidence |
|---|---|---|
| ACCT-4 design gate | `db60511ce75474c8f2bf188aed5304d4ffdca754` | Added `docs/finance/acct-4-offset-payout-integration-design-gate.md`. |
| ACCT-4A contract lock | `886f3cf634bec5bb7b0b24854057ab7d223f31ea` | PR #718 changed only three API service spec files for offset, payout, and manual payout reversal contract assertions. |
| Final canonical HEAD at closure review start | `e745e4db79f08fbe8bb21be34effcfce57ec5883` | PR #719 was merged after #718 and changed only web client activity timeline files. |

The #718 squash SHA and final canonical HEAD are intentionally different: #719 is a later web-only merge and does not alter ACCT-4 offset, payout, journal writer, legal ledger, or TBK100 behavior.

## Coverage Review

### Offset

`client-offset.service.spec.ts` now locks:

- `ClientOffset(kind=APPLY)` writes `CLIENT_OFFSET_APPLIED`.
- `ClientOffset(kind=REVERSAL)` writes `CLIENT_OFFSET_REVERSED`.
- source tuple, source version, source action, idempotency key, idempotency material, tenant/currency/case dimensions, and line account/direction are asserted.
- APPLY has no reversal reference.
- REVERSAL references the original APPLY source and is not self-referential.
- journal write uses the transaction client and occurs after source row creation and before audit.
- idempotent replay paths do not write duplicate offset or journal rows.
- writer failure rejects the transaction before audit commit path.

### Payout

`client-payout.service.spec.ts` now locks:

- `ClientPayout(status=RECORDED)` writes `CLIENT_PAYOUT_RECORDED`.
- source tuple, source version, source action, idempotency key, idempotency material, source refs, posted/effective date metadata, and line account/direction are asserted.
- payout journal lines carry `payoutId` and `caseClientId` and do not carry offset, disposition-line, or balance-ledger dimensions.
- payout allocation source-links are written before journal write.
- idempotent replay paths do not write duplicate allocation or journal rows.
- writer failure rejects the payout transaction.

### Manual Payout Reversal Boundary

`client-payout-manual-reversal.service.spec.ts` now locks:

- manual reversal closure is metadata/workflow closure only.
- `OFFSET` closure method does not call `ClientOffset` paths or `AccountingJournalEntry` paths.
- closure does not mutate payout, payout allocation, collection, disposition marker, statement, BalanceLedger, legal ledger, or Accounting Journal records.

## Closure Boundary

ACCT-4 remains bounded to existing offset/payout journal contract lock. It does not authorize:

- new schema or migration work
- new runtime posting behavior
- controller or UI changes
- legal ledger or TBK100 behavior changes
- payout reversal accounting semantics
- refund, waiver, or BalanceLedger direct-writer semantics

Any future expansion in those areas requires a new design gate or the relevant next phase/backlog item.

## Result

ACCT-4 is closure-ready because the design boundary is documented and the live offset/payout journal relationships are regression-protected at service/spec level.
