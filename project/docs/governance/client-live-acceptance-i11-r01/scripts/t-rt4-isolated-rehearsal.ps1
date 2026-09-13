param(
  [string]$ScriptDir = 'C:\Development\HUKUK_YAZILIMI\project\project\docs\governance\client-live-acceptance-i11-r01\scripts'
)
# T-PENCERE-KAPA R-T4a / R-T4b - YUKSELTILMIS, CANLI DISI, IZOLE sinama (CLIENT R08).
#
# URETIM KOD YOLU: t-window-close.ps1 sha256 ile dogrulanir; Invoke-WindowRecoveryRT4 fonksiyonunun metni
# bu dosyadan AST ile ALINIR ve AYNEN tanimlanir (kopya yok). Canli cagri satirinin dosyada birebir var
# oldugu da dogrulanir. Sinama yalniz hedef adlarini degistirir: kural deseni, gorev adi, port.
#
# IZOLASYON: kural oneki HYRT4S-<id>-BLOCK- (canli 'I11-WINDOW-BLOCK-*' ile cakismaz) · gorev HYRT4S-<id>-WEB
# (HukukPlatform-* degil) · 47100-47199 araligindan serbest iki port (8080/3002 degil). Canli gorev/port/kural
# OKUNUR, DEGISTIRILMEZ; once/sonra olculur.
#
# OLUSTURULUP SILINENLER: 2 gelen-engel kurali (HYRT4S-<id>-BLOCK-<p1>, -<p2>; TCP, Profile Any; loopback etkilenmez),
# 1 zamanlanmis gorev (HYRT4S-<id>-WEB; tetikleyicisiz; eylemi 127.0.0.1:<p2> dinleyen gecici powershell),
# karalama dizininde kanit dosyalari. Sir/env OKUNMAZ ve yazilmaz.
#
# SENARYOLAR: S1 basari · S2a R-T4a kismi hata (1. kural gercekten silinir, 2. kaldirmada enjekte hata) · S3a ayni
# cagri tekrari · S2b R-T4b hatasi (gorev ayaga kalkmaz; uretim butcesi 180 s) · S3b neden giderilip tekrar ·
# S4 idempotent tekrar. Sonda temizlik + artik sayimi + canli karsilastirma. Cikis 0 = tum kosullar saglandi.
# Bu dosya BILINCLI olarak yalniz ASCII'dir.
$ErrorActionPreference = 'Stop'
$CloseSha = '88BCEA01A2A956F4E0AB5976E670162014860FF98E4E68177D4951718E3AB9D7'
$FnName = 'Invoke-WindowRecoveryRT4'
$LiveCall = "Invoke-WindowRecoveryRT4 -FwPattern 'I11-WINDOW-BLOCK-*' -WebTask 'HukukPlatform-Web' -WebPort 3002 -Budget `$BudgetSec -ErrList `$rt4Err"
$Budget = 180
$S = 'C:\Users\ulastelli\AppData\Local\Temp\claude\C--Development-HUKUK-YAZILIMI-project\894280b1-443c-4406-86cd-b9e22aad3f7b\scratchpad'

# ---- K-ELEV: yukseltilmis degilse HICBIR sey yapilmaz ----
$wp = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $wp.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  throw 'K-ELEV: oturum YUKSELTILMIS Administrators DEGIL - firewall islemleri yapilamaz; HICBIR degisiklik yapilmadi.'
}

$RunId = ([guid]::NewGuid().ToString('N')).Substring(0, 8)
$OutDir = Join-Path $S "i11s\rt4s\RT4S-$RunId"
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$LogFile = Join-Path $OutDir "RT4S-$RunId.log"
function Log([string]$m) { Write-Host $m; Add-Content -LiteralPath $LogFile -Value $m -Encoding ASCII }
Log "RT4S runId=$RunId | PS $($PSVersionTable.PSVersion) | yukseltilmis=True | $(Get-Date -Format o)"

# ---- URETIM KOD YOLU ----
$closePath = Join-Path $ScriptDir 't-window-close.ps1'
$h = (Get-FileHash -Algorithm SHA256 -LiteralPath $closePath).Hash
if ($h -ne $CloseSha) { throw "T-KAPA sha UYUSMUYOR ($h) - DUR" }
$tok = $null; $perr = $null
$ast = [Management.Automation.Language.Parser]::ParseFile($closePath, [ref]$tok, [ref]$perr)
if ($perr.Count -ne 0) { throw "T-KAPA ayristirma hatasi $($perr.Count) - DUR" }
$fns = @($ast.FindAll({ param($n) ($n -is [Management.Automation.Language.FunctionDefinitionAst]) -and ($n.Name -eq $FnName) }, $true))
if ($fns.Count -ne 1) { throw "T-KAPA icinde $FnName sayisi $($fns.Count) (1 olmali) - DUR" }
$fnText = $fns[0].Extent.Text
$fnSha = [BitConverter]::ToString([Security.Cryptography.SHA256]::Create().ComputeHash([Text.Encoding]::UTF8.GetBytes($fnText))).Replace('-', '')
$rawClose = [IO.File]::ReadAllText($closePath)
if (-not $rawClose.Contains($LiveCall)) { throw 'T-KAPA canli cagri satiri birebir bulunamadi - DUR' }
. ([scriptblock]::Create($fnText))
Log "URETIM: t-window-close.ps1 sha=$h | $FnName metni AST ile alindi (satir $($fns[0].Extent.StartLineNumber)-$($fns[0].Extent.EndLineNumber), metin sha=$fnSha) | canli cagri satiri dosyada VAR"

# ---- IZOLE HEDEFLER ----
$Prefix = "HYRT4S-$RunId-BLOCK-"
$FwPattern = "$Prefix*"
$Task = "HYRT4S-$RunId-WEB"
$free = @()
foreach ($p in 47100..47199) {
  if (@(Get-NetTCPConnection -LocalPort $p -ErrorAction SilentlyContinue).Count -eq 0) { $free += $p }
  if ($free.Count -eq 2) { break }
}
if ($free.Count -ne 2) { throw 'serbest sinama portu bulunamadi - DUR' }
$BlockPorts = $free
$WebPort = $free[1]
if ($FwPattern -like 'I11-WINDOW-BLOCK-*' -or 'I11-WINDOW-BLOCK-8080' -like $FwPattern) { throw 'kural deseni canli ile cakisiyor - DUR' }
if ($Task -like 'HukukPlatform-*') { throw 'gorev adi canli ile cakisiyor - DUR' }
if (@($BlockPorts | Where-Object { $_ -in 8080, 3002 }).Count -ne 0) { throw 'sinama portu canli port - DUR' }
if (@(Get-NetFirewallRule -DisplayName $FwPattern -ErrorAction SilentlyContinue).Count -ne 0) { throw 'sinama kurali onceden var - DUR' }
if (@(Get-ScheduledTask -TaskName $Task -ErrorAction SilentlyContinue).Count -ne 0) { throw 'sinama gorevi onceden var - DUR' }
Log "HEDEFLER: kural deseni '$FwPattern' (portlar $($BlockPorts -join ', ')) | gorev '$Task' | web portu $WebPort | butce $Budget s"

$Listener = Join-Path $OutDir 'rt4s-listener.ps1'
$Flag = Join-Path $OutDir 'WEB-FAIL.flag'
$listenerText = @'
param([int]$Port, [string]$FailFlag, [int]$Seconds)
if (Test-Path -LiteralPath $FailFlag) { exit 7 }
$l = New-Object Net.Sockets.TcpListener([Net.IPAddress]::Loopback, $Port)
$l.Start()
$sw = [Diagnostics.Stopwatch]::StartNew()
while ($sw.Elapsed.TotalSeconds -lt $Seconds) { Start-Sleep -Milliseconds 500 }
$l.Stop()
'@
Set-Content -LiteralPath $Listener -Value $listenerText -Encoding ASCII

function Get-LiveSnapshot {
  $o = [ordered]@{}
  foreach ($t in 'HukukPlatform-API', 'HukukPlatform-Web') {
    $o["$t.State"] = try { [string](Get-ScheduledTask -TaskName $t -ErrorAction Stop).State } catch { 'OKUNAMADI' }
    $o["$t.LastRunTime"] = try { (Get-ScheduledTaskInfo -TaskName $t -ErrorAction Stop).LastRunTime.ToString('o') } catch { 'OKUNAMADI' }
  }
  foreach ($p in 8080, 3002) { $o["port$p.pid"] = (@(Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique) | Sort-Object) -join ',' }
  $o['I11-WINDOW-BLOCK.count'] = @(Get-NetFirewallRule -DisplayName 'I11-WINDOW-BLOCK-*' -ErrorAction SilentlyContinue).Count
  return (New-Object psobject -Property $o)
}
function Get-TestState {
  $ts = @(Get-ScheduledTask -TaskName $Task -ErrorAction SilentlyContinue)
  return (New-Object psobject -Property ([ordered]@{
    rules = @(Get-NetFirewallRule -DisplayName $FwPattern -ErrorAction SilentlyContinue).Count
    webListen = @(Get-NetTCPConnection -LocalPort $WebPort -State Listen -ErrorAction SilentlyContinue).Count
    task = if ($ts.Count) { [string]$ts[0].State } else { 'YOK' }
  }))
}
function New-TestBlockRules {
  # K-T6 ile ayni bicim; yalniz ad ve port sinamaya ait
  foreach ($pn in $BlockPorts) {
    New-NetFirewallRule -DisplayName "$Prefix$pn" -Direction Inbound -Action Block `
      -Protocol TCP -LocalPort $pn -Enabled True -Profile Any | Out-Null
  }
  $c = @(Get-NetFirewallRule -DisplayName $FwPattern -ErrorAction SilentlyContinue).Count
  if ($c -ne 2) { throw "sinama kurali sayisi $c (2 olmali)" }
}
function Stop-TestWeb {
  try { Stop-ScheduledTask -TaskName $Task -ErrorAction Stop } catch { }
  foreach ($pr in @(Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -and $_.CommandLine.Contains($Listener) })) {
    Stop-Process -Id ([int]$pr.ProcessId) -Force -ErrorAction SilentlyContinue
  }
  $sw = [Diagnostics.Stopwatch]::StartNew()
  while ($sw.Elapsed.TotalSeconds -lt 30) {
    if (@(Get-NetTCPConnection -LocalPort $WebPort -State Listen -ErrorAction SilentlyContinue).Count -eq 0) { return }
    Start-Sleep -Milliseconds 500
  }
  throw "sinama web portu $WebPort 30 s icinde bosalmadi"
}
function Remove-TestRules {
  foreach ($r in @(Get-NetFirewallRule -DisplayName $FwPattern -ErrorAction SilentlyContinue)) { Remove-NetFirewallRule -Name $r.Name }
}

$results = New-Object System.Collections.ArrayList
function Invoke-Scenario([string]$Name, [scriptblock]$Expect) {
  $pre = Get-TestState
  $removeType = [string](Get-Command -Name Remove-NetFirewallRule).CommandType
  $el = New-Object 'System.Collections.Generic.List[string]'
  $sw = [Diagnostics.Stopwatch]::StartNew()
  $lines = @(Invoke-WindowRecoveryRT4 -FwPattern $FwPattern -WebTask $Task -WebPort $WebPort -Budget $Budget -ErrList $el)
  $sw.Stop()
  $post = Get-TestState
  $errs = @($el)
  $ok = [bool](& $Expect $lines $errs $post)
  Log ''
  Log "== $Name ($([int]$sw.Elapsed.TotalSeconds) s) | Remove-NetFirewallRule cozumu: $removeType"
  Log "   once : kural=$($pre.rules) web_dinleyici=$($pre.webListen) gorev=$($pre.task)"
  foreach ($ln in $lines) { Log "   uretim> $ln" }
  Log "   hata listesi ($($errs.Count)): $($errs -join ' | ')"
  Log "   sonra: kural=$($post.rules) web_dinleyici=$($post.webListen) gorev=$($post.task)"
  Log "   SONUC: $(if ($ok) { 'PASS' } else { 'FAIL' })"
  [void]$results.Add((New-Object psobject -Property ([ordered]@{ name = $Name; seconds = [int]$sw.Elapsed.TotalSeconds; removeResolution = $removeType; pre = $pre; lines = $lines; errs = $errs; post = $post; pass = $ok })))
}

$liveBefore = Get-LiveSnapshot
Log "CANLI ONCE: $(($liveBefore | ConvertTo-Json -Compress))"
$leftovers = $null
$fatal = $null
try {
  $act = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$Listener`" -Port $WebPort -FailFlag `"$Flag`" -Seconds 900"
  $set = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 20)
  Register-ScheduledTask -TaskName $Task -Action $act -Settings $set -Description 'I11 R-T4 izole sinama (CLIENT R08) - canli DEGIL' | Out-Null
  Log "KURULUM: gorev '$Task' kaydedildi (tetikleyici yok)"

  # S1 - basari
  New-TestBlockRules; Stop-TestWeb
  Invoke-Scenario 'S1 basari' { param($l, $e, $p) ($e.Count -eq 0) -and (@($l | Where-Object { $_ -eq 'R-T4a: engelleme kurallari kaldirildi (2)' }).Count -eq 1) -and (@($l | Where-Object { $_ -like 'R-T4b: Web ayakta (*' }).Count -eq 1) -and ($p.rules -eq 0) -and ($p.webListen -ge 1) }
  Stop-TestWeb

  # S2a - R-T4a kismi hata: 1. kural GERCEKTEN silinir, 2. kaldirma enjekte hata ile duser; R-T4b yine calisir
  New-TestBlockRules
  $script:RealRemoveFw = Get-Command -Name Remove-NetFirewallRule
  $script:rmCalls = 0
  function script:Remove-NetFirewallRule { param([string]$Name) $script:rmCalls++; if ($script:rmCalls -eq 2) { throw 'ENJEKTE (sinama): ikinci kuralin kaldirilmasi basarisiz' }; & $script:RealRemoveFw -Name $Name }
  try {
    Invoke-Scenario 'S2a R-T4a kismi hata' { param($l, $e, $p) ($e.Count -eq 1) -and ($e[0] -like 'R-T4a: ENJEKTE*') -and (@($l | Where-Object { $_ -like '!!! R-T4a BASARISIZ: ENJEKTE*' }).Count -eq 1) -and (@($l | Where-Object { $_ -like 'R-T4b: Web ayakta (*' }).Count -eq 1) -and ($p.rules -eq 1) -and ($p.webListen -ge 1) }
  } finally {
    Remove-Item -Path 'Function:\Remove-NetFirewallRule'
    if ((Get-Command -Name Remove-NetFirewallRule).Definition -like '*ENJEKTE*') { throw 'enjeksiyon kaldirilamadi - sonraki senaryolar gecersiz olur' }
  }
  # S3a - ayni cagrinin tekrari (enjeksiyon YOK): kalan kural gercekten silinir, web zaten ayakta
  Invoke-Scenario 'S3a tekrar (R-T4a toparlanma)' { param($l, $e, $p) ($e.Count -eq 0) -and (@($l | Where-Object { $_ -eq 'R-T4a: engelleme kurallari kaldirildi (1)' }).Count -eq 1) -and (@($l | Where-Object { $_ -like 'R-T4b: Web ayakta (*' }).Count -eq 1) -and ($p.rules -eq 0) -and ($p.webListen -ge 1) }
  Stop-TestWeb

  # S2b - R-T4b hatasi: gorev eylemi dinlemeden cikar (bayrak); uretim butcesi 180 s tukenir; R-T4a basarili
  New-TestBlockRules
  Set-Content -LiteralPath $Flag -Value 'fail' -Encoding ASCII
  Invoke-Scenario 'S2b R-T4b hata' { param($l, $e, $p) ($e.Count -eq 1) -and ($e[0] -eq "R-T4b: Web $Budget sn icinde ayaga KALKMADI") -and (@($l | Where-Object { $_ -eq 'R-T4a: engelleme kurallari kaldirildi (2)' }).Count -eq 1) -and ($p.rules -eq 0) -and ($p.webListen -eq 0) }
  # S3b - neden giderilir (bayrak kalkar), ayni cagri tekrar
  [IO.File]::Delete($Flag)
  Invoke-Scenario 'S3b tekrar (R-T4b toparlanma)' { param($l, $e, $p) ($e.Count -eq 0) -and (@($l | Where-Object { $_ -eq 'R-T4a: engelleme kurallari kaldirildi (0)' }).Count -eq 1) -and (@($l | Where-Object { $_ -like 'R-T4b: Web ayakta (*' }).Count -eq 1) -and ($p.rules -eq 0) -and ($p.webListen -ge 1) }
  # S4 - idempotent tekrar
  Invoke-Scenario 'S4 idempotent tekrar' { param($l, $e, $p) ($e.Count -eq 0) -and (@($l | Where-Object { $_ -eq 'R-T4a: engelleme kurallari kaldirildi (0)' }).Count -eq 1) -and (@($l | Where-Object { $_ -like 'R-T4b: Web ayakta (*' }).Count -eq 1) -and ($p.rules -eq 0) -and ($p.webListen -ge 1) }
} catch {
  $fatal = $_.Exception.Message
  Log "!!! SINAMA KESILDI: $fatal"
} finally {
  Log ''
  Log 'TEMIZLIK:'
  try { Stop-TestWeb; Log '   sinama web durduruldu' } catch { Log "   !!! web durdurma: $($_.Exception.Message)" }
  try { Remove-TestRules; Log '   sinama kurallari kaldirildi' } catch { Log "   !!! kural kaldirma: $($_.Exception.Message)" }
  try { if (@(Get-ScheduledTask -TaskName $Task -ErrorAction SilentlyContinue).Count) { Unregister-ScheduledTask -TaskName $Task -Confirm:$false }; Log '   sinama gorevi silindi' } catch { Log "   !!! gorev silme: $($_.Exception.Message)" }
  try { if (Test-Path -LiteralPath $Flag) { [IO.File]::Delete($Flag) } } catch { }
  $leftovers = New-Object psobject -Property ([ordered]@{
    rules = @(Get-NetFirewallRule -DisplayName 'HYRT4S-*' -ErrorAction SilentlyContinue).Count
    tasks = @(Get-ScheduledTask -TaskName 'HYRT4S-*' -ErrorAction SilentlyContinue).Count
    webListen = @(Get-NetTCPConnection -LocalPort $WebPort -State Listen -ErrorAction SilentlyContinue).Count
    listenerProcs = @(Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -and $_.CommandLine.Contains($Listener) }).Count
  })
  Log "ARTIK: kural(HYRT4S-*)=$($leftovers.rules) gorev(HYRT4S-*)=$($leftovers.tasks) web_dinleyici=$($leftovers.webListen) dinleyici_sureci=$($leftovers.listenerProcs)"
}
$liveAfter = Get-LiveSnapshot
$liveEqual = (($liveBefore | ConvertTo-Json -Compress) -ceq ($liveAfter | ConvertTo-Json -Compress))
Log "CANLI SONRA: $(($liveAfter | ConvertTo-Json -Compress))"
Log "CANLI ESIT: $liveEqual"
$allPass = (-not $fatal) -and ($results.Count -eq 6) -and (@($results | Where-Object { -not $_.pass }).Count -eq 0)
$clean = ($leftovers.rules -eq 0) -and ($leftovers.tasks -eq 0) -and ($leftovers.webListen -eq 0) -and ($leftovers.listenerProcs -eq 0)
$verdict = if ($allPass -and $clean -and $liveEqual) { 'PASS' } else { 'FAIL' }
$summary = New-Object psobject -Property ([ordered]@{
  runId = $RunId; ps = [string]$PSVersionTable.PSVersion; closeSha = $h; functionTextSha = $fnSha
  targets = (New-Object psobject -Property ([ordered]@{ fwPattern = $FwPattern; blockPorts = $BlockPorts; task = $Task; webPort = $WebPort; budget = $Budget }))
  liveBefore = $liveBefore; liveAfter = $liveAfter; liveEqual = $liveEqual
  scenarios = $results; fatal = $fatal; leftovers = $leftovers; verdict = $verdict
})
$jsonPath = Join-Path $OutDir "RT4S-$RunId.json"
Set-Content -LiteralPath $jsonPath -Value ($summary | ConvertTo-Json -Depth 6) -Encoding ASCII
Log ''
Log "SONUC: $verdict | senaryo PASS $(@($results | Where-Object { $_.pass }).Count)/6 | artik temiz=$clean | canli esit=$liveEqual"
# Kanit satiri log'a YAZILMAZ: yazilsaydi basilan log sha'si dosyayla eslesmezdi.
Write-Host "KANIT: $LogFile (sha $((Get-FileHash -Algorithm SHA256 -LiteralPath $LogFile).Hash)) | $jsonPath (sha $((Get-FileHash -Algorithm SHA256 -LiteralPath $jsonPath).Hash))"
if ($verdict -ne 'PASS') { exit 1 }
exit 0
