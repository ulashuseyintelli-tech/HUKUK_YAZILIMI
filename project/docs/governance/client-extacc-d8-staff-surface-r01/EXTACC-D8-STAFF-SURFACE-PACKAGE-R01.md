# EXTACC D-8 — PERSONEL YÜZEYİ DIŞARIDAN KAPALI · D-6/D-7 TANIMI · BİRLEŞİK D-9 (R01)

> **DURUM: HAZIR — CANLIDA KOŞULMADI.** D-8 kısmi kaydı (owner telefonu, 5 GET → 403, 2026-09-27 21:14–21:15) **tamamlanmış
> sayılmaz**: katman ölçülmedi; diğer yöntem/yollar açık. Bu paket makine ölçümünü ve telefon beyanını ayırır.
> R01 gözden geçirme düzeltmeleri (2026-09-29): (a) katman yalnız `Server` başlığından; boş 403 gövdesi tek başına `caddy` demez ·
> (b) ham request-target korunur (seçenek nesnesiyle istek) ve öz-testte kenarın gördüğü yolla birebir doğrulanır ·
> (c) istek listesi/yan etki tablosu; "giriş denenmez" yerine "kimlik bilgisi gönderilmez" · (d) öz-test.
> İkinci tur inceleme düzeltmeleri (2026-09-29): DELETE gövdesiz (yalnız POST/PUT/PATCH `{}`) · giriş sayacı ifadesi (uygulama
> boş gövdeli isteği de sayar) · kimlik/yazma bayrakları ölçülen `measured` alanından, `design` beyanı ayrı · S2 açıklaması (bulgu = 7)
> · `POST /api/auth/register` + `GET /api/auth/capabilities` vektörleri (37 ret) · `suspectAppOrigin403` sayacı · koşum bloğunda
> yer tutucular · öz-test **15/15**.
> Kapanış düzeltmesi (2026-09-29, üçüncü tur): §4/§5 D-6/D-7 tanımları paketlere işaret eden eşleme tablolarına çevrildi (koşucular
> YAZILDI; model adları `PortalMessage`/`PortalNotification`; D7-4 kaynak 400; D6-1 makine yüklemesi; D6-6 zorunlu bekleyen liste — "ölçüldü"
> notlarıyla) · §6 birleşik D-9 bileşen→ölçüt tablosu + "saklanan kayıt silinmiş gibi raporlanmaz" / Recover kuralları. Sonda ve öz-test
> DEĞİŞMEDİ (§7 pinleri aynı); canlı sonda yine çalıştırılmadı.
> **R27-R03 düzeltmesi (2026-09-30):** `Server`/sağlayıcı başlıkları ve gövde imzası reddin katmanının **kesin kanıtı sayılmaz** — yalnız
> İPUCU olarak `layerHint`/`denyLayerHints`'e yazılır; sondada kesin katman kanıt kaynağı olmadığından 403 satırlarında `layer` daima `unknown`.
> `unknown` ret ölçümünü (satır `ok`, çıkış kodu) **başarısız saydırmaz**. Ham request-target korunur (değişmedi). Öz-test yeni anlama göre
> güncellendi: **15/15**; eski (başlıktan katman türeten) sonda yeni öz-testte **9/15** (negatif kontrol). Canlı sonda yine çalıştırılmadı.

## 1. D-8 makine sondası (`scripts/d8-staff-surface-probe.js`)

Owner PC'sinden, gerçek alan adı ve gerçek TLS ile (`--origin https://<public host>`; TLS doğrulaması kapalıysa reddeder).
**37 ret vektörü** (personel sayfaları `/`, `/auth/login`, `/dashboard`, `/auth/reset-password`; personel API `/api/auth/me`,
`POST /api/auth/login`, `POST /api/auth/register`, `GET /api/auth/capabilities`, `/api/cases`, `/api/users`, `/api/health`;
`/api/portal/admin/*` düz/büyük harf/`./`/`%2F`/sorgu varyantları; intake DELETE/PUT/PATCH; izinli yollarda yanlış yöntem;
`/api`, `/api/`, `/robots.txt`) → hepsi **403** beklenir. `POST /api/auth/account-recovery/find-tenants` sondada YOKTUR
(login ile aynı hız sınırı sayacını paylaşır; yan etkiyi artırmamak için).
**9 pozitif** (izinli çiftler uygulamaya ulaşır, yazma yok): sayfalar 200; `cases/documents/messages` GET, `POST messages`,
`DELETE documents/:id`, `POST change-password` token olmadan **401** (guard'a ulaştı).

**Kimlik bilgisi gönderilmez; yazma verisi gönderilmez.** Ret listesinde POST/PUT/PATCH/DELETE istekleri VARDIR — POST/PUT/PATCH
gövdesi boş JSON `{}`, **DELETE gövdesiz** (yalnız `content-type: application/json` başlığı); hiçbir istekte authorization/cookie/
x-api-key başlığı yoktur. `POST /api/auth/login` boş gövdeyle ret listesindedir: kimlik bilgisi gönderilmez; **uygulama bu isteği
yine de giriş sayacına +1 yazar** (`LoginRateLimitGuard` DTO doğrulamasından önce, IP bazlı 10/dk pencere; kendi semantiğinde
başarısız giriş denemesi sayar) — kenar 403 verdiği sürece uygulamaya ulaşmaz. forgot-password/reset-password çağrılmaz (e-posta),
intake POST ve belge yükleme yapılmaz. Kanıt dosyasında iki AYRI alan vardır: `design { credentialsSent:false,
writesAttempted:false }` betik **tasarım beyanıdır** (ölçüm değil); `measured { requestCount, credentialHeaderRequests,
nonEmptyBodyRequests, bodies {empty, emptyJson} }` istek döngüsünden **türetilir** (her satırda gönderilen başlık adları ve gövde
`sent` alanındadır). Her ret satırında `ifPassed` (kenar geçirirse olası sonuç) yer alır.

**Ham request-target korunur:** istek `https.request({host, port, path, method, servername})` ile atılır; `path` vektördeki ham
dizedir (`/api/portal/./admin/...`, `%2F`, `?x=1` normalize edilmez). Öz-test S1-p bunu kenarın gördüğü `req.url` ile birebir
doğrular; URL-string ile istek atan kopya bu testte düşer (mutasyon provası: `./` normalize edilir, 3/4 ham örnek).

**Katman:** her 403 için ipuçları AYRI alanlarda kaydedilir — `hints { bodyEmpty, providerSignature (gövde imzası, bool),
edgeHeaderPresent, serverHeaderValue (yalnız ürün adı: 'Caddy' / 'cloudflare' / ''), cfMitigatedPresent }`. `Server`/sağlayıcı başlıkları ve
gövde imzası reddin hangi katmanda üretildiğinin **kesin kanıtı değildir** (başlık yol boyunca yeniden yazılabilir; kenar şablonunun `respond 403`'ü
ayırt edici bir işaret taşımaz). Bu yüzden başlıktan türetilen değer yalnız **İPUCU**dur: `layerHint` = `'Caddy' → caddy`; sağlayıcı imzası **ve**
sağlayıcı `Server` başlığı → `edge-provider`; aksi `null` (dağılım `denyLayerHints`). **Kesin katman** `layer` bu sondada kesin kanıt kaynağı
olmadığı için 403 satırlarında daima **`unknown`**'dur: `unknown` = **ret VAR, katman KESİN BELİRLENEMEDİ** ("ret yok" değil) ve ret ölçümünü
(`ok`, çıkış kodu) başarısız saydırmaz. Boş 403 gövdesi tek başına ipucu da üretmez. Başlık DEĞERLERİ kanıta yazılmaz (yalnız ad/varlık).

**Uygulama-kaynaklı 403 şüphesi (`suspectAppOrigin403`):** ret vektöründe `ok` yalnız `status === 403` ile belirlenir; kenar reddi
ile uygulama-kaynaklı 403 (ForbiddenException, dolu JSON gövde) `ok` alanında ayrılmaz. Sonda `403 + gövde DOLU + sağlayıcı imzası
YOK` satırlarını ayrı bir sayaçla kanıta yazar. Bu sayaç > 0 ise PASS düşmez, kayda not düşülür (R27'de token'sız istekte uygulama
403'ü beklenmez: `JwtAuthGuard` 401 verir; `SmokeAuthorizationGuard` Bearer yoksa geçer). Kenar `respond 403` boş gövdelidir.

Çıkış: 0 tamamı beklendiği gibi · 2 en az bir ret 403 değil (**bulgu**) · 3 ölçülemeyen · 4 kapı · 7 kanıt yazılamadı.

### 1a. İstek listesi — beklenen sonuç ve kenar geçirirse olası yan etki

Beklenen: her ret vektörü **kenar 403** (uygulamaya ulaşmaz → yan etki yok). Aşağıdaki "kenar geçirirse" sütunu R27 kaynağından
(`apps/api/src/modules/auth`, `modules/portal`, `main.ts` global prefix `api`) türetilmiştir; hepsi **bulgu**dur (çıkış 2).

| Vektör grubu | Yöntem / gövde | Beklenen | Kenar geçirirse (uygulama) |
|---|---|---|---|
| Personel sayfaları `/`, `/auth/login`, `/dashboard`, `/auth/reset-password` | GET | 403 | Next sayfa 200/302; yazma yok; personel yüzeyi dışarıya açık |
| `GET /api/auth/me`, `/api/cases`, `/api/users` | GET | 403 | personel `JwtAuthGuard` → 401 (token yok); yazma yok |
| **`POST /api/auth/login`** | POST, boş `{}` gövde, **kimlik bilgisi gönderilmez** | 403 | `LoginRateLimitGuard` DTO doğrulamasından **önce** çalışır → personel giriş hız sınırı sayacı (IP bazlı, 10/dk) **+1** (uygulama semantiğinde başarısız giriş denemesi sayılır), sonra DTO **400**. Tek istek blok üretmez; sayaç +1 = yan etki + bulgu |
| `POST /api/auth/register` | POST, boş `{}` gövde | 403 | guard yok; `ValidationPipe` (whitelist) `{}` → **400**; yazma yok; personel API dışarıya açık = bulgu |
| `GET /api/auth/capabilities` | GET | 403 | guard yok → 200 (statik bayrak); yazma yok; personel API dışarıya açık = bulgu |
| `GET /api/health` | GET | 403 | R27'de kök `health` ucu yok → 404 |
| `/api/portal/admin/*` düz (create-user/disable-user POST boş gövde; documents/pending, messages/clients GET) | GET / POST `{}` | 403 | `JwtAuthGuard` → 401 (token yok); yazma yok |
| admin varyantları (`/api/portal/admin`, `ADMIN`, `./admin`, `%2Fadmin`, `?x=1`) | GET | 403 | normalizasyona göre admin rotası (401) veya 404; yazma yok |
| intake `DELETE /intake/:id` (web) | DELETE (gövdesiz) | 403 | Next sayfa rotasına yazma yöntemi → 404/405 (kaynak/çalışma zamanıyla ölçülmedi) |
| intake API DELETE/PUT/PATCH `/api/public/intake/:id` | DELETE (gövdesiz) / PUT `{}` / PATCH `{}` | 403 | rota yok → 404; yazma yok |
| izinli yolda yanlış yöntem: `GET /api/portal/login`, `POST /api/portal/cases`, `DELETE cases/:id`, `DELETE/PUT messages`, `PUT/POST documents/:id`, `GET change-password` | GET / POST-PUT `{}` / DELETE (gövdesiz) | 403 | rota yok → 404; yazma yok |
| web yazma: `POST /portal/profile`, `POST /portal/login` | POST `{}` | 403 | Next 404/405; yazma yok |
| `/robots.txt`, `/api`, `/api/` | GET | 403 | Next/Nest 404 |
| **Pozitifler** `GET /portal/login|forgot-password|reset-password` | GET | 200 | — (izinli) |
| **Pozitifler** `GET /api/portal/cases|documents|messages`, `POST messages {}`, `DELETE documents/:id`, `POST change-password {}` | token yok | 401 | — (`PortalAuthGuard` token yokken durur; yazma yok) |

Öz-test (`d8-selftest.js`, sahte kenar = şablonun 4 regex'i + admin reddi, gerçek TLS; kenar gördüğü ham `req.url`'i, kimlik
başlığı varlığını ve gövde uzunluğunu `/__seen` ile verir): S1 sağlıklı (`Server: Caddy`) 0 · katman `unknown` + ipucu `caddy` · **S1-p ham yol birebir (46/46
satır, `./` `%2F` `?x=1` `ADMIN` 4/4)** · **S1-c kimlik/gövde ölçümü** (kenar hiçbir istekte kimlik başlığı görmedi; gövde 0 veya 2;
`measured` kenarla uyumlu, `bodies.emptyJson` = POST/PUT/PATCH sayısı, `bodies.empty` = GET/DELETE sayısı; `design` ayrı) ·
S2 bozuk kenar 2 (**bulgu = `/api/auth/me` + 6 düz admin yolu = 7**; kodlama varyantları `ADMIN`/`./`/`%2F` sahte kenarda 403 kalır;
`ifPassed` dolu) · S3 sağlayıcı reddi → çıkış 0, `unknown` + ipucu `edge-provider` (hints dolu) · **S3-b boş gövde, Server yok → `unknown`, ipucu yok** ·
**S3-c boş gövde, `Server: cloudflare`, imza yok → `unknown`, ipucu yok** · **S3-d dolu JSON gövdeli 403 + `Server: Caddy` → çıkış 0, `unknown` + ipucu `caddy`, `suspectAppOrigin403` =
ret sayısı (S1'de 0)** · S4 kenar kapalı 3 · S5 kapılar 4/4/7 · S6 telefon listesi · T-1 pozitif liste statik · T-2 statik (seçenek
nesnesi, `ifPassed`, "boş gövde" adlandırma, kimlik/yazma bayrakları yalnız `design`+`measured` — kanıt kökünde sabit literal yok,
`layerOf` başlık/ipucu/gövde okumaz) — **15/15 PASS** (R03, 2026-09-30, Linux node 22; eski sonda ile negatif kontrol 9/15: S1, S3, S3-b, S3-c, S3-d, T-2 FAIL.
Önceki anlamla 15/15: 2026-09-29; kanıt `HY_R27_AGENT_EVIDENCE\extacc-d8-r01-is3-fix\d8-selftest-fix-run2.log`;
mutasyon provaları: URL-string kopya 11/13 [`extacc-d8-r01-is3\d8-selftest-mutation-urlstring.log`, önceki tur], DELETE'e `{}` yazan
kopya 8/15 [`d8-selftest-mutation-delete-body.log`], kanıt köküne sabit `credentialsSent:false` yazan kopya 13/15
[`d8-selftest-mutation-root-literal.log`]). Önceki tur kanıtı (13/13) `extacc-d8-r01-is3\` altında korunur.

Koşum (normal pencere). **Bu paket revizyonunda canlı sonda ÇALIŞTIRILMADI**; koşum owner GO'sundan sonra, kayıt sahibinin
penceresinde. Dış origin **yer tutucu değildir**: blok onu mevcut doğrulanmış yapılandırmadan (canlı `.env` `PUBLIC_PORTAL_BASE_URL`; salt
okuma, D-5/D-6/D-7 bloklarıyla aynı kaynak) okur ve https/yolsuz origin biçim kapısından geçirir; kanıt kökü kullanıcı profiline görelidir
(public belgeye canlı alan adı ve kullanıcı yolu yazılmaz):
```powershell
& { $ErrorActionPreference='Stop'; $e='C:\Development\HUKUK_YAZILIMI\HY_W4_RELEASE23\project\apps\api\.env'; $l=@([IO.File]::ReadAllLines($e) | Where-Object { $_ -match '^\s*PUBLIC_PORTAL_BASE_URL\s*=' }); if($l.Count -ne 1){ throw 'PUBLIC_PORTAL_BASE_URL satiri 1 degil - DUR' }; $ExpBaseUrl=($l[0] -replace '^\s*PUBLIC_PORTAL_BASE_URL\s*=\s*','').Trim().Trim('"').Trim("'"); if($ExpBaseUrl -cnotmatch '^https://[A-Za-z0-9.-]+(:\d+)?$'){ throw 'PUBLIC_PORTAL_BASE_URL https/yolsuz origin degil - DUR' }; $f='D:\Development\HUKUK_YAZILIMI\project\project\docs\governance\client-extacc-d8-staff-surface-r01\scripts\d8-staff-surface-probe.js'; if((Get-FileHash -Algorithm SHA256 -LiteralPath $f).Hash -cne 'D5FA37D1EAC77793F3CD1D2438B496B16B7BABEFB5E804E77D863F41A954579B'){ throw 'D8 SONDA SHA UYUSMUYOR - DUR' }; $o=Join-Path $env:USERPROFILE ('Documents\CLIENT-EVIDENCE-20260911\extacc-d8-' + (Get-Date).ToUniversalTime().ToString('yyyyMMdd-HHmmss') + 'Z'); New-Item -ItemType Directory -Force -Path $o | Out-Null; & node $f --origin $ExpBaseUrl --out "$o\d8-probe.json" --phone-list; 'D8 cikis=' + $LASTEXITCODE }
```

## 2. D-8 telefon adımı (owner beyanı; makine ölçümü değildir)

Sonda `--phone-list` ile 5 adres yazar (`/auth/login`, `/`, `/api/auth/me`, `/api/portal/admin/documents/pending`, `/api/cases`).
Telefonda (Wi-Fi kapalı, mobil veri, gizli sekme) her adres için: **E** = hata/erişim engellendi · **S** = sayfa/veri açıldı · **?**.
Beyan `owner-declaration-d8.json` olarak ayrı dosyaya elle yazılır (sonda yazmaz). S = ürün/kenar bulgusu adayı.

## 3. D-8 kapanış tanımı

D-8 PASS = sonda çıkış 0 **ve** telefon beyanı 5/5 E. Katman `unknown` ise PASS düşmez; kayıt "katman kesin belirlenemedi" notu,
`denyLayerHints` (ipucu: `caddy`/`edge-provider`/`none`) ve `hints` dağılımını (bodyEmpty / serverHeaderValue / edgeHeaderPresent sayıları) taşır —
`unknown` ret olmadığı anlamına gelmez, katmanın kesin kanıtla adlandırılamadığı anlamına gelir; ipucu kesin katman diye raporlanmaz. Bulgu (403 dışı)
→ kısıtlı kayda alınır; public PR'a yol/yöntem ayrıntısı yazılmaz. `POST /api/auth/login` kenarı geçerse personel giriş sayacı
+1 yan etkisi de kayda yazılır (tek istek; blok üretmez; uygulama semantiğinde başarısız giriş denemesi sayılır — kimlik bilgisi
gönderilmemiş olsa da). `suspectAppOrigin403 > 0` ise PASS düşmez; "uygulama-kaynaklı 403 şüphesi: N" notu kayda yazılır.
Kanıttaki `measured.credentialHeaderRequests` 0 ve `measured.nonEmptyBodyRequests` 0 değilse koşum kanıt olarak KABUL EDİLMEZ
(sonda beklenmeyen bir şey göndermiştir).

## 4. D-6 belge akışı — tanım ve paket eşlemesi (koşucu + owner bloğu HAZIR: `client-extacc-portal-d6-r01`; canlıda koşulmadı)

Bağlayıcı kaynak paket belgesidir: `client-extacc-portal-d6-r01/EXTACC-D6-PORTAL-DOCUMENTS-PACKAGE-R01.md` (§1 sapma kaydı, §2 ölçütler,
§7 owner kararları). Bu tanım ile paket arasındaki **ölçülmüş** sapmalar aşağıda "ölçüldü" notuyla yazılır; tanım paketi geçersiz kılmaz.

| Konu | Tanım (bu belge, 2026-09-29 öncesi) | Paket (ölçüldü) |
|---|---|---|
| Uçlar (Caddy izin listesi) | `GET /api/portal/documents` · `POST documents/upload` (multipart, ≤10 MB, pdf/jpg/png/doc/docx) · `GET documents/:id/download` · `DELETE documents/:id` · admin uçları yalnız iç ağdan (dış 403 = D-8) | aynı; `admin/documents/pending` yalnız **yerel GET**; `approve|reject` **çağrılmaz** (D-6 §1, §7) |
| Sentetik veri | D-4 kurulumu; 1 sentetik PDF (runId gömülü, ≤ 50 KB); kapsam dışı ikinci müvekkil | aynı; kapsam dışı satır **yabancı tenantın** müvekkiline Prisma ile yazılan dosyasız satır, kapanışta Prisma ile temizlenir ve raporlanır (P6-FOREIGN-CLEAN) |
| Yan etkiler | `PortalDocument` satırı; diskte dosya; audit; bekleyen liste | **ölçüldü (kaynak `HY_WT_R27` portal.controller/service):** belge uçlarında bildirim/e-posta/outbox/**audit**/event YOK; yalnız `reviewDocument` (approve/reject) `PortalNotification` yazar — paket çağırmaz; audit farkı yalnız hesap aç/kapa; yükleme log satırı **maskesiz** (D-6 §1) |
| D6-1 | telefon: yükleme 201, owner beyanı **zorunlu** | **sapma (ölçüldü, D-6 §1):** makine ölçümü koşucunun kendi **dış** multipart yüklemesi (D6-1/D6-1D); telefon yüklemesi **opsiyonel**, beyan ayrı dosyada (`owner-declaration.json`) |
| D6-2 / D6-3 / D6-5 | liste yalnız bu koşum · indirme sha = yüklenen · DELETE → satır + dosya yok | aynı (D6-2L/2D, D6-3, D6-5/5D/5L); dosya yokluğu **üç durumlu `stat`** (`var`/`yok`/`olculemez`; `olculemez` → ÖLÇÜLEMEYEN, PASS değil) |
| D6-4 | kapsam dışı `:id` indirme/silme **404** | aynı (D6-4A/4B/4C; 200 → "KAPSAM DIŞI BELGEYE ERİŞİLDİ" ürün bulgusu) |
| D6-6 | personel onay/ret iç ağdan (**opsiyonel**) | **sapma (ölçüldü):** yalnız bekleyen liste GET'i, **zorunlu** ölçüt (FAIL → 2); onay/ret bilinçli çağrılmaz (bildirim satırı + silme kilidi) — onay/ret canlı kabulü **ayrı paket, owner kararı** (D-6 §7) |
| Kapanış | belge satırı ve dosya YOK; D-4 kuralları; Recover owner kararı | aynı + P6-C-DOC üç durumlu; Recover `D6_RESIDUE_CLEANUP=1` satırları Prisma ile siler, **dosya silmez** (listeler); Recover ölçülemeyeni 0 yapmaz (D-6 §2) |
| Owner adımları | telefondan yükleme beyanı zorunlu | **sapma:** 9 beyan sorusu; telefon yüklemesi yapıldıysa koşucu silmesinden önce telefondan silinmesi beklenir (D-6 §4) |
| Öz-test | — | koşucu 51/51 · owner bloğu WinPS 5.1 ve pwsh 7 (sayılar D-6 §5/§8) |

## 5. D-7 mesaj akışı — tanım ve paket eşlemesi (koşucu + owner bloğu HAZIR: `client-extacc-portal-d7-r01`; canlıda koşulmadı)

Bağlayıcı kaynak: `client-extacc-portal-d7-r01/EXTACC-D7-PORTAL-MESSAGES-PACKAGE-R01.md` (§2 kaynak yan etki bulgusu, §3 ölçütler, §10 owner kararları).

| Konu | Tanım (bu belge, 2026-09-29 öncesi) | Paket (ölçüldü) |
|---|---|---|
| Uçlar | `GET/POST /api/portal/messages` · `GET messages/unread-count` · `POST messages/mark-read`; personel `GET/POST /api/portal/admin/messages/:clientId` (iç ağ) | aynı; admin uçları yalnız **yerel API**; `getClientMessages` gövdesi `{ client, messages }` (çıplak dizi FAIL) ve müvekkil mesajlarını okundu işaretler (D-7 §2) |
| Sentetik veri | D-4 kurulumu; içerik `D7-<runId>` | aynı + yabancı tenant dosyası (D7-4N) ve aynı tenantta ikinci sentetik müvekkile bağlı dosya (D7-4S) |
| Yan etkiler | "`ClientMessage`" satırları; bildirim/e-posta tetikleyicisi **açık soru** | **ölçüldü (D-7 §2):** model adı `ClientMessage` **değil** — `PortalMessage` + `PortalNotification`; `sendMessageFromClient` yalnız `PortalMessage` yazar; **yalnız `sendMessageFromOffice`** `PortalNotification` (MESAJ, `/portal/messages`) yazar; **e-posta/SMS/outbox/audit YOK** — açık soru kapandı, gerçek alıcıya gönderim gerektiren kısım yok |
| D7-1 / D7-2 / D7-3 | telefon POST 201 · GET yalnız bu koşum · personel yanıtı görünür, unread 1 → mark-read 0 | makine ölçümü koşucunun kendi **dış** POST'u (D7-1); D7-2; D7-3/3N/3U (yanıtsız çağrı → ÖLÇÜLEMEYEN, FAIL değil); D7-3B telefon girişinden sonra 2. yanıt + DB satırı |
| D7-4 | kapsam dışı `caseId` ile POST **404** | **sapma (ölçüldü, D-7 §2/§10 K-3):** kaynak `resolveCaseReference` **400** "Geçersiz dosya referansı", satır yazılmaz; paket **400** ölçer (D7-4N/4S/4U); canlı 404 verirse FAIL (dist ≠ kaynak işareti) |
| D7-5 | dış admin uçları 403 (D-8) | paket **çağırmaz/ölçmez** (`d75Note`); D-8 sondası ölçer |
| Kapanış | mesaj satırları kalır; U-ISO; D-4 kuralları; "satır kaldı" owner kararı | aynı; **P7-MSG-KEPT** = koşucu satırları yerinde (`yerinde=k/k`), `PortalMessage`/`PortalNotification` **SİLİNMEDİ**, "saklandı: n" olarak raporlanır; boş doğrulama PASS vermez (D-7 §3, §10 K-1) |
| Öz-test | — | koşucu 41/41 · owner bloğu WinPS 5.1 ve pwsh 7 (sayılar D-7 §6/§11) |

## 6. Birleşik D-9 tanımı — bileşen → ölçüt kimliği

D-9 (birleşik) = D-4/D-5/D-6/D-7 koşumlarının her birinde aşağıdaki bileşenlerin **ayrı satırlarda** ölçülmesi; herhangi biri
FAIL ya da ÖLÇÜLEMEYEN ise D-9 PASS sayılmaz. Ekran görüntüsü kanıt yerine geçmez; owner beyanı makine ölçümünden ayrı tutulur.

| Bileşen (talimat 4) | Ölçüt kimliği (paket) | Ne ölçülür |
|---|---|---|
| Portal oturumu / DB kapanışı | D-4 R03 kuralları; **P5-C1…P5-C5** (D-5) · **P6-C1…P6-C5** (D-6) · **P7-C1…P7-C5** (D-7) | portal pasif, `tokenVersion` verilme sürümünden büyük, `hasPortalAccess=false`, `resetToken` NULL (P5); HTTP: yeni giriş 401 yerel+dış, **mevcut oturum 401** (P5-C4*/P6-C4/P7-C4 — korumalı uç paket başına farklı) |
| Sıfırlama bağlantısı | **P5-C-TOKEN** (D-5) | kapanışta token temizlendi; tek kullanım yalnız gözlem (P5-SINGLE-USE-OBS, owner beyanıyla birleşik) |
| Belge erişimi / kalıntısı | **P6-C-DOC** (üç durumlu) · **P6-FOREIGN-CLEAN** (D-6) | müvekkilin `PortalDocument` satırı 0 ve bilinen dosyalar diskte `yok`; `olculemez` → ÖLÇÜLEMEYEN, PASS değil; sentetik yabancı satır Prisma ile temizlendi (açıkça raporlanır) |
| Mesajlar | **P7-MSG-KEPT** (D-7) | koşucunun yazdığı `PortalMessage` satırları **yerinde**; `PortalMessage`/`PortalNotification` **SİLİNMEDİ** ("saklandı: n" raporu); boş doğrulama PASS değil |
| Sentetik personel ve dosya kapanışı | **U-CLOSE** (her paket) | personel pasif, Case CLOSED, elev personel 401 |
| İzolasyon | **U-ISO** (her paket) | sentetik olmayan tenant parmak izi değişmedi |
| Intake bağlantısı | D-1..D-3 (kabul, `cff5c692`) | USED/iptal; bu tanımda yeniden ölçülmez |

Kurallar:
- **Saklanan kayıtlar silinmiş gibi raporlanmaz:** test/audit satırları, `PortalMessage`/`PortalNotification` ve onaylanmış `PortalDocument`
  kayıtları kanıtta "saklandı: n" ile yazılır; "temizlendi/silindi" yalnız gerçekten silinen sentetik satırlar için (P6-FOREIGN-CLEAN,
  Recover `D6_RESIDUE_CLEANUP=1`).
- **Yarım kalma → Recover:** Run 5/6 ile biterse Recover makbuzla kapanışı tamamlar; Recover **ölçülemeyeni 0 yapmaz** — mevcut oturum reddi
  Recover'da ölçülemez (→ en iyi 3), dosya `olculemez` → 6; Recover'ın 0 verebildiği tek yol hesabın hiç açılmamış olduğu erken dönüştür
  (HTTP reddi ölçülmez). Belge kalıntısında dosya owner tarafından elle silinir ve Recover bir kez daha koşar; kova ACL okunamıyorsa önce düzeltilir.
- Mesaj kalıntısı owner kararı K-1 (D-7 §10) ile "saklandı" kaydıyla kabul edilir; DB'den elle silme önerilmez.
- H1–H8 sayacı D-9'dan türetilmez (0/8 değişmez).

## 7. Pinler

`d8-staff-surface-probe.js` `D5FA37D1EAC77793F3CD1D2438B496B16B7BABEFB5E804E77D863F41A954579B` · `d8-selftest.js` `AD7B0759F7AE99BDCB27ABD5F8B869C2F6E68B0B10289A0E86548BF4315E4AB7`.
(Önceki pinler: R01 ilk `DD6448A5…` / `E50EAE0C…`; birinci tur düzeltme `51B78C3B…` / `F9E9BD65…` [13/13]; ikinci tur `6400223…` / `A311CF00…`
[15/15] — R27-R03'te katman ipucu düzeltmesiyle 2026-09-30 değişti; öz-test 15/15.)
