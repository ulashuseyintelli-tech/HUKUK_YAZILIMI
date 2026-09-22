. {
# ===== P0 - TANIMLAR (yan etki YOK; yonetici pwsh 7 penceresinde B2'den ONCE bir kez) =====
$ErrorActionPreference='Stop'
$p='D:\Development\HUKUK_YAZILIMI\HY_P1_A3_codex\P1-delivery'
$E='D:\Development\HUKUK_YAZILIMI\HY_P1_WINDOW_B_EVIDENCE'
$OPS='C:\Ops\hukuk\bin'
$GATE='D:\Development\HUKUK_YAZILIMI\project\project\docs\governance\r26-p1-joint-transition-r01\scripts\r26p1-stage-gate.ps1'
$GATE_SHA='214465BBF85400B73BF7928036B1B3BF79D439249321A2C30C14C976A2155200'
$files=@('start-api.ps1','hukuk-task-host.exe')
$OLD=@{ 'start-api.ps1'='CC634BBFE0BE8F4F06482EDB30FF1E687D36B08C075665E2EC160EA8082619B3'; 'hukuk-task-host.exe'='691BC146C9123B1625B4AE733EFE615F8AFFB77FB0C95EBFDAE621A6AA171627' }
$NEW=@{ 'start-api.ps1'='DDCCD09157E0AAF209AB38316A33815A0298FFACBC9006ED62F35F137F86219C'; 'hukuk-task-host.exe'='27099BDF66C83A44B3061D65AE2DAF24EADB523EE4F464179C2F53BB6C78DEAB' }
$KEEP=@{ 'start-web.ps1'='F39F7A54BC51972B94FD0CF13A08F4E1AB82822A528EDAD58FC8F2318C1F59E0'; 'db-readiness.js'='AD18CBB621A2D58FD41B481C07A09D25726C150C2D9DA028C23B60986AD413A9'; 'pwsh-file-manifest.json'='84E530B1A90F5A069C7C87B68B73948F574752650DB607DDFB29A959B9F0307A' }
# --- OPERASYONEL bekleme butceleri (teorik ust sinir DEGIL; bkz. ek README par.2) ---
# API: kaynak faz payi 24*20 + 23*5 + 180 = 775 sn; kaynak mutlak ust sinir KURMAZ (parametresiz WaitForExit/WaitAll).
#      Operasyonel butce 900 sn = faz payi + 125 sn host/zamanlayici payi. Asim = "durum belirsiz", urun arizasi DEGIL.
# WEB: bind 180 sn + 120 sn pay = 300 sn.  DURDURMA sessizligi: 180 sn.  verify-seal: 60 sn (runbook).
$API_WAIT_SEC=900; $WEB_WAIT_SEC=300; $STOP_WAIT_SEC=180; $SEAL_WAIT_MS=60000
$b=$null; $seal=$null; $B5_DONE=$false; $IDN=@{}
# --- R03: SERVIS AGACI KIMLIGI (kaynak: host gen.cs CreateProcessW(PwshPath) ; start-(api|web).ps1 New-HLChildProcess NodeExe EntryJs) ---
$HOST_EXE='C:\Ops\hukuk\bin\hukuk-task-host.exe'
$PWSH_EXE='C:\Ops\hukuk\pwsh\pwsh.exe'
$NODE_EXE='C:\Users\ulastelli\AppData\Local\Volta\tools\image\node\24.18.0\node.exe'
$SVC=@{
  api=@{ task='HukukPlatform-API'; port=8080; launcher='C:\Ops\hukuk\bin\start-api.ps1'; entry='C:\Development\HUKUK_YAZILIMI\HY_W4_RELEASE23\project\apps\api\dist\apps\api\src\main.js'; args=''; url='http://127.0.0.1:8080/api/auth/me'; want=401 }
  web=@{ task='HukukPlatform-WEB'; port=3002; launcher='C:\Ops\hukuk\bin\start-web.ps1'; entry='C:\Development\HUKUK_YAZILIMI\HY_W4_RELEASE23\project\apps\web\node_modules\next\dist\bin\next'; args='start --port 3002'; url='http://127.0.0.1:3002/portal/login'; want=200 }
}
function Test-HLAdmin { (New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator) }
function Get-HLCode([string]$u){ try { [int](Invoke-WebRequest -Uri $u -TimeoutSec 8 -MaximumRedirection 0 -SkipHttpErrorCheck -UseBasicParsing -ErrorAction Stop).StatusCode } catch { -1 } }
# Yalniz BU gecisin surecleri: 8080/3002 dinleyicisi, api/web host'u, Ops launcher pwsh'i, API/WEB node cocugu, db-readiness probu.
function Get-HLQuiet {
  $lis=@(Get-NetTCPConnection -State Listen -LocalPort 8080,3002 -ErrorAction SilentlyContinue).Count
  $procs=@(Get-CimInstance Win32_Process -Filter "Name='hukuk-task-host.exe' OR Name='pwsh.exe' OR Name='node.exe'")
  $own=@($procs | Where-Object {
    ($_.Name -eq 'hukuk-task-host.exe' -and $_.CommandLine -match '(^|\s)(api|web)(\s|$)') -or
    ($_.Name -eq 'pwsh.exe' -and $_.CommandLine -match 'C:\\Ops\\hukuk\\bin\\start-(api|web)\.ps1') -or
    ($_.Name -eq 'node.exe' -and $_.CommandLine -match 'dist\\apps\\api\\src\\main\.js|next\\dist\\bin\\next.*3002|C:\\Ops\\hukuk\\bin\\db-readiness\.js') })
  $run=@(Get-ScheduledTask -TaskName 'HukukPlatform-API','HukukPlatform-WEB' | Where-Object { [string]$_.State -eq 'Running' }).Count
  [ordered]@{ total=($lis+$own.Count+$run); listeners=$lis; processes=$own.Count; running=$run; pids=(@($own | ForEach-Object { [string]$_.ProcessId + ':' + $_.Name }) -join ',') }
}
# Belgelenmis durdurma (runbook par.2/par.4): iki gorevi disable + stop (WEB sonra API); host Job Object agaci kapatir; genis surec oldurme YOK.
function Stop-HLTransition([int]$sec){
  Disable-ScheduledTask -TaskName 'HukukPlatform-WEB' | Out-Null
  Disable-ScheduledTask -TaskName 'HukukPlatform-API' | Out-Null
  Stop-ScheduledTask -TaskName 'HukukPlatform-WEB'
  Stop-ScheduledTask -TaskName 'HukukPlatform-API'
  $deadline=(Get-Date).AddSeconds($sec); $q=Get-HLQuiet
  while($q.total -ne 0 -and (Get-Date) -lt $deadline){ Start-Sleep -Seconds 2; $q=Get-HLQuiet }
  $q['ok']=($q.total -eq 0); "durdurma: ok=$($q.ok) dinleyici=$($q.listeners) surec=$($q.processes) running=$($q.running) $($q.pids)" | Write-Host
  $q
}
function Test-HLPair([hashtable]$want){
  $bad=@()
  foreach($f in $files){ $h=(Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $OPS $f)).Hash; if($h -cne $want[$f]){ $bad+="$f hash=$h" }
    if((Get-Acl -LiteralPath (Join-Path $OPS $f)).Sddl -cne (Get-Content -Raw -LiteralPath (Join-Path $b ($f+'.sddl'))).Trim()){ $bad+="$f ACL farkli" } }
  foreach($k in $KEEP.Keys){ if((Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $OPS $k)).Hash -cne $KEEP[$k]){ $bad+="$k DEGISTI" } }
  ,$bad
}
function Invoke-HLSeal {
  $r2=[ordered]@{}
  foreach($mode in @('api','web')){
    $pr=Start-Process (Join-Path $OPS 'hukuk-task-host.exe') -ArgumentList @($mode,'--verify-seal') -WindowStyle Hidden -PassThru
    if(-not $pr.WaitForExit($SEAL_WAIT_MS)){ $r2[$mode]="TIMEOUT pid=$($pr.Id)"; Write-Host "verify-seal $mode TIMEOUT (pid $($pr.Id)) - surece dokunulmadi"; continue }
    $pr.Refresh(); $r2[$mode]=$pr.ExitCode; Write-Host "verify-seal $mode cikis=$($pr.ExitCode)"
  }
  $r2
}
# Komut satiri -> belirtecler (tirnakli ya da tirnaksiz); yalniz karsilastirma icin, calistirilmaz.
function Get-HLTokens([string]$cl){ @([regex]::Matches([string]$cl,'"([^"]*)"|(\S+)') | ForEach-Object { if($_.Groups[1].Success){ $_.Groups[1].Value } else { $_.Groups[2].Value } }) }
function Get-HLProc([int]$procId){ if($procId -le 0){ return $null }; @(Get-CimInstance Win32_Process -Filter ("ProcessId={0}" -f $procId) -ErrorAction SilentlyContinue) | Select-Object -First 1 }
# Kimlik: EXACT | NONE (dinleyici yok) | FOREIGN (dinleyici/agac beklenen degil) | UNKNOWN (okunamadi).
# Zincir: dinleyici OwningProcess = node (NODE_EXE + entry + args) -> parent pwsh (PWSH_EXE -File launcher) -> parent host (HOST_EXE + mod).
# Olusturulma zamani: host <= pwsh <= node ve host >= $since (bu baslatmadan once olusmus agac = FOREIGN). Mod icin tek host.
function Get-HLServiceIdentity([string]$mode,[datetime]$since){
  $s=$SVC[$mode]; $r=[ordered]@{ state='UNKNOWN'; reason=''; sig='' }
  try {
    $owners=@(@(Get-NetTCPConnection -State Listen -LocalPort $s.port -ErrorAction SilentlyContinue) | ForEach-Object { [int]$_.OwningProcess } | Sort-Object -Unique)
    if($owners.Count -eq 0){ $r.state='NONE'; $r.reason='dinleyici yok'; return $r }
    if($owners.Count -gt 1){ $r.state='FOREIGN'; $r.reason="birden cok dinleyici sahibi: $($owners -join ',')"; return $r }
    $n=Get-HLProc $owners[0]; if(-not $n){ $r.reason="dinleyici sureci okunamadi pid=$($owners[0])"; return $r }
    $nt=Get-HLTokens $n.CommandLine
    if(-not ([string]$n.ExecutablePath -ieq $NODE_EXE)){ $r.state='FOREIGN'; $r.reason="dinleyici exe beklenen degil: $($n.ExecutablePath) pid=$($n.ProcessId)"; return $r }
    if($nt.Count -lt 2 -or -not ($nt[1] -ieq $s.entry) -or ((@($nt | Select-Object -Skip 2) -join ' ') -cne $s.args)){ $r.state='FOREIGN'; $r.reason="node entry/args beklenen degil pid=$($n.ProcessId)"; return $r }
    $pw=Get-HLProc ([int]$n.ParentProcessId); if(-not $pw){ $r.reason="node parent okunamadi ppid=$($n.ParentProcessId)"; return $r }
    $pt=Get-HLTokens $pw.CommandLine; $fi=[array]::IndexOf([string[]]$pt,'-File')
    if(-not ([string]$pw.ExecutablePath -ieq $PWSH_EXE) -or $fi -lt 0 -or $fi+1 -ge $pt.Count -or -not ($pt[$fi+1] -ieq $s.launcher)){ $r.state='FOREIGN'; $r.reason="node parent beklenen launcher degil pid=$($pw.ProcessId) exe=$($pw.ExecutablePath)"; return $r }
    $h=Get-HLProc ([int]$pw.ParentProcessId); if(-not $h){ $r.reason="launcher parent okunamadi ppid=$($pw.ParentProcessId)"; return $r }
    $ht=Get-HLTokens $h.CommandLine
    if(-not ([string]$h.ExecutablePath -ieq $HOST_EXE) -or $ht.Count -ne 2 -or $ht[1] -cne $mode){ $r.state='FOREIGN'; $r.reason="launcher parent beklenen host degil pid=$($h.ProcessId) exe=$($h.ExecutablePath)"; return $r }
    if(-not ($h.CreationDate -le $pw.CreationDate -and $pw.CreationDate -le $n.CreationDate)){ $r.state='FOREIGN'; $r.reason='olusturulma zamani sirasi bozuk (PID yeniden kullanimi?)'; return $r }
    if($since -gt [datetime]::MinValue -and $h.CreationDate -lt $since.AddSeconds(-2)){ $r.state='FOREIGN'; $r.reason="host bu baslatmadan ONCE olusmus ($($h.CreationDate.ToString('o')))"; return $r }
    $hosts=@(Get-CimInstance Win32_Process -Filter "Name='hukuk-task-host.exe'" | Where-Object { $t=Get-HLTokens $_.CommandLine; $t.Count -ge 2 -and $t[1] -ceq $mode })
    if($hosts.Count -ne 1 -or [int]$hosts[0].ProcessId -ne [int]$h.ProcessId){ $r.state='FOREIGN'; $r.reason="mod icin host sayisi $($hosts.Count) ya da farkli host"; return $r }
    $r.state='EXACT'; $r.reason='host->launcher->node zinciri dogrulandi'
    $r.sig=('L{0}|N{1}@{2}|P{3}@{4}|H{5}@{6}' -f $owners[0],$n.ProcessId,$n.CreationDate.ToString('o'),$pw.ProcessId,$pw.CreationDate.ToString('o'),$h.ProcessId,$h.CreationDate.ToString('o'))
    return $r
  } catch { $r.state='UNKNOWN'; $r.reason="kimlik okunamadi: $($_.Exception.Message)"; return $r }
}
# Saglik kabulu = kimlik EXACT (1) -> beklenen HTTP kodu -> kimlik EXACT (2) ve imza (1)=(2). FOREIGN gorulurse beklemeden durur.
function Start-HLService([string]$mode,[int]$budget){
  $s=$SVC[$mode]; $t0=Get-Date
  Enable-ScheduledTask -TaskName $s.task | Out-Null
  Start-ScheduledTask -TaskName $s.task
  $code=-1; $id=$null; $id2=$null; $foreign=$false; $deadline=(Get-Date).AddSeconds($budget)
  while((Get-Date) -lt $deadline){
    $id=Get-HLServiceIdentity $mode $t0
    if($id.state -eq 'FOREIGN'){ $foreign=$true; break }
    if($id.state -eq 'EXACT'){ $code=Get-HLCode $s.url; if($code -eq $s.want){ $id2=Get-HLServiceIdentity $mode $t0; if($id2.state -eq 'FOREIGN'){ $foreign=$true; $id=$id2; break }; if($id2.state -eq 'EXACT' -and $id2.sig -ceq $id.sig){ break } } }
    Start-Sleep -Seconds 2
  }
  $sec=[int]((Get-Date)-$t0).TotalSeconds
  $ok=((-not $foreign) -and $null -ne $id2 -and $id2.state -eq 'EXACT' -and $id2.sig -ceq $id.sig -and $code -eq $s.want)
  $r3=[ordered]@{ ok=$ok; foreign=$foreign; timedOut=(-not $ok -and -not $foreign -and $sec -ge $budget); code=$code; identity=$(if($ok){$id2}else{$id}); sec=$sec }
  Write-Host ("{0}: ok={1} kod={2} kimlik={3} ({4}) sure={5}s butce={6}s{7}{8}" -f $mode,$ok,$code,$r3.identity.state,$r3.identity.reason,$sec,$budget,$(if($r3.timedOut){' | OPERASYONEL BUTCE ASILDI - durum belirsiz (urun arizasi iddiasi DEGIL)'}else{''}),$(if($foreign){' | YABANCI DINLEYICI/AGAC - yabanci surece DOKUNULMAZ'}else{''}))
  if($ok){ Write-Host ("{0} kimlik imzasi: {1}" -f $mode,$id2.sig) }
  $r3
}
'P0 TAMAM | tanimlar yuklendi (yan etki yok) | API butce ' + $API_WAIT_SEC + 's, WEB ' + $WEB_WAIT_SEC + 's, durdurma ' + $STOP_WAIT_SEC + 's'
}
