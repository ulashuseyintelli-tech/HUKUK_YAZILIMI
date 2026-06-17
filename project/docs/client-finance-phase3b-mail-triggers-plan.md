# Faz 3 — Alt-faz 3.4: Mail Tetiklerini Bağlama — Uygulama Planı (PLAN-ONLY)

> **Durum:** Uygulama planı. **KOD YOK, MIGRATION YOK, ENDPOINT YOK.** Onaylanınca additive kodlanır.
> **Önkoşul:** 3.2/3.3 mail altyapısı MERGED (#158 → main `b1342a8`): dispatcher + dedupeKey + şablonlar hazır. ✅
> **Kaynak:** [client-finance-phase3-mail-plan.md](client-finance-phase3-mail-plan.md) · [client-finance-phase3a-mail-infra-plan.md](client-finance-phase3a-mail-infra-plan.md)
> **Kapsam:** Yalnız **3 tetik bağlama**. Ödeme mailleri (#3/#4) = 3.5 (bu plan DEĞİL).

## 0. Omurga (değişmez — 3.2/3.3 ile aynı)
- **State önce commit** (Faz 2 davranışı) → **mail best-effort sonra** → **mail başarısızlığı state'i DEĞİŞTİRMEZ**.
- Dispatcher zaten **never-throw** + idempotent (dedupeKey). Bu alt-faz yalnız **çağrı noktalarını** ekler.
- Yeni model/migration/endpoint **yok** (mevcut Faz-2 servis metotları best-effort dispatch ile genişler).

## 1. Bağlanacak 3 tetik
| Tetik (mevcut Faz-2 metodu) | templateCode | ClientNotification.type | refType | tokenlar |
|---|---|---|---|---|
| `ClientApprovalService.send` (DRAFT→SENT) | `APPROVAL_REQUEST` | `CLIENT_APPROVAL` | `ClientApprovalRequest` | clientName, caseFileNumber, executionFileNumber, subjectLabel, officeName |
| `ClientApprovalService.decision` (→APPROVED/REJECTED) | `APPROVAL_RESULT` | `CLIENT_APPROVAL` | `ClientApprovalRequest` | + decision ("Onaylandı"/"Reddedildi") |
| `ClientStatementService.create` (ACTIVE üretildi) | `STATEMENT_READY` | `STATEMENT_READY` | `ClientStatement` | clientName, caseFileNumber, periodStart, periodEnd, closingBalance, officeName |

- `refId` = ilgili kaydın id'si. dedupeKey = `"{templateCode}:{refType}:{refId}:1"` → her aksiyon **tek mail** (templateCode farkı APPROVAL_REQUEST vs APPROVAL_RESULT'ı ayırır → ikisi de gider, çakışmaz).

## 2. Çağrı modeli (state'ten sonra, best-effort)
```
async send(...) {
  const updated = await <state transaction commit>   // Faz 2 — AUTHORITATIVE
  await this.dispatchApprovalMail(updated, 'APPROVAL_REQUEST', tokens)  // best-effort, never-throw
  return updated   // mail sonucu state'i etkilemez
}
```
- Dispatch **commit'ten sonra** çağrılır; dispatcher `dispatch()` zaten try/catch'li (throw etmez) → ekstra koruma gerekmez ama çağrı yine de `await` edilir (sonuç loglanır/yoksayılır).
- **State dönüşü mail'den bağımsız:** metodun return değeri değişmez; mail 'failed'/'skipped' olsa da state SENT/APPROVED/ACTIVE kalır.

## 3. Token derleme (m34 — çağıran doldurur, m3a-4)
- Servis, token için **client + case** bilgisini okur (clientName, caseFileNumber, executionFileNumber) + office adı (mevcut OfficeService/officeName kaynağı).
- approval: `subjectLabel` zaten kayıtta; decision: `decision` enum → TR etiket.
- statement: `periodStart/End` + `closingBalance` kayıttan.
- Token sözlüğü servis içinde kurulur; **render motoru değişmez**.

## 4. Modül bağımlılığı (additive)
- `ClientApprovalModule` ve `ClientStatementModule` → `ClientNotificationModule` import eder (NotificationDispatcherService + OfficeService dolaylı). Servislere `NotificationDispatcherService` (+ office/case/client okuması için gerekirse OfficeService) inject edilir.
- Mevcut `ClientNotificationModule` zaten `NotificationDispatcherService` export ediyor (#158). Circular dep yok (notification, approval/statement'a bağımlı değil).

## 5. Idempotency / resend
- Aynı approval `send` iki kez çağrılırsa: state ikinci kez DRAFT olmadığı için zaten reddedilir (Faz 2). Mail için de dedupeKey "1" → ikinci (varsa) mail skip.
- Başarısız mail → manuel `POST /client-notifications/resend` (3.3, mevcut).

## 6. Açık kararlar
| # | Karar | Öneri |
|---|---|---|
| m34-1 | Statement maili: yalnız `create` mi, `supersede` de mi? | **create only** (supersede tekrar mail = gürültü; istenirse sonra) |
| m34-2 | Dispatch: commit-sonrası await mi, fire-and-forget mi? | **commit-sonrası await** (sonuç loglanır; dispatcher zaten never-throw) |
| m34-3 | Mail otomatik mi (aksiyonun yan etkisi) yoksa `notify` flag (default true) mı? | **otomatik** (aksiyonun kendisi açık tetik) — flag gerekirse sonra |
| m34-4 | Token için office adı kaynağı | mevcut OfficeService (ExpenseNotificationService ile aynı) |

## 7. Test planı
**Unit:** her tetik state commit'inden SONRA dispatcher'ı doğru templateCode/refType/tokens ile çağırır · **mail 'failed' olsa da state dönüşü değişmez** (dispatcher mock reject → metod yine başarılı döner) · idempotency dispatcher'da (zaten test edildi).
**E2e (canlı DB, stub sendEmail):** approval send → ClientNotification(APPROVAL_REQUEST) + approval SENT (mail fail edilse bile SENT) · decision → APPROVAL_RESULT · statement create → STATEMENT_READY · dedupeKey doğru · **mail başarısızlığında state SAĞLAM**. Temizlenir.

## 8. Bu alt-fazda YAPILMAYACAKLAR
- Ödeme mailleri (#3/#4 PARTIAL_PAYMENT_BALANCE/PAYMENT_RECEIVED) → **3.5**.
- **Müvekkile "istihbarat formu doldur" / dış form linki → KAPSAM DIŞI.** O ayrı kova: **Faz 4 — Client Intake Link / Secure External Form / Review Queue** (ayrı plan→onay).
- frontend · portal · PDF · cron · SMS/WhatsApp · yeni endpoint.

> Onaylarsan (m34-1..m34-4 dahil) 3.4'ü plan→additive kod→unit+canlı e2e→PR ile yazarım. **Bu adımda kod yok.**
