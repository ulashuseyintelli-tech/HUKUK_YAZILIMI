# Overpayment Display Wording and Sign-off

## 1. Status

```text
Planning / wording sign-off completed
No primary cutover in this PR
```

This document closes the CB-05 / CB-06 wording decision only. It does not make
canonical balance/display the live legal balance authority.

## 2. Scope

In scope:

- HELD overpayment display wording.
- OVERPAYMENT_BLOCKED diagnostic wording.
- Restricted / earmarked payment wording before PaymentDesignation exists.
- Opt-in shadow UI wording guard.
- Audit/test evidence that these signals are not presented as debt settlement.

Out of scope:

- Primary UI cutover.
- HesapOzetiPanel source replacement.
- calculation-summary behavior change.
- balance/display or shadow-diff calculation behavior change.
- computeBalance algorithm change.
- Overpayment #404 guard behavior change.
- PaymentDesignation implementation.
- ClaimItem refactor.
- DB migration.

## 3. Context

#435 identified HELD overpayment and OVERPAYMENT_BLOCKED wording as cutover
blockers. CB-01 made principal/outstanding authority depend on
`finalDebtStates`; CB-02 and CB-03 made currency/context mismatches
non-comparable.

This document covers only the wording/sign-off layer after those guards. It
does not approve primary display cutover, and it does not change overpayment,
balance/display, shadow-diff, or calculation-summary behavior.

## 4. Terminology Decisions

- `HELD_OVERPAYMENT` means held evidence outside the debt total.
- `HELD_OVERPAYMENT` is not principal reduction.
- `HELD_OVERPAYMENT` is not interest, expense, attorney fee, or total
  outstanding reduction.
- `OVERPAYMENT_BLOCKED` means diagnostic/blocker evidence.
- `OVERPAYMENT_BLOCKED` is not debt.
- `OVERPAYMENT_BLOCKED` is not authoritative overpayment creation.
- Restricted or earmarked unsupported payment is not free surplus without
  PaymentDesignation.
- Currency/context mismatch prevents authoritative amount comparison.
- Primary cutover remains NO-GO.
- CB-05/CB-06 wording sign-off does not override the remaining #435 blockers.

## 5. HELD Overpayment Display Rule

Allowed meaning:

- Money exists as separate held overpayment evidence.
- It is outside the debt total.
- It is not subtracted from outstanding debt.
- It is not subtracted from principal.
- It is not subtracted from interest.
- It is not subtracted from expense.
- It is not subtracted from attorney fee.
- It is not applied to another scope without later designation/reallocation.
- It can be reviewed as held / unresolved surplus evidence.

Forbidden meaning:

- The debt is closed.
- The debt is paid.
- The amount was applied to debt.
- The amount is confirmed unrestricted surplus.
- The amount can move to another debt without PaymentDesignation or review.

## 6. OVERPAYMENT_BLOCKED Display Rule

Allowed meaning:

- The system saw a blocked allocation / overpayment attempt signal.
- It is diagnostic evidence.
- It is a cutover blocker.
- It is not debt.
- It is not an authoritative overpayment amount.
- It often means payment scope, restriction, currency, context, or allocation
  safety is unresolved.

Forbidden meaning:

- A confirmed overpayment was created.
- The amount is available for refund/transfer/reallocation.
- The amount was applied.
- The payment can be treated as unrestricted.

## 7. Restricted / Earmarked Unsupported Rule

Allowed meaning:

- Scope is unresolved until PaymentDesignation support exists.
- The signal must stay outside primary balance authority.
- Legal/product review is required before user-facing primary display cutover.

Forbidden meaning:

- Restricted payment is free overpayment.
- Earmarked payment automatically applies to another debt.
- The UI may present the amount as final surplus.

## 8. Shadow UI Wording Matrix

| Signal | Approved short label | Approved helper text | UI authority |
|---|---|---|---|
| `HELD_OVERPAYMENT` | `Held outside debt total` | `Not subtracted from outstanding; not applied to another scope.` | Shadow evidence only |
| `OVERPAYMENT_BLOCKED` | `Blocked allocation evidence` | `Diagnostic only; not a debt, payment, or unrestricted overpayment.` | Cutover blocker |
| `RESTRICTED_PAYMENT_DISPLAY_UNSAFE` | `Restricted payment scope unresolved` | `PaymentDesignation is required before this can be shown as surplus or applied elsewhere.` | Unsafe source |

## 9. Primary Display Wording Matrix

Primary display cutover is not approved. If this wording is later reused in a
primary display, it must keep the same legal meaning:

| Signal | Primary display status | Required meaning |
|---|---|---|
| `HELD_OVERPAYMENT` | Not approved for primary cutover yet | Separate held evidence; not debt reduction |
| `OVERPAYMENT_BLOCKED` | Not approved for primary cutover yet | Diagnostic/blocker only |
| `RESTRICTED_PAYMENT_DISPLAY_UNSAFE` | Not approved for primary cutover yet | Scope unresolved until PaymentDesignation |
| Currency/context mismatch | Not approved for primary cutover | Amount comparison not authoritative |

## 10. Sign-off Criteria

CB-05 is sign-off complete when:

- HELD overpayment is displayed separately from debt/outstanding.
- The UI says it is not subtracted from outstanding.
- The UI says it is not applied to another scope.
- Tests prevent regression to settlement-like wording.

CB-06 is sign-off complete when:

- `OVERPAYMENT_BLOCKED` is displayed as diagnostic/blocker evidence.
- The UI says it is not a debt, payment, or unrestricted overpayment.
- Restricted/earmarked wording points to PaymentDesignation dependency.
- Tests prevent wording that says confirmed surplus or applied payment.

## 11. Test Plan

Required opt-in UI evidence:

- `BalanceShadowDiffPanel` remains hidden unless opt-in is enabled.
- HELD amount is labelled `Held outside debt total`.
- HELD helper text says it is not subtracted and not applied elsewhere.
- `OVERPAYMENT_BLOCKED` is labelled `Blocked allocation evidence`.
- Blocked helper text says diagnostic only.
- Restricted/earmarked helper text says PaymentDesignation is required.
- Forbidden settlement wording is absent from the panel.
- Shadow endpoint failure does not break primary display.
- Primary legacy amount stays unchanged by shadow values.
- `HesapOzetiPanel` remains on legacy calculation-summary and is not replaced.

## 12. Test Evidence

Current patch evidence:

- `BalanceShadowDiffPanel` maps HELD overpayment to `Held outside debt total`.
- The rendered helper says it is not subtracted from outstanding or applied
  elsewhere.
- `OVERPAYMENT_BLOCKED` maps to `Blocked allocation evidence`.
- Blocked helper text says diagnostic only; not a debt, payment, or
  unrestricted overpayment.
- Restricted payment wording points to PaymentDesignation.
- The shadow panel test asserts forbidden settlement wording is absent.

## 13. Proposed Implementation Sequence

1. Land CB-05/CB-06 wording/sign-off and opt-in shadow guard tests.
2. Keep primary display cutover blocked.
3. Close or explicitly accept the remaining #435 blockers.
4. Re-run readiness classification with representative fixtures.
5. Only then consider a separate primary display cutover proposal.

## 14. Decision

```text
CB-05 / CB-06 wording sign-off completed for opt-in shadow display.
Primary cutover remains NO-GO.
```

This closes wording/sign-off only. It does not close the remaining #435 blockers
for ClaimItem authority, periodic obligations, representative fixtures,
restricted PaymentDesignation implementation, or legacy bad-data remediation.

## 15. No-Fix List

- No production balance algorithm change.
- No overpayment guard rewrite.
- No schema migration.
- No PaymentDesignation implementation.
- No ClaimItem semantic cleanup.
- No primary display cutover.

## 16. Appendix: Source References

HELD overpayment enters the display path through `CaseBalanceResult.overpayments.held`
and is mapped by `toCaseBalanceDisplay()` into:

- `totals.heldOverpaymentAmount`
- `HELD_OVERPAYMENT` bucket
- `provenance.overpaymentProjectionUsed`

`OVERPAYMENT_BLOCKED` enters through diagnostic timeline events read by
`CaseBalanceService.computeCaseBalance()` and is mapped by `toCaseBalanceDisplay()`
into:

- `OVERPAYMENT_BLOCKED` diagnostic
- `RESTRICTED_PAYMENT_DISPLAY_UNSAFE` diagnostic when restricted payment is present
- `blockedOverpaymentDiagnosticsUsed`
- shadow-diff blockers / next required evidence

The opt-in UI surface is `BalanceShadowDiffPanel`. The live legal panel remains
`HesapOzetiPanel` on `calculation-summary`.
