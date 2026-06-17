# Faz 4.6 — Promote (intake → kanonik) — Uygulama Planı (PLAN-ONLY)

> **Durum:** Uygulama planı. **KOD YOK.** Faz 4'ün EN RİSKLİ parçası: dış-form verisi **İLK KEZ** kanonik tablolara yazar.
> **Önkoşul:** 4.0/4.2/4.3/4.4/4.5 MERGED → main `b35104f`. ✅
> **Kaynak:** [client-intake-link-design.md](client-intake-link-design.md) · [client-intake-phase45-review-queue-plan.md](client-intake-phase45-review-queue-plan.md)
> **Kapsam:** Yalnız **promote** — onaylı (APPROVED) intake alanlarını kanonik modele yazıp `promotedRef` damgalamak.

## 0. Çekirdek kurallar (kilitli)
- **Promote IDEMPOTENT:** aynı field **iki kez promote edilemez** (Ulaş, kilitli). Aday = `reviewStatus=APPROVED` **ve** `promotedRefId=null`. Promote sonrası `promotedRefType/promotedRefId` dolar → bir daha yazılmaz.
- **Yalnız APPROVED promote edilir** (PENDING/REJECTED yazılmaz).
- **Bu modül = TEK köprü:** `ClientIntakePromotionModule` kanonik servisleri import EDEBİLİR. **4.5 ReviewQueueModule sınırı korunur** (o hâlâ kanoniğe dokunmaz). Promote ayrı modül/serviste.
- Atomik: her field için **kanonik create + promotedRef damgası TEK transaction** (orphan/çift-yazım yok).

## 1. ⚠️ EN KRİTİK AÇIK KARAR — DEBTOR HEDEFİ (F46-K1)
Kanonik hedeflerin TÜMÜ `debtorId` ister: `ClientIntelStatement.debtorId`, `DebtorAddress.debtorId`, `Asset.debtorId`. **Ama intake (Link/Submission) yalnız caseId + clientId taşır, debtorId YOK.** (Müvekkil, borçlu HAKKINDA bilgi veriyor; hangi borçlu belirsiz.)
**Seçenekler:**
- **(A) Promote anında personel `debtorId` verir** (öneri): `POST /:id/promote { debtorId }`. debtorId case'e bağlı mı (CaseDebtor) doğrulanır. Şema değişikliği YOK; promote zaten bilinçli personel aksiyonu → borçluyu seçmesi doğal. **ÖNERİ.**
- (B) `ClientIntakeLink`'e `debtorId` eklenir (link belirli borçlu için üretilir) — 4.2 şema eki gerekir; ileride.
- (C) Case'in tek borçlusu varsa otomatik; çok borçlu → (A)'ya düş.
→ **Karar gerekmeden 4.6 kodlanamaz.** Öneri (A).

## 2. İkinci karar — kapsam: hangi kategoriler? (F46-K2)
- **4.6a (öneri, dar+güvenli):** YALNIZ yumuşak istihbarat (INCOME_SOURCE/COMMERCIAL_RELATION/FAMILY_CIRCLE/DIGITAL_FOOTPRINT/PAYMENT_HISTORY/STRATEGY) → **`ClientIntelStatement`** (4.0, MERGED, hazır hedef). `ClientIntelStatementService.create` reuse.
- **4.6b (sonraki):** ADDRESS → `DebtorAddress(source=CLIENT)` · ASSET → `Asset` · CONTACT → `Debtor`/`DebtorCommunication`. Bunlar ek alan-eşleme (adres tipi, varlık tipi/değer) ister → ayrı, dikkatli sub-faz.
→ **Öneri: 4.6 = yalnız 4.6a (soft-intel→ClientIntelStatement).** ADDRESS/ASSET/CONTACT alanları promote'ta **SKIP** (reviewStatus APPROVED kalır, promotedRef boş; 4.6b'de yazılır). Skip'ler `log`'lanır (sessiz kayıp yok).

## 3. Akış
```
POST /client-intake-submissions/:id/promote { debtorId }
  → submission IN_REVIEW veya PARTIALLY_PROMOTED olmalı (claimli)
  → debtorId case'e ait mi (CaseDebtor) doğrula (F46-K1-A)
  → APPROVED & promotedRefId=null alanları seç
  → her uygun (4.6a kategori) alan için TRANSACTION:
       canonical = ClientIntelStatementService.create(... debtorId, category map, value)
       field.update({ promotedRefType:'ClientIntelStatement', promotedRefId: canonical.id })
  → 4.6b kategori (ADDRESS/ASSET/CONTACT) alanları: SKIP (log)
  → submission status:
       tüm APPROVED alanlar promoted → COMPLETED
       bir kısmı (skip/4.6b kaldı) → PARTIALLY_PROMOTED
  → idempotent: tekrar promote → promotedRef dolu alanlar atlanır (çift yazım yok)
```

## 4. Kategori → ClientIntelStatement eşleme (4.6a)
- intake `ClientIntakeFieldCategory` (INCOME_SOURCE…STRATEGY) → ClientIntelStatement `ClientIntelCategory` (aynı 6 isim). Birebir map.
- `value` = field.value · `label` = field.label · `source=CLIENT_DECLARATION` · `confidence=DECLARED` (default) · `caseId`=submission.caseId · `debtorId`=verilen · `createdById`=promote eden personel.
- ClientIntelStatement zaten append-only/immutable → promote edilen beyan orada da düzeltilemez (supersede ile), tutarlı.

## 5. İdempotency / kısmi promote
- Field seçimi `WHERE reviewStatus=APPROVED AND promotedRefId IS NULL` → zaten promoted atlanır.
- İki kez promote çağrısı: ikincisinde yeni yazılacak alan yoksa no-op; status zaten COMPLETED.
- Kısmi: bazı alanlar 4.6b (skip) → PARTIALLY_PROMOTED; 4.6b gelince kalanlar promote → COMPLETED.

## 6. Mimari sınır (4.5 ile ilişki)
- `ClientIntakePromotionModule` import eder: `ClientIntelStatementModule` (+4.6b'de Debtor/Asset/Address). Bu modül **kanonik köprüsü** olmak için VAR.
- **4.5 ReviewQueueModule DEĞİŞMEZ** — hâlâ yalnız PrismaModule. Promote ayrı modül; review promote'a bağlı değil. (Sınır korunur.)

## 7. Endpoint (TARİF — JWT/personel)
| Method | Path | Gövde |
|---|---|---|
| POST | `/client-intake-submissions/:id/promote` | `{ debtorId }` → APPROVED soft-intel alanları ClientIntelStatement'a yaz; status COMPLETED/PARTIALLY_PROMOTED |
> Promote yalnız personel. Public uç promote ETMEZ.

## 8. Test planı
**Unit:** APPROVED+promotedRef-null alan → ClientIntelStatement.create çağrılır + field.promotedRef damgalanır · PENDING/REJECTED promote EDİLMEZ · idempotent (ikinci promote → zaten-promoted atlanır, create çağrılmaz) · ADDRESS/ASSET/CONTACT SKIP (4.6a) · debtorId case'e ait değil → red · submission COMPLETED vs PARTIALLY_PROMOTED.
**E2e (canlı DB):** submission+APPROVED soft-intel field → promote(debtorId) → **ClientIntelStatement GERÇEKTEN yazıldı** (count artar) + field.promotedRefId dolu + submission COMPLETED · ikinci promote → **çift yazım YOK** (count aynı) · REJECTED alan yazılmadı · ADDRESS alanı skip (PARTIALLY_PROMOTED) · tenant izolasyon. Temizlenir.

## 9. Bu PR'da YAPILMAYACAKLAR
- 4.6b (ADDRESS/ASSET/CONTACT → DebtorAddress/Asset/Debtor) → sonraki sub-faz.
- 4.5 review mantığına dokunma · public submit · frontend · Party/IR-0/cross-case · oto-promote (her zaman personel aksiyonu).

## 10. Açık kararlar (kodlamadan önce)
| # | Karar | Öneri |
|---|---|---|
| F46-K1 | debtor hedefi nasıl? | **(A) promote gövdesinde `debtorId`** + CaseDebtor doğrulama (şema değişikliği yok) |
| F46-K2 | kapsam: tüm kategoriler mi, yalnız soft-intel mi? | **yalnız 4.6a soft-intel→ClientIntelStatement**; ADDRESS/ASSET/CONTACT skip→4.6b |
| F46-K3 | promote hangi submission state'lerinden? | IN_REVIEW + PARTIALLY_PROMOTED (claimli); CLIENT_SUBMITTED/REJECTED/COMPLETED red |
| F46-K4 | skip edilen 4.6b alanları | reviewStatus APPROVED + promotedRef boş kalır; status PARTIALLY_PROMOTED; log |

> Onaylarsan (F46-K1..K4 dahil) 4.6'yı plan→additive kod→unit+canlı e2e→PR ile yazarım. **Bu adımda kod yok.**
