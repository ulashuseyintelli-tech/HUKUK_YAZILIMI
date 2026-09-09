# OFFICE A-07 — OWNER'IN CALISTIRACAGI TEK KOMUT
#
#   Yukseltilmis (Yonetici) PowerShell'de:
#     powershell -NoProfile -ExecutionPolicy Bypass -File "<...>\a07-owner-pack\a07-run.ps1"
#
# NE YAPAR: on olcum -> kapanis yolunun kuru kosumu -> sentetik ADMIN erisimini ac (TEK satir)
#           -> kabul bayragini ac + API restart -> A-07 execute/reconcile
#           -> HER HALUKARDA kapanis (bayrak kapat + restart + erisim iptal + ucunu de dogrula)
#
# NE YAPMAZ: ACL degistirmez · cron bayragina DOKUNMAZ · purge YOK · deploy/migration YOK ·
#            gercek tenant/aliciya islem YOK · sir BASMAZ.
#
# YARIDA KESILIRSE (terminal kapandi, surec olduruldu):
#     node "<...>\a07-owner-pack\a07-99-close.js"
#   Tek basina calisir, idempotenttir, durum dosyasina ihtiyac duymaz.

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$here = Split-Path -Parent $MyInvocation.MyCommand.Path

# 1) YUKSELTILMIS MI — EnvFile yazimi bunu gerektirir.
$admin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()
         ).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $admin) {
  Write-Host "DURDU: bu paket YUKSELTILMIS (Yonetici) PowerShell ister." -ForegroundColor Red
  Write-Host "  Sebep: API EnvFile'i 'NT AUTHORITY\SYSTEM' sahipli; normal oturumda YAZILAMAZ (EPERM)."
  Write-Host "  ACL DEGISTIRMEYIN. PowerShell'i 'Yonetici olarak calistir' ile acip tekrar deneyin."
  exit 2
}

# 2) node var mi
$node = (Get-Command node -ErrorAction SilentlyContinue)
if (-not $node) { Write-Host "DURDU: 'node' bulunamadi (PATH)." -ForegroundColor Red; exit 2 }

# 3) Canliya yazma KAZAYLA olmasin: jeton bu betikte ACIKCA verilir (ow-lib G-0 sart kosar).
$env:OW_ENVIRONMENT  = 'live'
$env:OW_CONFIRM_LIVE = 'YES-LIVE-OFFICE-ACCEPTANCE-A03-A07'
if (-not $env:OW_API_BASE_URL) { $env:OW_API_BASE_URL = 'http://127.0.0.1:8080/api' }
if (-not $env:A07_TENANT_SLUG) { $env:A07_TENANT_SLUG = 'off-acc-f851d975' }

# 4) DATABASE_URL: API'nin KENDI EnvFile'indan SURE ICINDE okunur.
#    Komut satirina KOYULMAZ — argv surec tablosunda gorunur (Win32_Process.CommandLine).
$launcher = if ($env:OW_API_LAUNCHER) { $env:OW_API_LAUNCHER } else { 'C:\Ops\hukuk\bin\start-api.ps1' }
$src = Get-Content -Raw -LiteralPath $launcher
$m = [regex]::Match($src, "EnvFile\s*=\s*'([^']+)'")
if (-not $m.Success) { $m = [regex]::Match($src, 'EnvFile\s*=\s*"([^"]+)"') }
if (-not $m.Success) { Write-Host "DURDU: EnvFile yolu $launcher icinde bulunamadi." -ForegroundColor Red; exit 2 }
$envFile = $m.Groups[1].Value
$dbLine = Select-String -LiteralPath $envFile -Pattern '^\s*DATABASE_URL\s*=' | Select-Object -First 1
if (-not $dbLine) { Write-Host "DURDU: DATABASE_URL $envFile icinde yok." -ForegroundColor Red; exit 2 }
$env:OW_DATABASE_URL = ($dbLine.Line -replace '^\s*DATABASE_URL\s*=\s*', '').Trim().Trim('"').Trim("'")

# Sir BASILMAZ — yalniz hedefin kimligi.
$u = [Uri]$env:OW_DATABASE_URL
Write-Host "[A-07] EnvFile : $envFile"
Write-Host "[A-07] hedef DB: $($u.Host):$($u.Port)$($u.AbsolutePath)  (parola BASILMAZ)"
Write-Host "[A-07] API koku: $($env:OW_API_BASE_URL)"
Write-Host "[A-07] tenant  : $($env:A07_TENANT_SLUG)"
Write-Host ""

& node (Join-Path $here 'a07-run.js')
$code = $LASTEXITCODE

Write-Host ""
if ($code -eq 0) {
  Write-Host "A-07 SONUC: PASS. Kapanis dogrulandi (bayrak KAPALI · erisim IPTAL · servis TOPARLANDI)." -ForegroundColor Green
} else {
  Write-Host "A-07 SONUC: PASS DEGIL (exit $code). Ciktidaki olcutleri inceleyin." -ForegroundColor Yellow
  Write-Host "Kapanis dogrulanmadiysa TEKRAR kosun (guvenli, idempotent):"
  Write-Host "  node `"$(Join-Path $here 'a07-99-close.js')`""
}
exit $code
