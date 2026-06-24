# Primary Cutover Readiness Refresh After Blockers

## Status

```text
Docs-only readiness refresh.
No production behavior change.
No UI source replacement.
No feature flag implementation.
No database migration.
```

This document refreshes primary display cutover readiness after the blocker
remediation line and the guarded evidence pack.

Global primary cutover remains **NO-GO**.

Guarded eligible-subset pilot is **CONDITIONAL GO / LIMITED GO** only under the
explicit constraints in this document.

## Context

The previous audit chain established the following order:

```text
#417 Display Authority Audit
#420 backend display contract hardening
#425 legacy-vs-canonical shadow diff evidence
#429 opt-in shadow UI
#432 shadow diff readiness audit
#435 cutover blocker remediation plan
CB-01 finalDebtStates principal/outstanding contract
CB-02 + CB-03 currency/context hard guards
CB-05 + CB-06 overpayment wording/sign-off guard
CB-04 ClaimItem display authority guard
#458 guarded primary cutover scope freeze
#460 guarded cutover eligibility evidence pack
```

The live primary display authority is still legacy `calculation-summary`.
Canonical `balance/display` and `shadow-diff` are now better protected and have
minimal guarded eligibility evidence, but they are not globally promoted.

## Current Decision

| Scope | Decision | Meaning |
|---|---|---|
| Global primary display cutover | `NO-GO` | Do not replace the live primary balance source globally. |
| Guarded eligible subset pilot | `CONDITIONAL_GO_LIMITED` | May proceed only behind an explicit feature flag and only for frozen eligible scenarios. |
| Unsupported scenarios | `LEGACY_FALLBACK` | Stay on legacy primary; do not infer readiness from absence of a blocker. |
| Opt-in shadow display | `APPROVED` | May remain available for reviewer/dev/audit evidence. |
| `calculation-summary` removal | `NO-GO` | Legacy fallback must remain intact. |

## What Changed Since #432

#432 was intentionally strict:

```text
READY_FOR_CUTOVER: 0
GO: 0
Primary cutover is NOT approved yet.
```

After the blocker remediation line, several hard risks are now guarded or
explicitly excluded from the pilot:

| Area | Current state | Readiness effect |
|---|---|---|
| `finalDebtStates` principal authority | Canonical principal/outstanding display is constrained to `finalDebtStates`; missing state does not fabricate principal. | Eligible subset can require `finalDebtStates`; global cutover still no-go. |
| Currency mismatch | Amount comparison is hard-blocked; non-comparable diffs keep null amount/delta fields. | Eligible subset excludes mismatch cases. |
| Tenant/case context mismatch | Cross-case/cross-tenant comparison is hard-blocked. | Eligible subset excludes context mismatch. |
| HELD overpayment | Kept separate from debt/outstanding; not worded as paid, closed, applied, or reduced debt. | Eligible subset may proceed only if wording constraints remain enforced. |
| `OVERPAYMENT_BLOCKED` | Diagnostic/cutover evidence only; not overpayment authority. | Hard fallback/no-go remains. |
| `ClaimItem.collectedAmount` | Not canonical display authority; derived remaining is not canonical authority. | Eligible subset cannot depend on ClaimItem projection amounts. |
| Scope freeze | Eligible subset is explicit and narrow. | Prevents silent scope expansion. |
| Minimal evidence pack | Feature flag and fallback behavior are covered by test evidence. | Supports limited pilot planning, not global cutover. |

## Guarded Eligible Subset

A case can be a canonical primary candidate only when all of the following are
true:

- Explicit guarded-primary feature flag is enabled.
- Scenario is inside the frozen first-pilot subset.
- Principal/outstanding authority comes from canonical `finalDebtStates`.
- Currency is known, single, and consistent.
- Tenant and case context match.
- No hard no-go diagnostic is present.
- No restricted or earmarked payment requires `PaymentDesignation`.
- No unsupported periodic obligation semantics are required.
- No legacy nafaka principal contamination is part of the displayed authority.
- No ClaimItem collected/remaining value is used as display authority.
- Canonical/shadow source is available and safe.

Eligibility is positive and explicit. It is not the default.

## Mandatory Fallback Conditions

Legacy `calculation-summary` remains primary when any of these conditions exist:

- Feature flag is off.
- Scenario is not in the frozen eligible subset.
- `finalDebtStates` is missing.
- `finalDebtStates` currency mismatches display currency.
- Currency is unknown, multi-currency unsafe, or mismatched.
- Tenant/case context mismatches.
- `ClaimItem` projection values would become authority.
- HELD overpayment would be interpreted as debt reduction.
- `OVERPAYMENT_BLOCKED` is present.
- Restricted/earmarked payment requires `PaymentDesignation`.
- Nafaka/kira or another periodic obligation requires period semantics.
- Canonical or shadow source fails.
- Any unsafe source/provenance marker blocks authority.

Fallback is not an error. It is the intended safety behavior.

## Hard No-Go Diagnostics

The following signals block canonical primary display for the pilot:

- `FINAL_DEBT_STATES_MISSING`
- `FINAL_DEBT_STATES_CURRENCY_MISMATCH`
- `CURRENCY_MISMATCH`
- `CONTEXT_MISMATCH`
- `CANONICAL_CURRENCY_UNSAFE`
- `MULTI_CURRENCY_DISPLAY_UNSAFE`
- `CLAIM_ITEM_COLLECTED_AMOUNT_NOT_AUTHORITY` when authority contamination is present
- `OVERPAYMENT_BLOCKED`
- `RESTRICTED_PAYMENT_DISPLAY_UNSAFE`
- `NAFAKA_PRINCIPAL_DISPLAY_RISK`
- missing/unsupported `PaymentDesignation`
- unsupported periodic obligation / missing `periodKey`
- canonical/shadow source failure
- unsafe provenance or unsafe source marker

A fixed blocker does not imply global cutover approval.

## Remaining Global-Cutover Gaps

These gaps remain blockers for broad or global primary cutover:

| Gap | Why it still matters | Required before global cutover |
|---|---|---|
| Representative case-type evidence | General principal evidence is not enough for broad legal display authority. | Named evidence for genel ilamsiz, kambiyo, kira, nafaka, ilam, fatura, ipotek/rehin. |
| Reversal representative evidence | Reversal behavior needs dedicated shadow evidence. | Reversal scenario evidence and fallback/authority proof. |
| PaymentDesignation | Restricted/earmarked payment intent is not modeled for primary authority. | Dedicated model/contract or explicit exclusion. |
| PeriodicObligation / periodKey | Nafaka/kira need period semantics, not blind principal display. | Domain model or explicit exclusion with evidence. |
| Legacy PRINCIPAL nafaka remediation | Existing bad data can still exist historically. | Separate audit/migration/remediation plan. |
| Rollout operations | Pilot needs rollback and monitoring shape before production enablement. | Feature flag, telemetry/evidence retention, rollback checklist. |

## Pilot Readiness Checklist

A guarded pilot PR may be considered only if it preserves all of these:

- [ ] Explicit feature flag defaults off.
- [ ] Flag off uses legacy `calculation-summary` as primary.
- [ ] Flag on + eligible evidence may select canonical primary candidate.
- [ ] Flag on + any hard no-go uses legacy fallback.
- [ ] Unsupported scenarios use legacy fallback.
- [ ] Legacy fallback remains intact and tested.
- [ ] Shadow evidence remains available.
- [ ] Rollback is documented as disabling the flag.
- [ ] No global `calculation-summary` removal.
- [ ] No unsupported scenario becomes primary.
- [ ] No HELD/BLOCKED overpayment wording implies paid, closed, applied, definitive overpayment, or debt reduction.
- [ ] No ClaimItem collected/remaining value becomes display authority.
- [ ] No currency/context mismatch produces amount comparison.

## Decision Detail

### Global primary cutover

```text
NO-GO
```

Reason: the system still lacks broad representative evidence and domain coverage
for restricted payments, periodic obligations, legacy remediation, reversal, and
case-type-specific semantics.

### Guarded eligible-subset pilot

```text
CONDITIONAL GO / LIMITED GO
```

Reason: #458 froze the narrow scope and #460 added minimal evidence that the
eligible path and fallback/no-go paths can be distinguished without changing
production behavior.

This decision does not authorize broad rollout. It only allows a future, separate
implementation PR to propose a feature-flagged pilot if it stays inside the
frozen subset and keeps fallback behavior intact.

## Next Approved Work

The next PR may be a guarded pilot implementation plan or a feature-flagged pilot
implementation, but only if it stays narrow:

- Add an explicit guarded-primary feature flag.
- Keep the default off.
- Select canonical primary only for eligible evidence.
- Fall back to legacy for every no-go or unsupported scenario.
- Preserve opt-in shadow evidence.
- Do not remove or change `calculation-summary`.
- Do not expand into PaymentDesignation, PeriodicObligation, ClaimItem refactor,
  DB migration, or global cutover.

## Non-Goals For This Refresh

This document does not include:

- Production code.
- Tests.
- UI source replacement.
- Feature flag implementation.
- Pilot enablement.
- DB migration.
- PaymentDesignation implementation.
- PeriodicObligation implementation.
- ClaimItem refactor.
- Legacy bad-data remediation.
- `calculation-summary` removal.
- Global primary display cutover.

## Final Ruling

```text
Global primary cutover: NO-GO
Guarded eligible subset pilot: CONDITIONAL GO / LIMITED GO
Opt-in shadow: APPROVED
Legacy fallback: REQUIRED
```

The project should not continue broad blocker chasing before a pilot. The safe
next step is a narrow feature-flagged pilot proposal that proves the fallback
contract in production code without expanding the domain model.
