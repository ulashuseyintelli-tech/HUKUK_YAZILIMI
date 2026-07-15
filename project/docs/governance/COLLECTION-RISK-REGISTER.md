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
`UNVERIFIED-THIS-PASS` (analiz bulgusu; bu turda yeniden üretilmedi).

---

## 1. BUG

| ID | Başlık | Kanıt | Statü | İlişki |
|---|---|---|---|---|
| COL-RISK-B01 | Çok-enstrüman template yalnız İLK CaseInstrument'ı basıyor (takip talebi / ödeme emri / icra emri belgeleri) | template-engine.service.ts:417 `findFirst`; tasarım: case-instrument-canonical-design.md:101/143-145 (fix=PR-N5, implement edilmemiş) | OPEN | Karar gerektirmez (GO-IMPLEMENT sınıfı); Desktop 04/A5 red testi planlı |
| COL-RISK-B02 | Eski `/uyap-export` şema-dışı `instrumentType ('CHECK'/'BOND')` okuyor → çek/senet çıktısı fiilen her zaman boş | uyap-case-mapper.service.ts:104-113; schema InstrumentType enum (CEK/SENET/BONO/POLICE) | OPEN-DELIBERATE (AS7: emekli edilmez, düzeltme ayrı PR) | COL/OD-11; W1.5 |

## 2. DRIFT

| ID | Başlık | Kanıt | Statü | İlişki |
|---|---|---|---|---|
| COL-RISK-D01 | Legacy rapor kendi basit faiz formülünü taşıyor | report.service.ts:674-680 | OPEN | COL/OD-16; W4.1 |
| COL-RISK-D02 | Legacy Hesap Özeti stub faiz + kendi oran formülleri (tazminat %10, komisyon 0.003, peşin harç 0.005, tahsil harcı 0.0455) primary payload olarak dönüyor | case.service.ts:3960-4008, 4097-4101 | OPEN | CAN-CUT-02; COL/OD-12/-16 |
| COL-RISK-D03 | Dağınık yerel faiz formülleri: expense-request, document, fee-engine controller, web yeni-dosya formu (lint kuralı var, legacy kullanımlar duruyor) | expense-request.service.ts:629; document.service.ts:78; fee-engine.controller.ts:280-281; cases/new/page.tsx:4870-4871; .eslintrc.js:28-35 | OPEN | COL/OD-14/-16 |
| COL-RISK-D04 | Canonical `CollectionService.create` dışında, aynı concurrency/idempotency kontratını taşımayan ikinci bir allocation giriş yolu bulunuyor — **P0 para bütünlüğü riski** | Ayrıntılı teknik kanıt (route/dosya-satır/reprodüksiyon) publication-safety gereği public governance'tan çıkarıldı; owner'a özel kanalda tutulur | OPEN — **handoff'ta olmayan YENİ bulgu** | COL/OD-04 + hedefli implementation patch (W1.2); TM3 §10 "ikinci tahsilat otoritesi yasağı" ile gerilim |
| COL-RISK-D05 | Üçüncü XML yolu: `GET /template-engine/case/:caseId/xml` kendi "UYAP uyumlu" XML'ini üretiyor | template-engine.controller.ts:537 | OPEN | COL/OD-11; W4.3 |

## 3. GAP

| ID | Başlık | Kanıt | Statü | İlişki |
|---|---|---|---|---|
| COL-RISK-G01 | Collection create/cancel audit yazımı YOK; correlationId/causationId AuditLog şemasında ve domain kodunda YOK; commandId hiç kullanılmıyor; x-request-id domain katmanına taşınmıyor (event-düzeyi causedBy VAR) | collection modülünde auditLog.create=0; schema.prisma:4926-4958; request-id.middleware.ts:7-19 | OPEN | COL/OD-05; W1.6 |
| COL-RISK-G02 | Allocation concurrency için açık bir kontrat yok: ana yolun koruması dolaylı bir yan etkiye dayanıyor ve yapı değişirse sessizce kaybolabilir — **P0 para bütünlüğü riski** | Ayrıntılı teknik kanıt (dosya-satır/reprodüksiyon) publication-safety gereği public governance'tan çıkarıldı; owner'a özel kanalda tutulur | OPEN | COL/OD-04 + hedefli implementation patch (W1.2) |
| COL-RISK-G03 | Unapplied payment lifecycle'ı yok (overpayment ile örtük eşitlik riski) | Vocabulary TARGET; runtime karşılığı yok | OPEN | COL/OD-06; W2.3 |
| COL-RISK-G04 | Partial refund/reversal + downstream (disposition sonrası) reversal kontratı yok | REC-AUTH-015 NO_GO; cancel-executor yalnız full | OPEN | COL/OD-09/-10; W2.4 |
| COL-RISK-G05 | valueDate/date çift-tarih tek authority'ye bağlanmamış; canonical effective-date policy yok | Master Analysis bulgusu (Desktop 01 §32) | UNVERIFIED-THIS-PASS | COL/OD-03; W2.1 |
| COL-RISK-G06 | Official as-of/snapshot yok | REC-AUTH-024/025; REC-GOV §14.4 | OPEN | COL/OD-13; W4.5 |
| COL-RISK-G07 | RECEIVABLE–COLLECTION allocation sınır reconciliation'ı açık | REC-AUTH-011 "TM3-ACT28-LEGAL RECONCILIATION OPEN"; REC-AUTH-012 "DUPLICATE ALLOCATOR DISPOSITION OWNER-HELD" | OPEN | Suite ratification + COL/OD-04 |

## 4. OWNER-GATE

| ID | Başlık | Kanıt | Statü | İlişki |
|---|---|---|---|---|
| COL-RISK-O01 | Runtime cutover 3 gate'e kilitli: ölçülmüş baseline + representative evidence (ABSENT/BLOCKING) + açık owner APPROVED | decision-log:15/48; ADR-014 status | OPEN | COL/OD-12 |
| COL-RISK-O02 | CAN-CUT-01 (Due/ClaimItem) ve CAN-CUT-02 (Hesap Özeti) cutover kayıtları açık | canonicalization-register.md:38-39/87/109 | OPEN | COL/OD-16 |
| COL-RISK-O03 | ADR-013 fee/harç TO-BE seçimi + boundary audit kapanmadan fee implementation BLOCKED | ADR-013 non-authorization clause | OPEN | COL/OD-14 |
| COL-RISK-O04 | Client-settlement lane çelişkisi COL/OD-18 amendment ile **CODEX — EXCLUSIVE** olarak karara bağlandı; Claude analysis/review/architectural validation rolündedir ve tek aktif writer/worktree kuralı korunur | COL-BOUNDARY-CONFLICT-001; önceki Claude-exclusive kayıt tarihsel olarak korunur ve explicit supersession Decision Log'a eklenmiştir | OPEN | COL/OD-18 amendment; CANONICAL AMENDMENT MERGE PENDING, approved merge sonrası lane riski kapanır |

## 5. TEST-LIMITATION

| ID | Başlık | Kanıt | Statü | İlişki |
|---|---|---|---|---|
| COL-RISK-T01 | Farklı-key CONCURRENT allocation/ClaimItem race testi yok (aynı-key race ve farklı-key sequential testleri VAR) | collection-payment-received.integration.spec.ts:390/418; grep race/concurrent=0 hedefli senaryoda | OPEN | Desktop 04/A2 harness planlı |
| COL-RISK-T02 | Mid-transaction rollback (orphan satır) harness'ı yok | Desktop 04/A3 planlı | OPEN | COL-INV-031 kanıtı |
| COL-RISK-T03 | Money-out sequential+concurrent replay harness'ı yok (kontrat kodda mevcut, kanıt paketi yok) | Desktop 04/A4 planlı; kontrat kanıtı: client-payout.service.spec.ts:373-419/719-739 (birim düzeyi VAR) | OPEN | W1.3 BLOCKED — CANONICAL AMENDMENT MERGE PENDING; COL/OD-18 amendment; COL/OD-21 |
| COL-RISK-T04 | Master Analysis'in "2.200 test pass / gerçek DB" kanıtı bu hesapta yeniden koşulmadı; golden JSON EOL determinism doğrulanmadı | Synthesis §3 evidence limitations | OPEN | Desktop 04/A1 |
| COL-RISK-T05 | Kuruş remainder davranışı ledger yazım hattında hedefli testle sabitlenmedi (calc-core tarafında cent hardening VAR — PR #1101) | COL-INV-023 CURRENT-PARTIAL | OPEN | W1.1 |

---

## 6. Sınıf-dışı bırakılanlar (bilinçli)

- Money-out idempotency eksikliği — handoff iddiasıydı; repo'da KAPALI bulundu (F-12).
  Risk satırı açılmadı; kalan iş yalnız text-ratification (COL/OD-21).
- ADR-014 calc-core iç riskleri — ADR-014/split-plan kendi register'ında izlenir; bu dossier
  çift kayıt açmaz (SDOM tek-yetkili-belge kuralı).
