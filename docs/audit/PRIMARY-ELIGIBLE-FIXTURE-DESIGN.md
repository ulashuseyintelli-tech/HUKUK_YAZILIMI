# Primary Eligible Fixture Design Audit

## 1. Current Readiness State

Bu dokumanin karari iki katmanlidir:

- Guarded primary hattinin guvenlik frenleri buyuk olcude calisiyor.
- Ilk gercek `primary-eligible` fixture henuz tanimli ve kanitli degil.

Guncel operasyon karari:

```text
Readiness: READY_WITH_MINOR_FOLLOW_UPS
Global primary cutover: NO-GO
Production flag: OFF
Legacy calculation-summary fallback: REQUIRED
```

Canli browser bulgusu dogru sekilde su isimle kaydedilmelidir:

```text
flag OFF / legacy fallback browser evidence
```

Bulguyu fazla buyutmemek gerekir:

```text
NEXT_PUBLIC_BALANCE_SHADOW_DISPLAY=false iken URL opt-in tek başına shadow hattını aktive etmiyor.
```

Bu bulgu `shadow opt-in verified` demek degildir. Sadece default/flag OFF kosulunda UI'nin legacy `calculation-summary` kaynagini kullanmaya devam ettigini gosterir.

Kaynak kanitlari:

| Kaynak | Bulgu |
| --- | --- |
| `project/apps/web/src/lib/config/feature-flags.ts` | Shadow ve guarded primary feature flag'leri env ile acilir; default kapali davranis guvenli fallback tasir. |
| `project/apps/web/src/lib/guarded-primary-display.ts` | Guarded primary pilot sadece flag acik ve URL opt-in kosulu ile degerlendirilir. |
| Canli browser Network gozlemi | `calculation-summary`, `collections`, `dues` 200; `balance/display` ve `shadow-diff` cagrilmadi. |
| `project/apps/web/src/components/finance/BalanceShadowDiffPanel.tsx` | Shadow panel bilgilendirme/denetim gorunumudur; primary display kaynagini otomatik degistirmez. |

Sonuc: Sistem bug arama fazindan fixture tasarim fazina gecmeye hazir, fakat primary cutover icin hazir degil.

## 2. Current Data Flow

Bugunku varsayilan kullanici akisi hala legacy hesap ozeti uzerindedir.

```text
Case detail UI
  -> HesapOzetiPanel
  -> useCaseCalculation
  -> GET /cases/:caseId/calculation-summary
  -> legacy calculation-summary primary UI source
```

Shadow/canonical gozlem akisi ayridir:

```text
Case detail UI
  -> BalanceShadowDiffPanel, flag/opt-in varsa
  -> useBalanceShadowDiff
  -> GET /interest-engine/case/:caseId/balance/display/shadow-diff
  -> legacy vs canonical shadow evidence
```

Backend canonical display akisi:

```text
BalanceDisplayShadowDiffService.compare()
  -> CaseService.getCalculationSummary()
  -> CaseBalanceService.computeCaseBalance()
  -> toCaseBalanceDisplay()
  -> cutoverReadiness
```

Kaynak kanitlari:

| Kaynak | Bulgu |
| --- | --- |
| `project/apps/web/src/hooks/useCaseCalculation.ts` | Hesap ozeti legacy `/cases/:caseId/calculation-summary` endpointinden beslenir. |
| `project/apps/web/src/hooks/useBalanceShadowDiff.ts` | Shadow diff sadece etkinlesmis kosulda shadow endpointini cagirir. |
| `project/apps/api/src/modules/balance-display-shadow-diff/balance-display-shadow-diff.service.ts` | Aynı tenant/case/date baglaminda legacy summary ve canonical display yan yana uretilir. |
| `project/apps/api/src/modules/interest-engine/orchestration/case-balance.service.ts` | Canonical hesap tenant/case scoped case, claimItems, ledgerEntry, collection ve overpayment okumalarindan uretilir. |

Bu ayrim korunmalidir. Fixture tasarimi shadow evidence uretmeli, default UI kaynagini sessizce degistirmemelidir.

## 3. Primary Eligibility Decision Point

Primary eligibility iki karar noktasinda sekillenir.

Backend karar noktasi:

```text
BalanceDisplayShadowDiffService.cutoverReadiness.safeForPrimaryDisplay
```

Frontend karar noktasi:

```text
evaluateGuardedPrimaryDisplayPilot(report, policy)
```

Backend tarafinda `safeForPrimaryDisplay=true` olmasi icin shadow report icinde blocker kodu kalmamalidir. Bu, sadece amount diff sifir demek degildir. Context, currency, source availability, finalDebtStates, ClaimItem authority riski, overpayment ve unsupported senaryolar da engel olabilir.

Frontend tarafinda `CANONICAL_PRIMARY_CANDIDATE` ancak su durumda doner:

- Guarded primary feature flag acik.
- URL opt-in kosulu saglanmis.
- Shadow/canonical report mevcut.
- Source failure yok.
- `report.provenance.finalDebtStatesAvailable=true`.
- Report comparable.
- Top-level currency guvenli.
- ClaimItem collected/remaining authority contaminasyonu yok.
- Canonical principal amounts mevcut.
- Hard no-go diagnostic kodlari yok.

Kaynak kanitlari:

| Kaynak | Bulgu |
| --- | --- |
| `project/apps/web/src/lib/guarded-primary-display.ts::shouldEnableGuardedPrimaryDisplayPilot()` | Flag kapaliysa URL opt-in tek basina primary davranis acmaz. |
| `project/apps/web/src/lib/guarded-primary-display.ts::evaluateGuardedPrimaryDisplayPilot()` | Reason code yoksa `CANONICAL_PRIMARY_CANDIDATE`, aksi halde legacy fallback secilir. |
| `project/apps/web/src/lib/guarded-primary-display.ts::canonicalPrimaryAmounts()` | Canonical principal icin displayable PRINCIPAL bucket, finite principal, totalDebt ve outstanding gerekir. |
| `project/apps/api/src/modules/balance-display-shadow-diff/balance-display-shadow-diff.service.ts::buildCutoverReadiness()` | Backend `safeForPrimaryDisplay` blocker listesi bos oldugunda true olur. |

Kritik not: Guncel backend display adapter `CLAIM_ITEM_COLLECTED_AMOUNT_NOT_AUTHORITY` diagnostic'ini bilgi/uyari olarak surekli uretiyor ve shadow readiness bunu blocker listesine tasiyor. Bu nedenle gercek backend report'unda `safeForPrimaryDisplay=true` uretmek, sadece veri fixture'i ile garanti olmayabilir; ClaimItem contamination sinyalinin gercek contamination ile genel uyari arasinda ayrilmasi icin ayrica sign-off gerekir.

## 4. Blocker Taxonomy

| Blocker | Tip | Kaynak | Anlam | Fixture ile nasil kapanir? |
| --- | --- | --- | --- | --- |
| `FINAL_DEBT_STATES_MISSING` | Canonical contract | `toCaseBalanceDisplay()` | Canonical principal/outstanding authority yok. | En az bir gecerli claim bucket uretip `computeBalance()` sonucunda `finalDebtStates` olusmasi gerekir. |
| `FINAL_DEBT_STATES_CURRENCY_MISMATCH` | Canonical contract | `toCaseBalanceDisplay()` | finalDebtStates currency ile display currency uyumsuz. | Fixture tek currency, tercihen TRY, olmali; claim/payment/overpayment currency dagilmamali. |
| `CURRENCY_MISMATCH` | Shadow comparability | `BalanceDisplayShadowDiffService.buildComparability()` | Legacy ve canonical currency karsilastirilamaz. | Legacy summary ve canonical display ayni currency uretmeli. |
| `CONTEXT_MISMATCH` | Shadow comparability | `BalanceDisplayShadowDiffService.buildComparability()` | tenant/case context uyumsuz. | Tenant ve caseId tum source'larda ayni olmali; cross-tenant/cross-case veri yok. |
| `CANONICAL_CURRENCY_UNSAFE` | Canonical display | `BalanceDisplayShadowDiffService.buildComparability()` | Canonical top-level currency `MULTI`, `UNKNOWN` veya null. | Ilk fixture tek currency olmalı. |
| `MULTI_CURRENCY_DISPLAY_UNSAFE` | Canonical display | `toCaseBalanceDisplay()` | Multi/unknown currency primary display icin guvensiz. | Multi-currency fixture ilk pilot degil. |
| `CLAIM_ITEM_COLLECTED_AMOUNT_NOT_AUTHORITY` | Authority risk | `toCaseBalanceDisplay()` ve shadow readiness | ClaimItem collected/remaining display authority sayilamaz. | Veriyle tamamen kapanmaz; current code bilgi diagnostic'ini blocker'a tasiyor. Gercek contamination yoklugu ile genel uyari ayrilmali. |
| `CLAIM_ITEM_AUTHORITY_CONTAMINATION` | Frontend policy | `evaluateGuardedPrimaryDisplayPilot()` | Report ClaimItem collected amount'u authority olarak isaretliyor. | `provenance.claimItemCollectedAmountUsedAsAuthority=false` kalmali. |
| `OVERPAYMENT_BLOCKED` | Legal/accounting no-go | `toCaseBalanceDisplay()` ve shadow readiness | Fazla tahsilat authority degil, diagnostic evidence. | Ilk fixture overpayment icermemeli. |
| `RESTRICTED_PAYMENT_DISPLAY_UNSAFE` | Payment designation no-go | `toCaseBalanceDisplay()` | Restricted/earmarked payment, PaymentDesignation yokken serbest fazla tahsilat gibi gosterilemez. | Ilk fixture restricted/earmarked payment icermemeli. |
| `NAFAKA_PRINCIPAL_DISPLAY_RISK` | Periodic obligation no-go | Shadow/frontend policy | Nafaka/periodic satirlar kor principal bucket kaynagi olamaz. | Ilk fixture nafaka/kira/periodic icermemeli. |
| `UNSUPPORTED_PERIODIC_OBLIGATION` | Frontend policy | `evaluateGuardedPrimaryDisplayPilot()` | Periodic obligation primary pilot disinda. | Ilk fixture periyodik borc icermemeli. |
| `PAYMENT_DESIGNATION_REQUIRED` | Frontend policy | `evaluateGuardedPrimaryDisplayPilot()` | Odeme iradesi olmadan tahsisli odeme primary olamaz. | Ilk fixture unrestricted payment veya odemesiz olmali. |
| `NOT_COMPARABLE` | Frontend policy | `evaluateGuardedPrimaryDisplayPilot()` | Backend report comparable degil. | Currency/context/source blockers temizlenmeli. |
| `CANONICAL_PRINCIPAL_UNAVAILABLE` | Frontend policy | `evaluateGuardedPrimaryDisplayPilot()` | Canonical principal amounts yok. | Displayable PRINCIPAL bucket finalDebtStates kaynagindan gelmeli. |
| Amount diff RED | Shadow diff | `BalanceDisplayShadowDiffService` | Legacy ve canonical tutarlar farkli. | Ilk fixture sifir diff hedeflemeli; long-term farklar yalniz explicit expected/allowed olarak siniflanabilir. |

Diff politikasi:

- Ilk pilot fixture zero legacy/canonical diff hedefler.
- Uzun vadede izinli farklar olabilir, ama sadece explicit `expected/allowed` olarak siniflanirsa.
- Sessiz fark kabul edilemez.

## 5. finalDebtStates Authority Model

Canonical principal/outstanding authority `finalDebtStates` ile sinirlidir. `ClaimItem` uzerindeki demanded/amount alanlari calculation input olabilir, fakat display authority sonucu degildir.

Akis:

```text
ClaimItem inputs
  -> assembleClaimBuckets()
  -> computeBalance()
  -> CalculationResult.finalDebtStates
  -> toCaseBalanceDisplay()
  -> PRINCIPAL bucket source = COMPUTE_BALANCE_FINAL_DEBT_STATE
```

`FINAL_DEBT_STATES_MISSING` su sekilde temizlenir:

1. `CaseBalanceService.computeCaseBalance()` en az bir bucket iceren currency group uretir.
2. `InterestEngineService.computeBalance()` basarili `CalculationResult` doner.
3. `CalculationResult.finalDebtStates` bos olmayan JSON-safe snapshot icerir.
4. `toCaseBalanceDisplay()` finalDebtStates'i display currency ile uyumlu gorur.
5. PRINCIPAL bucket `COMPUTE_BALANCE_FINAL_DEBT_STATE` kaynagiyla displayable olur.

Kaynak kanitlari:

| Kaynak | Bulgu |
| --- | --- |
| `project/apps/api/src/modules/interest-engine/types/calculation.types.ts::FinalDebtStateSchema` | `claimId`, `currency`, nonnegative `principal`, `accruedInterest`, `costs`, `ancillaries` alanlari JSON-safe schema ile tanimli. |
| `project/apps/api/src/modules/interest-engine/interest-engine.service.ts::toFinalDebtStates()` | Payment allocation varsa allocation final state'leri, yoksa her claim icin snapshot uretilir. |
| `project/apps/api/src/modules/interest-engine/orchestration/case-balance.service.ts::computeCaseBalance()` | Bucket yoksa computeBalance cagrilmaz ve `NO_BUCKETS` sonucu olusur. |
| `project/apps/api/src/modules/interest-engine/orchestration/case-balance-display.ts::buildBuckets()` | PRINCIPAL bucket sadece finalDebtStates authority varsa displayable ve amount'lu olur. |
| `project/apps/api/src/modules/interest-engine/orchestration/__tests__/case-balance-display.spec.ts` | finalDebtStates varken PRINCIPAL amount finalDebtStates'ten gelir; yokken fake bucket uretmez. |

Ilk fixture icin pratik sonuc: Sadece `ClaimItem` satiri acmak yeterli olmayabilir. Bu satir `assembleClaimBuckets()` tarafindan bucket'a donusebilmeli. Principal bucket icin amount/demandedAmount, currency, active status, start date ve faiz konfigurasyonu eksiksiz olmalidir.

## 6. ClaimItem Contamination Risk

Bu kural degismez:

```text
ClaimItem.collectedAmount / derived remaining must never become canonical display authority.
```

Neden:

- Bir evrak veya ClaimItem uzerindeki tahsil/remaining alani hukuki takip bakiyesi authority'si degildir.
- Tahsilat dosya/case bakiyesine uygulanir, evrak hedefli display authority uretilmez.
- Canonical principal/outstanding authority `finalDebtStates` olmalidir.

Kaynak kanitlari:

| Kaynak | Bulgu |
| --- | --- |
| `project/apps/api/src/modules/interest-engine/assembler/claim-bucket-assembler.ts::baseAmount()` | Bucket amount `demandedAmount ?? amount`; `collectedAmount` dusulmez. |
| `project/apps/api/src/modules/interest-engine/calc-prep/payment-mapper.ts` | Tahsilatlar ledger/collection payment source olarak map edilir; ClaimItem collected authority degildir. |
| `project/apps/api/src/modules/interest-engine/orchestration/case-balance-display.ts::toCaseBalanceDisplay()` | `provenance.claimItemCollectedAmountUsedAsAuthority=false`. |
| `project/apps/api/src/modules/interest-engine/orchestration/__tests__/case-balance-display.spec.ts` | Fake ClaimItem collected/remaining degerleri olsa bile PRINCIPAL finalDebtStates amount'undan gelir. |
| `project/apps/api/src/modules/balance-display-shadow-diff/__tests__/balance-display-shadow-diff.service.spec.ts` | ClaimItem-like authority contamination readiness risk olarak kalir. |

Fixture contamination'dan su sekilde korunur:

- `collectedAmount` veya derived remaining beklenen display amount olarak kullanilmaz.
- Tahsilat varsa payment/collection kaynagi olarak girilir.
- Expected canonical principal/outstanding `finalDebtStates` snapshot'undan okunur.
- Test/readiness kaniti, ClaimItem remaining ile finalDebtStates sonucunu ozellikle karistirmadigini gosterir.

Kritik acik konu: Guncel display adapter genel uyari olarak `CLAIM_ITEM_COLLECTED_AMOUNT_NOT_AUTHORITY` diagnostic'i uretiyor. Bu guard dogru, fakat primary eligibility icin gercek contamination ile bilgilendirici guardrail arasindaki sinir netlestirilmeden gercek report `safeForPrimaryDisplay=true` veremeyebilir.

## 7. Candidate Fixture Options

| Secenek | Sekil | Avantaj | Risk | Ilk pilot uygunlugu |
| --- | --- | --- | --- | --- |
| A. Principal-only TRY | Tek case, tek principal claim, odeme yok | En dar finalDebtStates kaniti; payment/overpayment riski yok | Legacy/canonical interest veya masraf farki cikabilir; tahsilat davranisini test etmez | En guvenli ilk teknik fixture |
| B. Principal + tek unrestricted collection TRY | Tek principal, tek tahsilat | Tahsilat allocation ve outstanding kanitlanir | Diff riski artar; tarih/faiz etkisi dikkat ister | Ikinci fixture veya ilk fixture icin kontrollu aday |
| C. Principal + cost/expense | Masraf ve asil alacak | Gercek dosyaya daha yakin | Expense authority ve legacy diff riski artar | Ilk pilot icin erken |
| D. Principal + interest-heavy | Faiz segmentleri/rate kullanir | Faiz motoru kaniti verir | Rate, tarih, stub ve rounding riskleri | Ilk pilot icin erken |
| E. Overpayment HELD/BLOCKED | Fazla tahsilat senaryosu | Overpayment wording kanitlar | Primary display icin no-go alan | Ilk pilot degil |
| F. Nafaka/kira periodic | Periodic obligation | Domain genisligini kanitlar | Periodic display semantics henuz primary-ready degil | Ilk pilot degil |

Ilk primary-eligible fixture dar ve sikici olmali. Cok domain kapsamak degil, canonical authority zincirinin ilk kez temiz calistigini kanitlamak hedeflenmelidir.

## 8. Recommended First Pilot Fixture

Onerilen ilk fixture:

```text
Fixture P1: TRY principal-only canonical display candidate
```

Amac:

- `finalDebtStates` varligini kanitlamak.
- PRINCIPAL bucket'in `COMPUTE_BALANCE_FINAL_DEBT_STATE` kaynagiyla displayable oldugunu kanitlamak.
- Legacy/canonical diff'in sifir veya acikca beklenen oldugunu kanitlamak.
- ClaimItem collected/remaining authority contamination olmadigini kanitlamak.

Minimum veri sekli:

| Alan | Deger |
| --- | --- |
| Tenant | Auth context ile ayni tenant |
| Case | Tek case, non-periodic, TRY |
| Claim | Tek PRINCIPAL alacak |
| Currency | TRY only |
| Amount | Basit yuvarlak tutar, orn. 200000 |
| Interest | Bucket uretmek icin gereken minimum gecerli faiz konfiguasyonu |
| Payment | Ilk fixture'da yok veya ikinci varyantta tek unrestricted collection |
| Overpayment | Yok |
| Restricted/earmarked payment | Yok |
| Nafaka/kira/periodic | Yok |
| Multi-currency | Yok |
| ClaimItem collected/remaining | Authority beklentisi olarak kullanilmaz |

Beklenen canonical sonuc:

- `finalDebtStates.length > 0`.
- `finalDebtStates[0].currency = TRY`.
- PRINCIPAL bucket displayable.
- PRINCIPAL bucket source `COMPUTE_BALANCE_FINAL_DEBT_STATE`.
- `FINAL_DEBT_STATES_MISSING` yok.
- `FINAL_DEBT_STATES_CURRENCY_MISMATCH` yok.
- `CURRENCY_MISMATCH` yok.
- `CONTEXT_MISMATCH` yok.
- `OVERPAYMENT_BLOCKED` yok.
- `RESTRICTED_PAYMENT_DISPLAY_UNSAFE` yok.
- `NAFAKA_PRINCIPAL_DISPLAY_RISK` yok.

Beklenen shadow sonuc:

- Legacy ve canonical source available.
- Comparable true.
- Total/bucket diff sifir hedeflenir.
- Sessiz fark yok.
- `safeForPrimaryDisplay=true` ancak ClaimItem diagnostic policy ve kalan blocker'lar temizse.

Bu son madde onemlidir: Veri fixture'i dogru olsa bile mevcut code path `CLAIM_ITEM_COLLECTED_AMOUNT_NOT_AUTHORITY` diagnostic'ini blocker olarak tasiyorsa, fixture primary-ready olmayacaktir. Bu durumda sorun fixture verisi degil, readiness sinyalinin ayrimidir.

## 9. Creation Path

Fixture yaratma icin uc yol var.

### Yol 1 - UI/API ile manuel fixture

Avantaj:

- Gercek kullanici akisini kanitlar.
- Staging/internal smoke icin daha anlamli evidence verir.

Risk:

- UI gerekli interest config/start date alanlarini tam expose etmiyor olabilir.
- Reproducibility zayif olabilir.
- Local DB mutasyonu onay gerektirir.

### Yol 2 - Test-only seed/fixture builder

Avantaj:

- Deterministic, tekrar edilebilir, CI'da kosabilir.
- Legacy/canonical zero diff hedefi kontrollu kanitlanabilir.

Risk:

- Production smoke yerine gecmez.
- Seed/testdata kodu icin ayrica onay gerekir.

### Yol 3 - Backend service-level fixture test

Avantaj:

- `CaseBalanceService`, `toCaseBalanceDisplay` ve `BalanceDisplayShadowDiffService` precondition'lari dar sekilde kanitlar.
- UI ve DB bagimliligi azaltir.

Risk:

- Gercek UI/API creation path'i hala ayrica smoke ister.

Onerilen sira:

1. Once docs-only bu tasarim kabul edilir.
2. Sonra service-level/test fixture ile primary eligibility precondition'lari kanitlanir.
3. Ardindan staging/internal UI/API smoke fixture istenir.
4. En son docs-only smoke evidence PR'i acilir.

Bu dokuman fixture yaratmaz. DB'ye veri yazmaz. Migration veya seed eklemez.

## 10. Validation Matrix

| Gate | Nasil dogrulanir? | Beklenen sonuc |
| --- | --- | --- |
| Flag OFF legacy fallback | Browser Network ve UI source | `calculation-summary` cagrilir; `balance/display` ve `shadow-diff` cagrilmaz. |
| Shadow endpoint available | Flag/opt-in veya direct API smoke | `shadow-diff` report doner, primary display degismez. |
| finalDebtStates present | API/service test | `finalDebtStatesAvailable=true`; missing diagnostic yok. |
| Principal authority | balance/display response | PRINCIPAL source `COMPUTE_BALANCE_FINAL_DEBT_STATE`. |
| No fake principal | finalDebtStates missing negative test | PRINCIPAL amount null/unavailable; fake row yok. |
| Currency comparable | shadow report | `CURRENCY_MISMATCH` ve `CANONICAL_CURRENCY_UNSAFE` yok. |
| Context comparable | shadow report | tenant/case mismatch yok. |
| ClaimItem not authority | provenance/test | `claimItemCollectedAmountUsedAsAuthority=false`; collected/remaining display source degil. |
| Diff policy | shadow report | Ilk fixture icin total/bucket diff sifir hedeflenir. |
| Overpayment absent | display diagnostics | `OVERPAYMENT_BLOCKED` ve HELD overpayment primary debt etkisi yok. |
| Periodic absent | diagnostics/policy | `NAFAKA_PRINCIPAL_DISPLAY_RISK` ve `UNSUPPORTED_PERIODIC_OBLIGATION` yok. |
| Frontend guarded candidate | guarded evaluator test | Flag ON + URL opt-in + clean report durumunda `CANONICAL_PRIMARY_CANDIDATE`. |
| Legacy fallback required | hard no-go fixture | No-go durumda source `LEGACY_CALCULATION_SUMMARY`. |
| Rollback | flag OFF smoke | URL opt-in olsa bile primary davranis kapanir. |

Manual smoke icin minimum kanit paketi:

- environment
- commit SHA
- flag value
- URL
- case/fixture id
- eligible/ineligible classification
- diagnostics
- selected primary source
- legacy fallback availability
- shadow evidence retained mi
- PASS/FAIL
- rollback dogrulamasi

## 11. Risks

### Risk 1 - Fixture ile code readiness karistirilabilir

`safeForPrimaryDisplay=false` nedeni veri eksigi de olabilir, code-level diagnostic policy de olabilir. Ozellikle `CLAIM_ITEM_COLLECTED_AMOUNT_NOT_AUTHORITY` bugun genel guardrail olarak uretiliyor ve primary blocker'a tasiniyor. Bu sinyal ayrilmadan fixture'i surekli degistirmek kisir dongu yaratir.

### Risk 2 - Zero diff hedefi fazla genis fixture ile zorlasir

Faiz, masraf, overpayment, restricted payment, nafaka/kira ve multi-currency ilk fixture'a girerse hangi farkin beklenen, hangisinin bug oldugu belirsizlesir.

### Risk 3 - finalDebtStates fixture'i dogrudan yazilacak veri sanilabilir

`finalDebtStates` DB tablosu degil; `computeBalance()` sonucu olan runtime snapshot'tir. Bu nedenle fixture'in asil gorevi gecerli bucket/payment inputlari olusturup engine'in finalDebtStates uretmesini saglamaktir.

### Risk 4 - Browser flag kaniti yanlis adlandirilabilir

Mevcut browser bulgusu shadow hattinin calistigini degil, flag OFF fallback'in calistigini kanitlar. Bu nedenle kanit adi `flag OFF / legacy fallback browser evidence` olmalidir.

### Risk 5 - Primary cutover karari erken verilebilir

Tek eligible fixture bile global primary cutover anlami tasimaz. En iyi durumda guarded eligible subset pilot icin bir referans fixture verir.

### Risk 6 - Local fixture mutation audit kalitesini bozabilir

Staging/internal smoke icin gercek fixture paketi olmadan local DB'yi uydurma veriyle degistirmek, ileride kanit zincirini zayiflatir.

## 12. Recommendation

Net karar:

```text
Primary-eligible fixture design: PROCEED
Global primary cutover: NO-GO
Production flag: OFF
First fixture target: TRY principal-only canonical display candidate
Diff target: zero legacy/canonical diff
```

Ancak uygulamaya gecmeden once bir kritik takip karari gerekir:

```text
CLAIM_ITEM_COLLECTED_AMOUNT_NOT_AUTHORITY diagnostic'i primary readiness icin her zaman blocker mi kalacak,
yoksa gercek ClaimItem authority contamination ile bilgilendirici guardrail ayrilacak mi?
```

Bu karar verilmeden, gercek backend report'unda `safeForPrimaryDisplay=true` elde etmek sadece fixture verisiyle mumkun olmayabilir.

Onerilen sonraki is:

```text
Faz 3E-B-Next - Primary Eligible Fixture Preconditions
```

Dar kapsam:

- Kod degistirmeden once mevcut service testlerinde gercek `safeForPrimaryDisplay=true` yolunun mumkun olup olmadigini kanitla.
- Eger current code path her zaman ClaimItem diagnostic blocker uretiyorsa, bunu yeni fixture isi degil, ayri readiness policy/sign-off isi olarak ayir.
- Sonra deterministic test-only fixture builder veya staging/internal fixture paketi icin onay iste.

Uygulama tavsiyesi:

1. Bu dokuman review edilir.
2. ClaimItem diagnostic policy icin GO/NO-GO karari verilir.
3. En dar service-level primary-eligible fixture testi yazilir.
4. Fixture testinden sonra staging/internal smoke case listesi istenir.
5. Smoke evidence gercek veriye dayanmadan PR'a donusturulmez.

Bu siralama, projeyi primary display'e yaklastirir ama mukemmeliyetcilik dongusune sokmaz.
