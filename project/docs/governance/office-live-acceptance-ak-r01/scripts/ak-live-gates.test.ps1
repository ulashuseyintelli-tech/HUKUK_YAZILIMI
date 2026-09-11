# ak-live.ps1 KAPI TESTLERI (izole) - canli .env OKUNMAZ, canliya YAZMA YOK, DB gerekmez.
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File ak-live-gates.test.ps1 [-WorkDir <gecici dizin>]
#
# K-API ve K-BLD kapilari CANLI 8080 surecinin komut satirini ve RELEASE22 dist dosyalarinin SHA'sini
# SALT-OKUR (T6). Sahte agac/baslatici yalniz WorkDir altinda uretilir. Cikis: 0 = hepsi gecti.
param([string]$WorkDir = (Join-Path $env:TEMP 'ak-live-gates'))
$ErrorActionPreference = 'Stop'
$SC = $PSScriptRoot
$G = Split-Path -Parent (Split-Path -Parent $SC)
$W = Join-Path $SC 'ak-live.ps1'
$PS51 = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
$GO = 'OWNER-GO-OFFICE-AK-20260911-R01'
$S = $WorkDir
New-Item -ItemType Directory -Force -Path $S | Out-Null
$results = @()
function T([string]$id, [string]$desc, [int]$wantCode, [string]$wantText, [string[]]$argv, [string]$script = $W) {
  $out = & $PS51 -NoProfile -ExecutionPolicy Bypass -File $script @argv 2>&1 | Out-String
  $code = $LASTEXITCODE
  $ok = ($code -eq $wantCode) -and ($out -match [regex]::Escape($wantText))
  $line = ($out -split "`r?`n" | Where-Object { $_ -match 'DURDU|TAMAM' } | Select-Object -First 1)
  $script:results += [pscustomobject]@{ id = $id; ok = $ok; code = $code; desc = $desc; seen = $line }
}

# T0: saf ASCII + PS 7 ve PS 5.1 ayristirma
$nonAscii = @([IO.File]::ReadAllBytes($W) | Where-Object { $_ -gt 127 }).Count
$errs = $null; [void][Management.Automation.Language.Parser]::ParseFile($W, [ref]$null, [ref]$errs)
$p51 = & $PS51 -NoProfile -Command "`$e=`$null; [void][Management.Automation.Language.Parser]::ParseFile('$W',[ref]`$null,[ref]`$e); `$e.Count"
$results += [pscustomobject]@{ id = 'T0'; ok = ($nonAscii -eq 0 -and $errs.Count -eq 0 -and "$p51".Trim() -eq '0'); code = '-'; desc = 'saf ASCII + PS ayristirma hatasiz'; seen = "nonAscii=$nonAscii psErr=$($errs.Count) ps51Err=$("$p51".Trim())" }

T 'T1' 'GoRef bicimi yanlis -> K-GO' 2 'DURDU [K-GO]' @('-GoRef', 'OWNER-GO-OFFICE-A07-20260911-R01')
T 'T2' 'Recover runId buyuk harf -> K-GO' 2 'DURDU [K-GO]' @('-GoRef', $GO, '-Recover', 'ABCDEF12')
T 'T3' 'Recover runId kisa -> K-GO' 2 'DURDU [K-GO]' @('-GoRef', $GO, '-Recover', 'abc')
T 'T4' 'Recover + PreflightOnly -> K-GO' 2 'DURDU [K-GO]' @('-GoRef', $GO, '-Recover', 'abcdef12', '-PreflightOnly')

# T5: K-ARC - kopya agacta tek aracin bir satiri degisir
$arc = Join-Path $S 'arc'
$arcSc = Join-Path $arc 'governance\office-live-acceptance-ak-r01\scripts'
$arcOw = Join-Path $arc 'governance\office-delivery-r01\scripts'
New-Item -ItemType Directory -Force -Path $arcSc, $arcOw | Out-Null
Copy-Item -LiteralPath (Get-ChildItem -LiteralPath $SC -File).FullName -Destination $arcSc -Force
Copy-Item -LiteralPath (Join-Path $G 'office-delivery-r01\scripts\ow-lib.js') -Destination $arcOw -Force
$W2 = Join-Path $arcSc 'ak-live.ps1'
T 'T5a' 'kopya agac degismemis -> K-ARC gecer, sonraki kapi (K-ENV) durur' 2 'DURDU [K-ENV]' @('-GoRef', $GO, '-PreflightOnly', '-Launcher', (Join-Path $S 'yok-baslatici.ps1')) $W2
Add-Content -LiteralPath (Join-Path $arcSc 'ak-cases.js') -Value '// kurcalama'
T 'T5b' 'ak-cases.js kurcalandi -> K-ARC' 2 'DURDU [K-ARC]' @('-GoRef', $GO, '-PreflightOnly') $W2
Copy-Item -LiteralPath (Join-Path $SC 'ak-cases.js') -Destination $arcSc -Force
Add-Content -LiteralPath (Join-Path $arcOw 'ow-lib.js') -Value '// kurcalama'
T 'T5c' 'ow-lib.js kurcalandi -> K-ARC' 2 'DURDU [K-ARC]' @('-GoRef', $GO, '-PreflightOnly') $W2

# T6-T8: sahte baslatici (EnvFile sahte agacta; icerik sahte, canli .env OKUNMAZ)
$fake = Join-Path $S 'fake-release\project\apps\api'
New-Item -ItemType Directory -Force -Path (Join-Path $fake 'node_modules\@prisma\client') | Out-Null
Set-Content -LiteralPath (Join-Path $fake '.env') -Value 'DATABASE_URL=postgresql://sahte:sahte@127.0.0.1:5441/hukuk_office_ak_acc_test' -Encoding ascii
$fl = Join-Path $S 'fake-launcher.ps1'
Set-Content -LiteralPath $fl -Value "`$p = @{`r`n  EnvFile        = '$(Join-Path $fake '.env')'`r`n}" -Encoding ascii
T 'T6' 'kosum: K-API + K-BLD CANLI surec/derleme uzerinde gecer; EnvFile kosan surumun degil -> K-ENV' 2 "kosan surumun .env'i degil" @('-GoRef', $GO, '-PreflightOnly', '-Launcher', $fl)
T 'T7' 'kurtarma: hedef DB canli degil -> K-ENV' 2 'hedef DB beklenen degil (127.0.0.1:5441/hukuk_office_ak_acc_test)' @('-GoRef', $GO, '-Recover', 'abcdef12', '-Launcher', $fl)
$fl2 = Join-Path $S 'fake-launcher-noenv.ps1'
Set-Content -LiteralPath $fl2 -Value '# EnvFile yok' -Encoding ascii
T 'T8' 'baslaticida EnvFile satiri yok -> K-ENV' 2 'EnvFile satiri' @('-GoRef', $GO, '-PreflightOnly', '-Launcher', $fl2)

$results | Format-Table -AutoSize -Wrap | Out-String -Width 220
$pass = @($results | Where-Object { $_.ok }).Count
"AK-LIVE KAPI TESTLERI: $pass/$($results.Count)"
if ($pass -eq $results.Count) { exit 0 } else { exit 1 }
