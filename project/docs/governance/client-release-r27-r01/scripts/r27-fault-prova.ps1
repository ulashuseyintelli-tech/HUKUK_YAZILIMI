param(
  [string]$PristineDir = (Join-Path $env:LOCALAPPDATA 'Temp\r27\synthetic-backup'),
  [string]$CandApps = 'D:\Development\HUKUK_YAZILIMI\HY_WT_R27\project\apps',
  [string]$ProvaRoot = 'D:\Development\HUKUK_YAZILIMI\HY_R27_FAULT_PROVA',
  [string]$ScriptDir = '',
  [string[]]$Scenarios = @('happy-path', 'rollback-script', 'api-copy-interrupt', 'web-swap-fail', 'identity-read-error', 'identity-read-persistent', 'service-start-fail', 'restore-hash-mismatch', 'stop-fail',
                          'gate-fault-live-mode', 'gate-testroot-under-live', 'gate-sim-missing', 'gate-evidence-fallback', 'gate-rollback-backup-missing',
                          'gate-rogue-process', 'gate-rogue-viewer-only', 'gate-rogue-classifier', 'gate-rogue-wiring'))
$ErrorActionPreference = 'Stop'
# =============================================================================
# R27 HATA PROVASI HARNESS'I - CANLIYA DOKUNMAZ. Saf ASCII.
# r27-release.ps1 / r27-rollback.ps1'i -TestRoot (izole kopya + simulator) ile kosar; her senaryo icin cikis kodu, verdict,
# dosya digest'leri, simulator servis durumu ve kurtarma talimati varligini ASSERT eder.
# Pristine kaynaklar (kopyalanir, DEGISTIRILMEZ):
#   canli taban kopyasi : <PristineDir>\api-src (3867 dosya, A8B17A38), <PristineDir>\web\.next (C17E7B13), <PristineDir>\web\next.config.js
#   aday                : <CandApps>\api\dist\apps\api\src (E28A6863), <CandApps>\web\.next (B2DEE365), <CandApps>\web\next.config.js
# TestRoot = <ProvaRoot>\testroot : live\api\dist\apps\api\src, live\api\.env (SAHTE), live\web\{.next,next.config.js},
#   cand\api\dist\apps\api\src, cand\web\{.next,next.config.js}, sim\state.json, evidence\
# Her senaryo oncesi robocopy /MIR ile sifirlanir (yalniz ProvaRoot altindaki kopyalar; baska hicbir dizin silinmez).
#   Istisna: 'rollback-script' senaryosu 'happy-path'in biraktigi durumu (canli=aday + yedekleri) KULLANIR; happy-path olmadan kosulursa
#   yedekler harness'ca pristine'den kurulur.
# ISLEVSEL SENARYOLAR ve beklenen: happy-path 0/YAYIN PASS ; rollback-script 0/ROLLBACK PASS ; api-copy-interrupt 10/ROLLBACK (3-takas-api) ;
#   web-swap-fail 10/ROLLBACK (3-takas-web) ; identity-read-error 10/ROLLBACK (4-kimlik; GECICI tek seferlik istisna) ;
#   identity-read-persistent 11/ROLLBACK-DOGRULANAMADI (4-kimlik; KALICI okuma hatasi, verify OKUNAMADI, servis baslatilmaz) ;
#   service-start-fail 10/ROLLBACK (5-baslat-api) ; restore-hash-mismatch 11/ROLLBACK-DOGRULANAMADI (5-baslat-api) ;
#   stop-fail 21/DURDURMA-BASARISIZ (2-durdur-web; WEB kapanmadi -> yeniden baslatildi; dosyalara DOKUNULMADI, API durdurulmadi)
# KAPI SENARYOLARI (ucuz; TestRoot sifirlamasi yok):
#   gate-fault-live-mode        release.ps1 -Fault (TestRoot YOK) -> 20 daha ilk satirda; canli dosya/kanit dizinine DOKUNMAZ
#   gate-testroot-under-live    release/rollback -TestRoot canli kok ALTINDA -> 20 (Test-Path'ten once)
#   gate-sim-missing            release -TestRoot (bos dizin) -> 0-kapilar KAPIDA-DURDU 20 + kanit JSON TestRoot\evidence altinda
#   gate-evidence-fallback      release -TestRoot (evidence bir DOSYA) -> 20 + 'KANIT YAZILAMADI' + kanit %TEMP%\r27-evidence-fallback
#   gate-rollback-backup-missing rollback -TestRoot (sim var) + yedek dizini YOK -> SelfTest 1 ; gercek kosum 1-yedek-butunluk 20 + kanit JSON
#   gate-rogue-process          release -TestRoot + simulatore ENJEKTE sentetik surec listesi (kosucu + dogrulanmis goruntuleyici) -> AKISTAKI
#                               0-kapilar kapisi 20 KAPIDA-DURDU; kapinin KENDI hata metni; ADAY DOGRULAMA'ya gecilmez; health.rogue alan
#                               kumesi TAM ESIT; kanitta tam komut satiri/sir isareti YOK; stop/start YOK
#   gate-rogue-viewer-only      yalniz dogrulanmis goruntuleyici -> yine 20 (izleme muaf DEGIL; kapinin kendi metni) + KARSI KONTROL: eslesme
#                               yoksa kapi gecer ve akis ADAY DOGRULAMA'ya ulasir (cikis kodu tek basina kanit degildir)
#   gate-rogue-classifier       SUREC KOSMAZ: release.ps1'in desen/siniflandirma/dislama/oge-adi/kapi fonksiyonlarini AST ile yukler; desen parcalari,
#                               izleme listesi, guvenilir dizinler, uzanti/bayrak listeleri TAM ESITLIKLE sabitlenir; her parca kucuk+BUYUK harf;
#                               U+0130/U+0131/U+212A; sahte ad/yol; oge adi korumalari TEK TEK; fonksiyon ve degisken mutasyonlari
#   gate-rogue-wiring           SUREC KOSMAZ: kapi zinciri BUTUNLUGU (Get-GateIntegrity; pinle TAM ESIT) + 25 kacis biciminin her birinin olcumu
#                               degistirdigi (kopya betikte) + SelfTest/akis AST cagri konumlari; CANLI dal enjekte surec listesi saglayicisiyla
#                               kosulur (kanarya, taranan=0, saglayici istisnasi). Gercek Win32_Process okumasi burada OLCULMEZ (canli SelfTest olcer)
# YOL BUTCESI KAPISI: WinPS 5.1 Get-ChildItem/Get-FileHash MAX_PATH (260) uzerindeki yollari okuyamaz -> ProvaRoot uzunsa yedek
#   dogrulamasi 'Cannot find path' ile duser (inceleme olcumu: kok 139 kr + 123 kr goreli = 262 > 260). Harness basta olcer: kok + en
#   uzun goreli yol >= 260 ise OLCULEMEDI (3). r27-release.ps1 ayni kapiyi canli yedek koku icin 1-yedek'te kosar (health.pathBudget).
# Kanit: <ProvaRoot>\evidence\fault-prova-summary.json (son kosum) + <ProvaRoot>\evidence\run-<ts>\{fault-prova-summary.json, <senaryo>\{stdout.txt, R27-*.json, sim-state.json}}
#   Onceki kosumlarin dizinleri SILINMEZ (run-<ts> ile ayrisir). Ozet 'evidence' alani KALICI kopyayi (run-<ts>\<senaryo>\...) gosterir;
#   'evidenceTestRoot' TestRoot icindeki (sonraki senaryoda /MIR ile silinen) orijinal yoldur.
# Cikis: 0 tum senaryolar PASS ; 2 en az bir senaryo FAIL ; 3 olculemedi (pristine/aday kimligi ya da yol butcesi tutmadi) ; 1 harness hatasi
# NOT: %TEMP% icin TAM yol kullanilir (8.3 kisa yol digest'i bozar) - GetFullPath + Get-Item.FullName ile normalize edilir.
# NOT: pwsh 7'den kosarken PSModulePath temiz olmali (WinPS 5.1 cocuk surecte Get-FileHash bulunamazsa harness 1 verir; olculdu).
# =============================================================================
$Scenarios = @($Scenarios | ForEach-Object { ([string]$_) -split ',' } | ForEach-Object { $_.Trim() } | Where-Object { $_ })   # 'powershell -File' virgullu listeyi TEK dize gecirir
if ($ScriptDir -eq '') { $ScriptDir = $PSScriptRoot }
$RELEASE = Join-Path $ScriptDir 'r27-release.ps1'; $ROLLBACK = Join-Path $ScriptDir 'r27-rollback.ps1'
$EXP_LIVE = 'A8B17A38327975C71DDAE82FE33D1E97CB8B339FB1E35D1828FCF8D0CEB053A0'
$EXP_CAND = 'E28A6863CF109A1A3AE1F53E096D5F5C2037E382EF2D8D3EC87FEE3B827E5134'
$EXP_WEB_LIVE = 'C17E7B132FB7DED65AD0788024AA478F0949AF0D5D9045E8F47779A31A615326'
$EXP_WEB_CAND = 'B2DEE3652F0843FAF05085243144ED0A4146C85C2C91FBCFA94BECB1A9D9F621'
$BID_LIVE = '5waeMoFGGMTLAYmn9oJvW'; $BID_CAND = 'W2UQpBPD_fp8pq4y7aFIe'
$CFG_LIVE = 'C43DEB5A04F1529CE2D368204ED7D10B8DBC257327E0BC64A01F1D7CF3AC5B5C'
$ADDED = @('common/trust-proxy.config.d.ts', 'common/trust-proxy.config.js', 'common/trust-proxy.config.js.map', 'modules/portal/dto/portal-password.dto.d.ts', 'modules/portal/dto/portal-password.dto.js', 'modules/portal/dto/portal-password.dto.js.map')
$LIVE_ROOT_CANON = 'C:\Development\HUKUK_YAZILIMI\HY_W4_RELEASE23'
$LIVE_EVID_DIR = 'D:\Development\HUKUK_YAZILIMI\HY_R27_RELEASE_EVIDENCE'
$EXPECT = @{
  'happy-path'               = @{ exit = 0;  verdict = 'YAYIN PASS';             api = $EXP_CAND; web = $EXP_WEB_CAND; bid = $BID_CAND; addedPresent = $true;  apiUp = $true;  webUp = $true;  recovery = $false; failedAt = '' }
  'rollback-script'          = @{ exit = 0;  verdict = 'ROLLBACK PASS';          api = $EXP_LIVE; web = $EXP_WEB_LIVE; bid = $BID_LIVE; addedPresent = $false; apiUp = $true;  webUp = $true;  recovery = $false; failedAt = '' }
  'api-copy-interrupt'       = @{ exit = 10; verdict = 'ROLLBACK';               api = $EXP_LIVE; web = $EXP_WEB_LIVE; bid = $BID_LIVE; addedPresent = $false; apiUp = $true;  webUp = $true;  recovery = $false; failedAt = '3-takas-api' }
  'web-swap-fail'            = @{ exit = 10; verdict = 'ROLLBACK';               api = $EXP_LIVE; web = $EXP_WEB_LIVE; bid = $BID_LIVE; addedPresent = $false; apiUp = $true;  webUp = $true;  recovery = $false; failedAt = '3-takas-web' }
  'identity-read-error'      = @{ exit = 10; verdict = 'ROLLBACK';               api = $EXP_LIVE; web = $EXP_WEB_LIVE; bid = $BID_LIVE; addedPresent = $false; apiUp = $true;  webUp = $true;  recovery = $false; failedAt = '4-kimlik' }
  'identity-read-persistent' = @{ exit = 11; verdict = 'ROLLBACK-DOGRULANAMADI'; api = $EXP_LIVE; web = $EXP_WEB_LIVE; bid = $BID_LIVE; addedPresent = $false; apiUp = $false; webUp = $false; recovery = $true;  failedAt = '4-kimlik'; unreadable = $true }
  'service-start-fail'       = @{ exit = 10; verdict = 'ROLLBACK';               api = $EXP_LIVE; web = $EXP_WEB_LIVE; bid = $BID_LIVE; addedPresent = $false; apiUp = $true;  webUp = $true;  recovery = $false; failedAt = '5-baslat-api' }
  'restore-hash-mismatch'    = @{ exit = 11; verdict = 'ROLLBACK-DOGRULANAMADI'; api = 'NOT:' + $EXP_LIVE; web = $EXP_WEB_LIVE; bid = $BID_LIVE; addedPresent = $false; apiUp = $false; webUp = $false; recovery = $true; failedAt = '5-baslat-api' }
  'stop-fail'                = @{ exit = 21; verdict = 'DURDURMA-BASARISIZ';     api = $EXP_LIVE; web = $EXP_WEB_LIVE; bid = $BID_LIVE; addedPresent = $false; apiUp = $true;  webUp = $true;  recovery = $false; failedAt = '2-durdur-web' }
  'gate-fault-live-mode'        = @{ gate = $true }
  'gate-testroot-under-live'    = @{ gate = $true }
  'gate-sim-missing'            = @{ gate = $true }
  'gate-evidence-fallback'      = @{ gate = $true }
  'gate-rollback-backup-missing' = @{ gate = $true }
  'gate-rogue-process'          = @{ gate = $true }
  'gate-rogue-viewer-only'      = @{ gate = $true }
  'gate-rogue-classifier'       = @{ gate = $true; noProcess = $true }
  'gate-rogue-wiring'           = @{ gate = $true; noProcess = $true }
}
$PristineDir = (Get-Item -LiteralPath $PristineDir).FullName; $CandApps = (Get-Item -LiteralPath $CandApps).FullName
$ProvaRoot = [IO.Path]::GetFullPath($ProvaRoot).TrimEnd('\')
if ($ProvaRoot.StartsWith($LIVE_ROOT_CANON, [StringComparison]::OrdinalIgnoreCase)) { Write-Host 'HARNESS: ProvaRoot canli kok altinda olamaz'; exit 1 }
$RUN_TS = (Get-Date).ToUniversalTime().ToString('yyyyMMdd-HHmmss') + 'Z'
$TESTROOT = Join-Path $ProvaRoot 'testroot'
$EVID = Join-Path $ProvaRoot 'evidence'
$RUN_EVID = Join-Path $EVID ('run-' + $RUN_TS)
$GATE_ROOT = Join-Path $ProvaRoot ('gate\' + $RUN_TS)
$EMPTY = Join-Path $ProvaRoot '.empty'
New-Item -ItemType Directory -Force -Path $TESTROOT, $EVID, $RUN_EVID, $EMPTY | Out-Null
$P_API = Join-Path $PristineDir 'api-src'; $P_WEB = Join-Path $PristineDir 'web'
$C_API = Join-Path $CandApps 'api\dist\apps\api\src'; $C_WEB = Join-Path $CandApps 'web'
$T_LIVE_API_ROOT = Join-Path $TESTROOT 'live\api'; $T_LIVE = Join-Path $T_LIVE_API_ROOT 'dist\apps\api\src'
$T_LIVE_WEB = Join-Path $TESTROOT 'live\web'; $T_LIVE_NEXT = Join-Path $T_LIVE_WEB '.next'; $T_LIVE_CFG = Join-Path $T_LIVE_WEB 'next.config.js'
$T_CAND = Join-Path $TESTROOT 'cand\api\dist\apps\api\src'; $T_CAND_WEB = Join-Path $TESTROOT 'cand\web'
$T_SIM = Join-Path $TESTROOT 'sim'; $T_STATE = Join-Path $T_SIM 'state.json'; $T_EVID = Join-Path $TESTROOT 'evidence'
$TEMP_FALLBACK = Join-Path ([IO.Path]::GetFullPath($env:TEMP)) 'r27-evidence-fallback'
$hlog = New-Object System.Collections.Generic.List[string]
function Say([string]$m) { $l = ((Get-Date).ToUniversalTime().ToString('HH:mm:ss') + 'Z  ' + $m); Write-Host $l; $hlog.Add($l) }
function Sha([string]$p) { return (Get-FileHash -Algorithm SHA256 -LiteralPath $p).Hash }
function Get-Map([string]$root, [switch]$Web) {
  $m = [ordered]@{}
  foreach ($f in (Get-ChildItem -LiteralPath $root -Recurse -File -Force)) {
    $rel = ($f.FullName.Substring($root.Length).TrimStart('\', '/')) -replace '\\', '/'
    if ($Web -and ($rel.StartsWith('cache/') -or $rel -ceq 'trace')) { continue }
    $m[$rel] = (Get-FileHash -Algorithm SHA256 -LiteralPath $f.FullName).Hash
  }
  return $m
}
function Get-TreeDigest($map) {
  $sb = New-Object Text.StringBuilder
  $keys = New-Object 'System.Collections.Generic.List[string]'
  foreach ($k in $map.Keys) { $keys.Add([string]$k) }
  $keys.Sort([StringComparer]::Ordinal)
  foreach ($k in $keys) { [void]$sb.Append($k).Append("`0").Append($map[$k]).Append("`n") }
  return [BitConverter]::ToString([Security.Cryptography.SHA256]::Create().ComputeHash([Text.Encoding]::UTF8.GetBytes($sb.ToString()))).Replace('-', '')
}
function Get-MaxRelLen($map) { $m = 0; foreach ($k in $map.Keys) { if (([string]$k).Length -gt $m) { $m = ([string]$k).Length } }; return $m }
function Mirror([string]$src, [string]$dst) {
  New-Item -ItemType Directory -Force -Path $dst | Out-Null
  $global:LASTEXITCODE = 0
  & robocopy.exe $src $dst /MIR /R:0 /W:0 /NFL /NDL /NJH /NJS | Out-Null
  if ($LASTEXITCODE -ge 8) { throw ('robocopy /MIR ' + $src + ' -> ' + $dst + ' rc=' + $LASTEXITCODE) }
}
function Write-SimState([string]$path, $rogueProcs = $null) {
  $state = [ordered]@{ apiRunning = $true; webRunning = $true; apiPid = 4242; webPid = 4343; launcherTuple = 'P1-SONRASI'
    apiAction = 'C:\Ops\hukuk\bin\hukuk-task-host.exe api'; webAction = 'C:\Ops\hukuk\bin\hukuk-task-host.exe web'
    procCommandLine = 'sim node C:\Development\HUKUK_YAZILIMI\HY_W4_RELEASE23\project\apps\api\dist\apps\api\src\main.js (SIMULATOR)'
    stopCalls = 0; startCalls = 0; eventLog = '' }
  if ($null -ne $rogueProcs) { $state.rogueProcs = @($rogueProcs) }   # sentetik surec listesi (sahte-surec kapisi icin)
  New-Item -ItemType Directory -Force -Path (Split-Path $path) | Out-Null
  [IO.File]::WriteAllText($path, ($state | ConvertTo-Json -Depth 5), (New-Object Text.UTF8Encoding($false)))
}
function Reset-TestRoot([string]$scenario) {
  Say ('[' + $scenario + '] TestRoot sifirlaniyor (robocopy /MIR; yalniz ' + $TESTROOT + ' altinda)')
  Mirror $P_API $T_LIVE
  Mirror $P_WEB $T_LIVE_WEB          # .next + next.config.js ; onceki senaryonun .next.pre-*/.next.r27-* kalintilarini da temizler
  Mirror $C_API $T_CAND
  Mirror $C_WEB $T_CAND_WEB
  Mirror $EMPTY $T_EVID              # onceki senaryonun yedekleri/karantinasi (TestRoot icinde) temizlenir
  Mirror $EMPTY $T_SIM
  New-Item -ItemType Directory -Force -Path $T_LIVE_API_ROOT | Out-Null
  [IO.File]::WriteAllBytes((Join-Path $T_LIVE_API_ROOT '.env'), [Text.Encoding]::ASCII.GetBytes("R27_TESTROOT_FAKE_ENV=1`n"))
  Write-SimState $T_STATE
}
function Get-LiveDigests {
  $r = [ordered]@{}
  $r.api = Get-TreeDigest (Get-Map $T_LIVE)
  $r.web = $(if (Test-Path -LiteralPath $T_LIVE_NEXT) { Get-TreeDigest (Get-Map $T_LIVE_NEXT -Web) } else { 'YOK' })
  $r.bid = $(if (Test-Path -LiteralPath (Join-Path $T_LIVE_NEXT 'BUILD_ID')) { (Get-Content -Raw -LiteralPath (Join-Path $T_LIVE_NEXT 'BUILD_ID')).Trim() } else { 'YOK' })
  $r.cfg = Sha $T_LIVE_CFG
  $r.addedPresent = @($ADDED | Where-Object { Test-Path -LiteralPath (Join-Path $T_LIVE ($_ -replace '/', '\')) -PathType Leaf })
  return $r
}
function Run-Script([string]$file, [string[]]$argList, [string]$outFile) {
  $global:LASTEXITCODE = -999
  $psi = New-Object Diagnostics.ProcessStartInfo
  $psi.FileName = 'powershell.exe'; $psi.UseShellExecute = $false; $psi.RedirectStandardOutput = $true; $psi.RedirectStandardError = $true
  $psi.Arguments = ('-NoProfile -ExecutionPolicy Bypass -File "' + $file + '" ' + ($argList -join ' '))
  $p = [Diagnostics.Process]::Start($psi)
  $errTask = $p.StandardError.ReadToEndAsync()
  $out = $p.StandardOutput.ReadToEnd(); $p.WaitForExit(); $err = $errTask.Result
  [IO.File]::WriteAllText($outFile, $out + $(if ($err) { "`n--- STDERR ---`n" + $err } else { '' }), (New-Object Text.UTF8Encoding($false)))
  return @{ rc = $p.ExitCode; out = $out }
}
function Find-EvidencePath([string]$out) {
  $m = [regex]::Match($out, '(?m)^KANIT: (.+?\.json) sha256=([0-9A-F]{64})')
  if ($m.Success) { return @{ path = $m.Groups[1].Value; sha = $m.Groups[2].Value } }
  return $null
}
function Get-DirFileCount([string]$d) { if (Test-Path -LiteralPath $d) { return @(Get-ChildItem -LiteralPath $d -File -Force -ErrorAction SilentlyContinue).Count } else { return -1 } }
function Assert($list, [string]$name, [bool]$cond, [string]$detail) { $list.Add([ordered]@{ name = $name; ok = $cond; detail = $detail }); Say (('  ' + $(if ($cond) { 'OK  ' } else { 'FAIL' }) + ' ' + $name + ' : ' + $detail)) }
function Q([string]$s) { return ('"' + $s + '"') }
function Get-GateIntegrity([string]$file) {
  # Sahte-surec kapi zincirinin BUTUNLUK olcumu (AST; betik KOSULMAZ). Olculen: kapi fonksiyonlarinin ve ROGUE_* atamalarinin tam metni,
  # SelfTest blogu ve akisin 0-kapilar kesiti, fonksiyon tanim kumesi (yalniz ust duzey, tekil), dinamik tanim/golge kullanimi, mod
  # degiskenleri ($TEST/$TestRoot/$Fault/$SIM_STATE) envanteri, $ge atamalari ve kapi cagri konumlari. Harness bunlari pinle TAM ESIT
  # ister; bilincli degisiklik pinleri yeniler (fark incelemede gorunur). SINIR: kasitli ve bu olcumlerin disinda kalan bir duzenlemeyi
  # (ornegin baska bir canli/test ayrimi) kanitlayamaz; o sinif icin savunma yayin betiginin sha pini + incelemedir.
  $tok = $null; $perr = $null
  $ast = [System.Management.Automation.Language.Parser]::ParseFile($file, [ref]$tok, [ref]$perr)
  $sh = { param($t) return [BitConverter]::ToString([Security.Cryptography.SHA256]::Create().ComputeHash([Text.Encoding]::UTF8.GetBytes((([string]$t) -replace "`r`n", "`n")))).Replace('-', '') }
  $ord = { param($a) $l = New-Object 'System.Collections.Generic.List[string]'; foreach ($x in @($a)) { $l.Add([string]$x) }; $l.Sort([StringComparer]::Ordinal); return ,($l.ToArray()) }
  $vn = { param($v) return (([string]$v.VariablePath.UserPath) -replace '^(?i)(global|script|local|private|using|variable):', '') }   # VariablePath.UnqualifiedPath PowerShell'de genel DEGIL ($null doner)
  $r = [ordered]@{ parseErrors = [string]@($perr).Count }
  $allF = @($ast.FindAll({ param($n) $n -is [System.Management.Automation.Language.FunctionDefinitionAst] }, $true))
  $top = @($ast.EndBlock.Statements | Where-Object { $_ -is [System.Management.Automation.Language.FunctionDefinitionAst] })
  $r.functionsTotal = [string]$allF.Count; $r.functionsTop = [string]$top.Count
  $r.functionsDuplicate = ((& $ord @($allF | Group-Object Name | Where-Object { $_.Count -gt 1 } | ForEach-Object { $_.Name })) -join ',')
  $r.functionNamesSha = & $sh ((& $ord @($top | ForEach-Object { $_.Name })) -join "`n")
  foreach ($n in @('Say', 'Get-SimState', 'ConvertTo-RogueFolded', 'Get-RogueMatchInfo', 'Test-RogueMatch', 'Get-RogueClass', 'Get-RogueItemName', 'Get-RogueReport', 'Get-ProcList',
                   'Get-LiveRogueReport', 'Get-RogueCount', 'Get-RogueGateError', 'Write-RogueReport', 'Invoke-RogueGate', 'Test-RogueClassifier')) {
    $d = @($top | Where-Object { $_.Name -ceq $n }); $r[('fn:' + $n)] = $(if ($d.Count -eq 1) { & $sh $d[0].Extent.Text } else { 'ADET=' + $d.Count })
  }
  $isRogueAsg = { param($n) return ($n -is [System.Management.Automation.Language.AssignmentStatementAst] -and $n.Left -is [System.Management.Automation.Language.VariableExpressionAst] -and (& $vn $n.Left) -like 'ROGUE_*') }
  $rg = @($ast.EndBlock.Statements | Where-Object { & $isRogueAsg $_ })
  $r.rogueAssignTop = [string]$rg.Count
  $r.rogueAssignAll = [string]@($ast.FindAll({ param($n) & $isRogueAsg $n }, $true)).Count
  $r.rogueAssignSha = & $sh ((@($rg | ForEach-Object { $_.Extent.Text })) -join "`n")
  $r.selfPathAssign = ((@($rg | Where-Object { (& $vn $_.Left) -ceq 'ROGUE_SELF_PATH' } | ForEach-Object { $_.Right.Extent.Text })) -join ' | ')
  $selfIf = @($ast.EndBlock.Statements | Where-Object { $_ -is [System.Management.Automation.Language.IfStatementAst] -and $_.Clauses.Count -ge 1 -and $_.Clauses[0].Item1.Extent.Text -ceq '$SelfTest' })
  $r.selfTestBlocks = [string]$selfIf.Count
  $r.selfTestSha = $(if ($selfIf.Count -eq 1) { & $sh $selfIf[0].Extent.Text } else { 'YOK' })
  if ($selfIf.Count -eq 1) {
    $b = $selfIf[0].Clauses[0].Item2
    $r.selfFailsAssign = (@($b.FindAll({ param($n) $n -is [System.Management.Automation.Language.AssignmentStatementAst] -and $n.Left -is [System.Management.Automation.Language.VariableExpressionAst] -and (& $vn $n.Left) -ieq 'fails' }, $true) | ForEach-Object { $_.Extent.Text })) -join ' | '
    $r.selfFailsUnary = ((& $ord @($b.FindAll({ param($n) $n -is [System.Management.Automation.Language.UnaryExpressionAst] -and $n.Child -is [System.Management.Automation.Language.VariableExpressionAst] -and (& $vn $n.Child) -ieq 'fails' }, $true) | ForEach-Object { [string]$_.TokenKind } | Select-Object -Unique)) -join ',')
    $r.selfClassifierLink = [string]@($b.FindAll({ param($n) $n -is [System.Management.Automation.Language.IfStatementAst] -and $n.Clauses.Count -eq 1 -and $n.Clauses[0].Item1.Extent.Text -ceq '-not $rcOk' -and $n.Clauses[0].Item2.Extent.Text -ceq '{ $fails++ }' }, $true)).Count
    $r.selfJumps = (@($b.FindAll({ param($n) $n -is [System.Management.Automation.Language.ExitStatementAst] -or $n -is [System.Management.Automation.Language.ReturnStatementAst] -or $n -is [System.Management.Automation.Language.BreakStatementAst] -or $n -is [System.Management.Automation.Language.ContinueStatementAst] }, $true) | ForEach-Object { $_.Extent.Text })) -join ' | '
  }
  $inner = @()
  foreach ($o in @($ast.EndBlock.Statements | Where-Object { $_ -is [System.Management.Automation.Language.TryStatementAst] })) {
    $inner += @($o.Body.Statements | Where-Object { $_ -is [System.Management.Automation.Language.TryStatementAst] -and $_.Body.Statements.Count -gt 0 -and $_.Body.Statements[0].Extent.Text -ceq "Set-Stage '0-kapilar'" })
  }
  $r.flowBlocks = [string]$inner.Count
  if ($inner.Count -eq 1) {
    $st = @($inner[0].Body.Statements); $gi = -1
    for ($i = 0; $i -lt $st.Count; $i++) { if ($st[$i].Extent.Text -ceq '$ge = Invoke-RogueGate') { $gi = $i } }
    $r.flowGateIndex = [string]$gi
    $r.flowSegmentSha = $(if ($gi -ge 0 -and ($gi + 1) -lt $st.Count) { & $sh ((@($st[0..($gi + 1)] | ForEach-Object { $_.Extent.Text })) -join "`n") } else { 'YOK' })
    $r.flowAfterGate = $(if ($gi -ge 0 -and ($gi + 2) -lt $st.Count) { $st[$gi + 2].Extent.Text } else { '' })
    $pre = @(); if ($gi -gt 0) { $pre = @($st[0..($gi - 1)]) }
    $r.flowPreGateJumps = (@($pre | ForEach-Object { $_.FindAll({ param($n) $n -is [System.Management.Automation.Language.ExitStatementAst] -or $n -is [System.Management.Automation.Language.ReturnStatementAst] -or $n -is [System.Management.Automation.Language.BreakStatementAst] -or $n -is [System.Management.Automation.Language.ContinueStatementAst] }, $true) } | ForEach-Object { $_.Extent.Text })) -join ' | '
  }
  $calls = @($ast.FindAll({ param($n) $n -is [System.Management.Automation.Language.CommandAst] -and $n.GetCommandName() -eq 'Invoke-RogueGate' }, $true))
  $r.gateCallCount = [string]$calls.Count
  $sites = New-Object 'System.Collections.Generic.List[string]'
  foreach ($c in $calls) {
    $a = $c.Parent; if ($null -ne $a) { $a = $a.Parent }
    if ($a -is [System.Management.Automation.Language.AssignmentStatementAst] -and $a.Extent.Text -ceq '$ge = Invoke-RogueGate' -and $a.Parent -is [System.Management.Automation.Language.StatementBlockAst]) {
      $blk = $a.Parent; $i = $blk.Statements.IndexOf($a); $nx = $(if (($i + 1) -lt $blk.Statements.Count) { $blk.Statements[$i + 1].Extent.Text } else { '' })
      $kind = 'BILINMEYEN-BLOK'
      if ($selfIf.Count -eq 1 -and [object]::ReferenceEquals($blk, $selfIf[0].Clauses[0].Item2)) { $kind = 'selftest' }
      elseif ($inner.Count -eq 1 -and [object]::ReferenceEquals($blk, $inner[0].Body)) { $kind = 'akis' }
      $sites.Add($kind + ' -> ' + $nx)
    } else { $sites.Add('BICIM-DISI: ' + $c.Extent.Text) }
  }
  $r.gateSites = ((& $ord $sites) -join ' || ')
  $r.geAssignAll = [string]@($ast.FindAll({ param($n) $n -is [System.Management.Automation.Language.AssignmentStatementAst] -and $n.Left -is [System.Management.Automation.Language.VariableExpressionAst] -and (& $vn $n.Left) -ieq 'ge' }, $true)).Count
  $FORBID = @('Set-Alias', 'New-Alias', 'sal', 'nal', 'Set-Variable', 'sv', 'New-Variable', 'nv', 'Get-Variable', 'gv', 'Remove-Variable', 'rv', 'Clear-Variable', 'clv',
              'Invoke-Expression', 'iex', 'Import-Module', 'ipmo', 'Add-Type', 'Invoke-Command', 'icm', 'Set-Item', 'si', 'New-Module', 'nmo', 'Set-PSBreakpoint', 'Update-TypeData', 'Update-FormatData')
  $dyn = New-Object 'System.Collections.Generic.List[string]'
  foreach ($c in @($ast.FindAll({ param($n) $n -is [System.Management.Automation.Language.CommandAst] }, $true))) { $nm = $c.GetCommandName(); if ($nm -and ($FORBID -icontains $nm)) { $dyn.Add('komut:' + $nm) } }
  foreach ($s in @($ast.FindAll({ param($n) $n -is [System.Management.Automation.Language.StringConstantExpressionAst] -or $n -is [System.Management.Automation.Language.ExpandableStringExpressionAst] }, $true))) {
    if ([regex]::IsMatch([string]$s.Value, '^\s*(function|alias|variable):', 'IgnoreCase')) { $dyn.Add('surucu:' + ([string]$s.Value).Split(':')[0]) }
  }
  foreach ($t in @($ast.FindAll({ param($n) $n -is [System.Management.Automation.Language.TypeExpressionAst] -and @('scriptblock', 'System.Management.Automation.ScriptBlock', 'powershell', 'System.Management.Automation.PowerShell', 'runspacefactory') -icontains $n.TypeName.FullName }, $true))) { $dyn.Add('tur:' + $t.TypeName.FullName) }
  foreach ($v in @($ast.FindAll({ param($n) $n -is [System.Management.Automation.Language.VariableExpressionAst] -and @('ExecutionContext', 'PSBoundParameters', 'MyInvocation') -icontains (& $vn $n) }, $true))) { $dyn.Add('degisken:' + (& $vn $v)) }
  $encl0 = { param($n) $e = $n.Parent; while ($null -ne $e) { if ($e -is [System.Management.Automation.Language.FunctionDefinitionAst]) { return $e.Name }; $e = $e.Parent }; return '<ust>' }
  foreach ($v in @($ast.FindAll({ param($n) $n -is [System.Management.Automation.Language.VariableExpressionAst] -and @('PSDefaultParameterValues', 'PSModuleAutoLoadingPreference', 'PSCommandPath') -icontains (& $vn $n) }, $true))) {
    $dyn.Add('tercih:' + (& $vn $v) + '@' + (& $encl0 $v))
  }
  foreach ($v in @($ast.FindAll({ param($n) $n -is [System.Management.Automation.Language.VariableExpressionAst] -and $n.VariablePath.IsDriveQualified -and @('function', 'alias', 'variable') -icontains [string]$n.VariablePath.DriveName }, $true))) {
    $dyn.Add('surucu-degisken:' + ([string]$v.VariablePath.DriveName).ToLowerInvariant())
  }
  $r.dynamicUse = ((& $ord $dyn) -join ',')
  $ex = @{}
  foreach ($x in @($ast.FindAll({ param($n) $n -is [System.Management.Automation.Language.ExitStatementAst] }, $true))) { $k = & $encl0 $x; $ex[$k] = 1 + [int]$ex[$k] }
  $r.exitSites = ((& $ord @($ex.Keys | ForEach-Object { $_ + '=' + $ex[$_] })) -join ';')
  $inv = @{}
  $modeNames = @('TEST', 'TESTROOT', 'FAULT', 'SIM_STATE')
  $encl = { param($n) $e = $n.Parent; while ($null -ne $e) { if ($e -is [System.Management.Automation.Language.FunctionDefinitionAst]) { return $e.Name }; $e = $e.Parent }; return '<ust>' }
  foreach ($v in @($ast.FindAll({ param($n) $n -is [System.Management.Automation.Language.VariableExpressionAst] -and ($modeNames -contains (& $vn $n).ToUpperInvariant()) }, $true))) {
    $k = (& $encl $v) + ':' + (& $vn $v).ToUpperInvariant(); $inv[$k] = 1 + [int]$inv[$k]
  }
  foreach ($s in @($ast.FindAll({ param($n) $n -is [System.Management.Automation.Language.StringConstantExpressionAst] -and ($modeNames -contains ([string]$n.Value).ToUpperInvariant()) }, $true))) {
    $k = (& $encl $s) + ':DIZGI:' + ([string]$s.Value).ToUpperInvariant(); $inv[$k] = 1 + [int]$inv[$k]
  }
  $r.modeVarInventory = ((& $ord @($inv.Keys | ForEach-Object { $_ + '=' + $inv[$_] })) -join ';')
  return $r
}
# ---- /Get-GateIntegrity

# ---------------------------------------------------------------- 0) PRISTINE / ADAY KIMLIGI + YOL BUTCESI
Say ('HARNESS baslangic: ProvaRoot=' + $ProvaRoot + ' | Pristine=' + $PristineDir + ' | Cand=' + $CandApps + ' | scripts=' + $ScriptDir + ' | run=' + $RUN_TS)
foreach ($f in @($RELEASE, $ROLLBACK, $PSCommandPath)) {
  $tok = $null; $perr = $null; [void][System.Management.Automation.Language.Parser]::ParseFile($f, [ref]$tok, [ref]$perr)
  if ($perr.Count -ne 0) { Write-Host ('HARNESS: parse hatasi ' + $f + ' (' + $perr.Count + ')'); exit 1 }
  Say ('betik parse OK: ' + $f + ' sha256=' + (Sha $f))
}
$pMapApi = Get-Map $P_API; $pMapWeb = Get-Map (Join-Path $P_WEB '.next') -Web
$pApi = Get-TreeDigest $pMapApi; $pWeb = Get-TreeDigest $pMapWeb; $pCfg = Sha (Join-Path $P_WEB 'next.config.js')
$cMapWeb = Get-Map (Join-Path $C_WEB '.next') -Web
$cApi = Get-TreeDigest (Get-Map $C_API); $cWeb = Get-TreeDigest $cMapWeb; $cCfg = Sha (Join-Path $C_WEB 'next.config.js')
Say ('pristine api=' + $pApi + ' (' + ($pApi -ceq $EXP_LIVE) + ') web=' + $pWeb + ' (' + ($pWeb -ceq $EXP_WEB_LIVE) + ') cfg=' + ($pCfg -ceq $CFG_LIVE))
Say ('aday     api=' + $cApi + ' (' + ($cApi -ceq $EXP_CAND) + ') web=' + $cWeb + ' (' + ($cWeb -ceq $EXP_WEB_CAND) + ') cfg=' + ($cCfg -ceq $CFG_LIVE))
if (-not ($pApi -ceq $EXP_LIVE -and $pWeb -ceq $EXP_WEB_LIVE -and $pCfg -ceq $CFG_LIVE -and $cApi -ceq $EXP_CAND -and $cWeb -ceq $EXP_WEB_CAND -and $cCfg -ceq $CFG_LIVE)) {
  Write-Host 'HARNESS: pristine/aday kimligi pinlerle tutmadi - OLCULEMEDI'; exit 3
}
# yol butcesi: TestRoot altindaki yedek/hazirlik/onceki-.next kokleri (ts 16 kr: yyyyMMdd-HHmmssZ) + en uzun goreli yol < 260
$maxRelApi = Get-MaxRelLen $pMapApi; $maxRelWeb = [Math]::Max((Get-MaxRelLen $pMapWeb), (Get-MaxRelLen $cMapWeb))
$tsLen = 16
$budget = [ordered]@{
  backupApi     = (Join-Path $T_EVID 'rollback-api-src-R26-').Length + $tsLen + 1 + $maxRelApi
  backupWebNext = (Join-Path $T_EVID 'rollback-web-R26-').Length + $tsLen + 6 + $maxRelWeb
  stagedNext    = (Join-Path $T_LIVE_WEB '.next.r27-staged-').Length + $tsLen + 1 + $maxRelWeb
  preNext       = (Join-Path $T_LIVE_WEB '.next.pre-r27-').Length + $tsLen + 1 + $maxRelWeb
  failedNext    = (Join-Path $T_LIVE_WEB '.next.r27-failed-').Length + $tsLen + 1 + $maxRelWeb
  rollbackFailedNext = (Join-Path $T_LIVE_WEB '.next.rollback-from-r27-').Length + $tsLen + 1 + $maxRelWeb
}
$budgetOk = $true; foreach ($k in $budget.Keys) { if ($budget[$k] -ge 260) { $budgetOk = $false } }
Say ('yol butcesi (<260; maxRelApi=' + $maxRelApi + ' maxRelWeb=' + $maxRelWeb + '): ' + (($budget.Keys | ForEach-Object { $_ + '=' + $budget[$_] + ' (marj ' + (260 - $budget[$_]) + ')' }) -join ' | ') + ' -> ok=' + $budgetOk)
if (-not $budgetOk) { Write-Host ('HARNESS: yol butcesi asildi - ProvaRoot cok uzun (' + $ProvaRoot.Length + ' kr); WinPS 5.1 yedek yollarini okuyamaz - OLCULEMEDI'); exit 3 }

# ---------------------------------------------------------------- 1) SENARYOLAR
$results = New-Object System.Collections.Generic.List[object]
$lastHappyEvidence = $null
foreach ($sc in $Scenarios) {
  if (-not $EXPECT.ContainsKey($sc)) { Write-Host ('HARNESS: bilinmeyen senaryo ' + $sc); exit 1 }
  $exp = $EXPECT[$sc]; $asserts = New-Object System.Collections.Generic.List[object]
  $scDir = Join-Path $RUN_EVID $sc; New-Item -ItemType Directory -Force -Path $scDir | Out-Null
  $t0 = Get-Date
  $isGate = [bool]$exp.gate
  Say ('================ SENARYO ' + $sc + $(if ($isGate) { ' (kapi senaryosu)' } else { ' (beklenen cikis ' + $exp.exit + ' / ' + $exp.verdict + ')' }))
  $r = $null; $evPath = $null; $ev = $null; $evCopy = $null
  try {
    if ($isGate) {
      # ---------------------------------------------------------- KAPI SENARYOLARI
      $liveEvidBefore = Get-DirFileCount $LIVE_EVID_DIR
      switch ($sc) {
        'gate-fault-live-mode' {
          # TestRoot YOK + -Fault: betik param kontrolunde (canli yol cozumlemesinden ONCE) 20 ile cikar; canli kanit dizinine dosya birakmaz
          $r = Run-Script $RELEASE @('-Fault', 'api-copy-interrupt') (Join-Path $scDir 'stdout.txt')
          Assert $asserts 'cikis kodu 20' ($r.rc -eq 20) ('rc=' + $r.rc)
          Assert $asserts 'KAPI mesaji (-Fault yalniz -TestRoot ile)' ($r.out -match 'KAPI: -Fault yalniz -TestRoot') ''
          Assert $asserts 'kanit JSON YOK (akisa girmedi)' ($null -eq (Find-EvidencePath $r.out)) ''
          Assert $asserts 'canli kanit dizinine dosya eklenmedi' ((Get-DirFileCount $LIVE_EVID_DIR) -eq $liveEvidBefore) ('once=' + $liveEvidBefore + ' sonra=' + (Get-DirFileCount $LIVE_EVID_DIR))
        }
        'gate-testroot-under-live' {
          $under = Join-Path $LIVE_ROOT_CANON 'r27-prova-olmayan-dizin'
          $r = Run-Script $RELEASE @('-TestRoot', (Q $under)) (Join-Path $scDir 'stdout.txt')
          Assert $asserts 'release: cikis kodu 20' ($r.rc -eq 20) ('rc=' + $r.rc)
          Assert $asserts 'release: KAPI mesaji (canli kok altinda)' ($r.out -match 'KAPI: TestRoot canli kokun altinda') ''
          $r2 = Run-Script $ROLLBACK @('-BackupApiDir', (Q 'X:\yok-api'), '-BackupWebDir', (Q 'X:\yok-web'), '-TestRoot', (Q $under)) (Join-Path $scDir 'stdout-rollback.txt')
          Assert $asserts 'rollback: cikis kodu 20' ($r2.rc -eq 20) ('rc=' + $r2.rc)
          Assert $asserts 'rollback: KAPI mesaji (canli kok altinda)' ($r2.out -match 'KAPI: TestRoot canli kokun altinda') ''
          $r3 = Run-Script $RELEASE @('-TestRoot', (Q $LIVE_ROOT_CANON)) (Join-Path $scDir 'stdout-equal.txt')
          Assert $asserts 'release: TestRoot canli koke ESIT -> 20' ($r3.rc -eq 20 -and $r3.out -match 'KAPI: TestRoot canli kokun altinda') ('rc=' + $r3.rc)
          Assert $asserts 'canli kanit dizinine dosya eklenmedi' ((Get-DirFileCount $LIVE_EVID_DIR) -eq $liveEvidBefore) ('once=' + $liveEvidBefore)
        }
        'gate-sim-missing' {
          $tr = Join-Path $GATE_ROOT 'sim-missing'; New-Item -ItemType Directory -Force -Path $tr | Out-Null
          $r = Run-Script $RELEASE @('-TestRoot', (Q $tr)) (Join-Path $scDir 'stdout.txt')
          Assert $asserts 'cikis kodu 20' ($r.rc -eq 20) ('rc=' + $r.rc)
          $evPath = Find-EvidencePath $r.out
          Assert $asserts 'kanit JSON yazildi (KANIT: satiri)' ($null -ne $evPath) $(if ($evPath) { $evPath.path } else { 'YOK' })
          if ($evPath) {
            Assert $asserts 'kanit TestRoot\evidence altinda ve sha esit' ($evPath.path.StartsWith((Join-Path $tr 'evidence'), [StringComparison]::OrdinalIgnoreCase) -and ((Sha $evPath.path) -ceq $evPath.sha)) $evPath.path
            $ev = Get-Content -Raw -LiteralPath $evPath.path | ConvertFrom-Json
            $evCopy = Join-Path $scDir (Split-Path -Leaf $evPath.path); Copy-Item -LiteralPath $evPath.path -Destination $evCopy -Force
            Assert $asserts 'verdict KAPIDA-DURDU / exit 20' ($ev.verdict -ceq 'KAPIDA-DURDU' -and [int]$ev.exitCode -eq 20) ('verdict=' + $ev.verdict + ' exit=' + $ev.exitCode)
            Assert $asserts 'failedAt=0-kapilar ve stage=0-kapilar (7-kanit DEGIL)' ([string]$ev.failedAt -ceq '0-kapilar' -and [string]$ev.stage -ceq '0-kapilar') ('failedAt=' + $ev.failedAt + ' stage=' + $ev.stage)
            Assert $asserts 'error: simulator durumu yok' ([string]$ev.error -match 'simulator durumu yok') ([string]$ev.error)
            Assert $asserts 'rollback yok, servisler durdurulmadi' ($null -eq $ev.rollback) ''
          }
          Assert $asserts 'canli kanit dizinine dosya eklenmedi' ((Get-DirFileCount $LIVE_EVID_DIR) -eq $liveEvidBefore) ('once=' + $liveEvidBefore)
        }
        'gate-evidence-fallback' {
          $tr = Join-Path $GATE_ROOT 'evidence-fallback'; New-Item -ItemType Directory -Force -Path $tr | Out-Null
          [IO.File]::WriteAllText((Join-Path $tr 'evidence'), 'bu bir DOSYA - dizin olusturulamaz (enjekte)')   # evidence dizini yerine dosya
          $fbBefore = Get-DirFileCount $TEMP_FALLBACK
          $r = Run-Script $RELEASE @('-TestRoot', (Q $tr)) (Join-Path $scDir 'stdout.txt')
          Assert $asserts 'cikis kodu 20' ($r.rc -eq 20) ('rc=' + $r.rc)
          Assert $asserts 'KANIT YAZILAMADI satiri (TestRoot\evidence)' ($r.out -match '(?m)^KANIT YAZILAMADI \(') ''
          $evPath = Find-EvidencePath $r.out
          Assert $asserts 'kanit %TEMP% fallback dizinine yazildi' ($null -ne $evPath -and $evPath.path.StartsWith($TEMP_FALLBACK, [StringComparison]::OrdinalIgnoreCase)) $(if ($evPath) { $evPath.path } else { 'YOK' })
          if ($evPath) {
            Assert $asserts 'fallback kanit dosyasi mevcut ve sha esit' ((Test-Path -LiteralPath $evPath.path) -and ((Sha $evPath.path) -ceq $evPath.sha)) $evPath.sha.Substring(0, 16)
            Assert $asserts 'fallback dizininde dosya sayisi +1' ((Get-DirFileCount $TEMP_FALLBACK) -eq ($fbBefore + 1) -or $fbBefore -lt 0) ('once=' + $fbBefore + ' sonra=' + (Get-DirFileCount $TEMP_FALLBACK))
            $ev = Get-Content -Raw -LiteralPath $evPath.path | ConvertFrom-Json
            $evCopy = Join-Path $scDir (Split-Path -Leaf $evPath.path); Copy-Item -LiteralPath $evPath.path -Destination $evCopy -Force
            Assert $asserts 'verdict KAPIDA-DURDU' ($ev.verdict -ceq 'KAPIDA-DURDU') ('verdict=' + $ev.verdict)
          }
          Assert $asserts 'canli kanit dizinine dosya eklenmedi' ((Get-DirFileCount $LIVE_EVID_DIR) -eq $liveEvidBefore) ('once=' + $liveEvidBefore)
        }
        'gate-rollback-backup-missing' {
          $tr = Join-Path $GATE_ROOT 'rb-backup-missing'; New-Item -ItemType Directory -Force -Path $tr | Out-Null
          Write-SimState (Join-Path $tr 'sim\state.json')
          $bkA = Join-Path $tr 'yok-api'; $bkW = Join-Path $tr 'yok-web'
          $rs = Run-Script $ROLLBACK @('-BackupApiDir', (Q $bkA), '-BackupWebDir', (Q $bkW), '-TestRoot', (Q $tr), '-SelfTest') (Join-Path $scDir 'stdout-selftest.txt')
          Assert $asserts 'SelfTest: cikis 1 (FAIL, yedek olculemedi)' ($rs.rc -eq 1 -and $rs.out -match 'SELFTEST SONUC: FAIL') ('rc=' + $rs.rc)
          Assert $asserts 'SelfTest: yedek dizini yok mesaji' ($rs.out -match 'yedek butunlugu OLCULEMEDI: yedek dizini yok') ''
          $r = Run-Script $ROLLBACK @('-BackupApiDir', (Q $bkA), '-BackupWebDir', (Q $bkW), '-TestRoot', (Q $tr)) (Join-Path $scDir 'stdout.txt')
          Assert $asserts 'gercek kosum: cikis kodu 20' ($r.rc -eq 20) ('rc=' + $r.rc)
          $evPath = Find-EvidencePath $r.out
          Assert $asserts 'kanit JSON yazildi (KANIT: satiri) - kanitsiz 20 YOK' ($null -ne $evPath) $(if ($evPath) { $evPath.path } else { 'YOK' })
          if ($evPath) {
            Assert $asserts 'kanit TestRoot\evidence altinda ve sha esit' ($evPath.path.StartsWith((Join-Path $tr 'evidence'), [StringComparison]::OrdinalIgnoreCase) -and ((Sha $evPath.path) -ceq $evPath.sha)) $evPath.path
            $ev = Get-Content -Raw -LiteralPath $evPath.path | ConvertFrom-Json
            $evCopy = Join-Path $scDir (Split-Path -Leaf $evPath.path); Copy-Item -LiteralPath $evPath.path -Destination $evCopy -Force
            Assert $asserts 'verdict KAPIDA-DURDU / exit 20' ($ev.verdict -ceq 'KAPIDA-DURDU' -and [int]$ev.exitCode -eq 20) ('verdict=' + $ev.verdict + ' exit=' + $ev.exitCode)
            Assert $asserts 'failedAt=1-yedek-butunluk, stage=1-yedek-butunluk' ([string]$ev.failedAt -ceq '1-yedek-butunluk' -and [string]$ev.stage -ceq '1-yedek-butunluk') ('failedAt=' + $ev.failedAt + ' stage=' + $ev.stage)
            Assert $asserts 'error: yedek butunlugu olculemedi' ([string]$ev.error -match 'yedek butunlugu olculemedi') ([string]$ev.error)
            Assert $asserts 'restoreSteps yok (dosyalara dokunulmadi)' ($null -eq $ev.restoreSteps) ''
            $st = Get-Content -Raw -LiteralPath (Join-Path $tr 'sim\state.json') | ConvertFrom-Json
            Assert $asserts 'simulator: stop/start cagrisi yok' ([int]$st.stopCalls -eq 0 -and [int]$st.startCalls -eq 0 -and [bool]$st.apiRunning -and [bool]$st.webRunning) ('stop=' + $st.stopCalls + ' start=' + $st.startCalls)
          }
          Assert $asserts 'canli kanit dizinine dosya eklenmedi' ((Get-DirFileCount $LIVE_EVID_DIR) -eq $liveEvidBefore) ('once=' + $liveEvidBefore)
        }
        'gate-rogue-process' {
          # AKISTAKI kapi: simulatore sentetik surec listesi enjekte edilir (kosucu + dogrulanmis goruntuleyici + ilgisiz surec) -> 0-kapilar DUR (20)
          $tr = Join-Path $GATE_ROOT 'rogue-process'; New-Item -ItemType Directory -Force -Path (Join-Path $tr 'live\api') | Out-Null
          [IO.File]::WriteAllBytes((Join-Path $tr 'live\api\.env'), [Text.Encoding]::ASCII.GetBytes("R27_TESTROOT_FAKE_ENV=1`n"))
          $rp = @(
            [ordered]@{ ProcessId = 5001; ParentProcessId = 1; CreationDate = '2026-01-01T00:00:00Z'; Name = 'node.exe'; CommandLine = 'node D:\g\d5-portal-reset-live-run.js --token S3CR3T-DEGER postgresql://kullanici:S3CR3T@127.0.0.1:1/db'; ExecutablePath = 'C:\n\node.exe' },
            [ordered]@{ ProcessId = 5002; ParentProcessId = 1; CreationDate = '2026-01-01T00:00:00Z'; Name = 'tail.exe'; CommandLine = 'tail -f D:\x\r27-izleme.log'; ExecutablePath = (Join-Path $env:ProgramFiles 'Git\usr\bin\tail.exe') },
            [ordered]@{ ProcessId = 5003; ParentProcessId = 1; CreationDate = '2026-01-01T00:00:00Z'; Name = 'node.exe'; CommandLine = 'node D:\app\server.js'; ExecutablePath = 'C:\n\node.exe' })
          Write-SimState (Join-Path $tr 'sim\state.json') $rp
          $r = Run-Script $RELEASE @('-TestRoot', (Q $tr)) (Join-Path $scDir 'stdout.txt')
          Assert $asserts 'cikis kodu 20' ($r.rc -eq 20) ('rc=' + $r.rc)
          Assert $asserts 'akis kapida DURDU: ADAY DOGRULAMA asamasina GECILMEDI' ($r.out -notmatch 'ADAY DOGRULAMA') ''
          $evPath = Find-EvidencePath $r.out
          Assert $asserts 'kanit JSON yazildi (KANIT: satiri)' ($null -ne $evPath) $(if ($evPath) { $evPath.path } else { 'YOK' })
          if ($evPath) {
            Assert $asserts 'kanit TestRoot\evidence altinda ve sha esit' ($evPath.path.StartsWith((Join-Path $tr 'evidence'), [StringComparison]::OrdinalIgnoreCase) -and ((Sha $evPath.path) -ceq $evPath.sha)) $evPath.path
            $evText = Get-Content -Raw -LiteralPath $evPath.path; $ev = $evText | ConvertFrom-Json
            $evCopy = Join-Path $scDir (Split-Path -Leaf $evPath.path); Copy-Item -LiteralPath $evPath.path -Destination $evCopy -Force
            Assert $asserts 'verdict KAPIDA-DURDU / exit 20' ($ev.verdict -ceq 'KAPIDA-DURDU' -and [int]$ev.exitCode -eq 20) ('verdict=' + $ev.verdict + ' exit=' + $ev.exitCode)
            Assert $asserts 'failedAt=0-kapilar' ([string]$ev.failedAt -ceq '0-kapilar') ('failedAt=' + $ev.failedAt)
            Assert $asserts 'error: sahte-surec kapisinin KENDI metni (izleme dahil 2 eslesme)' ([string]$ev.error -match 'test/prova sureci var \(izleme dahil 2 eslesme\)') ([string]$ev.error)
            Assert $asserts 'health.rogue: eslesen=2 (test-uygulama=1 izleme=1) taranan=3 simulated' ([int]$ev.health.rogue.count -eq 2 -and [int]$ev.health.rogue.testApp -eq 1 -and [int]$ev.health.rogue.viewers -eq 1 -and [int]$ev.health.rogue.scanned -eq 3 -and [bool]$ev.health.rogue.simulated) ('count=' + $ev.health.rogue.count + ' testApp=' + $ev.health.rogue.testApp + ' izleme=' + $ev.health.rogue.viewers + ' taranan=' + $ev.health.rogue.scanned)
            $it1 = @($ev.health.rogue.items | Where-Object { [int]$_.pid -eq 5001 })[0]; $it2 = @($ev.health.rogue.items | Where-Object { [int]$_.pid -eq 5002 })[0]
            Assert $asserts 'kosucu: sinif test-uygulama, eslesen d5-portal-, oge yalniz yaprak ad' ($it1 -and $it1.class -ceq 'test-uygulama' -and $it1.token -ceq 'd5-portal-' -and $it1.item -ceq 'd5-portal-reset-live-run.js') ('class=' + $it1.class + ' item=' + $it1.item)
            Assert $asserts 'goruntuleyici: sinif izleme AMA SAYILDI' ($it2 -and $it2.class -ceq 'izleme' -and $it2.item -ceq 'r27-izleme.log') ('class=' + $it2.class + ' item=' + $it2.item)
            $topKeys = (@($ev.health.rogue.PSObject.Properties.Name) -join ','); $itemKeys = (@($ev.health.rogue.items | ForEach-Object { (@($_.PSObject.Properties.Name) -join ',') } | Sort-Object -Unique) -join ' | ')
            Assert $asserts 'kanit alan kumesi TAM ESIT (ust duzey)' ($topKeys -ceq 'count,viewers,testApp,scanned,unreadable,unreadableShells,unreadableShellNames,selfSeen,excluded,items,simulated,elevated') $topKeys
            Assert $asserts 'kanit alan kumesi TAM ESIT (oge: pid,name,class,token,item)' ($itemKeys -ceq 'pid,name,class,token,item') $itemKeys
            Assert $asserts 'kanitta sir isareti ve komut satiri parcasi YOK' (($evText -notmatch 'S3CR3T') -and ($evText -notmatch 'kullanici:') -and ($evText -notmatch 'postgresql') -and ($evText -notmatch '--token')) ''
            Assert $asserts 'rollback yok (dosyalara dokunulmadi)' ($null -eq $ev.rollback) ''
          }
          Assert $asserts 'stdout: sir isareti YOK; siniflar listelendi' (($r.out -notmatch 'S3CR3T') -and ($r.out -notmatch 'postgresql') -and ($r.out -match 'test-uygulama\s+pid=5001') -and ($r.out -match 'izleme\s+pid=5002')) ''
          $st = Get-Content -Raw -LiteralPath (Join-Path $tr 'sim\state.json') | ConvertFrom-Json
          Assert $asserts 'simulator: stop/start cagrisi yok, servisler ayakta' ([int]$st.stopCalls -eq 0 -and [int]$st.startCalls -eq 0 -and [bool]$st.apiRunning -and [bool]$st.webRunning) ('stop=' + $st.stopCalls + ' start=' + $st.startCalls)
          Assert $asserts 'canli kanit dizinine dosya eklenmedi' ((Get-DirFileCount $LIVE_EVID_DIR) -eq $liveEvidBefore) ('once=' + $liveEvidBefore)
        }
        'gate-rogue-viewer-only' {
          # (1) Yalniz DOGRULANMIS goruntuleyici calisiyor -> yine DUR (izleme muaf DEGIL). Kapinin KENDI hata metni ve ADAY DOGRULAMA'ya
          #     gecilmedigi olculur (aday dizini olmadigi icin sonraki asama da 20 verirdi: cikis kodu tek basina kanit DEGILDIR).
          $tr = Join-Path $GATE_ROOT 'rogue-viewer-only'; New-Item -ItemType Directory -Force -Path (Join-Path $tr 'live\api') | Out-Null
          [IO.File]::WriteAllBytes((Join-Path $tr 'live\api\.env'), [Text.Encoding]::ASCII.GetBytes("R27_TESTROOT_FAKE_ENV=1`n"))
          $rp = @(
            [ordered]@{ ProcessId = 5002; ParentProcessId = 1; CreationDate = '2026-01-01T00:00:00Z'; Name = 'tail.exe'; CommandLine = 'tail -f D:\x\r27-izleme.log'; ExecutablePath = (Join-Path $env:ProgramFiles 'Git\usr\bin\tail.exe') },
            [ordered]@{ ProcessId = 5003; ParentProcessId = 1; CreationDate = '2026-01-01T00:00:00Z'; Name = 'node.exe'; CommandLine = 'node D:\app\server.js'; ExecutablePath = 'C:\n\node.exe' })
          Write-SimState (Join-Path $tr 'sim\state.json') $rp
          $r = Run-Script $RELEASE @('-TestRoot', (Q $tr)) (Join-Path $scDir 'stdout.txt')
          Assert $asserts 'cikis kodu 20 (izleme de DUR verir)' ($r.rc -eq 20) ('rc=' + $r.rc)
          Assert $asserts 'akis kapida DURDU: ADAY DOGRULAMA asamasina GECILMEDI' ($r.out -notmatch 'ADAY DOGRULAMA') ''
          Assert $asserts 'stdout: izleme sinifi satiri listelendi' ($r.out -match 'izleme\s+pid=5002 tail\.exe eslesen=r27- oge=r27-izleme\.log') ''
          $evPath = Find-EvidencePath $r.out
          Assert $asserts 'kanit JSON yazildi' ($null -ne $evPath) $(if ($evPath) { $evPath.path } else { 'YOK' })
          if ($evPath) {
            Assert $asserts 'kanit TestRoot\evidence altinda ve sha esit' ($evPath.path.StartsWith((Join-Path $tr 'evidence'), [StringComparison]::OrdinalIgnoreCase) -and ((Sha $evPath.path) -ceq $evPath.sha)) $evPath.path
            $ev = Get-Content -Raw -LiteralPath $evPath.path | ConvertFrom-Json
            $evCopy = Join-Path $scDir (Split-Path -Leaf $evPath.path); Copy-Item -LiteralPath $evPath.path -Destination $evCopy -Force
            Assert $asserts 'verdict KAPIDA-DURDU, failedAt 0-kapilar' ($ev.verdict -ceq 'KAPIDA-DURDU' -and [string]$ev.failedAt -ceq '0-kapilar') ('verdict=' + $ev.verdict)
            Assert $asserts 'error: sahte-surec kapisinin KENDI metni (izleme dahil 1 eslesme)' ([string]$ev.error -match 'test/prova sureci var \(izleme dahil 1 eslesme\)') ([string]$ev.error)
            Assert $asserts 'health.rogue: eslesen=1 izleme=1 test-uygulama=0' ([int]$ev.health.rogue.count -eq 1 -and [int]$ev.health.rogue.viewers -eq 1 -and [int]$ev.health.rogue.testApp -eq 0) ('count=' + $ev.health.rogue.count)
            Assert $asserts 'rollback yok (dosyalara dokunulmadi)' ($null -eq $ev.rollback) ''
          }
          $st = Get-Content -Raw -LiteralPath (Join-Path $tr 'sim\state.json') | ConvertFrom-Json
          Assert $asserts 'simulator: stop/start cagrisi yok' ([int]$st.stopCalls -eq 0 -and [int]$st.startCalls -eq 0) ''
          # (2) KARSI KONTROL: desene eslesen surec YOK -> kapi GECER ve akis ADAY DOGRULAMA'ya ULASIR (aday dizini olmadigindan orada durur).
          $tr2 = Join-Path $GATE_ROOT 'rogue-none'; New-Item -ItemType Directory -Force -Path (Join-Path $tr2 'live\api') | Out-Null
          [IO.File]::WriteAllBytes((Join-Path $tr2 'live\api\.env'), [Text.Encoding]::ASCII.GetBytes("R27_TESTROOT_FAKE_ENV=1`n"))
          $rp2 = @([ordered]@{ ProcessId = 5003; ParentProcessId = 1; CreationDate = '2026-01-01T00:00:00Z'; Name = 'node.exe'; CommandLine = 'node D:\app\server.js'; ExecutablePath = 'C:\n\node.exe' })
          Write-SimState (Join-Path $tr2 'sim\state.json') $rp2
          $r2 = Run-Script $RELEASE @('-TestRoot', (Q $tr2)) (Join-Path $scDir 'stdout-karsi-kontrol.txt')
          Assert $asserts 'karsi kontrol: eslesme yok -> kapi gecti, akis ADAY DOGRULAMA asamasina ulasti' (($r2.out -match 'ADAY DOGRULAMA') -and ($r2.out -match 'eslesen=0 \[test-uygulama=0 izleme=0\]') -and ($r2.out -notmatch 'test/prova sureci var')) ('rc=' + $r2.rc)
          Assert $asserts 'karsi kontrol: aday olmadigi icin yayin YAPILMADI (cikis 0 degil)' ($r2.rc -ne 0) ('rc=' + $r2.rc)
          $st2 = Get-Content -Raw -LiteralPath (Join-Path $tr2 'sim\state.json') | ConvertFrom-Json
          Assert $asserts 'karsi kontrol: stop/start cagrisi yok' ([int]$st2.stopCalls -eq 0 -and [int]$st2.startCalls -eq 0) ''
          Assert $asserts 'canli kanit dizinine dosya eklenmedi' ((Get-DirFileCount $LIVE_EVID_DIR) -eq $liveEvidBefore) ('once=' + $liveEvidBefore)
        }
        'gate-rogue-classifier' {
          # Betigin AKISI calismaz: yalniz atamalar + saf fonksiyonlar AST ile yuklenir. Canli surec listesine BAKILMAZ (sentetik nesneler).
          $tok = $null; $perr = $null
          $ast = [System.Management.Automation.Language.Parser]::ParseFile($RELEASE, [ref]$tok, [ref]$perr)
          $wantF = @('ConvertTo-RogueFolded', 'Get-RogueMatchInfo', 'Test-RogueMatch', 'Get-RogueClass', 'Get-RogueItemName', 'Get-RogueReport', 'Get-RogueGateError', 'Test-RogueClassifier')
          $wantV = @('$ROGUE_TOKENS', '$ROGUE_RX', '$ROGUE_RXO', '$ROGUE_VIEWERS', '$ROGUE_VIEWER_DIRS', '$ROGUE_SHELLS', '$ROGUE_ITEM_EXT', '$ROGUE_ITEM_FLAGS')
          $fdefs = @($ast.FindAll({ param($n) $n -is [System.Management.Automation.Language.FunctionDefinitionAst] -and ($wantF -contains $n.Name) }, $false))
          $asg = @($ast.FindAll({ param($n) $n -is [System.Management.Automation.Language.AssignmentStatementAst] -and ($wantV -contains $n.Left.Extent.Text) }, $false))
          Assert $asserts 'betikte 8 fonksiyon + 8 atama bulundu' ($fdefs.Count -eq 8 -and $asg.Count -eq 8) ('fonksiyon=' + $fdefs.Count + ' atama=' + $asg.Count)
          $fnText = @{}
          foreach ($a in $asg) { . ([scriptblock]::Create($a.Extent.Text)) }
          foreach ($f in $fdefs) { $fnText[$f.Name] = $f.Extent.Text; . ([scriptblock]::Create($f.Extent.Text)) }
          # ---- SABITLEME: desen parcalari, izleme listesi ve guvenilir dizinler TAM ESIT (sessiz ekleme/cikarma yakalanir)
          $EXP_TOKENS = @('i1[2-6]-live', 'i12-cron', 'i12-window', 'i15-kabul', 'smtp-sink', 'i3-sink', 'i3-spy', 'edge-proxy', 'r26-dar-kabul', 'r26-live-portal',
            'd4-portal-', 'd5-portal-', 'd6-portal-', 'd7-portal-', 'd8-staff-', 'd[4-8]-selftest', 'd[4-8]-fake-', 'd[4-8]-qr-', 'd[4-8]-owner-', 'extacc-', 'h5-url-', 'r27-',
            'c-run\.js', 'c-setup\.js', 'c-99-close', 'c-start-api', 'P1-delivery', 'Preflight\.ps1')
          Assert $asserts 'desen parcalari beklenen 28 parcaya TAM ESIT' ((($ROGUE_TOKENS -join '|') -ceq ($EXP_TOKENS -join '|')) -and ($ROGUE_RX -ceq ($EXP_TOKENS -join '|'))) ('adet=' + @($ROGUE_TOKENS).Count)
          Assert $asserts 'izleme listesi TAM ESIT (tail,cat,head,grep,findstr,more.com; less/rg/notepad YOK)' (($ROGUE_VIEWERS -join ',') -ceq 'tail.exe,cat.exe,head.exe,grep.exe,findstr.exe,more.com') ($ROGUE_VIEWERS -join ',')
          Assert $asserts 'guvenilir dizinler TAM ESIT (Git usr\bin, System32)' ((@($ROGUE_VIEWER_DIRS).Count -eq 2) -and ([string]$ROGUE_VIEWER_DIRS[0] -ieq (Join-Path $env:ProgramFiles 'Git\usr\bin')) -and ([string]$ROGUE_VIEWER_DIRS[1] -ieq (Join-Path $env:SystemRoot 'System32'))) ''
          Assert $asserts 'oge adi izinli uzanti + bayrak listeleri TAM ESIT' ((($ROGUE_ITEM_EXT -join ',') -ceq '.js,.cjs,.mjs,.ps1,.psm1,.cmd,.bat,.py,.sh,.log,.txt,.json') -and (($ROGUE_ITEM_FLAGS -join ',') -ceq '-file,-f')) (($ROGUE_ITEM_EXT -join ',') + ' | ' + ($ROGUE_ITEM_FLAGS -join ','))
          Assert $asserts 'yorumlayici/kabuk listesi TAM ESIT (okunamayan komut satiri teshisi)' (($ROGUE_SHELLS -join ',') -ceq 'node.exe,powershell.exe,pwsh.exe,cmd.exe,bash.exe,sh.exe,python.exe,python3.exe,py.exe,wscript.exe,cscript.exe') ($ROGUE_SHELLS -join ',')
          Assert $asserts 'eslesme secenekleri IgnoreCase + CultureInvariant' (([int]$ROGUE_RXO -band [int][Text.RegularExpressions.RegexOptions]::IgnoreCase) -ne 0 -and ([int]$ROGUE_RXO -band [int][Text.RegularExpressions.RegexOptions]::CultureInvariant) -ne 0) ([string]$ROGUE_RXO)
          # ---- her parca: kucuk ve BUYUK harf (tr-TR 'I' tuzagi dahil) -> eslesir ve 'test-uygulama'
          $hit = 0; $miss = New-Object System.Collections.Generic.List[string]
          foreach ($t in $EXP_TOKENS) {
            $sample = ($t -replace '\[2-6\]', '4' -replace '\[4-8\]', '6' -replace '\\\.', '.')
            foreach ($v in @($sample.ToLowerInvariant(), $sample.ToUpperInvariant())) {
              $c = 'node D:\g\' + $v + 'x.js'
              if ((Test-RogueMatch $c) -and ((Get-RogueClass 'node.exe' $c 'C:\n\node.exe') -ceq 'test-uygulama')) { $hit++ } else { $miss.Add($v) }
            }
          }
          Assert $asserts 'her desen parcasi kucuk + BUYUK harfle eslesir (28 x 2 = 56)' ($hit -eq 56 -and $miss.Count -eq 0) ('eslesen=' + $hit + ' kacan=' + ($miss -join ','))
          Assert $asserts 'BUYUK I iceren komut satirlari kulturden bagimsiz eslesir (tr-TR tuzagi)' ((Test-RogueMatch 'NODE D:\G\SMTP-SINK.JS') -and (Test-RogueMatch 'NODE D:\G\I12-CRON.JS') -and (Test-RogueMatch 'powershell -File PREFLIGHT.PS1')) ('CurrentCulture=' + [Globalization.CultureInfo]::CurrentCulture.Name)
          # ---- katlama: taban surumun (-match, kultur tr-TR) saydigi U+0130 / U+212A girdileri yeni eslesmede de SAYILIR (gevseme yok); U+0131 ek sikilastirma
          $uDotI = [string][char]0x0130; $uNoDotI = [string][char]0x0131; $uKelvin = [string][char]0x212A   # PowerShell degisken adlari harf DUYARSIZ: adlar ayri tutulur
          $uIn = @(('node D:\g\SMTP-S' + $uDotI + 'NK.JS'), ('node D:\g\' + $uDotI + '12-CRON.JS'), ('powershell -File PREFL' + $uDotI + 'GHT.PS1'), ('node D:\g\smtp-s' + $uNoDotI + 'nk.js'), ('node D:\g\smtp-sin' + $uKelvin + '.js'), ('node D:\g\' + $uNoDotI + '15-' + $uKelvin + 'abul.js'))
          $uMiss = @($uIn | Where-Object { -not ((Test-RogueMatch $_) -and ((Get-RogueClass 'node.exe' $_ 'C:\n\node.exe') -ceq 'test-uygulama')) })
          Assert $asserts 'U+0130 / U+0131 / U+212A iceren 6 komut satiri eslesir ve test-uygulama sayilir' ($uIn.Count -eq 6 -and $uMiss.Count -eq 0 -and $uDotI -cne $uNoDotI) ('kacan=' + $uMiss.Count)
          Assert $asserts 'katlama AYNI UZUNLUKTA (eslesme konumu kaymaz)' ((ConvertTo-RogueFolded ('a' + $uDotI + $uNoDotI + $uKelvin + 'b')) -ceq 'aIiKb') (ConvertTo-RogueFolded ('a' + $uDotI + $uNoDotI + $uKelvin + 'b'))
          # ---- siniflandirma: dogrulanmis goruntuleyici / sahte ad / sahte yol
          $gitBin = Join-Path $env:ProgramFiles 'Git\usr\bin'; $sys32 = Join-Path $env:SystemRoot 'System32'
          Assert $asserts 'tail.exe + Git usr\bin -> izleme' ((Get-RogueClass 'tail.exe' 'tail -f D:\x\R27-RELEASE-1.log' (Join-Path $gitBin 'tail.exe')) -ceq 'izleme') ''
          Assert $asserts 'TAIL.EXE + BUYUK harfli yol -> izleme' ((Get-RogueClass 'TAIL.EXE' 'tail -f D:\x\r27-x.log' ((Join-Path $gitBin 'TAIL.EXE').ToUpperInvariant())) -ceq 'izleme') ''
          Assert $asserts 'findstr.exe + System32 -> izleme' ((Get-RogueClass 'findstr.exe' 'findstr /c:x D:\x\r27-x.log' (Join-Path $sys32 'findstr.exe')) -ceq 'izleme') ''
          Assert $asserts 'ayni adli ikili BASKA dizinde -> test-uygulama' ((Get-RogueClass 'tail.exe' 'D:\tmp\tail.exe D:\g\d5-portal-reset-live-run.js' 'D:\tmp\tail.exe') -ceq 'test-uygulama') ''
          Assert $asserts 'goruntuleyici adi ama calistirilabilir yol BOS/okunamaz -> test-uygulama' ((Get-RogueClass 'cat.exe' 'cat D:\x\r27-x.log' '') -ceq 'test-uygulama') ''
          Assert $asserts 'yol gecisi (..\) ile guvenilir dizin taklidi -> test-uygulama' ((Get-RogueClass 'tail.exe' 'tail r27-x.log' (Join-Path $gitBin '..\..\evil\tail.exe')) -ceq 'test-uygulama') ''
          Assert $asserts 'guvenilir dizinin ALT dizini -> test-uygulama' ((Get-RogueClass 'findstr.exe' 'findstr x r27-x.log' (Join-Path $sys32 'alt\findstr.exe')) -ceq 'test-uygulama') ''
          $badNames = @('eviltail.exe', 'tail.exe.bak.exe', 'tail', 'tailx.exe', 'TAIL~1.EXE', 'less.exe', 'rg.exe', 'notepad.exe', 'node.exe', 'powershell.exe', 'pwsh.exe', 'cmd.exe', 'bash.exe', 'python.exe', 'perl.exe', 'wsl.exe', 'mshta.exe', 'curl.exe', 'psql.exe')
          $bad = @($badNames | Where-Object { (Get-RogueClass $_ 'x D:\g\r27-x.js' (Join-Path $gitBin $_)) -cne 'test-uygulama' })
          Assert $asserts 'listede OLMAYAN 19 goruntu adi (guvenilir dizinde olsa bile) -> test-uygulama' ($bad.Count -eq 0) ('kacan=' + ($bad -join ','))
          Assert $asserts 'bash -c "tail -f ..." sarmalayicisi -> test-uygulama' ((Get-RogueClass 'bash.exe' 'bash -c "tail -f /d/x/r27-x.log"' (Join-Path $gitBin 'bash.exe')) -ceq 'test-uygulama') ''
          Assert $asserts 'powershell Get-Content -Wait -> test-uygulama' ((Get-RogueClass 'powershell.exe' 'powershell -Command Get-Content -Wait D:\x\r27-x.log' 'C:\w\powershell.exe') -ceq 'test-uygulama') ''
          Assert $asserts 'desene eslesmeyen surec -> none' ((Get-RogueClass 'node.exe' 'node D:\app\main.js' 'C:\n\node.exe') -ceq 'none') ''
          Assert $asserts 'Test-RogueClassifier (sentetik listeler: sinif + kardes/cocuk + dislama + oge adi + kapi + kanarya) TRUE' ([bool](Test-RogueClassifier)) ''
          # ---- rapor alan kumesi (dislanan dahil) TAM ESIT
          $pkgP = 'D:\repo\project\docs\governance\client-release-r27-r01\scripts\r27-release.ps1'
          $mkP = { param($i, $pp, $sec, $n, $c) New-Object psobject -Property @{ ProcessId = $i; ParentProcessId = $pp; CreationDate = ([datetime]'2026-01-01T00:00:00Z').AddSeconds($sec); Name = $n; CommandLine = $c; ExecutablePath = 'C:\n\x.exe' } }
          $repK = Get-RogueReport @((& $mkP 99 1 0 'powershell.exe' 'powershell.exe'), (& $mkP 100 99 10 'powershell.exe' ('powershell.exe -File ' + $pkgP)), (& $mkP 102 1 5 'node.exe' 'node D:\g\d5-portal-x.js')) 100 'r27-release.ps1' $pkgP
          Assert $asserts 'rapor alan kumesi TAM ESIT (ust duzey / oge / dislanan)' (((@($repK.Keys) -join ',') -ceq 'count,viewers,testApp,scanned,unreadable,unreadableShells,unreadableShellNames,selfSeen,excluded,items') -and ((@($repK.items[0].Keys) -join ',') -ceq 'pid,name,class,token,item') -and ((@($repK.excluded[0].Keys) -join ',') -ceq 'pid,name,why')) ((@($repK.Keys) -join ','))
          # ---- oge adi: tam komut satiri YAZILMAZ; sir baska argumanda / dizinde / bayrak degerinde / URL'de ise rapora GIRMEZ
          $leakIn = @('node D:\g\d5-portal-x.js postgresql://kullanici:S3CR3T@127.0.0.1:1/db', 'node x.js --token extacc-S3CR3T', 'node x.js --password=extacc-S3CR3T', 'node x.js --password extacc-S3CR3T',
            'curl https://S3CR3T@host/extacc-x.js', 'node d5-portal-x.js?token=S3CR3T', 'cmd /c set PGPASSWORD=S3CR3T&& node d5-portal-x.js', 'node extacc-run.js --go-ref S3CR3T', 'powershell -File "C:\Users\biri\S3CR3T\r27-release.ps1"',
            'redis://:S3CR3T@h/extacc-db', 'node r27-x.js S3CR3T', 'node D:\S3CR3T\d6-portal-x.js', 'node x.js --token extacc-S3CR3T.json', 'node x.js -p extacc-S3CR3T.txt', 'node x.js /key extacc-S3CR3T.log',
            'curl https://host/extacc-S3CR3T.json', 'curl http://h/r27-S3CR3T.txt', 'node a://S3CR3T/r27-x.js', 'node --a:S3CR3T\r27-x.cmd', 'node D:\a=S3CR3T\r27-x.js', 'node r27-x.js;S3CR3T.js', 'node (r27-S3CR3T.js)',
            'node r27-S3CR3T:y.js', 'node extacc-S3CR3T.key', 'node r27-S3CR3T~y.js', 'node D:\r27-x\S3CR3T.txt', 'node extacc-S3CR3T', 'node "D:\S3CR3T dizin\r27-x.js"', 'node x.js --header "Authorization: S3CR3T" extacc-x.js',
            'node extacc-x.js,S3CR3T.js', 'node r27-x.js@S3CR3T')
          $leak = New-Object System.Collections.Generic.List[string]
          foreach ($c in $leakIn) {
            $rep1 = Get-RogueReport @((New-Object psobject -Property @{ ProcessId = 7; ParentProcessId = 1; CreationDate = [datetime]'2026-01-01'; Name = 'node.exe'; CommandLine = $c; ExecutablePath = 'C:\n\node.exe' })) -1 'r27-release.ps1' ''
            $js = ($rep1 | ConvertTo-Json -Depth 5)
            if ($js -match 'S3CR3T' -or $js -match 'biri' -or (@($rep1.items | Where-Object { $_.Contains('cmd') }).Count -gt 0) -or $rep1.count -ne 1) { $leak.Add($c.Substring(0, [Math]::Min(30, $c.Length))) }
          }
          Assert $asserts 'rapor 31 komut satiri biciminde sir isaretini YAZMAZ (tam komut satiri yok) ve her birini SAYAR' ($leakIn.Count -eq 31 -and $leak.Count -eq 0) ('sizan=' + ($leak -join ' | '))
          Assert $asserts 'oge adi: tirnakli bosluklu yol -> yalniz yaprak ad' ((Get-RogueItemName 'node "C:\Program Files\x y\d5-portal-reset-live-run.js"') -ceq 'd5-portal-reset-live-run.js') ''
          Assert $asserts 'oge adi: gercek paket yolu (dizin de desene eslesir) -> yaprak ad' ((Get-RogueItemName ('powershell -File ' + $pkgP + ' -SelfTest')) -ceq 'r27-release.ps1') ''
          Assert $asserts 'BILINEN SINIR (sabitlendi): desenle BASLAYAN dosya ADI rapora yazilir - dosya adina gomulu kisa deger ayiklanmaz' ((Get-RogueItemName 'node extacc-S3CR3T.js') -ceq 'extacc-S3CR3T.js') ''
          # ---- oge adi korumalari: HER koruma icin yalniz o korumanin yakaladigi ornek + korumayi kaldiran mutasyon (siniflandirici FALSE olmali)
          $long61 = 'r27-' + ('ab-' * 18) + 'x.js'    # 4 + 54 + 4 = 62 karakter
          $prot = @(
            @{ n = 'ayirici/ozel karakter';  s = 'node D:\a=b\r27-x.js';                  old = 'if ($arg.IndexOfAny([char[]]@(''?'', ''#'', ''&'', ''='', '';'', '','', ''@'', ''('', '')'', ''+'', ''%'')) -ge 0) { continue }' },
            @{ n = 'sema ayirici (://)';     s = 'node a://x/r27-x.js';                   old = 'if ($arg.Contains(''://'')) { continue }' },
            @{ n = 'iki nokta konumu';       s = 'node --a:b\r27-S3.cmd';                 old = '$c1 = $arg.IndexOf('':''); if ($c1 -ge 0 -and ($c1 -ne 1 -or $arg.LastIndexOf('':'') -ne 1)) { continue }' },
            @{ n = 'yaprak basi';            s = 'node D:\r27-x\S3CR3T.txt';              old = 'if ($m.Index -ne ($s + $i + 1)) { continue }' },
            @{ n = 'uzunluk (<=60)';         s = ('node ' + $long61);                     old = 'if ($leaf.Length -lt 1 -or $leaf.Length -gt 60) { continue }' },
            @{ n = 'karakter kumesi';        s = 'node r27-S3CR3T~y.js';                  old = 'if (-not [regex]::IsMatch($leaf, ''^[A-Za-z0-9._-]+$'', $rxi)) { continue }' },
            @{ n = 'belirtec gorunumu (20+)'; s = 'node extacc-A1b2C3d4E5f6G7h8I9j0K.js'; old = 'if ([regex]::IsMatch($leaf, ''[A-Za-z0-9]{20,}'', $rxi)) { continue }' },
            @{ n = 'izinli uzanti';          s = 'node extacc-S3CR3T.key';                old = 'if (-not $extOk) { continue }' },
            @{ n = 'onceki arguman bayrak';  s = 'node x.js --token extacc-S3CR3T.json';  old = 'if (-not $flagOk) { continue }' })
          $protBad = New-Object System.Collections.Generic.List[string]
          foreach ($pr in $prot) {
            $base0 = (Get-RogueItemName $pr.s)
            $t = $fnText['Get-RogueItemName']; $ix = $t.IndexOf($pr.old)
            if ($ix -lt 0 -or $t.IndexOf($pr.old, $ix + 1) -ge 0) { $protBad.Add($pr.n + ': mutasyon metni bulunamadi/tek degil'); continue }
            . ([scriptblock]::Create($t.Substring(0, $ix) + $t.Substring($ix + $pr.old.Length)))
            $mutItem = (Get-RogueItemName $pr.s); $mutCls = [bool](Test-RogueClassifier)
            . ([scriptblock]::Create($fnText['Get-RogueItemName']))
            if ($base0 -cne '' -or $mutItem -ceq '' -or $mutCls) { $protBad.Add($pr.n + ': taban=[' + $base0 + '] mutasyon=[' + $mutItem + '] siniflandirici=' + $mutCls) }
          }
          Assert $asserts 'oge adi: 9 korumanin HER BIRI tek basina olculur (ornek BOS; koruma kaldirilinca ad yazilir ve siniflandirici FALSE)' ($protBad.Count -eq 0) ($protBad -join ' ; ')
          # ---- fonksiyon mutasyonlari: kapi karari, kanarya, dislama kurallari, katlama
          $fmut = @(
            @{ n = 'kapi: izleme muaf (count yerine testApp)'; f = 'Get-RogueGateError'; old = 'if ([int]$rr.count -ne 0)';            new = 'if ([int]$rr.testApp -ne 0)' },
            @{ n = 'kapi: taranan=0 korumasi kaldirildi';     f = 'Get-RogueGateError'; old = 'if ([int]$rr.scanned -eq 0)';           new = 'if ($false)' },
            @{ n = 'kapi: kanarya (selfSeen) kaldirildi';     f = 'Get-RogueGateError'; old = 'if (-not [bool]$rr.selfSeen)';         new = 'if ($false)' },
            @{ n = 'kapi: canli korumalar TEST gibi atlandi'; f = 'Get-RogueGateError'; old = 'if (-not [bool]$rr.simulated)';        new = 'if ($false)' },
            @{ n = 'kapi: rapor yok -> gecer';                f = 'Get-RogueGateError'; old = 'if ($null -eq $rr) { return ''KAPI: sahte-surec raporu yok - DUR'' }'; new = 'if ($null -eq $rr) { return '''' }' },
            @{ n = 'dislama: cocuk surecler muaf';            f = 'Get-RogueReport';    old = 'if (($null -ne $me -and [int]$p.ProcessId -eq $selfPid) -or [int]$p.ProcessId -eq $parentPid) { continue }'; new = 'if (($null -ne $me -and [int]$p.ProcessId -eq $selfPid) -or [int]$p.ProcessId -eq $parentPid -or [int]$p.ParentProcessId -eq $selfPid) { continue }' },
            @{ n = 'dislama: kardes surecler muaf';           f = 'Get-RogueReport';    old = 'if (($null -ne $me -and [int]$p.ProcessId -eq $selfPid) -or [int]$p.ProcessId -eq $parentPid) { continue }'; new = 'if (($null -ne $me -and [int]$p.ProcessId -eq $selfPid) -or [int]$p.ProcessId -eq $parentPid -or ($me -and [int]$p.ParentProcessId -eq [int]$me.ParentProcessId)) { continue }' },
            @{ n = 'ust surec: baska betik tasisa da dislanir'; f = 'Get-RogueReport';  old = 'if ($older -and -not (Test-RogueMatch $rest))'; new = 'if ($older)' },
            @{ n = 'ust surec: yas kontrolu yok';             f = 'Get-RogueReport';    old = 'if ($older -and -not (Test-RogueMatch $rest))'; new = 'if (-not (Test-RogueMatch $rest))' },
            @{ n = 'ust surec: tam yol cikarilmiyor';         f = 'Get-RogueReport';    old = 'if ($selfPath) { $rest = [regex]::Replace($rest, ($bL + [regex]::Escape((ConvertTo-RogueFolded $selfPath)) + $bR), '''', $ROGUE_RXO) }'; new = '' },
            @{ n = 'ust surec: sinir yok (baska adin parcasi da cikarilir)'; f = 'Get-RogueReport'; old = '$bL = ''(?<=^|[\s"''''=])''; $bR = ''(?=$|[\s"''''])'''; new = '$bL = ''''; $bR = ''''' },
            @{ n = 'ust surec: yinelenen pid kaydinda da dislanir'; f = 'Get-RogueReport'; old = 'if ($ppAll.Count -eq 1) {'; new = 'if ($ppAll.Count -ge 1) {' },
            @{ n = 'ust surec: tarih okunamazsa ESKI sayilir'; f = 'Get-RogueReport';   old = 'if ($null -ne $p.CreationDate -and $null -ne $me.CreationDate -and [string]$p.CreationDate -ne '''' -and [string]$me.CreationDate -ne '''') {'; new = '$older = $true; if ($false) {' },
            @{ n = 'kendi pid yinelenirse de dislanir';       f = 'Get-RogueReport';    old = '$me = $(if ($meAll.Count -eq 1) { $meAll[0] } else { $null })'; new = '$me = $(if ($meAll.Count -ge 1) { $meAll[0] } else { $null })' },
            @{ n = 'liste ilk 64 surecle kirpilir';           f = 'Get-RogueReport';    old = '$list = @($procs | Where-Object { $null -ne $_ })'; new = '$list = @($procs | Where-Object { $null -ne $_ } | Select-Object -First 64)' },
            @{ n = 'pwsh.exe surecleri muaf';                 f = 'Get-RogueReport';    old = '$cls = Get-RogueClass ([string]$p.Name) $cl ([string]$p.ExecutablePath)'; new = '$cls = $(if ([string]$p.Name -ieq ''pwsh.exe'') { ''none'' } else { Get-RogueClass ([string]$p.Name) $cl ([string]$p.ExecutablePath) })' },
            @{ n = 'kanarya zayif (ad aranmaz)';              f = 'Get-RogueReport';    old = '$selfSeen = ((ConvertTo-RogueFolded ([string]$me.CommandLine)).IndexOf($selfLeaf, [StringComparison]::OrdinalIgnoreCase) -ge 0)'; new = '$selfSeen = $true' },
            @{ n = 'uzun komut satiri (>260) eslesmez';       f = 'Test-RogueMatch';    old = 'if (-not $cmdLine) { return $false }'; new = 'if (-not $cmdLine -or $cmdLine.Length -gt 260) { return $false }' },
            @{ n = 'okunamayan komut satiri sayilmiyor';      f = 'Get-RogueReport';    old = '$unreadable++'; new = '$null = 0' },
            @{ n = 'kapi: liste tabani (taranan<20) kaldirildi'; f = 'Get-RogueGateError'; old = 'if ([int]$rr.scanned -lt 20)'; new = 'if ($false)' },
            @{ n = 'ust surec: esit zamanli ust sayilir (-lt)'; f = 'Get-RogueReport';  old = '[datetime]$p.CreationDate -le [datetime]$me.CreationDate'; new = '[datetime]$p.CreationDate -lt [datetime]$me.CreationDate' },
            @{ n = 'ust surec: tarih bicimi bozuksa ESKI sayilir'; f = 'Get-RogueReport'; old = 'catch { $older = $false }'; new = 'catch { $older = $true }' },
            @{ n = 'baska oturumdaki surecler muaf';         f = 'Get-RogueReport';    old = 'if (($null -ne $me -and [int]$p.ProcessId -eq $selfPid) -or [int]$p.ProcessId -eq $parentPid) { continue }'; new = 'if (($null -ne $me -and [int]$p.ProcessId -eq $selfPid) -or [int]$p.ProcessId -eq $parentPid -or ($me -and $null -ne $p.SessionId -and $null -ne $me.SessionId -and [int]$p.SessionId -ne [int]$me.SessionId)) { continue }' },
            @{ n = 'dislanan kaydinda ad yerine TAM KOMUT SATIRI'; f = 'Get-RogueReport'; old = 'name = [string]$p.Name; why = ''ust-surec'''; new = 'name = [string]$p.CommandLine; why = ''ust-surec''' },
            @{ n = 'canlida python.exe muaf';                f = 'Get-RogueReport';    old = '$cls = Get-RogueClass ([string]$p.Name) $cl ([string]$p.ExecutablePath)'; new = '$cls = $(if ([string]$p.Name -ieq ''python.exe'') { ''none'' } else { Get-RogueClass ([string]$p.Name) $cl ([string]$p.ExecutablePath) })' },
            @{ n = 'katlama: U+0130 katlanmiyor';             f = 'ConvertTo-RogueFolded'; old = '.Replace([string][char]0x0130, ''I'')'; new = '' },
            @{ n = 'sinif: dizin dogrulamasi yok (ad yeter)'; f = 'Get-RogueClass';     old = 'if ($isViewerName -and $exePath) {'; new = 'if ($isViewerName) { return ''izleme'' }; if ($false) {' })
          $fmBad = New-Object System.Collections.Generic.List[string]
          foreach ($mu in $fmut) {
            $t = $fnText[$mu.f]; $ix = $t.IndexOf($mu.old)
            if ($ix -lt 0 -or $t.IndexOf($mu.old, $ix + 1) -ge 0) { $fmBad.Add($mu.n + ': mutasyon metni bulunamadi/tek degil'); continue }
            . ([scriptblock]::Create($t.Substring(0, $ix) + $mu.new + $t.Substring($ix + $mu.old.Length)))
            $mres = $true; try { $mres = [bool](Test-RogueClassifier) } catch { $mres = $false }
            . ([scriptblock]::Create($fnText[$mu.f]))
            if ($mres) { $fmBad.Add($mu.n + ': siniflandirici TRUE kaldi (mutasyon YAKALANMADI)') }
          }
          Assert $asserts ($fmut.Count.ToString() + ' fonksiyon mutasyonunun HEPSI yakalanir (siniflandirici FALSE)') ($fmBad.Count -eq 0 -and $fmut.Count -eq 27) ($fmBad -join ' ; ')
          # ---- duyarlilik (degisken mutasyonu): test gercekten olcuyor mu
          $sv = $ROGUE_VIEWERS; $ROGUE_VIEWERS = @(); $m1 = [bool](Test-RogueClassifier); $ROGUE_VIEWERS = $sv
          Assert $asserts 'mutasyon: izleme listesi bos -> siniflandirici testi FALSE' (-not $m1) ('sonuc=' + $m1)
          $sd = $ROGUE_VIEWER_DIRS; $ROGUE_VIEWER_DIRS = @($ROGUE_VIEWER_DIRS + 'D:\tmp'); $m2 = [bool](Test-RogueClassifier); $ROGUE_VIEWER_DIRS = $sd
          Assert $asserts 'mutasyon: guvenilir dizine D:\tmp eklendi -> FALSE' (-not $m2) ('sonuc=' + $m2)
          $so = $ROGUE_RXO; $ROGUE_RXO = [Text.RegularExpressions.RegexOptions]::None; $m3 = [bool](Test-RogueClassifier); $ROGUE_RXO = $so
          Assert $asserts 'mutasyon: eslesme harf DUYARLI -> FALSE' (-not $m3) ('sonuc=' + $m3)
          $sr = $ROGUE_RX; $ROGUE_RX = (@($ROGUE_TOKENS | Where-Object { $_ -cne 'smtp-sink' }) -join '|'); $m4 = [bool](Test-RogueClassifier); $ROGUE_RX = $sr
          Assert $asserts 'mutasyon: desenden smtp-sink dusuruldu -> FALSE' (-not $m4) ('sonuc=' + $m4)
          $sv = $ROGUE_VIEWERS; $ROGUE_VIEWERS = @($ROGUE_VIEWERS + 'less.exe'); $m5 = [bool](Test-RogueClassifier); $ROGUE_VIEWERS = $sv
          Assert $asserts 'mutasyon: less.exe izleme listesine eklendi -> FALSE' (-not $m5) ('sonuc=' + $m5)
          $sx = $ROGUE_ITEM_FLAGS; $ROGUE_ITEM_FLAGS = @($ROGUE_ITEM_FLAGS + '--token'); $m6 = [bool](Test-RogueClassifier); $ROGUE_ITEM_FLAGS = $sx
          Assert $asserts 'mutasyon: --token izinli bayraklara eklendi -> FALSE' (-not $m6) ('sonuc=' + $m6)
          $se = $ROGUE_ITEM_EXT; $ROGUE_ITEM_EXT = @($ROGUE_ITEM_EXT + '.key'); $m7 = [bool](Test-RogueClassifier); $ROGUE_ITEM_EXT = $se
          Assert $asserts 'mutasyon: .key izinli uzantilara eklendi -> FALSE' (-not $m7) ('sonuc=' + $m7)
          Assert $asserts 'mutasyonlardan sonra siniflandirici yeniden TRUE (durum geri yuklendi)' ([bool](Test-RogueClassifier)) ''
          Assert $asserts 'canli kanit dizinine dosya eklenmedi' ((Get-DirFileCount $LIVE_EVID_DIR) -eq $liveEvidBefore) ('once=' + $liveEvidBefore)
        }
        'gate-rogue-wiring' {
          # SUREC KOSMAZ. (1) STATIK: kapi zinciri BUTUNLUGU (Get-GateIntegrity: 15 fonksiyonun ve ROGUE_* atamalarinin tam metni, SelfTest
          # blogu, akisin 0-kapilar kesiti, fonksiyon kumesi, dinamik tanim/golge yasagi, mod degiskeni envanteri, AST cagri konumlari) pinle
          # TAM ESIT + 25 bilinen kacis biciminin her birinin olcumu degistirdigi (kopya betikte). (2) DINAMIK: CANLI dal ($TEST = $false)
          # enjekte edilen surec listesi saglayicisiyla kosulur (gercek surec listesine BAKILMAZ). Canli Win32_Process okumasi ve yukseltilmis
          # pencere yalniz canli SelfTest kontrolleriyle olculur. SINIR: olcumlerin disinda kalan KASITLI bir duzenlemeyi kanitlayamaz.
          $tok = $null; $perr = $null
          $ast = [System.Management.Automation.Language.Parser]::ParseFile($RELEASE, [ref]$tok, [ref]$perr)
          $src = $ast.Extent.Text
          $shaText = { param($t) return [BitConverter]::ToString([Security.Cryptography.SHA256]::Create().ComputeHash([Text.Encoding]::UTF8.GetBytes(([string]$t -replace "`r`n", "`n")))).Replace('-', '') }
          $cnt = { param($needle) return ([regex]::Matches($src, [regex]::Escape($needle))).Count }
          $allF = @($ast.FindAll({ param($n) $n -is [System.Management.Automation.Language.FunctionDefinitionAst] }, $false))
          $fn = @{}; foreach ($f in $allF) { $fn[$f.Name] = $f }
          # ---- BUTUNLUK: kapi zinciri pinle TAM ESIT (Get-GateIntegrity; degisiklik bu testi bilincli guncelletir, fark incelemede gorunur)
          $gi = Get-GateIntegrity $RELEASE
          $EXPI = [ordered]@{
            'parseErrors' = '0'
            'functionsTotal' = '46'
            'functionsTop' = '46'
            'functionsDuplicate' = ''
            'functionNamesSha' = '85289200B7B7E8A9600EA2395BD2282737F65A009624C17D4572310BE1E725ED'
            'fn:Say' = 'FE49505CF9B83BF88F2A9EA2700AB41F0BCC650BB7C6D726F5FF7BEC7C63EE81'
            'fn:Get-SimState' = 'EF43A7BFEC648E5D534C33666D151A95B55E5C4498216C5F2A6A1EB0E1A691F0'
            'fn:ConvertTo-RogueFolded' = '427D6E02B0548E2B444F160D0C4D457E1D09C3EA73DB2C068A15A21B75144E90'
            'fn:Get-RogueMatchInfo' = 'F6198C0BCA43351469270BF3C3BAC79F1AB3F2F5E2A8EFBA7B1F2032032A951D'
            'fn:Test-RogueMatch' = '96961F98EF6E62CF86DD3C81E0CF1EA75A5D4BD68119ABB94B66D200055D4CA6'
            'fn:Get-RogueClass' = '4914857ED7BD089D66E3BA10568E16D3BD49F4E50FAA9100DF1EB51009FBFFC2'
            'fn:Get-RogueItemName' = 'CB171E1B99D2E13561C9C2D9968650B44D09104363F1F1F1EEEB91D7F4929B57'
            'fn:Get-RogueReport' = '2471FFA601233926AF26B940C720A34D75C1B665F14CF191B2250C0BC1F8A7CE'
            'fn:Get-ProcList' = '2F4E1784AED02AE698D9DEF9F48A942C67828C39179F5ACD41A5391A8A4C2B4C'
            'fn:Get-LiveRogueReport' = 'D02AD46307453290F96B5FA9614BAD04EF5E70F6BD0AD8F8237F78DABB7263F5'
            'fn:Get-RogueCount' = '3C1226201D37ECFD7C677BEB76B44D9F85A324BC3A0C292030649F95CC2E7279'
            'fn:Get-RogueGateError' = 'B8846B8363C844E0D9D362319625123D55ED2F96C17107D0E12FBD2180C45A07'
            'fn:Write-RogueReport' = '7ECC7E1A9ED3E8B5A6271A1A9D7E5A63A873B57EB54296084286C6AB122A29EA'
            'fn:Invoke-RogueGate' = '763EBFFC6FF9B7E14BBB2FF5439C705951253C7C11CB58AA393EB9A1A85220D6'
            'fn:Test-RogueClassifier' = '37047681FE2FAB71D273D3F1A94E2AF06436198C1F83C4F8D14E442D1A96DBE1'
            'rogueAssignTop' = '9'
            'rogueAssignAll' = '9'
            'rogueAssignSha' = 'F039A6D72C59B2581CF92AF1AFEBDA216D205AC0A2A1B310A2D3624C406046E5'
            'selfPathAssign' = '[string]$PSCommandPath'
            'selfTestBlocks' = '1'
            'selfTestSha' = '2A0A2542FF726ED5F3EC9BD5C7C5EF0C130F5DBB8227017566DB42FA2EDB9681'
            'selfFailsAssign' = '$fails = 0'
            'selfFailsUnary' = 'PostfixPlusPlus'
            'selfClassifierLink' = '1'
            'selfJumps' = 'exit 1 | exit 0'
            'flowBlocks' = '1'
            'flowGateIndex' = '17'
            'flowSegmentSha' = '80F6CAA24B3B8B03E6355B4B340A7353D9DE6C5E5C9AE51E94A6AC6722F38FF5'
            'flowAfterGate' = 'Say ''--- 1) ADAY DOGRULAMA'''
            'flowPreGateJumps' = ''
            'gateCallCount' = '2'
            'gateSites' = 'akis -> if ($ge) { throw $ge } || selftest -> if ($ge) { Say (''  '' + $ge); $fails++ }'
            'geAssignAll' = '2'
            'dynamicUse' = 'tercih:PSCommandPath@<ust>,tercih:PSDefaultParameterValues@Get-ProcList'
            'exitSites' = '<ust>=8'
            'modeVarInventory' = '<ust>:FAULT=7;<ust>:SIM_STATE=3;<ust>:TEST=15;<ust>:TESTROOT=15;Get-LauncherTuple:TEST=1;Get-LiveRogueReport:TEST=2;Get-Pids:TEST=1;Get-ProcCommandLine:TEST=1;Get-ProcList:TEST=1;Get-RecoveryText:TEST=1;Get-RecoveryText:TESTROOT=1;Get-ServiceState:TEST=1;Get-SimState:SIM_STATE=1;Get-TaskAction:TEST=1;Get-TaskState:TEST=1;Http:TEST=1;Invoke-FaultPoint:FAULT=7;Invoke-FaultPoint:TEST=1;Invoke-StartTask:FAULT=3;Invoke-StartTask:TEST=1;Invoke-StopTask:FAULT=1;Invoke-StopTask:TEST=1;Set-SimState:SIM_STATE=1;Start-Both-And-Report:TEST=2;Test-Elevated:TEST=1;Test-InheritOnly:TEST=1;Wait-Stopped:TEST=1;Write-EvidenceProtected:DIZGI:FAULT=1;Write-EvidenceProtected:DIZGI:TESTROOT=1;Write-EvidenceProtected:FAULT=1;Write-EvidenceProtected:TEST=3;Write-EvidenceProtected:TESTROOT=1'
          }
          $iBad = New-Object System.Collections.Generic.List[string]
          foreach ($k in $EXPI.Keys) { if ([string]$gi[$k] -cne [string]$EXPI[$k]) { $v = [string]$gi[$k]; $iBad.Add($k + ' -> ' + $(if ($v.Length -gt 48) { $v.Substring(0, 48) + '...' } else { $v })) } }
          foreach ($k in $gi.Keys) { if (-not $EXPI.Contains($k)) { $iBad.Add('pinlenmemis olcum: ' + $k) } }
          Assert $asserts ('kapi zinciri butunlugu: ' + $EXPI.Count + ' olcum pinle TAM ESIT (15 fonksiyon metni, ROGUE_* atamalari, SelfTest blogu, akis 0-kapilar kesiti, fonksiyon kumesi, dinamik tanim, mod degiskeni envanteri, cagri konumlari)') ($iBad.Count -eq 0 -and $EXPI.Count -ge 30) ($iBad -join ' ; ')
          Assert $asserts 'yapisal: fonksiyonlar yalniz ust duzeyde ve tekil; dinamik tanim/golge YOK; $ge yalniz 2 kez atanir; kapidan once atlama YOK; ROGUE_* yalniz ust duzeyde atanir' (([string]$gi.functionsTotal -ceq [string]$gi.functionsTop) -and ([string]$gi.functionsDuplicate -ceq '') -and (@(([string]$gi.dynamicUse -split ',') | Where-Object { $_ -and (@('tercih:PSDefaultParameterValues@Get-ProcList', 'tercih:PSCommandPath@<ust>') -cnotcontains $_) }).Count -eq 0) -and ([string]$gi.geAssignAll -ceq '2') -and ([string]$gi.flowPreGateJumps -ceq '') -and ([string]$gi.rogueAssignAll -ceq [string]$gi.rogueAssignTop)) ('toplam=' + $gi.functionsTotal + ' ust=' + $gi.functionsTop + ' dinamik=[' + $gi.dynamicUse + '] ge=' + $gi.geAssignAll + ' rogue=' + $gi.rogueAssignAll + '/' + $gi.rogueAssignTop)
          Assert $asserts 'yapisal (AST): kapi cagri konumlari = akis -> throw, selftest -> $fails++' ([string]$gi.gateSites -ceq 'akis -> if ($ge) { throw $ge } || selftest -> if ($ge) { Say (''  '' + $ge); $fails++ }') ([string]$gi.gateSites)
          Assert $asserts 'yapisal (AST): SelfTest sayaci yalniz $fails = 0 ile baslar, yalniz ++ ile artar; atlamalar yalniz exit 1 | exit 0' (([string]$gi.selfFailsAssign -ceq '$fails = 0') -and ([string]$gi.selfFailsUnary -ceq 'PostfixPlusPlus') -and ([string]$gi.selfJumps -ceq 'exit 1 | exit 0')) ([string]$gi.selfFailsAssign + ' / ' + $gi.selfFailsUnary + ' / ' + $gi.selfJumps)
          Assert $asserts 'yapisal (AST): SelfTest siniflandirici sonucu sayaca bagli (if (-not $rcOk) { $fails++ } TEK); $ROGUE_SELF_PATH = [string]$PSCommandPath; dinamik/tercih kullanimi yalniz izinli iki yerde' (([string]$gi.selfClassifierLink -ceq '1') -and ([string]$gi.selfPathAssign -ceq '[string]$PSCommandPath') -and ([string]$gi.dynamicUse -ceq 'tercih:PSCommandPath@<ust>,tercih:PSDefaultParameterValues@Get-ProcList')) ('bag=' + $gi.selfClassifierLink + ' yol=' + $gi.selfPathAssign + ' dinamik=[' + $gi.dynamicUse + ']')
          # ---- butunluk DUYARLILIGI: bilinen kacis bicimlerinin HER BIRI olcumu degistirir (yayin betiginin gecici KOPYASI; betik KOSULMAZ)
          $src0 = [IO.File]::ReadAllText($RELEASE)
          $GFL = '$ge = Invoke-RogueGate; if ($ge) { throw $ge }'; $GST = '$ge = Invoke-RogueGate; if ($ge) { Say (''  '' + $ge); $fails++ }'; $ANC = 'function Get-Pids('; $NLx = "`n"
          $iMut = @(
            @{ n = 'akis kapisi yalniz TEST modunda (if ($TEST) sarmali)'; old = $GFL; new = ('if ($TEST) { ' + $GFL + ' }') },
            @{ n = 'akis kapisi try/catch ile canlida yutulur'; old = $GFL; new = ('try { ' + $GFL + ' } catch { if ($TEST) { throw } }') },
            @{ n = 'akis: $ge canlida ezilir'; old = $GFL; new = '$ge = Invoke-RogueGate; if (-not $TEST) { $ge = '''' }; if ($ge) { throw $ge }' },
            @{ n = 'akis: kapidan once return'; old = $GFL; new = ('if (-not $TEST) { return }; ' + $GFL) },
            @{ n = 'SelfTest kapisi if ($false) icinde'; old = $GST; new = ('if ($false) { ' + $GST + ' }') },
            @{ n = 'SelfTest kapi sonucu atilir (tam metin yorumda)'; old = $GST; new = ('$null = Invoke-RogueGate # ' + $GST) },
            @{ n = 'SelfTest $fails = -1 ile baslar'; old = '$fails = 0'; new = '$fails = -1' },
            @{ n = 'SelfTest kapidan once exit 0'; old = $GST; new = ('exit 0; ' + $GST) },
            @{ n = 'SelfTest kapi hatasi geri alinir ($fails--)'; old = $GST; new = '$ge = Invoke-RogueGate; if ($ge) { Say (''  '' + $ge); $fails++; $fails-- }' },
            @{ n = 'SelfTest FAIL cikisi yorumda'; old = 'if ($fails -ne 0) { exit 1 }'; new = '# if ($fails -ne 0) { exit 1 }' },
            @{ n = 'SelfTest siniflandirici sayaca bagli degil'; old = 'if (-not $rcOk) { $fails++ }'; new = '# if (-not $rcOk) { $fails++ }' },
            @{ n = 'Get-CimInstance golge fonksiyonu'; old = $ANC; new = ('function Get-CimInstance { return @() }' + $NLx + $ANC) },
            @{ n = 'Invoke-RogueGate alias golgesi (canlida)'; old = $ANC; new = ('if (-not $TEST) { Set-Alias Invoke-RogueGate Get-Date }' + $NLx + $ANC) },
            @{ n = 'ic ice fonksiyon tanimi (Get-RogueGateError yeniden)'; old = $ANC; new = ('function Get-Pids0 { function Get-RogueGateError($rr) { return '''' } }' + $NLx + $ANC) },
            @{ n = 'Set-Variable ile $ROGUE_RX ezilir (canlida)'; old = $ANC; new = ('if (-not $TEST) { Set-Variable -Name ROGUE_RX -Value zzz -Scope Script }' + $NLx + $ANC) },
            @{ n = 'scriptblock icinde yeniden tanim (canlida)'; old = $ANC; new = ('if (-not $TEST) { . { function Get-RogueGateError($rr) { return '''' } } }' + $NLx + $ANC) },
            @{ n = 'Get-Variable ile mod okunur'; old = $ANC; new = ('$zz = Get-Variable -Name TEST -ValueOnly' + $NLx + $ANC) },
            @{ n = 'Invoke-Expression'; old = $ANC; new = ('Invoke-Expression $env:ZZ' + $NLx + $ANC) },
            @{ n = '$ExecutionContext ile dinamik kod'; old = $ANC; new = ('$null = $ExecutionContext.InvokeCommand.InvokeScript(''1'')' + $NLx + $ANC) },
            @{ n = 'function: surucusu ile tanim'; old = $ANC; new = ('$null = New-Item -Path ''function:Get-RogueGateError'' -Value { '''' } -Force' + $NLx + $ANC) },
            @{ n = 'kanitta rogue ogeleri canlida silinir'; old = 'health = $script:health'; new = 'health = $(if (-not $TEST -and $script:health.rogue) { $script:health.rogue.items = @() }; $script:health)' },
            @{ n = 'yeni canli/test ayrimi ($TestRoot)'; old = $ANC; new = ('if ($TestRoot -eq '''') { $ROGUE_SELF_PATH = '''' }' + $NLx + $ANC) },
            @{ n = 'fonksiyon icinde $script:ROGUE_* atamasi'; old = 'function Write-RogueReport($rr) {'; new = ('function Write-RogueReport($rr) {' + $NLx + '  $script:ROGUE_SELF_PATH = ''r27-''') },
            @{ n = 'Write-RogueReport canlida raporu sifirlar'; old = 'function Write-RogueReport($rr) {'; new = ('function Write-RogueReport($rr) {' + $NLx + '  if (-not $TEST) { $rr.count = 0 }') },
            @{ n = '$ROGUE_RXO RightToLeft'; old = '$ROGUE_RXO = [Text.RegularExpressions.RegexOptions]''IgnoreCase, CultureInvariant'''; new = '$ROGUE_RXO = [Text.RegularExpressions.RegexOptions]''IgnoreCase, CultureInvariant, RightToLeft''' },
            @{ n = 'betik duzeyinde $PSDefaultParameterValues ile liste daraltma'; old = $ANC; new = ('$PSDefaultParameterValues = @{ ''Get-CimInstance:Filter'' = (''ProcessId='' + $PID) }' + $NLx + $ANC) },
            @{ n = 'Get-ProcList yerel varsayilan sifirlamasi kaldirildi'; old = '  $PSDefaultParameterValues = @{}'; new = '' },
            @{ n = '${function:} ile ortam kosullu yeniden tanim'; old = $ANC; new = ('if ($env:R27_ZZ -eq ''1'') { ${function:Get-RogueGateError} = { param($rr) '''' } }' + $NLx + $ANC) },
            @{ n = 'Set-Stage icinde exit (kapidan sonraki asamada)'; old = 'function Set-Stage([string]$s) { $script:STAGE = $s;'; new = 'function Set-Stage([string]$s) { if ($s -eq ''1-yedek'') { exit 0 }; $script:STAGE = $s;' },
            @{ n = 'min: Set-Alias (yalniz dinamik kullanim)'; old = $ANC; new = ('Set-Alias zzAlias Get-Date' + $NLx + $ANC) },
            @{ n = 'min: Set-Variable'; old = $ANC; new = ('Set-Variable -Name zzVar -Value 1' + $NLx + $ANC) },
            @{ n = 'min: Get-Variable'; old = $ANC; new = ('$null = Get-Variable -Name zzVar -ErrorAction SilentlyContinue' + $NLx + $ANC) },
            @{ n = 'min: Invoke-Expression'; old = $ANC; new = ('Invoke-Expression ''1''' + $NLx + $ANC) },
            @{ n = 'min: function: surucusu (New-Item)'; old = $ANC; new = ('$null = New-Item -Path ''function:zzFn'' -Value { 1 } -Force' + $NLx + $ANC) },
            @{ n = 'min: ${function:} surucu degiskeni'; old = $ANC; new = ('${function:zzFn} = { 1 }' + $NLx + $ANC) },
            @{ n = 'min: $ExecutionContext'; old = $ANC; new = ('$null = $ExecutionContext' + $NLx + $ANC) },
            @{ n = 'min: [scriptblock] turu'; old = $ANC; new = ('$null = [scriptblock]' + $NLx + $ANC) },
            @{ n = 'olcum: yeni ust duzey ROGUE_* atamasi'; old = $ANC; new = ('$ROGUE_ZZ = 1' + $NLx + $ANC) },
            @{ n = 'olcum: $ROGUE_SELF_PATH ifadesi degisti'; old = '$ROGUE_SELF_PATH = [string]$PSCommandPath'; new = '$ROGUE_SELF_PATH = [string]$PSCommandPath + ''''' },
            @{ n = 'olcum: ikinci if ($SelfTest) blogu'; old = $ANC; new = ('if ($SelfTest) { }' + $NLx + $ANC) },
            @{ n = 'olcum: akis 0-kapilar kesitinin basi degisti'; old = "    Set-Stage '0-kapilar'"; new = ('    $null = 0' + $NLx + "    Set-Stage '0-kapilar'") },
            @{ n = 'olcum: kapidan sonraki deyim degisti'; old = $GFL; new = ($GFL + '; $null = 0') },
            @{ n = 'olcum: ucuncu Invoke-RogueGate cagrisi'; old = $ANC; new = ('$zzg = Invoke-RogueGate' + $NLx + $ANC) })
          $imDir = Join-Path $GATE_ROOT 'integrity-mut'; New-Item -ItemType Directory -Force -Path $imDir | Out-Null
          $imFile = Join-Path $imDir 'r27-release.ps1'
          $imBad = New-Object System.Collections.Generic.List[string]
          $cov = @{}; foreach ($k in $EXPI.Keys) { $cov[$k] = 0 }
          foreach ($m in $iMut) {
            $ix = $src0.IndexOf($m.old)
            if ($ix -lt 0 -or $src0.IndexOf($m.old, $ix + 1) -ge 0) { $imBad.Add($m.n + ': metin bulunamadi/tek degil'); continue }
            [IO.File]::WriteAllText($imFile, ($src0.Substring(0, $ix) + $m.new + $src0.Substring($ix + $m.old.Length)), (New-Object Text.UTF8Encoding($false)))
            $gm = Get-GateIntegrity $imFile
            if ([string]$gm.parseErrors -cne '0') { $imBad.Add($m.n + ': kopya parse hatasi'); continue }
            $diff = @($EXPI.Keys | Where-Object { [string]$gm[$_] -cne [string]$EXPI[$_] })
            foreach ($k in $diff) { $cov[$k]++ }
            if ($diff.Count -eq 0) { $imBad.Add($m.n + ': butunluk olcumu DEGISMEDI (kacis YAKALANMADI)') }
            elseif ($m.n -like 'min:*' -and ($diff -join ',') -cne 'dynamicUse') { $imBad.Add($m.n + ': yalniz dynamicUse degismeliydi, degisen=[' + ($diff -join ',') + ']') }
          }
          Assert $asserts ('butunluk duyarliligi: ' + $iMut.Count + ' kacis biciminin HER BIRI olcumu degistirir (kopya betikte; min: bicimleri YALNIZ dinamik-kullanim olcumunu degistirir)') ($imBad.Count -eq 0 -and $iMut.Count -eq 43) ($imBad -join ' ; ')
          # fonksiyon metni olcumleri: her kapi fonksiyonunun govdesine zararsiz bir deyim eklenince YALNIZ o fonksiyonun olcumu degismeli
          $fpBad = New-Object System.Collections.Generic.List[string]
          $astS = [System.Management.Automation.Language.Parser]::ParseInput($src0, [ref]$null, [ref]$null)
          foreach ($k in @($EXPI.Keys | Where-Object { $_ -like 'fn:*' })) {
            $nm = $k.Substring(3); $d = @($astS.EndBlock.Statements | Where-Object { $_ -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $_.Name -ceq $nm })
            if ($d.Count -ne 1) { $fpBad.Add($nm + ': tanim adedi ' + $d.Count); continue }
            $at = $d[0].Body.Extent.StartOffset + 1
            [IO.File]::WriteAllText($imFile, ($src0.Substring(0, $at) + ' $null = $null; ' + $src0.Substring($at)), (New-Object Text.UTF8Encoding($false)))
            $gm = Get-GateIntegrity $imFile
            $diff = @($EXPI.Keys | Where-Object { [string]$gm[$_] -cne [string]$EXPI[$_] })
            foreach ($x in $diff) { $cov[$x]++ }
            if (($diff -join ',') -cne $k) { $fpBad.Add($nm + ': degisen=[' + ($diff -join ',') + ']') }
          }
          Assert $asserts 'olcum duyarliligi: her kapi fonksiyonunun metin olcumu YALNIZ kendi degisikliginde degisir (15 fonksiyon)' ($fpBad.Count -eq 0 -and @($EXPI.Keys | Where-Object { $_ -like 'fn:*' }).Count -eq 15) ($fpBad -join ' ; ')
          $uncov = @($EXPI.Keys | Where-Object { $_ -cne 'parseErrors' -and $cov[$_] -eq 0 })
          Assert $asserts 'olcum kapsami: parseErrors disindaki HER olcum en az bir kacis/olcum denemesiyle tetiklendi (sabitlenmis ya da kor olcum yok)' ($uncov.Count -eq 0) ('tetiklenmeyen=[' + ($uncov -join ',') + ']')
          $calls = @($ast.FindAll({ param($n) $n -is [System.Management.Automation.Language.CommandAst] -and $n.GetCommandName() -eq 'Invoke-RogueGate' }, $true) | Sort-Object { $_.Extent.StartOffset })
          $selfIf = @($ast.EndBlock.Statements | Where-Object { $_ -is [System.Management.Automation.Language.IfStatementAst] -and $_.Clauses[0].Item1.Extent.Text -ceq '$SelfTest' })
          Assert $asserts 'Invoke-RogueGate TAM 2 yerde cagrilir; ust duzey if ($SelfTest) blogu TEK' ($calls.Count -eq 2 -and $selfIf.Count -eq 1) ('cagri=' + $calls.Count + ' selfIf=' + $selfIf.Count)
          if ($calls.Count -eq 2 -and $selfIf.Count -eq 1) {
            $sb = $selfIf[0].Extent; $c1 = $calls[0].Extent.StartOffset; $c2 = $calls[1].Extent.StartOffset
            $stage0 = $src.IndexOf("Set-Stage '0-kapilar'", $sb.EndOffset); $cand0 = $src.IndexOf("Say '--- 1) ADAY DOGRULAMA'", $sb.EndOffset)
            $stop0 = $src.IndexOf('Invoke-StopTask', $sb.EndOffset)
            Assert $asserts 'ilk cagri SelfTest blogunun ICINDE' ($c1 -gt $sb.StartOffset -and $c1 -lt $sb.EndOffset) ''
            Assert $asserts 'ikinci cagri yayin akisinda: 0-kapilar asamasindan SONRA, ADAY DOGRULAMA ve ilk durdurmadan ONCE' ($stage0 -gt 0 -and $cand0 -gt 0 -and $stop0 -gt 0 -and $c2 -gt $stage0 -and $c2 -lt $cand0 -and $c2 -lt $stop0) ('stage0=' + $stage0 + ' cagri=' + $c2 + ' aday=' + $cand0 + ' durdur=' + $stop0)
            $selfText = $sb.Text
            Assert $asserts 'SelfTest baglantisi: kapi hatasi $fails sayacini artirir (tam metin, tek)' ((& $cnt '$ge = Invoke-RogueGate; if ($ge) { Say (''  '' + $ge); $fails++ }') -eq 1 -and $selfText.Contains('$ge = Invoke-RogueGate; if ($ge) { Say (''  '' + $ge); $fails++ }')) ''
            Assert $asserts 'yayin akisi baglantisi: kapi hatasi throw eder (tam metin, tek)' ((& $cnt '$ge = Invoke-RogueGate; if ($ge) { throw $ge }') -eq 1) ''
            $f0 = [regex]::Matches($selfText, '\$fails\s*=(?!=)'); $gateInSelf = $selfText.IndexOf('$ge = Invoke-RogueGate')
            Assert $asserts 'SelfTest: $fails yalniz BIR kez (kapidan ONCE) sifirlanir; FAIL cikisi 1' ($f0.Count -eq 1 -and $f0[0].Index -lt $gateInSelf -and $selfText.Contains('if ($fails -ne 0) { exit 1 }')) ('atama=' + $f0.Count)
            Assert $asserts 'SelfTest: siniflandirici oz-testi de sayaca bagli' ($selfText.Contains('$rcOk = Test-RogueClassifier;') -and $selfText.Contains('if (-not $rcOk) { $fails++ }')) ''
          }
          $usesTest = { param($name) return @($fn[$name].Body.FindAll({ param($n) $n -is [System.Management.Automation.Language.VariableExpressionAst] -and $n.VariablePath.UserPath -ieq 'TEST' }, $true)).Count }
          Assert $asserts 'karar fonksiyonlari $TEST okumaz (Get-RogueGateError, Invoke-RogueGate, Get-RogueReport); $TEST yalniz saglayici + rapor etiketinde' ((& $usesTest 'Get-RogueGateError') -eq 0 -and (& $usesTest 'Invoke-RogueGate') -eq 0 -and (& $usesTest 'Get-RogueReport') -eq 0 -and (& $usesTest 'Get-ProcList') -ge 1) ''
          $cim = @($ast.FindAll({ param($n) $n -is [System.Management.Automation.Language.CommandAst] -and $n.GetCommandName() -eq 'Get-CimInstance' -and $n.Extent.Text -match 'Win32_Process' }, $true))
          $cimIn = @($cim | Where-Object { $_.Extent.StartOffset -ge $fn['Get-ProcList'].Extent.StartOffset -and $_.Extent.EndOffset -le $fn['Get-ProcList'].Extent.EndOffset })
          Assert $asserts 'canli surec listesi okumasi (Win32_Process, filtresiz) Get-ProcList icinde TEK' ($cimIn.Count -eq 1 -and $cimIn[0].Extent.Text -ceq 'Get-CimInstance -ClassName Win32_Process') ('toplam=' + $cim.Count + ' saglayicida=' + $cimIn.Count)
          Assert $asserts 'health.rogue yalniz Invoke-RogueGate icinde atanir (2 atama: rapor + okuma hatasi)' ((& $cnt '$script:health.rogue =') -eq 2 -and ([regex]::Matches($fn['Invoke-RogueGate'].Extent.Text, [regex]::Escape('$script:health.rogue ='))).Count -eq 2) ''
          # ---- DINAMIK: canli dal, enjekte saglayici
          $wantV = @('$ROGUE_TOKENS', '$ROGUE_RX', '$ROGUE_RXO', '$ROGUE_VIEWERS', '$ROGUE_VIEWER_DIRS', '$ROGUE_SHELLS', '$ROGUE_ITEM_EXT', '$ROGUE_ITEM_FLAGS')
          $wantF = @('ConvertTo-RogueFolded', 'Get-RogueMatchInfo', 'Test-RogueMatch', 'Get-RogueClass', 'Get-RogueItemName', 'Get-RogueReport', 'Get-LiveRogueReport', 'Get-RogueGateError', 'Write-RogueReport', 'Invoke-RogueGate')
          foreach ($a in @($ast.FindAll({ param($n) $n -is [System.Management.Automation.Language.AssignmentStatementAst] -and ($wantV -contains $n.Left.Extent.Text) }, $false))) { . ([scriptblock]::Create($a.Extent.Text)) }
          foreach ($k in $wantF) { . ([scriptblock]::Create($fn[$k].Extent.Text)) }
          $TEST = $false
          $ROGUE_SELF_PATH = 'D:\repo\project\docs\governance\client-release-r27-r01\scripts\r27-release.ps1'
          # ---- GERCEK Get-ProcList (canli dal): SAHTE Get-CimInstance (gelismis fonksiyon; gercek CIM cagrilmaz) + ETKIN $PSDefaultParameterValues
          #      ('Get-CimInstance:Filter') ile liste DARALMAZ; yerel sifirlama kaldirilinca daralir (testin olctugunun kaniti).
          . ([scriptblock]::Create($fn['Get-ProcList'].Extent.Text))
          $cimNames = @('node.exe', 'powershell.exe', 'pwsh.exe', 'python.exe', 'cmd.exe', 'bash.exe', 'tail.exe', 'svchost.exe', 'System', 'conhost.exe')
          $script:CIM_LIST = @(for ($k = 0; $k -lt 30; $k++) { New-Object psobject -Property @{ ProcessId = 400 + $k; Name = $cimNames[$k % $cimNames.Count] } })
          function Get-CimInstance { [CmdletBinding()] param([string]$ClassName, [string]$Filter) if ($Filter) { return @($script:CIM_LIST | Select-Object -First 1) }; if ($ClassName -cne 'Win32_Process') { return @() }; return @($script:CIM_LIST) }
          $savedPD = $PSDefaultParameterValues
          $PSDefaultParameterValues = @{ 'Get-CimInstance:Filter' = 'ProcessId=1' }
          $cDirect = @(Get-CimInstance -ClassName Win32_Process).Count; $realList = @(Get-ProcList); $cReal = $realList.Count
          $samePids = ((@($realList | ForEach-Object { [int]$_.ProcessId }) -join ',') -ceq (@($script:CIM_LIST | ForEach-Object { [int]$_.ProcessId }) -join ','))
          . ([scriptblock]::Create(($fn['Get-ProcList'].Extent.Text).Replace('$PSDefaultParameterValues = @{}', ''))); $cMut = @(Get-ProcList).Count
          $PSDefaultParameterValues = $savedPD
          Remove-Item -LiteralPath function:\Get-CimInstance -ErrorAction SilentlyContinue
          Assert $asserts 'GERCEK Get-ProcList (canli dal, sahte CIM; 10 farkli goruntu adi): liste AYNEN doner (30/30, pid sirasi esit; ad bazli suzme yok); etkin Get-CimInstance:Filter varsayilani DARALTMAZ; sifirlama kaldirilinca daralir (1)' ($cDirect -eq 1 -and $cReal -eq 30 -and $samePids -and $cMut -eq 1) ('dogrudan=' + $cDirect + ' gercek=' + $cReal + ' pid-esit=' + $samePids + ' sifirlamasiz=' + $cMut)
          $script:WIRE_LIST = @(); $script:WIRE_THROW = $false
          function Get-ProcList { if ($script:WIRE_THROW) { throw (New-Object InvalidOperationException 'saglayici hatasi (enjekte)') }; return @($script:WIRE_LIST) }
          $script:health = [ordered]@{}
          $t0w = [datetime]'2026-01-01T00:00:00Z'
          $mkW = { param($i, $pp, $sec, $n, $c, $x) New-Object psobject -Property @{ ProcessId = $i; ParentProcessId = $pp; CreationDate = $t0w.AddSeconds($sec); Name = $n; CommandLine = $c; ExecutablePath = $x } }
          $wSelf = (& $mkW ([int]$PID) 99 10 'powershell.exe' ('powershell.exe -NoProfile -File ' + $ROGUE_SELF_PATH) 'C:\w\powershell.exe')
          $wParent = (& $mkW 99 1 0 'powershell.exe' 'powershell.exe' 'C:\w\powershell.exe')
          $wOther = (& $mkW 5003 1 5 'node.exe' 'node D:\app\server.js' 'C:\n\node.exe')
          $wTail = (& $mkW 5002 1 5 'tail.exe' 'tail -f D:\x\r27-izleme.log' (Join-Path $env:ProgramFiles 'Git\usr\bin\tail.exe'))
          $wNode = (& $mkW 5001 1 5 'node.exe' 'node D:\g\d5-portal-reset-live-run.js' 'C:\n\node.exe')
          $wSelfBlind = (& $mkW ([int]$PID) 99 10 'powershell.exe' '' '')
          $wPad = @(for ($k = 0; $k -lt 20; $k++) { & $mkW (600 + $k) 1 5 'svchost.exe' ('svchost.exe -k w' + $k) 'C:\Windows\System32\svchost.exe' })
          $script:WIRE_LIST = @($wSelf, $wParent, $wOther) + $wPad; $g1 = Invoke-RogueGate; $h1 = $script:health.rogue
          Assert $asserts 'canli dal: temiz liste -> kapi GECER (simulated=false, kendi sureci goruldu, ust surec dislandi)' ($g1 -ceq '' -and [int]$h1.count -eq 0 -and (-not [bool]$h1.simulated) -and [bool]$h1.selfSeen -and [int]$h1.scanned -eq 23 -and @($h1.excluded).Count -eq 1) ('hata=[' + $g1 + '] taranan=' + $h1.scanned)
          $script:WIRE_LIST = @($wSelf, $wParent, $wOther, $wTail) + $wPad; $g2 = Invoke-RogueGate; $h2 = $script:health.rogue
          Assert $asserts 'canli dal: YALNIZ izleme goruntuleyicisi -> DUR (izleme dahil 1 eslesme)' ($g2 -match 'test/prova sureci var \(izleme dahil 1 eslesme\)' -and [int]$h2.viewers -eq 1 -and [int]$h2.testApp -eq 0) ('hata=[' + $g2 + ']')
          $script:WIRE_LIST = @($wSelf, $wParent, $wOther, $wNode) + $wPad; $g3 = Invoke-RogueGate; $h3 = $script:health.rogue
          Assert $asserts 'canli dal: kosucu sureci -> DUR (izleme dahil 1 eslesme; test-uygulama=1)' ($g3 -match 'test/prova sureci var \(izleme dahil 1 eslesme\)' -and [int]$h3.testApp -eq 1) ('hata=[' + $g3 + ']')
          $script:WIRE_LIST = @($wParent, $wOther) + $wPad; $g4 = Invoke-RogueGate
          Assert $asserts 'canli dal: listede kendi sureci YOK -> DUR (liste guvenilir degil)' ($g4 -match 'kendi surecini/komut satirini goremedi') ('hata=[' + $g4 + ']')
          $script:WIRE_LIST = @($wSelfBlind, $wParent, $wOther) + $wPad; $g5 = Invoke-RogueGate
          Assert $asserts 'canli dal: kendi komut satiri OKUNAMIYOR -> DUR (liste guvenilir degil)' ($g5 -match 'kendi surecini/komut satirini goremedi') ('hata=[' + $g5 + ']')
          $script:WIRE_LIST = @($wSelf, $wParent, $wOther); $g5b = Invoke-RogueGate
          Assert $asserts 'canli dal: DARALTILMIS liste (taranan=3 < 20; kendi sureci gorunse de) -> DUR (liste eksik)' ($g5b -match 'surec listesi eksik \(taranan=3 < 20') ('hata=[' + $g5b + ']')
          $script:WIRE_LIST = @(); $g6 = Invoke-RogueGate
          Assert $asserts 'canli dal: bos liste -> DUR (taranan=0)' ($g6 -match 'taranamadi \(taranan=0\)') ('hata=[' + $g6 + ']')
          $script:WIRE_THROW = $true; $g7 = Invoke-RogueGate; $h7 = $script:health.rogue; $script:WIRE_THROW = $false
          Assert $asserts 'canli dal: saglayici istisnasi -> DUR (surec listesi okunamadi) + kanitta hata turu' ($g7 -match 'surec listesi okunamadi \(InvalidOperationException\)' -and [string]$h7.error -ceq 'InvalidOperationException') ('hata=[' + $g7 + ']')
          $TEST = $true; $script:WIRE_LIST = @($wOther); $g8 = Invoke-RogueGate; $h8 = $script:health.rogue
          $script:WIRE_LIST = @($wOther, $wTail); $g9 = Invoke-RogueGate; $TEST = $false
          Assert $asserts 'simulator etiketi: kendi sureci listede olmasa da temiz liste gecer; eslesme varsa yine DUR' ($g8 -ceq '' -and [bool]$h8.simulated -and $g9 -match 'izleme dahil 1 eslesme') ('g8=[' + $g8 + '] g9=[' + $g9 + ']')
          Remove-Item -LiteralPath function:\Get-ProcList -ErrorAction SilentlyContinue
          Assert $asserts 'canli kanit dizinine dosya eklenmedi' ((Get-DirFileCount $LIVE_EVID_DIR) -eq $liveEvidBefore) ('once=' + $liveEvidBefore)
        }
      }
    } else {
      # ---------------------------------------------------------- ISLEVSEL SENARYOLAR
      if ($sc -eq 'rollback-script') {
        # happy-path'in biraktigi durum: canli = aday, yedekler TestRoot\evidence altinda. Yoksa pristine'den kur.
        $bkApi = $null; $bkWeb = $null
        if ($lastHappyEvidence -and (Test-Path -LiteralPath $lastHappyEvidence.api.backup) -and (Test-Path -LiteralPath $lastHappyEvidence.web.backup)) {
          $bkApi = $lastHappyEvidence.api.backup; $bkWeb = $lastHappyEvidence.web.backup
          Say ('  happy-path yedekleri kullaniliyor: ' + $bkApi + ' | ' + $bkWeb)
        } else {
          Reset-TestRoot $sc
          Mirror $C_API $T_LIVE; Mirror (Join-Path $C_WEB '.next') $T_LIVE_NEXT; Copy-Item -LiteralPath (Join-Path $C_WEB 'next.config.js') -Destination $T_LIVE_CFG -Force
          $bkApi = Join-Path $T_EVID 'rollback-api-src-R26-harness'; $bkWeb = Join-Path $T_EVID 'rollback-web-R26-harness'
          Mirror $P_API $bkApi; Mirror (Join-Path $P_WEB '.next') (Join-Path $bkWeb '.next'); Copy-Item -LiteralPath (Join-Path $P_WEB 'next.config.js') -Destination (Join-Path $bkWeb 'next.config.js') -Force
          Say '  happy-path yok: canli=aday ve yedekler pristine''den kuruldu'
        }
        $pre = Get-LiveDigests
        Assert $asserts 'on-durum canli=aday' ($pre.api -ceq $EXP_CAND -and $pre.web -ceq $EXP_WEB_CAND) ('api=' + $pre.api.Substring(0, 8) + ' web=' + $pre.web.Substring(0, 8))
        $rs = Run-Script $ROLLBACK @('-BackupApiDir', (Q $bkApi), '-BackupWebDir', (Q $bkWeb), '-TestRoot', (Q $TESTROOT), '-SelfTest') (Join-Path $scDir 'stdout-selftest.txt')
        Assert $asserts 'rollback -SelfTest (TestRoot) cikis 0' ($rs.rc -eq 0) ('rc=' + $rs.rc)
        $r = Run-Script $ROLLBACK @('-BackupApiDir', (Q $bkApi), '-BackupWebDir', (Q $bkWeb), '-TestRoot', (Q $TESTROOT)) (Join-Path $scDir 'stdout.txt')
      } else {
        Reset-TestRoot $sc
        $argList = @('-TestRoot', (Q $TESTROOT)); if ($sc -ne 'happy-path') { $argList += @('-Fault', $sc) }
        $r = Run-Script $RELEASE $argList (Join-Path $scDir 'stdout.txt')
      }
      Assert $asserts 'cikis kodu' ($r.rc -eq $exp.exit) ('beklenen ' + $exp.exit + ' olculen ' + $r.rc)
      $evPath = Find-EvidencePath $r.out
      Assert $asserts 'kanit JSON yazildi (KANIT: satiri)' ($null -ne $evPath) $(if ($evPath) { $evPath.path } else { 'YOK' })
      if ($evPath) {
        Assert $asserts 'kanit dosyasi mevcut ve sha esit' ((Test-Path -LiteralPath $evPath.path) -and ((Sha $evPath.path) -ceq $evPath.sha)) $evPath.sha.Substring(0, 16)
        Assert $asserts 'kanit TestRoot\evidence altinda' ($evPath.path.StartsWith($T_EVID, [StringComparison]::OrdinalIgnoreCase)) $evPath.path
        $ev = Get-Content -Raw -LiteralPath $evPath.path | ConvertFrom-Json
        $evCopy = Join-Path $scDir (Split-Path -Leaf $evPath.path); Copy-Item -LiteralPath $evPath.path -Destination $evCopy -Force
        Assert $asserts 'verdict' ($ev.verdict -ceq $exp.verdict) ('beklenen ' + $exp.verdict + ' olculen ' + $ev.verdict)
        Assert $asserts 'kanit exitCode == surec cikisi' ([int]$ev.exitCode -eq $r.rc) ('json=' + $ev.exitCode + ' rc=' + $r.rc)
        Assert $asserts 'kanit testMode.enabled' ([bool]$ev.testMode.enabled) ('testRoot=' + $ev.testMode.testRoot)
        if ($exp.failedAt -ne '') { Assert $asserts 'failedAt asamasi' ([string]$ev.failedAt -ceq $exp.failedAt) ('beklenen ' + $exp.failedAt + ' olculen ' + $ev.failedAt) }
        else { Assert $asserts 'failedAt bos' ([string]$ev.failedAt -eq '') ('olculen ' + $ev.failedAt) }
        Assert $asserts 'stage alani 7-kanit DEGIL (son gercek asama)' ([string]$ev.stage -cne '7-kanit' -and [string]$ev.stage -ne '') ('stage=' + $ev.stage)
        Assert $asserts 'stages listesi dolu' (@($ev.stages).Count -ge 2) ('adet=' + @($ev.stages).Count)
        if ($exp.recovery) {
          Assert $asserts 'kurtarma talimati var (B3 komutu + tam yollar)' ($null -ne $ev.recovery -and (($ev.recovery -join ' ') -match 'r27-rollback\.ps1' ) -and (($ev.recovery -join ' ') -match '-BackupApiDir')) (($ev.recovery -join ' | ').Substring(0, [Math]::Min(160, ($ev.recovery -join ' | ').Length)))
          Assert $asserts 'verify.mismatches dolu' (@($ev.verify.mismatches).Count -ge 1) (($ev.verify.mismatches -join ' ; '))
          Assert $asserts 'rollback.servicesStarted=false' (-not [bool]$ev.rollback.servicesStarted) ('servicesStarted=' + $ev.rollback.servicesStarted)
          Assert $asserts 'stdout KURTARMA satiri' ($r.out -match '(?m)^KURTARMA: ') ''
          if ($exp.unreadable) {
            Assert $asserts 'verify OKUNAMADI (kalici okuma hatasi: agac+paket+web)' (([string]$ev.verify.apiTree).StartsWith('OKUNAMADI') -and ([string]$ev.verify.pkg).StartsWith('OKUNAMADI') -and ([string]$ev.verify.webTree).StartsWith('OKUNAMADI')) ('apiTree=' + ([string]$ev.verify.apiTree).Substring(0, [Math]::Min(40, ([string]$ev.verify.apiTree).Length)))
            Assert $asserts 'faultLog: kalici fault 4-kimlik + R-dogrula (>=2 kayit)' (@($ev.testMode.faultLog).Count -ge 2) (($ev.testMode.faultLog -join ' ; '))
            Assert $asserts 'restoreSteps hepsi TAMAM (dosyalar geri yuklendi, yalniz OLCUM basarisiz)' (@($ev.restoreSteps.PSObject.Properties | Where-Object { -not ([string]$_.Value).StartsWith('TAMAM') }).Count -eq 0) ''
          }
        } elseif ($exp.exit -eq 10) {
          Assert $asserts 'verify.ok=true (geri yuklenen kimlik dogrulandi)' ([bool]$ev.verify.ok) ('mismatches=' + @($ev.verify.mismatches).Count)
          Assert $asserts 'rollback.servicesStarted=true (yalniz dogrulama sonrasi)' ([bool]$ev.rollback.servicesStarted) ''
          Assert $asserts 'rollback.postStart.ok=true (B3 saglik kumesi: pid==1, 401x3, buildManifest, kok, uclu)' ([bool]$ev.rollback.postStart.ok) ('authMe=' + $ev.rollback.postStart.apiAuthMe + ' runNow=' + $ev.rollback.postStart.runNow + ' bm=' + $ev.rollback.postStart.buildManifest + ' tuple=' + $ev.rollback.postStart.tupleUnchanged)
          Assert $asserts 'restoreSteps hepsi TAMAM' (@($ev.restoreSteps.PSObject.Properties | Where-Object { -not ([string]$_.Value).StartsWith('TAMAM') }).Count -eq 0) (($ev.restoreSteps.PSObject.Properties | ForEach-Object { $_.Name + '=' + $_.Value }) -join ' ; ')
          if ($sc -eq 'service-start-fail' -or $sc -eq 'identity-read-error') { }
        } elseif ($exp.exit -eq 21) {
          Assert $asserts 'rollback yok, restoreSteps yok (dosyalara dokunulmadi)' ($null -eq $ev.rollback -and $null -eq $ev.restoreSteps) ''
          Assert $asserts 'error: WEB kapanmadi + yeniden baslatildi' ([string]$ev.error -match 'WEB kapanmadi') ([string]$ev.error)
          Assert $asserts 'aday API/WEB sagligi olculmedi (health.api / health.web yok)' ($null -eq $ev.health.api -and $null -eq $ev.health.web) ''
          Assert $asserts 'faultLog: stop-fail kaydi' ((($ev.testMode.faultLog) -join ' ; ') -match 'stop: web kapanmadi') (($ev.testMode.faultLog) -join ' ; ')
          Assert $asserts 'stdout: DURDURMA-BASARISIZ sonucu ve cikis 21' ($r.out -match '=== SONUC: DURDURMA-BASARISIZ \(cikis 21\)') ''
        } elseif ($sc -eq 'rollback-script') {
          Assert $asserts 'verify.ok=true' ([bool]$ev.verify.ok) ('mismatches=' + @($ev.verify.mismatches).Count)
          Assert $asserts 'restoreSteps hepsi TAMAM' (@($ev.restoreSteps.PSObject.Properties | Where-Object { -not ([string]$_.Value).StartsWith('TAMAM') }).Count -eq 0) ''
        } else {
          Assert $asserts 'rollback yok' ($null -eq $ev.rollback) ''
          Assert $asserts 'saglik api/web/kapsam ok' ([bool]$ev.health.api.ok -and [bool]$ev.health.web.ok -and [bool]$ev.health.scope.ok) ''
          Assert $asserts 'health.pathBudget.ok (yol butcesi kanitta)' ([bool]$ev.health.pathBudget.ok) ('maxRelApi=' + $ev.health.pathBudget.maxRelApi + ' maxRelWeb=' + $ev.health.pathBudget.maxRelWeb)
        }
        if ($sc -eq 'service-start-fail') { Assert $asserts 'WEB aday ile HIC baslatilmadi (failedAt 5-baslat-api; health.web yok)' ($null -eq $ev.health.web) '' }
        if ($sc -eq 'happy-path') { $lastHappyEvidence = $ev }
      }
      $d = Get-LiveDigests
      if ($exp.api.StartsWith('NOT:')) { Assert $asserts 'canli API digest taban DEGIL (bozulma korundu, dogrulama yakaladi)' ($d.api -cne $exp.api.Substring(4)) ('olculen ' + $d.api.Substring(0, 16)) }
      else { Assert $asserts 'canli API agac digest' ($d.api -ceq $exp.api) ('beklenen ' + $exp.api.Substring(0, 16) + ' olculen ' + $d.api.Substring(0, 16)) }
      Assert $asserts 'canli WEB .next digest' ($d.web -ceq $exp.web) ('beklenen ' + $exp.web.Substring(0, 16) + ' olculen ' + $d.web.Substring(0, [Math]::Min(16, $d.web.Length)))
      Assert $asserts 'BUILD_ID' ($d.bid -ceq $exp.bid) ('beklenen ' + $exp.bid + ' olculen ' + $d.bid)
      Assert $asserts 'next.config.js' ($d.cfg -ceq $CFG_LIVE) $d.cfg.Substring(0, 16)
      Assert $asserts ('eklenen 6 dosya canlida ' + $(if ($exp.addedPresent) { 'VAR' } else { 'YOK' })) ($(if ($exp.addedPresent) { $d.addedPresent.Count -eq 6 } else { $d.addedPresent.Count -eq 0 })) ('mevcut=' + $d.addedPresent.Count)
      $st = Get-Content -Raw -LiteralPath $T_STATE | ConvertFrom-Json
      Copy-Item -LiteralPath $T_STATE -Destination (Join-Path $scDir 'sim-state.json') -Force
      Assert $asserts ('simulator API ' + $(if ($exp.apiUp) { 'AYAKTA' } else { 'DURMUS' })) ([bool]$st.apiRunning -eq $exp.apiUp) ('apiRunning=' + $st.apiRunning + ' stopCalls=' + $st.stopCalls + ' startCalls=' + $st.startCalls)
      Assert $asserts ('simulator WEB ' + $(if ($exp.webUp) { 'AYAKTA' } else { 'DURMUS' })) ([bool]$st.webRunning -eq $exp.webUp) ('webRunning=' + $st.webRunning)
      if ($exp.exit -ne 0) {
        $q = @(Get-ChildItem -LiteralPath $T_EVID -Directory -Filter 'added-quarantine-*' -ErrorAction SilentlyContinue)
        $qFiles = 0; foreach ($qd in $q) { $qFiles += @(Get-ChildItem -LiteralPath $qd.FullName -Recurse -File -Force).Count }
        if ($exp.exit -eq 21) { Assert $asserts 'karantina dizini YOK (dosyalara dokunulmadi); simulator: 2 durdurma istegi DEGIL 1 (API durdurulmadi), 1 baslatma (WEB yeniden)' ($q.Count -eq 0 -and [int]$st.stopCalls -eq 1 -and [int]$st.startCalls -eq 1) ('karantina=' + $q.Count + ' stop=' + $st.stopCalls + ' start=' + $st.startCalls) }
        else { Assert $asserts 'karantina dizini var; silme yok' ($q.Count -ge 1) ('dizin=' + $q.Count + ' dosya=' + $qFiles) }
      }
      $leftover = @(Get-ChildItem -LiteralPath $T_LIVE_WEB -Directory -Force | Where-Object { $_.Name -ne '.next' })
      Say ('  live\web kalinti dizinleri (silme yok): ' + $(if ($leftover.Count) { ($leftover.Name -join ', ') } else { '(yok)' }))
      # canli koke/hicbir canli yola dokunulmadigi: kanit JSON'undaki tum yollar TestRoot altinda
      if ($ev) {
        $paths = @($ev.api.backup, $ev.web.backup, $ev.quarantineDir, $ev.web.preDirInPlace, $ev.backupApiDir, $ev.backupWebDir) | Where-Object { $_ }
        $bad = @($paths | Where-Object { $_.StartsWith($LIVE_ROOT_CANON, [StringComparison]::OrdinalIgnoreCase) -or $_.StartsWith($LIVE_EVID_DIR, [StringComparison]::OrdinalIgnoreCase) })
        Assert $asserts 'kanit yollari canli/gercek kanit kokune isaret etmiyor' ($bad.Count -eq 0) ($paths -join ' | ')
      }
    }
  } catch {
    Assert $asserts 'harness istisnasi' $false $_.Exception.Message
  }
  $pass = (@($asserts | Where-Object { -not $_.ok }).Count -eq 0) -and ($asserts.Count -ge 1)
  $results.Add([ordered]@{ scenario = $sc; kind = $(if ($isGate) { 'gate' } else { 'functional' }); result = $(if ($pass) { 'PASS' } else { 'FAIL' })
      expectedExit = $(if ($exp.noProcess) { $null } elseif ($isGate) { 20 } else { $exp.exit }); measuredExit = $(if ($r) { $r.rc } else { $null }); expectedVerdict = $(if ($isGate) { 'KAPIDA-DURDU / kapi' } else { $exp.verdict }); measuredVerdict = $(if ($ev) { $ev.verdict } else { $null })
      failedAt = $(if ($ev) { $ev.failedAt } else { $null }); stage = $(if ($ev) { $ev.stage } else { $null })
      evidence = $evCopy; evidenceTestRoot = $(if ($evPath) { $evPath.path } else { $null }); evidenceSha256 = $(if ($evPath) { $evPath.sha } else { $null })
      stdout = (Join-Path $scDir 'stdout.txt'); durationSec = [int]((Get-Date) - $t0).TotalSeconds; assertCount = $asserts.Count; asserts = $asserts.ToArray() })   # WinPS 5.1: hashtable ogeli List[object] icin @() sozlukte 'argument types do not match' verir; ToArray() calisir (olculdu)
  Say ('================ SENARYO ' + $sc + ' => ' + $(if ($pass) { 'PASS' } else { 'FAIL' }) + ' (' + [int]((Get-Date) - $t0).TotalSeconds + ' sn; ' + $asserts.Count + ' assert)')
}
$allPass = (@($results | Where-Object { $_.result -ne 'PASS' }).Count -eq 0) -and ($results.Count -eq $Scenarios.Count)
$summary = [ordered]@{
  record = 'R27-FAULT-PROVA-SUMMARY'; tsUtc = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ'); runTs = $RUN_TS; result = $(if ($allPass) { 'PASS' } else { 'FAIL' })
  scenariosRun = $results.Count; scenariosPass = @($results | Where-Object { $_.result -eq 'PASS' }).Count
  scripts = [ordered]@{ release = $RELEASE; releaseSha256 = (Sha $RELEASE); rollback = $ROLLBACK; rollbackSha256 = (Sha $ROLLBACK); harness = $PSCommandPath; harnessSha256 = (Sha $PSCommandPath) }
  pristine = [ordered]@{ dir = $PristineDir; api = $pApi; web = $pWeb; cfg = $pCfg }; candidate = [ordered]@{ dir = $CandApps; api = $cApi; web = $cWeb; cfg = $cCfg }
  pathBudget = [ordered]@{ limit = 260; maxRelApi = $maxRelApi; maxRelWeb = $maxRelWeb; items = $budget; ok = $budgetOk }
  testRoot = $TESTROOT; runEvidenceDir = $RUN_EVID; gateRoot = $GATE_ROOT; liveTouched = $false
  note = 'Canliya dokunulmadi: tum yollar TestRoot altinda, gorev/dinleyici/Http/uclu/ACL/sahte-surec simulatorle. ACL kalitim kontrolu test modunda OLCULMEZ (canli SelfTest olcer). Sahte-surec kapisi TEST modunda sentetik surec listesiyle (sim rogueProcs) ve enjekte saglayiciyla olculur; CANLI surec listesi okumasi (Win32_Process), SelfTest kosumu ve yukseltilmis pencere yalniz canli SelfTest kontrolleriyle olculur. Kapi zinciri butunlugu AST ile pinlenir; olcumlerin disinda kalan KASITLI duzenlemeyi kanitlamaz (savunma: yayin betigi sha pini + inceleme). Kapi senaryolari canli yol cozumlemesinden once ya da TestRoot altinda durur; canli kanit dizinine dosya eklenmedigi her kapi senaryosunda olculur.'
  scenarios = $results.ToArray(); log = @($hlog)
}
$sf = Join-Path $EVID 'fault-prova-summary.json'; $sfRun = Join-Path $RUN_EVID 'fault-prova-summary.json'
$sjson = ($summary | ConvertTo-Json -Depth 8)
[IO.File]::WriteAllText($sf, $sjson, (New-Object Text.UTF8Encoding($false)))
[IO.File]::WriteAllText($sfRun, $sjson, (New-Object Text.UTF8Encoding($false)))
Write-Host ('OZET: ' + $sf + ' sha256=' + (Sha $sf) + ' (kalici kopya: ' + $sfRun + ')')
foreach ($x in $results) { Write-Host ('  ' + $x.result + '  ' + $x.scenario + '  cikis ' + $x.measuredExit + '/' + $x.expectedExit + '  ' + $x.measuredVerdict + '  failedAt=' + $x.failedAt) }
Write-Host ('=== HARNESS SONUC: ' + $(if ($allPass) { 'PASS' } else { 'FAIL' }) + ' (' + $summary.scenariosPass + '/' + $results.Count + ')')
if (-not $allPass) { exit 2 }
exit 0
