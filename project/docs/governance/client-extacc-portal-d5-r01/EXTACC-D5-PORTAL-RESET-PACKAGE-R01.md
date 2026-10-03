# EXTACC D-5 — PORTAL PAROLA SIFIRLAMA CANLI KABUL PAKETİ (R01)

> **DURUM (2026-10-01; güncelleme 2026-10-02): CANLIDA BİR KEZ KOŞULDU — runId `00c96bd5`, çıkış 3 = ÖLÇÜLEMEYEN; D-5 KABULÜ TAMAMLANMADI; kanıt paketi manifestsiz, TAMAMLANMADI (§8, takip kaydı `D5-RUN-00C96BD5-TAKIP-20261002.md`).** Aşağıdaki "CANLIDA KOŞULMADI" ifadeleri koşum ÖNCESİ revizyon notlarıdır. Gerçek e-posta gönderim denemesi, canlı Run/Recover ve yayın bu paketle yetkilendirilmez;
> yeni deneme için yeni GO, alıcı adresi ve tek gönderim onayı gerekir (§8.7). Run modunda koşucu yalnız owner GO
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
> **R04 (2026-09-30) — onay metni ve Recover yetkisi (yalnız metin; mantık/akış DEĞİŞMEDİ):** owner'a gösterilen "alıcı adresi
> hiçbir kanıt/rapor/log dosyasına yazılmaz" ifadesi YANLIŞTI ve kaldırıldı. Onay metni artık alıcı adresinin kaldığı yerleri AYRI yazar:
> koşucu kanıtları adresi içermez · canlı DB'de sentetik hesapta durur · **canlı API uygulama günlüğü her gönderim denemesinde adresi
> MASKESİZ taşır** (kaynaktan doğrulandı; kapanıştaki ezme bu satırları değiştirmez) · e-posta sağlayıcısının kayıtları **ÖLÇÜLMEDİ**
> (içerik/saklama bilinmiyor). Hedef tek form gönderimidir; tekrar gönderim ek e-posta üretebilir (kodla engellenmez). Run çıkış 5/6
> **Recover yetkisi DEĞİLDİR**: Run'ın koşucu içindeki kendi kapanış adımları ile ayrıca başlatılan Recover ayrıdır; Recover yalnız
> kanıt incelendikten sonra AYRI owner onayıyla başlatılır. Blok öz-testine G-1..G-4 eklendi (94/94 WinPS 5.1 + pwsh 7; eski blok
> baytlarına karşı tam olarak G-1..G-4 FAIL). Koşucu, `d5-qr-test.js`, pinli 9 dosya ve paket digest DEĞİŞMEDİ; ürünün günlük
> davranışı değiştirilmedi, mevcut günlükler silinmedi. Bu revizyon D-5 gönderimi ya da canlı koşum için yetki DEĞİLDİR.

## 1. Ne ölçer (`client-external-access-r01` §7 D-5) ve ne yapmaz

Uçtan uca: owner telefonundan "şifremi unuttum" talebi → ürün **tek gerçek e-posta göndermeyi dener** (bağlantı `PUBLIC_PORTAL_BASE_URL`
ile, token fragment'ta; **SMTP kabulü ve posta kutusuna teslim ölçülmez — yalnız owner beyanı "e-posta geldi mi"**) → owner
e-postadaki bağlantıyı telefonda açar, konsolda gösterilen yeni parolayı girer → bir kez giriş yapar → koşucu DB/HTTP ile ölçer →
kapanış. D-4 R03'ün kapanış kuralları aynen (DB ve HTTP ayrı; sürüm verilme sürümüyle karşılaştırılır; belirsiz oluşturma bekler;
Recover ölçülemeyeni 0 yapmaz) + **P5-C-TOKEN** (kapanıştan sonra kullanılabilir token kalmaz) + **bilinen geçerli parola** kuralı
(kapanış girişi için aday parolalar — sıfırlama tamamlandıysa yeni parola, hesap açıldıysa ilk parola — mevcut hash ile `bcrypt.compare`
ile doğrulanır; eşleşen yoksa P5-C3 ÖLÇÜLEMEYEN: yanlış parolayla alınan 401 kapanış kanıtı değildir).
Koşucu **e-posta göndermez** (talep telefondan; ürün gönderim dener), `reset-password`/`change-password`/belge/mesaj uçlarını çağırmaz;
alıcı adresini, parolaları, token'ları ve GO'yu kendi kanıtlarına yazmaz (canlı API'nin kendi uygulama günlüğü AYRIDIR — §7, R04). Gönderimsiz kontrol için `.invalid` adresle bir
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
manifest · **Recover**: `-ReceiptFile`; ezme kararı sorulur; GO/alıcı/adres sorulmaz. Recover, Run'ın koşucu içindeki kendi kapanış
adımlarından AYRI bir işlemdir; otomatik değildir, yalnız AYRI owner onayıyla başlatılır (§4 adım 7).

**Canlı veri işleme onay metni (R04).** Owner'a "EVET" sorulmadan önce alıcı adresinin kaldığı yerler ayrı satırlarda gösterilir:
(1) koşucu kanıtları (`d5-evidence.json`, kurulum makbuzu, `d5-run.log`, `owner-block.json`, owner beyanı) adresi İÇERMEZ;
(2) canlı DB — sentetik portal hesabının e-posta alanı (K-4 = E ise kapanışta yalnız bu alan `.invalid` ile ezilir);
(3) canlı API uygulama günlüğü — ürün her gönderim denemesinde adresi MASKESİZ yazar (kaynaktan doğrulandı), ayrıca maskeli satırlar
oluşur; ezme bu satırları değiştirmez, blok günlükleri değiştirmez/silmez; e-posta (SMTP) sağlayıcısının kendi kayıtları ÖLÇÜLMEDİ
(adresi içerip içermediği ve saklama süresi bilinmiyor; SEC-MAIL-LOG-01). Aynı metin ve gönderim onayı, hedefin TEK form gönderimi
olduğunu ve formun tekrar gönderilmesinin ek e-posta (ve günlükte adresi içeren ek satır) üretebileceğini, yeni bağlantı üretilirse ilk bağlantının geçersiz olacağını söyler. Öz-test G-2/G-3
bunu owner'a GÖSTERİLEN metin üzerinde ölçer.

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
Blok ve koşucu alıcı adresini kendi kanıt/log dosyalarına yazmaz (`owner-block.json`: `recipientWritten=false`, `plannedRealSends=1` **bir PLANDIR**
— `plannedRealSendsNote` bunu açıkça söyler; gerçekleşen gönderim/kabul/teslim kanıtı değildir —, `scrubRequested`). Bu ifade
yalnız blok/koşucu dosyaları içindir: adres canlı DB'de ve canlı API uygulama günlüğünde ayrıca bulunur (yukarıdaki onay metni; §7).
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
   koşucu tarafından ölçülmez; beyanda sorulur). E-posta gecikse de formu **tekrar göndermeyin**: tek gönderim kodla garanti edilmez,
   ürün tekrar talepte yeni bağlantıyla ek e-posta üretebilir ve API günlüğüne adresi içeren ek satır yazabilir; yeni bağlantı üretilirse ilk e-postadaki bağlantı geçersiz olur.
5. 2. konsol ekranı göründüğünde: telefonda e-postadaki bağlantıyı açın, ekrandaki yeni parolayı girin, bir kez giriş yapın; listede
   yalnız ekrandaki dosya numarası olmalı. Sonra **aynı bağlantıyı ikinci kez açıp formu GÖNDERİN** (hata/geçersiz beklenir) — koşucu
   bunu ölçemez; beyanda **H / A / S / Y / ?** sorulur. Yalnız açıp göndermediyseniz **A**, hiç denemediyseniz **Y** yazın.
6. Koşum bitince ekran temizlenir; 9 beyan sorusunu yanıtlayın (adres/parola/bağlantı yazmayın). Blok birleşik kararı yazar ve gösterir.
   Pencereyi kapatın.
7. **Çıkış 5/6 Recover yetkisi DEĞİLDİR (R04).** Run kendi kapanış adımlarını (portal kapatma, token iptali, personel/dosya kapanışı)
   koşucu İÇİNDE zaten denedi; 5/6 bu adımların doğrulanamadığını söyler. Blok Recover başlatmaz; ajan da otomatik başlatmaz. Önce
   kanıt dizini incelenir (`d5-evidence.json` içindeki kurtarma/inceleme nedeni ve açık kalan kaynaklar) ve sonuç CLIENT'a/owner'a
   bildirilir; kanıttaki kurtarma adımı bir **öneridir**, yetki değildir. Recover (`-Mode Recover -ReceiptFile <kanıt dizinindeki
   d5-setup-receipt.json>`) yalnız bu inceleme sonrası **AYRI owner onayıyla**, BİR KEZ koşulur; ürün bulgusu varsa Recover onu
   düzeltmez; kabul tekrarlanmaz. Ezme hatası (P5-SCRUB) için de aynı kural geçerlidir.

## 5. Öz-testler (canlıya dokunmadan; R03 + inceleme düzeltmeleri R03-D, 2026-09-30 — sayılar SON dosya baytlarıyla ÖLÇÜLDÜ)

| Test | Sonuç (R03-D, son baytlar) |
|---|---|
| `d5-selftest.js` (disposable DB 127.0.0.1:5447 + sahte API 8198/8456 + sahte posta kutusu + gerçek TLS): Z1 normal 0 (+Z1-g kapanış girişi yeni parola, hash ile doğrulandı; Z1-h `emailDeliveryMeasured=false`, "göndermiştir" yok, OBS metni "gözlem"); Z13 ikinci deneme yapılmayan telefon → OBS yine PASS, çıkış 0; Z2 adres kapısı 4; Z3 talep yok + ezme 3; Z4 talep var sıfırlama yok 3 (+Z4-b kapanış girişi ilk parola ile; S0 reddi PASS); Z5-a token tüketilmiyor → P5-C3 ÖLÇÜLEMEYEN → çıkış 6, Z5-b Recover 3; Z6 sürüm artmıyor 2; Z7 kapatma token silmiyor 6 + Recover 6; Z8 token yazılmadı 3; Z9 kapılar; Z10 create 500 → 6; Z11 konsolsuz 4; Z12 makbuz 1; S-1 sır sızıntısı yok (41 dosya tarandı); T-1..T-8 / P-1..P-2 statik; **R03: T-3 pin kümesi = koşucunun require ağacı (8) ∪ `d5-qr-test.js`'in require ağacı (3) = 9 dosya, iki ağaç da ölçüldü, her pin dosyanın şimdiki sha256'sına eşit, intake QR betiği pinli değil; T-5 Preflight dalı R05 adresi de sormaz; T-9 QR denemesi koşucunun 1. konsolda çizdiği yolla aynı yolu kabul eder, `/portal/login` reddedilir; T-10 blokta public host / kullanıcı yolu literali yok** | **41/41 PASS** — R03-D'de yeni blok baytlarıyla YENİDEN koşuldu (koşucu sha `924617FF…6094`, blok sha `691359FD…51B9` log içinde; node v24.18.0). Önceki R02: 39/39 (eski baytlar) |
| `d5-owner-block-selftest.ps1` (AST ile gerçek fonksiyonlar; gerçek node; N; K-1..K-8; R-1/R-8/R-9/R-10; C-*; L; O-1..O-8; V; Z; Q; S-1..S-4) + **R03**: **A-1** kapıların gerçek satırları sahte `.env` ile adresi çözer, owner'a soru sorulmaz · **A-2** `.env` değeri değişince QR adresi de değişir (blokta sabit yok) ve gerçek `d5-qr-test.js` doğrulayıcısı kabul eder · **A-3** biçim kapısı (http/yol/sondaki `/`/port/sorgu/userinfo/IP/localhost/fragment/alt çizgi/boşluk/boş, anahtar çift/yok → DUR) · **A-3b** büyük harfli host → QrTest kapalı yönde durur · **A-4..A-6** · **A-7 Preflight adres sormaz ve yazmaz** (AST: Preflight dalı + kapılardan erişilebilen 11 fonksiyonda 64 komut incelendi, soru/onay/node/yazma komutu 0; pozitif kontrol Run/QrTest'te görür) · **K-9/K-9b/K-9c** owner adresi eşleşmezse canlı veri onayından önce DUR (9 yakın-yanlış girdi); koşucuya giden origin `.env` değeri · **Q-D5** QrTest `d5-qr-test.js`'i tek kez çağırır, koşucuyu çağırmaz, adres `<.env origin>/portal/forgot-password`, ortam temizlenir · **Q-R05** (6 durum) · **Q-NEG** · **Q-NULL** · **S-5** public host / yerel kullanıcı yolu literali yok — yalnız bu ikisi ölçülür; canlı yayın dizini, servis adları, yerel portlar ve DB adı gibi diğer yerel topoloji sabitleri blokta DURUR (ölçütün kapsamı dışında; ayrı iş) (1025 metin sabiti incelendi; tek `http(s)://` adresi yerel API) · **S-6/S-7** QrTest çağrısı ve pin listesi · **X-0** beklenmeyen istisna sessizce kesmez, FAIL satırı olur. Çıktı artık her ölçütün ölçülen değerini de yazar (GÖZLEMLER) · **R03-D**: **S-8** yabancı kabul süreci deseni eski 8 alternatifi korur ve `d6-portal-` / `d7-portal-` / `d8-staff-` içerir (11 alternatif); göreli yolla başlatılan 8 koşucu örneği eşleşir, 4 uygulama süreci örneği (node --version, API, web) eşleşmez; süzgeç yalnız `node.exe`; kapı `Fail` ile durdurur · **M-1** öz-testin ve blok fonksiyonlarının tüm `Write-Host` çıktısı yazılmadan önce yerel kullanıcı adından arındırılır; `Fail` istisna mesajı (karar girdisi) değişmez | **90/90 PASS** WinPS 5.1.26100.9549 ve pwsh 7.6.6 (blok sha `691359FD…51B9` log içinde; HAM çıktıda yerel kullanıcı adı geçişi 0 — maskeden önce ölçüldü). R03 ilk tur 88/88, R02 70/70 (ikisi de eski baytlar) |
| `d5-qr-selftest.js` (**yeni**; DB/ağ yok, konsola QR çizmez): **V** doğrulama — 4 kabul, 28 yanlış yol (zorunlu 6 yol + kodlanmış/normalleşen varyantlar), 27 diğer ret (http, userinfo, sorgu, fragment, origin uyuşmazlığı, boş/bozuk adres, geçersiz beklenen origin → 4; TLS kapalı → 1); ret mesajı adresi yazmaz · **E-1** origin kuralı `expectedOriginOf` ile aynı (21 girdi) · **M** `main` sahte gösterimle: 55 ret durumunun hepsinde konsol açma 0 / QR üretimi 0; kabulde QR yalnız doğrulanmış adresle; konsolsuz 4 · **P** gerçek süreç, konsolsuz + casus ön-yükleme (17 koşum): yanlış yolda çıkış 4 ve `CONOUT$` açma denemesi **0**; doğru yolda açma denemesi **1** (casusun gördüğünün kanıtı) + "yerel konsol yok" 4; ağ çağrısı 0, dosya yazması 0 · **S** tek `require`, ağ modülü/host literali yok, require ağacı 3 dosya, intake QR betiği değişmedi (pinle eşit) | **23/23 PASS** — R03-D'de yeniden koşuldu; betik DEĞİŞMEDİ (sha `248929D0…E0A5` log içinde) |
| Negatif kontrol (mutasyon; repo dışı `mutasyon-kontrol.js`, geçici kopyada): `d5-qr-test.js` için 9 bozma (yol `/portal/login`; yol+kanonik kapı yok; kanonik kapı yok; origin kapısı yok; TLS kapısı yok; konsol kapılardan önce; sorgu/fragment kapısı yok; http kabul; ret mesajı adres yazıyor) ve owner bloğu için 10 bozma (eski QR betiği; yanlış yol; host literali; kullanıcı yolu literali; Run'da teyit yok; QrTest'te teyit yok; kapılar adres soruyor; biçim kapısı yok; teyit her girdiyi kabul ediyor; pin listesinde eski betik) + **R03-D**: 3 blok bozması (yabancı süreç deseni eski hâline döndü; `extacc-` alternatifi düşürüldü; kapı durdurmuyor) ve 1 öz-test bozması (çıktı maskesi devre dışı) | **25/25**: bozulmamış 2 kopya PASS, **23 bozmanın 23'ü ilgili öz-testi FAIL ettirdi** (R03 ilk tur: 21/21, eski baytlar) |

**R04 (2026-09-30) — son dosya baytlarıyla** (blok `98200AF1…0733`, blok öz-testi `D6BE7AC7…FB24`; sha'lar log içinde). İlk R04 koşumu blok `22B50727…9BF0` ile aynı sayıları verdi; inceleme sonrası yalnız metin düzeltmesiyle (tekrar gönderimde günlük satırı "yazabilir", ilk bağlantının geçersizleşmesi, kalan/kalmayan yer ayrımı) blok son baytlara geldi ve aşağıdaki testler son baytlarla yeniden koşuldu:

| Test | Sonuç (R04) |
|---|---|
| `d5-owner-block-selftest.ps1` + **G-1** kaynakta (yorumlar dahil) "hiçbir … dosya/log/günlük/kanıt/rapor … yazılmaz" türü mutlak iddia yok (504 satır tarandı; desen 4 bilinen mutlak cümleyi yakalar, kapsamı adlandırılmış ve ilgisiz 2 cümleyi yakalamaz) · **G-2** owner'a GÖSTERİLEN onay metni (Write-Host yakalaması) koşucu kanıtı → canlı DB → canlı API uygulama günlüğü (MASKESİZ, kaynaktan doğrulandı, kapanışta ezilmez, blok silmez) → sağlayıcı (ÖLÇÜLMEDİ, içerik/saklama bilinmiyor) ayrımını sırasıyla yazar; eski "içerebilir" / "maskelenmiş API günlük satırları" yok · **G-3** tek form gönderimi hedefi + tekrar gönderimde ek e-posta hem onay hem gönderim metninde · **G-4** Run çıkış 5/6 metni Run'ın kendi kapanışını Recover'dan ayırır, "Recover yetkisi değildir / blok başlatmaz / önce kanıt / AYRI owner onayı" der, tek node çağrısı (recover çağrısı 0); çıkış 0'da Recover metni yok; ezme hatası satırı da ayrı onay + otomatik değil | **94/94 PASS** WinPS 5.1.26100.9549 ve pwsh 7.6.6 (çıkış 0; ham çıktıda yerel kullanıcı adı geçişi 0). Önceki 90 ölçüt değişmeden PASS |
| Negatif kontrol + mutasyon (geçici kopya; yeni öz-test): eski blok baytları `691359FD…51B9` ve 6 metin bozması (yoruma mutlak iddia; sağlayıcı satırı silindi; API günlüğü "MASKESİZ yazar" → "yazabilir"; tekrar-gönderim satırı silindi; 5/6 metni eski emre döndü; ezme satırı "Recover ile tekrar denenebilir"e döndü) + bozulmamış kopya | **16/16 beklenenle uyumlu** (her varyant WinPS 5.1 + pwsh 7): eski blok **90/94, çıkış 1, FAIL = tam olarak G-1..G-4**; her bozma yalnız hedef ölçütü FAIL ettirdi (93/94); bozulmamış kopya 94/94 |
| Mantık eşitliği (AST; yorumlar, Write-Host komutları ve Read-Answer/Read-Host istem metinleri çıkarılır, boşluk normalize) | eski ve yeni blokta kalan kod **birebir eşit** (21969/21969 karakter; 32/32 fonksiyon; Write-Host 44 → 58, fonksiyon içi 41 → 55 — son baytlarla yeniden sayıldı; istem 18/18) WinPS 5.1 + pwsh 7; negatif kontrol: 5/6 koşulu değiştirilmiş kopya FARK verir |
| `d5-selftest.js` (bloğu T-3..T-10'da statik okur) | **41/41 PASS** (çıkış 0; yeni blok sha log içinde; koşucu DEĞİŞMEDİ `924617FF…6094`; ham çıktıda ad geçişi 0) |
| `d5-qr-selftest.js` | **KOŞULMADI** — D-5 owner bloğunu okumaz (yalnız `d5-qr-test.js`, H5 koşucusu, intake QR betiği ve EXTACC intake bloğu); bunların hiçbiri değişmedi. Son sonuç R03-D 23/23 |
| Ayrıştırma + kodlama | iki `.ps1` dosyası WinPS 5.1 ve pwsh 7'de parse hatası 0; UTF-8 BOM korunur; satır sonu LF (CR 0); katı UTF-8 çözümü geçerli |
| Paket digest | pinli 9 dosyadan bloktan bağımsız betikle yeniden hesaplandı: `E24FBDD3…C852` = bloktaki `$ExpPackage` (değişmedi); pin uyuşmazlığı yok; `ExpLiveDist` / `ExpEnvSha` değişmedi |

R04 deneme koşumu (korunur): ilk koşum 94/94 PASS verdi ama G-4 döngüsündeki `$t` değişkeni PowerShell'de harf duyarsız olduğundan
öz-testin geçici dizin değişkeni `$T`'nin üzerine yazdı; son "geçici dizin:" satırı yakalanan metni bastı (sonuçlar etkilenmedi —
`$T` G-4'ten sonra yalnız bu satırda kullanılır). Değişken adı değiştirildi, iki sürümde yeniden koşuldu.
Kanıt (repo dışı; loglar PR/belge/public repoya yapıştırılmaz): R04 test logları, status dosyaları (komut, çıkış kodu, koşum
öncesi/sonrası sha256), negatif kontrol sonuçları ve bağımsız inceleme çıktıları kalıcı ajan kanıt dizininde `HY_R27_AGENT_EVIDENCE\d5-r04\` altında (hash doğrulamalı kopya).

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

## 6. Pinler (R03; blok ve blok öz-testi sha'sı R04)

| Dosya | sha256 |
|---|---|
| `d5-portal-reset-live-run.js` (R03'te ve R04'te DEĞİŞMEDİ) | `924617FFFBD613220A37322960A1E4CAC678D7BE1BB27121022928A4B9676094` |
| `d5-qr-test.js` (R04'te değişmedi) | `248929D081290EDFEEBA41E7371EF3A3814163DBBEB7B24D2C921B74695AE0A5` |
| `d5-owner-live-block.ps1` **R04** (paket digest bloğun içinde `E24FBDD3…C852`, değişmedi; `ExpLiveDist` = R27 `E28A6863…5134`) | `98200AF14ED6C53A608247BA995D2E3BF85199A9310CAF417661E824B0090733` |
| `d5-owner-block-selftest.ps1` **R04** | `D6BE7AC7C7E5E4DB5ABAD189B9FE0E703D9D7811857DF601923062AD619AFB24` |
| önceki (R03-D): `d5-owner-live-block.ps1` / `d5-owner-block-selftest.ps1` | `691359FDEEBF36C29BA27D850C2409819B09086138049C4C08BF3CAB33BF51B9` / `18EC983FA27A6D793071B0FB2E5239917D2CDC90286EE45C500C795E1CF9EC0C` |
| `d5-fake-portal-api.js` / `d5-selftest.js` / `d5-qr-selftest.js` (R04'te değişmedi) | `E18446C4…748B` / `F8372A69…186E` / `F17BC670…8924` |

Bloğun pin listesi (9 dosya) = koşucunun **ölçülen** require ağacı (8 dosya) ∪ `d5-qr-test.js`'in **ölçülen** require ağacı (3 dosya:
kendisi + `extacc-display.js` + vendor `qrcode.js`; son ikisi koşucu ağacında zaten var). Intake zincirinin QR betiği artık pin
listesinde değildir (D-5'te kullanılmaz). Paket digest: `E24FBDD3A4A7E7D6E5BCE3AFCEAF8A1E3F72ED6ACC35CDAA23E56478C9C5C852`.

Paket digest yöntemi: pinli her dosya için `relpath(/) + \0 + SHA256 + \n` satırları ordinal sıralanıp birleştirilir, sha256 alınır
(bloktaki `Digest()` ile aynı). R03'te digest blok dışı bağımsız bir betikle yeniden hesaplandı ve bloktaki değerle eşit bulundu; 9
dosyada pin uyuşmazlığı yok (`son-kosum\03-pin-dogrulama.log`); ayrıca `d5-selftest.js` T-3 her pini dosyanın şimdiki sha256'sıyla
karşılaştırır. Blok kendi pinini içermez; blok değiştiğinde yalnız bu tablo güncellenir.
R03-D'de pinli 9 dosyanın hiçbiri değişmedi; pinler ve paket digest yeni koşumda yeniden ölçüldü ve eşit bulundu
(`duzeltme\son-kosum\03-pin-dogrulama.log`). Değişen yalnız blok (pin listesinde değil) ve blok öz-testidir.
R04'te de değişen yalnız blok (metin) ve blok öz-testidir; paket digest bloktan bağımsız betikle yeniden hesaplandı ve `E24FBDD3…C852`
ile eşit bulundu. Blok sha'sı değiştiği için R03-D'de ölçülmüş Preflight sonucu (varsa) R04 baytlarını kapsamaz; Preflight yeni
baytlarla, main'e merge sonrası ayrıca koşulur.
Bloğun `$Repo` yolu canlı repo olduğundan Preflight paket kapısı ancak bu dosyalar main'e merge edilip main senkron olduğunda geçer.

## 7. Owner kararları ve sınırlar

- **K-2 alıcı adresi**, **K-3 gönderim adedi (plan 1)**, **K-4 ezme** — R27 paketi §10. Bu bilgiler uydurulmaz; paket yazılırken alıcı adresi ve
  gönderim yetkisi verilmemişti (2026-10-01 koşumunda owner konsolda verdi; §8). Koşucu/blok canlı talep ya da gönderim yapmaz: blokta HTTP/SMTP istemcisi yoktur;
  koşucu yalnız bloğun kurduğu `D5_API_BASE`/`D5_EXPECT_BASE_URL` uçlarını çağırır ve `forgot-password`'ı yalnız `.invalid` adresle çağırır (T-1).
- Gerçekleşen gönderim adedi KANITLANMIŞ sayılmaz; `plannedRealSends=1` plan, `emailDeliveryMeasured=false` ölçüm sınırıdır.
- Sahte API ürünün kendisi değildir: ürünün hız sınırı (portal deposu ayrı), gerçek SMTP gönderimi ve tenant yaşam döngüsü yalnız canlıda ölçülür.
- E-postayı silmek kapanış değildir; kanıt P5-C-TOKEN'dır.
- **Alıcı adresinin kaldığı yerler (SEC-MAIL-LOG-01, kısıtlı kayıt; ayrıntı public repoya yazılmaz) — R04:** koşucu kanıtları
  (`d5-evidence.json`, makbuz, `d5-run.log`, `owner-block.json`, owner beyanı) adresi içermez (koşucu maskeler). Canlı DB'de adres
  sentetik portal hesabında durur; K-4 = E ise kapanışta yalnız bu DB alanı `.invalid` ile ezilir. **Canlı API, her gönderim
  denemesinde adresi kendi uygulama günlüğüne MASKESİZ yazar** ve bu çıktı API günlük dosyasına düşer (kaynaktan doğrulandı; ayrıca
  maskeli satırlar vardır); ezme bu satırları değiştirmez. E-posta (SMTP) sağlayıcısının kendi kayıtları **ölçülmedi** — adresi
  içerip içermediği ve saklama süresi hakkında iddia kurulmaz. Bu paket ürünün günlük davranışını değiştirmez ve mevcut günlükleri
  silmez; günlük satırlarının ele alınması ayrı iş ve owner kararıdır. Owner'a canlı veri onayından ÖNCE ayrı satırlarda gösterilir (G-2).
- **Tek gönderim hedeftir, kodla garanti edilmez:** K-3 planı 1 form gönderimidir; ürün tekrar talebi (hız sınırı dışında) engellemez.
  Owner formu tekrar gönderirse (hız sınırı ve hesap durumu izin verirse) yeni token + ek e-posta oluşabilir, günlükte adresi içeren ek satır yazılabilir ve ilk bağlantı geçersiz olur (G-3; §4 adım 4).
- **Recover yetkisi (R04):** Run çıkış 5/6 otomatik Recover yetkisi DEĞİLDİR. Run'ın koşucu içindeki kapanış adımları Run'ın
  parçasıdır; ayrıca başlatılan Recover ayrı bir canlı yazma işlemidir ve kanıt incelemesi + açık kalan kaynakların bildirilmesi
  sonrasında AYRI owner onayı gerektirir (§4 adım 7; G-4). Koşucunun kanıttaki kurtarma adımı metni (pinli, değişmedi) bir öneridir.
- **Canlıda ölçülmeyenler:** paket yazılırken QrTest, Preflight ve Run canlıda koşulmamıştı; 2026-10-01'de üçü de koşuldu (§8). Öz-testler QR'ı hiçbir görünür konsola çizmez; blok öz-testi
  QrTest'te gerçek doğrulayıcıyı yükleyen geçici betik kullanır. QR'ın telefonla okunabilirliği yalnız owner'ın QrTest koşumunda ölçülür.
- **Biçim kapısı büyük/küçük harf duyarsızdır** (D-6/D-7 ile aynı koşul). D-5'te sonuç kapalı yöndedir (A-3b). Sıkılaştırma istenirse
  üç blokta birlikte yapılır (isteğe bağlı owner kararı).
- **Literal kaldırma geçmişi temizlemez:** aynı alan adı ve yerel kullanıcı yolu main'deki başka bloklarda ve bu dalın geçmişinde durur;
  R03 yalnız D-5 bloğunun güncel hâlini temizler. Diğer bloklar ve geçmiş temizliği ayrı iş ve owner kararıdır.
- Bu paket H1–H8 sayacını değiştirmez (0/8).

## 8. Canlı koşum kaydı — runId `00c96bd5` (2026-10-01) · çıkış 3 = ÖLÇÜLEMEYEN · kabul TAMAMLANMADI

Kaynak ayrımı: **[Ö]** bu kaydı yazan oturumun ölçümü (kanıt dosyalarının ve canlı API günlüğünün salt okunması; kaynak okuması) ·
**[O]** owner beyanı (makine ölçümü değildir). Kanıt dosyaları owner makinesinde yerinde durur; ham içerik, adres, origin ve yerel yol
bu kayda alınmadı. Bu kayıt H1–H8 sayacını değiştirmez (0/8) ve D-6/D-7/D-8/birleşik D-9 için hiçbir şey söylemez.

### 8.1 Koşum öncesi

| Adım | Sonuç | Kaynak |
|---|---|---|
| #2862 (B3 R03-c/R03-d) ve #2858 (bu paketin R04'ü) | MERGED `496e6f6a` / `138aa9a3`; merge commit CI'ları SUCCESS; kanonik `main` ff-only senkron | [Ö] GitHub |
| Preflight (blok R04 `98200AF1…0733`) | **PREFLIGHT GEÇTİ** 12:40Z ve 16:59Z: paket pinleri eşit, canlı API dist `E28A6863…` (3873 dosya), `.env` sha eşit, dış zincir kapıları geçti | [Ö] pencere çıktısı kaydı |
| QrTest | çıkış **0** (16:55Z): QR telefonda sıfırlama sayfasını açtı; form gönderilmedi | çıkış kodu [Ö] · "telefonda açıldı" [O] |
| Pencere notu | İlk QrTest penceresi ajan tarafından PowerShell 7 içinden açıldı; çocuk Windows PowerShell 5.1 süreci modül yolunu devraldığı için `Get-FileHash` bulunamadı ve blok hiçbir kapıyı koşmadan durdu (yazma yok). Modül yolu düzeltilerek yeniden açıldı. Blok kusuru değildir; owner pencereyi doğrudan açarsa oluşmaz | [Ö] |

### 8.2 Run sonucu

| Alan | Değer |
|---|---|
| Başlangıç / bitiş | 2026-10-01 17:07:26Z / 17:27:32Z (telefon beklemesi 20 dk'nın tamamı kullanıldı) |
| Koşum anındaki `main` | `6917e8aa` (blok kapısı: `origin/main` ile eşit, takipli dosyalar temiz) |
| Çıkış kodu | **3** (ÖLÇÜLEMEYEN) — §2: kabul değildir |
| Ölçütler | 29 — **21 PASS · 0 FAIL · 8 ÖLÇÜLEMEYEN** |
| PASS | P5-GATE · P5-00 · P5-01 · P5-02 · P5-03L · P5-04D · P5-DISP1 · P5-UNKNOWN · P5-C1 · P5-C2 · P5-C-TOKEN · P5-C2V · P5-C3L · P5-C3D · P5-C4L-S0 · P5-C4D-S0 · P5-C5 · U-CLOSE · P5-SCRUB · P5-D9 · U-ISO |
| ÖLÇÜLEMEYEN | P5-TOKEN-ISSUED (bekleme süresince hesapta sıfırlama token'ı görülmedi) · P5-DISP2 · P5-CONSUMED · P5-WAIT · P5-S1-OPEN · P5-SINGLE-USE-OBS · P5-C4L · P5-C4D (sıfırlama sonrası oturum hiç alınmadı) |
| Ürün bulgusu alanı | boş · yasak uç çağrısı yok |
| GO | tüketildi; literal hiçbir kanıt dosyasına yazılmadı (defterde yalnız sha256) |
| Gönderim | `plannedRealSends=1` bir **plandır**; `emailDeliveryMeasured=false`. Gönderim denemesi **ölçülmedi**; günlükte gönderim kaydı bulunamadı (§8.5) |

### 8.3 Kapanış — üç ayrı görünüm (Run'ın koşucu içindeki kendi kapanışı; ayrı Recover BAŞLATILMADI)

Aşağıdaki üç grup ayrı ölçümlerdir ve birbirinin yerine sayılmaz. Bu kapanış **yalnız bu koşum** içindir; birleşik D-9 değildir.

| Grup | Ölçütler | Sonuç | Ne gösterir / göstermez |
|---|---|---|---|
| **(a) Kapanış — DB, token, yeni giriş, personel/dosya** | P5-C1 · P5-C2 · P5-C-TOKEN · P5-C2V · P5-C5 · P5-C3L · P5-C3D · U-CLOSE · P5-SCRUB · U-ISO · P5-D9 | **PASS** | yetkili uçla kapatma 201; hesap pasif, erişim kapalı, oturum sürümü 0 → 1; sıfırlama token'ı kapanıştan önce de sonra da yok; kapanış sonrası yeni giriş bilinen geçerli parolayla (ilk parola; hash ile doğrulandı) yerel ve dış 401; iki sentetik tenantta aktif kullanıcı 0, aktif dosya 0; alıcı adresi sentetik hesapta ezildi (owner kararı E); izolasyon ölçümü (yalnız sayı) eşit. `recovery.gerekli = false` |
| **(b) Orijinal oturumun reddi** — sıfırlama ÖNCESİ alınan koşucu oturumu (S0) | P5-C4L-S0 · P5-C4D-S0 | **PASS** | kapanıştan sonra S0 oturumu korumalı uçta yerel ve dış 401. Telefonda açılmış bir oturum **yoktu** (giriş hiç yapılmadı); telefon oturumu bu ölçümün konusu değildir |
| **(c) Sıfırlama SONRASI kontroller** | P5-C4L · P5-C4D (sıfırlama sonrası oturumun reddi) ve akış ölçütleri P5-TOKEN-ISSUED · P5-DISP2 · P5-CONSUMED · P5-WAIT · P5-S1-OPEN · P5-SINGLE-USE-OBS | **ÖLÇÜLEMEYEN** (8 ölçüt) | sıfırlama hiç gerçekleşmediği için sıfırlama sonrası oturum (S1) hiç oluşmadı; bu sekiz ölçüt **koşmadı**. PASS sayılmaz; (a) ve (b) bunların yerine geçmez |

### 8.4 Kanıt paketi — **TAMAMLANMADI** (manifest yok)

Kanıt dizininde beş dosya vardır; ham bayt sha256'ları koşum sonundan 2026-10-02 20:39Z ölçümüne kadar değişmedi [Ö]:

| Dosya | sha256 |
|---|---|
| `d5-evidence.json` | `DD89C593D8E4D15B2631F6A25C2B4C206441F9144695B6BF49FBD2A35C8BEA7F` |
| `d5-run.log` | `E17B3A4BE14EDA8FA23CDA945A8EF122AE9A92B42C3FF540ED820CE19C6F6257` |
| `d5-setup-receipt.json` | `625339D787D205009E2AABA7759C28501BCD810CFBD0139670C751EBD9DD4F26` |
| `goref-consumed.json` | `0E87F52D9B1376EEE8DC1A1B3C552653AD0AB03E8EE6DCCB64CECB6DDB0B7B77` |
| `owner-block.json` | `DC49FD9C426EDC2CC7BB438033E8186E96BE1219B417475403D8F2DA51EFDAE8` |

Beş dosyada üç kodlamayla sır taraması: gerçek e-posta adresi 0 · GO literali 0 · oturum belirteci 0 · parola özeti 0 [Ö].

**Eksik ve artık blok tarafından üretilemez:** `owner-declaration.json`, `d5-combined-verdict.json`, `SHA256-MANIFEST.txt`. Blok bu üç
dosyayı koşum sonunda, owner 9 beyan sorusunu yanıtladıktan sonra yazar. Sorular yanıtlanmadan pencere kapandı: 2026-10-02 ölçümünde
pencere süreci yoktu ve makine 2026-10-02 02:56'da (TSİ) yeniden başlamıştı. Bu dosyalar **üretilmiş gibi gösterilmez**; yeni Run
başlatılmadı. Manifest olmadığı için bu koşumun kanıt paketi **tamamlanmış sayılmaz**. Takip kayıtları: `D5-RUN-00C96BD5-TAKIP-20261002.md`
ve `D5-RUN-00C96BD5-TAKIP-20261003.md` (2026-10-03: iki eksik beyan sonradan alındı, beş dosyanın özet envanteri koşum sonu
değerleriyle aynı, dokuz sorunun açık beyan / çıkarım ayrımı; koşum D-5 yeniden kabulü ve birleşik D-9 için yeterli sayılmaz).

Owner beyanı (2026-10-01; çalışma oturumunda iletildi; blok dosyası **değildir**) [O]: telefonda ilk QR üzerinden sıfırlama formu
**bir kez** gönderildi; genel "e-posta gönderildi — bu adresle kayıtlı hesap varsa…" ekranı çıktı; posta kutusu ve istenmeyen klasörü
kontrol edildi; **e-posta ulaşmadı**. Genel başarı ekranı gönderim ya da teslim kanıtı **değildir**.

### 8.5 Teşhis — mevcut kanıtın gösterdiği ve göstermediği (salt okuma; koşum aralığı ve sentetik kayıtlarla sınırlı)

İncelenenler: koşucu kanıtı, canlı API uygulama günlüğü (yalnız koşum aralığı; içerik bu kayda alınmadı, yalnız sayımlar), canlı
kaynak `1b758d29`. Güncel DB'den geçmiş eşleşme ya da token geçmişi çıkarılmadı. Kullanıcı hatası **varsayılmadı**.

**Mevcut kanıtın gösterdiği:**

| Gözlem | Dayanak |
|---|---|
| İzlenen sentetik hesapta sıfırlama token'ı **görülmedi** — bekleme süresince (20 dk, 5 sn yoklama) ve kapanış öncesi ölçümde | [Ö] koşucu kanıtı |
| Canlı API uygulama günlüğünde koşum aralığında gönderim kaydı **bulunamadı**: 22 satırın tamamı zamanlayıcı satırları ve bu akışa ait iki satırdır (hesap oluşturma, koşucunun girişi); sıfırlama / e-posta / SMTP içerikli satır 0, WARN/ERROR 0; hata günlüğü boş | [Ö] günlük sayımı |
| Hesap aktifti ve büro girişe açıktı (aynı dakikada P5-03L / P5-04D PASS); yerel API'de sıfırlama ucu yanıt veriyor (P5-UNKNOWN PASS) | [Ö] koşucu kanıtı |
| Owner formu bir kez gönderdi, genel başarı ekranını gördü, e-posta ulaşmadı | [O] |

**UNKNOWN (ölçülemedi):**

| Soru | Neden ölçülemedi |
|---|---|
| Talep API'ye ulaştı mı | API'de erişim günlüğü yok; metrik sayacı yol etiketi taşımaz; canlı kenar yapılandırması ve günlüğü okunamadı; tünel olay kaydı bulunmadı |
| Telefonun formda gönderdiği adres | hiçbir yerde kayıtlı değil |
| E-posta (SMTP) sağlayıcısının kayıtları | ölçülmedi (okunmadı; erişim owner'da) |

**Kök neden: KANITLANMADI.** Kaynak düzeyinde bilinenler yalnız olası açıklamaları daraltır, hiçbirini kanıtlamaz:

- Kaynakta token, gönderim denemesinden önce yazılır ve gönderim denemesi (başarı ya da hata) günlük satırı bırakır. İzlenen hesapta
  token görülmemesi ve günlükte gönderim kaydı bulunmaması, bu koşumda gönderim katmanının devreye girdiğine dair **kanıt olmadığını**
  gösterir. SMTP ya da sağlayıcı bu kanıtla neden olarak **ne doğrulanmış ne dışlanmıştır**; sağlayıcı tarafı ölçülmedi.
- Kaynakta hesap, adresin **birebir** yazımıyla aranır; eşleşme yoksa aynı başarı yanıtı döner, token yazılmaz ve günlük satırı
  oluşmaz. Gözlenen tablo bu dalla **uyumludur**; ama talebin API'ye ulaştığı ve gönderilen adres ölçülmediği için bu, koşumun
  nedeni olarak **kanıtlanmış değildir**. Talebin API'ye hiç ulaşmamış olması (kenar, tünel ya da tarayıcı tarafı) aynı tabloyu üretir
  ve dışlanmamıştır.
- **Web tarafı adayı (2026-10-02 eki).** Sıfırlama sayfası tarayıcıda devralınmadan (hydration) önce doldurulan adres API'ye **boş**
  gider; API aynı başarı yanıtını verir, sıfırlama kaydı ve e-posta oluşmaz. Bu davranış ayrı bir ölçümde üretim derlemesinde
  doğrulanmıştır (ölçülen sayfa dosyası canlı kaynakla aynıdır); **bu koşumda olduğu ölçülmedi**. Gözlenen tabloyla (başarı ekranı ·
  token yok · günlük satırı yok · e-posta yok) uyumludur ve dışlanmamıştır. Düzeltmesi web tarafındadır; #2884 bu sınıfı kapatmaz.
- Sıfırlama sayfası başarı ekranını kaynakta yalnız 2xx yanıtta gösterir; bu, owner beyanıyla birlikte "talep bir 2xx yanıt aldı"
  **çıkarımını** verir, makine ölçümü değildir.

Canlı ürün bu sessiz dallarda iz bırakmadığı için aynı deneme canlı R27 üzerinde tekrarlanırsa neden yine ölçülemeyebilir.

### 8.6 Ürün düzeltmesi (ayrı PR #2884; **merge edilmedi, canlıda değil**)

#2884 kaynakta doğrulanan bir kusur **sınıfını** kapatır (adres yalnız harf büyüklüğü ya da baş/son boşlukla farklı yazılınca hesabın
bulunamaması) ve sessiz dalları adres, token ve bağlantı içermeyen teşhis günlük satırlarıyla ölçülebilir yapar. **Bu koşumun nedeninin
o kusur olduğu kanıtlanmadı**; dolayısıyla #2884'ün bu koşumdaki sonucu gidereceği de kanıtlanmış değildir. Yeni denemede e-posta yine
ulaşmazsa, yamanın eklediği teşhis satırları API tarafındaki dalı (hesap yok · belirsiz · büro erişime kapalı · hesap talep sırasında
kapandı · alan metin değil · token üretildi) ayırt eder; talep API'ye hiç ulaşmıyorsa hiçbir satır oluşmaz ve bu da ayırt edici bir
ölçüm olur. PR'ın içeriği ve doğrulaması kendi açıklamasındadır. İlgili kısıtlı kayıt: SEC-PORTAL-REQ-01 (ayrıntı public repoya
yazılmaz). Düzeltme canlıya alınana kadar canlı davranış değişmez.

### 8.7 Yeni deneme

Bu koşum tekrarlanmaz ve otomatik ikinci Run yoktur. Yeni deneme için kesin işlem ve yetki listesi tek karar paketindedir:
`client-release-r27-r01/CLIENT-KALAN-ISLER-R01.md` §3.3 ve §11 KR-2. Her yolda yeni GO, alıcı adresi (yalnız konsol), tek gönderim onayı ve
ezme kararı gerekir.
