# ACCT-1 Posting Mode & Status Reconciliation Gate

**Status:** Accepted reconciliation gate.
**Reviewed on:** 2026-07-01.
**Canonical HEAD reviewed:** `68183f23eeeca7ab171332c2498b6d39d20ca71d`.
**Scope:** Documentation/status-only. No runtime behavior, schema, migration, controller, UI, posting, writer, legal ledger, or TBK100 behavior changed.

## Purpose

This gate records the current ACCT-1 journal writer ground truth before any new runtime source wiring starts.

## Current Posting Mode Decision

The canonical current behavior for already-wired Accounting Journal sources is fail-closed live writing, not env-gated shadow writing.

Repo evidence:

| Source path | Current behavior |
|---|---|
| `DispositionPostingService.post()` | Builds/validates `COLLECTION_DISPOSITION_LINE` drafts and writes them in the source transaction. |
| `ClientPayoutService.create()` | Builds/validates `CLIENT_PAYOUT` `recorded` drafts and writes them in the source transaction. |
| `ClientOffsetService` apply/reversal paths | Adapt/build/validate `CLIENT_OFFSET` drafts and write them in the source transaction. |
| `CaseBalanceService.credit()` / `debit()` | Builds/validates direct CREDIT/DEBIT `BALANCE_LEDGER` drafts and writes them in the source transaction. |

`ACCOUNTING_JOURNAL_POSTING_MODE` still exists and resolves invalid/empty input to `disabled`; `shadow` attempts without enforce and `enforce` attempts with enforce semantics at helper level. The helper is not wired as the gate for the live writer call sites above.

Therefore this gate does not authorize a code change from fail-closed live writing to DEFAULT-OFF/SHADOW. Any such change is a separate owner/architecture decision.

## Writer Contract Snapshot

`AccountingJournalWriterService.write()` accepts validated drafts only. It checks tenant-scoped source/action uniqueness, idempotency-key conflicts, source version staleness, and source hash mismatch before creating an entry with lines. Existing live callers treat write failure as a conflict and reject the source transaction.

## ACCT-1D-1 Status Reconciliation

ACCT-1D-1 is code/test complete and should be tracked as `DONE`.

Evidence:

- `9d74b4e7` / PR #685 wired direct BalanceLedger journals.
- `5e861b23` / PR #687 hardened the BalanceLedger journal contract.
- `CaseBalanceService.credit()` and `debit()` now write direct CREDIT/DEBIT BalanceLedger journals in the same transaction.
- Correlated `disposition_line:*` BalanceLedger rows remain suppressed so `CollectionDispositionLine` is the canonical source for that path.
- `ADJUST` and `REFUND` remain outside the approved journal writer scope until a product/accounting decision.

## Remaining ACCT-1 Gaps

This gate leaves ACCT-1 open for future owner-selected slices:

- Generic `ACCOUNTING_JOURNAL_ENTRY` reversal/manual-adjustment semantics remain unmapped.
- Expense request/payment/application source contracts exist, but live expense writer wiring is not authorized here.
- Any posting-mode gate applied to existing live writer paths requires a separate owner/architecture decision.

## Non-Goals

No code, schema, migration, controller, UI, posting, writer, legal ledger, or TBK100 behavior is changed by this gate.