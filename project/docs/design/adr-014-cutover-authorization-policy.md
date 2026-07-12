# ADR-014 Cutover Authorization Policy

**Status:** DEFINED / CANONICAL — governance decision record for split-plan §12 seq 11
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
| **Representative data** | Sanitized production copy; authorized read-replica shadow; a controlled pilot environment separately proven to represent real usage distribution | **ABSENT / BLOCKING** |
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

### Owner-selected operational thresholds — `OWNER TO SET BEFORE PR-11`
The exact numeric values of the following remain unset in this policy and must be
assigned by the owner before any cutover authorization can be marked `APPROVED`:
- parity discrepancy rate,
- calculation latency regression,
- error-rate ceiling,
- pilot cohort size,
- smoke duration,
- bake duration.

Cutover authorization **cannot be `APPROVED`** while these fields are unset.

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
Cutover authorization policy → DEFINED / CANONICAL
PR-11 scope boundary          → DECIDED / CANONICAL
Representative evidence       → ABSENT / BLOCKING
PR-11 authorization           → NOT AUTHORIZED
Runtime cutover               → NOT AUTHORIZED
```

Defining this governance policy does **not** automatically open PR-11.

---

## 8. What this policy does not do

- Does not authorize PR-11 or any downstream cutover ring (PR-11 stability, PR-12,
  PR-12 bake, PR-13, PR-14, post-cutover verification, final closure).
- Does not change any feature flag; `GUARDED_PRIMARY_DISPLAY_PILOT` stays default
  `false`.
- Does not change runtime, source, schema, migration, API or UI behaviour.
- Does not close CAN-CUT-01 or CAN-CUT-02.
- Does not create representative or live evidence; that remains ABSENT / BLOCKING.
