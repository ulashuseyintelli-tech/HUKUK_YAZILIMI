# =============================================================================
# start-web.ps1 - HukukPlatform-Web launcher (CANDIDATE R03 / HY-OPS-DURABILITY)
# R03 delta: BindTimeoutSec 90->180 + bind-timeout'ta exact-owned child-tree cleanup (exit 20 fail-closed)
# Hedef motor : pwsh 7 (-NoProfile -NonInteractive -File)  [Bypass KULLANILMAZ]
# R02 delta   : ProcessStartInfo.ArgumentList launch engine + lock v2
#               (PID + creation-time + nonce; silme yalniz nonce sahibince).
# Kodlama     : saf ASCII. Dot-source edildiginde main KOSMAZ.
# F02-K1 delta: dinleyici tespiti LISTENER sinifi + port + adres ailesi + sahip pid; sorgu hatasi BELIRSIZ ('dinleyici yok' DEGIL);
#               belirsizlik tek basina cocugu sonlandirmaz (Wait-HLBindUncertain); kesin ardisik olcumle PORT_BIND_TIMEOUT aynen. Host ayni anda yeniden derlenir (derleme-zamani pin).
# Exit kodlari:
#   0  = child-exit-0 / ALREADY_RUNNING / LAUNCHER_BUSY
#   11 = NODE_BINARY_INVALID   12 = PORT_IDENTITY_CONFLICT
#   15 = CHILD_SPAWN_FAILED    16 = PORT_BIND_TIMEOUT    17 = WORKDIR_MISSING
#   20 = CHILD_CLEANUP_FAILED
#   26 = LISTENER_QUERY_UNCERTAIN (spawn oncesi dinleyici sorgusu belirsiz; cocuk baslatilmadi)
#   diger = child (node/next) exit kodu AYNEN aktarilir.
# =============================================================================

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Get-HLWebDefaultConfig {
    [OutputType([hashtable])]
    param()
    return @{
        Name           = 'web'
        NodeExe        = 'C:\Users\ulastelli\AppData\Local\Volta\tools\image\node\24.18.0\node.exe'
        NodeSha256     = '9A4EB5F1C29C6A2E93852EAD46B999E284A6A5CA8BAB4D4E241D587D025A52DE'
        ReleaseRoot    = 'C:\Development\HUKUK_YAZILIMI\HY_W4_RELEASE23'
        WorkDir        = 'C:\Development\HUKUK_YAZILIMI\HY_W4_RELEASE23\project\apps\web'
        EntryJs        = 'C:\Development\HUKUK_YAZILIMI\HY_W4_RELEASE23\project\apps\web\node_modules\next\dist\bin\next'
        EntryArgs      = @('start', '--port', '3002')
        Port           = 3002
        LegacyHints    = @('next\dist\bin\next', 'next/dist/bin/next')
        LogDir         = 'C:\Ops\hukuk\logs\web'
        LockPath       = 'C:\Ops\hukuk\logs\web\launch.lock'
        BindTimeoutSec = 180
        ListenFamilies = @('V4', 'V6')
        BindUncertainPollSec = 5
        BindUncertainDefiniteSamples = 36
        MaxChildLogs   = 8
        MaxTotalBytes  = 40MB
        MaxLauncherLog = 5MB
    }
}

# --- log + redaction -----------------------------------------------------------

function Hide-HLSecret {
    param([Parameter(Mandatory)][AllowEmptyString()][string]$Text)
    $t = [regex]::Replace($Text, 'postgres(ql)?://\S+', '[REDACTED-DB-URL]')
    $t = [regex]::Replace($t, '(?i)(password|passwd|pwd|secret|token)\s*[=:]\s*\S+', '$1=[REDACTED]')
    return $t
}

function Write-HLLog {
    param(
        [Parameter(Mandatory)][hashtable]$Cfg,
        [Parameter(Mandatory)][string]$Message
    )
    $line = ('{0} [{1}] {2}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss.fff'), $Cfg.Name, (Hide-HLSecret -Text $Message))
    $log = Join-Path $Cfg.LogDir 'launcher.log'
    try {
        if (-not (Test-Path -LiteralPath $Cfg.LogDir)) { New-Item -ItemType Directory -Force -Path $Cfg.LogDir | Out-Null }
        if ((Test-Path -LiteralPath $log) -and ((Get-Item -LiteralPath $log).Length -gt $Cfg.MaxLauncherLog)) {
            $old = "$log.1"
            if (Test-Path -LiteralPath $old) { Remove-Item -LiteralPath $old -Force }
            Move-Item -LiteralPath $log -Destination $old -Force
        }
        Add-Content -LiteralPath $log -Value $line -Encoding ascii
    } catch { }
    return $line
}

# --- binary fail-closed --------------------------------------------------------

function Test-HLFileSha256 {
    param([Parameter(Mandatory)][string]$Path, [Parameter(Mandatory)][string]$ExpectedSha256)
    if (-not (Test-Path -LiteralPath $Path)) { return $false }
    $h = (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash
    return ($h -ieq $ExpectedSha256)
}

function Test-HLNodeBinary {
    param([Parameter(Mandatory)][hashtable]$Cfg)
    return (Test-HLFileSha256 -Path $Cfg.NodeExe -ExpectedSha256 $Cfg.NodeSha256)
}

# --- port identity -------------------------------------------------------------

# F02-K1: dinleyici tespiti GetExtendedTcpTable + TCP_TABLE_OWNER_PID_LISTENER (sinif 3). Satirin durum alanina BAKILMAZ.
#   Neden (olculdu 31.10.2026, incelenen baglamlarda): durum alanina bakan sorgular (-State Listen, netstat, .NET, ham ALL) dinleyen cocugu kacirdi ve yanlis pozitif verdi;
#   bu sinif mevcut senaryolarda dogru calisti. Bu, sorgunun kok nedeni hakkinda bir hukum DEGILDIR. Sorgu hatasi 'dinleyici yok' SAYILMAZ: BELIRSIZ uretir.
function Initialize-HLListenerTable {
    if ($null -ne ('HukukLauncher.ListenerTable' -as [type])) { return }
    Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
namespace HukukLauncher {
  public static class ListenerTable {
    [DllImport("iphlpapi.dll")]
    static extern uint GetExtendedTcpTable(IntPtr table, ref int size, bool order, int af, int tableClass, uint reserved);
    const int TCP_TABLE_OWNER_PID_LISTENER = 3;
    const uint ERROR_INSUFFICIENT_BUFFER = 122;
    public static int[] Read(int af, int port) {
      if (af != 2 && af != 23) throw new ArgumentException("af");
      int rowSize = (af == 2) ? 24 : 56, portOfs = (af == 2) ? 8 : 20, pidOfs = (af == 2) ? 20 : 52;
      int size = 0;
      GetExtendedTcpTable(IntPtr.Zero, ref size, false, af, TCP_TABLE_OWNER_PID_LISTENER, 0);
      for (int attempt = 0; attempt < 5; attempt++) {
        int cap = size + 4096;
        IntPtr buf = Marshal.AllocHGlobal(cap);
        try {
          int got = cap;
          uint rc = GetExtendedTcpTable(buf, ref got, false, af, TCP_TABLE_OWNER_PID_LISTENER, 0);
          if (rc == ERROR_INSUFFICIENT_BUFFER) { size = got; continue; }
          if (rc != 0) throw new InvalidOperationException("GetExtendedTcpTable rc=" + rc);
          int n = Marshal.ReadInt32(buf);
          if (n < 0 || 4L + (long)n * rowSize > got) throw new InvalidOperationException("tablo boyutu tutarsiz n=" + n);
          List<int> pids = new List<int>();
          for (int i = 0; i < n; i++) {
            IntPtr row = IntPtr.Add(buf, 4 + i * rowSize);
            int w = Marshal.ReadInt32(row, portOfs);
            if ((((w & 0xff) << 8) | ((w >> 8) & 0xff)) == port) pids.Add(Marshal.ReadInt32(row, pidOfs));
          }
          return pids.ToArray();
        } finally { Marshal.FreeHGlobal(buf); }
      }
      throw new InvalidOperationException("tablo okunamadi (buyume)");
    }
  }
}
'@
}

function Read-HLListenerFamily {
    # Tek adres ailesi (2 = IPv4, 23 = IPv6): o portu dinleyen sahip pid'ler. Sorgu hatasi FIRLATIR.
    param([Parameter(Mandatory)][int]$AddressFamily, [Parameter(Mandatory)][int]$Port)
    Initialize-HLListenerTable
    return [HukukLauncher.ListenerTable]::Read($AddressFamily, $Port)
}

function Get-HLListenerProbe {
    # Sonuc: @{ Ok; V4; V6; Note }. FIRLATMAZ. Ok=$false = BELIRSIZ ('dinleyici yok' DEGIL).
    param([Parameter(Mandatory)][int]$Port)
    try {
        $v4 = @(Read-HLListenerFamily -AddressFamily 2 -Port $Port)
        $v6 = @(Read-HLListenerFamily -AddressFamily 23 -Port $Port)
        return @{ Ok = $true; V4 = $v4; V6 = $v6; Note = '' }
    } catch {
        return @{ Ok = $false; V4 = @(); V6 = @(); Note = ('{0}: {1}' -f $_.Exception.GetType().Name, $_.Exception.Message) }
    }
}

function Get-HLBindState {
    # Sonuc State: EXACT (cocuk beklenen her ailede tek sahip) | KISMI (cocuk bir ailede, digeri bos) | YOK (kesin, satir yok) | YABANCI (baska pid ayni portta; KABUL EDILMEZ) | BELIRSIZ (sorgu hatasi)
    param([Parameter(Mandatory)][hashtable]$Probe, [Parameter(Mandatory)][int]$ChildPid, [Parameter(Mandatory)][string[]]$Families)
    if (-not $Probe.Ok) { return @{ State = 'BELIRSIZ'; Detail = [string]$Probe.Note } }
    $all = @(@($Probe.V4) + @($Probe.V6))
    $foreign = @($all | Where-Object { $_ -ne $ChildPid } | Sort-Object -Unique)
    if ($foreign.Count -gt 0) { return @{ State = 'YABANCI'; Detail = ('pid=' + ($foreign -join ',')) } }
    if ($all.Count -eq 0) { return @{ State = 'YOK'; Detail = '' } }
    foreach ($fam in $Families) { if (@($Probe[$fam]).Count -eq 0) { return @{ State = 'KISMI'; Detail = ('eksik aile=' + $fam) } } }
    return @{ State = 'EXACT'; Detail = '' }
}

function Get-HLPreSpawnListeners {
    # Spawn oncesi port sahipleri. Sonuc: @{ Ok; Pids; Note }. Belirsiz sorgu 3 x 2 sn yeniden denenir; sonra Ok=$false (cagiran COCUK BASLATMAZ, exit 26; gorev PT15M yeniden dener).
    param([Parameter(Mandatory)][hashtable]$Cfg)
    $note = ''
    for ($i = 1; $i -le 3; $i++) {
        $q = Get-HLListenerProbe -Port $Cfg.Port
        if ($q.Ok) { return @{ Ok = $true; Pids = @(@(@($q.V4) + @($q.V6)) | Sort-Object -Unique); Note = '' } }
        $note = [string]$q.Note
        if ($i -lt 3) { Start-Sleep -Seconds 2 }
    }
    return @{ Ok = $false; Pids = @(); Note = $note }
}

function Wait-HLBindUncertain {
    # Bind penceresi kesin olmayan olcumle bitti. Cocuk SONLANDIRILMAZ; sahiplik (Process nesnesi, kilit, host-watchdog, host Job Object) surer; STARTED YAZILMAZ.
    # Sonuc: BOUND | NOT_BOUND | EXITED | HOST_GONE. NOT_BOUND yalniz ard arda N kesin olcumle (YOK / YABANCI); BELIRSIZ ve KISMI sayaci sifirlar.
    param([Parameter(Mandatory)][hashtable]$Cfg, [Parameter(Mandatory)]$Proc, [Parameter(Mandatory)][string[]]$Families, [Parameter(Mandatory)][AllowEmptyString()][string]$Reason)
    $pollSec = $(if ($Cfg.ContainsKey('BindUncertainPollSec')) { [int]$Cfg['BindUncertainPollSec'] } else { 5 })
    $need = $(if ($Cfg.ContainsKey('BindUncertainDefiniteSamples')) { [int]$Cfg['BindUncertainDefiniteSamples'] } else { 36 })
    Write-HLLog -Cfg $Cfg -Message ("BIND_UNCERTAIN after {0}s (child pid={1}) last={2} - child kept, no kill on uncertainty, start not confirmed" -f $Cfg.BindTimeoutSec, $Proc.Id, $Reason) | Out-Null
    $definite = 0; $sw = [System.Diagnostics.Stopwatch]::StartNew(); $nextLog = 300
    while (-not $Proc.HasExited) {
        if ($script:HLHostPid -ne 0) {
            $hp = Get-Process -Id $script:HLHostPid -ErrorAction SilentlyContinue
            if ($null -eq $hp -or $hp.StartTime -ne $script:HLHostCtime) {
                Write-HLLog -Cfg $Cfg -Message 'host exited - killing exact-owned child tree (orphan-prevention)' | Out-Null
                try { $Proc.Kill($true) } catch { }
                [void]$Proc.WaitForExit(10000)
                return 'HOST_GONE'
            }
        }
        $bs = Get-HLBindState -Probe (Get-HLListenerProbe -Port $Cfg.Port) -ChildPid $Proc.Id -Families $Families
        if ($bs.State -eq 'EXACT') { Write-HLLog -Cfg $Cfg -Message ("BIND_UNCERTAIN resolved after {0}s more: EXACT (child pid={1})" -f [int]$sw.Elapsed.TotalSeconds, $Proc.Id) | Out-Null; return 'BOUND' }
        if ($bs.State -in @('YOK', 'YABANCI')) {
            $definite++
            if ($definite -ge $need) { Write-HLLog -Cfg $Cfg -Message ("BIND_UNCERTAIN resolved: NOT_BOUND state={0} {1} samples={2} (child pid={3})" -f $bs.State, $bs.Detail, $definite, $Proc.Id) | Out-Null; return 'NOT_BOUND' }
        } else { $definite = 0 }
        if ($sw.Elapsed.TotalSeconds -ge $nextLog) { Write-HLLog -Cfg $Cfg -Message ("BIND_UNCERTAIN continues {0}s state={1} (child pid={2})" -f [int]$sw.Elapsed.TotalSeconds, $bs.State, $Proc.Id) | Out-Null; $nextLog += 300 }
        [void]$Proc.WaitForExit($pollSec * 1000)
    }
    return 'EXITED'
}

function Get-HLCmdlinePathsNormalized {
    param([Parameter(Mandatory)][AllowEmptyString()][string]$CommandLine)
    $out = @()
    $rest = $CommandLine
    foreach ($m in [regex]::Matches($CommandLine, '"([^"]+)"')) {
        $raw = $m.Groups[1].Value
        try { $out += [System.IO.Path]::GetFullPath($raw) } catch { $out += $raw }
    }
    $rest = [regex]::Replace($rest, '"[^"]*"', ' ')
    foreach ($tok in ($rest -split '\s+')) {
        if ($tok -match '^[A-Za-z]:[\\/]') {
            try { $out += [System.IO.Path]::GetFullPath($tok) } catch { $out += $tok }
        }
    }
    return $out
}

function Test-HLInstanceIdentity {
    param(
        [Parameter(Mandatory)][int]$OwnerPid,
        [Parameter(Mandatory)][hashtable]$Cfg
    )
    try {
        $p = Get-CimInstance Win32_Process -Filter ("ProcessId={0}" -f $OwnerPid) -ErrorAction Stop
        if ($null -eq $p) { return 'UNKNOWN' }
        $exe = [string]$p.ExecutablePath
        $cl  = [string]$p.CommandLine
        if (-not ($exe -ieq $Cfg.NodeExe)) { return 'FOREIGN' }
        foreach ($qp in (Get-HLCmdlinePathsNormalized -CommandLine $cl)) {
            if ($qp -ieq $Cfg.EntryJs) { return 'EXACT' }
        }
        $hintHit = $false
        foreach ($h in $Cfg.LegacyHints) { if ($cl -and $cl.ToLowerInvariant().Contains($h.ToLowerInvariant())) { $hintHit = $true; break } }
        if ($hintHit) {
            try {
                $mods = (Get-Process -Id $OwnerPid -ErrorAction Stop).Modules
                foreach ($m in $mods) {
                    if ($m.FileName -and $m.FileName.ToLowerInvariant().StartsWith($Cfg.ReleaseRoot.ToLowerInvariant())) { return 'LEGACY' }
                }
            } catch { return 'UNKNOWN' }
        }
        return 'FOREIGN'
    } catch { return 'UNKNOWN' }
}

# --- lock v2 -------------------------------------------------------------------

function Get-HLSelfLockRecord {
    param([Parameter(Mandatory)][hashtable]$Cfg, [Parameter(Mandatory)][string]$Nonce)
    $self = Get-Process -Id $PID
    $exe = $null
    try { $exe = [System.Environment]::ProcessPath } catch { }
    if (-not $exe) { try { $exe = $self.Path } catch { $exe = 'unknown' } }
    return [ordered]@{
        name     = [string]$Cfg.Name
        pid      = [int]$PID
        ctimeUtc = $self.StartTime.ToUniversalTime().ToString('o')
        nonce    = $Nonce
        exe      = [string]$exe
        entry    = [string]$Cfg.EntryJs
    }
}

function Read-HLLockRecord {
    param([Parameter(Mandatory)][string]$LockPath)
    try {
        $raw = Get-Content -LiteralPath $LockPath -Raw -ErrorAction Stop
        $o = $raw | ConvertFrom-Json -ErrorAction Stop
        return @{ Parsed = $true; Rec = $o }
    } catch { return @{ Parsed = $false; Rec = $null } }
}

function Test-HLLockAlive {
    param($Rec)
    if ($null -eq $Rec) { return $false }
    $lp = Get-Process -Id ([int]$Rec.pid) -ErrorAction SilentlyContinue
    if ($null -eq $lp) { return $false }
    if ($lp.Name -notmatch '^(pwsh|powershell)$') { return $false }
    try {
        $liveCt = $lp.StartTime.ToUniversalTime()
        $recCt = ([datetime]::Parse([string]$Rec.ctimeUtc, [Globalization.CultureInfo]::InvariantCulture,
                  [Globalization.DateTimeStyles]::AdjustToUniversal))
        if ([math]::Abs(($liveCt - $recCt).TotalSeconds) -gt 2) { return $false }
    } catch { return $false }
    return $true
}

function Invoke-HLLockGuard {
    param([Parameter(Mandatory)][hashtable]$Cfg)
    $dir = Split-Path -Parent $Cfg.LockPath
    if (-not (Test-Path -LiteralPath $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
    $nonce = [guid]::NewGuid().ToString('N')
    for ($attempt = 1; $attempt -le 2; $attempt++) {
        try {
            $fs = [System.IO.File]::Open($Cfg.LockPath, [System.IO.FileMode]::CreateNew,
                                         [System.IO.FileAccess]::Write, [System.IO.FileShare]::Read)
            $rec = Get-HLSelfLockRecord -Cfg $Cfg -Nonce $nonce
            $meta = [System.Text.Encoding]::ASCII.GetBytes((($rec | ConvertTo-Json -Compress)))
            $fs.Write($meta, 0, $meta.Length); $fs.Flush()
            return @{ State = 'ACQUIRED'; Stream = $fs; Nonce = $nonce; Note = ("attempt={0}" -f $attempt) }
        } catch [System.IO.IOException] {
            $read = Read-HLLockRecord -LockPath $Cfg.LockPath
            if (-not $read.Parsed) {
                $age = $null
                try { $age = (Get-Date) - (Get-Item -LiteralPath $Cfg.LockPath).LastWriteTime } catch { }
                if ($null -ne $age -and $age.TotalMinutes -gt 10) {
                    try { Remove-Item -LiteralPath $Cfg.LockPath -Force -ErrorAction Stop; continue } catch {
                        return @{ State = 'BUSY'; Stream = $null; Nonce = $nonce; Note = 'unparsable-remove-failed' } }
                }
                return @{ State = 'BUSY'; Stream = $null; Nonce = $nonce; Note = 'unparsable-fresh' }
            }
            if (Test-HLLockAlive -Rec $read.Rec) {
                return @{ State = 'BUSY'; Stream = $null; Nonce = $nonce; Note = ("holder-pid={0}" -f $read.Rec.pid) }
            }
            try { Remove-Item -LiteralPath $Cfg.LockPath -Force -ErrorAction Stop } catch {
                return @{ State = 'BUSY'; Stream = $null; Nonce = $nonce; Note = 'stale-remove-failed' }
            }
        }
    }
    return @{ State = 'BUSY'; Stream = $null; Nonce = $nonce; Note = 'retry-exhausted' }
}

function Close-HLLock {
    param([Parameter(Mandatory)][hashtable]$Cfg, $Stream, [Parameter(Mandatory)][string]$OwnerNonce)
    try { if ($null -ne $Stream) { $Stream.Close() } } catch { }
    try {
        if (Test-Path -LiteralPath $Cfg.LockPath) {
            $read = Read-HLLockRecord -LockPath $Cfg.LockPath
            if ($read.Parsed -and ([string]$read.Rec.nonce) -ceq $OwnerNonce) {
                Remove-Item -LiteralPath $Cfg.LockPath -Force
            }
        }
    } catch { }
}

# --- ProcessStartInfo launch engine -------------------------------------------

function New-HLChildProcess {
    param(
        [Parameter(Mandatory)][string]$Exe,
        [Parameter(Mandatory)][string[]]$Args,
        [Parameter(Mandatory)][string]$WorkDir,
        [Parameter(Mandatory)][ValidateSet('file','capture')][string]$Mode,
        [string]$OutFile,
        [string]$ErrFile,
        [int]$TimeoutMs = 30000
    )
    $psi = [System.Diagnostics.ProcessStartInfo]::new()
    $psi.FileName = $Exe
    $psi.UseShellExecute = $false
    $psi.WorkingDirectory = $WorkDir
    $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError = $true
    $psi.CreateNoWindow = $true
    foreach ($a in $Args) { $psi.ArgumentList.Add([string]$a) }
    $proc = [System.Diagnostics.Process]::new()
    $proc.StartInfo = $psi
    if (-not $proc.Start()) { throw 'process start returned false' }
    if ($Mode -eq 'capture') {
        $so = $proc.StandardOutput.ReadToEndAsync()
        $se = $proc.StandardError.ReadToEndAsync()
        if (-not $proc.WaitForExit($TimeoutMs)) {
            try { $proc.Kill($true) } catch { }
            $proc.WaitForExit()
        }
        [void][System.Threading.Tasks.Task]::WaitAll(@($so, $se))
        return @{ ExitCode = [int]$proc.ExitCode; StdOut = $so.Result; StdErr = $se.Result }
    }
    $outFs = [System.IO.File]::Open($OutFile, 'Create', 'Write', 'Read')
    $errFs = [System.IO.File]::Open($ErrFile, 'Create', 'Write', 'Read')
    $tOut = $proc.StandardOutput.BaseStream.CopyToAsync($outFs)
    $tErr = $proc.StandardError.BaseStream.CopyToAsync($errFs)
    return @{ Proc = $proc; OutTask = $tOut; ErrTask = $tErr; OutFs = $outFs; ErrFs = $errFs }
}

function Close-HLChildStreams {
    param($Child)
    try { [void][System.Threading.Tasks.Task]::WaitAll(@($Child.OutTask, $Child.ErrTask), 5000) } catch { }
    try { $Child.OutFs.Dispose() } catch { }
    try { $Child.ErrFs.Dispose() } catch { }
}

# --- bounded child-log rotation ------------------------------------------------

function Invoke-HLLogRotation {
    param([Parameter(Mandatory)][hashtable]$Cfg)
    if (-not (Test-Path -LiteralPath $Cfg.LogDir)) { return }
    $files = @(Get-ChildItem -LiteralPath $Cfg.LogDir -File -ErrorAction SilentlyContinue |
               Where-Object { $_.Name -match ('^{0}-(out|err)\.' -f [regex]::Escape($Cfg.Name)) } |
               Sort-Object CreationTimeUtc -Descending)
    $keep = @(); $total = 0
    foreach ($f in $files) {
        $total += $f.Length
        if (($keep.Count -lt (2 * $Cfg.MaxChildLogs)) -and ($total -le $Cfg.MaxTotalBytes)) { $keep += $f.FullName }
        else { try { Remove-Item -LiteralPath $f.FullName -Force } catch { } }
    }
}

# --- child launch + exit-code propagation -------------------------------------

function Start-HLChildAndWait {
    param([Parameter(Mandatory)][hashtable]$Cfg, [Parameter(Mandatory)][hashtable]$Lock)
    $ts = Get-Date -Format 'yyyyMMdd-HHmmss'
    $outLog = Join-Path $Cfg.LogDir ('{0}-out.{1}.log' -f $Cfg.Name, $ts)
    $errLog = Join-Path $Cfg.LogDir ('{0}-err.{1}.log' -f $Cfg.Name, $ts)
    try {
        $child = New-HLChildProcess -Exe $Cfg.NodeExe -Args (@($Cfg.EntryJs) + $Cfg.EntryArgs) `
                                    -WorkDir $Cfg.WorkDir -Mode file -OutFile $outLog -ErrFile $errLog
    } catch {
        Write-HLLog -Cfg $Cfg -Message ("CHILD_SPAWN_FAILED: {0}" -f $_.Exception.Message) | Out-Null
        return @{ Code = 15; ChildPid = $null; Phase = 'spawn' }
    }
    $proc = $child.Proc
    Write-HLLog -Cfg $Cfg -Message ("child spawned pid={0} entry={1} out={2}" -f $proc.Id, $Cfg.EntryJs, (Split-Path -Leaf $outLog)) | Out-Null
    # ORPHAN-PREVENTION GARANTISI (poll-watchdog): hukuk-task-host HL_HOST_PID gecirir.
    # NOT: Register-ObjectEvent -Action BURADA KULLANILMAZ - launcher WaitForExit ile
    # blokluyken PS event action'lari HIC islenmez (olculdu). Ana-thread poll kullanilir;
    # host kimligi PID+StartTime ile baglanir (PID-reuse'a dayanikli).
    $script:HLHostPid = 0; $script:HLHostCtime = $null
    if ($env:HL_HOST_PID) {
        try {
            $hp0 = Get-Process -Id ([int]$env:HL_HOST_PID) -ErrorAction Stop
            $script:HLHostPid = [int]$env:HL_HOST_PID
            $script:HLHostCtime = $hp0.StartTime
            Write-HLLog -Cfg $Cfg -Message ("parent-watchdog armed (host pid={0}, poll)" -f $script:HLHostPid) | Out-Null
        } catch {
            Write-HLLog -Cfg $Cfg -Message 'parent-watchdog UNAVAILABLE (host already gone) - child killed, fail-closed' | Out-Null
            try { $proc.Kill($true) } catch { }
            Close-HLChildStreams -Child $child
            Close-HLLock -Cfg $Cfg -Stream $Lock.Stream -OwnerNonce $Lock.Nonce
            return @{ Code = 20; ChildPid = $proc.Id; Phase = 'watchdog-setup-failed' }
        }
    }

    $deadline = (Get-Date).AddSeconds($Cfg.BindTimeoutSec)
    $bound = $false
    $families = $(if ($Cfg.ContainsKey('ListenFamilies')) { [string[]]@($Cfg['ListenFamilies']) } else { [string[]]@('V4', 'V6') })
    $lastBind = ''; $definite = 0
    while ((Get-Date) -lt $deadline) {
        if ($proc.HasExited) {
            Close-HLChildStreams -Child $child
            $c = [int]$proc.ExitCode
            Write-HLLog -Cfg $Cfg -Message ("child exited early code={0} (propagate)" -f $c) | Out-Null
            Close-HLLock -Cfg $Cfg -Stream $Lock.Stream -OwnerNonce $Lock.Nonce
            return @{ Code = $c; ChildPid = $proc.Id; Phase = 'early-exit' }
        }
        $bs = Get-HLBindState -Probe (Get-HLListenerProbe -Port $Cfg.Port) -ChildPid $proc.Id -Families $families
        if ($bs.State -eq 'EXACT') { $bound = $true; break }
        if ($bs.State -in @('YOK', 'YABANCI')) { $definite++ } else { $definite = 0 }
        if ($bs.State -ne $lastBind) { Write-HLLog -Cfg $Cfg -Message ("bind state {0} {1} (child pid={2})" -f $bs.State, $bs.Detail, $proc.Id) | Out-Null; $lastBind = $bs.State }
        Start-Sleep -Milliseconds 900
    }
    if (-not $bound -and $definite -lt 3) {
        # F02-K1: pencere kesin olmayan olcumle bitti: belirsizlik TEK BASINA cocugu sonlandirmaz.
        $w = Wait-HLBindUncertain -Cfg $Cfg -Proc $proc -Families $families -Reason $lastBind
        if ($w -eq 'BOUND') { $bound = $true }
        elseif ($w -ne 'NOT_BOUND') {
            Close-HLChildStreams -Child $child
            Close-HLLock -Cfg $Cfg -Stream $Lock.Stream -OwnerNonce $Lock.Nonce
            if (-not $proc.HasExited) {
                Write-HLLog -Cfg $Cfg -Message 'CHILD_CLEANUP_FAILED (fail-closed exit 20)' | Out-Null
                return @{ Code = 20; ChildPid = $proc.Id; Phase = 'cleanup-failed' }
            }
            $c = [int]$proc.ExitCode
            Write-HLLog -Cfg $Cfg -Message ("child exit code={0} after bind uncertainty ({1}) (propagate)" -f $c, $w) | Out-Null
            return @{ Code = $c; ChildPid = $proc.Id; Phase = ('uncertain-' + $w) }
        }
    }
    if (-not $bound) {
        Write-HLLog -Cfg $Cfg -Message ("PORT_BIND_TIMEOUT after {0}s (child pid={1}) - exact-owned cleanup" -f $Cfg.BindTimeoutSec, $proc.Id) | Out-Null
        if (-not $proc.HasExited) {
            try { [void]$proc.CloseMainWindow() } catch { }
            if (-not $proc.WaitForExit(3000)) {
                try { $proc.Kill($true) } catch { }
                [void]$proc.WaitForExit(10000)
            }
        }
        Close-HLChildStreams -Child $child
        Close-HLLock -Cfg $Cfg -Stream $Lock.Stream -OwnerNonce $Lock.Nonce
        if (-not $proc.HasExited) {
            Write-HLLog -Cfg $Cfg -Message 'CHILD_CLEANUP_FAILED (fail-closed exit 20)' | Out-Null
            return @{ Code = 20; ChildPid = $proc.Id; Phase = 'cleanup-failed' }
        }
        Write-HLLog -Cfg $Cfg -Message ("child tree terminated (pid={0}); residual 0; exit 16" -f $proc.Id) | Out-Null
        return @{ Code = 16; ChildPid = $proc.Id; Phase = 'bind-timeout-cleaned' }
    }
    Write-HLLog -Cfg $Cfg -Message ("STARTED port={0} pid={1}" -f $Cfg.Port, $proc.Id) | Out-Null
    Close-HLLock -Cfg $Cfg -Stream $Lock.Stream -OwnerNonce $Lock.Nonce
    # bekleme = poll: child cikisi VEYA host olumu (orphan-prevention)
    while (-not $proc.HasExited) {
        if ($script:HLHostPid -ne 0) {
            $hp = Get-Process -Id $script:HLHostPid -ErrorAction SilentlyContinue
            if ($null -eq $hp -or $hp.StartTime -ne $script:HLHostCtime) {
                Write-HLLog -Cfg $Cfg -Message 'host exited - killing exact-owned child tree (orphan-prevention)' | Out-Null
                try { $proc.Kill($true) } catch { }
                [void]$proc.WaitForExit(10000)
                break
            }
        }
        [void]$proc.WaitForExit(2000)
    }
    Close-HLChildStreams -Child $child
    $code = [int]$proc.ExitCode
    Write-HLLog -Cfg $Cfg -Message ("child exit code={0} (propagate)" -f $code) | Out-Null
    return @{ Code = $code; ChildPid = $proc.Id; Phase = 'exited' }
}

# --- ana akis ------------------------------------------------------------------

function Invoke-HLWebMain {
    param([Parameter(Mandatory)][hashtable]$Cfg)
    Write-HLLog -Cfg $Cfg -Message 'launcher begin (R02 F02-K1)' | Out-Null

    if (-not (Test-HLNodeBinary -Cfg $Cfg)) {
        Write-HLLog -Cfg $Cfg -Message 'NODE_BINARY_INVALID exit 11' | Out-Null
        return 11
    }
    if (-not (Test-Path -LiteralPath $Cfg.WorkDir)) {
        Write-HLLog -Cfg $Cfg -Message 'WORKDIR_MISSING exit 17' | Out-Null
        return 17
    }
    if (-not (Test-Path -LiteralPath $Cfg.EntryJs)) {
        Write-HLLog -Cfg $Cfg -Message 'NODE_BINARY_INVALID (next entry missing) exit 11' | Out-Null
        return 11
    }

    $pre = Get-HLPreSpawnListeners -Cfg $Cfg
    if (-not $pre.Ok) {
        Write-HLLog -Cfg $Cfg -Message ("LISTENER_QUERY_UNCERTAIN(pre-spawn): {0} - child NOT spawned, exit 26" -f $pre.Note) | Out-Null
        return 26
    }
    foreach ($lp in $pre.Pids) {
        $id = Test-HLInstanceIdentity -OwnerPid $lp -Cfg $Cfg
        if ($id -in @('EXACT', 'LEGACY')) {
            Write-HLLog -Cfg $Cfg -Message ("ALREADY_RUNNING identity={0} pid={1} exit 0" -f $id, $lp) | Out-Null
            return 0
        }
        Write-HLLog -Cfg $Cfg -Message ("PORT_IDENTITY_CONFLICT identity={0} pid={1} exit 12" -f $id, $lp) | Out-Null
        return 12
    }

    $lock = Invoke-HLLockGuard -Cfg $Cfg
    if ($lock.State -ne 'ACQUIRED') {
        Write-HLLog -Cfg $Cfg -Message ("LAUNCHER_BUSY ({0}) exit 0" -f $lock.Note) | Out-Null
        return 0
    }
    try {
        $pre = Get-HLPreSpawnListeners -Cfg $Cfg
        if (-not $pre.Ok) {
            Write-HLLog -Cfg $Cfg -Message ("LISTENER_QUERY_UNCERTAIN(post-lock): {0} - child NOT spawned, exit 26" -f $pre.Note) | Out-Null
            Close-HLLock -Cfg $Cfg -Stream $lock.Stream -OwnerNonce $lock.Nonce; $lock.Stream = $null
            return 26
        }
        foreach ($lp in $pre.Pids) {
            $id = Test-HLInstanceIdentity -OwnerPid $lp -Cfg $Cfg
            if ($id -in @('EXACT', 'LEGACY')) {
                Write-HLLog -Cfg $Cfg -Message ("ALREADY_RUNNING(post-lock) identity={0} pid={1} exit 0" -f $id, $lp) | Out-Null
                Close-HLLock -Cfg $Cfg -Stream $lock.Stream -OwnerNonce $lock.Nonce; $lock.Stream = $null
                return 0
            }
            Write-HLLog -Cfg $Cfg -Message ("PORT_IDENTITY_CONFLICT(post-lock) identity={0} pid={1} exit 12" -f $id, $lp) | Out-Null
            Close-HLLock -Cfg $Cfg -Stream $lock.Stream -OwnerNonce $lock.Nonce; $lock.Stream = $null
            return 12
        }

        Invoke-HLLogRotation -Cfg $Cfg

        $res = Start-HLChildAndWait -Cfg $Cfg -Lock $lock
        $lock.Stream = $null
        return [int]$res.Code
    } finally {
        if ($null -ne $lock.Stream) { Close-HLLock -Cfg $Cfg -Stream $lock.Stream -OwnerNonce $lock.Nonce }
    }
}

# --- entry ---------------------------------------------------------------------
if ($MyInvocation.InvocationName -eq '.') { return }

$hlExit = Invoke-HLWebMain -Cfg (Get-HLWebDefaultConfig)
exit [int]$hlExit
