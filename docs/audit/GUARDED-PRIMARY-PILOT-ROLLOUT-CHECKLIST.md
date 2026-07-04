# Guarded Primary Pilot Rollout Checklist

## 1. Status

The guarded primary display pilot code has landed behind an explicit feature flag.

This document does not enable the pilot in production.

Production remains default OFF.

Global primary cutover remains **NO-GO**.

The purpose of this checklist is to define how the guarded primary display pilot may be enabled in a controlled staging/internal environment, how smoke evidence must be collected, and when rollback is required.

## 2. Decision State

Current decision state:

- Global primary cutover: **NO-GO**
- Guarded eligible subset pilot: **CONDITIONAL GO / LIMITED GO**
- Opt-in shadow evidence: **APPROVED**
- Legacy `calculation-summary` fallback: **REQUIRED**
- Production feature flag: **DEFAULT OFF**

The pilot may only be evaluated for the frozen eligible subset.

Unsupported, risky, incomplete, or diagnostically unsafe scenarios must continue to use legacy `calculation-summary` as the primary display source.

## 3. Feature Flag Policy

The guarded primary display pilot is controlled by:

`NEXT_PUBLIC_GUARDED_PRIMARY_DISPLAY_PILOT`

Policy:

- Production default: `false`
- Staging/internal default: `false`
- Temporary staging/internal smoke: may be set to `true`
- Production enablement: requires separate GO decision after smoke evidence review
- Rollback: set the flag back to `false`

The flag must not be treated as approval for global primary cutover.

The flag only allows a guarded eligible subset candidate to use canonical primary display when every eligibility condition passes and no hard no-go diagnostic is present.

## 4. URL Opt-In Policy

The pilot requires URL opt-in:

`?guardedPrimary=1`

Expected behavior:

- Flag OFF + URL opt-in ON: legacy `calculation-summary` remains primary.
- Flag ON + URL opt-in OFF: legacy `calculation-summary` remains primary.
- Flag ON + URL opt-in ON + eligible case: guarded canonical primary candidate may be selected.
- Flag ON + URL opt-in ON + hard no-go diagnostic: legacy fallback remains primary.
- Flag ON + URL opt-in ON + unsupported case: legacy fallback remains primary.

URL opt-in alone must never enable primary display behavior.

## 5. Required Enablement Formula

The pilot may select guarded canonical primary only when all of the following are true:

- `NEXT_PUBLIC_GUARDED_PRIMARY_DISPLAY_PILOT=true`
- URL contains `?guardedPrimary=1`
- The case is inside the frozen eligible subset.
- `finalDebtStates` exists and is authoritative for principal/outstanding display.
- Currency is known and consistent.
- Tenant and case context match.
- No hard no-go diagnostic exists.
- No unsupported payment designation scope is required.
- No unsupported periodic obligation semantics are required.
- No ClaimItem-derived collected/remaining amount is used as canonical display authority.
- Shadow/canonical display source is available and safe.
- Legacy fallback remains available.

Any failed condition must result in legacy fallback.

## 6. Environments

### 6.1 Production

Production must remain default OFF.

Production environment variable:

`NEXT_PUBLIC_GUARDED_PRIMARY_DISPLAY_PILOT=false`

Production must not be enabled as part of this checklist PR.

### 6.2 Staging / Internal

Staging/internal may be used for smoke validation.

Temporary enablement:

`NEXT_PUBLIC_GUARDED_PRIMARY_DISPLAY_PILOT=true`

Smoke URL:

`?guardedPrimary=1`

The staging/internal smoke must include both eligible and no-go/fallback cases.

The smoke is invalid if it only tests the happy path.

## 7. Required Smoke Matrix

The smoke matrix must cover at least the following cases.

### 7.1 Eligible Case Smoke

Expected result:

- Guarded canonical primary candidate may be selected.
- Legacy fallback remains available.
- Shadow evidence remains visible/auditable where applicable.
- No hard no-go diagnostic is present.
- Principal/outstanding authority is backed by `finalDebtStates`.

Minimum checks:

- Feature flag ON.
- URL opt-in ON.
- Case is in frozen eligible subset.
- Currency is known and consistent.
- Tenant/case context matches.
- `finalDebtStates` exists.
- Display does not use ClaimItem collected/remaining as authority.

### 7.2 Feature Flag OFF Smoke

Expected result:

- Legacy `calculation-summary` remains primary.
- URL opt-in must not override the flag.

Required check:

- `NEXT_PUBLIC_GUARDED_PRIMARY_DISPLAY_PILOT=false`
- URL contains `?guardedPrimary=1`
- Result: legacy primary

### 7.3 URL Opt-In OFF Smoke

Expected result:

- Legacy `calculation-summary` remains primary.

Required check:

- `NEXT_PUBLIC_GUARDED_PRIMARY_DISPLAY_PILOT=true`
- URL does not contain `?guardedPrimary=1`
- Result: legacy primary

### 7.4 Hard No-Go Diagnostic Smoke

Expected result:

- Legacy fallback remains primary.
- Canonical display must not become primary.

At least the following diagnostics or equivalent unsafe states must be covered:

- `FINAL_DEBT_STATES_MISSING`
- `FINAL_DEBT_STATES_CURRENCY_MISMATCH`
- `CURRENCY_MISMATCH`
- `CONTEXT_MISMATCH`
- `CANONICAL_CURRENCY_UNSAFE`
- `MULTI_CURRENCY_DISPLAY_UNSAFE`
- `CLAIM_ITEM_COLLECTED_AMOUNT_NOT_AUTHORITY`
- `OVERPAYMENT_BLOCKED`
- `RESTRICTED_PAYMENT_DISPLAY_UNSAFE`
- `NAFAKA_PRINCIPAL_DISPLAY_RISK`

### 7.5 Unsupported Scenario Smoke

Expected result:

- Legacy fallback remains primary.

Unsupported scenarios include:

- Restricted or earmarked payment requiring `PaymentDesignation`
- Missing or unsupported `PaymentDesignation` scope
- Periodic obligation / `periodKey` requirement
- Unsupported nafaka/kira periodic semantics
- Legacy PRINCIPAL nafaka remediation case
- Mixed-currency case without explicit display policy
- Cross-case or cross-tenant mismatch
- Missing `finalDebtStates`
- ClaimItem authority contamination
- Shadow/canonical source failure
- Unsupported rehin/ipotek scope unless separately proven safe

### 7.6 Overpayment Smoke

Expected result:

- HELD overpayment is not shown as reducing debt.
- `OVERPAYMENT_BLOCKED` is not worded as collectible or created overpayment.
- Unsafe overpayment state falls back or remains diagnostic-only.

### 7.7 Shadow Source Failure Smoke

Expected result:

- Legacy fallback remains primary.
- Source failure must not become canonical primary.
- Failure must be visible as diagnostic/evidence, not hidden as success.

## 8. Evidence to Capture

For each smoke case, capture:

- Environment
- Commit SHA
- Feature flag value
- URL used
- Case identifier or fixture name
- Eligible/ineligible classification
- Diagnostics present
- Selected primary source
- Whether legacy fallback remained available
- Whether shadow evidence was retained
- Result: PASS / FAIL
- Screenshot or log reference when applicable

The smoke report must explicitly state whether the case used:

- guarded canonical primary
- legacy fallback
- non-comparable / diagnostic-only state

## 9. Rollback Triggers

Rollback is required if any of the following occurs:

- Unsupported scenario reaches guarded canonical primary.
- Any hard no-go diagnostic reaches guarded canonical primary.
- Feature flag OFF still allows guarded primary.
- URL opt-in alone enables guarded primary.
- Currency mismatch produces amount comparison.
- Context mismatch produces amount comparison.
- Missing `finalDebtStates` still produces principal/outstanding authority.
- ClaimItem collected/remaining becomes display authority.
- HELD overpayment is shown as reducing debt.
- `OVERPAYMENT_BLOCKED` is worded as created, collectible, or payable overpayment.
- Restricted/earmarked payment is shown as free overpayment without `PaymentDesignation`.
- Unsupported nafaka/periodic scenario becomes primary.
- Shadow/canonical source failure becomes primary.
- Legacy fallback is unavailable.
- Production display error occurs.
- Diagnostic spike or mismatch spike exceeds accepted tolerance.
- Legal/product wording constraint is violated.
- Provenance or authority source becomes ambiguous.

## 10. Rollback Procedure

Rollback procedure:

1. Set `NEXT_PUBLIC_GUARDED_PRIMARY_DISPLAY_PILOT=false`.
2. Redeploy or refresh the affected environment configuration.
3. Confirm `?guardedPrimary=1` no longer enables guarded primary.
4. Confirm legacy `calculation-summary` is primary.
5. Capture rollback verification evidence.
6. Record the trigger and affected case/scenario.
7. Do not re-enable until the issue is classified and fixed or explicitly scoped out.

Rollback must not require code rollback.

The expected rollback path is feature flag disablement.

## 11. Production Policy

Production remains OFF until a separate GO/NO-GO decision is recorded.

This checklist does not authorize production rollout.

Before production enablement, the team must have:

- Approved staging/internal smoke evidence
- Confirmed rollback path
- Confirmed default OFF behavior
- Confirmed URL opt-in behavior
- Confirmed hard no-go fallback
- Confirmed unsupported scenario fallback
- Confirmed legal/product wording constraints
- Confirmed no global `calculation-summary` removal
- Confirmed global primary cutover remains NO-GO

## 12. GO / NO-GO After Smoke

After staging/internal smoke, the result must be classified as one of:

- `GO_FOR_CONTROLLED_INTERNAL_PILOT`
- `NO_GO_FIX_REQUIRED`
- `NO_GO_SCOPE_TOO_BROAD`
- `NO_GO_UNSAFE_DIAGNOSTICS`
- `NO_GO_LEGACY_FALLBACK_BROKEN`

A GO decision may only apply to the frozen eligible subset.

A GO decision must not be interpreted as global primary cutover approval.

## 13. Explicit Non-Goals

This rollout checklist does not include:

- Production feature flag enablement
- Global primary cutover
- Global `calculation-summary` removal
- UI-wide source replacement
- PaymentDesignation implementation
- PeriodicObligation implementation
- Legacy PRINCIPAL nafaka migration
- ClaimItem refactor
- Backend schema migration
- Database migration
- Full modeling of every enforcement/case type
- BalanceComponent writable source-of-truth changes
- FinancialEvent / BalanceSnapshot second backbone

## 14. Final Decision

The guarded primary display pilot may be smoke-tested only in staging/internal environments with:

- explicit feature flag ON
- URL opt-in
- eligible subset only
- hard no-go fallback
- unsupported scenario fallback
- legacy `calculation-summary` fallback
- shadow evidence retention
- flag-disable rollback

Production remains default OFF.

Global primary cutover remains **NO-GO**.
