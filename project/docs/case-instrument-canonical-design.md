# CaseInstrument Kanonik Tasarım — Karar Kaydı

> **Durum:** Kararlar KİLİTLİ (D1·D2·D4 + Corollary 1-4 + AS1/AS2/AS5/AS7) · **Kod YOK · Şema YOK · Migration YOK**
> **Sahip:** Ulaş + Claude (oturum) · **Tarih:** 2026-06-18
> **Tetikleyici:** Codex adversarial review — "OCR hattı tamam ama Instrument ile sistemin geri kalanı arasında kanonik bağ yok."
> Bu doküman koda geçmeden önce veri-modeli kararını yazılı sabitler. Bu noktadan sonra hata teknik değil, **veri-modeli hatası** olur.

---

## 1. Problem (tek cümle)

OCR çoklu-enstrüman hattı (`Instrument[]`) tamamlandı, fakat ürettiği çek/senet bilgisi
sistemin kanonik kambiyo varlığı olan **`CaseInstrument`** tablosuna **hiç yazılmıyor**.
Hat tamamen `Due → ClaimItem` (parasal) üzerinden akıyor; `CaseInstrument` hattın **dışında** duruyor.

```
Bugünkü hat:    OCR → Instrument[] → Review → Due → ClaimItem
Kanonik varlık: CaseInstrument            ⟂  (bağ YOK)
```

Sonuç: kullanıcı ekranda "4 çek eklendi" görür; ama UYAP XML / takip talebi evrakı / validation
tarafında kambiyo **yapısal olarak yoktur** (çek no, banka, keşideci, vade boş gelir).
Bu, 10 MB limit probleminden **ağırdır**; ekranla çıktı arasında sessiz veri uçurumu yaratır.

---

## 2. İlke / Karar (kanonik ayrım)

**Çek/senet hukuken neyin temsilidir? → `CaseInstrument`.**

| Varlık | Rol | İçerik |
|---|---|---|
| **`CaseInstrument`** | **Hukuki gerçek — EVRAK (kanonik kaynak)** | Çek/senet no, banka, şube, keşideci, lehtar, vade, keşide/ibraz tarihi, aval, ciro, karşılıksız, para birimi |
| **`ClaimItem` / `Due`** | **Parasal yansıma — TALEP (türev)** | Asıl alacak / faiz / masraf / vekâlet tutarları (bakiye motoru) |

Çek no, keşideci, lehtar, vade, banka, aval, ciro **alacak kalemi değildir; evraktır.**
Bu nedenle bunlar `description` metnine gömülemez; **yapısal veri** olarak `CaseInstrument`'ta durmalıdır.

> Sistemin kendi davranışı bu ilkeyi zaten doğruluyor: gerçek UYAP yolu çekleri
> `caseInstrument.findMany` ile ayrı bir `<cekler>` yapısı olarak üretiyor
> (`uyap/uyap-xml.service.ts:1013`). UYAP, çek/senet'i alacak kaleminden **ayrı varlık** sayar.

---

## 3. Mevcut durum — kanıtlar (forensic)

### 3.1 `CaseInstrument` modeli — VAR ve alan bazında DOĞRU, ama bağsız
`prisma/schema.prisma:4422-4477`. Alanlar eksiksiz: `instrumentType` (enum), `serialNo`,
`amount Decimal(15,2)`, `currency String @default("TRY")`, `issueDate`, `maturityDate?`,
`presentmentDate?`, `bankName?`, `bankBranch?`, `bankCode?`, `accountNo?`, `drawerName?`,
`drawerIdentity?`, `payeeName?`, `payeeIdentity?`, `endorsers Json?`, `avals Json?`,
`isProtested?`, `bounceDate?` vb.

İki yapısal zayıflık:
- **`caseId` ham `String`** — `@relation` FK **değil** (referans bütünlüğü yok).
- **`ClaimItem`/`Due` ile ilişki YOK** — parasal taraf ile evrak tarafı birbirini tanımıyor.

Enum (`schema.prisma:4479-4484`): `CEK`, `SENET`, `BONO`, `POLICE`.

### 3.2 `CaseInstrument` create yolu — ayrı, createCase'e bağlı DEĞİL
- Servis: `case-instrument.service.ts` → `create()` (`caseInstrument.create`, ~satır 53).
- Controller: `@Controller('case-instruments')` → `POST /api/case-instruments` (tek tek, **case oluştuktan sonra**),
  ayrıca GET/PUT/DELETE + `GET case/:caseId/total`.
- **createCase bu servisi/tabloyu HİÇ çağırmıyor.**

### 3.3 createCase ne yazıyor?
`case/case.service.ts` `create()` (~821-1139) transaction'ı: `Case`, `CaseClient`,
`CaseLawyer`, `CaseDebtor`, `Due`, `ClaimItem` (`createClaimItemsFromDues` ~736-749),
`CaseStaff`, `DomainEvent`. **`tx.caseInstrument.create()` YOK.**
`CreateCaseDto` (`case/dto/case.dto.ts:277-499`) içinde `instruments`/`caseInstruments` **alanı yok**.
`DueDto` (`case.dto.ts:262-275`): `type, description?, amount, dueDate` — **currency yok**.

### 3.4 Frontend — yapısal veri ve currency düşüyor
- `web/.../debtor/ocr-instrument.ts`: `Instrument.currency` **zorunlu** (satır 19) ama
  `instrumentsToDues` (60-73) yalnız `amount + dueDate + açıklama metni` üretir;
  tür/banka/keşideci/no/currency **atılır**.
- `web/.../cases/new/page.tsx` `onInstrumentsDetected` (~1694) → `instrumentsToDues` → `setDues`;
  createCase payload'ı (~1014-1069) yalnız `dues` taşır, `instruments` yok.

### 3.5 `ClaimItem` kambiyo alanı taşımıyor
`schema.prisma:4188-4244`: `currency String @default("TRY")` (4208), generic `referenceNo`
(4226), `sourceDocumentType` (4212), `issueDate/dueDate`. **`instrumentType`/`serialNo`/`bankName`/
`drawerName`/`maturityDate` YOK.** `caseId` burada gerçek `@relation` (4192).

### 3.6 currency üç katmanda kayboluyor
1. `instrumentsToDues` currency'yi kopyalamaz (`ocr-instrument.ts:60-73`).
2. `DueDto`'da currency alanı yok (`case.dto.ts:262-275`).
3. `due-to-claim-item.mapper.ts:74` → `currency: 'TRY'` **hardcode** (her ClaimItem TRY damgalanır).

### 3.7 needsReview default seçili (Codex haklı)
`DebtorStep.tsx:109` → tüm satırlar `selected: true` (needsReview dahil).
`InstrumentReviewTable.tsx:72` yalnız `row.selected`'ı yansıtır.

---

## 4. Tüketici listesi — kim `CaseInstrument` okuyor?

| Tüketici | Dosya | Okuma | Çok-çek? | Not |
|---|---|---|---|---|
| **Gerçek UYAP XML** | `uyap/uyap-xml.service.ts:1013-1046` | `caseInstrument.findMany` (CEK/SENET) | ✅ TÜMÜ | Controller `@Controller('uyap')` GET `xml/case/:caseId`(+`/download`), POST `xml/submit/:caseId` |
| **Takip talebi evrakı** (PDF/Word/UDF) | `template-engine.service.ts:347` | `caseInstrument.**findFirst**` | ❌ **yalnız 1** | Frontend `/template-engine/takip-talebi*` (`api.ts:870-975`) → **çok-çekte düzeltme gerekir** |
| **Validation gate** | `validation-gate.service.ts:461` | `caseInstrument.findFirst` | ❌ | Eksik enstrümanı yakalayabilir |
| **Case detay görünüm** | `case.service.ts:657` | `caseInstrument.findMany` | ✅ | `instruments` olarak döner |
| **(Kırık) ikinci UYAP yolu** | `uyap-export/uyap-case-mapper.service.ts:94-102` | `claimItems[].instrumentType` (**şemada yok**) | — | `item as any` maskeliyor → çek/senet **her zaman boş**; ayrı latent kusur |

**Çıkarım:** kambiyo yapısal verisinin tüm gerçek tüketicileri `CaseInstrument`'tan beslenir;
`Due/ClaimItem`'dan değil. Dolayısıyla çok-çek dosyasında `CaseInstrument` **zorunludur**.

---

## 5. Onaylı kararlar (D1·D2·D4) + corollary'ler

### D1 — Atomiklik = **A**
`CaseInstrument` kayıtları **createCase transaction'ı içinde** yazılır (`dues`/`debtors` gibi).
Ayrı N çağrı (B) reddedildi (yarı-yazılma riski).

### D2 — Kanonik bağ = **Evet** (⚠️ **migration içerir**)
- `ClaimItem.instrumentId` (nullable) → `CaseInstrument` **FK**. Yön: **bir evraktan N kalem türeyebilir**
  (asıl alacak + onun faizi/masrafı aynı `instrumentId`'yi gösterir) → FK `ClaimItem` tarafında.
- `CaseInstrument.caseId` ham `String` → gerçek `@relation` FK'ye yükseltilir (+ uygun `onDelete`).

### D4 — Kapsam = **Evet (yalnız kambiyo)**
`CEK→CEK`, `SENET→SENET`, `POLICE→POLICE`, `BONO→BONO` (OCR şu an BONO üretmiyor; korunur).
`FATURA`/`DIGER` → **`CaseInstrument` DEĞİL**, yalnız `Due/ClaimItem`.

### Corollary-1 — Çift sayım YASAĞI
- Parasal toplamlar **YALNIZ `ClaimItem`**'dan hesaplanır.
- `CaseInstrument.amount` = çekin yüz değeri (hukuki fact); **bakiye toplamına eklenmez**.
- `CaseInstrumentService.getTotalAmount` salt görüntü/validation içindir; case bakiyesine **karıştırılmaz**.
- Bağ (`instrumentId`) mutabakatı sağlar (drift/çift-sayım olmadan "bu kalem ŞU çekten").

### Corollary-2 — Currency kuralı
- Kanonik para birimi = **`CaseInstrument.currency`** (OCR'dan; hukuki fact).
- Evrak-türevli `ClaimItem` (PRINCIPAL) `currency`'si **enstrümanı yansıtır** (TRY-hardcode kırılır).
- UYAP/template zaten `CaseInstrument.currency`'den doğru basar (`UYAP_PARA_BIRIMLERI` map'i hazır).
- **Not:** `due-to-claim-item.mapper.ts:74` genel TRY-hardcode'u kambiyo-dışı dueleri de etkiler;
  geniş düzeltme **ayrı iş** (bkz. §9 açık sorular).

### Corollary-3 — needsReview default = **UNSELECTED**
`needsReview === true` satırlar tabloda **varsayılan seçili gelmez** (`DebtorStep.tsx:109`).
Sistem "emin değilim" diyorsa kalemi otomatik takibe sokmaz.

### Corollary-4 — Template çok-çek
`template-engine.service.ts:347` `findFirst` → **`findMany`** olmalı; aksi halde karar
uygulansa bile evrakın yalnız 1'i basılır. (Read-path; canonical-write'tan ayrı PR.)

---

## 6. Hedef veri modeli (kavramsal — kod değil)

```
Case (1) ───< CaseInstrument (N)        [D2: caseId gerçek FK]
                    ▲
                    │ instrumentId (nullable FK)   [D2: bir evrak → N kalem]
Case (1) ───< ClaimItem (N) ────────────┘
Case (1) ───< Due (N)                    [parasal; değişmiyor]

CaseInstrument  = evrak (yapısal + currency, kanonik)
ClaimItem       = parasal talep (toplamların tek kaynağı)
ClaimItem.instrumentId → hangi evraktan türediği (nullable: kambiyo-dışı kalemler null)
```

İlke: **toplamlar ClaimItem'dan, evrak metadata'sı CaseInstrument'tan.** Tek yön, çift-otorite yok.

---

## 7. Migration planı (D2)

**Tümü additive + nullable → geri-alınabilir. Backfill YOK (ileri-yönlü).**

1. `CaseInstrument.caseId`: ham `String` → `Case` ile `@relation` FK. (Mevcut satırlar caseId
   taşıyor; FK eklemek veri taşımaz, yalnız kısıt + index. `onDelete` = **Cascade** (KİLİTLİ — AS2);
   case silinince evrakı da silinir.)
2. `ClaimItem.instrumentId String?` + `@relation` → `CaseInstrument`. Nullable (kambiyo-dışı = null).
3. Gerekli index'ler (`instrumentId`).
4. **Mevcut kayıtlar dokunulmaz** (eski case'ler instrument'sız kalır; istenirse sonra opsiyonel backfill).

Migration **dev-applied** (migrate deploy), prod **N/A** (ayrı karar). CLAUDE.md gereği migration **AYRI PR**.

---

## 8. PR sırası (gate-by-gate; CLAUDE.md'ye uyumlu)

> Kural: migration AYRI · kanonik/veri-yazan AYRI · migration+frontend+backend ASLA aynı PR.

| PR | Tür | İçerik | Bağımlılık |
|---|---|---|---|
| **PR-N1** | _küçük, bağımsız_ | **Corollary-3**: needsReview default-unselected (`DebtorStep.tsx`) + test | yok — istenirse hemen |
| **PR-N2** | **migration (AYRI)** | **D2 şeması**: `CaseInstrument.caseId` FK + `ClaimItem.instrumentId` FK + index'ler (additive, nullable, backfill yok) | — |
| **PR-N3** | backend canonical-write | **D1+D4**: `CreateCaseDto.instruments[]` + createCase tx içinde `caseInstrument.create` + cambiyo enum eşleme + PRINCIPAL ClaimItem'a `instrumentId` bağlama + **Corollary-2** (instrument currency) + çift-sayım koruması. **Kapsam: yalnız OCR/multi-instrument hattı — AS1; tüm kambiyo evrenini açma.** | PR-N2 |
| **PR-N4** | frontend behavior | Sihirbaz: seçili **tam `Instrument[]`**'i payload'a taşı (yalnız dues değil); review→instruments+dues eşleme | PR-N3 (DTO) |
| **PR-N3b** | backend (AYRI) | **AS5**: genel `ClaimItem` TRY-hardcode düzeltmesi (`due-to-claim-item.mapper.ts:74` + `DueDto` currency) — bu feature zincirinde ama **ayrı PR** | bağımsız |
| **PR-N5** | tüketici düzeltme | **Corollary-4** template `findFirst→findMany`; kırık `uyap-export`: **emekli ETME — kırık tüketici olarak işaretle/dokümante (AS7), düzeltme ayrı PR** | bağımsız |

needsReview (PR-N1) hızlı kazanım, en önce gidebilir. Asıl kanonik zincir: **N2 → N3 → N4**.

---

## 9. Kararlar (kilitli) + kalan açık sorular

**KİLİTLİ (Ulaş, 2026-06-18):**
- **AS1 — Kapsam:** İlk kapsam **yalnız OCR / multi-instrument kambiyo hattı**
  (`OCR_MULTI_INSTRUMENT` ardında). Tüm kambiyo evrenini aynı PR'da açma; sonra mezun edilir.
- **AS2 — onDelete:** `CaseInstrument.caseId` FK = **Cascade** (case silinince evrak da silinir).
- **AS5 — Genel TRY-hardcode:** `ClaimItem` TRY-hardcode düzeltmesi (`due-to-claim-item.mapper.ts:74`
  + `DueDto` currency) bu feature **zincirinde ele alınır AMA ayrı PR** (PR-N3b).
- **AS7 — uyap-export:** **Emekli EDİLMEZ.** Kırık tüketici olarak **işaretle/dokümante**;
  düzeltme **ayrı PR**'a bırakılır (gerçek yol `uyap/uyap-xml.service` zaten çalışıyor).

**Kalan açık (daha düşük öncelik; kanonik zinciri bloklamaz):**
- **AS3 — Borçlu ilişkisi:** Hangi borçlu hangi çekten sorumlu? Bugün yalnız `drawerName` (metin),
  `CaseDebtor` FK yok. Çok-borçlu kambiyoda gerekli mi? (Ayrı karar.)
- **AS4 — Çoklu para birimi:** Aynı takipte USD + TRY çek olursa `Case.currency` (tek enum) "birincil" mi?
  (Kalem/enstrüman bazında currency taşınır.)
- **AS6 — Eski veri backfill:** instrument'sız eski case'ler için opsiyonel backfill (şimdilik **hayır**).

---

## 10. Risk / Rollback

- **Migration (PR-N2):** additive + nullable + backfill yok → rollback = kolonları/FK'yi düşür, veri kaybı yok.
- **Davranış (PR-N3/N4):** flag ardında başlar (AS1 kilitli), kapalıyken legacy birebir; flag = anahtar rollback.
- **Çift sayım:** Corollary-1 ihlali (CaseInstrument.amount'ı toplama eklemek) **finansal hata** üretir →
  PR-N3'te açık test + grep-gate ile korunur (toplam yalnız ClaimItem'dan).
- **Tüketici (PR-N5):** read-path; yanlışsa yalnız görüntü/evrak etkilenir, veri bozulmaz.

---

## 11. Kapsam dışı (bu kararla SABİTLENMEYEN)

- Borçlu↔enstrüman sorumluluk ilişkisi (açık soru 3).
- `DueDto` currency genişletmesi / genel TRY-hardcode düzeltmesi (açık soru 5).
- 50 MB upload limiti (PR-4 — en son, ayrı).
- OCR poppler/render altyapısı, AI extraction kalitesi.
- `uyap-export` modülünün geleceği (açık soru 7).

---

## 12. Onay durumu

| Karar | Durum |
|---|---|
| İlke (CaseInstrument = hukuki gerçek) | ✅ Onaylı (Ulaş) |
| D1 = A (createCase tx içinde) | ✅ Onaylı |
| D2 = Evet (FK + relation, migration içerir) | ✅ Onaylı |
| D4 = Evet (yalnız CEK/SENET/BONO/POLICE) | ✅ Onaylı |
| Corollary 1-4 (çift-sayım/currency/needsReview/template) | ✅ Onaylı (Ulaş) |
| AS1/AS2/AS5/AS7 | ✅ Kilitli (§9) |
| AS3/AS4/AS6 | ⬜ Açık (düşük; zinciri bloklamaz) |

**Sonraki adım:** Bu doc onaylanınca PR-N1 (veya N2'den kanonik zincir) için ayrı plan + gate.
Bu doc'tan önce kod/şema/migration **yazılmaz**.
