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
BLOCKS TOTAL: 5   COMPLETED: 0
ACTIVATION DEBT: HENÜZ DOĞMADI — C3-B04 üretebilir (schedule activation)
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
