# UYAP-OFFICIAL-ALACAKKALEMI-STRUCTURED-EMISSION-I01 — v1.0

| Alan | Değer |
| --- | --- |
| Canonical task | `UYAP-OFFICIAL-ALACAKKALEMI-STRUCTURED-EMISSION-I01` |
| Program | `UYAP-MODULE-FULL-GAP-CLOSURE-R02` (owner sırası: adım 5; paralel yürütme owner tarafından iki kez onaylı) |
| Policy | `ORCHESTRA-EXECUTION-MODEL-REVISION-R01` altında AUTO-DISPATCH (mekanik successor — sarmalayıcı semantiği W-01…W-05 zaten owner-ratified; yeni hukuki karar YOK) |
| Öncüller | W-01…W-05 ratifikasyonu (PR #1853, `14a1b3c5`) · P02B-R2 follow-up (`a0b45f0b`) · resmî DTD ölçümü (`124a9a96…`) |
| Tarih | 2026-07-30 |

## 1. Ne yapıldı

P02B-R2'nin battaniye reddi, **owner-ratified sarmalayıcı çözümüne bağlı fail-closed
emisyona** dönüştürüldü:

- `OfficialAlacakKalemi.wrapperResolution?: OfficialWrapperResolution` (opsiyonel alan;
  ADDITIVE — eski çağıranlar aynı redde düşer).
- Builder: kalem ancak `wrapperResolution.kind === 'RESOLVED'` VE `faiz` taşımıyorsa
  emit edilir; aksi hâlde P02B-R2 reddi (`UNAUTHORIZED_ALACAK_KALEMI_PARENT` +
  `authorizedParents`) AYNEN uygulanır. Tek çözümsüz kalem TÜM emisyonu reddeder
  (kısmi XML/byte YOK).
- Emisyon biçimi: her kalem KENDİ sarmalayıcı elementi altında —
  `<cek|senet|police|ilam><alacakKalemi id… alacakKalemAdi… alacakKalemTutar…
  tutarTur…/></…>` — girdi sırası korunur (deterministik).
- Sarmalayıcı adı ASLA literal/otomatik seçilmez: yalnız
  `resolveOfficialAlacakKalemiWrapper` çıktısından gelir ve
  `OFFICIAL_ALACAK_KALEMI_PARENTS` kümesine karşı doğrulanır.

## 2. Ölçüme dayalı sınırlar

- Resmî DTD ATTLIST'leri (cek/senet/police/ilam/alacakKalemi) bu görevde ölçüldü:
  **tamamı `#IMPLIED`** → çıplak sarmalayıcı elementi şekil-geçerli; zorunlu attribute
  yok. Sarmalayıcı attribute'ları (seriNo, kesideTarihi…) **emit edilmez** — enstrüman
  verisi girdide yok, UYDURULMAZ (gelecek iterasyon: enstrüman-verili genişleme).
- `faiz` çocuk elementi **bilinçli kapsam dışı / fail-closed** — resmî `ATTLIST faiz`
  ölçülmeden attribute adı tahmin edilmez.
- `kontrat`/`digerAlacak` (W-06/W-07) emit EDİLEMEZ (resolver zaten üretmez; guard +
  ES-10 doğrular). Kalem-başına-sarmalayıcı v1 modelidir; enstrüman kimliğiyle
  gruplama gelecek iterasyondur.
- `ilam` içerik modeli D1 nondeterministic örneğidir — bu emisyon **strict DTD PASS
  iddia etmez** (`officialDtdValidated: false` korunur).

## 3. Uyarlanan mevcut guard'lar (konu korunarak)

`official-exchange-builder.spec.ts` P02B-R2 statik guard'ları: (1) "doğrudan
dosya-çocuğu emisyonu yok" → `dosya.ele('alacakKalemi')` hâlâ yasak, yalnız
`wrapper.ele(…)` var; (2) "otomatik sarmalayıcı seçimi yok" → literal sarmalayıcı
emisyonu hâlâ yasak + RESOLVED kontrolü ve resmî küme doğrulaması kaynakta zorunlu.

## 4. Kanıt

| Kapsam | Sonuç |
| --- | --- |
| Yeni spec ES-01…ES-10 | **13/13 PASS** |
| `modules/uyap/official/**` (14 suite) | **304/304 PASS** |
| `tsc -p tsconfig.prod.json --noEmit` | **EXIT 0** |
| `run-ci-manifest.sh pure/uyap-icrabot-tebligat` | **74 suite / 1266 test PASS** |

## 5. Statü

```text
STRUCTURED EMISSION (W-01..W-05):  IMPLEMENTED / FAIL-CLOSED
FAIZ ÇOCUĞU:                       KAPSAM DIŞI / FAIL-CLOSED (ATTLIST ölçümü bekler)
SARMALAYICI ATTRIBUTE'LARI:        EMİT EDİLMEZ (enstrüman-verili gelecek iterasyon)
STRICT DTD:                        OPEN / BLOCKED BY D1
UYAP M-01:                         BLOCKED_BY_RECEIVABLE_LEGAL_BASIS_AUTHORITY (değişmedi)
CANARY R02:                        NOT ELIGIBLE
NEXT AUTO-SUCCESSOR:               serializer bypass hardening (owner sırası adım 6)
```
