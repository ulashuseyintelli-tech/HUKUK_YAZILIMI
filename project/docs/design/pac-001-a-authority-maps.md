# PAC-001-A Authority Maps

**Date:** 2026-07-10
**Status:** EVIDENCE RECONCILED / PREPARED FOR OWNER REVIEW
**Authority:** Owner GO-IMPLEMENT PAC-001-A AUTHORITY MAPS
**Scope:** Docs-only product architecture control. No code, schema, migration, runtime behavior, refactor, snapshot/journal spec, or fee implementation.
**Evidence posture:** This document records AS-IS repo evidence and the audit rubric for ADR-013. It does not by itself decide final producer ownership, forbidden-edge remediation, or implementation PR sequence.

## 1. Purpose

PAC-001-A defines authority maps before the future ADR-013 Fee / Harc / Snapshot / Journal implementation line starts.

Prime rule:

```text
No implementation PR may introduce or preserve an unclassified calculation authority.
```

Every place that calculates, projects, persists, presents, imports, or consumes financial/legal values must be classified before it can be changed by ADR-013 implementation PRs. The classifications below are gate requirements and candidate audit buckets, not owner-approved implementation decisions.

## 2. Governance Position

PAC-001-A is deliberately narrow.

| Line | Status | Rule |
|---|---|---|
| GOV-ADR-NAMING-000 | CLOSED / MERGED | `ADR-012` remains DX-005 / Waiting & Progress Policy. `ADR-013` is the canonical Fee / Harc / Snapshot / Journal target. |
| CCB-001 | Separate implementation-authority stream | Claim-balance clean-break/cutover authority only. It is not the Fee implementation line. |
| CAN-CUT-02 | CCB-001 milestone | Remains under CCB-001. PAC-001-A does not close it. |
| REL-001 | External umbrella label | Not promoted into an independent epic. |
| PAC-001-A | This document | Authority maps only. Not PAC-Full. |
| ADR-013 | Future implementation line | May start only after PAC-001-A and a separately authorized ADR-013 boundary audit gate. PAC-001-A does not approve a producer cutover or code PR sequence. |

Forbidden terminology:

```text
ADR-012-FEE is not canonical.
FEE-ADR-WIP is not canonical.
Historical references may remain only as historical context.
New implementation planning must say ADR-013.
```

## 3. Explicit Non-Scope

PAC-001-A does not authorize:

- FeeEngine changes.
- TariffService changes.
- ExpenseCalculatorService changes.
- Peşin harç code changes.
- Tahsil harcı or cezaevi harcı implementation.
- Snapshot or journal persistence.
- Official snapshot hash/lifecycle spec.
- Projection layer implementation.
- UI/report/template adapter changes.
- Aggregate refactor.
- Repository redesign.
- Event sourcing.
- Concurrency or idempotency refactor.
- Domain model migration.
- PAC-Full.

## 4. Repo Anchors And AS-IS Evidence

These are classification anchors, not change targets in PAC-001-A.

| Area | Repo anchors |
|---|---|
| Calculation | `project/apps/api/src/modules/interest-engine/`, `project/apps/api/src/modules/interest-engine/orchestration/case-balance.service.ts`, `project/apps/api/src/modules/case-balance/case-balance.service.ts`, `project/apps/api/src/modules/summary-engine/summary-engine.service.ts`, `project/apps/api/src/modules/case/case.service.ts` |
| Fee | `project/apps/api/src/modules/fee-engine/fee-engine.service.ts`, `project/apps/api/src/modules/tariff/tariff.service.ts`, `project/apps/api/src/modules/expense-request/expense-calculator.service.ts`, `project/apps/api/src/config/tariffs/` |
| Projection / diagnostics | `project/apps/api/src/modules/balance-display-shadow-diff/`, `project/apps/api/src/modules/calc-preview/diagnostics/`, `project/apps/api/src/modules/accounting-journal/accounting-journal-financial-statement.projection.service.ts` |
| Persistence | `project/apps/api/src/modules/accounting-journal/`, `project/apps/api/src/modules/calc-preview/diagnostics/persistence/`, `project/apps/api/src/modules/calc-preview/diagnostics/evidence/` |
| Presentation | `project/apps/web/src/components/case/`, `project/apps/web/src/components/reports/`, `project/apps/api/src/modules/report/report.service.ts`, `project/apps/api/src/modules/template-engine/template-engine.service.ts`, `project/apps/api/src/modules/document/` |
| External adapters / decision support | `project/apps/api/src/modules/icrabot/`, `project/apps/api/src/modules/ai/`, bank/client-settlement related adapters, UYAP MVP folders |

Verified AS-IS evidence accepted for this WIP:

| Evidence | Current repo fact | PAC-001-A treatment |
|---|---|---|
| `TariffService` | `tariff.service.ts` implements `ITariffRepository` and has fail-closed `MissingTariffSectionError` / `toSharedFormat()` required-section validation. | Candidate fee/tariff authority evidence; final ADR-013 role still requires boundary audit. |
| `FeeEngineService` | `fee-engine.service.ts` exposes `calculateOpeningFees()`, `calculatePenalty()`, and `previewCalculation()`. | Existing fee producer candidate; not declared final single source by PAC-001-A. |
| `ExpenseCalculatorService` | `expense-calculator.service.ts` injects `TariffService`. | Existing fee/expense participant; classification pending. |
| `CaseService.getCalculationSummary()` | `case.service.ts` still contains legacy calculation-summary logic, including `takipOncesiFaiz = 0`, `takipSonrasiFaiz = 0`, attorney-fee calculation, and a canonical shadow path through `buildCalculationSummaryCanonicalShadow()`. | AS-IS mixed legacy/diagnostic evidence; no behavior change. |
| `CaseBalanceService` / summary surfaces | `case-balance` and `summary-engine` modules exist as balance/summary producers or orchestrators. | Calculation-authority candidates; final owner boundary pending. |
| `ReportService` / templates | `report.service.ts` and `template-engine.service.ts` produce report/template output and contain monetary summary surfaces. | Presentation/report consumers or duplicate-risk candidates; no forbidden remediation approved yet. |
| Web presentation | `account-summary-display-model.ts` builds account-summary display rows and source-authority policy placement; several case/report components format or aggregate displayed amounts. | Presentation authority evidence; UI calculation risk must be classified before ADR-013 code changes. |
| UYAP / bank adapters | `uyap.service.ts`, `uyap-xml.service.ts`, `bank.service.ts` and related modules move external facts/events; UYAP has STUB/HIGH-risk/CPE notes and bank matching delegates collection creation through canonical paths in existing comments/tests. | External-adapter evidence; not legal/fee/balance authority by PAC-001-A alone. |
| AI/risk modules | `ai.service.ts` and `risk.service.ts` compute suggestions, predictions, risk scores, and decision-support outputs. | Decision-support evidence; must not be treated as legal/financial authority without a later owner decision. |

Owner-provided ADR-013 evidence delta, reconciled for owner review:

| Evidence delta item | Evidence status | Required PAC-001-A treatment |
|---|---|---|
| `AllocationEngineService` and `TBK100AllocatorService` are independent implementations, do not call each other, and the orchestrator uses only `AllocationEngineService`. | VERIFIED_CANONICAL_MAIN | Do not model them as one canonical runtime chain. Keep both as separate verified producer surfaces; final ownership/remediation still requires ADR-013 Boundary Audit and owner decision. |
| `toCaseBalanceDisplay.authority` is `SHADOW_ONLY` on canonical main. | VERIFIED_CANONICAL_MAIN | Treat `SHADOW_ONLY` as the current canonical-main authority metadata state. No cutover follows from PAC-001-A. |
| `CANONICAL_CANDIDATE` exists only on unmerged CCB-001-R branch context. | BRANCH_ONLY / UNMERGED CCB-001-R | Do not treat `CANONICAL_CANDIDATE` as canonical-main dispute. It is branch-local WIP evidence only. |
| `Case.principalAmount` is written from two sources in the same transaction path. | VERIFIED_CANONICAL_MAIN | Add to calculation authority audit as duplicate-principal source risk; no remediation approved here. |
| `disposition-posting.service.ts` writes directly to `CaseBalance` and `BalanceLedger`. | VERIFIED_CANONICAL_MAIN | Add to persistence authority audit; classify possible persistence-authority violation before any ADR-013 code change. |
| Live `Hesap Özeti` has a dual-source presentation path. | VERIFIED_CANONICAL_MAIN | Add to presentation authority audit as possible `PRESENTATION_CALCULATION` / DTO-consumption issue. |
| Three parallel interest-rate source surfaces exist. | VERIFIED_CANONICAL_MAIN | Add to calculation authority audit as verified multi-source interest-rate risk; ADR-013 must classify ownership before behavior change. |
| Any fee/balance producer surface not directly verified remains `UNKNOWN` or `CANDIDATE_TO_CLASSIFY`. | OPEN / REQUIRES_VERIFICATION | No unverified producer table below is final authority assignment. |
| Any producer/forbidden-edge entry lacking evidence is an audit candidate only. | OPEN / REQUIRES_VERIFICATION | All unverified producer and forbidden-edge lists below are audit rubrics only. |

Remaining `UNKNOWN / REQUIRES_VERIFICATION` surfaces:

- `project/apps/api/src/modules/expense-request/expense-calculator.service.ts` real authority role.
- `project/apps/api/src/modules/accounting-journal/accounting-journal-financial-statement.projection.service.ts` real projection role.
- Other fee/balance producer candidates added by file name or draft inventory only.
- External adapter surfaces whose call graph and behavior were not directly verified.

Non-evidence warning:

```text
The producer, forbidden-edge, and gate tables below are PAC audit rubrics.
They must not be cited as owner-approved implementation sequence or final authority assignment.
```

## 5. Authority Classes

| Authority | Owns | May produce | Must not do |
|---|---|---|---|
| Calculation Authority | Legal/canonical balance calculations | Canonical balance result, allocation result, calculation trace | Presentation formatting, journal persistence, UI-only decisions |
| Fee Authority | Harç/masraf formulas and tariff application | Fee lines, fee diagnostics, fee projection inputs | Independent duplicate formulas outside fee owners |
| Projection Authority | Non-official scenario/readiness output | Projected values, readiness, blockers, diagnostics | Financial-event SoT, official snapshot lock, legal finality |
| Persistence Authority | Durable financial facts and evidence | Journal entries, evidence snapshots after gate | Calculation policy invention, presentation logic |
| Presentation Authority | Operator/user-facing display | Rendered DTOs, warnings, diagnostic labels | Fee/balance formula execution |
| External Adapter Authority | Imported source facts/candidates | Source facts, observations, candidate events | Legal calculation, allocation, cross-tenant inference |

## 6. Calculation Authority Map

Calculation Authority covers:

- Principal.
- Interest.
- TBK100/default-context allocation policy.
- Remaining balance.
- Case balance.
- Calculation trace.

AS-IS producer surfaces requiring ADR-013 Boundary Audit:

- `ClaimItem` / source-fact surfaces.
- Interest-engine services and the three verified parallel interest-rate source surfaces.
- `AllocationEngineService` as a verified separate implementation.
- `TBK100AllocatorService` as a verified separate implementation.
- `Case.principalAmount` and any duplicate principal source.
- `CaseBalanceService` / case-balance orchestration surfaces.
- `CalculationTrace` / balance DTO surfaces.

These are not one approved runtime chain. `AllocationEngineService` and `TBK100AllocatorService` are verified separate canonical-main implementations; any future unification, delegation, or ownership choice requires ADR-013 Boundary Audit and owner decision.

Producer candidates to classify:

- `InterestEngineService` and related interest-engine domain services.
- `AllocationEngineService` as a verified separate allocation implementation.
- `TBK100AllocatorService` as a verified separate TBK100 allocation implementation.
- `CaseBalanceService` / case-balance orchestration surfaces.
- Explicit compatibility wrappers while marked and bounded.

Consumer candidates to classify:

- Fee projection consumers that need canonical balance input.
- Shadow/diff readiness diagnostics.
- Presentation DTO builders that only format or classify already-produced values.
- Report/template layers only through canonical DTOs.

Forbidden-edge candidates to test in the ADR-013 boundary audit:

- UI components.
- Report services.
- Document templates.
- Bank adapters.
- UYAP adapters.
- AI/risk assistants.
- Generic `case.service.ts` helpers that recreate formulas instead of delegating to a classified owner.

Forbidden edge examples:

```text
UI → balance formula
Report → balance formula
Document template → balance formula
Bank adapter → payment allocation
UYAP adapter → legal balance
AI/Risk → legal decision
```

## 7. Fee Authority Map

Fee Authority covers:

- Başvurma harcı.
- Peşin harç.
- Baro pulu.
- Vekalet suret harcı.
- Tahsil harcı.
- Cezaevi harcı.
- Fee diagnostics and applicability decisions.

Observed / candidate producer surfaces to classify:

- Tariff source / owner legal policy records.
- `TariffService`.
- `FeeEngineService`.
- `ExpenseCalculatorService`.
- Fee projection / DTO surfaces.

This is not an approved canonical fee chain. ADR-013 Boundary Audit must prove which surfaces are producers, compatibility wrappers, diagnostics, or `UNKNOWN`.

Producer candidates to classify:

- `TariffService` for tariff materialization and fail-closed tariff validation.
- `FeeEngineService` for fee calculation/application orchestration.
- `ExpenseCalculatorService` only where it is explicitly classified as fee-authority participant or compatibility wrapper.
- Owner/legal policy records when a legal/business rule is not derivable from tariff data alone.

Consumer candidates to classify:

- Case balance projection/diagnostics.
- Expense request flows through fee DTOs.
- Reports/templates through fee DTOs only.
- UI through fee DTOs only.

Forbidden-edge candidates to test in the ADR-013 boundary audit:

- `case.service.ts` implementing `takipTutari * 0.005` directly.
- `expense-request.service.ts` implementing independent fee formulas outside the classified owner.
- Report/template layers with hardcoded harç formulas.
- Silent fallback tariff data in production.
- Any "minimum peşin harç" floor that is not legally classified and owned.

Forbidden formula examples:

```text
takipTutari * 0.005 outside FeeEngine/FeeProjection path
pesinHarc minAmount / floor
baroPulu classified as harc
tahsilHarci as single-rate fee without stage
cezaeviHarci charged to debtor without owner/legal policy
```

## 8. Projection Authority Map

Projection is not an official financial event. It answers:

```text
Given this input, policy, stage, tariff version, and diagnostic context,
what is the possible fee/balance outcome?
```

Projection authorities:

- FeeProjection.
- CaseBalance projection/readiness.
- Shadow readiness projection.
- Trial-balance / financial-statement diagnostics while explicitly diagnostic.

Projection may produce:

- Amounts marked as projected.
- `BLOCKER`, `WARN`, and `INFO` diagnostics.
- Applicability decisions.
- Readiness classifications.

Projection must not:

- Create journal events.
- Lock official snapshots.
- Become financial-event SoT.
- Hide missing owner/legal decisions behind numeric defaults.

Unknown stage/channel/policy must be represented as diagnostics, not guessed values.

## 9. Persistence Authority Map

Persistence Authority is split:

```text
Accounting Journal = financial-event SoT direction, subject to existing ADR-010 gates.
BalanceSnapshot / calculation evidence = calculation-result evidence, not a journal substitute.
```

Rules:

- No official financial event exists without the approved journal path.
- Snapshot evidence may support auditability, but cannot replace journal authority.
- Official snapshot persistence requires a separate ADR-013 hash/lifecycle spec.
- Durable snapshot rows must not be introduced by PAC-001-A.
- Snapshot updates must not overwrite official history; future official snapshots use supersede/void semantics after a dedicated gate.

Forbidden edges:

```text
Projection → AccountingJournal write
Presentation → AccountingJournal write
Report export → official snapshot lock
Snapshot → journal substitute
Live FX fetch → official deterministic result without frozen observation
```

## 10. Presentation Authority Map

Presentation Authority renders classified DTOs.

Allowed inputs:

- Canonical balance DTO.
- FeeProjection DTO.
- CalculationTrace summary.
- Readiness classification.
- Diagnostic status.

Allowed behavior:

- Formatting.
- Sorting.
- Grouping.
- Warning display.
- Diagnostics and blocked-state copy.
- Links to source/evidence records.

Forbidden behavior:

- Fee formula execution.
- Balance formula execution.
- Independent tahsil harcı / cezaevi harcı calculation.
- Silent fallback when canonical DTO is missing.
- Converting diagnostic projection into official legal/final output.

Forbidden edge examples:

```text
UI → fee formula
Report → balance formula
Template → harç formula
Document export → independent calculation
```

## 11. External Adapter Authority Map

External adapters and decision-support modules may produce source facts, observations, or candidates.

Allowed:

- UYAP source facts/candidate observations.
- Bank/payment source events.
- AI/risk suggestions marked as non-authoritative.
- Cross-file signals that preserve tenant and privacy boundaries.

Forbidden:

- UYAP adapter legal calculation.
- Bank adapter automatic allocation.
- AI/risk assistant legal decision.
- Cross-tenant debtor intelligence.
- External observation promoted into official financial fact without the owning application/persistence path.

## 12. Duplicate Formula Taxonomy

ADR-013 boundary audit must classify each calculation-like code path before changing behavior.

| Class | Meaning | Default handling |
|---|---|---|
| CANONICAL_AUTHORITY | Current or target owner for that calculation | Preserve and test |
| COMPATIBILITY_WRAPPER | Temporary wrapper delegating to canonical owner | Keep only with explicit expiry/gate |
| DIAGNOSTIC_ONLY | Computes for comparison/readiness only | Must not feed official result |
| DUPLICATE_FORMULA | Independent duplicate of an owned formula | Remove or delegate in ADR-013 implementation |
| UNSAFE_FALLBACK | Silent default/stale tariff/fallback value | Fail-fast or blocker diagnostic |
| PRESENTATION_CALCULATION | UI/report/template calculation | Remove or replace with DTO consumption |
| DEAD_CODE_CANDIDATE | Unused path, requires proof before removal | Separate cleanup decision |
| UNKNOWN | Insufficient evidence | No behavior change until classified |

## 13. Candidate ADR-013 Gate Map

PAC-001-A enables the next docs-only gate, not fee code. The rows below are a sequencing rubric for owner review; they are not an approved implementation sequence.

| Future gate | Allowed after PAC-001-A? | Rule |
|---|---:|---|
| ADR-013 PR-0 Governance Reconciliation | Yes | Rename legacy ADR-012-FEE planning language to ADR-013 and link PAC-001-A. |
| ADR-013 PR-1 Boundary Audit | Yes | Docs/read-only classification of current calculation-like paths. |
| ADR-013 PR-2 Peşin harç minimum removal | No, not by PAC-001-A alone | Requires PR-1 boundary audit closure and separate owner GO. |
| ADR-013 PR-3 Tariff fallback fail-fast | No | Separate implementation GO. |
| ADR-013 PR-4 Fee single-source | No | Separate implementation GO. |
| ADR-013 PR-5 Applicability matrix | No | Separate design/implementation GO. |
| ADR-013 PR-6 FX observation freeze spec | No | Separate spec GO. |
| ADR-013 PR-7 Fee Projection Layer | No | Requires owner/legal gate decisions. |
| ADR-013 PR-8 Journal/Snapshot hash/lifecycle spec | No | Separate ADR/spec GO before persistence. |

## 14. Acceptance Criteria

PAC-001-A is complete when all of the following are true:

- Calculation authority map exists.
- Fee authority map exists.
- Projection authority map exists.
- Persistence authority map exists.
- Presentation authority map exists.
- External adapter authority map exists.
- Forbidden edges are listed.
- Duplicate formula taxonomy is listed.
- Future ADR-013 gates are linked.
- CCB-001 remains separate and closure/cutover-only.
- CAN-CUT-02 remains under CCB-001.
- REL-001 remains a label/umbrella, not an epic.
- No source code changed.
- No tests changed.
- No schema/migration changed.
- No runtime behavior changed.
- PAC-Full did not start.

Verdict after merge:

```text
PAC001A_READY_FOR_ADR013
```
