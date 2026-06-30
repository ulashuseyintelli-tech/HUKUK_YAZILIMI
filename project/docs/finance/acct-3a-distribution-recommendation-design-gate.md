# ACCT-3A Distribution Recommendation Design Gate

**Status:** Accepted design gate for ACCT-3 entry work.
**Scope:** Documentation-only boundary lock. No runtime behavior, schema, migration, writer, posting, controller, authorization, legal ledger, or TBK100 change.
**Related:** `docs/governance/active-roadmap.md` PHASE 3, `docs/governance/product-backlog.md` ACCT-3, `docs/finance/tm3-collection-disposition-boundary.md`, `docs/adr/ADR-010-ACCOUNTING-JOURNAL-SOT-NORTH-STAR.md`.

## Purpose

Distribution Recommendation is an advisory preview for splitting a `HELD_PENDING_DISTRIBUTION` collection disposition into candidate posted distribution lines.

It exists to reduce an empty operator form into a faithful, editable pre-fill. It does not approve, post, write accounting journal entries, mutate legal allocation, or create financial effect by itself.

The current implementation surface is:

- `POST /collection-dispositions/:id/distribution-recommendation`
- `DistributionRecommendationService.generate()`
- `GenerateDistributionRecommendationDto` / `DistributionRecommendation`
- focused unit coverage in `distribution-recommendation.service.spec.ts`

## Existing Ground

The repo already contains the ACCT-3 / S8-B FAZ-1a advisory path. It is intentionally narrower than the disposition lifecycle:

| Layer | Current role | Boundary |
|---|---|---|
| `DistributionRecommendationService` | Produces an advisory preview | No persistence, no approval, no post, no financial effect |
| `DispositionPostingService.recommend()` | Persists user-chosen lines and opens P4 approval | Domain mutation, still no financial posting |
| `DispositionPostingService.approve()` | Records approval decision | No financial posting |
| `DispositionPostingService.post()` | Applies approved financial effect | Only after approval and post guards |

The roadmap distinction remains important: #647 provided the recommend/approve/post lifecycle. ACCT-3 is the advisory auto-split recommendation layer that feeds that lifecycle.

## Design Decisions

1. Distribution Recommendation is advisory-only.
   - Response must carry `recommendOnly: true` and `financialEffect: false`.
   - Suggested lines are candidates for FE pre-fill and later user review.
   - The recommendation endpoint must not call `recommend()`, `approve()`, `post()`, `AccountingJournalWriterService`, or any write path.

2. Existing legal allocation and TBK100 authority are read boundaries, not recomputation targets.
   - TBK100 rules remain legal authority under ADR-010.
   - `LedgerEntry` / `LedgerAllocation` remain the current legal allocation storage until a separate shadow/prove/legal-signoff cutover.
   - Recommendation may use existing legal allocation evidence in a future phase, but must not recalculate or overwrite it.

3. Manual approval is preserved.
   - Recommendation output is editable and non-authoritative.
   - Persisted distribution lines are created only by the existing `:id/recommend` lifecycle action.
   - Posting remains gated by `DISTRIBUTION_APPROVED` and P4 approval checks.

4. Decimal faithfulness is part of the boundary.
   - Money inputs and outputs remain faithful decimal strings.
   - Float/number fee input is rejected at the service boundary.
   - Suggested line sum must equal disposition gross when the recommendation produces lines.

5. Tenant and beneficiary scope stay explicit.
   - Disposition lookup is tenant-scoped.
   - `SINGLE_CASE_CLIENT` may produce `CLIENT_PAYABLE` for the disposition `caseClientId`.
   - `CASE_CREDITOR_CLUSTER` remains manual in FAZ-1a; no implicit share-ratio engine is introduced.
   - `CollectionDisposition.clientId` remains forbidden by TM3; client attribution flows through `caseClientId` or cluster scope.

6. Expense reimbursement remains candidate-only in the current phase.
   - Expense candidates may be listed as evidence for the operator.
   - Auto-apply is disabled while the required approval field/flow is absent.
   - Candidate expenses must stay outside `suggestedLines` until a later approved phase.

## Current Contract Shape

`DistributionRecommendation` should remain additive and preview-oriented:

| Field | Meaning |
|---|---|
| `dispositionId` | Source `CollectionDisposition` id. |
| `status` | Must be `HELD_PENDING_DISTRIBUTION` for generation. |
| `currency` | Disposition currency. |
| `gross` | Disposition `totalAmount` as a faithful decimal string. |
| `beneficiaryScope` | Distribution beneficiary scope, currently `SINGLE_CASE_CLIENT` or cluster/manual boundary. |
| `recommendOnly` | Always `true`; caller must use lifecycle endpoints to persist. |
| `financialEffect` | Always `false`; no posting or accounting effect. |
| `suggestedLines` | Editable pre-fill candidate lines. FAZ-1a supports manual fee plus client-payable residual. |
| `sumCheck` | Evidence that suggested line total equals gross where applicable. |
| `expenseModule` | Candidate-only expense visibility; auto-apply disabled. |
| `warnings` | Human-readable advisory warnings; not legal/accounting statements. |

## Non-Goals

ACCT-3A does not authorize any of the following:

- schema or migration changes
- runtime posting behavior changes
- writer or AccountingJournal write changes
- TBK100/legal ledger recalculation
- legal allocation storage cutover
- automatic approval or posting
- cluster share-ratio engine
- expense reimbursement auto-apply
- reporting, legal ledger, or operator accounting statement semantics

## Risks And Guardrails

- Fee agreement automation is not yet modeled in this gate. FAZ-1a uses manual amount mode; rate/base precedence requires a later explicit design gate.
- Cluster distribution has no share-ratio source in FAZ-1a. It must remain manual until a `CaseCreditorCluster` or equivalent approved model exists.
- Expense reimbursement can be financially sensitive. Candidate listing is safe; auto-apply needs a separate approval/data model decision.
- Recommendation output can look authoritative to UI users. UI copy and lifecycle placement must keep it visibly editable and non-posting.

## ACCT-3B Recommended Scope

Next implementation should be small and code-focused:

**ACCT-3B Distribution Recommendation Contract Lock**

- Keep scope to `dto` / `service` / focused unit tests.
- Add or tighten service assertions for the current advisory contract: `recommendOnly`, `financialEffect`, tenant-scoped lookup, cluster manual warning, expense candidate-only behavior, and no writer/posting delegation.
- Do not add schema, migration, controller, auth, runtime posting, writer, legal ledger, or TBK100 behavior.
- Do not introduce fee-rate automation, cluster share-ratio, or expense auto-apply without a separate design gate.