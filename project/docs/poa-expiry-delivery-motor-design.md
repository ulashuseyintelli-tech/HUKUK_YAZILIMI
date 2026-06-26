# ADR — POA (Vekalet) Süre Dolumu Bildirim Motoru (P0 Karar Belgesi)

- **Durum:** PROPOSED (P0). **Kod yok.** Bu ADR onaylanmadan P2 motor uygulamasına başlanmaz.
- **Tarih:** 2026-06-27 · **Revizyon:** v3 (atomik retry edinimi + exactly-once sınır notu; v2: dedupe rezervasyon; bkz. §11)
- **Sahiplik / domain:** P2 motor (`automation.service` + cron + scheduler) **CODEX/automation alanı**dır. Claude bu ADR'yi ve (istenirse) Bildirim Kontrol Merkezi'nin kart-okuma kısmını yazabilir; cron/teslimat yeniden yazımı Codex veya açık owner yönlendirmesi ile yapılır.
- **İlgili:** Bildirim Kontrol Merkezi (N1.5/N2/N3 — PR #530, #534). Bu motor, Bildirim Merkezi'ndeki amber **"Vekalet Süresi Uyarısı → Teslimat eksik"** kartını gerçekten yeşile çevirmeyi hedefler.

> **Tek cümle:** Vekalet süre-dolumu uyarısı şu an gerçek bir bildirim motoru değil; **iç-ekip (avukat)** bildirimi olarak, mevcut gerçek transport (`TenantNotifierService`) ile e-posta gönderecek, **gönderimden önce alınan rezervasyon-tabanlı dedupe** ile çift-gönderimi/spam'i önleyecek ve ayrı bir iç teslimat-loguna yazacak biçimde **P2'de tek dikey-dilim (vertical slice)** olarak kurulacaktır.

---

## 1. Bağlam (forensic özeti — kanıtlı)

Mevcut akış üç noktadan **kırık**:

| Bulgu | Kanıt |
| --- | --- |
| POA cron `ClientPowerOfAttorney` `validUntil` 0–30 gün penceresini okur, `NotificationQueue`'ya `POA_EXPIRING` PENDING e-posta satırı yazar; **alıcı = tenant ADMIN**. | `automation.service.ts:180-275` (özellikle 234-268) |
| **(a) Hiç teslim edilmiyor:** `NotificationQueue` PENDING satırlarını alıp gönderen hiçbir cron/worker/servis **yok**. `notification.service.sendEmail/sendSMS` **simülasyon**. | `notification.service.ts:172-217` |
| **(b) Dedupe yok:** aynı vekalet için ADMIN'e 30 güne kadar **her gün** aynı satır (drain olsa spam; şu an sink'te birikir). | `automation.service.ts:192-268` |
| **(c) Yanlış alıcı:** avukatlar e-posta gövdesine include edilmiş ama **alıcı ADMIN** seçiliyor. | `automation.service.ts:205-211, 234-258` |
| 30 gün eşiği **hardcoded**. `Office`'te POA ayarı **yok**. | `poa.service.ts:484`, `poa.controller.ts:62-67`; `schema.prisma:1679-1769` |
| **Gerçek iç-ekip transport zaten var:** escalation `TenantNotifierService` (nodemailer + NetGSM) avukat/yöneticiye gönderir, `NotificationQueue` kullanmaz. | `tenant-notifier.service.ts:44-101` |

Bu yüzden Bildirim Merkezi'ndeki amber **"Teslimat eksik"** etiketi **doğru** ve yeşile ancak **gerçek teslimat + log + dedupe** canlı olunca döner.

---

## 2. Kilitli kararlar

| # | Konu | KARAR |
| - | --- | --- |
| 1 | Bildirim tipi | **İç-ekip bildirimi** (vekalet takibi büronun/avukatın işi) |
| 2 | Müvekkile gider mi? | **Hayır** (bu akışta). Müvekkile "yenileme hatırlatması" ayrı/opsiyonel ve **kapsam dışı** |
| 3 | Birincil alıcı | **Vekaletteki aktif avukat(lar)** (`PoaLawyer`) — §3 algoritması |
| 4 | Alıcı önceliği (MVP) | aktif `isPrimary` varsa **yalnız primary** → yoksa **tüm aktif** POA avukatları → `Office.escalationManagerLawyerIds` → tenant ADMIN (son çare) |
| 5 | İlk kanal | **E-posta** (MVP e-posta-only) |
| 6 | SMS | **Sonraki faz (P3)**; kritik eşikte opsiyonel (`Lawyer.mobilePhone`) |
| 7 | Eşik | **30 gün** (MVP'de SABİT/hardcoded) |
| 8 | Tekrar | **MVP: tek sefer** (stage başına bir kez) |
| 9 | Kademeli uyarı | **Sonraki faz (P3): 30 / 7 / 1 gün** |
| 10 | Log modeli | Yeni **dar** `PoaExpiryNotificationDelivery` (§4) — `ClientNotification` **değil**, `EscalationEvent` **değil** |
| 11 | `ClientNotification` | **Kullanılmaz** (`clientId` NOT NULL → müvekkile giden model) |
| 12 | `NotificationQueue` | POA için **bypass/deprecate**; drainer **yazılmaz**; eski POA yazımı kaldırılır/legacy |
| 13 | Dedupe | **Zorunlu + REZERVASYON-tabanlı** (§5). Dedupe'suz veya check-then-act dedupe **kabul edilmez** |
| 14 | Status | `PENDING \| SENT \| FAILED` (rezervasyon için PENDING şart) |
| 15 | Görünür Büro Ayarı | Motor okumadan **görünür/değiştirilebilir POA ayarı EKLENMEZ**. **P2 MVP'de Office ayarı da YOK** (sabit D30/EMAIL/tek-sefer). Office ayarları **P3/P4** |
| 16 | Alıcı e-postası (PII) | Raw e-posta DB'ye **yazılmaz**; `recipientRef` + `recipientEmailMasked` saklanır (raw, `Lawyer`/`User` kaydından çözülür) |
| 17 | P2 sahipliği | **Codex/automation** (ADR onayından sonra) |
| 18 | Kart yeşile ne zaman? | Yalnız **gerçek teslimat + log + dedupe canlı** olunca (§7) |

---

## 3. Doğru alıcı çözümleme (domain) — net algoritma

`ClientPowerOfAttorney` müvekkile (`clientId`) ve `PoaLawyer[]` ara-tablosu üzerinden avukat(lar)a bağlıdır; **`caseId` yoktur** → "dosya sorumlusu" / `CaseLawyer.isResponsible` / `Case.sorumluPersonelId` bu modelden **çözülemez** (köprü yok). Tenant `client.tenantId` üzerinden.

**Alıcı seçimi (MVP):**

```
1. Aktif isPrimary PoaLawyer VARSA  → yalnız PRIMARY avukata gönder.        (recipientType=LAWYER)
2. Primary YOKSA                     → tüm AKTİF POA avukatlarına gönder.    (recipientType=LAWYER, her biri ayrı kayıt+dedupeKey)
3. Hiç aktif POA avukatı YOKSA       → Office.escalationManagerLawyerIds.    (recipientType=ESCALATION_MANAGER)
4. O da YOKSA                        → tenant ADMIN (son çare).              (recipientType=ADMIN_FALLBACK)
```

"primary varsa yine tüm vekillere kopya gitsin mi?" → **ayrı ürün kararı (P3+)**, MVP'de hayır (spam riskini düşük tutmak için).

Kanıt: `schema.prisma:537-600` (POA + `PoaLawyer.isPrimary`), `:1817-1819` (`Lawyer.email`/`mobilePhone`), `:1738-1739` (`Office.escalation*LawyerIds`).

---

## 4. Veri modeli kararı (iç teslimat logu)

- **`ClientNotification` KULLANILMAZ:** `clientId` NOT NULL; her gönderim yolu alıcıyı **müvekkilden** çözer (`client-notification.service.ts:411-419,513-524`). İç-ekip uyarısı için semantik yanlış.
- **`EscalationEvent` KULLANILMAZ:** `taskId` NOT NULL + `Task` relation + `EscalationTier`/`EscalationEventType` görev-eskalasyonuna özeldir (`schema.prisma:1539-1556`); POA'da görev yok → sahte `taskId` gerekir (kabul edilemez).
- **KARAR:** P2'de yeni, **dar, append-update** model **`PoaExpiryNotificationDelivery`** (additive migration). Generic `InternalNotificationDelivery` **açılmaz** (YAGNI; repo deseni domain-özel log).

**Önerilen şema (kesin alanlar P2'de):**

```
PoaExpiryNotificationDelivery
- id
- tenantId
- poaId                  (ClientPowerOfAttorney FK, Cascade)
- recipientType          LAWYER | ESCALATION_MANAGER | ADMIN_FALLBACK
- recipientRef           lawyerId veya userId
- recipientEmailMasked   maskeli/diagnostic (RAW e-posta DB'ye YAZILMAZ — PII; raw Lawyer/User'dan çözülür)
- channel                EMAIL            (SMS = P3)
- stage                  D30              (Int/enum; P3'te D7/D1)
- status                 PENDING | SENT | FAILED
- dedupeKey              @unique          (§5)
- attemptCount           Int @default(0)
- reservedAt             DateTime?        (rezervasyon/kilit zamanı; stale-reservation kurtarma için)
- lastAttemptAt          DateTime?
- nextRetryAt            DateTime?
- sentAt                 DateTime?
- errorMessage           String?
- createdAt / updatedAt
```

---

## 5. Dedupe kararı — REZERVASYON-TABANLI (kritik)

> **v1 düzeltmesi:** "SENT yoksa gönder → başarıda insert" YANLIŞTI. UNIQUE constraint **logu** tekilleştirir ama **gönderimi engellemez**: iki worker aynı anda "SENT yok" görüp ikisi de e-posta gönderebilir; sonra biri insert eder, diğeri conflict alır → **DB'de tek kayıt ama iki e-posta gitmiş** olur. Kilit gönderimden **ÖNCE** alınmalıdır.

**Doğru algoritma (rezervasyon = gönderimden önce unique-insert):**

```
1. Gönderimden ÖNCE: dedupeKey ile bir delivery satırı CREATE et (status=PENDING, reservedAt=now).
   dedupeKey @unique olduğu için bu INSERT, rezervasyon/kilit görevi görür.
2. INSERT unique-conflict verirse, mevcut satıra bak:
   - status=SENT     → ATLA (zaten gönderilmiş)
   - status=PENDING  → başka worker rezerve etmiş/gönderiyor → ATLA
                       (reservedAt çok eskiyse = stale/crash → kurtarma: yeniden rezerve; eşik P2 detayı)
   - status=FAILED   → retry edinimi ATOMİK olmalı (aşağıdaki conditional update; check-then-act YASAK).
                       AYNI satır üzerinden; YENİ duplicate kayıt OLUŞTURMA.
3. Yalnız rezervasyonu (PENDING insert/claim) BAŞARIYLA alan worker gerçek e-postayı gönderir
   (TenantNotifierService).
4. Gönderim sonucu AYNI satıra yazılır:
   - başarı      → status=SENT, sentAt=now
   - başarısızlık → status=FAILED, errorMessage, attemptCount++, lastAttemptAt, nextRetryAt
```

**Retry edinimi — ATOMİK (compare-and-set; check-then-act YASAK):**

> FAILED bir satırın retry'ı da yarışa düşebilir: iki worker aynı anda "FAILED + `nextRetryAt` geçmiş" görüp ikisi de gönderebilir. Bu yüzden retry hakkı **atomik conditional update** ile kazanılır; gönderimi **yalnız** güncellemeyi kazanan worker yapar.

```
// Retry hakkını atomik al: FAILED → PENDING (yalnız retryable; tam 1 satır eşleşir)
const count = await prisma.poaExpiryNotificationDelivery.updateMany({
  where: { dedupeKey, status: 'FAILED', nextRetryAt: { lte: now } },
  data:  { status: 'PENDING', reservedAt: now, lastAttemptAt: now, attemptCount: { increment: 1 } },
});
if (count !== 1) {
  // başka worker retry hakkını kaptı VEYA satır artık retryable değil → ATLA
} else {
  // yalnız bu worker gönderir → TenantNotifierService → sonra SENT/FAILED güncelle
}
```

SQL eşdeğeri: `UPDATE PoaExpiryNotificationDelivery SET status='PENDING', reservedAt=now(), lastAttemptAt=now(), attemptCount=attemptCount+1 WHERE dedupeKey=? AND status='FAILED' AND nextRetryAt<=now();` → yalnız **affected rows = 1** olan worker gönderir.

**Gerçeklik / sınır — exactly-once DEĞİL:** Bu tasarım **eşzamanlı çift-gönderimi** (concurrent duplicate) engeller. Ancak dış e-posta/SMS sağlayıcılarıyla **mutlak exactly-once GARANTİ ETMEZ**: worker e-postayı gönderip provider kabul ettikten **sonra** DB'ye SENT yazamadan **crash** olursa, sonradan stale PENDING/retry ikinci bir e-posta gönderebilir. Bu **crash-after-send-before-SENT** penceresi **kabul edilen, sınırlı bir risktir** — P2'de "matematiksel exactly-once" **varsayılmaz**.

**Neden çift-gönderim engellenir:** iki worker aynı anda INSERT dener; UNIQUE yüzünden **yalnız biri** PENDING satırı yaratır (kilidi kazanır), diğeri conflict alıp "PENDING var → atla" der. Kilit gönderimden **önce** alındığı için yalnız **tek** e-posta çıkar.

**Dedupe anahtarı (alıcı + kanal dahil — kaba değil):**

```
dedupeKey = "poa_expiry:{tenantId}:{poaId}:{validUntilDate}:{stage}:{channel}:{recipientType}:{recipientRef}"
örn:        "poa_expiry:t1:poa123:2026-07-26:D30:EMAIL:LAWYER:lawyer456"
```

- `validUntilDate` = **`YYYY-MM-DD` normalize** (timezone kaynaklı kayma olmasın).
- Böylece: aynı avukata aynı stage **tek kez**; **farklı avukatlara ayrı ayrı** gidebilir; SMS gelince (P3) e-posta'yı bloklamaz; `validUntil` değişirse (yenileme) **yeni** uyarı meşru.

---

## 6. Faz planı

- **P0 — bu ADR (kod yok).** Kararları kilitler. [Claude]
- **P1 — Görünür Büro Ayarı YOK.** İzin verilen tek iş: bu ADR + (gerekirse) amber kart metni netleştirme.
- **P2 — Gerçek dikey-dilim (DAVRANIŞ DEĞİŞİR; CODEX/automation).** Aynı PR'da, **SABİT** parametrelerle (EMAIL-only · D30 · tek-sefer · dedupe-rezervasyon): alıcı çözümleme (§3) → `TenantNotifierService` ile **gerçek** e-posta → `PoaExpiryNotificationDelivery` (PENDING→SENT/FAILED, rezervasyon) → eski `NotificationQueue` POA yazımı kaldırılır/bypass → Bildirim Merkezi POA kartı **gerçek durumdan** beslenir → **yeşil**. **Office ayarı bu fazda EKLENMEZ** (erken sahte-toggle riskine dönmemek için).
- **P3 — Kademeli 30/7/1 + kritik SMS** (`Lawyer.mobilePhone`) **+ Office ayarları** (`poaExpiryEnabled`, `poaWarningDays`, `poaWarningChannels`, `poaSmsCriticalStages`) — motor bunları **gerçekten okuduğunda** görünür hale gelir.

---

## 7. Kabul kriteri — kart ne zaman yeşil?

POA kartı amber "Teslimat eksik" kalır; **yeşile** yalnız şunların hepsi canlıyken döner:

1. Gerçek e-posta **vekalet avukatına** (§3 zinciri) teslim edilir (`TenantNotifierService`).
2. Her gönderim `PoaExpiryNotificationDelivery`'ye PENDING→SENT/FAILED loglanır (rezervasyon).
3. Dedupe canlı (aynı vekalet/aşama/alıcı/kanal tek kez; spam yok; çift-gönderim yok).
4. Bildirim Merkezi POA kartı bu logdan beslenir (status, son çalışma, "Son Gönderimler"de POA satırı, "Neden Gitmedi?"de FAILED).

---

## 8. Açık P2 uygulama detayları (ADR'de karar değil; P2'de çözülür)

- `PoaLawyer.isPrimary` veri girişinde her zaman set ediliyor mu? Set edilmemişse §3-adım-2'ye düşülür (tüm aktif vekiller).
- Stale PENDING rezervasyon eşiği (worker crash kurtarma): `reservedAt` ne kadar eskiyse yeniden-rezerve edilir.
- FAILED retry politikası (kaç deneme, `nextRetryAt` backoff) — MVP'de basit; spam üretmeyecek.
- FAILED gözlemlenebilirlik: teslimat-logu satırı zaten FAILED tutuyor; Bildirim Merkezi "Neden Gitmedi?" bundan beslenir.
- Eski `automation.service` POA `NotificationQueue` yazımının kaldırılması mı yoksa legacy-no-op mu.

---

## 9. Non-goals (yapılmayacaklar — net)

- `NotificationQueue` drainer **yazılmaz**; POA için bypass.
- `ClientNotification` **kullanılmaz**.
- **Check-then-act dedupe (SENT-yoksa-gönder) kullanılmaz** — rezervasyon zorunlu.
- Motor yokken **görünür Büro Ayarı/toggle eklenmez**; **P2 MVP'de Office ayarı da eklenmez** (sabit D30/EMAIL/tek-sefer).
- **Raw alıcı e-postası DB'ye yazılmaz** (`recipientRef` + `recipientEmailMasked`).
- Müvekkile yenileme hatırlatması **bu kapsamda değil** (ayrı, sonra).
- Per-user bildirim tercihleri ve KVKK kanal-bazlı rıza **kapsam dışı**.
- **Dedupe'suz cron kabul edilmez.**

---

## 10. Domain sınırı

P2 motor = `automation.service` + cron + scheduler = **CODEX/automation** alanı. Claude bu ADR'yi + (istenirse) Bildirim Merkezi kart-okuma/review kısmını yapabilir; cron/teslimat rewrite Codex tarafından (ya da açık owner yönlendirmesiyle).

---

## 11. Revizyon notu

- **v3 (2026-06-27):** FAILED **retry edinimi de atomik** yapıldı — conditional `updateMany` (FAILED→PENDING, `nextRetryAt<=now`); yalnız `count===1` olan worker gönderir; retry'da check-then-act **YASAK** (aksi halde aynı yarış geri gelir, iki e-posta). Ayrıca **exactly-once sınır notu** eklendi: tasarım concurrent duplicate'i engeller ama external provider ile mutlak exactly-once garanti etmez; **crash-after-send-before-SENT** penceresi kabul edilen sınırlı risktir.
- **v2 (2026-06-27):** Dedupe algoritması **check-then-act → REZERVASYON-tabanlı** olarak düzeltildi (race-condition: unique constraint logu tekilleştiriyor ama gönderimi engellemiyordu; iki e-posta riski). `status`'a `PENDING` eklendi; `attemptCount/reservedAt/lastAttemptAt/nextRetryAt` alanları eklendi; FAILED retry **aynı dedupeKey satırı** üzerinden. `dedupeKey` **alıcı + kanal** içerecek şekilde genişletildi (`...:{channel}:{recipientType}:{recipientRef}`); `validUntilDate` `YYYY-MM-DD` normalize. Alıcı algoritması netleştirildi (MVP: primary varsa yalnız primary). P2 MVP'de Office ayarı **eklenmeyecek** (sabit); ayarlar P3/P4. Raw alıcı e-postası DB'ye yazılmayacak (maskeli + ref).

## 12. Onay

Bu ADR onaylandıktan sonra P2 (CODEX/automation) için uygulama planı çıkarılır. ADR'de bir karar değişirse bu dosya güncellenir (tek karar defteri).
