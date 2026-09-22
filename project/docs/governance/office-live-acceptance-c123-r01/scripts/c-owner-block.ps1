param([switch]$SelfTest)
$ErrorActionPreference = 'Stop'
# =============================================================================
# OFFICE C123 CANLI KABUL — OWNER BLOGU (normal PowerShell; YONETICI GEREKMEZ). Saf ASCII.
# Insan eli gereken TEK adim: GO ref'in YEREL girilmesi (ekrana/dosyaya/repoya YAZILMAZ).
# SIRA: kapilar -> GO ref -> c-run.js -> GO ref tuketim kaydi (yalniz sha256) -> manifest -> EXIT $rc
# CIKIS KODU c-run.js'ten AYNEN aktarilir: 0 PASS | 1 FAIL | 2 OLCULEMEDI | 3 KAPANIS DOGRULANAMADI | 4 G-0/G-6 (YAZMA YOK)
#   2026-09-22 kusuru: kosumu saran betik `exit` cagirmadigi icin cagiran kabuk eski $LASTEXITCODE'u
#   (-999) okudu ve ic kosumun 0 sonucuyla celisti. Bu betik cikisi ZORUNLU olarak aktarir.
# SIR: DB URL canli .env'den SUREC ICINDE okunur, YAZDIRILMAZ.
# -SelfTest: yazma YOK, GO ref SORULMAZ; yalnizca kapilar olculur.
# =============================================================================
$Repo = 'D:\Development\HUKUK_YAZILIMI\project'
$Pkg  = Join-Path $Repo 'project\docs\governance\office-live-acceptance-c123-r01'
$Rel  = 'C:\Development\HUKUK_YAZILIMI\HY_W4_RELEASE23\project\apps\api'   # tarihsel dizin adi; calisan surum ayri olculur
$EvRoot = 'C:\Users\ulastelli\Documents\CLIENT-EVIDENCE-20260911'
$LiveApiPort = 8080

function Fail([string]$m) { Write-Host ('DUR - ' + $m) -ForegroundColor Red; throw ('C123-DUR: ' + $m) }
function Sha([string]$p) { (Get-FileHash -LiteralPath $p -Algorithm SHA256).Hash.ToUpperInvariant() }
function Invoke-RepoGit { $fwd = $Repo -replace '\\', '/'; & git.exe -c ('safe.directory=' + $fwd) -C $Repo @args }

# 1) Kanonik checkout origin/main ile senkron ve takipli dosyalarda kirlilik yok.
Invoke-RepoGit fetch -q origin
$head = (Invoke-RepoGit rev-parse HEAD).Trim()
$orig = (Invoke-RepoGit rev-parse origin/main).Trim()
if ($head -ne $orig) { Fail ('main checkout origin/main ile SENKRON DEGIL (' + $head + ' vs ' + $orig + ')') }
if (Invoke-RepoGit status --porcelain --untracked-files=no) { Fail 'main checkout''ta takipli KIRLI dosya var' }
# Paket araclari main ile birebir (izlenen dosyalarda degisiklik yok -> yukaridaki kapi yeterli).

# 2) Canli kimlik: tek dinleyici, baska kabul/prova sureci yok.
$lis = @(Get-NetTCPConnection -State Listen -LocalPort $LiveApiPort -ErrorAction SilentlyContinue)
if ($lis.Count -ne 1) { Fail ('8080 dinleyici sayisi ' + $lis.Count) }
$foreign = @(Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue |
  Where-Object { $_.CommandLine -match 'i1\d-|i3-sink|i3-start-api|f04-|c4-live-403|r26-live-portal|r26-dar-kabul' })
if ($foreign.Count -gt 0) { Fail ('baska kabul/prova sureci calisiyor: ' + ($foreign.ProcessId -join ',')) }

if ($SelfTest) {
  Write-Host ('SELFTEST: main=' + $head.Substring(0, 8) + ' | :8080=' + $lis.Count + ' | yabanci=' + $foreign.Count)
  Write-Host 'SELFTEST PASS (yazma YOK, GO ref SORULMADI)' -ForegroundColor Green
  exit 0
}

# 3) GO ref: yalniz burada girilir; literal hicbir yere yazilmaz.
$GoRef = Read-Host 'C123 canli GO ref (OWNER-GO-OFFICE-C123-YYYYMMDD-Rnn)'
if ($GoRef -cnotmatch '^OWNER-GO-OFFICE-C123-\d{8}-R\d{2}$') { Fail 'GO ref BICIMI hatali' }
Invoke-RepoGit grep -q -F -- $GoRef | Out-Null
if ($LASTEXITCODE -eq 0) { Fail 'GO ref repoda ZATEN geciyor - TUKETILMIS' }
if ($LASTEXITCODE -ne 1) { Fail ('tuketim kontrolu yapilamadi (git grep exit ' + $LASTEXITCODE + ')') }

# 4) DB URL canli .env'den SUREC ICINDE okunur.
$dbLine = @([IO.File]::ReadAllLines((Join-Path $Rel '.env')) | Where-Object { $_ -match '^\s*DATABASE_URL\s*=' })
if ($dbLine.Count -ne 1) { Fail ('DATABASE_URL satir sayisi ' + $dbLine.Count + ' (1 bekleniyor)') }
$EvDir = Join-Path $EvRoot ('c123-live-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
New-Item -ItemType Directory -Force -Path $EvDir | Out-Null
$env:C123_DATABASE_URL = ($dbLine[0] -replace '^\s*DATABASE_URL\s*=\s*', '').Trim().Trim('"').Trim("'")
$env:C123_ENVIRONMENT  = 'live'
$env:C123_CONFIRM_LIVE = 'YES-LIVE-OFFICE-ACCEPTANCE-C123'
$env:C123_OWNER_GO_REF = $GoRef
$env:C123_API_BASE_URL = 'http://127.0.0.1:8080/api'
$env:C123_PRISMA_ROOT  = (Join-Path $Rel 'node_modules\@prisma\client')
$env:C123_BCRYPT_PATH  = (Join-Path $Rel 'node_modules\bcrypt')
$env:C123_DIST_ROOT    = (Join-Path $Rel 'dist\apps\api\src')
$env:C123_STATE_FILE   = (Join-Path $EvDir 'c123-state.json')
$env:C123_RESULT_FILE  = (Join-Path $EvDir 'c123-result.json')

$node = (Get-Command node -CommandType Application -ErrorAction Stop | Select-Object -First 1).Source
# PS 5.1: EAP=Stop iken yerel programin stderr'i *> ile yonlendirilirse blok sonlanir -> cagri suresince Continue.
$global:LASTEXITCODE = -999
$ErrorActionPreference = 'Continue'
& $node (Join-Path $Pkg 'scripts\c-run.js') *> (Join-Path $EvDir 'c123-run.log')
$rc = $global:LASTEXITCODE
$ErrorActionPreference = 'Stop'
if ($rc -eq -999) { Fail 'c-run.js cikis kodu OKUNAMADI (-999) — sonuc BELIRSIZ, PASS SAYILMAZ' }

$goSha = ([BitConverter]::ToString([Security.Cryptography.SHA256]::Create().ComputeHash([Text.Encoding]::UTF8.GetBytes($GoRef))) -replace '-', '').ToUpperInvariant()
[ordered]@{ record = 'C123-GOREF-CONSUMED'; goRefSha256 = $goSha; literalWritten = $false; scope = 'yalniz bu dosya';
            exitCode = $rc; main = $head; apiPid = $lis[0].OwningProcess; atUtc = (Get-Date).ToUniversalTime().ToString('o') } |
  ConvertTo-Json | Set-Content -LiteralPath (Join-Path $EvDir 'goref-consumed.json') -Encoding UTF8
foreach ($k in 'C123_DATABASE_URL', 'C123_OWNER_GO_REF') { Remove-Item ('Env:' + $k) -ErrorAction SilentlyContinue }
$GoRef = $null

Get-ChildItem -LiteralPath $EvDir -File | Where-Object Name -ne 'SHA256-MANIFEST.txt' | Sort-Object Name |
  ForEach-Object { (Sha $_.FullName) + '  ' + $_.Name } |
  Set-Content -LiteralPath (Join-Path $EvDir 'SHA256-MANIFEST.txt') -Encoding ASCII

Write-Host ('C123 BITTI - cikis=' + $rc + ' (0 PASS, 1 FAIL, 2 OLCULEMEDI, 3 KAPANIS DOGRULANAMADI, 4 G-0/G-6)')
Write-Host ('  kanit dizini: ' + $EvDir)
if ($rc -ne 0) { Write-Host '  PASS DEGIL - tekrar KOSMA; kanit dizinini yurutucu oturuma bildir' -ForegroundColor Yellow }
exit $rc
