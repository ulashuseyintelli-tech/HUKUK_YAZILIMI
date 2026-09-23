param([ValidateSet('open', 'close', 'status')][string]$Command = 'status', [string]$RunStateFile, [string]$CaptureDir)
$ErrorActionPreference = 'Stop'
# =============================================================================
# OFFICE PERSONEL DAVETI — CANLI PENCERE (YONETICI GEREKIR: gorev + guvenlik duvari)
#
# open : baslangic durumunu KAYDEDER -> Web gorevini durdurur ve DEVRE DISI birakir ->
#        8080/3002 icin KOSUMA OZEL uzak erisim ENGELI ekler -> .env yedegini alir ->
#        YALNIZ SMTP_HOST/SMTP_PORT degistirir -> API gorevini yeniden baslatir.
# close: .env'i yedekten GERI YAZAR (sha esitligi ZORUNLU) -> API'yi yeniden baslatir ->
#        guvenlik duvari kurallarini kaldirir -> Web gorevini baslangic durumuna dondurur.
# status: salt okuma; hicbir sey degistirmez.
#
# TEKNIK SINIR (acikca): guvenlik duvari kurallari LOOPBACK trafigini KAPSAMAZ. Sunucuda acik
# bir yerel oturum tarayiciyla http://localhost:3002 uzerinden uygulamayi yine kullanabilir.
# Bu yuzden pencere, yerel oturumlarin uygulamayi KULLANMAYACAGI teyidiyle birlikte acilir.
#
# DEGISTIRILEN .env ANAHTARLARI — ACIK ALLOWLIST (baskasina DOKUNULMAZ):
#   SMTP_HOST, SMTP_PORT
# SMTP_USER/SMTP_PASS DEGISTIRILMEZ ve yakalayiciya GITMEZ:
#   olcum (2026-09-23, nodemailer): sunucu AUTH ilan etmezse istemci kimlik bilgisini HIC gondermez.
#   `inv-sink.js` AUTH ilan ETMEZ ve AUTH komutunu 503 ile reddeder.
# PORT 465 SECILEMEZ: urun `secure` degerini `SMTP_PORT === '465'` ile turetir (email-provider.service.ts:201).
# =============================================================================
$Rel      = 'C:\Development\HUKUK_YAZILIMI\HY_W4_RELEASE23\project\apps\api'
$EnvFile  = Join-Path $Rel '.env'
$ApiTask  = 'HukukPlatform-API'
$WebTask  = 'HukukPlatform-Web'
$SinkPort = 2527
$RuleTag  = 'HY-INVITE-WINDOW'

function Fail([string]$m) { Write-Host ('DUR - ' + $m) -ForegroundColor Red; throw ('INV-DUR: ' + $m) }
function Sha([string]$p) { (Get-FileHash -LiteralPath $p -Algorithm SHA256).Hash.ToUpperInvariant() }
# PS 5.1: `(Fn arg).Count` bos donebiliyor (olculdu) -> once degiskene al, sonra say.
function Listeners([int]$port) { $r = @(Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue); return $r }
function ListenerCount([int]$port) { $r = Listeners $port; if ($null -eq $r) { return 0 } return @($r).Count }
function TaskState([string]$n) { (Get-ScheduledTask -TaskName $n -ErrorAction SilentlyContinue) }

function Get-Status {
  $api = TaskState $ApiTask; $web = TaskState $WebTask
  # PS 5.1: hashtable literali icinde fonksiyon cagrisi argumanla parse edilmiyor -> ONCE degiskene al.
  $l8080 = ListenerCount 8080
  $l3002 = ListenerCount 3002
  $lsink = ListenerCount $SinkPort
  [ordered]@{
    apiTask   = if ($api) { $api.State.ToString() } else { 'YOK' }
    apiEnabled = if ($api) { $api.Settings.Enabled } else { $null }
    webTask   = if ($web) { $web.State.ToString() } else { 'YOK' }
    webEnabled = if ($web) { $web.Settings.Enabled } else { $null }
    listen8080 = $l8080
    listen3002 = $l3002
    listenSink = $lsink
    envSha    = Sha $EnvFile
    rules     = @(Get-NetFirewallRule -DisplayName ($RuleTag + '*') -ErrorAction SilentlyContinue).Count
    atUtc     = (Get-Date).ToUniversalTime().ToString('o')
  }
}

if ($Command -eq 'status') { Get-Status | ConvertTo-Json; exit 0 }
if (-not $RunStateFile) { Fail 'RunStateFile gerekli (repo DISI yol)' }
$admin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $admin) { Fail 'YONETICI gerekiyor (gorev + guvenlik duvari)' }

if ($Command -eq 'open') {
  if (Test-Path -LiteralPath $RunStateFile) { Fail 'durum dosyasi ZATEN var — ikinci acma REDDEDILDI (once close)' }
  if ((ListenerCount $SinkPort) -ne 1) { Fail ('yakalayici ' + $SinkPort + ' portunda dinlemiyor — once inv-sink.js baslatilir') }
  $sinkOwner = (Listeners $SinkPort)[0].OwningProcess
  $sinkRemote = @(Get-NetTCPConnection -OwningProcess $sinkOwner -ErrorAction SilentlyContinue |
    Where-Object { $_.State -ne 'Listen' -and $_.RemoteAddress -notin @('127.0.0.1', '::1', '0.0.0.0', '::') })
  if ($sinkRemote.Count -gt 0) { Fail 'yakalayicinin loopback DISI baglantisi var — DUR' }

  $state = Get-Status
  if (-not $CaptureDir) { $CaptureDir = Join-Path ([IO.Path]::GetDirectoryName($RunStateFile)) 'inv-capture' }
  if (-not (Test-Path -LiteralPath $CaptureDir)) { Fail ('yakalama dizini YOK: ' + $CaptureDir) }
  $state['captureDir'] = $CaptureDir
  $backup = $RunStateFile + '.env.bak'
  Copy-Item -LiteralPath $EnvFile -Destination $backup -Force
  $state['envBackup'] = $backup
  $state['envBackupSha'] = Sha $backup
  if ($state['envBackupSha'] -ne $state['envSha']) { Fail '.env yedegi kaynakla ESIT DEGIL' }

  # Web: baslangic durumu kayitli; durdur + devre disi birak.
  if (TaskState $WebTask) {
    Stop-ScheduledTask -TaskName $WebTask -ErrorAction SilentlyContinue
    Disable-ScheduledTask -TaskName $WebTask | Out-Null
    $deadline = (Get-Date).AddSeconds(30)
    while ((ListenerCount 3002) -gt 0 -and (Get-Date) -lt $deadline) { Start-Sleep -Milliseconds 500 }
    if ((ListenerCount 3002) -gt 0) {
      $webPid = (Listeners 3002)[0].OwningProcess
      Stop-Process -Id $webPid -Force -ErrorAction SilentlyContinue
      Start-Sleep -Seconds 2
    }
    if ((ListenerCount 3002) -gt 0) { Fail '3002 hala dinliyor — Web durdurulamadi' }
  }

  # Uzak erisim: kosuma ozel ENGEL kurallari (loopback KAPSAM DISI — teknik sinir).
  foreach ($p in 8080, 3002) {
    New-NetFirewallRule -DisplayName ("$RuleTag-$p") -Direction Inbound -Action Block -Protocol TCP -LocalPort $p -Profile Any | Out-Null
  }

  # .env: YALNIZ iki anahtar (acik allowlist).
  $lines = [IO.File]::ReadAllLines($EnvFile)
  $changed = 0
  for ($i = 0; $i -lt $lines.Count; $i++) {
    if ($lines[$i] -match '^\s*SMTP_HOST\s*=') { $lines[$i] = 'SMTP_HOST=127.0.0.1'; $changed++ }
    elseif ($lines[$i] -match '^\s*SMTP_PORT\s*=') { $lines[$i] = ('SMTP_PORT=' + $SinkPort); $changed++ }
  }
  if ($changed -ne 2) { Fail ('SMTP_HOST/SMTP_PORT satir sayisi beklenmedik: ' + $changed) }
  [IO.File]::WriteAllLines($EnvFile, $lines)
  $state['envWindowSha'] = Sha $EnvFile

  Restart-ScheduledTask -TaskName $ApiTask
  $deadline = (Get-Date).AddSeconds(60)
  while ((ListenerCount 8080) -ne 1 -and (Get-Date) -lt $deadline) { Start-Sleep -Milliseconds 500 }
  if ((ListenerCount 8080) -ne 1) { Fail 'API 8080 dinleyicisi geri gelmedi' }
  $state['afterOpen'] = Get-Status
  $state | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $RunStateFile -Encoding UTF8
  Write-Host 'PENCERE ACIK: Web DURDURULDU+DEVRE DISI · 8080/3002 uzak erisim ENGELLI · SMTP yakalayiciya yonlendirildi'
  Write-Host ('  taban .env sha : ' + $state['envSha'])
  Write-Host ('  pencere .env sha: ' + $state['envWindowSha'])
  exit 0
}

if ($Command -eq 'close') {
  if (-not (Test-Path -LiteralPath $RunStateFile)) { Fail 'durum dosyasi YOK — kapanis yapilamaz' }
  $state = Get-Content -Raw -LiteralPath $RunStateFile | ConvertFrom-Json

  # ---- SIRA 1: SENTETIK ERISIM KAPANISI + HEDEF DISI KONTROL (kosum sonucundan) ----
  # Kosum sonucu yoksa kapanis YINE yapilir (pencereyi acik birakmak daha risklidir) ama
  # "kosum kapanisi dogrulandi" DENMEZ; durum kaydinda acikca isaretlenir.
  $resultFile = $RunStateFile + '.result.json'
  $runClosure = $null
  if (Test-Path -LiteralPath $resultFile) {
    $res = Get-Content -Raw -LiteralPath $resultFile | ConvertFrom-Json
    $runClosure = [ordered]@{
      pass = $res.pass; fail = $res.fail; fatal = $res.fatal
      closureOk = $(if ($res.closure) { $res.closure.ok } else { $null })
      stillActive = $(if ($res.closure) { $res.closure.stillActive } else { $null })
      pendingLeft = $(if ($res.closure) { $res.closure.pendingLeft } else { $null })
      offTarget = $(if ($res.captureScan) { @($res.captureScan.offTarget).Count } else { $null })
      captureRemaining = $(if ($res.capturePurge) { $res.capturePurge.remaining } else { $null })
    }
    if ($runClosure.closureOk -ne $true) {
      Fail 'KOSUM KAPANISI DOGRULANMADI (closure.ok != true) — once inv-99-close.js makbuzla calistirilir; ERISIM ACILMAZ'
    }
    if ($runClosure.offTarget -gt 0) {
      Fail ('HEDEF DISI ALICI TESPIT EDILDI (' + $runClosure.offTarget + ') — owner bildirimi ZORUNLU; ERISIM ACILMAZ')
    }
    if ($runClosure.captureRemaining -gt 0) {
      Fail ('yakalama dosyasi KALDI (' + $runClosure.captureRemaining + ') — sir temizligi TAMAMLANMADI; ERISIM ACILMAZ')
    }
  } else {
    Write-Host 'UYARI: kosum sonucu dosyasi YOK — kosum kapanisi DOGRULANAMADI (kayda isaretlenir)' -ForegroundColor Yellow
  }

  # ---- SIRA 2: YAKALAYICI KAPANISI ----
  $capture = $state.captureDir
  if ((ListenerCount $SinkPort) -ne 0) { Fail ('yakalayici hala ' + $SinkPort + ' portunda dinliyor — once durdurun; ERISIM ACILMAZ') }
  if ($capture -and (Test-Path -LiteralPath $capture)) {
    $left = @(Get-ChildItem -LiteralPath $capture -File -ErrorAction SilentlyContinue).Count
    if ($left -gt 0) { Fail ('yakalama dizininde ' + $left + ' dosya KALDI — ERISIM ACILMAZ') }
  }

  # ---- SIRA 3: .env GERI YUKLEME + HASH ----
  $backup = $state.envBackup
  if (-not (Test-Path -LiteralPath $backup)) { Fail '.env yedegi YOK — kapanis DURDU (owner mudahalesi)' }
  Copy-Item -LiteralPath $backup -Destination $EnvFile -Force
  $restored = Sha $EnvFile
  if ($restored -ne $state.envSha) {
    Copy-Item -LiteralPath $backup -Destination $EnvFile -Force
    $restored = Sha $EnvFile
  }
  if ($restored -ne $state.envSha) { Fail ('.env GERI YAZILAMADI (sha ' + $restored + ' != ' + $state.envSha + ') — PENCERE ACIK KALIR') }

  # ---- SIRA 4: API/DB KIMLIGI ----
  Restart-ScheduledTask -TaskName $ApiTask
  $deadline = (Get-Date).AddSeconds(60)
  while ((ListenerCount 8080) -ne 1 -and (Get-Date) -lt $deadline) { Start-Sleep -Milliseconds 500 }
  if ((ListenerCount 8080) -ne 1) { Fail 'API 8080 dinleyicisi geri gelmedi — PENCERE ACIK KALIR' }
  $me = $null
  try { $me = Invoke-WebRequest -Uri 'http://127.0.0.1:8080/api/auth/me' -UseBasicParsing -TimeoutSec 15 } catch { $me = $_.Exception.Response }
  $meCode = $(if ($me -and $me.StatusCode) { [int]$me.StatusCode } else { $null })
  if ($meCode -ne 401) { Fail ('API kimligi dogrulanamadi (/auth/me ' + $meCode + ' ; 401 bekleniyor) — PENCERE ACIK KALIR') }
  $dbLine = @([IO.File]::ReadAllLines($EnvFile) | Where-Object { $_ -match '^\s*DATABASE_URL\s*=' })
  if ($dbLine.Count -ne 1 -or $dbLine[0] -notmatch 'hukuk_db') { Fail 'DB kimligi beklenmedik — PENCERE ACIK KALIR' }

  # ---- SIRA 5: YALNIZ BU KOSUMUN KURALLARI KALDIRILIR ----
  foreach ($r in @(Get-NetFirewallRule -DisplayName ($RuleTag + '*') -ErrorAction SilentlyContinue)) {
    Remove-NetFirewallRule -Name $r.Name
  }

  # ---- SIRA 6: WEB baslangic durumuna dondurulur ----
  if ($state.webEnabled -eq $true) { Enable-ScheduledTask -TaskName $WebTask | Out-Null }
  if ($state.webTask -eq 'Running') {
    Start-ScheduledTask -TaskName $WebTask
    $deadline = (Get-Date).AddSeconds(90)
    while ((ListenerCount 3002) -lt 1 -and (Get-Date) -lt $deadline) { Start-Sleep -Milliseconds 500 }
    if ((ListenerCount 3002) -lt 1) { Fail 'Web 3002 dinleyicisi geri gelmedi — KULLANICI ERISIMI ACILMAZ' }
  }
  $after = Get-Status
  $ok = ($after.envSha -eq $state.envSha) -and ($after.rules -eq 0) -and
        ($after.webTask -eq $state.webTask) -and ($after.webEnabled -eq $state.webEnabled) -and
        ($after.listen8080 -eq 1) -and ($after.listen3002 -eq $state.listen3002)
  [ordered]@{ record = 'INV-WINDOW-CLOSE'; before = $state; after = $after; restored = $ok; runClosure = $runClosure;
              runResultPresent = (Test-Path -LiteralPath $resultFile) } |
    ConvertTo-Json -Depth 6 | Set-Content -LiteralPath ($RunStateFile + '.close.json') -Encoding UTF8
  if (-not $ok) { Fail 'ORTAM GERI DONUSU DOGRULANMADI — kullanici erisimi ACILMAZ' }
  Remove-Item -LiteralPath $RunStateFile -Force
  Write-Host 'PENCERE KAPANDI: .env sha esit · kurallar kaldirildi · Web baslangic durumunda · API 8080 tek dinleyici'
  exit 0
}
