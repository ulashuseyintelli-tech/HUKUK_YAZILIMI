# COLLECTION RISK REGISTER

## Tahsilat Domaini — Risk / Drift / Gap Dossier'i

```text
Belge yolu              : project/docs/governance/COLLECTION-RISK-REGISTER.md
Durum                   : CANONICAL DOMAIN RISK DOSSIER
Sınıf                   : DOMAIN RISK DOSSIER — global triage/execution status otoritesi
                          DEĞİLDİR; global durum yalnız master-triage-register.md'den türetilir
                          (OFFICE-RISK-REGISTER ile aynı sınıf ve sınır)
Owner Status            : OWNER-APPROVED CANONICALIZATION (2026-07-13)
Repository Status       : CANONICAL UPON APPROVED MERGE TO MAIN
Kanıt tabanı            : repo main @ beb7d673 (2026-07-13, salt-okuma doğrulama)
IMPLEMENTATION AUTHORITY: NONE — hiçbir satır kendiliğinden iş açmaz; her düzeltme ayrı
                          GO yetkisi ve (varsa) owner kararı ister
```

Sınıflar: `BUG` (yanlış davranış) · `DRIFT` (canonical hedeften sapmış canlı yol) ·
`GAP` (eksik kontrat/mekanizma) · `OWNER-GATE` (owner kararı olmadan kapatılamaz) ·
`TEST-LIMITATION` (kanıt eksikliği; davranış iddiası değil).

Statüler: `OPEN` · `OPEN-DELIBERATE` (bilinçli owner kararıyla açık) ·
`UNVERIFIED-THIS-PASS` (analiz bulgusu; bu turda yeniden üretilmedi) ·
`CLOSED` (kanıtla giderildi; historical baseline ilgili satırda korunur).

---

## 1. BUG

| ID | Başlık | Kanıt | Statü | İlişki |
|---|---|---|---|---|
| COL-RISK-B01 | Çok-enstrüman template yalnız İLK CaseInstrument'ı basıyordu (historical baseline; giderildi) | W1.4 `findMany` + deterministic order + single/multi-instrument regression: PR #1229, squash `4c1968ce56e668faa208aee53f9ecd96063edf9d` | **CLOSED** | Tüm CaseInstrument kayıtları template modeline taşınır; single-instrument compatibility preserved |
| COL-RISK-B02 | Eski `/uyap-export` canonical instrument verisini üretemiyor; sessiz boş kambiyo çıktısı historical riskti | Underlying schema/route mismatch devam eder. W1.5 PR #1236 / `fbef6915` geçerli non-instrument legacy flow'u koruyup kambiyo/ClaimItem/CaseInstrument gerektiren unsupported akışı açık hata ile fail-closed containment altına aldı. | **OPEN-DELIBERATE — CONTAINED / NOT REMEDIATED** | COL/OD-11 kalıcı route disposition'ı; W1.5 containment CLOSED, defect/remediation OPEN |

## 2. DRIFT

| ID | Başlık | Kanıt | Statü | İlişki |
|---|---|---|---|---|
| COL-RISK-D01 | Legacy rapor kendi basit faiz formülünü taşıyor | report.service.ts:674-680 | OPEN | COL/OD-16; W4.1 |
| COL-RISK-D02 | Legacy Hesap Özeti stub faiz + kendi oran formülleri (tazminat %10, komisyon 0.003, peşin harç 0.005, tahsil harcı 0.0455) primary payload olarak dönüyor | case.service.ts:3960-4008, 4097-4101 | OPEN | CAN-CUT-02; COL/OD-12/-16 |
| COL-RISK-D03 | Dağınık yerel faiz formülleri: expense-request, document, fee-engine controller, web yeni-dosya formu (lint kuralı var, legacy kullanımlar duruyor) | expense-request.service.ts:629; document.service.ts:78; fee-engine.controller.ts:280-281; cases/new/page.tsx:4870-4871; .eslintrc.js:28-35 | OPEN | COL/OD-14/-16 |
| COL-RISK-D04 | Canonical `CollectionService.create` dışında ikinci allocation write path'i vardı (historical baseline; giderildi) | COL/OD-04 disposition **CLOSE**; W1.2 PR #1279 / squash `6c2329dc` standalone route/service write'ını fail-closed kapattı ve allocator kullanımını canonical transaction + same-case lock sınırına çekti | **CLOSED** | Canonical Collection path preserved; TM3 §10 tek-yazıcı kuralı uygulanıyor |
| COL-RISK-D05 | Üçüncü XML yolu: `GET /template-engine/case/:caseId/xml` kendi "UYAP uyumlu" XML'ini üretiyor | template-engine.controller.ts:537 | OPEN | COL/OD-11; W4.3 |

## 3. GAP

| ID | Başlık | Kanıt | Statü | İlişki |
|---|---|---|---|---|
| COL-RISK-G01 | Collection mutation audit/correlation capture eksikti (historical baseline; giderildi) | COL/OD-05 + W1.6 PR #1246 / squash `c7f55da4`: create/gerçek update/başarılı void transaction-bound audit; correlation/command/causation propagation; allowlist-only; audit failure atomic rollback; replay/no-op duplicate yok | **CLOSED** | Schema/migration yok; Collection mutation kapsamı canonical capture altında |
| COL-RISK-G02 | Allocation concurrency için açık kontrat eksikliği (historical baseline; giderildi) | COL/OD-04 same-case transaction advisory lock scope/key/boundary/failure/retry kontratı + W1.2 PR #1279 runtime enforcement | **CLOSED** | Canonical lock contract ve secondary-path closure canonical main'de |
| COL-RISK-G03 | External-settlement finality sonrası canonical Collection confirmation ve unapplied payment lifecycle'ı eksik (overpayment ile örtük eşitlik riski) | COL/OD-06 Option A candidate-first/orthogonal contract ile COL/OD-06A Option C hybrid typed evidence + dedicated `bank.settlement.verify` authority contract'ı RECORDED. W2.2A–W2.2C-5 candidate/evidence/permission/transition zinciri ve W2.2D-0 evidence-integrity admission guard canonical main'dedir. W2.2D-1 PR #1415 / `80a11c2a` nullable/defaultsuz/backfillsiz `Collection.confirmedAt` schema foundation'ını; W2.2D-1A PR #1660 / `168daec7` provenance exclusion ve fail-closed karakterizasyon kanıtını kurmuştur. W2.2D-2 PR #1944 / `6732ebcd` future CONFIRMED Collection writer yüzeylerinde server-authoritative, immutable ve replay-stable `confirmedAt` üretimini; pre-side-effect readback guard'ını, audit eşleşmesini ve static writer envanterini canonical kılmıştır. Historical guessed backfill, schema/migration ve live DB işlemi yoktur. W2.2D-3 PR #1969 / `392e831c` bank eligibility, canonical Collection admission, financial/event/outbox effects, CAS match projection ve audit'i tek Prisma/PostgreSQL transaction'ında atomik kılmış; rollback, replay ve concurrency evidence sağlamıştır. RCV-COL-IDEM-01 PR #2001 / `6c34395d` versioned `RCV-COL-CMD/v1` canonical payload + domain-separated SHA-256 ile tam semantik command fingerprint, same-command replay, divergent-command fail-closed conflict, legacy-unknown rejection ve Task08 shared-transaction preservation kanıtını kurmuştur; additive evidence migration'ı repository-ready, live DB apply yapılmamıştır. Provider evidence finality desteğine kadar DEFERRED kalır. | **PARTIALLY MITIGATED — ATOMIC ADMISSION CLOSED / PROVIDER FINALITY + LEGAL APPLICATION REMAIN** | W2.2D-1 / W2.2D-1A / W2.2D-2 CLOSED / CANONICAL EVIDENCE; Task 07 `RC-COL-W2.2D-2` CLOSED; Task 08 `RC-COL-W2.2D-3` CLOSED / CANONICAL EVIDENCE; Task 09 `RCV-COL-IDEM-01` CLOSED / CANONICAL EVIDENCE PR #2001 @ 6c34395d; Task 10 `TPA-04F-ENTRY` implementation evidence PR #2036 @ `624f27ee` canonical, governance closeout active; Task 11 `TPA-04D-I01` successor / NOT STARTED; Task 15 real replay evidence `NOT YET SATISFIED`; W2.2 ACTIVE, W2.3 `BLOCKED — W2.2 BOUNDARY PENDING` |
| COL-RISK-G04 | Partial refund/reversal + downstream (disposition sonrası) reversal kontratı yok | COL/OD-01 Option A, confirmed/posted correction'ı linked full reversal + yeni canonical command ile sınırlar; partial/delta historical repair ayrı typed contract oluşana kadar fail-closed kalır. REC-AUTH-015 NO_GO; cancel-executor yalnız full. | **OPEN — FAIL-CLOSED BOUNDARY RECORDED / PARTIAL CONTRACT ABSENT** | COL/OD-01 RECORDED; COL/OD-09/-10 OPEN; W2.4 ve Phase 2 NOT AUTHORIZED |
| COL-RISK-G05 | valueDate/date çift-tarih için canonical effective-date policy yoktu (historical baseline; giderildi) | COL/OD-03 Option A + W2.1A PR #1315 / squash `1d5974e5`: explicit `LedgerEntry.effectiveDate` precedence, `entryDate` fallback, Ledger yoksa `Collection.date`, provenance exclusion ve invalid-date fail-closed; required CI 4/4 SUCCESS | **CLOSED — CONTRACT + CURRENT RUNTIME CHARACTERIZATION** | W2.1 CLOSED / CANONICAL upon approved reconciliation merge; test-only, runtime değişikliği yok; snapshot/backfill/cutover ayrı owner gate |
| COL-RISK-G06 | Official as-of/snapshot runtime'ı yok | TPA-04A Option C receipt-bound `CanonicalReceivableApplicationSnapshotV1` eligibility/identity kontratını; TPA-04B ise exact canonical TEXT payload ve required/default-free/no-backfill persistence contract'ını ratifiye eder. PR #1470 / `9dabe8db` bu evidence persistence amendment'ını exact iki dosyada kurmuştur. General presentation/Fee/Harç/Journal snapshot lifecycle açık; current Balance Engine SHADOW_ONLY; runtime snapshot/hash writer yoktur. | **PARTIALLY MITIGATED — NARROW CONTRACT + PERSISTENCE PRESENT / RUNTIME ABSENT** | REC-AUTH-024/025; REC-ALLOC-016/017; broader ADR-013 OPEN; TPA-04C+ owner-gated |
| COL-RISK-G07 | RECEIVABLE–COLLECTION legal-application persistence ve cutover zinciri tamamlanmadı | XD-001 boundary, TPA-02 aggregate, TPA-03/03A foundation, TPA-04 writer contract, TPA-04A snapshot/bucket identity ve TPA-04B evidence persistence canonicaldır. M2 live DB'de applied/post-validated; target tablolar empty ve backfill none'dır. TPA-04C I01–I06 PR #1517 / `568f76e1`, #1520 / `d46df4ce`, #1535 / `719e6898`, #1546 / `b3b0fa5b`, #1558 / `be60c149` ve #1571 / `1d042280` ile complete; I07 `SUPERSEDED / NOT REQUIRED IN TPA-04C`; TPA-04C execution PR #1815 / `4bf75df8` ve immutable result PR #1816 / `2c6fa957` ile `CLOSED / CANONICAL`dır. TPA-04D integration seam'i owner-ratified program altında `AUTHORIZED / DEPENDENCY-GATED / NOT ACTIVE`dir. TPA-04F-ENTRY PR #2036 / `624f27ee09297ccc895155e6d65c00ce08dc6db7` ile `RCV-REP-CORPUS/v1` deterministic representative corpus foundation'ı, 19 scenario ve pinned SHA-256 `0e0d5f1db96d7f0b8f204307cb2b9e73d57b89a04194b93dc6c4ffc80a10f05e` canonical evidence oldu. Legacy ClaimItem-keyed synthetic corpus `PRESERVED / SUPERSEDED_FOR_TARGET_AUTHORITY / HISTORICAL_BASELINE / NON_AUTHORITATIVE / NO_MUTATION`dır. Official snapshot producer, `LegalApplicationWriter`, persistence/atomic transaction, Task15 real representative replay, consumer cutover, full reversal ve retirement hâlâ yoktur. | **OPEN — PHYSICAL MODEL + CORPUS FOUNDATION + PURE PLAN COMPLETE / SNAPSHOT PRODUCER + WRITER + REAL REPLAY + CUTOVER + REVERSAL + RETIREMENT REMAIN** | ACT-28 / REC-AUTH-011/012 OPEN; legal-application runtime writer `NOT IMPLEMENTED / NOT ACTIVATED`; Task10 TPA-04F-ENTRY implementation evidence PR #2036 @ `624f27ee` canonical, governance closeout active; Task11 TPA-04D-I01 successor / NOT STARTED; Task15 real replay evidence `NOT YET SATISFIED`; legacy synthetic corpus preserved ve target authority değildir; PR #407 CLOSED/UNMERGED/NO FURTHER ACTION |

## 4. OWNER-GATE

| ID | Başlık | Kanıt | Statü | İlişki |
|---|---|---|---|---|
| COL-RISK-O01 | Runtime cutover 3 gate'e kilitli: ölçülmüş baseline + representative evidence (ABSENT/BLOCKING) + açık owner APPROVED | decision-log:15/48; ADR-014 status | OPEN | COL/OD-12 |
| COL-RISK-O02 | CAN-CUT-01 (Due/ClaimItem) ve CAN-CUT-02 (Hesap Özeti) cutover kayıtları açık | canonicalization-register.md:38-39/87/109 | OPEN | COL/OD-16 |
| COL-RISK-O03 | ADR-013 fee/harç TO-BE seçimi + boundary audit kapanmadan fee implementation BLOCKED | ADR-013 non-authorization clause | OPEN | COL/OD-14 |
| COL-RISK-O04 | Client-settlement lane çelişkisi (historical baseline; owner kararıyla giderildi) | COL/OD-18 RECORDED → COL/OD-18A AMENDED: implementation=Codex, Claude=analysis/review, tek aktif writer, paralel yazım PROHIBITED; PR #1257 main@`c4ee2332`. W1.3 bu lane altında closed/canonical. | **CLOSED — OWNER-DECIDED / CANONICAL** | COL/OD-18 → COL/OD-18A; supersession geçmişi korunur |

## 5. TEST-LIMITATION

| ID | Başlık | Kanıt | Statü | İlişki |
|---|---|---|---|---|
| COL-RISK-T01 | Farklı-key concurrent allocation/ClaimItem race test eksikliği (historical baseline; giderildi) | Gerçek PostgreSQL, gerçek `CollectionService.create` zinciri, aynı Case/ClaimItem ve farklı idempotency key: 10/10 PASS; PR #1217, squash `4e8243e507b9887101600f6bef00e3ad5cc5b465` | **CLOSED** | A2 race safety confirmed; COL/OD-04 karar girdisi |
| COL-RISK-T02 | Mid-transaction rollback orphan-row harness eksikliği (historical baseline; giderildi) | Gerçek PostgreSQL + gerçek Collection transaction zinciri; deterministic post-allocation failure; finansal satırlar ve ClaimItem rollback, orphan none; PR #1220, squash `c46de4319de1e13063237d168cdffd207f525ceb` | **CLOSED** | Atomicity confirmed; test-only, runtime impact yok |
| COL-RISK-T03 | Money-out sequential+concurrent replay harness eksikliği (historical baseline; giderildi) | Baseline: Desktop 04/A4 planlıydı; yalnız `client-payout.service.spec.ts:373-419/719-739` birim kanıtı vardı. Closure: gerçek PostgreSQL ve gerçek payout call chain'i üzerinde sequential+concurrent same-key replay harness'ı; 10/10 run PASS; PR #1265, squash `081bd9615429d24a6a205a2e6740daf2fd549770`; idempotency confirmed, concurrency safe, duplicate payout none. | **CLOSED** | W1.3 **CLOSED / CANONICAL**; `COL/OD-21` money-out idempotency contract **RECORDED** |
| COL-RISK-T04 | Master Analysis'in "2.200 test pass / gerçek DB" kanıtı bu hesapta yeniden koşulmadı | Golden JSON/NDJSON EOL determinism bölümü PR #1214 / squash `bb9c1973` ile cross-platform SHA-256 equality, zero CRLF, terminal LF ve parse kanıtıyla giderildi; geniş 2.200-test iddiası bu hesapta yeniden koşulmadı. | **OPEN — PARTIALLY RECONCILED** | A1 CLOSED; kalan risk yalnız geniş historical evidence limitation |
| COL-RISK-T05 | Kuruş remainder davranışı ledger yazım hattında hedefli testle sabitlenmemişti (historical baseline; giderildi) | Gerçek Collection→ledger allocation zincirinde exact decimal allocation/remaining/overpayment testi; 10/10 deterministic; PR #1223, squash `5fe5f0eb8a3553d817b97a3f03c12da3ae0a66bf` | **CLOSED** | W1.1 exact-money confirmed |

---

## 6. Sınıf-dışı bırakılanlar (bilinçli)

- Money-out idempotency eksikliği — handoff iddiasıydı; repo'da KAPALI bulundu (F-12).
  COL/OD-21 contract RECORDED; risk satırı açılmaz. Harici banka/provider transfer lifecycle'ı
  bu kararın kapsamı dışındadır ve bu dossier'de çözülmüş sayılmaz.
- ADR-014 calc-core iç riskleri — ADR-014/split-plan kendi register'ında izlenir; bu dossier
  çift kayıt açmaz (SDOM tek-yetkili-belge kuralı).
