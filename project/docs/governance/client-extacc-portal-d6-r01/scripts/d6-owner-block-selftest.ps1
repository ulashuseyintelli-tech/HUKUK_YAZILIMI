# ═══════════ EXTACC D-6 OWNER BLOĞU ÖZ-TESTİ (R01) — CANLIYA DOKUNMAZ ═══════════
# NE     : d6-owner-live-block.ps1 içindeki GERÇEK fonksiyonları (Invoke-RunMode, Invoke-RecoverMode, Invoke-Node, Complete-NodeRc,
#          Resolve-NodeExe, Confirm-LiveDataProcessing, Read-ResidueDecision, Write-OwnerDeclaration, Invoke-QrTestMode ...) AST ile yükler ve koşar.
#          Dosyanın AKIŞ bölümü (kapılar, canlı yollar) HİÇ ÇALIŞMAZ.
# YÖNLENDİRME: yalnız yol değişkenleri geçici dizine alınır ve etkileşim noktaları teste bağlanır: Read-GoRef (test GO), Read-Answer (kuyruktan
#          yanıt), Invoke-RepoGit (git grep "bulunmadı"), Assert-LocalConsole (test sürecinin çıktısı yönlendirildiği için no-op; GERÇEK hali
#          ayrıca K-1'de ölçülür), Clear-OwnerScreen (no-op). Node GERÇEKTİR: PATH'teki node + geçici betik ya da BAŞLATILAMAYAN dosya.
# R02    : G-1..G-4 + O-6..O-8 (2026-10-01) — blokta kapsamı adlandırılmamış "hiçbir … dosya/log/kanıt … yazılmaz" türü mutlak iddia yok
#          (yorumlar dahil) ve geçici portal parolası bloğun kanıt dizininde yok (G-1); owner'a GÖSTERİLEN onay metni telefon yüklemesinin
#          günlük (dosya adı maskesiz) + kova etkisini, kapanışta kalan boş kova dizinini ve çıkış 5/6'nın Recover yetkisi olmadığını yazar
#          (G-2); Recover çıkış 6 yeni bir Recover yetkisi değildir (G-3); Run çıkış 5/6 metni Run'ın kendi kapanışını Recover'dan ayırır,
#          blok tek node çağrısı yapar, çıkış 0'da koşum sonu metninde Recover yok (G-4); kapanış "DOĞRULANDI" metni kanıttaki ölçüt
#          verdict'lerinden kurulur — PASS olmayan parça "ÖLÇÜLMEDİ" / "FAIL" yazılır (O-6..O-8). Eski blok baytlarında bu 7 test FAIL verir.
# R02 ikinci tur (inceleme düzeltmeleri; yalnız yeni METNİ ölçen kalemler): G-3 yeniden yazıldı — Recover çıkış 6 metni İKİNCİ bir Recover
#          için yol TANIMLAMAZ ("bu paketle TANIMLI DEĞİLDİR; owner kararı gerektirir"; "YENİ ve AYRI onayla / sonraki Recover / BİR KEZ" yok);
#          G-5 onay metni kapsamı (iki sentetik tenant: kaynaktan + U-ISO yalnız sayı; bildirim: statik ölçüt T-1) ve kova dizini TEK adla
#          (portal-documents/<sentetik tenant>/); O-9 kapanış satırı "bu satırın devamında" + parçalar aynı satırda + satır rengi notu.
#          R02 ilk tur blok baytlarında (5AEF3893…) G-3, G-5, O-9 FAIL verir (negatif kontrol).
# KULLANIM: powershell.exe -NoProfile -ExecutionPolicy Bypass -File d6-owner-block-selftest.ps1   (ve pwsh)
# ÇIKIŞ  : 0 hepsi PASS · 1 en az bir FAIL · 2 ölçülemedi
$ErrorActionPreference = 'Stop'
$here    = $PSScriptRoot
$wrapper = Join-Path $here 'd6-owner-live-block.ps1'

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
        'Clear-SecretEnv', 'Read-GoRef', 'Read-Answer', 'Invoke-RepoGit', 'Assert-LocalConsole', 'Confirm-LiveDataProcessing', 'Read-ResidueDecision', 'Write-OwnerDeclaration', 'EnvValue', 'Test-BucketReadable',
        'Assert-PortalBaseUrl', 'Confirm-PortalBaseUrlR05'
$missing = @($need | Where-Object { -not (Get-Command $_ -CommandType Function -ErrorAction SilentlyContinue) })
if ($missing.Count -gt 0) { Write-Host "OLCULEMEDI: wrapper fonksiyonu yok: $($missing -join ',')"; exit 2 }
$script:RealAssertLocalConsole = ${function:Assert-LocalConsole}
$src0 = [IO.File]::ReadAllText($wrapper)

$T = Join-Path ([IO.Path]::GetTempPath()) ('d6-ownerblock-test-' + [Guid]::NewGuid().ToString('N').Substring(0, 8))
foreach ($d in 'sc', 'ev', 'rel', 'repo', 'bogus', 'badcmd', 'empty') { New-Item -ItemType Directory -Path (Join-Path $T $d) | Out-Null }
$Sc = Join-Path $T 'sc'; $EvRoot = Join-Path $T 'ev'; $GoLedger = Join-Path $EvRoot 'extacc-d6-goref-ledger.txt'
$Rel = Join-Path $T 'rel'; $Repo = Join-Path $T 'repo'; $Api = 'http://127.0.0.1:1/api'; $ExpBaseUrl = 'https://example.invalid'
$EnvFile = Join-Path $T 'fake.env'
[IO.File]::WriteAllText($EnvFile, "DATABASE_URL=postgresql://test-only:test-only@127.0.0.1:1/not_a_db`nPUBLIC_PORTAL_BASE_URL=https://example.invalid`n")
$script:LastNodeRc = $null
$marker = Join-Path $T 'node-calls.txt'
[IO.File]::WriteAllText((Join-Path $Sc 'd6-portal-documents-live-run.js'), @'
const fs = require('fs');
fs.appendFileSync(process.env.EXSTUB_MARKER, JSON.stringify({ mode: process.env.D6_MODE || null, db: !!process.env.AH_DATABASE_URL,
  go: !!process.env.D6_LIVE_GO_REF, receipt: !!process.env.D6_RECEIPT, display: process.env.D6_DISPLAY || null, slug: process.env.D6_EXPECT_TENANT_SLUG || null,
  residue: process.env.D6_RESIDUE_CLEANUP || null, sink: process.env.D6_TEST_DISPLAY_SINK || null, base: process.env.D6_EXPECT_BASE_URL || null,
  pw: process.env.D6_LIVE_LOGIN_PW || null,
  params: ['D6_WAIT_MS', 'D6_POLL_MS', 'D6_VIEW_MS', 'D6_HTTP_TIMEOUT_MS', 'D6_CALL_TIMEOUT_MS', 'D6_LATE_CREATE_MS', 'D6_RESIDUE_WAIT_MS'].map((k) => process.env[k] || null) }) + '\n');
if (process.env.EXSTUB_WRITE_EVID === '1') fs.writeFileSync(process.env.D6_EVID_FILE, JSON.stringify({ productFinding: process.env.EXSTUB_FINDING || null,
  results: [{ id: 'P6-WAIT', verdict: process.env.EXSTUB_WAIT || 'PASS' }, { id: 'P6-C-DOC', verdict: process.env.EXSTUB_DOC || 'PASS' }, { id: 'D6-1', verdict: 'PASS' }, { id: 'P6-PHONE-DOC', verdict: 'PASS' }, { id: 'P6-D9', verdict: process.env.EXSTUB_D9 || 'PASS' }]
    .concat(JSON.parse(process.env.EXSTUB_EXTRA || '[]')) }));
process.exit(Number(process.env.EXSTUB_RC || 0));
'@)
[IO.File]::WriteAllText((Join-Path $Sc 'd6-qr-test.js'), "if ((process.env.EXA_QRTEST_URL || '') !== 'https://example.invalid/portal/documents') process.exit(4); process.exit(Number(process.env.EXSTUB_QR_RC || 0));`n")
$bogusNode = Join-Path $T 'bogus\node.exe'; [IO.File]::WriteAllText($bogusNode, 'bu dosya bir çalıştırılabilir dosya DEĞİLDİR')
$goneNode  = Join-Path $T 'gone\node.exe'
[IO.File]::WriteAllText((Join-Path $T 'badcmd\node.cmd'), "@echo merhaba`r`n@exit /b 0`r`n")
$env:EXSTUB_MARKER = $marker

$rows = New-Object System.Collections.Generic.List[object]
function Check([string]$id, [string]$desc, [bool]$ok, [string]$obs) { $rows.Add([pscustomobject]@{ id = $id; sonuc = $(if ($ok) { 'PASS' } else { 'FAIL' }); aciklama = $desc; gozlem = $obs }) }
$script:goN = 10
$script:GoFmt = 'OWNER-GO-CLIENT-EXTACC-D6-20000101-R{0:D2}'
function Read-GoRef { $script:goN++; return ($script:GoFmt -f $script:goN) }
function Invoke-RepoGit { $global:LASTEXITCODE = 1 }
function Assert-LocalConsole { }
function Clear-OwnerScreen { }
$script:Answers = New-Object System.Collections.Generic.Queue[string]
function Read-Answer([string]$q) { if ($script:Answers.Count -gt 0) { return $script:Answers.Dequeue() } return '?' }
function Set-Answers([string[]]$a) { $script:Answers.Clear(); foreach ($x in $a) { $script:Answers.Enqueue($x) } }
$script:CmdExe = Join-Path $env:SystemRoot 'System32\cmd.exe'
function Set-PriorZero { & $script:CmdExe /c 'exit 0'; if ($global:LASTEXITCODE -ne 0) { throw 'önceki kod 0 yapılamadı' } }
$script:RealSetRunEnv = ${function:Set-RunEnv}
$script:PriorAtNode = $null
function Set-RunEnv { & $script:RealSetRunEnv @args; Set-PriorZero; $script:PriorAtNode = $global:LASTEXITCODE }
function Node-Calls { @(if (Test-Path -LiteralPath $marker) { Get-Content -LiteralPath $marker }) }
$okAnswers = @('E', 'https://example.invalid', 'EVET', 'B', '1', 'E', 'A', 'H', 'Y', 'B', 'M', 'G')   # pencere · R05 adresi · onay · beyan x9
$okChain = [pscustomobject]@{ loopbackCount = 1; otherAddresses = ''; loopbackPids = '4242'; caddyServiceState = 'Running'; caddyServicePid = 4242; cloudflaredStatus = 'Running' }
function Invoke-Mode([string]$mode, [string]$nodeExe, [int]$stubRc, [bool]$writeEvid, [string]$receipt = '', [string[]]$answers = $okAnswers, [string]$waitVerdict = 'PASS', $chain = $okChain) {
  $env:EXSTUB_RC = [string]$stubRc; $env:EXSTUB_WRITE_EVID = $(if ($writeEvid) { '1' } else { '0' }); $env:EXSTUB_WAIT = $waitVerdict
  Set-Answers $answers
  $g = [ordered]@{ head = 'test'; pkg = 'test'; dist = 'test'; envSha = 'test'; apiPid = 0; baseHost = 'example.invalid'; dataRootState = 'test'; bucketState = 'test-okunabilir'
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
function Last-EvDir { Get-ChildItem -LiteralPath $EvRoot -Directory -Filter 'extacc-d6-live-*' | Sort-Object LastWriteTimeUtc | Select-Object -Last 1 }
function Consumed-Rc { $d = Last-EvDir; (Get-Content -Raw -LiteralPath (Join-Path $d.FullName 'goref-consumed.json') | ConvertFrom-Json).exitCode }
$ps = "PS $($PSVersionTable.PSVersion) ($($PSVersionTable.PSEdition))"

try {
  $real = Resolve-NodeExe
  Check 'N-1' 'Resolve-NodeExe: gerçek node çözülür, --version geçer' ((Test-Path -LiteralPath $real.Exe -PathType Leaf) -and $real.Version -match '^v\d+\.\d+\.\d+$') "$($real.Version)"
  $savedPath = $env:PATH
  try {
    $env:PATH = Join-Path $T 'bogus'; Set-PriorZero; $m = $null; try { $null = Resolve-NodeExe } catch { $m = $_.Exception.Message }
    Check 'N-2' 'başlatılamayan node (önceki kod 0) → DUR' ($m -like 'EXTACC-D6-DUR:*' -and $m -match 'node') "mesaj=$m"
    $env:PATH = Join-Path $T 'badcmd'; Set-PriorZero; $m = $null; try { $null = Resolve-NodeExe } catch { $m = $_.Exception.Message }
    Check 'N-3' 'node --version beklenmeyen çıktı → DUR' ($m -like 'EXTACC-D6-DUR:*' -and $m -match 'version') "mesaj=$m"
    $env:PATH = Join-Path $T 'empty'; $m = $null; try { $null = Resolve-NodeExe } catch { $m = $_.Exception.Message }
    Check 'N-4' 'node yok → DUR' ($m -like 'EXTACC-D6-DUR:*') "mesaj=$m"
  } finally { $env:PATH = $savedPath }

  # ---- Run öncesi owner kararları: reddedilirse GO sorulmaz, defter yazılmaz, node çağrılmaz
  $r = Invoke-Mode 'Run' $real.Exe 0 $true '' @('H')
  Check 'K-2' 'bağımsız pencere teyit edilmezse DUR; GO defteri yazılmaz; node çağrılmaz' ($r.threw -like 'EXTACC-D6-DUR:*' -and $r.ledgerDelta -eq 0 -and $r.nodeCalls -eq 0) "mesaj=$($r.threw) · defter+=$($r.ledgerDelta)"
  $r = Invoke-Mode 'Run' $real.Exe 0 $true '' @('E', 'https://example.invalid', 'evet')
  Check 'K-3' 'canlı veri işleme "EVET" (büyük harf) değilse DUR; defter yazılmaz; node çağrılmaz' ($r.threw -like 'EXTACC-D6-DUR:*' -and $r.threw -match 'onaylanmadı' -and $r.ledgerDelta -eq 0 -and $r.nodeCalls -eq 0) "mesaj=$($r.threw)"
  $r = Invoke-Mode 'Run' $real.Exe 0 $true '' @('E', 'https://baska.invalid', 'EVET')
  Check 'K-6' 'R05 adresi: owner''ın yazdığı adres .env değeriyle eşleşmezse canlı veri onayından ÖNCE DUR; GO sorulmaz; defter yazılmaz; node çağrılmaz' ($r.threw -like 'EXTACC-D6-DUR:*' -and $r.threw -match 'R05' -and $r.ledgerDelta -eq 0 -and $r.nodeCalls -eq 0) "mesaj=$($r.threw)"
  $r = Invoke-Mode 'Run' $real.Exe 0 $true '' @('E', ' HTTPS://Example.INVALID/ ', 'EVET', 'B', '1', 'E', 'A', 'H', 'Y', 'B', 'M', 'G')
  Check 'K-6b' 'R05 adresi: boşluk / sondaki "/" / büyük-küçük harf farkı eşleşmeyi bozmaz (koşum 0)' ($r.out -eq 0 -and $r.nodeCalls -eq 1 -and $r.last.base -eq 'https://example.invalid') "rc=$($r.out) · origin=$($r.last.base)"
  $okU = $null; try { $okU = Assert-PortalBaseUrl 'https://portal.example.com' } catch { $okU = 'DUR' }
  $badU = @(); foreach ($u in 'http://portal.example.com', 'https://portal.example.com/portal', 'https://portal.example.com:8443', 'https://127.0.0.1', 'https://localhost', 'https://portal.example.com?x=1', '') { try { $null = Assert-PortalBaseUrl $u; $badU += "KABUL:$u" } catch { if ($_.Exception.Message -notlike 'EXTACC-D6-DUR:*') { $badU += "BASKA:$u" } } }
  Check 'K-7' 'Assert-PortalBaseUrl: https://<alan adı> kabul; http / yol / port / IP / localhost / sorgu / boş → DUR' ($okU -eq 'https://portal.example.com' -and $badU.Count -eq 0) "kabul=$okU · yanlış kabul=$($badU -join ',')"
  $savedBase = $ExpBaseUrl; $ExpBaseUrl = $null; $m = $null; Set-Answers @('https://example.invalid'); try { Confirm-PortalBaseUrlR05 } catch { $m = $_.Exception.Message }; $ExpBaseUrl = $savedBase
  Check 'K-8' 'Confirm-PortalBaseUrlR05: adres kapılarda çözülmemişse (null) DUR' ($m -like 'EXTACC-D6-DUR:*' -and $m -match 'çözülmedi') "mesaj=$m"
  $gs = $script:goN; $script:GoFmt = 'OWNER-GO-CLIENT-EXTACC-D5-20000101-R{0:D2}'; $r = Invoke-Mode 'Run' $real.Exe 0 $true; $script:GoFmt = 'OWNER-GO-CLIENT-EXTACC-D6-20000101-R{0:D2}'; $script:goN = $gs
  Check 'K-4' 'D-5 GO biçimi D-6 için REDDEDİLİR; defter yazılmaz; node çağrılmaz' ($r.threw -like 'EXTACC-D6-DUR:*' -and $r.threw -match 'BİÇİMİ' -and $r.ledgerDelta -eq 0 -and $r.nodeCalls -eq 0) "mesaj=$($r.threw)"
  $m = $null; try { & $script:RealAssertLocalConsole } catch { $m = $_.Exception.Message }
  Check 'K-1' 'GERÇEK Assert-LocalConsole: çıktısı yönlendirilmiş süreçte DURUR (giriş bilgisi gösterilmez)' ($m -like 'EXTACC-D6-DUR:*') "mesaj=$m"
  $ev0 = EnvValue 'HUKUK_DATA_ROOT' -Optional
  Check 'K-5' 'EnvValue -Optional: .env''de olmayan anahtar DUR vermez (null); zorunlu anahtar tek geçiş' ($null -eq $ev0 -and (EnvValue 'PUBLIC_PORTAL_BASE_URL') -eq 'https://example.invalid') "opsiyonel=$ev0"
  # ---- Belge kovası okunabilirliği (inceleme R01): gerçek dizin + gerçek ACL reddi
  $bRoot = Join-Path $T 'bucket-root'; New-Item -ItemType Directory -Path $bRoot | Out-Null
  Check 'B-1' 'Test-BucketReadable: HUKUK_DATA_ROOT .env''de yoksa "env-dosyasinda-yok" (DUR yok)' ((Test-BucketReadable $null) -eq 'env-dosyasinda-yok' -and (Test-BucketReadable '') -eq 'env-dosyasinda-yok') 'null/boş'
  Check 'B-2' 'Test-BucketReadable: portal-documents alt dizini henüz yoksa not (DUR yok)' ((Test-BucketReadable $bRoot) -eq 'kova-alt-dizini-henuz-yok') 'alt dizin yok'
  $bDir = Join-Path $bRoot 'portal-documents'; New-Item -ItemType Directory -Path $bDir | Out-Null; [IO.File]::WriteAllText((Join-Path $bDir 'x.pdf'), 'x')
  Check 'B-3' 'Test-BucketReadable: alt dizin var ve listelenebiliyor → "okunabilir"' ((Test-BucketReadable $bRoot) -eq 'okunabilir') 'okunabilir'
  $bm = $null; $bDenied = $false
  try {
    & icacls.exe $bDir /deny "$($env:USERNAME):(RD)" *> $null; $bDenied = ($LASTEXITCODE -eq 0)
    try { $null = Test-BucketReadable $bRoot } catch { $bm = $_.Exception.Message }
  } finally { & icacls.exe $bDir /remove:d "$env:USERNAME" *> $null }
  Check 'B-4' 'Test-BucketReadable: alt dizin liste (RD) reddiyle OKUNAMIYORSA DUR (sahte "yok" riski)' ($bDenied -and $bm -like 'EXTACC-D6-DUR:*' -and $bm -match 'OKUNAMIYOR') "deny=$bDenied · mesaj=$bm"
  Check 'B-5' 'Test-BucketReadable: ACL geri alınınca yine "okunabilir"; Invoke-ReadOnlyGates kovayı çağırır ve sonuca koyar' ((Test-BucketReadable $bRoot) -eq 'okunabilir' -and (($funcs | Where-Object { $_.Name -eq 'Invoke-ReadOnlyGates' }).Extent.Text -match '\$bucketState = Test-BucketReadable \$dataRoot') -and (($funcs | Where-Object { $_.Name -eq 'Invoke-ReadOnlyGates' }).Extent.Text -match 'bucketState = \$bucketState')) 'statik+geri alma'

  # ---- RUN
  $r = Invoke-Mode 'Run' $real.Exe 0 $true
  $d = Last-EvDir; $decl = Get-Content -Raw -LiteralPath (Join-Path $d.FullName 'owner-declaration.json') | ConvertFrom-Json
  $man = Get-Content -LiteralPath (Join-Path $d.FullName 'SHA256-MANIFEST.txt')
  Check 'R-1' 'Run: node 0 + kanıt → 0; node run modunda, D6_DISPLAY=conout, slug ah-<runId>, GO/DB/makbuz ortamla; kalıntı kararı KURULMADI (yalnız Recover); sink KURULMADI; ortam temizlendi; defter +1' ($r.out -eq 0 -and $r.count -eq 1 -and $r.nodeCalls -eq 1 -and $r.last.mode -eq 'run' -and $r.last.display -eq 'conout' -and $r.last.slug -match '^ah-[0-9a-f]{8}$' -and $r.last.db -and $r.last.go -and $r.last.receipt -and $null -eq $r.last.residue -and $null -eq $r.last.sink -and $r.last.base -eq 'https://example.invalid' -and $r.secretsLeft -eq 0 -and $r.ledgerDelta -eq 1 -and (Consumed-Rc) -eq 0) "rc=$($r.out) · display=$($r.last.display) · kalıntı=$($r.last.residue) · kalan gizli=$($r.secretsLeft)"
  $blk = Get-Content -Raw -LiteralPath (Join-Path $d.FullName 'owner-block.json'); $allTxt = (Get-ChildItem -LiteralPath $d.FullName -File | ForEach-Object { Get-Content -Raw -LiteralPath $_.FullName }) -join "`n"
  Check 'R-9' 'kanıt dizininde GO literali ve DB URL yok; owner-block.json plannedRealSends=0, machineMeasuredUpload=kosucu, phoneUploadOptional=true, bucketState kayıtlı' ($allTxt -notmatch 'OWNER-GO-CLIENT-EXTACC-D6-20000101' -and $allTxt -notmatch 'test-only' -and $blk -match '"plannedRealSends":\s*0' -and $blk -match '"machineMeasuredUpload":\s*"kosucu"' -and $blk -match '"phoneUploadOptional":\s*true' -and $blk -match '"bucketState":\s*"test-okunabilir"') "dosya=$((Get-ChildItem -LiteralPath $d.FullName -File).Count)"
  Check 'R-8' 'owner beyanı AYRI dosyada (makine ölçümü değil notu; 9 yönlendirmesiz soru; owner''a gösterilen kapanış metni kayıtlı) ve manifestte' ($decl.record -eq 'EXTACC-D6-OWNER-DECLARATION' -and $decl.not -match 'beyan' -and $decl.girisSonrasiEkran -eq 'B' -and $decl.listedekiBelgeSayisi -eq '1' -and $decl.ekrandakiBaslikGoruldu -eq 'E' -and $decl.indirmeSonucu -eq 'A' -and $decl.telefondanYuklemeYapildi -eq 'H' -and $decl.telefonYuklemesiSilindi -eq 'Y' -and $decl.silmeSonrasiListe -eq 'B' -and $decl.telefonAgi -eq 'M' -and $decl.yenilemeSonrasiEkran -eq 'G' -and $decl.closureShownToOwner -match 'DOĞRULANDI' -and (@($man | Where-Object { $_ -match 'owner-declaration\.json$' }).Count -eq 1)) "beyan=$($decl.girisSonrasiEkran)/$($decl.listedekiBelgeSayisi)/$($decl.ekrandakiBaslikGoruldu)/$($decl.indirmeSonucu)/$($decl.telefondanYuklemeYapildi)/$($decl.telefonYuklemesiSilindi)/$($decl.silmeSonrasiListe)/$($decl.telefonAgi)/$($decl.yenilemeSonrasiEkran) · kapanış=$($decl.closureShownToOwner)"
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
  Check 'R-6' 'aynı GO ikinci kez → DUR (defter), node çağrılmaz' ($r.threw -like 'EXTACC-D6-DUR:*' -and $r.threw -match 'KULLANILDI' -and $r.nodeCalls -eq 0) "mesaj=$($r.threw)"
  $script:goN = 50
  $r = & { function node { }; Invoke-Mode 'Run' $real.Exe 0 $true }
  Check 'R-7' '`node` fonksiyon gölgesi varken gerçek node dosya yoluyla koşar' ($r.out -eq 0 -and $r.nodeCalls -eq 1) "rc=$($r.out) · node=$($r.nodeCalls)"

  # ---- RECOVER
  $rd = Join-Path $EvRoot 'recover-case'; New-Item -ItemType Directory -Path $rd | Out-Null
  $rcpt = Join-Path $rd 'd6-setup-receipt.json'
  '{"record":"EXTACC-D6-SETUP-RECEIPT","runId":"0123abcd","tenantId":"t","tenantSlug":"ah-0123abcd","caseId":"c","clientId":"k","elevUserId":"u","elevEmail":"e@example.invalid"}' | Set-Content -LiteralPath $rcpt -Encoding ASCII
  $r = Invoke-Mode 'Recover' $real.Exe 0 $true $rcpt @('E')
  Check 'V-0' 'Recover: kalıntı kararı (E) node''a D6_RESIDUE_CLEANUP=1 olarak geçer' ($r.last.residue -eq '1' -and $r.last.mode -eq 'recover') "kalıntı=$($r.last.residue)"
  $r = Invoke-Mode 'Recover' $real.Exe 0 $true $rcpt @('x')
  Check 'V-5' 'Recover: kalıntı kararı E/H değilse DUR; node çağrılmaz' ($r.threw -like 'EXTACC-D6-DUR:*' -and $r.threw -match 'kalıntı' -and $r.nodeCalls -eq 0) "mesaj=$($r.threw)"
  $r = Invoke-Mode 'Recover' $real.Exe 0 $true $rcpt @('H')
  $rz = Invoke-Mode 'Recover' $real.Exe 0 $true $rcpt @('H') 'PASS' ([pscustomobject]@{ loopbackCount = 0; otherAddresses = '0.0.0.0'; loopbackPids = ''; caddyServiceState = 'Stopped'; caddyServicePid = 0; cloudflaredStatus = 'Stopped' })
  Check 'Z-8' 'Recover: dış zincir BOZUKKEN de kapanış yapılabilir (çıkış 0, node koştu)' ($rz.out -eq 0 -and $rz.nodeCalls -eq 1 -and -not $rz.threw) "rc=$($rz.out) · istisna=$($rz.threw)"
  Check 'V-1' 'Recover: node 0 + kanıt → 0; recover modu + makbuz + kalıntı=0; ortam temiz; defter DEĞİŞMEZ' ($r.out -eq 0 -and $r.nodeCalls -eq 1 -and $r.last.mode -eq 'recover' -and $r.last.receipt -and $r.last.residue -eq '0' -and $r.secretsLeft -eq 0 -and $r.ledgerDelta -eq 0) "rc=$($r.out)"
  $r = Invoke-Mode 'Recover' $real.Exe 6 $true $rcpt @('H')
  Check 'V-2' 'Recover: 6 değişmeden' ($r.out -eq 6 -and $r.nodeCalls -eq 1) "rc=$($r.out)"
  $r = Invoke-Mode 'Recover' $real.Exe 0 $false $rcpt @('H')
  Check 'V-3' 'Recover: kanıt yok → 7' ($r.out -eq 7) "rc=$($r.out)"
  $r = Invoke-Mode 'Recover' $bogusNode 0 $true $rcpt @('H')
  Check 'V-4' 'Recover: önceki kod 0 iken node başlatılamaz → 91' ($r.out -eq 91 -and $r.nodeCalls -eq 0 -and $r.prior -eq 0) "rc=$($r.out)"

  # ---- CANLI SÜRELER: pencereden devralınan değerler canlı süreleri DEĞİŞTİREMEZ
  foreach ($k in 'D6_WAIT_MS', 'D6_POLL_MS', 'D6_VIEW_MS', 'D6_HTTP_TIMEOUT_MS', 'D6_CALL_TIMEOUT_MS', 'D6_LATE_CREATE_MS', 'D6_RESIDUE_WAIT_MS') { Set-Item -Path "Env:$k" -Value '1' }
  $script:goN = 70; $r = Invoke-Mode 'Run' $real.Exe 0 $true
  $exp = @('1200000', '5000', '120000', '15000', '30000', '120000', '300000')
  $saved = $LiveParams; $LiveParams = $null; $script:goN = 72
  $r2 = Invoke-Mode 'Run' $real.Exe 0 $true
  $LiveParams = $saved
  Check 'L-2' 'Run: canlı süre tablosu eksikse node BAŞLAMAZ (sessizce devralınan değerlerle koşmaz)' ($r2.threw -like 'EXTACC-D6-DUR:*' -and $r2.threw -match 'süre tablosu' -and $r2.nodeCalls -eq 0) "mesaj=$($r2.threw)"
  Check 'L-1' 'Run: devralınan 7 süre değişkeni (=1) node''a CANLI değerlerle geçer (20 dk bekleme / 5 sn yoklama / 120 sn inceleme / zaman aşımları / 120 sn geç oluşma / 5 dk kalıntı bekleme) ve sonra temizlenir' (($r.last.params -join ',') -eq ($exp -join ',') -and $r.secretsLeft -eq 0) "node gördü=$($r.last.params -join ',') · kalan=$($r.secretsLeft)"

  # ---- OWNER METNİ: kapanış metni kanıta bağlı; koşulsuz "kapatıldı" yok; sorular yönlendirmesiz
  $env:EXSTUB_D9 = 'FAIL'; $env:EXSTUB_DOC = 'FAIL'; $script:goN = 80; $r = Invoke-Mode 'Run' $real.Exe 6 $true; $env:EXSTUB_D9 = 'PASS'; $env:EXSTUB_DOC = 'PASS'
  $d = Last-EvDir; $declF = Get-Content -Raw -LiteralPath (Join-Path $d.FullName 'owner-declaration.json') | ConvertFrom-Json
  Check 'O-1' 'P6-D9 FAIL (çıkış 6): owner''a gösterilen metin "DOĞRULANAMADI", "DOĞRULANDI (" değil' ($r.out -eq 6 -and $declF.closureShownToOwner -match 'DOĞRULANAMADI' -and $declF.closureShownToOwner -notmatch 'DOĞRULANDI \(') "metin=$($declF.closureShownToOwner)"
  $cs = Get-ClosureStatus (Join-Path $T 'yok\d6-evidence.json') 7
  Check 'O-2' 'kanıt okunamazsa kapanış DOĞRULANAMADI sayılır' (-not $cs.verified -and $cs.text -match 'DOĞRULANAMADI') "metin=$($cs.text)"
  $declBody = ($funcs | Where-Object { $_.Name -eq 'Write-OwnerDeclaration' }).Extent.Text
  $leading = @('döndü mü', 'görünmedi mi', 'YALNIZ konsolda', 'oturumun kapandığını', 'kapatıldı', 'silindi mi', 'boş muydu', 'reddedildi mi')
  $hits = @($leading | Where-Object { $declBody -match [regex]::Escape($_) })
  $srcAll = [IO.File]::ReadAllText($wrapper)
  Check 'O-3' 'owner beyanı soruları yönlendirmesiz (seçenekli); bloğun hiçbir yerinde koşulsuz "erişimi kapatıldı" yok; 9 soru' ($hits.Count -eq 0 -and $srcAll -notmatch 'erişimi kapatıldı' -and ([regex]::Matches($declBody, 'Read-Answer')).Count -eq 9) "yönlendiren=$($hits -join ',') · soru=$(([regex]::Matches($declBody, 'Read-Answer')).Count)"
  $confBody = ($funcs | Where-Object { $_.Name -eq 'Confirm-LiveDataProcessing' }).Extent.Text
  Check 'O-4' 'canlı veri işleme onay metni kaynakla uyumlu: yükleme günlüğü MASKESİZ (kaynak portal.service.ts maskEmail kullanmaz); "maskelenmiş" iddiası yok' ($confBody -match 'MASKESİZ' -and $confBody -notmatch 'maskelenmiş') 'metin'
  $recBody = ($funcs | Where-Object { $_.Name -eq 'Invoke-RecoverMode' }).Extent.Text
  Check 'O-5' 'Recover bitiş metni 0''ı olduğundan güçlü anlatmaz: "0 = portal hesabı hiç açılmamıştı … HTTP reddi ÖLÇÜLMEDİ"; "mevcut oturum reddi Recover''da ÖLÇÜLEMEZ"; erişim ölçülemedi yönlendirmesi' ($recBody -match 'hiç açılmamıştı' -and $recBody -match 'HTTP reddi ÖLÇÜLMEDİ' -and $recBody -match "mevcut oturum reddi Recover'da ÖLÇÜLEMEZ" -and $recBody -notmatch '0 kapanış \+ HTTP reddi' -and $recBody -match 'okunabilirliği') 'metin'

  # ---- DIŞ ZİNCİR: doğrulanamazsa Preflight/Run DURUR; Recover engellenmez
  $bad = @{
    'Z-1 8081 loopback dinleyicisi yok'            = [pscustomobject]@{ loopbackCount = 0; otherAddresses = ''; loopbackPids = ''; caddyServiceState = 'Running'; caddyServicePid = 4242; cloudflaredStatus = 'Running' }
    'Z-2 8081 başka arayüzde de dinliyor (0.0.0.0)' = [pscustomobject]@{ loopbackCount = 1; otherAddresses = '0.0.0.0'; loopbackPids = '4242'; caddyServiceState = 'Running'; caddyServicePid = 4242; cloudflaredStatus = 'Running' }
    'Z-3 dinleyici HY-Caddy servisine ait değil'  = [pscustomobject]@{ loopbackCount = 1; otherAddresses = ''; loopbackPids = '999'; caddyServiceState = 'Running'; caddyServicePid = 4242; cloudflaredStatus = 'Running' }
    'Z-4 HY-Caddy servisi yok'                     = [pscustomobject]@{ loopbackCount = 1; otherAddresses = ''; loopbackPids = '4242'; caddyServiceState = 'YOK'; caddyServicePid = 0; cloudflaredStatus = 'Running' }
    'Z-5 Cloudflared durmuş'                       = [pscustomobject]@{ loopbackCount = 1; otherAddresses = ''; loopbackPids = '4242'; caddyServiceState = 'Running'; caddyServicePid = 4242; cloudflaredStatus = 'Stopped' }
  }
  foreach ($name in ($bad.Keys | Sort-Object)) {
    $m = $null; try { Assert-ExternalChain $bad[$name] } catch { $m = $_.Exception.Message }
    Check ($name.Substring(0, 3)) ("Assert-ExternalChain: " + $name.Substring(4) + ' → DUR') ($m -like 'EXTACC-D6-DUR:*') "mesaj=$m"
  }
  $m = 'yok'; try { Assert-ExternalChain $okChain; $m = $null } catch { $m = $_.Exception.Message }
  Check 'Z-0' 'Assert-ExternalChain: sağlıklı zincir (yalnız loopback, pid = servis, Cloudflared çalışıyor) geçer' ($null -eq $m) "mesaj=$m"
  $script:goN = 71; $r = Invoke-Mode 'Run' $real.Exe 0 $true '' $okAnswers 'PASS' $bad['Z-5 Cloudflared durmuş']
  Check 'Z-6' 'Run: dış zincir eksikse GO sorulmadan DURUR; defter yazılmaz; node çağrılmaz' ($r.threw -like 'EXTACC-D6-DUR:*' -and $r.threw -match 'Cloudflared' -and $r.ledgerDelta -eq 0 -and $r.nodeCalls -eq 0) "mesaj=$($r.threw)"
  $pre = $src0.Substring($src0.IndexOf('if ($Mode -eq ''Preflight'')'))
  Check 'Z-7' 'Preflight: dış zincir kapısı "PREFLIGHT GEÇTİ" yazısından ÖNCE' ($pre.IndexOf('Assert-ExternalChain $g.chain') -ge 0 -and $pre.IndexOf('Assert-ExternalChain $g.chain') -lt $pre.IndexOf('PREFLIGHT GEÇTİ')) 'sıra'

  # ---- QR DENEMESİ: yalnız açık "E" başarıdır; gösterim ile telefon okuması ayrı; URL /portal/documents (stub başka URL'de 4 döner)
  $g0 = [ordered]@{ nodeExe = $real.Exe; chain = $okChain }
  foreach ($case in @(@('E', 0), @('H', 2), @('?', 3), @('e', 3), @('', 3))) {
    $env:EXSTUB_QR_RC = '0'; Set-Answers @('https://example.invalid', $case[0])
    $q = $null; $qt = $null; try { $q = Invoke-QrTestMode $g0 } catch { $qt = $_.Exception.Message }
    Check ("Q-" + $(if ($case[0] -eq '') { 'boş' } else { $case[0] })) ("QrTest: R05 adresi + yanıt [" + $case[0] + "] → çıkış " + $case[1]) ($q -eq $case[1] -and @($q).Count -eq 1) "dönen=$q · istisna=$qt"
  }
  $env:EXSTUB_QR_RC = '4'; Set-Answers @('https://example.invalid', 'E'); $qt = $null; $q = $null; try { $q = Invoke-QrTestMode $g0 } catch { $qt = $_.Exception.Message }
  Check 'Q-G' 'QrTest: gösterim başarısızsa (qr 4) owner "E" dese de DURUR (sıfır dışı)' ($qt -like 'EXTACC-D6-DUR:*' -and $null -eq $q) "istisna=$qt"
  $env:EXSTUB_QR_RC = '0'; Set-Answers @('https://baska.invalid', 'E'); $qt = $null; $q = $null; try { $q = Invoke-QrTestMode $g0 } catch { $qt = $_.Exception.Message }
  Check 'Q-R05' 'QrTest: owner''ın yazdığı R05 adresi .env değeriyle eşleşmezse QR gösterilmeden DUR' ($qt -like 'EXTACC-D6-DUR:*' -and $qt -match 'R05' -and $null -eq $q) "istisna=$qt"

  # ---- statik
  $src = [IO.File]::ReadAllText($wrapper)
  $body = ($funcs | Where-Object { $_.Name -eq 'Invoke-Node' } | Select-Object -First 1).Extent.Text
  $iS = $body.IndexOf('$global:LASTEXITCODE = -999'); $iC = $body.IndexOf('& $exe'); $iR = $body.IndexOf('$rc = $global:LASTEXITCODE')
  Check 'S-1' 'Invoke-Node: sentinel çağrıdan önce, yakalama hemen sonra' ($iS -ge 0 -and $iS -lt $iC -and $iC -lt $iR) "sentinel@$iS çağrı@$iC yakalama@$iR"
  Check 'S-2' 'başka `& node` yok' (-not ($src -match '&\s+node\b')) 'yok'
  $run = ($funcs | Where-Object { $_.Name -eq 'Invoke-RunMode' }).Extent.Text
  $iW = $run.IndexOf('Assert-LocalConsole'); $iK = $run.IndexOf('Confirm-LiveDataProcessing'); $iG = $run.IndexOf('Read-GoRef'); $iL = $run.IndexOf('Add-Content -LiteralPath $GoLedger'); $iN = $run.IndexOf('Invoke-Node')
  Check 'S-3' 'Run sırası: konsol → pencere teyidi → canlı veri onayı → GO → defter → node; alıcı/gönderim/ezme soruları YOK' ($iW -ge 0 -and $iW -lt $iK -and $iK -lt $iG -and $iG -lt $iL -and $iL -lt $iN -and $run -notmatch 'Read-Recipient|Confirm-SingleSend|Read-ScrubDecision|Read-ResidueDecision') "konsol@$iW onay@$iK GO@$iG defter@$iL node@$iN"
  Check 'S-4' 'sink kurulmaz; D6_RESIDUE_CLEANUP yalnız Invoke-RecoverMode içinde kurulur; QR URL /portal/documents' ($src -notmatch '\$env:D6_TEST_DISPLAY_SINK\s*=' -and ([regex]::Matches($src, '\$env:D6_RESIDUE_CLEANUP\s*=')).Count -eq 1 -and (($funcs | Where-Object { $_.Name -eq 'Invoke-RecoverMode' }).Extent.Text -match '\$env:D6_RESIDUE_CLEANUP\s*=') -and $src -match '/portal/documents"') 'statik'
  $gates = ($funcs | Where-Object { $_.Name -eq 'Invoke-ReadOnlyGates' }).Extent.Text; $qrB = ($funcs | Where-Object { $_.Name -eq 'Invoke-QrTestMode' }).Extent.Text
  $iR05 = $run.IndexOf('Confirm-PortalBaseUrlR05'); $iConf = $run.IndexOf('Confirm-LiveDataProcessing')
  Check 'S-5' 'topoloji literali yok: $ExpBaseUrl https:// literali DEĞİL (.env''den, biçim kapısıyla); kanıt kökü $env:USERPROFILE''a göreli; "C:\Users\" yok; R05 onayı Run''da canlı veri onayından ÖNCE ve QrTest''te' ($src -notmatch "\`\$ExpBaseUrl\s*=\s*'https://" -and $src -notmatch 'C:\\Users\\' -and $src -match '\$EvRoot\s*=\s*Join-Path \$env:USERPROFILE' -and $gates -match '\$script:ExpBaseUrl\s*=\s*\$baseUrl' -and $gates -match 'Assert-PortalBaseUrl \(EnvValue ''PUBLIC_PORTAL_BASE_URL''\)' -and $iR05 -ge 0 -and $iR05 -lt $iConf -and $qrB -match 'Confirm-PortalBaseUrlR05') "R05@$iR05 onay@$iConf"

  # ---- R02 (2026-10-01) METİN ÖLÇÜMLERİ: hem kaynakta (yorumlar DAHİL) hem owner'a GÖSTERİLEN metinde (Write-Host yakalaması, 6>&1) ölçülür.
  #      Owner kuralı: Run çıkış 5/6 otomatik Recover yetkisi DEĞİLDİR; Run'ın koşucu içindeki kendi kapanış adımları ile ayrıca başlatılan
  #      Recover AYRIDIR; Recover yalnız kanıt incelendikten sonra AYRI owner onayıyla, BİR kez başlatılır; blok Recover'ı başlatmaz.
  #      Bu 7 testin eski blok baytlarına karşı FAIL verdiği ayrıca ölçülür (negatif kontrol).
  function Get-HostText([scriptblock]$b) { return ((@(& $b 6>&1) | ForEach-Object { [string]$_ }) -join "`n") }
  $absRe = '(?i)h[iİı]çb[iİı]r[^\r\n]{0,40}(dosya|log|günlü|kanıt|rapor)[^\r\n]{0,40}(yazılmaz|yazmaz|YAZILMAZ|YAZMAZ)'
  $absPos = @('GO ref ve token''lar hiçbir dosyaya yazılmaz', 'Hiçbir dosyaya/kanıta yazılmaz.', 'parola HİÇBİR log dosyasına YAZILMAZ', 'DB URL''yi hiçbir kanıta yazmaz')
  $absNeg = @('GO sorulmaz, hiçbir şey yazılmaz', 'bu blok ve koşucu KENDİ kanıt/log dosyalarına YAZMAZ')
  $absPosMiss = @($absPos | Where-Object { $_ -notmatch $absRe }); $absNegHit = @($absNeg | Where-Object { $_ -match $absRe })
  $srcLines = @($src0 -split "`n"); $absHits = @($srcLines | Where-Object { $_ -match $absRe })
  $hdrTxt = (@($srcLines | Select-Object -First 40) -join "`n")
  $scopeNeed = @('bu blok ve koşucu KENDİ kanıt/log dosyalarına YAZMAZ', 'KAPSAM (ölçülen)', 'KAPSAM DIŞI (ÖLÇÜLMEDİ)', 'canlı API', 'terminal kayıtları')
  $scopeMiss = @($scopeNeed | Where-Object { $hdrTxt -cnotmatch [regex]::Escape($_) })
  $script:goN = 55; $rG = Invoke-Mode 'Run' $real.Exe 0 $true; $dG = Last-EvDir
  $evFiles = @(Get-ChildItem -LiteralPath $dG.FullName -File)
  $evTxt = (($evFiles | ForEach-Object { Get-Content -Raw -LiteralPath $_.FullName }) -join "`n") + "`n" + $(if (Test-Path -LiteralPath $GoLedger) { Get-Content -Raw -LiteralPath $GoLedger } else { '' })
  $pwG = [string]$rG.last.pw
  $pwOk = ($rG.out -eq 0 -and $evFiles.Count -ge 5 -and $pwG -cmatch '^D6S!.{20,}$' -and $evTxt.IndexOf($pwG, [StringComparison]::Ordinal) -lt 0 -and $evTxt -notmatch 'OWNER-GO-CLIENT-EXTACC-D6-20000101' -and $evTxt -notmatch 'test-only')
  Check 'G-1' 'kaynakta (yorumlar DAHİL) "hiçbir … dosya/log/günlük/kanıt/rapor … yazılmaz" türü KAPSAMSIZ mutlak iddia YOK; desen kör değil (4 bilinen mutlak cümleyi yakalar; kapsamı adlandırılmış "blok ve koşucu KENDİ … YAZMAZ" ve ilgisiz "hiçbir şey yazılmaz" cümlelerini yakalamaz); başlık kapsamı ADLANDIRIR (ölçülen dosyalar + KAPSAM DIŞI: canlı API günlüğü, terminal kayıtları); ölçüm: Run kanıt dizini + GO defterinde geçici portal parolası, GO literali ve DB URL YOK' ($absHits.Count -eq 0 -and $srcLines.Count -gt 400 -and $absPosMiss.Count -eq 0 -and $absNegHit.Count -eq 0 -and $scopeMiss.Count -eq 0 -and $pwOk) "taranan satır=$($srcLines.Count) · mutlak iddia=$($absHits.Count)$(if ($absHits.Count) { ' [' + (($absHits | ForEach-Object { $_.Trim().Substring(0, [Math]::Min(70, $_.Trim().Length)) }) -join ' | ') + ']' }) · desen pozitif kaçırılan=$($absPosMiss.Count)/$($absPos.Count) · negatif yanlış=$($absNegHit.Count)/$($absNeg.Count) · kapsam eksik=$($scopeMiss -join ',') · kanıt dosyası=$($evFiles.Count) · parola kanıtta yok=$pwOk"

  Set-Answers @('EVET'); $script:g2err = $null; $consentTxt = Get-HostText { try { Confirm-LiveDataProcessing } catch { $script:g2err = $_.Exception.Message } }
  $need2 = @('Telefondan yükleme OPSİYONELDİR', 'dosyanın ADI', 'MASKESİZ', 'kaynaktan doğrulandı', 'kişisel', 'canlı belge kovasına', 'kovada KALIR', 'BOŞ kova dizini', 'saklandı', 'canlıda ölçülmedi', 'Recover YETKİSİ DEĞİLDİR', 'Recover BAŞLATMAZ', 'kanıt incelendikten sonra', 'AYRI owner')
  $miss2 = @($need2 | Where-Object { $consentTxt -cnotmatch [regex]::Escape($_) })
  $old2 = @(@('(Recover''da owner kararı)', 'maskelenmiş') | Where-Object { $consentTxt -match [regex]::Escape($_) })
  $g2U = $consentTxt.IndexOf('dosyanın ADI'); $g2B = $consentTxt.IndexOf('canlı belge kovasına'); $g2R = $consentTxt.IndexOf('Recover YETKİSİ DEĞİLDİR')
  Check 'G-2' 'owner''a GÖSTERİLEN canlı veri onayı metni: telefon yüklemesinde dosyanın ADI canlı API günlüğüne MASKESİZ yazılır (kaynaktan doğrulandı; kişisel veri içermeyen dosya) → dosya canlı belge kovasına yazılır, silinmezse kovada KALIR → kapanıştan sonra BOŞ kova dizini kalır (saklandı; canlıda ölçülmedi) → çıkış 5/6 Recover YETKİSİ DEĞİLDİR, blok Recover BAŞLATMAZ, karar kanıt incelendikten sonra AYRI owner onayıyla; eski "(Recover''da owner kararı)" ve mutlak iddia YOK; EVET ile istisna yok' ($null -eq $script:g2err -and $miss2.Count -eq 0 -and $old2.Count -eq 0 -and $consentTxt -notmatch $absRe -and $g2U -ge 0 -and $g2U -lt $g2B -and $g2B -lt $g2R) "eksik=$($miss2 -join ',') · eski ifade=$($old2 -join ',') · sıra günlük@$g2U kova@$g2B Recover@$g2R · istisna=$($script:g2err) · satır=$(@($consentTxt -split "`n").Count)"

  $g3Txt = Get-HostText { $script:capR = Invoke-Mode 'Recover' $real.Exe 6 $true $rcpt @('H') }; $g3 = $script:capR
  $g3zTxt = Get-HostText { $script:capR = Invoke-Mode 'Recover' $real.Exe 0 $true $rcpt @('H') }; $g3z = $script:capR
  # R02 ikinci tur (owner kuralı): İKİNCİ bir Recover TANIMLI DEĞİLDİR — metin "yeni onayla tekrar edilebilir" türü bir YOL tanımlamaz.
  $need3 = @('yeni bir Recover için YETKİ DEĞİLDİR', 'yeniden BAŞLATMAZ', 'İKİNCİ bir Recover bu paketle TANIMLI DEĞİLDİR', 'owner kararı gerektirir', 'ÖNERİDİR', 'Kanıtı inceleyin', 'OWNER elle siler', 'okunabilirliğini owner düzeltir')
  $miss3 = @($need3 | Where-Object { $g3Txt -cnotmatch [regex]::Escape($_) })
  $path3List = @('YENİ ve AYRI', 'yeni ve ayrı', 'sonraki Recover', 'BİR KEZ', 'bir kez', 'Recover BİR KEZ daha koşulur', 'tekrar edilebilir', 'yeniden başlatılabilir', 'önce belge kovasının')
  $path3 = @($path3List | Where-Object { $g3Txt -cmatch [regex]::Escape($_) })
  $src3 = @(@('YENİ ve AYRI', 'sonraki Recover') | Where-Object { $src0 -cmatch [regex]::Escape($_) })   # kaynakta (yorumlar DAHİL) ikinci Recover yolu yok
  $hdr3 = ($hdrTxt -cmatch 'İKİNCİ bir Recover bu' -and $hdrTxt -cmatch 'paketle TANIMLI DEĞİLDİR, owner kararı gerektirir')
  Check 'G-3' 'Recover çıkış 6: owner''a gösterilen metin bu çıkış kodunun yeni bir Recover için YETKİ olmadığını ve bloğun Recover''ı yeniden BAŞLATMADIĞINI söyler; İKİNCİ bir Recover için YOL TANIMLAMAZ ("bu paketle TANIMLI DEĞİLDİR; owner kararı gerektirir"; "YENİ ve AYRI onayla / sonraki Recover / BİR KEZ / tekrar edilebilir" YOK — gösterilen metinde ve kaynakta, yorumlar dahil); kanıttaki adım ÖNERİDİR; blok başlığı aynı kuralı yazar; blok tek node çağrısı yapar (mod recover); Recover çıkış 0''da yetki / ikinci Recover metni yok' ($g3.out -eq 6 -and $g3.nodeCalls -eq 1 -and $g3.last.mode -eq 'recover' -and $miss3.Count -eq 0 -and $path3.Count -eq 0 -and $src3.Count -eq 0 -and $hdr3 -and $g3z.out -eq 0 -and $g3z.nodeCalls -eq 1 -and $g3zTxt -match 'KURTARMA BİTTİ' -and $g3zTxt -cnotmatch 'YETKİ' -and $g3zTxt -cnotmatch 'TANIMLI') "rc=$($g3.out) node=$($g3.nodeCalls) mod=$($g3.last.mode) eksik=$($miss3 -join ',') · yol tanımlayan ifade=$($path3 -join ',') · kaynakta=$($src3 -join ',') · başlık=$hdr3 · çıkış 0: rc=$($g3z.out) node=$($g3z.nodeCalls)"

  # R02 ikinci tur: onay metni kapsamı (V-2) ve kova dizini tek adla (V-3). $consentTxt G-2'de yakalanan GÖSTERİLEN metindir.
  $need5 = @('İKİ yeni sentetik tenantında (hedef + yabancı)', 'Kapsam: koşucu canlı DB''de yalnız bu koşumun iki sentetik tenantına yazar (kaynaktan okundu; koşumda U-ISO yalnız diğer tenantlardaki', 'kullanıcı/müvekkil SAYILARINI ölçer) ve bildirim üreten uçları çağırmaz (statik ölçüt: koşucu öz-testi T-1).')
  $miss5 = @($need5 | Where-Object { $consentTxt -cnotmatch [regex]::Escape($_) })
  $old5 = @(@('Koşucu yalnız bu koşumun sentetik tenantlarına yazar ve bildirim üreten uçları çağırmaz.', 'YALNIZ yeni bir sentetik tenantta', 'PORTAL_DOCUMENTS') | Where-Object { $consentTxt -cmatch [regex]::Escape($_) })
  $bucket5 = @([regex]::Matches($consentTxt, '\(([^()\s]+)/<sentetik tenant>/\)') | ForEach-Object { $_.Groups[1].Value })
  Check 'G-5' 'owner''a GÖSTERİLEN canlı veri onayı metni (ikinci tur): "yalnız … tenantına yazar" iddiası KAPSAMIYLA yazılır (iki sentetik tenant; kaynaktan okundu; koşumda U-ISO yalnız diğer tenantlardaki kullanıcı/müvekkil SAYILARINI ölçer) ve "bildirim üreten uçları çağırmaz" ölçüm türüyle (statik ölçüt: koşucu öz-testi T-1); eski kapsamsız cümle ve "YALNIZ yeni bir sentetik tenantta" YOK; kova dizini metinde TEK adla geçer (portal-documents/<sentetik tenant>/ ×3; PORTAL_DOCUMENTS gösterilen metinde ve kaynakta YOK)' ($miss5.Count -eq 0 -and $old5.Count -eq 0 -and $bucket5.Count -eq 3 -and @($bucket5 | Sort-Object -Unique).Count -eq 1 -and $bucket5[0] -ceq 'portal-documents' -and $src0 -cnotmatch 'PORTAL_DOCUMENTS') "eksik=$($miss5.Count)/$($need5.Count) · eski ifade=$($old5 -join ',') · kova adları=$($bucket5 -join ',') · kaynakta PORTAL_DOCUMENTS=$($src0 -cmatch 'PORTAL_DOCUMENTS')"

  $script:goN = 60; $g4 = [ordered]@{}; $g4Before = @(Node-Calls).Count
  foreach ($c in 5, 6, 0) {
    $g4Txt = Get-HostText { $script:capR = Invoke-Mode 'Run' $real.Exe $c $true }; $iEnd = $g4Txt.IndexOf('Koşum bitti.')   # koşum SONU metni: onay metni hariç
    $g4["$c"] = [pscustomobject]@{ tail = $(if ($iEnd -ge 0) { $g4Txt.Substring($iEnd) } else { '' }); found = ($iEnd -ge 0); r = $script:capR }
  }
  $g4Modes = @(@(Node-Calls) | Select-Object -Skip $g4Before | ForEach-Object { ($_ | ConvertFrom-Json).mode })
  $need4 = @('Recover YETKİSİ DEĞİLDİR', 'Recover BAŞLATMAZ', 'kendi kapanış adımlarını koşucu İÇİNDE', 'kanıtı inceleyin', 'd6-evidence.json', 'ÖNERİDİR', 'AYRI owner onayıyla', 'BİR KEZ')
  $bad4 = @()
  foreach ($k4 in '5', '6') { $x = $g4[$k4]; $miss4 = @($need4 | Where-Object { $x.tail -cnotmatch [regex]::Escape($_) })
    if (-not ($x.found -and $x.r.out -eq [int]$k4 -and $x.r.nodeCalls -eq 1 -and $x.r.last.mode -eq 'run' -and $miss4.Count -eq 0 -and $x.tail -notmatch 'KAPANIŞ DOĞRULANMADI: -Mode Recover')) { $bad4 += "çıkış ${k4}: rc=$($x.r.out) node=$($x.r.nodeCalls) mod=$($x.r.last.mode) eksik=$($miss4 -join ',')" } }
  $zeroRec = ($g4['0'].found -and $g4['0'].r.out -eq 0 -and $g4['0'].r.nodeCalls -eq 1 -and $g4['0'].tail -notmatch 'Recover')
  $runTxt = ($funcs | Where-Object { $_.Name -eq 'Invoke-RunMode' }).Extent.Text
  $resLine = @($runTxt -split "`n" | Where-Object { $_ -cmatch 'BELGE KALINTISI:' })   # büyük/küçük harf duyarlı: çıkış kodu açıklaması ("belge kalıntısı") sayılmaz
  $resOk = ($resLine.Count -eq 1 -and $resLine[0] -cmatch 'Recover BAŞLATMAZ' -and $resLine[0] -cmatch 'kanıt incelendikten sonra' -and $resLine[0] -cmatch 'AYRI owner onayıyla' -and $resLine[0] -cmatch 'otomatik DEĞİL')
  $modesOk = ($g4Modes.Count -eq 3 -and @($g4Modes | Where-Object { $_ -ne 'run' }).Count -eq 0)
  Check 'G-4' 'Recover yetkisi: Run çıkış 5/6''da owner''a gösterilen koşum sonu metni Run''ın kendi kapanış adımlarını (koşucu içinde) Recover''dan AYIRIR, çıkış kodunun Recover YETKİSİ olmadığını ve bloğun Recover BAŞLATMADIĞINI söyler, önce kanıt incelemesini (d6-evidence.json) ister, Recover''ı yalnız AYRI owner onayıyla BİR KEZ ÖNERİR; eski doğrudan "-Mode Recover" talimatı YOK; blok koşum başına tek node çağrısı yapar (3 koşum: mod run ×3, recover çağrısı 0); çıkış 0''da koşum sonu metninde Recover yok; belge kalıntısı satırı da blok başlatmaz + kanıt incelemesi + AYRI owner onayı + otomatik değil der' ($bad4.Count -eq 0 -and $zeroRec -and $resOk -and $modesOk) "hata=$($bad4 -join ' | ') · çıkış 0 Recover metni yok=$zeroRec · kalıntı satırı=$resOk · node modları=$($g4Modes -join ',')"

  # ---- R02 KAPANIŞ METNİ: "DOĞRULANDI" parçaları kanıttaki ölçüt verdict'lerinden kurulur (koşulsuz "yeni giriş + mevcut oturum reddi" iddiası yok).
  function New-ClosureEvid([string]$name, [hashtable]$v) {
    $p = Join-Path $T ("closure-$name.json")
    $res = @($v.Keys | Sort-Object | ForEach-Object { [pscustomobject]@{ id = $_; verdict = $v[$_] } })
    [IO.File]::WriteAllText($p, ([pscustomobject]@{ productFinding = $null; results = $res } | ConvertTo-Json -Depth 4))
    return $p
  }
  $partLabels = @('DB kapalı', 'yeni giriş reddi', 'mevcut oturum reddi', 'belge kalıntısı yok', 'yabancı satır temiz', 'personel/dosya kapanışı')
  function Get-Parts([string]$txt) {
    return (@($partLabels | ForEach-Object { $pm = [regex]::Match($txt, [regex]::Escape($_) + '[^·]*?\]: (PASS|FAIL|ÖLÇÜLMEDİ)'); if ($pm.Success) { $pm.Groups[1].Value } else { 'YOK' } }) -join '/')
  }
  $oldClaim = 'DOĞRULANDI \(DB \+ yeni giriş'
  $vAll = @{ 'P6-D9' = 'PASS'; 'P6-C1' = 'PASS'; 'P6-C2' = 'PASS'; 'P6-C2V' = 'PASS'; 'P6-C5' = 'PASS'; 'P6-C3L' = 'PASS'; 'P6-C3D' = 'PASS'; 'P6-C4L' = 'PASS'; 'P6-C4D' = 'PASS'; 'P6-C-DOC' = 'PASS'; 'P6-FOREIGN-CLEAN' = 'PASS'; 'U-CLOSE' = 'PASS' }
  $cs6 = Get-ClosureStatus (New-ClosureEvid 'all' $vAll) 0
  $extraIds = @('P6-C2', 'P6-C2V', 'P6-C5', 'P6-C3L', 'P6-C3D', 'P6-C4L', 'P6-C4D', 'P6-FOREIGN-CLEAN', 'U-CLOSE')
  $env:EXSTUB_EXTRA = '[' + (($extraIds | ForEach-Object { '{"id":"' + $_ + '","verdict":"PASS"}' }) -join ',') + ']'
  $script:goN = 85; $o6Txt = Get-HostText { $script:capR = Invoke-Mode 'Run' $real.Exe 0 $true }; $o6 = $script:capR; Remove-Item 'Env:EXSTUB_EXTRA' -ErrorAction SilentlyContinue
  $d6o = Last-EvDir; $shown6 = [string](Get-Content -Raw -LiteralPath (Join-Path $d6o.FullName 'owner-declaration.json') | ConvertFrom-Json).closureShownToOwner
  Check 'O-6' 'tüm kapanış ölçütleri PASS: metin "P6-D9 PASS" + altı parçanın HER BİRİ için kanıttaki verdict''i (PASS) yazar; mevcut oturumun KOŞUCUNUN kendi oturumu olduğunu ve telefondaki oturumu koşucunun ÖLÇMEDİĞİNİ söyler; eski koşulsuz "DOĞRULANDI (DB + yeni giriş + mevcut oturum reddi …)" cümlesi YOK; aynı metin Run''da owner''a gösterilir ve beyan dosyasına yazılır' ($cs6.verified -and (Get-Parts $cs6.text) -eq 'PASS/PASS/PASS/PASS/PASS/PASS' -and $cs6.text -cmatch 'P6-D9 PASS' -and $cs6.text -cmatch 'koşucunun kendi portal oturumu' -and $cs6.text -cmatch 'koşucu ÖLÇMEZ' -and $cs6.text -notmatch $oldClaim -and $o6.out -eq 0 -and (Get-Parts $shown6) -eq 'PASS/PASS/PASS/PASS/PASS/PASS' -and $shown6.Length -gt 0 -and $o6Txt.Contains($shown6)) "birim=$(Get-Parts $cs6.text) · Run beyanı=$(Get-Parts $shown6) · rc=$($o6.out) · gösterilen metinde=$($shown6.Length -gt 0 -and $o6Txt.Contains($shown6))"
  $vNo = @{ 'P6-D9' = 'PASS'; 'P6-C1' = 'PASS'; 'P6-C-DOC' = 'PASS'; 'P6-FOREIGN-CLEAN' = 'PASS'; 'U-CLOSE' = 'PASS' }
  $cs7 = Get-ClosureStatus (New-ClosureEvid 'noaccount' $vNo) 0
  Check 'O-7' 'portal hesabı hiç açılmamış (P6-D9 PASS ama P6-C2..C5 satırı YOK): DB kapalı / yeni giriş reddi / mevcut oturum reddi "ÖLÇÜLMEDİ" yazılır (PASS iddia edilmez); kalıntı / yabancı satır / personel PASS; eski koşulsuz cümle YOK' ($cs7.verified -and (Get-Parts $cs7.text) -eq 'ÖLÇÜLMEDİ/ÖLÇÜLMEDİ/ÖLÇÜLMEDİ/PASS/PASS/PASS' -and $cs7.text -notmatch $oldClaim) "parçalar=$(Get-Parts $cs7.text)"
  $v8a = $vAll.Clone(); $v8a['P6-C4L'] = 'UNMEASURED'; $v8a['P6-C4D'] = 'UNMEASURED'
  $v8b = $vAll.Clone(); $v8b['P6-C2V'] = 'UNMEASURED'
  $v8c = $vAll.Clone(); $v8c['P6-C3D'] = 'FAIL'; $v8c['P6-C4L'] = 'UNMEASURED'
  $v8d = $vAll.Clone(); $v8d['P6-D9'] = 'FAIL'
  $cs8a = Get-ClosureStatus (New-ClosureEvid 'nosession' $v8a) 0; $cs8b = Get-ClosureStatus (New-ClosureEvid 'c2v' $v8b) 0
  $cs8c = Get-ClosureStatus (New-ClosureEvid 'fail' $v8c) 0; $cs8d = Get-ClosureStatus (New-ClosureEvid 'd9fail' $v8d) 6
  Check 'O-8' 'parça verdict''i kanıttan: koşucu oturumu yoksa (P6-C4L/D UNMEASURED) yalnız mevcut oturum reddi "ÖLÇÜLMEDİ"; gruptaki tek ölçüt PASS değilse (P6-C2V UNMEASURED) grup "ÖLÇÜLMEDİ"; gruptaki bir ölçüt FAIL ise "FAIL" (PASS/ÖLÇÜLMEDİ diye yumuşatılmaz); P6-D9 FAIL ise metin DOĞRULANAMADI ve parça listesi YOK' ((Get-Parts $cs8a.text) -eq 'PASS/PASS/ÖLÇÜLMEDİ/PASS/PASS/PASS' -and (Get-Parts $cs8b.text) -eq 'ÖLÇÜLMEDİ/PASS/PASS/PASS/PASS/PASS' -and (Get-Parts $cs8c.text) -eq 'PASS/FAIL/ÖLÇÜLMEDİ/PASS/PASS/PASS' -and -not $cs8d.verified -and $cs8d.text -match 'DOĞRULANAMADI' -and (Get-Parts $cs8d.text) -eq 'YOK/YOK/YOK/YOK/YOK/YOK') "oturumsuz=$(Get-Parts $cs8a.text) · C2V=$(Get-Parts $cs8b.text) · FAIL=$(Get-Parts $cs8c.text) · D9 FAIL=$(Get-Parts $cs8d.text)"

  # R02 ikinci tur (V-4): parçalar ayrı satırlarda değil, "Koşum bitti." satırının DEVAMINDADIR → metin "bu satırın devamında" der ("aşağıda" değil);
  # satır rengi yalnız birleşik ölçütü (P6-D9) gösterir — not owner'a ayrı satırda yazılır. Renk mantığı (tek `$c` ataması) statik olarak ölçülür.
  $o9Lines = @($o6Txt -split "`n"); $o9Main = @($o9Lines | Where-Object { $_ -cmatch '^Koşum bitti\.' })
  $noteRe = [regex]::Escape('satır rengi yalnız birleşik ölçütü (P6-D9) gösterir')
  $o9Note = @($o9Lines | Where-Object { $_ -cmatch $noteRe })
  $env:EXSTUB_D9 = 'FAIL'; $env:EXSTUB_DOC = 'FAIL'; $script:goN = 90; $o9fTxt = Get-HostText { $script:capR = Invoke-Mode 'Run' $real.Exe 6 $true }; $o9f = $script:capR; $env:EXSTUB_D9 = 'PASS'; $env:EXSTUB_DOC = 'PASS'
  $o9fMain = @($o9fTxt -split "`n" | Where-Object { $_ -cmatch '^Koşum bitti\.' }); $o9fNote = @($o9fTxt -split "`n" | Where-Object { $_ -cmatch $noteRe })
  $o9Color = ([regex]::Matches($declBody, '-ForegroundColor \$c\b')).Count -eq 1 -and $declBody.Contains('$c = if ($closure -and $closure.verified) { ''Green'' } else { ''Red'' }')
  Check 'O-9' 'kapanış satırı (ikinci tur): DOĞRULANDI metni "bu satırın devamında PASS yazan parçalar" der ("aşağıda PASS yazan" gösterilen metinde ve kaynakta YOK); altı parça gerçekten "Koşum bitti." satırının İÇİNDEDİR (tek satır); "satır rengi yalnız birleşik ölçütü (P6-D9) gösterir" notu P6-D9 PASS ve FAIL koşumlarında owner''a gösterilir; renk mantığı değişmedi (tek `-ForegroundColor $c`, `$c` yalnız $closure.verified''a bağlı)' ($cs6.text -cmatch 'DOĞRULANDI yalnız bu satırın devamında PASS yazan parçalar içindir' -and $cs6.text -cnotmatch 'aşağıda PASS yazan' -and $src0 -cnotmatch 'aşağıda PASS yazan' -and $o9Main.Count -eq 1 -and (Get-Parts $o9Main[0]) -eq 'PASS/PASS/PASS/PASS/PASS/PASS' -and $o9Main[0].Contains($shown6) -and $o9Note.Count -eq 1 -and $o9f.out -eq 6 -and $o9fMain.Count -eq 1 -and $o9fMain[0] -cmatch 'DOĞRULANAMADI' -and $o9fNote.Count -eq 1 -and $o9Color) "PASS koşumu: satır=$($o9Main.Count) parçalar=$(if ($o9Main.Count -eq 1) { Get-Parts $o9Main[0] } else { 'YOK' }) not=$($o9Note.Count) · FAIL koşumu: rc=$($o9f.out) satır=$($o9fMain.Count) not=$($o9fNote.Count) · renk mantığı aynı=$o9Color"
}
finally {
  foreach ($k in 'EXSTUB_RC', 'EXSTUB_WRITE_EVID', 'EXSTUB_MARKER', 'EXSTUB_WAIT', 'EXSTUB_QR_RC', 'EXSTUB_FINDING', 'EXSTUB_D9', 'EXSTUB_DOC', 'EXSTUB_EXTRA') { Remove-Item "Env:$k" -ErrorAction SilentlyContinue }
  Clear-SecretEnv
}

$rows | Format-Table -AutoSize -Wrap | Out-String -Width 240 | Write-Host
# Gözlem dökümü (R02): tablo genişliği gözlem sütununu düşürdüğü için her ölçütün ölçülen değeri ayrıca yazılır.
Write-Host 'GÖZLEMLER (her ölçütün ölçülen değeri):'
foreach ($row in $rows) { Write-Host ("  {0,-4} {1,-6} {2}" -f $row.sonuc, $row.id, $row.gozlem) }
Write-Host ''
$fail = @($rows | Where-Object { $_.sonuc -eq 'FAIL' }).Count
Write-Host ("EXTACC D-6 OWNER BLOĞU ÖZ-TESTİ [{0}]: PASS {1} / {2}" -f $ps, ($rows.Count - $fail), $rows.Count)
Write-Host ("  test edilen blok: d6-owner-live-block.ps1 sha256={0}" -f (Sha $wrapper))   # log tek başına hangi blok baytlarının koşulduğunu söyler
Write-Host "  geçici dizin: $T  (canlı kapılar, canlı .env, canlı DB ve GO KULLANILMADI)"
if ($fail -gt 0) { exit 1 }
exit 0
