# HOST PIN URETIMI. C:\Ops'a YAZMAZ, gorev / servis degistirmez, kurulu dosyaya dokunmaz. Saf ASCII.
# Parametresiz: denetim. hukuk-task-host.gen.cs icindeki SHA_PAPI / SHA_PWEB ve uclu-pin.json, dizindeki baslaticilarla tutarli mi? Tutarsizsa cikis 1.
# -CiktiDizini <bos dizin>: baslatici ozetlerini gen.cs sabitlerine yazar (yalniz iki satir), ciktiyi o dizine koyar ve Windows'ta csc ile derler; host ozetini yazar.
# -DerlemeYok: yalniz gen.cs uretir (csc gerektirmez). Yeni host ozeti canliya otomatik gecmez: uclu-pin.json, yayin betigi uclu tablosu ve ayri pencere GO gerekir.
param([string]$CiktiDizini = '', [switch]$DerlemeYok)
$ErrorActionPreference = 'Stop'
$Kok = Split-Path $PSScriptRoot -Parent
$OzetApi = (Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $Kok 'start-api.ps1')).Hash
$OzetWeb = (Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $Kok 'start-web.ps1')).Hash
$Kaynak = Join-Path $PSScriptRoot 'hukuk-task-host.gen.cs'
$Ham = [IO.File]::ReadAllBytes($Kaynak)
$Metin = [Text.Encoding]::ASCII.GetString($Ham)
$Yeni = $Metin
foreach ($Cift in @(@('SHA_PAPI', $OzetApi), @('SHA_PWEB', $OzetWeb))) {
  $Desen = 'private const string ' + $Cift[0] + ' = "[0-9A-Fa-f]{64}";'
  if ([regex]::Matches($Yeni, $Desen).Count -ne 1) { throw ('gen.cs sabiti tam bir kez bulunamadi: ' + $Cift[0]) }
  $Yeni = [regex]::Replace($Yeni, $Desen, ('private const string ' + $Cift[0] + ' = "' + $Cift[1] + '";'))
}
if (-not $CiktiDizini) {
  $Pin = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'uclu-pin.json') -Raw | ConvertFrom-Json
  $Hatalar = @()
  if ($Yeni -cne $Metin) { $Hatalar += 'gen.cs pinleri baslaticilarla tutarsiz' }
  if ($Pin.api -cne $OzetApi) { $Hatalar += 'uclu-pin.json api tutarsiz' }
  if ($Pin.web -cne $OzetWeb) { $Hatalar += 'uclu-pin.json web tutarsiz' }
  if ($Hatalar.Count) { $Hatalar | ForEach-Object { Write-Output ('PIN FARKI: ' + $_) }; exit 1 }
  Write-Output ('PIN TUTARLI | ' + $Pin.ad + ' | api=' + $OzetApi.Substring(0, 8) + ' web=' + $OzetWeb.Substring(0, 8) + ' host=' + ([string]$Pin.host).Substring(0, 8) + ' (host ozeti kurulu ciktidir; bu betik dogrulayamaz)')
  exit 0
}
$Hedef = [IO.Path]::GetFullPath($CiktiDizini)
if ($Hedef -like 'C:\Ops*') { throw 'C:\Ops altina uretim YAPILMAZ - DUR' }
if (-not (Test-Path -LiteralPath $Hedef)) { New-Item -ItemType Directory -Path $Hedef | Out-Null }
$GenCikti = Join-Path $Hedef 'hukuk-task-host.gen.cs'
if (Test-Path -LiteralPath $GenCikti) { throw 'cikti var, ustune YAZILMAZ - DUR' }
[IO.File]::WriteAllBytes($GenCikti, [Text.Encoding]::ASCII.GetBytes($Yeni))
Write-Output ('gen.cs sha256=' + (Get-FileHash -Algorithm SHA256 -LiteralPath $GenCikti).Hash)
if ($DerlemeYok) { exit 0 }
$Csc = Join-Path $env:windir 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if (-not (Test-Path -LiteralPath $Csc)) { throw 'csc yok: -DerlemeYok kullanin' }
$ExeCikti = Join-Path $Hedef 'hukuk-task-host.exe'
& $Csc /nologo /target:winexe /platform:x64 /optimize+ ('/out:' + $ExeCikti) $GenCikti
if ($LASTEXITCODE -ne 0) { throw ('derleme cikisi ' + $LASTEXITCODE) }
Write-Output ('derleyici sha256=' + (Get-FileHash -Algorithm SHA256 -LiteralPath $Csc).Hash)
Write-Output ('host sha256=' + (Get-FileHash -Algorithm SHA256 -LiteralPath $ExeCikti).Hash + ' (csc bayt-tekrar-uretilebilir degildir; kurulu ozetle ayni cikmaz)')
exit 0
