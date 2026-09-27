# ═══════════ H5-URL DAR CANLI KABUL (R02) - OWNER BLOĞU (normal PowerShell; YÖNETİCİ GEREKMEZ) ═══════════
# MODLAR
#   -Mode Preflight  SALT OKUMA: tüm kapılar koşar; GO SORULMAZ, hiçbir dosya/ortam/DB YAZILMAZ.
#   -Mode Run        TEK SEFERLİK canlı koşum: kapılar → GO ref YEREL girilir → GO defteri (yalnız sha256;
#                    tekrar kullanım REDDEDİLİR, kayıt koşumdan ÖNCE) → koşum → kanıt manifesti.
#   -Mode Recover    Yalnız kapanışı tamamlar (bağlantı iptali + kullanıcı/dosya kapanışı). Kabul ÖLÇÜTLERİ
#                    koşulmaz; `-ReceiptFile` zorunlu; GO sorulmaz.
# YAPMAZ: gönderim · public submit · .env/görev/Caddy/tünel/DNS değişikliği · yeniden başlatma · migration.
# SIR   : DB URL, parola ve GO ref yalnız süreç ortamında; ortam değişkenleri `finally` içinde SİLİNİR.
# ÇIKIŞ : node çıkış kodu DEĞİŞTİRİLMEDEN taşınır. Kapıda durma = 90.
param(
  [ValidateSet('Preflight', 'Run', 'Recover')] [string]$Mode = 'Preflight',
  [string]$ReceiptFile = ''
)
$ErrorActionPreference = 'Stop'

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
$ExpLiveDist = 'A8B17A38327975C71DDAE82FE33D1E97CB8B339FB1E35D1828FCF8D0CEB053A0'   # R26 canlı dist
$ExpEnvSha   = '5C776BBEEE018EA5CC8192378D42D742FD4ABC1B6D0E9A3EA671CF463206908D'   # üç anahtar uygulandıktan sonraki .env
$ExpBaseUrl  = 'https://bilgi.tellihukuk.com'                                         # R05 owner kararı
# Koşumun YÜKLEDİĞİ tüm governance dosyaları (require ağacı ölçüldü; eksik dosya = bütünlük açığı).
$PkgPins = [ordered]@{
  'client-h5-intake-url-r01\scripts\h5-url-live-run.js'         = '561D202DB3136B2BD956B8B68AA087B570BAAD99F7635B6B624CA55DF1158943'
  'client-live-acceptance-i13-r01\scripts\i13-lib.js'           = '59BA7360F270AB66D0A892659A7569AFF1800D65B49415EF5FAD3B84DFEDD385'
  'client-live-acceptance-i12-r01\scripts\i12-live-identity.js' = '9516E462CFFD3B22FD253F556A7F1853C6F021B175075449BD7945CCEF36774F'
  'client-acceptance-runners-i3-r01\scripts\i3-lib.js'          = '56F3788E9F84746CFFEE384D8C18B9B9A28130CC8E2285F9570AB69CC6EE74A3'
  'client-acceptance-harness-r01\scripts\ah-lib.js'             = 'DF882DB7F33A667092F126F01E518C1A8292C8C0B3C4C039BF73D71F3ACCBFD7'
}
$ExpPackage = '2A96C424817DFECC29CCF33A512FC64068374DFE68F8EB98D2BD86A74E4C1ECA'
$SecretEnv  = @('AH_DATABASE_URL', 'AH_PRISMA_ROOT', 'AH_BCRYPT_PATH', 'H5U_LIVE_CONFIRM', 'H5U_RECOVER_CONFIRM', 'H5U_LIVE_GO_REF',
                'H5U_RUNID', 'H5U_MODE', 'H5U_EXPECT_DB', 'H5U_EXPECT_TENANT_SLUG', 'H5U_API_BASE', 'H5U_EXPECT_API',
                'H5U_EXPECT_BASE_URL', 'H5U_LIVE_LOGIN_PW', 'H5U_RECEIPT', 'H5U_EVID_FILE')

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
  # 6) dış zincir BİLGİSİ (kapı değil — yoksa dış ölçütler ÖLÇÜLEMEYEN olur)
  $caddy = @(Get-NetTCPConnection -State Listen -LocalPort 8081 -ErrorAction SilentlyContinue | Where-Object { $_.LocalAddress -eq '127.0.0.1' })
  $cfd = @(Get-Service -Name 'Cloudflared' -ErrorAction SilentlyContinue | Where-Object { $_.Status -eq 'Running' })
  return [ordered]@{ head = $head; pkg = $gotPkg; dist = $gotDist; distFiles = $n; envSha = $envSha; apiPid = $lis[0].OwningProcess
                     baseHost = ([uri]$baseUrl).Authority; caddyLoopback = ($caddy.Count -eq 1); cloudflaredRunning = ($cfd.Count -eq 1) }
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
function Invoke-Node([string]$logFile) {
  # PS 5.1: EAP=Stop altında yerli stderr NativeCommandError'a döner; koşum süresince Continue.
  $old = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
  try { & node (Join-Path $Sc 'h5-url-live-run.js') *> $logFile; return $LASTEXITCODE } finally { $ErrorActionPreference = $old }
}
function Write-Manifest([string]$evDir) {
  Get-ChildItem -LiteralPath $evDir -File | Where-Object Name -ne 'SHA256-MANIFEST.txt' | Sort-Object Name |
    ForEach-Object { "$(Sha $_.FullName)  $($_.Name)" } | Set-Content -LiteralPath (Join-Path $evDir 'SHA256-MANIFEST.txt') -Encoding ASCII
}

# ================================================================ AKIŞ
$rc = 90
Clear-SecretEnv   # önceki pencereden kalıntı varsa
try {
  $g = Invoke-ReadOnlyGates

  if ($Mode -eq 'Preflight') {
    Write-Host ('PREFLIGHT GEÇTİ (salt okuma; hiçbir şey yazılmadı) · main={0} · paket={1} · dist={2} ({3} dosya) · .env={4} · API pid={5} · base host={6}' -f `
      $g.head.Substring(0, 8), $g.pkg.Substring(0, 16), $g.dist.Substring(0, 16), $g.distFiles, $g.envSha.Substring(0, 16), $g.apiPid, $g.baseHost) -ForegroundColor Green
    Write-Host ('  dış zincir: Caddy 127.0.0.1:8081={0} · Cloudflared servisi={1}  (yoksa dış ölçütler ÖLÇÜLEMEYEN olur)' -f $g.caddyLoopback, $g.cloudflaredRunning)
    $rc = 0
  }
  elseif ($Mode -eq 'Run') {
    $GoRef = Read-Host 'H5-URL canlı GO ref (OWNER-GO-CLIENT-H5URL-YYYYMMDD-RNN)'
    if ($GoRef -cnotmatch '^OWNER-GO-CLIENT-H5URL-\d{8}-R\d{2}$') { Fail 'GO ref BİÇİMİ hatalı' }
    $goSha = ShaText $GoRef
    # Tekrar kullanım: defter + önceki tüketim kayıtları + repo literali. Hiçbiri eşleşmemeli.
    if ((Test-Path -LiteralPath $GoLedger) -and (Select-String -LiteralPath $GoLedger -SimpleMatch -Pattern $goSha -Quiet)) { Fail 'GO ref DAHA ÖNCE KULLANILDI (defter)' }
    $prior = @(Get-ChildItem -LiteralPath $EvRoot -Recurse -File -Filter 'goref-consumed.json' -ErrorAction SilentlyContinue |
      Where-Object { (Get-Content -Raw -LiteralPath $_.FullName) -match [regex]::Escape($goSha) })
    if ($prior.Count -gt 0) { Fail 'GO ref DAHA ÖNCE KULLANILDI (tüketim kaydı)' }
    $old = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
    Invoke-RepoGit grep -q -F -- $GoRef | Out-Null; $gg = $LASTEXITCODE; $ErrorActionPreference = $old
    if ($gg -eq 0) { Fail 'GO ref repoda geçiyor — TÜKETİLMİŞ' }
    if ($gg -ne 1) { Fail "tüketim kontrolü yapılamadı (git grep exit $gg)" }

    $RunId = -join ((1..8) | ForEach-Object { '{0:x}' -f (Get-Random -Maximum 16) })
    $EvDir = Join-Path $EvRoot ("h5url-live-{0}-{1}" -f $RunId, (Get-Date -Format 'yyyyMMdd-HHmmss'))
    New-Item -ItemType Directory -Force -Path $EvDir | Out-Null
    # GO defterine koşumdan ÖNCE yazılır: koşum yarıda kalsa da GO TÜKETİLMİŞ sayılır.
    Add-Content -LiteralPath $GoLedger -Value ("{0}  runId={1}  {2}" -f $goSha, $RunId, (Get-Date).ToUniversalTime().ToString('o')) -Encoding ASCII
    [ordered]@{ record = 'H5URL-OWNER-BLOCK'; revision = 'R02'; mode = 'Run'; runId = $RunId; main = $g.head; packageDigest = $g.pkg; liveDist = $g.dist
                envSha = $g.envSha; apiPid = $g.apiPid; baseUrlHost = $g.baseHost; caddyLoopback = $g.caddyLoopback; cloudflaredRunning = $g.cloudflaredRunning
                startedUtc = (Get-Date).ToUniversalTime().ToString('o') } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $EvDir 'owner-block.json') -Encoding UTF8
    try {
      Set-RunEnv $RunId $EvDir
      $env:H5U_MODE = 'run'; $env:H5U_LIVE_CONFIRM = '1'; $env:H5U_LIVE_GO_REF = $GoRef
      $env:H5U_EXPECT_TENANT_SLUG = "ah-$RunId"; $env:H5U_RECEIPT = Join-Path $EvDir 'h5url-setup-receipt.json'
      $rc = Invoke-Node (Join-Path $EvDir 'h5url-run.log')
    }
    finally {
      Clear-SecretEnv
      [ordered]@{ record = 'H5URL-GOREF-CONSUMED'; runId = $RunId; goRefSha256 = $goSha; literalWritten = $false; exitCode = $rc
                  atUtc = (Get-Date).ToUniversalTime().ToString('o') } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $EvDir 'goref-consumed.json') -Encoding UTF8
      $GoRef = $null
      Write-Manifest $EvDir
    }
    Write-Host "H5-URL KOŞUM BİTTİ - RUNID=$RunId · çıkış=$rc" -ForegroundColor $(if ($rc -eq 0) { 'Green' } else { 'Yellow' })
    Write-Host '  0 PASS · 2 FAIL · 3 ÖLÇÜLEMEYEN · 1 DURDU · 4 KİMLİK REDDİ · 5 KULLANICI/DOSYA KAPANIŞI DOĞRULANMADI · 6 BAĞLANTI İPTALİ DOĞRULANMADI'
    if ($rc -eq 5 -or $rc -eq 6) { Write-Host '  KURTARMA GEREKLİ: bu bloğu -Mode Recover -ReceiptFile <makbuz> ile koşun. Kabulü TEKRARLAMAYIN.' -ForegroundColor Yellow }
    Write-Host "  kanıt dizini: $EvDir"
    Write-Host '  Bu satırları CLIENT''a bildirin (GO ref ve değer bildirmeyin).'
  }
  else {
    if (-not $ReceiptFile -or -not (Test-Path -LiteralPath $ReceiptFile)) { Fail 'Recover için -ReceiptFile <makbuz yolu> gerekli' }
    $rcpt = Get-Content -Raw -LiteralPath $ReceiptFile | ConvertFrom-Json
    if ($rcpt.record -ne 'H5-URL-SETUP-RECEIPT' -or $rcpt.runId -notmatch '^[0-9a-f]{8}$') { Fail 'makbuz biçimi tanınmadı' }
    $EvDir = Join-Path (Split-Path -Parent $ReceiptFile) ("recover-{0}" -f (Get-Date -Format 'yyyyMMdd-HHmmss'))
    New-Item -ItemType Directory -Force -Path $EvDir | Out-Null
    try {
      Set-RunEnv $rcpt.runId $EvDir
      $env:H5U_MODE = 'recover'; $env:H5U_RECOVER_CONFIRM = '1'; $env:H5U_RECEIPT = $ReceiptFile
      $rc = Invoke-Node (Join-Path $EvDir 'h5url-recover.log')
    }
    finally { Clear-SecretEnv; Write-Manifest $EvDir }
    Write-Host "H5-URL KURTARMA BİTTİ - RUNID=$($rcpt.runId) · çıkış=$rc (0 kapanış doğrulandı · 5/6 hâlâ doğrulanmadı · 4 kimlik reddi)" -ForegroundColor $(if ($rc -eq 0) { 'Green' } else { 'Yellow' })
    Write-Host "  kanıt dizini: $EvDir"
  }
}
catch {
  if ($_.Exception.Message -notlike 'H5URL-DUR:*') { Write-Host "DUR - beklenmeyen hata: $($_.Exception.Message)" -ForegroundColor Red }
  if ($rc -eq 90 -or $rc -eq 0) { $rc = 90 }
}
finally { Clear-SecretEnv }
exit $rc
