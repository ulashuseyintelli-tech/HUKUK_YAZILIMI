# PR-L3 - CaseDebtor Passivation Implementation Plan

Status: Draft implementation plan

Scope: planning only. This document does not change schema, create a migration,
modify runtime behavior, modify data, change tests, or implement passivation.

Base decisions:

- PR-D1 is merged and defines `Debtor` deletion semantics.
- PR-L2 is merged and defines `CaseDebtor` passivation semantics.
- `CaseDebtor` is a lifecycle-bearing domain entity candidate.
- `CaseDebtor` is not a disposable junction row.
- `serviceStatus` is tebligat/service lifecycle, not CaseDebtor relationship
  lifecycle.

Core thesis:

```text
Passive != deleted.
Passive = no longer active transaction subject.
```

## 1. Goals

PR-L3 turns the PR-L2 decision record into a phased implementation plan.

The plan must preserve:

- historical/legal/audit visibility;
- tenant isolation through `Case.tenantId`;
- PR-D1 consistency for parent `Debtor.delete()` semantics;
- PR-L1 stopgap safety until passivation is actually implemented;
- explicit reader/writer behavior before code changes begin.

This plan does not start implementation.

## 2. Lifecycle Field Proposal

Recommended additive fields for `CaseDebtor`:

| Field | Type direction | Purpose |
| --- | --- | --- |
| `lifecycleStatus` | enum/string with `ACTIVE`, `PASSIVE` | Canonical relationship lifecycle state |
| `passivatedAt` | nullable datetime | When the case-debtor relationship stopped being an active transaction subject |
| `passivatedById` | nullable user id | Actor who passivated the relationship |
| `passivationReason` | nullable enum/string | Machine-readable reason |
| `passivationNote` | nullable text | Human explanation |
| `passivationEffectiveAt` | nullable datetime | Optional legal/effective date if different from system timestamp |

Recommended reason values to evaluate in PR-L4:

```text
MANUAL
DUPLICATE_RELATION
WRONG_PARTY
ROLE_ENDED
CASE_CORRECTION
OTHER
```

Field naming guidance:

- Avoid `deletedAt` for `CaseDebtor` passivation. Passive is not deleted.
- Avoid reusing `serviceStatus`; it belongs to tebligat/service state.
- Prefer a single canonical lifecycle field over multiple boolean flags.
- Keep tenant scope derived through `Case.tenantId`; do not duplicate
  `tenantId` onto `CaseDebtor` unless a later schema decision explicitly
  accepts that denormalization.

Initial lifecycle rule:

```text
ACTIVE:
  valid target for new operational writes.

PASSIVE:
  retained historical relationship;
  visible in history/detail readers;
  not a valid target for new operational writes unless an exception is
  explicitly defined.
```

Reactivation:

- Do not implement implicit reactivation in the first pass.
- If reactivation is required later, it must be explicit, audited, and tested.
- Adding the same `caseId + debtorId + role` while a passive row exists should
  not silently create a second active relationship in PR-L4/PR-L5.

## 3. Migration And Backfill Approach

PR-L4 should be additive only:

1. Add lifecycle fields to `CaseDebtor`.
2. Backfill all existing rows to `ACTIVE`.
3. Add focused indexes only if needed for expected reader/writer paths.
4. Do not delete or rewrite existing historical rows.
5. Do not change FK cascade behavior in the same PR unless explicitly approved.
6. Do not change Party Registry schema.

Backfill default:

```text
Existing CaseDebtor rows -> lifecycleStatus = ACTIVE
passivatedAt/passivatedById/passivationReason/passivationNote/passivationEffectiveAt = null
```

Reason:

- Existing rows currently behave as active because no passive state exists.
- Silent historical passivation cannot be inferred safely from current data.
- Any existing unsafe hard-delete risk is handled by PR-L1/PR-D1 until lifecycle
  implementation is live.

Recommended migration checks:

- Count existing `CaseDebtor` rows before/after.
- Verify no existing row receives null lifecycle state after backfill.
- Verify `serviceStatus` values are unchanged.
- Verify `Collection.caseDebtorId` and `Tebligat.caseDebtorId` are not rewritten.

## 4. DELETE /case-debtors/:id Target Behavior

Current behavior:

```text
DELETE /case-debtors/:id
  -> PR-L1 blocker preflight
  -> cancel open AddressTask
  -> hard-delete if no blockers
```

Target behavior for PR-L5:

```text
DELETE /case-debtors/:id
  -> tenant-scope through Case.tenantId
  -> if already PASSIVE: return current passive state or safe no-op response
  -> if hard-delete remains allowed for no-history rows: apply PR-L1 preflight
  -> otherwise set lifecycleStatus = PASSIVE
  -> record passivation metadata
  -> cancel open AddressTask for the same tenantId + caseId + debtorId
  -> preserve terminal AddressTask rows
  -> preserve all historical/legal/audit dependencies
```

Recommended route compatibility decision:

- Keep the route initially for compatibility, but change its semantic target
  from "hard-delete relationship" to "remove as active transaction subject".
- Response shape should be reviewed before implementation so frontend callers
  do not receive silent semantic drift.
- A future explicit endpoint such as `POST /case-debtors/:id/passivate` can be
  introduced later, but PR-L5 should avoid route proliferation unless product
  review requires it.

Hard-delete residual path:

- Keep PR-L1 hard-delete only as a narrow, reviewed fallback for rows with no
  historical/legal/audit/business dependencies, if approved.
- If hard-delete remains, it must never bypass the same tenant-scoped preflight
  used by PR-L1.

## 5. Reader Defaults

Reader behavior must distinguish historical visibility from active selection.

Recommended defaults:

| Reader surface | Default |
| --- | --- |
| Case detail debtor history/detail | Include passive rows with passive state |
| Debtor detail drawer | Allow reading passive rows |
| Service history | Allow reading passive rows |
| Tebligat history | Allow reading passive rows |
| Collection attribution/history | Allow reading passive rows |
| ThirdParty/ExternalCase history | Allow reading passive rows |
| AddressResearch timeline/history | Allow reading passive rows |
| AssetQuery history/summary | Allow reading passive rows |
| Cross-file intelligence | Include passive rows unless active-only is explicitly requested |
| Validation/report historical outputs | Include passive rows when measuring historical facts |
| Operational selectors | Default active-only |
| New-work action panels/buttons | Disable or hide actions for passive rows |

API direction:

- Existing detail/history endpoints should return passive rows.
- List endpoints may need an `includePassive` or `lifecycleStatus` query later.
- Backend DTOs must expose enough lifecycle information for UI badges and
  disabled-action states.

UI direction:

- Passive rows should be visible where they explain history.
- Passive rows should be labelled.
- New operational actions should be disabled or hidden consistently.
- UI implementation belongs to PR-L7, not PR-L4/PR-L5 unless strictly required
  for API compatibility.

## 6. Writer Guard Matrix

Legend:

```text
BLOCK_NEW:
  passive CaseDebtor must not be used as target for a new operation.

ALLOW_HISTORY:
  reading or completing an already-existing historical operation can continue.

DECIDE:
  requires explicit domain/product decision before implementation.
```

| Surface | Current path | Passive rule |
| --- | --- | --- |
| Add CaseDebtor | `CaseDebtorService.addDebtorToCase()` | DECIDE: passive duplicate should not silently create or reactivate |
| Bulk add CaseDebtor | `CaseDebtorService.addMultipleDebtorsToCase()` | Same as add |
| Case creation | `CaseService.create()` creates `CaseDebtor` rows | Create as ACTIVE |
| Update CaseDebtor role/liability/notification fields | `CaseDebtorService.updateCaseDebtor()` | BLOCK_NEW for active-operational fields; DECIDE for metadata/correction fields |
| Remove CaseDebtor | `CaseDebtorService.removeCaseDebtor()` | Convert to passivation target |
| Set active address | `AddressService.setActiveAddress()` | BLOCK_NEW |
| Quick note / case note | `DebtorService.updateQuickNote()` and CaseDebtor note fields | DECIDE: likely allow audit/explanatory note only |
| Manual service status update | `DebtorService.updateServiceStatus()` | BLOCK_NEW unless recording late result |
| Service retry | `DebtorService.startNewServiceAttempt()` | BLOCK_NEW |
| Tebligat create | `TebligatService.create()` | BLOCK_NEW |
| Tebligat update/send | `TebligatService.update()`, `markAsSent()` | DECIDE based on whether tebligat existed before passivation |
| PTT result sync | `TebligatService.recordPttResult()` | ALLOW_HISTORY for pre-passivation tebligat result |
| UETS/KEP result sync | `TebligatService.recordElectronicResult()` | ALLOW_HISTORY for pre-passivation tebligat result |
| Collection create with `caseDebtorId` | `CollectionService.create()` | BLOCK_NEW |
| Collection update/cancel | `CollectionService.update()` and cancellation paths | ALLOW_HISTORY if existing collection belongs to passive relation |
| AddressTask manual create | `AddressTaskService.createTask(enforceCaseDebtorLink=true)` | BLOCK_NEW if linked CaseDebtor is PASSIVE |
| Address workflow trigger | `AddressTaskService.triggerAddressWorkflowForCase()` | Only iterate ACTIVE relationships |
| AddressTask completion/cancel/fail | Existing task lifecycle | ALLOW_HISTORY for existing tasks |
| AddressResearch get status | `AddressDiscoveryService.getResearchStatus()` | DECIDE because current read can create a row |
| AddressResearch start/complete/exhausted | `AddressDiscoveryService.startResearch()/complete/exhausted()` | BLOCK_NEW for start; DECIDE/ALLOW_HISTORY for completing existing research |
| UYAP query create | `UyapQueryService.createQuery()` | BLOCK_NEW |
| UYAP query response/process addresses | `recordQueryResponse()/processQueryAddresses()` | ALLOW_HISTORY for existing query result |
| InstitutionLetter create | `InstitutionLetterService.createLetter()` | BLOCK_NEW |
| InstitutionLetter sent/responded/no-response | existing letter lifecycle | ALLOW_HISTORY for existing letter |
| AssetQuery run | `AssetQueryService.runQueries()` | BLOCK_NEW |
| AssetQuery result update | `AssetQueryService.updateQueryResult()` | ALLOW_HISTORY for existing query result |
| ThirdParty create | `ThirdPartyService.create()` | BLOCK_NEW |
| ThirdParty ihbarname chain | `sendNextIhbarname()`, `recordIhbarname()` | DECIDE: continuation of existing legal process vs new active action |
| ExternalCase create | `ThirdPartyService.createExternalCase()` | BLOCK_NEW |
| ExternalCase update/collection | `updateExternalCase()`, `addExternalCaseCollection()` | DECIDE/ALLOW_HISTORY for existing external case |
| Client intake promote | `ClientIntakePromotionService` CaseDebtor membership checks | DECIDE: passive membership likely not eligible as new target |
| Scheduler ihbarname reminders | `SchedulerService.checkIhbarnameDeadlines()` | DECIDE: probably skip passive unless existing process continuation is approved |
| Scheduler external case followups | `SchedulerService.checkExternalCaseFollowups()` | DECIDE: probably allow existing external-case followup if legally active |
| Scheduler tebligat result polling | `SchedulerService.checkTebligatStatus()` | ALLOW_HISTORY for existing tebligat result |

Guard implementation direction:

- Prefer a shared backend helper for "assert active CaseDebtor transaction
  subject" rather than repeating ad hoc predicates in each service.
- Helper must tenant-scope through `Case.tenantId`.
- Helper should support transaction context where needed.
- Helper should distinguish:
  - not found;
  - wrong tenant/case;
  - passive relationship.

## 7. Late-result Exceptions

Late results are not the same as new operations.

Allowed-history candidates:

- PTT result for a tebligat created before passivation.
- UETS/KEP result for a tebligat created before passivation.
- UYAP query response for a query created before passivation.
- Institution letter response for a letter created before passivation.
- Asset query result for a query created before passivation.
- External-case collection/update for an external case created before
  passivation, if legal process continuation is approved.

Rules to freeze before PR-L6:

1. A passive `CaseDebtor` must not be the target of a new operation.
2. An already-existing operation may receive a terminal/historical result if
   the result preserves history rather than restarts activity.
3. Late-result writes must not implicitly reactivate the `CaseDebtor`.
4. Late-result writes may update summary fields only if the summary is clearly
   historical. Otherwise, summary update should be skipped or separately
   audited.

Known summary-field issue:

- `AssetQueryService.updateQueryResult()` updates CaseDebtor asset summary
  fields after the query result arrives.
- `TebligatService.recordPttResult()` and `recordElectronicResult()` update
  `CaseDebtor.serviceStatus` through `DebtorService.syncServiceStatusInTx()`.
- These updates may be acceptable as historical completion, but must not be
  mistaken for new operational eligibility.

## 8. AddressTask Special Rule

`AddressTask` has no FK to `CaseDebtor`; it uses:

```text
tenantId + caseId + debtorId
```

Therefore passive semantics cannot rely only on `caseDebtorId` FK checks.

Recommended rule:

- On passivation, cancel open tasks for the same:
  `tenantId + caseId + debtorId`.
- Open statuses to cancel should remain aligned with PR-L1:
  `PENDING`, `IN_PROGRESS`, `WAITING_EXTERNAL`.
- Terminal tasks must remain as history.
- Manual task creation must reject passive `CaseDebtor` membership.
- Workflow-triggered task creation must iterate only active `CaseDebtor`
  relationships.
- Scheduler-created followup tasks must be reviewed separately because some
  tasks represent continuation of an already-existing legal process.

Do not delete `AddressTask` rows as part of passivation.

## 9. PR-D1 Debtor.delete Dependency

PR-D1 found:

```text
DebtorService.delete()
  -> prisma.debtor.delete()
  -> DB cascade
  -> CaseDebtor disappears
```

This can bypass `CaseDebtor` lifecycle if left unchanged.

Implementation dependency:

- PR-L4/PR-L5 must not claim CaseDebtor lifecycle is safe unless
  `Debtor.delete()` cannot cascade-delete lifecycle-bearing `CaseDebtor` rows
  with historical/legal/audit/business references.
- Either `Debtor.delete()` is blocked/passivated in a separate PR-D2 line, or
  PR-L5 includes a hard stop that prevents parent cascade from invalidating
  CaseDebtor lifecycle.
- This dependency must be reviewed before enabling passivation in production.

Recommended sequencing:

```text
PR-D1: merged decision record
PR-L2: merged CaseDebtor lifecycle decision record
PR-L3: this implementation plan
PR-L4+: implementation, but only with Debtor.delete dependency explicitly handled
```

## 10. Test Matrix

PR-L4 schema/migration tests:

- Existing rows backfill to `ACTIVE`.
- New `CaseDebtor` rows default to `ACTIVE`.
- Passive metadata fields remain null for active rows.
- No `serviceStatus` value changes.
- Existing `Collection.caseDebtorId` and `Tebligat.caseDebtorId` remain
  untouched.

PR-L5 backend lifecycle tests:

- `DELETE /case-debtors/:id` passivates instead of deleting when lifecycle is
  enabled.
- Passivation is tenant-scoped through `Case.tenantId`.
- Passivation cancels only open `AddressTask` rows for same
  `tenantId + caseId + debtorId`.
- Terminal `AddressTask` rows remain untouched.
- Historical dependencies remain present after passivation.
- Already passive row behavior is deterministic.
- No-blocker hard-delete fallback, if retained, still obeys PR-L1 preflight.

PR-L6 writer guard tests:

- Passive `CaseDebtor` blocks new Collection attribution.
- Passive `CaseDebtor` blocks new Tebligat.
- Passive `CaseDebtor` blocks set active address.
- Passive `CaseDebtor` blocks service retry/manual service update unless
  classified as late result.
- Passive `CaseDebtor` blocks AddressTask manual create and workflow creation.
- Passive `CaseDebtor` blocks AddressResearch start.
- Passive `CaseDebtor` blocks UYAP query create.
- Passive `CaseDebtor` blocks InstitutionLetter create.
- Passive `CaseDebtor` blocks AssetQuery run.
- Passive `CaseDebtor` blocks ThirdParty and ExternalCase create.
- Cross-tenant passive rows do not block another tenant.
- Same tenant but different case passive rows do not block unrelated case
  writes.

Late-result tests:

- Existing Tebligat result can be recorded after passivation if approved.
- Existing AssetQuery result can be recorded after passivation if approved.
- Existing UyapQuery response can be recorded after passivation if approved.
- Existing InstitutionLetter response can be recorded after passivation if
  approved.
- Late-result path never reactivates `CaseDebtor`.

PR-L7 reader/UI tests:

- Case detail can display passive `CaseDebtor` rows.
- Passive rows carry enough DTO state for a badge.
- New operational action controls are disabled/hidden for passive rows.
- Historical panels remain readable.
- Active-only selectors do not offer passive rows.
- Web tests cover passive visibility where RFA-010 precedent applies.

Regression tests to keep:

- PR-L1 blocker tests for direct hard-delete safety.
- Collection/Tebligat loose scalar tenant-scope tests.
- AddressTask cancellation tests.
- Tebligat result sync tests.
- Collection event payload tests.

## 11. Phased PR Plan

### PR-L4 - Schema / Migration

Scope:

- Add CaseDebtor lifecycle fields.
- Add enum/indexes if approved.
- Backfill existing rows to `ACTIVE`.
- No runtime behavior changes except generated type availability.

Out of scope:

- route behavior changes;
- writer guards;
- UI changes;
- Party Registry;
- Debtor.delete behavior unless separately approved.

### PR-L5 - Backend Lifecycle Guard + Route Semantics

Scope:

- Add shared CaseDebtor lifecycle helper.
- Convert `DELETE /case-debtors/:id` target behavior to passivation or approved
  hybrid behavior.
- Preserve PR-L1 safety for any remaining hard-delete fallback.
- Cancel open AddressTasks on passivation.
- Return lifecycle state from core backend readers needed by API clients.

Out of scope:

- broad UI polish;
- all writer guards;
- Party Registry.

### PR-L6 - Writer Guards

Scope:

- Apply active-transaction-subject guard to writer surfaces.
- Preserve approved late-result exceptions.
- Add focused tests for each blocked writer and exception.
- Ensure tenant scope always flows through `Case.tenantId`.

Out of scope:

- new lifecycle fields;
- route redesign beyond PR-L5;
- visual UI work except as needed for tests/API compatibility.

### PR-L7 - Reader/UI Passive Visibility

Scope:

- Expose passive lifecycle state in reader DTOs.
- Show passive labels/badges in historical/detail readers.
- Keep history visible.
- Disable/hide new operational actions for passive rows.
- Add web tests for visibility and disabled states.

Out of scope:

- schema migration;
- backend writer guard expansion beyond gaps found during UI integration;
- Party Registry.

## 12. Non-goals

This plan does not:

- change schema;
- create migrations;
- modify runtime behavior;
- modify data;
- write tests;
- implement passivation;
- implement soft-delete;
- change `Debtor.delete()`;
- implement Party Registry;
- implement `CaseParty`;
- change Collection/Tebligat create validation now;
- change scheduler behavior now;
- open a PR.

## 13. PR-L3 Exit Criteria

PR-L3 is complete when:

- implementation phases are explicit;
- lifecycle fields are proposed but not implemented;
- migration/backfill strategy is reviewed;
- reader defaults are documented;
- writer guard matrix is documented;
- late-result exceptions are documented;
- AddressTask special rule is documented;
- PR-D1 dependency is documented;
- test matrix is documented;
- no code/schema/migration/runtime/data changes are made.
