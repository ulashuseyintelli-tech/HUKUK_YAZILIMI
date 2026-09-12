& {
  # T-PENCERE-AC - Yontem T penceresini ACAR: kullanici gonderimlerini ONLER, SMTP hedefini
  # yerel yakalayiciya cevirir, API yi yeniden baslatir. KABUL KOSUMUNU BASLATMAZ.
  # T_MODE        = 'live' (canli) | 'prova' (oturuma ozel DB/Redis ile prova). Varsayilan 'live'.
  # T_ENV_PRE_SHA = ZORUNLU. Pencere acilmadan ONCE env dosyasinin beklenen sha256'si (canlida C33
  #                 cutover kaydindaki RELEASE23 .env sha'si). Eslesmezse HICBIR degisiklik yapilmaz;
  #                 T-PENCERE-KAPA ayni degeri ister ve yedegi YALNIZ bu degere esitse geri yazar.
  # Bu dosya BILINCLI olarak yalniz ASCII'dir: Windows PowerShell 5.1 BOM'suz betigi ANSI okur.
  $ErrorActionPreference = 'Stop'
  $selfMark = 'T-PENCERE-AC'
  $Mode = if ($env:T_MODE) { $env:T_MODE } else { 'live' }
  if ($Mode -notin @('live', 'prova')) { throw "T_MODE gecersiz ('$Mode') - yalniz live|prova" }

  $GoRef     = if ($env:T_GOREF) { $env:T_GOREF } else { '<OWNER-GO-CLIENT-I11-YYYYMMDD-Rnn>' }
  $PinSha    = if ($env:T_ENV_PRE_SHA) { $env:T_ENV_PRE_SHA.Trim().ToUpperInvariant() } else { '' }
  $SinkPort  = 2526
  $BudgetSec = 180                       # HER restart icin ust sinir; gecmis sure GARANTI DEGILDIR
  $S         = 'C:\Users\ulastelli\AppData\Local\Temp\claude\C--Development-HUKUK-YAZILIMI-project\894280b1-443c-4406-86cd-b9e22aad3f7b\scratchpad'
  $SinkLog   = Join-Path $S 'i11s\runs\smtp-sink.jsonl'

  if ($Mode -eq 'live') {
    $REL    = 'C:\Development\HUKUK_YAZILIMI\HY_W4_RELEASE23'   # RELEASE23 (aday 2740df3d) canli kok
    $ENVF   = Join-Path $REL 'project\apps\api\.env'
    $Port   = 8080
    $BakDir = Join-Path $S 'i11live'
  } else {
    $REL    = 'C:\Development\HUKUK_YAZILIMI\HY_W4_RELEASE23'
    $ENVF   = Join-Path $S 'i11s\twork\.env'
    $Port   = 8101
    $BakDir = Join-Path $S 'i11s\twork\preimage'
  }
  $BAK      = Join-Path $BakDir 'ENV-PREIMAGE.env'
  $SddlFile = Join-Path $BakDir 'ENV-SDDL-BASELINE.txt'
  $BaseFile = Join-Path $BakDir 'SINK-BASELINE.txt'

  if ($Mode -eq 'live' -and $GoRef -cnotmatch '^OWNER-GO-CLIENT-I11-[0-9]{8}-R[0-9]{2}$') { throw "T-GO: ref bicimi gecersiz ('$GoRef')" }
  if ($PinSha -notmatch '^[0-9A-F]{64}$') { throw 'T-PIN: T_ENV_PRE_SHA zorunlu (64 hex; beklenen env sha256) - HICBIR degisiklik yapilmadi' }
  Write-Output "T-MOD: $Mode | env=$ENVF | port=$Port | yakalayici=127.0.0.1:$SinkPort | yedek dizini=$BakDir"

  # ---- K-ELEV (yalniz canli, ILK kapi): yukseltilmis Administrators olmadan HICBIR islem yapilmaz ----
  # Olculdu: canli .env sahibi SYSTEM, DACL korumali, kullaniciya yalniz Read; firewall ve SYSTEM
  # gorev/surec islemleri de yukseltme ister. Bu kapi yedek dahil HERHANGI bir yazmadan ONCE durur.
  if ($Mode -eq 'live') {
    $wp = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
    if (-not $wp.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
      throw 'K-ELEV: oturum YUKSELTILMIS Administrators DEGIL - canli .env/firewall/gorev islemleri yapilamaz; HICBIR degisiklik yapilmadi. Yukseltilmis kabukta yeniden calistirin.'
    }
    Write-Output 'K-ELEV: yukseltilmis Administrators oturumu'
  }

  # GUVENILIR KIMLIKLER: pencere dosyalarinin sahibi ve DACL'inda YALNIZ bunlar olabilir.
  # Olculdu: karalama zinciri 6 yabanci SID'e kalitsal Modify (2'sine DeleteSubdirectoriesAndFiles) veriyor.
  $me = [Security.Principal.WindowsIdentity]::GetCurrent().Name
  $Trusted = @('NT AUTHORITY\SYSTEM', 'BUILTIN\Administrators', $me)
  function Get-TrustProblem([string]$path, [bool]$mustProtect) {
    $item = Get-Item -LiteralPath $path -Force
    $a = Get-Acl -LiteralPath $path
    $bad = @()
    if ((([int]$item.Attributes) -band 0x400) -ne 0) { $bad += 'reparse noktasi (baglanti/junction)' }
    if ($Trusted -notcontains $a.Owner) { $bad += "sahip=$($a.Owner)" }
    if ($mustProtect -and -not $a.AreAccessRulesProtected) { $bad += 'DACL korumasiz' }
    $foreign = @($a.Access | Where-Object { $Trusted -notcontains $_.IdentityReference.Value })
    if ($foreign.Count -ne 0) { $bad += "yabanci kural $($foreign.Count)" }
    return ($bad -join '; ')
  }
  # Zaten guvenilirse YAZMA YOK (idempotent). Degilse icacls: Set-Acl, DACL'i zaten korumali bir hedefe
  # (or. onceki pencerede korunmus yakalayici kaydi) 5.1 ve 7'de SeSecurityPrivilege ister ve DUSER (olculdu).
  # icacls yabanci ACIK kurali silmez; cagiran Get-TrustProblem ile denetler ve DURUR (fail-closed).
  function Set-TrustedAcl([string]$path, [bool]$isDir) {
    if (-not (Get-TrustProblem $path $true)) { return }
    $inh = if ($isDir) { '(OI)(CI)' } else { '' }
    $meSid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
    $icOut = & icacls.exe $path /inheritance:r /grant:r "*S-1-5-18:${inh}F" "*S-1-5-32-544:${inh}F" "*${meSid}:${inh}F" 2>&1
    if ($LASTEXITCODE -ne 0) { throw "icacls basarisiz (cikis $LASTEXITCODE): $($icOut -join ' ')" }
  }

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

  # ---- K-T0a (salt okuma): env KIMLIGI pinli degere esit + yedek dizini YOK + yakalayici kaydi VAR ----
  $preHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $ENVF).Hash
  if ($preHash -ne $PinSha) { throw "K-T0a: env sha256 ($preHash) T_ENV_PRE_SHA ($PinSha) ile ESIT DEGIL - HICBIR degisiklik yapilmadi" }
  if (Test-Path -LiteralPath $BakDir) { throw "K-T0a: '$BakDir' zaten var - onceki pencere kapanmamis ya da dizin onceden yerlestirilmis; HICBIR degisiklik yapilmadi" }
  if (-not (Test-Path -LiteralPath $SinkLog)) { throw "K-T0a: yakalayici kaydi YOK ($SinkLog) - SINK_LOG yolu sozlesmeyle ayni olmali; HICBIR degisiklik yapilmadi" }
  Write-Output "K-T0a: env sha256 pinli degere ESIT ($preHash) | yedek dizini yok | yakalayici kaydi var"

  # ---- K-T0: KORUMALI yedek dizini + on goruntu yedegi - GERI DONUSUN TEK GIRDISI ----
  # Dizin, yedek KOPYALANMADAN ONCE korumali DACL ile kurulur: yedek hic bir an kalitsal (yabanci
  # SID'li) ACL ile var olmaz. Dizin kurulduktan sonra BOS oldugu dogrulanir (araya yerlestirme yok).
  New-Item -ItemType Directory -Path $BakDir | Out-Null
  Set-TrustedAcl $BakDir $true
  $p = Get-TrustProblem $BakDir $true
  if ($p) { throw "K-T0: yedek dizini guvenilir DEGIL ($p)" }
  $early = @(Get-ChildItem -LiteralPath $BakDir -Force)
  if ($early.Count -ne 0) { throw "K-T0: yedek dizini korumaya alinirken icine $($early.Count) oge yerlestirilmis - DUR" }
  Copy-Item -LiteralPath $ENVF -Destination $BAK
  Set-TrustedAcl $BAK $false
  $p = Get-TrustProblem $BAK $true
  if ($p) { throw "K-T0: yedek dosyasi guvenilir DEGIL ($p)" }
  if ((Get-FileHash -Algorithm SHA256 -LiteralPath $BAK).Hash -ne $PinSha) { throw 'K-T0: yedek sha256 pinli degere ESIT DEGIL' }
  # Env SDDL TABANI: T-PENCERE-KAPA geri donusten sonra sahip + DACL'i buna karsi karsilastirir.
  $sddl = (Get-Acl -LiteralPath $ENVF).Sddl
  Set-Content -LiteralPath $SddlFile -Value $sddl -Encoding ASCII
  $p = Get-TrustProblem $SddlFile $false
  if ($p) { throw "K-T0: SDDL taban dosyasi guvenilir DEGIL ($p)" }
  # Yakalayici kaydi (K-T10b pozitif kaniti) de korunur: yabanci SID sahte ileti EKLEYEMEZ.
  # Yakalayici her yazimda dosyayi kendi (yurutucu) kimligiyle acar -> yazmaya devam eder.
  Set-TrustedAcl $SinkLog $false
  $p = Get-TrustProblem $SinkLog $true
  if ($p) { throw "K-T0: yakalayici kaydi guvenilir DEGIL ($p)" }
  Write-Output "K-T0: yedek dizini + yedek + SDDL tabani + yakalayici kaydi KORUMALI (sahip ve DACL yalniz SYSTEM/Administrators/$me) | yedek sha256 = pin"

  # ---- K-T6: KULLANICI GONDERIMLERINI ONLE (sayim DEGIL, ONLEME) ----
  if ($Mode -eq 'live') {
    Stop-ScheduledTask -TaskName 'HukukPlatform-Web'
    Start-Sleep -Seconds 3
    $webPids = @(Get-NetTCPConnection -LocalPort 3002 -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique)
    foreach ($wpid in $webPids) { Get-Process -Id ([int]$wpid) -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue }
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

  # ---- DEGISIM: TAM IKI SATIR, BAYT DUZEYINDE ----
  # Get-Content/Set-Content KULLANILMAZ: Windows PowerShell 5.1 BOM'suz UTF-8'i ANSI okur ve
  # '-Encoding UTF8' BOM ekler; olculdu ki ASCII disi degerler sessizce CIFT KODLANIYOR ve eski
  # satir karsilastirmasi (fark 4) bunu YAKALAMIYORDU. Burada: bayt oku -> KATI UTF-8 coz (gecersiz
  # baytta DUR) -> satir sonlari AYNEN korunarak yalniz iki satir degisir -> BOM durumu korunur.
  $raw = [IO.File]::ReadAllBytes($ENVF)
  $hasBom = ($raw.Length -ge 3 -and $raw[0] -eq 0xEF -and $raw[1] -eq 0xBB -and $raw[2] -eq 0xBF)
  $off = if ($hasBom) { 3 } else { 0 }
  $strict = New-Object Text.UTF8Encoding($false, $true)
  try { $text = $strict.GetString($raw, $off, $raw.Length - $off) } catch { throw 'K-T7: env gecerli UTF-8 DEGIL - degistirilmedi' }
  $pieces = [regex]::Split($text, '(?<=\n)')
  $out = New-Object Text.StringBuilder
  $hostHit = 0; $portHit = 0; $changed = @()
  for ($k = 0; $k -lt $pieces.Length; $k++) {
    $pc = $pieces[$k]
    $m = [regex]::Match($pc, '^([^\r\n]*)(\r?\n)?$')
    if (-not $m.Success) { throw "K-T7: satir $k ayrisamadi" }
    $body = $m.Groups[1].Value; $eol = $m.Groups[2].Value
    if ($body -match '^\s*SMTP_HOST\s*=') { $hostHit++; $changed += $k; $body = 'SMTP_HOST=127.0.0.1' }
    elseif ($body -match '^\s*SMTP_PORT\s*=') { $portHit++; $changed += $k; $body = "SMTP_PORT=$SinkPort" }
    [void]$out.Append($body).Append($eol)
  }
  if ($hostHit -ne 1 -or $portHit -ne 1) { throw "K-T7: SMTP_HOST=$hostHit SMTP_PORT=$portHit (her biri 1 olmali) - degistirilmedi" }
  $u8 = New-Object Text.UTF8Encoding($false)
  $body8 = $u8.GetBytes($out.ToString())
  if ($hasBom) { $newBytes = [byte[]](@(0xEF, 0xBB, 0xBF) + $body8) } else { $newBytes = $body8 }
  [IO.File]::WriteAllBytes($ENVF, $newBytes)

  # ---- K-T8: yazilan bayt = hesaplanan bayt; yalniz iki satir farkli; satir sonlari ve ACL ayni ----
  $post = [IO.File]::ReadAllBytes($ENVF)
  if ($post.Length -ne $newBytes.Length) { throw 'K-T8: yazilan uzunluk hesaplanandan FARKLI - GERI DON' }
  for ($k = 0; $k -lt $post.Length; $k++) { if ($post[$k] -ne $newBytes[$k]) { throw "K-T8: yazilan bayt $k hesaplanandan FARKLI - GERI DON" } }
  $bakPieces = [regex]::Split($strict.GetString($raw, $off, $raw.Length - $off), '(?<=\n)')
  $newPieces = [regex]::Split($out.ToString(), '(?<=\n)')
  if ($bakPieces.Length -ne $newPieces.Length) { throw 'K-T8: satir sayisi degisti - GERI DON' }
  $diffIdx = @()
  for ($k = 0; $k -lt $bakPieces.Length; $k++) {
    if ($bakPieces[$k] -cne $newPieces[$k]) { $diffIdx += $k }
    $e1 = [regex]::Match($bakPieces[$k], '\r?\n$').Value; $e2 = [regex]::Match($newPieces[$k], '\r?\n$').Value
    if ($e1 -cne $e2) { throw "K-T8: satir $k sonu degisti - GERI DON" }
  }
  if ($diffIdx.Count -ne 2 -or (($diffIdx -join ',') -ne ($changed -join ','))) { throw "K-T8: farkli satir $($diffIdx.Count) (2 olmali) - GERI DON" }
  if ((Get-Acl -LiteralPath $ENVF).Sddl -ne $sddl) { throw 'K-T8: env yazimi SDDL degistirdi - GERI DON' }
  Write-Output "K-T8: env farki TAM IKI SATIR (SMTP_HOST, SMTP_PORT) | diger baytlar, satir sonlari, BOM=$hasBom ve SDDL AYNI"

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
    # ATESLE-UNUT + DONGUYLE DOGRULA - canli yoldaki `Start-ScheduledTask` ile AYNI SINIF.
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
    $lp = @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique)
    Write-Output "  [bekleme $tick] $([int]$sw.Elapsed.TotalSeconds) sn | :$Port dinleyici=$(if ($lp.Count) { $lp -join ',' } else { 'YOK' })"
    if ($lp.Count -eq 1 -and [int]$lp[0] -ne $oldPid) { $newPid = [int]$lp[0]; break }
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
  Write-Output "K-T10a: baslangic env yazimindan SONRA | :465 baglantisi 0  (YAPISAL - pozitif kanit DEGIL)"

  # ---- K-T10b icin TABAN: pozitif kanit kosumun ILK gonderiminde olculur ----
  $sinkBase = @(Get-Content -LiteralPath $SinkLog).Count
  Set-Content -LiteralPath $BaseFile -Value $sinkBase -Encoding ASCII
  $p = Get-TrustProblem $BaseFile $false
  if ($p) { throw "K-T10b: taban dosyasi guvenilir DEGIL ($p)" }
  Write-Output "K-T10b TABAN: yakalayici kayit satiri = $sinkBase (pozitif kanit: kosumun ilk gonderimi bu sayiyi ARTIRMALI)"
  Write-Output ''
  Write-Output 'PENCERE ACIK. Sirada: I11 9. bolum blogu (gonderim kapsami ACIK) TEK KEZ; ardindan T-PENCERE-KAPA (ayni T_ENV_PRE_SHA ile).'
  Write-Output "Geri donus girdisi: $BAK (sha $preHash = T_ENV_PRE_SHA) - kosum/state dosyasina BAGLI DEGIL."
}
