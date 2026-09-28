# EXTACC D-4 R01 — Portal girişi dış cihazdan + portal erişim kapanışı (canlı kabul paketi)

> **DURUM (2026-09-28): HAZIRLIK — R02 (§11) ve R03 (§12) inceleme düzeltmeleri uygulandı.** Canlı Run/Recover **başlatılmadı**; Preflight bu paket için **koşulmadı**. Bu belge canlı
> koşum GO'su değildir; GO biçimi `OWNER-GO-CLIENT-EXTACC-D4-YYYYMMDD-RNN` (intake GO'su `OWNER-GO-CLIENT-EXTACC-…` kabul
> **edilmez**). Hizmet kabulü H1–H8 **0/8**; D-5…D-8 durumu **değişmez**; D-1/D-2/D-3/D-9 kaydı EXTACC paketi §12'dedir.
> D-halkaları `client-external-access-r01` §7'de tanımlıdır.

## 1. Kapsam

| Halka | Bu paketin ölçtüğü |
|---|---|
| **D-4** Portal girişi dış cihazdan çalışır | Sentetik müvekkile yetkili personelle portal hesabı (gönderimsiz) → owner **telefondan** (mobil veri) **bir kez** giriş yapar ve dosya listesinde **yalnız bu koşumun dosyasını** görür. Koşucu: giriş yerel 201 + oturum; dosya listesi yerel ve dış HTTPS 200 ve yalnız bu koşumun dosyası; yanlış parola yerel ve dış **401**; telefon girişi DB'de (giriş sayacı) salt okuma algılanır |
| **D-9 (portal kapsamı)** Portal erişim kapanışı | Yetkili uçla devre dışı bırakma → **DB kanıtı** (pasif · müvekkil portal erişimi kapalı · oturum sürümü, oturumların verildiği sürümden büyük) ve **HTTP kanıtı** (yeni giriş yerel + dış **401**; koşumda alınmış **mevcut oturumla** korumalı uç `GET /api/portal/cases` yerel + dış **401**) **ayrı ayrı** → personel/dosya kapanışı. Ölçülemeyen HTTP kontrolü PASS sayılmaz |

`client-external-access-r01` §7 D-4 ölçütü "Giriş 200" yazar; ürünün `POST /api/portal/login` yanıtı Nest varsayılanıyla **201**'dir
(R26 kanıtı da 201). Bu paket 201'i ölçer.

**Kapsam dışı:** parola sıfırlama (D-5), belge (D-6), mesaj (D-7), personel yüzeyi (D-8). Bu uçlar koşucu tarafından **çağrılmaz**
(kaynak taraması T-2 + sahte API'de yasak uç işareti).

## 2. Ürün davranışı (kaynaktan ve canlı dist'ten doğrulandı)

- `POST /api/portal/admin/create-user` (`JwtAuthGuard`; `assertCanManagePortalAccess` → PARTNER ya da yetkilendirilmiş avukat):
  müvekkil tenant'ta olmalı; başka **aktif** portal kullanıcısında aynı e-posta → 409; bcrypt; `hasPortalAccess=true` + audit
  `CLIENT_PORTAL_ACCESS_ENABLE`. **E-posta/SMS göndermez.** `elev1` PARTNER bağlıdır (I13 ölçüm geçerliliği).
- `POST /api/portal/login` (`LoginRateLimitGuard`): `{email, password}` → 201 `{token, user}`; son giriş zamanı + giriş sayısı
  güncellenir; token 7 gün geçerli, taşıdığı `tokenVersion` ile. Hata metni tek: "Geçersiz e-posta veya şifre" (401).
- `PortalAuthGuard` **her istekte**: tür `portal` · DB'de aktif · müvekkil/tenant bağı · `tokenVersion` eşitliği · tenant yaşam döngüsü.
- `POST /api/portal/admin/disable-user`: tek işlemde portal kullanıcıları `isActive=false` + `tokenVersion+1`, müvekkil
  `hasPortalAccess=false` + audit `CLIENT_PORTAL_ACCESS_DISABLE`. Gönderim yok.
- `GET /api/portal/cases`: `showToClient=true` (varsayılan) ve müvekkile bağlı dosyalar; kurulumun dosya numarası `I3-` ön eki + koşum kimliğidir (gerçek değer yalnız konsolda).
- Kenar izin listesi (`client-external-access-r01` §2.1): `GET /portal/login`, `GET /portal/cases`, `POST /api/portal/login`,
  `GET /api/portal/cases` **izinli**; `/api/portal/admin/*` dışarıdan **kapalı** → koşucu yönetim uçlarını yalnız yerel API'den çağırır.
- Giriş hız sınırı süreç içi, IP başına 10 deneme/dk. Koşucunun yerel ve dış denemeleri toplam ~7'dir; 429 görülürse ilgili satır
  **ÖLÇÜLEMEYEN** olur (başarı sayılmaz).

## 3. Akış (`scripts/d4-portal-live-run.js`, owner bloğu `scripts/d4-owner-live-block.ps1`)

1. **Kapılar**: TLS doğrulaması açık · beklenen DB = bağlı DB · API beyanı · https origin · D-4 GO deseni · runId/slug. Gösterim
   kanalı (konsol `\\.\CONOUT$`) **hiçbir yazmadan önce** açılır; yoksa çıkış 4 (Y13).
2. Sentetik kurulum (I3) + makbuz (portal e-postası dahil; **parola yok**) → `elev1` girişi.
3. Makbuza **önce** `createAttemptedAt` yazılır (yazılamazsa istek gönderilmez) → `P-01` create-user (gövde yalnız
   `clientId/email/password`; e-posta `portal-d4-` + koşum kimliği + `@ah-harness.invalid` (gerçek değer yalnız konsolda); geçici
   parola koşucu içinde rastgele üretilir). Yanıt yoksa ya da 5xx ise sonuç **belirsiz**dir: hesap sonradan oluşabilir (§3.2).
   `P-02` DB: aktif · erişim açık · e-posta doğru → oturumların verileceği `tokenVersion` makbuza `portalIssuedTokenVersion`
   olarak yazılır (Recover sürümü bununla karşılaştırır).
4. `P-03L` koşucunun kendi portal girişi (yerel) → **mevcut oturum** (kapanışta ölçülecek) · `P-04L/P-04D` dosya listesi yerel ve
   dış HTTPS: 200 ve **tam olarak** bu koşumun dosyası (kayıt sayısı 1, id ve dosya numarası eşit) · `P-05L/P-05D` yanlış parola 401.
   **GÖSTERİM KAPISI:** `P-03L`, `P-04L`, `P-04D`, `P-05L`, `P-05D` beşi de PASS değilse QR/parola **gösterilmez** ve telefon girişi
   **beklenmez**; kapanış yine çalışır (Y6 kapsam sızıntısı, Y7 dış 503, **Y15 yanlış parola 201**, **Y16 dış yanlış-parola ölçülemedi**).
   Kanıtta `displayGate` her kontrolün sonucunu tutar.
5. Owner konsolu: portal giriş sayfasının QR'ı + adres + e-posta + **geçici parola** + beklenen dosya numarası. Koşucu DB'yi
   5 sn aralıkla **salt okur** (en çok 20 dk); giriş sayısı artınca `P-WAIT` PASS, **120 sn** inceleme süresi, sonra ekran ve
   kaydırma arabelleği temizlenir. Giriş görülmezse `P-WAIT` ÖLÇÜLEMEYEN.
6. **Kapanış (finally)**: `P-C1` disable-user (5xx'te bir yeniden deneme; hesap zaten kapalıysa çağrılmaz) · **DB:** `P-C2`
   pasif + erişim kapalı · `P-C2V` sürüm · **HTTP:** `P-C3L/P-C3D` yeni giriş 401 · `P-C4L/P-C4D` **mevcut oturum** korumalı uçta 401 ·
   `P-C5` HTTP ölçümlerinden sonra DB hâlâ kapalı · `U-CLOSE` personel pasif + dosya CLOSED · `P-D9` birleşik · `U-ISO`.
7. Owner bloğu: ekran temizliği → kanıttan kapanış sonucu okunur ve owner'a **"DOĞRULANDI"** ya da **"DOĞRULANAMADI (çıkış N)"**
   olarak gösterilir (koşulsuz "kapatıldı" metni yok) → owner telefonda sayfayı **bir kez yeniler** → yönlendirmesiz owner beyanı
   (ayrı dosya; gösterilen kapanış metni de kaydedilir) → manifest.

### 3.1 Mevcut oturum kuralı

Kapanış **yalnız yeni girişin 401 olmasıyla PASS sayılmaz.** Koşumda alınmış oturum kapanıştan sonra korumalı uçta **200** alırsa:
`P-C4*` FAIL, kanıta `productFinding: "ÜRÜN BULGUSU: portal erişimi kapatıldıktan sonra MEVCUT oturum korumalı uca erişmeye
devam ediyor"` yazılır, `P-D9` FAIL, çıkış **6**; owner bloğu bulguyu kırmızı gösterir ve Recover'ın bunu düzeltmediğini söyler
(Y3: sahte API'de guard kusuru taklidi; mutant M-1). Telefonun kendi oturumunun kapanması **owner beyanıdır**
(`yenilemeSonrasiEkran`: L liste / G giriş sayfası / D başka / Y yenilemedim / ?); koşucu telefon token'ını görmez. Owner "L" yanıtlarsa
blok bunu kırmızı **ürün bulgusu adayı** olarak gösterir.

### 3.2 DB kapanışı ile HTTP reddi ayrı; belirsiz oluşturma

- **Sürüm kendisiyle karşılaştırılmaz.** `P-C2V` referansı önce oturumların verildiği sürümdür (Run'da bellekte, Recover'da
  makbuzdaki `portalIssuedTokenVersion`); yoksa ve hesap bu kapanışta açıktıysa kapanıştan hemen önceki sürüm; hesap zaten kapalı
  ve verilme sürümü bilinmiyorsa `P-C2V` **ÖLÇÜLEMEYEN** (FAIL da PASS da değil; Y14-c). Kanıtta `version {before, after, issued, ref}`
  ve Recover'da `versionEvidence` korunur.
- **HTTP reddi ayrı değerlendirilir.** `dbClosed` = P-C2 PASS + P-C2V FAIL değil + P-C5 PASS. Portal kapanışı yalnız DB kapalı **ve**
  gerekli HTTP kontrollerinin tamamı **PASS** ise doğrulanmış sayılır (mevcut oturum kontrolü, koşucu oturumu alındıysa ya da giriş
  bilgisi gösterildiyse gereklidir). Ölçülemeyen gerekli HTTP kontrolü → çıkış **6** ve kurtarma notu "DB kapalı ama HTTP reddi
  doğrulanmadı" (Y14-a, Y16).
- **Recover** zaten kapalı hesapta `disable-user` çağırmaz ve sürüm artışı beklemez; yeni giriş reddini ölçmek için **yalnız pasif**
  hesaba rastgele bir ölçüm parolası yazar (hesap açılmaz; `P-C5` hâlâ kapalı olduğunu doğrular). Koşumun oturumu sır olduğu için
  saklanmaz → Recover'da `P-C4*` her zaman **ÖLÇÜLEMEYEN**'dir ve Recover çıkışı bu durumda **3**'tür (0 değil; Y4-b, Y14-b, Y18-b).
  Recover çıkışı: 6 DB kapanmadı / HTTP FAIL / geç oluşma riski · 5 personel · 3 ölçülemeyen var · 0 hepsi PASS.
- **Belirsiz oluşturma.** create-user zaman aşımı ya da 5xx ise kapanış, hesap görünene kadar en çok **120 sn** (canlı sabit)
  bekler. Görünürse yetkili uçla kapatır (Y17). Görünmezse "hiç açılmadı, kapanış tamam" **demez**: `P-C1` ÖLÇÜLEMEYEN, çıkış **6**,
  kurtarma notu "geç oluşma dışlanamadı" (Y8, Y18-a). Koşumdan sonra oluşan aktif hesap Recover ile kapatılır (Y18-b).
- **Recover da belirsizliği taşır (R03).** Run oluşturma sonucunu makbuza `createOutcome` (`ok` / `rejected` / `uncertain`) olarak
  yazar. Makbuzda deneme var ve sonuç kesin (`ok`/`rejected`) değilse Recover sorgu anındaki yokluğu kapanış saymaz: hesap
  görünene kadar bekler; görünürse personel oturumunu **o anda** açar ve kapatır (Y19); süre dolarsa `P-C1` ÖLÇÜLEMEYEN, çıkış **6**,
  `recovery.gerekli=true` (Y20-a). Bekleme süresinin dolması tek başına kapanış kanıtı sayılmaz.

## 4. Ölçütler

| Ölçüt | D | Ne ölçer |
|---|---|---|
| P-00 | — | ölçüm geçerli (elev1 ADMIN değil) |
| P-01 / P-02 | D-4 | gönderimsiz portal hesabı; DB aktif + erişim açık + e-posta |
| P-03L | D-4 | koşucu portal girişi yerel 201 + oturum |
| P-04L / P-04D | D-4 | dosya listesi yerel / dış HTTPS 200 ve YALNIZ bu koşumun dosyası |
| P-05L / P-05D | D-4 | yanlış parola yerel / dış 401 |
| P-DISP | D-4 | giriş bilgisi yalnız yerel konsola gösterildi |
| P-WAIT | D-4 | koşucu dışında başarılı portal girişi pencere içinde (DB giriş sayacı). Cihaz/ağ = owner beyanı |
| P-C1 | D-9 | yetkili uçla kapatma (ya da zaten kapalı); belirsiz oluşturmada geç hesap beklenir |
| P-C2 / P-C2V | D-9 | DB: pasif + erişim kapalı / `tokenVersion` oturumların verildiği (ya da kapanış öncesi) sürümden büyük — kendisiyle karşılaştırma yok |
| P-C3L / P-C3D | D-9 | kapanış sonrası YENİ giriş yerel / dış 401 |
| P-C4L / P-C4D | D-9 | kapanış sonrası MEVCUT oturum korumalı uçta yerel / dış 401 |
| P-C5 | D-9 | HTTP ölçümlerinden sonra DB hâlâ kapalı, sürüm geri gitmedi |
| U-CLOSE | D-9 | personel pasif (tokenVersion++) + dosya CLOSED |
| P-D9 | D-9 | birleşik: DB kapalı + gerekli HTTP reddi PASS + U-CLOSE |
| U-ISO | — | bu koşumun iki sentetik tenantı **dışındaki** tenantlarda tenant başına kullanıcı ve müvekkil **sayıları** önce/sonra aynı (önceki koşumların sentetik test tenantları dahil; yalnız sayı) |

**Çıkış:** 0 PASS · 2 FAIL · 3 ÖLÇÜLEMEYEN · 1 DURDU · 4 KİMLİK/HEDEF REDDİ · 7 KANIT YAZILAMADI · 5 PERSONEL/DOSYA KAPANIŞI ·
**6 PORTAL ERİŞİMİ KAPANDIĞI DOĞRULANMADI** (öncelik 6 > 5 > 7 > 1 > 2 > 3 > 0) · owner bloğu 90 kapı · 91 node başlatılamadı.
Dış uç 503/429/zaman aşımı kapanışta ÖLÇÜLEMEYEN'dir ve portal kapanışını **doğrulanmamış** bırakır (çıkış 6, Y7).

## 5. Sırlar ve kayıt davranışı

| Değer | Nerede görünür | Nereye YAZILMAZ |
|---|---|---|
| Geçici portal parolası | yalnız owner konsolu (`\\.\CONOUT$`), koşum sonunda ekran + kaydırma arabelleği temizlenir | log, kanıt, makbuz, repo, sohbet (S-1, T-1) |
| Portal e-postası (`*.invalid`) | konsol + makbuz | — (sentetik, gönderim yok) |
| Personel parolası, personel/portal JWT, DB URL, GO | hiçbir yer | log, kanıt, makbuz (S-1) |

T-1 statik denetimi: geçici parola kaynakta **tam altı** yerde geçer (üretim+`addSecret` · create-user gövdesi · koşucu girişi ·
yanlış parola türetimi · konsol satırı · kapanışa kimlik bilgisi); başka kullanım FAIL'dir. Konsol davranışı EXTACC konsol öz-testiyle
ölçülür (aynı `extacc-display.js`, pinli): C-1…C-5 **5/5** (2026-09-28 yeniden koşuldu). **Uygulama Terminal paneli ya da transcript'li
oturum kullanılmaz**; owner bloğu bağımsız pencere teyidi ister ve yönlendirilmiş çıktıda durur (K-1).

## 6. Canlıda oluşacak kayıtlar ve kapanış

Yeni sentetik tenant: sentetik personel, müvekkil, dosya (`I3-` + koşum kimliği), borçlu; sentetik müvekkile **bir** portal hesabı;
portal erişim açma/kapatma audit kayıtları; giriş sayacı/son giriş zamanı; API günlüğünde maskelenmiş sentetik e-postayla
"Portal girişi" satırları; giriş hız sınırı sayacı (süreç içi). **E-posta/SMS yok**, gerçek müvekkil verisi yok, bildirim yok.
Kapanış sonrası: portal hesabı pasif + `tokenVersion` artmış, `hasPortalAccess=false`, personel pasif, dosya CLOSED.
Recover gerekirse yalnız **pasif** portal hesabına yeni giriş reddini ölçmek için rastgele bir ölçüm parolası yazar (hesap açılmaz).
Owner bloğu bunları Run'dan önce sunar; büyük harfle `EVET` yazılmadan GO sorulmaz (K-3).

## 7. Owner talimatı (iki cihaz)

1. **Ofis PC:** bağımsız bir PowerShell penceresi (uygulamanın Terminal paneli DEĞİL). Önce Preflight, isterseniz QrTest.
2. **Telefon:** kendi tarayıcısı, **Wi-Fi kapalı, mobil veri açık**, mümkünse gizli sekme. Konsoldaki QR'ı okutun ya da adresi yazın.
3. Konsolda görünen **e-posta ve parolayı konsoldaki haliyle** girin. Belgede örnek değer yoktur; başka bir yerden kopyalamayın.
4. Giriş sonrası **Dosyalarım** sayfasında yalnız konsolda yazan dosya numarasının göründüğünü kontrol edin. Parola değiştirmeyin,
   "şifremi unuttum"u kullanmayın, belge/mesaj açmayın.
5. Konsol "Giriş algılandı" dedikten sonra 120 sn içinde listeyi inceleyin; ekran temizlenince kapatma adımı çalışır.
6. Blok kapanış sonucunu ("DOĞRULANDI" ya da "DOĞRULANAMADI") gösterir. Sonra telefonda sayfayı **bir kez yenileyin** ve soruları
   **ekranda gördüğünüze göre** seçenekle yanıtlayın; emin değilseniz `?`. Telefonda yapılamazsa ofis tarayıcısına **geçmeyin**.
7. Pencereyi kapatın. GO ref, parola ya da ekrandaki değerleri kimseye iletmeyin.

## 8. İzole doğrulama

| Test | Sonuç |
|---|---|
| `d4-selftest.js` (disposable PG 16 + `d4-fake-portal-api.js` + gerçek TLS) | **39/39** — Y1 normal (telefon girişi + liste + kapanış + telefon oturumu da 401) · Y2 telefon girişi yok · Y3 **mevcut oturum kapanmıyor** (yeni giriş 401 iken çıkış 6 + ürün bulgusu) · Y4 kapatma hatası → 6 → Recover → **3** · Y5 kapatma 500 + yeniden deneme · Y6 kapsam sızıntısı → gösterim yok · Y7 dış 503 · Y8 create-user 500 → geç oluşma dışlanamadı, **6** · Y9 makbuz · Y10 kanıt → 7 · Y11 gösterimsiz canlı reddi · Y12 TLS · Y12b intake GO reddi · Y13 konsolsuz koşum · **Y14** DB kapandı + dış kontrol başarısız → Recover (sürüm kendisiyle karşılaştırılmaz; verilme sürümü yoksa ÖLÇÜLEMEYEN) · **Y15** yanlış parola 201 → gösterim yok · **Y16** dış yanlış-parola ölçülemedi → gösterim yok · **Y17** geç oluşan hesap görülüp kapatıldı · **Y18** koşumdan sonra oluşan hesap → koşum 6, Recover kapattı · S-1 sır taraması (geçici portal parolası ve Recover ölçüm parolası dahil; son koşumda 93 değer, 56 dosya, sızıntı yok) · T-1…T-7 statik · P-1/P-2 canlı süreler + kapılar |
| `d4-owner-block-selftest.ps1` (owner bloğunun GERÇEK fonksiyonları, AST) | PS 5.1 **46/46** · PS 7.6 **46/46** (O-1…O-3: kapanış metni kanıta bağlı, soru metinleri yönlendirmesiz) |
| `extacc-console-selftest.ps1` (paylaşılan gösterim modülü) | **5/5** |

Negatif kontrol (koşucu mutantları; her biri tam öz-testle koşuldu, mutant dosyaları silindi — sonuçlar §11.1):
M-1 kapanış yalnız yeni girişe bakar · M-2 R01 gösterim kapısı (P-05 yok) · M-3 R01 sürüm mantığı (kendisiyle karşılaştırma) ·
M-4 R01 belirsiz oluşturma (ilk sorguda yok = hiç açılmadı).

Test dosyalarındaki GO örnekleri **2000-01-01** tarihlidir: owner bloğu repoda geçen GO değerini tüketilmiş sayar; gerçek bir D-4 GO'su ile
çakışmamaları için.

**Sınır:** `d4-fake-portal-api.js` ürünün portal mantığını kaynaktan taklit eder; ürünün kendi guard'ı, `isApproverEligible`,
hız sınırı ve tenant yaşam döngüsü burada ölçülmez — bunlar canlı koşumda ölçülür. Uçtan uca koşum gerçek konsolda (parola
gösterimiyle) ayrıca yapılmadı; gösterim modülü C-1…C-5 ile, konsolsuz ret Y13 ile ölçüldü.

## 9. Dosyalar ve sha256

Owner bloğunda pinli (koşucunun yüklediği dosyalar + QR denemesi; `h5-url-selftest-reqtree.js` ile ölçüldü, T-3) — paket digest
`D019981C35DE3C7DBE449E775C9078723C661C7D89DD6008D57A61F86523C095`:

| dosya (`project/docs/governance/` altında) | sha256 |
|---|---|
| `client-extacc-portal-d4-r01/scripts/d4-portal-live-run.js` | `4B28094DEA1E7F2E4DEF2253F0BE9EAA9F1B845884B6697D621141CD8D123222` |
| `client-extacc-intake-chain-r01/scripts/extacc-display.js` | `F257188DF66C429472C214D38D965C1E6F5A2EA490D348369AC68C5DC6F26867` |
| `client-extacc-intake-chain-r01/scripts/extacc-qr-test.js` | `61FBCEE86148DEA1B268A1B883F1690ED6F3D4BBD36EAEA29783F24D487B8B10` |
| `client-extacc-intake-chain-r01/scripts/vendor/qrcode-generator-1.4.4/qrcode.js` | `18AE399F81182BC9DE916E9C77B195DF20CC58D6F2D55A62B085A299F1BF1780` |
| `client-h5-intake-url-r01/scripts/h5-url-live-run.js` | `F2D0975DC9F9D148E4C889472FA11AE6A873A6BDF577C36657ED9BCB4FF9C359` |
| `client-live-acceptance-i13-r01/scripts/i13-lib.js` | `59BA7360F270AB66D0A892659A7569AFF1800D65B49415EF5FAD3B84DFEDD385` |
| `client-live-acceptance-i12-r01/scripts/i12-live-identity.js` | `9516E462CFFD3B22FD253F556A7F1853C6F021B175075449BD7945CCEF36774F` |
| `client-acceptance-runners-i3-r01/scripts/i3-lib.js` | `56F3788E9F84746CFFEE384D8C18B9B9A28130CC8E2285F9570AB69CC6EE74A3` |
| `client-acceptance-harness-r01/scripts/ah-lib.js` | `DF882DB7F33A667092F126F01E518C1A8292C8C0B3C4C039BF73D71F3ACCBFD7` |

Canlı dist ve `.env` pinleri EXTACC bloğuyla aynıdır (T-7): dist `A8B17A38…53A0`, `.env` `5C776BBE…908D`.

Owner ve test araçları:

| dosya | sha256 |
|---|---|
| `scripts/d4-owner-live-block.ps1` | `03EC0C00E8534898F36D8210EBDEB92FB11EEEACBE53CF27A22C50E2AA831FFB` |
| `scripts/d4-selftest.js` | `2BD1E5844926DA92979DFEA21F42269F4658D3C8E3D3AC9021F77F707FFB710A` |
| `scripts/d4-owner-block-selftest.ps1` | `DED03B60E541D8F452AADED6E5A7F00B9C4E21474D3223F3421A7A8ED883AAA1` |
| `scripts/d4-fake-portal-api.js` | `ABE8DD95B8925DFE80E14CC093209846F73071B18F6884D5C37947E45DD8CCE4` |

Paylaşılan dosyalarda **değişiklik yok** (EXTACC, H5, I3/I12/I13, AH): yalnız yeniden kullanıldı ve pinlendi.

## 10. Saat notu (sonradan yapılan işlem)

EXTACC paketi §12.4'te kayıtlıdır. Bu paketin canlı koşumunda zaman damgaları koşum anındaki PC saatiyle yazılır; telefon saatiyle
karşılaştırmadan süre çıkarılmaz.

## 11. R02 inceleme düzeltmeleri (2026-09-28) — canlı koşum YOK

| # | Bulgu | Düzeltme | Kanıt |
|---|---|---|---|
| 1 | Recover, zaten pasif ve erişimi kapalı hesapta mevcut `tokenVersion`'ı **kendisiyle** karşılaştırıp artış bekliyordu; DB ve HTTP tek bayrakta toplanıyordu | `P-C2V` referansı oturumların verildiği sürüm (makbuzda `portalIssuedTokenVersion`), yoksa yalnız bu çağrıda kapatılan hesap için kapanış öncesi sürüm; ikisi de yoksa **ÖLÇÜLEMEYEN**. `dbClosed` / `httpVerified` / `httpFailed` ayrı; Recover çıkışı ölçülemeyen varsa **3** (0 değil). Kanıtta `version` ve `versionEvidence` korunur | Y14-a/b/c, Y4-b, Y18-b · mutant M-3 |
| 2 | Gösterim kapısı yanlış parola kontrollerini içermiyordu | Kapı `P-03L, P-04L, P-04D, P-05L, P-05D`; biri PASS değilse QR/parola gösterilmez, telefon beklenmez, kapanış çalışır; `displayGate` kanıtta | Y15 (yanlış parola 201), Y16 (dış yanlış parola 503) · mutant M-2 |
| 3 | Owner bloğu "portal erişimi kapatıldı" diyordu (koşulsuz); telefon soruları yönlendiriciydi | Kapanış metni kanıttaki `P-D9`'dan: **DOĞRULANDI** / **DOĞRULANAMADI (çıkış N)**; kanıt okunamazsa DOĞRULANAMADI. Yedi seçenekli, yönlendirmesiz soru; owner'a gösterilen metin beyana kaydedilir; yenilemede "L" (liste) → ürün bulgusu adayı uyarısı. Koşucu konsol metni de koşulsuz iddia içermez | O-1, O-2, O-3, R-8 |
| 4 | create-user zaman aşımında ilk DB sorgusunda hesap yoksa "hiç açılmadı, kapanış tamam" sayılıyordu | Deneme makbuza önce yazılır; yanıt yok/5xx = belirsiz → kapanış hesap görünene kadar en çok 120 sn (canlı sabit) bekler, görürse kapatır; görmezse `P-C1` ÖLÇÜLEMEYEN, çıkış 6, kurtarma notu. Koşumdan sonra oluşan hesabı Recover kapatır | Y8, Y17, Y18-a/b · mutant M-4 |

### 11.1 Mutant sonuçları (tam öz-test, 39 ölçüt)

| Mutant | Geri getirilen R01 davranışı | Sonuç | Düşen |
|---|---|---|---|
| M-1 | kapanış yalnız yeni girişe bakar | 36/39 | Y3-a, Y3-b |
| M-2 | gösterim kapısında P-05L/P-05D yok | 36/39 | Y15, Y16 |
| M-3 | sürüm her zaman kapanış öncesi okunanla (zaten kapalı hesapta kendisiyle) karşılaştırılır | 35/39 | Y14-b, Y14-c (+ Y18-b yalnız gözlem etiketinden) |
| M-4 | belirsiz oluşturmada bekleme yok; ilk sorguda yok = kapanış tamam | 35/39 | Y8, Y17, Y18-a |

Mutantlar, S-1 taramasına Recover ölçüm parolası eklenmeden önceki öz-test sürümüyle koşuldu (fark yalnız sır taramasındadır).
Her mutantta T-3 ayrıca düşer: owner bloğunun pin listesi gerçek koşucu dosya adını bekler (mutant dosya adı farklı). Mutant
dosyaları koşumdan sonra silindi.

### 11.2 Sınırlar

- Recover koşumun portal oturumunu **saklamaz** (sır); bu yüzden Recover mevcut oturum reddini ölçemez ve bunu PASS saymaz.
- Recover yeni giriş reddini yalnız **pasif** hesaba yazdığı rastgele ölçüm parolasıyla ölçer; parola hiçbir yere yazılmaz (S-1).
- Geç oluşma penceresi (120 sn) bir üst sınırdır; pencereden sonra oluşan hesap koşumda kapanmış **sayılmaz** (çıkış 6) ve Recover gerekir.

## 12. R03 inceleme düzeltmesi (2026-09-28) — canlı koşum YOK

| Bulgu | Düzeltme | Kanıt |
|---|---|---|
| Recover, `createAttemptedAt` bulunan makbuzla çalışırken hesap sorgu anında yoksa belirsizliği `closePortal`'a aktarmıyordu; yokluk başarılı kapanış sayılıyor, Recover çıkış 0 ve `recovery.gerekli=false` üretiyordu | Run oluşturma sonucunu makbuza `createOutcome` olarak yazar. Recover `createUncertain = createAttemptedAt var ve createOutcome ∉ {ok, rejected}` hesaplar ve `closePortal`'a aktarır (kanıtta `createEvidence`). Süre dolarsa çıkış 6 + kurtarma notu. Kapatma gerekirse personel oturumu `sessionProvider` ile **bekleme sırasında da** açılır; `closeAccess` sonunda personeli yeniden kapatır | Y19 (hesap Recover beklerken oluşur → bulunur, kapatılır, personel yeniden pasif), Y20-a (hesap Recover bittikten sonra oluşur → Recover çıkış 6, PASS/0 yok), Y20-b (sonraki Recover kapatır) |

Kapsam dar: yalnız `d4-portal-live-run.js` (makbuza sonuç yazımı, `closePortal` oturum sağlayıcısı, Recover belirsizliği) ve
öz-test; ürün kodu değişmedi.

**Sonuçlar:** `d4-selftest.js` **42/42** (sır taraması 112 değer, 68 dosya, sızıntı yok) · owner bloğu PS 5.1 **46/46** · PS 7 **46/46** ·
konsol **5/5**.

| Mutant | Geri getirilen davranış | Sonuç | Düşen · gözlem |
|---|---|---|---|
| M-5 | R02 Recover: belirsizlik `closePortal`'a aktarılmaz | 39/42 | Y19, Y20-a — **Recover çıkış 0, `recovery.gerekli=false`, hesap sonradan aktif** (inceleme bulgusunun birebir yeniden üretimi) |
| M-6 | personel oturumu yalnız başta açılır (bekleme sırasında açılamaz) | 40/42 | Y19 — hesap bulundu ama kapatılamadı, aktif kaldı; Recover çıkış 6 |

(T-3 her mutantta yalnız dosya adı farkından düşer; mutant dosyaları silindi.)
