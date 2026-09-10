# CLIENT İ1b — CANLI SENTETİK KABUL ALANI · ONAY PAKETİ (R01)

```text
BELGE      : CLIENT-LIVE-ACCEPTANCE-I1B-R01
İŞ         : R02 İ1b — "CANLI sentetik tenant tahsisi" (6/17 tamam · 11 kalan; İ1b AÇIK)
DURUM      : İ1b CANLI KABUL KAPANDI (OWNER-GO-CLIENT-I1B-20260910-R01; §11) — canlı DB'ye 6 satır yazıldı, erişim+cron kapatıldı, bağımsız doğrulandı
YETKİ      : Bu belge yetki ÜRETMEZ. R02 İ1b'ye yetki VERMEZ; production DB yazımı
             yalnız owner'ın YAZILI GO'su (CL_OWNER_GO_REF) ile başlar.
YAPILMADI  : canlı yazma · İ8…İ15 · Docker/canlı DB'yi başlatma (owner tarafından döndü)
```

---

## 1. Özgün R02 ölçütleri (aynen)

**İ1b — Canlı sentetik tenant tahsisi.** *"Production DB'ye yazma gerektirir → bu plan yetki
VERMEZ; ayrı owner onayı şarttır. Yazma kapsamı: 1 Tenant + 1 User + 1 Lawyer + 1 Client + 1 Case
+ 1 CaseClient (+ senaryo başına gereken kayıtlar); mevcut satır güncellemesi YOK. Erişim
sonlandırma: koşum sonunda `User.isActive=false` + `tokenVersion++` (finansal/audit kanıt korunur).
Yetki gereksinimi: canlı DB yazma onayı + tenant'ın başka programa ait olmadığının kanıtı."*
Kapanış: *"Tenant kanıtlı sentetik (domain paylaşımı yok · audit aktörü yok · finansal akış yok);
erişim kapatma çalıştı."* Öncül İ1a ✅ + **owner onayı**.

**İ8 — Sentetik alanın canlı sürümde doğrulanması + erişim sonlandırma provası.** Kapanış:
*"Alan canlıda kurulu; yetkisiz denemelerde yazma 0; erişim kapatma çalışıyor (öncül: İ1b onayı)."*

**İ10 — H3 vekâlet kabulü:** *"A-1 VIEWER 403 · A-2 elevated olmayan USER 403 · A-3 yetkili 201 ·
A-4 legacy upload 403 · K9 yenileme (POA'sız capability etkisiz)."* Kapanış: *"Beş gözlem PASS;
yetkisiz denemelerde dosya/DB yazımı 0."*

**İ4** (portal kapsamı) ve **İ5** (F04 kanıt yöntemi) **verilmiş sayılmadı** — bu paket ikisine de
dayanmaz.

---

## 2. Mevcut düzenek neden doğrudan kullanılamıyor (ölçüldü)

| Düzenek | Engel (kaynak) | Sonuç |
|---|---|---|
| İ1a `ah-lib.js` | G-0 `ALLOWED_DB_PORTS={5439}`, `ALLOWED_DB_NAMES={hukuk_fix1_test}`; env ile aşma yolu **yok** (`process.env.AH_*` yalnız URL/RUN_ID/PASSWORD/STATE) | canlı `5432/hukuk_db`'yi **tasarım gereği** reddeder |
| İ3 `i3-run.js` | `L.AH.assertDisposableEnvironment()` (aynı G-0) | canlıda koşamaz — İ8+ kabulleri için ayrı uyarlama gerekir (bu paketin kapsamı DIŞI) |
| İ5b `f04-09` / `f04-lib` | `TENANT_PREFIX='f04-acc-'` sabit; `assertOwnTenant` bu öneki zorunlu kılar | CLIENT alanını kapatamaz |

**Somut eksik → dar hazırlık değişikliği:** `client-live-acceptance-i1b-r01/scripts/` altında
canlı-kapsamlı, `cl-acc-` önekli küçük bir paket; kapatma mantığı **kopyalanmadı**, İ5b'de gerçek
hata yollarında doğrulanan `f04-lib.revokeTenantAccess` **sahiplik kapısı enjekte edilerek** yeniden
kullanıldı (`opts.assertOwn`; F04 çağıranları değişmedi — `f04-09:47`, `f04-04:82` iki argümanlı).

---

## 3. Hedef ortam ve kimlik

| Alan | Değer |
|---|---|
| Hedef DB | `127.0.0.1:5432/hukuk_db` (canlı; `hukuk-postgres` konteyneri, PostgreSQL 16.14) — kimlik bilgisi bu belgede **yok** |
| Canlı kod | RELEASE21 `2187a78b…`, API pid 27312 / Web pid 22440 (2026-09-10 ölçümü) |
| Tenant kimliği | `cl-acc-<runId>` · runId 8 hex, **yazmadan önce** üretilir, slug'a gömülü, sır içermez |
| Ortam kapısı | `CL_ENVIRONMENT=live` + `CL_DATABASE_URL` allowlist (`5432/hukuk_db`) + **`CL_OWNER_GO_REF=OWNER-GO-CLIENT-I1B-YYYYMMDD-Rnn`** (biçim zorunlu; ref'in gerçekliği owner'ın kanalındadır) |
| Korunanlar | `telli-hukuk` · `demo-firma` · `local-development-office` · `c36-smoke-principal(-2)`; yabancı önekler `ah-` · `f04-acc-` · `off-acc-` · `o4-acc-` · `i3-` |

**Tenant'ın başka programa ait olmadığının kanıtı:** slug rastgele 8 hex + `cl-acc-` öneki; G-3
çakışma kontrolü; ayrıca canlı sayım (§9 eksik 1) koşumdan hemen önce `cl-acc-%` = 0 ve mevcut
slug listesini kayda alır.

---

## 4. Yazılacak kayıtlar — TAM envanter

### 4.1 Asgari alan (`cl-01-setup.js`, tek transaction, **6 satır**, mevcut satır güncellemesi YOK)

| # | Tablo | Alanlar | Neden böyle |
|---|---|---|---|
| 1 | `Tenant` | `slug cl-acc-<runId>`, `lifecycle ACTIVE` (varsayılan) | login **yalnız ACTIVE** tenant'ta çalışır (`auth.service.ts:120 isLoginableLifecycle`) — cron'dan kaçmak için pasif tenant **mümkün değil** |
| 2 | `User` | `USER`, `elevated-<runId>@cl-acceptance.invalid`, `passwordHash` (bellekten), `isActive true` | RFC 2606 domain — teslim edilemez |
| 3 | `Lawyer` | `PARTNER`, `userId` | `isApproverEligible` = PARTNER + StaffMember YOK → "elevated" aktör (rol adı değil, bağ) |
| 4 | `Client` | `PERSON`, **email YOK, iletişim kişisi YOK** | aylık teslim `resolveRecipientEmail()` → `null` → `SKIPPED_NO_RECIPIENT` — gönderim **imkânsız** |
| 5 | `Case` | `GENERAL_EXECUTION`, `clientId`, **`isAutomationEnabled=false`** | `processPendingCases` (5 dk) `isAutoMode&&isAutomationEnabled` ister → dokunmaz |
| 6 | `CaseClient` | `ALACAKLI` | R02 asgari kapsam |

`EXPECTED=6` kontrolü **transaction içinde** (İ5b dersi). `Office` satırı **yazılmaz**.

### 4.2 Cron'ların bu alana yazabileceği satırlar (alan ACTIVE kaldığı sürece — kaynaktan ölçüldü)

| Cron | Kapı | Sentetik alana etkisi |
|---|---|---|
| `AutomationService.updateRiskScores` (her gün 00:00) | `tenant.lifecycle ACTIVE · Case.status ACTIVE` (`automation.service.ts:308`) — bayrak YOK, **kullanıcı `isActive`'ine BAKMAZ** | **Kullanıcı erişimi kapansa da KALICI:** Case ACTIVE kaldığı sürece **her gün** 1 `Case.update{riskScore}` + 1 `RiskReport`. Önceki *"sadece gece açık kalırsa"* ifadesi **yanlıştı** — düzeltildi. Kapanışta `Case.status→CLOSED` (§4.3) bu maruziyeti **0**'a indirir; disposable'da ölçüldü (§7.2) |
| `updateDaysLeft` (01:00) | `nextActionAt not null` | 0 (alan `nextActionAt` null) |
| `processPendingCases` (5 dk) | `isAutoMode true` (varsayılan false) + `isAutomationEnabled` | 0 |
| Aylık ekstre (`0 3 1 * *`, bayrak **açık**) | `client.isActive` + alıcı e-posta | e-posta yok → `SKIPPED_NO_RECIPIENT`, **ledger/claim satırı YOK, `Office` yaratılmaz** |
| Greeting (her dakika) | `tenant.office` yoksa `continue` | 0 (Office satırı yok) |
| Adres görevi / eskalasyon / POA / bildirim süresi | mevcut `AddressTask` / `Task` / `PoA` / `NotificationQueue` satırları | 0 (alan bunları içermez) |
| Icrabot outbox | `IcrabotOutboxAction` satırları | 0 |

**Kapanış (§4.3) uygulanmadan cron kaynaklı yazma her gün devam eder** (yalnız `updateRiskScores`; diğerleri 0). Kapanış uygulandıktan sonra: **0** — ürünün kendi yüklemiyle ölçülür (`cronPredicateAfter`).

### 4.3 Kapanış yazması (revize — 2 satır)

| # | Tablo | Alan | Neden |
|---|---|---|---|
| 1 | `User` (1 satır) | `isActive=false`, `tokenVersion++` | login → 401 (`auth.service.ts:125`); mevcut JWT → 401 (`validateUser :171/:185`) — `f04-lib.revokeTenantAccess` |
| 2 | `Case` (1 satır) | `status ACTIVE→CLOSED` | kalıcı cron maruziyetini bitirir: üç case-tabanlı cron da yalnız `status ACTIVE` seçer (`automation.service.ts:53/123/308`); `CaseStatus.CLOSED`'a bağlı hiçbir kod yolu yok — `cl-lib.closeCaseCronExposure` |

Kanıt satırı **silinmez**; `Tenant.lifecycle` **değiştirilmez** (ürün `ACTIVE→SUSPENDED`'e doğrudan izin vermez: `ALLOWED_TRANSITIONS ACTIVE:[QUIESCING]`, QUIESCING `lifecycleTarget` ister — bu yol kullanılmadı).
Finansal/audit kanıt: bu alanda **hiç üretilmez** (finansal akış YOK — R02 ölçütü).

### 4.4 İ8+ kabulleri için gerekecek EK kayıtlar (bu pakette YAZILMAZ — ayrı onay)

İ3 düzeneği tam kabul için 2 tenant (`-x` yabancı tenant) · 9 aktör (User×9, Lawyer×3,
StaffMember×5, PermissionGrant×1) · Client×2 (+yabancı 1) · Case · CaseClient · Debtor ·
CaseDebtor · H4 zinciri (Collection, ExpenseRequest, OfficeApprovalRequest, CollectionDisposition
+Line) ve **`Office.upsert` (SMTP → 127.0.0.1:65535)** yazar. Bu kapsam İ1b değildir; İ8…İ15
onayında **ayrı** envanterle sunulur.

---

## 5. Dış etki sınırı — mevcut mekanizmaya bağlı

Canlı `.env` (2026-09-10): `EMAIL_PROVIDER=smtp` + gerçek SMTP kimlikleri · `EMAIL_FROM=bilgi@tellihukuk.com`
· `CLIENT_STATEMENT_MONTHLY_DELIVERY=true` · `ICRABOT_OUTBOX_CRON_ENABLED=true` ·
`LOGIN_INVITE_PROVISIONING_ENABLED=true` · POA/eskalasyon/greeting/otomasyon bayrakları tanımsız.

| Yol | Mekanizma | Sentetik alanda sonuç |
|---|---|---|
| **Yol A** (tenant `Office` SMTP → nodemailer; env fallback **yok**) | `client-notification.service.ts:695`: `smtpHost/smtpUser` yoksa `smtp-not-configured` → **400**; `tenant-notifier:39` → `SKIPPED` | **gönderim imkânsız** — Office satırı yok |
| **Yol B** (`EmailProviderService`, süreç-genel `smtp`) | `client-info-request.createRequest` (alıcı e-posta **zorunlu** → yok → 400) · `sendReminder` · `expense-notification.sendReminder` · portal şifre sıfırlama · disclosure yayını (`smtp` **allowlist'te**) | İ1b bu uçların **hiçbirini çağırmaz**; İ8+ kabulünde **H5-00/01/01b/02b ve H4-08 canlıdan DIŞLANIR** (gerçek SMTP'ye giderdi) |
| Aylık ekstre cron | alıcı e-posta yok → `SKIPPED_NO_RECIPIENT` (claim öncesi) | 0 gönderim, 0 satır |
| SMS | `SMS_PROVIDER` tanımsız, `smsApiKey` yok | yok |
| Portal / davet | çağrılmaz | yok |

**Kural:** sentetik `Client`'a **hiçbir zaman** e-posta veya EMAIL tipi `ClientContact` yazılmaz;
sentetik tenant'a **hiçbir zaman** `Office` satırı yazılmaz. Bu iki değişmez korunduğu sürece
canlıda gerçek alıcıya gönderim **yapısal olarak** mümkün değildir.

---

## 6. Gerçek yürütme sırası (kaynakla) ve başarısızlık/kurtarma

### 6.1 Sıra — `cl-run.js` (parola yalnız bellekte; login in-process, hiçbir çıktıya/dosyaya yazılmaz)

| Adım | Ne | Beklenen | Kaynak |
|---|---|---|---|
| 1 | `cl-01-setup.js` | 6 satır COMMIT | tek transaction, `EXPECTED` içeride |
| 2 | **DOĞRULAMA-A** — aktif hesapla `POST /auth/login` → `GET /auth/me` | **201** · **200** | `@Post("login")` (`@HttpCode` yok) → 201; `validateUser` geçer |
| 3 | `finally` → `cl-09` | `User.isActive=false`+`tokenVersion++` · `Case.status=CLOSED` | §4.3 |
| 4 | **DOĞRULAMA-B** — aynı kimlikle login · **eski JWT** ile `/auth/me` | **401** · **401** | `auth.service.ts:125` (`!user.isActive`) · `validateUser :171` (`!isActive`) ve `:185` (`tokenVersion` uyuşmazlığı) |
| 5 | **TEKRAR** — `cl-09` ikinci çağrı | `alreadyClosed=true`, `usersDeactivated=0`, exit 0 | `revokeTenantAccess` tekrar güvenliği (İ5b H-4) |

Kurallar: doğrulama **ölçülemezse** (API yok/belirsiz) kapatma **yine denenir**, sonuç *ÖLÇÜLEMEDİ* olur ve BAŞARILI verilmez; kapanış doğrulanamazsa (`accessClosed`/`evidencePreserved`/`caseCronExposureClosed` biri false) BAŞARILI verilmez (exit 1). Tek başına bir 401 kanıt değildir — önce 201/200 görülmüş olmalıdır.

### 6.2 Başarısızlık ve kurtarma (İ5b mekanizması)

| Hata yolu | Oluşan alan | Kapatma / kurtarma |
|---|---|---|
| G-0/G-1/G-3 reddi | **yok** (yazma başlamadı) | — |
| commit **öncesi** hata | **yok** (tek transaction) | `cl-09` → `fieldExists:false`, yazma 0 |
| commit **sonrası** hata / durum dosyası yazılamadı (exit 4) | var | `cl-run.js` `finally` → `cl-09` (çıkış kodundan **bağımsız**) |
| süreç zorla sonlandı (`finally` yok) | var, **açık** | `CL_RUN_ID=<runId> node cl-09-close-access.js` — yalnız runId, durum dosyası/parola gerekmez, **tekrarı güvenli** |
| kapanış eksik (`accessClosed=false`) | var | exit 2 — **başarı sayılmaz**; tekrar çağrı |

`cl-09` de bir yazmadır: **aynı G-0** (live için GO ref) geçerlidir. İlgisiz kayıt **toplu
temizlenmez**; kapatıcı yalnız `cl-acc-<runId>` tenant'ının kullanıcılarını etkiler (G-2).

---

## 7. Doğrulanan hazırlık (bu turda)

| Kontrol | Sonuç |
|---|---|
| Sözdizimi | 5 CLIENT betiği + `f04-lib.js` OK |
| F04 geriye uyumluluk | `f04-09:47` ve `f04-04:82` iki argümanlı çağrı **değişmedi** |
| **Negatif kontroller** (`cl-i1b-negative.js`, gerçek kapılar) | **PASS 8 · FAIL 0 · ÖLÇÜLEMEYEN 0** — NC-1 live+GO ref yok → red · NC-2 biçimsiz ref → red · NC-3 disposable ortamda canlı DB → red · NC-4 live ortamda disposable DB → red · NC-5 ortam yok/tanınmıyor → red · NC-6 korunan/yabancı/yanlış önek red, `cl-acc-` geçer · NC-6b sır anahtarı red · NC-7 kapatıcı, olmayan alan → `fieldExists:false`, yazma 0 (disposable DB ile) |

### 7.1 Disposable prova (`127.0.0.1:5439/hukuk_fix1_test`, 2026-09-10 — **canlı kabul değildir**)

| Prova | Sonuç |
|---|---|
| **R1** `cl-run.js` kurulum→kapatma | `[S1] KURULUM COMMIT EDILDI — 6/6 satır · cl-acc-b846e372` → `[KAPANIS]` runId ile arama (çıkış kodu dikkate alınmadı) → `usersDeactivated 1 · stillActive 0 · tokenVersionBumped 1 · accessClosed true · evidencePreserved true` · exit 0/0 · SONUÇ BAŞARILI |
| **R1 bağımsız ölçüm** (salt-okuma) | `user 1 · lawyer 1 · client 1 · case 1 · caseClient 1 · office 0 · clientContact 0` · `clientEmailNull true · caseAutomationDisabled true · caseAutoModeFalse true · tenantLifecycle ACTIVE · activeUsers 0 · users[isActive false, tokenVersion 1]` — §4/§5 değişmezleri **karşılandı** |
| **R1 G-4** | durum dosyası anahtarları: `package createdAt environment ownerGoRef runId slug tenantId userId userEmail clientId caseId caseClientId passwordStored writtenRows writtenRowCount` — sır **yok** (`passwordStored:false`) |
| **R1b** `cl-09` ikinci çağrı | `usersDeactivated 0 · alreadyClosed true · accessClosed true` · exit 0 — **tekrarı güvenli** |
| **R2** atomiklik (`CL_ABORT_AFTER=Lawyer`) | setup exit 1 → bağımsız ölçüm `fieldExists:false` (Tenant+User+Lawyer **rollback**, yetim yok) → `cl-09` → `fieldExists:false · writeOperations 0 · "ALAN YOK — ölçüldü, varsayılmadı"` |
| **Artık taraması** | disposable'da `cl-acc-` tenant **1** (R1, kapalı); R2'ninki yok |

### 7.2 R02 provası — login sırası + kalıcı cron etkisi (disposable, yerel API `127.0.0.1:8098` → 5439)

| Adım | Ölçülen |
|---|---|
| **R3** `cl-run.js` | `[S1] 6/6 · cl-acc-947b09d5` → `[DOĞRULAMA-A] login=201 · /auth/me=200` → `[KAPANIS]` `usersDeactivated 1 · tokenVersionBumped 1 · caseRowsUpdated 1 · cronPredicate 1→0 · caseCronExposureClosed true` → `[DOĞRULAMA-B] login=401 · eski JWT /auth/me=401` → `[TEKRAR] alreadyClosed=true usersDeactivated=0 exit=0` → **SONUÇ: BAŞARILI** |
| **R3 bağımsız ölçüm** (ürünün kendi yüklemi) | `cronSelectableCases 0 · Case status CLOSED · riskReports 0 · users[isActive false, tokenVersion 1] · activeUsers 0 · office 0 · clientContact 0`; durum dosyası anahtarlarında sır yok |
| **R3b** üçüncü bağımsız `cl-09` | `usersDeactivated 0 · alreadyClosed true · caseRowsUpdated 0 · cronPredicateAfter 0` · exit 0 |
| **Karşı kanıt** (Point 2) | Önceki kapatıcıyla (yalnız kullanıcı) kapanan R1 tenant'ı `cl-acc-b846e372`: `activeUsers 0` **ama** `cronSelectableCases 1` (Case ACTIVE) → kalıcı günlük yazma **gerçek**ti. Yeni `cl-09`: `usersDeactivated 0 · alreadyClosed true · caseRowsUpdated 1 · cronPredicate 1→0` → sonra `cronSelectableCases 0 · CLOSED` |

---

## 8. Başarı ölçütü (İ1b kapanışı)

1. `CL-I1B-SETUP` makbuzu: `environment=live`, `ownerGoRef`, `writtenRows` **tam 6**, slug `cl-acc-<runId>`.
2. Canlı sayım (koşum **öncesi ve sonrası**): `cl-acc-%` 0→1; diğer tenant'ların `User/Client/Case`
   sayıları **değişmedi**; `Office` sayısı **değişmedi**; `ClientContact` (EMAIL) 0.
3. Login kanıtı: elevated aktör **201** (alan gerçekten çalışır durumda) — 10/dk bütçesi içinde.
4. `CL-I1B-ACCESS-CLOSE`: `accessClosed=true`, `evidencePreserved=true`, `tokenVersionBumped=1`;
   aynı kimlikle login **401** (İ5b ölçüm kuralı: önce 201 görülmüş olmalı).
5. Tekrar çağrı: `usersDeactivated=0`, `alreadyClosed=true`, exit 0.
6. Kalıcı cron maruziyeti: `caseCronExposureClosed=true`, `cronPredicateAfter=0` (ürünün kendi yüklemi).

Ölçüt 3/4/5/6 artık `cl-run.js` tarafından **koşumda ölçülür** (`CL-I1B-RUN` makbuzu, `verification` alanı).

Bu ölçütler karşılanınca İ1b kapanır (**7/17**); hizmet kabulü **0/8 tam** kalır — İ1b alan kurar,
hizmet kabulü üretmez.

---

## 9. İKİ EKSİK — DB dönünce KAPATILDI (2026-09-10)

**Kesinti kaydı.** 2026-09-10 00:29 yerel (09-09 21:29Z) itibarıyla Docker Desktop daemon'u
kapalıydı; `5432`/`5439` dinlemiyordu; canlı API `login → 500`, `api-err` logunda 138×
`Can't reach database server` (ilk düşen `icrabot/v28-engine/outbox.service.js:97`). Daemon
~22:16Z'de **owner tarafında** geri geldi (bu hat Docker'ı ve canlı DB'yi **başlatmadı**); canlı
API `login → 401`, ledger `130/130`, hedef migration uygulanmış, `CaseStatusHistory 930`
(kesinti öncesiyle **aynı**). Disposable `hy-fix1-testdb` konteyneri daemon'la dönmemişti; **bu
hat kendi test konteynerini** `docker start` ile açtı (canlı servis değil).

| # | Eksik | Kapanış kanıtı |
|---|---|---|
| 1 | Canlı sayım | Salt-okuma, 2026-09-10: **7 tenant** — `telli-hukuk` (user 9/8 aktif · client 16 · **Office+SMTP dolu — tek gerçek ofis**) · `local-development-office` (17/0) · `demo-firma` (8/3) · `c36-smoke-principal(-2)` (1/0) · `f04-acc-ccd471d3` (1/0) · `off-acc-f851d975` (2/0, Office var/SMTP boş). **`cl-acc-%` = 0** → çakışma yok; diğer programların sentetik alanları **tamamı kapalı** (0 aktif). Başka programın tenant'ına dokunma riski: G-1 listesi + önek taraması bu kümeyi kapsıyor |
| 2 | Disposable prova | §7.1 — R1/R1b/R2 + NC 8/8 |

## 10. Tek uygulanabilir onay paketi (owner'a sunulan metin)

**Paket kimliği:** bu belgenin birleştiği squash SHA; betik sha256'ları (bu revizyon):

| Betik | sha256 |
|---|---|
| `cl-lib.js` | `4CCDEF0DA5DC3C06FC9ED73DDE28CD4D94D853E01004F425968AB4B3B84A9903` |
| `cl-01-setup.js` | `C6E3D3FE845ED364B0E52F7A30F113BC516C8BC5D868D9B6C49D8D9DD61460FD` |
| `cl-09-close-access.js` | `012739987ED4176A114D6A33F18C76ACF2DB8614F7C954B453E04126A98862C4` |
| `cl-run.js` | `EE12BF26A9EA9EE336CC39694A059EE793E74225B3FEFA44E7C73BE256714E05` |
| `cl-i1b-negative.js` | `66FEE566A0F0E58FB3FDEA6A1E0F555BF834734622B83491691165404AE340D4` |
| `f04-lib.js` (İ5b kapatma mantığı, `opts.assertOwn`) | `1D35429566BC0A0469F44ED028FEF829AF204A90C9A5565C6882EF99C6305CA8` |

**Windows / PowerShell (uygulanabilir biçim; sır hiçbir yere yazdırılmaz):**

```powershell
# Ana depo kökünde. Canlı DATABASE_URL, RELEASE21 .env'den OKUNUR — yazdırılmaz.
$envLine = Select-String -Path 'C:\Development\HUKUK_YAZILIMI\HY_W4_RELEASE21\project\apps\api\.env' -Pattern '^DATABASE_URL=' | Select-Object -First 1
$env:CL_DATABASE_URL = ($envLine.Line -replace '^DATABASE_URL=', '').Trim('"')
$env:CL_ENVIRONMENT  = 'live'
$env:CL_API_BASE_URL = 'http://127.0.0.1:8080/api'
$env:CL_OWNER_GO_REF = '<OWNER-GO-CLIENT-I1B-YYYYMMDD-Rnn>'   # owner'ın YAZILI GO'su — bu belge doldurmaz
$env:CL_STATE_FILE   = "$env:TEMP\cl-i1b\cl-state.json"; New-Item -ItemType Directory -Force "$env:TEMP\cl-i1b" | Out-Null
node .\project\docs\governance\client-live-acceptance-i1b-r01\scripts\cl-run.js
```

Zorla sonlanma / eksik kapanış halinde (tekrarı güvenli; aynı GO ref gerekir):

```powershell
$env:CL_RUN_ID = '<runId>'   # cl-state.json veya CL-I1B-SETUP makbuzundan
node .\project\docs\governance\client-live-acceptance-i1b-r01\scripts\cl-09-close-access.js
```

```text
HEDEF      : 127.0.0.1:5432/hukuk_db · tenant cl-acc-<runId> (koşumda üretilir, önceden yok)

YAZILACAK  : KURULUM 6 satır (Tenant · User · Lawyer · Client[e-posta YOK] · Case[otomasyon KAPALI]
             · CaseClient) — tek transaction, mevcut satır güncellemesi YOK, Office YOK, finansal YOK.
             KAPANIŞ 2 satır güncellemesi: User{isActive=false, tokenVersion++} · Case{status=CLOSED}.
             Kapanış sonrası cron kaynaklı yazma: 0 (ölçülür). Kapanış ÖNCESİ açık kaldığı her gün:
             +1 Case.update{riskScore} +1 RiskReport (updateRiskScores, bayraksız).

SIRA       : setup → login 201 / me 200 → finally kapatma → login 401 / eski JWT 401 → tekrar cl-09
             (parola yalnız bellekte; login in-process; log/state/repo'ya yazılmaz)

DIŞ ETKİ   : e-posta/SMS/portal gönderimi YAPISAL OLARAK imkânsız (Office SMTP yok, Client
             e-postası yok, Yol B uçları çağrılmaz). Zamanlanmış işler §4.2/§5'te bağlı.

BAŞARISIZLIK: G-0/G-1/G-3 → yazma başlamaz · commit öncesi hata → yetim kayıt yok ·
             commit sonrası hata/zorla sonlanma → cl-09 runId ile kapatır (tekrarı güvenli) ·
             doğrulama ölçülemezse kapatma YİNE denenir, BAŞARILI verilmez ·
             kapanış doğrulanamazsa exit 1/2 — başarı SAYILMAZ.

BAŞARI     : §8'deki 6 ölçüt; makbuzlar CL-I1B-SETUP / CL-I1B-ACCESS-CLOSE / CL-I1B-RUN.
```

Owner'ın canlı yazma onayı **son adımdır**; `CL_OWNER_GO_REF` bu belge tarafından **doldurulmaz**.
İ1b ancak onaylı tahsis + §8 ölçütleri ile kapanır (→ 7/17). İ8…İ15 **kendiliğinden başlatılmaz**.
Betikler disposable'da prova görmüştür (§7.1 · §7.2).


---

# 11. CANLI KABUL — İ1b KAPANDI (owner GO 2026-09-10, append-only)

> Owner GO **`OWNER-GO-CLIENT-I1B-20260910-R01`** ile canlı `hukuk_db`'ye sentetik alan yazıldı,
> erişim + kalıcı cron maruziyeti kapatıldı ve **bağımsız salt-okuma ölçümüyle** doğrulandı.
> Deploy/migration/servis restartı/gerçek gönderim YOK. Betikler onaylanan ağaç `195bb1f1`
> (origin/main'de değişmemiş, hash'ler §10) — çalışma yolu detached worktree, aynı hash.

## 11.1 Uygulama öncesi (yazmadan önce ölçüldü)

| Kapı | Sonuç |
|---|---|
| Betik hash'leri = onaylanan `195bb1f1` | 6/6 AYNI (§10 tablosu) |
| Hedef DB | `127.0.0.1:5432/hukuk_db`, RELEASE21; API pid 50716; bogus login → **401** (API↔DB canlı bağ) |
| `targetIsLiveDb` (telli-hukuk var) | **true** |
| runId (yazmadan önce, sırsız kayıt) | **`afce215b`** → slug `cl-acc-afce215b` |
| Çakışma / `cl-acc-%` | `collision:false` · toplam **0** → `safeToWrite:true` |

## 11.2 Uygulanan akış (`cl-run.js`, tek yürütücü) — `CL-I1B-RUN result: PASS`

```text
[S1] KURULUM COMMIT EDILDI — 6/6 satir · cl-acc-afce215b
[DOGRULAMA-A] login=201 · /auth/me=200
[KAPANIS]  usersDeactivated 1 · tokenVersionBumped 1 · accessClosed true · evidencePreserved true
           caseRowsUpdated 1 · cronPredicate 1→0 · caseCronExposureClosed true
[DOGRULAMA-B] login=401 · eski JWT /auth/me=401
[TEKRAR]   cl-09 ikinci cagri: alreadyClosed=true · usersDeactivated=0 · exit 0
SONUC: BASARILI · Parola ve token hicbir yere yazilmadi
```

## 11.3 Bağımsız salt-okuma doğrulaması (uygulayıcı raporundan AYRI)

**Alan (`cl-acc-afce215b`):** `user 1 · lawyer 1 · client 1 · case 1 · caseClient 1 · **office 0** ·
**clientContact 0** · **riskReport 0**`. Kullanıcı `isActive=false · tokenVersion=1 · activeUsers 0`;
`clientEmailNull true`; `caseStatuses [CLOSED]`; **`caseCronSelectable 0`** (ürünün kendi yükü:
`tenant ACTIVE + Case ACTIVE` → seçilebilir Case yok). `tenant.lifecycle ACTIVE` (değiştirilmedi).

**İzolasyon — diğer tenant'lar yazımdan etkilenmedi** (koşum öncesi §9 sayımıyla aynı):

| slug | user | client | office |
|---|---|---|---|
| telli-hukuk (gerçek) | 9 | 16 | 1 |
| demo-firma | 8 | 2 | 1 |
| local-development-office | 17 | 0 | 1 |
| c36-smoke-principal(-2) | 1 / 1 | 0 | 0 |
| f04-acc-ccd471d3 | 1 | 1 | 0 |
| off-acc-f851d975 | 2 | 0 | 1 |
| **cl-acc-afce215b (yeni)** | **1** | **1** | **0** |

`cl-acc-%`: 0 → **1** (yalnız bu koşum). Diğerlerinin `user/client/office` sayıları değişmedi;
hiçbir sentetik alanda `Office` yaratılmadı; `ClientContact (EMAIL)` 0 → gönderim yolu açılmadı.

## 11.4 §8 ölçütleri — HEPSİ KARŞILANDI

| # | Ölçüt | Kanıt |
|---|---|---|
| 1 | `CL-I1B-SETUP` · environment=live · ownerGoRef · 6 satır | ✅ makbuz |
| 2 | `cl-acc-%` 0→1; diğer User/Client/Office değişmedi; ClientContact 0 | ✅ §11.3 |
| 3 | login **201** | ✅ DOĞRULAMA-A |
| 4 | `accessClosed`+`evidencePreserved`+`tokenVersionBumped 1`; login **401** | ✅ kapanış + DOĞRULAMA-B |
| 5 | tekrar `usersDeactivated 0`+`alreadyClosed true`+exit 0 | ✅ TEKRAR |
| 6 | `caseCronExposureClosed`+`cronPredicateAfter 0` (bağımsız `caseCronSelectable 0`) | ✅ §11.3 |

## 11.5 Kalan durum ve kanıt

Sentetik tenant **`cl-acc-afce215b` kalıcı kabul kanıtı olarak korunur** (purge YOK — R02 İ1b
"finansal/audit kanıt korunur"; owner "kanıt kayıtlarını koru, başka alanları temizleme").
Erişim kapalı (login/JWT 401), cron maruziyeti kapalı (Case CLOSED). Durum dosyası
`cl-state-afce215b.json` **sır içermez** (`passwordStored:false`; grep izi yok). Canlı API :8080
(RELEASE21) ve Web :3002 süreçlerine dokunulmadı; migration/deploy/restart/gönderim yapılmadı.

**İ1b KAPANDI.** Sayaç R02: **7/17** (İ1a·İ2·İ3·İ5b·İ6·İ7·İ1b), 10 kalan. Hizmet kabulü
**0/8 tam** (İ1b alan kurdu, hizmet kabulü üretmedi). İ8…İ15 başlatılmadı.
