# ═══════════ EXTACC D-7 R01 PORTAL MESAJ AKIŞI + PORTAL ERİŞİM KAPANIŞI - OWNER BLOĞU (normal PowerShell; YÖNETİCİ GEREKMEZ) ═══════════
# R02 (2026-10-01): YALNIZ METİN (yorumlar, konsol çıktısı, istem metinleri) — kod/akış/pinler DEĞİŞMEDİ; kayıt alanı `revision` 'R01' kalır.
#          Run çıkış 5/6 Recover yetkisi değildir; Recover'ın canlı yazma kümesi gösterilir; beyan seçenekleri ana sayfa/özeti hata sayfasından ayırır.
#          R02 inceleme düzeltmeleri (yine yalnız metin): kalıntı satırının altındaki not, kanıttaki "sentetik tenant CLOSED" ifadesinin koşucunun
#          SABİT metni olduğunu ve kapanışın doğrulandığını göstermediğini söyler; Recover bitiş metni ikinci bir Recover için yol TANIMLAMAZ.
# R03 (2026-10-03): koşucu değişti (makbuz kurulumdan hemen sonra; Run kapanışında 401/403'te tek yeniden giriş; kapanış metinleri ölçülenden) →
#          PkgPins'teki koşucu pini + $ExpPackage güncellendi. Blokta değişenler: Run kapanış satırı parçaları kanıttaki verdict'lerden PASS / FAIL /
#          ÖLÇÜLMEDİ olarak kurulur (önceki SABİT "DB + yeni giriş + mevcut oturum mesaj ucunda reddi" metni yerine) + satır rengi notu; kalıntı
#          satırının altındaki not koşucunun yeni (ölçülen) kapanış özetini anlatır; Recover bitiş satırı 0 / 1 / 2 / 3 kodlarını yalnız ölçüleni
#          söyleyerek açıklar; Run'da kanıttaki kurulum durumu (setup) TAMAM değilse bilgi satırı gösterilir. Kapılar, mod sırası, node çağrısı,
#          çıkış kodları DEĞİŞMEDİ; `owner-block.json` `revision` alanı R01 kalır.
# R03-c (2026-10-03; owner talimatı: kapanış / Recover doğruluğu): koşucu yine değişti → koşucu pini + $ExpPackage güncellendi. Blokta yalnız METİN:
#          (a) Recover bitiş satırı, mevcut oturum reddinin (P7-C4L/D) Recover'da HER ZAMAN ölçülemediğini ve yeni giriş reddinin P7-C3L/D
#          satırlarından okunduğunu kodlardan ÖNCE, her kod için geçerli olarak yazar; 1 ve 2 neyin doğrulandığını adlandırır (portal DB kapanışı
#          ya da hesap yok + personel/dosya kapanışı). (b) Run çıkış 5/6 metni `-Mode Recover -ReceiptFile <makbuz>` önerisini YALNIZ kanıt
#          dizinindeki makbuz dosyası Recover'ın okuma kapısını geçiyorsa yazar (Get-ReceiptFileState); yoksa kanıttaki receipt nesnesinden yeni
#          makbuz dosyası yolu ya da (kanıtta da yoksa) SOMUT ENGEL yazılır. Kapılar, sıra, Recover okuma kapısı, çıkış kodları DEĞİŞMEDİ.
# R03-d (2026-10-04; R03-c bağımsız doğrulaması; D-6 R03-d ile aynı ilke): koşucu değişti → koşucu pini + $ExpPackage güncellendi. Blokta: (a) Recover
#          bitiş satırı kod açıklamalarını YALNIZ okunabilir kanıt VARKEN yazar (Get-RecoverEvidenceState: dosya + kayıt türü EXTACC-D7-RECOVER + kanıttaki
#          exitCode = süreç kodu); kanıt yoksa kırmızı "KAPANIŞ DOĞRULANMADI — kanıt yok …" (koşucu yakalanmamış hatayla kanıtsız 1 verebilir — D-6'da
#          ölçüldü; D-7'de aynı yapı); 3'ün metni ölçülenle ("P7-C2 / P7-C5 ölçüldü; P7-C2V FAIL değil (ÖLÇÜLEMEYEN olabilir)"), 2 / 1 buna atıf yapar.
#          (b) Run çıkış 5/6: makbuz dosyası kanıttaki son makbuz metniyle (recovery.makbuzJson) EŞİT değilse BAYAT sayılır ve ÖNERİLMEZ; yok / okunamıyor /
#          bayat → iki kabukta ölçülmüş TEK komut (kanıttaki makbuzJson → yeni makbuz dosyası) + AYRI owner onayıyla Recover. (c) Ürün bulgusu ADAYI
#          "ADAYIDIR" diye gösterilir. Kapılar, sıra, Recover okuma kapısı, node çağrısı, çıkış kodları DEĞİŞMEDİ.
# R03-e (2026-10-04; R03-d iki bağımsız doğrulaması, B1; D-6 R03-e ile aynı ilke): koşucu değişti (oturum 200'ünün tek sınıflaması; ölçülen kapatma metni;
#          token claim'i) → koşucu pini + $ExpPackage güncellendi. Blokta yalnız GÖSTERİM: kanıttaki portalClose.acikErisim (HTTP ölçümlerinden sonra portal
#          erişimi açık) ürün bulgusu satırından AYRI "PORTAL ERİŞİMİ: …" satırında gösterilir (birleşik tek satır değil). Kapılar, sıra, Recover okuma
#          kapısı, node çağrısı, çıkış kodları DEĞİŞMEDİ.
# R03-f (2026-10-04; R03-e iki bağımsız doğrulamasının MINOR bulguları; D-6 R03-f ile aynı ilke): koşucu değişti (P7-C1 açıklaması ölçülene indi; açık erişim
#          satırındaki Recover metni Run'ın kapatma çağrılarına bağlı — Recover'ın kapatabileceği kesin dille İDDİA EDİLMEZ; kısmi durum metinleri; karar sırası
#          T1 → TG → T3 → T0, TI yalnız a = b = c) → koşucu pini + $ExpPackage güncellendi. Blokta YALNIZ YORUM: ürün bulgusu ADAYI ve "PORTAL ERİŞİMİ:"
#          satırlarının yorumları R03-e/f karar tablosuna göre düzeltildi (bayat R03-d yorumu kaldırıldı). Gösterilen metin koşucudan gelir; kapılar, sıra,
#          Recover okuma kapısı, node çağrısı, çıkış kodları DEĞİŞMEDİ.
# R03-g (2026-10-04; R03-f iki bağımsız doğrulamasının MINOR kenarları; son tur; D-6 R03-g ile aynı ilke): koşucu değişti (Recover modunda açık erişim metni
#          ölçülene bağlı; JWT olarak okunamayan token → TJ; T2 a = c ≠ b dalında ALTINDA notu) → koşucu pini + $ExpPackage güncellendi. Blokta YALNIZ METİN
#          (G2): Invoke-RecoverMode bilgi metnindeki koşulsuz "yetkili uç çağrılır …: portal hesabı pasif + sürüm artışı, …" ifadesi koşula bağlandı ("çağrı 2xx
#          dönerse ürün şunları yazar: …; 401/403'te kapatma yapılmaz (sonuç Recover kanıtında …)"). Recover bitiş ekranı acikErisim'i göstermez (önceki tasarım;
#          metin kanıtta). Kapılar, sıra, Recover okuma kapısı, node çağrısı, çıkış kodları DEĞİŞMEDİ.
# R04 (2026-10-04; owner kararı madde 5 — "R04-recover-girdi"; D-6 R04 ile aynı ilke): (a) YENİ Recover girdisi `-RunEvidenceDir <tamamlanmış Run kanıt dizini>`:
#          makbuzu blok, owner'ın AYRI Recover onayından (bu modu ayrıca başlatması; blok bu onayı SORMAZ ve ÖLÇMEZ — değişmedi) SONRA, Run kanıtındaki
#          recovery.makbuzJson alanından Run kanıt dizininin DIŞINA (kardeş dizin) yazar ve Recover başlamadan doğrular (kaynak manifest/hash bağı + runId/kimlik
#          bağı + geri okuma + kaynağın değişmediği); biri tutmazsa Recover BAŞLAMAZ (DUR, 90). Tanımlar aşağıdaki "R04 RECOVER GİRDİSİ" bölümünde. `-ReceiptFile`
#          yolu KORUNDU. (b) Run çıkış 5/6 sonu: kanıtta makbuz metni varsa elle komut yerine `-Mode Recover -RunEvidenceDir '<kanıt dizini>'` ÖNERİLİR (AYRI owner
#          onayıyla; blok Recover'ı kendiliğinden BAŞLATMAZ). (c) Recover bitiş ekranı portal erişimini SON ÖLÇÜME göre AÇIK / KAPALI / ÖLÇÜLEMEDİ diye gösterir
#          (R03-g'deki "Recover bitiş ekranı acikErisim'i göstermez" sınırı kapandı). (d) Koşucu değişti (ret ölçütlerinde 5xx gözlem metni; verdict / çıkış kodu
#          aynı) → koşucu pini + $ExpPackage güncellendi. Kapılar, Run sırası, node çağrısı, çıkış kodları DEĞİŞMEDİ; Recover soru SORMAZ (değişmedi); Recover okuma
#          kapısına TEK ek: KULLANILMAZ diye işaretlenmiş bir Recover girdisi dizinindeki makbuz -ReceiptFile ile de reddedilir (başka -ReceiptFile davranışı değişmedi).
# R04-b (2026-10-04; aşama 2 — D-6 R04-b (a) ile aynı ilke): koşucu değişti → koşucu pini + $ExpPackage güncellendi: kanıttaki kurtarma adımı artık bu bloğun Run sonu
#          ekranıyla AYNI seçeneği gösterir (`-Mode Recover -RunEvidenceDir '<kanıt dizini>'`); Run kanıt dizininin İÇİNE makbuz yazdıran elle komut koşucudan
#          KALDIRILDI. Blokta YALNIZ METİN: Run sonu metnindeki "elle komut yerine" ifadesi buna göre değişti. D-7 koşucusu Recover'da makbuz dosyasına YAZMAZ
#          (kaynaktan + koşucu öz-testi Z19-b: makbuz baytları Recover'dan önce = sonra) → D-6'daki salt okunur bayrağın D-7'de karşılığı yoktur. Kapılar, sıra,
#          Recover okuma kapısı, node çağrısı, çıkış kodları DEĞİŞMEDİ.
# R04-c (2026-10-05; aşama 3 — odak doğrulamanın beş somut noktası; D-6 R04-c ile aynı ilke; koşucu, PkgPins ve $ExpPackage DEĞİŞMEDİ): K1: Recover bitiş ekranındaki
#          PORTAL ERİŞİMİ satırı DB KAPALI iken yalnız DB durumundan KURULMAZ — aynı Recover kanıtındaki yeni giriş reddi ölçütleri (P7-C3L yerel · P7-C3D dış) satıra
#          yazılır ve rengi belirler: ikisi PASS → yeşil "KAPALI (DB + yeni giriş reddi PASS)"; biri FAIL → kırmızı "DB'de kapalı AMA yeni giriş reddi FAIL (…) —
#          erişim kapalı SAYILMAZ"; aksi halde (ÖLÇÜLEMEYEN / satır yok — portal hesabı satırı DB'de yokken de: koşucu hesap yokken giriş reddini ölçmez) → sarı
#          "DB'de kapalı; yeni giriş reddi ÖLÇÜLEMEDİ (…)". K2: `-ReceiptFile` ile verilen makbuz, manifesti olan (tamamlanmış) bir kanıt dizininin İÇİNDEyse ve o
#          dizindeki kanıtta makbuz metni (recovery.makbuzJson) VARSA Recover BAŞLAMAZ (DUR, 90; `-RunEvidenceDir`'e yönlendirir); kanıtta makbuz metni yoksa bu
#          paketle tanımlı tek yol olduğu için izin verilir ama kanıt dizininin DEĞİŞECEĞİ Recover başında, bitişinde ve Run sonu ekranının ilgili dalında yazılır.
#          K3: `-RunEvidenceDir` yolunda makbuzun sha256'sı Recover kanıt dizini açılmadan ÖNCE ve node'dan HEMEN ÖNCE yeniden ölçülür;
#          RECOVER-GIRDI-KAYDI.json'a yazılan özetten farklıysa Recover BAŞLAMAZ (DUR, 90) ve Recover girdisi dizini KULLANILMAZ diye işaretlenir; Recover'dan
#          SONRA makbuz yeniden ölçülür ve "RECOVER GİRDİSİ (makbuz): … DEĞİŞMEDİ / DEĞİŞTİ" satırıyla gösterilir (D-6 R04-b satırının ikizi; çıkış kodu değişmez).
#          K4: manifest yokken DUR metni kalan yolu ve kanıt dizinindeki makbuz dosyasının ölçülen durumunu yazar. K5: makbuz yazımından sonraki adımlarda
#          BEKLENMEYEN istisna da (ör. okuma kapısında dosya kilidi) KULLANILMAZ işareti + DUR üretir. Kapılar, Run sırası, node çağrısı, çıkış kodları DEĞİŞMEDİ;
#          Recover soru SORMAZ (değişmedi).
# MODLAR
#   -Mode Preflight  SALT OKUMA: tüm kapılar (canlı dist = R27 pini); GO sorulmaz; kanıt/ortam/DB/canlı dosya yazılmaz; koşucu çağrılmaz (yalnız `node --version`). Kapılardaki `git fetch` yerel repodaki uzak izleme ref'lerini günceller (iş verisi değildir).
#   -Mode QrTest     Canlı veri YOK: portal MESAJ sayfasının QR'ı yerel konsolda gösterilir (d7-qr-test.js); owner telefonla okutur.
#   -Mode Run        TEK SEFERLİK canlı koşum: kapılar → bağımsız pencere teyidi → canlı veri işleme onayı → GO (yerel) → GO defteri
#                    (yalnız sha256, koşumdan ÖNCE) → koşum (mesaj ölçümleri; konsol: QR + giriş bilgisi) → ekran temizliği →
#                    owner beyanı (ayrı dosya) → kanıt manifesti.
#   -Mode Recover    Yalnız kapanış (portal + personel/dosya; mesaj satırları SİLİNMEZ); `-ReceiptFile <makbuz>` YA DA (R04) `-RunEvidenceDir <tamamlanmış Run kanıt dizini>` (biri) zorunlu; GO sorulmaz; kabul ölçütleri koşulmaz.
#                    Run'ın koşucu İÇİNDEKİ kendi kapanış adımlarından AYRI bir işlemdir: otomatik DEĞİLDİR; Run çıkış 5/6 Recover yetkisi
#                    DEĞİLDİR — önce kanıt incelenir, açık kalan kaynaklar bildirilir, Recover yalnız AYRI owner onayıyla, BİR KEZ başlatılır.
#                    "BİR KEZ" kodla ZORLANMAZ: blok ve koşucu ikinci bir Recover'ı engellemez (GO sorulmaz, defter tutulmaz); kural owner disiplinidir.
#                    Recover'ın çıkış kodu yeni bir Recover için yetki DEĞİLDİR; ikinci bir Recover bu paketle TANIMLI DEĞİLDİR, owner kararı gerektirir.
#                    Recover CANLIYA YAZAR (koşucu kaynağından okundu; canlıda koşulmadı): portal hâlâ açıksa makbuzdaki sentetik personel GEÇİCİ
#                    olarak yeniden aktifleştirilir ve parola özeti yeniden yazılır → yetkili uçla kapatma (portal pasif + sürüm artışı + kapatma
#                    audit satırı); portal DB'de kapalı durumdaysa (bu kapatmayla ya da önceden) pasif portal hesabına YALNIZ ölçüm için yeni
#                    rastgele parola özeti yazılır; ardından personel/dosya kapanışı (iki sentetik tenantın kullanıcıları pasif + sürüm artışı,
#                    açık dosyalar CLOSED). Tenant kaydı değişmez. Aynı liste Recover başlarken konsolda gösterilir (yalnız bilgi; soru yok).
# ÖN KOŞUL: canlı API dist'i R27 olmalı (D-5 ile aynı pin). Salt okuma kapıları (paket pinleri, dist pini, .env pini) TÜM MODLARDA
#          (Preflight/QrTest/Run/RECOVER dahil) mod dalından ÖNCE koşar: R26 (A8B17A38) ya da başka bir dist ile blok her modda DURUR.
#          Run 5/6 ile bittikten sonra canlı dist değişirse (ör. geri dönüş) Recover bu bloktan ÇALIŞMAZ → CLIENT kararı (belge §9/§10).
# YAPMAZ : e-posta/SMS (mesaj akışı kaynakta gönderim üretmez; koşucu forgot/reset/change-password ve belge uçlarını çağırmaz) ·
#          dış admin uçları (D7-5 = D-8 kapsamı) · mesaj/bildirim silme · .env/görev/Caddy/tünel/DNS değişikliği · otomatik tekrar · otomatik Recover.
# SIR    : DB URL, personel parolası, geçici portal parolası, GO ref ve token'ları bu blok ve koşucu kendi kanıt/log dosyalarına YAZMAZ
#          (GO için deftere yalnız sha256; öz-test ortamında ölçülen: blok R-9 GO/personel parolası, koşucu S-1 parolalar/token/DB URL/GO).
#          AYRIM: parola ÖZETLERİ (hash) canlı DB'de sentetik hesaplarda durur; canlı API'nin kendi uygulama günlüğünün içeriği bu blokla
#          ÖLÇÜLMEZ. Giriş bilgisi yalnız bu konsol penceresine çizilir; pencereyi kaydeden bir terminal KULLANMAYIN; koşum sonunda pencereyi
#          kapatın. Telefondan gönderilen mesajın içeriği koşucu kanıtına yazılmaz (yalnız sayı); mesaj satırının kendisi canlı DB'de KALIR.
# TOPOLOJİ: public portal adresi canlı .env'den okunur ve owner'ın konsola yazdığı R05 adresiyle doğrulanır; kanıt kökü $env:USERPROFILE'a görelidir
#          (bu dosyada canlı alan adı / yerel kullanıcı yolu literali yoktur). Canlı kök ($Rel) tek yerde tanımlıdır.
# ÇIKIŞ  : node kodu değiştirilmeden taşınır · 90 kapıda durdu · 91 node başlatılamadı / kod alınamadı · 7 kanıt yok.
param(
  [ValidateSet('Preflight', 'QrTest', 'Run', 'Recover')] [string]$Mode = 'Preflight',
  [string]$ReceiptFile = '',
  [string]$RunEvidenceDir = ''
)
$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $false

$Repo     = 'D:\Development\HUKUK_YAZILIMI\project'
$Gov      = Join-Path $Repo 'project\docs\governance'
$Sc       = Join-Path $Gov 'client-extacc-portal-d7-r01\scripts'
$Rel      = 'C:\Development\HUKUK_YAZILIMI\HY_W4_RELEASE23\project'
$EnvFile  = Join-Path $Rel 'apps\api\.env'
$LiveDist = Join-Path $Rel 'apps\api\dist\apps\api\src'
$EvRoot   = Join-Path $env:USERPROFILE 'Documents\CLIENT-EVIDENCE-20260911'   # kanıt kökü kullanıcı profiline göreli (public belgeye yerel kullanıcı yolu yazılmaz)
$GoLedger = Join-Path $EvRoot 'extacc-d7-goref-ledger.txt'
$Api      = 'http://127.0.0.1:8080/api'

# ---- PİNLER (uyuşmazlık OTOMATİK KABUL EDİLMEZ; blok durur) ----
$ExpLiveDist = 'E28A6863CF109A1A3AE1F53E096D5F5C2037E382EF2D8D3EC87FEE3B827E5134'   # R27 dist (D-5 ile aynı ön koşul); R26 canlı A8B17A38 ile DURUR
$ExpEnvSha   = '5C776BBEEE018EA5CC8192378D42D742FD4ABC1B6D0E9A3EA671CF463206908D'   # canlı .env (H5 sonrası)
$ExpBaseUrl  = $null   # R05 public portal adresi: canlı .env PUBLIC_PORTAL_BASE_URL'den okunur (Invoke-ReadOnlyGates, biçim kapısı) ve Run/QrTest'te owner'ın konsola yazdığı R05 adresiyle birebir doğrulanır (Confirm-PortalBaseUrlR05). Public repoya host literali YAZILMAZ.
# Koşucunun YÜKLEDİĞİ tüm governance dosyaları + D-7 QR denemesi (require ağacı ölçüldü).
$PkgPins = [ordered]@{
  'client-extacc-portal-d7-r01\scripts\d7-portal-messages-live-run.js'                = '20DC82E2EE807F480E02BF9EC4BAF409F847489972B466D16955BB4F5DF51965'
  'client-extacc-portal-d7-r01\scripts\d7-qr-test.js'                                 = '15E6431396E978423BAE72F3B7511F3972F12847EF96AA02C12937E0F2233E15'
  'client-extacc-intake-chain-r01\scripts\extacc-display.js'                          = 'F257188DF66C429472C214D38D965C1E6F5A2EA490D348369AC68C5DC6F26867'
  'client-extacc-intake-chain-r01\scripts\vendor\qrcode-generator-1.4.4\qrcode.js'    = '18AE399F81182BC9DE916E9C77B195DF20CC58D6F2D55A62B085A299F1BF1780'
  'client-h5-intake-url-r01\scripts\h5-url-live-run.js'                               = 'F2D0975DC9F9D148E4C889472FA11AE6A873A6BDF577C36657ED9BCB4FF9C359'
  'client-live-acceptance-i13-r01\scripts\i13-lib.js'                                 = '59BA7360F270AB66D0A892659A7569AFF1800D65B49415EF5FAD3B84DFEDD385'
  'client-live-acceptance-i12-r01\scripts\i12-live-identity.js'                       = '9516E462CFFD3B22FD253F556A7F1853C6F021B175075449BD7945CCEF36774F'
  'client-acceptance-runners-i3-r01\scripts\i3-lib.js'                                = '56F3788E9F84746CFFEE384D8C18B9B9A28130CC8E2285F9570AB69CC6EE74A3'
  'client-acceptance-harness-r01\scripts\ah-lib.js'                                   = 'DF882DB7F33A667092F126F01E518C1A8292C8C0B3C4C039BF73D71F3ACCBFD7'
}
$ExpPackage = '16D95F54DB430D3E113DA86DF36719BC68C19DD934E8D32170D44682014AD1C5'
$SecretEnv  = @('AH_DATABASE_URL', 'AH_PRISMA_ROOT', 'AH_BCRYPT_PATH', 'D7_LIVE_CONFIRM', 'D7_RECOVER_CONFIRM', 'D7_LIVE_GO_REF',
                'D7_RUNID', 'D7_MODE', 'D7_EXPECT_DB', 'D7_EXPECT_TENANT_SLUG', 'D7_API_BASE', 'D7_EXPECT_API',
                'D7_EXPECT_BASE_URL', 'D7_LIVE_LOGIN_PW', 'D7_RECEIPT', 'D7_EVID_FILE', 'D7_DISPLAY', 'EXA_QRTEST_URL', 'D7_TEST_DISPLAY_SINK',
                'D7_WAIT_MS', 'D7_POLL_MS', 'D7_VIEW_MS', 'D7_HTTP_TIMEOUT_MS', 'D7_CALL_TIMEOUT_MS', 'D7_LATE_CREATE_MS')
# CANLI SÜRELER — açıkça kurulur; pencereden devralınan değerler başta ve sonda SİLİNİR (koşucu da canlı DB'de bunları zorlar).
$LiveParams = [ordered]@{ D7_WAIT_MS = '1200000'; D7_POLL_MS = '5000'; D7_VIEW_MS = '120000'; D7_HTTP_TIMEOUT_MS = '15000'; D7_CALL_TIMEOUT_MS = '30000'
                          D7_LATE_CREATE_MS = '120000' }
$script:LastNodeRc = $null

function Fail([string]$m) { Write-Host "DUR - $m" -ForegroundColor Red; throw "EXTACC-D7-DUR: $m" }
function Sha([string]$p) { (Get-FileHash -LiteralPath $p -Algorithm SHA256).Hash.ToUpperInvariant() }
function ShaText([string]$t) { ([BitConverter]::ToString([Security.Cryptography.SHA256]::Create().ComputeHash([Text.Encoding]::UTF8.GetBytes($t))) -replace '-', '').ToUpperInvariant() }
function Digest([System.Collections.Generic.List[string]]$lines) {
  $lines.Sort([StringComparer]::Ordinal); $sb = [System.Text.StringBuilder]::new(); foreach ($l in $lines) { [void]$sb.Append($l) }
  ShaText $sb.ToString()
}
function Invoke-RepoGit { $fwd = $Repo -replace '\\', '/'; & git.exe -c "safe.directory=$fwd" -C $Repo @args }
function EnvValue([string]$key) {
  $hits = @(); foreach ($l in [IO.File]::ReadAllLines($EnvFile)) { if ($l -match ("^\s*" + [regex]::Escape($key) + "\s*=\s*(.*)$")) { $hits += $Matches[1].Trim().Trim('"').Trim("'") } }
  if ($hits.Count -ne 1) { Fail "$key geçiş sayısı $($hits.Count) (1 bekleniyor)" }
  return $hits[0]
}
function Clear-SecretEnv { foreach ($k in $SecretEnv) { Remove-Item "Env:$k" -ErrorAction SilentlyContinue } }
# R05 public portal adresi (inceleme: canlı host literali public repoya yazılmaz). Biçim kapısı: https:// + yalnız alan adı (yol/port/sorgu/IP/localhost YOK).
function Assert-PortalBaseUrl([string]$u) {
  if ($u -notmatch '^https://[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$' -or $u -match '^https://\d+(\.\d+)+$') { Fail 'PUBLIC_PORTAL_BASE_URL biçimi https://<alan adı> olmalı (yol/port/sorgu/IP/localhost KABUL EDİLMEZ) — dış ölçüm ve QR bu adresle yapılır' }
  return $u
}
# R05 kontrolü: owner adresi konsola yazar; canlı .env değeriyle (kapılarda okunan) birebir eşleşmezse DUR (GO sorulmaz; GO defteri yazılmaz, koşucu çağrılmaz — öz-test K-6; QrTest'te QR gösterilmez — Q-R05).
function Confirm-PortalBaseUrlR05 {
  if (-not $ExpBaseUrl) { Fail 'public portal adresi çözülmedi (salt okuma kapıları koşmadı) — koşum başlamaz' }
  $a = [string](Read-Answer 'R05 kararındaki public portal adresini yazın (https://... ; canlı .env PUBLIC_PORTAL_BASE_URL ile BİREBİR eşleşmeli)')
  if ($a.Trim().TrimEnd('/').ToLowerInvariant() -cne $ExpBaseUrl.ToLowerInvariant()) { Fail 'owner''ın yazdığı R05 adresi canlı .env PUBLIC_PORTAL_BASE_URL ile eşleşmiyor — koşum başlamadı' }
}
function Read-GoRef { return (Read-Host 'EXTACC D-7 canlı GO ref (OWNER-GO-CLIENT-EXTACC-D7-YYYYMMDD-RNN)') }
function Read-Answer([string]$q) { return (Read-Host $q) }
function Clear-OwnerScreen { try { [Console]::Clear() } catch { }; try { [Console]::Write([char]27 + '[3J') } catch { } }

function Resolve-NodeExe {
  $cmd = @(Get-Command -Name 'node' -CommandType Application -ErrorAction SilentlyContinue)
  if ($cmd.Count -lt 1) { Fail 'node çalıştırılabilir dosyası PATH''te bulunamadı' }
  $exe = [string]$cmd[0].Source
  if (-not $exe -or -not (Test-Path -LiteralPath $exe -PathType Leaf)) { Fail "node yolu bir dosya değil: [$exe]" }
  $old = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
  $ver = $null; $launchError = $null
  try {
    $global:LASTEXITCODE = -999
    try { $ver = & $exe --version 2>$null } catch { $launchError = $_.Exception.GetType().Name }
    $vc = $global:LASTEXITCODE
  } finally { $ErrorActionPreference = $old }
  if ($launchError) { Fail "node başlatılamadı (--version): $launchError · $exe" }
  if (-not ($vc -is [int]) -or $vc -eq -999 -or $vc -ne 0) { Fail "node --version çıkış kodu geçersiz: [$vc] · $exe" }
  $v = ("$ver").Trim()
  if ($v -notmatch '^v\d+\.\d+\.\d+$') { Fail "node --version beklenmeyen çıktı · $exe" }
  return [pscustomobject]@{ Exe = $exe; Version = $v }
}

# ---------------------------------------------------------------- SALT OKUMA KAPILARI
function Invoke-ReadOnlyGates {
  foreach ($k in 'NODE_OPTIONS', 'NODE_TLS_REJECT_UNAUTHORIZED', 'NODE_EXTRA_CA_CERTS') {
    if (Test-Path "Env:$k") { Fail "$k ortamda tanımlı — koşum davranışı değişebilir; kapatıp yeni pencere açın" }
  }
  Invoke-RepoGit fetch -q origin
  $head = (Invoke-RepoGit rev-parse HEAD).Trim(); $orig = (Invoke-RepoGit rev-parse origin/main).Trim()
  if ($head -ne $orig) { Fail "main origin/main ile SENKRON DEĞİL ($head vs $orig)" }
  if (Invoke-RepoGit status --porcelain --untracked-files=no) { Fail 'main checkout''ta takipli KİRLİ dosya var' }
  $pk = [System.Collections.Generic.List[string]]::new()
  foreach ($f in $PkgPins.Keys) {
    $p = Join-Path $Gov $f
    if (-not (Test-Path -LiteralPath $p)) { Fail "paket dosyası yok: $f" }
    $h = Sha $p
    if ($h -ne $PkgPins[$f]) { Fail "DOSYA PİNİ uyuşmuyor: $f ($h)" }
    $pk.Add(($f -replace '\\', '/') + [char]0 + $h + "`n")
  }
  $gotPkg = Digest $pk
  if ($gotPkg -ne $ExpPackage) { Fail "PAKET DIGEST uyuşmuyor: $gotPkg" }
  $root = (Resolve-Path -LiteralPath $LiveDist).Path.TrimEnd('\'); $dl = [System.Collections.Generic.List[string]]::new(); $n = 0
  foreach ($f in Get-ChildItem -LiteralPath $root -Recurse -File -Force) { $dl.Add($f.FullName.Substring($root.Length + 1).Replace('\', '/') + [char]0 + (Sha $f.FullName) + "`n"); $n++ }
  $gotDist = Digest $dl
  if ($gotDist -ne $ExpLiveDist) { Fail "CANLI DIST uyuşmuyor (D-7 için R27 dist ŞART; R26 ise önce yayın): $gotDist ($n dosya)" }
  $envSha = Sha $EnvFile
  if ($envSha -ne $ExpEnvSha) { Fail "CANLI .env pini uyuşmuyor: $envSha" }
  $baseUrl = Assert-PortalBaseUrl (EnvValue 'PUBLIC_PORTAL_BASE_URL')
  $script:ExpBaseUrl = $baseUrl   # R05 eşleşmesi Run/QrTest'te owner girdisiyle ölçülür (Confirm-PortalBaseUrlR05); dış ölçüm ve QR bu adresle yapılır
  $lis = @(Get-NetTCPConnection -State Listen -LocalPort 8080 -ErrorAction SilentlyContinue)
  if ($lis.Count -ne 1) { Fail "8080 dinleyici sayısı $($lis.Count) (1 bekleniyor)" }
  $foreign = @(Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -match 'i1\d-|i3-sink|i3-start-api|f04-|h5-url-|extacc-|d4-portal-|d5-portal-|d6-portal-|d7-portal-|d8-staff-' })
  if ($foreign.Count -gt 0) { Fail "başka kabul süreci çalışıyor: $($foreign.ProcessId -join ',')" }
  $launcher = [IO.File]::ReadAllLines('C:\Ops\hukuk\logs\api\launcher.log') | Where-Object { $_ -match 'db identity ok' } | Select-Object -Last 1
  if ($launcher -notmatch 'host=127\.0\.0\.1 port=5432 db=hukuk_db') { Fail 'canlı API DB kimliği beklenmedik' }
  $node = Resolve-NodeExe
  $chain = Get-ExternalChainState
  return [ordered]@{ head = $head; pkg = $gotPkg; dist = $gotDist; distFiles = $n; envSha = $envSha; apiPid = $lis[0].OwningProcess
                     baseHost = ([uri]$baseUrl).Authority; chain = $chain
                     caddyLoopback = ($chain.loopbackCount -ge 1 -and -not $chain.otherAddresses); cloudflaredRunning = ($chain.cloudflaredStatus -eq 'Running')
                     nodeExe = $node.Exe; nodeVersion = $node.Version }
}
function Get-ExternalChainState {
  $all = @(Get-NetTCPConnection -State Listen -LocalPort 8081 -ErrorAction SilentlyContinue)
  $loop = @($all | Where-Object { $_.LocalAddress -eq '127.0.0.1' })
  $other = @($all | Where-Object { $_.LocalAddress -ne '127.0.0.1' } | ForEach-Object { [string]$_.LocalAddress } | Sort-Object -Unique)
  $svc = Get-CimInstance Win32_Service -Filter "Name='HY-Caddy'" -ErrorAction SilentlyContinue
  $cfd = Get-Service -Name 'Cloudflared' -ErrorAction SilentlyContinue
  return [pscustomobject]@{
    loopbackCount = $loop.Count; otherAddresses = ($other -join ','); loopbackPids = (@($loop | ForEach-Object { [int]$_.OwningProcess } | Sort-Object -Unique) -join ',')
    caddyServiceState = $(if ($svc) { [string]$svc.State } else { 'YOK' }); caddyServicePid = $(if ($svc) { [int]$svc.ProcessId } else { 0 })
    cloudflaredStatus = $(if ($cfd) { [string]$cfd.Status } else { 'YOK' }) }
}
function Assert-ExternalChain($s) {
  if (-not $s) { Fail 'dış zincir ölçülemedi' }
  if ([int]$s.loopbackCount -lt 1) { Fail 'Caddy 127.0.0.1:8081 dinleyicisi YOK' }
  if ($s.otherAddresses) { Fail "8081 loopback DIŞINDA da dinliyor: $($s.otherAddresses)" }
  if ($s.caddyServiceState -ne 'Running') { Fail "HY-Caddy servisi çalışmıyor ($($s.caddyServiceState))" }
  if ([string]$s.loopbackPids -ne [string]$s.caddyServicePid) { Fail "8081 dinleyicisi HY-Caddy servisine ait değil (dinleyici pid=$($s.loopbackPids) servis pid=$($s.caddyServicePid))" }
  if ($s.cloudflaredStatus -ne 'Running') { Fail "Cloudflared servisi çalışmıyor ($($s.cloudflaredStatus))" }
}
function Assert-LocalConsole {
  if ($Host.Name -ne 'ConsoleHost') { Fail "konsol host'u değil ($($Host.Name)) — bağımsız bir PowerShell penceresi kullanın" }
  if ([Console]::IsOutputRedirected) { Fail 'konsol çıktısı yönlendirilmiş — giriş bilgisi gösterilemez' }
}

function Set-RunEnv([string]$runId, [string]$evDir) {
  $env:AH_DATABASE_URL = EnvValue 'DATABASE_URL'
  $env:AH_PRISMA_ROOT = Join-Path $Rel 'node_modules\.pnpm\@prisma+client@5.22.0_prisma@5.22.0\node_modules\@prisma\client'
  $env:AH_BCRYPT_PATH = Join-Path $Rel 'node_modules\.pnpm\bcrypt@5.1.1\node_modules\bcrypt'
  $env:D7_RUNID = $runId; $env:D7_EXPECT_DB = 'hukuk_db'; $env:D7_API_BASE = $Api; $env:D7_EXPECT_API = $Api
  if (-not $ExpBaseUrl) { Fail 'public portal adresi çözülmedi — koşum başlamaz' }
  $env:D7_EXPECT_BASE_URL = $ExpBaseUrl
  $rb = New-Object byte[] 18; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($rb)
  $env:D7_LIVE_LOGIN_PW = 'D7S!' + [Convert]::ToBase64String($rb).TrimEnd('=').Replace('+', '-').Replace('/', '_'); $rb = $null
  $env:D7_EVID_FILE = Join-Path $evDir 'd7-evidence.json'
  if (-not $LiveParams -or $LiveParams.Count -ne 6) { Fail 'canlı süre tablosu ($LiveParams) eksik — koşum başlamaz' }
  foreach ($k in $LiveParams.Keys) { Set-Item -Path "Env:$k" -Value $LiveParams[$k] }   # canlı süreler AÇIKÇA
}
function Invoke-Node([string]$exe, [string]$scriptPath, [string]$logFile) {
  $old = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
  $rc = -999; $launchError = $null
  try {
    $global:LASTEXITCODE = -999
    try { & $exe $scriptPath *> $logFile } catch { $launchError = $_.Exception.GetType().Name }
    $rc = $global:LASTEXITCODE
  } finally { $ErrorActionPreference = $old }
  if ($launchError) { Write-Host "DUR - node BAŞLATILAMADI ($launchError) · çıkış 91" -ForegroundColor Red; $script:LastNodeRc = 91; return 91 }
  if (-not ($rc -is [int]) -or $rc -eq -999) { Write-Host "DUR - node çıkış kodu ALINAMADI: [$rc] · çıkış 91" -ForegroundColor Red; $script:LastNodeRc = 91; return 91 }
  $script:LastNodeRc = [int]$rc
  return [int]$rc
}
function Complete-NodeRc([object]$rc, [string]$evidFile) {
  if (-not ($rc -is [int])) { return 91 }
  if ($rc -eq 0 -and -not (Test-Path -LiteralPath $evidFile -PathType Leaf)) { Write-Host 'DUR - node 0 döndü ama sonuç kanıtı YOK · çıkış 7' -ForegroundColor Red; return 7 }
  return $rc
}
function Assert-FreshEvidence([string]$evidFile) {
  if (Test-Path -LiteralPath $evidFile) { Fail "sonuç kanıtı dosyası koşumdan ÖNCE zaten var: $evidFile" }
}
function Write-Manifest([string]$evDir) {
  Get-ChildItem -LiteralPath $evDir -File | Where-Object Name -ne 'SHA256-MANIFEST.txt' | Sort-Object Name |
    ForEach-Object { "$(Sha $_.FullName)  $($_.Name)" } | Set-Content -LiteralPath (Join-Path $evDir 'SHA256-MANIFEST.txt') -Encoding ASCII
}
# Canlı veri işleme — Run'dan ÖNCE açıkça sunulur; "EVET" yazılmazsa GO sorulmaz, GO defteri yazılmaz ve koşucu çağrılmaz (öz-test K-3).
# Metindeki kalemler paket belgesi §8'de ("canlıda oluşacak kayıtlar") de geçer (öz-test G-2: 10 kalem iki yerde); §8 ek ayrıntı taşır. Kaynaktan okunan ile ölçülen ayrı yazılır.
function Confirm-LiveDataProcessing {
  Write-Host ''
  Write-Host 'CANLI VERİ İŞLEME — onayınız gerekiyor:' -ForegroundColor Yellow
  Write-Host '  Koşucu canlı DB''de bu koşum için İKİ yeni sentetik tenant açar (ah-<runId> ve yabancı ah-<runId>-x) ve şu kayıtları yazar:'
  Write-Host '  sentetik personel kullanıcıları (profil ve yetki kayıtlarıyla), sentetik müvekkiller (hedef tenantta iki, yabancı tenantta bir),'
  Write-Host '  hedef tenantta iki dosya + bir borçlu, yabancı tenantta bir dosya, sentetik müvekkile BİR portal hesabı (.invalid adres; e-posta YOK),'
  Write-Host '  PortalMessage satırları (koşucu: müvekkil ×2 + personel ×2; telefondan gönderirseniz +1) ve PortalNotification satırları (personel yanıtı başına 1).'
  Write-Host '  Ürünün kendi yazdıkları (kaynaktan okundu): portal erişimi açma/kapatma audit satırları, portal giriş sayacı / son giriş zamanı ve canlı API'
  Write-Host '  uygulama günlüğünde portal hesabı / portal girişi / mesaj gönderimi satırları (maskeli sentetik adres ya da müvekkil kimliği ile).'
  Write-Host '  Kaynaktan okundu: mesaj akışı e-posta/SMS üretmez. API günlüğünün tam içeriği bu blokla ÖLÇÜLMEZ.'
  Write-Host '  Kapanış: portal hesabı pasif + sürüm artırılır, erişim kapalı, personel pasif, dosyalar CLOSED. Tenant yaşam döngüsü DEĞİŞMEZ'
  Write-Host '  (tenant kaydı kapatılmaz; hedeflenen kapanış = dosyalar CLOSED + personel pasif + portal pasif; sonuç kanıttaki U-CLOSE ve P7-C* satırlarından okunur).'
  Write-Host '  MESAJ ve BİLDİRİM SATIRLARI SİLİNMEZ (ürünte silme ucu yok); kanıtta "saklandı: n satır" olarak raporlanır.'
  Write-Host '  Diğer tenantlar için ölçülen yalnız U-ISO''dur: tenant başına kullanıcı ve müvekkil SAYISI önce/sonra aynı (içerik karşılaştırılmaz).'
  $a = Read-Answer 'Bu işlemeyi onaylıyor musunuz? Onay için büyük harfle EVET yazın'
  if ($a -cne 'EVET') { Fail 'canlı veri işleme onaylanmadı — koşum başlamadı' }
}
# R03-c: Run sonu metni Recover komutunu YALNIZ makbuz dosyası Recover'ın okuma kapısını geçiyorsa önerir — Invoke-RecoverMode ile aynı denetim
# (dosya var + JSON + kayıt türü + runId biçimi). Kimlik bağı (DB) koşucunun Recover'ında ölçülür; burada ölçülmez. Salt okuma; dosyaya yazmaz.
function Get-ReceiptFileState([string]$path, [object]$expectedJson = $null) {
  if (-not $path -or -not (Test-Path -LiteralPath $path -PathType Leaf)) { return [pscustomobject]@{ usable = $false; stale = $false; why = 'YOK' } }
  $j = $null
  try { $j = Get-Content -Raw -Encoding UTF8 -LiteralPath $path | ConvertFrom-Json } catch { return [pscustomobject]@{ usable = $false; stale = $false; why = 'OKUNAMIYOR (okunamadı / JSON değil)' } }
  if (-not $j -or $j.record -ne 'EXTACC-D7-SETUP-RECEIPT' -or [string]$j.runId -notmatch '^[0-9a-f]{8}$') { return [pscustomobject]@{ usable = $false; stale = $false; why = 'OKUNAMIYOR (kayıt türü / runId tanınmadı)' } }
  # R03-d (m7): kanıttaki son makbuz metniyle (recovery.makbuzJson) METİN eşitliği (BOM hariç). Eşit değilse dosya BAYATtır: makbuzun sonraki bir yazımı
  # başarısız olmuştur ve dosya sonradan eklenen kimlikleri (ör. runnerMessageIds) içermeyebilir — önerilmez. Kanıtta metin yoksa güncellik ÖLÇÜLEMEZ (yazılır).
  if ($null -ne $expectedJson) {
    $txt = [IO.File]::ReadAllText($path, [Text.UTF8Encoding]::new($false))
    if ($txt.Length -gt 0 -and $txt[0] -eq [char]0xFEFF) { $txt = $txt.Substring(1) }
    if ($txt -cne [string]$expectedJson) { return [pscustomobject]@{ usable = $false; stale = $true; why = 'BAYAT (kanıttaki son makbuz metniyle — recovery.makbuzJson — EŞİT DEĞİL: makbuzun sonraki bir yazımı başarısız olmuş; sonradan eklenen kimlikleri içermeyebilir → bu dosyayla Recover eksik kapanış yapabilir; yazma hatası kanıttaki receiptWriteError alanında)' } }
    return [pscustomobject]@{ usable = $true; stale = $false; why = 'VAR — kanıttaki son makbuz metniyle (recovery.makbuzJson) EŞİT' }
  }
  return [pscustomobject]@{ usable = $true; stale = $null; why = 'VAR — güncelliği ÖLÇÜLEMEDİ (kanıtta recovery.makbuzJson yok ya da kanıt okunamadı)' }
}
# R03-d (M2): Recover kanıtı OKUNABİLİR mi — dosya var + JSON + kayıt türü EXTACC-D7-RECOVER + kanıttaki exitCode = süreç çıkış kodu. Kod açıklamaları
# (0/1/2/3/5/6) yalnız bu durumda geçerlidir: koşucu yakalanmamış hatayla (ör. kütüphane yüklenemedi) kanıt YAZMADAN 1 ile çıkabilir (D-6'da bağımsız
# doğrulamada ölçüldü; D-7 koşucusunda aynı yapı: loadPrisma try dışında) ve bu durumda hiçbir kapanış ölçülmemiştir. Salt okuma.
function Get-RecoverEvidenceState([string]$evidFile, [object]$rc) {
  if (-not (Test-Path -LiteralPath $evidFile -PathType Leaf)) {
    $w = if ("$rc" -eq '1') { 'kanıt yok; koşucu yakalanmamış hatayla bitti, hiçbir kapanış ölçülmedi' } else { "kanıt yok (d7-evidence.json yazılmadı; çıkış $rc) — hiçbir kapanış bu kanıttan ölçülmüş DEĞİL" }
    return [pscustomobject]@{ valid = $false; state = 'YOK'; why = $w }
  }
  $ev = $null
  try { $ev = Get-Content -Raw -Encoding UTF8 -LiteralPath $evidFile | ConvertFrom-Json } catch { $ev = $null }
  if (-not $ev -or $ev.record -ne 'EXTACC-D7-RECOVER') { return [pscustomobject]@{ valid = $false; state = 'OKUNAMIYOR'; why = 'kanıt dosyası var ama OKUNAMIYOR (JSON değil ya da kayıt türü EXTACC-D7-RECOVER değil) — kapanış kanıttan okunamadı' } }
  if ("$($ev.exitCode)" -ne "$rc") { return [pscustomobject]@{ valid = $false; state = 'KOD_FARKLI'; why = "kanıttaki exitCode ($($ev.exitCode)) süreç çıkış koduyla ($rc) EŞİT DEĞİL — kod açıklaması bu kanıta dayanmaz" } }
  return [pscustomobject]@{ valid = $true; state = 'VAR'; why = 'VAR' }
}
# Kapanış durumu kanıttan okunur; metin KOŞULSUZ "kapatıldı" demez.
function Get-ClosureStatus([string]$evidFile, [object]$rc) {
  $st = [ordered]@{ verified = $false; text = ''; finding = $null; waitVerdict = $null; keptVerdict = $null; keptText = $null; reply2Verdict = $null; residue = $null
                    setupDurum = $null; setupAsama = $null; setupMakbuz = $null; receiptInEvidence = $false; makbuzJson = $null; findingCandidate = $false; acikErisim = $null }
  $ev = $null
  try {
    $ev = Get-Content -Raw -Encoding UTF8 -LiteralPath $evidFile | ConvertFrom-Json   # node kanıtı UTF-8 (BOM'suz); WinPS 5.1 varsayılanı ANSI
    $st.receiptInEvidence = [bool]($ev.receipt -and $ev.receipt.record -eq 'EXTACC-D7-SETUP-RECEIPT')   # R03-c: makbuz dosyası yoksa kullanılabilir yolun kaynağı
    $st.makbuzJson = $(if ($ev.recovery -and $ev.recovery.makbuzJson -is [string]) { [string]$ev.recovery.makbuzJson } else { $null })   # R03-d: makbuzun birebir JSON metni
    $st.findingCandidate = [bool]($ev.portalClose -and $ev.portalClose.sessionVersion -and $ev.portalClose.sessionVersion.sinif -eq 'ADAY')   # R03-d: ürün bulgusu ADAYI
    $st.acikErisim = $(if ($ev.portalClose -and $ev.portalClose.acikErisim -is [string]) { [string]$ev.portalClose.acikErisim } else { $null })   # R03-e: açık portal erişimi (AYRI satır)
    $d9 = ($ev.results | Where-Object { $_.id -eq 'P7-D9' }).verdict
    $st.waitVerdict = ($ev.results | Where-Object { $_.id -eq 'P7-WAIT' }).verdict
    $st.reply2Verdict = ($ev.results | Where-Object { $_.id -eq 'D7-3B' }).verdict
    $kept = ($ev.results | Where-Object { $_.id -eq 'P7-MSG-KEPT' })
    $st.keptVerdict = $kept.verdict; $st.keptText = $kept.observed
    $st.finding = $ev.productFinding; $st.residue = $ev.messageResidue
    $st.setupDurum = $ev.setup.durum; $st.setupAsama = $ev.setup.asama; $st.setupMakbuz = $ev.setup.makbuzDosyasi   # R03: kurulum durumu (koşucu kanıtı)
    $st.verified = ($d9 -eq 'PASS')
  } catch { $st.verified = $false }
  # R03: DOĞRULANDI metni parça İDDİA ETMEZ — her parça kanıttaki ölçüt verdict'lerinden kurulur (D-6 R02 kalıbı). Gruptaki TÜM ölçütler PASS ise
  # "PASS"; biri FAIL ise "FAIL"; aksi halde (satır yok / UNMEASURED) "ÖLÇÜLMEDİ". Birleşik P7-D9 PASS iken de DB/HTTP ret ölçütleri koşulmamış olabilir:
  # portal hesabı hiç açılmadıysa (P7-C2..C5 satırı yok) ya da koşucunun portal oturumu yoksa (P7-C4 UNMEASURED). "Mevcut oturum" koşucunun KENDİ portal
  # oturumudur (P7-C4L/D); telefondaki oturumu koşucu ölçmez (owner beyanı). Parçalar aynı satırın devamındadır.
  $st.text = if ($st.verified) {
               $parts = foreach ($p in @(@('DB kapalı + sürüm arttı [P7-C2/C2V/C5]', 'P7-C2', 'P7-C2V', 'P7-C5'), @('yeni giriş reddi, yerel + dış [P7-C3L/D]', 'P7-C3L', 'P7-C3D'),
                                         @('mevcut oturum reddi, koşucunun kendi portal oturumu, mesaj ucunda, yerel + dış [P7-C4L/D]', 'P7-C4L', 'P7-C4D'),
                                         @('personel/dosya kapanışı [U-CLOSE]', 'U-CLOSE'))) {
                 $vs = @($p | Select-Object -Skip 1 | ForEach-Object { $id = $_; $hit = @($ev.results | Where-Object { $_.id -eq $id }); if ($hit.Count -eq 1) { [string]$hit[0].verdict } else { '' } })
                 '{0}: {1}' -f $p[0], $(if (@($vs | Where-Object { $_ -ne 'PASS' }).Count -eq 0) { 'PASS' } elseif (@($vs | Where-Object { $_ -eq 'FAIL' }).Count -gt 0) { 'FAIL' } else { 'ÖLÇÜLMEDİ' })
               }
               'Portal erişim kapanışı: koşucunun birleşik ölçütü P7-D9 PASS — DOĞRULANDI yalnız bu satırın devamında PASS yazan parçalar içindir (kanıttan): ' + ($parts -join ' · ') + '. Telefondaki oturumun reddini koşucu ÖLÇMEZ (yenileme sorusu beyandır).'
             }
             else { "Portal erişim kapanışı DOĞRULANAMADI (çıkış $rc) — telefondaki erişim açık kalmış olabilir; sonucu CLIENT'a bildirin." }
  return [pscustomobject]$st
}
function Write-OwnerDeclaration([string]$evDir, [string]$runId, $closure) {
  Write-Host ''
  $c = if ($closure -and $closure.verified) { 'Green' } else { 'Red' }
  # Satır rengi yalnız $closure.verified (= P7-D9 PASS) değerine bağlıdır; parçaların ayrı sonucu (PASS / FAIL / ÖLÇÜLMEDİ) rengi DEĞİŞTİRMEZ.
  Write-Host ("Koşum bitti. {0}" -f $(if ($closure) { $closure.text } else { 'Portal erişim kapanışı DOĞRULANAMADI (kanıt okunamadı).' })) -ForegroundColor $c
  Write-Host '  Not: satır rengi yalnız birleşik ölçütü (P7-D9) gösterir (yeşil = P7-D9 PASS; kırmızı = PASS değil ya da kanıt okunamadı); parçaların ayrı sonucu satırın metnindedir.'
  Write-Host 'Şimdi telefonda açık portal sayfasını bir kez YENİLEYİN, sonra aşağıdaki soruları ekranda gördüğünüze göre yanıtlayın.' -ForegroundColor Cyan
  Write-Host 'OWNER BEYANI (makine ölçümünden AYRI kaydedilir). Emin değilseniz ? yazın. Parola ve mesaj içeriği YAZMAYIN.' -ForegroundColor Cyan
  $d = [ordered]@{
    record = 'EXTACC-D7-OWNER-DECLARATION'; runId = $runId; not = 'owner beyanıdır; makine ölçümü değildir'
    closureShownToOwner = $(if ($closure) { $closure.text } else { 'kanıt okunamadı' })
    telefonGirisSayfasiAcildi = (Read-Answer 'QR/adres ile telefonda portal giriş sayfası açıldı mı? (E/H/?)')
    girisSonrasiEkran         = (Read-Answer 'Girişten sonra ne gördünüz? (M = portal açıldı: ana sayfa/özet ya da Mesajlar sekmesindeki mesaj sayfası · G = yine giriş sayfası · D = hata sayfası ya da portal dışı başka sayfa · ?)')
    listedekiMesajSayisi      = (Read-Answer 'Mesajlar sekmesine geçtiğinizde mesaj sayfasında ilk açılışta kaç mesaj vardı? (sayı ya da ?)')
    telefondanMesajGonderildi = (Read-Answer 'Telefondan mesaj gönderdiniz mi? (E/H — isteğe bağlı adım)')
    ikinciYanitGoruldu        = (Read-Answer 'Girişten sonra gelen İKİNCİ personel yanıtını mesaj sayfasında gördünüz mü? (E/H/?)')
    okunmamisSayaci           = (Read-Answer 'Zil simgesindeki rozet (okunmamış BİLDİRİM sayacı; mesaj sayacı değildir) ne gösterdi? (sayı · Y = görmedim · ?)')
    telefonAgi                = (Read-Answer 'Telefon hangi ağdaydı? (M = mobil veri, Wi-Fi kapalı · W = Wi-Fi · ?)')
    yenilemeSonrasiEkran      = (Read-Answer 'Yeniledikten sonra ne gördünüz? (M = portal içeriği hâlâ açık: mesaj sayfası ya da ana sayfa/özet · G = giriş sayfası · D = hata sayfası ya da portal dışı başka sayfa · Y = yenilemedim · ?)')
    atUtc = (Get-Date).ToUniversalTime().ToString('o')
  }
  $d | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $evDir 'owner-declaration.json') -Encoding UTF8
  return $d
}

# ---------------------------------------------------------------- R04 RECOVER GİRDİSİ (owner kararı 2026-10-04, madde 5)
# `-Mode Recover -RunEvidenceDir '<tamamlanmış Run kanıt dizini>'`: makbuzu blok, owner'ın AYRI Recover onayından (bu modu ayrıca başlatması; blok bu onayı
# SORMAZ ve ÖLÇMEZ — D-7'de Recover soru sormaz) SONRA, Run kanıtındaki recovery.makbuzJson alanından çıkarır ve Recover başlamadan bütünlüğünü doğrular. Bu
# fonksiyonlar yalnız owner'ın başlattığı Recover modunda çağrılır; Run başarısız oldu diye otomatik Recover YOKTUR. D-6 R04 ile aynı ilke ve aynı tanımlar.
# KAYNAK DOĞRULAMA (yazımdan ÖNCE; biri tutmazsa DUR — Recover başlamaz, başarı sayılmaz): dizin adı extacc-d7-live-<runId>-<zaman>; SHA256-MANIFEST.txt
#   var ve biçimli; manifestte d7-evidence.json, owner-block.json, goref-consumed.json satırları; manifestteki HER dosyanın sha256'sı satırına EŞİT (dosya bir
#   kez okunur; aynı baytlar hem özetlenir hem ayrıştırılır); kanıt kayıt türü Run kanıtı (EXTACC-D7-PORTAL-MESSAGES-LIVE-RUN — Recover kanıtı DEĞİL);
#   runId = dizin adı = makbuz = owner-block.json (mod Run) = goref-consumed.json = GO defteri satırı (GO sha256 + runId); recovery.makbuzJson dizge + JSON +
#   Recover okuma kapısı alanları (kayıt türü, runId biçimi, elevUserId, elevEmail); kimlik alanları (record, runId, tenantId, tenantSlug, foreignTenantId,
#   clientId, foreignClientId, caseId, elevUserId, elevEmail) kanıttaki receipt nesnesiyle EŞİT; tenantSlug = ah-<runId>.
# BAĞIMSIZ ÇAPA: manifest ve kanıt içeriği için YOK — bloğun Run kayıtları (owner-block.json, goref-consumed.json, owner-declaration.json, GO defteri) manifest
#   ya da kanıt özeti TAŞIMAZ; owner-block.json ve goref-consumed.json aynı dizinde ve aynı manifestle örtülüdür. GO defteri (kanıt dizini DIŞINDA) yalnız
#   runId ↔ GO sha256 bağını taşır → runId çapası olarak doğrulanır. Manifest kanıtla BİRLİKTE değiştirilirse bu doğrulama bunu YAKALAYAMAZ (sınır; ekrana
#   ve kayda yazılır).
# KODLAMA (açık tanım): yeni makbuz dosyasının baytları = recovery.makbuzJson DİZGESİNİN UTF-8 kodlaması — BOM YOK; satır sonları dizgede ne ise o (koşucunun
#   JSON.stringify(…, null, 1) çıktısı LF'dir; DÖNÜŞTÜRÜLMEZ); sonda EK satır sonu YOK. Geçersiz UTF-16 (eşlenmemiş vekil) ya da BOM karakteriyle başlayan dizge
#   → yazılmaz (DUR).
# YAZIM: hedef = Run kanıt dizininin KARDEŞİ '<Run dizini>.recover-girdi-<UTC yyyyMMddTHHmmssZ>'; dizin ya da dosya ZATEN VARSA DUR (ezme yok; dosyalar CreateNew
#   ile açılır). Yazımdan sonra dosya bayt olarak GERİ OKUNUR ve beklenen baytlarla karşılaştırılır; bloğun Recover okuma kapısı (Get-ReceiptFileState,
#   makbuzJson metin eşitliği dahil) koşulur; Run kanıtı ve manifestin sha256'sı yeniden ölçülür (önce = sonra). Yanına RECOVER-GIRDI-KAYDI.json yazılır. Run
#   kanıt dizinine ve manifeste YAZILMAZ; Recover'ın kendi kanıt dizini (recover-*) makbuzun yanında, yani kardeş dizinde açılır.
# HATA: yazma / geri okuma / okuma kapısı / kaynak değişimi / kayıt yazımı başarısızsa Recover BAŞLAMAZ (DUR, çıkış 90). Hedef dizin oluşturulduysa SİLİNMEZ
#   (dosya ya da dizin silen çağrı yok): içine RECOVER-GIRDI-KULLANILMAZ.txt (neden) yazılır; yarım ya da doğrulanamamış makbuz dosyası yerinde KALIR ve
#   Invoke-RecoverMode o dizindeki bir makbuzu -ReceiptFile ile de REDDEDER (işaret dosyası varsa DUR). İşaret dosyası da yazılamazsa ekran bunu söyler
#   (o durumda dizin elle KULLANILMAZ sayılır — kodla zorlanamaz).
# R04-c: (K5) yazımdan sonraki adımlarda BEKLENMEYEN istisna da aynı HATA yoluna düşer (işaret + DUR). (K3) hazırlık tuttuktan sonra makbuzun sha256'sı Recover kanıt
#   dizini açılmadan önce ve node çağrısından hemen önce yeniden ölçülür; kayda yazılan özetten farklıysa dizin KULLANILMAZ diye işaretlenir ve Recover BAŞLAMAZ. Bu
#   ölçüm ile koşucunun dosyayı kendi okuması arasındaki aralık blokla KAPATILAMAZ (koşucu değişmedi) — Recover'dan SONRAKİ ölçüm bunu ayrıca gösterir.
function Get-RecoverInputStamp { return (Get-Date).ToUniversalTime().ToString("yyyyMMdd'T'HHmmss'Z'") }
# İstisnanın SOMUT türü: .NET çağrısından gelen hata PowerShell'de MethodInvocationException ile sarılır; en içteki istisnanın adı yazılır (ör. IOException).
function Get-ErrName($e) { $x = $e.Exception; while ($x -and $x.InnerException) { $x = $x.InnerException }; if ($x) { return $x.GetType().Name }; return 'bilinmeyen hata' }
function ShaBytes([byte[]]$b) { ([BitConverter]::ToString([Security.Cryptography.SHA256]::Create().ComputeHash($b)) -replace '-', '').ToUpperInvariant() }
# Dosya YALNIZ yeni oluşturulur (CreateNew: varsa hata — ezme yok); baytlar olduğu gibi yazılır (kodlama / satır sonu dönüşümü yok).
function Write-NewFileBytes([string]$path, [byte[]]$bytes) {
  $fs = [IO.File]::Open($path, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
  try { $fs.Write($bytes, 0, $bytes.Length); $fs.Flush($true) } finally { $fs.Dispose() }
}
function Read-FileBytesForCheck([string]$path) { return , ([IO.File]::ReadAllBytes($path)) }
function Test-SameBytes([byte[]]$a, [byte[]]$b) {
  if ($null -eq $a -or $null -eq $b -or $a.Length -ne $b.Length) { return $false }
  for ($i = 0; $i -lt $a.Length; $i++) { if ($a[$i] -ne $b[$i]) { return $false } }
  return $true
}
# Kesin UTF-8 (geçersiz bayt → hata) + baştaki BOM atılır + JSON. Kaynak doğrulamada dosya baytları bir kez okunur ve bu baytlardan ayrıştırılır.
function ConvertFrom-JsonBytes([byte[]]$b) {
  $t = ([Text.UTF8Encoding]::new($false, $true)).GetString($b)
  if ($t.Length -gt 0 -and $t[0] -eq [char]0xFEFF) { $t = $t.Substring(1) }
  return ($t | ConvertFrom-Json)
}
function Test-RunEvidenceSource([string]$runDir) {
  $stop = ' — makbuz yazılmadı, Recover başlamadı'
  if (-not $runDir -or -not (Test-Path -LiteralPath $runDir -PathType Container)) { Fail "Run kanıt dizini yok ya da dizin değil: [$runDir]$stop" }
  $dir = (Resolve-Path -LiteralPath $runDir).ProviderPath.TrimEnd('\')
  $nm = [regex]::Match((Split-Path -Leaf $dir), '^extacc-d7-live-([0-9a-f]{8})-\d{8}-\d{6}$')
  if (-not $nm.Success) { Fail "Run kanıt dizininin adı tanınmadı ($(Split-Path -Leaf $dir); extacc-d7-live-<runId>-<zaman> bekleniyor)$stop" }
  $dirRun = $nm.Groups[1].Value
  $manPath = Join-Path $dir 'SHA256-MANIFEST.txt'
  if (-not (Test-Path -LiteralPath $manPath -PathType Leaf)) {
    # R04-c (K4): manifest yoksa (Run beyan adımında kesilmiş olabilir) DUR metni kalan yolu ve kanıt dizinindeki makbuz dosyasının ÖLÇÜLEN durumunu yazar
    # (Run sonu ekranıyla aynı ölçüm: Get-ClosureStatus → kanıttaki makbuz metni; Get-ReceiptFileState → okuma kapısı + BAYAT). Salt okuma; ölçüm hata verirse metin bunu söyler.
    $mf = 'ÖLÇÜLEMEDİ (dosya durumu okunamadı)'; $mfNote = ' → makbuz dosyasını owner / CLIENT inceler'
    try {
      $rs0 = Get-ReceiptFileState (Join-Path $dir 'd7-setup-receipt.json') (Get-ClosureStatus (Join-Path $dir 'd7-evidence.json') 0).makbuzJson; $mf = [string]$rs0.why
      $mfNote = if ($rs0.usable) { '' } elseif ($rs0.stale) { ' → bu dosyayla Recover ÖNERİLMEZ (eksik kapanış yapabilir)' } else { ' → -ReceiptFile mevcut ve okunabilir bir makbuz dosyası ister: bu paketle Recover BAŞLATILAMAZ' }
    } catch { $mf = 'ÖLÇÜLEMEDİ (dosya durumu okunamadı)' }
    Fail ("SHA256-MANIFEST.txt YOK — kaynak kanıtın hash bağı doğrulanamaz$stop. Run tamamlanmamış olabilir (manifest yazılmadan kesilmiş): bu durumda bu paketle tanımlı tek yol, kanıt dizinindeki makbuz dosyası okunabiliyorsa '-Mode Recover -ReceiptFile <makbuz>' — bu yol Run kanıt dizinine yazar; karar owner / CLIENT. Kanıt dizinindeki makbuz dosyası (d7-setup-receipt.json) şu an: {0}{1}" -f $mf, $mfNote)
  }
  $manBytes = [IO.File]::ReadAllBytes($manPath); $manSha = ShaBytes $manBytes
  $man = [ordered]@{}
  foreach ($l in @(([Text.Encoding]::ASCII.GetString($manBytes)) -split "`r?`n" | Where-Object { $_ -ne '' })) {
    $lm = [regex]::Match($l, '^([0-9A-F]{64})  ([A-Za-z0-9._-]+)$')
    if (-not $lm.Success) { Fail "SHA256-MANIFEST.txt satırı biçimsiz ([$l])$stop" }
    if ($man.Contains($lm.Groups[2].Value)) { Fail "SHA256-MANIFEST.txt'de aynı dosya iki kez: $($lm.Groups[2].Value)$stop" }
    $man[$lm.Groups[2].Value] = $lm.Groups[1].Value
  }
  foreach ($n in 'd7-evidence.json', 'owner-block.json', 'goref-consumed.json') { if (-not $man.Contains($n)) { Fail "SHA256-MANIFEST.txt'de $n satırı YOK — kaynak kanıtın hash bağı doğrulanamaz$stop" } }
  $bytesOf = @{}
  foreach ($n in @($man.Keys)) {
    $p = Join-Path $dir $n
    if (-not (Test-Path -LiteralPath $p -PathType Leaf)) { Fail "manifestteki dosya YOK: $n$stop" }
    $b = [IO.File]::ReadAllBytes($p)
    if ((ShaBytes $b) -cne $man[$n]) { Fail "manifest uyuşmuyor: $n dosyasının sha256'sı SHA256-MANIFEST.txt satırına EŞİT DEĞİL (kaynak değişmiş)$stop" }
    $bytesOf[$n] = $b
  }
  $ev = $null; try { $ev = ConvertFrom-JsonBytes $bytesOf['d7-evidence.json'] } catch { $ev = $null }
  if (-not $ev) { Fail "d7-evidence.json UTF-8 JSON olarak okunamadı$stop" }
  if ($ev.record -cne 'EXTACC-D7-PORTAL-MESSAGES-LIVE-RUN') { Fail "kaynak kanıtın kayıt türü Run kanıtı DEĞİL ([$($ev.record)]; Recover kanıtından makbuz çıkarılmaz)$stop" }
  $runId = [string]$ev.runId
  if ($runId -cne $dirRun) { Fail "kanıttaki runId ([$runId]) dizin adındaki runId ($dirRun) ile EŞİT DEĞİL$stop" }
  $mj = if ($ev.recovery) { $ev.recovery.makbuzJson } else { $null }
  if (-not ($mj -is [string]) -or $mj.Length -eq 0) { Fail "kanıtta makbuz metni (recovery.makbuzJson) YOK — makbuz çıkarılamaz$stop" }
  if ($mj[0] -eq [char]0xFEFF) { Fail "recovery.makbuzJson BOM karakteriyle başlıyor — BOM'suz tanımla yazılamaz$stop" }
  $mk = $null; try { $mk = $mj | ConvertFrom-Json } catch { $mk = $null }
  if (-not $mk) { Fail "recovery.makbuzJson JSON olarak ayrıştırılamadı$stop" }
  if ($mk.record -cne 'EXTACC-D7-SETUP-RECEIPT' -or [string]$mk.runId -cnotmatch '^[0-9a-f]{8}$' -or -not [string]$mk.elevUserId -or -not [string]$mk.elevEmail) { Fail "recovery.makbuzJson Recover okuma kapısını geçmez (kayıt türü / runId biçimi / elevUserId / elevEmail)$stop" }
  if ([string]$mk.runId -cne $runId) { Fail "makbuz BAŞKA bir koşuma ait: makbuz runId=$($mk.runId) ≠ kanıt runId=$runId$stop" }
  $rc0 = $ev.receipt
  if (-not $rc0) { Fail "kanıtta receipt nesnesi YOK — makbuzun kimlik alanları karşılaştırılamaz$stop" }
  $idFields = @('record', 'runId', 'tenantId', 'tenantSlug', 'foreignTenantId', 'clientId', 'foreignClientId', 'caseId', 'elevUserId', 'elevEmail')
  foreach ($f in $idFields) { if ([string]$mk.$f -cne [string]$rc0.$f) { Fail "kimlik alanı uyuşmuyor: $f (recovery.makbuzJson ≠ kanıttaki receipt)$stop" } }
  foreach ($f in 'tenantId', 'tenantSlug', 'clientId') { if (-not [string]$mk.$f) { Fail "makbuzda $f boş$stop" } }
  if ([string]$mk.tenantSlug -cne "ah-$runId") { Fail "makbuzdaki tenantSlug runId'den türetilen ah-$runId DEĞİL$stop" }
  $ob = $null; try { $ob = ConvertFrom-JsonBytes $bytesOf['owner-block.json'] } catch { $ob = $null }
  if (-not $ob -or $ob.record -cne 'EXTACC-D7-OWNER-BLOCK' -or $ob.mode -cne 'Run' -or [string]$ob.runId -cne $runId) { Fail "owner-block.json bu Run'ın blok kaydı DEĞİL (kayıt türü / mod Run / runId=$runId)$stop" }
  $gc = $null; try { $gc = ConvertFrom-JsonBytes $bytesOf['goref-consumed.json'] } catch { $gc = $null }
  $goSha = if ($gc) { [string]$gc.goRefSha256 } else { '' }
  if (-not $gc -or $gc.record -cne 'EXTACC-D7-GOREF-CONSUMED' -or [string]$gc.runId -cne $runId -or $goSha -cnotmatch '^[0-9A-F]{64}$') { Fail "goref-consumed.json bu Run'ın GO tüketim kaydı DEĞİL (kayıt türü / runId=$runId / GO sha256)$stop" }
  $hits = @()
  if ($GoLedger -and (Test-Path -LiteralPath $GoLedger -PathType Leaf)) { $hits = @([IO.File]::ReadAllLines($GoLedger) | Where-Object { $_.StartsWith("$goSha  runId=$runId  ", [StringComparison]::Ordinal) }) }
  if ($hits.Count -ne 1) { Fail "GO defterinde bu Run'ın satırı (GO sha256 + runId=$runId) bulunamadı ya da tek değil ($($hits.Count)) — runId çapası doğrulanamadı$stop" }
  $bytes = $null
  try { $bytes = ([Text.UTF8Encoding]::new($false, $true)).GetBytes($mj) } catch { Fail "recovery.makbuzJson geçerli UTF-16 değil (eşlenmemiş vekil) — UTF-8 baytlarına kayıpsız çevrilemez$stop" }
  return [pscustomobject]@{ dir = $dir; runId = $runId; manifestSha = $manSha; manifestLine = ('{0}  d7-evidence.json' -f $man['d7-evidence.json']); manifestCount = $man.Count
                            evidenceSha = $man['d7-evidence.json']; makbuzJson = $mj; bytes = $bytes; idFields = $idFields }
}
# Recover girdisi dizinini KULLANILMAZ diye işaretler (RECOVER-GIRDI-KULLANILMAZ.txt; CreateNew — var olan dosya ezilmez) ve DUR metninin dizinle ilgili parçasını
# döndürür. Dizin ve içindeki dosyalar SİLİNMEZ. Çağıranlar: New-RecoverInputFromRun (hazırlık tutmadı) · Assert-RecoverInputUnchanged (R04-c K3: girdi sonradan değişti).
function Set-RecoverInputUnusable([string]$target, [string]$why, [string]$srcLeaf) {
  $marked = $false
  try { Write-NewFileBytes (Join-Path $target 'RECOVER-GIRDI-KULLANILMAZ.txt') ([Text.UTF8Encoding]::new($false).GetBytes("KULLANILMAZ — bu dizindeki dosyalar Recover girdisi DEĞİLDİR (-ReceiptFile ile vermeyin).`r`nneden: $why`r`nkaynak (kardeş dizin): $srcLeaf`r`nzaman (UTC): $((Get-Date).ToUniversalTime().ToString('o'))`r`n")); $marked = $true } catch { $marked = $false }
  return ('Hedef dizin SİLİNMEDİ; {0}: {1}' -f $(if ($marked) { 'KULLANILMAZ diye işaretlendi (RECOVER-GIRDI-KULLANILMAZ.txt)' } else { 'işaret dosyası da YAZILAMADI — dizin elle KULLANILMAZ sayılır' }), $target)
}
# R04-c (K3): doğrulanmış Recover girdisinin (makbuz) sha256'sı yeniden ölçülür. RECOVER-GIRDI-KAYDI.json'a yazılan özetten (New-RecoverInputFromRun'ın döndürdüğü değer)
# farklıysa ya da dosya okunamıyorsa Recover BAŞLAMAZ: dizin KULLANILMAZ diye işaretlenir ve DUR (node çağrılmaz; başarı sayılmaz). Eşitse ölçülen özet döner.
function Assert-RecoverInputUnchanged($rin, [string]$when) {
  $now = $null; try { $now = Sha $rin.path } catch { $now = $null }
  if ($now -and $now -ceq [string]$rin.sha256) { return $now }
  $why = "makbuz doğrulamadan SONRA, node başlamadan ÖNCE DEĞİŞTİ ya da okunamadı ($when; sha256 kayıttaki=$($rin.sha256) · şimdi=$(if ($now) { $now } else { 'okunamadı' }))"
  Fail ("Recover girdisi artık doğrulanmış girdi DEĞİL: {0} — RECOVER-GIRDI-KAYDI.json'daki makbuzSha256 bu dosyayı anlatmıyor; Recover BAŞLAMADI (node çağrılmadı; başarı sayılmaz). {1}" -f $why, (Set-RecoverInputUnusable $rin.dir $why $rin.srcLeaf))
}
function New-RecoverInputFromRun([string]$runDir) {
  $src = Test-RunEvidenceSource $runDir
  $target = Join-Path (Split-Path -Parent $src.dir) ('{0}.recover-girdi-{1}' -f (Split-Path -Leaf $src.dir), (Get-RecoverInputStamp))
  if (Test-Path -LiteralPath $target) { Fail "hedef ZATEN VAR (ezilmez): $target — makbuz yazılmadı, Recover başlamadı" }
  try { $null = New-Item -ItemType Directory -Path $target -ErrorAction Stop } catch { Fail "hedef dizin oluşturulamadı ($target): $(Get-ErrName $_) — makbuz yazılmadı, Recover başlamadı" }
  $rcptPath = Join-Path $target 'd7-setup-receipt-kanittan.json'
  $why = $null; $newSha = $null
  # R04-c (K5): hedef dizin oluştuktan SONRAKİ tüm adımlar (yazım, geri okuma, okuma kapısı, kaynağın yeniden ölçümü, kayıt yazımı) TEK try/catch içindedir —
  # adımların kendi yakalamadığı BEKLENMEYEN bir istisna da (ör. okuma kapısında dosya kilidi) aşağıdaki KULLANILMAZ işareti + DUR yoluna düşer (önceki baytlarda
  # istisna işaret yazılmadan yukarı çıkıyordu; o dizindeki makbuz sonradan -ReceiptFile ile kabul edilebiliyordu).
  try {
  try { Write-NewFileBytes $rcptPath $src.bytes } catch { $why = "makbuz dosyası yazılamadı ($(Get-ErrName $_))" }
  if (-not $why) {
    $back = $null
    try { $back = Read-FileBytesForCheck $rcptPath } catch { $why = "makbuz dosyası geri okunamadı ($(Get-ErrName $_))" }
    if (-not $why -and -not (Test-SameBytes $back $src.bytes)) { $why = "geri okunan baytlar recovery.makbuzJson dizgesinin UTF-8 baytlarıyla EŞİT DEĞİL (okunan=$(if ($null -ne $back) { $back.Length } else { '-' }) bayt · beklenen=$($src.bytes.Length) bayt)" }
    if (-not $why) { $newSha = ShaBytes $back }
  }
  if (-not $why) { $gs = Get-ReceiptFileState $rcptPath $src.makbuzJson; if (-not $gs.usable) { $why = "yazılan makbuz bloğun Recover okuma kapısından geçmedi ($($gs.why))" } }
  if (-not $why) {
    $evAfter = $null; $manAfter = $null
    try { $evAfter = Sha (Join-Path $src.dir 'd7-evidence.json'); $manAfter = Sha (Join-Path $src.dir 'SHA256-MANIFEST.txt') } catch { $why = 'Run kanıtı / manifest yazımdan sonra yeniden ölçülemedi' }
    if (-not $why -and ($evAfter -cne $src.evidenceSha -or $manAfter -cne $src.manifestSha)) { $why = "Run kanıtı ya da manifest yazım sırasında DEĞİŞTİ (d7-evidence.json önce=$($src.evidenceSha.Substring(0, 12)) sonra=$($evAfter.Substring(0, 12)) · SHA256-MANIFEST.txt önce=$($src.manifestSha.Substring(0, 12)) sonra=$($manAfter.Substring(0, 12)))" }
  }
  if (-not $why) {
    $k = [ordered]@{ record = 'EXTACC-D7-RECOVER-INPUT'; revision = 'R04'; runId = $src.runId; atUtc = (Get-Date).ToUniversalTime().ToString('o')
      kaynakDizinAdi = (Split-Path -Leaf $src.dir); kaynakKonumu = 'bu dizinin KARDEŞİ (aynı üst dizin)'; kaynakKanit = 'd7-evidence.json'; kaynakKanitSha256 = $src.evidenceSha; kaynakKayitTuru = 'EXTACC-D7-PORTAL-MESSAGES-LIVE-RUN'
      manifest = 'SHA256-MANIFEST.txt'; manifestSha256 = $src.manifestSha; manifestSatiri = $src.manifestLine; manifestDogrulananDosya = $src.manifestCount
      runIdBaglari = 'dizin adı · kanıt · makbuz · owner-block.json (mod Run) · goref-consumed.json · GO defteri satırı'; kimlikAlanlari = ($src.idFields -join ',')
      makbuzDosyasi = 'd7-setup-receipt-kanittan.json'; makbuzSha256 = $newSha; makbuzBayt = $src.bytes.Length
      kodlama = 'recovery.makbuzJson dizgesinin UTF-8 baytları; BOM YOK; satır sonları dönüştürülmedi; sonda ek satır sonu YOK'
      geriOkuma = 'baytlar EŞİT'; okumaKapisi = 'Get-ReceiptFileState: kullanılabilir (makbuzJson metin eşitliği dahil)'
      kaynakYazimdanSonra = 'd7-evidence.json ve SHA256-MANIFEST.txt sha256 DEĞİŞMEDİ (önce = sonra)'
      bagimsizCapa = [ordered]@{ manifestVeKanit = 'YOK — Run kayıtları (owner-block.json, goref-consumed.json, owner-declaration.json, GO defteri) manifest ya da kanıt özeti taşımaz; manifest kanıtla birlikte değiştirilirse bu doğrulama YAKALAYAMAZ'
                                 runId = ('GO defteri (kanıt dizini dışında) satırı doğrulandı: GO sha256 + runId=' + $src.runId) } }
    try { Write-NewFileBytes (Join-Path $target 'RECOVER-GIRDI-KAYDI.json') ([Text.UTF8Encoding]::new($false).GetBytes(($k | ConvertTo-Json -Depth 4))) } catch { $why = "RECOVER-GIRDI-KAYDI.json yazılamadı ($(Get-ErrName $_))" }
  }
  } catch { if (-not $why) { $why = "yazımdan sonraki adımda BEKLENMEYEN hata ($(Get-ErrName $_)) — makbuz doğrulanamadı" } }
  if ($why) { Fail ("Recover girdisi hazırlanamadı: {0} — Recover BAŞLAMADI (başarı sayılmaz). {1}" -f $why, (Set-RecoverInputUnusable $target $why (Split-Path -Leaf $src.dir))) }
  Write-Host ''
  Write-Host 'RECOVER GİRDİSİ HAZIR — makbuz Run kanıtındaki recovery.makbuzJson alanından çıkarıldı; kaynak doğrulandı:' -ForegroundColor Cyan
  Write-Host ("  kaynak: {0}" -f $src.dir)
  Write-Host ("  d7-evidence.json sha256={0} = SHA256-MANIFEST.txt satırı (manifest sha256={1}; manifestteki {2} dosyanın HEPSİ satırına eşit) · kayıt türü Run kanıtı · runId={3} (dizin adı, kanıt, makbuz, owner-block.json, goref-consumed.json, GO defteri satırı) · kimlik alanları kanıttaki receipt ile EŞİT" -f $src.evidenceSha, $src.manifestSha, $src.manifestCount, $src.runId)
  Write-Host ("  yeni makbuz: {0} ({1} bayt · sha256={2}; UTF-8 BOM YOK, satır sonları dönüştürülmedi, sonda ek satır sonu YOK; geri okunan baytlar = kaynak) · kayıt: RECOVER-GIRDI-KAYDI.json" -f $rcptPath, $src.bytes.Length, $newSha)
  Write-Host '  Run kanıtı ve manifest yazımdan ÖNCE ve SONRA ölçüldü: DEĞİŞMEDİ. Run kanıt dizinine yazılmadı; Recover kanıt dizini (recover-*) bu kardeş dizinde açılır.'
  Write-Host '  SINIR: manifestin bağımsız çapası YOK — manifest ve kanıt aynı dizindedir; ikisi BİRLİKTE değiştirilirse bu doğrulama YAKALAYAMAZ (GO defteri yalnız runId ↔ GO sha256 bağını taşır).' -ForegroundColor Yellow
  # R04-c (K3): yol + kayda yazılan makbuz özeti birlikte döner — Invoke-RecoverMode node'dan önce makbuzu bu özetle yeniden karşılaştırır (Assert-RecoverInputUnchanged).
  return [pscustomobject]@{ path = $rcptPath; sha256 = $newSha; dir = $target; srcLeaf = (Split-Path -Leaf $src.dir) }
}
# R04: Recover bitiş ekranı — portal erişiminin SON ÖLÇÜME göre durumu (bu Recover'ın kanıtındaki portalClose; salt okuma). Son ölçüm sırası: HTTP ölçümlerinden
# sonraki DB okuması (afterMeasure, P7-C5) → kapatma adımından sonraki (after, P7-C2) → Recover başındaki (before). AÇIK = hesap aktif ya da müvekkil erişim
# bayrağı açık (koşucunun isOpenAccess kuralı; hesap pasif + bayrak açık durumu "kapanış TAMAMLANMADI" diye AYRICA adlandırılır — koşucunun openStateTxt ayrımı);
# KAPALI = hesap pasif + bayrak kapalı ya da hesap satırı YOK; aksi halde ÖLÇÜLEMEDİ (kanıt okunamadı, portalClose yok, geç oluşma dışlanamadı, DB değeri
# yok). `durum` bir DB durumudur; mevcut oturum reddi Recover'da ÖLÇÜLEMEZ. Değerler kanıttaki gibi küçük harfle yazılır.
# R04-c (K1): ekrandaki satır DB KAPALI iken yalnız DB durumundan KURULMAZ. Aynı kanıttaki yeni giriş reddi ölçütleri (P7-C3L yerel · P7-C3D dış) satıra yazılır;
# gösterilen ad (`goster`) ve renk (`renk`) bunlara bağlıdır: ikisi PASS → yeşil "KAPALI (DB + yeni giriş reddi PASS)"; biri FAIL (ör. kapanıştan sonra giriş KABUL
# EDİLDİ) → kırmızı "DB'de kapalı AMA yeni giriş reddi FAIL (…) — erişim kapalı SAYILMAZ"; aksi halde (ÖLÇÜLEMEYEN / satır yok / tek değil / tanınmayan değer) → sarı
# "DB'de kapalı; yeni giriş reddi ÖLÇÜLEMEDİ (…)". Portal hesabı satırı DB'de YOKKEN koşucu giriş reddini ölçmez (satır yok) → sarı. AÇIK → kırmızı; ÖLÇÜLEMEDİ → sarı.
function Get-RecoverPortalAccess([string]$evidFile, $es) {
  $u = { param([string]$w) [pscustomobject]@{ durum = 'ÖLÇÜLEMEDİ'; goster = 'ÖLÇÜLEMEDİ'; renk = 'Yellow'; giris = $null; text = $w } }
  if (-not $es -or -not $es.valid) { return (& $u ("Recover kanıtı okunabilir değil ({0}) — son portal ölçümü bu Recover'dan okunamaz" -f $(if ($es) { $es.state } else { 'durum yok' }))) }
  $ev = $null; try { $ev = Get-Content -Raw -Encoding UTF8 -LiteralPath $evidFile | ConvertFrom-Json } catch { $ev = $null }
  $pc = if ($ev) { $ev.portalClose } else { $null }
  if (-not $pc) { return (& $u "Recover kanıtında portalClose yok — portal erişimi bu Recover'da ölçülmedi") }
  if ($pc.lateCreateRisk) { return (& $u 'portal hesabı oluşturma sonucu belirsiz ve hesap Recover penceresinde görülmedi — geç oluşma DIŞLANAMADI') }
  $m = $null; $where = $null
  if ($pc.afterMeasure) { $m = $pc.afterMeasure; $where = 'HTTP ölçümlerinden sonraki DB okuması (P7-C5)' }
  elseif ($pc.after) { $m = $pc.after; $where = 'kapatma adımından sonraki DB okuması (P7-C2)' }
  elseif ($pc.before) { $m = $pc.before; $where = 'Recover başındaki DB okuması' }
  if (-not $m) { return (& $u ('portal DB durumu Recover kanıtında yok' + $(if ($pc.reason) { " (kapanış adımı hatası: $($pc.reason))" } else { '' }))) }
  $lc = { param($x) if ($x -is [bool]) { ([string]$x).ToLowerInvariant() } else { [string]$x } }
  # Yeni giriş reddi ölçütünün kanıttaki verdict'i: aynı kimlikli satırlardan biri FAIL ise FAIL; satır yoksa / tek değilse / değer tanınmıyorsa PASS SAYILMAZ.
  $v3 = { param([string]$id)
    $h = @(@($ev.results) | Where-Object { $_ -and $_.id -eq $id } | ForEach-Object { [string]$_.verdict })
    if ($h.Count -eq 0) { 'satır yok' } elseif (@($h | Where-Object { $_ -eq 'FAIL' }).Count -gt 0) { 'FAIL' } elseif ($h.Count -ne 1) { "satır tek değil ($($h.Count))" }
    elseif ($h[0] -ceq 'PASS') { 'PASS' } elseif ($h[0] -ceq 'UNMEASURED') { 'ÖLÇÜLEMEYEN' } else { "tanınmadı [$($h[0])]" } }
  $shut = { param([string]$dbText)
    $l = [string](& $v3 'P7-C3L'); $d = [string](& $v3 'P7-C3D'); $vt = "P7-C3L=$l, P7-C3D=$d"
    if ($l -ceq 'FAIL' -or $d -ceq 'FAIL') { return [pscustomobject]@{ durum = 'KAPALI'; goster = "DB'de kapalı AMA yeni giriş reddi FAIL ($vt) — erişim kapalı SAYILMAZ"; renk = 'Red'; giris = 'FAIL'; text = $dbText } }
    if ($l -ceq 'PASS' -and $d -ceq 'PASS') { return [pscustomobject]@{ durum = 'KAPALI'; goster = 'KAPALI (DB + yeni giriş reddi PASS)'; renk = 'Green'; giris = 'PASS'; text = "$dbText; $vt" } }
    return [pscustomobject]@{ durum = 'KAPALI'; goster = "DB'de kapalı; yeni giriş reddi ÖLÇÜLEMEDİ ($vt)"; renk = 'Yellow'; giris = 'ÖLÇÜLEMEDİ'; text = $dbText } }
  if ($m.exists -eq $false) { return (& $shut ("portal hesabı satırı DB'de YOK (hasPortalAccess={0}; son ölçüm: {1}; hesap yokken koşucu yeni giriş reddini ölçmez)" -f (& $lc $m.hasPortalAccess), $where)) }
  $vals = 'isActive={0} hasPortalAccess={1} sürüm={2}' -f (& $lc $m.isActive), (& $lc $m.hasPortalAccess), $m.tokenVersion
  if ($m.isActive -eq $true -or $m.hasPortalAccess -eq $true) {
    $kind = if ($m.isActive -eq $true) { 'portal hesabı AKTİF' } else { 'portal kapanışı TAMAMLANMADI: hesap pasif ama müvekkil erişim bayrağı açık' }
    return [pscustomobject]@{ durum = 'AÇIK'; goster = 'AÇIK'; renk = 'Red'; giris = $null; text = ("$kind ($vals; son ölçüm: $where)" + $(if ($pc.acikErisim -is [string]) { " — kanıttaki açık erişim metni: $($pc.acikErisim)" } else { '' })) }
  }
  if ($m.isActive -eq $false -and $m.hasPortalAccess -eq $false) { return (& $shut "hesap pasif + müvekkil erişim bayrağı kapalı ($vals; son ölçüm: $where)") }
  return (& $u "DB değerleri okunamadı ($vals; son ölçüm: $where)")
}
# R04-c (K2): `-ReceiptFile` yolunun kanıt dizinine etkisi — TEK metin; Recover başında, Recover bitişinde ve Run sonu ekranının `-ReceiptFile <makbuz>` dalında AYNEN gösterilir.
# (D-7 koşucusu Recover'da makbuz dosyasına yazmaz — R04-b notu; D-6'da koşucu makbuzu yerinde yeniden yazabilir. Değişen: recover-* dizini kanıt dizininin İÇİNDE açılır.)
function Get-RunDirWriteNote { return 'bu yol recover-* dizinini Run kanıt dizinine açar — orijinal kanıt dizini DEĞİŞİR; manifest kapsamı dışında kalır' }
# R04-c (K2): `-ReceiptFile` ile verilen makbuzun DİZİNİ manifesti olan (tamamlanmış) bir kanıt dizini mi (SHA256-MANIFEST.txt var)? Değilse $false (davranış değişmedi).
# Öyleyse ve o dizindeki kanıtta makbuz metni (recovery.makbuzJson) VARSA — Run sonu ekranının `-RunEvidenceDir` önerdiği ve "-ReceiptFile ile VERMEYİN" dediği koşulun
# AYNISI (Get-ClosureStatus) — Recover BAŞLAMAZ: DUR (node çağrılmaz) + `-Mode Recover -RunEvidenceDir '<dizin>'` yönlendirmesi (o yol kaynağı doğrular ve kanıt dizininin
# DIŞINA yazar). Kanıtta makbuz metni YOKSA ya da kanıt okunamıyorsa `-RunEvidenceDir` kullanılamaz; bu paketle tanımlı tek yol budur → izin verilir, kanıt dizininin
# DEĞİŞECEĞİ ekrana yazılır ve $true döner. Salt okuma (dosya yazmaz).
function Assert-ReceiptFileRoute([string]$rcptDir) {
  if (-not $rcptDir -or -not (Test-Path -LiteralPath (Join-Path $rcptDir 'SHA256-MANIFEST.txt') -PathType Leaf)) { return $false }
  $full = $rcptDir; try { $full = (Resolve-Path -LiteralPath $rcptDir).ProviderPath.TrimEnd('\') } catch { $full = $rcptDir }
  $inDir = Get-ClosureStatus (Join-Path $rcptDir 'd7-evidence.json') 0
  if ($inDir.makbuzJson) {
    Fail ("makbuz, manifesti olan (tamamlanmış) bir Run kanıt dizininin İÇİNDE ve o dizindeki kanıtta makbuz metni (recovery.makbuzJson) VAR — -ReceiptFile bu dizine yazardı (recover-* dizini): Recover BAŞLAMADI (node çağrılmadı). Bunun yerine -Mode Recover -RunEvidenceDir '{0}' kullanın — blok makbuzu kanıttan çıkarır, kaynağı doğrular ve Run kanıt dizininin DIŞINA yazar (AYRI owner onayıyla; doğrulama tutmazsa Recover başlamaz, karar owner / CLIENT)" -f $full.Replace("'", "''"))
  }
  Write-Host ''
  Write-Host ("UYARI — makbuz, manifesti olan (tamamlanmış) bir kanıt dizininin İÇİNDE: {0}" -f $full) -ForegroundColor Yellow
  Write-Host '  O dizindeki kanıtta makbuz metni (recovery.makbuzJson) YOK ya da kanıt okunamadı → -RunEvidenceDir kullanılamaz; -ReceiptFile bu paketle tanımlı tek yoldur.' -ForegroundColor Yellow
  Write-Host ("  DİKKAT: {0}. Bu yolu kullanma kararı owner / CLIENT'a aittir." -f (Get-RunDirWriteNote)) -ForegroundColor Yellow
  return $true
}

# ---------------------------------------------------------------- RUN
function Invoke-RunMode($g) {
  $rc = 90
  Assert-ExternalChain $g.chain
  Assert-LocalConsole
  $w = Read-Answer 'Bu pencere uygulamanın Terminal paneli ya da kayıt tutan bir oturum DEĞİL, bağımsız bir PowerShell penceresi mi? (E/H)'
  if ($w -cne 'E') { Fail 'bağımsız pencere teyit edilmedi — giriş bilgisi gösterilmeyecek' }
  Confirm-PortalBaseUrlR05
  Confirm-LiveDataProcessing
  $GoRef = Read-GoRef
  if ($GoRef -cnotmatch '^OWNER-GO-CLIENT-EXTACC-D7-\d{8}-R\d{2}$') { Fail 'GO ref BİÇİMİ hatalı' }
  $goSha = ShaText $GoRef
  if ((Test-Path -LiteralPath $GoLedger) -and (Select-String -LiteralPath $GoLedger -SimpleMatch -Pattern $goSha -Quiet)) { Fail 'GO ref DAHA ÖNCE KULLANILDI (defter)' }
  $prior = @(Get-ChildItem -LiteralPath $EvRoot -Recurse -File -Filter 'goref-consumed.json' -ErrorAction SilentlyContinue |
    Where-Object { (Get-Content -Raw -LiteralPath $_.FullName) -match [regex]::Escape($goSha) })
  if ($prior.Count -gt 0) { Fail 'GO ref DAHA ÖNCE KULLANILDI (tüketim kaydı)' }
  $old = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
  $global:LASTEXITCODE = -999
  Invoke-RepoGit grep -q -F -- $GoRef | Out-Null; $gg = $global:LASTEXITCODE; $ErrorActionPreference = $old
  if ($gg -eq 0) { Fail 'GO ref repoda geçiyor — TÜKETİLMİŞ' }
  if (-not ($gg -is [int]) -or $gg -ne 1) { Fail "tüketim kontrolü yapılamadı (git grep çıkış [$gg])" }

  $RunId = -join ((1..8) | ForEach-Object { '{0:x}' -f (Get-Random -Maximum 16) })
  $EvDir = Join-Path $EvRoot ("extacc-d7-live-{0}-{1}" -f $RunId, (Get-Date -Format 'yyyyMMdd-HHmmss'))
  New-Item -ItemType Directory -Force -Path $EvDir | Out-Null
  Add-Content -LiteralPath $GoLedger -Value ("{0}  runId={1}  {2}" -f $goSha, $RunId, (Get-Date).ToUniversalTime().ToString('o')) -Encoding ASCII
  [ordered]@{ record = 'EXTACC-D7-OWNER-BLOCK'; revision = 'R01'; mode = 'Run'; runId = $RunId; main = $g.head; packageDigest = $g.pkg; liveDist = $g.dist
              envSha = $g.envSha; apiPid = $g.apiPid; baseUrlHost = $g.baseHost; caddyLoopback = $g.caddyLoopback; cloudflaredRunning = $g.cloudflaredRunning
              nodeExe = $g.nodeExe; nodeVersion = $g.nodeVersion; liveDataProcessingConfirmed = $true; standaloneWindowConfirmed = $true
              emailSendsPlanned = 0; messageRowsDeleted = $false
              startedUtc = (Get-Date).ToUniversalTime().ToString('o') } |
    ConvertTo-Json | Set-Content -LiteralPath (Join-Path $EvDir 'owner-block.json') -Encoding UTF8
  $decl = $null
  try {
    Set-RunEnv $RunId $EvDir
    $env:D7_MODE = 'run'; $env:D7_LIVE_CONFIRM = '1'; $env:D7_LIVE_GO_REF = $GoRef; $env:D7_DISPLAY = 'conout'
    $env:D7_EXPECT_TENANT_SLUG = "ah-$RunId"; $env:D7_RECEIPT = Join-Path $EvDir 'd7-setup-receipt.json'
    $evid = $env:D7_EVID_FILE
    Assert-FreshEvidence $evid
    $rc = Invoke-Node $g.nodeExe (Join-Path $Sc 'd7-portal-messages-live-run.js') (Join-Path $EvDir 'd7-run.log')
    $rc = Complete-NodeRc $rc $evid
  }
  finally {
    Clear-SecretEnv
    Clear-OwnerScreen
    [ordered]@{ record = 'EXTACC-D7-GOREF-CONSUMED'; runId = $RunId; goRefSha256 = $goSha; literalWritten = $false; exitCode = $rc
                atUtc = (Get-Date).ToUniversalTime().ToString('o') } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $EvDir 'goref-consumed.json') -Encoding UTF8
    $GoRef = $null
  }
  $closure = Get-ClosureStatus (Join-Path $EvDir 'd7-evidence.json') $rc
  try { $decl = Write-OwnerDeclaration $EvDir $RunId $closure } finally { Write-Manifest $EvDir }
  $waitV = $closure.waitVerdict; $finding = $closure.finding
  Write-Host "EXTACC D-7 KOŞUM BİTTİ - RUNID=$RunId · çıkış=$rc" -ForegroundColor $(if ($rc -eq 0) { 'Green' } else { 'Yellow' })
  Write-Host '  0 PASS · 2 FAIL · 3 ÖLÇÜLEMEYEN · 1 DURDU · 4 KİMLİK/HEDEF REDDİ · 7 KANIT YAZILAMADI · 5 PERSONEL/DOSYA KAPANIŞI · 6 PORTAL ERİŞİMİ KAPANDIĞI DOĞRULANMADI · 91 NODE BAŞLATILAMADI'
  # R03-e/f: ürün bulgusu ADAYI (koşucu: sessionClass200 karar tablosunun ADAY hücreleri — T1, TG, T3, T1s, T2, T4; P7-C2 PASS / FAIL ayrımı yok; kanıtta
  # portalClose.sessionVersion.sinif=ADAY) "ADAYI" diye gösterilir — kesin bulgu (B hücresi: P7-C2 PASS + P7-C5 PASS) gibi yazılmaz.
  if ($finding) { Write-Host ("  $finding — " + $(if ($closure.findingCandidate) { 'bu bir ÜRÜN BULGUSU ADAYIDIR (CLIENT doğrular)' } else { 'bu bir ÜRÜN BULGUSUDUR' }) + "; kapanış PASS SAYILMAZ. CLIENT'a bildirin.") -ForegroundColor Red }
  # R03-e: portal erişimi HTTP ölçümlerinden sonra AÇIKSA (kanıttaki portalClose.acikErisim) AYRI satır — ürün bulgusu satırıyla BİRLEŞTİRİLMEZ (oturum reddini
  # Recover düzeltemez). R03-f: satırın Recover metni koşucudan gelir ve Run'ın kapatma çağrılarına bağlıdır — son çağrı 401/403 ise Recover'ın kapatabildiği
  # ÖLÇÜLMEDİ, aksi halde Recover kapatmayı yeniden dener (sonuç Recover kanıtında); Recover yalnız AYRI owner onayıyla, aşağıdaki öneriye bakın.
  if ($closure.acikErisim) { Write-Host ("  PORTAL ERİŞİMİ: {0}" -f $closure.acikErisim) -ForegroundColor Yellow }
  # R03: kurulum yarıda kaldıysa (koşucu kanıtındaki setup.durum TAMAM değil) bilgi satırı — kapanışın sonucu yukarıdaki kapanış satırındadır.
  if ($closure.setupDurum -and $closure.setupDurum -ne 'TAMAM') {
    Write-Host ("  KURULUM YARIM KALDI (kanıttaki setup alanı): durum={0} · son aşama={1} · makbuz dosyası={2} — Run'ın kendi kapanışının sonucu yukarıdaki kapanış satırındadır; ayrıntı kanıttaki setup ve fatal alanlarında. Bu bilgi Recover yetkisi DEĞİLDİR." -f $closure.setupDurum, $closure.setupAsama, $closure.setupMakbuz) -ForegroundColor Yellow
  }
  if ($closure.keptText) {
    Write-Host "  Mesaj kalıntısı: $($closure.keptText)" -ForegroundColor Cyan
    Write-Host '  (Parantez içindeki kapanış özeti koşucunun kanıttaki U-CLOSE ve portal DB ölçümünden kurulur (R03; sabit ifade değildir). Kapanışın tamamı' -ForegroundColor Cyan
    Write-Host '   yukarıdaki "Portal erişim kapanışı ..." satırındadır (parçalar kanıttaki verdict''lerden). Hedeflenen kapanış = dosyalar CLOSED + personel' -ForegroundColor Cyan
    Write-Host '   pasif + portal pasif; tenant yaşam döngüsü DEĞİŞMEZ.)' -ForegroundColor Cyan
  } else { Write-Host '  Mesaj kalıntısı ÖLÇÜLEMEDİ (kanıt satırı yok) — satırlar silinmiş DEĞİLDİR; CLIENT inceler.' -ForegroundColor Yellow }
  if ($waitV -eq 'UNMEASURED' -and $decl) {
    if ($decl.girisSonrasiEkran -ceq 'M') { Write-Host '  Koşucu telefon girişi görmedi ama owner girişten sonra portalın açıldığını (ana sayfa/mesaj sayfası) beyan etti — İNCELEME GEREKİR (FAIL adayı).' -ForegroundColor Yellow }
    else { Write-Host '  Telefondan başarılı giriş görülmedi — ÖLÇÜLEMEYEN.' -ForegroundColor Yellow }
  }
  if ($decl -and $closure.reply2Verdict -eq 'PASS' -and $decl.ikinciYanitGoruldu -ceq 'H') { Write-Host '  Koşucu 2. personel yanıtını yazdı ama owner mesaj sayfasında görmediğini beyan etti — İNCELEME GEREKİR (görüntüleme/yenileme).' -ForegroundColor Yellow }
  if ($decl -and $decl.yenilemeSonrasiEkran -ceq 'M') { Write-Host '  Owner, kapanıştan sonra yenilemede portal içeriğinin (mesaj sayfası/ana sayfa) hâlâ açık olduğunu beyan etti — ÜRÜN BULGUSU ADAYI; CLIENT inceler.' -ForegroundColor Red }
  if ($rc -eq 5 -or $rc -eq 6) {
    Write-Host '  KAPANIŞ DOĞRULANMADI: Run kendi kapanış adımlarını koşucu İÇİNDE denedi; bu çıkış kodu Recover YETKİSİ DEĞİLDİR ve bu blok Recover BAŞLATMAZ.' -ForegroundColor Yellow
    Write-Host '  Önce kanıtı inceleyin (d7-evidence.json: kurtarma/inceleme nedeni ve açık kalan kaynaklar) ve sonucu CLIENT''a bildirin. Kanıttaki kurtarma adımı' -ForegroundColor Yellow
    # R03-c / R03-d: makbuz dosyasının durumu (okuma kapısı + kanıttaki son makbuz metniyle eşitlik; BAYAT) ölçülür. R04 (owner kararı 2026-10-04): kanıtta
    # (R04-b: koşucunun kanıta yazdığı kurtarma adımı da aynı seçeneği gösterir — elle komut koşucudan kaldırıldı → metin "elle komut yerine" demez.)
    # makbuz metni (recovery.makbuzJson) VARSA öneri bu bloğun -RunEvidenceDir seçeneğidir — makbuzu blok, AYRI Recover onayından sonra Run
    # kanıt dizininin DIŞINA (kardeş dizin) yazar ve doğrular; kanıt dizinindeki makbuz dosyası -ReceiptFile ile ÖNERİLMEZ (Recover recover-* dizinini makbuzun
    # yanında açar → Run kanıt dizini değişir). Kanıtta makbuz metni yoksa R03-d dalları aynen (ya da SOMUT ENGEL).
    $rs = Get-ReceiptFileState (Join-Path $EvDir 'd7-setup-receipt.json') $closure.makbuzJson
    if ($closure.makbuzJson) {
      Write-Host '  bir ÖNERİDİR (otomatik DEĞİL; ürün bulgusu varsa Recover onu DÜZELTMEZ): Recover yalnız kanıt incelendikten sonra AYRI owner onayıyla, BİR KEZ, bu blokla şu seçenekle başlatılır (kanıttaki kurtarma adımı da bu seçeneği gösterir). Kabulü TEKRARLAMAYIN.' -ForegroundColor Yellow
      Write-Host ("    -Mode Recover -RunEvidenceDir '{0}'" -f $EvDir.Replace("'", "''")) -ForegroundColor Yellow
      Write-Host '  Bu seçenekte blok, Recover başlamadan önce: kaynağı doğrular (SHA256-MANIFEST.txt satırı = d7-evidence.json sha256 ve manifestteki her dosya; kayıt türü Run; runId ve kimlik alanları; GO defteri satırı), makbuzu kanıttaki recovery.makbuzJson alanından Run kanıt dizininin DIŞINDA kardeş bir dizine (<kanıt dizini>.recover-girdi-<UTC zaman>) yazar, baytları geri okur ve Run kanıtı + manifestin değişmediğini ölçer; biri tutmazsa Recover BAŞLAMAZ. Run kanıt dizinine ve manifeste yazmaz.' -ForegroundColor Yellow
      # R04-c (K2): bu durumda blok -ReceiptFile'ı da REDDEDER (Recover modunun kapısı: manifesti olan dizin + kanıtta makbuz metni) — metin bunu söyler.
      Write-Host ("  Kanıt dizinindeki makbuz dosyası (d7-setup-receipt.json): {0} — bu dosyayı -ReceiptFile ile VERMEYİN: Recover recover-* dizinini makbuzun yanında açar (Run kanıt dizini değişir); blok bu durumda o yolu REDDEDER (DUR)." -f $rs.why) -ForegroundColor Yellow
    } elseif ($rs.usable) {
      Write-Host '  bir ÖNERİDİR: -Mode Recover -ReceiptFile <makbuz> yalnız AYRI owner onayıyla, BİR KEZ (ürün bulgusu varsa Recover onu DÜZELTMEZ). Kabulü TEKRARLAMAYIN.' -ForegroundColor Yellow
      Write-Host ('  Makbuz dosyası: {0} (kanıt dizinindeki d7-setup-receipt.json; kayıt türü + runId okundu — kimlik bağını koşucu Recover''da DB''de doğrular).' -f $rs.why) -ForegroundColor Yellow
      # R04-c (K2): kanıtta makbuz metni yokken -RunEvidenceDir kullanılamaz; kalan tek yol -ReceiptFile'dır ve kanıt dizinine YAZAR — açıkça yazılır (Recover başında da gösterilir).
      Write-Host ("  DİKKAT: kanıtta makbuz metni (recovery.makbuzJson) yok → -RunEvidenceDir kullanılamaz; {0}. Bu yolu kullanma kararı owner / CLIENT'a aittir." -f (Get-RunDirWriteNote)) -ForegroundColor Yellow
    } else {
      Write-Host ("  bir ÖNERİDİR — ama MAKBUZ DOSYASI {0} (kanıt dizinindeki d7-setup-receipt.json): bu dosyayla Recover ÖNERİLMEZ{1}." -f $rs.why, $(if ($rs.stale) { '' } else { ' — bu makbuzla bloktan Recover BAŞLATILAMAZ (Recover makbuzu dosyadan okur; -ReceiptFile mevcut bir makbuz dosyası ister)' })) -ForegroundColor Yellow
      Write-Host '  SOMUT ENGEL: kanıtta makbuz metni (recovery.makbuzJson) YOK ya da kanıt okunamadı — bu paketle Recover BAŞLATILAMAZ; makbuzsuz kapanış yolu tanımlı değildir (K-7). Açık kalan sentetik kaynaklar için karar owner/CLIENT''a aittir: kanıt dizinini ve d7-run.log''u CLIENT''a iletin.' -ForegroundColor Red
    }
    Write-Host '  Recover ayrı bir CANLI YAZMA işlemidir (sentetik personeli geçici yeniden aktifleştirme + parola özeti, pasif portal hesabına ölçüm parolası özeti,' -ForegroundColor Yellow
    Write-Host '  kapatma audit satırı, personel/dosya kapanışı); "BİR KEZ" kuralı kodla ZORLANMAZ; ikinci bir Recover bu paketle TANIMLI DEĞİLDİR (owner kararı' -ForegroundColor Yellow
    Write-Host '  gerektirir) — ayrıntı paket belgesi §8.1.' -ForegroundColor Yellow
  }
  Write-Host "  kanıt dizini: $EvDir"
  Write-Host '  Bu pencereyi ŞİMDİ kapatın (kaydırma arabelleği). GO ref ve parola bildirmeyin. Mesaj satırları kanıt olarak DB''de KALIR.'
  return $rc
}

# ---------------------------------------------------------------- RECOVER
function Invoke-RecoverMode($g, [string]$receiptPath, [string]$runEvidenceDir = '') {
  $rc = 90
  if ($runEvidenceDir -and $receiptPath) { Fail '-ReceiptFile ile -RunEvidenceDir BİRLİKTE verilemez — makbuz kaynağı tek olmalı (yalnız biri)' }
  # R04: makbuz YALNIZ owner'ın AYRI Recover onayından (bu modu -RunEvidenceDir ile ayrıca başlatması; blok bu onayı SORMAZ ve ÖLÇMEZ) SONRA yazılır; Recover bu
  # dosyayla başlar. Kaynak doğrulanamazsa ya da yazım / geri okuma tutmazsa New-RecoverInputFromRun DURUR (node çağrılmaz).
  # R04-c (K3): New-RecoverInputFromRun yol + kayda yazılan makbuz özetini döndürür; makbuz node'dan önce bu özetle yeniden karşılaştırılır.
  $rin = $null; $inEvidenceDir = $false
  if ($runEvidenceDir) { $rin = New-RecoverInputFromRun $runEvidenceDir; $receiptPath = [string]$rin.path }
  if (-not $receiptPath -or -not (Test-Path -LiteralPath $receiptPath -PathType Leaf)) { Fail 'Recover için -ReceiptFile <makbuz yolu> ya da -RunEvidenceDir <tamamlanmış Run kanıt dizini> gerekli' }
  # R04: KULLANILMAZ diye işaretlenmiş bir Recover girdisi dizinindeki makbuz (yarım yazım / doğrulanamayan çıkarma) -ReceiptFile ile de KABUL EDİLMEZ.
  $rcptDir = Split-Path -Parent $receiptPath
  if ($rcptDir -and (Test-Path -LiteralPath (Join-Path $rcptDir 'RECOVER-GIRDI-KULLANILMAZ.txt') -PathType Leaf)) { Fail 'makbuz KULLANILMAZ diye işaretlenmiş bir Recover girdisi dizininde (RECOVER-GIRDI-KULLANILMAZ.txt; neden o dosyada) — bu makbuzla Recover BAŞLAMAZ' }
  # R04-c (K2): -ReceiptFile ile verilen makbuz manifesti olan (tamamlanmış) bir kanıt dizininin İÇİNDEyse — kanıtta makbuz metni varsa DUR (-RunEvidenceDir'e yönlendirir);
  # yoksa tek kalan yol olduğu için sürer, kanıt dizininin DEĞİŞECEĞİ ekrana yazılır (Recover bilgi metninden ÖNCE). Manifesti olmayan dizin: davranış değişmedi.
  if (-not $runEvidenceDir) { $inEvidenceDir = [bool](Assert-ReceiptFileRoute $rcptDir) }
  $rcpt = Get-Content -Raw -Encoding UTF8 -LiteralPath $receiptPath | ConvertFrom-Json
  if ($rcpt.record -ne 'EXTACC-D7-SETUP-RECEIPT' -or $rcpt.runId -notmatch '^[0-9a-f]{8}$') { Fail 'makbuz biçimi tanınmadı' }
  # Bilgi metni (yalnız gösterim; soru/akış YOK): Recover'ın canlı yazma kümesi ve yetki kuralı. Blok owner onayını ve "BİR KEZ" kuralını ÖLÇMEZ.
  Write-Host ''
  Write-Host "EXTACC D-7 RECOVER BAŞLIYOR (runId=$($rcpt.runId)) — yalnız kapanış; Run'ın koşucu içindeki kendi kapanış adımlarından AYRI bir CANLI YAZMA işlemidir." -ForegroundColor Yellow
  Write-Host '  Bu Recover, Run kanıtı incelendikten sonra AYRI owner onayıyla başlatılmış olmalıdır; Run çıkış 5/6 tek başına Recover yetkisi DEĞİLDİR.' -ForegroundColor Yellow
  Write-Host '  Blok bu onayı SORMAZ ve ÖLÇMEZ; "BİR KEZ" kuralı kodla ZORLANMAZ (blok ve koşucu ikinci bir Recover''ı engellemez).' -ForegroundColor Yellow
  Write-Host '  Recover canlıya şunları YAZAR (koşucu kaynağından okundu; canlıda koşulmadı):'
  Write-Host '   1) Portal hâlâ açıksa: makbuzdaki sentetik personel GEÇİCİ olarak yeniden aktifleştirilir ve parola özeti yeniden yazılır; o personelle yerel'
  Write-Host '      API''de oturum açılır ve yetkili uç çağrılır (admin/disable-user, en çok 2 deneme); çağrı 2xx dönerse ürün şunları yazar: portal hesabı'
  Write-Host '      pasif + sürüm artışı, müvekkil portal erişimi kapalı, kapatma audit satırı (aktör: sentetik personel); 401/403''te kapatma yapılmaz'
  Write-Host '      (sonuç Recover kanıtında: P7-C1 / P7-C2 satırları ve portalClose.acikErisim).'
  Write-Host '   2) Portal DB''de kapalı durumdaysa (1. adımla ya da önceden): pasif portal hesabına YALNIZ ölçüm için yeni rastgele parola özeti yazılır'
  Write-Host '      (hesap pasif kalır); bu parolayla yerel ve dış adresten giriş DENENİR (401 beklenir).'
  Write-Host '   3) Personel/dosya kapanışı (closeAccess): iki sentetik tenantın TÜM kullanıcıları pasif + sürüm artışı (her Recover''da yeniden artar),'
  Write-Host '      açık dosyalar CLOSED. 1. adımda aktifleştirilen personel burada yeniden pasifleştirilir; bu adım doğrulanmazsa personel AKTİF kalmış'
  Write-Host '      olabilir (çıkış 5; portal da doğrulanmadıysa 6). Tenant kaydı değiştirilmez; mesaj ve bildirim satırları SİLİNMEZ.'
  Write-Host '   4) Makbuzun yanında yeni bir recover-* kanıt dizini (d7-evidence.json, d7-recover.log, SHA256-MANIFEST.txt). GO defteri değişmez.'
  Write-Host '      -RunEvidenceDir ile başlatıldıysa makbuz, Run kanıt dizininin KARDEŞİ olan Recover girdisi dizinine yazılmıştır ve recover-* dizini de oradadır'
  Write-Host '      (Run kanıt dizinine ve manifestine yazılmaz).'
  Write-Host '  Recover U-ISO ölçmez; portal hesabı varken mevcut oturum reddi Recover''da ÖLÇÜLEMEZ (bu durumda en iyi çıkış 3).'
  Write-Host '  Kimlik bağı doğrulanmazsa koşucu canlı DB''ye yazmadan durur (çıkış 4).'
  # R04-c (K3): geri okuma doğrulaması ile node başlangıcı arasında makbuz değişirse Recover BAŞLAMAZ — sha256 iki noktada yeniden ölçülür ve kayda yazılan özetle
  # karşılaştırılır: (1) Recover kanıt dizini (recover-*) açılmadan ÖNCE (fark varsa dizin açılmaz), (2) node çağrısından HEMEN ÖNCE. Fark → dizin KULLANILMAZ + DUR.
  $rcptShaBefore = $null; if ($rin) { $rcptShaBefore = Assert-RecoverInputUnchanged $rin 'Recover kanıt dizini açılmadan önce' }
  $EvDir = Join-Path (Split-Path -Parent $receiptPath) ("recover-{0}-{1}" -f (Get-Date -Format 'yyyyMMdd-HHmmss'), [Guid]::NewGuid().ToString('N').Substring(0, 6))
  New-Item -ItemType Directory -Force -Path $EvDir | Out-Null
  try {
    Set-RunEnv $rcpt.runId $EvDir
    $env:D7_MODE = 'recover'; $env:D7_RECOVER_CONFIRM = '1'; $env:D7_RECEIPT = $receiptPath; $env:D7_DISPLAY = 'conout'
    $evid = $env:D7_EVID_FILE
    Assert-FreshEvidence $evid
    if ($rin) { $rcptShaBefore = Assert-RecoverInputUnchanged $rin 'node çağrısından hemen önce' }
    $rc = Invoke-Node $g.nodeExe (Join-Path $Sc 'd7-portal-messages-live-run.js') (Join-Path $EvDir 'd7-recover.log')
    $rc = Complete-NodeRc $rc $evid
  }
  finally { Clear-SecretEnv; Write-Manifest $EvDir }
  $closure = Get-ClosureStatus (Join-Path $EvDir 'd7-evidence.json') $rc
  # R03-d (M2): kod açıklamaları YALNIZ okunabilir kanıt VARKEN (Get-RecoverEvidenceState) — kanıt yoksa "… doğrulandı" türü hiçbir açıklama yazılmaz.
  $es = Get-RecoverEvidenceState (Join-Path $EvDir 'd7-evidence.json') $rc
  if (-not $es.valid) {
    Write-Host ("EXTACC D-7 KURTARMA BİTTİ - RUNID={0} · çıkış={1} — KAPANIŞ DOĞRULANMADI — {2}. Bu Recover'ın kanıtından hiçbir kapanış okunamaz; çıkış kodu açıklamaları (0/1/2/3/5/6) yalnız okunabilir kanıt VARKEN geçerlidir (4 = koşucu kapısı / kimlik reddi, yazma yok · 7 = kanıt yazılamadı · 91 = node başlatılamadı). Neden: recover dizinindeki d7-recover.log." -f $rcpt.runId, $rc, $es.why) -ForegroundColor Red
  } else {
  # R03: çıkış kodu açıklaması yalnız koşucunun recoverExitCode kuralını söyler (sabit "doğrulandı" iddiası yok; 1 ve 2 dahil).
  # R03-c: mevcut oturum reddinin Recover'da HER ZAMAN ölçülemediği ve yeni giriş reddinin P7-C3L/D'den okunduğu kodlardan ÖNCE, her kod için yazılır;
  #        1 ve 2 neyin doğrulandığını adlandırır (portal DB kapanışı ya da hesap yok + personel/dosya kapanışı; HTTP reddi DEĞİL).
  # R03-d (m3): 3'ün metni ölçülenle — portalDbClosed P7-C2V için yalnız "FAIL değil" ister (ÖLÇÜLEMEYEN olabilir); 2 ve 1 "3'teki portal ölçütleri" ile buna atıf yapar.
  Write-Host "EXTACC D-7 KURTARMA BİTTİ - RUNID=$($rcpt.runId) · çıkış=$rc (HER KODDA: mevcut oturum reddi Recover'da ÖLÇÜLEMEZ — HER ZAMAN (P7-C4L/D; koşumun portal oturumu saklanmaz; Run kanıtındaki P7-C4 satırlarına bakın; PASS SAYILMAZ); yeni giriş reddinin ölçülüp ölçülmediği kanıttaki P7-C3L/D satırlarından okunur · 0 = FAIL ve ÖLÇÜLEMEYEN satır yok — koşucu mantığında fiilen beklenmez: portal hesabı varken mevcut oturum reddi ölçülemediği için en iyi sonuç 3'tür, hesap yoksa mesaj kalıntısı ÖLÇÜLEMEYEN olur (paket belgesi §9) · 3 = FAIL yok, en az bir ölçüt ÖLÇÜLEMEYEN — P7-C2 / P7-C5 ölçüldü; P7-C2V FAIL değil (ÖLÇÜLEMEYEN olabilir — kanıttaki satır) ya da portal hesabı yok; personel/dosya kapanışı doğrulandı · 2 = 3'teki portal ölçütleri (ya da portal hesabı yok) ve personel/dosya kapanışı doğrulandı, hazırlık hatası yok, en az bir satır FAIL (Recover'da yalnız P7-MSG-KEPT: makbuzdaki koşucu mesaj satırlarından biri yerinde değil) · 1 = DURDU: 3'teki portal ölçütleri (ya da portal hesabı yok) ve personel/dosya kapanışı doğrulandı ama hazırlık adımında hata (kanıttaki fatal alanı; HTTP reddinin doğrulandığı anlamına GELMEZ — satırlar ayrıca okunur) · 6 portal DB/HTTP kapanışı doğrulanmadı · 5 personel/dosya kapanışı doğrulanmadı · 4 kimlik reddi (yazma yok) · 7 kanıt yok · 91 node başlatılamadı)" -ForegroundColor $(if ($rc -eq 0) { 'Green' } else { 'Yellow' })
  }
  # R04: portal erişimi SON ÖLÇÜME göre (bu Recover'ın kanıtı) AÇIK / KAPALI / ÖLÇÜLEMEDİ — kod açıklamalarından AYRI satır; kanıt okunamıyorsa ÖLÇÜLEMEDİ.
  # R04-c (K1): DB KAPALI iken gösterilen ad ve renk kanıttaki yeni giriş reddi ölçütlerine (P7-C3L/D) bağlıdır — yeşil yalnız DB kapalı + ikisi PASS iken
  # (Get-RecoverPortalAccess: goster / renk). Çıkış kodu bu satırdan ETKİLENMEZ.
  $pa = Get-RecoverPortalAccess (Join-Path $EvDir 'd7-evidence.json') $es
  Write-Host ("  PORTAL ERİŞİMİ (son ölçüme göre, bu Recover'ın kanıtından; DB durumu + yeni giriş reddi ölçütleri): {0} — {1}. Yeni giriş reddi kanıttaki P7-C3L/D satırlarından okunur; mevcut oturum reddi Recover'da ÖLÇÜLEMEZ." -f $pa.goster, $pa.text) -ForegroundColor $pa.renk
  # R04-c (K2): -ReceiptFile ile manifesti olan kanıt dizinindeki makbuz kullanıldıysa (tek kalan yol) o dizinin değiştiği bitişte de yazılır.
  if ($inEvidenceDir) { Write-Host ("  NOT (-ReceiptFile, manifesti olan kanıt dizini): {0}. Bu Recover'ın kanıt dizini (recover-*) o dizinin İÇİNDEDİR." -f (Get-RunDirWriteNote)) -ForegroundColor Yellow }
  # R04-c (K3; D-6 R04-b satırının ikizi): doğrulanmış Recover girdisi (makbuz) Recover'dan SONRA yeniden ölçülür — değiştiyse RECOVER-GIRDI-KAYDI.json'daki özet artık
  # dosyayı anlatmaz (kırmızı). D-7 koşucusu Recover'da makbuza yazmaz (R04-b notu); satır bunu ÖLÇEREK gösterir. Çıkış kodu bu satırdan ETKİLENMEZ.
  if ($runEvidenceDir) {
    $rcptShaAfter = $null; try { $rcptShaAfter = Sha $receiptPath } catch { $rcptShaAfter = $null }
    if ($rcptShaAfter -and $rcptShaBefore -and $rcptShaAfter -ceq $rcptShaBefore) { Write-Host ("  RECOVER GİRDİSİ (makbuz): Recover'dan sonra DEĞİŞMEDİ (sha256 önce = sonra = {0}; D-7 koşucusu Recover'da makbuz dosyasına yazmaz)." -f $rcptShaAfter) }
    else { Write-Host ("  RECOVER GİRDİSİ (makbuz): Recover'dan sonra DEĞİŞTİ ya da okunamadı (sha256 önce={0} · sonra={1}) — RECOVER-GIRDI-KAYDI.json'daki makbuzSha256 Recover'dan ÖNCEKİ baytlara aittir; kanıt dizinini CLIENT'a iletin." -f $rcptShaBefore, $(if ($rcptShaAfter) { $rcptShaAfter } else { 'okunamadı' })) -ForegroundColor Red }
  }
  if ($closure.keptText) {
    Write-Host "  Mesaj kalıntısı: $($closure.keptText)" -ForegroundColor Cyan
    Write-Host '  (Parantez içindeki kapanış özeti koşucunun kanıttaki U-CLOSE ve portal DB ölçümünden kurulur (R03; sabit ifade değildir). Kapanış durumu' -ForegroundColor Cyan
    Write-Host '   yukarıdaki çıkış kodu satırındadır (Recover''da ayrı bir DOĞRULANDI / DOĞRULANAMADI satırı gösterilmez). Hedeflenen kapanış = dosyalar CLOSED +' -ForegroundColor Cyan
    Write-Host '   personel pasif + portal pasif; tenant yaşam döngüsü DEĞİŞMEZ.)' -ForegroundColor Cyan
  }
  if ($rc -eq 3 -and $es.valid) { Write-Host '  Recover TEKRARLANMAZ; ölçülemeyen satırlar Run kanıtıyla birlikte CLIENT tarafından değerlendirilir.' -ForegroundColor Yellow }
  Write-Host '  Bu çıkış kodu yeni bir Recover için yetki DEĞİLDİR; Recover BİR KEZ koşulur (kodla zorlanmaz); sonuç CLIENT''a bildirilir.' -ForegroundColor Yellow
  Write-Host '  İkinci bir Recover bu paketle TANIMLI DEĞİLDİR; owner kararı gerektirir.' -ForegroundColor Yellow
  Write-Host "  kanıt dizini: $EvDir"
  return $rc
}

# ---------------------------------------------------------------- QR DENEMESİ (canlı veri YOK)
function Invoke-QrTestMode($g) {
  Assert-LocalConsole
  Confirm-PortalBaseUrlR05
  $rc = 90
  try {
    $env:EXA_QRTEST_URL = "$ExpBaseUrl/portal/messages"
    $rc = Invoke-Node $g.nodeExe (Join-Path $Sc 'd7-qr-test.js') ([IO.Path]::Combine([IO.Path]::GetTempPath(), 'extacc-d7-qrtest.log'))
  } finally { Clear-SecretEnv }
  if ($rc -ne 0) { Fail "QR denemesi gösterilemedi (çıkış $rc)" }
  $a = Read-Answer 'Telefon QR''ı okudu ve portal sayfası (mesaj sayfası ya da giriş sayfası) açıldı mı? (E/H) — giriş YAPMAYIN'
  Clear-OwnerScreen
  $read = if ($a -ceq 'E') { 'OKUNDU' } elseif ($a -ceq 'H') { 'OKUNAMADI' } else { 'BELİRSİZ' }
  $qrc = if ($read -eq 'OKUNDU') { 0 } elseif ($read -eq 'OKUNAMADI') { 2 } else { 3 }
  Write-Host ("QR DENEMESİ: gösterim=BAŞARILI (makine) · telefon okuma={0} (owner beyanı: [{1}]) · çıkış={2}" -f $read, $a, $qrc) -ForegroundColor $(if ($qrc -eq 0) { 'Green' } else { 'Yellow' })
  if ($qrc -ne 0) { Write-Host '  QR okunmadı ya da yanıt belirsiz: canlı koşumdan ÖNCE CLIENT''a bildirin.' -ForegroundColor Yellow }
  return $qrc
}

# ================================================================ AKIŞ
# Öz-test bu dosyanın yalnız fonksiyonlarını AST ile yükler; aşağıdaki akış öz-testte ÇALIŞMAZ.
$rc = 90
Clear-SecretEnv
try {
  $g = Invoke-ReadOnlyGates

  if ($Mode -eq 'Preflight') {
    Assert-ExternalChain $g.chain
    Write-Host ('PREFLIGHT GEÇTİ (salt okuma; kanıt/DB/ortam/canlı dosya yazılmadı) · main={0} · paket={1} · dist={2} ({3} dosya; R27) · .env={4} · API pid={5} · portal base host={6} · node={7}' -f `
      $g.head.Substring(0, 8), $g.pkg.Substring(0, 16), $g.dist.Substring(0, 16), $g.distFiles, $g.envSha.Substring(0, 16), $g.apiPid, $g.baseHost, $g.nodeVersion) -ForegroundColor Green
    Write-Host ('  dış zincir DOĞRULANDI: 8081 yalnız 127.0.0.1 (dinleyici pid={0} = HY-Caddy servisi) · Cloudflared={1}' -f $g.chain.loopbackPids, $g.chain.cloudflaredStatus)
    $rc = 0
  }
  elseif ($Mode -eq 'QrTest') { $rc = Invoke-QrTestMode $g }
  elseif ($Mode -eq 'Run') { $rc = Invoke-RunMode $g }
  else { $rc = Invoke-RecoverMode $g $ReceiptFile $RunEvidenceDir }
}
catch {
  if ($_.Exception.Message -notlike 'EXTACC-D7-DUR:*') { Write-Host "DUR - beklenmeyen hata: $($_.Exception.Message)" -ForegroundColor Red }
  $rc = if (($script:LastNodeRc -is [int]) -and $script:LastNodeRc -ne 0) { $script:LastNodeRc } else { 90 }
}
finally { Clear-SecretEnv }
if (-not ($rc -is [int])) { $rc = 91 }
exit $rc
