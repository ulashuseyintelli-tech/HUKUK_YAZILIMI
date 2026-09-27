# EXTACC D-4 R01 — Portal girişi dış cihazdan + portal erişim kapanışı (canlı kabul paketi)

> **DURUM (2026-09-28): HAZIRLIK.** Canlı Run/Recover **başlatılmadı**; Preflight bu paket için **koşulmadı**. Bu belge canlı
> koşum GO'su değildir; GO biçimi `OWNER-GO-CLIENT-EXTACC-D4-YYYYMMDD-RNN` (intake GO'su `OWNER-GO-CLIENT-EXTACC-…` kabul
> **edilmez**). Hizmet kabulü H1–H8 **0/8**; D-5…D-8 durumu **değişmez**; D-1/D-2/D-3/D-9 kaydı EXTACC paketi §12'dedir.
> D-halkaları `client-external-access-r01` §7'de tanımlıdır.

## 1. Kapsam

| Halka | Bu paketin ölçtüğü |
|---|---|
| **D-4** Portal girişi dış cihazdan çalışır | Sentetik müvekkile yetkili personelle portal hesabı (gönderimsiz) → owner **telefondan** (mobil veri) **bir kez** giriş yapar ve dosya listesinde **yalnız bu koşumun dosyasını** görür. Koşucu: giriş yerel 201 + oturum; dosya listesi yerel ve dış HTTPS 200 ve yalnız bu koşumun dosyası; yanlış parola yerel ve dış **401**; telefon girişi DB'de (giriş sayacı) salt okuma algılanır |
| **D-9 (portal kapsamı)** Portal erişim kapanışı | Yetkili uçla devre dışı bırakma → DB (pasif · oturum sürümü arttı · müvekkil portal erişimi kapalı) → **yeni giriş** yerel + dış **401** → koşumda alınmış **mevcut oturumla** korumalı uç (`GET /api/portal/cases`) yerel + dış **401** → personel/dosya kapanışı |

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
3. `P-01` create-user (gövde yalnız `clientId/email/password`; e-posta `portal-d4-` + koşum kimliği + `@ah-harness.invalid` (gerçek değer yalnız konsolda); geçici parola
   koşucu içinde rastgele üretilir) → `P-02` DB: aktif · erişim açık · e-posta doğru. Başarısızsa giriş bilgisi **gösterilmez**.
4. `P-03L` koşucunun kendi portal girişi (yerel) → **mevcut oturum** (kapanışta ölçülecek) · `P-04L/P-04D` dosya listesi yerel ve
   dış HTTPS: 200 ve **tam olarak** bu koşumun dosyası (kayıt sayısı 1, id ve dosya numarası eşit) · `P-05L/P-05D` yanlış parola 401.
   Liste başka dosya içerirse (Y6) ya da dış uç 503 dönerse (Y7) giriş bilgisi **gösterilmez**.
5. Owner konsolu: portal giriş sayfasının QR'ı + adres + e-posta + **geçici parola** + beklenen dosya numarası. Koşucu DB'yi
   5 sn aralıkla **salt okur** (en çok 20 dk); giriş sayısı artınca `P-WAIT` PASS, **120 sn** inceleme süresi, sonra ekran ve
   kaydırma arabelleği temizlenir. Giriş görülmezse `P-WAIT` ÖLÇÜLEMEYEN.
6. **Kapanış (finally)**: `P-C1` disable-user (5xx'te bir yeniden deneme) · `P-C2` DB · `P-C3L/P-C3D` yeni giriş 401 ·
   `P-C4L/P-C4D` **mevcut oturum** korumalı uçta 401 · `U-CLOSE` personel pasif + dosya CLOSED · `P-D9` birleşik · `U-ISO`.
7. Owner bloğu: ekran temizliği → owner **telefonda sayfayı yeniler** → owner beyanı (ayrı dosya) → manifest.

### 3.1 Mevcut oturum kuralı

Kapanış **yalnız yeni girişin 401 olmasıyla PASS sayılmaz.** Koşumda alınmış oturum kapanıştan sonra korumalı uçta **200** alırsa:
`P-C4*` FAIL, kanıta `productFinding: "ÜRÜN BULGUSU: portal erişimi kapatıldıktan sonra MEVCUT oturum korumalı uca erişmeye
devam ediyor"` yazılır, `P-D9` FAIL, çıkış **6**; owner bloğu bulguyu kırmızı gösterir ve Recover'ın bunu düzeltmediğini söyler
(Y3: sahte API'de guard kusuru taklidi; mutant M-1). Telefonun kendi oturumunun kapanması **owner beyanıdır**
(`yenilemedeOturumKapandi`); koşucu telefon token'ını görmez.

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
| P-C1 / P-C2 | D-9 | yetkili uçla kapatma; DB pasif + `tokenVersion` arttı + erişim kapalı |
| P-C3L / P-C3D | D-9 | kapanış sonrası YENİ giriş yerel / dış 401 |
| P-C4L / P-C4D | D-9 | kapanış sonrası MEVCUT oturum korumalı uçta yerel / dış 401 |
| U-CLOSE | D-9 | personel pasif (tokenVersion++) + dosya CLOSED |
| P-D9 | D-9 | birleşik: P-C1…P-C4 + U-CLOSE |
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
Owner bloğu bunları Run'dan önce sunar; büyük harfle `EVET` yazılmadan GO sorulmaz (K-3).

## 7. Owner talimatı (iki cihaz)

1. **Ofis PC:** bağımsız bir PowerShell penceresi (uygulamanın Terminal paneli DEĞİL). Önce Preflight, isterseniz QrTest.
2. **Telefon:** kendi tarayıcısı, **Wi-Fi kapalı, mobil veri açık**, mümkünse gizli sekme. Konsoldaki QR'ı okutun ya da adresi yazın.
3. Konsolda görünen **e-posta ve parolayı konsoldaki haliyle** girin. Belgede örnek değer yoktur; başka bir yerden kopyalamayın.
4. Giriş sonrası **Dosyalarım** sayfasında yalnız konsolda yazan dosya numarasının göründüğünü kontrol edin. Parola değiştirmeyin,
   "şifremi unuttum"u kullanmayın, belge/mesaj açmayın.
5. Konsol "Giriş algılandı" dedikten sonra 120 sn içinde listeyi inceleyin; ekran temizlenince erişim kapatılır.
6. Blok sorduğunda telefonda sayfayı **yenileyin** ve beyanları doğru yanıtlayın (E/H/?). Telefonda yapılamazsa ofis tarayıcısına
   **geçmeyin**; "H" ya da "?" yanıtlayın.
7. Pencereyi kapatın. GO ref, parola ya da ekrandaki değerleri kimseye iletmeyin.

## 8. İzole doğrulama

| Test | Sonuç |
|---|---|
| `d4-selftest.js` (disposable PG 16 + `d4-fake-portal-api.js` + gerçek TLS) | **31/31** — Y1 normal (telefon girişi + liste + kapanış + telefon oturumu da 401) · Y2 telefon girişi yok · Y3 **mevcut oturum kapanmıyor** (yeni giriş 401 iken çıkış 6 + ürün bulgusu) · Y4 kapatma hatası → 6 → Recover → 0 · Y5 kapatma 500 + yeniden deneme · Y6 kapsam sızıntısı → gösterim yok · Y7 dış 503 · Y8 create-user 500 · Y9 makbuz · Y10 kanıt → 7 · Y11 gösterimsiz canlı reddi · Y12 TLS · Y12b intake GO reddi · Y13 konsolsuz koşum · S-1 sır taraması (son koşumda 53 değer, 34 dosya) · T-1…T-7 statik · P-1/P-2 canlı süreler + kapılar |
| `d4-owner-block-selftest.ps1` (owner bloğunun GERÇEK fonksiyonları, AST) | PS 5.1 **43/43** · PS 7.6 **43/43** |
| `extacc-console-selftest.ps1` (paylaşılan gösterim modülü) | **5/5** |

Negatif kontrol (mutant M-1): kapanış yalnız yeni giriş reddine bakacak şekilde bozuldu (mevcut oturum ölçümü ve ürün bulgusu
kaldırıldı) → **Y3-a ve Y3-b FAIL** (28/31; T-3 yalnız mutant dosya adından düştü). Mutant dosyası silindi.

Test dosyalarındaki GO örnekleri **2000-01-01** tarihlidir: owner bloğu repoda geçen GO değerini tüketilmiş sayar; gerçek bir D-4 GO'su ile
çakışmamaları için.

**Sınır:** `d4-fake-portal-api.js` ürünün portal mantığını kaynaktan taklit eder; ürünün kendi guard'ı, `isApproverEligible`,
hız sınırı ve tenant yaşam döngüsü burada ölçülmez — bunlar canlı koşumda ölçülür. Uçtan uca koşum gerçek konsolda (parola
gösterimiyle) ayrıca yapılmadı; gösterim modülü C-1…C-5 ile, konsolsuz ret Y13 ile ölçüldü.

## 9. Dosyalar ve sha256

Owner bloğunda pinli (koşucunun yüklediği dosyalar + QR denemesi; `h5-url-selftest-reqtree.js` ile ölçüldü, T-3) — paket digest
`B69D1CFFC13E1CD956812D5F3A832C77BF4E955AC517F55F87D948B176CEBA8F`:

| dosya (`project/docs/governance/` altında) | sha256 |
|---|---|
| `client-extacc-portal-d4-r01/scripts/d4-portal-live-run.js` | `5153630F5FB122EB89F9FE8274594B59843D99342A7D5AA5B1EAC76283221069` |
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
| `scripts/d4-owner-live-block.ps1` | `E4BBDEB7BA8BB0E743FA279C3D905C0A6AA910F1B69257015C6EA251E762187B` |
| `scripts/d4-selftest.js` | `25DEDFD0A0A20C83F030AC547DB13078D7F4B43ECE5357D68356B3AEAC33CE71` |
| `scripts/d4-owner-block-selftest.ps1` | `08C4E12347E0BE9BED4F09230170A243D22B490542004A2318F0BA9DE1FDE5FE` |
| `scripts/d4-fake-portal-api.js` | `6D38DD50533CEF61DD74C35CA3E178D52E56A2081B51F8524FF7CEA21242F74B` |

Paylaşılan dosyalarda **değişiklik yok** (EXTACC, H5, I3/I12/I13, AH): yalnız yeniden kullanıldı ve pinlendi.

## 10. Saat notu (sonradan yapılan işlem)

EXTACC paketi §12.4'te kayıtlıdır. Bu paketin canlı koşumunda zaman damgaları koşum anındaki PC saatiyle yazılır; telefon saatiyle
karşılaştırmadan süre çıkarılmaz.
