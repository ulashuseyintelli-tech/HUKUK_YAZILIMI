# ADR — Client Offset / Cross-Ledger Settlement (Müvekkil Mahsubu)

- **Status:** Accepted (after review — Ulaş, 2026-06-28). Faz C kodu bu ADR main'e MERGE edilmeden başlamaz.
- **Scope:** TM3 Müvekkil Muhasebesi Faz C. Faz A (read-model: summary + Genel Cari + movements) ve
  Faz B (client-level immutable ekstre) main'de + dev-applied. Bu ADR yalnız TASARIM; kod/şema/migration YOK.
- **Related:** [[collection-disposition-design]] · `tm3-collection-disposition-boundary.md` · Faz B (#587/#590) ·
  Guided-Open yetki ([[authz-workstream-handoff]]).

> **Locked invariant (verbatim):**
> *Offset is an immutable settlement event that reduces two opposite client-specific gross balances by the
> same amount without changing the client net position and without mutating any existing statement.*

---

## 1. Context

Müvekkilin client-level carisinde iki KARŞIT, müvekkile-özgü brüt bakiye birikir:

```
(+) Müvekkile borç (proceeds payable) = Σ POSTED CLIENT_PAYABLE (collection CONFIRMED) − Σ RECORDED ClientPayout
(−) Müvekkilin masraf borcu           = Σ ExpenseRequest (≠CANCELLED) − Σ ExpensePayment
```

İki yön farklı kanonik bağlar taşır:
- **Proceeds payable** → `CollectionDispositionLine(type=CLIENT_PAYABLE)` + `ClientPayout`; kanonik bağ = **`caseClientId`** (CaseClient.id). Çoklu-alacaklı dosyada alacaklıyı PINLER.
- **Masraf borcu** → `ExpenseRequest` (+`ExpensePayment`); kanonik bağ = **`clientId`** (+`caseId`). ExpenseRequest'te `caseClientId` YOKTUR.

"Mahsup" = bu iki yönü **nakit hareketi olmadan** aynı tutarda karşılıklı kapatmak. Bu artık projeksiyon
değil, **finansal mutasyondur** → ayrı immutable event + invariant + approval + denetim şart.

## 2. Non-goals (Faz C v1'de KESİNLİKLE YOK)

```
- Otomatik mahsup (her zaman manuel; sistem kendiliğinden mahsup ETMEZ)
- Cross-tenant mahsup (KESİNLİKLE yasak)
- Cross-client mahsup (KESİNLİKLE yasak; iki leg de aynı clientId)
- Cross-currency mahsup (v1'de yok; iki leg aynı currency)
- Yeni genel ledger açmak (ClientOffset ayrı entity; BalanceLedger/yeni-defter DEĞİL)
- ClientPayout method=OFFSET (payout NAKİT settlement kalır; mahsup ayrı event)
- Projection içinde "sessiz" mahsup (mahsup yalnız explicit ClientOffset event'iyle olur)
- Mevcut bir statement'ı mutate etmek (immutable; mahsup yeni satır olarak gelir)
- Pending/rezervasyon aşaması (v1'de yok; final apply tx'inde re-validate)
```

## 3. Accounting invariants

```
I1. offset.amount > 0
I2. offset.amount payableLeg == offset.amount expenseLeg   (asimetri YOK; tek amount iki legi azaltır)
I3. offset.amount ≤ min(payableAvailableOutstanding, expenseUnpaidAvailable)   (aşırı-mahsup RED)
I4. NET pozisyon DEĞİŞMEZ: payable −amount, masraf-borcu −amount → net (payable−masrafBorcu) sabit.
    Yalnız iki brüt şişkinlik sönümlenir.
I5. payableLeg.clientId == expenseLeg.clientId == ClientOffset.clientId   (cross-client yasak)
I6. payableLeg.tenantId == expenseLeg.tenantId == ClientOffset.tenantId   (cross-tenant yasak)
I7. payableLeg.currency == expenseLeg.currency == ClientOffset.currency   (cross-currency yok, v1)
I8. payableLeg.caseId != expenseLeg.caseId OLABİLİR   (cross-case SERBEST)
I9. ClientOffset IMMUTABLE: update/delete YOK. Düzeltme = REVERSAL counter-row (bkz §7).
I10. Eligibility apply-tx İÇİNDE re-validate edilir (approval anındaki hesap yetmez — bkz §9).
```

## 4. Decision (kilitli)

| Konu | Karar |
|---|---|
| Mahsup otomatik mi? | Hayır — her zaman manuel (kullanıcı başlatır) |
| Kısmi mahsup | Evet |
| Cross-case mahsup | Evet |
| Cross-tenant | Kesinlikle hayır |
| Cross-client | Kesinlikle hayır |
| Cross-currency | Faz C v1'de hayır |
| Mahsup event mi? | Evet — ayrı immutable event (`ClientOffset`) |
| Mevcut statement değişir mi? | Hayır (immutable; yeni satır) |
| Yeni ledger açılır mı? | Hayır (ayrı entity, BalanceLedger değil) |
| `ClientPayout method=OFFSET`? | Hayır |
| Projection içinde sessiz mahsup | Hayır |

## 5. Data model proposal — `ClientOffset` (ayrı tablo)

```
model ClientOffset {
  id        String          // cuid
  tenantId  String
  clientId  String          // I5/I6: tek müvekkil/tenant
  currency  String          // I7
  amount    Decimal(15,2)   // I1; tek tutar, iki legi de azaltır (I2)

  kind             ClientOffsetKind   // APPLY | REVERSAL  (§7)
  reversesOffsetId String?            // REVERSAL ise → orijinal APPLY id; APPLY ise null (self-ref, FK gevşek)

  // PAYABLE leg (proceeds payable; kanonik bağ caseClientId)
  payableCaseId       String
  payableCaseClientId String          // CaseClient.id — alacaklıyı PINLER (çoklu-alacaklı güvenliği)

  // EXPENSE leg (masraf borcu; ExpenseRequest clientId+caseId-scoped, caseClientId YOK)
  expenseCaseId       String
  // expenseCaseClientId YOK: ExpenseRequest caseClientId taşımaz; müvekkil bağı top-level clientId'dir.

  createdById  String
  approvedById String?      // approval mimarisi (§8)
  approvalRef  String?      // confirm-token / approval kayıt id (ham token DEĞİL)
  createdAt    DateTime

  @@index([tenantId, clientId])
  @@index([reversesOffsetId])
  @@unique([tenantId, reversesOffsetId])   // double-reversal guard (§7); NULL'lar unique'e girmez (Postgres)
}

enum ClientOffsetKind { APPLY  REVERSAL }
```

Notlar:
- **Asimetrik bağ kasıtlı:** payable leg `caseClientId` (kanonik proceeds bağı, çoklu-alacaklıda doğru kişi),
  expense leg `caseId`+top-level `clientId` (ExpenseRequest caseClientId taşımaz). Yanlış-kişi riski payable
  tarafında `payableCaseClientId` ile, expense tarafında `clientId` eşitliğiyle (I5) kapatılır.
- `@@unique([tenantId, reversesOffsetId])` → bir APPLY en fazla bir kez reverse edilir. Prisma nullable-unique
  desteği kısıtlıysa raw migration ile partial unique index (`WHERE reversesOffsetId IS NOT NULL`) garanti edilir.

## 6. Statement behavior — 4 explicit satır tipi

`ClientStatementLineType`'a 4 YENİ değer (generic `OFFSET` REDDEDİLDİ — muğlak):

| Line type | Net delta (Ekstre Net Bakiyesi'ne) | Örnek label (FE) |
|---|---:|---|
| `CLIENT_OFFSET_PAYABLE_APPLIED`  | `−amount` | Müvekkile Borçtan Mahsup Edildi |
| `CLIENT_OFFSET_EXPENSE_APPLIED`  | `+amount` | Masraf Borcuna Mahsup Edildi |
| `CLIENT_OFFSET_PAYABLE_REVERSED` | `+amount` | Mahsup İptali: Müvekkile Borç Geri Yüklendi |
| `CLIENT_OFFSET_EXPENSE_REVERSED` | `−amount` | Mahsup İptali: Masraf Borcu Geri Yüklendi |

```
APPLY toplam delta   = (−amount) + (+amount) = 0   → Ekstre Net Bakiyesi DEĞİŞMEZ (I4); iki brüt sönümlenir.
REVERSAL toplam delta= (+amount) + (−amount) = 0   → net yine sabit; iki brüt geri yüklenir.
```

- Mevcut ACTIVE statement **mutate edilmez** (immutable). Mahsup yalnız **yeni** client-level ekstre
  üretiminde/supersede'inde yeni satır(lar) olarak görünür.
- Satırlar `refType='ClientOffset'`, `refId=offset.id`, `caseId=ilgili leg caseId` taşır.

## 7. Reversal model (immutable-uyumlu)

```
APPLY row     : kind=APPLY,    reversesOffsetId=null
REVERSAL row  : kind=REVERSAL, reversesOffsetId=<orijinal APPLY id>,
                amount/currency/payableLeg/expenseLeg = orijinalle AYNI
```

- Orijinal APPLY kaydı **ASLA update edilmez** (taslaktaki `status=REVERSED` + update yaklaşımı REDDEDİLDİ).
- "Reversed mı?" **türetilir:** `exists ClientOffset where kind=REVERSAL and reversesOffsetId = original.id`.
- Double-reversal engeli: `@@unique([tenantId, reversesOffsetId])` (§5).
- Reversal yalnız mevcut, henüz reverse edilmemiş bir APPLY'a yapılır; her zaman gated (§8).

## 8. Approval model

```
Capability (CHANGE_STATUS DEĞİL — ayrı, yetki kirliliği önlenir):
  CLIENT_OFFSET_APPLY
  CLIENT_OFFSET_REVERSE

Faz C v1 kuralı:
  - Partner/Admin: apply + reverse yapabilir.
  - Diğer roller: initiate/request edebilir → Guided-Open confirm-gate'e düşer.
  - Cross-case offset (payableCaseId != expenseCaseId): HER ZAMAN gated.
  - Reversal: HER ZAMAN gated.
  - Aynı-dosya-içi offset dahil capability ŞART ("her personel yapar" REDDEDİLDİ).
```

Guided-Open confirm-gate ([[authz-workstream-handoff]]) ile **entegre** olur (token akışı, audit result-kodlu,
ham token yok); ama **yetki adı ayrı** (`CLIENT_OFFSET_*`), `CHANGE_STATUS` reuse edilmez.

## 9. Concurrency / idempotency

```
- pg_advisory_xact_lock(hashtext(`client-offset:${tenantId}:${clientId}:${currency}`)) — apply/reverse tx.
- Apply tx İÇİNDE re-validate (approval anındaki hesap BAYAT olabilir):
    lock → payableAvailable yeniden hesapla → expenseUnpaid yeniden hesapla
    → amount ≤ min(...) değilse STALE_APPROVAL reject (I10).
- Tenant-scoped idempotencyKey (@@unique [tenantId, idempotencyKey]) — çift-apply guard (ClientPayout deseni).
- Pending/rezervasyon AŞAMASI YOK (v1; gereksiz karmaşıklık). Uygunluk yalnız apply anında bağlayıcı.
```

## 10. Audit

```
- CLIENT_OFFSET_CREATED  (kind=APPLY) / CLIENT_OFFSET_REVERSED (kind=REVERSAL)
- AuditService.logInTransaction — mutation ile AYNI tx (yazılamazsa rollback).
- actor = req.user.id (body'den ASLA). metadata = amount, currency, payableLeg(caseId+caseClientId),
  expenseLeg(caseId), reversesOffsetId, approvalRef. HAM TOKEN YAZILMAZ.
```

## 11. computeOutstanding — kaynak event'lerden (statement'tan DEĞİL)

Statement immutable RAPOR çıktısıdır; hesabın kaynağı değildir. Kanonik:

```
payableOutstanding =
    Σ POSTED CLIENT_PAYABLE (collection CONFIRMED)
  − Σ RECORDED ClientPayout
  − Σ APPLIED   offset.payableLeg
  + Σ REVERSED  offset.payableLeg

expenseOutstanding =
    Σ ExpenseRequest (≠CANCELLED)
  − Σ ExpensePayment
  − Σ APPLIED   offset.expenseLeg
  + Σ REVERSED  offset.expenseLeg

clientNetPosition = payableOutstanding − expenseOutstanding   (offset bunu DEĞİŞTİRMEZ — I4)
```

Mevcut `computeOutstanding` (tek-kaynak, drift-yok) offset terimleriyle genişletilir; payout tarafı
`ClientPayout` olarak kalır (D1 korunur; offset payout DEĞİL).

## 12. Migration plan

```
- ADDITIVE + non-destructive:
    (a) yeni tablo ClientOffset + enum ClientOffsetKind
    (b) ClientStatementLineType'a 4 yeni değer (§6)
    (c) raw partial unique index (reversesOffsetId) — Prisma nullable-unique kısıtına karşı garanti
- Backfill YOK · data-migration YOK · mevcut tablo davranışı bozulmaz.
- APPLY GATED: migration DOSYADA yazılır; dev DB'ye yalnız owner açık "uygula" ile (M1/M2/M3/B-0 deseni).
- Pre-apply `prisma migrate status` ZORUNLU (paralel-oturum out-of-band apply dersi: [[collection-disposition-design]]);
  divergent/missing-local görülürse APPLY EDİLMEZ, raporlanır.
```

## 13. Phased implementation

```
1. (önce) Faz B canlı kapanışı: API rebuild/restart (owner-kontrollü) + canlı UI smoke 9-madde.
2. ADR docs-only PR → review → merge.   ← (bu doküman)
3. Faz C product-gate checklist (Q-C1..C5 §14'te kapandı; ek ürün soruları varsa burada).
4. C-0 migration PR (ClientOffset tablo + 4 enum + index; APPLY ETME — "uygula" ayrı kapı).
5. C-1 backend (apply/reverse service + re-validate + advisory-lock + audit + computeOutstanding genişletme + capability).
6. C-2 frontend (Genel Cari'de "Mahsup Et / Mahsup İptal" — gated; statement satırları 4 yeni tip label'ı).
FAZ C KODU bu ADR MERGE edilmeden başlamaz.
```

## 14. Open questions closed by this ADR

```
Q-C1 Offset net pozisyonu değiştirir mi? → HAYIR (I4). amount payableLeg == amount expenseLeg.
Q-C2 Eligibility nasıl?
     payable: CLIENT_PAYABLE POSTED (collection CONFIRMED) · henüz payout edilmemiş · henüz offset'lenmemiş ·
              aynı tenant/client/currency.
     expense: ExpenseRequest ≠CANCELLED (requested) · henüz tahsil edilmemiş · henüz offset'lenmemiş ·
              aynı tenant/client/currency.
     FINAL kontrol apply-tx içinde (I10); approval anı yetmez.
Q-C3 Statement satır tipi? → 4 explicit type (§6). Generic OFFSET REDDEDİLDİ.
Q-C4 Approval rol/capability? → CLIENT_OFFSET_APPLY / CLIENT_OFFSET_REVERSE (CHANGE_STATUS DEĞİL).
     cross-case + reversal HER ZAMAN gated; capability HER offset için şart.
Q-C5 Ayrı tablo mı? → AYRI tablo ClientOffset. Mevcut ledger'lara gömülmez.
```

## 15. Sonraki ürün soruları (Faz C product-gate'te netleşecek — kod ÖNCESİ)

```
- payable leg seçimi UI'da nasıl? (dosya/alacaklı bazlı uygun proceeds listesi)
- expense leg seçimi UI'da nasıl? (uygun ödenmemiş ExpenseRequest listesi)
- kısmi mahsupta hangi ExpenseRequest/CLIENT_PAYABLE satırına FIFO mu, kullanıcı-seçimli mi atfedilir?
- reversal için gerekçe (note) zorunlu mu?
```
