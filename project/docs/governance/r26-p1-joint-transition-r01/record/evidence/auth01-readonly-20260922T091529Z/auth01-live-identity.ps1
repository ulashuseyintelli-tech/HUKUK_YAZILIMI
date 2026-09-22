param([Parameter(Mandatory = $true)][string]$Out, [Parameter(Mandatory = $true)][string]$Phase)
# SALT OKUMA: canli WEB build kimligi + 3002/8080 surec kimligi. HTTP YOK, .env okunmaz, yazma yalniz $Out.
$ErrorActionPreference = 'Stop'
$NX = 'C:\Development\HUKUK_YAZILIMI\HY_W4_RELEASE23\project\apps\web\.next'
$m = @{}
foreach ($f in Get-ChildItem -LiteralPath $NX -Recurse -File -Force) {
  $rel = ($f.FullName.Substring($NX.Length).TrimStart('\', '/')) -replace '\\', '/'
  if ($rel.StartsWith('cache/') -or $rel -ceq 'trace') { continue }
  $m[$rel] = (Get-FileHash -Algorithm SHA256 -LiteralPath $f.FullName).Hash
}
$keys = New-Object 'System.Collections.Generic.List[string]'; foreach ($k in $m.Keys) { $keys.Add([string]$k) }; $keys.Sort([StringComparer]::Ordinal)
$sb = New-Object Text.StringBuilder; foreach ($k in $keys) { [void]$sb.Append($k).Append("`0").Append($m[$k]).Append("`n") }
$d = [BitConverter]::ToString([Security.Cryptography.SHA256]::Create().ComputeHash([Text.Encoding]::UTF8.GetBytes($sb.ToString()))).Replace('-', '')
$proc = [ordered]@{}
foreach ($port in 3002, 8080) {
  $c = @(Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue)
  $pids = @($c | ForEach-Object { $_.OwningProcess } | Sort-Object -Unique)
  $p = if ($pids.Count -ge 1) { Get-Process -Id $pids[0] } else { $null }
  $proc["$port"] = [ordered]@{ listeners = $pids.Count; pid = $(if ($p) { $p.Id } else { $null }); startUtc = $(if ($p) { $p.StartTime.ToUniversalTime().ToString('o') } else { $null }) }
}
$o = [ordered]@{
  record = 'OFFICE-AUTH01-LIVE-IDENTITY'; phase = $Phase; tsUtc = (Get-Date).ToUniversalTime().ToString('o')
  webNextDigest = $d; webNextFiles = $m.Count; recipe = 'relpath(/)+NUL+SHA256UPPER+LF, ordinal, sha256; cache/ + trace haric'
  webDigestEqualsR26 = ($d -ceq 'C17E7B132FB7DED65AD0788024AA478F0949AF0D5D9045E8F47779A31A615326')
  buildId = (Get-Content -LiteralPath (Join-Path $NX 'BUILD_ID') -Raw).Trim()
  processes = $proc
}
[IO.File]::WriteAllText($Out, ($o | ConvertTo-Json -Depth 5), (New-Object Text.UTF8Encoding($false)))
Write-Output ("{0}: web={1} ({2}) esit={3} buildId={4} web pid={5} start={6} api pid={7}" -f $Phase, $d.Substring(0, 16), $m.Count, $o.webDigestEqualsR26, $o.buildId, $proc['3002'].pid, $proc['3002'].startUtc, $proc['8080'].pid)
