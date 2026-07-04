# TM3 — Tahsilat-Dağıtım Domain Sınır Sözleşmesi (CODEX ↔ Claude)

> **Amaç:** İki ajanın (CODEX / Claude) aynı kavramı farklı isimle yazmasını ve aynı dosyaya çakışmasını önlemek.
> **Statü:** ONAYLANDI (2026-06-26) — D1 kilitlendi (payout = proceeds-tarafı; BalanceLedger değil). Bağlayıcı.
> **Kanıt tabanı:** 2026-06-26 — iki doğrulama workflow'u + spot-doğrulama. Satır numaraları `project/apps/api/...` gerçek kodundan; base `origin/main@c82f238`.

---

## 0. Bağlam — neden bu doküman

Müvekkil-muhasebesi denetimi gösterdi ki finansal veri `Collection`, `LedgerEntry`, `BalanceLedger`, `ClientStatement`, `Expense*` arasında dağılmış; merkezi `ClientAccount` yok. TM3, tahsilatın **dosya etkisi** (CODEX) ile **müvekkil-ofis dağıtımı** (Claude) tarafını ayırır. İki ajan paralel çalışacağı için bu doküman tek hakemdir.

---

## 1. Domain sınırı (tek cümle)

```
CODEX  = Borçludan gelen paranın DOSYAYA etkisi (tahsilat + dosya borcu + legal allocation + reversal).
Claude = O paranın MÜVEKKİL–OFİS ilişkisine etkisi (dağıtım + kasa + ekstre + payout + masraf/avans + audit).
Köprü  = PAYMENT_RECEIVED / PAYMENT_REVERSED outbox event'i + CollectionDisposition taslağı.
```

İki ayrı "tahsilat" vardır, asla tek kelimeyle anılmaz:
- **Borçlu tahsilatı** (`Collection`) — borçludan dosyaya gelen para → CODEX.
- **Tahsilatın dağıtımı** (`CollectionDisposition`) — o paranın müvekkile/ofise/masrafa/emanete ayrılması → Claude.

---

## 2. Mevcut model — REUSE (yeni açılmayacak)

| Model / yapı | Konum (project/apps/api) | Sahip | Not |
|---|---|---|---|
| `Collection` | prisma/schema.prisma:2039 | CODEX | tahsilat kaydı; tek otorite `CollectionService` (`src/modules/collection/`) |
| `CollectionAllocation` | schema:2093 | CODEX | gölge/projeksiyon — **legal SoT DEĞİL**, ikinci-yazma yasak |
| `LedgerEntry` / `LedgerAllocation` | schema:4394 / 4445 | CODEX | **legal allocation kanonik kaynağı** |
| `ClaimItem.collectedAmount` | schema:4314 | CODEX | dosya borcu düşüşü buradan |
| `CollectionOverpayment` (HELD/REFUNDED) | schema:2109 | CODEX | **yalnız borçtan FAZLA tahsil** — disposition-HELD ile karıştırma |
| `CaseBalance` (1:1 Case) + `BalanceLedger` | schema:5323 / 5346 | Claude | **müvekkil masraf-avansı defteri** (proceeds defteri DEĞİL) |
| `ExpenseRequest` / `ExpensePayment` / `ExpenseBlockReason` | schema:3336 / 3469 / 3516 | Claude | masraf talebi/ödeme/blok |
| `ClientApprovalRequest` / `Event` | schema:3569 / 3612 | Claude | müvekkil onay defteri |
| `ClientStatement` / `ClientStatementLine` | schema:3672 / 3713 | Claude | **müvekkil ekstresi (birleştirme katmanı)** — immutable |
| `CaseClient` (role ALACAKLI/ORTAK_ALACAKLI) | schema:603 | CODEX yazım / Claude okuma | **shareRatio YOK**; çoklu alacaklı buradan |
| `IcrabotOutboxAction` (idempotencyKey @unique) | schema:6402 | ortak | event taşıyıcı |
| `domainEventIngest.appendInTransaction` | src/modules/icrabot/domain-event-ingest/domain-event-ingest.service.ts:77 | CODEX | same-tx event üretimi |
| `AuditService.log()` | src/modules/audit/audit.service.ts:25 | Claude | client mutasyon audit |

---

## 3. Yeni model — minimal (yalnız Claude açar)

| Model | Sahip | Faz | Gerekçe |
|---|---|---|---|
| `CollectionDisposition` (caseId, collectionId @unique, tenantId, beneficiaryScope, caseClientId?, status, totalAmount) | Claude | M1 | proceeds dağıtım taslağı — **clientId YOK** |
| `CollectionDispositionLine` (type, amount Decimal(15,2), caseClientId?) | Claude | M2 | dağıtım kalemleri |
| `ClientStatementLineType` yeni değerler | Claude | M2 | enum ekleme (yeni model değil) |
| `CaseCreditorCluster` / `Member` / `defaultShareRatio` | Claude | sonra (gerekirse) | çoklu alacaklı oran motoru |
| `ClientFeeAgreement` · `ExpenseFundingSource` · `ClientPayout` | Claude | ayrı epik | sözleşmesel ücret / finansman kaynağı / banka-dekont lifecycle |

**YASAK yeni model:** `ClientLedgerEntry`, `ClientAdvanceLedger`, `ClientAccount`. Müvekkil cari = `BalanceLedger` (avans) + `CollectionDisposition` (proceeds) → `ClientStatement` birleştirir.

---

## 4. CODEX sorumlulukları

**YAPAR:**
- `Collection` create/cancel motoru (tek tahsilat otoritesi = `CollectionService`).
- Dosya borcu düşüşü (`LedgerEntry`+`LedgerAllocation`+`ClaimItem.collectedAmount`).
- Legal allocation (TBK100 sırası) — **zaten var, yeniden hesaplamaz**.
- TM3-S1: `case.service.ts:3505 deleteCollection` hard-delete kapat → `cancel()`; `case.service.ts:3441 updateCollection` ledger-bypass kapat.
- TM3-S2: `cancel()` içine `PAYMENT_REVERSED` append (`causedBy`=orijinal event; HUMAN actor zorunlu — domain-event-ingest.service.ts:37,175,184).

**YAPMAZ:** müvekkil kasası · disposition · `ClientStatement` yazma · payout · event'e `clientId` · `remainingDebtAfterCollection` persist · yeni allocation hesabı.

---

## 5. Claude sorumlulukları

**YAPAR:** outbox consumer + `CollectionDisposition` taslağı · disposition posting **→ `ClientStatementLine` üretir** (`BalanceLedger` YALNIZ masraf-avansı / expense-advance etkili satırlarda kullanılır — bkz §5.1; normal proceeds, `CLIENT_PAYABLE` ve payout BalanceLedger'a YAZILMAZ) · payout (proceeds-tarafı) · müvekkil masraf-avans tarafı · client audit (`client.service.ts`) · CPE forensic.

**YAPMAZ:** `CollectionService.create/cancel` · `case.service` collection delete/update fix (CODEX TM3-S1) · legal allocation · `Collection` şeması · event'e `clientId` varsayımı.

---

## 5.1 BalanceLedger yazım kuralı (D1 KİLİTLİ — en kritik mimari sınır)

`BalanceLedger`, `CaseBalance`'a bağlı **müvekkil masraf-avansı (expense-advance) defteridir**. Proceeds/tahsilat-dağıtım defteri DEĞİLDİR. Bu yüzden disposition posting'de:

| Disposition line tipi | BalanceLedger'a yazılır mı? | Nereye yazılır |
|---|---|---|
| `OFFSET_CLIENT_ADVANCE` | **EVET** | BalanceLedger (avans mahsubu) + `ClientStatementLine` |
| gerçek masraf-avansı / expense-advance hareketi | **EVET** | BalanceLedger + `ClientStatementLine` |
| `CLIENT_PAYABLE` | **HAYIR** | yalnız `ClientStatementLine` (proceeds) |
| `CLIENT_PAYOUT_SENT` (payout) | **HAYIR** | yalnız `ClientStatementLine` (proceeds) — disposition-line settlement |
| `CONTRACTUAL_FEE_WITHHELD` | **HAYIR** | yalnız `ClientStatementLine` (proceeds) |
| `HELD_PENDING_DISTRIBUTION` | **HAYIR** | disposition kaydı (henüz ekstre satırı yok) |
| `FIRM_EXPENSE_REIMBURSEMENT` / `CLIENT_EXPENSE_REIMBURSEMENT` | duruma göre | masraf-avansı etkisi varsa BalanceLedger, yoksa yalnız ekstre |

**Payout (D1 nihai):** `BalanceLedgerType.PAYOUT` KULLANILMAZ. Payout = `CLIENT_PAYABLE` disposition-line'ının settlement'ı + `ClientStatementLine.CLIENT_PAYOUT_SENT`. Ayrı `ClientPayout` modeli yalnız lifecycle (banka talimatı/dekont/IBAN/parçalı/iptal) büyürse açılır.

---

## 6. Event akışı (mevcut altyapı üzerine)

```
CODEX (tek $transaction):
  Collection.create → LedgerAllocation → ClaimItem.collectedAmount++
  → appendInTransaction(tx,{eventType:'PAYMENT_RECEIVED',aggregateType:'Case',
       payload:{collectionId,caseId}, idempotencyKey:`evt:${eventId}`})
  → IcrabotOutboxAction(actionType='EVENT_PUBLISHED:PAYMENT_RECEIVED', status=pending)
  cancel() → ters LedgerEntry → ClaimItem decrement
  → appendInTransaction(tx,{eventType:'PAYMENT_REVERSED',causedBy:origEventId})   ← TM3-S2 NEW

Claude (consumer):
  @Cron → processPendingActions → handler['EVENT_PUBLISHED:PAYMENT_RECEIVED']
  → collectionId ile Collection+LedgerAllocation DB'den OKU (payload'dan DEĞİL)
  → CollectionDisposition(status=HELD_PENDING_DISTRIBUTION) taslak (otomatik dağıtım YOK)
```

**Kural:** event payload `clientId` TAŞIMAZ; consumer allocation'ı payload'dan değil **DB'den `collectionId` ile** okur (mevcut `PAYMENT_RECEIVED` test payload'ını bozmamak için — `collection-payment-received.integration.spec.ts:295`).

---

## 7. tenantId invariantları

- Her yeni model (`CollectionDisposition`/`Line`) `tenantId` taşır.
- Consumer `IcrabotOutboxAction.tenantId`'yi satırdan thread eder (caseId→tenant fallback KALDIRILDI — action-handler.service.ts ~108).
- Her okuma/yazma `tenantId`+`caseId` doğrular; cross-tenant → işlem üretmez (CHANGE_STATUS hardening #529 deseni: tenant-scoped findFirst → cross-tenant 404).

---

## 8. Çoklu alacaklı / CaseCreditorCluster kararı

- `Collection`'da `clientId` YOK; `CaseClient` çoklu alacaklı (`role`), `shareRatio` YOK.
- `CollectionDisposition.clientId` YASAK. Bağ = `beneficiaryScope`:
  - `SINGLE_CASE_CLIENT` → `caseClientId` (tek alacaklı dosya).
  - `CASE_CREDITOR_CLUSTER` → dosyanın tüm alacaklı `CaseClient` havuzu (Faz 1 **implicit**).
- Faz 1: oran **manuel**. `CaseClient.shareRatio` Faz 1'de EKLENMEZ. Gerekirse Faz 2: `CaseCreditorCluster`/`Member.defaultShareRatio`.

---

## 9. Outbox retry / dead-letter policy

- **Tek hedef: `OUTBOX_MAX_ATTEMPTS=8`** (`action-handler.service.ts:58` zaten 8; `outbox.service.ts:142`=5).
- **AÇIK: `action-handler` ile `outbox.service` AYNI kuyruk mu, ayrı mı doğrulanacak.** Aynıysa tek 8'e birle; ayrıysa ikisi de belgelenecek (consumer hangisini kullanıyor netleşecek).
- exponential backoff + `status='dead'` + admin görünürlüğü + manuel retry.
- Consumer **idempotent**: aynı `EVENT_PUBLISHED:PAYMENT_RECEIVED` iki kez disposition AÇMAZ (`idempotencyKey` + `CollectionDisposition.collectionId @unique`).

---

## 10. Yasaklar (her iki ajan)

- Tek "balance" altında 5 para gerçeğini (borçlu borcu / dosya tahsilatı / müvekkile borç / ofis ücreti / masraf iadesi) karıştırma.
- `clientId` ile disposition kurma.
- Yeni `ClientLedgerEntry`/`ClientAdvanceLedger`/`ClientAccount`.
- `remainingDebtAfterCollection` persist alanı (kalan borç TÜRETİLMİŞ kalır — `computeCaseBalance` okuma-yalnız).
- `Matter` ismi (kod = `Case`).
- Müşteri tarafına bigint-cents dayatma (müvekkil tarafı `Decimal(15,2)`; dönüşüm köprüde tek nokta).
- `CollectionService.create/cancel` dışında ikinci tahsilat otoritesi.

---

## 11. Dosya/modül sahiplik matrisi (çakışma önleyici — EN KRİTİK)

| Dosya / modül | Sahip | Eylem |
|---|---|---|
| `src/modules/collection/collection.service.ts` | **CODEX** | create/cancel engine |
| `src/modules/case/case.service.ts` `updateCollection`/`deleteCollection` (3441/3505) | **CODEX** | TM3-S1 fix |
| `src/modules/case/case.controller.ts` collection route (682/721) | **CODEX** | TM3-S1 |
| `src/modules/icrabot/domain-event-ingest/*` | **CODEX** | PAYMENT_REVERSED append (S2) |
| `src/modules/icrabot/v28-engine/action-handler.service.ts` (handler registry + cron) | **ORTAK — koordine** | consumer wiring (AÇIK: sahip kim) |
| `src/modules/icrabot/v28-engine/outbox.service.ts` | **CODEX/icrabot** | retry config doğrulama |
| `src/modules/expense-request/expense-request.controller.ts` (@CpeRequired) | **Claude (forensic)** | enforce kararı Ulaş |
| `src/modules/policy-engine/*` (CpeRequiredGuard) | **policy/authz** | C0 forensic OKUMA; aktivasyon YOK |
| `src/modules/client/client.service.ts` (64/192/464) | **Claude** | C0 audit |
| `src/modules/audit/audit.service.ts` | **Claude (tüketir)** | `.log()` |
| `src/modules/client-statement/*` | **Claude** | proceeds/disposition ekstre (`ClientStatementLine`) yazımı |
| `BalanceLedger` (yazım) | **Claude** | YALNIZ masraf-avansı / `OFFSET_CLIENT_ADVANCE` / expense-advance etkili satırlar (proceeds/payout YAZILMAZ) |
| **NEW** `src/modules/client-settlement/` (disposition + consumer handler) | **Claude** | M1/M2 |
| `prisma/schema.prisma` | **ORTAK — migration koordine** | yalnız Claude model ekler (CODEX TM3 persist eklemez) |

---

## 12. 14 invariant

1. Tahsil edilmemiş alacak müvekkile borç DEĞİLDİR.
2. Borçlu tahsilatı dosya borcunu azaltır; otomatik "müvekkile ödenecek" DEĞİLDİR.
3. Müvekkile borç ANCAK `CollectionDispositionLine = CLIENT_PAYABLE` olunca doğar.
4. `CollectionDisposition` `clientId` ile kurulmaz (`caseClientId`/cluster scope).
5. Çoklu alacaklıda para önce `CASE_CREDITOR_CLUSTER` kapsamına alınabilir.
6. `CollectionOverpayment.HELD` ≠ `HELD_PENDING_DISTRIBUTION`.
7. Legal allocation ≠ müvekkil/ofis dağıtımı.
8. Yeni `ClientLedgerEntry` YOK.
9. Payout = `CLIENT_PAYABLE` disposition-line settlement + `ClientStatementLine.CLIENT_PAYOUT_SENT`. **BalanceLedger DEĞİL** (KİLİTLİ — D1).
10. `remainingDebtAfterCollection` persist alanı YOK; türetilmiş kalır.
11. Her yeni model `tenantId` taşır.
12. Event consumer idempotent zorunlu.
13. CODEX `Collection` motoru tek tahsilat otoritesi.
14. Claude müvekkil kasası tek otoritesi.

---

## 13. Uygulama sırası

| # | İş | Sahip | Worktree | Başlama şartı |
|---|---|---|---|---|
| 1 | TM3-S1 Collection Safety (hard-delete/bypass) | CODEX | `codex/tm3-s1-collection-safety` | — |
| 2 | C0 Client audit + CPE forensic | Claude | `claude/faz0-client-audit-cpe-forensic` | — (1 ile paralel) |
| 3 | TM3-S2 PAYMENT_REVERSED append | CODEX | `codex/tm3-s2-payment-events` | S1 merge |
| 4 | M1 Outbox consumer + Disposition draft | Claude | `claude/tm3-muvekkil-settlement-bridge` | **S1 merge** |
| 5 | M2 Disposition posting → ekstre | Claude | `claude/tm3-disposition-posting` | M1 |
| 6 | M3 Payout | Claude | (M2 üstüne) | M2 |
| 7 | Frontend `/clients/:id/accounting` | Claude | ayrı | M2 |
| 8 | FeeAgreement/FundingSource/Settlement | Claude | ayrı epik | sonra |

**Paralel başlayabilir:** #1 (CODEX) + #2 (Claude). **M1 (#4) S1 bitmeden başlamaz** (hard-delete açıkken disposition taslağı riskli).

---

## 14. Kilitlenen kararlar (2026-06-26 — Ulaş onayı)

| # | Karar | KİLİTLİ değer |
|---|---|---|
| **D1** | Payout evi | **disposition-line settlement + `ClientStatementLine.CLIENT_PAYOUT_SENT`; `BalanceLedger.PAYOUT` KULLANILMAZ.** Proceeds payout BalanceLedger'a yazılmaz. |
| **D2** | Outbox consumer sahipliği | generic cron/retry/dead-letter = **icrabot/outbox platform**; `EVENT_PUBLISHED:PAYMENT_RECEIVED` handler = **Claude `client-settlement`**; `action-handler` içinde domain logic YOK |
| **D3** | CPE | önce **forensic rapor**; enforce/observe açma YOK |
| Q1 | Disposition taslağı | `PAYMENT_RECEIVED` → otomatik **draft (HELD)**; dağıtım **manuel onay** |
| Q3 | Çoklu alacaklı | Faz 1 **manuel**; `CaseClient.shareRatio` EKLENMEZ; `CollectionDisposition.clientId` YOK |
| Q4 | `deleteCollection` hard-delete | **CODEX TM3-S1** (ayrı/acil) |
| Q5 | Dead-letter | `OUTBOX_MAX_ATTEMPTS=8`; önce `action-handler`↔`outbox.service` aynı kuyruk mu doğrula, sonra tek 8 |
| Q6 | `CollectionOverpayment` | backend **ayrı semantik**; UI'da ayrı bölüm olabilir |
| Q7 | Kalan borç | `computeCaseBalance` (türetilmiş); `remainingDebtAfterCollection` persist YOK |
