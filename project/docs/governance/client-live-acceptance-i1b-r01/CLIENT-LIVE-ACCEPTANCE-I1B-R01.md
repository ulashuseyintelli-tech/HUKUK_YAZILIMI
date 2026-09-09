# CLIENT İ1b — CANLI SENTETİK KABUL ALANI · ONAY PAKETİ (R01)

```text
BELGE      : CLIENT-LIVE-ACCEPTANCE-I1B-R01
İŞ         : R02 İ1b — "CANLI sentetik tenant tahsisi" (6/17 tamam · 11 kalan; İ1b AÇIK)
DURUM      : HAZIRLIK TAMAMLANDI — CANLI YAZMA ONAYINA HAZIR DEĞİL (2 somut eksik, §9)
YETKİ      : Bu belge yetki ÜRETMEZ. R02 İ1b'ye yetki VERMEZ; production DB yazımı
             yalnız owner'ın YAZILI GO'su (CL_OWNER_GO_REF) ile başlar.
YAPILMADI  : canlı yazma · canlı sayım (DB kapalı) · disposable prova (DB kapalı) · İ8…İ15
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
| `AutomationService.updateRiskScores` (her gün 00:00) | `tenant ACTIVE · status ACTIVE` — bayrak YOK | **günde 1 `Case.update{riskScore}` + 1 `RiskReport` satırı** — alan bir gece açık kalırsa **kabul edilen ek yazma**; aynı gün kapanırsa 0 |
| `updateDaysLeft` (01:00) | `nextActionAt not null` | 0 (alan `nextActionAt` null) |
| `processPendingCases` (5 dk) | `isAutoMode true` (varsayılan false) + `isAutomationEnabled` | 0 |
| Aylık ekstre (`0 3 1 * *`, bayrak **açık**) | `client.isActive` + alıcı e-posta | e-posta yok → `SKIPPED_NO_RECIPIENT`, **ledger/claim satırı YOK, `Office` yaratılmaz** |
| Greeting (her dakika) | `tenant.office` yoksa `continue` | 0 (Office satırı yok) |
| Adres görevi / eskalasyon / POA / bildirim süresi | mevcut `AddressTask` / `Task` / `PoA` / `NotificationQueue` satırları | 0 (alan bunları içermez) |
| Icrabot outbox | `IcrabotOutboxAction` satırları | 0 |

**Alan aynı gün kapatılırsa cron kaynaklı yazma: 0.** Gece açık kalırsa: günde +2 satır (yukarıda).

### 4.3 Kapanış yazması

1 `User` satırında 2 alan: `isActive=false`, `tokenVersion++` (`f04-lib.revokeTenantAccess`).
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

## 6. Başarısızlık ve kurtarma (İ5b mekanizması)

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
| **Negatif kontroller** (`cl-i1b-negative.js`, gerçek kapılar) | **PASS 7 · FAIL 0 · ÖLÇÜLEMEYEN 1** — NC-1 live+GO ref yok → red · NC-2 biçimsiz ref → red · NC-3 disposable ortamda canlı DB → red · NC-4 live ortamda disposable DB → red · NC-5 ortam yok/tanınmıyor → red · NC-6 korunan/yabancı/yanlış önek red, `cl-acc-` geçer · NC-6b sır anahtarı red · **NC-7 (kapatıcı, olmayan alan) DB gerektirir → ÖLÇÜLEMEDİ** |

---

## 8. Başarı ölçütü (İ1b kapanışı)

1. `CL-I1B-SETUP` makbuzu: `environment=live`, `ownerGoRef`, `writtenRows` **tam 6**, slug `cl-acc-<runId>`.
2. Canlı sayım (koşum **öncesi ve sonrası**): `cl-acc-%` 0→1; diğer tenant'ların `User/Client/Case`
   sayıları **değişmedi**; `Office` sayısı **değişmedi**; `ClientContact` (EMAIL) 0.
3. Login kanıtı: elevated aktör **201** (alan gerçekten çalışır durumda) — 10/dk bütçesi içinde.
4. `CL-I1B-ACCESS-CLOSE`: `accessClosed=true`, `evidencePreserved=true`, `tokenVersionBumped=1`;
   aynı kimlikle login **401** (İ5b ölçüm kuralı: önce 201 görülmüş olmalı).
5. Tekrar çağrı: `usersDeactivated=0`, `alreadyClosed=true`, exit 0.

Bu ölçütler karşılanınca İ1b kapanır (**7/17**); hizmet kabulü **0/8 tam** kalır — İ1b alan kurar,
hizmet kabulü üretmez.

---

## 9. AÇIK EKSİKLER — onay ÖNCESİ kapatılmalı

| # | Eksik | Neden | Gereken |
|---|---|---|---|
| **1** | **Canlı sayım yapılamadı** | 2026-09-10 00:29 (yerel) itibarıyla **Docker Desktop daemon'u kapalı**; `5432` ve `5439` dinlemiyor; canlı API `login → 500`, `api-err` logunda 138× `Can't reach database server`. İlk düşen çağrı `icrabot/v28-engine/outbox.service.js:97`. **Owner ops olayı** — bu hat Docker/DB'yi başlatmaz | Docker/DB owner tarafından geri getirilince: `cl-acc-%`=0 kanıtı + mevcut slug listesi + `Office` sayımı (salt-okuma) |
| **2** | **Disposable prova koşulmadı** | aynı daemon → `hukuk_fix1_test` de kapalı | DB dönünce: `CL_ENVIRONMENT=disposable` ile `cl-run.js` (kurulum→kapatma), `cl-01 --abort` atomiklik, `cl-09` tekrar güvenliği, NC-7 |

**Bu iki eksik kapanmadan canlı yazma onayı istenmez.** Betikler yazıldı, sözdizimi ve kapı
davranışı gerçek fonksiyonlarla doğrulandı; **prova görmemiş betik canlıya sürülmez**.

---

## 10. Tek uygulanabilir onay paketi (eksikler kapandığında owner'a sunulacak metin)

```text
KOMUT      : CL_ENVIRONMENT=live
             CL_DATABASE_URL=<canlı DATABASE_URL — .env'den, yazdırılmaz>
             CL_OWNER_GO_REF=OWNER-GO-CLIENT-I1B-<YYYYMMDD>-R01   ← owner'ın YAZILI GO'su
             CL_STATE_FILE=<oturum dizini>/cl-state.json
             node client-live-acceptance-i1b-r01/scripts/cl-run.js
             (paket kimliği: bu belgenin birleştiği squash SHA; betik sha256'ları makbuzda)

HEDEF      : 127.0.0.1:5432/hukuk_db · tenant cl-acc-<runId> (koşumda üretilir, önceden yok)

YAZILACAK  : TAM 6 satır (Tenant · User · Lawyer · Client[e-posta YOK] · Case[otomasyon KAPALI]
             · CaseClient) + kapanışta 1 User satırında 2 alan. Mevcut satır güncellemesi YOK.
             Office satırı YOK. Finansal satır YOK. Geri alınamaz satır YOK.
             Gece açık kalırsa: günde +1 Case.update{riskScore} +1 RiskReport (cron; §4.2).

DIŞ ETKİ   : e-posta/SMS/portal gönderimi YAPISAL OLARAK imkânsız (Office SMTP yok, Client
             e-postası yok, Yol B uçları çağrılmaz). Zamanlanmış işler §4.2/§5'te bağlı.

BAŞARISIZLIK: G-0/G-1/G-3 → yazma başlamaz · commit öncesi hata → yetim kayıt yok ·
             commit sonrası hata/zorla sonlanma → cl-09 runId ile kapatır (tekrarı güvenli) ·
             kapanış ölçülemezse başarı SAYILMAZ (exit 2).

BAŞARI     : §8'deki 5 ölçüt; makbuzlar CL-I1B-SETUP / CL-I1B-ACCESS-CLOSE.
```

Owner'ın canlı yazma onayı **son adımdır**; İ1b ancak onaylı tahsis + §8 ölçütleri ile kapanır.
İ8…İ15 **kendiliğinden başlatılmaz**.
