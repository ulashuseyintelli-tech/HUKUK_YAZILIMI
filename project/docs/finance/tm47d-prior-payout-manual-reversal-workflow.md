# TM47D-0 - Prior Payout Manual Reversal Workflow and Source Linkage Design

**Status:** Yalniz tasarim notu.
**Implementation status:** NOT AUTHORIZED.
**Schema/migration status:** Ayri onay gerektirir.

Bu dokuman TM47D icin urun/muhasebe/hukuk sinirini kayit altina alir. Runtime
implementation notu degildir; schema, migration, API, servis, payout,
statement, producer veya UI degisikligi icin yetki vermez.

## Problem Statement

Prior payout reversal teknik bug fix degildir. Bu alan urun, muhasebe ve hukuk
workflow siniridir.

Mevcut `ClientPayout` modeli aggregate-only calisir. Bir payout, belirli bir
tenant icinde belirli `caseClientId` ve currency icin toplam odeme kaydi tutar;
ancak bu odemenin hangi `CollectionDispositionLine` veya
`CollectionDisposition` kaynagindan geldigini kaydetmez.

Exact source linkage bulunmadigi icin daha once kaydedilmis bir payout, daha
sonra iptal edilen tahsilata yalniz inference ile guvenli bicimde baglanamaz.
Case, case-client, currency, tarih, statement snapshot veya aggregate
outstanding matematiginden yapilan historical reconstruction en fazla review
evidence sayilmalidir. Exact finansal/hukuki allocation gibi kullanilmamalidir.

## Product Decision

Iptal edilen tahsilat, daha once muvekkile odenmis paraya katkida bulunmus
olabilir. Bu durumda eski payout kaydi immutable kalir. Tasarim, manual reversal
workflow acilmasini, source linkage/audit bilgisinin kaydedilmesini ve
ops/accounting kullanicisinin bir closure method secmesini ongorur:

- `REFUND`
- `OFFSET`
- `WAIVER`

Bu workflow, iptal edilen tahsilatin muvekkil tarafinda dogurdugu obligation'i
izlemek icindir. Historical payout, statement veya ledger kayitlari sessizce
yeniden yazilmamalidir.

## Current Model

`ClientPayout` su bilgileri saklar:

- `tenantId`
- `caseId`
- `caseClientId`
- `amount`
- `currency`
- `status`
- `idempotencyKey`
- `paidAt`
- `paidById`
- `note`
- timestamps

`ClientPayoutStatus` su anda yalniz `RECORDED` degerine sahiptir.

`ClientSettlementReadService.computeOutstanding()` client outstanding degerini
ayni tenant, case, case-client ve currency icin aggregate `CLIENT_PAYABLE`
disposition line toplamindan aggregate `RECORDED` payout toplamlarini duserek
hesaplar.

Bugun payout-source allocation tablosu yoktur. `ClientStatementLine`,
`CollectionDispositionLine` ve `ClientPayout` icin ayri `refType/refId`
referanslari tasiyabilir; fakat bir payout'u onu finanse eden disposition line'a
baglamaz.

`AuditLog`, ozellikle gelecekteki domain mutation ile ayni transaction icinde
yazildiginda audit trail evidence icin uygundur. Authoritative workflow state
olarak yeterli degildir.

`Task`, ileride ops visibility mirror olarak degerlendirilebilir. Ancak amount,
currency, source, confidence, closure method ve evidence semantigini structured
sekilde tasimadigi icin authoritative finance workflow state olmamalidir.

## Proposed Domain Model

Asagidaki modeller gelecekteki implementation icin onerilir. Bu dokuman bu
modelleri hayata gecirmez.

### ClientPayoutAllocation / ClientPayoutSourceLink

Purpose:

- Yeni payout yaratilirken exact source allocation kaydetmek.
- Payout'u `CollectionDispositionLine` ve `CollectionDisposition` ile
  iliskilendirmek.
- Tenant, case, case-client, currency ve amount sinirlarini korumak.
- Gelecekteki manual reversal workflow'lar icin exact source linkage saglamak.

Recommended fields:

- `id`
- `tenantId`
- `caseId`
- `caseClientId`
- `currency`
- `amount`
- `clientPayoutId`
- `collectionId`
- `collectionDispositionId`
- `collectionDispositionLineId`
- `allocatedAt`
- `allocatedById`
- `createdAt`
- `updatedAt`

Recommended constraints ve index'ler tenant isolation'i korumali; payout,
collection disposition, disposition line, case-client ve currency uzerinden
sorgulamayi ucuz tutmalidir. Exact isimler ve uniqueness kurallari ayri schema
onayi gerektirir.

### ClientPayoutManualReversal

Purpose:

- Authoritative manual reversal workflow state saklamak.
- Amount, currency, source IDs, source confidence, closure method, status,
  user timestamps, note ve evidence bilgisini izlemek.
- Iptal edilen tahsilat sonrasinda para prior payout tarafina gecmis
  olabileceginde dogan client-side obligation'i temsil etmek.

Recommended fields:

- `id`
- `tenantId`
- `caseId`
- `caseClientId`
- `currency`
- `amount`
- `status`: `OPEN` / `CLOSED` / `CANCELLED`
- `closureMethod`: `REFUND` / `OFFSET` / `WAIVER` / `null`
- `confidence`: `EXACT` / `AGGREGATE_ONLY` / `UNKNOWN`
- `collectionId` nullable
- `collectionDispositionId` nullable
- `collectionDispositionLineId` nullable
- `clientPayoutId` nullable
- `openedAt`
- `openedById` nullable
- `closedAt` nullable
- `closedById` nullable
- `note` nullable
- `evidenceRef` nullable
- `createdAt`
- `updatedAt`

Model tenant-scoped tasarlanmalidir ve `tenantId`, `caseId`, `caseClientId` ile
`currency` acik alanlar olarak kalmalidir. Bu, cross-tenant, cross-case veya
cross-client finansal sizinti riskini azaltir.

## Lifecycle

Gelecekteki implementation su design boundary icinde tasarlanmalidir:

```txt
Collection cancel
  -> PAYMENT_REVERSED
  -> POSTED disposition preserved
  -> manualReversalRequiredAt marker/blocker
  -> prior payout detection
  -> ClientPayoutManualReversal OPEN candidate
  -> source linkage/audit evidence
  -> ops/accounting selects REFUND/OFFSET/WAIVER
  -> workflow closes with audit
```

`PAYMENT_REVERSED` producer, `Collection.cancel()`, `PaymentReversedRegistrar`
ve `CollectionReversalService` boundary'leri bu tasarim notuyla degismez.

## Historical Data Rule

Existing old payout kayitlari, payout icin guvenilir structured source
allocation zaten yoksa exact-linked kabul edilmemelidir. Mevcut modelde bu
allocation yoktur.

Historical workflow records icin su confidence degerleri onerilir:

- `confidence = AGGREGATE_ONLY`: ayni tenant, case, case-client, currency ve
  aggregate payout/outstanding evidence prior payout riskini gosteriyorsa.
- `confidence = UNKNOWN`: aggregate evidence bile yeterli degilse.

Historical kayitlar manual review gerektirir. Historical data tek basina
clawback, offset, refund veya waiver etkisi dogurmamalidir.

## Future Payout Rule

Allocation/source-link modeli ayri onay aldiktan sonra yeni payout creation
sirasinda allocation/source-link record yazilmasi tasarlanmalidir.

Allocation rule deterministic ve tenant-scoped olmalidir. Boylece iptal edilen
collection bir payout source line'a denk geldiginde gelecekteki reversal
workflow exact hale gelir.

## Closure Semantics

### REFUND

`REFUND`, client'in ilgili tutari manual accounting process ile iade ettigini
kaydeder. Actor, timestamp, note ve evidence saklamalidir. Eski payout kaydini
mutate etmez.

### OFFSET

`OFFSET`, tutarin future payout'a mahsup edilmesi gerektigini kaydeder. Bu
offset'in future payout creation veya outstanding presentation tarafina nasil
uygulanacagi ayri implementation kararidir ve ayri onay gerektirir.

### WAIVER

`WAIVER`, yetkili feragat kararini actor, timestamp, note ve evidence ile
kaydeder. Explicit ve auditable closure record olmadan finansal etki
silinmemelidir.

## No-Go List

Bu design note su alanlara yetki vermez:

- payout record mutation
- BalanceLedger reversal
- ClientStatement rewrite
- `PAYMENT_REVERSED` producer change
- `Collection.cancel()` change
- `PaymentReversedRegistrar` behavior change
- `CollectionReversalService` behavior change
- clawback execution
- offset execution
- refund execution
- schema change
- migration
- API change
- frontend/UI implementation
- dependency, lockfile, or generated file change

## Implementation Sequencing Proposal

- `TM47D-1` - source linkage ve manual reversal workflow modelleri icin
  schema/migration only.
- `TM47D-2` - yeni payout creation sirasinda allocation/source-link write.
- `TM47D-3` - prior payout risk tespit edildiginde manual reversal workflow
  creation.
- `TM47D-4` - `REFUND`, `OFFSET` ve `WAIVER` icin closure API ve audit.
- `TM47E` - ops/UI visibility ve queue surfacing.

Her adim kendi explicit approval, scope, test ve PR surecine tabi olmalidir.

## Open Questions

- Workflow status, closure method ve source confidence icin exact enum isimleri.
- Domain model olustuktan sonra `Task` workflow'u ops visibility icin mirror
  etmeli mi?
- Approved offset `computeOutstanding()`, future payout creation veya her ikisini
  de etkilemeli mi?
- Open/close actions hangi authorization modeliyle korunmali: `ADMIN`, finance
  permission, accounting-specific role veya future permission policy?
- Refund/offset/waiver closure proof icin hangi evidence attachment modeli
  kullanilmali?
