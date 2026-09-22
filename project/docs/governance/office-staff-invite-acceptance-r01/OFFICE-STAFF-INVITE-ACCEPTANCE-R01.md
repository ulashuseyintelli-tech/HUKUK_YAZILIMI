# OFFICE PERSONEL DAVETİ — UÇTAN UCA CANLI KABUL PAKETİ (R01)

> **DURUM: HAZIRLIK TAMAM — DISPOSABLE PROVA PASS — CANLIYA UYGULANMADI.**
> Canlı koşum, canlı `.env` değişikliği ve API yeniden başlatma **ayrı owner GO'su** ister.
> Teknik sayaç 18/18 ve hizmet kabulü 0/8 bu paketle **değişmez**.

## 1. Neden bir pencere gerekiyor

Ham davet token'ı **yalnız e-postanın içindedir**; DB'de sadece sha256'sı saklanır
(`user-invite.service.ts` token üretimi, `schema.prisma` `UserInvite.tokenHash`). Bu yüzden uçtan uca kabul,
davet e-postasının **gerçekten teslim edildiği** bir yakalayıcı olmadan ölçülemez. Owner'ın seçimi **yerel
e-posta yakalayıcısıdır**: canlı `.env` içindeki `SMTP_HOST`/`SMTP_PORT` geçici olarak loopback yakalayıcıya
çevrilir, ölçüm yapılır, `.env` yedekten geri yazılır.

`.invalid` alıcı "gönderimsiz" bir yöntem **değildir**: SMTP denemesi yine oluşur. Gerçek posta kutusuna
gönderim de yapılmaz.

## 2. Pencerenin gerçek etkisi — kaynaktan ölçüldü

Canlıda e-posta iki ayrı yoldan çıkar ve **pencere yalnız birini etkiler**:

| Yol | Ayarı nereden alır | Pencereden etkilenir mi |
|---|---|---|
| `EmailProviderService` (env SMTP) | `.env` `EMAIL_PROVIDER`, `SMTP_*` | **EVET** — pencere boyunca çıkan posta yakalayıcıya düşer |
| Tenant SMTP (nodemailer) | Büro ayarlarından, **DB'den her gönderimde** | **HAYIR** — greeting, eskalasyon, POA ve müvekkil bildirimleri normal çalışmayı sürdürür |

**Pencere boyunca engellenmesi gereken env-SMTP yolları** (hepsi kullanıcı tetikli; otomatik iş yok):

| Uç | Servis | Pencere önlemi |
|---|---|---|
| `POST /portal/forgot-password` | `portal.service.ts` | Pencere boyunca personel bu akışı tetiklemez (owner duyurusu) |
| `POST /auth/invites`, `/invites/:id/resend` | `user-invite.service.ts` | **Ölçümün kendisi**; yalnız sentetik alıcı |
| `POST /client-financial-disclosures/:id/publish`, `/retry-publication` | FD e-posta dağıtıcısı | Pencere boyunca FD yayını yapılmaz |
| `POST /address-discovery/client-info-request`, `/:id/reminder` | `client-info-request.service.ts` | Pencere boyunca müvekkil bilgi talebi gönderilmez. **Dikkat:** dosya açılışında otomatik tetiklenen bir yol var (`sendAutoRequestOnCaseCreate`); env bayrağı yok, yalnız tenant ayarıyla kapanır → pencere boyunca **yeni dosya açılmaz** |
| `POST /expense-requests/:id/send`, `/:id/remind` | `expense-notification.service.ts` | Pencere boyunca masraf bildirimi gönderilmez |
| `POST /auth/forgot-password`, `/auth/reset-password` | parola kurtarma | Canlıda **zaten kapalı** (`OFFICE_PASSWORD_RECOVERY_ENABLED` tanımsız); erteleme korunur |

**Zamanlanmış işlerde env-SMTP gönderimi yoktur** (ölçüldü): `EmailProviderService`'i çağıran hiçbir `@Cron` yok.
ICRABOT outbox'un `send_email` işleyicisi dışarı göndermez, yalnız günlük satırı yazar.

**Alıcı allowlist'i üründe yoktur.** Bu yüzden güvence "yalnız sentetik alıcıya gider" varsayımına değil,
**pencerenin kısalığına + tetiklenmeyen uçlara + yakalayıcının loopback olmasına** dayanır.

## 3. Ölçülen zincir — 8 ölçüt

| # | Ölçüt | PASS koşulu |
|---|---|---|
| D-1 | ADMIN davet oluşturur | HTTP 200/201; davet satırı doğru tenant'ta; DB'de **yalnız** `tokenHash` |
| D-2 | Yakalayıcıda **teslim** | Yakalama dosyası var, alıcı sentetik, kabul bağlantısı var ve **yakalanan token'ın sha256'sı DB hash'iyle birebir eşit**. HTTP 200 tek başına teslim sayılmaz |
| D-3 | Gerçek kabul ucu | `isActive=true`, `passwordHash` yazıldı, davet `consumedAt` doldu |
| D-4 | Yeni parolayla giriş | Token alınır (giriş tenant kapsamlı) |
| D-5 | Aynı token tekrar | **400** ve parola hash'i **değişmez** |
| D-6 | Kullanılmamış davetler iptal | Bekleyen davet 0 |
| D-7 | Erişim kapanışı | Kullanıcılar pasif (`tokenVersion++`), giriş **401**, eski token **401** |
| D-8 | İzolasyon | Sentetik olmayan tarafın parmak izi önce = sonra |

## 4. Disposable prova — PASS (2026-09-23)

| Koşum | Sonuç | Kanıt sha256 (`Documents\CLIENT-EVIDENCE-20260911\invite-prova-20260923\`) |
|---|---|---|
| Başarılı yol (runId `5a20c025`) | **8/8 PASS**; D-2'de yakalanan token DB hash'iyle eşleşti; D-5 400; kapanışta giriş 401 ve eski token 401; izolasyon `eb79122c7fd7b4ad` önce = sonra | `8B648CC6A37C0D797BDCE922C7E736B94BA6A116019D76F94409EFBACB84C9C9` |
| Hata enjeksiyonu (runId `9bccd3c2`) | Kabulden **hemen sonra** kasıtlı duruş; çıkış 5, kapanış çalışmadı (3 ölçüt PASS'ten sonra) | `677E852F81395D4CA62FEC1AF8BCED4946D06C0C2ECEBE000C47763B59DED518` |
| Kurtarma (aynı runId, yalnız runId ile) | 2 kullanıcı pasifleştirildi, bekleyen davet 0, `ok: true`. **İkinci koşum 0 satır güncelledi** (tekrar güvenli) | `FE91BAA0D18CE380F06A4D03587190EE186A99672321EA53AC4FABE76B5A362C` |

Ortam: disposable PostgreSQL (5443), aday API (8115, `LOGIN_INVITE_PROVISIONING_ENABLED=true`), loopback SMTP
yakalayıcı (2526). Gerçek müvekkil verisi yok, gerçek alıcıya gönderim yok. **Bu prova canlı kabul değildir.**

## 5. Sır kapıları

- Ham davet token'ı ve parolalar **yalnız bellekte**; sonuç dosyalarına yalnız token'ın sha256'sı yazılır.
- Çıktı yazıcısı metin düzeyinde **fail-closed**: GO ref literali, ham token biçimi ya da bilinen bir sır
  değerini taşıyan nesne yazılamaz (`inv-lib.js` `writeJsonNoSecrets`).
- Kanıt dosyaları koşumdan sonra tarandı: 64 hanelik hash'ler dışında ham token biçiminde dizi **0**.

## 6. Canlı pencere tasarımı — uygulanmadı

**Sıra (her adım ayrı ve ölçülür):**

1. **Pencere teyidi** — eş oturumlar canlıya yazma ve kabul/prova başlatmama teyidi verir; owner pencere boyunca
   §2 tablosundaki uçların tetiklenmeyeceğini duyurur. Pencere hedefi **≤ 15 dakika**.
2. **`.env` yedeği** — canlı `.env` kopyalanır, kopyanın ve özgün dosyanın sha256'ları kaydedilir.
3. **Değişiklik** — yalnız `SMTP_HOST` ve `SMTP_PORT` loopback yakalayıcıya çevrilir. `EMAIL_PROVIDER` **değişmez**
   (`smtp` kalır). Başka hiçbir anahtara dokunulmaz; değişiklik sonrası `.env` sha256'sı kaydedilir.
4. **Yeniden başlatma** — API yeniden başlatılır (`.env` boot'ta okunur). Kimlik doğrulanır: dist digest değişmedi,
   `:8080` tek dinleyici, `/auth/me` 401.
5. **Koşum** — `inv-run.js`, `INV_ENVIRONMENT=live` ile bir kez; sentetik tenant `inv-<runId>`.
6. **Kapanış** — koşum `finally` bloğunda kapatır; çıkış 5 ise `INV_RUN_ID=<runId> node inv-99-close.js`.
7. **Geri dönüş** — `.env` yedekten geri yazılır, sha256'sı **taban değere eşit** olduğu doğrulanır, API yeniden
   başlatılır, `/auth/me` 401 ve dist digest yeniden ölçülür.
8. **Kullanıcı erişimi** — personel çalışmaya ancak 7. adım doğrulandıktan sonra döner.

**Geri dönüş ölçütü:** `.env` sha256'sı taban pine eşit **ve** API kimliği doğrulanmış olmadan pencere kapanmış
sayılmaz. Eşit değilse yedekten yeniden yazılır; ikinci kez tutmazsa owner'a bildirilir ve pencere açık bırakılır.

**Canlıda kalıcı kalanlar:** sentetik tenant `inv-<runId>`, içindeki ADMIN ve davet edilen kullanıcı, `UserInvite`
satırı ve audit satırları. Silme yapılmaz; erişim kapatılır (kullanıcılar pasif, `tokenVersion++`, bekleyen davet
iptal). **Kabul edilmiş bir hesabı pasifleştiren bir API ucu üründe yoktur**; kapanış DB düzeyindedir ve yalnız
`inv-` önekli tenant'ta çalışır (G-1/G-2).

## 7. Araç SHA256

| dosya | sha256 |
|---|---|
| `scripts/inv-lib.js` | `8898F2EDD9BDD6A76F68095925659F49359081BB15BD9CF437302CDBE1F4EF9C` |
| `scripts/inv-run.js` | `1FBEC522C2760BE059274399580A66F7BA0BF1F046E06A182BA450812A81BE19` |
| `scripts/inv-99-close.js` | `28651539ACFD3C850441962A9993FC600E400FFEEA0E93C5D1133E2E7D3B352E` |

Canlı uygulama ve geri dönüş blokları (`.env` yedeği, değişiklik, yeniden başlatma, koşum, geri yazma) **ayrı ve
tam SHA256 kontrollü** olarak, owner onayından sonra sunulur. Bu paket canlı değişikliği başlatmaz.

## 8. Kalan owner kararları

1. Pencere zamanı ve §2'deki uçların tetiklenmeyeceğinin duyurulması.
2. Canlı GO: `OWNER-GO-OFFICE-INVITE-YYYYMMDD-Rnn` (yalnız blok çalışırken yerel girilir).
3. Kabul sonrası sentetik hesabın canlıda kalıcı kalmasının kabulü (silme yok, erişim kapalı).
