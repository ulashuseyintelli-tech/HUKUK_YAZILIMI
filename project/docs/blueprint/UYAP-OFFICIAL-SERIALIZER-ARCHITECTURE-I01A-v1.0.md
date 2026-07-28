# UYAP Official Serializer Architecture I01A v1.0

```text
Task              : UYAP-OFFICIAL-SERIALIZER-ARCHITECTURE-I01A
Parent program    : UYAP-MODULE-FULL-GAP-CLOSURE-R02
Tür               : SERIALIZER ARCHITECTURE / DETERMINISM / ENCODING BOUNDARY
Durum             : IMPLEMENTED
Tarih             : 2026-07-28
Kanıt tabanı      : canonical main `87090cdd`
Yetki             : Owner `GO-COMPLETE`
Predecessor       : UYAP-OFFICIAL-DTD-CONFORMANCE-RECORD-CORRECTION-R01
                    CLOSED / CANONICAL / PASS · PR #1789 · `7c5d143481cf11acb5cd165443caac746e86a45a`
SCHEMA DELTA      : NONE
REAL TRANSPORT    : NOT AUTHORIZED
PRODUCTION ADAPTER: NOT AUTHORIZED
PRODUCTION CUTOVER: HARD HOLD
```

---

## 1. Kapatılan yapısal boşluk

Resmî serileştirme **iki bağlantısız yarım parça** hâlindeydi:

```text
official-exchange-builder.ts   → XML METNİ üretir
                                 deklarasyon: encoding="ISO-8859-9"
                                 byteEncodingPerformed: false      ← byte dönüşümü YOK

official-iso8859-9-encoder.ts  → GERÇEK ISO-8859-9 byte üretir
                                 fail-closed round-trip doğrulaması
                                 (hiçbir üretim yolundan ÇAĞRILMIYORDU)
```

Yani *"deklarasyon ISO-8859-9 diyor ama elde JS string var"* durumu **yapısal olarak
mümkündü**. Truthfulness alanı (`byteEncodingPerformed: false`) bunu dürüstçe raporluyordu
ama mimari boşluk duruyordu.

**I01A** iki yarıyı tek sahiplik altında birleştirir ve *deklarasyon ↔ gerçek byte encoding*
eşleşmesini **zorunlu** kılar.

---

## 2. SERIALIZER ENVANTERİ

| Dosya / Sembol | Sınıf | Runtime erişimi | Çıktı | Encoding | Rol kaynağı |
|---|---|---|---|---|---|
| `uyap/official/official-canonical-serializer.ts` · `serializeUyapExchangeCanonical` | **CANONICAL OWNER** | dormant dispatch (provider kaydı YOK) | `Buffer` | **ISO-8859-9 gerçek byte** | girdideki `RESOLVED` resolution |
| `uyap/official/official-exchange-builder.ts` · `serializeOfficialExchange` | DELEGATE (şekil) | canonical owner çağırır | `string` | deklarasyon etiketi | aynı |
| `uyap/official/official-iso8859-9-encoder.ts` · `encodeOfficialExchangeToIso88599` | DELEGATE (byte) | canonical owner çağırır | `Buffer` | iconv-lite, fail-closed | — |
| `uyap/official/official-dormant-dispatch.ts` · `prepareUyapDormantDispatch` | TEST_ONLY | provider kaydı YOK | `Buffer` | canonical owner | — |
| `uyap/uyap-xml.service.ts` · `UyapXmlService` | **LEGACY_PRODUCTION** | `uyap.controller.ts` (canlı) | `string` | deklarasyon `UTF-8`, byte dönüşümü YOK | `UYAP_ROL_TURLERI` (1-10) |
| `uyap-export/uyap-xml-builder.service.ts` · `UyapXmlBuilderService` | **LEGACY_PRODUCTION** | `uyap-export.service.ts` (canlı) | `string` | deklarasyon `UTF-8` | `uyap-case-mapper` |

**Legacy iki yol bu görevde birleştirilmedi.** Sebep: legacy→resmî geçiş `rolTur` eşleme
kararına bağlıdır (legacy 1-10 vs resmî 21-71, kesişim ∅) ve bu **I01B-1 / P03B**
kapsamındadır. I01A yalnız resmî hattın tek sahipli ve deterministik olmasını sağlar;
guard'lar legacy yolların **resmî uyum iddia etmemesini** kilitler.

### 2.1 Before → After çağrı grafiği

```text
BEFORE
  builder ─→ (string)                    encoder ─→ (Buffer)
     ▲ test-only                            ▲ test-only, HİÇ ÇAĞRILMIYOR

AFTER
  prepareUyapDormantDispatch
      └─→ serializeUyapExchangeCanonical        ← TEK ENTRYPOINT
              ├─→ serializeOfficialExchange     (şekil)
              └─→ encodeOfficialExchangeToIso88599  (byte + round-trip)
```

---

## 3. CANONICAL CONTRACT

`serializeUyapExchangeCanonical(input): UyapCanonicalSerializationResult`

Sürüm: `UYAP-CANONICAL-SERIALIZER/v1`

| Statü | Anlam |
|---|---|
| `CANONICAL_BYTES` | şekil üretildi **ve** kayıpsız ISO-8859-9 byte'a çevrildi |
| `SHAPE_REJECTED` | çözülemeyen rol / id ihlali / yetkisiz `alacakKalemi` ebeveyni → **byte YOK** |
| `ENCODING_REJECTED` | şekil üretildi ama kayıpsız byte üretilemedi → **byte YOK** |

Owner yasak statü adları (`UYAP_READY` · `SUBMITTABLE` · `OFFICIAL_ACCEPTED` ·
`COMPLIANT` · `VALIDATED_BYTES`) **kullanılmaz** — SA-08 ile kilitli.

Evidence: `encoding` · `declarationMatchesBytes: true` · `byteEncodingPerformed: true` ·
`roundTripVerified: true` · `byteLength` · `encodedBytesSha256` ·
`officialDtdValidated: false` · `officialCodelistConformance: 'NOT_CLOSED'`.

---

## 4. ENCODING SINIRI

Tek nokta: `official-iso8859-9-encoder.ts` (SA-04 ile kilitli — UYAP modülünde `iconv`
kullanan **tek** dosya).

- Türkçe karakterler (`çğıöşüÇĞİÖŞÜ`) kayıpsız; ISO-8859-9 tek-byte olduğu için çıktı
  UTF-8'den **küçüktür** (SER-10 bunu ölçer).
- Temsil edilemeyen karakter (`€`, CJK) → sessiz `?` ikamesi **YOK**, kayıp **YOK**,
  replacement character **YOK** → `ENCODING_REJECTED` / `UNREPRESENTABLE_CHARACTER`.
- Deklarasyon ↔ byte eşleşmesi: byte'lar ISO-8859-9 decode edildiğinde kaynak XML'e
  **birebir** döner (SER-12 iconv ile doğrular).

---

## 5. DETERMINISM

| Boyut | Garanti |
|---|---|
| tekrar | aynı girdi → **byte-özdeş** çıktı + aynı SHA-256 |
| insertion order | alan sırası çıktıyı **değiştirmez** |
| element/attribute sırası | kararlı; ardışık koşularda aynı |
| escaping | `& < > " '` escape; **double escaping yok** |
| nullability | `undefined` emit edilmez; boş string'ten **ayrı** |
| tarih/sayı | `Date.now` / `Math.random` / `toLocale*` / `Intl` **kullanılmaz** (kaynak-metin kilidi) |
| satır sonu | CRLF **yok** — platformdan bağımsız |

---

## 6. DORMANT DISPATCH

```text
NETWORK CALL COUNT : 0        (fetch + http.request + https.request casusları ile kanıtlı)
REAL TRANSPORT     : DISABLED
PRODUCTION ADAPTER : NOT REGISTERED
FEATURE FLAG       : FINAL OFF (env'den okunmaz; SA-07 `process.env` yokluğunu kilitler)
```

Fonksiyon adı bilinçli olarak `prepare*`'dır — `send`/`submit` gerçek gönderim izlenimi
üretirdi. `transportPerformed: false` ve `networkCallCount: 0` makine-okunur olarak taşınır.
`UyapModule` bu hattı provider olarak **kaydetmez**.

---

## 7. TEST EVIDENCE

| Spec | Sonuç |
|---|---|
| `official-canonical-serializer.spec.ts` (SER-01…SER-20) | **19/19 PASS** |
| `official-serializer-architecture-guard.spec.ts` (SA-01…SA-08) | **15/15 PASS** |
| Manifest runner (`pure/uyap-icrabot-tebligat`) | **60 suite / 1002 test PASS** |
| `tsc -p tsconfig.prod.json` | EXIT 0 |
| `pnpm build` | EXIT 0 |

### 7.1 Uyarlanan davranış kilidi (silinmedi)

`official-iso8859-9-encoder.spec.ts` `(16)` — P04A-ENC dormancy guard'ı *"encoder hiçbir
runtime dosyası tarafından import edilmesin"* diye ölçüyordu. I01A owner brief'i encoder'ı
canonical serializer'a bağlamayı **açıkça yetkilendirdi** (tek encoding sınırı, SA-04).

Guard'ın **asıl güvencesi kaybolmadı, kesinleşti**: encoder'ı **yalnız canonical sahip**
import edebilir (tam liste assertion'ı) ve o sahip de canlı bir yola bağlı **değildir**
(`app.module.ts` + `UyapModule` provider kaydı yokluğu ayrıca doğrulanır). Ayrıca yalnız
**gerçek `import` satırları** sayılır — yorumdaki dosya-adı anması artık yanlış pozitif
üretmez.

---

## 8. ARCHITECTURE GUARDS

| # | Guard |
|---|---|
| SA-01 | resmî byte üretimi **tek** dosyada; encoder'ı **yalnız** canonical sahip çağırır |
| SA-02 | resmî hatta string concatenation ile XML **yok**; şekil yalnız builder'dan |
| SA-03 | `xmlbuilder2` kullanan UYAP üretim dosyaları **tam liste**; legacy yollar resmî uyum **iddia etmez** |
| SA-04 | `iconv` UYAP modülünde **tek** dosyada |
| SA-05 | `declarationMatchesBytes` kanıtı + encoder `DECLARATION_MISMATCH` reddi |
| SA-06 | dormant dispatch canonical entrypoint'i çağırır; kendi XML'ini/encoding'ini kurmaz |
| SA-07 | resmî hatta ağ istemcisi **yok**; flag FINAL OFF; `UyapModule` provider kaydı **yok** |
| SA-08 | yasak statü adları **yok**; `officialDtdValidated: false` + codelist `NOT_CLOSED` |

Allowlist **dar ve dosya-bazlıdır** (klasör allowlist'i kullanılmadı).

---

## 9. KAPANIŞ HÜKMÜ

```text
CANONICAL SERIALIZER ARCHITECTURE : CLOSED / DETERMINISTIC / BYTE-TESTED
OFFICIAL CODELIST CONFORMANCE     : NOT CLOSED
STRICT DTD CONFORMANCE            : OPEN / BLOCKED BY D1
CANARY R02                        : NOT ELIGIBLE
```

---

## 10. I01B AYRIMI

**`UYAP-OFFICIAL-CODELIST-EMISSION-I01B-1`** — D7'den **bağımsız** yürütülebilir:
mevcut Model B bundle'dan ölçülebilen `rolTur` (21-71) · `mahiyetKodu` · `takipTuru` ve
diğer kodlu alanlar için canonical mapping ve fail-closed emisyon. Resolved roller
(22/33) implement edilebilir; `UNRESOLVED_AUTHORITY_REQUIRED` (LDO_OWNER 3 rol) ve
`UNSUPPORTED_FOR_ROLTUR` (kambiyo 5 sıfat) **açık disposition ile bloklu** kalır.

**`UYAP-STRICT-DTD-CONFORMANCE-I01B-2`** — **D7'ye bağlı**: nondeterministic official
grammar · UYAP/BİGM teknik cevabı · strict validation policy · final DTD conformity verdict.

---

## 11. RESIDUALS

| # | Bulgu | Devir |
|---|---|---|
| S-1 | İki legacy production XML yolu resmî hattan ayrı duruyor (kod 1-10, UTF-8 deklarasyon, byte dönüşümü yok) | **I01B-1 / P03B** |
| S-2 | `alacakKalemi` ebeveyn yerleşimi divergence'ı (builder `dosya` altına emit ediyor; resmî DTD'de yasak) | **P02B-R2** (owner kararı D5) |
| S-3 | Strict DTD validation D1 nondeterministic grammar ile bloklu | **P04B-EXT-01 → I01B-2** |
| S-4 | Canonical serializer canlı bir üretim yoluna bağlı değil (bilinçli — cutover HARD HOLD) | **cutover görevi** |
