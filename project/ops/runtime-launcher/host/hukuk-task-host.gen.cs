// ============================================================================
// hukuk-task-host.r05.template.cs - HY-OPS-DURABILITY R05 sealed-host TEMPLATE
// SOY: R03.2 kaynagi (SHA-256 119E09E2248E089CC12C307AF05A510AAAA4E4EC47CA22C144888C2A0450C5BE)
// KURAL: kod R03.2 ile AYNIDIR; delta yalniz (a) compile-time sabit -> placeholder,
// (b) deferred logging, (c) C34 ?6 gate sirasi, (d) --verify-seal modu.
// Uretim: build-r05-host.ps1 pinset'ten placeholder'lari doldurur -> csc.
// EK EXIT: 112 PROFILE_IDENTITY_MISSING (gate 3).
// --verify-seal cagri sozlesmesi: binary GUI-subsystem (peSub=2) oldugundan
//   stdout yalniz ACIK yonlendirmeyle okunur:
//   Start-Process -Wait -RedirectStandardOutput <WorkspaceRoot dosyasi>.
//   Host kendisi HICBIR dosya/dizin olusturmaz.
// Derleme (TEK BINARY - #if QUAL YOK): Framework csc 4.8 /target:winexe
//   csc /nologo /target:winexe /platform:x64 /optimize+ /out:hukuk-task-host.exe hukuk-task-host.cs
// R03.1 delta (ATOMIC_JOB_BINDING):
//   - TEK BINARY: prod ve qual ayni exe. Varyasyon YALNIZ compile-time mod
//     tablosudur (script/pwsh/workdir/logdir/expectedSelf/fault - hepsi sabit).
//     Boylece core host/job/process/wait/cleanup/exit metotlari tanim geregi
//     prod==qual (ayni derleme). Qual modlari qual-self-yoluna bagli; production
//     kurulumundan cagrilirsa self-identity ile 102 doner.
//   - ATOMIK JOB: Job once kurulur -> CreateProcessW(CREATE_SUSPENDED|
//     CREATE_NO_WINDOW|CREATE_UNICODE_ENVIRONMENT) -> AssignProcessToJobObject ->
//     IsProcessInJob DOGRULA -> ancak sonra ResumeThread. Assign/verify basarisiz:
//     suspended child terminate + 106. Resume basarisiz: terminate + 107.
//     Child ILK komutunu calistirmadan job'a baglidir -> orphan-startup-race YOK.
//   - pwsh runtime-critical allowlist (8 dosya) SHA-256 gomulu; spawn ONCESI dogrulanir.
//   - stdout/stderr child'in inherit ettigi dosya handle'larina yonlenir (pipe-thread yok).
//   - Gorunmez stop-window (WM_CLOSE) + launcher HL_HOST_PID poll-watchdog korunur
//     (job kill-on-close primary; ikisi defense-in-depth).
// Host exit: 101 INVALID_MODE, 102 SELF_IDENTITY, 103 PWSH_MISSING,
//   104 SCRIPT_HASH, 105 CREATEPROCESS_FAILED, 106 JOB_BIND_FAILED,
//   107 RESUME_FAILED, 108 PWSH_CLOSURE_FAILED (994-file: missing/hash/size/extra/count),
//   109 MANIFEST_INVALID (manifest yok/SHA/parse), 110 CLONE_REPARSE (symlink/junction),
//   112 PROFILE_IDENTITY_MISSING (R05 gate 3);
//   diger = child exit aynen.
// R03.2 FULL CLOSURE: pwsh klonunun TAMAMI (994 dosya) her spawn ONCESI manifest'e karsi
//   path+regular-file+size+SHA-256 dogrulanir; eksik/ekstra/reparse fail-closed; dogrulama
//   bitmeden CreateProcessW CAGRILMAZ. Manifest SHA-256 host binary'ye compile-time PIN.
// Guven modeli: SEALED QUALIFIED BINARY (reproducible-build DEGIL) - binary SHA-256 +
//   kaynak SHA-256 + compiler kimligi + ACL; Authenticode NotSigned -> hash+ACL yerel guven.
// Sapma (kayitli): Framework'te ProcessStartInfo.ArgumentList yok; komut satiri
//   compile-time sabitlerden kurulur, dis girdi yalniz mode ENUM secimidir.
// ============================================================================
using System;
using System.Collections;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Security.AccessControl;
using System.Security.Cryptography;
using System.Security.Principal;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;

static class HukukTaskHost
{
    private const string PROD_SELF = @"C:\Ops\hukuk\bin\hukuk-task-host.exe";
    private const string QUAL_SELF = @"C:\Development\HUKUK_YAZILIMI\HY_C33_RELEASE23_CANDIDATE\cutover-staging\qual-inert\hukuk-task-host.exe";
    private const string PROD_PWSH = @"C:\Ops\hukuk\pwsh\pwsh.exe";
    private const string QUAL_PWSH = @"C:\Development\HUKUK_YAZILIMI\HY_C33_RELEASE23_CANDIDATE\cutover-staging\qual-inert\pwsh.exe";

    // R05 gate 3: profile/generation kimligi (compile-time seal; bos olamaz)
    private const string GENERATION_ID = "R23";
    private const string PROFILE_ID = "PRF-1c343861-7177-4799-be95-0c1fb72dd212";

    private enum Fault { None, Assign, Resume }

    private sealed class ModeSpec
    {
        public string Script, ScriptSha256, WorkDir, LogDir, PwshPath, ExpectedSelf;
        public Fault FaultMode;
        public ModeSpec(string sc, string sha, string wd, string ld, string pw, string self, Fault f)
        { Script = sc; ScriptSha256 = sha; WorkDir = wd; LogDir = ld; PwshPath = pw; ExpectedSelf = self; FaultMode = f; }
    }

    // Qualification kok/hash sabitleri (compile-time)
    private const string QB = @"C:\Development\HUKUK_YAZILIMI\HY_C33_RELEASE23_CANDIDATE\cutover-staging\qual-inert";
    private const string QTMP = @"C:\Development\HUKUK_YAZILIMI\HY_C33_RELEASE23_CANDIDATE\cutover-staging\qual-inert\tmp";
    private const string SHA_QA  = "0000000000000000000000000000000000000000000000000000000000000000";
    private const string SHA_QW  = "1111111111111111111111111111111111111111111111111111111111111111";
    private const string SHA_QW7 = "2222222222222222222222222222222222222222222222222222222222222222";
    private const string SHA_PAPI = "51681B6D6FE19F43A10A831D5695107F5F01226EF0A0A1EBA314A8693493BCEB";
    private const string SHA_PWEB = "898F7E5B5C2754419F10AAB62CAC0999002D0DD9F1F5E890172316B109281240";

    private static ModeSpec Resolve(string mode)
    {
        switch (mode)
        {
            // --- production modlari (C:\Ops; qual sirasinda self-identity ile 102) ---
            case "api": return new ModeSpec(@"C:\Ops\hukuk\bin\start-api.ps1", SHA_PAPI, @"C:\Ops\hukuk\bin", @"C:\Ops\hukuk\logs\api", PROD_PWSH, PROD_SELF, Fault.None);
            case "web": return new ModeSpec(@"C:\Ops\hukuk\bin\start-web.ps1", SHA_PWEB, @"C:\Ops\hukuk\bin", @"C:\Ops\hukuk\logs\web", PROD_PWSH, PROD_SELF, Fault.None);
            // --- qualification modlari (qual-self'e bagli; prod kurulumdan cagrilamaz) ---
            case "qapi":    return new ModeSpec(QB + @"\start-qual-api.ps1",  SHA_QA,  QB, QTMP + @"\api",  QUAL_PWSH, QUAL_SELF, Fault.None);
            case "qweb":    return new ModeSpec(QB + @"\start-qual-web.ps1",  SHA_QW,  QB, QTMP + @"\web",  QUAL_PWSH, QUAL_SELF, Fault.None);
            case "qweb7":   return new ModeSpec(QB + @"\start-qual-web7.ps1", SHA_QW7, QB, QTMP + @"\web7", QUAL_PWSH, QUAL_SELF, Fault.None);
            case "qassign": return new ModeSpec(QB + @"\start-qual-api.ps1",  SHA_QA,  QB, QTMP + @"\api",  QUAL_PWSH, QUAL_SELF, Fault.Assign);
            case "qresume": return new ModeSpec(QB + @"\start-qual-api.ps1",  SHA_QA,  QB, QTMP + @"\api",  QUAL_PWSH, QUAL_SELF, Fault.Resume);
            case "qmiss":   return new ModeSpec(QB + @"\start-qual-web.ps1",  SHA_QW,  QB, QTMP + @"\web",  @"C:\Development\HUKUK_YAZILIMI\HY_C33_RELEASE23_CANDIDATE\cutover-staging\qual-inert\no-such\pwsh.exe", QUAL_SELF, Fault.None);
            default: return null;
        }
    }

    // R03.2 FULL CLOSURE: 8-pin yerine TUM klon (994 dosya) manifest'e karsi dogrulanir.
    // Manifest host binary yanindadir (bin\pwsh-file-manifest.json); SHA-256'si compile-time PIN.
    private const string MANIFEST_SHA = "84E530B1A90F5A069C7C87B68B73948F574752650DB607DDFB29A959B9F0307A";
    private const string MANIFEST_NAME = "pwsh-file-manifest.json";

    private sealed class ManEntry { public string Path; public long Size; public string Sha; }

    private static List<ManEntry> ParseManifest(string path)
    {
        try
        {
            List<ManEntry> list = new List<ManEntry>();
            Regex rx = new Regex("\\{\"path\":\"(?<p>(?:[^\"\\\\]|\\\\.)*)\",\"size\":(?<s>\\d+),\"sha256\":\"(?<h>[0-9A-Fa-f]+)\"\\}");
            foreach (string line in File.ReadAllLines(path))
            {
                Match m = rx.Match(line);
                if (!m.Success) continue;
                ManEntry e = new ManEntry();
                e.Path = m.Groups["p"].Value.Replace("\\\\", "\\");
                e.Size = long.Parse(m.Groups["s"].Value);
                e.Sha = m.Groups["h"].Value;
                list.Add(e);
            }
            return list.Count > 0 ? list : null;
        }
        catch (Exception) { return null; }
    }

    // ACL/TOCTOU: clone root DACL protected (inheritance kapali) VE current-user-SID
    // ile broad SID'ler (World/AuthUsers/Users) icin YAZMA ACE'si YOK olmali. Yazma
    // haklari yalniz Administrators/SYSTEM'e (elevated bakim) birakilir. Bu, hash
    // dogrulamasi ile CreateProcessW arasindaki butunlugu task-token'in yazamamasina
    // baglar. Drift -> 111. (Owner elevated iken degistirebilir: guven sinirinin disi.)
    // YALNIZ atomik-yazma bitleri. Modify/FullControl BILESIK maskelerdir (okuma bitlerini
    // de icerir) -> onlari eklemek ReadAndExecute ile okuma-bitleri uzerinden yanlis-pozitif
    // uretir. Modify/FullControl ACE'leri zaten bu atomik bitleri set ettiginden dogru yakalanir.
    private static readonly FileSystemRights WRITE_MASK =
        FileSystemRights.WriteData | FileSystemRights.CreateFiles | FileSystemRights.AppendData |
        FileSystemRights.CreateDirectories | FileSystemRights.Delete | FileSystemRights.DeleteSubdirectoriesAndFiles |
        FileSystemRights.WriteAttributes | FileSystemRights.WriteExtendedAttributes |
        FileSystemRights.ChangePermissions | FileSystemRights.TakeOwnership;

    private static int VerifyCloneAcl(string root)
    {
        try
        {
            DirectoryInfo di = new DirectoryInfo(root);
            DirectorySecurity sec = di.GetAccessControl(AccessControlSections.Access);
            if (!sec.AreAccessRulesProtected) { HostLog("ACL_DRIFT root inheritance NOT protected"); return 111; }
            SecurityIdentifier me = WindowsIdentity.GetCurrent().User;
            foreach (FileSystemAccessRule r in sec.GetAccessRules(true, true, typeof(SecurityIdentifier)))
            {
                if (r.AccessControlType != AccessControlType.Allow) continue;
                SecurityIdentifier sid = (SecurityIdentifier)r.IdentityReference;
                bool broad = sid.IsWellKnown(WellKnownSidType.WorldSid)
                    || sid.IsWellKnown(WellKnownSidType.AuthenticatedUserSid)
                    || sid.IsWellKnown(WellKnownSidType.BuiltinUsersSid);
                bool isMe = sid.Equals(me);
                if ((isMe || broad) && (r.FileSystemRights & WRITE_MASK) != 0)
                { HostLog("ACL_DRIFT write ACE for " + (isMe ? "current-user" : "broad-sid") + " " + sid.Value); return 111; }
            }
            return 0;
        }
        catch (Exception ex) { HostLog("ACL_READ_FAILED " + ex.GetType().Name); return 111; }
    }

    // Donus: @{0=OK, 108=CLOSURE_FAILED, 109=MANIFEST_INVALID, 110=CLONE_REPARSE}
    private static int VerifyClosure(string pwshExe, out double ms, out long totalBytes)
    {
        ms = 0; totalBytes = 0;
        Stopwatch sw = Stopwatch.StartNew();
        string self;
        try { self = Process.GetCurrentProcess().MainModule.FileName; } catch (Exception) { return 109; }
        string manifestPath = Path.Combine(Path.GetDirectoryName(self), MANIFEST_NAME);
        if (!File.Exists(manifestPath)) { HostLog("MANIFEST_MISSING"); return 109; }
        string mSha; try { mSha = Sha256File(manifestPath); } catch (Exception) { return 109; }
        if (!string.Equals(mSha, MANIFEST_SHA, StringComparison.OrdinalIgnoreCase)) { HostLog("MANIFEST_SHA_MISMATCH"); return 109; }
        List<ManEntry> entries = ParseManifest(manifestPath);
        if (entries == null) { HostLog("MANIFEST_PARSE_FAILED"); return 109; }

        string root = Path.GetFullPath(Path.GetDirectoryName(pwshExe));
        if (!Directory.Exists(root)) { HostLog("CLONE_ROOT_MISSING"); return 108; }
        try { if ((File.GetAttributes(root) & FileAttributes.ReparsePoint) != 0) { HostLog("CLONE_ROOT_REPARSE"); return 110; } } catch (Exception) { return 108; }
        foreach (string d in Directory.GetDirectories(root, "*", SearchOption.AllDirectories))
            if ((File.GetAttributes(d) & FileAttributes.ReparsePoint) != 0) { HostLog("DIR_REPARSE " + d); return 110; }

        Dictionary<string, ManEntry> set = new Dictionary<string, ManEntry>(StringComparer.OrdinalIgnoreCase);
        foreach (ManEntry e in entries) set[e.Path] = e;

        string prefix = root.TrimEnd('\\') + "\\";
        string[] actual = Directory.GetFiles(root, "*", SearchOption.AllDirectories);
        if (actual.Length != entries.Count) { HostLog("COUNT_MISMATCH actual=" + actual.Length + " manifest=" + entries.Count); return 108; }
        foreach (string fp in actual)
        {
            if ((File.GetAttributes(fp) & FileAttributes.ReparsePoint) != 0) { HostLog("FILE_REPARSE " + fp); return 110; }
            string rel = fp.Substring(prefix.Length);
            if (!set.ContainsKey(rel)) { HostLog("UNEXPECTED_FILE " + rel); return 108; }
        }
        foreach (ManEntry e in entries)
        {
            string full = Path.Combine(root, e.Path);
            if (!File.Exists(full)) { HostLog("MISSING " + e.Path); return 108; }
            FileInfo fi = new FileInfo(full);
            if (fi.Length != e.Size) { HostLog("SIZE_MISMATCH " + e.Path); return 108; }
            string h; try { h = Sha256File(full); } catch (Exception) { HostLog("READFAIL " + e.Path); return 108; }
            if (!string.Equals(h, e.Sha, StringComparison.OrdinalIgnoreCase)) { HostLog("HASH_MISMATCH " + e.Path); return 108; }
            totalBytes += fi.Length;
        }
        sw.Stop(); ms = sw.Elapsed.TotalMilliseconds;
        return 0;
    }

    // ---- log ----
    private static readonly object LogLock = new object();
    private static string LogPath = null;
    // R05 D3: HostLog artik DISKE degil BELLEGE yazar. Diske yazim yalniz ArmLog()
    // ile acilir ve ArmLog YALNIZ tum guvenlik kapilari PASS ettikten sonra cagrilir.
    // Gate FAIL yolunda EmitDiagnostics() yalniz stderr'e yazar; dosya/dizin OLUSMAZ.
    private static readonly List<string> LogBuffer = new List<string>();
    private static bool LogArmed = false;

    private static void HostLog(string line)
    {
        string stamped = DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss.fff") + " [host] " + line;
        lock (LogLock) { LogBuffer.Add(stamped); }
        if (LogArmed) HostLogWrite(stamped);
    }

    private static void ArmLog(string logDir, string mode)
    {
        try
        {
            Directory.CreateDirectory(logDir);
            LogPath = Path.Combine(logDir, "host-" + mode + ".log");
            lock (LogLock) { foreach (string s in LogBuffer) HostLogWrite(s); }
            LogArmed = true;
        }
        catch (Exception) { }
    }

    private static void EmitDiagnostics()
    {
        try { lock (LogLock) { foreach (string s in LogBuffer) Console.Error.WriteLine(s); } }
        catch (Exception) { }
    }

    private static int FailClosed(int code, bool verifyOnly)
    {
        // Gate FAIL: DISKE YAZIM YOK (dizin de olusturulmaz). Tani stderr'e.
        if (verifyOnly) { try { Console.Out.WriteLine("VERIFY-SEAL FAIL exit=" + code); } catch (Exception) { } }
        EmitDiagnostics();
        return code;
    }

    private static void HostLogWrite(string stamped)
    {
        try
        {
            if (LogPath == null) return;
            lock (LogLock)
            {
                FileInfo fi = new FileInfo(LogPath);
                if (fi.Exists && fi.Length > 5 * 1024 * 1024)
                {
                    string old = LogPath + ".1";
                    if (File.Exists(old)) File.Delete(old);
                    File.Move(LogPath, old);
                }
                File.AppendAllText(LogPath, stamped + "\r\n", Encoding.ASCII);
            }
        }
        catch (Exception) { }
    }

    private static string Sha256File(string path)
    {
        using (SHA256 h = SHA256.Create())
        using (FileStream fs = File.OpenRead(path))
        {
            byte[] d = h.ComputeHash(fs);
            StringBuilder sb = new StringBuilder(64);
            for (int i = 0; i < d.Length; i++) sb.Append(d[i].ToString("X2"));
            return sb.ToString();
        }
    }

    // ---- Job Object ----
    [DllImport("kernel32.dll", SetLastError = true)] private static extern IntPtr CreateJobObject(IntPtr a, string name);
    [DllImport("kernel32.dll", SetLastError = true)] private static extern bool SetInformationJobObject(IntPtr job, int c, ref JOBOBJECT_EXTENDED_LIMIT_INFORMATION info, int len);
    [DllImport("kernel32.dll", SetLastError = true)] private static extern bool AssignProcessToJobObject(IntPtr job, IntPtr process);
    [DllImport("kernel32.dll", SetLastError = true)] private static extern bool IsProcessInJob(IntPtr process, IntPtr job, out bool result);
    [StructLayout(LayoutKind.Sequential)] private struct JOBOBJECT_BASIC_LIMIT_INFORMATION { public long a; public long b; public uint LimitFlags; public UIntPtr c; public UIntPtr d; public uint e; public UIntPtr f; public uint g; public uint h; }
    [StructLayout(LayoutKind.Sequential)] private struct IO_COUNTERS { public ulong a, b, c, d, e, f; }
    [StructLayout(LayoutKind.Sequential)] private struct JOBOBJECT_EXTENDED_LIMIT_INFORMATION { public JOBOBJECT_BASIC_LIMIT_INFORMATION Basic; public IO_COUNTERS Io; public UIntPtr a; public UIntPtr b; public UIntPtr c; public UIntPtr d; }
    private const uint JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE = 0x2000;
    private static IntPtr JobHandle = IntPtr.Zero;

    private static bool SetupJob()
    {
        IntPtr job = CreateJobObject(IntPtr.Zero, null);
        if (job == IntPtr.Zero) return false;
        JOBOBJECT_EXTENDED_LIMIT_INFORMATION info = new JOBOBJECT_EXTENDED_LIMIT_INFORMATION();
        info.Basic.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
        if (!SetInformationJobObject(job, 9, ref info, Marshal.SizeOf(info))) return false;
        JobHandle = job;   // acik birakilir -> host olunce OS kapatir -> kill-on-close
        return true;
    }

    // ---- CreateProcess / thread / handle ----
    [StructLayout(LayoutKind.Sequential)] private struct SECURITY_ATTRIBUTES { public int nLength; public IntPtr lpSecurityDescriptor; public int bInheritHandle; }
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)] private struct STARTUPINFO
    {
        public int cb; public string lpReserved, lpDesktop, lpTitle;
        public int dwX, dwY, dwXSize, dwYSize, dwXCountChars, dwYCountChars, dwFillAttribute, dwFlags;
        public short wShowWindow, cbReserved2; public IntPtr lpReserved2, hStdInput, hStdOutput, hStdError;
    }
    [StructLayout(LayoutKind.Sequential)] private struct PROCESS_INFORMATION { public IntPtr hProcess, hThread; public int dwProcessId, dwThreadId; }
    [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    private static extern bool CreateProcessW(string app, StringBuilder cmd, IntPtr pa, IntPtr ta, bool inherit,
        uint flags, IntPtr env, string cwd, ref STARTUPINFO si, out PROCESS_INFORMATION pi);
    [DllImport("kernel32.dll", SetLastError = true)] private static extern uint ResumeThread(IntPtr hThread);
    [DllImport("kernel32.dll", SetLastError = true)] private static extern bool TerminateProcess(IntPtr h, uint code);
    [DllImport("kernel32.dll", SetLastError = true)] private static extern bool CloseHandle(IntPtr h);
    [DllImport("kernel32.dll", SetLastError = true)] private static extern uint WaitForSingleObject(IntPtr h, uint ms);
    [DllImport("kernel32.dll", SetLastError = true)] private static extern bool GetExitCodeProcess(IntPtr h, out uint code);
    [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    private static extern IntPtr CreateFileW(string name, uint access, uint share, ref SECURITY_ATTRIBUTES sa, uint disp, uint flags, IntPtr tmpl);
    private const uint CREATE_SUSPENDED = 0x4, CREATE_NO_WINDOW = 0x8000000, CREATE_UNICODE_ENVIRONMENT = 0x400;
    private const uint STARTF_USESTDHANDLES = 0x100;
    private const uint GENERIC_WRITE = 0x40000000, FILE_SHARE_READ = 1, CREATE_ALWAYS = 2, FILE_ATTRIBUTE_NORMAL = 0x80;
    private static readonly IntPtr INVALID = new IntPtr(-1);

    private static IntPtr BuildEnvBlock()
    {
        // mevcut env + HL_HOST_PID; UTF-16, cift-NUL sonlu. Secret EKLENMEZ (mevcut env aynen).
        StringBuilder sb = new StringBuilder();
        Hashtable seen = new Hashtable(StringComparer.OrdinalIgnoreCase);
        IDictionary env = Environment.GetEnvironmentVariables();
        foreach (DictionaryEntry e in env)
        {
            string k = (string)e.Key;
            if (seen.ContainsKey(k)) continue; seen[k] = true;
            sb.Append(k).Append('=').Append((string)e.Value).Append('\0');
        }
        sb.Append("HL_HOST_PID=").Append(Process.GetCurrentProcess().Id.ToString()).Append('\0');
        sb.Append('\0');
        byte[] bytes = Encoding.Unicode.GetBytes(sb.ToString());
        IntPtr p = Marshal.AllocHGlobal(bytes.Length);
        Marshal.Copy(bytes, 0, p, bytes.Length);
        return p;
    }

    private delegate IntPtr WndProcD(IntPtr h, uint m, IntPtr w, IntPtr l);
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)] private struct WNDCLASSW { public uint style; public WndProcD proc; public int a, b; public IntPtr inst, ic, cur, bg; public string menu, cls; }
    [DllImport("user32.dll", SetLastError = true, CharSet = CharSet.Unicode)] private static extern ushort RegisterClassW(ref WNDCLASSW wc);
    [DllImport("user32.dll", SetLastError = true, CharSet = CharSet.Unicode)] private static extern IntPtr CreateWindowExW(uint ex, string cls, string name, uint style, int x, int y, int w, int h, IntPtr par, IntPtr menu, IntPtr inst, IntPtr p);
    [DllImport("user32.dll")] private static extern IntPtr DefWindowProcW(IntPtr h, uint m, IntPtr w, IntPtr l);
    [DllImport("user32.dll")] private static extern int GetMessageW(out MSG msg, IntPtr h, uint a, uint b);
    [DllImport("user32.dll")] private static extern bool TranslateMessage(ref MSG msg);
    [DllImport("user32.dll")] private static extern IntPtr DispatchMessageW(ref MSG msg);
    [StructLayout(LayoutKind.Sequential)] private struct MSG { public IntPtr h; public uint m; public IntPtr w, l; public uint t; public int x, y; }
    private const uint WM_CLOSE = 0x10, WM_ENDSESSION = 0x16, WM_QUERYENDSESSION = 0x11;
    private static WndProcD PinnedWndProc;

    private static IntPtr StopWndProc(IntPtr h, uint m, IntPtr w, IntPtr l)
    {
        if (m == WM_CLOSE || m == WM_ENDSESSION) { HostLog("stop-signal - exiting; job kill-on-close reaps child tree"); Environment.Exit(1); }
        if (m == WM_QUERYENDSESSION) return new IntPtr(1);
        return DefWindowProcW(h, m, w, l);
    }
    private static void StartStopWindow()
    {
        Thread t = new Thread(delegate ()
        {
            try
            {
                PinnedWndProc = StopWndProc;
                WNDCLASSW wc = new WNDCLASSW(); wc.proc = PinnedWndProc; wc.cls = "HukukTaskHostStopWnd"; wc.inst = Process.GetCurrentProcess().Handle;
                RegisterClassW(ref wc);
                IntPtr hwnd = CreateWindowExW(0, "HukukTaskHostStopWnd", "hukuk-task-host", 0, 0, 0, 0, 0, IntPtr.Zero, IntPtr.Zero, wc.inst, IntPtr.Zero);
                if (hwnd == IntPtr.Zero) { HostLog("stop-window create failed"); return; }
                MSG msg; while (GetMessageW(out msg, IntPtr.Zero, 0, 0) > 0) { TranslateMessage(ref msg); DispatchMessageW(ref msg); }
            }
            catch (Exception) { }
        });
        t.IsBackground = true; t.SetApartmentState(ApartmentState.STA); t.Start();
    }

    static int Main(string[] args)
    {
        // === R05 GATE SIRASI (C34 ?6) ============================================
        // 1 argument/mode -> 2 self/binary -> 3 profile/generation -> 4 launcher-pin
        // -> 5 ACL/clone-manifest -> 6 ANCAK BUNDAN SONRA yan etki (dizin/log/job/spawn).
        // Directory.CreateDirectory ve disk-log'u gate'lerden ONCE CALISAMAZ.

        // GATE 1: argument/mode
        if (args == null || args.Length < 1 || args.Length > 2) return 101;
        bool verifyOnly = false;
        if (args.Length == 2)
        {
            if (!string.Equals(args[1], "--verify-seal", StringComparison.Ordinal)) return 101;
            verifyOnly = true;
        }
        ModeSpec spec = Resolve(args[0]);
        if (spec == null) return 101;
        HostLog("begin mode=" + args[0] + (verifyOnly ? " (--verify-seal)" : ""));

        // GATE 2: self / binary identity
        string self; try { self = Process.GetCurrentProcess().MainModule.FileName; } catch (Exception) { self = ""; }
        if (!string.Equals(self, spec.ExpectedSelf, StringComparison.OrdinalIgnoreCase)) { HostLog("SELF_IDENTITY_MISMATCH self=" + self + " exit 102"); return FailClosed(102, verifyOnly); }

        // GATE 3: profile / generation identity
        if (GENERATION_ID.Length == 0 || PROFILE_ID.Length == 0) { HostLog("PROFILE_IDENTITY_MISSING exit 112"); return FailClosed(112, verifyOnly); }
        HostLog("profile=" + PROFILE_ID + " generation=" + GENERATION_ID);

        if (spec.PwshPath == null || !File.Exists(spec.PwshPath)) { HostLog("PWSH_MISSING exit 103"); return FailClosed(103, verifyOnly); }

        // GATE 4: launcher-pin
        string sha; try { sha = Sha256File(spec.Script); } catch (Exception) { HostLog("SCRIPT_READ_FAILED exit 104"); return FailClosed(104, verifyOnly); }
        if (!string.Equals(sha, spec.ScriptSha256, StringComparison.OrdinalIgnoreCase)) { HostLog("SCRIPT_HASH_MISMATCH exit 104"); return FailClosed(104, verifyOnly); }
        HostLog("launcher pin ok " + sha);

        // GATE 5: ACL/TOCTOU anchor -> once ACL (task-token yazamamali), sonra full closure hash.
        string cloneRoot = Path.GetFullPath(Path.GetDirectoryName(spec.PwshPath));
        int aclc = VerifyCloneAcl(cloneRoot);
        if (aclc != 0) { HostLog("PWSH_ACL_DRIFT code=" + aclc); return FailClosed(aclc, verifyOnly); }
        double closureMs; long closureBytes;
        int closure = VerifyClosure(spec.PwshPath, out closureMs, out closureBytes);
        if (closure != 0) { HostLog("PWSH_CLOSURE_FAILED code=" + closure); return FailClosed(closure, verifyOnly); }
        HostLog("pwsh ACL ok + FULL CLOSURE ok 994/994 bytes=" + closureBytes + " ms=" + ((int)closureMs));

        // GATE 5 SONU: --verify-seal HICBIR YAN ETKI URETMEDEN doner.
        if (verifyOnly)
        {
            try
            {
                Console.Out.WriteLine("VERIFY-SEAL OK");
                Console.Out.WriteLine("mode=" + args[0]);
                Console.Out.WriteLine("self=" + self);
                Console.Out.WriteLine("profile=" + PROFILE_ID);
                Console.Out.WriteLine("generation=" + GENERATION_ID);
                Console.Out.WriteLine("launcher=" + spec.Script);
                Console.Out.WriteLine("launcherSha256=" + sha);
                Console.Out.WriteLine("manifestSha256=" + MANIFEST_SHA);
                Console.Out.WriteLine("closureBytes=" + closureBytes);
            }
            catch (Exception) { }
            return 0;
        }

        // GATE 6: YAN ETKILER ANCAK BURADAN ITIBAREN
        ArmLog(spec.LogDir, args[0]);

        if (!SetupJob()) { HostLog("JOB_SETUP_FAILED exit 106"); return 106; }
        HostLog("job kill-on-close armed (pre-spawn)");
        StartStopWindow();

        // stdout/stderr -> inherit edilebilir dosya handle'lari
        SECURITY_ATTRIBUTES sa = new SECURITY_ATTRIBUTES(); sa.nLength = Marshal.SizeOf(typeof(SECURITY_ATTRIBUTES)); sa.bInheritHandle = 1;
        string ts = DateTime.Now.ToString("yyyyMMdd-HHmmss");
        IntPtr hOut = CreateFileW(Path.Combine(spec.LogDir, "host-out." + ts + ".log"), GENERIC_WRITE, FILE_SHARE_READ, ref sa, CREATE_ALWAYS, FILE_ATTRIBUTE_NORMAL, IntPtr.Zero);
        IntPtr hErr = CreateFileW(Path.Combine(spec.LogDir, "host-err." + ts + ".log"), GENERIC_WRITE, FILE_SHARE_READ, ref sa, CREATE_ALWAYS, FILE_ATTRIBUTE_NORMAL, IntPtr.Zero);

        STARTUPINFO si = new STARTUPINFO(); si.cb = Marshal.SizeOf(typeof(STARTUPINFO));
        si.dwFlags = (int)STARTF_USESTDHANDLES; si.hStdInput = IntPtr.Zero; si.hStdOutput = hOut; si.hStdError = hErr;

        // komut satiri: compile-time sabit sablonu (kullanici girdisi TASIMAZ) - mutable buffer
        StringBuilder cmd = new StringBuilder();
        cmd.Append('"').Append(spec.PwshPath).Append("\" -NoProfile -NonInteractive -File \"").Append(spec.Script).Append('"');
        IntPtr env = BuildEnvBlock();

        PROCESS_INFORMATION pi = new PROCESS_INFORMATION();
        bool ok;
        try
        {
            ok = CreateProcessW(spec.PwshPath, cmd, IntPtr.Zero, IntPtr.Zero, true,
                CREATE_SUSPENDED | CREATE_NO_WINDOW | CREATE_UNICODE_ENVIRONMENT, env, spec.WorkDir, ref si, out pi);
        }
        finally
        {
            Marshal.FreeHGlobal(env);
            if (hOut != INVALID && hOut != IntPtr.Zero) CloseHandle(hOut);
            if (hErr != INVALID && hErr != IntPtr.Zero) CloseHandle(hErr);
        }
        if (!ok) { HostLog("CREATEPROCESS_FAILED gle=" + Marshal.GetLastWin32Error() + " exit 105"); return 105; }
        HostLog("child created SUSPENDED pid=" + pi.dwProcessId);

        // ATOMIK BAGLAMA: child HALA suspended iken job'a ata + dogrula
        bool assignOk = (spec.FaultMode != Fault.Assign) && AssignProcessToJobObject(JobHandle, pi.hProcess);
        bool inJob = false;
        if (assignOk) IsProcessInJob(pi.hProcess, JobHandle, out inJob);
        if (!assignOk || !inJob)
        {
            HostLog((spec.FaultMode == Fault.Assign ? "FAULT-INJECT assign; " : "") + "JOB_BIND_FAILED - terminating suspended child, exit 106");
            try { TerminateProcess(pi.hProcess, 106); } catch (Exception) { }
            CloseHandle(pi.hThread); CloseHandle(pi.hProcess);
            return 106;
        }
        HostLog("child bound to job (verified in-job) BEFORE resume - atomic");

        // ancak simdi calismaya izin ver
        bool resumeFail = (spec.FaultMode == Fault.Resume);
        uint rt = resumeFail ? uint.MaxValue : ResumeThread(pi.hThread);
        if (rt == uint.MaxValue)
        {
            HostLog((resumeFail ? "FAULT-INJECT resume; " : "") + "RESUME_FAILED - terminating child, exit 107");
            try { TerminateProcess(pi.hProcess, 107); } catch (Exception) { }
            CloseHandle(pi.hThread); CloseHandle(pi.hProcess);
            return 107;
        }
        CloseHandle(pi.hThread);
        HostLog("child resumed pid=" + pi.dwProcessId);

        WaitForSingleObject(pi.hProcess, 0xFFFFFFFF);
        uint code; GetExitCodeProcess(pi.hProcess, out code);
        CloseHandle(pi.hProcess);
        HostLog("child exit code=" + unchecked((int)code) + " (propagate)");
        return unchecked((int)code);
    }
}


