# =============================================================================
# DIS ERISILEBILIRLIK TESTI — GERI ALINABILIR. Owner GO'su OLMADAN KOSULMAZ.
#
# NE OLCER: 80 ve/veya 443 portuna DIS AGDAN (mobil veri) erisim gercekten geliyor mu?
# Bugun sunucuda 80/443 dinleyicisi ve NAT kurali YOKTUR; bu yuzden basarisiz bir port
# yoklamasi "ISP engeli" ANLAMINA GELMEZ. Bu test tam da o belirsizligi kaldirmak icindir.
#
# NE YAPMAZ: TLS kurmaz, SERTIFIKA TALEP ETMEZ, DNS kaydi olusturmaz, Caddy kurmaz,
# urune ait hicbir seyi yayinlamaz. Yalniz tek bir test yoluna rastgele bir belirtec doner;
# diger her yola 404. Canli 8080/3002 servislerine DOKUNMAZ.
#
# MODLAR
#   -Open  [-Ports 80,443]   : guvenlik duvari kurali + gecici dinleyici acar, belirtec uretir
#   -Status                  : mevcut durumu ve gelen istekleri gosterir
#   -Close                   : dinleyiciyi ve KURALI kaldirir, kalmadigini OLCEREK dogrular
#
# OWNER'IN AYRICA YAPMASI GEREKEN (betik yapamaz): yonlendirici(ler)de 80/443 -> bu sunucu
# yonlendirmesi. Olculen zincir UC katmanlidir (bkz. paket §18.1), tek cihaz olmayabilir.
#
# CIKIS: 0 basarili · 1 hata · 2 on kosul yok
# =============================================================================
param(
  [switch]$Open,
  [switch]$Status,
  [switch]$Close,
  [int[]]$Ports = @(80, 443),
  [int]$TimeoutMinutes = 30
)
$ErrorActionPreference = 'Stop'

$RuleTag   = 'HY-REACH-TEST'
$StateFile = Join-Path ([Environment]::GetFolderPath('MyDocuments')) 'hy-reach-test-state.json'
$LogFile   = Join-Path ([Environment]::GetFolderPath('MyDocuments')) 'hy-reach-test.log'

function IsAdmin {
  $id = [Security.Principal.WindowsIdentity]::GetCurrent()
  (New-Object Security.Principal.WindowsPrincipal($id)).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}
function Listeners([int]$p) { @(Get-NetTCPConnection -State Listen -LocalPort $p -ErrorAction SilentlyContinue) }
function RuleCount { @(Get-NetFirewallRule -DisplayName ($RuleTag + '*') -ErrorAction SilentlyContinue).Count }

# ---------------------------------------------------------------- STATUS
if ($Status) {
  Write-Host '== DIS ERISILEBILIRLIK TESTI — DURUM =='
  foreach ($p in 80, 443) { Write-Host ('  port ' + $p + ' dinleyici sayisi: ' + (Listeners $p).Count) }
  Write-Host ('  guvenlik duvari kurali (' + $RuleTag + '*): ' + (RuleCount))
  if (Test-Path -LiteralPath $StateFile) {
    $s = Get-Content -Raw -LiteralPath $StateFile | ConvertFrom-Json
    Write-Host ('  acilis    : ' + $s.acildiUtc + '  portlar: ' + ($s.portlar -join ','))
    Write-Host ('  belirtec  : ' + $s.belirtec)
  } else { Write-Host '  durum dosyasi YOK (test acik degil)' }
  if (Test-Path -LiteralPath $LogFile) {
    Write-Host '  --- gelen istekler (son 20) ---'
    Get-Content -LiteralPath $LogFile -Tail 20 | ForEach-Object { Write-Host ('    ' + $_) }
  } else { Write-Host '  henuz hicbir istek kaydedilmedi' }
  exit 0
}

# ---------------------------------------------------------------- CLOSE
if ($Close) {
  if (-not (IsAdmin)) { Write-Host 'OLCULEMEDI: kapatma icin yonetici hakki gerekir'; exit 2 }
  Write-Host '== KAPATMA =='
  # 1) dinleyicileri durdur (yalniz BU betigin baslattigi surecler)
  $durduruldu = 0
  Get-CimInstance Win32_Process -Filter "Name='powershell.exe' OR Name='pwsh.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -match 'HY-REACH-LISTENER' } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue; $durduruldu++ }
  Start-Sleep -Seconds 2
  # 2) guvenlik duvari kurallarini kaldir
  Get-NetFirewallRule -DisplayName ($RuleTag + '*') -ErrorAction SilentlyContinue | Remove-NetFirewallRule -ErrorAction SilentlyContinue
  Start-Sleep -Seconds 1
  # 3) OLCEREK dogrula
  $kalanKural = RuleCount
  $kalan80 = (Listeners 80).Count
  $kalan443 = (Listeners 443).Count
  Write-Host ('  durdurulan dinleyici sureci : ' + $durduruldu)
  Write-Host ('  kalan guvenlik duvari kurali: ' + $kalanKural)
  Write-Host ('  kalan dinleyici 80 / 443    : ' + $kalan80 + ' / ' + $kalan443)
  if (Test-Path -LiteralPath $StateFile) { Rename-Item -LiteralPath $StateFile -NewName ((Split-Path $StateFile -Leaf) + '.kapandi') -Force }
  if ($kalanKural -eq 0 -and $kalan80 -eq 0 -and $kalan443 -eq 0) {
    Write-Host '  SONUC: temiz — sunucu tarafi baslangic durumuna dondu.'
    Write-Host '  HATIRLATMA: yonlendirici(ler)deki port yonlendirmesini owner AYRICA kaldirmalidir;'
    Write-Host '              kaldirdiktan sonra dis agdan erisimin KESILDIGI dogrulanmalidir.'
    exit 0
  }
  Write-Host '  SONUC: TEMIZ DEGIL — yukaridaki kalan ogeler elle incelenmelidir.'
  exit 1
}

# ---------------------------------------------------------------- OPEN
if (-not $Open) { Write-Host 'Kullanim: -Open [-Ports 80,443] | -Status | -Close'; exit 2 }
if (-not (IsAdmin)) { Write-Host 'OLCULEMEDI: acilis icin yonetici hakki gerekir'; exit 2 }

foreach ($p in $Ports) {
  if ((Listeners $p).Count -gt 0) { Write-Host ('HATA: port ' + $p + ' zaten dinleniyor — test acilmadi'); exit 1 }
}

$belirtec = -join ((48..57) + (97..122) | Get-Random -Count 16 | ForEach-Object { [char]$_ })
$state = [ordered]@{
  acildiUtc = (Get-Date).ToUniversalTime().ToString('o')
  portlar   = $Ports
  belirtec  = $belirtec
  yol       = '/hy-reach-' + $belirtec
}
$state | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $StateFile -Encoding UTF8

foreach ($p in $Ports) {
  New-NetFirewallRule -DisplayName ($RuleTag + '-' + $p) -Direction Inbound -Action Allow `
    -Protocol TCP -LocalPort $p -Profile Any | Out-Null
}

# Dinleyici: yalniz test yoluna 200 + belirtec doner; diger her seye 404. Istekleri loga yazar.
$listener = @'
# HY-REACH-LISTENER
param([int]$Port, [string]$Yol, [string]$Log)
$l = New-Object Net.HttpListener
$l.Prefixes.Add("http://+:$Port/")
$l.Start()
while ($l.IsListening) {
  try {
    $ctx = $l.GetContext()
    $req = $ctx.Request
    $satir = "{0}  {1}  {2}  {3}  UA={4}" -f (Get-Date).ToUniversalTime().ToString('o'), $req.RemoteEndPoint.Address, $req.HttpMethod, $req.Url.AbsolutePath, $req.UserAgent
    Add-Content -LiteralPath $Log -Value $satir
    $govde = if ($req.Url.AbsolutePath -eq $Yol) { "HY-REACH-OK $Yol" } else { "not found" }
    $ctx.Response.StatusCode = if ($req.Url.AbsolutePath -eq $Yol) { 200 } else { 404 }
    $b = [Text.Encoding]::UTF8.GetBytes($govde)
    $ctx.Response.OutputStream.Write($b, 0, $b.Length)
    $ctx.Response.Close()
  } catch { break }
}
'@
$listenerFile = Join-Path ([IO.Path]::GetTempPath()) ('hy-reach-listener-' + $belirtec + '.ps1')
Set-Content -LiteralPath $listenerFile -Value $listener -Encoding UTF8

foreach ($p in $Ports) {
  Start-Process -FilePath 'powershell.exe' `
    -ArgumentList '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $listenerFile, '-Port', $p, '-Yol', $state.yol, '-Log', $LogFile `
    -WindowStyle Hidden | Out-Null
}
Start-Sleep -Seconds 3

Write-Host '== DIS ERISILEBILIRLIK TESTI ACILDI =='
foreach ($p in $Ports) { Write-Host ('  port ' + $p + ' dinleyici: ' + (Listeners $p).Count) }
Write-Host ('  guvenlik duvari kurali: ' + (RuleCount))
Write-Host ''
Write-Host '  DIS AGDAN (mobil veri, Wi-Fi KAPALI) su adresleri deneyin:'
foreach ($p in $Ports) {
  $sema = 'http'
  Write-Host ('    ' + $sema + '://<GENEL_IP>' + $(if ($p -ne 80) { ':' + $p } else { '' }) + $state.yol)
}
Write-Host ''
Write-Host '  BEKLENEN: "HY-REACH-OK ..." metni. Gelmezse -Status ile loga bakin:'
Write-Host '    * log BOS ise  -> istek sunucuya HIC ulasmadi (yonlendirme eksik ya da ust katman engelliyor)'
Write-Host '    * log DOLU ise -> dis erisim CALISIYOR, hangi porttan geldigi satirda yazar'
Write-Host ''
Write-Host ('  KAPATMA (test biter bitmez): bu betigi -Close ile calistirin. Onerilen sure <= ' + $TimeoutMinutes + ' dk.')
exit 0
