& {
  # T-PENCERE-AC — Yontem T penceresini ACAR: kullanici gonderimlerini ONLER, SMTP hedefini
  # yerel yakalayiciya cevirir, API yi yeniden baslatir. KABUL KOSUMUNU BASLATMAZ.
  # T_MODE = 'live' (canli) | 'prova' (oturuma ozel DB/Redis ile prova). Varsayilan 'live'.
  $ErrorActionPreference = 'Stop'
  $selfMark = 'T-PENCERE-AC'
  $Mode = if ($env:T_MODE) { $env:T_MODE } else { 'live' }
  if ($Mode -notin @('live', 'prova')) { throw "T_MODE gecersiz ('$Mode') - yalniz live|prova" }

  $GoRef     = if ($env:T_GOREF) { $env:T_GOREF } else { '<OWNER-GO-CLIENT-I11-YYYYMMDD-Rnn>' }
  $SinkPort  = 2526
  $BudgetSec = 180                       # HER restart icin ust sinir; gecmis sure GARANTI DEGILDIR
  $S         = 'C:\Users\ulastelli\AppData\Local\Temp\claude\C--Development-HUKUK-YAZILIMI-project\894280b1-443c-4406-86cd-b9e22aad3f7b\scratchpad'
  $SinkLog   = Join-Path $S 'i11s\runs\smtp-sink.jsonl'
  $BAK       = Join-Path $S 'i11live\ENV-PREIMAGE.env'

  if ($Mode -eq 'live') {
    $REL  = 'C:\Development\HUKUK_YAZILIMI\HY_W4_RELEASE23'   # RELEASE23 (aday 2740df3d) canli kok
    $ENVF = Join-Path $REL 'project\apps\api\.env'
    $Port = 8080
  } else {
    $REL  = 'C:\Development\HUKUK_YAZILIMI\HY_W4_RELEASE23'
    $ENVF = Join-Path $S 'i11s\twork\.env'
    $Port = 8101
    $BAK  = Join-Path $S 'i11s\twork\ENV-PREIMAGE.env'
  }

  if ($Mode -eq 'live' -and $GoRef -cnotmatch '^OWNER-GO-CLIENT-I11-[0-9]{8}-R[0-9]{2}$') { throw "T-GO: ref bicimi gecersiz ('$GoRef')" }
  Write-Output "T-MOD: $Mode · env=$ENVF · port=$Port · yakalayici=127.0.0.1:$SinkPort"

  # ---- K-T0: on goruntu yedegi - GERI DONUSUN TEK GIRDISI ----
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $BAK) | Out-Null
  if (Test-Path -LiteralPath $BAK) { throw "K-T0: '$BAK' zaten var - onceki pencere kapanmamis; once geri donusu dogrula" }
  $preHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $ENVF).Hash
  Copy-Item -LiteralPath $ENVF -Destination $BAK
  if ((Get-FileHash -Algorithm SHA256 -LiteralPath $BAK).Hash -ne $preHash) { throw 'K-T0: yedek hash degeri kaynakla esit DEGIL' }
  Write-Output "K-T0: env on goruntu sha256 = $preHash"

  # ---- K-T1: yakalayici YALNIZ loopback ----
  $l = @(Get-NetTCPConnection -LocalPort $SinkPort -State Listen)
  if ($l.Count -ne 1) { throw "K-T1: :$SinkPort dinleyici sayisi $($l.Count) (1 olmali)" }
  if ($l[0].LocalAddress -ne '127.0.0.1') { throw "K-T1: yakalayici loopback DISINDA ($($l[0].LocalAddress))" }
  $sinkPid = [int]$l[0].OwningProcess
  Write-Output "K-T1: yakalayici PID $sinkPid - yalniz 127.0.0.1:$SinkPort"

  # ---- K-T2: yakalayici AUTH ILAN ETMIYOR (canli SMTP parolasi HIC gonderilmesin) ----
  $cli = New-Object Net.Sockets.TcpClient
  $cli.Connect('127.0.0.1', $SinkPort)
  $stm = $cli.GetStream(); $rd = New-Object IO.StreamReader($stm); $wr = New-Object IO.StreamWriter($stm)
  $wr.NewLine = "`r`n"; $wr.AutoFlush = $true
  $banner = $rd.ReadLine(); $wr.WriteLine('EHLO kapi-olcumu')
  $ehlo = @()
  for ($i = 0; $i -lt 10; $i++) { $ln = $rd.ReadLine(); if ($null -eq $ln) { break }; $ehlo += $ln; if ($ln -match '^\d{3} ') { break } }
  $wr.WriteLine('QUIT'); $cli.Close()
  Write-Output "K-T2: banner = $banner"
  foreach ($ln in $ehlo) { Write-Output "K-T2: ehlo> $ln" }
  if ($ehlo.Count -eq 0) { throw 'K-T2: EHLO yaniti alinamadi - KOR' }
  # SMTP YETENEK satiri: '250-AUTH ...' ya da '250 AUTH ...'. Sunucu ADINDA gecen 'auth'
  # (or. 'i11-sink-noauth') YETENEK DEGILDIR - desen yetenek satirina baglanir.
  if (@($ehlo | Where-Object { $_ -cmatch '^\d{3}[- ]AUTH\b' }).Count -ne 0) { throw 'K-T2: yakalayici AUTH ILAN EDIYOR - parola gonderilir; AUTH ilan etmeyen surum kullanilmali' }
  Write-Output 'K-T2: AUTH ilan edilmiyor (parola HIC gonderilmez)'

  # ---- K-T3: yakalayicinin DIS baglantisi YOK ----
  $sinkRemote = @(Get-NetTCPConnection -OwningProcess $sinkPid -ErrorAction SilentlyContinue |
    Where-Object { $_.State -ne 'Listen' -and $_.RemoteAddress -notin @('127.0.0.1', '::1', '0.0.0.0', '::') })
  if ($sinkRemote.Count -ne 0) { throw "K-T3: yakalayicinin loopback disi baglantisi var ($($sinkRemote.Count))" }
  Write-Output 'K-T3: yakalayicinin loopback disi baglantisi YOK'

  # ---- K-T4: API tek dinleyici + beklenen dist ----
  $apiPids = @(Get-NetTCPConnection -LocalPort $Port -State Listen | Select-Object -ExpandProperty OwningProcess -Unique)
  if ($apiPids.Count -ne 1) { throw "K-T4: :$Port dinleyici surec sayisi $($apiPids.Count) (1 olmali)" }
  $oldPid = [int]$apiPids[0]
  # Ayrac normalize edilir: canli komut satiri '\', baslatici ile kurulan surec '/' kullanir.
  $apiCl = ((Get-CimInstance Win32_Process -Filter "ProcessId=$oldPid").CommandLine -replace '/', '\')
  if ($apiCl -notlike '*dist\apps\api\src\main.js*') { throw "K-T4: :$Port komut satiri dist DEGIL" }
  Write-Output "K-T4: :$Port PID $oldPid - dist komut satiri dogrulandi"

  # ---- K-T5: sakin pencere (yalniz canli): aylik ekstre cron ayin 1i 03:00 Europe/Istanbul ----
  if ($Mode -eq 'live') {
    $now = Get-Date
    if ($now.Day -eq 1 -and $now.Hour -ge 2 -and $now.Hour -le 4) { throw 'K-T5: aylik ekstre penceresi (ayin 1i 02:00-05:00) - baska zaman secin' }
    Write-Output "K-T5: sakin pencere ($($now.ToString('yyyy-MM-dd HH:mm')))"
  }

  # ---- K-T6: KULLANICI GONDERIMLERINI ONLE (sayim DEGIL, ONLEME) ----
  if ($Mode -eq 'live') {
    Stop-ScheduledTask -TaskName 'HukukPlatform-Web'
    Start-Sleep -Seconds 3
    $webPids = @(Get-NetTCPConnection -LocalPort 3002 -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique)
    foreach ($wp in $webPids) { Get-Process -Id ([int]$wp) -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue }
    Start-Sleep -Seconds 2
    $webStill = @(Get-NetTCPConnection -LocalPort 3002 -State Listen -ErrorAction SilentlyContinue)
    if ($webStill.Count -ne 0) { throw 'K-T6: Web hala dinliyor - kullanici yuzeyi kapanmadi' }
    foreach ($pn in 8080, 3002) {
      New-NetFirewallRule -DisplayName "I11-WINDOW-BLOCK-$pn" -Direction Inbound -Action Block `
        -Protocol TCP -LocalPort $pn -Enabled True -Profile Any | Out-Null
    }
    $fw = @(Get-NetFirewallRule -DisplayName 'I11-WINDOW-BLOCK-*' -ErrorAction SilentlyContinue)
    if ($fw.Count -ne 2) { throw "K-T6: engelleme kurali sayisi $($fw.Count) (2 olmali)" }
    Write-Output 'K-T6: ONLEME ETKIN - Web durduruldu + :8080/:3002 gelen baglanti ENGELLENDI (loopback etkilenmez)'
  } else {
    Write-Output 'K-T6: prova modu - onleme uygulanmaz (kullanici yuzeyi zaten yok)'
  }

  # ---- DEGISIM: TAM IKI SATIR ----
  $lines = Get-Content -LiteralPath $ENVF
  $hostHit = @($lines | Where-Object { $_ -match '^\s*SMTP_HOST\s*=' }).Count
  $portHit = @($lines | Where-Object { $_ -match '^\s*SMTP_PORT\s*=' }).Count
  if ($hostHit -ne 1 -or $portHit -ne 1) { throw "K-T7: SMTP_HOST=$hostHit SMTP_PORT=$portHit (her biri 1 olmali)" }
  $new = $lines | ForEach-Object {
    if ($_ -match '^\s*SMTP_HOST\s*=') { 'SMTP_HOST=127.0.0.1' }
    elseif ($_ -match '^\s*SMTP_PORT\s*=') { "SMTP_PORT=$SinkPort" }
    else { $_ }
  }
  Set-Content -LiteralPath $ENVF -Value $new -Encoding UTF8
  $diff = @(Compare-Object (Get-Content -LiteralPath $BAK) (Get-Content -LiteralPath $ENVF) | Where-Object { $_.SideIndicator -ne '==' })
  if ($diff.Count -ne 4) { throw "K-T8: beklenen fark 4 satir, olculen $($diff.Count) - GERI DON" }
  Write-Output 'K-T8: env farki TAM IKI ANAHTAR (SMTP_HOST, SMTP_PORT)'

  # ---- RESTART (butce ile) ----
  $sw = [Diagnostics.Stopwatch]::StartNew()
  if ($Mode -eq 'live') {
    Stop-ScheduledTask -TaskName 'HukukPlatform-API'
    Start-Sleep -Seconds 2
    Get-Process -Id $oldPid -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
    Start-ScheduledTask -TaskName 'HukukPlatform-API'
  } else {
    Get-Process -Id $oldPid -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 3
    # ATESLE-UNUT + DONGUYLE DOGRULA — canli yoldaki `Start-ScheduledTask` ile AYNI SINIF.
    # Beklemeli bicimler (`& node ... > dosya`, `Start-Process -Wait`) ayrilmis torun surec
    # (API) yasadigi surece cagriyi ASKIDA birakiyordu (olculdu). Ayaga kalkma kanitini
    # asagidaki butceli dongu verir.
    Start-Process -FilePath 'node' -ArgumentList (Join-Path $S 'i9s\start-api-r22s.js') `
      -WindowStyle Hidden `
      -RedirectStandardOutput (Join-Path $S 'i11s\twork\restart-launcher.out') `
      -RedirectStandardError (Join-Path $S 'i11s\twork\restart-launcher.err') | Out-Null
  }
  $newPid = 0
  $tick = 0
  while ($sw.Elapsed.TotalSeconds -lt $BudgetSec) {
    $tick++
    $p = @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique)
    Write-Output "  [bekleme $tick] $([int]$sw.Elapsed.TotalSeconds) sn · :$Port dinleyici=$(if ($p.Count) { $p -join ',' } else { 'YOK' })"
    if ($p.Count -eq 1 -and [int]$p[0] -ne $oldPid) { $newPid = [int]$p[0]; break }
    Start-Sleep -Seconds 3
  }
  $sw.Stop()
  if ($newPid -eq 0) { throw "K-T9: API $BudgetSec sn icinde ayaga KALKMADI ($([int]$sw.Elapsed.TotalSeconds) sn) - DERHAL T-PENCERE-KAPA calistir; otomatik tekrar YOK" }
  Write-Output "K-T9: API yeniden basladi - $oldPid -> $newPid - kesinti $([int]$sw.Elapsed.TotalSeconds) sn (butce $BudgetSec)"

  # ---- K-T10a: YAPISAL dogrulama (TEK BASINA HEDEF KANITI DEGILDIR) ----
  $proc = Get-Process -Id $newPid
  $envWrite = (Get-Item -LiteralPath $ENVF).LastWriteTime
  if ($proc.StartTime -le $envWrite) { throw "K-T10a: API baslangici ($($proc.StartTime)) env yazimindan SONRA DEGIL" }
  $ext = @(Get-NetTCPConnection -OwningProcess $newPid -ErrorAction SilentlyContinue | Where-Object { $_.RemotePort -eq 465 })
  if ($ext.Count -ne 0) { throw "K-T10a: API nin :465 baglantisi var ($($ext.Count))" }
  Write-Output "K-T10a: baslangic env yazimindan SONRA · :465 baglantisi 0  (YAPISAL - pozitif kanit DEGIL)"

  # ---- K-T10b icin TABAN: pozitif kanit kosumun ILK gonderiminde olculur ----
  $sinkBase = if (Test-Path -LiteralPath $SinkLog) { @(Get-Content -LiteralPath $SinkLog).Count } else { 0 }
  Set-Content -LiteralPath (Join-Path (Split-Path -Parent $BAK) 'SINK-BASELINE.txt') -Value $sinkBase
  Write-Output "K-T10b TABAN: yakalayici kayit satiri = $sinkBase (pozitif kanit: kosumun ilk gonderimi bu sayiyi ARTIRMALI)"
  Write-Output ''
  Write-Output 'PENCERE ACIK. Sirada: I11 §9 blogu (gonderim kapsami ACIK) TEK KEZ; ardindan T-PENCERE-KAPA.'
  Write-Output "Geri donus girdisi: $BAK (sha $preHash) - kosum/state dosyasina BAGLI DEGIL."
}
