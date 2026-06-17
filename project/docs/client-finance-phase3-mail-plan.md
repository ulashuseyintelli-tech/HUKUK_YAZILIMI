# Müvekkil Finans/Onay Merkezi — FAZ 3: Mail Şablonları ve Gönderim Davranışı (PLAN-ONLY)

> **Durum:** Tasarım/uygulama planı. **KOD YOK, MIGRATION YOK, ENDPOINT YOK.** Onaylanınca fazlı uygulanır.
> **Önkoşul:** Faz 2 backend seti MERGED — PR-1 #155 · PR-2 #156 · PR-3 #157 → main `e397c13`. ✅
> **İlgili:** [client-finance-approval-center-design.md](client-finance-approval-center-design.md) (§6 mail)

## 0. EN KRİTİK KURAL — mail ≠ finansal state (planın omurgası)
**Mail gönderimi/başarısızlığı finansal/onay/ekstre state'ini ASLA değiştirmez.** Mail ayrı bir **outbox/bildirim defteridir** (`ClientNotification`). Mail başarısız olursa masraf talebi / onay / ekstre **bozulmaz**; yalnız `ClientNotification.status=FAILED` + `errorMessage` yazılır. Bu ayrım korunmazsa sistem yine çamura döner.

> **Kanıt (mevcut davranış zaten böyle):** `ClientNotificationService.sendEmail` → ClientNotification `PENDING→SENT/FAILED`; başarısızlıkta finansal state DEĞİŞMEZ (yalnız FAILED+errorMessage). Bu plan bu ayrımı **tüm yeni mail tiplerine** taşır.

## 1. Yeni paralel mail sistemi açılacak mı? → HAYIR
Mevcut hat **reuse** edilir, ikinci bir mail altyapısı kurulmaz:
- `ClientNotification` (schema:3070) — bildirim defteri (status/errorMessage/sentAt/metadata/channel/type) ✅
- `MessageTemplate` (schema:3615) — şablon + `{{token}}` render ✅
- `ClientNotificationService.sendEmail` — Nodemailer/SMTP + ClientNotification yazımı ✅
- `ExpenseNotificationService` — masraf maili render/gönderim ✅
- `MessageTemplateService.renderTemplate` — token değiştirme ✅
Gereken: **yeni şablon kodları + tetik noktaları + en iyi-çaba (best-effort) dispatch + duplicate guard.** Yeni model **gerekmez** (olası tek küçük ekleme: ClientNotification.metadata içinde dedupeKey — §7).

## 2. Mail tipleri ve tetikleri
| # | Mail | Tetik (olay) | Şablon kategorisi | State coupling |
|---|---|---|---|---|
| 1 | Masraf talebi | ExpenseRequest gönder (MEVCUT: `sendExpenseRequest`/`finalize`) | `EXPENSE_REQUEST` (var) | mevcut: başarıda ER.status=SENT *(korunur, değiştirilmez)* |
| 2 | Masraf hatırlatma | MEVCUT: `sendReminder` | `EXPENSE_REMINDER` (var) | mevcut: başarıda REMINDED *(korunur)* |
| 3 | Kısmi ödeme sonrası bakiye | `recordPayment` sonrası (PARTIAL) | **yeni kod** | **YOK** (sadece bildirim) |
| 4 | Ödeme alındı teyidi | `recordPayment` sonrası (RECEIVED/PAID) | **yeni kod** | **YOK** |
| 5 | Müvekkil işlem onayı | `ClientApprovalRequest.send` (DRAFT→SENT) | **yeni kod** | **YOK** (state ayrı, §5) |
| 6 | Onay sonucu teyidi | `ClientApprovalRequest.decision` (APPROVED/REJECTED) | **yeni kod** | **YOK** |
| 7 | Ekstre hazır bildirimi | `ClientStatement.create` (ACTIVE) | **yeni kod** | **YOK** |

> 1–2 **mevcut**; 3–7 **yeni tetik + yeni şablon kodu**. Yeni tiplerin hiçbiri state'i mail'e bağlamaz.

## 3. Otomatik mi, manuel mi? → bu fazda MANUEL/açık tetik
- DO-NOW: her mail **açık bir aksiyonla** gönderilir (endpoint / "Mail gönder" butonu eşdeğeri). Otomatik cron **YOK**.
- Hatırlatma cadence (§8) **soft tasarlanır**: `findDueReminders` (MEVCUT) yalnız **listeler**; gönderim manuel. Cron'a geçiş ayrı/sonraki karar (HOLD).
- Gerekçe: otomatik gönderim erken açılırsa yanlış/çift mail riski + kontrol kaybı. Önce manuel + duplicate guard olgunlaşsın.

## 4. Gönderim modeli — state önce, mail best-effort sonra
```
1) İş/onay/ekstre state geçişi  → AUTHORITATIVE, kendi transaction'ında commit (Faz 2 davranışı)
2) Mail dispatch                → AYRI, best-effort: ClientNotification yaz + gönder
3) Mail başarısız               → ClientNotification.status=FAILED + errorMessage; STATE DEĞİŞMEZ
4) Yeniden gönderim             → manuel "resend" (yeni ClientNotification denemesi)
```
- Dispatch, state commit'inden **sonra** çağrılır; **try/catch** ile sarılır — fırlatsa bile state'i geri almaz (yalnız FAILED kaydı).
- Mevcut `ExpenseNotificationService.sendExpenseRequest`'in başarıda `ER.status=SENT` yapması = **masraf-talebi-gönderme aksiyonunun kendisi** (mail değil "gönderildi" damgası). Korunur; yeni tiplere **kopyalanmaz**.

## 5. `ClientApprovalRequest.send` nasıl genişletilecek?
- PR-2'de `send()` = DRAFT→SENT + event (mail YOK). Bu **state otoritesidir, değişmez.**
- Genişletme: `send()` state'i commit ettikten **sonra**, best-effort bir mail dispatch tetikler (tip #5). Mail başarısız → ClientNotification FAILED; **approval SENT kalır** (geri alınmaz).
- İki seçenek (M-1): (a) dispatch'i `send()` içine commit-sonrası try/catch ile göm, ya da (b) ayrı `POST /:id/send-mail` endpoint'i (state'ten tamamen bağımsız). **Öneri: (a) + ayrıca manuel resend endpoint** (başarısızı tekrar denemek için).

## 6. Mail başarısızlığı ClientNotification'a kaydedilecek mi? → EVET
- Her deneme bir `ClientNotification` (PENDING→SENT/FAILED). FAILED'da `errorMessage` dolu, `sentAt` boş.
- Finansal/onay/ekstre tarafında **hiçbir alan değişmez** (kural §0).
- `ClientNotification.metadata`: `{ refType, refId, templateCode, dedupeKey }` (§7) — hangi kayda dair mail olduğunu izlemek için.

## 7. Duplicate mail engeli
- **Sorun (mevcut):** `sendExpenseRequest` durum kontrolsüz → aynı mail 2× gidebilir; `notificationId` alanı var ama kullanılmıyor.
- **Tasarım:** her mailin **dedupeKey**'i olur: `"{type}:{refType}:{refId}:{bucket}"` (bucket = ör. talep için sabit, hatırlatma için gün/sayı). Dispatch öncesi son **SENT** ClientNotification aynı dedupeKey ile var mı bakılır (metadata index/where) → varsa **gönderme, mevcut kaydı döndür** (idempotent). FAILED kayıt dedupe'u bloklamaz (resend serbest).
- **Karar M-2:** dedupeKey'i `ClientNotification.metadata`'da mı tutalım (migration yok, JSON sorgu) yoksa ayrı `dedupeKey` kolonu mu (indexlenir, migration küçük)? **Öneri: ayrı nullable `dedupeKey` kolonu + index** (güvenilir idempotency; küçük additive migration).

## 8. Reminder cadence (soft)
- Config-driven (ör. `due-2gün`, `overdue+3`, `overdue+7`), ama bu fazda **yalnız liste + manuel gönderim** (`findDueReminders` MEVCUT).
- Her gönderim duplicate guard'a tabi (aynı gün/aşama için tek mail).
- Live cron → **sonraki faz/karar** (HOLD); tasarımda yeri tutulur.

## 9. Bu fazda YAPILMAYACAKLAR
frontend YOK · portal YOK · PDF ekstre YOK · banka mutabakatı YOK · otomatik ödeme linki YOK · WhatsApp/SMS YOK (yalnız EMAIL) · **live cron YOK** (cadence soft/manuel) · delivery webhook/tracking YOK · unsubscribe YOK.

## 10. Multitenant
Tüm hat zaten `tenantId` taşır (ClientNotification/MessageTemplate/ExpenseRequest). Yeni şablonlar tenant başına seed; dispatch `tenantId` + `CurrentUser` ile; kaynak kayıt aynı tenant doğrulanır.

## 11. Faz planı (Faz 3 içi)
| Alt-faz | İçerik |
|---|---|
| 3.1 | **Bu doküman** (kod yok) |
| 3.2 | Şablon kodları (3–7) seed + MessageTemplate kategorileri (M-3) |
| 3.3 | Ortak best-effort `NotificationDispatcher` (reuse ClientNotificationService) + dedupeKey (M-2) |
| 3.4 | Tetik bağlama: approval send/decision (#5/#6), statement ready (#7) — state'ten bağımsız |
| 3.5 | Ödeme mailleri (#3/#4) recordPayment sonrası |
| 3.6 | Manuel resend endpoint + reminder liste/gönder (soft) |
| 3.7 | HOLD: live cron · SMS/WhatsApp · PDF eki · delivery tracking |

Her alt-faz: plan→onay→additive kod→unit+canlı e2e→PR→merge.

## 12. Açık kararlar
| # | Karar | Öneri |
|---|---|---|
| M-1 | Dispatch `send()` içinde mi (best-effort), ayrı endpoint mi? | İçinde (commit-sonrası try/catch) **+** manuel resend endpoint |
| M-2 | dedupeKey: metadata JSON mı, ayrı indexli kolon mu? | **Ayrı nullable `dedupeKey` kolonu + index** (güvenilir idempotency) |
| M-3 | Yeni mail tipleri için MessageTemplate.category enum'a değer eklensin mi? | Az sayıda **yeni kategori** (CLIENT_APPROVAL, STATEMENT_READY, PAYMENT_INFO) — temiz filtre; ya da OTHER+kod (öneri: yeni kategori, additive) |
| M-4 | Otomatik cron bu faza girsin mi? | **Hayır** — soft/manuel; cron HOLD |

> Onaylarsan (M-1..M-4 dahil) Faz 3'ü alt-faz alt-faz, her biri ayrı plan→onay→kod→test→PR ile yazarım. **Bu adımda kod yok.**
