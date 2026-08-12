# C3 — DÖNEMSEL EKSTRE PDF + İÇERİKLİ MAİL + PERİYODİK TESLİM (P5 · P6)

```text
PROGRAM:      CLIENT-ACCOUNTING-DELIVERY-AND-OFFICE-UX-PROGRAM-R01
THIS PAGE:    CLAUDE-C3        LANE OWNER: CLAUDE
PREDECESSOR:  C1-B01           SUCCESSOR: X3-B02+ (aynı dosya) · C1-B03 (UAT)
PARALEL:      C2 ∥ X1 ∥ X2 ∥ X3-B01
MUTATION:     BACKEND — şema YAZILMAZ (MIGRATION OWNER = X3)

ALLOWED PATHS:
  project/apps/api/src/modules/client-statement/**

FORBIDDEN PATHS:
  apps/api/src/modules/client-financial-disclosure/**       (X2 — XL-B tüketilir)
  apps/api/prisma/                                          (MIGRATION OWNER = X3)
  apps/web/**                                               (C1 · C2 · X1)
  project/docs/governance/CLIENT-MODULE-TERMINAL-COMPLETION-PROGRAM-R01/

SHARED CONTRACTS:
  client-safe insan-okur dosya referansı  → WRITER: X2 · C3 READ-ONLY tüketir (XL-B)
  ClientStatement / ClientStatementLine şeması → WRITER: X3 · C3 yalnız OKUR
  officeApproval eligibility               → READ-ONLY

BLOCK ORDER (DEĞİŞTİRİLEMEZ):
  C3-B01 → C3-B02 → C3-B03 → C3-B04 → C3-B05
BLOCKS TOTAL: 5   COMPLETED: 5   (B05 kalıcı adaptörü X3 şemasına bağlı)
ACTIVATION DEBT: CLOSED — (1) aylık schedule ACTIVE: CLIENT_STATEMENT_MONTHLY_DELIVERY=true
                 KALICI (W4-ACT02B), cron `0 3 1 * *` Europe/Istanbul, sonraki koşu 2026-09-01;
                 (2) kalıcı teslim defteri PRODUCTION'DA: migration 20260809090500 APPLIED
                 (frontier 125/125), canlı ledger SENT×1 (R02 uzlaştırması 2026-08-12 salt-okuma)
PROGRAM LOCK: CLIENT ACCOUNTING DELIVERY + CLIENT OFFICE UX ONLY
```

---

## C3-B01 — EKSTRE VERİ SÖZLEŞMESİ VE CLIENT-SAFE REFERANS TÜKETİMİ

Ekstre render'ının **hangi alanları** taşıyacağı POL-4 sınırıyla sabitlenir.

```text
- Client-level ve case-level ekstre semantiği AYRI tutulur ve KARIŞTIRILMAZ.
  (ClientStatement.caseId = null → client-level; dolu → case-level)
- client-level satırlarda ClientStatementLine.caseId ZORUNLU doldurulur
  (şemadaki davranış kuralı testle kilitlenir).
- İç ID'ler (refId, caseClientId, statementId) render çıktısına GİRMEZ.
- Dosya referansı X2'nin primitifinden alınır; C3 kendi kopyasını ÜRETMEZ (XL-B).
```

**ÖNCÜL NOTU:** X2'nin primitifi henüz merge edilmediyse bu blok
`WAITING_FOR_PREDECESSOR` olur; sıra ATLANMAZ.

**BLOCK RESULT:** `ENGINEERING_COMPLETE`

---

## C3-B02 — EKSTRE PDF ÜRETİMİ

`ClientStatement` + `ClientStatementLine` → insan-okur PDF.

```text
İÇERİK: açılış bakiyesi · hareket satırları (lineDate, lineType, debit, credit,
        runningBalance, note) · kapanış bakiyesi · dönem · para birimi · ofis kimliği
KÜTÜPHANE: pdfmake veya pdfkit.
⛔ pdf-poppler KULLANILMAZ — Linux'ta jest worker'ını düşürür ve CI manifest'ini kırar.
```

```text
- SUPERSEDED veya VOIDED ekstre PDF'e dönüştürülemez ve gönderilemez (fail-closed).
- Hareket tipleri kullanıcıya TÜRKÇE ve anlamlı etiketle gösterilir; enum adı basılmaz.
- Bilgi satırları (debit=0, credit=0) bakiyeyi oynatmadıkları AÇIKÇA anlaşılacak
  biçimde gösterilir — POL-2'nin görsel karşılığı budur.
```

**BLOCK RESULT:** `ENGINEERING_COMPLETE`

---

## C3-B03 — İÇERİKLİ EKSTRE MAİLİ + PDF EKİ

Bugünkü `STATEMENT_READY` yalnız 4 token taşır (`periodStart`, `periodEnd`,
`closingBalance`, `officeName`) ve **best-effort**'tur.

```text
- Mail yalnız "ekstreniz hazır" DEMEZ: güvenli özet + PDF EKİ taşır.
- Ek gönderimi mevcut email-provider attachment desteği üzerinden yapılır.
- Özet içeriği POL-4 sınırına tabidir; iç ID ve başka müvekkil verisi İÇERMEZ.
- Alıcı doğrulaması gönderimden ÖNCE yapılır (mevcut fail-closed desen korunur).
```

**BLOCK RESULT:** `ENGINEERING_COMPLETE`

---

## C3-B04 — PERİYODİK ÜRETİM VE GÖNDERİM (P6)

```text
- Türkiye saat diliminde AYLIK üretim/gönderim. scheduler-timezone.ts KULLANILIR.
- Desen emsali: automation/poa-expiry-delivery.service.ts (zamanlanmış teslim).
- Aynı tenant + müvekkil + dönem için duplicate ÜRETİM ve duplicate GÖNDERİM
  ENGELLENİR. (D-5 gerçek durma koşulu)
- Şema kısıtı gerekirse X3'e bildirilir; C3 migration YAZMAZ.
- Varsayılan KAPALI başlar; kalıcı schedule activation owner teyidine tabidir
  → ACTIVATION DEBT olarak kaydedilir.
```

**BLOCK RESULT:** `ENGINEERING_COMPLETE` (+ olası `ACTIVATION_PENDING`)

---

## C3-B05 — KALICI OUTBOX / RETRY / IDEMPOTENCY / AUDIT

```text
- Sadece logger.warn ile kaybolan best-effort gönderim KABUL EDİLMEZ.
- Kalıcı outbox + kontrollü retry + idempotency anahtarı + audit kaydı kurulur.
- Failure visibility: başarısız gönderim operatöre GÖRÜNÜR olur; sessiz kayıp YASAK.
- Retry idempotency'ye bağlıdır; "tekrar gönder" düğmesi anlamına GELMEZ.
- Şema gerekiyorsa X3'e bildirilir ve ayrı ACTIVATION DEBT olarak kaydedilir;
  production APPLY yalnız taze backup/restore kapısı ve owner'ın mevcut production
  mutation disipliniyle yapılır (D-7).
```

**BLOCK RESULT:** `ENGINEERING_COMPLETE` (+ olası `ACTIVATION_PENDING`)

---

## ÇÖZÜM DAYATMASI YASAĞI

Outbox'ın yeri (yeni tablo / mevcut notification altyapısının genişletilmesi /
job kuyruğu) ve PDF şablon motoru seçimi **peşinen belirlenmemiştir**; mevcut
altyapıya bakılarak kanıta dayanarak seçilir. Tek katı kısıt: **pdf-poppler yok**.

## GERÇEK DURMA KOŞULLARI (bu hatta)

**D-5** duplicate gerçek gönderim riski · **D-7** production migration için
backup/restore kapısının sağlanamaması · **D-2** başka müvekkil verisi sızıntısı.

---

## BLOK SONUÇLARI VE KANIT (C3 · repository-truth)

| Blok | Sonuç | PR | main SHA |
|---|---|---|---|
| C3-B01 | ENGINEERING_COMPLETE | #2275 · #2282 | `6551a168` · `f0816034` |
| C3-B02 | ENGINEERING_COMPLETE | #2285 | `1d886df7` |
| C3-B03 | ENGINEERING_COMPLETE | #2288 | `92886f4f` |
| C3-B04 | ENGINEERING_COMPLETE + ACTIVATION_PENDING | #2291 | `56cada24` |
| C3-B05 | ENGINEERING_COMPLETE (sözleşme/politika/bağlama) + ACTIVATION_PENDING (kalıcı adaptör = X3 şeması) | bu PR | — |

Ürün yazımı yalnız `apps/api/src/modules/client-statement/**` altında yapılmıştır.
`client-financial-disclosure/**` (X2), `prisma/**` (X3), `apps/web/**` ve eski
terminal programın dosyaları DEĞİŞTİRİLMEMİŞTİR.

## X3'E BAĞIMLILIK — KALICI TESLİM DEFTERİ ŞEMASI (C3-B05)

C3-B05 kalıcı defterin **davranışını** sözleşme + saf karar çekirdeği olarak
sabitledi (`client-statement-delivery-ledger.contract.ts`) ve aylık koşuyu bu
porta bağladı. Kalıcı **tablo** şema yazımı gerektirdiği için (MIGRATION OWNER =
X3) adaptör bu hatta yazılmamıştır. In-memory bir defter "kalıcı" sayılmamış,
koşu sonucu `persistentDeliveryLedger: false` ile bunu açıkça raporlamaktadır.

X3'ten istenen asgari şekil (emsal: `PoaExpiryNotificationDelivery` — aynı desen,
yeni politika icat edilmedi):

```text
tenantId · clientId · statementId · periodKey · recipientEmail
dedupeKey  @unique            ← çift gönderimi YAPISAL olarak imkânsız kılan kısıt
status     PENDING|SENT|FAILED
attempts · reservedAt · lastAttemptAt · nextRetryAt · sentAt · lastError
@@index([tenantId, status, createdAt]) · @@index([tenantId, clientId])
```

Sınırlar (emsalden devralındı, yeniden türetilmedi): MAX_ATTEMPTS=3,
RETRY_MINUTES=60, LOCK_TIMEOUT_MINUTES=15.

## ATTACHMENT CHAIN — OWNER DISPOSITION: OPTION A (RATIFIED) · BLOCKER CLOSED

`C3-ATTACHMENT-CHAIN-OUTSIDE-WRITE-ROOT` **CLOSED**. Owner, `client-notification/**`
için sınırlı yazma yetkisi verdi ve doğrudan provider çağrısını (Option B) reddetti.

```text
- SendEmailDto + DispatchInput → opsiyonel `attachments` (TAŞIMA-ONLY, backward-compatible)
- Zincir: dispatcher → ClientNotificationService → taşıma. Doğrudan provider çağrısı YOK.
- PDF Buffer kalıcı kayda YAZILMAZ; ClientNotification.metadata'ya yalnız ek KİMLİĞİ
  (filename + contentType) düşer.
- dedupeKey / status / persistence / audit otoritesi zincirde KALIR.
- Aynı teslim için provider çağrısı TAM 1 kez: dedupeKey SENT ise ek TAŞINMAZ.
- Provider hatasında kayıt FAILED damgalanır; SENT üretilmez.
- CLIENT_STATEMENT_DELIVERY_PORT artık bildirim zinciri adaptörüne bağlıdır.
```

**REPOSITORY-TRUTH DÜZELTMESİ:** owner metnindeki zincir
`dispatcher → ClientNotificationService → EmailProviderService` biçiminde tarif
edilmişti; gerçekte `ClientNotificationService.sendEmail` `EmailProviderService`'i
DEĞİL, doğrudan `nodemailer` transport'unu kullanır. Ek, bu kanonik zincirin son
halkasına (`transporter.sendMail`) geçirilmiştir. `EmailProviderService` çağrılmamış,
yeni bir gönderim yolu açılmamıştır — semantic outcome owner kararıyla aynıdır.

## ACTIVATION DEBT (owner teyidi olmadan AÇILMAZ)

1. **Aylık schedule activation** — `CLIENT_STATEMENT_MONTHLY_DELIVERY=true`.
   Bayrak kapalıyken cron **kaydı bile** yapılmaz; bu yüzden W3-F03 kanonik cron
   envanteri (33) bugün DEĞİŞMEMİŞTİR. Aktivasyon PR'ı envanter beklentisini de
   güncellemek zorundadır.
2. **Kalıcı teslim defteri** — yukarıdaki X3 şeması + adaptörün
   `CLIENT_STATEMENT_DELIVERY_LEDGER_PORT` olarak kaydı.

Taşıma portu bağlandığı için koşu artık `PORT` modundadır; ancak **aylık bayrak
kapalı** olduğundan koşu hiç çalışmaz ve production'da hiçbir müvekkile ekstre
maili GİTMEZ. Yukarıdaki iki kalem owner teyidine tabidir.

## SAYFA DURUMU VE HANDOFF

```text
STATUS: ENGINEERING_COMPLETE / PRODUCTION_ACTIVE / ACTIVATION_CLOSED
NOT:    Aylık teslim canlı ve zamanlanmış (W4-ACT02B); dönemsel ekstre canary'si PASS (C1-B04 R02).
HANDOFF: TAMAMLANDI — X3 şema/migration paketi APPLIED (frontier 125/125).
SONRAKİ HAT: NONE — PROGRAM TERMINAL_CLOSED (owner ratification 2026-08-12).
```

---

## FINAL RECONCILIATION (2026-08-12 — owner cross-lane yetkisiyle, yürütücü: Claude)

Bu sayfanın yaşayan durum satırları, owner'ın 2026-08-12 TERMINAL_CLOSED
ratifikasyonundaki açık cross-lane governance yetkisiyle kanıta göre düzeltildi.
Tarihsel blok kayıtları DEĞİŞTİRİLMEDİ. Kanıt: FD-ACTIVATION-RECONCILIATION-R01
(§3 runtime ölçümü + R02 canary kanıt tablosu) · W4-ACT02B-PRODUCTION-ACTIVATION-R01 ·
MASTER-PLAN §11 FINAL DISPOSITION. Program: PRODUCT_COMPLETE / PRODUCTION_ACTIVE /
TERMINAL_CLOSED.
