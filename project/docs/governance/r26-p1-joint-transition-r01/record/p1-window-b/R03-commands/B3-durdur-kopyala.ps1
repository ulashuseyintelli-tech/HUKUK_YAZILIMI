. {
# ===== B3 - DURDUR + SESSIZLIK + KOPYALA (runbook par.2) =====
if(-not $b -or -not (Test-Path -LiteralPath $b)){ throw 'B3: dogrulanmis yedek ($b) yok - DURDURMA YAPILMADI - DUR' }
foreach($f in $files){ if((Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $b $f)).Hash -cne $OLD[$f]){ throw "B3: yedek $f bozuk - DURDURMA YAPILMADI - DUR" } }
$q=Stop-HLTransition $STOP_WAIT_SEC
if(-not $q.ok){ throw "B3: SESSIZLIK DOGRULANAMADI ($($q.pids)) - KOPYALAMA YAPILMADI; gorevler DISABLED; surece dokunulmadi - DUR ve bildir (R1 CALISTIRMAYIN)" }
foreach($f in $files){ if((Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $OPS $f)).Hash -cne $OLD[$f]){ throw "B3: canli $f beklenen eski degil - KOPYALAMA YAPILMADI - DUR" } }
foreach($f in $files){Copy-Item -LiteralPath (Join-Path "$p\candidate" $f) -Destination (Join-Path $OPS $f) -Force -ErrorAction Stop}
$bad=Test-HLPair $NEW
if($bad.Count){ $bad | ForEach-Object { Write-Host $_ }; throw 'B3: KURULU CIFT/ACL/DEGISMEYEN KONTROLU BASARISIZ - gorevler DISABLED - R1 calistirin' }
'B3 PASS | kurulu start-api=DDCCD091 host=27099BDF | web/readiness/manifest degismedi | ACL esit | gorevler DISABLED'
}
