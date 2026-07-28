# UYAP Official DTD and Codelist Conformance I01 v1.0

```text
Task              : UYAP-OFFICIAL-DTD-AND-CODELIST-CONFORMANCE-I01
Parent program    : UYAP-MODULE-FULL-GAP-CLOSURE-R02
Tür               : CONFORMANCE MEASUREMENT / CONTRACT BOUNDARY
Durum             : PARTIAL — ölçüm CLOSED, strict DTD validation BLOCKED (artefakt yok)
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
STRICT DTD VALIDATION   : BLOCKED — OFFICIAL_DTD_ARTEFACT_ABSENT
CODELIST CONFORMANCE    : ÖLÇÜLDÜ / DIVERGENT (legacy ∩ resmî = ∅)
CANARY XML EMISSION     : HAZIR DEĞİL
```

Canary'nin resmî-şekilli XML üretmesi için hem DTD artefaktı hem de `rolTur` eşleme
kararı (P03B + legacy→resmî geçiş) gerekir. İkisi de **owner kararına bağlıdır**.

---

## 7. RESIDUALS

| # | Bulgu | Devir |
|---|---|---|
| D-1 | Resmî DTD artefaktı yok → strict validation yapılamıyor | **OWNER KARARI** (bu belgenin §3'ü) |
| D-2 | Legacy `rolTur` 1-10 ↔ resmî 21-71 eşlemesi | **P03B / OWNER AUTHORITY** |
| D-3 | LDO_OWNER 3 rolü (miras/tasfiye/iflas) hedef değeri | **P03B** |
| D-4 | Kambiyo 5 sıfatı resmî `rolTur` sözlüğünde yok — enstrüman modeli | **P02B/P04** |
| D-5 | `mahiyetKodu` / `takipTuru` / `birimKodu` codelist'leri DTD'de `CDATA` — resmî kod paketi olmadan ölçülemez | **D-1 ile birlikte** |
