# COLLECTION DECOMPOSITION

## RC-COL Programı — Program → Phase → Wave → Workstream Haritası

```text
Belge yolu              : project/docs/governance/COLLECTION-DECOMPOSITION.md
Durum                   : CANONICAL DECOMPOSITION / EXECUTION-PLANNING REFERENCE
Sınıf                   : DECOMPOSITION — anayasa değildir, runtime evidence değildir,
                          sprint listesi değildir, owner kararını varsayamaz (SDOM §21)
Owner Status            : OWNER-APPROVED CANONICALIZATION (2026-07-13)
Repository Status       : CANONICAL UPON APPROVED MERGE TO MAIN
Kanıt tabanı            : Desktop 01 §22 program ağacı + repo main @ beb7d673 güncel durumu
IMPLEMENTATION AUTHORITY: NONE — hiçbir node kendiliğinden implementasyona alınmaz;
                          her workstream ayrı GO + (varsa) owner kararı ister
NOT                     : Bu fazda TASK YAZILMAZ; yalnız decomposition üretilir.
```

Lane sütunu: TM3/dbind CURRENT-BINDING atamaları esas; handoff lane modeli (01/03)
PROPOSED'dur ve COL/OD-18 kapanana kadar parantezle gösterilir. COL/OD-18 (RECORDED) +
COL/OD-18A (AMENDMENT) yalnız client-settlement/W1.3 lane'ini karara bağlamıştır:
implementation = Codex, analysis/review = Claude (Analysis Owner ≠ Implementation Owner);
diğer parantezli atamalar PROPOSED kalır.

---

## PROGRAM: RC-COL — Receivable & Collection Canonical Transformation

```text
PHASE 0 — CANONICALIZATION & HANDOFF          [AKTİF]
PHASE 1 — P0 FINANCIAL SAFETY                 [CLOSED / CANONICAL]
PHASE 2 — TEMPORAL & LIFECYCLE CONTRACTS      [owner-decision-gated]
PHASE 3 — DOMAIN COMPLETENESS                 [owner-decision-gated]
PHASE 4 — CONSUMER CUTOVER                    [cutover-gated — NOT AUTHORIZED]
PHASE 5 — PLATFORM HARDENING                  [P4 sonrası]
```

---

## PHASE 0 — CANONICALIZATION & HANDOFF

| Wave | Workstream | Amaç | Durum / Bağımlılık | Lane |
|---|---|---|---|---|
| W0.1 | Repository baseline acceptance | Handoff kabul + delta reconcile | **KAPANDI** — Handoff Acceptance Report (2026-07-13, ACCEPTED_WITH_DELTA @ beb7d673) | Claude |
| W0.2 | Collection Governance suite materialization | 5 belge + matrisler owner-review taslağı | **BU FAZ** — taslaklar üretildi; sırada owner review → docs-only PR | Claude |
| W0.3 | Owner decision ratification session(ları) | COL/OD kuyruklarının karara bağlanması | **CLOSED / CANONICAL** — Phase 0 kökleri RECORDED: COL/OD-18/-21/-05/-03/-01 | Owner (+ChatGPT) |
| W0.4 | Master Register / backlog alignment | Suite + kararların register'a bağlanması | **PENDING** — W0.3 complete; Phase 0 final closure reconciliation ayrı GO bekler | Claude |

## PHASE 1 — P0 FINANCIAL SAFETY

| Wave | Workstream | Amaç | Gate | Lane |
|---|---|---|---|---|
| W1.1 | Deterministic test infrastructure | JSON EOL determinism + kuruş remainder sabitleme | **CLOSED / CANONICAL** — PR #1214 (`bb9c1973`) + PR #1223 (`5fe5f0eb`); cross-platform LF ve exact-money kanıtı | Codex |
| W1.2 | Allocation concurrency proof & lock | A2 race harness + COL/OD-04 same-case lock kontratı + ikinci allocation yolunun kapanışı | **CLOSED / CANONICAL** — PR #1217 (`4e8243e5`) + COL/OD-04 PR #1275 (`762837d1`) + PR #1279 (`6c2329dc`); canonical path preserved, secondary path fail-closed | Codex (TM3 §11: collection modülü) |
| W1.3 | Money-out idempotency evidence | Replay harness'ları (04/A4); kontrat KODDA MEVCUT (F-12) — schema işi YOK | **CLOSED / CANONICAL** — PR #1265, squash `081bd9615429d24a6a205a2e6740daf2fd549770`; idempotency confirmed, concurrency safe, duplicate payout none. Harness karar gerektirmedi; `COL/OD-21` text-ratification RECORDED. | Implementation: Codex (COL/OD-18A); Analysis/Review: Claude; paralel yazım PROHIBITED — tek aktif writer (COL/OD-18) |
| W1.4 | Multi-instrument legal document integrity | Red test + deterministic `findMany` projection | **CLOSED / CANONICAL** — PR #1229 (`4c1968ce`); single-instrument compatibility preserved | Codex |
| W1.5 | Old UYAP route containment | Red test + fail-closed guard | **CLOSED / CANONICAL** — PR #1236 (`fbef6915`); valid legacy flow preserved, unsupported kambiyo output fail-closed. Kalıcı route disposition `COL/OD-11` kapsamında açık kalır ve containment kapanışını geri açmaz. | Codex |
| W1.6 | Collection audit capture | COL/OD-05 transaction-bound audit/correlation contract | **CLOSED / CANONICAL** — PR #1246 (`c7f55da4`); create/update/void audit atomic, allowlist-only, replay/no-op duplicate audit yok | Codex (TM3 §11: collection modülü; audit contract OFFICE ile ortak) |

Not: Parantezsiz lane = TM3/dbind CURRENT-BINDING dosya sahipliğiyle uyumlu atama; parantezli
lane = handoff (Desktop 03/04) önerisi olup COL/OD-18 kapanışına tabidir.

Phase 1 durumu **CLOSED / CANONICAL**'dır: W1.1–W1.6 approved merge kanıtlarıyla
canonical main'dedir. `COL/OD-21` RECORDED'dır; text-ratification W1.3'ün teknik evidence
kapanışını değiştirmez. `COL/OD-11` kalıcı legacy UYAP route
disposition'ını, daha geniş `REC-AUTH-011/012` reconciliation'ı ise Phase 1 dışındaki
cross-domain authority çalışmasını açık tutar. Bu kapanış Phase 2'yi başlatmaz veya
implementation authority üretmez.

## PHASE 2 — TEMPORAL & LIFECYCLE CONTRACTS (tamamı owner-gated)

| Wave | Workstream | Gate |
|---|---|---|
| W2.1 | Canonical effective-date policy | COL/OD-03 **RECORDED / CONTRACT CANONICAL**; implementation ve Phase 2 cutover NOT AUTHORIZED |
| W2.2 | confirmedAt / external settlement | COL/OD-06 OPEN (+COL/OD-03 RECORDED); Phase 2 NOT AUTHORIZED |
| W2.3 | Unapplied payment lifecycle | COL/OD-06 |
| W2.4 | Refund / downstream reversal | COL/OD-09/-10 OPEN (+COL/OD-01 RECORDED); partial/delta fail-closed, Phase 2 NOT AUTHORIZED |
| W2.5 | Claim satisfaction / re-open | COL/OD-07, -08 |

## PHASE 3 — DOMAIN COMPLETENESS (tamamı owner-gated)

| Wave | Workstream | Gate |
|---|---|---|
| W3.1 | Fee/harç authority | COL/OD-14 (ADR-013 boundary audit önce) |
| W3.2 | Muaccel/overdue/dispute/conditionality | COL/OD-20 |
| W3.3 | Dosya tutarı / policy facts | COL/OD-02 |
| W3.4 | Liability & debtor aggregation + PaymentDesignation | COL/OD-17, -19 (DEBTOR hattıyla ortak) |
| W3.5 | FX contract | COL/OD-15 |

## PHASE 4 — CONSUMER CUTOVER (cutover-gated; bugün NOT AUTHORIZED)

| Wave | Workstream | Gate |
|---|---|---|
| W4.1 | Report formula isolation | COL/OD-16 |
| W4.2 | Template canonical DTO | COL/OD-16 |
| W4.3 | UYAP canonical path | COL/OD-11 (+CAN-CUT-01/PR-A5 hattı koordinasyonu) |
| W4.4 | UI/API parity | COL/OD-12, -16 |
| W4.5 | Official snapshot / as-of | COL/OD-13 |
| W4.6 | Owner cutover authorization | COL/OD-12 (3 gate: baseline + evidence + APPROVED) |

## PHASE 5 — PLATFORM HARDENING

| Wave | Workstream | Not |
|---|---|---|
| W5.1 | Correlation/causation platform standardı | COL/OD-05 sonucunu genelleştirir |
| W5.2 | Outbox/event standard | TM3 §9 retry/dead-letter açık maddesi dahil |
| W5.3 | Continuous reconciliation | ADR-010 hattıyla koordine |
| W5.4 | Operational metrics/projections | COL-INV operational-metric sınırına tabi |

---

## Dependency Matrix (faz-üstü)

```text
W0.2 (suite) ──> W0.3 CLOSED (RECORDED: -18/-21/-05/-03/-01) ──> W0.4 PENDING (final closure reconciliation)
W1.1             : CLOSED / CANONICAL — PR #1214 + #1223
W1.2             : CLOSED / CANONICAL — PR #1217 + COL/OD-04 + PR #1279
W1.3             : CLOSED / CANONICAL — PR #1265 @ 081bd961
W1.4             : CLOSED / CANONICAL — PR #1229 @ 4c1968ce
W1.5             : CLOSED / CANONICAL — PR #1236 @ fbef6915
W1.6             : CLOSED / CANONICAL — COL/OD-05 + PR #1246 @ c7f55da4
PHASE 2    <── COL/OD-06..-10 (COL/OD-01/-03 RECORDED; Phase 2 NOT AUTHORIZED)
PHASE 3    <── COL/OD-02, -14, -15, -17, -19, -20
PHASE 4    <── PHASE 1 tamamı + COL/OD-11, -12, -13, -16 + CAN-CUT-01/02
PHASE 5    <── PHASE 4
Çapraz     : COL/OD-18 (lane) tüm Codex/Claude atamalarını etkiler — erken kapanmalı
```

## Worktree/branch adlandırma (PROPOSED — COL/OD-18 ile birlikte ratifiye edilir)

```text
codex/rc-col-<workstream>-<slug>     (para hattı)
claude/rc-gov-<workstream>-<slug>    (governance/docs)
Desktop 03 §5 prefix seti: RC-GOV-* / RC-EVD-* / RC-COL-* / RC-BAL-* / RC-SET-* / RC-UYAP-*
```
