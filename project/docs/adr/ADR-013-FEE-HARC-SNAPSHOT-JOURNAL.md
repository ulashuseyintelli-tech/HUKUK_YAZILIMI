# ADR-013: Fee / Harç / Snapshot / Journal Owner Review Draft

**Status:** Draft / owner review required / boundary audit blocked before implementation
**Date:** 2026-07-10
**Deciders:** Owner - Ulas
**Related:** PAC-001-A Authority Maps, PR #1024, merge SHA `281befe70acbe585c2a1bb7640533e17e7c19a8d`, GOV-ADR-NAMING-000, ADR-010, ADR-012 (Waiting & Progress Policy / DX-005), ADR-014 (CCB-001 Canonical Legal Calculation Core)

> **Reading note:** This is an owner-review draft. It records AS-IS evidence and candidate TO-BE options for the Fee / Harç / Snapshot / Journal architecture line. It does not select canonical producer ownership, approve a producer chain, approve an implementation PR sequence, authorize fee implementation, start PAC-Full, or start CCB-001 / ADR-014 cutover work.

## 1. Context

`GOV-ADR-NAMING-000` reserved `ADR-013` for the Fee / Harç / Snapshot / Journal architecture line after `ADR-012` became canonical for DX-005 / Waiting & Progress Policy. `PAC-001-A Authority Maps` is now merged in canonical main and provides the official evidence gate for this draft.

The immediate problem is not implementation. The immediate problem is authority classification:

```text
No implementation PR may introduce or preserve an unclassified calculation authority.
```

Fee, harç, snapshot, journal, projection, calculation, persistence, presentation, and external-adapter surfaces currently overlap. ADR-013 must separate verified repo facts from candidate architecture before any fee code or persistence work can start.

## 2. Scope

This ADR draft covers owner-review framing for:

- Fee and harç authority boundaries.
- Tariff materialization and fail-closed tariff evidence.
- Fee projection and diagnostic projection boundaries.
- Snapshot evidence boundaries and future hash/lifecycle decisions.
- Journal interaction boundaries, subject to ADR-010.
- Calculation, persistence, presentation, and external-adapter surfaces that may affect fee/balance correctness.
- Boundary-audit questions required before any implementation.

`ADR-013` remains the canonical Fee / Harç / Snapshot / Journal target. `ADR-014` remains the separate CCB-001 Canonical Legal Calculation Core architecture. This draft does not merge those two decision spaces.

## 3. Non-goals

This draft does not authorize:

- Source code changes.
- Test changes.
- Schema or migration changes.
- Runtime behavior changes.
- Fee implementation.
- PAC-Full.
- CCB-001 / ADR-014 cutover work.
- TariffService refactor.
- FeeEngine refactor.
- Peşin harç, tahsil harcı, cezaevi harcı, or other fee formula changes.
- Snapshot or journal persistence.
- Official snapshot hash/lifecycle spec.
- Projection layer implementation.
- UI, report, template, or adapter changes.
- Canonical producer ownership selection.
- Approved implementation PR sequence.

## 4. Canonical inputs

| Input | Status | Use in this draft |
|---|---|---|
| PAC-001-A Authority Maps | CLOSED / MERGED / CANONICAL_MAIN_INCLUDED | Official AS-IS evidence and audit rubric input. |
| PR #1024 | MERGED | Delivery record for PAC-001-A. |
| Merge SHA `281befe70acbe585c2a1bb7640533e17e7c19a8d` | Canonical main included | Evidence baseline for this draft. |
| GOV-ADR-NAMING-000 | CLOSED / MERGED | Keeps `ADR-012` as DX-005 and `ADR-013` as Fee / Harç / Snapshot / Journal. |
| ADR-010 | LOCKED direction | AccountingJournal is north-star financial-event SoT direction; today it does not supersede additive/shadow contracts. |
| ADR-014 | LOCKED direction; PR-gated | CCB-001 Canonical Legal Calculation Core. Separate from ADR-013. |

Terminology rule:

```text
ADR-012 = Waiting & Progress Policy / DX-005.
ADR-013 = Fee / Harç / Snapshot / Journal.
ADR-014 = CCB-001 Canonical Legal Calculation Core.
ADR-012-FEE is not canonical terminology.
```

## 5. AS-IS evidence from PAC-001-A

PAC-001-A records these AS-IS anchor areas:

| Area | Evidence anchors |
|---|---|
| Calculation | Interest engine, case-balance orchestration, summary-engine, case service calculation-summary surfaces. |
| Fee | `TariffService`, `FeeEngineService`, `ExpenseCalculatorService`, tariff config. |
| Projection / diagnostics | Balance-display shadow diff, calculation preview diagnostics, financial-statement projection surfaces. |
| Persistence | Accounting journal modules, diagnostics persistence, calculation evidence surfaces. |
| Presentation | Case UI, report components, report service, template engine, document surfaces. |
| External adapters / decision support | UYAP, bank/client-settlement adapters, icrabot, AI/risk modules. |

PAC-001-A also records six authority classes that ADR-013 must keep distinct:

- Calculation Authority.
- Fee Authority.
- Projection Authority.
- Persistence Authority.
- Presentation Authority.
- External Adapter Authority.

The producer, forbidden-edge, and gate tables in PAC-001-A are audit rubrics. They are not owner-approved implementation sequence or final authority assignment.

## 6. VERIFIED findings

These findings are accepted as verified canonical-main evidence for owner review. They do not by themselves select final ownership or remediation.

| Finding | Classification | ADR-013 treatment |
|---|---|---|
| `TariffService` implements `ITariffRepository` and has fail-closed `MissingTariffSectionError` / `toSharedFormat()` required-section validation. | VERIFIED | Candidate tariff/materialization authority evidence; final role requires boundary audit. |
| `FeeEngineService` exposes `calculateOpeningFees()`, `calculatePenalty()`, and `previewCalculation()`. | VERIFIED | Candidate fee producer/orchestrator evidence; not declared final single source here. |
| `ExpenseCalculatorService` injects `TariffService`. | VERIFIED / REQUIRES_VERIFICATION for role | Existing participant evidence; exact authority role remains open. |
| `CaseService.getCalculationSummary()` still contains legacy calculation-summary logic and canonical shadow path evidence. | VERIFIED | Mixed legacy/diagnostic calculation evidence; behavior unchanged. |
| `CaseBalanceService` / summary surfaces exist as balance/summary producers or orchestrators. | VERIFIED | Calculation-authority candidates; final owner boundary pending. |
| `ReportService`, template engine, and web account-summary display surfaces produce or display monetary summaries. | VERIFIED | Presentation/report duplicate-risk candidates; remediation not approved here. |
| UYAP, bank, icrabot, AI, and risk modules move source facts, events, suggestions, or decision-support outputs. | VERIFIED | External-adapter / decision-support evidence; not legal/fee/balance authority by this draft alone. |
| `AllocationEngineService` and `TBK100AllocatorService` are independent implementations, do not call each other, and the orchestrator uses only `AllocationEngineService`. | VERIFIED | Do not model them as one canonical runtime chain. Any future unification or delegation requires owner decision. |
| `toCaseBalanceDisplay.authority` is `SHADOW_ONLY` on canonical main. | VERIFIED | Current canonical-main authority metadata state; no cutover follows from this draft. |
| `Case.principalAmount` is written from two sources in the same transaction path. | VERIFIED | Duplicate-principal source risk; must be classified before behavior change. |
| `disposition-posting.service.ts` writes directly to `CaseBalance` and `BalanceLedger`. | VERIFIED | Persistence authority risk; classify possible authority violation before ADR-013 code changes. |
| Live `Hesap Özeti` has a dual-source presentation path. | VERIFIED | Presentation calculation / DTO-consumption risk; classify before UI/report changes. |
| Three parallel interest-rate source surfaces exist. | VERIFIED | Multi-source interest-rate risk; ownership must be classified before behavior change. |

## 7. DISPUTED findings

No canonical-main repo fact is currently recorded as disputed by PAC-001-A after reconciliation. The resolved dispute was between older normative assumptions and verified code evidence.

For this draft, `DISPUTED` is reserved for future owner-review cases where evidence sources conflict and the conflict cannot be resolved from canonical main or explicitly identified branch context.

Current disputed bucket:

| Item | Classification | Status |
|---|---|---|
| Final canonical producer ownership for fee, projection, snapshot, and journal interactions | DISPUTED / OWNER_DECISION_REQUIRED | Not selected in this draft. |
| Whether any candidate TO-BE option should become binding ADR-013 architecture | DISPUTED / OWNER_DECISION_REQUIRED | Requires owner review. |

## 8. BRANCH_ONLY / unmerged evidence

| Evidence | Classification | ADR-013 treatment |
|---|---|---|
| `CANONICAL_CANDIDATE` authority metadata exists on the unmerged CCB-001-R branch. | BRANCH_ONLY / UNMERGED CCB-001-R | Not canonical-main state. Do not treat as canonical-main dispute. |
| CCB-001-R reconciliation details and validation evidence on branch commit `961bbaf3`. | BRANCH_ONLY / UNMERGED CCB-001-R | Relevant to ADR-014 / CCB-001 context only. Does not authorize ADR-013 implementation. |

Branch-only evidence may inform questions, but it must not be cited as current production behavior.

## 9. UNKNOWN / REQUIRES_VERIFICATION surfaces

These surfaces remain open until ADR-013 Boundary Audit verifies call graph, behavior, authority role, and persistence impact:

| Surface | Classification | Required next check |
|---|---|---|
| `project/apps/api/src/modules/expense-request/expense-calculator.service.ts` real authority role | UNKNOWN / REQUIRES_VERIFICATION | Determine whether it is a fee authority participant, compatibility wrapper, duplicate formula surface, or consumer. |
| `project/apps/api/src/modules/accounting-journal/accounting-journal-financial-statement.projection.service.ts` real projection role | UNKNOWN / REQUIRES_VERIFICATION | Determine whether it is diagnostic projection, financial-statement projection, journal consumer, or unauthorized producer. |
| Other fee/balance producer candidates added by file name or draft inventory only | UNKNOWN / REQUIRES_VERIFICATION | Verify direct code evidence before assigning authority. |
| External adapter surfaces whose call graph and behavior were not directly verified | UNKNOWN / REQUIRES_VERIFICATION | Confirm they produce only source facts/candidates and do not calculate legal/fee/balance outcomes. |
| Fee/balance producer surfaces not directly verified in PAC-001-A | UNKNOWN / REQUIRES_VERIFICATION | Keep as candidate-to-classify; do not approve producer chain. |
| Forbidden-edge entries without direct evidence | UNKNOWN / REQUIRES_VERIFICATION | Treat as audit candidates, not proven violations. |

## 10. TO-BE candidate architecture options

The options below are candidates for owner review. None is approved by this draft.

### Option A - Separate fee authority with DTO-only consumers

Candidate direction:

```text
Tariff / legal policy records
-> classified fee authority surface
-> fee projection DTO
-> presentation/report/template consumers
```

Open point: this option must prove which service owns tariff materialization, formula application, diagnostics, and owner/legal policy exceptions. It must also prove that report/template/UI layers consume DTOs rather than execute formulas.

### Option B - Projection-first evidence gate before official snapshot

Candidate direction:

```text
classified calculation and fee inputs
-> diagnostic projection
-> readiness / blockers / evidence
-> later owner-approved snapshot lifecycle
```

Open point: this option keeps projection non-official until owner approves snapshot hash/lifecycle semantics. It does not write durable official snapshots.

### Option C - Journal-aligned persistence boundary

Candidate direction:

```text
fee / balance classification
-> journal compatibility decision
-> ADR-010 aligned financial-event path
```

Open point: this option must not invert ADR-010. AccountingJournal north-star direction remains gated; snapshot evidence cannot become a journal substitute.

### Option D - Compatibility-wrapper transition after boundary audit

Candidate direction:

```text
legacy or mixed surfaces
-> explicitly marked compatibility wrappers
-> bounded expiry / delegation proof
-> later implementation GO
```

Open point: this option may reduce migration risk, but only after the boundary audit identifies all duplicate formulas, unsafe fallbacks, and presentation calculations.

## 11. Owner-review questions

1. Which surface should own fee formula application after boundary audit: `FeeEngineService`, a distinct fee projection layer, a tariff/materialization boundary, or another explicitly named owner?
2. What is the legal/business classification of peşin harç minimum/floor behavior, and who owns that rule?
3. How should tahsil harcı and cezaevi harcı applicability be represented: tariff data, legal policy record, owner decision table, or code-owned formula?
4. Should `ExpenseCalculatorService` remain a participant, become a compatibility wrapper, or be removed/delegated after classification?
5. What is the official boundary between diagnostic projection and snapshot evidence?
6. What hash/lifecycle semantics are required before any official snapshot persistence exists?
7. How should `disposition-posting.service.ts` direct writes to `CaseBalance` / `BalanceLedger` be classified relative to ADR-010 and future ADR-013 persistence?
8. Which presentation surfaces may show fee/balance diagnostics, and which must be restricted to canonical DTO consumption?
9. Should branch-only `CANONICAL_CANDIDATE` evidence from CCB-001-R influence ADR-013 wording, or remain ADR-014-only context?
10. What acceptance evidence is required before fee implementation can start?

## 12. Boundary audit checklist

ADR-013 Boundary Audit must complete before implementation:

- Classify every fee, harç, balance, projection, snapshot, journal, presentation, and adapter surface as `CANONICAL_AUTHORITY`, `COMPATIBILITY_WRAPPER`, `DIAGNOSTIC_ONLY`, `DUPLICATE_FORMULA`, `UNSAFE_FALLBACK`, `PRESENTATION_CALCULATION`, `DEAD_CODE_CANDIDATE`, or `UNKNOWN`.
- Verify whether `ExpenseCalculatorService` is a producer, wrapper, consumer, or duplicate formula surface.
- Verify whether `accounting-journal-financial-statement.projection.service.ts` is diagnostic projection or persistence-adjacent authority.
- Trace direct writes from `disposition-posting.service.ts` to `CaseBalance` / `BalanceLedger`.
- Trace live `Hesap Özeti` data sources and mark any presentation calculation.
- Identify all tariff fallback paths and fail-closed gaps.
- Identify all hardcoded harç formulas in case, report, template, expense, and UI layers.
- Confirm that `AllocationEngineService` and `TBK100AllocatorService` are not represented as one runtime chain unless code evidence later proves delegation.
- Preserve `SHADOW_ONLY` as canonical-main authority metadata unless a separate owner-approved cutover changes it.
- Separate canonical-main facts from branch-only CCB-001-R evidence.
- Confirm that external adapters produce source facts/candidates only.
- Produce an owner-review table of remaining `UNKNOWN / REQUIRES_VERIFICATION` items.

## 13. Implementation blockers

Fee implementation remains blocked until all of the following are true:

- ADR-013 Boundary Audit is separately authorized and closed.
- Owner selects or rejects a TO-BE architecture option.
- Final producer ownership is explicitly approved.
- Forbidden-edge remediation is explicitly approved.
- Snapshot hash/lifecycle semantics are explicitly approved if snapshots are in scope.
- Journal interaction is reconciled with ADR-010.
- CCB-001 / ADR-014 boundary is preserved.
- Any implementation PR sequence is separately approved.
- Tests required by the selected implementation scope are identified.

## 14. Explicit non-authorization clause

This ADR draft is documentation only.

It does not authorize:

```text
source code changes
test changes
schema or migration changes
runtime behavior changes
fee implementation
PAC-Full
CCB-001 / ADR-014 cutover
canonical producer ownership selection
approved producer chain
approved implementation PR sequence
snapshot persistence
journal persistence
UI/report/template adapter changes
```

Any future implementation requires a separate owner GO after boundary audit closure.

## 15. Next-step proposal

Recommended next step for owner review:

```text
GO-ANALYZE ADR-013 BOUNDARY AUDIT
```

Proposed read-only output:

- Canonical-main call graph and producer classification table.
- Verified duplicate formula and unsafe fallback list.
- `UNKNOWN / REQUIRES_VERIFICATION` closure table.
- Owner decision matrix for TO-BE option selection.
- Explicit implementation blockers and acceptance tests.

Fee implementation should remain blocked until that audit closes.

## 15A. Narrow ratification — receipt-bound canonical application snapshot

Owner, TPA-04A Option C kapsamında yalnız aşağıdaki dar alt türü ratifiye etmiştir:

```text
CanonicalReceivableApplicationSnapshotV1
```

Bu alt tür yalnız bir canonical Collection receipt'ine bağlı LegalApplication plan/writer
girdisidir. Snapshot semantiği Receivable'a, embedded persistence RCV-COL Legal Application
Boundary'ye ve fiziksel envelope `LegalApplicationBatch` aggregate'ine aittir. Current Balance
Engine `SHADOW_ONLY`; production authority, writer ve cutover yoktur.

Bu narrow ratification:

- general presentation snapshot'ını,
- Fee/Harç snapshot veya producer ownership'ini,
- Journal snapshot/posting authority'sini,
- consumer authority/cutover'ını,
- broader snapshot lifecycle'ını

karara bağlamaz. Bu alanlar ADR-013'ün draft/owner-review ve boundary-audit kapsamı olarak
`OPEN` kalır. Belgenin genel `DRAFT / OWNER REVIEW REQUIRED` statüsü değişmez.

Narrow subtype'ın canonical eligibility, envelope, RCV-CAS/v1 serialization/hash, deterministic
bucket identity ve fail-closed plan kontratı `RECEIVABLE-GOVERNANCE.md` içindeki
`REC-AUTH-025` ve `REC-ALLOC-016`, `SYSTEM-CONSTITUTION.md` içindeki `SYS-FIN-013D` ve
ADR-014 TPA-04A kaydıyla birlikte okunur. Bu kayıt kod, test, schema, migration, snapshot
writer, persistence amendment, feature flag veya runtime/cutover authority üretmez.

## Revision History

| Date | Version | Change |
|---|---|---|
| 2026-07-10 | 0.1-draft | Initial owner-review draft created from merged PAC-001-A evidence gate (PR #1024, merge SHA `281befe70acbe585c2a1bb7640533e17e7c19a8d`). Docs-only; no implementation authorization. |
| 2026-07-20 | 0.1-draft narrow amendment | TPA-04A Option C ile yalnız receipt-bound `CanonicalReceivableApplicationSnapshotV1` subtype'ı ratifiye edildi. General Fee/Harç/Journal/presentation snapshot ownership ve lifecycle DRAFT/OPEN; implementation authority NONE. |
