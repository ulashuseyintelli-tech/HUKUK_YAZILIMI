# C1-B01 — FRESH BASELINE + COVERAGE MATRIX (P0)

```text
PROGRAM:       CLIENT-ACCOUNTING-DELIVERY-AND-OFFICE-UX-PROGRAM-R01
PAGE:          CLAUDE-C1 (CLAUDE-C1-BASELINE-AND-CERTIFICATION.md)
BLOCK:         C1-B01 — docs-only · ANALYSIS_DELIVERED
BASELINE:      origin/main afd84aee19ee338b8bf3655df1188b2eb82efb20 (fresh fetch, VERIFIED)
ANCESTRY:      #2265/bccfe1e7 ANCESTOR_OK · #2262/94ddb975 ANCESTOR_OK (VERIFIED)
KAPALI PROGRAM:CLIENT-MODULE-TERMINAL-COMPLETION-PROGRAM-R01/MASTER-PLAN.md:1198
               "TERMINAL_CLOSED / PRODUCTION_VERIFIED / CANONICAL (2026-08-07)"
               (salt-okuma OBSERVED — dosyaya DOKUNULMADI)
BAYAT KAYIT REDDİ (master plan gereği bu sayfada kayıt):
               `f34c371a` tabanlı analiz ve "WAVE 4 açık" ifadesi YÜRÜTME GERÇEĞİ
               SAYILMAZ. Esas: #2262 / 94ddb975 ve sonrası.
RUNTIME PROBE: Web dev server 3002 LISTENING + HTTP 200 (VERIFIED, salt-okuma).
               API 3001 DİNLEMİYOR (curl exit 7). → API-bağımlı runtime hücreleri
               UNKNOWN (gerekçe: çalışan API yok; .env/secret OKUNMADI).
ÖLÇÜM YÖNTEMİ: repository statik kanıt (exact dosya:satır) + salt-okuma runtime probe.
               PR açıklaması/konuşma iddiası kanıt SAYILMADI.
```

## 1. COVERAGE MATRIX — 13 hareket × 10 sütun

Kısaltmalar: `RV` = var ve runtime-visible · `VB` = var fakat bağlı değil ·
`YOK` · `UNKNOWN(gerekçe)`. Her hücrede exact referans; uzun referanslar §2'de.

| Hareket | Veri modeli | API | Ofis ekranı | Portal | Olay maili | Dönemsel mail | PDF | Audit | Yetki |
|---|---|---|---|---|---|---|---|---|---|
| Tahsilat | VAR (Collection :2716) | VAR (collections CRUD+cancel; movements projeksiyonu) | VAR (ClientMovementsTable :44; CariView :151) | KISMEN (yalnız FD türevi totalCollected) | KISMEN (COLLECTION_INFO şablonu :247-262; içerik üretimi yok) | YOK | YOK | VAR (:944/:1172/:286) | VAR (jwt + receipt-scope authz :119) |
| Müvekkil payı | VAR (CLIENT_PAYABLE :9522; :5098) | VAR (disposition recommend/approve/post; summary/movements) | VAR (CariView :107/:198) | VAR (FD :42/:93-97) | KISMEN (FD publish maili — operatör metni, üretilmiyor) | YOK | YOK | **YOK (disposition-posting audit grep=0)** | VAR (prepare/approve/post eligibility; Cpe dormant) |
| Vekâlet ücreti | VAR (:9523/:5099 + CaseFeeAgreement :9691) | VAR (fee-agreement CRUD + disposition satırı + allocation) | **YOK (cari'de 0 eşleşme)** | VAR (FD :43-44; STATUTORY etiketi ofiste hiç yok) | YOK | YOK | YOK | KISMEN (fee-agreement VAR; disposition satırı YOK) | VAR (assertCanManage → isApproverEligible) |
| Masraf | VAR (ExpenseRequest :4604; :5092-5101) | VAR (movements read; case-balance debit W) | VAR (CariView :109-111; kartlar) | KISMEN (yalnız Masraf Mahsubu :45) | VAR (EXPENSE_* şablonları + expense-request :1314-1367) | YOK | YOK | **YOK (case-balance audit grep=0)** | **ZAYIF (case-balance yalnız jwt :11)** |
| Avans | VAR (ADVANCE_CREDIT :5090; CREDIT :7354) | VAR (balance/credit W :41) | VAR (CariView :153; Kart 4) | YOK | YOK | YOK | YOK | **YOK** | **ZAYIF (yalnız jwt)** |
| İade | VAR (REFUND :5094/:7357) | **YOK-YAZIM (REFUND yazan route yok); okuma VAR** | KISMEN (yalnız durum etiketi :54/:66) | YOK | YOK | YOK | YOK | YOK | n/a (route yok) |
| Mahsup | VAR (ClientOffset :5121; :5107-5110) | VAR (eligibility/preview/create/reverse) | VAR (OffsetDrawer tam akış) | KISMEN (yalnız sonuç satırı) | YOK | YOK | YOK | VAR (:392/:515; preview audit'siz — sözleşme) | VAR (assertOfficeAdmin :170-178) |
| Reversal | KISMEN (POSTED finansal reversal ekstreye yazılmaz; marker :9559-9564) | VAR (4 zincir: void/storno/payout-manual/FD) | VAR (OffsetDrawer :399-416; supersede) | VAR (salt görüntü :51-52) | YOK | YOK | YOK | KISMEN (a/c/d VAR; b domain-event storno audit'i doğrulanmadı→UNKNOWN) | VAR (approval/officeAdmin/eligibleActor) |
| Payout | VAR (ClientPayout :9727; :5103) | VAR (request/finalize/list) | VAR (modal+pending+tablo) | YOK | YOK | YOK | YOK | VAR (:418 fail-closed) | VAR (assertOfficeAdmin + approval policy) |
| Tahakkuk faizi | **YOK müvekkil hattında** (alacak hattında VAR :6008-6027, :8618) | **YOK hedef modüllerde (grep=0; interestAmount=0 stub :414/:1557)** | YOK | YOK (statik faiz bilgisi hariç) | YOK | YOK | YOK | n/a | n/a |
| Tahsil edilmiş faiz | KISMEN (yalnız AllocationType.INTEREST :3018 türetimi) | KISMEN (allocation kırılımı olarak) | YOK | YOK | YOK | YOK | YOK | KISMEN (kırılım metadata'da yok :88-107) | VAR (#1 ile aynı) |
| Düzeltme | VAR (ADJUST :5095; supersede :5027) | KISMEN (statement supersede/void + FD reverse/supersede VAR; BalanceLedger ADJUST route YOK :454) | KISMEN (supersede UI VAR; bağımsız düzeltme kaydı yok) | VAR (salt görüntü :51/:113) | YOK | YOK | YOK | KISMEN (statement/FD VAR; ADJUST n/a) | KISMEN (statement zayıf — aşağı) |
| Opening/closing/running | VAR (:5022/:5023/:5072) | VAR (generate/supersede/void/read; preview YOK) | VAR (Statement bölümleri; movements'ta KASITLI yok) | **YOK** | KISMEN (STATEMENT_READY yalnız case-level create; closingBalance düz metin) | **YOK (cron 33/33 bağsız)** | **YOK** | VAR (GENERATED aynı tx :113/:187) | **ZAYIF (yalnız jwt :23; eligibility grep=0)** |

RV/VB notu: Ofis ekranı hücrelerindeki VAR = koda bağlı (route'tan render, VB üstü);
gerçek runtime görünürlüğü API kapalı olduğundan bu oturumda EXERCISE EDİLEMEDİ →
runtime-visible doğrulaması C1-B03 (UAT) hücresine kalır (UNKNOWN değil, ertelenmiş
doğrulama). Portal FD sayfası kod-bağlı + PortalAuthGuard'lı; aynı erteleme geçerli.

## 2. SÜTUN KANITLARI

### 2.1 VERİ MODELİ (schema.prisma @ afd84aee — TAM kanıt)

- `ClientStatement` :5007-5046 — `periodStart` :5019 · `periodEnd` :5020 ·
  `openingBalance` :5022 · `closingBalance` :5023 · status/supersede/void :5026-5031 ·
  başlık immutable (":5036 updatedAt YOK").
- `ClientStatementLine` :5050-5081 — `lineType` :5056 · `debit` :5070 · `credit` :5071 ·
  `runningBalance` :5072 · refType :5058 ('BalanceLedger'|'ExpenseRequest'|
  'ExpensePayment'|'CollectionDispositionLine').
- `ClientStatementLineType` :5089-5111 — **16 üye** (ADVANCE_CREDIT :5090 ·
  CLIENT_PAYMENT :5091 · EXPENSE_ACTUAL :5092 · EXPENSE_REQUESTED :5093 · REFUND :5094 ·
  ADJUST :5095 · CASE_COLLECTION_PAYABLE :5098 · CONTRACTUAL_FEE_WITHHELD :5099 ·
  FIRM_EXPENSE_REIMBURSEMENT :5100 · CLIENT_EXPENSE_REIMBURSEMENT :5101 ·
  COLLECTION_OFFSET_ADVANCE :5102 · CLIENT_PAYOUT_SENT :5103 ·
  CLIENT_OFFSET_{PAYABLE,EXPENSE}_{APPLIED,REVERSED} :5107-5110).
  **FAİZ ÜYESİ YOK** (negatif kanıt: :5089-5111 aralığında interest/faiz 0 eşleşme).
  NOT: master plan §1-A "17 üye" der; fresh main'de sayım **16** (VERIFIED) — sayım
  farkı bulgu olarak kaydedildi (§4/F-3).
- `CollectionDispositionLineType` :9521-9529 — **7 üye** (CLIENT_PAYABLE :9522 ·
  CONTRACTUAL_FEE_WITHHELD :9523 · FIRM_EXPENSE_REIMBURSEMENT :9524 ·
  CLIENT_EXPENSE_REIMBURSEMENT :9525 · OFFSET_CLIENT_ADVANCE :9526 ·
  HELD_PENDING_DISTRIBUTION :9527 · OTHER :9528). **FAİZ YOK.**
- Çift-sayım emsali :5102 (aynen): `COLLECTION_OFFSET_ADVANCE // avans mahsubu (BİLGİ;
  bakiye etkisi BalanceLedger'dan, çift-sayım yok)` → POL-2'nin şemadaki emsali.
- `ClientFinancialDisclosure` :10239-10275 (`currentVersionId @unique` :10260 ·
  `@@unique([tenantId, collectionDispositionId])` :10271 idempotency çapası) ·
  `...Version` :10292-10388 — iki aşamalı onay: ofis :10331-10333, içerik :10336-10342;
  mühürleme `snapshotHash` :10324 + `sourceFingerprint` :10325; gönderim kanıtı
  :10346-10356 (`sendIdempotencyKey` :10346, `providerMessageId` :10350); reversal/
  supersession :10359-10366. `notificationContent` :10336 **serbest metin** (X2 hedefi).
- `...Line` :10403-10431 — `type CollectionDispositionLineType` :10412; **§35.17 owner
  kararı :10401**: "ana para/faiz/vergi gibi LEDGER-SEVİYELİ kırılım V1 DIŞINDADIR".
- Faiz altyapısı (ALACAK/LEDGER hattında VAR, müvekkil-muhasebe hattında YOK):
  `AllocationType.INTEREST` :3018 · `CollectionAllocation.allocationType` :2798 ·
  `LegalApplicationComponentType.ACCRUED_INTEREST` :2847 · `ClaimItemType.INTEREST/
  PRE_INTEREST/POST_INTEREST` :6369-6371 · `ClaimItem.interest*` :6008-6027 ·
  `InterestCalculationLog` :8618 (`totalInterest` :8626) · `InterestSegmentLog` :8644 ·
  `InterestTypeCode` :8575-8586 (11 üye). Adlandırılmış `collectedInterest`/
  `interestAmount` alanı YOK (grep 0).
  Negatif kanıt taranan bloklar: ClientStatement* :5007-5111 · ClientOffset :5121-5158 ·
  BalanceLedger* :7320-7358 · CollectionDisposition* :9521-9615 · ClientPayout* :9727-9840 ·
  ClientFinancialDisclosure* :10239-10431 (tek istisna :10401 kapsam-dışı yorumu).
- Hareket-bazlı model eşlemesi (özet):
  tahsilat → `Collection` :2716 + `CollectionType.TAHSILAT` :4228 (ekstreye yalnız
  dağıtım proceeds'i olarak girer: CASE_COLLECTION_PAYABLE :5098) · müvekkil payı →
  CLIENT_PAYABLE :9522 / CASE_COLLECTION_PAYABLE :5098 · vekâlet ücreti →
  CONTRACTUAL_FEE_WITHHELD :9523/:5099 + `CaseFeeAgreement` :9691 · masraf →
  `ExpenseRequest` :4604 + `ExpensePayment` :4745 + :5092-5093/:5100-5101 · avans →
  ADVANCE_CREDIT :5090 + `BalanceLedgerType.CREDIT` :7354 · iade → REFUND :5094/:7357 ·
  mahsup → `ClientOffset` :5121 + :5107-5110 + OFFSET_CLIENT_ADVANCE :9526 · reversal →
  kaynak tarafta zengin (LedgerEntryType.REVERSAL :6352 · ExpensePaymentReversal :4780 ·
  ClientPayoutManualReversal :9808); **POSTED disposition finansal reversal'ı ekstreye
  YAZILMAZ — yalnız manuel marker** :9559-9564 · payout → `ClientPayout` :9727 +
  CLIENT_PAYOUT_SENT :5103 · tahakkuk faizi → müvekkil hattında YOK (yukarıda) ·
  tahsil edilmiş faiz → yalnız `AllocationType.INTEREST` :3018 türetimi, adlandırılmış
  kolon YOK · düzeltme → ADJUST :5095 + supersede zinciri :5027-5028 · opening/closing/
  running → :5022/:5023/:5072 (kanonik kaynak BalanceLedger, :5002-5003).

### 2.2 API + AUDIT + YETKİ (apps/api/src/modules @ afd84aee — özet; hücre ref'leri matriste)

**Route yüzeyleri:** collections CRUD+cancel (`collection.controller.ts:40-162`) ·
dispositions recommend/approve/post + outstanding (`disposition.controller.ts:36-111`) ·
client-accounting summary/movements (`client-accounting.controller.ts:39-54`) ·
client-offsets eligibility/preview/create/reverse (`client-offset.controller.ts:25-66`) ·
client-payouts request/finalize (`client-payout.controller.ts:21-74`) · case-fee-agreements
CRUD (`case-fee-agreement.controller.ts:37-110`) · case-balance GET/ledger/credit/debit
(`case-balance.controller.ts:18-54`) · client-statements generate(case/client)/supersede/
void/read — **preview YOK** (`client-statement.controller.ts:17-94`) · FD zinciri: create
(`disposition.controller.ts:56`) → request/complete office-approval → request/complete
content-approval → publish/retry → reverse/supersede
(`client-financial-disclosure.controller.ts:44-188`; flag gate'ler her adımda).

**Yetki desenleri:** disposition prepare=lawyer∨(MUHASEBE+canPrepareCollectionDisposition)
(`disposition-posting.service.ts:371-385`); approve/post=`officeApproval.isApproverEligible`
(:180-181/:214-215); offset/payout/manual-reversal=`assertOfficeAdmin` (PARTNER/MANAGER);
FD=dört-göz iki aşama (`...approval.service.ts:283/:479-484`) + eligibility predikat
(`...approval-eligibility.ts:27-41` PARTNER/MANAGER∨canApproveOfficeActions); portal FD
=PortalAuthGuard (`portal.controller.ts:117-149`). `@CpeRequired` = dormant metadata.

**Kanıtlanmış boşluklar (matris hücrelerine işlendi):**
1. `disposition-posting.service.ts` — recommend/approve/POST zincirinde AUDIT YOK (grep=0).
2. `case-balance.service.ts` — credit/debit AUDIT YOK; controller yalnız jwt (capability
   gate YOK, `case-balance.controller.ts:11`).
3. `case-balance.service.ts:454 adjust()` — HİÇBİR route çağırmıyor (erişilmez servis
   metodu); REFUND yazan route da YOK.
4. `client-statement.controller.ts:23` — generate/supersede/void YALNIZ AuthGuard('jwt');
   serviste eligibility/Forbidden grep=0 → finansal belge üretimi capability'siz.
5. FD create + 4 onay adımı AUDIT YOK (yalnız publish/reverse/supersede audit'li —
   `publication.service.ts:298-302/:406/:487`); approval/writer servislerinde grep=0.
6. `notificationContent` DTO'da yalnız `@IsString @MinLength(1)` — MaxLength/şablon/
   sanitizasyon YOK (`dto/client-financial-disclosure.dto.ts:11-14`).
7. `GET /interest-engine/health` guard'sız (`interest-engine.controller.ts:467`).
8. Faiz→müvekkil cari bağı stub: `collection.service.ts:414/:1557 interestAmount=0`.
9. Projeksiyon kontratı: ALLOWED :19-35 / ALLOWED_LINE :38 (`['type','amount']`) /
   FORBIDDEN :44-68 (notificationContent+hash dahil) — HTTP yüzeyi portal'da
   (`portal.controller.ts:117-149`), modül kendi controller'ında projeksiyon sunmaz.

### 2.3 OFİS EKRANI + PORTAL (apps/web @ afd84aee)

**Ofis muhasebe kökü:** `app/(dashboard)/clients/[clientId]/accounting/page.tsx`
(ClientCariView :190 · case-scope kartları :196-271 · PendingPayoutRequests :274 ·
ödemeler tablosu :303-311 · StatementSection :353 · FinancialStatementPanel :363 ·
PayoutCreateModal :373). **SEKME DEĞİL** — müvekkil detay sekmeleri
`components/client/client-profile.tsx:336-347` (10 sekme; muhasebe YOK, D09 gereği
ayrı route: `clients/[clientId]/page.tsx:8-10`).

**`components/client-accounting/` 11 bileşen:** AccountingPanel/AccountingTable/
FocusDrawer (layout primitive) · ClientCariView (A-grubu metrikler :107-118, B-grubu
:151-153, dosya kırılımı 11 kolon :196-207) · ClientLevelStatementSection (genel ekstre;
liste :110-114, satır kolonları :229-232 Borç/Alacak/Ekstre Net Bakiyesi; açılış-devir
:216-217; supersede :318) · ClientMovementsTable (birleşik hareketler READ-ONLY; kolonlar
:272-279; tip sözlüğü :39-46; **running balance KASITLI YOK** :7/:249) ·
FinancialStatementPanel (muhasebe defteri; kolonlar :143-148; açılış/kapanış :132-136) ·
OffsetDrawer (mahsup tam akışı; REVERSAL :399-416; iptal modalı :615) ·
PayoutCreateModal :117 · PendingPayoutRequests (:139; Onayla :172 / Kesinleştir :188) ·
StatementSection (case ekstre; kolonlar :84-87/:200-205).

**Web API katmanı:** `lib/api/client-statement.ts` (:73-109 — case/client list+create+
supersede; satır tip sözlüğü :135-140) · `client-accounting.ts` (:215-330 — summary/
movements/cases/payouts/outstanding/expense-summary/case-balance) · `client-offset.ts`
(:215-253 — eligibility/preview/create/reverse/list/detail) · `financial-statement.ts`
(:87-88; hesap sözlüğü :95-97 yalnız CLIENT_PAYABLE).

**Navigasyon kayıt noktaları (C2/X1 APPEND-ONLY yüzeyi — exact):**
- Ofis sidebar registry: `components/layout/sidebar.tsx:44-67` (Müvekkiller :52)
- Müvekkil workspace header → Muhasebe: `clients/[clientId]/page.tsx:31-36`
- Settings müvekkil satırı cüzdan ikonu: `settings/clients/page.tsx:559-560`
- Portal nav registry: `app/portal/layout.tsx:210-240` (FD linki :229-231)

**Portal:** 12 sayfa (layout/login/forgot/reset/profile/cases/cases[id]/documents/
messages/poas/financial-disclosures/ana sayfa). `portal/financial-disclosures/page.tsx`:
Güncel + Bildirim Geçmişi sekmeleri :162-183; kart alanları :88-98 (Tahsil Edilen /
Size Ödenecek Net); satır tip sözlüğü :41-47 — **STATUTORY_FEE_WITHHELD ve
THIRD_PARTY_PAYABLE etiketleri var** (CollectionDispositionLineType'ta OLMAYAN anahtarlar
— savunmacı sözlük; ofiste hiçbir ekranda görünmeyen kalem tipi portalda etiketli).
**Portalda ekstre/cari/hareket/running-balance YOK** (cases[id]:171-178 ve :324-327 —
§33.4 FD Gate ile ham tahsilat yüzeyleri KALDIRILMIŞ).

**Negatif kanıtlar:** ofiste KVKK/consent/DSAR/legal-hold ekranı YOK (0 dosya; tek
eşleşme pazarlama metni `app/page.tsx:72`) · ofiste FD çalışma alanı YOK (dashboard
altında 0 `disclosure`) · client-accounting kapsamında faiz 0 eşleşme (faiz yalnız
borç/takip yüzeylerinde: `components/interest/*`, `case/interest-calculator.tsx`).

### 2.4 OLAY MAİLİ + DÖNEMSEL MAİL + PDF + IDEMPOTENCY (apps/api @ afd84aee)

**Attachment altyapısı (KISMEN):** `notification/email-provider.service.ts:41-54`
`EmailOptions.attachments` VAR; SMTP :152-156 ve SendGrid :203-209 map'li;
**SES :270-285 attachment GEÇİRMİYOR**; hiçbir çağrı yeri attachment göndermiyor.
İkinci mail yolu `client-notification.service.ts:576-680 sendEmail()` (tenant SMTP,
{from,to,subject,html}) — attachment alanı YOK. Dispatcher gerçek gönderim yolu bu.

**FD olay maili (VAR ama içerik ÜRETİLMİYOR):** `notificationContent` zinciri —
DTO tek kısıt `@IsString @MinLength(1)` (`client-financial-disclosure.dto.ts:11-22`) →
controller :94 ham geçirir → approval.service :350-354/:388-394 yalnız trim → hash
mühürü :356-363/:632-646 → publication.service :207-211 provider'a `text` olarak AYNEN.
Dispatcher portu `{to,subject,text}` (`publication.contract.ts:145-152`) — HTML/ek YOK.
Fail-closed: `unconfigured-disclosure-dispatcher.ts:24-41`; flag'ler
`client-financial-disclosure-activation.ts:35-46`.

**Ekstre maili (KISMEN — beklenmedik VAR):** `client-statement.service.ts:398-441
notifyStatementReady()` — YALNIZ case-level `create()`'ten (:134-135); client-level/
supersede/void mail ATMAZ (:404 guard). Şablon FİNANSAL:
`message-template.service.ts:334-350` — "Dönem Sonu Bakiye: {{closingBalance}} TL"
(token doldurma :419-427). PDF eki YOK. → Master plan §1-A'daki "içerikli ekstre maili
YOK" ifadesinin doğru okuması: closingBalance'lı düz mail VAR; satır içerikli/PDF'li
ekstre teslimi YOK (bulgu F-4).

**PDF (YOK — hedef hat için):** pdfmake+pdfkit 7 aktif modülde VAR (template-engine
:1614/:1943/:2220 · pdf.service :19-126 · export-import :143-490 · document :196 · ai
:220) — TAMAMI icra/takip evrakı + generic export. `client-statement` modülünde PDF
route/import YOK (controller :1-98 yalnız CRUD); FD içerik renderer'ı YOK (writer yalnız
snapshot üretir: `...-writer.service.ts:108-170`; projeksiyon kontratı içerik alanlarını
FORBIDDEN tutar: `...-projection.contract.ts:44-68`).

**Cron (dönemsel teslim YOK):** 33 AKTİF @Cron (sertifikalı sayım:
`w3-async-runtime-binding.static-guard.spec.ts:23-46` `CERTIFIED_BOUND_CRON_JOB_COUNT=33`)
+ 2 dormant (icrabot). HİÇBİRİ ClientStatement/FD'ye dokunmuyor; FD modülü cron'u
açıkça yasaklıyor (`client-financial-disclosure.module.ts:30`; composition guard spec
:110). `scheduler-timezone.ts` (Europe/Istanbul, fail-closed :35-39) 33 job'un tamamında;
`cron-failure-reporting.ts:18-37` paylaşımlı hata raporu.

**Statement üretim motoru (VAR):** `client-statement.service.ts` — `parsePeriod` :445-452
· case-level `collect()` :705-904 (opening :721-725 BalanceLedger dönem-öncesi toplamı;
running :803-901) · client-level `collectClientLevel()` :496-691 (opening :510-536) ·
persist :956-993. Üretim yalnız manuel/HTTP.

**Idempotency/duplicate-send:** FD publish ÇOK KATMANLI GÜÇLÜ — advisory lock :515-521 ·
`sendRequestedAt null→now` koşullu claim :185-199 (`..._SEND_ALREADY_CLAIMED`) · guarded
tek geçiş :278-295 · `@@unique([tenantId, sendIdempotencyKey])` (schema) · deterministik
key `client-financial-disclosure:${disposition.id}`
(`client-financial-disclosure-command.service.ts:149-151`). Dispatcher dedupe
`notification-dispatcher.service.ts:50-76` (`dedupeKey` + SENT-varsa-skip) fakat
**`ClientNotification.dedupeKey` üzerinde `@@unique` YOK** (yalnız index) → read-then-
write TOCTOU açık (bulgu F-5). ClientStatement tek-ACTIVE guard'ı advisory lock'a dayanır,
DB unique YOK (servis yorumu :80-83, bilinçli).

## 3. DİLİM ATAMASI (her boşluk mevcut bir hatta)

Her boş/KISMEN/ZAYIF hücre master plan §3'teki MEVCUT bir hatta bağlanır (yeni hat YOK):

| Boşluk | Hat / Blok | Gerekçe (write root eşleşmesi) |
|---|---|---|
| Ofis KVKK/consent/DSAR/legal-hold ekranı (0 dosya) | **C2** (P2) | `client-compliance/**` + `compliance/**` C2 root'u |
| Ofis FD çalışma alanı (dashboard'da 0) | **X1** (P3) | `client-disclosure/**` + `disclosures/**` X1 root'u |
| FD içerik renderer'ı + `notificationContent` şablonlaştırma + POL-4'ün e-postaya teşmili + FD create/onay AUDIT boşluğu | **X2** (P4) | `client-financial-disclosure/**` X2 root'u |
| Ekstre PDF + içerikli/ekli ekstre maili + dönemsel üretim-gönderim + STATEMENT_READY'nin client-level'e genişletilmesi + SES attachment düşmesi (provider seçiminde) + ekstre yetki sertleştirmesi (yalnız-jwt) | **C3** (P5-P6) | `client-statement/**` C3 root'u; provider seçimi C3 teslim tasarımının girdisi |
| Faiz satır tipleri (ClientStatementLineType/CollectionDispositionLineType'a POL-2/POL-3 uyumlu üyeler) + `interestAmount=0` bağının kapatılması + tahsil-faiz kırılımı | **X3** (P7; B01 analiz şimdi, uygulama C3 SONRASI — §3-A) | MIGRATION OWNER=X3; `client-statement/**` uygulaması XL-C gereği seri |
| Portalda ekstre/cari yüzeyi | **hat YOK — owner scope kararı** (master plana disposition; mevcut altı hattın hiçbirinin write root'u portal ekstre ekranı tanımlamıyor) | §4/F-6 |
| disposition-posting + case-balance AUDIT/capability boşlukları; erişilmez `adjust()`; REFUND route'suzluğu | **hat YOK — master plana disposition** (client-settlement/ ve case-balance/ hiçbir hattın write root'u değil) | §4/F-7 |
| `ClientNotification.dedupeKey` DB-unique eksikliği (TOCTOU) | **master plana disposition** (migration ister; MIGRATION OWNER=X3 yalnız faiz kalemleriyle sınırlı tanımlı) | §4/F-5 |

DALGA-1 hazır girdiler: C2/X1 (C1-B02 merge'ini bekler — §3-A) · C3/X2/X3-B01 (C1-B01
merge sonrası açılır).

## 4. YENİ BULGULAR (blok sayacı DEĞİŞMEZ — master plana disposition için)

- **F-1** `client-settlement/collection-reversal.service.ts` ve
  `client-settlement/client-accounting.controller.ts` YORUM satırlarında yaygın mojibake
  (kullanıcıya görünmez; C1-B02 kapsamına ALINMADI — dosyalar C3/X2-komşusu modülde).
- **F-2** `client.controller.ts:330` kullanıcı-görünür mojibake — C1-B02 kapsamında
  (owner'ın exact bulgusu).
- **F-3** Master plan §1-A "ClientStatementLineType 17 üye" — fresh main sayımı **16**
  (schema :5089-5111). Faiz-yok tespiti DEĞİŞMEZ; yalnız sayım düzeltmesi.
- **F-4** Master plan §1-A "ekstre maili YOK" nüansı: `notifyStatementReady()` VAR
  (`client-statement.service.ts:398-441`, şablon closingBalance taşır) fakat yalnız
  case-level `create()`'te; client-level/supersede maili ve PDF eki YOK. C3 tasarım girdisi.
- **F-5** `ClientNotification.dedupeKey` yalnız `@@index` — `@@unique` YOK → dispatcher
  dedupe'unda read-then-write TOCTOU. Migration ister; MIGRATION OWNER=X3 tanımı yalnız
  faiz kalemleri → owner disposition gerekli.
- **F-6** Portalda ekstre/cari yüzeyi hiçbir hattın write root'unda değil — owner scope
  kararı gerekiyorsa master plana.
- **F-7** `client-settlement/disposition-posting` + `case-balance` AUDIT/capability
  boşlukları, erişilmez `adjust()` (:454), REFUND route'suzluğu — bu path'ler hiçbir
  hattın write root'u değil → master plana disposition.
- **F-8** `GET /interest-engine/health` guard'sız (`interest-engine.controller.ts:467`)
  — program lock DIŞI modül; dependency olarak kayıt (implementation başlatılmadı).

## 5. C1-B02 EXACT WRITE MANIFEST ÖN-TESPİTİ (B02 başında resmî yayımlanır)

Tarama sonuçları (VERIFIED):
- `apps/api/src/modules/client/client.controller.ts` — :330 `'MÃ¼vekkil bulunamadÄ±'`
  (kullanıcı-görünür 404 metni) + :365/:384 aynı-sınıf yorum bozuklukları.
- `apps/web/src/components/client/client-info-requests-tab.tsx:103` — Bilgi Talepleri
  boş-durumu yanlış metin ("Bu müvekkile bağlı dosya yok.").
- `apps/web/src/__tests__/client-info-requests-tab.test.tsx:57` — characterization.
- `apps/web/src/components/client/client-right-panel.tsx` — :24 `Saglikli` · :30
  `Dusuk risk` · :125 `... ozeti` (+ dosyadaki eş-sınıf metin taraması B02'de).
- `apps/web/src/__tests__/client-right-panel.test.tsx` — :167/:182/:183 characterization.
- `apps/api/src/modules/client/client.service.ts` — :2347 `Update contact information` ·
  :1085/:2323/:2336/:2365 `No related cases are linked to this client yet.`
- `apps/api/src/modules/client/__tests__/client-action-catalog.spec.ts` — :196/:230/:406
  characterization.
