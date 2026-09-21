param(
  [Parameter(Mandatory = $true)][string]$BackupApiDir,
  [Parameter(Mandatory = $true)][string]$BackupWebDir,
  [switch]$SelfTest)
$ErrorActionPreference = 'Stop'
# =============================================================================
# R26 GERI ALMA (R26 -> R25B, API + WEB BIRLIKTE) - OWNER ELEVATED KOSUM. Saf ASCII.
# -BackupApiDir = r26-release.ps1'in yazdigi rollback-api-src-R25B-<ts>
# -BackupWebDir = r26-release.ps1'in yazdigi rollback-web-R25B-<ts> (icinde .next + next.config.js)
# Yedeklerin kimligi (API 1524EDC1 + paket 9F58C985 ; WEB .next F064DC95 + BUILD_ID dOiGPj2M + cfg 4AD4915C)
# dogrulanmadan GERI ALMA BASLAMAZ. migrate/DB/launcher/.env DOKUNULMAZ. Baslatici uclusu P1-ONCESI ya da P1-SONRASI
# olmali (R26 geri almasi P1'den SONRA da gecerli; P1'in kendi geri almasi yalniz host/launcher ciftini dondurur). SILME YOK: mevcut .next yeniden adlandirilir.
# -SelfTest : durdurma/kopyalama/yazma YOK; yalniz yedek kimligi + pinler + yardimcilar.
# =============================================================================
$ROOT      = 'C:\Development\HUKUK_YAZILIMI\HY_W4_RELEASE23'
$LIVE_API  = Join-Path $ROOT 'project\apps\api'
$LIVE      = Join-Path $LIVE_API 'dist\apps\api\src'
$LIVE_WEB  = Join-Path $ROOT 'project\apps\web'
$LIVE_NEXT = Join-Path $LIVE_WEB '.next'
$LIVE_CFG  = Join-Path $LIVE_WEB 'next.config.js'
$EXP_LIVE  = '1524EDC15C636B39507DD9520206E3065E6A353A531D82D4362DFE115FC04D4E'
$EXP_BK_PKG = '9F58C98545056B59963111DE603223F8896C4EEB9E4543898BA7F9C561A2FB2F'
$EXP_WEB_LIVE = 'F064DC95CBCCA6218E8D5E84A89A6472F03AF54994E425E28A02B135956282F1'
$BID_LIVE  = 'dOiGPj2M0Abls0kCibY4r'
$CFG_LIVE  = '4AD4915C0A741AF609CCD241DFE08EF2C76A17E2175E3BD1FB7AE925128EF750'
$FILES = @('modules/portal/portal.service.js', 'modules/portal/portal.service.js.map')
$ENV_PIN   = '7A7228B1143BE2A8406FAF4CA316064EB2E164AE23E160E1353121F64E0EFDDC'
$API_LAUNCHER = 'C:\Ops\hukuk\bin\start-api.ps1'
$WEB_LAUNCHER = 'C:\Ops\hukuk\bin\start-web.ps1'
$HOST_EXE = 'C:\Ops\hukuk\bin\hukuk-task-host.exe'
# BASLATICI UCLUSU (api launcher, host exe, web launcher) - YALNIZ bu iki TANIMLI durum kabul edilir; yarim/baska durum = DUR.
# P1-ONCESI = bugunku canli (R23 postimage). P1-SONRASI = OFFICE A3/P1 teslimi (#2681 ba037026; P1-delivery/R26-HANDOFF.md).
# Uclu yayin/geri alma boyunca DEGISMEMELI (kapsam kapisi). Kanitta hangi uclu olculdugu yazilir.
$LAUNCH_TUPLES = @(
  @{ name = 'P1-ONCESI';  api = 'CC634BBFE0BE8F4F06482EDB30FF1E687D36B08C075665E2EC160EA8082619B3'; host = '691BC146C9123B1625B4AE733EFE615F8AFFB77FB0C95EBFDAE621A6AA171627'; web = 'F39F7A54BC51972B94FD0CF13A08F4E1AB82822A528EDAD58FC8F2318C1F59E0' },
  @{ name = 'P1-SONRASI'; api = 'DDCCD09157E0AAF209AB38316A33815A0298FFACBC9006ED62F35F137F86219C'; host = '27099BDF66C83A44B3061D65AE2DAF24EADB523EE4F464179C2F53BB6C78DEAB'; web = 'F39F7A54BC51972B94FD0CF13A08F4E1AB82822A528EDAD58FC8F2318C1F59E0' })
$API_PORT = 8080; $WEB_PORT = 3002
$API_TASK = 'HukukPlatform-API'; $WEB_TASK = 'HukukPlatform-Web'
$ROUTE = '/api/client-statements/monthly-delivery/run-now'
$PORTAL_GET = '/api/portal/cases'
$ts = (Get-Date).ToUniversalTime().ToString('yyyyMMdd-HHmmss') + 'Z'
$log = New-Object System.Collections.Generic.List[string]
function Say([string]$m) { $line = ((Get-Date).ToUniversalTime().ToString('HH:mm:ss') + 'Z  ' + $m); Write-Host $line; $log.Add($line) }
function Get-R26FileSha256([string]$p) { return (Get-FileHash -Algorithm SHA256 -LiteralPath $p).Hash }
function Get-Map([string]$root, [switch]$Web) {
  $m = [ordered]@{}
  foreach ($f in (Get-ChildItem -LiteralPath $root -Recurse -File -Force)) {
    $rel = ($f.FullName.Substring($root.Length).TrimStart('\', '/')) -replace '\\', '/'
    if ($Web -and ($rel.StartsWith('cache/') -or $rel -ceq 'trace')) { continue }
    $m[$rel] = (Get-FileHash -Algorithm SHA256 -LiteralPath $f.FullName).Hash
  }
  return $m
}
function Get-TreeDigest($map) {
  $sb = New-Object Text.StringBuilder
  $keys = New-Object 'System.Collections.Generic.List[string]'
  foreach ($k in $map.Keys) { $keys.Add([string]$k) }
  $keys.Sort([StringComparer]::Ordinal)
  foreach ($k in $keys) { [void]$sb.Append($k).Append("`0").Append($map[$k]).Append("`n") }
  return [BitConverter]::ToString([Security.Cryptography.SHA256]::Create().ComputeHash([Text.Encoding]::UTF8.GetBytes($sb.ToString()))).Replace('-', '')
}
function Get-Pids([int]$port) { return @((Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue).OwningProcess | Sort-Object -Unique) }
function Wait-Stopped([string]$task, [int]$port, [string]$hostArg, [int]$TimeoutSec = 90) {
  $deadline = (Get-Date).AddSeconds($TimeoutSec)
  while ((Get-Date) -lt $deadline) {
    $listen = @(Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue)
    $procs = @(Get-CimInstance Win32_Process -Filter "Name='hukuk-task-host.exe'" -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -match ('(^|\s)' + $hostArg + '(\s|$)') })
    if ($listen.Count -eq 0 -and $procs.Count -eq 0 -and (Get-ScheduledTask -TaskName $task).State -ne 'Running') { return $true }
    Start-Sleep -Seconds 2
  }
  return $false
}
function Http([string]$method, [string]$url, [int]$timeoutMs = 8000) {
  try {
    $r = [Net.HttpWebRequest]::Create($url); $r.Method = $method; $r.Timeout = $timeoutMs; $r.ReadWriteTimeout = $timeoutMs
    $r.AllowAutoRedirect = $false; $r.UserAgent = 'r26-rollback-check'
    if ($method -eq 'POST') { $r.ContentType = 'application/json'; $b = [Text.Encoding]::UTF8.GetBytes('{}'); $r.ContentLength = $b.Length; $s = $r.GetRequestStream(); $s.Write($b, 0, $b.Length); $s.Dispose() }
    $resp = $r.GetResponse(); $code = [int]$resp.StatusCode; $resp.Dispose(); return $code
  } catch [Net.WebException] {
    if ($_.Exception.Response) { return [int]([Net.HttpWebResponse]$_.Exception.Response).StatusCode }
    return -1
  } catch { return -2 }
}
function Get-LauncherTuple {
  $a = Get-R26FileSha256 $API_LAUNCHER; $h = Get-R26FileSha256 $HOST_EXE; $w = Get-R26FileSha256 $WEB_LAUNCHER
  foreach ($t in $LAUNCH_TUPLES) { if ($a -ceq $t.api -and $h -ceq $t.host -and $w -ceq $t.web) { return $t.name } }
  return ('TANIMSIZ api=' + $a.Substring(0, 8) + ' host=' + $h.Substring(0, 8) + ' web=' + $w.Substring(0, 8))
}
function Get-BuildId([string]$nextDir) { return (Get-Content -Raw -LiteralPath (Join-Path $nextDir 'BUILD_ID')).Trim() }

Say '=== 1) YEDEK BUTUNLUGU'
if (-not (Test-Path -LiteralPath $BackupApiDir) -or -not (Test-Path -LiteralPath $BackupWebDir)) { throw 'KAPI: yedek dizini yok - DUR' }
$bkMap = Get-Map $BackupApiDir; $bkDig = Get-TreeDigest $bkMap
$pm = [ordered]@{}; foreach ($rel in $FILES) { $pm[$rel] = $bkMap[$rel] }
$bkPkg = Get-TreeDigest $pm
$bkNext = Join-Path $BackupWebDir '.next'; $bkCfg = Join-Path $BackupWebDir 'next.config.js'
$bkW = Get-TreeDigest (Get-Map $bkNext -Web)
Say ('API yedek digest esit=' + ($bkDig -ceq $EXP_LIVE) + ' paket esit=' + ($bkPkg -ceq $EXP_BK_PKG) + ' | WEB yedek digest esit=' + ($bkW -ceq $EXP_WEB_LIVE) + ' BUILD_ID=' + (Get-BuildId $bkNext) + ' cfg esit=' + ((Get-R26FileSha256 $bkCfg) -ceq $CFG_LIVE))
$bkOk = ($bkDig -ceq $EXP_LIVE -and $bkPkg -ceq $EXP_BK_PKG -and $bkW -ceq $EXP_WEB_LIVE -and (Get-BuildId $bkNext) -ceq $BID_LIVE -and (Get-R26FileSha256 $bkCfg) -ceq $CFG_LIVE)
$tuple0 = Get-LauncherTuple
$pinOk = -not $tuple0.StartsWith('TANIMSIZ')
Say ('baslatici uclusu=' + $tuple0 + ' | tanimli=' + $pinOk)
if ($SelfTest) {
  $needed = @('Say', 'Get-R26FileSha256', 'Get-Map', 'Get-TreeDigest', 'Get-Pids', 'Wait-Stopped', 'Http', 'Get-LauncherTuple', 'Get-BuildId')
  $missing = @($needed | Where-Object { -not (Get-Command $_ -CommandType Function -ErrorAction SilentlyContinue) })
  Say ('fonksiyon kumesi tam=' + ($missing.Count -eq 0) + ' | robocopy=' + [bool](Get-Command robocopy.exe -ErrorAction SilentlyContinue))
  $st = ($bkOk -and $pinOk -and $missing.Count -eq 0)
  Say ('=== SELFTEST SONUC: ' + $(if ($st) { 'PASS' } else { 'FAIL' }))
  if (-not $st) { exit 1 }
  exit 0
}
if (-not (New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw 'KAPI: yukseltilmis pencere gerekli - DUR' }
if (-not $bkOk) { throw 'KAPI: yedek kimligi dogrulanamadi - GERI ALMA BASLAMAZ' }
if (-not $pinOk) { throw 'KAPI: baslatici/host uclusu tanimli iki durumdan biri degil - DUR' }
if ((Get-R26FileSha256 (Join-Path $LIVE_API '.env')) -cne $ENV_PIN) { throw 'KAPI: canli .env sha pin degil - DUR' }

Say '=== 2) WEB SONRA API DURDUR'
Stop-ScheduledTask -TaskName $WEB_TASK
if (-not (Wait-Stopped $WEB_TASK $WEB_PORT 'web' 90)) { throw 'KAPI: WEB kapanmadi - DOSYALARA DOKUNULMADI, ESCALATE' }
Stop-ScheduledTask -TaskName $API_TASK
if (-not (Wait-Stopped $API_TASK $API_PORT 'api' 90)) { throw 'KAPI: API kapanmadi - DOSYALARA DOKUNULMADI, ESCALATE' }
Say 'WEB ve API kapandi'

Say '=== 3) GERI DONDUR (SILME YOK)'
foreach ($rel in $FILES) {
  $dst = Join-Path $LIVE ($rel -replace '/', '\')
  Copy-Item -LiteralPath (Join-Path $BackupApiDir ($rel -replace '/', '\')) -Destination $dst -Force
  if ((Get-R26FileSha256 $dst) -cne $bkMap[$rel]) { throw ('KAPI: geri donen API dosyasi sha uyusmuyor: ' + $rel) }
}
if (Test-Path -LiteralPath $LIVE_NEXT) { Move-Item -LiteralPath $LIVE_NEXT -Destination (Join-Path $LIVE_WEB ('.next.rollback-from-r26-' + $ts)) }
$global:LASTEXITCODE = 0
& robocopy.exe $bkNext $LIVE_NEXT /E /R:0 /W:0 /NFL /NDL /NJH /NJS | Out-Null
if ($LASTEXITCODE -ge 8) { throw ('KAPI: WEB geri kopyalama robocopy ' + $LASTEXITCODE + ' - BASLATMA, ESCALATE') }
Copy-Item -LiteralPath $bkCfg -Destination $LIVE_CFG -Force

Say '=== 4) DURMUSKEN KIMLIK'
$d = Get-TreeDigest (Get-Map $LIVE); $w = Get-TreeDigest (Get-Map $LIVE_NEXT -Web)
$idOk = ($d -ceq $EXP_LIVE -and $w -ceq $EXP_WEB_LIVE -and (Get-BuildId $LIVE_NEXT) -ceq $BID_LIVE -and (Get-R26FileSha256 $LIVE_CFG) -ceq $CFG_LIVE)
Say ('API taban esit=' + ($d -ceq $EXP_LIVE) + ' | WEB taban esit=' + ($w -ceq $EXP_WEB_LIVE) + ' | BUILD_ID=' + (Get-BuildId $LIVE_NEXT) + ' | cfg taban esit=' + ((Get-R26FileSha256 $LIVE_CFG) -ceq $CFG_LIVE))
if (-not $idOk) { throw 'KAPI: geri alma sonrasi kimlik taban degil - BASLATMA, ESCALATE' }

Say '=== 5) API SONRA WEB BASLAT + SAGLIK'
Start-ScheduledTask -TaskName $API_TASK
$deadline = (Get-Date).AddSeconds(120); $me = -1; $hp = @()
while ((Get-Date) -lt $deadline) { $hp = Get-Pids $API_PORT; if ($hp.Count -ge 1) { $me = Http 'GET' ('http://127.0.0.1:' + $API_PORT + '/api/auth/me'); if ($me -gt 0) { break } }; Start-Sleep -Seconds 3 }
$unauth = Http 'POST' ('http://127.0.0.1:' + $API_PORT + $ROUTE)
$portalUnauth = Http 'GET' ('http://127.0.0.1:' + $API_PORT + $PORTAL_GET)
Start-ScheduledTask -TaskName $WEB_TASK
$deadline = (Get-Date).AddSeconds(180); $pl = -1; $wp = @()
while ((Get-Date) -lt $deadline) { $wp = Get-Pids $WEB_PORT; if ($wp.Count -ge 1) { $pl = Http 'GET' ('http://127.0.0.1:' + $WEB_PORT + '/portal/login'); if ($pl -gt 0) { break } }; Start-Sleep -Seconds 3 }
$bm = Http 'GET' ('http://127.0.0.1:' + $WEB_PORT + '/_next/static/' + $BID_LIVE + '/_buildManifest.js')
Say ('API pid=' + ($hp -join ',') + ' /api/auth/me=' + $me + ' run-now=' + $unauth + ' portal/cases=' + $portalUnauth + ' | WEB pid=' + ($wp -join ',') + ' /portal/login=' + $pl + ' buildManifest(' + $BID_LIVE + ')=' + $bm)
$tuple1 = Get-LauncherTuple
Say ('baslatici uclusu degismedi=' + ($tuple1 -ceq $tuple0) + ' (' + $tuple1 + ')')
$ok = ($hp.Count -eq 1 -and $me -eq 401 -and $unauth -eq 401 -and $portalUnauth -eq 401 -and $wp.Count -eq 1 -and $pl -eq 200 -and $bm -eq 200 -and $idOk -and $tuple1 -ceq $tuple0)
Say ('=== SONUC: ' + $(if ($ok) { 'ROLLBACK PASS' } else { 'ROLLBACK DOGRULANAMADI' }))
$evid = [ordered]@{ record = 'R26-ROLLBACK-EXECUTION'; tsUtc = $ts; launcherTuple = $tuple0; backupApiDir = $BackupApiDir; backupWebDir = $BackupWebDir; apiDigest = $d; webDigest = $w; verdict = $(if ($ok) { 'ROLLBACK PASS' } else { 'ROLLBACK DOGRULANAMADI' }); log = @($log) }
$f = Join-Path 'D:\Development\HUKUK_YAZILIMI\HY_R26_RELEASE_EVIDENCE' ('R26-ROLLBACK-' + $ts + '.json')
New-Item -ItemType Directory -Force -Path (Split-Path $f) | Out-Null
[IO.File]::WriteAllText($f, ($evid | ConvertTo-Json -Depth 6), (New-Object Text.UTF8Encoding($false)))
Write-Output ('KANIT: ' + $f + ' sha256=' + (Get-R26FileSha256 $f))
if (-not $ok) { exit 1 }
