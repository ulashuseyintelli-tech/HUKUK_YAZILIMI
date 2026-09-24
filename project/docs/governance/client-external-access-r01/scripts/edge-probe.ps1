$ErrorActionPreference = 'Stop'
# =============================================================================
# IZOLE KENAR PROVASI — CANLIYA DOKUNMAZ.
#
# Ne yapar: Caddyfile.template'i gercek Caddy ile (docker) calistirir, iki SAHTE arka uca
# baglar ve izin listesini DAVRANISSAL olcer. Canli 8080/3002 portlari KULLANILMAZ,
# canli .env okunmaz, DNS/tunel/yayin islemi YAPILMAZ.
#
# Uc kapi:
#   A) Sira kapisi     — `caddy adapt` JSON'unda admin RET rotasi, catch-all RET'ten ONCE mi?
#                        (R01 kusuru S-2: `respond` direktifi `handle`'dan SONRA siralaniyordu)
#   B) Dinleme kapisi  — uretilen sunucu 443'te DEGIL, verilen loopback adresinde dinliyor mu?
#                        (R01 kusuru S-1: site adresi {$PUBLIC_HOST} idi -> listen [":443"] + ACME)
#   C) Davranis kapisi — 38 izinli cift + 29 ret + 18 kodlama/normalizasyon + XFF.
#
# KULLANIM: powershell -NoProfile -ExecutionPolicy Bypass -File edge-probe.ps1
# CIKIS: 0 hepsi PASS · 1 en az bir FAIL · 2 olculemedi (docker/node yok)
# =============================================================================
$here     = $PSScriptRoot
$template = Join-Path (Split-Path $here -Parent) 'templates\Caddyfile.template'
$backends = Join-Path $here 'edge-backends.js'
$probe    = Join-Path $here 'edge-allowlist-probe.js'
$image    = 'caddy:2-alpine'
$cname    = 'hy-edge-probe'
$edgePort = 8085
$webPort  = 8192
$apiPort  = 8191

foreach ($f in $template, $backends, $probe) {
  if (-not (Test-Path -LiteralPath $f)) { Write-Host ('OLCULEMEDI: ' + $f); exit 2 }
}
foreach ($c in 'docker', 'node') {
  if (-not (Get-Command $c -ErrorAction SilentlyContinue)) { Write-Host ('OLCULEMEDI: ' + $c + ' yok'); exit 2 }
}

# Canli portlara dokunmadigimizi PROVA ONCESI olc.
foreach ($p in 8080, 3002) {
  if ($edgePort -eq $p -or $webPort -eq $p -or $apiPort -eq $p) { Write-Host 'HATA: prova canli portu kullaniyor'; exit 2 }
}

# PS 5.1 tuzagi: $ErrorActionPreference='Stop' ile yerli komutun stderr'i NativeCommandError'a
# donusur (docker/caddy uyariyi stderr'e yazar). Yerli cagrilar bu sarmalayicidan gecer.
function Invoke-Native([scriptblock]$sb) {
  $old = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try { & $sb } finally { $ErrorActionPreference = $old }
}

$rows = @()
function Check([string]$id, [string]$desc, [bool]$ok, [string]$gozlem) {
  $script:rows += [pscustomobject]@{ id = $id; sonuc = $(if ($ok) { 'PASS' } else { 'FAIL' }); aciklama = $desc; gozlem = $gozlem }
}

$tmp = Join-Path ([IO.Path]::GetTempPath()) ('hy-edge-' + [Guid]::NewGuid().ToString('N').Substring(0, 8))
New-Item -ItemType Directory -Path $tmp | Out-Null
Copy-Item $template (Join-Path $tmp 'Caddyfile') -Force

$nodeProc = $null
try {
  # --- A + B: adapt ciktisindan sira ve dinleme adresi ---
  $adapt = Invoke-Native { docker run --rm -e CADDY_LISTEN=":8081" -v "${tmp}:/cfg:ro" $image caddy adapt --config /cfg/Caddyfile 2>&1 } | Out-String
  $jsonStart = $adapt.IndexOf('{"apps"')
  if ($jsonStart -lt 0) { $jsonStart = $adapt.IndexOf('{"admin"') }
  if ($jsonStart -lt 0) { Write-Host 'OLCULEMEDI: caddy adapt JSON uretmedi'; Write-Host $adapt; exit 2 }
  $cfg = ($adapt.Substring($jsonStart) -split "`n")[0] | ConvertFrom-Json

  $srv = $cfg.apps.http.servers.PSObject.Properties | Select-Object -First 1
  $listen = @($srv.Value.listen)
  Check 'B-1' 'uretilen sunucu 443 DINLEMIYOR (tunel arkasinda ACME/443 olmaz)' (-not ($listen -contains ':443')) ('listen=' + ($listen -join ','))
  Check 'B-2' 'otomatik HTTPS kapali (auto_https off)' ($null -ne $srv.Value.automatic_https -and $srv.Value.automatic_https.disable -eq $true) ('automatic_https=' + ($srv.Value.automatic_https | ConvertTo-Json -Compress))

  # Rota sirasi: deny (admin) rotasi, catch-all RET rotasindan ONCE gelmeli.
  $flat = @()
  foreach ($r in $srv.Value.routes) {
    foreach ($h in $r.handle) {
      if ($h.handler -eq 'subroute') { foreach ($rr in $h.routes) { $flat += $rr } } else { $flat += $r }
    }
  }
  $denyIdx = -1; $catchIdx = -1
  for ($i = 0; $i -lt $flat.Count; $i++) {
    $m = $flat[$i].match
    $isAdminDeny = $false
    if ($m) { foreach ($mm in $m) { if ($mm.path_regexp -and $mm.path_regexp.pattern -like '*portal/admin*') { $isAdminDeny = $true } } }
    if ($isAdminDeny -and $denyIdx -lt 0) { $denyIdx = $i }
    if (-not $m -and $catchIdx -lt 0) { $catchIdx = $i }
  }
  Check 'A-1' 'admin RET rotasi uretilen yapilandirmada VAR' ($denyIdx -ge 0) ('deny sira=' + $denyIdx)
  Check 'A-2' 'admin RET, catch-all RET''ten ONCE degerlendirilir (S-2 regresyonu)' (($denyIdx -ge 0) -and ($catchIdx -ge 0) -and ($denyIdx -lt $catchIdx)) ('deny=' + $denyIdx + ' catchAll=' + $catchIdx)

  # --- C: davranis ---
  $nodeProc = Start-Process -FilePath 'node' -ArgumentList $backends, $webPort, $apiPort -PassThru -WindowStyle Hidden
  Start-Sleep -Seconds 2
  Invoke-Native { docker rm -f $cname 2>&1 } | Out-Null
  Invoke-Native {
    docker run -d --name $cname -p ("127.0.0.1:{0}:8081" -f $edgePort) `
      -e CADDY_LISTEN=":8081" -e ("API_UPSTREAM=host.docker.internal:{0}" -f $apiPort) -e ("WEB_UPSTREAM=host.docker.internal:{0}" -f $webPort) `
      --add-host=host.docker.internal:host-gateway -v "${tmp}:/cfg:ro" $image caddy run --config /cfg/Caddyfile --adapter caddyfile 2>&1
  } | Out-Null
  Start-Sleep -Seconds 3

  $probeOut = Invoke-Native { & node $probe $edgePort 2>&1 } | Out-String
  $probeRc = $LASTEXITCODE
  $pj = $null
  try { $pj = $probeOut | ConvertFrom-Json } catch { }
  if ($null -eq $pj) { Check 'C-0' 'davranis provasi JSON uretti' $false 'prova ciktisi ayristirilamadi' }
  else {
    Check 'C-1' 'izin listesi: her cift DOGRU arka uca 200' (@($pj.rows | Where-Object { $_.grup -eq 'IZIN' -and $_.sonuc -eq 'FAIL' }).Count -eq 0) ('izin=' + @($pj.rows | Where-Object grup -eq 'IZIN').Count)
    Check 'C-2' 'ret listesi: 403 ve arka uca HIC gitmez' (@($pj.rows | Where-Object { $_.grup -eq 'RET' -and $_.sonuc -eq 'FAIL' }).Count -eq 0) ('ret=' + @($pj.rows | Where-Object grup -eq 'RET').Count)
    Check 'C-3' 'kodlama/normalizasyon izin listesini ASMIYOR' (@($pj.rows | Where-Object { $_.grup -eq 'KODLAMA' -and $_.sonuc -eq 'FAIL' }).Count -eq 0) ('kodlama=' + @($pj.rows | Where-Object grup -eq 'KODLAMA').Count)
    Check 'C-4' 'istemcinin sahte X-Forwarded-For degeri kenarda SILINIR' (@($pj.rows | Where-Object { $_.grup -eq 'XFF' -and $_.sonuc -eq 'FAIL' }).Count -eq 0) ('prova cikis=' + $probeRc)
  }
}
finally {
  Invoke-Native { docker rm -f $cname 2>&1 } | Out-Null
  if ($nodeProc -and -not $nodeProc.HasExited) { Stop-Process -Id $nodeProc.Id -Force -ErrorAction SilentlyContinue }
  Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue
}

$rows | Format-Table -AutoSize | Out-String | Write-Host
$fail = @($rows | Where-Object { $_.sonuc -eq 'FAIL' }).Count
Write-Host ('IZOLE KENAR PROVASI: PASS ' + ($rows.Count - $fail) + ' / ' + $rows.Count)
Write-Host '  (canli 8080/3002 kullanilmadi; DNS, tunel ve yayin islemi yapilmadi)'
if ($fail -gt 0) { exit 1 }
exit 0
