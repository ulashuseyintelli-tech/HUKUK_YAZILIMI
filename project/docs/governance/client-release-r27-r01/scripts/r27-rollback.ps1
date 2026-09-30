param(
  [Parameter(Mandatory = $true)][string]$BackupApiDir,
  [Parameter(Mandatory = $true)][string]$BackupWebDir,
  [switch]$SelfTest,
  [string]$TestRoot = '')
$ErrorActionPreference = 'Stop'
# =============================================================================
# R27 GERI ALMA (R27 -> R26, API + WEB BIRLIKTE) (r26-rollback.ps1'den turetildi) - OWNER ELEVATED KOSUM. Saf ASCII.
# -BackupApiDir = r27-release.ps1'in yazdigi rollback-api-src-R26-<ts>
# -BackupWebDir = r27-release.ps1'in yazdigi rollback-web-R26-<ts> (icinde .next + next.config.js)
# EKLENEN 6 API dosyasi (dto + trust-proxy yardimcisi) yedekte YOKTUR; geri almada karantinaya tasinir (silme yok).
# Yedeklerin kimligi (API A8B17A38 + paket B7FE81DB ; WEB .next C17E7B13 + BUILD_ID 5waeMoFG + cfg C43DEB5A)
# dogrulanmadan GERI ALMA BASLAMAZ. migrate/DB/launcher/.env DOKUNULMAZ. Baslatici uclusu P1-ONCESI ya da P1-SONRASI
# olmali (R26 geri almasi P1'den SONRA da gecerli; P1'in kendi geri almasi yalniz host/launcher ciftini dondurur). SILME YOK: mevcut .next yeniden adlandirilir.
# -SelfTest : durdurma/kopyalama/yazma YOK; yalniz yedek kimligi + pinler + yardimcilar.
# -----------------------------------------------------------------------------
# ASAMALAR ($script:STAGE; kanit JSON'unda stage/failedAt/stages):
#   0-kapilar | 1-yedek-butunluk | 2-durdur-web | 2-durdur-api | 3-geri-yukle-api | 3-geri-yukle-web | 4-kimlik | 5-baslat-api
#   5-baslat-web | 6-kapsam | 7-kanit
# GERI YUKLENEN KIMLIK (4-kimlik) DOGRULANMADAN SERVIS BASLATILMAZ: API agac == EXP_LIVE, 16 dosyalik paket == EXP_BK_PKG,
#   eklenen 6 dosya YOK/karantinada, WEB .next == EXP_WEB_LIVE, BUILD_ID == BID_LIVE, cfg == CFG_LIVE.
# Kanit yazimi finally icinde ve korumali (EVID_DIR yazilamazsa %TEMP% fallback + konsol). Yedek butunluk olcumu de korumalidir:
#   yedek dizini yok/okunamiyor -> SelfTest 1, gercek kosumda 1-yedek-butunluk KAPI 20 + kanit JSON (kanitsiz cikis yok).
# CIKIS KODLARI:
#    0  ROLLBACK PASS              geri alindi + kimlik dogrulandi + eski servisler ayakta + kapsam (uclu) degismedi
#   11  ROLLBACK-DOGRULANAMADI     dosyalar geri yuklendi ama kimlik dogrulanamadi -> servis BASLATILMADI (uyusmayanlar kanitta; ESCALATE)
#   12  ROLLBACK-ENGELLENDI        geri yukleme sirasinda dosya islemi basarisiz -> kalan adimlar kanitta; servis BASLATILMADI (ESCALATE)
#   13  ROLLBACK-OK-ESKI-BASLAMADI dogrulandi ama eski servisler gelmedi ya da kapsam tutmadi (ESCALATE)
#   20  KAPIDA-DURDU               kapi (yetki/yedek kimligi/uclu/.env) - canli dosyalara DOKUNULMADI; servisler durdurulmadi
#   21  DURDURMA-BASARISIZ         WEB/API kapanmadi - canli dosyalara DOKUNULMADI (ESCALATE)
#    1  SelfTest FAIL (yalniz -SelfTest)
# IZOLE TEST MODU: -TestRoot <dizin>: canli yollar TestRoot\live\... altina baglanir, gorev/dinleyici/Http/uclu simulatorle
#   (TestRoot\sim\state.json) degistirilir; kanit TestRoot\evidence. TestRoot canli kokun altinda/esit ise DUR (20).
# =============================================================================
$LIVE_ROOT_CANON = 'C:\Development\HUKUK_YAZILIMI\HY_W4_RELEASE23'
$TEST = ($TestRoot -ne '')
if ($TEST) {
  $TestRoot = [IO.Path]::GetFullPath($TestRoot).TrimEnd('\')
  $canon = $LIVE_ROOT_CANON.TrimEnd('\')
  if ($TestRoot.Equals($canon, [StringComparison]::OrdinalIgnoreCase) -or $TestRoot.StartsWith($canon + '\', [StringComparison]::OrdinalIgnoreCase)) { Write-Host 'KAPI: TestRoot canli kokun altinda ya da ona esit - DUR'; exit 20 }
  if (-not (Test-Path -LiteralPath $TestRoot -PathType Container)) { Write-Host ('KAPI: TestRoot yok: ' + $TestRoot + ' - DUR'); exit 20 }
}
$ROOT      = $(if ($TEST) { Join-Path $TestRoot 'live' } else { $LIVE_ROOT_CANON })
$LIVE_API  = $(if ($TEST) { Join-Path $ROOT 'api' } else { Join-Path $ROOT 'project\apps\api' })
$LIVE      = Join-Path $LIVE_API 'dist\apps\api\src'
$LIVE_WEB  = $(if ($TEST) { Join-Path $ROOT 'web' } else { Join-Path $ROOT 'project\apps\web' })
$LIVE_NEXT = Join-Path $LIVE_WEB '.next'
$LIVE_CFG  = Join-Path $LIVE_WEB 'next.config.js'
$EXP_LIVE  = 'A8B17A38327975C71DDAE82FE33D1E97CB8B339FB1E35D1828FCF8D0CEB053A0'
$EXP_BK_PKG = 'B7FE81DBF83A4F20327667C5610C0E956CEB2D489357782E08D7A5647CBFA59E'   # eklenen 6 dosya yedekte YOK -> '-'
$EXP_WEB_LIVE = 'C17E7B132FB7DED65AD0788024AA478F0949AF0D5D9045E8F47779A31A615326'
$BID_LIVE  = '5waeMoFGGMTLAYmn9oJvW'
$CFG_LIVE  = 'C43DEB5A04F1529CE2D368204ED7D10B8DBC257327E0BC64A01F1D7CF3AC5B5C'
$FILES = @('common/trust-proxy.config.d.ts', 'common/trust-proxy.config.js', 'common/trust-proxy.config.js.map', 'modules/auth/guards/credential-recovery-rate-limit.guard.js', 'modules/auth/guards/credential-recovery-rate-limit.guard.js.map', 'modules/auth/guards/login-rate-limit.guard.d.ts', 'modules/auth/guards/login-rate-limit.guard.js', 'modules/auth/guards/login-rate-limit.guard.js.map', 'modules/portal/dto/portal-password.dto.d.ts', 'modules/portal/dto/portal-password.dto.js', 'modules/portal/dto/portal-password.dto.js.map', 'modules/portal/portal.controller.d.ts', 'modules/portal/portal.controller.js', 'modules/portal/portal.controller.js.map', 'modules/portal/portal.service.js', 'modules/portal/portal.service.js.map')
$ADDED = @('common/trust-proxy.config.d.ts', 'common/trust-proxy.config.js', 'common/trust-proxy.config.js.map', 'modules/portal/dto/portal-password.dto.d.ts', 'modules/portal/dto/portal-password.dto.js', 'modules/portal/dto/portal-password.dto.js.map')
$ENV_PIN_LIVE = '5C776BBEEE018EA5CC8192378D42D742FD4ABC1B6D0E9A3EA671CF463206908D'
$ENV_PIN_TEST = '7CAD142A7AD9BA03F9EDB873DACFE881B7783AFFA4F9D1FEC13CB0673C5C066B'   # sahte .env: "R27_TESTROOT_FAKE_ENV=1\n"
$ENV_PIN   = $(if ($TEST) { $ENV_PIN_TEST } else { $ENV_PIN_LIVE })
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
$SIM_STATE = $(if ($TEST) { Join-Path $TestRoot 'sim\state.json' } else { '' })
$ts = (Get-Date).ToUniversalTime().ToString('yyyyMMdd-HHmmss') + 'Z'
$EVID_DIR = $(if ($TEST) { Join-Path $TestRoot 'evidence' } else { 'D:\Development\HUKUK_YAZILIMI\HY_R27_RELEASE_EVIDENCE' })
$QUAR = Join-Path $EVID_DIR ('added-quarantine-rollback-' + $ts)
$FAILED_NEXT = Join-Path $LIVE_WEB ('.next.rollback-from-r27-' + $ts)
$log = New-Object System.Collections.Generic.List[string]
$script:STAGE = 'init'; $script:FAILED_AT = $null; $script:ERR = $null; $script:VERDICT = 'BELIRSIZ'; $script:EXIT = 1
$script:STAGES = New-Object System.Collections.Generic.List[string]
$script:SERVICES_STOPPED = $false; $script:RESTORE_STEPS = $null; $script:VERIFY = $null; $script:RECOVERY = $null; $script:health = [ordered]@{}
$script:tuple0 = ''; $script:bkMap = $null
function Say([string]$m) { $line = ((Get-Date).ToUniversalTime().ToString('HH:mm:ss') + 'Z  ' + $m); Write-Host $line; $log.Add($line) }
function Set-Stage([string]$s) { $script:STAGE = $s; $script:STAGES.Add(((Get-Date).ToUniversalTime().ToString('HH:mm:ss') + 'Z ' + $s)); Say ('=== ASAMA ' + $s) }
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
function Get-PackageDigest([string]$root) {
  $m = [ordered]@{}
  foreach ($rel in $FILES) { $p = Join-Path $root ($rel -replace '/', '\'); $m[$rel] = $(if (Test-Path -LiteralPath $p -PathType Leaf) { Get-R26FileSha256 $p } else { '-' }) }
  return Get-TreeDigest $m
}
function Get-BuildId([string]$nextDir) { return (Get-Content -Raw -LiteralPath (Join-Path $nextDir 'BUILD_ID')).Trim() }
# ---------------------------------------------------------------- SIMULATOR (yalniz TestRoot) + SARMALAYICILAR
function Get-SimState { return (Get-Content -Raw -LiteralPath $SIM_STATE | ConvertFrom-Json) }
function Set-SimState($s) { [IO.File]::WriteAllText($SIM_STATE, ($s | ConvertTo-Json -Depth 5), (New-Object Text.UTF8Encoding($false))) }
function Add-SimEvent($s, [string]$m) { $s.eventLog = ([string]$s.eventLog + ((Get-Date).ToUniversalTime().ToString('HH:mm:ss') + 'Z ' + $m) + "`n") }
function Test-Elevated {
  if ($TEST) { return $true }
  return (New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}
function Get-TaskState([string]$task) {
  if ($TEST) { $s = Get-SimState; $r = $(if ($task -eq $API_TASK) { [bool]$s.apiRunning } else { [bool]$s.webRunning }); if ($r) { return 'Running' } else { return 'Ready' } }
  return [string](Get-ScheduledTask -TaskName $task).State
}
# Test-EmptyQueryError: r27-release.ps1 ile AYNI tanim (R03). Get-NetTCPConnection 'eslesme yok' = ObjectNotFound + FQID 'CmdletizationQuery_NotFound*'
#   = BASARILI BOS sonuc; baska her hata OKUMA HATASIDIR ve firlatilir (durdurma dogrulanmaz -> dosyaya dokunulmaz).
function Test-EmptyQueryError($er) {
  if ($null -eq $er -or $null -eq $er.CategoryInfo) { return $false }
  return ($er.CategoryInfo.Category -eq [System.Management.Automation.ErrorCategory]::ObjectNotFound -and ([string]$er.FullyQualifiedErrorId) -like 'CmdletizationQuery_NotFound*')
}
function Get-Pids([int]$port) {
  if ($TEST) { $s = Get-SimState; if ($port -eq $API_PORT) { if ([bool]$s.apiRunning) { return @([int]$s.apiPid) } else { return @() } } else { if ([bool]$s.webRunning) { return @([int]$s.webPid) } else { return @() } } }
  $c = @()
  try { $c = @(Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction Stop) }
  catch { if (-not (Test-EmptyQueryError $_)) { throw }; $c = @() }
  return @($c | ForEach-Object { $_.OwningProcess } | Sort-Object -Unique)
}
function Invoke-StopTask([string]$task) {
  if ($TEST) { $s = Get-SimState; $s.stopCalls = [int]$s.stopCalls + 1; if ($task -eq $API_TASK) { $s.apiRunning = $false } else { $s.webRunning = $false }; Add-SimEvent $s ('stop ' + $task + ' (rollback)'); Set-SimState $s; return }
  Stop-ScheduledTask -TaskName $task
}
function Invoke-StartTask([string]$task) {
  if ($TEST) { $s = Get-SimState; $s.startCalls = [int]$s.startCalls + 1; if ($task -eq $API_TASK) { $s.apiRunning = $true } else { $s.webRunning = $true }; Add-SimEvent $s ('start ' + $task + ' (rollback) -> running'); Set-SimState $s; return }
  Start-ScheduledTask -TaskName $task
}
function Wait-Stopped([string]$task, [int]$port, [string]$hostArg, [int]$TimeoutSec = 90) {
  if ($TEST) { return ((Get-Pids $port).Count -eq 0 -and (Get-TaskState $task) -ne 'Running') }
  $deadline = (Get-Date).AddSeconds($TimeoutSec)
  while ((Get-Date) -lt $deadline) {
    # R03: okuma hatasi 'kapandi' SAYILMAZ - Get-Pids yalniz 'eslesme yok'u bos sayar, CIM hatasi firlatilir -> 2-durdur-* HATA -> 21 (dosyaya dokunulmaz)
    $listen = @(Get-Pids $port)
    $procs = @(Get-CimInstance Win32_Process -Filter "Name='hukuk-task-host.exe'" -ErrorAction Stop | Where-Object { $_.CommandLine -match ('(^|\s)' + $hostArg + '(\s|$)') })
    if ($listen.Count -eq 0 -and $procs.Count -eq 0 -and (Get-ScheduledTask -TaskName $task).State -ne 'Running') { return $true }
    Start-Sleep -Seconds 2
  }
  return $false
}
function Http([string]$method, [string]$url, [int]$timeoutMs = 8000) {
  if ($TEST) {
    $s = Get-SimState; $u = [Uri]$url; $path = $u.AbsolutePath
    if ($u.Port -eq $API_PORT) { if (-not [bool]$s.apiRunning) { return -1 }; return 401 }
    if ($u.Port -eq $WEB_PORT) {
      if (-not [bool]$s.webRunning) { return -1 }
      if ($path -eq '/portal/login') { return 200 }
      if ($path -like '/_next/static/*/_buildManifest.js') { $bid = $path.Split('/')[3]; $cur = $(try { Get-BuildId $LIVE_NEXT } catch { '' }); if ($bid -ceq $cur) { return 200 } else { return 404 } }
      return 404
    }
    return -2
  }
  try {
    $r = [Net.HttpWebRequest]::Create($url); $r.Method = $method; $r.Timeout = $timeoutMs; $r.ReadWriteTimeout = $timeoutMs
    $r.AllowAutoRedirect = $false; $r.UserAgent = 'r27-rollback-check'
    if ($method -eq 'POST') { $r.ContentType = 'application/json'; $b = [Text.Encoding]::UTF8.GetBytes('{}'); $r.ContentLength = $b.Length; $s = $r.GetRequestStream(); $s.Write($b, 0, $b.Length); $s.Dispose() }
    $resp = $r.GetResponse(); $code = [int]$resp.StatusCode; $resp.Dispose(); return $code
  } catch [Net.WebException] {
    if ($_.Exception.Response) { return [int]([Net.HttpWebResponse]$_.Exception.Response).StatusCode }
    return -1
  } catch { return -2 }
}
function Get-LauncherTuple {
  if ($TEST) { return [string](Get-SimState).launcherTuple }
  $a = Get-R26FileSha256 $API_LAUNCHER; $h = Get-R26FileSha256 $HOST_EXE; $w = Get-R26FileSha256 $WEB_LAUNCHER
  foreach ($t in $LAUNCH_TUPLES) { if ($a -ceq $t.api -and $h -ceq $t.host -and $w -ceq $t.web) { return $t.name } }
  return ('TANIMSIZ api=' + $a.Substring(0, 8) + ' host=' + $h.Substring(0, 8) + ' web=' + $w.Substring(0, 8))
}
function Get-ServiceState {
  $r = [ordered]@{}
  try { $r.apiListeners = @(Get-Pids $API_PORT); $r.webListeners = @(Get-Pids $WEB_PORT); $r.apiTask = Get-TaskState $API_TASK; $r.webTask = Get-TaskState $WEB_TASK } catch { $r.error = $_.Exception.Message }
  if ($TEST) { try { $s = Get-SimState; $r.sim = [ordered]@{ apiRunning = [bool]$s.apiRunning; webRunning = [bool]$s.webRunning; stopCalls = [int]$s.stopCalls; startCalls = [int]$s.startCalls } } catch { $r.simError = $_.Exception.Message } }
  return $r
}
function Test-RestoredIdentity {
  $v = [ordered]@{ ok = $false; mismatches = @() }
  $mm = New-Object System.Collections.Generic.List[string]
  try { $v.apiTree = Get-TreeDigest (Get-Map $LIVE) } catch { $v.apiTree = 'OKUNAMADI: ' + $_.Exception.Message }
  $v.apiTreeExpected = $EXP_LIVE; $v.apiTreeOk = ($v.apiTree -ceq $EXP_LIVE); if (-not $v.apiTreeOk) { $mm.Add('API agac digest: ' + $v.apiTree + ' != ' + $EXP_LIVE) }
  try { $v.pkg = Get-PackageDigest $LIVE } catch { $v.pkg = 'OKUNAMADI: ' + $_.Exception.Message }
  $v.pkgExpected = $EXP_BK_PKG; $v.pkgOk = ($v.pkg -ceq $EXP_BK_PKG); if (-not $v.pkgOk) { $mm.Add('API 16 dosya paket digest: ' + $v.pkg + ' != ' + $EXP_BK_PKG) }
  if (-not $v.pkgOk -or -not $v.apiTreeOk) {
    $bad = New-Object System.Collections.Generic.List[string]
    foreach ($rel in $FILES) {
      $p = Join-Path $LIVE ($rel -replace '/', '\'); $b = Join-Path $BackupApiDir ($rel -replace '/', '\')
      try {
        if ($ADDED -contains $rel) { if (Test-Path -LiteralPath $p -PathType Leaf) { $bad.Add($rel + ' (eklenen dosya hala canlida)') } }
        else { $hp = $(if (Test-Path -LiteralPath $p -PathType Leaf) { Get-R26FileSha256 $p } else { 'YOK' }); $hb = $(if (Test-Path -LiteralPath $b -PathType Leaf) { Get-R26FileSha256 $b } else { 'YEDEKTE YOK' }); if ($hp -cne $hb) { $bad.Add($rel + ' canli=' + $hp.Substring(0, [Math]::Min(16, $hp.Length)) + ' yedek=' + $hb.Substring(0, [Math]::Min(16, $hb.Length))) } }
      } catch { $bad.Add($rel + ' OKUNAMADI: ' + $_.Exception.Message) }
    }
    $v.mismatchedFiles = @($bad)
  }
  $v.addedPresent = @($ADDED | Where-Object { Test-Path -LiteralPath (Join-Path $LIVE ($_ -replace '/', '\')) -PathType Leaf })
  $v.addedOk = ($v.addedPresent.Count -eq 0); if (-not $v.addedOk) { $mm.Add('eklenen dosyalar hala canlida: ' + ($v.addedPresent -join ',')) }
  $v.quarantineFiles = $(if (Test-Path -LiteralPath $QUAR) { @(Get-ChildItem -LiteralPath $QUAR -Recurse -File -Force).Count } else { 0 })
  try { $v.webTree = $(if (Test-Path -LiteralPath $LIVE_NEXT) { Get-TreeDigest (Get-Map $LIVE_NEXT -Web) } else { 'YOK' }) } catch { $v.webTree = 'OKUNAMADI: ' + $_.Exception.Message }
  $v.webTreeExpected = $EXP_WEB_LIVE; $v.webTreeOk = ($v.webTree -ceq $EXP_WEB_LIVE); if (-not $v.webTreeOk) { $mm.Add('WEB .next digest: ' + $v.webTree + ' != ' + $EXP_WEB_LIVE) }
  try { $v.buildId = Get-BuildId $LIVE_NEXT } catch { $v.buildId = 'OKUNAMADI: ' + $_.Exception.Message }
  $v.buildIdExpected = $BID_LIVE; $v.buildIdOk = ($v.buildId -ceq $BID_LIVE); if (-not $v.buildIdOk) { $mm.Add('BUILD_ID: ' + $v.buildId + ' != ' + $BID_LIVE) }
  try { $v.cfg = Get-R26FileSha256 $LIVE_CFG } catch { $v.cfg = 'OKUNAMADI: ' + $_.Exception.Message }
  $v.cfgExpected = $CFG_LIVE; $v.cfgOk = ($v.cfg -ceq $CFG_LIVE); if (-not $v.cfgOk) { $mm.Add('next.config.js: ' + $v.cfg + ' != ' + $CFG_LIVE) }
  $v.mismatches = @($mm); $v.ok = ($mm.Count -eq 0)
  Say ('GERI YUKLENEN KIMLIK: api agac=' + $v.apiTreeOk + ' paket=' + $v.pkgOk + ' eklenen yok=' + $v.addedOk + ' (karantina ' + $v.quarantineFiles + ') | web agac=' + $v.webTreeOk + ' BUILD_ID=' + $v.buildIdOk + ' cfg=' + $v.cfgOk + ' -> ' + $(if ($v.ok) { 'PASS' } else { 'FAIL: ' + ($mm -join ' ; ') }))
  return $v
}
function Get-RecoveryText([string]$verdict) {
  return @(
    ('VERDICT ' + $verdict + ' - SERVISLER ' + $(if ($verdict -eq 'ROLLBACK-OK-ESKI-BASLAMADI') { 'baslatildi ama saglik/kapsam tutmadi' } else { 'BASLATILMADI (kimlik dogrulanmadan baslatma YOK)' }) + '. ESCALATE.'),
    ('   Yedekler: API=' + $BackupApiDir + ' | WEB=' + $BackupWebDir),
    ('   Aday .next yeniden adlandirildi: ' + $FAILED_NEXT + ' (varsa) ; eklenen dosya karantinasi: ' + $QUAR + ' (silme yok)'),
    '   Kanit JSON verify.mismatches + restoreSteps ile owner karari; canli dosyalara elle dokunma; betik yeniden kosulabilir (idempotent: karantina/yeniden adlandirma ts ile ayrisir).')
}
function Write-EvidenceProtected {
  $lastStage = $script:STAGE   # kanit asamasindan ONCEKI son asama ('stage' alani; '7-kanit' degil)
  Set-Stage '7-kanit'
  $evid = [ordered]@{
    record = 'R27-ROLLBACK-EXECUTION'; tsUtc = $ts; verdict = $script:VERDICT; exitCode = $script:EXIT
    stage = $lastStage; failedAt = $script:FAILED_AT; error = $script:ERR; stages = @($script:STAGES)
    testMode = [ordered]@{ enabled = $TEST; testRoot = $(if ($TEST) { $TestRoot } else { $null }); simulated = @('elevation', 'tasks', 'listeners', 'http', 'launcher-tuple') }
    quarantineDir = $QUAR; failedNextDir = $FAILED_NEXT; launcherTuple = $script:tuple0; backupApiDir = $BackupApiDir; backupWebDir = $BackupWebDir
    expected = [ordered]@{ apiTree = $EXP_LIVE; pkg = $EXP_BK_PKG; webTree = $EXP_WEB_LIVE; buildId = $BID_LIVE; cfg = $CFG_LIVE }
    restoreSteps = $script:RESTORE_STEPS; verify = $script:VERIFY; health = $script:health; recovery = $script:RECOVERY
    serviceState = $(try { Get-ServiceState } catch { @{ error = $_.Exception.Message } })
    log = @($log)
  }
  $json = $(try { $evid | ConvertTo-Json -Depth 8 } catch { '{"record":"R27-ROLLBACK-EXECUTION","verdict":"' + $script:VERDICT + '","exitCode":' + $script:EXIT + ',"jsonError":"' + ($_.Exception.Message -replace '"', '''') + '"}' })
  $name = 'R27-ROLLBACK-' + $ts + '.json'
  $written = $null
  foreach ($dir in @($EVID_DIR, (Join-Path ([IO.Path]::GetFullPath($env:TEMP)) 'r27-evidence-fallback'))) {
    try { New-Item -ItemType Directory -Force -Path $dir | Out-Null; $f = Join-Path $dir $name; [IO.File]::WriteAllText($f, $json, (New-Object Text.UTF8Encoding($false))); $written = $f; break }
    catch { Write-Host ('KANIT YAZILAMADI (' + $dir + '): ' + $_.Exception.Message) }
  }
  if ($written) { Write-Host ('KANIT: ' + $written + ' sha256=' + (Get-R26FileSha256 $written)) }
  else { Write-Host 'KANIT: HICBIR DIZINE YAZILAMADI - JSON konsolda:'; Write-Host $json }
  if ($script:RECOVERY) { foreach ($l in $script:RECOVERY) { Write-Host ('KURTARMA: ' + $l) } }
  Write-Host ('=== SONUC: ' + $script:VERDICT + ' (cikis ' + $script:EXIT + ')')
}

# ============================================================================= YEDEK BUTUNLUGU (SelfTest ve gercek kosum ortak)
# Olcum KORUMALIDIR: yedek dizini yok / okunamiyor / kisa yol vb. -> $bkErr dolar, betik DURMAZ; SelfTest FAIL (1) ya da
# gercek kosumda 1-yedek-butunluk asamasinda KAPI (20) -> kanit JSON finally'de YAZILIR (kanitsiz cikis yok).
Say '=== 1) YEDEK BUTUNLUGU'
$bkOk = $false; $pinOk = $false; $bkErr = $null; $bkNext = $null; $bkCfg = $null
try {
  if (-not (Test-Path -LiteralPath $BackupApiDir) -or -not (Test-Path -LiteralPath $BackupWebDir)) { throw ('yedek dizini yok: API=' + $BackupApiDir + ' (' + (Test-Path -LiteralPath $BackupApiDir) + ') WEB=' + $BackupWebDir + ' (' + (Test-Path -LiteralPath $BackupWebDir) + ')') }
  # 8.3 kisa yol (orn. ULASTE~1) Get-Map'in Substring hesabini bozar -> tam yola normalize et (R27 SelfTest'te olculdu)
  $BackupApiDir = (Get-Item -LiteralPath $BackupApiDir).FullName; $BackupWebDir = (Get-Item -LiteralPath $BackupWebDir).FullName
  $script:bkMap = Get-Map $BackupApiDir; $bkDig = Get-TreeDigest $script:bkMap
  $pm = [ordered]@{}; foreach ($rel in $FILES) { $pm[$rel] = $(if ($script:bkMap.Contains($rel)) { $script:bkMap[$rel] } else { '-' }) }
  $bkPkg = Get-TreeDigest $pm
  $bkNext = Join-Path $BackupWebDir '.next'; $bkCfg = Join-Path $BackupWebDir 'next.config.js'
  $bkW = $(if (Test-Path -LiteralPath $bkNext) { Get-TreeDigest (Get-Map $bkNext -Web) } else { 'YOK' })
  $bkBid = $(if (Test-Path -LiteralPath (Join-Path $bkNext 'BUILD_ID')) { Get-BuildId $bkNext } else { 'YOK' })
  $bkCfgSha = $(if (Test-Path -LiteralPath $bkCfg) { Get-R26FileSha256 $bkCfg } else { 'YOK' })
  Say ('API yedek digest esit=' + ($bkDig -ceq $EXP_LIVE) + ' paket esit=' + ($bkPkg -ceq $EXP_BK_PKG) + ' | WEB yedek digest esit=' + ($bkW -ceq $EXP_WEB_LIVE) + ' BUILD_ID=' + $bkBid + ' cfg esit=' + ($bkCfgSha -ceq $CFG_LIVE))
  $bkOk = ($bkDig -ceq $EXP_LIVE -and $bkPkg -ceq $EXP_BK_PKG -and $bkW -ceq $EXP_WEB_LIVE -and $bkBid -ceq $BID_LIVE -and $bkCfgSha -ceq $CFG_LIVE)
  $script:tuple0 = Get-LauncherTuple
  $pinOk = -not $script:tuple0.StartsWith('TANIMSIZ')
  Say ('baslatici uclusu=' + $script:tuple0 + ' | tanimli=' + $pinOk)
} catch { $bkErr = $_.Exception.Message; Say ('KAPI: yedek butunlugu OLCULEMEDI: ' + $bkErr) }
if ($SelfTest) {
  $needed = @('Say', 'Set-Stage', 'Get-R26FileSha256', 'Get-Map', 'Get-TreeDigest', 'Get-PackageDigest', 'Get-Pids', 'Wait-Stopped', 'Http', 'Get-LauncherTuple', 'Get-BuildId', 'Test-RestoredIdentity', 'Write-EvidenceProtected', 'Get-RecoveryText', 'Invoke-StopTask', 'Invoke-StartTask', 'Test-Elevated')
  $missing = @($needed | Where-Object { -not (Get-Command $_ -CommandType Function -ErrorAction SilentlyContinue) })
  Say ('fonksiyon kumesi tam=' + ($missing.Count -eq 0) + ' | robocopy=' + [bool](Get-Command robocopy.exe -ErrorAction SilentlyContinue))
  $st = ($null -eq $bkErr -and $bkOk -and $pinOk -and $missing.Count -eq 0)
  Say ('=== SELFTEST SONUC: ' + $(if ($st) { 'PASS' } else { 'FAIL' + $(if ($bkErr) { ' (yedek olculemedi)' } else { '' }) }))
  if (-not $st) { exit 1 }
  exit 0
}

# ============================================================================= GERI ALMA AKISI
try {
  try {
    Set-Stage '0-kapilar'
    if ($TEST) { Say ('TEST MODU: TestRoot=' + $TestRoot + ' | canli yollara BAGLANMADI'); if (-not (Test-Path -LiteralPath $SIM_STATE -PathType Leaf)) { throw ('KAPI: simulator durumu yok: ' + $SIM_STATE + ' - DUR') } }
    if (-not (Test-Elevated)) { throw 'KAPI: yukseltilmis pencere gerekli - DUR' }
    Set-Stage '1-yedek-butunluk'
    if ($bkErr) { throw ('KAPI: yedek butunlugu olculemedi - GERI ALMA BASLAMAZ: ' + $bkErr) }
    if (-not $bkOk) { throw 'KAPI: yedek kimligi dogrulanamadi - GERI ALMA BASLAMAZ' }
    if (-not $pinOk) { throw 'KAPI: baslatici/host uclusu tanimli iki durumdan biri degil - DUR' }
    if ((Get-R26FileSha256 (Join-Path $LIVE_API '.env')) -cne $ENV_PIN) { throw 'KAPI: canli .env sha pin degil - DUR' }
    New-Item -ItemType Directory -Force -Path $EVID_DIR | Out-Null

    Set-Stage '2-durdur-web'
    Invoke-StopTask $WEB_TASK
    if (-not (Wait-Stopped $WEB_TASK $WEB_PORT 'web' 90)) { throw 'KAPI: WEB kapanmadi - DOSYALARA DOKUNULMADI, ESCALATE' }
    Set-Stage '2-durdur-api'
    Invoke-StopTask $API_TASK
    if (-not (Wait-Stopped $API_TASK $API_PORT 'api' 90)) { throw 'KAPI: API kapanmadi - DOSYALARA DOKUNULMADI, ESCALATE' }
    Say 'WEB ve API kapandi'
    $script:SERVICES_STOPPED = $true

    Set-Stage '3-geri-yukle-api'
    $steps = [ordered]@{ 'api-eklenen-karantina' = 'BASLADI'; 'api-degisen-yedekten' = 'BEKLIYOR'; 'web-next-geri' = 'BEKLIYOR'; 'web-cfg-geri' = 'BEKLIYOR' }
    $script:RESTORE_STEPS = $steps
    New-Item -ItemType Directory -Force -Path $QUAR | Out-Null
    $moved = 0
    foreach ($rel in $ADDED) {
      $dst = Join-Path $LIVE ($rel -replace '/', '\')
      if (Test-Path -LiteralPath $dst -PathType Leaf) { $q = Join-Path $QUAR ($rel -replace '/', '\'); New-Item -ItemType Directory -Force -Path (Split-Path $q) | Out-Null; Move-Item -LiteralPath $dst -Destination $q -Force; $moved++ }
    }
    $steps['api-eklenen-karantina'] = ('TAMAM (' + $moved + ' dosya: ' + $QUAR + ')')
    $steps['api-degisen-yedekten'] = 'BASLADI'
    $copied = 0
    foreach ($rel in $FILES) {
      if ($ADDED -contains $rel) { continue }
      $dst = Join-Path $LIVE ($rel -replace '/', '\')
      Copy-Item -LiteralPath (Join-Path $BackupApiDir ($rel -replace '/', '\')) -Destination $dst -Force
      if ((Get-R26FileSha256 $dst) -cne $script:bkMap[$rel]) { throw ('geri donen API dosyasi sha uyusmuyor: ' + $rel) }
      $copied++
    }
    $steps['api-degisen-yedekten'] = ('TAMAM (' + $copied + ' dosya)')
    Set-Stage '3-geri-yukle-web'
    $steps['web-next-geri'] = 'BASLADI'
    if (Test-Path -LiteralPath $LIVE_NEXT) { Move-Item -LiteralPath $LIVE_NEXT -Destination $FAILED_NEXT }
    $global:LASTEXITCODE = 0
    & robocopy.exe $bkNext $LIVE_NEXT /E /R:0 /W:0 /NFL /NDL /NJH /NJS | Out-Null
    if ($LASTEXITCODE -ge 8) { throw ('WEB geri kopyalama robocopy ' + $LASTEXITCODE) }
    $steps['web-next-geri'] = ('TAMAM (yedekten robocopy; onceki .next -> ' + $FAILED_NEXT + ')')
    $steps['web-cfg-geri'] = 'BASLADI'
    Copy-Item -LiteralPath $bkCfg -Destination $LIVE_CFG -Force
    $steps['web-cfg-geri'] = 'TAMAM'

    Set-Stage '4-kimlik'
    $v = Test-RestoredIdentity; $script:VERIFY = $v
    if (-not $v.ok) { $script:VERDICT = 'ROLLBACK-DOGRULANAMADI'; $script:EXIT = 11; $script:RECOVERY = Get-RecoveryText $script:VERDICT; Say 'KAPI: geri alma sonrasi kimlik taban degil - SERVIS BASLATILMIYOR, ESCALATE'; throw 'KIMLIK-FAIL' }

    Set-Stage '5-baslat-api'
    Invoke-StartTask $API_TASK
    $deadline = (Get-Date).AddSeconds(120); $me = -1; $hp = @()
    while ((Get-Date) -lt $deadline) { $hp = Get-Pids $API_PORT; if ($hp.Count -ge 1) { $me = Http 'GET' ('http://127.0.0.1:' + $API_PORT + '/api/auth/me'); if ($me -gt 0) { break } }; if ($TEST) { break }; Start-Sleep -Seconds 3 }
    $unauth = Http 'POST' ('http://127.0.0.1:' + $API_PORT + $ROUTE)
    $portalUnauth = Http 'GET' ('http://127.0.0.1:' + $API_PORT + $PORTAL_GET)
    Set-Stage '5-baslat-web'
    Invoke-StartTask $WEB_TASK
    $deadline = (Get-Date).AddSeconds(180); $pl = -1; $wp = @()
    while ((Get-Date) -lt $deadline) { $wp = Get-Pids $WEB_PORT; if ($wp.Count -ge 1) { $pl = Http 'GET' ('http://127.0.0.1:' + $WEB_PORT + '/portal/login'); if ($pl -gt 0) { break } }; if ($TEST) { break }; Start-Sleep -Seconds 3 }
    $bm = Http 'GET' ('http://127.0.0.1:' + $WEB_PORT + '/_next/static/' + $BID_LIVE + '/_buildManifest.js')
    Say ('API pid=' + ($hp -join ',') + ' /api/auth/me=' + $me + ' run-now=' + $unauth + ' portal/cases=' + $portalUnauth + ' | WEB pid=' + ($wp -join ',') + ' /portal/login=' + $pl + ' buildManifest(' + $BID_LIVE + ')=' + $bm)
    Set-Stage '6-kapsam'
    $tuple1 = Get-LauncherTuple
    Say ('baslatici uclusu degismedi=' + ($tuple1 -ceq $script:tuple0) + ' (' + $tuple1 + ')')
    $ok = ($hp.Count -eq 1 -and $me -eq 401 -and $unauth -eq 401 -and $portalUnauth -eq 401 -and $wp.Count -eq 1 -and $pl -eq 200 -and $bm -eq 200 -and $tuple1 -ceq $script:tuple0)
    $script:health = [ordered]@{ ok = $ok; apiPids = @($hp); authMe = $me; runNow = $unauth; portalCases = $portalUnauth; webPids = @($wp); portalLogin = $pl; buildManifest = $bm; tupleUnchanged = ($tuple1 -ceq $script:tuple0) }
    if ($ok) { $script:VERDICT = 'ROLLBACK PASS'; $script:EXIT = 0 }
    else { $script:VERDICT = 'ROLLBACK-OK-ESKI-BASLAMADI'; $script:EXIT = 13; $script:RECOVERY = Get-RecoveryText $script:VERDICT }
  } catch {
    if ($_.Exception.Message -ne 'KIMLIK-FAIL') {
      $script:ERR = $_.Exception.Message; $script:FAILED_AT = $script:STAGE
      Say ('HATA [' + $script:STAGE + ']: ' + $script:ERR)
      if (-not $script:SERVICES_STOPPED) {
        if ($script:STAGE -like '2-durdur*') { $script:VERDICT = 'DURDURMA-BASARISIZ'; $script:EXIT = 21 } else { $script:VERDICT = 'KAPIDA-DURDU'; $script:EXIT = 20 }
        Say 'canli dosyalara DOKUNULMADI'
      } elseif ($script:STAGE -like '3-*' -or $script:STAGE -eq '4-kimlik') {
        if ($script:RESTORE_STEPS) { foreach ($k in @($script:RESTORE_STEPS.Keys)) { if ($script:RESTORE_STEPS[$k] -eq 'BASLADI') { $script:RESTORE_STEPS[$k] = 'BASARISIZ: ' + $script:ERR } elseif ($script:RESTORE_STEPS[$k] -eq 'BEKLIYOR') { $script:RESTORE_STEPS[$k] = 'KALAN' } } }
        $script:VERDICT = 'ROLLBACK-ENGELLENDI'; $script:EXIT = 12; $script:RECOVERY = Get-RecoveryText $script:VERDICT
        Say 'geri yukleme yarim kaldi - SERVIS BASLATILMIYOR, kalan adimlar kanitta, ESCALATE'
      } else {
        $script:VERDICT = 'ROLLBACK-OK-ESKI-BASLAMADI'; $script:EXIT = 13; $script:RECOVERY = Get-RecoveryText $script:VERDICT
      }
    } else { $script:FAILED_AT = '4-kimlik'; $script:ERR = 'geri yuklenen kimlik dogrulanamadi: ' + ($script:VERIFY.mismatches -join ' ; ') }
  }
} catch {
  if ($null -eq $script:ERR) { $script:ERR = $_.Exception.Message; $script:FAILED_AT = $script:STAGE } else { $script:ERR = $script:ERR + ' || sonraki hata [' + $script:STAGE + ']: ' + $_.Exception.Message }
  if ($script:VERDICT -eq 'BELIRSIZ') { $script:VERDICT = $(if ($script:SERVICES_STOPPED) { 'ROLLBACK-ENGELLENDI' } else { 'KAPIDA-DURDU' }); $script:EXIT = $(if ($script:SERVICES_STOPPED) { 12 } else { 20 }) }
  Say ('BEKLENMEYEN HATA [' + $script:STAGE + ']: ' + $_.Exception.Message)
} finally {
  try { Write-EvidenceProtected } catch { Write-Host ('KANIT YAZIMI ISTISNA: ' + $_.Exception.Message + ' | verdict=' + $script:VERDICT + ' exit=' + $script:EXIT) }
}
exit $script:EXIT
