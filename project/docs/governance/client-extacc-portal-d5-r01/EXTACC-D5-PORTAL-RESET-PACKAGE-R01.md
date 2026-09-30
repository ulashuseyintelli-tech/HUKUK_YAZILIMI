# EXTACC D-5 — PORTAL PAROLA SIFIRLAMA CANLI KABUL PAKETİ (R01)

> **DURUM: HAZIR — CANLIDA KOŞULMADI.** Gerçek e-posta gönderim denemesi, canlı Run/Recover ve yayın bu paketle yetkilendirilmez;
> alıcı adresi ve gönderim yetkisi verilmedi; **bu iş kapsamında canlı talep/gönderim KOŞULMADI**. Run modunda koşucu yalnız owner GO
> ile ve yalnız bloğun kurduğu `D5_API_BASE`/`D5_EXPECT_BASE_URL` uçlarına istek yapar (create-user/login/disable-user + `.invalid`
> adresle bir `forgot-password`, T-1); e-postayı koşucu/blok göndermez, ürün gönderim dener (§7).
> **ÖN KOŞUL:** canlı API dist'i **R27** (`E28A6863…5134`; D5-SEC-R01/R02/R03). Canlı R26 iken owner bloğu Preflight/Run **DUR** verir
> (R26'da kapatma sıfırlama token'ını temizlemez → kapanış doğrulanamaz).
> **Kanıt doğruluğu revizyonu (İŞ 2, 2026-09-29):** P5-SINGLE-USE → **P5-SINGLE-USE-OBS** (yalnız gözlem; owner beyanıyla birleşik karar);
> P5-TOKEN-ISSUED "e-posta gönderilmiştir" DEMEZ (`emailDeliveryMeasured=false`); kapanış girişi yalnız **bilinen geçerli** parolayla;
> S0 reddi ayrı satırlarda (P5-C4L-S0/P5-C4D-S0).
> **İnceleme düzeltmeleri (R02, aynı gün):** başlık yorumlarındaki "ürün gönderir" → "gönderim dener, kabul/teslim ölçülmez" (T-8 ve C-soru
> artık yorumlar dahil tarar); Preflight açıklaması "node çağrılmaz" yerine "koşucu çağrılmaz; yalnız `node --version`"; owner'a
> gösterilen kapanış metni mevcut-oturum reddini yalnız kanıtta gerekli sayıldıysa iddia eder (`portalClose.sessionRequired`/`s0Required`;
> ikisi de yoksa "ÖLÇÜLMEDİ"; O-4..O-8); öz-test çıktıları test edilen dosyanın sha256'sını ve koşum başlangıcını yazar; geçici dizin
> yolundaki kullanıcı adı maskelenir.
> **QR ve origin düzeltmesi (R03, 2026-09-30):** QrTest modu intake zincirinin QR betiğini `/portal/forgot-password` ile çağırıyordu; o
> betik yalnız `/portal/login` kabul ettiğinden QrTest her koşumda çıkış 4 ile duruyordu (QR hiç gösterilemiyordu). Yeni
> `scripts/d5-qr-test.js` bu yolu GERÇEKTEN destekler ve başka her yolu reddeder. Owner bloğundan public alan adı ve yerel kullanıcı yolu
> literalleri kaldırıldı: dış origin canlı `.env`'den okunur (biçim kapısı), Run/QrTest'te owner'ın konsola yazdığı adresle birebir
> doğrulanır; kanıt kökü `$env:USERPROFILE`'a görelidir. Koşucu (`d5-portal-reset-live-run.js`) DEĞİŞMEDİ (sha aynı).
> **İnceleme düzeltmeleri (R03-D, 2026-09-30):** yabancı kabul süreci kapısı `d6-portal-` / `d7-portal-` / `d8-staff-` ile
> GENİŞLETİLDİ (eski alternatiflerin hiçbiri düşmedi; öz-test S-8); blok öz-testinin ham çıktısı yerel kullanıcı adından arındırılır
> (M-1); S-5 ölçütünün adı ölçtüğü kapsama daraltıldı; "Preflight hiçbir şey yazmaz" ifadesi ölçülen sınırla değiştirildi. Koşucu,
> `d5-qr-test.js` ve pinli 9 dosya DEĞİŞMEDİ; paket digest aynı. **QrTest / Preflight / Run canlıda KOŞULMADI.**

## 1. Ne ölçer (`client-external-access-r01` §7 D-5) ve ne yapmaz

Uçtan uca: owner telefonundan "şifremi unuttum" talebi → ürün **tek gerçek e-posta göndermeyi dener** (bağlantı `PUBLIC_PORTAL_BASE_URL`
ile, token fragment'ta; **SMTP kabulü ve posta kutusuna teslim ölçülmez — yalnız owner beyanı "e-posta geldi mi"**) → owner
e-postadaki bağlantıyı telefonda açar, konsolda gösterilen yeni parolayı girer → bir kez giriş yapar → koşucu DB/HTTP ile ölçer →
kapanış. D-4 R03'ün kapanış kuralları aynen (DB ve HTTP ayrı; sürüm verilme sürümüyle karşılaştırılır; belirsiz oluşturma bekler;
Recover ölçülemeyeni 0 yapmaz) + **P5-C-TOKEN** (kapanıştan sonra kullanılabilir token kalmaz) + **bilinen geçerli parola** kuralı
(kapanış girişi için aday parolalar — sıfırlama tamamlandıysa yeni parola, hesap açıldıysa ilk parola — mevcut hash ile `bcrypt.compare`
ile doğrulanır; eşleşen yoksa P5-C3 ÖLÇÜLEMEYEN: yanlış parolayla alınan 401 kapanış kanıtı değildir).
Koşucu **e-posta göndermez** (talep telefondan; ürün gönderim dener), `reset-password`/`change-password`/belge/mesaj uçlarını çağırmaz;
alıcı adresini, parolaları, token'ları ve GO'yu hiçbir kanıta yazmaz. Gönderimsiz kontrol için `.invalid` adresle bir
`forgot-password` çağrısı yapar (P5-UNKNOWN; e-posta çıkmaz).

**Makine ölçümü ≠ owner beyanı.** Tek kullanım ve e-posta teslimi makine tarafından KANITLANMAZ; koşucu kanıtı (`d5-evidence.json`)
ve owner beyanı (`owner-declaration.json`) ayrı dosyalardır, owner bloğu ikisini açık kuralla `d5-combined-verdict.json` içinde
birleştirir (§3).

## 2. Ölçütler

| ID | Ölçüt | Kaynak |
|---|---|---|
| P5-GATE | alıcı adresi HİÇBİR portal hesabında yok (aktif/pasif, tüm tenantlar; büyük/küçük harf duyarsız) — aksi hâlde yazmadan çıkış 4 | DB |
| P5-00 / P5-01 / P5-02 | elev1 ADMIN değil · alıcı adresiyle sentetik müvekkile portal hesabı (gönderim yok) · DB aktif+erişim+adres+token yok | D-4 kalıbı |
| P5-03L / P5-04D | koşucu S0 (ilk parola) yerel 201 · S0 ile dış liste 200 yalnız `I3-<runId>` | HTTP |
| P5-DISP1 | 1. konsol: QR `…/portal/forgot-password` + adres (yalnız CONOUT$) | konsol |
| P5-TOKEN-ISSUED | talep sonrası DB'de token özeti + süre ≈ 1 saat. **Token üretimi ≠ SMTP kabulü ≠ posta kutusuna teslim**: ürün gönderim dener; kabul/teslim ölçülmez, yalnız owner beyanı (e-posta geldi mi). Kanıt: `emailDeliveryMeasured=false` | DB |
| P5-UNKNOWN | `.invalid` adrese talep: aynı başarı cevabı, bu hesabın token durumu değişmedi, audit sayısı ayrı raporlandı | HTTP+DB |
| P5-DISP2 | 2. konsol: yeni parola (yalnız CONOUT$) | konsol |
| P5-CONSUMED | parola hash'i değişti **ve** token NULL **ve** tokenVersion tam +1 | DB |
| P5-WAIT | koşucu dışından yeni parolayla giriş (loginCount, talep öncesi tabana göre; cihaz/ağ owner beyanı) | DB |
| P5-S1-OPEN / P5-S1-EXT / P5-S0 / P5-OLDPW | S1 yerel 201 · S1 dış 200 · S0 dış 401 · eski parola dış 401 | HTTP |
| **P5-SINGLE-USE-OBS** | **yalnız gözlem**: gözlem aralığında (120 sn) parola hash'i/sürüm/token değişmedi. **İkinci denemenin yapıldığını/reddedildiğini KANITLAMAZ.** Canlı tek-kullanım kabulü owner beyanı (H/A/S/Y) ile birleşik karara bağlıdır (§3) | DB |
| P5-C1 · P5-C2 · P5-C-TOKEN · P5-C2V | yetkili uçla kapatma · DB pasif+erişim kapalı · token NULL · sürüm S1'in verildiği sürümden büyük | DB+HTTP |
| P5-C3L / P5-C3D | kapanış sonrası giriş **bilinen geçerli parolayla** yerel/dış 401 (aday hash ile doğrulanır; bilinmiyorsa ÖLÇÜLEMEYEN) | HTTP |
| P5-C4L / P5-C4D | S1 (sıfırlama sonrası) oturumu korumalı uçta yerel/dış 401 — S1 yoksa ÖLÇÜLEMEYEN | HTTP |
| **P5-C4L-S0 / P5-C4D-S0** | S0 (sıfırlama öncesi) oturumu mevcutsa korumalı uçta yerel/dış 401 — S1 yoksa mevcut-oturum reddi bu satırlarla sağlanır (gerekli) | HTTP |
| P5-C5 | HTTP ölçümlerinden sonra DB hâlâ kapalı | DB |
| U-CLOSE / U-ISO / P5-D9 | personel/dosya kapanışı · izolasyon · birleşik | DB |
| P5-SCRUB (owner kararı) | alıcı adresi pasif sentetik hesapta `.invalid` ile ezildi | DB |

Çıkış: 0 PASS · 2 FAIL · 3 ÖLÇÜLEMEYEN · 1 DURDU · 4 KİMLİK/HEDEF/ADRES REDDİ · 5 PERSONEL/DOSYA · 6 PORTAL KAPANIŞI DOĞRULANMADI · 7 KANIT YAZILAMADI (öncelik 6 > 5 > 7 > 1 > 2 > 3 > 0).
Bir 200 gören S0/S1 satırı ÜRÜN BULGUSU'dur (PASS sayılmaz; Recover düzeltmez).

## 3. Owner bloğu (`scripts/d5-owner-live-block.ps1`) — modlar, sıra, birleşik karar

Preflight (salt okuma; main senkron, paket pinleri, **R27 dist pini**, `.env` sha, `PUBLIC_PORTAL_BASE_URL` canlı `.env`'den okunur ve
**biçim kapısından** geçer — `https://<alan adı>`; yol/port/sorgu/userinfo/IP/localhost yok —, `EMAIL_PROVIDER = smtp`, 8080 tek
dinleyici, yabancı kabul süreci yok (yalnız `node.exe`; komut satırı deseni R03-D'de `d6-portal-` / `d7-portal-` / `d8-staff-` ile
genişletildi — göreli yolla başlatılan D-6/D-7/D-8 koşucuları da yakalanır), DB kimliği, dış zincir: 8081 yalnız loopback = HY-Caddy, Cloudflared Running; koşucu çağrılmaz —
yalnız `node --version` ile sürüm çözülür; **Preflight owner'a adres SORMAZ; kanıt, DB, ortam ve canlı dosya yazmaz** — kapılardaki `git fetch` yerel repodaki uzak izleme
ref'lerini günceller, iş verisi değildir) · **QrTest** (canlı veri yok, HTTP
isteği yok): konsol → **R05 adres teyidi** → `d5-qr-test.js` (çıktısı geçici dizindeki `extacc-d5-qrtest.log` dosyasına yönlendirilir; adres içermez) → telefon okuması sorusu · **Run**: konsol → bağımsız pencere teyidi →
**R05 adres teyidi** → canlı veri işleme "EVET" → alıcı adresi (iki kez, yalnız konsol) → tek gönderim **denemesi** onayı "GÖNDER" →
ezme kararı E/H → GO (yerel) → defter (sha256) → koşum → ekran temizliği → owner beyanı (9 soru, ayrı dosya) → **birleşik karar** →
manifest · **Recover**: `-ReceiptFile`; ezme kararı sorulur; GO/alıcı/adres sorulmaz.

**Dış origin kaynağı ve kontrolü (R03; D-6/D-7 bloklarıyla aynı mekanizma).** Blokta alan adı literali yoktur (`$ExpBaseUrl = $null`).
Kaynak canlı `.env` `PUBLIC_PORTAL_BASE_URL` değeridir (`.env` ayrıca sha256 ile pinlidir); `Assert-PortalBaseUrl` biçimi denetler;
Run ve QrTest'te `Confirm-PortalBaseUrlR05` owner'dan R05 kararındaki adresi konsola yazmasını ister ve `.env` değeriyle birebir
eşleşmezse (boşluk, sondaki `/` ve büyük/küçük harf farkı dışında) **DUR** — alıcı/GO sorulmaz, defter yazılmaz, node çağrılmaz.
Koşucuya ve QR betiğine giden origin owner'ın yazdığı metin değil `.env` değeridir. Adres kapılarda çözülmemişse (null) Run/QrTest/
`Set-RunEnv` sormadan durur. `owner-block.json` yalnız host'u (`baseUrlHost`) kaydeder (D-4/D-6 emsali; yerel kanıt dizini, repo dışı).
Koşucu kanıtı (`d5-evidence.json`) ise `expectedOrigin` alanında origin'in TAMAMINI taşır (D-4/D-6/D-7 koşucularıyla aynı alan; koşucu
değişmedi). "Yalnız host" ifadesi bloğun kendi yazdığı dosyalar içindir; canlı kanıt dizini repo dışıdır ve public'e maskelenmeden taşınmaz.
Biçim kapısı D-6/D-7 ile aynı kuraldır ve büyük/küçük harf duyarsızdır: `.env` büyük harfli host içerirse kapı geçer ama QR adresi
kanonik olmadığından `d5-qr-test.js` reddeder ve QrTest durur (kapalı yönde hata; öz-test A-3b).

**QR denemesi (`scripts/d5-qr-test.js`).** Girdi ortamı: `D5_QRTEST_URL`, `D5_EXPECT_BASE_URL` (blok kurar, sonra temizler). Kapılar
konsol açılmadan ÖNCE ve yazmasız koşar: TLS doğrulaması kapalıysa çıkış 1; beklenen origin kuralı koşucudaki `expectedOriginOf` ile
aynı (https, yolsuz, userinfo/sorgu/fragment yok); adres https, userinfo/sorgu/fragment YOK; origin birebir; yol **tam**
`/portal/forgot-password`; ham metin `<origin>/portal/forgot-password` ile bayt bayt aynı (URL ayrıştırıcısının sessizce düzelttiği
`\`, `./`, `../`, boş `?`/`#`, boşluk, büyük harf burada yakalanır) — aksi hâlde çıkış 4. `/portal/login`, `/portal/reset-password`,
sondaki `/`, `/PORTAL/…`, `/auth/forgot-password` ve kodlanmış varyantlar reddedilir. Gösterim `extacc-display` ile yalnız yerel
konsola; konsol yoksa çıkış 4. Ret mesajları adresi yazmaz. Intake zincirinin QR betiği (`/portal/login`) DEĞİŞTİRİLMEDİ ve D-5'te
kullanılmaz.
Alıcı adresi hiçbir dosyaya yazılmaz (`owner-block.json`: `recipientWritten=false`, `plannedRealSends=1` **bir PLANDIR**
— `plannedRealSendsNote` bunu açıkça söyler; gerçekleşen gönderim/kabul/teslim kanıtı değildir —, `scrubRequested`).
Canlı süreler bloğun içinden zorlanır (20 dk bekleme · 5 sn yoklama · 120 sn inceleme · 120 sn geç oluşma · token TTL 1 saat).

**Birleşik karar (`d5-combined-verdict.json`)** — makine ölçümü ve owner beyanı AYRI alanlarda; karar yalnız şu kuralla:

| Makine P5-SINGLE-USE-OBS | Owner `ikinciBaglantiDenemesi` | `singleUse.verdict` |
|---|---|---|
| PASS | **H** = aynı bağlantıyla formu GÖNDERDİM, hata/geçersiz gördüm | **DOĞRULANDI** |
| FAIL | H | DOĞRULANMADI |
| UNMEASURED | H | ÖLÇÜLEMEYEN |
| herhangi | **A** = bağlantıyı açtım ama göndermedim · **Y** = denemedim · **?** | ÖLÇÜLEMEYEN |
| herhangi | **S** = form yeniden kabul etti (parola değişti) | **ÜRÜN BULGUSU ADAYI** (PASS değil) |

`emailDelivery`: makine `measured=false`; owner `epostaGeldi` (E/H/?) ayrı alanda; karar "OWNER BEYANI: GELDİ/GELMEDİ (makine ölçümü yok)"
ya da ÖLÇÜLEMEYEN. Kanıt/beyan yoksa DOĞRULANDI üretilmez.

**Owner'a gösterilen kapanış metni** (`Get-ClosureStatus`, `closureShownToOwner`): P5-D9 PASS ise "DOĞRULANDI (DB + token iptali +
yeni giriş reddi + …)" — mevcut-oturum reddi kısmı kanıttaki `portalClose.sessionRequired` (S1) / `s0Required` (S0) alanlarına göre
"S1 ve S0" · "S1" · "yalnız S0; S1 alınmadı" · **"ÖLÇÜLMEDİ (S0/S1 oturumu yok)"** olarak yazılır (P5-03L başarısız olup S0 da
alınamayan koşumda P5-D9 yalnız P5-C3 ile PASS olabilir; metin ölçülmemiş oturum reddini iddia etmez). `portalClose` alanı yoksa
da "ÖLÇÜLMEDİ".

## 4. Owner adımları (telefon: Wi-Fi KAPALI, mobil veri, gizli sekme; yalnız ekranda gördüğünüz gerçek değerleri kullanın)

1. Bağımsız PowerShell penceresi (uygulama paneli DEĞİL). `-Mode Preflight` → "PREFLIGHT GEÇTİ" değilse durun.
   Preflight adres sormaz; ekranda yalnız portal host'u görünür.
2. `-Mode QrTest` → önce R05 kararındaki public portal adresini yazın (`https://…`; canlı yapılandırmayla eşleşmezse blok durur), sonra
   telefonla QR okutun; "şifremi unuttum" sayfası açılırsa **E**; formu göndermeyin. Çıkış: 0 okundu · 2 okunamadı · 3 belirsiz ·
   90 kapıda/QR gösteriminde durdu.
3. `-Mode Run`: soruları yanıtlayın (pencere teyidi, **R05 adresi**, EVET, alıcı adresi ×2, GÖNDER = tek gönderim **denemesi** onayı,
   ezme E/H, GO ref).
4. 1. konsol ekranı: QR'ı okutun, ekrandaki adresi forma **aynı** yazın, formu **bir kez** gönderin. E-postayı bekleyin (gelip gelmediği
   koşucu tarafından ölçülmez; beyanda sorulur).
5. 2. konsol ekranı göründüğünde: telefonda e-postadaki bağlantıyı açın, ekrandaki yeni parolayı girin, bir kez giriş yapın; listede
   yalnız ekrandaki dosya numarası olmalı. Sonra **aynı bağlantıyı ikinci kez açıp formu GÖNDERİN** (hata/geçersiz beklenir) — koşucu
   bunu ölçemez; beyanda **H / A / S / Y / ?** sorulur. Yalnız açıp göndermediyseniz **A**, hiç denemediyseniz **Y** yazın.
6. Koşum bitince ekran temizlenir; 9 beyan sorusunu yanıtlayın (adres/parola/bağlantı yazmayın). Blok birleşik kararı yazar ve gösterir.
   Pencereyi kapatın.
7. Çıkış 5/6 ise `-Mode Recover -ReceiptFile <kanıt dizinindeki d5-setup-receipt.json>` BİR KEZ; kabul tekrarlanmaz.

## 5. Öz-testler (canlıya dokunmadan; R03 + inceleme düzeltmeleri R03-D, 2026-09-30 — sayılar SON dosya baytlarıyla ÖLÇÜLDÜ)

| Test | Sonuç (R03-D, son baytlar) |
|---|---|
| `d5-selftest.js` (disposable DB 127.0.0.1:5447 + sahte API 8198/8456 + sahte posta kutusu + gerçek TLS): Z1 normal 0 (+Z1-g kapanış girişi yeni parola, hash ile doğrulandı; Z1-h `emailDeliveryMeasured=false`, "göndermiştir" yok, OBS metni "gözlem"); Z13 ikinci deneme yapılmayan telefon → OBS yine PASS, çıkış 0; Z2 adres kapısı 4; Z3 talep yok + ezme 3; Z4 talep var sıfırlama yok 3 (+Z4-b kapanış girişi ilk parola ile; S0 reddi PASS); Z5-a token tüketilmiyor → P5-C3 ÖLÇÜLEMEYEN → çıkış 6, Z5-b Recover 3; Z6 sürüm artmıyor 2; Z7 kapatma token silmiyor 6 + Recover 6; Z8 token yazılmadı 3; Z9 kapılar; Z10 create 500 → 6; Z11 konsolsuz 4; Z12 makbuz 1; S-1 sır sızıntısı yok (41 dosya tarandı); T-1..T-8 / P-1..P-2 statik; **R03: T-3 pin kümesi = koşucunun require ağacı (8) ∪ `d5-qr-test.js`'in require ağacı (3) = 9 dosya, iki ağaç da ölçüldü, her pin dosyanın şimdiki sha256'sına eşit, intake QR betiği pinli değil; T-5 Preflight dalı R05 adresi de sormaz; T-9 QR denemesi koşucunun 1. konsolda çizdiği yolla aynı yolu kabul eder, `/portal/login` reddedilir; T-10 blokta public host / kullanıcı yolu literali yok** | **41/41 PASS** — R03-D'de yeni blok baytlarıyla YENİDEN koşuldu (koşucu sha `924617FF…6094`, blok sha `691359FD…51B9` log içinde; node v24.18.0). Önceki R02: 39/39 (eski baytlar) |
| `d5-owner-block-selftest.ps1` (AST ile gerçek fonksiyonlar; gerçek node; N; K-1..K-8; R-1/R-8/R-9/R-10; C-*; L; O-1..O-8; V; Z; Q; S-1..S-4) + **R03**: **A-1** kapıların gerçek satırları sahte `.env` ile adresi çözer, owner'a soru sorulmaz · **A-2** `.env` değeri değişince QR adresi de değişir (blokta sabit yok) ve gerçek `d5-qr-test.js` doğrulayıcısı kabul eder · **A-3** biçim kapısı (http/yol/sondaki `/`/port/sorgu/userinfo/IP/localhost/fragment/alt çizgi/boşluk/boş, anahtar çift/yok → DUR) · **A-3b** büyük harfli host → QrTest kapalı yönde durur · **A-4..A-6** · **A-7 Preflight adres sormaz ve yazmaz** (AST: Preflight dalı + kapılardan erişilebilen 11 fonksiyonda 64 komut incelendi, soru/onay/node/yazma komutu 0; pozitif kontrol Run/QrTest'te görür) · **K-9/K-9b/K-9c** owner adresi eşleşmezse canlı veri onayından önce DUR (9 yakın-yanlış girdi); koşucuya giden origin `.env` değeri · **Q-D5** QrTest `d5-qr-test.js`'i tek kez çağırır, koşucuyu çağırmaz, adres `<.env origin>/portal/forgot-password`, ortam temizlenir · **Q-R05** (6 durum) · **Q-NEG** · **Q-NULL** · **S-5** public host / yerel kullanıcı yolu literali yok — yalnız bu ikisi ölçülür; canlı yayın dizini, servis adları, yerel portlar ve DB adı gibi diğer yerel topoloji sabitleri blokta DURUR (ölçütün kapsamı dışında; ayrı iş) (1025 metin sabiti incelendi; tek `http(s)://` adresi yerel API) · **S-6/S-7** QrTest çağrısı ve pin listesi · **X-0** beklenmeyen istisna sessizce kesmez, FAIL satırı olur. Çıktı artık her ölçütün ölçülen değerini de yazar (GÖZLEMLER) · **R03-D**: **S-8** yabancı kabul süreci deseni eski 8 alternatifi korur ve `d6-portal-` / `d7-portal-` / `d8-staff-` içerir (11 alternatif); göreli yolla başlatılan 8 koşucu örneği eşleşir, 4 uygulama süreci örneği (node --version, API, web) eşleşmez; süzgeç yalnız `node.exe`; kapı `Fail` ile durdurur · **M-1** öz-testin ve blok fonksiyonlarının tüm `Write-Host` çıktısı yazılmadan önce yerel kullanıcı adından arındırılır; `Fail` istisna mesajı (karar girdisi) değişmez | **90/90 PASS** WinPS 5.1.26100.9549 ve pwsh 7.6.6 (blok sha `691359FD…51B9` log içinde; HAM çıktıda yerel kullanıcı adı geçişi 0 — maskeden önce ölçüldü). R03 ilk tur 88/88, R02 70/70 (ikisi de eski baytlar) |
| `d5-qr-selftest.js` (**yeni**; DB/ağ yok, konsola QR çizmez): **V** doğrulama — 4 kabul, 28 yanlış yol (zorunlu 6 yol + kodlanmış/normalleşen varyantlar), 27 diğer ret (http, userinfo, sorgu, fragment, origin uyuşmazlığı, boş/bozuk adres, geçersiz beklenen origin → 4; TLS kapalı → 1); ret mesajı adresi yazmaz · **E-1** origin kuralı `expectedOriginOf` ile aynı (21 girdi) · **M** `main` sahte gösterimle: 55 ret durumunun hepsinde konsol açma 0 / QR üretimi 0; kabulde QR yalnız doğrulanmış adresle; konsolsuz 4 · **P** gerçek süreç, konsolsuz + casus ön-yükleme (17 koşum): yanlış yolda çıkış 4 ve `CONOUT$` açma denemesi **0**; doğru yolda açma denemesi **1** (casusun gördüğünün kanıtı) + "yerel konsol yok" 4; ağ çağrısı 0, dosya yazması 0 · **S** tek `require`, ağ modülü/host literali yok, require ağacı 3 dosya, intake QR betiği değişmedi (pinle eşit) | **23/23 PASS** — R03-D'de yeniden koşuldu; betik DEĞİŞMEDİ (sha `248929D0…E0A5` log içinde) |
| Negatif kontrol (mutasyon; repo dışı `mutasyon-kontrol.js`, geçici kopyada): `d5-qr-test.js` için 9 bozma (yol `/portal/login`; yol+kanonik kapı yok; kanonik kapı yok; origin kapısı yok; TLS kapısı yok; konsol kapılardan önce; sorgu/fragment kapısı yok; http kabul; ret mesajı adres yazıyor) ve owner bloğu için 10 bozma (eski QR betiği; yanlış yol; host literali; kullanıcı yolu literali; Run'da teyit yok; QrTest'te teyit yok; kapılar adres soruyor; biçim kapısı yok; teyit her girdiyi kabul ediyor; pin listesinde eski betik) + **R03-D**: 3 blok bozması (yabancı süreç deseni eski hâline döndü; `extacc-` alternatifi düşürüldü; kapı durdurmuyor) ve 1 öz-test bozması (çıktı maskesi devre dışı) | **25/25**: bozulmamış 2 kopya PASS, **23 bozmanın 23'ü ilgili öz-testi FAIL ettirdi** (R03 ilk tur: 21/21, eski baytlar) |

Deneme koşumları (korunur, son koşumdan ayrı): blok öz-testi ilk deneme **86/87 FAIL** — A-3'te "büyük harf" beklentisi yanlıştı (biçim
kapısı D-6/D-7 ile aynı kural ve büyük/küçük harf duyarsız); beklenti düzeltildi ve kapalı yönde davranış A-3b ile ayrıca ölçüldü.
Mutasyon ilk deneme **20/21** — Run'dan teyit kaldırılınca öz-test FAIL satırı üretmeden istisnayla kesiliyordu; öz-teste X-0 eklendi.
R03-D denemesi: blok öz-testi WinPS 5.1'de **89/90 FAIL** (pwsh 7'de 90/90) — M-1'de TEST kusuru: yakalanan metin `Out-String`'den
geçiyordu, `Out-String` konsol genişliğinde satır kaydırıp yolu iki satıra böldüğü için "her `\Users\` ardından maske gelir" koşulu
yanlış negatif verdi (sızıntı yoktu: aynı koşumda ham çıktıda ad geçişi 0). Yakalama `Out-String` kullanmayacak biçimde düzeltildi.

Kanıt: `HY_R27_AGENT_EVIDENCE\extacc-d5-qr-r03\` (repo dışı) — `son-kosum\` (her sonuç için `*.log` + `*-status.json`: komut, ortam,
çıkış kodu, test edilen dosyaların koşum öncesi/sonrası sha256'sı), `deneme-kosumlari\` (FAIL kayıtları dahil), `onceki-durum\`,
`SHA256-MANIFEST.txt`. Önceki revizyonların kanıtı `extacc-d5-kanit-dogrulugu-is2\` altında değiştirilmeden durur. Loglarda yerel
kullanıcı adı yakalama anında maskelenir; yine de bu loglar PR/belge/public repoya yapıştırılmaz.
R03-D kanıtı: `HY_R27_AGENT_EVIDENCE\extacc-d5-qr-r03\duzeltme\` — `son-kosum\` (status.json artık **test kabuğunu** yakalama
sarmalayıcısından AYRI alanda yazar ve ham çıktıdaki kullanıcı adı geçişini maskeden ÖNCE sayar), `deneme-kosumlari\` (FAIL kaydı
dahil), `onceki-durum\`, `araclar\`, `SHA256-MANIFEST.txt`. **Kısıtlı dosyalar:** R03 ilk tur kanıtındaki 3 dosya (değişiklik öncesi
blok kopyası ve maskesiz yakalanmış iki deneme logu) kaldırılan literalleri taşır; yerinde korunur, ham hâlleri ZIP/PR/açıklamaya
GİRMEZ — `KISITLI-DOSYALAR.json` orijinal sha256'larını ve maskeli kopyaları listeler.
Blok öz-testi tek başına koşulduğunda da çıktısı maskelidir (M-1); `d5-selftest.js` ve `d5-qr-selftest.js` ham çıktısında geçiş 0 ölçüldü.

Öz-testte "telefon" bir istemci taklididir; yeni parolayı koşucunun **yalnız display=none ve canlı olmayan DB'de** yazdığı test
dosyasından (`D5_TEST_DISPLAY_SINK`) alır — bu yol kaynakta tek yerde, `if (con)` dalının dışında ve owner bloğunda kurulmaz (T-2, S-4).

## 6. Pinler (R03; blok ve blok öz-testi sha'sı R03-D)

| Dosya | sha256 |
|---|---|
| `d5-portal-reset-live-run.js` (R03'te DEĞİŞMEDİ) | `924617FFFBD613220A37322960A1E4CAC678D7BE1BB27121022928A4B9676094` |
| `d5-qr-test.js` (yeni) | `248929D081290EDFEEBA41E7371EF3A3814163DBBEB7B24D2C921B74695AE0A5` |
| `d5-owner-live-block.ps1` (paket digest bloğun içinde `E24FBDD3…C852`; `ExpLiveDist` = R27 `E28A6863…5134`) | `691359FDEEBF36C29BA27D850C2409819B09086138049C4C08BF3CAB33BF51B9` |
| `d5-fake-portal-api.js` (değişmedi) / `d5-selftest.js` / `d5-owner-block-selftest.ps1` / `d5-qr-selftest.js` | `E18446C4…748B` / `F8372A69…186E` / `18EC983F…EC0C` / `F17BC670…8924` |

Bloğun pin listesi (9 dosya) = koşucunun **ölçülen** require ağacı (8 dosya) ∪ `d5-qr-test.js`'in **ölçülen** require ağacı (3 dosya:
kendisi + `extacc-display.js` + vendor `qrcode.js`; son ikisi koşucu ağacında zaten var). Intake zincirinin QR betiği artık pin
listesinde değildir (D-5'te kullanılmaz). Paket digest: `E24FBDD3A4A7E7D6E5BCE3AFCEAF8A1E3F72ED6ACC35CDAA23E56478C9C5C852`.

Paket digest yöntemi: pinli her dosya için `relpath(/) + \0 + SHA256 + \n` satırları ordinal sıralanıp birleştirilir, sha256 alınır
(bloktaki `Digest()` ile aynı). R03'te digest blok dışı bağımsız bir betikle yeniden hesaplandı ve bloktaki değerle eşit bulundu; 9
dosyada pin uyuşmazlığı yok (`son-kosum\03-pin-dogrulama.log`); ayrıca `d5-selftest.js` T-3 her pini dosyanın şimdiki sha256'sıyla
karşılaştırır. Blok kendi pinini içermez; blok değiştiğinde yalnız bu tablo güncellenir.
R03-D'de pinli 9 dosyanın hiçbiri değişmedi; pinler ve paket digest yeni koşumda yeniden ölçüldü ve eşit bulundu
(`duzeltme\son-kosum\03-pin-dogrulama.log`). Değişen yalnız blok (pin listesinde değil) ve blok öz-testidir.
Bloğun `$Repo` yolu canlı repo olduğundan Preflight paket kapısı ancak bu dosyalar main'e merge edilip main senkron olduğunda geçer.

## 7. Owner kararları ve sınırlar

- **K-2 alıcı adresi**, **K-3 gönderim adedi (plan 1)**, **K-4 ezme** — R27 paketi §10. Bu bilgiler uydurulmaz; **alıcı adresi ve
  gönderim yetkisi verilmedi**, gönderim yapılmadı. Koşucu/blok canlı talep ya da gönderim yapmaz: blokta HTTP/SMTP istemcisi yoktur;
  koşucu yalnız bloğun kurduğu `D5_API_BASE`/`D5_EXPECT_BASE_URL` uçlarını çağırır ve `forgot-password`'ı yalnız `.invalid` adresle çağırır (T-1).
- Gerçekleşen gönderim adedi KANITLANMIŞ sayılmaz; `plannedRealSends=1` plan, `emailDeliveryMeasured=false` ölçüm sınırıdır.
- Sahte API ürünün kendisi değildir: ürünün hız sınırı (portal deposu ayrı), gerçek SMTP gönderimi ve tenant yaşam döngüsü yalnız canlıda ölçülür.
- E-postayı silmek kapanış değildir; kanıt P5-C-TOKEN'dır. Sağlayıcı günlüğü alıcıyı içerebilir (kısıtlı kayıt SEC-MAIL-LOG-01; onay metninde belirtilir).
- **Canlıda ölçülmeyenler:** QrTest, Preflight ve Run canlıda KOŞULMADI. Öz-testler QR'ı hiçbir görünür konsola çizmez; blok öz-testi
  QrTest'te gerçek doğrulayıcıyı yükleyen geçici betik kullanır. QR'ın telefonla okunabilirliği yalnız owner'ın QrTest koşumunda ölçülür.
- **Biçim kapısı büyük/küçük harf duyarsızdır** (D-6/D-7 ile aynı koşul). D-5'te sonuç kapalı yöndedir (A-3b). Sıkılaştırma istenirse
  üç blokta birlikte yapılır (isteğe bağlı owner kararı).
- **Literal kaldırma geçmişi temizlemez:** aynı alan adı ve yerel kullanıcı yolu main'deki başka bloklarda ve bu dalın geçmişinde durur;
  R03 yalnız D-5 bloğunun güncel hâlini temizler. Diğer bloklar ve geçmiş temizliği ayrı iş ve owner kararıdır.
- Bu paket H1–H8 sayacını değiştirmez (0/8).
