# RT4 SENARYO MANTIGI - TAM BELLEK-ICI, YUKSELTME GEREKMEZ (KANIT DEGIL, mantik dogrulamasi).
# URETIM FONKSIYONU t-window-close.ps1'den AST ile alinir; firewall/gorev/port cmdlet'leri bellek-ici sahtelenir.
# Amac: R-T4a/R-T4b'nin her adiminin BAGIMSIZ denenmesi, kismi hata, yeniden cagri ve idempotentligi
# senaryo beklentileriyle dogrulamak. Gercek firewall (yukseltme) + gercek gorev/port owner kosumunda olculur.
$ErrorActionPreference = 'Stop'
$SC = $PSScriptRoot   # betik, t-window-close.ps1 ile ayni dizinde
$closePath = Join-Path $SC 't-window-close.ps1'
$CloseSha = '88BCEA01A2A956F4E0AB5976E670162014860FF98E4E68177D4951718E3AB9D7'
$h = (Get-FileHash -Algorithm SHA256 -LiteralPath $closePath).Hash
if ($h -ne $CloseSha) { throw "sha uyusmuyor $h" }
$tok = $null; $perr = $null
$ast = [Management.Automation.Language.Parser]::ParseFile($closePath, [ref]$tok, [ref]$perr)
$fn = @($ast.FindAll({ param($n) ($n -is [Management.Automation.Language.FunctionDefinitionAst]) -and ($n.Name -eq 'Invoke-WindowRecoveryRT4') }, $true))[0]
. ([scriptblock]::Create($fn.Extent.Text))
"URETIM: fonksiyon AST ile alindi (sha $h, satir $($fn.Extent.StartLineNumber)-$($fn.Extent.EndLineNumber))"

# ---- bellek-ici sahte durum ----
$script:FwRules = New-Object System.Collections.ArrayList     # DisplayName listesi
$script:WebListening = $false
$script:FailRemoveOnCall = 0   # N. Remove cagrisinda hata (0 = kapali)
$script:RemoveCallCount = 0
$script:WebStartFails = $false
function New-NetFirewallRule { param($DisplayName,$Direction,$Action,$Protocol,$LocalPort,$Enabled,$Profile) [void]$script:FwRules.Add([pscustomobject]@{ Name=[guid]::NewGuid().ToString(); DisplayName=$DisplayName }) }
function Get-NetFirewallRule { param($DisplayName) @($script:FwRules | Where-Object { $_.DisplayName -like $DisplayName }) }
function Remove-NetFirewallRule { param($Name) $script:RemoveCallCount++; if ($script:FailRemoveOnCall -ne 0 -and $script:RemoveCallCount -eq $script:FailRemoveOnCall) { throw 'ENJEKTE (sinama): kural kaldirma basarisiz' }; $x=@($script:FwRules | Where-Object { $_.Name -eq $Name }); if($x.Count){ $script:FwRules.Remove($x[0]) } }
function Start-ScheduledTask { param($TaskName) if (-not $script:WebStartFails) { $script:WebListening = $true } }
function Get-NetTCPConnection { param($LocalPort,$State,$ErrorAction) if ($script:WebListening) { @([pscustomobject]@{ OwningProcess=4242 }) } else { @() } }

$results = New-Object System.Collections.ArrayList
function Scen([string]$Name, [scriptblock]$Setup, [scriptblock]$Expect) {
  $script:RemoveCallCount = 0
  & $Setup
  $el = New-Object 'System.Collections.Generic.List[string]'
  $lines = @(Invoke-WindowRecoveryRT4 -FwPattern 'HYRT4S-x-BLOCK-*' -WebTask 'HYRT4S-x-WEB' -WebPort 47101 -Budget 6 -ErrList $el)
  $post = [pscustomobject]@{ rules=@(Get-NetFirewallRule -DisplayName 'HYRT4S-x-BLOCK-*').Count; web=[bool]$script:WebListening }
  $ok = [bool](& $Expect $lines @($el) $post)
  Write-Host ("== {0} : {1}" -f $Name, $(if($ok){'PASS'}else{'FAIL'}))
  foreach($l in $lines){ Write-Host "   > $l" }
  Write-Host ("   hata($($el.Count)): $(@($el) -join ' | ') | kural=$($post.rules) web=$($post.web)")
  [void]$results.Add($ok)
}
function Reset2Rules { $script:FwRules.Clear(); $script:FailRemoveOnCall=0; $script:WebStartFails=$false; $script:WebListening=$false; 1..2 | ForEach-Object { New-NetFirewallRule -DisplayName "HYRT4S-x-BLOCK-4710$_" } }

Scen 'S1 basari' { Reset2Rules } { param($l,$e,$p) $e.Count -eq 0 -and ($l -contains 'R-T4a: engelleme kurallari kaldirildi (2)') -and (@($l|?{$_ -like 'R-T4b: Web ayakta*'}).Count -eq 1) -and $p.rules -eq 0 -and $p.web }
Scen 'S2a R-T4a kismi hata' { Reset2Rules; $script:FailRemoveOnCall=2 } { param($l,$e,$p) $e.Count -eq 1 -and ($e[0] -like 'R-T4a: ENJEKTE*') -and (@($l|?{$_ -like 'R-T4b: Web ayakta*'}).Count -eq 1) -and $p.rules -eq 1 -and $p.web }
Scen 'S3a tekrar (R-T4a toparlanma)' { $script:FailRemoveOnCall=0; $script:WebListening=$false } { param($l,$e,$p) $e.Count -eq 0 -and ($l -contains 'R-T4a: engelleme kurallari kaldirildi (1)') -and $p.rules -eq 0 -and $p.web }
Scen 'S2b R-T4b hata' { Reset2Rules; $script:WebStartFails=$true } { param($l,$e,$p) $e.Count -eq 1 -and ($e[0] -eq 'R-T4b: Web 6 sn icinde ayaga KALKMADI') -and ($l -contains 'R-T4a: engelleme kurallari kaldirildi (2)') -and $p.rules -eq 0 -and (-not $p.web) }
Scen 'S3b tekrar (R-T4b toparlanma)' { $script:WebStartFails=$false } { param($l,$e,$p) $e.Count -eq 0 -and ($l -contains 'R-T4a: engelleme kurallari kaldirildi (0)') -and (@($l|?{$_ -like 'R-T4b: Web ayakta*'}).Count -eq 1) -and $p.rules -eq 0 -and $p.web }
Scen 'S4 idempotent tekrar' { } { param($l,$e,$p) $e.Count -eq 0 -and ($l -contains 'R-T4a: engelleme kurallari kaldirildi (0)') -and $p.rules -eq 0 -and $p.web }

$pass = @($results | Where-Object { $_ }).Count
Write-Host ""
Write-Host "MANTIK SONUC: PASS $pass/$($results.Count)"
if ($pass -ne $results.Count) { exit 1 }
