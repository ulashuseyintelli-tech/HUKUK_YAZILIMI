param([switch]$SelfTest)
$ErrorActionPreference = 'Stop'
# =============================================================================
# R26 YAYIN - API + WEB BIRLIKTE - OWNER ELEVATED KOSUM. Saf ASCII.
# -SelfTest : CANLIYA DOKUNMAZ (durdurma/takas/kopyalama/yazma YOK). Yardimci fonksiyonlari ve salt-okuma
#             kimlik olcumlerini dogrular, sonra cikar. Yayin icin PARAMETRESIZ kosulur.
# Aday kaynagi c7a154b3 (dal release/r26-candidate) = 4443600a (R25B'yi bit-bit ureten kaynak)
#   + #2739 web + #2738 portal.service + #2740 (799a7346, OFFICE-AUTH-01). DAHIL DEGIL: #2716 replay adapter,
#   #2727 migration, #2730 (davranis-notr refactor; trust proxy=1 canlida ZATEN var).
# API: BIRLESIK ARTEFAKT = canli R25B 1524EDC1 + YALNIZ 2 dosya (portal.service.js + .map).
# WEB: .next TAM TAKAS (BUILD_ID dOiGPj2M -> 5waeMoFG) + next.config.js (fallback /api rewrite).
# BASLATICI: P1-ONCESI ya da P1-SONRASI uclusunden TAM BIRI olmali; betikler baslatici DEGISTIRMEZ.
# migrate deploy YOK ; pinli launcher'lar DEGISMEZ ; .env OKUNMAZ (yalniz sha) ; DB yazimi YOK ; SILME YOK.
# Basarisizlikta: dosyalara dokunulmadan DUR, ya da takas sonrasi otomatik GERI ALMA (API + WEB birlikte).
# Internet erisimi bu paketin KAPSAMI DISINDA: kenar/tunel/DNS/.env anahtari YOK.
# =============================================================================
$ROOT      = 'C:\Development\HUKUK_YAZILIMI\HY_W4_RELEASE23'
$LIVE_API  = Join-Path $ROOT 'project\apps\api'
$LIVE      = Join-Path $LIVE_API 'dist\apps\api\src'
$CAND      = 'D:\Development\HUKUK_YAZILIMI\HY_WT_R26\project\apps\api\dist\apps\api\src'
$EXP_CAND  = 'A8B17A38327975C71DDAE82FE33D1E97CB8B339FB1E35D1828FCF8D0CEB053A0'
$EXP_LIVE  = '1524EDC15C636B39507DD9520206E3065E6A353A531D82D4362DFE115FC04D4E'
$EXP_PKG_CAND = 'D0AFE2E995675F9776A96304BE155962ACF8336D16500833A4E07BB8A28427FF'
$EXP_PKG_LIVE = '9F58C98545056B59963111DE603223F8896C4EEB9E4543898BA7F9C561A2FB2F'
$FILES = @('modules/portal/portal.service.js', 'modules/portal/portal.service.js.map')
$LIVE_WEB  = Join-Path $ROOT 'project\apps\web'
$LIVE_NEXT = Join-Path $LIVE_WEB '.next'
$LIVE_CFG  = Join-Path $LIVE_WEB 'next.config.js'
$CAND_WEB  = 'D:\Development\HUKUK_YAZILIMI\HY_WT_R26\project\apps\web'
$CAND_NEXT = Join-Path $CAND_WEB '.next'
$CAND_CFG  = Join-Path $CAND_WEB 'next.config.js'
$EXP_WEB_LIVE = 'F064DC95CBCCA6218E8D5E84A89A6472F03AF54994E425E28A02B135956282F1'
$EXP_WEB_CAND = 'C17E7B132FB7DED65AD0788024AA478F0949AF0D5D9045E8F47779A31A615326'
$BID_LIVE  = 'dOiGPj2M0Abls0kCibY4r'
$BID_CAND  = '5waeMoFGGMTLAYmn9oJvW'
$CFG_LIVE  = '4AD4915C0A741AF609CCD241DFE08EF2C76A17E2175E3BD1FB7AE925128EF750'
$CFG_CAND  = 'C43DEB5A04F1529CE2D368204ED7D10B8DBC257327E0BC64A01F1D7CF3AC5B5C'
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
$PORTAL_MAPPED = 'Mapped {/api/portal/documents/upload, POST} route'
$ts = (Get-Date).ToUniversalTime().ToString('yyyyMMdd-HHmmss') + 'Z'
$EVID_DIR = 'D:\Development\HUKUK_YAZILIMI\HY_R26_RELEASE_EVIDENCE'
$BK_API = Join-Path $EVID_DIR ('rollback-api-src-R25B-' + $ts)
$BK_WEB = Join-Path $EVID_DIR ('rollback-web-R25B-' + $ts)
$STAGED = Join-Path $LIVE_WEB ('.next.r26-staged-' + $ts)
$PRE    = Join-Path $LIVE_WEB ('.next.pre-r26-' + $ts)
$log = New-Object System.Collections.Generic.List[string]
function Say([string]$m) { $line = ((Get-Date).ToUniversalTime().ToString('HH:mm:ss') + 'Z  ' + $m); Write-Host $line; $log.Add($line) }
function Get-R26FileSha256([string]$p) { return (Get-FileHash -Algorithm SHA256 -LiteralPath $p).Hash }
# Web agaci: cache/ ve trace HARIC (next start'in yazabildigi yerler; derleme kimligine dahil DEGIL)
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
  # ORDINAL siralama (kabuk/kultur bagimsiz; PS 5.1 ve pwsh 7 ayni digest; R25 ile ayni tarif)
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
    $state = (Get-ScheduledTask -TaskName $task).State
    if ($listen.Count -eq 0 -and $procs.Count -eq 0 -and $state -ne 'Running') { return $true }
    Start-Sleep -Seconds 2
  }
  return $false
}
function Http([string]$method, [string]$url, [int]$timeoutMs = 8000) {
  try {
    $r = [Net.HttpWebRequest]::Create($url); $r.Method = $method; $r.Timeout = $timeoutMs; $r.ReadWriteTimeout = $timeoutMs
    $r.AllowAutoRedirect = $false; $r.UserAgent = 'r26-release-check'
    if ($method -eq 'POST') { $r.ContentType = 'application/json'; $b = [Text.Encoding]::UTF8.GetBytes('{}'); $r.ContentLength = $b.Length; $s = $r.GetRequestStream(); $s.Write($b, 0, $b.Length); $s.Dispose() }
    $resp = $r.GetResponse(); $code = [int]$resp.StatusCode; $resp.Dispose(); return $code
  } catch [Net.WebException] {
    if ($_.Exception.Response) { return [int]([Net.HttpWebResponse]$_.Exception.Response).StatusCode }
    return -1
  } catch { return -2 }
}
function Get-PackageDigest([string]$root) {
  $m = [ordered]@{}
  foreach ($rel in $FILES) { $m[$rel] = Get-R26FileSha256 (Join-Path $root ($rel -replace '/', '\')) }
  return Get-TreeDigest $m
}
# Yeni olusan dizin kokten KALITIM almali (korumali degil, acik kural 0) - canli .next ile ayni ACL modeli
function Test-InheritOnly([string]$p) {
  $a = Get-Acl -LiteralPath $p
  return ((-not $a.AreAccessRulesProtected) -and (@($a.Access | Where-Object { -not $_.IsInherited }).Count -eq 0))
}
function Get-LauncherTuple {
  $a = Get-R26FileSha256 $API_LAUNCHER; $h = Get-R26FileSha256 $HOST_EXE; $w = Get-R26FileSha256 $WEB_LAUNCHER
  foreach ($t in $LAUNCH_TUPLES) { if ($a -ceq $t.api -and $h -ceq $t.host -and $w -ceq $t.web) { return $t.name } }
  return ('TANIMSIZ api=' + $a.Substring(0, 8) + ' host=' + $h.Substring(0, 8) + ' web=' + $w.Substring(0, 8))
}
function Get-BuildId([string]$nextDir) { return (Get-Content -Raw -LiteralPath (Join-Path $nextDir 'BUILD_ID')).Trim() }
function Restore-All {
  Say 'GERI ALMA: API 2 dosya + WEB .next + next.config.js yedekten'
  foreach ($rel in $FILES) {
    Copy-Item -LiteralPath (Join-Path $BK_API ($rel -replace '/', '\')) -Destination (Join-Path $LIVE ($rel -replace '/', '\')) -Force
  }
  $aOk = ((Get-TreeDigest (Get-Map $LIVE)) -ceq $EXP_LIVE)
  $webNow = if (Test-Path -LiteralPath $LIVE_NEXT) { Get-TreeDigest (Get-Map $LIVE_NEXT -Web) } else { 'YOK' }
  if ($webNow -cne $EXP_WEB_LIVE) {
    if (Test-Path -LiteralPath $LIVE_NEXT) { Move-Item -LiteralPath $LIVE_NEXT -Destination (Join-Path $LIVE_WEB ('.next.r26-failed-' + $ts)) }
    if (Test-Path -LiteralPath $PRE) { Move-Item -LiteralPath $PRE -Destination $LIVE_NEXT }
    else {
      $global:LASTEXITCODE = 0
      & robocopy.exe (Join-Path $BK_WEB '.next') $LIVE_NEXT /E /R:0 /W:0 /NFL /NDL /NJH /NJS | Out-Null
      if ($LASTEXITCODE -ge 8) { Say ('HATA: web yedek geri kopyalama robocopy ' + $LASTEXITCODE) }
    }
  }
  Copy-Item -LiteralPath (Join-Path $BK_WEB 'next.config.js') -Destination $LIVE_CFG -Force
  $wOk = ((Get-TreeDigest (Get-Map $LIVE_NEXT -Web)) -ceq $EXP_WEB_LIVE) -and ((Get-R26FileSha256 $LIVE_CFG) -ceq $CFG_LIVE) -and ((Get-BuildId $LIVE_NEXT) -ceq $BID_LIVE)
  Say ('GERI ALMA sonrasi: api taban esit=' + $aOk + ' | web taban esit (digest+cfg+BUILD_ID)=' + $wOk)
  return ($aOk -and $wOk)
}
function Start-Both-And-Report {
  Start-ScheduledTask -TaskName $API_TASK
  $d = (Get-Date).AddSeconds(120); $me = -1
  while ((Get-Date) -lt $d) { if ((Get-Pids $API_PORT).Count -ge 1) { $me = Http 'GET' ('http://127.0.0.1:' + $API_PORT + '/api/auth/me'); if ($me -gt 0) { break } }; Start-Sleep -Seconds 3 }
  Start-ScheduledTask -TaskName $WEB_TASK
  $d = (Get-Date).AddSeconds(180); $pl = -1
  while ((Get-Date) -lt $d) { if ((Get-Pids $WEB_PORT).Count -ge 1) { $pl = Http 'GET' ('http://127.0.0.1:' + $WEB_PORT + '/portal/login'); if ($pl -gt 0) { break } }; Start-Sleep -Seconds 3 }
  Say ('baslatma sonrasi: api /api/auth/me=' + $me + ' | web /portal/login=' + $pl)
  return ($me -eq 401 -and $pl -eq 200)
}

if ($SelfTest) {
  Say '=== SELFTEST (canliya dokunmaz: durdurma/takas/kopyalama/yazma YOK)'
  $fails = 0
  $cmd = Get-Command Get-R26FileSha256 -ErrorAction SilentlyContinue
  $isFunc = ($null -ne $cmd -and $cmd.CommandType -eq 'Function')
  Say ('ad cozumleme: Get-R26FileSha256 -> ' + $(if ($cmd) { [string]$cmd.CommandType } else { 'YOK' }) + ' | fonksiyon=' + $isFunc)
  if (-not $isFunc) { $fails++ }
  $al = @('Get-R26FileSha256', 'Get-Map', 'Http', 'Say') | Where-Object { Get-Alias -Name $_ -ErrorAction SilentlyContinue }
  Say ('alias golgesi=' + $(if ($al) { 'VAR: ' + ($al -join ',') } else { 'YOK' }))
  if ($al) { $fails++ }
  $hA = Get-R26FileSha256 $API_LAUNCHER; $okH = ($hA -ceq (Get-FileHash -Algorithm SHA256 -LiteralPath $API_LAUNCHER).Hash)
  $tu = Get-LauncherTuple
  Say ('hash yardimcisi Get-FileHash ile ayni=' + $okH + ' | baslatici uclusu=' + $tu + ' (kabul: P1-ONCESI | P1-SONRASI)')
  if (-not $okH -or $tu.StartsWith('TANIMSIZ')) { $fails++ }
  try { $hE = Get-R26FileSha256 (Join-Path $LIVE_API '.env'); Say ('.env (yalniz sha): pin esit=' + ($hE -ceq $ENV_PIN)); if ($hE -cne $ENV_PIN) { $fails++ } }
  catch { Say ('.env sha OLCULEMEDI (yetki?): ' + $_.Exception.GetType().Name + ' - yayin kosumu yukseltilmis pencerede olcer'); }
  $cA = Get-TreeDigest (Get-Map $CAND); Say ('aday API digest=' + $cA + ' | pin esit=' + ($cA -ceq $EXP_CAND)); if ($cA -cne $EXP_CAND) { $fails++ }
  $cP = Get-PackageDigest $CAND; Say ('aday API paket (2 dosya)=' + $cP + ' | pin esit=' + ($cP -ceq $EXP_PKG_CAND)); if ($cP -cne $EXP_PKG_CAND) { $fails++ }
  $lA = Get-TreeDigest (Get-Map $LIVE); Say ('canli API digest=' + $lA + ' | taban esit=' + ($lA -ceq $EXP_LIVE)); if ($lA -cne $EXP_LIVE) { $fails++ }
  $lP = Get-PackageDigest $LIVE; Say ('canli API paket (2 dosya)=' + $lP + ' | pin esit=' + ($lP -ceq $EXP_PKG_LIVE)); if ($lP -cne $EXP_PKG_LIVE) { $fails++ }
  $cW = Get-TreeDigest (Get-Map $CAND_NEXT -Web); Say ('aday WEB .next digest=' + $cW + ' | pin esit=' + ($cW -ceq $EXP_WEB_CAND) + ' | BUILD_ID=' + (Get-BuildId $CAND_NEXT) + ' | cfg pin esit=' + ((Get-R26FileSha256 $CAND_CFG) -ceq $CFG_CAND))
  if ($cW -cne $EXP_WEB_CAND -or (Get-BuildId $CAND_NEXT) -cne $BID_CAND -or (Get-R26FileSha256 $CAND_CFG) -cne $CFG_CAND) { $fails++ }
  $lW = Get-TreeDigest (Get-Map $LIVE_NEXT -Web); Say ('canli WEB .next digest=' + $lW + ' | taban esit=' + ($lW -ceq $EXP_WEB_LIVE) + ' | BUILD_ID=' + (Get-BuildId $LIVE_NEXT) + ' | cfg taban esit=' + ((Get-R26FileSha256 $LIVE_CFG) -ceq $CFG_LIVE))
  if ($lW -cne $EXP_WEB_LIVE -or (Get-BuildId $LIVE_NEXT) -cne $BID_LIVE -or (Get-R26FileSha256 $LIVE_CFG) -cne $CFG_LIVE) { $fails++ }
  $inh = Test-InheritOnly $LIVE_NEXT; Say ('canli .next ACL yalniz kalitim=' + $inh); if (-not $inh) { $fails++ }
  $me0 = Http 'GET' ('http://127.0.0.1:' + $API_PORT + '/api/auth/me'); $pl0 = Http 'GET' ('http://127.0.0.1:' + $WEB_PORT + '/portal/login')
  $rw0 = Http 'GET' ('http://127.0.0.1:' + $WEB_PORT + '/api/auth/me')
  Say ('Http: api /api/auth/me=' + $me0 + ' | web /portal/login=' + $pl0 + ' | web /api/auth/me (bugun rewrite YOK, 404 beklenir)=' + $rw0)
  if ($me0 -ne 401 -or $pl0 -ne 200) { $fails++ }
  $apiP = Get-Pids $API_PORT; $webP = Get-Pids $WEB_PORT
  Say ('dinleyici: :' + $API_PORT + '=' + ($apiP -join ',') + ' :' + $WEB_PORT + '=' + ($webP -join ','))
  if ($apiP.Count -ne 1 -or $webP.Count -ne 1) { $fails++ }
  $rc = Get-Command robocopy.exe -ErrorAction SilentlyContinue; Say ('robocopy=' + [bool]$rc); if (-not $rc) { $fails++ }
  $needed = @('Say', 'Get-R26FileSha256', 'Get-Map', 'Get-TreeDigest', 'Get-Pids', 'Wait-Stopped', 'Http', 'Get-PackageDigest', 'Test-InheritOnly', 'Get-LauncherTuple', 'Get-BuildId', 'Restore-All', 'Start-Both-And-Report')
  $missing = @($needed | Where-Object { -not (Get-Command $_ -CommandType Function -ErrorAction SilentlyContinue) })
  Say ('fonksiyon kumesi tam=' + ($missing.Count -eq 0) + $(if ($missing.Count) { ' eksik: ' + ($missing -join ',') } else { '' }))
  if ($missing.Count) { $fails++ }
  Say ('=== SELFTEST SONUC: ' + $(if ($fails -eq 0) { 'PASS' } else { 'FAIL ' + $fails }))
  if ($fails -ne 0) { exit 1 }
  exit 0
}

Say '=== 0) ON KAPILAR'
if (-not (New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw 'KAPI: yukseltilmis pencere gerekli - DUR' }
New-Item -ItemType Directory -Force -Path $EVID_DIR | Out-Null
foreach ($p in @($BK_API, $BK_WEB, $STAGED, $PRE)) { if (Test-Path -LiteralPath $p) { throw ('KAPI: hedef zaten var: ' + $p + ' - DUR') } }
$tuple0 = Get-LauncherTuple
Say ('baslatici uclusu=' + $tuple0)
if ($tuple0.StartsWith('TANIMSIZ')) { throw 'KAPI: baslatici/host uclusu tanimli iki durumdan biri degil (yarim P1?) - DUR' }
$envSha0 = Get-R26FileSha256 (Join-Path $LIVE_API '.env')
if ($envSha0 -cne $ENV_PIN) { throw 'KAPI: canli .env sha pin degil - DUR' }
$actA0 = ((Get-ScheduledTask -TaskName $API_TASK).Actions | ForEach-Object { $_.Execute + ' ' + $_.Arguments }) -join ' ; '
$actW0 = ((Get-ScheduledTask -TaskName $WEB_TASK).Actions | ForEach-Object { $_.Execute + ' ' + $_.Arguments }) -join ' ; '
$apiP0 = Get-Pids $API_PORT; $webP0 = Get-Pids $WEB_PORT
Say ('API gorev action=' + $actA0 + ' pid=' + ($apiP0 -join ',') + ' | WEB gorev action=' + $actW0 + ' pid=' + ($webP0 -join ','))
if ($apiP0.Count -ne 1 -or $webP0.Count -ne 1) { throw 'KAPI: :8080 ya da :3002 dinleyici sayisi 1 degil - DUR' }
foreach ($pp in @($apiP0[0], $webP0[0])) { if ((Get-CimInstance Win32_Process -Filter ("ProcessId=" + $pp)).CommandLine -notmatch 'HY_W4_RELEASE23') { throw 'KAPI: canli surec RELEASE23 kokunden degil - DUR' } }
$rogue = @(Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -and $_.CommandLine -match 'i1[2-6]-live|i12-cron|i12-window|i15-kabul|smtp-sink|i3-sink|i3-spy|edge-proxy|r26-dar-kabul|r26-live-portal|c-run\.js|c-setup\.js|c-99-close|c-start-api|P1-delivery|Preflight\.ps1' })
Say ('test/prova sureci=' + $rogue.Count)
if ($rogue.Count -ne 0) { throw 'KAPI: canli pencerede test/prova sureci var - DUR' }

Say '=== 1) ADAY DOGRULAMA'
$candMap = Get-Map $CAND; $candDig = Get-TreeDigest $candMap
Say ('aday API dosya=' + $candMap.Count + ' digest=' + $candDig)
if ($candDig -cne $EXP_CAND) { throw 'KAPI: aday API digest beklenen degil - DUR' }
if ((Get-PackageDigest $CAND) -cne $EXP_PKG_CAND) { throw 'KAPI: aday API paket digest pin degil - DUR' }
$cW = Get-TreeDigest (Get-Map $CAND_NEXT -Web)
Say ('aday WEB .next digest=' + $cW + ' | BUILD_ID=' + (Get-BuildId $CAND_NEXT))
if ($cW -cne $EXP_WEB_CAND -or (Get-BuildId $CAND_NEXT) -cne $BID_CAND) { throw 'KAPI: aday WEB kimligi pin degil - DUR' }
if ((Get-R26FileSha256 $CAND_CFG) -cne $CFG_CAND) { throw 'KAPI: aday next.config.js pin degil - DUR' }

Say '=== 2) CANLI KIMLIK + DOGRULANMIS YEDEK + WEB HAZIRLIK KOPYASI (canli calisirken; takas YOK)'
$liveMap0 = Get-Map $LIVE; $liveDig0 = Get-TreeDigest $liveMap0
Say ('canli API dosya=' + $liveMap0.Count + ' digest=' + $liveDig0)
if ($liveDig0 -cne $EXP_LIVE) { throw 'KAPI: canli API digest taban degil - DUR' }
$diffAdd = @($candMap.Keys | Where-Object { -not $liveMap0.Contains($_) })
$diffDel = @($liveMap0.Keys | Where-Object { -not $candMap.Contains($_) })
$diffChg = @($candMap.Keys | Where-Object { $liveMap0.Contains($_) -and $liveMap0[$_] -ne $candMap[$_] })
Say ('API fark: eklenen=' + $diffAdd.Count + ' silinen=' + $diffDel.Count + ' degisen=' + $diffChg.Count)
if ($diffAdd.Count -ne 0 -or $diffDel.Count -ne 0) { throw 'KAPI: eklenen/silinen API dosyasi var - DUR' }
if ((($diffChg | Sort-Object) -join '|') -cne (($FILES | Sort-Object) -join '|')) { throw 'KAPI: degisen API dosya kumesi manifestle ayni degil - DUR' }
$lW = Get-TreeDigest (Get-Map $LIVE_NEXT -Web)
Say ('canli WEB .next digest=' + $lW + ' | BUILD_ID=' + (Get-BuildId $LIVE_NEXT) + ' | cfg=' + (Get-R26FileSha256 $LIVE_CFG).Substring(0, 16))
if ($lW -cne $EXP_WEB_LIVE -or (Get-BuildId $LIVE_NEXT) -cne $BID_LIVE -or (Get-R26FileSha256 $LIVE_CFG) -cne $CFG_LIVE) { throw 'KAPI: canli WEB kimligi taban degil - DUR' }
$global:LASTEXITCODE = 0
& robocopy.exe $LIVE $BK_API /E /R:0 /W:0 /NFL /NDL /NJH /NJS | Out-Null
if ($LASTEXITCODE -ge 8) { throw ('KAPI: API yedek robocopy ' + $LASTEXITCODE + ' - DUR') }
if ((Get-TreeDigest (Get-Map $BK_API)) -cne $EXP_LIVE) { throw 'KAPI: API yedek digest taban degil - DUR (dosyalara dokunulmadi)' }
$global:LASTEXITCODE = 0
& robocopy.exe $LIVE_NEXT (Join-Path $BK_WEB '.next') /E /R:0 /W:0 /NFL /NDL /NJH /NJS | Out-Null
if ($LASTEXITCODE -ge 8) { throw ('KAPI: WEB yedek robocopy ' + $LASTEXITCODE + ' - DUR') }
Copy-Item -LiteralPath $LIVE_CFG -Destination (Join-Path $BK_WEB 'next.config.js')
if ((Get-TreeDigest (Get-Map (Join-Path $BK_WEB '.next') -Web)) -cne $EXP_WEB_LIVE -or (Get-R26FileSha256 (Join-Path $BK_WEB 'next.config.js')) -cne $CFG_LIVE) { throw 'KAPI: WEB yedek kimligi taban degil - DUR (dosyalara dokunulmadi)' }
Say ('yedekler DOGRULANDI: API=' + $BK_API + ' | WEB=' + $BK_WEB)
$global:LASTEXITCODE = 0
& robocopy.exe $CAND_NEXT $STAGED /E /R:0 /W:0 /NFL /NDL /NJH /NJS | Out-Null
if ($LASTEXITCODE -ge 8) { throw ('KAPI: WEB hazirlik kopyasi robocopy ' + $LASTEXITCODE + ' - DUR') }
if ((Get-TreeDigest (Get-Map $STAGED -Web)) -cne $EXP_WEB_CAND) { throw 'KAPI: WEB hazirlik kopyasi aday degil - DUR (canli dosyalara dokunulmadi)' }
if (-not (Test-InheritOnly $STAGED)) { throw 'KAPI: WEB hazirlik kopyasi ACL kalitim modelinde degil - DUR' }
Say ('WEB hazirlik kopyasi DOGRULANDI: ' + $STAGED + ' (ACL yalniz kalitim)')

Say '=== 3) WEB SONRA API DURDUR + KAPANDIGINI DOGRULA'
Stop-ScheduledTask -TaskName $WEB_TASK
if (-not (Wait-Stopped $WEB_TASK $WEB_PORT 'web' 90)) { Start-ScheduledTask -TaskName $WEB_TASK; throw 'KAPI: WEB kapanmadi - DOSYALARA DOKUNULMADI, web yeniden baslatildi' }
Stop-ScheduledTask -TaskName $API_TASK
if (-not (Wait-Stopped $API_TASK $API_PORT 'api' 90)) { Start-ScheduledTask -TaskName $API_TASK; Start-ScheduledTask -TaskName $WEB_TASK; throw 'KAPI: API kapanmadi - DOSYALARA DOKUNULMADI, ikisi de yeniden baslatildi' }
Say 'WEB ve API kapandi (dinleyici 0, host sureci 0, gorev Running degil)'

Say '=== 4) TAKAS (migrate deploy YOK, SILME YOK)'
$swapErr = $null
try {
  foreach ($rel in $FILES) {
    $dst = Join-Path $LIVE ($rel -replace '/', '\')
    Copy-Item -LiteralPath (Join-Path $CAND ($rel -replace '/', '\')) -Destination $dst -Force
    if ((Get-R26FileSha256 $dst) -cne $candMap[$rel]) { throw ('API dosya sha uyusmuyor: ' + $rel) }
  }
  Say 'API 2/2 dosya degisti'
  Move-Item -LiteralPath $LIVE_NEXT -Destination $PRE
  Move-Item -LiteralPath $STAGED -Destination $LIVE_NEXT
  Copy-Item -LiteralPath $CAND_CFG -Destination $LIVE_CFG -Force
  Say ('WEB .next takas edildi (onceki: ' + $PRE + ') + next.config.js')
} catch { $swapErr = $_.Exception.Message; Say ('HATA takas: ' + $swapErr) }

Say '=== 5) DURMUSKEN KIMLIK'
$liveDig1 = Get-TreeDigest (Get-Map $LIVE)
$webDig1 = if (Test-Path -LiteralPath $LIVE_NEXT) { Get-TreeDigest (Get-Map $LIVE_NEXT -Web) } else { 'YOK' }
$cfg1 = Get-R26FileSha256 $LIVE_CFG
Say ('API digest aday esit=' + ($liveDig1 -ceq $EXP_CAND) + ' | WEB digest aday esit=' + ($webDig1 -ceq $EXP_WEB_CAND) + ' | cfg aday esit=' + ($cfg1 -ceq $CFG_CAND))
$verdict = 'BELIRSIZ'
if ($swapErr -or $liveDig1 -cne $EXP_CAND -or $webDig1 -cne $EXP_WEB_CAND -or $cfg1 -cne $CFG_CAND -or -not (Test-InheritOnly $LIVE_NEXT)) {
  Say 'KAPI: takas sonrasi kimlik aday degil -> BASLATMADAN GERI ALMA'
  $ok = Restore-All
  $up = Start-Both-And-Report
  $verdict = if ($ok -and $up) { 'ROLLBACK' } else { 'ROLLBACK-DOGRULANAMADI' }
} else {
  Say '=== 6) API BASLAT + SURELI SAGLIK (<=120 sn)'
  $startUtc = (Get-Date).ToUniversalTime().AddSeconds(-5)
  Start-ScheduledTask -TaskName $API_TASK
  $deadline = (Get-Date).AddSeconds(120); $me = -1; $hp = @()
  while ((Get-Date) -lt $deadline) { $hp = Get-Pids $API_PORT; if ($hp.Count -ge 1) { $me = Http 'GET' ('http://127.0.0.1:' + $API_PORT + '/api/auth/me'); if ($me -gt 0) { break } }; Start-Sleep -Seconds 3 }
  $unauth = Http 'POST' ('http://127.0.0.1:' + $API_PORT + $ROUTE)
  $portalUnauth = Http 'GET' ('http://127.0.0.1:' + $API_PORT + $PORTAL_GET)
  $logDir = 'C:\Ops\hukuk\logs\api'
  $newest = @(Get-ChildItem -LiteralPath $logDir -File -Filter 'api-out.*.log' -ErrorAction SilentlyContinue | Where-Object { $_.CreationTimeUtc -ge $startUtc } | Sort-Object CreationTimeUtc -Descending | Select-Object -First 1)
  $mapped = 0; $mappedPortal = 0; $mappedTotal = 0; $logName = 'YOK'
  if ($newest.Count -eq 1) {
    $logName = $newest[0].Name; $txt = Get-Content -LiteralPath $newest[0].FullName -Raw
    $mapped = ([regex]::Matches($txt, [regex]::Escape('Mapped {' + $ROUTE + ', POST} route'))).Count
    $mappedPortal = ([regex]::Matches($txt, [regex]::Escape($PORTAL_MAPPED))).Count
    $mappedTotal = ([regex]::Matches($txt, 'Mapped \{')).Count
  }
  Say ('API: pid=' + ($hp -join ',') + ' | /api/auth/me=' + $me + ' | run-now=' + $unauth + ' | portal/cases=' + $portalUnauth + ' | boot log=' + $logName + ' run-now Mapped=' + $mapped + ' portal upload Mapped=' + $mappedPortal + ' toplam Mapped=' + $mappedTotal)
  $apiOk = ($hp.Count -eq 1 -and $me -eq 401 -and $unauth -eq 401 -and $portalUnauth -eq 401 -and $mapped -ge 1 -and $mappedPortal -ge 1)
  Say '=== 7) WEB BASLAT + SURELI SAGLIK (<=180 sn; launcher BindTimeout 180)'
  Start-ScheduledTask -TaskName $WEB_TASK
  $deadline = (Get-Date).AddSeconds(180); $pl = -1; $wp = @()
  while ((Get-Date) -lt $deadline) { $wp = Get-Pids $WEB_PORT; if ($wp.Count -ge 1) { $pl = Http 'GET' ('http://127.0.0.1:' + $WEB_PORT + '/portal/login'); if ($pl -gt 0) { break } }; Start-Sleep -Seconds 3 }
  $bm = Http 'GET' ('http://127.0.0.1:' + $WEB_PORT + '/_next/static/' + $BID_CAND + '/_buildManifest.js')
  $ik = Http 'GET' ('http://127.0.0.1:' + $WEB_PORT + '/intake/r26-release-check')
  $rw = Http 'GET' ('http://127.0.0.1:' + $WEB_PORT + '/api/auth/me')
  $webRootOk = $false; if ($wp.Count -eq 1) { $webRootOk = ((Get-CimInstance Win32_Process -Filter ("ProcessId=" + $wp[0])).CommandLine -match 'HY_W4_RELEASE23') }
  Say ('WEB: pid=' + ($wp -join ',') + ' kok RELEASE23=' + $webRootOk + ' | /portal/login=' + $pl + ' | buildManifest(' + $BID_CAND + ')=' + $bm + ' | /intake/x=' + $ik + ' | rewrite /api/auth/me=' + $rw + ' (401 beklenir)')
  $webOk = ($wp.Count -eq 1 -and $webRootOk -and $pl -eq 200 -and $bm -eq 200 -and $ik -eq 200 -and $rw -eq 401 -and (Get-BuildId $LIVE_NEXT) -ceq $BID_CAND)
  Say '=== 8) KAPSAM'
  $liveDig2 = Get-TreeDigest (Get-Map $LIVE); $webDig2 = Get-TreeDigest (Get-Map $LIVE_NEXT -Web)
  $envSha1 = Get-R26FileSha256 (Join-Path $LIVE_API '.env')
  $actA1 = ((Get-ScheduledTask -TaskName $API_TASK).Actions | ForEach-Object { $_.Execute + ' ' + $_.Arguments }) -join ' ; '
  $actW1 = ((Get-ScheduledTask -TaskName $WEB_TASK).Actions | ForEach-Object { $_.Execute + ' ' + $_.Arguments }) -join ' ; '
  $tuple1 = Get-LauncherTuple
  $scopeOk = ($liveDig2 -ceq $EXP_CAND -and $webDig2 -ceq $EXP_WEB_CAND -and $envSha1 -ceq $envSha0 -and $tuple1 -ceq $tuple0 -and $actA1 -ceq $actA0 -and $actW1 -ceq $actW0)
  Say ('kapsam: API digest=' + ($liveDig2 -ceq $EXP_CAND) + ' | WEB digest=' + ($webDig2 -ceq $EXP_WEB_CAND) + ' | .env degismedi=' + ($envSha1 -ceq $envSha0) + ' | baslatici uclusu degismedi=' + ($tuple1 -ceq $tuple0) + ' (' + $tuple1 + ') | gorev action ayni=' + ($actA1 -ceq $actA0 -and $actW1 -ceq $actW0))
  if ($apiOk -and $webOk -and $scopeOk) { $verdict = 'YAYIN PASS' }
  else {
    Say 'KAPI: saglik/route/kapsam tutmadi -> GERI ALMA (API + WEB birlikte)'
    Stop-ScheduledTask -TaskName $WEB_TASK; $ws = Wait-Stopped $WEB_TASK $WEB_PORT 'web' 90
    Stop-ScheduledTask -TaskName $API_TASK; $as = Wait-Stopped $API_TASK $API_PORT 'api' 90
    if (-not ($ws -and $as)) { Say 'UYARI: surec kapanmadi, dosyalara dokunulmadi'; $verdict = 'ROLLBACK-ENGELLENDI' }
    else { $ok = Restore-All; $up = Start-Both-And-Report; $verdict = if ($ok -and $up) { 'ROLLBACK' } else { 'ROLLBACK-DOGRULANAMADI' } }
  }
}
Say ('=== SONUC: ' + $verdict)
$evid = [ordered]@{
  record = 'R26-RELEASE-EXECUTION'; tsUtc = $ts; verdict = $verdict
  sourceSha = 'c7a154b3c0728fee7618ca65e54898ed02cc8b3b'; sourceBranch = 'release/r26-candidate'; baseSha = '4443600a (R25B kaynagi)'
  prs = @('#2739 web ayni-origin + K-A + K-B', '#2738 PUBLIC_PORTAL_BASE_URL', '#2740 OFFICE-AUTH-01 (799a7346)'); excluded = @('#2716 replay adapter', '#2727 migration', '#2730 davranis-notr refactor')
  launcherTuple = $tuple0
  api = [ordered]@{ liveBaseline = $EXP_LIVE; candidate = $EXP_CAND; changedFiles = $FILES; backup = $BK_API }
  web = [ordered]@{ liveBaseline = $EXP_WEB_LIVE; candidate = $EXP_WEB_CAND; buildIdBefore = $BID_LIVE; buildIdAfter = $BID_CAND; nextConfigBefore = $CFG_LIVE; nextConfigAfter = $CFG_CAND; backup = $BK_WEB; preDirInPlace = $PRE }
  migrationRun = $false; launcherChanged = $false; envRead = $false; deleted = 0
  log = @($log)
}
$evidFile = Join-Path $EVID_DIR ('R26-RELEASE-' + $ts + '.json')
[IO.File]::WriteAllText($evidFile, ($evid | ConvertTo-Json -Depth 6), (New-Object Text.UTF8Encoding($false)))
Write-Output ('KANIT: ' + $evidFile + ' sha256=' + (Get-R26FileSha256 $evidFile))
if ($verdict -ne 'YAYIN PASS') { exit 1 }
