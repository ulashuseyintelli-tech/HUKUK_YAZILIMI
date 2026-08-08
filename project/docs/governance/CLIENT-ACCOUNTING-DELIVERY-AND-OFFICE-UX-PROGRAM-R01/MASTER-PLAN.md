# CLIENT-ACCOUNTING-DELIVERY-AND-OFFICE-UX-PROGRAM-R01 — MASTER PLAN

```text
PROGRAM:                  CLIENT-ACCOUNTING-DELIVERY-AND-OFFICE-UX-PROGRAM-R01
KANONİK SINIF:            POST_CLOSE_PRODUCT_COMPLETION / YENİ PROGRAM
OWNER AUTHORITY:          GO-COMPLETE (owner, 2026-08-08)
VERSION:                  v1.0
PROGRAM LOCK:             CLIENT ACCOUNTING DELIVERY + CLIENT OFFICE UX ONLY

BASELINE (fresh):         c867c18a438d92b108da0ab73e4e31c4d79db60f
ÖNCEKİ PROGRAM:           CLIENT-MODULE-TERMINAL-COMPLETION-PROGRAM-R01
                          TERMINAL_CLOSED / PRODUCTION_VERIFIED / CANONICAL (2026-08-07)
                          → YENİDEN AÇILMAZ. Bu program onu DEĞİŞTİRMEZ, ÜSTÜNE KURAR.
BAYAT KAYIT REDDİ:        `f34c371a` tabanlı analiz ve "WAVE 4 açık" ifadesi
                          YÜRÜTME GERÇEĞİ SAYILMAZ. Esas: #2262 / `94ddb975` ve sonrası.
```

---

## 1. AMAÇ VE SINIR

Repository'de **hazır olan** müvekkil muhasebesi, financial disclosure ve C3 (KVKK)
kontrollerini, gerçek ofis kullanıcısının frontend'den uçtan uca yönetebileceği ve
müvekkile doğru finansal belge ulaştıran bir **ürüne** dönüştürmek.

Bu bir yeniden-yazım değildir. Mevcut backend sözleşmeleri, onay zincirleri, mühürleme
ve fail-closed davranışlar **korunur**; eksik olan sunum, üretim ve teslim katmanları
eklenir.

### 1-A. Var oluş gerekçesi (repository kanıtı, baseline c867c18a)

```text
VAR  : components/client-accounting/ — 11 bileşen (AccountingPanel, ClientCariView,
       ClientMovementsTable, StatementSection, ClientLevelStatementSection, ...)
VAR  : lib/api/client-statement.ts · client-accounting.ts · client-offset.ts
VAR  : app/portal/financial-disclosures/page.tsx (+ spec) — PORTAL FD ekranı
VAR  : ClientStatement + ClientStatementLine (dönem, opening/closing, runningBalance)
VAR  : ClientFinancialDisclosure + Version + Line (iki aşamalı onay, mühürleme, reversal)
VAR  : email-provider attachments · pdfmake · pdfkit · ScheduleModule/@Cron ·
       scheduler-timezone.ts · cron-failure-reporting.ts

YOK  : ofis KVKK/consent/DSAR/legal-hold/special-category ekranı        (0 eşleşme)
YOK  : ofis financial disclosure çalışma alanı                          (0 eşleşme)
YOK  : FD içeriğini finansal veriden üreten renderer
YOK  : ekstre PDF üretimi ve içerikli ekstre maili
YOK  : periyodik (dönemsel) ekstre üretimi/gönderimi
YOK  : faiz hareket tipi (ClientStatementLineType 17 üye — faiz YOK;
       CollectionDispositionLineType 7 üye — faiz YOK)
```

**Teşhis:** motor var; direksiyon ve müvekkile giden belge yok.

---

## 2. OWNER POLİTİKA KARARLARI (bağlayıcı)

```text
POL-1  ClientFinancialDisclosure bir OLAY BİLDİRİMİDİR.
       ClientStatement bir DÖNEMSEL EKSTREDİR.
       BİRLEŞTİRİLMEZ. Ayrı şablon · ayrı onay · ayrı gönderim anlamı korunur.

POL-2  Tahakkuk etmiş fakat TAHSİL EDİLMEMİŞ faiz:
       INFORMATIONAL / NON-CASH. Açılış ve kapanış bakiyesini DEĞİŞTİRMEZ.

POL-3  TAHSİL EDİLMİŞ faiz:
       Yalnız gerçek POSTED Collection/Disposition zincirinden sonra ve gerçek
       allocation oranında müvekkil bakiyesine yansır.

POL-4  Dosya bilgisi:
       E-posta ve portalda YALNIZ repository'de doğrulanan insan-okur dosya
       referansı gösterilir. Raw `caseClientId`, `collectionDispositionId`,
       `sourceCollectionId` ve diğer iç ID'ler FORBIDDEN kalır.
       Başka müvekkile ait veri hiçbir koşulda projeksiyona GİRMEZ.

POL-5  Staff hiçbir zaman nihai finansal onay veya yayın YAPAMAZ.
       Nihai onay yalnız mevcut canonical eligibility kurallarındaki yetkili
       avukat/manager/partner/super-admin yüzeylerinden geçer.
```

### 2-A. POL-2/POL-3'ün mühendislik karşılığı

Bu iki karar birlikte **çift-sayımı** yapısal olarak imkânsızlaştırır: tahakkuk satırı
`debit=0, credit=0` bilgi satırıdır ve `runningBalance`'ı taşımaz; nakit etki yalnız
POSTED zincirden türeyen satırla girer. Şemada emsali zaten var —
`COLLECTION_OFFSET_ADVANCE` yorumu: *"BİLGİ; bakiye etkisi BalanceLedger'dan,
çift-sayım yok"*. POL-2 aynı deseni faize uygular.

### 2-B. POL-4'ün mühendislik karşılığı

`client-financial-disclosure-projection.contract.ts` bugün zaten bir **allowlist**
uygular: `CLIENT_DISCLOSURE_ALLOWED_FIELDS` + `CLIENT_DISCLOSURE_ALLOWED_LINE_FIELDS`,
karşısında `CLIENT_DISCLOSURE_FORBIDDEN_FIELDS`. POL-4 bu sınırı **e-postaya da**
teşmil eder. Bugün e-posta bu sınırın dışındadır çünkü gövde serbest metindir
(`notificationContent: string`). X2 bunu kapatır.

---

## 3. ALTI HAT — SAYFA HARİTASI VE WRITE-PATH AYRIMI

"Farklı dizin" tek başına paralellik kanıtı DEĞİLDİR. Her sayfa blok başında **EXACT
WRITE MANIFEST** üretir ve eşzamanlı sayfaların manifestleriyle karşılaştırır.

| Hat | Faz | Kapsam | EXACT WRITE ROOT | Öncül |
|---|---|---|---|---|
| **C1** | P0 · P1 · P8 | Baseline + coverage matrix · metin onarımı · uçtan uca UAT ve sertifikasyon | bu program dizini · (P1 exact manifest) · doğrulama (ürün yazımı YOK) | — |
| **C2** | P2 | C3/KVKK ofis yüzeyleri | `apps/web/src/components/client-compliance/**`<br>`apps/web/src/app/(dashboard)/clients/[clientId]/compliance/**`<br>`apps/web/src/lib/api/client-compliance.ts` | C1-B01, C1-B02 |
| **C3** | P5 · P6 | Dönemsel ekstre PDF + içerikli mail + periyodik teslim | `apps/api/src/modules/client-statement/**` | C1-B01 |
| **X1** | P3 | Ofis FD çalışma alanı | `apps/web/src/components/client-disclosure/**`<br>`apps/web/src/app/(dashboard)/clients/[clientId]/disclosures/**`<br>`apps/web/src/lib/api/client-financial-disclosure.ts` | C1-B01, C1-B02 · (B03 için X2) |
| **X2** | P4 | FD deterministik içerik renderer'ı | `apps/api/src/modules/client-financial-disclosure/**` | C1-B01 |
| **X3** | P7 | Faiz semantiği | analiz: bu program dizini<br>uygulama: `apps/api/prisma/` + `client-statement/**` | C1-B01 (analiz)<br>**C3** (uygulama) |

### 3-A. Paralellik dalgaları

```text
DALGA 0 (seri, kısa)   : C1-B01 (fresh baseline) → C1-B02 (metin onarımı, P1)
DALGA 1 (BEŞ PARALEL)  : C2 ∥ C3 ∥ X1 ∥ X2 ∥ X3-B01(analiz)
DALGA 2                : X3-B02+ (uygulama) — C3 merge edildikten SONRA
DALGA 3                : C1-B03+ (P8 UAT + PRODUCT_COMPLETE sertifikasyonu)
```

Gerekçeler:

- **C1-B02 neden seri ve önce:** mojibake/diakritik düzeltmesi **çapraz kesen** bir
  yüzeydir; düzeltme hangi dosyada bozukluk varsa oraya iner ve önceden sınırlanamaz.
  C2/X1 ile paralel yürürse gerçek same-file competing writer doğar. Bu yüzden
  C1-B02 merge edilmeden C2 ve X1 **açılmaz**.
- **X3 uygulaması neden C3'ün ardılı:** X3'ün ürün etkisi `client-statement` servisine
  ve ekstre PDF renderer'ına satır tipi eklemektir — **C3 ile aynı dosyalar**.
  X3-B01 (analiz + şema tasarımı) docs-only'dir ve C3 ile paralel yürür.
- **C2 vs X1:** ikisi de `apps/web` altında fakat **ayrık alt ağaç**
  (`client-compliance/**` vs `client-disclosure/**`, `compliance/**` vs
  `disclosures/**`). Kesişim yok.
- **C3 vs X2:** ikisi de `apps/api` altında fakat **ayrık modül**
  (`client-statement` vs `client-financial-disclosure`).

### 3-B. Navigasyon/sekme kaydı — PAYLAŞIMLI APPEND-ONLY YÜZEY

C2 ve X1 kendi route'larını müvekkil detayına bağlamak için aynı navigasyon/sekme
kayıt noktasına dokunur. Bu yüzey **tek bir hatta atanmaz**:

```text
Her hat YALNIZ kendi satırını EKLER; mevcut satırları DEĞİŞTİRMEZ.
Çakışmada SONRA GELEN REBASE EDER.
Bu, önceki programda ratifiye edilen ci-manifest kuralının aynısıdır.
```

---

## 4. CROSS-LANE COUPLING KAYDI

Bu bağlar derleme/sözleşme seviyesindedir ve manifest karşılaştırmasıyla **görünmez** —
açıkça kaydedilir.

```text
XL-A · X2 → X1  (SÖZLEŞME BAĞI)
  X1-B03 "deterministik finansal önizleme" X2'nin ürettiği render sözleşmesini
  TÜKETİR. X2 çıkışta sözleşmeyi DONDURUR; X1 yalnız tüketir ve KENDİ metnini
  ÜRETMEZ. Aksi halde ekranda görünen ile müvekkile giden içerik ayrışır.
  X1-B03, X2'nin sözleşme bloğu merge edilmeden BAŞLAMAZ → WAITING_FOR_PREDECESSOR.
  X1'in diğer blokları bu bağdan ETKİLENMEZ. Sıra ATLANMAZ.

XL-B · X2 → C3  (PAYLAŞIMLI PRİMİTİF)
  POL-4'ün gerektirdiği "client-safe insan-okur dosya referansı" primitifi
  TEK YERDE tanımlanır. WRITER = X2 (projeksiyon sözleşmesinin sahibi).
  C3 bu primitifi READ-ONLY tüketir; kendi kopyasını ÜRETMEZ.
  Gerekçe: iki ayrı uygulama = iki ayrı sızıntı yüzeyi.

XL-C · C3 → X3  (AYNI DOSYA)
  §3-A. Aynı write root; seri zorunlu.

XL-D · TÜMÜ → mevcut canonical eligibility
  POL-5 gereği nihai onay/yayın yetkisi mevcut eligibility yüzeylerinden geçer.
  Bu yüzeyler READ-ONLY'dir. Hiçbir hat yeni yetki modeli KURMAZ, mevcut olanı
  GENİŞLETMEZ, üç farklı eligibility'yi BİRLEŞTİRMEZ/NORMALİZE ETMEZ.
```

---

## 5. PAYLAŞIMLI SÖZLEŞMELER

```text
client-financial-disclosure-projection.contract.ts
    → WRITER: X2.  ALLOWED/FORBIDDEN alan setleri buradan yönetilir.
    → X1 ve C3 READ-ONLY tüketir.
    → FORBIDDEN listesinden alan ÇIKARMAK owner kararıdır (POL-4).

officeApproval.isApproverEligible  ·  FD approval eligibility
    → READ-ONLY (tüm hatlar). Birleştirme/normalizasyon YASAK.

ClientStatement / ClientStatementLine şeması
    → WRITER: X3 (yalnız faiz kalemleri, en küçük migration).
    → C3 okur ve render eder; şema DEĞİŞTİRMEZ.

navigasyon/sekme kaydı
    → PAYLAŞIMLI APPEND-ONLY (§3-B).

MIGRATION OWNER
    → X3. Aynı anda TEK aktif migration görevi. Diğer hatlar migration YAZMAZ.
```

---

## 6. P0 COVERAGE MATRIX — ZORUNLU ŞEKİL

C1-B01'de her hareket için doldurulur. Boş hücre bırakılmaz; ölçülemiyorsa `UNKNOWN`
ve gerekçesi yazılır.

```text
Hareket | Veri modeli | API | Ofis ekranı | Portal | Olay maili | Dönemsel mail | PDF | Audit | Yetki
```

Ölçülecek asgari 12 hareket:

```text
tahsilat · müvekkil payı · vekâlet/avukatlık ücreti · masraf · avans · iade ·
mahsup ve reversal · payout/ödeme · tahakkuk etmiş faiz · tahsil edilmiş faiz ·
düzeltme · açılış/kapanış/running balance
```

**Kanıt kuralı:** "backend var" hücreyi doldurmaz. Her hücre exact dosya/route/kolon
referansı taşır. PR açıklaması, geçmiş konuşma veya rapor iddiası kanıt değildir.
`UNKNOWN` geçerli ve terminal bir hücre sonucudur; bloğu tamamlanmamış SAYMAZ.

---

## 7. BLOK DİSİPLİNİ

`ORDER MUTATION: FORBIDDEN`. Yeni bulgu mevcut bloğa gizlice EKLENMEZ ve **blok
sayacını değiştirmez**; master plana disposition için gönderilir.

### Her blok sonunda ZORUNLU çıktı

```text
CURRENT PAGE:                 <hat>
COMPLETED BLOCK:              <exact ID>
BLOCK RESULT:                 ENGINEERING_COMPLETE / RUNTIME_VERIFIED /
                              ANALYSIS_DELIVERED / UNKNOWN / FAILED_EXACT
MERGED PR / SHA:              <PR ve merge SHA>
BLOCKS TOTAL / COMPLETED / REMAINING
REMAINING BLOCKS:             <exact sıralı liste>
ACTIVATION DEBT:              <liste veya NONE>
NEXT ELIGIBLE:                <yalnız sıradaki exact blok>
OWNER AUTHORIZATION REQUIRED: <evet/hayır>
PROGRAM LOCK:                 CLIENT ACCOUNTING DELIVERY + CLIENT OFFICE UX ONLY
```

### DEFINITION OF DONE (blok)

```text
acceptance + hedefli testler + typecheck/build + required CI PASS + MERGEABLE CLEAN
→ AYNI GÖREV İÇİNDE squash-merge → main sync → KENDİ branch/worktree cleanup
→ zorunlu blok çıktısı → fresh main ile sıradaki eligible bloğa OTOMATİK geçiş
```

### TERMİNAL AYRIMI

```text
CODE_PRESENT ≠ ENGINEERING_COMPLETE ≠ PRODUCT_COMPLETE
MERGED       ≠ ENGINEERING_COMPLETE
```

---

## 8. DURMA KOŞULLARI (owner tarafından belirlendi)

```text
D-1  Owner politikasıyla GERÇEK çelişki
D-2  Başka müvekkil verisi sızıntısı
D-3  Tenant izolasyonu ihlali
D-4  Staff final approval/publish erişimi
D-5  Duplicate GERÇEK gönderim riski
D-6  Allowed-path dışına zorunlu çıkış
D-7  Production migration için backup/restore kapısının sağlanamaması
```

### 8-A. BU PROGRAM BLOCKED ÜRETMEK İÇİN KULLANILMAZ

Bağımsız blok yürüyebiliyorsa **yürütülür**. Yalnız etkilenen blok
`WAITING_FOR_OWNER_DECISION` olabilir; diğer bağımsız bloklar **durmaz**.
Normal CI beklemesi, öncül beklemesi ve register biçim eksikliği **blocker değildir**.

---

## 9. KAPANIŞ EŞİĞİ

```text
"Backend var" YETERLİ DEĞİLDİR.

PRODUCT_COMPLETE ancak şunlar BİRLİKTE kanıtlandığında ilan edilir:
  ofis ekranı + portal + doğru finansal içerik + PDF + yetki + audit +
  idempotency + GERÇEK canary teslimi
```

---

## 10. UAT VE CANARY KISITLARI (P8 / C1)

```text
- TELLİ HUKUK GERÇEK müvekkillerine test maili GÖNDERİLMEZ.
- Demo tenant + owner'ın yetkilendirdiği canary alıcısı kullanılır.
- Olay bildirimi için TAM 1 canary.
- Dönemsel ekstre için TAM 1 canary.
- Owner teslim teyidi alınmadan kalıcı publication/schedule activation YAPILMAZ.
- Desktop/tablet/mobile · console/network temiz · tenant izolasyonu · rol matrisi PASS.
```

---

## 11. STATUS REGISTER

```text
PROGRAM:                  CLIENT-ACCOUNTING-DELIVERY-AND-OFFICE-UX-PROGRAM-R01
PROGRAM STATUS:           MASTER PLAN MATERIALIZED — yürütme BAŞLAMADI
BASELINE:                 c867c18a438d92b108da0ab73e4e31c4d79db60f
DOCUMENT SET:             MASTER-PLAN + C1 + C2 + C3 + X1 + X2 + X3

C1 STATUS:                NOT STARTED — NEXT ELIGIBLE (öncülü yok)
C1 BLOCKS:                P0+P1+P8 · TOTAL 5 · COMPLETED 0
C2 STATUS:                IN PROGRESS — C2-B01 ANALYSIS_DELIVERED (2026-08-07; envanter: C2-B01-SURFACE-CONTRACT-INVENTORY-R01.md; eksik endpoint YOK; NEXT: C2-B02)
C2 BLOCKS:                P2 · TOTAL 4 · COMPLETED 0
C3 STATUS:                NOT STARTED — WAITING_FOR_PREDECESSOR (C1-B01)
C3 BLOCKS:                P5+P6 · TOTAL 5 · COMPLETED 0
X1 STATUS:                NOT STARTED — WAITING_FOR_PREDECESSOR (C1-B01, C1-B02)
X1 BLOCKS:                P3 · TOTAL 5 · COMPLETED 0
X2 STATUS:                NOT STARTED — WAITING_FOR_PREDECESSOR (C1-B01)
X2 BLOCKS:                P4 · TOTAL 4 · COMPLETED 0
X3 STATUS:                NOT STARTED — B01 analiz: C1-B01 sonrası · B02+: C3 sonrası
X3 BLOCKS:                P7 · TOTAL 3 · COMPLETED 0

MIGRATION OWNER:          X3 (tek aktif migration görevi)
ACTIVATION DEBT:          NONE — henüz doğmadı (X3 ve C3/P6 üretebilir)
ÖNCEKİ PROGRAM:           TERMINAL_CLOSED / PRODUCTION_VERIFIED / CANONICAL — DOKUNULMAZ
PROGRAM LOCK:             CLIENT ACCOUNTING DELIVERY + CLIENT OFFICE UX ONLY
```

---

## 12. DEĞİŞTİRİLEMEZ KURALLAR

```text
CONTEXT RULE:      Konuşma hafızası canonical kaynak DEĞİLDİR.
                   Current main, bu master plan ve ratifiye kararlar canonical'dır.
CROSS-LANE RULE:   Diğer hattın dosyasına, PR'ına, branch'ine, worktree'sine
                   veya görevine DOKUNMA.
CROSS-MODULE RULE: Program lock dışındaki bulguları dependency olarak KAYDET;
                   implementation BAŞLATMA.
NEW FINDING RULE:  Yeni bulgu blok sayacını DEĞİŞTİRMEZ; master plana gönderilir.
CLOSED PROGRAM:    CLIENT-MODULE-TERMINAL-COMPLETION-PROGRAM-R01 YENİDEN AÇILMAZ.
                   O programın register'ı, sayfaları ve kapanış kayıtları
                   DEĞİŞTİRİLMEZ.
BLOCKER DİSİPLİNİ: Governance/orchestra/control-plane onarımı BAŞLATMA · yeni
                   SA/EG/grant/binding ÜRETME · gh-guard -Repair ÇALIŞTIRMA ·
                   branch protection/ruleset DEĞİŞTİRME · admin/bypass KULLANMA ·
                   başka PR'ın CI/merge sorununu SAHİPLENME · normal CI beklemesini
                   BLOCKED SAYMA · exact path kanıtı olmadan competing writer İLAN ETME.
STATUS SINIFLARI:  WAITING_FOR_CI · WAITING_FOR_PREDECESSOR · WAITING_FOR_OTHER_SESSION ·
                   WAITING_FOR_OWNER_DECISION · BLOCKED_EXACT
                   BLOCKED_EXACT yalnız DÖRDÜ BİRDEN: (1) acceptance teknik olarak
                   ilerleyemiyor, (2) engel granted scope içinde çözülemiyor,
                   (3) engel repository/current-main kanıtıyla doğrulanmış,
                   (4) devam etmek veri kaybı veya yetki ihlali yaratacak.
```
