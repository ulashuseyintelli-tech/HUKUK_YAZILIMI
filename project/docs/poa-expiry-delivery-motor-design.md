# ADR — POA (Vekalet) Süre Dolumu Bildirim Motoru (P0 Karar Belgesi)

- **Durum:** PROPOSED (P0). **Kod yok.** Bu ADR onaylanmadan P2 motor uygulamasına başlanmaz.
- **Tarih:** 2026-06-27
- **Sahiplik / domain:** P2 motor (`automation.service` + cron + scheduler) **CODEX/automation alanı**dır. Claude bu ADR'yi ve (istenirse) Bildirim Kontrol Merkezi'nin kart-okuma kısmını yazabilir; cron/teslimat yeniden yazımı Codex veya açık owner yönlendirmesi ile yapılır.
- **İlgili:** Bildirim Kontrol Merkezi (N1.5/N2/N3 — PR #530, #534). Bu motor, Bildirim Merkezi'ndeki amber **"Vekalet Süresi Uyarısı → Teslimat eksik"** kartını gerçekten yeşile çevirmeyi hedefler.

> **Tek cümle:** Vekalet süre-dolumu uyarısı şu an gerçek bir bildirim motoru değil; **iç-ekip (avukat)** bildirimi olarak, mevcut gerçek transport (`TenantNotifierService`) ile e-posta gönderecek, ayrı bir iç teslimat-loguna yazacak ve dedupe ile spam'i önleyecek biçimde **P2'de tek dikey-dilim (vertical slice)** olarak kurulacaktır.

---

## 1. Bağlam (forensic özeti — kanıtlı)

Mevcut akış üç noktadan **kırık**:

| Bulgu | Kanıt |
| --- | --- |
| POA cron `ClientPowerOfAttorney` `validUntil` 0–30 gün penceresini okur, `NotificationQueue`'ya `POA_EXPIRING` PENDING e-posta satırı yazar; **alıcı = tenant ADMIN**. | `automation.service.ts:180-275` (özellikle 234-268) |
| **(a) Hiç teslim edilmiyor:** `NotificationQueue` PENDING satırlarını alıp gönderen hiçbir cron/worker/servis **yok** (kapsamlı grep). `notification.service.sendEmail/sendSMS` **simülasyon**. | `notification.service.ts:172-217` (findPending yalnız `GET /notifications/pending`'e bağlı; sendEmail/sendSMS yalnız `create`) |
| **(b) Dedupe yok:** aynı vekalet için ADMIN'e 30 güne kadar **her gün** aynı satır (drain olsa spam; şu an sink'te birikir). | `automation.service.ts:192-268` (dedupe damgası yok) |
| **(c) Yanlış alıcı:** avukatlar e-posta gövdesine include edilmiş ama **alıcı ADMIN** seçiliyor. | `automation.service.ts:205-211, 234-258` |
| 30 gün eşiği **hardcoded**. `Office`'te POA ayarı **yok**. | `poa.service.ts:484`, `poa.controller.ts:62-67`; `Office` modelinde POA alanı yok (`schema.prisma:1679-1769`) |
| **Gerçek iç-ekip transport zaten var:** escalation `TenantNotifierService` (nodemailer + NetGSM) avukat/yöneticiye gönderir ve `NotificationQueue` kullanmaz. | `tenant-notifier.service.ts:44-101` |

Bu yüzden Bildirim Merkezi'ndeki amber **"Teslimat eksik"** etiketi **doğru** ve yeşile ancak **gerçek teslimat + log + dedupe** canlı olunca döner.

---

## 2. Kilitli kararlar

| # | Konu | KARAR |
| - | --- | --- |
| 1 | Bildirim tipi | **İç-ekip bildirimi** (vekalet takibi büronun/avukatın işi) |
| 2 | Müvekkile gider mi? | **Hayır** (bu akışta). Müvekkile "yenileme hatırlatması" ayrı/opsiyonel ve **kapsam dışı** |
| 3 | Birincil alıcı | **Vekaletteki aktif avukat(lar)** (`PoaLawyer`) |
| 4 | Alıcı öncelik zinciri | `isPrimary` aktif avukat → tüm aktif POA avukatları → `Office.escalationManagerLawyerIds` → tenant ADMIN (son çare) |
| 5 | İlk kanal | **E-posta** (MVP e-posta-only) |
| 6 | SMS | **Sonraki faz (P3)**; kritik eşikte opsiyonel (`Lawyer.mobilePhone`) |
| 7 | Eşik | Başlangıçta **30 gün** |
| 8 | Tekrar | **MVP: tek sefer** |
| 9 | Kademeli uyarı | **Sonraki faz (P3): 30 / 7 / 1 gün** |
| 10 | Log modeli | **İç-ekip teslimat logu** (yeni dar model; §4) — `ClientNotification` **değil** |
| 11 | `ClientNotification` | **Kullanılmaz** (`clientId` NOT NULL → müvekkile giden model) |
| 12 | `NotificationQueue` | POA için **bypass/deprecate**; drainer **yazılmaz**; eski POA yazımı kaldırılır/legacy bırakılır |
| 13 | Dedupe | **Zorunlu** (§5). Dedupe'suz motor kabul **edilmez** |
| 14 | Görünür Büro Ayarı | Motor okumadan **görünür/değiştirilebilir POA toggle/ayar EKLENMEZ** (sahte ayar yaratmamak için) |
| 15 | Kart yeşile ne zaman? | Yalnız **gerçek teslimat + log + dedupe canlı** olunca (§7) |

---

## 3. Doğru alıcı çözümleme (domain)

`ClientPowerOfAttorney` müvekkile (`clientId`) ve `PoaLawyer[]` ara-tablosu üzerinden avukat(lar)a bağlıdır; **`caseId` yoktur** (dolayısıyla "dosya sorumlusu" / `CaseLawyer.isResponsible` / `Case.sorumluPersonelId` bu modelden **çözülemez** — köprü yok). Tenant `client.tenantId` üzerinden çözülür.

**Öncelik zinciri (additive fallback — davranışı bozmadan):**

1. `PoaLawyer.isPrimary = true` olan **aktif** avukat → `Lawyer.email`
2. yoksa vekaletteki **tüm aktif** avukatlar → her birinin `Lawyer.email`
3. avukat çözülemez/e-postası yoksa → `Office.escalationManagerLawyerIds` (büro yöneticisi)
4. son çare → tenant **ADMIN** (mevcut davranış; yalnız fallback)

Kanıt: `schema.prisma:537-600` (POA + `PoaLawyer.isPrimary`), `:1817-1819` (`Lawyer.email`/`mobilePhone`), `:1738-1739` (`Office.escalation*LawyerIds`).

---

## 4. Veri modeli kararı (iç teslimat logu)

- **`ClientNotification` KULLANILMAZ:** `clientId` NOT NULL ve her gönderim yolu alıcıyı **müvekkilin** kendi iletişiminden çözer (`client-notification.service.ts:411-419,513-524`). İç-ekip uyarısı için semantik olarak yanlış.
- **`EscalationEvent` KULLANILMAZ:** `taskId` NOT NULL + `Task` relation + `EscalationTier`/`EscalationEventType` alanları **görev-eskalasyonuna** özeldir (`schema.prisma:1539-1556`); generic iç-log değildir. POA'da görev yoktur → uydurma `taskId` gerekir. Reponun yerleşik deseni de domain-özel append-only loglardır (`EscalationEvent` + `CaseTaskEscalationEvent` ayrı tablolar).
- **KARAR:** P2'de yeni, **dar, append-only** model: **`PoaExpiryNotificationDelivery`** (additive migration). Önerilen alanlar (kesin şema P2'de):
  - `id`, `tenantId`, `poaId` (`ClientPowerOfAttorney` FK, Cascade)
  - `recipientType` (`LAWYER` | `ESCALATION_MANAGER` | `ADMIN_FALLBACK`), `recipientRef` (lawyerId/userId), `recipientEmail` (maskeli gösterim UI'da)
  - `channel` (`EMAIL`; SMS P3)
  - `stage` (Int; MVP `30`)
  - `status` (`SENT` | `FAILED`), `errorMessage?`, `sentAt?`, `createdAt`
  - `dedupeKey` **UNIQUE** (§5)

> Not: "InternalNotificationDelivery" gibi daha generic bir tablo **şimdilik açılmaz** (YAGNI; reponun deseni domain-özel log). İleride birden çok iç-uyarı tipi gerçek olursa generalize edilir — önceden değil.

---

## 5. Dedupe kararı (zorunlu)

- **Anahtar:** `dedupeKey = "poa_expiry:{tenantId}:{poaId}:{validUntil}:{stage}"` — **DB UNIQUE** (Task.dedupeKey gibi sert garanti; `ClientNotification.dedupeKey`'in non-unique app-level kontrolünden daha güçlü).
- **Yalnız-başarıda-damgala** (greeting/escalation'da kanıtlı desen: `greeting.service.ts:427-430`, `escalation-logic.ts:96-108`):
  1. Gönderim öncesi bu anahtarla **SENT kaydı var mı** bak → varsa **atla**.
  2. Gönder.
  3. **Başarı →** SENT kaydını insert et. UNIQUE anahtar, eşzamanlı çift-gönderimi DB'de engeller (kaybeden taraf unique-violation alır → sessizce yutulur).
  4. **Başarısızlık →** SENT kaydı yazma → bir sonraki cron **retry** eder.
- `validUntil` anahtarda olduğu için vekalet **yenilenip** yeni bir `validUntil` aldığında uyarı meşru biçimde **yeniden** tetiklenebilir.
- FAILED gözlemlenebilirliği (Bildirim Merkezi "Neden Gitmedi?") için başarısız denemeler `ErrorLog`'a veya teslimat-loguna ayrı yazılabilir — **mekanizma P2 detayı** (§8).

---

## 6. Faz planı

- **P0 — bu ADR (kod yok).** Kararları kilitler. [Claude]
- **P1 — Görünür Büro Ayarı YOK.** Motor henüz okumayacağı için Büro Ayarları'na görünür/değiştirilebilir POA toggle/kanal/alıcı **eklenmez** (sahte ayar yaratmaz). İzin verilen tek P1 işi: bu ADR + (gerekirse) amber kart metninin netleştirilmesi. **Ayar, motorla birlikte P2'de gelir.**
- **P2 — Gerçek dikey-dilim (DAVRANIŞ DEĞİŞİR; CODEX/automation).** Aynı PR'da: alıcı çözümleme → `TenantNotifierService` ile **gerçek** e-posta → `PoaExpiryNotificationDelivery` log → dedupe → (gerekiyorsa motorun okuduğu, görünür-toggle-olmayan eşik konfigürasyonu) → eski `NotificationQueue` POA yazımı kaldırılır/bypass → Bildirim Merkezi POA kartı **gerçek durumdan** beslenir. Kart **yeşile** döner.
- **P3 — Kademeli 30/7/1 + kritik SMS** (`Lawyer.mobilePhone`).

---

## 7. Kabul kriteri — kart ne zaman yeşil?

POA kartı amber "Teslimat eksik" kalır; **yeşile** yalnız şunların hepsi canlıyken döner:

1. Gerçek e-posta **vekalet avukatına** (öncelik zinciri) teslim edilir (`TenantNotifierService`).
2. Her gönderim `PoaExpiryNotificationDelivery`'ye SENT/FAILED olarak loglanır.
3. Dedupe canlı (aynı vekalet/aşama tek kez; spam yok).
4. Bildirim Merkezi POA kartı bu logdan beslenir (status, son çalışma, "Son Gönderimler"de POA satırı, "Neden Gitmedi?"de FAILED).

---

## 8. Açık P2 uygulama detayları (ADR'de karar değil; P2'de çözülür)

- `PoaLawyer.isPrimary` veri girişinde her zaman set ediliyor mu? Set edilmemişse fallback = tüm aktif vekiller.
- Avukat aktiflik/e-posta-yokluk halinde fallback zincirinin tam davranışı (manager → ADMIN).
- FAILED gözlemlenebilirlik mekanizması (`ErrorLog` vs teslimat-logu satırı).
- Motorun okuyacağı eşik konfig alanlarının kesin yeri/adı (görünür toggle **değil**).
- Eski `automation.service` POA `NotificationQueue` yazımının kaldırılması mı yoksa legacy-no-op bırakılması mı.

---

## 9. Non-goals (yapılmayacaklar — net)

- `NotificationQueue` drainer **yazılmaz**; POA için bypass.
- `ClientNotification` **kullanılmaz**.
- Motor yokken **görünür Büro Ayarı/toggle eklenmez**.
- Müvekkile yenileme hatırlatması **bu kapsamda değil** (ayrı, sonra).
- Per-user bildirim tercihleri ve KVKK kanal-bazlı rıza **kapsam dışı**.
- **Dedupe'suz cron kabul edilmez.**

---

## 10. Onay

Bu ADR onaylandıktan sonra P2 (CODEX/automation) için uygulama planı çıkarılır. ADR'de bir karar değişirse bu dosya güncellenir (tek karar defteri).
