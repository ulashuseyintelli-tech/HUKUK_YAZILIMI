# Faz 4.6b — ADDRESS promote → DebtorAddress(source=CLIENT) — Uygulama Planı (PLAN-ONLY)

> **Durum:** Uygulama planı. **KOD YOK.** Promote zincirinin ikinci kanonik çıkışı.
> **Önkoşul:** 4.6a (soft-intel→ClientIntelStatement) MERGED → main `3ea1500`. ✅
> **Kapsam:** YALNIZ `ADDRESS` kategorisi alanları → `DebtorAddress(source=CLIENT)`. ASSET/CONTACT YOK (4.6c). Soft-intel davranışı DEĞİŞMEZ.

## 0. Sınır
- Yalnız `ClientIntakeFieldCategory=ADDRESS` alanları promote edilir → `DebtorAddress`. Diğer kategoriler bu yolda **skip** (soft-intel zaten 4.6a'da).
- **4.5 ReviewQueueModule sınırı korunur** (promote ayrı modülde; review kanoniğe yazmaz).
- **Soft-intel promote (4.6a) DAVRANIŞI BOZULMAZ** — ya genişletilir ya da ADDRESS ayrı uçta (§3).
- ASSET/CONTACT YOK · Party/IR-0/cross-case YOK · frontend YOK.

## 1. ⚠️ EN KRİTİK KARAR (D1) — RAW TEXT mi, STRUCTURED mı? (ADDRESS göründüğü kadar basit değil)
**Gerçek:** `DebtorAddress` `street` **ve** `city` alanlarını ZORUNLU ister (default yok; hukuki tebligat için anlamlı). **Ama** intake `ClientIntakeField` ADDRESS'i tek **`value` (ham metin)** taşır (public form 4.4 tek değer gönderir). Yani ham metni doğrudan structured street/city'ye koyamayız.
**Seçenekler:**
| # | Seçenek | Artı | Eksi |
|---|---|---|---|
| **RAW** | value → `rawAddress`+`fullText`; `street=value`, `city=''/placeholder` | form değişmez, basit | street/city semantiği bozulur; tebligat için zayıf; parse yok |
| **STRUCTURED** | ADDRESS field value = JSON `{street,city,district?}` | DebtorAddress temiz | **4.4 public form contract DEĞİŞİR** (form + field validation) — kapsam büyür |
| **HYBRID (öneri)** | ham `value` `rawAddress`'te kalır; **promote anında personel structured `street/city` girer** | form değişmez + DebtorAddress temiz + insan-onaylı (promote zaten personel aksiyonu) | promote gövdesi büyür (per-address structured input) |

→ **Önerim: HYBRID.** Müvekkil ham adres beyanını yazar; personel review/promote'ta o ham metni görüp **yapısal street/city'yi doğrular/girer**. Fragile parse YOK, form contract DEĞİŞMEZ, DebtorAddress doğru dolar. **Bu karar verilmeden 4.6b kodlanamaz (Ulaş).**

## 2. DebtorAddress eşleme (kanonik hedef)
- `debtorId` = promote body (F46-K1 ile aynı; tenant + CaseDebtor doğrulanır).
- `source = AddressSource.CLIENT` · `type = DECLARED` · `addressCategory = DECLARED_CLIENT` (mevcut enum'lar — Faz 1 hizalı).
- `verified = false` · `confidenceLevel = LOW` (müvekkil beyanı, doğrulanmamış — otoriter kaydı ezmez).
- `rawAddress = field.value` (ham müvekkil beyanı korunur) · `fullText` = yapısaldan derlenir.
- `street`/`city` = D1'e göre (HYBRID: personel girdisi) · `district`/`postalCode` opsiyonel · `country` default "Türkiye".
- `sourceDetail = CLIENT_REPLY...` (uygunsa) · `evidenceType=COMMUNICATION`/`evidenceId`= submission/field ref (izlenebilirlik).

## 3. Endpoint / akış (D1=HYBRID varsayımıyla)
```
POST /client-intake-fields/:fieldId/promote-address
  body: { debtorId, street, city, district?, postalCode? }
  → field ADDRESS + reviewStatus=APPROVED + promotedRefId=null olmalı (idempotent)
  → submission IN_REVIEW/PARTIALLY_PROMOTED + tenant
  → debtorId aynı tenant + CaseDebtor (F46-K1)
  → addressHash hesapla (normalize) → debtor'da var mı? (duplicate, §5)
  → TRANSACTION: DebtorAddress.create(source=CLIENT...) + field.update(promotedRefType='DebtorAddress', promotedRefId)
  → submission status yeniden hesapla (§6)
  → yanıt: { debtorAddressId | skippedReason }
```
- **Per-field** uç (submission-level değil): her adres kendi structured girdisini ister. Soft-intel'in submission-level promote'u (4.6a) **dokunulmadan** kalır. (Alternatif D2: tek promote ucunu genişlet — ama address structured input başına gerektiğinden per-field daha temiz.)

## 4. Mevcut yazma yolunu REUSE (anti-tekrar) — ✅ KESİN
- **`findOrCreateDebtorAddress(db, data)`** (`@/common/address-hash.util`, RFA-006) **REUSE edilir** — `db`=tx (ATOMİK), hash hesaplar, dedup yapar, race-safe (P2002→find). Yeni paralel hash/normalize YAZILMAZ (RFA-006 zaten "tüm write yolları ortak helper kullanır" diyor).
- Promote: `const { address, created } = await findOrCreateDebtorAddress(tx, data)`. `created` → promote; `!created` → duplicate (§5).

## 5. Duplicate adres (DB-unique gerçeği) — ✅ KESİN (Ulaş)
- `@@unique([debtorId, addressHash])` VAR. Mevcut helper `findOrCreateDebtorAddress` (RFA-006, `@/common/address-hash.util`) zaten: hash hesaplar → varsa MEVCUDU döndürür `{created:false}`, yoksa create `{created:true}` (race-safe, tx-aware).
- **Tasarım (D3 kesin):** `created:false` (duplicate) ise → **`promotedRef` DOLDURULMAZ** (bu field'dan yeni kanonik kayıt ÜRETİLMEDİ; "promoted" saymak audit'i yanıltır — Ulaş). Sonuç `{ result:'DUPLICATE_ADDRESS', existingAddressId }` döner. Field `APPROVED & promotedRef=null` kalır → submission `PARTIALLY_PROMOTED` kalabilir (sessiz COMPLETED YOK; doğru semantik). Gelecekte `duplicateOfRef` gibi ayrı alan tasarlanabilir (bu PR'da YOK).

## 6. Partial-promote statüsü (soft + address birlikte)
- Submission `COMPLETED` = **TÜM** APPROVED alanlar (soft-intel **ve** ADDRESS) promote edilmiş.
- ADDRESS alanı kaldıysa → `PARTIALLY_PROMOTED`. 4.6a soft-intel promote'u status'ü zaten hesaplıyordu; ADDRESS promote sonrası **aynı kurala göre** yeniden hesaplanır (approvedTotal vs promotedTotal — kategori farketmez, `promotedRefId` dolu mu bakılır). Mevcut hesap zaten kategori-agnostik (promotedRefId not null) → ADDRESS promote sayıma dahil olur, ekstra mantık gerekmez.

## 7. İdempotency / sınır (4.6a ile aynı sertlik)
- Aday = `category=ADDRESS & reviewStatus=APPROVED & promotedRefId=null`. promotedRef dolu ADDRESS tekrar yazılmaz.
- Atomik: DebtorAddress.create + field.promotedRef update TEK transaction.
- Soft-intel promote davranışı **değişmez** (ayrı uç/yol).

## 8. Test planı
**Unit:** ADDRESS APPROVED+null → DebtorAddress.create(source=CLIENT, type=DECLARED, category=DECLARED_CLIENT, verified=false) + field.promotedRef · non-ADDRESS field bu uçta red/skip · debtor tenant/case guard · duplicate hash → SKIP (create yok) · idempotent (promotedRef dolu → create yok) · submission COMPLETED/PARTIALLY hesabı.
**E2e (canlı DB):** ADDRESS field → promote-address(debtorId, street/city) → **DebtorAddress GERÇEKTEN yazıldı** (source=CLIENT, rawAddress=ham value) + field.promotedRef · ikinci promote → çift yazım YOK · aynı adres tekrar → DUPLICATE skip · soft-intel promote (4.6a) hâlâ çalışıyor (regresyon yok) · tenant izolasyon. Temizlenir.

## 9. Bu PR'da YAPILMAYACAKLAR
ASSET/CONTACT promote (4.6c) · adres parse/normalize otomasyonu (HYBRID'de personel girer) · public form contract değişikliği (STRUCTURED seçilmedikçe) · 4.5 review mantığı · frontend · Party/IR-0/cross-case · soft-intel promote davranışına dokunma.

## 10. Açık kararlar (kodlamadan önce)
| # | Karar | Öneri |
|---|---|---|
| **D1** | ADDRESS value RAW mı / STRUCTURED mı / HYBRID mı? | **HYBRID** — ham value korunur, personel promote'ta street/city girer (form değişmez, DebtorAddress temiz). **EN KRİTİK — Ulaş kararı.** |
| D2 | endpoint: per-field address-promote mı, soft-promote'u genişlet mi? | **per-field** (`/client-intake-fields/:id/promote-address`) — structured input başına; soft-intel ucu dokunulmaz |
| D3 | duplicate adres: skip+rapor mı, var olana bağla mı? | **skip + DUPLICATE_ADDRESS raporu** (soft, blok yok) |
| D4 | DebtorAddress yazımı reuse mı, tx-direct mı? | mevcut debtor.service hash/normalize **reuse** (anti-tekrar) + atomik tx |

> D1'i (raw/structured/hybrid) onayla → diğerleri (D2..D4) ile birlikte 4.6b'yi plan→additive kod→unit+canlı e2e→PR ile yazarım. **Bu adımda kod yok.**
