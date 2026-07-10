# ADR-014 Wave 0 Acceptance Criteria

## 1. Purpose & Scope

This document defines the mandatory acceptance criteria for ADR-014 Wave 0 scenario infrastructure work.

Wave 0 exists to make later Canonical Legal Calculation Core work testable without changing production authority. It covers scenario contracts, deterministic setup boundaries, disposable database validation gates, and explicit hard stops before W0.2, W0.3, PR-1A, or PR-1B may begin.

## 2. Status

Status: **Normative Governance Contract**

This document defines mandatory implementation gates. It is not an architecture proposal. It does not authorize implementation. It defines the conditions under which implementation may begin after a separate owner command.

## 3. Canonical Inputs

- ADR-014: `project/docs/adr/ADR-014-CCB-001-CANONICAL-LEGAL-CALCULATION-CORE.md`
- ADR-014 split plan: `DIRECT_RESCUE_MERGE_NO_GO / RESCUE_SOURCE_ONLY`
- W0.1 closure: PR #1037, squash merge `f998af79`
- W0.1 canonical surfaces: `ScenarioDefinition`, `ScenarioDomainInput`, `ScenarioExpected`, and scenario builder support
- REVERSAL owner decision: Conditional Option B, direct-write materializer only inside test/disposable DB; production `CollectionService.cancel()` remains a separate PR-1B gate
- Current runtime authority: legacy production paths remain authoritative until a later approved cutover

## 4. Single Source Rule

This file is the canonical source for ADR-014 Wave 0 acceptance criteria.

- Decision Log contains only dated decision references.
- Product Backlog contains only tracking state.
- Architecture Index contains only navigation and current status.
- Normative Wave 0 criteria must not be copied into governance pointer documents.

## 5. Governance Drift Rule

If implementation requires changing these acceptance criteria, implementation stops.

The acceptance criteria must be updated and merged first. Implementation may resume only after the updated criteria are merged, Master Register is updated, and the owner issues a new explicit implementation command.

## 6. Amendment Rule

Minor editorial updates may be merged independently.

Any amendment affecting scope, authority, dependencies, boundaries, hard stops, success metrics, or exit criteria requires a new governance review before implementation continues.

## 7. Authority Invariants

Throughout Wave 0:

- Legacy runtime authority remains authoritative.
- Scenario infrastructure never becomes production authority.
- Materializer code never becomes production authority.
- Assertion code never becomes production authority.
- No additional calculation authority may be introduced.
- Every produced artifact must have exactly one authoritative producer.
- Duplicate authority count must remain `0`.

Ownership freeze:

- Scenario infrastructure is a test harness, not a calculation engine owner.
- Calculation authority remains with the existing legacy runtime path until a later approved cutover.
- Builder, materializer, and assertion layers never own legal calculation semantics.

## 8. Evidence Classification

Generated or observed artifacts must be classified as one of:

- Test Fixture
- Deterministic Setup
- Diagnostic Output
- Expected Evidence
- Actual Runtime Observation

None of these classifications constitutes production authority.

## 9. Canonical Type Verification

Before adding any new public scenario type, the implementation must verify whether existing canonical W0.1 types already cover the need.

Required checks:

- `ScenarioDefinition` remains the top-level scenario contract unless a governance-approved gap is proven.
- `ScenarioDomainInput` satisfies ScenarioInput needs unless a governance-approved gap is proven.
- `ScenarioExpected` satisfies expected-result needs unless a governance-approved gap is proven.
- Builder and materializer must consume the same scenario contract.
- No duplicate DTO, wrapper, or parallel domain model may be introduced without owner review.

Hard stop: W0.2 or later work requires a second domain model, parallel DTO, or wrapper that changes legal meaning.

## 10. Contract Freeze

Frozen Wave 0 contract surfaces:

- Scenario contract: `ScenarioDefinition`
- Scenario input: `ScenarioDomainInput`
- Expected evidence: `ScenarioExpected`
- Builder boundary: deterministic fixture construction only
- Materializer boundary: test/disposable DB state creation only
- Assertion boundary: compare actual evidence to expected evidence only

Any public contract expansion is a governance amendment, not an incidental implementation detail.

## 11. Materializer Boundary

Materializer code may create persistence state only inside approved test/disposable DB execution.

Allowed materializer role:

- Create deterministic setup records required by a scenario.
- Consume `ScenarioDefinition`; do not define a competing contract.
- Write only test-scoped records needed to exercise the existing runtime path.

Forbidden materializer role:

- Interpret legal semantics.
- Calculate interest.
- Make allocation decisions.
- Implement TBK100.
- Define priority ordering.
- Implement reversal algorithm semantics.
- Produce fee, tariff, snapshot, or journal authority.
- Become evidence that production cancellation semantics are correct.

Direct reversal writes are allowed only as deterministic setup for disposable DB testing. They do not validate production `CollectionService.cancel()`.

## 12. ScenarioAssertion Boundary

Scenario assertion code never computes.

It only compares:

```text
actual runtime observation
vs
expected evidence
```

Assertions must not contain fallback formulas, duplicated legal calculations, tolerance rules with legal meaning, allocation logic, TBK100 logic, fee logic, tariff logic, or reversal semantics.

## 13. Dependency Freeze

Allowed dependencies:

- Canonical W0.1 scenario contract types
- Existing legal calculation type definitions needed for read-only typing
- Deterministic builder and fixture helpers
- Test-only assertion helpers
- Approved disposable DB integration adapters
- `@prisma/client` only inside approved test materializer or DB-gated integration boundaries

Forbidden dependencies:

- Nest runtime module registration
- Controllers
- Production API adapters
- UI/web layers
- Feature flags
- Production repository ownership
- Prisma mutation outside approved disposable DB materializer boundaries
- Schema or migration changes
- Report/template authority
- Fee or tariff implementation
- Snapshot or journal production persistence
- New formulas
- Copied or forked TBK100 logic
- Rescue-branch-only types treated as canonical

## 14. Allowed / Forbidden Reads

Allowed reads:

- Scenario support files
- Canonical W0.1 scenario contract files
- Disposable DB rows created for the current test run
- Current runtime observations inside DB-gated validation

Forbidden reads:

- Production, live, or shared database state
- UI, report, or template surfaces as calculation authority
- Rescue branch source code as merge input
- Fee, tariff, snapshot, or journal production surfaces as Wave 0 authority

Surface-specific read rules:

- Ledger reads are allowed only for disposable DB records created by the current scenario or for separately approved DB-gated runtime observation.
- Journal reads are diagnostic only and never create journal authority; if the runtime path does not write a journal, evidence must say the path was not exercised.
- Snapshot reads are forbidden as Wave 0 authority.
- Fee reads are forbidden as Wave 0 authority.
- Tariff reads are forbidden as Wave 0 authority.

## 15. Allowed / Forbidden Writes

Allowed writes in this docs-only patch:

- This acceptance criteria document
- Minimal governance pointer updates

Allowed future W0.2 writes, only after separate owner authorization:

- Test-only disposable DB records for scenario setup
- Case, ClaimItem, Collection, LedgerEntry, LedgerAllocation, and minimal prerequisite records when required by a scenario

Forbidden writes:

- Source code in this patch
- Tests in this patch
- Schema or migrations
- Production database state
- Runtime module wiring
- Controllers or API adapters
- UI/web behavior
- Feature flags
- Fee or tariff authority
- Snapshot or journal production persistence

Ledger note: future W0.2 may write test-only ledger records only in disposable DB context.

Journal note: Wave 0 must not fake production journal authority. If the runtime path does not write a journal, evidence must classify that path as not exercised.

Snapshot, fee, and tariff note: Wave 0 does not implement these surfaces.

## 16. Production Isolation Guarantee

Wave 0 must preserve:

- API response diff: `0`
- UI behavior diff: `0`
- Production DB mutation diff: `0`
- Feature flag diff: `0`
- Runtime authority diff: `0`
- Runtime adapter diff: `0`
- Report/template behavior diff: `0`
- Module registration diff: `0`

## 17. Disposable DB Strategy

DB-gated validation must use fail-closed disposable database rules.

Required conditions:

- `TEST_DATABASE_URL` or equivalent explicit test DB configuration is required.
- Development or production database URLs are forbidden.
- Test data must be tenant/case scoped.
- Test data must be isolated or cleaned between runs.
- Builder code remains DB-agnostic.
- Materializer code remains a separate test adapter.
- `CollectionService.cancel()` production-path validation is separate PR-1B work.

Hard stop: disposable DB cannot be provisioned without touching shared, development, or production data.

## 18. Scope Manifest

| Surface | Wave 0 Requirement |
| --- | --- |
| Allowed source roots | Scenario support, builder, materializer, assertion, and DB-gated integration roots only after explicit owner authorization |
| Forbidden source roots | Controllers, UI/web, runtime modules, production adapters, fee/tariff/snapshot/journal production surfaces |
| Allowed public types | `ScenarioDefinition`, `ScenarioDomainInput`, `ScenarioExpected`, and owner-approved additions only |
| Forbidden public types | Duplicate domain DTOs, parallel legal input wrappers, rescue-branch-only contracts |
| Allowed reads | Canonical contract files, test fixtures, disposable DB rows, runtime observations in DB-gated tests |
| Forbidden reads | Production DB, UI/report/template authority, rescue branch source as merge input |
| Allowed writes | Docs in this patch; future disposable DB setup writes only after separate owner GO |
| Forbidden writes | Source/test/schema changes in this patch; production DB; runtime wiring; fee/tariff/snapshot/journal authority |
| DB touchpoints | None in this patch; disposable DB only in future W0.2 |
| Runtime behavior | No change |
| API surface | Frozen |
| UI surface | Frozen |
| Authority | Legacy runtime authority remains authoritative |
| Feature flags | None |

## 19. Hard Stop Matrix

Implementation must stop and report `NO-GO` if any condition appears:

| Condition | Result |
| --- | --- |
| Canonical W0.1 types cannot express the scenario without a parallel model | Hard Stop |
| Existing canonical service must be bypassed to make the scenario pass | Hard Stop |
| Scenario fixture requires a business/legal decision | Hard Stop |
| Scenario infrastructure starts producing runtime authority | Hard Stop |
| Runtime adapter dependency is required for Wave 0 | Hard Stop |
| Production Nest module registration is required | Hard Stop |
| Production DB mutation is required | Hard Stop |
| `CollectionService.cancel()` cannot be isolated behind PR-1B DB integration validation | Hard Stop |
| Materializer duplicates cancellation semantics | Hard Stop |
| TBK100 logic is copied, forked, or reimplemented | Hard Stop |
| Disposable DB cannot be provisioned safely | Hard Stop |
| Tenant/case isolation cannot be verified | Hard Stop |
| Runtime behavior must change | Hard Stop |
| Schema or migration changes are required | Hard Stop |
| Fee, tariff, snapshot, journal, UI, report, or template changes are required | Hard Stop |
| Rescue branch must be merged, rebased, or cherry-picked | Hard Stop |
| Legal signoff refresh is required before Wave 0 can proceed | Hard Stop |

## 20. Success Metrics

Wave 0 success requires:

- Production diff: `0`
- Runtime behavior diff: `0`
- Runtime authority diff: `0`
- New production public API count: `0`
- New DB migration count: `0`
- Duplicate authority count: `0`
- Duplicate domain type count: `0`
- Duplicate legal formula count: `0`
- Forbidden import count: `0`
- Forbidden write count: `0`
- Import graph uses only allowed layers
- Scenario contract remains frozen unless amended through governance
- Disposable DB validation fails closed when configuration is unsafe

## 21. Exit Criteria

Wave 0 may be considered ready for the next owner review only when:

- Contract Freeze is satisfied.
- Ownership Freeze is satisfied.
- Dependency Freeze is satisfied.
- Canonical Type Verification is satisfied.
- Materializer Boundary is satisfied.
- ScenarioAssertion Boundary is satisfied.
- Production Isolation Guarantee is satisfied.
- Disposable DB Strategy is satisfied.
- Scope Manifest checks are satisfied.
- Hard Stop Matrix has no active hard stop.
- Success Metrics are met and evidenced.
- Master Register reflects the merged acceptance criteria and current gate state.

## 22. PR-1A / PR-1B Gate Preconditions

PR-1A status: `CONDITIONAL_GO` only after this acceptance criteria document is merged and Master Register is updated.

PR-1A constraints:

- Verification only.
- No production fix.
- No authority transfer.
- No runtime cutover.

PR-1B constraints:

- Cannot begin before PR-1A records the verified defect/evidence boundary.
- Must validate real production cancellation behavior through the approved DB-gated path.
- Materializer PASS is not enough to mark `CollectionService.cancel()` production path PASS.
- Requires separate owner command.

W0.2, W0.3, PR-1A, and PR-1B remain blocked until this document is merged, Master Register is updated, and the owner issues a separate explicit command for the next work item.

## 23. Master Register Integration

After this document is merged, Master Register must record:

- ADR-014 Wave 0 Acceptance Criteria status
- PR number
- merge SHA
- CI status
- canonical main SHA
- changed files
- runtime impact: none
- next eligible work
- blocked work

Next register mutation: Acceptance Criteria docs-only closure.

No implementation work is authorized by the register update alone.

## 24. Explicit Non-Authorization Clause

Nothing in this document constitutes authorization to begin implementation.

Implementation authority is granted only after:

- this acceptance criteria document is merged,
- Master Register is updated,
- and the owner issues a new explicit implementation command.

## 25. Out of Scope

This document does not define:

- legal formulas
- calculation algorithms
- TBK100 implementation
- fee implementation
- tariff implementation
- runtime architecture
- production adapters
- runtime authority
- UI behavior
- production persistence model
- schema changes
- migrations
- CCB runtime cutover
