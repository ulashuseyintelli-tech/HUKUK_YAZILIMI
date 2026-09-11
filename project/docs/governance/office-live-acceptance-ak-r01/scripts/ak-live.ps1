# OFFICE RELEASE22 HEDEFLI KABUL (AK-2 + AK-1a) - OWNER'IN CALISTIRACAGI TEK GIRIS
#
#   Kabul kosumu (tek kez):
#     powershell -NoProfile -ExecutionPolicy Bypass -File "<...>\ak-live.ps1" -GoRef OWNER-GO-OFFICE-AK-YYYYMMDD-Rnn
#   Yalniz on kontrol (YAZMA YOK):
#     ... -GoRef <ayni> -PreflightOnly
#   Yarida kalirsa erisim kapatma / kurtarma (idempotent, tekrar guvenli):
#     ... -GoRef <ayni> -Recover <8 hex runId>
#
# ON KOSUL (bu betik DOGRULAYAMAZ, owner GO'su tasir): CLIENT I9 kapanisi dogrulanmis ve OFFICE canli
#   kosum GO'su verilmis olmali. Belge: OFFICE-LIVE-ACCEPTANCE-AK-R01.md bolum 1.
#
# YAZMADAN ONCE DURAN KAPILAR (exit 2):
#   K-GO   GoRef bicimi / Recover runId bicimi / node
#   K-ARC  bu betigin yanindaki arac dosyalari dondurulmus SHA'lar degil
#   K-API  8080 dinleyicisi RELEASE22 dist sureci degil                       (kurtarmada ATLANIR)
#   K-BLD  canli derlemenin AK dosyalari provada kosulan derleme degil         (kurtarmada ATLANIR)
#   K-ENV  baslatici EnvFile'i kosan surumun .env'i degil / DATABASE_URL yok / hedef 127.0.0.1:5432/hukuk_db degil
# Sonra ak-run.js / ak-99-close.js kendi G-0..G-4 kapilarini yeniden uygular (canli jeton + GO ref + DB/API kilidi).
# Kurtarma API'ye bagli DEGILDIR (dogrudan DB): canli surum degismis olsa bile erisim kapatilabilir.
#
# SIR: DATABASE_URL komut satirina KONMAZ (argv surec tablosunda gorunur); EnvFile'dan SURE ICINDE okunur,
#   yalniz host:port/ad basilir. Parola ve token'lar ak-run.js belleginde kalir.

param(
  [Parameter(Mandatory = $true)][string]$GoRef,
  [string]$Recover = '',
  [switch]$PreflightOnly,
  [string]$Launcher = 'C:\Ops\hukuk\bin\start-api.ps1',
  [string]$EvidenceDir = 'C:\Ops\hukuk\logs\office-ak-r01'
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$here = Split-Path -Parent $MyInvocation.MyCommand.Path

function Stop-Gate([string]$gate, [string]$msg) {
  Write-Host "DURDU [$gate] (yazma YOK): $msg" -ForegroundColor Red
  exit 2
}

# Provada kosulan derleme (RELEASE22 13740670) ve dondurulmus araclar
$BUILD_PINS = @{
  'modules\lawyer\lawyer.service.js'                          = '427DB2F15BF619B99DF3448F90DE10D606C40314389AAAD26613C226F1A4323D'
  'modules\office-approval\office-f01-authorization.guard.js' = '38FF644526852082B0DEE81970C6C53DEE0C535FE09D33E5D3F3703AA3F363EA'
}
$TOOL_PINS = @{
  'ak-lib.js'                                   = '97EC6F432436053DA6B356BAF2D9650CCBB4A8C0EFAE967AA02374EC0F71DF98'
  'ak-setup.js'                                 = '72A31B3D15F282DAB31B57EA1FAD5B430877FC517B61FD323C885422C25CB7B6'
  'ak-cases.js'                                 = '1E8C59C01595A26B1CD8EB1BEA38F971D135AB37C2BDEA0F102C20C0B46A0160'
  'ak-99-close.js'                              = 'DAAB14FEC295A2B4C5156D2E99DB7C83A8335F2660F23F4BD6D2D8140AAFAF0A'
  'ak-run.js'                                   = 'FD819B2565317F5D45197F6144382BD89B6DB3A25349A389A88BCC76FBF15251'
  '..\..\office-delivery-r01\scripts\ow-lib.js' = '612D20D1439DCAFEEB2C86AC867988133F26AE900D95F102571240D3A12F988A'
}

# K-GO
if ($GoRef -notmatch '^OWNER-GO-OFFICE-AK-\d{8}-R\d{2}$') { Stop-Gate 'K-GO' "GoRef bicimi gecersiz ('$GoRef'; beklenen OWNER-GO-OFFICE-AK-YYYYMMDD-Rnn)" }
if ($Recover -and ($Recover -cnotmatch '^[0-9a-f]{8}$')) { Stop-Gate 'K-GO' "Recover runId 8 kucuk hex olmali ('$Recover')" }
if ($Recover -and $PreflightOnly) { Stop-Gate 'K-GO' '-Recover ve -PreflightOnly birlikte verilemez' }
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { Stop-Gate 'K-GO' "'node' PATH'te yok" }
$nodeVersion = (& node --version)

# K-ARC
foreach ($k in $TOOL_PINS.Keys) {
  $f = Join-Path $here $k
  if (-not (Test-Path -LiteralPath $f)) { Stop-Gate 'K-ARC' "arac yok: $k" }
  $h = (Get-FileHash -Algorithm SHA256 -LiteralPath $f).Hash
  if ($h -ne $TOOL_PINS[$k]) { Stop-Gate 'K-ARC' "arac SHA uyusmuyor: $k ($h)" }
}

# K-ENV (1): baslaticidaki EnvFile yolu
if (-not (Test-Path -LiteralPath $Launcher)) { Stop-Gate 'K-ENV' "baslatici yok: $Launcher" }
$src = Get-Content -Raw -LiteralPath $Launcher
$em = [regex]::Match($src, "EnvFile\s*=\s*'([^']+)'")
if (-not $em.Success) { $em = [regex]::Match($src, 'EnvFile\s*=\s*"([^"]+)"') }
if (-not $em.Success) { Stop-Gate 'K-ENV' "EnvFile satiri $Launcher icinde yok" }
$envFile = $em.Groups[1].Value

$apiPid = '-'
if (-not $Recover) {
  # K-API
  $lst = Get-NetTCPConnection -State Listen -LocalPort 8080 -ErrorAction SilentlyContinue | Select-Object -First 1
  if (-not $lst) { Stop-Gate 'K-API' '8080 dinleyicisi yok' }
  $apiPid = $lst.OwningProcess
  $cmd = [string](Get-CimInstance Win32_Process -Filter ("ProcessId=" + $apiPid)).CommandLine
  $m = [regex]::Match($cmd, '(?i)([A-Z]:\\[^"]*?\\HY_W4_RELEASE22)\\project\\apps\\api\\dist\\apps\\api\\src\\main\.js')
  if (-not $m.Success) { Stop-Gate 'K-API' "8080 sureci RELEASE22 dist'i degil (pid $apiPid)" }
  $apiDir = Join-Path $m.Groups[1].Value 'project\apps\api'
  # K-BLD
  foreach ($k in $BUILD_PINS.Keys) {
    $f = Join-Path (Join-Path $apiDir 'dist\apps\api\src') $k
    if (-not (Test-Path -LiteralPath $f)) { Stop-Gate 'K-BLD' "derleme dosyasi yok: $k" }
    $h = (Get-FileHash -Algorithm SHA256 -LiteralPath $f).Hash
    if ($h -ne $BUILD_PINS[$k]) { Stop-Gate 'K-BLD' "canli derleme provadaki derleme degil: $k ($h)" }
  }
  # K-ENV (2): EnvFile KOSAN surumun .env'i olmali
  $wantEnv = Join-Path $apiDir '.env'
  if ($envFile.ToLowerInvariant() -ne $wantEnv.ToLowerInvariant()) { Stop-Gate 'K-ENV' "EnvFile kosan surumun .env'i degil ($envFile <> $wantEnv)" }
} else {
  # Kurtarma: surum ne olursa olsun baslaticinin EnvFile'i ve onun agacindaki Prisma istemcisi
  if ($envFile -notmatch '(?i)\\project\\apps\\api\\\.env$') { Stop-Gate 'K-ENV' "EnvFile beklenen bicimde degil ($envFile)" }
  $apiDir = Split-Path -Parent $envFile
}
if (-not (Test-Path -LiteralPath (Join-Path $apiDir 'node_modules\@prisma\client'))) { Stop-Gate 'K-ENV' "Prisma istemcisi yok: $apiDir" }

# K-ENV (3): DATABASE_URL surec icinde okunur, basilmaz
$dbLine = Select-String -LiteralPath $envFile -Pattern '^\s*DATABASE_URL\s*=' | Select-Object -First 1
if (-not $dbLine) { Stop-Gate 'K-ENV' 'DATABASE_URL satiri yok' }
$dbUrl = ($dbLine.Line -replace '^\s*DATABASE_URL\s*=\s*', '').Trim().Trim('"').Trim("'")
$dbLine = $null
$u = [Uri]$dbUrl
$dbId = "$($u.Host):$($u.Port)$($u.AbsolutePath)"
if (-not ((@('127.0.0.1', 'localhost') -contains $u.Host) -and $u.Port -eq 5432 -and $u.AbsolutePath -eq '/hukuk_db')) { $dbUrl = $null; Stop-Gate 'K-ENV' "hedef DB beklenen degil ($dbId)" }

Write-Host "[AK] GO ref      : $GoRef"
Write-Host "[AK] API agaci   : $apiDir  (8080 pid $apiPid)"
if (-not $Recover) { Write-Host "[AK] derleme     : lawyer.service + F01 guard provadaki SHA ile ESIT" }
Write-Host "[AK] araclar     : $($TOOL_PINS.Count)/$($TOOL_PINS.Count) SHA ESIT"
Write-Host "[AK] hedef DB    : $dbId  (parola BASILMAZ)"
Write-Host "[AK] node        : $nodeVersion"
if ($PreflightOnly) {
  $dbUrl = $null
  Write-Host ''
  Write-Host 'ON KONTROL TAMAM - hicbir yazma yapilmadi (PreflightOnly).' -ForegroundColor Green
  exit 0
}

New-Item -ItemType Directory -Force -Path $EvidenceDir | Out-Null
foreach ($n in 'AK_ABORT_AFTER', 'AK_SKIP_CLOSE', 'AK_RUN_ID') { [Environment]::SetEnvironmentVariable($n, $null, 'Process') }
$env:AK_ENVIRONMENT = 'live'
$env:AK_CONFIRM_LIVE = 'YES-LIVE-OFFICE-ACCEPTANCE-AK2-AK1A'
$env:AK_OWNER_GO_REF = $GoRef
$env:AK_API_BASE_URL = 'http://127.0.0.1:8080/api'
$env:AK_DATABASE_URL = $dbUrl
$dbUrl = $null
$env:AK_PRISMA_ROOT = Join-Path $apiDir 'node_modules\@prisma\client'
$env:AK_BCRYPT_PATH = Join-Path $apiDir 'node_modules\bcrypt'

if ($Recover) {
  Write-Host "[AK] KURTARMA    : runId $Recover (yalniz off-ak-$Recover erisimi kapatilir)"
  $env:AK_RUN_ID = $Recover
  & node (Join-Path $here 'ak-99-close.js')
  $code = $LASTEXITCODE
  [Environment]::SetEnvironmentVariable('AK_DATABASE_URL', $null, 'Process')
  if ($code -eq 0) { Write-Host 'KAPATMA DOGRULANDI.' -ForegroundColor Green } else { Write-Host "KAPATMA DOGRULANAMADI (exit $code) - tekrar kosmak guvenlidir." -ForegroundColor Yellow }
  exit $code
}

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$resultFile = Join-Path $EvidenceDir "ak-live-result-$stamp.json"
$env:AK_RESULT_FILE = $resultFile
$env:AK_STATE_FILE = Join-Path $EvidenceDir "ak-live-state-$stamp.json"
Write-Host "[AK] sonuc       : $resultFile"
Write-Host ''
& node (Join-Path $here 'ak-run.js')
$code = $LASTEXITCODE
[Environment]::SetEnvironmentVariable('AK_DATABASE_URL', $null, 'Process')

Write-Host ''
if (Test-Path -LiteralPath $resultFile) {
  $r = Get-Content -Raw -LiteralPath $resultFile | ConvertFrom-Json
  Write-Host "[AK] runId       : $($r.runId)"
  Write-Host "[AK] sonuc SHA256: $((Get-FileHash -Algorithm SHA256 -LiteralPath $resultFile).Hash)"
  if ($code -ne 0 -and $code -ne 4) {
    Write-Host 'Kosum yarida kaldiysa veya kapanis dogrulanmadiysa (exit 3) KURTARMA (tekrar guvenli):' -ForegroundColor Yellow
    Write-Host "  powershell -NoProfile -ExecutionPolicy Bypass -File `"$($MyInvocation.MyCommand.Path)`" -GoRef $GoRef -Recover $($r.runId)"
  }
}
Write-Host "CIKIS=$code  (0 PASS | 1 FAIL | 2 OLCULEMEDI/kosum hatasi | 3 KAPANIS DOGRULANAMADI | 4 G-0, yazma yok)"
exit $code
