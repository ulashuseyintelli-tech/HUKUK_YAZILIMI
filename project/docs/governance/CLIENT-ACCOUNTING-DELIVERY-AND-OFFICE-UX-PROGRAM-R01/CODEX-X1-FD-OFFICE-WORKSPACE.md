# X1 — OFİS FINANCIAL DISCLOSURE ÇALIŞMA ALANI (P3)

```text
PROGRAM:      CLIENT-ACCOUNTING-DELIVERY-AND-OFFICE-UX-PROGRAM-R01
THIS PAGE:    CODEX-X1         LANE OWNER: CODEX
PREDECESSOR:  C1-B01 + C1-B02  ·  X1-B03 için ayrıca X2 (XL-A)
SUCCESSOR:    C1-B03 (UAT)
PARALEL:      C2 ∥ C3 ∥ X2 ∥ X3-B01
MUTATION:     FRONTEND — şema YOK, migration YOK, backend sözleşmesi DEĞİŞMEZ

ALLOWED PATHS:
  project/apps/web/src/components/client-disclosure/**                    (YENİ)
  project/apps/web/src/app/(dashboard)/clients/[clientId]/disclosures/**  (YENİ)
  project/apps/web/src/lib/api/client-financial-disclosure.ts             (YENİ)
  <navigasyon/sekme kaydı>            → PAYLAŞIMLI APPEND-ONLY (master plan §3-B)

FORBIDDEN PATHS:
  apps/web/src/components/client-compliance/**                            (C2)
  apps/web/src/app/(dashboard)/clients/[clientId]/compliance/**           (C2)
  apps/web/src/components/client-accounting/**                (ÇALIŞAN EKRAN)
  apps/web/src/components/client/**                           (C1-B02 manifest yüzeyi)
  apps/web/src/app/portal/**                                  (C1-B03 doğrular)
  apps/api/**  ·  apps/api/prisma/                            (C3 · X2 · X3)
  project/docs/governance/CLIENT-MODULE-TERMINAL-COMPLETION-PROGRAM-R01/

BLOCK ORDER (DEĞİŞTİRİLEMEZ):
  X1-B01 → X1-B02 → X1-B03 → X1-B04 → X1-B05
BLOCKS TOTAL: 5   COMPLETED: 0   ACTIVATION DEBT: NONE
PROGRAM LOCK: CLIENT ACCOUNTING DELIVERY + CLIENT OFFICE UX ONLY
```

---

## CROSS-LANE BAĞ — XL-A

```text
X1-B03 (deterministik finansal önizleme) X2'nin render sözleşmesini TÜKETİR.
X2'nin sözleşme bloğu MERGE EDİLMEDEN X1-B03 BAŞLAMAZ → WAITING_FOR_PREDECESSOR.
X1-B01, B02, B04, B05 bu bağdan ETKİLENMEZ.
SIRA ATLANMAZ: B03 beklerken B04'e geçilmez; sayfa B03'te bekler.
```

---

## X1-B01 — LİSTE, DETAY VE VERSİYON GEÇMİŞİ

```text
- Durum rozetleri MEVCUT backend durumlarından türetilir:
  SENT · PUBLISHED · FAILED · SUPERSEDED (+ reversal görünürlüğü).
- Versiyon geçmişi hangi versiyonun CURRENT-EFFECTIVE olduğunu açıkça gösterir.
- POL-4: iç ID'ler (caseClientId, collectionDispositionId, sourceCollectionId)
  ekranda, URL'de, tooltip'te veya kopyalanabilir alanda GÖRÜNMEZ.
- Yalnız izin verilen projeksiyon alanları gösterilir.
```

**BLOCK RESULT:** `ENGINEERING_COMPLETE`

---

## X1-B02 — YALNIZ POSTED DISPOSITION'DAN HAZIRLAMA

```text
- Kaynak seçimi YALNIZ POSTED disposition'lar arasından yapılabilir.
  POSTED olmayan kaynak listede GÖRÜNMEZ — "seç ve sunucudan reddedil" deseni YASAK.
- Bir POSTED disposition için zaten disclosure kökü varsa ekranda GÖRÜNÜR şekilde
  belirtilir. (Şema @@unique([tenantId, collectionDispositionId]) uygular; UI bunu
  kullanıcıya ÖNCEDEN söyler.)
```

**BLOCK RESULT:** `ENGINEERING_COMPLETE`

---

## X1-B03 — DETERMİNİSTİK FİNANSAL ÖNİZLEME  ⟵ XL-A

```text
- Önizleme X2'nin RENDERER'INDAN gelir.
- X1 kendi metnini ÜRETMEZ, kendi formatlama kuralını KURMAZ.
  Aksi halde ekranda görünen ile müvekkile giden içerik AYRIŞIR — bu bir
  doğruluk riskidir, kozmetik tercih değildir.
- Önizleme ile yayınlanan içeriğin AYNI KAYNAKTAN geldiği testle KİLİTLENİR.
```

**ÖNCÜL:** X2 sözleşme bloğu MERGED.
**BLOCK RESULT:** `ENGINEERING_COMPLETE`

---

## X1-B04 — ONAY ZİNCİRİ EKRANLARI (office approval → content approval → publish)

**POL-5 burada uygulanır.**

```text
- Staff kullanıcı nihai onay veya yayın aksiyonunu GÖREMEZ ve ÇAĞIRAMAZ.
- Yetki kontrolü MEVCUT canonical eligibility yüzeylerinden okunur;
  YENİ yetki modeli KURULMAZ, üç farklı eligibility BİRLEŞTİRİLMEZ/NORMALİZE EDİLMEZ.
- UI'da gizlemek TEK BAŞINA YETERLİ DEĞİLDİR: yetkisiz çağrının backend'de de
  reddedildiği testle KİLİTLENİR (fail-closed).
- Onaylanan içerik ve alıcı, mevcut mühürleme (hash) zincirine DOKUNULMADAN gönderilir.
```

**BLOCK RESULT:** `ENGINEERING_COMPLETE`

---

## X1-B05 — AUDIT ZAMAN ÇİZELGESİ VE KONTROLLÜ RETRY

```text
- Duplicate-send butonu OLUŞTURULMAZ. (D-5)
- Retry gerekiyorsa: idempotency anahtarına bağlı, yetki kanıtlı, AYRI ve açıkça
  etiketlenmiş bir aksiyon olur; "tekrar gönder" kılığında normal buton OLMAZ.
- Audit zaman çizelgesi aktör ve zaman bilgisini gösterir; POL-4 gereği iç ID'leri
  ve başka müvekkile ait hiçbir veriyi AÇMAZ.
- FAILED durumunda hata operatöre ANLAMLI gösterilir; ham sağlayıcı hata gövdesi
  (sendFailureDetail vb. FORBIDDEN alanlar) ekrana BASILMAZ.
```

**BLOCK RESULT:** `ENGINEERING_COMPLETE`

---

## ÇÖZÜM DAYATMASI YASAĞI

Çalışma alanının yerleşimi (müvekkil detayında yeni sekme / ayrı route / dosya
bağlamında alt sayfa) peşinen belirlenmemiştir; mevcut
`(dashboard)/clients/[clientId]` desenine bakılarak kanıta dayanarak seçilir.

## GERÇEK DURMA KOŞULLARI (bu hatta)

**D-2** başka müvekkil verisi sızıntısı · **D-4** staff final approval/publish
erişimi · **D-5** duplicate gerçek gönderim riski.
