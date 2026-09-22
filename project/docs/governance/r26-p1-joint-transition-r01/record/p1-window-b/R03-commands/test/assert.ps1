# Her senaryonun olay gunlugunden "sonraki tehlikeli adim CALISMADI" iddialarini otomatik dogrular.
$ErrorActionPreference='Stop'
$OPS='C:\Ops\hukuk\bin'
function Ev($s){ @(Get-Content (Join-Path $PSScriptRoot "out-$s.txt") | ForEach-Object { if($_ -match '^\s*[\d\.,]+s \[(\w+)\] (.*)$'){ [pscustomobject]@{ ph=$matches[1]; m=$matches[2] } } }) }
function Has($e,$ph,$pat){ @($e | Where-Object { $_.ph -eq $ph -and $_.m -match $pat }).Count -gt 0 }
function Idx($e,$ph,$pat){ for($i=0;$i -lt $e.Count;$i++){ if($e[$i].ph -eq $ph -and $e[$i].m -match $pat){ return $i } }; -1 }
$R=[Collections.Generic.List[string]]::new(); $fail=0
function A($s,$ok,$d){ $script:R.Add(('{0}  {1,-15} {2}' -f $(if($ok){'OK  '}else{'FAIL'}),$s,$d)); if(-not $ok){ $script:fail++ } }
$cOps=[regex]::Escape("copy:$OPS\")
# HAPPY
$e=Ev 'HAPPY'
A 'HAPPY' ((Idx $e 'B3' 'stop:WEB') -lt (Idx $e 'B3' 'stop:API')) 'durdurma sirasi WEB sonra API'
A 'HAPPY' ((Idx $e 'B3' $cOps) -gt (Idx $e 'B3' 'stop:API')) 'kopyalama durdurmadan SONRA'
A 'HAPPY' ((Idx $e 'B4' 'seal:web pair=27099BDF') -ge 0 -and (Idx $e 'B4' 'seal:api pair=27099BDF') -ge 0) 'iki muhur YENI cift uzerinde'
A 'HAPPY' ((Idx $e 'B5' 'start:API') -lt (Idx $e 'B5' 'start:WEB') -and (Idx $e 'B5' 'start:API') -ge 0) 'API sonra WEB'
A 'HAPPY' ((Has $e 'B5' 'OUT: B5 PASS') -and (Has $e 'B8' 'OUT: B8 PASS')) 'B5 ve B8 PASS'
# COPY_FAIL
$e=Ev 'COPY_FAIL'
A 'COPY_FAIL' (Has $e 'B3' 'copy-FAIL') 'kopyalama hatasi enjekte edildi'
A 'COPY_FAIL' (-not (Has $e 'B3' 'seal:|enable:|start:')) 'B3 icinde muhur/enable/start YOK'
A 'COPY_FAIL' (-not (Has $e 'B4' '.') -and -not (Has $e 'B5' '.')) 'B4/B5 calismadi'
A 'COPY_FAIL' ((Has $e 'R1' 'seal:api pair=691BC146') -and (Idx $e 'R1' 'start:API') -lt (Idx $e 'R1' 'start:WEB') -and (Has $e 'R1' 'OUT: R1 DOGRULANDI')) 'R1 eski cift + muhur + API->WEB + S1 = DOGRULANDI'
# SEAL_FAIL / SEAL_TIMEOUT
foreach($s in 'SEAL_FAIL','SEAL_TIMEOUT'){ $e=Ev $s
  A $s (-not (Has $e 'B4' 'enable:|start:')) 'muhur basarisiz -> B4 icinde servis BASLAMADI'
  A $s (Has $e 'R1' 'OUT: R1 DOGRULANDI') 'R1 dogrulandi' }
$e=Ev 'SEAL_FAIL'
A 'SEAL_FAIL' ((@($e | Where-Object { $_.ph -eq 'B5' -and $_.m -match 'enable:|start:' }).Count -eq 0) -and (Has $e 'B5' 'B4 muhur PASS kaydi yok')) 'muhur basarisizken B5 elle kosulsa da servis BASLATMAZ'
# API_TIMEOUT
$e=Ev 'API_TIMEOUT'
A 'API_TIMEOUT' (-not (Has $e 'B5' 'start:WEB|enable:WEB')) 'API butcesi dolunca WEB BASLAMADI'
A 'API_TIMEOUT' ((Idx $e 'B5' 'stop:API') -gt (Idx $e 'B5' 'start:API')) 'sure dolunca belgelenmis durdurma calisti'
A 'API_TIMEOUT' (Has $e 'B5' 'operasyonel butce asildi - durum belirsiz') 'sure dolmasi URUN ARIZASI diye sunulmadi'
A 'API_TIMEOUT' (Has $e 'R1' 'OUT: R1 DOGRULANDI') 'R1 dogrulandi'
# WEB_TIMEOUT
$e=Ev 'WEB_TIMEOUT'
A 'WEB_TIMEOUT' (-not (Has $e 'B5' 'OUT: B5 PASS')) 'WEB butcesi dolunca BASARI YAZILMADI'
A 'WEB_TIMEOUT' ((Idx $e 'B5' 'stop:WEB') -gt (Idx $e 'B5' 'start:WEB')) 'durdurma calisti'
A 'WEB_TIMEOUT' (Has $e 'R1' 'OUT: R1 DOGRULANDI') 'R1 dogrulandi'
# UNSTOPPABLE
$e=Ev 'UNSTOPPABLE_B3'
A 'UNSTOPPABLE_B3' (-not (Has $e 'B3' $cOps) -and -not (Has $e 'R1' $cOps)) 'sessizlik yok -> OPS kopyalamasi YOK (B3 ve R1)'
A 'UNSTOPPABLE_B3' (-not (Has $e 'B3' 'kill|Stop-Process')) 'surece dokunulmadi'
$e=Ev 'UNSTOPPABLE_B5'
A 'UNSTOPPABLE_B5' (Has $e 'B5' 'SESSIZLIK YOK: R1 CALISTIRMAYIN') 'B5 durdurma dogrulanamadi -> acik hata'
A 'UNSTOPPABLE_B5' (-not (Has $e 'R1' $cOps)) 'R1 yine de kosulsa: dosya KOPYALANMADI'
# R1 timeouts / gate
$e=Ev 'R1_API_TIMEOUT'
A 'R1_API_TIMEOUT' (-not (Has $e 'R1' 'start:WEB|enable:WEB') -and -not (Has $e 'R1' 'DOGRULANDI')) 'R1 API kapisi yok -> WEB BASLAMADI, DOGRULANDI yazilmadi'
$e=Ev 'R1_WEB_TIMEOUT'
A 'R1_WEB_TIMEOUT' (-not (Has $e 'R1' 'DOGRULANDI')) 'R1 WEB kapisi yok -> DOGRULANDI yazilmadi'
$e=Ev 'R1_GATE_FAIL'
A 'R1_GATE_FAIL' ((Has $e 'R1' 'gate .*-Stage S1') -and -not (Has $e 'R1' 'DOGRULANDI')) 'S1 kapisi FAIL -> DOGRULANDI yazilmadi'
# NO_B2
$e=Ev 'NO_B2'
A 'NO_B2' (-not (Has $e 'B3' 'stop:|disable:|copy:')) 'dogrulanmis yedek yok -> DURDURMA YOK'
# ===== R03 kimlik senaryolari =====
$e=Ev 'HAPPY'
A 'HAPPY' (Has $e 'B5' 'OUT: B5 PASS \| API .*\[L\d+\|N\d+@.*\|P\d+@.*\|H\d+@.*\] \| WEB .*\[L\d+\|N') 'B5 PASS dogrulanmis agac imzasiyla (L|N|P|H)'
A 'HAPPY' (Has $e 'B8' 'OUT: B8 PASS \| saglik 401/200 \| agac B5 imzasiyla birebir') 'B8 baslangic kimligi = B5 dogrulanmis agac'
$e=Ev 'FOREIGN_LISTENER'
A 'FOREIGN_LISTENER' (Has $e 'B5' 'YABANCI dinleyici/agac: dinleyici exe beklenen degil') 'dogru HTTP kodlu yabanci dinleyici KIMLIKTE reddedildi'
A 'FOREIGN_LISTENER' (-not (Has $e 'B5' 'start:WEB|enable:WEB|OUT: B5 PASS')) 'WEB baslamadi, basari yazilmadi'
A 'FOREIGN_LISTENER' (Has $e 'B5' 'SESSIZLIK YOK: R1 CALISTIRMAYIN') 'yabanci dinleyici suruyor -> sessizlik yok -> acik hata'
A 'FOREIGN_LISTENER' (-not (Has $e 'R1' $cOps)) 'R1 kosulsa da dosya KOPYALANMADI'
foreach($x in @(@('WRONG_HOST_PATH','B5','launcher parent beklenen host degil'),@('WRONG_PARENT','B5','node parent beklenen launcher degil'),@('PID_REUSE','B5','olusturulma zamani sirasi bozuk'))){
  $e=Ev $x[0]
  A $x[0] (Has $e 'B5' ('API kapisi PASS degil \(YABANCI dinleyici/agac: ' + $x[2])) ('API reddi: ' + $x[2])
  A $x[0] (-not (Has $e 'B5' 'start:WEB|enable:WEB|OUT: B5 PASS')) 'WEB baslamadi, basari yazilmadi'
  A $x[0] (Has $e 'R1' 'OUT: R1 DOGRULANDI') 'kendi agaci durduruldu -> R1 dogru agacla DOGRULANDI' }
$e=Ev 'WRONG_ENTRY'
A 'WRONG_ENTRY' (Has $e 'B5' 'WEB kapisi PASS degil \(YABANCI dinleyici/agac: node entry/args beklenen degil') 'WEB yanlis entry reddedildi'
A 'WRONG_ENTRY' (-not (Has $e 'B5' 'OUT: B5 PASS')) 'basari yazilmadi'
A 'WRONG_ENTRY' (Has $e 'R1' 'OUT: R1 DOGRULANDI') 'R1 DOGRULANDI'
$e=Ev 'ID_FLAP'
A 'ID_FLAP' (Has $e 'B5' 'API kapisi PASS degil \(operasyonel butce asildi') 'olcum sirasinda degisen kimlik hic PASS almadi'
A 'ID_FLAP' (-not (Has $e 'B5' 'start:WEB|OUT: B5 PASS')) 'WEB baslamadi'
$e=Ev 'R1_FOREIGN'
A 'R1_FOREIGN' (Has $e 'R1' 'R1: WEB kimlik/saglik kapisi PASS degil \(YABANCI: ') 'R1 WEB yabanci dinleyiciyi reddetti'
A 'R1_FOREIGN' (-not (Has $e 'R1' 'DOGRULANDI')) 'R1 DOGRULANDI yazilmadi'
$e=Ev 'B8_NEWTREE'
A 'B8_NEWTREE' ((Has $e 'B5' 'OUT: B5 PASS') -and (Has $e 'B8' 'IKINCI BASLATMA dogrulanan agaci degistirdi') -and -not (Has $e 'B8' 'OUT: B8 PASS')) 'ikinci baslatmada yeni agac -> B8 kabul VERMEDI'
$R | ForEach-Object { $_ }
"ASSERT: " + $(if($fail -eq 0){'PASS'}else{'FAIL'}) + " | " + ($R.Count-$fail) + "/" + $R.Count + " | PS " + $PSVersionTable.PSVersion
exit $(if($fail -eq 0){0}else{1})
