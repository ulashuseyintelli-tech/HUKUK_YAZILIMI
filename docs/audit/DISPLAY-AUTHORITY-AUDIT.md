# Display Authority Audit — Canonical Balance Cutover Preparation

## 1. Status

Audit completed / no cutover in this PR.

Bu dokuman yalniz statik audit ve cutover hazirligi kaydidir. Production kodu, test, schema, API sozlesmesi veya UI davranisi degistirilmemistir.

## 2. Scope

Bu audit su soruya cevap verir: takip bakiyesi ve hesap ozeti ekranda hangi kaynakla gosteriliyor; bu kaynak canonical `computeBalance` mi, legacy `calculation-summary` mi, `ClaimItem`/`Collection` toplamlari mi, yoksa UI local hesap mi?

Kapsam disi:

- UI cutover yapmak.
- `computeBalance`, `summary-engine`, `calculation-summary`, TBK100 allocation veya overpayment guard kodunu degistirmek.
- PaymentDesignation implementasyonuna baslamak.
- DB schema/migration eklemek.
- ClaimItem refactor'u veya BalanceComponent writable SoT tablosu eklemek.

## 3. Background

#404 overpayment guard fix main'e indi. #414 scheduler nafaka type fix main'e indi. Siradaki risk, bu yeni dogrularin UI'da hangi otoriteyle temsil edilecegidir.

Bu auditin ana varsayimi: tahsilat evraka degil takip/dosya bakiyesine uygulanir. Cek, senet, fatura, ilam gibi kayitlar alacagin dayanagi olabilir; display authority ise takip bakiyesinin tek ve tutarli kaynagini gostermelidir.

## 4. Executive finding

Canli dosya detayindaki `HesapOzetiPanel` icin mevcut display authority `computeBalance` degil, legacy `GET /cases/:id/calculation-summary` hattidir.

Canonical hat mevcuttur ama canli panelin otoritesi degildir:

- `CaseBalanceService.computeCaseBalance()` canonical adayidir; read-only ve tenant-scoped calisir.
- `GET /interest-engine/case/:caseId/balance` ham canonical sonucu doner.
- `GET /interest-engine/case/:caseId/balance/display` panel-facing DTO adaptoru olarak mevcuttur.
- `CaseService.getCalculationSummary()` sadece `canonicalShadow` diagnostic'i ekler; UI bu shadow sonucu gostermiyor.

Bu nedenle kor cutover yasaktir. Once tek display authority secilmeli; sonra legacy `calculation-summary`, summary-engine, `ClaimItem.collectedAmount`, collection totals, ledger allocation ve masraf bakiyesi alanlari ayni panelde birbirine karistirilmamalidir.

## 5. Backend authority map

| Backend kaynak | Mevcut rol | Kanit | Hukum |
|---|---|---|---|
| `CaseController.getCalculationSummary()` | Legacy hesap ozeti endpoint'i | `project/apps/api/src/modules/case/case.controller.ts:615` | Canli panel authority'si burada basliyor. |
| `CaseService.getCalculationSummary()` | Legacy hesaplama + canonical shadow | `project/apps/api/src/modules/case/case.service.ts:3624`, `project/apps/api/src/modules/case/case.service.ts:3763` | Display sonucu legacy; canonical sadece diagnostic. |
| `CaseBalanceService.computeCaseBalance()` | Canonical aday | `project/apps/api/src/modules/interest-engine/orchestration/case-balance.service.ts:136` | Read-only engine, canli UI authority degil. |
| `GET /interest-engine/case/:caseId/balance` | Ham canonical endpoint | `project/apps/api/src/modules/interest-engine/interest-engine.controller.ts:118` | Arac/gozlem endpoint'i; panel sozlesmesi degil. |
| `GET /interest-engine/case/:caseId/balance/display` | Canonical display DTO adayi | `project/apps/api/src/modules/interest-engine/interest-engine.controller.ts:147`, `project/apps/api/src/modules/interest-engine/orchestration/case-balance-display.ts:2` | Cutover hedefi olabilir; UI henuz tuketmiyor. |
| `SummaryEngineService.calculateSummary()` | Incumbent summary-engine / shadow compare tarafi | `project/apps/api/src/modules/summary-engine/summary-engine.service.ts:280` | ClaimItem tabanli ayri ozet motoru; canli `HesapOzetiPanel` kaynagi degil. |
| `CollectionService.getCollectedBreakdown()` | Mahsup kirilimi okuma guard'i | `project/apps/api/src/modules/collection/collection.service.ts:923` | Ledger varsa ledger-only, yoksa compat fallback. |
| `/cases/:caseId/balance` | Masraf bakiyesi | `project/apps/web/src/lib/api.ts:2133`, `project/apps/api/prisma/schema.prisma:5317` | Alacak/tahsilat borc bakiyesi degil; cutover hedefi sanilmamali. |

## 6. Frontend consumer map

| Frontend yuzey | Mevcut rol | Kanit | Hukum |
|---|---|---|---|
| `HesapOzetiPanel` | Canli dosya detay hesap ozeti | `project/apps/web/src/components/finance/HesapOzetiPanel.tsx:56` | `useCaseCalculation` hook'unu tuketiyor. |
| Case detail page | Panel mount noktasi | `project/apps/web/src/app/(dashboard)/cases/[id]/page.tsx:2662` | Sag panelde `HesapOzetiPanel` canli. |
| `useCaseCalculation` | Panel data hook'u | `project/apps/web/src/hooks/useCaseCalculation.ts:135` | `/cases/:id/calculation-summary` tek canli kaynagi. |
| Web API summary-engine client | Alternatif API client metodu | `project/apps/web/src/lib/api.ts:1596` | API client var; canli panel authority oldugu kanitlanmadi. |
| Web expense balance client | Masraf bakiyesi client metodu | `project/apps/web/src/lib/api.ts:2133` | Isim benzerligi nedeniyle alacak bakiyesiyle karistirilma riski var. |

## 7. calculation-summary usage

`HesapOzetiPanel` bugun `useCaseCalculation` uzerinden `GET /cases/:id/calculation-summary` sonucunu gosterir. `case.controller.ts` yorumlari faiz, masraf ve vekalet ucretini engine source of truth gibi anlatsa da servis icinde faiz alanlari stub durumundadir:

- `takipOncesiFaiz = 0`
- `takipSonrasiFaiz = 0`
- `faizSegmentleri = []`

Kanit: `project/apps/api/src/modules/case/case.service.ts:3663`.

Tahsilat ise aktif `Collection` toplami olarak dusulur (`project/apps/api/src/modules/case/case.service.ts:3704`). Bu, panelin bugun canonical faiz/mahsup sonucu gostermedigi anlamina gelir.

## 8. computeBalance usage

`computeBalance` read-only canonical adaydir. Case, ClaimItem, LedgerEntry ve Collection okumalarini tenant scoped yapar; payments tarafinda ledger varsa collection fallback'i kullanmaz.

Kanit:

- `project/apps/api/src/modules/interest-engine/orchestration/case-balance.service.ts:136`
- `project/apps/api/src/modules/interest-engine/calc-prep/payment-mapper.ts:5`

Ancak `computeBalance` canli UI authority degildir. `calculation-summary` icinde `canonicalShadow` olarak kullanilir; UI bu shadow'u render etmez.

## 9. HesapOzetiPanel and UI balance source

Canli `HesapOzetiPanel` legacy DTO alanlarini render eder: `asilAlacak`, `takipOncesiFaiz`, `takipSonrasiFaiz`, `toplamBorc`, `sonBorc`, `toplamTahsilat`, `kalanBorc`, `mahsupDetaylari`, `faizSegmentleri`.

Bu alanlar `CaseBalanceDisplay` DTO'sundan gelmez. Panelde `balance/display` tuketimi yoktur. Bu PR'da UI cutover yapilmamistir.

## 10. faiz=0 / interest stub audit

RED bulgu: legacy `calculation-summary` faiz alanlarini 0/empty donuyor. Kullanici bunu gercek hesaplanmis faiz gibi gorurse yanlis bakiye algisi olusur.

Canonical display DTO daha durustur: `interest = totalInterest`, `claimRemaining = totalDue` der; standalone kalan anapara expose etmez. Bunun nedeni engine sonucunda `finalDebtStates` tasinmamasi ve `totalDue - totalInterest` hesabinin guvensiz olmasidir (`project/apps/api/src/modules/interest-engine/orchestration/case-balance-display.ts:7`).

## 11. ClaimItem semantic contamination

`ClaimItem` hem alacak kalemi girdisi hem de tahsilat projection alanlari tasiyor:

- `originalAmount`, `demandedAmount`, `collectedAmount` ayni modelde (`project/apps/api/prisma/schema.prisma:4327`).
- `LedgerAllocation.claimItemId` halen ClaimItem'a bagli (`project/apps/api/prisma/schema.prisma:4443`).
- `SummaryEngineService.allocatePaymentToLedgerInTx()` ledger allocation yazdiktan sonra `ClaimItem.collectedAmount` increment ediyor (`project/apps/api/src/modules/summary-engine/summary-engine.service.ts:662`).

C modeli acisindan bu temiz degil. Ancak Phase 3 display cutover, ClaimItem semantik temizligini ayni PR'da cozmeye calismamalidir.

## 12. Overpayment display authority

`CollectionOverpayment` borcu negatife indirmeyen ayri projection'dir (`project/apps/api/prisma/schema.prisma:2103`). Display cutover, overpayment'i `claimRemaining < 0` gibi gostermemelidir.

Fazla tahsilat emanet/iade/virman statulerinde ayri satir veya ayri blok olarak tasarlanmalidir. PaymentDesignation gelmeden restricted/earmarked payment'lar unrestricted overpayment gibi sunulmamalidir.

## 13. Nafaka scheduler effect

`DueType.NAFAKA` bilincli olarak ClaimItem'a materialize edilmiyor (`project/apps/api/src/modules/case/due-to-claim-item.mapper.ts:31`). Scheduler yeni nafaka donemini `DueType.NAFAKA` yaziyor (`project/apps/api/src/modules/scheduler/scheduler.service.ts:210`).

Display cutover, nafakayi "PRINCIPAL ClaimItem yoksa borc yok" diye yorumlamamalidir. PeriodicObligation/periodKey modeli gelene kadar nafaka Due-only takvim sinyali olarak kalir; alacak bakiyesi authority'siyle karistirilmamalidir.

## 14. Risk matrix

| ID | Risk | Seviye | Hukum |
|---|---|---|---|
| R1 | Canli `HesapOzetiPanel` legacy `calculation-summary` hattinda | RED | Primary display authority canonical degil. |
| R2 | Legacy faiz alanlari 0/empty stub | RED | Gercek faiz gibi gorunurse hukuki/finansal yanlislik uretir. |
| R3 | `ClaimItem.collectedAmount` bakiye gercegi gibi yorumlanabilir | RED | Dayanak/alacak kalemi ile projection semantigi karisiyor. |
| R4 | Collection total, LedgerAllocation, CollectionAllocation ve summary-engine birlikte authority gibi davranabilir | RED | Cift sayim veya farkli bakiye algisi riski. |
| R5 | Overpayment ayri HELD/projection olarak gosterilmezse borc negatif/eksik algilanabilir | RED | Fazla tahsilat borca mahsup edilmeyen ayri durumdur. |
| R6 | `computeBalance` ve `balance/display` var ama canli UI authority degil | YELLOW | Cutover gap; dogru hedef var ama devrede degil. |
| R7 | `/cases/:caseId/balance` masraf bakiyesi isim olarak alacak bakiyesiyle karisabilir | YELLOW | Yanlis endpoint hedeflenebilir. |
| R8 | NAFAKA Due-only ayrimi display katmaninda principal gibi yorumlanabilir | YELLOW | Scheduler fix var; display sozlesmesi ayrica korunmali. |
| R9 | Costs/ancillaries case-level projection, currency split degil | YELLOW | Multi-currency panelde yanlis toplam riski. |
| R10 | Shadow compare divergence beklenen bir durum | YELLOW | Match beklentisiyle blind cutover yapilmamali. |
| R11 | `CaseBalanceDisplay` kalan anapara uydurmuyor | GREEN | Guvenli display siniri var. |
| R12 | Payment mapper ledger-varsa-ledger / yoksa-collection guard'i tasiyor | GREEN | Canonical payment source cift sayim guard'i var. |
| R13 | Collection breakdown ledger-only/fallback guard'i tasiyor | GREEN | Compat CollectionAllocation ile ledger birlikte toplanmiyor. |
| R14 | `finalDebtStates` expose edilmemis | UNKNOWN_NEEDS_FOLLOWUP | Kalan anapara gibi satirlar icin ayri engine contract gerekebilir. |
| R15 | Overpayment'in nihai UI yuzeyi belirlenmemis | UNKNOWN_NEEDS_FOLLOWUP | Ayri projection olarak nasil gosterilecegi tasarlanmali. |

Sayim:

- RED: 5
- YELLOW: 5
- GREEN: 3
- UNKNOWN_NEEDS_FOLLOWUP: 2

En kritik 5 risk:

1. Canli `HesapOzetiPanel` legacy `calculation-summary` hattinda.
2. Faiz alanlari legacy hatta 0/empty stub olarak donuyor.
3. `ClaimItem.collectedAmount` hukuki bakiye gibi yorumlanabilir.
4. Collection totals / LedgerAllocation / CollectionAllocation / summary-engine farkli otoriteler gibi davranabilir.
5. Overpayment ayri HELD projection olarak gosterilmezse yanlis bakiye algisi olusur.

## 15. Cutover blockers

- `HesapOzetiPanel` henuz `balance/display` sozlesmesini tuketmiyor.
- `calculation-summary` faiz stub'lari panelde kullaniliyor.
- `finalDebtStates` yokken kalan anapara satiri guvenle gosterilemiyor.
- Overpayment UI sozlesmesi ayri projection olarak netlesmemis.
- Multi-currency icin `costs/ancillaries` case-level projection davranisi net UI metnine/teste baglanmamis.
- PaymentDesignation yokken restricted payment sinyalleri unrestricted bakiye gibi sunulamaz.
- Legacy ve canonical degerler ayni ekranda sessizce karistirilamaz.

## 16. Proposed cutover sequence

1. Backend display contract hardening.
2. Shadow evidence / legacy-vs-canonical diff.
3. UI opt-in shadow display.
4. Primary display cutover.
5. Legacy authority label/removal cleanup.

Detay:

- Backend contract PR'i `balance/display` icin tenant, payment source, skipped state, multi-currency ve no-fake-principal testlerini genisletmeli.
- Shadow evidence PR'i genel ilamsiz, kambiyo, kira, nafaka, ilam, fatura, rehin/ipotek, multi-currency ve fazla tahsilat fixture'lariyla delta uretmeli.
- UI opt-in PR'i legacy ve canonical degerleri ayni toplamda birlestirmemeli; sadece diagnostic olarak gostermeli.
- Primary cutover PR'i ancak avukat/urun sign-off ve regression gate sonrasi gelmeli.

## 17. No-fix list for this PR

- UI cutover yok.
- API endpoint degisikligi yok.
- Production/test/schema degisikligi yok.
- `computeBalance`, `summary-engine`, `calculation-summary`, TBK100 allocation degisikligi yok.
- PaymentDesignation implementasyonu yok.
- Overpayment #404 guard koduna dokunma yok.
- Scheduler nafaka #414 koduna dokunma yok.
- calc-preview / interest-engine / Prisma generated-client typecheck borcu yok.

## 18. Appendix / grep evidence

Calistirilan ana arama eksenleri:

```text
rg -n "calculation-summary|calculationSummary|calculation summary" project
rg -n "computeBalance|finalDebtStates|debtStates|canonical balance|balance projection" project
rg -n "HesapOzetiPanel|Hesap Özeti|hesap özeti|hesapOzeti|ozet|summary" project
rg -n "ClaimItem|claimItem|collectedAmount|remainingAmount|demandedAmount|originalAmount" project
rg -n "faiz.*0|interest.*0|0.*faiz|stub|placeholder|TODO.*interest|TODO.*faiz" project
rg -n "overpayment|OVERPAYMENT|HELD|fazla tahsilat|fazla" project
rg -n "LedgerEntry|LedgerAllocation|allocation|allocatedAmount|payment application" project
rg -n "DueType|NAFAKA|PRINCIPAL|dueType" project
rg -n "useQuery|fetch.*summary|axios.*summary|client.*summary" project
```

Temel kanit dosyalari:

- `project/apps/web/src/components/finance/HesapOzetiPanel.tsx`
- `project/apps/web/src/hooks/useCaseCalculation.ts`
- `project/apps/api/src/modules/case/case.controller.ts`
- `project/apps/api/src/modules/case/case.service.ts`
- `project/apps/api/src/modules/interest-engine/orchestration/case-balance.service.ts`
- `project/apps/api/src/modules/interest-engine/orchestration/case-balance-display.ts`
- `project/apps/api/src/modules/summary-engine/summary-engine.service.ts`
- `project/apps/api/src/modules/collection/collection.service.ts`
- `project/apps/api/prisma/schema.prisma`

## 19. Son karar

Cutover icin en dogru hedef mevcut durumda `computeBalance` ham sonucu degil, `CaseBalanceDisplay` DTO sozlesmesidir. Ancak bu sozlesme bile bugun canli UI authority degildir ve bazi alanlari bilincli olarak expose etmez.

Bu nedenle sonraki PR dogrudan UI cutover olmamalidir. Once backend display contract testleri ve shadow evidence gate'i gelmelidir. UI cutover ancak bu kanitlardan sonra yapilmalidir.
