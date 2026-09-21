# =============================================================================
# R26 + P1 ORTAK GECIS - ASAMA KAPISI (SALT OKUMA)
#
#   powershell.exe -NoProfile -ExecutionPolicy Bypass -File r26p1-stage-gate.ps1 -Stage S0 [-ExpectRunning] [-EvidencePath <dosya>]
#   powershell.exe -NoProfile -ExecutionPolicy Bypass -File r26p1-stage-gate.ps1 -SelfTest
#
# NE YAPAR: Canli sistemin BELIRTILEN asamadaki TAM kimligini olcer ve pinle birebir karsilastirir:
#   baslatici uclusu (EXACT, "ikisinden biri" DEGIL) + P1'in korudugu yardimcilar + .env sha'si +
#   API dist digest + WEB .next digest + BUILD_ID + next.config.js + iki gorevin ETKIN olmasi ve eylemleri.
#   -ExpectRunning: 8080 ve 3002'de TAM BIR dinleyici.
# NE YAPMAZ: dosya yazmaz (yalniz -EvidencePath verilirse o JSON), gorev/servis durdurmaz-baslatmaz, HTTP/DB yok,
#   .env ICERIGI okunmaz (yalniz sha256), pin guncellemez. R26 ve P1 betiklerinin yerine GECMEZ; onlardan ONCE kosar.
#
# CIKIS: 0 PASS | 1 FAIL (en az bir kimlik/durum tutmadi -> sonraki adima GECILMEZ) | 2 olcum hatasi
#
# Digest tarifi R26 paketiyle (client-release-r26-r01/scripts/r26-release.ps1) AYNI: goreli yol (/) NUL BUYUK-hex LF,
# ORDINAL siralama, UTF-8, SHA256; WEB'de cache/ ve trace HARIC. PS 5.1 ve pwsh 7 ayni sonucu verir.
# =============================================================================
param(
  [ValidateSet('S0', 'S1', 'S2', 'S3')][string]$Stage,
  [switch]$ExpectRunning,
  [string]$EvidencePath,
  [switch]$SelfTest
)
$ErrorActionPreference = 'Stop'

# --- pinler -------------------------------------------------------------------
$T_P1_ONCESI  = @{ name = 'P1-ONCESI';  api = 'CC634BBFE0BE8F4F06482EDB30FF1E687D36B08C075665E2EC160EA8082619B3'; host = '691BC146C9123B1625B4AE733EFE615F8AFFB77FB0C95EBFDAE621A6AA171627'; web = 'F39F7A54BC51972B94FD0CF13A08F4E1AB82822A528EDAD58FC8F2318C1F59E0' }
$T_P1_SONRASI = @{ name = 'P1-SONRASI'; api = 'DDCCD09157E0AAF209AB38316A33815A0298FFACBC9006ED62F35F137F86219C'; host = '27099BDF66C83A44B3061D65AE2DAF24EADB523EE4F464179C2F53BB6C78DEAB'; web = 'F39F7A54BC51972B94FD0CF13A08F4E1AB82822A528EDAD58FC8F2318C1F59E0' }
$A_R25B = @{ name = 'R25B'; api = '1524EDC15C636B39507DD9520206E3065E6A353A531D82D4362DFE115FC04D4E'; web = 'F064DC95CBCCA6218E8D5E84A89A6472F03AF54994E425E28A02B135956282F1'; bid = 'dOiGPj2M0Abls0kCibY4r'; cfg = '4AD4915C0A741AF609CCD241DFE08EF2C76A17E2175E3BD1FB7AE925128EF750' }
$A_R26  = @{ name = 'R26';  api = 'A8B17A38327975C71DDAE82FE33D1E97CB8B339FB1E35D1828FCF8D0CEB053A0'; web = 'C17E7B132FB7DED65AD0788024AA478F0949AF0D5D9045E8F47779A31A615326'; bid = '5waeMoFGGMTLAYmn9oJvW'; cfg = 'C43DEB5A04F1529CE2D368204ED7D10B8DBC257327E0BC64A01F1D7CF3AC5B5C' }
# P1'in liveBaseline'inda olup HICBIR asamada degismeyenler + .env (R26 ENV_PIN)
$INVARIANT = @{
  readiness = 'AD18CBB621A2D58FD41B481C07A09D25726C150C2D9DA028C23B60986AD413A9'
  pwshManifest = '84E530B1A90F5A069C7C87B68B73948F574752650DB607DDFB29A959B9F0307A'
  env = '7A7228B1143BE2A8406FAF4CA316064EB2E164AE23E160E1353121F64E0EFDDC'
}
$STAGES = @{
  S0 = @{ title = 'GECIS ONCESI (bugunku canli)';                    tuple = $T_P1_ONCESI;  app = $A_R25B }
  S1 = @{ title = 'R26 SONRASI / P1 ONCESI';                          tuple = $T_P1_ONCESI;  app = $A_R26 }
  S2 = @{ title = 'R26 + P1 (birlesik son durum)';                    tuple = $T_P1_SONRASI; app = $A_R26 }
  S3 = @{ title = 'P1 KALICI, R26 GERI ALINDI (yalniz R26 B3 sonrasi)'; tuple = $T_P1_SONRASI; app = $A_R25B }
}

$LIVE_PATHS = @{
  apiLauncher = 'C:\Ops\hukuk\bin\start-api.ps1'
  webLauncher = 'C:\Ops\hukuk\bin\start-web.ps1'
  hostExe     = 'C:\Ops\hukuk\bin\hukuk-task-host.exe'
  readiness   = 'C:\Ops\hukuk\bin\db-readiness.js'
  pwshManifest = 'C:\Ops\hukuk\bin\pwsh-file-manifest.json'
  apiDist     = 'C:\Development\HUKUK_YAZILIMI\HY_W4_RELEASE23\project\apps\api\dist\apps\api\src'
  env         = 'C:\Development\HUKUK_YAZILIMI\HY_W4_RELEASE23\project\apps\api\.env'
  webNext     = 'C:\Development\HUKUK_YAZILIMI\HY_W4_RELEASE23\project\apps\web\.next'
  webCfg      = 'C:\Development\HUKUK_YAZILIMI\HY_W4_RELEASE23\project\apps\web\next.config.js'
}
$HOST_EXE_PATH = 'C:\Ops\hukuk\bin\hukuk-task-host.exe'
$SERVICE_TASKS = @(@{ name = 'HukukPlatform-API'; arg = 'api'; port = 8080 }, @{ name = 'HukukPlatform-WEB'; arg = 'web'; port = 3002 })

# --- olcum ---------------------------------------------------------------------
function Get-Sha([string]$p) { return (Get-FileHash -Algorithm SHA256 -LiteralPath $p).Hash }
function Get-TreeDigest([string]$root, [switch]$Web) {
  $keys = New-Object 'System.Collections.Generic.List[string]'; $map = @{}
  foreach ($f in (Get-ChildItem -LiteralPath $root -Recurse -File -Force)) {
    $rel = ($f.FullName.Substring($root.Length).TrimStart('\', '/')) -replace '\\', '/'
    if ($Web -and ($rel.StartsWith('cache/') -or $rel -ceq 'trace')) { continue }
    $map[$rel] = (Get-FileHash -Algorithm SHA256 -LiteralPath $f.FullName).Hash; $keys.Add($rel)
  }
  $keys.Sort([StringComparer]::Ordinal)
  $sb = New-Object Text.StringBuilder
  foreach ($k in $keys) { [void]$sb.Append($k).Append("`0").Append($map[$k]).Append("`n") }
  $sha = [Security.Cryptography.SHA256]::Create()
  return @{ digest = [BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($sb.ToString()))).Replace('-', ''); files = $keys.Count }
}
function Get-LiveTasks {
  $out = @()
  foreach ($t in $SERVICE_TASKS) {
    $st = Get-ScheduledTask -TaskName $t.name -ErrorAction SilentlyContinue
    if (-not $st) { $out += @{ name = $t.name; exists = $false }; continue }
    $out += @{ name = $t.name; exists = $true; state = [string]$st.State; enabled = [bool]$st.Settings.Enabled
      actions = @($st.Actions | ForEach-Object { @{ execute = [string]$_.Execute; arguments = [string]$_.Arguments } }) }
  }
  return $out
}
function Get-Listeners([int]$port) { return @((Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue).OwningProcess | Sort-Object -Unique) }

# --- degerlendirme (SelfTest ayni fonksiyonu sahte yollarla kullanir) ---------
function Test-Stage($spec, $paths, $taskList, $listenerFn, [bool]$expectRunning) {
  $checks = New-Object System.Collections.Generic.List[object]
  function Add-Check($id, $ok, $actual, $expected) { $checks.Add([ordered]@{ id = $id; ok = [bool]$ok; actual = $actual; expected = $expected }) }
  $a = Get-Sha $paths.apiLauncher; $h = Get-Sha $paths.hostExe; $w = Get-Sha $paths.webLauncher
  Add-Check 'U-1 api baslatici' ($a -ceq $spec.tuple.api) $a $spec.tuple.api
  Add-Check 'U-2 host exe' ($h -ceq $spec.tuple.host) $h $spec.tuple.host
  Add-Check 'U-3 web baslatici' ($w -ceq $spec.tuple.web) $w $spec.tuple.web
  $r = Get-Sha $paths.readiness; Add-Check 'Y-1 db-readiness.js' ($r -ceq $spec.inv.readiness) $r $spec.inv.readiness
  $m = Get-Sha $paths.pwshManifest; Add-Check 'Y-2 pwsh-file-manifest.json' ($m -ceq $spec.inv.pwshManifest) $m $spec.inv.pwshManifest
  $e = Get-Sha $paths.env; Add-Check 'Y-3 .env sha (icerik okunmaz)' ($e -ceq $spec.inv.env) $e $spec.inv.env
  $ad = Get-TreeDigest $paths.apiDist; Add-Check ('K-1 API dist digest (' + $ad.files + ' dosya)') ($ad.digest -ceq $spec.app.api) $ad.digest $spec.app.api
  $wd = Get-TreeDigest $paths.webNext -Web; Add-Check ('K-2 WEB .next digest (' + $wd.files + ' dosya; cache/ trace haric)') ($wd.digest -ceq $spec.app.web) $wd.digest $spec.app.web
  $bid = ([IO.File]::ReadAllText((Join-Path $paths.webNext 'BUILD_ID'))).Trim(); Add-Check 'K-3 BUILD_ID' ($bid -ceq $spec.app.bid) $bid $spec.app.bid
  $c = Get-Sha $paths.webCfg; Add-Check 'K-4 next.config.js' ($c -ceq $spec.app.cfg) $c $spec.app.cfg
  foreach ($t in $SERVICE_TASKS) {
    $lt = @($taskList | Where-Object { $_.name -ieq $t.name })
    if ($lt.Count -ne 1 -or -not $lt[0].exists) { Add-Check ('G-' + $t.arg + ' gorev var') $false 'YOK' $t.name; continue }
    $x = $lt[0]
    Add-Check ('G-' + $t.arg + ' gorev ETKIN (Disabled degil)') ($x.enabled -and $x.state -ne 'Disabled') ($x.state + '/enabled=' + $x.enabled) 'Ready|Running, enabled=True'
    $act = @($x.actions)
    $actOk = ($act.Count -eq 1) -and ($act[0].execute -ieq $spec.hostPath) -and ($act[0].arguments -ceq $t.arg)
    Add-Check ('G-' + $t.arg + ' eylem') $actOk (($act | ForEach-Object { $_.execute + ' ' + $_.arguments }) -join ' ; ') ($spec.hostPath + ' ' + $t.arg)
    if ($expectRunning) {
      $l = @(& $listenerFn $t.port)
      Add-Check ('L-' + $t.arg + ' tek dinleyici :' + $t.port) ($l.Count -eq 1) ($l -join ',') 'tam 1 PID'
    }
  }
  return , $checks
}

function New-Spec($stageKey) { $s = $STAGES[$stageKey]; return @{ title = $s.title; tuple = $s.tuple; app = $s.app; inv = $INVARIANT; hostPath = $HOST_EXE_PATH } }

# --- SelfTest: sahte agacta her kapinin hem PASS hem FAIL dali ------------------
if ($SelfTest) {
  $base = Join-Path ([IO.Path]::GetTempPath()) ('r26p1-gate-selftest-' + [guid]::NewGuid().ToString('N').Substring(0, 8))
  $p = @{
    apiLauncher = "$base\bin\start-api.ps1"; webLauncher = "$base\bin\start-web.ps1"; hostExe = "$base\bin\hukuk-task-host.exe"
    readiness = "$base\bin\db-readiness.js"; pwshManifest = "$base\bin\pwsh-file-manifest.json"
    apiDist = "$base\rel\api\dist\apps\api\src"; env = "$base\rel\api\.env"; webNext = "$base\rel\web\.next"; webCfg = "$base\rel\web\next.config.js"
  }
  $results = New-Object System.Collections.Generic.List[string]; $fails = 0
  try {
    foreach ($d in @("$base\bin", "$($p.apiDist)\modules\portal", "$($p.webNext)\static\chunks", "$($p.webNext)\cache\webpack")) { [void](New-Item -ItemType Directory -Force -Path $d) }
    function W($path, $text) { [IO.File]::WriteAllText($path, $text, (New-Object Text.UTF8Encoding($false))) }
    W $p.apiLauncher 'api-old'; W $p.webLauncher 'web'; W $p.hostExe 'host-old'; W $p.readiness 'r'; W $p.pwshManifest 'm'; W $p.env 'SECRET=not-read'
    W "$($p.apiDist)\main.js" 'main'; W "$($p.apiDist)\modules\portal\portal.service.js" 'r25b'
    W "$($p.webNext)\BUILD_ID" 'BID-OLD'; W "$($p.webNext)\static\chunks\a.js" 'a'; W "$($p.webNext)\cache\webpack\x" 'c'; W "$($p.webNext)\trace" 't'; W $p.webCfg 'cfg-old'
    $mk = { param($api, $hst) @{ name = 'X'; api = $api; host = $hst; web = (Get-Sha $p.webLauncher) } }
    $tOld = & $mk (Get-Sha $p.apiLauncher) (Get-Sha $p.hostExe)
    $appOld = @{ api = (Get-TreeDigest $p.apiDist).digest; web = (Get-TreeDigest $p.webNext -Web).digest; bid = 'BID-OLD'; cfg = (Get-Sha $p.webCfg) }
    $inv = @{ readiness = (Get-Sha $p.readiness); pwshManifest = (Get-Sha $p.pwshManifest); env = (Get-Sha $p.env) }
    $hostPath = 'C:\Ops\hukuk\bin\hukuk-task-host.exe'
    $okTasks = @(@{ name = 'HukukPlatform-API'; exists = $true; state = 'Running'; enabled = $true; actions = @(@{ execute = $hostPath; arguments = 'api' }) },
                 @{ name = 'hukukplatform-web'; exists = $true; state = 'Ready'; enabled = $true; actions = @(@{ execute = $hostPath; arguments = 'web' }) })
    $one = { param($port) @(4242) }
    function Run($label, $spec, $tasks, $listen, $expectPass) {
      $c = Test-Stage $spec $p $tasks $listen $true
      $pass = -not ($c | Where-Object { -not $_.ok })
      $bad = @($c | Where-Object { -not $_.ok } | ForEach-Object { $_.id }) -join ', '
      $ok = ($pass -eq $expectPass)
      if (-not $ok) { $script:fails++ }
      $script:results.Add(('{0}  {1}  beklenen={2} olculen={3}{4}' -f $(if ($ok) { 'OK  ' } else { 'HATA' }), $label, $(if ($expectPass) { 'PASS' } else { 'FAIL' }), $(if ($pass) { 'PASS' } else { 'FAIL' }), $(if ($bad) { ' [' + $bad + ']' } else { '' })))
    }
    $sOld = @{ tuple = $tOld; app = $appOld; inv = $inv; hostPath = $hostPath }
    Run 'ST-01 dogru asama (gorev adi harf duyarsiz)' $sOld $okTasks $one $true
    Copy-Item -LiteralPath $p.webNext -Destination "$base\next-bak" -Recurse
    W "$($p.webNext)\cache\webpack\x" 'cache-degisti'; W "$($p.webNext)\trace" 'trace-degisti'
    Run 'ST-02 yalniz cache/ ve trace degisti -> haric' $sOld $okTasks $one $true
    W "$($p.webNext)\static\chunks\a.js" 'a2'
    Run 'ST-03 .next icerigi degisti' $sOld $okTasks $one $false
    W "$($p.webNext)\static\chunks\a.js" 'a'
    W "$($p.webNext)\BUILD_ID" 'BID-NEW'
    Run 'ST-04 BUILD_ID degisti' $sOld $okTasks $one $false
    W "$($p.webNext)\BUILD_ID" 'BID-OLD'
    W $p.apiLauncher 'api-new'
    Run 'ST-05 yarim P1: yalniz start-api degisti' $sOld $okTasks $one $false
    W $p.apiLauncher 'api-old'; W $p.hostExe 'host-new'
    Run 'ST-06 yarim P1: yalniz host degisti' $sOld $okTasks $one $false
    W $p.apiLauncher 'api-new'
    $tNew = & $mk (Get-Sha $p.apiLauncher) (Get-Sha $p.hostExe)
    Run 'ST-07 P1 uygulanmis ama asama P1-ONCESI bekliyor' $sOld $okTasks $one $false
    Run 'ST-08 P1 uygulanmis ve asama P1-SONRASI bekliyor' @{ tuple = $tNew; app = $appOld; inv = $inv; hostPath = $hostPath } $okTasks $one $true
    W $p.apiLauncher 'api-old'; W $p.hostExe 'host-old'
    W "$($p.apiDist)\modules\portal\portal.service.js" 'r26'
    Run 'ST-09 API dist degisti (asama R25B bekliyor)' $sOld $okTasks $one $false
    W "$($p.apiDist)\modules\portal\portal.service.js" 'r25b'
    W $p.env 'SECRET=changed'
    Run 'ST-10 .env sha degisti' $sOld $okTasks $one $false
    W $p.env 'SECRET=not-read'
    $dis = @(@{ name = 'HukukPlatform-API'; exists = $true; state = 'Disabled'; enabled = $false; actions = @(@{ execute = $hostPath; arguments = 'api' }) }, $okTasks[1])
    Run 'ST-11 API gorevi Disabled (P1 yarida kaldi)' $sOld $dis $one $false
    $act = @($okTasks[0], @{ name = 'HukukPlatform-WEB'; exists = $true; state = 'Ready'; enabled = $true; actions = @(@{ execute = 'C:\baska\host.exe'; arguments = 'web' }) })
    Run 'ST-12 WEB gorev eylemi degisti' $sOld $act $one $false
    Run 'ST-13 gorev yok' $sOld @($okTasks[0]) $one $false
    Run 'ST-14 ExpectRunning: dinleyici 0' $sOld $okTasks { param($port) @() } $false
    Run 'ST-15 ExpectRunning: iki dinleyici' $sOld $okTasks { param($port) @(1, 2) } $false
    # Tarif bilinen cevap: tek girdili harita "a<NUL>HASH<LF>" (bagimsiz hesaplanan deger belgede)
    $kat = New-Item -ItemType Directory -Force -Path "$base\kat"; W "$base\kat\a" 'x'
    $katd = (Get-TreeDigest "$base\kat").digest
    $exp = 'D80ED0CA0798DE401E8B7A4DF7B39D1EF52E2DDC4691B10A02BA1C38C7C7ED0E'  # Node crypto ile bagimsiz
    $results.Add(('{0}  ST-16 tarif bilinen cevap {1}' -f $(if ($katd -ceq $exp) { 'OK  ' } else { 'HATA' }), $katd))
    if ($katd -cne $exp) { $fails++ }
  } finally { Remove-Item -LiteralPath $base -Recurse -Force -ErrorAction SilentlyContinue }
  $results | ForEach-Object { Write-Host $_ }
  Write-Host ('SELFTEST: ' + $(if ($fails -eq 0) { 'PASS' } else { 'FAIL' }) + ' | ' + ($results.Count - $fails) + '/' + $results.Count + ' | PS ' + $PSVersionTable.PSVersion)
  exit $(if ($fails -eq 0) { 0 } else { 1 })
}

# --- canli olcum ----------------------------------------------------------------
if (-not $Stage) { Write-Host 'HATA: -Stage S0|S1|S2|S3 ya da -SelfTest'; exit 2 }
try {
  $spec = New-Spec $Stage
  $started = Get-Date
  $checks = Test-Stage $spec $LIVE_PATHS (Get-LiveTasks) ${function:Get-Listeners} ([bool]$ExpectRunning)
  $bad = @($checks | Where-Object { -not $_.ok })
  $verdict = if ($bad.Count -eq 0) { 'PASS' } else { 'FAIL' }
  Write-Host ('ASAMA ' + $Stage + ' - ' + $spec.title + ' | uclu=' + $spec.tuple.name + ' | uygulama=' + $spec.app.name)
  foreach ($c in $checks) { Write-Host (('{0}  {1}' -f $(if ($c.ok) { 'OK  ' } else { 'FAIL' }), $c.id) + $(if ($c.ok) { '' } else { ' | olculen=' + $c.actual + ' | beklenen=' + $c.expected })) }
  Write-Host ('HUKUM: ' + $verdict + ' | ' + ($checks.Count - $bad.Count) + '/' + $checks.Count + ' | sure ' + [int]((Get-Date) - $started).TotalSeconds + ' sn')
  if ($EvidencePath) {
    if (Test-Path -LiteralPath $EvidencePath) { throw "kanit dosyasi zaten var: $EvidencePath" }
    $rec = [ordered]@{ record = 'R26-P1-STAGE-GATE'; stage = $Stage; title = $spec.title; tuple = $spec.tuple.name; app = $spec.app.name
      expectRunning = [bool]$ExpectRunning; tsUtc = (Get-Date).ToUniversalTime().ToString('o'); verdict = $verdict
      scriptSha256 = (Get-Sha $PSCommandPath); envContentRead = $false; checks = $checks }
    [IO.File]::WriteAllText($EvidencePath, ($rec | ConvertTo-Json -Depth 6), (New-Object Text.UTF8Encoding($false)))
  }
  exit $(if ($verdict -eq 'PASS') { 0 } else { 1 })
} catch { Write-Host ('OLCUM HATASI: ' + $_.Exception.Message); exit 2 }
