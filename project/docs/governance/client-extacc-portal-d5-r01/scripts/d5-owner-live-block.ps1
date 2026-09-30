# ═══════════ EXTACC D-5 R01 PORTAL PAROLA SIFIRLAMA + PORTAL ERİŞİM KAPANIŞI - OWNER BLOĞU (normal PowerShell; YÖNETİCİ GEREKMEZ) ═══════════
# MODLAR
#   -Mode Preflight  SALT OKUMA: tüm kapılar (canlı dist = R27 D5-SEC pini); GO/alıcı sorulmaz; kanıt/ortam/DB/canlı dosya yazılmaz; koşucu
#                    (d5-portal-reset-live-run.js) çağrılmaz — yalnız `node --version` ile sürüm çözülür (Resolve-NodeExe). Kapılardaki
#                    `git fetch` yerel repodaki uzak izleme ref'lerini günceller (iş verisi değildir; tüm modlarda aynı).
#   -Mode QrTest     Canlı veri YOK: "şifremi unuttum" sayfasının (/portal/forgot-password) QR'ı d5-qr-test.js ile yerel konsolda gösterilir;
#                    owner önce R05 adresini konsola yazar (canlı .env ile birebir eşleşmeli), sonra telefonla okutur. HTTP isteği yapılmaz.
#                    QR betiğinin çıktısı geçici dizindeki extacc-d5-qrtest.log dosyasına yönlendirilir (adres içermez); başka dosya yazılmaz.
#   -Mode Run        TEK SEFERLİK canlı koşum: kapılar → bağımsız pencere teyidi → R05 adres teyidi → canlı veri işleme onayı → ALICI ADRESİ (iki kez, yalnız
#                    bu konsolda; hiçbir dosyaya yazılmaz) → TEK GERÇEK E-POSTA GÖNDERİM DENEMESİ ONAYI (plan=1; SMTP kabulü ve
#                    posta kutusuna teslim ÖLÇÜLMEZ, yalnız owner beyanı) → kapanışta adres ezme kararı → GO (yerel)
#                    → GO defteri (yalnız sha256, koşumdan ÖNCE) → koşum (1. konsol: QR + adres; 2. konsol: YENİ PAROLA) → ekran temizliği
#                    → owner beyanı (ayrı dosya) → birleşik karar (d5-combined-verdict.json: makine gözlemi + beyan AYRI alanlarda) → manifest.
#   -Mode Recover    Yalnız kapanış (portal + token iptali + personel/dosya); `-ReceiptFile` zorunlu; GO/alıcı sorulmaz; kabul ölçütleri koşulmaz.
# ÖN KOŞUL: canlı API dist'i R27 (D5-SEC-R01/R02/R03) olmalı — R26 (A8B17A38) ile Preflight/Run DURUR (kapatma token'ı temizlemez).
# YAPMAZ : koşucu e-posta GÖNDERMEZ (talep owner telefonundan; ürün gönderim dener, kabul/teslim ölçülmez) · reset/change-password/belge/mesaj uçları çağrılmaz ·
#          .env/görev/Caddy/tünel/DNS değişikliği · yeniden başlatma · otomatik tekrar · otomatik Recover.
# SIR    : DB URL, personel parolası, ALICI ADRESİ, YENİ PAROLA, GO ref ve token'lar hiçbir dosyaya yazılmaz. Yeni parola yalnız bu konsol
#          penceresine çizilir; pencereyi kaydeden bir terminal KULLANMAYIN; koşum sonunda pencereyi kapatın.
# TOPOLOJİ: public portal adresi canlı .env'den okunur (biçim kapısı) ve Run/QrTest'te owner'ın konsola yazdığı R05 adresiyle doğrulanır; kanıt kökü
#          $env:USERPROFILE'a görelidir (bu dosyada canlı alan adı / yerel kullanıcı yolu literali yoktur). Preflight adres SORMAZ.
# ÇIKIŞ  : node kodu değiştirilmeden taşınır · 90 kapıda durdu · 91 node başlatılamadı / kod alınamadı · 7 kanıt yok.
param(
  [ValidateSet('Preflight', 'QrTest', 'Run', 'Recover')] [string]$Mode = 'Preflight',
  [string]$ReceiptFile = ''
)
$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $false

$Repo     = 'D:\Development\HUKUK_YAZILIMI\project'
$Gov      = Join-Path $Repo 'project\docs\governance'
$Sc       = Join-Path $Gov 'client-extacc-portal-d5-r01\scripts'
$Rel      = 'C:\Development\HUKUK_YAZILIMI\HY_W4_RELEASE23\project'
$EnvFile  = Join-Path $Rel 'apps\api\.env'
$LiveDist = Join-Path $Rel 'apps\api\dist\apps\api\src'
$EvRoot   = Join-Path $env:USERPROFILE 'Documents\CLIENT-EVIDENCE-20260911'   # kanıt kökü kullanıcı profiline göreli (public belgeye yerel kullanıcı yolu yazılmaz)
$GoLedger = Join-Path $EvRoot 'extacc-d5-goref-ledger.txt'
$Api      = 'http://127.0.0.1:8080/api'

# ---- PİNLER (uyuşmazlık OTOMATİK KABUL EDİLMEZ; blok durur) ----
$ExpLiveDist = 'E28A6863CF109A1A3AE1F53E096D5F5C2037E382EF2D8D3EC87FEE3B827E5134'   # R27 ADAY dist (D5-SEC ŞART); R26 canlı A8B17A38 ile DURUR
$ExpEnvSha   = '5C776BBEEE018EA5CC8192378D42D742FD4ABC1B6D0E9A3EA671CF463206908D'   # canlı .env (H5 sonrası)
$ExpBaseUrl  = $null   # R05 public portal adresi: canlı .env PUBLIC_PORTAL_BASE_URL'den okunur (Invoke-ReadOnlyGates, biçim kapısı) ve Run/QrTest'te owner'ın konsola yazdığı R05 adresiyle birebir doğrulanır (Confirm-PortalBaseUrlR05). Public repoya host literali YAZILMAZ.
# Koşucunun YÜKLEDİĞİ tüm governance dosyaları + D-5 QR denemesi ve onun yüklediği dosyalar (iki require ağacı da ölçüldü; d5-selftest T-3).
$PkgPins = [ordered]@{
  'client-extacc-portal-d5-r01\scripts\d5-portal-reset-live-run.js'                   = '924617FFFBD613220A37322960A1E4CAC678D7BE1BB27121022928A4B9676094'
  'client-extacc-portal-d5-r01\scripts\d5-qr-test.js'                                 = '248929D081290EDFEEBA41E7371EF3A3814163DBBEB7B24D2C921B74695AE0A5'
  'client-extacc-intake-chain-r01\scripts\extacc-display.js'                          = 'F257188DF66C429472C214D38D965C1E6F5A2EA490D348369AC68C5DC6F26867'
  'client-extacc-intake-chain-r01\scripts\vendor\qrcode-generator-1.4.4\qrcode.js'    = '18AE399F81182BC9DE916E9C77B195DF20CC58D6F2D55A62B085A299F1BF1780'
  'client-h5-intake-url-r01\scripts\h5-url-live-run.js'                               = 'F2D0975DC9F9D148E4C889472FA11AE6A873A6BDF577C36657ED9BCB4FF9C359'
  'client-live-acceptance-i13-r01\scripts\i13-lib.js'                                 = '59BA7360F270AB66D0A892659A7569AFF1800D65B49415EF5FAD3B84DFEDD385'
  'client-live-acceptance-i12-r01\scripts\i12-live-identity.js'                       = '9516E462CFFD3B22FD253F556A7F1853C6F021B175075449BD7945CCEF36774F'
  'client-acceptance-runners-i3-r01\scripts\i3-lib.js'                                = '56F3788E9F84746CFFEE384D8C18B9B9A28130CC8E2285F9570AB69CC6EE74A3'
  'client-acceptance-harness-r01\scripts\ah-lib.js'                                   = 'DF882DB7F33A667092F126F01E518C1A8292C8C0B3C4C039BF73D71F3ACCBFD7'
}
$ExpPackage = 'E24FBDD3A4A7E7D6E5BCE3AFCEAF8A1E3F72ED6ACC35CDAA23E56478C9C5C852'
$SecretEnv  = @('AH_DATABASE_URL', 'AH_PRISMA_ROOT', 'AH_BCRYPT_PATH', 'D5_LIVE_CONFIRM', 'D5_RECOVER_CONFIRM', 'D5_LIVE_GO_REF',
                'D5_RUNID', 'D5_MODE', 'D5_EXPECT_DB', 'D5_EXPECT_TENANT_SLUG', 'D5_API_BASE', 'D5_EXPECT_API',
                'D5_EXPECT_BASE_URL', 'D5_LIVE_LOGIN_PW', 'D5_RECEIPT', 'D5_EVID_FILE', 'D5_DISPLAY', 'D5_QRTEST_URL', 'EXA_QRTEST_URL',
                'D5_RECIPIENT_EMAIL', 'D5_SEND_CONFIRM', 'D5_SCRUB_RECIPIENT', 'D5_TEST_DISPLAY_SINK',
                'D5_WAIT_MS', 'D5_POLL_MS', 'D5_VIEW_MS', 'D5_HTTP_TIMEOUT_MS', 'D5_CALL_TIMEOUT_MS', 'D5_LATE_CREATE_MS', 'D5_TOKEN_TTL_MS')
# CANLI SÜRELER — açıkça kurulur; pencereden devralınan değerler başta ve sonda SİLİNİR (koşucu da canlı DB'de bunları zorlar).
$LiveParams = [ordered]@{ D5_WAIT_MS = '1200000'; D5_POLL_MS = '5000'; D5_VIEW_MS = '120000'; D5_HTTP_TIMEOUT_MS = '15000'; D5_CALL_TIMEOUT_MS = '30000'
                          D5_LATE_CREATE_MS = '120000'; D5_TOKEN_TTL_MS = '3600000' }
$script:LastNodeRc = $null

function Fail([string]$m) { Write-Host "DUR - $m" -ForegroundColor Red; throw "EXTACC-D5-DUR: $m" }
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
  if ($u -notmatch '^https://[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$' -or $u -match '^https://\d+(\.\d+)+$') { Fail 'PUBLIC_PORTAL_BASE_URL biçimi https://<alan adı> olmalı (yol/port/sorgu/IP/localhost KABUL EDİLMEZ) — sıfırlama bağlantısı ve QR bu adresle üretilir' }
  return $u
}
# R05 kontrolü: owner adresi konsola yazar; canlı .env değeriyle (kapılarda okunan) birebir eşleşmezse DUR (alıcı/GO sorulmaz, hiçbir şey yazılmaz).
function Confirm-PortalBaseUrlR05 {
  if (-not $ExpBaseUrl) { Fail 'public portal adresi çözülmedi (salt okuma kapıları koşmadı) — koşum başlamaz' }
  $a = [string](Read-Answer 'R05 kararındaki public portal adresini yazın (https://... ; canlı .env PUBLIC_PORTAL_BASE_URL ile BİREBİR eşleşmeli)')
  if ($a.Trim().TrimEnd('/').ToLowerInvariant() -cne $ExpBaseUrl.ToLowerInvariant()) { Fail 'owner''ın yazdığı R05 adresi canlı .env PUBLIC_PORTAL_BASE_URL ile eşleşmiyor — koşum başlamadı' }
}
function Read-GoRef { return (Read-Host 'EXTACC D-5 canlı GO ref (OWNER-GO-CLIENT-EXTACC-D5-YYYYMMDD-RNN)') }
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
  if ($gotDist -ne $ExpLiveDist) { Fail "CANLI DIST uyuşmuyor (D-5 için R27/D5-SEC dist ŞART; R26 ise önce yayın): $gotDist ($n dosya)" }
  $envSha = Sha $EnvFile
  if ($envSha -ne $ExpEnvSha) { Fail "CANLI .env pini uyuşmuyor: $envSha" }
  $baseUrl = Assert-PortalBaseUrl (EnvValue 'PUBLIC_PORTAL_BASE_URL')
  $script:ExpBaseUrl = $baseUrl   # R05 eşleşmesi Run/QrTest'te owner girdisiyle ölçülür (Confirm-PortalBaseUrlR05); QR ve sıfırlama bağlantısı ölçümü bu adresle yapılır
  $mailProv = EnvValue 'EMAIL_PROVIDER'
  if ($mailProv -cne 'smtp') { Fail "EMAIL_PROVIDER=$mailProv — gerçek gönderim sağlayıcısı (smtp) değil; D-5 ölçülemez" }
  $lis = @(Get-NetTCPConnection -State Listen -LocalPort 8080 -ErrorAction SilentlyContinue)
  if ($lis.Count -ne 1) { Fail "8080 dinleyici sayısı $($lis.Count) (1 bekleniyor)" }
  $foreign = @(Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -match 'i1\d-|i3-sink|i3-start-api|f04-|h5-url-|extacc-|d4-portal-|d5-portal-|d6-portal-|d7-portal-|d8-staff-' })
  if ($foreign.Count -gt 0) { Fail "başka kabul süreci çalışıyor: $($foreign.ProcessId -join ',')" }
  $launcher = [IO.File]::ReadAllLines('C:\Ops\hukuk\logs\api\launcher.log') | Where-Object { $_ -match 'db identity ok' } | Select-Object -Last 1
  if ($launcher -notmatch 'host=127\.0\.0\.1 port=5432 db=hukuk_db') { Fail 'canlı API DB kimliği beklenmedik' }
  $node = Resolve-NodeExe
  $chain = Get-ExternalChainState
  return [ordered]@{ head = $head; pkg = $gotPkg; dist = $gotDist; distFiles = $n; envSha = $envSha; apiPid = $lis[0].OwningProcess
                     baseHost = ([uri]$baseUrl).Authority; emailProvider = $mailProv; chain = $chain
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
  if ([Console]::IsOutputRedirected) { Fail 'konsol çıktısı yönlendirilmiş — yeni parola gösterilemez' }
}

function Set-RunEnv([string]$runId, [string]$evDir) {
  $env:AH_DATABASE_URL = EnvValue 'DATABASE_URL'
  $env:AH_PRISMA_ROOT = Join-Path $Rel 'node_modules\.pnpm\@prisma+client@5.22.0_prisma@5.22.0\node_modules\@prisma\client'
  $env:AH_BCRYPT_PATH = Join-Path $Rel 'node_modules\.pnpm\bcrypt@5.1.1\node_modules\bcrypt'
  $env:D5_RUNID = $runId; $env:D5_EXPECT_DB = 'hukuk_db'; $env:D5_API_BASE = $Api; $env:D5_EXPECT_API = $Api
  if (-not $ExpBaseUrl) { Fail 'public portal adresi çözülmedi — koşum başlamaz' }
  $env:D5_EXPECT_BASE_URL = $ExpBaseUrl
  $rb = New-Object byte[] 18; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($rb)
  $env:D5_LIVE_LOGIN_PW = 'D5S!' + [Convert]::ToBase64String($rb).TrimEnd('=').Replace('+', '-').Replace('/', '_'); $rb = $null
  $env:D5_EVID_FILE = Join-Path $evDir 'd5-evidence.json'
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
# Canlı veri işleme — Run'dan ÖNCE açıkça sunulur; "EVET" yazılmazsa alıcı/GO sorulmaz ve hiçbir şey yazılmaz.
function Confirm-LiveDataProcessing {
  Write-Host ''
  Write-Host 'CANLI VERİ İŞLEME — onayınız gerekiyor:' -ForegroundColor Yellow
  Write-Host '  Canlı DB''de YALNIZ yeni bir sentetik tenantta yazılacak: sentetik kullanıcılar, müvekkil, dosya, borçlu ve sentetik müvekkile'
  Write-Host '  ait BİR portal hesabı. Bu hesabın e-posta adresi, birazdan gireceğiniz GERÇEK alıcı adresidir (adres yalnız DB''deki bu sentetik'
  Write-Host '  hesapta durur; hiçbir kanıt/rapor/log dosyasına yazılmaz). Telefonunuzdan "şifremi unuttum" talebi gönderdiğinizde ürün bu adrese'
  Write-Host '  TEK bir gerçek sıfırlama e-postası göndermeyi DENER (plan: 1; SMTP kabulü ve posta kutusuna teslim ÖLÇÜLMEZ — yalnız beyanınız).'
  Write-Host '  Sıfırlama, girişler ve kapanış portal hesabında sürüm/sayaç günceller;'
  Write-Host '  audit ve maskelenmiş API günlük satırları oluşur; e-posta sağlayıcısının günlüğü alıcıyı içerebilir (SEC-MAIL-LOG-01, ayrı kayıt).'
  Write-Host '  Kapanış: portal hesabı pasif + sıfırlama token''ı iptal + sürüm artırılır, erişim kapalı, personel pasif, dosya CLOSED.'
  Write-Host '  Gerçek müvekkil verisine ve bildirimlere dokunulmaz. Kapanışta alıcı adresi sentetik hesapta .invalid ile EZİLEBİLİR (kararınız sorulur).'
  $a = Read-Answer 'Bu işlemeyi onaylıyor musunuz? Onay için büyük harfle EVET yazın'
  if ($a -cne 'EVET') { Fail 'canlı veri işleme onaylanmadı — koşum başlamadı' }
}
# Alıcı adresi YALNIZ bu konsolda; iki kez aynı yazılmalı; sentetik alanlar reddedilir. Hiçbir dosyaya/kanıta yazılmaz.
function Read-Recipient {
  $a = Read-Answer 'Gerçek alıcı e-posta adresi (sıfırlama e-postası BURAYA gidecek; portal hesabı bu adresle açılacak)'
  $b = Read-Answer 'Aynı adresi doğrulama için tekrar yazın'
  if ($a -cne $b) { Fail 'alıcı adresi iki girişte aynı değil' }
  if ($a -notmatch '^[^\s@]+@[^\s@]+\.[^\s@]+$' -or $a.Length -gt 254) { Fail 'alıcı adresi geçerli bir e-posta biçiminde değil' }
  if ($a -match '\.invalid$' -or $a -match '@ah-harness\.') { Fail 'alıcı adresi sentetik olamaz (gerçek posta kutusu gerekir)' }
  return $a
}
function Confirm-SingleSend {
  Write-Host ''
  Write-Host 'GERÇEK E-POSTA GÖNDERİM DENEMESİ: talebi telefonunuzdan gönderdiğinizde ürün girdiğiniz adrese BİR sıfırlama e-postası göndermeyi DENER.' -ForegroundColor Yellow
  Write-Host 'Koşucu SMTP kabulünü ve posta kutusuna teslimi ÖLÇMEZ (yalnız DB''de token üretimini görür); e-postanın gelip gelmediği beyanda sorulur. Koşucu' -ForegroundColor Yellow
  Write-Host 'ayrıca gönderimsiz bir kontrol talebi (.invalid adres, e-posta ÇIKMAZ) yapar. Bu koşumda PLANLANAN gerçek gönderim sayısı: 1 (plan; kanıt değil).' -ForegroundColor Yellow
  $a = Read-Answer 'Tek gerçek gönderim denemesini onaylıyor musunuz? Onay için büyük harfle GÖNDER yazın'
  if ($a -cne 'GÖNDER') { Fail 'e-posta gönderimi onaylanmadı — koşum başlamadı' }
}
function Read-ScrubDecision {
  $a = Read-Answer 'Kapanışta alıcı adresi sentetik portal hesabında .invalid ile ezilsin mi? (E = evet, ez · H = hayır, dursun)'
  if ($a -ceq 'E') { return '1' } elseif ($a -ceq 'H') { return '0' }
  Fail 'ezme kararı E ya da H olmalı'
}
# Kapanış durumu kanıttan okunur; metin KOŞULSUZ "kapatıldı" demez. Mevcut-oturum reddi yalnız kanıtta gerekli sayıldıysa
# (portalClose.sessionRequired = S1 · portalClose.s0Required = S0) iddia edilir; ikisi de yoksa "ÖLÇÜLMEDİ" yazılır (P5-D9 yine PASS olabilir).
function Get-ClosureStatus([string]$evidFile, [object]$rc) {
  $st = [ordered]@{ verified = $false; text = ''; finding = $null; waitVerdict = $null; tokenVerdict = $null; scrubVerdict = $null; obsVerdict = $null; sessionRequired = $null; s0Required = $null }
  try {
    $ev = Get-Content -Raw -LiteralPath $evidFile | ConvertFrom-Json
    $d9 = ($ev.results | Where-Object { $_.id -eq 'P5-D9' }).verdict
    $st.waitVerdict = ($ev.results | Where-Object { $_.id -eq 'P5-WAIT' }).verdict
    $st.obsVerdict = ($ev.results | Where-Object { $_.id -eq 'P5-SINGLE-USE-OBS' }).verdict
    $st.tokenVerdict = ($ev.results | Where-Object { $_.id -eq 'P5-C-TOKEN' }).verdict
    $st.scrubVerdict = ($ev.results | Where-Object { $_.id -eq 'P5-SCRUB' }).verdict
    $st.finding = $ev.productFinding
    if ($ev.portalClose) { $st.sessionRequired = ($ev.portalClose.sessionRequired -eq $true); $st.s0Required = ($ev.portalClose.s0Required -eq $true) }
    $st.verified = ($d9 -eq 'PASS')
  } catch { $st.verified = $false }
  $sess = if ($st.sessionRequired -and $st.s0Required) { 'mevcut oturum reddi (S1 ve S0)' }
          elseif ($st.sessionRequired) { 'mevcut oturum reddi (S1)' }
          elseif ($st.s0Required) { 'mevcut oturum reddi (yalnız S0; S1 alınmadı)' }
          else { 'mevcut oturum reddi ÖLÇÜLMEDİ (S0/S1 oturumu yok)' }
  $st.text = if ($st.verified) { "Portal erişim kapanışı koşucu tarafından DOĞRULANDI (DB + sıfırlama token'ı iptal + yeni giriş reddi + $sess)." }
             else { "Portal erişim kapanışı DOĞRULANAMADI (çıkış $rc) — e-postadaki bağlantı ya da telefondaki erişim açık kalmış olabilir; sonucu CLIENT'a bildirin." }
  return [pscustomobject]$st
}
function Write-OwnerDeclaration([string]$evDir, [string]$runId, $closure) {
  Write-Host ''
  $c = if ($closure -and $closure.verified) { 'Green' } else { 'Red' }
  Write-Host ("Koşum bitti. {0}" -f $(if ($closure) { $closure.text } else { 'Portal erişim kapanışı DOĞRULANAMADI (kanıt okunamadı).' })) -ForegroundColor $c
  Write-Host 'Şimdi telefonda açık portal sayfasını bir kez YENİLEYİN, sonra aşağıdaki soruları ekranda gördüğünüze göre yanıtlayın.' -ForegroundColor Cyan
  Write-Host 'OWNER BEYANI (makine ölçümünden AYRI kaydedilir). Emin değilseniz ? yazın. Adres, parola ve bağlantı YAZMAYIN.' -ForegroundColor Cyan
  $d = [ordered]@{
    record = 'EXTACC-D5-OWNER-DECLARATION'; runId = $runId; not = 'owner beyanıdır; makine ölçümü değildir'
    closureShownToOwner = $(if ($closure) { $closure.text } else { 'kanıt okunamadı' })
    epostaGeldi               = (Read-Answer 'Sıfırlama e-postası telefona geldi mi? (E/H/?)')
    epostaGelisSuresiDk       = (Read-Answer 'Talepten kaç dakika sonra geldi? (sayı ya da ?)')
    baglantiSonrasiEkran      = (Read-Answer 'E-postadaki bağlantıyı açınca ne gördünüz? (S = yeni parola formu · G = giriş sayfası · D = başka/hata sayfası · ?)')
    yeniParolaKabulEdildi     = (Read-Answer 'Konsoldaki yeni parola kabul edildi mi? (E/H/?)')
    girisSonrasiEkran         = (Read-Answer 'Yeni parolayla girişten sonra ne gördünüz? (L = dosya listesi · G = yine giriş sayfası · D = başka/hata sayfası · ?)')
    listedekiDosyaSayisi      = (Read-Answer 'Listede kaç dosya vardı? (sayı ya da ?)')
    ikinciBaglantiDenemesi    = (Read-Answer 'Aynı bağlantıyı ikinci kez denediğinizde ne oldu? (H = aynı bağlantıyla formu GÖNDERDİM, hata/geçersiz gördüm · A = bağlantıyı açtım ama göndermedim · S = form yeniden kabul etti (parola değişti) · Y = denemedim · ?)')
    telefonAgi                = (Read-Answer 'Telefon hangi ağdaydı? (M = mobil veri, Wi-Fi kapalı · W = Wi-Fi · ?)')
    yenilemeSonrasiEkran      = (Read-Answer 'Yeniledikten sonra ne gördünüz? (L = dosya listesi · G = giriş sayfası · D = başka/hata sayfası · Y = yenilemedim · ?)')
    atUtc = (Get-Date).ToUniversalTime().ToString('o')
  }
  $d | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $evDir 'owner-declaration.json') -Encoding UTF8
  return $d
}
# BİRLEŞİK KARAR: makine gözlemi (P5-SINGLE-USE-OBS) ve owner beyanı (ikinciBaglantiDenemesi) AYRI alanlarda kalır; karar yalnız açık kuralla üretilir.
# Tek kullanım: (OBS PASS ve H) → DOĞRULANDI · (OBS FAIL ve H) → DOĞRULANMADI · A/Y/? → ÖLÇÜLEMEYEN · S → ÜRÜN BULGUSU ADAYI (PASS değil).
# E-posta teslimi: koşucu ÖLÇMEZ (token üretimi ≠ SMTP kabulü ≠ teslim); yalnız owner beyanı (epostaGeldi) raporlanır.
function Write-CombinedVerdict([string]$evDir, [string]$runId, $closure, $decl) {
  $obs = if ($closure -and $closure.obsVerdict) { [string]$closure.obsVerdict } else { $null }
  $ans = if ($decl -and $null -ne $decl.ikinciBaglantiDenemesi) { [string]$decl.ikinciBaglantiDenemesi } else { '?' }
  $su = if ($ans -ceq 'S') { 'ÜRÜN BULGUSU ADAYI' }
        elseif ($ans -ceq 'H') { if ($obs -eq 'PASS') { 'DOĞRULANDI' } elseif ($obs -eq 'FAIL') { 'DOĞRULANMADI' } else { 'ÖLÇÜLEMEYEN' } }
        else { 'ÖLÇÜLEMEYEN' }
  $mail = if ($decl -and $null -ne $decl.epostaGeldi) { [string]$decl.epostaGeldi } else { '?' }
  $md = if ($mail -ceq 'E') { 'OWNER BEYANI: GELDİ (makine ölçümü yok)' } elseif ($mail -ceq 'H') { 'OWNER BEYANI: GELMEDİ (makine ölçümü yok)' } else { 'ÖLÇÜLEMEYEN' }
  $v = [ordered]@{
    record = 'EXTACC-D5-COMBINED-VERDICT'; runId = $runId
    not = 'makine ölçümü ve owner beyanı AYRI alanlardadır; birleşik karar yalnız bu iki alanın açık kuralla birleşimidir'
    singleUse = [ordered]@{
      machine = [ordered]@{ id = 'P5-SINGLE-USE-OBS'; verdict = $obs; anlam = 'gözlem aralığında parola hash''i/sürüm/token değişmedi — ikinci denemenin yapıldığını/reddedildiğini KANITLAMAZ' }
      owner   = [ordered]@{ field = 'ikinciBaglantiDenemesi'; answer = $ans; secenekler = 'H = aynı bağlantıyla formu GÖNDERDİM, hata/geçersiz gördüm · A = bağlantıyı açtım ama göndermedim · S = form yeniden kabul etti (parola değişti) · Y = denemedim · ?' }
      rule    = '(OBS PASS ve H) → DOĞRULANDI · (OBS FAIL ve H) → DOĞRULANMADI · A/Y/? → ÖLÇÜLEMEYEN · S → ÜRÜN BULGUSU ADAYI (PASS değil)'
      verdict = $su }
    emailDelivery = [ordered]@{
      machine = [ordered]@{ measured = $false; anlam = 'token üretimi ≠ SMTP kabulü ≠ posta kutusuna teslim; ürün gönderim dener, koşucu kabul/teslimi ÖLÇMEZ' }
      owner   = [ordered]@{ field = 'epostaGeldi'; answer = $mail }
      verdict = $md }
    atUtc = (Get-Date).ToUniversalTime().ToString('o') }
  $v | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $evDir 'd5-combined-verdict.json') -Encoding UTF8
  return $v
}

# ---------------------------------------------------------------- RUN
function Invoke-RunMode($g) {
  $rc = 90
  Assert-ExternalChain $g.chain
  Assert-LocalConsole
  $w = Read-Answer 'Bu pencere uygulamanın Terminal paneli ya da kayıt tutan bir oturum DEĞİL, bağımsız bir PowerShell penceresi mi? (E/H)'
  if ($w -cne 'E') { Fail 'bağımsız pencere teyit edilmedi — yeni parola gösterilmeyecek' }
  Confirm-PortalBaseUrlR05
  Confirm-LiveDataProcessing
  $Recipient = Read-Recipient
  Confirm-SingleSend
  $Scrub = Read-ScrubDecision
  $GoRef = Read-GoRef
  if ($GoRef -cnotmatch '^OWNER-GO-CLIENT-EXTACC-D5-\d{8}-R\d{2}$') { Fail 'GO ref BİÇİMİ hatalı' }
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
  $EvDir = Join-Path $EvRoot ("extacc-d5-live-{0}-{1}" -f $RunId, (Get-Date -Format 'yyyyMMdd-HHmmss'))
  New-Item -ItemType Directory -Force -Path $EvDir | Out-Null
  Add-Content -LiteralPath $GoLedger -Value ("{0}  runId={1}  {2}" -f $goSha, $RunId, (Get-Date).ToUniversalTime().ToString('o')) -Encoding ASCII
  [ordered]@{ record = 'EXTACC-D5-OWNER-BLOCK'; revision = 'R01'; mode = 'Run'; runId = $RunId; main = $g.head; packageDigest = $g.pkg; liveDist = $g.dist
              envSha = $g.envSha; apiPid = $g.apiPid; baseUrlHost = $g.baseHost; emailProvider = $g.emailProvider; caddyLoopback = $g.caddyLoopback; cloudflaredRunning = $g.cloudflaredRunning
              nodeExe = $g.nodeExe; nodeVersion = $g.nodeVersion; liveDataProcessingConfirmed = $true; standaloneWindowConfirmed = $true
              recipientProvided = $true; recipientWritten = $false; singleSendConfirmed = $true; plannedRealSends = 1
              plannedRealSendsNote = 'PLAN (owner onayı) — gerçekleşen gönderim/SMTP kabulü/teslim KANITI DEĞİL; koşucu e-posta teslimini ölçmez (emailDeliveryMeasured=false), yalnız owner beyanı'
              scrubRequested = ($Scrub -eq '1')
              startedUtc = (Get-Date).ToUniversalTime().ToString('o') } |
    ConvertTo-Json | Set-Content -LiteralPath (Join-Path $EvDir 'owner-block.json') -Encoding UTF8
  $decl = $null
  try {
    Set-RunEnv $RunId $EvDir
    $env:D5_MODE = 'run'; $env:D5_LIVE_CONFIRM = '1'; $env:D5_LIVE_GO_REF = $GoRef; $env:D5_DISPLAY = 'conout'
    $env:D5_RECIPIENT_EMAIL = $Recipient; $env:D5_SEND_CONFIRM = '1'; $env:D5_SCRUB_RECIPIENT = $Scrub
    $env:D5_EXPECT_TENANT_SLUG = "ah-$RunId"; $env:D5_RECEIPT = Join-Path $EvDir 'd5-setup-receipt.json'
    $evid = $env:D5_EVID_FILE
    Assert-FreshEvidence $evid
    $rc = Invoke-Node $g.nodeExe (Join-Path $Sc 'd5-portal-reset-live-run.js') (Join-Path $EvDir 'd5-run.log')
    $rc = Complete-NodeRc $rc $evid
  }
  finally {
    Clear-SecretEnv
    Clear-OwnerScreen
    [ordered]@{ record = 'EXTACC-D5-GOREF-CONSUMED'; runId = $RunId; goRefSha256 = $goSha; literalWritten = $false; exitCode = $rc
                atUtc = (Get-Date).ToUniversalTime().ToString('o') } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $EvDir 'goref-consumed.json') -Encoding UTF8
    $GoRef = $null; $Recipient = $null
  }
  $closure = Get-ClosureStatus (Join-Path $EvDir 'd5-evidence.json') $rc
  $cv = $null
  try { $decl = Write-OwnerDeclaration $EvDir $RunId $closure; $cv = Write-CombinedVerdict $EvDir $RunId $closure $decl } finally { Write-Manifest $EvDir }
  $waitV = $closure.waitVerdict; $finding = $closure.finding
  Write-Host "EXTACC D-5 KOŞUM BİTTİ - RUNID=$RunId · çıkış=$rc" -ForegroundColor $(if ($rc -eq 0) { 'Green' } else { 'Yellow' })
  Write-Host '  0 PASS · 2 FAIL · 3 ÖLÇÜLEMEYEN · 1 DURDU · 4 KİMLİK/ADRES REDDİ · 7 KANIT YAZILAMADI · 5 PERSONEL/DOSYA KAPANIŞI · 6 PORTAL ERİŞİMİ KAPANDIĞI DOĞRULANMADI · 91 NODE BAŞLATILAMADI'
  if ($finding) { Write-Host "  $finding — bu bir ÜRÜN BULGUSUDUR; kapanış PASS SAYILMAZ. CLIENT'a bildirin." -ForegroundColor Red }
  if ($closure.tokenVerdict -ne 'PASS') { Write-Host '  Sıfırlama token''ının iptali DOĞRULANMADI — e-postadaki bağlantı kullanılabilir olabilir; CLIENT''a bildirin.' -ForegroundColor Red }
  if ($waitV -eq 'UNMEASURED' -and $decl) {
    if ($decl.girisSonrasiEkran -ceq 'L') { Write-Host '  Koşucu yeni parolayla başarılı giriş görmedi ama owner dosya listesini gördüğünü beyan etti — İNCELEME GEREKİR (FAIL adayı).' -ForegroundColor Yellow }
    else { Write-Host '  Yeni parolayla başarılı telefon girişi görülmedi — ÖLÇÜLEMEYEN.' -ForegroundColor Yellow }
  }
  if ($cv) {
    $suc = if ($cv.singleUse.verdict -eq 'DOĞRULANDI') { 'Green' } elseif ($cv.singleUse.verdict -eq 'ÖLÇÜLEMEYEN') { 'Yellow' } else { 'Red' }
    Write-Host ("  TEK KULLANIM (birleşik): {0} — makine gözlemi P5-SINGLE-USE-OBS={1} (ikinci denemeyi kanıtlamaz) · owner beyanı=[{2}]" -f $cv.singleUse.verdict, $cv.singleUse.machine.verdict, $cv.singleUse.owner.answer) -ForegroundColor $suc
    if ($cv.singleUse.verdict -eq 'ÜRÜN BULGUSU ADAYI') { Write-Host '  Owner, aynı bağlantının ikinci kez kabul edildiğini beyan etti — ÜRÜN BULGUSU ADAYI (PASS değil); CLIENT inceler.' -ForegroundColor Red }
    Write-Host ("  E-POSTA TESLİMİ: {0} — koşucu SMTP kabulünü/teslimi ölçmez; plannedRealSends=1 bir PLANDIR, kanıt değildir." -f $cv.emailDelivery.verdict) -ForegroundColor Cyan
  }
  if ($decl -and $decl.yenilemeSonrasiEkran -ceq 'L') { Write-Host '  Owner, kapanıştan sonra yenilemede dosya listesini gördüğünü beyan etti — ÜRÜN BULGUSU ADAYI; CLIENT inceler.' -ForegroundColor Red }
  if ($closure.scrubVerdict -and $closure.scrubVerdict -ne 'PASS') { Write-Host '  Alıcı adresi sentetik hesapta EZİLEMEDİ — Recover ile tekrar denenebilir.' -ForegroundColor Yellow }
  if ($rc -eq 5 -or $rc -eq 6) { Write-Host '  KAPANIŞ DOĞRULANMADI: -Mode Recover -ReceiptFile <makbuz> (ürün bulgusu varsa Recover onu DÜZELTMEZ). Kabulü TEKRARLAMAYIN.' -ForegroundColor Yellow }
  Write-Host "  kanıt dizini: $EvDir"
  Write-Host '  Bu pencereyi ŞİMDİ kapatın (kaydırma arabelleği). GO ref, adres, parola ve bağlantı bildirmeyin. E-postayı silmek kapanış DEĞİLDİR.'
  return $rc
}

# ---------------------------------------------------------------- RECOVER
function Invoke-RecoverMode($g, [string]$receiptPath) {
  $rc = 90
  if (-not $receiptPath -or -not (Test-Path -LiteralPath $receiptPath -PathType Leaf)) { Fail 'Recover için -ReceiptFile <makbuz yolu> gerekli' }
  $rcpt = Get-Content -Raw -LiteralPath $receiptPath | ConvertFrom-Json
  if ($rcpt.record -ne 'EXTACC-D5-SETUP-RECEIPT' -or $rcpt.runId -notmatch '^[0-9a-f]{8}$') { Fail 'makbuz biçimi tanınmadı' }
  $Scrub = Read-ScrubDecision
  $EvDir = Join-Path (Split-Path -Parent $receiptPath) ("recover-{0}-{1}" -f (Get-Date -Format 'yyyyMMdd-HHmmss'), [Guid]::NewGuid().ToString('N').Substring(0, 6))
  New-Item -ItemType Directory -Force -Path $EvDir | Out-Null
  try {
    Set-RunEnv $rcpt.runId $EvDir
    $env:D5_MODE = 'recover'; $env:D5_RECOVER_CONFIRM = '1'; $env:D5_RECEIPT = $receiptPath; $env:D5_DISPLAY = 'conout'; $env:D5_SCRUB_RECIPIENT = $Scrub
    $evid = $env:D5_EVID_FILE
    Assert-FreshEvidence $evid
    $rc = Invoke-Node $g.nodeExe (Join-Path $Sc 'd5-portal-reset-live-run.js') (Join-Path $EvDir 'd5-recover.log')
    $rc = Complete-NodeRc $rc $evid
  }
  finally { Clear-SecretEnv; Write-Manifest $EvDir }
  Write-Host "EXTACC D-5 KURTARMA BİTTİ - RUNID=$($rcpt.runId) · çıkış=$rc (0 kapanış + token iptali + HTTP reddi doğrulandı · 3 DB kapalı ama bazı HTTP kontrolleri ÖLÇÜLEMEDİ (PASS SAYILMAZ) · 6 portal DB/token/HTTP kapanışı doğrulanmadı · 5 personel/dosya · 4 kimlik reddi · 7 kanıt yok · 91 node başlatılamadı)" -ForegroundColor $(if ($rc -eq 0) { 'Green' } else { 'Yellow' })
  if ($rc -eq 3) { Write-Host '  Recover TEKRARLANMAZ; ölçülemeyen satırlar Run kanıtıyla birlikte CLIENT tarafından değerlendirilir.' -ForegroundColor Yellow }
  Write-Host "  kanıt dizini: $EvDir"
  return $rc
}

# ---------------------------------------------------------------- QR DENEMESİ (canlı veri YOK)
function Invoke-QrTestMode($g) {
  Assert-LocalConsole
  Confirm-PortalBaseUrlR05
  $rc = 90
  try {
    # d5-qr-test.js: yol TAM /portal/forgot-password ve origin = beklenen origin değilse konsol açılmadan çıkış 4 (intake zincirinin QR betiği yalnız /portal/login kabul eder; burada kullanılmaz).
    $env:D5_EXPECT_BASE_URL = $ExpBaseUrl
    $env:D5_QRTEST_URL = "$ExpBaseUrl/portal/forgot-password"
    $rc = Invoke-Node $g.nodeExe (Join-Path $Sc 'd5-qr-test.js') ([IO.Path]::Combine([IO.Path]::GetTempPath(), 'extacc-d5-qrtest.log'))
  } finally { Clear-SecretEnv }
  if ($rc -ne 0) { Fail "QR denemesi gösterilemedi (çıkış $rc)" }
  $a = Read-Answer 'Telefon QR''ı okudu ve "şifremi unuttum" sayfası açıldı mı? (E/H) — formu GÖNDERMEYİN'
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
    Write-Host ('PREFLIGHT GEÇTİ (salt okuma; kanıt/DB/ortam/canlı dosya yazılmadı) · main={0} · paket={1} · dist={2} ({3} dosya; R27/D5-SEC) · .env={4} · API pid={5} · portal base host={6} · e-posta sağlayıcısı={7} · node={8}' -f `
      $g.head.Substring(0, 8), $g.pkg.Substring(0, 16), $g.dist.Substring(0, 16), $g.distFiles, $g.envSha.Substring(0, 16), $g.apiPid, $g.baseHost, $g.emailProvider, $g.nodeVersion) -ForegroundColor Green
    Write-Host ('  dış zincir DOĞRULANDI: 8081 yalnız 127.0.0.1 (dinleyici pid={0} = HY-Caddy servisi) · Cloudflared={1}' -f $g.chain.loopbackPids, $g.chain.cloudflaredStatus)
    $rc = 0
  }
  elseif ($Mode -eq 'QrTest') { $rc = Invoke-QrTestMode $g }
  elseif ($Mode -eq 'Run') { $rc = Invoke-RunMode $g }
  else { $rc = Invoke-RecoverMode $g $ReceiptFile }
}
catch {
  if ($_.Exception.Message -notlike 'EXTACC-D5-DUR:*') { Write-Host "DUR - beklenmeyen hata: $($_.Exception.Message)" -ForegroundColor Red }
  $rc = if (($script:LastNodeRc -is [int]) -and $script:LastNodeRc -ne 0) { $script:LastNodeRc } else { 90 }
}
finally { Clear-SecretEnv }
if (-not ($rc -is [int])) { $rc = 91 }
exit $rc
