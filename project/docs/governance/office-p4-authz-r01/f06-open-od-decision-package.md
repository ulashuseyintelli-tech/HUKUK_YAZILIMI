# OFFICE P4 R01 — F06 Open OD Decision Package

```text
PACKAGE ID       : OFFICE-SC-F06-OPEN-OD-DECISION-PACK-R01
PACKAGE STATUS   : DECISION_READY / OWNER_SELECTION_REQUIRED
PREPARED AT      : 2026-08-13
WORKSPACE MODULE : OFFICE
DECISION COUNT   : 9
IMPLEMENTATION   : NONE / NOT AUTHORIZED
RUNTIME EFFECT   : NONE
```

## 1. Purpose and authority boundary

This package presents the nine open OFFICE owner decisions in a consistent,
decision-ready form. It does not select, ratify, or implement any option. A selection
becomes canonical only after the authorized governance writer records the owner
disposition in `decision-log.md` and aligns the canonical owner-decision dossier.

This package does not authorize code, schema, migration, database, flag, runtime,
production activation, PermissionGrant writer/admin surfaces, a second approval
engine, or CAP-09A producer work. `ADR-009` and
`dbind-financial-authority-decisions.md §5` remain unchanged. Any later implementation
requires a distinct task-bound `SEMANTIC_AUTHORITY` and `EXECUTION_GRANT`.

Canonical inputs:

- `project/docs/governance/OFFICE-OWNER-DECISIONS.md`
- `project/docs/governance/OFFICE-GOVERNANCE.md`
- `project/docs/governance/OFFICE-MASTER-SYNTHESIS.md`
- `project/docs/governance/OFFICE-RISK-REGISTER.md`
- `project/docs/adr/ADR-009-UNIVERSAL-OFFICE-APPROVAL.md`
- `project/docs/governance/dbind-financial-authority-decisions.md`

## 2. Decision overview

| Decision | Current canonical status | Blocking surface | Existing safe default | Owner action required |
|---|---|---|---|---|
| `OFF/OD-02` | SAFE DEFAULT AVAILABLE / OPEN | Authorization pipeline and tenant-local membership | B | Select A/B/C |
| `OFF/OD-03` | BLOCKING BEFORE EMPLOYMENT MODEL / OPEN | Employment cardinality and history | B | Select A/B/C with OD-04 disposition |
| `OFF/OD-04` | DEFERRED / NOT SELECTED | External counsel/contractor lifecycle | B; recommendation is to defer | Keep deferred, or reopen and select A/B/C |
| `OFF/OD-06` | SAFE DEFAULT AVAILABLE / OPEN | FoundingLawyer semantics | B | Select A/B/C without creating a bypass implicitly |
| `OFF/OD-07` | BLOCKING BEFORE ORG MIGRATION / OPEN | Tenant↔Organization/LawFirm cardinality | B | Select A/B/C after OD-02 is coherent |
| `OFF/OD-12` | BLOCKING BEFORE APPROVAL V2 / OPEN | Multi-level approval identity | B | Select A/B/C while preserving ADR-009/DBIND |
| `OFF/OD-13` | BLOCKING BEFORE DELEGATION MODEL / OPEN | Delegation authority and limits | B | Select A/B/C within the §16 scope/limit invariant |
| `OFF/OD-16` | SAFE DEFAULT AVAILABLE / OPEN | Offboarding revoke↔reassignment order | B | Select A/B/C and reconcile with OFF-INV-07 |
| `OFF/OD-19` | BLOCKING BEFORE WORKLOAD V2 / OPEN | Permitted purpose of workload metrics | B | Select A/B/C with personnel-read-model safeguards |

The safe defaults and recommendations above are existing dossier positions, not a
selection made by this package.

## 3. Decision cards

### OFF/OD-02 — UserAccount multi-tenant/org membership

- **Question:** Can one UserAccount carry more than one tenant/organization
  membership?
- **Options:** A — single tenant; B — multiple memberships with independent
  tenant-local state; C — multiple memberships with a shared global role.
- **Existing dossier position:** safe default B; architectural recommendation B.
- **Impact:** security low; N:N Membership data model; migration low; backward
  compatibility and operational impact low.
- **Dependencies:** closed `OFF/OD-01`; open `OFF/OD-07`.
- **Decision guard:** a selection is policy only. Membership schema, migration, data
  inventory, and authorization implementation remain separate tasks.
- **Acceptance parties:** owner; decision-log recording is required.

### OFF/OD-03 — Multiple Employment records for one Person

- **Question:** Can one Person have more than one active Employment at the same time?
- **Options:** A — strictly one Employment; B — one active Employment per
  organization at a time, many over history; C — simultaneous Employment across
  multiple organizations without that restriction.
- **Existing dossier position:** safe default B; architectural recommendation B.
- **Impact:** security low; historical Employment versioning; migration and
  operational impact medium; existing records require inventory.
- **Dependencies:** `OFF/OD-04`; the two decisions form a lifecycle boundary and must
  be dispositioned coherently.
- **Decision guard:** no Employment schema or migration is authorized by selection.
- **Acceptance parties:** HR, Legal Operations, owner.

### OFF/OD-04 — External counsel/contractor lifecycle

- **Question:** Does external counsel/contractor use a separate lifecycle?
- **Options on reopen:** A — same Employment model; B — separate EmploymentType with
  limited scope; C — separate entity outside Employment.
- **Existing dossier position:** `DEFERRED`; safe default B if reopened;
  architectural recommendation is not to decide now.
- **Impact:** security medium; data, migration, compatibility, and reversibility are
  still TBD; current operational impact low.
- **Dependencies:** `OFF/OD-03`.
- **Owner disposition:** `KEEP_DEFERRED`, or `REOPEN_AND_SELECT_A/B/C`.
- **Acceptance parties:** reopening requires a Legal Operations and HR need plus
  owner disposition.

### OFF/OD-06 — FoundingLawyer historical status

- **Question:** Is FoundingLawyer a historical status?
- **Options:** A — active technical bypass role; B — historical organizational
  attribute with no bypass; C — remove the concept.
- **Existing dossier position:** safe default B; architectural recommendation B.
- **Impact:** security medium; data, migration, and operations low; reversible.
- **Dependencies:** closed `OFF/OD-05`; DBIND §5.
- **Decision guard:** `OFF-INV-03` prevents organizational title from silently
  generating unlimited permission. Existing DBIND §5 usage must be preserved. Option
  A cannot become a runtime bypass without a separate canonical amendment and task.
- **Acceptance parties:** Product, Legal Operations, owner.

### OFF/OD-07 — Tenant↔Organization/LawFirm cardinality

- **Question:** What is the Tenant to Organization/LawFirm cardinality?
- **Options:** A — strict 1:1; B — initial model supporting 1:N; C — N:1.
- **Existing dossier position:** safe default B; architectural recommendation B.
- **Impact:** security, data, and migration high; operational impact medium;
  reversibility difficult; existing data requires careful inventory.
- **Dependencies:** `OFF/OD-02` must yield a coherent membership model.
- **Decision guard:** this is policy only; organization migration and schema work are
  explicitly outside this package.
- **Acceptance parties:** Architecture, Product, owner.

### OFF/OD-12 — One Person completing multiple approval levels

- **Question:** Can the same Person complete more than one level of an approval chain?
- **Options:** A — unrestricted; B — different Person unless an explicit exception
  exists; C — unrestricted only for founder/partner.
- **Existing dossier position:** safe default B; architectural recommendation B with
  an explicit ADR-009 single-step-exception cross-reference.
- **Impact:** security high; data and migration low; operational impact medium;
  reversible.
- **Dependencies:** closed `OFF/OD-11`; `ADR-009`.
- **Decision guard:** the decision must address multi-level identity only. It cannot
  create a second approval engine or alter existing action-specific DBIND §5
  self-approval exceptions.
- **Acceptance parties:** Finance, Compliance, owner.

### OFF/OD-13 — Delegation scope

- **Question:** Which authority types can delegation cover?
- **Options:** A — delegate scope/limit may grow; B — it cannot exceed the delegator,
  and approval delegation is separate; C — full authority transfer.
- **Existing dossier position:** safe default B; architectural recommendation B.
- **Impact:** security high; data, migration, and operations medium; reversible.
- **Dependencies:** `OFF/OD-12`; synthesis evidence `LF-RT-13`, `LF-RT-30`, and
  `LF-RT-31` remains unresolved/conditional.
- **Decision guard:** `OFFICE-GOVERNANCE.md §16` already requires delegated scope and
  limit not to exceed the delegator. A selection that conflicts with this invariant
  requires separate canonical reconciliation; this package cannot materialize it.
- **Acceptance parties:** Security, Finance, Legal Operations, owner.

### OFF/OD-16 — Offboarding revoke↔reassignment order

- **Question:** What is the order between access revocation and reassignment?
- **Options:** A — reassignment first, revoke later; B — immediate privileged
  freeze/revoke, then controlled reassignment; C — parallel/simultaneous.
- **Existing dossier position:** safe default B; architectural recommendation B.
- **Impact:** security high; data low; no migration; operational impact medium due to
  case/client continuity; reversible.
- **Dependencies:** `OFFICE-GOVERNANCE.md §18`; synthesis evidence `LF-RT-21`,
  `LF-RT-25`, and `LF-RT-35` records control gaps or conditional behavior.
- **Decision guard:** `OFF-INV-07` retains the canonical
  `freeze → revoke → inventory → reassign → terminate → invalidate → verify → audit`
  orchestration. A conflicting selection needs a separate canonical amendment before
  implementation.
- **Acceptance parties:** Security, HR, Legal Operations, owner.

### OFF/OD-19 — Permitted purpose of workload metrics

- **Question:** For what purpose may a workload metric be used?
- **Options:** A — direct performance evaluation; B — planning only and never a
  standalone personnel evaluation; C — remove and do not use it.
- **Existing dossier position:** safe default B; architectural recommendation B.
- **Impact:** security and data low; no migration; operational impact medium; existing
  leaderboard/performance use requires review; reversible.
- **Dependencies:** Product and HR; `STF-PRD-OPS-001`; synthesis evidence
  `OP-RT-17`, `OP-RT-23`, and `OP-RT-24` remains partial, not recommended, or a
  context-sensitive control gap.
- **Decision guard:** `OFF-INV-09` remains binding: the read model is not a canonical
  writer, must identify sources and freshness, distinguish deny from empty, and never
  present mock data as real.
- **Acceptance parties:** Product, Legal Operations, HR, owner.

## 4. Dependency and conflict gate

| Gate | Required before canonical closure |
|---|---|
| OD-02 / OD-07 | Membership and Tenant↔Organization cardinality selections are mutually coherent. |
| OD-03 / OD-04 | Employment cardinality states whether OD-04 stays deferred or is reopened; no unresolved lifecycle contradiction remains. |
| OD-06 | Selection preserves closed OD-05 and DBIND §5; no title-based implicit bypass is created. |
| OD-12 / OD-13 | Approval-level identity and delegation scope are coherent; ADR-009 remains the single engine authority. |
| OD-16 | Selection is consistent with OFF-INV-07, or a separately authorized amendment is identified. |
| OD-19 | Selection includes the OFF-INV-09 provenance, freshness, deny≠empty, and no-mock safeguards. |
| All nine | Named acceptance parties and owner disposition are recorded; decision-log closure is separate from implementation authority. |

## 5. Owner response form

```text
OFF/OD-02 : A | B | C
OFF/OD-03 : A | B | C
OFF/OD-04 : KEEP_DEFERRED | REOPEN_AND_SELECT_A | REOPEN_AND_SELECT_B | REOPEN_AND_SELECT_C
OFF/OD-06 : A | B | C
OFF/OD-07 : A | B | C
OFF/OD-12 : A | B | C
OFF/OD-13 : A | B | C
OFF/OD-16 : A | B | C
OFF/OD-19 : A | B | C

ACKNOWLEDGEMENTS
- These selections are owner semantic dispositions, not implementation authority.
- Any conflicting invariant needs separate canonical reconciliation.
- Schema, migration, database, runtime, production, and activation remain unauthorized.
- A later implementation requires distinct task-bound SA and EG records.
```

Until the owner supplies these dispositions and the authorized governance writer
records them, all nine decisions retain their current canonical status.
