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
PHASE 2 — TEMPORAL & LIFECYCLE CONTRACTS      [ACTIVE — W2.1/W2.2A/W2.2B/W2.2C-0/W2.2C-1/W2.2C-2/W2.2C-3/W2.2C-4/W2.2C-5 CLOSED; W2.2D-0 CLOSED UPON APPROVED RECONCILIATION / W2.2D-1 OWNER GO REQUIRED]
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

## PHASE 2 — TEMPORAL & LIFECYCLE CONTRACTS (ACTIVE — W2.1/W2.2A/W2.2B/W2.2C-0/W2.2C-1/W2.2C-2/W2.2C-3/W2.2C-4/W2.2C-5 closed; W2.2D-0 closes upon approved reconciliation, W2.2D-1 owner GO required)

| Wave | Workstream | Gate |
|---|---|---|
| W2.1 | Canonical effective-date policy | **CLOSED / CANONICAL UPON APPROVED RECONCILIATION MERGE** — COL/OD-03 RECORDED; W2.1A PR #1315 / `1d5974e5` test-only evidence; precedence, fallback, provenance exclusion ve fail-closed confirmed |
| W2.2 | confirmedAt / external settlement | **ACTIVE — W2.2A/W2.2B/W2.2C-0/W2.2C-1/W2.2C-2/W2.2C-3/W2.2C-4/W2.2C-5 CLOSED / CANONICAL; W2.2D-0 CLOSED / CANONICAL UPON APPROVED RECONCILIATION MERGE** — COL/OD-06 Option A + COL/OD-06A Option C + COL/OD-03 RECORDED; PR #1332 / `88290071` additive candidate-status schema + PR #1347 / `61b49ce0` PENDING candidate ingress + PR #1353 / `758f6186` unsettled candidate admission guard + PR #1369 / `e7d2f11d` typed settlement evidence additive schema foundation + PR #1377 / `fcba6d98` candidate finality projection schema + PR #1382 / `be1771d3` dedicated settlement-verifier permission boundary + PR #1391 / `facc7789` immutable human evidence append + PR #1401 / `0452e836` candidate CAS transition + PR #1407 / `1156e4de` evidence-integrity admission guard; W2.2D-1 `OWNER GO REQUIRED / IMPLEMENTATION NOT AUTHORIZED` |
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
   W2.2C-1 `CLOSED / CANONICAL`dır. W2.2C-2, PR #1377 / `fcba6d98` ile additive
   finality projection temelini kurmuş ve approved reconciliation merge'iyle
   `CLOSED / CANONICAL` olur. COL-RISK-G03 `OPEN — PERMISSION / WRITER / TRANSITION ABSENT`
   kalır. W2.2 ACTIVE; `W2.2C-3` yalnız sonraki owner-gated adaydır ve W2.3
   `BLOCKED — W2.2 BOUNDARY PENDING` kalır.

### W2.2C-2 Exit Evidence

W2.2C-2 candidate finality projection schema exit criteria ve canonical kanıtı:

1. **Repository evidence:** PR #1377, branch commit
   `e8cddebf4721500a5826dbd60fce1f0e19e19f1b`, squash
   `fcba6d989c8d6699e540e4d37a4b00b85a85fcc8`; required CI `4/4 SUCCESS` ve squash
   SHA canonical main ancestry'sindedir.
2. **Additive provenance projection:** `BankTransaction.externalSettledAt` nullable ve
   defaultsuzdur. W2.2C-1'in nullable/defaultsuz
   `BankTransaction.settlementEvidenceId` relation'ı tenant-scoped foreign key ile korunur;
   aynı-tenant bağlantı kabul edilir, cross-tenant evidence bağlantısı fail-closed reddedilir.
3. **Migration/no-guess boundary:** Migration yalnız nullable `TIMESTAMP(3)` kolon ekler.
   Backfill, default, `NOT NULL`, tarih tahmini veya existing-row mutation'ı yoktur; legacy
   satırlar `externalSettledAt IS NULL` kalır.
4. **Temporal authority exclusion:** `externalSettledAt` yalnız external-settlement
   provenance/lifecycle alanıdır. `payment-mapper` karakterizasyonu bu alan farklı olsa da
   legal-balance girdisine taşınmadığını ve COL-TIME-001 `effectiveDate` authority'sini
   değiştirmediğini doğrular.
5. **Validation evidence:** Prisma format/validate/generate; disposable PostgreSQL üzerinde
   83 migration deploy + W2.2C-2 manual rollback/re-apply; nullable/default-free/no-backfill,
   existing-row preservation, same-tenant evidence link ve cross-tenant rejection kontrolleri
   PASS'tir. Hedef regression `2 suite / 45 test`, changed-file ESLint, production TypeScript
   ve `git diff --check` PASS'tir. Daha geniş test-inclusive API type-check mevcut, ilgisiz
   repository debt'i nedeniyle başarısız kalmış; required CI içindeki Type check PASS'tir.
6. **Scope/open-boundary preservation:** Diff yalnız Prisma schema, tek additive migration ve
   mevcut effective-date karakterizasyon testidir; toplam üç dosya / altı eklemedir. Runtime
   evidence writer, `bank.settlement.verify` permission enforcement, candidate status
   transition, Collection confirmation, financial behavior, backfill veya tarih tahmini
   yoktur. W2.2C-2 `CLOSED / CANONICAL`dır. W2.2C-3, PR #1382 / `be1771d3` ile dedicated
   settlement-verifier permission boundary'sini kurmuş ve approved reconciliation merge'iyle
   `CLOSED / CANONICAL` olur. COL-RISK-G03 `OPEN — WRITER / TRANSITION ABSENT` kalır.
   W2.2 ACTIVE; `W2.2C-4` yalnız `OWNER GO REQUIRED / IMPLEMENTATION NOT AUTHORIZED`dır.
   W2.3 `BLOCKED — W2.2 BOUNDARY PENDING` kalır.

### W2.2C-3 Exit Evidence

W2.2C-3 dedicated settlement-verifier permission boundary exit criteria ve canonical kanıtı:

1. **Repository evidence:** PR #1382, branch commit
   `414ff5d72157b3d1b60a0176a238141bce0decbd`, squash
   `be1771d3ea3a270e46bdf9c8cd796f93fe109d2a`; required CI `4/4 SUCCESS` ve squash
   SHA canonical main ancestry'sindedir.
2. **Exact permission/actor boundary:** Salt-okunur `SettlementVerifierAuthorizationService`
   trusted `tenantId` ve actor User kimliği ister. User aktif ve aynı tenant'ta olmalı; ayrıca
   tam bir aktif Lawyer veya Staff profili aynı tenant'a bağlı olmalıdır. Exact permission key
   yalnız `bank.settlement.verify`dır; `RECORD_COLLECTION` yeniden kullanılmaz.
3. **Scope/DENY boundary:** Yalnız aktif exact `GLOBAL` grant kabul edilir. Exact aktif
   `DENY`, `ALLOW` üzerinde önceliklidir. Permission grant geçerlilik aralığı request anında
   fail-closed değerlendirilir.
4. **Fail-closed matrix:** Eksik trusted identity, eksik grant, farklı permission key,
   non-`GLOBAL` scope, expired veya henüz aktif olmayan grant, farklı tenant/actor grant,
   inactive/wrong-tenant User ve eksik/çift/inactive/wrong-tenant human profile reddedilir.
5. **Validation evidence:** Hedef permission suite `18/18`; ilgili combined regression
   `4 suite / 94 test`, changed-file ESLint, Prisma Client generate, production TypeScript
   ve `git diff --check` PASS'tir. Daha geniş test-inclusive API type-check mevcut, ilgisiz
   repository debt'i nedeniyle başarısız kalmış; değişen dosyalarda hata yoktur.
6. **Scope/open-boundary preservation:** Diff yalnız yeni authorization service, hedef test
   ve `BankModule` provider/export kaydıdır; toplam üç dosya / 302 ekleme / 2 silmedir.
   Collection admission, schema, migration veya backfill yoktur. W2.2C-3 ve W2.2C-4
   `CLOSED / CANONICAL`dır. W2.2C-5, PR #1401 / `0452e836` ile candidate CAS transition
   sınırını kurmuş ve approved reconciliation merge'iyle `CLOSED / CANONICAL` olur.
   COL-RISK-G03 `PARTIALLY MITIGATED — CONFIRMATION BOUNDARY REMAINS` kalır. W2.2 ACTIVE;
   W2.2D/W2.2E confirmation-boundary review yalnız owner gate'tir ve implementation
   yetkilendirilmemiştir. W2.3 `BLOCKED — W2.2 BOUNDARY PENDING` kalır.

### W2.2C-4 Exit Evidence

W2.2C-4 immutable human settlement-evidence append exit criteria ve canonical kanıtı:

1. **Repository evidence:** PR #1391, branch commit
   `148929e203cd9c31150fe7714a8a55e4c88aad29`, squash
   `facc778947523700e9dbc58c1edda9a26e932b23`; required CI `4/4 SUCCESS` ve squash
   SHA canonical main ancestry'sindedir.
2. **Authority/source boundary:** Writer her append ve replay'den önce exact
   `bank.settlement.verify` boundary'sini zorunlu tüketir. Yalnız human
   `SETTLEMENT_VERIFIER` source açıktır; provider attestation yolu `DEFERRED` ve
   fail-closed kalır.
3. **Replay/conflict/tenant boundary:** `(tenantId, idempotencyKey)` replay authority'sidir.
   Aynı key/aynı payload mevcut evidence'ı yeni write veya audit olmadan döndürür; aynı
   key/farklı payload fail-closed conflict üretir. Concurrent aynı-key replay tek evidence
   ve tek audit ile sonuçlanır; aynı key farklı trusted tenant'larda bağımsızdır.
4. **Transaction/audit boundary:** Immutable evidence ve allowlist-only audit aynı transaction
   içinde yazılır. Audit failure evidence append'i rollback eder; ikinci evidence veya audit
   ve partial persistence oluşmaz.
5. **No-mutation evidence:** Candidate status/evidence pointer, `BankTransaction`, Collection,
   Accounting Journal, event, outbox, `LedgerEntry`, `LedgerAllocation`,
   `CollectionAllocation` ve `CollectionOverpayment` değişmez.
6. **Validation/scope:** Hedef writer/permission/delegation/disposable-PostgreSQL paketleri
   `4 suite / 49 test`; canonical disposable PostgreSQL migration deploy `83 migration`,
   production TypeScript, changed-file ESLint ve `git diff --check` PASS'tir. Diff yalnız iki
   hedef test, evidence-writer service ve `BankModule` kaydıdır; dört dosya / 799 ekleme /
   2 silmedir. Schema, migration, backfill, provider adapter veya raw payload storage yoktur.
7. **Open-boundary preservation:** W2.2C-4 `CLOSED / CANONICAL`dır. W2.2C-5, PR #1401 /
   `0452e836` ile candidate CAS transition sınırını kurmuş ve approved reconciliation
   merge'iyle `CLOSED / CANONICAL` olur. COL-RISK-G03
   `PARTIALLY MITIGATED — CONFIRMATION BOUNDARY REMAINS` kalır. W2.2 ACTIVE;
   W2.2D/W2.2E confirmation-boundary review yalnız owner gate'tir ve implementation
   yetkilendirilmemiştir. W2.3 `BLOCKED — W2.2 BOUNDARY PENDING` kalır.

### W2.2C-5 Exit Evidence

W2.2C-5 candidate CAS transition exit criteria ve canonical kanıtı:

1. **Repository evidence:** PR #1401, branch commit
   `e68a07c7f953245a346023e8e0f948d9d11d8dad`, squash
   `0452e836b7e2e86cc89052c27969be67782ad717`; required CI `4/4 SUCCESS` ve squash
   SHA canonical main ancestry'sindedir.
2. **Authority/tenant boundary:** Transition her çağrıda exact `bank.settlement.verify`
   boundary'sini ve aynı trusted tenant'a bağlı immutable typed evidence'ı zorunlu tüketir.
   Farklı tenant transaction/evidence/actor bağları fail-closed reddedilir.
3. **CAS/terminal boundary:** Yalnız
   `tenantId + transactionId + candidateStatus=PENDING` koşulu `SETTLED` veya `REJECTED`
   terminal sonucuna geçebilir. Legacy `NULL`, terminal `SETTLED`/`REJECTED` ve `OUTGOING`
   kaynaklardan yeni transition reddedilir; terminal state geri alınmaz veya değiştirilmez.
4. **Replay/conflict/concurrency:** Aynı evidence/idempotency replay'i mevcut sonucu yeni
   write veya audit olmadan döndürür. Farklı evidence, farklı outcome veya terminal-state
   uyuşmazlığı fail-closed conflict üretir. Concurrent PostgreSQL yarışında yalnız tek CAS
   transition kazanır.
5. **Transaction/audit boundary:** Evidence pointer, candidate status, `SETTLED` için
   `externalSettledAt=evidence.observedAt` ve allowlist-only audit aynı transaction'dadır;
   `REJECTED` settlement zamanı üretmez. Audit failure status, pointer ve timestamp mutation'ını
   birlikte rollback eder; partial persistence kalmaz.
6. **Zero-financial-effect boundary:** Collection, Accounting Journal, domain event, outbox,
   `LedgerEntry`, `LedgerAllocation`, `CollectionAllocation` ve `CollectionOverpayment`
   yazımı oluşmaz. Candidate finality, canonical Collection admission/confirmation authority'si
   değildir.
7. **Validation/scope:** Hedef transition unit + disposable-PostgreSQL paketleri `19/19`,
   ilgili bank regression'ı `6 suite / 68 test`, production TypeScript, changed-file ESLint
   ve `git diff --check` PASS'tir. Diff yalnız iki hedef test, transition service ve
   `BankModule` kaydıdır; dört dosya / 1.165 ekleme / 0 silmedir. Schema, migration, backfill,
   provider adapter, Collection admission veya finansal write yoktur.
8. **Open-boundary preservation:** W2.2C-5 `CLOSED / CANONICAL`dır. W2.2D-0, PR #1407 /
   `1156e4de` ile evidence-integrity admission guard sınırını kurmuş ve approved
   reconciliation merge'iyle `CLOSED / CANONICAL` olur. COL-RISK-G03
   `PARTIALLY MITIGATED — CONFIRMATION BOUNDARY REMAINS` kalır. W2.2 ACTIVE;
   sıradaki gate W2.2D-1'dir ve yalnız `OWNER GO REQUIRED / IMPLEMENTATION NOT
   AUTHORIZED`dır. W2.3 `BLOCKED — W2.2 BOUNDARY PENDING` kalır.

### W2.2D-0 Exit Evidence

W2.2D-0 settled-candidate evidence-integrity admission guard exit criteria ve canonical kanıtı:

1. **Repository evidence:** PR #1407, branch commit
   `f12162d9eb714e424350520d72263d5e1269a922`, squash
   `1156e4def38795f25b834ed46a1224ff4de12483`; required CI `4/4 SUCCESS` ve squash
   SHA canonical main ancestry'sindedir.
2. **Replay ordering:** Daha önce başarıyla eşleşmiş aynı-case transaction replay'i evidence
   guard'dan önce değerlendirilir; mevcut canonical Collection döner ve ikinci
   Collection/match-projection write'ı oluşmaz.
3. **Admission tuple:** Yeni admission yalnız `INCOMING`, `candidateStatus=SETTLED` ve dolu
   `settlementEvidenceId` ile ilerler. Evidence exact `tenantId + evidenceId` üzerinden aynı
   tenant'ta okunur; `outcome=SETTLED` ve `source=SETTLEMENT_VERIFIER` zorunludur.
4. **Temporal integrity:** `BankTransaction.externalSettledAt`, canonical evidence
   `observedAt` değeriyle birebir eşleşir. Bu equality lifecycle/provenance bütünlüğüdür;
   COL-TIME-001 `effectiveDate` authority'si üretmez veya değiştirmez.
5. **Fail-closed boundary:** Eksik pointer, bulunamayan/cross-tenant evidence, deferred
   provider source, non-SETTLED outcome, eksik veya uyuşmayan settlement zamanı açık hata ile
   reddedilir.
6. **Zero-write boundary:** Fail-closed yollarında Collection, Accounting Journal, domain
   event, outbox, `LedgerEntry`, `LedgerAllocation`, `CollectionAllocation`,
   `CollectionOverpayment`, ClaimItem ve bank-match projection write'ı oluşmaz.
7. **Validation/scope:** Hedef bank-match suite `26/26`, ilgili bank lifecycle regression'ı
   `4 suite / 62 test`, changed-file ESLint ve `git diff --check` PASS'tir. Repository-geneli
   yerel API type-check kapsam dışı mevcut hatalar taşırken değişen iki dosyada hata yoktur;
   required CI `4/4 SUCCESS`tır. Diff yalnız `bank.service.ts` ve hedef test dosyasıdır;
   iki dosya / 175 ekleme / 1 silmedir.
8. **Open-boundary preservation:** W2.2D-0 approved reconciliation merge'iyle
   `CLOSED / CANONICAL` olur. `Collection.confirmedAt` ve match-projection hardening bu
   patch'te yoktur. COL-RISK-G03
   `PARTIALLY MITIGATED — CONFIRMEDAT / PROJECTION HARDENING REMAINS` kalır. W2.2 ACTIVE;
   W2.2D-1 `OWNER GO REQUIRED / IMPLEMENTATION NOT AUTHORIZED`, W2.3
   `BLOCKED — W2.2 BOUNDARY PENDING` kalır.

### W2.2D-1R — schema-foundation gerçekleşmesinin tescili (2026-07-26)

```text
DISPOSITION       : MERGED_WITHOUT_MATCHING_GOVERNANCE_RECORD
RETROACTIVE AUTH  : ÜRETİLMEZ
KAYDEDEN          : agent, owner GO-COMPLETE altında
                    (T5-LIVE-PILOT-OWNER-DECISIONS-AND-PLAN-AUTHORING-R01)
```

`Collection.confirmedAt` kolonu ve migration'ı W2.2D-1 kapsamında **zaten icra
edilmiştir**:

```text
PR #1415 · squash 80a11c2a4dff047e86879d8628cdb090fae66743
merged   2026-07-18T18:35:53Z · branch codex/rc-col-w2-2d1-confirmed-at
migration 20260718210000_rc_col_w2_2d1_collection_confirmed_at_foundation
diff      schema.prisma +1 / migration.sql +3 — ADDITIVE, nullable, default yok
```

Merge anında yürürlükteki kayıt (`COLLECTION-GOVERNANCE.md §7.9`, commit
`1c73b7d9`, merge'den 85 dakika önce ve merge commit'inin **atası**) W2.2D-1'i
açıkça yetkilendirmiyordu. Bu kayıt o gerçeği değiştirmez.

**Bu tescil geçmişe dönük execution authority ÜRETMEZ.** Yalnız canonical
gerçekleşmeyi görünür kılar ve successor planlamasını açar (contract §15.4:
hesabı verilmemiş bir merge'in üzerine plan pinlenemez).

Kalan W2.2D-1 kapsamı — `confirmedAt` yazım semantiği, `status=CONFIRMED` iken
null olmasının anlamı, unapplied remainder/overpayment etkileşimi, projection
açığa çıkarma kuralları — **hâlâ owner gate'indedir**. `COL-RISK-G03`
`PARTIALLY MITIGATED` kalır.

### W2.2D-1A — CONFIRMED-AT CHARACTERIZATION (owner-authorized, test-only)

```text
STATUS            : OWNER-AUTHORIZED
PROFILE           : test-only successor
PRODUCTION MUT.   : YOK
SCHEMA/MIGRATION  : YOK
YENİ SEMANTİK     : ÜRETMEZ
```

Amaç, mevcut Collection confirmation davranışını **testlerle karakterize
etmektir**; yeni bir `confirmedAt` semantiği üretmek değildir. Karakterize
edilen mevcut gerçekler:

```text
"confirmed" kararı YALNIZ status üzerinden verilir (isConfirmedCollection)
admission confirmedAt yazmaz — kolon null kalır
status @default(CONFIRMED) ile confirmedAt=null birlikte var olabilir
confirmedAt effective-date authority DEĞİLDİR
```

**W2.2D-1A, W2.2D-1'in kalan semantik kararlarını KAPATMAZ** ve onun yerine
geçmez. W2.2D-1 gate'i açık kalır; W2.2E ve W2.3 statüleri bu kayıtla
değişmez.

## RCV-COL CROSS-DOMAIN — TPA-04C PROGRAM CLOSURE

```text
TPA-04C I01-I06 : CLOSED / CANONICAL EVIDENCE
TPA-04C I07     : SUPERSEDED / NOT REQUIRED IN TPA-04C
TPA-04C         : CLOSED / CANONICAL
INTEGRATION SEAM: TPA-04D
TPA-04D         : AUTHORIZED / DEPENDENCY-GATED / NOT YET ACTIVE
RUNTIME WRITER  : NOT IMPLEMENTED / NOT ACTIVATED
ACT-28          : OPEN
REC-AUTH-011/012: OPEN
NEXT PROGRAM TASK: RCV-COL-CURRENCY-BOUNDARY-01
```

Bu kayıt `RCV-COL-FULL-REMEDIATION-RATIFICATION-R01` owner authority’sini ve
`TPA-04C-I01..I06` canonical evidence zincirini reconcile eder. I07 yeni bir
implementation slice değildir; integration/persistence seam sorumluluğu TPA-04D’ye
taşınmıştır. Bu kapanış `LegalApplicationWriter` implementasyonu, runtime aktivasyonu,
consumer cutover, legacy retirement veya ACT-28 / REC-AUTH-011/012 closure üretmez.

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
W2.2C            : DECISION GATE SATISFIED — COL/OD-06A Option C; evidence writer + candidate transition present
W2.2C-1          : CLOSED / CANONICAL — PR #1369 @ e7d2f11d + reconciliation @ c20425ea
W2.2C-2          : CLOSED / CANONICAL — PR #1377 @ fcba6d98
W2.2C-3          : CLOSED / CANONICAL — PR #1382 @ be1771d3
W2.2C-4          : CLOSED / CANONICAL — PR #1391 @ facc7789
W2.2C-5          : CLOSED / CANONICAL — PR #1401 @ 0452e836
W2.2D-0          : CLOSED / CANONICAL — PR #1407 @ 1156e4de + reconciliation PR #1411 @ 1c73b7d9
W2.2D-1          : SCHEMA FOUNDATION CLOSED / CANONICAL EVIDENCE — PR #1415 @ 80a11c2a; confirmedAt runtime writer ayrı Task 07 RC-COL-W2.2D-2 kapsamındadır ve henüz uygulanmamıştır
W2.2D-1A         : CLOSED / CANONICAL EVIDENCE — test-only characterization PR #1660 @ 168daec7; runtime/schema etkisi yoktur
W2.2E            : NOT AUTHORIZED — W2.2D CONFIRMATION / ATOMIC PROJECTION BOUNDARY PENDING
W2.2             : ACTIVE — candidate/evidence/admission guard ile D-1 foundation ve D-1A evidence closed; confirmedAt writer, atomic projection, idempotency ve legal-application runtime zinciri açık
W2.3             : BLOCKED — W2.2 BOUNDARY PENDING
FULL REMEDIATION : TASK 01 TPA-04C CLOSURE CLOSED; TASK 02 CURRENCY BOUNDARY CLOSED PR #1822 @ 43e3c1f9; TASK 03 AUTOMATION CONSUMER CLOSED PR #1828 @ 518d08a2; TASK 04 GOVERNANCE RECONCILIATION CLOSED UPON APPROVED MERGE; NEXT TASK 05 RC-COL-W2.2B-R01
PHASE 2          : ACTIVE — TPA-04C CLOSED; TPA-04D AUTHORIZED / DEPENDENCY-GATED / NOT ACTIVE; runtime writer, representative evidence, cutover, legacy retirement ve ACT-28 / REC-AUTH-011/012 closure açık
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
