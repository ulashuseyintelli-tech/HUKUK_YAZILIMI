param(
  [Parameter(Mandatory = $true)][string]$BackupApiDir,
  [Parameter(Mandatory = $true)][string]$BackupWebDir,
  [switch]$SelfTest,
  [string]$TestRoot = '',
  [string]$Fault = '')
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
#   13  ROLLBACK-OK-ESKI-BASLAMADI dosyalar TABAN kimliginde DOGRULANDI ama en az bir servis OLCUMLE ayakta degil / olculemedi ya da
#                                 kapsam (uclu) tutmadi. Iki servisin baslatma girisimi AYRI yapilir (birinin istisnasi ya da okuma hatasi
#                                 digerini ATLATMAZ); KURTARMA satirlari servis basina OLCULEN duruma gore yazilir (dosya islemi gerekmez)
#   20  KAPIDA-DURDU               kapi (yetki/yedek kimligi/uclu/.env) - canli dosyalara DOKUNULMADI; servisler durdurulmadi
#   21  DURDURMA-BASARISIZ         WEB/API kapanmadi ya da kapandigi OLCULEMEDI - canli dosyalara DOKUNULMADI; toparlama OLCULDU: bu kosumda
#                                 durdurulup KAPALI olculen servis yeniden baslatildi ve iki servis saglik kumesiyle AYAKTA olculdu (ESCALATE)
#   22  DURDURMA-BASARISIZ-TOPARLANAMADI  ayni durum, ama toparlama sonrasi en az bir servis ayakta degil ya da OLCULEMEDI -> KURTARMA satirlari
#    1  SelfTest FAIL (yalniz -SelfTest)
# OLCUM (R03-c): dinleyici/gorev/host okuma HATASI 'kapali' ya da 'basarili' SAYILMAZ. Durdurma ve saglik beklemeleri okuma hatasinda sure
#   dolana kadar YENIDEN olcer; sure sonunda hala okunamiyorsa sonuc OLCULEMEDI'dir (KAPALI/AYAKTA degil). "baslatildi/ayakta" yalniz
#   olculen sonuc destekliyorsa yazilir.
# IZOLE TEST MODU: -TestRoot <dizin>: canli yollar TestRoot\live\... altina baglanir, gorev/dinleyici/Http/uclu simulatorle
#   (TestRoot\sim\state.json) degistirilir; kanit TestRoot\evidence. TestRoot canli kokun altinda/esit ise DUR (20).
#   -Fault <ad> YALNIZ -TestRoot ile (canli modda -Fault -> 20): b3-read-transient (5-baslat-api'de TEK dinleyici okuma hatasi) |
#   b3-read-persistent (5-baslat-* ve sonrasinda KALICI dinleyici okuma hatasi) | b3-api-start-throw | b3-web-start-throw (baslatma istisnasi) |
#   b3-stop-api-fail (WEB durur, API kapanmaz -> toparlama) | b3-stop-read-persistent (2-durdur-web'de KALICI okuma hatasi -> OLCULEMEDI) |
#   b3-toparla-read-transient (toparlamada TEK okuma hatasi -> karar yeniden olcumle) | b3-api-crash-after (WEB baslarken API duser -> son olcum) |
#   b3-web-stopthrow-api-fail (WEB durdurma komutu istisna ama durur; API kapanmaz) | b3-stop-recovery-start-throw (toparlamada WEB Start istisnasi) |
#   b3-api-down-before (API kosum oncesi KAPALI + WEB okuma hatasi -> API'ye Start YOK) | b3-toparla-web-crash (toparlamada baslatilan
#   WEB son olcumden once duser -> 22) | b3-web-down-before (WEB kosum oncesi KAPALI, API kapanmaz -> WEB'e otomatik Start YOK) |
#   b3-web-unhealthy (WEB calisiyor ama saglik yok -> 13; KURTARMA surece elle dokunma, ESCALATE) | b3-web-late-stop (WEB durdurma penceresinden SONRA kapanir -> bu kosumun durdurmasi sayilir, yeniden baslatilir -> 21) |
#   b3-final-read-transient (son olcumde TEK okuma hatasi -> kisa yeniden olcum, karari degistirmez -> 0).
# KARAR KURALI (R03-c): 0/13 ve 21/22 karari, tum adimlardan SONRA iki servisin tek atista yeniden olculmesine dayanir; 'bu kosumda
#   durduruldu' yalniz durdurmadan ONCE CALISIYOR/KARISIK olculup sonra KAPALI olculen servis icindir.
# =============================================================================
$LIVE_ROOT_CANON = 'C:\Development\HUKUK_YAZILIMI\HY_W4_RELEASE23'
$TEST = ($TestRoot -ne '')
$FAULTS = @('b3-read-transient', 'b3-read-persistent', 'b3-api-start-throw', 'b3-web-start-throw', 'b3-stop-api-fail', 'b3-stop-read-persistent',
            'b3-toparla-read-transient', 'b3-api-crash-after', 'b3-web-stopthrow-api-fail', 'b3-stop-recovery-start-throw', 'b3-api-down-before',
            'b3-toparla-web-crash', 'b3-web-down-before', 'b3-web-unhealthy', 'b3-web-late-stop', 'b3-final-read-transient')
if ($Fault -ne '' -and -not $TEST) { Write-Host 'KAPI: -Fault yalniz -TestRoot ile kullanilir (canli modda hata enjeksiyonu YOK) - DUR'; exit 20 }
if ($Fault -ne '' -and $FAULTS -notcontains $Fault) { Write-Host ('KAPI: bilinmeyen -Fault: ' + $Fault + ' - DUR'); exit 20 }
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
$script:STOPS = [ordered]@{}; $script:STOP_RECOVERY = $null; $script:FAULT_LOG = New-Object System.Collections.Generic.List[string]; $script:FAULT_FIRED = 0
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
function Add-FaultLog([string]$m) { if (-not $script:FAULT_LOG.Contains($m)) { $script:FAULT_LOG.Add($m) } }
# Get-ReadFault (YALNIZ TEST): -Fault'a gore dinleyici okuma hatasi enjekte edilir (gercek sistemde bu fonksiyon cagrilmaz).
function Get-ReadFault([int]$port) {
  $st = [string]$script:STAGE; $hit = $false
  switch ($Fault) {
    'b3-read-transient'       { $hit = ($st -eq '5-baslat-api' -and $port -eq $API_PORT -and $script:FAULT_FIRED -eq 0) }
    'b3-read-persistent'      { $hit = (@('5-baslat-api', '5-baslat-web', '6-kapsam') -contains $st) }
    'b3-stop-read-persistent' { $hit = ($port -eq $WEB_PORT -and @('2-durdur-web', '2-toparla', '2-toparla-son') -contains $st) }
    'b3-api-down-before'      { $hit = ($port -eq $WEB_PORT -and @('2-durdur-web', '2-toparla', '2-toparla-son') -contains $st) }
    'b3-toparla-read-transient' { $hit = ($st -eq '2-toparla' -and $port -eq $WEB_PORT -and $script:FAULT_FIRED -eq 0) }
    'b3-final-read-transient' { $hit = ($st -eq '6-kapsam' -and $port -eq $API_PORT -and $script:FAULT_FIRED -eq 0) }
  }
  if (-not $hit) { return $null }
  $script:FAULT_FIRED = [int]$script:FAULT_FIRED + 1; Add-FaultLog ($st + ': dinleyici okuma hatasi (port ' + $port + ')')
  return (New-Object System.InvalidOperationException ('FAULT ' + $Fault + ': sim dinleyici okuma hatasi (enjekte; port ' + $port + ')'))
}
function Get-Pids([int]$port) {
  if ($TEST) {
    if ($Fault -ne '') { $fx = Get-ReadFault $port; if ($fx) { throw $fx } }
    # b3-web-late-stop: WEB durdurma bekleme penceresinde kapanmaz, toparlamada KAPALI olculur (gec durma; bu kosumun durdurmasidir)
    if ($Fault -eq 'b3-web-late-stop' -and $script:STAGE -eq '2-toparla' -and $port -eq $WEB_PORT -and $script:FAULT_FIRED -eq 0) { $script:FAULT_FIRED = 1; $sl0 = Get-SimState; $sl0.webRunning = $false; Set-SimState $sl0; Add-FaultLog '2-toparla: WEB gec kapandi (sim)' }
    # b3-toparla-web-crash: toparlamada baslatilip AYAKTA olculen WEB, son olcumden once DUSER (karar son olcume dayanmali)
    if ($Fault -eq 'b3-toparla-web-crash' -and $script:STAGE -eq '2-toparla-son' -and $port -eq $WEB_PORT -and $script:FAULT_FIRED -eq 0) { $script:FAULT_FIRED = 1; $sc0 = Get-SimState; $sc0.webRunning = $false; Set-SimState $sc0; Add-FaultLog '2-toparla-son: WEB dustu (sim)' }
    $s = Get-SimState; if ($port -eq $API_PORT) { if ([bool]$s.apiRunning) { return @([int]$s.apiPid) } else { return @() } } else { if ([bool]$s.webRunning) { return @([int]$s.webPid) } else { return @() } }
  }
  $c = @()
  try { $c = @(Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction Stop) }
  catch { if (-not (Test-EmptyQueryError $_)) { throw }; $c = @() }
  return @($c | ForEach-Object { $_.OwningProcess } | Sort-Object -Unique)
}
# Get-HostCount: hukuk-task-host.exe <api|web> surec sayisi. Okuma hatasi FIRLATILIR; adi eslesen ama komut satiri OKUNAMAYAN surec de
#   okuma hatasidir (0 sayilmaz -> KAPALI denmez). TEST: simulator (servis calisiyorsa 1).
function Get-HostCount([string]$hostArg) {
  if ($TEST) { $s = Get-SimState; if ($hostArg -eq 'api') { return [int][bool]$s.apiRunning } else { return [int][bool]$s.webRunning } }
  $all = @(Get-CimInstance Win32_Process -Filter "Name='hukuk-task-host.exe'" -ErrorAction Stop)
  if (@($all | Where-Object { -not $_.CommandLine }).Count -gt 0) { throw 'hukuk-task-host.exe komut satiri OKUNAMADI (sayim yapilmadi)' }
  return @($all | Where-Object { $_.CommandLine -match ('(^|\s)' + $hostArg + '(\s|$)') }).Count
}
function Invoke-StopTask([string]$task) {
  if ($TEST) {
    $s = Get-SimState; $s.stopCalls = [int]$s.stopCalls + 1
    if ($Fault -eq 'b3-web-late-stop' -and $task -eq $WEB_TASK -and $script:STAGE -eq '2-durdur-web') { Add-FaultLog '2-durdur-web: WEB bekleme penceresinde kapanmiyor'; Add-SimEvent $s ('stop ' + $task + ' (rollback) -> GEC (fault)'); Set-SimState $s; return }
    if (@('b3-stop-api-fail', 'b3-toparla-read-transient', 'b3-web-stopthrow-api-fail', 'b3-stop-recovery-start-throw', 'b3-toparla-web-crash', 'b3-web-down-before') -contains $Fault -and $task -eq $API_TASK -and $script:STAGE -eq '2-durdur-api') { Add-FaultLog '2-durdur-api: API kapanmiyor'; Add-SimEvent $s ('stop ' + $task + ' (rollback) -> KAPANMADI (fault)'); Set-SimState $s; return }
    if ($task -eq $API_TASK) { $s.apiRunning = $false } else { $s.webRunning = $false }; Add-SimEvent $s ('stop ' + $task + ' (rollback)'); Set-SimState $s
    if ($Fault -eq 'b3-web-stopthrow-api-fail' -and $task -eq $WEB_TASK -and $script:STAGE -eq '2-durdur-web') { Add-FaultLog '2-durdur-web: HukukPlatform-Web durdurma istisnasi (etkili)'; throw ('FAULT ' + $Fault + ': Stop-ScheduledTask istisnasi (enjekte; servis yine de durdu)') }
    return
  }
  Stop-ScheduledTask -TaskName $task
}
function Invoke-StartTask([string]$task) {
  if ($TEST) {
    $s = Get-SimState; $s.startCalls = [int]$s.startCalls + 1
    $throwIt = (($Fault -eq 'b3-api-start-throw' -and $task -eq $API_TASK -and $script:STAGE -eq '5-baslat-api') -or ($Fault -eq 'b3-web-start-throw' -and $task -eq $WEB_TASK -and $script:STAGE -eq '5-baslat-web') -or
                ($Fault -eq 'b3-stop-recovery-start-throw' -and $task -eq $WEB_TASK -and $script:STAGE -eq '2-toparla'))
    if ($throwIt) { Add-FaultLog ($script:STAGE + ': ' + $task + ' baslatma istisnasi'); Add-SimEvent $s ('start ' + $task + ' (rollback) -> ISTISNA (fault)'); Set-SimState $s; throw ('FAULT ' + $Fault + ': Start-ScheduledTask istisnasi (enjekte)') }
    if ($task -eq $API_TASK) { $s.apiRunning = $true } else { $s.webRunning = $true }
    # b3-api-crash-after: WEB baslatilirken API DUSER (API'nin onceki AYAKTA olcumu eskir; karar son olcume dayanmali)
    if ($Fault -eq 'b3-api-crash-after' -and $task -eq $WEB_TASK -and $script:STAGE -eq '5-baslat-web') { $s.apiRunning = $false; Add-FaultLog '5-baslat-web: API dustu (sim)' }
    Add-SimEvent $s ('start ' + $task + ' (rollback) -> running'); Set-SimState $s; return
  }
  Start-ScheduledTask -TaskName $task
}
function Get-SvcTask([string]$svc) { if ($svc -eq 'api') { return $API_TASK } else { return $WEB_TASK } }
function Get-SvcPort([string]$svc) { if ($svc -eq 'api') { return $API_PORT } else { return $WEB_PORT } }
# Get-SvcMeasure: servis basina TEK olcum; her alan AYRI okunur (bir alanin hatasi digerlerinin kaydini engellemez).
#   KAPALI = gorev Running degil + dinleyici 0 + host 0 ; CALISIYOR = gorev Running + tek dinleyici + host >= 1 ; KARISIK = diger ;
#   OLCULEMEDI = en az bir alan okunamadi (KAPALI ya da CALISIYOR SAYILMAZ).
function Get-SvcMeasure([string]$svc) {
  $m = [ordered]@{ atUtc = (Get-Date).ToUniversalTime().ToString('HH:mm:ss') + 'Z'; task = $null; listeners = $null; hostProcs = $null; state = 'OLCULEMEDI'; error = $null; text = $null }
  $errs = New-Object System.Collections.Generic.List[string]
  try { $m.listeners = @(Get-Pids (Get-SvcPort $svc)).Count } catch { $errs.Add('dinleyici: ' + $_.Exception.GetType().Name + ': ' + $_.Exception.Message) }
  try { $m.hostProcs = [int](Get-HostCount $svc) } catch { $errs.Add('host: ' + $_.Exception.GetType().Name + ': ' + $_.Exception.Message) }
  try { $m.task = [string](Get-TaskState (Get-SvcTask $svc)) } catch { $errs.Add('gorev: ' + $_.Exception.GetType().Name + ': ' + $_.Exception.Message) }
  if ($errs.Count -gt 0) { $m.error = ($errs -join ' ; '); $m.state = 'OLCULEMEDI' }
  elseif ($m.task -ne 'Running' -and $m.listeners -eq 0 -and $m.hostProcs -eq 0) { $m.state = 'KAPALI' }
  elseif ($m.task -eq 'Running' -and $m.listeners -eq 1 -and $m.hostProcs -ge 1) { $m.state = 'CALISIYOR' }
  else { $m.state = 'KARISIK' }
  $m.text = $m.state + ' (gorev=' + $m.task + ' dinleyici=' + $m.listeners + ' host=' + $m.hostProcs + ' @' + $m.atUtc + $(if ($m.error) { '; OKUMA HATASI: ' + $m.error } else { '' }) + ')'
  return $m
}
# Wait-Stopped: KAPALI olculene kadar bekler. Okuma hatasi 'kapandi' SAYILMAZ; sure dolana kadar YENIDEN olcer; sure sonunda hala
#   okunamiyorsa sonuc OLCULEMEDI (stopped=false -> dosyaya dokunulmaz). Firlatmaz. TEST: bekleme yok, en cok 3 olcum.
function Wait-Stopped([string]$task, [int]$port, [string]$hostArg, [int]$TimeoutSec = 90) {
  $deadline = (Get-Date).AddSeconds($TimeoutSec); $n = 0; $errs = 0; $m = $null
  while ($true) {
    $m = Get-SvcMeasure $hostArg; $n++
    if ($m.state -eq 'KAPALI') { break }
    if ($m.state -eq 'OLCULEMEDI') { $errs++ }
    if ($TEST) { if ($n -ge 3 -or $TimeoutSec -le 0) { break } } elseif ((Get-Date) -ge $deadline) { break } else { Start-Sleep -Seconds 2 }
  }
  return [ordered]@{ stopped = ($m.state -eq 'KAPALI'); state = $m.state; attempts = $n; readErrors = $errs; last = $m }
}
# Get-SettledMeasure: karar olcumu. OLCULEMEDI/KARISIK ise sure dolana kadar YENIDEN olcer (KAPALI ya da CALISIYOR'a oturana kadar);
#   tek gecici okuma hatasi karari belirlemez. Sure sonunda hala okunamiyorsa OLCULEMEDI doner. TEST: bekleme yok, en cok 3 olcum.
function Get-SettledMeasure([string]$svc, [int]$TimeoutSec = 30) {
  $deadline = (Get-Date).AddSeconds($TimeoutSec); $n = 0; $errs = 0; $m = $null
  while ($true) {
    $m = Get-SvcMeasure $svc; $n++
    if (@('KAPALI', 'CALISIYOR') -contains [string]$m.state) { break }
    if ($m.state -eq 'OLCULEMEDI') { $errs++ }
    if ($TEST) { if ($n -ge 3 -or $TimeoutSec -le 0) { break } } elseif ((Get-Date) -ge $deadline) { break } else { Start-Sleep -Seconds 2 }
  }
  return [ordered]@{ state = [string]$m.state; attempts = $n; readErrors = $errs; last = $m }
}
# Wait-SvcHealthy: baslatma sonrasi (ya da toparlamada) servis sagligi. Okuma hatasi -> sure sinirli YENIDEN olcum; son olcum okunamadiysa
#   OLCULEMEDI (AYAKTA ya da KAPALI denmez). AYAKTA = olculen CALISIYOR + api: /api/auth/me, run-now, portal/cases 401 ;
#   web: /portal/login 200 + buildManifest(<beklenen BUILD_ID>) 200. $wait=$false -> tek olcum (baslatma komutu verilemediyse beklenmez).
#   $bid: geri yukleme sonrasi BID_LIVE (R26); DURDURMA toparlamasinda dosyalara dokunulmadigi icin canli .next'in KENDI BUILD_ID'si
#   (okunamazsa bos -> manifest 200 olamaz -> AYAKTA denmez).
function Wait-SvcHealthy([string]$svc, [int]$TimeoutSec, [bool]$wait = $true, [string]$bid = $BID_LIVE) {
  $port = Get-SvcPort $svc
  $r = [ordered]@{ state = 'OLCULEMEDI'; attempts = 0; readErrors = 0; lastReadError = $null; measured = $null; codes = [ordered]@{}; buildId = $(if ($svc -eq 'web') { $bid } else { $null }); text = $null }
  $deadline = (Get-Date).AddSeconds($TimeoutSec); $m = $null
  while ($true) {
    $r.attempts++
    $m = Get-SvcMeasure $svc
    if ($m.state -eq 'OLCULEMEDI') { $r.readErrors++; $r.lastReadError = $m.error }
    elseif ($m.listeners -ge 1) { $probe = $(if ($svc -eq 'api') { Http 'GET' ('http://127.0.0.1:' + $port + '/api/auth/me') } else { Http 'GET' ('http://127.0.0.1:' + $port + '/portal/login') }); if ($probe -gt 0) { break } }
    if (-not $wait) { break }
    if ($TEST) { if ($r.attempts -ge 3 -or $TimeoutSec -le 0) { break } } elseif ((Get-Date) -ge $deadline) { break } else { Start-Sleep -Seconds 3 }
  }
  $r.measured = $m
  if ($m.state -eq 'OLCULEMEDI') { $r.state = 'OLCULEMEDI'; $r.text = 'OLCULEMEDI (son olcum okunamadi: ' + $m.error + '; okuma hatasi ' + $r.readErrors + '/' + $r.attempts + ')'; return $r }
  if ($svc -eq 'web' -and -not $bid) { $r.state = 'OLCULEMEDI'; $r.text = 'OLCULEMEDI (canli .next BUILD_ID OKUNAMADI - WEB sagligi dogrulanamadi; olculen ' + $m.text + ')'; return $r }
  if ($svc -eq 'api') {
    $r.codes.authMe = Http 'GET' ('http://127.0.0.1:' + $port + '/api/auth/me'); $r.codes.runNow = Http 'POST' ('http://127.0.0.1:' + $port + $ROUTE); $r.codes.portalCases = Http 'GET' ('http://127.0.0.1:' + $port + $PORTAL_GET)
    $hok = ($r.codes.authMe -eq 401 -and $r.codes.runNow -eq 401 -and $r.codes.portalCases -eq 401)
  } else {
    $r.codes.portalLogin = Http 'GET' ('http://127.0.0.1:' + $port + '/portal/login'); $r.codes.buildManifest = Http 'GET' ('http://127.0.0.1:' + $port + '/_next/static/' + $bid + '/_buildManifest.js')
    $hok = ($r.codes.portalLogin -eq 200 -and $r.codes.buildManifest -eq 200)
  }
  $r.state = $(if ($m.state -eq 'CALISIYOR' -and $hok) { 'AYAKTA' } else { 'AYAKTA-DEGIL' })
  $r.text = $r.state + ' (olculen ' + $m.text + '; ' + (($r.codes.Keys | ForEach-Object { $_ + '=' + $r.codes[$_] }) -join ' ') + $(if ($r.readErrors) { '; ara okuma hatasi ' + $r.readErrors + '/' + $r.attempts } else { '' }) + ')'
  return $r
}
function Http([string]$method, [string]$url, [int]$timeoutMs = 8000) {
  if ($TEST) {
    $s = Get-SimState; $u = [Uri]$url; $path = $u.AbsolutePath
    if ($u.Port -eq $API_PORT) { if (-not [bool]$s.apiRunning) { return -1 }; return 401 }
    if ($u.Port -eq $WEB_PORT) {
      if (-not [bool]$s.webRunning) { return -1 }
      if ($path -eq '/portal/login') { if ($Fault -eq 'b3-web-unhealthy') { Add-FaultLog 'WEB calisiyor ama /portal/login 500 (sim)'; return 500 }; return 200 }
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
# Get-ServiceState (kanit): servis basina AYRI olcum (Get-SvcMeasure alan basina okur; bir servisin/alanin hatasi digerini kaybettirmez).
function Get-ServiceState {
  $r = [ordered]@{}
  foreach ($svc in @('api', 'web')) { try { $r[$svc] = Get-SvcMeasure $svc } catch { $r[$svc] = [ordered]@{ state = 'OLCULEMEDI'; error = $_.Exception.Message } } }
  if ($TEST) { try { $s = Get-SimState; $r.sim = [ordered]@{ apiRunning = [bool]$s.apiRunning; webRunning = [bool]$s.webRunning; stopCalls = [int]$s.stopCalls; startCalls = [int]$s.startCalls } } catch { $r.simError = $_.Exception.Message } }
  return $r
}
# ---------------------------------------------------------------- DURDURMA + TOPARLAMA (R03-c; yalniz OLCULEN sonuca gore konusur)
# Invoke-B3Stop: durdurmadan ONCE olcum alinir (kosum oncesi durum). ranBefore = ONCE CALISIYOR/KARISIK olculdu; bu kosum durdurmayi
#   DENEDI (komut verildi ya da istisna verdi). Toparlama 'bu kosumda durduruldu' kararini ranBefore + toparlamadaki KAPALI olcumune dayandirir
#   (durma bekleme penceresinden SONRA gerceklesse de; komut istisnasindan bagimsiz). Once KAPALI ya da OLCULEMEDI olan servis otomatik baslatilmaz.
function Invoke-B3Stop([string]$svc) {
  $s = [ordered]@{ before = (Get-SvcMeasure $svc); ranBefore = $false; command = $null; commandError = $null; wait = $null; stopped = $false; stoppedByThisRun = $false; text = $null }
  $s.ranBefore = (@('CALISIYOR', 'KARISIK') -contains [string]$s.before.state)
  try { Invoke-StopTask (Get-SvcTask $svc); $s.command = 'VERILDI' } catch { $s.command = 'ISTISNA'; $s.commandError = $_.Exception.GetType().Name + ': ' + $_.Exception.Message }
  $s.wait = Wait-Stopped (Get-SvcTask $svc) (Get-SvcPort $svc) $svc $(if ($s.command -eq 'VERILDI') { 90 } else { 0 })
  $s.stopped = [bool]$s.wait.stopped
  $s.stoppedByThisRun = ($s.stopped -and $s.ranBefore)
  $s.text = 'once=' + $s.before.state + ' komut=' + $s.command + $(if ($s.commandError) { ' (' + $s.commandError + ')' } else { '' }) + ' durdu=' + $s.stopped + ' olculen=' + $s.wait.last.text
  Say ($svc.ToUpperInvariant() + ' durdurma: ' + $s.text)
  return $s
}
# Invoke-B3StopRecovery: durdurma asamasinda hata -> dosyalara DOKUNULMADI. Karar OTURMUS olcume dayanir (Get-SettledMeasure: OLCULEMEDI/
#   KARISIK ise 30 sn'ye kadar yeniden olcer). Yalniz BU KOSUMDA durdurulmus (once calisiyor, sonra KAPALI) ve simdi KAPALI olculen servis
#   yeniden baslatilir; OLCULEMEDI/KARISIK servise Start VERILMEZ; kosumdan once zaten kapali ya da durumu bilinmeyen servise dokunulmaz.
#   ok, TUM adimlardan SONRA iki servisin tek atista yeniden olculmesine (final 'after') dayanir - eski olcum karar vermez.
function Invoke-B3StopRecovery {
  Set-Stage '2-toparla'
  # dosyalara dokunulmadi: WEB sagligi canli .next'in KENDI BUILD_ID'siyle olculur (R26 BID_LIVE degil; canli hala aday olabilir)
  $curBid = $(try { Get-BuildId $LIVE_NEXT } catch { '' })
  $r = [ordered]@{ ok = $false; filesTouched = $false; liveBuildId = $(if ($curBid) { $curBid } else { 'OKUNAMADI' }); api = $null; web = $null }
  $script:STOP_RECOVERY = $r
  foreach ($svc in @('api', 'web')) {
    $st = $script:STOPS[$svc]
    # bu kosumda durduruldu = kosum ONCE calisiyordu + bu kosum durdurmayi DENEDI + simdi KAPALI (durma bekleme penceresinden sonra da olsa)
    $s = [ordered]@{ stoppedByThisRun = [bool]($null -ne $st -and [bool]$st.ranBefore); decision = $null; action = $null; startError = $null; wait = $null; after = $null; error = $null }
    $r[$svc] = $s
    try {
      $s.decision = Get-SettledMeasure $svc 30
      $ds = [string]$s.decision.state
      if ($ds -eq 'KAPALI' -and $s.stoppedByThisRun) {
        try { Invoke-StartTask (Get-SvcTask $svc); $s.action = 'BASLATMA KOMUTU VERILDI' } catch { $s.action = 'BASLATMA ISTISNASI'; $s.startError = $_.Exception.GetType().Name + ': ' + $_.Exception.Message }
        $s.wait = Wait-SvcHealthy $svc $(if ($s.action -eq 'BASLATMA KOMUTU VERILDI') { $(if ($svc -eq 'api') { 120 } else { 180 }) } else { 15 }) $true $curBid
      } elseif ($ds -eq 'KAPALI') {
        $s.action = 'KAPALI - bu kosumda durdurulmadi (' + $(if ($null -eq $st) { 'durdurma denenmedi' } elseif ([string]$st.before.state -eq 'OLCULEMEDI') { 'kosum oncesi durum OLCULEMEDI (bilinmiyor)' } else { 'kosum oncesi durum ' + [string]$st.before.state }) + '; baslatma OWNER KARARI) - baslatma komutu VERILMEDI'
      } elseif ($ds -eq 'OLCULEMEDI') {
        $s.action = 'OLCULEMEDI - baslatma komutu VERILMEDI'
      } else {
        $s.action = 'YOK (' + $ds + ' - baslatma komutu VERILMEDI)'
      }
    } catch { $s.error = $_.Exception.GetType().Name + ': ' + $_.Exception.Message; if (-not $s.action) { $s.action = 'TOPARLAMA ISTISNASI - baslatma durumu BILINMIYOR' } }
  }
  # final: iki servis TUM adimlardan sonra YENIDEN olculur (API'nin WEB beklemesinden once alinan olcumu karar vermez); tek gecici okuma
  #   hatasi karari degistirmesin diye kisa (15 sn) sureli yeniden olcum; sonunda okunamiyorsa OLCULEMEDI.
  Set-Stage '2-toparla-son'
  foreach ($svc in @('api', 'web')) { try { $r[$svc].after = Wait-SvcHealthy $svc 15 $true $curBid } catch { $r[$svc].after = [ordered]@{ state = 'OLCULEMEDI'; text = 'OLCULEMEDI (' + $_.Exception.Message + ')'; measured = $null } } }
  $r.ok = ($r.api.after.state -eq 'AYAKTA' -and $r.web.after.state -eq 'AYAKTA')
  return $r
}
function Get-B3SvcLine([string]$svc, $s) {
  $n = $svc.ToUpperInvariant()
  if ($null -eq $s -or $null -eq $s.after) { return ($n + ': OLCULEMEDI (toparlama kaydi yok)') }
  $st = $script:STOPS[$svc]
  $stopTxt = $(if ($null -eq $st) { 'DENENMEDI' } else { [string]$st.text })
  $res = $(if ($s.after.state -eq 'AYAKTA' -and $s.action -eq 'BASLATMA KOMUTU VERILDI') { 'yeniden baslatildi (olculdu: AYAKTA)' } elseif ($s.after.state -eq 'AYAKTA') { 'AYAKTA (olculdu)' } else { [string]$s.after.text })
  return ($n + ': durdurma=' + $stopTxt + ' | toparlama=' + $s.action + $(if ($s.startError) { ' (' + $s.startError + ')' } else { '' }) + ' | sonuc=' + $res)
}
# Get-B3MeasureLines: operatorun elle olcumu - HER satir tek basina yapistirilip calisir (WinPS 5.1 + PS 7). -ErrorAction Stop: okuma hatasi
#   bastirilmaz ('0 dinleyici' ile karismaz). Yalniz 'No MSFT_NetTCPConnection objects found' = dinleyici 0; BASKA HER HATA = OLCULEMEDI.
#   Her satir sonucu uc bicimden biriyle YAZAR: sayi/durum, 0 (yalniz 'eslesme yok' - FQID CmdletizationQuery_NotFound; mesaj dile gore degisir)
#   ya da 'OLCULEMEDI: <hata>' (Start VERME). Dinleyici satiri B3 ile ayni birimi sayar (benzersiz OwningProcess).
function Get-B3MeasureLines([string]$svc) {
  $p = Get-SvcPort $svc; $t = Get-SvcTask $svc
  $probe = $(if ($svc -eq 'api') { 'curl.exe -s -o NUL --max-time 10 -w "%{http_code}" http://127.0.0.1:' + $p + '/api/auth/me   # saglikli: 401 ; 000 = baglanti yok' } else { 'curl.exe -s -o NUL --max-time 10 -w "%{http_code}" http://127.0.0.1:' + $p + '/portal/login   # saglikli: 200 ; 000 = baglanti yok' })
  return @(
    ('   try { @(Get-NetTCPConnection -State Listen -LocalPort ' + $p + ' -ErrorAction Stop | Select-Object -ExpandProperty OwningProcess -Unique).Count } catch { if ($_.FullyQualifiedErrorId -like ''CmdletizationQuery_NotFound*'') { 0 } else { ''OLCULEMEDI: '' + $_.Exception.Message } }   # dinleyici PID; saglikli: 1'),
    ('   try { $h = @(Get-CimInstance Win32_Process -Filter "Name=''hukuk-task-host.exe''" -ErrorAction Stop); if (@($h | Where-Object { -not $_.CommandLine }).Count) { ''OLCULEMEDI: komut satiri okunamadi'' } else { @($h | Where-Object { $_.CommandLine -match ''(^|\s)' + $svc + '(\s|$)'' }).Count } } catch { ''OLCULEMEDI: '' + $_.Exception.Message }   # host; saglikli: 1'),
    ('   try { (Get-ScheduledTask -TaskName ' + $t + ' -ErrorAction Stop).State } catch { ''OLCULEMEDI: '' + $_.Exception.Message }   # gorev; saglikli: Running'),
    ('   ' + $probe))
}
# Get-B3SvcSteps: AYAKTA olmayan servis icin OLCULEN duruma gore adim. KAPALI -> Start (+ olcum); OLCULEMEDI -> once olc (Start yalniz
#   gorev Running degil + dinleyici 0 + host 0 ise); CALISIYOR/KARISIK ama saglik yok -> surece elle DOKUNMA, olc, ESCALATE (owner karari).
function Get-B3SvcSteps([string]$svc, $h, [string]$preNote = '') {
  $t = Get-SvcTask $svc; $n = $svc.ToUpperInvariant()
  if ($null -eq $h) { $h = [ordered]@{ state = 'OLCULEMEDI' } }
  if ($h.state -eq 'AYAKTA') { return @() }
  $ml = Get-B3MeasureLines $svc
  if ($h.state -eq 'OLCULEMEDI') { return @(('YUKSELTILMIS: ' + $n + ' durumu OLCULEMEDI - Start VERMEDEN once olcun (asagidaki satirlar tek tek); Start YALNIZ gorev Running DEGIL + dinleyici 0 + host 0 ise: Start-ScheduledTask -TaskName ' + $t + ' ; herhangi bir satir OLCULEMEDI yazarsa Start VERME, ESCALATE.')) + $ml }
  $ms = $(if ($h.measured) { [string]$h.measured.state } else { 'BILINMIYOR' })
  if ($ms -eq 'KAPALI') { return @(('YUKSELTILMIS: ' + $(if ($preNote) { $preNote + ' - ' } else { '' }) + 'Start-ScheduledTask -TaskName ' + $t + ' ; ardindan olcun (asagidaki satirlar):')) + $ml }
  return @(('YUKSELTILMIS: ' + $n + ' ' + $ms + ' ama saglik tutmadi - surece elle DOKUNMA (Stop/Start yok); olcun (asagidaki satirlar) ve ESCALATE (owner karari).')) + $ml
}
function Get-B3StopRecoveryText($r) {
  $lines = @('VERDICT DURDURMA-BASARISIZ-TOPARLANAMADI - canli dosyalara DOKUNULMADI (geri yukleme BASLAMADI; GERI DONUS YAPILMADI); servis durumu OLCUME gore:')
  foreach ($svc in @('api', 'web')) { $lines += ('   ' + (Get-B3SvcLine $svc $(if ($r) { $r[$svc] } else { $null }))) }
  $i = 1
  foreach ($svc in @('api', 'web')) {
    $x = $(if ($r) { $r[$svc] } else { $null })
    $pre = $(if ($x -and [string]$x.action -like 'KAPALI - bu kosumda durdurulmadi*') { $st2 = $script:STOPS[$svc]; $svc.ToUpperInvariant() + ' bu kosumda DURDURULMADI (' + $(if ($null -eq $st2) { 'durdurma denenmedi' } else { 'kosum oncesi durum ' + [string]$st2.before.state }) + '; simdi KAPALI): baslatma OWNER KARARI' } else { '' })
    $steps = @(Get-B3SvcSteps $svc $(if ($x) { $x.after } else { $null }) $pre)
    for ($k = 0; $k -lt $steps.Count; $k++) { if ($k -eq 0) { $lines += ($i.ToString() + ') ' + $steps[$k]); $i++ } else { $lines += $steps[$k] } }
  }
  $lines += ($i.ToString() + ') Durdurma sorunu (kanit stops) giderilmeden B3 YENIDEN KOSULMAZ; ESCALATE.')
  return $lines
}
function Get-StartRecoveryText($h) {
  $lines = @('VERDICT ROLLBACK-OK-ESKI-BASLAMADI - dosyalar TABAN kimliginde DOGRULANDI (4-kimlik PASS; dosya islemi GEREKMEZ, B3 YENIDEN KOSULMAZ); servis durumu OLCUME gore (son olcum):')
  foreach ($svc in @('api', 'web')) {
    $x = $h[$svc]; $cmd = $(if ($h.startAttempts -and $h.startAttempts[$svc]) { [string]$h.startAttempts[$svc] } else { 'BILINMIYOR' })
    $lines += ('   ' + $svc.ToUpperInvariant() + ': baslatma komutu=' + $cmd + ' | sonuc=' + $(if ($x) { [string]$x.text } else { 'OLCULEMEDI' }))
  }
  $i = 1; $down = $false
  foreach ($svc in @('api', 'web')) {
    $steps = @(Get-B3SvcSteps $svc $h[$svc]); if ($steps.Count) { $down = $true }
    for ($k = 0; $k -lt $steps.Count; $k++) { if ($k -eq 0) { $lines += ($i.ToString() + ') ' + $steps[$k]); $i++ } else { $lines += $steps[$k] } }
  }
  if (-not [bool]$h.tupleUnchanged) { $lines += ($i.ToString() + ') Kapsam: baslatici uclusu ' + $(if ([string]$h.tuple -like 'OLCULMEDI*') { 'OLCULMEDI' } else { '1-yedek-butunluk sonrasi DEGISTI ya da okunamadi' }) + ' (' + [string]$h.tuple + ') - ESCALATE.'); $i++ }
  if ($down) { $lines += ($i.ToString() + ') Gelmezse ESCALATE: gorev/launcher/log incelemesi; sonra salt okuma olcumu (yukaridaki olcum satirlari).') }
  return $lines
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
# Get-RecoveryText: YALNIZ 11/12 (servis BASLATILMADI - kimlik dogrulanmadan baslatma yok). 13 metni Get-StartRecoveryText'tir (olcume dayali).
function Get-RecoveryText([string]$verdict) {
  return @(
    ('VERDICT ' + $verdict + ' - SERVISLER BASLATILMADI (kimlik dogrulanmadan baslatma YOK). ESCALATE.'),
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
    testMode = [ordered]@{ enabled = $TEST; testRoot = $(if ($TEST) { $TestRoot } else { $null }); fault = $(if ($Fault) { $Fault } else { $null }); faultLog = @($script:FAULT_LOG); simulated = @('elevation', 'tasks', 'listeners', 'http', 'launcher-tuple') }
    quarantineDir = $QUAR; failedNextDir = $FAILED_NEXT; launcherTuple = $script:tuple0; backupApiDir = $BackupApiDir; backupWebDir = $BackupWebDir
    expected = [ordered]@{ apiTree = $EXP_LIVE; pkg = $EXP_BK_PKG; webTree = $EXP_WEB_LIVE; buildId = $BID_LIVE; cfg = $CFG_LIVE }
    stops = $script:STOPS; stopRecovery = $script:STOP_RECOVERY
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
  $needed = @('Say', 'Set-Stage', 'Get-R26FileSha256', 'Get-Map', 'Get-TreeDigest', 'Get-PackageDigest', 'Get-Pids', 'Wait-Stopped', 'Http', 'Get-LauncherTuple', 'Get-BuildId', 'Test-RestoredIdentity', 'Write-EvidenceProtected', 'Get-RecoveryText', 'Invoke-StopTask', 'Invoke-StartTask', 'Test-Elevated',
              'Get-HostCount', 'Get-SvcMeasure', 'Get-SettledMeasure', 'Wait-SvcHealthy', 'Invoke-B3Stop', 'Invoke-B3StopRecovery', 'Get-B3SvcLine', 'Get-B3MeasureLines', 'Get-B3SvcSteps', 'Get-B3StopRecoveryText', 'Get-StartRecoveryText', 'Get-ServiceState')
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
    if ($TEST -and $Fault -eq 'b3-api-down-before') { $s0 = Get-SimState; $s0.apiRunning = $false; Set-SimState $s0; Add-FaultLog '0-kapilar: API kosum oncesi KAPALI (sim)' }
    if ($TEST -and $Fault -eq 'b3-web-down-before') { $s0 = Get-SimState; $s0.webRunning = $false; Set-SimState $s0; Add-FaultLog '0-kapilar: WEB kosum oncesi KAPALI (sim)' }
    if (-not (Test-Elevated)) { throw 'KAPI: yukseltilmis pencere gerekli - DUR' }
    Set-Stage '1-yedek-butunluk'
    if ($bkErr) { throw ('KAPI: yedek butunlugu olculemedi - GERI ALMA BASLAMAZ: ' + $bkErr) }
    if (-not $bkOk) { throw 'KAPI: yedek kimligi dogrulanamadi - GERI ALMA BASLAMAZ' }
    if (-not $pinOk) { throw 'KAPI: baslatici/host uclusu tanimli iki durumdan biri degil - DUR' }
    if ((Get-R26FileSha256 (Join-Path $LIVE_API '.env')) -cne $ENV_PIN) { throw 'KAPI: canli .env sha pin degil - DUR' }
    New-Item -ItemType Directory -Force -Path $EVID_DIR | Out-Null

    Set-Stage '2-durdur-web'
    $script:STOPS['web'] = Invoke-B3Stop 'web'
    if (-not $script:STOPS['web'].stopped) { throw ('KAPI: WEB durdurulamadi ya da kapandigi OLCULEMEDI (' + $script:STOPS['web'].wait.state + ') - DOSYALARA DOKUNULMADI; toparlama olculecek') }
    Set-Stage '2-durdur-api'
    $script:STOPS['api'] = Invoke-B3Stop 'api'
    if (-not $script:STOPS['api'].stopped) { throw ('KAPI: API durdurulamadi ya da kapandigi OLCULEMEDI (' + $script:STOPS['api'].wait.state + ') - DOSYALARA DOKUNULMADI; WEB durdurma: ' + $script:STOPS['web'].text + '; toparlama olculecek') }
    Say 'WEB ve API kapandi (olculdu: KAPALI)'
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

    # R03-c: iki servisin baslatma girisimi AYRI; birinin istisnasi ya da okuma hatasi digerini ATLATMAZ (dosyalar TABAN dogrulandi).
    # Saglik beklemesi okuma hatasinda sure dolana kadar YENIDEN olcer; sonunda okunamiyorsa OLCULEMEDI (AYAKTA/KAPALI denmez).
    $sa = [ordered]@{ api = $null; web = $null }
    Set-Stage '5-baslat-api'
    try { Invoke-StartTask $API_TASK; $sa.api = 'VERILDI' } catch { $sa.api = 'ISTISNA: ' + $_.Exception.Message; Say ('HATA [5-baslat-api]: API baslatma komutu istisna - WEB baslatma girisimi YINE yapilacak: ' + $_.Exception.Message) }
    # istisna baslatmanin OLMADIGINI kanitlamaz: istisnada da kisa (15 sn) yeniden olcum; Start tekrar VERILMEZ
    $ha = Wait-SvcHealthy 'api' $(if ($sa.api -eq 'VERILDI') { 120 } else { 15 }) $true
    Set-Stage '5-baslat-web'
    try { Invoke-StartTask $WEB_TASK; $sa.web = 'VERILDI' } catch { $sa.web = 'ISTISNA: ' + $_.Exception.Message; Say ('HATA [5-baslat-web]: WEB baslatma komutu istisna: ' + $_.Exception.Message) }
    $hw = Wait-SvcHealthy 'web' $(if ($sa.web -eq 'VERILDI') { 180 } else { 15 }) $true
    Say ('baslatma sonrasi: API komut=' + $sa.api + ' -> ' + $ha.text + ' | WEB komut=' + $sa.web + ' -> ' + $hw.text)
    Set-Stage '6-kapsam'
    # KARAR SON OLCUME dayanir: iki servis burada tek atista YENIDEN olculur (API'nin WEB beklemesinden once alinan olcumu eskimis olabilir)
    $fa = Wait-SvcHealthy 'api' 15 $true; $fw = Wait-SvcHealthy 'web' 15 $true   # kisa sureli yeniden olcum: tek gecici okuma hatasi karari degistirmez
    $tuple1 = $(try { Get-LauncherTuple } catch { 'OLCULEMEDI: ' + $_.Exception.Message })
    $tupleOk = ($tuple1 -ceq $script:tuple0)
    Say ('son olcum: API ' + $fa.text + ' | WEB ' + $fw.text + ' | baslatici uclusu degismedi=' + $tupleOk + ' (' + $tuple1 + ')')
    $ok = ($fa.state -eq 'AYAKTA' -and $fw.state -eq 'AYAKTA' -and $tupleOk)
    $script:health = [ordered]@{ ok = $ok; startAttempts = $sa; api = $fa; web = $fw; postStart = [ordered]@{ api = $ha; web = $hw }; tupleUnchanged = $tupleOk; tuple = $tuple1 }
    if ($ok) { $script:VERDICT = 'ROLLBACK PASS'; $script:EXIT = 0; Say 'GERI DONUS TAMAMLANDI (son olcum: dosyalar TABAN + API ve WEB AYAKTA + uclu degismedi)' }
    else {
      $script:VERDICT = 'ROLLBACK-OK-ESKI-BASLAMADI'; $script:EXIT = 13; $script:RECOVERY = Get-StartRecoveryText $script:health
      Say ('GERI DONUS TAMAMLANMADI: dosyalar TABAN dogrulandi; son olcum API=' + $fa.state + ' WEB=' + $fw.state + ' ; uclu degismedi=' + $tupleOk + ' (KURTARMA satirlari)')
    }
  } catch {
    if ($_.Exception.Message -ne 'KIMLIK-FAIL') {
      $script:ERR = $_.Exception.Message; $script:FAILED_AT = $script:STAGE
      Say ('HATA [' + $script:STAGE + ']: ' + $script:ERR)
      if (-not $script:SERVICES_STOPPED) {
        if ($script:STAGE -like '2-durdur*') {
          # R03-c: durdurma hatasi -> dosyalara DOKUNULMADI; toparlama OLCULUR (21 yalniz iki servis AYAKTA olculurse; aksi 22 + KURTARMA)
          $rec = $null; try { $rec = Invoke-B3StopRecovery } catch { Say ('toparlama istisnasi: ' + $_.Exception.Message); $rec = $script:STOP_RECOVERY; if ($rec) { $rec.ok = $false } }
          $script:STOP_RECOVERY = $rec
          $sum = ((@('api', 'web') | ForEach-Object { Get-B3SvcLine $_ $(if ($rec) { $rec[$_] } else { $null }) }) -join ' ; ')
          if ($null -ne $rec -and [bool]$rec.ok) { $script:VERDICT = 'DURDURMA-BASARISIZ'; $script:EXIT = 21; Say ('canli dosyalara DOKUNULMADI; TOPARLAMA OLCULDU (iki servis AYAKTA): ' + $sum); Say 'GERI DONUS YAPILMADI (canli dosyalar B3 oncesiyle ayni) - ESCALATE: durdurma nedeni kanitta (stops)' }
          else { $script:VERDICT = 'DURDURMA-BASARISIZ-TOPARLANAMADI'; $script:EXIT = 22; $script:RECOVERY = Get-B3StopRecoveryText $rec; Say ('canli dosyalara DOKUNULMADI; TOPARLAMA TAMAMLANAMADI: ' + $sum) }
        } else { $script:VERDICT = 'KAPIDA-DURDU'; $script:EXIT = 20; Say 'canli dosyalara DOKUNULMADI' }
      } elseif ($script:STAGE -like '3-*' -or $script:STAGE -eq '4-kimlik') {
        if ($script:RESTORE_STEPS) { foreach ($k in @($script:RESTORE_STEPS.Keys)) { if ($script:RESTORE_STEPS[$k] -eq 'BASLADI') { $script:RESTORE_STEPS[$k] = 'BASARISIZ: ' + $script:ERR } elseif ($script:RESTORE_STEPS[$k] -eq 'BEKLIYOR') { $script:RESTORE_STEPS[$k] = 'KALAN' } } }
        $script:VERDICT = 'ROLLBACK-ENGELLENDI'; $script:EXIT = 12; $script:RECOVERY = Get-RecoveryText $script:VERDICT
        Say 'geri yukleme yarim kaldi - SERVIS BASLATILMIYOR, kalan adimlar kanitta, ESCALATE'
      } else {
        # kimlik DOGRULANDIKTAN sonra BEKLENMEYEN hata: metin olcume dayanir (baslatildi iddiasi yok); servisler simdi olculur
        $script:VERDICT = 'ROLLBACK-OK-ESKI-BASLAMADI'; $script:EXIT = 13
        $hx = [ordered]@{ ok = $false; startAttempts = $(if ($sa) { $sa } else { [ordered]@{ api = 'BILINMIYOR (beklenmeyen hata)'; web = 'BILINMIYOR (beklenmeyen hata)' } }); api = $null; web = $null; tupleUnchanged = $false; tuple = 'OLCULMEDI (beklenmeyen hata)' }
        foreach ($svc in @('api', 'web')) { try { $hx[$svc] = Wait-SvcHealthy $svc 0 $false } catch { $hx[$svc] = [ordered]@{ state = 'OLCULEMEDI'; text = 'OLCULEMEDI (' + $_.Exception.Message + ')'; measured = $null } } }
        $script:health = $hx; $script:RECOVERY = Get-StartRecoveryText $hx
        Say ('GERI DONUS TAMAMLANMADI (beklenmeyen hata sonrasi olcum): API=' + [string]$hx.api.state + ' WEB=' + [string]$hx.web.state + ' (KURTARMA satirlari)')
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
