# UYAP-OFFICIAL-LEGAL-SEMANTIC-MAPPING-AUTHORITY-R01 — v1.0

| Alan | Değer |
| --- | --- |
| Canonical task | `UYAP-OFFICIAL-LEGAL-SEMANTIC-MAPPING-AUTHORITY-R01` |
| Program | `UYAP-MODULE-FULL-GAP-CLOSURE-R02` |
| Mode | ANALYZE → AUTHORITY MATERIALIZATION → GOVERNANCE PR → CLOSE |
| Predecessor | `UYAP-P02B-R2-FOLLOWUP-CANONICALIZATION-R01` — CLOSED/CANONICAL, PR #1832, `398f06dc` |
| Original task | `DBP-P2-UYAP-CONTRACT-A-P02B-R2` — CLOSED / UNCHANGED, PR #1436, `0b09ebbd` |
| Tarih | 2026-07-29 |

## 0. Authority scope

Bu belge **yetki materyalizasyonudur**. Runtime implementasyonu, mapping kodu,
serializer değişikliği, schema/migration, transport, adapter, cutover ve Canary
yürütmesi **NOT AUTHORIZED**. Hiçbir satır otomatik olarak koda bağlanmaz.

### 0.1 Authority zinciri (bağlayıcı)

```text
INTERNAL DOMAIN FACT → LEGAL CHARACTERIZATION → OFFICIAL SEMANTIC VALUE → OFFICIAL CODE
```

Yasak zincir:

```text
LEGACY CODE → SAME NUMERIC OFFICIAL CODE
```

Authority **DEĞİLDİR**: dosya adı · serbest metin açıklama · UI etiketi ·
çağıran-verilen kod · tarihsel magic number · serializer varsayılanı.

```text
LEGACY NUMERIC CODES:            NOT AUTHORITY
CALLER-SUPPLIED OFFICIAL CODES:  NOT AUTHORITY
UNRATIFIED MAPPINGS:             NOT EMITTABLE
ABSENT OR AMBIGUOUS SEMANTICS:   FAIL-CLOSED
```

## 1. Internal domain semantic inventory

| # | Kaynak | Alan | Yazan | Okuyan | Canonical owner | Production reachable | Semantic precision | Mapping fitness |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| D1 | `Case` | `proceedingType` (`ProceedingType`) | case modülü | `ProceedingClassificationService` | **EVET** — owner Decision, gizli fallback YOK, null → UNRESOLVED | EVET | YÜKSEK — hukuki takip türü | **takipTuru** |
| D2 | `Case` | `judgmentExecutionType` | case modülü | `LegalPeriodCalculationService` | EVET — yalnız `JUDGMENT_ENFORCEMENT`'ta anlamlı | EVET | YÜKSEK — ilam alt türü | takipTuru destek · mahiyet adayı |
| D3 | `Case` | `rentalType` / `bankruptcyType` | case modülü | rule matrix | EVET | EVET | YÜKSEK | takipTuru destek |
| D4 | `CaseInstrument` | `instrumentType` (`InstrumentType`) | `case-instrument` modülü | aynı modül + OCR mapper | **EVET** — schema yorumu: "kanonik enstrüman kaynağı" | EVET | YÜKSEK — kambiyo evrak türü | **alacakKalemi wrapper** |
| D5 | `Case` | `subCategory` (`CaseSubCategory`) | case modülü | claim-engine, claim-item, document-template | KISMÎ — 5 değer | EVET | ORTA | mahiyetKodu (kısmî) |
| D6 | `Case` | `caseType` (`CaseType`) | case modülü | çeşitli | HAYIR — `proceedingType`'ın YERİNE GEÇMEZ | EVET | DÜŞÜK | **UYGUN DEĞİL** |
| D7 | `Case` | `executionPath` (`ExecutionPath`) | case modülü | çeşitli | HAYIR — takip *yolu*, takip *türü* değil | EVET | ORTA | takipTuru için **UYGUN DEĞİL** |
| D8 | `ClaimItem` | `dueType` (`DueType`) | claim-item | claim-engine | EVET — alacak **kalemi** türü | EVET | YÜKSEK | `alacakKalemi` içeriği; wrapper DEĞİL |
| D9 | `config/uyap-mahiyet-kodlari.ts` | `TUM_MAHIYET_KODLARI` | — | **HİÇBİRİ (0 importer)** | HAYIR — orphan config | **HAYIR** | YÜKSEK (aşağıya bakınız) | referans kanıt |
| D10 | `PreEnforcementProcessType` | — | case modülü | — | EVET — icra takibinden ÖNCEKİ süreç | EVET | — | takipTuru için **UYGUN DEĞİL** |

### 1.1 D9 — bağımsız doğrulama kaynağı (üretimde ölü, kanıt olarak canlı)

`src/config/uyap-mahiyet-kodlari.ts` (kaynak beyanı: *UYAP Duyurusu 18/12/2015*)
**hiçbir yerden import edilmiyor** (0 importer) → üretim yolunda değil. Ancak içeriği
iki hash-pinned resmî artefaktla **birebir örtüşüyor**:

- 17 kod, `KodluBilgilerData.xml` (`f9592571…`) ASCII iskeletiyle aynı anlamlar;
- `5045` **YOK** → resmî `exchange.dtd` (`124a9a96…`) `ATTLIST dosya` enumerasyonuyla aynı;
- kodlar `ILAMSIZ_ORNEK_7` (13) / `ILAMLI_ORNEK_4_5` (4) olarak gruplanmış.

Bu, resmî anlamların **üçüncü bağımsız teyididir** ve `mahiyetKodu` matrisinde kanıt
olarak kullanılır.

⚠ **Ancak iki kusuru vardır ve authority olarak kullanılmaz:**

1. Satır 21 `İLAMSIZ` grubu için `takipTuru="0"`, satır 41 `İLAMLI` grubu için de
   `takipTuru="0"` diyor. Resmî codelist `0 = İlamlı Takip`, `1 = İlamsız Takip`.
   Yorumdaki `takipTuru` değerleri **yanlıştır**; yalnız grup ayrımı geçerlidir.
2. `subCategory` alanı "Sistemdeki `CaseSubCategory` ile eşleşme" iddiasında bulunuyor,
   fakat taşıdığı değerler (`TELEFON_SABIT`, `COCUK_TESLIMI`, …) `CaseSubCategory`
   enum'ında **YOKTUR**; 17 satırın yalnız `NAFAKA`'sı gerçek bir enum değeridir.
   → **MODEL RESIDUAL R-01.**

## 2. `takipTuru` authority matrisi

Resmî sistem: **`0` = İLAMLI · `1` = İLAMSIZ** (kaynak: `KodluBilgilerData.xml`
`takipTuru` düğümü + `exchange.dtd` `ATTLIST dosya takipTuru (0 | 1) "1"`).

**Repository-içi karakterizasyon kanıtı.** `legal-period-rule-matrix.ts`
(MPB-028(a) PR-3C, owner Decision 2026-07-13) her takip türü için süre imzası taşır.
`objectionDays` = **ödeme emrine itiraz** hakkı; ilamlı icrada itiraz yoktur, icra
emri ve cebrî icra vardır. Bu ayrım repository'nin kendi kanonik tablosundan okunur —
dışarıdan hukuk bilgisi eklenmemiştir.

| # | Internal source | Domain meaning | Repo evidence | Official value | Disposition | OWNER RATIFIED |
| --- | --- | --- | --- | --- | --- | --- |
| T-01 | `proceedingType = GENERAL_EXECUTION` | genel haciz yoluyla takip | rule matrix: `objectionDays 7`, `paymentDays 7`, `HACIZ_REQUEST_ELIGIBLE` → ödeme emri + itiraz | `1` (İLAMSIZ) | RATIFIED | **YES** |
| T-02 | `proceedingType = CAMBIO` | kambiyo senetlerine özgü takip | rule matrix: `objectionDays 5`, `paymentDays 10` → ödeme emri + itiraz | `1` (İLAMSIZ) | RATIFIED | **YES** |
| T-03 | `proceedingType = RENT` (4 alt tür) | kira alacağı / tahliye takibi | rule matrix 4 satır: `objectionDays 7`, `vacateDays 30/10/60/15` → ödeme emri + itiraz | `1` (İLAMSIZ) | RATIFIED | **YES** |
| T-04 | `proceedingType = JUDGMENT_ENFORCEMENT` (5 alt tür) | ilama dayalı icra | rule matrix 5 satır: `objectionDays **null**`, `performanceDays`, `FORCED_PERFORMANCE_ELIGIBLE` → icra emri, itiraz hakkı YOK | `0` (İLAMLI) | RATIFIED | **YES** |
| T-05 | `proceedingType = BANKRUPTCY:ORDINARY` | adi iflas yoluyla takip | rule matrix'te var (`objectionDays 7`) ama iflas yolu ayrı `dosyaTipi` boyutudur; `takipTuru`'nun iflas dosyasında uygulanıp uygulanmadığı repo'da yazılı DEĞİL | — | AUTHORITY_REQUIRED | NO |
| T-06 | `proceedingType = BANKRUPTCY:CAMBIO` | kambiyo yoluyla iflas | aynı | — | AUTHORITY_REQUIRED | NO |
| T-07 | `proceedingType = PLEDGE` | rehnin paraya çevrilmesi | rule matrix'te **bilinçli olarak YOK** — owner sınırı: "doğrulanmamış süre kuralı ekleme; UNRESOLVED bırak" | — | AUTHORITY_REQUIRED | NO |
| T-08 | `proceedingType = MORTGAGE` | ipoteğin paraya çevrilmesi | aynı owner sınırı | — | AUTHORITY_REQUIRED | NO |
| T-09 | `proceedingType = EVICTION` (bağımsız) | tahliye | aynı owner sınırı | — | AUTHORITY_REQUIRED | NO |
| T-10 | `proceedingType = PUBLIC_RECEIVABLE` | kamu alacağı | aynı owner sınırı | — | AUTHORITY_REQUIRED | NO |
| T-11 | `proceedingType = null` | sınıflandırılmamış | `ProceedingClassificationService` UNRESOLVED döner, tahmin ETMEZ | — | UNRESOLVED / FAIL-CLOSED | NO |

```text
TAKIPTURU: RATIFIED 4 · AUTHORITY_REQUIRED 6 · UNRESOLVED 1
```

**Yeterli sayılmayan kanıtlar (uygulanmadı):** legacy `1..6` kodu · dosyada ilam belgesi
bulunması · belge adı · dava türü · kullanıcı açıklaması · `ExecutionPath` · `CaseType`.

## 3. `alacakKalemi` wrapper authority matrisi

Resmî yetkili ebeveynler (P02B-R2 follow-up'ta DTD'den ölçüldü):
`cek` · `senet` · `police` · `kontrat` · `digerAlacak` · `ilam`.

| # | Internal type | Legal instrument / basis | Canonical domain source | Repo evidence | Candidate wrapper | Disposition | OWNER RATIFIED |
| --- | --- | --- | --- | --- | --- | --- | --- |
| W-01 | `InstrumentType.CEK` | çek | `CaseInstrument.instrumentType` | schema yorumu "kanonik enstrüman kaynağı"; model çek alanları taşıyor (`bankName`, `presentmentDate`) | `cek` | RATIFIED | **YES** |
| W-02 | `InstrumentType.SENET` | bono / emre muharrer senet | aynı | model `maturityDate` (vade) taşıyor | `senet` | RATIFIED | **YES** |
| W-03 | `InstrumentType.BONO` | bono | aynı | SENET/BONO iç ayrımı repo'da **NEW FINDING / NOT AUTHORIZED**; ancak resmî sözlükte tek `senet` sarmalayıcısı var, iki değer de aynı sarmalayıcıya düşer → iç belirsizlik bu eşlemeyi etkilemez | `senet` | RATIFIED | **YES** |
| W-04 | `InstrumentType.POLICE` | poliçe | aynı | resmî DTD'de `police` ayrı bir element olarak bildirilmiş ve `alacakKalemi` taşıyor; domain değeri ile birebir tekil karşılık, başka aday sarmalayıcı yok | `police` | RATIFIED | **YES** |
| W-05 | `proceedingType = JUDGMENT_ENFORCEMENT` | ilama dayalı alacak | `Case.proceedingType` + `judgmentExecutionType` | T-04 ile aynı kanıt zinciri | `ilam` | RATIFIED | **YES** |
| W-06 | sözleşmeye dayalı alacak | kontrat | **YOK** | domain'de sözleşme-alacağı ayrımı taşıyan kanonik alan bulunamadı; `CaseSubCategory` böyle bir değer içermiyor | `kontrat` | AUTHORITY_REQUIRED / **MODEL RESIDUAL R-02** | NO |
| W-07 | yukarıdakiler dışındaki alacak | diğer | **YOK** | `digerAlacak`'a **fallback YASAK**; "başka kategoriye girmeyen alacak"ı pozitif olarak ifade eden kanonik domain türü yok | `digerAlacak` | AUTHORITY_REQUIRED | NO |

```text
ALACAKKALEMI: RATIFIED 5 · AUTHORITY_REQUIRED 2 · MODEL RESIDUAL 1 (R-02)
```

### 3.1 Çakışma kuralı (fail-closed)

Bir `Case` hem `CaseInstrument` kaydı hem `proceedingType = JUDGMENT_ENFORCEMENT`
taşırsa W-01…W-04 ile W-05 **aynı anda** uygulanabilir görünür. Bu durum otomatik
çözülmez:

```text
INSTRUMENT + JUDGMENT_ENFORCEMENT → AMBIGUOUS / FAIL-CLOSED / AUTHORITY_REQUIRED
```

Öncelik sırası **tayin edilmemiştir**; bir sarmalayıcı seçilmez.

## 4. `mahiyetKodu` authority matrisi

### 4.1 Resmî emit edilebilir 17 kod (exact)

Kaynak düğüm: `KodluBilgilerData.xml` → `mahiyetKodu`; kısıt:
`exchange.dtd` → `ATTLIST dosya mahiyetKodu (…) #IMPLIED`.

| Code | Official meaning | Resmî grup |
| --- | --- | --- |
| 1007 | Telefon (Sabit) - Örnek 7 | İLAMSIZ |
| 1107 | Çocuk Teslimi - Örnek 7 | İLAMSIZ |
| 1207 | Tük. Hakem Heyeti - Örnek 7 | İLAMSIZ |
| 1307 | Belgesiz - Örnek 7 | İLAMSIZ |
| 1407 | Sözleşme/Protokol - Örnek 7 | İLAMSIZ |
| 2007 | Telefon (Cep) - Örnek 7 | İLAMSIZ |
| 3007 | İnternet/TV - Örnek 7 | İLAMSIZ |
| 4007 | Su - Örnek 7 | İLAMSIZ |
| 5007 | Elektrik - Örnek 7 | İLAMSIZ |
| 6007 | Doğal Gaz - Örnek 7 | İLAMSIZ |
| 7007 | Kredi Kartı - Örnek 7 | İLAMSIZ |
| 8008 | Kredi Sözleşmesi - Örnek 7 | İLAMSIZ |
| 9009 | Nafaka - Örnek 7 | İLAMSIZ |
| 1045 | Nafaka - Örnek 4-5 | İLAMLI |
| 2045 | Çocuk Teslimi - Örnek 4-5 | İLAMLI |
| 3045 | Tük. Hakem Heyeti - Örnek 4-5 | İLAMLI |
| 4045 | Para Alacağı - Örnek 4-5 | İLAMLI |

`5045` bu matrisin **ratifiable kümesine dâhil değildir** (bkz. §5).

### 4.2 Domain → resmî mahiyet dispozisyonu

Legacy sözlük (`UYAP_MAHIYET_KODLARI`, `uyap-xml.service.ts`) aynı 17 kodu **tamamen
farklı** anlamlarla kullanır (legacy `1045 = Fatura Alacağı`, resmî `1045 = Nafaka`).
Legacy kod **authority değildir** ve hiçbir satırda kanıt olarak kullanılmamıştır.

| # | Code | Official meaning | Internal type | Current legacy code | Legacy meaning | Canonical domain evidence | Disposition | OWNER RATIFIED |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| M-01 | 9009 | Nafaka - Örnek 7 | `CaseSubCategory.NAFAKA` + takipTuru `1` | 9009 | Diğer Takip | `CaseSubCategory.NAFAKA` = "Nafaka alacağı (dönemsel)"; konu eşleşmesi tekil ve birebir; grup ayrımı D9 ile teyitli | RATIFIED (koşullu) | **YES** |
| M-02 | 1045 | Nafaka - Örnek 4-5 | `CaseSubCategory.NAFAKA` + takipTuru `0` | 1045 | Fatura Alacağı | aynı; ilamlı/ilamsız ayrımı T-01…T-04'ten gelir | RATIFIED (koşullu) | **YES** |
| M-03 | 4045 | Para Alacağı - Örnek 4-5 | aday: `JudgmentExecutionType.MONEY_OR_SECURITY` | 4045 | Teminat Mektubu Alacağı | aday güçlü ama resmî etiket "Para Alacağı", domain değeri "Para **veya teminat** ilamı" — kapsam birebir değil | AUTHORITY_REQUIRED | NO |
| M-04 | 1307 | Belgesiz - Örnek 7 | aday yok | 1307 | Kambiyo (Poliçe) | "belgesiz" alacağı pozitif olarak ifade eden kanonik domain alanı yok | AUTHORITY_REQUIRED | NO |
| M-05 | 1407 | Sözleşme/Protokol - Örnek 7 | aday yok | 1407 | Kira Alacağı | sözleşme-alacağı ayrımı yok (bkz. R-02) | AUTHORITY_REQUIRED | NO |
| M-06 | 1107 / 2045 | Çocuk Teslimi | — | 1107 / 2045 | Kambiyo (Çek) / Sözleşme Alacağı | domain'de çocuk teslimi kavramı YOK | MODEL RESIDUAL R-03 | NO |
| M-07 | 1207 / 3045 | Tük. Hakem Heyeti | — | 1207 / 3045 | Kambiyo (Senet) / Kredi Alacağı | domain'de tüketici hakem heyeti kararı kavramı YOK | MODEL RESIDUAL R-04 | NO |
| M-08 | 1007 · 2007 · 3007 · 4007 · 5007 · 6007 · 7007 · 8008 | Telefon (Sabit/Cep) · İnternet/TV · Su · Elektrik · Doğal Gaz · Kredi Kartı · Kredi Sözleşmesi | — | aynı kodlar | Genel Haciz · İlamlı · Nafaka · Rehin · İpotek · Tahliye · Haciz+Tahliye · İflas | domain'de abonelik/hizmet-konusu taksonomisi YOK (`CaseSubCategory` 5 değerlidir) | MODEL RESIDUAL R-05 | NO |

```text
MAHIYETKODU: RATIFIED 2 · AUTHORITY_REQUIRED 3 · MODEL RESIDUAL 12
              (2 + 3 + 12 = 17)
```

### 4.3 Domain tarafı dispozisyonu

| Internal type | Disposition | Gerekçe |
| --- | --- | --- |
| `CaseSubCategory.NAFAKA` | RATIFIED (M-01/M-02) | tekil ve birebir konu eşleşmesi |
| `CaseSubCategory.GENEL` | AUTHORITY_REQUIRED | resmî 17 kod arasında "genel alacak" mahiyeti yok; `1307 Belgesiz` ile eşitlemek etiket tahminidir |
| `CaseSubCategory.KIRA` | UNSUPPORTED | resmî 17 kod arasında kira mahiyeti **YOK** |
| `CaseSubCategory.DOVIZ` | UNSUPPORTED | para birimi boyutu; mahiyet boyutu değil |
| `CaseSubCategory.CEZA` | UNSUPPORTED | resmî 17 kod arasında karşılık yok |

**Uygulanmayan yasak çıkarımlar:** legacy kod kopyalama · sayısal eşitlik varsayımı ·
etiket tahmini · magic default · çağıran-verilen resmî kod · `FATURA → 1045`.

## 5. `5045` — dış teknik soru

```text
5045 STATUS: EXTERNAL TECHNICAL AUTHORITY REQUIRED
```

Owner tarafından ratifiye **edilmez**, runtime'a **eklenmez**. `P04B-EXT-01` hattına
bağlanan exact soru:

```text
The official KodluBilgilerData.xml package lists mahiyetKodu 5045,
while the official exchange.dtd enumeration does not contain 5045.

Is mahiyetKodu 5045 accepted by the current production e-Takip exchange format?

If yes:
- Which DTD/XSD/schema version governs it?
- For which document or claim types is it valid?
- Is the published exchange.dtd outdated or incomplete?
```

Bu görev yalnız soruyu governance kaydına bağlar. **Dış gönderim yapılmadı.**

## 6. Canary-required subset

### 6.1 Senaryo korpusu — exact blocker

Repository'de **UYAP Canary R02 için kanonik senaryo korpusu bulunamadı.** `CANARY`
eşleşmeleri orchestration canary'sine (`CANARY-OFFICE-ORCHESTRATION`) aittir; UYAP
e-Takip senaryo tanımı yoktur.

```text
CANARY SCENARIO CORPUS: NOT CANONICALLY DEFINED — EXACT BLOCKER
```

Senaryo **uydurulmadı** ve mevcut çözülmüş verilere uydurmak için hiçbir senaryo
değiştirilmedi. Aşağıdaki tablo bu yüzden senaryo başına değil, **alan başına**dır.

### 6.2 Alan başına gereklilik

| Alan | Kanonik kaynak | Status |
| --- | --- | --- |
| `rolTur` | `DebtorRole` → P03A owner-ratified (22 / 33) | READY (4 domain rolü) |
| `takipTuru` | `Case.proceedingType` | READY **yalnız** T-01…T-04 için; T-05…T-11 AUTHORITY_REQUIRED |
| `alacakKalemi` wrapper | `CaseInstrument.instrumentType` · `proceedingType` | READY W-01…W-05 için; `kontrat`/`digerAlacak` AUTHORITY_REQUIRED; çakışma kuralı fail-closed |
| `mahiyetKodu` | `CaseSubCategory` + takipTuru | READY yalnız NAFAKA (M-01/M-02); kalan 15 kod AUTHORITY_REQUIRED / MODEL_RESIDUAL |
| legal basis source | `Case.proceedingType` + `judgmentExecutionType` | READY |
| `5045` | — | EXTERNAL_AUTHORITY_REQUIRED |
| strict DTD | — | BLOCKED BY D1 |

## 7. Implementation-eligible subset

Aşağıdaki **11 satır** kanıtı yeterli olduğu için implementasyona uygundur. Bu, bir
implementasyon yetkisi **değildir** — ayrı bir görev gerektirir.

```text
TAKIPTURU   T-01  GENERAL_EXECUTION            → 1
            T-02  CAMBIO                       → 1
            T-03  RENT (4 alt tür)             → 1
            T-04  JUDGMENT_ENFORCEMENT (5)     → 0

WRAPPER     W-01  InstrumentType.CEK           → cek
            W-02  InstrumentType.SENET         → senet
            W-03  InstrumentType.BONO          → senet
            W-04  InstrumentType.POLICE        → police
            W-05  JUDGMENT_ENFORCEMENT         → ilam

MAHIYET     M-01  NAFAKA + takipTuru 1         → 9009
            M-02  NAFAKA + takipTuru 0         → 1045
```

Her satır **koşulludur**: kaynak alan null ise UNRESOLVED, çakışma varsa fail-closed.

## 8. Exact model residuals

| ID | Residual | Etki |
| --- | --- | --- |
| R-01 | `config/uyap-mahiyet-kodlari.ts` orphan (0 importer) ve `subCategory` alanı `CaseSubCategory` ile örtüşmüyor; yorumdaki `takipTuru` değerleri yanlış | referans kanıt olarak kullanılabilir, authority olarak kullanılamaz |
| R-02 | Sözleşmeye dayalı alacağı ifade eden kanonik domain ayrımı YOK | `kontrat` sarmalayıcısı erişilemez |
| R-03 | Çocuk teslimi kavramı domain'de YOK | 1107 / 2045 erişilemez |
| R-04 | Tüketici hakem heyeti kararı kavramı domain'de YOK | 1207 / 3045 erişilemez |
| R-05 | Abonelik/hizmet-konusu taksonomisi domain'de YOK | 8 kod erişilemez |
| R-06 | UYAP Canary R02 senaryo korpusu kanonik olarak tanımlı değil | Canary readiness ölçülemez |
| R-07 | `InstrumentType` SENET/BONO ayrımı repo'da NEW FINDING / NOT AUTHORIZED | wrapper eşlemesini etkilemiyor (ikisi de `senet`) |

## 9. Statü

```text
DBP-P2-UYAP-CONTRACT-A-P02B-R2:  CLOSED / UNCHANGED  (PR #1436 · 0b09ebbd)
PR #1825:                        FOLLOW-UP TECHNICAL REMEDIATION (a0b45f0b)
RUNTIME IMPLEMENTATION:          NONE — bu görevde kod davranışı değişmedi
STRICT DTD VALIDATION:           OPEN / BLOCKED BY D1
5045:                            EXTERNAL TECHNICAL AUTHORITY REQUIRED
CANARY R02:                      NOT ELIGIBLE
FINAL CI:                        NOT YET ELIGIBLE
```
