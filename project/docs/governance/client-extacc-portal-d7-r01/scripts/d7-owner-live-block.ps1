# ═══════════ EXTACC D-7 R01 PORTAL MESAJ AKIŞI + PORTAL ERİŞİM KAPANIŞI - OWNER BLOĞU (normal PowerShell; YÖNETİCİ GEREKMEZ) ═══════════
# R02 (2026-10-01): YALNIZ METİN (yorumlar, konsol çıktısı, istem metinleri) — kod/akış/pinler DEĞİŞMEDİ; kayıt alanı `revision` 'R01' kalır.
#          Run çıkış 5/6 Recover yetkisi değildir; Recover'ın canlı yazma kümesi gösterilir; beyan seçenekleri ana sayfa/özeti hata sayfasından ayırır.
# MODLAR
#   -Mode Preflight  SALT OKUMA: tüm kapılar (canlı dist = R27 pini); GO sorulmaz; kanıt/ortam/DB/canlı dosya yazılmaz; koşucu çağrılmaz (yalnız `node --version`). Kapılardaki `git fetch` yerel repodaki uzak izleme ref'lerini günceller (iş verisi değildir).
#   -Mode QrTest     Canlı veri YOK: portal MESAJ sayfasının QR'ı yerel konsolda gösterilir (d7-qr-test.js); owner telefonla okutur.
#   -Mode Run        TEK SEFERLİK canlı koşum: kapılar → bağımsız pencere teyidi → canlı veri işleme onayı → GO (yerel) → GO defteri
#                    (yalnız sha256, koşumdan ÖNCE) → koşum (mesaj ölçümleri; konsol: QR + giriş bilgisi) → ekran temizliği →
#                    owner beyanı (ayrı dosya) → kanıt manifesti.
#   -Mode Recover    Yalnız kapanış (portal + personel/dosya; mesaj satırları SİLİNMEZ); `-ReceiptFile` zorunlu; GO sorulmaz; kabul ölçütleri koşulmaz.
#                    Run'ın koşucu İÇİNDEKİ kendi kapanış adımlarından AYRI bir işlemdir: otomatik DEĞİLDİR; Run çıkış 5/6 Recover yetkisi
#                    DEĞİLDİR — önce kanıt incelenir, açık kalan kaynaklar bildirilir, Recover yalnız AYRI owner onayıyla, BİR KEZ başlatılır.
#                    "BİR KEZ" kodla ZORLANMAZ: blok ve koşucu ikinci bir Recover'ı engellemez (GO sorulmaz, defter tutulmaz); kural owner disiplinidir.
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
  [string]$ReceiptFile = ''
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
  'client-extacc-portal-d7-r01\scripts\d7-portal-messages-live-run.js'                = 'E752DA1EFCA9B8C7529CC0EC66B4F90530025FBF9918F4A9B56DBB3A6916D2B6'
  'client-extacc-portal-d7-r01\scripts\d7-qr-test.js'                                 = '15E6431396E978423BAE72F3B7511F3972F12847EF96AA02C12937E0F2233E15'
  'client-extacc-intake-chain-r01\scripts\extacc-display.js'                          = 'F257188DF66C429472C214D38D965C1E6F5A2EA490D348369AC68C5DC6F26867'
  'client-extacc-intake-chain-r01\scripts\vendor\qrcode-generator-1.4.4\qrcode.js'    = '18AE399F81182BC9DE916E9C77B195DF20CC58D6F2D55A62B085A299F1BF1780'
  'client-h5-intake-url-r01\scripts\h5-url-live-run.js'                               = 'F2D0975DC9F9D148E4C889472FA11AE6A873A6BDF577C36657ED9BCB4FF9C359'
  'client-live-acceptance-i13-r01\scripts\i13-lib.js'                                 = '59BA7360F270AB66D0A892659A7569AFF1800D65B49415EF5FAD3B84DFEDD385'
  'client-live-acceptance-i12-r01\scripts\i12-live-identity.js'                       = '9516E462CFFD3B22FD253F556A7F1853C6F021B175075449BD7945CCEF36774F'
  'client-acceptance-runners-i3-r01\scripts\i3-lib.js'                                = '56F3788E9F84746CFFEE384D8C18B9B9A28130CC8E2285F9570AB69CC6EE74A3'
  'client-acceptance-harness-r01\scripts\ah-lib.js'                                   = 'DF882DB7F33A667092F126F01E518C1A8292C8C0B3C4C039BF73D71F3ACCBFD7'
}
$ExpPackage = '7C42FCCD6349F95E42128F78CA1A86DF36EB20E246FD0D9936A8B1098DBA7BDD'
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
# Metin paket belgesi §8'deki "canlıda oluşacak kayıtlar" listesiyle AYNI kalemleri taşır (öz-test G-2); kaynaktan okunan ile ölçülen ayrı yazılır.
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
  Write-Host '  (tenant kaydı kapatılmaz; koşucunun kanıt metnindeki "sentetik tenant CLOSED" = dosyalar CLOSED + personel pasif + portal pasif).'
  Write-Host '  MESAJ ve BİLDİRİM SATIRLARI SİLİNMEZ (ürünte silme ucu yok); kanıtta "saklandı: n satır" olarak raporlanır.'
  Write-Host '  Diğer tenantlar için ölçülen yalnız U-ISO''dur: tenant başına kullanıcı ve müvekkil SAYISI önce/sonra aynı (içerik karşılaştırılmaz).'
  $a = Read-Answer 'Bu işlemeyi onaylıyor musunuz? Onay için büyük harfle EVET yazın'
  if ($a -cne 'EVET') { Fail 'canlı veri işleme onaylanmadı — koşum başlamadı' }
}
# Kapanış durumu kanıttan okunur; metin KOŞULSUZ "kapatıldı" demez.
function Get-ClosureStatus([string]$evidFile, [object]$rc) {
  $st = [ordered]@{ verified = $false; text = ''; finding = $null; waitVerdict = $null; keptVerdict = $null; keptText = $null; reply2Verdict = $null; residue = $null }
  try {
    $ev = Get-Content -Raw -Encoding UTF8 -LiteralPath $evidFile | ConvertFrom-Json   # node kanıtı UTF-8 (BOM'suz); WinPS 5.1 varsayılanı ANSI
    $d9 = ($ev.results | Where-Object { $_.id -eq 'P7-D9' }).verdict
    $st.waitVerdict = ($ev.results | Where-Object { $_.id -eq 'P7-WAIT' }).verdict
    $st.reply2Verdict = ($ev.results | Where-Object { $_.id -eq 'D7-3B' }).verdict
    $kept = ($ev.results | Where-Object { $_.id -eq 'P7-MSG-KEPT' })
    $st.keptVerdict = $kept.verdict; $st.keptText = $kept.observed
    $st.finding = $ev.productFinding; $st.residue = $ev.messageResidue
    $st.verified = ($d9 -eq 'PASS')
  } catch { $st.verified = $false }
  $st.text = if ($st.verified) { 'Portal erişim kapanışı koşucu tarafından DOĞRULANDI (DB + yeni giriş + mevcut oturum mesaj ucunda reddi).' }
             else { "Portal erişim kapanışı DOĞRULANAMADI (çıkış $rc) — telefondaki erişim açık kalmış olabilir; sonucu CLIENT'a bildirin." }
  return [pscustomobject]$st
}
function Write-OwnerDeclaration([string]$evDir, [string]$runId, $closure) {
  Write-Host ''
  $c = if ($closure -and $closure.verified) { 'Green' } else { 'Red' }
  Write-Host ("Koşum bitti. {0}" -f $(if ($closure) { $closure.text } else { 'Portal erişim kapanışı DOĞRULANAMADI (kanıt okunamadı).' })) -ForegroundColor $c
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
  if ($finding) { Write-Host "  $finding — bu bir ÜRÜN BULGUSUDUR; kapanış PASS SAYILMAZ. CLIENT'a bildirin." -ForegroundColor Red }
  if ($closure.keptText) {
    Write-Host "  Mesaj kalıntısı: $($closure.keptText)" -ForegroundColor Cyan
    Write-Host '  (kanıt metnindeki "sentetik tenant CLOSED" = dosyalar CLOSED + personel pasif + portal pasif; tenant yaşam döngüsü DEĞİŞMEZ.)' -ForegroundColor Cyan
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
    Write-Host '  bir ÖNERİDİR: -Mode Recover -ReceiptFile <makbuz> yalnız AYRI owner onayıyla, BİR KEZ (ürün bulgusu varsa Recover onu DÜZELTMEZ). Kabulü TEKRARLAMAYIN.' -ForegroundColor Yellow
    Write-Host '  Recover ayrı bir CANLI YAZMA işlemidir (sentetik personeli geçici yeniden aktifleştirme + parola özeti, pasif portal hesabına ölçüm parolası özeti,' -ForegroundColor Yellow
    Write-Host '  kapatma audit satırı, personel/dosya kapanışı); "BİR KEZ" kuralı kodla ZORLANMAZ — ayrıntı paket belgesi §8.1.' -ForegroundColor Yellow
  }
  Write-Host "  kanıt dizini: $EvDir"
  Write-Host '  Bu pencereyi ŞİMDİ kapatın (kaydırma arabelleği). GO ref ve parola bildirmeyin. Mesaj satırları kanıt olarak DB''de KALIR.'
  return $rc
}

# ---------------------------------------------------------------- RECOVER
function Invoke-RecoverMode($g, [string]$receiptPath) {
  $rc = 90
  if (-not $receiptPath -or -not (Test-Path -LiteralPath $receiptPath -PathType Leaf)) { Fail 'Recover için -ReceiptFile <makbuz yolu> gerekli' }
  $rcpt = Get-Content -Raw -Encoding UTF8 -LiteralPath $receiptPath | ConvertFrom-Json
  if ($rcpt.record -ne 'EXTACC-D7-SETUP-RECEIPT' -or $rcpt.runId -notmatch '^[0-9a-f]{8}$') { Fail 'makbuz biçimi tanınmadı' }
  # Bilgi metni (yalnız gösterim; soru/akış YOK): Recover'ın canlı yazma kümesi ve yetki kuralı. Blok owner onayını ve "BİR KEZ" kuralını ÖLÇMEZ.
  Write-Host ''
  Write-Host "EXTACC D-7 RECOVER BAŞLIYOR (runId=$($rcpt.runId)) — yalnız kapanış; Run'ın koşucu içindeki kendi kapanış adımlarından AYRI bir CANLI YAZMA işlemidir." -ForegroundColor Yellow
  Write-Host '  Bu Recover, Run kanıtı incelendikten sonra AYRI owner onayıyla başlatılmış olmalıdır; Run çıkış 5/6 tek başına Recover yetkisi DEĞİLDİR.' -ForegroundColor Yellow
  Write-Host '  Blok bu onayı SORMAZ ve ÖLÇMEZ; "BİR KEZ" kuralı kodla ZORLANMAZ (blok ve koşucu ikinci bir Recover''ı engellemez).' -ForegroundColor Yellow
  Write-Host '  Recover canlıya şunları YAZAR (koşucu kaynağından okundu; canlıda koşulmadı):'
  Write-Host '   1) Portal hâlâ açıksa: makbuzdaki sentetik personel GEÇİCİ olarak yeniden aktifleştirilir ve parola özeti yeniden yazılır; o personelle yerel'
  Write-Host '      API''de oturum açılır ve yetkili uç çağrılır (admin/disable-user, en çok 2 deneme): portal hesabı pasif + sürüm artışı, müvekkil portal'
  Write-Host '      erişimi kapalı, kapatma audit satırı (aktör: sentetik personel).'
  Write-Host '   2) Portal DB''de kapalı durumdaysa (1. adımla ya da önceden): pasif portal hesabına YALNIZ ölçüm için yeni rastgele parola özeti yazılır'
  Write-Host '      (hesap pasif kalır); bu parolayla yerel ve dış adresten giriş DENENİR (401 beklenir).'
  Write-Host '   3) Personel/dosya kapanışı (closeAccess): iki sentetik tenantın TÜM kullanıcıları pasif + sürüm artışı (her Recover''da yeniden artar),'
  Write-Host '      açık dosyalar CLOSED. 1. adımda aktifleştirilen personel burada yeniden pasifleştirilir; bu adım doğrulanmazsa personel AKTİF kalmış'
  Write-Host '      olabilir (çıkış 5; portal da doğrulanmadıysa 6). Tenant kaydı değiştirilmez; mesaj ve bildirim satırları SİLİNMEZ.'
  Write-Host '   4) Makbuzun yanında yeni bir recover-* kanıt dizini (d7-evidence.json, d7-recover.log, SHA256-MANIFEST.txt). GO defteri değişmez.'
  Write-Host '  Recover U-ISO ölçmez; portal hesabı varken mevcut oturum reddi Recover''da ÖLÇÜLEMEZ (bu durumda en iyi çıkış 3).'
  Write-Host '  Kimlik bağı doğrulanmazsa koşucu canlı DB''ye yazmadan durur (çıkış 4).'
  $EvDir = Join-Path (Split-Path -Parent $receiptPath) ("recover-{0}-{1}" -f (Get-Date -Format 'yyyyMMdd-HHmmss'), [Guid]::NewGuid().ToString('N').Substring(0, 6))
  New-Item -ItemType Directory -Force -Path $EvDir | Out-Null
  try {
    Set-RunEnv $rcpt.runId $EvDir
    $env:D7_MODE = 'recover'; $env:D7_RECOVER_CONFIRM = '1'; $env:D7_RECEIPT = $receiptPath; $env:D7_DISPLAY = 'conout'
    $evid = $env:D7_EVID_FILE
    Assert-FreshEvidence $evid
    $rc = Invoke-Node $g.nodeExe (Join-Path $Sc 'd7-portal-messages-live-run.js') (Join-Path $EvDir 'd7-recover.log')
    $rc = Complete-NodeRc $rc $evid
  }
  finally { Clear-SecretEnv; Write-Manifest $EvDir }
  $closure = Get-ClosureStatus (Join-Path $EvDir 'd7-evidence.json') $rc
  Write-Host "EXTACC D-7 KURTARMA BİTTİ - RUNID=$($rcpt.runId) · çıkış=$rc (0 kapanış + HTTP reddi doğrulandı · 3 DB kapalı ama bazı HTTP kontrolleri ÖLÇÜLEMEDİ (PASS SAYILMAZ) · 6 portal DB/HTTP kapanışı doğrulanmadı · 5 personel/dosya · 4 kimlik reddi · 7 kanıt yok · 91 node başlatılamadı)" -ForegroundColor $(if ($rc -eq 0) { 'Green' } else { 'Yellow' })
  if ($closure.keptText) {
    Write-Host "  Mesaj kalıntısı: $($closure.keptText)" -ForegroundColor Cyan
    Write-Host '  (kanıt metnindeki "sentetik tenant CLOSED" = dosyalar CLOSED + personel pasif + portal pasif; tenant yaşam döngüsü DEĞİŞMEZ.)' -ForegroundColor Cyan
  }
  if ($rc -eq 3) { Write-Host '  Recover TEKRARLANMAZ; ölçülemeyen satırlar Run kanıtıyla birlikte CLIENT tarafından değerlendirilir.' -ForegroundColor Yellow }
  Write-Host '  Bu çıkış kodu yeni bir Recover için yetki DEĞİLDİR: Recover BİR KEZ koşulur (kodla zorlanmaz); sonuç CLIENT''a bildirilir, tekrar ancak AYRI owner onayıyla.' -ForegroundColor Yellow
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
  else { $rc = Invoke-RecoverMode $g $ReceiptFile }
}
catch {
  if ($_.Exception.Message -notlike 'EXTACC-D7-DUR:*') { Write-Host "DUR - beklenmeyen hata: $($_.Exception.Message)" -ForegroundColor Red }
  $rc = if (($script:LastNodeRc -is [int]) -and $script:LastNodeRc -ne 0) { $script:LastNodeRc } else { 90 }
}
finally { Clear-SecretEnv }
if (-not ($rc -is [int])) { $rc = 91 }
exit $rc
