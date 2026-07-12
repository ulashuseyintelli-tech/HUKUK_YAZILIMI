# ADR014-PE-02 Evidence / Data-Access Procedure

**Status:** DEFINED / CANONICAL
**Date:** 2026-07-12
**Program:** ADR-014 / CCB-001 / CAN-CUT-02 pre-evidence preparation
**Related:** `adr-014-cutover-authorization-policy.md`,
`adr-014-zero-cent-discrepancy-monitoring-contract.md`,
`adr-014-split-pr-plan.md`

> **Authority boundary.** This document defines a procedure. It grants no standing data
> access, no evidence-run authorization, no production access, no monitoring/runtime
> implementation authority, no PR-11 authority and no runtime-cutover authority. Every
> actual evidence run still needs the approvals and environment verification below.

---

## 1. Purpose and canonical boundary

This procedure governs how a future ADR-014 representative-evidence run is requested,
approved, executed, validated and retained. It implements the existing constitutional
and domain rules without creating a new financial, legal or calculation authority.

Binding sources are:

- `SYS-AUTH-007/008/011/012`: trusted tenant context, client-visibility and purpose
  boundaries, canonical-write prohibition and PII minimization;
- `SYS-EVID-003/004/005/006`: audit/evidence separation, provenance, integrity, access,
  retention and append-only supersession;
- `SYS-MIG-007/008`: cutover evidence and the synthetic-versus-empirical boundary;
- `SYS-CAN-005/006/007`: closure evidence, Master Register and open-gate preservation;
- `REC-CUTOVER-101..104`: repository, technical, legal/mapping and operational evidence;
- ADR-014 Cutover Authorization Policy §10: `LOCAL REAL DATA / OWNER-CONTROLLED
  ENVIRONMENT`, no external egress and read-only execution;
- ADR014-PE-01/PE-01A: exact zero-cent readiness and PII-safe monitoring contract.

`Projection Ownership / Derived Read Contract` remains the canonical term. Evidence,
monitoring, a dashboard, a trace or a non-official snapshot never becomes legal-balance
authority. Collection facts, allocation authority and canonical calculation semantics
remain with their existing owners.

---

## 2. Evidence lifecycle

### 2.1 Lifecycle states

| State | Entry condition | Required action | Exit rule |
|---|---|---|---|
| `REQUESTED` | Owner request identifies purpose and intended evidence class | Scope, data purpose, roles and prohibited actions recorded | No access or execution follows implicitly |
| `ACCESS_APPROVED` | Owner approves a named, time-bounded access request | Environment and identity controls verified | Approval is access-only, not execution authorization |
| `EXECUTION_AUTHORIZED` | Environment and dataset verification pass; owner approves the specific run | Immutable run identifier and source versions assigned | Authorization applies only to the recorded run/window |
| `CAPTURED` | Read-only run finishes | Raw working results remain local and access-controlled; PII-safe package material is prepared | Capture is not acceptance |
| `VALIDATED` | Completeness, provenance, zero-cent, tenant and repeatability checks pass | Validator records findings and unresolved gaps | Any missing/non-comparable or non-zero financial result fails closed |
| `REVIEWED` | Technical, operations, privacy, legal and financial reviews applicable to the package are recorded | Reviewer decisions and dissent are preserved | Review is not owner approval |
| `APPROVED` | Required sign-offs are complete and owner explicitly accepts the package | Package becomes eligible input to the separate PR-11 gate | Approval does not itself authorize PR-11 or cutover |
| `REJECTED` | A validation/sign-off gate fails | Reason, severity and required remediation are recorded | Re-run requires a new run ID and authorization |
| `ARCHIVED` | Approved or rejected package is closed | Access, retention owner and storage reference are recorded | Archive remains non-authoritative for balance calculation |
| `SUPERSEDED` | A newer approved/rejected package replaces interpretation or scope | Old package remains discoverable and points to successor | No silent overwrite or deletion |
| `RETIRED` | Retention owner authorizes retirement under applicable policy | Disposition evidence is recorded | Binding legal/financial/audit evidence is never silently destroyed |

Exact retention duration and repository are not invented here. They must be fixed for
the particular evidence run by the retention owner and accepted by the owner before
execution. The old fixed raw-export/sanitized-copy retention rules were superseded by
Cutover Authorization Policy §10.

### 2.2 Evidence classes and value

| Evidence type | Purpose | Evidence value | Authority boundary |
|---|---|---|---|
| Synthetic | Isolated behavior and error-path verification | Technical correctness only | Never representative or production evidence |
| Golden | Deterministic Wave 0 expected-contract parity | Strong repeatable regression evidence | Never empirical prevalence or runtime authority |
| Representative | Real local case-data coverage in an approved local evidence session | Empirical pre-PR-11 input after validation/sign-off | Does not itself authorize PR-11 |
| Operational | Execution-control, availability and process observations | Operational readiness input | Operational logs are not LegalEvidence |
| Monitoring | Bounded metrics, alerts and dashboard references | Observability/readiness input | Metrics are not immutable audit records |
| Performance | Baseline and measured p50/p95/p99, error/timeout evidence | Baseline-relative acceptance input | No threshold may be inferred without canonical policy |
| Security | Tenant/client-visibility, access and no-egress verification | Security sign-off input | Does not grant data or runtime access |
| Legal | Legal-source/mapping and legal-sign-off references | Legal acceptance input with provenance | Does not create or replace a legal formula |
| Financial | Exact-cent reconciliation and financial sign-off | Financial acceptance input | Non-zero or non-comparable fails closed |

---

## 3. Data-access and approval procedure

### 3.1 Mandatory sequence

| Step | Required record | Hard gate |
|---|---|---|
| 1. Owner request | Purpose, scope, evidence class, requested window and roles | A general workstream GO is not a data-access request |
| 2. Environment selection | Owner-controlled local machine/office identity; no credentials in the record | Remote/cloud/third-party/external-AI environment is forbidden |
| 3. Access approval | Named person, least privilege, tenant/client purpose, start/end and revocation | No standing or inherited access |
| 4. Environment verification | No external egress, backup/recovery, read-only capability, repository SHA and clean execution surface | Failure blocks the run |
| 5. Dataset verification | Local source, portfolio method, edge-case coverage, tenant/client scope and opaque reference method | No data copy/export; no invented case or tenant minimum |
| 6. Execution authorization | Owner approves run ID, window, code/policy versions and stop conditions | Access approval alone is insufficient |
| 7. Evidence capture | Read-only, deterministic execution; numeric results plus opaque case references | No source mutation, consumer switch, flag or pilot |
| 8. Evidence validation | Package completeness, exact-cent, blocker, tenant, repeatability and provenance checks | Unknown/non-comparable/non-zero financial results block |
| 9. Package generation | Manifest and references under §6 | Ordinary logs cannot substitute for the package |
| 10. Review and sign-off | Applicable technical/operations/privacy/legal/financial reviews and owner decision | Missing required sign-off leaves package unapproved |
| 11. Retention/supersession | Storage reference, access list, retention owner, period and successor link | No silent update/destruction |

### 3.2 Separation of approvals

```text
OWNER REQUEST
  → ACCESS APPROVAL
  → ENVIRONMENT + DATASET VERIFICATION
  → EXECUTION AUTHORIZATION
  → CAPTURE + VALIDATION
  → DOMAIN SIGN-OFFS
  → OWNER EVIDENCE ACCEPTANCE
  → separate PR-11 owner gate (still required)
```

None of these arrows is automatic. Access approval permits neither execution nor export;
evidence acceptance permits neither PR-11 implementation nor runtime cutover.

### 3.3 Stop conditions

The run must stop and remain fail-closed on any external transfer, unauthorized access,
tenant/client-visibility breach, write attempt, missing provenance, non-zero financial
discrepancy, unknown/not-comparable required evidence, authority promotion, unavailable
stop control or canonical-source conflict. The incident is recorded without raw PII.

---

## 4. Environment classification

| Environment | Allowed | Forbidden | Required approval | Produced evidence | Authority level |
|---|---|---|---|---|---|
| Local development | Docs, source inspection and synthetic tests | Real data unless the session is separately reclassified and authorized as representative evidence | Normal repository task authority | Development/technical | None |
| Synthetic | Generated, non-real inputs and isolated tests | Claims of representative prevalence or production parity | Task authorization | Synthetic | Technical only |
| Golden fixture | Existing Wave 0 contract and deterministic unit/DB twin-run | Second fixture DSL/model; empirical claims | Task authorization | Golden/regression | Technical only |
| Representative staging | **Only a logical label** for an authorized, isolated, read-only evidence session on the owner-controlled local machine | Separate remote/cloud staging, sanitized copy, external access or data transfer | Explicit access + execution approvals | Representative, performance, security and financial package inputs | Evidence input only |
| Production shadow | Future separately authorized live shadow observation | Activation, cohort/allowlist/flag changes or pilot under PE-02 | Separate runtime owner gate | Operational/monitoring/live evidence | No calculation authority; not authorized now |
| Production | Normal operational source remains outside PE-02 | Direct PE-02 execution, mutation, consumer switch or cutover | Separate production/runtime authority | Live operational evidence only after authorization | Existing authority only; PE-02 adds none |

The phrase **Representative Staging Environment** in the PE-03 task label does not
restore the superseded remote/pseudonymized-staging model. Under current policy it means
a contract for the local owner-controlled evidence session. Any remote/cloud meaning is
`NOT AUTHORIZED` and would require explicit governance reconciliation.

---

## 5. Dataset classification

| Dataset | Purpose | Allowed usage | Forbidden usage | Evidence value | Promotion rule |
|---|---|---|---|---|---|
| Synthetic | Unit/integration behavior | Generated scenarios | Representativeness claims | Technical | Never promoted to representative |
| Golden | Canonical expected-contract regression | Existing Wave 0 matrix | New parallel expected model | Deterministic correctness | Remains golden; no empirical promotion |
| Representative | Mandatory edge cases plus statistically representative local portfolio selection | Approved local read-only evidence run | Copy/export, external transfer, mutation or identity in outputs | Empirical pre-cutover | Accepted only after package validation/sign-offs; still no runtime authority |
| Operational | Process/availability observations from an authorized environment | Operational readiness under recorded purpose | Reuse as legal/financial fact without provenance | Operational | Remains operational |
| Production | Live source data under existing access controls | Only separately authorized operational use | PE-02 access, extraction or mutation | Potential live evidence after separate gate | Never promoted by this procedure |

Representative selection must use the canonical mandatory edge-case set and a portfolio-
derived statistical method. Case/tenant counts are measured and justified from the local
portfolio; they are not invented in this document. Outputs use numeric aggregates and
approved opaque references, not debtor/client identities.

---

## 6. Evidence package standard

Every package has a unique run/version manifest and contains:

| Section | Minimum content |
|---|---|
| Identity | Run ID, package version, status, predecessor/successor reference |
| Repository | Canonical SHA, branch/working-tree state, engine/source version |
| Policy | ADR-014, split-plan, cutover policy and PE-01/PE-01A contract versions |
| Environment | Local environment identity without credentials; verification checklist |
| Dataset | Manifest/version, selection method, edge-case and tenant/request coverage counts |
| Window | Authorized start/end, actual execution start/end and executor role |
| Baseline | Measurement method and baseline window/source; no fabricated baseline |
| Metrics | Request, error/timeout, p50/p95/p99, exact/non-zero/non-comparable, blockers and coverage |
| Alerts | Expected/delivered alert references and delivery gaps; no claim of implementation if absent |
| Discrepancies | Typed taxonomy, field, classification, severity, zero/non-zero and disposition |
| Validation | Exact-cent, repeatability, tenant isolation, provenance and package-completeness results |
| Sign-offs | Technical, operations, privacy, legal, financial and owner decisions as applicable |
| References | PII-safe log/dashboard/audit references and approved integrity manifest/hash where authorized |
| Retention | Storage reference, access list, retention owner/period and supersession/retirement rule |

The package must not contain credentials, raw names, TCKN/VKN, addresses, contact data,
free text, or unrestricted raw case/tenant identifiers. Exact amounts, when necessary for
review, remain in the separately access-controlled local package and never ordinary logs.
An integrity manifest is package provenance metadata; it is not an official balance
snapshot, official snapshot authority or persistence lifecycle.

---

## 7. Access roles

Roles describe responsibilities, not standing access. One person may hold more than one
role only when explicitly recorded; segregation concerns and conflicts remain visible.

| Role | Allowed | Forbidden | Approval authority |
|---|---|---|---|
| Owner | Approve purpose, access, run, evidence acceptance and later separate gates | Silent override of constitutions or implicit cutover | Final procedural approval within existing authority |
| Developer | Prepare/run separately authorized read-only tooling; produce technical evidence | Self-approve access, evidence or runtime activation | None by role |
| Reviewer | Validate manifest, reproducibility and discrepancies | Alter source results or approve own unreviewed run | Technical review only when assigned |
| Operations | Verify environment, backup/recovery, controls and incident handling | Grant financial/legal authority or activate runtime without gate | Operational sign-off when assigned |
| Legal | Review legal-source/mapping scope and legal implications | Create formula through evidence review | Legal sign-off for recorded scope |
| Financial | Review exact-cent reconciliation and financial completeness | Tolerate non-zero/non-comparable required financial evidence | Financial sign-off for recorded scope |
| Privacy | Verify purpose limitation, least privilege, no-egress and PII-safe outputs | Grant runtime/financial authority | Privacy/security sign-off or veto within scope |
| Observer | View explicitly approved package portions | Raw-data access, execution, approval or export | None |

---

## 8. Monitoring and operational ownership

| Surface | Required owner responsibility | Current status | Gate |
|---|---|---|---|
| Metric ownership | Definition, bounded labels, collection health and version | PE-01A bounded metrics implemented; representative baseline absent | Implementation/operational verification |
| Alert ownership | Routing, acknowledgement, escalation and delivery test | Contract defined; routing/implementation absent | Implementation prerequisite before evidence acceptance where required |
| Dashboard ownership | Panels, data-source integrity, access and captured references | Contract defined; operational dashboard absent | Implementation prerequisite |
| Evidence ownership | Manifest completeness, access, version, sign-off and supersession | Procedure defined here; run owner unassigned | Owner assignment per run |
| Incident ownership | Stop decision, security/financial escalation and incident record | Role required; named owner unassigned | Owner/operational prerequisite |
| Retention ownership | Storage, access review, period, supersession and retirement | Rule defined; location/period unassigned | Owner decision per run |

An owner assignment does not authorize implementing the surface. Missing implementations
remain gaps and require separate scoped authorization.

---

## 9. Current gap classification

| Gap | Status | Class | Required evidence/decision | Eligible next action |
|---|---|---|---|---|
| Canonical lifecycle, access and package procedure | `CLOSED BY PE-02` after approved merge | Governance prerequisite | This document + append-only decision/register links | None |
| Local representative-session environment contract | `OPEN / BLOCKING` | Environment prerequisite | No-egress, read-only, backup/recovery, identity, tenant/client scope and stop-control verification | PE-03 docs/verification contract |
| Representative dataset selection/profile | `OPEN / BLOCKING` | Environment/operational prerequisite | Portfolio-derived method + mandatory edge cases + opaque-reference proof | After PE-03; no data use under PE-02 |
| Specific access and execution approvals | `OWNER-GATED / BLOCKING` | Owner decision | Named/time-bounded access and separate run authorization | Decide only for a future evidence run |
| Measured local baseline | `ABSENT / BLOCKING` | Implementation/evidence prerequisite | Approved read-only runner + baseline package | Separate GO; not auto-created |
| Representative evidence package | `ABSENT / BLOCKING` | Evidence prerequisite | Validated local real-data package and sign-offs | After environment, access and tooling gates |
| Durable PII-safe log/audit correlation | `OPEN / DOCUMENTED` | Implementation prerequisite | Delivery/repeatability evidence and immutable action references | Separate narrow monitoring-prep task |
| Alert routing and delivery test | `OPEN / DOCUMENTED` | Implementation/operational prerequisite | Route, owner, test and failure evidence | Separate narrow monitoring-prep task |
| Operational dashboard | `OPEN / DOCUMENTED` | Implementation/operational prerequisite | Contract panels, access and captured reference | Separate narrow monitoring-prep task |
| Incident and retention owner assignments | `UNASSIGNED / BLOCKING FOR RUN` | Owner/operational prerequisite | Named roles, storage, access and retention decision | Set before execution authorization |
| PR-11 owner approval | `NOT AUTHORIZED / BLOCKING` | Owner decision | Measured baseline + accepted representative evidence + explicit owner `APPROVED` | Not eligible now |

No row automatically becomes an implementation task. No new backlog item is created.

---

## 10. Master Register and readiness result

PE-02 remains under existing `CCB-001`; `CAN-CUT-02` remains its open cutover milestone.
The chain is:

```text
ADR014-PE-01   CLOSED / CANONICAL (taxonomy and monitoring contract)
ADR014-PE-01A  CLOSED / CANONICAL (zero-cent readiness alignment)
ADR014-PE-02   CLOSED / CANONICAL after approved merge (procedure only)
CCB-001        ACTIVE / POST-PR-10 master stream
CAN-CUT-02     OPEN / needs-owner-decision
```

```text
Primary verdict:          PROCEDURE_READY
Representative evidence: ABSENT / BLOCKING
PR-11:                   NOT AUTHORIZED
Runtime cutover:          NOT AUTHORIZED
```

The single next eligible task is **ADR014-PE-03 — Representative Staging Environment
Contract**, interpreted strictly as the **local owner-controlled representative evidence
session contract** described in §4. It is a contract/verification task, not environment
creation, data access, data use, monitoring implementation, pilot or runtime activation.
