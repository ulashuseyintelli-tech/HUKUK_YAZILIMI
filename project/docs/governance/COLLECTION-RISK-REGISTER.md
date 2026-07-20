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
| COL-RISK-G03 | External-settlement finality sonrası canonical Collection confirmation ve unapplied payment lifecycle'ı eksik (overpayment ile örtük eşitlik riski) | COL/OD-06 Option A candidate-first/orthogonal contract ile COL/OD-06A Option C hybrid typed evidence + dedicated `bank.settlement.verify` authority contract'ı RECORDED. W2.2A PR #1332 / `88290071`: exact candidate enum + nullable/defaultsuz status, no backfill, legacy `NULL` unknown/not-SETTLED. W2.2B PR #1347 / `61b49ce0`: `INCOMING=PENDING`, `OUTGOING` lifecycle dışı; detection-only ve finansal etki sıfır. W2.2C-0 PR #1353 / `758f6186`: canonical Collection create için `SETTLED` zorunlu; unsettled/legacy adaylar fail-closed ve finansal write sıfır. W2.2C-1 PR #1369 / `e7d2f11d`: exact typed source/outcome enum'ları, immutable `BankSettlementEvidence`, tenant-scoped `(tenantId, idempotencyKey)`, nullable/defaultsuz tenant-safe transaction pointer, verifier actor check, supersession lineage/uniqueness ve UPDATE/DELETE immutable guard'ları additive olarak eklendi; backfill veya yeni evidence modelinde raw provider payload alanı yok. W2.2C-2 PR #1377 / `fcba6d98`: nullable/defaultsuz `BankTransaction.externalSettledAt` provenance alanı additive olarak eklendi; legacy `NULL`, no-backfill/no-default, tenant-safe evidence relation ve COL-TIME-001 `effectiveDate` exclusion kanıtlandı. W2.2C-3 PR #1382 / `be1771d3`: salt-okunur exact `bank.settlement.verify` boundary'si trusted tenant + aktif tenant-bound User/human profile + aktif `GLOBAL` grant ister; exact `DENY` precedence ve eksik/geçersiz/wrong-tenant/wrong-key/non-GLOBAL fail-closed davranışı kanıtlandı. W2.2C-4 PR #1391 / `facc7789`: yalnız human verifier typed evidence'ı transaction-bound allowlist audit ile append edilir; same-key/same-payload replay side-effect-free, same-key/different-payload conflict fail-closed, concurrent replay tek evidence/audit ve tenant isolation korunur; audit failure rollback eder. Candidate status/evidence pointer, Collection ve finansal/event/outbox kayıtları değişmez. W2.2C-5 PR #1401 / `0452e836`: exact verifier boundary ve same-tenant immutable evidence ile yalnız `PENDING` candidate üzerinde tenant-scoped CAS `SETTLED`/`REJECTED` transition uygular. Evidence pointer, status, `SETTLED` için `externalSettledAt=evidence.observedAt` ve allowlist audit transaction-atomic'tir; `REJECTED` settlement zamanı üretmez. Replay side-effect-free, conflict/legacy-NULL/terminal/OUTGOING fail-closed, concurrent yarışta tek transition kazanır ve audit failure tüm mutation'ı rollback eder. Collection, journal, event, outbox, ledger, allocation ve overpayment write'ı sıfırdır. W2.2D-0 PR #1407 / `1156e4de`: yeni Collection admission'ında exact `INCOMING + SETTLED + settlementEvidenceId` tuple'ını, same-tenant `SETTLEMENT_VERIFIER/SETTLED` evidence'ı ve `externalSettledAt=evidence.observedAt` bütünlüğünü zorunlu kılar. Existing-match replay guard'dan önce korunur; eksik/tutarsız tuple fail-closed ve Collection/journal/event/outbox/ledger/allocation/overpayment/ClaimItem/match-projection write'ı sıfırdır. Candidate finality ve evidence-integrity admission guard artık mevcuttur; `Collection.confirmedAt`, match-projection hardening ve application lifecycle hâlâ tamamlanmamıştır. Provider evidence finality desteğine kadar DEFERRED kalır. | **PARTIALLY MITIGATED — CONFIRMEDAT / PROJECTION HARDENING REMAINS** | W2.2A/W2.2B/W2.2C-0/W2.2C-1/W2.2C-2/W2.2C-3/W2.2C-4/W2.2C-5 CLOSED / CANONICAL; W2.2D-0 CLOSED / CANONICAL upon approved reconciliation merge; W2.2D-1 OWNER GO REQUIRED / IMPLEMENTATION NOT AUTHORIZED; W2.3 `BLOCKED — W2.2 BOUNDARY PENDING` |
| COL-RISK-G04 | Partial refund/reversal + downstream (disposition sonrası) reversal kontratı yok | COL/OD-01 Option A, confirmed/posted correction'ı linked full reversal + yeni canonical command ile sınırlar; partial/delta historical repair ayrı typed contract oluşana kadar fail-closed kalır. REC-AUTH-015 NO_GO; cancel-executor yalnız full. | **OPEN — FAIL-CLOSED BOUNDARY RECORDED / PARTIAL CONTRACT ABSENT** | COL/OD-01 RECORDED; COL/OD-09/-10 OPEN; W2.4 ve Phase 2 NOT AUTHORIZED |
| COL-RISK-G05 | valueDate/date çift-tarih için canonical effective-date policy yoktu (historical baseline; giderildi) | COL/OD-03 Option A + W2.1A PR #1315 / squash `1d5974e5`: explicit `LedgerEntry.effectiveDate` precedence, `entryDate` fallback, Ledger yoksa `Collection.date`, provenance exclusion ve invalid-date fail-closed; required CI 4/4 SUCCESS | **CLOSED — CONTRACT + CURRENT RUNTIME CHARACTERIZATION** | W2.1 CLOSED / CANONICAL upon approved reconciliation merge; test-only, runtime değişikliği yok; snapshot/backfill/cutover ayrı owner gate |
| COL-RISK-G06 | Official as-of/snapshot runtime'ı yok | TPA-04A Option C yalnız receipt-bound `CanonicalReceivableApplicationSnapshotV1` için eligibility, exact envelope, COL/OD-03 effective-date boundary, RCV-CAS/v1 serialization/hash, deterministic bucket identity ve fail-closed pure-plan contract'ını ratifiye eder. General presentation/Fee/Harç/Journal snapshot lifecycle açık; current Balance Engine SHADOW_ONLY; runtime snapshot/hash writer yoktur. | **PARTIALLY MITIGATED — NARROW CONTRACT RATIFIED / RUNTIME ABSENT** | REC-AUTH-024/025; REC-ALLOC-016; broader ADR-013 OPEN; TPA-04B+ owner-gated |
| COL-RISK-G07 | RECEIVABLE–COLLECTION legal-application persistence ve cutover zinciri tamamlanmadı | XD-001 boundary, TPA-02 aggregate, TPA-03 contract/03A schema foundation, TPA-04 writer contract ve TPA-04A receipt-bound canonical snapshot/bucket identity contract canonicaldır. `CanonicalReceivableApplicationSnapshotV1` exact eligibility/envelope, RCV-CAS/v1 identity ve pure-plan fail-closed sınırını taşır; ClaimItem/legacy target yasaktır. Ancak DB conservation/evidence amendment, plan builder, dormant writer, reversal writer, representative evidence, consumer cutover ve retirement henüz uygulanmamıştır. | **OPEN — PHYSICAL MODEL + FOUNDATION + WRITER/SNAPSHOT CONTRACTS CLOSED / IMPLEMENTATION + EVIDENCE + CUTOVER + RETIREMENT REMAIN** | ACT-28 / REC-AUTH-011/012 OPEN; `codex/rcv-ws04-p03-syn-01` writer/evidence/cutover için BLOCKING; PR #407 final disposition B: CLOSED / UNMERGED / REQUIREMENTS PRESERVED / CODE DISCARDED / EXTRACTION NONE; next TPA-04B schema-amendment analysis OWNER GO-ANALYZE REQUIRED / implementation NOT AUTHORIZED |

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
