. {
# ===== B8 - runbook par.3 saglik + TEK ORNEK; baslangic kimligi = B5'te DOGRULANMIS agac ($IDN) =====
if(-not $B5_DONE -or -not $IDN['api'] -or -not $IDN['web'] -or $IDN['api'].state -ne 'EXACT' -or $IDN['web'].state -ne 'EXACT'){ throw 'B8: B5 PASS ve dogrulanmis kimlik kaydi yok - DUR' }
$any=[datetime]::MinValue
$a0=Get-HLServiceIdentity 'api' $any; $w0=Get-HLServiceIdentity 'web' $any
"on: api $($a0.state) [$($a0.sig)] | web $($w0.state) [$($w0.sig)]"
if($a0.state -ne 'EXACT' -or $a0.sig -cne $IDN['api'].sig -or $w0.state -ne 'EXACT' -or $w0.sig -cne $IDN['web'].sig){ throw "B8: canli agac B5'te dogrulanan agac DEGIL (api: $($a0.reason) | web: $($w0.reason)) - kabul VERILMEZ" }
$me=Get-HLCode $SVC['api'].url; $pl=Get-HLCode $SVC['web'].url
"saglik: /api/auth/me=$me (401 beklenir) | /portal/login=$pl (200 beklenir)"
if($me -ne 401 -or $pl -ne 200){ throw 'B8: SAGLIK FAIL - kabul VERILMEZ; R1 degerlendirilir' }
Start-ScheduledTask -TaskName 'HukukPlatform-API'; Start-ScheduledTask -TaskName 'HukukPlatform-WEB'
Start-Sleep -Seconds 20
$a1=Get-HLServiceIdentity 'api' $any; $w1=Get-HLServiceIdentity 'web' $any
"ikinci baslatma sonrasi: api $($a1.state) [$($a1.sig)] | web $($w1.state) [$($w1.sig)]"
if($a1.state -ne 'EXACT' -or $a1.sig -cne $IDN['api'].sig -or $w1.state -ne 'EXACT' -or $w1.sig -cne $IDN['web'].sig){ throw "B8: IKINCI BASLATMA dogrulanan agaci degistirdi ya da yeni agac/dinleyici uretti (api: $($a1.reason) | web: $($w1.reason)) - TEK ORNEK FAIL - kabul VERILMEZ" }
'B8 PASS | saglik 401/200 | agac B5 imzasiyla birebir; ikinci baslatmada yeni agac yok | API log READY + tek child ve surelerin kaydi owner incelemesinde'
}
