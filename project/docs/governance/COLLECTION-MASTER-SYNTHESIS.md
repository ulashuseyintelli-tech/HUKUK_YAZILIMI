# COLLECTION MASTER SYNTHESIS

## Tahsilat Domaini — Kalıcı Domain Gerçekleri (Kanıt Katmanı)

```text
Belge yolu              : project/docs/governance/COLLECTION-MASTER-SYNTHESIS.md
Durum                   : CANONICAL REFERENCE / NON-NORMATIVE EVIDENCE BASELINE
Sınıf                   : NON-NORMATIVE EVIDENCE BASELINE — Domain Law'a norm EKLEYEMEZ
                          (OFFICE-MASTER-SYNTHESIS ile aynı sınıf ve sınır)
Owner Status            : OWNER-APPROVED CANONICALIZATION (2026-07-13)
Repository Status       : CANONICAL UPON APPROVED MERGE TO MAIN
Kanıt tabanı            : repo main @ beb7d6735fb4002ad6169604531681414a17aa0e (2026-07-13)
Kaynak                  : Alacağın Tahsili A–Z Master Analysis'in damıtımı (Desktop 01 v1.0)
                          + bu hesabın Handoff Acceptance doğrulaması (2026-07-13, 9 ajan / 264 salt-okuma)
IMPLEMENTATION AUTHORITY: NONE
```

> Amaç: Master Analysis'in insan-okunabilir KALICI sürümü. Buraya bütün runtime ayrıntıları
> değil, yalnız kalıcı domain gerçekleri girer. Volatil PR/SHA ayrıntıları Appendix'te tutulur.

---

# 1. Kalıcı domain gerçekleri (doğrulanmış)

Her satır: GERÇEK → KANIT (main @ beb7d673).

## 1.1. Çekirdek para-giriş zinciri

- **F-01 — Tek tahsilat yazım otoritesi vardır.** `CollectionService.create()` tek giriş
  noktasıdır; ikinci yazım yolu yasağı TM3 ile bağlayıcıdır.
  KANIT: collection.service.ts:393; TM3 §10.
- **F-02 — Tahsilat girişi idempotenttir ve idempotencyKey zorunludur.** Eksik key
  BadRequest; aynı key+payload replay; kilit key-scoped advisory lock ile.
  KANIT: collection.service.ts:405-432; schema.prisma:2336 `@@unique([tenantId, idempotencyKey])`;
  PR #851 (ALC-P0-1, decision-log).
- **F-03 — Bir tahsilat tek transaction'da beş etki üretir:** Collection satırı + recorded
  journal kanıtı + PAYMENT_RECEIVED event + ledger forward (LedgerEntry+LedgerAllocation)
  + koşullu CollectionOverpayment(HELD).
  KANIT: collection.service.ts:393-666.
- **F-04 — Ledger append-only'dir.** LedgerEntry hiçbir production yolunda update/delete
  edilmez; iptal telafi edici REVERSAL satırıyla yapılır; `reversesLedgerEntryId @unique`
  + onDelete:Restrict çift-reversal ve orijinal silmeyi engeller.
  KANIT: schema.prisma:5169-5217; grep sonucu production update/delete=0.
- **F-05 — TBK100 mahsup sırası kodda kilitlidir:** MASRAF → FER'İ → İŞLEMİŞ FAİZ → ANAPARA.
  Runtime tüketicisi tek kaynaktan allocate eder; sıra 2026-06-14'ten beri değişmemiştir.
  KANIT: tbk100-allocator.service.ts:92-200 (satır 7: "policy ile değiştirilemez");
  summary-engine.service.ts:636-669. (Normatif sıra REC-GOV §9.2'de yaşar.)
- **F-06 — Overpayment HELD emanet modelidir; borç değildir.** Borç-üstü tahsil dört güvenlik
  blokundan geçer (EXCLUDED_OUTSTANDING, CURRENCY_MISMATCH, LEDGER_CONTEXT_MISMATCH,
  RESTRICTED_PAYMENT_UNSUPPORTED); bloksuz durumda HELD statüsüyle yazılır.
  KANIT: collection.service.ts:548-666; schema.prisma:2362-2391.
- **F-07 — Linked full reversal net-zero'dur.** Negatif ayna LedgerEntry + birebir negatif
  allocation aynası + overpayment HELD→REVERSED + deterministic PAYMENT_REVERSED
  (causedBy=orijinal event).
  KANIT: collection-cancel-executor.ts:54-244.
- **F-08 — Confirmed tahsilat iptali onay kapılıdır ve self-approval yasaktır.**
  COLLECTION_VOID, ADR-009 evrensel approval zincirindedir; payout istisnasını miras almaz.
  KANIT: OWN-29-B (decision-log 2026-07-10); PR #1030; PR #805 (human actor zorunlu).

## 1.2. Bakiye otoritesi

- **F-09 — Kanonik hesap motoru bugün SHADOW_ONLY'dir; fiili production display authority
  legacy calculation-summary'dir.** Kanonik sonuç yalnız additive shadow/diff/compat alanı
  olarak döner; FE flag'leri varsayılan kapalıdır.
  KANIT: case-balance-display.ts:766; case.service.ts:4097-4101; feature-flags.ts:163,173.
- **F-10 — Runtime cutover YETKİSİZDİR.** Politika + 15 operasyonel karar DEFINED; yetki için
  3 gate açık: ölçülmüş baseline, representative evidence (ABSENT/BLOCKING), açık owner
  APPROVED. KANIT: decision-log:15/44/48; ADR-014 status satırı.

## 1.3. Dağıtım (downstream) gerçekleri

- **F-11 — Borçlu tahsilatı otomatik müvekkile borç değildir.** Müvekkile borç yalnız posted
  `CLIENT_PAYABLE` disposition satırıyla doğar; kanonik akış
  `create → confirmed → recommendation → approval → post`.
  KANIT: TM3 inv-1/2/3; dbind §3 (her ikisi ONAYLANDI).
- **F-12 — Money-out idempotenttir.** ClientPayout: zorunlu key + DB unique + advisory lock
  + payload-conflict fail-closed; CollectionDisposition: `collectionId @unique` doğal anahtar.
  KANIT: schema.prisma:8529/8540/8333; client-payout.service.ts:187-613.
- **F-13 — Finansal otorite CaseClient/creditor set'tir; `Case.clientId` finansal otorite
  değildir; disposition `clientId` ile kurulamaz.** KANIT: dbind §1; TM3 inv-4.

## 1.4. Sınır gerçekleri

- **F-14 — Tahsilat tahsisi NEVER_AUTO'dur ve case-scoped'tır.** Global debtor pool ve
  dosyalar-arası otomatik allocation yasaktır. KANIT: REC-GOV §9.1/§9.3; DEBTOR-GOV §7.
- **F-15 — Muhasebe hattı yön olarak kilitli, yürütme olarak kapalıdır.** AccountingJournal
  UNWIRED/shadow; journal legal balance hesaplamaz. KANIT: ADR-010; REC-BOUNDARY-002.
- **F-16 — Actor/approval otoritesi OFFICE'tedir.** Collection kendi rol/approval sistemi
  taşımaz. KANIT: ADR-009; Collection modülünde rol tablosu yok.

---

# 2. Kalıcı açık gerçekler (doğrulanmış eksikler)

- **OF-01 — Collection create/cancel AuditLog yazmaz; correlationId/causationId şemada yoktur;
  commandId deseni repo'da hiç kullanılmaz.** Event-düzeyi `causedBy` zinciri VARDIR (HR-23)
  ama HTTP `x-request-id` domain katmanına taşınmaz.
  KANIT: collection modülünde auditLog.create=0; schema AuditLog:4926-4958 correlationsuz.
- **OF-02 — Allocation concurrency gap'i (historical baseline; contract decided, runtime
  remediation pending).** Baseline'da ana yolun koruması dolaylı event yan etkisine dayanıyordu
  ve canonical `CollectionService.create` dışında aynı kontratı taşımayan ikinci allocation
  giriş yolu bulunuyordu. A2, mevcut same-case transaction advisory lock altında race safety'yi
  10/10 doğruladı. COL/OD-04 bu lock'u canonical allocation concurrency authority olarak
  kaydetti ve ikinci yol için **CLOSE** disposition'ı verdi. W1.2, lock bağımlılığını allocation
  kontratı olarak açıklaştırıp ikinci yolu kapatana kadar P0 runtime remediation açıktır.
  KANIT: PR #1217 / `4e8243e5`; decision-log COL/OD-04; publication-safety nedeniyle ikinci
  yolun route/dosya-satır ayrıntısı owner'a özel kanalda korunur. (COL-RISK-D04 / G02 / T01.)
- **OF-03 — Çok-enstrüman template bütünlüğü açıktır.** Template hattı `findFirst` ile yalnız
  ilk CaseInstrument'ı basar; düzeltme (PR-N5) tasarımda onaylı, implement edilmemiştir.
  KANIT: template-engine.service.ts:417; case-instrument-canonical-design.md:101/143/193.
- **OF-04 — Eski UYAP export yolu canlıdır ve şema-dışı alan okur.** `/uyap-export`
  `instrumentType==='CHECK'|'BOND'` okur (şemada yok) → çek/senet çıktısı fiilen boş; AS7
  owner kararıyla bilinçli canlı tutulmuştur; üçüncü bir XML yolu (template-engine) da vardır.
  KANIT: uyap-case-mapper.service.ts:104-113; schema InstrumentType enum; AS7 kaydı.
- **OF-05 — Legacy faiz/harç formülleri birden çok yüzeyde canlıdır.** report.service.ts
  (basit faiz), legacy Hesap Özeti (stub faiz + oran formülleri), expense-request,
  document.service, fee-engine controller, web yeni-dosya formu.
  KANIT: report.service.ts:674-680; case.service.ts:3960-4008; expense-request.service.ts:629;
  document.service.ts:78; fee-engine.controller.ts:280-281; cases/new/page.tsx:4870-4871.
- **OF-06 — valueDate/date çift-tarih tek authority'ye bağlanmamıştır; official as-of/snapshot
  yoktur.** (Tarih alanları bu turda hedefli yeniden doğrulanmadı — Master Analysis bulgusu;
  snapshot yokluğu REC-AUTH-024/025 ile teyitli.)

---

# 3. Evidence limitations

1. Orijinal "Alacağın Tahsili A–Z Master Analysis" ve "Post-Master Closure Report" tam
   metinleri repo'da ve bu makinede MEVCUT DEĞİLDİR; bu synthesis, owner'ın sağladığı damıtım
   (Desktop 01) + bu hesabın bağımsız repo doğrulamasından kurulmuştur.
2. Master Analysis'in "2.200 test pass / gerçek DB kanıtı" iddiası bu hesapta yeniden
   KOŞULMAMIŞTIR; runtime çalıştırılmadan statik kod/git/governance okumasıyla doğrulama
   yapılmıştır.
3. ODP-1..ODP-12 / TDP dossier içerikleri erişilemediğinden, karar paketleri damıtım
   kuyruğundan normalize edilmiştir (COLLECTION-OWNER-DECISIONS.md §0 crosswalk notu).
4. §2/OF-06 tarih-authority bulgusu bu turda yeniden üretilmemiş tek kalemdir
   (UNVERIFIED-THIS-PASS).

---

# Appendix A — Volatil durum işaretleri (okuma anında yeniden doğrula)

```text
main @ beb7d6735fb4002ad6169604531681414a17aa0e (2026-07-13)
Cutover           : NOT AUTHORIZED (3 gate açık)
CAN-CUT-01        : OPEN (Due/ClaimItem)
CAN-CUT-02        : OPEN / needs-owner-decision (Hesap Özeti / interest-engine)
TM3-ACT28-LEGAL   : RECONCILIATION OPEN (REC-AUTH-011)
Duplicate allocator disposition: OWNER-HELD (REC-AUTH-012)
Codex ilk uygulama paketi (Desktop 04): GO-TEST decision-independent evidence — HENÜZ KOŞULMADI
```
