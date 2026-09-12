& {
  # I11-ADAYA-BAGLA — C33'un teslim ettigi DERLENMIS ADAYI olcer ve Il1'i ona baglar.
  # TAHMIN ETMEZ: C33'un yazili teslim ettigi her kimlik OLCUMLE karsilastirilir; eksik ya da
  # uyusmaz tek alan varsa DURUR. Repo dosyasini DEGISTIRMEZ; baglama ciktisini dizine yazar.
  # CANLIYA DOKUNMAZ: canli DB, gorev, firewall, env okunmaz/degistirilmez.
  #
  #   $env:BIND_ROOT        C33 aday koku (zorunlu)
  #   $env:BIND_BUILD_ID    C33'un bildirdigi web BUILD_ID (zorunlu)
  #   $env:BIND_MANIFEST    C33 aday manifest dosyasi yolu (zorunlu)
  #   $env:BIND_MANIFEST_SHA C33'un bildirdigi manifest sha256 (zorunlu)
  #   $env:BIND_SELFTEST=1  yalniz OLCUM kodunu canli RELEASE22 kokune karsi sinar (baglama YAPMAZ)
  $ErrorActionPreference = 'Stop'

  $FIXED_SHA = '2740df3dd58c5e711a790cc21a5f69d6dbffb35d'     # owner karari: SABIT urun kaynagi
  $LIVE_SHA  = '137406701248858221d12be94a941f8837a2a245'
  $CANON     = 'C:\Development\HUKUK_YAZILIMI\project'
  $OUT       = 'C:\Users\ulastelli\AppData\Local\Temp\claude\C--Development-HUKUK-YAZILIMI-project\894280b1-443c-4406-86cd-b9e22aad3f7b\scratchpad\i11bind'
  $SelfTest  = ($env:BIND_SELFTEST -eq '1')

  # Il1 §9'un denetledigi 12 urun dosyasi + RELEASE22'deki OLCULMUS degerleri (karsilastirma tabani)
  $dist22 = [ordered]@{
    'modules\address-discovery\address-discovery.controller.js'                  = '111807F3463CE07B4147F9FE08AAA23177B9A364BB879AE2B72A4B42B3A8BB6D'
    'modules\address-discovery\client-info-request.service.js'                   = '6F7BA8DED41C84C4774E5B339CA2820DB7D8A27EAAE46DBFE339E13E5E3A2FA4'
    'modules\client-intake-review\client-intake-review.controller.js'            = 'ED8455F9A8F106EB6959EDE3E0E1A629170802795B1A2525D6670DFD150B26E9'
    'modules\client-intake-review\client-intake-review-authorization.service.js' = '97DF59B722102EFC58981FFB5D64FB8D837E07F63EC3F6AAE89E2196CD931F37'
    'modules\client-intake-promotion\client-intake-promotion.controller.js'      = '2DE45ABB813C9937D7A44637B617D508B870474E7226A7BD32E979F82C636266'
    'modules\client-intake-promotion\client-intake-promotion.service.js'         = '8AE1BC03E3F2D845E45725C76C944D594D5B847082AE2ED50A8991B2C65DBE0A'
    'modules\client-intake-link\client-intake-link.service.js'                   = '32223CA85292A4FE9784F5CACF9E7A07BE67A00B5F9E905FDE5D79C244422D40'
    'modules\client-intake-public\client-intake-public.service.js'               = '92D3EA95F77843A7D5ECC86863D8352ACA98D789651C01182EC8B665EEFA29E0'
    'modules\client-intake-public\public-intake-rate-limit.guard.js'             = '1463DB9C296D77C7937A20AE791F04FA119C7E45C6971A558CEB836F9D9E2DD3'
    'modules\notification\email-provider.service.js'                             = '231B77F67514A2D039E760A8150250E64C26DEB6B2145A8354AA89D11C69233A'
    'modules\client\client-workspace-command-authority.js'                       = 'D8373C726264631A214056135EBBE36BAA12BA3C91ECCD5F8E589E3F0940A9F6'
    'modules\client\client-mutation-policy.js'                                   = '075FBE3DE30A45A624A04B9812F6F1E59825D032E80FE234CFC50D4865FFC81A'
  }
  # Sabit adaydaki URUN kaynak farki (RELEASE22'ye gore) — olculdu, bu kume DISINDA fark = DUR
  $expectedDiff = @(
    'project/apps/api/src/common/party-write-tx.ts',
    'project/apps/api/src/modules/case/case.service.ts',
    'project/apps/api/src/modules/client/client.service.ts',
    'project/apps/api/src/modules/debtor/debtor.service.ts',
    'project/apps/api/src/modules/error-log/error-log.sanitize.ts',
    'project/apps/api/src/modules/lawyer/lawyer.service.ts',
    'project/apps/api/src/modules/office-approval/office-write-role.policy.ts'
  )

  function Get-RootHead([string]$root) {
    $gitFile = Join-Path $root '.git'
    if (-not (Test-Path -LiteralPath $gitFile)) { throw "B-0: '$root' icinde .git YOK - worktree koku degil" }
    $gd = ((Get-Content -LiteralPath $gitFile -TotalCount 1) -replace '^gitdir:\s*', '').Trim()
    return (Get-Content -LiteralPath (Join-Path $gd 'HEAD') -TotalCount 1).Trim()
  }
  function Measure-Dist([string]$root) {
    $D = Join-Path $root 'project\apps\api\dist\apps\api\src'
    if (-not (Test-Path -LiteralPath $D)) { throw "B-5: dist YOK ($D) - derlenmemis kok" }
    $m = [ordered]@{}
    foreach ($k in $dist22.Keys) {
      $p = Join-Path $D $k
      if (-not (Test-Path -LiteralPath $p)) { throw "B-5: dist dosyasi YOK: $k" }
      $m[$k] = (Get-FileHash -Algorithm SHA256 -LiteralPath $p).Hash
    }
    return $m
  }

  # ======================= OZ-SINAMA (olcum kodunu GERCEK veriyle dogrular) =======================
  if ($SelfTest) {
    $R22 = 'C:\Development\HUKUK_YAZILIMI\HY_W4_RELEASE22'
    Write-Output "OZ-SINAMA: olcum kodu canli RELEASE22 kokune karsi (baglama YAPILMAZ)"
    $h = Get-RootHead $R22
    Write-Output "  HEAD = $h (beklenen $LIVE_SHA) -> $(if ($h -eq $LIVE_SHA) { 'ESIT' } else { 'FARKLI' })"
    $m = Measure-Dist $R22
    $eq = 0; foreach ($k in $dist22.Keys) { if ($m[$k] -eq $dist22[$k]) { $eq++ } else { Write-Output "  FARK: $k" } }
    Write-Output "  12 urun hash'i: $eq/12 kayitli degerle ESIT"
    $fixed = Select-String -LiteralPath (Join-Path $R22 'project\apps\api\dist\apps\api\src\modules\error-log\error-log.sanitize.js') -Pattern 'redactSecretPathSegments' -Quiet
    Write-Output "  B-I11-3 onarimi RELEASE22 dist'inde: $fixed (beklenen False - canlida YOK)"
    if ($h -ne $LIVE_SHA -or $eq -ne 12 -or $fixed) { throw 'OZ-SINAMA BASARISIZ - olcum kodu guvenilmez' }
    Write-Output 'OZ-SINAMA: GECTI (olcum kodu kayitli canli kimlikleri BIREBIR uretti)'
    return
  }

  # ======================= BAGLAMA (C33 teslimi) =======================
  foreach ($k in 'BIND_ROOT', 'BIND_BUILD_ID', 'BIND_MANIFEST', 'BIND_MANIFEST_SHA') {
    if (-not [Environment]::GetEnvironmentVariable($k)) { throw "B-GIRDI: $k verilmedi - C33 teslimi EKSIK; kimlik TAHMIN EDILMEZ" }
  }
  $ROOT = $env:BIND_ROOT
  Write-Output "BAGLAMA: aday koku = $ROOT"

  # B-0: sabit kaynak
  $head = Get-RootHead $ROOT
  if ($head -ne $FIXED_SHA) { throw "B-0: aday HEAD ($head) sabit kaynak ($FIXED_SHA) DEGIL - ikinci aday ACILMAZ" }
  Write-Output "B-0: HEAD = $head (SABIT kaynakla ESIT)"

  # B-1: BUILD_ID — C33 bildirimi ile OLCUM esit olmali
  $bid = (Get-Content -LiteralPath (Join-Path $ROOT 'project\apps\web\.next\BUILD_ID') -TotalCount 1).Trim()
  if ($bid -cne $env:BIND_BUILD_ID) { throw "B-1: olculen BUILD_ID ($bid) C33 bildirimi ($($env:BIND_BUILD_ID)) ile ESIT DEGIL" }
  Write-Output "B-1: BUILD_ID = $bid (C33 bildirimiyle ESIT)"

  # B-2: manifest — C33 bildirimi ile OLCUM esit olmali
  if (-not (Test-Path -LiteralPath $env:BIND_MANIFEST)) { throw "B-2: manifest YOK ($($env:BIND_MANIFEST))" }
  $msha = (Get-FileHash -Algorithm SHA256 -LiteralPath $env:BIND_MANIFEST).Hash
  if ($msha -ne $env:BIND_MANIFEST_SHA.ToUpper()) { throw "B-2: manifest sha256 ($msha) C33 bildirimi ile ESIT DEGIL" }
  Write-Output "B-2: manifest sha256 = $msha (C33 bildirimiyle ESIT)"

  # B-3: urun kaynak farki tam olarak bilinen 7 dosya
  git -C $CANON fetch origin main --quiet
  if ($LASTEXITCODE -ne 0) { throw 'B-3: git fetch basarisiz' }
  $diff = @(git -C $CANON diff --name-only "$LIVE_SHA..$FIXED_SHA" -- project/apps |
    Where-Object { $_ -notmatch '\.spec\.ts$|__tests__/|\.test\.ts$|ci-manifests/' } | Sort-Object)
  if ($LASTEXITCODE -ne 0) { throw 'B-3: git diff basarisiz' }
  $extra = @($diff | Where-Object { $_ -notin $expectedDiff })
  $missing = @($expectedDiff | Where-Object { $_ -notin $diff })
  if ($extra.Count -ne 0 -or $missing.Count -ne 0) {
    foreach ($x in $extra) { Write-Output "  BEKLENMEYEN: $x" }
    foreach ($x in $missing) { Write-Output "  EKSIK: $x" }
    throw "B-3: urun farki bilinen 7 dosyadan FARKLI - kapsama kendiliginden EKLEME YAPILMAZ; owner'a bildir"
  }
  Write-Output "B-3: urun farki TAM 7 dosya (#2641 · #2643 · #2645)"

  # B-4: B-I11-3 onarimi DERLENMIS ikilide
  $sanit = Join-Path $ROOT 'project\apps\api\dist\apps\api\src\modules\error-log\error-log.sanitize.js'
  if (-not (Select-String -LiteralPath $sanit -Pattern 'redactSecretPathSegments' -Quiet)) { throw 'B-4: aday dist''inde redactSecretPathSegments YOK - onarim derlenmemis' }
  Write-Output 'B-4: B-I11-3 onarimi DERLENMIS aday ikilisinde MEVCUT'

  # B-5: 12 urun hash'i + main.js
  $m = Measure-Dist $ROOT
  $same = 0; $changed = @()
  foreach ($k in $dist22.Keys) { if ($m[$k] -eq $dist22[$k]) { $same++ } else { $changed += $k } }
  $mainJs = (Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $ROOT 'project\apps\api\dist\apps\api\src\main.js')).Hash
  Write-Output "B-5: 12 urun hash'inden RELEASE22 ile AYNI: $same · DEGISEN: $($changed.Count)"
  foreach ($c in $changed) { Write-Output "  DEGISEN (kaynagi aday farkinda DEGIL -> DERLEME farki olarak kaydedilir): $c" }
  Write-Output "B-5: aday main.js sha256 = $mainJs"

  # B-6: baglama ciktisi (repo dosyalari DEGISTIRILMEZ)
  New-Item -ItemType Directory -Force -Path $OUT | Out-Null
  $binding = [ordered]@{
    record = 'I11-CANDIDATE-BINDING'; boundAt = (Get-Date).ToString('o')
    candidateRoot = $ROOT; sourceSha = $head; buildId = $bid
    manifestPath = $env:BIND_MANIFEST; manifestSha256 = $msha
    apiMainJsSha256 = $mainJs; productDistHashes = $m
    sameAsRelease22 = $same; changedVsRelease22 = $changed
    bI113FixCompiled = $true
  }
  $bf = Join-Path $OUT 'I11-CANDIDATE-BINDING.json'
  $binding | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $bf -Encoding UTF8
  Write-Output "B-6: baglama kaydi = $bf (sha256 $((Get-FileHash -Algorithm SHA256 -LiteralPath $bf).Hash))"
  Write-Output ''
  Write-Output 'BAGLAMA TAMAM. Siradaki: aday dist ile eksik dogrulama (V-A birlesik dizi, V-B derlenmis B-I11-3).'
}
