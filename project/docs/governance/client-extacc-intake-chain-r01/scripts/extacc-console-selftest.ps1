# ═══════════ EXTACC KONSOL DAVRANIŞI ÖZ-TESTİ — CANLIYA DOKUNMAZ ═══════════
# NEYİ ÖLÇER: extacc-display.js'in ekrana yazdığı adres (sahte, rastgele token)
#   C-1 GERÇEKTEN konsol arabelleğine çizildi mi (pozitif kontrol — ölçüm yöntemi çalışıyor mu)
#   C-2 temizleme sonrası konsol arabelleğinde KALMADI mı
#   C-3 node'un yönlendirilmiş stdout/stderr loguna DÜŞMEDİ mi
#   C-4 PowerShell Start-Transcript kaydına DÜŞMEDİ mi
#   C-5 konsolu olmayan süreçte gösterim REDDEDİLİYOR mu (fail-closed, çıkış 4)
# NASIL: her durum YENİ, gizli bir konsol penceresinde (Start-Process powershell.exe; conhost) koşar; o pencere kendi
#   arabelleğini $Host.UI.RawUI.GetBufferContents ile okur. Sonuç dosyasına yalnız DOĞRU/YANLIŞ yazılır; token yazılmaz.
# ÖLÇMEDİĞİ (dürüst): Windows Terminal / uygulama terminal paneli gibi arabelleği KENDİSİ tutan barındırıcılar. Owner
#   bloğu bu yüzden bağımsız pencere teyidi ister ve koşum sonunda pencerenin kapatılmasını söyler.
# ÇIKIŞ: 0 hepsi PASS · 1 FAIL · 2 ölçülemedi
param([string]$Inner = '', [string]$Case = '', [string]$ResultFile = '')
$ErrorActionPreference = 'Stop'
$here = $PSScriptRoot
$probe = Join-Path $here 'extacc-console-probe.js'

if ($Inner -eq '1') {
  # ---- İÇ: yeni konsol penceresinde koşar
  $tok = -join ((1..43) | ForEach-Object { 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'[(Get-Random -Maximum 64)] })
  $url = "https://example.invalid/intake/$tok"
  $dir = Split-Path -Parent $ResultFile
  $log = Join-Path $dir "$Case-node.log"; $tr = Join-Path $dir "$Case-transcript.txt"
  $env:EXA_PROBE_TEXT = $url; $env:EXA_PROBE_CLEAR = $(if ($Case -eq 'clear') { '1' } else { '0' })
  Start-Transcript -LiteralPath $tr | Out-Null
  $global:LASTEXITCODE = -999
  $old = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
  if ($Case -eq 'noconsole') { & node $probe --detached *> $log } else { & node $probe *> $log }
  $code = $global:LASTEXITCODE; $ErrorActionPreference = $old
  Stop-Transcript | Out-Null
  $raw = $Host.UI.RawUI; $sz = $raw.BufferSize
  $rect = New-Object Management.Automation.Host.Rectangle 0, 0, ($sz.Width - 1), ($sz.Height - 1)
  $cells = $raw.GetBufferContents($rect)
  $sb = New-Object Text.StringBuilder
  for ($y = 0; $y -lt $cells.GetLength(0); $y++) { for ($x = 0; $x -lt $cells.GetLength(1); $x++) { [void]$sb.Append($cells.GetValue($y, $x).Character) }; [void]$sb.Append("`n") }
  $buf = $sb.ToString() -replace '\s+\n', "`n"
  $flat = $buf -replace "`n", ''   # satır kaydırmasına karşı
  $logT = if (Test-Path $log) { [IO.File]::ReadAllText($log) } else { '' }
  $trT = if (Test-Path $tr) { [IO.File]::ReadAllText($tr) } else { '' }
  [ordered]@{ case = $Case; probeExit = $code; bufferHasToken = ($flat.Contains($tok)); bufferHasProbeHeader = ($buf -match 'PROBE')
              logHasToken = $logT.Contains($tok); transcriptHasToken = $trT.Contains($tok); logHasProbeOk = ($logT -match 'probe ok'); logHasNoConsole = ($logT -match 'konsol yok')
              transcriptExists = (Test-Path $tr); host = $Host.Name } | ConvertTo-Json | Set-Content -LiteralPath $ResultFile -Encoding UTF8
  exit 0
}

# ---- DIŞ: her durumu ayrı gizli konsolda başlat
$W = Join-Path ([IO.Path]::GetTempPath()) ('extacc-console-test-' + [Guid]::NewGuid().ToString('N').Substring(0, 8))
New-Item -ItemType Directory -Path $W | Out-Null
$res = @{}
foreach ($c in 'show', 'clear', 'noconsole') {
  $rf = Join-Path $W "$c.json"
  $p = Start-Process -FilePath (Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe') -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', "`"$PSCommandPath`"", '-Inner', '1', '-Case', $c, '-ResultFile', "`"$rf`"") -WindowStyle Hidden -Wait -PassThru
  if (-not (Test-Path $rf)) { Write-Host "OLCULEMEDI: $c sonucu yok (çıkış $($p.ExitCode))"; exit 2 }
  $res[$c] = Get-Content -Raw -LiteralPath $rf | ConvertFrom-Json
}
$rows = @()
function Check($id, $d, $ok, $o) { $script:rows += [pscustomobject]@{ id = $id; sonuc = $(if ($ok) { 'PASS' } else { 'FAIL' }); aciklama = $d; gozlem = $o } }
$s = $res['show']; $c = $res['clear']; $n = $res['noconsole']
Check 'C-1' 'POZİTİF KONTROL: adres konsol arabelleğine çizildi (ölçüm yöntemi çalışıyor)' ($s.probeExit -eq 0 -and $s.bufferHasToken -and $s.bufferHasProbeHeader) "çıkış=$($s.probeExit) · arabellekte=$($s.bufferHasToken) · host=$($s.host)"
Check 'C-2' 'temizleme sonrası adres konsol arabelleğinde YOK' ($c.probeExit -eq 0 -and -not $c.bufferHasToken -and $c.logHasProbeOk) "çıkış=$($c.probeExit) · arabellekte=$($c.bufferHasToken)"
Check 'C-3' 'adres node stdout/stderr loguna düşmedi (gösterim olduğu halde)' ($s.logHasProbeOk -and -not $s.logHasToken -and -not $c.logHasToken) "log ok=$($s.logHasProbeOk) · logda token=$($s.logHasToken)/$($c.logHasToken)"
Check 'C-4' 'adres PowerShell transcript kaydına düşmedi' ($s.transcriptExists -and -not $s.transcriptHasToken -and -not $c.transcriptHasToken) "transcript var=$($s.transcriptExists) · token=$($s.transcriptHasToken)/$($c.transcriptHasToken)"
Check 'C-5' 'konsolsuz süreçte gösterim REDDEDİLDİ (çıkış 4) ve adres hiçbir yere yazılmadı' ($n.probeExit -eq 4 -and $n.logHasNoConsole -and -not $n.logHasToken -and -not $n.transcriptHasToken) "çıkış=$($n.probeExit) · logda token=$($n.logHasToken)"
$rows | Format-Table -AutoSize -Wrap | Out-String -Width 220 | Write-Host
$fail = @($rows | Where-Object { $_.sonuc -eq 'FAIL' }).Count
Write-Host ("EXTACC KONSOL ÖZ-TESTİ [PS {0}]: PASS {1} / {2}" -f $PSVersionTable.PSVersion, ($rows.Count - $fail), $rows.Count)
Write-Host "  çalışma dizini: $W (yalnız DOĞRU/YANLIŞ sonuçlar; sahte token dosyalara yazılmadı)"
if ($fail -gt 0) { exit 1 }
exit 0
