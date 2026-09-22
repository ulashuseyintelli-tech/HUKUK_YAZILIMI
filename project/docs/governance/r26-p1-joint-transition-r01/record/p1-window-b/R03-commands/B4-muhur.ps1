. {
# ===== B4 - URETIM YOLUNDA IKI verify-seal; servisler BASLAMADAN =====
if(-not $b){ throw 'B4: B2/B3 yok - DUR' }
$bad=Test-HLPair $NEW
if($bad.Count){ throw 'B4: kurulu cift dogrulanamadi - MUHUR KOSULMADI - R1' }
if(@(Get-ScheduledTask -TaskName 'HukukPlatform-API','HukukPlatform-WEB' | Where-Object { [string]$_.State -ne 'Disabled' }).Count -ne 0){ throw 'B4: gorevler DISABLED degil - DUR' }
$seal=Invoke-HLSeal
if($seal['api'] -ne 0 -or $seal['web'] -ne 0){ $s2=$seal; $seal=$null; throw "B4: MUHUR BASARISIZ api=$($s2['api']) web=$($s2['web']) - SERVIS BASLATILMADI - R1 calistirin" }
'B4 PASS | api --verify-seal=0 | web --verify-seal=0 | servisler henuz BASLAMADI'
}
