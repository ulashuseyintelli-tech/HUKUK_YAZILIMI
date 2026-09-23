param([ValidateSet('open', 'close', 'status')][string]$Command = 'status', [string]$RunStateFile, [string]$CaptureDir, [switch]$DecisionSelfTest)
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
$Sc       = $PSScriptRoot

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

# -----------------------------------------------------------------------------
# KARAR FONKSIYONU — kurtarma HER ZAMAN denenir; ERISIM yalnizca ZORUNLU DONUS
# kontrollerinin hepsi gecerse acilir. Kabul/izolasyon/hedef-disi FAIL'i kosum
# SONUCUNU basarisiz yapar ama kurtarma adimlarini ENGELLEMEZ.
# -----------------------------------------------------------------------------
function Get-ReturnDecision($g) {
  $mandatory = [ordered]@{
    accessClosed = [bool]$g.accessClosed   # sentetik erisim kapali (kosum ya da kurtarma ile)
    sinkStopped  = [bool]$g.sinkStopped    # yakalayici portu kapali
    captureEmpty = [bool]$g.captureEmpty   # yakalama dizininde dosya yok (sir temizligi)
    envRestored  = [bool]$g.envRestored    # .env sha TABANA esit
    apiOk        = [bool]$g.apiOk          # API 8080 tek dinleyici + /auth/me 401
    dbOk         = [bool]$g.dbOk           # DB kimligi hukuk_db
  }
  $blockers = @($mandatory.GetEnumerator() | Where-Object { -not $_.Value } | ForEach-Object { $_.Key })
  [ordered]@{
    mandatory      = $mandatory
    openAccess     = ($blockers.Count -eq 0)
    blockers       = $blockers
    acceptanceOk   = [bool]$g.acceptanceOk   # SONUC hukmu; erisim kapisi DEGIL
    offTargetCount = [int]$g.offTargetCount  # TESPIT; erisim kapisi DEGIL (raporlanir)
  }
}

if ($DecisionSelfTest) {
  # Canliya DOKUNMAZ: yalnizca karar mantigi olculur.
  $cases = @(
    @{ ad = 'hepsi iyi'; g = @{ accessClosed = $true; sinkStopped = $true; captureEmpty = $true; envRestored = $true; apiOk = $true; dbOk = $true; acceptanceOk = $true; offTargetCount = 0 }; beklenenAcik = $true },
    @{ ad = 'KABUL FAIL ama donus iyi'; g = @{ accessClosed = $true; sinkStopped = $true; captureEmpty = $true; envRestored = $true; apiOk = $true; dbOk = $true; acceptanceOk = $false; offTargetCount = 0 }; beklenenAcik = $true },
    @{ ad = 'HEDEF DISI tespit ama donus iyi'; g = @{ accessClosed = $true; sinkStopped = $true; captureEmpty = $true; envRestored = $true; apiOk = $true; dbOk = $true; acceptanceOk = $false; offTargetCount = 2 }; beklenenAcik = $true },
    @{ ad = '.env geri YAZILAMADI'; g = @{ accessClosed = $true; sinkStopped = $true; captureEmpty = $true; envRestored = $false; apiOk = $true; dbOk = $true; acceptanceOk = $true; offTargetCount = 0 }; beklenenAcik = $false },
    @{ ad = 'sentetik erisim ACIK'; g = @{ accessClosed = $false; sinkStopped = $true; captureEmpty = $true; envRestored = $true; apiOk = $true; dbOk = $true; acceptanceOk = $true; offTargetCount = 0 }; beklenenAcik = $false },
    @{ ad = 'yakalayici hala AYAKTA'; g = @{ accessClosed = $true; sinkStopped = $false; captureEmpty = $true; envRestored = $true; apiOk = $true; dbOk = $true; acceptanceOk = $true; offTargetCount = 0 }; beklenenAcik = $false },
    @{ ad = 'yakalama dosyasi KALDI'; g = @{ accessClosed = $true; sinkStopped = $true; captureEmpty = $false; envRestored = $true; apiOk = $true; dbOk = $true; acceptanceOk = $true; offTargetCount = 0 }; beklenenAcik = $false },
    @{ ad = 'API dogrulanamadi'; g = @{ accessClosed = $true; sinkStopped = $true; captureEmpty = $true; envRestored = $true; apiOk = $false; dbOk = $true; acceptanceOk = $true; offTargetCount = 0 }; beklenenAcik = $false },
    @{ ad = 'DB kimligi beklenmedik'; g = @{ accessClosed = $true; sinkStopped = $true; captureEmpty = $true; envRestored = $true; apiOk = $true; dbOk = $false; acceptanceOk = $true; offTargetCount = 0 }; beklenenAcik = $false }
  )
  $bad = 0
  foreach ($c in $cases) {
    $d = Get-ReturnDecision $c.g
    $ok = ($d.openAccess -eq $c.beklenenAcik)
    if (-not $ok) { $bad++ }
    Write-Host (($(if ($ok) { 'OK   ' } else { 'FAIL ' })) + $c.ad + ' -> erisimAcilir=' + $d.openAccess + ' engel=' + ($d.blockers -join ','))
  }
  Write-Host ('KARAR MANTIGI: ' + ($cases.Count - $bad) + '/' + $cases.Count)
  if ($bad -gt 0) { exit 1 }
  exit 0
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
  $resultFile  = $RunStateFile + '.result.json'
  $receiptFile = $RunStateFile + '.receipt.json'
  $capture = $state.captureDir
  $notes = @()

  # ---- KOSUM SONUCU (kapi DEGIL; karar girdisi) ----
  $runClosure = $null
  $acceptanceOk = $false
  $offTarget = 0
  $closureOk = $false
  if (Test-Path -LiteralPath $resultFile) {
    $res = Get-Content -Raw -LiteralPath $resultFile | ConvertFrom-Json
    $closureOk = ($res.closure -and $res.closure.ok -eq $true)
    $acceptanceOk = (($res.fail -eq 0) -and (-not $res.fatal))
    if ($res.captureScan) { $offTarget = @($res.captureScan.offTarget).Count }
    $runClosure = [ordered]@{ pass = $res.pass; fail = $res.fail; fatal = $res.fatal; closureOk = $closureOk
                              offTarget = $offTarget
                              captureRemaining = $(if ($res.capturePurge) { $res.capturePurge.remaining } else { $null }) }
  } else {
    $notes += 'kosum sonucu dosyasi YOK — kabul hukmu ve kosum kapanisi DOGRULANAMADI'
  }
  if (-not $acceptanceOk) { $notes += 'KABUL PASS DEGIL (sonuc hukmu) — kurtarma adimlari YINE de yurutulur' }
  if ($offTarget -gt 0) { $notes += ('HEDEF DISI ALICI TESPIT EDILDI: ' + $offTarget + ' — owner bildirimi ZORUNLU (tespit, onleme degil)') }

  # ---- KURTARMA 1: SENTETIK ERISIM KAPATMA (makbuza bagli; HATA HALINDE DE) ----
  $recovery = $null
  if (-not $closureOk) {
    if (Test-Path -LiteralPath $receiptFile) {
      $node = $null
      try { $node = (Get-Command node -CommandType Application -ErrorAction Stop | Select-Object -First 1).Source } catch { $node = $null }
      if ($node) {
        $dbLineNow = @([IO.File]::ReadAllLines($EnvFile) | Where-Object { $_ -match '^\s*DATABASE_URL\s*=' })
        if ($dbLineNow.Count -eq 1) {
          $env:INV_ENVIRONMENT  = 'live'
          $env:INV_CONFIRM_LIVE = 'YES-LIVE-OFFICE-INVITE-ACCEPTANCE'
          $env:INV_DATABASE_URL = ($dbLineNow[0] -replace '^\s*DATABASE_URL\s*=\s*', '').Trim().Trim('"').Trim("'")
          $env:INV_API_BASE_URL = 'http://127.0.0.1:8080/api'
          $env:INV_PRISMA_ROOT  = (Join-Path $Rel 'node_modules\@prisma\client')
          $env:INV_BCRYPT_PATH  = (Join-Path $Rel 'node_modules\bcrypt')
          $env:INV_SINK_DIR     = $capture
          $env:INV_RECEIPT_FILE = $receiptFile
          $env:INV_RESULT_FILE  = $RunStateFile + '.recover.json'
          $prevEap = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
          $global:LASTEXITCODE = -999
          & $node (Join-Path $Sc 'inv-99-close.js') *> ($RunStateFile + '.recover.log')
          $rrc = $LASTEXITCODE
          $ErrorActionPreference = $prevEap
          Remove-Item Env:INV_DATABASE_URL -ErrorAction SilentlyContinue
          $recovery = [ordered]@{ ran = $true; exitCode = $rrc; note = 'makbuza bagli kapatma' }
          if ($rrc -eq 0) { $closureOk = $true } else { $notes += ('kurtarma kapatmasi cikis ' + $rrc) }
        } else { $recovery = [ordered]@{ ran = $false; reason = 'DATABASE_URL satiri okunamadi' } }
      } else { $recovery = [ordered]@{ ran = $false; reason = 'node bulunamadi' } }
    } else { $recovery = [ordered]@{ ran = $false; reason = 'makbuz dosyasi YOK — kapatma YETKISIZ' } }
  } else {
    $recovery = [ordered]@{ ran = $false; reason = 'kosum kapanisi zaten dogrulandi' }
  }

  # ---- KURTARMA 2: YAKALAYICI DURDURMA ----
  $sinkPids = @(Listeners $SinkPort | ForEach-Object { $_.OwningProcess } | Sort-Object -Unique)
  foreach ($sp in $sinkPids) { Stop-Process -Id $sp -Force -ErrorAction SilentlyContinue }
  Start-Sleep -Milliseconds 700
  $sinkStopped = ((ListenerCount $SinkPort) -eq 0)
  if (-not $sinkStopped) { $notes += 'yakalayici DURDURULAMADI' }

  # ---- KURTARMA 3: YAKALAMA TEMIZLIGI (sir) ----
  $captureEmpty = $true
  if ($capture -and (Test-Path -LiteralPath $capture)) {
    foreach ($f in @(Get-ChildItem -LiteralPath $capture -File -ErrorAction SilentlyContinue)) {
      Remove-Item -LiteralPath $f.FullName -Force -ErrorAction SilentlyContinue
    }
    $left = @(Get-ChildItem -LiteralPath $capture -File -ErrorAction SilentlyContinue).Count
    $captureEmpty = ($left -eq 0)
    if (-not $captureEmpty) { $notes += ('yakalama dizininde ' + $left + ' dosya KALDI') }
  }

  # ---- KURTARMA 4: .env GERI YUKLEME + SHA ----
  $envRestored = $false
  $backup = $state.envBackup
  if ($backup -and (Test-Path -LiteralPath $backup)) {
    Copy-Item -LiteralPath $backup -Destination $EnvFile -Force
    if ((Sha $EnvFile) -ne $state.envSha) { Copy-Item -LiteralPath $backup -Destination $EnvFile -Force }
    $envRestored = ((Sha $EnvFile) -eq $state.envSha)
    if (-not $envRestored) { $notes += '.env GERI YAZILAMADI (sha esit degil)' }
  } else { $notes += '.env yedegi YOK — geri yukleme YAPILAMADI' }

  # ---- KURTARMA 5: API YENIDEN BASLATMA + KIMLIK ----
  Restart-ScheduledTask -TaskName $ApiTask -ErrorAction SilentlyContinue
  $deadline = (Get-Date).AddSeconds(60)
  while ((ListenerCount 8080) -ne 1 -and (Get-Date) -lt $deadline) { Start-Sleep -Milliseconds 500 }
  $meCode = $null
  try {
    $r = Invoke-WebRequest -Uri 'http://127.0.0.1:8080/api/auth/me' -UseBasicParsing -TimeoutSec 15
    $meCode = [int]$r.StatusCode
  } catch {
    if ($_.Exception.Response) { $meCode = [int]$_.Exception.Response.StatusCode }
  }
  $apiOk = (((ListenerCount 8080) -eq 1) -and ($meCode -eq 401))
  if (-not $apiOk) { $notes += ('API kimligi dogrulanamadi (/auth/me ' + $meCode + ')') }
  $dbLine = @([IO.File]::ReadAllLines($EnvFile) | Where-Object { $_ -match '^\s*DATABASE_URL\s*=' })
  $dbOk = (($dbLine.Count -eq 1) -and ($dbLine[0] -match 'hukuk_db'))
  if (-not $dbOk) { $notes += 'DB kimligi beklenmedik' }

  # ---- KARAR: ERISIM ACILIR MI ----
  $decision = Get-ReturnDecision @{
    accessClosed = $closureOk; sinkStopped = $sinkStopped; captureEmpty = $captureEmpty
    envRestored = $envRestored; apiOk = $apiOk; dbOk = $dbOk
    acceptanceOk = $acceptanceOk; offTargetCount = $offTarget
  }

  if ($decision.openAccess) {
    foreach ($r in @(Get-NetFirewallRule -DisplayName ($RuleTag + '*') -ErrorAction SilentlyContinue)) { Remove-NetFirewallRule -Name $r.Name }
    if ($state.webEnabled -eq $true) { Enable-ScheduledTask -TaskName $WebTask | Out-Null }
    if ($state.webTask -eq 'Running') {
      Start-ScheduledTask -TaskName $WebTask
      $deadline = (Get-Date).AddSeconds(90)
      while ((ListenerCount 3002) -lt 1 -and (Get-Date) -lt $deadline) { Start-Sleep -Milliseconds 500 }
      if ((ListenerCount 3002) -lt 1) { $notes += 'Web 3002 dinleyicisi geri gelmedi' }
    }
  } else {
    $notes += ('ERISIM ACILMADI — engeller: ' + ($decision.blockers -join ', '))
  }

  $after = Get-Status
  $webRestored = (($after.webTask -eq $state.webTask) -and ($after.webEnabled -eq $state.webEnabled) -and ($after.rules -eq 0))
  $out = [ordered]@{
    record = 'INV-WINDOW-CLOSE'; before = $state; after = $after
    runClosure = $runClosure; runResultPresent = (Test-Path -LiteralPath $resultFile)
    recovery = $recovery; decision = $decision; webRestored = $webRestored; notes = $notes
    restored = ($decision.openAccess -and $webRestored)
  }
  $out | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath ($RunStateFile + '.close.json') -Encoding UTF8
  foreach ($n in $notes) { Write-Host ('NOT: ' + $n) -ForegroundColor Yellow }
  if (-not $decision.openAccess) {
    Write-Host 'PENCERE ACIK KALDI — zorunlu donus kontrolleri gecmedi; kullanici erisimi ACILMADI' -ForegroundColor Red
    exit 3
  }
  if (-not $webRestored) {
    Write-Host 'UYARI: Web baslangic durumuna TAM donmedi — kayit dosyasina bakin' -ForegroundColor Yellow
    exit 3
  }
  Remove-Item -LiteralPath $RunStateFile -Force
  Write-Host 'PENCERE KAPANDI: sentetik erisim kapali · yakalayici durduruldu · yakalama bos · .env sha esit · API 401 · kurallar 0 · Web baslangic durumunda'
  if (-not $acceptanceOk) { Write-Host 'HATIRLATMA: KABUL PASS DEGIL — sonuc dosyasini CLIENT oturumuna bildirin' -ForegroundColor Yellow }
  exit 0
}
