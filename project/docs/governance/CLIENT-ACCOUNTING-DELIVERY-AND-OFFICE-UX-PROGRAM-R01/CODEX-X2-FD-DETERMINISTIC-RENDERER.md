# X2 — FD DETERMİNİSTİK İÇERİK RENDERER'I (P4)

```text
PROGRAM:      CLIENT-ACCOUNTING-DELIVERY-AND-OFFICE-UX-PROGRAM-R01
THIS PAGE:    CODEX-X2         LANE OWNER: CODEX
PREDECESSOR:  C1-B01           SUCCESSOR: X1-B03 (XL-A) · C3-B01 (XL-B) · C1-B03
PARALEL:      C2 ∥ C3 ∥ X1 ∥ X3-B01
MUTATION:     BACKEND — şema GEREKMİYORSA migration ÜRETİLMEZ

ALLOWED PATHS:
  project/apps/api/src/modules/client-financial-disclosure/**

FORBIDDEN PATHS:
  apps/api/src/modules/client-statement/**                    (C3)
  apps/api/prisma/                                            (MIGRATION OWNER = X3)
  apps/web/**                                                 (C1 · C2 · X1)
  project/docs/governance/CLIENT-MODULE-TERMINAL-COMPLETION-PROGRAM-R01/

BU HATTIN SAHİP OLDUĞU PAYLAŞIMLI SÖZLEŞMELER:
  client-financial-disclosure-projection.contract.ts   → X2 TEK WRITER
  client-safe insan-okur dosya referansı primitifi     → X2 TEK WRITER (XL-B)
  render sözleşmesi (X1'in tükettiği)                  → X2 üretir ve DONDURUR (XL-A)

BLOCK ORDER (DEĞİŞTİRİLEMEZ):
  X2-B01 → X2-B02 → X2-B03 → X2-B04
BLOCKS TOTAL: 4   COMPLETED: 0   ACTIVATION DEBT: NONE (beklenen)
PROGRAM LOCK: CLIENT ACCOUNTING DELIVERY + CLIENT OFFICE UX ONLY
```

---

## SORUNUN TAM TANIMI (kanıt, baseline c867c18a)

```ts
// dto/client-financial-disclosure.dto.ts
class RequestDisclosureContentApprovalDto { notificationContent: string; ... }
class PublishClientFinancialDisclosureDto { subject: string; }
// client-financial-disclosure-email-dispatcher.ts
async send(input: { to: string; subject: string; text: string })
```

Mail gövdesi **operatörün elle yazdığı serbest metindir**; finansal veriden
üretilmez. Canary'de gözlenen *"Müvekkil bilgilendirme — w5 canary"* içeriğinin
sebebi budur. Bu bir bug değil, **eksik bileşendir**: renderer yok.

Veri **zaten mevcut**: `CLIENT_DISCLOSURE_ALLOWED_FIELDS` bugün
`totalCollected` · `clientNetAmount` · `lines` · `currency` · `publishedAt` ·
`remittanceStatus` içerir. `ALLOWED_LINE_FIELDS` = `['type','amount']`.

---

## X2-B01 — RENDER SÖZLEŞMESİ + TİP DÜZEYİNDE FORBIDDEN ENGELİ

```text
- Renderer'ın girdi tipi YALNIZ ALLOWED_FIELDS + ALLOWED_LINE_FIELDS'tan türetilir.
- FORBIDDEN alanların renderer'a girmesi TİP DÜZEYİNDE İMKÂNSIZ olur —
  runtime kontrolüne güvenilmez. Yasak alan kullanan kod DERLENMEZ.
- Sözleşme X1 tarafından tüketilecek şekilde DIŞA VERİLİR ve çıkışta DONDURULUR (XL-A).
```

**Neden tip düzeyinde:** çalışma zamanı filtresi, gelecekte eklenen bir alanı sessizce
geçirebilir. Tip kısıtı geçiremez. POL-4 bir sızıntı sınırıdır; en katı mekanizmayı
hak eder.

**BLOCK RESULT:** `ENGINEERING_COMPLETE`

---

## X2-B02 — DETERMİNİSTİK TÜRKÇE İÇERİK ÜRETİMİ

**Üretilen içerikte ASGARİ olarak:**

```text
- tahsil edilen toplam        (totalCollected)
- müvekkil net payı           (clientNetAmount)
- kesinti kalemleri           (lines: type + amount, Türkçe etiketlerle)
- para birimi                 (currency)
- yayın tarihi                (publishedAt)
- izin verilen insan-okur dosya referansı   (X2-B03 primitifi)
```

```text
- Aynı FD versiyonu için üretim DETERMİNİSTİKTİR: aynı girdi → aynı çıktı.
  Testle kilitlenir (rastgelelik, saat damgası enjeksiyonu, sıralama belirsizliği YOK).
- Satır tipleri kullanıcıya TÜRKÇE ve anlamlı etiketle gösterilir; enum adı basılmaz.
- HELD_PENDING_DISTRIBUTION gibi bilgi satırlarının ne anlama geldiği
  müvekkilin anlayacağı dille yazılır.
```

**BLOCK RESULT:** `ENGINEERING_COMPLETE`

---

## X2-B03 — CLIENT-SAFE İNSAN-OKUR DOSYA REFERANSI PRİMİTİFİ  ⟵ XL-B

```text
- POL-4'ün gerektirdiği referans TEK YERDE tanımlanır; WRITER = X2.
- Hangi alanın "insan-okur dosya referansı" olduğu REPOSITORY'DEN DOĞRULANIR —
  uydurulmaz. Uygun alan yoksa politika UYDURULMAZ; exact teknik boşluk
  RAPORLANIR ve master plana disposition için gönderilir.
- Raw caseClientId / collectionDispositionId / sourceCollectionId FORBIDDEN kalır.
- C3 bu primitifi READ-ONLY tüketir; kendi kopyasını ÜRETMEZ.
```

**Not:** bugünkü `ALLOWED_FIELDS` içinde dosya referansı **yoktur**. Eklenmesi
FORBIDDEN sınırının genişletilmesi anlamına gelirse bu bir **owner kararıdır**
(POL-4). O durumda blok `WAITING_FOR_OWNER_DECISION` olur ve **sıra atlanmaz**;
X2'nin diğer blokları etkilenmez.

**BLOCK RESULT:** `ENGINEERING_COMPLETE` veya `WAITING_FOR_OWNER_DECISION`

---

## X2-B04 — MÜHÜRLEME ZİNCİRİ ENTEGRASYONU + REGRESYON KİLİDİ

```text
- Serbest notificationContent TEK KAYNAK olmaktan ÇIKARILIR.
- Mevcut content-approval hash/mühürleme zinciri KORUNUR — onaylanan içerik
  neyse gönderilen odur; renderer onay ANINDAN SONRA içeriği DEĞİŞTİREMEZ.
- Şema gerekmiyorsa migration ÜRETİLMEZ.

KİLİTLENECEK REGRESYONLAR:
  (1) FORBIDDEN alan render çıktısına giremez
  (2) aynı versiyon → aynı çıktı (determinizm)
  (3) onaydan sonra içerik değişmez (mühür bütünlüğü)
  (4) başka müvekkile ait veri hiçbir yoldan projeksiyona giremez
```

**BLOCK RESULT:** `ENGINEERING_COMPLETE`

---

## ÇÖZÜM DAYATMASI YASAĞI

Renderer'ın yeri (ayrı servis / mevcut publication servisinin genişletilmesi / saf
fonksiyon modülü) ve şablon biçimi (düz metin / yapılandırılmış blok) **peşinen
belirlenmemiştir**; mevcut modül desenine bakılarak kanıta dayanarak seçilir.

## GERÇEK DURMA KOŞULLARI (bu hatta)

**D-1** owner politikasıyla gerçek çelişki · **D-2** başka müvekkil verisi sızıntısı.
