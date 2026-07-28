# UYAP Official DTD and Codelist Conformance I01 v1.0

```text
Task              : UYAP-OFFICIAL-DTD-AND-CODELIST-CONFORMANCE-I01
Parent program    : UYAP-MODULE-FULL-GAP-CLOSURE-R02
Tür               : CONFORMANCE MEASUREMENT / CONTRACT BOUNDARY
Durum             : PARTIAL — ölçüm CLOSED, strict DTD validation BLOCKED (D1 grammar)
                    ⚠ §3 DÜZELTİLDİ — bkz. §0 (RECORD-CORRECTION-R01, 2026-07-28)
Tarih             : 2026-07-28
Kanıt tabanı      : canonical main `8f2fc5cd` (base `1119cbfa` ancestor)
Yetki             : Owner `GO-COMPLETE / ALREADY GRANTED`
Predecessor       : UYAP-LEGACY-POA-FLAG-DEPRECATION-I01 — CLOSED / CANONICAL
DTD SOURCE AUTHORITY : RESOLVED (owner addendum)
REAL TRANSPORT       : NOT AUTHORIZED
PRODUCTION ADAPTER   : NOT AUTHORIZED
PRODUCTION CUTOVER   : HARD HOLD
```

---

## 0. RECORD CORRECTION (UYAP-OFFICIAL-DTD-CONFORMANCE-RECORD-CORRECTION-R01, 2026-07-28)

> Bu bölüm sonradan eklenmiştir. **Aşağıdaki §3 metni SİLİNMEDİ** — tarihsel kayıt
> korunur; bu bölüm onu güncel repository/evidence gerçeğiyle uzlaştırır.

### 0.1 Maddi yanlış

§3, strict DTD doğrulamasının blocker'ını **`OFFICIAL_DTD_ARTEFACT_ABSENT`** olarak
kaydetti ve *"resmî `exchange.dtd` owner tarafından repository'ye pinlenmiş artefakt
olarak sağlanmalı — OWNER KARARI GEREKİR: EVET"* dedi.

**Bu yanlıştı.** Resmî byte artefaktı **2026-07-18'de owner tarafından zaten teslim
edilmişti**; yeni bir artefakt bu görevle **üretilmedi/indirilmedi**. Teslim yeri
repository DEĞİL, **repo-dışı canonical evidence bundle**'dır (Model B):

```text
PATH        : UYAP_OFFICIAL_PACKAGE_REVIEW\01_dtd_xsd\exchange.dtd
SHA-256     : 124a9a96848299d8abf216111572d7c8286777819422a5e29089b956f56a8fe6   (MATCH)
BYTE LENGTH : 9273
MANIFEST    : UYAP_OFFICIAL_PACKAGE_REVIEW\MANIFEST.md   (URL/tarih/boyut/SHA-256/extraction path)
CODELIST    : UYAP_OFFICIAL_PACKAGE_REVIEW\02_role_code_lists\KodluBilgilerData.xml
KAYNAK KAYIT: decision-log.md 2026-07-18 — DBP-P2-UYAP-PUBLIC-SOURCES-01-GOV
```

**Hatanın kökü:** *working-tree/repository sınırı* ile *canonical evidence sınırı*
eşitlendi. Ölçüm yalnız `git grep` ve `dtdFilePresentInRepository` alanına baktı;
`decision-log.md` ve repo-dışı evidence yüzeyi taranmadı.

### 0.2 Strict validation'ın GERÇEK blocker'ı

`decision-log.md` 2026-07-19 · `DBP-P2-UYAP-CONTRACT-A-P04B-VAL-R1-GOV` · owner kararı **D1**:

Resmî `exchange.dtd`'nin **6 element bildirimi NONDETERMINISTIC CONTENT MODEL** taşır
(XML 1.0 §3.2.1): `exchangeData` (kök), `taraf`, `kisiKurumBilgileri`, `kontratKefil`,
`VekilKisi`, `ilam`. `exchangeData`'nın kök ambiguity'si **tek başına** en minimal belgeyi
bile reddetmeye yeter — bu **artefaktın kendi özelliğidir**, serializer/harness kaynaklı
değildir. Gözlemlenen validator: libxml2/xmllint 2.13.9.

**D2** gereği tolerant validator · DTD onarımı/normalizasyonu · derived DTD commit
**NOT AUTHORIZED**. **D7**: UYAP/BİGM teknik yetki talebi = REQUIRED / NOT YET OBTAINED.

### 0.3 P02A uyumu

Model B, P02A'nın *"resmî `exchange.dtd` DOSYASI repository'ye EKLENMEZ; yalnız hash ile
köken beyanı"* kuralıyla **ÇELİŞMEZ**: dosya repository'de yok, canonical evidence'ta
pinli ve manifested. P02A'nın "eklenmez" kuralının **gerekçesi** hiçbir kayıtta yazılı
değildir → **UNSPECIFIED** (telif/redistribution/boyut/freshness/supply-chain hiçbiri
belgelenmemiş; tahmin edilmez).

### 0.4 Disposition

```text
PR #1775 ORIGINAL FINDING     : SUPERSEDED — EVIDENCE SCOPE INCOMPLETE
REPOSITORY CHANGE             : MERGED / TECHNICALLY VALIDATED
ARTEFACT-ABSENCE DISPOSITION  : RETRACTED
STRICT-CONFORMANCE DISPOSITION: OPEN / BLOCKED BY D1
MATERIALIZATION MODE          : B — ZATEN YÜRÜRLÜKTE (2026-07-18)
EXISTING AUTHORITY            : SUFFICIENT — NO NEW OWNER DECISION
```

PR #1775'in **teknik** katkısı (ölçüm modülü + 14 test + CI wiring) geçerlidir ve
geri alınmaz; geri çekilen yalnız **artefakt-yokluğu hükmü** ve ona bağlı owner-karar
talebidir.

### 0.5 Yerel `exchange.dtd` hash kayması

```text
PREVIOUS RECORDED : 5a3ea03c4f92e92949408cb98532132436a8028836030b86a2de422529e55a5f
CURRENT           : a7c2e2672603dd3375c15fb572cde4fbe24a7505d9039feead86326ba5827ae1
DISPOSITION       : EXPECTED_LOCAL_DERIVATIVE
```

`decision-log.md` 2026-07-18 kaydı `5a3ea03c…` yazdı. Aynı gün merge edilen **PR #1385**
(`DBP-P2-UYAP-CONTRACT-A-P01`, F4 — commit `e3c881b3`) dosyanın **yalnız başlık yorumunu**
değiştirdi: **6 ekleme / 3 silme**, hiçbir `<!ELEMENT`/`<!ATTLIST` bildirimi değişmedi.
Yanıltıcı *"UYAP e-Takip XML DTD / Kaynak: uyap.gov.tr / Versiyon: 2024.03"* etiketi
*"LOCAL / LEGACY CONTRACT — NOT THE OFFICIAL ... NOT PROVEN CONTRACT-COMPLIANT"*
uyarısıyla değiştirildi.

Yani kayma **intentional ve belgelidir**; governance kaydı containment merge edilmeden
**önceki** değeri yakalamıştır. Yetkisiz drift DEĞİLDİR. Dosya hiçbir runtime parser
tarafından okunmaz; `official-exchange-builder.ts` yalnız doctype `sysID` string'i olarak
adını taşır. Bu görevde repo dosyası resmî artefaktla **değiştirilmedi**.

---

## 1. Ölçülen soru

> "Repository'nin ürettiği UYAP XML'i resmî Contract A sözleşmesine uyuyor mu?"

Bu soru bugüne kadar üç ayrı yerde **prose** olarak duruyordu (provenance yorumları,
legacy DTD dosya başlığı, translator JSDoc'ları) ve her turda yeniden yorumlanıyordu.
Bu görev cevabı **veriye** çevirir ve makine-kontrollü hâle getirir.

---

## 2. CONFORMANCE MATRIX (ölçülen)

| # | Boyut | Durum | Kanıt |
|---|---|---|---|
| C-1 | Yerel `schemas/exchange.dtd` **resmî sözleşme dosyası mı?** | **DIVERGENT** | local `a7c2e267…` ≠ official pin `124a9a96…`; dosya kendi başlığında *"NOT THE OFFICIAL UYAP exchange.dtd / NOT PROVEN CONTRACT-COMPLIANT"* beyanını taşıyor |
| C-2 | **Strict DTD doğrulaması çalıştırılabilir mi?** | **UNMEASURABLE_ARTEFACT_ABSENT** | `dtdFilePresentInRepository=false`, `typeModelOfficiallyDtdValidated=false` (P02A bağlayıcı sınırı) |
| C-3 | Runtime `rolTur` kodları resmî sözlükte mi? | **DIVERGENT** | legacy `[1..10]` vs resmî `rolID 21-71` → **inRange = 0/10**, kesişim **∅** |
| C-4 | Resmî rol çözümleme kapsamı | **KISMİ** | 12 `DebtorRole` → **4 RESOLVED** (22/33) · **3 UNRESOLVED_AUTHORITY_REQUIRED** (LDO_OWNER, P03B) · **5 UNSUPPORTED_FOR_ROLTUR** (kambiyo sıfatları) |
| C-5 | Çözülen roller resmî aralıkta mı? | **CONFORMANT** | her `RESOLVED.rolID` ∈ [21,71]; sessiz BORÇLU fallback **yok** |
| C-6 | Runtime doğrulama kendini doğru etiketliyor mu? | **CONFORMANT** | `validationMode: 'LOCAL_STRUCTURAL_PRECHECK'`, `officialDtdValidated: false` |
| C-7 | Resmî serializer runtime'a bağlı mı? | **CONFORMANT (bağlı değil)** | `serializeOfficialExchange` / `resolveOfficialRole` üretim kodunda **hiç** çağrılmıyor |
| C-8 | Runtime'da DTD indirme var mı? | **CONFORMANT (yok)** | üretim kodunda `uyap.gov.tr` / `rayp.adalet.gov.tr` ağ çağrısı **yok** (owner addendum §8) |

### 2.1 En kritik ölçüm: C-3

Runtime'da erişilebilir tek XML üretim yolu (`UyapXmlService.generateFromCase`,
`uyap.controller.ts` üzerinden) `rolTur` değerlerini `UYAP_ROL_TURLERI` (kodlar **1-10**)
tablosundan alır. Resmî Contract A `rolTur` sözlüğü **21-71** aralığındadır.

```text
legacy  ∩ official = ∅      (inRange = 0/10)
```

Yani **runtime'da üretilen her `rolTur` değeri resmî sözlüğün dışındadır.** Bu, cutover
öncesinde kapatılması zorunlu bir uyum farkıdır ve bu görevle **ölçülmüş ve sabitlenmiştir**;
eşleme kararı owner authority'sidir (P03A/P03B) ve burada **verilmemiştir**.

---

## 3. EXACT BLOCKER — strict DTD validation

> ⚠ **SUPERSEDED — EVIDENCE SCOPE INCOMPLETE.** Bu bölümün blocker teşhisi
> (`OFFICIAL_DTD_ARTEFACT_ABSENT`) ve owner-karar talebi **§0.4 ile GERİ ÇEKİLMİŞTİR**.
> Artefakt 2026-07-18'de zaten teslim edilmişti; gerçek blocker **D1 nondeterministic
> content model**'dir. Metin tarihsel kayıt olarak SİLİNMEDEN korunur.

Owner addendum iki şey söylüyor:

```text
STRICT DTD VALIDATION : AUTHORIZED / REQUIRED / OPEN
Runtime'da internetten DTD indirilmesi YASAK; validation pinned ve LOCAL artefaktla yapılacaktır.
```

Repository'nin bağlayıcı sınırı ise (P02A, `official-contract-provenance.ts`):

```text
Resmî exchange.dtd DOSYASI repository'ye EKLENMEZ (yalnız hash ile köken beyanı).
dtdFilePresentInRepository = false
```

**Bu ikisi aynı anda sağlanamaz.** Strict DTD doğrulaması DTD *içeriğini* gerektirir;
repository'de yalnız SHA-256 *pin'i* vardır.

```text
BLOCKER:
OFFICIAL_DTD_ARTEFACT_ABSENT

GEREKEN:
Resmî `exchange.dtd` v1.2 (SHA-256 124a9a96848299d8abf216111572d7c8286777819422a5e29089b956f56a8fe6)
dosyasının owner tarafından repository'ye pinlenmiş artefakt olarak sağlanması
VEYA P02A "repository'ye eklenmez" sınırının owner tarafından revize edilmesi.

OWNER KARARI GEREKİR: EVET
```

### 3.1 Neden ajan bu artefaktı üretmedi

- Owner runtime indirmeyi yasakladı; build-time indirme de pinlenmiş artefakt üretmez,
  **kaynağı doğrulanmamış** bir dosya üretir.
- Resmî hukuki sözleşme dosyasını dışarıdan çekip repository'ye "resmî" etiketiyle koymak,
  **authority artefaktı üretmek** olurdu. Provenance modülü bu sınırı zaten yazılı olarak
  koyuyor (`provenanceVerified: true` ama `dtdFilePresentInRepository: false`).
- Hash pin'i mevcut olduğu için, owner artefaktı sağladığında **doğrulaması tek satırdır**
  ve bu görevin ölçüm yüzeyi (`measureStrictDtdValidationFeasibility`) o anda kendiliğinden
  `CONFORMANT`'a döner.

---

## 4. Bu görevde YAPILAN

`official-conformance-measurement.ts` (yeni, saf, runtime'a bağlı değil):

- `measureLocalDtdIdentity` — yerel DTD ≠ resmî pin
- `measureStrictDtdValidationFeasibility` — artefakt yokluğu **örtülmez**, açıkça raporlanır
- `measureRolTurCodelistOverlap` — legacy ∩ resmî aralık ölçümü
- `sha256OfFile` — deterministik hash

Modül **hiçbir resmî artefakt üretmez, indirmez, tahmin etmez** ve **hiçbir eşleme kararı vermez**.

---

## 5. TEST EVIDENCE

`official-dtd-codelist-conformance.spec.ts` — **14/14 PASS**

| Blok | Kapsam |
|---|---|
| DTD kimliği | hash uyuşmazlığı · dosyanın kendi "resmî değil" beyanı · yerel hash sabiti (sessiz içerik kayması CI'da kırmızı) |
| Strict doğrulama | artefakt yokluğu `UNMEASURABLE_ARTEFACT_ABSENT` · hiçbir yüzey "doğrulandı" iddia etmiyor · üretimde DTD indirme yok |
| Codelist | legacy kod kümesi tam `1..10` · `inRange=0/10` · kesişim ∅ |
| Rol kapsamı | 4/3/5 dağılımı · `RESOLVED` rolID'leri [21,71] içinde · sessiz fallback yok |
| Yüzey sınırı | resmî serializer runtime'a bağlı değil · runtime doğrulama doğru etiketli |

### Regresyon (gerçek `postgres:16-alpine`)

| Kapsam | Sonuç |
|---|---|
| `src/modules/uyap` | **765 PASS / 43 suite** |
| `src/modules/policy-engine` | **380 PASS / 21 suite** |
| `tsc -p tsconfig.prod.json` | EXIT 0 |
| `pnpm build` | EXIT 0 |

### Blocking CI

Spec `ci-manifests/pure/uyap-icrabot-tebligat.txt` içine cerrahi eklendi — **yeni ci.yml
step'i açılmadı**. Manifest runner **çalıştırılarak** doğrulandı:

```text
bash apps/api/scripts/run-ci-manifest.sh pure/uyap-icrabot-tebligat
→ PASS src/modules/uyap/official/__tests__/official-dtd-codelist-conformance.spec.ts
→ Test Suites: 57 passed / Tests: 949 passed
```

---

## 6. CANARY ÖNCESİ SONUÇ

Owner addendum: *"Canary XML üretiyorsa bu task canary'den ÖNCE tamamlanacaktır."*

```text
CONFORMANCE MEASUREMENT : CLOSED (matris sabitlendi, CI'da koşuyor)
STRICT DTD VALIDATION   : BLOCKED — OFFICIAL_DTD_ARTEFACT_ABSENT      ← SUPERSEDED (§0.4)
CODELIST CONFORMANCE    : ÖLÇÜLDÜ / DIVERGENT (legacy ∩ resmî = ∅)
CANARY XML EMISSION     : HAZIR DEĞİL
```

> ⚠ **DÜZELTİLMİŞ SONUÇ (§0):**
> ```text
> STRICT DTD VALIDATION : BLOCKED — NONDETERMINISTIC_CONTENT_MODEL (owner D1)
> OFFICIAL BYTE ARTEFACT: FOUND / VERIFIED (Model B, 2026-07-18)
> OWNER DECISION        : NONE (materialization için)
> ```

Canary'nin resmî-şekilli XML üretmesi için `rolTur` eşleme kararı (P03B + legacy→resmî
geçiş) ve strict conformance verdict'i gerekir. Artefakt teslimi **gerekli değildir** —
zaten mevcuttur; strict verdict **D7 dış teknik yetki cevabına** bağlıdır.

---

## 7. RESIDUALS

| # | Bulgu | Devir |
|---|---|---|
| D-1 | ~~Resmî DTD artefaktı yok → strict validation yapılamıyor~~ **SUPERSEDED (§0.4)** — artefakt MEVCUT; strict validation D1 nondeterministic content model ile bloklu | **P04B-EXT-01** (D7 dış teknik yetki talebi) — owner kararı GEREKMEZ |
| D-2 | Legacy `rolTur` 1-10 ↔ resmî 21-71 eşlemesi | **P03B / OWNER AUTHORITY** |
| D-3 | LDO_OWNER 3 rolü (miras/tasfiye/iflas) hedef değeri | **P03B** |
| D-4 | Kambiyo 5 sıfatı resmî `rolTur` sözlüğünde yok — enstrüman modeli | **P02B/P04** |
| D-5 | `mahiyetKodu` / `takipTuru` / `birimKodu` codelist'leri DTD'de `CDATA` — resmî kod paketi olmadan ölçülemez | **D-1 ile birlikte** |
