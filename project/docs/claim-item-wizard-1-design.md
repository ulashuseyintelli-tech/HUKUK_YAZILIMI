# CLAIM-ITEM-WIZARD-1 — Çok-Kalemli Manuel Alacak Girişi (Karar Kaydı)

> **Durum:** KARARLAR KİLİTLİ (Ulaş, 2026-06-21) · **Kod YOK · Şema YOK · Migration YOK**
> **Sahip:** Ulaş + Claude (oturum) · **Tarih:** 2026-06-21
> **Tetikleyici:** "Yeni Takip" sihirbazının son adımı (`ProfessionalClaimItemForm`) tek-kalem/tek-çek
> formu gibi davranıyor; gerçek model "bir dosyada N alacak kalemi". Çek bunu görünür yaptı, ama
> aynı kopukluk kira/sözleşme/ilam için de var.
> Bu doküman koda geçmeden önce **ürün modeli + akış kararını** yazılı sabitler.
> İlke: **var olan kanonik modele BAĞLA — yeniden inşa ETME.** Multi-instrument bunun yalnız kambiyo alt tipidir.

İlgili kilitli karar: [`case-instrument-canonical-design.md`](./case-instrument-canonical-design.md) (CaseInstrument kanonik ayrımı). Bu doküman onu **genişletir**, çelişmez.

---

## 1. Problem (tek cümle)

Manuel "Yeni Takip" sihirbazının son adımı **tek bir tipli alacak formu** üretirken, bir takip dosyası
gerçekte **çeşitli tipte N alacak kaleminden** oluşur:

```text
Dosya seviyesi   = taraflar + takip türü        (avukat, müvekkil, borçlu, icra dairesi)
Kalem seviyesi   = para + tarih + belge + faiz   (N adet, tipleri karışık)
```

Sihirbaz bu iki seviyeyi karıştırıyor: "Çek Bilgileri" dosya seviyesinde duruyor gibi görünüyor;
halbuki **çek bir alacak kalemidir** (daha doğrusu: çek bir *evraktır*, ondan bir PRINCIPAL kalem türer).
Aynı şey kira için de geçerli — kira alacağı dosya seviyesi değil, **dönemsel kalemdir**.

---

## 2. Aynı problemin tüm takip türlerindeki görünümü

```text
Kira
 ├─ Ocak kira          (PRINCIPAL, dönem=2026-01)
 ├─ Şubat kira         (PRINCIPAL, dönem=2026-02)
 ├─ Mart kira          (PRINCIPAL, dönem=2026-03)
 ├─ aidat              (PRINCIPAL)
 ├─ işlemiş faiz       (INTEREST)
 └─ tahliye/yan gider  (EXPENSE)

Sözleşme
 ├─ fatura 1           (PRINCIPAL, belge=FATURA, referenceNo=faturaNo)
 ├─ fatura 2           (PRINCIPAL, belge=FATURA)
 ├─ cezai şart         (CONTRACTUAL_PENALTY)
 └─ cari bakiye        (PRINCIPAL, belge=SOZLESME)

İlam
 ├─ asıl alacak        (PRINCIPAL, belge=ILAM)
 ├─ yargılama gideri   (EXPENSE)
 ├─ vekalet ücreti     (ATTORNEY_FEE)
 └─ faiz               (INTEREST / PRE_INTEREST)

Kambiyo
 ├─ çek 1              (CaseInstrument[CEK] → PRINCIPAL)
 ├─ çek 2              (CaseInstrument[CEK] → PRINCIPAL)
 └─ bono 1            (CaseInstrument[BONO/SENET] → PRINCIPAL)
```

**Çıkarım:** "çoklu çek" özel bir hâl değil; genel kural "çoklu kalem"dir. Kambiyo, kalemin
*evrağa bağlı* alt tipidir.

---

## 3. Mevcut durum — forensic (kanıtlarla)

### 3.1 Sihirbaz son adımı tek-kalem üretir, tip-özel veriyi ATAR

- Son adım bileşeni: [`ProfessionalClaimItemForm`](../apps/web/src/components/claim-item/ProfessionalClaimItemForm.tsx) — **tek `kalem` state** (`const [kalem, setKalem]`), liste yok, "Kalem/Çek Ekle" butonu yok.
- Bileşen zengin tip-özel alt-nesneler topluyor: `cekBilgileri` (ibraz/düzenleme yeri/seri no/hesap no/banka/imzalayanlar), `senetBilgileri`, `ilamBilgileri`, `faturaBilgileri`, `nafakaBilgileri`.
- `onItemsChange([{ ...kalem }])` tek elemanlı dizi döndürür.
- Sihirbaz bunu `dues`'a çevirirken **yalnız tutar/tarih/faiz** alınır; `cekSeriNo/banka/düzenleme yeri/hesap no/imzalayanlar` **kopyalanmaz** — tek hayatta kalan `ibrazTarihi`, o da `interestStartDate` olarak.
- `ilamYanAlacaklar` çoklu satır destekler ama **tek ILAM kalemine bağlı** bir istisna; genel çoklu-kalem değil.

### 3.2 createCase payload'u iki kanal taşır

`apps/web/src/app/(dashboard)/cases/new/page.tsx` createCase payload'unda:
```text
dues:        buildCreateCaseDuesPayload(dues)   // çek alanı YOK (DueDto'da yok)
instruments: instruments                         // yalnız OCR doldurur; manuel akışta BOŞ
```

### 3.3 Üç paralel parasal model + üç paralel post-create UI (mevcut)

| Model | Şema | Rol | Post-create UI | API |
|---|---|---|---|---|
| **`ClaimItem`** | `prisma/schema.prisma` | **KANONİK** (bakiye/TBK100 yalnız bunu okur); üç-tutar (`originalAmount`/`demandedAmount`/`collectedAmount`); `instrumentId` FK; `sourceProcess` (MAIN/PRECAUTIONARY=ihtiyati haciz) | **`ClaimItemPanel` — ÖKSÜZ, case detayına bağlı DEĞİL** | `/claim-items/*` (CRUD + add-interest/expense/fee/attorney-fee) |
| **`CaseInstrument`** | `prisma/schema.prisma` | **KANONİK EVRAK** (kambiyo); serialNo/banka/keşideci/lehtar/aval/ciro/protesto/karşılıksız | manuel `InstrumentForm` — `CaseDetailTabs` "instruments" sekmesi, **yalnız kambiyo** | `/case-instruments/*` (CRUD) |
| **`Due`** | `prisma/schema.prisma` | legacy/geçiş + nafaka taksit takvimi; bakiye için kanonik DEĞİL | `DueModal` — case detay inline grid | `/cases/:id/dues/*` |

Köprü: `due-to-claim-item.mapper.ts` her `Due`'yu kanonik `ClaimItem`'a çevirir (NAFAKA→null; KIRA/AIDAT/PRIM→PRINCIPAL; TAZMINAT→PENALTY; CEZAI_SART→CONTRACTUAL_PENALTY).

### 3.4 Enstrüman zinciri ZATEN HAZIR (sadece manuel girişe bağlı değil)

- `CreateCaseDto.instruments?: CaseInstrumentInputDto[]` backend'de kabul ediliyor.
- createCase tx'i içinde `createInstrumentsWithClaimItems` her geçerli instrument için **CaseInstrument + bağlı PRINCIPAL ClaimItem** üretir.
- **Ama:** `process.env.OCR_MULTI_INSTRUMENT === "true"` flag'iyle gated (varsayılan KAPALI) **ve** frontend `instruments[]`'i yalnız OCR yolundan doldurur.

**Sonuç:** "Case → N ClaimItem (+ opsiyonel CaseInstrument)" modeli **veri katmanında ve post-create UI'larda zaten var.** Tek eksik: **manuel oluşturma sihirbazı bu modele bağlı değil** — tek-tipli form üretip tip-özel veriyi atıyor.

---

## 4. Hedef ürün modeli (kavramsal — kod değil)

Yeni model yok; var olan kanonik model **manuel girişe açılır**:

```text
Takip dosyası
 └─ Alacak Kalemleri[]              (N adet — sihirbazın son adımı bunu yönetir)
      ├─ kalem tipi (itemType)       PRINCIPAL / INTEREST / EXPENSE / ATTORNEY_FEE / FEE / PENALTY / ...
      ├─ belge tipi (sourceDocumentType)  FATURA / CEK / SENET / KIRA / SOZLESME / ILAM / DIGER
      ├─ tutar (üç-tutar: original/demanded)
      ├─ vade / tarih (dueDate / issueDate)
      ├─ faiz (interestType / rate / start / end)
      └─ belgeye-özel alanlar
            ├─ KAMBIYO  → CaseInstrument (serialNo, banka, keşideci, vade, aval, ...) + instrumentId bağı
            └─ DİĞER    → ClaimItem.referenceNo / sourceDocumentNo + (hafif) metadata
```

Sihirbaz son adımı artık "tek alacak formu" değil, **Alacak Kalemleri Yönetimi**:

```text
[+ Alacak Kalemi Ekle]   → tip seçimine göre uygun alt-form
[+ Çek Ekle]             → CaseInstrument alt-formu (mevcut InstrumentForm alanları)
[+ Kira Dönemi Ekle]     → tekrarlı PRINCIPAL kalemler (aydan aya)
[+ Fatura Ekle]          → PRINCIPAL + referenceNo
[+ Masraf / Fer'i Alacak Ekle]  → EXPENSE / ATTORNEY_FEE / FEE / PENALTY
```

**Yönlendirme kuralı (kilitli ilkeyi bozmaz):**
- Kambiyo satırı → `instruments[]` → `CaseInstrument` + bağlı PRINCIPAL `ClaimItem` (K1: çek PRINCIPAL'ı yalnız buradan; çift-sayım yok).
- Kambiyo-dışı satır → `dues[]` (mevcut köprüyle `ClaimItem`'a) — Faz-1 (bkz. §6 O-2).
- Toplamlar **yalnız `ClaimItem`'dan** (Corollary-1, `CaseInstrument.amount` toplamına eklenmez).

İyi haber: `CreateCaseDto` **hem `dues[]` hem `instruments[]`'i zaten kabul ediyor.** Backend sözleşmesi büyük ölçüde hazır; iş ağırlıklı **frontend (çok-kalem UI) + birkaç karar**.

---

## 5. Takip türü → kalem kataloğu (mevcut enum'lara eşleme)

| Takip türü | Satır | itemType | belge tipi | Evrak (CaseInstrument)? |
|---|---|---|---|---|
| Kira | Aylık kira (N dönem) | PRINCIPAL | KIRA | Hayır |
| Kira | Aidat | PRINCIPAL | KIRA/DIGER | Hayır |
| Kira | İşlemiş faiz | INTEREST | — | Hayır |
| Kira | Tahliye/yan gider | EXPENSE | — | Hayır |
| Sözleşme | Fatura (N adet) | PRINCIPAL | FATURA (referenceNo=faturaNo) | Hayır |
| Sözleşme | Cezai şart | CONTRACTUAL_PENALTY | SOZLESME | Hayır |
| Sözleşme | Cari bakiye | PRINCIPAL | SOZLESME | Hayır |
| İlam | Asıl alacak | PRINCIPAL | ILAM | Hayır |
| İlam | Yargılama gideri | EXPENSE | ILAM | Hayır |
| İlam | Vekalet ücreti | ATTORNEY_FEE | ILAM | Hayır |
| İlam | Faiz | INTEREST/PRE_INTEREST | ILAM | Hayır |
| Kambiyo | Çek/Bono (N adet) | PRINCIPAL | CEK/SENET | **Evet → CaseInstrument** |

Katalogdaki her itemType `ClaimItemType` enum'unda **zaten var** (`claim-item.dto.ts`: PRINCIPAL, INTEREST, PRE_INTEREST, POST_INTEREST, EXPENSE, FEE, ATTORNEY_FEE, PENALTY, CHECK_PENALTY, CONTRACTUAL_PENALTY, TAX_KDV/BSMV/KKDF, OTHER). Yeni tip gerekmiyor.

---

## 6. Kilitli kararlar (Ulaş, 2026-06-21)

Bunlar ürün/mimari kararı; aşağıdaki şekilde **sabitlenmiştir**. Bu kararlardan önce kod/şema/migration yazılmaz.

### O-1 — Manuel instrument flag'i = **AYRI YOL**
Manuel çoklu-çek girişi `OCR_MULTI_INSTRUMENT`'e **bağlanmaz**; ayrı flag / ayrı yol ile çalışır.
OCR flag'inden **bağımsız**. (Gerekçe: OCR'ı prod'da açmadan manuel kambiyo girişi mümkün olmalı.)

### O-2 — Kambiyo-dışı şerit = **Faz-1 `dues[]` köprüsü; uzun vade doğrudan ClaimItem**
Kısa vadede kambiyo-dışı kalemler mevcut `dues[]`→köprü→`ClaimItem` yolundan ilerler.
Uzun vadede hedef doğrudan `ClaimItem`. **İlk PR'da büyük cutover YOK.**

### O-3 — Tek editör hedefi = **ClaimItemPanel / ClaimItem-merkezli (kademeli)**
Uzun-vade tek editör hedefi `ClaimItemPanel`/`ClaimItem` mantığıdır. **Hemen bağlanmaz** —
önce tasarım + küçük wiring planı. `DueModal` legacy kalabilir; yeni sihirbaz kademeli olarak
ClaimItem mantığına **evrilir**.

### O-4 — Belge-özel alanlar = **CaseInstrument kambiyo-only; gerisi ClaimItem metadata/referenceNo**
`CaseInstrument` **genelleştirilmez** (D4 kilidi korunur). Fatura/kira/ilam özel alanları
`ClaimItem.metadata` / `referenceNo` / `sourceDocumentNo` içinde taşınır.

### O-5 — Türetilmiş kalemler = **PRINCIPAL kalıcı; faiz/harç/vekalet Faz-1'de sanal**
Asıl alacak (PRINCIPAL) kalıcı `ClaimItem`. Faiz/harç/vekalet ilk aşamada **sanal/hesaplanan**
kalır. (Gerekçe: hepsini kalıcı ClaimItem yapmak erken ve riskli.)

### O-6 — Borçlu↔kalem ilişkisi = **Faz-1 tüm-borçlular; attribution V2**
İlk aşamada "tüm borçlular sorumlu" varsayımı. Ancak veri modeli, ileride **item-debtor
attribution** açılabilecek şekilde tasarlanır. "Çok-borçluda hangi çek hangi borçluya ait" = **V2**.

---

## 7. Uygulama sırası (planlanan PR'lar — bu doc onaylandıktan sonra)

> Kural: migration AYRI · backend AYRI · frontend AYRI · asla aynı PR. Her gate plan→onay→fix→test→PR→merge.

| PR | Tür | İçerik |
|---|---|---|
| **PR-1** | **docs (bu)** | Karar kaydı final (bu doküman) — docs-only |
| **PR-2** | frontend | Sihirbaz state: **çok-kalemli alacak listesi** (tek `kalem` → `kalem[]`); ekle/sil/düzenle UI |
| **PR-3** | frontend (+ flag) | Kambiyo satırları → manuel `instruments[]` payload (O-1: ayrı flag) |
| **PR-4** | frontend/backend | Kambiyo-dışı belge alanları → `ClaimItem.metadata`/`referenceNo` (O-4) |
| **PR-5** | frontend | Post-create `ClaimItemPanel` wiring (O-3 kademeli; küçük wiring planı önce) |

---

## 8. Kapsam dışı (bu kararla SABİTLENMEYEN)

- Kod / şema / migration / docs-dışı PR (bu doküman yalnız karar kaydı).
- CaseInstrument'ın kambiyo-dışına genelleştirilmesi (O-4 ile reddedildi; D4 "kambiyo-only" kilidi korunur).
- TBK100 / faiz motoru davranışı (değişmiyor; toplamlar yalnız ClaimItem'dan — Corollary-1).
- Nafaka taksit takvimi (Due-only kalır; `due-to-claim-item.mapper` NAFAKA→null).
- `dues[]`→`ClaimItem` büyük cutover (O-2: uzun vade; ilk PR'larda YOK).
- Item-debtor attribution (O-6: V2).

---

## 9. Onay durumu + sonraki gate

| Karar | Durum |
|---|---|
| İlke (Case → N ClaimItem; kambiyo = evrağa bağlı alt tip) | ✅ Onaylı (Ulaş, 2026-06-21) |
| Hedef model §4 (var olan kanonik modele bağla, yeniden inşa etme) | ✅ Onaylı |
| O-1 manuel instrument = ayrı yol (OCR flag'inden bağımsız) | ✅ Kilitli |
| O-2 kambiyo-dışı = Faz-1 dues[] köprüsü, uzun vade ClaimItem | ✅ Kilitli |
| O-3 tek editör = ClaimItemPanel/ClaimItem (kademeli) | ✅ Kilitli |
| O-4 CaseInstrument kambiyo-only; gerisi metadata/referenceNo | ✅ Kilitli |
| O-5 PRINCIPAL kalıcı; faiz/harç/vekalet Faz-1 sanal | ✅ Kilitli |
| O-6 Faz-1 tüm-borçlular; attribution V2 | ✅ Kilitli |

**Sonraki adım:** PR-2 (frontend çok-kalem state) için ayrı plan + gate. Bu dokümandan önce kod/şema/migration **yazılmaz** (AGENTS.md).

> **Repo notu:** Bu doküman, sorumlu-personel picker WIP işi ile **alakasızdır** ve onun diff'ine karıştırılmamıştır; kendi branch'inde (`docs/claim-item-wizard-1-design`) docs-only olarak ilerler.
