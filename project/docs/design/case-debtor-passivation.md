# PR-L2 - CaseDebtor Passivation Decision Record

Status: Draft decision record

Scope: CaseDebtor lifecycle semantics only. This document does not change
schema, runtime behavior, migrations, data, tests, UI, or API contracts.

Required thesis:

```text
Passive != deleted.
Passive = no longer active transaction subject.
```

Core interpretation:

```text
CaseDebtor is a lifecycle-bearing domain entity candidate.
CaseDebtor is not a disposable junction row.
```

## 1. Problem

`CaseDebtor` currently represents the debtor's role inside a specific case.
The system also uses it as an anchor for legal, audit, and business records:
service history, tebligat state, collection attribution, UYAP/address research,
asset queries, third-party records, and external case references.

Current hard-delete behavior is therefore too narrow as a domain model. Removing
a `CaseDebtor` row can mean more than "remove a row from a join table"; it can
invalidate or erase the historical link between a case, a debtor, and actions
that were taken against or for that party.

PR-L1 added a short-term preflight guard around direct hard-delete:

```text
DELETE /case-debtors/:id
  -> CaseDebtorService.removeCaseDebtor()
  -> block when dependent legal/audit/business records exist
```

PR-L1 is a stopgap safety guard. It is not passivation, not soft-delete, and not
the beginning of schema implementation.

PR-L2 must define lifecycle semantics before any schema, migration, or runtime
behavior change is attempted.

## 2. Current CaseDebtor Behavior

Current direct routes:

| Surface | Route | Service path | Current behavior |
| --- | --- | --- | --- |
| List case debtors | `GET /cases/:caseId/debtors` | `CaseDebtorService.getCaseDebtors()` | Tenant-scoped through `Case.tenantId`; returns all current rows |
| Statistics | `GET /cases/:caseId/debtors/statistics` | `CaseDebtorService.getCaseDebtorStatistics()` | Tenant-scoped through `Case.tenantId`; computes counts from current rows |
| Add debtor | `POST /cases/:caseId/debtors` | `CaseDebtorService.addDebtorToCase()` | Verifies case tenant, debtor tenant, duplicate role, selected address ownership |
| Bulk add debtors | `POST /cases/:caseId/debtors/bulk` | `CaseDebtorService.addMultipleDebtorsToCase()` | Adds multiple debtor-role links with existing duplicate guards |
| Update case debtor | `PUT /case-debtors/:id` | `CaseDebtorService.updateCaseDebtor()` | Tenant-scoped through `Case.tenantId`; updates role/notification/service-related fields |
| Remove case debtor | `DELETE /case-debtors/:id` | `CaseDebtorService.removeCaseDebtor()` | Tenant-scoped through `Case.tenantId`; PR-L1 blocker preflight; cancels open `AddressTask`; then hard-deletes if allowed |

Current create-on-case path:

| Surface | Service path | Current behavior |
| --- | --- | --- |
| Case creation | `CaseService.create()` transaction | Creates `CaseDebtor` rows for selected debtors inside case creation |
| Seed/dev data | Seed scripts | Can create `CaseDebtor` rows outside normal user flows |

Current state model:

- There is no `CaseDebtor` passive/active lifecycle field.
- `serviceStatus` exists, but it is tebligat/service lifecycle, not
  `CaseDebtor` relationship lifecycle.
- `CaseDebtor` has case-specific attributes such as role, liability,
  notification preferences, selected address, service tracking fields, asset
  summary fields, quick notes, lawyer fields, and case note.
- The unique key `@@unique([caseId, debtorId, role])` means a retained passive
  row would currently occupy the same case-debtor-role slot.

## 3. Lifecycle Surface Map

`CaseDebtor` currently has three different meanings in one row:

| Surface | Meaning | Examples | Lifecycle implication |
| --- | --- | --- | --- |
| Relationship anchor | Debtor is a party in this case with a role | `caseId`, `debtorId`, `role`, liability fields | This is the candidate lifecycle surface: active vs passive relationship |
| Operational subject | New actions can target this debtor in this case | tebligat, collection attribution, address tasks, asset/UYAP queries | Passive should generally block new operational writes |
| Historical anchor | Past records point back to this case debtor | `ServiceHistory`, `Tebligat`, `Collection`, `AddressResearch`, `AssetQuery`, `ThirdParty` | Passive must preserve historical visibility |

Current direct delete semantics:

```text
Active CaseDebtor row
  -> PR-L1 preflight
  -> if blockers exist: refuse delete
  -> if no blockers exist: cancel open AddressTask and hard-delete
```

Target lifecycle semantics must separate these concepts:

```text
History/read model:
  existing records remain visible.

New write model:
  passive CaseDebtor is no longer a valid target for new operations unless an
  explicit exception is defined.
```

## 4. Reader Behavior

Reader surfaces currently assume every `CaseDebtor` row is active because no
passive state exists.

| Reader surface | Current behavior | PR-L2 semantic direction |
| --- | --- | --- |
| Case debtor list | Returns current `CaseDebtor` rows for a tenant-scoped case | Must decide whether operational lists default to active-only or include passive with label/filter |
| Case detail debtor panel | UI loads `api.getCaseDebtors(caseId)` | Historical case detail should not silently hide passive relations if they explain past actions |
| Debtor detail drawer | `DebtorService.getCaseDebtorDetail()` reads a tenant-scoped `CaseDebtor` | Detail/history view should remain available for passive rows |
| Service history | `DebtorService.getServiceHistory()` reads history by `caseDebtorId` | Service history should remain visible for passive rows |
| Tebligat panel | `TebligatService.findByCaseDebtorId()` reads loose scalar `caseDebtorId` | Existing tebligat history should remain visible |
| Collection reports/events | `Collection.caseDebtorId` and event payloads can preserve attribution | Existing collection attribution should remain visible |
| Third-party/external cases | Third-party and external case readers validate via `CaseDebtor` | Existing records should remain visible with passive context |
| Address research status | `AddressDiscoveryService.getResearchStatus()` may create research when absent | Reads with side effects need an explicit passive rule |
| Asset query summary | Asset query readers load by `caseDebtorId` | Existing query history and summaries should remain visible |
| Validation/report services | Some reports count/read all `CaseDebtor` rows in a case | Must define which reports mean active subject vs historical relation |
| Cross-file intelligence | Uses `CaseDebtor` to find other debtor-case appearances | Passive rows may remain relevant for historical/cross-case intelligence |

RFA-010 precedent:

```text
Passive relations are not necessarily hidden from case detail.
They can remain visible with a passive label because they are historical facts.
```

PR-L2 should apply the same principle unless a reader is explicitly an active
assignment/selection surface.

## 5. Writer Behavior

Writer surfaces currently assume every `CaseDebtor` row is eligible for new
operations.

| Writer surface | Current behavior | PR-L2 semantic direction |
| --- | --- | --- |
| Add case debtor | Creates a new `CaseDebtor` relationship after tenant and duplicate checks | Must decide how adding behaves when a passive row already exists for same `caseId + debtorId + role` |
| Bulk add case debtors | Same as add, batched | Same passive duplicate/reactivation decision |
| Update case debtor | Updates role, liability, notification mode, selected address, notes, lawyer fields | Must decide which updates are allowed on passive rows, if any |
| Remove case debtor | PR-L1 guarded hard-delete | Long-term route behavior must be reconciled with passivation semantics |
| Set active address | Updates `selectedAddressId` for a `CaseDebtor` | New active target changes should generally be blocked on passive rows |
| Quick note / case note | Updates note-like fields | Must decide whether audit/explanatory notes remain allowed after passivation |
| Service status update/retry | Updates `serviceStatus`, creates `ServiceHistory`, may trigger intelligence tasks | New service actions should generally be blocked; historical reads remain allowed |
| Tebligat create | Validates `caseDebtorId + caseId + tenant` and creates tebligat | New tebligat should be blocked on passive rows unless explicitly allowed |
| Tebligat result sync | Result flow updates `CaseDebtor.serviceStatus` and creates `ServiceHistory` | Need rule for late results on tebligat created before passivation |
| Collection create | Optional `caseDebtorId` attribution is validated by case and tenant | New collection attribution should be blocked on passive rows unless explicitly allowed |
| AddressTask create/workflow | Uses `caseId + debtorId`, not FK to `CaseDebtor` | New tasks should not target passive case-debtor relationship; existing open task handling must be defined |
| Address research | Starts/completes/exhausts research linked to `caseDebtorId` | New research should be blocked on passive rows; existing research history remains visible |
| UYAP query | Creates query linked to `caseDebtorId` | New UYAP query should be blocked on passive rows unless separately allowed |
| Institution letter | Creates letter linked to `caseDebtorId` | New institution letters should be blocked on passive rows unless separately allowed |
| Asset query | Runs/updates query linked to `caseDebtorId`; updates asset summary fields | New asset queries should be blocked; late result handling needs a rule |
| Third party / external case | Creates records linked to `caseDebtorId` | New linked legal/business records should be blocked on passive rows unless separately allowed |
| Client intake promotion | Validates debtor belongs to the case through `CaseDebtor` | Must decide whether passive membership counts as eligible target |

Default recommended writer rule:

```text
Passive CaseDebtor must not receive new legal, business, or operational writes.
```

Possible narrow exception:

```text
Audit/timeline/explanatory notes may be allowed if they do not make the passive
CaseDebtor an active transaction subject again.
```

This exception is not an implementation decision; it is an open domain decision
to freeze before schema/migration work.

## 6. Dependency Map

Direct `CaseDebtor` FK dependencies:

| Dependency | Reference type | Current delete effect | Passive semantic direction |
| --- | --- | --- | --- |
| `ServiceHistory` | FK CASCADE via `caseDebtorId` | Can be deleted by hard-delete cascade | Preserve as legal/service history |
| `ThirdParty` | FK CASCADE via `caseDebtorId` | Can be deleted by hard-delete cascade | Preserve as legal/business history |
| `ExternalCase` | FK CASCADE via `caseDebtorId` | Can be deleted by hard-delete cascade | Preserve as historical/legal reference |
| `UyapQuery` | FK CASCADE via `caseDebtorId` | Can be deleted by hard-delete cascade | Preserve query history |
| `InstitutionLetter` | FK CASCADE via `caseDebtorId` | Can be deleted by hard-delete cascade | Preserve institution letter history |
| `AddressResearch` | FK CASCADE via `caseDebtorId` | Can be deleted by hard-delete cascade | Preserve research lifecycle |
| `AssetQuery` | FK CASCADE via `caseDebtorId` | Can be deleted by hard-delete cascade | Preserve asset query history |

Loose scalar dependencies:

| Dependency | Reference type | Current delete effect | Passive semantic direction |
| --- | --- | --- | --- |
| `Collection.caseDebtorId` | loose scalar | Can become orphaned if `CaseDebtor` is deleted | Preserve attribution by retaining `CaseDebtor` |
| `Tebligat.caseDebtorId` | loose scalar | Can become orphaned if `CaseDebtor` is deleted | Preserve attribution by retaining `CaseDebtor` |

Derived or indirect dependencies:

| Dependency | Reference type | Current behavior | Passive semantic direction |
| --- | --- | --- | --- |
| `AddressTask` | `caseId + debtorId`; no FK to `CaseDebtor` | PR-L1 cancels open tasks on direct remove | Passive rule must decide open task cancellation and terminal task visibility |
| `CaseLifecycle.metadata` | metadata may store `caseDebtorId` | Historical metadata can point to deleted rows | Preserve referenced row when metadata describes past event |
| Domain/outbox event payloads | payload may include `caseDebtorId` | Historical event payload can point to deleted rows | Preserve referenced row for audit interpretation |
| `Debtor` parent cascade | `CaseDebtor.debtor` has cascade | PR-D1 found parent delete can bypass direct guard | Debtor deletion semantics must remain consistent with CaseDebtor lifecycle |
| `Case` parent cascade | `CaseDebtor.case` has cascade | Case deletion can remove relationship | Case deletion semantics are outside PR-L2 but relevant to future lifecycle completeness |

Tenant scope:

- Current safe paths generally tenant-scope `CaseDebtor` through `Case.tenantId`.
- Loose scalar checks for `Collection` and `Tebligat` must be scoped by
  `caseDebtorId + caseId + Case.tenantId`, not by `caseDebtorId` alone.
- PR-L2 must preserve tenant scoping as a design invariant for all future
  reader and writer semantics.

Tenant-guard consistency notes for later implementation planning:

- Some reader/writer paths verify parent ownership first and then read children
  by `caseDebtorId`.
- `AddressDiscoveryService.getResearchStatus()` currently has a read path that
  can create an `AddressResearch` row if absent; passive semantics must decide
  whether such side-effect reads are allowed.
- Any tenant guard consistency issue is out of scope for this document unless
  it changes lifecycle semantics.

## 7. PR-D1 Relationship

PR-D1 formally recorded Debtor deletion semantics:

```text
Debtor must not be treated as safely hard-deletable while historical,
legal, audit, or business references exist.
```

PR-D1 found a consistency problem:

```text
Protected path:
  CaseDebtorService.removeCaseDebtor()
    -> PR-L1 preflight

Potential unprotected path:
  DebtorService.delete()
    -> prisma.debtor.delete()
    -> DB cascade
    -> CaseDebtor disappears
```

Therefore PR-D1 is a prerequisite for PR-L2:

```text
PR-D1 -> Debtor deletion semantics
PR-L2 -> CaseDebtor lifecycle semantics
Implementation -> depends on both
```

PR-L2 must not define a `CaseDebtor` lifecycle that can still be violated by a
parent `Debtor` hard-delete cascade.

Relationship to Party Registry:

- Party Registry design may eventually evolve `CaseDebtor` into a future
  `CaseParty` concept.
- PR-L2 must not implement Party Registry.
- PR-L2 should define current `CaseDebtor` lifecycle semantics in a way that
  does not conflict with a later `CaseParty` migration.

## 8. Proposed Passive Semantics

Decision framing:

```text
Is CaseDebtor a disposable case-debtor junction row?

or

Is CaseDebtor a lifecycle-bearing domain entity?
```

Recommended decision to record:

```text
CaseDebtor should be treated as a lifecycle-bearing domain entity candidate.
It should not be treated as a safely disposable junction row once historical,
legal, audit, or business references exist.
```

Passive meaning:

```text
Passive != deleted.
Passive = no longer active transaction subject.
```

Reader semantics:

- Historical/legal/audit records should remain visible.
- Existing `Collection`, `Tebligat`, `ServiceHistory`, `AddressResearch`,
  `AssetQuery`, `UyapQuery`, `InstitutionLetter`, `ThirdParty`, and
  `ExternalCase` records should remain interpretable through the retained
  `CaseDebtor` relationship.
- Detail/history views should be able to show passive `CaseDebtor` rows with
  passive context.
- Active assignment/selection surfaces may default to active-only, but that
  must be an explicit reader decision rather than accidental filtering.

Writer semantics:

- Passive `CaseDebtor` should generally reject new operational writes.
- New `Collection`, `Tebligat`, `AddressTask`, address research, UYAP query,
  institution letter, asset query, third-party, external case, allocation, and
  service retry/update flows should not silently target a passive
  `CaseDebtor`.
- Late external results for operations created before passivation need a
  separate rule. They may be historical completion events rather than new
  active operations.
- Audit/timeline explanatory events may be allowed if they preserve history and
  do not reactivate the row by side effect.

Route/API compatibility:

- `DELETE /case-debtors/:id` should not remain a pure hard-delete long term
  unless the domain explicitly preserves a narrow hard-delete case.
- The route may need to become passivation behavior, or a new explicit
  passivation route may be introduced. This is an open decision, not a PR-L2
  implementation.
- Existing clients must not receive silent semantic drift without an API
  compatibility decision.

Migration/backfill direction:

- No schema change is made by PR-L2.
- No migration is made by PR-L2.
- Any future migration must wait until reader and writer semantics are frozen.
- Existing rows will need a reviewed default lifecycle state if passivation is
  implemented later.

## 9. Open Decisions

1. What fields define `CaseDebtor` passive lifecycle, if implemented later?
   Examples to decide later: active flag/status, passivated timestamp,
   passivated user, reason, legal effective date.
2. Can a passive `CaseDebtor` become active again?
3. If reactivation is allowed, is it explicit only, and what audit/legal reason
   is required?
4. Does passivation reason/date carry legal meaning or only operational meaning?
5. Should `DELETE /case-debtors/:id` become passivation, remain hard-delete for
   no-history rows, or be replaced by a separate endpoint?
6. If hard-delete remains, which dependencies make hard-delete impossible?
7. Should historical readers include passive `CaseDebtor` rows by default with
   a passive label?
8. Which operational readers should default to active-only?
9. Should passive rows appear in case debtor counts and statistics?
10. Should passive rows appear in validation gates?
11. Should passive rows be eligible for client-intake promotion target
    validation?
12. How should `@@unique([caseId, debtorId, role])` behave when a passive row
    exists and the same debtor/role is added again?
13. Should adding the same debtor/role reactivate the passive row, create a new
    lifecycle event, or remain blocked?
14. What happens to open `AddressTask` rows when `CaseDebtor` is passivated?
15. Should terminal `AddressTask` rows remain visible as history?
16. How should late tebligat/PTT/UETS/KEP results be handled after passivation?
17. How should late asset query or UYAP query results be handled after
    passivation?
18. Are note-like fields (`quickNote`, `caseNote`) operational writes or
    audit/explanatory writes?
19. Should passivation produce a timeline/lifecycle event?
20. How does this lifecycle map to future Party Registry / `CaseParty`
    semantics?
21. Should `Case` deletion semantics also be reviewed before implementation,
    given `Case -> CaseDebtor` cascade?
22. Which tenant-guard consistency issues must be fixed before enabling
    passivation behavior?

## 10. Non-goals

This document does not:

- change schema;
- create migrations;
- modify runtime behavior;
- modify data;
- change tests;
- change UI/frontend behavior;
- implement passivation;
- implement soft-delete;
- implement Party Registry;
- implement `CaseParty`;
- change `Debtor.delete()`;
- change `Collection` or `Tebligat` create validation;
- change scheduler behavior;
- change `ServiceHistory` implementation;
- decide final field names;
- decide final API shape;
- open a PR.

Success criteria for PR-L2:

```text
CaseDebtor lifecycle formally understood.
Passive != deleted.
Passive = no longer active transaction subject.
Reader and writer semantics are explicit enough for review.
Open decisions explicitly listed.
No code written.
No schema change.
No migration.
No implementation.
```
