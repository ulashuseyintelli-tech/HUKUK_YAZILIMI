& {
  # T-PENCERE-KAPA - POZITIF HEDEF KANITI + geri donus. SONUC NE OLURSA OLSUN calistirilir.
  # KOSUM VE STATE DOSYASINDAN BAGIMSIZDIR: girdileri env on goruntu yedegi + pinli sha'dir.
  # T_MODE        = 'live' | 'prova'.  T_RUNID verilirse pozitif kanit o kosuma baglanir.
  # T_ENV_PRE_SHA = ZORUNLU; T-PENCERE-AC'a verilen AYNI deger. Yedek YALNIZ bu degere esitse geri yazilir.
  # Bu dosya BILINCLI olarak yalniz ASCII'dir: Windows PowerShell 5.1 BOM'suz betigi ANSI okur.
  #
  # HATA YOLU (R05): bir adimin basarisizligi SONRAKI adimlari ATLATMAZ.
  # Onlem kaldirma (R-T4) ve yakalayici durdurma (R-T5) HER DURUMDA denenir; hatalar toplanir
  # ve blok SONDA throw eder. Gerekce: API kalkmadiginda (tam da yayin geri donusu gereken an)
  # engelleme kurallari ve durdurulmus Web kalirsa kullanicilar C33 geri donusunden sonra da
  # disarida kalir. Env geri yazilamamissa bile erisim geri acilir: SMTP loopback'te kalir ve
  # yakalayici durdurulur -> dis gonderim yine IMKANSIZ (guvenli yon).
  #
  # BUTUNLUK (R07): yedek, SDDL tabani, yakalayici kaydi ve taban dosyasi KULLANILMADAN ONCE sahip +
  # DACL + reparse denetiminden gecer; yedek ayrica pinli sha256'ya esit olmalidir. Karalama zinciri
  # yabanci SID'lere Modify / DeleteSubdirectoriesAndFiles verdigi icin (olculdu) dizin ya da dosya
  # degistirilmisse geri yazma YAPILMAZ; kanit dosyasi guvenilmezse kanit YOK sayilir.
  $ErrorActionPreference = 'Stop'
  $selfMark = 'T-PENCERE-KAPA'
  $Mode = if ($env:T_MODE) { $env:T_MODE } else { 'live' }
  if ($Mode -notin @('live', 'prova')) { throw "T_MODE gecersiz ('$Mode')" }
  $PinSha = if ($env:T_ENV_PRE_SHA) { $env:T_ENV_PRE_SHA.Trim().ToUpperInvariant() } else { '' }
  if ($PinSha -notmatch '^[0-9A-F]{64}$') { throw 'T-PIN: T_ENV_PRE_SHA zorunlu (T-PENCERE-AC ile ayni 64 hex) - HICBIR degisiklik yapilmadi; degerle yeniden calistirin' }

  $SinkPort  = 2526
  $BudgetSec = 180
  $S         = 'C:\Users\ulastelli\AppData\Local\Temp\claude\C--Development-HUKUK-YAZILIMI-project\894280b1-443c-4406-86cd-b9e22aad3f7b\scratchpad'
  $SinkLog   = Join-Path $S 'i11s\runs\smtp-sink.jsonl'
  $RunId     = $env:T_RUNID

  if ($Mode -eq 'live') {
    $REL    = 'C:\Development\HUKUK_YAZILIMI\HY_W4_RELEASE23'
    $ENVF   = Join-Path $REL 'project\apps\api\.env'
    $Port   = 8080
    $BakDir = Join-Path $S 'i11live'
  } else {
    $ENVF   = Join-Path $S 'i11s\twork\.env'
    $Port   = 8101
    $BakDir = Join-Path $S 'i11s\twork\preimage'
  }
  $BAK      = Join-Path $BakDir 'ENV-PREIMAGE.env'
  $BaseFile = Join-Path $BakDir 'SINK-BASELINE.txt'
  $SddlFile = Join-Path $BakDir 'ENV-SDDL-BASELINE.txt'

  # ---- K-ELEV (yalniz canli, ILK kapi): yukseltilmis Administrators olmadan HICBIR islem yapilmaz ----
  # Olculdu: canli .env sahibi SYSTEM, DACL korumali, kullaniciya yalniz Read; firewall ve SYSTEM
  # gorev/surec islemleri de yukseltme ister.
  if ($Mode -eq 'live') {
    $wp = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
    if (-not $wp.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
      throw 'K-ELEV: oturum YUKSELTILMIS Administrators DEGIL - canli .env/firewall/gorev islemleri yapilamaz; HICBIR degisiklik yapilmadi. Yukseltilmis kabukta yeniden calistirin.'
    }
    Write-Output 'K-ELEV: yukseltilmis Administrators oturumu'
  }

  $me = [Security.Principal.WindowsIdentity]::GetCurrent().Name
  $Trusted = @('NT AUTHORITY\SYSTEM', 'BUILTIN\Administrators', $me)
  function Get-TrustProblem([string]$path, [bool]$mustProtect) {
    if (-not (Test-Path -LiteralPath $path)) { return "YOK ($path)" }
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
  Write-Output "T-MOD: $Mode | env=$ENVF | port=$Port | yedek dizini=$BakDir | pin=$PinSha"

  $errs = @()

  # ---- K-T10b: POZITIF HEDEF KANITI - calisan API GERCEKTEN yerel yakalayiciya baglandi ----
  # Yapisal kontroller (baslangic zamani, :465 yoklugu) TEK BASINA yeterli SAYILMAZ.
  # Kanit: yakalayici kaydina, BU KOSUMUN kimligini tasiyan yeni ileti dustu.
  # Kanit dosyalari guvenilir degilse (sahip/DACL degismis) kanit YOK sayilir ve bildirilir.
  $posProof = $false; $posDetail = 'olculemedi'
  $evidenceTrusted = $false
  try {
    $pLog = Get-TrustProblem $SinkLog $true
    $pBase = Get-TrustProblem $BaseFile $false
    $pDir = Get-TrustProblem $BakDir $true
    if ($pLog -or $pBase -or $pDir) {
      $posDetail = "kanit dosyasi guvenilir DEGIL (kayit: $(if ($pLog) { $pLog } else { 'tamam' }) | taban: $(if ($pBase) { $pBase } else { 'tamam' }) | dizin: $(if ($pDir) { $pDir } else { 'tamam' }))"
      $errs += "K-T10b: $posDetail"
    } else {
      $evidenceTrusted = $true
      $base = [int](Get-Content -LiteralPath $BaseFile -TotalCount 1)
      $all = @(Get-Content -LiteralPath $SinkLog)
      $newLines = @($all | Select-Object -Skip $base)
      $withRun = if ($RunId) { @($newLines | Where-Object { $_ -match [regex]::Escape($RunId) }) } else { $newLines }
      if ($newLines.Count -gt 0 -and $withRun.Count -gt 0) { $posProof = $true }
      $posDetail = "yeni ileti $($newLines.Count); bu kosuma ait $($withRun.Count)"
    }
  } catch { $posDetail = "olcum hatasi: $($_.Exception.Message)" }
  if ($posProof) {
    Write-Output "K-T10b POZITIF KANIT: calisan API yerel yakalayiciya BAGLANDI ve ileti teslim etti ($posDetail)"
  } else {
    Write-Output "K-T10b POZITIF KANIT YOK ($posDetail) - hedef dogrulanamadi; geri donus YINE DE uygulanir"
  }

  # ---- R-T0/R-T1: env on goruntuye donus (idempotent, PINLI) ----
  try {
    $curHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $ENVF).Hash
    if ($curHash -eq $PinSha) {
      Write-Output "R-T0: mevcut env = pin ($PinSha)"
      Write-Output 'R-T1: env ZATEN on goruntuyle AYNI (idempotent) - yedege dokunulmadi'
    } else {
      $pDir = Get-TrustProblem $BakDir $true
      if ($pDir) { throw "yedek dizini guvenilir DEGIL ($pDir) - GERI YAZILMADI; elle mudahale" }
      $pBak = Get-TrustProblem $BAK $true
      if ($pBak) { throw "yedek dosyasi guvenilir DEGIL ($pBak) - GERI YAZILMADI; elle mudahale" }
      $bakHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $BAK).Hash
      Write-Output "R-T0: pin=$PinSha yedek=$bakHash mevcut=$curHash"
      if ($bakHash -ne $PinSha) { throw "yedek sha256 pinli degere ESIT DEGIL ($bakHash) - GERI YAZILMADI; elle mudahale" }
      Copy-Item -LiteralPath $BAK -Destination $ENVF -Force
      $after = (Get-FileHash -Algorithm SHA256 -LiteralPath $ENVF).Hash
      if ($after -ne $PinSha) { throw "geri yazma DOGRULANAMADI ($after != $PinSha)" }
      Write-Output 'R-T1: env on goruntuye geri yazildi - sha256 = pin'
    }
  } catch { $errs += "R-T0/R-T1: $($_.Exception.Message)"; Write-Output "!!! R-T0/R-T1 BASARISIZ: $($_.Exception.Message) - SONRAKI ADIMLAR YINE DE DENENIYOR" }

  # ---- R-T2: RESTART (butce ile) ----
  $newPid = 0
  try {
    $apiPids = @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique)
    $oldPid = if ($apiPids.Count -eq 1) { [int]$apiPids[0] } else { 0 }
    $sw = [Diagnostics.Stopwatch]::StartNew()
    if ($Mode -eq 'live') {
      Stop-ScheduledTask -TaskName 'HukukPlatform-API'
      Start-Sleep -Seconds 2
      if ($oldPid -ne 0) { Get-Process -Id $oldPid -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue }
      Start-ScheduledTask -TaskName 'HukukPlatform-API'
    } else {
      if ($oldPid -ne 0) { Get-Process -Id $oldPid -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue }
      Start-Sleep -Seconds 3
      # ATESLE-UNUT + DONGUYLE DOGRULA (canli yoldaki Start-ScheduledTask ile ayni sinif).
      Start-Process -FilePath 'node' -ArgumentList (Join-Path $S 'i9s\start-api-r22s.js') `
        -WindowStyle Hidden `
        -RedirectStandardOutput (Join-Path $S 'i11s\twork\close-launcher.out') `
        -RedirectStandardError (Join-Path $S 'i11s\twork\close-launcher.err') | Out-Null
    }
    $tick = 0
    while ($sw.Elapsed.TotalSeconds -lt $BudgetSec) {
      $tick++
      $lp = @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique)
      Write-Output "  [bekleme $tick] $([int]$sw.Elapsed.TotalSeconds) sn | :$Port dinleyici=$(if ($lp.Count) { $lp -join ',' } else { 'YOK' })"
      if ($lp.Count -eq 1 -and [int]$lp[0] -ne $oldPid) { $newPid = [int]$lp[0]; break }
      Start-Sleep -Seconds 3
    }
    $sw.Stop()
    if ($newPid -eq 0) { throw "API $BudgetSec sn icinde ayaga KALKMADI ($([int]$sw.Elapsed.TotalSeconds) sn); OTOMATIK TEKRAR YOK" }
    Write-Output "R-T2: API geri donusle basladi - PID $newPid - kesinti $([int]$sw.Elapsed.TotalSeconds) sn (butce $BudgetSec)"
  } catch { $errs += "R-T2: $($_.Exception.Message)"; Write-Output "!!! R-T2 BASARISIZ: $($_.Exception.Message) - SONRAKI ADIMLAR YINE DE DENENIYOR" }

  # ---- R-T3: ozgun hedef GERCEKTEN etkin ----
  try {
    if ($newPid -eq 0) { throw 'API sureci YOK - ozgun hedef dogrulanamadi' }
    $proc = Get-Process -Id $newPid
    $envWrite = (Get-Item -LiteralPath $ENVF).LastWriteTime
    if ($proc.StartTime -le $envWrite) { throw 'API baslangici env yazimindan SONRA DEGIL' }
    if ((Get-FileHash -Algorithm SHA256 -LiteralPath $ENVF).Hash -ne $PinSha) { throw 'env sha256 pinli degere ESIT DEGIL - geri donus TAMAMLANMADI' }
    $hostLine = @(Select-String -LiteralPath $ENVF -Pattern '^\s*SMTP_HOST\s*=')
    $hv = if ($hostLine.Count -eq 1) { (($hostLine[0].Line -replace '^\s*SMTP_HOST\s*=','').Trim()).Trim('"') } else { '(belirsiz)' }
    if ($hv -eq '127.0.0.1') { throw 'SMTP_HOST hala loopback - geri donus TAMAMLANMADI' }
    Write-Output "R-T3: env = pin | SMTP_HOST='$hv' - ozgun hedef geri geldi"
  } catch { $errs += "R-T3: $($_.Exception.Message)"; Write-Output "!!! R-T3 BASARISIZ: $($_.Exception.Message)" }

  # ---- R-T4: ONLEMEYI KALDIR (yalniz canli) - HER DURUMDA denenir ----
  if ($Mode -eq 'live') {
    try {
      $fw = @(Get-NetFirewallRule -DisplayName 'I11-WINDOW-BLOCK-*' -ErrorAction SilentlyContinue)
      foreach ($r in $fw) { Remove-NetFirewallRule -Name $r.Name }
      $left = @(Get-NetFirewallRule -DisplayName 'I11-WINDOW-BLOCK-*' -ErrorAction SilentlyContinue)
      if ($left.Count -ne 0) { throw "engelleme kurali kaldirilamadi ($($left.Count))" }
      Write-Output "R-T4a: engelleme kurallari kaldirildi ($($fw.Count))"
    } catch { $errs += "R-T4a: $($_.Exception.Message)"; Write-Output "!!! R-T4a BASARISIZ: $($_.Exception.Message)" }
    try {
      Start-ScheduledTask -TaskName 'HukukPlatform-Web'
      $webUp = 0
      $sw2 = [Diagnostics.Stopwatch]::StartNew()
      while ($sw2.Elapsed.TotalSeconds -lt $BudgetSec) {
        $w = @(Get-NetTCPConnection -LocalPort 3002 -State Listen -ErrorAction SilentlyContinue)
        if ($w.Count -ge 1) { $webUp = 1; break }
        Start-Sleep -Seconds 3
      }
      $sw2.Stop()
      if ($webUp -ne 1) { throw "Web $BudgetSec sn icinde ayaga KALKMADI" }
      Write-Output "R-T4b: Web ayakta ($([int]$sw2.Elapsed.TotalSeconds) sn)"
    } catch { $errs += "R-T4b: $($_.Exception.Message)"; Write-Output "!!! R-T4b BASARISIZ: $($_.Exception.Message)" }
  }

  # ---- R-T5: yakalayiciyi durdur - HER DURUMDA denenir ----
  try {
    $l = @(Get-NetTCPConnection -LocalPort $SinkPort -State Listen -ErrorAction SilentlyContinue)
    foreach ($c in $l) { Get-Process -Id ([int]$c.OwningProcess) -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue }
    Start-Sleep -Seconds 2
    $still = @(Get-NetTCPConnection -LocalPort $SinkPort -State Listen -ErrorAction SilentlyContinue)
    if ($still.Count -ne 0) { throw "yakalayici hala dinliyor (:$SinkPort)" }
    Write-Output 'R-T5: yakalayici durduruldu'
  } catch { $errs += "R-T5: $($_.Exception.Message)"; Write-Output "!!! R-T5 BASARISIZ: $($_.Exception.Message)" }

  # ---- R-T6: BASKA TENANT ILETISI KONTROLU - otomatik yeniden gonderim YOK ----
  $foreign = 0
  try {
    if (-not $evidenceTrusted) { throw 'yakalayici kaydi/taban guvenilir DEGIL (K-T10b) - alici denetimi yapilamadi' }
    $base = [int](Get-Content -LiteralPath $BaseFile -TotalCount 1)
    # YALNIZ GERCEK ILETILER sayilir ('LISTEN' defter satirlarinda alici yoktur).
    $newLines = @(Get-Content -LiteralPath $SinkLog | Select-Object -Skip $base | Where-Object { $_ -match '"raw"' })
    $foreign = @($newLines | Where-Object { $_ -notmatch 'cl-acceptance\.invalid' }).Count
    if ($foreign -ne 0) {
      Write-Output "R-T6: !!! SENTETIK ALAN DISI alici tasiyan ileti: $foreign - OTOMATIK YENIDEN GONDERIM YOK; owner a BILDIR"
    } else {
      Write-Output "R-T6: yakalanan iletilerin tamami sentetik alan (cl-acceptance.invalid) - ileti $($newLines.Count)"
    }
  } catch { $errs += "R-T6: $($_.Exception.Message)"; Write-Output "!!! R-T6 BASARISIZ: $($_.Exception.Message)" }

  # ---- R-T7: env ACL (SDDL) T-PENCERE-AC tabanina esit mi? - farkta OTOMATIK DUZELTME YOK ----
  try {
    $pSddl = Get-TrustProblem $SddlFile $false
    if ($pSddl) { throw "SDDL taban dosyasi guvenilir DEGIL ($pSddl)" }
    $sddlBase = (Get-Content -LiteralPath $SddlFile -TotalCount 1).Trim()
    $sddlNow = (Get-Acl -LiteralPath $ENVF).Sddl
    if ($sddlNow -ne $sddlBase) { throw "env SDDL tabandan FARKLI (taban=$sddlBase simdi=$sddlNow) - otomatik duzeltme YOK" }
    Write-Output 'R-T7: env SDDL (sahip + DACL) T-PENCERE-AC tabanina ESIT'
  } catch { $errs += "R-T7: $($_.Exception.Message)"; Write-Output "!!! R-T7 BASARISIZ: $($_.Exception.Message)" }

  Write-Output ''
  Write-Output "Pozitif hedef kaniti: $(if ($posProof) { 'VAR' } else { 'YOK' })"
  Write-Output 'NOT: Kabul kosumunun DB yazmalari GERI ALINMAZ; kapanisla (baglanti iptali + kullanici iptali + Case CLOSED) KAPATILIR ve kanit olarak KALIR.'
  Write-Output "NOT: $BakDir SIR TASIR (korumali); silme owner kararidir."
  if ($errs.Count -ne 0) {
    Write-Output "PENCERE KAPANISI EKSIK - basarisiz adim: $($errs.Count)"
    foreach ($e in $errs) { Write-Output "  - $e" }
    throw "PENCERE KAPANISI EKSIK ($($errs.Count) adim) - owner a DERHAL bildir; OTOMATIK TEKRAR YOK"
  }
  Write-Output 'PENCERE KAPANDI - tum adimlar basarili.'
}
