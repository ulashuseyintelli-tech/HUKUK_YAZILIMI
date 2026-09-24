# =============================================================================
# ISTEMCI-IP ZINCIRI PROVASI — CANLIYA DOKUNMAZ, SUNUCU ACILMAZ.
#
# Zincir: Cloudflare → cloudflared → Caddy → API. Bu prova Caddy'den itibaren olcer ve
# API tarafinda URUNUN GERCEK parcalarini kullanir:
#   express 4.21.2 + `trust proxy = 1` (canli main.js ile ayni ayar)
#   + CANLI dist'ten derlenmis `public-intake-client-ip.js` (yalniz OKUNUR)
#   + `PublicIntakeRateLimitGuard` ile ayni anahtar: sha256(cozulen ip)
#
# OLCULMEYEN (belgeye dayanan) SINIR: Cloudflare kenarinin istemciden gelen
# `CF-Connecting-IP` basligini kendi degeriyle EZDIGI saglayici belgesindendir; burada
# olculmez ve canli zincirde ayrica dogrulanir.
#
# MUTASYON: `{vars.client_real_ip}` yerine R01'deki `{remote_host}` konuldugunda iki farkli
# muvekkilin AYNI hiz siniri sayacina dustugu gosterilir (S-3 kusuru gercek mi).
#
# CIKIS: 0 hepsi PASS · 1 FAIL · 2 olculemedi
# =============================================================================
param(
  [string]$ClientIpModule = 'C:\Development\HUKUK_YAZILIMI\HY_W4_RELEASE23\project\apps\api\dist\apps\api\src\modules\client-intake-public\public-intake-client-ip.js',
  [string]$ExpressNodePath = 'D:\Development\HUKUK_YAZILIMI\project\project\node_modules\.pnpm\express@4.21.2\node_modules'
)
$ErrorActionPreference = 'Stop'
$here     = $PSScriptRoot
$template = Join-Path (Split-Path $here -Parent) 'templates\Caddyfile.template'
$backend  = Join-Path $here 'edge-client-ip-backend.js'
$probe    = Join-Path $here 'edge-client-ip-probe.js'
$image    = 'caddy:2-alpine'
$edgePort = 8087; $mutPort = 8088; $apiPort = 8191; $strictPort = 8194

function Invoke-Native([scriptblock]$sb) {
  $old = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
  try { & $sb } finally { $ErrorActionPreference = $old }
}

foreach ($f in $template, $backend, $probe) { if (-not (Test-Path -LiteralPath $f)) { Write-Host ('OLCULEMEDI: ' + $f); exit 2 } }
foreach ($c in 'docker', 'node') { if (-not (Get-Command $c -ErrorAction SilentlyContinue)) { Write-Host ('OLCULEMEDI: ' + $c + ' yok'); exit 2 } }
if (-not (Test-Path -LiteralPath $ClientIpModule)) { Write-Host ('OLCULEMEDI: client-ip modulu yok: ' + $ClientIpModule); exit 2 }
if (-not (Test-Path -LiteralPath $ExpressNodePath)) { Write-Host ('OLCULEMEDI: express yolu yok: ' + $ExpressNodePath); exit 2 }

$tmp = Join-Path ([IO.Path]::GetTempPath()) ('hy-edgeip-' + [Guid]::NewGuid().ToString('N').Substring(0, 8))
New-Item -ItemType Directory -Path $tmp | Out-Null
Copy-Item $template (Join-Path $tmp 'Caddyfile') -Force
# Mutasyon: S-3 duzeltmesi geri alinmis surum
((Get-Content -Raw -LiteralPath $template) -replace '\{vars\.client_real_ip\}', '{remote_host}') |
  Set-Content -LiteralPath (Join-Path $tmp 'Caddyfile.mut') -Encoding UTF8

$env:NODE_PATH = $ExpressNodePath
$procs = @()
$rc = 2
try {
  $procs += Start-Process -FilePath node -ArgumentList $backend, $apiPort, $ClientIpModule, '127.0.0.1' -PassThru -WindowStyle Hidden
  $procs += Start-Process -FilePath node -ArgumentList $backend, $strictPort, $ClientIpModule, '-' -PassThru -WindowStyle Hidden
  Start-Sleep -Seconds 3

  foreach ($pair in @(@('hy-edgeip', 'Caddyfile', $edgePort), @('hy-edgeip-mut', 'Caddyfile.mut', $mutPort))) {
    Invoke-Native { docker stop $pair[0] 2>&1 } | Out-Null
    Invoke-Native {
      docker run -d --name $pair[0] -p ("127.0.0.1:{0}:8081" -f $pair[2]) `
        -e CADDY_LISTEN=":8081" -e ("API_UPSTREAM=host.docker.internal:{0}" -f $apiPort) -e "WEB_UPSTREAM=host.docker.internal:9" `
        --add-host=host.docker.internal:host-gateway -v "${tmp}:/cfg:ro" $image caddy run --config ("/cfg/" + $pair[1]) --adapter caddyfile 2>&1
    } | Out-Null
  }
  Start-Sleep -Seconds 4

  Write-Host '--- ZINCIR PROVASI (duzeltilmis sablon) ---'
  $out = Invoke-Native { & node $probe $edgePort $strictPort 2>&1 } | Out-String
  $rc = $LASTEXITCODE
  $j = $null; try { $j = $out | ConvertFrom-Json } catch { }
  if ($null -eq $j) { Write-Host 'OLCULEMEDI: prova JSON uretmedi'; Write-Host $out; $rc = 2 }
  else { $j.rows | Format-Table @{n='sonuc';e={$_.sonuc}}, @{n='id';e={$_.id}}, @{n='aciklama';e={$_.aciklama}}, @{n='gozlem';e={$_.gozlem}} -AutoSize -Wrap | Out-String | Write-Host }

  Write-Host '--- MUTASYON: S-3 duzeltmesi geri alinirsa ---'
  $h = @{ 'CF-Connecting-IP' = '203.0.113.10' }
  $k = @{ 'CF-Connecting-IP' = '198.51.100.20' }
  $u = 'http://127.0.0.1:{0}/api/public/intake/T' -f $mutPort
  $m1 = (Invoke-WebRequest -Uri $u -Headers $h -TimeoutSec 10 -UseBasicParsing).Content | ConvertFrom-Json
  $m2 = (Invoke-WebRequest -Uri $u -Headers $k -TimeoutSec 10 -UseBasicParsing).Content | ConvertFrom-Json
  $collapsed = ($m1.rateLimitIpHash -eq $m2.rateLimitIpHash)
  Write-Host ('  203.0.113.10  -> cozulen=' + $m1.resolvedClientIp + '  sayac=' + $m1.rateLimitIpHash.Substring(0, 12))
  Write-Host ('  198.51.100.20 -> cozulen=' + $m2.resolvedClientIp + '  sayac=' + $m2.rateLimitIpHash.Substring(0, 12))
  Write-Host ('  iki muvekkil AYNI sayacta mi: ' + $collapsed + '   (beklenen: True — kusur gercek)')
  if (-not $collapsed) { Write-Host '  MUTASYON BEKLENTISI TUTMADI — prova kusuru olabilir'; $rc = 1 }
}
finally {
  foreach ($n in 'hy-edgeip', 'hy-edgeip-mut') { Invoke-Native { docker stop $n 2>&1 } | Out-Null }
  Invoke-Native { docker container prune -f 2>&1 } | Out-Null
  foreach ($p in $procs) { if ($p -and -not $p.HasExited) { Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue } }
  Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue
}

Write-Host ('ISTEMCI-IP PROVASI cikis=' + $rc)
Write-Host '  (canli 8080/3002 kullanilmadi; canli dist yalniz OKUNDU, sunucu acilmadi)'
exit $rc
