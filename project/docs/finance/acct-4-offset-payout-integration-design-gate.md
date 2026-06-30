# ACCT-4 Offset / Payout Integration Design Gate

**Status:** Accepted design gate for ACCT-4 entry work.
**Scope:** Documentation-only boundary lock. No runtime behavior, schema, migration, posting, writer, legal ledger, TBK100, payout, offset, or test logic change.
**Related:** `docs/governance/active-roadmap.md` PHASE 4, `docs/governance/product-backlog.md` ACCT-4, `docs/adr/ADR-010-ACCOUNTING-JOURNAL-SOT-NORTH-STAR.md`, `docs/finance/adr-client-offset-cross-ledger-settlement.md`, `docs/acct-1d-balanceledger-journal-boundary.md`.

## Purpose

ACCT-4 connects offset and payout economic events to the Accounting Journal program without moving legal authority away from the existing ledger/TBK100 model.

This gate records the safe implementation boundary before any ACCT-4 follow-up work. It does not authorize new runtime wiring by itself.

## Existing Ground

The repo already contains live journal write paths for the primary ACCT-4 sources:

| Source | Current source service | Current journal behavior |
|---|---|---|
| `ClientOffset(kind=APPLY)` | `ClientOffsetService.createOffset()` | Writes a `CLIENT_OFFSET_APPLIED` journal entry in the same transaction after source row creation. |
| `ClientOffset(kind=REVERSAL)` | `ClientOffsetService.reverseOffset()` | Writes a `CLIENT_OFFSET_REVERSED` journal entry in the same transaction after reversal source row creation. |
| `ClientPayout(status=RECORDED)` | `ClientPayoutService.create()` | Writes a `CLIENT_PAYOUT_RECORDED` journal entry in the same transaction after payout and allocation source-link creation. |
| `ClientPayoutManualReversal` closure | `ClientPayoutManualReversalService.close()` | Metadata/workflow closure only; no payout, allocation, offset, ledger, statement, or journal mutation. |

The current `AccountingJournalWriterService` is fail-closed:

- It writes validated drafts only.
- It checks source/action idempotency.
- It rejects conflicting idempotency keys.
- It is called inside the source transaction by offset and payout services.

## Source Boundaries

### Offset

`ClientOffset` is the canonical offset source for ACCT-4.

Current locked behavior:

- Offset is manual and immutable.
- Apply and reversal require explicit office-admin capacity in service code.
- Cross-tenant, cross-client, and cross-currency offset are rejected.
- Apply/reversal use tenant/client/currency advisory locks and idempotency keys.
- Apply reduces payable and expense gross balances by the same amount; net position is unchanged.
- Reversal is a counter-row; original apply is not mutated.

Journal mapping:

| Offset event | Journal entry type | Debit | Credit |
|---|---|---|---|
| APPLY | `CLIENT_OFFSET_APPLIED` | `CLIENT_PAYABLE` | `CLIENT_EXPENSE_RECEIVABLE` |
| REVERSAL | `CLIENT_OFFSET_REVERSED` | `CLIENT_EXPENSE_RECEIVABLE` | `CLIENT_PAYABLE` |

ACCT-4 must not introduce `ClientPayout method=OFFSET`, silent projection offsets, or offset rows hidden inside legal ledger/TBK100 storage.

### Payout

`ClientPayout(status=RECORDED)` is the canonical payout source for ACCT-4.

Current locked behavior:

- Payout is a proceeds settlement record, not a legal ledger record.
- Payout validates tenant/case/caseClient eligibility.
- Payout uses tenant/case/caseClient/currency advisory locks and idempotency keys.
- Payout cannot exceed backend-computed outstanding.
- Payout allocation source-links are planned from posted `CLIENT_PAYABLE` disposition lines and written before journal write.
- Journal writer failure rejects the source transaction.

Journal mapping:

| Payout event | Journal entry type | Debit | Credit |
|---|---|---|---|
| RECORDED | `CLIENT_PAYOUT_RECORDED` | `CLIENT_PAYABLE` | `CASH_CLEARING` |

ACCT-4 must keep payout as cash settlement. It must not use payout as an offset mechanism.

### Manual Payout Reversal Workflow

`ClientPayoutManualReversalService.close()` is not a journal source in the current implementation.

Its current boundary is closure-only:

- It closes the manual reversal workflow row.
- It writes audit metadata.
- It does not mutate payout, payout allocation, collection, disposition marker, statement, ledger, offset, or Accounting Journal records.

ACCT-4 must not treat manual reversal closure as a financial event unless a separate design gate defines a concrete refund/offset/waiver economic source and its journal semantics.

## Journal Writer Boundary

ACCT-4 implementation must use the existing journal source pipeline:

```txt
source row -> source snapshot/adapt/build/validate -> AccountingJournalWriterService.write()
```

Required writer guardrails:

- Source row and journal entry must be in the same transaction for live write paths.
- Mapping must be balanced before write.
- Source/action/idempotency replay semantics must remain intact.
- Writer failure must reject the source transaction for live write paths.
- New source types or source actions require focused adapter/builder/writer tests before runtime use.

ACCT-4 must not bypass `AccountingJournalWriterService`, hand-write `AccountingJournalEntry` rows, or weaken validation/idempotency.

## Legal Ledger And TBK100 Boundary

ADR-010 remains the governing boundary:

- Accounting Journal is the target financial-event source of truth direction.
- TBK100 rules remain legal authority.
- `LedgerEntry` / `LedgerAllocation` storage is not replaced by ACCT-4.
- Legal ledger/TBK100 cutover requires shadow/prove/legal-signoff and is not part of this phase.

ACCT-4 journal integration may improve financial-event coverage, but it must not recalculate legal allocation, mutate TBK100 behavior, or make legal ledger projections authoritative.

## BalanceLedger Boundary

`BalanceLedger` is not the ACCT-4 offset/payout source unless a separate BalanceLedger-specific gate allows it.

The existing ACCT-1D-0 rule still applies:

- Correlated `disposition_line:*` BalanceLedger rows are reported-only / reconciliation signal.
- `CollectionDispositionLine` remains the canonical journal source for that correlated path.
- Direct/unlinked BalanceLedger writer work is separate ACCT-1D-1 scope.
- `ADJUST` and `REFUND` remain unresolved product/accounting decisions.

ACCT-4 must not double-count client advance movements by wiring correlated BalanceLedger rows as independent journal sources.

## Non-Goals

This gate does not authorize:

- schema or migration changes
- new runtime posting behavior
- new writer behavior
- payout reversal accounting semantics
- refund or waiver journal semantics
- BalanceLedger direct writer wiring
- TBK100/legal ledger behavior changes
- Accounting Journal source-of-truth cutover
- UI changes

## First Implementation Slice

Recommended next task:

**ACCT-4A Offset/Payout Journal Contract Lock**

Scope:

- Focused tests/docs only unless an existing assertion gap requires minimal test additions.
- Lock current offset apply/reversal and payout recorded journal contracts:
  - source row and journal write occur in the same transaction
  - journal writer failure rejects source transaction
  - offset apply/reversal map to the expected journal entry types and accounts
  - payout recorded maps to expected journal entry type and accounts
  - manual payout reversal closure does not call payout/allocation/offset/ledger/journal mutation paths
- Do not add schema, migration, new source actions, new writer behavior, legal ledger/TBK100 behavior, or payout reversal financial semantics.

Rationale:

The code already contains live offset and payout journal write paths. The safest first ACCT-4 implementation step is to lock their current contract and explicitly prove that manual reversal closure remains non-financial before adding any new behavior.
