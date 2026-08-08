# X3-B01 — FAİZ AUTHORITY VE POSTED TAŞIYICI ANALİZİ (R01)

```text
PROGRAM:       CLIENT-ACCOUNTING-DELIVERY-AND-OFFICE-UX-PROGRAM-R01
PAGE:          CODEX-X3 — INTEREST SEMANTICS / P7
BLOCK:         X3-B01 — docs-only
BLOCK RESULT:  ANALYSIS_DELIVERED
BASELINE:      origin/main 6551a16871e93f86d0fac45413eae2bb88147efd
DATE:          2026-08-08
```

## 1. EXACT WRITE MANIFEST

```text
project/docs/governance/CLIENT-ACCOUNTING-DELIVERY-AND-OFFICE-UX-PROGRAM-R01/
  X3-B01-INTEREST-AUTHORITY-AND-POSTED-CARRIER-ANALYSIS-R01.md
  CODEX-X3-INTEREST-SEMANTICS.md
  MASTER-PLAN.md
```

Ürün kodu, Prisma şeması, migration, eski terminal program veya başka lane kaydı bu
blokta değiştirilmez.

## 2. PRE-FLIGHT

- Fresh fetch/rebase sonrası branch baseline HEAD ve `origin/main` aynı SHA'dadır:
  `6551a16871e93f86d0fac45413eae2bb88147efd`.
- `#2265/bccfe1e7ab14e1b8a2d217c2d712e195ebb3df52`,
  `#2268/073e22f28a575846ae89232b7bee78109d52c1e0`,
  `#2270/2b4d2eeb21cb83912ee1e050b689723f9d11bc9d` ve
  `#2272/1a564fec0c7ccccf999e5967da04416ca8468e1a` için `origin/main`
  ancestry kontrolü PASS'tir.
- İlk taramada açık olan `#2275` yalnız C3-B01 client-statement characterization
  testi/CI manifestine, `#2276` yalnız C2 web yüzeylerine yazıyordu; bu manifest ile
  exact-path çakışma yoktu. Freshness yenilemesinde `#2275`,
  `6551a16871e93f86d0fac45413eae2bb88147efd` olarak merge edildi ve branch bu main'e
  taşındı. Bu yalnız C3-B01'dir; C3-B02–B05 tamamlanmadığı için C3 terminal değildir.
- `origin/main` ilerisindeki aktif remote branch'lerde ve kayıtlı worktree'lerde bu
  manifestin mevcut iki dosyasına committed veya uncommitted writer bulunmadı.
- Çalışma izole `codex/client-accounting-x3-b01-interest-analysis-r01` branch/worktree
  üzerinde yürütüldü; canonical root'taki owner WIP'e dokunulmadı.

Routing sonucu: `CLIENT + RECEIVABLE + COLLECTION / CROSS_MODULE`. CLIENT yalnız
projeksiyon tüketicisidir; faiz hesabı RECEIVABLE, ödeme/allocation ve disposition
zinciri COLLECTION/shared finance otoritesindedir.

## 3. SORU 1 — CANONICAL FAİZ AUTHORITY

**Sonuç:** Vardır. CLIENT yeni faiz hesabı kurmaz.

Canonical sınır ve sağlayıcı zinciri:

```text
RECEIVABLE-GOVERNANCE.md
  Calculation Authority / interest engine
    → project/ARCHITECTURE.md
      InterestEngine = hesap sahibi, RateProvider = oran sahibi
        → InterestEngineController.getCaseBalance()
          → CaseBalanceService.computeCaseBalance()
            → assembleClaimBuckets()
              → InterestEngineService.computeBalance()
                → SegmentBuilderService.buildSegments()
                  → calculateSegmentInterest()
```

Exact code yüzeyleri:

- `project/apps/api/src/modules/interest-engine/interest-engine.controller.ts` —
  `getCaseBalance()` tenant/case/as-of girdisini `CaseBalanceService`'e iletir.
- `project/apps/api/src/modules/interest-engine/orchestration/case-balance.service.ts` —
  `computeCaseBalance()` tenant-scoped `Case` ve `ClaimItem` kayıtlarını okur,
  `assembleClaimBuckets()` ile canonical request'i kurar ve
  `InterestEngineService.computeBalance()` çağırır.
- `project/apps/api/src/modules/interest-engine/interest-engine.service.ts` —
  `computeBalance()` deterministic hesap çekirdeğidir ve `totalInterest` sonucunu
  üretir.
- `project/apps/api/src/modules/interest-engine/segments/segment-builder.service.ts` — segment
  üretir ve formül sağlayıcısını çağırır.
- `project/apps/api/src/modules/interest-engine/segments/interest-formula.ts` —
  `calculateSegmentInterest()` repository'deki tek canonical faiz formülüdür.
- `project/apps/api/src/modules/claim-item/claim-item.service.ts` — eski
  `calculateInterest()` yolu bilinçli olarak fail-closed/deprecated'tir; hesap yapmadan
  throw eder ve `interest-engine` kullanımını zorunlu kılar. İkinci hesap authority'si
  değildir.

`RECEIVABLE-GOVERNANCE.md` içindeki canonical seçim alanı
`ClaimItem.interestTypeCode`'dur. İlgili governance ayrıca balance core'un üretim
primary cutover'ını kanıtlamaz; bu analiz yalnız hesap authority'sini doğrular,
production activation iddiası üretmez.

## 4. SORU 2 — FAİZİN KAYNAĞI / OLAY SEMANTİĞİ

Repository tek bir evrensel “temerrüt”, “avans” veya “gecikme” olayı hard-code etmez.
Canonical kaynak, açıkça persist edilen `ClaimItem` accrual sözleşmesidir:

```text
ClaimItem.interestAccrualStatus
  + ClaimItem.interestTypeCode
  + ClaimItem.interestStartDateProvenance
  + ClaimItem.interestStartDate
    → validateInterestAccrualState()
      → assembleClaimBuckets()/resolveInterestConfig()
        → interest-engine request
```

- `project/apps/api/prisma/schema.prisma` — `ClaimItem` üzerinde
  `interestAccrualStatus`, `interestTypeCode`, `interestStartDateProvenance` ve
  `interestStartDate` saklanır. Schema sözleşmesi start date'in `dueDate` veya
  `issueDate`ten sessizce türetilmesini yasaklar.
- Aynı şemadaki `InterestStartDateProvenance` canonical olay/provenance seçeneklerini
  taşır: `DOCUMENT_DUE_DATE`, `CONTRACTUAL_DUE_DATE`, `DEFAULT_NOTICE_DATE`,
  `JUDGMENT_DATE`, `JUDGMENT_FINALIZATION_DATE`,
  `ENFORCEMENT_PROCEEDING_DATE`, `MANUAL_LAWYER_CONFIRMED`.
- `project/apps/api/src/modules/claim-item/interest-accrual-policy.ts` —
  `validateInterestAccrualState()` `ACCRUES` için tip ve provenance ister; açık
  `ENFORCEMENT_PROCEEDING_DATE` istisnası dışında start date de zorunludur.
- `project/apps/api/src/modules/interest-engine/assembler/claim-bucket-assembler.ts` —
  `resolveInterestConfig()` due/issue-date fallback'i yapmaz. Yalnız provenance açıkça
  `ENFORCEMENT_PROCEEDING_DATE` ise `Case.caseDate` kullanılır; eksik/çelişkili
  konfigürasyon diagnostic üretir ve faiz bucket'ı kurmaz.

Bu nedenle hukuki başlangıç olayı kalem-bazlı canonical provenance kaydıdır. B01,
kanıt bulunmadan bu seçeneklerden birini program geneli varsayımına dönüştürmez.

## 5. SORU 3 — TAHSİL EDİLMİŞ FAİZİN POSTED TAŞIYICISI

İki ayrı authority zinciri vardır ve ikisi birlikte tüketilmelidir.

### 5.1 Hukuki ödeme/allocation gerçeği

```text
CollectionService.create()
  → Collection(status=CONFIRMED)
  → PAYMENT_RECEIVED event
  → SummaryEngineService.allocatePaymentToLedgerInTx()
  → LedgerEntry(entryType=PAYMENT, status=CONFIRMED, collectionId)
  → LedgerAllocation(claimItemId, amount, allocationOrder)
  → ClaimItem.itemType ∈ {INTEREST, PRE_INTEREST, POST_INTEREST}
```

- `project/apps/api/src/modules/collection/collection.service.ts` collection ve
  `PAYMENT_RECEIVED` event'ini üretir, aynı transaction içinde
  `allocatePaymentToLedgerInTx()` çağırır.
- `project/apps/api/src/modules/summary-engine/summary-engine.service.ts` canonical
  `LedgerEntry + LedgerAllocation` kayıtlarını oluşturur. Gerçek tahsil edilmiş faiz
  tutarı, interest-type `ClaimItem`a yazılan `LedgerAllocation.amount` toplamıdır.
- `CollectionAllocation(allocationType=INTEREST)` aynı akışta yalnız compatibility/
  gölge projeksiyondur. `CollectionService.getCollectedBreakdown()` ledger varsa yalnız
  ledger'ı kullanır ve iki kaynağı toplamaz.

### 5.2 Müvekkil entitlement / POSTED gerçeği

```text
PAYMENT_RECEIVED outbox action
  → PaymentReceivedRegistrar
  → CollectionDispositionService.createDraftFromPaymentReceived()
  → CollectionDisposition(collectionId, HELD_PENDING_DISTRIBUTION)
  → recommend → DISTRIBUTION_RECOMMENDED
  → OfficeApproval → DISTRIBUTION_APPROVED
  → DispositionPostingService.post()
  → CollectionDisposition(status=POSTED, postedAt, postedById)
  → CollectionDispositionLine(type=CLIENT_PAYABLE, caseClientId, amount)
```

- `project/apps/api/src/modules/client-settlement/collection-disposition.service.ts` —
  `createDraftFromPaymentReceived()` canonical `Collection`ı tenant/case scoped okur,
  yalnız `CONFIRMED` collection için idempotent disposition draft'ı üretir.
- `project/apps/api/src/modules/client-settlement/disposition-posting.service.ts` —
  `post()` approved office request, confirmed collection ve `sum(lines)=totalAmount`
  guard'larından sonra disposition'ı transaction içinde `POSTED` yapar.
- `project/apps/api/src/modules/client-statement/client-statement.service.ts` yalnız
  `POSTED` disposition satırlarını okur; `CLIENT_PAYABLE` satırını
  `CASE_COLLECTION_PAYABLE` olarak müvekkil ekstresine projekte eder.

**Kanıtlanmış taşıyıcı:** tahsil edilmiş faizin hukuki tutarı
`CONFIRMED LedgerAllocation → interest-type ClaimItem`; bu tutarın müvekkile ait nakit
etki kapısı `POSTED CollectionDisposition → CLIENT_PAYABLE(caseClientId)` zinciridir.
İki kök `Collection.id = LedgerEntry.collectionId = CollectionDisposition.collectionId`
ile aynı tahsilata bağlanır.

## 6. SORU 4 — FRESH ENUM / MODEL BOŞLUĞU

Fresh `origin/main` ölçümü:

- `ClientStatementLineType`: **16 üye**. Faiz üyesi yoktur. X3 sayfasındaki “17 üye”
  başlangıç varsayımı fresh main ile doğrulanmadı; C1-B01 envanterindeki 16 sayımıyla
  uyumludur.
- `CollectionDispositionLineType`: **7 üye**. Faiz üyesi yoktur.
- `ClientStatementLine` debit/credit/runningBalance ve gevşek ref taşır; accrued faiz
  değeri/provenance'i veya collected-interest allocation bağını temsil etmez.
- `CollectionDispositionLine` `caseClientId`, fee/expense provenance'i ve tutar taşır;
  `ledgerAllocationId`, `claimItemId` veya allocation component alanı taşımaz.
- `LedgerAllocation` exact `ClaimItem` ve tutarı taşır fakat `caseClientId` veya
  disposition-line bağı taşımaz.
- `CollectionDisposition.sourcePaymentEventId` şemada nullable'dır; mevcut
  `createDraftFromPaymentReceived()` bunu set etmez. Canonical aggregate bağı bugün
  `collectionId`dir.
- `ClientStatementService.mapDispositionLine()` generic `CLIENT_PAYABLE`ı projekte
  eder; principal ile collected-interest bileşenini ayıramaz.

Dolayısıyla repository bugün collection toplamı düzeyinde iki authority zincirini
bağlar, fakat belirli `LedgerAllocation` faiz tutarını belirli POSTED
`CLIENT_PAYABLE/caseClientId` satırına bağlayan explicit model taşımaz. POL-3 zaten
semantic kararı verir; eksik olan yeni faiz politikası değil, B02'nin en küçük
schema/enum tasarımıyla kapatacağı izlenebilir projection bağıdır.

## 7. B02 İÇİN BAĞLAYICI TASARIM SINIRLARI

Bu analiz çözümü peşinen seçmez. B02 şu kanıt sınırlarında kalır:

1. Accrued faiz canonical `interest-engine` sonucunun informational projeksiyonudur;
   CLIENT hesaplamaz. `debit=0`, `credit=0`; opening/closing/running balance değişmez.
2. Collected client interest yalnız confirmed canonical `LedgerAllocation` ve POSTED
   client entitlement birlikte kanıtlandığında üretilebilir.
3. `CollectionAllocation.INTEREST` legal authority olarak yükseltilemez ve ledger ile
   toplanamaz.
4. En küçük explicit bağ, tenant/case/client scope ve exact allocation tutarını
   korumalıdır; paralel faiz calculator'ı veya ikinci allocation authority'si kurulmaz.
5. Exact enum/field/migration seçimi B02 pre-flight'ında C3 terminal sözleşmesi fresh
   main'den okunduktan sonra yapılır.

## 8. DISPOSITION

```text
COMPLETED BLOCK:                 X3-B01
BLOCK RESULT:                    ANALYSIS_DELIVERED
BLOCKS TOTAL:                    3
BLOCKS COMPLETED:                1
BLOCKS REMAINING:                2
REMAINING BLOCKS:                X3-B02, X3-B03
ACTIVATION DEBT:                 NONE — B01 docs-only
NEXT ELIGIBLE:                   WAITING_FOR_PREDECESSOR — C3 canonical terminal
PREDECESSOR EVIDENCE:            C3-B01 #2275/6551a168 merged; C3-B02–B05 terminal değil
WAITING FOR OWNER AUTHORIZATION: NO
PROGRAM LOCK:                    CLIENT ACCOUNTING DELIVERY + CLIENT OFFICE UX ONLY
```
