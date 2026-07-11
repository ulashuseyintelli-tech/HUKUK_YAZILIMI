# PR-A4-2 Rich Interest Diagnostic Fixture

## Amaç ve kanıt sınırı

Bu test-only fixture, PR-A4-0 rich-interest/UYAP inventory sınıflandırıcısını, ClaimItem hesaplama
otoritesi assembler'ını ve iki mevcut UYAP exporter mapping kaynağının gözlemlenen davranışını
deterministik sentetik senaryolarla doğrular.

**Synthetic evidence is not production empirical evidence.** Fixture sonuçları production veri
dağılımını veya yaygınlığını göstermez.

**Observed exporter parity is not legal mapping acceptance.** AST parity kontrolü yalnız mevcut
kod/fallback davranışının inventory gözlem modeliyle aynı olduğunu kanıtlar; hukuki doğruluk,
exporter otoritesi, numeric-vs-FAIZT seçimi ve exact UYAP mapping kabulü üretmez.

## Disposable DB güvenliği

DB-gated suite yalnız `TEST_DATABASE_URL` kullanır. Veritabanı adı `test`, `gate`, `spec`, `ci`
veya `jest` işaretlerinden birini içermelidir; `hukuk_db` ve işaretsiz hedefler fail-closed reddedilir.
CI PostgreSQL 16 servisinde migration zinciri uygulandıktan sonra suite açıkça seçilir. Production,
shared veya local application DB fallback'i yoktur.

Lifecycle:

1. `pra42-` namespace residue sayıları sıfır doğrulanır.
2. Fixture ve unrelated sentinel tek transaction'da eklenir.
3. Inventory kendi `READ ONLY / REPEATABLE READ` transaction'ında, page size `7` ile çalışır.
4. Manifest, calculation authority ve checked-in golden çıktılar karşılaştırılır.
5. Target fixture temizlenirken sentinel'in etkilenmediği doğrulanır.
6. Sentinel ayrıca temizlenir ve final residue tekrar sıfır doğrulanır.

Outer rollback kullanılmaz; inventory kendi transaction'ını açtığı için seed commit edilir ve cleanup
`finally` içinde açıkça uygulanır. Golden çıktılar bellekte üretilir; geçici evidence dosyası yazılmaz.

## Manifest

`manifest.ts` her senaryonun girdisini ve beklenen semantik sonucunu birlikte taşır. Tek bir genel
`expectedClass` yoktur. Integrity, UYAP readiness, diagnostic reason, mapping blocker, exporter
comparison ve calculation authority ayrı alanlardır. Persist edilemeyen `NaN`/`Infinity` yalnız
`CLASSIFIER_ONLY`; diğer senaryolar `PERSISTED_DB` katmanındadır.

Kapsam:

- 11/11 canonical rich faiz kodu,
- rich/legacy integrity sınıfları,
- audited ve corrupt `NO_INTEREST`,
- fixed missing/zero/negative/NaN/Infinity,
- variable stray rate,
- altı mevduat kodu için ayrı `SHORT`, `LONG`, `AMBIGUOUS`,
- `CONTRACTUAL + YASAL`, `YOKSUN`, case fallback ve silent fallback riskleri.

Mevduat vadesi tarih farkı, oran, currency veya legacy türden tahmin edilmez; yalnız explicit
provenance kabul edilir.

## Golden politikası

İki normal, version-controlled dosya kullanılır:

- `golden/rich-interest-summary.golden.json`
- `golden/rich-interest-detailed.golden.ndjson`

Jest snapshot ve `-u` update yüzeyi yoktur. Karşılaştırma byte/string equality'dir. Fixture satırları
`fixtureId`, sınıf/diagnostic/blocker listeleri alfabetik, rich-code summary ise canonical enum
sırasındadır. Timestamp, duration, host, DB adı, filesystem path, random ID ve generated audit
tarihleri çıktıya alınmaz. Golden değişikliği bilinçli code review gerektirir.

## Exporter parity

Test-only TypeScript AST okuyucusu production dosyalarını salt-okunur parse eder:

- numeric: `uyap/uyap-xml.service.ts` içindeki `UYAP_FAIZ_KODLARI`,
  `mapInterestTypeToUyapKod()` ve fallback `99`;
- FAIZT: `uyap-export/uyap-case-mapper.service.ts` içindeki `mapInterestTypeToCode()` ve fallback
  `FAIZT00003`.

Mapping yapısı, literal değer veya fallback biçimi değişirse extractor fail-closed olur. Duplicate,
dynamic veya tanınmayan AST şekli kabul edilmez. Unknown sentinel her iki silent fallback'i;
FAIZT ayrıca missing-start-date omission davranışını doğrular. Numeric ve `FAIZT000xx` code-space'leri
birbirine normalize edilmez.

Exporter class constructor, XML builder/generation, filesystem export, network, UYAP submit veya
projection persistence çağrılmaz.

## Çalıştırma

Pure fixture/AST/calculation suite:

```text
pnpm --filter @hukuk/api exec jest --ci --runInBand \
  --testPathPattern="rich-interest-uyap-readiness\.fixture\.spec\.ts$"
```

DB suite yalnız güvenli disposable hedefle:

```text
TEST_DATABASE_URL=postgresql://.../hukuk_test \
pnpm --filter @hukuk/api exec jest --ci --runInBand \
  --testPathPattern="rich-interest-uyap-readiness\.fixture\.db-gated\.integration\.spec\.ts$"
```

Bu fixture exact mapping kararı vermez, production seed/backfill oluşturmaz, exporter/inventory core'u
değiştirmez ve PR-A4/PR-A5/CAN-CUT-01 kapılarını açmaz.
