# RT4 KESIN-KIMLIK SENARYO MANTIGI - TAM BELLEK-ICI, YUKSELTME GEREKMEZ (KANIT DEGIL, mantik dogrulamasi).
# Uretim fonksiyonu Invoke-WindowRecoveryRT4, t-window-close.ps1'den sha+AST ile alinir; firewall/gorev/port
# cmdlet'leri ve Get-TrustProblem bellek-ici sahtelenir. Owner sartinin dort ogesi senaryolarla dogrulanir:
# kesin kimlik - joker yok - sorgu/erisim hatasi != yokluk - baska kurala dokunmama.
$ErrorActionPreference = 'Stop'
$SC = $PSScriptRoot
$closePath = Join-Path $SC 't-window-close.ps1'
$CloseSha = 'A81544B8DEEFC9DA4B4271E5FEB3E8AB675469B5A2FB4030426FD7C4AE680EE0'
$h = (Get-FileHash -Algorithm SHA256 -LiteralPath $closePath).Hash
if ($h -ne $CloseSha) { throw "sha uyusmuyor $h (beklenen $CloseSha)" }
$tok = $null; $perr = $null
$ast = [Management.Automation.Language.Parser]::ParseFile($closePath, [ref]$tok, [ref]$perr)
$fn = @($ast.FindAll({ param($n) ($n -is [Management.Automation.Language.FunctionDefinitionAst]) -and ($n.Name -eq 'Invoke-WindowRecoveryRT4') }, $true))[0]
. ([scriptblock]::Create($fn.Extent.Text))
"URETIM: fonksiyon AST ile alindi (sha $h, satir $($fn.Extent.StartLineNumber)-$($fn.Extent.EndLineNumber))"

# ---- bellek-ici sahte durum ----
$script:Store = @{}          # Name -> @{ DisplayName; Direction; Action; Port }
$script:Other = @{}          # dokunulmamasi gereken baska kurallar (Name -> ...)
$script:WebListening = $false
$script:WebStartFails = $false
$script:FailRemoveName = $null   # bu ad kaldirilirken hata
$script:QueryErrName = $null     # bu ad sorgulanirken ObjectNotFound DISI hata
$script:TrustProblem = ''        # Get-TrustProblem donusu
$script:RecMissing = $false

function Get-TrustProblem([string]$path,[bool]$mustProtect) { if ($script:RecMissing) { return "YOK ($path)" }; return $script:TrustProblem }
function Get-NetFirewallRule { param([string]$Name,[string]$DisplayName,$ErrorAction)
  if ($DisplayName) { throw 'HARNESS: joker/DisplayName sorgusu YASAK (owner sarti: joker yok)' }
  if ($Name -eq $script:QueryErrName) { Write-Error -Message "ENJEKTE: erisim ($Name)" -Category PermissionDenied -ErrorAction Stop }
  if ($script:Store.ContainsKey($Name)) { $v=$script:Store[$Name]; return [pscustomobject]@{ Name=$Name; DisplayName=$v.DisplayName; Direction=$v.Direction; Action=$v.Action; Port=$v.Port } }
  if ($script:Other.ContainsKey($Name)) { $v=$script:Other[$Name]; return [pscustomobject]@{ Name=$Name; DisplayName=$v.DisplayName; Direction=$v.Direction; Action=$v.Action; Port=$v.Port } }
  Write-Error -Message "yok: $Name" -Category ObjectNotFound -ErrorAction Stop
}
function Get-NetFirewallPortFilter { param([Parameter(ValueFromPipeline=$true)]$r) process { [pscustomobject]@{ LocalPort = $r.Port } } }
function Remove-NetFirewallRule { param([string]$Name,$ErrorAction) if ($Name -eq $script:FailRemoveName) { Write-Error -Message "ENJEKTE: kaldirma ($Name)" -Category InvalidOperation -ErrorAction Stop }; if ($script:Store.ContainsKey($Name)) { $script:Store.Remove($Name) } elseif ($script:Other.ContainsKey($Name)) { $script:Other.Remove($Name) } else { Write-Error -Message "yok: $Name" -Category ObjectNotFound -ErrorAction Stop } }
function Start-ScheduledTask { param($TaskName) if (-not $script:WebStartFails) { $script:WebListening = $true } }
function Get-NetTCPConnection { param($LocalPort,$State,$ErrorAction) if ($script:WebListening) { @([pscustomobject]@{ OwningProcess=4242 }) } else { @() } }

$Names = @('I11-WINDOW-BLOCK-8080-W','I11-WINDOW-BLOCK-3002-W'); $Ports = @(8080,3002)
$Rec = Join-Path ([IO.Path]::GetTempPath()) ("rt4rec-"+[guid]::NewGuid().ToString('N').Substring(0,8)+'.txt')
function Write-Rec { Set-Content -LiteralPath $Rec -Value @(0..1 | ForEach-Object { "$($Ports[$_]) $($Names[$_])" }) -Encoding ASCII }
function Seed { param([switch]$Both) $script:Store=@{}; $script:Other=@{}; $script:WebListening=$false; $script:WebStartFails=$false; $script:FailRemoveName=$null; $script:QueryErrName=$null; $script:TrustProblem=''; $script:RecMissing=$false
  foreach($i in 0..1){ $script:Store[$Names[$i]] = @{ DisplayName=$Names[$i]; Direction='Inbound'; Action='Block'; Port=$Ports[$i] } }
  # dokunulmamasi gereken tanikler: ayni DisplayName'li baska Name + ilgisiz
  $script:Other['OTHER-samedisplay'] = @{ DisplayName=$Names[0]; Direction='Inbound'; Action='Block'; Port=9999 }
  $script:Other['WITNESS'] = @{ DisplayName='WITNESS'; Direction='Inbound'; Action='Block'; Port=9998 }
  Write-Rec }

$results = New-Object System.Collections.ArrayList
function Scen([string]$Name,[scriptblock]$Setup,[scriptblock]$Expect) {
  Seed; & $Setup
  $oBefore = $script:Other.Count
  $el = New-Object 'System.Collections.Generic.List[string]'
  $lines = @(Invoke-WindowRecoveryRT4 -FwRecordFile $Rec -WebTask 'T' -WebPort 3002 -Budget 6 -ErrList $el)
  $iso = @($Names | Where-Object { $script:Store.ContainsKey($_) }).Count
  $post = [pscustomobject]@{ iso=$iso; web=[bool]$script:WebListening; othTouched=($script:Other.Count -ne $oBefore) }
  $ok = ([bool](& $Expect $lines @($el) $post)) -and (-not $post.othTouched)
  Write-Host "== $Name : $(if($ok){'PASS'}else{'FAIL'})"
  foreach($l in $lines){ Write-Host "   > $l" }
  Write-Host "   hata($($el.Count)): $(@($el) -join ' | ') | iso=$($post.iso) web=$($post.web) digerDokunuldu=$($post.othTouched)"
  [void]$results.Add($ok)
}

Scen 'S1 basari' { } { param($l,$e,$p) $e.Count -eq 0 -and ($l | ? { $_ -like '*kaldirilan 2, zaten yok 0*' }) -and ($l | ? { $_ -like 'R-T4b: Web ayakta*' }) -and $p.iso -eq 0 -and $p.web }
Scen 'S2a kismi hata (1. ad silinemez, R-T4b yine kosar)' { $script:FailRemoveName=$Names[0] } { param($l,$e,$p) $e.Count -eq 1 -and ($e[0] -like '*ENJEKTE: kaldirma*') -and ($l | ? { $_ -like 'R-T4b: Web ayakta*' }) -and $p.iso -eq 1 }
Scen 'S3a tekrar (zaten yok guvenle gecilir)' { $script:Store.Remove($Names[1]) } { param($l,$e,$p) $e.Count -eq 0 -and ($l | ? { $_ -like "*'$($Names[1])' zaten YOK*" }) -and ($l | ? { $_ -like '*kaldirilan 1, zaten yok 1*' }) -and $p.iso -eq 0 }
Scen 'S4 idempotent (ikisi de yok)' { $script:Store.Remove($Names[0]); $script:Store.Remove($Names[1]) } { param($l,$e,$p) $e.Count -eq 0 -and ($l | ? { $_ -like '*kaldirilan 0, zaten yok 2*' }) -and $p.iso -eq 0 }
Scen 'S2b R-T4b hata' { $script:WebStartFails=$true } { param($l,$e,$p) $e.Count -eq 1 -and ($e[0] -eq 'R-T4b: Web 6 sn icinde ayaga KALKMADI') -and ($l | ? { $_ -like '*kaldirilan 2*' }) -and $p.iso -eq 0 -and (-not $p.web) }
Scen 'S5 sorgu hatasi != yokluk (digeri yine kaldirilir)' { $script:QueryErrName=$Names[0] } { param($l,$e,$p) $e.Count -eq 1 -and ($e[0] -like '*sorgu/erisim hatasi*yoklukla KARISTIRILMAZ*') -and $p.iso -eq 1 }
Scen 'S6 ozellik uyusmaz (o ada dokunma, digeri kaldirilir)' { $script:Store[$Names[0]].Port = 12345 } { param($l,$e,$p) $e.Count -eq 1 -and ($e[0] -like '*ozellikleri beklenenden farkli*DOKUNULMADI*') -and $p.iso -eq 1 }
Scen 'S7 kayit dosyasi yok/guvenilmez (joker yedegi YOK)' { $script:RecMissing=$true } { param($l,$e,$p) $e.Count -eq 1 -and ($e[0] -like '*firewall kayit dosyasi guvenilir DEGIL*') -and $p.iso -eq 2 -and ($l | ? { $_ -like 'R-T4b: Web ayakta*' }) }
Scen 'S8 kayit bicimi bozuk' { Set-Content -LiteralPath $Rec -Value 'bozuk-satir-port-yok' -Encoding ASCII } { param($l,$e,$p) $e.Count -eq 1 -and ($e[0] -like '*bicimi bozuk*') -and $p.iso -eq 2 }

Remove-Item -LiteralPath $Rec -ErrorAction SilentlyContinue
$pass = @($results | Where-Object { $_ }).Count
Write-Host ""
Write-Host "MANTIK SONUC: PASS $pass/$($results.Count) (joker sorgusu her senaryoda YASAK; diger kurallara dokunulmadi)"
if ($pass -ne $results.Count) { exit 1 }
