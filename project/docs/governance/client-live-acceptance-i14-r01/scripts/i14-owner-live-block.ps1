# ═══════════════ İ14 CANLI KABUL (H4 talimat/beyan/onay) - OWNER TEK BLOK (normal PowerShell; YÖNETİCİ GEREKMEZ) ═══════════════
# YAPAR : kapılar (main senkron/temiz · paket digest · canlı dist · tek API dinleyicisi · yabancı yürütücü yok) → GO ref
#         YEREL girilir (biçim + tüketilmemişlik) → runId → TEK koşum `i14-live-run.js` (kurulum = İLK YAZMA, H4-01…H4-07 + H4-08 İ12 bağı,
#         finally'de NİHAİ erişim kapanışı + izolasyon) → GO ref tüketim kaydı (yalnız sha256) → SHA256 manifest.
# YAPMAZ: .env değişikliği · görev durdurma/başlatma · firewall · ikinci API · gerçek alıcıya gönderim (H4-05 onay maili
#         SENTETİK tenant'ın Office'inde ölü porta 127.0.0.1:65535 gider; H4-08 canlıda yayın ÇAĞIRMAZ, İ12 kanıtına bağlanır).
# SIR   : DB URL canlı .env'den SÜREÇ İÇİNDE okunur, ekrana/dosyaya YAZILMAZ; GO ref yalnız süreç ortamında kalır.
# HATA  : koşum yarıda kalırsa kapanış `finally`de zaten koşar; ek güvence: aynı pencerede
#         `$env:I13_LIVE_CONFIRM='1'; $env:I13_LIVE_GO_REF='x'; $env:I13_RECOVER_RUNID='<runId>'; node <i13 scripts>\i13-live-recover.js` (kimlik bağı yoksa SIFIR yazma).
$ErrorActionPreference = 'Stop'
$SelfTest = $false   # $true: tüm salt-okuma kapıları koşar; GO ref SORULMAZ, hiçbir şey YAZILMAZ

$Repo     = 'D:\Development\HUKUK_YAZILIMI\project'
$Gov      = Join-Path $Repo 'project\docs\governance'
$Sc       = Join-Path $Gov 'client-live-acceptance-i14-r01\scripts'
$I12Ev    = 'C:\Users\ulastelli\Documents\CLIENT-EVIDENCE-20260911\i12-live-92d04ef3-20260918-222026'
$Rel      = 'C:\Development\HUKUK_YAZILIMI\HY_W4_RELEASE23\project'
$EnvFile  = Join-Path $Rel 'apps\api\.env'
$LiveDist = Join-Path $Rel 'apps\api\dist\apps\api\src'
$EvRoot   = 'C:\Users\ulastelli\Documents\CLIENT-EVIDENCE-20260911'
$Api      = 'http://127.0.0.1:8080/api'
$ExpPackage  = 'B24458E974F18929715763EB98B19557EC3B9C03138D3742E6EF061251352FBF'
$ExpLiveDist = '87712E0ED2CF71EE8268D81865C2388E030F52AF9AC7E29C56617AEDD0845453'
# Paket = İ13 betikleri + davranışı belirleyen yeniden kullanılan betikler (kaynaktan; değişirse DUR)
$PkgFiles = @('client-live-acceptance-i14-r01\scripts\i14-live-run.js', 'client-live-acceptance-i13-r01\scripts\i13-lib.js',
              'client-live-acceptance-i13-r01\scripts\i13-live-recover.js', 'client-acceptance-runners-i3-r01\scripts\i3-h4-declarations.js',
              'client-acceptance-runners-i3-r01\scripts\i3-h4-disclosure.js', 'client-acceptance-runners-i3-r01\scripts\i3-lib.js',
              'client-acceptance-harness-r01\scripts\ah-lib.js', 'client-live-acceptance-i12-r01\scripts\i12-live-identity.js')

function Fail([string]$m) { Write-Host "DUR - $m" -ForegroundColor Red; throw "I14-DUR: $m" }
function Sha([string]$p) { (Get-FileHash -LiteralPath $p -Algorithm SHA256).Hash.ToUpperInvariant() }
function Digest([System.Collections.Generic.List[string]]$lines) {
  $lines.Sort([StringComparer]::Ordinal); $sb = [System.Text.StringBuilder]::new(); foreach ($l in $lines) { [void]$sb.Append($l) }
  ([BitConverter]::ToString([Security.Cryptography.SHA256]::Create().ComputeHash([Text.Encoding]::UTF8.GetBytes($sb.ToString()))) -replace '-', '').ToUpperInvariant()
}
function Invoke-RepoGit { $fwd = $Repo -replace '\\','/'; & git.exe -c "safe.directory=$fwd" -C $Repo @args }

# 1) main senkron + temiz
Invoke-RepoGit fetch -q origin
$head = (Invoke-RepoGit rev-parse HEAD).Trim(); $orig = (Invoke-RepoGit rev-parse origin/main).Trim()
if ($head -ne $orig) { Fail "main checkout origin/main ile SENKRON DEĞİL ($head vs $orig)" }
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

# 3) tek canlı API + başka canlı kabul yürütücüsü yok + env-SMTP penceresi AÇIK DEĞİL (İ12 kalıntısı yok)
$lis = @(Get-NetTCPConnection -State Listen -LocalPort 8080 -ErrorAction SilentlyContinue)
if ($lis.Count -ne 1) { Fail "8080 dinleyici sayısı $($lis.Count) (1 bekleniyor)" }
$foreign = @(Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -match 'i1\d-|i3-sink|i3-start-api|f04-' })
if ($foreign.Count -gt 0) { Fail "başka kabul süreci çalışıyor: $($foreign.ProcessId -join ',')" }
if (@(Get-NetFirewallRule -ErrorAction SilentlyContinue | Where-Object Name -like 'I1?-WINDOW-BLOCK-*').Count -gt 0) { Fail 'açık bir kabul penceresi kuralı var' }
$launcher = [IO.File]::ReadAllLines('C:\Ops\hukuk\logs\api\launcher.log') | Where-Object { $_ -match 'db identity ok' } | Select-Object -Last 1
if ($launcher -notmatch 'host=127\.0\.0\.1 port=5432 db=hukuk_db') { Fail "canlı API DB kimliği beklenmedik: $launcher" }

if ($SelfTest) { Write-Host ("SELFTEST GEÇTİ · paket={0} · dist={1} ({2} dosya) · API pid={3} · main={4}" -f $gotPkg.Substring(0,16), $gotDist.Substring(0,16), $n, $lis[0].OwningProcess, $head.Substring(0,8)) -ForegroundColor Green; return }

# 4) GO ref YEREL girilir (ekrana/dosyaya/repoya YAZILMAZ)
$GoRef = Read-Host 'İ14 canlı GO ref (OWNER-GO-CLIENT-I14-YYYYMMDD-RNN)'
if ($GoRef -cnotmatch '^OWNER-GO-CLIENT-I14-\d{8}-R\d{2}$') { Fail 'GO ref BİÇİMİ hatalı' }
Invoke-RepoGit grep -q -F -- $GoRef | Out-Null
if ($LASTEXITCODE -eq 0) { Fail 'GO ref repoda ZATEN geçiyor - TÜKETİLMİŞ' }
if ($LASTEXITCODE -ne 1) { Fail "tüketim kontrolü yapılamadı (git grep exit $LASTEXITCODE)" }

# 5) koşum ortamı (DB URL süreç içinde; YAZDIRILMAZ)
$dbLine = @([IO.File]::ReadAllLines($EnvFile) | Where-Object { $_ -match '^\s*DATABASE_URL\s*=' })
if ($dbLine.Count -ne 1) { Fail "DATABASE_URL satır sayısı $($dbLine.Count) (1 bekleniyor)" }
$RunId = -join ((1..8) | ForEach-Object { '{0:x}' -f (Get-Random -Maximum 16) })
$EvDir = Join-Path $EvRoot ("i14-live-{0}-{1}" -f $RunId, (Get-Date -Format 'yyyyMMdd-HHmmss'))
New-Item -ItemType Directory -Force -Path $EvDir | Out-Null
$env:AH_DATABASE_URL = ($dbLine[0] -replace '^\s*DATABASE_URL\s*=\s*', '').Trim().Trim('"').Trim("'")
$env:AH_PRISMA_ROOT = Join-Path $Rel 'node_modules\.pnpm\@prisma+client@5.22.0_prisma@5.22.0\node_modules\@prisma\client'
$env:AH_BCRYPT_PATH = Join-Path $Rel 'node_modules\.pnpm\bcrypt@5.1.1\node_modules\bcrypt'
$env:I14_LIVE_CONFIRM = '1'; $env:I14_LIVE_GO_REF = $GoRef; $env:I14_RUNID = $RunId
$env:I14_EXPECT_DB = 'hukuk_db'; $env:I14_EXPECT_TENANT_SLUG = "ah-$RunId"; $env:I14_API_BASE = $Api; $env:I14_EXPECT_API = $Api
$rb = New-Object byte[] 18; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($rb)   # PS 5.1 uyumlu
$env:I14_LIVE_LOGIN_PW = 'I14L!' + [Convert]::ToBase64String($rb).TrimEnd('=').Replace('+','-').Replace('/','_'); $rb = $null
$env:I14_I12_EVIDENCE_DIR = $I12Ev; $env:I14_RECEIPT = Join-Path $EvDir 'i14-setup-receipt.json'; $env:I14_EVID_FILE = Join-Path $EvDir 'i14-evidence.json'
[ordered]@{ record='I14-OWNER-BLOCK'; runId=$RunId; main=$head; packageDigest=$gotPkg; liveDist=$gotDist; apiPid=$lis[0].OwningProcess; startedUtc=(Get-Date).ToUniversalTime().ToString('o') } |
  ConvertTo-Json | Set-Content -LiteralPath (Join-Path $EvDir 'owner-block.json') -Encoding UTF8

# 6) TEK KOŞUM (kurulum = ilk yazma; kapanış finally'de)
& node (Join-Path $Sc 'i14-live-run.js') *> (Join-Path $EvDir 'i14-run.log')
$rc = $LASTEXITCODE

# 7) GO ref tüketim kaydı (yalnız sha256) + ortam temizliği + manifest
$goSha = ([BitConverter]::ToString([Security.Cryptography.SHA256]::Create().ComputeHash([Text.Encoding]::UTF8.GetBytes($GoRef))) -replace '-', '').ToUpperInvariant()
[ordered]@{ record='I14-GOREF-CONSUMED'; runId=$RunId; goRefSha256=$goSha; literalWritten=$false; exitCode=$rc; atUtc=(Get-Date).ToUniversalTime().ToString('o') } |
  ConvertTo-Json | Set-Content -LiteralPath (Join-Path $EvDir 'goref-consumed.json') -Encoding UTF8
foreach ($k in 'AH_DATABASE_URL','I14_LIVE_GO_REF','I14_LIVE_LOGIN_PW') { Remove-Item "Env:$k" -ErrorAction SilentlyContinue }
$GoRef = $null
Get-ChildItem -LiteralPath $EvDir -File | Where-Object Name -ne 'SHA256-MANIFEST.txt' | Sort-Object Name |
  ForEach-Object { "$(Sha $_.FullName)  $($_.Name)" } | Set-Content -LiteralPath (Join-Path $EvDir 'SHA256-MANIFEST.txt') -Encoding ASCII

$col = if ($rc -eq 0) { 'Green' } else { 'Yellow' }
Write-Host "İ14 KOŞUM BİTTİ - RUNID=$RunId · çıkış=$rc (0 PASS · 2 FAIL · 3 ÖLÇÜLEMEYEN · 1 DURDU · 5 KAPANIŞ DOĞRULANMADI)" -ForegroundColor $col
Write-Host "  kanıt dizini: $EvDir"
Write-Host 'Bu satırları CLIENT''a bildirin (GO ref bildirmeyin). CLIENT bağımsız kapanış doğrulamasını koşar.'
