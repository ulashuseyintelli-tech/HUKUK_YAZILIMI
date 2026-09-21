# ═══════════ H5-URL DAR CANLI KABUL - OWNER TEK BLOK (normal PowerShell; YÖNETİCİ GEREKMEZ) ═══════════
# YAPAR : kapılar (main senkron/temiz · paket digest · canlı dist · tek API · yabancı yürütücü yok ·
#         DB kimliği · PUBLIC_INTAKE_BASE_URL VAR) → GO ref YEREL girilir (biçim + tüketilmemişlik) →
#         TEK koşum `h5-url-live-run.js` (sentetik tenant; finally'de erişim kapanışı) → GO ref tüketim
#         kaydı (yalnız sha256) → SHA256 manifest.
# YAPMAZ: gerçek alıcıya gönderim · bildirim akışı · .env/görev/başlatıcı değişikliği · ikinci API · migration.
# SIR   : DB URL ve PUBLIC_INTAKE_BASE_URL canlı .env'den SÜREÇ İÇİNDE okunur, YAZDIRILMAZ. Ham token
#         hiçbir çıktıya yazılmaz (yalnız sha256). GO ref yalnız süreç ortamında kalır.
$ErrorActionPreference = 'Stop'
$SelfTest = $false   # $true: tüm salt-okuma kapıları koşar; GO ref SORULMAZ, hiçbir şey YAZILMAZ

$Repo     = 'D:\Development\HUKUK_YAZILIMI\project'
$Gov      = Join-Path $Repo 'project\docs\governance'
$Sc       = Join-Path $Gov 'client-h5-intake-url-r01\scripts'
$Rel      = 'C:\Development\HUKUK_YAZILIMI\HY_W4_RELEASE23\project'
$EnvFile  = Join-Path $Rel 'apps\api\.env'
$LiveDist = Join-Path $Rel 'apps\api\dist\apps\api\src'
$EvRoot   = 'C:\Users\ulastelli\Documents\CLIENT-EVIDENCE-20260911'
$Api      = 'http://127.0.0.1:8080/api'
$ExpPackage  = 'DAF86D1EDA5046791FE60FAC027725096F346B272F7DB2A87B755305ECEBD63B'
$ExpLiveDist = '1524EDC15C636B39507DD9520206E3065E6A353A531D82D4362DFE115FC04D4E'   # R25B
$PkgFiles = @('client-h5-intake-url-r01\scripts\h5-url-live-run.js',
              'client-live-acceptance-i13-r01\scripts\i13-lib.js',
              'client-acceptance-runners-i3-r01\scripts\i3-lib.js',
              'client-acceptance-harness-r01\scripts\ah-lib.js')

function Fail([string]$m) { Write-Host "DUR - $m" -ForegroundColor Red; throw "H5URL-DUR: $m" }
function Sha([string]$p) { (Get-FileHash -LiteralPath $p -Algorithm SHA256).Hash.ToUpperInvariant() }
function Digest([System.Collections.Generic.List[string]]$lines) {
  $lines.Sort([StringComparer]::Ordinal); $sb = [System.Text.StringBuilder]::new(); foreach ($l in $lines) { [void]$sb.Append($l) }
  ([BitConverter]::ToString([Security.Cryptography.SHA256]::Create().ComputeHash([Text.Encoding]::UTF8.GetBytes($sb.ToString()))) -replace '-', '').ToUpperInvariant()
}
function Invoke-RepoGit { $fwd = $Repo -replace '\\','/'; & git.exe -c "safe.directory=$fwd" -C $Repo @args }
function EnvValue([string]$key) {
  $hits = @(); foreach ($l in [IO.File]::ReadAllLines($EnvFile)) { if ($l -match ("^\s*" + [regex]::Escape($key) + "\s*=\s*(.*)$")) { $hits += $Matches[1].Trim().Trim('"').Trim("'") } }
  if ($hits.Count -ne 1) { Fail "$key geçiş sayısı $($hits.Count) (1 bekleniyor)" }
  return $hits[0]
}

# 1) main senkron + temiz
Invoke-RepoGit fetch -q origin
$head = (Invoke-RepoGit rev-parse HEAD).Trim(); $orig = (Invoke-RepoGit rev-parse origin/main).Trim()
if ($head -ne $orig) { Fail "main origin/main ile SENKRON DEĞİL ($head vs $orig)" }
if (Invoke-RepoGit status --porcelain --untracked-files=no) { Fail 'main checkout''ta takipli KİRLİ dosya var' }

# 2) paket digest + canlı dist
$pk = [System.Collections.Generic.List[string]]::new()
foreach ($f in $PkgFiles) { $pk.Add(($f -replace '\\','/') + [char]0 + (Sha (Join-Path $Gov $f)) + "`n") }
$gotPkg = Digest $pk
if ($gotPkg -ne $ExpPackage) { Fail "PAKET DIGEST uyuşmuyor: $gotPkg" }
$root = (Resolve-Path -LiteralPath $LiveDist).Path.TrimEnd('\'); $dl = [System.Collections.Generic.List[string]]::new(); $n = 0
foreach ($f in Get-ChildItem -LiteralPath $root -Recurse -File -Force) { $dl.Add($f.FullName.Substring($root.Length + 1).Replace('\','/') + [char]0 + (Sha $f.FullName) + "`n"); $n++ }
$gotDist = Digest $dl
if ($gotDist -ne $ExpLiveDist) { Fail "CANLI DIST uyuşmuyor: $gotDist ($n dosya)" }

# 3) tek canlı API + yabancı yürütücü yok + DB kimliği + env anahtarı
$lis = @(Get-NetTCPConnection -State Listen -LocalPort 8080 -ErrorAction SilentlyContinue)
if ($lis.Count -ne 1) { Fail "8080 dinleyici sayısı $($lis.Count) (1 bekleniyor)" }
$foreign = @(Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -match 'i1\d-|i3-sink|i3-start-api|f04-|h5-url-' })
if ($foreign.Count -gt 0) { Fail "başka kabul süreci çalışıyor: $($foreign.ProcessId -join ',')" }
$launcher = [IO.File]::ReadAllLines('C:\Ops\hukuk\logs\api\launcher.log') | Where-Object { $_ -match 'db identity ok' } | Select-Object -Last 1
if ($launcher -notmatch 'host=127\.0\.0\.1 port=5432 db=hukuk_db') { Fail "canlı API DB kimliği beklenmedik" }
$baseUrl = EnvValue 'PUBLIC_INTAKE_BASE_URL'
if ($baseUrl -notmatch '^https?://[^/\\]+(/.*)?$') { Fail 'PUBLIC_INTAKE_BASE_URL mutlak değil (önce env bloğu koşulmalı)' }

if ($SelfTest) {
  Write-Host ("SELFTEST GEÇTİ · paket={0} · dist={1} ({2} dosya) · API pid={3} · main={4} · base host={5}" -f `
    $gotPkg.Substring(0,16), $gotDist.Substring(0,16), $n, $lis[0].OwningProcess, $head.Substring(0,8), ([uri]$baseUrl).Authority) -ForegroundColor Green
  return
}

# 4) GO ref YEREL girilir
$GoRef = Read-Host 'H5-URL canlı GO ref (OWNER-GO-CLIENT-H5URL-YYYYMMDD-RNN)'
if ($GoRef -cnotmatch '^OWNER-GO-CLIENT-H5URL-\d{8}-R\d{2}$') { Fail 'GO ref BİÇİMİ hatalı' }
Invoke-RepoGit grep -q -F -- $GoRef | Out-Null
if ($LASTEXITCODE -eq 0) { Fail 'GO ref repoda ZATEN geçiyor - TÜKETİLMİŞ' }
if ($LASTEXITCODE -ne 1) { Fail "tüketim kontrolü yapılamadı (git grep exit $LASTEXITCODE)" }

# 5) koşum ortamı (sırlar süreç içinde)
$RunId = -join ((1..8) | ForEach-Object { '{0:x}' -f (Get-Random -Maximum 16) })
$EvDir = Join-Path $EvRoot ("h5url-live-{0}-{1}" -f $RunId, (Get-Date -Format 'yyyyMMdd-HHmmss'))
New-Item -ItemType Directory -Force -Path $EvDir | Out-Null
$env:AH_DATABASE_URL = EnvValue 'DATABASE_URL'
$env:AH_PRISMA_ROOT = Join-Path $Rel 'node_modules\.pnpm\@prisma+client@5.22.0_prisma@5.22.0\node_modules\@prisma\client'
$env:AH_BCRYPT_PATH = Join-Path $Rel 'node_modules\.pnpm\bcrypt@5.1.1\node_modules\bcrypt'
$env:H5U_LIVE_CONFIRM = '1'; $env:H5U_LIVE_GO_REF = $GoRef; $env:H5U_RUNID = $RunId
$env:H5U_EXPECT_DB = 'hukuk_db'; $env:H5U_EXPECT_TENANT_SLUG = "ah-$RunId"; $env:H5U_API_BASE = $Api; $env:H5U_EXPECT_API = $Api
$env:H5U_EXPECT_BASE_URL = $baseUrl
$rb = New-Object byte[] 18; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($rb)
$env:H5U_LIVE_LOGIN_PW = 'H5U!' + [Convert]::ToBase64String($rb).TrimEnd('=').Replace('+','-').Replace('/','_'); $rb = $null
$env:H5U_RECEIPT = Join-Path $EvDir 'h5url-setup-receipt.json'; $env:H5U_EVID_FILE = Join-Path $EvDir 'h5url-evidence.json'
[ordered]@{ record='H5URL-OWNER-BLOCK'; runId=$RunId; main=$head; packageDigest=$gotPkg; liveDist=$gotDist; apiPid=$lis[0].OwningProcess; baseUrlHost=([uri]$baseUrl).Authority; startedUtc=(Get-Date).ToUniversalTime().ToString('o') } |
  ConvertTo-Json | Set-Content -LiteralPath (Join-Path $EvDir 'owner-block.json') -Encoding UTF8

# 6) TEK KOŞUM
& node (Join-Path $Sc 'h5-url-live-run.js') *> (Join-Path $EvDir 'h5url-run.log')
$rc = $LASTEXITCODE

# 7) GO ref tüketim kaydı + ortam temizliği + manifest
$goSha = ([BitConverter]::ToString([Security.Cryptography.SHA256]::Create().ComputeHash([Text.Encoding]::UTF8.GetBytes($GoRef))) -replace '-', '').ToUpperInvariant()
[ordered]@{ record='H5URL-GOREF-CONSUMED'; runId=$RunId; goRefSha256=$goSha; literalWritten=$false; exitCode=$rc; atUtc=(Get-Date).ToUniversalTime().ToString('o') } |
  ConvertTo-Json | Set-Content -LiteralPath (Join-Path $EvDir 'goref-consumed.json') -Encoding UTF8
foreach ($k in 'AH_DATABASE_URL','H5U_LIVE_GO_REF','H5U_LIVE_LOGIN_PW','H5U_EXPECT_BASE_URL') { Remove-Item "Env:$k" -ErrorAction SilentlyContinue }
$GoRef = $null
Get-ChildItem -LiteralPath $EvDir -File | Where-Object Name -ne 'SHA256-MANIFEST.txt' | Sort-Object Name |
  ForEach-Object { "$(Sha $_.FullName)  $($_.Name)" } | Set-Content -LiteralPath (Join-Path $EvDir 'SHA256-MANIFEST.txt') -Encoding ASCII

$col = if ($rc -eq 0) { 'Green' } else { 'Yellow' }
Write-Host "H5-URL KOŞUM BİTTİ - RUNID=$RunId · çıkış=$rc (0 PASS · 2 FAIL · 3 ÖLÇÜLEMEYEN · 1 DURDU · 5 KAPANIŞ DOĞRULANMADI)" -ForegroundColor $col
Write-Host "  kanıt dizini: $EvDir"
Write-Host 'Bu satırları CLIENT''a bildirin (GO ref ve değer bildirmeyin).'
