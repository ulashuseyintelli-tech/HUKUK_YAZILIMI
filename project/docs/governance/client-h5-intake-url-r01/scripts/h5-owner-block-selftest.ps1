# ═══════════ H5-URL OWNER BLOĞU ÖZ-TESTİ (R03) — CANLIYA DOKUNMAZ ═══════════
# NE     : h5-owner-live-block.ps1 içindeki GERÇEK fonksiyonları (Invoke-RunMode, Invoke-RecoverMode, Invoke-Node,
#          Complete-NodeRc, Resolve-NodeExe, Set-RunEnv, Clear-SecretEnv ...) AST ile yükler ve koşar. Dosyanın AKIŞ
#          bölümü (kapılar, GO sorusu, canlı yollar) HİÇ ÇALIŞMAZ.
# YÖNLENDİRME: yalnız yol değişkenleri geçici dizine alınır ($Sc, $EvRoot, $GoLedger, $EnvFile, $Rel, $Repo) ve iki
#          etkileşim noktası değiştirilir: Read-GoRef (test GO'su) ve Invoke-RepoGit (git grep "bulunmadı" = 1).
#          Node GERÇEKTİR: ya PATH'teki gerçek node + geçici betik, ya da BAŞLATILAMAYAN bir dosya.
# ÖLÇER  : önceki LASTEXITCODE=0 iken node başlatılamazsa Run ve Recover 0 DEĞİL 91 döner; çıkış kodları değişmeden
#          taşınır; 0 + kanıt yok = 7; node doğrulaması; gizli ortam temizliği; GO tekrar kullanım reddi.
# KULLANIM: powershell.exe -NoProfile -ExecutionPolicy Bypass -File h5-owner-block-selftest.ps1
#           pwsh -NoProfile -ExecutionPolicy Bypass -File h5-owner-block-selftest.ps1
# ÇIKIŞ  : 0 hepsi PASS · 1 en az bir FAIL · 2 ölçülemedi
$ErrorActionPreference = 'Stop'
$here    = $PSScriptRoot
$wrapper = Join-Path $here 'h5-owner-live-block.ps1'

# ---- gerçek fonksiyonları yükle (akış çalışmaz)
$tok = $null; $perr = $null
$ast = [Management.Automation.Language.Parser]::ParseFile($wrapper, [ref]$tok, [ref]$perr)
if ($perr.Count -gt 0) { Write-Host "OLCULEMEDI: wrapper ayrıştırılamadı ($($perr.Count) hata)"; exit 2 }
$funcs = @($ast.FindAll({ param($n) $n -is [Management.Automation.Language.FunctionDefinitionAst] }, $false))
foreach ($f in $funcs) { . ([scriptblock]::Create($f.Extent.Text)) }
$secAssign = @($ast.FindAll({ param($n) $n -is [Management.Automation.Language.AssignmentStatementAst] -and $n.Left.Extent.Text -eq '$SecretEnv' }, $false))
if ($secAssign.Count -ne 1) { Write-Host 'OLCULEMEDI: $SecretEnv ataması bulunamadı'; exit 2 }
. ([scriptblock]::Create($secAssign[0].Extent.Text))
$need = 'Invoke-RunMode', 'Invoke-RecoverMode', 'Invoke-Node', 'Complete-NodeRc', 'Resolve-NodeExe', 'Assert-FreshEvidence', 'Set-RunEnv', 'Clear-SecretEnv', 'Read-GoRef', 'Invoke-RepoGit'
$missing = @($need | Where-Object { -not (Get-Command $_ -CommandType Function -ErrorAction SilentlyContinue) })
if ($missing.Count -gt 0) { Write-Host "OLCULEMEDI: wrapper fonksiyonu yok: $($missing -join ',')"; exit 2 }

# ---- geçici ortam (canlı yollar KULLANILMAZ)
$T = Join-Path ([IO.Path]::GetTempPath()) ('h5-ownerblock-test-' + [Guid]::NewGuid().ToString('N').Substring(0, 8))
foreach ($d in 'sc', 'ev', 'rel', 'repo', 'bogus', 'badcmd', 'empty') { New-Item -ItemType Directory -Path (Join-Path $T $d) | Out-Null }
$Sc = Join-Path $T 'sc'; $EvRoot = Join-Path $T 'ev'; $GoLedger = Join-Path $EvRoot 'h5url-goref-ledger.txt'
$Rel = Join-Path $T 'rel'; $Repo = Join-Path $T 'repo'; $Api = 'http://127.0.0.1:1/api'; $ExpBaseUrl = 'https://example.invalid'
$EnvFile = Join-Path $T 'fake.env'
[IO.File]::WriteAllText($EnvFile, "DATABASE_URL=postgresql://test-only:test-only@127.0.0.1:1/not_a_db`nPUBLIC_INTAKE_BASE_URL=https://example.invalid`n")
$script:LastNodeRc = $null
$marker = Join-Path $T 'node-calls.txt'
[IO.File]::WriteAllText((Join-Path $Sc 'h5-url-live-run.js'), @'
const fs = require('fs');
fs.appendFileSync(process.env.H5STUB_MARKER, JSON.stringify({ mode: process.env.H5U_MODE || null, db: !!process.env.AH_DATABASE_URL,
  go: !!process.env.H5U_LIVE_GO_REF, receipt: !!process.env.H5U_RECEIPT }) + '\n');
if (process.env.H5STUB_WRITE_EVID === '1') fs.writeFileSync(process.env.H5U_EVID_FILE, '{}');
process.exit(Number(process.env.H5STUB_RC || 0));
'@)
$bogusNode = Join-Path $T 'bogus\node.exe'; [IO.File]::WriteAllText($bogusNode, 'bu dosya bir çalıştırılabilir dosya DEĞİLDİR')
$goneNode  = Join-Path $T 'gone\node.exe'
[IO.File]::WriteAllText((Join-Path $T 'badcmd\node.cmd'), "@echo merhaba`r`n@exit /b 0`r`n")
$env:H5STUB_MARKER = $marker

# ---- test yardımcıları
$rows = New-Object System.Collections.Generic.List[object]
function Check([string]$id, [string]$desc, [bool]$ok, [string]$obs) { $rows.Add([pscustomobject]@{ id = $id; sonuc = $(if ($ok) { 'PASS' } else { 'FAIL' }); aciklama = $desc; gozlem = $obs }) }
$script:goN = 10
function Read-GoRef { $script:goN++; return ('OWNER-GO-CLIENT-H5URL-20260927-R{0:D2}' -f $script:goN) }   # test GO'su (her Run'da yeni)
function Invoke-RepoGit { $global:LASTEXITCODE = 1 }                                                  # git grep: bulunmadı
$script:CmdExe = Join-Path $env:SystemRoot 'System32\cmd.exe'   # PATH daraltılan testlerde de bulunur
function Set-PriorZero { & $script:CmdExe /c 'exit 0'; if ($global:LASTEXITCODE -ne 0) { throw 'önceki kod 0 yapılamadı' } }
# Run akışında node'dan önceki son yerli komut git grep'tir (kod 1). "Önceki kod 0" koşulunu node çağrısı ANINDA
# kurmak için gerçek Set-RunEnv sarmalanır: gerçek gövde koşar, ardından LASTEXITCODE=0 yapılır ve ölçülür.
$script:RealSetRunEnv = ${function:Set-RunEnv}
$script:PriorAtNode = $null
function Set-RunEnv { & $script:RealSetRunEnv @args; Set-PriorZero; $script:PriorAtNode = $global:LASTEXITCODE }
function Node-Calls { @(if (Test-Path -LiteralPath $marker) { Get-Content -LiteralPath $marker }) }
function Invoke-Mode([string]$mode, [string]$nodeExe, [int]$stubRc, [bool]$writeEvid, [string]$receipt = '') {
  $env:H5STUB_RC = [string]$stubRc; $env:H5STUB_WRITE_EVID = $(if ($writeEvid) { '1' } else { '0' })
  $g = [ordered]@{ head = 'test'; pkg = 'test'; dist = 'test'; envSha = 'test'; apiPid = 0; baseHost = 'example.invalid'
                   caddyLoopback = $false; cloudflaredRunning = $false; nodeExe = $nodeExe; nodeVersion = 'test' }
  $before = (Node-Calls).Count; $script:LastNodeRc = $null; $script:PriorAtNode = $null
  Set-PriorZero
  $threw = $null; $out = $null
  try { if ($mode -eq 'Run') { $out = Invoke-RunMode $g } else { $out = Invoke-RecoverMode $g $receipt } } catch { $threw = $_.Exception.Message }
  $calls = @(Node-Calls)
  return @{ out = $out; count = @($out).Count; threw = $threw; prior = $script:PriorAtNode; nodeCalls = $calls.Count - $before; last = $(if ($calls.Count -gt $before) { $calls[-1] | ConvertFrom-Json } else { $null })
            secretsLeft = @($SecretEnv | Where-Object { Test-Path "Env:$_" }).Count }
}
function Last-EvDir { Get-ChildItem -LiteralPath $EvRoot -Directory | Sort-Object LastWriteTimeUtc | Select-Object -Last 1 }
function Consumed-Rc { $d = Last-EvDir; (Get-Content -Raw -LiteralPath (Join-Path $d.FullName 'goref-consumed.json') | ConvertFrom-Json).exitCode }
$ps = "PS $($PSVersionTable.PSVersion) ($($PSVersionTable.PSEdition))"

try {
  # ---- NODE DOĞRULAMA (gerçek Resolve-NodeExe)
  $real = Resolve-NodeExe
  Check 'N-1' 'Resolve-NodeExe: PATH''teki gerçek node çözülür ve --version geçer' ((Test-Path -LiteralPath $real.Exe -PathType Leaf) -and $real.Version -match '^v\d+\.\d+\.\d+$') "exe=$($real.Exe) · $($real.Version)"
  $savedPath = $env:PATH
  try {
    $env:PATH = Join-Path $T 'bogus'; Set-PriorZero; $m = $null; try { $null = Resolve-NodeExe } catch { $m = $_.Exception.Message }
    Check 'N-2' 'PATH''te BAŞLATILAMAYAN node varken (önceki kod 0) Resolve-NodeExe DURUR' ($m -like 'H5URL-DUR:*' -and $m -match 'node') "mesaj=$m"
    $env:PATH = Join-Path $T 'badcmd'; Set-PriorZero; $m = $null; try { $null = Resolve-NodeExe } catch { $m = $_.Exception.Message }
    Check 'N-3' 'node --version beklenmeyen çıktı verirse (0 dönse de) DURUR' ($m -like 'H5URL-DUR:*' -and $m -match 'version') "mesaj=$m"
    $env:PATH = Join-Path $T 'empty'; $m = $null; try { $null = Resolve-NodeExe } catch { $m = $_.Exception.Message }
    Check 'N-4' 'PATH''te node yoksa DURUR' ($m -like 'H5URL-DUR:*') "mesaj=$m"
  } finally { $env:PATH = $savedPath }

  # ---- RUN yolu (gerçek Invoke-RunMode)
  $r = Invoke-Mode 'Run' $real.Exe 0 $true
  Check 'R-1' 'Run: gerçek node 0 + kanıt → 0; tek değer döner; node run modunda ve gizli ortamla koştu; ortam temizlendi' ($r.out -eq 0 -and $r.count -eq 1 -and $r.nodeCalls -eq 1 -and $r.last.mode -eq 'run' -and $r.last.db -and $r.last.go -and $r.secretsLeft -eq 0 -and (Consumed-Rc) -eq 0) "rc=$($r.out) · değer sayısı=$($r.count) · node=$($r.nodeCalls) · kalan gizli=$($r.secretsLeft)"
  foreach ($c in 2, 3, 5, 6) {
    $r = Invoke-Mode 'Run' $real.Exe $c $true
    Check "R-2.$c" "Run: node $c → $c DEĞİŞMEDEN taşınır (tek node çağrısı, otomatik tekrar yok)" ($r.out -eq $c -and $r.count -eq 1 -and $r.nodeCalls -eq 1 -and (Consumed-Rc) -eq $c) "rc=$($r.out) · node=$($r.nodeCalls)"
  }
  $r = Invoke-Mode 'Run' $real.Exe 0 $false
  Check 'R-3' 'Run: node 0 ama sonuç kanıtı YOK → 7' ($r.out -eq 7 -and (Consumed-Rc) -eq 7) "rc=$($r.out)"
  $r = Invoke-Mode 'Run' $bogusNode 0 $true
  Check 'R-4' 'Run: önceki LASTEXITCODE=0 iken node BAŞLATILAMAZ (geçersiz çalıştırılabilir) → 91, 0 DEĞİL; tüketim kaydı 91; ortam temiz' ($r.out -eq 91 -and $r.count -eq 1 -and $r.nodeCalls -eq 0 -and (Consumed-Rc) -eq 91 -and $r.secretsLeft -eq 0 -and $r.prior -eq 0) "rc=$($r.out) · node anında önceki kod=$($r.prior) · node=$($r.nodeCalls) · tüketim=$(Consumed-Rc) · kalan gizli=$($r.secretsLeft)"
  $r = Invoke-Mode 'Run' $goneNode 0 $true
  Check 'R-5' 'Run: önceki LASTEXITCODE=0 iken node dosyası YOK (doğrulamadan sonra silinmiş) → 91' ($r.out -eq 91 -and $r.nodeCalls -eq 0 -and (Consumed-Rc) -eq 91 -and $r.prior -eq 0) "rc=$($r.out) · node anında önceki kod=$($r.prior)"
  # GO tekrar kullanımı: aynı GO ile ikinci Run node'u HİÇ çağırmaz
  $script:goN = 10; $r = Invoke-Mode 'Run' $real.Exe 0 $true
  Check 'R-6' 'Run: aynı GO ref ikinci kez → DUR (defter), node çağrılmaz' ($r.threw -like 'H5URL-DUR:*' -and $r.threw -match 'KULLANILDI' -and $r.nodeCalls -eq 0) "mesaj=$($r.threw)"

  # R-7: `node` adı bir fonksiyon/alias gölgesine çözülürse (profil sarmalayıcısı vb.) o komut LASTEXITCODE'u HİÇ
  # yazmaz; ada göre çağıran eski kod önceki 0'ı başarı sayar. Yeni kod node'u DOSYA YOLUYLA çağırır.
  # Gölge fonksiyon yalnız bu alt kapsamda tanımlıdır (dinamik kapsam: çağrılan fonksiyonlar görür, sonra yok olur).
  $script:goN = 50   # R-6 sayacı geri aldı; kullanılmamış GO aralığına geç
  $r = & { function node { }; Invoke-Mode 'Run' $real.Exe 0 $true }
  Check 'R-7' 'Run: `node` adında fonksiyon gölgesi varken (önceki kod 0) gerçek node dosya yoluyla KOŞAR (node çağrısı 1)' ($r.out -eq 0 -and $r.nodeCalls -eq 1 -and $r.prior -eq 0) "rc=$($r.out) · node=$($r.nodeCalls) · node anında önceki kod=$($r.prior) · istisna=$($r.threw)"

  # ---- RECOVER yolu (gerçek Invoke-RecoverMode)
  $rd = Join-Path $EvRoot 'recover-case'; New-Item -ItemType Directory -Path $rd | Out-Null
  $rcpt = Join-Path $rd 'h5url-setup-receipt.json'
  '{"record":"H5-URL-SETUP-RECEIPT","runId":"0123abcd","tenantId":"t","tenantSlug":"ah-0123abcd","caseId":"c","clientId":"k","elevUserId":"u","elevEmail":"e@example.invalid"}' | Set-Content -LiteralPath $rcpt -Encoding ASCII
  $r = Invoke-Mode 'Recover' $real.Exe 0 $true $rcpt
  Check 'V-1' 'Recover: gerçek node 0 + kanıt → 0; node recover modunda + makbuzla koştu; ortam temiz' ($r.out -eq 0 -and $r.count -eq 1 -and $r.nodeCalls -eq 1 -and $r.last.mode -eq 'recover' -and $r.last.receipt -and $r.secretsLeft -eq 0) "rc=$($r.out) · node=$($r.nodeCalls)"
  $r = Invoke-Mode 'Recover' $real.Exe 6 $true $rcpt
  Check 'V-2' 'Recover: node 6 → 6 değişmeden (otomatik tekrar yok)' ($r.out -eq 6 -and $r.nodeCalls -eq 1) "rc=$($r.out) · node=$($r.nodeCalls)"
  $r = Invoke-Mode 'Recover' $real.Exe 0 $false $rcpt
  Check 'V-3' 'Recover: node 0 ama sonuç kanıtı YOK → 7' ($r.out -eq 7) "rc=$($r.out)"
  $r = Invoke-Mode 'Recover' $bogusNode 0 $true $rcpt
  Check 'V-4' 'Recover: önceki LASTEXITCODE=0 iken node BAŞLATILAMAZ → 91, 0 DEĞİL; ortam temiz' ($r.out -eq 91 -and $r.count -eq 1 -and $r.nodeCalls -eq 0 -and $r.secretsLeft -eq 0 -and $r.prior -eq 0) "rc=$($r.out) · node anında önceki kod=$($r.prior) · kalan gizli=$($r.secretsLeft)"
  $r = Invoke-Mode 'Recover' $goneNode 0 $true $rcpt
  Check 'V-5' 'Recover: önceki LASTEXITCODE=0 iken node dosyası YOK → 91' ($r.out -eq 91 -and $r.nodeCalls -eq 0 -and $r.prior -eq 0) "rc=$($r.out) · node anında önceki kod=$($r.prior)"

  # ---- Invoke-Node doğrudan: Int32 olmayan / sentinel kalan kod
  $script:LastNodeRc = $null; Set-PriorZero
  $x = $null; try { $x = Invoke-Node $bogusNode (Join-Path $T 'direct.log') } catch { $x = 'İSTİSNA: ' + $_.Exception.GetType().Name }
  Check 'I-1' 'Invoke-Node: başlatma hatasında LastNodeRc da 91 (akışın catch bloğu 0 görmez)' ($x -eq 91 -and $script:LastNodeRc -eq 91) "dönen=$x · LastNodeRc=$($script:LastNodeRc)"
  Check 'I-2' 'Complete-NodeRc: Int32 olmayan değer → 91' ((Complete-NodeRc '0' (Join-Path $T 'yok.json')) -eq 91) 'metin 0'

  $stale = Join-Path $T 'stale-evidence.json'; '{}' | Set-Content -LiteralPath $stale -Encoding ASCII
  $m = $null; try { Assert-FreshEvidence $stale } catch { $m = $_.Exception.Message }
  $m2 = 'yok'; try { Assert-FreshEvidence (Join-Path $T 'fresh.json'); $m2 = $null } catch { $m2 = $_.Exception.Message }
  Check 'I-3' 'Assert-FreshEvidence: koşumdan önce var olan kanıt dosyası → DUR (eski dosya yeni kanıt sayılmaz); yoksa geçer' ($m -like 'H5URL-DUR:*' -and $null -eq $m2) "var=$m · yok=$m2"
  $sp = ($funcs | Where-Object { $_.Name -in 'Invoke-RunMode', 'Invoke-RecoverMode' } | ForEach-Object { $_.Extent.Text }) -join "`n"
  Check 'I-4' 'Run ve Recover node''dan ÖNCE Assert-FreshEvidence çağırır' (([regex]::Matches($sp, 'Assert-FreshEvidence \$evid\s+\$rc = Invoke-Node')).Count -eq 2) 'iki akış'
  # ---- statik: akış ve güvenlik satırları
  $src = [IO.File]::ReadAllText($wrapper)
  $inv = $funcs | Where-Object { $_.Name -eq 'Invoke-Node' } | Select-Object -First 1
  $body = $inv.Extent.Text
  $iS = $body.IndexOf('$global:LASTEXITCODE = -999'); $iC = $body.IndexOf('& $exe'); $iR = $body.IndexOf('$rc = $global:LASTEXITCODE')
  Check 'S-1' 'Invoke-Node: sentinel çağrıdan ÖNCE, yakalama çağrıdan HEMEN SONRA' ($iS -ge 0 -and $iS -lt $iC -and $iC -lt $iR) "sentinel@$iS çağrı@$iC yakalama@$iR"
  Check 'S-2' 'akış node''u yalnız Invoke-Node ile çağırır (başka `& node` yok)' (-not ($src -match '&\s+node\b')) 'doğrudan & node yok'
  Check 'S-3' 'PS 7 için $PSNativeCommandUseErrorActionPreference = $false betik başında' ($src -match '(?m)^\$PSNativeCommandUseErrorActionPreference = \$false') 'var'
  Check 'S-4' 'kapılar node''u doğrular (Invoke-ReadOnlyGates → Resolve-NodeExe)' ((($funcs | Where-Object { $_.Name -eq 'Invoke-ReadOnlyGates' }).Extent.Text) -match 'Resolve-NodeExe') 'var'
}
finally {
  foreach ($k in 'H5STUB_RC', 'H5STUB_WRITE_EVID', 'H5STUB_MARKER') { Remove-Item "Env:$k" -ErrorAction SilentlyContinue }
  Clear-SecretEnv
}

$rows | Format-Table -AutoSize -Wrap | Out-String -Width 240 | Write-Host
$fail = @($rows | Where-Object { $_.sonuc -eq 'FAIL' }).Count
Write-Host ("OWNER BLOĞU ÖZ-TESTİ [{0}]: PASS {1} / {2}" -f $ps, ($rows.Count - $fail), $rows.Count)
Write-Host "  geçici dizin: $T  (canlı kapılar, canlı .env, canlı DB ve GO KULLANILMADI)"
if ($fail -gt 0) { exit 1 }
exit 0
