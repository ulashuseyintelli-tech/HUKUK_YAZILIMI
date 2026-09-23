$ErrorActionPreference = 'Stop'
# =============================================================================
# SARMALAYICI CIKIS YAKALAMA PROVASI — CANLIYA DOKUNMAZ, YAZMA YOK.
# Olculen: owner bloklarinda kullanilan kalibin cocuk surecin GERCEK cikisini yakaladigi:
#   0 (PASS) · sifir-disi (FAIL) · BASLATILAMAMA (dosya yok) · -999 asla PASS sayilmaz.
# Kalip: & { ... powershell.exe -NoProfile -ExecutionPolicy Bypass -File <betik>; $rc = $LASTEXITCODE ... }
# =============================================================================
$tmp = Join-Path $env:TEMP ('inv-exit-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Force -Path $tmp | Out-Null
$child = Join-Path $tmp 'child.ps1'
Set-Content -LiteralPath $child -Encoding ASCII -Value 'param([int]$Code = 0)
exit $Code'
$missing = Join-Path $tmp 'YOK.ps1'

function Invoke-Pattern([string]$script, [int]$code) {
  # Owner blogundaki kalibin AYNISI: -999 tohumlanir, cocuk cagrilir, hemen ardindan okunur.
  # NOT: EAP=Stop iken yerli programin stderr'i NativeCommandError uretir ve blok DURUR
  # (sessiz PASS YOK). Bu provada cikisi olcebilmek icin cagri suresince Continue kullanilir;
  # owner bloklarinda da ayni kalip vardir.
  $prev = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  $global:LASTEXITCODE = -999
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $script -Code $code 2>$null | Out-Null
  $rc = $LASTEXITCODE
  $ErrorActionPreference = $prev
  return $rc
}

$rows = @()
$rows += [pscustomobject]@{ senaryo = 'cocuk 0'; beklenen = 0; olculen = (Invoke-Pattern $child 0) }
$rows += [pscustomobject]@{ senaryo = 'cocuk 3'; beklenen = 3; olculen = (Invoke-Pattern $child 3) }
$rows += [pscustomobject]@{ senaryo = 'cocuk 5'; beklenen = 5; olculen = (Invoke-Pattern $child 5) }
$launch = Invoke-Pattern $missing 0
$rows += [pscustomobject]@{ senaryo = 'BASLATILAMADI (dosya yok)'; beklenen = 'sifir disi'; olculen = $launch }

$rows | Format-Table -AutoSize | Out-String | Write-Host
$ok = ($rows[0].olculen -eq 0) -and ($rows[1].olculen -eq 3) -and ($rows[2].olculen -eq 5) -and
      ($launch -ne 0) -and ($launch -ne -999)
Write-Host ('SONUC: ' + $(if ($ok) { 'PASS — 0, sifir-disi ve baslatilamama yollari DOGRU yakalandi; -999 hicbirinde kalmadi' } else { 'FAIL' }))
Remove-Item -Recurse -Force $tmp
if (-not $ok) { exit 1 }
exit 0
