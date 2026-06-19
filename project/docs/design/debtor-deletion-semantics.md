# PR-D1 - Debtor Deletion Semantics Decision Record

Status: Draft decision record

Scope: Debtor deletion semantics only. This document does not change schema,
runtime behavior, migrations, data, or API contracts.

## 1. Problem

`Debtor` is currently deletable through `DELETE /debtors/:id`. Forensic review
found that this route can produce the same practical result as deleting related
`CaseDebtor` rows, but without going through the PR-L1 preflight guard that was
added to protect legal, audit, and business records attached to `CaseDebtor`.

Core question:

```text
Is Debtor a hard-deletable master-data entity?

or

Is Debtor a lifecycle-bearing domain entity?
```

The current evidence points toward the second option: `Debtor` is a
lifecycle-bearing domain entity candidate, not safely hard-deletable master
data.

Principle:

```text
Closed case != historically unimportant case.
```

## 2. Current Delete Behavior

Current route:

```text
DELETE /debtors/:id
```

Current service path:

```text
DebtorController.delete()
  -> DebtorService.delete(tenantId, id)
```

Current service behavior:

1. Load the debtor through `findOne(tenantId, id)`.
2. Count active `CaseDebtor` associations where the case status is one of:
   `DERDEST`, `ISLEMDE`, `DERKENAR`.
3. If active associations exist, throw `BadRequestException`.
4. Otherwise run `prisma.debtor.delete({ where: { id } })`.

The current guard asks only:

```text
Does this debtor appear in an active case?
```

It does not ask:

```text
Does this debtor appear in closed historical cases?
Does this debtor have service history?
Does this debtor have collection or tebligat references?
Does this debtor have address research, UYAP, intelligence, or audit history?
```

## 3. Caller Map

| Surface | Caller | Reachability |
| --- | --- | --- |
| API | `DebtorController.delete()` | `DELETE /debtors/:id` |
| Guard | `JwtAuthGuard` | Authenticated users; no admin-only role guard was found in this controller path |
| Service | `DebtorService.delete(tenantId, id)` | Called by controller |
| Web UI | Debtors list page delete action | Normal UI flow |
| Web UI | Debtor detail/modal delete action | Normal UI flow |
| Jobs/scripts | No runtime caller found | Test cleanup uses direct `deleteMany`, outside production route semantics |

## 4. Dependency Map

Direct `Debtor` dependencies:

| Dependency | Reference Type | Delete Effect / Risk |
| --- | --- | --- |
| `CaseDebtor` | FK CASCADE via `debtorId` | Deletes the debtor-case relationship and may cascade into legal/audit records |
| `DebtorAddress` | FK CASCADE via `debtorId` | Removes addresses that may have tebligat relevance |
| `EstateHeir` | FK CASCADE via `debtorId` | Removes estate heir data |
| `Asset` | FK CASCADE via `debtorId` | Removes debtor asset records |
| `DebtorCommunication` | FK CASCADE via `debtorId` | Removes communication history |
| `DebtorIntelligence` | FK CASCADE via `debtorId` | Removes field intelligence and verification history |
| `AddressTask` | FK CASCADE via `debtorId` | Removes address task history/state |
| `Task` | nullable FK CASCADE via `debtorId` | Removes debtor-scoped operational tasks |
| `ClientIntelStatement` | FK RESTRICT via `debtorId` | Can block deletion if present |
| `ClientInfoRequest` | nullable FK, no explicit `onDelete` in schema | Behavior needs DB/migration-level confirmation |
| `IcrabotJobRun` | nullable FK, no explicit `onDelete` in schema | Behavior needs DB/migration-level confirmation |
| `AddressMissingTask` | loose scalar `debtorId` | Can become orphaned |
| `AddressAuditLog` | loose scalar `debtorId` | Can become orphaned historical/audit reference |
| `ExternalCase.counterpartyId` | loose scalar Debtor id | Can become orphaned counterparty reference |

`CaseDebtor` dependencies affected indirectly through `Debtor -> CaseDebtor`
cascade:

| Dependency | Reference Type | Delete Effect / Risk |
| --- | --- | --- |
| `ServiceHistory` | FK CASCADE via `caseDebtorId` | Legal service history can be deleted |
| `ThirdParty` | FK CASCADE via `caseDebtorId` | Third-party legal/business records can be deleted |
| `ExternalCase` | FK CASCADE via `caseDebtorId` | External case / attachment records can be deleted |
| `UyapQuery` | FK CASCADE via `caseDebtorId` | UYAP query history can be deleted |
| `InstitutionLetter` | FK CASCADE via `caseDebtorId` | Institution letter history can be deleted |
| `AddressResearch` | FK CASCADE via `caseDebtorId` | Address research lifecycle can be deleted |
| `AssetQuery` | FK CASCADE via `caseDebtorId` | Asset query history can be deleted |
| `Collection` | loose scalar `caseDebtorId` | Collection attribution can become orphaned |
| `Tebligat` | loose scalar `caseDebtorId` | Tebligat attribution can become orphaned |

## 5. PR-L1 Bypass Risk

Protected path:

```text
CaseDebtorService.removeCaseDebtor()
  -> PR-L1 preflight
  -> block if dependent legal/audit/business records exist
```

Potential unprotected path:

```text
DebtorService.delete()
  -> active case count only
  -> prisma.debtor.delete()
  -> DB cascade
  -> CaseDebtor disappears
```

Semantic inconsistency:

`CaseDebtorService.removeCaseDebtor()` blocks hard-delete when dependent
records exist, but `DebtorService.delete()` can bypass that service-level
preflight by deleting the parent `Debtor`, allowing database cascade to remove
`CaseDebtor`.

This means PR-L1 is currently path-specific. It protects one delete entrypoint,
not the full deletion semantics of the domain graph.

## 6. Historical, Legal, And Audit Impact

Potential impacts of `Debtor` hard-delete:

| History Type | Impact |
| --- | --- |
| Legal history | `CaseDebtor` and dependent legal records can be removed through cascade |
| Service history | `ServiceHistory` can be removed through `CaseDebtor` cascade |
| Collection history | `Collection` can keep a loose orphan `caseDebtorId` |
| Tebligat history | `Tebligat` can keep a loose orphan `caseDebtorId` |
| Address research history | `AddressResearch`, `UyapQuery`, `InstitutionLetter` can be removed |
| Intelligence history | `DebtorIntelligence` can be removed |
| Audit trail | `AddressAuditLog` can retain orphan loose debtor references; other audit-like records can be removed or detached |

The current active-case guard is not sufficient for legal history preservation.
Closed cases may be the most important audit surface after a dispute,
collection, tebligat, or enforcement action has already happened.

## 7. Risk Matrix

| Risk | Priority | Justification |
| --- | --- | --- |
| `Debtor.delete()` bypasses PR-L1 `CaseDebtor` protections | P0 | Same effective delete can happen through a parent cascade without PR-L1 preflight |
| Historical/legal data cascade loss | P0 | `CaseDebtor` dependent legal/audit records can be deleted |
| `Collection` orphan attribution | P0 | `Collection.caseDebtorId` is loose scalar and can point to a removed `CaseDebtor` |
| `Tebligat` orphan attribution | P0 | `Tebligat.caseDebtorId` is loose scalar and can point to a removed `CaseDebtor` |
| Active-case-only guard is too narrow | P0 | Closed case does not mean historically unimportant case |
| Debtor intelligence/address/task history loss | P1 | Operational and evidence-like records can be deleted or detached |
| Nullable FK behavior uncertainty | P1 | `ClientInfoRequest` and `IcrabotJobRun` need explicit semantic decision |
| Loose debtor references | P1/P2 | `AddressMissingTask`, `AddressAuditLog`, `ExternalCase.counterpartyId` can orphan |
| Identity duplicate/concurrency | P1 | Important, but separate from deletion semantics |

## 8. Decision: Debtor Deletion Semantics

Decision:

```text
Debtor must not be treated as safely hard-deletable while historical,
legal, audit, or business references exist.
```

Domain interpretation:

```text
Debtor is a lifecycle-bearing domain entity candidate.
Debtor is not currently proven to be disposable master data.
```

This decision record does not choose the final implementation mechanism. It
only defines the deletion semantics boundary:

- `Debtor.delete()` must not be reasoned about only as a master-data cleanup.
- Active case presence is not a sufficient delete safety predicate.
- Any future delete/passivation implementation must account for both direct
  `Debtor` dependencies and indirect `CaseDebtor` dependencies.
- Service-level guards must be consistent across all paths that can remove or
  invalidate `CaseDebtor`.

## 9. Relationship To PR-L2 CaseDebtor Passivation

PR-D1 blocks PR-L2.

Reason:

```text
If CaseDebtor lifecycle is defined first,
but Debtor.delete() can still cascade-delete CaseDebtor,
then CaseDebtor lifecycle can be violated through another path.
```

Therefore:

```text
PR-D1 -> Debtor deletion semantics
PR-L2 -> CaseDebtor lifecycle semantics
Implementation -> depends on both
```

PR-L2 must not proceed to CaseDebtor passivation design until Debtor deletion
semantics are formally defined at the decision-record level.

## 10. Open Decisions

1. Should `Debtor` ever be hard-deletable after it has appeared in any case,
   including closed cases?
2. Should `DELETE /debtors/:id` become a passivation/deactivation route rather
   than a hard-delete route?
3. Should any hard-delete path remain for admin/super-admin support operations?
4. If hard-delete remains for exceptional cases, which references must block it?
5. Should loose references such as `Collection.caseDebtorId`,
   `Tebligat.caseDebtorId`, `AddressAuditLog.debtorId`, and
   `ExternalCase.counterpartyId` be treated as blockers?
6. Should closed cases always preserve Debtor and CaseDebtor identity links?
7. How should nullable FK dependencies (`ClientInfoRequest`, `IcrabotJobRun`)
   behave when a Debtor is no longer active?
8. Should Debtor lifecycle be independent from CaseDebtor lifecycle, or should
   Debtor passivation be derived from all CaseDebtor relationships?
9. What audit/timeline event should be emitted when Debtor is deactivated or
   deletion is refused?
10. How should future Party Registry semantics interact with Debtor lifecycle?

## 11. Non-goals

This document does not:

- change schema;
- create migrations;
- change runtime behavior;
- modify data;
- implement passivation;
- define the final Debtor lifecycle fields;
- define the final CaseDebtor passivation design;
- solve identity duplicate/concurrency;
- change UI behavior;
- open or close any route.

Success criteria for PR-D1:

```text
Debtor deletion semantics formally defined.
Open decisions explicitly listed.
No code written.
No schema change.
No migration.
No implementation.
```
