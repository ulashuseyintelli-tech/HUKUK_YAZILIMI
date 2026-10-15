# CLIENT DD (K) R01 — OWNER BLOĞU ÖZ-TESTİ. Canlı veritabanına, canlı .env'e ve canlı günlüğe DOKUNMAZ; gerçek koşucu ÇAĞRILMAZ.
# Blok nokta kaynağıyla yüklenir (ana akış çalışmaz); kapıların okuduğu bütün yollar geçici sahte dosyalara çevrilir; git çağrısı sahtedir.
# B16 / B18'de bloğun GERÇEK Invoke-Node işlevi, geçici dizindeki SAHTE koşucuyu (ddk-setup-run.js adında; veritabanına bağlanmaz) çalıştırır.
#
# B1 paket pinleri bloktaki değerle depodaki dosyalardan yeniden hesaplanan değer AYNI (statik)
# B2 bütün kapılar sahte doğru girdilerle geçer ve paket özetini döndürür (kontrol)
# B3 .env pini uyuşmazlığı → DUR · B4 başlatıcı günlüğünde DB kimliği beklenmeyen → DUR · B5 DATABASE_URL başka kimlik → DUR
# B6 paket dosyası pini uyuşmazlığı → DUR · B7 main origin/main ile senkron değil → DUR · B8 takipli kirli dosya → DUR
# B9 canlı yazım onayı "EVET" dışında → DUR · B10 GO biçimi bozuk → DUR · B11 GO tek kullanım; defterde GO literali YOK, özeti VAR
# B12 Kur / Kapat bloğun ilk adımı kapı: kapı DUR'unda koşucu çağrılmaz (blok çıkışı 90)
# B13 GO küçük harfle → DUR (biçim) · B14 GO literali depoda geçiyor → DUR; git grep çıkışı belirsiz → DUR
# B15 Kapat makbuz yolu: kanıt kökü dışında → DUR; dizin adındaki runId makbuzdakiyle farklı → DUR; doğru yol → kabul
# B16 Kur uçtan uca (sahte koşucu): sıra E/H → EVET → GO → koşucu → Enter; koşucuya DDK_DISPLAY=conout + parola ortamı; blok çıktısında,
#     kanıt dizininde ve defterde parola / GO literali YOK; owner-block.json + goref-consumed.json + manifest VAR; sır ortamı temizlendi
# B17 transkripsiyon ilkesi açık → DUR; Kur'da koşucu çağrılmaz (90) · B18 koşucu çalıştıktan SONRA blok hatası → koşucunun çıkış kodu (90 DEĞİL)
# B19 bağımsız pencere teyidi 'E' dışında (H) → DUR; GO sorulmaz, koşucu çağrılmaz (90)
# B20 koşucu çıkış 8 (giriş bilgisi çizilemedi) → ekran temizlenir + pencereyi kapatma uyarısı; blok çıkışı 8
param()
$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$block = Join-Path $here 'ddk-owner-block.ps1'
. $block   # ana akış ÇALIŞMAZ (InvocationName '.')

$results = [System.Collections.Generic.List[object]]::new()
function T([string]$id, [string]$ad, [bool]$ok) { $results.Add([pscustomobject]@{ id = $id; ok = $ok }); Write-Host ("{0}  [{1}] {2}" -f $(if ($ok) { 'PASS' } else { 'FAIL' }), $id, $ad) }
function Expect-Dur([scriptblock]$sb, [string]$pattern) {
  try { & $sb | Out-Null; return $false } catch { return ("$_" -match '^CLIENT-DDK-DUR:' -and "$_" -match $pattern) }
}
function Invoke-MainCaptured { $all = @(Invoke-Main 6>&1); [pscustomobject]@{ code = ($all | Where-Object { $_ -is [int] } | Select-Object -Last 1); text = (($all | ForEach-Object { "$_" }) -join "`n") } }

# Blok depo yollarını kanonik checkout'a göre tutar; öz-test kendi bulunduğu depo ağacındaki governance dizinini kullanır.
$Gov = (Resolve-Path -LiteralPath (Join-Path $here '..\..')).Path
# ---- B1 (statik): bloktaki pinler depodaki dosyalarla aynı ----
$pinOk = $true; $pk = [System.Collections.Generic.List[string]]::new()
foreach ($f in $PkgPins.Keys) {
  $p = Join-Path $Gov $f
  if (-not (Test-Path -LiteralPath $p)) { $pinOk = $false; continue }
  $h = Sha $p; if ($h -ne $PkgPins[$f]) { $pinOk = $false }
  $pk.Add(($f -replace '\\', '/') + [char]0 + $h + "`n")
}
T 'B1' 'paket pinleri + paket özeti depodaki dosyalarla AYNI' ($pinOk -and $PkgPins.Count -eq 6 -and (Digest $pk) -eq $ExpPackage)

# ---- sahte ortam ----
$tmp = Join-Path ([IO.Path]::GetTempPath()) ("ddk-block-selftest-" + [guid]::NewGuid().ToString('N').Substring(0, 8))
New-Item -ItemType Directory -Path $tmp | Out-Null
$EnvFile = Join-Path $tmp '.env'; $Launcher = Join-Path $tmp 'launcher.log'; $EvRoot = Join-Path $tmp 'kanit'; $GoLedger = Join-Path $EvRoot 'ledger.txt'
function Reset-Fakes {
  Set-Content -LiteralPath $EnvFile -Value "DATABASE_URL=postgresql://sahte:sahte@127.0.0.1:5432/hukuk_db`nX=1" -Encoding ASCII
  Set-Content -LiteralPath $Launcher -Value '2026-10-15 db identity ok host=127.0.0.1 port=5432 db=hukuk_db' -Encoding ASCII
  $script:ExpEnvSha = Sha $EnvFile
  $script:FakeHead = 'a' * 40; $script:FakeOrig = 'a' * 40; $script:FakeDirty = ''; $script:FakeGrepRc = 1
}
function Invoke-RepoGit {
  if ($args[0] -eq 'fetch') { return }
  if ($args[0] -eq 'rev-parse' -and $args[1] -eq 'HEAD') { return $script:FakeHead }
  if ($args[0] -eq 'rev-parse' -and $args[1] -eq 'origin/main') { return $script:FakeOrig }
  if ($args[0] -eq 'status') { return $script:FakeDirty }
  if ($args[0] -eq 'grep') { $global:LASTEXITCODE = $script:FakeGrepRc; return }
}
function Resolve-NodeExe { return 'sahte-node.exe' }
$realInvokeNode = ${function:Invoke-Node}
$script:NodeCalls = 0
function Invoke-Node { $script:NodeCalls++; return 0 }
function Get-CimInstance { return @() }   # başka kabul süreci yok
$realFlagsSrc = ${function:Get-TranscriptionFlags}.ToString()
function Get-TranscriptionFlags { return ,@() }
function Assert-LocalConsole { }          # öz-test çıktısı yönlendirilmiş koşar; konsol kapısı ayrı (aşağıda bilgi)

Reset-Fakes
$g2 = $null; $b2 = $false; try { $g2 = Invoke-ReadOnlyGates; $b2 = ($g2.pkg -eq $ExpPackage -and $g2.envSha -eq $ExpEnvSha -and $g2.head -eq $script:FakeHead) } catch { $b2 = $false }
T 'B2' 'kapılar sahte doğru girdilerle geçer ve paket özeti / .env pini / main döner (kontrol)' $b2
Reset-Fakes; Add-Content -LiteralPath $EnvFile -Value 'Y=2'
T 'B3' '.env pini uyuşmazlığı → DUR' (Expect-Dur { Invoke-ReadOnlyGates } 'CANLI \.env pini')
Reset-Fakes; Set-Content -LiteralPath $Launcher -Value 'db identity ok host=127.0.0.1 port=5433 db=hukuk_db' -Encoding ASCII
T 'B4' 'başlatıcı günlüğünde DB kimliği beklenmeyen → DUR' (Expect-Dur { Invoke-ReadOnlyGates } 'DB kimliği beklenmedik')
Reset-Fakes; Set-Content -LiteralPath $EnvFile -Value "DATABASE_URL=postgresql://sahte:sahte@127.0.0.1:5432/baska_db" -Encoding ASCII; $script:ExpEnvSha = Sha $EnvFile
T 'B5' 'DATABASE_URL başka kimlik → DUR' (Expect-Dur { Invoke-ReadOnlyGates } 'DATABASE_URL kimliği')
Reset-Fakes; $saved = $PkgPins['client-acceptance-harness-r01\scripts\ah-lib.js']; $PkgPins['client-acceptance-harness-r01\scripts\ah-lib.js'] = 'F' * 64
T 'B6' 'paket dosyası pini uyuşmazlığı → DUR' (Expect-Dur { Invoke-ReadOnlyGates } 'DOSYA PİNİ')
$PkgPins['client-acceptance-harness-r01\scripts\ah-lib.js'] = $saved
Reset-Fakes; $script:FakeOrig = 'b' * 40
T 'B7' 'main origin/main ile senkron değil → DUR' (Expect-Dur { Invoke-ReadOnlyGates } 'SENKRON')
Reset-Fakes; $script:FakeDirty = ' M x'
T 'B8' 'takipli kirli dosya → DUR' (Expect-Dur { Invoke-ReadOnlyGates } 'KİRLİ')

Reset-Fakes
function Read-Answer { return 'evet' }
T 'B9' 'canlı yazım onayı "EVET" dışında (evet) → DUR' (Expect-Dur { Confirm-LiveWrites 'Kur' } 'onayı verilmedi')
function Read-GoRef { return 'OWNER-GO-CLIENT-DDK-2026-R1' }
T 'B10' 'GO biçimi bozuk → DUR' (Expect-Dur { Read-CheckedGoRef } 'biçimi geçersiz')
$good = 'OWNER-GO-CLIENT-DDK-20261015-R01'
function Read-GoRef { return $good }
$first = $false; try { $gr = Read-CheckedGoRef; Add-GoLedger $gr.sha 'kur runId=00000000'; $first = ($gr.go -ceq $good) } catch { $first = $false }
$second = Expect-Dur { Read-CheckedGoRef } 'KULLANILDI'
$ledger = Get-Content -LiteralPath $GoLedger -Raw
T 'B11' 'GO tek kullanım; defterde GO literali YOK, özeti VAR' ($first -and $second -and -not $ledger.Contains($good) -and $ledger.Contains((ShaText $good)))

Reset-Fakes; $script:NodeCalls = 0; $script:FakeOrig = 'b' * 40
$Mode = 'Kur'; $c1 = Invoke-Main
$Mode = 'Kapat'; $ReceiptFile = (Join-Path $tmp 'yok.json'); $c2 = Invoke-Main
T 'B12' 'kapı DUR''unda Kur / Kapat koşucuyu ÇAĞIRMAZ (blok çıkışı 90)' ($c1 -eq 90 -and $c2 -eq 90 -and $script:NodeCalls -eq 0)

Reset-Fakes
# Yalnız sondaki 'r' küçük: tr-TR kültüründe büyük / küçük harfe duyarsız eşleşme 'I' ile 'i'yi eşlemez; 'client' küçük yazılırsa iki sürüm ayrılamaz.
function Read-GoRef { return 'OWNER-GO-CLIENT-DDK-20261015-r02' }
T 'B13' 'GO son ek küçük harfle (-r02) → DUR (biçim; büyük / küçük harf duyarlı)' (Expect-Dur { Read-CheckedGoRef } 'biçimi geçersiz')
function Read-GoRef { return 'OWNER-GO-CLIENT-DDK-20261015-R03' }
$script:FakeGrepRc = 0; $g14a = Expect-Dur { Read-CheckedGoRef } 'depoda geçiyor'
$script:FakeGrepRc = 2; $g14b = Expect-Dur { Read-CheckedGoRef } 'tüketim kontrolü yapılamadı'
T 'B14' 'GO literali depoda geçiyor → DUR; git grep çıkışı belirsiz → DUR' ($g14a -and $g14b)

Reset-Fakes
$okDir = Join-Path $EvRoot 'client-ddk-kur-0a1b2c3d-20261015T010203Z'; New-Item -ItemType Directory -Path $okDir -Force | Out-Null
$okRc = Join-Path $okDir 'ddk-setup-receipt.json'; Set-Content -LiteralPath $okRc -Value '{"record":"CLIENT-DDK-SETUP-RECEIPT","runId":"0a1b2c3d"}' -Encoding UTF8
$outDir = Join-Path $tmp 'baska'; New-Item -ItemType Directory -Path $outDir -Force | Out-Null
$outRc = Join-Path $outDir 'ddk-setup-receipt.json'; Copy-Item -LiteralPath $okRc -Destination $outRc
$misDir = Join-Path $EvRoot 'client-ddk-kur-ffffffff-20261015T010203Z'; New-Item -ItemType Directory -Path $misDir -Force | Out-Null
$misRc = Join-Path $misDir 'ddk-setup-receipt.json'; Copy-Item -LiteralPath $okRc -Destination $misRc
$r15 = $null; try { $r15 = Resolve-ReceiptRoute $okRc } catch { $r15 = $null }
T 'B15' 'Kapat makbuz yolu: kanıt kökü dışı → DUR · runId uyuşmazlığı → DUR · doğru yol → kabul' (
  (Expect-Dur { Resolve-ReceiptRoute $outRc } 'Kur kanıt dizininde değil') -and (Expect-Dur { Resolve-ReceiptRoute $misRc } 'runId kanıt dizini adındaki') -and $r15 -and $r15.runId -eq '0a1b2c3d')

# ---- B16 / B17 / B18: gerçek Invoke-Node + sahte koşucu ----
Set-Item -Path function:Invoke-Node -Value $realInvokeNode
$nodeReal = @(Get-Command -Name 'node' -CommandType Application -ErrorAction SilentlyContinue)
$fakeSc = Join-Path $tmp 'sc'; New-Item -ItemType Directory -Path $fakeSc | Out-Null
$calls = Join-Path $tmp 'calls.jsonl'; $rcFile = Join-Path $tmp 'fake-rc.txt'
$fakeJs = @'
const fs = require('fs'); const path = require('path');
const e = process.env; const pw = e.DDK_LOGIN_PW || '';
fs.appendFileSync(path.join(__dirname, '..', 'calls.jsonl'), JSON.stringify({ mode: e.DDK_MODE, display: e.DDK_DISPLAY, pwLen: pw.length, goSet: !!e.DDK_LIVE_GO_REF,
  confirm: e.DDK_LIVE_CONFIRM, expectDb: e.DDK_EXPECT_DB, receiptDir: path.basename(path.dirname(e.DDK_RECEIPT || '')) }) + '\n');
fs.appendFileSync(path.join(__dirname, '..', 'pw-seen.txt'), pw + '\n');
process.exitCode = Number(fs.readFileSync(path.join(__dirname, '..', 'fake-rc.txt'), 'utf8'));
'@
[IO.File]::WriteAllText((Join-Path $fakeSc 'ddk-setup-run.js'), $fakeJs, (New-Object Text.UTF8Encoding($false)))
$Sc = $fakeSc
function Resolve-NodeExe { return [string]$nodeReal[0].Source }
$script:Seq = [System.Collections.Generic.List[string]]::new()
$script:Answers = [System.Collections.Generic.Queue[string]]::new()
function Read-Answer([string]$q) { $script:Seq.Add('A:' + $q.Substring(0, [Math]::Min(12, $q.Length))); return $script:Answers.Dequeue() }
$go16 = 'OWNER-GO-CLIENT-DDK-20261015-R04'
function Read-GoRef { $script:Seq.Add('GO'); return $go16 }
function Clear-OwnerScreen { $script:Seq.Add('CLEAR') }

Reset-Fakes
foreach ($a in 'E', 'EVET', '') { $script:Answers.Enqueue($a) }
Set-Content -LiteralPath $rcFile -Value '0' -Encoding ASCII -NoNewline
$Mode = 'Kur'; $m16 = Invoke-MainCaptured
$call = $null; if (Test-Path -LiteralPath $calls) { $call = (Get-Content -LiteralPath $calls | Select-Object -Last 1) | ConvertFrom-Json }
$pwSeen = ''; if (Test-Path -LiteralPath (Join-Path $tmp 'pw-seen.txt')) { $pwSeen = (Get-Content -LiteralPath (Join-Path $tmp 'pw-seen.txt') | Select-Object -Last 1) }
$ev16 = @(Get-ChildItem -LiteralPath $EvRoot -Directory -Filter 'client-ddk-kur-*' | Where-Object { $_.Name -notmatch '0a1b2c3d|ffffffff' })
$ev16Files = if ($ev16.Count -eq 1) { @(Get-ChildItem -LiteralPath $ev16[0].FullName -File | ForEach-Object Name) } else { @() }
$ev16Text = if ($ev16.Count -eq 1) { (@(Get-ChildItem -LiteralPath $ev16[0].FullName -File | ForEach-Object { [IO.File]::ReadAllText($_.FullName) }) -join "`n") } else { '' }
$ledger16 = Get-Content -LiteralPath $GoLedger -Raw
$seq16 = ($script:Seq -join ' > ')
$envLeft = @($SecretEnv | Where-Object { Test-Path "Env:$_" }).Count
$b16 = ($m16.code -eq 0 -and $call -and $call.mode -eq 'kur' -and $call.display -eq 'conout' -and $call.pwLen -ge 20 -and $call.goSet -and $call.confirm -eq '1' -and $call.expectDb -eq 'hukuk_db' -and
  $pwSeen.Length -ge 20 -and -not $m16.text.Contains($pwSeen) -and -not $m16.text.Contains($go16) -and -not $ev16Text.Contains($pwSeen) -and -not $ev16Text.Contains($go16) -and
  -not $ledger16.Contains($go16) -and $ledger16.Contains((ShaText $go16)) -and $ev16Text.Contains((ShaText $go16)) -and
  ($ev16Files -contains 'owner-block.json') -and ($ev16Files -contains 'goref-consumed.json') -and ($ev16Files -contains 'SHA256-MANIFEST.txt') -and ($ev16Files -contains 'ddk-kur.log') -and
  $call.receiptDir -eq $ev16[0].Name -and $seq16 -eq 'A:Bu pencere u > A:Onaylıyorsan > GO > A:Giriş bilgis > CLEAR' -and $envLeft -eq 0)
T 'B16' 'Kur uçtan uca: sıra E/H → EVET → GO → koşucu → Enter → temizle; conout + parola ortamı; çıktı / kanıt / defterde parola ve GO literali YOK; kayıtlar + manifest VAR; sır ortamı temizlendi' $b16
if (-not $b16) { Write-Host ("  ayrıntı: code=$($m16.code) seq=[$seq16] files=[$($ev16Files -join ',')] call=$($call | ConvertTo-Json -Compress) envLeft=$envLeft") }

Reset-Fakes
function Get-TranscriptionFlags { return ,@(1) }
$n17 = @(Get-Content -LiteralPath $calls).Count; $script:Seq.Clear()
function Read-GoRef { $script:Seq.Add('GO'); return 'OWNER-GO-CLIENT-DDK-20261015-R06' }   # TAZE GO: kapı olmasa akış koşucuya ulaşırdı
$script:Answers.Clear(); foreach ($a in 'E', 'EVET', '') { $script:Answers.Enqueue($a) }
$Mode = 'Kur'; $c17 = Invoke-Main
$keys17 = @('Microsoft\Windows\PowerShell\Transcription', 'PowerShellCore\Transcription') | Where-Object { $realFlagsSrc.Contains($_) }
T 'B17' 'transkripsiyon ilkesi açık → DUR; Kur hiçbir soru sormadan durur, koşucuyu ÇAĞIRMAZ (90); ilke okuması Windows PowerShell + PowerShell 7 anahtarlarını kapsar' ($keys17.Count -eq 2 -and (Expect-Dur { Assert-NoTranscription } 'transkripsiyon') -and $c17 -eq 90 -and @(Get-Content -LiteralPath $calls).Count -eq $n17 -and $script:Seq.Count -eq 0)
function Get-TranscriptionFlags { return ,@() }

Reset-Fakes
$n19 = @(Get-Content -LiteralPath $calls).Count; $script:Seq.Clear()
$script:Answers.Clear(); foreach ($a in 'H', 'EVET', '') { $script:Answers.Enqueue($a) }
$Mode = 'Kur'; $c19 = Invoke-Main
T 'B19' 'bağımsız pencere teyidi H → DUR; GO sorulmadı, koşucu ÇAĞRILMADI (90)' ($c19 -eq 90 -and @(Get-Content -LiteralPath $calls).Count -eq $n19 -and -not ($script:Seq -contains 'GO'))

Reset-Fakes
$script:Seq.Clear()
function Read-GoRef { $script:Seq.Add('GO'); return 'OWNER-GO-CLIENT-DDK-20261015-R07' }
$script:Answers.Clear(); foreach ($a in 'E', 'EVET') { $script:Answers.Enqueue($a) }
Set-Content -LiteralPath $rcFile -Value '8' -Encoding ASCII -NoNewline
$Mode = 'Kur'; $m20 = Invoke-MainCaptured
T 'B20' 'koşucu çıkış 8 → ekran temizlendi + pencereyi kapatma uyarısı; blok çıkışı 8' ($m20.code -eq 8 -and ($script:Seq -contains 'CLEAR') -and $m20.text.Contains('pencereyi ŞİMDİ kapatın'))

Reset-Fakes
function Read-GoRef { $script:Seq.Add('GO'); return 'OWNER-GO-CLIENT-DDK-20261015-R05' }
$script:Answers.Clear(); foreach ($a in 'E', 'EVET') { $script:Answers.Enqueue($a) }
Set-Content -LiteralPath $rcFile -Value '6' -Encoding ASCII -NoNewline
function Write-Manifest([string]$evDir) { throw 'sahte manifest hatası' }
$Mode = 'Kur'; $c18 = Invoke-Main
T 'B18' 'koşucu çalıştıktan SONRA blok hatası (manifest) → koşucunun çıkış kodu 6 döner (90 DEĞİL)' ($c18 -eq 6)

Write-Host '  bilgi: Assert-LocalConsole (konsol host''u + yönlendirilmemiş çıktı) öz-testte devre dışı; yönlendirilmiş çıktıyla ölçülemez.'
$fail = @($results | Where-Object { -not $_.ok }).Count
Write-Host ("`nOZET: {0} / {1} PASS · {2} FAIL" -f ($results.Count - $fail), $results.Count, $fail)
exit $(if ($fail) { 1 } else { 0 })
