# ═══════════ EXTACC D-5 OWNER BLOĞU ÖZ-TESTİ (R01) — CANLIYA DOKUNMAZ ═══════════
# NE     : d5-owner-live-block.ps1 içindeki GERÇEK fonksiyonları (Invoke-RunMode, Invoke-RecoverMode, Invoke-Node,
#          Complete-NodeRc, Resolve-NodeExe, Confirm-LiveDataProcessing, Read-Recipient, Confirm-SingleSend, Read-ScrubDecision, Write-OwnerDeclaration ...)
#          AST ile yükler ve koşar. Dosyanın AKIŞ bölümü (kapılar, canlı yollar) HİÇ ÇALIŞMAZ.
# YÖNLENDİRME: yalnız yol değişkenleri geçici dizine alınır ve etkileşim noktaları teste bağlanır: Read-GoRef (test GO),
#          Read-Answer (kuyruktan yanıt), Invoke-RepoGit (git grep "bulunmadı"), Assert-LocalConsole (test sürecinin çıktısı
#          yönlendirildiği için no-op; GERÇEK hali ayrıca K-1'de ölçülür), Clear-OwnerScreen (no-op).
#          Node GERÇEKTİR: PATH'teki node + geçici betik ya da BAŞLATILAMAYAN dosya.
# R03    : QrTest d5-qr-test.js'i çağırır (geçici betik, GERÇEK d5-qr-test.js doğrulayıcısını yükler ve bloğun kurduğu ortamı onunla ölçer);
#          public portal adresi sahte .env'den bloğun GERÇEK kapı satırlarıyla çözülür (literal yok); owner adresi eşleşmezse DUR;
#          Preflight'tan erişilebilen fonksiyon kapanışında soru/yazma komutu olmadığı AST ile ölçülür. Tüm adresler sentetik (.invalid).
# ÇIKTI  : bu öz-testin ve test edilen blok fonksiyonlarının tüm Write-Host çıktısı yerel kullanıcı adından arındırılarak yazılır (Hide-LocalUser; M-1).
# KULLANIM: powershell.exe -NoProfile -ExecutionPolicy Bypass -File d5-owner-block-selftest.ps1   (ve pwsh)
# ÇIKIŞ  : 0 hepsi PASS · 1 en az bir FAIL · 2 ölçülemedi
$ErrorActionPreference = 'Stop'
$here    = $PSScriptRoot
$wrapper = Join-Path $here 'd5-owner-live-block.ps1'
$startedUtc = (Get-Date).ToUniversalTime().ToString('o')

$tok = $null; $perr = $null
$ast = [Management.Automation.Language.Parser]::ParseFile($wrapper, [ref]$tok, [ref]$perr)
if ($perr.Count -gt 0) { Write-Host "OLCULEMEDI: wrapper ayrıştırılamadı ($($perr.Count) hata)"; exit 2 }
$funcs = @($ast.FindAll({ param($n) $n -is [Management.Automation.Language.FunctionDefinitionAst] }, $false))
foreach ($f in $funcs) { . ([scriptblock]::Create($f.Extent.Text)) }
$secAssign = @($ast.FindAll({ param($n) $n -is [Management.Automation.Language.AssignmentStatementAst] -and $n.Left.Extent.Text -eq '$SecretEnv' }, $false))
if ($secAssign.Count -ne 1) { Write-Host 'OLCULEMEDI: $SecretEnv ataması bulunamadı'; exit 2 }
. ([scriptblock]::Create($secAssign[0].Extent.Text))
$lpAssign = @($ast.FindAll({ param($n) $n -is [Management.Automation.Language.AssignmentStatementAst] -and $n.Left.Extent.Text -eq '$LiveParams' }, $false))
if ($lpAssign.Count -ne 1) { Write-Host 'OLCULEMEDI: $LiveParams ataması bulunamadı'; exit 2 }
. ([scriptblock]::Create($lpAssign[0].Extent.Text))
$need = 'Get-ClosureStatus', 'Invoke-RunMode', 'Invoke-RecoverMode', 'Invoke-QrTestMode', 'Assert-ExternalChain', 'Get-ExternalChainState', 'Invoke-Node', 'Complete-NodeRc', 'Resolve-NodeExe', 'Assert-FreshEvidence', 'Set-RunEnv',
        'Clear-SecretEnv', 'Read-GoRef', 'Read-Answer', 'Invoke-RepoGit', 'Assert-LocalConsole', 'Confirm-LiveDataProcessing', 'Read-Recipient', 'Confirm-SingleSend', 'Read-ScrubDecision', 'Write-OwnerDeclaration', 'Write-CombinedVerdict',
        'EnvValue', 'Assert-PortalBaseUrl', 'Confirm-PortalBaseUrlR05', 'Invoke-ReadOnlyGates'
$missing = @($need | Where-Object { -not (Get-Command $_ -CommandType Function -ErrorAction SilentlyContinue) })
if ($missing.Count -gt 0) { Write-Host "OLCULEMEDI: wrapper fonksiyonu yok: $($missing -join ',')"; exit 2 }
$script:RealAssertLocalConsole = ${function:Assert-LocalConsole}
$src0 = [IO.File]::ReadAllText($wrapper)

# ÇIKTI MASKESİ (inceleme bulgusu): bu öz-testin ve test edilen blok fonksiyonlarının TÜM Write-Host çıktısı (kanıt dizini, node yolu, geçici
# dizin ...) yazılmadan ÖNCE yerel kullanıcı adından arındırılır. Blok fonksiyonları bu kapsama yüklendiği için onların Write-Host çağrıları
# da aşağıdaki fonksiyona çözülür. Ölçütlerin kararı maskeden ÖNCE hesaplanır; maske yalnız yazılan metni değiştirir (M-1 ile ölçülür).
$script:MaskNames = @(@($env:USERNAME, $(if ($env:USERPROFILE) { Split-Path -Leaf $env:USERPROFILE })) | Where-Object { $_ -and ([string]$_).Length -ge 3 } | Sort-Object -Unique)
function Hide-LocalUser([string]$t) {
  if (-not $t) { return $t }
  $t = $t -replace '([A-Za-z]:\\Users\\)[^\\\s"'']+', '$1<kullanıcı>'
  foreach ($n in $script:MaskNames) { $t = $t -replace [regex]::Escape([string]$n), '<kullanıcı>' }
  return $t
}
function Write-Host {
  [CmdletBinding()]
  param([Parameter(Position = 0, ValueFromPipeline = $true)] [object]$Object, [switch]$NoNewline, [object]$Separator, [ConsoleColor]$ForegroundColor, [ConsoleColor]$BackgroundColor)
  process {
    $p = @{}; foreach ($k in 'NoNewline', 'Separator', 'ForegroundColor', 'BackgroundColor') { if ($PSBoundParameters.ContainsKey($k)) { $p[$k] = $PSBoundParameters[$k] } }
    Microsoft.PowerShell.Utility\Write-Host (Hide-LocalUser ([string]$Object)) @p
  }
}

$T = Join-Path ([IO.Path]::GetTempPath()) ('d5-ownerblock-test-' + [Guid]::NewGuid().ToString('N').Substring(0, 8))
foreach ($d in 'sc', 'ev', 'rel', 'repo', 'bogus', 'badcmd', 'empty') { New-Item -ItemType Directory -Path (Join-Path $T $d) | Out-Null }
$Sc = Join-Path $T 'sc'; $EvRoot = Join-Path $T 'ev'; $GoLedger = Join-Path $EvRoot 'extacc-d5-goref-ledger.txt'
$Rel = Join-Path $T 'rel'; $Repo = Join-Path $T 'repo'; $Api = 'http://127.0.0.1:1/api'
$TestBase = 'https://example.invalid'   # sentetik (.invalid); canlı alan adı bu dosyada YOKTUR
$EnvFile = Join-Path $T 'fake.env'
[IO.File]::WriteAllText($EnvFile, "DATABASE_URL=postgresql://test-only:test-only@127.0.0.1:1/not_a_db`nPUBLIC_PORTAL_BASE_URL=$TestBase`nEMAIL_PROVIDER=smtp`n")
# Public portal adresi LİTERALLE KURULMAZ: bloğun Invoke-ReadOnlyGates içindeki GERÇEK iki satırı (AST) sahte .env ile koşulur.
$gatesFn = $funcs | Where-Object { $_.Name -eq 'Invoke-ReadOnlyGates' } | Select-Object -First 1
$baseStmts = @($gatesFn.Body.FindAll({ param($n) $n -is [Management.Automation.Language.AssignmentStatementAst] -and ($n.Left.Extent.Text -eq '$baseUrl' -or $n.Left.Extent.Text -eq '$script:ExpBaseUrl') }, $true))
if ($baseStmts.Count -ne 2 -or $baseStmts[0].Left.Extent.Text -ne '$baseUrl' -or $baseStmts[1].Left.Extent.Text -ne '$script:ExpBaseUrl') { Write-Host "OLCULEMEDI: kapılarda public portal adresi satırları bulunamadı ($($baseStmts.Count))"; exit 2 }
function Invoke-RealBaseUrlGate { foreach ($st in $baseStmts) { . ([scriptblock]::Create($st.Extent.Text)) } }
$ExpBaseUrl = $null
$script:LastNodeRc = $null
$marker = Join-Path $T 'node-calls.txt'
$qrMarker = Join-Path $T 'qr-calls.txt'
[IO.File]::WriteAllText((Join-Path $Sc 'd5-portal-reset-live-run.js'), @'
const fs = require('fs');
fs.appendFileSync(process.env.EXSTUB_MARKER, JSON.stringify({ mode: process.env.D5_MODE || null, db: !!process.env.AH_DATABASE_URL,
  go: !!process.env.D5_LIVE_GO_REF, receipt: !!process.env.D5_RECEIPT, display: process.env.D5_DISPLAY || null, slug: process.env.D5_EXPECT_TENANT_SLUG || null,
  rcpt: process.env.D5_RECIPIENT_EMAIL || null, send: process.env.D5_SEND_CONFIRM || null, scrub: process.env.D5_SCRUB_RECIPIENT || null, sink: process.env.D5_TEST_DISPLAY_SINK || null,
  base: process.env.D5_EXPECT_BASE_URL || null, qrUrl: process.env.D5_QRTEST_URL || null,
  params: ['D5_WAIT_MS', 'D5_POLL_MS', 'D5_VIEW_MS', 'D5_HTTP_TIMEOUT_MS', 'D5_CALL_TIMEOUT_MS', 'D5_LATE_CREATE_MS', 'D5_TOKEN_TTL_MS'].map((k) => process.env[k] || null) }) + '\n');
if (process.env.EXSTUB_WRITE_EVID === '1') fs.writeFileSync(process.env.D5_EVID_FILE, JSON.stringify({ productFinding: process.env.EXSTUB_FINDING || null,
  portalClose: { sessionRequired: (process.env.EXSTUB_SESSREQ || '1') === '1', s0Required: (process.env.EXSTUB_S0REQ || '1') === '1' },
  results: [{ id: 'P5-WAIT', verdict: process.env.EXSTUB_WAIT || 'PASS' }, { id: 'P5-C-TOKEN', verdict: 'PASS' }, { id: 'P5-D9', verdict: process.env.EXSTUB_D9 || 'PASS' },
    { id: 'P5-SINGLE-USE-OBS', verdict: process.env.EXSTUB_OBS || 'PASS' }] }));
process.exit(Number(process.env.EXSTUB_RC || 0));
'@)
# QR geçici betiği: GERÇEK d5-qr-test.js doğrulayıcısını (validateQrTarget) yükler ve bloğun kurduğu ortamı onunla ölçer; konsol AÇMAZ, QR ÇİZMEZ.
# Doğrulayıcı reddederse onun çıkış koduyla (4/1) biter — bloğun ürettiği adres gerçek kapıdan geçmiyorsa QrTest DURUR.
[IO.File]::WriteAllText((Join-Path $Sc 'd5-qr-test.js'), @'
const fs = require('fs');
const v = require(process.env.EXSTUB_REAL_QR).validateQrTarget(process.env);
fs.appendFileSync(process.env.EXSTUB_QR_MARKER, JSON.stringify({ ok: v.ok, code: v.code, reason: v.reason, href: v.href, url: process.env.D5_QRTEST_URL || null,
  base: process.env.D5_EXPECT_BASE_URL || null, exa: process.env.EXA_QRTEST_URL || null, db: !!process.env.AH_DATABASE_URL, go: !!process.env.D5_LIVE_GO_REF, rcpt: !!process.env.D5_RECIPIENT_EMAIL }) + '\n');
if (!v.ok) process.exit(v.code);
process.exit(Number(process.env.EXSTUB_QR_RC || 0));
'@)
$env:EXSTUB_REAL_QR = Join-Path $here 'd5-qr-test.js'; $env:EXSTUB_QR_MARKER = $qrMarker
if (-not (Test-Path -LiteralPath $env:EXSTUB_REAL_QR -PathType Leaf)) { Write-Host 'OLCULEMEDI: d5-qr-test.js yok'; exit 2 }
$bogusNode = Join-Path $T 'bogus\node.exe'; [IO.File]::WriteAllText($bogusNode, 'bu dosya bir çalıştırılabilir dosya DEĞİLDİR')
$goneNode  = Join-Path $T 'gone\node.exe'
[IO.File]::WriteAllText((Join-Path $T 'badcmd\node.cmd'), "@echo merhaba`r`n@exit /b 0`r`n")
$env:EXSTUB_MARKER = $marker

$rows = New-Object System.Collections.Generic.List[object]
function Check([string]$id, [string]$desc, [bool]$ok, [string]$obs) { $rows.Add([pscustomobject]@{ id = $id; sonuc = $(if ($ok) { 'PASS' } else { 'FAIL' }); aciklama = $desc; gozlem = $obs }) }
$script:goN = 10
$script:GoFmt = 'OWNER-GO-CLIENT-EXTACC-D5-20000101-R{0:D2}'
function Read-GoRef { $script:goN++; return ($script:GoFmt -f $script:goN) }
function Invoke-RepoGit { $global:LASTEXITCODE = 1 }
function Assert-LocalConsole { }
function Clear-OwnerScreen { }
$script:Answers = New-Object System.Collections.Generic.Queue[string]
$script:AnswerCalls = 0; $script:Asked = New-Object System.Collections.Generic.List[string]
function Read-Answer([string]$q) { $script:AnswerCalls++; $script:Asked.Add($q); if ($script:Answers.Count -gt 0) { return $script:Answers.Dequeue() } return '?' }
function Set-Answers([string[]]$a) { $script:Answers.Clear(); $script:AnswerCalls = 0; $script:Asked.Clear(); foreach ($x in $a) { $script:Answers.Enqueue($x) } }
function Qr-Calls { @(if (Test-Path -LiteralPath $qrMarker) { Get-Content -LiteralPath $qrMarker }) }
# AST: bir düğümdeki adlandırılmış komutlar; köklerden ERİŞİLEBİLEN blok fonksiyonlarının kapanışı (incelenen komut sayısı raporlanır — kör ölçüm değil)
function Get-CommandNames($node) { @($node.FindAll({ param($n) $n -is [Management.Automation.Language.CommandAst] }, $true) | ForEach-Object { $_.GetCommandName() } | Where-Object { $_ }) }
function Get-Reachable([string[]]$roots) {
  $seen = New-Object 'System.Collections.Generic.HashSet[string]' ([StringComparer]::OrdinalIgnoreCase)
  $cmds = New-Object 'System.Collections.Generic.HashSet[string]' ([StringComparer]::OrdinalIgnoreCase)
  $fnHit = New-Object System.Collections.Generic.List[string]; $n = 0
  $queue = New-Object System.Collections.Generic.Queue[string]; foreach ($r in $roots) { [void]$cmds.Add($r); $queue.Enqueue($r) }
  while ($queue.Count -gt 0) {
    $name = $queue.Dequeue(); if (-not $seen.Add($name)) { continue }
    $fn = $funcs | Where-Object { $_.Name -eq $name } | Select-Object -First 1
    if ($fn) { $fnHit.Add($fn.Name); foreach ($c in (Get-CommandNames $fn.Body)) { $n++; [void]$cmds.Add($c); $queue.Enqueue($c) } }
  }
  return [pscustomobject]@{ functions = @($fnHit); commands = @($cmds); examined = $n }
}
$Interactive = @('Read-Host', 'Read-Answer', 'Read-GoRef', 'Read-Recipient', 'Read-ScrubDecision', 'Confirm-PortalBaseUrlR05', 'Confirm-LiveDataProcessing', 'Confirm-SingleSend',
                 'Invoke-Node', 'Invoke-RunMode', 'Invoke-RecoverMode', 'Invoke-QrTestMode', 'Set-RunEnv', 'Set-Content', 'Add-Content', 'Out-File', 'New-Item', 'Set-Item', 'Write-Manifest',
                 'Write-OwnerDeclaration', 'Write-CombinedVerdict')
$script:CmdExe = Join-Path $env:SystemRoot 'System32\cmd.exe'
function Set-PriorZero { & $script:CmdExe /c 'exit 0'; if ($global:LASTEXITCODE -ne 0) { throw 'önceki kod 0 yapılamadı' } }
$script:RealSetRunEnv = ${function:Set-RunEnv}
$script:PriorAtNode = $null
function Set-RunEnv { & $script:RealSetRunEnv @args; Set-PriorZero; $script:PriorAtNode = $global:LASTEXITCODE }
function Node-Calls { @(if (Test-Path -LiteralPath $marker) { Get-Content -LiteralPath $marker }) }
$script:Rcpt = 'kisi.test@example.com'
$okAnswers = @('E', $TestBase, 'EVET', $script:Rcpt, $script:Rcpt, 'GÖNDER', 'H', 'E', '2', 'S', 'E', 'L', '1', 'H', 'M', 'G')   # pencere · R05 adresi · onay · alıcı x2 · gönderim · ezme · beyan x9
$IdxSecond = 13   # $okAnswers içinde ikinciBaglantiDenemesi yanıtının yeri (R05 adresi eklendiği için 12 → 13)
$okChain = [pscustomobject]@{ loopbackCount = 1; otherAddresses = ''; loopbackPids = '4242'; caddyServiceState = 'Running'; caddyServicePid = 4242; cloudflaredStatus = 'Running' }
function Invoke-Mode([string]$mode, [string]$nodeExe, [int]$stubRc, [bool]$writeEvid, [string]$receipt = '', [string[]]$answers = $okAnswers, [string]$waitVerdict = 'PASS', $chain = $okChain) {
  $env:EXSTUB_RC = [string]$stubRc; $env:EXSTUB_WRITE_EVID = $(if ($writeEvid) { '1' } else { '0' }); $env:EXSTUB_WAIT = $waitVerdict
  Set-Answers $answers
  $g = [ordered]@{ head = 'test'; pkg = 'test'; dist = 'test'; envSha = 'test'; apiPid = 0; baseHost = 'example.invalid'
                   caddyLoopback = $true; cloudflaredRunning = $true; chain = $chain; nodeExe = $nodeExe; nodeVersion = 'test' }
  $before = (Node-Calls).Count; $script:LastNodeRc = $null; $script:PriorAtNode = $null
  $ledgerBefore = if (Test-Path -LiteralPath $GoLedger) { @(Get-Content -LiteralPath $GoLedger).Count } else { 0 }
  Set-PriorZero
  $threw = $null; $out = $null
  try { if ($mode -eq 'Run') { $out = Invoke-RunMode $g } else { $out = Invoke-RecoverMode $g $receipt } } catch { $threw = $_.Exception.Message }
  $calls = @(Node-Calls)
  $ledgerAfter = if (Test-Path -LiteralPath $GoLedger) { @(Get-Content -LiteralPath $GoLedger).Count } else { 0 }
  return @{ out = $out; count = @($out).Count; threw = $threw; prior = $script:PriorAtNode; nodeCalls = $calls.Count - $before
            last = $(if ($calls.Count -gt $before) { $calls[-1] | ConvertFrom-Json } else { $null }); ledgerDelta = $ledgerAfter - $ledgerBefore
            secretsLeft = @($SecretEnv | Where-Object { Test-Path "Env:$_" }).Count }
}
function Last-EvDir { Get-ChildItem -LiteralPath $EvRoot -Directory -Filter 'extacc-d5-live-*' | Sort-Object LastWriteTimeUtc | Select-Object -Last 1 }
function Consumed-Rc { $d = Last-EvDir; (Get-Content -Raw -LiteralPath (Join-Path $d.FullName 'goref-consumed.json') | ConvertFrom-Json).exitCode }
$ps = "PS $($PSVersionTable.PSVersion) ($($PSVersionTable.PSEdition))"

try {
  $real = Resolve-NodeExe
  Check 'N-1' 'Resolve-NodeExe: gerçek node çözülür, --version geçer' ((Test-Path -LiteralPath $real.Exe -PathType Leaf) -and $real.Version -match '^v\d+\.\d+\.\d+$') "$($real.Version)"
  $savedPath = $env:PATH
  try {
    $env:PATH = Join-Path $T 'bogus'; Set-PriorZero; $m = $null; try { $null = Resolve-NodeExe } catch { $m = $_.Exception.Message }
    Check 'N-2' 'başlatılamayan node (önceki kod 0) → DUR' ($m -like 'EXTACC-D5-DUR:*' -and $m -match 'node') "mesaj=$m"
    $env:PATH = Join-Path $T 'badcmd'; Set-PriorZero; $m = $null; try { $null = Resolve-NodeExe } catch { $m = $_.Exception.Message }
    Check 'N-3' 'node --version beklenmeyen çıktı → DUR' ($m -like 'EXTACC-D5-DUR:*' -and $m -match 'version') "mesaj=$m"
    $env:PATH = Join-Path $T 'empty'; $m = $null; try { $null = Resolve-NodeExe } catch { $m = $_.Exception.Message }
    Check 'N-4' 'node yok → DUR' ($m -like 'EXTACC-D5-DUR:*') "mesaj=$m"
  } finally { $env:PATH = $savedPath }

  # ---- PUBLIC PORTAL ADRESİ (R03): kaynak canlı yapılandırma (.env), biçim kapısı, owner teyidi; Preflight SORMAZ
  Set-Answers @()
  $m = $null; try { Invoke-RealBaseUrlGate } catch { $m = $_.Exception.Message }
  Check 'A-1' 'kapıların GERÇEK satırları (AST) sahte .env ile: $ExpBaseUrl .env değerine kurulur; owner''a HİÇBİR soru sorulmaz (Read-Answer 0)' ($null -eq $m -and $ExpBaseUrl -ceq $TestBase -and $script:AnswerCalls -eq 0) "istisna=$m · çözülen=$($ExpBaseUrl -ceq $TestBase) · soru=$($script:AnswerCalls) · satır=$($baseStmts.Count)"
  $env2 = Join-Path $T 'fake2.env'; [IO.File]::WriteAllText($env2, "PUBLIC_PORTAL_BASE_URL=https://env-kaynak.invalid`n")
  $savedEnvFile = $EnvFile; $savedBase = $ExpBaseUrl
  $EnvFile = $env2; $ExpBaseUrl = $null; $m = $null; try { Invoke-RealBaseUrlGate } catch { $m = $_.Exception.Message }
  $fromEnv2 = $ExpBaseUrl
  $env:EXSTUB_QR_RC = '0'; Set-Answers @('https://env-kaynak.invalid', 'E'); $qb = (Qr-Calls).Count; $q = $null; $qt = $null
  try { $q = Invoke-QrTestMode ([ordered]@{ nodeExe = $real.Exe }) } catch { $qt = $_.Exception.Message }
  $qc = @(Qr-Calls); $ql = if ($qc.Count -gt $qb) { $qc[-1] | ConvertFrom-Json } else { $null }
  Check 'A-2' '.env değeri DEĞİŞİNCE adres de değişir (kaynak .env; blokta sabit yok): QrTest QR adresi = <.env origin>/portal/forgot-password ve GERÇEK doğrulayıcı kabul eder' ($null -eq $m -and $fromEnv2 -ceq 'https://env-kaynak.invalid' -and $q -eq 0 -and $ql -and $ql.ok -eq $true -and $ql.url -ceq 'https://env-kaynak.invalid/portal/forgot-password' -and $ql.base -ceq 'https://env-kaynak.invalid' -and $ql.href -ceq $ql.url) "çözülen=$fromEnv2 · çıkış=$q · doğrulayıcı=$($ql.ok) · istisna=$m/$qt"
  $badEnvs = [ordered]@{ 'http' = 'http://env-kaynak.invalid'; 'yol' = 'https://env-kaynak.invalid/portal'; 'sondaki /' = 'https://env-kaynak.invalid/'; 'port' = 'https://env-kaynak.invalid:8443'; 'sorgu' = 'https://env-kaynak.invalid?x=1'
                         'userinfo' = 'https://kisi@env-kaynak.invalid'; 'IP' = 'https://127.0.0.1'; 'localhost' = 'https://localhost'; 'fragment' = 'https://env-kaynak.invalid#x'; 'alt çizgi' = 'https://env_kaynak.invalid'; 'boşluk' = 'https://env kaynak.invalid'; 'boş' = '' }
  $badAccepted = @(); $i = 0
  foreach ($k in $badEnvs.Keys) {
    $i++; $f = Join-Path $T ("bad-$i.env"); [IO.File]::WriteAllText($f, "PUBLIC_PORTAL_BASE_URL=$($badEnvs[$k])`n")
    $EnvFile = $f; $ExpBaseUrl = $null; $m2 = $null; try { Invoke-RealBaseUrlGate } catch { $m2 = $_.Exception.Message }
    if ($m2 -notlike 'EXTACC-D5-DUR:*' -or $null -ne $ExpBaseUrl) { $badAccepted += $k }
  }
  $f = Join-Path $T 'dup.env'; [IO.File]::WriteAllText($f, "PUBLIC_PORTAL_BASE_URL=$TestBase`nPUBLIC_PORTAL_BASE_URL=https://env-kaynak.invalid`n"); $EnvFile = $f; $ExpBaseUrl = $null; $mDup = $null; try { Invoke-RealBaseUrlGate } catch { $mDup = $_.Exception.Message }
  $dupNull = ($null -eq $ExpBaseUrl)
  $f = Join-Path $T 'none.env'; [IO.File]::WriteAllText($f, "EMAIL_PROVIDER=smtp`n"); $EnvFile = $f; $ExpBaseUrl = $null; $mNone = $null; try { Invoke-RealBaseUrlGate } catch { $mNone = $_.Exception.Message }
  $noneNull = ($null -eq $ExpBaseUrl)
  $EnvFile = $savedEnvFile; $ExpBaseUrl = $savedBase
  Check 'A-3' "biçim kapısı (kapıların gerçek satırlarıyla): .env değeri http / yol / sondaki '/' / port / sorgu / userinfo / IP / localhost / fragment / alt çizgi / boşluk / boş → DUR ve adres ÇÖZÜLMEZ ($($badEnvs.Count) durum); .env'de anahtar 2 kez ya da hiç yoksa DUR" ($badAccepted.Count -eq 0 -and $mDup -like 'EXTACC-D5-DUR:*' -and $dupNull -and $mNone -like 'EXTACC-D5-DUR:*' -and $noneNull) "yanlış kabul=$($badAccepted -join ',') · çift=$mDup · yok=$mNone"
  # Büyük harfli host: biçim kapısı D-6/D-7 ile AYNI kuraldır (PowerShell -notmatch büyük/küçük harf duyarsız) → kapı geçer; ama QR adresi kanonik
  # olmadığı için GERÇEK doğrulayıcı reddeder ve QrTest DURUR (kapalı yönde hata). Canlı .env ayrıca sha256 ile pinlidir.
  $f = Join-Path $T 'upper.env'; [IO.File]::WriteAllText($f, "PUBLIC_PORTAL_BASE_URL=https://ENV-KAYNAK.invalid`n"); $EnvFile = $f; $ExpBaseUrl = $null; $mUp = $null; try { Invoke-RealBaseUrlGate } catch { $mUp = $_.Exception.Message }
  $upBase = $ExpBaseUrl; $env:EXSTUB_QR_RC = '0'; Set-Answers @('https://env-kaynak.invalid', 'E'); $qb = (Qr-Calls).Count; $q = $null; $qt = $null
  try { $q = Invoke-QrTestMode ([ordered]@{ nodeExe = $real.Exe }) } catch { $qt = $_.Exception.Message }
  $qc = @(Qr-Calls); $ql = if ($qc.Count -gt $qb) { $qc[-1] | ConvertFrom-Json } else { $null }
  $EnvFile = $savedEnvFile; $ExpBaseUrl = $savedBase
  Check 'A-3b' 'büyük harfli host (.env): biçim kapısı D-6/D-7 kuralıyla geçer, ama QR adresi kanonik olmadığından GERÇEK doğrulayıcı reddeder (4, kanonik) → QrTest DURUR; owner "E" dese de başarı üretilmez (kapalı yönde hata)' ($null -eq $mUp -and $upBase -ceq 'https://ENV-KAYNAK.invalid' -and $qt -like 'EXTACC-D5-DUR:*' -and $qt -match 'çıkış 4' -and $null -eq $q -and $ql -and $ql.ok -eq $false -and $ql.code -eq 4 -and $ql.reason -eq 'kanonik') "kapı istisnası=$mUp · QrTest=$qt · doğrulayıcı=$($ql.ok)/$($ql.code)/$($ql.reason)"
  $okU = $null; try { $okU = Assert-PortalBaseUrl 'https://portal.example.com' } catch { $okU = 'DUR' }
  $badU = @(); foreach ($u in 'http://portal.example.com', 'https://portal.example.com/portal', 'https://portal.example.com:8443', 'https://127.0.0.1', 'https://localhost', 'https://portal.example.com?x=1', '') { try { $null = Assert-PortalBaseUrl $u; $badU += "KABUL:$u" } catch { if ($_.Exception.Message -notlike 'EXTACC-D5-DUR:*') { $badU += "BASKA:$u" } } }
  Check 'A-4' 'Assert-PortalBaseUrl (D-6/D-7 ile aynı kural): https://<alan adı> kabul; http / yol / port / IP / localhost / sorgu / boş → DUR' ($okU -eq 'https://portal.example.com' -and $badU.Count -eq 0) "kabul=$okU · yanlış kabul=$($badU -join ',')"
  $ExpBaseUrl = $null; $m = $null; Set-Answers @($TestBase); try { Confirm-PortalBaseUrlR05 } catch { $m = $_.Exception.Message }; $nullAsked = $script:AnswerCalls; $ExpBaseUrl = $savedBase
  Check 'A-5' 'Confirm-PortalBaseUrlR05: adres kapılarda çözülmemişse (null) owner''a SORMADAN DUR' ($m -like 'EXTACC-D5-DUR:*' -and $m -match 'çözülmedi' -and $nullAsked -eq 0) "mesaj=$m · soru=$nullAsked"
  $ExpBaseUrl = $null; $m = $null; try { Set-RunEnv 'abcdef12' (Join-Path $T 'ev') } catch { $m = $_.Exception.Message }; $leak = @('D5_EXPECT_BASE_URL', 'D5_LIVE_LOGIN_PW', 'D5_EVID_FILE', 'D5_WAIT_MS') | Where-Object { Test-Path "Env:$_" }; $leak = @($leak); Clear-SecretEnv; $ExpBaseUrl = $savedBase
  Check 'A-6' 'Set-RunEnv: adres çözülmemişse (null) DUR; D5_EXPECT_BASE_URL, giriş parolası, kanıt yolu ve canlı süreler KURULMAZ' ($m -like 'EXTACC-D5-DUR:*' -and $m -match 'çözülmedi' -and $leak.Count -eq 0) "mesaj=$m · kurulan=$($leak -join ',')"
  $reach = Get-Reachable @('Invoke-ReadOnlyGates', 'Assert-ExternalChain')
  $hitI = @($reach.commands | Where-Object { $Interactive -contains $_ })
  $ctl = Get-Reachable @('Invoke-RunMode'); $ctlQ = Get-Reachable @('Invoke-QrTestMode')
  $flowIf = @($ast.FindAll({ param($n) $n -is [Management.Automation.Language.IfStatementAst] -and $n.Clauses.Count -ge 1 -and $n.Clauses[0].Item1.Extent.Text -eq '$Mode -eq ''Preflight''' }, $true))
  $preCmds = if ($flowIf.Count -eq 1) { @(Get-CommandNames $flowIf[0].Clauses[0].Item2) } else { @() }
  $preBad = @($preCmds | Where-Object { $Interactive -contains $_ })
  Check 'A-7' 'Preflight adres SORMAZ ve yazmaz (AST): Preflight dalı + Invoke-ReadOnlyGates + Assert-ExternalChain''den ERİŞİLEBİLEN tüm blok fonksiyonlarında soru/onay/node/yazma komutu YOK; pozitif kontrol: aynı ölçüm Run''da Read-Answer + R05 teyidi + defter yazımını, QrTest''te R05 teyidini GÖRÜR' ($hitI.Count -eq 0 -and $reach.examined -ge 20 -and $reach.functions -contains 'Assert-PortalBaseUrl' -and $reach.functions -contains 'EnvValue' -and $flowIf.Count -eq 1 -and $preCmds.Count -ge 2 -and $preBad.Count -eq 0 -and $preCmds -contains 'Assert-ExternalChain' -and ($ctl.commands -contains 'Read-Answer') -and ($ctl.commands -contains 'Confirm-PortalBaseUrlR05') -and ($ctl.commands -contains 'Add-Content') -and ($ctlQ.commands -contains 'Confirm-PortalBaseUrlR05') -and ($ctlQ.commands -contains 'Read-Answer')) "kapılardan erişilen fonksiyon=$($reach.functions.Count) ($($reach.functions -join ',')) · incelenen komut=$($reach.examined) · yasak=$($hitI -join ',') · Preflight dalı komut=$($preCmds -join ',') · kontrol(Run)=$($ctl.examined)"

  # ---- Run öncesi owner kararları: reddedilirse GO sorulmaz, defter yazılmaz, node çağrılmaz
  $r = Invoke-Mode 'Run' $real.Exe 0 $true '' @('H')
  Check 'K-2' 'bağımsız pencere teyit edilmezse DUR; R05 adresi/GO sorulmaz; GO defteri yazılmaz; node çağrılmaz' ($r.threw -like 'EXTACC-D5-DUR:*' -and $r.ledgerDelta -eq 0 -and $r.nodeCalls -eq 0 -and $script:AnswerCalls -eq 1) "mesaj=$($r.threw) · defter+=$($r.ledgerDelta) · soru=$($script:AnswerCalls)"
  $r = Invoke-Mode 'Run' $real.Exe 0 $true '' @('E', 'https://baska.invalid', 'EVET', $script:Rcpt, $script:Rcpt, 'GÖNDER', 'H')
  Check 'K-9' 'R05 adresi: owner''ın yazdığı adres .env değeriyle eşleşmezse canlı veri onayından ÖNCE DUR; alıcı/gönderim/GO sorulmaz (toplam 2 soru); defter yazılmaz; node çağrılmaz' ($r.threw -like 'EXTACC-D5-DUR:*' -and $r.threw -match 'R05' -and $r.ledgerDelta -eq 0 -and $r.nodeCalls -eq 0 -and $script:AnswerCalls -eq 2) "mesaj=$($r.threw) · soru=$($script:AnswerCalls)"
  $nearMiss = @('https://example.invalid.baska.invalid', 'https://x.example.invalid', 'http://example.invalid', 'https://example.invalid/portal', 'https://example.invalid:443', 'example.invalid', 'https://example.invalıd', '', '?')
  $nmBad = @(); foreach ($a in $nearMiss) { $r = Invoke-Mode 'Run' $real.Exe 0 $true '' @('E', $a, 'EVET', $script:Rcpt, $script:Rcpt, 'GÖNDER', 'H'); if (-not ($r.threw -like 'EXTACC-D5-DUR:*' -and $r.threw -match 'R05' -and $r.ledgerDelta -eq 0 -and $r.nodeCalls -eq 0)) { $nmBad += "[$a]" } }
  Check 'K-9b' "R05 adresi: yakın-yanlış girdiler (sonek/alt alan adı/http/yol/port/şemasız/benzer harf/boş/?) → DUR, defter yok, node yok ($($nearMiss.Count) durum)" ($nmBad.Count -eq 0) "yanlış kabul=$($nmBad -join ',')"
  $script:goN = 30; $r = Invoke-Mode 'Run' $real.Exe 0 $true '' (@('E', " HTTPS://Example.INVALID/ ") + $okAnswers[2..($okAnswers.Count - 1)])
  Check 'K-9c' 'R05 adresi: boşluk / sondaki "/" / büyük-küçük harf farkı eşleşmeyi bozmaz (koşum 0); koşucuya giden origin owner girdisi DEĞİL .env değeridir' ($r.out -eq 0 -and $r.nodeCalls -eq 1 -and $r.last.base -ceq $TestBase) "rc=$($r.out) · origin=.env değeri: $($r.last.base -ceq $TestBase)"
  $script:goN = 10
  $r = Invoke-Mode 'Run' $real.Exe 0 $true '' @('E', $TestBase, 'evet')
  Check 'K-3' 'canlı veri işleme "EVET" (büyük harf) değilse DUR; defter yazılmaz; node çağrılmaz' ($r.threw -like 'EXTACC-D5-DUR:*' -and $r.threw -match 'onaylanmadı' -and $r.ledgerDelta -eq 0 -and $r.nodeCalls -eq 0) "mesaj=$($r.threw)"
  $gs = $script:goN; $script:GoFmt = 'OWNER-GO-CLIENT-EXTACC-D4-20000101-R{0:D2}'; $r = Invoke-Mode 'Run' $real.Exe 0 $true; $script:GoFmt = 'OWNER-GO-CLIENT-EXTACC-D5-20000101-R{0:D2}'; $script:goN = $gs
  Check 'K-4' 'D-4 GO biçimi D-5 için REDDEDİLİR; defter yazılmaz; node çağrılmaz' ($r.threw -like 'EXTACC-D5-DUR:*' -and $r.threw -match 'BİÇİMİ' -and $r.ledgerDelta -eq 0 -and $r.nodeCalls -eq 0) "mesaj=$($r.threw)"
  $r = Invoke-Mode 'Run' $real.Exe 0 $true '' @('E', $TestBase, 'EVET', 'a@example.com', 'b@example.com')
  Check 'K-5' 'alıcı adresi iki girişte farklıysa DUR; defter yazılmaz; node çağrılmaz' ($r.threw -like 'EXTACC-D5-DUR:*' -and $r.threw -match 'aynı değil' -and $r.ledgerDelta -eq 0 -and $r.nodeCalls -eq 0) "mesaj=$($r.threw)"
  $r = Invoke-Mode 'Run' $real.Exe 0 $true '' @('E', $TestBase, 'EVET', 'x@ah-harness.invalid', 'x@ah-harness.invalid')
  Check 'K-6' 'sentetik alıcı adresi (.invalid) DUR' ($r.threw -like 'EXTACC-D5-DUR:*' -and $r.threw -match 'sentetik' -and $r.nodeCalls -eq 0) "mesaj=$($r.threw)"
  $r = Invoke-Mode 'Run' $real.Exe 0 $true '' @('E', $TestBase, 'EVET', $script:Rcpt, $script:Rcpt, 'gönder')
  Check 'K-7' 'gönderim onayı "GÖNDER" (büyük harf) değilse DUR; GO sorulmaz; defter yazılmaz; node çağrılmaz' ($r.threw -like 'EXTACC-D5-DUR:*' -and $r.threw -match 'gönderimi onaylanmadı' -and $r.ledgerDelta -eq 0 -and $r.nodeCalls -eq 0) "mesaj=$($r.threw)"
  $r = Invoke-Mode 'Run' $real.Exe 0 $true '' @('E', $TestBase, 'EVET', $script:Rcpt, $script:Rcpt, 'GÖNDER', 'x')
  Check 'K-8' 'ezme kararı E/H değilse DUR; node çağrılmaz' ($r.threw -like 'EXTACC-D5-DUR:*' -and $r.threw -match 'ezme' -and $r.nodeCalls -eq 0) "mesaj=$($r.threw)"
  $m = $null; try { & $script:RealAssertLocalConsole } catch { $m = $_.Exception.Message }
  Check 'K-1' 'GERÇEK Assert-LocalConsole: çıktısı yönlendirilmiş süreçte DURUR (giriş bilgisi gösterilmez)' ($m -like 'EXTACC-D5-DUR:*') "mesaj=$m"

  # ---- RUN
  $r = Invoke-Mode 'Run' $real.Exe 0 $true
  $d = Last-EvDir; $decl = Get-Content -Raw -LiteralPath (Join-Path $d.FullName 'owner-declaration.json') | ConvertFrom-Json
  $man = Get-Content -LiteralPath (Join-Path $d.FullName 'SHA256-MANIFEST.txt')
  Check 'R-1' 'Run: node 0 + kanıt → 0; node run modunda, D5_DISPLAY=conout, slug ah-<runId>, alıcı + gönderim onayı + ezme kararı(H=0) ortamla koştu; D5_EXPECT_BASE_URL = .env adresi; sink ve QR değişkeni KURULMADI; ortam temizlendi; defter +1' ($r.out -eq 0 -and $r.count -eq 1 -and $r.nodeCalls -eq 1 -and $r.last.mode -eq 'run' -and $r.last.display -eq 'conout' -and $r.last.slug -match '^ah-[0-9a-f]{8}$' -and $r.last.db -and $r.last.go -and $r.last.rcpt -eq $script:Rcpt -and $r.last.send -eq '1' -and $r.last.scrub -eq '0' -and $null -eq $r.last.sink -and $r.last.base -ceq $TestBase -and $null -eq $r.last.qrUrl -and $r.secretsLeft -eq 0 -and $r.ledgerDelta -eq 1 -and (Consumed-Rc) -eq 0) "rc=$($r.out) · display=$($r.last.display) · alıcı=$($null -ne $r.last.rcpt) · ezme=$($r.last.scrub) · origin=.env: $($r.last.base -ceq $TestBase) · kalan gizli=$($r.secretsLeft)"
  $blk = Get-Content -Raw -LiteralPath (Join-Path $d.FullName 'owner-block.json'); $allTxt = (Get-ChildItem -LiteralPath $d.FullName -File | ForEach-Object { Get-Content -Raw -LiteralPath $_.FullName }) -join "`n"
  Check 'R-9' 'alıcı adresi kanıt dizinindeki HİÇBİR dosyada yok; owner-block.json recipientWritten=false, plannedRealSends=1 + plannedRealSendsNote (PLAN, kanıt değil), scrubRequested=false; hiçbir kanıt dosyası "göndermiştir" demez; baseUrlHost yalnız host (D-4/D-6 emsali); GO literali ve DB URL yok' ($allTxt -notmatch [regex]::Escape($script:Rcpt) -and $allTxt -notmatch 'example\.com' -and $blk -match '"recipientWritten":\s*false' -and $blk -match '"plannedRealSends":\s*1' -and $blk -match '"plannedRealSendsNote":\s*"PLAN' -and $blk -match 'KANITI DEĞİL' -and $blk -match '"scrubRequested":\s*false' -and $allTxt -notmatch 'göndermiştir' -and $blk -match '"baseUrlHost":\s*"example\.invalid"' -and $allTxt -notmatch 'OWNER-GO-CLIENT-EXTACC-D5-20000101' -and $allTxt -notmatch 'test-only') "dosya=$((Get-ChildItem -LiteralPath $d.FullName -File).Count)\"
  $cv1 = Get-Content -Raw -LiteralPath (Join-Path $d.FullName 'd5-combined-verdict.json') | ConvertFrom-Json
  Check 'R-10' 'birleşik karar dosyası (d5-combined-verdict.json) manifestte; makine (P5-SINGLE-USE-OBS) ve owner (ikinciBaglantiDenemesi) AYRI alanlarda; e-posta teslimi makine.measured=false + owner beyanı ayrı' ($cv1.record -eq 'EXTACC-D5-COMBINED-VERDICT' -and $cv1.singleUse.machine.id -eq 'P5-SINGLE-USE-OBS' -and $cv1.singleUse.machine.verdict -eq 'PASS' -and $cv1.singleUse.owner.field -eq 'ikinciBaglantiDenemesi' -and $cv1.singleUse.owner.answer -ceq 'H' -and $cv1.singleUse.verdict -ceq 'DOĞRULANDI' -and $cv1.emailDelivery.machine.measured -eq $false -and $cv1.emailDelivery.owner.answer -ceq 'E' -and $cv1.emailDelivery.verdict -match 'OWNER BEYANI: GELDİ' -and (@($man | Where-Object { $_ -match 'd5-combined-verdict\.json$' }).Count -eq 1)) "tekKullanım=$($cv1.singleUse.verdict) · eposta=$($cv1.emailDelivery.verdict)"
  Check 'R-8' 'owner beyanı AYRI dosyada (makine ölçümü değil notu; 9 yönlendirmesiz soru; owner''a gösterilen kapanış metni kayıtlı) ve manifestte' ($decl.record -eq 'EXTACC-D5-OWNER-DECLARATION' -and $decl.not -match 'beyan' -and $decl.epostaGeldi -eq 'E' -and $decl.baglantiSonrasiEkran -eq 'S' -and $decl.girisSonrasiEkran -eq 'L' -and $decl.ikinciBaglantiDenemesi -eq 'H' -and $decl.yenilemeSonrasiEkran -eq 'G' -and $decl.telefonAgi -eq 'M' -and $decl.closureShownToOwner -match 'DOĞRULANDI' -and (@($man | Where-Object { $_ -match 'owner-declaration\.json$' }).Count -eq 1)) "beyan=$($decl.epostaGeldi)/$($decl.epostaGelisSuresiDk)/$($decl.baglantiSonrasiEkran)/$($decl.yeniParolaKabulEdildi)/$($decl.girisSonrasiEkran)/$($decl.listedekiDosyaSayisi)/$($decl.ikinciBaglantiDenemesi)/$($decl.telefonAgi)/$($decl.yenilemeSonrasiEkran) · kapanış=$($decl.closureShownToOwner)\"
  foreach ($c in 2, 3, 5, 6) {
    $r = Invoke-Mode 'Run' $real.Exe $c $true
    Check "R-2.$c" "Run: node $c → $c değişmeden (tek node çağrısı; otomatik tekrar/Recover yok)" ($r.out -eq $c -and $r.nodeCalls -eq 1 -and (Consumed-Rc) -eq $c) "rc=$($r.out) · node=$($r.nodeCalls)"
  }
  $r = Invoke-Mode 'Run' $real.Exe 0 $false
  Check 'R-3' 'Run: node 0 ama kanıt yok → 7' ($r.out -eq 7 -and (Consumed-Rc) -eq 7) "rc=$($r.out)"
  $r = Invoke-Mode 'Run' $bogusNode 0 $true
  Check 'R-4' 'Run: önceki kod 0 iken node BAŞLATILAMAZ → 91 (0 değil); ortam temiz' ($r.out -eq 91 -and $r.nodeCalls -eq 0 -and $r.prior -eq 0 -and (Consumed-Rc) -eq 91 -and $r.secretsLeft -eq 0) "rc=$($r.out) · önceki=$($r.prior)"
  $r = Invoke-Mode 'Run' $goneNode 0 $true
  Check 'R-5' 'Run: önceki kod 0 iken node dosyası YOK → 91' ($r.out -eq 91 -and $r.nodeCalls -eq 0 -and $r.prior -eq 0) "rc=$($r.out)"
  $script:goN = 10; $r = Invoke-Mode 'Run' $real.Exe 0 $true
  Check 'R-6' 'aynı GO ikinci kez → DUR (defter), node çağrılmaz' ($r.threw -like 'EXTACC-D5-DUR:*' -and $r.threw -match 'KULLANILDI' -and $r.nodeCalls -eq 0) "mesaj=$($r.threw)"
  $script:goN = 50
  $r = & { function node { }; Invoke-Mode 'Run' $real.Exe 0 $true }
  Check 'R-7' '`node` fonksiyon gölgesi varken gerçek node dosya yoluyla koşar' ($r.out -eq 0 -and $r.nodeCalls -eq 1) "rc=$($r.out) · node=$($r.nodeCalls)"

  # ---- RECOVER
  $rd = Join-Path $EvRoot 'recover-case'; New-Item -ItemType Directory -Path $rd | Out-Null
  $rcpt = Join-Path $rd 'd5-setup-receipt.json'
  '{"record":"EXTACC-D5-SETUP-RECEIPT","runId":"0123abcd","tenantId":"t","tenantSlug":"ah-0123abcd","caseId":"c","clientId":"k","elevUserId":"u","elevEmail":"e@example.invalid"}' | Set-Content -LiteralPath $rcpt -Encoding ASCII
  $r = Invoke-Mode 'Recover' $real.Exe 0 $true $rcpt @('E')
  Check 'V-0' 'Recover: ezme kararı (E) node''a D5_SCRUB_RECIPIENT=1 olarak geçer' ($r.last.scrub -eq '1' -and $r.last.mode -eq 'recover') "ezme=$($r.last.scrub)"
  $r = Invoke-Mode 'Recover' $real.Exe 0 $true $rcpt @('H')
  $rz = Invoke-Mode 'Recover' $real.Exe 0 $true $rcpt @('H') 'PASS' ([pscustomobject]@{ loopbackCount = 0; otherAddresses = '0.0.0.0'; loopbackPids = ''; caddyServiceState = 'Stopped'; caddyServicePid = 0; cloudflaredStatus = 'Stopped' })
  Check 'Z-8' 'Recover: dış zincir BOZUKKEN de kapanış yapılabilir (çıkış 0, node koştu)' ($rz.out -eq 0 -and $rz.nodeCalls -eq 1 -and -not $rz.threw) "rc=$($rz.out) · istisna=$($rz.threw)"
  Check 'V-1' 'Recover: node 0 + kanıt → 0; recover modu + makbuz; ortam temiz; defter DEĞİŞMEZ' ($r.out -eq 0 -and $r.nodeCalls -eq 1 -and $r.last.mode -eq 'recover' -and $r.last.receipt -and $r.secretsLeft -eq 0 -and $r.ledgerDelta -eq 0) "rc=$($r.out)"
  $r = Invoke-Mode 'Recover' $real.Exe 6 $true $rcpt @('H')
  Check 'V-2' 'Recover: 6 değişmeden' ($r.out -eq 6 -and $r.nodeCalls -eq 1) "rc=$($r.out)"
  $r = Invoke-Mode 'Recover' $real.Exe 0 $false $rcpt @('H')
  Check 'V-3' 'Recover: kanıt yok → 7' ($r.out -eq 7) "rc=$($r.out)"
  $r = Invoke-Mode 'Recover' $bogusNode 0 $true $rcpt @('H')
  Check 'V-4' 'Recover: önceki kod 0 iken node başlatılamaz → 91' ($r.out -eq 91 -and $r.nodeCalls -eq 0 -and $r.prior -eq 0) "rc=$($r.out)"

  # ---- CANLI SÜRELER (inceleme bulgusu): pencereden devralınan değerler canlı süreleri DEĞİŞTİREMEZ
  foreach ($k in 'D5_WAIT_MS', 'D5_POLL_MS', 'D5_VIEW_MS', 'D5_HTTP_TIMEOUT_MS', 'D5_CALL_TIMEOUT_MS', 'D5_LATE_CREATE_MS', 'D5_TOKEN_TTL_MS') { Set-Item -Path "Env:$k" -Value '1' }
  $script:goN = 70; $r = Invoke-Mode 'Run' $real.Exe 0 $true
  $exp = @('1200000', '5000', '120000', '15000', '30000', '120000', '3600000')
  $saved = $LiveParams; $LiveParams = $null; $script:goN = 72
  $r2 = Invoke-Mode 'Run' $real.Exe 0 $true
  $LiveParams = $saved
  Check 'L-2' 'Run: canlı süre tablosu eksikse node BAŞLAMAZ (sessizce devralınan değerlerle koşmaz)' ($r2.threw -like 'EXTACC-D5-DUR:*' -and $r2.threw -match 'süre tablosu' -and $r2.nodeCalls -eq 0) "mesaj=$($r2.threw)"
  Check 'L-1' 'Run: devralınan 7 süre değişkeni (=1) node''a CANLI değerlerle geçer (20 dk bekleme / 5 sn yoklama / 120 sn inceleme / zaman aşımları / 120 sn geç oluşma) ve sonra temizlenir' (($r.last.params -join ',') -eq ($exp -join ',') -and $r.secretsLeft -eq 0) "node gördü=$($r.last.params -join ',') · kalan=$($r.secretsLeft)"


  # ---- OWNER METNİ (inceleme bulgusu 3): kapanış metni kanıta bağlı; koşulsuz "kapatıldı" yok; sorular yönlendirmesiz
  $env:EXSTUB_D9 = 'FAIL'; $script:goN = 80; $r = Invoke-Mode 'Run' $real.Exe 6 $true; $env:EXSTUB_D9 = 'PASS'
  $d = Last-EvDir; $declF = Get-Content -Raw -LiteralPath (Join-Path $d.FullName 'owner-declaration.json') | ConvertFrom-Json
  Check 'O-1' 'P5-D9 FAIL (çıkış 6): owner''a gösterilen metin "DOĞRULANAMADI", "DOĞRULANDI (" değil' ($r.out -eq 6 -and $declF.closureShownToOwner -match 'DOĞRULANAMADI' -and $declF.closureShownToOwner -notmatch 'DOĞRULANDI \(') "metin=$($declF.closureShownToOwner)"
  $cs = Get-ClosureStatus (Join-Path $T 'yok\d5-evidence.json') 7
  Check 'O-2' 'kanıt okunamazsa kapanış DOĞRULANAMADI sayılır' (-not $cs.verified -and $cs.text -match 'DOĞRULANAMADI') "metin=$($cs.text)"
  # ---- KAPANIŞ METNİ (inceleme bulgusu): mevcut-oturum reddi yalnız kanıtta gerekli sayıldıysa iddia edilir; S0 ve S1 yoksa ÖLÇÜLMEDİ
  $env:EXSTUB_SESSREQ = '0'; $env:EXSTUB_S0REQ = '0'; $script:goN = 85; $r = Invoke-Mode 'Run' $real.Exe 3 $true; Remove-Item Env:EXSTUB_SESSREQ, Env:EXSTUB_S0REQ -ErrorAction SilentlyContinue
  $d = Last-EvDir; $declE = Get-Content -Raw -LiteralPath (Join-Path $d.FullName 'owner-declaration.json') | ConvertFrom-Json
  Check 'O-4' 'P5-D9 PASS ama S0 ve S1 oturumu yok (sessionRequired=false, s0Required=false; çıkış 3): owner''a gösterilen metin DOĞRULANDI der ama "mevcut oturum reddi ÖLÇÜLMEDİ" ekler, S0/S1 reddi İDDİA ETMEZ' ($r.out -eq 3 -and $declE.closureShownToOwner -match 'DOĞRULANDI \(' -and $declE.closureShownToOwner -match 'mevcut oturum reddi ÖLÇÜLMEDİ' -and $declE.closureShownToOwner -notmatch 'reddi \((S1|yalnız S0)') "metin=$($declE.closureShownToOwner)"
  $csDir = Join-Path $T 'cs'; New-Item -ItemType Directory -Path $csDir | Out-Null
  $csCases = @(@('O-5', $false, $true, 'yalnız S0; S1 alınmadı'), @('O-6', $true, $true, '\(S1 ve S0\)'), @('O-7', $true, $false, 'reddi \(S1\)'))
  foreach ($c in $csCases) {
    $f = Join-Path $csDir ($c[0] + '.json')
    [ordered]@{ productFinding = $null; portalClose = [ordered]@{ sessionRequired = $c[1]; s0Required = $c[2] }; results = @([ordered]@{ id = 'P5-D9'; verdict = 'PASS' }) } | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $f -Encoding UTF8
    $cs = Get-ClosureStatus $f 0
    Check $c[0] ("Get-ClosureStatus: sessionRequired=" + $c[1] + " s0Required=" + $c[2] + " → metin '" + $c[3] + "' ve ÖLÇÜLMEDİ demez") ($cs.verified -and $cs.text -match $c[3] -and $cs.text -notmatch 'ÖLÇÜLMEDİ' -and $cs.sessionRequired -eq $c[1] -and $cs.s0Required -eq $c[2]) "metin=$($cs.text)"
  }
  $f = Join-Path $csDir 'O-8.json'; '{"productFinding":null,"results":[{"id":"P5-D9","verdict":"PASS"}]}' | Set-Content -LiteralPath $f -Encoding ASCII
  $cs = Get-ClosureStatus $f 0
  Check 'O-8' 'Get-ClosureStatus: kanıtta portalClose alanı YOKSA (eski/eksik kanıt) oturum reddi İDDİA EDİLMEZ (ÖLÇÜLMEDİ)' ($cs.verified -and $cs.text -match 'mevcut oturum reddi ÖLÇÜLMEDİ' -and $null -eq $cs.sessionRequired) "metin=$($cs.text)"

  # ---- BİRLEŞİK KARAR (tek kullanım): makine gözlemi (OBS) + owner beyanı (H/A/S/Y/?) → kural; alanlar AYRI kalır
  $cvCases = @(@('H', 'PASS', 'DOĞRULANDI'), @('A', 'PASS', 'ÖLÇÜLEMEYEN'), @('S', 'PASS', 'ÜRÜN BULGUSU ADAYI'), @('Y', 'PASS', 'ÖLÇÜLEMEYEN'), @('?', 'PASS', 'ÖLÇÜLEMEYEN'),
               @('H', 'FAIL', 'DOĞRULANMADI'), @('H', 'UNMEASURED', 'ÖLÇÜLEMEYEN'), @('S', 'FAIL', 'ÜRÜN BULGUSU ADAYI'), @('h', 'PASS', 'ÖLÇÜLEMEYEN'))
  $script:goN = 90
  foreach ($c in $cvCases) {
    $env:EXSTUB_OBS = $c[1]; $ans = @($okAnswers); $ans[$IdxSecond] = $c[0]
    $r = Invoke-Mode 'Run' $real.Exe 0 $true '' $ans
    $d = Last-EvDir; $cv = Get-Content -Raw -LiteralPath (Join-Path $d.FullName 'd5-combined-verdict.json') | ConvertFrom-Json
    $dcl = Get-Content -Raw -LiteralPath (Join-Path $d.FullName 'owner-declaration.json') | ConvertFrom-Json
    $id = 'C-' + $(if ($c[0] -eq '?') { 'soru' } else { $c[0] }) + '-' + $c[1]
    Check $id ("birleşik: OBS=" + $c[1] + " + beyan [" + $c[0] + "] → " + $c[2] + "; makine/owner alanları ayrı ve ham") ($r.out -eq 0 -and $cv.singleUse.verdict -ceq $c[2] -and $cv.singleUse.machine.verdict -eq $c[1] -and $cv.singleUse.owner.answer -ceq $c[0] -and $dcl.ikinciBaglantiDenemesi -ceq $c[0] -and $cv.emailDelivery.machine.measured -eq $false) "karar=$($cv.singleUse.verdict) · makine=$($cv.singleUse.machine.verdict) · owner=$($cv.singleUse.owner.answer)"
  }
  $env:EXSTUB_OBS = 'PASS'
  $cvNo = Write-CombinedVerdict (Join-Path $T 'ev') 'ffffffff' $null $null
  Check 'C-yok' 'kanıt ve beyan yoksa birleşik karar ÖLÇÜLEMEYEN (DOĞRULANDI üretilmez)' ($cvNo.singleUse.verdict -ceq 'ÖLÇÜLEMEYEN' -and $null -eq $cvNo.singleUse.machine.verdict -and $cvNo.emailDelivery.verdict -ceq 'ÖLÇÜLEMEYEN') "karar=$($cvNo.singleUse.verdict)"
  $declBody2 = ($funcs | Where-Object { $_.Name -eq 'Write-OwnerDeclaration' }).Extent.Text
  Check 'C-soru' 'ikinci deneme sorusu H/A/S/Y/? seçeneklerini sunar (H = formu GÖNDERDİM + hata; A = açtım ama göndermedim); bloğun hiçbir yerinde "göndermiştir"/"e-posta GÖNDERİR"/"ürün gönderir" (büyük-küçük harf duyarsız) yok; plannedRealSends açıklaması PLAN der; Preflight açıklaması "node çağrılmaz" DEMEZ (node --version koşar)' ($declBody2 -match 'H = aynı bağlantıyla formu GÖNDERDİM' -and $declBody2 -match 'A = bağlantıyı açtım ama göndermedim' -and $declBody2 -match 'S = form yeniden kabul etti' -and $declBody2 -match 'Y = denemedim' -and $src0 -notmatch 'göndermiştir' -and $src0 -notmatch 'e-posta GÖNDERİR' -and $src0 -notmatch '(?i)ürün gönderir' -and $src0 -notmatch 'node çağrılmaz' -and $src0 -match 'plannedRealSendsNote = ''PLAN') 'statik'
  $declBody = ($funcs | Where-Object { $_.Name -eq 'Write-OwnerDeclaration' }).Extent.Text
  $leading = @('döndü mü', 'görünmedi mi', 'YALNIZ konsolda', 'oturumun kapandığını', 'kapatıldı', 'geçersiz oldu mu', 'reddedildi mi')
  $hits = @($leading | Where-Object { $declBody -match [regex]::Escape($_) })
  $srcAll = [IO.File]::ReadAllText($wrapper)
  Check 'O-3' 'owner beyanı soruları yönlendirmesiz (seçenekli); bloğun hiçbir yerinde koşulsuz "erişimi kapatıldı" yok' ($hits.Count -eq 0 -and $srcAll -notmatch 'erişimi kapatıldı' -and ([regex]::Matches($declBody, 'Read-Answer')).Count -eq 9) "yönlendiren=$($hits -join ',') · soru=$(([regex]::Matches($declBody, 'Read-Answer')).Count)"

  # ---- DIŞ ZİNCİR (inceleme bulgusu): doğrulanamazsa Preflight/Run DURUR; Recover engellenmez
  $bad = @{
    'Z-1 8081 loopback dinleyicisi yok'            = [pscustomobject]@{ loopbackCount = 0; otherAddresses = ''; loopbackPids = ''; caddyServiceState = 'Running'; caddyServicePid = 4242; cloudflaredStatus = 'Running' }
    'Z-2 8081 başka arayüzde de dinliyor (0.0.0.0)' = [pscustomobject]@{ loopbackCount = 1; otherAddresses = '0.0.0.0'; loopbackPids = '4242'; caddyServiceState = 'Running'; caddyServicePid = 4242; cloudflaredStatus = 'Running' }
    'Z-3 dinleyici HY-Caddy servisine ait değil'  = [pscustomobject]@{ loopbackCount = 1; otherAddresses = ''; loopbackPids = '999'; caddyServiceState = 'Running'; caddyServicePid = 4242; cloudflaredStatus = 'Running' }
    'Z-4 HY-Caddy servisi yok'                     = [pscustomobject]@{ loopbackCount = 1; otherAddresses = ''; loopbackPids = '4242'; caddyServiceState = 'YOK'; caddyServicePid = 0; cloudflaredStatus = 'Running' }
    'Z-5 Cloudflared durmuş'                       = [pscustomobject]@{ loopbackCount = 1; otherAddresses = ''; loopbackPids = '4242'; caddyServiceState = 'Running'; caddyServicePid = 4242; cloudflaredStatus = 'Stopped' }
  }
  foreach ($name in ($bad.Keys | Sort-Object)) {
    $m = $null; try { Assert-ExternalChain $bad[$name] } catch { $m = $_.Exception.Message }
    Check ($name.Substring(0, 3)) ("Assert-ExternalChain: " + $name.Substring(4) + ' → DUR') ($m -like 'EXTACC-D5-DUR:*') "mesaj=$m"
  }
  $m = 'yok'; try { Assert-ExternalChain $okChain; $m = $null } catch { $m = $_.Exception.Message }
  Check 'Z-0' 'Assert-ExternalChain: sağlıklı zincir (yalnız loopback, pid = servis, Cloudflared çalışıyor) geçer' ($null -eq $m) "mesaj=$m"
  $script:goN = 71; $r = Invoke-Mode 'Run' $real.Exe 0 $true '' $okAnswers 'PASS' $bad['Z-5 Cloudflared durmuş']
  Check 'Z-6' 'Run: dış zincir eksikse GO sorulmadan DURUR; defter yazılmaz; node çağrılmaz' ($r.threw -like 'EXTACC-D5-DUR:*' -and $r.threw -match 'Cloudflared' -and $r.ledgerDelta -eq 0 -and $r.nodeCalls -eq 0) "mesaj=$($r.threw)"
  $pre = $src0.Substring($src0.IndexOf('if ($Mode -eq ''Preflight'')'))
  Check 'Z-7' 'Preflight: dış zincir kapısı "PREFLIGHT GEÇTİ" yazısından ÖNCE' ($pre.IndexOf('Assert-ExternalChain $g.chain') -ge 0 -and $pre.IndexOf('Assert-ExternalChain $g.chain') -lt $pre.IndexOf('PREFLIGHT GEÇTİ')) 'sıra'

  # ---- QR DENEMESİ (R03): d5-qr-test.js + R05 teyidi; yalnız açık "E" başarıdır; gösterim ile telefon okuması ayrı.
  #      Geçici QR betiği bloğun kurduğu ortamı GERÇEK d5-qr-test.js doğrulayıcısıyla ölçer (yol /portal/forgot-password değilse 4).
  $g0 = [ordered]@{ nodeExe = $real.Exe; chain = $okChain }
  foreach ($case in @(@('E', 0), @('H', 2), @('?', 3), @('e', 3), @('', 3))) {
    $env:EXSTUB_QR_RC = '0'; Set-Answers @($TestBase, $case[0])
    $q = $null; $qt = $null; try { $q = Invoke-QrTestMode $g0 } catch { $qt = $_.Exception.Message }
    Check ("Q-" + $(if ($case[0] -eq '') { 'boş' } else { $case[0] })) ("QrTest: R05 adresi + yanıt [" + $case[0] + "] → çıkış " + $case[1]) ($q -eq $case[1] -and @($q).Count -eq 1 -and $script:AnswerCalls -eq 2) "dönen=$q · istisna=$qt · soru=$($script:AnswerCalls)"
  }
  $env:EXSTUB_QR_RC = '4'; Set-Answers @($TestBase, 'E'); $qt = $null; $q = $null; try { $q = Invoke-QrTestMode $g0 } catch { $qt = $_.Exception.Message }
  Check 'Q-G' 'QrTest: gösterim başarısızsa (qr 4) owner "E" dese de DURUR (sıfır dışı); telefon sorusu SORULMAZ' ($qt -like 'EXTACC-D5-DUR:*' -and $null -eq $q -and $script:AnswerCalls -eq 1) "istisna=$qt · soru=$($script:AnswerCalls)"
  $env:EXSTUB_QR_RC = '0'; Set-Answers @($TestBase, 'E'); $qb = (Qr-Calls).Count; $nb = (Node-Calls).Count; $q = $null; $qt = $null; try { $q = Invoke-QrTestMode $g0 } catch { $qt = $_.Exception.Message }
  $qc = @(Qr-Calls); $ql = if ($qc.Count -gt $qb) { $qc[-1] | ConvertFrom-Json } else { $null }
  $qLeft = @($SecretEnv | Where-Object { Test-Path "Env:$_" })
  Check 'Q-D5' 'QrTest d5-qr-test.js''i çağırır (TEK çağrı; koşucu ÇAĞRILMAZ): D5_QRTEST_URL = <.env origin>/portal/forgot-password, D5_EXPECT_BASE_URL = .env origin; GERÇEK doğrulayıcı KABUL eder; eski EXA_QRTEST_URL, DB URL, GO, alıcı ortamda YOK; sonra ortam temiz' ($q -eq 0 -and ($qc.Count - $qb) -eq 1 -and ((Node-Calls).Count - $nb) -eq 0 -and $ql.ok -eq $true -and $ql.code -eq 0 -and $ql.url -ceq "$TestBase/portal/forgot-password" -and $ql.href -ceq $ql.url -and $ql.base -ceq $TestBase -and $null -eq $ql.exa -and $ql.db -eq $false -and $ql.go -eq $false -and $ql.rcpt -eq $false -and $qLeft.Count -eq 0) "çıkış=$q · qr çağrısı=$($qc.Count - $qb) · koşucu çağrısı=$((Node-Calls).Count - $nb) · doğrulayıcı=$($ql.ok)/$($ql.reason) · yol=$(([uri]$ql.url).AbsolutePath) · kalan=$($qLeft -join ',')"
  $qrBad = @()
  foreach ($bad in @('https://baska.invalid', 'https://example.invalid.baska.invalid', 'http://example.invalid', 'https://example.invalid/portal/forgot-password', '', '?')) {
    $env:EXSTUB_QR_RC = '0'; Set-Answers @($bad, 'E'); $qb = (Qr-Calls).Count; $qt = $null; $q = $null; try { $q = Invoke-QrTestMode $g0 } catch { $qt = $_.Exception.Message }
    if (-not ($qt -like 'EXTACC-D5-DUR:*' -and $qt -match 'R05' -and $null -eq $q -and ((Qr-Calls).Count - $qb) -eq 0 -and $script:AnswerCalls -eq 1)) { $qrBad += @("[$bad]") }
  }
  Check 'Q-R05' 'QrTest: owner''ın yazdığı R05 adresi .env değeriyle eşleşmezse (başka host / sonek / http / yollu / boş / ?) QR betiği ÇAĞRILMADAN DUR; telefon sorusu sorulmaz (6 durum)' (@($qrBad).Count -eq 0) "yanlış kabul=$(@($qrBad) -join ',')"
  # Negatif kontrol: geçici betikteki GERÇEK doğrulayıcı kör değil — biçim kapısı atlanıp yollu bir adres kurulursa (kapılar koşmamış gibi) QR reddedilir.
  $savedBase = $ExpBaseUrl; $ExpBaseUrl = 'https://example.invalid/x'; $env:EXSTUB_QR_RC = '0'; Set-Answers @('https://example.invalid/x', 'E'); $qb = (Qr-Calls).Count; $qt = $null; $q = $null
  try { $q = Invoke-QrTestMode $g0 } catch { $qt = $_.Exception.Message }; $ExpBaseUrl = $savedBase
  $qc = @(Qr-Calls); $ql = if ($qc.Count -gt $qb) { $qc[-1] | ConvertFrom-Json } else { $null }
  Check 'Q-NEG' 'negatif kontrol: beklenen origin yolluysa GERÇEK doğrulayıcı reddeder (4, beklenen-origin) → QrTest DURUR; owner "E" dese de başarı üretilmez' ($qt -like 'EXTACC-D5-DUR:*' -and $qt -match 'çıkış 4' -and $null -eq $q -and $ql -and $ql.ok -eq $false -and $ql.code -eq 4 -and $ql.reason -eq 'beklenen-origin') "istisna=$qt · doğrulayıcı=$($ql.ok)/$($ql.code)/$($ql.reason)"
  $ExpBaseUrl = $null; Set-Answers @($TestBase, 'E'); $qb = (Qr-Calls).Count; $qt = $null; $q = $null; try { $q = Invoke-QrTestMode $g0 } catch { $qt = $_.Exception.Message }; $ExpBaseUrl = $savedBase
  Check 'Q-NULL' 'QrTest: adres kapılarda çözülmemişse (null) owner''a sormadan DUR; QR betiği çağrılmaz' ($qt -like 'EXTACC-D5-DUR:*' -and $qt -match 'çözülmedi' -and $null -eq $q -and ((Qr-Calls).Count - $qb) -eq 0 -and $script:AnswerCalls -eq 0) "istisna=$qt"

  # ---- statik
  $src = [IO.File]::ReadAllText($wrapper)
  $body = ($funcs | Where-Object { $_.Name -eq 'Invoke-Node' } | Select-Object -First 1).Extent.Text
  $iS = $body.IndexOf('$global:LASTEXITCODE = -999'); $iC = $body.IndexOf('& $exe'); $iR = $body.IndexOf('$rc = $global:LASTEXITCODE')
  Check 'S-1' 'Invoke-Node: sentinel çağrıdan önce, yakalama hemen sonra' ($iS -ge 0 -and $iS -lt $iC -and $iC -lt $iR) "sentinel@$iS çağrı@$iC yakalama@$iR"
  Check 'S-2' 'başka `& node` yok' (-not ($src -match '&\s+node\b')) 'yok'
  $run = ($funcs | Where-Object { $_.Name -eq 'Invoke-RunMode' }).Extent.Text
  $iW = $run.IndexOf('Assert-LocalConsole'); $iR05 = $run.IndexOf('Confirm-PortalBaseUrlR05'); $iK = $run.IndexOf('Confirm-LiveDataProcessing'); $iA = $run.IndexOf('Read-Recipient'); $iS = $run.IndexOf('Confirm-SingleSend'); $iG = $run.IndexOf('Read-GoRef'); $iL = $run.IndexOf('Add-Content -LiteralPath $GoLedger'); $iN = $run.IndexOf('Invoke-Node')
  Check 'S-3' 'Run sırası: konsol → pencere teyidi → R05 adres teyidi → canlı veri onayı → alıcı → gönderim onayı → GO → defter → node' ($iW -ge 0 -and $iW -lt $iR05 -and $iR05 -lt $iK -and $iK -lt $iA -and $iA -lt $iS -and $iS -lt $iG -and $iG -lt $iL -and $iL -lt $iN) "konsol@$iW R05@$iR05 onay@$iK alıcı@$iA gönderim@$iS GO@$iG defter@$iL node@$iN"
  Check 'S-4' 'alıcı adresi hiçbir Set-Content/Add-Content/ConvertTo-Json satırında geçmez; sink kurulmaz' (-not ($src.Split("`n") | Where-Object { $_ -match 'Set-Content|Add-Content|ConvertTo-Json' -and $_ -match 'Recipient|D5_RECIPIENT' }) -and $src -notmatch '\$env:D5_TEST_DISPLAY_SINK\s*=') 'statik'
  $gates = ($funcs | Where-Object { $_.Name -eq 'Invoke-ReadOnlyGates' }).Extent.Text; $qrB = ($funcs | Where-Object { $_.Name -eq 'Invoke-QrTestMode' }).Extent.Text
  $urlLits = @([regex]::Matches($src, "https?://[A-Za-z0-9][A-Za-z0-9.-]*") | ForEach-Object { $_.Value } | Sort-Object -Unique)
  $urlBad = @($urlLits | Where-Object { $_ -notmatch '^http://127\.0\.0\.1$' })
  $strLits = @($ast.FindAll({ param($n) $n -is [Management.Automation.Language.StringConstantExpressionAst] -or $n -is [Management.Automation.Language.ExpandableStringExpressionAst] }, $true))
  $userPath = @($strLits | Where-Object { $_.Extent.Text -match '(?i)[A-Za-z]:\\Users\\' })
  Check 'S-5' 'public host / yerel kullanıcı yolu literali YOK (yalnız bu ikisi ölçülür; canlı yayın dizini, servis adları, yerel portlar ve DB adı gibi diğer yerel topoloji sabitleri blokta DURUR ve bu ölçütün kapsamı DIŞINDADIR): bloğun TAMAMINDA (yorumlar dahil) public host içeren http(s):// adresi yok (tek istisna yerel API 127.0.0.1); $ExpBaseUrl https:// literali DEĞİL ($null; .env''den, biçim kapısıyla); kanıt kökü $env:USERPROFILE''a göreli; "C:\Users\" hiçbir yerde yok' ($urlBad.Count -eq 0 -and $urlLits.Count -ge 1 -and $strLits.Count -gt 200 -and $userPath.Count -eq 0 -and $src -notmatch '(?i)[A-Za-z]:\\Users\\' -and $src -notmatch "\`\$ExpBaseUrl\s*=\s*'https://" -and $src -match '(?m)^\$ExpBaseUrl\s*=\s*\$null' -and $src -match '\$EvRoot\s*=\s*Join-Path \$env:USERPROFILE' -and $gates -match '\$script:ExpBaseUrl\s*=\s*\$baseUrl' -and $gates -match 'Assert-PortalBaseUrl \(EnvValue ''PUBLIC_PORTAL_BASE_URL''\)') "bulunan adres=$($urlLits -join ',') · yasak=$($urlBad -join ',') · incelenen metin sabiti=$($strLits.Count) · kullanıcı yolu=$($userPath.Count)"
  $qrCmds = @(Get-CommandNames ($funcs | Where-Object { $_.Name -eq 'Invoke-QrTestMode' }).Body)
  $iQc = $qrB.IndexOf('Assert-LocalConsole'); $iQr = $qrB.IndexOf('Confirm-PortalBaseUrlR05'); $iQn = $qrB.IndexOf('Invoke-Node')
  Check 'S-6' 'QrTest: d5-qr-test.js paket dizininden ($Sc) çağrılır; intake zincirinin QR betiği ve $QrSc blokta HİÇ geçmez; QR adresi "$ExpBaseUrl/portal/forgot-password"; sıra konsol → R05 teyidi → node; QrTest GO/alıcı/defter/koşucu içermez' ($qrB -match "Join-Path \`$Sc 'd5-qr-test\.js'" -and $src -notmatch 'extacc-qr-test' -and $src -notmatch '\$QrSc' -and $qrB -match '\$env:D5_QRTEST_URL = "\$ExpBaseUrl/portal/forgot-password"' -and $qrB -match '\$env:D5_EXPECT_BASE_URL = \$ExpBaseUrl' -and $src -notmatch '\$env:EXA_QRTEST_URL\s*=' -and $iQc -ge 0 -and $iQc -lt $iQr -and $iQr -lt $iQn -and -not ($qrCmds | Where-Object { $_ -in 'Read-GoRef', 'Read-Recipient', 'Add-Content', 'Set-RunEnv', 'Set-Content', 'New-Item' }) -and $qrB -notmatch 'd5-portal-reset-live-run') "konsol@$iQc R05@$iQr node@$iQn · komut=$($qrCmds -join ',')"
  $pinKeys = @([regex]::Matches($src, "(?m)^\s*'([^']+\.js)'\s*=\s*'[0-9A-F]{64}'") | ForEach-Object { $_.Groups[1].Value })
  $secDecl = $secAssign[0].Extent.Text
  Check 'S-7' 'pin listesi d5-qr-test.js içerir, intake QR betiğini İÇERMEZ; hiçbir pin sıfır/yer tutucu değil; D5_QRTEST_URL ve eski EXA_QRTEST_URL gizli ortam temizliğinde' (($pinKeys -contains 'client-extacc-portal-d5-r01\scripts\d5-qr-test.js') -and -not ($pinKeys | Where-Object { $_ -match 'extacc-qr-test' }) -and $pinKeys.Count -eq 9 -and $src -notmatch "'0{64}'" -and $secDecl -match "'D5_QRTEST_URL'" -and $secDecl -match "'EXA_QRTEST_URL'" -and $secDecl -match "'D5_EXPECT_BASE_URL'") "pin=$($pinKeys.Count)"
  # ---- yabancı kabul süreci deseni (inceleme bulgusu): D-6 / D-7 / D-8 koşucuları GÖRELİ yolla başlatılsa da yakalanır; eski alternatiflerin hiçbiri düşmedi
  $fpM = [regex]::Match($gates, "CommandLine -match '([^']+)'")
  $fpPat = if ($fpM.Success) { $fpM.Groups[1].Value } else { '' }
  $fpAlts = @($fpPat -split '\|')
  $fpNeed = @('i1\d-', 'i3-sink', 'i3-start-api', 'f04-', 'h5-url-', 'extacc-', 'd4-portal-', 'd5-portal-', 'd6-portal-', 'd7-portal-', 'd8-staff-')
  $fpMissing = @($fpNeed | Where-Object { $fpAlts -cnotcontains $_ })
  $fpHit = @('node d4-portal-live-run.js', 'node d5-portal-reset-live-run.js', 'node d6-portal-documents-live-run.js', 'node d7-portal-messages-live-run.js', 'node d8-staff-surface-probe.js',
             'node h5-url-live-run.js', 'node i13-live-run.js', 'node.exe "X:\gov\client-extacc-portal-d6-r01\scripts\d6-portal-documents-live-run.js"')
  $fpMiss = @('node --version', '"X:\nodejs\node.exe" X:\uygulama\dist\apps\api\src\main.js', 'node server.js', 'node X:\web\node_modules\next\dist\bin\next start')
  $fpNotCaught = @($fpHit | Where-Object { $fpPat -eq '' -or $_ -notmatch $fpPat })
  $fpFalse = @($fpMiss | Where-Object { $fpPat -ne '' -and $_ -match $fpPat })
  Check 'S-8' 'yabancı kabul süreci kapısı: desen eski 8 alternatifi KORUR ve d6-portal- / d7-portal- / d8-staff- içerir; göreli yolla başlatılan D-4..D-8 / H5 / I13 koşucuları eşleşir; uygulama süreçleri (node --version, API main.js, web) eşleşmez; süzgeç yalnız node.exe' ($fpM.Success -and $fpMissing.Count -eq 0 -and $fpAlts.Count -eq $fpNeed.Count -and $fpNotCaught.Count -eq 0 -and $fpFalse.Count -eq 0 -and $gates -match 'Filter "Name=''node\.exe''"' -and $gates -match 'if \(\$foreign\.Count -gt 0\) \{ Fail') "alternatif=$($fpAlts.Count) · eksik=$($fpMissing -join ',') · yakalanmayan=$($fpNotCaught.Count)/$($fpHit.Count) · yanlış pozitif=$($fpFalse.Count)/$($fpMiss.Count)"
  # ---- çıktı maskesi (inceleme bulgusu): ham çıktı yerel kullanıcı adını taşımaz
  $synth = 'kanıt dizini: C:\Users\birkullanici\AppData\Local\Temp\d5-x · D:\Users\bir.kullanici2\x'
  # Yakalama Out-String KULLANMAZ: Out-String konsol genişliğinde satır kaydırır ve yol parçasını iki satıra böler (WinPS 5.1'de yanlış negatif).
  function Get-HostText([scriptblock]$b) { return ((@(& $b 6>&1) | ForEach-Object { [string]$_ }) -join "`n") }
  $capS = Get-HostText { Write-Host $synth }
  $capT = Get-HostText { Write-Host ('kanıt dizini: ' + $T + ' · ' + $env:USERPROFILE + ' · ' + [IO.Path]::GetTempPath()) -ForegroundColor Yellow }
  $capP = Get-HostText { 'boru: C:\Users\birkullanici\x' | Write-Host }
  $capF = $null; try { $null = & { Fail 'node yolu bir dosya değil: [C:\Users\birkullanici\node.exe]' } 6>&1 } catch { $capF = $_.Exception.Message }
  $whCmd = Get-Command Write-Host
  $nameLeak = @($script:MaskNames | Where-Object { $capT -match [regex]::Escape([string]$_) })
  Check 'M-1' 'çıktı maskesi: Write-Host bu öz-testte maskeleyen fonksiyondur (blok fonksiyonlarının çıktısı dahil); sentetik kullanıcı yolu, boru hattı girdisi ve gerçek profil/geçici dizin yolu yazılırken kullanıcı adı ÇIKMAZ; metnin geri kalanı korunur; Fail istisna mesajı (karar girdisi) DEĞİŞMEZ' ($whCmd.CommandType -eq 'Function' -and $capS -notmatch 'birkullanici' -and $capS -notmatch 'bir\.kullanici2' -and $capS -match 'kanıt dizini: C:\\Users\\<kullanıcı>\\AppData\\Local\\Temp\\d5-x' -and $capP -notmatch 'birkullanici' -and $capP -match 'boru: C:\\Users\\<kullanıcı>\\x' -and $capT -match 'kanıt dizini' -and $capT -notmatch '(?i)\\Users\\(?!<kullanıcı>)' -and $nameLeak.Count -eq 0 -and $capF -like 'EXTACC-D5-DUR:*' -and $capF -match 'birkullanici') "Write-Host türü=$($whCmd.CommandType) · sentetik ad çıktıda=$($capS -match 'birkullanici') · boru ad çıktıda=$($capP -match 'birkullanici') · profil adı çıktıda=$($nameLeak.Count) · maskelenen ad sayısı=$($script:MaskNames.Count) · maskesiz \Users\ parçası=$(([regex]::Matches($capT, '(?i)\\Users\\(?!<kullanıcı>)')).Count) · satır=$(@($capT -split "`n").Count)"
}
catch {
  # Beklenmeyen istisna öz-testi SESSİZCE kesmez: FAIL satırı olarak kaydedilir (kalan ölçütler koşulmadı → sonuç PASS olamaz).
  Check 'X-0' 'öz-test beklenmeyen istisna ile yarıda kesildi — kalan ölçütler KOŞULMADI' $false ("istisna=" + $_.Exception.Message + ' · satır=' + $_.InvocationInfo.ScriptLineNumber)
}
finally {
  foreach ($k in 'EXSTUB_RC', 'EXSTUB_WRITE_EVID', 'EXSTUB_MARKER', 'EXSTUB_WAIT', 'EXSTUB_QR_RC', 'EXSTUB_FINDING', 'EXSTUB_D9', 'EXSTUB_OBS', 'EXSTUB_SESSREQ', 'EXSTUB_S0REQ', 'EXSTUB_REAL_QR', 'EXSTUB_QR_MARKER') { Remove-Item "Env:$k" -ErrorAction SilentlyContinue }
  Clear-SecretEnv
}

# Tablo satırları biçimlendirmeden (satır kaydırma) ÖNCE maskelenir: kaydırma bir adı iki satıra bölse bile çıktıya sızmaz.
$rows | ForEach-Object { [pscustomobject]@{ id = $_.id; sonuc = $_.sonuc; aciklama = (Hide-LocalUser ([string]$_.aciklama)); gozlem = (Hide-LocalUser ([string]$_.gozlem)) } } |
  Format-Table -AutoSize -Wrap | Out-String -Width 240 | Write-Host
# Gözlem dökümü: tablo genişliği gözlem sütununu düşürdüğü için ölçülen değerler ayrıca yazılır (yerel kullanıcı adı Write-Host maskesiyle arındırılır).
Write-Host 'GÖZLEMLER (her ölçütün ölçülen değeri):'
foreach ($r in $rows) { Write-Host ("  {0,-4} {1,-10} {2}" -f $r.sonuc, $r.id, (([string]$r.gozlem) -replace '([A-Za-z]:\\Users\\)[^\\]+', '$1<kullanıcı>')) }
Write-Host ''
$fail = @($rows | Where-Object { $_.sonuc -eq 'FAIL' }).Count
Write-Host ("EXTACC D-5 OWNER BLOĞU ÖZ-TESTİ [{0}]: PASS {1} / {2}" -f $ps, ($rows.Count - $fail), $rows.Count)
Write-Host ("  test edilen blok: d5-owner-live-block.ps1 sha256={0} · koşum başlangıcı (UTC)={1}" -f (Sha $wrapper), $startedUtc)
Write-Host ("  doğrulayıcısı kullanılan QR betiği: d5-qr-test.js sha256={0}" -f (Sha (Join-Path $here 'd5-qr-test.js')))   # log tek başına hangi sürümün koşulduğunu söyler
Write-Host ("  geçici dizin: {0}  (canlı kapılar, canlı .env, canlı DB ve GO KULLANILMADI)" -f ($T -replace '^([A-Za-z]:\\Users\\)[^\\]+', '$1<kullanıcı>'))
if ($fail -gt 0) { exit 1 }
exit 0
