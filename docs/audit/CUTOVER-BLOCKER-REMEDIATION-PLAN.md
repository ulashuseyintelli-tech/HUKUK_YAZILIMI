# Cutover Blocker Remediation Plan

## Status

```text
Planning completed / no production changes in this PR
Primary cutover remains NO-GO
```

Bu dokuman #432 Shadow Diff Readiness Audit sonrasinda kalan blocker ve
readiness risklerini uygulanabilir is paketlerine boler. Bu PR blocker kapatmaz,
primary cutover yapmaz, kod/test/schema/API/UI davranisi degistirmez.

## Scope

Bu planin kapsami:

- #432 blocker inventory'sini tek tek ayrismak.
- Blocker'lari contract, fixture/evidence, UI wording/sign-off, domain-model,
  multitenant guard ve remediation is paketlerine bolmek.
- `finalDebtStates` icin secenekleri ve onerilen karari yazmak.
- HELD / `OVERPAYMENT_BLOCKED` display kararini netlestirmek.
- Nafaka/kira gibi donemsel borclar icin display semantigini ayirmak.
- Unsupported senaryolar icin minimal representative evidence plani yapmak.
- Primary cutover'a tekrar donmeden once go/no-go checklist tanimlamak.
- Sonraki PR siralamasini onermek.

Kapsam disi:

- Production kod degisikligi.
- Test ekleme.
- UI cutover.
- `HesapOzetiPanel` source replacement.
- `calculation-summary`, `balance/display`, `shadow-diff` veya `computeBalance`
  davranis degisikligi.
- PaymentDesignation implementation.
- ClaimItem refactor.
- PeriodicObligation schema/service implementation.
- DB migration.
- Legacy bad-data remediation.
- #404 overpayment veya #414 scheduler nafaka davranis degisikligi.
- WP-2b / #431 hatti.

## Context

#417 Display Authority Audit, canli hesap ozeti authority'sinin legacy
`GET /cases/:id/calculation-summary` hattinda kaldigini gosterdi. #420 backend
`balance/display` contract'ini sertlestirdi. #425 read-only
`shadow-diff` endpoint'ini ekledi. #429 bu shadow bilgisini UI'da opt-in audit
paneli olarak gorunur yapti. #432 ise primary cutover icin yeterli karar
olmadigini ve blocker'lar kapanmadan cutover yapilamayacagini belgeledi.

Canli `HesapOzetiPanel` authority'si halen legacy `calculation-summary` hattidir.
Canonical `balance/display` ve `shadow-diff` hatti shadow evidence olarak
kullanilabilir, fakat primary display authority henuz degildir.

## Blocker inventory from #432

#432 scenario matrix sonucu:

```text
Total scenarios: 18
CANONICAL_BLOCKER: 5
EXPECTED_CANONICAL_DIFF: 2
LEGACY_AUTHORITY_RISK: 4
MISSING_DATA: 2
UNSUPPORTED_SCENARIO: 5
READY_FOR_CUTOVER: 0
NO_GO: 5
CONDITIONAL_GO: 4
NEEDS_MORE_EVIDENCE: 9
GO: 0
RED: 5
YELLOW: 6
UNKNOWN_NEEDS_FOLLOWUP: 7
GREEN: 0
```

| ID | Blocker / risk | #432 class | Is turu | Cutover etkisi | Kapanis kosulu |
|---|---|---|---|---|---|
| B01 | `FINAL_DEBT_STATES_MISSING` | `CANONICAL_BLOCKER` | Contract | Primary principal/outstanding satiri no-go | Engine veya display contract guvenilir principal/outstanding kirilimi tasir ya da UI bu satiri gostermez. |
| B02 | `OVERPAYMENT_BLOCKED` | `CANONICAL_BLOCKER` | Contract + UI wording/sign-off | Restricted/earmarked payment unrestricted overpayment gibi gorunemez | Blocked overpayment debt/totals disi diagnostic olarak kalir; UI metni ve reviewer sign-off tamamlanir. |
| B03 | HELD overpayment yuzeyi | `EXPECTED_CANONICAL_DIFF` | UI wording/sign-off | Fazla tahsilat borctan dusulmus gibi algilanabilir | HELD ayri satir/blok olarak "borca mahsup edilmemis fazla tahsilat / emanet" anlamiyla gosterilir. |
| B04 | `CURRENCY_MISMATCH` | `CANONICAL_BLOCKER` | Contract + fixture/evidence | Cross-currency amount diff yasak | Mismatch durumda amount diff uretilmedigi ve UI no-go gosterdigi kanitlanir. |
| B05 | `CONTEXT_MISMATCH` / tenant-case guard | `CANONICAL_BLOCKER` | Multitenant guard + fixture/evidence | Yanlis tenant/case verisi primary display'e sizabilir | Tenant/case mismatch hard blocker olarak kalir; UI ve API no-go davranisi kanitlanir. |
| B06 | `ClaimItem.collectedAmount` authority risk | `LEGACY_AUTHORITY_RISK` | Semantic guard + later cleanup | Evrak/kalem projection'i hukuki bakiye gibi okunabilir | Display contract ve UI bu alani authority olarak kullanmaz; uzun vadede semantic cleanup planlanir. |
| B07 | Legacy faiz stub | `LEGACY_AUTHORITY_RISK` | UI wording + fixture/evidence | Legacy faiz sifir/empty gercek faiz gibi gorunebilir | Primary cutover oncesi legacy faiz stub riskinin UI'da karismadigi kanitlanir. |
| B08 | Nafaka `DueType.NAFAKA` | `LEGACY_AUTHORITY_RISK` | Domain-model + fixture/evidence | Periodic due principal borca donusebilir | Nafaka Due-only kalir; PeriodicObligation/periodKey tasarimi ayrilir. |
| B09 | Kira / donemsel borclar | `UNSUPPORTED_SCENARIO` | Domain-model + fixture/evidence | Donemsel kira principal gibi okunabilir | PeriodicObligation/periodKey veya esdeger display semantigi planlanir; representative evidence eklenir. |
| B10 | Reversal shadow evidence eksigi | `MISSING_DATA` | Fixture/evidence | Reversal etkisi primary cutover'da kanitsiz kalir | Dedicated reversal shadow fixture veya audit evidence eklenir. |
| B11 | Genel ilamsiz named evidence eksigi | `MISSING_DATA` | Fixture/evidence | Generic principal case yeterli sayilamaz | Isimli representative genel ilamsiz shadow row eklenir. |
| B12 | Kambiyo evidence eksigi | `UNSUPPORTED_SCENARIO` | Fixture/evidence | Kambiyo icin cutover iddiasi kanitsiz kalir | Dedicated kambiyo scenario evidence eklenir. |
| B13 | Ilam evidence eksigi | `UNSUPPORTED_SCENARIO` | Fixture/evidence | Ilama dayali alacak kanitsiz kalir | Dedicated ilam scenario evidence eklenir. |
| B14 | Fatura evidence eksigi | `UNSUPPORTED_SCENARIO` | Fixture/evidence | Fatura dayanak evraki payment target gibi okunabilir | Fatura evidence display authority'den ayrilir; fixture eklenir. |
| B15 | Ipotek / rehin evidence eksigi | `UNSUPPORTED_SCENARIO` | Fixture/evidence | Teminat bakiye authority gibi karisabilir | Collateral/display ayrimi icin dedicated evidence eklenir. |
| B16 | Legacy bad-data remediation | Follow-up | Remediation | Eski hatali `PRINCIPAL` nafaka satirlari kalabilir | Ayrica migration/audit remediation PR'i tasarlanir; cutover PR'a karistirilmaz. |

## Remediation taxonomy

Remediation isleri su siniflara ayrilir:

- Contract: canonical contract veya display adapter kararini gerektirir.
- Fixture/evidence: production davranisi degistirmeden representative shadow
  kaniti ister.
- UI wording / legal sign-off: ayni tutarin kullaniciya nasil anlatilacagini ve
  hukuk/urun kabulunu gerektirir.
- Domain-model: PeriodicObligation, PaymentDesignation veya C modeli gibi daha
  buyuk domain kararlarini gerektirir.
- Multitenant guard: tenant/case context mismatch gibi hard no-go guard'larini
  korur.
- Legacy remediation: eski hatali veriyi cutover PR'ina karistirmadan ayri
  audit/migration planina tasir.

## Contract work packages

| Work package | Karar / hukum | Gereken is | Cutover etkisi | Test/evidence ihtiyaci | Baglanacagi faz / PR |
|---|---|---|---|---|---|
| CB-01 - Canonical finalDebtStates / principal-outstanding contract | Ilk kritik code blocker budur. `finalDebtStates` veya esdeger canonical principal/outstanding contract olmadan principal row primary authority olamaz. | ADR/contract karari, sonra backend contract implementation PR'i. | Primary principal/outstanding satiri no-go kalir. | Mapper/contract tests; no fake principal; final state integrity. | Next code PR recommendation, unless team chooses narrower fixture/evidence first. |
| CB-02 - Currency mismatch hard no-go | Currency mismatch amount diff uretmez ve primary display icin hard no-go'dur. | Contract ve UI no-go davranisini kanitlayan evidence. | Cross-currency silent comparison engellenir. | Currency mismatch shadow evidence. | Guard/evidence PR. |
| CB-03 - Context mismatch / tenant-case guard | Context mismatch hard no-go'dur; multitenant context disi veri primary display'e sizamaz. | Tenant/case context guard evidence. | Yanlis tenant/case verisi primary display'e giremez. | Tenant/case mismatch shadow evidence. | Guard/evidence PR. |
| CB-04 - ClaimItem authority ban | `ClaimItem.collectedAmount` veya derived remaining display authority olamaz. | Contract/docs/test guard ile negative authority kuralini koru. | Evrak/kalem projection'i hukuki bakiye gibi okunmaz. | Diagnostic/provenance evidence; diagnostic varken primary auto-GO yok. | Contract/evidence PR; semantic cleanup sonraya. |

## Overpayment display work packages

| Work package | Karar / hukum | Gereken is | Cutover etkisi | Test/evidence ihtiyaci | Baglanacagi faz / PR |
|---|---|---|---|---|---|
| CB-05 - HELD overpayment display wording/sign-off | HELD overpayment borctan dusulmez; ayri gosterilir. | UI metni ve hukuk/urun sign-off: "borca mahsup edilmemis fazla tahsilat / emanet". | Borcun negatif veya eksik gosterilmesi engellenir. | HELD shadow evidence ve UI wording review. | UI wording/sign-off PR. |
| CB-06 - OVERPAYMENT_BLOCKED diagnostic handling | `OVERPAYMENT_BLOCKED` debt degildir; diagnostic / cutover evidence'tir. | Blocked amount'i debt/totals disinda tutan UI/contract karari. | Restricted/earmarked payment unrestricted overpayment gibi gosterilmez. | Blocked overpayment evidence; restricted reason evidence. | Overpayment wording/evidence PR. |
| CB-11 - Restricted / earmarked payment evidence | Restricted/earmarked payment PaymentDesignation olmadan primary display kapsaminda degildir. | PaymentDesignation dependency dokumante edilir; primary display disinda tutulur. | Unsupported payment iradesi yanlis fazla tahsilat olmaz. | Restricted/earmarked evidence; blocked reason coverage. | PaymentDesignation dependency PR, implementation sonraya. |

## Periodic obligation / nafaka-kira work packages

| Work package | Karar / hukum | Gereken is | Cutover etkisi | Test/evidence ihtiyaci | Baglanacagi faz / PR |
|---|---|---|---|---|---|
| CB-07 - PeriodicObligation + periodKey design | Nafaka/kira donemsel borclari icin PeriodicObligation + periodKey yonu onerilir. | ADR/design plan; schema/service implementation bu PR'da yok. | Due satirlari kor principal authority'ye donusmez. | Nafaka/kira representative evidence; duplicate period evidence. | Domain ADR PR. |
| CB-08 - Legacy PRINCIPAL nafaka remediation audit | Legacy hatali `PRINCIPAL` nafaka remediation ayri istir. | Bad-data audit/migration plan; cutover PR'a karismaz. | Eski veri cift sayim veya yanlis authority yaratmaz. | Legacy principal nafaka row inventory/evidence. | Separate remediation audit PR. |

## Fixture / evidence work packages

| Work package | Karar / hukum | Gereken is | Cutover etkisi | Test/evidence ihtiyaci | Baglanacagi faz / PR |
|---|---|---|---|---|---|
| CB-09 - Reversal representative evidence | Reversal cutover kaniti eksik; MISSING_DATA kalir. | Dedicated reversal shadow evidence. | Reversal payment/debt etkisi kanitsiz cutover'a girmez. | Reversal shadow row / fixture. | Evidence PR. |
| CB-10 - Representative case-type evidence | Genel ilamsiz, kambiyo, kira, nafaka, ilam, fatura, ipotek/rehin icin named evidence gerekir. | Minimal scenario matrix ve shadow evidence. | Unsupported scenario iddiasi kapanmadan broad cutover yapilmaz. | Case-type evidence rows. | Evidence PR. |
| CB-11 - Restricted / earmarked payment evidence | PaymentDesignation yokken restricted/earmarked payment primary display disinda kalir. | Evidence ve dependency kaydi. | Unsupported payment iradesi primary display'de yanlis yorumlanmaz. | Restricted/earmarked payment evidence. | Evidence + PaymentDesignation dependency PR. |

## UI wording / legal sign-off work packages

| Work package | Karar / hukum | Gereken is | Cutover etkisi | Test/evidence ihtiyaci | Baglanacagi faz / PR |
|---|---|---|---|---|---|
| CB-05 - HELD overpayment display wording/sign-off | HELD ayri projection olarak gosterilir. | UI metni, tooltip/label, hukuk/urun sign-off. | Fazla tahsilat borctan dusulmus gibi gorunmez. | UI copy review + shadow evidence. | UI wording PR. |
| CB-06 - OVERPAYMENT_BLOCKED diagnostic handling | Blocked amount borc veya fazla tahsilat authority degildir. | UI diagnostic metni ve no-go state. | Restricted/currency/context blocked amount yanlis total olmaz. | UI copy review + blocker evidence. | UI wording PR. |
| CB-01 - Principal/outstanding unavailable wording | Principal/outstanding satiri uydurmak yasak. | `finalDebtStates` yoksa satiri gizle veya acik "unavailable" metni. | Kullanici uydurma anapara gormez. | UI copy sign-off. | Contract/UI PR after CB-01 decision. |

## Recommended remediation sequence

1. CB-01 finalDebtStates / canonical principal-outstanding contract.
2. CB-02 + CB-03 currency/context hard guards.
3. CB-05 + CB-06 overpayment HELD/BLOCKED UI wording/sign-off.
4. CB-04 ClaimItem authority negative guard.
5. CB-09 reversal evidence.
6. CB-10 representative case-type evidence.
7. CB-07 PeriodicObligation + periodKey design.
8. CB-08 legacy PRINCIPAL nafaka remediation audit.
9. CB-11 PaymentDesignation restricted/earmarked dependency.
10. Repeat Shadow Diff Readiness Audit.

Next code PR recommendation:

```text
CB-01 finalDebtStates / canonical principal-outstanding contract,
unless the team explicitly chooses narrower fixture/evidence first.
```

## Primary cutover go/no-go checklist

Primary cutover PR'i acilmadan once:

- [ ] `FINAL_DEBT_STATES_MISSING` kapanmis veya principal/outstanding satiri
  bilerek gosterilmiyor ve sign-off alinmis.
- [ ] UI principal/outstanding satiri uydurmuyor.
- [ ] HELD overpayment borctan dusulmuyor; ayri gosteriliyor.
- [ ] `OVERPAYMENT_BLOCKED` debt degil; diagnostic / cutover evidence olarak
  kaliyor.
- [ ] `CURRENCY_MISMATCH` hard no-go.
- [ ] `CONTEXT_MISMATCH` hard no-go.
- [ ] `ClaimItem.collectedAmount` / derived remaining display authority degil.
- [ ] Nafaka/kira due satirlari principal bakiye authority olmuyor.
- [ ] PeriodicObligation + periodKey yonu kabul edilmis veya cutover scope'unda
  acikca disarida birakilmis.
- [ ] Legacy `PRINCIPAL` nafaka remediation ayri is olarak kayitli.
- [ ] Reversal representative evidence mevcut.
- [ ] Genel ilamsiz, kambiyo, kira, nafaka, ilam, fatura, ipotek/rehin
  representative evidence mevcut.
- [ ] Restricted/earmarked payment PaymentDesignation olmadan primary display
  kapsaminda degil.
- [ ] Legacy `calculation-summary` ve canonical `balance/display` ayni primary
  toplamda karistirilmiyor.
- [ ] UI wording ve hukuk/urun sign-off tamam.

## Decision

```text
Primary cutover remains NO-GO.
Opt-in shadow remains approved.
Next work is blocker remediation planning and evidence, not primary cutover.
```

#432 sonucu yumusatilmaz:

- `READY_FOR_CUTOVER: 0`
- `GO: 0`
- blocker'lar kapanmis gibi yazilmaz

Kritik kararlar:

- `OVERPAYMENT_BLOCKED` debt degil; diagnostic / cutover evidence'tir.
- `CURRENCY_MISMATCH` hard no-go.
- `CONTEXT_MISMATCH` hard no-go.
- `ClaimItem.collectedAmount` / derived remaining display authority degil.
- UI principal/outstanding satiri uydurmak yasak.
- Restricted/earmarked payment PaymentDesignation olmadan primary display
  kapsaminda degildir.

## No-fix list for this PR

- Kod yok.
- Test yok.
- UI yok.
- API yok.
- Schema/migration yok.
- DTO yok.
- `computeBalance` yok.
- `calculation-summary` yok.
- `balance/display` yok.
- `shadow-diff` yok.
- `HesapOzetiPanel` source replacement yok.
- PaymentDesignation yok.
- ClaimItem refactor yok.
- PeriodicObligation implementation yok.
- Legacy bad-data remediation yok.
- #404 / #414 davranis degisikligi yok.
- #431 / WP-2b hatti yok.

## Appendix: Source references

Kaynak dokumanlar:

- `docs/audit/DISPLAY-AUTHORITY-AUDIT.md`
- `docs/audit/SHADOW-DIFF-READINESS-AUDIT.md`

Referans route ve yuzeyler:

- `GET /cases/:id/calculation-summary`
- `GET /interest-engine/case/:caseId/balance/display`
- `GET /interest-engine/case/:caseId/balance/display/shadow-diff`
- `HesapOzetiPanel`
- `BalanceShadowDiffPanel`

Referans kararlar:

- Primary display cutover henuz onayli degildir.
- Opt-in shadow display onayli kalir.
- Tahsilat evraka veya `ClaimItem.collectedAmount` projection'ina degil,
  takip/dosya bakiyesi authority'sine uygulanmalidir.
- Legacy ve canonical degerler ayni primary toplam icinde sessizce
  karistirilamaz.
