# ACCT-3 Distribution Recommendation Closure Gate

**Status:** Ready for owner closure.
**Scope:** Documentation-only closure review. No runtime behavior, schema, migration, controller, authorization, posting, writer, legal ledger, TBK100, or test logic change.
**Reviewed on:** 2026-07-01.
**Canonical HEAD reviewed:** `d5cfaa570be22793613e7f1409d8935e79ba0fd9`.

## Purpose

This gate reviews whether ACCT-3 Distribution Recommendation has remaining contract, test, documentation, or controller-boundary work after ACCT-3A through ACCT-3D.

Conclusion: ACCT-3 is technically ready for owner closure. No blocking backend contract, HTTP boundary, docs, controller, schema, migration, posting, writer, legal ledger, or TBK100 work remains in the ACCT-3A-D scope.

## Merge Evidence

| Slice | Evidence | Squash SHA |
|---|---|---|
| ACCT-3A | Distribution Recommendation design gate | `71dea4efdd5b35416f107a539f1b2ecc202ffed9` |
| ACCT-3B | Service advisory contract lock | `7704b41f3592dd9d3ddbae58dd50127ac2d53a5b` |
| ACCT-3C | HTTP smoke / controller boundary lock | `455de250b9f026a16701d778dc1b8401c16f2208` |
| ACCT-3D | Usage documentation | `f85f81fc10f1ab4699b3f21e72bc9c243654e56f` |
| ACCT-3D follow-up | Debug interpretation boundaries | `44a15240509813164bc50f01de28c3e249ce92ba` |

Implementation ground already present before the A-D closure slices:

- `36afa4fb` - S8-B FAZ-1a distribution recommendation generator.

## Reviewed Sources

- `CLAUDE.md`
- `project/docs/finance/acct-3a-distribution-recommendation-design-gate.md`
- `project/docs/finance/acct-3d-distribution-recommendation-operator-usage.md`
- `project/apps/api/src/modules/client-settlement/dto/distribution-recommendation.dto.ts`
- `project/apps/api/src/modules/client-settlement/distribution-recommendation.service.ts`
- `project/apps/api/src/modules/client-settlement/disposition.controller.ts`
- `project/apps/api/src/modules/client-settlement/__tests__/distribution-recommendation.service.spec.ts`
- `project/apps/api/src/modules/client-settlement/__tests__/distribution-recommendation.http-smoke.spec.ts`

## Contract Readiness

The advisory contract is locked and internally consistent:

- Request supports empty body or `attorneyFee.mode=AMOUNT`.
- `attorneyFee.amount` is a faithful decimal string, rejects JSON numbers/floats, rejects invalid values, rejects more than 2 decimals, and rejects values above gross.
- Response envelope carries `recommendOnly=true` and `financialEffect=false`.
- Response fields are bounded to preview evidence: `dispositionId`, `status`, `currency`, `gross`, `beneficiaryScope`, `suggestedLines`, `sumCheck`, `expenseModule`, and `warnings`.
- `suggestedLines` are editable FE pre-fill candidates, not persisted distribution lines.
- `sumCheck` is arithmetic evidence only; it is not journal correctness, legal entitlement, approval readiness, or accounting sign-off.

## HTTP Boundary Readiness

The HTTP boundary is locked by smoke coverage:

- No JWT returns `401`.
- Admin JWT returns `201` with the advisory response contract.
- Non-admin JWT returns `201` under the existing JWT-only route behavior.
- Query/body `tenantId` spoofing is ignored; authenticated tenant context wins.
- Invalid advisory body returns `400`.
- HTTP path does not delegate to `recommend()`, `approve()`, `post()`, DB write paths, office approval writes, or accounting journal writes.

## Auth Decision

The current route is intentionally documented and tested as JWT-only:

- `DispositionController` is guarded by `JwtAuthGuard`.
- The distribution recommendation method has no method-level `AdminGuard`.
- ACCT-3C explicitly locked non-admin JWT access as existing behavior.
- ACCT-3D documents this route/auth model and states that the documentation does not authorize an auth behavior change.

Changing this to admin-only or role-gated behavior would be a separate authorization decision, not ACCT-3 closure work.

## Non-Posting And Ledger Boundaries

ACCT-3 remains advisory-only:

- It does not approve.
- It does not post.
- It does not persist recommendation lines.
- It does not call posting/writer/journal paths.
- It is not a legal ledger, TBK100 statement, legal projection, trial balance input, or periodized accounting report.
- It does not perform FX conversion, reporting-currency normalization, or recommendation confidence scoring.

Persisted lines and financial effect remain in the separate `recommend() -> approve() -> post()` lifecycle.

## Manual Boundaries

The remaining manual boundaries are deliberate non-goals, not closure blockers:

- `CASE_CREDITOR_CLUSTER` remains manual; no share-ratio engine is introduced.
- Expense reimbursement remains candidate-only; auto-apply is disabled until a later approved phase.
- Fee rate automation and fee agreement modeling remain future-phase work.
- Legal allocation/TBK100 recalculation remains outside this advisory endpoint.

## Closure Readiness

ACCT-3 can close from the backend boundary perspective.

No further ACCT-3A-D work is required for:

- advisory service contract
- HTTP/controller boundary
- JWT-only/non-admin access documentation and smoke lock
- tenant/auth-context protection
- no-write/no-posting/no-journal guardrails
- operator/debug usage documentation
- schema/migration/posting/writer/legal-ledger/TBK100 non-change boundary

The only remaining action is governance closure: owner may update roadmap/backlog state to reflect ACCT-3 closed. That governance status update should be explicit; this gate does not move backlog or roadmap state by itself.
