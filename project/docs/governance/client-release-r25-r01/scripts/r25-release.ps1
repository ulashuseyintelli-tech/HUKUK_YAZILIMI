param([switch]$SelfTest)
$ErrorActionPreference = 'Stop'
# =============================================================================
# R25 YAYIN (R25B adayi: YALNIZ 7 portal dosyasi) - OWNER ELEVATED KOSUM. Saf ASCII.
# -SelfTest : CANLIYA DOKUNMAZ (durdurma/takas/yazma YOK). Yalniz yardimci fonksiyonlari ve
#             salt-okuma kimlik olcumlerini dogrular, sonra cikar. Yayin icin PARAMETRESIZ kosulur.
# Aday R25B 1524EDC1... = BIRLESIK ARTEFAKT: canli R24 dist 87712E0E... + YALNIZ 7 portal dosyasi
#   (#2720 K-1 + #2721 PSUS; ebbe1ae8 derlemesi). #2716 replay adapter dosyalari DAHIL DEGIL (owner karari).
#   Ayni digest, ebbe1ae8 + adapter kaynagi 006c4dd2 halinde bagimsiz derlemeyle bit-bit yeniden uretildi.
# migrate deploy YOK (migration farki 0) ; pinli launcher DEGISMEZ ; .env OKUNMAZ (yalniz sha) ; DB yazimi YOK.
# Basarisizlikta: dosyalara dokunulmadan DUR, ya da swap sonrasi otomatik GERI ALMA (bolum 7).
# =============================================================================
$LIVE_API = 'C:\Development\HUKUK_YAZILIMI\HY_W4_RELEASE23\project\apps\api'
$LIVE     = Join-Path $LIVE_API 'dist\apps\api\src'
$CAND     = 'D:\Development\HUKUK_YAZILIMI\HY_WT_R25\project\apps\api\dist-r25b\apps\api\src'
$EXP_CAND = '1524EDC15C636B39507DD9520206E3065E6A353A531D82D4362DFE115FC04D4E'
$EXP_LIVE = '87712E0ED2CF71EE8268D81865C2388E030F52AF9AC7E29C56617AEDD0845453'
$ENV_PIN  = '7A7228B1143BE2A8406FAF4CA316064EB2E164AE23E160E1353121F64E0EFDDC'
$LAUNCHER = 'C:\Ops\hukuk\bin\start-api.ps1'
$LAUNCH_PIN = 'CC634BBFE0BE8F4F06482EDB30FF1E687D36B08C075665E2EC160EA8082619B3'
$PORT = 8080
$TASK = 'HukukPlatform-API'
# R24 ucu KORUNMALI (401) ; portal guard'i aktif olmali (401) ; portal upload rotasi boot logunda Mapped olmali
$ROUTE = '/api/client-statements/monthly-delivery/run-now'
$PORTAL_GET = '/api/portal/cases'
$PORTAL_MAPPED = 'Mapped {/api/portal/documents/upload, POST} route'
$EXP_PKG  = '4934A97C3E50197784A6469E54CB4A591672E3503A4C86FB6852D0FF97327D3A'
$FILES = @(
  'modules/portal/portal-auth.guard.js',
  'modules/portal/portal-auth.guard.js.map',
  'modules/portal/portal.controller.js',
  'modules/portal/portal.controller.js.map',
  'modules/portal/portal.service.d.ts',
  'modules/portal/portal.service.js',
  'modules/portal/portal.service.js.map')
$ts = (Get-Date).ToUniversalTime().ToString('yyyyMMdd-HHmmss') + 'Z'
$EVID_DIR = 'D:\Development\HUKUK_YAZILIMI\HY_R25_RELEASE_EVIDENCE'
$BK = Join-Path $EVID_DIR ('rollback-dist-src-R24-' + $ts)
$log = New-Object System.Collections.Generic.List[string]
# NOT: Say, Write-Host kullanir - fonksiyon donus degerlerini kirletmemesi icin (PS pipeline).
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
  # ORDINAL siralama .NET StringComparer ile: Sort-Object -CaseSensitive PS 5.1 ile pwsh 7 arasinda
  # kultur-bagimli FARKLI sira uretir (tr-TR) ve digest kabuga gore degisirdi. Bu surum kabuk-bagimsiz.
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
    $r.AllowAutoRedirect = $false; $r.UserAgent = 'r25-release-check'
    if ($method -eq 'POST') { $r.ContentType = 'application/json'; $b = [Text.Encoding]::UTF8.GetBytes('{}'); $r.ContentLength = $b.Length; $s = $r.GetRequestStream(); $s.Write($b, 0, $b.Length); $s.Dispose() }
    $resp = $r.GetResponse(); $code = [int]$resp.StatusCode; $resp.Dispose(); return $code
  } catch [Net.WebException] {
    if ($_.Exception.Response) { return [int]([Net.HttpWebResponse]$_.Exception.Response).StatusCode }
    return -1
  } catch { return -2 }
}
function Get-PackageDigest([string]$root) {
  $m = [ordered]@{}
  foreach ($rel in $FILES) { $m[$rel] = Get-R25FileSha256 (Join-Path $root ($rel -replace '/', '\')) }
  return Get-TreeDigest $m
}
function Restore-FromBackup {
  Say 'GERI ALMA: yedekten 7 dosya donduruluyor'
  foreach ($rel in $FILES) {
    $src = Join-Path $BK ($rel -replace '/', '\'); $dst = Join-Path $LIVE ($rel -replace '/', '\')
    Copy-Item -LiteralPath $src -Destination $dst -Force
  }
  $d = Get-TreeDigest (Get-Map $LIVE)
  Say ('GERI ALMA sonrasi canli digest=' + $d + ' | taban esit=' + ($d -ceq $EXP_LIVE))
  return ($d -ceq $EXP_LIVE)
}

if ($SelfTest) {
  Say '=== SELFTEST (canliya dokunmaz: durdurma/takas/yazma YOK)'
  $fails = 0
  $cmd = Get-Command Get-R25FileSha256 -ErrorAction SilentlyContinue
  $isFunc = ($null -ne $cmd -and $cmd.CommandType -eq 'Function')
  Say ('ad cozumleme: Get-R25FileSha256 -> ' + $(if ($cmd) { [string]$cmd.CommandType } else { 'YOK' }) + ' | fonksiyon=' + $isFunc)
  if (-not $isFunc) { $fails++ }
  $al = Get-Alias -Name 'Get-R25FileSha256' -ErrorAction SilentlyContinue
  Say ('alias golgesi=' + $(if ($al) { 'VAR: ' + $al.Definition } else { 'YOK' }) + ' | oturum h alias=' + [string](Get-Alias h -ErrorAction SilentlyContinue).Definition + ' (DEGISTIRILMEDI)')
  if ($al) { $fails++ }
  $hL = Get-R25FileSha256 $LAUNCHER
  $okL = ($hL -ceq (Get-FileHash -Algorithm SHA256 -LiteralPath $LAUNCHER).Hash) -and ($hL -ceq $LAUNCH_PIN)
  Say ('hash yardimcisi launcher: ' + $hL.Substring(0, 16) + ' | Get-FileHash ve pin ile ayni=' + $okL)
  if (-not $okL) { $fails++ }
  $hE = Get-R25FileSha256 (Join-Path $LIVE_API '.env')
  Say ('hash yardimcisi .env (yalniz sha): pin esit=' + ($hE -ceq $ENV_PIN))
  if ($hE -cne $ENV_PIN) { $fails++ }
  $selfCand = Get-TreeDigest (Get-Map $CAND)
  Say ('Get-Map + Get-TreeDigest aday: ' + $selfCand + ' | beklenen esit=' + ($selfCand -ceq $EXP_CAND))
  if ($selfCand -cne $EXP_CAND) { $fails++ }
  $selfLive = Get-TreeDigest (Get-Map $LIVE)
  Say ('canli (salt-okuma): ' + $selfLive + ' | taban esit=' + ($selfLive -ceq $EXP_LIVE) + ' | aday esit=' + ($selfLive -ceq $EXP_CAND))
  $me0 = Http 'GET' ('http://127.0.0.1:' + $PORT + '/api/auth/me')
  $rn0 = Http 'POST' ('http://127.0.0.1:' + $PORT + $ROUTE)
  $pg0 = Http 'GET' ('http://127.0.0.1:' + $PORT + $PORTAL_GET)
  Say ('Http yardimcisi: /api/auth/me=' + $me0 + ' | POST run-now=' + $rn0 + ' | GET portal/cases=' + $pg0)
  if ($me0 -ne 401) { $fails++ }
  $pk0 = Get-PackageDigest $CAND
  Say ('paket digest (7 dosya, aday): ' + $pk0 + ' | pin esit=' + ($pk0 -ceq $EXP_PKG))
  if ($pk0 -cne $EXP_PKG) { $fails++ }
  $needed = @('Say', 'Get-R25FileSha256', 'Get-Map', 'Get-TreeDigest', 'Get-ApiPids', 'Wait-ApiStopped', 'Http', 'Restore-FromBackup', 'Get-PackageDigest')
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
if (Test-Path -LiteralPath $BK) { throw 'KAPI: yedek dizini zaten var - DUR' }
if ((Get-R25FileSha256 $LAUNCHER) -cne $LAUNCH_PIN) { throw 'KAPI: pinli launcher farkli - DUR' }
$envSha0 = Get-R25FileSha256 (Join-Path $LIVE_API '.env')
if ($envSha0 -cne $ENV_PIN) { throw 'KAPI: canli .env sha pin degil - DUR' }
$task0 = Get-ScheduledTask -TaskName $TASK
$act0 = ($task0.Actions | ForEach-Object { $_.Execute + ' ' + $_.Arguments }) -join ' ; '
$pids0 = Get-ApiPids
Say ('gorev=' + $task0.State + ' | action=' + $act0 + ' | :' + $PORT + ' pid=' + ($pids0 -join ',') + ' | launcher+env pin OK')
if ($pids0.Count -ne 1) { throw ('KAPI: :' + $PORT + ' dinleyici sayisi 1 degil (' + $pids0.Count + ') - DUR') }
$root0 = (Get-CimInstance Win32_Process -Filter ("ProcessId=" + $pids0[0])).CommandLine
if ($root0 -notmatch 'HY_W4_RELEASE23') { throw 'KAPI: canli surec RELEASE23 kokunden degil - DUR' }
$rogue = @(Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -and $_.CommandLine -match 'i12-live|i12-cron|i12-window|i13-live|i14-live|i15-kabul|i16-live|smtp-sink' })
Say ('i12/cron/sink sureci=' + $rogue.Count)
if ($rogue.Count -ne 0) { throw 'KAPI: canli pencerede baska i12/cron sureci var - DUR' }

Say '=== 1) ADAY DOGRULAMA'
$candMap = Get-Map $CAND; $candDig = Get-TreeDigest $candMap
Say ('aday dosya=' + $candMap.Count + ' digest=' + $candDig)
if ($candDig -cne $EXP_CAND) { throw 'KAPI: aday digest beklenen degil - DUR' }
$pkg = Get-PackageDigest $CAND
Say ('paket digest (7 dosya)=' + $pkg)
if ($pkg -cne $EXP_PKG) { throw 'KAPI: paket digest pin degil - DUR' }

Say '=== 2) CANLI KIMLIK + DOGRULANMIS YEDEK'
$liveMap0 = Get-Map $LIVE; $liveDig0 = Get-TreeDigest $liveMap0
Say ('canli dosya=' + $liveMap0.Count + ' digest=' + $liveDig0)
if ($liveDig0 -cne $EXP_LIVE) { throw 'KAPI: canli digest beklenen taban degil - DUR' }
$diffAdd = @($candMap.Keys | Where-Object { -not $liveMap0.Contains($_) })
$diffDel = @($liveMap0.Keys | Where-Object { -not $candMap.Contains($_) })
$diffChg = @($candMap.Keys | Where-Object { $liveMap0.Contains($_) -and $liveMap0[$_] -ne $candMap[$_] })
Say ('fark: eklenen=' + $diffAdd.Count + ' silinen=' + $diffDel.Count + ' degisen=' + $diffChg.Count)
if ($diffAdd.Count -ne 0 -or $diffDel.Count -ne 0) { throw 'KAPI: eklenen/silinen dosya var - DUR' }
if ((($diffChg | Sort-Object) -join '|') -cne (($FILES | Sort-Object) -join '|')) { throw 'KAPI: degisen dosya kumesi manifestle ayni degil - DUR' }
$global:LASTEXITCODE = 0
& robocopy.exe $LIVE $BK /E /R:0 /W:0 /NFL /NDL /NJH /NJS | Out-Null
if ($LASTEXITCODE -ge 8) { throw ('KAPI: yedek kopyalama basarisiz (robocopy ' + $LASTEXITCODE + ') - DUR') }
$bkDig = Get-TreeDigest (Get-Map $BK)
Say ('yedek=' + $BK + ' digest=' + $bkDig + ' | taban esit=' + ($bkDig -ceq $EXP_LIVE))
if ($bkDig -cne $EXP_LIVE) { throw 'KAPI: yedek digest taban degil - DUR (dosyalara dokunulmadi)' }

Say '=== 3) GOREVI DURDUR + KAPANDIGINI DOGRULA'
Stop-ScheduledTask -TaskName $TASK
if (-not (Wait-ApiStopped 90)) { throw 'KAPI: API kapanmadi - DOSYALARA DOKUNULMAZ' }
Say 'API kapandi (dinleyici 0, host api sureci 0, gorev Running degil)'

Say '=== 4) 7 DOSYAYI DEGISTIR (migrate deploy YOK)'
$swapped = 0
foreach ($rel in $FILES) {
  $src = Join-Path $CAND ($rel -replace '/', '\'); $dst = Join-Path $LIVE ($rel -replace '/', '\')
  Copy-Item -LiteralPath $src -Destination $dst -Force
  if ((Get-R25FileSha256 $dst) -cne $candMap[$rel]) { Say ('HATA: kopyalanan dosya sha uyusmuyor: ' + $rel); break }
  $swapped++
}
Say ('degistirilen dosya=' + $swapped + '/7')

Say '=== 5) DURMUSKEN TAM AGAC DIGEST'
$liveDig1 = Get-TreeDigest (Get-Map $LIVE)
Say ('canli digest=' + $liveDig1 + ' | aday esit=' + ($liveDig1 -ceq $EXP_CAND))
$verdict = 'BELIRSIZ'
if ($liveDig1 -cne $EXP_CAND) {
  Say 'KAPI: swap sonrasi digest aday degil -> BASLATMA, GERI ALMA'
  $ok = Restore-FromBackup
  Start-ScheduledTask -TaskName $TASK
  Start-Sleep -Seconds 20
  Say ('geri alma sonrasi: :' + $PORT + ' pid=' + ((Get-ApiPids) -join ',') + ' | /api/auth/me=' + (Http 'GET' ('http://127.0.0.1:' + $PORT + '/api/auth/me')) + ' | POST run-now=' + (Http 'POST' ('http://127.0.0.1:' + $PORT + $ROUTE)))
  $verdict = if ($ok) { 'ROLLBACK' } else { 'ROLLBACK-DOGRULANAMADI' }
} else {
  Say '=== 6) API BASLAT'
  $startUtc = (Get-Date).ToUniversalTime().AddSeconds(-5)
  Start-ScheduledTask -TaskName $TASK
  Say '=== 7) SURELI SAGLIK (<=120 sn)'
  # Saglik isareti: TCP dinleyici + korumali uc /api/auth/me = 401 (yayin oncesi olculdu: 401).
  # /api/capabilities bu surumde 404 doner; saglik olcutu olarak KULLANILMAZ.
  $deadline = (Get-Date).AddSeconds(120); $me = -1; $hpids = @()
  while ((Get-Date) -lt $deadline) {
    $hpids = Get-ApiPids
    if ($hpids.Count -ge 1) {
      $me = Http 'GET' ('http://127.0.0.1:' + $PORT + '/api/auth/me')
      if ($me -gt 0) { break }
    }
    Start-Sleep -Seconds 3
  }
  Say ('saglik: :' + $PORT + ' pid=' + ($hpids -join ',') + ' | /api/auth/me=' + $me)
  $healthy = ($hpids.Count -eq 1 -and $me -eq 401)
  Say '=== 8) ROUTE / YETKI KONTROLU (gonderimsiz, kimliksiz)'
  $unauth = Http 'POST' ('http://127.0.0.1:' + $PORT + $ROUTE)
  $portalUnauth = Http 'GET' ('http://127.0.0.1:' + $PORT + $PORTAL_GET)
  Say ('kimliksiz POST ' + $ROUTE + ' -> ' + $unauth + ' (401 beklenir: R24 ucu korundu) | kimliksiz GET ' + $PORTAL_GET + ' -> ' + $portalUnauth + ' (401 beklenir: portal guard aktif)')
  $logDir = 'C:\Ops\hukuk\logs\api'
  # YALNIZ bu baslatmadan SONRA olusan cocuk logu okunur (eski boot logu kanit sayilmaz)
  $newest = @(Get-ChildItem -LiteralPath $logDir -File -Filter 'api-out.*.log' -ErrorAction SilentlyContinue | Where-Object { $_.CreationTimeUtc -ge $startUtc } | Sort-Object CreationTimeUtc -Descending | Select-Object -First 1)
  $mapped = 0; $mappedPortal = 0; $mappedTotal = 0; $logName = 'YOK'
  if ($newest.Count -eq 1) {
    $logName = $newest[0].Name
    $txt = Get-Content -LiteralPath $newest[0].FullName -Raw
    $mapped = ([regex]::Matches($txt, [regex]::Escape('Mapped {' + $ROUTE + ', POST} route'))).Count
    $mappedPortal = ([regex]::Matches($txt, [regex]::Escape($PORTAL_MAPPED))).Count
    $mappedTotal = ([regex]::Matches($txt, 'Mapped \{')).Count
  }
  Say ('boot log=' + $logName + ' | run-now Mapped satiri=' + $mapped + ' | portal upload Mapped satiri=' + $mappedPortal + ' | toplam Mapped=' + $mappedTotal)
  $liveDig2 = Get-TreeDigest (Get-Map $LIVE)
  $envSha1 = Get-R25FileSha256 (Join-Path $LIVE_API '.env')
  $task1 = Get-ScheduledTask -TaskName $TASK
  $act1 = ($task1.Actions | ForEach-Object { $_.Execute + ' ' + $_.Arguments }) -join ' ; '
  Say ('kapsam: canli digest=' + ($liveDig2 -ceq $EXP_CAND) + ' | .env sha degismedi=' + ($envSha1 -ceq $envSha0) + ' | launcher pin=' + ((Get-R25FileSha256 $LAUNCHER) -ceq $LAUNCH_PIN) + ' | gorev action ayni=' + ($act1 -ceq $act0))
  $routeOk = ($unauth -eq 401 -and $portalUnauth -eq 401 -and $mapped -ge 1 -and $mappedPortal -ge 1)
  if ($healthy -and $routeOk -and $liveDig2 -ceq $EXP_CAND -and $envSha1 -ceq $envSha0 -and $act1 -ceq $act0) { $verdict = 'YAYIN PASS' }
  else {
    Say 'KAPI: saglik/route/kapsam kontrolu tutmadi -> GERI ALMA (bolum 7)'
    Stop-ScheduledTask -TaskName $TASK
    if (-not (Wait-ApiStopped 90)) { Say 'UYARI: API kapanmadi, dosyalara dokunulmadi'; $verdict = 'ROLLBACK-ENGELLENDI' }
    else { $ok = Restore-FromBackup; Start-ScheduledTask -TaskName $TASK; Start-Sleep -Seconds 10; $verdict = if ($ok) { 'ROLLBACK' } else { 'ROLLBACK-DOGRULANAMADI' } }
  }
}
Say ('=== SONUC: ' + $verdict)
$evid = [ordered]@{
  record = 'R25-RELEASE-EXECUTION'; tsUtc = $ts; verdict = $verdict
  sourceSha = 'ebbe1ae8cce04de5579944bbf6b7f46a0efe0412'; candidateDigest = $EXP_CAND; liveBaselineDigest = $EXP_LIVE
  packageDigest = $EXP_PKG; candidate = 'R25B'; composite = 'R24 87712E0E + 7 portal dosyasi (ebbe1ae8)'; prs = @('#2720 K-1', '#2721 PSUS'); excluded = @('#2716 replay-adapter (owner karari)')
  backupPath = $BK; changedFiles = $FILES; migrationRun = $false; launcherChanged = $false; envRead = $false
  log = @($log)
}
$evidFile = Join-Path $EVID_DIR ('R25-RELEASE-' + $ts + '.json')
[IO.File]::WriteAllText($evidFile, ($evid | ConvertTo-Json -Depth 6), (New-Object Text.UTF8Encoding($false)))
Write-Output ('KANIT: ' + $evidFile + ' sha256=' + (Get-R25FileSha256 $evidFile))
if ($verdict -ne 'YAYIN PASS') { exit 1 }
