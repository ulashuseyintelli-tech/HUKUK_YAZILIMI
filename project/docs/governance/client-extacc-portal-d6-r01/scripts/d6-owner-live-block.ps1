# ═══════════ EXTACC D-6 R01 PORTAL BELGE AKIŞI + PORTAL ERİŞİM KAPANIŞI - OWNER BLOĞU (normal PowerShell; YÖNETİCİ GEREKMEZ) ═══════════
# MODLAR
#   -Mode Preflight  SALT OKUMA: tüm kapılar (canlı dist = R27 pini; uygulama sırası yayından SONRA); GO sorulmaz; kanıt/ortam/DB/canlı dosya yazılmaz; koşucu çağrılmaz (yalnız `node --version`). Kapılardaki `git fetch` yerel repodaki uzak izleme ref'lerini günceller (iş verisi değildir).
#   -Mode QrTest     Canlı veri YOK: portal BELGELER sayfasının (/portal/documents) QR'ı yerel konsolda gösterilir; owner telefonla okutur.
#   -Mode Run        TEK SEFERLİK canlı koşum: kapılar → bağımsız pencere teyidi → canlı veri işleme onayı → GO (yerel) → GO defteri (yalnız sha256,
#                    koşumdan ÖNCE) → koşum (koşucu: kendi yüklemesi/liste/indirme/kapsam dışı 404; 1. konsol: QR + giriş bilgisi; telefon girişi;
#                    koşucu silmesi; 2. konsol: "liste boş olmalı") → ekran temizliği → owner beyanı (ayrı dosya) → kanıt manifesti.
#   -Mode Recover    Yalnız kapanış (portal + belge kalıntısı + yabancı satır + personel/dosya); `-ReceiptFile` zorunlu; GO sorulmaz; kabul ölçütleri
#                    koşulmaz. Kalan belge satırları için owner kararı sorulur (Prisma ile satır silme; DOSYA SİLİNMEZ, listelenir).
#                    Run'ın koşucu İÇİNDEKİ kendi kapanış adımlarından AYRI bir işlemdir: otomatik DEĞİLDİR; Run çıkış 5/6 Recover yetkisi
#                    DEĞİLDİR — önce kanıt incelenir, açık kalan kaynaklar bildirilir, Recover yalnız AYRI owner onayıyla, BİR KEZ başlatılır.
#                    Bu blok Recover'ı kendiliğinden başlatmaz. Recover çıkış 6 yeni bir Recover için yetki DEĞİLDİR; İKİNCİ bir Recover bu
#                    paketle TANIMLI DEĞİLDİR, owner kararı gerektirir.
# YAN ETKİ: belge uçları yalnız PortalDocument satırı + disk dosyası + API log satırı; bildirim/e-posta/outbox/audit/event YOK (kaynak: HY_WT_R27).
#          Yükleme günlük satırı dosya ADINI maskesiz yazar (koşucu: sentetik ad; telefon yüklemesi: owner'ın seçtiği dosyanın adı). Ürün
#          DELETE'i yalnız dosyayı siler: kapanıştan sonra sentetik tenantın BOŞ kova dizini diskte kalır (saklandı; kaynaktan, canlıda ölçülmedi).
# YAPMAZ : forgot/reset/change-password, mesaj, belge onay/ret uçları çağrılmaz · koşucu dosya SİLMEZ (yalnız ürün DELETE'i) ·
#          .env/görev/Caddy/tünel/DNS değişikliği · yeniden başlatma · otomatik tekrar · otomatik Recover.
# SIR    : DB URL, personel parolası, GEÇİCİ PORTAL PAROLASI, GO ref ve token'ları bu blok ve koşucu KENDİ kanıt/log dosyalarına YAZMAZ.
#          KAPSAM (ölçülen): blok → kanıt dizinindeki owner-block.json, goref-consumed.json, owner-declaration.json, SHA256-MANIFEST.txt ve GO
#          defteri (GO'nun yalnız sha256'sı): GO literali, DB URL ve geçici portal parolası YOK — blok öz-testi R-9 + G-1 (geçici node ile).
#          Koşucu → d6-evidence.json, d6-setup-receipt.json ve çıktısının yönlendirildiği d6-run.log / d6-recover.log: parolalar, oturum
#          token'ı, DB URL ve GO YOK — koşucu öz-testi S-1 (sahte API'ye karşı). KAPSAM DIŞI (ÖLÇÜLMEDİ): canlı API uygulama günlüğü,
#          işletim sistemi / terminal kayıtları ve owner'ın beyan sorularına kendi yazdığı yanıt metni.
#          Parola yalnız bu konsol penceresine çizilir; pencereyi kaydeden bir terminal KULLANMAYIN; koşum sonunda pencereyi kapatın.
# R02    : (2026-10-01) yalnız METİN değişti (yorum · owner'a gösterilen çıktı · kapanış metninin kanıttan kurulması); kapılar, sıra, pinler,
#          koşucu çağrısı ve çıkış kodları DEĞİŞMEDİ. owner-block.json'daki `revision = 'R01'` alanı da DEĞİŞTİRİLMEDİ (mantık eşitliği);
#          bloğun metin revizyonu bu dosyanın sha256'sı ile ayırt edilir (paket belgesi §6); owner koşumdan ÖNCE bu dosyanın sha256'sını kaydeder.
#          R02 inceleme düzeltmeleri (ikinci tur; yine yalnız METİN): onay metninde kapsam + kova dizini tek adla, kapanış satırı ("bu satırın
#          devamında" + satır rengi notu), ikinci Recover ifadesi. Kod, yorum / Write-Host / istem metni dışında TEK yerde farklıdır: kapanış
#          metnindeki bir dize sabiti (owner'a gösterilen ve beyan dosyasına yazılan metin; ölçüm paket belgesi §9).
# R03    : (2026-10-03) koşucu değişti → PkgPins'teki koşucu pini + $ExpPackage güncellendi. Blokta yalnız METİN değişti: Recover bitiş
#          satırı 3'ü "yeni giriş reddi" diye İDDİA ETMEZ (P6-C3L/D satırlarına yönlendirir) ve 6'da belge kalıntısının DOĞRULANDI mı
#          ÖLÇÜLEMEDİ mi olduğunu kanıttaki P6-C-DOC satırına / docResidue.durum alanına bağlar. Kapılar, sıra, çıkış kodları DEĞİŞMEDİ.
#          Koşucu R03: Run'ın kendi kapanışında personel oturumu 401/403 ile reddedilirse tek yeniden giriş + tek yeniden deneme (Recover DEĞİL).
# R03-b  : (2026-10-03) koşucu yine değişti → koşucu pini + $ExpPackage güncellendi. Blokta yalnız METİN: Run'daki BELGE KALINTISI satırı kanıttaki
#          P6-C-DOC verdict'ine ve docResidue.durum alanına bağlandı (DOĞRULANDI ↔ ÖLÇÜLEMEDİ ayrı). Kapılar, sıra, çıkış kodları DEĞİŞMEDİ.
# R03-c  : (2026-10-03; owner talimatı: kapanış / Recover doğruluğu) koşucu yine değişti → koşucu pini + $ExpPackage güncellendi. Blokta yalnız METİN:
#          (a) Recover bitiş satırı her kodu yalnız ölçülenle açıklar (1 ve 2 dahil); mevcut oturum reddinin (P6-C4L/D) Recover'da HER ZAMAN
#          ölçülemediği ve yeni giriş reddinin P6-C3L/D satırlarından okunduğu kodlardan ÖNCE genel olarak yazılır; 0 artık "hiç açılmamıştı"
#          demez (ölçülen: Recover anında hesap DB'de yok). (b) Run çıkış 5/6 metni `-Mode Recover -ReceiptFile <makbuz>` önerisini YALNIZ kanıt
#          dizinindeki makbuz dosyası Recover'ın okuma kapısını geçiyorsa yazar (Get-ReceiptFileState: dosya + JSON + kayıt türü + runId); yoksa
#          uygulanamayan komut yerine kanıttaki receipt nesnesinden yeni makbuz dosyası yolu ya da (kanıtta da yoksa) SOMUT ENGEL yazılır.
#          Kapılar, sıra, Recover okuma kapısı, çıkış kodları DEĞİŞMEDİ. (R03-c ikinci commit: koşucuda yalnız hesap yokken P6-C1 satır
#          açıklaması değişti → koşucu pini + $ExpPackage yeniden güncellendi; blok metni değişmedi.)
# TOPOLOJİ: public portal adresi canlı .env'den okunur ve owner'ın konsola yazdığı R05 adresiyle doğrulanır; kanıt kökü $env:USERPROFILE'a görelidir
#          (bu dosyada canlı alan adı / yerel kullanıcı yolu literali yoktur). Canlı kök ($Rel) tek yerde tanımlıdır.
# ÇIKIŞ  : node kodu değiştirilmeden taşınır · 90 kapıda durdu · 91 node başlatılamadı / kod alınamadı · 7 kanıt yok.
param(
  [ValidateSet('Preflight', 'QrTest', 'Run', 'Recover')] [string]$Mode = 'Preflight',
  [string]$ReceiptFile = ''
)
$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $false

$Repo     = 'D:\Development\HUKUK_YAZILIMI\project'
$Gov      = Join-Path $Repo 'project\docs\governance'
$Sc       = Join-Path $Gov 'client-extacc-portal-d6-r01\scripts'
$Rel      = 'C:\Development\HUKUK_YAZILIMI\HY_W4_RELEASE23\project'
$EnvFile  = Join-Path $Rel 'apps\api\.env'
$LiveDist = Join-Path $Rel 'apps\api\dist\apps\api\src'
$EvRoot   = Join-Path $env:USERPROFILE 'Documents\CLIENT-EVIDENCE-20260911'   # kanıt kökü kullanıcı profiline göreli (public belgeye yerel kullanıcı yolu yazılmaz)
$GoLedger = Join-Path $EvRoot 'extacc-d6-goref-ledger.txt'
$Api      = 'http://127.0.0.1:8080/api'

# ---- PİNLER (uyuşmazlık OTOMATİK KABUL EDİLMEZ; blok durur) ----
$ExpLiveDist = 'E28A6863CF109A1A3AE1F53E096D5F5C2037E382EF2D8D3EC87FEE3B827E5134'   # R27 dist (D-6 canlı koşumu R27 yayınından SONRA); R26 canlı ile DURUR
$ExpEnvSha   = '5C776BBEEE018EA5CC8192378D42D742FD4ABC1B6D0E9A3EA671CF463206908D'   # canlı .env (H5 sonrası)
$ExpBaseUrl  = $null   # R05 public portal adresi: canlı .env PUBLIC_PORTAL_BASE_URL'den okunur (Invoke-ReadOnlyGates, biçim kapısı) ve Run/QrTest'te owner'ın konsola yazdığı R05 adresiyle birebir doğrulanır (Confirm-PortalBaseUrlR05). Public repoya host literali YAZILMAZ.
# Koşucunun YÜKLEDİĞİ tüm governance dosyaları + QR denemesi (require ağacı ölçüldü).
$PkgPins = [ordered]@{
  'client-extacc-portal-d6-r01\scripts\d6-portal-documents-live-run.js'               = '84D003D7DE242BF35613D1F0CF1362871765CEBD96AFCAE74E2C080471987017'
  'client-extacc-portal-d6-r01\scripts\d6-qr-test.js'                                 = 'C9FC15AADBFDF4AA87702542340EB6A5C68558D3FE6423F06DED8E452D85F418'
  'client-extacc-intake-chain-r01\scripts\extacc-display.js'                          = 'F257188DF66C429472C214D38D965C1E6F5A2EA490D348369AC68C5DC6F26867'
  'client-extacc-intake-chain-r01\scripts\vendor\qrcode-generator-1.4.4\qrcode.js'    = '18AE399F81182BC9DE916E9C77B195DF20CC58D6F2D55A62B085A299F1BF1780'
  'client-h5-intake-url-r01\scripts\h5-url-live-run.js'                               = 'F2D0975DC9F9D148E4C889472FA11AE6A873A6BDF577C36657ED9BCB4FF9C359'
  'client-live-acceptance-i13-r01\scripts\i13-lib.js'                                 = '59BA7360F270AB66D0A892659A7569AFF1800D65B49415EF5FAD3B84DFEDD385'
  'client-live-acceptance-i12-r01\scripts\i12-live-identity.js'                       = '9516E462CFFD3B22FD253F556A7F1853C6F021B175075449BD7945CCEF36774F'
  'client-acceptance-runners-i3-r01\scripts\i3-lib.js'                                = '56F3788E9F84746CFFEE384D8C18B9B9A28130CC8E2285F9570AB69CC6EE74A3'
  'client-acceptance-harness-r01\scripts\ah-lib.js'                                   = 'DF882DB7F33A667092F126F01E518C1A8292C8C0B3C4C039BF73D71F3ACCBFD7'
}
$ExpPackage = 'E8CFA86465F74A33EA2760818EB95FA327E0AFBAC74E03B6200E49718154FCB4'
$SecretEnv  = @('AH_DATABASE_URL', 'AH_PRISMA_ROOT', 'AH_BCRYPT_PATH', 'D6_LIVE_CONFIRM', 'D6_RECOVER_CONFIRM', 'D6_LIVE_GO_REF',
                'D6_RUNID', 'D6_MODE', 'D6_EXPECT_DB', 'D6_EXPECT_TENANT_SLUG', 'D6_API_BASE', 'D6_EXPECT_API',
                'D6_EXPECT_BASE_URL', 'D6_LIVE_LOGIN_PW', 'D6_RECEIPT', 'D6_EVID_FILE', 'D6_DISPLAY', 'EXA_QRTEST_URL',
                'D6_RESIDUE_CLEANUP', 'D6_TEST_DISPLAY_SINK',
                'D6_WAIT_MS', 'D6_POLL_MS', 'D6_VIEW_MS', 'D6_HTTP_TIMEOUT_MS', 'D6_CALL_TIMEOUT_MS', 'D6_LATE_CREATE_MS', 'D6_RESIDUE_WAIT_MS')
# CANLI SÜRELER — açıkça kurulur; pencereden devralınan değerler başta ve sonda SİLİNİR (koşucu da canlı DB'de bunları zorlar).
$LiveParams = [ordered]@{ D6_WAIT_MS = '1200000'; D6_POLL_MS = '5000'; D6_VIEW_MS = '120000'; D6_HTTP_TIMEOUT_MS = '15000'; D6_CALL_TIMEOUT_MS = '30000'
                          D6_LATE_CREATE_MS = '120000'; D6_RESIDUE_WAIT_MS = '300000' }
$script:LastNodeRc = $null

function Fail([string]$m) { Write-Host "DUR - $m" -ForegroundColor Red; throw "EXTACC-D6-DUR: $m" }
function Sha([string]$p) { (Get-FileHash -LiteralPath $p -Algorithm SHA256).Hash.ToUpperInvariant() }
function ShaText([string]$t) { ([BitConverter]::ToString([Security.Cryptography.SHA256]::Create().ComputeHash([Text.Encoding]::UTF8.GetBytes($t))) -replace '-', '').ToUpperInvariant() }
function Digest([System.Collections.Generic.List[string]]$lines) {
  $lines.Sort([StringComparer]::Ordinal); $sb = [System.Text.StringBuilder]::new(); foreach ($l in $lines) { [void]$sb.Append($l) }
  ShaText $sb.ToString()
}
function Invoke-RepoGit { $fwd = $Repo -replace '\\', '/'; & git.exe -c "safe.directory=$fwd" -C $Repo @args }
function EnvValue([string]$key, [switch]$Optional) {
  $hits = @(); foreach ($l in [IO.File]::ReadAllLines($EnvFile)) { if ($l -match ("^\s*" + [regex]::Escape($key) + "\s*=\s*(.*)$")) { $hits += $Matches[1].Trim().Trim('"').Trim("'") } }
  if ($Optional -and $hits.Count -eq 0) { return $null }
  if ($hits.Count -ne 1) { Fail "$key geçiş sayısı $($hits.Count) (1 bekleniyor)" }
  return $hits[0]
}
function Clear-SecretEnv { foreach ($k in $SecretEnv) { Remove-Item "Env:$k" -ErrorAction SilentlyContinue } }
# R05 public portal adresi (inceleme: canlı host literali public repoya yazılmaz). Biçim kapısı: https:// + yalnız alan adı (yol/port/sorgu/IP/localhost YOK).
function Assert-PortalBaseUrl([string]$u) {
  if ($u -notmatch '^https://[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$' -or $u -match '^https://\d+(\.\d+)+$') { Fail 'PUBLIC_PORTAL_BASE_URL biçimi https://<alan adı> olmalı (yol/port/sorgu/IP/localhost KABUL EDİLMEZ) — QR ve dış ölçüm bu adresle yapılır' }
  return $u
}
# R05 kontrolü: owner adresi konsola yazar; canlı .env değeriyle (kapılarda okunan) birebir eşleşmezse DUR (GO sorulmaz, hiçbir şey yazılmaz).
function Confirm-PortalBaseUrlR05 {
  if (-not $ExpBaseUrl) { Fail 'public portal adresi çözülmedi (salt okuma kapıları koşmadı) — koşum başlamaz' }
  $a = [string](Read-Answer 'R05 kararındaki public portal adresini yazın (https://... ; canlı .env PUBLIC_PORTAL_BASE_URL ile BİREBİR eşleşmeli)')
  if ($a.Trim().TrimEnd('/').ToLowerInvariant() -cne $ExpBaseUrl.ToLowerInvariant()) { Fail 'owner''ın yazdığı R05 adresi canlı .env PUBLIC_PORTAL_BASE_URL ile eşleşmiyor — koşum başlamadı' }
}
function Read-GoRef { return (Read-Host 'EXTACC D-6 canlı GO ref (OWNER-GO-CLIENT-EXTACC-D6-YYYYMMDD-RNN)') }
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
  if ($gotDist -ne $ExpLiveDist) { Fail "CANLI DIST uyuşmuyor (D-6 için R27 dist ŞART; R26 ise önce yayın): $gotDist ($n dosya)" }
  $envSha = Sha $EnvFile
  if ($envSha -ne $ExpEnvSha) { Fail "CANLI .env pini uyuşmuyor: $envSha" }
  $baseUrl = Assert-PortalBaseUrl (EnvValue 'PUBLIC_PORTAL_BASE_URL')
  $script:ExpBaseUrl = $baseUrl   # R05 eşleşmesi Run/QrTest'te owner girdisiyle ölçülür (Confirm-PortalBaseUrlR05); QR bu adresle üretilir
  # Belge kovası kökü: .env'de varsa dizin OLMALI (koşucu filePath için Test-Path yapar); görev ortamından geliyorsa burada görülmez (yalnız not).
  $dataRoot = EnvValue 'HUKUK_DATA_ROOT' -Optional
  $dataRootState = if ($null -eq $dataRoot) { 'env-dosyasinda-yok' } elseif (Test-Path -LiteralPath $dataRoot -PathType Container) { 'dizin-var' } else { Fail 'HUKUK_DATA_ROOT .env''de tanımlı ama dizin YOK — belge kovası ölçülemez' }
  $bucketState = Test-BucketReadable $dataRoot
  $lis = @(Get-NetTCPConnection -State Listen -LocalPort 8080 -ErrorAction SilentlyContinue)
  if ($lis.Count -ne 1) { Fail "8080 dinleyici sayısı $($lis.Count) (1 bekleniyor)" }
  $foreign = @(Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -match 'i1\d-|i3-sink|i3-start-api|f04-|h5-url-|extacc-|d4-portal-|d5-portal-|d6-portal-|d7-portal-|d8-staff-' })
  if ($foreign.Count -gt 0) { Fail "başka kabul süreci çalışıyor: $($foreign.ProcessId -join ',')" }
  $launcher = [IO.File]::ReadAllLines('C:\Ops\hukuk\logs\api\launcher.log') | Where-Object { $_ -match 'db identity ok' } | Select-Object -Last 1
  if ($launcher -notmatch 'host=127\.0\.0\.1 port=5432 db=hukuk_db') { Fail 'canlı API DB kimliği beklenmedik' }
  $node = Resolve-NodeExe
  $chain = Get-ExternalChainState
  return [ordered]@{ head = $head; pkg = $gotPkg; dist = $gotDist; distFiles = $n; envSha = $envSha; apiPid = $lis[0].OwningProcess
                     baseHost = ([uri]$baseUrl).Authority; dataRootState = $dataRootState; bucketState = $bucketState; chain = $chain
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
# Belge kovası okunabilirliği (inceleme R01): koşucu diskteki dosyayı stat ile ölçer; kova bu oturum için OKUNAMIYORSA "yok" ölçümü güvenilmez →
# Preflight DURUR. .env'de HUKUK_DATA_ROOT yoksa (görev ortamından geliyorsa) burada görülmez; alt dizin ilk yüklemeye kadar olmayabilir (not).
function Test-BucketReadable([object]$dataRoot) {
  if ($null -eq $dataRoot -or [string]$dataRoot -eq '') { return 'env-dosyasinda-yok' }
  $bucket = Join-Path ([string]$dataRoot) 'portal-documents'
  if (-not (Test-Path -LiteralPath $bucket -PathType Container)) { return 'kova-alt-dizini-henuz-yok' }
  try { $null = @(Get-ChildItem -LiteralPath $bucket -Force -ErrorAction Stop); return 'okunabilir' }
  catch { Fail "belge kovası OKUNAMIYOR ($bucket): $($_.Exception.GetType().Name) — koşucu diskteki dosyayı ölçemez (sahte 'yok' riski)" }
}

function Set-RunEnv([string]$runId, [string]$evDir) {
  $env:AH_DATABASE_URL = EnvValue 'DATABASE_URL'
  $env:AH_PRISMA_ROOT = Join-Path $Rel 'node_modules\.pnpm\@prisma+client@5.22.0_prisma@5.22.0\node_modules\@prisma\client'
  $env:AH_BCRYPT_PATH = Join-Path $Rel 'node_modules\.pnpm\bcrypt@5.1.1\node_modules\bcrypt'
  $env:D6_RUNID = $runId; $env:D6_EXPECT_DB = 'hukuk_db'; $env:D6_API_BASE = $Api; $env:D6_EXPECT_API = $Api
  if (-not $ExpBaseUrl) { Fail 'public portal adresi çözülmedi — koşum başlamaz' }
  $env:D6_EXPECT_BASE_URL = $ExpBaseUrl
  $rb = New-Object byte[] 18; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($rb)
  $env:D6_LIVE_LOGIN_PW = 'D6S!' + [Convert]::ToBase64String($rb).TrimEnd('=').Replace('+', '-').Replace('/', '_'); $rb = $null
  $env:D6_EVID_FILE = Join-Path $evDir 'd6-evidence.json'
  if (-not $LiveParams -or $LiveParams.Count -ne 7) { Fail 'canlı süre tablosu ($LiveParams) eksik — koşum başlamaz' }
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
# Canlı veri işleme — Run'dan ÖNCE açıkça sunulur; "EVET" yazılmazsa GO sorulmaz ve hiçbir şey yazılmaz.
function Confirm-LiveDataProcessing {
  Write-Host ''
  Write-Host 'CANLI VERİ İŞLEME — onayınız gerekiyor:' -ForegroundColor Yellow
  Write-Host '  Canlı DB''de bu koşumun İKİ yeni sentetik tenantında (hedef + yabancı) yazılacak: sentetik kullanıcılar, müvekkil, dosya, borçlu, sentetik'
  Write-Host '  müvekkile ait BİR portal hesabı (.invalid adres; e-posta ÇIKMAZ), koşucunun yüklediği BİR sentetik PDF (≤ 50 KB, içinde yalnız koşum kimliği) için'
  Write-Host '  bir PortalDocument satırı + canlı belge kovasında (portal-documents/<sentetik tenant>/) bir dosya, ve yabancı sentetik müvekkil için'
  Write-Host '  dosyasız bir sentetik satır (kapsam dışı 404 ölçümü). Belge uçları bildirim/e-posta/audit yazmaz; portal hesabı aç/kapa audit yazar;'
  Write-Host '  yükleme için MASKESİZ bir API günlük satırı (sentetik dosya adı d6-<koşum kimliği>.pdf + sentetik müvekkil id; kişisel veri yok) oluşur.'
  Write-Host '  Kapanış: koşucu kendi belgesini ÜRÜN DELETE''i ile siler (satır + dosya), yabancı sentetik'
  Write-Host '  satırı Prisma ile temizler (raporlanır), portal hesabı pasif + sürüm artırılır, erişim kapalı, personel pasif, dosya CLOSED.'
  Write-Host '  Kapanıştan sonra sentetik tenantın BOŞ kova dizini (portal-documents/<sentetik tenant>/) diskte KALIR: ürün DELETE''i yalnız dosyayı'
  Write-Host '  siler; koşucu ve bu blok dizin, audit kaydı ve API günlük satırı silmez — saklandı (dizin: kaynaktan; canlıda ölçülmedi).'
  Write-Host '  Telefondan yükleme OPSİYONELDİR. Yaparsanız: (1) seçtiğiniz dosyanın ADI canlı API günlüğüne MASKESİZ yazılır (dosya adı + sentetik'
  Write-Host '  müvekkil id; kaynaktan doğrulandı); bu satır kapanışta silinmez ve bu blok günlükleri değiştirmez — adında ve içeriğinde kişisel'
  Write-Host '  veri OLMAYAN bir dosya seçin. (2) Dosyanın kendisi canlı belge kovasına (portal-documents/<sentetik tenant>/) yazılır; koşucu kendi'
  Write-Host '  silme adımından önce onu telefondan silmenizi bekler (en çok 5 dk). Telefondan silerseniz ürün satırı ve dosyayı siler; silmezseniz'
  Write-Host '  satır ve dosya kovada KALIR (koşucu dosya silmez) ve koşucu "belge kaldı" ile çıkış 6 verir.'
  Write-Host '  Çıkış 5/6 Recover YETKİSİ DEĞİLDİR ve bu blok Recover BAŞLATMAZ: kalan satırlar için karar, kanıt incelendikten sonra yalnız AYRI owner'
  Write-Host '  onayıyla başlatılacak bir Recover''da sorulur.'
  Write-Host '  Kapsam: koşucu canlı DB''de yalnız bu koşumun iki sentetik tenantına yazar (kaynaktan okundu; koşumda U-ISO yalnız diğer tenantlardaki'
  Write-Host '  kullanıcı/müvekkil SAYILARINI ölçer) ve bildirim üreten uçları çağırmaz (statik ölçüt: koşucu öz-testi T-1).'
  $a = Read-Answer 'Bu işlemeyi onaylıyor musunuz? Onay için büyük harfle EVET yazın'
  if ($a -cne 'EVET') { Fail 'canlı veri işleme onaylanmadı — koşum başlamadı' }
}
# R03-c: Run sonu metni Recover komutunu YALNIZ makbuz dosyası Recover'ın okuma kapısını geçiyorsa önerir — Invoke-RecoverMode ile aynı denetim
# (dosya var + JSON + kayıt türü + runId biçimi). Kimlik bağı (DB) koşucunun Recover'ında ölçülür; burada ölçülmez. Salt okuma; dosyaya yazmaz.
function Get-ReceiptFileState([string]$path) {
  if (-not $path -or -not (Test-Path -LiteralPath $path -PathType Leaf)) { return [pscustomobject]@{ usable = $false; why = 'YOK' } }
  $j = $null
  try { $j = Get-Content -Raw -Encoding UTF8 -LiteralPath $path | ConvertFrom-Json } catch { return [pscustomobject]@{ usable = $false; why = 'OKUNAMIYOR (okunamadı / JSON değil)' } }
  if (-not $j -or $j.record -ne 'EXTACC-D6-SETUP-RECEIPT' -or [string]$j.runId -notmatch '^[0-9a-f]{8}$') { return [pscustomobject]@{ usable = $false; why = 'OKUNAMIYOR (kayıt türü / runId tanınmadı)' } }
  return [pscustomobject]@{ usable = $true; why = 'VAR' }
}
function Read-ResidueDecision {
  $a = Read-Answer 'Kalan sentetik belge SATIRLARI Prisma ile silinsin mi? (dosyalar SİLİNMEZ, listelenir) (E = evet · H = hayır)'
  if ($a -ceq 'E') { return '1' } elseif ($a -ceq 'H') { return '0' }
  Fail 'kalıntı kararı E ya da H olmalı'
}
# Kapanış durumu kanıttan okunur; metin KOŞULSUZ "kapatıldı" demez.
function Get-ClosureStatus([string]$evidFile, [object]$rc) {
  $st = [ordered]@{ verified = $false; text = ''; finding = $null; waitVerdict = $null; docVerdict = $null; docDurum = $null; docText = ''; phoneDocVerdict = $null; uploadVerdict = $null; receiptInEvidence = $false }
  try {
    $ev = Get-Content -Raw -LiteralPath $evidFile | ConvertFrom-Json
    $st.receiptInEvidence = [bool]($ev.receipt -and $ev.receipt.record -eq 'EXTACC-D6-SETUP-RECEIPT')   # R03-c: makbuz dosyası yoksa kullanılabilir yolun kaynağı
    $d9 = ($ev.results | Where-Object { $_.id -eq 'P6-D9' }).verdict
    $st.waitVerdict = ($ev.results | Where-Object { $_.id -eq 'P6-WAIT' }).verdict
    $st.docVerdict = ($ev.results | Where-Object { $_.id -eq 'P6-C-DOC' }).verdict
    $st.docDurum = $ev.portalClose.docResidue.durum
    $st.phoneDocVerdict = ($ev.results | Where-Object { $_.id -eq 'P6-PHONE-DOC' }).verdict
    $st.uploadVerdict = ($ev.results | Where-Object { $_.id -eq 'D6-1' }).verdict
    $st.finding = $ev.productFinding
    $st.verified = ($d9 -eq 'PASS')
  } catch { $st.verified = $false }
  # R03-b: Run'daki BELGE KALINTISI satırı kanıttaki P6-C-DOC verdict'ine ve docResidue.durum alanına bağlıdır — doğrulanmış kalıntı (FAIL) ile
  # ÖLÇÜLEMEYEN (depolama erişimi / DB okuma) ayrı yazılır; önceki metin ikisini tek bir "… kalmış olabilir" cümlesinde birleştiriyordu.
  $dd = if ($st.docDurum) { [string]$st.docDurum } else { 'kanıtta yok' }
  $st.docText = if ($st.docVerdict -eq 'FAIL') { "DOĞRULANDI (P6-C-DOC FAIL · docResidue.durum=$dd): sentetik belge satırı ya da diskte dosya KALDI — sayılar kanıttaki P6-C-DOC satırındadır." }
                elseif ($st.docVerdict -eq 'UNMEASURED' -and $dd -eq 'ERISIM_OLCULEMEDI') { "ÖLÇÜLEMEDİ (P6-C-DOC ÖLÇÜLEMEYEN · docResidue.durum=$dd): depolama erişimi ölçülemedi — kalıntı DOĞRULANMADI, yokluğu da DOĞRULANMADI; belge kovasının okunabilirliğini owner düzeltir." }
                elseif ($st.docVerdict -eq 'UNMEASURED') { "ÖLÇÜLEMEDİ (P6-C-DOC ÖLÇÜLEMEYEN · docResidue.durum=$dd): kalıntı DOĞRULANMADI, yokluğu da DOĞRULANMADI (neden: kanıttaki P6-C-DOC satırı)." }
                elseif ($st.docVerdict -ne 'PASS') { "ÖLÇÜLMEDİ (kanıtta P6-C-DOC satırı yok ya da okunamadı · docResidue.durum=$dd): kalıntının varlığı da yokluğu da kanıtta ölçülmüş DEĞİL." }
                else { '' }
  # R02: DOĞRULANDI metni parça İDDİA ETMEZ — her parça kanıttaki ölçüt verdict'lerinden kurulur. Gruptaki TÜM ölçütler PASS ise "PASS";
  # biri FAIL ise "FAIL"; aksi halde (satır yok / UNMEASURED) "ÖLÇÜLMEDİ". Birleşik P6-D9 PASS iken de DB/HTTP ret ölçütleri koşulmamış
  # olabilir: portal hesabı hiç açılmadıysa (P6-C2..C5 satırı yok) ya da koşucunun portal oturumu yoksa (P6-C4 UNMEASURED).
  # "Mevcut oturum" koşucunun KENDİ portal oturumudur (P6-C4L/D); telefondaki oturumu koşucu ölçmez (owner beyanı).
  # R02 ikinci tur: parçalar ayrı satırlarda DEĞİL, aynı satırın devamındadır → metin "bu satırın devamında" der (tek değişen dize sabiti).
  $st.text = if ($st.verified) {
               $parts = foreach ($p in @(@('DB kapalı + sürüm arttı [P6-C2/C2V/C5]', 'P6-C2', 'P6-C2V', 'P6-C5'), @('yeni giriş reddi, yerel + dış [P6-C3L/D]', 'P6-C3L', 'P6-C3D'),
                                         @('mevcut oturum reddi, koşucunun kendi portal oturumu, yerel + dış [P6-C4L/D]', 'P6-C4L', 'P6-C4D'), @('belge kalıntısı yok [P6-C-DOC]', 'P6-C-DOC'),
                                         @('yabancı satır temiz [P6-FOREIGN-CLEAN]', 'P6-FOREIGN-CLEAN'), @('personel/dosya kapanışı [U-CLOSE]', 'U-CLOSE'))) {
                 $vs = @($p | Select-Object -Skip 1 | ForEach-Object { $id = $_; $hit = @($ev.results | Where-Object { $_.id -eq $id }); if ($hit.Count -eq 1) { [string]$hit[0].verdict } else { '' } })
                 '{0}: {1}' -f $p[0], $(if (@($vs | Where-Object { $_ -ne 'PASS' }).Count -eq 0) { 'PASS' } elseif (@($vs | Where-Object { $_ -eq 'FAIL' }).Count -gt 0) { 'FAIL' } else { 'ÖLÇÜLMEDİ' })
               }
               'Portal kapanışı: koşucunun birleşik ölçütü P6-D9 PASS — DOĞRULANDI yalnız bu satırın devamında PASS yazan parçalar içindir (kanıttan): ' + ($parts -join ' · ') + '. Telefondaki oturumun reddini koşucu ÖLÇMEZ (yenileme sorusu beyandır).'
             }
             else { "Portal kapanışı DOĞRULANAMADI (çıkış $rc) — telefondaki erişim açık kalmış ya da sentetik belge kalmış olabilir; sonucu CLIENT'a bildirin." }
  return [pscustomobject]$st
}
function Write-OwnerDeclaration([string]$evDir, [string]$runId, $closure) {
  Write-Host ''
  $c = if ($closure -and $closure.verified) { 'Green' } else { 'Red' }
  # Satır rengi yalnız $closure.verified (= P6-D9 PASS) değerine bağlıdır; parçaların ayrı sonucu (PASS / FAIL / ÖLÇÜLMEDİ) rengi DEĞİŞTİRMEZ.
  Write-Host ("Koşum bitti. {0}" -f $(if ($closure) { $closure.text } else { 'Portal kapanışı DOĞRULANAMADI (kanıt okunamadı).' })) -ForegroundColor $c
  Write-Host '  Not: satır rengi yalnız birleşik ölçütü (P6-D9) gösterir (yeşil = P6-D9 PASS; kırmızı = PASS değil ya da kanıt okunamadı); parçaların ayrı sonucu satırın metnindedir.'
  Write-Host 'Şimdi telefonda açık portal sayfasını bir kez YENİLEYİN, sonra aşağıdaki soruları ekranda gördüğünüze göre yanıtlayın.' -ForegroundColor Cyan
  Write-Host 'OWNER BEYANI (makine ölçümünden AYRI kaydedilir; makine ölçümü koşucunun kendi yüklemesidir). Emin değilseniz ? yazın. Parola YAZMAYIN.' -ForegroundColor Cyan
  $d = [ordered]@{
    record = 'EXTACC-D6-OWNER-DECLARATION'; runId = $runId; not = 'owner beyanıdır; makine ölçümü değildir'
    closureShownToOwner = $(if ($closure) { $closure.text } else { 'kanıt okunamadı' })
    girisSonrasiEkran         = (Read-Answer 'Girişten sonra ne gördünüz? (B = belge listesi · G = yine giriş sayfası · D = başka/hata sayfası · ?)')
    listedekiBelgeSayisi      = (Read-Answer 'Listede kaç belge vardı? (sayı ya da ?)')
    ekrandakiBaslikGoruldu    = (Read-Answer 'Konsolda yazan başlıklı belge listede var mıydı? (E/H/?)')
    indirmeSonucu             = (Read-Answer 'Belgeyi indirdiniz mi ve ne gördünüz? (A = açıldı, koşum kimliği yazıyordu · F = açıldı, farklı içerik · H = indirme hatası · Y = denemedim · ?)')
    telefondanYuklemeYapildi  = (Read-Answer 'Telefondan belge yüklediniz mi? (E/H/?)')
    telefonYuklemesiSilindi   = (Read-Answer 'Yüklediyseniz koşucu beklerken telefondan sildiniz mi? (E/H/Y = yüklemedim/?)')
    silmeSonrasiListe         = (Read-Answer 'Koşucu kendi belgesini sildikten sonra listeyi yenileyince ne gördünüz? (B = boş liste · V = hâlâ belge var · G = giriş sayfası · Y = yenilemedim · ?)')
    telefonAgi                = (Read-Answer 'Telefon hangi ağdaydı? (M = mobil veri, Wi-Fi kapalı · W = Wi-Fi · ?)')
    yenilemeSonrasiEkran      = (Read-Answer 'Koşum bittikten sonra yeniledikten sonra ne gördünüz? (B = belge listesi · G = giriş sayfası · D = başka/hata sayfası · Y = yenilemedim · ?)')
    atUtc = (Get-Date).ToUniversalTime().ToString('o')
  }
  $d | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $evDir 'owner-declaration.json') -Encoding UTF8
  return $d
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
  if ($GoRef -cnotmatch '^OWNER-GO-CLIENT-EXTACC-D6-\d{8}-R\d{2}$') { Fail 'GO ref BİÇİMİ hatalı' }
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
  $EvDir = Join-Path $EvRoot ("extacc-d6-live-{0}-{1}" -f $RunId, (Get-Date -Format 'yyyyMMdd-HHmmss'))
  New-Item -ItemType Directory -Force -Path $EvDir | Out-Null
  Add-Content -LiteralPath $GoLedger -Value ("{0}  runId={1}  {2}" -f $goSha, $RunId, (Get-Date).ToUniversalTime().ToString('o')) -Encoding ASCII
  [ordered]@{ record = 'EXTACC-D6-OWNER-BLOCK'; revision = 'R01'; mode = 'Run'; runId = $RunId; main = $g.head; packageDigest = $g.pkg; liveDist = $g.dist
              envSha = $g.envSha; apiPid = $g.apiPid; baseUrlHost = $g.baseHost; dataRootState = $g.dataRootState; bucketState = $g.bucketState; caddyLoopback = $g.caddyLoopback; cloudflaredRunning = $g.cloudflaredRunning
              nodeExe = $g.nodeExe; nodeVersion = $g.nodeVersion; liveDataProcessingConfirmed = $true; standaloneWindowConfirmed = $true
              plannedRealSends = 0; machineMeasuredUpload = 'kosucu'; phoneUploadOptional = $true
              startedUtc = (Get-Date).ToUniversalTime().ToString('o') } |
    ConvertTo-Json | Set-Content -LiteralPath (Join-Path $EvDir 'owner-block.json') -Encoding UTF8
  $decl = $null
  try {
    Set-RunEnv $RunId $EvDir
    $env:D6_MODE = 'run'; $env:D6_LIVE_CONFIRM = '1'; $env:D6_LIVE_GO_REF = $GoRef; $env:D6_DISPLAY = 'conout'
    $env:D6_EXPECT_TENANT_SLUG = "ah-$RunId"; $env:D6_RECEIPT = Join-Path $EvDir 'd6-setup-receipt.json'
    $evid = $env:D6_EVID_FILE
    Assert-FreshEvidence $evid
    $rc = Invoke-Node $g.nodeExe (Join-Path $Sc 'd6-portal-documents-live-run.js') (Join-Path $EvDir 'd6-run.log')
    $rc = Complete-NodeRc $rc $evid
  }
  finally {
    Clear-SecretEnv
    Clear-OwnerScreen
    [ordered]@{ record = 'EXTACC-D6-GOREF-CONSUMED'; runId = $RunId; goRefSha256 = $goSha; literalWritten = $false; exitCode = $rc
                atUtc = (Get-Date).ToUniversalTime().ToString('o') } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $EvDir 'goref-consumed.json') -Encoding UTF8
    $GoRef = $null
  }
  $closure = Get-ClosureStatus (Join-Path $EvDir 'd6-evidence.json') $rc
  try { $decl = Write-OwnerDeclaration $EvDir $RunId $closure } finally { Write-Manifest $EvDir }
  $waitV = $closure.waitVerdict; $finding = $closure.finding
  Write-Host "EXTACC D-6 KOŞUM BİTTİ - RUNID=$RunId · çıkış=$rc" -ForegroundColor $(if ($rc -eq 0) { 'Green' } else { 'Yellow' })
  Write-Host '  0 PASS · 2 FAIL · 3 ÖLÇÜLEMEYEN · 1 DURDU · 4 KİMLİK/HEDEF REDDİ · 7 KANIT YAZILAMADI · 5 PERSONEL/DOSYA KAPANIŞI · 6 PORTAL KAPANIŞI (erişim/belge kalıntısı) DOĞRULANMADI · 91 NODE BAŞLATILAMADI'
  if ($finding) { Write-Host "  $finding — bu bir ÜRÜN BULGUSUDUR; kapanış PASS SAYILMAZ. CLIENT'a bildirin." -ForegroundColor Red }
  if ($closure.uploadVerdict -ne 'PASS') { Write-Host '  Koşucunun kendi yüklemesi (makine ölçümü) PASS değil — D6-1 kanıt satırına bakın.' -ForegroundColor Yellow }
  if ($closure.docVerdict -ne 'PASS') { Write-Host ('  BELGE KALINTISI: {0} Bu blok Recover BAŞLATMAZ ve dosya silmez: kalan satırlar için karar yalnız kanıt incelendikten sonra AYRI owner onayıyla başlatılacak bir Recover''da sorulur (otomatik DEĞİL); kanıtta diskte kalan dosya listelendiyse OWNER elle siler.' -f $closure.docText) -ForegroundColor Red }
  if ($closure.phoneDocVerdict -eq 'FAIL') { Write-Host '  Telefondan yüklenen belge koşucu beklerken silinmedi — kalıntı olarak ölçüldü.' -ForegroundColor Yellow }
  if ($waitV -eq 'UNMEASURED' -and $decl) {
    if ($decl.girisSonrasiEkran -ceq 'B') { Write-Host '  Koşucu başarılı telefon girişi görmedi ama owner belge listesini gördüğünü beyan etti — İNCELEME GEREKİR (FAIL adayı).' -ForegroundColor Yellow }
    else { Write-Host '  Başarılı telefon girişi görülmedi — ÖLÇÜLEMEYEN.' -ForegroundColor Yellow }
  }
  if ($decl -and $decl.indirmeSonucu -ceq 'F') { Write-Host '  Owner, indirilen belgede FARKLI içerik gördüğünü beyan etti — ÜRÜN BULGUSU ADAYI; CLIENT inceler.' -ForegroundColor Red }
  if ($decl -and $decl.silmeSonrasiListe -ceq 'V') { Write-Host '  Owner, koşucu silmesinden sonra listede hâlâ belge gördüğünü beyan etti — İNCELEME GEREKİR.' -ForegroundColor Yellow }
  if ($decl -and $decl.yenilemeSonrasiEkran -ceq 'B') { Write-Host '  Owner, kapanıştan sonra yenilemede belge listesini gördüğünü beyan etti — ÜRÜN BULGUSU ADAYI; CLIENT inceler.' -ForegroundColor Red }
  if ($rc -eq 5 -or $rc -eq 6) {
    Write-Host '  KAPANIŞ DOĞRULANMADI: Run kendi kapanış adımlarını koşucu İÇİNDE denedi; bu çıkış kodu Recover YETKİSİ DEĞİLDİR ve bu blok Recover BAŞLATMAZ.' -ForegroundColor Yellow
    Write-Host '  Önce kanıtı inceleyin (d6-evidence.json: kurtarma/inceleme nedeni ve açık kalan kaynaklar) ve sonucu CLIENT''a bildirin. Kanıttaki kurtarma adımı' -ForegroundColor Yellow
    # R03-c: Recover komutu yalnız makbuz dosyası Recover'ın okuma kapısını geçiyorsa önerilir (uygulanamayan komut önerilmez).
    $rs = Get-ReceiptFileState (Join-Path $EvDir 'd6-setup-receipt.json')
    if ($rs.usable) {
      Write-Host '  bir ÖNERİDİR: -Mode Recover -ReceiptFile <makbuz> yalnız AYRI owner onayıyla, BİR KEZ (ürün bulgusu varsa Recover onu DÜZELTMEZ). Kabulü TEKRARLAMAYIN.' -ForegroundColor Yellow
      Write-Host '  Makbuz dosyası: VAR (kanıt dizinindeki d6-setup-receipt.json; kayıt türü + runId okundu — kimlik bağını koşucu Recover''da DB''de doğrular).' -ForegroundColor Yellow
    } else {
      Write-Host ("  bir ÖNERİDİR — ama MAKBUZ DOSYASI {0} (kanıt dizinindeki d6-setup-receipt.json): bu makbuzla bloktan Recover BAŞLATILAMAZ (Recover makbuzu dosyadan okur; -ReceiptFile mevcut bir makbuz dosyası ister)." -f $rs.why) -ForegroundColor Yellow
      if ($closure.receiptInEvidence) {
        Write-Host '  Kullanılabilir yol: d6-evidence.json içindeki receipt nesnesi (makbuzun koşucu belleğindeki son hali; parola/token içermez) değiştirilmeden yazılabilir bir dizinde yeni bir JSON dosyasına yazılır;' -ForegroundColor Yellow
        Write-Host '  Recover yalnız kanıt incelendikten sonra AYRI owner onayıyla, BİR KEZ, -ReceiptFile <o dosya> ile başlatılır (koşucu makbuzu kayıt türü, runId ve DB kimlik bağıyla doğrular; doğrulanmazsa yazmadan çıkış 4). Kabulü TEKRARLAMAYIN.' -ForegroundColor Yellow
      } else {
        Write-Host '  SOMUT ENGEL: kanıtta receipt nesnesi de YOK (ya da kanıt okunamadı) — bu paketle Recover BAŞLATILAMAZ; makbuzsuz kapanış yolu tanımlı değildir. Açık kalan sentetik kaynaklar için karar owner/CLIENT''a aittir: kanıt dizinini ve d6-run.log''u CLIENT''a iletin.' -ForegroundColor Red
      }
    }
  }
  Write-Host "  kanıt dizini: $EvDir"
  Write-Host '  Bu pencereyi ŞİMDİ kapatın (kaydırma arabelleği). GO ref ve parola bildirmeyin.'
  return $rc
}

# ---------------------------------------------------------------- RECOVER
function Invoke-RecoverMode($g, [string]$receiptPath) {
  $rc = 90
  if (-not $receiptPath -or -not (Test-Path -LiteralPath $receiptPath -PathType Leaf)) { Fail 'Recover için -ReceiptFile <makbuz yolu> gerekli' }
  $rcpt = Get-Content -Raw -LiteralPath $receiptPath | ConvertFrom-Json
  if ($rcpt.record -ne 'EXTACC-D6-SETUP-RECEIPT' -or $rcpt.runId -notmatch '^[0-9a-f]{8}$') { Fail 'makbuz biçimi tanınmadı' }
  $Residue = Read-ResidueDecision
  $EvDir = Join-Path (Split-Path -Parent $receiptPath) ("recover-{0}-{1}" -f (Get-Date -Format 'yyyyMMdd-HHmmss'), [Guid]::NewGuid().ToString('N').Substring(0, 6))
  New-Item -ItemType Directory -Force -Path $EvDir | Out-Null
  try {
    Set-RunEnv $rcpt.runId $EvDir
    $env:D6_MODE = 'recover'; $env:D6_RECOVER_CONFIRM = '1'; $env:D6_RECEIPT = $receiptPath; $env:D6_DISPLAY = 'conout'; $env:D6_RESIDUE_CLEANUP = $Residue
    $evid = $env:D6_EVID_FILE
    Assert-FreshEvidence $evid
    $rc = Invoke-Node $g.nodeExe (Join-Path $Sc 'd6-portal-documents-live-run.js') (Join-Path $EvDir 'd6-recover.log')
    $rc = Complete-NodeRc $rc $evid
  }
  finally { Clear-SecretEnv; Write-Manifest $EvDir }
  # R03-c: her kod yalnız ölçüleni söyler (1 ve 2 dahil); mevcut oturum reddinin Recover'da HER ZAMAN ölçülemediği kodlardan ÖNCE, genel olarak yazılır.
  Write-Host "EXTACC D-6 KURTARMA BİTTİ - RUNID=$($rcpt.runId) · çıkış=$rc (HER KODDA: mevcut oturum reddi Recover'da ÖLÇÜLEMEZ — HER ZAMAN (P6-C4L/D; koşumun portal oturumu saklanmaz; Run kanıtındaki P6-C4 satırlarına bakın; PASS SAYILMAZ); yeni giriş reddinin ölçülüp ölçülmediği kanıttaki P6-C3L/D satırlarından okunur · 0 = Recover anında portal hesabı DB'de YOK (ölçüldü) + belge kalıntısı yok + yabancı satır temiz + personel/dosya kapalı; HTTP reddi ÖLÇÜLMEDİ (hesap yok) · 3 = DB kapalı, FAIL yok, en az bir ölçüt ÖLÇÜLEMEYEN — portal DB kapanışı (P6-C2/C2V/C5) ve belge kalıntısı yokluğu (P6-C-DOC) ölçüldü ya da portal hesabı yok; personel/dosya kapalı · 2 = aynı kapanışlar doğrulandı, en az bir satır FAIL (kaynaktan okundu: Recover'da bunu yalnız P6-FOREIGN-CLEAN üretir — yabancı sentetik satır kaldı) · 1 = DURDU: aynı kapanışlar doğrulandı ama Recover'ın hazırlık adımında hata (kanıttaki fatal alanı; diğer satırlar kanıtta ayrıca okunur) · 6 portal DB/HTTP kapanışı doğrulanmadı ya da belge kalıntısı DOĞRULANDI / ÖLÇÜLEMEDİ (hangisi: kanıttaki P6-C-DOC satırı ve docResidue.durum) · 5 personel/dosya kapanışı doğrulanmadı · 4 kimlik reddi (yazma yok) · 7 kanıt yok · 91 node başlatılamadı)" -ForegroundColor $(if ($rc -eq 0) { 'Green' } else { 'Yellow' })
  if ($rc -eq 3) { Write-Host '  Recover TEKRARLANMAZ; ölçülemeyen satırlar Run kanıtıyla birlikte CLIENT tarafından değerlendirilir.' -ForegroundColor Yellow }
  if ($rc -eq 6) {
    Write-Host '  Kanıttaki P6-C-DOC satırına bakın: diskte kalan dosya listelendiyse (DOĞRULANMIŞ KALINTI) OWNER elle siler; "depolama erişimi ÖLÇÜLEMEDİ" ise belge kovasının okunabilirliğini owner düzeltir (ikisi kanıtta AYRI satırdır).' -ForegroundColor Yellow
    Write-Host '  Bu çıkış kodu yeni bir Recover için YETKİ DEĞİLDİR ve bu blok Recover''ı yeniden BAŞLATMAZ. İKİNCİ bir Recover bu paketle TANIMLI DEĞİLDİR; owner kararı gerektirir (kanıttaki kurtarma adımı metni bir ÖNERİDİR, yetki değildir). Kanıtı inceleyin ve sonucu CLIENT''a bildirin.' -ForegroundColor Yellow
  }
  Write-Host "  kanıt dizini: $EvDir"
  return $rc
}

# ---------------------------------------------------------------- QR DENEMESİ (canlı veri YOK)
function Invoke-QrTestMode($g) {
  Assert-LocalConsole
  Confirm-PortalBaseUrlR05
  $rc = 90
  try {
    $env:EXA_QRTEST_URL = "$ExpBaseUrl/portal/documents"
    $rc = Invoke-Node $g.nodeExe (Join-Path $Sc 'd6-qr-test.js') ([IO.Path]::Combine([IO.Path]::GetTempPath(), 'extacc-d6-qrtest.log'))
  } finally { Clear-SecretEnv }
  if ($rc -ne 0) { Fail "QR denemesi gösterilemedi (çıkış $rc)" }
  $a = Read-Answer 'Telefon QR''ı okudu ve portal belgeler/giriş sayfası açıldı mı? (E/H) — giriş YAPMAYIN'
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
    Write-Host ('PREFLIGHT GEÇTİ (salt okuma; kanıt/DB/ortam/canlı dosya yazılmadı) · main={0} · paket={1} · dist={2} ({3} dosya; R27) · .env={4} · API pid={5} · portal base host={6} · belge kovası={7}/{8} · node={9}' -f `
      $g.head.Substring(0, 8), $g.pkg.Substring(0, 16), $g.dist.Substring(0, 16), $g.distFiles, $g.envSha.Substring(0, 16), $g.apiPid, $g.baseHost, $g.dataRootState, $g.bucketState, $g.nodeVersion) -ForegroundColor Green
    Write-Host ('  dış zincir DOĞRULANDI: 8081 yalnız 127.0.0.1 (dinleyici pid={0} = HY-Caddy servisi) · Cloudflared={1}' -f $g.chain.loopbackPids, $g.chain.cloudflaredStatus)
    $rc = 0
  }
  elseif ($Mode -eq 'QrTest') { $rc = Invoke-QrTestMode $g }
  elseif ($Mode -eq 'Run') { $rc = Invoke-RunMode $g }
  else { $rc = Invoke-RecoverMode $g $ReceiptFile }
}
catch {
  if ($_.Exception.Message -notlike 'EXTACC-D6-DUR:*') { Write-Host "DUR - beklenmeyen hata: $($_.Exception.Message)" -ForegroundColor Red }
  $rc = if (($script:LastNodeRc -is [int]) -and $script:LastNodeRc -ne 0) { $script:LastNodeRc } else { 90 }
}
finally { Clear-SecretEnv }
if (-not ($rc -is [int])) { $rc = 91 }
exit $rc
