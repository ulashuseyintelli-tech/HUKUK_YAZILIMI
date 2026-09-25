# =============================================================================
# reach-test.ps1 OZ-TESTI — CANLIYA DOKUNMAZ, YONETICI GEREKTIRMEZ.
#
# NE GERCEK: dinleyici SURECLERI gercekten baslatilir (localhost, yuksek port), gercekten
#   yerel HTTP istegi alir, gercekten kayit yazar ve gercekten durdurulur. PID, baslangic
#   zamani ve komut satiri eslestirmesi gercek isletim sistemi verisiyle olculur.
# NE SAHTE: guvenlik duvari kurallari — `-SelfTestMode` bunlari gecici bir JSON kayit
#   defterine yazar. Gercek `New/Remove-NetFirewallRule` davranisi burada OLCULMEZ;
#   kaynakta `-Name` ile TAM ad kullanildigi statik kapiyla (S-1) dogrulanir.
# NE OLCULMEZ: `http://+:<port>/` onekinin yonetici URL-ACL davranisi (canli kosuma ozgu).
#
# Kapsanan kosullar (owner talimati, 2026-09-25):
#   K-1 ilk degisiklikten ONCE durum + kurtarma bilgisi kalicilastiriliyor
#   K-2 kismi acilis hatasinda YALNIZ bu kosunun kaynaklari geri aliniyor
#   K-3 kapatma wildcard / toplu surec taramasi KULLANMIYOR; yabanci kaynaga DOKUNMUYOR
#   K-4 kurtarma hatasi ayrica KAYDEDILIYOR, PASS uretilmiyor
#
# CIKIS: 0 hepsi PASS · 1 en az bir FAIL
# =============================================================================
$ErrorActionPreference = 'Stop'
$here   = $PSScriptRoot
$target = Join-Path $here 'reach-test.ps1'
$Ports  = @(18480, 18443)
$root   = Join-Path ([IO.Path]::GetTempPath()) ('hy-reach-oztest-' + [Guid]::NewGuid().ToString('N').Substring(0, 8))
New-Item -ItemType Directory -Path $root | Out-Null

$rows = @()
function Check([string]$id, [string]$k, [string]$desc, [bool]$ok, [string]$gozlem) {
  $script:rows += [pscustomobject]@{ id = $id; kosul = $k; sonuc = $(if ($ok) { 'PASS' } else { 'FAIL' }); aciklama = $desc; gozlem = $gozlem }
}
$script:yabanciSurecler = @()

function Run([string]$dir, [string[]]$extra) {
  $a = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $target, '-SelfTestMode', '-StateDir', $dir, '-Ports', ($Ports -join ',')) + $extra
  # PS 5.1 tuzagi: EAP=Stop altinda yerli komutun stderr'i NativeCommandError'a donusur.
  $old = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
  try { $out = & powershell.exe @a 2>&1 | Out-String; $rc = $LASTEXITCODE } finally { $ErrorActionPreference = $old }
  return [pscustomobject]@{ rc = $rc; out = $out }
}
function NewDir([string]$n) { $d = Join-Path $root $n; New-Item -ItemType Directory -Path $d | Out-Null; return $d }
function ActiveId([string]$dir) { $f = Join-Path $dir 'aktif-kosu.txt'; if (Test-Path -LiteralPath $f) { (Get-Content -Raw -LiteralPath $f).Trim() } else { $null } }
function StateOf([string]$dir) {
  $f = @(Get-ChildItem -LiteralPath $dir -Filter 'kosu-*.json' | Sort-Object LastWriteTime -Descending)
  if ($f.Count -eq 0) { return $null }
  return (Get-Content -Raw -LiteralPath $f[0].FullName | ConvertFrom-Json)
}
function FakeFw([string]$dir) {
  $f = Join-Path $dir 'oz-test-sahte-guvenlik-duvari.json'
  if (-not (Test-Path -LiteralPath $f)) { return @() }
  $raw = Get-Content -Raw -LiteralPath $f; if (-not $raw -or -not $raw.Trim()) { return @() }
  return @(($raw | ConvertFrom-Json) | Where-Object { $_ })
}
function Alive($pid_) { [bool](Get-Process -Id $pid_ -ErrorAction SilentlyContinue) }
function AnyListening { @($Ports | Where-Object { @(Get-NetTCPConnection -State Listen -LocalPort $_ -ErrorAction SilentlyContinue).Count -gt 0 }).Count -gt 0 }
function WaitFree { $d = (Get-Date).AddSeconds(8); while ((AnyListening) -and (Get-Date) -lt $d) { Start-Sleep -Milliseconds 300 } }

# Yabanci surec: komut satiri dinleyicininkine BENZER (hy-reach, -RunId) ama baska kosuya ait.
function StartForeign {
  $f = Join-Path $root ('dinleyici-yabanci.ps1')
  Set-Content -LiteralPath $f -Value 'param([string]$RunId) Start-Sleep -Seconds 600' -Encoding UTF8
  $p = Start-Process -FilePath powershell.exe -PassThru -WindowStyle Hidden -ArgumentList @('-NoProfile', '-File', $f, '-RunId', 'baskakosu99')
  $script:yabanciSurecler += $p.Id
  Start-Sleep -Milliseconds 500
  return $p.Id
}

try {
  if (AnyListening) { Write-Host 'OLCULEMEDI: oz-test portlari dolu'; exit 1 }

  # ---------------- T0 — K-1: ilk degisiklikten ONCE kalici durum ----------------
  $d = NewDir 't0'
  $r = Run $d @('-Open', '-FaultAt', 'fw1')
  $s = StateOf $d
  Check 'T0-a' 'K-1' 'ilk kural ONCESI hatada bile durum dosyasi VAR' ($null -ne $s) ('durum dosyasi=' + [bool]$s)
  Check 'T0-b' 'K-1' 'baslangic olcumu ve niyet (planlanan kural) kalicilastirildi' (($null -ne $s.baslangic) -and (@($s.kurallarPlanlanan).Count -eq 1) -and (@($s.kurallarOlusturulan | Where-Object { $_ }).Count -eq 0)) ('planlanan=' + @($s.kurallarPlanlanan).Count + ' olusturulan=' + @($s.kurallarOlusturulan | Where-Object { $_ }).Count)
  Check 'T0-c' 'K-2' 'hic kaynak olusmadan hata -> cikis 1, durum acilis-basarisiz, isaretci yok' (($r.rc -eq 1) -and ($s.durum -eq 'acilis-basarisiz') -and (-not (ActiveId $d))) ('rc=' + $r.rc + ' durum=' + $s.durum)

  # ---------------- T1 — normal acilis + kapatma (yerel kontrol, PID kaydi) ----------------
  $d = NewDir 't1'
  $r = Run $d @('-Open')
  $s = StateOf $d
  $pids = @($s.surecler | ForEach-Object { $_.pid })
  $yk = @($s.yerelKontrol | Where-Object { $_.http -eq 200 -and $_.govde -and $_.kayit })
  Check 'T1-a' 'K-1' 'acilis: 2 kural ve 2 surec KIMLIGIYLE (PID + baslangic) kayitli' (($r.rc -eq 0) -and (@($s.kurallarOlusturulan).Count -eq 2) -and ($pids.Count -eq 2) -and (@($s.surecler | Where-Object { $_.baslangicUtc }).Count -eq 2)) ('rc=' + $r.rc + ' kural=' + @($s.kurallarOlusturulan).Count + ' pid=' + ($pids -join ','))
  Check 'T1-b' 'R-6' 'yerel kontrol her port: HTTP 200 + dogru govde + kayit satiri' ($yk.Count -eq 2) ('gecen port=' + $yk.Count + '/2')
  $log = Get-Content -LiteralPath $s.kayitDosyasi
  Check 'T1-c' 'R-6' 'yerel istekler kayitta YEREL isaretli, DIS satir yok' ((@($log | Where-Object { $_ -match "`tYEREL`t" }).Count -ge 2) -and (@($log | Where-Object { $_ -match "`tDIS`t" }).Count -eq 0)) ('YEREL=' + @($log | Where-Object { $_ -match "`tYEREL`t" }).Count)
  $r2 = Run $d @('-Close')
  $s2 = StateOf $d
  Check 'T1-d' 'K-3' 'kapatma: surecler durdu, kurallar kalkti, cikis 0, isaretci kalkti' (($r2.rc -eq 0) -and (@($pids | Where-Object { Alive $_ }).Count -eq 0) -and ((FakeFw $d).Count -eq 0) -and (-not (ActiveId $d)) -and ($s2.durum -eq 'kapandi')) ('rc=' + $r2.rc + ' canli pid=' + @($pids | Where-Object { Alive $_ }).Count)
  Check 'T1-e' 'K-4' 'kapatma sonrasi durum ve kayit dosyasi KORUNDU (silinmedi/yeniden adlandirilmadi)' ((Test-Path -LiteralPath $s.kayitDosyasi) -and ($null -ne $s2)) 'durum+kayit mevcut'
  WaitFree

  # ---------------- T2 — K-2: ikinci kuralda hata ----------------
  $d = NewDir 't2'
  $r = Run $d @('-Open', '-FaultAt', 'fw2')
  $s = StateOf $d
  Check 'T2' 'K-2' 'ikinci kuralda hata: olusan 1 kural geri alindi, surec yok, cikis 1' (($r.rc -eq 1) -and (@($s.kurallarOlusturulan).Count -eq 1) -and ((FakeFw $d).Count -eq 0) -and (@($s.surecler | Where-Object { $_ }).Count -eq 0)) ('rc=' + $r.rc + ' olusturulan=' + @($s.kurallarOlusturulan).Count + ' kalan kural=' + (FakeFw $d).Count)

  # ---------------- T3 — K-2: ikinci dinleyiciden sonra hata ----------------
  $d = NewDir 't3'
  $r = Run $d @('-Open', '-FaultAt', 'listener2')
  $s = StateOf $d
  $pids = @($s.surecler | ForEach-Object { $_.pid })
  Check 'T3' 'K-2' 'ikinci dinleyiciden sonra hata: 2 surec DURDU, 2 kural kalkti, cikis 1' (($r.rc -eq 1) -and ($pids.Count -eq 2) -and (@($pids | Where-Object { Alive $_ }).Count -eq 0) -and ((FakeFw $d).Count -eq 0)) ('rc=' + $r.rc + ' pid=' + $pids.Count + ' canli=' + @($pids | Where-Object { Alive $_ }).Count)
  WaitFree

  # ---------------- T4 — K-2: yerel kontrolde hata ----------------
  $d = NewDir 't4'
  $r = Run $d @('-Open', '-FaultAt', 'localcheck')
  $s = StateOf $d
  $pids = @($s.surecler | ForEach-Object { $_.pid })
  Check 'T4' 'K-2' 'yerel kontrol hatasi: dis teste GECILMEDI, her sey geri alindi, cikis 1' (($r.rc -eq 1) -and (@($pids | Where-Object { Alive $_ }).Count -eq 0) -and ((FakeFw $d).Count -eq 0) -and ($s.durum -eq 'acilis-basarisiz')) ('rc=' + $r.rc + ' durum=' + $s.durum)
  WaitFree

  # ---------------- T5 — K-3: yabanci surec ve yabanci kurallar KORUNUR ----------------
  $d = NewDir 't5'
  $yab = StartForeign
  $fw = Join-Path $d 'oz-test-sahte-guvenlik-duvari.json'
  (ConvertTo-Json -InputObject @('HY-REACH-TEST-80', 'HY-REACH-TEST-443', 'HY-REACH-baskakosu99-80')) | Set-Content -LiteralPath $fw -Encoding UTF8
  $r = Run $d @('-Open'); $r2 = Run $d @('-Close')
  $kalanFw = FakeFw $d
  Check 'T5-a' 'K-3' 'benzer komut satirli YABANCI surec kapatmadan SAG cikti' (Alive $yab) ('yabanci pid ' + $yab + ' canli=' + (Alive $yab))
  Check 'T5-b' 'K-3' 'R01 adli ve baska kosuya ait kurallar KORUNDU (wildcard yok)' ((@($kalanFw).Count -eq 3) -and ($kalanFw -contains 'HY-REACH-TEST-80') -and ($kalanFw -contains 'HY-REACH-baskakosu99-80')) ('kalan=' + (@($kalanFw) -join ','))
  Check 'T5-c' 'K-3' 'kendi kaynaklari yine de temizlendi (cikis 0/0)' (($r.rc -eq 0) -and ($r2.rc -eq 0)) ('open=' + $r.rc + ' close=' + $r2.rc)
  WaitFree

  # ---------------- T6 — K-3: PID yeniden kullanimi -> yabanciya DOKUNULMAZ ----------------
  $d = NewDir 't6'
  $yab2 = StartForeign
  $r = Run $d @('-Open')
  $sf = @(Get-ChildItem -LiteralPath $d -Filter 'kosu-*.json')[0].FullName
  $j = Get-Content -Raw -LiteralPath $sf | ConvertFrom-Json
  $gercekPid = $j.surecler[0].pid
  $j.surecler[0].pid = $yab2          # kayitli PID artik BASKA surece ait (baslangic zamani eslesmez)
  ($j | ConvertTo-Json -Depth 8) | Set-Content -LiteralPath $sf -Encoding UTF8
  $r2 = Run $d @('-Close')
  Check 'T6' 'K-3' 'kayitli PID baska surece gecmisse o surec DURDURULMAZ' (Alive $yab2) ('yabanci pid ' + $yab2 + ' canli=' + (Alive $yab2))
  if (Alive $gercekPid) { Stop-Process -Id $gercekPid -Force -ErrorAction SilentlyContinue }   # testin olusturdugu yetim
  WaitFree

  # ---------------- T7 — K-4: kapatmada kural silme HATASI ----------------
  $d = NewDir 't7'
  $r = Run $d @('-Open')
  $r2 = Run $d @('-Close', '-FaultAt', 'close-fw')
  $s = StateOf $d
  $bas = @($s.kurtarmaSonuclari | Where-Object { -not $_.basarili })
  Check 'T7-a' 'K-4' 'kapatma hatasi: cikis 3, durum kurtarma-basarisiz, PASS DEGIL' (($r2.rc -eq 3) -and ($s.durum -eq 'kurtarma-basarisiz')) ('rc=' + $r2.rc + ' durum=' + $s.durum)
  Check 'T7-b' 'K-4' 'basarisiz adimlar durum dosyasina ayrica KAYDEDILDI' ($bas.Count -ge 1) ('kayitli basarisiz adim=' + $bas.Count)
  Check 'T7-c' 'K-4' 'aktif isaretci ve durum dosyasi KORUNDU (tekrar kapatma mumkun)' ([bool](ActiveId $d)) ('isaretci=' + (ActiveId $d))
  $r3 = Run $d @('-Close')
  Check 'T7-d' 'K-4' 'hatasiz ikinci kapatma temizledi (cikis 0)' (($r3.rc -eq 0) -and ((FakeFw $d).Count -eq 0) -and (-not (ActiveId $d))) ('rc=' + $r3.rc)
  WaitFree

  # ---------------- T8 — K-4: acilis hatasi + geri alma HATASI ----------------
  $d = NewDir 't8'
  $r = Run $d @('-Open', '-FaultAt', 'localcheck,rollback-fw')
  $s = StateOf $d
  Check 'T8-a' 'K-4' 'acilis+geri alma hatasi: cikis 3, kurtarma-basarisiz, PASS DEGIL' (($r.rc -eq 3) -and ($s.durum -eq 'kurtarma-basarisiz')) ('rc=' + $r.rc + ' durum=' + $s.durum)
  Check 'T8-b' 'K-4' 'isaretci KALDI, kalan kurallar gorunur' (([bool](ActiveId $d)) -and ((FakeFw $d).Count -eq 2)) ('isaretci=' + [bool](ActiveId $d) + ' kalan kural=' + (FakeFw $d).Count)
  $r2 = Run $d @('-Close')
  Check 'T8-c' 'K-4' 'sonraki kapatma kalanlari temizledi (cikis 0)' (($r2.rc -eq 0) -and ((FakeFw $d).Count -eq 0)) ('rc=' + $r2.rc)
  WaitFree

  # ---------------- T9 — aktif kosu varken ikinci acilis reddedilir ----------------
  $d = NewDir 't9'
  $r = Run $d @('-Open')
  $s = StateOf $d; $pids = @($s.surecler | ForEach-Object { $_.pid })
  $r2 = Run $d @('-Open')
  Check 'T9' 'K-3' 'ikinci -Open cikis 4; mevcut kosunun surecleri ETKILENMEDI' (($r2.rc -eq 4) -and (@($pids | Where-Object { Alive $_ }).Count -eq 2)) ('rc=' + $r2.rc + ' canli=' + @($pids | Where-Object { Alive $_ }).Count)
  $null = Run $d @('-Close'); WaitFree

  # ---------------- S — statik kapilar (kaynak) ----------------
  $src = Get-Content -Raw -LiteralPath $target
  $kod = @(($src -split "`r?`n") | Where-Object { $_ -notmatch '^\s*#' }) -join "`n"
  Check 'S-1' 'K-3' 'guvenlik duvari cmdletlerinde wildcard YOK; kurallar -Name TAM adla' ((-not ($kod -match "NetFirewallRule[^\n]*\*")) -and ($kod -match 'Remove-NetFirewallRule -Name \$name')) 'wildcard yok, -Name var'
  Check 'S-2' 'K-3' 'surec adiyla toplu tarama YOK (Win32_Process Name= filtresi yok)' (-not ($kod -match "Win32_Process -Filter [`"']Name=")) 'ad filtresi yok'
  Check 'S-3' 'K-4' 'silme/durdurma cagrilari hatayi YUTMUYOR (SilentlyContinue yok)' (-not ($kod -match '(Remove-NetFirewallRule|Stop-Process)[^\n]*SilentlyContinue')) 'yutma yok'
  Check 'S-4' 'K-4' 'durum dosyasi yeniden adlandirilmiyor (Rename-Item yok)' (-not ($kod -match 'Rename-Item')) 'Rename-Item yok'
}
finally {
  foreach ($p in $script:yabanciSurecler) { if (Alive $p) { Stop-Process -Id $p -Force -ErrorAction SilentlyContinue } }
  # testin kendi dinleyicileri (yalniz oz-test dizinindeki dosyayi calistiranlar)
  Get-CimInstance Win32_Process -Filter "ProcessId > 0" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -and $_.CommandLine.Contains($root) } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
}

$rows | Format-Table id, kosul, sonuc, aciklama, gozlem -AutoSize -Wrap | Out-String -Width 220 | Write-Host
$fail = @($rows | Where-Object { $_.sonuc -eq 'FAIL' }).Count
Write-Host ('REACH-TEST OZ-TESTI: PASS ' + ($rows.Count - $fail) + ' / ' + $rows.Count)
Write-Host ('  kanit dizini: ' + $root)
Write-Host '  (guvenlik duvari SAHTE kayit defteri; dinleyici surecleri GERCEK; canliya dokunulmadi)'
if ($fail -gt 0) { exit 1 }
exit 0
