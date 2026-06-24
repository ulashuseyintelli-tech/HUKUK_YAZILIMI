# Shadow Diff Readiness Audit

## Status

Faz 3E audit kanıtıdır. Primary display cutover değildir.

Bu doküman, opt-in shadow display ile gelecekteki herhangi bir primary
`HesapOzetiPanel` cutover arasında duran readiness gate kaydıdır. Production
hesaplama davranışı, API contract, UI primary authority, DB şeması veya ödeme
tahsis semantiği değiştirilmemiştir.

## Scope

Bu PR'ın kapsamı:

- legacy `calculation-summary` ile canonical `balance/display` arasındaki
  shadow-diff sonuçlarını readiness açısından sınıflandırmak
- representative senaryo matrisi ve blocker listesini belgelemek
- primary display cutover için go/no-go kriterlerini yazmak
- readiness test evidence eklemek

Kapsam dışı:

- `HesapOzetiPanel` primary source replacement
- primary UI cutover
- `calculation-summary` davranış değişikliği
- `balance/display` veya `shadow-diff` contract değişikliği
- `computeBalance` rewrite
- PaymentDesignation implementation
- ClaimItem refactor
- DB migration
- overpayment guard veya scheduler nafaka davranış değişikliği

## Context

#417 Display Authority Audit, canlı hesap özeti authority'sinin halen legacy
`/cases/:id/calculation-summary` hattında olduğunu gösterdi. #420 backend
`balance/display` contract'ını sertleştirdi. #425 read-only shadow-diff
endpoint'ini ekledi. #429 bu endpoint'i UI'da opt-in audit paneli olarak görünür
yaptı.

Bu fazın sorusu şudur: elimizdeki shadow evidence primary cutover için yeterli
mi, yoksa hangi farklar beklenen divergence, legacy authority riski, canonical
blocker veya eksik evidence olarak kalıyor?

## Classification model

| Classification | Anlam | Cutover hükmü |
|---|---|---|
| `READY_FOR_CUTOVER` | Temsilî evidence hard blocker taşımıyor ve canonical display primary kaynak olmaya hazır. | Sadece reviewer sign-off sonrası cutover PR'a geçilebilir. |
| `EXPECTED_CANONICAL_DIFF` | Legacy ve canonical beklenen bir sebeple ayrışıyor. Örnek: HELD overpayment borçtan ayrı tutuluyor. | Shadow için kabul edilebilir; tek başına primary cutover izni vermez. |
| `LEGACY_AUTHORITY_RISK` | Legacy DTO, `ClaimItem` projection veya legacy shadow alanları bakiye authority gibi yanlış okunabilir. | Primary cutover öncesi UI metni, temizlik veya açık kabul gerekir. |
| `CANONICAL_BLOCKER` | Canonical display no-go sinyali, unsafe source, context/currency mismatch veya eksik principal state taşıyor. | Primary cutover'ı bloke eder. |
| `MISSING_DATA` | Legacy/canonical source üretilemiyor veya gerekli kanıt yok. | Veri/test coverage tamamlanana kadar primary cutover bloke edilir. |
| `UNSUPPORTED_SCENARIO` | Hukuki/finansal olarak önemli senaryo ailesi henüz stabil fixture/evidence ile temsil edilmiyor. | Geniş cutover iddiasını bloke eder. |

Severity değerleri: `GREEN`, `YELLOW`, `RED`, `UNKNOWN_NEEDS_FOLLOWUP`.

Readiness değerleri: `GO`, `NO_GO`, `CONDITIONAL_GO`,
`NEEDS_MORE_EVIDENCE`.

## Readiness criteria

Primary cutover için go kriterleri:

- Matrix'teki takip aileleri için representative shadow evidence mevcut olmalı.
- `balance/display`, UI'ın ihtiyaç duyduğu alanları principal uydurmadan ve
  unsafe source gizlemeden expose edebilmeli.
- Temsilî hiçbir case'de unresolved primary blocker olarak `CURRENCY_MISMATCH`,
  `CONTEXT_MISMATCH`, `CANONICAL_DISPLAY_UNAVAILABLE` veya
  `FINAL_DEBT_STATES_MISSING` kalmamalı.
- HELD/BLOCKED overpayment için UI metni ve reviewer sign-off olmalı.
- Nafaka/dönemsel borçlar, Due satırlarını kör principal borca çevirmeyen
  display semantiğine bağlanmalı.
- Legacy `calculation-summary` ve canonical değerler aynı primary toplam içinde
  sessizce karıştırılmamalı.

No-go kriterleri:

- Shadow-diff comparability içinde herhangi bir unresolved RED blocker.
- Representative case içinde source unavailable durumu.
- Currency veya tenant/case context mismatch.
- `ClaimItem.collectedAmount` değerini hukuki bakiye authority gibi kullanma.
- Tutarları eşitlemek için cutover PR içinde legacy/canonical hesap mantığını
  değiştirme girişimi.

## Scenario matrix

| Scenario ID | Scenario | Legacy source | Canonical source | Shadow evidence | Classification | Severity | Readiness | Blocker? | Notes |
|---|---|---|---|---|---|---|---|---|---|
| S01 | Normal asıl alacak | `calculation-summary.asilAlacak/kalanBorc` | `balance/display` totals/buckets | `FINAL_DEBT_STATES_MISSING`, principal bucket null | `CANONICAL_BLOCKER` | `RED` | `NO_GO` | Yes | Standalone principal authority üretilmiyor; uydurulması yasak. |
| S02 | Faizli dosya | `takipOncesiFaiz + takipSonrasiFaiz` | `ACCRUED_INTEREST` bucket | `INTEREST_DELTA`, `LEGACY_INTEREST_STUB_OR_EMPTY` | `LEGACY_AUTHORITY_RISK` | `YELLOW` | `CONDITIONAL_GO` | No | Legacy faiz stub olabilir; primary cutover öncesi açıklama/evidence gerekir. |
| S03 | Masraf / vekalet ücreti | `icraMasraflari`, `vekaletUcreti` | `EXPENSE`, `ATTORNEY_FEE` buckets | `COSTS_DELTA`, `ATTORNEY_FEE_DELTA` | `EXPECTED_CANONICAL_DIFF` | `YELLOW` | `CONDITIONAL_GO` | No | Case-level projection ve legacy summary aynı authority değildir. |
| S04 | Fazla tahsilat HELD | Legacy'de dedicated held field yok | `HELD_OVERPAYMENT` bucket, `heldOverpaymentAmount` | HELD borçtan düşülmeden ayrı evidence | `EXPECTED_CANONICAL_DIFF` | `YELLOW` | `CONDITIONAL_GO` | No | HELD outstanding borcu azaltmaz; UI metni gerekir. |
| S05 | `OVERPAYMENT_BLOCKED` | Legacy'de dedicated blocked field yok | display diagnostics / unsafeSources | `OVERPAYMENT_BLOCKED`, `RESTRICTED_PAYMENT_DISPLAY_UNSAFE` | `CANONICAL_BLOCKER` | `RED` | `NO_GO` | Yes | Blocked/restricted payment unrestricted overpayment gibi gösterilemez. |
| S06 | Nafaka `DueType.NAFAKA` | Legacy satır principal gibi görünebilir | Canonical principal bucket source yapılmaz | `NAFAKA_PRINCIPAL_DISPLAY_RISK` / no principal materialization | `LEGACY_AUTHORITY_RISK` | `YELLOW` | `NEEDS_MORE_EVIDENCE` | No | Periodic obligation display semantiği ayrı netleşmeli. |
| S07 | Legacy hatalı `PRINCIPAL` nafaka satırı | Eski `PRINCIPAL` due/summary riski | Scheduler duplicate NAFAKA üretmiyor | Legacy remediation dışarıda | `LEGACY_AUTHORITY_RISK` | `YELLOW` | `NEEDS_MORE_EVIDENCE` | No | Eski veri remediation bu PR'ın kapsamı değildir. |
| S08 | Reversal | Collection/reversal legacy etkisi | Ledger/reversal canonical etkisi | Collection reversal tests var, dedicated shadow row yok | `MISSING_DATA` | `UNKNOWN_NEEDS_FOLLOWUP` | `NEEDS_MORE_EVIDENCE` | Yes | Geniş cutover öncesi representative shadow evidence gerekir. |
| S09 | Currency mismatch | Legacy currency | Canonical top-level/currency rows | `CURRENCY_MISMATCH`, amount diff blocked | `CANONICAL_BLOCKER` | `RED` | `NO_GO` | Yes | Farklı para birimlerinde amount diff hesaplanmamalıdır. |
| S10 | `finalDebtStates` missing | Legacy `asilAlacak` satırı var | Canonical finalDebtStates yok | `FINAL_DEBT_STATES_MISSING` | `CANONICAL_BLOCKER` | `RED` | `NO_GO` | Yes | Principal/outstanding breakdown için contract gerekir. |
| S11 | `ClaimItem.collectedAmount` authority risk | ClaimItem projection alanları | Payment/ledger provenance | `CLAIM_ITEM_COLLECTED_AMOUNT_NOT_AUTHORITY` | `LEGACY_AUTHORITY_RISK` | `YELLOW` | `CONDITIONAL_GO` | No | Tahsilat evrak/ClaimItem projection'ından authority yapılmamalı. |
| S12 | Context mismatch / tenant-case guard | Legacy tenant/case | Canonical tenant/case | `CONTEXT_MISMATCH`, amount diff blocked | `CANONICAL_BLOCKER` | `RED` | `NO_GO` | Yes | Multitenant context mismatch hard blocker'dır. |
| S13 | Genel ilamsız | Generic legacy principal-style evidence | Generic canonical display evidence | Named scenario evidence eksik | `MISSING_DATA` | `UNKNOWN_NEEDS_FOLLOWUP` | `NEEDS_MORE_EVIDENCE` | Yes | İsimli representative case gerekir. |
| S14 | Kambiyo | Dedicated legacy scenario yok | Dedicated canonical scenario yok | Dedicated fixture yok | `UNSUPPORTED_SCENARIO` | `UNKNOWN_NEEDS_FOLLOWUP` | `NEEDS_MORE_EVIDENCE` | Yes | Geniş cutover kapsamı iddia edilmemeli. |
| S15 | Kira | Dedicated legacy scenario yok | Dedicated canonical scenario yok | Dedicated fixture yok | `UNSUPPORTED_SCENARIO` | `UNKNOWN_NEEDS_FOLLOWUP` | `NEEDS_MORE_EVIDENCE` | Yes | Dönemsel kira semantiği ayrı evidence ister. |
| S16 | İlam | Dedicated legacy scenario yok | Dedicated canonical scenario yok | Dedicated fixture yok | `UNSUPPORTED_SCENARIO` | `UNKNOWN_NEEDS_FOLLOWUP` | `NEEDS_MORE_EVIDENCE` | Yes | İlama dayalı borç ayrı evidence ister. |
| S17 | Fatura | Dedicated legacy scenario yok | Dedicated canonical scenario yok | Dedicated fixture yok | `UNSUPPORTED_SCENARIO` | `UNKNOWN_NEEDS_FOLLOWUP` | `NEEDS_MORE_EVIDENCE` | Yes | Fatura dayanak evrakı ödeme hedefi authority'si değildir. |
| S18 | İpotek / rehin | Dedicated legacy scenario yok | Dedicated canonical scenario yok | Dedicated fixture yok | `UNSUPPORTED_SCENARIO` | `UNKNOWN_NEEDS_FOLLOWUP` | `NEEDS_MORE_EVIDENCE` | Yes | Teminat, bakiye authority değildir; ayrı evidence gerekir. |

## Blocker list

- `FINAL_DEBT_STATES_MISSING`: canonical display bilinçli olarak standalone
  principal bucket uydurmuyor.
- `OVERPAYMENT_BLOCKED`: blocked/restricted overpayment evidence borç veya
  unrestricted overpayment tutarı haline getirilemez.
- `CURRENCY_MISMATCH`: farklı para birimleri arasında amount diff üretilmez.
- `CONTEXT_MISMATCH`: tenant/case bağlamı uyuşmazsa shadow comparison no-go'dur.
- Dedicated shadow evidence eksikleri: reversal, genel ilamsız, kambiyo, kira,
  ilam, fatura, ipotek/rehin.

## Expected canonical diffs

- HELD overpayment canonical tarafta ayrı projection olarak görünür; legacy'de
  dedicated field yoktur. Bu fark beklenen canonical divergence'dır.
- Masraf ve vekalet ücreti canonical tarafta case-level projection olarak gelir;
  legacy summary ile birebir authority eşleşmesi iddia edilmez.
- Canonical display `ClaimItem.collectedAmount` değerini authority olarak
  kullanmaz; payment/ledger provenance çizgisi korunur.
- Canonical display principal bucket uydurmaz. Bu doğru davranıştır, fakat
  primary cutover için blocker olmaya devam eder.

## Unsupported / deferred scenarios

Dedicated evidence henüz yok:

- Kambiyo
- Kira
- İlam
- Fatura
- İpotek / rehin
- Reversal shadow row
- Genel ilamsız isimli representative row

Bu senaryolar kapatılmadan geniş primary cutover iddiası kurulamaz.

## Go/no-go decision

Primary cutover is NOT approved yet.
Opt-in shadow remains approved.
Primary cutover requires the listed blockers to be closed or explicitly accepted.

Bu hüküm özellikle `FINAL_DEBT_STATES_MISSING`, `OVERPAYMENT_BLOCKED`,
`CURRENCY_MISMATCH`, `CONTEXT_MISMATCH` ve dedicated scenario evidence eksikleri
nedeniyle verilmiştir. Kanıt olmadan `READY_FOR_CUTOVER` yazılmamıştır.

## Proposed next phase

Önerilen sonraki faz primary cutover değildir.

Önerilen sıra:

1. Genel ilamsız, kambiyo, kira, nafaka, ilam, fatura, ipotek/rehin, reversal ve
   overpayment senaryoları için isimli shadow evidence ekle veya topla.
2. Primary principal satırı gösterilmeden önce `finalDebtStates` veya eşdeğer
   principal/outstanding contract gerekip gerekmediğine karar ver.
3. HELD/BLOCKED overpayment ve dönemsel borçlar için UI metnini netleştir.
4. Ancak bundan sonra küçük, feature flag arkasında bir primary cutover PR hazırla.

## No-fix list

- `HesapOzetiPanel` source replacement yok.
- `calculation-summary` removal veya davranış değişikliği yok.
- `computeBalance` rewrite yok.
- `balance/display` breaking change yok.
- `shadow-diff` endpoint davranış değişikliği yok.
- TBK100 allocation, segment faiz, PaymentDesignation, ClaimItem refactor,
  migration, overpayment guard veya scheduler nafaka değişikliği yok.
- Global tsc borçları bu PR'da çözülmez.

## Appendix: Test evidence

Hedefli gate:

```text
balance-display-shadow-diff readiness/service/controller:
3 test suites passed
22 tests passed
```

Readiness test evidence şunları kapsar:

- HELD overpayment outstanding borçtan düşülmeden canonical divergence olarak
  sınıflanır.
- `OVERPAYMENT_BLOCKED` ve restricted payment sinyali primary cutover blocker
  olarak kalır.
- NAFAKA legacy satırı canonical principal authority yapılmaz.
- Reversal scenario matrix'te `MISSING_DATA` olarak tutulur; dedicated shadow
  evidence gerektiği açık yazılır.
- Currency mismatch ve tenant/case context mismatch amount diff yerine blocker
  üretir.
- `FINAL_DEBT_STATES_MISSING` primary cutover no-go olarak kalır.
- `ClaimItem.collectedAmount` authority riski diagnostic olarak korunur.
