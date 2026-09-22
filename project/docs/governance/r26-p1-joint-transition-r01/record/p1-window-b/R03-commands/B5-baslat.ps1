. {
# ===== B5 - API, sonra WEB; her biri KIMLIK (host->launcher->node) + saglik kapisini gecmeden sonraki yok =====
if(-not $seal -or $seal['api'] -ne 0 -or $seal['web'] -ne 0){ throw 'B5: B4 muhur PASS kaydi yok - SERVIS BASLATILMADI - DUR' }
$IDN=@{}
$api=Start-HLService 'api' $API_WAIT_SEC
if(-not $api.ok){ $q=Stop-HLTransition $STOP_WAIT_SEC; throw ("B5: API kapisi PASS degil (" + $(if($api.foreign){'YABANCI dinleyici/agac: ' + $api.identity.reason}elseif($api.timedOut){'operasyonel butce asildi - durum belirsiz'}else{'kimlik/saglik FAIL: ' + $api.identity.reason}) + ") - WEB BASLATILMADI; durdurma ok=$($q.ok) - " + $(if($q.ok){'R1 calistirin'}else{'SESSIZLIK YOK: R1 CALISTIRMAYIN, bildir'})) }
$IDN['api']=$api.identity
$web=Start-HLService 'web' $WEB_WAIT_SEC
if(-not $web.ok){ $q=Stop-HLTransition $STOP_WAIT_SEC; throw ("B5: WEB kapisi PASS degil (" + $(if($web.foreign){'YABANCI dinleyici/agac: ' + $web.identity.reason}elseif($web.timedOut){'operasyonel butce asildi - durum belirsiz'}else{'kimlik/saglik FAIL: ' + $web.identity.reason}) + ") - BASARI YAZILMADI; durdurma ok=$($q.ok) - " + $(if($q.ok){'R1 calistirin'}else{'SESSIZLIK YOK: R1 CALISTIRMAYIN, bildir'})) }
$IDN['web']=$web.identity
& "$p\Preflight.ps1" -Installed
$B5_DONE=$true
"B5 PASS | API $($api.sec)s [$($IDN['api'].sig)] | WEB $($web.sec)s [$($IDN['web'].sig)] | Preflight -Installed PASS"
}
