# =============================================================================
# DIS ERISILEBILIRLIK TESTI (R02) — GERI ALINABILIR. Owner GO'su OLMADAN KOSULMAZ.
#
# NE OLCER: Dis agdan gonderilen DUZ HTTP isteginin (TLS YOK) belirtilen TCP portundan
# bu sunucuya ULASIP ULASMADIGINI, port bazinda. Baska hicbir seyi olcmez:
#   - TLS/sertifika calistigini OLCMEZ (443'e duz HTTP gonderilir).
#   - Istek ulasmazsa NEREDE durdugunu AYIRT ETMEZ (yonlendirme eksikligi, ust NAT, ISP filtresi,
#     mobil operator — hepsi ayni sonucu, bos kaydi verir).
#   - IP'nin statikligini OLCMEZ.
#
# NE YAPMAZ: TLS kurmaz, SERTIFIKA TALEP ETMEZ, DNS kaydi olusturmaz, urune ait hicbir seyi
# yayinlamaz, canli 8080/3002 servislerine dokunmaz, yonlendiriciye dokunmaz.
#
# GUVENLIK TASARIMI (R01 kusurlari ve karsiliklari — bkz. reach-test-selftest.ps1):
#   R-1 Durum ILK DEGISIKLIKTEN ONCE yazilir; her kaynak OLUSTURULMADAN niyet, OLUSTURULDUKTAN
#       sonra kimligi (kural tam adi, surec PID + baslangic zamani) kalicilastirilir.
#   R-2 Acilisin HERHANGI bir adiminda hata -> yalniz BU kosunun durum dosyasinda kayitli
#       kural ve surecler geri alinir.
#   R-3 Wildcard YOK: kurallar `-Name` ile TAM adla (runId gomulu) olusturulur ve silinir.
#       Surecler yalniz PID + baslangic zamani + komut satirinda runId UCU BIRDEN eslesirse
#       durdurulur; PowerShell/node sureclerinin genel taramasi YAPILMAZ.
#   R-4 Kurtarma hatasi YUTULMAZ: her geri alma adiminin sonucu kaydedilir; biri bile
#       basarisizsa durum `kurtarma-basarisiz`, cikis 3, aktif isaretci ve durum dosyasi KALIR.
#   R-5 Dinleyici suresi SINIRLIDIR (-TimeoutMinutes); sure dolunca kendini kapatir.
#   R-6 Acilis, dis teste gecmeden once her portu YEREL olarak dogrular (200 + govde + kayit).
#
# MODLAR
#   -Open  [-Ports 80,443] [-TimeoutMinutes 30]  : kural + gecici dinleyici, yerel kontrol
#   -Status                                      : salt okuma; yonetici gerekmez
#   -Close                                       : yalniz aktif kosunun kaynaklarini kaldirir, OLCER
#
# CIKIS: 0 basarili · 1 acilis basarisiz (kurtarma TEMIZ) · 2 on kosul yok
#        3 KURTARMA BASARISIZ (elle inceleme gerekir) · 4 aktif kosu zaten var
# =============================================================================
param(
  [switch]$Open,
  [switch]$Status,
  [switch]$Close,
  # DIZE olarak alinir: `powershell -File` dizi parametresini tek dizeye cevirir ve [int[]]'e
  # donusumde virgul kaybolur (oz-testte olculdu: '18480,18443' -> 1848018443). Burada ayrilir.
  [string]$Ports = '80,443',
  [int]$TimeoutMinutes = 30,
  # ---- YALNIZ OZ-TEST ICIN (canli kosumda verilmez) --------------------------------
  [string]$StateDir = '',
  [switch]$SelfTestMode,
  [string]$FaultAt = ''
)
$ErrorActionPreference = 'Stop'

$PortList = @(($Ports -split '[,\s]+') | Where-Object { $_ } | ForEach-Object { [int]$_ })
if ($PortList.Count -eq 0 -or @($PortList | Where-Object { $_ -lt 1 -or $_ -gt 65535 }).Count -gt 0) {
  Write-Host ('HATA: gecersiz port listesi: ' + $Ports); exit 2
}
$Ports = $null   # asagida YALNIZ $PortList kullanilir

if (-not $StateDir) { $StateDir = Join-Path ([Environment]::GetFolderPath('MyDocuments')) 'hy-reach-test' }
if (-not (Test-Path -LiteralPath $StateDir)) { New-Item -ItemType Directory -Path $StateDir | Out-Null }
$ActiveFile = Join-Path $StateDir 'aktif-kosu.txt'
$FakeFwFile = Join-Path $StateDir 'oz-test-sahte-guvenlik-duvari.json'

# ------------------------------------------------------------------ yardimcilar
function IsAdmin {
  $id = [Security.Principal.WindowsIdentity]::GetCurrent()
  (New-Object Security.Principal.WindowsPrincipal($id)).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}
# Oz-test hata enjeksiyonu; birden fazla nokta virgulle verilebilir (or. 'localcheck,rollback-fw').
function Fault([string]$at) { if (@($FaultAt -split ',') -contains $at) { throw ('ENJEKTE-HATA: ' + $at) } }
function Listeners([int]$p) { @(Get-NetTCPConnection -State Listen -LocalPort $p -ErrorAction SilentlyContinue) }
function StateFileOf([string]$runId) { Join-Path $StateDir ('kosu-' + $runId + '.json') }
function LogFileOf([string]$runId) { Join-Path $StateDir ('kosu-' + $runId + '.log') }
function Save($st) { $st.guncellendiUtc = (Get-Date).ToUniversalTime().ToString('o'); ($st | ConvertTo-Json -Depth 8) | Set-Content -LiteralPath (StateFileOf $st.runId) -Encoding UTF8 }
function Load([string]$runId) {
  $o = Get-Content -Raw -LiteralPath (StateFileOf $runId) | ConvertFrom-Json
  # PS 5.1: JSON nesnesini duzenlenebilir hashtable'a cevir; dizileri her zaman dizi tut.
  $h = [ordered]@{}
  foreach ($p in $o.PSObject.Properties) { $h[$p.Name] = $p.Value }
  $h.kurallarOlusturulan = @($o.kurallarOlusturulan | Where-Object { $_ })
  $h.surecler = @($o.surecler | Where-Object { $_ })
  $h.kurtarmaSonuclari = @($o.kurtarmaSonuclari | Where-Object { $_ })
  return $h
}

# Guvenlik duvari islemleri: canlida gercek cmdlet, oz-testte sahte kayit defteri.
function FwLoad {
  if (-not (Test-Path -LiteralPath $FakeFwFile)) { return @() }
  $raw = Get-Content -Raw -LiteralPath $FakeFwFile
  if (-not $raw -or -not $raw.Trim()) { return @() }
  return @(($raw | ConvertFrom-Json) | Where-Object { $_ })
}
function FwNew([string]$name, [int]$port) {
  if ($SelfTestMode) { $r = @(FwLoad) + @($name); (ConvertTo-Json -InputObject @($r)) | Set-Content -LiteralPath $FakeFwFile -Encoding UTF8; return }
  New-NetFirewallRule -Name $name -DisplayName $name -Direction Inbound -Action Allow -Protocol TCP -LocalPort $port -Profile Any | Out-Null
}
function FwRemove([string]$name) {
  if ($SelfTestMode) { $r = @(FwLoad | Where-Object { $_ -ne $name }); (ConvertTo-Json -InputObject @($r)) | Set-Content -LiteralPath $FakeFwFile -Encoding UTF8; return }
  Remove-NetFirewallRule -Name $name   # TAM ad; runId alfasayisal, wildcard karakteri icermez
}
function FwExists([string]$name) {
  if ($SelfTestMode) { return [bool](@(FwLoad) -contains $name) }
  return [bool](Get-NetFirewallRule -Name $name -ErrorAction SilentlyContinue)
}

# Surec kimligi: PID + baslangic zamani + komut satirinda runId. Ucu birden eslesmeli.
function ProcMatches($rec, [string]$runId) {
  $p = Get-Process -Id $rec.pid -ErrorAction SilentlyContinue
  if (-not $p) { return 'yok' }
  $bas = $p.StartTime.ToUniversalTime().ToString('o')
  if ($bas -ne $rec.baslangicUtc) { return 'yabanci' }
  $cim = Get-CimInstance Win32_Process -Filter ('ProcessId=' + $rec.pid) -ErrorAction SilentlyContinue
  if (-not $cim -or $cim.CommandLine -notmatch [regex]::Escape('-RunId ' + $runId)) { return 'yabanci' }
  return 'bizim'
}

# Yalniz durum dosyasinda kayitli kaynaklari geri alir. Her adimin sonucunu dondurur.
# $baglam: 'rollback' (acilis hatasi) | 'close' (kapatma) — yalniz hata enjeksiyonu adini belirler.
function Undo($st, [string]$baglam) {
  $sonuc = @()
  foreach ($rec in @($st.surecler)) {
    try {
      Fault ($baglam + '-proc')
      $m = ProcMatches $rec $st.runId
      if ($m -eq 'bizim') { Stop-Process -Id $rec.pid -Force; Start-Sleep -Milliseconds 700 }
      $hala = (ProcMatches $rec $st.runId) -eq 'bizim'
      $sonuc += [ordered]@{ tur = 'surec'; kimlik = [string]$rec.pid; once = $m; basarili = (-not $hala) }
    } catch { $sonuc += [ordered]@{ tur = 'surec'; kimlik = [string]$rec.pid; hata = $_.Exception.Message; basarili = $false } }
  }
  foreach ($name in @($st.kurallarOlusturulan)) {
    try {
      Fault ($baglam + '-fw')
      if (FwExists $name) { FwRemove $name }
      $sonuc += [ordered]@{ tur = 'kural'; kimlik = $name; basarili = (-not (FwExists $name)) }
    } catch { $sonuc += [ordered]@{ tur = 'kural'; kimlik = $name; hata = $_.Exception.Message; basarili = $false } }
  }
  return $sonuc   # dizi acilir; cagiran @(...) ile toplar (ic ice dizi OLUSMAZ)
}

# ------------------------------------------------------------------ STATUS
if ($Status) {
  Write-Host '== DIS ERISILEBILIRLIK TESTI — DURUM (salt okuma) =='
  if (-not (Test-Path -LiteralPath $ActiveFile)) { Write-Host '  aktif kosu YOK'; exit 0 }
  $runId = (Get-Content -Raw -LiteralPath $ActiveFile).Trim()
  $st = Load $runId
  Write-Host ('  runId    : ' + $runId + '   durum: ' + $st.durum)
  Write-Host ('  portlar  : ' + (@($st.portlar) -join ',') + '   sure sonu (UTC): ' + $st.sureSonuUtc)
  foreach ($n in @($st.kurallarOlusturulan)) { Write-Host ('  kural    : ' + $n + '  var=' + (FwExists $n)) }
  foreach ($r in @($st.surecler)) { Write-Host ('  surec    : port ' + $r.port + ' pid ' + $r.pid + '  -> ' + (ProcMatches $r $runId)) }
  $log = LogFileOf $runId
  if (Test-Path -LiteralPath $log) {
    $satirlar = @(Get-Content -LiteralPath $log)
    $dis = @($satirlar | Where-Object { $_ -match '\tDIS\t' })
    Write-Host ('  kayit    : toplam ' + $satirlar.Count + ' satir · DIS kaynakli ' + $dis.Count)
    $satirlar | Select-Object -Last 15 | ForEach-Object { Write-Host ('    ' + $_) }
  } else { Write-Host '  kayit    : yok' }
  exit 0
}

# ------------------------------------------------------------------ CLOSE
if ($Close) {
  if (-not $SelfTestMode -and -not (IsAdmin)) { Write-Host 'OLCULEMEDI: kapatma icin yonetici hakki gerekir'; exit 2 }
  if (-not (Test-Path -LiteralPath $ActiveFile)) { Write-Host '  aktif kosu YOK — hicbir sey hedeflenmedi'; exit 0 }
  $runId = (Get-Content -Raw -LiteralPath $ActiveFile).Trim()
  $st = Load $runId
  Write-Host ('== KAPATMA — runId ' + $runId + ' ==')

  $undo = @(Undo $st 'close')

  # OLCEREK dogrula: kayitli her kaynak GERCEKTEN yok mu?
  $kalanKural = @(@($st.kurallarOlusturulan) | Where-Object { FwExists $_ })
  $kalanSurec = @(@($st.surecler) | Where-Object { (ProcMatches $_ $runId) -eq 'bizim' })
  $basarisiz = @($undo | Where-Object { -not $_.basarili })

  $st.kurtarmaSonuclari = @($st.kurtarmaSonuclari) + @($undo)
  $st.kapanisUtc = (Get-Date).ToUniversalTime().ToString('o')
  foreach ($u in $undo) { Write-Host ('  ' + $u.tur + ' ' + $u.kimlik + ' -> ' + $(if ($u.basarili) { 'kaldirildi' } else { 'BASARISIZ ' + $u.hata })) }
  Write-Host ('  kalan kural : ' + $kalanKural.Count + '   kalan surec: ' + $kalanSurec.Count)

  if ($kalanKural.Count -eq 0 -and $kalanSurec.Count -eq 0 -and $basarisiz.Count -eq 0) {
    $st.durum = 'kapandi'; Save $st
    Remove-Item -LiteralPath $ActiveFile -Force   # yalniz isaretci; durum ve kayit dosyasi KORUNUR
    Write-Host '  SONUC: sunucu tarafi TEMIZ. Durum ve kayit dosyasi korundu.'
    Write-Host '  HATIRLATMA: yonlendirici kurali owner tarafindan ayrica kaldirilir ve dis agdan'
    Write-Host '              erisimin KESILDIGI dogrulanir.'
    exit 0
  }
  $st.durum = 'kurtarma-basarisiz'; Save $st
  Write-Host '  SONUC: KURTARMA BASARISIZ — aktif isaretci ve durum dosyasi KORUNDU.'
  Write-Host ('  Durum dosyasi: ' + (StateFileOf $runId))
  exit 3
}

# ------------------------------------------------------------------ OPEN
if (-not $Open) { Write-Host 'Kullanim: -Open [-Ports 80,443] [-TimeoutMinutes 30] | -Status | -Close'; exit 2 }
if (-not $SelfTestMode -and -not (IsAdmin)) { Write-Host 'OLCULEMEDI: acilis icin yonetici hakki gerekir'; exit 2 }
if (Test-Path -LiteralPath $ActiveFile) {
  Write-Host ('HATA: aktif kosu zaten var (' + (Get-Content -Raw -LiteralPath $ActiveFile).Trim() + ') — once -Close. Mevcut kosuya DOKUNULMADI.')
  exit 4
}
foreach ($p in $PortList) {
  if ((Listeners $p).Count -gt 0) { Write-Host ('HATA: port ' + $p + ' zaten dinleniyor — test ACILMADI, hicbir sey degismedi'); exit 1 }
}

$runId = -join ((48..57) + (97..122) | Get-Random -Count 12 | ForEach-Object { [char]$_ })
$yol = '/hy-reach-' + $runId
$st = [ordered]@{
  runId = $runId
  durum = 'hazirlik'
  olusturulduUtc = (Get-Date).ToUniversalTime().ToString('o')
  sureSonuUtc = (Get-Date).ToUniversalTime().AddMinutes($TimeoutMinutes).ToString('o')
  portlar = @($PortList)
  yol = $yol
  kayitDosyasi = (LogFileOf $runId)
  dinleyiciDosyasi = (Join-Path $StateDir ('dinleyici-' + $runId + '.ps1'))
  baslangic = [ordered]@{}
  kurallarPlanlanan = @()
  kurallarOlusturulan = @()
  surecler = @()
  yerelKontrol = @()
  kurtarmaSonuclari = @()
  oztest = [bool]$SelfTestMode
}
foreach ($p in $PortList) { $st.baslangic[[string]$p] = (Listeners $p).Count }

# R-1: ILK DEGISIKLIKTEN ONCE kalici durum + aktif isaretci.
Save $st
Set-Content -LiteralPath $ActiveFile -Value $runId -Encoding ASCII

$listener = @'
param([int]$Port, [string]$Yol, [string]$Log, [string]$RunId, [string]$Deadline, [string]$Prefix)
$l = New-Object Net.HttpListener
$l.Prefixes.Add($Prefix)
$l.Start()
$son = [DateTime]::Parse($Deadline).ToUniversalTime()
$satirSiniri = 1000
function Yaz([string]$s) { if (@(Get-Content -LiteralPath $Log -ErrorAction SilentlyContinue).Count -lt $satirSiniri) { Add-Content -LiteralPath $Log -Value $s } }
# TEK bekleyen gorev tutulur; tamamlanmadan YENISI ACILMAZ (aksi halde gelen istek terk edilmis
# bir goreve baglanir ve yanit hic gonderilmez — oz-testte olculdu).
$t = $null
while ($l.IsListening) {
  if ((Get-Date).ToUniversalTime() -ge $son) { Yaz ("{0}`tSISTEM`t-`t{1}`t-`tSURE-DOLDU" -f (Get-Date).ToUniversalTime().ToString('o'), $Port); $l.Stop(); break }
  if ($null -eq $t) { $t = $l.GetContextAsync() }
  if (-not $t.Wait(1000)) { continue }
  try {
    $ctx = $t.Result; $t = $null; $req = $ctx.Request
    $ip = [string]$req.RemoteEndPoint.Address
    $kaynak = if ($ip -eq '127.0.0.1' -or $ip -eq '::1') { 'YEREL' } else { 'DIS' }
    $yolS = $req.Url.AbsolutePath; if ($yolS.Length -gt 200) { $yolS = $yolS.Substring(0, 200) }
    $ua = [string]$req.UserAgent; if ($ua.Length -gt 120) { $ua = $ua.Substring(0, 120) }
    Yaz ("{0}`t{1}`t{2}`t{3}`t{4} {5}`tUA={6}" -f (Get-Date).ToUniversalTime().ToString('o'), $kaynak, $ip, $Port, $req.HttpMethod, $yolS, $ua)
    $ok = ($req.HttpMethod -eq 'GET' -and $yolS -eq $Yol)
    $govde = if ($ok) { "HY-REACH-OK $RunId port=$Port" } else { 'not found' }
    $ctx.Response.StatusCode = if ($ok) { 200 } else { 404 }
    $ctx.Response.ContentType = 'text/plain; charset=utf-8'
    $b = [Text.Encoding]::UTF8.GetBytes($govde)
    $ctx.Response.OutputStream.Write($b, 0, $b.Length); $ctx.Response.Close()
  } catch { $t = $null }
}
'@

$acilisHatasi = $null
try {
  # R-1 devam: her kural icin once NIYET, sonra olusan KIMLIK kalicilastirilir.
  $i = 0
  foreach ($p in $PortList) {
    $i++
    $name = 'HY-REACH-' + $runId + '-' + $p
    $st.kurallarPlanlanan = @($st.kurallarPlanlanan) + @($name); Save $st
    Fault ('fw' + $i)
    FwNew $name $p
    $st.kurallarOlusturulan = @($st.kurallarOlusturulan) + @($name); Save $st
  }
  $st.durum = 'kurallar-kuruldu'; Save $st

  Set-Content -LiteralPath $st.dinleyiciDosyasi -Value $listener -Encoding UTF8
  $i = 0
  foreach ($p in $PortList) {
    $i++
    $prefix = if ($SelfTestMode) { 'http://localhost:' + $p + '/' } else { 'http://+:' + $p + '/' }
    $proc = Start-Process -FilePath 'powershell.exe' -PassThru -WindowStyle Hidden -ArgumentList @(
      '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $st.dinleyiciDosyasi,
      '-Port', $p, '-Yol', $yol, '-Log', $st.kayitDosyasi, '-RunId', $runId, '-Deadline', $st.sureSonuUtc, '-Prefix', $prefix)
    Start-Sleep -Milliseconds 400
    $bas = (Get-Process -Id $proc.Id).StartTime.ToUniversalTime().ToString('o')
    $st.surecler = @($st.surecler) + @([ordered]@{ port = $p; pid = $proc.Id; baslangicUtc = $bas }); Save $st
    Fault ('listener' + $i)
  }
  $st.durum = 'dinleyiciler-basladi'; Save $st
  Start-Sleep -Seconds 2

  # R-6: dis teste gecmeden once YEREL kontrol (dinleyici + kayit mekanizmasi).
  foreach ($p in $PortList) {
    Fault 'localcheck'
    $hedef = if ($SelfTestMode) { 'localhost' } else { '127.0.0.1' }
    $once = @(Get-Content -LiteralPath $st.kayitDosyasi -ErrorAction SilentlyContinue).Count
    $r = Invoke-WebRequest -Uri ('http://' + $hedef + ':' + $p + $yol) -UseBasicParsing -TimeoutSec 10
    Start-Sleep -Milliseconds 400
    $sonra = @(Get-Content -LiteralPath $st.kayitDosyasi -ErrorAction SilentlyContinue).Count
    $govde = if ($r.Content -is [byte[]]) { [Text.Encoding]::UTF8.GetString($r.Content) } else { [string]$r.Content }
    $govdeOk = ($govde.Trim() -eq ('HY-REACH-OK ' + $runId + ' port=' + $p))
    $kayitOk = ($sonra -gt $once)
    $st.yerelKontrol = @($st.yerelKontrol) + @([ordered]@{ port = $p; http = [int]$r.StatusCode; govde = $govdeOk; kayit = $kayitOk })
    Save $st
    if (-not ($r.StatusCode -eq 200 -and $govdeOk -and $kayitOk)) { throw ('YEREL KONTROL BASARISIZ: port ' + $p) }
  }
  $st.durum = 'acik'; Save $st
}
catch { $acilisHatasi = $_.Exception.Message }

if ($acilisHatasi) {
  # R-2 + R-4: yalniz BU kosunun kayitli kaynaklari geri alinir; sonuc yutulmaz.
  Write-Host ('HATA: acilis basarisiz — ' + $acilisHatasi)
  $undo = @(Undo $st 'rollback')
  $st.kurtarmaSonuclari = @($st.kurtarmaSonuclari) + @($undo)
  $st.acilisHatasi = $acilisHatasi
  foreach ($u in $undo) { Write-Host ('  geri alma: ' + $u.tur + ' ' + $u.kimlik + ' -> ' + $(if ($u.basarili) { 'kaldirildi' } else { 'BASARISIZ ' + $u.hata })) }
  $kalanKural = @(@($st.kurallarOlusturulan) | Where-Object { FwExists $_ })
  $kalanSurec = @(@($st.surecler) | Where-Object { (ProcMatches $_ $runId) -eq 'bizim' })
  if ($kalanKural.Count -eq 0 -and $kalanSurec.Count -eq 0 -and @($undo | Where-Object { -not $_.basarili }).Count -eq 0) {
    $st.durum = 'acilis-basarisiz'; Save $st
    Remove-Item -LiteralPath $ActiveFile -Force
    Write-Host '  SONUC: acilis BASARISIZ, kurtarma TEMIZ (bu kosunun olusturdugu her sey kaldirildi).'
    exit 1
  }
  $st.durum = 'kurtarma-basarisiz'; Save $st
  Write-Host '  SONUC: KURTARMA BASARISIZ — aktif isaretci ve durum dosyasi KORUNDU; -Close ile tekrar deneyin.'
  exit 3
}

Write-Host ('== DIS ERISILEBILIRLIK TESTI ACILDI — runId ' + $runId + ' ==')
foreach ($y in @($st.yerelKontrol)) { Write-Host ('  YEREL KONTROL port ' + $y.port + ': HTTP ' + $y.http + ' · govde ' + $y.govde + ' · kayit ' + $y.kayit) }
Write-Host ('  Dinleyiciler ' + $st.sureSonuUtc + ' (UTC) tarihinde KENDILIGINDEN kapanir; kural icin yine -Close gerekir.')
Write-Host ''
Write-Host '  DIS TEST — mobil veri, Wi-Fi KAPALI. Her portu AYRI deneyin; adresi AYNEN yazin:'
foreach ($p in $PortList) {
  $adres = 'http://<GENEL_IP>' + $(if ($p -ne 80) { ':' + $p } else { '' }) + $yol
  Write-Host ('    port ' + $p + ' (DUZ HTTP, TLS YOK): ' + $adres)
}
Write-Host '  443 icin de sema `http://` ve `:443` yazilir; `https://` KULLANILMAZ — TLS kurulmadi.'
Write-Host ('  BEKLENEN GOVDE: HY-REACH-OK ' + $runId + ' port=<port>')
Write-Host '  Sonra -Status ile kayda bakin: `DIS` isaretli satir = o porttan dis istek SUNUCUYA ULASTI.'
Write-Host '  DIS satir yoksa: istek sunucuya ulasmadi; NEREDE durdugu bu testten CIKARILAMAZ.'
exit 0
