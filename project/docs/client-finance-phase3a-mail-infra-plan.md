# Faz 3 — Alt-faz 3.2 + 3.3: Mail Altyapısı (template seed + dedupeKey + dispatcher + resend) — Uygulama Planı (PLAN-ONLY)

> **Durum:** Uygulama planı. **KOD YOK, MIGRATION YOK, ENDPOINT YOK.** Onaylanınca additive kodlanır.
> **Önkoşul:** Faz 2 MERGED (main `e397c13`). Faz 3 mail planı onaylı (M-1..M-4). ✅
> **Kaynak:** [client-finance-phase3-mail-plan.md](client-finance-phase3-mail-plan.md)
> **Kapsam:** Yalnız **altyapı** — yeni mail tiplerini gönderecek ortak zemin. Tetik bağlama (approval/statement/payment maili) = 3.4/3.5 (bu plan DEĞİL).

## 0. Sınır (değişmez)
- Yeni paralel mail sistemi **YOK**. Reuse: `ClientNotification` · `MessageTemplate` · `ClientNotificationService` · `MessageTemplateService`.
- **Mail finansal/onay/ekstre state'ini DEĞİŞTİRMEZ** (Faz 3 omurga kuralı).
- frontend YOK · portal YOK · PDF YOK · SMS/WhatsApp YOK · **cron YOK** (M-4).
- Bu alt-faz **tetik bağlamaz** (approval/statement/payment maili göndermez); yalnız zemini kurar + manuel resend.

## 1. Şema değişiklikleri (additive)
### 1.1 `ClientNotification` → `dedupeKey` (M-2)
- Yeni alan: `dedupeKey String?` + `@@index([dedupeKey])`.
- `status`/`type` zaten **düz string** (enum değil) — dokunulmaz. `metadata Json?` mevcut, ama idempotency **JSON'a gömülmez** (M-2: ayrı indexli kolon → güvenilir "aynı mail gitti mi?" sorgusu).
- Nullable: eski kayıtlar + dedupe gerektirmeyen mailler null kalır.

### 1.2 `MessageTemplateCategory` enum → 3 yeni değer (M-3)
- `ALTER TYPE` ile ekle: `CLIENT_APPROVAL`, `STATEMENT_READY`, `PAYMENT_INFO`.
- Mevcut değerler (CLIENT_INFO/EXPENSE_REQUEST/EXPENSE_REMINDER/COLLECTION_INFO/DEBTOR_NOTICE/GREETING/OTHER) korunur.
- Desen mevcut (BANK_INTEGRATION `ALTER TYPE ADD VALUE` migration'ı). **Not:** PG'de enum ADD VALUE aynı transaction içinde **kullanılamaz**; bu migration yalnız değer ekler (seed ayrı çalışır) → sorun yok.

> Migration: 1 dosya (dedupeKey kolon+index **+** 3 enum ADD VALUE). `migrate diff`'teki alakasız `IcrabotTimelineEntry` DROP INDEX **kasten hariç** (Faz 2 ile aynı drift). Risk **düşük** (additive).

## 2. Şablon seed (3.2)
- `MessageTemplateService.seedDefaultTemplates` (MEVCUT) **genişletilir** — ayrı seed sistemi açılmaz.
- Yeni `isSystem=true` EMAIL şablonları (tenant başına, idempotent upsert by `[tenantId, code]`):

| code | category | konu (özet) | tokenlar (mevcut havuzdan) |
|---|---|---|---|
| `PARTIAL_PAYMENT_BALANCE` | `PAYMENT_INFO` | Kısmi ödeme alındı, kalan bakiye | clientName, caseFileNumber, totalAmount, ödenen, kalan |
| `PAYMENT_RECEIVED` | `PAYMENT_INFO` | Ödeme alındı teyidi | clientName, caseFileNumber, totalAmount |
| `APPROVAL_REQUEST` | `CLIENT_APPROVAL` | İşlem onayı talebi | clientName, caseFileNumber, subjectLabel |
| `APPROVAL_RESULT` | `CLIENT_APPROVAL` | Onay sonucu teyidi | clientName, caseFileNumber, subjectLabel, karar |
| `STATEMENT_READY` | `STATEMENT_READY` | Ekstre hazır | clientName, caseFileNumber, dönem, closingBalance |

- Token render: mevcut `renderTemplate` (`{{token}}` regex). Yeni token gerekiyorsa (ödenen/kalan/karar/dönem/closingBalance) dispatcher token sözlüğüne eklenir (render motoru değişmez).
- **Idempotent:** seed tekrar çalışınca duplicate üretmez (upsert/existence check).

## 3. Best-effort dispatcher (3.3)
Ortak, ince bir `NotificationDispatcher` (reuse `ClientNotificationService.sendEmail`):
```
dispatch(tenantId, userId, {
  clientId, caseId?, templateCode, tokens, type, refType, refId, dedupeKey, channel='EMAIL'
}): Promise<DispatchResult>   // ASLA throw etmez (best-effort)
```
Akış:
1. **Idempotency:** verilen `dedupeKey` için **SENT** `ClientNotification` var mı? → varsa **gönderme**, `{ skipped:true, existingId }` döndür.
2. Şablonu `templateCode`+tenant ile bul, tokenları render et.
3. `ClientNotificationService.sendEmail`'i **try/catch** içinde çağır (sendEmail ClientNotification'ı PENDING→SENT/FAILED yazar + başarısızda throw eder). Dispatcher **catch'te yutar** → çağırana fırlatmaz.
4. `dedupeKey` yeni ClientNotification'a yazılır (sendEmail DTO'su `dedupeKey?` ile genişletilir).
5. Sonuç: `{ sent | failed | skipped, notificationId }`.

**Sözleşme:** dispatcher state-sahibi çağırandan **bağımsız** ve **best-effort**. State commit'i ZATEN olmuştur; dispatcher hiçbir koşulda state'i geri almaz. (Faz 3 omurgası §0.)

### dedupeKey formülü (m3a-1)
`"{templateCode}:{refType}:{refId}:{bucket}"`
- talep/onay/ekstre/ödeme-teyit: `bucket="1"` (sabit → tek mail).
- hatırlatma (sonraki alt-fazda kullanılacak): `bucket="r{reminderCount}"` veya `"{YYYY-MM-DD}"` (günde tek).
- **FAILED dedupe'u bloklamaz** — yalnız SENT idempotency sağlar (başarısız tekrar denenebilir).

## 4. Manuel resend (3.3)
- Davranış: bir başarısız/eksik bildirimi **tekrar dene**.
- Endpoint (tarif): `POST /client-notifications/:id/resend` veya ref-bazlı `POST /client-notifications/resend` `{ refType, refId, templateCode }`.
- Kural (m3a-2): resend yalnız o `dedupeKey` için **SENT yoksa** çalışır (zaten gönderilmişi tekrar göndermez). Gerçekten tekrar SENT maili göndermek istenirse **explicit `force=true`** (yeni dedupeKey bucket'ı) — varsayılan değil.
- Resend de best-effort (throw etmez; FAILED kaydeder).

## 5. Multitenant / immutability
- Tüm sorgu/yazım `tenantId` filtreli; `tenantId`/`userId` `CurrentUser`'dan.
- `ClientNotification` bir **defter**: dispatcher kayıt **ekler**, mevcut kaydı içerik olarak güncellemez (status/sentAt/errorMessage hariç — bunlar sendEmail'in mevcut davranışı). Resend = **yeni** deneme kaydı (eskiyi ezmez).

## 6. Endpoint'ler (TARİF — kod yok)
| Method | Path | Not |
|---|---|---|
| POST | `/client-notifications/resend` | manuel resend (ref-bazlı, best-effort) |
| GET | `/client-notifications/case/:caseId` | (opsiyonel) bildirim defteri listesi/durum |

> Tetik endpoint'leri (approval/statement/payment maili) **bu alt-fazda yok** → 3.4/3.5.

## 7. Test planı
**Unit:** dispatcher idempotency (aynı dedupeKey SENT → skip, sendEmail çağrılmaz) · başarısızlık **yutulur** (dispatcher throw etmez, ClientNotification FAILED) · template render doğru token · resend SENT varken göndermez (force hariç) · cross-tenant şablon/bildirim görünmez.
**E2e (canlı DB):** seed sonrası şablon bulunur · dispatch → ClientNotification SENT + dedupeKey yazılı · ikinci dispatch (aynı key) → skip (tek kayıt) · SMTP yoksa/мock fail → FAILED + errorMessage, **çağırana exception sızmaz** · tenant izolasyonu. (Gerçek SMTP yoksa mock/expected-fail ile doğrulanır.) Temizlenir.
**Negatif:** dispatcher hiçbir senaryoda state-sahibi akışı bozmaz (throw yok).

## 8. Migration riski / rollback
- Additive: 1 kolon+index + 3 enum değeri + seed (veri). Risk **düşük**.
- enum ADD VALUE geri alınamaz (PG) ama kullanılmıyorsa zararsız; rollback'te kolon/index drop + seed satırları silinir.
- Dispatcher ayrı servis → PR revert mevcut hatları kırmaz (reuse, additive).

## 9. Açık micro-kararlar
| # | Karar | Öneri |
|---|---|---|
| m3a-1 | dedupeKey bucket formülü | sabit "1" (talep/onay/ekstre/teyit); hatırlatma için gün/sayı (sonraki faz) |
| m3a-2 | resend SENT varken davranışı | engelle; yalnız `force=true` ile yeni bucket |
| m3a-3 | seed: mevcut `seedDefaultTemplates` genişlet mi, ayrı script mi? | **mevcut genişlet** (idempotent upsert) |
| m3a-4 | dispatcher token sözlüğü nerede? | dispatcher input'unda `tokens` map (çağıran doldurur); render motoru değişmez |

> Onaylarsan (m3a-1..m3a-4 dahil) bu alt-fazı plan→additive kod→unit+canlı e2e→PR ile yazarım. **Bu adımda kod yok.**
