$ErrorActionPreference = 'Stop'
# =============================================================================
# H5 PIN OZ-TESTI — SALT OKUMA. Canliya YAZMA YOK, kabul kosumu YOK, .env DEGISMEZ.
#
# NEDEN: H5 owner bloklari calismadan once canli dist ve baslatici pinlerini kapi olarak olcer.
# 2026-09-24'te olculdu ki pinler BAYATTI:
#   - dist pini `1524EDC1...4D4E` (R25B) idi; canli dist R26 `A8B17A38...53A0`  -> blok KAPIDA DURURDU
#   - baslatici pini `CC634BBF...19B3` (P1-ONCESI) idi; canli `DDCCD091...219C` -> blok KAPIDA DURURDU
# Bu test ayni kusurun tekrarini yakalar: pin ile CANLI olcum ayrisirsa FAIL verir.
#
# CIKIS: 0 hepsi PASS · 1 en az bir FAIL · 2 olculemedi (dosya/dizin yok)
# =============================================================================
$here     = $PSScriptRoot
$envBlock = Join-Path $here 'h5-owner-env-block.ps1'
$liveBlk  = Join-Path $here 'h5-owner-live-block.ps1'
$LiveDist = 'C:\Development\HUKUK_YAZILIMI\HY_W4_RELEASE23\project\apps\api\dist\apps\api\src'
$Launcher = 'C:\Ops\hukuk\bin\start-api.ps1'

function Sha([string]$p) { (Get-FileHash -LiteralPath $p -Algorithm SHA256).Hash.ToUpperInvariant() }
function TreeDigest([string]$root) {
  $root = (Resolve-Path -LiteralPath $root).Path.TrimEnd('\')
  $lines = New-Object 'System.Collections.Generic.List[string]'
  foreach ($f in Get-ChildItem -LiteralPath $root -Recurse -File -Force) {
    $rel = $f.FullName.Substring($root.Length + 1).Replace('\', '/')
    [void]$lines.Add($rel + [char]0 + (Sha $f.FullName) + "`n")
  }
  $lines.Sort([StringComparer]::Ordinal)
  $sb = New-Object Text.StringBuilder
  foreach ($l in $lines) { [void]$sb.Append($l) }
  ([BitConverter]::ToString([Security.Cryptography.SHA256]::Create().ComputeHash([Text.Encoding]::UTF8.GetBytes($sb.ToString()))) -replace '-', '').ToUpperInvariant()
}
function PinOf([string]$file, [string]$varName) {
  $m = [regex]::Match((Get-Content -Raw -LiteralPath $file), ('\$' + $varName + "\s*=\s*'([0-9A-Fa-f]{64})'"))
  if ($m.Success) { return $m.Groups[1].Value.ToUpperInvariant() }
  return $null
}

$rows = @()
function Check([string]$id, [string]$desc, [bool]$ok, [string]$gozlem) {
  $script:rows += [pscustomobject]@{ id = $id; sonuc = $(if ($ok) { 'PASS' } else { 'FAIL' }); aciklama = $desc; gozlem = $gozlem }
}

foreach ($f in $envBlock, $liveBlk) { if (-not (Test-Path -LiteralPath $f)) { Write-Host ('OLCULEMEDI: ' + $f); exit 2 } }
if (-not (Test-Path -LiteralPath $LiveDist)) { Write-Host 'OLCULEMEDI: canli dist dizini yok'; exit 2 }
if (-not (Test-Path -LiteralPath $Launcher)) { Write-Host 'OLCULEMEDI: canli baslatici yok'; exit 2 }

$distNow   = TreeDigest $LiveDist
$launchNow = Sha $Launcher
$pinEnvDist   = PinOf $envBlock 'EXP_DIST'
$pinEnvLaunch = PinOf $envBlock 'LAUNCH_PIN'
$pinLiveDist  = PinOf $liveBlk  'ExpLiveDist'

Check 'P-1' 'env blogundaki dist pini CANLI dist ile esit' ($pinEnvDist -ceq $distNow) ("pin=" + $(if ($pinEnvDist) { $pinEnvDist.Substring(0,16) } else { 'YOK' }) + " canli=" + $distNow.Substring(0,16))
Check 'P-2' 'canli kabul blogundaki dist pini CANLI dist ile esit' ($pinLiveDist -ceq $distNow) ("pin=" + $(if ($pinLiveDist) { $pinLiveDist.Substring(0,16) } else { 'YOK' }) + " canli=" + $distNow.Substring(0,16))
Check 'P-3' 'baslatici pini CANLI baslatici ile esit' ($pinEnvLaunch -ceq $launchNow) ("pin=" + $(if ($pinEnvLaunch) { $pinEnvLaunch.Substring(0,16) } else { 'YOK' }) + " canli=" + $launchNow.Substring(0,16))
Check 'P-4' 'iki blok AYNI dist pinini tasiyor' ($pinEnvDist -ceq $pinLiveDist) ('esit=' + ($pinEnvDist -ceq $pinLiveDist))
$stale = @('1524EDC15C636B39507DD9520206E3065E6A353A531D82D4362DFE115FC04D4E', 'CC634BBFE0BE8F4F06482EDB30FF1E687D36B08C075665E2EC160EA8082619B3')
$stillStale = @($stale | Where-Object { $_ -ceq $pinEnvDist -or $_ -ceq $pinLiveDist -or $_ -ceq $pinEnvLaunch })
Check 'P-5' 'bilinen BAYAT pinler (R25B dist, P1-ONCESI baslatici) artik kullanilmiyor' ($stillStale.Count -eq 0) ('bayat pin sayisi=' + $stillStale.Count)

$rows | Format-Table -AutoSize | Out-String | Write-Host
$fail = @($rows | Where-Object { $_.sonuc -eq 'FAIL' }).Count
Write-Host ('H5 PIN OZ-TESTI: PASS ' + ($rows.Count - $fail) + ' / ' + $rows.Count)
Write-Host '  (salt okuma; .env degismedi, canli kabul kosulmadi)'
if ($fail -gt 0) { exit 1 }
exit 0
