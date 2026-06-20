# PR-D3 - Debtor Lifecycle Invariant

Status: Draft decision record

Scope: documentation only. This document does not change schema, create a
migration, modify runtime behavior, modify tests, modify data, or change UI.

Base context:

- PR-D1 defined that `Debtor` is not safely hard-deletable while legal,
  historical, audit, or business references exist.
- PR-L2 through PR-L6e implemented `CaseDebtor` lifecycle/passive writer
  protections.
- PR-D2 changed `DebtorService.delete()` so a debtor cannot be hard-deleted
  when any tenant-scoped `CaseDebtor` exists.

Core invariant:

```text
Debtor hard-delete is allowed only for an unrelated tenant-local trash record.

If a Debtor has any tenant-scoped case, operation, history, audit, address,
service, query, task, intelligence, attribution, or external reference, the
Debtor must not be hard-deleted through the normal application route.
```

## 1. Multitenant Boundary

`Debtor` has its own `tenantId`, but the most important lifecycle boundary is
not only `Debtor.tenantId`.

`CaseDebtor` is tenant-scoped through:

```text
CaseDebtor.caseId -> Case.tenantId
```

Therefore hard-delete preflight rules must use tenant-safe predicates:

- Direct debtor dependencies may be checked after `DebtorService.findOne()`
  has proven `Debtor.id + tenantId`.
- `CaseDebtor` dependencies must be checked through `case: { tenantId }`.
- Loose references with their own `tenantId` must include `tenantId` in the
  predicate.
- Loose references without FK enforcement must still be treated as semantic
  blockers when they point at the debtor or the debtor's case relationship.

## 2. Current Delete Semantics

Current production route:

```text
DELETE /debtors/:id
  -> DebtorController.delete()
  -> DebtorService.delete(tenantId, id)
```

Current PR-D2 behavior:

1. Load the debtor through tenant-scoped `findOne(tenantId, id)`.
2. Count any `CaseDebtor` where:
   - `debtorId = id`
   - `case.tenantId = tenantId`
3. If count is greater than zero, reject hard-delete.
4. If count is zero, keep the existing hard-delete fallback.

This closes the parent-cascade bypass for `Debtor -> CaseDebtor`, but it does
not yet define a full independent `Debtor` lifecycle.

Current UI assumption:

- The web debtor list/detail delete actions still call `DELETE /debtors/:id`.
- The UI language assumes removal/hard-delete, not archive/passivation.
- The UI already has failure handling for blocked deletes.

## 3. Direct Debtor Relation Census

| Model | Relation behavior | Classification | Hard-delete implication |
| --- | --- | --- | --- |
| `CaseDebtor` | `debtorId -> Debtor`, `onDelete: Cascade` | Operational/lifecycle | Block. Already covered by PR-D2 when tenant-scoped through `Case.tenantId`. |
| `DebtorAddress` | `debtorId -> Debtor`, `onDelete: Cascade` | Master-data with legal use | Block. Addresses may support service, tebligat, and evidence history. |
| `EstateHeir` | `debtorId -> Debtor`, `onDelete: Cascade` | Legal/master-data | Block unless the debtor is proven to be a pure trash record. |
| `Asset` | `debtorId -> Debtor`, `onDelete: Cascade` | Operational/evidence | Block. Asset facts can affect enforcement. |
| `DebtorCommunication` | `debtorId -> Debtor`, `onDelete: Cascade` | Historical/audit | Block. Communication history must not disappear silently. |
| `Task` | nullable `debtorId -> Debtor`, `onDelete: Cascade` | Operational/audit | Block. Debtor-scoped work and escalation history must be preserved. |
| `DebtorIntelligence` | `debtorId -> Debtor`, `onDelete: Cascade` | Historical/evidence | Block. Field intelligence and verification are evidence-like records. |
| `ClientIntelStatement` | `debtorId -> Debtor`, `onDelete: Restrict` | Historical/evidence | Block. DB already expresses retention semantics. |
| `ClientInfoRequest` | nullable `debtorId -> Debtor`, no explicit `onDelete` visible | Operational/history | Block until DB behavior and product semantics are explicit. |
| `IcrabotJobRun` | nullable `debtorId -> Debtor`, no explicit `onDelete` visible | Operational/audit | Block until DB behavior and product semantics are explicit. |
| `AddressTask` | `debtorId -> Debtor`, `onDelete: Cascade` | Operational/history | Block. Address task state/history must not be removed by debtor cleanup. |

Design note:

Some older schema comments justify cascade by saying the child row becomes
meaningless when the debtor is deleted. PR-D3 reverses the application-level
interpretation: if the child row exists, normal hard-delete is not safe.

## 4. Indirect CaseDebtor Dependencies

These models are not direct `Debtor` relations, but are affected by
`Debtor -> CaseDebtor` cascade if parent hard-delete is allowed:

| Model | Relation behavior | Classification | Hard-delete implication |
| --- | --- | --- | --- |
| `ServiceHistory` | `caseDebtorId -> CaseDebtor`, `onDelete: Cascade` | Historical/audit | Block through any tenant `CaseDebtor`. |
| `ThirdParty` | `caseDebtorId -> CaseDebtor`, `onDelete: Cascade` | Operational/legal | Block through any tenant `CaseDebtor`. |
| `ExternalCase` | `caseDebtorId -> CaseDebtor`, `onDelete: Cascade` | Operational/external attribution | Block through any tenant `CaseDebtor`. |
| `UyapQuery` | `caseDebtorId -> CaseDebtor`, `onDelete: Cascade` | Operational/history | Block through any tenant `CaseDebtor`. |
| `InstitutionLetter` | `caseDebtorId -> CaseDebtor`, `onDelete: Cascade` | Operational/history | Block through any tenant `CaseDebtor`. |
| `AddressResearch` | `caseDebtorId -> CaseDebtor`, `onDelete: Cascade` | Operational/history | Block through any tenant `CaseDebtor`. |
| `AssetQuery` | `caseDebtorId -> CaseDebtor`, `onDelete: Cascade` | Operational/history | Block through any tenant `CaseDebtor`. |

PR-D2's broader any-`CaseDebtor` blocker protects these indirect dependencies
from the parent `Debtor` hard-delete route.

## 5. Loose Reference Census

Loose references are not strict Prisma relations to `Debtor` or `CaseDebtor`,
but they still carry legal, audit, or attribution meaning.

| Model | Loose reference | Classification | Hard-delete implication |
| --- | --- | --- | --- |
| `Collection` | nullable `caseDebtorId` | Attribution/history | Block if it points to a debtor's tenant case relationship. |
| `Tebligat` | nullable `caseDebtorId` | Attribution/legal history | Block if it points to a debtor's tenant case relationship. |
| `AddressMissingTask` | scalar `debtorId` | Operational/history | Block if `tenantId + debtorId` matches. |
| `AddressAuditLog` | nullable `debtorId` | Audit/history | Block if `tenantId + debtorId` matches. |
| `ExternalCase` | nullable `counterpartyId` | External attribution | Block if the debtor is used as external counterparty. |
| `CpeDecisionLog` | `contextJson.debtorId?` | Decision/audit | Treat as loose-risk; JSON scans may be expensive and need staged handling. |
| `IcrabotTimelineEntry` | `body Json?` may carry debtor context | Timeline/audit | Treat debtor references in JSON as loose-risk if producers store them there. |

Loose-reference rule:

```text
No FK does not mean no blocker.
```

## 6. Hard-Delete Blocker Matrix

| Blocker | Decision | Rationale |
| --- | --- | --- |
| Any tenant-scoped `CaseDebtor` | Block | A debtor that appeared in a case is no longer disposable master data. |
| Any direct debtor address | Block | Addresses may be service/evidence inputs and may be selected by case debtors. |
| Any debtor-level asset | Block | Asset facts affect enforcement and historical strategy. |
| Any debtor communication | Block | Communication is audit/history. |
| Any debtor-scoped task or address task | Block | Operational work must not disappear through cleanup. |
| Any debtor intelligence | Block | Intelligence is evidence-like and may be cross-case reusable. |
| Any client intel statement | Block | Schema already uses `Restrict`; preserve that intent. |
| Any client info request | Block pending explicit decision | Request/response history can be legal/business context. |
| Any Icrabot job run | Block pending explicit decision | Job execution history is operational/audit context. |
| Any loose `caseDebtorId` attribution | Block | Collections and tebligats must not point at removed identity links. |
| Any loose `debtorId` audit/task reference | Block | Audit/task history must not point at a removed debtor. |
| Any external counterparty reference | Block | External attribution must remain explainable. |
| No dependencies or loose references | Allow hard-delete fallback | Only this is tenant-local trash cleanup. |

## 7. Independent Debtor Lifecycle

`Debtor` lifecycle should be independent from `CaseDebtor` lifecycle.

Do not derive `Debtor` status automatically from all related `CaseDebtor`
statuses.

Reason:

- `Debtor` is a tenant-level identity/business entity.
- `CaseDebtor` is a case-specific relationship and transaction subject.
- A debtor can be inactive in one case relationship but still valid elsewhere.
- A debtor can be globally paused/archived without rewriting historical
  `CaseDebtor` rows.

Recommended future states:

| State | Meaning |
| --- | --- |
| `ACTIVE` | Default. Eligible for ordinary selectors and new operational linking. |
| `PASSIVE` | Tenant-level debtor should not be used as a new operational target by default, but history remains visible and reactivation is possible. |
| `ARCHIVED` | Stronger retention state. Hidden from default selectors and blocked for new case creation until explicitly reactivated. |

Field names, enum names, audit fields, and migration details are intentionally
out of scope for PR-D3.

## 8. CaseDebtor Interaction Rules

| Combination | Rule |
| --- | --- |
| `Debtor.ACTIVE + CaseDebtor.PASSIVE` | Valid. The debtor remains globally usable, but this specific case relationship is not an active transaction subject. |
| `Debtor.PASSIVE + CaseDebtor.ACTIVE` | Do not auto-passivate the relationship. Existing active case relationships need an explicit operational/legal decision. |
| `Debtor.ARCHIVED + new case creation` | Block. New case creation or debtor linking should require explicit debtor reactivation first. |
| Debtor reactivation | Must be explicit and audited. It must not reactivate passive `CaseDebtor` rows automatically. |
| CaseDebtor reactivation | Must be explicit and audited. It must not reactivate a passive/archived `Debtor` automatically. |

## 9. Staged PR Path

### PR-D3 - Documentation / Invariant

Scope:

- Document Debtor hard-delete invariant.
- Document blocker matrix.
- Document lifecycle independence from `CaseDebtor`.
- Document staged implementation path.

Out of scope:

- schema;
- migrations;
- service code;
- UI;
- tests;
- data changes.

### PR-D4 - Hard-Delete Preflight Expansion

Potential scope:

- Keep `DebtorService.delete()` hard-delete fallback only for truly unrelated
  debtor records.
- Add service-level blocker counts for direct debtor dependencies.
- Add service-level blocker counts for safe loose references.
- Keep PR-D2's tenant `CaseDebtor` blocker.
- Do not add lifecycle schema yet.

Open implementation decision:

- JSON loose references such as `CpeDecisionLog.contextJson` and timeline
  bodies may need a separate strategy if direct DB predicates are unsafe or
  too expensive.

### PR-D5 - Debtor Lifecycle Schema, If Approved

Potential scope:

- Add a debtor lifecycle enum or canonical status field.
- Add audit metadata such as passivated/archived timestamps, actor, and reason.
- Backfill existing debtors to `ACTIVE`.
- Preserve hard-delete fallback only for no-reference trash records.

Out of scope:

- broad UI redesign;
- automatic derivation from `CaseDebtor`;
- FK/cascade refactor unless separately approved.

### PR-D6 - Debtor Lifecycle Service Semantics

Potential scope:

- Add explicit passivate/archive/reactivate service methods and routes.
- Add tenant-scoped guards for new debtor use when debtor is passive/archived.
- Add audit/event behavior.
- Keep historical readers intact.

### PR-D7 - UI/API Behavior

Potential scope:

- Replace user-facing hard-delete expectations with archive/passivation where
  appropriate.
- Show debtor lifecycle badges.
- Hide or disable active-only selectors/actions for passive or archived
  debtors.
- Keep history/detail visibility.

## 10. Risks And Open Decisions

| Risk or decision | Priority | Direction |
| --- | --- | --- |
| Direct cascade rows can still disappear when no `CaseDebtor` exists | P1 | PR-D4 should expand preflight before lifecycle schema work. |
| `ClientInfoRequest` and `IcrabotJobRun` have no explicit `onDelete` visible | P1 | Treat as blockers until DB behavior and product intent are explicit. |
| JSON debtor references are hard to preflight cheaply | P1/P2 | Document and stage separately; do not pretend they are strict FK safety. |
| UI still says delete | P2 | Accept temporarily because backend blocks unsafe deletes; fix after lifecycle invariant stabilizes. |
| Admin hard-delete mode | Open | Not in current scope. If added, it must be explicit, audited, and outside normal user route semantics. |
| Debtor lifecycle fields | Open | Justified, but not implemented until invariant and preflight are stable. |

## 11. PR-D3 Exit Criteria

PR-D3 is complete when:

- Debtor hard-delete invariant is formally defined.
- Direct, indirect, and loose blocker classes are documented.
- Debtor lifecycle independence from `CaseDebtor` is documented.
- CaseDebtor interaction rules are documented.
- The staged PR path is documented.
- No production code, schema, migrations, tests, UI, or data are changed.
