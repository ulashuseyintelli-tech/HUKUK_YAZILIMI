# ═══════════ EXTACC D-4 R01 PORTAL GİRİŞİ + PORTAL ERİŞİM KAPANIŞI - OWNER BLOĞU (normal PowerShell; YÖNETİCİ GEREKMEZ) ═══════════
# MODLAR
#   -Mode Preflight  SALT OKUMA: tüm kapılar; GO sorulmaz; hiçbir dosya/ortam/DB yazılmaz; node çağrılmaz.
#   -Mode QrTest     Canlı veri YOK: portal giriş adresinin QR'ı yerel konsolda gösterilir; owner telefonla okutur.
#   -Mode Run        TEK SEFERLİK canlı koşum: kapılar → bağımsız pencere teyidi → canlı veri işleme onayı → GO (yerel)
#                    → GO defteri (yalnız sha256, koşumdan ÖNCE) → koşum (QR + e-posta + GEÇİCİ PAROLA YALNIZ bu konsolda)
#                    → ekran temizliği → owner beyanı (ayrı dosya) → kanıt manifesti.
#   -Mode Recover    Yalnız kapanış (portal + personel/dosya); `-ReceiptFile` zorunlu; GO sorulmaz; kabul ölçütleri koşulmaz.
# YAPMAZ: e-posta/SMS (parola sıfırlama/değiştirme uçları çağrılmaz) · belge/mesaj · .env/görev/Caddy/tünel/DNS değişikliği ·
#         yeniden başlatma · otomatik tekrar · otomatik Recover.
# SIR   : DB URL, personel parolası, GEÇİCİ PORTAL PAROLASI, GO ref ve token'lar hiçbir dosyaya yazılmaz. Geçici parola yalnız bu
#         konsol penceresine çizilir; pencereyi kaydeden bir terminal (uygulama paneli, transcript'li oturum) KULLANMAYIN;
#         koşum sonunda pencereyi kapatın.
# ÇIKIŞ : node kodu değiştirilmeden taşınır · 90 kapıda durdu · 91 node başlatılamadı / kod alınamadı · 7 kanıt yok.
param(
  [ValidateSet('Preflight', 'QrTest', 'Run', 'Recover')] [string]$Mode = 'Preflight',
  [string]$ReceiptFile = ''
)
$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $false

$Repo     = 'D:\Development\HUKUK_YAZILIMI\project'
$Gov      = Join-Path $Repo 'project\docs\governance'
$Sc       = Join-Path $Gov 'client-extacc-portal-d4-r01\scripts'
$QrSc     = Join-Path $Gov 'client-extacc-intake-chain-r01\scripts'
$Rel      = 'C:\Development\HUKUK_YAZILIMI\HY_W4_RELEASE23\project'
$EnvFile  = Join-Path $Rel 'apps\api\.env'
$LiveDist = Join-Path $Rel 'apps\api\dist\apps\api\src'
$EvRoot   = 'C:\Users\ulastelli\Documents\CLIENT-EVIDENCE-20260911'
$GoLedger = Join-Path $EvRoot 'extacc-d4-goref-ledger.txt'
$Api      = 'http://127.0.0.1:8080/api'

# ---- PİNLER (uyuşmazlık OTOMATİK KABUL EDİLMEZ; blok durur) ----
$ExpLiveDist = 'A8B17A38327975C71DDAE82FE33D1E97CB8B339FB1E35D1828FCF8D0CEB053A0'   # R26 canlı dist
$ExpEnvSha   = '5C776BBEEE018EA5CC8192378D42D742FD4ABC1B6D0E9A3EA671CF463206908D'   # canlı .env (H5 sonrası)
$ExpBaseUrl  = 'https://bilgi.tellihukuk.com'                                         # R05 owner kararı
# Koşucunun YÜKLEDİĞİ tüm governance dosyaları + QR denemesi (require ağacı ölçüldü).
$PkgPins = [ordered]@{
  'client-extacc-portal-d4-r01\scripts\d4-portal-live-run.js'                         = '4B28094DEA1E7F2E4DEF2253F0BE9EAA9F1B845884B6697D621141CD8D123222'
  'client-extacc-intake-chain-r01\scripts\extacc-display.js'                          = 'F257188DF66C429472C214D38D965C1E6F5A2EA490D348369AC68C5DC6F26867'
  'client-extacc-intake-chain-r01\scripts\extacc-qr-test.js'                          = '61FBCEE86148DEA1B268A1B883F1690ED6F3D4BBD36EAEA29783F24D487B8B10'
  'client-extacc-intake-chain-r01\scripts\vendor\qrcode-generator-1.4.4\qrcode.js'    = '18AE399F81182BC9DE916E9C77B195DF20CC58D6F2D55A62B085A299F1BF1780'
  'client-h5-intake-url-r01\scripts\h5-url-live-run.js'                               = 'F2D0975DC9F9D148E4C889472FA11AE6A873A6BDF577C36657ED9BCB4FF9C359'
  'client-live-acceptance-i13-r01\scripts\i13-lib.js'                                 = '59BA7360F270AB66D0A892659A7569AFF1800D65B49415EF5FAD3B84DFEDD385'
  'client-live-acceptance-i12-r01\scripts\i12-live-identity.js'                       = '9516E462CFFD3B22FD253F556A7F1853C6F021B175075449BD7945CCEF36774F'
  'client-acceptance-runners-i3-r01\scripts\i3-lib.js'                                = '56F3788E9F84746CFFEE384D8C18B9B9A28130CC8E2285F9570AB69CC6EE74A3'
  'client-acceptance-harness-r01\scripts\ah-lib.js'                                   = 'DF882DB7F33A667092F126F01E518C1A8292C8C0B3C4C039BF73D71F3ACCBFD7'
}
$ExpPackage = 'D019981C35DE3C7DBE449E775C9078723C661C7D89DD6008D57A61F86523C095'
$SecretEnv  = @('AH_DATABASE_URL', 'AH_PRISMA_ROOT', 'AH_BCRYPT_PATH', 'D4_LIVE_CONFIRM', 'D4_RECOVER_CONFIRM', 'D4_LIVE_GO_REF',
                'D4_RUNID', 'D4_MODE', 'D4_EXPECT_DB', 'D4_EXPECT_TENANT_SLUG', 'D4_API_BASE', 'D4_EXPECT_API',
                'D4_EXPECT_BASE_URL', 'D4_LIVE_LOGIN_PW', 'D4_RECEIPT', 'D4_EVID_FILE', 'D4_DISPLAY', 'EXA_QRTEST_URL',
                'D4_WAIT_MS', 'D4_POLL_MS', 'D4_VIEW_MS', 'D4_HTTP_TIMEOUT_MS', 'D4_CALL_TIMEOUT_MS', 'D4_LATE_CREATE_MS')
# CANLI SÜRELER — açıkça kurulur; pencereden devralınan değerler başta ve sonda SİLİNİR (koşucu da canlı DB'de bunları zorlar).
$LiveParams = [ordered]@{ D4_WAIT_MS = '1200000'; D4_POLL_MS = '5000'; D4_VIEW_MS = '120000'; D4_HTTP_TIMEOUT_MS = '15000'; D4_CALL_TIMEOUT_MS = '30000'
                          D4_LATE_CREATE_MS = '120000' }
$script:LastNodeRc = $null

function Fail([string]$m) { Write-Host "DUR - $m" -ForegroundColor Red; throw "EXTACC-D4-DUR: $m" }
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
function Read-GoRef { return (Read-Host 'EXTACC D-4 canlı GO ref (OWNER-GO-CLIENT-EXTACC-D4-YYYYMMDD-RNN)') }
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
  if ($gotDist -ne $ExpLiveDist) { Fail "CANLI DIST uyuşmuyor: $gotDist ($n dosya)" }
  $envSha = Sha $EnvFile
  if ($envSha -ne $ExpEnvSha) { Fail "CANLI .env pini uyuşmuyor: $envSha" }
  $baseUrl = EnvValue 'PUBLIC_INTAKE_BASE_URL'
  if ($baseUrl -cne $ExpBaseUrl) { Fail 'PUBLIC_INTAKE_BASE_URL beklenen owner kararıyla (R05) eşleşmiyor' }
  $lis = @(Get-NetTCPConnection -State Listen -LocalPort 8080 -ErrorAction SilentlyContinue)
  if ($lis.Count -ne 1) { Fail "8080 dinleyici sayısı $($lis.Count) (1 bekleniyor)" }
  $foreign = @(Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -match 'i1\d-|i3-sink|i3-start-api|f04-|h5-url-|extacc-|d4-portal-' })
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
# DIŞ ZİNCİR (salt okuma ölçüm): 8081'deki TÜM dinleyiciler (yalnız loopback olmalı), dinleyicinin HY-Caddy servisine
# ait olması ve Cloudflared servisinin durumu.
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
# Preflight ve Run için ZORUNLU kapı (Recover için değil: kapanış dış zincir olmadan da yapılabilmeli).
function Assert-ExternalChain($s) {
  if (-not $s) { Fail 'dış zincir ölçülemedi' }
  if ([int]$s.loopbackCount -lt 1) { Fail 'Caddy 127.0.0.1:8081 dinleyicisi YOK' }
  if ($s.otherAddresses) { Fail "8081 loopback DIŞINDA da dinliyor: $($s.otherAddresses)" }
  if ($s.caddyServiceState -ne 'Running') { Fail "HY-Caddy servisi çalışmıyor ($($s.caddyServiceState))" }
  if ([string]$s.loopbackPids -ne [string]$s.caddyServicePid) { Fail "8081 dinleyicisi HY-Caddy servisine ait değil (dinleyici pid=$($s.loopbackPids) servis pid=$($s.caddyServicePid))" }
  if ($s.cloudflaredStatus -ne 'Running') { Fail "Cloudflared servisi çalışmıyor ($($s.cloudflaredStatus))" }
}
# Giriş bilgisi yalnız bu konsola çizilir: çıktısı yönlendirilmiş ya da konsol olmayan bir host reddedilir.
function Assert-LocalConsole {
  if ($Host.Name -ne 'ConsoleHost') { Fail "konsol host'u değil ($($Host.Name)) — bağımsız bir PowerShell penceresi kullanın" }
  if ([Console]::IsOutputRedirected) { Fail 'konsol çıktısı yönlendirilmiş — giriş bilgisi gösterilemez' }
}

function Set-RunEnv([string]$runId, [string]$evDir) {
  $env:AH_DATABASE_URL = EnvValue 'DATABASE_URL'
  $env:AH_PRISMA_ROOT = Join-Path $Rel 'node_modules\.pnpm\@prisma+client@5.22.0_prisma@5.22.0\node_modules\@prisma\client'
  $env:AH_BCRYPT_PATH = Join-Path $Rel 'node_modules\.pnpm\bcrypt@5.1.1\node_modules\bcrypt'
  $env:D4_RUNID = $runId; $env:D4_EXPECT_DB = 'hukuk_db'; $env:D4_API_BASE = $Api; $env:D4_EXPECT_API = $Api
  $env:D4_EXPECT_BASE_URL = $ExpBaseUrl
  $rb = New-Object byte[] 18; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($rb)
  $env:D4_LIVE_LOGIN_PW = 'D4S!' + [Convert]::ToBase64String($rb).TrimEnd('=').Replace('+', '-').Replace('/', '_'); $rb = $null
  $env:D4_EVID_FILE = Join-Path $evDir 'd4-evidence.json'
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
# Canlı veri işleme — Run'dan ÖNCE açıkça sunulur; "EVET" yazılmazsa GO sorulmaz ve hiçbir şey yazılmaz.
function Confirm-LiveDataProcessing {
  Write-Host ''
  Write-Host 'CANLI VERİ İŞLEME — onayınız gerekiyor:' -ForegroundColor Yellow
  Write-Host '  Canlı DB''de YALNIZ yeni bir sentetik tenantta yazılacak: sentetik kullanıcılar, müvekkil, dosya, borçlu ve'
  Write-Host '  sentetik müvekkile ait BİR portal hesabı (e-posta *.invalid; geçici parola YALNIZ bu konsolda görünür, hiçbir yere yazılmaz).'
  Write-Host '  E-posta/SMS GÖNDERİLMEZ. Girişler portal hesabında son giriş zamanını ve giriş sayısını günceller; portal erişimi açma/kapatma'
  Write-Host '  audit kayıtları oluşur; API günlüğüne maskelenmiş sentetik e-posta ile "Portal girişi" satırı düşer; giriş hız sınırı'
  Write-Host '  sayaçları (telefon IP''si için) oluşabilir. Kapanış: portal hesabı pasif + oturum sürümü artırılır, müvekkil portal erişimi'
  Write-Host '  kapalı, personel kullanıcıları pasif, dosya CLOSED. Gerçek müvekkil verisine ve bildirimlere dokunulmaz.'
  $a = Read-Answer 'Bu işlemeyi onaylıyor musunuz? Onay için büyük harfle EVET yazın'
  if ($a -cne 'EVET') { Fail 'canlı veri işleme onaylanmadı — koşum başlamadı' }
}
# Kapanış durumu kanıttan okunur; metin KOŞULSUZ "kapatıldı" demez.
function Get-ClosureStatus([string]$evidFile, [object]$rc) {
  $st = [ordered]@{ verified = $false; text = ''; finding = $null; waitVerdict = $null }
  try {
    $ev = Get-Content -Raw -LiteralPath $evidFile | ConvertFrom-Json
    $d9 = ($ev.results | Where-Object { $_.id -eq 'P-D9' }).verdict
    $st.waitVerdict = ($ev.results | Where-Object { $_.id -eq 'P-WAIT' }).verdict
    $st.finding = $ev.productFinding
    $st.verified = ($d9 -eq 'PASS')
  } catch { $st.verified = $false }
  $st.text = if ($st.verified) { 'Portal erişim kapanışı koşucu tarafından DOĞRULANDI (DB + yeni giriş + mevcut oturum reddi).' }
             else { "Portal erişim kapanışı DOĞRULANAMADI (çıkış $rc) — telefondaki erişim açık kalmış olabilir; sonucu CLIENT'a bildirin." }
  return [pscustomobject]$st
}
function Write-OwnerDeclaration([string]$evDir, [string]$runId, $closure) {
  Write-Host ''
  $c = if ($closure -and $closure.verified) { 'Green' } else { 'Red' }
  Write-Host ("Koşum bitti. {0}" -f $(if ($closure) { $closure.text } else { 'Portal erişim kapanışı DOĞRULANAMADI (kanıt okunamadı).' })) -ForegroundColor $c
  Write-Host 'Şimdi telefonda açık portal sayfasını bir kez YENİLEYİN, sonra aşağıdaki soruları ekranda gördüğünüze göre yanıtlayın.' -ForegroundColor Cyan
  Write-Host 'OWNER BEYANI (makine ölçümünden AYRI kaydedilir). Emin değilseniz ? yazın.' -ForegroundColor Cyan
  $d = [ordered]@{
    record = 'EXTACC-D4-OWNER-DECLARATION'; runId = $runId; not = 'owner beyanıdır; makine ölçümü değildir'
    closureShownToOwner = $(if ($closure) { $closure.text } else { 'kanıt okunamadı' })
    telefonGirisSayfasiAcildi = (Read-Answer 'Telefonda portal giriş sayfası açıldı mı? (E/H/?)')
    girisDenemeSayisi         = (Read-Answer 'Telefondan kaç kez giriş denediniz? (sayı ya da ?)')
    girisSonrasiEkran         = (Read-Answer 'Girişten sonra ne gördünüz? (L = dosya listesi · G = yine giriş sayfası · D = başka/hata sayfası · ?)')
    listedekiDosyaSayisi      = (Read-Answer 'Listede kaç dosya vardı? (sayı ya da ?)')
    dosyaNumarasiKarsilastirma = (Read-Answer 'Listedeki dosya numarası konsolda yazan numarayla aynı mıydı? (E/H/?)')
    telefonAgi                = (Read-Answer 'Telefon hangi ağdaydı? (M = mobil veri, Wi-Fi kapalı · W = Wi-Fi · ?)')
    yenilemeSonrasiEkran      = (Read-Answer 'Yeniledikten sonra ne gördünüz? (L = dosya listesi · G = giriş sayfası · D = başka/hata sayfası · Y = yenilemedim · ?)')
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
  Confirm-LiveDataProcessing
  $GoRef = Read-GoRef
  if ($GoRef -cnotmatch '^OWNER-GO-CLIENT-EXTACC-D4-\d{8}-R\d{2}$') { Fail 'GO ref BİÇİMİ hatalı' }
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
  $EvDir = Join-Path $EvRoot ("extacc-d4-live-{0}-{1}" -f $RunId, (Get-Date -Format 'yyyyMMdd-HHmmss'))
  New-Item -ItemType Directory -Force -Path $EvDir | Out-Null
  Add-Content -LiteralPath $GoLedger -Value ("{0}  runId={1}  {2}" -f $goSha, $RunId, (Get-Date).ToUniversalTime().ToString('o')) -Encoding ASCII
  [ordered]@{ record = 'EXTACC-D4-OWNER-BLOCK'; revision = 'R01'; mode = 'Run'; runId = $RunId; main = $g.head; packageDigest = $g.pkg; liveDist = $g.dist
              envSha = $g.envSha; apiPid = $g.apiPid; baseUrlHost = $g.baseHost; caddyLoopback = $g.caddyLoopback; cloudflaredRunning = $g.cloudflaredRunning
              nodeExe = $g.nodeExe; nodeVersion = $g.nodeVersion; liveDataProcessingConfirmed = $true; standaloneWindowConfirmed = $true
              startedUtc = (Get-Date).ToUniversalTime().ToString('o') } |
    ConvertTo-Json | Set-Content -LiteralPath (Join-Path $EvDir 'owner-block.json') -Encoding UTF8
  $decl = $null
  try {
    Set-RunEnv $RunId $EvDir
    $env:D4_MODE = 'run'; $env:D4_LIVE_CONFIRM = '1'; $env:D4_LIVE_GO_REF = $GoRef; $env:D4_DISPLAY = 'conout'
    $env:D4_EXPECT_TENANT_SLUG = "ah-$RunId"; $env:D4_RECEIPT = Join-Path $EvDir 'd4-setup-receipt.json'
    $evid = $env:D4_EVID_FILE
    Assert-FreshEvidence $evid
    $rc = Invoke-Node $g.nodeExe (Join-Path $Sc 'd4-portal-live-run.js') (Join-Path $EvDir 'd4-run.log')
    $rc = Complete-NodeRc $rc $evid
  }
  finally {
    Clear-SecretEnv
    Clear-OwnerScreen
    [ordered]@{ record = 'EXTACC-D4-GOREF-CONSUMED'; runId = $RunId; goRefSha256 = $goSha; literalWritten = $false; exitCode = $rc
                atUtc = (Get-Date).ToUniversalTime().ToString('o') } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $EvDir 'goref-consumed.json') -Encoding UTF8
    $GoRef = $null
  }
  $closure = Get-ClosureStatus (Join-Path $EvDir 'd4-evidence.json') $rc
  try { $decl = Write-OwnerDeclaration $EvDir $RunId $closure } finally { Write-Manifest $EvDir }
  $waitV = $closure.waitVerdict; $finding = $closure.finding
  Write-Host "EXTACC D-4 KOŞUM BİTTİ - RUNID=$RunId · çıkış=$rc" -ForegroundColor $(if ($rc -eq 0) { 'Green' } else { 'Yellow' })
  Write-Host '  0 PASS · 2 FAIL · 3 ÖLÇÜLEMEYEN · 1 DURDU · 4 KİMLİK REDDİ · 7 KANIT YAZILAMADI · 5 PERSONEL/DOSYA KAPANIŞI · 6 PORTAL ERİŞİMİ KAPANDIĞI DOĞRULANMADI · 91 NODE BAŞLATILAMADI'
  if ($finding) { Write-Host "  $finding — bu bir ÜRÜN BULGUSUDUR; kapanış PASS SAYILMAZ. CLIENT'a bildirin." -ForegroundColor Red }
  if ($waitV -eq 'UNMEASURED' -and $decl) {
    if ($decl.girisSonrasiEkran -ceq 'L') { Write-Host '  Koşucu başarılı giriş görmedi ama owner dosya listesini gördüğünü beyan etti — İNCELEME GEREKİR (FAIL adayı).' -ForegroundColor Yellow }
    else { Write-Host '  Başarılı telefon girişi görülmedi — ÖLÇÜLEMEYEN.' -ForegroundColor Yellow }
  }
  if ($decl -and $decl.yenilemeSonrasiEkran -ceq 'L') { Write-Host '  Owner, kapanıştan sonra yenilemede dosya listesini gördüğünü beyan etti — ÜRÜN BULGUSU ADAYI; CLIENT inceler.' -ForegroundColor Red }
  if ($rc -eq 5 -or $rc -eq 6) { Write-Host '  KAPANIŞ DOĞRULANMADI: -Mode Recover -ReceiptFile <makbuz> (ürün bulgusu varsa Recover onu DÜZELTMEZ). Kabulü TEKRARLAMAYIN.' -ForegroundColor Yellow }
  Write-Host "  kanıt dizini: $EvDir"
  Write-Host '  Bu pencereyi ŞİMDİ kapatın (kaydırma arabelleği). GO ref, parola ve değer bildirmeyin.'
  return $rc
}

# ---------------------------------------------------------------- RECOVER
function Invoke-RecoverMode($g, [string]$receiptPath) {
  $rc = 90
  if (-not $receiptPath -or -not (Test-Path -LiteralPath $receiptPath -PathType Leaf)) { Fail 'Recover için -ReceiptFile <makbuz yolu> gerekli' }
  $rcpt = Get-Content -Raw -LiteralPath $receiptPath | ConvertFrom-Json
  if ($rcpt.record -ne 'EXTACC-D4-SETUP-RECEIPT' -or $rcpt.runId -notmatch '^[0-9a-f]{8}$') { Fail 'makbuz biçimi tanınmadı' }
  $EvDir = Join-Path (Split-Path -Parent $receiptPath) ("recover-{0}-{1}" -f (Get-Date -Format 'yyyyMMdd-HHmmss'), [Guid]::NewGuid().ToString('N').Substring(0, 6))
  New-Item -ItemType Directory -Force -Path $EvDir | Out-Null
  try {
    Set-RunEnv $rcpt.runId $EvDir
    $env:D4_MODE = 'recover'; $env:D4_RECOVER_CONFIRM = '1'; $env:D4_RECEIPT = $receiptPath; $env:D4_DISPLAY = 'conout'
    $evid = $env:D4_EVID_FILE
    Assert-FreshEvidence $evid
    $rc = Invoke-Node $g.nodeExe (Join-Path $Sc 'd4-portal-live-run.js') (Join-Path $EvDir 'd4-recover.log')
    $rc = Complete-NodeRc $rc $evid
  }
  finally { Clear-SecretEnv; Write-Manifest $EvDir }
  Write-Host "EXTACC D-4 KURTARMA BİTTİ - RUNID=$($rcpt.runId) · çıkış=$rc (0 kapanış ve HTTP reddi doğrulandı · 3 DB kapalı ama bazı HTTP kontrolleri ÖLÇÜLEMEDİ (ör. mevcut oturum; PASS SAYILMAZ) · 6 portal DB/HTTP kapanışı doğrulanmadı · 5 personel/dosya · 4 kimlik reddi · 7 kanıt yok · 91 node başlatılamadı)" -ForegroundColor $(if ($rc -eq 0) { 'Green' } else { 'Yellow' })
  if ($rc -eq 3) { Write-Host '  Recover TEKRARLANMAZ; ölçülemeyen satırlar Run kanıtıyla birlikte CLIENT tarafından değerlendirilir.' -ForegroundColor Yellow }
  Write-Host "  kanıt dizini: $EvDir"
  return $rc
}

# ---------------------------------------------------------------- QR DENEMESİ (canlı veri YOK)
function Invoke-QrTestMode($g) {
  Assert-LocalConsole
  $rc = 90
  try {
    $env:EXA_QRTEST_URL = "$ExpBaseUrl/portal/login"
    $rc = Invoke-Node $g.nodeExe (Join-Path $QrSc 'extacc-qr-test.js') ([IO.Path]::Combine([IO.Path]::GetTempPath(), 'extacc-d4-qrtest.log'))
  } finally { Clear-SecretEnv }
  if ($rc -ne 0) { Fail "QR denemesi gösterilemedi (çıkış $rc)" }
  $a = Read-Answer 'Telefon QR''ı okudu ve portal GİRİŞ sayfası açıldı mı? (E/H) — giriş YAPMAYIN'
  Clear-OwnerScreen
  # İki AYRI sonuç: gösterim (makine) ve telefonun okuyabilmesi (owner beyanı). Yalnız açık "E" başarıdır.
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
    Write-Host ('PREFLIGHT GEÇTİ (salt okuma; hiçbir şey yazılmadı) · main={0} · paket={1} · dist={2} ({3} dosya) · .env={4} · API pid={5} · base host={6} · node={7}' -f `
      $g.head.Substring(0, 8), $g.pkg.Substring(0, 16), $g.dist.Substring(0, 16), $g.distFiles, $g.envSha.Substring(0, 16), $g.apiPid, $g.baseHost, $g.nodeVersion) -ForegroundColor Green
    Write-Host ('  dış zincir DOĞRULANDI: 8081 yalnız 127.0.0.1 (dinleyici pid={0} = HY-Caddy servisi) · Cloudflared={1}' -f $g.chain.loopbackPids, $g.chain.cloudflaredStatus)
    $rc = 0
  }
  elseif ($Mode -eq 'QrTest') { $rc = Invoke-QrTestMode $g }
  elseif ($Mode -eq 'Run') { $rc = Invoke-RunMode $g }
  else { $rc = Invoke-RecoverMode $g $ReceiptFile }
}
catch {
  if ($_.Exception.Message -notlike 'EXTACC-D4-DUR:*') { Write-Host "DUR - beklenmeyen hata: $($_.Exception.Message)" -ForegroundColor Red }
  $rc = if (($script:LastNodeRc -is [int]) -and $script:LastNodeRc -ne 0) { $script:LastNodeRc } else { 90 }
}
finally { Clear-SecretEnv }
if (-not ($rc -is [int])) { $rc = 91 }
exit $rc
