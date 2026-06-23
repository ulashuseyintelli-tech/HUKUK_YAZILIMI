# ALACAK-OVERPAYMENT-EXPLICIT-PROJECTION-DESIGN

> **Durum:** KARAR KAYDI (design decision record).
> **Bu belge `docs-only`'dır** — schema / model / migration / kod **İÇERMEZ**. Uygulama ayrı, tek tek onaylı gate'lerde + **Av./muhasebe sign-off** ile yürür.
> **Tarih:** 2026-06-23 · **Karar sahibi:** Ulaş · **İlgili:** `tbk100-legal-decisions-ledger`, `claim-item-wizard-1-design`

---

## 0. Özet / Sonuç

Fazla tahsilat (**overpayment** = bir `Collection`'ın kasaya giren tutarının, borca mahsup edilen tutarı aşan kısmı) **borç kalemi DEĞİLDİR.** Bu fazla para, borç modeline (`ClaimItem` / TBK100 / `LedgerAllocation`) **sokulmadan**, **ayrı first-class explicit DB projection** olarak izlenir.

Varsayılan davranış **emanet** (müvekkil/alacaklı için tutulur); sonra **açık** bir işlemle **iade / virman / yeniden-mahsup** yapılır. İade (refund), overpayment'ın kendisi değil; **ayrı** bir finansal harekettir.

Bu belge, kararı + mevcut durumu + hedef modeli + uygulama hattını kayıt altına alır. **Kod/şema bu belgede yoktur.**

---

## 1. Kilitli Ürün Kararı (değişmez)

1. Overpayment için `ClaimItem` **yapılmaz**.
2. TBK100 mahsup sırasına **sokulmaz**.
3. `LedgerAllocation` içine **dahil edilmez**.
4. compat `CollectionAllocation.OTHER` kanonik çözüm **sayılmaz**.
5. `ClaimItem.collectedAmount` **yalnız** borca mahsup edilen tutarı gösterir.
6. `Collection.amount` kasaya giren **gerçek** tahsilat tutarını gösterir.
7. Fazla kısım **ayrı** first-class finansal projection olarak izlenir.

### 1.1 Kanonik anlam

| Kavram | Anlam |
| --- | --- |
| `Collection.amount` | Kasaya giren gerçek para |
| `LedgerEntry(PAYMENT).amount` | Ödeme hareketinin toplam tutarı |
| `LedgerAllocation` (toplam) | Borca mahsup edilen tutar |
| `ClaimItem.collectedAmount` | YALNIZ borca mahsup edilen tutar |
| `Overpayment / Unallocated` | Emanet / iade bekleyen fazla para |

### 1.2 Örnek

```
Borç      = 1000
Tahsilat  = 1200

Collection.amount             = 1200
LedgerEntry(PAYMENT).amount   = 1200
ΣLedgerAllocation             = 1000
ClaimItem.collectedAmount(Σ)  = 1000
OverpaymentAmount             =  200   ← ayrı projection
```

### 1.3 Scope (zorunlu)

Overpayment kaydı **mutlaka** `tenantId + caseId + collectionId` ile tutulur. Başka tenant / başka case / başka collection ile **örtük ilişki kurulmaz**.

### 1.4 Cancel davranışı

`Collection` cancel edilirse:

```
PAYMENT LedgerEntry        = +1200
REVERSAL LedgerEntry       = -1200
ΣLedgerAllocation net      =     0
ClaimItem.collectedAmount  =     0  (net)
OverpaymentAmount          =     0  (net)
```

Fazla tahsilat projection'ı da cancel/reversal ile **sıfırlanır veya terslenmiş** (reversed) olarak izlenir.

### 1.5 Refund davranışı (kavram — kod ayrı gate)

İade **ayrı** modellenir, overpayment'ın kendisi değildir:

- `LedgerEntryType.REFUND`
- `REFUND` event
- Refund status / audit

---

## 2. Mevcut Durum — Forensic (kanıtlı)

> Read-only inceleme (2026-06-23). Crux iddialar doğrudan koddan doğrulandı.

- **Sızıntı (canonical yol):** Tahsilat > borç olduğunda TBK100 allocator `remainingPayment`'i **hesaplar** (`apps/api/src/modules/interest-engine/types.ts:139`; characterization testleriyle kilitli) **ama canonical ledger yolu bu değeri persist ETMEZ** — `remainingPayment` yalnız tip tanımı + testlerde geçer, hiçbir servis DB'ye yazmaz. Yani canonical tarafta fazla **atılır**.
- **Shadow'a düşüş:** Fazla yalnız non-canonical `CollectionAllocation`'a düşer: `apps/api/src/modules/collection/collection.service.ts:150` → `// 6. Kalan varsa "diğer"e` → `AllocationType.OTHER`. Hemen altında (satır ~154) **"Mahsupları kaydet (projection data, not legal fact)"** notu — `CollectionAllocation`'ın kanonik olmadığını kodun kendisi söyler (karar #4'ü doğrular).
- **Veri-bütünlüğü açığı:** `LedgerEntry(PAYMENT).amount` (1200) ≠ `ΣLedgerAllocation` (1000) → fazla 200 canonical defter izinde kayıp; bugün audit trail'i yok.
- **`collectedAmount` zaten doğru:** Allocator her kalemi `remaining = max(0, demanded − collected)` ile sınırlar → `collectedAmount` `demandedAmount`'ı aşmaz. Karar #5 bugünden sağlanıyor; overpayment `collectedAmount`'a değmez.
- **Hazır altyapı (reuse edilebilir):**
  - `LedgerEntryType.REFUND` enum'da **VAR** (`prisma/schema.prisma:4413`) ama hiçbir yerde **kullanılmıyor** (refund entry üreten servis yok) → refund gate'i için temel hazır.
  - Cancel akışı mevcut: `collection.service.ts` cancel → `REVERSAL` LedgerEntry + her allocation için `collectedAmount` decrement + `≥0` clamp.
  - `Collection` zaten `tenantId + caseId (+ caseDebtorId)` taşır → scope için yeterli.
  - `remainingPayment` = projection'ın doğal **kaynağı** (bugün atılan değer).
- **Prior-art (EMANET):** `payment-instruction` modülünde `TargetAccountType.EMANET` var ama bu yalnız **ödeme yönlendirme** etiketi (borçlu ödemesi emanet hesabına yönlendirilir) — henüz **ledger bakiyesi değil**. Bu projection, ilk gerçek **emanet/escrow bakiyesi** olur. `case-balance.service.ts:25`'te `REFUND` sabiti var (kısmi/kullanılmıyor).

---

## 3. Kilitli Tasarım Kararları (Q1–Q6 + OTHER lock)

| # | Karar | Kilit |
| --- | --- | --- |
| **Q1** | **Emanet-default.** Fazla nötr kaybolmaz; varsayılan emanet/alacaklı için tutulur. Sonra açık işlemle iade / virman / yeniden-mahsup. | KİLİTLİ |
| **Q2** | **LedgerAllocation YOK.** Overpayment ayrı projection. `PAYMENT` entry + `OVERPAYMENT_RECORDED` event yeterli. | KİLİTLİ |
| **Q3** | **Invariant resmî:** `PAYMENT.amount = ΣLedgerAllocation(borç) + ΣOverpayment`. | KİLİTLİ |
| **Q4** | **Refund kavram olarak doc'ta.** Kod ayrı gate; `LedgerEntryType.REFUND` sonraki PR konusu. | KİLİTLİ |
| **Q5** | **Backfill YOK.** Yeni-ileri-only. Tarihsel `CollectionAllocation.OTHER` migration'ı ayrı riskli gate. | KİLİTLİ |
| **Q6** | **Currency projection'da taşınır.** Dönüşüm yok; `Collection.currency` neyse overpayment currency odur. | KİLİTLİ |

**Ek kilit — `CollectionAllocation.OTHER`:**
- `OTHER` overpayment **kanoniği değildir**.
- `OTHER` shadow/projection **legacy** olarak **kalır** (silinmez, bu hatta dokunulmaz).
- **Yeni fazla ödeme `OTHER`'a güvenilerek raporlanmaz**; yeni kanonik = explicit `Overpayment` projection.

---

## 4. Hedef Model — `Overpayment` Projection (kavramsal)

> Alan adları/şema sonraki gate'te (G1) netleşir; burada **kavramsal** model.

**Entity: `Overpayment` (explicit DB projection)**

| Alan (kavramsal) | Açıklama |
| --- | --- |
| `id` | PK |
| `tenantId`, `caseId`, `collectionId` | Zorunlu scope (örtük ilişki yok); `collectionId` benzersiz-yönlü |
| `amount` | Fazla tutar (kaynak: TBK100 `remainingPayment`) |
| `currency` | `Collection.currency` (dönüşüm yok — Q6) |
| `status` | Yaşam döngüsü (§5.1) |
| `sourceLedgerEntryId` | Üreten `PAYMENT` LedgerEntry (audit bağı; allocation DEĞİL) |
| `reversedAt` / `reversedByCollectionCancel` | Cancel/reversal izi |
| audit alanları | createdAt, createdById, vb. |

- **Kaynak:** Collection işlenirken TBK100 allocator'ın bugün atılan `remainingPayment` değeri.
- **Bağ:** `PAYMENT` LedgerEntry'ye **audit** amaçlı bağlanır; **`LedgerAllocation` satırı OLUŞTURULMAZ** (karar #3, Q2).
- **Derived değil:** explicit kayıt (iade takibi, emanet bakiyesi, mutabakat, audit, tutarlı raporlama gerekçeleriyle — `Collection.amount − allocated` farkını her yerde yeniden hesaplamak hata üretir).

### 4.1 Reconciliation invariant (Q3)

Her `PAYMENT` LedgerEntry için resmî değişmez:

```
LedgerEntry(PAYMENT).amount = ΣLedgerAllocation(borç)  +  ΣOverpayment(bu collection)
```

Bugünkü sessiz açık (1200 ≠ 1000) bu invariant ile **kapanır** ve mutabakatta kontrol edilebilir hale gelir.

---

## 5. Yaşam Döngüsü & Event'ler

### 5.1 Status (kavramsal)

```
HELD (emanet)  ──►  REFUNDED        (iade edildi — G5/refund gate)
               ──►  TRANSFERRED     (virman — açık işlem)
               ──►  RE_ALLOCATED    (yeniden mahsup — açık işlem)
               ──►  REVERSED        (collection cancel ile terslendi)
```

- **HELD = varsayılan** (Q1 emanet-default).
- REFUNDED / TRANSFERRED / RE_ALLOCATED yalnız **açık** işlemle.

### 5.2 Event'ler

- **Create** (collection işlenir + cash > borç): `Overpayment(HELD)` oluşturulur + **`OVERPAYMENT_RECORDED`** domain event (PAYMENT entry ile aynı tx).
- **Cancel** (collection cancel): mevcut `REVERSAL` akışına **hook** → ilgili `Overpayment` net 0 (status `REVERSED` veya ters kayıt). Cancel akışı bugün zaten var; yalnız projection reversal'ı eklenir.
- **Refund** (kavram — kod G5): `LedgerEntryType.REFUND` + `REFUND` event + refund status/audit; emanet (`HELD`) bakiyesini tüketir → `REFUNDED`.
- **Transfer / Re-allocate** (kavram): açık işlemle emanetten virman / yeniden-mahsup.

---

## 6. Canonical vs Shadow (sınırlar)

| Katman | Rol | Overpayment? |
| --- | --- | --- |
| `LedgerAllocation` | Borç mahsubunun **kanonik** izi | **İÇERMEZ** (karar #3) |
| `Overpayment` projection | Fazlanın **kanonik** izi | **EVET (yeni kanonik)** |
| `CollectionAllocation.OTHER` | Legacy shadow ("not legal fact") | Legacy kalır; **yeni fazla için kanonik DEĞİL** |

- Yeni mutabakat değişmezi: `PAYMENT.amount = ΣLedgerAllocation + ΣOverpayment`.
- `CollectionAllocation.OTHER`'a **dokunulmaz**, **silinmez**, **migrate edilmez** (Q5); yalnız "yeni fazla buradan raporlanmaz" kuralı geçerlidir.

---

## 7. Raporlama Yüzeyleri (hedef)

- **Emanet bakiyesi:** case + tenant düzeyinde `ΣOverpayment(HELD)`.
- **Ekstre / statement:** tahsilat satırında borç-mahsubu + fazla(emanet) ayrımı görünür.
- **Mutabakat / reconciliation:** §4.1 invariant kontrolü (PAYMENT = allocation + overpayment).
- **Audit trail:** her overpayment'ın kaynağı (collection/ledger entry) + durum geçişleri.

Tüm yüzeyler aynı kavramı **tek kaynaktan** (explicit projection) gösterir; her yerde `amount − allocated` yeniden hesaplanmaz.

---

## 8. Kapsam Dışı (bu belge + ilk uygulama)

- **Backfill** (Q5: yeni-ileri-only) — tarihsel `CollectionAllocation.OTHER` → projection göçü **ayrı riskli gate**.
- **Refund KODU** (Q4: kavram doc'ta, kod G5).
- **Currency dönüşümü** (Q6: yok).
- **`CollectionAllocation.OTHER` deprecation/silme** — bu hatta yok.
- Schema / model / migration / API / UI — bu belgede **yok**.

---

## 9. Uygulama Hattı (gated, docs-first)

| Gate | İçerik | Ön-koşul |
| --- | --- | --- |
| **G0** | **Bu design doc** (docs-only) | — |
| **G1** | `Overpayment` schema + migration (additive) | G0 onay + Av./muhasebe sign-off |
| **G2** | Write-on-collection: `remainingPayment` → `Overpayment(HELD)` + `OVERPAYMENT_RECORDED` (tek tx) | G1 |
| **G3** | Cancel reversal hook (projection net 0) | G2 |
| **G4** | Reporting: emanet bakiyesi + mutabakat invariant yüzeyi | G2 |
| **G5** | Refund (`LedgerEntryType.REFUND` + event + status/audit) | G4 + ürün/muhasebe onayı |
| **(sonra)** | Backfill / `OTHER` migration (ayrı riskli gate) | açık karar |

Her gate: **ayrı izole worktree + plan-first + deliver-first diff + ayrı PR + auto-merge yok**. Finansal/muhasebe etkili gate'ler **Av./muhasebe sign-off** gerektirir.

---

## 10. Açık / Sonraki Kararlar

- **Refund workflow detayı** (kim başlatır, onay zinciri, audit) — G5 öncesi netleşir.
- **Backfill stratejisi** — tarihsel fazla nasıl/ne zaman projection'a alınır — ayrı gate kararı.
- **`OTHER` deprecation zamanlaması** — yeni kanonik oturduktan sonra.
- **Emanet → müvekkil cari** ilişkisi (varsa) — ileride muhasebe entegrasyonu.

---

> **Tekrar:** Bu belge yalnız karar + tasarımdır. **Kod yok, şema yok, migration yok.** Uygulama G1+ gate'lerinde ayrı onayla.
