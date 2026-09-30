# ═══════════ H5-URL DAR CANLI KABUL (R03) - OWNER BLOĞU (normal PowerShell; YÖNETİCİ GEREKMEZ) ═══════════
# MODLAR
#   -Mode Preflight  SALT OKUMA: tüm kapılar koşar; GO SORULMAZ, hiçbir dosya/ortam/DB YAZILMAZ.
#   -Mode Run        TEK SEFERLİK canlı koşum: kapılar → GO ref YEREL girilir → GO defteri (yalnız sha256;
#                    tekrar kullanım REDDEDİLİR, kayıt koşumdan ÖNCE) → koşum → kanıt manifesti.
#   -Mode Recover    Yalnız kapanışı tamamlar (bağlantı iptali + kullanıcı/dosya kapanışı). Kabul ÖLÇÜTLERİ
#                    koşulmaz; `-ReceiptFile` zorunlu; GO sorulmaz.
# YAPMAZ: gönderim · public submit · .env/görev/Caddy/tünel/DNS değişikliği · yeniden başlatma · migration.
# SIR   : DB URL, parola ve GO ref yalnız süreç ortamında; ortam değişkenleri `finally` içinde SİLİNİR.
# ÇIKIŞ : node çıkış kodu DEĞİŞTİRİLMEDEN taşınır. Kapıda durma = 90.
#         91 = node BAŞLATILAMADI ya da çıkış kodu alınamadı (eski LASTEXITCODE başarı SAYILMAZ).
#         7  = node 0 döndü ama sonuç kanıtı dosyası YOK (kanıtsız 0 verilmez).
# R03   : node kapılarda doğrulanır (PATH'te tek çalıştırılabilir dosya + `--version` sentinel'li); çağrıdan önce
#         LASTEXITCODE=-999, çağrıdan hemen sonra yakalanır; Int32 değilse ya da sentinel kaldıysa 91.
#         Run/Recover akışları fonksiyondur: öz-test (h5-owner-block-selftest.ps1) GERÇEK fonksiyonları koşar.
param(
  [ValidateSet('Preflight', 'Run', 'Recover')] [string]$Mode = 'Preflight',
  [string]$ReceiptFile = ''
)
$ErrorActionPreference = 'Stop'
# PS 7: yerli komutun sıfır dışı çıkışı istisnaya DÖNMESİN; kod her çağrıda açıkça ölçülür. (PS 5.1'de etkisiz.)
$PSNativeCommandUseErrorActionPreference = $false

$Repo     = 'D:\Development\HUKUK_YAZILIMI\project'
$Gov      = Join-Path $Repo 'project\docs\governance'
$Sc       = Join-Path $Gov 'client-h5-intake-url-r01\scripts'
$Rel      = 'C:\Development\HUKUK_YAZILIMI\HY_W4_RELEASE23\project'
$EnvFile  = Join-Path $Rel 'apps\api\.env'
$LiveDist = Join-Path $Rel 'apps\api\dist\apps\api\src'
$EvRoot   = 'C:\Users\ulastelli\Documents\CLIENT-EVIDENCE-20260911'
$GoLedger = Join-Path $EvRoot 'h5url-goref-ledger.txt'
$Api      = 'http://127.0.0.1:8080/api'

# ---- PİNLER (uyuşmazlık OTOMATİK KABUL EDİLMEZ; blok durur) ----
$ExpLiveDist = 'E28A6863CF109A1A3AE1F53E096D5F5C2037E382EF2D8D3EC87FEE3B827E5134'   # R27 canli dist (D5-SEC; R26 A8B17A38 pin PR #2837 yayinindan SONRA guncellendi)
$ExpEnvSha   = '5C776BBEEE018EA5CC8192378D42D742FD4ABC1B6D0E9A3EA671CF463206908D'   # üç anahtar uygulandıktan sonraki .env
$ExpBaseUrl  = 'https://bilgi.tellihukuk.com'                                         # R05 owner kararı
# Koşumun YÜKLEDİĞİ tüm governance dosyaları (require ağacı ölçüldü; eksik dosya = bütünlük açığı).
$PkgPins = [ordered]@{
  'client-h5-intake-url-r01\scripts\h5-url-live-run.js'         = 'F2D0975DC9F9D148E4C889472FA11AE6A873A6BDF577C36657ED9BCB4FF9C359'
  'client-live-acceptance-i13-r01\scripts\i13-lib.js'           = '59BA7360F270AB66D0A892659A7569AFF1800D65B49415EF5FAD3B84DFEDD385'
  'client-live-acceptance-i12-r01\scripts\i12-live-identity.js' = '9516E462CFFD3B22FD253F556A7F1853C6F021B175075449BD7945CCEF36774F'
  'client-acceptance-runners-i3-r01\scripts\i3-lib.js'          = '56F3788E9F84746CFFEE384D8C18B9B9A28130CC8E2285F9570AB69CC6EE74A3'
  'client-acceptance-harness-r01\scripts\ah-lib.js'             = 'DF882DB7F33A667092F126F01E518C1A8292C8C0B3C4C039BF73D71F3ACCBFD7'
}
$ExpPackage = '48FF5E64821B4BAE3D17390D0CA6E03C3527043D9C2942A5FE0A063D10B904D1'
$SecretEnv  = @('AH_DATABASE_URL', 'AH_PRISMA_ROOT', 'AH_BCRYPT_PATH', 'H5U_LIVE_CONFIRM', 'H5U_RECOVER_CONFIRM', 'H5U_LIVE_GO_REF',
                'H5U_RUNID', 'H5U_MODE', 'H5U_EXPECT_DB', 'H5U_EXPECT_TENANT_SLUG', 'H5U_API_BASE', 'H5U_EXPECT_API',
                'H5U_EXPECT_BASE_URL', 'H5U_LIVE_LOGIN_PW', 'H5U_RECEIPT', 'H5U_EVID_FILE')
$script:LastNodeRc = $null

function Fail([string]$m) { Write-Host "DUR - $m" -ForegroundColor Red; throw "H5URL-DUR: $m" }
function Sha([string]$p) { (Get-FileHash -LiteralPath $p -Algorithm SHA256).Hash.ToUpperInvariant() }
function ShaText([string]$t) { ([BitConverter]::ToString([Security.Cryptography.SHA256]::Create().ComputeHash([Text.Encoding]::UTF8.GetBytes($t))) -replace '-', '').ToUpperInvariant() }
function Digest([System.Collections.Generic.List[string]]$lines) {
  $lines.Sort([StringComparer]::Ordinal); $sb = [System.Text.StringBuilder]::new(); foreach ($l in $lines) { [void]$sb.Append($l) }
  ShaText $sb.ToString()
}
function Invoke-RepoGit { $fwd = $Repo -replace '\\', '/'; & git.exe -c "safe.directory=$fwd" -C $Repo @args }
function EnvValue([string]$key) {
  $hits = @(); foreach ($l in [IO.File]::ReadAllLines($EnvFile)) { if ($l -match ("^\s*" + [regex]::Escape($key) + "\s*=\s*(.*)$")) { $hits += $Matches[1].Trim().Trim('"').Trim("'") } }
  if ($hits.Count -ne 1) { Fail "$key geçiş sayısı $($hits.Count) (1 bekleniyor)" }
  return $hits[0]
}
function Clear-SecretEnv { foreach ($k in $SecretEnv) { Remove-Item "Env:$k" -ErrorAction SilentlyContinue } }
function Read-GoRef { return (Read-Host 'H5-URL canlı GO ref (OWNER-GO-CLIENT-H5URL-YYYYMMDD-RNN)') }

# ---------------------------------------------------------------- NODE DOĞRULAMA
# PATH'teki node çalıştırılabilir dosyasını çözer ve `--version` ile BAŞLATILABİLDİĞİNİ ölçer. Başarısızlık = DUR.
function Resolve-NodeExe {
  $cmd = @(Get-Command -Name 'node' -CommandType Application -ErrorAction SilentlyContinue)
  if ($cmd.Count -lt 1) { Fail 'node çalıştırılabilir dosyası PATH''te bulunamadı' }
  $exe = [string]$cmd[0].Source
  if (-not $exe -or -not (Test-Path -LiteralPath $exe -PathType Leaf)) { Fail "node yolu bir dosya değil: [$exe]" }
  $old = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
  $ver = $null; $launchError = $null
  try {
    $global:LASTEXITCODE = -999
    try { $ver = & $exe --version 2>$null } catch { $launchError = $_.Exception.GetType().Name }
    $vc = $global:LASTEXITCODE
  } finally { $ErrorActionPreference = $old }
  if ($launchError) { Fail "node başlatılamadı (--version): $launchError · $exe" }
  if (-not ($vc -is [int]) -or $vc -eq -999 -or $vc -ne 0) { Fail "node --version çıkış kodu geçersiz: [$vc] · $exe" }
  $v = ("$ver").Trim()
  if ($v -notmatch '^v\d+\.\d+\.\d+$') { Fail "node --version beklenmeyen çıktı · $exe" }
  return [pscustomobject]@{ Exe = $exe; Version = $v }
}

# ---------------------------------------------------------------- SALT OKUMA KAPILARI
function Invoke-ReadOnlyGates {
  # 0) Sürecin davranışını değiştirebilecek ortam değişkenleri: kabul edilmez.
  foreach ($k in 'NODE_OPTIONS', 'NODE_TLS_REJECT_UNAUTHORIZED', 'NODE_EXTRA_CA_CERTS') {
    if (Test-Path "Env:$k") { Fail "$k ortamda tanımlı — koşum davranışı değişebilir; kapatıp yeni pencere açın" }
  }
  # 1) main senkron + temiz
  Invoke-RepoGit fetch -q origin
  $head = (Invoke-RepoGit rev-parse HEAD).Trim(); $orig = (Invoke-RepoGit rev-parse origin/main).Trim()
  if ($head -ne $orig) { Fail "main origin/main ile SENKRON DEĞİL ($head vs $orig)" }
  if (Invoke-RepoGit status --porcelain --untracked-files=no) { Fail 'main checkout''ta takipli KİRLİ dosya var' }
  # 2) yüklenen TÜM dosyalar: tek tek pin + paket digest
  $pk = [System.Collections.Generic.List[string]]::new()
  foreach ($f in $PkgPins.Keys) {
    $p = Join-Path $Gov $f
    if (-not (Test-Path -LiteralPath $p)) { Fail "paket dosyası yok: $f" }
    $h = Sha $p
    if ($h -ne $PkgPins[$f]) { Fail "DOSYA PİNİ uyuşmuyor: $f ($h)" }
    $pk.Add(($f -replace '\\', '/') + [char]0 + $h + "`n")
  }
  $gotPkg = Digest $pk
  if ($gotPkg -ne $ExpPackage) { Fail "PAKET DIGEST uyuşmuyor: $gotPkg" }
  # 3) canlı dist
  $root = (Resolve-Path -LiteralPath $LiveDist).Path.TrimEnd('\'); $dl = [System.Collections.Generic.List[string]]::new(); $n = 0
  foreach ($f in Get-ChildItem -LiteralPath $root -Recurse -File -Force) { $dl.Add($f.FullName.Substring($root.Length + 1).Replace('\', '/') + [char]0 + (Sha $f.FullName) + "`n"); $n++ }
  $gotDist = Digest $dl
  if ($gotDist -ne $ExpLiveDist) { Fail "CANLI DIST uyuşmuyor: $gotDist ($n dosya)" }
  # 4) .env pini + anahtar değeri (değer YAZDIRILMAZ)
  $envSha = Sha $EnvFile
  if ($envSha -ne $ExpEnvSha) { Fail "CANLI .env pini uyuşmuyor: $envSha" }
  $baseUrl = EnvValue 'PUBLIC_INTAKE_BASE_URL'
  if ($baseUrl -cne $ExpBaseUrl) { Fail 'PUBLIC_INTAKE_BASE_URL beklenen owner kararıyla (R05) eşleşmiyor' }
  # 5) tek canlı API + yabancı yürütücü yok + DB kimliği
  $lis = @(Get-NetTCPConnection -State Listen -LocalPort 8080 -ErrorAction SilentlyContinue)
  if ($lis.Count -ne 1) { Fail "8080 dinleyici sayısı $($lis.Count) (1 bekleniyor)" }
  $foreign = @(Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -match 'i1\d-|i3-sink|i3-start-api|f04-|h5-url-' })
  if ($foreign.Count -gt 0) { Fail "başka kabul süreci çalışıyor: $($foreign.ProcessId -join ',')" }
  $launcher = [IO.File]::ReadAllLines('C:\Ops\hukuk\logs\api\launcher.log') | Where-Object { $_ -match 'db identity ok' } | Select-Object -Last 1
  if ($launcher -notmatch 'host=127\.0\.0\.1 port=5432 db=hukuk_db') { Fail 'canlı API DB kimliği beklenmedik' }
  # 6) node: tek çalıştırılabilir dosya ve başlatılabilir (R03)
  $node = Resolve-NodeExe
  # 7) dış zincir BİLGİSİ (kapı değil — yoksa dış ölçütler ÖLÇÜLEMEYEN olur)
  $caddy = @(Get-NetTCPConnection -State Listen -LocalPort 8081 -ErrorAction SilentlyContinue | Where-Object { $_.LocalAddress -eq '127.0.0.1' })
  $cfd = @(Get-Service -Name 'Cloudflared' -ErrorAction SilentlyContinue | Where-Object { $_.Status -eq 'Running' })
  return [ordered]@{ head = $head; pkg = $gotPkg; dist = $gotDist; distFiles = $n; envSha = $envSha; apiPid = $lis[0].OwningProcess
                     baseHost = ([uri]$baseUrl).Authority; caddyLoopback = ($caddy.Count -eq 1); cloudflaredRunning = ($cfd.Count -eq 1)
                     nodeExe = $node.Exe; nodeVersion = $node.Version }
}

function Set-RunEnv([string]$runId, [string]$evDir) {
  $env:AH_DATABASE_URL = EnvValue 'DATABASE_URL'
  $env:AH_PRISMA_ROOT = Join-Path $Rel 'node_modules\.pnpm\@prisma+client@5.22.0_prisma@5.22.0\node_modules\@prisma\client'
  $env:AH_BCRYPT_PATH = Join-Path $Rel 'node_modules\.pnpm\bcrypt@5.1.1\node_modules\bcrypt'
  $env:H5U_RUNID = $runId; $env:H5U_EXPECT_DB = 'hukuk_db'; $env:H5U_API_BASE = $Api; $env:H5U_EXPECT_API = $Api
  $env:H5U_EXPECT_BASE_URL = $ExpBaseUrl
  $rb = New-Object byte[] 18; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($rb)
  $env:H5U_LIVE_LOGIN_PW = 'H5U!' + [Convert]::ToBase64String($rb).TrimEnd('=').Replace('+', '-').Replace('/', '_'); $rb = $null
  $env:H5U_EVID_FILE = Join-Path $evDir 'h5url-evidence.json'
}

# Gerçek node çağrısı. Başlatma hatasında eski LASTEXITCODE başarı SAYILMAZ: çağrıdan önce -999, hemen sonra yakalanır.
function Invoke-Node([string]$exe, [string]$logFile) {
  $old = $ErrorActionPreference; $ErrorActionPreference = 'Continue'   # PS 5.1: yerli stderr NativeCommandError'a dönmesin
  $rc = -999; $launchError = $null
  try {
    $global:LASTEXITCODE = -999
    try { & $exe (Join-Path $Sc 'h5-url-live-run.js') *> $logFile } catch { $launchError = $_.Exception.GetType().Name }
    $rc = $global:LASTEXITCODE
  } finally { $ErrorActionPreference = $old }
  if ($launchError) { Write-Host "DUR - node BAŞLATILAMADI ($launchError) · çıkış 91" -ForegroundColor Red; $script:LastNodeRc = 91; return 91 }
  if (-not ($rc -is [int]) -or $rc -eq -999) { Write-Host "DUR - node çıkış kodu ALINAMADI: [$rc] · çıkış 91" -ForegroundColor Red; $script:LastNodeRc = 91; return 91 }
  $script:LastNodeRc = [int]$rc
  return [int]$rc
}
# node 0 döndüyse sonuç kanıtı dosyası VAR olmalı; yoksa 7. Diğer kodlar değişmeden geçer.
function Complete-NodeRc([object]$rc, [string]$evidFile) {
  if (-not ($rc -is [int])) { return 91 }
  if ($rc -eq 0 -and -not (Test-Path -LiteralPath $evidFile -PathType Leaf)) { Write-Host 'DUR - node 0 döndü ama sonuç kanıtı YOK · çıkış 7' -ForegroundColor Red; return 7 }
  return $rc
}
# Kanıt dosyası node çağrısından ÖNCE var olmamalı: eski bir dosya yeni koşumun kanıtı SAYILMAZ (silinmez; durulur).
function Assert-FreshEvidence([string]$evidFile) {
  if (Test-Path -LiteralPath $evidFile) { Fail "sonuç kanıtı dosyası koşumdan ÖNCE zaten var: $evidFile" }
}
function Write-Manifest([string]$evDir) {
  Get-ChildItem -LiteralPath $evDir -File | Where-Object Name -ne 'SHA256-MANIFEST.txt' | Sort-Object Name |
    ForEach-Object { "$(Sha $_.FullName)  $($_.Name)" } | Set-Content -LiteralPath (Join-Path $evDir 'SHA256-MANIFEST.txt') -Encoding ASCII
}

# ---------------------------------------------------------------- RUN (tek seferlik)
function Invoke-RunMode($g) {
  $rc = 90
  $GoRef = Read-GoRef
  if ($GoRef -cnotmatch '^OWNER-GO-CLIENT-H5URL-\d{8}-R\d{2}$') { Fail 'GO ref BİÇİMİ hatalı' }
  $goSha = ShaText $GoRef
  # Tekrar kullanım: defter + önceki tüketim kayıtları + repo literali. Hiçbiri eşleşmemeli.
  if ((Test-Path -LiteralPath $GoLedger) -and (Select-String -LiteralPath $GoLedger -SimpleMatch -Pattern $goSha -Quiet)) { Fail 'GO ref DAHA ÖNCE KULLANILDI (defter)' }
  $prior = @(Get-ChildItem -LiteralPath $EvRoot -Recurse -File -Filter 'goref-consumed.json' -ErrorAction SilentlyContinue |
    Where-Object { (Get-Content -Raw -LiteralPath $_.FullName) -match [regex]::Escape($goSha) })
  if ($prior.Count -gt 0) { Fail 'GO ref DAHA ÖNCE KULLANILDI (tüketim kaydı)' }
  $old = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
  $global:LASTEXITCODE = -999
  Invoke-RepoGit grep -q -F -- $GoRef | Out-Null; $gg = $global:LASTEXITCODE; $ErrorActionPreference = $old
  if ($gg -eq 0) { Fail 'GO ref repoda geçiyor — TÜKETİLMİŞ' }
  if (-not ($gg -is [int]) -or $gg -ne 1) { Fail "tüketim kontrolü yapılamadı (git grep çıkış [$gg])" }

  $RunId = -join ((1..8) | ForEach-Object { '{0:x}' -f (Get-Random -Maximum 16) })
  $EvDir = Join-Path $EvRoot ("h5url-live-{0}-{1}" -f $RunId, (Get-Date -Format 'yyyyMMdd-HHmmss'))
  New-Item -ItemType Directory -Force -Path $EvDir | Out-Null
  # GO defterine koşumdan ÖNCE yazılır: koşum yarıda kalsa da GO TÜKETİLMİŞ sayılır.
  Add-Content -LiteralPath $GoLedger -Value ("{0}  runId={1}  {2}" -f $goSha, $RunId, (Get-Date).ToUniversalTime().ToString('o')) -Encoding ASCII
  [ordered]@{ record = 'H5URL-OWNER-BLOCK'; revision = 'R03'; mode = 'Run'; runId = $RunId; main = $g.head; packageDigest = $g.pkg; liveDist = $g.dist
              envSha = $g.envSha; apiPid = $g.apiPid; baseUrlHost = $g.baseHost; caddyLoopback = $g.caddyLoopback; cloudflaredRunning = $g.cloudflaredRunning
              nodeExe = $g.nodeExe; nodeVersion = $g.nodeVersion; startedUtc = (Get-Date).ToUniversalTime().ToString('o') } |
    ConvertTo-Json | Set-Content -LiteralPath (Join-Path $EvDir 'owner-block.json') -Encoding UTF8
  try {
    Set-RunEnv $RunId $EvDir
    $env:H5U_MODE = 'run'; $env:H5U_LIVE_CONFIRM = '1'; $env:H5U_LIVE_GO_REF = $GoRef
    $env:H5U_EXPECT_TENANT_SLUG = "ah-$RunId"; $env:H5U_RECEIPT = Join-Path $EvDir 'h5url-setup-receipt.json'
    $evid = $env:H5U_EVID_FILE
    Assert-FreshEvidence $evid
    $rc = Invoke-Node $g.nodeExe (Join-Path $EvDir 'h5url-run.log')
    $rc = Complete-NodeRc $rc $evid
  }
  finally {
    Clear-SecretEnv
    [ordered]@{ record = 'H5URL-GOREF-CONSUMED'; runId = $RunId; goRefSha256 = $goSha; literalWritten = $false; exitCode = $rc
                atUtc = (Get-Date).ToUniversalTime().ToString('o') } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $EvDir 'goref-consumed.json') -Encoding UTF8
    $GoRef = $null
    Write-Manifest $EvDir
  }
  Write-Host "H5-URL KOŞUM BİTTİ - RUNID=$RunId · çıkış=$rc" -ForegroundColor $(if ($rc -eq 0) { 'Green' } else { 'Yellow' })
  Write-Host '  0 PASS · 2 FAIL · 3 ÖLÇÜLEMEYEN · 1 DURDU · 4 KİMLİK REDDİ · 7 KANIT YAZILAMADI · 5 KAPANIŞ DOĞRULANMADI · 6 İPTAL DOĞRULANMADI · 91 NODE BAŞLATILAMADI'
  if ($rc -eq 5 -or $rc -eq 6) { Write-Host '  KURTARMA GEREKLİ: bu bloğu -Mode Recover -ReceiptFile <makbuz> ile koşun. Kabulü TEKRARLAMAYIN.' -ForegroundColor Yellow }
  if ($rc -eq 91) { Write-Host '  Node başlamadı: canlı DB''ye yazılmış olabilecek bir şey YOK varsayılmaz; makbuz dosyası varsa CLIENT''a bildirin.' -ForegroundColor Yellow }
  Write-Host "  kanıt dizini: $EvDir"
  Write-Host '  Bu satırları CLIENT''a bildirin (GO ref ve değer bildirmeyin).'
  return $rc
}

# ---------------------------------------------------------------- RECOVER (yalnız kapanış)
function Invoke-RecoverMode($g, [string]$receiptPath) {
  $rc = 90
  if (-not $receiptPath -or -not (Test-Path -LiteralPath $receiptPath -PathType Leaf)) { Fail 'Recover için -ReceiptFile <makbuz yolu> gerekli' }
  $rcpt = Get-Content -Raw -LiteralPath $receiptPath | ConvertFrom-Json
  if ($rcpt.record -ne 'H5-URL-SETUP-RECEIPT' -or $rcpt.runId -notmatch '^[0-9a-f]{8}$') { Fail 'makbuz biçimi tanınmadı' }
  $EvDir = Join-Path (Split-Path -Parent $receiptPath) ("recover-{0}-{1}" -f (Get-Date -Format 'yyyyMMdd-HHmmss'), [Guid]::NewGuid().ToString('N').Substring(0, 6))
  New-Item -ItemType Directory -Force -Path $EvDir | Out-Null
  try {
    Set-RunEnv $rcpt.runId $EvDir
    $env:H5U_MODE = 'recover'; $env:H5U_RECOVER_CONFIRM = '1'; $env:H5U_RECEIPT = $receiptPath
    $evid = $env:H5U_EVID_FILE
    Assert-FreshEvidence $evid
    $rc = Invoke-Node $g.nodeExe (Join-Path $EvDir 'h5url-recover.log')
    $rc = Complete-NodeRc $rc $evid
  }
  finally { Clear-SecretEnv; Write-Manifest $EvDir }
  Write-Host "H5-URL KURTARMA BİTTİ - RUNID=$($rcpt.runId) · çıkış=$rc (0 kapanış doğrulandı · 5/6 hâlâ doğrulanmadı · 4 kimlik reddi · 7 kanıt yazılamadı · 91 node başlatılamadı)" -ForegroundColor $(if ($rc -eq 0) { 'Green' } else { 'Yellow' })
  Write-Host "  kanıt dizini: $EvDir"
  return $rc
}

# ================================================================ AKIŞ
# Öz-test bu dosyanın yalnız fonksiyonlarını AST ile yükler; aşağıdaki akış öz-testte ÇALIŞMAZ.
$rc = 90
Clear-SecretEnv   # önceki pencereden kalıntı varsa
try {
  $g = Invoke-ReadOnlyGates

  if ($Mode -eq 'Preflight') {
    Write-Host ('PREFLIGHT GEÇTİ (salt okuma; hiçbir şey yazılmadı) · main={0} · paket={1} · dist={2} ({3} dosya) · .env={4} · API pid={5} · base host={6} · node={7}' -f `
      $g.head.Substring(0, 8), $g.pkg.Substring(0, 16), $g.dist.Substring(0, 16), $g.distFiles, $g.envSha.Substring(0, 16), $g.apiPid, $g.baseHost, $g.nodeVersion) -ForegroundColor Green
    Write-Host ('  dış zincir: Caddy 127.0.0.1:8081={0} · Cloudflared servisi={1}  (yoksa dış ölçütler ÖLÇÜLEMEYEN olur)' -f $g.caddyLoopback, $g.cloudflaredRunning)
    $rc = 0
  }
  elseif ($Mode -eq 'Run') { $rc = Invoke-RunMode $g }
  else { $rc = Invoke-RecoverMode $g $ReceiptFile }
}
catch {
  if ($_.Exception.Message -notlike 'H5URL-DUR:*') { Write-Host "DUR - beklenmeyen hata: $($_.Exception.Message)" -ForegroundColor Red }
  # node koştuysa ve sıfır dışı döndüyse o kod korunur; aksi halde 90 (kanıtsız başarı YOK).
  $rc = if (($script:LastNodeRc -is [int]) -and $script:LastNodeRc -ne 0) { $script:LastNodeRc } else { 90 }
}
finally { Clear-SecretEnv }
if (-not ($rc -is [int])) { $rc = 91 }
exit $rc
