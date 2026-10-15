# CLIENT DD (K) — ayrı sınama bürosu kurulum / kapanış paketi (R01) · 2026-10-15

> **HAZIRLIK.** Owner kararı Ek 72 madde 2 (2026-10-15): "CLIENT, ayrı sınama bürosu için kurulum bloğunu, gerekli hedefli testlerini ve
> PR'ını hazırlasın … Gerçek kişi kimliği kullanılmasın. Hazırlık yetkisi canlı veritabanına yazım veya PR birleştirme yetkisi değildir."
> Bu paket **canlıda koşulmadı**. Canlı koşum yayın penceresinde, ayrı owner GO'suyla, runbook §9'un S-0 / S-9 adımlarıdır (runbook OFFICE'tedir).
> Temel: DD dar planı seçenek K (CLIENT yerel kaydı; 2026-10-14). D-4 koşucusu yeniden KULLANILMAZ; D-4 / D-6 / D-7 dosyaları DEĞİŞMEZ.

## 1. Ne yapar

Teslim web sürümünde üç kontrolü (personel girişi · portal girişi · kapatılmış oturum) ürün ekranlarından ölçebilmek için, gerçek bürolara
dokunmayan **ayrı bir sınama bürosu** kurar ve sonunda sentetik personeli kapatır. Kurulumdan sonraki her adım ürün ekranıdır (runbook §9).

| Kip | Yazım | Okuma |
|---|---|---|
| `Preflight` | YOK | kapılar (§3) |
| `Kur` | tek işlemde DÖRT satır (§4 a) | yalnız kendi yazdığı satırlar (geri okuma) |
| `Kapat` | sentetik kullanıcı: `isActive = false`, `tokenVersion` +1 (kullanıcı zaten pasifse yazma YOK, çıkış 0) | kendi satırları; o büronun portal hesabı ve müvekkil durumu (bilgi) |

E-posta / SMS gönderimi YOK. Gerçek kişi verisi, TCKN, VKN, kimlik numarası YOK. Öteki bürolarda sayım ya da yazım YOK.

## 2. Dosyalar

| Dosya | Görev |
|---|---|
| `scripts/ddk-owner-block.ps1` | owner bloğu: kapılar, bağımsız pencere teyidi, canlı yazım onayı, GO ref (tek kullanım), koşucu çağrısı, ekran temizliği, blok kaydı (`owner-block.json`, `goref-consumed.json`), kanıt manifesti. Parolayı EKRANA BASMAZ |
| `scripts/ddk-setup-run.js` | koşucu: `kur` / `kapat`; veritabanı kimlik kapısı; çakışma kapısı; makbuz kimlik bağı; geri okuma; sır taraması; giriş bilgisinin YALNIZ yerel konsola (CONOUT$) çizimi |
| `scripts/ddk-selftest.js` | koşucu öz-testi (tek kullanımlık veritabanı `127.0.0.1:5451/ddk_test`; gösterim kapalı) |
| `scripts/ddk-owner-block-selftest.ps1` | blok öz-testi (sahte dosyalar; canlıya dokunmaz; gerçek koşucu çağrılmaz — Kur akışı sahte koşucuyla) |

Bağımlı (DEĞİŞMEDİ, pinli): `client-acceptance-harness-r01/scripts/ah-lib.js` (slug kuralı, Prisma yükleyici) ·
`client-live-acceptance-i12-r01/scripts/i12-live-identity.js` (makbuz kimlik bağı) · `client-acceptance-runners-i3-r01/scripts/i3-lib.js`
(i12'nin bağımlılığı) · `client-extacc-intake-chain-r01/scripts/extacc-display.js` (CONOUT$ gösterimi; D-4 / D-7 ile aynı dosya) ·
`client-extacc-intake-chain-r01/scripts/vendor/qrcode-generator-1.4.4/qrcode.js` (gösterim dosyasının yüklediği; QR çizilmez).

## 3. Kapılar

| Katman | Kapı | Reddinde |
|---|---|---|
| blok | `NODE_OPTIONS` / `NODE_TLS_REJECT_UNAUTHORIZED` / `NODE_EXTRA_CA_CERTS` tanımsız · `main` = `origin/main` ve takipli kirli dosya yok · paket pinleri + paket özeti · canlı `.env` pini (D-6 / D-7 ile aynı pin) · başlatıcı günlüğünde canlı API veritabanı kimliği `127.0.0.1:5432/hukuk_db` · `.env` `DATABASE_URL` kimliği aynı · başka kabul süreci yok · `node` bulunur | blok çıkışı 90, koşucu ÇAĞRILMAZ |
| blok (Kur) | konsol host'u + yönlendirilmemiş çıktı · PowerShell transkripsiyon ilkesi (GPO kayıt anahtarları; Windows PowerShell ve PowerShell 7) KAPALI · "bağımsız pencere, kayıt tutan oturum DEĞİL" teyidi `E` | blok çıkışı 90, koşucu ÇAĞRILMAZ |
| blok (Kapat) | `-ReceiptFile` yalnız `<kanıt kökü>\client-ddk-kur-<runId>-<UTC>\ddk-setup-receipt.json` biçiminde ve dizin adındaki `runId` makbuzdakiyle aynı | blok çıkışı 90 |
| blok (Kur / Kapat) | canlı yazım listesi gösterilir ve `EVET` yazılır · GO ref biçimi `OWNER-GO-CLIENT-DDK-YYYYMMDD-RNN` (büyük / küçük harf duyarlı) · tek kullanım: defterde, önceki tüketim kayıtlarında ve depoda (`git grep -F`) geçmiyor; defterde ve kanıtta YALNIZ özeti | blok çıkışı 90 |
| koşucu (bağlanmadan ÖNCE) | `DDK_EXPECT_DB` = bağlı veritabanı adı · adreste bağlantı hedefini değiştirebilecek sorgu parametresi (izin listesi: `schema`, `connection_limit`, `pool_timeout`, `connect_timeout`, `socket_timeout`, `statement_cache_size`, `application_name`, `pgbouncer`, `sslmode`; dışındaki her parametre — ör. `host`, `port`, `options` — RET) ya da `#` YOK · bağlı kimlik İZİNLİ iki kimlikten biri: canlı `127.0.0.1:5432/hukuk_db` (o zaman `DDK_LIVE_CONFIRM=1` + GO ref biçimi ŞART) ya da sınama `127.0.0.1:5451/ddk_test` · Kur: `runId` 8 hex, parola ≥ 12 karakter, slug `ah-<runId>` (ortak düzeneğin önek ve yasak slug kuralı), gösterim `conout` (canlıda ZORUNLU) ve yerel konsol açılabiliyor | çıkış 2 / 3 / 4, veritabanına bağlanılmaz |
| koşucu (Kur, yazmadan önce) | `ah-<runId>` slug'ı veritabanında varsa (slug benzersiz: eşzamanlı ikinci işlem geri alınır, çıkış 1, satır YOK — kaynak okuması) | çıkış 4, yazma YOK |
| koşucu (Kapat, yazmadan önce) | makbuz `runId` 8 hex ve personel e-postası `runId`'den türeyen değer · makbuz kimlik bağı (`i12-live-identity`: slug runId'den türemiş, büro var, id ↔ slug aynı, `ah-` öneki) · büro adı `DD-K Sinama Burosu <runId>` · kullanıcı o büroya ait ve e-postası makbuzla aynı · büroda tam 1 kullanıcı | çıkış 4, yazma YOK |

## 4. Kayıt listeleri

### (a) `Kur`'un yazdığı DÖRT satır (tek işlem)

| # | Tablo | Alan = değer | Değer kaynağı |
|---|---|---|---|
| 1 | `Tenant` | `name` = `DD-K Sinama Burosu <runId>` · `slug` = `ah-<runId>` · `lifecycle` = `ACTIVE` · `plan` = `FREE` · `accountType` = `PROFESSIONAL` (son üçü şema varsayılanı) | blok `runId`'yi rastgele üretir (8 hex) |
| 2 | `User` | `tenantId` = (1) · `email` = `ddk-personel-<runId>@ddk-sinama.invalid` · `name` = `DDK` · `surname` = `Sinama <runId>` · `role` = `USER` · `isActive` = `true` · `passwordHash` = bcrypt(10) · `tokenVersion` = 0 (varsayılan) | parola blokta rastgele üretilir, koşucuya ortam değişkeniyle geçer (koşum sonunda silinir); koşucu YALNIZ yerel konsola (CONOUT$) çizer; dosyaya / kayda / iletiye YAZILMAZ |
| 3 | `Lawyer` | `tenantId` = (1) · `name` = `DDK` · `surname` = `Sinama <runId>` · `lawyerRank` = `PARTNER` · `userId` = (2) · `role` = `EMPLOYEE` · `canBeResponsible` = `true` (son ikisi şema varsayılanı) · kimlik / vergi / baro alanları BOŞ | sabit |
| 4 | `Client` | `tenantId` = (1) · `type` = `PERSON` · `firstName` = `DDK` · `lastName` = `Sinama Muvekkil <runId>` · `displayName` = `name` = `DDK Sinama Muvekkil <runId>` · `email` = `ddk-muvekkil-<runId>@ddk-sinama.invalid` · `tckn` / `vkn` / `identityNo` BOŞ · `hasPortalAccess` = `false` | sabit |

Yazılmayanlar: `Office`, `StaffMember`, `PermissionGrant`, `ClientContact`, `Task`, `Case`, `Debtor`, `AuditLog` (doğrudan yazım; ürün denetim
kaydı oluşmaz — sınır). Yerel kanıt dizini: makbuz (büro / kullanıcı / avukat / müvekkil kimlikleri, slug, e-posta, zaman), koşucu kanıtı ve
günlüğü, `owner-block.json` (main, paket özeti, `.env` pini, node yolu), `goref-consumed.json` (GO özeti) ve manifest — parola, parola özeti,
GO literali ve veritabanı adresi YOK. GO defterine (kanıt kökünde) bir satır: zaman · GO özeti · kip + `runId`.

### (b) Ürün işlemlerinin ek yazdıkları (runbook §9.5'in kaynak okuması; bu pakette ölçülmedi)

| Adım | Tablo / alan | Kaynak |
|---|---|---|
| DD-1 (b) sentetik personel girişi | YAZIM YOK (süreç içi giriş hız sayacı +1) | runbook §9.5 DD-1 |
| DD-3 portal hesabı açma | `ClientPortalUser` +1 (e-posta, parola özeti, etkin) · `Client.hasPortalAccess = true`, `portalUserId` · `AuditLog` +1 (`CLIENT_PORTAL_ACCESS_ENABLE`) · e-posta gönderilmez | runbook §9.5 DD-3 (`portal.service.ts`:399-430) |
| DD-4 portal girişi | `ClientPortalUser.lastLoginAt`, `loginCount` +1 · süreç içi portal giriş sayacı +1 | §9.5 DD-4 |
| DD-5 / DD-6 sayfalar | Mesajlar açılışı okundu işaretler: sentetik müvekkilde mesaj yok → 0 satır | §9.5 DD-5 / DD-6 |
| DD-7 portal kapatma | `ClientPortalUser.isActive = false`, `tokenVersion` +1, sıfırlama alanları boş · `Client.hasPortalAccess = false` · `AuditLog` +1 (`CLIENT_PORTAL_ACCESS_DISABLE`) | §9.5 DD-7 |
| DD-8 yönlendirme · DD-9 reddedilen giriş | YAZIM YOK | §9.5 |
| DD-9a müvekkil pasifleştirme | `Client.isActive = false` · `AuditLog` +1 (`CLIENT_DELETE`) | §9.5 DD-9a |
| hepsi | API uygulama günlüğünde satırlar (portal hesabı / giriş: maskeli adres) | §9.5 |

### (c) `Kapat` sonrası kalan kayıtlar (silme YOK)

| Kayıt | Durum |
|---|---|
| `Tenant` `ah-<runId>` | kalır; `ACTIVE`; etkin kullanıcısı YOK (yaşam döngüsü değiştirilmez — D-7 ile aynı) |
| `User` | kalır; `isActive = false`, `tokenVersion` = kurulumdaki + 1 |
| `Lawyer` | kalır; etkin, PARTNER, kullanıcıya bağlı (bağlı kullanıcı pasif) |
| `Client` | kalır; DD-9a yapıldıysa pasif, yapılmadıysa etkin (kapanış raporuna yazılır) |
| `ClientPortalUser` | kalır; DD-7 yapıldıysa pasif + sürüm artmış; YAPILMADIYSA etkin → owner'a hemen (§7) |
| `AuditLog` | yapılan adım kadar, en çok 3 satır kalır (DD-3 portal açma, DD-7 portal kapatma, DD-9a pasifleştirme) |
| `ClientPortalUser.loginCount` / `lastLoginAt` | kalır |
| API uygulama günlüğü satırları | kalır |
| yerel kanıt dizinleri (Kur + `kapat-<UTC>`) + GO defteri satırları (özet) | kalır |

## 5. Komut biçimi (runbook §9 S-0 / S-9 girdisi)

Owner'ın bağımsız PowerShell penceresinde (uygulama Terminal paneli ya da kayıt tutan oturum DEĞİL), depo kökünde:

```powershell
# S-0 (Kur)
& '.\project\docs\governance\client-dd-k-sinama-burosu-r01\scripts\ddk-owner-block.ps1' -Mode Kur
# S-9 (Kapat) — <makbuz yolu> Kur'un ekranda gösterdiği "Makbuz" satırıdır
& '.\project\docs\governance\client-dd-k-sinama-burosu-r01\scripts\ddk-owner-block.ps1' -Mode Kapat -ReceiptFile '<makbuz yolu>'
```

Beklenen satırlar (Kur, başarı): `kapılar TAMAM · paket <8> · .env pini tutuyor · main <8>` → bağımsız pencere sorusu (`E`) → canlı yazım
listesi + `Onaylıyorsanız EVET yazın` → GO ref sorusu → koşucu konsola `KURULUM DOĞRULANDI — sentetik personel giriş bilgisi (YALNIZ bu pencerede;
bir yere yazmayın):` ardından `Kurum`, `E-posta`, `Parola` satırlarını çizer → `Giriş bilgisini not aldıysanız Enter'a basın (ekran temizlenecek)`
→ ekran + kaydırma arabelleği temizlenir → `KURULUM DOĞRULANDI — giriş bilgisi ekrandan temizlendi.` + `Kurum`, `Makbuz` satırları + `Bu pencereyi
ŞİMDİ kapatın …` → `blok çıkışı 0`. Kapat, başarı: `KAPANIŞ DOĞRULANDI — sentetik personel pasif, tokenVersion +1 (ya da zaten pasifti; günlükte
NOT satırı)` → `blok çıkışı 0`.

| Blok çıkışı | Anlamı | Satır yazıldı mı |
|---|---|---|
| 0 | tamam | Kur: dört satır · Kapat: kullanıcı güncellendi (zaten pasifse hayır) |
| 90 | blok kapısında DUR (koşucu çağrılmadı) | HAYIR |
| 91 | node başlatılamadı | HAYIR |
| 2 / 3 / 4 | koşucu kapısı reddi | HAYIR |
| 6 | Kur yazdı ama geri okuma tutmadı → DUR; owner'a (parola gösterilmez) | EVET (kimlikler kanıtta) |
| 7 | kanıt ya da makbuz yazılamadı (parola gösterilmez) | Kur'da EVET olabilir — makbuz yoksa `Kapat` bu paketle koşamaz (§7) |
| 8 | Kur tamam, giriş bilgisi konsola çizilemedi (koşucu kanıtında `exitCode` 0 kalır; günlükte satır) | EVET → `Kapat` ile kapatılır |
| 5 | Kapat doğrulanamadı → sentetik personel etkin kalmış olabilir; owner'a | belirsiz — kanıta bakılır |
| 1 | beklenmeyen hata; Kur'da işlem tamamlandıktan SONRA olduysa günlükte `NOT: dört satır YAZILDI` | `NOT` satırı varsa EVET |

Koşucu çalıştıktan sonra blokta hata olursa (ör. manifest yazılamadı) blok koşucunun çıkış kodunu döndürür ve `koşucu ÇALIŞTI` satırını basar
(90 DEĞİL).

## 6. Süre

S-0 ≈ 1 – 2 dk (kapılar + onay + GO + kurulum); S-9 ≈ 1 dk. Planın toplam tahmini (≈ 11 – 17 dk) değişmez. Ölçülmedi.

## 7. Geri dönüş eşlemesi (runbook §9.7 girdisi)

| Gözlem | Geri dönüş | Yapılacak |
|---|---|---|
| S-0 blok çıkışı 0 değil | HAYIR — hazırlık | kontrol 2 / 3 ÖLÇÜLEMEDİ → owner kararı; çıkış 6 / 7 / 8 / 1'de kanıt incelenir |
| S-0 çıkış 8 (satırlar yazıldı, parola gösterilemedi) | HAYIR | S-9 `Kapat` (makbuz var) → kontrol 2 / 3 ÖLÇÜLEMEDİ → owner kararı |
| S-0 çıkış 7 makbuzsuz ya da çıkış 1 + `NOT: dört satır YAZILDI` | HAYIR | sentetik personel etkin, parolası kimsece bilinmiyor; bu paketle kapatma yolu YOK → **owner kararı** (ürün yolu: avukat pasifleştirme — ölçülmedi, §8) |
| DD-1 (b) sentetik personel girişi tutmuyor, owner'ın kendi hesabıyla (a) tutuyor | TEK BAŞINA HAYIR | kontrol 2 / 3 ÖLÇÜLEMEDİ → owner kararı |
| DD-3 "Portal Erişimini Aç" 403 | HAYIR — kurulumun niteliği | kontrol 2 / 3 ÖLÇÜLEMEDİ → owner kararı |
| S-9 blok çıkışı 0 değil | HAYIR tek başına | kanıt incelenir; yeniden `Kapat` AYRI owner onayı ve yeni GO ile (kullanıcı zaten pasifse yazma YOK) |
| DD-7 yapılamadan geri dönüş yapıldı | — | sentetik portal hesabı eski sürümde ETKİNDİR → Portal sekmesinden kapatılır (yol eski sürümde de var), sonra S-9 |

Öteki satırlar runbook §9.7 ile aynıdır (DD-1 (a), DD-4 – DD-9).

## 8. Planın açık noktaları (DD dar planı §10) — durum

| Nokta | Durum |
|---|---|
| Personel kapanışının ürün yolu (avukat pasifleştirme → bağlı kullanıcı) | **ölçülmedi**; paket kapanışı blokla yapar |
| `Office` satırı olmamasının personel ekranlarına etkisi | **ölçülmedi** (öz-testler API'yi ve ekranı çağırmaz) |
| Zamanlanmış işlerin sentetik büroya etkisi | **ölçülmedi** |
| A9 yalıtılmış portal tarayıcı doğrulamasının kapsamı | **ölçülmedi** (bu pakette okunmadı) |

## 9. Sınırlar ve açık noktalar

1. Canlı yollar bugünkü canlı köke göredir (`.env`, `node_modules` içindeki Prisma / bcrypt yolları, başlatıcı günlüğü). A yayını canlı kökü ya da
   `.env`'i değiştirirse blok kapıda DURUR; yol ve pin güncellemesi ayrı iştir.
2. Kurulum doğrudan veritabanı yazımıdır: ürün denetim kaydı ve ürün doğrulamaları devreye girmez (D-4 / D-6 / D-7 ile aynı sınıf).
3. Bloğun canlı yolu (gerçek `.env`, canlı veritabanı, owner penceresinde CONOUT$ gösterimi) öz-testlerde koşulmaz; kapı mantığı ve koşucu
   davranışı ayrı ayrı sınanır. CONOUT$ gösterim dosyası D-4 / D-7 ile aynıdır (kendi konsol öz-testi o paketlerde); bu pakette yalnız "konsol
   yoksa bağlanmadan dur" ölçüldü (T11).
4. Elle başlatılmış PowerShell transkripti koddan ölçülemez: blok yalnız transkripsiyon ilkesini (GPO) okur ve owner'dan bağımsız pencere
   teyidi ister. CONOUT$ tek başına "kaydedilmedi" kanıtı değildir (konsolu barındıran uygulama ekranı saklayabilir) — pencere koşum sonunda
   kapatılır.
5. Kur'da çıkış 7 (makbuzsuz) ya da işlem sonrası çıkış 1 durumunda bu paketle kapatma yolu yoktur (§5, §7): **owner kararı**.
6. Ölçülmedi: canlı `.env` `DATABASE_URL`'inin sorgu parametreleri (canlı `.env` okunmadı; izin listesi dışı parametre varsa koşucu çıkış 2 ile
   durur, yazma YOK) · ekran temizliğinin (`[Console]::Clear` + `ESC[3J`) Windows PowerShell 5.1 / Windows Terminal'de kaydırma arabelleğini
   gerçekten sildiği (bu yüzden pencere koşum sonunda kapatılır).

## 10. Doğrulama (bu PR)

Bu PR'daki baytlarla, yerelde (canlı veritabanına / canlı `.env`'e bağlantı YOK):

| Ölçüm | Sonuç |
|---|---|
| koşucu öz-testi (`ddk-selftest.js`; tek kullanımlık Postgres 16, `127.0.0.1:5451/ddk_test`, şema bu ağaçtan) | **26 / 26 PASS** — G1 – G13 kapı birim testleri, U1 sır taraması, S1 kaynak sırası, T1 – T11 veritabanı senaryoları |
| blok öz-testi (`ddk-owner-block-selftest.ps1`) | **20 / 20 PASS** PowerShell 7'de ve Windows PowerShell 5.1'de |
| dar mutasyon turu (her mutant tek değişiklik; düşen test kimliği beklenenle karşılaştırıldı; toplam test sayısı tabanla aynı; kaynak her mutanttan sonra özgün baytlarına döndü) | **24 / 24 YAKALANDI** — koşucu 12 (çakışma, `tokenVersion` artışı, makbuz kimlik bağı, canlı onay, makbuza parola, izinli kimlik, adres sorgu parametresi, canlıda gösterimsiz Kur, ikinci Kapat, büroda tek kullanıcı, makbuz e-postası, konsolsuz durma) · blok 12 (`.env` pini, `EVET`, GO defteri, transkripsiyon ilkesi, makbuz `runId` bağı, koşucu sonrası çıkış kodu, `conout`, GO büyük / küçük harf, depoda GO, bağımsız pencere teyidi, PowerShell 7 ilke anahtarları, çıkış 8 ekran temizliği) |

İki bağımsız salt okuma incelemesi yapıldı: ilki (1 MAJOR · 9 MINOR) ve düzeltmelerin dar yeniden incelemesi (0 MAJOR · 2 MINOR: PowerShell 7
transkripsiyon anahtarları, çıkış 8'de ekran temizliği). Bulguların hepsi bu PR'da düzeltildi (giriş bilgisi CONOUT$ ile
koşucudan, transkripsiyon ilkesi kapısı + bağımsız pencere teyidi + ekran temizliği, koşucu sonrası çıkış kodu, blok kaydı + GO tüketim kaydı,
GO büyük / küçük harf + depo + tüketim kaydı denetimi, makbuz yolu bağı, Kapat'ta türetilmiş e-posta + büro adı + o büroyla sınırlı okuma, adres
sorgu parametresi reddi, `displayName`, ikinci Kapat'ta yazma yok, ek testler, belge düzeltmeleri). Ölçüm sırasında görülen tuzak: bu makinenin
kültürü tr-TR olduğundan PowerShell'in büyük / küçük harfe duyarsız eşleşmesi `I` ile `i`yi eşlemez — B13 yalnız son eki küçük yazar; makbuz yolu
eşleşmesi `CultureInvariant`.

Tek kullanımlık veritabanı kapsayıcısı (`ddk-` önekli; `hukuk-` önekli kapsayıcılara dokunulmadı) koşum sonunda durduruldu ve kaldırıldı.
Canlı veritabanı kapsayıcısının başlangıç zamanı koşumdan önce ve sonra aynı.
