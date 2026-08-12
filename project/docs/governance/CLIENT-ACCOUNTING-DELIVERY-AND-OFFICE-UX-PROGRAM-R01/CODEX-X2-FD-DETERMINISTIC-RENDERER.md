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
BLOCKS TOTAL: 4   COMPLETED: 4   REMAINING: 0
ENGINEERING STATUS: ENGINEERING_COMPLETE / CLOSED
PRODUCTION STATUS: ACTIVE — LEVEL_2 (WRITE=true · PUBLICATION=true; runtime ölçümü,
                   FD-ACTIVATION-RECONCILIATION-R01 §3; renderer zinciri R02 canary'siyle
                   GERÇEK teslimde kanıtlandı 2026-08-11)
ACTIVATION: RECONCILED — yeni aktivasyon YAPILMADI, kayıt drift'i düzeltildi
NEXT ELIGIBLE: NONE — CLIENT PROGRAM TERMINAL_CLOSED (owner ratification 2026-08-12)
PROGRAM LOCK: CLIENT ACCOUNTING DELIVERY + CLIENT OFFICE UX ONLY
```

---

## X2 TERMINAL RECONCILIATION R01 — 2026-08-10

Bu bölüm mevcut ürün çıktılarının canonical `main` üzerindeki acceptance, test ve ancestry
kanıtını sayfaya uzlaştırır. **Reconciliation only; no new product implementation.**
Reconciliation öncesindeki `COMPLETED: 0` header değeri tarihsel, güncelliğini yitirmiş sayfa
durumuydu; blokların aşağıdaki ilk ürün PR'ları ve tüketici zinciri korunur.

Canonical reconciliation base:
`8b51602b5aacc63b3c21807e2645720597c5da48` (W4-ACT02B PR #2332). B01–B04 merge
SHA'larının ve X1/C3 tüketici SHA'larının tamamı bu base'in ancestry'sindedir.

### Block acceptance ve kanıt kütüğü

| Blok | Canonical ürün yolları | İlk ürün commit / PR / squash SHA | Acceptance + test kanıtı | Gerçek tüketiciler | Sonuç |
|---|---|---|---|---|---|
| **X2-B01** | `client-financial-disclosure-renderer.contract.ts`; `__tests__/client-financial-disclosure-canonical.spec.ts` | `00aedd3b9b2f5c2029bdbeefe4525f605aaaa5d6` / #2274 / `9ba28b018e2be1761d7a9f0e4e8e849133ee746a` | Input yalnız `CLIENT_DISCLOSURE_ALLOWED_FIELDS` + `CLIENT_DISCLOSURE_ALLOWED_LINE_FIELDS` üzerinden türetilir; `Exact<>` + opaque brand ek anahtarları derleme zamanında reddeder; forbidden top-level/line `@ts-expect-error` kilidi ve frozen input/output testi mevcut. #2274 focused **1 suite / 17 test**, pure/client-portal manifest **80 suite / 1164 test**, production type-check PASS; GitHub current-head check seti **9/9 SUCCESS**. | X1 office preview zinciri `client-financial-disclosure-office-contract.ts` ile `ClientFinancialDisclosureRenderOutputV1` tipini tüketir ve `client-financial-disclosure-office-service.ts` aynı renderer'ı çağırır; ilk consumer PR #2281 / `0dffab3f96243e17c406f6e15a80688b7ebb9330`. Publication aynı frozen contract'ın fail-closed decoder'ını tüketir. | **COMPLETE** |
| **X2-B02** | `client-financial-disclosure-renderer.ts`; `__tests__/client-financial-disclosure-renderer.spec.ts` | `8f24bea963c031c98f47e488f3e7ad6b4e46b6ba` / #2277 / `4e741675118e531a77ba31c9f77b1e08985e9e9b` | Saf renderer saat, randomness, environment locale veya mutable state okumaz; explicit satır sırası, Türkçe etiketler, canonical Decimal ve UTC tarih formatı kullanır. Test aynı input/reordered lines için byte-equivalent output'u, enum adlarının sızmamasını ve unsafe text fail-closed davranışını kilitler. #2277 focused **2 suite / 28 test**, manifest **80 suite / 1164 test**, production type-check PASS; GitHub current-head check seti **9/9 SUCCESS**. | `client-financial-disclosure-approval.service.ts` onay adayını bu renderer'dan üretir; X1 `client-financial-disclosure-office-service.ts` preview için aynı renderer'ı tüketir. | **COMPLETE** |
| **X2-B03** | `client-safe-file-reference.contract.ts`; `client-financial-disclosure-projection.service.ts`; `__tests__/client-safe-file-reference.spec.ts` | `3145884cc6858927d17cb7df7257b503574c1dca` / #2279 / `3cbcd592001e4c525c9b919598acb34221accf29` | Tek kaynak `Case.fileNumber`, etiket `Büro dosya no`; factory generic ID kabul etmez, boş/unsafe değer fail-closed olur ve `executionFileNumber`/iç ID fallback'i yoktur. #2279 focused **3 suite / 35 test**, manifest **80 suite / 1164 test**, production type-check PASS; GitHub current-head check seti **9/9 SUCCESS**. C3 scope testi `client-statement-file-reference-c3b01.spec.ts`, aynı tenant + aynı client `CaseClient` bağı olmadan referans üretmez. | X2 renderer ve projection doğrudan tüketir. C3 `client-statement-render.contract.ts` ile `client-statement-file-reference.ts` üzerinden read-only import eder; consumer PR #2282 / `f0816034ab17a6e5c56c7e6c8b0bd147a1c74831`, focused **12/12**, GitHub check seti **9/9 SUCCESS**. C3 paralel primitive üretmez. | **COMPLETE** |
| **X2-B04** | `client-financial-disclosure-approval.service.ts`; `client-financial-disclosure-publication.service.ts`; `client-financial-disclosure-renderer.contract.ts`; `dto/client-financial-disclosure.dto.ts`; ilgili approval/publication/renderer DB ve pure spec'leri | `6a5cff7a09ebdd997eb4827a09d15c64c78bbdea` / #2286 / `36e2faffff8a5c4d612019cf37cdc4db572f4c1a` | Content approval serbest `notificationContent` kabul etmez; renderer `{subject,text}` çıktısını canonical serialize edip mevcut content hash'ine mühürler. Publication re-render veya caller subject/body kullanmaz, exact sealed payload'ı parse eder; provider dönüşünden sonra snapshot/content/recipient tekrar doğrulanır ve `updateMany().count === 1` guarded transition korunur. Regression kilitleri: forbidden alan yok, determinism, onay sonrası içerik değişmez, tenant/object-scope fail-closed. #2286 pure **5 suite / 66 test**, manifest **80 suite / 1165 test**, disposable PostgreSQL **5 suite / 76 test** (skip yok), publication DB suite **1 suite / 26 test** (skip yok), production type-check PASS; GitHub current-head check seti **9/9 SUCCESS**. | Approval service sealed payload'ı üretir; publication service yalnız bunu dispatch eder; controller DTO'larında caller-provided content/subject yoktur. X1 preview aynı renderer output contract'ını tüketir. | **COMPLETE** |

### Güvenlik, yayınlama ve aktivasyon ayrımı

- Client projection allowlist'i internal approver/provider/hash/source/tenant/client alanlarını ve
  `executionFileNumber`'ı dışarıda tutar; tenant + portal user + client + `CaseClient` kapsamı
  server tarafında yeniden çözülür. Bulunmayan ve kapsam dışı kayıtlar varlık sızdırmayan aynı
  client-safe hata sınırında kalır.
- Content approval ve publication, mevcut stale snapshot/hash/recipient/four-eyes ve conditional
  update kapılarını tüketir; renderer bu business logic'i çoğaltmaz. Publication/provider/idempotency
  semantiği reconciliation kapsamında değiştirilmemiştir.
- Onaylı provider allowlist'i yalnız `smtp`, `sendgrid`, `ses` değerleridir. `mock`, boş veya
  listede olmayan provider fail-closed dispatcher'a gider ve production publication yetkisi
  üretmez.
- `CLIENT_FINANCIAL_DISCLOSURE_WRITE_ENABLED` ve
  `CLIENT_FINANCIAL_DISCLOSURE_PUBLICATION_ENABLED` yalnız exact `true` ile açılır ve default-off
  kalır. Gerçek provider/production flag aktivasyonu ve gerçek production doğrulaması bu
  reconciliation'da yapılmamıştır.
- W4-ACT02B #2332, `CLIENT_STATEMENT_MONTHLY_DELIVERY` aktivasyonudur; X2 Financial Disclosure
  publication'ının production'da aktif olduğunu kanıtlamaz.

```text
CODE_PRESENT:          YES
ENGINEERING_COMPLETE:  YES / CLOSED
PRODUCTION_ACTIVE:     NO — OWNER-GATED / NOT PERFORMED
PRODUCT DIFF:          NONE (DOCS-ONLY RECONCILIATION)
X2 BLOCKS:             4/4 COMPLETE
NEXT ELIGIBLE:         CLIENT PROGRAM TERMINAL CONSOLIDATION
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

**Tarihsel planlama notu:** baseline'da `ALLOWED_FIELDS` içinde dosya referansı yoktu ve
POL-4 kaynak kararı verilmeden blok `WAITING_FOR_OWNER_DECISION` olacaktı. Owner daha sonra
tek kaynak olarak `Case.fileNumber`, etiket olarak `Büro dosya no` ve fallback olmaması
kararını ratifiye etti; #2279 bu kararı uyguladı. Bu nedenle bekleme kapısı kapanmıştır.

**BLOCK RESULT:** `ENGINEERING_COMPLETE`

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

---

## FINAL RECONCILIATION (2026-08-12 — owner cross-lane yetkisiyle, yürütücü: Claude)

Bu sayfanın yaşayan durum satırları, owner'ın 2026-08-12 TERMINAL_CLOSED
ratifikasyonundaki açık cross-lane governance yetkisiyle kanıta göre düzeltildi.
Tarihsel blok kayıtları DEĞİŞTİRİLMEDİ. Kanıt: FD-ACTIVATION-RECONCILIATION-R01
(§3 runtime ölçümü + R02 canary kanıt tablosu) · W4-ACT02B-PRODUCTION-ACTIVATION-R01 ·
MASTER-PLAN §11 FINAL DISPOSITION. Program: PRODUCT_COMPLETE / PRODUCTION_ACTIVE /
TERMINAL_CLOSED.
