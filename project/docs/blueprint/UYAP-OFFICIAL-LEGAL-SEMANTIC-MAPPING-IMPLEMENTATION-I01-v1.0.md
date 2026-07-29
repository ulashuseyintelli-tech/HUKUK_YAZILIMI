# UYAP-OFFICIAL-LEGAL-SEMANTIC-MAPPING-IMPLEMENTATION-I01 — v1.0

| Alan | Değer |
| --- | --- |
| Canonical task | `UYAP-OFFICIAL-LEGAL-SEMANTIC-MAPPING-IMPLEMENTATION-I01` |
| Program | `UYAP-MODULE-FULL-GAP-CLOSURE-R02` |
| Mode | ONLY THE 11 OWNER-APPROVED ROWS AND THEIR BINDING CONDITIONS |
| Owner ratifikasyonu | `UYAP-OFFICIAL-LEGAL-SEMANTIC-MAPPING-OWNER-RATIFICATION-R01` (chat, 2026-07-29) — 11/11 APPROVE (8 koşulsuz, 3 koşullu) |
| Canary senaryo sözleşmesi (öncül) | PR #1844, `20c2a8a0` |
| Owner ratifikasyon çıktısı (öncül) | PR #1838, `1f14de95` |
| Tarih | 2026-07-29 |

## 0. Kapsam sınırı (bağlayıcı)

`SERIALIZER IMPLEMENTATION`'ın **XML EMİSYON YAPISI** kapsam dışıdır: `alacakKalemi`
ELEMENT emisyonu bu görevde YAPILMADI — `official-exchange-builder.ts` P02B-R2'nin
fail-closed reddini (`UNAUTHORIZED_ALACAK_KALEMI_PARENT`) aynen korur. Yalnız
**anlam çözümleyicileri** (pure function) implemente edildi. `5045` KULLANILMADI.
Strict DTD PASS iddia EDİLMEDİ. Transport/adapter/cutover/Canary execution YOK.

## 1. Owner disposition (girdi)

```text
OWNER APPROVED: 11   OWNER REJECTED: 0   OWNER HELD: 0
UNCONDITIONAL:   8   CONSTRAINED:     3  (W-02, M-01, M-02)
```

## 2. Implemente edilen 10 satır + 1 MODEL_RESIDUAL

### 2.1 `takipTuru` (T-01…T-04) — `resolveOfficialTakipTuru`

| Satır | Domain | Resmî | Koşul | Kod karşılığı |
| --- | --- | --- | --- | --- |
| T-01 | `proceedingType=GENERAL_EXECUTION` | `1` İlamsız | koşulsuz | switch case, RESOLVED |
| T-02 | `proceedingType=CAMBIO` | `1` İlamsız | koşulsuz | switch case, RESOLVED |
| T-03 | `proceedingType=RENT` | `1` İlamsız | yalnız ilamsız kira/tahliye | **yapı gereği sağlanır** — `Case.proceedingType` tekil nullable alan; `RENT` ve `JUDGMENT_ENFORCEMENT` aynı anda taşınamaz (IG-T-03/04 guard testi şemadan doğrular) |
| T-04 | `proceedingType=JUDGMENT_ENFORCEMENT` | `0` İlamlı | yalnız gerçek ilam-dayalı sınıflandırma, salt belge varlığı yeterli değil | girdi bilinçli olarak `proceedingType`'dır (`ProceedingClassificationService`'in ürettiği canonical alan, "belge var mı" bayrağı DEĞİL) |

T-05…T-10 (`PLEDGE`/`MORTGAGE`/`EVICTION`/`BANKRUPTCY`/`PUBLIC_RECEIVABLE`) ve T-11
(`null`) owner tablosuna hiç girmedi → `AUTHORITY_REQUIRED`.

### 2.2 `alacakKalemi` wrapper (W-01…W-05) — `resolveOfficialAlacakKalemiWrapper`

| Satır | Domain | Wrapper | Koşul | Kod karşılığı |
| --- | --- | --- | --- | --- |
| W-01 | `InstrumentType.CEK` | `cek` | koşulsuz | switch case |
| W-02 | `InstrumentType.SENET` | `senet` | yalnız bono/emre muharrer senet anlamı | **yapı gereği sağlanır + kilitli** — enum'da genel "yazılı borç ikrarı" değeri YOK (4 değer: CEK/SENET/BONO/POLICE); IG-W-02 guard testi bunu şema enumerasyonundan doğrular |
| W-03 | `InstrumentType.BONO` | `senet` | koşulsuz | switch case (SENET ile aynı sarmalayıcı — internal enum ayrımı korunur, XML seviyesinde birleşir) |
| W-04 | `InstrumentType.POLICE` | `police` | koşulsuz | switch case |
| W-05 | `proceedingType=JUDGMENT_ENFORCEMENT` | `ilam` | ilam nesnesi canonical modelde mevcut OLMALI + kalem bu ilamla açık ilişkilendirilmeli | üç bağımsız sinyal: `proceedingType` (yapısal) + `caseHasJudgmentRecord` (`CaseJudgment` kaydı var) + `sourceDocumentType='ILAM'` (kalem seviyesinde açık ilişkilendirme) — üçü de zorunlu |

Çelişki guard'ı (§3.1, Canary scenario contract CS-13): bir kalemde hem
`instrumentType` hem `sourceDocumentType='ILAM'` aynı anda varsa → `AMBIGUOUS`,
sarmalayıcı SEÇİLMEZ.

W-06 (`kontrat`)/W-07 (`digerAlacak`) owner tablosuna hiç girmedi.

**Kapsam sınırı:** bu resolver yalnız wrapper ADINI döner; `alacakKalemi` element
emisyonu builder'da HÂLÂ YASAK.

### 2.3 `mahiyetKodu` (M-02) — `resolveOfficialMahiyetKodu`

| Satır | Domain | Resmî | Durum |
| --- | --- | --- | --- |
| M-02 | `CaseSubCategory.NAFAKA` + ilamlı + `CaseJudgment.nafakaType` dolu | `1045` | **IMPLEMENTED** |
| M-01 | `CaseSubCategory.NAFAKA` + ilamsız | `9009` | **MODEL_RESIDUAL** |

M-02'nin 5 owner koşulu:

1. Alacak gerçekten nafaka → `caseSubCategory === 'NAFAKA'`
2. Canonical procedure ilamlı → `takipTuru.kind === 'RESOLVED' && code === '0'` (T-04'ten)
3. Geçerli ilam canonical modelde bulunmalı → `CaseJudgment` kaydı
4. Nafaka bu ilamla açık ilişkilendirilmeli → `CaseJudgment.nafakaType` (Case.subCategory'den TAMAMEN AYRI bir model/enum, konu-özel doldurulmuş alan — "CaseSubCategory adı dışında canonical legal basis" şartı budur)
5. Legacy `FATURA=1045` authority değil → kaynak kodda legacy literal/tablo YOK (IG-M-02 kosul 5 guard'ı grep ile doğrular)

**M-01 neden MODEL_RESIDUAL:** owner koşulu 3 ("CaseSubCategory adı dışında canonical
legal basis") ilamsız kolda karşılanamadı. `CaseJudgment` yoktur (ilamsız = ilam yok
zaten). Aday ikinci alan bulundu — `Due.type = NAFAKA` (`DueType` enum, `Due` modeli)
— ayrı bir model, ayrı bir enum, `CaseSubCategory`'den bağımsız. ANCAK bu alanın
`ClaimItem`/`Due` iki paralel model arasında hangisinin "canonical" sayılacağına dair
bir governance kaydı YOK; iki model de production-reachable. Tahmin edip birini
seçmek yerine (owner'ın kendi talimatı: "gerekli discriminator bulunamazsa
tahmin/schema değişikliği yapılmayacak") satır `MODEL_RESIDUAL` bırakıldı.

## 3. Yeni bulgular (bu görevde çözülmedi, kayda geçti)

### 3.1 Serializer bypass sınırı (NEW FINDING)

`official-canonical-serializer.ts`, kendisine verilen `RESOLVED` değerinin gerçekten
`resolveOfficialTakipTuru`/`resolveOfficialMahiyetKodu` üzerinden mi geldiğini yoksa
çağıran tarafından elle mi kurulduğunu **ayırt edemez** (P02B-R2'den miras kalan
sözleşme: girdi "önceden-resolved"tir). Sözdizim doğrulaması geçersiz kodu engeller
ama semantik-bypass'i engellemez. Bu sınır resolver-çağrısını ZORUNLU kılan ayrı bir
sertleştirme görevi gerektirir; bu görevin kapsamı dışındadır.

### 3.2 `Due` / `ClaimItem` paralel model belirsizliği (M-01'in kök nedeni)

`Due.type=NAFAKA` (`DueType` enum) ile `ClaimItem` arasında hangisinin nafaka
mahiyeti için canonical kaynak olduğu belirlenmemiş. Bu, gelecekteki bir M-01
ratifikasyon turu için ayrı bir governance/owner kararı gerektirir.

## 4. Değişiklikler

| Dosya | Değişiklik |
| --- | --- |
| `official-codelist-registry.ts` | `resolveOfficialTakipTuru`/`resolveOfficialMahiyetKodu` imzası `string` → tipli girdi (`ProceedingType`/`CaseSubCategory`/`CaseJudgment.nafakaType`); `RATIFIED_*` sabit tabloları KALDIRILDI, exhaustive-switch çözümleyicilerle DEĞİŞTİRİLDİ; yeni `resolveOfficialAlacakKalemiWrapper`; `OfficialCodeResolution`'a `MODEL_RESIDUAL` eklendi; 3 yeni fail-closed reason |
| `official-canonical-serializer.ts` | `checkCodeResolution` `MODEL_RESIDUAL`'ı ele alır; `officialCodeSemanticMapping` artık dinamik (`AUTHORITY_REQUIRED` \| `PARTIALLY_RATIFIED`) |
| `__tests__/official-legal-semantic-mapping-implementation.spec.ts` **(YENİ)** | IG-T-01…11 · IG-W-01…07 · IG-M-01…02 · IG-XA-01…07, **31 test** |
| 3 mevcut spec dosyası | Eski `string`-imzalı çağrılar tipli girdiye taşındı; MS-01/MS-02/TS-04b/CE-02/CE-06/CE-07/GA-06/GA-10 konuları KORUNARAK owner-onaysız gerçek değerlerle (CEZA/KIRA/PLEDGE) yeniden doğrulandı |
| `ci-manifests/pure/uyap-icrabot-tebligat.txt` | Cerrahi ekleme; yeni ci.yml adımı açılmadı |

Legacy canlı serializer'lar: **UNCHANGED**. `alacakKalemi` element emisyonu:
**NOT IMPLEMENTED** (bilinçli kapsam dışı).

## 5. Test ve CI kanıtı

| Kapsam | Sonuç |
| --- | --- |
| `official-legal-semantic-mapping-implementation.spec.ts` | **31/31 PASS** |
| `modules/uyap/official/**` (12 suite) | **281/281 PASS** |
| `modules/uyap/**` | **879 PASS**, 3 skip; 5 suite `db-gated.integration` (DB yok → `db` manifesti) |
| `tsc -p tsconfig.prod.json --noEmit` | **EXIT 0** |
| `run-ci-manifest.sh pure/uyap-icrabot-tebligat` | **65 suite / 1163 test PASS** |

## 6. Final hüküm

```text
TAKIPTURU IMPLEMENTED:      4   (T-01..T-04)
ALACAKKALEMI IMPLEMENTED:   5   (W-01..W-05, yalnız ADI — emisyon YOK)
MAHIYETKODU IMPLEMENTED:    1   (M-02)
MAHIYETKODU MODEL_RESIDUAL: 1   (M-01)
5045:                       KULLANILMADI
RUNTIME WIRING:             YOK (official/ hâlâ dormant; UyapModule'e bağlı değil)
STRICT DTD:                 OPEN / BLOCKED BY D1
CANARY R02:                 NOT ELIGIBLE
FINAL CI:                   NOT PART OF THIS TASK
```

## 7. Sıradaki

Bu görev implementation gate'in HER İKİ ayağını da kapattı (owner-ratified satırlar +
Canary senaryo sözleşmesi), ancak bu resolver'ların GERÇEK gönderim yoluna
BAĞLANMASI (runtime wiring), M-01'in `Due`/`ClaimItem` belirsizliğinin çözümü,
serializer bypass sınırının sertleştirilmesi ve `alacakKalemi` element emisyonunun
implementasyonu ayrı, bounded görevler gerektirir. Hiçbiri bu kayıtla otomatik
başlamaz.
