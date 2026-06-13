# Stop hook guvenlik agi — HUKUK_YAZILIMI is bitince yerel masaustu/terminal uyarisi.
# NOT: Telefon bildirimi AYRIDIR; onu Claude PushNotification ile gonderir
#      (Remote Control bagli + son tuslamadan 60 sn+ gectiyse telefona duser).
# Bu script bloklamaz: balon bildirimi detached calisir.
$ErrorActionPreference = 'SilentlyContinue'
$msg   = 'HUKUK_YAZILIMI task tamamlandi. Chat raporunu kontrol et.'
$title = '[BITTI]'

# 1) Terminal satiri + bell (her zaman calisir)
Write-Host "$title $msg"
try { [console]::beep(880, 200) } catch {}

# 2) Masaustu balon bildirimi — detached (Stop'u bloklamaz)
$child = "Add-Type -AssemblyName System.Windows.Forms; " +
         "`$n = New-Object System.Windows.Forms.NotifyIcon; " +
         "`$n.Icon = [System.Drawing.SystemIcons]::Information; " +
         "`$n.Visible = `$true; " +
         "`$n.ShowBalloonTip(5000, '$title', '$msg', [System.Windows.Forms.ToolTipIcon]::Info); " +
         "Start-Sleep -Seconds 6; `$n.Dispose()"
try {
  Start-Process powershell -WindowStyle Hidden -ArgumentList '-NoProfile','-Command',$child | Out-Null
} catch {}
exit 0
