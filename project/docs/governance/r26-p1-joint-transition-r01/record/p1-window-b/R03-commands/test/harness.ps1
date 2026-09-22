# IZOLE SINAMA: gercek blok dosyalari DEGISTIRILMEDEN calistirilir; dis etkili tum komutlar sahte fonksiyonlarla golgelenir.
# Gercek gorev/dosya/HTTP/surec KULLANILMAZ. Tek override: Test-HLAdmin=$true ve $p -> sahte Preflight dizini (belgeli).
param([string]$Scenario)
$ErrorActionPreference='Stop'
$BLK=Split-Path $PSScriptRoot -Parent
$T=@{}; foreach($n in 'P0-tanimlar','B2-yedek','B3-durdur-kopyala','B4-muhur','B5-baslat','R1-geri-yukle','B8-kabul'){ $T[$n]=[IO.File]::ReadAllText((Join-Path $BLK "$n.ps1")) }
$OPSR='C:\Ops\hukuk\bin'; $CAND='D:\Development\HUKUK_YAZILIMI\HY_P1_A3_codex\P1-delivery\candidate'
$STUB=Join-Path $PSScriptRoot 'stub-p1'
$OLDH=@{ 'start-api.ps1'='CC634BBFE0BE8F4F06482EDB30FF1E687D36B08C075665E2EC160EA8082619B3'; 'hukuk-task-host.exe'='691BC146C9123B1625B4AE733EFE615F8AFFB77FB0C95EBFDAE621A6AA171627' }
$NEWH=@{ 'start-api.ps1'='DDCCD09157E0AAF209AB38316A33815A0298FFACBC9006ED62F35F137F86219C'; 'hukuk-task-host.exe'='27099BDF66C83A44B3061D65AE2DAF24EADB523EE4F464179C2F53BB6C78DEAB' }
$HX=@{ copyFail=$null; sealExit=@{api=0;web=0}; sealTimeout=@{api=$false;web=$false}; apiDelayNew=40; apiDelayOld=40; webDelay=10; unstoppable=$false; unstoppableAfter=$null; gateExit=0 }
switch($Scenario){
  'HAPPY'          { }
  'COPY_FAIL'      { $HX.copyFail="$OPSR\hukuk-task-host.exe|B3" }
  'SEAL_FAIL'      { $HX.sealExit=@{api=0;web=102} }
  'SEAL_TIMEOUT'   { $HX.sealTimeout=@{api=$true;web=$false} }
  'API_TIMEOUT'    { $HX.apiDelayNew=-1 }
  'WEB_TIMEOUT'    { $HX.webDelayNew=-1 }
  'UNSTOPPABLE_B3' { $HX.unstoppable=$true }
  'UNSTOPPABLE_B5' { $HX.apiDelayNew=-1; $HX.unstoppableAfter='B5' }
  'R1_API_TIMEOUT' { $HX.apiDelayNew=-1; $HX.apiDelayOld=-1 }
  'R1_WEB_TIMEOUT' { $HX.apiDelayNew=-1; $HX.webDelayR1=-1 }
  'R1_GATE_FAIL'   { $HX.apiDelayNew=-1; $HX.gateExit=1 }
  'NO_B2'          { }
  'FOREIGN_LISTENER' { $HX.apiDelayNew=-1; $HX.foreign=@{ port=8080; from='B5'; exe='C:\Tools\other\node.exe'; code=401 } }
  'WRONG_HOST_PATH'  { $HX.treeFault=@{ phase='B5'; mode='api'; kind='hostpath' } }
  'WRONG_PARENT'     { $HX.treeFault=@{ phase='B5'; mode='api'; kind='parent' } }
  'WRONG_ENTRY'      { $HX.treeFault=@{ phase='B5'; mode='web'; kind='entry' } }
  'PID_REUSE'        { $HX.treeFault=@{ phase='B5'; mode='api'; kind='ctime' } }
  'ID_FLAP'          { $HX.treeFault=@{ phase='B5'; mode='api'; kind='flap' } }
  'R1_FOREIGN'       { $HX.apiDelayNew=-1; $HX.foreign=@{ port=3002; from='R1WEB'; exe='C:\Tools\other\node.exe'; code=200 } }
  'B8_NEWTREE'       { $HX.b8Restart=$true }
  default { throw "bilinmeyen senaryo $Scenario" }
}
$HV=@{ clock=0.0; phase=''; files=@{}; acl=@{}; content=@{}; dirs=@{}; log=[Collections.Generic.List[string]]::new()
      tasks=@{ 'API'=@{ enabled=$true; running=$true; started=-1000.0 }; 'WEB'=@{ enabled=$true; running=$true; started=-1000.0 } }; stuck=@{ API=$false; WEB=$false }; gen=0; flap=0; foreignOn=$false }
$HV.tasks.API.pids=@{host=51;pwsh=52;node=53}; $HV.tasks.API.tphase='ONCE'; $HV.tasks.WEB.pids=@{host=61;pwsh=62;node=63}; $HV.tasks.WEB.tphase='ONCE'
foreach($f in $OLDH.Keys){ $HV.files["$OPSR\$f"]=$OLDH[$f]; $HV.acl["$OPSR\$f"]="SDDL-$f" }
foreach($f in $NEWH.Keys){ $HV.files["$CAND\$f"]=$NEWH[$f] }
$HV.files["$OPSR\start-web.ps1"]='F39F7A54BC51972B94FD0CF13A08F4E1AB82822A528EDAD58FC8F2318C1F59E0'
$HV.files["$OPSR\db-readiness.js"]='AD18CBB621A2D58FD41B481C07A09D25726C150C2D9DA028C23B60986AD413A9'
$HV.files["$OPSR\pwsh-file-manifest.json"]='84E530B1A90F5A069C7C87B68B73948F574752650DB607DDFB29A959B9F0307A'
$HV.files["$STUB\OWNER-RUNBOOK.md"]='5F07A30A23BF20EDD7F225333F5D3D6A55EE1C2246BBC2C1BE7F1D0B22B81118'
$HV.files["$STUB\manifest.json"]='17CF1EEB99C5F1873E64DB291B89299B180781D45320ADB7775D9F1FFFDB845E'
foreach($f in $NEWH.Keys){ $HV.files["$STUB\candidate\$f"]=$NEWH[$f] }
$HV.files['D:\Development\HUKUK_YAZILIMI\project\project\docs\governance\r26-p1-joint-transition-r01\scripts\r26p1-stage-gate.ps1']='214465BBF85400B73BF7928036B1B3BF79D439249321A2C30C14C976A2155200'
function L($m){ $HV.log.Add(('{0,7:N1}s [{1}] {2}' -f $HV.clock,$HV.phase,$m)) }
function K($t){ if($t -match 'API'){'API'}elseif($t -match 'WEB|Web'){'WEB'}else{throw "gorev? $t"} }
function Get-ApiDelay { if($HV.phase -like 'R1*' -and $HV.files["$OPSR\start-api.ps1"] -eq $OLDH['start-api.ps1']){ $HX.apiDelayOld } elseif($HV.files["$OPSR\start-api.ps1"] -eq $NEWH['start-api.ps1']){ $HX.apiDelayNew } else { $HX.apiDelayOld } }
function Get-WebDelay { if($HV.phase -like 'R1*' -and $HX.ContainsKey('webDelayR1')){ $HX.webDelayR1 } elseif($HX.ContainsKey('webDelayNew') -and $HV.files["$OPSR\hukuk-task-host.exe"] -eq $NEWH['hukuk-task-host.exe']){ $HX.webDelayNew } else { $HX.webDelay } }
function Test-Up($k){ $t=$HV.tasks[$k]; if(-not $t.running){ return $false }; $d=if($k -eq 'API'){Get-ApiDelay}else{Get-WebDelay}; if($t.started -lt -500){ return $true }; ($d -ge 0 -and ($HV.clock - $t.started) -ge $d) }
# ---- golgeler ----
function Get-Date { [datetime]::new(2026,9,22,12,0,0,[DateTimeKind]::Utc).AddSeconds($HV.clock) }
function Start-Sleep { [CmdletBinding()] param([int]$Seconds,[int]$Milliseconds) $HV.clock += $Seconds + $Milliseconds/1000.0 }
function Disable-ScheduledTask { [CmdletBinding()] param([string]$TaskName) $k=K $TaskName; $HV.tasks[$k].enabled=$false; L "disable:$k"; [pscustomobject]@{TaskName=$TaskName} }
function Enable-ScheduledTask  { [CmdletBinding()] param([string]$TaskName) $k=K $TaskName; $HV.tasks[$k].enabled=$true;  L "enable:$k";  [pscustomobject]@{TaskName=$TaskName} }
function Stop-ScheduledTask    { [CmdletBinding()] param([string]$TaskName) $k=K $TaskName; L "stop:$k"; $stuck=$HX.unstoppable -or ($HX.unstoppableAfter -and $HV.phase -eq $HX.unstoppableAfter); if($stuck){ $HV.stuck[$k]=$true } else { $HV.tasks[$k].running=$false } }
function New-Tree($k){ $HV.gen++; $b0=10000*$HV.gen + $(if($k -eq 'API'){0}else{5000}); $HV.tasks[$k].pids=@{ host=$b0+1; pwsh=$b0+2; node=$b0+3 }; $HV.tasks[$k].tphase=$HV.phase }
function Start-ScheduledTask   { [CmdletBinding()] param([string]$TaskName) $k=K $TaskName; if(-not $HV.tasks[$k].enabled){ throw "gorev disabled: $k" }; L "start:$k"; if($HX.foreign -and $HX.foreign.from -eq 'R1WEB' -and $HV.phase -eq 'R1' -and $k -eq 'WEB'){ $HV.foreignOn=$true; L 'YABANCI-DINLEYICI-BELIRDI:3002' }; if(-not $HV.tasks[$k].running){ $HV.tasks[$k].running=$true; $HV.tasks[$k].started=$HV.clock; New-Tree $k } elseif($HX.b8Restart -and $HV.phase -eq 'B8'){ $HV.tasks[$k].started=$HV.clock; New-Tree $k; L "YENI-AGAC:$k" } }
function Get-ScheduledTask     { [CmdletBinding()] param([string[]]$TaskName) foreach($n in $TaskName){ $k=K $n; $t=$HV.tasks[$k]; $st= if($t.running -or $HV.stuck[$k]){'Running'}elseif(-not $t.enabled){'Disabled'}else{'Ready'}; [pscustomobject]@{ TaskName=$n; State=$st; Settings=[pscustomobject]@{Enabled=$t.enabled} } } }
function Export-ScheduledTask  { [CmdletBinding()] param([string]$TaskName) '<Task/>' }
function Test-ForeignOn($pt){ $HX.foreign -and $HX.foreign.port -eq $pt -and ($HV.foreignOn -or $HV.phase -eq $HX.foreign.from) }
function Get-NetTCPConnection  { [CmdletBinding()] param([string]$State,[int[]]$LocalPort) foreach($pt in $LocalPort){ $k= if($pt -eq 8080){'API'}else{'WEB'}
    if((Test-Up $k) -or $HV.stuck[$k]){ [pscustomobject]@{ LocalPort=$pt; OwningProcess=$HV.tasks[$k].pids.node } }
    if(Test-ForeignOn $pt){ $HV.foreignOn=$true; [pscustomobject]@{ LocalPort=$pt; OwningProcess=9001 } } } }
function Get-CimInstance { [CmdletBinding()] param([Parameter(Position=0)]$ClassName,[string]$Filter)
  $all=[Collections.Generic.List[object]]::new(); $base=[datetime]::new(2026,9,22,12,0,0,[DateTimeKind]::Local)
  foreach($k in 'API','WEB'){ $t=$HV.tasks[$k]; if($t.running -or $HV.stuck[$k]){ $m=$(if($k -eq 'API'){'api'}else{'web'}); $pp=$t.pids; $c0=$base.AddSeconds($t.started)
    $f=$(if($HX.treeFault -and $HX.treeFault.mode -eq $m -and $t.tphase -eq $HX.treeFault.phase){$HX.treeFault.kind}else{''})
    $hExe=$(if($f -eq 'hostpath'){'C:\Temp\hukuk-task-host.exe'}else{'C:\Ops\hukuk\bin\hukuk-task-host.exe'})
    $hC=$(if($f -eq 'ctime'){$c0.AddSeconds(100)}else{$c0})
    $nPar=$(if($f -eq 'parent'){4000}else{$pp.pwsh})
    $entry=$(if($m -eq 'api'){'C:\Development\HUKUK_YAZILIMI\HY_W4_RELEASE23\project\apps\api\dist\apps\api\src\main.js'}else{'C:\Development\HUKUK_YAZILIMI\HY_W4_RELEASE23\project\apps\web\node_modules\next\dist\bin\next start --port 3002'})
    if($f -eq 'entry'){ $entry='C:\Development\HUKUK_YAZILIMI\HY_W4_RELEASE23\project\apps\web\node_modules\next\dist\bin\next dev --port 3002' }
    $nC=$c0.AddSeconds(2); if($f -eq 'flap'){ $HV.flap++; $nC=$c0.AddSeconds(2+$HV.flap) }
    $all.Add([pscustomobject]@{ Name='hukuk-task-host.exe'; ProcessId=$pp.host; ParentProcessId=700; ExecutablePath=$hExe; CreationDate=$hC; CommandLine="`"$hExe`" $m" })
    $all.Add([pscustomobject]@{ Name='pwsh.exe'; ProcessId=$pp.pwsh; ParentProcessId=$pp.host; ExecutablePath='C:\Ops\hukuk\pwsh\pwsh.exe'; CreationDate=$c0.AddSeconds(1); CommandLine="`"C:\Ops\hukuk\pwsh\pwsh.exe`" -NoProfile -NonInteractive -File C:\Ops\hukuk\bin\start-$m.ps1" })
    $all.Add([pscustomobject]@{ Name='node.exe'; ProcessId=$pp.node; ParentProcessId=$nPar; ExecutablePath='C:\Users\ulastelli\AppData\Local\Volta\tools\image\node\24.18.0\node.exe'; CreationDate=$nC; CommandLine="`"C:\Users\ulastelli\AppData\Local\Volta\tools\image\node\24.18.0\node.exe`" $entry" }) } }
  $all.Add([pscustomobject]@{ Name='explorer.exe'; ProcessId=4000; ParentProcessId=1; ExecutablePath='C:\Windows\explorer.exe'; CreationDate=$base.AddSeconds(-9999); CommandLine='C:\Windows\explorer.exe' })
  $all.Add([pscustomobject]@{ Name='node.exe'; ProcessId=999; ParentProcessId=4000; ExecutablePath='C:\Program Files\nodejs\node.exe'; CreationDate=$base; CommandLine='node C:\baska\arac.js HY_W4_RELEASE23\node_modules\@prisma' })
  if($HV.foreignOn){ $all.Add([pscustomobject]@{ Name='node.exe'; ProcessId=9001; ParentProcessId=4000; ExecutablePath=$HX.foreign.exe; CreationDate=$base; CommandLine="`"$($HX.foreign.exe)`" server.js" }) }
  if($Filter -match '^ProcessId=(\d+)$'){ $id=[int]$matches[1]; return @($all | Where-Object { $_.ProcessId -eq $id }) }
  $names=@([regex]::Matches($Filter,"Name='([^']+)'") | ForEach-Object { $_.Groups[1].Value })
  @($all | Where-Object { $names -contains $_.Name }) }
function Get-FileHash { [CmdletBinding()] param([Parameter(Position=0)]$Path,$LiteralPath,$Algorithm) $x= if($LiteralPath){$LiteralPath}else{$Path}; if(-not $HV.files.ContainsKey($x)){ throw "dosya yok: $x" }; [pscustomobject]@{ Hash=$HV.files[$x] } }
function Get-Acl { [CmdletBinding()] param($LiteralPath) [pscustomobject]@{ Sddl=$HV.acl[$LiteralPath] } }
function Copy-Item { [CmdletBinding()] param([Parameter(Position=0)]$Path,[Parameter(Position=1)]$Destination,$LiteralPath,[switch]$Force) $src= if($LiteralPath){$LiteralPath}else{$Path}
  if($HX.copyFail){ $cf=$HX.copyFail.Split('|'); if($Destination -eq $cf[0] -and $HV.phase -eq $cf[1]){ L "copy-FAIL:$Destination"; throw "SAHTE KOPYALAMA HATASI $Destination" } }
  if(-not $HV.files.ContainsKey($src)){ throw "kaynak yok $src" }; $HV.files[$Destination]=$HV.files[$src]; L "copy:$Destination" }
function Set-Content { [CmdletBinding()] param([Parameter(Position=0)]$Path,[Parameter(ValueFromPipeline)]$Value) process { $HV.content[$Path]=[string]$Value } }
function Get-Content { [CmdletBinding()] param([Parameter(Position=0)]$Path,$LiteralPath,[switch]$Raw) $x= if($LiteralPath){$LiteralPath}else{$Path}; if($HV.content.ContainsKey($x)){ $HV.content[$x] + "`r`n" } else { throw "icerik yok $x" } }
function New-Item { [CmdletBinding()] param($ItemType,$Path) $HV.dirs[$Path]=$true; L "mkdir:$Path"; [pscustomobject]@{FullName=$Path} }
function Test-Path { [CmdletBinding()] param($LiteralPath,[Parameter(Position=0)]$Path) $x= if($LiteralPath){$LiteralPath}else{$Path}; $HV.dirs.ContainsKey($x) -or $HV.files.ContainsKey($x) }
function Start-Process { [CmdletBinding()] param($FilePath,$ArgumentList,$WindowStyle,[switch]$PassThru) $m=$ArgumentList[0]; L "seal:$m pair=$($HV.files[$OPSR+'\hukuk-task-host.exe'].Substring(0,8))"
  $o=[pscustomobject]@{ Id=700; ExitCode=$(if($HV.files["$OPSR\hukuk-task-host.exe"] -eq $NEWH['hukuk-task-host.exe']){$HX.sealExit[$m]}else{0}); TO=$(if($HV.files["$OPSR\hukuk-task-host.exe"] -eq $NEWH['hukuk-task-host.exe']){$HX.sealTimeout[$m]}else{$false}) }
  $o | Add-Member ScriptMethod WaitForExit { param($ms) -not $this.TO }; $o | Add-Member ScriptMethod Refresh { }; $o }
function Invoke-WebRequest { [CmdletBinding()] param($Uri,$TimeoutSec,$MaximumRedirection,[switch]$SkipHttpErrorCheck,[switch]$UseBasicParsing)
  if($Uri -match ':8080/'){ if(Test-Up 'API'){ return [pscustomobject]@{StatusCode=401} }; if(Test-ForeignOn 8080){ return [pscustomobject]@{StatusCode=$HX.foreign.code} } } else { if(Test-Up 'WEB'){ return [pscustomobject]@{StatusCode=200} }; if(Test-ForeignOn 3002){ return [pscustomobject]@{StatusCode=$HX.foreign.code} } }; throw 'baglanti yok' }
function powershell.exe { $HV.log.Add(('{0,7:N1}s [{1}] gate {2}' -f $HV.clock,$HV.phase,($args -join ' '))); $global:LASTEXITCODE=$HX.gateExit }
# ---- akis: owner'in yapacagi gibi; blok hata verirse runbook dalina gecilir ----
function Run($name){ $HV.phase=$name.Split('-')[0]; L "=== $name"; try { . ([scriptblock]::Create($T[$name])) | ForEach-Object { L "OUT: $_" }; L "SONUC: OK"; $true } catch { L "SONUC: THROW $($_.Exception.Message)"; $false } }
$null=. Run 'P0-tanimlar'; function Test-HLAdmin { $true }; $p=$STUB
if($Scenario -eq 'NO_B2'){ $null=. Run 'B3-durdur-kopyala'; $null=. Run 'R1-geri-yukle' }
else {
  $ok=. Run 'B2-yedek'
  if($ok){ $ok=. Run 'B3-durdur-kopyala' }
  if($ok){ $ok=. Run 'B4-muhur' }
  if($ok){ $ok=. Run 'B5-baslat' }
  if($ok){ $null=. Run 'B8-kabul' }
  if(-not $ok){ $null=. Run 'R1-geri-yukle' }
  if($Scenario -eq 'SEAL_FAIL'){ $HV.phase='B5x'; $null=. Run 'B5-baslat' }
}
$HV.log | ForEach-Object { $_ }
"FINAL: api=$($HV.files[$OPSR+'\start-api.ps1'].Substring(0,8)) host=$($HV.files[$OPSR+'\hukuk-task-host.exe'].Substring(0,8)) API(en=$($HV.tasks.API.enabled),run=$($HV.tasks.API.running)) WEB(en=$($HV.tasks.WEB.enabled),run=$($HV.tasks.WEB.running))"
