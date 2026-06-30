# ACCT-1D-0 - BalanceLedger Journal Boundary Decision Note

**Status:** Accepted / DONE.
**Implementation status:** NOT AUTHORIZED by this note.
**Runtime behavior:** Unchanged.
**Schema/migration status:** None.

## Purpose

This note records the Accounting Journal boundary for `BalanceLedger` sources before any direct BalanceLedger journal writer is implemented.

The goal is to prevent double counting while preserving `BalanceLedger` as a useful reconciliation signal.

## Current Decision

`BalanceLedger` records must not be blindly connected to `AccountingJournal`.

Reason:

- `CollectionDispositionLine(type=OFFSET_CLIENT_ADVANCE)` is already mapped into Accounting Journal as `CLIENT_ADVANCE_BALANCE`.
- The same transaction can also write a correlated `BalanceLedger` row.
- If that correlated `BalanceLedger` row is independently posted as a journal source, the same economic movement is counted twice.

## Canonical Rule

For client-advance offset movements that originate from collection disposition posting:

```txt
Canonical journal source:
CollectionDispositionLine
```

The correlated `BalanceLedger` row is:

```txt
reported-only / reconciliation signal
```

It is not a journal source in that path.

## Suppressed BalanceLedger Sources

The following `BalanceLedger` rows are suppressed as direct Accounting Journal sources:

```txt
source/sourceId = disposition_line:*
BalanceLedger rows correlated with CollectionDispositionLine(type=OFFSET_CLIENT_ADVANCE)
```

This suppression applies to the correlated disposition-line path only. It does not decide the future handling of direct or unlinked `BalanceLedger` movements.

## Candidate Direct BalanceLedger Sources

The following sources remain candidates for a future direct BalanceLedger journal writer:

```txt
manual_adjust
expense_request:*
operation:*
direct/unlinked client advance movements
```

These candidates are not implemented by this note. They require ACCT-1D-1 review and tests.

## Tentative Mapping for Direct/Unlinked Movements

For direct/unlinked client advance movements, the tentative mapping is:

```txt
CREDIT:
  Debit  CASH_CLEARING
  Credit CLIENT_ADVANCE_BALANCE

DEBIT:
  Debit  CLIENT_ADVANCE_BALANCE
  Credit CASH_CLEARING
```

This mapping is only a boundary note. It is not runtime behavior.

## Open Product/Accounting Decisions

The following `BalanceLedgerType` values are not approved for implementation yet:

```txt
ADJUST
REFUND
```

Reason:

```txt
amount sign
direction
closure semantics
refund vs correction distinction
```

These must be resolved before any journal writer handles them.

## Impact Scope

This note affects future Accounting Journal source selection only.

It does not change:

- `CaseBalanceService`
- `DispositionPostingService`
- `AccountingJournalWriterService`
- existing dry-run behavior
- existing ledger/balance/statement/payout behavior

## Multitenant Boundary

No runtime tenant lookup is introduced here.

Future ACCT-1D-1 implementation must keep all BalanceLedger source resolution tenant-scoped and must not accept tenant identity from request body or query parameters.

## Non-Goals

This note does not implement:

```txt
Code
Schema
Migration
Runtime wiring
Journal writer change
CaseBalanceService change
DispositionPostingService change
Trial Balance
Reconciliation implementation
```

## Next Implementation Boundary

ACCT-1D-1 may implement direct BalanceLedger journal writer wiring only after this boundary is respected:

```txt
Exclude correlated disposition_line:* BalanceLedger.
Exclude ADJUST/REFUND until product/accounting decision.
```