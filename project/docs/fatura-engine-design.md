# FATURA MOTORU — Tasarım Dokümanı (G1–G3) · Karar Kaydı

> **Durum:** KARARLAR KİLİTLİ (Ulaş, 2026-06-21) · **Kod YOK · Şema YOK · Migration YOK**
> **Sahip:** Ulaş + Claude (oturum) · **Tarih:** 2026-06-21
> **İlke:** Var olan kanonik modele **BAĞLA — yeniden inşa ETME.** Greenfield değil; çek epiğinin
> (party-type + VKN/identity + per-page AI) üstüne **ENRICHMENT**.
> **Tetikleyici:** Çek (kambiyo) OCR'ı uçtan uca çözüldü (party-type+VKN epiği `#320/#322/#324`, gerçek UI
> doğrulandı). Sıradaki ürün kazancı = **makine-yazısı belgeler** (fatura/ilam/sözleşme/kira) — düzenli layout,
> yüksek OCR doğruluğu. İlk ve en kolay: **Fatura** (en hızlı ticari değer, doğrudan ClaimItem üretir).

**İlgili kilitli dokümanlar (bu doküman onları GENİŞLETİR, çelişmez):**
- [`claim-item-wizard-1-design.md`](./claim-item-wizard-1-design.md) — kanonik çok-kalem ClaimItem modeli (manuel giriş). **Fatura Motoru = bu modelin OCR on-ramp'i.**
- [`case-instrument-canonical-design.md`](./case-instrument-canonical-design.md) — CaseInstrument kanonik ayrımı + **D4 kilidi** (kambiyo-only).

---

## 1. Amaç & konumlandırma (tek cümle)

PDF/scan **fatura** → OCR → alanlar → **kanonik PRINCIPAL `ClaimItem`** (`sourceDocumentType=FATURA`,
`referenceNo=faturaNo`) → İlamsız icra takibi.

Fatura Motoru, `claim-item-wizard-1`'in **manuel** girdiği şeyin **OCR-otomatik** karşılığıdır:

```text
tarama → önerilen alacak kalemi(leri) (PRINCIPAL/FATURA) + taraflar (alacaklı/borçlu + VKN/TCKN) + KDV
       → kullanıcı çok-kalem ekranında gözden geçirir/düzenler → takip
```

**Kapsam sırası (G0 = Ulaş kararı): scan/print PDF (OCR-only, G1/G2) ÖNCE; e-fatura XML (UBL-TR, G3) SONRA.**
Gerekçe: kullanıcı pratikte PDF yükleyecek; XML daha doğru ama ayrı ingestion işi; önce mevcut OCR pipeline +
Due→ClaimItem yolu işletilsin.

---

## 2. Mevcut durum — forensic özeti (ne VAR / ne YOK)

### VAR (reuse edilecek — greenfield değil)
| Parça | Yer | Not |
|---|---|---|
| `FATURA` documentType | per-page prompt (`PAGE_EXTRACTION_PROMPT`) · `InstrumentType`/`DebtDocumentResult.documentType` union · legacy regex (`ocr.service.ts` "fatura/e-fatura/kdv/vergi dairesi") · Vision prompt · type map'ler | tanıma ÇOK yerde sağlam |
| FATURA → takip türü | `isKambiyo` FATURA'yı dışlar → `suggestedCaseType=ILAMSIZ` → wizard `FORM_7` (İlamsız) | doğru: kambiyo değil |
| **debtInfo → Due → ClaimItem** | `createCase` → `createClaimItemsFromDues` → `due-to-claim-item.mapper.ts` (`mapDueTypeToClaimItemType`) | **belge-türü AGNOSTİK** → fatura BUGÜN ClaimItem üretir |
| party-type + kimlik | `inferPartyType` (Kurum/Şahıs) · `drawerIdentityNo` + `sanitizeOcrIdentityNo` (VKN/TCKN checksum) | çek epiği — fatura için AYNEN |
| per-page AI | `buildPageAiExtract` + `PAGE_EXTRACTION_PROMPT` | additive alan ekleyerek |
| classify-file | `POST /ocr/classify-file` → `classifyDocument(WithAI)` → `DetectedCaseType` (fatura→ILAMSIZ) | per-page extraction'dan ayrı |
| **KDV ŞEMA** | `ClaimItem`/`Due`: `hasKdv`/`kdvRate`/`hasBsmv`/`hasKkdf` + `ClaimItemType` `TAX_KDV/TAX_BSMV/TAX_KKDF` | model hazır, OCR+mapper DOLDURMUYOR |
| `faturaBilgileri` (manuel) | `ProfessionalClaimItemForm` | manuel çok-kalem formu zaten fatura alt-nesnesi topluyor |

### YOK (gerçek yeni iş)
- **KDV OCR çıkarımı** (RawPageFields/PageCandidate/Instrument/debtInfo'da KDV/VAT/oran/tutar alanı ABSENT).
- **ALACAKLI (creditor) OCR çıkarımı** — `buildDebtResultFromInstruments` tüm party'leri `role=BORCLU` yapar; `ALACAKLI` enum var ama üretilmiyor.
- **e-fatura XML/UBL-TR** ingestion = ABSENT (parser lib yok; `xmlbuilder2` yalnız UYAP EXPORT; `.xml` upload allowlist'te değil).

### D4 (dokunulmaz)
`ocr-instrument-to-case-instrument.mapper.ts`: `OCR_TO_CASE_INSTRUMENT` → `CEK/SENET/POLICE`→type, **`FATURA→null`, `DIGER→null`**. Fatura **bilerek** CaseInstrument'a girmez; Due/ClaimItem hattı doğru yol. (`case-instrument-canonical` + `claim-item-wizard` O-4 kilidi.)

---

## 3. Kilitli kararlar (Ulaş, 2026-06-21)

| # | Karar |
|---|---|
| **F-1** | Fatura ClaimItem yolu = **`dues[]` köprüsü → kanonik `ClaimItem`** (PRINCIPAL, `sourceDocumentType=FATURA`, `referenceNo=faturaNo`). **CaseInstrument DEĞİL.** (claim-item-wizard **O-2/O-4** ile hizalı; uzun vade doğrudan ClaimItem.) |
| **F-2** | Sıra = **OCR-only (G1/G2) → XML-first (G3).** Input önce scan/print PDF. |
| **F-3** | **REUSE zorunlu:** `inferPartyType` + `drawerIdentityNo`/`sanitizeOcrIdentityNo` + `buildPageAiExtract`/`PAGE_EXTRACTION_PROMPT`. Paralel/yeni çıkarım modeli YASAK. |
| **F-4** | KDV = `ClaimItem`/`Due`'nun **MEVCUT** alanlarına (`hasKdv`/`kdvRate`) ve/veya ayrı `TAX_KDV` kalemine map. **Yeni vergi tablosu YOK.** |
| **F-5** | ALACAKLI tarafı (fatura alacaklısı genelde **müvekkil**) → mevcut müvekkil/creditor akışıyla hizala; **çift-kayıt YASAK.** |
| **F-6** | **D4 DOKUNULMAZ.** Fatura ≠ CaseInstrument. Fatura-özel alanlar `ClaimItem.referenceNo`/`sourceDocumentNo`/`metadata` içinde (O-4). |

---

## 4. G1 — Fatura OCR Alanları (additive, reuse-ağırlıklı)

**Hedef alanlar** (✅ mevcut · ➕ yeni):

```text
faturaNo      = documentNo            ✅
faturaTarihi  = issueDate             ✅
vade          = dueDate               ✅
toplam tutar  = amount                ✅   (KDV-dahil mi? → O-2 karar)
para birimi   = currency              ✅
borçlu        = drawerName + drawerIdentityNo(VKN/TCKN)   ✅ (çek epiği)
ALACAKLI      = creditorName + creditorIdentityNo(VKN)    ➕
KDV           = kdvRate + kdvAmount + (netAmount)         ➕
```

**Tasarım:**
- `PAGE_EXTRACTION_PROMPT` **additive** fatura alanları (`kdvRate`, `kdvAmount`, `netAmount`, `creditorName`, `creditorIdentityNo`). Anti-grouping + çek tarih kuralları **KORUNUR** (regresyon yok).
- `RawPageFields`/`PageCandidate`/`Instrument`/`debtInfo`'ya **opsiyonel additive** alanlar (çek davranışı değişmez; alan boşsa eski akış).
- Party sentezi: alacaklı → `role=ALACAKLI` (bugün hep BORCLU); `inferPartyType` + `sanitizeOcrIdentityNo` creditor için de.
- **KDV tutarlılık guard:** `toplam ≈ net + KDV` (tolerans); yalnız sayfada görüneni al — hesap UYDURMA; tutmuyorsa KDV alanlarını düşür + `needsReview`. (sanitize felsefesi: yanlış-yayılma yerine düş.)
- Fatura tek-sayfa → çek'in ön/arka/ciro/grouping karmaşası **YOK** → daha basit, daha yüksek doğruluk.

**Test:** unit (yeni alan extraction + creditor/debtor party tipi/VKN) + **CANLI gerçek fatura PDF gate** (çek epiğindeki gate deseni: gerçek PDF + gerçek gpt-4o + üretim yolu).

---

## 5. G2 — Fatura → Due(PRINCIPAL) → ClaimItem(PRINCIPAL) + KDV map

**Akış:**
```text
scan(documentType=FATURA) → DebtDocumentResult{debtInfo, parties[alacaklı + borçlu]}
   → frontend → Due(type=PRINCIPAL, referenceNo=faturaNo, sourceDocumentType=FATURA)
   → createClaimItemsFromDues (mevcut köprü) → kanonik ClaimItem(PRINCIPAL)
```

- **F-1/O-2 ile hizalı:** kambiyo-dışı şerit Faz-1 `dues[]` köprüsünden ilerler (büyük cutover yok).
- **KDV map (O-1 açık karar):** `hasKdv=true` + `kdvRate`; KDV ya PRINCIPAL'da bayrak ya da ayrı `TAX_KDV` kalemi.
- **Tutar semantiği (O-2 açık karar, Av.):** takip PRINCIPAL = **KDV-dahil toplam** mı, **net + ayrı `TAX_KDV`** mı? (İcra pratiği genelde KDV-dahil toplam; ama ayrı kalem de mümkün — hukuki karar.)
- **Çift-sayım yasağı (Corollary-1):** PRINCIPAL tek kaynak; KDV'yi **hem göm hem ayrı kalem yapma**. Toplamlar yalnız `ClaimItem`'dan.
- **Taşıma kararı (O-5):** fatura `referenceNo`/`sourceDocumentType` — `DueDto`'ya alan mı eklenir, yoksa köprüde `ClaimItem.referenceNo`/`sourceDocumentNo`'ya mı yazılır? (O-4: ClaimItem metadata/referenceNo tercih.)

**Test:** unit (Due→ClaimItem + KDV map) + canlı `createCase` → ClaimItem + KDV alanları doğrulama (DB).

---

## 6. G3 — XML-first (e-fatura UBL-TR) — SONRA (ayrı PR ailesi)

- **Greenfield:** `.xml` upload allowlist (`ocr.controller` `fileFilter`) + XML parser lib (ör. `fast-xml-parser`) + **UBL-TR → debtInfo/Due** map.
- **Dual-path:** XML varsa **parse** (deterministik, ~%100); yoksa **OCR fallback**. Aynı `Due→ClaimItem` hedefi.
- **Ön-koşul:** G1/G2 akışı kanıtlandıktan **ve** gelen faturaların gerçekten e-fatura XML olduğu doğrulandıktan sonra. (G0: input önce PDF varsayıldı.)

---

## 7. Açık kararlar (Av./Ulaş-gated — G2 başlamadan netleşmeli)

| # | Karar |
|---|---|
| **O-1** | KDV = PRINCIPAL'a gömülü bayrak mı / ayrı `TAX_KDV` kalemi mi? |
| **O-2** | Takip PRINCIPAL tutarı = KDV-dahil toplam mı / net + ayrı KDV mi? (icra hukuku) |
| **O-3** | Alacaklı = müvekkil eşleştirme (mevcut creditor/client akışı) — çift-kayıt önleme yöntemi |
| **O-4** | Tek-fatura çoklu-satır (kalem) → tek PRINCIPAL mı, satır-başı kalem mi? (MVP önerisi: tek toplam) |
| **O-5** | `referenceNo`/`sourceDocumentType` taşıma = `DueDto` alanı mı / köprüde ClaimItem'a mı? |

---

## 8. Reuse haritası (çek epiğinden — F-3)

```text
party type          inferPartyType (Kurum/Şahıs)                    → alacaklı/borçlu AYNEN
identityNo          drawerIdentityNo + sanitizeOcrIdentityNo (VKN)  → AYNEN (creditor için de)
per-page AI         buildPageAiExtract + PAGE_EXTRACTION_PROMPT     → FATURA zaten var, alan ekle
doc classification  classify-file / classifyDocument               → fatura→ILAMSIZ (mevcut)
claim üretimi       debtInfo→Due→ClaimItem (belge-agnostik köprü)   → AYNEN
KDV                 ClaimItem/Due.hasKdv/kdvRate + TAX_KDV enum     → şema hazır, doldur
```

---

## 9. Çamur-önleyici kurallar (kilitli)

1. **Paralel çıkarım YOK** — mevcut OCR tiplerini genişlet; yeni model/servis kurma.
2. **D4 DOKUNMA** — fatura ≠ CaseInstrument (O-4); fatura-özel alan = `ClaimItem.referenceNo`/`metadata`.
3. **KDV** = mevcut şema alanları; yeni vergi tablosu yok.
4. **Alacaklı** = müvekkil akışıyla hizala; çift-kayıt yok (F-5).
5. **Çift-sayım yok** — PRINCIPAL tek kaynak (Due/ClaimItem); KDV hem göm hem ayrı kalem olmaz.
6. **claim-item-wizard-1 ile çelişme** — Fatura Motoru o modelin OCR on-ramp'i; ortak hedef = kanonik `ClaimItem`.

---

## 10. Gate planı & test stratejisi

```text
G1  Fatura OCR alanları (prompt + types additive + creditor party + KDV extraction)
G2  Fatura → Due(PRINCIPAL) → ClaimItem + KDV map   (O-1..O-5 ÖNCE netleşir)
G3  XML-first (UBL-TR parser + .xml allowlist + XML→Due)   [SONRA, ayrı PR ailesi]
```

Her gate: **plan → onay → izole git worktree (Windows junction-audit) → additive fix → unit + CANLI gerçek
PDF gate → ayrı PR → tek CI → merge onayı.** (Çek epiğindeki disiplinin aynısı.)

**Başlangıç ön-koşulu:** O-1/O-2 (KDV + tutar semantiği) hukuki kararı G2'den önce; G1 bunları beklemeden
(saf extraction) başlayabilir.
