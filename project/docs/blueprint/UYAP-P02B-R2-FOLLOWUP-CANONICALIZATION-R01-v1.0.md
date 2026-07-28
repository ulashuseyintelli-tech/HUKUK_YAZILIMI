# UYAP-P02B-R2-FOLLOWUP-CANONICALIZATION-R01 — ardıl teknik remediation kaydı — v1.0

| Alan | Değer |
| --- | --- |
| Canonical task | `UYAP-P02B-R2-FOLLOWUP-CANONICALIZATION-R01` |
| Program | `UYAP-MODULE-FULL-GAP-CLOSURE-R02` |
| Bu kaydın konusu | **PR #1825**, merge `a0b45f0b218f5e731c0d27f007b24a83da6340f4` |
| Owner disposition | **ACCEPTED AS FOLLOW-UP TECHNICAL REMEDIATION / MERGED / VALIDATED** |
| Öncül (dokunulmadı) | `DBP-P2-UYAP-CONTRACT-A-P02B-R2` — **CLOSED / CANONICAL / DO NOT REOPEN**, PR #1436 `0b09ebbd` |
| Öncül | `UYAP-OFFICIAL-CODELIST-EMISSION-I01B-1` — CLOSED/CANONICAL, PR #1810, `55b30f2f` |
| Tarih | 2026-07-28 |

## 0.0 Kapanış kimliği — düzeltme

Bu belgenin önceki sürümü kendisini `DBP-P2-UYAP-CONTRACT-A-P02B-R2` başlığı altında
kaydediyordu. **Bu yanlıştı ve owner tarafından düzeltilmiştir.**

```text
DBP-P2-UYAP-CONTRACT-A-P02B-R2 : CLOSED / CANONICAL / DO NOT REOPEN
                                 PR #1436 · 0b09ebbd
                                 claim-wrapper authority guard (owner Option 1)

PR #1825                       : FOLLOW-UP TECHNICAL REMEDIATION
                                 merge a0b45f0b
                                 P02B-R2'nin İKİNCİ KAPANIŞI DEĞİLDİR
```

PR #1825, kapanmış P02B-R2 kararının **üstüne** gelen ardıl teknik iyileştirmedir:
guard'ın dayandığı resmî içerik modelini ölçülmüş sabite bağlar, kodlu alan anlam
sınırını sıkılaştırır. P02B-R2'nin kapsamını, kararını veya statüsünü **değiştirmez**
ve yeniden **açmaz**.

## 0. Kapsam sınırı

`REAL TRANSPORT` · `PRODUCTION ADAPTER` · `CUTOVER` · `CANARY EXECUTION` ·
`SCHEMA/MIGRATION` · `LEGACY LIVE SERIALIZER CUTOVER` · `DTD REPAIR` ·
`TOLERANT VALIDATOR` · `DERIVED DTD` · `STRICT DTD PASS VERDICT` ·
`NEW LEGAL SEMANTIC INVENTION` — hiçbiri yapılmadı.

## 1. Resmî artefakt ölçümü (authority)

`exchange.dtd`, SHA `124a9a96848299d8abf216111572d7c8286777819422a5e29089b956f56a8fe6`, 9273 B — **MATCH**.

```text
<!ELEMENT dosya (cek | senet | taraf | VekilKisi | police | kontratKefil
                 | digerAlacak | evrak | ref | ilam)* >
<!ATTLIST dosya
    dosyaTipi    CDATA #REQUIRED
    takipTuru    (0 | 1) "1"
    takipYolu    (0 | 1 | 2 | 3 | 4 | 5) #IMPLIED
    takipSekli   (0 | 1 | 2 | 3 | 4 | 5 | 6) #IMPLIED
    mahiyetKodu  (1007 | 1107 | … | 4045) #IMPLIED >
```

Üç ölçüm sonucu:

1. **`alacakKalemi`, `dosya`'nın doğrudan çocuğu DEĞİLDİR.** Yetkili ebeveynler:
   `cek`, `senet`, `police`, `kontrat`, `digerAlacak`, `ilam`. Önceki P02B-R2 kararının
   dayandığı önerme **doğrulandı**.
2. **`takipTuru` VARSAYILANLIDIR** — `(0 | 1) "1"`. Attribute yoksa ayrıştırıcı `1`
   (İlamsız) uygular; yani ihmal nötr değil, **örtük hukuki iddiadır**.
3. **`mahiyetKodu` enumerasyonu 17 değer taşır** — `5045` **YOKTUR**.

### 1.1 İki resmî artefakt aynı fikirde değil

| Kaynak | mahiyetKodu | `5045` |
| --- | --- | --- |
| `KodluBilgilerData.xml` (`f9592571…`) | 18 | **VAR** (`Arabulucuk - Örnek 4-5`) |
| `exchange.dtd` (`124a9a96…`) ATTLIST | 17 | **YOK** |

Fail-closed cevap: emit edilebilir küme = **kesişim (17)**. `5045` artık ayrı reason
ile reddedilir: `OFFICIAL_MAHIYET_DTD_UNREPRESENTABLE`. Bu, I01B-1'de fark edilmemiş
bir **fazla-müsamaha boşluğuydu**.

### 1.2 REPOSITORY LOCAL DTD DERIVATIVE resmî artefaktla ÇELİŞİYOR

```text
resmî   :  <!ELEMENT dosya (cek | senet | taraf | … | ilam)* >        → alacakKalemi YOK
yerel   :  <!ELEMENT dosya (taraf+, …, ilam?, alacakKalemi+)>         → alacakKalemi ZORUNLU
```

Legacy `uyap-xml.service.ts` **yerel türeve** göre yazılmıştır; bu, legacy'nin
`dosya/alacakKalemi` üretmesinin kök nedenidir. Resmî artefakt authority'dir; yerel
türev değildir. Yerel türev bu turda **değiştirilmedi** (DTD onarımı yasak).

## 2. Kodlu alan ANLAM ledger'ı

### 2.1 `mahiyetKodu` — 17/17 kod semantik olarak ÇAKIŞIYOR

| Kod | Resmî anlam | Legacy anlam | Sonuç |
| --- | --- | --- | --- |
| 1007 | Telefon (Sabit) - Örnek 7 | Genel Haciz Yoluyla Takip | DIVERGENT |
| 1107 | Çocuk Teslimi - Örnek 7 | Kambiyo (Çek) | DIVERGENT |
| 1207 | Tük. Hakem Heyeti - Örnek 7 | Kambiyo (Senet) | DIVERGENT |
| 1307 | Belgesiz - Örnek 7 | Kambiyo (Poliçe) | DIVERGENT |
| 1407 | Sözleşme/Protokol - Örnek 7 | Kira Alacağı | DIVERGENT |
| 2007 | Telefon (Cep) - Örnek 7 | İlamlı Takip | DIVERGENT |
| 3007 | İnternet/Tv - Örnek 7 | **Nafaka** | DIVERGENT |
| 4007 | Su - Örnek 7 | Rehnin Paraya Çevrilmesi | DIVERGENT |
| 5007 | Elektrik - Örnek 7 | İpoteğin Paraya Çevrilmesi | DIVERGENT |
| 6007 | Doğal Gaz - Örnek 7 | Tahliye | DIVERGENT |
| 7007 | Kredi Kartı - Örnek 7 | Haciz ve Tahliye | DIVERGENT |
| 8008 | Kredi Sözleşmesi - Örnek 7 | İflas | DIVERGENT |
| 9009 | **Nafaka** - Örnek 7 | Diğer Takip | DIVERGENT |
| 1045 | **Nafaka** - Örnek 4-5 | **Fatura Alacağı** | DIVERGENT |
| 2045 | Çocuk Teslimi - Örnek 4-5 | Sözleşme Alacağı | DIVERGENT |
| 3045 | Tük. Hakem Heyeti - Örnek 4-5 | Kredi Alacağı | DIVERGENT |
| 4045 | Para Alacağı - Örnek 4-5 | Teminat Mektubu Alacağı | DIVERGENT |

**Paylaşılan 17 kodun 17'si de farklı hukuki anlam taşıyor.** Owner'ın uyardığı
"invoice → nafaka" senaryosu varsayımsal değil: legacy `FATURA = 1045`, resmî
`1045 = Nafaka`.

Sonuç: **ratifiye edilebilir tek bir domain → resmî `mahiyetKodu` eşlemesi repository
kanıtıyla türetilemez.** `RATIFIED_MAHIYET_BY_DOMAIN` bilinçli olarak **BOŞ**;
`resolveOfficialMahiyetKodu()` her domain türü için `AUTHORITY_REQUIRED` döner.

### 2.2 `takipTuru` — ayrı kod sistemleri

| | Resmî | Legacy |
| --- | --- | --- |
| Kod uzayı | `0` \| `1` | `'1'`…`'6'` |
| İlamlı | **0** | **2** |
| İlamsız | **1** | **1** |
| Kambiyo / Rehin / İpotek / İflas | karşılık YOK | 3 / 4 / 5 / 6 |

Legacy `1` ile resmî `1` **tesadüfen** aynı anlama gelir; legacy `2` ile resmî `1`
gelmez. Sayısal eşitlik anlam eşitliği değildir → `RATIFIED_TAKIP_TURU_BY_DOMAIN`
de **BOŞ**. Legacy `3..6`, resmî `takipYolu`/`takipSekli`/`dosyaTipi` alanlarına daha
yakındır; bu turda eşleme YAPILMADI.

## 3. Uygulanan değişiklikler (bounded)

| Dosya | Değişiklik |
| --- | --- |
| `official-codelist-registry.ts` | `OFFICIAL_CODELIST_MAHIYET_KODU_SET` (18) + `OFFICIAL_DTD_MAHIYET_KODU_SET` (17) + kesişim (17); `OFFICIAL_ALACAK_KALEMI_PARENTS` (DTD'den ölçülmüş 6 ebeveyn); `OfficialCodeResolution` (`RESOLVED` \| `AUTHORITY_REQUIRED` \| `NOT_ASSERTED`); `resolveOfficialMahiyetKodu` / `resolveOfficialTakipTuru`; 4 yeni fail-closed reason. |
| `official-exchange.types.ts` | `OfficialDosya` ham `mahiyetKodu`/`takipTuru` **string alanlarını KAYBETTİ**; yerine `takipTuruResolution` (**zorunlu**) ve `mahiyetResolution` geldi. `claimShapeViolations` artık `authorizedParents` taşır. |
| `official-exchange-builder.ts` | `emittableCode()` — yalnız `RESOLVED` attribute üretir; guard raporu resmî ebeveyn listesini taşır. |
| `official-canonical-serializer.ts` | `checkCodeResolution()` — ANLAM yetkisi ve SÖZDİZİM ayrı eksenler; evidence'a `takipTuruDtdDefaultApplies` ve `officialCodeSemanticMapping: 'AUTHORITY_REQUIRED'`. |
| `__tests__/official-structural-semantic-p02b-r2.spec.ts` **(YENİ)** | XS-01…04 · MS-01…05 · TS-01…05 · CE-01…07 · XA-01…08 — **30 test**. |
| `ci-manifests/pure/uyap-icrabot-tebligat.txt` | Cerrahi ekleme; yeni ci.yml adımı **açılmadı**. |

Legacy canlı serializer'lar: **UNCHANGED / ALLOWLISTED / NOT OFFICIALLY CONFORMANT**.

### 3.1 Uyarlanan mevcut testler (konu değişmedi)

- `claimShapeViolations` iki `toEqual` beklentisi `authorizedParents` alanıyla genişletildi.
- `otomatik <digerAlacak> üretilmez`: çıplak kelime yerine `<digerAlacak` **elementi**
  aranıyor (kardeş `<ilam` testiyle aynı biçim). Rapor alanı yetkili aday ADLARINI
  taşır — bu bildirimdir, emisyon değil. İddianın konusu aynı kaldı.
- Fixture'lar ham koddan `OfficialCodeResolution`'a taşındı.

## 4. Canary-required subset

| Alan | Disposition |
| --- | --- |
| `rolTur` | **READY** (2 rolID / 4 domain rolü; I01B-1) |
| `mahiyetKodu` | **AUTHORITY_REQUIRED** — 0 ratifiye eşleme |
| `takipTuru` | **AUTHORITY_REQUIRED** — 0 ratifiye eşleme |
| `alacakKalemi` | **STRUCTURALLY BLOCKED** — sarmalayıcı seçimi hukuki sınıflandırmadır |
| `dosyaTipi` | FAIL-CLOSED BUT NOT READY (eşleme kapsam dışı bırakıldı) |
| strict DTD | **D1-ONLY BLOCKED** |

Subset sonradan daraltılmadı: bunlar resmî `ATTLIST dosya` ve içerik modelinin
zorunlu/varsayılanlı alanlarıdır.

## 5. Test ve CI kanıtı

| Kapsam | Sonuç |
| --- | --- |
| `official-structural-semantic-p02b-r2.spec.ts` | **30/30 PASS** |
| `modules/uyap/official/**` (10 suite) | **232/232 PASS** |
| `modules/uyap/**` | **830 PASS**, 3 skip; 5 suite `db-gated.integration` (DB yok → `db` manifesti) |
| `tsc -p tsconfig.prod.json --noEmit` | **EXIT 0** |
| `run-ci-manifest.sh pure/uyap-icrabot-tebligat` | **63 suite / 1100 test PASS** |

## 6. Final hüküm

```text
DBP-P2-UYAP-CONTRACT-A-P02B-R2:      CLOSED / CANONICAL / DO NOT REOPEN
                                     PR #1436 · 0b09ebbd — bu kayıt değiştirmez

PR #1825 (bu kayıt):                 FOLLOW-UP TECHNICAL REMEDIATION
                                     MERGED / VALIDATED · a0b45f0b

STRUCTURAL CONTAINMENT:              CLOSED
                                     alacakKalemi fail-closed; yetkili ebeveynler
                                     resmî DTD'den ölçülmüş sabit; sarmalayıcı SEÇİLMEZ

LEGAL SEMANTIC MAPPINGS:             OPEN
                                     domain → mahiyetKodu · domain → takipTuru ·
                                     domain → alacakKalemi wrapper

5045 DISPOSITION:                    EXTERNAL TECHNICAL AUTHORITY REQUIRED
                                     owner kararı DEĞİL

STRICT DTD VALIDATION:               OPEN / BLOCKED BY D1
LIVE LEGACY CUTOVER:                 NOT PERFORMED
CANARY R02:                          NOT ELIGIBLE
FINAL CI:                            NOT YET ELIGIBLE
```

## 7. Açık kalemlerin yönlendirmesi

### 7.1 Owner authority — `UYAP-OFFICIAL-LEGAL-SEMANTIC-MAPPING-AUTHORITY-R01`

| # | Matris | Neden repository'den türetilemez |
| --- | --- | --- |
| 1 | iç claim türü → resmî `mahiyetKodu` | paylaşılan 17 kodun 17'si legacy'de farklı hukuki anlam taşıyor (legacy `FATURA=1045`, resmî `1045=Nafaka`) |
| 2 | canonical takip prosedürü → `takipTuru` `0`/`1` | resmî `(0\|1)` ile legacy `'1'..'6'` ayrı kod sistemleri; İlamlı resmî `0`, legacy `2` |
| 3 | canonical hukuki belge türü → `alacakKalemi` sarmalayıcı | `cek`/`senet`/`police`/`kontrat`/`digerAlacak`/`ilam` seçimi hukuki nitelemedir, belge adı sezgisi değildir |

### 7.2 Dış teknik authority — `5045`

```text
5045 : KodluBilgilerData.xml         → VAR  (Arabulucuk - Örnek 4-5)
       exchange.dtd ATTLIST dosya    → YOK
```

İki resmî artefakt çelişiyor. Bu bir **owner hukuki kararı değildir**; hangi artefaktın
o alan için authority olduğu **UYAP/BİGM veya yetkili entegratöre sorulacak teknik
sorudur** — `P04B-EXT-01` hattıyla aynı sınıf. Bu kayıtla çözülmüş sayılmaz; kod
tarafında `OFFICIAL_MAHIYET_DTD_UNREPRESENTABLE` ile fail-closed kalır.

Bu kalemler tayin edilene kadar ilgili yüzeyler fail-closed kalır; hiçbir varsayılan,
"en yakın kod", etiket tahmini, belge-adı sezgisi veya legacy passthrough uygulanmaz.
