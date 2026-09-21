param([switch]$SelfTest, [switch]$Rollback, [string]$BackupFile)
$ErrorActionPreference = 'Stop'
# ═══════════════ H5-URL · CANLI .env ANAHTAR EKLEME (B-I11-1) — OWNER ELEVATED KOSUM ═══════════════
# YAPAR : kapilar (yukseltilmis pencere · dist digest · tek API · .env sha pini · anahtar YOK · WEB_BASE_URL
#         MUTLAK) -> .env AYNI DIZINE yedeklenir (ACL degismez) -> TEK satir eklenir
#         (PUBLIC_INTAKE_BASE_URL = mevcut WEB_BASE_URL degeri) -> yalniz bu satirin eklendigi BAYT
#         duzeyinde dogrulanir -> gorev durdurulur/baslatilir -> saglik + kapsam dogrulanir.
# YAPMAZ: urun kodu/dist degistirmez · migration yok · baslatici ve gorev eylemi degismez · DB yazmaz ·
#         gonderim yapmaz · deger EKRANA YAZILMAZ (yalniz mutlak mi, host ve sha).
# GERI  : -Rollback -BackupFile <yol>  → yedek geri yazilir, API yeniden baslatilir, sha taban pine doner.
# ONEMLI: Deger TAHMIN EDILMEZ; .env icindeki WEB_BASE_URL degeri BIREBIR kullanilir (davet baglantisi
#         icin owner'in daha once girdigi kayitli deger).
$LIVE_API   = 'C:\Development\HUKUK_YAZILIMI\HY_W4_RELEASE23\project\apps\api'
$ENVF       = Join-Path $LIVE_API '.env'
$LIVE_DIST  = Join-Path $LIVE_API 'dist\apps\api\src'
$EXP_DIST   = '1524EDC15C636B39507DD9520206E3065E6A353A531D82D4362DFE115FC04D4E'
$ENV_PIN    = '7A7228B1143BE2A8406FAF4CA316064EB2E164AE23E160E1353121F64E0EFDDC'   # DEGISIKLIK ONCESI
$LAUNCHER   = 'C:\Ops\hukuk\bin\start-api.ps1'
$LAUNCH_PIN = 'CC634BBFE0BE8F4F06482EDB30FF1E687D36B08C075665E2EC160EA8082619B3'
$TASK = 'HukukPlatform-API'; $PORT = 8080; $KEY = 'PUBLIC_INTAKE_BASE_URL'; $SRC_KEY = 'WEB_BASE_URL'
function Say([string]$m) { Write-Host ((Get-Date).ToUniversalTime().ToString('HH:mm:ss') + 'Z  ' + $m) }
function Fail([string]$m) { throw "DUR: $m" }
function Sha([string]$p) { (Get-FileHash -LiteralPath $p -Algorithm SHA256).Hash }
function Get-TreeDigest([string]$root) {
  $root = (Resolve-Path -LiteralPath $root).Path.TrimEnd('\')
  $keys = New-Object 'System.Collections.Generic.List[string]'; $m = @{}
  foreach ($f in Get-ChildItem -LiteralPath $root -Recurse -File -Force) {
    $k = $f.FullName.Substring($root.Length + 1).Replace('\', '/'); $m[$k] = (Get-FileHash -LiteralPath $f.FullName -Algorithm SHA256).Hash; $keys.Add($k)
  }
  $keys.Sort([StringComparer]::Ordinal); $sb = New-Object Text.StringBuilder
  foreach ($k in $keys) { [void]$sb.Append($k).Append([char]0).Append($m[$k]).Append("`n") }
  return [BitConverter]::ToString([Security.Cryptography.SHA256]::Create().ComputeHash([Text.Encoding]::UTF8.GetBytes($sb.ToString()))).Replace('-', '')
}
function Get-ApiPids { return @((Get-NetTCPConnection -State Listen -LocalPort $PORT -ErrorAction SilentlyContinue).OwningProcess | Sort-Object -Unique) }
function Wait-ApiStopped([int]$T = 90) {
  $d = (Get-Date).AddSeconds($T)
  while ((Get-Date) -lt $d) {
    $l = @(Get-NetTCPConnection -State Listen -LocalPort $PORT -ErrorAction SilentlyContinue)
    $p = @(Get-CimInstance Win32_Process -Filter "Name='hukuk-task-host.exe'" -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -match '(^|\s)api(\s|$)' })
    if ($l.Count -eq 0 -and $p.Count -eq 0 -and (Get-ScheduledTask -TaskName $TASK).State -ne 'Running') { return $true }
    Start-Sleep -Seconds 2
  }
  return $false
}
function Http([string]$u) {
  try { $r = [Net.HttpWebRequest]::Create($u); $r.Method = 'GET'; $r.Timeout = 10000; $r.AllowAutoRedirect = $false; $r.UserAgent = 'h5-env-block'
    $resp = $r.GetResponse(); $c = [int]$resp.StatusCode; $resp.Dispose(); return $c }
  catch [Net.WebException] { if ($_.Exception.Response) { return [int]([Net.HttpWebResponse]$_.Exception.Response).StatusCode }; return -1 } catch { return -2 }
}
function Get-EnvValue([string]$file, [string]$key) {
  $hits = @(); foreach ($l in [IO.File]::ReadAllLines($file)) { if ($l -match ("^\s*" + [regex]::Escape($key) + "\s*=\s*(.*)$")) { $hits += $Matches[1].Trim().Trim('"').Trim("'") } }
  if ($hits.Count -ne 1) { Fail "$key gecis sayisi $($hits.Count) (1 bekleniyor)" }
  return $hits[0]
}
function Start-ApiAndCheck {
  Start-ScheduledTask -TaskName $TASK
  $d = (Get-Date).AddSeconds(120); $me = -1; $pids = @()
  while ((Get-Date) -lt $d) { $pids = Get-ApiPids; if ($pids.Count -ge 1) { $me = Http ("http://127.0.0.1:$PORT/api/auth/me"); if ($me -gt 0) { break } }; Start-Sleep -Seconds 3 }
  Say ("saglik: :$PORT pid=" + ($pids -join ',') + " | /api/auth/me=$me")
  return ($pids.Count -eq 1 -and $me -eq 401)
}

if (-not (New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { Fail 'yukseltilmis pencere gerekli' }

if ($Rollback) {
  Say '=== GERI ALMA'
  if (-not $BackupFile -or -not (Test-Path -LiteralPath $BackupFile)) { Fail 'BackupFile yok' }
  if ((Sha $BackupFile) -cne $ENV_PIN) { Fail 'yedek sha taban pini DEGIL - geri alma BASLAMAZ' }
  Stop-ScheduledTask -TaskName $TASK
  if (-not (Wait-ApiStopped 90)) { Fail 'API kapanmadi - .env DEGISTIRILMEDI' }
  Copy-Item -LiteralPath $BackupFile -Destination $ENVF -Force
  $s = Sha $ENVF; Say "geri alma sonrasi .env sha=$s | taban esit=$($s -ceq $ENV_PIN)"
  if ($s -cne $ENV_PIN) { Fail 'geri alma sonrasi sha taban DEGIL' }
  $ok = Start-ApiAndCheck
  Say ('=== SONUC: ' + $(if ($ok) { 'GERI ALMA PASS' } else { 'GERI ALMA DOGRULANAMADI' }))
  if (-not $ok) { exit 1 }
  exit 0
}

Say '=== 0) KAPILAR (salt okuma)'
$dist = Get-TreeDigest $LIVE_DIST
Say "canli dist=$dist | R25B esit=$($dist -ceq $EXP_DIST)"
if ($dist -cne $EXP_DIST) { Fail 'canli dist R25B degil' }
if ((Sha $LAUNCHER) -cne $LAUNCH_PIN) { Fail 'pinli baslatici farkli' }
$envSha0 = Sha $ENVF
Say ".env sha=$envSha0 | taban pin esit=$($envSha0 -ceq $ENV_PIN)"
if ($envSha0 -cne $ENV_PIN) { Fail '.env sha taban pin DEGIL (baska bir degisiklik var)' }
$pids0 = Get-ApiPids
if ($pids0.Count -ne 1) { Fail ":$PORT dinleyici sayisi $($pids0.Count)" }
$lines0 = [IO.File]::ReadAllLines($ENVF)
if (@($lines0 | Where-Object { $_ -match "^\s*$KEY\s*=" }).Count -ne 0) { Fail "$KEY ZATEN var - bu blok yalniz EKLEME icindir" }
$val = Get-EnvValue $ENVF $SRC_KEY
$abs = ($val -match '^https?://[^/\\]+(/.*)?$') -and ($val -notmatch '\\')
Say ("$SRC_KEY okundu (deger YAZDIRILMAZ): mutlak=$abs | host=" + $(if ($abs) { ([uri]$val).Authority } else { 'YOK' }) + " | uzunluk=$($val.Length)")
if (-not $abs) { Fail "$SRC_KEY mutlak bir adres degil - tahmin YAPILMAZ, owner karari gerekir" }
$task0 = Get-ScheduledTask -TaskName $TASK
$act0 = ($task0.Actions | ForEach-Object { $_.Execute + ' ' + $_.Arguments }) -join ' ; '
Say "gorev=$($task0.State) | action=$act0"

if ($SelfTest) { Say '=== SELFTEST PASS (hicbir sey yazilmadi)'; exit 0 }

Say '=== 1) YEDEK (ayni dizin -> ACL degismez)'
$ts = (Get-Date).ToUniversalTime().ToString('yyyyMMdd-HHmmss') + 'Z'
$bak = Join-Path $LIVE_API (".env.bak-H5URL-$ts")
if (Test-Path -LiteralPath $bak) { Fail 'yedek dosyasi zaten var' }
Copy-Item -LiteralPath $ENVF -Destination $bak -Force
if ((Sha $bak) -cne $envSha0) { Fail 'yedek sha uyusmuyor' }
Say "yedek=$bak | sha eslesti"

Say '=== 2) GOREVI DURDUR'
Stop-ScheduledTask -TaskName $TASK
if (-not (Wait-ApiStopped 90)) { Fail 'API kapanmadi - .env DEGISTIRILMEDI' }

Say '=== 3) TEK SATIR EKLE'
$nl = if ((Get-Content -LiteralPath $ENVF -Raw) -match "`r`n") { "`r`n" } else { "`n" }
$raw = [IO.File]::ReadAllText($ENVF)
if (-not $raw.EndsWith($nl)) { $raw += $nl }
[IO.File]::WriteAllText($ENVF, $raw + "$KEY=$val" + $nl, (New-Object Text.UTF8Encoding($false)))
$lines1 = [IO.File]::ReadAllLines($ENVF)
$added = @($lines1 | Where-Object { $_ -match "^\s*$KEY\s*=" })
$prefixSame = $true
for ($i = 0; $i -lt $lines0.Count; $i++) { if ($lines1[$i] -cne $lines0[$i]) { $prefixSame = $false; break } }
$envSha1 = Sha $ENVF
Say "eklenen anahtar sayisi=$($added.Count) | onceki satirlar BIREBIR ayni=$prefixSame | satir $($lines0.Count) -> $($lines1.Count)"
Say "yeni .env sha=$envSha1"
if ($added.Count -ne 1 -or -not $prefixSame -or $lines1.Count -ne ($lines0.Count + 1)) {
  Say 'KAPI: beklenmeyen fark -> YEDEKTEN GERI ALINIYOR'
  Copy-Item -LiteralPath $bak -Destination $ENVF -Force
  Start-ApiAndCheck | Out-Null
  Fail 'tek satir ekleme dogrulanamadi - geri alindi'
}

Say '=== 4) BASLAT + SAGLIK'
$healthy = Start-ApiAndCheck
$dist1 = Get-TreeDigest $LIVE_DIST
$task1 = Get-ScheduledTask -TaskName $TASK
$act1 = ($task1.Actions | ForEach-Object { $_.Execute + ' ' + $_.Arguments }) -join ' ; '
Say "kapsam: dist ayni=$($dist1 -ceq $EXP_DIST) | baslatici pin=$((Sha $LAUNCHER) -ceq $LAUNCH_PIN) | gorev action ayni=$($act1 -ceq $act0)"
$ok = $healthy -and ($dist1 -ceq $EXP_DIST) -and ($act1 -ceq $act0)
if (-not $ok) {
  Say 'KAPI: saglik/kapsam tutmadi -> YEDEKTEN GERI ALINIYOR'
  Stop-ScheduledTask -TaskName $TASK
  if (Wait-ApiStopped 90) { Copy-Item -LiteralPath $bak -Destination $ENVF -Force; Start-ApiAndCheck | Out-Null }
  Fail 'degisiklik geri alindi'
}
Say "=== SONUC: ENV EKLEME PASS · yeni .env sha=$envSha1 · yedek=$bak"
Say '    Bu iki satiri CLIENT a bildirin (DEGER bildirmeyin).'
