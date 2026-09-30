param([switch]$SelfTest, [string]$TestRoot = '', [string]$Fault = '')
$ErrorActionPreference = 'Stop'
# =============================================================================
# R27 YAYIN - API + WEB BIRLIKTE - OWNER ELEVATED KOSUM. Saf ASCII. (r26-release.ps1'den turetildi; yontem AYNI)
# -SelfTest : CANLIYA DOKUNMAZ (durdurma/takas/kopyalama/yazma YOK). Yardimci fonksiyonlari ve salt-okuma
#             kimlik olcumlerini dogrular, sonra cikar. Yayin icin PARAMETRESIZ kosulur.
# Aday kaynagi 1b758d29 (dal release/r27-candidate) = c7a154b3 (canli R26 kaynagi) + #2830 (D5-SEC-R01/R03) + #2832 (D5-SEC-R02)
#   + common/trust-proxy.config.ts (#2730'dan test yardimcisi; main.ts DEGISMEDI). DAHIL DEGIL: K3/claim-item, office-authz
#   (#2818/#2821/#2824/#2825), migration'lar (3), diger main degisiklikleri.
# API: BIRLESIK ARTEFAKT = canli R26 A8B17A38 + 10 degisen + 6 EKLENEN dosya (dto + trust-proxy yardimcisi + .d.ts/.map).
#   Eklenen dosyalar geri almada KARANTINAYA tasinir (silme yok) - agac digest'i tabana doner.
# WEB: .next TAM TAKAS (BUILD_ID 5waeMoFG -> W2UQpBPD) + next.config.js (ayni icerik).
# BASLATICI: P1-ONCESI ya da P1-SONRASI uclusunden TAM BIRI olmali; betikler baslatici DEGISTIRMEZ.
# migrate deploy YOK (aday migration gerektirmez; sema canliyla AYNI) ; pinli launcher'lar DEGISMEZ ; .env OKUNMAZ (yalniz sha) ; DB yazimi YOK ; SILME YOK.
# -----------------------------------------------------------------------------
# ASAMALAR ($script:STAGE; kanit JSON'unda stage/failedAt/stages):
#   0-kapilar | 1-yedek | 2-durdur-web | 2-durdur-api | 3-takas-api | 3-takas-web | 4-kimlik | 5-baslat-api | 5-baslat-web
#   6-kapsam | 7-kanit ; geri alma: R-durdur | R-geri-yukle | R-dogrula | R-baslat
# HATA YONETIMI: servisler durdurulduktan sonra HER hata (takas/kimlik/baslatma/kapsam) -> Restore-All -> geri yuklenen kimlik
#   DOGRULANIR (API agac == EXP_LIVE, 16 dosyalik paket == EXP_PKG_LIVE, eklenen 6 dosya YOK/karantinada, WEB .next == EXP_WEB_LIVE,
#   BUILD_ID == BID_LIVE, cfg == CFG_LIVE) -> YALNIZ dogrulama PASS ise eski servisler baslatilir. Kanit yazimi finally icindedir
#   ve kendisi korumalidir (EVID_DIR yazilamazsa %TEMP% fallback + konsol).
# CIKIS KODLARI:
#    0  YAYIN PASS
#   10  ROLLBACK                   geri alindi + kimlik dogrulandi + eski servisler ayakta
#   11  ROLLBACK-DOGRULANAMADI     geri alma yapildi ama kimlik dogrulanamadi -> servis BASLATILMADI; kanitta uyusmayanlar + B3 talimati
#   12  ROLLBACK-ENGELLENDI        geri alma sirasinda dosya/durdurma islemi basarisiz -> kalan adimlar kanitta; servis BASLATILMADI
#   13  ROLLBACK-OK-ESKI-BASLAMADI geri alindi + dogrulandi ama eski servisler gelmedi (escalate)
#   20  KAPIDA-DURDU               on kapi/aday/yedek asamasinda durdu; canli dosyalara DOKUNULMADI; servisler durdurulmadi
#   21  DURDURMA-BASARISIZ         WEB/API kapanmadi; canli dosyalara DOKUNULMADI; servisler yeniden baslatildi
#    1  SelfTest FAIL (yalniz -SelfTest)
# -----------------------------------------------------------------------------
# IZOLE TEST MODU: -TestRoot <dizin> [-Fault <ad>]. TUM canli yollar TestRoot altina baglanir:
#   live\api\dist\apps\api\src, live\api\.env (SAHTE; pin ENV_PIN_TEST), live\web\.next, live\web\next.config.js,
#   cand\api\dist\apps\api\src, cand\web\.next, cand\web\next.config.js, evidence\ ; sim\state.json = SIMULATOR
#   (yukseltme, gorev Stop/Start, dinleyici/Get-Pids, Wait-Stopped, Http, boot-log 'Mapped', baslatici uclusu, ACL, sahte-surec).
#   TestRoot canli kokun ALTINDA ya da ona ESIT ise DUR (20). Canli modda -Fault verilirse DUR (20).
#   -Fault (yalniz TestRoot ile): api-copy-interrupt | web-swap-fail | identity-read-error | identity-read-persistent
#                                 | service-start-fail | restore-hash-mismatch | stop-fail
#   (identity-read-error: 4-kimlik okumasi TEK SEFER firlatir (gecici istisna) -> geri alma dogrulanir -> 10.
#    identity-read-persistent: 4-kimlik VE R-dogrula okumalari (agac/paket/web digest) HER SEFER firlatir (kalici okuma
#    hatasi) -> verify 'OKUNAMADI' -> servis baslatilmaz -> 11.
#    service-start-fail ve restore-hash-mismatch: simulator, eklenen dosya canlidayken API'yi hic baslatmaz -> 5-baslat-api
#    asamasinda KAPI; restore-hash-mismatch ayrica geri yuklenen bir API dosyasini dogrulama ONCESI bozar -> 11 beklenir.
#    stop-fail: simulator WEB durdurma istegini alir ama WEB kapanmaz -> 2-durdur-web'de DURDURMA-BASARISIZ 21; dosyalara dokunulmaz.)
# YOL BUTCESI KAPISI (1-yedek): WinPS 5.1 Get-ChildItem/Get-FileHash MAX_PATH (260) uzerindeki yollari OKUYAMAZ. Yedek/hazirlik/
#   karantina koklerinin uzunlugu + agactaki en uzun goreli yol >= 260 ise DUR (20); marjlar kanitta (health.pathBudget).
# SAHTE-SUREC KAPISI: komut satiri desene ($ROGUE_TOKENS; kulturden bagimsiz, harf duyarsiz; U+0130/U+0131/U+212A katlanir) eslesen HER
#   surec SAYILIR - 'izleme' DAHIL. Siniflandirma yalniz TESHIS icindir: 'izleme' = dogrulanmis goruntuleyici (goruntu adi $ROGUE_VIEWERS +
#   calistirilabilir dosya $ROGUE_VIEWER_DIRS icinde) | 'test-uygulama' = diger her sey. Izleme sureci muaf DEGILDIR: operator listeden gorup
#   kapatir (muafiyet istenirse ayri owner kararidir). Desen bu paketin D-6/D-7/D-8 kosuculari ve oz-test/sahte-API/QR/owner-blok adlariyla
#   genisletildi; eski paketlerin tum betik adlarini kapsamaz (belgede sinir olarak yazili).
#   Rapora/kanita TAM KOMUT SATIRI YAZILMAZ: pid, goruntu adi, sinif, eslesen parca ve - yalniz Get-RogueItemName kosullarinin hepsi
#   saglanirsa - yaprak dosya adi. Kendi sureci ve GERCEK ust sureci dislanir (ust surec: olusturma zamani eski + bu betigin tam yolu/adi
#   cikarilinca desene eslesmiyor); dislananlar raporda gorunur. Canli modda taranan=0 ya da tarama kendi surecini goremiyorsa DUR.
#   SelfTest ve yayin akisi AYNI fonksiyonu (Invoke-RogueGate) cagirir. TEST modunda canli surec listesine bakilmaz: sim\state.json
#   rogueProcs sentetik listesi ayni yoldan gecer (harness akistaki kapiyi boyle olcer). Yukseltilmemis pencerede (B0) baska kullanicinin
#   sureclerinin komut satiri okunamayabilir (sayisi raporda); B1 yukseltilmis pencerede ayni kapiyi yeniden kosar.
#   ON KOSUL: yayin penceresinde ajan oturumu/harness/inceleme KOSMAZ; B0/B1 blogu etkilesimli pencereye YAPISTIRILARAK baslatilir.
# =============================================================================
$FAULTS = @('api-copy-interrupt', 'web-swap-fail', 'identity-read-error', 'identity-read-persistent', 'service-start-fail', 'restore-hash-mismatch', 'stop-fail')
$LIVE_ROOT_CANON = 'C:\Development\HUKUK_YAZILIMI\HY_W4_RELEASE23'
$TEST = ($TestRoot -ne '')
if ($Fault -ne '' -and $FAULTS -notcontains $Fault) { Write-Host ('KAPI: bilinmeyen -Fault: ' + $Fault + ' - DUR'); exit 20 }
if (-not $TEST -and $Fault -ne '') { Write-Host 'KAPI: -Fault yalniz -TestRoot ile kullanilir; canli modda hata enjeksiyonu YOK - DUR'; exit 20 }
if ($TEST) {
  $TestRoot = [IO.Path]::GetFullPath($TestRoot).TrimEnd('\')
  $canon = $LIVE_ROOT_CANON.TrimEnd('\')
  if ($TestRoot.Equals($canon, [StringComparison]::OrdinalIgnoreCase) -or $TestRoot.StartsWith($canon + '\', [StringComparison]::OrdinalIgnoreCase)) { Write-Host 'KAPI: TestRoot canli kokun altinda ya da ona esit - DUR'; exit 20 }
  if (-not (Test-Path -LiteralPath $TestRoot -PathType Container)) { Write-Host ('KAPI: TestRoot yok: ' + $TestRoot + ' - DUR'); exit 20 }
  if ($SelfTest) { Write-Host 'KAPI: -SelfTest yalniz canli modda (TestRoot ile birlikte kullanilmaz) - DUR'; exit 20 }
}
$ROOT      = $(if ($TEST) { Join-Path $TestRoot 'live' } else { $LIVE_ROOT_CANON })
$LIVE_API  = $(if ($TEST) { Join-Path $ROOT 'api' } else { Join-Path $ROOT 'project\apps\api' })
$LIVE      = Join-Path $LIVE_API 'dist\apps\api\src'
$CAND      = $(if ($TEST) { Join-Path $TestRoot 'cand\api\dist\apps\api\src' } else { 'D:\Development\HUKUK_YAZILIMI\HY_WT_R27\project\apps\api\dist\apps\api\src' })
$EXP_CAND  = 'E28A6863CF109A1A3AE1F53E096D5F5C2037E382EF2D8D3EC87FEE3B827E5134'
$EXP_LIVE  = 'A8B17A38327975C71DDAE82FE33D1E97CB8B339FB1E35D1828FCF8D0CEB053A0'
$EXP_PKG_CAND = 'BE17EBD0C0801EA1569DEB5306C5E0FE6B76B39FB1954BD76744333A479AF1BB'
$EXP_PKG_LIVE = 'B7FE81DBF83A4F20327667C5610C0E956CEB2D489357782E08D7A5647CBFA59E'   # eklenen 6 dosya canlida YOK -> '-'
$FILES = @('common/trust-proxy.config.d.ts', 'common/trust-proxy.config.js', 'common/trust-proxy.config.js.map', 'modules/auth/guards/credential-recovery-rate-limit.guard.js', 'modules/auth/guards/credential-recovery-rate-limit.guard.js.map', 'modules/auth/guards/login-rate-limit.guard.d.ts', 'modules/auth/guards/login-rate-limit.guard.js', 'modules/auth/guards/login-rate-limit.guard.js.map', 'modules/portal/dto/portal-password.dto.d.ts', 'modules/portal/dto/portal-password.dto.js', 'modules/portal/dto/portal-password.dto.js.map', 'modules/portal/portal.controller.d.ts', 'modules/portal/portal.controller.js', 'modules/portal/portal.controller.js.map', 'modules/portal/portal.service.js', 'modules/portal/portal.service.js.map')
# Canlida OLMAYAN, adayla EKLENEN dosyalar (yalniz bunlar eklenebilir; geri almada karantina)
$ADDED = @('common/trust-proxy.config.d.ts', 'common/trust-proxy.config.js', 'common/trust-proxy.config.js.map', 'modules/portal/dto/portal-password.dto.d.ts', 'modules/portal/dto/portal-password.dto.js', 'modules/portal/dto/portal-password.dto.js.map')
$LIVE_WEB  = $(if ($TEST) { Join-Path $ROOT 'web' } else { Join-Path $ROOT 'project\apps\web' })
$LIVE_NEXT = Join-Path $LIVE_WEB '.next'
$LIVE_CFG  = Join-Path $LIVE_WEB 'next.config.js'
$CAND_WEB  = $(if ($TEST) { Join-Path $TestRoot 'cand\web' } else { 'D:\Development\HUKUK_YAZILIMI\HY_WT_R27\project\apps\web' })
$CAND_NEXT = Join-Path $CAND_WEB '.next'
$CAND_CFG  = Join-Path $CAND_WEB 'next.config.js'
$EXP_WEB_LIVE = 'C17E7B132FB7DED65AD0788024AA478F0949AF0D5D9045E8F47779A31A615326'
$EXP_WEB_CAND = 'B2DEE3652F0843FAF05085243144ED0A4146C85C2C91FBCFA94BECB1A9D9F621'
$BID_LIVE  = '5waeMoFGGMTLAYmn9oJvW'
$BID_CAND  = 'W2UQpBPD_fp8pq4y7aFIe'
$CFG_LIVE  = 'C43DEB5A04F1529CE2D368204ED7D10B8DBC257327E0BC64A01F1D7CF3AC5B5C'
$CFG_CAND  = 'C43DEB5A04F1529CE2D368204ED7D10B8DBC257327E0BC64A01F1D7CF3AC5B5C'   # degismedi
$ENV_PIN_LIVE = '5C776BBEEE018EA5CC8192378D42D742FD4ABC1B6D0E9A3EA671CF463206908D'   # canli .env (H5 sonrasi)
$ENV_PIN_TEST = '7CAD142A7AD9BA03F9EDB873DACFE881B7783AFFA4F9D1FEC13CB0673C5C066B'   # sahte .env: "R27_TESTROOT_FAKE_ENV=1\n"
$ENV_PIN   = $(if ($TEST) { $ENV_PIN_TEST } else { $ENV_PIN_LIVE })
$API_LAUNCHER = 'C:\Ops\hukuk\bin\start-api.ps1'
$WEB_LAUNCHER = 'C:\Ops\hukuk\bin\start-web.ps1'
$HOST_EXE = 'C:\Ops\hukuk\bin\hukuk-task-host.exe'
# BASLATICI UCLUSU (api launcher, host exe, web launcher) - YALNIZ bu iki TANIMLI durum kabul edilir; yarim/baska durum = DUR.
# P1-ONCESI = bugunku canli (R23 postimage). P1-SONRASI = OFFICE A3/P1 teslimi (#2681 ba037026; P1-delivery/R26-HANDOFF.md).
# Uclu yayin/geri alma boyunca DEGISMEMELI (kapsam kapisi). Kanitta hangi uclu olculdugu yazilir.
$LAUNCH_TUPLES = @(
  @{ name = 'P1-ONCESI';  api = 'CC634BBFE0BE8F4F06482EDB30FF1E687D36B08C075665E2EC160EA8082619B3'; host = '691BC146C9123B1625B4AE733EFE615F8AFFB77FB0C95EBFDAE621A6AA171627'; web = 'F39F7A54BC51972B94FD0CF13A08F4E1AB82822A528EDAD58FC8F2318C1F59E0' },
  @{ name = 'P1-SONRASI'; api = 'DDCCD09157E0AAF209AB38316A33815A0298FFACBC9006ED62F35F137F86219C'; host = '27099BDF66C83A44B3061D65AE2DAF24EADB523EE4F464179C2F53BB6C78DEAB'; web = 'F39F7A54BC51972B94FD0CF13A08F4E1AB82822A528EDAD58FC8F2318C1F59E0' })
$API_PORT = 8080; $WEB_PORT = 3002
$API_TASK = 'HukukPlatform-API'; $WEB_TASK = 'HukukPlatform-Web'
$ROUTE = '/api/client-statements/monthly-delivery/run-now'
$PORTAL_GET = '/api/portal/cases'
$PORTAL_MAPPED = 'Mapped {/api/portal/documents/upload, POST} route'
$API_LOG_DIR = $(if ($TEST) { Join-Path $TestRoot 'sim\logs\api' } else { 'C:\Ops\hukuk\logs\api' })
$SIM_STATE = $(if ($TEST) { Join-Path $TestRoot 'sim\state.json' } else { '' })
$ts = (Get-Date).ToUniversalTime().ToString('yyyyMMdd-HHmmss') + 'Z'
$EVID_DIR = $(if ($TEST) { Join-Path $TestRoot 'evidence' } else { 'D:\Development\HUKUK_YAZILIMI\HY_R27_RELEASE_EVIDENCE' })
$BK_API = Join-Path $EVID_DIR ('rollback-api-src-R26-' + $ts)
$BK_WEB = Join-Path $EVID_DIR ('rollback-web-R26-' + $ts)
$STAGED = Join-Path $LIVE_WEB ('.next.r27-staged-' + $ts)
$PRE    = Join-Path $LIVE_WEB ('.next.pre-r27-' + $ts)
$FAILED_NEXT = Join-Path $LIVE_WEB ('.next.r27-failed-' + $ts)
$QUAR   = Join-Path $EVID_DIR ('added-quarantine-' + $ts)   # geri almada EKLENEN dosyalar buraya tasinir (silme yok)
$ROLLBACK_SCRIPT = Join-Path $PSScriptRoot 'r27-rollback.ps1'
$log = New-Object System.Collections.Generic.List[string]
# ---- durum (script scope) ----
$script:STAGE = 'init'; $script:FAILED_AT = $null; $script:ERR = $null; $script:VERDICT = 'BELIRSIZ'; $script:EXIT = 1
$script:STAGES = New-Object System.Collections.Generic.List[string]
$script:SERVICES_STOPPED = $false; $script:API_STARTED = $false; $script:WEB_STARTED = $false
$script:ROLLBACK = $null; $script:RESTORE_STEPS = $null; $script:VERIFY = $null; $script:RECOVERY = $null
$script:FAULT_IDENTITY_FIRED = $false; $script:FAULT_LOG = New-Object System.Collections.Generic.List[string]; $script:NOT_ELEVATED = $false
$script:tuple0 = ''; $script:envSha0 = ''; $script:actA0 = ''; $script:actW0 = ''; $script:candMap = $null; $script:health = [ordered]@{}
function Say([string]$m) { $line = ((Get-Date).ToUniversalTime().ToString('HH:mm:ss') + 'Z  ' + $m); Write-Host $line; $log.Add($line) }
function Set-Stage([string]$s) { $script:STAGE = $s; $script:STAGES.Add(((Get-Date).ToUniversalTime().ToString('HH:mm:ss') + 'Z ' + $s)); Say ('=== ASAMA ' + $s) }
function Get-R26FileSha256([string]$p) { return (Get-FileHash -Algorithm SHA256 -LiteralPath $p).Hash }
# Web agaci: cache/ ve trace HARIC (next start'in yazabildigi yerler; derleme kimligine dahil DEGIL)
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
  # ORDINAL siralama (kabuk/kultur bagimsiz; PS 5.1 ve pwsh 7 ayni digest; R25 ile ayni tarif)
  $keys = New-Object 'System.Collections.Generic.List[string]'
  foreach ($k in $map.Keys) { $keys.Add([string]$k) }
  $keys.Sort([StringComparer]::Ordinal)
  foreach ($k in $keys) { [void]$sb.Append($k).Append("`0").Append($map[$k]).Append("`n") }
  return [BitConverter]::ToString([Security.Cryptography.SHA256]::Create().ComputeHash([Text.Encoding]::UTF8.GetBytes($sb.ToString()))).Replace('-', '')
}
function Get-PackageDigest([string]$root) {
  $m = [ordered]@{}
  foreach ($rel in $FILES) { $p = Join-Path $root ($rel -replace '/', '\'); $m[$rel] = $(if (Test-Path -LiteralPath $p -PathType Leaf) { Get-R26FileSha256 $p } else { '-' }) }
  return Get-TreeDigest $m
}
function Get-BuildId([string]$nextDir) { return (Get-Content -Raw -LiteralPath (Join-Path $nextDir 'BUILD_ID')).Trim() }
# Yol butcesi: kok (sondaki '\' dahil) + agactaki en uzun goreli yol; WinPS 5.1 icin < 260 olmali. Sonuc kanitta.
function Get-MaxRelLen($map) { $m = 0; foreach ($k in $map.Keys) { if (([string]$k).Length -gt $m) { $m = ([string]$k).Length } }; return $m }
function Test-PathBudget([hashtable]$roots, [int]$maxRelApi, [int]$maxRelWeb) {
  $r = [ordered]@{ limit = 260; maxRelApi = $maxRelApi; maxRelWeb = $maxRelWeb; ok = $true; items = [ordered]@{} }
  foreach ($name in $roots.Keys) {
    $root = [string]$roots[$name].path; $rel = [int]$roots[$name].rel
    $total = ($root.TrimEnd('\') + '\').Length + $rel
    $r.items[$name] = [ordered]@{ root = $root; rootLen = ($root.TrimEnd('\') + '\').Length; maxRel = $rel; total = $total; margin = (260 - $total); ok = ($total -lt 260) }
    if ($total -ge 260) { $r.ok = $false }
  }
  return $r
}
# ---------------------------------------------------------------- SIMULATOR (yalniz TestRoot)
function Get-SimState { return (Get-Content -Raw -LiteralPath $SIM_STATE | ConvertFrom-Json) }
function Set-SimState($s) { [IO.File]::WriteAllText($SIM_STATE, ($s | ConvertTo-Json -Depth 5), (New-Object Text.UTF8Encoding($false))) }
function Add-SimEvent($s, [string]$m) { $s.eventLog = ([string]$s.eventLog + ((Get-Date).ToUniversalTime().ToString('HH:mm:ss') + 'Z ' + $m) + "`n") }
function Test-CandidateMarkerPresent { return (Test-Path -LiteralPath (Join-Path $LIVE 'common\trust-proxy.config.js') -PathType Leaf) }
function Invoke-FaultPoint([string]$point, [int]$n = 0) {
  if (-not $TEST -or $Fault -eq '') { return }
  switch ($point) {
    'api-copy' { if ($Fault -eq 'api-copy-interrupt' -and $n -eq 8) { $script:FAULT_LOG.Add('api-copy@' + $n); throw ('FAULT api-copy-interrupt: ' + $n + '. dosyadan sonra kopyalama hatasi (enjekte)') } }
    'web-swap' { if ($Fault -eq 'web-swap-fail') { $script:FAULT_LOG.Add('web-swap'); throw 'FAULT web-swap-fail: eski .next tasindi, yeni .next TASINAMADI (enjekte)' } }
    'identity-read' {
      if ($Fault -eq 'identity-read-error' -and -not $script:FAULT_IDENTITY_FIRED) { $script:FAULT_IDENTITY_FIRED = $true; $script:FAULT_LOG.Add('identity-read (gecici, tek sefer)'); throw 'FAULT identity-read-error: takas sonrasi kimlik okumasi hata firlatti (enjekte, tek sefer)' }
      if ($Fault -eq 'identity-read-persistent') { $script:FAULT_LOG.Add('identity-read (kalici)'); throw 'FAULT identity-read-persistent: takas sonrasi kimlik okumasi hata firlatti (enjekte, kalici)' }
    }
    'restore-read' { if ($Fault -eq 'identity-read-persistent') { $script:FAULT_LOG.Add('restore-read (kalici): ' + $n); throw ('FAULT identity-read-persistent: geri yuklenen kimlik okumasi hata firlatti (enjekte, kalici; olcum ' + $n + ')') } }
    'restore-verify' {
      if ($Fault -eq 'restore-hash-mismatch') {
        $p = Join-Path $LIVE 'modules\portal\portal.service.js'
        [IO.File]::AppendAllText($p, "`n/* FAULT restore-hash-mismatch (enjekte) */`n")
        $script:FAULT_LOG.Add('restore-verify: ' + $p + ' bozuldu'); Say ('FAULT restore-hash-mismatch: geri yuklenen dosya dogrulama ONCESI bozuldu: ' + $p)
      }
    }
  }
}
# ---------------------------------------------------------------- CANLI / SIM SARMALAYICILAR
function Test-Elevated {
  if ($TEST) { return $true }
  $e = (New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
  if (-not $e) { $script:NOT_ELEVATED = $true }   # yetkisiz/yanlislikla kosum: kanit CANLI kanit dizinine DEGIL %TEMP% fallback'e yazilir
  return $e
}
function Get-TaskAction([string]$task) {
  if ($TEST) { $s = Get-SimState; if ($task -eq $API_TASK) { return [string]$s.apiAction } else { return [string]$s.webAction } }
  return (((Get-ScheduledTask -TaskName $task).Actions | ForEach-Object { $_.Execute + ' ' + $_.Arguments }) -join ' ; ')
}
function Get-TaskState([string]$task) {
  if ($TEST) { $s = Get-SimState; $r = $(if ($task -eq $API_TASK) { [bool]$s.apiRunning } else { [bool]$s.webRunning }); if ($r) { return 'Running' } else { return 'Ready' } }
  return [string](Get-ScheduledTask -TaskName $task).State
}
function Get-ProcCommandLine([int]$p) {
  if ($TEST) { $s = Get-SimState; return [string]$s.procCommandLine }
  return [string](Get-CimInstance Win32_Process -Filter ("ProcessId=" + $p)).CommandLine
}
$ROGUE_TOKENS = @('i1[2-6]-live', 'i12-cron', 'i12-window', 'i15-kabul', 'smtp-sink', 'i3-sink', 'i3-spy', 'edge-proxy', 'r26-dar-kabul', 'r26-live-portal',
  'd4-portal-', 'd5-portal-', 'd6-portal-', 'd7-portal-', 'd8-staff-', 'd[4-8]-selftest', 'd[4-8]-fake-', 'd[4-8]-qr-', 'd[4-8]-owner-', 'extacc-', 'h5-url-', 'r27-',
  'c-run\.js', 'c-setup\.js', 'c-99-close', 'c-start-api', 'P1-delivery', 'Preflight\.ps1')
$ROGUE_RX = ($ROGUE_TOKENS -join '|')
$ROGUE_RXO = [Text.RegularExpressions.RegexOptions]'IgnoreCase, CultureInvariant'
$ROGUE_VIEWERS = @('tail.exe', 'cat.exe', 'head.exe', 'grep.exe', 'findstr.exe', 'more.com')
$ROGUE_VIEWER_DIRS = @((Join-Path $env:ProgramFiles 'Git\usr\bin'), (Join-Path $env:SystemRoot 'System32'))
$ROGUE_SHELLS = @('node.exe', 'powershell.exe', 'pwsh.exe', 'cmd.exe', 'bash.exe', 'sh.exe', 'python.exe', 'python3.exe', 'py.exe', 'wscript.exe', 'cscript.exe')
$ROGUE_ITEM_EXT = @('.js', '.cjs', '.mjs', '.ps1', '.psm1', '.cmd', '.bat', '.py', '.sh', '.log', '.txt', '.json')
$ROGUE_ITEM_FLAGS = @('-file', '-f')
$ROGUE_SELF_PATH = [string]$PSCommandPath
function ConvertTo-RogueFolded([string]$s) {
  # Taban surum (-match, kultur tr-TR) U+0130 ve U+212A iceren komut satirlarini da sayiyordu. AYNI UZUNLUKTA katlama ile bu girdiler
  # yeni (kulturden bagimsiz) eslesmede de sayilir; U+0131 katlamasi ek sikilastirmadir.
  if (-not $s) { return '' }
  return $s.Replace([string][char]0x0130, 'I').Replace([string][char]0x0131, 'i').Replace([string][char]0x212A, 'K')
}
function Get-RogueMatchInfo([string]$cmdLine) { return [regex]::Match((ConvertTo-RogueFolded $cmdLine), $ROGUE_RX, $ROGUE_RXO) }
function Test-RogueMatch([string]$cmdLine) {
  if (-not $cmdLine) { return $false }
  return [bool](Get-RogueMatchInfo $cmdLine).Success
}
function Get-RogueClass([string]$name, [string]$cmdLine, [string]$exePath) {
  # 'none' = desene eslesmiyor | 'izleme' = DOGRULANMIS goruntuleyici (goruntu adi + guvenilir dizin) | 'test-uygulama' = diger her sey.
  # 'izleme' ve 'test-uygulama' IKISI DE SAYILIR; sinif yalniz teshis icindir (operator neyi kapatacagini gorur).
  if (-not (Test-RogueMatch $cmdLine)) { return 'none' }
  $isViewerName = $false
  foreach ($v in $ROGUE_VIEWERS) { if ([string]::Equals($name, $v, [StringComparison]::OrdinalIgnoreCase)) { $isViewerName = $true } }
  if ($isViewerName -and $exePath) {
    $dir = ''
    try { $dir = [IO.Path]::GetDirectoryName([IO.Path]::GetFullPath($exePath)) } catch { $dir = '' }
    foreach ($d in $ROGUE_VIEWER_DIRS) {
      if ($dir -and [string]::Equals($dir.TrimEnd('\'), ([string]$d).TrimEnd('\'), [StringComparison]::OrdinalIgnoreCase)) { return 'izleme' }
    }
  }
  return 'test-uygulama'
}
function Get-RogueItemName([string]$cmdLine) {
  # Tam komut satiri rapora/kanita YAZILMAZ. Oge adi yalniz SU KOSULLARIN HEPSI saglanirsa yazilir, aksi halde BOS:
  #  (1) eslesen parca argumanin YAPRAK adinin BASINDA (dizin bileseninde degil)     (2) argumanda ayirici/ozel karakter yok (? # & = ; , @ ( ) + % ve '://')
  #  (3) ':' yalniz surucu harfi konumunda                                           (4) yaprak yalniz [A-Za-z0-9._-], 1..60 karakter
  #  (5) izinli uzanti ($ROGUE_ITEM_EXT)                                             (6) 20+ kesintisiz harf/rakam dizisi yok (belirtec gorunumu)
  #  (7) onceki arguman bir secenek bayragi degil (izinli: $ROGUE_ITEM_FLAGS)
  #  Komut satirindaki eslesmeler SIRAYLA denenir (paket dizini de desene eslesir: ...\client-release-r27-r01\scripts\r27-release.ps1);
  #  kosullarin hepsini saglayan ILK eslesmenin yaprak adi yazilir.
  $f = ConvertTo-RogueFolded $cmdLine
  $isSep = { param($ch) ([char]::IsWhiteSpace($ch) -or $ch -eq '"' -or $ch -eq "'") }
  $rxi = [Text.RegularExpressions.RegexOptions]::CultureInvariant
  foreach ($m in [regex]::Matches($f, $ROGUE_RX, $ROGUE_RXO)) {
    $s = $m.Index; $e = $m.Index + $m.Length
    while ($s -gt 0 -and -not (& $isSep $f[$s - 1])) { $s-- }
    while ($e -lt $f.Length -and -not (& $isSep $f[$e])) { $e++ }
    $arg = $f.Substring($s, $e - $s)
    if ($arg.IndexOfAny([char[]]@('?', '#', '&', '=', ';', ',', '@', '(', ')', '+', '%')) -ge 0) { continue }
    if ($arg.Contains('://')) { continue }
    $c1 = $arg.IndexOf(':'); if ($c1 -ge 0 -and ($c1 -ne 1 -or $arg.LastIndexOf(':') -ne 1)) { continue }
    $i = [Math]::Max($arg.LastIndexOf('\'), $arg.LastIndexOf('/'))
    $leaf = $(if ($i -ge 0) { $arg.Substring($i + 1) } else { $arg })
    if ($m.Index -ne ($s + $i + 1)) { continue }
    if ($leaf.Length -lt 1 -or $leaf.Length -gt 60) { continue }
    if (-not [regex]::IsMatch($leaf, '^[A-Za-z0-9._-]+$', $rxi)) { continue }
    if ([regex]::IsMatch($leaf, '[A-Za-z0-9]{20,}', $rxi)) { continue }
    $dot = $leaf.LastIndexOf('.')
    if ($dot -lt 1) { continue }
    $ext = $leaf.Substring($dot); $extOk = $false
    foreach ($x in $ROGUE_ITEM_EXT) { if ([string]::Equals($ext, $x, [StringComparison]::OrdinalIgnoreCase)) { $extOk = $true } }
    if (-not $extOk) { continue }
    $flagOk = $true
    $p = $s - 1
    while ($p -ge 0 -and (& $isSep $f[$p])) { $p-- }
    if ($p -ge 0) {
      $q = $p
      while ($q -gt 0 -and -not (& $isSep $f[$q - 1])) { $q-- }
      $prev = $f.Substring($q, $p - $q + 1)
      if ($prev.StartsWith('-') -or $prev.StartsWith('/')) {
        $flagOk = $false
        foreach ($fl in $ROGUE_ITEM_FLAGS) { if ([string]::Equals($prev, $fl, [StringComparison]::OrdinalIgnoreCase)) { $flagOk = $true } }
      }
    }
    if (-not $flagOk) { continue }
    return $leaf
  }
  return ''
}
function Get-RogueReport($procs, [int]$selfPid, [string]$selfLeaf, [string]$selfPath) {
  # SAF fonksiyon (canli surec listesine BAKMAZ; girdi listesiyle calisir). Kendi sureci ve GERCEK ust sureci dislar; desene eslesen
  # HER sureci sinifiyla listeler ve SAYAR. GERCEK ust surec = listede TEK kaydi olan, olusturma zamani OKUNABILEN ve kendi surecinden
  # ESKI/esit (pid yeniden kullanimi degil) VE komut satiri, bu betigin tam yolu ve dosya adi YALNIZ TAM ARGUMAN olarak (baska bir adin
  # parcasi degil; dosya adi yalniz dizinsiz ya da .\ ile) cikarildiginda desene ESLESMIYOR (baska test/prova betigi tasimiyor).
  # Kendi ya da ust pid listede birden cok kez gecerse o pid DISLANMAZ (fail-closed).
  $list = @($procs | Where-Object { $null -ne $_ })
  $items = New-Object System.Collections.ArrayList; $excluded = New-Object System.Collections.ArrayList; $unreadNames = New-Object System.Collections.ArrayList
  $meAll = @($list | Where-Object { [int]$_.ProcessId -eq $selfPid })
  $me = $(if ($meAll.Count -eq 1) { $meAll[0] } else { $null })
  $selfSeen = $false
  if ($me -and [string]$me.CommandLine -and $selfLeaf) { $selfSeen = ((ConvertTo-RogueFolded ([string]$me.CommandLine)).IndexOf($selfLeaf, [StringComparison]::OrdinalIgnoreCase) -ge 0) }
  $parentPid = -1
  if ($me -and $me.ParentProcessId -and [int]$me.ParentProcessId -ne $selfPid) {
    $ppAll = @($list | Where-Object { [int]$_.ProcessId -eq [int]$me.ParentProcessId })
    if ($ppAll.Count -eq 1) {
      $p = $ppAll[0]
      $older = $false
      if ($null -ne $p.CreationDate -and $null -ne $me.CreationDate -and [string]$p.CreationDate -ne '' -and [string]$me.CreationDate -ne '') {
        try { $older = ([datetime]$p.CreationDate -le [datetime]$me.CreationDate) } catch { $older = $false }
      }
      $rest = ConvertTo-RogueFolded ([string]$p.CommandLine)
      $bL = '(?<=^|[\s"''=])'; $bR = '(?=$|[\s"''])'
      if ($selfPath) { $rest = [regex]::Replace($rest, ($bL + [regex]::Escape((ConvertTo-RogueFolded $selfPath)) + $bR), '', $ROGUE_RXO) }
      if ($selfLeaf) { $rest = [regex]::Replace($rest, ($bL + '(?:\.[\\/])?' + [regex]::Escape((ConvertTo-RogueFolded $selfLeaf)) + $bR), '', $ROGUE_RXO) }
      if ($older -and -not (Test-RogueMatch $rest)) { $parentPid = [int]$p.ProcessId; [void]$excluded.Add([ordered]@{ pid = [int]$p.ProcessId; name = [string]$p.Name; why = 'ust-surec' }) }
    }
  }
  $scanned = 0; $unreadable = 0; $unreadableShells = 0
  foreach ($p in $list) {
    $scanned++
    $cl = [string]$p.CommandLine
    if (-not $cl) {
      $unreadable++
      foreach ($sh in $ROGUE_SHELLS) { if ([string]::Equals([string]$p.Name, $sh, [StringComparison]::OrdinalIgnoreCase)) { $unreadableShells++; [void]$unreadNames.Add([string]$p.Name) } }
      continue
    }
    if (($null -ne $me -and [int]$p.ProcessId -eq $selfPid) -or [int]$p.ProcessId -eq $parentPid) { continue }
    $cls = Get-RogueClass ([string]$p.Name) $cl ([string]$p.ExecutablePath)
    if ($cls -eq 'none') { continue }
    [void]$items.Add([ordered]@{ pid = [int]$p.ProcessId; name = [string]$p.Name; class = $cls; token = [string](Get-RogueMatchInfo $cl).Value; item = (Get-RogueItemName $cl) })
  }
  $viewers = @($items | Where-Object { $_.class -eq 'izleme' }).Count
  return [ordered]@{ count = [int]$items.Count; viewers = [int]$viewers; testApp = [int]($items.Count - $viewers); scanned = [int]$scanned; unreadable = [int]$unreadable
                     unreadableShells = [int]$unreadableShells; unreadableShellNames = @($unreadNames.ToArray() | Sort-Object -Unique); selfSeen = [bool]$selfSeen
                     excluded = @($excluded.ToArray()); items = @($items.ToArray()) }
}
function Get-ProcList {
  # Surec listesi saglayicisi: TEST modunda canli listeye BAKILMAZ (sim\state.json rogueProcs; yoksa bos); canli modda Win32_Process (filtresiz).
  # Betik/oturum duzeyindeki $PSDefaultParameterValues (ornegin 'Get-CimInstance:Filter') listeyi DARALTAMASIN diye yerel bos tablo golgeler.
  if ($TEST) {
    $s = Get-SimState
    if (($s.PSObject.Properties.Name -contains 'rogueProcs') -and $s.rogueProcs) { return @($s.rogueProcs) }
    return @()
  }
  $PSDefaultParameterValues = @{}
  return @(Get-CimInstance -ClassName Win32_Process)
}
function Get-LiveRogueReport {
  $r = Get-RogueReport (Get-ProcList) ([int]$PID) ([IO.Path]::GetFileName([string]$ROGUE_SELF_PATH)) ([string]$ROGUE_SELF_PATH)
  $r.simulated = [bool]$TEST
  $r.elevated = $(if ($TEST) { $true } else { [bool](New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator) })
  return $r
}
function Get-RogueCount { return [int](Get-LiveRogueReport).count }
function Get-RogueGateError($rr) {
  # '' = kapi GECER. Aksi halde DUR nedeni. Eslesen surec (izleme DAHIL) varsa; canli modda hic surec taranamadiysa ya da liste 20'den
  # kisaysa (daraltilmis liste); canli modda tarama kendi surecini/komut satirini goremediyse (liste guvenilir degil) kapi GECMEZ.
  if ($null -eq $rr) { return 'KAPI: sahte-surec raporu yok - DUR' }
  if ([int]$rr.count -ne 0) { return ('KAPI: canli pencerede test/prova sureci var (izleme dahil ' + [int]$rr.count + ' eslesme) - DUR') }
  if (-not [bool]$rr.simulated) {
    if ([int]$rr.scanned -eq 0) { return 'KAPI: surec listesi taranamadi (taranan=0) - DUR' }
    if ([int]$rr.scanned -lt 20) { return ('KAPI: surec listesi eksik (taranan=' + [int]$rr.scanned + ' < 20; liste guvenilir degil) - DUR') }
    if (-not [bool]$rr.selfSeen) { return 'KAPI: surec taramasi kendi surecini/komut satirini goremedi (liste guvenilir degil) - DUR' }
  }
  return ''
}
function Write-RogueReport($rr) {
  Say ('  taranan=' + $rr.scanned + ' | komut satiri okunamayan=' + $rr.unreadable + ' (bunlardan yorumlayici/kabuk=' + $rr.unreadableShells + ') | kendi sureci goruldu=' + $rr.selfSeen + ' | dislanan=' + @($rr.excluded).Count + ' | yukseltilmis=' + $rr.elevated + $(if ($rr.simulated) { ' | SIMULATOR' } else { '' }))
  if ([bool]$rr.elevated -and -not [bool]$rr.simulated -and [int]$rr.unreadableShells -gt 0) { Say ('  UYARI: yukseltilmis pencerede komut satiri okunamayan yorumlayici/kabuk var: ' + (@($rr.unreadableShellNames) -join ',')) }
  foreach ($x in @($rr.excluded)) { Say ('  dislandi      pid=' + $x.pid + ' ' + $x.name + ' (' + $x.why + ')') }
  foreach ($it in @($rr.items)) { Say ('  ' + ([string]$it.class).PadRight(13) + ' pid=' + $it.pid + ' ' + $it.name + ' eslesen=' + $it.token + $(if ($it.item) { ' oge=' + $it.item } else { '' })) }
}
function Invoke-RogueGate {
  # SelfTest ve yayin akisi AYNI fonksiyonu cagirir: raporu alir, yazar, kanita koyar ve DUR nedenini ('' = gecer) dondurur.
  $rr = $null
  try { $rr = Get-LiveRogueReport }
  catch { $script:health.rogue = [ordered]@{ error = $_.Exception.GetType().Name }; return ('KAPI: surec listesi okunamadi (' + $_.Exception.GetType().Name + ') - DUR') }
  $script:health.rogue = $rr
  Say ('test/prova sureci (kendi/ust surec disi) eslesen=' + $rr.count + ' [test-uygulama=' + $rr.testApp + ' izleme=' + $rr.viewers + '] (beklenen 0; izleme DAHIL hepsi sayilir)')
  Write-RogueReport $rr
  return [string](Get-RogueGateError $rr)
}
function Test-RogueClassifier {
  # Sentetik surec listeleri (canli listeye BAKMAZ): izleme de sayilir; ayni adli ama baska dizindeki ikili, less/rg/notepad, kabuk
  # sarmalayicisi, BUYUK harfli ve U+0130'lu komut satiri 'test-uygulama'dir; kardes/cocuk surec sayilir; ust surec yalniz gercekse ve baska
  # betik tasimiyorsa dislanir; oge adi korumalari ve kapi karari olculur.
  $t0 = [datetime]'2026-01-01T00:00:00Z'
  $mk = { param($i, $pp, $sec, $n, $c, $x) New-Object psobject -Property @{ ProcessId = $i; ParentProcessId = $pp; CreationDate = $t0.AddSeconds($sec); Name = $n; CommandLine = $c; ExecutablePath = $x } }
  $gitBin = Join-Path $env:ProgramFiles 'Git\usr\bin'
  $pkg = 'D:\repo\project\docs\governance\client-release-r27-r01\scripts\r27-release.ps1'
  $nodeX = 'C:\Program Files\nodejs\node.exe'
  $base = @(
    (& $mk 99 1 0 'powershell.exe' 'powershell.exe -NoExit -NoLogo' 'C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe'),
    (& $mk 100 99 10 'powershell.exe' ('powershell.exe -File ' + $pkg + ' -SelfTest') 'C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe'),
    (& $mk 101 1 5 'tail.exe' 'tail -f D:\x\R27-RELEASE-1.log' (Join-Path $gitBin 'tail.exe')),
    (& $mk 102 1 5 'node.exe' 'node D:\g\d5-portal-reset-live-run.js' $nodeX),
    (& $mk 103 1 5 'tail.exe' 'D:\tmp\tail.exe D:\g\d5-portal-reset-live-run.js' 'D:\tmp\tail.exe'),
    (& $mk 104 1 5 'bash.exe' 'bash -c "tail -f /d/x/r27-x.log"' 'C:\Program Files\Git\usr\bin\bash.exe'),
    (& $mk 105 1 5 'less.exe' 'less D:\x\r27-x.log' (Join-Path $gitBin 'less.exe')),
    (& $mk 106 1 5 'node.exe' 'node D:\app\server.js' $nodeX),
    (& $mk 107 1 5 'node.exe' 'NODE D:\G\SMTP-SINK.JS' $nodeX),
    (& $mk 108 1 5 'cmd.exe' '' ''),
    (& $mk 109 1 5 'node.exe' 'node d6-selftest.js' $nodeX),
    (& $mk 110 1 5 'tail.exe' 'tail -f D:\x\r27-y.log' ''),
    (& $mk 111 99 6 'node.exe' 'node D:\g\d7-portal-messages-live-run.js' $nodeX),
    (& $mk 112 100 11 'node.exe' 'node D:\g\r27-dar-kabul.js after x.json' $nodeX),
    (& $mk 113 1 5 'node.exe' ('node D:\g\SMTP-S' + [string][char]0x0130 + 'NK.JS') $nodeX),
    (& $mk 114 1 5 'pwsh.exe' 'pwsh -NoProfile -File D:\g\d6-owner-live-block.ps1 -Preflight' 'C:\Program Files\PowerShell\7\pwsh.exe'),
    (& $mk 115 1 5 'node.exe' ('node ' + ('x' * 300) + ' D:\g\extacc-uzun-satir.js') $nodeX),
    (& $mk 116 1 5 'python.exe' 'python D:\g\r27-yardimci.py' 'C:\Python\python.exe'))
  $r = Get-RogueReport $base 100 'r27-release.ps1' $pkg
  $cls = @{}; foreach ($it in @($r.items)) { $cls[[string]$it.pid] = [string]$it.class }
  $ok1 = ($r.count -eq 14 -and $r.viewers -eq 1 -and $r.testApp -eq 13 -and $r.scanned -eq 18 -and $r.unreadable -eq 1 -and $r.unreadableShells -eq 1 -and [bool]$r.selfSeen -and @($r.excluded).Count -eq 1 -and
          $cls['101'] -eq 'izleme' -and $cls['102'] -eq 'test-uygulama' -and $cls['103'] -eq 'test-uygulama' -and $cls['104'] -eq 'test-uygulama' -and $cls['105'] -eq 'test-uygulama' -and
          $cls['107'] -eq 'test-uygulama' -and $cls['109'] -eq 'test-uygulama' -and $cls['110'] -eq 'test-uygulama' -and $cls['111'] -eq 'test-uygulama' -and $cls['112'] -eq 'test-uygulama' -and
          $cls['113'] -eq 'test-uygulama' -and $cls['114'] -eq 'test-uygulama' -and $cls['115'] -eq 'test-uygulama' -and $cls['116'] -eq 'test-uygulama' -and
          (-not $cls.ContainsKey('106')) -and (-not $cls.ContainsKey('100')) -and (-not $cls.ContainsKey('99')) -and [string]$r.excluded[0].name -ceq 'powershell.exe' -and [int]$r.excluded[0].pid -eq 99)
  # 70 surecli liste: kosucu SONDA -> sayilir (liste kirpilmaz)
  $big = @(for ($k = 0; $k -lt 69; $k++) { & $mk (200 + $k) 1 5 'svchost.exe' ('svchost.exe -k grup' + $k) 'C:\Windows\System32\svchost.exe' }) + @((& $mk 300 1 5 'node.exe' 'node D:\g\d7-portal-x.js' $nodeX))
  $rb = Get-RogueReport $big 100 'r27-release.ps1' $pkg
  $ok1 = ($ok1 -and $rb.count -eq 1 -and $rb.scanned -eq 70 -and [int]$rb.items[0].pid -eq 300)
  # ust surec baska bir prova betigi tasiyor -> DISLANMAZ, sayilir
  $p2 = @((& $mk 99 1 0 'powershell.exe' 'powershell.exe -File D:\g\r27-fault-prova.ps1' 'C:\w\powershell.exe'), (& $mk 100 99 10 'powershell.exe' ('powershell.exe -File ' + $pkg) 'C:\w\powershell.exe'))
  $r2 = Get-RogueReport $p2 100 'r27-release.ps1' $pkg
  # ust surec pid'i yeniden kullanilmis (kendi surecinden YENI) ve desene esleniyor -> DISLANMAZ, sayilir
  $p3 = @((& $mk 99 1 20 'powershell.exe' ('powershell.exe -File ' + $pkg) 'C:\w\powershell.exe'), (& $mk 100 99 10 'powershell.exe' ('powershell.exe -File ' + $pkg) 'C:\w\powershell.exe'))
  $r3 = Get-RogueReport $p3 100 'r27-release.ps1' $pkg
  # ust surec yalniz bu betigin TAM yolunu (paket dizini 'r27-' tasir) iceriyor ve eski -> dislanir
  $p4 = @((& $mk 99 1 0 'cmd.exe' ('cmd.exe /c powershell -File ' + $pkg) 'C:\w\cmd.exe'), (& $mk 100 99 10 'powershell.exe' ('powershell.exe -File ' + $pkg) 'C:\w\powershell.exe'))
  $r4 = Get-RogueReport $p4 100 'r27-release.ps1' $pkg
  # ust surec bu betigin yani sira AYNI dizindeki baska betigi de tasiyor -> DISLANMAZ
  $p5 = @((& $mk 99 1 0 'cmd.exe' ('cmd.exe /c powershell -File ' + $pkg + ' & node D:\repo\project\docs\governance\client-release-r27-r01\scripts\r27-dar-kabul.js') 'C:\w\cmd.exe'), (& $mk 100 99 10 'powershell.exe' ('powershell.exe -File ' + $pkg) 'C:\w\powershell.exe'))
  $r5 = Get-RogueReport $p5 100 'r27-release.ps1' $pkg
  $ok2 = ($r2.count -eq 1 -and @($r2.excluded).Count -eq 0 -and $r3.count -eq 1 -and @($r3.excluded).Count -eq 0 -and $r4.count -eq 0 -and @($r4.excluded).Count -eq 1 -and $r5.count -eq 1 -and @($r5.excluded).Count -eq 0)
  # ust surec kenar durumlari: dosya adi BASKA bir adin parcasi / baska dizinde ayni ad / tam yol + ek uzanti / yinelenen pid kaydi /
  # olusturma zamani okunamaz -> DISLANMAZ, sayilir. Buyuk-ust (ustun ustu) kosucu -> sayilir. Dizinsiz ya da .\ ile ayni ad -> dislanir.
  $self = (& $mk 100 99 10 'powershell.exe' ('powershell.exe -File ' + $pkg) 'C:\w\powershell.exe')
  $pe = @(
    @{ n = 'ad-parcasi';  l = @((& $mk 99 1 0 'node.exe' 'node D:\g\x-r27-release.ps1.js' $nodeX), $self); c = 1; x = 0 },
    @{ n = 'baska-dizin'; l = @((& $mk 99 1 0 'powershell.exe' 'powershell -File D:\eski\r27-release.ps1' 'C:\w\powershell.exe'), $self); c = 1; x = 0 },
    @{ n = 'ek-uzanti';   l = @((& $mk 99 1 0 'node.exe' ('node ' + $pkg + '.bak.js') $nodeX), $self); c = 1; x = 0 },
    @{ n = 'yinelenen';   l = @((& $mk 99 1 0 'powershell.exe' 'powershell.exe' 'C:\w\powershell.exe'), (& $mk 99 1 0 'node.exe' 'node D:\g\d5-portal-x.js' $nodeX), $self); c = 1; x = 0 },
    @{ n = 'tarih-yok';   l = @((New-Object psobject -Property @{ ProcessId = 99; ParentProcessId = 1; CreationDate = $null; Name = 'cmd.exe'; CommandLine = ('cmd /c powershell -File ' + $pkg); ExecutablePath = 'C:\w\cmd.exe' }), $self); c = 1; x = 0 },
    @{ n = 'buyuk-ust';   l = @((& $mk 98 1 0 'node.exe' 'node D:\g\r26-dar-kabul.js' $nodeX), (& $mk 99 98 1 'powershell.exe' 'powershell.exe' 'C:\w\powershell.exe'), $self); c = 1; x = 1 },
    @{ n = 'dizinsiz-ad'; l = @((& $mk 99 1 0 'cmd.exe' 'cmd /c powershell -File r27-release.ps1' 'C:\w\cmd.exe'), $self); c = 0; x = 1 },
    @{ n = 'nokta-yolu';  l = @((& $mk 99 1 0 'cmd.exe' 'cmd /c powershell -File .\r27-release.ps1' 'C:\w\cmd.exe'), $self); c = 0; x = 1 },
    @{ n = 'esit-zaman';  l = @((& $mk 99 1 10 'cmd.exe' ('cmd /c powershell -File ' + $pkg) 'C:\w\cmd.exe'), $self); c = 0; x = 1 },
    @{ n = 'tarih-bozuk'; l = @((New-Object psobject -Property @{ ProcessId = 99; ParentProcessId = 1; CreationDate = '20260101000000.000000+000'; Name = 'cmd.exe'; CommandLine = ('cmd /c powershell -File ' + $pkg); ExecutablePath = 'C:\w\cmd.exe' }), $self); c = 1; x = 0 },
    @{ n = 'baska-oturum'; l = @((New-Object psobject -Property @{ ProcessId = 100; ParentProcessId = 99; CreationDate = $t0.AddSeconds(10); Name = 'powershell.exe'; CommandLine = ('powershell.exe -File ' + $pkg); ExecutablePath = 'C:\w\powershell.exe'; SessionId = 1 }),
                                 (New-Object psobject -Property @{ ProcessId = 120; ParentProcessId = 1; CreationDate = $t0.AddSeconds(5); Name = 'node.exe'; CommandLine = 'node D:\g\d7-portal-x.js'; ExecutablePath = $nodeX; SessionId = 0 })); c = 1; x = 0 })
  foreach ($e in $pe) { $re = Get-RogueReport $e.l 100 'r27-release.ps1' $pkg; if ($re.count -ne $e.c -or @($re.excluded).Count -ne $e.x) { $ok2 = $false } }
  $long = 'r27-' + ('ab-' * 20) + 'x.js'
  $ok3 = ((Get-RogueItemName 'node D:\g\d5-portal-x.js postgresql://kullanici:gizli@127.0.0.1:1/db') -ceq 'd5-portal-x.js' -and (Get-RogueItemName 'tail -f D:\x\r27-x.log') -ceq 'r27-x.log' -and
          (Get-RogueItemName ('powershell -File "' + $pkg + '"')) -ceq 'r27-release.ps1' -and (Get-RogueItemName 'node x.js --token extacc-S3CR3T.json') -ceq '' -and
          (Get-RogueItemName 'node extacc-S3CR3T.key') -ceq '' -and (Get-RogueItemName 'node r27-S3CR3T~y.js') -ceq '' -and (Get-RogueItemName 'node r27-x.js;S3CR3T.js') -ceq '' -and
          (Get-RogueItemName ('node ' + $long)) -ceq '' -and (Get-RogueItemName 'node extacc-A1b2C3d4E5f6G7h8I9j0K.js') -ceq '' -and (Get-RogueItemName 'node D:\r27-x\S3CR3T.txt') -ceq '' -and
          (Get-RogueItemName 'curl https://host/extacc-S3.json') -ceq '' -and (Get-RogueItemName 'node --a:b\r27-S3.cmd') -ceq '' -and
          (Get-RogueItemName 'node D:\a=b\r27-x.js') -ceq '' -and (Get-RogueItemName 'node a://x/r27-x.js') -ceq '' -and (Get-RogueItemName 'node extacc-S3CR3T') -ceq '' -and
          (Get-RogueItemName ('node D:\g\SMTP-S' + [string][char]0x0130 + 'NK.JS')) -ceq 'SMTP-SINK.JS')
  $g = { param($c, $sc, $sim, $ss) [ordered]@{ count = $c; scanned = $sc; simulated = $sim; selfSeen = $ss } }
  $ok4 = ((Get-RogueGateError (& $g 0 25 $false $true)) -ceq '' -and (Get-RogueGateError (& $g 1 25 $false $true)) -match 'izleme dahil 1 eslesme' -and (Get-RogueGateError (& $g 0 0 $false $true)) -match 'taranamadi \(taranan=0\)' -and
          (Get-RogueGateError (& $g 0 25 $false $false)) -match 'guvenilir degil' -and (Get-RogueGateError (& $g 0 0 $true $false)) -ceq '' -and (Get-RogueGateError (& $g 2 0 $true $false)) -match 'izleme dahil 2 eslesme' -and
          (Get-RogueGateError (& $g 0 19 $false $true)) -match 'eksik \(taranan=19 < 20' -and (Get-RogueGateError (& $g 0 20 $false $true)) -ceq '' -and (Get-RogueGateError $null) -match 'raporu yok')
  # tum komut satirlari okunamaz (kendi sureci dahil) -> selfSeen=false -> kapi GECMEZ ; liste $null -> taranan=0
  $r6 = Get-RogueReport @((& $mk 100 99 10 'powershell.exe' '' ''), (& $mk 102 1 5 'node.exe' '' '')) 100 'r27-release.ps1' $pkg; $r6.simulated = $false
  $r7 = Get-RogueReport $null 100 'r27-release.ps1' $pkg; $r7.simulated = $false
  # kendi komut satiri OKUNUYOR ama betik adini tasimiyor -> kanarya DUR ; kendi pid'i iki kez -> kendi sureci dislanmaz, kanarya DUR
  $r8 = Get-RogueReport @((& $mk 100 99 10 'powershell.exe' 'powershell.exe -NoProfile' 'C:\w\powershell.exe'), (& $mk 99 1 0 'powershell.exe' 'powershell.exe' 'C:\w\powershell.exe')) 100 'r27-release.ps1' $pkg; $r8.simulated = $false
  $r9 = Get-RogueReport @($self, (& $mk 100 99 10 'powershell.exe' ('powershell.exe -File ' + $pkg) 'C:\w\powershell.exe')) 100 'r27-release.ps1' $pkg; $r9.simulated = $false
  $ok5 = ((-not [bool]$r6.selfSeen) -and $r6.unreadableShells -eq 2 -and (Get-RogueGateError $r6) -match 'guvenilir degil' -and $r7.scanned -eq 0 -and (Get-RogueGateError $r7) -match 'taranamadi \(taranan=0\)' -and
          (-not [bool]$r8.selfSeen) -and (Get-RogueGateError $r8) -match 'guvenilir degil' -and $r9.count -eq 2 -and (Get-RogueGateError $r9) -match 'izleme dahil 2 eslesme')
  return ($ok1 -and $ok2 -and $ok3 -and $ok4 -and $ok5)
}
function Get-Pids([int]$port) {
  if ($TEST) { $s = Get-SimState; if ($port -eq $API_PORT) { if ([bool]$s.apiRunning) { return @([int]$s.apiPid) } else { return @() } } else { if ([bool]$s.webRunning) { return @([int]$s.webPid) } else { return @() } } }
  return @((Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue).OwningProcess | Sort-Object -Unique)
}
function Invoke-StopTask([string]$task) {
  if ($TEST) {
    $s = Get-SimState; $s.stopCalls = [int]$s.stopCalls + 1
    if ($task -eq $API_TASK) { $s.apiRunning = $false }
    elseif ($Fault -eq 'stop-fail') { $script:FAULT_LOG.Add('stop: web kapanmadi'); Add-SimEvent $s ('stop ' + $task + ': FAULT stop-fail -> WEB KAPANMADI (enjekte)') }
    else { $s.webRunning = $false }
    Add-SimEvent $s ('stop ' + $task); Set-SimState $s; return
  }
  Stop-ScheduledTask -TaskName $task
}
function Invoke-StartTask([string]$task) {
  if ($task -eq $API_TASK) { $script:API_STARTED = $true } else { $script:WEB_STARTED = $true }
  if ($TEST) {
    $s = Get-SimState; $s.startCalls = [int]$s.startCalls + 1
    if ($task -eq $API_TASK) {
      if (($Fault -eq 'service-start-fail' -or $Fault -eq 'restore-hash-mismatch') -and (Test-CandidateMarkerPresent)) {
        Add-SimEvent $s ('start ' + $task + ': FAULT ' + $Fault + ' -> aday API dinleyicisi HIC GELMEZ (enjekte)'); $script:FAULT_LOG.Add('service-start: api gelmedi')
      } else {
        $s.apiRunning = $true; New-Item -ItemType Directory -Force -Path $API_LOG_DIR | Out-Null
        $lf = Join-Path $API_LOG_DIR ('api-out.' + (Get-Date).ToUniversalTime().ToString('yyyyMMdd-HHmmss-fff') + '.log')
        [IO.File]::WriteAllText($lf, ('[SIM] Nest application starting' + "`n" + 'Mapped {' + $ROUTE + ', POST} route' + "`n" + $PORTAL_MAPPED + "`n" + 'Mapped {/api/auth/me, GET} route' + "`n"))
        Add-SimEvent $s ('start ' + $task + ' -> running; boot log ' + $lf)
      }
    } else { $s.webRunning = $true; Add-SimEvent $s ('start ' + $task + ' -> running') }
    Set-SimState $s; return
  }
  Start-ScheduledTask -TaskName $task
}
function Wait-Stopped([string]$task, [int]$port, [string]$hostArg, [int]$TimeoutSec = 90) {
  if ($TEST) { return ((Get-Pids $port).Count -eq 0 -and (Get-TaskState $task) -ne 'Running') }
  $deadline = (Get-Date).AddSeconds($TimeoutSec)
  while ((Get-Date) -lt $deadline) {
    $listen = @(Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue)
    $procs = @(Get-CimInstance Win32_Process -Filter "Name='hukuk-task-host.exe'" -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -match ('(^|\s)' + $hostArg + '(\s|$)') })
    $state = (Get-ScheduledTask -TaskName $task).State
    if ($listen.Count -eq 0 -and $procs.Count -eq 0 -and $state -ne 'Running') { return $true }
    Start-Sleep -Seconds 2
  }
  return $false
}
function Http([string]$method, [string]$url, [int]$timeoutMs = 8000) {
  if ($TEST) {
    $s = Get-SimState; $u = [Uri]$url; $path = $u.AbsolutePath
    if ($u.Port -eq $API_PORT) { if (-not [bool]$s.apiRunning) { return -1 }; return 401 }
    if ($u.Port -eq $WEB_PORT) {
      if (-not [bool]$s.webRunning) { return -1 }
      if ($path -eq '/portal/login') { return 200 }
      if ($path -like '/_next/static/*/_buildManifest.js') { $bid = $path.Split('/')[3]; $cur = $(try { Get-BuildId $LIVE_NEXT } catch { '' }); if ($bid -ceq $cur) { return 200 } else { return 404 } }
      if ($path -like '/intake/*') { return 200 }
      if ($path -like '/api/*') { if ([bool]$s.apiRunning) { return 401 } else { return 502 } }
      return 404
    }
    return -2
  }
  try {
    $r = [Net.HttpWebRequest]::Create($url); $r.Method = $method; $r.Timeout = $timeoutMs; $r.ReadWriteTimeout = $timeoutMs
    $r.AllowAutoRedirect = $false; $r.UserAgent = 'r26-release-check'
    if ($method -eq 'POST') { $r.ContentType = 'application/json'; $b = [Text.Encoding]::UTF8.GetBytes('{}'); $r.ContentLength = $b.Length; $s = $r.GetRequestStream(); $s.Write($b, 0, $b.Length); $s.Dispose() }
    $resp = $r.GetResponse(); $code = [int]$resp.StatusCode; $resp.Dispose(); return $code
  } catch [Net.WebException] {
    if ($_.Exception.Response) { return [int]([Net.HttpWebResponse]$_.Exception.Response).StatusCode }
    return -1
  } catch { return -2 }
}
# Yeni olusan dizin kokten KALITIM almali (korumali degil, acik kural 0) - canli .next ile ayni ACL modeli. TestRoot: simule (olculmez).
function Test-InheritOnly([string]$p) {
  if ($TEST) { return $true }
  $a = Get-Acl -LiteralPath $p
  return ((-not $a.AreAccessRulesProtected) -and (@($a.Access | Where-Object { -not $_.IsInherited }).Count -eq 0))
}
function Get-LauncherTuple {
  if ($TEST) { return [string](Get-SimState).launcherTuple }
  $a = Get-R26FileSha256 $API_LAUNCHER; $h = Get-R26FileSha256 $HOST_EXE; $w = Get-R26FileSha256 $WEB_LAUNCHER
  foreach ($t in $LAUNCH_TUPLES) { if ($a -ceq $t.api -and $h -ceq $t.host -and $w -ceq $t.web) { return $t.name } }
  return ('TANIMSIZ api=' + $a.Substring(0, 8) + ' host=' + $h.Substring(0, 8) + ' web=' + $w.Substring(0, 8))
}
function Get-ServiceState {
  $r = [ordered]@{}
  try { $r.apiListeners = @(Get-Pids $API_PORT); $r.webListeners = @(Get-Pids $WEB_PORT); $r.apiTask = Get-TaskState $API_TASK; $r.webTask = Get-TaskState $WEB_TASK } catch { $r.error = $_.Exception.Message }
  if ($TEST) { try { $s = Get-SimState; $r.sim = [ordered]@{ apiRunning = [bool]$s.apiRunning; webRunning = [bool]$s.webRunning; stopCalls = [int]$s.stopCalls; startCalls = [int]$s.startCalls } } catch { $r.simError = $_.Exception.Message } }
  return $r
}
function Get-FileState {
  return [ordered]@{
    liveNextExists = (Test-Path -LiteralPath $LIVE_NEXT); preDirExists = (Test-Path -LiteralPath $PRE); stagedDirExists = (Test-Path -LiteralPath $STAGED); failedNextExists = (Test-Path -LiteralPath $FAILED_NEXT)
    quarantineExists = (Test-Path -LiteralPath $QUAR); quarantineFiles = $(if (Test-Path -LiteralPath $QUAR) { @(Get-ChildItem -LiteralPath $QUAR -Recurse -File -Force).Count } else { 0 })
    addedPresentInLive = @($ADDED | Where-Object { Test-Path -LiteralPath (Join-Path $LIVE ($_ -replace '/', '\')) -PathType Leaf })
    backupApiExists = (Test-Path -LiteralPath $BK_API); backupWebExists = (Test-Path -LiteralPath $BK_WEB)
  }
}
# ---------------------------------------------------------------- GERI ALMA
# Restore-All: dosya islemleri; hata -> throw (cagiran ROLLBACK-ENGELLENDI yapar). Adim durumu $script:RESTORE_STEPS'te.
function Restore-All {
  Set-Stage 'R-geri-yukle'
  Say 'GERI ALMA: API degisen dosyalar yedekten + EKLENEN dosyalar karantinaya (silme yok) + WEB .next + next.config.js yedekten'
  $steps = [ordered]@{ 'api-eklenen-karantina' = 'BEKLIYOR'; 'api-degisen-yedekten' = 'BEKLIYOR'; 'web-next-geri' = 'BEKLIYOR'; 'web-cfg-geri' = 'BEKLIYOR' }
  $script:RESTORE_STEPS = $steps
  $steps['api-eklenen-karantina'] = 'BASLADI'
  New-Item -ItemType Directory -Force -Path $QUAR | Out-Null
  $moved = 0
  foreach ($rel in $ADDED) {
    $dst = Join-Path $LIVE ($rel -replace '/', '\')
    if (Test-Path -LiteralPath $dst -PathType Leaf) { $q = Join-Path $QUAR ($rel -replace '/', '\'); New-Item -ItemType Directory -Force -Path (Split-Path $q) | Out-Null; Move-Item -LiteralPath $dst -Destination $q -Force; $moved++ }
  }
  $steps['api-eklenen-karantina'] = ('TAMAM (' + $moved + ' dosya karantinada: ' + $QUAR + ')')
  $steps['api-degisen-yedekten'] = 'BASLADI'
  $copied = 0
  foreach ($rel in $FILES) {
    if ($ADDED -contains $rel) { continue }
    $dst = Join-Path $LIVE ($rel -replace '/', '\')
    Copy-Item -LiteralPath (Join-Path $BK_API ($rel -replace '/', '\')) -Destination $dst -Force; $copied++
  }
  $steps['api-degisen-yedekten'] = ('TAMAM (' + $copied + ' dosya)')
  $steps['web-next-geri'] = 'BASLADI'
  if (Test-Path -LiteralPath $PRE) {
    # takas basladi: eski .next $PRE'de. Mevcut .next (aday ya da yarim) yeniden adlandirilir, eski geri tasinir (silme yok)
    if (Test-Path -LiteralPath $LIVE_NEXT) { Move-Item -LiteralPath $LIVE_NEXT -Destination $FAILED_NEXT }
    Move-Item -LiteralPath $PRE -Destination $LIVE_NEXT
    $steps['web-next-geri'] = ('TAMAM (' + $PRE + ' -> .next' + $(if (Test-Path -LiteralPath $FAILED_NEXT) { '; aday .next -> ' + $FAILED_NEXT } else { '' }) + ')')
  } else {
    $webNow = $(if (Test-Path -LiteralPath $LIVE_NEXT) { Get-TreeDigest (Get-Map $LIVE_NEXT -Web) } else { 'YOK' })
    if ($webNow -cne $EXP_WEB_LIVE) {
      if (Test-Path -LiteralPath $LIVE_NEXT) { Move-Item -LiteralPath $LIVE_NEXT -Destination $FAILED_NEXT }
      $global:LASTEXITCODE = 0
      & robocopy.exe (Join-Path $BK_WEB '.next') $LIVE_NEXT /E /R:0 /W:0 /NFL /NDL /NJH /NJS | Out-Null
      if ($LASTEXITCODE -ge 8) { throw ('web yedek geri kopyalama robocopy ' + $LASTEXITCODE) }
      $steps['web-next-geri'] = 'TAMAM (yedekten robocopy)'
    } else { $steps['web-next-geri'] = 'TAMAM (dokunulmadi; taban)' }
  }
  $steps['web-cfg-geri'] = 'BASLADI'
  Copy-Item -LiteralPath (Join-Path $BK_WEB 'next.config.js') -Destination $LIVE_CFG -Force
  $steps['web-cfg-geri'] = 'TAMAM'
}
# Test-RestoredIdentity: geri yuklenen kimlik; her olcum korumali; uyusmayanlar listelenir.
function Test-RestoredIdentity {
  Set-Stage 'R-dogrula'
  $v = [ordered]@{ ok = $false; mismatches = @() }
  $mm = New-Object System.Collections.Generic.List[string]
  try { Invoke-FaultPoint 'restore-read' 1; $v.apiTree = Get-TreeDigest (Get-Map $LIVE) } catch { $v.apiTree = 'OKUNAMADI: ' + $_.Exception.Message }
  $v.apiTreeExpected = $EXP_LIVE; $v.apiTreeOk = ($v.apiTree -ceq $EXP_LIVE); if (-not $v.apiTreeOk) { $mm.Add('API agac digest: ' + $v.apiTree + ' != ' + $EXP_LIVE) }
  try { Invoke-FaultPoint 'restore-read' 2; $v.pkg = Get-PackageDigest $LIVE } catch { $v.pkg = 'OKUNAMADI: ' + $_.Exception.Message }
  $v.pkgExpected = $EXP_PKG_LIVE; $v.pkgOk = ($v.pkg -ceq $EXP_PKG_LIVE); if (-not $v.pkgOk) { $mm.Add('API 16 dosya paket digest: ' + $v.pkg + ' != ' + $EXP_PKG_LIVE) }
  if (-not $v.pkgOk -or -not $v.apiTreeOk) {
    # dosya bazinda uyusmayanlar (yedekle karsilastir)
    $bad = New-Object System.Collections.Generic.List[string]
    foreach ($rel in $FILES) {
      $p = Join-Path $LIVE ($rel -replace '/', '\'); $b = Join-Path $BK_API ($rel -replace '/', '\')
      try {
        if ($ADDED -contains $rel) { if (Test-Path -LiteralPath $p -PathType Leaf) { $bad.Add($rel + ' (eklenen dosya hala canlida)') } }
        else { $hp = $(if (Test-Path -LiteralPath $p -PathType Leaf) { Get-R26FileSha256 $p } else { 'YOK' }); $hb = $(if (Test-Path -LiteralPath $b -PathType Leaf) { Get-R26FileSha256 $b } else { 'YEDEKTE YOK' }); if ($hp -cne $hb) { $bad.Add($rel + ' canli=' + $hp.Substring(0, [Math]::Min(16, $hp.Length)) + ' yedek=' + $hb.Substring(0, [Math]::Min(16, $hb.Length))) } }
      } catch { $bad.Add($rel + ' OKUNAMADI: ' + $_.Exception.Message) }
    }
    $v.mismatchedFiles = @($bad)
  }
  $v.addedPresent = @($ADDED | Where-Object { Test-Path -LiteralPath (Join-Path $LIVE ($_ -replace '/', '\')) -PathType Leaf })
  $v.addedOk = ($v.addedPresent.Count -eq 0); if (-not $v.addedOk) { $mm.Add('eklenen dosyalar hala canlida: ' + ($v.addedPresent -join ',')) }
  $v.quarantineFiles = $(if (Test-Path -LiteralPath $QUAR) { @(Get-ChildItem -LiteralPath $QUAR -Recurse -File -Force).Count } else { 0 })
  try { Invoke-FaultPoint 'restore-read' 3; $v.webTree = $(if (Test-Path -LiteralPath $LIVE_NEXT) { Get-TreeDigest (Get-Map $LIVE_NEXT -Web) } else { 'YOK' }) } catch { $v.webTree = 'OKUNAMADI: ' + $_.Exception.Message }
  $v.webTreeExpected = $EXP_WEB_LIVE; $v.webTreeOk = ($v.webTree -ceq $EXP_WEB_LIVE); if (-not $v.webTreeOk) { $mm.Add('WEB .next digest: ' + $v.webTree + ' != ' + $EXP_WEB_LIVE) }
  try { $v.buildId = Get-BuildId $LIVE_NEXT } catch { $v.buildId = 'OKUNAMADI: ' + $_.Exception.Message }
  $v.buildIdExpected = $BID_LIVE; $v.buildIdOk = ($v.buildId -ceq $BID_LIVE); if (-not $v.buildIdOk) { $mm.Add('BUILD_ID: ' + $v.buildId + ' != ' + $BID_LIVE) }
  try { $v.cfg = Get-R26FileSha256 $LIVE_CFG } catch { $v.cfg = 'OKUNAMADI: ' + $_.Exception.Message }
  $v.cfgExpected = $CFG_LIVE; $v.cfgOk = ($v.cfg -ceq $CFG_LIVE); if (-not $v.cfgOk) { $mm.Add('next.config.js: ' + $v.cfg + ' != ' + $CFG_LIVE) }
  $v.mismatches = @($mm); $v.ok = ($mm.Count -eq 0)
  Say ('GERI YUKLENEN KIMLIK: api agac=' + $v.apiTreeOk + ' paket=' + $v.pkgOk + ' eklenen yok=' + $v.addedOk + ' (karantina ' + $v.quarantineFiles + ') | web agac=' + $v.webTreeOk + ' BUILD_ID=' + $v.buildIdOk + ' cfg=' + $v.cfgOk + ' -> ' + $(if ($v.ok) { 'PASS' } else { 'FAIL: ' + ($mm -join ' ; ') }))
  return $v
}
# Start-Both-And-Report: eski servisleri baslatir; 'eski servisler ayakta' olcutu B3 (r27-rollback.ps1 6-kapsam) ile AYNI kume:
#   API dinleyici ==1, /api/auth/me 401, run-now 401, portal/cases 401, surec koku RELEASE23 ; WEB dinleyici ==1, /portal/login 200,
#   buildManifest(BID_LIVE) 200, surec koku RELEASE23 ; baslatici uclusu degismedi.
function Start-Both-And-Report {
  Set-Stage 'R-baslat'
  Invoke-StartTask $API_TASK
  $d = (Get-Date).AddSeconds(120); $me = -1; $hp = @()
  while ((Get-Date) -lt $d) { $hp = Get-Pids $API_PORT; if ($hp.Count -ge 1) { $me = Http 'GET' ('http://127.0.0.1:' + $API_PORT + '/api/auth/me'); if ($me -gt 0) { break } }; if ($TEST) { break }; Start-Sleep -Seconds 3 }
  $rn = Http 'POST' ('http://127.0.0.1:' + $API_PORT + $ROUTE); $pc = Http 'GET' ('http://127.0.0.1:' + $API_PORT + $PORTAL_GET)
  $apiRoot = $false; if ($hp.Count -eq 1) { $apiRoot = $(try { (Get-ProcCommandLine $hp[0]) -match 'HY_W4_RELEASE23' } catch { $false }) }
  Invoke-StartTask $WEB_TASK
  $d = (Get-Date).AddSeconds(180); $pl = -1; $wp = @()
  while ((Get-Date) -lt $d) { $wp = Get-Pids $WEB_PORT; if ($wp.Count -ge 1) { $pl = Http 'GET' ('http://127.0.0.1:' + $WEB_PORT + '/portal/login'); if ($pl -gt 0) { break } }; if ($TEST) { break }; Start-Sleep -Seconds 3 }
  $bm = Http 'GET' ('http://127.0.0.1:' + $WEB_PORT + '/_next/static/' + $BID_LIVE + '/_buildManifest.js')
  $webRoot = $false; if ($wp.Count -eq 1) { $webRoot = $(try { (Get-ProcCommandLine $wp[0]) -match 'HY_W4_RELEASE23' } catch { $false }) }
  $tuple1 = $(try { Get-LauncherTuple } catch { 'OKUNAMADI' }); $tupleOk = ($tuple1 -ceq $script:tuple0)
  $up = ($hp.Count -eq 1 -and $me -eq 401 -and $rn -eq 401 -and $pc -eq 401 -and $apiRoot -and $wp.Count -eq 1 -and $pl -eq 200 -and $bm -eq 200 -and $webRoot -and $tupleOk)
  Say ('baslatma sonrasi: api pid=' + ($hp -join ',') + ' kok=' + $apiRoot + ' /api/auth/me=' + $me + ' run-now=' + $rn + ' portal/cases=' + $pc + ' | web pid=' + ($wp -join ',') + ' kok=' + $webRoot + ' /portal/login=' + $pl + ' buildManifest(' + $BID_LIVE + ')=' + $bm + ' | uclu degismedi=' + $tupleOk + ' (' + $tuple1 + ') -> ' + $(if ($up) { 'AYAKTA' } else { 'GELMEDI' }))
  $script:ROLLBACK.postStart = [ordered]@{ ok = $up; apiPids = @($hp); apiRootOk = $apiRoot; apiAuthMe = $me; runNow = $rn; portalCases = $pc; webPids = @($wp); webRootOk = $webRoot; webPortalLogin = $pl; buildManifest = $bm; tuple = $tuple1; tupleUnchanged = $tupleOk }
  return $up
}
function Get-RecoveryText([string]$verdict) {
  $b3 = ('powershell.exe -NoProfile -ExecutionPolicy Bypass -File "' + $ROLLBACK_SCRIPT + '" -BackupApiDir "' + $BK_API + '" -BackupWebDir "' + $BK_WEB + '"' + $(if ($TEST) { ' -TestRoot "' + $TestRoot + '"' } else { '' }))
  $stopFailed = ($script:ROLLBACK -and ($script:ROLLBACK.stoppedBeforeRestore -eq $false))
  $lines = @(
    ('VERDICT ' + $verdict + ' - SERVISLER BASLATILMADI (kimlik dogrulanmadan baslatma YOK).'),
    ('1) Once B3 SelfTest (yedek kimligi): ' + $b3 + ' -SelfTest'),
    ('2) SelfTest PASS ise B3 geri alma (YUKSELTILMIS pencere): ' + $b3),
    ('   Yedekler: API=' + $BK_API + ' | WEB=' + $BK_WEB + ' (icinde .next + next.config.js)'),
    ('   Eski .next yerinde durabilir: ' + $PRE + ' ; aday/yarim .next: ' + $FAILED_NEXT + ' ya da ' + $LIVE_NEXT + ' ; hazirlik kopyasi: ' + $STAGED),
    ('   Eklenen dosya karantinasi: ' + $QUAR + ' (silme yok)'),
    '3) B3 de PASS degilse ESCALATE: canli dosyalara elle dokunma; kanit JSON verify.mismatches + rollback.restoreSteps ile owner karari.')
  if ($verdict -eq 'ROLLBACK-ENGELLENDI' -and $stopFailed) {
    $lines = @(
      'VERDICT ROLLBACK-ENGELLENDI - SUREC KAPANMADI: aday dosyalarla baslatilmis API/WEB HALA CALISIYOR OLABILIR (bkz. kanit serviceState + rollback.stopError); dosyalara DOKUNULMADI (canli = aday kimligi).',
      ('0) ONCE elle durdurma (YUKSELTILMIS): Stop-ScheduledTask ' + $API_TASK + ' ; Stop-ScheduledTask ' + $WEB_TASK + ' ; :' + $API_PORT + '/:' + $WEB_PORT + ' dinleyicisi 0 ve hukuk-task-host.exe sureci 0 olana kadar bekle (kanit serviceState ile karsilastir).')) + $lines[1..($lines.Count - 1)]
  } elseif ($verdict -eq 'ROLLBACK-ENGELLENDI') {
    $lines = @('VERDICT ROLLBACK-ENGELLENDI - geri yukleme DOSYA ISLEMI basarisiz; servisler DURMUS ve BASLATILMADI; tamamlanan/kalan adimlar kanit JSON restoreSteps alaninda.') + $lines[1..($lines.Count - 1)]
  }
  if ($verdict -eq 'ROLLBACK-OK-ESKI-BASLAMADI') { $lines = @('VERDICT ROLLBACK-OK-ESKI-BASLAMADI - dosyalar TABAN kimliginde dogrulandi, eski servisler gelmedi ya da saglik kumesi tutmadi (kanit rollback.postStart). ESCALATE: gorev/launcher/log incelemesi (' + $API_LOG_DIR + '); dosya islemi GEREKMEZ.') + $lines[1..($lines.Count - 1)] }
  return $lines
}
function Invoke-Rollback([string]$reason) {
  $script:ROLLBACK = [ordered]@{ attempted = $true; reason = $reason; triggeredAtStage = $script:FAILED_AT; stoppedBeforeRestore = $null; restoreError = $null; verify = $null; servicesStarted = $false; postStart = $null }
  Say ('GERI ALMA TETIKLENDI (' + $script:FAILED_AT + '): ' + $reason)
  # R-durdur: takas sonrasi baslatilmis servis varsa once kapat
  if ($script:API_STARTED -or $script:WEB_STARTED) {
    Set-Stage 'R-durdur'
    $ws = $true; $as = $true
    try {
      if ($script:WEB_STARTED) { Invoke-StopTask $WEB_TASK; $ws = Wait-Stopped $WEB_TASK $WEB_PORT 'web' 90 }
      if ($script:API_STARTED) { Invoke-StopTask $API_TASK; $as = Wait-Stopped $API_TASK $API_PORT 'api' 90 }
    } catch { $ws = $false; $script:ROLLBACK.stopError = $_.Exception.Message }
    $script:ROLLBACK.stoppedBeforeRestore = ($ws -and $as)
    if (-not ($ws -and $as)) {
      Say 'UYARI: surec kapanmadi, dosyalara dokunulmadi -> ROLLBACK-ENGELLENDI'
      $script:RESTORE_STEPS = [ordered]@{ 'durdur' = 'BASARISIZ (web=' + $ws + ' api=' + $as + ')'; 'api-eklenen-karantina' = 'KALAN'; 'api-degisen-yedekten' = 'KALAN'; 'web-next-geri' = 'KALAN'; 'web-cfg-geri' = 'KALAN' }
      $script:VERDICT = 'ROLLBACK-ENGELLENDI'; $script:EXIT = 12; $script:RECOVERY = Get-RecoveryText $script:VERDICT; return
    }
  } else { $script:ROLLBACK.stoppedBeforeRestore = $true }
  try { Restore-All } catch {
    $script:ROLLBACK.restoreError = $_.Exception.Message
    Say ('HATA geri yukleme: ' + $_.Exception.Message + ' -> ROLLBACK-ENGELLENDI')
    if ($script:RESTORE_STEPS) { foreach ($k in @($script:RESTORE_STEPS.Keys)) { if ($script:RESTORE_STEPS[$k] -eq 'BASLADI') { $script:RESTORE_STEPS[$k] = 'BASARISIZ: ' + $_.Exception.Message } elseif ($script:RESTORE_STEPS[$k] -eq 'BEKLIYOR') { $script:RESTORE_STEPS[$k] = 'KALAN' } } }
    $script:VERDICT = 'ROLLBACK-ENGELLENDI'; $script:EXIT = 12; $script:RECOVERY = Get-RecoveryText $script:VERDICT; return
  }
  Invoke-FaultPoint 'restore-verify'
  $v = Test-RestoredIdentity; $script:VERIFY = $v; $script:ROLLBACK.verify = $v
  if (-not $v.ok) {
    Say 'KAPI: geri yuklenen kimlik dogrulanamadi -> SERVIS BASLATILMIYOR -> ROLLBACK-DOGRULANAMADI'
    $script:VERDICT = 'ROLLBACK-DOGRULANAMADI'; $script:EXIT = 11; $script:RECOVERY = Get-RecoveryText $script:VERDICT; return
  }
  # Dosyalar taban kimliginde DOGRULANDI: bu noktadan sonra beklenmeyen istisna (orn. Start-ScheduledTask) 12 DEGIL 13'tur -> ON ATAMA
  $script:VERDICT = 'ROLLBACK-OK-ESKI-BASLAMADI'; $script:EXIT = 13
  $up = Start-Both-And-Report; $script:ROLLBACK.servicesStarted = $true
  if ($up) { $script:VERDICT = 'ROLLBACK'; $script:EXIT = 10; $script:RECOVERY = $null }
  else { $script:VERDICT = 'ROLLBACK-OK-ESKI-BASLAMADI'; $script:EXIT = 13; $script:RECOVERY = Get-RecoveryText $script:VERDICT }
}
# ---------------------------------------------------------------- KANIT (korumali)
function Write-EvidenceProtected {
  $lastStage = $script:STAGE   # kanit asamasindan ONCEKI son asama ('stage' alani; '7-kanit' degil)
  Set-Stage '7-kanit'
  $evid = [ordered]@{
    record = 'R27-RELEASE-EXECUTION'; tsUtc = $ts; verdict = $script:VERDICT; exitCode = $script:EXIT
    stage = $lastStage; failedAt = $script:FAILED_AT; error = $script:ERR; stages = @($script:STAGES)
    testMode = [ordered]@{ enabled = $TEST; testRoot = $(if ($TEST) { $TestRoot } else { $null }); fault = $(if ($TEST) { $Fault } else { $null }); faultLog = @($script:FAULT_LOG); simulated = @('elevation', 'tasks', 'listeners', 'http', 'boot-log', 'launcher-tuple', 'acl', 'rogue-process') }
    sourceSha = '1b758d29c45033311c8c2c0ea598619d6bba13a0'; sourceBranch = 'release/r27-candidate'; baseSha = 'c7a154b3 (canli R26 kaynagi)'
    prs = @('#2830 D5-SEC-R01/R03 (f8f1b013)', '#2832 D5-SEC-R02 (b84919ad)', 'common/trust-proxy.config.ts test yardimcisi (#2730 birebir)'); excluded = @('K3/claim-item PR''lari', 'office-authz #2818/#2821/#2824/#2825', '3 migration', 'diger main degisiklikleri')
    addedFiles = $ADDED; quarantineDir = $QUAR
    launcherTuple = $script:tuple0
    api = [ordered]@{ liveBaseline = $EXP_LIVE; candidate = $EXP_CAND; pkgLive = $EXP_PKG_LIVE; pkgCandidate = $EXP_PKG_CAND; changedFiles = $FILES; backup = $BK_API }
    web = [ordered]@{ liveBaseline = $EXP_WEB_LIVE; candidate = $EXP_WEB_CAND; buildIdBefore = $BID_LIVE; buildIdAfter = $BID_CAND; nextConfigBefore = $CFG_LIVE; nextConfigAfter = $CFG_CAND; backup = $BK_WEB; preDirInPlace = $PRE; stagedDir = $STAGED; failedNextDir = $FAILED_NEXT }
    health = $script:health
    rollback = $script:ROLLBACK; restoreSteps = $script:RESTORE_STEPS; verify = $script:VERIFY; recovery = $script:RECOVERY
    fileState = $(try { Get-FileState } catch { @{ error = $_.Exception.Message } })
    serviceState = $(try { Get-ServiceState } catch { @{ error = $_.Exception.Message } })
    migrationRun = $false; launcherChanged = $false; envRead = $false; deleted = 0
    log = @($log)
  }
  $json = $(try { $evid | ConvertTo-Json -Depth 8 } catch { '{"record":"R27-RELEASE-EXECUTION","verdict":"' + $script:VERDICT + '","exitCode":' + $script:EXIT + ',"jsonError":"' + ($_.Exception.Message -replace '"', '''') + '"}' })
  $name = 'R27-RELEASE-' + $ts + '.json'
  $written = $null
  $fallback = Join-Path ([IO.Path]::GetFullPath($env:TEMP)) 'r27-evidence-fallback'
  # yukseltilmemis (yanlislikla/parametresiz) kosum canli kanit dizinine dosya BIRAKMAZ: yalniz %TEMP% fallback
  $dirs = $(if ($script:NOT_ELEVATED) { Write-Host ('KANIT: yukseltilmemis kosum - canli kanit dizinine yazilmaz, fallback: ' + $fallback); @($fallback) } else { @($EVID_DIR, $fallback) })
  foreach ($dir in $dirs) {
    try {
      New-Item -ItemType Directory -Force -Path $dir | Out-Null
      $f = Join-Path $dir $name
      [IO.File]::WriteAllText($f, $json, (New-Object Text.UTF8Encoding($false)))
      $written = $f; break
    } catch { Write-Host ('KANIT YAZILAMADI (' + $dir + '): ' + $_.Exception.Message) }
  }
  if ($written) { Write-Host ('KANIT: ' + $written + ' sha256=' + (Get-R26FileSha256 $written)) }
  else { Write-Host 'KANIT: HICBIR DIZINE YAZILAMADI - JSON konsolda:'; Write-Host $json }
  if ($script:RECOVERY) { foreach ($l in $script:RECOVERY) { Write-Host ('KURTARMA: ' + $l) } }
  Write-Host ('=== SONUC: ' + $script:VERDICT + ' (cikis ' + $script:EXIT + ')')
}

if ($SelfTest) {
  Say '=== SELFTEST (canliya dokunmaz: durdurma/takas/kopyalama/yazma YOK)'
  $fails = 0
  $cmd = Get-Command Get-R26FileSha256 -ErrorAction SilentlyContinue
  $isFunc = ($null -ne $cmd -and $cmd.CommandType -eq 'Function')
  Say ('ad cozumleme: Get-R26FileSha256 -> ' + $(if ($cmd) { [string]$cmd.CommandType } else { 'YOK' }) + ' | fonksiyon=' + $isFunc)
  if (-not $isFunc) { $fails++ }
  $al = @('Get-R26FileSha256', 'Get-Map', 'Http', 'Say') | Where-Object { Get-Alias -Name $_ -ErrorAction SilentlyContinue }
  Say ('alias golgesi=' + $(if ($al) { 'VAR: ' + ($al -join ',') } else { 'YOK' }))
  if ($al) { $fails++ }
  $hA = Get-R26FileSha256 $API_LAUNCHER; $okH = ($hA -ceq (Get-FileHash -Algorithm SHA256 -LiteralPath $API_LAUNCHER).Hash)
  $tu = Get-LauncherTuple
  Say ('hash yardimcisi Get-FileHash ile ayni=' + $okH + ' | baslatici uclusu=' + $tu + ' (kabul: P1-ONCESI | P1-SONRASI)')
  if (-not $okH -or $tu.StartsWith('TANIMSIZ')) { $fails++ }
  try { $hE = Get-R26FileSha256 (Join-Path $LIVE_API '.env'); Say ('.env (yalniz sha): pin esit=' + ($hE -ceq $ENV_PIN)); if ($hE -cne $ENV_PIN) { $fails++ } }
  catch { Say ('.env sha OLCULEMEDI (yetki?): ' + $_.Exception.GetType().Name + ' - yayin kosumu yukseltilmis pencerede olcer'); }
  $cA = Get-TreeDigest (Get-Map $CAND); Say ('aday API digest=' + $cA + ' | pin esit=' + ($cA -ceq $EXP_CAND)); if ($cA -cne $EXP_CAND) { $fails++ }
  $cP = Get-PackageDigest $CAND; Say ('aday API paket (' + $FILES.Count + ' dosya)=' + $cP + ' | pin esit=' + ($cP -ceq $EXP_PKG_CAND)); if ($cP -cne $EXP_PKG_CAND) { $fails++ }
  $lA = Get-TreeDigest (Get-Map $LIVE); Say ('canli API digest=' + $lA + ' | taban esit=' + ($lA -ceq $EXP_LIVE)); if ($lA -cne $EXP_LIVE) { $fails++ }
  $lP = Get-PackageDigest $LIVE; Say ('canli API paket (' + $FILES.Count + ' dosya; eklenenler -)=' + $lP + ' | pin esit=' + ($lP -ceq $EXP_PKG_LIVE)); if ($lP -cne $EXP_PKG_LIVE) { $fails++ }
  $cW = Get-TreeDigest (Get-Map $CAND_NEXT -Web); Say ('aday WEB .next digest=' + $cW + ' | pin esit=' + ($cW -ceq $EXP_WEB_CAND) + ' | BUILD_ID=' + (Get-BuildId $CAND_NEXT) + ' | cfg pin esit=' + ((Get-R26FileSha256 $CAND_CFG) -ceq $CFG_CAND))
  if ($cW -cne $EXP_WEB_CAND -or (Get-BuildId $CAND_NEXT) -cne $BID_CAND -or (Get-R26FileSha256 $CAND_CFG) -cne $CFG_CAND) { $fails++ }
  $lW = Get-TreeDigest (Get-Map $LIVE_NEXT -Web); Say ('canli WEB .next digest=' + $lW + ' | taban esit=' + ($lW -ceq $EXP_WEB_LIVE) + ' | BUILD_ID=' + (Get-BuildId $LIVE_NEXT) + ' | cfg taban esit=' + ((Get-R26FileSha256 $LIVE_CFG) -ceq $CFG_LIVE))
  if ($lW -cne $EXP_WEB_LIVE -or (Get-BuildId $LIVE_NEXT) -cne $BID_LIVE -or (Get-R26FileSha256 $LIVE_CFG) -cne $CFG_LIVE) { $fails++ }
  $inh = Test-InheritOnly $LIVE_NEXT; Say ('canli .next ACL yalniz kalitim=' + $inh); if (-not $inh) { $fails++ }
  $me0 = Http 'GET' ('http://127.0.0.1:' + $API_PORT + '/api/auth/me'); $pl0 = Http 'GET' ('http://127.0.0.1:' + $WEB_PORT + '/portal/login')
  $rw0 = Http 'GET' ('http://127.0.0.1:' + $WEB_PORT + '/api/auth/me')
  Say ('Http: api /api/auth/me=' + $me0 + ' | web /portal/login=' + $pl0 + ' | web /api/auth/me (R26 rewrite: 401 beklenir)=' + $rw0)
  if ($me0 -ne 401 -or $pl0 -ne 200) { $fails++ }
  $apiP = Get-Pids $API_PORT; $webP = Get-Pids $WEB_PORT
  Say ('dinleyici: :' + $API_PORT + '=' + ($apiP -join ',') + ' :' + $WEB_PORT + '=' + ($webP -join ','))
  if ($apiP.Count -ne 1 -or $webP.Count -ne 1) { $fails++ }
  $rc = Get-Command robocopy.exe -ErrorAction SilentlyContinue; Say ('robocopy=' + [bool]$rc); if (-not $rc) { $fails++ }
  $ge = Invoke-RogueGate; if ($ge) { Say ('  ' + $ge); $fails++ }
  $rcOk = Test-RogueClassifier; Say ('sahte-surec siniflandirici + dislama + oge adi + kapi (sentetik listeler)=' + $rcOk); if (-not $rcOk) { $fails++ }
  # yol butcesi (canli yedek/hazirlik kokleri + agaclardaki en uzun goreli yol; WinPS 5.1 MAX_PATH 260)
  $pbSelf = Test-PathBudget @{ backupApi = @{ path = $BK_API; rel = (Get-MaxRelLen (Get-Map $LIVE)) }; backupWebNext = @{ path = (Join-Path $BK_WEB '.next'); rel = (Get-MaxRelLen (Get-Map $LIVE_NEXT -Web)) }; stagedNext = @{ path = $STAGED; rel = (Get-MaxRelLen (Get-Map $CAND_NEXT -Web)) }; preNext = @{ path = $PRE; rel = (Get-MaxRelLen (Get-Map $LIVE_NEXT -Web)) } } 0 0
  Say ('yol butcesi (<260): ' + (($pbSelf.items.Keys | ForEach-Object { $_ + '=' + $pbSelf.items[$_].total + ' (marj ' + $pbSelf.items[$_].margin + ')' }) -join ' | ') + ' -> ok=' + $pbSelf.ok); if (-not $pbSelf.ok) { $fails++ }
  $rbOk = (Test-Path -LiteralPath $ROLLBACK_SCRIPT -PathType Leaf); Say ('B3 geri alma betigi yaninda=' + $rbOk + ' (' + $ROLLBACK_SCRIPT + ')'); if (-not $rbOk) { $fails++ }
  $needed = @('Say', 'Set-Stage', 'Get-R26FileSha256', 'Get-Map', 'Get-TreeDigest', 'Get-Pids', 'Wait-Stopped', 'Http', 'Get-PackageDigest', 'Test-InheritOnly', 'Get-LauncherTuple', 'Get-BuildId', 'Restore-All', 'Test-RestoredIdentity', 'Start-Both-And-Report', 'Invoke-Rollback', 'Write-EvidenceProtected', 'Get-RecoveryText', 'Invoke-StopTask', 'Invoke-StartTask', 'Test-Elevated', 'Get-TaskAction', 'Get-ProcCommandLine', 'Get-RogueCount', 'ConvertTo-RogueFolded', 'Get-RogueMatchInfo', 'Test-RogueMatch', 'Get-RogueClass', 'Get-RogueItemName', 'Get-RogueReport', 'Get-ProcList', 'Get-LiveRogueReport', 'Get-RogueGateError', 'Write-RogueReport', 'Invoke-RogueGate', 'Test-RogueClassifier', 'Invoke-FaultPoint', 'Get-MaxRelLen', 'Test-PathBudget')
  $missing = @($needed | Where-Object { -not (Get-Command $_ -CommandType Function -ErrorAction SilentlyContinue) })
  Say ('fonksiyon kumesi tam=' + ($missing.Count -eq 0) + $(if ($missing.Count) { ' eksik: ' + ($missing -join ',') } else { '' }))
  if ($missing.Count) { $fails++ }
  Say ('=== SELFTEST SONUC: ' + $(if ($fails -eq 0) { 'PASS' } else { 'FAIL ' + $fails }))
  if ($fails -ne 0) { exit 1 }
  exit 0
}

# ============================================================================= YAYIN AKISI
try {
  try {
    Set-Stage '0-kapilar'
    if ($TEST) { Say ('TEST MODU: TestRoot=' + $TestRoot + ' | Fault=' + $(if ($Fault) { $Fault } else { '(yok)' }) + ' | canli yollara BAGLANMADI'); if (-not (Test-Path -LiteralPath $SIM_STATE -PathType Leaf)) { throw ('KAPI: simulator durumu yok: ' + $SIM_STATE + ' - DUR') } }
    if (-not (Test-Elevated)) { throw 'KAPI: yukseltilmis pencere gerekli - DUR' }
    New-Item -ItemType Directory -Force -Path $EVID_DIR | Out-Null
    foreach ($p in @($BK_API, $BK_WEB, $STAGED, $PRE)) { if (Test-Path -LiteralPath $p) { throw ('KAPI: hedef zaten var: ' + $p + ' - DUR') } }
    $script:tuple0 = Get-LauncherTuple
    Say ('baslatici uclusu=' + $script:tuple0)
    if ($script:tuple0.StartsWith('TANIMSIZ')) { throw 'KAPI: baslatici/host uclusu tanimli iki durumdan biri degil (yarim P1?) - DUR' }
    $script:envSha0 = Get-R26FileSha256 (Join-Path $LIVE_API '.env')
    if ($script:envSha0 -cne $ENV_PIN) { throw 'KAPI: canli .env sha pin degil - DUR' }
    $script:actA0 = Get-TaskAction $API_TASK; $script:actW0 = Get-TaskAction $WEB_TASK
    $apiP0 = Get-Pids $API_PORT; $webP0 = Get-Pids $WEB_PORT
    Say ('API gorev action=' + $script:actA0 + ' pid=' + ($apiP0 -join ',') + ' | WEB gorev action=' + $script:actW0 + ' pid=' + ($webP0 -join ','))
    if ($apiP0.Count -ne 1 -or $webP0.Count -ne 1) { throw 'KAPI: :8080 ya da :3002 dinleyici sayisi 1 degil - DUR' }
    foreach ($pp in @($apiP0[0], $webP0[0])) { if ((Get-ProcCommandLine $pp) -notmatch 'HY_W4_RELEASE23') { throw 'KAPI: canli surec RELEASE23 kokunden degil - DUR' } }
    $ge = Invoke-RogueGate; if ($ge) { throw $ge }

    Say '--- 1) ADAY DOGRULAMA'
    $script:candMap = Get-Map $CAND; $candDig = Get-TreeDigest $script:candMap
    Say ('aday API dosya=' + $script:candMap.Count + ' digest=' + $candDig)
    if ($candDig -cne $EXP_CAND) { throw 'KAPI: aday API digest beklenen degil - DUR' }
    if ((Get-PackageDigest $CAND) -cne $EXP_PKG_CAND) { throw 'KAPI: aday API paket digest pin degil - DUR' }
    $cW = Get-TreeDigest (Get-Map $CAND_NEXT -Web)
    Say ('aday WEB .next digest=' + $cW + ' | BUILD_ID=' + (Get-BuildId $CAND_NEXT))
    if ($cW -cne $EXP_WEB_CAND -or (Get-BuildId $CAND_NEXT) -cne $BID_CAND) { throw 'KAPI: aday WEB kimligi pin degil - DUR' }
    if ((Get-R26FileSha256 $CAND_CFG) -cne $CFG_CAND) { throw 'KAPI: aday next.config.js pin degil - DUR' }

    Set-Stage '1-yedek'
    Say '--- 2) CANLI KIMLIK + DOGRULANMIS YEDEK + WEB HAZIRLIK KOPYASI (canli calisirken; takas YOK)'
    $liveMap0 = Get-Map $LIVE; $liveDig0 = Get-TreeDigest $liveMap0
    Say ('canli API dosya=' + $liveMap0.Count + ' digest=' + $liveDig0)
    if ($liveDig0 -cne $EXP_LIVE) { throw 'KAPI: canli API digest taban degil - DUR' }
    $diffAdd = @($script:candMap.Keys | Where-Object { -not $liveMap0.Contains($_) })
    $diffDel = @($liveMap0.Keys | Where-Object { -not $script:candMap.Contains($_) })
    $diffChg = @($script:candMap.Keys | Where-Object { $liveMap0.Contains($_) -and $liveMap0[$_] -ne $script:candMap[$_] })
    Say ('API fark: eklenen=' + $diffAdd.Count + ' silinen=' + $diffDel.Count + ' degisen=' + $diffChg.Count)
    if ($diffDel.Count -ne 0) { throw 'KAPI: silinen API dosyasi var - DUR' }
    if ((($diffAdd | Sort-Object) -join '|') -cne (($ADDED | Sort-Object) -join '|')) { throw 'KAPI: eklenen API dosya kumesi manifestteki 6 dosya degil - DUR' }
    $expChg = @($FILES | Where-Object { $ADDED -notcontains $_ })
    if ((($diffChg | Sort-Object) -join '|') -cne (($expChg | Sort-Object) -join '|')) { throw 'KAPI: degisen API dosya kumesi manifestle ayni degil - DUR' }
    $liveWebMap0 = Get-Map $LIVE_NEXT -Web; $lW = Get-TreeDigest $liveWebMap0
    Say ('canli WEB .next digest=' + $lW + ' | BUILD_ID=' + (Get-BuildId $LIVE_NEXT) + ' | cfg=' + (Get-R26FileSha256 $LIVE_CFG).Substring(0, 16))
    if ($lW -cne $EXP_WEB_LIVE -or (Get-BuildId $LIVE_NEXT) -cne $BID_LIVE -or (Get-R26FileSha256 $LIVE_CFG) -cne $CFG_LIVE) { throw 'KAPI: canli WEB kimligi taban degil - DUR' }
    # YOL BUTCESI: yedek/hazirlik/onceki-.next kokleri + en uzun goreli yol < 260 (WinPS 5.1 Get-FileHash siniri); tutmazsa DUR
    $maxRelApi = Get-MaxRelLen $liveMap0; $maxRelWeb = [Math]::Max((Get-MaxRelLen $liveWebMap0), (Get-MaxRelLen (Get-Map $CAND_NEXT -Web)))
    $pb = Test-PathBudget @{ backupApi = @{ path = $BK_API; rel = $maxRelApi }; backupWebNext = @{ path = (Join-Path $BK_WEB '.next'); rel = $maxRelWeb }; stagedNext = @{ path = $STAGED; rel = $maxRelWeb }; preNext = @{ path = $PRE; rel = $maxRelWeb }; failedNext = @{ path = $FAILED_NEXT; rel = $maxRelWeb } } $maxRelApi $maxRelWeb
    $script:health.pathBudget = $pb
    Say ('yol butcesi (<260): ' + (($pb.items.Keys | ForEach-Object { $_ + '=' + $pb.items[$_].total + ' (marj ' + $pb.items[$_].margin + ')' }) -join ' | ') + ' -> ok=' + $pb.ok)
    if (-not $pb.ok) { throw 'KAPI: yol butcesi asildi (yedek/hazirlik koku + en uzun goreli yol >= 260; WinPS 5.1 okuyamaz) - DUR' }
    $global:LASTEXITCODE = 0
    & robocopy.exe $LIVE $BK_API /E /R:0 /W:0 /NFL /NDL /NJH /NJS | Out-Null
    if ($LASTEXITCODE -ge 8) { throw ('KAPI: API yedek robocopy ' + $LASTEXITCODE + ' - DUR') }
    if ((Get-TreeDigest (Get-Map $BK_API)) -cne $EXP_LIVE) { throw 'KAPI: API yedek digest taban degil - DUR (dosyalara dokunulmadi)' }
    $global:LASTEXITCODE = 0
    & robocopy.exe $LIVE_NEXT (Join-Path $BK_WEB '.next') /E /R:0 /W:0 /NFL /NDL /NJH /NJS | Out-Null
    if ($LASTEXITCODE -ge 8) { throw ('KAPI: WEB yedek robocopy ' + $LASTEXITCODE + ' - DUR') }
    Copy-Item -LiteralPath $LIVE_CFG -Destination (Join-Path $BK_WEB 'next.config.js')
    if ((Get-TreeDigest (Get-Map (Join-Path $BK_WEB '.next') -Web)) -cne $EXP_WEB_LIVE -or (Get-R26FileSha256 (Join-Path $BK_WEB 'next.config.js')) -cne $CFG_LIVE) { throw 'KAPI: WEB yedek kimligi taban degil - DUR (dosyalara dokunulmadi)' }
    Say ('yedekler DOGRULANDI: API=' + $BK_API + ' | WEB=' + $BK_WEB)
    $global:LASTEXITCODE = 0
    & robocopy.exe $CAND_NEXT $STAGED /E /R:0 /W:0 /NFL /NDL /NJH /NJS | Out-Null
    if ($LASTEXITCODE -ge 8) { throw ('KAPI: WEB hazirlik kopyasi robocopy ' + $LASTEXITCODE + ' - DUR') }
    if ((Get-TreeDigest (Get-Map $STAGED -Web)) -cne $EXP_WEB_CAND) { throw 'KAPI: WEB hazirlik kopyasi aday degil - DUR (canli dosyalara dokunulmadi)' }
    if (-not (Test-InheritOnly $STAGED)) { throw 'KAPI: WEB hazirlik kopyasi ACL kalitim modelinde degil - DUR' }
    Say ('WEB hazirlik kopyasi DOGRULANDI: ' + $STAGED + ' (ACL yalniz kalitim)')

    Set-Stage '2-durdur-web'
    Invoke-StopTask $WEB_TASK
    if (-not (Wait-Stopped $WEB_TASK $WEB_PORT 'web' 90)) { Invoke-StartTask $WEB_TASK; throw 'KAPI: WEB kapanmadi - DOSYALARA DOKUNULMADI, web yeniden baslatildi' }
    Set-Stage '2-durdur-api'
    Invoke-StopTask $API_TASK
    if (-not (Wait-Stopped $API_TASK $API_PORT 'api' 90)) { Invoke-StartTask $API_TASK; Invoke-StartTask $WEB_TASK; throw 'KAPI: API kapanmadi - DOSYALARA DOKUNULMADI, ikisi de yeniden baslatildi' }
    Say 'WEB ve API kapandi (dinleyici 0, host sureci 0, gorev Running degil)'
    $script:SERVICES_STOPPED = $true; $script:API_STARTED = $false; $script:WEB_STARTED = $false

    Set-Stage '3-takas-api'
    Say '--- 4) TAKAS (migrate deploy YOK, SILME YOK)'
    $n = 0
    foreach ($rel in $FILES) {
      $dst = Join-Path $LIVE ($rel -replace '/', '\')
      New-Item -ItemType Directory -Force -Path (Split-Path $dst) | Out-Null
      Copy-Item -LiteralPath (Join-Path $CAND ($rel -replace '/', '\')) -Destination $dst -Force
      if ((Get-R26FileSha256 $dst) -cne $script:candMap[$rel]) { throw ('API dosya sha uyusmuyor: ' + $rel) }
      $n++; Invoke-FaultPoint 'api-copy' $n
    }
    Say ('API ' + $FILES.Count + '/' + $FILES.Count + ' dosya yazildi (' + $ADDED.Count + ' eklenen)')
    Set-Stage '3-takas-web'
    Move-Item -LiteralPath $LIVE_NEXT -Destination $PRE
    Invoke-FaultPoint 'web-swap'
    Move-Item -LiteralPath $STAGED -Destination $LIVE_NEXT
    Copy-Item -LiteralPath $CAND_CFG -Destination $LIVE_CFG -Force
    Say ('WEB .next takas edildi (onceki: ' + $PRE + ') + next.config.js')

    Set-Stage '4-kimlik'
    Invoke-FaultPoint 'identity-read'
    $liveDig1 = Get-TreeDigest (Get-Map $LIVE)
    $webDig1 = $(if (Test-Path -LiteralPath $LIVE_NEXT) { Get-TreeDigest (Get-Map $LIVE_NEXT -Web) } else { 'YOK' })
    $cfg1 = Get-R26FileSha256 $LIVE_CFG
    $script:health.identityAfterSwap = [ordered]@{ apiDigest = $liveDig1; webDigest = $webDig1; cfg = $cfg1 }
    Say ('API digest aday esit=' + ($liveDig1 -ceq $EXP_CAND) + ' | WEB digest aday esit=' + ($webDig1 -ceq $EXP_WEB_CAND) + ' | cfg aday esit=' + ($cfg1 -ceq $CFG_CAND))
    if ($liveDig1 -cne $EXP_CAND -or $webDig1 -cne $EXP_WEB_CAND -or $cfg1 -cne $CFG_CAND -or -not (Test-InheritOnly $LIVE_NEXT)) { throw 'KAPI: takas sonrasi kimlik aday degil' }

    Set-Stage '5-baslat-api'
    Say '--- 6) API BASLAT + SURELI SAGLIK (<=120 sn)'
    $startUtc = (Get-Date).ToUniversalTime().AddSeconds(-5)
    Invoke-StartTask $API_TASK
    $deadline = (Get-Date).AddSeconds(120); $me = -1; $hp = @()
    while ((Get-Date) -lt $deadline) { $hp = Get-Pids $API_PORT; if ($hp.Count -ge 1) { $me = Http 'GET' ('http://127.0.0.1:' + $API_PORT + '/api/auth/me'); if ($me -gt 0) { break } }; if ($TEST) { break }; Start-Sleep -Seconds 3 }
    $unauth = Http 'POST' ('http://127.0.0.1:' + $API_PORT + $ROUTE)
    $portalUnauth = Http 'GET' ('http://127.0.0.1:' + $API_PORT + $PORTAL_GET)
    $newest = @(Get-ChildItem -LiteralPath $API_LOG_DIR -File -Filter 'api-out.*.log' -ErrorAction SilentlyContinue | Where-Object { $_.CreationTimeUtc -ge $startUtc } | Sort-Object CreationTimeUtc -Descending | Select-Object -First 1)
    $mapped = 0; $mappedPortal = 0; $mappedTotal = 0; $logName = 'YOK'
    if ($newest.Count -eq 1) {
      $logName = $newest[0].Name; $txt = Get-Content -LiteralPath $newest[0].FullName -Raw
      $mapped = ([regex]::Matches($txt, [regex]::Escape('Mapped {' + $ROUTE + ', POST} route'))).Count
      $mappedPortal = ([regex]::Matches($txt, [regex]::Escape($PORTAL_MAPPED))).Count
      $mappedTotal = ([regex]::Matches($txt, 'Mapped \{')).Count
    }
    Say ('API: pid=' + ($hp -join ',') + ' | /api/auth/me=' + $me + ' | run-now=' + $unauth + ' | portal/cases=' + $portalUnauth + ' | boot log=' + $logName + ' run-now Mapped=' + $mapped + ' portal upload Mapped=' + $mappedPortal + ' toplam Mapped=' + $mappedTotal)
    $apiOk = ($hp.Count -eq 1 -and $me -eq 401 -and $unauth -eq 401 -and $portalUnauth -eq 401 -and $mapped -ge 1 -and $mappedPortal -ge 1)
    $script:health.api = [ordered]@{ ok = $apiOk; pids = @($hp); authMe = $me; runNow = $unauth; portalCases = $portalUnauth; bootLog = $logName; mappedRunNow = $mapped; mappedPortalUpload = $mappedPortal; mappedTotal = $mappedTotal }
    # API gelmediyse WEB'i BASLATMADAN geri al (failedAt=5-baslat-api; kesinti uzamaz)
    if (-not $apiOk) { throw ('KAPI: API saglik/route tutmadi (pid=' + $hp.Count + ' authMe=' + $me + ' runNow=' + $unauth + ' portalCases=' + $portalUnauth + ' mapped=' + $mapped + '/' + $mappedPortal + ')') }
    Set-Stage '5-baslat-web'
    Say '--- 7) WEB BASLAT + SURELI SAGLIK (<=180 sn; launcher BindTimeout 180)'
    Invoke-StartTask $WEB_TASK
    $deadline = (Get-Date).AddSeconds(180); $pl = -1; $wp = @()
    while ((Get-Date) -lt $deadline) { $wp = Get-Pids $WEB_PORT; if ($wp.Count -ge 1) { $pl = Http 'GET' ('http://127.0.0.1:' + $WEB_PORT + '/portal/login'); if ($pl -gt 0) { break } }; if ($TEST) { break }; Start-Sleep -Seconds 3 }
    $bm = Http 'GET' ('http://127.0.0.1:' + $WEB_PORT + '/_next/static/' + $BID_CAND + '/_buildManifest.js')
    $ik = Http 'GET' ('http://127.0.0.1:' + $WEB_PORT + '/intake/r26-release-check')
    $rw = Http 'GET' ('http://127.0.0.1:' + $WEB_PORT + '/api/auth/me')
    $webRootOk = $false; if ($wp.Count -eq 1) { $webRootOk = ((Get-ProcCommandLine $wp[0]) -match 'HY_W4_RELEASE23') }
    Say ('WEB: pid=' + ($wp -join ',') + ' kok RELEASE23=' + $webRootOk + ' | /portal/login=' + $pl + ' | buildManifest(' + $BID_CAND + ')=' + $bm + ' | /intake/x=' + $ik + ' | rewrite /api/auth/me=' + $rw + ' (401 beklenir)')
    $webOk = ($wp.Count -eq 1 -and $webRootOk -and $pl -eq 200 -and $bm -eq 200 -and $ik -eq 200 -and $rw -eq 401 -and (Get-BuildId $LIVE_NEXT) -ceq $BID_CAND)
    $script:health.web = [ordered]@{ ok = $webOk; pids = @($wp); rootOk = $webRootOk; portalLogin = $pl; buildManifest = $bm; intake = $ik; rewriteAuthMe = $rw }
    if (-not $webOk) { throw ('KAPI: WEB saglik/route tutmadi (pid=' + $wp.Count + ' kok=' + $webRootOk + ' portalLogin=' + $pl + ' buildManifest=' + $bm + ' intake=' + $ik + ' rewrite=' + $rw + ')') }

    Set-Stage '6-kapsam'
    $liveDig2 = Get-TreeDigest (Get-Map $LIVE); $webDig2 = Get-TreeDigest (Get-Map $LIVE_NEXT -Web)
    $envSha1 = Get-R26FileSha256 (Join-Path $LIVE_API '.env')
    $actA1 = Get-TaskAction $API_TASK; $actW1 = Get-TaskAction $WEB_TASK
    $tuple1 = Get-LauncherTuple
    $scopeOk = ($liveDig2 -ceq $EXP_CAND -and $webDig2 -ceq $EXP_WEB_CAND -and $envSha1 -ceq $script:envSha0 -and $tuple1 -ceq $script:tuple0 -and $actA1 -ceq $script:actA0 -and $actW1 -ceq $script:actW0)
    Say ('kapsam: API digest=' + ($liveDig2 -ceq $EXP_CAND) + ' | WEB digest=' + ($webDig2 -ceq $EXP_WEB_CAND) + ' | .env degismedi=' + ($envSha1 -ceq $script:envSha0) + ' | baslatici uclusu degismedi=' + ($tuple1 -ceq $script:tuple0) + ' (' + $tuple1 + ') | gorev action ayni=' + ($actA1 -ceq $script:actA0 -and $actW1 -ceq $script:actW0))
    $script:health.scope = [ordered]@{ ok = $scopeOk; apiDigest = $liveDig2; webDigest = $webDig2; envUnchanged = ($envSha1 -ceq $script:envSha0); tupleUnchanged = ($tuple1 -ceq $script:tuple0); taskActionsUnchanged = ($actA1 -ceq $script:actA0 -and $actW1 -ceq $script:actW0) }
    if (-not $scopeOk) { throw ('KAPI: kapsam tutmadi (api=' + $apiOk + ' web=' + $webOk + ' kapsam=' + $scopeOk + ')') }
    $script:VERDICT = 'YAYIN PASS'; $script:EXIT = 0
  } catch {
    $script:ERR = $_.Exception.Message; $script:FAILED_AT = $script:STAGE
    Say ('HATA [' + $script:STAGE + ']: ' + $script:ERR)
  }
  if ($script:ERR) {
    if ($script:SERVICES_STOPPED) { Invoke-Rollback $script:ERR }
    elseif ($script:STAGE -like '2-durdur*') { $script:VERDICT = 'DURDURMA-BASARISIZ'; $script:EXIT = 21; Say 'canli dosyalara DOKUNULMADI; servisler yeniden baslatildi' }
    else { $script:VERDICT = 'KAPIDA-DURDU'; $script:EXIT = 20; Say 'canli dosyalara DOKUNULMADI; servisler durdurulmadi' }
  }
} catch {
  # beklenmeyen hata (geri alma sirasinda bile): verdict korunur, kayit dusulur
  if ($null -eq $script:ERR) { $script:ERR = $_.Exception.Message; $script:FAILED_AT = $script:STAGE }
  else { $script:ERR = $script:ERR + ' || sonraki hata [' + $script:STAGE + ']: ' + $_.Exception.Message }
  if ($script:VERDICT -eq 'BELIRSIZ') { $script:VERDICT = $(if ($script:SERVICES_STOPPED) { 'ROLLBACK-ENGELLENDI' } else { 'KAPIDA-DURDU' }); $script:EXIT = $(if ($script:SERVICES_STOPPED) { 12 } else { 20 }); if ($script:SERVICES_STOPPED) { $script:RECOVERY = Get-RecoveryText $script:VERDICT } }
  # dogrulama PASS sonrasi (Invoke-Rollback on-atamasi 13) beklenmeyen hata: verdict 13 korunur, kurtarma metni eklenir
  elseif ($script:VERDICT -eq 'ROLLBACK-OK-ESKI-BASLAMADI' -and -not $script:RECOVERY) { $script:RECOVERY = Get-RecoveryText $script:VERDICT }
  Say ('BEKLENMEYEN HATA [' + $script:STAGE + ']: ' + $_.Exception.Message)
} finally {
  try { Write-EvidenceProtected } catch { Write-Host ('KANIT YAZIMI ISTISNA: ' + $_.Exception.Message + ' | verdict=' + $script:VERDICT + ' exit=' + $script:EXIT) }
}
exit $script:EXIT
