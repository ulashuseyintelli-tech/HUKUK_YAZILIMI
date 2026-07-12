# ADR014-PE-04 Representative Dataset Matrix and Sampling Manifest Contract

**Status:** DEFINED / CANONICAL after approved merge

**Mode:** Docs/governance contract only

**Date:** 2026-07-12

**Owner:** Ulaş

**Related:** ADR-014, CCB-001, CAN-CUT-02, ADR014-PE-01/01A/02/03, MR-040

This contract defines how a future owner-authorized local evidence session may classify,
sample, reference and review a representative dataset. It does not select or materialize
a dataset, read or copy case data, activate an environment, authorize an evidence run,
accept evidence, open PR-11 or authorize runtime cutover.

The canonical local-only, read-only and no-egress boundaries in
`adr-014-local-evidence-session-environment-contract.md` remain mandatory. A dataset or
manifest never becomes calculation, legal-balance, runtime or
`Projection Ownership / Derived Read Contract` authority.

---

## 1. Authority and non-goals

This document is a selection and traceability contract. It does not:

- create a new scenario DSL, financial formula, discrepancy tolerance or legal policy;
- change ClaimItem, Due, Collection, ledger, allocation, reversal or interest semantics;
- grant production access, execution authorization, data export or source write access;
- create schema, migration, persistence, backfill or retention automation;
- approve a representative dataset merely because its source is production-origin;
- treat synthetic or golden evidence as representative evidence;
- activate a feature flag, pilot, consumer switch, PR-11 or runtime cutover.

Any materialization, data access, environment activation, execution authorization,
canonical conflict, runtime-authority implication or PR-11 implication is a hard stop for
PE-04 and requires a separately authorized task.

---

## 2. Canonical dataset classification

`Representative` is an evidence qualification. `Production-Origin Local` is a source
classification. The two terms are not synonyms: local real data becomes an approved
representative selection only after the future selection is traceable to this contract,
reviewed and explicitly approved by the owner.

| Class | Purpose | Allowed usage | Forbidden usage | Evidence value | Promotion rule | Authority level | Retention expectation |
|---|---|---|---|---|---|---|---|
| `Synthetic` | Exercise a deliberately constructed behavior without real records | Unit, contract, negative-path and disposable-environment verification | Representative, prevalence or production-readiness claims | Synthetic correctness evidence only | Never auto-promoted; replacement by real data is not a “promotion” | `NONE`; no legal/runtime authority | Versioned with the test/contract under repository policy; no real-data retention |
| `Golden Fixture` | Preserve the canonical Wave 0 scenario/expected contract and deterministic twin-run | Unit/DB regression, repeatability and canonical behavior verification | Claiming portfolio representativeness or operational readiness | Canonical regression evidence, but still non-representative | Never promoted to representative data | `VERIFICATION_ONLY`; production authority is unchanged | Versioned with the canonical fixture contract and supersession history |
| `Representative` | Support a future owner-approved assessment of real local portfolio behavior | Only an authorized local evidence session bound to one approved manifest | Unapproved execution, external transfer, source write, silent substitution or broader-purpose reuse | Representative evidence only after valid execution, validation and acceptance; the manifest alone is not evidence | Final dataset approval is `OWNER ONLY`; every changed selection requires a new version/review | `EVIDENCE_INPUT_ONLY`; no calculation, display or cutover authority | Manifest and evidence references follow PE-02 lifecycle; underlying source retention is unchanged |
| `Operational` | Describe environment/session health, latency, errors, blockers, audit and alerts | Operational verification and evidence-package correlation | Replacing financial/legal evidence or exposing raw PII/case payloads | Operational readiness evidence only | Cannot be promoted into a representative dataset | `OBSERVABILITY_ONLY` | PII-safe references follow PE-02 evidence lifecycle and applicable operational policy |
| `Production-Origin Local` | Identify owner-controlled local real case source facts eligible for future read-only consideration | Purpose-bound eligibility review and, after separate authorization, local read-only selection | Write-back, copying in PE-04, remote/cloud access, external egress, automatic representative status | Candidate source value only until a selection is approved and run | May qualify as `Representative` only through an approved versioned manifest; source provenance remains visible | `SOURCE_FACT_ONLY`; no derived or runtime authority | Source remains under its existing system lifecycle; PE-04 creates no copy or new retention rule |

No class changes the canonical `SHADOW_ONLY` state. Promotion between evidence classes
does not promote display, calculation or financial authority.

---

## 3. Sampling methodology

### 3.1 Selection universe

A future manifest must reference one authorized, purpose-bound local selection universe.
The universe is bounded by tenant/client visibility, the approved evidence purpose, the
PE-03 environment and the source snapshot/session boundary. PE-04 performs no profiling
or enumeration of that universe.

The sampling method has two explicitly separate layers:

1. **Distributional base:** preserves the observed portfolio composition across
   applicable axes. Strata and their relative representation are derived during a future
   authorized source-profile step; this contract invents no counts, percentages, bands or
   minimums.
2. **Edge-case supplement:** deliberately includes legally or technically material rare
   cases. It is labelled separately and is never used to claim portfolio prevalence.

The two layers may be evaluated together for behavior coverage, but their counts and
selection reasons may not be silently combined into a distribution claim.

### 3.2 Required sampling axes

| Axis | Representation principle | Selection method | Insufficiency handling |
|---|---|---|---|
| Case type diversity | Applicable case types in the authorized universe remain visible | Distributional strata by canonical case classification | Missing/unknown classification is disclosed; no inferred type |
| Currency diversity | Every applicable currency remains isolated and currency mismatch paths remain visible | Per-currency strata plus explicit mismatch edge cases when present | No cross-currency conversion, aggregation or synthetic replacement |
| Debt size distribution | The observed distribution is represented without invented monetary bands | Source-derived distributional strata defined in the future reviewed selection plan | Undocumented clustering or narrow-band selection is a bias finding |
| Lifecycle coverage | Relevant current lifecycle states and transition boundaries are represented | Strata by canonical lifecycle facts, not display labels alone | Unsupported or untraceable lifecycle state blocks that record's inclusion |
| Partial payment | Principal-reaching, interest-only and other applicable payment effects remain distinguishable | Purposeful scenario coverage within the distributional base or edge supplement | No assumption that a payment reduces principal |
| Reversal | Valid linked reversal and malformed/unlinked fail-closed behavior are distinguishable | Include applicable source-present reversal classes; rare cases may be supplemental | No fabricated link, repair or write-back |
| Interest scenarios | No-interest, fixed/variable where canonical, PRE/POST and boundary-day behavior remain visible | Stratify by canonical interest evidence and enforcement boundary | No new rate source, formula or legal mapping |
| Fee/cost scenarios | `AVAILABLE`, `NOT_CALCULATED`, `UNAVAILABLE` and `NOT_COMPARABLE` remain typed | Stratify by existing typed projection/evidence status | Missing semantics are not zero and not tolerated |
| Multi-debtor scenarios | Single- and multi-debtor case shapes are distinguished where present | Strata by canonical relationship facts under tenant/client boundary | No cross-tenant or cross-client aggregation |
| Edge cases | Canonical blockers, `NO_BUCKETS`, ordering/dust, mismatch and other material boundaries stay observable | Deliberate, separately labelled edge-case supplement | Absence is recorded; synthetic fixtures cannot substitute for representative evidence |

Additional axes may be recorded only when they use an existing canonical field or status,
serve the approved evidence purpose and introduce no new domain policy.

### 3.3 Repeatability and selection stability

The future selection method must be deterministic for the same pinned selection universe,
method version and seed/reference, or must document why deterministic replay is impossible.
Ordering uses canonical stable references; business-visible identifiers or personal data
must not be copied into the manifest. A changed universe, method, eligibility rule or
selected set requires a new dataset version and explicit supersession.

---

## 4. Coverage matrix

`Required` means required when applicable to the authorized selection universe and the
ADR-014 evidence purpose. A claimed source absence must be reviewed and referenced; it
cannot be replaced silently or treated as passing coverage.

| Coverage | Required | Optional | Out of scope |
|---|---|---|---|
| Business | Applicable case types; lifecycle states; single/multi-debtor shapes; payment, partial-payment and reversal presence; explicit edge-case supplement | Additional source-present business segments that do not create a new domain | New workflow/domain behavior, policy redesign, historical repair |
| Financial | Per-currency isolation; debt-size distribution; principal/interest/payment/cost evidence; cent-exact comparison eligibility; typed fee projection; mismatch and `NO_BUCKETS` blockers | Source-present rare amount/order patterns as a separately labelled supplement | FX conversion, new fee formula, tolerance, allocation or financial authority |
| Legal | Due/as-of and enforcement-boundary relevance; PRE/POST interest; canonical interest provenance; reversal validity; fail-closed legal blockers | Source-present rare legal classifications already canonical and reviewed | New legal formula, rate source, UYAP mapping policy or legal classification |
| Technical | Canonical SHA, environment/session/manifest identity; tenant isolation; deterministic selection/reference; blocker/readiness/trace/snapshot observability | Extra diagnostic references that are PII-safe and contract-compatible | Runtime mutation, schema/migration, official snapshot persistence, consumer switch |
| Operational | Local-only/read-only/no-egress boundary; capacity/clock attestation references; metric/log/audit/alert targets; incident and closure correlation | Additional owner-approved operational diagnostics within the same boundary | Environment activation, evidence run, production pilot, kill-switch activation, runtime cutover |

Required coverage is not satisfied merely by a non-empty dataset. Each applicable row must
be supported by a reviewable coverage reference and its distributional or supplemental
role must be clear.

---

## 5. Inclusion rules

A future record reference is eligible for inclusion only when all applicable conditions
hold:

- it belongs to the authorized local, purpose-bound and tenant/client-visible universe;
- its source and selection provenance are traceable without copying raw data into the
  manifest;
- it contributes documented distributional diversity, mandatory canonical coverage,
  legal relevance, operational relevance or a separately labelled edge case;
- it can be processed under the PE-03 read-only/no-egress/session boundary;
- its inclusion reason and sampling layer are recorded;
- duplicate and related-case effects are identified before distribution claims are made;
- required privacy, legal, financial and technical review references are present before
  final approval.

A source record with a canonical missing/malformed value may be included as an explicit
fail-closed edge case when its source provenance is complete. “Incomplete evidence” in the
exclusion rule means incomplete selection/provenance/authorization evidence, not a valid
domain blocker that the evidence run is intended to observe.

---

## 6. Exclusion rules

The future selection must exclude or quarantine from representative claims:

- duplicate-heavy subsets that would distort distribution unless deduplicated or separately
  labelled;
- convenience, recency, availability or operator-selected subsets that introduce
  undisclosed selection bias;
- records with incomplete selection provenance, missing authorization or untraceable source
  linkage;
- unauthorized sources, externally obtained data or any source outside the owner-controlled
  local boundary;
- records requiring write-back, repair, backfill, conversion or mutation to become usable;
- cross-tenant/client combinations or records outside the approved purpose;
- records whose inclusion would expose raw PII, secrets or case payloads in the manifest or
  evidence package;
- any silent replacement, enrichment or inferred legal/financial fact.

Exclusion reasons are summarized by reference. Exclusion is not a data-deletion instruction
and does not modify the original source.

---

## 7. Bias and representativeness assessment

No statistical threshold is defined here. Reviewers assess each bias class using the
selection-universe profile reference, coverage summary, exclusion summary and the separate
distributional/supplemental views.

| Bias class | Evaluation method | Required disclosure |
|---|---|---|
| Selection bias | Compare selection method and inclusion/exclusion reasons with the authorized universe; review convenience and operator choice | Unrepresented eligible segments and method limitations |
| Coverage bias | Map selected references to every applicable required coverage row and sampling axis | Missing, unknown and supplemental-only coverage |
| Currency bias | Compare per-currency presence and selection role without conversion or aggregation | Absent, over-represented and mismatch-only currencies |
| Lifecycle bias | Compare lifecycle distribution and transition-boundary coverage with source-present states | Missing states and stale/unknown lifecycle classification |
| Operational bias | Review whether only healthy/fast/successful records or time windows were selected | Excluded failures, unavailable periods and environmental limitations |
| Legal bias | Review legal category, enforcement boundary, interest provenance, reversal and blocker coverage | Unverified mapping, absent legal class and reviewer limitation |

Any unexplained material bias prevents `VALID`. An owner cannot convert an unknown required
coverage or unreviewed legal/financial gap into a silent pass; the remedy is a new/revised
selection or an explicit owner-gated governance decision outside PE-04.

---

## 8. Versioned sampling manifest contract

The manifest contains references and summaries only. It must not contain names, national
identifiers, addresses, phone/e-mail data, free text, raw case payloads, source credentials,
business-visible record IDs or financial line-item data.

Minimum contract:

```text
manifest_id
dataset_version
manifest_status
canonical_sha
environment_id
session_id
selection_date
selection_reason
source_classification
selection_universe_reference
selection_method_reference
selection_set_reference
coverage_summary
edge_case_summary
currency_summary
exclusion_summary
bias_assessment_reference
record_count_reference
owner_reference
review_reference
supersedes_manifest_id
created_at
approved_at
```

Field rules:

- `manifest_id` and `dataset_version` identify an immutable reviewed selection version.
- `canonical_sha`, `environment_id` and `session_id` bind it to one calculation revision and
  one PE-03 session context. A draft may use a reserved/unassigned session reference, but
  approval requires the exact session binding.
- `selection_universe_reference`, `selection_method_reference` and
  `selection_set_reference` point to owner-controlled local artefacts; their contents are
  not embedded in the manifest. Creating those artefacts is future execution, not PE-04.
- summaries contain classifications and opaque references only, never raw source facts.
- `record_count_reference` points to a reviewed count summary; it is not a list of records.
- `owner_reference` records the final owner disposition; `review_reference` links required
  technical/legal/financial/privacy reviews.
- `supersedes_manifest_id` is mandatory when replacing a prior version. In-place mutation
  after approval is forbidden.
- `approved_at` remains empty while the manifest is not owner-approved.

Manifest existence does not prove representativeness, financial correctness, evidence
acceptance or cutover readiness.

---

## 9. Traceability contract

Every future selection and evidence package must preserve this unbroken chain:

```text
Canonical SHA
→ PE-03 environment_id
→ PE-03 session_id
→ PE-04 manifest_id + dataset_version
→ local selection-set reference
→ evidence-package reference
→ validation/review references
→ owner sign-off reference
```

Rules:

- one evidence session uses exactly one approved manifest version;
- no manifest, SHA, environment, session or selection reference may be silently rebound;
- any selection change creates a new version and supersession link;
- post-run selection drift invalidates the affected evidence package;
- the evidence package records only PII-safe/opaque correlation references under PE-02;
- validation and owner sign-off are distinct: technical validation cannot self-approve the
  dataset or PR-11.

---

## 10. Dataset validity model

| State | Criteria | Evidence consequence |
|---|---|---|
| `VALID` | Exact SHA/environment/session binding; applicable required coverage documented; exclusions and all bias classes reviewed; required role references complete; immutable version; explicit owner approval | Eligible as input to a separately authorized evidence session; not evidence or PR-11 approval by itself |
| `VALID_WITH_WARNING` | Only a disclosed, non-material optional coverage or operational limitation remains; all mandatory authority/provenance/privacy gates pass; owner explicitly accepts the warning | May not waive a required scenario, non-zero financial discrepancy, unknown/non-comparable mandatory evidence or another cutover gate |
| `INCOMPLETE` | A required reference, applicable coverage assessment, bias review, session binding or role review is missing | Not eligible for representative execution or PR-11 evidence |
| `REJECTED` | Source/method/purpose is unauthorized, materially biased, legally/financially unsuitable or owner rejects it | Cannot be used; revision requires a new version |
| `INVALIDATED` | Approved content changed, selection drifted, traceability broke, source/session boundary was violated, or unauthorized access/mutation/egress occurred | Existing evidence cannot be repaired in place or promoted; new authorized selection/session required |

A category genuinely not applicable to the authorized source population may be marked
`NOT_APPLICABLE` only with a source-profile reference and reviewer/owner acceptance. A
category that is applicable but absent remains a coverage gap; it is not silently waived.

---

## 11. Ownership matrix

`Review/withhold` means the role may withhold its required sign-off and prevent approval;
only the owner applies the final `APPROVED` or `REJECTED` disposition.

| Role | Propose | Review | Approve | Reject / block | Execute selection | Modify source |
|---|---|---|---|---|---|---|
| Owner | Yes | Yes | **Yes — final, owner only** | **Yes — final** | Only under separate authorization | No |
| Operator | Prepare proposal | No self-review | No | Raise issue only | Only under separate authorization | No |
| Reviewer | No | Technical/method review | No | Withhold/recommend reject | No | No |
| Legal | May propose legal coverage | Legal relevance/provenance | No | Withhold legal sign-off | No | No |
| Financial | May propose financial coverage | Financial/currency/zero-cent scope | No | Withhold financial sign-off | No | No |
| Privacy | May propose minimization control | Purpose/access/PII boundary | No | Veto unauthorized/privacy-unsafe selection | No | No |
| Observer | No | Observe approved metadata only | No | No | No | No |

Owner approval is necessary but does not replace any mandatory legal, financial, privacy or
technical review, execution authorization, evidence acceptance or PR-11 decision.

---

## 12. Capability and gap classification

| Item | Current classification after approved merge | Consequence |
|---|---|---|
| Dataset classification and coverage rules | `DEFINED / CANONICAL` | Contract only |
| Sampling methodology and bias review | `DEFINED / CANONICAL` | No sampling executed |
| Versioned manifest schema | `DEFINED / CANONICAL` | No manifest instance or selection set created |
| Authorized local source profile | `ABSENT / FUTURE AUTHORIZATION REQUIRED` | No strata/counts can be claimed |
| Representative dataset selection/materialization | `ABSENT / NOT AUTHORIZED` | No representative evidence input exists |
| Environment/session activation | `ABSENT / NOT AUTHORIZED` | PE-03 remains contract-only |
| PR #1159 runner | `OPEN / HOLD FOR OWNER REVIEW / NON-CANONICAL` | Not consumed, rebased or treated as capability |
| Metrics/log/audit/dashboard/alert operational contract | `MISSING / DOCS-ONLY PREREQUISITE` | Single next eligible PE-05 task |
| Measured local baseline | `ABSENT / BLOCKING` | PR-11 remains closed |
| Representative evidence | `ABSENT / BLOCKING` | Synthetic/golden evidence cannot substitute |
| PR-11 and runtime cutover | `NOT AUTHORIZED` | Separate owner decision required after all gates |

No new backlog ID is created. `MR-040` remains `OPEN / NON-BLOCKING` and is not cleaned or
modified by PE-04.

---

## 13. Master Register and readiness result

```text
ADR014-PE-01   CLOSED / CANONICAL
ADR014-PE-01A  CLOSED / CANONICAL
ADR014-PE-02   CLOSED / CANONICAL
ADR014-PE-03   CLOSED / CANONICAL
ADR014-PE-04   CLOSED / CANONICAL after approved merge (contract only)
CCB-001        ACTIVE / POST-PR-10 master stream
CAN-CUT-02     OPEN / needs-owner-decision
MR-040         OPEN / NON-BLOCKING / untouched
```

```text
Primary verdict:          DATASET_CONTRACT_READY
Dataset selected:         NO
Manifest instance:        ABSENT
Environment activation:  NOT AUTHORIZED
Representative evidence: ABSENT / BLOCKING
PR-11:                    NOT AUTHORIZED
Runtime cutover:          NOT AUTHORIZED
```

The single next eligible task is **ADR014-PE-05 — ADR-014 Metrics, Audit, Dashboard and
Alert Operational Contract**. It may define the PII-safe operational monitoring contract
only. It does not authorize data access, selection, evidence execution, environment
activation, pilot, PR-11 or runtime cutover.
