# ADR-014 Cutover Authorization Policy

**Status:** DEFINED / CANONICAL — governance decision record for split-plan §12 seq 11; owner operational decisions recorded 2026-07-12 (§9)
**Date:** 2026-07-12
**Owner:** Ulaş
**Relationship:** This document is the `Governance decision record` required by
`docs/design/adr-014-split-pr-plan.md` §12 sequence 11 (`UNASSIGNED` cutover
authorization) and by `docs/adr/ADR-014-CCB-001-CANONICAL-LEGAL-CALCULATION-CORE.md`.

> **Authority note.** This policy defines the acceptance framework under which a
> future cutover *could* be authorized. Writing this policy **does not** authorize
> PR-11, does not open any consumer switch, does not change any feature flag, does
> not alter runtime, and does not start any downstream cutover PR. PR-11 and runtime
> cutover remain **NOT AUTHORIZED**. Authorization becomes possible only after the
> blocking evidence class in §2 is satisfied and the owner-selected thresholds in §4
> are set, followed by an explicit, separate owner `APPROVED` decision.

---

## 0. Why this exists

All ADR-014 hardening rings (W0 → PR-10) are CLOSED / CANONICAL and every technical
CUTOVER BLOCKER (reversal netting, `NO_BUCKETS`, TBK100 order, partial-payment
interest base, currency/FX) is resolved. The canonical calculation core, non-official
trace/snapshot, golden fixture evidence and the additive shadow-only compatibility
adapter (PR-10) are all present. The remaining gate to a production consumer switch
is therefore **not calculation implementation** — it is (a) production/representative
evidence, (b) a defined cutover governance policy, and (c) a resolved workstream
boundary. This document supplies (b) and (c); it explicitly records that (a) remains
absent and blocking.

---

## 1. PR-11 scope boundary (binding)

```text
ADR-014 PR-11:
  Hesap Özeti (case calculation-summary) UI/API consumer switch only.
  Consumes the existing `canonicalCompatibility` / guarded-primary contract.
  Replaces the legacy calculation-summary consumer under a controlled switch.
  Ships with kill switch, monitoring and rollback.

CAN-CUT-01 / PR-A4 / PR-A5:
  Due/ClaimItem → UYAP exporter mapping.
  Numeric interest code / `FAIZT` decision.
  Deposit short/long mapping.
  `CONTRACTUAL` / `COMMERCIAL_FIXED` UYAP codes.
  UYAP document and template conversion.

The two workstreams are related but INDEPENDENTLY GATED.
PR-11 does NOT authorize UYAP cutover.
```

- The `report/template` surface inside PR-11 scope is restricted to **non-UYAP
  application presentations of the calculation summary**. Any UYAP document/template
  transform stays in the CAN-CUT-01 / PR-A4 / PR-A5 track and is **out of PR-11 scope**.
- Consequence: **exact UYAP interest-code mapping is NOT a direct prerequisite** for
  the narrow Hesap Özeti PR-11. However, a UYAP report/template switch **cannot be
  added to PR-11 later** — if UYAP presentation is ever cut over, it is a separate,
  separately-authorized CAN-CUT-01/PR-A4/PR-A5 deliverable.
- CAN-CUT-02 (Hesap Özeti / interest-engine cutover milestone) is the register
  milestone that this PR-11 boundary corresponds to; it remains `OPEN /
  needs-owner-decision` and is closed only via the CCB-001 / ADR-014 deliverable, not
  by this policy alone.

---

## 2. Evidence policy (binding)

Synthetic correctness evidence does not substitute for representative or live
operational evidence. Three evidence classes are separated:

| Evidence class | Content | Status |
|---|---|---|
| **Synthetic correctness** | PR-9 golden matrix; unit/DB twin-run; deterministic shadow comparison | **SATISFIED** |
| **Representative data** | Sanitized production copy; authorized read-replica shadow; a controlled pilot environment separately proven to represent real usage distribution | **ABSENT / BLOCKING** — environment method SELECTED IN PRINCIPLE (§9.1), not yet created |
| **Live operational** | Production smoke; discrepancy monitoring; rollback drill; bake period | **NOT STARTED / NOT CURRENTLY EXECUTABLE** |

- Synthetic correctness evidence proves **calculation correctness, determinism,
  unit/DB parity and blocker behaviour**. It does **not** prove real data
  distribution, production tenant behaviour, production scale/latency, real
  operational rollback, bake stability, or the real discrepancy rate.
- Because no production environment currently exists (recorded canonical fact), the
  PR-11 **production smoke** gate and the subsequent **bake** gates (PR-12 bake,
  PR-14) **are not waived** and are not currently executable.
- Acceptable evidence environments (any one, separately validated):
  1. Representative staging over a sanitized production copy.
  2. An authorized read-replica or read-only production shadow.
  3. A controlled pilot environment separately proven to represent real usage
     distribution.
- An ordinary synthetic fixture/staging environment alone is **not sufficient**.

---

## 3. PR-11 pilot policy (pre-conditions for any future PR-11)

The following must be true before PR-11 can be authorized to ship even as a pilot:

### Cohort
- Allowlisted tenant or case set only.
- Default exposure `0`.
- Global activation is forbidden.

### Double gate
- Server/environment flag, **and**
- Explicit pilot cohort selection or the existing URL pilot gate
  (`?guardedPrimary=1`), both required simultaneously.

### Kill switch
- Instant return to legacy primary.
- Disable must not require a deploy.
- Canonical shadow evidence remains available after disable.

### Fail-closed
Canonical primary is **not** shown when any of the following is present:
- blocker,
- unsafe readiness,
- unavailable / error,
- currency mismatch,
- parity conflict,
- missing critical evidence.

---

## 4. Monitoring and acceptance policy

Numeric thresholds are not invented here without evidence. The policy is two-layered.

### Hard-zero tolerance (accepted count = `0`)
- Authority promotion without authorization.
- Cross-currency aggregation.
- Zero-fill on an unavailable canonical value.
- Tenant/case data leakage.
- Canonical primary shown while a blocker is present.
- Kill-switch failure.
- Ledger / write-path mutation.

### Owner-selected operational thresholds — DEFINED WITH BASELINE-DEPENDENT VALIDATION (§9)
The owner has now recorded these thresholds in §9 (Owner decisions, 2026-07-12):
- parity discrepancy rate → **0-cent tolerance** (§9.5), stop-on-any-unexplained-discrepancy (§9.6);
- calculation latency regression → **p95 ≤ 20% / p99 ≤ 30%**, baseline-required (§9.7);
- error-rate / timeout-rate ceiling → **0 material increase**, baseline-required (§9.7);
- pilot cohort size → phased OWNER→internal→allowlist (§9.3), default exposure `0`;
- smoke duration → **3 business days / 500 requests / ≥2 tenants**, whichever later (§9.8);
- bake duration → **PR-11 14 days; PR-12 eligibility ≥30 days; PR-14 owner-set, ≥ PR-12 window** (§9.9).

These are **baseline-dependent**: cutover authorization still **cannot be `APPROVED`**
until (a) a representative/production latency+error baseline is measured, and (b)
representative evidence (§2) exists. Defining thresholds is not authorization.

---

## 5. Rollback policy

1. **Trigger conditions** — any hard-zero violation (§4), any owner-threshold breach
   once set, or an operator/owner stop decision.
2. **Kill-switch authority** — Operations (with owner notification); no deploy
   required to disable.
3. **Maximum rollback duration** — bounded; the exact bound is an owner-selected
   operational threshold (§4) and must be set before authorization.
4. **Legacy response preservation** — legacy calculation-summary remains the
   retained surface throughout rollback; legacy is not deleted before PR-14.
5. **No data rollback required** — the cutover introduces no canonical writes; there
   is nothing to unwind in persistence.
6. **Incident evidence retention** — discrepancy/incident evidence is captured and
   retained for post-mortem.
7. **Re-activation** — after a rollback, re-enabling requires a **new, explicit owner
   GO**; a prior authorization does not carry over.

---

## 6. Sign-off matrix

The following roles are recorded distinctly; all required before authorization is
`APPROVED`:

| Sign-off | Requirement |
|---|---|
| Technical | Adapter, flag, monitoring, rollback |
| Product / owner | Pilot cohort, thresholds, bake |
| Legal | Calculation semantics and displayed authority |
| Operations | Environment, smoke, kill-switch drill |
| Data / privacy | Sanitized or representative dataset method |

> Commit author/committer metadata is **not** a sign-off and is never treated as one.

---

## 7. Canonical status

```text
Cutover authorization policy       → DEFINED / CANONICAL
Cutover owner decisions (§9)       → DEFINED / CANONICAL
PR-11 scope boundary               → DECIDED / CANONICAL
Representative evidence environment → SELECTED IN PRINCIPLE / NOT YET AVAILABLE
Operational thresholds             → DEFINED WITH BASELINE-DEPENDENT VALIDATION
Pre-evidence allowed work          → DOCS / MONITORING PREPARATION ONLY
PR-11 implementation               → NOT AUTHORIZED
PR-11 pilot                        → NOT AUTHORIZED
Runtime cutover                    → NOT AUTHORIZED
```

Defining this governance policy — and recording the §9 owner decisions — does **not**
automatically open PR-11. "Decisions defined" is not "cutover approved".

---

## 8. What this policy does not do

- Does not authorize PR-11 or any downstream cutover ring (PR-11 stability, PR-12,
  PR-12 bake, PR-13, PR-14, post-cutover verification, final closure).
- Does not change any feature flag; `GUARDED_PRIMARY_DISPLAY_PILOT` stays default
  `false`.
- Does not change runtime, source, schema, migration, API or UI behaviour.
- Does not close CAN-CUT-01 or CAN-CUT-02.
- Does not create representative or live evidence; that remains ABSENT / BLOCKING.

---

## 9. Owner decisions (recorded 2026-07-12)

The following fifteen owner decisions fill the previously-unset fields of this policy.
They are binding governance decisions. **Recording them does not authorize PR-11, a
pilot, a flag change, or runtime cutover.** PR-11 remains NOT AUTHORIZED.

### 9.1 Representative evidence environment
- Primary method: `SANITIZED_PRODUCTION_COPY_ON_REPRESENTATIVE_STAGING`.
- Secondary verification method, only where legally and technically possible:
  `READ_ONLY_PRODUCTION_SHADOW`.
- An ordinary synthetic fixture/staging environment alone is **not** representative evidence.
- Read-only production shadow constraints: cannot write; cannot show canonical primary
  to a user; requires separate access + KVKK authorization; usable for observation/parity only.

### 9.2 Dataset strategy
`MANDATORY_EDGE_CASE_SET` + `STATISTICALLY_REPRESENTATIVE_SAMPLE`.

Mandatory edge-case coverage (minimum): TRY single currency; USD or EUR foreign
currency; multiple currencies in one case; pre-enforcement interest; post-enforcement
interest; partial payment; payment not reaching principal; payment reaching principal;
valid reversal; malformed reversal; `NO_BUCKETS`; currency mismatch;
fee/cost/attorney-fee projection; trace / non-official snapshot; large ClaimItem/payment
volume; old or low-quality legacy data; multiple tenants.

```text
Minimum case count:   TO BE DERIVED FROM REPRESENTATIVE PORTFOLIO DISTRIBUTION
Minimum tenant count: AT LEAST 2 FOR SMOKE; FULL DATASET TARGET TO BE SET FROM PORTFOLIO PROFILE
```
No arbitrary numbers are invented; case/tenant minimums are validated against the real
portfolio distribution once the representative dataset is produced.

### 9.3 Pilot cohort
Phased: `Phase 1 → OWNER ONLY`; `Phase 2 → SELECTED INTERNAL USERS`;
`Phase 3 → ALLOWLISTED TENANT / CASE SET`. No percentage/global rollout at start.
Authorized internal users: owner; owner-explicitly-allowlisted founding lawyer/partner;
owner-explicitly-allowlisted technical-operations user. **Holding a role alone does not
grant pilot access — an explicit allowlist entry is required.**

### 9.4 Pilot activation gate
Mandatory triple gate: `SERVER / ENVIRONMENT FLAG` + `BACKEND USER/TENANT/CASE ALLOWLIST`
+ `EXPLICIT PILOT ACTIVATION GATE`. The URL parameter `?guardedPrimary=1` alone is not
sufficient and only has meaning when the backend allowlist and server flag are active.
Default exposure `0`; global activation is forbidden.

### 9.5 Financial discrepancy policy
Initial policy: **`0 CENT TOLERANCE`**. Tolerance is strictly `0` for: principal;
allocation; payment application; total balance; outstanding; paid; interest base;
currency grouping; reversal result; authority/status/blocker semantics.
`Allowed 1-cent fields: NONE`. A presentation-only 1-cent exception may only be defined
later by a separate owner decision.

### 9.6 Pilot stop threshold
`Any unexplained financial discrepancy → STOP`. A single event stops the pilot for:
principal difference; total balance difference; cross-currency aggregation; canonical
primary while a blocker is present; zero-fill of an unavailable value; tenant/case
isolation breach; authority promotion; ledger/write mutation; kill-switch failure.
Presentation-only: `0 unexplained discrepancies`; pre-classified owner-accepted
presentation differences are tracked as a separate metric, never auto-accepted.

### 9.7 Performance policy
`Latency baseline required: YES`. Initial ceilings: `p95 regression ≤ 20%`;
`p99 regression ≤ 30%`; `material error-rate increase = 0`;
`material timeout-rate increase = 0`. But: PR-11 authorization cannot be granted before
the baseline is measured; percentages may be tightened by the owner after baseline;
"material" is uninterpretable without the current error/timeout rate; any new
canonical-sourced timeout/error increase is classified separately.

### 9.8 Smoke policy
Minimum for controlled pilot smoke: `Duration: 3 business days`;
`Request count: 500 successful/observed calculation-summary requests`;
`Tenant count: at least 2`. Additional: the full mandatory edge-case set must have run;
kill-switch drill completed; discrepancy dashboard/report available; whichever of
duration or request count finishes later governs. Not satisfiable without a
representative evidence environment.

### 9.9 Bake policy
```text
PR-11 pilot bake:                14 consecutive days after successful smoke
PR-12 fallback-disable eligibility: ≥ 30 consecutive days after PR-11 stability acceptance
PR-14 legacy-quarantine eligibility: OWNER TO SET AFTER PR-12 BAKE AND ARCHIVE/ROLLBACK REVIEW
```
`PR-14 cannot be shorter than the accepted PR-12 stability window and requires a separate
owner authorization.` No arbitrary fixed PR-14 duration is written now.

### 9.10 Kill-switch authority
Authorized roles: owner; owner-authorized technical-operations lead; super admin in an
emergency. `Dual approval for emergency disable: NO`. Re-activation does not use the
emergency path — a new owner GO is required. Every kill-switch use is logged with: audit
log, user, time, reason, affected cohort, previous/new flag state.

### 9.11 Rollback time
`Maximum rollback time: 5 minutes`; `Technical target rollback time: 1 minute`. Rollback
must be possible without a deploy. During rollback: legacy primary is preserved; canonical
shadow evidence continues where possible; no data rollback (no canonical writes); incident
evidence is not deleted; re-activation is never automatic.

### 9.12 Rollback trigger model
`Security / financial hard triggers → automatic rollback`;
`Performance triggers → manual owner/operations decision`.
Automatic rollback: cross-currency aggregation; principal or balance difference; canonical
primary while blocker present; zero-fill; tenant/case leakage; unauthorized authority
promotion; ledger/write mutation; kill-switch failure; any unexplained financial
discrepancy. Manual assessment: p95/p99 regression; non-material latency variation;
presentation-only classified difference; transient infrastructure error. If a performance
threshold is materially exceeded or the error/timeout increase becomes sustained, the
owner/operations makes the rollback decision.

### 9.13 Re-activation
Default: `NEW OWNER GO REQUIRED`. If the fault affected calculation semantics, currency,
allocation, authority or financial display: `NEW PR + FULL ACCEPTANCE GATES + NEW LEGAL
SIGN-OFF + NEW OWNER GO`. Even a purely operational/infrastructure issue requires an owner
GO; the team cannot re-enable on its own.

### 9.14 Legal sign-off
Primary legal authority: `OWNER / LEGAL OWNER`; additional reviewer: independent legal
reviewer where available. Scope: TBK 100; PRE/POST enforcement interest; partial-payment
interest-base mutation; reversal semantics; currency isolation; displayed authority;
`0` / `NOT_CALCULATED` distinction; fee/harç fields staying ADR-013 owner-gated.
`Refresh required after calculation-semantic changes: YES`. A presentation-only change
that does not alter semantics may have its refresh requirement determined separately by
the owner.

### 9.15 Pre-representative-evidence allowed work
Binding: `DOCS / MONITORING PREPARATION ONLY`. Allowed: dashboard/metric design;
discrepancy taxonomy; rollback runbook; kill-switch runbook; sanitized-data procedure;
access/KVKK procedure; smoke/bake checklist; sign-off templates. **Forbidden:** PR-11
runtime implementation worktree; consumer-switch code; flag activation; cohort activation;
pilot rollout; PR-12/13/14 preparation.
