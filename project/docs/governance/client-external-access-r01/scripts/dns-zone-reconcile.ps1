# =============================================================================
# BOLGE DOKUMU UZLASTIRMA — SALT OKUMA. Hicbir kayit degistirilmez.
#
# Girdi: owner ekraninda gorunen kayit ADLARI (satir satir; "@" veya bos = kok).
#        Deger sutunu GEREKMEZ — kesilmis TXT/DKIM degerleri burada TAM olarak
#        yetkili sunucudan okunur.
# Cikti: her ad icin tum kayit tipleri + §14 tablosuyla fark (YENI / EKSIK / AYNI).
#
# KULLANIM: powershell -File zone-reconcile.ps1 -NameFile adlar.txt
#           (dosya verilmezse §14'te bilinen adlarla kendi kendini dogrular)
# =============================================================================
param(
  [string]$NameFile = '',
  [string]$Zone = 'tellihukuk.com',
  [string]$AuthServer = '37.230.110.110'
)
$ErrorActionPreference = 'Continue'

# §14'te olculmus taban (2026-09-24). Karsilastirma referansi.
$bilinen = @(
  '@', 'www', 'mail', 'webmail', 'cpanel', 'autodiscover', 'autoconfig', 'ftp',
  '_dmarc', 'default._domainkey'
)

$adlar = if ($NameFile -and (Test-Path -LiteralPath $NameFile)) {
  Get-Content -LiteralPath $NameFile | ForEach-Object { $_.Trim() } | Where-Object { $_ -ne '' -and -not $_.StartsWith('#') }
} else {
  Write-Host 'NOT: ad dosyasi verilmedi -> §14 taban adlariyla kendi kendini dogrulama' -ForegroundColor Yellow
  $bilinen
}

# NOT: 'CAA' bu PowerShell surumunun RecordType enum'unda YOK (olculdu: parametre baglanmiyor).
# Bolgede CAA kaydi ayrica sorgulandi ve YOK; owner dokumunde CAA gorunurse elle eklenir.
$tipler = 'A', 'AAAA', 'CNAME', 'MX', 'TXT', 'SRV', 'NS'
$bulunan = @()

foreach ($ad in $adlar) {
  $kisa = $ad.TrimEnd('.') -replace ("\." + [regex]::Escape($Zone) + '$'), ''
  if ($kisa -eq '' -or $kisa -eq '@') { $kisa = '@' }
  $fqdn = if ($kisa -eq '@') { $Zone } else { "$kisa.$Zone" }

  # Once CNAME: varsa bu ad icin BASKA tip sorgulanmaz (CNAME tekil olmak zorundadir ve
  # cozucu diger tiplerde HEDEFIN kayitlarini dondurur -> yanlis pozitif).
  $cn = Resolve-DnsName $fqdn -Type CNAME -Server $AuthServer -QuickTimeout -ErrorAction SilentlyContinue 2>$null |
    Where-Object { $_.QueryType -eq 'CNAME' -and $_.Name -eq $fqdn }
  $buTipler = if ($cn) { @('CNAME') } else { $tipler }

  foreach ($tip in $buTipler) {
    $r = Resolve-DnsName $fqdn -Type $tip -Server $AuthServer -QuickTimeout -ErrorAction SilentlyContinue 2>$null
    # `$_.Name -eq $fqdn`: CNAME zinciriyle gelen HEDEF kayitlarini eler.
    foreach ($x in @($r | Where-Object { $_.QueryType -eq $tip -and $_.Name -eq $fqdn })) {
      $deger = switch ($tip) {
        'A'     { $x.IPAddress }
        'AAAA'  { $x.IPAddress }
        'CNAME' { $x.NameHost }
        'NS'    { $x.NameHost }
        'MX'    { "pref=$($x.Preference) $($x.NameExchange)" }
        'TXT'   { ($x.Strings -join '') }
        'CAA'   { ($x | Out-String).Trim() }
        'SRV'   { "$($x.Priority) $($x.Weight) $($x.Port) $($x.NameTarget)" }
      }
      if ($deger) {
        $bulunan += [pscustomobject]@{
          ad = $kisa; tip = $tip; ttl = $x.TTL; uzunluk = $deger.Length; deger = $deger
        }
      }
    }
  }
}

Write-Host ''
Write-Host ('BULUNAN KAYITLAR (' + $bulunan.Count + ')') -ForegroundColor Cyan
$bulunan | ForEach-Object {
  $kisaDeger = if ($_.deger.Length -gt 90) { $_.deger.Substring(0, 87) + '...' } else { $_.deger }
  '{0,-22} {1,-6} TTL={2,-7} ({3,4} karakter) {4}' -f $_.ad, $_.tip, $_.ttl, $_.uzunluk, $kisaDeger
}

# --- FARK ---
$gelenAdlar = @($bulunan | Select-Object -Expand ad -Unique)
$yeni   = @($gelenAdlar | Where-Object { $bilinen -notcontains $_ })
$eksik  = @($bilinen | Where-Object { $gelenAdlar -notcontains $_ })

Write-Host ''
Write-Host '§14 TABANIYLA FARK' -ForegroundColor Cyan
Write-Host ('  YENI  (tabanda yok, dokumde var) : ' + $(if ($yeni.Count)  { $yeni -join ', ' }  else { 'yok' }))
Write-Host ('  EKSIK (tabanda var, dokumde yok) : ' + $(if ($eksik.Count) { $eksik -join ', ' } else { 'yok' }))

# --- TAM DEGER KANITI: uzun TXT'ler kesilmeden okundu mu ---
$uzun = @($bulunan | Where-Object { $_.tip -eq 'TXT' -and $_.uzunluk -gt 100 })
Write-Host ''
Write-Host ('UZUN TXT/DKIM KAYITLARI (tam deger olculdu): ' + $uzun.Count) -ForegroundColor Cyan
$uzun | ForEach-Object { '  {0} -> {1} karakter, sonu: ...{2}' -f $_.ad, $_.uzunluk, $_.deger.Substring($_.deger.Length - 24) }

# Cloudflare'a girilecek liste (dosyaya)
$out = Join-Path ([IO.Path]::GetTempPath()) ('zone-' + $Zone + '-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.tsv')
$bulunan | Export-Csv -LiteralPath $out -Delimiter "`t" -NoTypeInformation -Encoding UTF8
Write-Host ''
Write-Host ('Tam liste yazildi: ' + $out)
Write-Host '  (salt okuma; hicbir kayit degistirilmedi, NS degistirilmedi, kurulum yapilmadi)'
