param([switch]$SelfTest)
$ErrorActionPreference = 'Stop'
# =============================================================================
# R26 YAYIN SONRASI DAR CANLI KABUL (B2) - OWNER BLOGU (normal PowerShell; YONETICI GEREKMEZ). Saf ASCII.
# SIRA: kapilar -> (A) r26-dar-kabul.js after [SALT OKUMA; yazma YOK] cikis 0 olmali -> (B) GO ref YEREL girilir ->
#       r26-live-portal-login.js [ILK YAZMA = sentetik kurulum; BASARILI portal girisi gercek tarayicida; finally kapanis]
#       -> GO ref tuketim kaydi (yalniz sha256) -> manifest.
# YAPMAZ: yayin/geri alma, .env/gorev/firewall, ikinci API, gercek musteri verisi, e-posta, belge yukleme.
# SIR   : DB URL canli .env'den SUREC ICINDE okunur, YAZDIRILMAZ; personel/portal parolalari bellekte uretilir.
# -SelfTest: yazma YOK, GO ref SORULMAZ; paket/arac kapilarini olcer. Yayin ONCESI canli kimlik kapilari 'bekleniyor' raporlanir.
# CIKIS (goref-consumed.json exitCode): 0 PASS | 2 FAIL | 3 OLCULEMEYEN | 1 DURDU | 5 KAPANIS DOGRULANMADI.
# =============================================================================
$Repo     = 'D:\Development\HUKUK_YAZILIMI\project'
$Gov      = Join-Path $Repo 'project\docs\governance'
$Sc       = Join-Path $Gov 'client-release-r26-r01\scripts'
$Rel      = 'C:\Development\HUKUK_YAZILIMI\HY_W4_RELEASE23\project'
$EnvFile  = Join-Path $Rel 'apps\api\.env'
$LiveDist = Join-Path $Rel 'apps\api\dist\apps\api\src'
$LiveNext = Join-Path $Rel 'apps\web\.next'
$EvRoot   = 'C:\Users\ulastelli\Documents\CLIENT-EVIDENCE-20260911'
$Api      = 'http://127.0.0.1:8080/api'
$Playwright = 'D:\Development\HUKUK_YAZILIMI\HY_WT_R26\project\node_modules\.pnpm\playwright@1.61.1\node_modules\playwright'
$ExpPackage  = '7142C952F2D55EB54472EB14A496749618BA19FB608163107228F9B7C72B7797'
$ExpLiveDist = 'A8B17A38327975C71DDAE82FE33D1E97CB8B339FB1E35D1828FCF8D0CEB053A0'   # R26 API (R25B + 2 portal dosyasi)
$ExpLiveWeb  = 'C17E7B132FB7DED65AD0788024AA478F0949AF0D5D9045E8F47779A31A615326'   # R26 WEB .next (cache/ + trace haric)
$ExpBuildId  = '5waeMoFGGMTLAYmn9oJvW'
$PkgFiles = @('client-release-r26-r01\scripts\r26-live-portal-login.js', 'client-release-r26-r01\scripts\r26-dar-kabul.js',
              'client-live-acceptance-i13-r01\scripts\i13-lib.js', 'client-acceptance-runners-i3-r01\scripts\i3-lib.js',
              'client-acceptance-harness-r01\scripts\ah-lib.js', 'client-live-acceptance-i12-r01\scripts\i12-live-identity.js')

function Fail([string]$m) { Write-Host ('DUR - ' + $m) -ForegroundColor Red; throw ('R26-B2-DUR: ' + $m) }
function Sha([string]$p) { (Get-FileHash -LiteralPath $p -Algorithm SHA256).Hash.ToUpperInvariant() }
function Digest([System.Collections.Generic.List[string]]$lines) {
  $lines.Sort([StringComparer]::Ordinal); $sb = New-Object System.Text.StringBuilder; foreach ($l in $lines) { [void]$sb.Append($l) }
  ([BitConverter]::ToString([Security.Cryptography.SHA256]::Create().ComputeHash([Text.Encoding]::UTF8.GetBytes($sb.ToString()))) -replace '-', '').ToUpperInvariant()
}
function TreeDigest([string]$root, [switch]$Web) {
  $r = (Resolve-Path -LiteralPath $root).Path.TrimEnd('\'); $dl = New-Object 'System.Collections.Generic.List[string]'
  foreach ($f in Get-ChildItem -LiteralPath $r -Recurse -File -Force) {
    $rel = $f.FullName.Substring($r.Length + 1).Replace('\', '/')
    if ($Web -and ($rel.StartsWith('cache/') -or $rel -ceq 'trace')) { continue }
    $dl.Add($rel + [char]0 + (Sha $f.FullName) + "`n")
  }
  return (Digest $dl)
}
function Invoke-RepoGit { $fwd = $Repo -replace '\\', '/'; & git.exe -c ('safe.directory=' + $fwd) -C $Repo @args }

# 1) main senkron + temiz
Invoke-RepoGit fetch -q origin
$head = (Invoke-RepoGit rev-parse HEAD).Trim(); $orig = (Invoke-RepoGit rev-parse origin/main).Trim()
if ($head -ne $orig) { Fail ('main checkout origin/main ile SENKRON DEGIL (' + $head + ' vs ' + $orig + ')') }
if (Invoke-RepoGit status --porcelain --untracked-files=no) { Fail 'main checkout''ta takipli KIRLI dosya var' }

# 2) paket digest + araclar
$pk = New-Object 'System.Collections.Generic.List[string]'
foreach ($f in $PkgFiles) { $pk.Add(($f -replace '\\', '/') + [char]0 + (Sha (Join-Path $Gov $f)) + "`n") }
$gotPkg = Digest $pk
if ($gotPkg -ne $ExpPackage) { Fail ('PAKET DIGEST uyusmuyor: ' + $gotPkg) }
if (-not (Test-Path -LiteralPath $Playwright)) { Fail 'playwright (HY_WT_R26 aday agaci) yok - HY_WT_R26 SILINMEMELI' }
$node = (Get-Command node -CommandType Application -ErrorAction Stop | Select-Object -First 1).Source
$edge = @('C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe', 'C:\Program Files\Microsoft\Edge\Application\msedge.exe') | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
if (-not $edge) { Fail 'Microsoft Edge bulunamadi (bassiz tarayici)' }

# 3) canli kimlik (R26 yayinlanmis olmali) + tek API + yabanci yurutucu yok
$gotDist = TreeDigest $LiveDist; $gotWeb = TreeDigest $LiveNext -Web; $gotBid = (Get-Content -Raw -LiteralPath (Join-Path $LiveNext 'BUILD_ID')).Trim()
$liveOk = ($gotDist -eq $ExpLiveDist -and $gotWeb -eq $ExpLiveWeb -and $gotBid -ceq $ExpBuildId)
$lis = @(Get-NetTCPConnection -State Listen -LocalPort 8080 -ErrorAction SilentlyContinue)
$wlis = @(Get-NetTCPConnection -State Listen -LocalPort 3002 -ErrorAction SilentlyContinue)
$foreign = @(Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -match 'i1\d-|i3-sink|i3-start-api|f04-|c-run\.js|c-setup\.js|r26-live-portal|r26-dar-kabul' })
$launcher = [IO.File]::ReadAllLines('C:\Ops\hukuk\logs\api\launcher.log') | Where-Object { $_ -match 'db identity ok' } | Select-Object -Last 1
$dbOk = ($launcher -match 'host=127\.0\.0\.1 port=5432 db=hukuk_db')
if ($SelfTest) {
  Write-Host ('SELFTEST: paket=' + $gotPkg.Substring(0, 16) + ' esit | playwright=VAR | node=' + $node + ' | edge=VAR | main=' + $head.Substring(0, 8))
  Write-Host ('SELFTEST: canli API=' + $gotDist.Substring(0, 16) + ' WEB=' + $gotWeb.Substring(0, 16) + ' BUILD_ID=' + $gotBid + ' | R26 canlida=' + $liveOk + ' (yayin ONCESI False beklenir)')
  Write-Host ('SELFTEST: :8080=' + $lis.Count + ' :3002=' + $wlis.Count + ' yabanci yurutucu=' + $foreign.Count + ' db kimligi hukuk_db=' + $dbOk)
  if ($lis.Count -ne 1 -or $wlis.Count -ne 1 -or $foreign.Count -ne 0 -or -not $dbOk) { Write-Host 'SELFTEST FAIL' -ForegroundColor Red; exit 1 }
  Write-Host 'SELFTEST PASS (yazma YOK, GO ref SORULMADI)' -ForegroundColor Green; exit 0
}
if (-not $liveOk) { Fail ('canli R26 degil: API ' + $gotDist.Substring(0, 16) + ' WEB ' + $gotWeb.Substring(0, 16) + ' BUILD_ID ' + $gotBid + ' - B1 YAYIN PASS olmadan B2 kosmaz') }
if ($lis.Count -ne 1) { Fail ('8080 dinleyici sayisi ' + $lis.Count) }
if ($wlis.Count -ne 1) { Fail ('3002 dinleyici sayisi ' + $wlis.Count) }
if ($foreign.Count -gt 0) { Fail ('baska kabul/prova sureci calisiyor: ' + ($foreign.ProcessId -join ',')) }
if (-not $dbOk) { Fail ('canli API DB kimligi beklenmedik: ' + $launcher) }

$RunId = -join ((1..8) | ForEach-Object { '{0:x}' -f (Get-Random -Maximum 16) })
$EvDir = Join-Path $EvRoot ('r26-live-' + $RunId + '-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
New-Item -ItemType Directory -Force -Path $EvDir | Out-Null
[ordered]@{ record = 'R26-B2-OWNER-BLOCK'; runId = $RunId; main = $head; packageDigest = $gotPkg; liveApi = $gotDist; liveWeb = $gotWeb; buildId = $gotBid; apiPid = $lis[0].OwningProcess; webPid = $wlis[0].OwningProcess; startedUtc = (Get-Date).ToUniversalTime().ToString('o') } |
  ConvertTo-Json | Set-Content -LiteralPath (Join-Path $EvDir 'owner-block.json') -Encoding UTF8

# (A) SALT OKUMA dar kabul - DK-1..DK-6 (yazma YOK). PASS degilse GO ref SORULMAZ, yazma YAPILMAZ.
$dk = Join-Path $EvDir 'r26-dar-kabul-after.json'
# PS 5.1: EAP=Stop iken yerel programin stderr'i *> ile yonlendirilirse blok sonlanir -> cagri suresince Continue.
$global:LASTEXITCODE = -999; $ErrorActionPreference = 'Continue'
& $node (Join-Path $Sc 'r26-dar-kabul.js') after $dk *> (Join-Path $EvDir 'r26-dar-kabul.log')
$dkRc = $global:LASTEXITCODE; $ErrorActionPreference = 'Stop'
Write-Host ('(A) DAR KABUL cikis=' + $dkRc + ' | ' + (Get-Content -Raw -LiteralPath $dk | ConvertFrom-Json).sonuc)
if ($dkRc -ne 0) { Fail '(A) dar kabul PASS degil - (B) BASLATILMAZ, yazma YAPILMADI' }

# (B) GO ref YEREL girilir (ekrana/dosyaya/repoya YAZILMAZ) -> BASARILI portal girisi (ilk yazma = sentetik kurulum)
$GoRef = Read-Host 'R26 canli kabul GO ref (OWNER-GO-CLIENT-R26-YYYYMMDD-RNN)'
if ($GoRef -cnotmatch '^OWNER-GO-CLIENT-R26-\d{8}-R\d{2}$') { Fail 'GO ref BICIMI hatali' }
Invoke-RepoGit grep -q -F -- $GoRef | Out-Null
if ($LASTEXITCODE -eq 0) { Fail 'GO ref repoda ZATEN geciyor - TUKETILMIS' }
if ($LASTEXITCODE -ne 1) { Fail ('tuketim kontrolu yapilamadi (git grep exit ' + $LASTEXITCODE + ')') }
$dbLine = @([IO.File]::ReadAllLines($EnvFile) | Where-Object { $_ -match '^\s*DATABASE_URL\s*=' })
if ($dbLine.Count -ne 1) { Fail ('DATABASE_URL satir sayisi ' + $dbLine.Count + ' (1 bekleniyor)') }
$env:AH_DATABASE_URL = ($dbLine[0] -replace '^\s*DATABASE_URL\s*=\s*', '').Trim().Trim('"').Trim("'")
$env:AH_PRISMA_ROOT = Join-Path $Rel 'node_modules\.pnpm\@prisma+client@5.22.0_prisma@5.22.0\node_modules\@prisma\client'
$env:AH_BCRYPT_PATH = Join-Path $Rel 'node_modules\.pnpm\bcrypt@5.1.1\node_modules\bcrypt'
$env:R26_LIVE_CONFIRM = '1'; $env:R26_LIVE_GO_REF = $GoRef; $env:R26_RUNID = $RunId
$env:R26_EXPECT_DB = 'hukuk_db'; $env:R26_EXPECT_TENANT_SLUG = ('ah-' + $RunId); $env:R26_API_BASE = $Api; $env:R26_EXPECT_API = $Api
$rb = New-Object byte[] 18; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($rb)
$env:R26_LIVE_LOGIN_PW = 'R26L!' + [Convert]::ToBase64String($rb).TrimEnd('=').Replace('+', '-').Replace('/', '_'); $rb = $null
$env:R26_RECEIPT = Join-Path $EvDir 'r26-setup-receipt.json'; $env:R26_EVID_FILE = Join-Path $EvDir 'r26-portal-login-evidence.json'
Remove-Item Env:R26_WEB_BASES, Env:R26_PROVA_BLOCK_PORT -ErrorAction SilentlyContinue
$global:LASTEXITCODE = -999; $ErrorActionPreference = 'Continue'
& $node (Join-Path $Sc 'r26-live-portal-login.js') *> (Join-Path $EvDir 'r26-portal-login.log')
$rc = $global:LASTEXITCODE; $ErrorActionPreference = 'Stop'

$goSha = ([BitConverter]::ToString([Security.Cryptography.SHA256]::Create().ComputeHash([Text.Encoding]::UTF8.GetBytes($GoRef))) -replace '-', '').ToUpperInvariant()
[ordered]@{ record = 'R26-GOREF-CONSUMED'; runId = $RunId; goRefSha256 = $goSha; literalWritten = $false; darKabulExit = $dkRc; exitCode = $rc; atUtc = (Get-Date).ToUniversalTime().ToString('o') } |
  ConvertTo-Json | Set-Content -LiteralPath (Join-Path $EvDir 'goref-consumed.json') -Encoding UTF8
foreach ($k in 'AH_DATABASE_URL', 'R26_LIVE_GO_REF', 'R26_LIVE_LOGIN_PW') { Remove-Item ('Env:' + $k) -ErrorAction SilentlyContinue }
$GoRef = $null
Get-ChildItem -LiteralPath $EvDir -File | Where-Object Name -ne 'SHA256-MANIFEST.txt' | Sort-Object Name |
  ForEach-Object { (Sha $_.FullName) + '  ' + $_.Name } | Set-Content -LiteralPath (Join-Path $EvDir 'SHA256-MANIFEST.txt') -Encoding ASCII
$col = if ($rc -eq 0) { 'Green' } else { 'Yellow' }
Write-Host ('R26 B2 BITTI - RUNID=' + $RunId + ' | dar kabul=0 | portal girisi cikis=' + $rc + ' (0 PASS, 2 FAIL, 3 OLCULEMEYEN, 1 DURDU, 5 KAPANIS DOGRULANMADI)') -ForegroundColor $col
Write-Host ('  kanit dizini: ' + $EvDir)
Write-Host 'Bu satirlari CLIENT''a bildirin (GO ref bildirmeyin). CLIENT bagimsiz kapanis dogrulamasini kosar.'
if ($rc -ne 0) { exit $rc }
