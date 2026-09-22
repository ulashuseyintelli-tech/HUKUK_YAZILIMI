param([switch]$SelfTest)
$ErrorActionPreference = 'Stop'
# =============================================================================
# C4 CANLI 403 OLCUMU - OWNER BLOGU (normal PowerShell; YONETICI GEREKMEZ). Saf ASCII.
# Insan eli gereken TEK adim: GO ref'in YEREL girilmesi (ekrana/dosyaya/repoya YAZILMAZ). Geri kalani betik yurutur.
# SIRA: kapilar -> GO ref -> c4-live-403.js [ILK YAZMA = sentetik kurulum; 403 olcumu; sifir yan etki; finally kapanis]
#       -> GO ref tuketim kaydi (yalniz sha256) -> manifest.
# YAPMAZ: yayin/geri alma, .env/gorev/firewall, ikinci API, gercek musteri verisi, gonderim, elevated cagri.
# SIR   : DB URL canli .env'den SUREC ICINDE okunur, YAZDIRILMAZ; personel parolasi bellekte uretilir.
# -SelfTest: yazma YOK, GO ref SORULMAZ; paket/canli kimlik/dinleyici/DB kimligi kapilarini olcer.
# CIKIS (goref-consumed.json exitCode): 0 PASS | 2 FAIL | 3 OLCULEMEYEN | 1 DURDU | 5 KAPANIS DOGRULANMADI.
# =============================================================================
$Repo     = 'D:\Development\HUKUK_YAZILIMI\project'
$Gov      = Join-Path $Repo 'project\docs\governance'
$Sc       = Join-Path $Gov 'client-c4-live-403-r01\scripts'
$Rel      = 'C:\Development\HUKUK_YAZILIMI\HY_W4_RELEASE23\project'
$EnvFile  = Join-Path $Rel 'apps\api\.env'
$LiveDist = Join-Path $Rel 'apps\api\dist\apps\api\src'
$EvRoot   = 'C:\Users\ulastelli\Documents\CLIENT-EVIDENCE-20260911'
$Api      = 'http://127.0.0.1:8080/api'
$ExpPackage  = '6D68848B8AD9ED6DEFD3D4DDD630931019A6F1F9A3E3517BC38457126F2AD4F0'
$ExpLiveDist = 'A8B17A38327975C71DDAE82FE33D1E97CB8B339FB1E35D1828FCF8D0CEB053A0'   # R26 API (canli)
$PkgFiles = @('client-c4-live-403-r01\scripts\c4-live-403.js', 'client-live-acceptance-i13-r01\scripts\i13-lib.js',
              'client-acceptance-runners-i3-r01\scripts\i3-lib.js', 'client-acceptance-harness-r01\scripts\ah-lib.js',
              'client-live-acceptance-i12-r01\scripts\i12-live-identity.js')

function Fail([string]$m) { Write-Host ('DUR - ' + $m) -ForegroundColor Red; throw ('C4-DUR: ' + $m) }
function Sha([string]$p) { (Get-FileHash -LiteralPath $p -Algorithm SHA256).Hash.ToUpperInvariant() }
function Digest([System.Collections.Generic.List[string]]$lines) {
  $lines.Sort([StringComparer]::Ordinal); $sb = New-Object System.Text.StringBuilder; foreach ($l in $lines) { [void]$sb.Append($l) }
  ([BitConverter]::ToString([Security.Cryptography.SHA256]::Create().ComputeHash([Text.Encoding]::UTF8.GetBytes($sb.ToString()))) -replace '-', '').ToUpperInvariant()
}
function Invoke-RepoGit { $fwd = $Repo -replace '\\', '/'; & git.exe -c ('safe.directory=' + $fwd) -C $Repo @args }

Invoke-RepoGit fetch -q origin
$head = (Invoke-RepoGit rev-parse HEAD).Trim(); $orig = (Invoke-RepoGit rev-parse origin/main).Trim()
if ($head -ne $orig) { Fail ('main checkout origin/main ile SENKRON DEGIL (' + $head + ' vs ' + $orig + ')') }
if (Invoke-RepoGit status --porcelain --untracked-files=no) { Fail 'main checkout''ta takipli KIRLI dosya var' }
$pk = New-Object 'System.Collections.Generic.List[string]'
foreach ($f in $PkgFiles) { $pk.Add(($f -replace '\\', '/') + [char]0 + (Sha (Join-Path $Gov $f)) + "`n") }
$gotPkg = Digest $pk
if ($gotPkg -ne $ExpPackage) { Fail ('PAKET DIGEST uyusmuyor: ' + $gotPkg) }
$root = (Resolve-Path -LiteralPath $LiveDist).Path.TrimEnd('\'); $dl = New-Object 'System.Collections.Generic.List[string]'
foreach ($f in Get-ChildItem -LiteralPath $root -Recurse -File -Force) { $dl.Add($f.FullName.Substring($root.Length + 1).Replace('\', '/') + [char]0 + (Sha $f.FullName) + "`n") }
$gotDist = Digest $dl
$lis = @(Get-NetTCPConnection -State Listen -LocalPort 8080 -ErrorAction SilentlyContinue)
$foreign = @(Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -match 'i1\d-|i3-sink|i3-start-api|f04-|c-run\.js|c-setup\.js|r26-live-portal|r26-dar-kabul|c4-live-403' })
$launcher = [IO.File]::ReadAllLines('C:\Ops\hukuk\logs\api\launcher.log') | Where-Object { $_ -match 'db identity ok' } | Select-Object -Last 1
$dbOk = ($launcher -match 'host=127\.0\.0\.1 port=5432 db=hukuk_db')
if ($SelfTest) {
  Write-Host ('SELFTEST: paket=' + $gotPkg.Substring(0, 16) + ' esit | canli API=' + $gotDist.Substring(0, 16) + ' R26=' + ($gotDist -eq $ExpLiveDist) + ' | :8080=' + $lis.Count + ' | yabanci=' + $foreign.Count + ' | db hukuk_db=' + $dbOk + ' | main=' + $head.Substring(0, 8))
  if ($gotDist -ne $ExpLiveDist -or $lis.Count -ne 1 -or $foreign.Count -ne 0 -or -not $dbOk) { Write-Host 'SELFTEST FAIL' -ForegroundColor Red; exit 1 }
  Write-Host 'SELFTEST PASS (yazma YOK, GO ref SORULMADI)' -ForegroundColor Green; exit 0
}
if ($gotDist -ne $ExpLiveDist) { Fail ('CANLI API R26 degil: ' + $gotDist) }
if ($lis.Count -ne 1) { Fail ('8080 dinleyici sayisi ' + $lis.Count) }
if ($foreign.Count -gt 0) { Fail ('baska kabul/prova sureci calisiyor: ' + ($foreign.ProcessId -join ',')) }
if (-not $dbOk) { Fail ('canli API DB kimligi beklenmedik: ' + $launcher) }

$GoRef = Read-Host 'C4 canli GO ref (OWNER-GO-CLIENT-C4-YYYYMMDD-RNN)'
if ($GoRef -cnotmatch '^OWNER-GO-CLIENT-C4-\d{8}-R\d{2}$') { Fail 'GO ref BICIMI hatali' }
Invoke-RepoGit grep -q -F -- $GoRef | Out-Null
if ($LASTEXITCODE -eq 0) { Fail 'GO ref repoda ZATEN geciyor - TUKETILMIS' }
if ($LASTEXITCODE -ne 1) { Fail ('tuketim kontrolu yapilamadi (git grep exit ' + $LASTEXITCODE + ')') }
$dbLine = @([IO.File]::ReadAllLines($EnvFile) | Where-Object { $_ -match '^\s*DATABASE_URL\s*=' })
if ($dbLine.Count -ne 1) { Fail ('DATABASE_URL satir sayisi ' + $dbLine.Count + ' (1 bekleniyor)') }
$RunId = -join ((1..8) | ForEach-Object { '{0:x}' -f (Get-Random -Maximum 16) })
$EvDir = Join-Path $EvRoot ('c4-live-' + $RunId + '-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
New-Item -ItemType Directory -Force -Path $EvDir | Out-Null
[ordered]@{ record = 'C4-OWNER-BLOCK'; runId = $RunId; main = $head; packageDigest = $gotPkg; liveApi = $gotDist; apiPid = $lis[0].OwningProcess; startedUtc = (Get-Date).ToUniversalTime().ToString('o') } |
  ConvertTo-Json | Set-Content -LiteralPath (Join-Path $EvDir 'owner-block.json') -Encoding UTF8
$env:AH_DATABASE_URL = ($dbLine[0] -replace '^\s*DATABASE_URL\s*=\s*', '').Trim().Trim('"').Trim("'")
$env:AH_PRISMA_ROOT = Join-Path $Rel 'node_modules\.pnpm\@prisma+client@5.22.0_prisma@5.22.0\node_modules\@prisma\client'
$env:AH_BCRYPT_PATH = Join-Path $Rel 'node_modules\.pnpm\bcrypt@5.1.1\node_modules\bcrypt'
$env:C4_LIVE_CONFIRM = '1'; $env:C4_LIVE_GO_REF = $GoRef; $env:C4_RUNID = $RunId
$env:C4_EXPECT_DB = 'hukuk_db'; $env:C4_EXPECT_TENANT_SLUG = ('ah-' + $RunId); $env:C4_API_BASE = $Api; $env:C4_EXPECT_API = $Api
$rb = New-Object byte[] 18; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($rb)
$env:C4_LIVE_LOGIN_PW = 'C4L!' + [Convert]::ToBase64String($rb).TrimEnd('=').Replace('+', '-').Replace('/', '_'); $rb = $null
$env:C4_RECEIPT = Join-Path $EvDir 'c4-setup-receipt.json'; $env:C4_EVID_FILE = Join-Path $EvDir 'c4-evidence.json'
Remove-Item Env:C4_PROVA_ELEVATED -ErrorAction SilentlyContinue
$node = (Get-Command node -CommandType Application -ErrorAction Stop | Select-Object -First 1).Source
# PS 5.1: EAP=Stop iken yerel programin stderr'i *> ile yonlendirilirse blok sonlanir -> cagri suresince Continue.
$global:LASTEXITCODE = -999; $ErrorActionPreference = 'Continue'
& $node (Join-Path $Sc 'c4-live-403.js') *> (Join-Path $EvDir 'c4-run.log')
$rc = $global:LASTEXITCODE; $ErrorActionPreference = 'Stop'
$goSha = ([BitConverter]::ToString([Security.Cryptography.SHA256]::Create().ComputeHash([Text.Encoding]::UTF8.GetBytes($GoRef))) -replace '-', '').ToUpperInvariant()
[ordered]@{ record = 'C4-GOREF-CONSUMED'; runId = $RunId; goRefSha256 = $goSha; literalWritten = $false; exitCode = $rc; atUtc = (Get-Date).ToUniversalTime().ToString('o') } |
  ConvertTo-Json | Set-Content -LiteralPath (Join-Path $EvDir 'goref-consumed.json') -Encoding UTF8
foreach ($k in 'AH_DATABASE_URL', 'C4_LIVE_GO_REF', 'C4_LIVE_LOGIN_PW') { Remove-Item ('Env:' + $k) -ErrorAction SilentlyContinue }
$GoRef = $null
Get-ChildItem -LiteralPath $EvDir -File | Where-Object Name -ne 'SHA256-MANIFEST.txt' | Sort-Object Name |
  ForEach-Object { (Sha $_.FullName) + '  ' + $_.Name } | Set-Content -LiteralPath (Join-Path $EvDir 'SHA256-MANIFEST.txt') -Encoding ASCII
Write-Host ('C4 BITTI - RUNID=' + $RunId + ' | cikis=' + $rc + ' (0 PASS, 2 FAIL, 3 OLCULEMEYEN, 1 DURDU, 5 KAPANIS DOGRULANMADI)')
Write-Host ('  kanit dizini: ' + $EvDir)
if ($rc -ne 0) { exit $rc }
