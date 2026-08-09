# C1-B05-B — EXPENSE-ACTUAL POSTING NOTIFICATION · PRE01 (ANALYSIS-ONLY DECISION PACK)

```text
PROGRAM:   CLIENT-ACCOUNTING-DELIVERY-AND-OFFICE-UX-PROGRAM-R01
THIS PAGE: C1-B05-B-EXPENSE-ACTUAL-POSTING-PRE01        LANE OWNER: CLAUDE
STATUS:    ANALYSIS-ONLY · B IMPLEMENTATION = PENDING OWNER DECISION (NOT BLOCKED_EXACT)
SCOPE:     C1-B05-A (pre-expense) ile AYNI B05 çalışması; ayrı program bloğu DEĞİL.
```

## 0. NEDEN BU SAYFA
Owner G1/Gate-2: gerçekleşen-masraf bildirimi yalnız **EXPENSE_ACTUAL statement/ledger hareketini
üreten aynı canonical durable-POSTED source**'tan, transaction kalıcılaştıktan sonra doğmalı;
`ExpenseRequest.RECEIVED/PAID` (müvekkil ödemesi) **anlamı yüklenmez**; serbest-metin `source`
discriminator olamaz; generic hook yazılmaz. Bu sayfa, B'nin canonical trigger'ının repo'da
**gerçekten var olup olmadığını** koddan kanıtlar ve owner kararına hazırlar.

## 1. CANONICAL EXPENSE_ACTUAL SOURCE — KODDAN KANIT
- Statement satırı `ClientStatementLineType.EXPENSE_ACTUAL`, `mapLedgerType(BalanceLedgerType.DEBIT)`
  ile üretilir (`client-statement.service.ts:1161-1162`).
- `BalanceLedger` DEBIT satırı iki yerde yazılır:
  - `CaseBalanceService.debit()` (`case-balance.service.ts:231-277`, ledger `244-255`) — **generic**;
    `source = dto.source` **serbest metin** (`schema.prisma:7386` `source String`; "operation:haciz",
    "manual_adjust" vb.). Tek çağıran `CaseBalanceController.debit()` (manuel `POST /cases/:id/balance/debit`).
  - `reverseExpensePaymentCreditInTransaction()` (`case-balance.service.ts:283-307`) — **reversal**
    (`source='expense_payment:{id}:reversal'`), yine `mapLedgerType` ile EXPENSE_ACTUAL'a düşer.
- **Sonuç:** EXPENSE_ACTUAL kaynağı **her `BalanceLedger` DEBIT**'idir; typed "expense-disbursement"
  event/enum **YOKTUR**. Haciz/operasyon/manuel düzeltme ve reversal DEBIT'leri de EXPENSE_ACTUAL üretir.

## 2. GAP (EXACT MODEL/SERVICE/TRANSITION)
| Boyut | Bulgu |
|---|---|
| Authoritative tutar kaynağı (1) | `BalanceLedger.amount` (DEBIT). Ayrı "gerçekleşen masraf" primitifi yok. |
| ExpenseRequest ↔ actual posting bağı (2) | **YOK.** ExpenseRequest = müvekkilden masraf TAHSİLİ (collection lifecycle); ofisin harcama DEBIT'i ile kanonik bağ kurulmamış. RECEIVED/PAID = müvekkil ödemesi, disbursement değil. |
| Approval/actor yetkisi (3) | `debit()` JWT ile yetkili; ama "expense-actual" özel yetki/rol ayrımı yok (POL-5 için ayrı gate yok). |
| Tek/çok müvekkil entitlement (4) | DEBIT `caseId` taşır, `clientId` taşımaz; dosyanın hangi creditor müvekkiline atfedileceği çözümlenmemiş. |
| İdempotency anahtarı (5) | Stable = `BalanceLedger.id` (uygun). Ama trigger noktası (debit) B05 allowed-path dışında. |
| Reversal/correction (6) | Reversal ayrı method (debit değil) → doğal dışlanır; fakat reversal DEBIT'i de EXPENSE_ACTUAL'a düşer (statement etiketleme kuralı). İkinci "masraf gerçekleşti" bildirimi ÜRETİLMEMELİ. |
| Dedicated typed service/command (7) | **YOK.** Kanonik expense-disbursement workflow yok; yalnız generic balance-debit endpoint. |
| Şema ihtiyacı (8) | Doğru trigger için **typed classification** (dedicated event/command veya BalanceLedger'da typed marker) gerekir. Owner: *"Sadece `BalanceLedger.source` alanını enum yapmak yeterli çözüm değildir."* |

## 3. ALLOWED-PATH / SCHEMA ENGELİ
- Canonical trigger (`case-balance.service.ts`) **C1-B05 allowed-path DIŞINDA** (izinli: expense-request,
  client-notification, message-template). Post-commit hook oraya yazmak allowed-path genişlemesi gerektirir.
- Doğru ayrım (gerçek müvekkil masrafı vs haciz/operasyon/manuel/reversal) için **typed classification =
  Prisma migration** gerekir → C1 için FORBIDDEN (`apps/api/prisma/` migration owner = X3).
- **Minimum güvenli allowed-path-içi post-commit hook MÜMKÜN DEĞİL:** kaynak allowed-path dışında ve
  typed ayrım olmadan generic debit hook owner G1 tarafından reddedilmiş (over-broad, yanlış bildirim).

## 4. TAVSİYE EDİLEN MİMARİ (owner kararına)
Owner'ın tercih ettiği **DEDICATED SERVER-SIDE EXPENSE-ACTUAL POSTING WORKFLOW**:
- Yeni typed application-service/command (ör. `postExpenseActual`) → `BalanceLedger` DEBIT'i **typed
  bir expense-disbursement marker** ile yazar (schema alanı/enum) ve **after-commit** notification
  side-effect'i tetikler (finansal POSTED rollback'i notification'a bağlı DEĞİL; provider açık tx içinde
  çağrılmaz — mevcut dispatcher/after-commit deseni tüketilir).
- İdempotency: `EXPENSE_ACTUAL_POSTED:BalanceLedger:{ledgerId}:1` (stable, timestamp yok) + G4 atomik claim (A'da hazır).
- Entitlement: dosyanın kesin creditor müvekkili (owner düzeltme-2 kuralı) çözülür; belirsizse gönderim yok.
- Reversal: yeni "masraf gerçekleşti" bildirimi ÜRETMEZ (exact disposition owner kararı).

## 5. OWNER DECISION REQUIRED
B implementasyonu şunlardan **en az birini** gerektirir; ikisi de C1 allowed-path/migration sınırının dışında:
1. **Allowed-path genişlemesi:** `case-balance` (veya yeni dedicated expense-posting modülü) B05 yazımına açılması.
2. **Schema/migration:** typed expense-disbursement marker (X3/migration yetkisi).

→ **B = PENDING / NEXT (BLOCKED_EXACT DEĞİL).** Owner bu decision-pack üzerinden (1) allowed-path genişletir,
(2) migration yetkisi verir, veya (3) alternatif kanonik trigger belirtirse; B, A ile aynı B05 çalışmasında
uygulanır. C1-B05-A (pre-expense) bu sayfadan bağımsız olarak tamamlanmıştır (kanıt: aynı PR).

---

## 6. SONUÇ (2026-08-09) — OWNER DECISION UYGULANDI

Owner "C1-B05-B TYPED EXPENSE EVENT + DURABLE DELIVERY INTENT" kararıyla (1)+(2)'yi BİRLİKTE verdi:
allowed-path genişlemesi (case-balance/client-notification/message-template/client-statement +
schema.prisma + migrations) ve bu exact iş için migration yetkisi. §4'teki tavsiye mimari
(dedicated typed posting + after-commit intent) owner'ın QUEUED/PENDING/SENT/FAILED state ayrımı
düzeltmesiyle uygulandı. Kanıt ve kapanış: `C1-B05-B-TYPED-EXPENSE-ACTUAL-CLOSEOUT-R01.md`
(corrective completion PR — bu sayfa artık TARİHSEL analiz kaydıdır).
