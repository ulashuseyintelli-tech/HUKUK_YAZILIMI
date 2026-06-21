# ALACAK-SEMANTIC-DECISION

Durum: Karar kaydi

Kapsam: Bu dokuman kod davranisi degistirmez. ClaimItem faiz kalemlerinin kanonik hukuki/mali anlamini sabitler. Sonraki davranis PR'lari bu karar zeminini referans alarak yapilacaktir.

## Problem

ClaimItem faiz kalemleri bugun iki farkli anlam arasinda belirsiz kalabiliyor:

- Faiz hesaplama konfigürasyonu: hangi faiz turu, oran ve baslangic/bitis tarihi ile faiz hesaplanacak?
- Takipte talep edilen islemis faiz alacagi: takip oncesinde zaten islemis ve tutar olarak talep edilen faiz var mi?

Bu iki anlam ayni ClaimItem tipinde veya ayni alan setinde temsil edilirse canonical balance cutover sirasinda iki risk ortaya cikar:

- `PRE_INTEREST`/`INTEREST` tutari hesaba hic girmeyebilir ve bakiye eksik hesaplanir.
- Ayni faiz hem explicit tutar olarak hem de `PRINCIPAL` uzerinden yeniden hesaplanarak cift sayilabilir.

## Kanonik Kararlar

### 1. Asil Alacak

Kanonik kaynak: `ClaimItem.itemType = PRINCIPAL`

Anlami:

- `PRINCIPAL.amount` / `PRINCIPAL.demandedAmount` asil alacaktir.
- `PRINCIPAL` uzerindeki `interestType`, `interestRate`, `interestStartDate`, `interestEndDate` faiz hesaplama konfigürasyonudur.
- Takip sonrasi faiz `computeCaseBalance` / `interest-engine` tarafindan `PRINCIPAL` kalemleri uzerinden hesaplanir.

### 2. Takip Oncesi Islemis Faiz

Kanonik kaynak: `ClaimItem.itemType = PRE_INTEREST`

Anlami:

- `PRE_INTEREST.amount` / `PRE_INTEREST.demandedAmount` takip oncesi islemis faiz alacagidir.
- `PRE_INTEREST` faiz konfigürasyonu degildir.
- Canonical balance hedef davranisinda `PRE_INTEREST` tutari `totalDue` icine ayri alacak kalemi olarak dahil edilmelidir.
- `PRE_INTEREST` tutari, `PRINCIPAL` uzerindeki faiz konfigürasyonundan yeniden hesaplanmamali ve cift sayilmamalidir.

### 3. Legacy/Ambiguous INTEREST

Kanonik karar: `ClaimItem.itemType = INTEREST` legacy/ambiguous alias olarak kabul edilir.

Anlami:

- Eski kayitlarda `INTEREST` hem faiz konfigürasyonu hem de islemis faiz tutari anlaminda kullanilmis olabilir.
- Eski kayitlarin otomatik `PRE_INTEREST` olarak normalize edilmesi risklidir ve ayri migration/backfill karari gerektirir.
- Yeni veri girisinde `INTEREST` kullanilmamalidir.
- Yeni giris akislari kullaniciyi acik `PRE_INTEREST` semantigine yonlendirmeli veya `INTEREST` girisini validation ile engellemelidir.

### 4. Takip Sonrasi Faiz

Kanonik kaynak: `computeCaseBalance` / `interest-engine` ciktisi

Anlami:

- `POST_INTEREST` kullanici tarafindan girilen kalici `ClaimItem` olmamalidir.
- Takip sonrasi faiz, `PRINCIPAL` faiz konfigürasyonu ile engine tarafindan hesaplanan ciktidir.
- Takip sonrasi faiz kalicilastirilacaksa `ClaimItem` input'u olarak degil, ayri snapshot/output modeli veya virtual output olarak ele alinmalidir.

## Mevcut Davranis

Mevcut canonical balance davranisi:

- `INTEREST`, `PRE_INTEREST`, `POST_INTEREST` ayni classifier kategorisine indirgenir.
- `claim-bucket-assembler` bu kategoriyi canonical claim bucket disinda birakir.
- `computeCaseBalance` engine'e sadece `PRINCIPAL` claim bucket'larini gonderir.
- Explicit `INTEREST` amount canonical `totalDue` icinde talep edilmis islemis faiz olarak sayilmaz.
- Configsiz tek `PRINCIPAL` varsa explicit `INTEREST` kalemindeki faiz konfigürasyonu fallback olarak kullanilabilir.

Kanıt dosyalari:

- `project/apps/api/prisma/schema.prisma` - `ClaimItemType` enum: `PRINCIPAL`, `INTEREST`, `PRE_INTEREST`, `POST_INTEREST`.
- `project/apps/api/src/modules/interest-engine/classification/claim-item-classifier.ts` - `INTEREST/PRE_INTEREST/POST_INTEREST` ayni kategoriye siniflandirilir.
- `project/apps/api/src/modules/interest-engine/assembler/claim-bucket-assembler.ts` - bu kategori bucket disi birakilir.
- `project/apps/api/src/modules/interest-engine/orchestration/case-balance.service.ts` - engine'e assembler'dan gelen bucket'lar gonderilir.
- `project/apps/api/src/modules/interest-engine/orchestration/__tests__/case-balance.service.spec.ts` - #286 sonrasi explicit `INTEREST` amount'in ayri claim bucket olarak gitmedigi testle sabitlenmistir.

## Hedef Davranis

Hedef canonical balance davranisi:

- `PRINCIPAL` asil alacak ve takip sonrasi faiz hesaplama konfigürasyonunu tasir.
- `PRE_INTEREST` takip oncesi islemis faiz tutari olarak `totalDue` icine dahil edilir.
- `PRE_INTEREST` faiz hesaplama konfigürasyonu gibi kullanilmaz.
- `INTEREST` yeni giriste kullanilmaz; kullanici `PRE_INTEREST`e yonlendirilir veya giris validation ile engellenir.
- Legacy `INTEREST` kayitlarinin nasil ele alinacagi ayri migration/backfill ve drift olcumu karariyla belirlenir.
- `POST_INTEREST` kalici input `ClaimItem` degildir; engine ciktisi, snapshot veya virtual output olarak ayrilir.

## PR-ALACAK-4B Davranis Degisikligi Plani

PR-ALACAK-4B bu dokumandan sonra acilacak davranis PR'idir. Onerilen kapsam:

- `claim-bucket-assembler` semantigini ayir:
  - `PRINCIPAL` -> faiz hesaplanacak claim bucket.
  - `PRE_INTEREST` -> takip oncesi islemis faiz tutari.
  - `INTEREST` -> yeni giriste reject/diagnostic; legacy davranis ayrica karara baglanir.
  - `POST_INTEREST` -> input olarak reject/diagnostic veya canonical bucket disi output-only semantik.
- `computeCaseBalance` toplaminda `PRE_INTEREST.demandedAmount ?? PRE_INTEREST.amount` tutarini `totalDue` icine dahil et.
- `PRE_INTEREST` tutarinin `PRINCIPAL` faizinden yeniden hesaplanmadigini testle garanti et.
- `INTEREST` config fallback davranisini kaldirma/deprecate etme veya sadece legacy-compat olarak tutma kararini testle sabitle.
- `summary-engine/getCalculationSummary` eski okuyucu oldugu icin canonical cutover oncesi ayri PR/forensic konusu olarak isaretle.

## Riskler

### Double-count

`PRE_INTEREST` hem explicit amount olarak hem de `PRINCIPAL` uzerinden yeniden hesaplanmis faiz gibi sayilirsa faiz iki kez bakiyeye girer.

### Undercount

`PRE_INTEREST.amount` canonical `totalDue` icine dahil edilmezse takip oncesi islemis faiz eksik hesaplanir.

### Legacy INTEREST

Eski `INTEREST` kayitlari otomatik `PRE_INTEREST` kabul edilirse hatali normalize edilebilir. Bu nedenle eski veri icin otomatik normalize bu dokumanin kapsami disindadir; ayri drift olcumu, migration/backfill ve hukuk/muhasebe onayi gerekir.

### POST_INTEREST ClaimItem Kullanimi

`POST_INTEREST` kullanici girdisi olarak kalirsa motorun hesapladigi takip sonrasi faiz ile elle girilen kalem cakisir. Kalicilastirma ihtiyaci varsa `ClaimItem` input'u yerine snapshot/output modeli tasarlanmalidir.

### Eski Okuyucular

`summary-engine/getCalculationSummary` gibi eski okuyucular `INTEREST/PRE_INTEREST/POST_INTEREST` kalemlerini farkli sekilde ele alabilir. Cutover oncesinde canonical balance ile eski okuyucular arasindaki fark shadow compare ile olculmelidir.

## Acceptance Criteria

- `PRE_INTEREST.amount` / `PRE_INTEREST.demandedAmount` canonical `totalDue` icine dahil edilir.
- `PRINCIPAL` uzerindeki faiz alanlari takip sonrasi/hesaplanacak faiz konfigürasyonu olarak kullanilir.
- Explicit `INTEREST` amount legacy alias olarak acik kurala baglanir veya yeni giriste engellenir.
- Eski `INTEREST` kayitlari icin otomatik normalize ayri migration/backfill karari olmadan yapilmaz.
- `POST_INTEREST` yeni claim item girisi olarak engellenir veya sadece motor ciktisi/snapshot/virtual output olarak ayrilir.
- `computeCaseBalance` ve `summary-engine/getCalculationSummary` semantik farki cutover oncesi acikca raporlanir.

## Multitenant ve Etki Alani

Bu dokuman tenant verisine, tenant guard'lara veya runtime sorgulara dokunmaz.

Sonraki davranis PR'larinda `CaseBalanceService.computeCaseBalance(tenantId, caseId, ...)` hatti tenant-scoped kalmali; `tenantId + caseId` filtresi gevsetilmemelidir.

Bu dokumanin dogrudan etki alani:

- `docs/alacak-semantic-decision.md`

Bu dokumanin davranis degisikligi yoktur; kod, test, schema, migration, UI, OCR/cek/A1, Collection/Ledger ve `getCalculationSummary` kapsam disidir.
