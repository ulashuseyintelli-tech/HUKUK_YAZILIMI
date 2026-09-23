param([Parameter(Mandatory = $true)][string]$RunStateFile)
$ErrorActionPreference = 'Stop'
# =============================================================================
# OFFICE PERSONEL DAVETI — CANLI KOSUM BLOGU (YONETICI GEREKMEZ)
#
# NEDEN AYRI BETIK: GO ref ETKILESIMLI girilir (`Read-Host`). Ajan araclari etkilesimli degildir;
# bu yuzden kosumu owner calistirir. GO ref sohbete, komut satiri argumanina ve dosyaya YAZILMAZ;
# yalniz bu surecin bellegindedir ve kayda sha256'si girer.
#
# ON KOSUL: pencere ACIK olmali (`inv-live-window.ps1 -Command open` durum dosyasi VAR).
# Kosum sonucu ve makbuz, durum dosyasiyla AYNI kosuma ait yollara yazilir:
#   <durum>.result.json   <durum>.receipt.json
# Mevcut sonuc/makbuz dosyasi SESSIZCE EZILMEZ (ikinci kosum REDDEDILIR).
#
# CIKIS KODU inv-run.js'ten AYNEN aktarilir: 0 PASS · 1 FAIL · 2 DURDU/olculemedi · 5 hata enjeksiyonu.
# =============================================================================
$Repo = 'D:\Development\HUKUK_YAZILIMI\project'
$Sc   = Join-Path $Repo 'project\docs\governance\office-staff-invite-acceptance-r01\scripts'
$Rel  = 'C:\Development\HUKUK_YAZILIMI\HY_W4_RELEASE23\project\apps\api'
$Pins = @{
  'inv-lib.js'      = '6395A2FDC76AC36FC8BAE8A48806405746A5F646671B8B7FA23A54DFC6CE50CC'
  'inv-run.js'      = 'C96D367565FAB2C90758C6814DECD761543D012F335614A68D3E7A808AB7212F'
  'inv-99-close.js' = '67A6CE79DC43863887B9492FFF67C3D79FEF11448AE93933BEE0EE1519EB730F'
}

function Fail([string]$m) { Write-Host ('DUR - ' + $m) -ForegroundColor Red; throw ('INV-DUR: ' + $m) }
function Sha([string]$p) { (Get-FileHash -LiteralPath $p -Algorithm SHA256).Hash.ToUpperInvariant() }

if (-not (Test-Path -LiteralPath $RunStateFile)) { Fail 'pencere ACIK DEGIL (durum dosyasi yok) — once inv-live-window.ps1 -Command open' }
foreach ($k in $Pins.Keys) {
  $p = Join-Path $Sc $k
  if (-not (Test-Path -LiteralPath $p)) { Fail ('betik YOK: ' + $k) }
  $h = Sha $p
  if ($h -cne $Pins[$k]) { Fail ('SHA UYUSMUYOR -> ' + $k + ' = ' + $h) }
}
$state = Get-Content -Raw -LiteralPath $RunStateFile | ConvertFrom-Json
$capture = $state.captureDir
if (-not $capture) { $capture = Join-Path ([IO.Path]::GetDirectoryName($RunStateFile)) 'inv-capture' }
if (-not (Test-Path -LiteralPath $capture)) { Fail ('yakalama dizini YOK: ' + $capture) }

$ResultFile  = $RunStateFile + '.result.json'
$ReceiptFile = $RunStateFile + '.receipt.json'
foreach ($f in $ResultFile, $ReceiptFile) {
  if (Test-Path -LiteralPath $f) { Fail ('dosya ZATEN var, sessizce EZILMEZ: ' + $f) }
}

# GO ref: yalniz burada, etkilesimli.
$GoRef = Read-Host 'Davet canli GO ref (OWNER-GO-OFFICE-INVITE-YYYYMMDD-Rnn)'
if ($GoRef -cnotmatch '^OWNER-GO-OFFICE-INVITE-\d{8}-R\d{2}$') { Fail 'GO ref BICIMI hatali' }
$fwd = $Repo -replace '\\', '/'
& git.exe -c ('safe.directory=' + $fwd) -C $Repo grep -q -F -- $GoRef | Out-Null
if ($LASTEXITCODE -eq 0) { Fail 'GO ref repoda ZATEN geciyor - TUKETILMIS' }
if ($LASTEXITCODE -ne 1) { Fail ('tuketim kontrolu yapilamadi (git grep exit ' + $LASTEXITCODE + ')') }

# DB URL canli .env'den SUREC ICINDE okunur, YAZDIRILMAZ.
$dbLine = @([IO.File]::ReadAllLines((Join-Path $Rel '.env')) | Where-Object { $_ -match '^\s*DATABASE_URL\s*=' })
if ($dbLine.Count -ne 1) { Fail ('DATABASE_URL satir sayisi ' + $dbLine.Count) }

$env:INV_ENVIRONMENT   = 'live'
$env:INV_CONFIRM_LIVE  = 'YES-LIVE-OFFICE-INVITE-ACCEPTANCE'
$env:INV_OWNER_GO_REF  = $GoRef
$env:INV_DATABASE_URL  = ($dbLine[0] -replace '^\s*DATABASE_URL\s*=\s*', '').Trim().Trim('"').Trim("'")
$env:INV_API_BASE_URL  = 'http://127.0.0.1:8080/api'
$env:INV_PRISMA_ROOT   = (Join-Path $Rel 'node_modules\@prisma\client')
$env:INV_BCRYPT_PATH   = (Join-Path $Rel 'node_modules\bcrypt')
$env:INV_SINK_DIR      = $capture
$env:INV_RESULT_FILE   = $ResultFile
$env:INV_RECEIPT_FILE  = $ReceiptFile

$node = (Get-Command node -CommandType Application -ErrorAction Stop | Select-Object -First 1).Source
$log  = $RunStateFile + '.run.log'
# Cocuk surecin GERCEK cikisi: & ile cagir, hemen ardindan $LASTEXITCODE oku (baska komut ARAYA GIRMEZ).
$ErrorActionPreference = 'Continue'
& $node (Join-Path $Sc 'inv-run.js') *> $log
$rc = $LASTEXITCODE
$ErrorActionPreference = 'Stop'
foreach ($k in 'INV_DATABASE_URL', 'INV_OWNER_GO_REF') { Remove-Item ('Env:' + $k) -ErrorAction SilentlyContinue }
$GoRef = $null

if ($null -eq $rc) { Fail 'cikis kodu OKUNAMADI — sonuc BELIRSIZ, PASS SAYILMAZ' }
if ($rc -eq -999)  { Fail 'cikis kodu -999 — sonuc BELIRSIZ, PASS SAYILMAZ' }
Write-Host ('DAVET KOSUMU BITTI - cikis=' + $rc + ' (0 PASS · 1 FAIL · 2 DURDU · 5 hata enjeksiyonu)')
Write-Host ('  sonuc : ' + $ResultFile)
Write-Host ('  makbuz: ' + $ReceiptFile)
Write-Host ('  log   : ' + $log)
if ($rc -ne 0) { Write-Host '  PASS DEGIL - TEKRAR KOSMA; once kapatma/kurtarma blogunu calistirin' -ForegroundColor Yellow }
exit $rc
