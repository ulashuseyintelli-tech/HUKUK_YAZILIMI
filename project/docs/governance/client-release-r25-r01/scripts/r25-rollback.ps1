param([Parameter(Mandatory = $true)][string]$BackupDir)
$ErrorActionPreference = 'Stop'
# =============================================================================
# R25 GERI ALMA (R25 -> R24) - OWNER ELEVATED KOSUM. Saf ASCII.
# Yedek tam agac digest 87712E0E... (R24) VE 10-dosya paket digest FFC15B32... dogrulanmadan GERI ALMA BASLAMAZ.
# migrate/DB/launcher/.env DOKUNULMAZ. -BackupDir = r25-release.ps1'in yazdigi rollback-dist-src-R24-<ts> dizini.
# =============================================================================
$LIVE_API = 'C:\Development\HUKUK_YAZILIMI\HY_W4_RELEASE23\project\apps\api'
$LIVE     = Join-Path $LIVE_API 'dist\apps\api\src'
$EXP_LIVE = '87712E0ED2CF71EE8268D81865C2388E030F52AF9AC7E29C56617AEDD0845453'
$EXP_BK_PKG = 'FFC15B32AA01CEFC7BB2FE09915A9BEF6EC3AC00149C8597DBEB7EEFAF4E5BC7'
$PORTAL_GET = '/api/portal/cases'
$ENV_PIN  = '7A7228B1143BE2A8406FAF4CA316064EB2E164AE23E160E1353121F64E0EFDDC'
$LAUNCHER = 'C:\Ops\hukuk\bin\start-api.ps1'
$LAUNCH_PIN = 'CC634BBFE0BE8F4F06482EDB30FF1E687D36B08C075665E2EC160EA8082619B3'
$PORT = 8080
$TASK = 'HukukPlatform-API'
$ROUTE = '/api/client-statements/monthly-delivery/run-now'
$FILES = @(
  'modules/portal/portal-auth.guard.js',
  'modules/portal/portal-auth.guard.js.map',
  'modules/portal/portal.controller.js',
  'modules/portal/portal.controller.js.map',
  'modules/portal/portal.service.d.ts',
  'modules/portal/portal.service.js',
  'modules/portal/portal.service.js.map',
  'modules/summary-engine/allocation-representative-replay-adapter.d.ts',
  'modules/summary-engine/allocation-representative-replay-adapter.js',
  'modules/summary-engine/allocation-representative-replay-adapter.js.map')
$log = New-Object System.Collections.Generic.List[string]
function Say([string]$m) { $line = ((Get-Date).ToUniversalTime().ToString('HH:mm:ss') + 'Z  ' + $m); Write-Host $line; $log.Add($line) }
function Get-R25FileSha256([string]$p) { return (Get-FileHash -Algorithm SHA256 -LiteralPath $p).Hash }
function Get-Map([string]$root) {
  $m = [ordered]@{}
  foreach ($f in (Get-ChildItem -LiteralPath $root -Recurse -File -Force)) {
    $rel = ($f.FullName.Substring($root.Length).TrimStart('\', '/')) -replace '\\', '/'
    $m[$rel] = (Get-FileHash -Algorithm SHA256 -LiteralPath $f.FullName).Hash
  }
  return $m
}
function Get-TreeDigest($map) {
  $sb = New-Object Text.StringBuilder
  # ORDINAL siralama .NET StringComparer ile (kabuk/kultur bagimsiz; PS 5.1 ve pwsh 7 ayni digest).
  $keys = New-Object 'System.Collections.Generic.List[string]'
  foreach ($k in $map.Keys) { $keys.Add([string]$k) }
  $keys.Sort([StringComparer]::Ordinal)
  foreach ($k in $keys) { [void]$sb.Append($k).Append("`0").Append($map[$k]).Append("`n") }
  return [BitConverter]::ToString([Security.Cryptography.SHA256]::Create().ComputeHash([Text.Encoding]::UTF8.GetBytes($sb.ToString()))).Replace('-', '')
}
function Get-ApiPids { return @((Get-NetTCPConnection -State Listen -LocalPort $PORT -ErrorAction SilentlyContinue).OwningProcess | Sort-Object -Unique) }
function Wait-ApiStopped([int]$TimeoutSec = 90) {
  $deadline = (Get-Date).AddSeconds($TimeoutSec)
  while ((Get-Date) -lt $deadline) {
    $listen = @(Get-NetTCPConnection -State Listen -LocalPort $PORT -ErrorAction SilentlyContinue)
    $procs = @(Get-CimInstance Win32_Process -Filter "Name='hukuk-task-host.exe'" -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -match '(^|\s)api(\s|$)' })
    $state = (Get-ScheduledTask -TaskName $TASK).State
    if ($listen.Count -eq 0 -and $procs.Count -eq 0 -and $state -ne 'Running') { return $true }
    Start-Sleep -Seconds 2
  }
  return $false
}
function Http([string]$method, [string]$url, [int]$timeoutMs = 8000) {
  try {
    $r = [Net.HttpWebRequest]::Create($url); $r.Method = $method; $r.Timeout = $timeoutMs; $r.ReadWriteTimeout = $timeoutMs
    $r.AllowAutoRedirect = $false; $r.UserAgent = 'r25-rollback-check'
    if ($method -eq 'POST') { $r.ContentType = 'application/json'; $b = [Text.Encoding]::UTF8.GetBytes('{}'); $r.ContentLength = $b.Length; $s = $r.GetRequestStream(); $s.Write($b, 0, $b.Length); $s.Dispose() }
    $resp = $r.GetResponse(); $code = [int]$resp.StatusCode; $resp.Dispose(); return $code
  } catch [Net.WebException] {
    if ($_.Exception.Response) { return [int]([Net.HttpWebResponse]$_.Exception.Response).StatusCode }
    return -1
  } catch { return -2 }
}
Say '=== 1) YEDEK BUTUNLUGU'
if (-not (New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw 'KAPI: yukseltilmis pencere gerekli - DUR' }
if (-not (Test-Path -LiteralPath $BackupDir)) { throw 'KAPI: yedek dizini yok - DUR' }
$bkMap = Get-Map $BackupDir; $bkDig = Get-TreeDigest $bkMap
Say ('yedek dosya=' + $bkMap.Count + ' digest=' + $bkDig + ' | taban esit=' + ($bkDig -ceq $EXP_LIVE))
if ($bkDig -cne $EXP_LIVE) { throw 'KAPI: yedek bozuk - GERI ALMA BASLAMAZ' }
$pm = [ordered]@{}; foreach ($rel in $FILES) { $pm[$rel] = $bkMap[$rel] }
$bkPkg = Get-TreeDigest $pm
Say ('yedek paket digest (10 dosya)=' + $bkPkg + ' | pin esit=' + ($bkPkg -ceq $EXP_BK_PKG))
if ($bkPkg -cne $EXP_BK_PKG) { throw 'KAPI: yedek paket digest pin degil - GERI ALMA BASLAMAZ' }
if ((Get-R25FileSha256 $LAUNCHER) -cne $LAUNCH_PIN) { throw 'KAPI: pinli launcher farkli - DUR' }
if ((Get-R25FileSha256 (Join-Path $LIVE_API '.env')) -cne $ENV_PIN) { throw 'KAPI: canli .env sha pin degil - DUR' }
Say '=== 2) DURDUR + KAPANDIGINI DOGRULA'
Stop-ScheduledTask -TaskName $TASK
if (-not (Wait-ApiStopped 90)) { throw 'KAPI: API kapanmadi - DOSYALARA DOKUNULMAZ, ESCALATE' }
Say 'API kapandi'
Say '=== 3) 10 DOSYAYI GERI DONDUR'
foreach ($rel in $FILES) {
  $src = Join-Path $BackupDir ($rel -replace '/', '\'); $dst = Join-Path $LIVE ($rel -replace '/', '\')
  Copy-Item -LiteralPath $src -Destination $dst -Force
  if ((Get-R25FileSha256 $dst) -cne $bkMap[$rel]) { throw ('KAPI: geri donen dosya sha uyusmuyor: ' + $rel) }
}
Say '=== 4) TAM AGAC DIGEST (durmusken)'
$d = Get-TreeDigest (Get-Map $LIVE)
Say ('canli digest=' + $d + ' | taban esit=' + ($d -ceq $EXP_LIVE))
if ($d -cne $EXP_LIVE) { throw 'KAPI: geri alma sonrasi digest taban degil - BASLATMA, ESCALATE' }
Say '=== 5) BASLAT + SURELI SAGLIK'
Start-ScheduledTask -TaskName $TASK
$deadline = (Get-Date).AddSeconds(120); $me = -1; $hpids = @()
while ((Get-Date) -lt $deadline) {
  $hpids = Get-ApiPids
  if ($hpids.Count -ge 1) { $me = Http 'GET' ('http://127.0.0.1:' + $PORT + '/api/auth/me'); if ($me -gt 0) { break } }
  Start-Sleep -Seconds 3
}
$unauth = Http 'POST' ('http://127.0.0.1:' + $PORT + $ROUTE)
$portalUnauth = Http 'GET' ('http://127.0.0.1:' + $PORT + $PORTAL_GET)
Say ('saglik: pid=' + ($hpids -join ',') + ' | /api/auth/me=' + $me + ' | POST run-now=' + $unauth + ' (401 beklenir: R24 ucu) | GET portal/cases=' + $portalUnauth + ' (401 beklenir)')
$ok = ($hpids.Count -eq 1 -and $me -eq 401 -and $unauth -eq 401 -and $portalUnauth -eq 401 -and $d -ceq $EXP_LIVE)
Say ('=== SONUC: ' + $(if ($ok) { 'ROLLBACK PASS' } else { 'ROLLBACK DOGRULANAMADI' }))
$evid = [ordered]@{ record = 'R25-ROLLBACK-EXECUTION'; tsUtc = (Get-Date).ToUniversalTime().ToString('o'); backupDir = $BackupDir; liveDigest = $d; healthMe = $me; routeUnauth = $unauth; portalUnauth = $portalUnauth; verdict = $(if ($ok) { 'ROLLBACK PASS' } else { 'ROLLBACK DOGRULANAMADI' }); log = @($log) }
$f = Join-Path 'D:\Development\HUKUK_YAZILIMI\HY_R25_RELEASE_EVIDENCE' ('R25-ROLLBACK-' + (Get-Date).ToUniversalTime().ToString('yyyyMMdd-HHmmss') + 'Z.json')
[IO.File]::WriteAllText($f, ($evid | ConvertTo-Json -Depth 6), (New-Object Text.UTF8Encoding($false)))
Write-Output ('KANIT: ' + $f + ' sha256=' + (Get-R25FileSha256 $f))
if (-not $ok) { exit 1 }
