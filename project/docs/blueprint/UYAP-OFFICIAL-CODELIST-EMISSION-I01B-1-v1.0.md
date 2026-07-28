# UYAP-OFFICIAL-CODELIST-EMISSION-I01B-1 — v1.0

| Alan | Değer |
| --- | --- |
| Görev kimliği | `UYAP-OFFICIAL-CODELIST-EMISSION-I01B-1` |
| Program | `UYAP-MODULE-FULL-GAP-CLOSURE-R02` |
| Öncül | `UYAP-OFFICIAL-SERIALIZER-ARCHITECTURE-I01A` (PR #1798, `0144f9b4`) |
| Öncül | `UYAP-OFFICIAL-DTD-CONFORMANCE-RECORD-CORRECTION-R01` |
| Tarih | 2026-07-28 |
| Durum | IMPLEMENTED — owner ratifikasyonu bekliyor |

## 0. Kapsam sınırı (değişmedi)

`REAL TRANSPORT NOT AUTHORIZED` · `PRODUCTION ADAPTER NOT AUTHORIZED` ·
`PRODUCTION CUTOVER HARD HOLD` · `CANARY R02 NOT ELIGIBLE`

Bu birimde ayrıca **yapılmayanlar**: DTD onarımı, toleranslı validator, türetilmiş DTD,
strict DTD uyum hükmü, hukuki rol eşlemesi icadı, schema/migration, legacy canlı
serializer cutover'ı.

## 1. Canonical artefakt doğrulaması (ölçüldü)

| Artefakt | Beklenen | Ölçülen | Sonuç |
| --- | --- | --- | --- |
| Model B DTD | SHA `124a9a96…`, 9273 B | aynı | **MATCH** |
| `KodluBilgilerData.xml` | SHA `f95925714428b66eec9b0b29be761e4982fd0a207ae90bff34bbffeaf979ec7c`, 134717 B | aynı | **MATCH** |
| MANIFEST | mevcut | mevcut | **MATCH** |

`CANONICAL EVIDENCE DRIFT` **tetiklenmedi**.

### 1.1 Artefakt içi etiket kaybı — kaynakta, bundle'da değil

`KodluBilgilerData.xml` `encoding="ISO-8859-9"` **deklare eder**, ancak gerçek byte'ları
**UTF-8 kodlanmış `U+FFFD` (`ef bf bd`)** taşır. Türkçe harfler **kaynakta** kaybolmuştur
ve geri döndürülemez (`BORï¿½LU/Mï¿½FLï¿½S`).

Bu bir **drift değildir**: dosyanın hash'i MANIFEST ile birebir eşleşir. Kayıp,
paketin üretildiği anda oluşmuştur.

Sonuç ve tasarım cevabı:

- **Kodlar saf ASCII → güvenilir.** 17/17 rolID, MANIFEST'in bağımsız enumerasyonuyla
  çapraz doğrulandı.
- **Etiketler artefakttan türetilemez.** Registry her girdiye `labelProvenance` iliştirir
  (`OWNER_RATIFIED` | `MANIFEST_TRANSCRIBED` | `ARTEFACT_LOSSY`) ve **yalnız
  `OWNER_RATIFIED` etiket emit edilebilir**. Etiket tahmini/onarımı YAPILMAZ.

Açık gözlem (çözülmedi, emisyona etkisi yok): artefakt ASCII iskeleti rolID 46 için
`H?SSADAR`, MANIFEST ise `HİSSEDAR` diyor. 46 hiçbir yolda emit edilmediği için
kapatılmadı.

## 2. Resmî kodlu alan envanteri

| Küme | Adet | Aralık / değerler |
| --- | --- | --- |
| `rolTur` | **17** | rolID 21–71 |
| `mahiyetKodu` | **18** | 1007…9009, 1045…5045 |
| `takipTuru` | **2** | `0` = İlamlı, `1` = İlamsız |

## 3. Rol dispozisyonu

| Sınıf | Adet | Domain rolleri |
| --- | --- | --- |
| `RESOLVED` (emit edilebilir) | **2 rolID / 4 domain rolü** | ASIL_BORCLU, MUSETEREK_BORCLU → **22**; ADI_KEFIL, MUTESELSIL_KEFIL → **33** |
| `AUTHORITY_REQUIRED` | 3 | MIRASCI, TASFIYE_MEMURU, IFLAS_MASASI (LDO + OWNER, P03B) |
| `UNSUPPORTED_FOR_ROLTUR` | 5 | KESIDECI, CIRANTA, AVAL, LEHDAR, MUHATAP (kambiyo enstrüman sıfatı) |
| Emit edilmeyen resmî kodlar | 15 | etiketi yalnız MANIFEST transkripsiyonu ile bilinir |

`RESOLVED` olmayan hiçbir sınıf byte üretmez (fail-closed).

## 4. Legacy ile semantik çakışma (KAYIT)

Bu, bu birimde **düzeltilmedi** — legacy canlı hat dokunulmazdır. Kayıt amaçlıdır:

| Alan | Resmî sözlük | Legacy sözlük | Çakışma |
| --- | --- | --- | --- |
| `takipTuru` | `0`=İlamlı, `1`=İlamsız | `'1'..'6'`, **`2`=İlamlı** | Aynı alan adı, **farklı kod uzayı** |
| `mahiyetKodu` | `1045`=Nafaka, `4045`=Para Alacağı | `UYAP_MAHIYET_KODLARI` aynı kodları **FATURA vb.** için kullanır | **Aynı kod, farklı anlam** |
| `rolTur` | 21–71 | `UYAP_ROL_TURLERI` 1–10 | Ayrık uzaylar |

Resmî hat legacy mapper'a **bağlı değildir** (CL-23) ve legacy davranış
**değişmemiştir** (CL-22).

## 5. Uygulanan değişiklikler

| Dosya | Değişiklik |
| --- | --- |
| `official-codelist-registry.ts` **(YENİ)** | Canonical registry: provenance, 17 rol, 18 mahiyetKodu, 2 takipTuru, 6 failure code, `emittableLabel` / `checkOfficialRolePair` / `validateOfficialMahiyetKodu` / `validateOfficialTakipTuru`. Derleme-zamanı sabitler; runtime dosya okuma / ağ / `process.env` YOK. |
| `official-canonical-serializer.ts` | Şekilden **önce** çalışan `checkCodelist()` kapısı; yeni `CODELIST_REJECTED` statüsü; `officialCodelistConformance: 'NOT_CLOSED' → 'REGISTRY_VALIDATED'`. |
| `official-role-translator.ts` | Hedef tablosu artık **yalnız rolID seçimi** taşır; resmî **etiket** registry'den (`emittableLabel`) alınır — owner-ratified etiket yoksa `RESOLVED` üretilmez. |
| `__tests__/official-codelist-emission.spec.ts` **(YENİ)** | CL-01…CL-25 + CA-01…CA-10, **39 test**. |
| `ci-manifests/pure/uyap-icrabot-tebligat.txt` | Yeni spec cerrahi eklendi (yeni ci.yml adımı **açılmadı**). |

### 5.1 Uyarlanan mevcut guard'lar (konu değişmedi, desen güncellendi)

- `official-canonical-serializer.spec.ts` **SER-20** ve
  `official-serializer-architecture-guard.spec.ts` **SA-08**: `NOT_CLOSED` →
  `REGISTRY_VALIDATED`. Her ikisinde de **strict DTD hükmü üretilmediği** ve yasak statü
  adlarının geçmediği iddiası korundu/güçlendirildi.
- `official-role-translator.spec.ts`: rolID deseni `rolID:\s*'\d+'` → dosyadaki **tüm**
  sayısal literal'ler. Kapsam **genişledi**; `{22, 33}` kısıtı aynen duruyor.

## 6. Test kanıtı

| Kapsam | Sonuç |
| --- | --- |
| `official-codelist-emission.spec.ts` | **39/39 PASS** |
| `src/modules/uyap/official/**` (9 suite) | **PASS** |
| `src/modules/uyap/**` | **800 PASS**, 3 skipped; 5 suite `db-gated.integration` (DB yok → `db` manifesti) |
| `tsc -p tsconfig.prod.json --noEmit` | **EXIT 0** |
| `bash scripts/run-ci-manifest.sh pure/uyap-icrabot-tebligat` | **61 suite / 1041 test PASS**; yeni spec çalıştırılan yol listesinde |

## 7. Dormant dispatch değişmezleri

`UYAP_DORMANT_DISPATCH_ENABLED = false`, `transportPerformed: false`,
`networkCallCount: 0`. Codelist reddi hâlinde `NOT_PREPARED` döner ve **byte üretilmez**
(CL-20/21).

## 8. Üretilmeyen hükümler

Bu birim `officialDtdValidated: false` taşır ve `UYAP_READY` / `SUBMITTABLE` /
`OFFICIAL_ACCEPTED` / `VALIDATED_BYTES` statülerini **kullanmaz**.
`REGISTRY_VALIDATED` yalnız şunu söyler: *emit edilen kodlu alanlar canonical
registry'ye karşı doğrulandı*. **Strict DTD uyumu iddia edilmez** — owner kararı **D1**
(nondeterministic content model) ile bloklu, `UYAP-STRICT-DTD-CONFORMANCE-I01B-2`
kapsamındadır.

## 9. Sıradaki (owner sırası)

1. `P04B-EXT-01` — dış teknik authority bekleme hattı (paralel, bloklamaz)
2. `UYAP-STRICT-DTD-CONFORMANCE-I01B-2` — **D1 ile bloklu**
3. Final CI
4. Canary R02 — **NOT ELIGIBLE**
