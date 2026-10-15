# CLIENT DD (K) — AYRI SINAMA BÜROSU: OWNER BLOĞU (R01)
#
# Owner kararı Ek 72 madde 2 (2026-10-15): HAZIRLIK. Canlı koşum ayrı owner GO'su ister (yayın penceresinde, runbook §9 S-0 / S-9).
# Owner'ın bağımsız PowerShell penceresinde (uygulama Terminal paneli ya da kayıt tutan oturum DEĞİL) çalışır.
#
# KİPLER
#   -Mode Preflight  SALT OKUMA: bütün kapılar; GO sorulmaz; veritabanına bağlanılmaz; kanıt / defter yazılmaz.
#   -Mode Kur        Kapılar → transkripsiyon ilkesi kapalı + bağımsız pencere teyidi (E) → canlı yazım listesi + "EVET" → GO ref
#                    (tek kullanım; defterde ve kanıtta yalnız özeti) → koşucu `kur`: Tenant · User (USER) · Lawyer (PARTNER, bağlı) ·
#                    Client (PERSON, kimliksiz) — tek işlemde DÖRT satır. Personel giriş bilgisini (kurum kısa adı · e-posta · tek kullanımlık
#                    parola) KOŞUCU yalnız yerel konsola (CONOUT$) çizer; blok parolayı EKRANA BASMAZ; dosyaya / kayda / iletiye YAZILMAZ.
#                    Owner Enter'a basınca ekran + kaydırma arabelleği temizlenir; pencere kapatılır.
#   -Mode Kapat      -ReceiptFile <makbuz> (yalnız bu bloğun Kur kanıt dizinindeki makbuz) : kapılar → "EVET" → GO ref → koşucu `kapat`:
#                    sentetik kullanıcı pasif + tokenVersion +1.
#
# ÇIKIŞ: koşucunun çıkış kodu (0 TAMAM · 2 kullanım · 3 onay / GO · 4 kimlik / çakışma / konsol reddi · 5 kapanış doğrulanamadı ·
#        6 kurulum geri okuması · 7 kanıt / makbuz · 8 giriş bilgisi çizilemedi · 1 beklenmeyen) · 90 blok kapısında DUR (koşucu çağrılmadı)
#        · 91 node başlatılamadı. Koşucu çalıştıktan SONRA blokta hata olursa koşucunun çıkış kodu döner (90 DEĞİL).
param(
  [ValidateSet('Preflight', 'Kur', 'Kapat')] [string]$Mode = 'Preflight',
  [string]$ReceiptFile = ''
)
$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $false

$Repo     = 'D:\Development\HUKUK_YAZILIMI\project'
$Gov      = Join-Path $Repo 'project\docs\governance'
$Sc       = Join-Path $Gov 'client-dd-k-sinama-burosu-r01\scripts'
$Rel      = 'C:\Development\HUKUK_YAZILIMI\HY_W4_RELEASE23\project'
$EnvFile  = Join-Path $Rel 'apps\api\.env'
$Launcher = 'C:\Ops\hukuk\logs\api\launcher.log'
$EvRoot   = Join-Path $env:USERPROFILE 'Documents\CLIENT-EVIDENCE-20260911'
$GoLedger = Join-Path $EvRoot 'client-ddk-goref-ledger.txt'

# ---- PİNLER (uyuşmazlık OTOMATİK KABUL EDİLMEZ; blok durur) ----
$ExpEnvSha = '5C776BBEEE018EA5CC8192378D42D742FD4ABC1B6D0E9A3EA671CF463206908D'   # canlı .env (D-6 / D-7 ile aynı pin)
# Koşucunun YÜKLEDİĞİ tüm governance dosyaları (require ağacı).
$PkgPins = [ordered]@{
  'client-dd-k-sinama-burosu-r01\scripts\ddk-setup-run.js'                          = '6D0EB0D3094CEAA451399F8BC4EF543B057DA08133367152B8C684A210D0F07F'
  'client-acceptance-harness-r01\scripts\ah-lib.js'                                  = 'DF882DB7F33A667092F126F01E518C1A8292C8C0B3C4C039BF73D71F3ACCBFD7'
  'client-live-acceptance-i12-r01\scripts\i12-live-identity.js'                      = '9516E462CFFD3B22FD253F556A7F1853C6F021B175075449BD7945CCEF36774F'
  'client-acceptance-runners-i3-r01\scripts\i3-lib.js'                               = '56F3788E9F84746CFFEE384D8C18B9B9A28130CC8E2285F9570AB69CC6EE74A3'
  'client-extacc-intake-chain-r01\scripts\extacc-display.js'                         = 'F257188DF66C429472C214D38D965C1E6F5A2EA490D348369AC68C5DC6F26867'
  'client-extacc-intake-chain-r01\scripts\vendor\qrcode-generator-1.4.4\qrcode.js'   = '18AE399F81182BC9DE916E9C77B195DF20CC58D6F2D55A62B085A299F1BF1780'
}
$ExpPackage = '6689F3462994A441B26C6E4B23F9F3826917BF86003E58412553E261E0AEBDD4'
$SecretEnv = @('AH_DATABASE_URL', 'AH_PRISMA_ROOT', 'AH_BCRYPT_PATH', 'DDK_MODE', 'DDK_RUNID', 'DDK_EXPECT_DB', 'DDK_LIVE_CONFIRM',
               'DDK_LIVE_GO_REF', 'DDK_LOGIN_PW', 'DDK_RECEIPT', 'DDK_EVID_FILE', 'DDK_DISPLAY')
$script:LastNodeRc = $null

function Fail([string]$m) { Write-Host "DUR - $m" -ForegroundColor Red; throw "CLIENT-DDK-DUR: $m" }
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
function Read-Answer([string]$q) { return (Read-Host $q) }
function Read-GoRef { return (Read-Host 'DD-K canlı GO ref (OWNER-GO-CLIENT-DDK-YYYYMMDD-RNN)') }
function Clear-OwnerScreen { try { [Console]::Clear() } catch { }; try { [Console]::Write([char]27 + '[3J') } catch { } }
function Assert-LocalConsole {
  if ($Host.Name -ne 'ConsoleHost') { Fail "konsol host'u değil ($($Host.Name)) — bağımsız bir PowerShell penceresi kullanın" }
  if ([Console]::IsOutputRedirected) { Fail 'konsol çıktısı yönlendirilmiş — giriş bilgisi gösterilemez' }
}
# PowerShell transkripsiyon ilkesi (GPO; Windows PowerShell ve PowerShell 7 anahtarları) açıksa giriş bilgisi gösterilmez. Elle başlatılmış Start-Transcript koddan ölçülemez → owner teyidi (E).
function Get-TranscriptionFlags {
  $vals = @()
  foreach ($k in 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\PowerShell\Transcription', 'HKCU:\SOFTWARE\Policies\Microsoft\Windows\PowerShell\Transcription',
                 'HKLM:\SOFTWARE\WOW6432Node\Policies\Microsoft\Windows\PowerShell\Transcription',
                 'HKLM:\SOFTWARE\Policies\Microsoft\PowerShellCore\Transcription', 'HKCU:\SOFTWARE\Policies\Microsoft\PowerShellCore\Transcription') {
    $v = $null; try { $v = (Get-ItemProperty -LiteralPath $k -Name 'EnableTranscripting' -ErrorAction Stop).EnableTranscripting } catch { $v = $null }
    if ($null -ne $v) { $vals += [int]$v }
  }
  return ,$vals
}
function Assert-NoTranscription {
  $f = @(Get-TranscriptionFlags)
  if (@($f | Where-Object { $_ -ne 0 }).Count -gt 0) { Fail 'PowerShell transkripsiyon ilkesi AÇIK — giriş bilgisi gösterilemez (koşucu çağrılmadı)' }
}
function Resolve-NodeExe {
  $cmd = @(Get-Command -Name 'node' -CommandType Application -ErrorAction SilentlyContinue)
  if ($cmd.Count -lt 1) { Fail 'node çalıştırılabilir dosyası PATH''te bulunamadı' }
  return [string]$cmd[0].Source
}

# ---------------------------------------------------------------- SALT OKUMA KAPILARI
function Invoke-ReadOnlyGates {
  foreach ($k in 'NODE_OPTIONS', 'NODE_TLS_REJECT_UNAUTHORIZED', 'NODE_EXTRA_CA_CERTS') {
    if (Test-Path "Env:$k") { Fail "$k ortamda tanımlı — koşum davranışı değişebilir; kapatıp yeni pencere açın" }
  }
  Invoke-RepoGit fetch -q origin
  $head = (Invoke-RepoGit rev-parse HEAD).Trim(); $orig = (Invoke-RepoGit rev-parse origin/main).Trim()
  if ($head -ne $orig) { Fail "main origin/main ile SENKRON DEĞİL ($head vs $orig)" }
  if (Invoke-RepoGit status --porcelain --untracked-files=no) { Fail 'main checkout''ta takipli KİRLİ dosya var' }
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
  if (-not (Test-Path -LiteralPath $EnvFile)) { Fail 'canlı .env bulunamadı' }
  $envSha = Sha $EnvFile
  if ($envSha -ne $ExpEnvSha) { Fail "CANLI .env pini uyuşmuyor: $envSha" }
  if (-not (Test-Path -LiteralPath $Launcher)) { Fail 'başlatıcı günlüğü bulunamadı' }
  $line = [IO.File]::ReadAllLines($Launcher) | Where-Object { $_ -match 'db identity ok' } | Select-Object -Last 1
  if ($line -notmatch 'host=127\.0\.0\.1 port=5432 db=hukuk_db') { Fail 'canlı API DB kimliği beklenmedik' }
  $dbUrl = EnvValue 'DATABASE_URL'
  try { $u = [uri]$dbUrl } catch { Fail 'DATABASE_URL ayrıştırılamadı' }
  if ($u.Host -ne '127.0.0.1' -or $u.Port -ne 5432 -or $u.AbsolutePath.TrimStart('/') -ne 'hukuk_db') { Fail 'canlı DATABASE_URL kimliği beklenen 127.0.0.1:5432/hukuk_db değil' }
  $foreign = @(Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -match 'i1\d-|i3-sink|i3-start-api|f04-|h5-url-|extacc-|d4-portal-|d5-portal-|d6-portal-|d7-portal-|d8-staff-|ddk-' })
  if ($foreign.Count -gt 0) { Fail "başka kabul süreci çalışıyor: $($foreign.ProcessId -join ',')" }
  $node = Resolve-NodeExe
  return [ordered]@{ head = $head; pkg = $gotPkg; envSha = $envSha; nodeExe = $node }
}

function Set-RunEnv([string]$mode, [string]$runId, [string]$evDir, [string]$receipt, [string]$goRef) {
  $env:AH_DATABASE_URL = EnvValue 'DATABASE_URL'
  $env:AH_PRISMA_ROOT = Join-Path $Rel 'node_modules\.pnpm\@prisma+client@5.22.0_prisma@5.22.0\node_modules\@prisma\client'
  $env:AH_BCRYPT_PATH = Join-Path $Rel 'node_modules\.pnpm\bcrypt@5.1.1\node_modules\bcrypt'
  $env:DDK_MODE = $mode; $env:DDK_EXPECT_DB = 'hukuk_db'; $env:DDK_LIVE_CONFIRM = '1'; $env:DDK_LIVE_GO_REF = $goRef; $env:DDK_DISPLAY = 'conout'
  $env:DDK_RECEIPT = $receipt; $env:DDK_EVID_FILE = Join-Path $evDir ("ddk-{0}-evidence.json" -f $mode)
  if ($runId) { $env:DDK_RUNID = $runId }
}
function New-LoginPassword {
  $rb = New-Object byte[] 18; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($rb)
  return ('Ddk!' + [Convert]::ToBase64String($rb).TrimEnd('=').Replace('+', '-').Replace('/', '_'))
}
function Invoke-Node([string]$exe, [string]$scriptPath, [string]$logFile) {
  $old = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
  $rc = -999; $launchError = $null
  try {
    $global:LASTEXITCODE = -999
    try { & $exe $scriptPath *> $logFile } catch { $launchError = $_.Exception.GetType().Name }
    $rc = $global:LASTEXITCODE
  } finally { $ErrorActionPreference = $old }
  if ($launchError -or -not ($rc -is [int]) -or $rc -eq -999) { $script:LastNodeRc = 91; return 91 }
  $script:LastNodeRc = [int]$rc
  return [int]$rc
}
function Write-Manifest([string]$evDir) {
  Get-ChildItem -LiteralPath $evDir -File | Where-Object Name -ne 'SHA256-MANIFEST.txt' | Sort-Object Name |
    ForEach-Object { "$(Sha $_.FullName)  $($_.Name)" } | Set-Content -LiteralPath (Join-Path $evDir 'SHA256-MANIFEST.txt') -Encoding ASCII
}
function Write-BlockRecord([string]$evDir, [string]$mode, [string]$runId, $g) {
  [ordered]@{ record = 'CLIENT-DDK-OWNER-BLOCK'; revision = 'R01'; mode = $mode; runId = $runId; main = $g.head; packageDigest = $g.pkg
              envSha = $g.envSha; nodeExe = $g.nodeExe; standaloneWindowConfirmed = ($mode -eq 'Kur'); emailSendsPlanned = 0
              startedUtc = (Get-Date).ToUniversalTime().ToString('o') } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $evDir 'owner-block.json') -Encoding UTF8
}
function Write-GoConsumed([string]$evDir, [string]$runId, [string]$goSha, $rc) {
  [ordered]@{ record = 'CLIENT-DDK-GOREF-CONSUMED'; runId = $runId; goRefSha256 = $goSha; literalWritten = $false; exitCode = $rc
              atUtc = (Get-Date).ToUniversalTime().ToString('o') } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $evDir 'goref-consumed.json') -Encoding UTF8
}
# Canlı yazım listesi: Kur / Kapat'tan ÖNCE açıkça gösterilir; "EVET" yazılmazsa GO sorulmaz, defter yazılmaz, koşucu çağrılmaz.
function Confirm-LiveWrites([string]$mode) {
  Write-Host ''
  if ($mode -eq 'Kur') {
    Write-Host 'Canlı veritabanına YAZILACAK (tek işlem, DÖRT satır; silme YOK):' -ForegroundColor Yellow
    Write-Host '  1) Tenant  — sentetik büro (ad "DD-K Sinama Burosu <runId>", kısa ad ah-<runId>; yaşam döngüsü ACTIVE)'
    Write-Host '  2) User    — sentetik personel (rol USER; e-posta ddk-personel-<runId>@ddk-sinama.invalid; tek kullanımlık parola özeti)'
    Write-Host '  3) Lawyer  — sentetik PARTNER avukat profili, 2) ile bağlı (kimlik / vergi / baro alanları BOŞ)'
    Write-Host '  4) Client  — sentetik müvekkil (PERSON; kimlik numarası YOK; e-posta ddk-muvekkil-<runId>@ddk-sinama.invalid)'
    Write-Host '  E-posta / SMS gönderimi YOK. Gerçek kişi verisi YOK. Öteki bürolara yazma / sayım YOK.'
  } else {
    Write-Host 'Canlı veritabanına YAZILACAK: makbuzdaki sentetik kullanıcı pasif + tokenVersion +1 (silme YOK; zaten pasifse yazma YOK).' -ForegroundColor Yellow
  }
  $a = [string](Read-Answer 'Onaylıyorsanız EVET yazın')
  if ($a -cne 'EVET') { Fail 'canlı yazım onayı verilmedi — koşucu çağrılmadı' }
}
# GO ref tek kullanımlık: defterde ve kanıtta YALNIZ özeti tutulur (GO literali yazılmaz). Defter, tüketim kayıtları ve depo taranır.
function Read-CheckedGoRef {
  $go = ([string](Read-GoRef)).Trim()
  if ($go -cnotmatch '^OWNER-GO-CLIENT-DDK-\d{8}-R\d{2}$') { Fail 'GO ref biçimi geçersiz' }
  $h = ShaText $go
  if ((Test-Path -LiteralPath $GoLedger) -and (Select-String -LiteralPath $GoLedger -SimpleMatch -Pattern $h -Quiet)) { Fail 'bu GO ref daha önce KULLANILDI (defter)' }
  $prior = @(Get-ChildItem -LiteralPath $EvRoot -Recurse -File -Filter 'goref-consumed.json' -ErrorAction SilentlyContinue |
    Where-Object { (Get-Content -Raw -LiteralPath $_.FullName) -match [regex]::Escape($h) })
  if ($prior.Count -gt 0) { Fail 'bu GO ref daha önce KULLANILDI (tüketim kaydı)' }
  $old = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
  $global:LASTEXITCODE = -999
  Invoke-RepoGit grep -q -F -- $go | Out-Null; $gg = $global:LASTEXITCODE; $ErrorActionPreference = $old
  if ($gg -eq 0) { Fail 'GO ref depoda geçiyor — TÜKETİLMİŞ sayılır' }
  if (-not ($gg -is [int]) -or $gg -ne 1) { Fail "tüketim kontrolü yapılamadı (git grep çıkış [$gg])" }
  return [pscustomobject]@{ go = $go; sha = $h }
}
function Add-GoLedger([string]$goSha, [string]$label) {
  New-Item -ItemType Directory -Path $EvRoot -Force | Out-Null
  Add-Content -LiteralPath $GoLedger -Value ("{0}  {1}  {2}" -f (Get-Date).ToUniversalTime().ToString('o'), $goSha, $label) -Encoding ASCII
}
# Kapat yalnız bu bloğun Kur kanıt dizinindeki makbuzu kabul eder; dizin adındaki runId makbuzdakiyle aynı olmalı.
function Resolve-ReceiptRoute([string]$receiptPath) {
  if (-not $receiptPath -or -not (Test-Path -LiteralPath $receiptPath -PathType Leaf)) { Fail '-ReceiptFile ile makbuz dosyası verilmeli' }
  $full = (Resolve-Path -LiteralPath $receiptPath).ProviderPath
  $root = [IO.Path]::GetFullPath($EvRoot).TrimEnd('\')
  $m = [regex]::Match($full, '^' + [regex]::Escape($root) + '\\client-ddk-kur-([0-9a-f]{8})-\d{8}T\d{6}Z\\ddk-setup-receipt\.json$', 'IgnoreCase, CultureInvariant')
  if (-not $m.Success) { Fail 'makbuz bu bloğun Kur kanıt dizininde değil (client-ddk-kur-<runId>-<UTC>\ddk-setup-receipt.json)' }
  $r = Get-Content -LiteralPath $full -Raw | ConvertFrom-Json
  if ($r.record -cne 'CLIENT-DDK-SETUP-RECEIPT' -or [string]$r.runId -cnotmatch '^[0-9a-f]{8}$') { Fail 'makbuz biçimi beklenen değil' }
  if ([string]$r.runId -cne $m.Groups[1].Value.ToLowerInvariant()) { Fail 'makbuzdaki runId kanıt dizini adındaki runId ile aynı değil' }
  return [pscustomobject]@{ path = $full; runId = [string]$r.runId; dir = (Split-Path -Parent $full) }
}

function Invoke-KurMode($g) {
  Assert-LocalConsole
  Assert-NoTranscription
  $w = [string](Read-Answer 'Bu pencere uygulamanın Terminal paneli ya da kayıt tutan bir oturum DEĞİL, bağımsız bir PowerShell penceresi mi? (E/H)')
  if ($w -cne 'E') { Fail 'bağımsız pencere teyit edilmedi — giriş bilgisi gösterilmeyecek' }
  Confirm-LiveWrites 'Kur'
  $gr = Read-CheckedGoRef
  $rb = New-Object byte[] 4; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($rb)
  $runId = ([BitConverter]::ToString($rb) -replace '-', '').ToLowerInvariant()
  $evDir = Join-Path $EvRoot ("client-ddk-kur-{0}-{1}" -f $runId, (Get-Date).ToUniversalTime().ToString("yyyyMMdd'T'HHmmss'Z'"))
  New-Item -ItemType Directory -Path $evDir | Out-Null
  Add-GoLedger $gr.sha ("kur runId={0}" -f $runId)
  Write-BlockRecord $evDir 'Kur' $runId $g
  $receipt = Join-Path $evDir 'ddk-setup-receipt.json'
  $rc = 91
  try {
    Set-RunEnv 'kur' $runId $evDir $receipt $gr.go
    $env:DDK_LOGIN_PW = New-LoginPassword
    $rc = Invoke-Node $g.nodeExe (Join-Path $Sc 'ddk-setup-run.js') (Join-Path $evDir 'ddk-kur.log')
  } finally {
    Clear-SecretEnv
    $gr.go = $null
    Write-GoConsumed $evDir $runId $gr.sha $rc
  }
  if ($rc -eq 0) {
    # Giriş bilgisi koşucu tarafından bu pencereye (CONOUT$) çizildi; owner not alınca ekran + kaydırma arabelleği temizlenir.
    try { [void](Read-Answer 'Giriş bilgisini not aldıysanız Enter''a basın (ekran temizlenecek)') } finally { Clear-OwnerScreen }
    Write-Host 'KURULUM DOĞRULANDI — giriş bilgisi ekrandan temizlendi.' -ForegroundColor Green
    Write-Host ("  Kurum    : ah-{0}" -f $runId)
    Write-Host ("  Makbuz   : {0}" -f $receipt)
    Write-Host '  Bu pencereyi ŞİMDİ kapatın (kaydırma arabelleği). Parolayı ve GO ref''i iletiye / dosyaya yazmayın.'
  } else {
    # Çıkış 8: giriş bilgisi çizimi yarıda kalmış olabilir → ekran yine temizlenir.
    if ($rc -eq 8) { Clear-OwnerScreen; Write-Host '  Giriş bilgisi çizilemedi; ekran temizlendi. Bu pencereyi ŞİMDİ kapatın; sentetik kullanıcıyı -Mode Kapat ile kapatın.' -ForegroundColor Yellow }
    Write-Host ("KURULUM TAMAMLANMADI (koşucu çıkış {0}) — kanıt: {1}" -f $rc, $evDir) -ForegroundColor Red
  }
  Write-Manifest $evDir
  return $rc
}
function Invoke-KapatMode($g, [string]$receiptPath) {
  $rt = Resolve-ReceiptRoute $receiptPath
  Confirm-LiveWrites 'Kapat'
  $gr = Read-CheckedGoRef
  $evDir = Join-Path $rt.dir ("kapat-{0}" -f (Get-Date).ToUniversalTime().ToString("yyyyMMdd'T'HHmmss'Z'"))
  New-Item -ItemType Directory -Path $evDir | Out-Null
  Add-GoLedger $gr.sha ("kapat runId={0}" -f $rt.runId)
  Write-BlockRecord $evDir 'Kapat' $rt.runId $g
  $rc = 91
  try {
    Set-RunEnv 'kapat' '' $evDir $rt.path $gr.go
    $rc = Invoke-Node $g.nodeExe (Join-Path $Sc 'ddk-setup-run.js') (Join-Path $evDir 'ddk-kapat.log')
  } finally {
    Clear-SecretEnv
    $gr.go = $null
    Write-GoConsumed $evDir $rt.runId $gr.sha $rc
  }
  if ($rc -eq 0) { Write-Host 'KAPANIŞ DOĞRULANDI — sentetik personel pasif, tokenVersion +1 (ya da zaten pasifti; günlükte NOT satırı)' -ForegroundColor Green }
  else { Write-Host ("KAPANIŞ DOĞRULANAMADI (koşucu çıkış {0}) — kanıt: {1}" -f $rc, $evDir) -ForegroundColor Red }
  Write-Manifest $evDir
  return $rc
}

function Invoke-Main {
  Clear-SecretEnv
  $script:LastNodeRc = $null
  $code = 90
  try {
    $g = Invoke-ReadOnlyGates
    Write-Host ("kapılar TAMAM · paket {0} · .env pini tutuyor · main {1}" -f $g.pkg.Substring(0, 8), $g.head.Substring(0, 8)) -ForegroundColor Green
    if ($Mode -eq 'Preflight') { $code = 0 }
    elseif ($Mode -eq 'Kur') { $code = Invoke-KurMode $g }
    else { $code = Invoke-KapatMode $g $ReceiptFile }
  } catch {
    if ("$_" -notmatch '^CLIENT-DDK-DUR:') { Write-Host ("DUR - beklenmeyen hata: {0}" -f $_.Exception.GetType().Name) -ForegroundColor Red }
    # Koşucu çalıştıysa (yazmış olabilir) onun çıkış kodu döner; 90 yalnız "koşucu çağrılmadı" demektir.
    if ($null -ne $script:LastNodeRc) {
      $code = $script:LastNodeRc
      Write-Host ("  koşucu ÇALIŞTI (çıkış {0}); hata koşucudan SONRA blokta — kanıt dizinine bakın" -f $code) -ForegroundColor Red
    } else { $code = 90 }
  } finally { Clear-SecretEnv }
  Write-Host ("blok çıkışı {0}" -f $code)
  return $code
}

# Öz-test bloğu nokta kaynağıyla (`. .\ddk-owner-block.ps1`) yükler: o durumda ana akış ÇALIŞMAZ, yalnız işlevler tanımlanır.
if ($MyInvocation.InvocationName -ne '.') { exit (Invoke-Main) }
