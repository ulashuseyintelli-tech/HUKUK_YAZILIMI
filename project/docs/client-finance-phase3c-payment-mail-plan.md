# Faz 3 — Alt-faz 3.5: Ödeme Mail Tetikleri — Uygulama Planı (PLAN-ONLY)

> **Durum:** Uygulama planı. **KOD YOK, MIGRATION YOK, ENDPOINT YOK.** Onaylanınca additive kodlanır.
> **Önkoşul:** 3.2/3.3 altyapı (#158) + 3.4 tetikler (#159) MERGED → main `fb385eb`. Şablonlar PARTIAL_PAYMENT_BALANCE/PAYMENT_RECEIVED zaten seed'de. ✅
> **Kaynak:** [client-finance-phase3-mail-plan.md](client-finance-phase3-mail-plan.md) · [client-finance-phase3b-mail-triggers-plan.md](client-finance-phase3b-mail-triggers-plan.md)
> **Kapsam:** Yalnız **2 ödeme mail tetiği** `ExpenseRequestService.recordPayment` içinde. Başka tetik yok.

## 0. Omurga (değişmez)
- **Ödeme kaydı = FİNANSAL OLAY; mail = yalnız bildirim.** Bu ayrım bozulmaz.
- **State önce commit** (mevcut recordPayment transaction) → **mail best-effort SONRA** → **mail başarısızlığı ödeme state'ini DEĞİŞTİRMEZ**.
- `ExpenseRequest`/`ExpensePayment` davranışı **değişmez**; notify saf additive, sonradan, try/catch içinde.

## 1. Mevcut akış (kanıt — `recordPayment`, expense-request.service.ts:702)
```
$transaction { ExpensePayment.create + ExpenseRequest.update(paidTotal,status) + audit + task } → COMMIT
sonra: caseBalanceService.credit (best-effort, try/catch)   // BalanceLedger CREDIT
return updated
```
- `newStatus`: tam ödeme → **PAID** · kısmi → **PARTIAL** · sıfır → değişmez.
- Mail tetiği bu zincirin **EN SONUNA** (return'den önce) eklenir; mevcut adımlara dokunulmaz.

## 2. Bağlanacak 2 tetik
| Koşul | Mail (templateCode) | type | tokenlar |
|---|---|---|---|
| `newStatus === 'PAID'` (tam ödeme) | `PAYMENT_RECEIVED` | `PAYMENT_INFO` | clientName, caseFileNumber, executionFileNumber, totalAmount, officeName |
| `newStatus === 'PARTIAL'` (kısmi) | `PARTIAL_PAYMENT_BALANCE` | `PAYMENT_INFO` | + paidAmount (bu ödeme), remainingAmount (total − newPaidTotal) |
- `newStatus` değişmediyse (sıfır ödeme): mail YOK.
- Her iki şablon da seed'de mevcut (#158).

## 3. refId / dedupeKey (m35-1)
- **Öneri:** `refType='ExpensePayment'`, `refId = <yeni ExpensePayment.id>`. dedupeKey = `"{templateCode}:ExpensePayment:{paymentId}:1"`.
- Gerekçe: her ödeme **ayrı olay**. Birden çok kısmi ödeme → her biri **kendi** PARTIAL_PAYMENT_BALANCE maili (farklı paymentId → dedupe çakışmaz). Aynı ödeme tekrar maillenmez (idempotent, resend-safe).
- **Küçük gereklilik:** recordPayment transaction'ı oluşturulan `ExpensePayment.id`'yi dış kapsama taşımalı (şu an create sonucu yakalanmıyor). Saf additive: payment'ı `const p = await tx.expensePayment.create(...)` ile yakala, dış scope'a döndür. Davranış değişmez.

## 4. Token derleme (3.4 deseni)
- `updated` kayıtta `case{fileNumber}` + `client{name}` var; **executionFileNumber** + client displayName + office adı için ek okuma (3.4'teki `notify` ile aynı: client/case findFirst + OfficeService.getOrCreate). m34-4 ile tutarlı.
- paidAmount/remainingAmount sayıları recordPayment'ta zaten hesaplı (`payment.amount`, `totalAmount`, `newPaidTotal`).

## 5. Çağrı modeli (best-effort, state'ten sonra)
```
const result = <transaction commit>      // mevcut
<balance credit best-effort>             // mevcut
await this.notifyPayment(tenantId, userId, result, newStatus, payment.amount, paymentId)  // YENİ, try/catch
return result                            // değişmez
```
- `notifyPayment` tamamen try/catch: token okuması/dispatch patlasa bile ödeme state'i sağlam, throw yok.
- Dispatcher zaten never-throw + idempotent (#158).

## 6. Modül bağımlılığı (additive)
- `ExpenseRequestModule` → `ClientNotificationModule` (dispatcher) + `OfficeModule` import eder.
- Circular yok (ClientNotificationModule expense-request'e bağımlı değil).

## 7. Test planı
**Unit:** PAID → dispatcher PAYMENT_RECEIVED ile çağrılır · PARTIAL → PARTIAL_PAYMENT_BALANCE (paidAmount/remainingAmount doğru) · status değişmedi → mail YOK · **dispatch reddedilse de recordPayment ödeme sonucu SAĞLAM döner (throw yok)** · mevcut recordPayment testleri (state/paidTotal/audit) bozulmadan geçer.
**E2e (canlı DB, stub dispatcher):** throwaway case+client+ExpenseRequest → kısmi ödeme → PARTIAL_PAYMENT_BALANCE tetik + ExpenseRequest.status=PARTIAL · ikinci ödeme (tamamlayan) → PAYMENT_RECEIVED + status=PAID · mail throw → state SAĞLAM · her ödeme kendi dedupeKey'i. Temizlenir.

## 8. Bu alt-fazda YAPILMAYACAKLAR
- Reminder maili / cadence (cron) YOK.
- İstihbarat formu linki → **Faz 4** (ayrı kova).
- frontend · portal · PDF · SMS/WhatsApp · yeni endpoint · ExpenseRequest state davranış değişikliği.

## 9. Açık micro-kararlar
| # | Karar | Öneri |
|---|---|---|
| m35-1 | refId = ExpensePayment.id (per-ödeme) mi, ExpenseRequest.id+bucket mi? | **ExpensePayment.id** (her ödeme ayrı mail, resend-safe) |
| m35-2 | PARTIAL'da paidAmount = bu ödeme mi, kümülatif mi? | **bu ödeme** (payment.amount); remainingAmount = total − newPaidTotal |
| m35-3 | notify nereye? | recordPayment **sonunda**, balance credit'ten sonra, try/catch |
| m35-4 | LAWYER_PAID / iade gibi durumlar maillensin mi? | **Hayır** (yalnız PAID/PARTIAL); kapsam dar |

> Onaylarsan (m35-1..m35-4 dahil) 3.5'i plan→additive kod→unit+canlı e2e→PR ile yazarım. **Bu adımda kod yok.**
