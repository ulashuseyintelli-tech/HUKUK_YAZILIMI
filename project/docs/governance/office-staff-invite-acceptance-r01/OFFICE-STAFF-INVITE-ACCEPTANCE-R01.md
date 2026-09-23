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

**Güvence duyuruya dayanmaz.** Pencere, uygulamayı fiilen erişilemez yapar: Web görevi durdurulur ve devre
dışı bırakılır, 8080 ve 3002 için koşuma özel uzak erişim engeli konur. Aşağıdaki env-SMTP yolları bu yüzden
uzaktan tetiklenemez; duyuru yalnız **ek** önlemdir.

**Pencere boyunca kapatılan env-SMTP yolları** (hepsi kullanıcı tetikli; otomatik iş yok):

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

| Değişen mekanizmalarla tekrar (runId `33279eb4`, paketin kendi yakalayıcısı) | **8/8 PASS**; yakalama taraması 1 dosya, hedef dışı alıcı **0**; yakalama temizliği silinen 1, **kalan 0**; makbuz yazıldı | `FB862758BDE00E627051FDB542E71D2A3B3A0B93C67D1A3CDDD1A4E026A2EB4C` |
| Makbuz kapısı (aynı ortam) | **5/5 PASS**: doğru makbuzla kurtarma çıkış 0 · yanlış `tenantId` çıkış 4 · `slug`/`runId` tutarsızlığı çıkış 4 · `INV_RUN_ID` çelişkisi çıkış 4 — hiçbirinde yazma yok; diğer `inv-` tenant'ları değişmedi | koşum çıktısı, aynı kanıt dizini |

Ortam: disposable PostgreSQL (5443), aday API (`LOGIN_INVITE_PROVISIONING_ENABLED=true`), loopback SMTP yakalayıcı.
İlk iki koşum paylaşılan `i3-sink` ile (2526), üçüncü koşum paketin kendi `inv-sink.js`'i ile (2527) yapıldı.
Gerçek müvekkil verisi yok, gerçek alıcıya gönderim yok. **Bu prova canlı kabul değildir.**

## 5. Sır kapıları — ölçülen kapsamıyla

- **Parolalar** yalnız süreç belleğinde üretilir ve hiçbir dosyaya yazılmaz.
- **Ham davet token'ı bellekte ve geçici yakalama dosyasında bulunur**; kanıt dosyalarına yalnız sha256'sı yazılır.
  Yakalama dosyalarının nerede durduğu, nasıl korunduğu ve ne zaman silindiği §6.3'tedir. "Hiçbir dosyaya
  yazılmıyor" ifadesi **kullanılmaz**; doğru kapsam budur.
- Çıktı yazıcısı metin düzeyinde **fail-closed**: GO ref literali, ham token biçimi ya da bilinen bir sır
  değerini taşıyan nesne yazılamaz (`inv-lib.js` `writeJsonNoSecrets`).
- Kanıt dosyaları koşumdan sonra tarandı: 64 hanelik hash'ler dışında ham token biçiminde dizi **0**.

## 6. Canlı pencere tasarımı — uygulanmadı

### 6.1 Erişim kapatma (İ12 kalıbının R26/P1 durumuna uyarlanması)

Canlı API ve Web birer zamanlanmış görevdir: `HukukPlatform-API` ve `HukukPlatform-Web` (ikisi de ölçüldü: Running).
`inv-live-window.ps1 -Command open` sırayla şunları yapar:

1. **Başlangıç durumunu kaydeder:** iki görevin durumu ve etkinliği, 8080/3002/yakalayıcı dinleyici sayıları,
   `.env` sha256'sı, mevcut kural sayısı. Bu kayıt `close` adımının ölçütüdür.
2. **Web'i durdurur ve devre dışı bırakır;** 3002 dinleyicisi kapanana kadar bekler, gerekirse süreci kapatır.
   3002 hâlâ dinliyorsa **durur** (pencere açılmaz).
3. **Koşuma özel uzak erişim engeli** ekler: `HY-INVITE-WINDOW-8080` ve `HY-INVITE-WINDOW-3002` (gelen, TCP, Block).
4. `.env` yedeğini alır ve yedeğin sha256'sının kaynakla **eşit** olduğunu doğrular.
5. `.env` içinde **yalnız iki anahtarı** değiştirir (açık allowlist): `SMTP_HOST`, `SMTP_PORT`. İkisi de tam olarak
   bir satırda bulunmazsa durur.
6. API görevini yeniden başlatır ve 8080'de **tek** dinleyici dönene kadar bekler.

**Teknik sınır — açıkça:** Güvenlik duvarı kuralları **loopback trafiğini kapsamaz**. Sunucuda açık bir yerel
oturum `http://localhost:3002` üzerinden uygulamayı kullanmayı sürdürebilir. Bu yüzden pencere, **yerel
oturumların uygulamayı kullanmayacağı teyidi** alınmadan açılmaz. Ölçüm yalnız gereken yerel API yolunu kullanır:
`127.0.0.1:8080/api/auth/*` (giriş, davet, kabul) ve `/auth/me`.

### 6.2 Yakalayıcı

`inv-sink.js` **yalnız 127.0.0.1**'de dinler ve hiçbir mesajı iletmez; dışarı bağlantı kurmaz (`open` adımı
yakalayıcı sürecinin loopback dışı bağlantısı varsa durur).

**Gerçek SMTP kimlik bilgileri yakalayıcıya gitmez — ölçüldü (2026-09-23, ürünün kullandığı nodemailer):**

| Sunucu AUTH ilan ediyor mu | İstemci ne yaptı |
|---|---|
| Hayır | `AUTH` komutu **hiç gönderilmedi**; gönderim yine başarılı |
| Evet | `AUTH PLAIN <base64>` gönderildi; kimlik bilgisi çözülebilir |

`inv-sink.js` AUTH **ilan etmez** ve `AUTH` komutunu 503 ile reddeder; STARTTLS de ilan edilmez. Yakalayıcı komut
satırlarını diske **yazmaz**; yalnız zarf özeti (`X-INV-From`, `X-INV-Rcpt`) ve mesaj gövdesi yazılır.
`SMTP_USER`/`SMTP_PASS` **değiştirilmez**; değişiklik allowlist'i bu yüzden iki anahtarla sınırlı kalır.
**Port 465 seçilemez:** ürün `secure` değerini `SMTP_PORT === '465'` ile türetir (`email-provider.service.ts:201`).

### 6.3 Ham token, yakalama dosyaları ve saklama

"Hiçbir dosyaya yazılmıyor" **doğru değildir** ve öyle sunulmaz. Doğrusu:

| Nesne | Nerede bulunur | Nasıl korunur |
|---|---|---|
| Ham davet token'ı | **Geçici olarak** yakalama dosyasında (`inv-msg-*.eml`) ve koşum sürecinin belleğinde | Yakalama dizini kanıt dizini **değildir**, repo dışındadır; koşum sonunda **silinir** ve silinme doğrulanır (`purgeCapture`: silinen ve **kalan** dosya sayısı kayda geçer) |
| Ham token'ın sha256'sı | Sonuç dosyasında | Kanıt olarak kalır; literal değil |
| Parolalar | Yalnız süreç belleği | Hiçbir dosyaya yazılmaz; çıktı yazıcısı sır değerini taşıyan yazmayı reddeder |
| SMTP kimlik bilgileri | Canlı `.env` (değiştirilmez) | Yakalayıcıya gönderilmez (§6.2 ölçümü) |

Yakalama dizini koşum sahibinin kullanıcı profilinde, repo dışında tutulur ve koşum bitiminde boşaltılır.

### 6.4 Sıra

1. Pencere teyidi (eş oturumlar) **+ yerel oturumların uygulamayı kullanmayacağı teyidi**.
2. Yakalayıcı başlatılır (loopback).
3. `inv-live-window.ps1 -Command open` (yönetici).
4. `inv-run.js` `INV_ENVIRONMENT=live` ile **bir kez**.
5. Koşum kendi `finally` bloğunda kapatır; çıkış 5 ise `inv-99-close.js` **makbuzla** çalıştırılır.
6. `inv-live-window.ps1 -Command close` (yönetici).
7. Yakalayıcı durdurulur; yakalama dizininin boş olduğu doğrulanır.

### 6.5 Kapanış ölçütü — başarıda da hatada da aynı

`close` adımı şunların hepsini doğrulamadan **kullanıcı erişimini açmaz**:

- `.env` sha256'sı **taban değere eşit** (eşit değilse yedekten ikinci kez yazar; yine tutmazsa pencere **açık kalır**),
- API 8080'de tek dinleyici ve görev çalışıyor,
- koşuma özel güvenlik duvarı kuralları **kaldırıldı** (kalan kural 0),
- Web görevi **başlangıç durumunda** (etkin ve çalışıyor) ve 3002 dinliyor,
- yakalayıcı portu kapalı, yakalama dizini boş,
- sentetik erişim kapalı (kullanıcılar pasif, bekleyen davet 0).

Sonuç `<durum dosyası>.close.json` içine yazılır (`before`, `after`, `restored`).

### 6.6 Sonradan tespit — önleme değil

- **Hedef dışı alıcı:** Koşum, yakalama dosyalarındaki zarf alıcılarını beklenen sentetik adresle karşılaştırır
  (`scanCaptureRecipients`). Bu bir **tespittir**; üründe alıcı allowlist'i yoktur ve bu ölçüm hiçbir gönderimi
  engellemez. Okunamayan zarf "ölçülemedi" sayılır, PASS değil.
- **Gerçek tenant'ın env-SMTP gönderimi:** Pencere sırasında başka bir env-SMTP gönderimi olursa mesajı yine
  yakalayıcı alır ve yakalama taramasında hedef dışı olarak görünür. Bu da **tespittir**; önleme erişim kapatmadan
  gelir (§6.1).

### 6.7 Kurtarmanın yetkisi — makbuza bağlı

Kurtarma yalnız "`inv-` önekli tenant" koşuluna dayanmaz. `inv-run.js` kurulumdan sonra repo dışına bir **makbuz**
yazar: `runId`, `slug`, `tenantId`, `adminUserId`, `invitedUserId`, `inviteId`. `inv-99-close.js` bu altı alanı DB ile
karşılaştırır; biri tutmazsa **hiç yazmadan** çıkış 4 verir. Böylece başka bir sentetik koşumun kayıtlarına
dokunulmaz. `INV_RUN_ID` verilirse makbuzdaki `runId` ile aynı olmalıdır.

### 6.8 Canlıda kalıcı kalanlar

Sentetik tenant `inv-<runId>`, ADMIN ve davet edilen kullanıcı, `UserInvite` satırı ve audit satırları **kalır**.
Silme yapılmaz; erişim kapatılır. **Kabul edilmiş bir hesabı pasifleştiren API ucu üründe yoktur**; kapanış DB
düzeyindedir ve yalnız makbuzun işaret ettiği tenant'ta çalışır.

### 6.9 Tahmini kesinti

| Adım | Süre | Etki |
|---|---|---|
| `open` (Web durdurma, kural, `.env`, API yeniden başlatma) | ~1,5–2 dk | Web **kapanır**; API ~35 sn yeniden başlar |
| Koşum | ~15–30 sn | Yalnız sentetik tenant |
| `close` (`.env` geri, API yeniden başlatma, kural kaldırma, Web başlatma) | ~2–3 dk | API ~35 sn; Web ayağa kalkana kadar ~30–90 sn |
| **Toplam** | **~5–6 dk** | Web erişimi bu süre boyunca kapalı; uzak API erişimi de kapalı |

## 7. Araç SHA256

| dosya | sha256 |
|---|---|
| `scripts/inv-lib.js` | `6395A2FDC76AC36FC8BAE8A48806405746A5F646671B8B7FA23A54DFC6CE50CC` |
| `scripts/inv-run.js` | `C96D367565FAB2C90758C6814DECD761543D012F335614A68D3E7A808AB7212F` |
| `scripts/inv-99-close.js` | `67A6CE79DC43863887B9492FFF67C3D79FEF11448AE93933BEE0EE1519EB730F` |
| `scripts/inv-sink.js` | `94F20B32497D7DADDCEE9970CD148494D3F1C0AAABFCC7B59EA4850ACF50F592` |
| `scripts/inv-live-window.ps1` | `1F974644F3C8601C212AA2F4CED69240DB36C12EBBB3564E080F0D48459930E4` |
| `scripts/inv-live-run.ps1` | `2EDB682F71AB4F80C85D39F45C6305434723FDB353FD2DF01093E162DC71EB2C` |
| `scripts/inv-exit-capture-prova.ps1` | `9EC146C05A2C05EF01FE29B6C510A3E777A189FF75349B837BB643407854A366` |

Canlı koşumda her dosya çalıştırılmadan önce sha256'sı bu tabloyla karşılaştırılır; biri tutmazsa pencere açılmaz.

### 7.1 Çıkış kodu yakalama — ölçüldü

`inv-exit-capture-prova.ps1` owner bloklarındaki kalıbı canlıya dokunmadan ölçer:

| Senaryo | Beklenen | Ölçülen |
|---|---|---|
| Çocuk süreç 0 | 0 | **0** |
| Çocuk süreç 3 | 3 | **3** |
| Çocuk süreç 5 | 5 | **5** |
| Başlatılamama (dosya yok) | sıfır dışı | **-196608** (sıfır dışı) |

`-999` hiçbir yolda kalmaz; kalırsa bloklar **PASS saymaz** ve durur. `EAP=Stop` altında başlatılamama ayrıca
`NativeCommandError` ile durur — sessiz geçiş yoktur.

### 7.3 Kurtarma ile erişim açma ayrımı — ölçüldü

Kapanış bloğu **kurtarma adımlarını her koşulda yürütür**: makbuza bağlı erişim kapatma, yakalayıcı durdurma,
yakalama temizliği, `.env` geri yükleme, API yeniden başlatma ve kimlik ölçümü. Kabul (`fail > 0`), izolasyon ya da
hedef dışı tespiti bu adımları **engellemez**; yalnız sonucu başarısız yapar ve kayda geçer.

**Kullanıcı erişimi** (firewall kurallarının kaldırılması ve Web'in geri getirilmesi) yalnız şu altı zorunlu dönüş
kontrolünün hepsi geçerse açılır: sentetik erişim kapalı · yakalayıcı durdu · yakalama dizini boş · `.env` sha tabana
eşit · API `/auth/me` 401 · DB kimliği `hukuk_db`. Biri tutmazsa kurallar ve Web **olduğu gibi kalır**, çıkış 3 olur.

`-DecisionSelfTest` bu ayrımı canlıya dokunmadan ölçer: **9/9 PASS**. Kabul FAIL ve hedef dışı tespiti erişimi
açmayı engellemedi; altı zorunlu kontrolden her biri tek tek engelledi.

### 7.2 GO ref nasıl giriliyor

Koşum bloğu (`inv-live-run.ps1`) GO ref'i **`Read-Host` ile** ister. Ajan araçları etkileşimli olmadığı için
koşumu owner çalıştırır. GO ref sohbete, komut satırı argümanına ve dosyaya **yazılmaz**; yalnız o sürecin
belleğindedir, kayda sha256'sı girer ve blok GO ref'in repoda daha önce geçmediğini `git grep` ile doğrular.

## 8. Kalan owner kararları

1. Pencere zamanı ve §2'deki uçların tetiklenmeyeceğinin duyurulması.
2. Canlı GO: `OWNER-GO-OFFICE-INVITE-YYYYMMDD-Rnn` (yalnız blok çalışırken yerel girilir).
3. Kabul sonrası sentetik hesabın canlıda kalıcı kalmasının kabulü (silme yok, erişim kapalı).
