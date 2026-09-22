. {
# ===== B2 - YEDEK (runbook par.1, 5F07A30A) =====
if(-not $OPS -or -not $OLD){ throw 'B2: P0 tanimlari yok - once P0 - DUR' }
if(-not (Test-HLAdmin)){ throw 'B2: YONETICI pwsh 7 penceresi gerekli - DUR' }
if($PSVersionTable.PSVersion.Major -lt 7){ throw 'B2: pwsh 7 gerekli - DUR' }
if((Get-FileHash -Algorithm SHA256 -LiteralPath "$p\OWNER-RUNBOOK.md").Hash -cne '5F07A30A23BF20EDD7F225333F5D3D6A55EE1C2246BBC2C1BE7F1D0B22B81118'){ throw 'B2: RUNBOOK PIN UYUSMUYOR - DUR' }
if((Get-FileHash -Algorithm SHA256 -LiteralPath "$p\manifest.json").Hash -cne '17CF1EEB99C5F1873E64DB291B89299B180781D45320ADB7775D9F1FFFDB845E'){ throw 'B2: MANIFEST PIN UYUSMUYOR - DUR' }
foreach($f in $files){ if((Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path "$p\candidate" $f)).Hash -cne $NEW[$f]){ throw "B2: ADAY $f PIN UYUSMUYOR - DUR" } }
& "$p\Preflight.ps1"
$b=Join-Path 'D:\Development\HUKUK_YAZILIMI' ('P1-A3-APPLY-'+(Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssfffZ'))
New-Item -ItemType Directory -Path $b -ErrorAction Stop | Out-Null
foreach($f in $files){
  $live=Join-Path $OPS $f
  Copy-Item -LiteralPath $live -Destination (Join-Path $b $f) -ErrorAction Stop
  if((Get-FileHash $live).Hash -cne (Get-FileHash (Join-Path $b $f)).Hash){throw 'BACKUP MISMATCH'}
  (Get-Acl -LiteralPath $live).Sddl | Set-Content (Join-Path $b ($f+'.sddl'))
}
foreach($n in @('HukukPlatform-API','HukukPlatform-WEB')){
  Export-ScheduledTask -TaskName $n | Set-Content (Join-Path $b ($n+'.xml'))
}
Copy-Item "$p\manifest.json" (Join-Path $b 'p1-manifest.json')
foreach($f in $files){ $h=(Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $b $f)).Hash; if($h -cne $OLD[$f]){ $b=$null; throw "B2: YEDEK $f liveBaseline DEGIL ($h) - DUR" } }
"B2 PASS | yedek=$b | sddl+xml yazildi | canliya henuz dokunulmadi"
}
