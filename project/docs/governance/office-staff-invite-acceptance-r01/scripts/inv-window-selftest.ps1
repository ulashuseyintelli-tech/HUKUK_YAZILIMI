$ErrorActionPreference = 'Stop'
# =============================================================================
# PENCERE BETIGI — KOK NEDEN TESTLERI (CANLIYA DOKUNMAZ, YAZMA YOK)
#
# 2026-09-23 kusurlari ve burada olculen karsiliklari:
#   K1  `Restart-ScheduledTask` bu sistemde YOK -> yeniden baslatma yardimcisi desteklenen
#       komutlari (Stop/Start-ScheduledTask) kullanmali; komut varligi olculur.
#   K2  durum dosyasi ILK CANLI DEGISIKLIKTEN SONRA yaziliyordu -> yarim pencere kurtarilamiyordu.
#       Artik yedek alinir alinmaz yazilir ve her asamada guncellenir; asama sirasi olculur.
#   K3  yakalayici kimlik deseni TERS BOLU idi, gercek komut satiri ILERI BOLU -> surec kapatilamadi.
#       Desen artik ayirici-BAGIMSIZ; her iki bicim ve yabanci surec ornekleri olculur.
#
# KULLANIM: powershell -NoProfile -ExecutionPolicy Bypass -File inv-window-selftest.ps1
# CIKIS: 0 hepsi PASS · 1 en az bir FAIL
# =============================================================================
$here = $PSScriptRoot
$win  = Join-Path $here 'inv-live-window.ps1'
if (-not (Test-Path -LiteralPath $win)) { throw 'inv-live-window.ps1 bulunamadi' }
$src = Get-Content -Raw -LiteralPath $win

$rows = @()
function Check([string]$id, [string]$desc, [bool]$ok, [string]$gozlem) {
  $script:rows += [pscustomobject]@{ id = $id; sonuc = $(if ($ok) { 'PASS' } else { 'FAIL' }); aciklama = $desc; gozlem = $gozlem }
}

# --- K1: desteklenmeyen komut kullanilmiyor; yardimci desteklenen komutlari kullaniyor ---
$callsRestart = [regex]::Matches($src, '(?m)^\s*Restart-ScheduledTask\b').Count
$hasHelper = $src -match 'function Restart-TaskAndWait'
$helperUsesSupported = ($src -match 'Stop-ScheduledTask -TaskName \$task') -and ($src -match 'Start-ScheduledTask -TaskName \$task')
Check 'K1-a' 'betikte dogrudan Restart-ScheduledTask CAGRISI yok' ($callsRestart -eq 0) ("cagri sayisi=" + $callsRestart)
Check 'K1-b' 'yeniden baslatma yardimcisi desteklenen komutlari kullanir' ($hasHelper -and $helperUsesSupported) ("yardimci=" + $hasHelper)
$supported = [bool](Get-Command Stop-ScheduledTask -ErrorAction SilentlyContinue) -and [bool](Get-Command Start-ScheduledTask -ErrorAction SilentlyContinue)
$unsupported = [bool](Get-Command Restart-ScheduledTask -ErrorAction SilentlyContinue)
Check 'K1-c' 'bu sistemde Stop/Start VAR, Restart YOK (kusurun kaynagi)' ($supported -and -not $unsupported) ("stop/start=" + $supported + " restart=" + $unsupported)

# --- K2: durum dosyasi ilk canli degisiklikten ONCE ve her asamada yazilir ---
$hasSave = $src -match 'function Save-WindowState'
$iBackup = $src.IndexOf("Save-WindowState `$state `$RunStateFile 'yedek-alindi'")
$iWebStop = $src.IndexOf('Disable-ScheduledTask -TaskName $WebTask')
$iRules  = $src.IndexOf('New-NetFirewallRule -DisplayName ("$RuleTag-$p")')
$iEnvWrite = $src.IndexOf('[IO.File]::WriteAllLines($EnvFile, $lines)')
$stages = @('yedek-alindi', 'web-durduruldu', 'engeller-kondu', 'env-degistirildi', 'acik')
$allStages = @($stages | Where-Object { $src -match ("Save-WindowState \`$state \`$RunStateFile '" + $_ + "'") }).Count
Check 'K2-a' 'durum kaydi yardimcisi var' $hasSave ("Save-WindowState=" + $hasSave)
Check 'K2-b' 'ilk kalici kayit, ILK canli degisiklikten (Web durdurma) ONCE' (($iBackup -gt 0) -and ($iBackup -lt $iWebStop)) ("yedek@" + $iBackup + " < webDurdur@" + $iWebStop)
Check 'K2-c' 'kayit engeller ve .env degisikliginden de ONCE baslar' (($iBackup -lt $iRules) -and ($iBackup -lt $iEnvWrite)) ("kurallar@" + $iRules + " envYazma@" + $iEnvWrite)
Check 'K2-d' 'bes asamanin hepsi kalicilastirilir' ($allStages -eq $stages.Count) ("asama=" + $allStages + "/" + $stages.Count)

# --- K3: yakalayici kimlik deseni ayirici-bagimsiz; yabanci surece dokunulmaz ---
$m = [regex]::Match($src, "\`$sinkPattern = '([^']+)'")
$pattern = $(if ($m.Success) { $m.Groups[1].Value } else { $null })
$fwd = 'D:/Development/HUKUK_YAZILIMI/project/project/docs/governance/office-staff-invite-acceptance-r01/scripts/inv-sink.js'
$bck = 'D:\Development\HUKUK_YAZILIMI\project\project\docs\governance\office-staff-invite-acceptance-r01\scripts\inv-sink.js'
$other = 'C:\Program Files\nodejs\node.exe C:\baska\proje\server.js'
Check 'K3-a' 'kimlik deseni tanimli' ([bool]$pattern) ("desen=" + $(if ($pattern) { 'VAR' } else { 'YOK' }))
if ($pattern) {
  Check 'K3-b' 'ILERI BOLU komut satiri eslesir (2026-09-23 kusuru)' ([bool]($fwd -match $pattern)) ('ileri bolu=' + [bool]($fwd -match $pattern))
  Check 'K3-c' 'TERS BOLU komut satiri da eslesir' ([bool]($bck -match $pattern)) ('ters bolu=' + [bool]($bck -match $pattern))
  Check 'K3-d' 'yabanci surec komut satiri ESLESMEZ' (-not ($other -match $pattern)) ('yabanci=' + [bool]($other -match $pattern))
}
$guardsForeign = ($src -match '\$sinkForeign') -and ($src -match 'sinkStopped = \(\(\(ListenerCount \$SinkPort\) -eq 0\) -and \(\$sinkForeign\.Count -eq 0\)\)')
Check 'K3-e' 'bizim olmayan surec varsa yakalayici KAPANDI sayilmaz' $guardsForeign ('kapi=' + $guardsForeign)

$rows | Format-Table -AutoSize | Out-String | Write-Host
$fail = @($rows | Where-Object { $_.sonuc -eq 'FAIL' }).Count
Write-Host ('PENCERE KOK NEDEN TESTLERI: PASS ' + ($rows.Count - $fail) + ' / ' + $rows.Count)
if ($fail -gt 0) { exit 1 }
exit 0
