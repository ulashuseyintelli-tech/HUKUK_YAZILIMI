# ═══════════ EXTACC D-7 OWNER BLOĞU ÖZ-TESTİ (R01) — CANLIYA DOKUNMAZ ═══════════
# NE     : d7-owner-live-block.ps1 içindeki GERÇEK fonksiyonları (Invoke-RunMode, Invoke-RecoverMode, Invoke-QrTestMode, Invoke-Node,
#          Complete-NodeRc, Resolve-NodeExe, Confirm-LiveDataProcessing, Get-ClosureStatus, Write-OwnerDeclaration ...) AST ile yükler
#          ve koşar. Dosyanın AKIŞ bölümü (kapılar, canlı yollar) HİÇ ÇALIŞMAZ.
# YÖNLENDİRME: yalnız yol değişkenleri geçici dizine alınır ve etkileşim noktaları teste bağlanır: Read-GoRef (test GO),
#          Read-Answer (kuyruktan yanıt), Invoke-RepoGit (git grep "bulunmadı"), Assert-LocalConsole (test sürecinin çıktısı
#          yönlendirildiği için no-op; GERÇEK hali ayrıca K-1'de ölçülür), Clear-OwnerScreen (no-op).
#          Node GERÇEKTİR: PATH'teki node + geçici betik ya da BAŞLATILAMAYAN dosya.
# R02    : G-1..G-4 (D-5 R04 kalıbı) — G-1 blok kaynağında (yorumlar dahil) "hiçbir … dosya/log/kanıt … yazılmaz" türü kapsamsız mutlak iddia yok;
#          G-2 owner'a GÖSTERİLEN canlı veri onayı metni paket belgesi §8 kayıt listesiyle aynı kalemleri taşır, "dosyalar CLOSED + personel pasif +
#          portal pasif; tenant yaşam döngüsü değişmez" der, kaynaktan okunan ile ölçüleni ayırır; G-3 Recover başlarken canlı yazma kümesi ve yetki
#          kuralı GÖSTERİLİR (yeni soru yok; tek node çağrısı; defter değişmez); G-4 Run çıkış 5/6 metni Run'ın kendi kapanışını Recover'dan ayırır,
#          "Recover yetkisi değildir / blok başlatmaz / önce kanıt / AYRI owner onayı" der; çıkış 0'da Recover metni yok; tek node çağrısı.
#          Ölçüm owner'a GÖSTERİLEN metinde yapılır (Write-Host yakalaması). Beklenmeyen istisna sessizce kesmez: X-0 FAIL satırı.
# KULLANIM: powershell.exe -NoProfile -ExecutionPolicy Bypass -File d7-owner-block-selftest.ps1   (ve pwsh)
# ÇIKIŞ  : 0 hepsi PASS · 1 en az bir FAIL · 2 ölçülemedi
$ErrorActionPreference = 'Stop'
$startedUtc = (Get-Date).ToUniversalTime().ToString('o')
$here    = $PSScriptRoot
$wrapper = Join-Path $here 'd7-owner-live-block.ps1'

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
        'Clear-SecretEnv', 'Read-GoRef', 'Read-Answer', 'Invoke-RepoGit', 'Assert-LocalConsole', 'Confirm-LiveDataProcessing', 'Write-OwnerDeclaration',
        'Assert-PortalBaseUrl', 'Confirm-PortalBaseUrlR05'
$missing = @($need | Where-Object { -not (Get-Command $_ -CommandType Function -ErrorAction SilentlyContinue) })
if ($missing.Count -gt 0) { Write-Host "OLCULEMEDI: wrapper fonksiyonu yok: $($missing -join ',')"; exit 2 }
$script:RealAssertLocalConsole = ${function:Assert-LocalConsole}
$src0 = [IO.File]::ReadAllText($wrapper)

$T = Join-Path ([IO.Path]::GetTempPath()) ('d7-ownerblock-test-' + [Guid]::NewGuid().ToString('N').Substring(0, 8))
foreach ($d in 'sc', 'ev', 'rel', 'repo', 'bogus', 'badcmd', 'empty') { New-Item -ItemType Directory -Path (Join-Path $T $d) | Out-Null }
$Sc = Join-Path $T 'sc'; $EvRoot = Join-Path $T 'ev'; $GoLedger = Join-Path $EvRoot 'extacc-d7-goref-ledger.txt'
$Rel = Join-Path $T 'rel'; $Repo = Join-Path $T 'repo'; $Api = 'http://127.0.0.1:1/api'; $ExpBaseUrl = 'https://example.invalid'
$EnvFile = Join-Path $T 'fake.env'
[IO.File]::WriteAllText($EnvFile, "DATABASE_URL=postgresql://test-only:test-only@127.0.0.1:1/not_a_db`nPUBLIC_PORTAL_BASE_URL=https://example.invalid`n")
$script:LastNodeRc = $null
$marker = Join-Path $T 'node-calls.txt'
[IO.File]::WriteAllText((Join-Path $Sc 'd7-portal-messages-live-run.js'), @'
const fs = require('fs');
fs.appendFileSync(process.env.EXSTUB_MARKER, JSON.stringify({ mode: process.env.D7_MODE || null, db: !!process.env.AH_DATABASE_URL,
  go: !!process.env.D7_LIVE_GO_REF, receipt: !!process.env.D7_RECEIPT, display: process.env.D7_DISPLAY || null, slug: process.env.D7_EXPECT_TENANT_SLUG || null,
  sink: process.env.D7_TEST_DISPLAY_SINK || null, base: process.env.D7_EXPECT_BASE_URL || null,
  params: ['D7_WAIT_MS', 'D7_POLL_MS', 'D7_VIEW_MS', 'D7_HTTP_TIMEOUT_MS', 'D7_CALL_TIMEOUT_MS', 'D7_LATE_CREATE_MS'].map((k) => process.env[k] || null) }) + '\n');
if (process.env.EXSTUB_WRITE_EVID === '1') fs.writeFileSync(process.env.D7_EVID_FILE, JSON.stringify({ productFinding: process.env.EXSTUB_FINDING || null,
  messageResidue: { portalMessages: 5, portalNotifications: 2, deleted: false },
  results: [{ id: 'P7-WAIT', verdict: process.env.EXSTUB_WAIT || 'PASS' }, { id: 'D7-3B', verdict: 'PASS' }, { id: 'P7-D9', verdict: process.env.EXSTUB_D9 || 'PASS' },
    { id: 'P7-MSG-KEPT', verdict: 'PASS', observed: 'saklandı: 5 mesaj (koşucu 4 · telefon 1) + 2 bildirim satırı (sentetik tenant CLOSED; portal pasif) — SİLİNMEDİ' }] }));
process.exit(Number(process.env.EXSTUB_RC || 0));
'@)
[IO.File]::WriteAllText((Join-Path $Sc 'd7-qr-test.js'), "process.exit(Number(process.env.EXSTUB_QR_RC || 0));`n")
$bogusNode = Join-Path $T 'bogus\node.exe'; [IO.File]::WriteAllText($bogusNode, 'bu dosya bir çalıştırılabilir dosya DEĞİLDİR')
$goneNode  = Join-Path $T 'gone\node.exe'
[IO.File]::WriteAllText((Join-Path $T 'badcmd\node.cmd'), "@echo merhaba`r`n@exit /b 0`r`n")
$env:EXSTUB_MARKER = $marker

$rows = New-Object System.Collections.Generic.List[object]
function Check([string]$id, [string]$desc, [bool]$ok, [string]$obs) { $rows.Add([pscustomobject]@{ id = $id; sonuc = $(if ($ok) { 'PASS' } else { 'FAIL' }); aciklama = $desc; gozlem = $obs }) }
$script:goN = 10
$script:GoFmt = 'OWNER-GO-CLIENT-EXTACC-D7-20000101-R{0:D2}'
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
$okAnswers = @('E', 'https://example.invalid', 'EVET', 'E', 'M', '3', 'E', 'E', '1', 'M', 'G')   # pencere · R05 adresi · onay · beyan x8
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
function Last-EvDir { Get-ChildItem -LiteralPath $EvRoot -Directory -Filter 'extacc-d7-live-*' | Sort-Object LastWriteTimeUtc | Select-Object -Last 1 }
function Consumed-Rc { $d = Last-EvDir; (Get-Content -Raw -LiteralPath (Join-Path $d.FullName 'goref-consumed.json') | ConvertFrom-Json).exitCode }
$ps = "PS $($PSVersionTable.PSVersion) ($($PSVersionTable.PSEdition))"

try {
  $real = Resolve-NodeExe
  Check 'N-1' 'Resolve-NodeExe: gerçek node çözülür, --version geçer' ((Test-Path -LiteralPath $real.Exe -PathType Leaf) -and $real.Version -match '^v\d+\.\d+\.\d+$') "$($real.Version)"
  $savedPath = $env:PATH
  try {
    $env:PATH = Join-Path $T 'bogus'; Set-PriorZero; $m = $null; try { $null = Resolve-NodeExe } catch { $m = $_.Exception.Message }
    Check 'N-2' 'başlatılamayan node (önceki kod 0) → DUR' ($m -like 'EXTACC-D7-DUR:*' -and $m -match 'node') "mesaj=$m"
    $env:PATH = Join-Path $T 'badcmd'; Set-PriorZero; $m = $null; try { $null = Resolve-NodeExe } catch { $m = $_.Exception.Message }
    Check 'N-3' 'node --version beklenmeyen çıktı → DUR' ($m -like 'EXTACC-D7-DUR:*' -and $m -match 'version') "mesaj=$m"
    $env:PATH = Join-Path $T 'empty'; $m = $null; try { $null = Resolve-NodeExe } catch { $m = $_.Exception.Message }
    Check 'N-4' 'node yok → DUR' ($m -like 'EXTACC-D7-DUR:*') "mesaj=$m"
  } finally { $env:PATH = $savedPath }

  # ---- Run öncesi owner kararları: reddedilirse GO sorulmaz, defter yazılmaz, node çağrılmaz
  $r = Invoke-Mode 'Run' $real.Exe 0 $true '' @('H')
  Check 'K-2' 'bağımsız pencere teyit edilmezse DUR; GO defteri yazılmaz; node çağrılmaz' ($r.threw -like 'EXTACC-D7-DUR:*' -and $r.ledgerDelta -eq 0 -and $r.nodeCalls -eq 0) "mesaj=$($r.threw) · defter+=$($r.ledgerDelta)"
  $r = Invoke-Mode 'Run' $real.Exe 0 $true '' @('E', 'https://example.invalid', 'evet')
  Check 'K-3' 'canlı veri işleme "EVET" (büyük harf) değilse DUR; defter yazılmaz; node çağrılmaz' ($r.threw -like 'EXTACC-D7-DUR:*' -and $r.threw -match 'onaylanmadı' -and $r.ledgerDelta -eq 0 -and $r.nodeCalls -eq 0) "mesaj=$($r.threw)"
  $r = Invoke-Mode 'Run' $real.Exe 0 $true '' @('E', 'https://baska.invalid', 'EVET')
  Check 'K-6' 'R05 adresi: owner''ın yazdığı adres .env değeriyle eşleşmezse canlı veri onayından ÖNCE DUR; GO sorulmaz; defter yazılmaz; node çağrılmaz' ($r.threw -like 'EXTACC-D7-DUR:*' -and $r.threw -match 'R05' -and $r.ledgerDelta -eq 0 -and $r.nodeCalls -eq 0) "mesaj=$($r.threw)"
  $r = Invoke-Mode 'Run' $real.Exe 0 $true '' @('E', ' HTTPS://Example.INVALID/ ', 'EVET', 'E', 'M', '3', 'E', 'E', '1', 'M', 'G')
  Check 'K-6b' 'R05 adresi: boşluk / sondaki "/" / büyük-küçük harf farkı eşleşmeyi bozmaz (koşum 0)' ($r.out -eq 0 -and $r.nodeCalls -eq 1 -and $r.last.base -eq 'https://example.invalid') "rc=$($r.out) · origin=$($r.last.base)"
  $okU = $null; try { $okU = Assert-PortalBaseUrl 'https://portal.example.com' } catch { $okU = 'DUR' }
  $badU = @(); foreach ($u in 'http://portal.example.com', 'https://portal.example.com/portal', 'https://portal.example.com:8443', 'https://127.0.0.1', 'https://localhost', 'https://portal.example.com?x=1', '') { try { $null = Assert-PortalBaseUrl $u; $badU += "KABUL:$u" } catch { if ($_.Exception.Message -notlike 'EXTACC-D7-DUR:*') { $badU += "BASKA:$u" } } }
  Check 'K-7' 'Assert-PortalBaseUrl: https://<alan adı> kabul; http / yol / port / IP / localhost / sorgu / boş → DUR' ($okU -eq 'https://portal.example.com' -and $badU.Count -eq 0) "kabul=$okU · yanlış kabul=$($badU -join ',')"
  $savedBase = $ExpBaseUrl; $ExpBaseUrl = $null; $m = $null; Set-Answers @('https://example.invalid'); try { Confirm-PortalBaseUrlR05 } catch { $m = $_.Exception.Message }; $ExpBaseUrl = $savedBase
  Check 'K-8' 'Confirm-PortalBaseUrlR05: adres kapılarda çözülmemişse (null) DUR' ($m -like 'EXTACC-D7-DUR:*' -and $m -match 'çözülmedi') "mesaj=$m"
  $gs = $script:goN; $script:GoFmt = 'OWNER-GO-CLIENT-EXTACC-D5-20000101-R{0:D2}'; $r = Invoke-Mode 'Run' $real.Exe 0 $true; $script:GoFmt = 'OWNER-GO-CLIENT-EXTACC-D7-20000101-R{0:D2}'; $script:goN = $gs
  Check 'K-4' 'D-5 GO biçimi D-7 için REDDEDİLİR; defter yazılmaz; node çağrılmaz' ($r.threw -like 'EXTACC-D7-DUR:*' -and $r.threw -match 'BİÇİMİ' -and $r.ledgerDelta -eq 0 -and $r.nodeCalls -eq 0) "mesaj=$($r.threw)"
  $gs = $script:goN; $script:GoFmt = 'OWNER-GO-CLIENT-EXTACC-D4-20000101-R{0:D2}'; $r = Invoke-Mode 'Run' $real.Exe 0 $true; $script:GoFmt = 'OWNER-GO-CLIENT-EXTACC-D7-20000101-R{0:D2}'; $script:goN = $gs
  Check 'K-5' 'D-4 GO biçimi D-7 için REDDEDİLİR' ($r.threw -like 'EXTACC-D7-DUR:*' -and $r.threw -match 'BİÇİMİ' -and $r.nodeCalls -eq 0) "mesaj=$($r.threw)"
  $m = $null; try { & $script:RealAssertLocalConsole } catch { $m = $_.Exception.Message }
  Check 'K-1' 'GERÇEK Assert-LocalConsole: çıktısı yönlendirilmiş süreçte DURUR (giriş bilgisi gösterilmez)' ($m -like 'EXTACC-D7-DUR:*') "mesaj=$m"

  # ---- RUN
  $r = Invoke-Mode 'Run' $real.Exe 0 $true
  $d = Last-EvDir; $decl = Get-Content -Raw -LiteralPath (Join-Path $d.FullName 'owner-declaration.json') | ConvertFrom-Json
  $man = Get-Content -LiteralPath (Join-Path $d.FullName 'SHA256-MANIFEST.txt')
  Check 'R-1' 'Run: node 0 + kanıt → 0; node run modunda, D7_DISPLAY=conout, slug ah-<runId>, DB/GO/makbuz ortamla, beklenen origin = R05; sink KURULMADI; ortam temizlendi; defter +1' ($r.out -eq 0 -and $r.count -eq 1 -and $r.nodeCalls -eq 1 -and $r.last.mode -eq 'run' -and $r.last.display -eq 'conout' -and $r.last.slug -match '^ah-[0-9a-f]{8}$' -and $r.last.db -and $r.last.go -and $r.last.receipt -and $r.last.base -eq $ExpBaseUrl -and $null -eq $r.last.sink -and $r.secretsLeft -eq 0 -and $r.ledgerDelta -eq 1 -and (Consumed-Rc) -eq 0) "rc=$($r.out) · display=$($r.last.display) · origin=$($r.last.base) · kalan gizli=$($r.secretsLeft)"
  $blk = Get-Content -Raw -LiteralPath (Join-Path $d.FullName 'owner-block.json'); $allTxt = (Get-ChildItem -LiteralPath $d.FullName -File | ForEach-Object { Get-Content -Raw -LiteralPath $_.FullName }) -join "`n"
  Check 'R-9' 'owner-block.json: emailSendsPlanned=0, messageRowsDeleted=false; kanıt dizininde GO literali/parola yok' ($blk -match '"emailSendsPlanned":\s*0' -and $blk -match '"messageRowsDeleted":\s*false' -and $allTxt -notmatch 'OWNER-GO-CLIENT-EXTACC-D7-20000101' -and $allTxt -notmatch 'D7S!') "dosya=$((Get-ChildItem -LiteralPath $d.FullName -File).Count)"
  Check 'R-8' 'owner beyanı AYRI dosyada (makine ölçümü değil notu; 8 yönlendirmesiz soru; owner''a gösterilen kapanış metni kayıtlı) ve manifestte' ($decl.record -eq 'EXTACC-D7-OWNER-DECLARATION' -and $decl.not -match 'beyan' -and $decl.telefonGirisSayfasiAcildi -eq 'E' -and $decl.girisSonrasiEkran -eq 'M' -and $decl.listedekiMesajSayisi -eq '3' -and $decl.telefondanMesajGonderildi -eq 'E' -and $decl.ikinciYanitGoruldu -eq 'E' -and $decl.okunmamisSayaci -eq '1' -and $decl.telefonAgi -eq 'M' -and $decl.yenilemeSonrasiEkran -eq 'G' -and $decl.closureShownToOwner -match 'DOĞRULANDI' -and (@($man | Where-Object { $_ -match 'owner-declaration\.json$' }).Count -eq 1)) "beyan=$($decl.telefonGirisSayfasiAcildi)/$($decl.girisSonrasiEkran)/$($decl.listedekiMesajSayisi)/$($decl.telefondanMesajGonderildi)/$($decl.ikinciYanitGoruldu)/$($decl.okunmamisSayaci)/$($decl.telefonAgi)/$($decl.yenilemeSonrasiEkran) · kapanış=$($decl.closureShownToOwner)"
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
  Check 'R-6' 'aynı GO ikinci kez → DUR (defter), node çağrılmaz' ($r.threw -like 'EXTACC-D7-DUR:*' -and $r.threw -match 'KULLANILDI' -and $r.nodeCalls -eq 0) "mesaj=$($r.threw)"
  $script:goN = 50
  $r = & { function node { }; Invoke-Mode 'Run' $real.Exe 0 $true }
  Check 'R-7' '`node` fonksiyon gölgesi varken gerçek node dosya yoluyla koşar' ($r.out -eq 0 -and $r.nodeCalls -eq 1) "rc=$($r.out) · node=$($r.nodeCalls)"

  # ---- RECOVER (soru sorulmaz; GO sorulmaz; defter değişmez)
  $rd = Join-Path $EvRoot 'recover-case'; New-Item -ItemType Directory -Path $rd | Out-Null
  $rcpt = Join-Path $rd 'd7-setup-receipt.json'
  '{"record":"EXTACC-D7-SETUP-RECEIPT","runId":"0123abcd","tenantId":"t","tenantSlug":"ah-0123abcd","caseId":"c","clientId":"k","elevUserId":"u","elevEmail":"e@example.invalid"}' | Set-Content -LiteralPath $rcpt -Encoding ASCII
  $r = Invoke-Mode 'Recover' $real.Exe 0 $true $rcpt @()
  $rz = Invoke-Mode 'Recover' $real.Exe 0 $true $rcpt @() 'PASS' ([pscustomobject]@{ loopbackCount = 0; otherAddresses = '0.0.0.0'; loopbackPids = ''; caddyServiceState = 'Stopped'; caddyServicePid = 0; cloudflaredStatus = 'Stopped' })
  Check 'Z-8' 'Recover: dış zincir BOZUKKEN de kapanış yapılabilir (çıkış 0, node koştu)' ($rz.out -eq 0 -and $rz.nodeCalls -eq 1 -and -not $rz.threw) "rc=$($rz.out) · istisna=$($rz.threw)"
  Check 'V-1' 'Recover: node 0 + kanıt → 0; recover modu + makbuz; soru/GO yok; ortam temiz; defter DEĞİŞMEZ' ($r.out -eq 0 -and $r.nodeCalls -eq 1 -and $r.last.mode -eq 'recover' -and $r.last.receipt -and $r.secretsLeft -eq 0 -and $r.ledgerDelta -eq 0) "rc=$($r.out)"
  $r = Invoke-Mode 'Recover' $real.Exe 6 $true $rcpt @()
  Check 'V-2' 'Recover: 6 değişmeden' ($r.out -eq 6 -and $r.nodeCalls -eq 1) "rc=$($r.out)"
  $r = Invoke-Mode 'Recover' $real.Exe 0 $false $rcpt @()
  Check 'V-3' 'Recover: kanıt yok → 7' ($r.out -eq 7) "rc=$($r.out)"
  $r = Invoke-Mode 'Recover' $bogusNode 0 $true $rcpt @()
  Check 'V-4' 'Recover: önceki kod 0 iken node başlatılamaz → 91' ($r.out -eq 91 -and $r.nodeCalls -eq 0 -and $r.prior -eq 0) "rc=$($r.out)"
  '{"record":"EXTACC-D5-SETUP-RECEIPT","runId":"0123abcd","tenantId":"t","tenantSlug":"ah-0123abcd"}' | Set-Content -LiteralPath (Join-Path $rd 'other.json') -Encoding ASCII
  $r = Invoke-Mode 'Recover' $real.Exe 0 $true (Join-Path $rd 'other.json') @()
  Check 'V-5' 'Recover: D-5 makbuzu D-7 için REDDEDİLİR (node çağrılmaz)' ($r.threw -like 'EXTACC-D7-DUR:*' -and $r.threw -match 'makbuz' -and $r.nodeCalls -eq 0) "mesaj=$($r.threw)"

  # ---- CANLI SÜRELER: pencereden devralınan değerler canlı süreleri DEĞİŞTİREMEZ
  foreach ($k in 'D7_WAIT_MS', 'D7_POLL_MS', 'D7_VIEW_MS', 'D7_HTTP_TIMEOUT_MS', 'D7_CALL_TIMEOUT_MS', 'D7_LATE_CREATE_MS') { Set-Item -Path "Env:$k" -Value '1' }
  $script:goN = 70; $r = Invoke-Mode 'Run' $real.Exe 0 $true
  $exp = @('1200000', '5000', '120000', '15000', '30000', '120000')
  $saved = $LiveParams; $LiveParams = $null; $script:goN = 72
  $r2 = Invoke-Mode 'Run' $real.Exe 0 $true
  $LiveParams = $saved
  Check 'L-2' 'Run: canlı süre tablosu eksikse node BAŞLAMAZ (sessizce devralınan değerlerle koşmaz)' ($r2.threw -like 'EXTACC-D7-DUR:*' -and $r2.threw -match 'süre tablosu' -and $r2.nodeCalls -eq 0) "mesaj=$($r2.threw)"
  Check 'L-1' 'Run: devralınan 6 süre değişkeni (=1) node''a CANLI değerlerle geçer (20 dk bekleme / 5 sn yoklama / 120 sn inceleme / zaman aşımları / 120 sn geç oluşma) ve sonra temizlenir' (($r.last.params -join ',') -eq ($exp -join ',') -and $r.secretsLeft -eq 0) "node gördü=$($r.last.params -join ',') · kalan=$($r.secretsLeft)"

  # ---- OWNER METNİ: kapanış metni kanıta bağlı; koşulsuz "kapatıldı" yok; sorular yönlendirmesiz; kalıntı metni kanıttan
  $env:EXSTUB_D9 = 'FAIL'; $script:goN = 80; $r = Invoke-Mode 'Run' $real.Exe 6 $true; $env:EXSTUB_D9 = 'PASS'
  $d = Last-EvDir; $declF = Get-Content -Raw -LiteralPath (Join-Path $d.FullName 'owner-declaration.json') | ConvertFrom-Json
  Check 'O-1' 'P7-D9 FAIL (çıkış 6): owner''a gösterilen metin "DOĞRULANAMADI", "DOĞRULANDI (" değil' ($r.out -eq 6 -and $declF.closureShownToOwner -match 'DOĞRULANAMADI' -and $declF.closureShownToOwner -notmatch 'DOĞRULANDI \(') "metin=$($declF.closureShownToOwner)"
  $cs = Get-ClosureStatus (Join-Path $T 'yok\d7-evidence.json') 7
  Check 'O-2' 'kanıt okunamazsa kapanış DOĞRULANAMADI sayılır; kalıntı metni boş' (-not $cs.verified -and $cs.text -match 'DOĞRULANAMADI' -and -not $cs.keptText) "metin=$($cs.text)"
  $cs2 = Get-ClosureStatus (Join-Path $d.FullName 'd7-evidence.json') 6
  Check 'M-1' 'kalıntı metni kanıttaki P7-MSG-KEPT satırından okunur ("saklandı … SİLİNMEDİ"); silindi DEMEZ' ($cs2.keptVerdict -eq 'PASS' -and $cs2.keptText -match 'saklandı: 5 mesaj' -and $cs2.keptText -match 'SİLİNMEDİ' -and $cs2.keptText -notmatch 'silindi' -and $cs2.residue.deleted -eq $false) "metin=$($cs2.keptText)"
  $declBody = ($funcs | Where-Object { $_.Name -eq 'Write-OwnerDeclaration' }).Extent.Text
  $leading = @('döndü mü', 'görünmedi mi', 'YALNIZ konsolda', 'oturumun kapandığını', 'kapatıldı', 'geçersiz oldu mu', 'reddedildi mi')
  $hits = @($leading | Where-Object { $declBody -match [regex]::Escape($_) })
  $srcAll = [IO.File]::ReadAllText($wrapper)
  Check 'O-3' 'owner beyanı soruları yönlendirmesiz (seçenekli; 8 soru); bloğun hiçbir yerinde koşulsuz "erişimi kapatıldı"/"silindi" yok' ($hits.Count -eq 0 -and $srcAll -cnotmatch 'erişimi kapatıldı' -and $srcAll -cnotmatch 'silindi' -and ([regex]::Matches($declBody, 'Read-Answer')).Count -eq 8) "yönlendiren=$($hits -join ',') · soru=$(([regex]::Matches($declBody, 'Read-Answer')).Count)"

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
    Check ($name.Substring(0, 3)) ("Assert-ExternalChain: " + $name.Substring(4) + ' → DUR') ($m -like 'EXTACC-D7-DUR:*') "mesaj=$m"
  }
  $m = 'yok'; try { Assert-ExternalChain $okChain; $m = $null } catch { $m = $_.Exception.Message }
  Check 'Z-0' 'Assert-ExternalChain: sağlıklı zincir (yalnız loopback, pid = servis, Cloudflared çalışıyor) geçer' ($null -eq $m) "mesaj=$m"
  $script:goN = 71; $r = Invoke-Mode 'Run' $real.Exe 0 $true '' $okAnswers 'PASS' $bad['Z-5 Cloudflared durmuş']
  Check 'Z-6' 'Run: dış zincir eksikse GO sorulmadan DURUR; defter yazılmaz; node çağrılmaz' ($r.threw -like 'EXTACC-D7-DUR:*' -and $r.threw -match 'Cloudflared' -and $r.ledgerDelta -eq 0 -and $r.nodeCalls -eq 0) "mesaj=$($r.threw)"
  $pre = $src0.Substring($src0.IndexOf('if ($Mode -eq ''Preflight'')'))
  Check 'Z-7' 'Preflight: dış zincir kapısı "PREFLIGHT GEÇTİ" yazısından ÖNCE' ($pre.IndexOf('Assert-ExternalChain $g.chain') -ge 0 -and $pre.IndexOf('Assert-ExternalChain $g.chain') -lt $pre.IndexOf('PREFLIGHT GEÇTİ')) 'sıra'

  # ---- QR DENEMESİ: yalnız açık "E" başarıdır; gösterim ile telefon okuması ayrı; adres /portal/messages ve d7-qr-test.js
  $g0 = [ordered]@{ nodeExe = $real.Exe; chain = $okChain }
  foreach ($case in @(@('E', 0), @('H', 2), @('?', 3), @('e', 3), @('', 3))) {
    $env:EXSTUB_QR_RC = '0'; Set-Answers @('https://example.invalid', $case[0])
    $q = $null; $qt = $null; try { $q = Invoke-QrTestMode $g0 } catch { $qt = $_.Exception.Message }
    Check ("Q-" + $(if ($case[0] -eq '') { 'boş' } else { $case[0] })) ("QrTest: R05 adresi + yanıt [" + $case[0] + "] → çıkış " + $case[1]) ($q -eq $case[1] -and @($q).Count -eq 1) "dönen=$q · istisna=$qt"
  }
  $env:EXSTUB_QR_RC = '4'; Set-Answers @('https://example.invalid', 'E'); $qt = $null; $q = $null; try { $q = Invoke-QrTestMode $g0 } catch { $qt = $_.Exception.Message }
  Check 'Q-G' 'QrTest: gösterim başarısızsa (qr 4) owner "E" dese de DURUR (sıfır dışı)' ($qt -like 'EXTACC-D7-DUR:*' -and $null -eq $q) "istisna=$qt"
  $env:EXSTUB_QR_RC = '0'; Set-Answers @('https://baska.invalid', 'E'); $qt = $null; $q = $null; try { $q = Invoke-QrTestMode $g0 } catch { $qt = $_.Exception.Message }
  Check 'Q-R05' 'QrTest: owner''ın yazdığı R05 adresi .env değeriyle eşleşmezse QR gösterilmeden DUR' ($qt -like 'EXTACC-D7-DUR:*' -and $qt -match 'R05' -and $null -eq $q) "istisna=$qt"
  $qrBody = ($funcs | Where-Object { $_.Name -eq 'Invoke-QrTestMode' }).Extent.Text
  Check 'Q-U' 'QrTest: adres "$ExpBaseUrl/portal/messages" ve betik d7-qr-test.js (extacc-qr-test.js DEĞİL — o yalnız /portal/login kabul eder)' ($qrBody -match '/portal/messages"' -and $qrBody -match 'd7-qr-test\.js' -and $qrBody -notmatch 'extacc-qr-test') 'statik'

  # ---- statik
  $src = [IO.File]::ReadAllText($wrapper)
  $body = ($funcs | Where-Object { $_.Name -eq 'Invoke-Node' } | Select-Object -First 1).Extent.Text
  $iS = $body.IndexOf('$global:LASTEXITCODE = -999'); $iC = $body.IndexOf('& $exe'); $iR = $body.IndexOf('$rc = $global:LASTEXITCODE')
  Check 'S-1' 'Invoke-Node: sentinel çağrıdan önce, yakalama hemen sonra' ($iS -ge 0 -and $iS -lt $iC -and $iC -lt $iR) "sentinel@$iS çağrı@$iC yakalama@$iR"
  Check 'S-2' 'başka `& node` yok' (-not ($src -match '&\s+node\b')) 'yok'
  $run = ($funcs | Where-Object { $_.Name -eq 'Invoke-RunMode' }).Extent.Text
  $iW = $run.IndexOf('Assert-LocalConsole'); $iK = $run.IndexOf('Confirm-LiveDataProcessing'); $iG = $run.IndexOf('Read-GoRef'); $iL = $run.IndexOf('Add-Content -LiteralPath $GoLedger'); $iN = $run.IndexOf('Invoke-Node')
  Check 'S-3' 'Run sırası: konsol → pencere teyidi → canlı veri onayı → GO → defter → node' ($iW -ge 0 -and $iW -lt $iK -and $iK -lt $iG -and $iG -lt $iL -and $iL -lt $iN) "konsol@$iW onay@$iK GO@$iG defter@$iL node@$iN"
  Check 'S-4' 'sink kurulmaz; D7_DISPLAY=none yok; e-posta/alıcı/gönderim kavramı yok (Read-Recipient/Confirm-SingleSend/EMAIL_PROVIDER)' ($src -notmatch '\$env:D7_TEST_DISPLAY_SINK\s*=' -and $src -notmatch "D7_DISPLAY\s*=\s*'none'" -and $src -notmatch 'Read-Recipient|Confirm-SingleSend|EMAIL_PROVIDER|D7_RECIPIENT') 'statik'
  $gates = ($funcs | Where-Object { $_.Name -eq 'Invoke-ReadOnlyGates' }).Extent.Text; $qrB = ($funcs | Where-Object { $_.Name -eq 'Invoke-QrTestMode' }).Extent.Text
  $iR05 = $run.IndexOf('Confirm-PortalBaseUrlR05'); $iConf = $run.IndexOf('Confirm-LiveDataProcessing')
  Check 'S-5' 'topoloji literali yok: $ExpBaseUrl https:// literali DEĞİL (.env''den, biçim kapısıyla); kanıt kökü $env:USERPROFILE''a göreli; "C:\Users\" yok; R05 onayı Run''da canlı veri onayından ÖNCE ve QrTest''te' ($src -notmatch "\`\$ExpBaseUrl\s*=\s*'https://" -and $src -notmatch 'C:\\Users\\' -and $src -match '\$EvRoot\s*=\s*Join-Path \$env:USERPROFILE' -and $gates -match '\$script:ExpBaseUrl\s*=\s*\$baseUrl' -and $gates -match 'Assert-PortalBaseUrl \(EnvValue ''PUBLIC_PORTAL_BASE_URL''\)' -and $iR05 -ge 0 -and $iR05 -lt $iConf -and $qrB -match 'Confirm-PortalBaseUrlR05') "R05@$iR05 onay@$iConf"

  # ---- R02 (2026-10-01) OWNER METNİ VE RECOVER YETKİSİ (D-5 R04 G-1..G-4 eşdeğeri). Ölçüm hem kaynakta (yorumlar dahil) hem owner'a
  #      GÖSTERİLEN metinde (Write-Host yakalaması) yapılır. Eski blok baytlarına karşı tam olarak G-1..G-4 FAIL verdiği ayrıca ölçülür.
  #      Değişken adı notu: PowerShell adları harf duyarsızdır; $T geçici dizindir — bu bölümde $t KULLANILMAZ.
  function Get-HostText([scriptblock]$b) { return ((@(& $b 6>&1) | ForEach-Object { [string]$_ }) -join "`n") }
  $absRe = '(?i)h[iİı]çb[iİı]r[^\r\n]{0,40}(dosya|log|günlü|kanıt|rapor)[^\r\n]{0,40}(yazılmaz|yazmaz|YAZILMAZ|YAZMAZ)'
  $absPos = @('GO ref ve token''lar hiçbir dosyaya yazılmaz', 'Hiçbir dosyaya/kanıta yazılmaz.', 'parola HİÇBİR log dosyasına YAZILMAZ', 'içerik hiçbir kanıt/rapor/log dosyasına yazılmaz')
  $absNeg = @('GO sorulmaz, hiçbir şey yazılmaz', 'bu blok ve koşucu kendi kanıt/log dosyalarına YAZMAZ')
  $absPosMiss = @($absPos | Where-Object { $_ -notmatch $absRe }); $absNegHit = @($absNeg | Where-Object { $_ -match $absRe })
  $srcLines = @($src0 -split "`n"); $absHits = @($srcLines | Where-Object { $_ -match $absRe })
  Check 'G-1' 'kaynakta (yorumlar DAHİL) "hiçbir … dosya/log/günlük/kanıt/rapor … yazılmaz" türü KAPSAMSIZ MUTLAK iddia YOK; desen kör değil: 4 bilinen mutlak cümleyi yakalar, kapsamı adlandırılmış "blok ve koşucu … YAZMAZ" ve ilgisiz "hiçbir şey yazılmaz" cümlelerini yakalamaz' ($absHits.Count -eq 0 -and $srcLines.Count -gt 300 -and $absPosMiss.Count -eq 0 -and $absNegHit.Count -eq 0) "taranan satır=$($srcLines.Count) · mutlak iddia=$($absHits.Count)$(if ($absHits.Count) { ' [' + (($absHits | ForEach-Object { $_.Trim().Substring(0, [Math]::Min(70, $_.Trim().Length)) }) -join ' | ') + ']' }) · desen pozitif kaçırılan=$($absPosMiss.Count)/$($absPos.Count) · negatif yanlış=$($absNegHit.Count)/$($absNeg.Count)"

  Set-Answers @('EVET'); $script:g2err = $null
  $consentTxt = Get-HostText { try { Confirm-LiveDataProcessing } catch { $script:g2err = $_.Exception.Message } }
  $need2 = @('İKİ yeni sentetik tenant', 'ah-<runId>-x', 'hedef tenantta iki dosya', 'yabancı tenantta bir dosya', 'BİR portal hesabı', 'PortalMessage', 'PortalNotification',
             'Ürünün kendi yazdıkları (kaynaktan okundu)', 'audit satırları', 'giriş sayacı', 'uygulama günlüğünde', 'bu blokla ÖLÇÜLMEZ', 'dosyalar CLOSED', 'personel pasif',
             'Tenant yaşam döngüsü DEĞİŞMEZ', 'dosyalar CLOSED + personel pasif + portal pasif', 'SİLİNMEZ', 'U-ISO', 'SAYISI', 'içerik karşılaştırılmaz')
  $miss2 = @($need2 | Where-Object { $consentTxt -cnotmatch [regex]::Escape($_) })
  $old2 = @(@('Gerçek müvekkil verisine dokunulmaz', 'YALNIZ yeni bir sentetik tenantta', 'hiçbir adrese', '"saklandı: n satır (sentetik tenant CLOSED)"') | Where-Object { $consentTxt -match [regex]::Escape($_) })
  $g2W = $consentTxt.IndexOf('İKİ yeni sentetik tenant'); $g2P = $consentTxt.IndexOf('Ürünün kendi yazdıkları'); $g2C = $consentTxt.IndexOf('Kapanış:'); $g2I = $consentTxt.IndexOf('U-ISO')
  # Belge eşleşmesi: onay metnindeki kalemler paket belgesi §8 ("canlıda oluşacak kayıtlar") içinde de geçer (belge yoksa/okunamazsa FAIL — boş doğrulama yok).
  $pkgDoc = Join-Path (Split-Path -Parent $here) 'EXTACC-D7-PORTAL-MESSAGES-PACKAGE-R01.md'
  $both2 = @('ah-<runId>-x', 'PortalMessage', 'PortalNotification', 'audit', 'giriş sayacı', 'uygulama günlüğü', 'dosyalar CLOSED', 'personel pasif', 'yaşam döngüsü', 'U-ISO')
  $sec8 = ''; $docErr = $null
  try {
    $docTxt = [IO.File]::ReadAllText($pkgDoc); $i8 = $docTxt.IndexOf("`n## 8."); $i9 = $docTxt.IndexOf("`n## 9.")
    if ($i8 -ge 0 -and $i9 -gt $i8) { $sec8 = $docTxt.Substring($i8, $i9 - $i8) } else { $docErr = 'belgede §8 bulunamadı' }
  } catch { $docErr = 'belge okunamadı' }
  $missDoc = @($both2 | Where-Object { $sec8 -cnotmatch [regex]::Escape($_) }); $missBlk = @($both2 | Where-Object { $consentTxt -cnotmatch [regex]::Escape($_) })
  Check 'G-2' 'owner''a GÖSTERİLEN canlı veri onayı metni: koşucunun yazdığı kayıtlar (iki sentetik tenant) → ürünün kendi yazdıkları (kaynaktan okundu; API günlüğü içeriği ÖLÇÜLMEZ) → kapanış ("dosyalar CLOSED + personel pasif + portal pasif"; tenant yaşam döngüsü DEĞİŞMEZ) → diğer tenantlar için ölçülen yalnız U-ISO (SAYI) sırasıyla yazılır; eski "Gerçek müvekkil verisine dokunulmaz" / tek başına "(sentetik tenant CLOSED)" / kapsamsız mutlak iddia YOK; kalemler paket belgesi §8 listesinde de geçer; EVET ile istisna yok' ($null -eq $script:g2err -and $miss2.Count -eq 0 -and $old2.Count -eq 0 -and $consentTxt -notmatch $absRe -and $g2W -ge 0 -and $g2W -lt $g2P -and $g2P -lt $g2C -and $g2C -lt $g2I -and $null -eq $docErr -and $sec8.Length -gt 200 -and $missDoc.Count -eq 0 -and $missBlk.Count -eq 0) "eksik=$($miss2 -join ',') · eski ifade=$($old2 -join ',') · sıra koşucu@$g2W ürün@$g2P kapanış@$g2C U-ISO@$g2I · belge §8 uzunluk=$($sec8.Length) hata=$docErr · belgede eksik=$($missDoc -join ',') · metinde eksik=$($missBlk -join ',') · istisna=$($script:g2err) · satır=$(@($consentTxt -split "`n").Count)"

  $recFn = $funcs | Where-Object { $_.Name -eq 'Invoke-RecoverMode' } | Select-Object -First 1
  $recAsk = @($recFn.Body.FindAll({ param($n) $n -is [Management.Automation.Language.CommandAst] -and (@('Read-Answer', 'Read-Host', 'Read-GoRef', 'Confirm-LiveDataProcessing', 'Confirm-PortalBaseUrlR05') -contains $n.GetCommandName()) }, $true))
  $recNode = @($recFn.Body.FindAll({ param($n) $n -is [Management.Automation.Language.CommandAst] -and $n.GetCommandName() -eq 'Invoke-Node' }, $true))
  $recSrc = $recFn.Extent.Text; $iInfo = $recSrc.IndexOf('RECOVER BAŞLIYOR'); $iRecNode = $recSrc.IndexOf('Invoke-Node')
  $g3Txt = Get-HostText { $script:capR = Invoke-Mode 'Recover' $real.Exe 0 $true $rcpt @('S1', 'S2') }; $g3r = $script:capR; $g3Left = $script:Answers.Count
  $need3 = @('RECOVER BAŞLIYOR', 'AYRI bir CANLI YAZMA', 'AYRI owner onayıyla', 'Recover yetkisi DEĞİLDİR', 'SORMAZ ve ÖLÇMEZ', 'kodla ZORLANMAZ', 'koşucu kaynağından okundu; canlıda koşulmadı',
             'GEÇİCİ olarak yeniden aktifleştirilir', 'parola özeti yeniden yazılır', 'admin/disable-user', 'kapatma audit satırı', 'YALNIZ ölçüm için yeni rastgele parola özeti',
             'closeAccess', 'açık dosyalar CLOSED', 'personel AKTİF kalmış', 'Tenant kaydı değiştirilmez', 'SİLİNMEZ', 'recover-* kanıt dizini', 'GO defteri değişmez', 'U-ISO ölçmez',
             'yeni bir Recover için yetki DEĞİLDİR')
  $miss3 = @($need3 | Where-Object { $g3Txt -cnotmatch [regex]::Escape($_) })
  $g3B = $g3Txt.IndexOf('RECOVER BAŞLIYOR'); $g3E = $g3Txt.IndexOf('KURTARMA BİTTİ')
  Check 'G-3' 'Recover başlarken owner''a GÖSTERİLEN bilgi metni: Run''ın kendi kapanışından AYRI bir canlı yazma işlemi; AYRI owner onayı (blok SORMAZ/ÖLÇMEZ); "BİR KEZ" kodla ZORLANMAZ; canlı yazma kümesi (sentetik personelin geçici yeniden aktifleştirilmesi + parola özeti, yetkili uçla kapatma + audit satırı, pasif portal hesabına ölçüm parolası özeti, personel/dosya kapanışı, kanıt dizini) — metin node çağrısından ÖNCE; yeni soru YOK (AST: soru komutu 0; kuyruktaki yanıt tüketilmedi); tek node çağrısı (mod recover); GO defteri değişmez; bitiş metni çıkış kodunun yeni bir Recover yetkisi olmadığını söyler' ($g3r.out -eq 0 -and $null -eq $g3r.threw -and $g3r.nodeCalls -eq 1 -and $g3r.last.mode -eq 'recover' -and $g3r.ledgerDelta -eq 0 -and $g3Left -eq 2 -and $recAsk.Count -eq 0 -and $recNode.Count -eq 1 -and $miss3.Count -eq 0 -and $iInfo -ge 0 -and $iInfo -lt $iRecNode -and $g3B -ge 0 -and $g3B -lt $g3E -and $g3Txt -notmatch $absRe) "rc=$($g3r.out) · node=$($g3r.nodeCalls) mod=$($g3r.last.mode) · defter+=$($g3r.ledgerDelta) · tüketilmeyen yanıt=$g3Left/2 · soru komutu (AST)=$($recAsk.Count) · Invoke-Node (AST)=$($recNode.Count) · eksik=$($miss3 -join ',') · bilgi@$iInfo node@$iRecNode · gösterim başlangıç@$g3B bitiş@$g3E · istisna=$($g3r.threw)"

  $script:goN = 90; $g4 = [ordered]@{}
  foreach ($c in 5, 6, 0) { $g4Txt = Get-HostText { $script:capR = Invoke-Mode 'Run' $real.Exe $c $true }; $g4["$c"] = [pscustomobject]@{ txt = $g4Txt; r = $script:capR } }
  $need4 = @('Recover YETKİSİ DEĞİLDİR', 'Recover BAŞLATMAZ', 'kendi kapanış adımlarını koşucu İÇİNDE', 'kanıtı inceleyin', 'ÖNERİDİR', 'AYRI owner onayıyla', 'BİR KEZ', 'CANLI YAZMA', 'kodla ZORLANMAZ')
  $bad4 = @()
  foreach ($k in '5', '6') { $x = $g4[$k]; $miss4 = @($need4 | Where-Object { $x.txt -cnotmatch [regex]::Escape($_) })
    if (-not ($x.r.out -eq [int]$k -and $x.r.nodeCalls -eq 1 -and $x.r.last.mode -eq 'run' -and $miss4.Count -eq 0 -and $x.txt -notmatch 'KAPANIŞ DOĞRULANMADI: -Mode Recover')) { $bad4 += "çıkış ${k}: rc=$($x.r.out) node=$($x.r.nodeCalls) mod=$($x.r.last.mode) eksik=$($miss4 -join ',')" } }
  $zeroRec = ($g4['0'].r.out -eq 0 -and $g4['0'].r.nodeCalls -eq 1 -and $g4['0'].txt.Length -gt 200 -and $g4['0'].txt -notmatch 'Recover')
  $runFn = $funcs | Where-Object { $_.Name -eq 'Invoke-RunMode' } | Select-Object -First 1
  $runNode = @($runFn.Body.FindAll({ param($n) $n -is [Management.Automation.Language.CommandAst] -and $n.GetCommandName() -eq 'Invoke-Node' }, $true))
  $recCalls = @($ast.FindAll({ param($n) $n -is [Management.Automation.Language.CommandAst] -and $n.GetCommandName() -eq 'Invoke-RecoverMode' }, $true))
  $recInFn = @($recCalls | Where-Object { $o = $_.Extent.StartOffset; @($funcs | Where-Object { $o -ge $_.Extent.StartOffset -and $o -lt $_.Extent.EndOffset }).Count -gt 0 })
  Check 'G-4' 'Recover yetkisi: Run çıkış 5/6''da owner''a GÖSTERİLEN metin Run''ın kendi kapanış adımlarını (koşucu içinde) Recover''dan AYIRIR, çıkış kodunun Recover YETKİSİ olmadığını ve bloğun Recover BAŞLATMADIĞINI söyler, önce kanıt incelemesini ister, Recover''ı yalnız AYRI owner onayıyla, BİR KEZ ÖNERİR ve Recover''ın ayrı bir CANLI YAZMA olduğunu / "BİR KEZ"in kodla zorlanmadığını yazar; blok tek node çağrısı yapar (mod run; recover çağrısı 0); çıkış 0''da Recover metni yok; AST: Invoke-RunMode içinde tek Invoke-Node, Invoke-RecoverMode yalnız akıştaki mod dalında (fonksiyon içinden çağrı 0)' ($bad4.Count -eq 0 -and $zeroRec -and $runNode.Count -eq 1 -and $recCalls.Count -eq 1 -and $recInFn.Count -eq 0) "hata=$($bad4 -join ' | ') · çıkış 0 Recover metni yok=$zeroRec (metin $($g4['0'].txt.Length) karakter) · Run içi Invoke-Node (AST)=$($runNode.Count) · Invoke-RecoverMode çağrısı (AST)=$($recCalls.Count), fonksiyon içinde=$($recInFn.Count)"
}
catch {
  # Beklenmeyen istisna öz-testi SESSİZCE kesmez: FAIL satırı olarak kaydedilir (kalan ölçütler koşulmadı → sonuç PASS olamaz).
  Check 'X-0' 'öz-test beklenmeyen istisna ile yarıda kesildi — kalan ölçütler KOŞULMADI' $false ("istisna=" + $_.Exception.Message + ' · satır=' + $_.InvocationInfo.ScriptLineNumber)
}
finally {
  foreach ($k in 'EXSTUB_RC', 'EXSTUB_WRITE_EVID', 'EXSTUB_MARKER', 'EXSTUB_WAIT', 'EXSTUB_QR_RC', 'EXSTUB_FINDING', 'EXSTUB_D9') { Remove-Item "Env:$k" -ErrorAction SilentlyContinue }
  Clear-SecretEnv
}

$rows | Format-Table -AutoSize -Wrap | Out-String -Width 240 | Write-Host
# Gözlem dökümü (R02): tablo genişliği gözlem sütununu düşürebildiği için ölçülen değerler ayrıca yazılır (kullanıcı profili yolu maskelenir).
Write-Host 'GÖZLEMLER (her ölçütün ölçülen değeri):'
foreach ($r in $rows) { Write-Host ("  {0,-4} {1,-10} {2}" -f $r.sonuc, $r.id, (([string]$r.gozlem) -replace '([A-Za-z]:\\Users\\)[^\\]+', '$1<kullanıcı>')) }
Write-Host ''
$fail = @($rows | Where-Object { $_.sonuc -eq 'FAIL' }).Count
Write-Host ("EXTACC D-7 OWNER BLOĞU ÖZ-TESTİ [{0}]: PASS {1} / {2}" -f $ps, ($rows.Count - $fail), $rows.Count)
Write-Host ("  test edilen blok: d7-owner-live-block.ps1 sha256={0} · koşum başlangıcı (UTC)={1}" -f (Sha $wrapper), $startedUtc)   # log tek başına hangi sürümün koşulduğunu söyler
Write-Host ("  geçici dizin: {0}  (canlı kapılar, canlı .env, canlı DB ve GO KULLANILMADI)" -f ($T -replace '^([A-Za-z]:\\Users\\)[^\\]+', '$1<kullanıcı>'))
if ($fail -gt 0) { exit 1 }
exit 0
