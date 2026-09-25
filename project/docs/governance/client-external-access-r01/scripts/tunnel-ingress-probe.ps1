# =============================================================================
# TUNEL INGRESS ESLEMESI PROVASI — HESAP / KIMLIK BILGISI / AG GEREKTIRMEZ.
#
# Resmi `cloudflared` (docker `cloudflare/cloudflared`) ile sablonun HANGI kurali sectigini
# olcer (`tunnel ingress validate` + `tunnel ingress rule <url>`). Tunel ACILMAZ, Cloudflare'a
# BAGLANILMAZ; komutlar yalniz yerel yapilandirmayi degerlendirir.
#
# Olculen iddialar:
#   G-1 yapilandirma gecerli
#   G-2 ozel ad (form) ve yardimci fallback origin adi TEK hedefe, Caddy 127.0.0.1:8081'e gider
#       — admin yolu dahil HER yol; yani yol/yontem karari tunelde degil, Caddy'dedir
#   G-3 baska her Host (yardimci apex, rastgele ad, tellihukuk.com'un diger adlari) 404 alir
#   G-4 sablonda API (8080) veya Web (3002) hedefi YOK — tunel Caddy'yi atlayamaz
#
# NOT: Bu prova tunelin CANLI davranisi degildir; Cloudflare kenarinin ozel ad trafigini
# hangi Host basligiyla tunele ilettigi burada olculmez (kurulumda olculur, paket §19.5).
#
# CIKIS: 0 hepsi PASS · 1 FAIL · 2 olculemedi
# =============================================================================
param(
  [string]$PublicHost = 'form.tellihukuk.com',
  [string]$FallbackHost = 'origin.yardimci.example'
)
$ErrorActionPreference = 'Stop'
$here  = $PSScriptRoot
$tpl   = Join-Path (Split-Path $here -Parent) 'templates\cloudflared-config.yml.template'
$image = 'cloudflare/cloudflared:latest'

# PS 5.1: cloudflared ciktisini STDERR'e yazar; `2>&1` bunlari ErrorRecord olarak getirir ve Out-String
# onlari NativeCommandError bicimiyle basar. Cagri yerinde [string] ile duz metne cevrilir.
function Invoke-Native([scriptblock]$sb) {
  $old = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
  try { & $sb } finally { $ErrorActionPreference = $old }
}
if (-not (Test-Path -LiteralPath $tpl)) { Write-Host 'OLCULEMEDI: sablon yok'; exit 2 }
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { Write-Host 'OLCULEMEDI: docker yok'; exit 2 }

$tmp = Join-Path ([IO.Path]::GetTempPath()) ('hy-cfd-' + [Guid]::NewGuid().ToString('N').Substring(0, 8))
New-Item -ItemType Directory -Path $tmp | Out-Null
# PS 5.1 tuzagi: BOM'suz UTF-8 dosyayi `Get-Content` Windows-1254 okur; Turkce harflerin bazi baytlari
# (or. 'S cedilla' = C5 9E) tanimsiz kod noktasina duser ve C1 KONTROL KARAKTERINE donusur -> cloudflared
# 'control characters are not allowed' der (olculdu). Sablon ACIKCA UTF-8 okunur.
$src = [IO.File]::ReadAllText($tpl, [Text.Encoding]::UTF8)
$cfg = $src.Replace('<TUNNEL_ID>', '00000000-0000-0000-0000-000000000000').Replace('<CREDENTIALS_PATH>', '/cfg/yok.json').Replace('<FALLBACK_ORIGIN_HOST>', $FallbackHost).Replace('<PUBLIC_HOST>', $PublicHost)
# PS 5.1 tuzagi: `Set-Content -Encoding UTF8` BOM yazar; cloudflared YAML ayristiricisi BOM'u
# kontrol karakteri sayip reddeder (olculdu). Canli kurulumda da config.yml BOM'SUZ yazilmalidir.
[IO.File]::WriteAllText((Join-Path $tmp 'config.yml'), $cfg, (New-Object Text.UTF8Encoding($false)))

$rows = @()
function Check([string]$id, [string]$desc, [bool]$ok, [string]$gozlem) {
  $script:rows += [pscustomobject]@{ id = $id; sonuc = $(if ($ok) { 'PASS' } else { 'FAIL' }); aciklama = $desc; gozlem = $gozlem }
}
function Rule([string]$url) {
  $o = Invoke-Native { docker run --rm -v "${tmp}:/cfg:ro" $image tunnel --config /cfg/config.yml ingress rule $url 2>&1 } | ForEach-Object { [string]$_ } | Out-String
  $svc = [regex]::Match($o, 'service:\s*(\S+)').Groups[1].Value
  return $svc
}

try {
  $v = Invoke-Native { docker run --rm -v "${tmp}:/cfg:ro" $image tunnel --config /cfg/config.yml ingress validate 2>&1 } | ForEach-Object { [string]$_ } | Out-String
  Check 'G-1' 'tunel yapilandirmasi gecerli (cloudflared ingress validate)' ($v -match '(?m)^OK\s*$') ('cikti son satiri: ' + (($v.Trim() -split "`n")[-1]).Trim())

  $caddy = 'http://127.0.0.1:8081'
  $yollar = @('/intake/TKN', '/api/portal/login', '/api/portal/admin/create-user', '/auth/login', '/')
  foreach ($h in @($PublicHost, $FallbackHost)) {
    $sonuc = @($yollar | ForEach-Object { Rule ('https://' + $h + $_) })
    $hepsiCaddy = (@($sonuc | Where-Object { $_ -ne $caddy }).Count -eq 0)
    Check ('G-2 ' + $h) ('"' + $h + '" icin HER yol (admin dahil) yalniz Caddy''ye gider') $hepsiCaddy ('hedefler: ' + (($sonuc | Sort-Object -Unique) -join ','))
  }

  $parts = $FallbackHost.Split('.')
  $apex = ($parts[1..($parts.Length - 1)] -join '.')
  $yabanci = @($apex, ('www.' + $apex), 'evil.example', 'tellihukuk.com', 'www.tellihukuk.com', 'mail.tellihukuk.com')
  $kotu = @()
  foreach ($h in $yabanci) { $s = Rule ('https://' + $h + '/api/portal/cases'); if ($s -ne 'http_status:404') { $kotu += ($h + '->' + $s) } }
  Check 'G-3' 'baska her Host 404 alir (yardimci apex, rastgele ad, tellihukuk.com''un diger adlari)' ($kotu.Count -eq 0) ('denenen=' + $yabanci.Count + ' · 404 olmayan=' + $(if ($kotu.Count) { $kotu -join ';' } else { 'yok' }))

  $etkin = @(($src -split "`r?`n") | Where-Object { $_ -notmatch '^\s*#' }) -join "`n"
  Check 'G-4' 'sablonda API (8080) ya da Web (3002) hedefi YOK' (-not ($etkin -match ':(8080|3002)')) 'etkin satirlarda 8080/3002 yok'
}
finally { Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue }

$rows | Format-Table id, sonuc, aciklama, gozlem -AutoSize -Wrap | Out-String -Width 200 | Write-Host
$fail = @($rows | Where-Object { $_.sonuc -eq 'FAIL' }).Count
Write-Host ('TUNEL INGRESS PROVASI: PASS ' + ($rows.Count - $fail) + ' / ' + $rows.Count)
Write-Host '  (yerel yapilandirma degerlendirmesi; tunel acilmadi, Cloudflare''a baglanilmadi)'
if ($fail -gt 0) { exit 1 }
exit 0
