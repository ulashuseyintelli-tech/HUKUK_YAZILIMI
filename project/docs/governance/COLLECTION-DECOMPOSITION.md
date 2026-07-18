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
PHASE 0 — CANONICALIZATION & HANDOFF          [CLOSED / CANONICAL UPON APPROVED MERGE]
PHASE 1 — P0 FINANCIAL SAFETY                 [CLOSED / CANONICAL]
PHASE 2 — TEMPORAL & LIFECYCLE CONTRACTS      [ACTIVE — W2.1/W2.2A/W2.2B/W2.2C-0 CLOSED; W2.2C-1 CLOSED UPON APPROVED RECONCILIATION / W2.2C-2 OWNER GO REQUIRED]
PHASE 3 — DOMAIN COMPLETENESS                 [owner-decision-gated]
PHASE 4 — CONSUMER CUTOVER                    [cutover-gated — NOT AUTHORIZED]
PHASE 5 — PLATFORM HARDENING                  [P4 sonrası]
```

---

## PHASE 0 — CANONICALIZATION & HANDOFF

| Wave | Workstream | Amaç | Durum / Bağımlılık | Lane |
|---|---|---|---|---|
| W0.1 | Repository baseline acceptance | Handoff kabul + delta reconcile | **CLOSED / CANONICAL** — Handoff Acceptance Report (2026-07-13, ACCEPTED_WITH_DELTA @ `beb7d673`) | Claude |
| W0.2 | Collection Governance suite materialization | 5 belge + matrisler owner-review taslağı | **CLOSED / CANONICAL** — suite PR #1209 (`c36fa47b`) + MPB-030 closure evidence PR #1210 (`25db930c`) | Claude |
| W0.3 | Owner decision ratification session(ları) | Phase 0 kök COL/OD kararlarının repository authority'ye kaydı | **CLOSED / CANONICAL** — COL/OD-18A #1257 (`c4ee2332`), COL/OD-05 #1242 (`6e154c68`), COL/OD-21 #1295 (`a6372cca`), COL/OD-03 #1303 (`539fd9e5`), COL/OD-01 #1307 (`a3729d9c`) | Owner (+ChatGPT) |
| W0.4 | Master Register / backlog alignment | Suite + kararların register'a bağlanması | **CLOSED / CANONICAL UPON APPROVED MERGE** — Governance Index, Decision Log, Master Triage ve Product Backlog closure pointer'ları hizalandı | Codex |

### Phase 0 Final Closure Evidence

Phase 0 exit criteria ve canonical kanıtları:

1. **Repository acceptance:** W0.1 `ACCEPTED_WITH_DELTA`; kabul edilen delta'lar canonical
   suite/risk/decomposition kayıtlarında sınıflandırıldı.
2. **Governance materialization:** W0.2 beş belgeli Collection Governance Suite ve MPB-030
   closure evidence'i canonical main'dedir.
3. **Root owner gates:** W0.3 için gerekli COL/OD-18A, COL/OD-05, COL/OD-21, COL/OD-03 ve
   COL/OD-01 kararları Decision Log'da `RECORDED` ve merge SHA'ları canonical ancestry'dedir.
4. **Register alignment:** W0.4 ile Governance Index, bu decomposition, Decision Log, Master
   Triage Register ve Product Backlog aynı Phase 0 closure gerçeğine bağlanır.
5. **Scope/authority boundary:** Phase 1 `CLOSED / CANONICAL` kalır. Açık sonraki-faz owner
   kararları ve riskler Phase 0 blocker'ı değildir; çözülmüş sayılmaz. Phase 2 `NOT AUTHORIZED`
   kalır ve yalnız ayrı owner `ENTRY REVIEW` GO ile değerlendirilebilir.

Bu reconciliation'ın approved merge'iyle W0.1–W0.4 ve **RC-COL Phase 0** formal olarak
`CLOSED / CANONICAL` olur. Bu kapanış kod, schema, migration, backfill, runtime, cutover veya
Phase 2 implementation authority'si üretmez.

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

## PHASE 2 — TEMPORAL & LIFECYCLE CONTRACTS (ACTIVE — W2.1/W2.2A/W2.2B/W2.2C-0 closed; W2.2C-1 closes upon approved reconciliation, W2.2C-2 owner GO required)

| Wave | Workstream | Gate |
|---|---|---|
| W2.1 | Canonical effective-date policy | **CLOSED / CANONICAL UPON APPROVED RECONCILIATION MERGE** — COL/OD-03 RECORDED; W2.1A PR #1315 / `1d5974e5` test-only evidence; precedence, fallback, provenance exclusion ve fail-closed confirmed |
| W2.2 | confirmedAt / external settlement | **ACTIVE — W2.2A/W2.2B/W2.2C-0 CLOSED / CANONICAL; W2.2C-1 CLOSED / CANONICAL UPON APPROVED RECONCILIATION MERGE** — COL/OD-06 Option A + COL/OD-06A Option C + COL/OD-03 RECORDED; PR #1332 / `88290071` additive candidate-status schema + PR #1347 / `61b49ce0` PENDING candidate ingress + PR #1353 / `758f6186` unsettled candidate admission guard + PR #1369 / `e7d2f11d` typed settlement evidence additive schema foundation; `W2.2C-2` OWNER GO REQUIRED / IMPLEMENTATION NOT AUTHORIZED |
| W2.3 | Unapplied payment lifecycle | **BLOCKED — W2.2 BOUNDARY PENDING** — COL/OD-06 contract RECORDED; full runtime lifecycle incomplete |
| W2.4 | Refund / downstream reversal | COL/OD-09/-10 OPEN (+COL/OD-01 RECORDED); partial/delta fail-closed; workstream NOT AUTHORIZED |
| W2.5 | Claim satisfaction / re-open | COL/OD-07/-08 OPEN; workstream NOT AUTHORIZED |

### W2.1 Exit Evidence

W2.1 exit criteria ve canonical kanıtı:

1. **Contract:** COL/OD-03 Option A ve `COL-TIME-001` canonical main'dedir.
2. **Precedence/fallback:** Explicit `LedgerEntry.effectiveDate`, ardından
   `LedgerEntry.entryDate`; Ledger bulunmayan current-compatible fallback'te
   `Collection.date` testle sabitlenmiştir.
3. **Provenance exclusion:** `valueDate` ve `confirmedAt` farklı olsa da legal-balance
   girdisinde effective-date authority olmaz.
4. **Fail-closed:** Geçersiz zorunlu Ledger/Collection tarihi sonuç üretmez ve açık
   `RangeError` ile durur.
5. **Repository evidence:** W2.1A PR #1315, squash
   `1d5974e5b15961cd1ebc04d84dcb43c3c9073fce`, required CI `4/4 SUCCESS`; diff yalnız
   `payment-mapper.spec.ts`, runtime/schema/migration/backfill/snapshot/cutover etkisi yoktur.
6. **Open-boundary preservation:** COL/OD-06 Option A ile W2.2 decision gate sağlanmıştır;
   implementation hâlâ ayrı owner GO gerektirir. W2.3, W2.2 boundary pending nedeniyle
   blokludur. W2.4–W2.5 ve COL/OD-07/-08/-09/-10 açık ve ayrı owner gate'leridir. Phase 2
   kapanmaz; sıradaki workstream owner GO olmadan başlamaz.

### W2.2A Exit Evidence

W2.2A additive schema foundation exit criteria ve canonical kanıtı:

1. **Repository evidence:** PR #1332, branch commit
   `7a4fefa4866dd7b0cc4211849be8aeececf1e337`, squash
   `88290071c5508952ad0c875e00f072a45e57ba4c`; required CI `4/4 SUCCESS` ve squash SHA
   canonical main ancestry'sindedir.
2. **Additive schema:** `BankTransactionCandidateStatus` yalnız `PENDING`, `SETTLED` ve
   `REJECTED` değerlerini taşır. `BankTransaction.candidateStatus` nullable ve defaultsuzdur.
3. **Migration boundary:** Migration yalnız enum creation ve nullable column addition içerir;
   backfill, default, index veya mevcut satır mutation'ı yoktur.
4. **Database validation:** Disposable PostgreSQL üzerinde canonical migration deploy,
   W2.2A apply ve manual reverse-SQL rollback PASS; existing row değişmedi, legacy
   `candidateStatus IS NULL` kaldı, üç canonical enum değeri kabul edildi ve `UNKNOWN`
   reddedildi.
5. **Regression evidence:** Prisma validate/generate, bank matching regression `12/12`,
   production TypeScript check ve `git diff --check` PASS olarak PR kanıtında kayıtlıdır.
6. **Authority preservation:** Runtime writer, bank matching/Collection create davranışı,
   application/external-finality eksenleri ve finansal authority değişmemiştir. Legacy `NULL`
   unknown'dır ve `SETTLED` kabul edilemez. COL-RISK-G03 açık kalır.
7. **Next gate:** W2.2 workstream'i ACTIVE kalır; sıradaki aday W2.2B ayrı owner GO bekler.
   W2.3 `BLOCKED — W2.2 BOUNDARY PENDING`; W2.2B–W2.2E ve Phase 2 closure bu kayıtla
   yetkilendirilmez.

### W2.2B Exit Evidence

W2.2B candidate ingress initialization exit criteria ve canonical kanıtı:

1. **Repository evidence:** PR #1347, branch commit
   `6649d5c7bfb0995c8a5f460a5b3680dc4df09b36`, squash
   `61b49ce02b75ed966f163e290d8bdd1ed140587a`; required CI `4/4 SUCCESS` ve squash SHA
   canonical main ancestry'sindedir.
2. **Incoming initialization:** Yeni `INCOMING` banka receipt hareketi
   `candidateStatus=PENDING` ile oluşturulur; candidate non-canonical integration input'u
   olarak kalır.
3. **Direction boundary:** `OUTGOING` hareket candidate lifecycle başlatmaz ve
   `candidateStatus` yazmaz.
4. **Zero financial effect:** `tryAutoMatch` yalnız tenant-scoped `PENDING` adayı
   tespit/eşleştirme hazırlığı için okur. PENDING ingress; Collection, journal, event, outbox,
   ledger, allocation veya overpayment üretmez.
5. **Duplicate and tenant evidence:** Duplicate sync mevcut satırı çoğaltmaz, legacy
   `candidateStatus=NULL` değerini backfill etmez ve finansal etki üretmez. Tenant dışı hesap
   fail-closed kalır ve yan etki üretmez.
6. **Regression evidence:** Hedef bank suite `16/16`, ilgili Collection/receipt regression
   suite'leri toplam `33/33`, changed-file ESLint, targeted production/test type-check ve
   `git diff --check` PASS'tir.
7. **Open-boundary preservation:** Diff yalnız bank service + hedef test dosyasıdır;
   schema/migration/backfill yoktur. `SETTLED`/`REJECTED` transition, settlement evidence,
   `externalSettledAt`, canonical Collection confirmation ve application lifecycle hâlâ
   uygulanmamıştır. COL-RISK-G03 açık kalır; W2.2 ACTIVE, W2.2C ayrı owner GO bekler ve W2.3
   `BLOCKED — W2.2 BOUNDARY PENDING` kalır.

### W2.2C-0 Exit Evidence

W2.2C-0 unsettled candidate canonicalization guard exit criteria ve canonical kanıtı:

1. **Repository evidence:** PR #1353, branch commit
   `3271780d49c670a8063f084071c3168f0d2537f7`, squash
   `758f6186a7fe72edb43c81e7514d3e4acc5dceee`; required CI `4/4 SUCCESS` ve squash SHA
   canonical main ancestry'sindedir.
2. **Fail-closed admission:** Yeni canonical Collection create öncesinde
   `candidateStatus=SETTLED` zorunludur. `PENDING`, `REJECTED` ve legacy `NULL` sırasıyla
   `BANK_RECEIPT_SETTLEMENT_REQUIRED`, `BANK_RECEIPT_CANDIDATE_REJECTED` ve
   `BANK_RECEIPT_CANDIDATE_STATUS_UNKNOWN` ile durur.
3. **Zero financial write:** Bloklanan adaylarda Collection, Accounting Journal, domain
   event, outbox, LedgerEntry, LedgerAllocation, CollectionAllocation, overpayment, ClaimItem
   ve bank-match projection write'ı oluşmaz.
4. **Canonical path preservation:** `SETTLED` aday mevcut canonical Collection match yoluna
   devam eder. Önceden başarıyla eşleşmiş transaction replay'i guard'dan önce değerlendirilir
   ve yeni finansal etki üretmeden mevcut Collection'ı döndürür.
5. **Validation evidence:** Hedef bank suite `19/19`, ilgili Collection receipt/authorization
   suite'leri `32/32`, changed-file ESLint ve `git diff --check` PASS'tir. Full API
   type-check'te patch öncesi ve sonrası aynı 499 repository-geneli error satırı görülmüş,
   değişen bank dosyalarında yeni hata bulunmamıştır.
6. **Scope boundary:** Diff yalnız bank service + hedef test dosyasıdır. Schema, migration,
   backfill, settlement transition/evidence writer, dedicated verifier permission,
   `externalSettledAt`, chargeback/refund/reversal ve W2.2D/W2.2E/W2.3 değişikliği yoktur.
   COL-RISK-G03 `OPEN — TRANSITION/EVIDENCE RUNTIME ABSENT` kalır. W2.2 ACTIVE;
   COL/OD-06A approved merge ile settlement evidence decision gate'ini sağlar ve W2.2C-1 ayrı
   owner GO bekler. W2.3 `BLOCKED — W2.2 BOUNDARY PENDING` kalır.

### W2.2C Settlement Evidence Decision Gate

1. **Authority:** COL/OD-06A Option C ve `COL-SETTLE-001`, approved merge ile hybrid typed
   evidence authority'sini ve dedicated `bank.settlement.verify` permission'ını `RECORDED`
   duruma getirir.
2. **Evidence boundary:** Validated provider attestation ile evidence-backed dedicated
   `SETTLEMENT_VERIFIER` tek izinli kaynak sınıflarıdır. Tarih alanları ve kullanıcı beyanı
   tek başına evidence değildir; provider yolu finality desteğine kadar `DEFERRED` kalır.
3. **Mutation separation:** Immutable evidence append ile candidate status transition ayrı
   canonical mutation'lardır; transaction-bound audit ve allowlist metadata sınırı uygulanır.
4. **First patch boundary:** `W2.2C-1 — Typed Settlement Evidence Additive Schema Foundation`
   PR #1369 / `e7d2f11d` ile additive persistence temelini kurmuştur; approved reconciliation
   merge'iyle `CLOSED / CANONICAL` olur. Permission implementation, evidence writer, status
   transition, Collection admission, W2.2D/W2.2E ve W2.3 kapsam dışıdır.
5. **Open-boundary preservation:** COL-RISK-G03 `OPEN — TRANSITION/EVIDENCE RUNTIME ABSENT`
   kalır. Decision gate'in sağlanması runtime lifecycle veya implementation authority üretmez.

### W2.2C-1 Exit Evidence

W2.2C-1 typed settlement evidence additive schema foundation exit criteria ve canonical kanıtı:

1. **Repository evidence:** PR #1369, branch commit
   `413f770fe6717d58e8cf8110dc0b7ac9e515e59d`, squash
   `e7d2f11d917da3933860053acf4b7026e4057db0`; required CI `4/4 SUCCESS` ve squash SHA
   canonical main ancestry'sindedir.
2. **Typed evidence model:** `BankSettlementEvidenceSource`, yalnız
   `VALIDATED_PROVIDER_ATTESTATION | SETTLEMENT_VERIFIER`; `BankSettlementEvidenceOutcome`,
   yalnız `SETTLED | REJECTED` değerlerini taşır. `BankSettlementEvidence`, opaque
   `evidenceReference`/`evidenceHash`, nullable actor, `observedAt`/`recordedAt` ve açık
   supersession lineage metadata'sını saklar.
3. **Tenant/replay boundary:** `(tenantId, idempotencyKey)` unique replay authority'sidir.
   Evidence self-reference ve nullable/defaultsuz `BankTransaction.settlementEvidenceId`
   relation'ı tenant-scoped foreign key ile korunur; evidence pointer ve supersession target
   tek kullanımlıdır. Cross-tenant evidence bağlama fail-closed'dur.
4. **Immutability/data boundary:** `SETTLEMENT_VERIFIER` evidence için actor DB check ile
   zorunludur. UPDATE/DELETE trigger'ları evidence row'unu immutable tutar; correction yeni
   linked supersession row'u ile yapılır. Migration backfill veya default içermez, existing row'ları
   değiştirmez ve yeni evidence modelinde raw provider payload/IBAN/açıklama/serbest metin
   alanı eklemez.
5. **Validation evidence:** Prisma format/validate/generate; disposable PostgreSQL üzerinde 81
   baseline migration + apply/rollback/re-apply; existing-row/legacy-null/no-backfill/default-free,
   exact enum, tenant idempotency, cross-tenant FK, single-use pointer, verifier actor,
   supersession uniqueness ve immutable guard kontrolleri PASS'tir. Bank delegation regression
   `1 suite / 19 tests`, production TypeScript check ve `git diff --check` PASS'tir. Daha geniş
   test-inclusive API type-check mevcut, ilgisiz repository debt'i nedeniyle başarısız kalmış;
   patch TypeScript dosyası değiştirmemiştir.
6. **Scope boundary:** Diff yalnız Prisma schema + tek additive migration'dır. Runtime evidence
   writer, `bank.settlement.verify` enforcement, candidate status transition, Collection
   confirmation, financial behavior, backfill veya raw provider payload storage yoktur.
   COL-RISK-G03 `OPEN — RUNTIME WRITER / TRANSITION ABSENT` kalır. W2.2 ACTIVE;
   `W2.2C-2` yalnız sonraki owner-gated adaydır ve W2.3
   `BLOCKED — W2.2 BOUNDARY PENDING` kalır.

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
PHASE 0           : CLOSED / CANONICAL UPON APPROVED MERGE
W0.1              : CLOSED / CANONICAL — repository acceptance
W0.2              : CLOSED / CANONICAL — suite PR #1209 + closure evidence PR #1210
W0.3              : CLOSED / CANONICAL — RECORDED: -18A/-05/-21/-03/-01
W0.4              : CLOSED / CANONICAL UPON APPROVED MERGE — register/backlog alignment
W1.1             : CLOSED / CANONICAL — PR #1214 + #1223
W1.2             : CLOSED / CANONICAL — PR #1217 + COL/OD-04 + PR #1279
W1.3             : CLOSED / CANONICAL — PR #1265 @ 081bd961
W1.4             : CLOSED / CANONICAL — PR #1229 @ 4c1968ce
W1.5             : CLOSED / CANONICAL — PR #1236 @ fbef6915
W1.6             : CLOSED / CANONICAL — COL/OD-05 + PR #1246 @ c7f55da4
W2.1             : CLOSED / CANONICAL UPON APPROVED RECONCILIATION MERGE — PR #1315 @ 1d5974e5
W2.2A            : CLOSED / CANONICAL — PR #1332 @ 88290071
W2.2B            : CLOSED / CANONICAL — PR #1347 @ 61b49ce0
W2.2C-0          : CLOSED / CANONICAL — PR #1353 @ 758f6186 + reconciliation @ 77a83db3
W2.2C            : DECISION GATE SATISFIED — COL/OD-06A Option C; runtime absent
W2.2C-1          : CLOSED / CANONICAL UPON APPROVED RECONCILIATION MERGE — PR #1369 @ e7d2f11d
W2.2C-2          : OWNER GO REQUIRED / IMPLEMENTATION NOT AUTHORIZED
W2.2             : ACTIVE — W2.2A/W2.2B/W2.2C-0 closed; W2.2C-1 closes upon approved reconciliation; W2.2C-2 owner-gated
W2.3             : BLOCKED — W2.2 BOUNDARY PENDING
PHASE 2          : ACTIVE — W2.1/W2.2A/W2.2B/W2.2C-0 closed; W2.2C-1 closes upon approved reconciliation; W2.2C-2 owner GO required; W2.3 blocked; W2.4–W2.5 owner-gated
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
