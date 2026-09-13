param(
  [string]$ScriptDir = 'C:\Development\HUKUK_YAZILIMI\project\project\docs\governance\client-live-acceptance-i11-r01\scripts'
)
# T-PENCERE-KAPA R-T4a / R-T4b - YUKSELTILMIS, CANLI DISI, IZOLE sinama (CLIENT R09, KESIN KIMLIK).
#
# URETIM KOD YOLU: t-window-close.ps1 sha256 ile dogrulanir; Invoke-WindowRecoveryRT4 fonksiyonu bu dosyadan
# AST ile ALINIR ve AYNEN tanimlanir (kopya yok). Canli cagri satirinin dosyada birebir var oldugu da
# dogrulanir. Sinama YALNIZ izole kayit dosyasi / gorev / port kullanir; fonksiyon degismez.
#
# OWNER SARTININ DORT OGESI (owner GO "SON DAR KOMUT DUZELTMESI"): (1) kesin kimlik (2) joker yok
# (3) sorgu/erisim hatasi != yokluk (4) baska kurala dokunma - senaryolarla dogrulanir.
#
# IZOLASYON: kural adlari 'HYRT4S-<runId>-BLOCK-<port>' (canli 'I11-WINDOW-BLOCK-*' ile CAKISMAZ) -
# gorev 'HYRT4S-<runId>-WEB' (HukukPlatform-* degil) - 47100-47199 iki serbest port (8080/3002 degil).
# Kayit dosyasi izole yedek dizinine korumali yazilir. Canli gorev/port/kural OKUNUR, DEGISTIRILMEZ.
#
# SENARYOLAR: S1 basari - S2a kismi hata (2. ad kaldirilamaz, R-T4b yine kosar) - S3a tekrar (zaten yok
# guvenle gecilir) - S2b R-T4b hata - S3b tekrar - S4 idempotent - S5 sorgu hatasi != yokluk (baska ada
# dokunma) - S6 ozellik uyusmaz (dokunma) - S7 kayit dosyasi yok/guvenilmez. Sonda temizlik + artik + canli.
# Bu dosya BILINCLI olarak yalniz ASCII'dir.
$ErrorActionPreference = 'Stop'
$CloseSha = '676C1542089C251F31318B4FC8D3884596831AB9EC8662BE0FFA822F90382DEF'
$FnName = 'Invoke-WindowRecoveryRT4'
$LiveCall = "Invoke-WindowRecoveryRT4 -FwRecordFile `$FwRecord -NamePattern '^I11-WINDOW-BLOCK-(?<port>8080|3002)-[0-9]{8}T[0-9]{6}Z-[0-9a-f]{8}`$' -WebTask 'HukukPlatform-Web' -WebPort 3002 -Budget `$BudgetSec -ErrList `$rt4Err"
$Budget = 12
$S = 'C:\Users\ulastelli\AppData\Local\Temp\claude\C--Development-HUKUK-YAZILIMI-project\894280b1-443c-4406-86cd-b9e22aad3f7b\scratchpad'

# ---- K-ELEV ----
$wp = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $wp.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  throw 'K-ELEV: oturum YUKSELTILMIS Administrators DEGIL - firewall islemleri yapilamaz; HICBIR degisiklik yapilmadi.'
}
$me = [Security.Principal.WindowsIdentity]::GetCurrent().Name
$Trusted = @('NT AUTHORITY\SYSTEM', 'BUILTIN\Administrators', $me)
# T-KAPA ile AYNI Get-TrustProblem (fonksiyon buna baglidir)
function Get-TrustProblem([string]$path, [bool]$mustProtect) {
  if (-not (Test-Path -LiteralPath $path)) { return "YOK ($path)" }
  $item = Get-Item -LiteralPath $path -Force
  $a = Get-Acl -LiteralPath $path
  $bad = @()
  if ((([int]$item.Attributes) -band 0x400) -ne 0) { $bad += 'reparse noktasi (baglanti/junction)' }
  if ($Trusted -notcontains $a.Owner) { $bad += "sahip=$($a.Owner)" }
  if ($mustProtect -and -not $a.AreAccessRulesProtected) { $bad += 'DACL korumasiz' }
  $foreign = @($a.Access | Where-Object { $Trusted -notcontains $_.IdentityReference.Value })
  if ($foreign.Count -ne 0) { $bad += "yabanci kural $($foreign.Count)" }
  return ($bad -join '; ')
}
function Set-TrustedAcl([string]$path, [bool]$isDir) {
  if (-not (Get-TrustProblem $path $true)) { return }
  $inh = if ($isDir) { '(OI)(CI)' } else { '' }
  $meSid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
  $ic = & icacls.exe $path /inheritance:r /grant:r "*S-1-5-18:${inh}F" "*S-1-5-32-544:${inh}F" "*${meSid}:${inh}F" 2>&1
  if ($LASTEXITCODE -ne 0) { throw "icacls basarisiz (cikis $LASTEXITCODE): $($ic -join ' ')" }
}

$RunId = ([guid]::NewGuid().ToString('N')).Substring(0, 8)
$OutDir = Join-Path $S "i11s\rt4s\RT4S-$RunId"
# OutDir KORUMASI (ana yurutucu bulgusu 1): -Force YOK (onceden yerlestirilmis, yabanci sahipli dizin/dosya
# kabul edilmez). Olustur -> korumali DACL -> guven denetimi bos -> ici bos. Aksi halde DUR.
if (Test-Path -LiteralPath $OutDir) { throw "OutDir zaten var ($OutDir) - onceden yerlestirilmis olabilir; DUR" }
New-Item -ItemType Directory -Path $OutDir | Out-Null
Set-TrustedAcl $OutDir $true
$pOut = Get-TrustProblem $OutDir $true
if ($pOut) { throw "OutDir guvenilir DEGIL ($pOut) - DUR" }
if (@(Get-ChildItem -LiteralPath $OutDir -Force).Count -ne 0) { throw 'OutDir korumaya alinirken icine oge yerlestirilmis - DUR' }
$LogFile = Join-Path $OutDir "RT4S-$RunId.log"
function Log([string]$m) { Write-Host $m; Add-Content -LiteralPath $LogFile -Value $m -Encoding ASCII }
Log "RT4S runId=$RunId | PS $($PSVersionTable.PSVersion) | yukseltilmis=True | KESIN KIMLIK | $(Get-Date -Format o)"

# ---- URETIM KOD YOLU ----
$closePath = Join-Path $ScriptDir 't-window-close.ps1'
# TEK OKUMA (ana yurutucu bulgusu 3): dosya BIR KEZ okunur; sha ayni metinden hesaplanir; ayni metin
# ParseInput ile ayristirilir. Hash-sonra-tekrar-oku araligi kapatilir.
$closeText = [IO.File]::ReadAllText($closePath)
$h = [BitConverter]::ToString([Security.Cryptography.SHA256]::Create().ComputeHash([Text.Encoding]::UTF8.GetBytes($closeText))).Replace('-', '')
if ($h -ne $CloseSha) { throw "T-KAPA sha UYUSMUYOR ($h) - DUR" }
$tok = $null; $perr = $null
$ast = [Management.Automation.Language.Parser]::ParseInput($closeText, [ref]$tok, [ref]$perr)
if ($perr.Count -ne 0) { throw "T-KAPA ayristirma hatasi $($perr.Count) - DUR" }
$fns = @($ast.FindAll({ param($n) ($n -is [Management.Automation.Language.FunctionDefinitionAst]) -and ($n.Name -eq $FnName) }, $true))
if ($fns.Count -ne 1) { throw "T-KAPA icinde $FnName sayisi $($fns.Count) (1 olmali) - DUR" }
$fnText = $fns[0].Extent.Text
$fnSha = [BitConverter]::ToString([Security.Cryptography.SHA256]::Create().ComputeHash([Text.Encoding]::UTF8.GetBytes($fnText))).Replace('-', '')
if (-not $closeText.Contains($LiveCall)) { throw 'T-KAPA canli cagri satiri birebir bulunamadi - DUR' }
. ([scriptblock]::Create($fnText))
Log "URETIM: t-window-close.ps1 sha=$h | $FnName AST ile alindi (satir $($fns[0].Extent.StartLineNumber)-$($fns[0].Extent.EndLineNumber), metin sha=$fnSha) | canli cagri satiri VAR"

# ---- IZOLE HEDEFLER ----
$free = @(); foreach ($p in 47100..47199) { if (@(Get-NetTCPConnection -LocalPort $p -ErrorAction SilentlyContinue).Count -eq 0) { $free += $p }; if ($free.Count -eq 2) { break } }
if ($free.Count -ne 2) { throw 'serbest sinama portu bulunamadi - DUR' }
$WebPort = $free[1]
$Names = @($free | ForEach-Object { "HYRT4S-$RunId-BLOCK-$_" })
$Task = "HYRT4S-$RunId-WEB"
if (@($Names | Where-Object { $_ -like 'I11-WINDOW-BLOCK-*' }).Count -ne 0) { throw 'kural adi canli ile cakisiyor - DUR' }
if ($Task -like 'HukukPlatform-*') { throw 'gorev adi canli - DUR' }
if (@($free | Where-Object { $_ -in 8080, 3002 }).Count -ne 0) { throw 'sinama portu canli - DUR' }
$RecDir = Join-Path $OutDir 'rec'
$Rec = Join-Path $RecDir 'FW-RULES.txt'
$BadRec = Join-Path $OutDir 'FW-RULES-bad.txt'
Log "HEDEFLER: adlar $($Names -join ', ') (portlar $($free -join ', ')) | gorev '$Task' | web portu $WebPort | butce $Budget s"

# DINLEYICI DOSYASIZ (ana yurutucu bulgusu 2): gorev eylemi bir .ps1 YOLU calistirmaz; kod -EncodedCommand
# ile gorev tanimina gomulur (yukseltilmis kayitla korunur). Boylece ust zincir yeniden adlandirsa da
# gorev BASKA/degistirilmis bir kod dosyasi calistiramaz. Port/bayrak/sure encode aninda gomulur.
# Bayrak yalniz VERI dosyasidir (kod degil); korumali OutDir'de durur, kurcalanirsa en fazla senaryo
# sonucunu bozar, kod yurutmez.
$Flag = Join-Path $OutDir 'WEB-FAIL.flag'
$listenerSrc = @"
if (Test-Path -LiteralPath '$Flag') { exit 7 }
`$l = New-Object Net.Sockets.TcpListener([Net.IPAddress]::Loopback, $WebPort); `$l.Start()
`$sw = [Diagnostics.Stopwatch]::StartNew(); while (`$sw.Elapsed.TotalSeconds -lt 900) { Start-Sleep -Milliseconds 500 }; `$l.Stop()
"@
$Enc = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($listenerSrc))

function New-Rec([string[]]$names, [int[]]$ports) {
  if (Test-Path -LiteralPath $RecDir) { Remove-Item -LiteralPath $RecDir -Recurse -Force }
  New-Item -ItemType Directory -Path $RecDir | Out-Null
  Set-TrustedAcl $RecDir $true
  Set-Content -LiteralPath $Rec -Value @(0..($names.Count-1) | ForEach-Object { "$($ports[$_]) $($names[$_])" }) -Encoding ASCII
  Set-TrustedAcl $Rec $false
}
function New-IsoRule([string]$name, [int]$port) {
  New-NetFirewallRule -Name $name -DisplayName $name -Direction Inbound -Action Block -Protocol TCP -LocalPort $port -Enabled True -Profile Any -ErrorAction Stop | Out-Null
}
function Iso-RuleCount { @($Names | Where-Object { @(Get-NetFirewallRule -Name $_ -ErrorAction SilentlyContinue).Count -eq 1 }).Count }
function Stop-TestWeb {
  try { Stop-ScheduledTask -TaskName $Task -ErrorAction Stop } catch { }
  foreach ($pr in @(Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -and $_.CommandLine.Contains($Enc) })) { Stop-Process -Id ([int]$pr.ProcessId) -Force -ErrorAction SilentlyContinue }
  $sw = [Diagnostics.Stopwatch]::StartNew(); while ($sw.Elapsed.TotalSeconds -lt 30) { if (@(Get-NetTCPConnection -LocalPort $WebPort -State Listen -ErrorAction SilentlyContinue).Count -eq 0) { return }; Start-Sleep -Milliseconds 500 }
  throw "sinama web portu $WebPort 30 s icinde bosalmadi"
}
function Remove-IsoRules { foreach ($n in $Names) { foreach ($r in @(Get-NetFirewallRule -Name $n -ErrorAction SilentlyContinue)) { Remove-NetFirewallRule -Name $r.Name } } }

# baska pencereye ait AYNI Display'li kural + ilgisiz kural (dokunulmama taniklari)
$OtherName = "HYRT4S-$RunId-OTHER-BLOCK-$($free[0])"
$OtherDisplaySameAsFirst = "$($Names[0])"  # ayni DisplayName, farkli Name
$Witness = "HYRT4S-$RunId-WITNESS"
$results = New-Object System.Collections.ArrayList
function Scen([string]$Name, [scriptblock]$Setup, [scriptblock]$Expect) {
  & $Setup
  $wBefore = @(Get-NetFirewallRule -Name $Witness -ErrorAction SilentlyContinue).Count
  $oBefore = @(Get-NetFirewallRule -Name $OtherName -ErrorAction SilentlyContinue).Count
  $el = New-Object 'System.Collections.Generic.List[string]'
  $lines = @(Invoke-WindowRecoveryRT4 -FwRecordFile $Rec -NamePattern '^HYRT4S-[0-9a-f]{8}-BLOCK-(?<port>[0-9]+)$' -WebTask $Task -WebPort $WebPort -Budget $Budget -ErrList $el)
  # A2: enjekte edilen script-kapsamli sahte cmdlet'leri POST olcumunden ONCE kaldir (yoksa Iso-RuleCount fatal)
  # YALNIZ enjekte edilen shadow'u kaldir: gercek NetSecurity fonksiyonu .Module='NetSecurity' tasir,
  # enjekte shadow .Module bostur. Kosulsuz kaldirma gercek cmdlet'i sokerdi (ana yurutucu bulgusu, olculdu).
  foreach ($sf in 'Get-NetFirewallRule', 'Remove-NetFirewallRule') { $fi = Get-Item "Function:\$sf" -ErrorAction SilentlyContinue; if ($fi -and -not $fi.Module) { Remove-Item "Function:\$sf" -ErrorAction SilentlyContinue } }
  $post = [pscustomobject]@{ iso = Iso-RuleCount; web = (@(Get-NetTCPConnection -LocalPort $WebPort -State Listen -ErrorAction SilentlyContinue).Count -ge 1); wit = @(Get-NetFirewallRule -Name $Witness -ErrorAction SilentlyContinue).Count; oth = @(Get-NetFirewallRule -Name $OtherName -ErrorAction SilentlyContinue).Count }
  $untouched = ($post.wit -eq $wBefore) -and ($post.oth -eq $oBefore)
  $ok = [bool](& $Expect $lines @($el) $post) -and $untouched
  Log ''
  Log "== $Name"
  foreach ($l in $lines) { Log "   > $l" }
  Log "   hata($($el.Count)): $(@($el) -join ' | ') | iso_kural=$($post.iso) web=$($post.web) tanik=$($post.wit) diger=$($post.oth) dokunulmadi=$untouched"
  Log "   SONUC: $(if ($ok) { 'PASS' } else { 'FAIL' })"
  [void]$results.Add($ok)
}

$liveBefore = @{}; foreach ($t in 'HukukPlatform-API', 'HukukPlatform-Web') { $liveBefore["$t"] = try { [string](Get-ScheduledTask -TaskName $t -ErrorAction Stop).State } catch { 'X' } }; foreach ($p in 8080, 3002) { $liveBefore["p$p"] = (@(Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique) | Sort-Object) -join ',' }; $liveBefore['iwb'] = @(Get-NetFirewallRule -DisplayName 'I11-WINDOW-BLOCK-*' -ErrorAction SilentlyContinue).Count
Log "CANLI ONCE: $(($liveBefore.GetEnumerator() | Sort-Object Name | ForEach-Object { "$($_.Key)=$($_.Value)" }) -join ' ')"
$fatal = $null; $leftovers = $null
try {
  $act = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -EncodedCommand $Enc"
  Register-ScheduledTask -TaskName $Task -Action $act -Settings (New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 20)) -Description 'I11 R-T4 izole sinama (CLIENT R09) - canli DEGIL' | Out-Null
  New-NetFirewallRule -Name $Witness -DisplayName $Witness -Direction Inbound -Action Block -Protocol TCP -LocalPort 47198 -Enabled True -Profile Any -ErrorAction Stop | Out-Null
  New-NetFirewallRule -Name $OtherName -DisplayName $OtherDisplaySameAsFirst -Direction Inbound -Action Block -Protocol TCP -LocalPort 47199 -Enabled True -Profile Any -ErrorAction Stop | Out-Null
  Log "KURULUM: gorev + tanik ($Witness) + baska-pencere ($OtherName, DisplayName='$OtherDisplaySameAsFirst')"

  Scen 'S1 basari' { New-Rec $Names $free; foreach($i in 0..1){ New-IsoRule $Names[$i] $free[$i] }; Stop-TestWeb } { param($l,$e,$p) $e.Count -eq 0 -and ($l | ? { $_ -like 'R-T4a: kesin-ad*kaldirilan 2, zaten yok 0*' }) -and ($l | ? { $_ -like 'R-T4b: Web ayakta*' }) -and $p.iso -eq 0 -and $p.web }
  Scen 'S2a kismi hata (2. ad silinemez)' { New-Rec $Names $free; foreach($i in 0..1){ New-IsoRule $Names[$i] $free[$i] }; Stop-TestWeb; $script:RealRm=Get-Command Remove-NetFirewallRule; $script:rmN=0; function script:Remove-NetFirewallRule { param([string]$Name) $script:rmN++; if($script:rmN -eq 1){ throw 'ENJEKTE (sinama): kaldirma basarisiz' }; & $script:RealRm -Name $Name } } { param($l,$e,$p) $e.Count -eq 1 -and ($e[0] -like 'R-T4a: *ENJEKTE*') -and ($l | ? { $_ -like 'R-T4b: Web ayakta*' }) -and $p.iso -eq 1 -and $p.web }
  Scen 'S3a tekrar (zaten yok guvenle gecilir)' { Stop-TestWeb } { param($l,$e,$p) $e.Count -eq 0 -and ($l | ? { $_ -like '*zaten YOK*' }) -and ($l | ? { $_ -like 'R-T4a: kesin-ad*kaldirilan 1, zaten yok 1*' }) -and $p.iso -eq 0 -and $p.web }
  Scen 'S2b R-T4b hata' { New-Rec $Names $free; foreach($i in 0..1){ New-IsoRule $Names[$i] $free[$i] }; Stop-TestWeb; Set-Content -LiteralPath $Flag -Value 'x' -Encoding ASCII } { param($l,$e,$p) $e.Count -eq 1 -and ($e[0] -eq "R-T4b: Web $Budget sn icinde ayaga KALKMADI") -and ($l | ? { $_ -like 'R-T4a: kesin-ad*kaldirilan 2*' }) -and $p.iso -eq 0 -and (-not $p.web) }
  Scen 'S3b tekrar (R-T4b toparlanma)' { [IO.File]::Delete($Flag) } { param($l,$e,$p) $e.Count -eq 0 -and ($l | ? { $_ -like 'R-T4a: kesin-ad*zaten yok 2*' }) -and ($l | ? { $_ -like 'R-T4b: Web ayakta*' }) -and $p.iso -eq 0 -and $p.web }
  Scen 'S4 idempotent' { Stop-TestWeb } { param($l,$e,$p) $e.Count -eq 0 -and ($l | ? { $_ -like 'R-T4a: kesin-ad*zaten yok 2*' }) -and $p.iso -eq 0 -and $p.web }
  Scen 'S5 sorgu hatasi != yokluk' { New-Rec $Names $free; foreach($i in 0..1){ New-IsoRule $Names[$i] $free[$i] }; Stop-TestWeb; $script:RealGet=Get-Command Get-NetFirewallRule; function script:Get-NetFirewallRule { param([string]$Name,$DisplayName,$ErrorAction) if($Name -eq $Names[0]){ Write-Error -Message 'ENJEKTE: erisim' -Category PermissionDenied -ErrorAction Stop }; if($DisplayName){ & $script:RealGet -DisplayName $DisplayName -ErrorAction:$ErrorAction } else { & $script:RealGet -Name $Name -ErrorAction:$ErrorAction } } } { param($l,$e,$p) $e.Count -eq 1 -and ($e[0] -like '*sorgu/erisim hatasi*yoklukla KARISTIRILMAZ*') -and $p.iso -eq 1 }
  Stop-TestWeb; Remove-IsoRules
  Scen 'S6 ozellik uyusmaz (dokunma)' { New-Rec $Names $free; New-NetFirewallRule -Name $Names[0] -DisplayName $Names[0] -Direction Inbound -Action Block -Protocol TCP -LocalPort 47197 -Enabled True -Profile Any -ErrorAction Stop | Out-Null; New-IsoRule $Names[1] $free[1]; Stop-TestWeb } { param($l,$e,$p) $e.Count -eq 1 -and ($e[0] -like '*ozellikleri beklenenden farkli*DOKUNULMADI*') -and $p.iso -eq 1 }
  Stop-TestWeb; Remove-IsoRules
  Scen 'S7 kayit dosyasi yok' { if(Test-Path $RecDir){ Remove-Item $RecDir -Recurse -Force }; Stop-TestWeb } { param($l,$e,$p) $e.Count -eq 1 -and ($e[0] -like '*firewall kayit dosyasi guvenilir DEGIL*') -and ($l | ? { $_ -like 'R-T4b: Web ayakta*' }) -and $p.web }
} catch { $fatal = $_.Exception.Message; Log "!!! KESILDI: $fatal" }
finally {
  Log ''; Log 'TEMIZLIK:'
  foreach ($sf in 'Remove-NetFirewallRule', 'Get-NetFirewallRule') { $fi = Get-Item "Function:\$sf" -ErrorAction SilentlyContinue; if ($fi -and -not $fi.Module) { Remove-Item "Function:\$sf" -ErrorAction SilentlyContinue } }
  try { Stop-TestWeb } catch { Log "   web: $($_.Exception.Message)" }
  try { Remove-IsoRules } catch { Log "   iso kural: $($_.Exception.Message)" }
  foreach ($n in @($Witness, $OtherName)) { foreach ($r in @(Get-NetFirewallRule -Name $n -ErrorAction SilentlyContinue)) { Remove-NetFirewallRule -Name $r.Name } }
  try { if (@(Get-ScheduledTask -TaskName $Task -ErrorAction SilentlyContinue).Count) { Unregister-ScheduledTask -TaskName $Task -Confirm:$false } } catch { Log "   gorev: $($_.Exception.Message)" }
  $leftovers = [pscustomobject]@{ rules = @(Get-NetFirewallRule -DisplayName 'HYRT4S-*' -ErrorAction SilentlyContinue).Count; namedRules = @($Names + $Witness + $OtherName | Where-Object { @(Get-NetFirewallRule -Name $_ -ErrorAction SilentlyContinue).Count -ne 0 }).Count; tasks = @(Get-ScheduledTask -TaskName 'HYRT4S-*' -ErrorAction SilentlyContinue).Count; procs = @(Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -and $_.CommandLine.Contains($Enc) }).Count }
  Log "ARTIK: HYRT4S-* kural=$($leftovers.rules) adli=$($leftovers.namedRules) gorev=$($leftovers.tasks) dinleyici=$($leftovers.procs)"
}
$liveAfter = @{}; foreach ($t in 'HukukPlatform-API', 'HukukPlatform-Web') { $liveAfter["$t"] = try { [string](Get-ScheduledTask -TaskName $t -ErrorAction Stop).State } catch { 'X' } }; foreach ($p in 8080, 3002) { $liveAfter["p$p"] = (@(Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique) | Sort-Object) -join ',' }; $liveAfter['iwb'] = @(Get-NetFirewallRule -DisplayName 'I11-WINDOW-BLOCK-*' -ErrorAction SilentlyContinue).Count
$liveEqual = (($liveBefore.GetEnumerator() | Sort-Object Name | ForEach-Object { "$($_.Key)=$($_.Value)" }) -join ' ') -ceq (($liveAfter.GetEnumerator() | Sort-Object Name | ForEach-Object { "$($_.Key)=$($_.Value)" }) -join ' ')
Log "CANLI SONRA: $(($liveAfter.GetEnumerator() | Sort-Object Name | ForEach-Object { "$($_.Key)=$($_.Value)" }) -join ' ') | ESIT=$liveEqual"
$allPass = (-not $fatal) -and ($results.Count -eq 9) -and (@($results | Where-Object { -not $_ }).Count -eq 0)
$clean = ($leftovers.rules -eq 0) -and ($leftovers.namedRules -eq 0) -and ($leftovers.tasks -eq 0) -and ($leftovers.procs -eq 0)
$verdict = if ($allPass -and $clean -and $liveEqual) { 'PASS' } else { 'FAIL' }
$json = [pscustomobject]@{ runId=$RunId; ps=[string]$PSVersionTable.PSVersion; closeSha=$h; functionTextSha=$fnSha; names=$Names; task=$Task; webPort=$WebPort; scenarioPass=@($results|?{$_}).Count; scenarioTotal=$results.Count; fatal=$fatal; leftovers=$leftovers; liveEqual=$liveEqual; verdict=$verdict }
$jsonPath = Join-Path $OutDir "RT4S-$RunId.json"
Set-Content -LiteralPath $jsonPath -Value ($json | ConvertTo-Json -Depth 6) -Encoding ASCII
Log ''; Log "SONUC: $verdict | senaryo $(@($results|?{$_}).Count)/$($results.Count) | artik temiz=$clean | canli esit=$liveEqual"
Write-Host "KANIT: $LogFile (sha $((Get-FileHash -Algorithm SHA256 -LiteralPath $LogFile).Hash)) | $jsonPath (sha $((Get-FileHash -Algorithm SHA256 -LiteralPath $jsonPath).Hash))"
if ($verdict -ne 'PASS') { exit 1 }
exit 0
