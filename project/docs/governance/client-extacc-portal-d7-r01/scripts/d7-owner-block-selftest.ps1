# ═══════════ EXTACC D-7 OWNER BLOĞU ÖZ-TESTİ (R01) — CANLIYA DOKUNMAZ ═══════════
# NE     : d7-owner-live-block.ps1 içindeki GERÇEK fonksiyonları (Invoke-RunMode, Invoke-RecoverMode, Invoke-QrTestMode, Invoke-Node,
#          Complete-NodeRc, Resolve-NodeExe, Confirm-LiveDataProcessing, Get-ClosureStatus, Write-OwnerDeclaration ...) AST ile yükler
#          ve koşar. Dosyanın AKIŞ bölümü (kapılar, canlı yollar) HİÇ ÇALIŞMAZ.
# YÖNLENDİRME: yalnız yol değişkenleri geçici dizine alınır ve etkileşim noktaları teste bağlanır: Read-GoRef (test GO),
#          Read-Answer (kuyruktan yanıt), Invoke-RepoGit (git grep "bulunmadı"), Assert-LocalConsole (test sürecinin çıktısı
#          yönlendirildiği için no-op; GERÇEK hali ayrıca K-1'de ölçülür), Clear-OwnerScreen (no-op).
#          Node GERÇEKTİR: PATH'teki node + geçici betik ya da BAŞLATILAMAYAN dosya.
# R02    : G-1..G-4 (D-5 R04 kalıbı) — G-1 blok kaynağında (yorumlar dahil) "hiçbir … dosya/log/kanıt … yazılmaz" türü kapsamsız mutlak iddia yok;
#          G-2 owner'a GÖSTERİLEN canlı veri onayı metnindeki kalemler paket belgesi §8 kayıt listesinde de geçer (10 kalem iki yerde; §8 ek ayrıntı
#          taşır), metin "dosyalar CLOSED + personel pasif + portal pasif; tenant yaşam döngüsü değişmez" der, kaynaktan okunan ile ölçüleni ayırır;
#          G-3 Recover başlarken canlı yazma kümesi ve yetki kuralı GÖSTERİLİR (yeni soru yok; tek node çağrısı; defter değişmez); G-4 Run çıkış 5/6
#          metni Run'ın kendi kapanışını Recover'dan ayırır, "Recover yetkisi değildir / blok başlatmaz / önce kanıt / AYRI owner onayı" der; çıkış
#          0'da Recover metni yok; tek node çağrısı.
# R02 inceleme düzeltmeleri: G-5 kalıntı satırının altındaki not — kanıttaki "sentetik tenant CLOSED" koşucunun SABİT ifadesidir, kapanışın
#          doğrulandığını göstermez; kapanış durumu Run'da DOĞRULANDI / DOĞRULANAMADI satırında, Recover'da çıkış kodu satırındadır; G-6 Recover
#          bitiş metni ikinci bir Recover için yol TANIMLAMAZ ("bu paketle tanımlı değildir; owner kararı gerektirir"); blok kaynağında ve paket
#          belgesi §5/§8/§10'da "tekrar ancak … onayıyla" türü tekrar yolu yok.
#          Ölçüm owner'a GÖSTERİLEN metinde yapılır (Write-Host yakalaması). Beklenmeyen istisna sessizce kesmez: X-0 FAIL satırı.
# R03    : PIN-1 bloğun PkgPins değerleri bu checkout'taki 9 dosyanın GERÇEK sha256'sına ve $ExpPackage yeniden hesaplanan paket digest'ine eşit
#          (koşucu değişince pin + digest birlikte güncellenmezse FAIL) · O-4 Run kapanış satırı parçaları kanıttaki verdict'lerden (tümü PASS; eski
#          SABİT "DOĞRULANDI (DB + yeni giriş + mevcut oturum mesaj ucunda reddi)" yok; satır rengi notu) · O-5 parça varyantları (hesap yok / oturum
#          yok / FAIL / P7-D9 FAIL) · O-6 Recover bitiş satırı 0 / 1 / 2 / 3'ü yalnız ölçüleni söyleyerek açıklar (eski "0 kapanış + HTTP reddi
#          doğrulandı" yok) · O-7 kurulum yarım bilgi satırı (kanıttaki setup) · G-5 kalıntı notu koşucunun YENİ (ölçülen) kapanış özetini anlatır
#          ("SABİT ifadesidir" artık yok) · G-2 onay metninde "kanıt metnindeki sentetik tenant CLOSED" atfı yok. Eski (origin/main) blok baytlarında
#          bu ölçütler FAIL verir (negatif kontrol).
# R03-c  : (owner talimatı: kapanış / Recover doğruluğu) O-6 DEĞİŞTİ — Recover bitiş satırı mevcut oturum reddinin Recover'da HER ZAMAN ölçülemediğini
#          ve yeni giriş reddinin P7-C3L/D'den okunduğunu kodlardan ÖNCE yazar; 2 ve 1 neyin doğrulandığını adlandırır. O-8 YENİ — Run çıkış 5/6 metni
#          Recover komutunu yalnız makbuz dosyası okuma kapısını geçiyorsa önerir (yok / bozuk → kanıttaki receipt yolu; kanıtta da yoksa SOMUT ENGEL).
#          Sahte koşucu Run'da kanıt dizinine makbuz yazar (EXSTUB_NO_RECEIPT / EXSTUB_EV_RECEIPT ile değiştirilir). R03 blok baytlarında (4BAE9DE0…)
#          O-6, O-8 ve PIN-1 (koşucu pini) FAIL verir (negatif kontrol).
# R03-d  : (R03-c bağımsız doğrulaması; D-6 R03-d ile aynı ilke) O-6 DEĞİŞTİ — 3'ün metni ölçülenle (m3) ve "1 + kanıt yok" / "kanıttaki exitCode ≠
#          süreç kodu" varyantlarında Recover bitiş satırı kırmızı "KAPANIŞ DOĞRULANMADI — …" der, kod açıklamalarını YAZMAZ (M2); O-8 DEĞİŞTİ — makbuz
#          yok / bozuk / BAYAT (yeni durum, m7) iken diskteki dosya önerilmez, kanıttaki makbuzJson'dan yeni dosya yazan TEK komut somut yollarla (m4);
#          O-9 o TEK komut Windows PowerShell 5.1 VE PowerShell 7'de koşulur, üretilen dosya bloğun Recover okuma kapısından ve GERÇEK koşucunun
#          readReceiptForRecover kapısından geçer (m4 kapı kalemi); O-10 ürün bulgusu ADAYI "ADAYIDIR" diye gösterilir (M1). Sahte koşucu kanıta record +
#          exitCode + recovery.makbuzJson yazar (EXSTUB_STALE / EXSTUB_EV_EXITCODE / EXSTUB_SV / EXSTUB_EXPECT_COPY / EXSTUB_REAL_RUNNER).
# R03-e  : (R03-d iki bağımsız doğrulaması, B1; D-6 O-17'nin ikizi) O-11 — kanıttaki portalClose.acikErisim (açık portal erişimi, "(Recover kapatabilir)") Run
#          sonu ekranında ürün bulgusu satırından AYRI "PORTAL ERİŞİMİ: …" satırında gösterilir; bulgu satırı onu içermez. Sahte koşucu EXSTUB_ACIK ile
#          acikErisim yazar. PIN-1 yeni koşucu pini + $ExpPackage ile. R03-d blok baytlarında (74bcbd22 aynası) O-11 FAIL beklenir (PIN-1 aynada eski koşucu +
#          eski pinle tutarlı → PASS).
# R03-f  : (R03-e iki bağımsız doğrulamasının MINOR bulguları; blokta YALNIZ yorum + pin; D-6 O-18'in ikizi) O-12 — blok kaynağında (yorumlar dahil) Recover'ın
#          açık erişimi kapatabileceğine dair kesin ifade YOK (F2) ve R03-d'den kalma bayat "P7-C2 PASS + P7-C5 FAIL iken sürüm sınıflaması" yorumu YOK (F6); ADAY
#          yorumu sessionClass200 karar tablosunu adlandırır. PIN-1 yeni koşucu pini + $ExpPackage ile. R03-e blok baytlarında (68cfae80 aynası) O-12 FAIL verir.
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
# R03 (PIN-1): bloğun pin tablosu ve paket digest'i AST'den okunur (akış ÇALIŞMAZ); karşılaştırma bu checkout'un governance dizinindeki dosyalarla.
$pinAssign = @($ast.FindAll({ param($n) $n -is [Management.Automation.Language.AssignmentStatementAst] -and $n.Left.Extent.Text -eq '$PkgPins' }, $false))
$pkgAssign = @($ast.FindAll({ param($n) $n -is [Management.Automation.Language.AssignmentStatementAst] -and $n.Left.Extent.Text -eq '$ExpPackage' }, $false))
if ($pinAssign.Count -ne 1 -or $pkgAssign.Count -ne 1) { Write-Host 'OLCULEMEDI: $PkgPins / $ExpPackage ataması bulunamadı'; exit 2 }
. ([scriptblock]::Create($pinAssign[0].Extent.Text)); . ([scriptblock]::Create($pkgAssign[0].Extent.Text))
$GovReal = (Resolve-Path -LiteralPath (Join-Path $here '..\..')).Path
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
// R03-d: Recover modunda GERÇEK koşucunun makbuz okuma kapısı (readReceiptForRecover) bu sahte koşucunun aldığı makbuz dosyasıyla koşulur (EXSTUB_REAL_RUNNER).
let rgate = null;
if (process.env.D7_MODE === 'recover' && process.env.EXSTUB_REAL_RUNNER) {
  try { const RR = require(process.env.EXSTUB_REAL_RUNNER); rgate = typeof RR.readReceiptForRecover === 'function' ? (RR.readReceiptForRecover(process.env.D7_RECEIPT).ok ? 'ok' : 'red') : 'fonksiyon-yok'; }
  catch (e) { rgate = 'hata:' + String(e && e.message).slice(0, 80); }
}
fs.appendFileSync(process.env.EXSTUB_MARKER, JSON.stringify({ mode: process.env.D7_MODE || null, db: !!process.env.AH_DATABASE_URL,
  go: !!process.env.D7_LIVE_GO_REF, receipt: !!process.env.D7_RECEIPT, display: process.env.D7_DISPLAY || null, slug: process.env.D7_EXPECT_TENANT_SLUG || null,
  sink: process.env.D7_TEST_DISPLAY_SINK || null, base: process.env.D7_EXPECT_BASE_URL || null, rgate, receiptPath: process.env.D7_RECEIPT || null,
  params: ['D7_WAIT_MS', 'D7_POLL_MS', 'D7_VIEW_MS', 'D7_HTTP_TIMEOUT_MS', 'D7_CALL_TIMEOUT_MS', 'D7_LATE_CREATE_MS'].map((k) => process.env[k] || null) }) + '\n');
// R03-c: Run modunda koşucu gibi kanıt dizinine makbuz yazar (EXSTUB_NO_RECEIPT=1 → yazmaz · B → bozuk makbuz); kanıtta receipt nesnesi (EXSTUB_EV_RECEIPT=0 → yok)
// R03-d: makbuz metni koşucunun writeJson'u gibi girintili (1); tarih biçimli alan (createdAt) ve ASCII dışı karakter içerir. Kanıtta recovery.makbuzJson = bu metin
// (EXSTUB_STALE=1 → kanıttaki metin diskteki dosyadan FARKLI: bayat makbuz). Kanıtta record + exitCode (EXSTUB_EV_EXITCODE ile farklı verilebilir).
const rcptText = JSON.stringify({ record: 'EXTACC-D7-SETUP-RECEIPT', runId: String(process.env.D7_RUNID || ''), tenantId: 't', tenantSlug: process.env.D7_EXPECT_TENANT_SLUG || '', clientId: 'k',
  elevUserId: 'u', elevEmail: 'e@example.invalid', createdAt: '2026-10-03T20:15:25.123Z', note: 'çğış-İÖÜ' }, null, 1);
if (process.env.D7_MODE === 'run' && process.env.D7_RECEIPT && process.env.EXSTUB_NO_RECEIPT !== '1') fs.writeFileSync(process.env.D7_RECEIPT, process.env.EXSTUB_NO_RECEIPT === 'B' ? '{"record":"BASKA"}' : rcptText);
if (process.env.EXSTUB_EXPECT_COPY) fs.writeFileSync(process.env.EXSTUB_EXPECT_COPY, rcptText);
if (process.env.EXSTUB_WRITE_EVID === '1') {
  const noRc = process.env.EXSTUB_EV_RECEIPT === '0';
  fs.writeFileSync(process.env.D7_EVID_FILE, JSON.stringify({ record: process.env.D7_MODE === 'recover' ? 'EXTACC-D7-RECOVER' : 'EXTACC-D7-PORTAL-MESSAGES-LIVE-RUN',
    exitCode: Number(process.env.EXSTUB_EV_EXITCODE !== undefined ? process.env.EXSTUB_EV_EXITCODE : (process.env.EXSTUB_RC || 0)), productFinding: process.env.EXSTUB_FINDING || null,
    receipt: noRc ? undefined : { record: 'EXTACC-D7-SETUP-RECEIPT', runId: String(process.env.D7_RUNID || ''), createdAt: '2026-10-03T20:15:25.123Z' },
    recovery: noRc ? undefined : { gerekli: true, makbuzJson: process.env.EXSTUB_STALE === '1' ? rcptText.replace('"clientId": "k",', '"clientId": "k",\n "runnerMessageIds": [\n  "m1"\n ],') : rcptText },
    portalClose: (process.env.EXSTUB_SV || process.env.EXSTUB_ACIK) ? Object.assign({}, process.env.EXSTUB_SV ? { sessionVersion: { sinif: process.env.EXSTUB_SV } } : {},
      process.env.EXSTUB_ACIK ? { acikErisim: process.env.EXSTUB_ACIK } : {}) : undefined,   // R03-e: açık portal erişimi (koşucu portalClose.acikErisim)
    messageResidue: { portalMessages: 5, portalNotifications: 2, deleted: false }, setup: process.env.EXSTUB_SETUP ? JSON.parse(process.env.EXSTUB_SETUP) : undefined,
    results: [{ id: 'P7-WAIT', verdict: process.env.EXSTUB_WAIT || 'PASS' }, { id: 'D7-3B', verdict: 'PASS' }, { id: 'P7-D9', verdict: process.env.EXSTUB_D9 || 'PASS' },
      { id: 'P7-MSG-KEPT', verdict: 'PASS', observed: 'yerinde=4/4 · saklandı: 5 mesaj (koşucu 4 · telefon 1) + 2 bildirim satırı (kapanış, ölçülen: personel pasif + dosyalar CLOSED (U-CLOSE PASS); portal DB\'de pasif ölçüldü (P7-C2 PASS)) — SİLİNMEDİ' }]
      .concat(JSON.parse(process.env.EXSTUB_EXTRA || '[]')) }));
}
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
  # R03: koşucu artık "sentetik tenant CLOSED" yazmaz (kapanış özeti ölçülenden) → onay metni o ifadeye atıf yapmaz.
  $old2 = @(@('Gerçek müvekkil verisine dokunulmaz', 'YALNIZ yeni bir sentetik tenantta', 'hiçbir adrese', '"saklandı: n satır (sentetik tenant CLOSED)"', 'kanıt metnindeki "sentetik tenant CLOSED"') | Where-Object { $consentTxt -match [regex]::Escape($_) })
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
  Check 'G-2' 'owner''a GÖSTERİLEN canlı veri onayı metni: koşucunun yazdığı kayıtlar (iki sentetik tenant) → ürünün kendi yazdıkları (kaynaktan okundu; API günlüğü içeriği ÖLÇÜLMEZ) → kapanış ("dosyalar CLOSED + personel pasif + portal pasif"; tenant yaşam döngüsü DEĞİŞMEZ) → diğer tenantlar için ölçülen yalnız U-ISO (SAYI) sırasıyla yazılır; eski "Gerçek müvekkil verisine dokunulmaz" / tek başına "(sentetik tenant CLOSED)" / (R03) kanıt metnindeki sentetik tenant CLOSED ifadesine atıf / kapsamsız mutlak iddia YOK; kalemler paket belgesi §8 listesinde de geçer; EVET ile istisna yok' ($null -eq $script:g2err -and $miss2.Count -eq 0 -and $old2.Count -eq 0 -and $consentTxt -notmatch $absRe -and $g2W -ge 0 -and $g2W -lt $g2P -and $g2P -lt $g2C -and $g2C -lt $g2I -and $null -eq $docErr -and $sec8.Length -gt 200 -and $missDoc.Count -eq 0 -and $missBlk.Count -eq 0) "eksik=$($miss2 -join ',') · eski ifade=$($old2 -join ',') · sıra koşucu@$g2W ürün@$g2P kapanış@$g2C U-ISO@$g2I · belge §8 uzunluk=$($sec8.Length) hata=$docErr · belgede eksik=$($missDoc -join ',') · metinde eksik=$($missBlk -join ',') · istisna=$($script:g2err) · satır=$(@($consentTxt -split "`n").Count)"

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

  # ---- R02 inceleme düzeltmeleri (2026-10-01): G-5 kalıntı satırının altındaki not · G-6 ikinci bir Recover için yol TANIMLANMAZ.
  #      Ölçüm owner'a GÖSTERİLEN metinde yapılır; satır kaydırması ölçümü etkilemesin diye boşluklar tek boşluğa indirgenir.
  function Get-Flat([string]$s) { return ($s -replace '\s+', ' ') }
  function Get-Tail([string]$s, [string]$from) { $i = $s.IndexOf($from); if ($i -lt 0) { return '' }; return $s.Substring($i) }
  # R03: koşucu artık kalıntı metnine SABİT "(sentetik tenant CLOSED …)" yazmaz; kapanış özetini ölçülenden kurar ("(kapanış, ölçülen: …)"). Not bu
  #      yeni metni anlatır; eski "koşucunun SABİT ifadesidir" notu ve eski eşitlik gösterilen metinde ve blok kaynağında YOK.
  $oldNote5 = @('koşucunun SABİT ifadesidir', '"sentetik tenant CLOSED" =')
  $common5 = @('kapanış özeti koşucunun kanıttaki U-CLOSE ve portal DB ölçümünden kurulur', 'sabit ifade değildir', 'Hedeflenen kapanış = dosyalar CLOSED + personel pasif + portal pasif', 'tenant yaşam döngüsü DEĞİŞMEZ')
  $runRef5 = 'Kapanışın tamamı yukarıdaki "Portal erişim kapanışı ..." satırındadır'
  $recRef5 = @('Kapanış durumu yukarıdaki çıkış kodu satırındadır', 'ayrı bir DOĞRULANDI / DOĞRULANAMADI satırı gösterilmez')
  $env:EXSTUB_D9 = 'FAIL'; $g5fAll = Get-Flat (Get-HostText { $script:capR = Invoke-Mode 'Run' $real.Exe 6 $true }); $g5fR = $script:capR; $env:EXSTUB_D9 = 'PASS'
  $g5pAll = Get-Flat $g4['0'].txt   # Run, kapanış doğrulandı (çıkış 0) — G-4'te yakalanan metin
  $g5rAll = Get-Flat (Get-HostText { $script:capR = Invoke-Mode 'Recover' $real.Exe 6 $true $rcpt @() }); $g5rR = $script:capR
  $bad5 = @()
  foreach ($x in @(@('Run çıkış 6 (kapanış doğrulanmadı)', $g5fAll, 'Portal erişim kapanışı DOĞRULANAMADI', 'EXTACC D-7 KOŞUM BİTTİ', (@($common5) + $runRef5)),
                   @('Run çıkış 0 (kapanış doğrulandı)', $g5pAll, 'Portal erişim kapanışı: koşucunun birleşik ölçütü P7-D9 PASS', 'EXTACC D-7 KOŞUM BİTTİ', (@($common5) + $runRef5)),
                   @('Recover çıkış 6', $g5rAll, 'EXTACC D-7 KURTARMA BİTTİ', 'EXTACC D-7 KURTARMA BİTTİ', (@($common5) + $recRef5)))) {
    $tail5 = Get-Tail $x[1] $x[3]; $miss5 = @($x[4] | Where-Object { $tail5 -cnotmatch [regex]::Escape($_) })
    $old5 = @($oldNote5 | Where-Object { $tail5 -cmatch [regex]::Escape($_) })
    $iSt5 = $x[1].IndexOf($x[2]); $iKept5 = $x[1].IndexOf('Mesaj kalıntısı: '); $iNote5 = $x[1].IndexOf('kapanış özeti koşucunun kanıttaki')
    if (-not ($tail5.Length -gt 100 -and $miss5.Count -eq 0 -and $old5.Count -eq 0 -and $tail5 -cmatch [regex]::Escape('(kapanış, ölçülen: ') -and $iSt5 -ge 0 -and $iSt5 -lt $iKept5 -and $iKept5 -lt $iNote5)) {
      $bad5 += "$($x[0]): eksik=$($miss5 -join ',') · eski not=$($old5 -join ',') · durum satırı@$iSt5 kalıntı@$iKept5 not@$iNote5 · metin=$($tail5.Length)"
    }
  }
  $oldSrc5 = @($oldNote5 | Where-Object { $src0 -cmatch [regex]::Escape($_) })
  $recNoLine5 = ($g5rAll -cnotmatch 'Portal erişim kapanışı')   # Recover'da "Portal erişim kapanışı ..." satırı gösterilmez; not da ona atıf yapmaz
  Check 'G-5' 'kalıntı satırının altındaki not (owner''a GÖSTERİLEN metin; Run kapanış doğrulanmadı çıkış 6 · Run çıkış 0 · Recover çıkış 6) — R03: parantez içindeki kapanış özeti koşucunun kanıttaki U-CLOSE ve portal DB ölçümünden kurulur, sabit ifade değildir; kapanışın tamamı Run''da yukarıdaki "Portal erişim kapanışı ..." satırındadır (satır kalıntı satırından ÖNCE gösterilir), Recover''da çıkış kodu satırındadır (Recover''da öyle bir satır gösterilmez); hedeflenen kapanış = dosyalar CLOSED + personel pasif + portal pasif; tenant yaşam döngüsü DEĞİŞMEZ; eski "koşucunun SABİT ifadesidir" notu ve eski eşitlik ("sentetik tenant CLOSED" = …) gösterilen metinde ve blok kaynağında YOK' ($bad5.Count -eq 0 -and $oldSrc5.Count -eq 0 -and $recNoLine5 -and $g5fR.out -eq 6 -and $g5fR.nodeCalls -eq 1 -and $g5rR.out -eq 6 -and $g5rR.nodeCalls -eq 1 -and $g5rR.last.mode -eq 'recover') "hata=$($bad5 -join ' | ') · kaynakta eski not=$($oldSrc5 -join ',') · Run(6) rc=$($g5fR.out) node=$($g5fR.nodeCalls) · Recover(6) rc=$($g5rR.out) node=$($g5rR.nodeCalls) mod=$($g5rR.last.mode) · Recover metninde 'Portal erişim kapanışı' satırı yok=$recNoLine5 · ölçülen metin (karakter) Run6/Run0/Recover=$($g5fAll.Length)/$($g5pAll.Length)/$($g5rAll.Length)"

  $rptRe = '[Tt]ekrar ancak|[Tt]ekrar edilebilir|[Tt]ekrar gerekiyorsa|[Yy]eni(den)? (AYRI )?(owner )?onay(la|ıyla)[^\r\n]{0,40}[Tt]ekrar'
  $rptPos = @('sonuç CLIENT''a bildirilir, tekrar ancak AYRI owner onayıyla.', 'yeni onayla tekrar edilebilir', 'tekrar gerekiyorsa yeni kanıt incelemesi ve yeni AYRI owner onayı gerekir', 'Recover yeni owner onayıyla bir kez daha tekrar koşulur')
  $rptNeg = @('Recover TEKRARLANMAZ; ölçülemeyen satırlar Run kanıtıyla birlikte', 'Kabulü TEKRARLAMAYIN.', 'otomatik tekrar · otomatik Recover', 'İkinci bir Recover bu paketle TANIMLI DEĞİLDİR; owner kararı gerektirir.', 'kabul tekrarlanmaz')
  $rptPosMiss = @($rptPos | Where-Object { $_ -cnotmatch $rptRe }); $rptNegHit = @($rptNeg | Where-Object { $_ -cmatch $rptRe })
  $need6 = @('Bu çıkış kodu yeni bir Recover için yetki DEĞİLDİR', 'Recover BİR KEZ koşulur (kodla zorlanmaz)', 'sonuç CLIENT''a bildirilir.', 'İkinci bir Recover bu paketle TANIMLI DEĞİLDİR', 'owner kararı gerektirir')
  $bad6 = @()
  foreach ($c in 0, 3, 5, 6) {
    $g6All = Get-Flat (Get-HostText { $script:capR = Invoke-Mode 'Recover' $real.Exe $c $true $rcpt @() }); $g6R = $script:capR
    $tail6 = Get-Tail $g6All 'EXTACC D-7 KURTARMA BİTTİ'; $miss6 = @($need6 | Where-Object { $tail6 -cnotmatch [regex]::Escape($_) })
    if (-not ($g6R.out -eq $c -and $g6R.nodeCalls -eq 1 -and $g6R.last.mode -eq 'recover' -and $tail6.Length -gt 100 -and $miss6.Count -eq 0 -and $g6All -cnotmatch $rptRe)) { $bad6 += "Recover çıkış ${c}: rc=$($g6R.out) node=$($g6R.nodeCalls) eksik=$($miss6 -join ',') · tekrar yolu=$($g6All -cmatch $rptRe)" }
  }
  foreach ($k in '5', '6') { $run6 = Get-Flat $g4[$k].txt; if (-not ($run6 -cmatch 'ikinci bir Recover bu paketle TANIMLI DEĞİLDİR \(owner kararı gerektirir\)' -and $run6 -cnotmatch $rptRe)) { $bad6 += "Run çıkış ${k}: 'TANIMLI DEĞİLDİR' yok ya da tekrar yolu var" } }
  $rptSrc = @($srcLines | Where-Object { $_ -cmatch $rptRe })
  # Belge: §5 (owner adımları), §8 (+§8.1) ve §10 ikinci Recover'ı "tanımlı değildir" diye yazar ve bir tekrar yolu tanımlamaz (belge okunamazsa FAIL — boş doğrulama yok).
  $docSec6 = [ordered]@{}; $docBad6 = @()
  foreach ($p6 in @(@('§5', "`n## 5.", "`n## 6."), @('§8', "`n## 8.", "`n## 9."), @('§10', "`n## 10.", "`n## 11."))) {
    $a6 = -1; $b6 = -1; if ($null -eq $docErr -and $docTxt) { $a6 = $docTxt.IndexOf($p6[1]); $b6 = $docTxt.IndexOf($p6[2]) }
    $sec6 = if ($a6 -ge 0 -and $b6 -gt $a6) { Get-Flat $docTxt.Substring($a6, $b6 - $a6) } else { '' }
    $docSec6[$p6[0]] = $sec6.Length
    if (-not ($sec6.Length -gt 200 -and $sec6 -cmatch 'bu paketle tanımlı değildir' -and $sec6 -cnotmatch $rptRe)) { $docBad6 += "$($p6[0]) (uzunluk=$($sec6.Length) · 'tanımlı değildir'=$($sec6 -cmatch 'bu paketle tanımlı değildir') · tekrar yolu=$($sec6 -cmatch $rptRe))" }
  }
  Check 'G-6' 'ikinci Recover için yol TANIMLANMAZ: Recover bitişinde owner''a GÖSTERİLEN metin (stub çıkış 0/3/5/6) "bu çıkış kodu yeni bir Recover için yetki DEĞİLDİR; Recover BİR KEZ koşulur (kodla zorlanmaz); sonuç CLIENT''a bildirilir" ve "ikinci bir Recover bu paketle TANIMLI DEĞİLDİR; owner kararı gerektirir" der; Run çıkış 5/6 metni de aynı kuralı taşır; gösterilen metinlerde ve blok kaynağında (yorumlar DAHİL) "tekrar ancak … onayıyla / yeni onayla tekrar edilebilir" türü bir tekrar yolu YOK; desen kör değil (4 bilinen tekrar-yolu cümlesini yakalar; "TEKRARLANMAZ / TEKRARLAMAYIN / otomatik tekrar / TANIMLI DEĞİLDİR" cümlelerini yakalamaz); paket belgesi §5, §8 ve §10 "bu paketle tanımlı değildir" der ve tekrar yolu tanımlamaz; her Recover tek node çağrısı (mod recover)' ($bad6.Count -eq 0 -and $rptSrc.Count -eq 0 -and $srcLines.Count -gt 300 -and $rptPosMiss.Count -eq 0 -and $rptNegHit.Count -eq 0 -and $null -eq $docErr -and $docBad6.Count -eq 0) "hata=$($bad6 -join ' | ') · kaynakta tekrar yolu=$($rptSrc.Count) (taranan satır=$($srcLines.Count)) · desen pozitif kaçırılan=$($rptPosMiss.Count)/$($rptPos.Count) · negatif yanlış=$($rptNegHit.Count)/$($rptNeg.Count) · belge hata=$docErr · belge bölüm uzunlukları §5/§8/§10=$($docSec6['§5'])/$($docSec6['§8'])/$($docSec6['§10']) · belgede uyumsuz=$($docBad6 -join ' | ')"

  # ---- R03: PIN-1 — bloğun pinleri bu checkout'taki GERÇEK dosya baytlarına eşit (Invoke-ReadOnlyGates ile aynı Sha + Digest yöntemi; canlı kapı KOŞULMAZ)
  $pinBad = @(); $pk1 = [System.Collections.Generic.List[string]]::new(); $pinN = 0
  foreach ($f in $PkgPins.Keys) {
    $p = Join-Path $GovReal $f
    if (-not (Test-Path -LiteralPath $p -PathType Leaf)) { $pinBad += "YOK:$f"; continue }
    $h = Sha $p; $pinN++
    if ($h -ne $PkgPins[$f]) { $pinBad += "$(Split-Path -Leaf $f)=$($h.Substring(0, 8))!=$($PkgPins[$f].Substring(0, 8))" }
    $pk1.Add(($f -replace '\\', '/') + [char]0 + $h + "`n")
  }
  $dig1 = Digest $pk1
  Check 'PIN-1' 'bloğun PkgPins tablosundaki 9 dosyanın pini bu checkout''taki GERÇEK sha256''ya ve $ExpPackage yeniden hesaplanan paket digest''ine EŞİT (koşucu değişince pin + digest birlikte güncellenir; aksi halde canlı Preflight DUR verirdi)' ($PkgPins.Count -eq 9 -and $pinN -eq 9 -and $pinBad.Count -eq 0 -and $dig1 -eq $ExpPackage) "dosya=$pinN/$($PkgPins.Count) · uyuşmayan=$(if ($pinBad.Count) { $pinBad -join ',' } else { 'yok' }) · digest=$($dig1.Substring(0, 16)) beklenen=$($ExpPackage.Substring(0, 16))"

  # ---- R03: O-4 / O-5 — Run kapanış satırı parçaları kanıttaki ölçüt verdict'lerinden (D-6 R02 kalıbı; eski SABİT "DOĞRULANDI (DB + yeni giriş …)" yok)
  function New-ClosureEvid([string]$name, [hashtable]$v) {
    $p = Join-Path $T ("closure-$name.json")
    $res = @($v.Keys | Sort-Object | ForEach-Object { [pscustomobject]@{ id = $_; verdict = $v[$_] } })
    [IO.File]::WriteAllText($p, ([pscustomobject]@{ productFinding = $null; results = $res } | ConvertTo-Json -Depth 4))
    return $p
  }
  $partLabels = @('DB kapalı', 'yeni giriş reddi', 'mevcut oturum reddi', 'personel/dosya kapanışı')
  function Get-Parts([string]$txt) { return (@($partLabels | ForEach-Object { $pm = [regex]::Match($txt, [regex]::Escape($_) + '[^·]*?\]: (PASS|FAIL|ÖLÇÜLMEDİ)'); if ($pm.Success) { $pm.Groups[1].Value } else { 'YOK' } }) -join '/') }
  $oldClaim = 'DOĞRULANDI \(DB \+ yeni giriş'
  $vAll = @{ 'P7-D9' = 'PASS'; 'P7-C1' = 'PASS'; 'P7-C2' = 'PASS'; 'P7-C2V' = 'PASS'; 'P7-C5' = 'PASS'; 'P7-C3L' = 'PASS'; 'P7-C3D' = 'PASS'; 'P7-C4L' = 'PASS'; 'P7-C4D' = 'PASS'; 'U-CLOSE' = 'PASS' }
  $cs4 = Get-ClosureStatus (New-ClosureEvid 'all' $vAll) 0
  $extraIds = @('P7-C2', 'P7-C2V', 'P7-C5', 'P7-C3L', 'P7-C3D', 'P7-C4L', 'P7-C4D', 'U-CLOSE')
  $env:EXSTUB_EXTRA = '[' + (($extraIds | ForEach-Object { '{"id":"' + $_ + '","verdict":"PASS"}' }) -join ',') + ']'
  $script:goN = 55; $o4Txt = Get-HostText { $script:capR = Invoke-Mode 'Run' $real.Exe 0 $true }; $o4 = $script:capR; Remove-Item 'Env:EXSTUB_EXTRA' -ErrorAction SilentlyContinue
  $d4o = Last-EvDir; $shown4 = [string](Get-Content -Raw -Encoding UTF8 -LiteralPath (Join-Path $d4o.FullName 'owner-declaration.json') | ConvertFrom-Json).closureShownToOwner
  $o4Lines = @($o4Txt -split "`n"); $o4Main = @($o4Lines | Where-Object { $_ -cmatch '^Koşum bitti\.' })
  $noteRe4 = [regex]::Escape('satır rengi yalnız birleşik ölçütü (P7-D9) gösterir'); $o4Note = @($o4Lines | Where-Object { $_ -cmatch $noteRe4 })
  $o4Color = ([regex]::Matches($declBody, '-ForegroundColor \$c\b')).Count -eq 1 -and $declBody.Contains('$c = if ($closure -and $closure.verified) { ''Green'' } else { ''Red'' }')
  Check 'O-4' 'Run kapanış satırı (owner''a GÖSTERİLEN ve beyan dosyasına yazılan metin) — tüm kapanış ölçütleri PASS: "P7-D9 PASS" + dört parçanın HER BİRİ için kanıttaki verdict (PASS/PASS/PASS/PASS); "DOĞRULANDI yalnız bu satırın devamında PASS yazan parçalar içindir"; mevcut oturumun KOŞUCUNUN kendi oturumu olduğunu ve telefondaki oturumu koşucunun ÖLÇMEDİĞİNİ söyler; eski SABİT "DOĞRULANDI (DB + yeni giriş + mevcut oturum mesaj ucunda reddi)" metni gösterilen metinde ve blok kaynağında YOK; parçalar "Koşum bitti." satırının İÇİNDE; "satır rengi yalnız birleşik ölçütü (P7-D9) gösterir" notu gösterilir; renk mantığı tek `-ForegroundColor $c` ($c yalnız $closure.verified''a bağlı)' ($cs4.verified -and (Get-Parts $cs4.text) -eq 'PASS/PASS/PASS/PASS' -and $cs4.text -cmatch 'P7-D9 PASS' -and $cs4.text -cmatch 'koşucunun kendi portal oturumu' -and $cs4.text -cmatch 'koşucu ÖLÇMEZ' -and $cs4.text -cmatch 'DOĞRULANDI yalnız bu satırın devamında PASS yazan parçalar içindir' -and $cs4.text -cnotmatch $oldClaim -and $src0 -cnotmatch $oldClaim -and $o4.out -eq 0 -and (Get-Parts $shown4) -eq 'PASS/PASS/PASS/PASS' -and $o4Main.Count -eq 1 -and $shown4.Length -gt 0 -and $o4Main[0].Contains($shown4) -and $o4Note.Count -eq 1 -and $o4Color) "birim=$(Get-Parts $cs4.text) · Run beyanı=$(Get-Parts $shown4) · rc=$($o4.out) · satır=$($o4Main.Count) not=$($o4Note.Count) · renk=$o4Color · kaynakta eski metin=$($src0 -cmatch $oldClaim)"
  $vNo = @{ 'P7-D9' = 'PASS'; 'P7-C1' = 'PASS'; 'U-CLOSE' = 'PASS' }
  $v5b = $vAll.Clone(); $v5b['P7-C4L'] = 'UNMEASURED'; $v5b['P7-C4D'] = 'UNMEASURED'
  $v5c = $vAll.Clone(); $v5c['P7-C2V'] = 'UNMEASURED'
  $v5d = $vAll.Clone(); $v5d['P7-C3D'] = 'FAIL'; $v5d['P7-C4L'] = 'UNMEASURED'
  $v5e = $vAll.Clone(); $v5e['P7-D9'] = 'FAIL'
  $cs5a = Get-ClosureStatus (New-ClosureEvid 'noaccount' $vNo) 1; $cs5b = Get-ClosureStatus (New-ClosureEvid 'nosession' $v5b) 3
  $cs5c = Get-ClosureStatus (New-ClosureEvid 'c2v' $v5c) 3; $cs5d = Get-ClosureStatus (New-ClosureEvid 'fail' $v5d) 2; $cs5e = Get-ClosureStatus (New-ClosureEvid 'd9fail' $v5e) 6
  $o5Old = @(@($cs5a, $cs5b, $cs5c, $cs5d, $cs5e) | Where-Object { $_.text -cmatch $oldClaim })
  Check 'O-5' 'parça verdict''i kanıttan (D-7''de P7-D9 PASS iken ölçülmemiş parça olabilir — belge §9): portal hesabı hiç açılmamış (P7-C2..C5 satırı YOK; ör. yarım kurulum) → DB / yeni giriş / mevcut oturum "ÖLÇÜLMEDİ", personel PASS; koşucu oturumu yok (P7-C4L/D UNMEASURED) → yalnız mevcut oturum "ÖLÇÜLMEDİ"; gruptaki tek ölçüt PASS değilse (P7-C2V UNMEASURED) grup "ÖLÇÜLMEDİ"; gruptaki bir ölçüt FAIL ise "FAIL" (yumuşatılmaz); P7-D9 FAIL ise metin DOĞRULANAMADI ve parça listesi YOK; hiçbirinde eski sabit cümle yok' ($cs5a.verified -and (Get-Parts $cs5a.text) -eq 'ÖLÇÜLMEDİ/ÖLÇÜLMEDİ/ÖLÇÜLMEDİ/PASS' -and (Get-Parts $cs5b.text) -eq 'PASS/PASS/ÖLÇÜLMEDİ/PASS' -and (Get-Parts $cs5c.text) -eq 'ÖLÇÜLMEDİ/PASS/PASS/PASS' -and (Get-Parts $cs5d.text) -eq 'PASS/FAIL/ÖLÇÜLMEDİ/PASS' -and -not $cs5e.verified -and $cs5e.text -match 'DOĞRULANAMADI' -and (Get-Parts $cs5e.text) -eq 'YOK/YOK/YOK/YOK' -and $o5Old.Count -eq 0) "hesap yok=$(Get-Parts $cs5a.text) · oturumsuz=$(Get-Parts $cs5b.text) · C2V=$(Get-Parts $cs5c.text) · FAIL=$(Get-Parts $cs5d.text) · D9 FAIL=$(Get-Parts $cs5e.text) · eski cümle=$($o5Old.Count)"

  # ---- R03: O-6 — Recover bitiş satırı 0 / 1 / 2 / 3'ü yalnız ölçüleni söyleyerek açıklar (eski "0 kapanış + HTTP reddi doğrulandı" yok)
  # R03-c (DEĞİŞTİ): mevcut oturum reddinin Recover'da HER ZAMAN ölçülemediği + yeni giriş reddinin P7-C3L/D'den okunduğu kodlardan ÖNCE, genel olarak;
  #        2 ve 1 neyin doğrulandığını adlandırır (portal DB kapanışı ya da hesap yok + personel/dosya kapanışı); eski "kapanışlar doğrulandı" YOK.
  $o6Need = @("HER KODDA: mevcut oturum reddi Recover'da ÖLÇÜLEMEZ — HER ZAMAN (P7-C4L/D", 'P7-C3L/D satırlarından okunur', '0 = FAIL ve ÖLÇÜLEMEYEN satır yok', 'fiilen beklenmez',
              '3 = FAIL yok, en az bir ölçüt ÖLÇÜLEMEYEN — P7-C2 / P7-C5 ölçüldü; P7-C2V FAIL değil (ÖLÇÜLEMEYEN olabilir — kanıttaki satır) ya da portal hesabı yok; personel/dosya kapanışı doğrulandı',
              '2 = 3''teki portal ölçütleri (ya da portal hesabı yok) ve personel/dosya kapanışı doğrulandı, hazırlık hatası yok, en az bir satır FAIL', 'yalnız P7-MSG-KEPT',
              '1 = DURDU: 3''teki portal ölçütleri (ya da portal hesabı yok) ve personel/dosya kapanışı doğrulandı ama hazırlık adımında hata', 'fatal alanı', 'HTTP reddinin doğrulandığı anlamına GELMEZ',
              '6 portal DB/HTTP kapanışı doğrulanmadı', '5 personel/dosya kapanışı doğrulanmadı', '4 kimlik reddi', '7 kanıt yok', '91 node başlatılamadı')
  # R03-d (m3): eski "3 = portal DB kapanışı ölçüldü …" (P6/P7-C2V ÖLÇÜLEMEYEN olabilirken) ve "kanıt dosyası yoksa … bitmiş olabilir" (M2: artık kanıt ölçülür) eski metinlere eklendi
  $o6Old = @('0 kapanış + HTTP reddi doğrulandı', '3 DB kapalı ama bazı HTTP kontrolleri ÖLÇÜLEMEDİ', '2 = kapanışlar doğrulandı', '1 = DURDU: kapanışlar doğrulandı', '3 = portal DB kapanışı ölçüldü ya da portal hesabı yok', 'kanıt dosyası yoksa node yakalanmamış bir hatayla bitmiş olabilir')
  $o6bad = @()
  foreach ($c in 0, 1, 2, 3) {
    $t6 = Get-Flat (Get-HostText { $script:capR = Invoke-Mode 'Recover' $real.Exe $c $true $rcpt @() }); $r6 = $script:capR; $tl6 = Get-Tail $t6 'EXTACC D-7 KURTARMA BİTTİ'
    $m6 = @($o6Need | Where-Object { $tl6 -cnotmatch [regex]::Escape($_) }); $x6 = @($o6Old | Where-Object { $tl6 -cmatch [regex]::Escape($_) })
    $iGen6 = $tl6.IndexOf('HER KODDA'); $i06 = $tl6.IndexOf('0 = FAIL ve ÖLÇÜLEMEYEN')
    if (-not ($r6.out -eq $c -and $r6.nodeCalls -eq 1 -and $r6.last.mode -eq 'recover' -and $tl6.Length -gt 200 -and $m6.Count -eq 0 -and $x6.Count -eq 0 -and $iGen6 -ge 0 -and $iGen6 -lt $i06)) { $o6bad += "çıkış ${c}: rc=$($r6.out) node=$($r6.nodeCalls) eksik=$($m6 -join ',') eski=$($x6 -join ',') genel@$iGen6 0@$i06" }
  }
  $o6Src = @($o6Old | Where-Object { $src0 -cmatch [regex]::Escape($_) })
  # R03-d (M2): "1 + kanıt yok" (koşucu yakalanmamış hatayla kanıt yazmadan 1) · "3 + kanıttaki exitCode 1" (kod farklı) → kırmızı KAPANIŞ DOĞRULANMADI, kod açıklaması YOK
  $t6n = Get-Flat (Get-HostText { $script:capR = Invoke-Mode 'Recover' $real.Exe 1 $false $rcpt @() }); $r6n = $script:capR; $tl6n = Get-Tail $t6n 'EXTACC D-7 KURTARMA BİTTİ'
  $env:EXSTUB_EV_EXITCODE = '1'; $t6k = Get-Flat (Get-HostText { $script:capR = Invoke-Mode 'Recover' $real.Exe 3 $true $rcpt @() }); $r6k = $script:capR; $tl6k = Get-Tail $t6k 'EXTACC D-7 KURTARMA BİTTİ'; Remove-Item 'Env:EXSTUB_EV_EXITCODE' -ErrorAction SilentlyContinue
  $legend6 = '0 = FAIL ve ÖLÇÜLEMEYEN|doğrulandı ama hazırlık|3 = FAIL yok'
  $o6NoEv = ($r6n.out -eq 1 -and $r6n.nodeCalls -eq 1 -and $tl6n.Contains('KAPANIŞ DOĞRULANMADI — kanıt yok; koşucu yakalanmamış hatayla bitti, hiçbir kapanış ölçülmedi') -and $tl6n -cnotmatch $legend6 -and $tl6n.Contains('İkinci bir Recover bu paketle TANIMLI DEĞİLDİR') -and
             $r6k.out -eq 3 -and $tl6k.Contains('KAPANIŞ DOĞRULANMADI — kanıttaki exitCode (1) süreç çıkış koduyla (3) EŞİT DEĞİL') -and $tl6k -cnotmatch $legend6 -and $tl6k -cnotmatch 'Recover TEKRARLANMAZ')
  Check 'O-6' 'Recover bitiş satırı (owner''a GÖSTERİLEN metin; taklit betik çıkış 0/1/2/3 KANITLI, her biri değişmeden taşınır, tek node çağrısı) · R03-d: 3 = "FAIL yok, en az bir ölçüt ÖLÇÜLEMEYEN — P7-C2 / P7-C5 ölçüldü; P7-C2V FAIL değil (ÖLÇÜLEMEYEN olabilir — kanıttaki satır) ya da portal hesabı yok …", 2 / 1 "3''teki portal ölçütleri" atfıyla (m3); "1 + kanıt yok" → kırmızı "KAPANIŞ DOĞRULANMADI — kanıt yok; koşucu yakalanmamış hatayla bitti, hiçbir kapanış ölçülmedi", kod açıklaması YOK; kanıttaki exitCode süreç kodundan farklıysa "… EŞİT DEĞİL", açıklama YOK (M2); eski "3 = portal DB kapanışı ölçüldü" ve "kanıt dosyası yoksa … bitmiş olabilir" YOK · R03-c — kodlardan ÖNCE genel olarak "HER KODDA: mevcut oturum reddi Recover''da ÖLÇÜLEMEZ — HER ZAMAN (P7-C4L/D …)" + yeni giriş reddi P7-C3L/D satırlarından okunur; 0 = "FAIL ve ÖLÇÜLEMEYEN satır yok" + koşucu mantığında fiilen beklenmez; 3 = portal DB kapanışı ölçüldü ya da hesap yok, FAIL yok, en az bir ölçüt ÖLÇÜLEMEYEN, personel/dosya kapanışı doğrulandı; 2 = portal DB kapanışı (ya da hesap yok) ve personel/dosya kapanışı doğrulandı + FAIL (Recover''da yalnız P7-MSG-KEPT); 1 = DURDU: aynı kapanışlar doğrulandı + hazırlık hatası (fatal alanı; HTTP reddinin doğrulandığı anlamına GELMEZ); 6 / 5 / 4 / 7 / 91 açıklamalı; eski "0 kapanış + HTTP reddi doğrulandı", "3 DB kapalı ama bazı HTTP kontrolleri ÖLÇÜLEMEDİ", "2 = kapanışlar doğrulandı", "1 = DURDU: kapanışlar doğrulandı" gösterilen metinde ve blok kaynağında YOK' ($o6bad.Count -eq 0 -and $o6Src.Count -eq 0 -and $o6NoEv) "hata=$($o6bad -join ' | ') · kaynakta eski metin=$($o6Src -join ',') · R03-d 1+kanıt yok: rc=$($r6n.out) [$($tl6n.Substring(0, [Math]::Min(260, $tl6n.Length)))] · kod farklı: rc=$($r6k.out) [$($tl6k.Substring(0, [Math]::Min(200, $tl6k.Length)))]"

  # ---- R03: O-7 — kurulum yarım bilgi satırı (koşucu kanıtındaki setup; TAMAM iken satır yok)
  $env:EXSTUB_SETUP = '{"asama":"ek-dosya-ayni-tenant","tamamlanan":["izolasyon-sayimi","kurulum","makbuz","ek-dosya-yabanci"],"durum":"YARIM_MAKBUZ_VAR","makbuzDosyasi":true}'
  $script:goN = 60; $o7Txt = Get-HostText { $script:capR = Invoke-Mode 'Run' $real.Exe 1 $true }; $o7 = $script:capR
  $env:EXSTUB_SETUP = '{"asama":"ek-dosya-ayni-tenant","tamamlanan":[],"durum":"TAMAM","makbuzDosyasi":true}'
  $script:goN = 62; $o7tTxt = Get-HostText { $script:capR = Invoke-Mode 'Run' $real.Exe 0 $true }; $o7t = $script:capR; Remove-Item 'Env:EXSTUB_SETUP' -ErrorAction SilentlyContinue
  $o7Lines = @($o7Txt -split "`n" | Where-Object { $_ -cmatch 'KURULUM YARIM KALDI' })
  Check 'O-7' 'Run: kanıttaki setup.durum TAMAM değilse owner''a "KURULUM YARIM KALDI" bilgi satırı durum + son aşama + makbuz dosyası ile gösterilir, kapanış sonucunu yukarıdaki kapanış satırına bağlar ve "Recover yetkisi DEĞİLDİR" der; setup.durum TAMAM iken satır yok; çıkış kodu değişmez (tek node çağrısı)' ($o7.out -eq 1 -and $o7.nodeCalls -eq 1 -and $o7Lines.Count -eq 1 -and $o7Lines[0] -cmatch 'durum=YARIM_MAKBUZ_VAR' -and $o7Lines[0] -cmatch 'son aşama=ek-dosya-ayni-tenant' -and $o7Lines[0] -cmatch 'makbuz dosyası=True' -and $o7Lines[0] -cmatch 'yukarıdaki kapanış satırındadır' -and $o7Lines[0] -cmatch 'Recover yetkisi DEĞİLDİR' -and $o7t.out -eq 0 -and $o7t.nodeCalls -eq 1 -and $o7tTxt -cnotmatch 'KURULUM YARIM KALDI') "yarım: rc=$($o7.out) satır=$($o7Lines.Count) [$(@($o7Lines) -join ' | ')] · TAMAM: rc=$($o7t.out) satır=$(@($o7tTxt -split "`n" | Where-Object { $_ -cmatch 'KURULUM YARIM KALDI' }).Count)"

  # ---- R03-c: O-8 — Run çıkış 5/6 metni Recover komutunu YALNIZ kanıt dizinindeki makbuz dosyası Recover'ın okuma kapısını geçiyorsa önerir
  #      (koşucu: makbuz bellekte var ama dosyası yazılamadı → setup.durum=YARIM_MAKBUZ_DOSYASI_YAZILAMADI; blok: dosyayı kendisi denetler)
  # R03-d: m4 (kanıttaki makbuzJson → yeni dosya: TEK komut) + m7 (BAYAT makbuz önerilmez) ile beklentiler değişti; 'bayat' durumu eklendi.
  $o8 = [ordered]@{}; $script:goN = 30   # 31..35 başka ölçütte kullanılmaz (GO defteri tekrar kullanımı reddeder; GO biçimi iki haneli R\d{2})
  foreach ($case in @(@('var', '0', '1', 6, '0'), @('yok', '1', '1', 6, '0'), @('bozuk', 'B', '1', 5, '0'), @('yok-kanitta-yok', '1', '0', 6, '0'), @('bayat', '0', '1', 6, '1'))) {
    $env:EXSTUB_NO_RECEIPT = $case[1]; $env:EXSTUB_EV_RECEIPT = $case[2]; $env:EXSTUB_STALE = $case[4]
    $o8Txt = Get-HostText { $script:capR = Invoke-Mode 'Run' $real.Exe $case[3] $true }; $iEnd8 = $o8Txt.IndexOf('EXTACC D-7 KOŞUM BİTTİ')
    $o8[$case[0]] = [pscustomobject]@{ tail = $(if ($iEnd8 -ge 0) { Get-Flat $o8Txt.Substring($iEnd8) } else { '' }); r = $script:capR; rc = $case[3]; ev = (Last-EvDir).FullName }
  }
  Remove-Item 'Env:EXSTUB_NO_RECEIPT', 'Env:EXSTUB_EV_RECEIPT', 'Env:EXSTUB_STALE' -ErrorAction SilentlyContinue
  $cmd8 = '-Mode Recover -ReceiptFile <makbuz>'
  $o8Var = $o8['var']; $o8Yok = $o8['yok']; $o8Boz = $o8['bozuk']; $o8Eng = $o8['yok-kanitta-yok']; $o8Bay = $o8['bayat']
  # Kanıttaki makbuzJson yolu: GÖSTERİLEN TEK komut + -ReceiptFile '<kanıt dizini>\d7-setup-receipt-kanittan.json' (somut yol; yer tutucu değil). Get-Flat boşlukları teke indirir.
  $cmdOk8 = { param($x) $e = (Join-Path ([string]$x.ev) 'd7-evidence.json').Replace("'", "''"); $n = (Join-Path ([string]$x.ev) 'd7-setup-receipt-kanittan.json').Replace("'", "''")
              $x.tail.Contains((Get-Flat "(Get-Content -Raw -Encoding UTF8 -LiteralPath '$e' | ConvertFrom-Json).recovery.makbuzJson | Set-Content -Encoding UTF8 -NoNewline -LiteralPath '$n'")) -and $x.tail.Contains("-Mode Recover -ReceiptFile '$n'") -and $x.tail.Contains('AYRI owner onayıyla, BİR KEZ') }
  $o8Ok = (@($o8.Values | Where-Object { $_.r.out -ne $_.rc -or $_.r.nodeCalls -ne 1 -or $_.r.last.mode -ne 'run' }).Count -eq 0 -and
           $o8Var.tail.Contains("ÖNERİDİR: $cmd8") -and $o8Var.tail.Contains('Makbuz dosyası: VAR — kanıttaki son makbuz metniyle (recovery.makbuzJson) EŞİT') -and $o8Var.tail.Contains("Recover'da DB'de doğrular") -and $o8Var.tail -cnotmatch 'BAŞLATILAMAZ' -and -not $o8Var.tail.Contains('makbuzJson | Set-Content') -and
           -not $o8Yok.tail.Contains($cmd8) -and $o8Yok.tail.Contains('MAKBUZ DOSYASI YOK') -and $o8Yok.tail.Contains('bloktan Recover BAŞLATILAMAZ') -and (& $cmdOk8 $o8Yok) -and $o8Yok.tail -cnotmatch 'SOMUT ENGEL' -and
           -not $o8Boz.tail.Contains($cmd8) -and $o8Boz.tail.Contains('MAKBUZ DOSYASI OKUNAMIYOR') -and (& $cmdOk8 $o8Boz) -and
           -not $o8Eng.tail.Contains('-ReceiptFile <') -and -not $o8Eng.tail.Contains("-ReceiptFile '") -and -not $o8Eng.tail.Contains('makbuzJson | Set-Content') -and $o8Eng.tail.Contains('SOMUT ENGEL: kanıtta makbuz metni (recovery.makbuzJson) YOK') -and $o8Eng.tail.Contains('owner/CLIENT') -and
           -not $o8Bay.tail.Contains($cmd8) -and -not $o8Bay.tail.Contains('Makbuz dosyası: VAR') -and $o8Bay.tail.Contains('MAKBUZ DOSYASI BAYAT (kanıttaki son makbuz metniyle — recovery.makbuzJson — EŞİT DEĞİL') -and $o8Bay.tail.Contains('eksik kapanış') -and $o8Bay.tail.Contains('bu dosyayla Recover ÖNERİLMEZ') -and (& $cmdOk8 $o8Bay) -and
           @($o8.Values | Where-Object { $_.tail -cnotmatch 'ikinci bir Recover bu paketle TANIMLI DEĞİLDİR \(owner kararı gerektirir\)' -or $_.tail -cmatch $rptRe }).Count -eq 0)
  Check 'O-8' 'Run çıkış 5/6 metni (GÖSTERİLEN): makbuz dosyası okuma kapısını geçiyor VE kanıttaki son makbuz metniyle (recovery.makbuzJson) EŞİTSE "ÖNERİDİR: -Mode Recover -ReceiptFile <makbuz>" + "Makbuz dosyası: VAR — … EŞİT"; R03-d: makbuz YOK (6) / bozuk (5) / BAYAT (6; m7) → diskteki dosya ÖNERİLMEZ (bayatta neden: "EŞİT DEĞİL … eksik kapanış") ve kanıttaki makbuzJson''dan yeni dosya yazan TEK komut SOMUT yollarla + "-Mode Recover -ReceiptFile ''<kanıt dizini>\d7-setup-receipt-kanittan.json''" (AYRI owner onayıyla, BİR KEZ); kanıtta makbuz metni yoksa "SOMUT ENGEL" (komut YOK) + owner/CLIENT; beş durumda da "ikinci bir Recover bu paketle TANIMLI DEĞİLDİR (owner kararı gerektirir)" ve tekrar yolu YOK; çıkış kodu değişmeden, tek node çağrısı' $o8Ok "istisna=$(@($o8.Values | ForEach-Object { $_.r.threw } | Where-Object { $_ }) -join ' | ') · var: rc=$($o8Var.r.out) komut=$($o8Var.tail.Contains($cmd8)) · yok: rc=$($o8Yok.r.out) komut=$($o8Yok.tail.Contains($cmd8)) tek komut=$(& $cmdOk8 $o8Yok) · bozuk: rc=$($o8Boz.r.out) tek komut=$(& $cmdOk8 $o8Boz) · kanıtta-yok: rc=$($o8Eng.r.out) engel=$($o8Eng.tail.Contains('SOMUT ENGEL')) · bayat: rc=$($o8Bay.r.out) disk önerisi=$($o8Bay.tail.Contains($cmd8)) BAYAT=$($o8Bay.tail.Contains('MAKBUZ DOSYASI BAYAT')) tek komut=$(& $cmdOk8 $o8Bay)"

  # ---- R03-d: O-9 (m4 kapı kalemi) — bloğun GÖSTERDİĞİ TEK komut Windows PowerShell 5.1 VE PowerShell 7'de GERÇEKTEN koşulur; üretilen dosya bloğun Recover
  #      okuma kapısından (Get-ReceiptFileState + Invoke-RecoverMode okuma kısmı) VE GERÇEK koşucunun Recover kapısından (readReceiptForRecover; BOM atılır) geçer.
  #      PowerShell 7'nin ConvertFrom-Json'u tarih biçimli dizgeleri DateTime'a çevirir (kanıttaki receipt.createdAt — gözlem); makbuzJson DİZGE alanı birebir kalmalı.
  function Invoke-ShellCmd([string]$shell, [string]$cmd) {
    $enc = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($cmd)); $saved = $env:PSModulePath; $oldE = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
    try {
      $exe = if ($shell -eq 'ps51') { $env:PSModulePath = $null; Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe' } else { [string](@(Get-Command pwsh -CommandType Application -ErrorAction SilentlyContinue) | Select-Object -First 1).Source }
      if (-not $exe -or -not (Test-Path -LiteralPath $exe -PathType Leaf)) { return [pscustomobject]@{ rc = -1; out = "kabuk yok: $shell" } }
      $o = & $exe -NoProfile -NonInteractive -EncodedCommand $enc 2>&1; return [pscustomobject]@{ rc = $LASTEXITCODE; out = (($o | ForEach-Object { [string]$_ }) -join ' ') }
    } finally { $env:PSModulePath = $saved; $ErrorActionPreference = $oldE }
  }
  $expCopy = Join-Path $T 'o9-beklenen-makbuz.txt'; $env:EXSTUB_EXPECT_COPY = $expCopy; $env:EXSTUB_NO_RECEIPT = '1'; $env:EXSTUB_EV_RECEIPT = '1'; $script:goN = 36
  $o9Txt = Get-HostText { $script:capR = Invoke-Mode 'Run' $real.Exe 6 $true }; $o9Run = $script:capR; $o9Ev = (Last-EvDir).FullName
  Remove-Item 'Env:EXSTUB_EXPECT_COPY', 'Env:EXSTUB_NO_RECEIPT', 'Env:EXSTUB_EV_RECEIPT' -ErrorAction SilentlyContinue
  $o9Cmd = @($o9Txt -split "`n" | Where-Object { $_ -cmatch '^\s+\(Get-Content -Raw -Encoding UTF8 -LiteralPath ' } | ForEach-Object { $_.Trim() })
  $o9Exp = if (Test-Path -LiteralPath $expCopy) { [IO.File]::ReadAllText($expCopy, [Text.UTF8Encoding]::new($false)) } else { $null }
  $o9New = Join-Path $o9Ev 'd7-setup-receipt-kanittan.json'; $o9Res = [ordered]@{}
  $env:EXSTUB_REAL_RUNNER = Join-Path $here 'd7-portal-messages-live-run.js'
  foreach ($sh in 'ps51', 'ps7') {
    if (Test-Path -LiteralPath $o9New) { Remove-Item -LiteralPath $o9New -Force }
    $x = if ($o9Cmd.Count -eq 1) { Invoke-ShellCmd $sh $o9Cmd[0] } else { [pscustomobject]@{ rc = -2; out = "komut satırı sayısı $($o9Cmd.Count)" } }
    $dst = Join-Path $o9Ev "d7-setup-receipt-kanittan-$sh.json"; $bytes = $null; $txt = $null
    if (Test-Path -LiteralPath $o9New -PathType Leaf) { Move-Item -LiteralPath $o9New -Destination $dst -Force; $bytes = [IO.File]::ReadAllBytes($dst); $txt = [IO.File]::ReadAllText($dst, [Text.UTF8Encoding]::new($false)) }
    $bom = ($null -ne $bytes -and $bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF)
    $dateType = (Invoke-ShellCmd $sh ("(Get-Content -Raw -Encoding UTF8 -LiteralPath '{0}' | ConvertFrom-Json).receipt.createdAt.GetType().Name" -f (Join-Path $o9Ev 'd7-evidence.json').Replace("'", "''"))).out.Trim()
    $gs1 = if ($bytes) { Get-ReceiptFileState $dst } else { $null }; $gs2 = if ($bytes) { Get-ReceiptFileState $dst $o9Exp } else { $null }
    $rv = if ($bytes) { Invoke-Mode 'Recover' $real.Exe 0 $true $dst @() } else { $null }
    $o9Res[$sh] = [pscustomobject]@{ rc = $x.rc; out = $x.out; bom = $bom; same = ($null -ne $txt -and $null -ne $o9Exp -and $txt -ceq $o9Exp); gate1 = ($gs1 -and $gs1.usable); gate2 = ($gs2 -and $gs2.usable)
                                     recThrew = $(if ($rv) { $rv.threw } else { 'koşulmadı' }); recNode = $(if ($rv) { $rv.nodeCalls } else { 0 }); rgate = $(if ($rv -and $rv.last) { $rv.last.rgate } else { $null }); recPath = $(if ($rv -and $rv.last) { $rv.last.receiptPath } else { $null }); dateType = $dateType }
  }
  Remove-Item 'Env:EXSTUB_REAL_RUNNER' -ErrorAction SilentlyContinue
  $q51 = $o9Res['ps51']; $q7 = $o9Res['ps7']
  $o9Ok = ($o9Run.out -eq 6 -and $o9Cmd.Count -eq 1 -and $null -ne $o9Exp -and $o9Exp.Contains('"createdAt": "2026-10-03T20:15:25.123Z"') -and
           $q51.rc -eq 0 -and $q51.bom -and $q51.same -and $q51.gate1 -and $q51.gate2 -and -not $q51.recThrew -and $q51.recNode -eq 1 -and $q51.rgate -eq 'ok' -and $q51.recPath -eq (Join-Path $o9Ev 'd7-setup-receipt-kanittan-ps51.json') -and
           $q7.rc -eq 0 -and -not $q7.bom -and $q7.same -and $q7.gate1 -and $q7.gate2 -and -not $q7.recThrew -and $q7.recNode -eq 1 -and $q7.rgate -eq 'ok')
  Check 'O-9' 'kanıttaki makbuzJson → yeni makbuz: bloğun GÖSTERDİĞİ TEK komut Windows PowerShell 5.1 ve PowerShell 7''de koşuldu (çıkış 0); 5.1 dosyası UTF-8 BOM''lu, 7 dosyası BOM''suz; iki dosyanın metni (BOM hariç) sahte koşucunun yazdığı makbuz metnine BİREBİR eşit (tarih biçimli createdAt + ASCII dışı karakter dahil — dizge alanı tarih dönüşümüne UĞRAMADI); iki dosya bloğun Recover okuma kapısından geçer (Get-ReceiptFileState; makbuzJson eşitliği dahil) ve Invoke-RecoverMode okuma kısmı DUR vermeden koşucuyu bu dosyayla çağırır; GERÇEK koşucunun Recover okuma kapısı (readReceiptForRecover, BOM atılır) iki dosyada "ok"' $o9Ok "Run rc=$($o9Run.out) komut satırı=$($o9Cmd.Count) · ps51: rc=$($q51.rc) BOM=$($q51.bom) birebir=$($q51.same) blok kapısı=$($q51.gate1)/$($q51.gate2) Recover istisna=[$($q51.recThrew)] node=$($q51.recNode) koşucu kapısı=$($q51.rgate) receipt.createdAt türü=$($q51.dateType) çıktı=[$($q51.out)] · ps7: rc=$($q7.rc) BOM=$($q7.bom) birebir=$($q7.same) blok kapısı=$($q7.gate1)/$($q7.gate2) Recover istisna=[$($q7.recThrew)] node=$($q7.recNode) koşucu kapısı=$($q7.rgate) receipt.createdAt türü=$($q7.dateType) çıktı=[$($q7.out)]"

  # ---- R03-d: O-10 (M1, blok tarafı) — ürün bulgusu ADAYI (kanıtta portalClose.sessionVersion.sinif=ADAY) "ADAYIDIR (CLIENT doğrular)" diye gösterilir; kesin bulgu metni korunur
  $env:EXSTUB_FINDING = 'ÜRÜN BULGUSU ADAYI: x'; $env:EXSTUB_SV = 'ADAY'; $env:EXSTUB_D9 = 'FAIL'; $script:goN = 37
  $o10aTxt = Get-HostText { $script:capR = Invoke-Mode 'Run' $real.Exe 6 $true }; $o10a = $script:capR
  $env:EXSTUB_FINDING = 'ÜRÜN BULGUSU: y'; Remove-Item 'Env:EXSTUB_SV' -ErrorAction SilentlyContinue; $script:goN = 38
  $o10bTxt = Get-HostText { $script:capR = Invoke-Mode 'Run' $real.Exe 6 $true }; $o10b = $script:capR
  Remove-Item 'Env:EXSTUB_FINDING' -ErrorAction SilentlyContinue; $env:EXSTUB_D9 = 'PASS'
  $o10Ok = ($o10a.out -eq 6 -and $o10aTxt.Contains('ÜRÜN BULGUSU ADAYI: x — bu bir ÜRÜN BULGUSU ADAYIDIR (CLIENT doğrular); kapanış PASS SAYILMAZ') -and -not $o10aTxt.Contains('bu bir ÜRÜN BULGUSUDUR') -and
            $o10b.out -eq 6 -and $o10bTxt.Contains('ÜRÜN BULGUSU: y — bu bir ÜRÜN BULGUSUDUR; kapanış PASS SAYILMAZ') -and -not $o10bTxt.Contains('ADAYIDIR'))
  # ---- R03-e: O-11 (B1, blok tarafı) — kanıtta portalClose.acikErisim varsa "PORTAL ERİŞİMİ: …" AYRI satırda gösterilir; ürün bulgusu satırı onu İÇERMEZ (birleşik tek satır YOK)
  $o11Find = 'ÜRÜN BULGUSU ADAYI (T2): eski portal oturumu sürüm reddine rağmen mesaj ucuna erişti (ölçüm); oturum reddi ürün tarafıdır, Recover düzeltemez'
  $o11Acik = 'portal hesabı açık (HTTP ölçümlerinden sonra isActive=true hasPortalAccess=true sürüm=2) — açık erişim kapatılmalıdır (Recover kapatabilir)'
  $env:EXSTUB_FINDING = $o11Find; $env:EXSTUB_SV = 'ADAY'; $env:EXSTUB_ACIK = $o11Acik; $env:EXSTUB_D9 = 'FAIL'; $script:goN = 39
  $o11aTxt = Get-HostText { $script:capR = Invoke-Mode 'Run' $real.Exe 6 $true }; $o11a = $script:capR
  Remove-Item 'Env:EXSTUB_ACIK' -ErrorAction SilentlyContinue; $script:goN = 40
  $o11bTxt = Get-HostText { $script:capR = Invoke-Mode 'Run' $real.Exe 6 $true }; $o11b = $script:capR
  Remove-Item 'Env:EXSTUB_FINDING', 'Env:EXSTUB_SV' -ErrorAction SilentlyContinue; $env:EXSTUB_D9 = 'PASS'
  $o11aLines = @($o11aTxt -split "`n"); $o11FindL = @($o11aLines | Where-Object { $_.Contains($o11Find) }); $o11AcikL = @($o11aLines | Where-Object { $_ -cmatch '^\s*PORTAL ERİŞİMİ: ' })
  $o11Ok = ($o11a.out -eq 6 -and $o11FindL.Count -eq 1 -and $o11AcikL.Count -eq 1 -and $o11FindL[0] -ne $o11AcikL[0] -and $o11AcikL[0].Contains("PORTAL ERİŞİMİ: $o11Acik") -and
            -not $o11FindL[0].Contains('Recover kapatabilir') -and -not $o11FindL[0].Contains('açık erişim') -and -not $o11AcikL[0].Contains('Recover düzeltemez') -and $o11FindL[0].Contains('ADAYIDIR (CLIENT doğrular)') -and
            $o11b.out -eq 6 -and @($o11bTxt -split "`n" | Where-Object { $_ -cmatch '^\s*PORTAL ERİŞİMİ: ' }).Count -eq 0)
  Check 'O-10' 'ürün bulgusu satırı (GÖSTERİLEN): kanıtta portalClose.sessionVersion.sinif=ADAY ise "… — bu bir ÜRÜN BULGUSU ADAYIDIR (CLIENT doğrular)" ("ÜRÜN BULGUSUDUR" YOK); sınıf yoksa (P7-C2 + P7-C5 PASS iken kesin bulgu) "… — bu bir ÜRÜN BULGUSUDUR" aynen' $o10Ok "aday: rc=$($o10a.out) ADAYIDIR=$($o10aTxt.Contains('ADAYIDIR (CLIENT doğrular)')) · kesin: rc=$($o10b.out) BULGUSUDUR=$($o10bTxt.Contains('bu bir ÜRÜN BULGUSUDUR'))"
  Check 'O-11' 'R03-e: ürün bulgusu satırı ile açık portal erişimi satırı (GÖSTERİLEN) AYRI — kanıtta portalClose.acikErisim varsa "PORTAL ERİŞİMİ: portal hesabı açık (…) — açık erişim kapatılmalıdır (Recover kapatabilir)" kendi satırında; ürün bulgusu satırı ("… Recover düzeltemez — bu bir ÜRÜN BULGUSU ADAYIDIR …") "Recover kapatabilir" / "açık erişim" İÇERMEZ, açık erişim satırı "Recover düzeltemez" İÇERMEZ; acikErisim yoksa "PORTAL ERİŞİMİ:" satırı YOK; çıkış kodu değişmeden' $o11Ok "açık: rc=$($o11a.out) bulgu satırı=$($o11FindL.Count) erişim satırı=$($o11AcikL.Count) [$(@($o11AcikL) -join ' | ')] · açık yok: rc=$($o11b.out)"

  # ---- R03-f: O-12 (F2 + F6, blok tarafı; statik; D-6 O-18'in ikizi) — blok kaynağında (yorumlar DAHİL) Recover'ın açık erişimi kapatabileceğine dair kesin ifade
  #      YOK ve R03-d'den kalma bayat ADAY yorumu YOK; ADAY yorumu karar tablosunu (sessionClass200) adlandırır. Gösterilen "PORTAL ERİŞİMİ:" metni koşucudan gelir (O-11).
  $o12Src = [IO.File]::ReadAllText($wrapper, [Text.Encoding]::UTF8)
  $o12Kap = ([regex]::Matches($o12Src, 'Recover kapatabilir')).Count; $o12Eski = ([regex]::Matches($o12Src, [regex]::Escape('P7-C2 PASS + P7-C5 FAIL iken sürüm sınıflaması'))).Count
  $o12Ok = ($o12Src.Length -gt 1000 -and $o12Kap -eq 0 -and $o12Eski -eq 0 -and $o12Src.Contains('sessionClass200 karar tablosunun ADAY hücreleri'))
  Check 'O-12' 'R03-f (F2 + F6): blok kaynağında (yorumlar dahil) "Recover kapatabilir" YOK; R03-d''den kalma bayat yorum ("P7-C2 PASS + P7-C5 FAIL iken sürüm sınıflaması") YOK; ADAY gösterim yorumu "sessionClass200 karar tablosunun ADAY hücreleri" der' $o12Ok "kaynak=$($o12Src.Length) karakter · Recover-kapatabilir sayısı=$o12Kap · bayat R03-d yorumu=$o12Eski · karar tablosu yorumu=$($o12Src.Contains('sessionClass200 karar tablosunun ADAY hücreleri'))"
}
catch {
  # Beklenmeyen istisna öz-testi SESSİZCE kesmez: FAIL satırı olarak kaydedilir (kalan ölçütler koşulmadı → sonuç PASS olamaz).
  Check 'X-0' 'öz-test beklenmeyen istisna ile yarıda kesildi — kalan ölçütler KOŞULMADI' $false ("istisna=" + $_.Exception.Message + ' · satır=' + $_.InvocationInfo.ScriptLineNumber)
}
finally {
  foreach ($k in 'EXSTUB_RC', 'EXSTUB_WRITE_EVID', 'EXSTUB_MARKER', 'EXSTUB_WAIT', 'EXSTUB_QR_RC', 'EXSTUB_FINDING', 'EXSTUB_D9', 'EXSTUB_EXTRA', 'EXSTUB_SETUP', 'EXSTUB_NO_RECEIPT', 'EXSTUB_EV_RECEIPT',
             'EXSTUB_STALE', 'EXSTUB_EV_EXITCODE', 'EXSTUB_SV', 'EXSTUB_EXPECT_COPY', 'EXSTUB_REAL_RUNNER', 'EXSTUB_ACIK') { Remove-Item "Env:$k" -ErrorAction SilentlyContinue }
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
