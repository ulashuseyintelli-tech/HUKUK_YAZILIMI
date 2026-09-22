. {
# ===== R1 - P1 CIFT GERI YUKLEME (runbook par.4); servis kabulu KIMLIK (host->launcher->node) + saglik =====
if(-not $b -or -not (Test-Path -LiteralPath $b)){ throw 'R1: yedek ($b) yok - DUR, bildir' }
$q=Stop-HLTransition $STOP_WAIT_SEC
if(-not $q.ok){ throw "R1: SESSIZLIK DOGRULANAMADI ($($q.pids)) - DOSYA KOPYALANMADI - ROLLBACK_NOT_VERIFIED, escalate" }
foreach($f in $files){ if((Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $b $f)).Hash -cne $OLD[$f]){ throw "R1: yedek $f liveBaseline degil - DOSYA KOPYALANMADI - ROLLBACK_NOT_VERIFIED" } }
foreach($f in $files){Copy-Item -LiteralPath (Join-Path $b $f) -Destination (Join-Path $OPS $f) -Force -ErrorAction Stop}
$bad=Test-HLPair $OLD
if($bad.Count){ $bad | ForEach-Object { Write-Host $_ }; throw 'R1: geri yuklenen cift/ACL dogrulanamadi - gorevler DISABLED - ROLLBACK_NOT_VERIFIED' }
$rs=Invoke-HLSeal
if($rs['api'] -ne 0 -or $rs['web'] -ne 0){ throw "R1: eski cift muhur api=$($rs['api']) web=$($rs['web']) - gorevler DISABLED - ROLLBACK_NOT_VERIFIED" }
$ra=Start-HLService 'api' $API_WAIT_SEC
if(-not $ra.ok){ $q2=Stop-HLTransition $STOP_WAIT_SEC; throw "R1: API kimlik/saglik kapisi PASS degil ($(if($ra.foreign){'YABANCI: '}else{''})$($ra.identity.reason)) - WEB BASLATILMADI - durdurma ok=$($q2.ok) - ROLLBACK_NOT_VERIFIED" }
$rw=Start-HLService 'web' $WEB_WAIT_SEC
if(-not $rw.ok){ $q2=Stop-HLTransition $STOP_WAIT_SEC; throw "R1: WEB kimlik/saglik kapisi PASS degil ($(if($rw.foreign){'YABANCI: '}else{''})$($rw.identity.reason)) - durdurma ok=$($q2.ok) - ROLLBACK_NOT_VERIFIED" }
$ts=@(Get-ScheduledTask -TaskName 'HukukPlatform-API','HukukPlatform-WEB' | Where-Object { -not $_.Settings.Enabled -or [string]$_.State -eq 'Disabled' }).Count
if($ts -ne 0){ throw 'R1: gorev durumu etkin degil - ROLLBACK_NOT_VERIFIED' }
if((Get-FileHash -Algorithm SHA256 -LiteralPath $GATE).Hash -cne $GATE_SHA){ throw 'R1: ASAMA KAPISI SHA UYUSMUYOR - ROLLBACK_NOT_VERIFIED' }
$global:LASTEXITCODE=-999
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $GATE -Stage S1 -ExpectRunning -EvidencePath (Join-Path $E ('gate-S1-R1-' + (Get-Date).ToUniversalTime().ToString('HHmmss') + '.json'))
if($global:LASTEXITCODE -ne 0){ throw "R1: KAPI S1 PASS DEGIL (cikis $global:LASTEXITCODE) - ROLLBACK_NOT_VERIFIED" }
"R1 DOGRULANDI | cift eski (CC634BBF/691BC146) + ACL | muhur 0/0 | API [$($ra.identity.sig)] sonra WEB [$($rw.identity.sig)] kimlik+saglik PASS | gorevler etkin | kapi S1 PASS"
}
