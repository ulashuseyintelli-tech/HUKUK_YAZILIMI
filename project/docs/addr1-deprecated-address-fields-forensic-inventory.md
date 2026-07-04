# ADDR-1 — Deprecated addressType/isMernis Forensic Inventory

> **Tür:** Read-only forensic / inventory. **Schema/migration/kod/DTO/UI/data değişikliği YOK · PR temizliği YOK.**
> **Tarih:** 2026-06-24 · **main HEAD:** `2863269` · **Yöntem:** çok-ajanlı paralel yüzey taraması + git'e karşı
> bağımsız doğrulama (verify-live-not-just-code). Otoriter karar verilerine `debtor.service.ts` ve backfill
> migration'ı **elle** teyit edildi.

## 1. Scope

Yalnız iki Prisma kolonu:
- `DebtorAddress.addressType String?` — schema **satır 825**, `@deprecated - type kullan`
- `DebtorAddress.isMernis Boolean @default(false)` — schema **satır 826**, `@deprecated - type=MERNIS kullan`

Kanonik ikame (doğrulandı): `DebtorAddress.type AddressType @default(DECLARED)` (satır 753) + `source AddressSource` (satır 755).

**Hedef DIŞI ama ayırt edilen (conflation tuzakları):** `ServiceHistory.addressType` (snapshot, kanonik `type`'tan beslenir) ·
`Tebligat.addressType` (ayrı enum `TebligatAddressType`, aktif) · `enum AddressType` (canonical tip) ·
MERNIS-sorgu özelliği (address-discovery / institution-letter / uyap — kanonik `type=MERNIS` kullanır).

## 2. Search Method

`git grep -n "addressType\|isMernis"` → `apps/api/src`, `apps/web/src`, `packages/types`, `prisma/`.
Dışlanan gürültü (raporlandı): `uyap_bot_blueprint_*`, `v28_ops_bundle`, `.kiro/specs`, `*.txt`/`*.yaml` bundle'ları,
`node_modules/`, `dist/`. Ham toplam ~535 hit / 92 dosya; geniş pattern çoğunlukla `AddressType` enum + aktif MERNIS
özelliği + bundle gürültüsü. Her anlamlı hit kaynak okunarak **kolon vs. yerel-değişken vs. ayrı-model** ayrımıyla sınıflandı.

## 3. Findings by Surface

- **Backend (`apps/api/src`):** Tüm canlı referanslar `debtor.service.ts` içinde **DTO girdisini OKUR**
  (`mapAddressTypeToCanonical`). **Yazma yolu yok:** 3 yol (`reportAddresses` 484-485, `addAddress` 1132-1134,
  `updateAddress` 1192-1198) `const { addressType: _at, isMernis: _im, ...rest }` ile alanları destructure-dışlar;
  Prisma `create/update` payload'una yalnız kanonik `type`/`source` gider.
- **Frontend (`apps/web/src` + `packages/types`):** `NewDebtorModal.tsx` + `debtors/page.tsx` DTO `addressType`+`isMernis`
  **gönderir** (payload), ama görüntüleme kanonik `addr.type`'tan `canonicalToAddressType()` ile türetilir.
  `types/debtor.ts` ikisini de `@deprecated` işaretler.
- **Tests/seed:** `debtor-address-canonical.spec.ts` deprecated kolonların DB'ye **yazılmadığını** assert eder
  (`data.addressType`/`data.isMernis` → `undefined`). `seed-sample-cases.ts` + `debtor-wizard-payload.test.ts` DTO
  alanını üretir/bekler. `check-debtor-addresses.ts` salt-okuma diagnostik.
- **Schema/migration/docs:** baseline migration iki kolonu oluşturur; `20260616030000_backfill...` deprecated→kanonik
  türetir (**yalnız `type='DECLARED'` satırlar**, idempotent). Backfill sonrası kolonlara dokunan migration yok.

## 4. Classification Table (anlamlı bulgular; conflation kümeleri özetlendi)

| file:line | whichField | classification | not |
|---|---|---|---|
| schema.prisma:825 | DebtorAddress.addressType | DB_SCHEMA | `@deprecated`; ikame=type (753) |
| schema.prisma:826 | DebtorAddress.isMernis | DB_SCHEMA | `@deprecated`; ikame=type=MERNIS |
| debtor.service.ts:38-46 | addressType+isMernis | ACTIVE_READ (DTO) | map fn; DTO girdisi, kolon değil |
| debtor.service.ts:484-485 | addressType+isMernis | (write-path) excluded | `_at/_im` destructure → kolona YAZILMAZ |
| debtor.service.ts:1132-1134 | addressType+isMernis | (write-path) excluded | addAddress; aynı dışlama |
| debtor.service.ts:1192-1198 | addressType+isMernis | (write-path) excluded | updateAddress; aynı dışlama |
| debtor.dto.ts:53-82 | addressType+isMernis | API_CONTRACT | DTO hâlâ kabul eder (geri-uyum) |
| types/debtor.ts:80-106 | addressType+isMernis | API_CONTRACT | `@deprecated` işaretli |
| NewDebtorModal.tsx / debtors/page.tsx | addressType+isMernis | ACTIVE_WRITE (DTO payload) | frontend gönderir; DB kanonikleşir |
| debtor-address-canonical.spec.ts:57-69 | addressType+isMernis | TEST_ONLY | kolona yazılmadığını assert |
| seed-sample-cases.ts / debtor-wizard-payload.test.ts | addressType+isMernis | TEST_ONLY (seed/fixture) | DTO fixture; service kanonikleştirir |
| backfill migration | addressType+isMernis | MIGRATION_HISTORY | tek-seferlik okuma→kanonik |

**Conflation kümeleri (HEDEF DEĞİL, AKTİF):** `ServiceHistory.addressType` (service.ts 1051/1056/… yerel değişkene
`a.type` atar — deprecated kolon DEĞİL) · `Tebligat.addressType` (`TebligatAddressType` enum, tebligat.service.ts'te
aktif yazılır/okunur) · `enum AddressType` (canonical tip) · MERNIS-sorgu özelliği.
*(Düzeltme: bir survey ajanı satır 1256'yı "CaseDebtor.addressType" etiketledi; kaynak teyidiyle bu ServiceHistory
snapshot'ıdır — her iki durumda da deprecated DEĞİL.)*

## 5. Live Usage Assessment

**Deprecated KOLONLARI okuyan/yazan canlı app kodu: HAYIR.** (Elle doğrulandı.)
- **Write:** 3 yazma yolunun hepsi alanları `_at`/`_im` ile destructure-dışlar; payload'a yalnız kanonik `type`/`source`
  gider. `debtor.service.ts:483` yorumu: *"deprecated addressType/isMernis KOLONA yazma"*; `:1131` *"KOLONA ARTIK
  YAZILMAZ (bağımlılık kesildi)"*. Test (`debtor-address-canonical.spec.ts`) bunu `undefined` assert'iyle garantiler.
- **Read:** `debtor.service.ts:48` ters-eşleme yorumu: *"Deprecated kolon OKUNMADAN"* edit-form'u kanonik `type`'tan
  doldurur. Service'teki `addressType` görünümleri kanonik `a.type`'ı yerel değişkene atar (kolon okumaz).
- **DTO/taşıma katmanı** alanları kabul eder (API_CONTRACT) — bu DB **kolonu değildir**; service intake'te kanonikleştirir.
- **Ayrı + aktif:** `ServiceHistory.addressType` ve `Tebligat.addressType` bu temizliğin kapsamı DIŞINDADIR.

## 6. Cleanup Risk Assessment

- **App-yazım/okuma bağımlılığı:** YOK (kesilmiş, test-garantili). Kolon DROP'u kod yolunu **kırmaz**.
- **Veri kaybı riski (RUNTIME-DB kontrolü gerekir):** backfill yalnız `type='DECLARED'` satırlarını işledi. Kolon
  DROP'undan önce **backfill-dışı kalmış (un-derived)** satır olup olmadığı doğrulanmalı. **Doğru residual sorgusu**
  (sentezdeki ters-yön düzeltildi):
  ```sql
  SELECT count(*) FROM "DebtorAddress"
  WHERE "type" = 'DECLARED' AND ("isMernis" = true OR "addressType" IN ('MERNIS','IS','KEP'));
  ```
  Sonuç **0** ise tüm bilgi kanonik `type`'a yansımış → drop veri-açısından güvenli. (`type != 'DECLARED'` satırlarda
  kanonik zaten otoritedir; kayıp yok.) NOT: backfill prod'a uygulanmadı (migrate deploy ayrı; prod N/A) — bu yüzden
  sorgu **prod DB'de** koşulmalı. Dev DB neredeyse boş.
- **Sözleşme sıralaması:** DTO + frontend `addressType`/`isMernis` **göndermeye devam ediyor**. Kolon drop'u tek başına
  güvenli; DTO/frontend temizliği AYRI iştir. DTO tipi sıkılaştırılırsa `seed-sample-cases.ts` +
  `debtor-wizard-payload.test.ts` GÜNCELLEME gerektirir.

## 7. Explicit Non-Goals

Bu rapor salt-okuma envanterdir. Schema değişikliği YOK · migration YOK · kolon drop YOK · kod/DTO düzenlemesi YOK ·
UI değişikliği YOK · API contract değişikliği YOK · DB veri yazımı/backfill YOK · seed/fixture rewrite YOK ·
permission/RBAC YOK.

## 8. Recommended Next Gate + DECISION

**DECISION: `SCHEMA_PRESENT_BUT_APP_DEAD`**
Kolonlar şemada+DB'de mevcut; hiçbir canlı app yolu deprecated KOLONLARI okumaz/yazmaz (yazım kanıtla kesilmiş, okuma
kanonik `type`'a yönlendirilmiş). DTO/frontend yalnız taşıma-katmanı alanlarını kullanır (kolon değil), service intake'te
kanonikleşir. `ServiceHistory`/`Tebligat` `addressType` ayrı + aktiftir.

**Açık takip (drop'tan ÖNCE, sıralı):**
1. **RUNTIME-DB residual kontrolü** (yukarıdaki sorgu, **prod**) → `0` olmalı. Değilse `UNKNOWN_REQUIRES_RUNTIME_DB_CHECK`
   ve tek-seferlik tamamlayıcı backfill gerekir.
2. **AYRI gate — test/DTO taşıma:** `seed-sample-cases.ts` + `debtor-wizard-payload.test.ts` DTO-kullanımını kanonik
   alana taşı (`SAFE_TO_REMOVE_AFTER_TEST_UPDATE` niteliği yalnız DTO sıkılaştırması için geçerli).
3. **AYRI gate — Prisma kolon DROP migration** (additive değil; geri-alınamaz → 1. adım yeşil olmadan başlatılmaz).

**Bu PR'da temizlik yapılmaz.** Her biri ayrı, onaylı gate.

---

> **Kayıt:** Deprecated `DebtorAddress.addressType`/`isMernis` kolonları **app-ölü** (okuma/yazma kesilmiş, test-garantili).
> Aynı isimli DTO alanları ayrı bir aktif API sözleşmesidir ve bu temizlikle karışmaz. Güvenli kaldırma; (a) prod residual
> sorgusu, (b) ayrı DTO/test taşıması, (c) ayrı drop migration sırasını gerektirir. Karar: `SCHEMA_PRESENT_BUT_APP_DEAD`.

---

## 9. ADDR-1-FU — Residual run + refined decision (2026-06-25, main `a451058`)

ADDR-1 sonrası load-bearing dosyalar **değişmedi** (pickaxe: `isMernis`/`addressType` string'lerine dokunan tek commit ADDR-1'in kendi doc PR'ı `9bc2245`; yeni debtor/address kaynak dosyası yok) → §1-§8 birebir geçerli.

### 9.1. Residual run (read-only, tek DB; ayrı prod YOK)
§6'daki residual sorgusu (standalone read-only Prisma, parola `.env`'den, script silindi) bu deployment'ın tek DB'sinde koşuldu:

```
totalAddresses: 10 · isMernisTrue: 0 · addressTypeNotNull: 0
distinct addressType: {null: 10} · distinct canonical type: {DECLARED: 10}
residualUnderived (type='DECLARED' AND (isMernis=true OR addressType IN MERNIS/IS/KEP)): 0
```

**Sonuç: residual = 0.** Hiçbir adres deprecated kolonlarda kanonik `type`'a yansımamış bilgi taşımıyor. **Drop veri-açısından GÜVENLİ.** Caveat: 10 adres = küçük/test verisi; tek DB (ayrı prod yok) → bu deployment için ön-koşul karşılandı; gerçek üretim verisi oluşursa sorgu tekrar koşulmalı.

### 9.2. Refined finding — DB KOLONU ≠ DTO ALANI (önemli ayrım)
- **DB kolonları** `DebtorAddress.addressType`/`isMernis`: **app-ölü** (yazılmaz, okunmaz). DROP hedefi bunlardır.
- **DTO alanları** `CreateDebtorAddressDto.addressType` (**zorunlu**, `@IsEnum`) + `isMernis` (opsiyonel): **CANLI GİRDİ.** `mapAddressTypeToCanonical(dto.addressType, dto.isMernis)` (debtor.service.ts:38-46) bunları okuyup kanonik `type`/`source` **TÜRETİR**; `addAddress`/`updateAddress`/`reportAddresses` bunları girdi alır (sonra `_at/_im` ile kolona-yazımdan dışlar). → DTO alanları **ölü taşıma değil; birincil adres-tipi girdi sözleşmesidir.**

**Düzeltme (ADDR-1 §6'ya göre):** "(b) DTO/test taşıma" **dead-field removal DEĞİL** → frontend'i kanonik `type`/`source` girdisine taşıyan **canlı girdi-sözleşmesi + UX migrasyonu**. İşlevsel fayda düşük (mevcut akış doğru çalışıyor; yalnız adlandırma "deprecated"). **Öneri: DTO girdi sözleşmesi OLDUĞU GİBİ bırakılabilir; gerçek dead-cleanup hedefi yalnız DB kolonlarıdır.**

### 9.3. Gate durumları (güncel)
1. **Prod-residual ön-koşulu:** ✅ KARŞILANDI (residual=0, bu deployment).
2. **DB kolon DROP gate** (gerçek temizlik): schema.prisma'dan 2 `@deprecated` alan kaldırma + `ALTER TABLE "DebtorAddress" DROP COLUMN "addressType", DROP COLUMN "isMernis"` migration + `debtor-address-canonical.spec` kolon-assertion güncellemesi. **BLOKER:** uygulama `prisma migrate*` gerektirir → settings.json **deny-list'te** + geri-alınamaz şema değişikliği + psql yok. → **owner-run veya açık deny-lift + onay gerekir** (Claude auto-uygulayamaz). Migration SQL hazırlanabilir.
3. **DTO girdi-sözleşmesi migrasyonu** (eski (b)): canlı girdi + UX değişikliği → düşük-fayda, ayrı tasarım gate; **opsiyonel, önerilmez** (bırakılabilir).

**Net:** ADDR-1'in app-dead kararı + residual=0 ile DB kolonları **drop'a hazır**; tek engel `prisma migrate` deny-list'i + geri-alınamazlık (owner aksiyonu). DTO "temizliği" gereksiz/opsiyonel olarak yeniden sınıflandı. Bu FU'da yine kod/migration/schema/DB-write YOK.
