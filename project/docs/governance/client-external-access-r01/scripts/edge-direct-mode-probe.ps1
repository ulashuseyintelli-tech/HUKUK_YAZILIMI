# =============================================================================
# DOGRUDAN MOD (Yol A) NEGATIF TESTI — CANLIYA DOKUNMAZ, SERTIFIKA TALEP ETMEZ.
#
# Iki Caddy profili ayni anda kaldirilir ve AYNI sahte basliklarla yoklanir:
#   A) templates/Caddyfile.direct.template — dogrudan mod (istemci basligina GUVENMEZ)
#   B) templates/Caddyfile.template        — tunel modu  (CF-Connecting-IP'ye GUVENIR)
# B, dogrudan modda MUTASYON gorevi gorur: kacisin gercek oldugunu gosterir.
#
# API tarafi taklit DEGIL: express + `trust proxy = 1` + CANLI dist'ten derlenmis
# `public-intake-client-ip.js` (yalniz OKUNUR) + hiz siniri anahtarinin kendisi.
#
# NOT: prova HTTP uzerinden kosar; ACME/TLS devre disidir (CADDY_LISTEN ile port verilir).
# Sertifika davranisi burada OLCULMEZ — canli kurulumda ayrica dogrulanir.
#
# CIKIS: 0 hepsi PASS · 1 FAIL · 2 olculemedi
# =============================================================================
param(
  [string]$ClientIpModule = 'C:\Development\HUKUK_YAZILIMI\HY_W4_RELEASE23\project\apps\api\dist\apps\api\src\modules\client-intake-public\public-intake-client-ip.js',
  [string]$ExpressNodePath = 'D:\Development\HUKUK_YAZILIMI\project\project\node_modules\.pnpm\express@4.21.2\node_modules'
)
$ErrorActionPreference = 'Stop'
$here      = $PSScriptRoot
$tplDir    = Join-Path (Split-Path $here -Parent) 'templates'
$direct    = Join-Path $tplDir 'Caddyfile.direct.template'
$tunnel    = Join-Path $tplDir 'Caddyfile.template'
$backend   = Join-Path $here 'edge-client-ip-backend.js'
$probe     = Join-Path $here 'edge-direct-mode-probe.js'
$image     = 'caddy:2-alpine'
$dPort = 8090; $tPort = 8091; $apiPort = 8195

function Invoke-Native([scriptblock]$sb) {
  $old = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
  try { & $sb } finally { $ErrorActionPreference = $old }
}

foreach ($f in $direct, $tunnel, $backend, $probe) { if (-not (Test-Path -LiteralPath $f)) { Write-Host ('OLCULEMEDI: ' + $f); exit 2 } }
foreach ($c in 'docker', 'node') { if (-not (Get-Command $c -ErrorAction SilentlyContinue)) { Write-Host ('OLCULEMEDI: ' + $c + ' yok'); exit 2 } }
if (-not (Test-Path -LiteralPath $ClientIpModule)) { Write-Host ('OLCULEMEDI: client-ip modulu yok'); exit 2 }
if (-not (Test-Path -LiteralPath $ExpressNodePath)) { Write-Host ('OLCULEMEDI: express yolu yok'); exit 2 }

$tmp = Join-Path ([IO.Path]::GetTempPath()) ('hy-direct-' + [Guid]::NewGuid().ToString('N').Substring(0, 8))
New-Item -ItemType Directory -Path $tmp | Out-Null

# Dogrudan profil: site adresi {$PUBLIC_HOST} yerine dinleme portu verilir ve ACME kapatilir,
# boylece prova HTTP uzerinden kosar ve DIS AG'a hicbir sertifika istegi gitmez.
$d = Get-Content -Raw -LiteralPath $direct
$d = $d -replace '(?m)^\{\$PUBLIC_HOST\}\s*\{', '{$CADDY_LISTEN::8081} {'
$d = $d -replace '(?m)^\{\r?\n\s*# Do.rudan modda.*\r?\n\s*admin off\r?\n\}', "{`n`tadmin off`n`tauto_https off`n}"
if ($d -notmatch 'auto_https off') { $d = $d -replace '(?m)^\{\r?\n', "{`n`tauto_https off`n" }
Set-Content -LiteralPath (Join-Path $tmp 'Caddyfile.direct') -Value $d -Encoding UTF8
Copy-Item $tunnel (Join-Path $tmp 'Caddyfile.tunnel') -Force

$env:NODE_PATH = $ExpressNodePath
$procs = @()
$rc = 2
try {
  $procs += Start-Process -FilePath node -ArgumentList $backend, $apiPort, $ClientIpModule, '127.0.0.1' -PassThru -WindowStyle Hidden
  Start-Sleep -Seconds 3

  foreach ($pair in @(@('hy-direct', 'Caddyfile.direct', $dPort), @('hy-tunnelmode', 'Caddyfile.tunnel', $tPort))) {
    Invoke-Native { docker stop $pair[0] 2>&1 } | Out-Null
    Invoke-Native {
      docker run -d --name $pair[0] -p ("127.0.0.1:{0}:8081" -f $pair[2]) `
        -e CADDY_LISTEN=":8081" -e ("API_UPSTREAM=host.docker.internal:{0}" -f $apiPort) -e "WEB_UPSTREAM=host.docker.internal:9" `
        --add-host=host.docker.internal:host-gateway -v "${tmp}:/cfg:ro" $image caddy run --config ("/cfg/" + $pair[1]) --adapter caddyfile 2>&1
    } | Out-Null
  }
  Start-Sleep -Seconds 4

  $up = Invoke-Native { docker ps --filter name=hy-direct --filter name=hy-tunnelmode --format "{{.Names}}" 2>&1 }
  Write-Host ('  ayakta: ' + ($up -join ', '))

  $out = Invoke-Native { & node $probe $dPort $tPort 2>&1 } | Out-String
  $rc = $LASTEXITCODE
  $j = $null; try { $j = $out | ConvertFrom-Json } catch { }
  if ($null -eq $j) { Write-Host 'OLCULEMEDI: prova JSON uretmedi'; Write-Host $out; $rc = 2 }
  else {
    $j.rows | Format-Table @{n='sonuc';e={$_.sonuc}}, @{n='id';e={$_.id}}, @{n='aciklama';e={$_.aciklama}}, @{n='gozlem';e={$_.gozlem}} -AutoSize -Wrap | Out-String | Write-Host
    Write-Host ('DOGRUDAN MOD PROVASI: PASS ' + $j.pass + ' / ' + $j.toplam)
  }
}
finally {
  foreach ($n in 'hy-direct', 'hy-tunnelmode') { Invoke-Native { docker stop $n 2>&1 } | Out-Null }
  Invoke-Native { docker container prune -f 2>&1 } | Out-Null
  foreach ($p in $procs) { if ($p -and -not $p.HasExited) { Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue } }
  Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue
}

Write-Host '  (canli 8080/3002 kullanilmadi; DNS/NAT/sertifika islemi YAPILMADI)'
exit $rc
