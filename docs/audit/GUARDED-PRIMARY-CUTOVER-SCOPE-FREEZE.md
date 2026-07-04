# Guarded Primary Cutover Scope Freeze

## 1. Status

Planning completed. This document introduces no production behavior change.

Primary cutover remains **NO-GO** until this scope is approved and the minimal evidence pack passes.

This document freezes the scope for a guarded primary display pilot. It does not approve global primary cutover.

**Implementation reference (2026-07-05):** this document reflects the guard authority model as of ALC-AUTH-3D (PR #922 `8a340c23`, PR #925 `6c1304a3`) and ALC-AUTH-3E (PR #929 `d23003e8`). See §4 for the current authority mechanism; a future change to `guarded-primary-display.ts` requires re-synchronizing this document.

## 2. Core Decision

Primary cutover is not global.

Canonical balance/display may become primary only for explicitly eligible scenarios. Unsupported, risky, incomplete, contaminated, or diagnostically unsafe scenarios must continue to use legacy `calculation-summary` as the primary display source.

The current target is not to complete the full legal/accounting model. The current target is to define the minimum safe eligible subset for a guarded primary display pilot.

## 3. Eligible Subset Candidates

A case may be considered eligible only when all of the following are true:

- The case is a normal principal-only scenario or a principal scenario backed by safe canonical `finalDebtStates`.
- `finalDebtStates` exists and is authoritative for principal/outstanding display.
- Currency is known and consistent.
- Tenant and case context match.
- No hard no-go diagnostic is present.
- No restricted, earmarked, or designation-sensitive payment scope requires `PaymentDesignation`.
- No unsupported periodic obligation semantics are required.
- No legacy nafaka principal contamination is detected.
- No ClaimItem-derived collected/remaining amount is being used as canonical display authority.
- Shadow/canonical source is available and safe.

Eligibility is explicit. Absence of a blocker is not enough to imply eligibility.

## 4. Hard No-Go Diagnostics

**Authority model (post ALC-AUTH-3D, PR #922/#925):** the frontend no longer maintains its own fixed no-go diagnostic list. `evaluateGuardedPrimaryDisplayPilot()` defers to backend `report.cutoverReadiness.safeForPrimaryDisplay` as the single domain-safety authority — when `false`, every code in `report.cutoverReadiness.blockers` forces legacy fallback. Backend blocker codes currently observed include `FINAL_DEBT_STATES_MISSING`, `CURRENCY_MISMATCH`, `CONTEXT_MISMATCH`, `CANONICAL_CURRENCY_UNSAFE`, and RED-severity amount/bucket diffs (`OUTSTANDING_DELTA`, `PAID_DELTA`, `PRINCIPAL_BUCKET_DELTA`). This is documentation of current backend behavior, not the enforcement mechanism itself — the mechanism is the authority relationship (frontend trusts backend), not a fixed code list, so it stays correct as backend evolves.

In addition to backend-authority blockers, the frontend independently forces legacy fallback for:

- Missing or unsupported `PaymentDesignation` scope.
- Unsupported periodic obligation / `periodKey` requirement.
- ClaimItem-derived collected/remaining amount used as canonical display authority (`CLAIM_ITEM_AUTHORITY_CONTAMINATION`).
- `OVERPAYMENT_BLOCKED` / `RESTRICTED_PAYMENT_DISPLAY_UNSAFE` diagnostics present.
- `NAFAKA_PRINCIPAL_DISPLAY_RISK` diagnostic present.

**Cost/attorney-fee understatement (ALC-AUTH-3E, PR #929):** `COSTS_DELTA` and `ATTORNEY_FEE_DELTA` (and their bucket-level equivalents) are intentionally exempt from `cutoverReadiness.safeForPrimaryDisplay` (`B1_SCOPE_EXEMPT_DIFF_CODES`, ALC-AUTH-1A) — a case missing cost/attorney-fee `ClaimItem` data still passes the guard. This is handled separately: `toplamBorc`/`sonBorc`/`kalanBorc` fall back to legacy per-case when either diff is RED-severity, while the other 5 canonical-override fields are unaffected. This is not a hard no-go for the whole case — it is a narrower, field-level fallback.

A blocker being fixed does not automatically approve primary cutover. The complete eligible-scope gate must pass.

## 5. Legacy Fallback Rules

Legacy `calculation-summary` remains primary when any of the following is true:

- Feature flag is off.
- Case type is outside the frozen eligible subset.
- Any hard no-go diagnostic exists.
- `finalDebtStates` is absent.
- Currency is mismatched, unknown, multi-currency unsafe, or not comparable.
- Tenant/case context is mismatched.
- ClaimItem collected/remaining values would be used as display authority.
- Payment designation is required but unsupported.
- Periodic obligation semantics are required but unsupported.
- Shadow/canonical display source fails.
- Provenance is unsafe or incomplete.

Fallback is not an error path. It is the expected behavior for unsupported scenarios.

## 6. Excluded Scenarios for First Pilot

The first guarded pilot excludes:

- Restricted or earmarked payment scenarios requiring `PaymentDesignation`.
- Periodic-obligation-dependent nafaka/kira scenarios where `periodKey` is not implemented.
- Legacy PRINCIPAL nafaka remediation cases.
- Mixed-currency cases without explicit display policy.
- Unknown-currency or multi-currency unsafe display cases.
- Cross-case or cross-tenant context mismatch cases.
- Missing `finalDebtStates`.
- ClaimItem authority contamination.
- Overpayment cases where display would imply debt reduction from held or blocked overpayment.
- Shadow/canonical source failure.
- Unsupported rehin/ipotek scope cases unless separately proven safe.

The evidence pack must not expand scope by trying to solve these excluded scenarios.

## 7. Evidence Pack Boundary

The Minimal Evidence Pack will prove only the frozen scope.

It must assert:

- Eligible scenario passes as canonical primary candidate.
- Excluded scenario falls back to legacy.
- Hard no-go diagnostic blocks canonical primary.
- Unsafe canonical/shadow evidence never becomes primary.
- `finalDebtStates` is required for principal/outstanding authority.
- ClaimItem collected/remaining fields do not become display authority.
- Currency/context mismatch produces non-comparable/fallback behavior.
- Held overpayment is not shown as reducing debt.
- Blocked overpayment is not worded as created/collectible overpayment.
- Unsupported nafaka/periodic obligation scenario remains outside primary.
- A case with RED `COSTS_DELTA`/`ATTORNEY_FEE_DELTA` shows `toplamBorc`/`sonBorc`/`kalanBorc` from legacy while the other 5 canonical-override fields remain canonical (ALC-AUTH-3E).

The evidence pack is not a full model-completion project.

## 8. Feature Flag Policy

Guarded primary display pilot must be behind an explicit feature flag.

Policy:

- Flag off: legacy `calculation-summary` remains primary.
- Flag on + eligible: canonical balance/display may become primary.
- Flag on + no-go diagnostic: legacy fallback remains primary.
- Flag on + unsupported scenario: legacy fallback remains primary.
- Flag on + source failure: legacy fallback remains primary.

The flag must not enable global primary cutover.

## 9. Rollback Policy

Rollback means returning all primary display traffic to legacy `calculation-summary`.

Rollback must happen if any of the following occurs:

- Production display error.
- Unsafe diagnostic spike.
- Canonical/legacy mismatch spike outside accepted tolerance.
- Unsupported scenario reaches canonical primary.
- Payment designation ambiguity reaches primary display.
- Periodic obligation ambiguity reaches primary display.
- Legal/product wording constraint is violated.
- Provenance or authority source becomes ambiguous.

Rollback path must be operationally simple: disable the feature flag and keep legacy as primary.

## 10. Go/No-Go Checklist for Pilot

Pilot cannot proceed until all items are checked:

- [ ] Scope freeze approved.
- [ ] CB-04 merged.
- [ ] Minimal eligible subset tests pass.
- [ ] Hard no-go fallback tests pass.
- [ ] Feature flag behavior is tested.
- [ ] Rollback path is tested.
- [ ] No canonical primary outside eligible subset.
- [ ] `finalDebtStates` authority requirement is enforced.
- [ ] ClaimItem display-authority contamination is blocked.
- [ ] Currency/context mismatch is non-comparable or fallback.
- [ ] Overpayment wording/sign-off constraints are preserved.
- [ ] Nafaka/periodic unsupported cases remain outside pilot.
- [ ] Cost/attorney-fee understatement case falls back to legacy for `toplamBorc`/`sonBorc`/`kalanBorc` only, other 5 canonical-override fields unaffected (ALC-AUTH-3E).
- [ ] Legacy fallback remains intact.
- [ ] No global `calculation-summary` removal.

## 11. Explicit Non-Goals

This scope freeze does not include:

- PaymentDesignation implementation.
- PeriodicObligation schema/service.
- Legacy PRINCIPAL nafaka migration.
- ClaimItem refactor.
- Global `calculation-summary` removal.
- Global primary display cutover.
- BalanceComponent writable source-of-truth changes.
- FinancialEvent / BalanceSnapshot second backbone.
- Database migration.
- Full modeling of every enforcement/case type.
- UI source replacement.

## 12. Decision

Primary cutover remains **NO-GO**.

The next approved step after this document is merged is:

`test(balance): add guarded cutover eligibility evidence`

That evidence pack must stay within this frozen scope.
