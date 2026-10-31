/**
 * F02-K1 — baslatici dinleyici sozlesmesi (project/ops/runtime-launcher/start-{api,web}.ps1 + host/).
 *
 * Sozlesme: dinleyici tespiti LISTENER sinifi + port + adres ailesi + sahip pid. Sorgu hatasi "dinleyici yok"
 * SAYILMAZ, BELIRSIZ uretir. Belirsizlik tek basina cocugu sonlandirmaz. Baska surecin dinleyicisi kabul edilmez.
 *
 * Baslaticinin GERCEK fonksiyonlari pwsh ile dot-source edilir, izole gecici dizinde gercek node cocugu ile kosar.
 * Tek golge: Read-HLListenerFamily (ham Windows sorgusu); CI ubuntu'da da ayni karar yolu calissin diye senaryo
 * dosyasindan okur. Canli dosya, gorev, port, .env, DB KULLANILMAZ. pwsh yoksa test ATLANMAZ, DUSER.
 */
import { ChildProcess, spawn, spawnSync } from 'child_process';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const OPS = path.resolve(__dirname, '../../../../../ops/runtime-launcher');
const sha = (p: string): string => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex').toUpperCase();

const ENTRY_JS = `const [,, sure, kod] = process.argv;
require('fs').appendFileSync(require('path').join(__dirname, 'spawns.log'), process.pid + '\\n');
const s = Number(sure) || 0;
if (s <= 0) process.exit(Number(kod) || 0);
setTimeout(() => process.exit(Number(kod) || 0), s * 1000);
`;

const DRIVER_PS1 = `param(
  [Parameter(Mandatory)][string]$Launcher, [Parameter(Mandatory)][string]$Root, [Parameter(Mandatory)][string]$NodeExe,
  [Parameter(Mandatory)][string]$Hedef, [int]$Bind = 5, [int]$Sure = 0, [int]$Kod = 0
)
$ErrorActionPreference = 'Stop'
. $Launcher
$cfg = $(if ($Hedef -eq 'api') { Get-HLApiDefaultConfig } else { Get-HLWebDefaultConfig })
$cfg['NodeExe'] = $NodeExe; $cfg['NodeSha256'] = (Get-FileHash -Algorithm SHA256 -LiteralPath $NodeExe).Hash
$cfg['ReleaseRoot'] = $Root; $cfg['WorkDir'] = $Root; $cfg['EntryJs'] = (Join-Path $Root 'entry.js'); $cfg['EntryArgs'] = @([string]$Sure, [string]$Kod)
$cfg['LogDir'] = (Join-Path $Root 'logs'); $cfg['LockPath'] = (Join-Path $Root 'logs/launch.lock'); $cfg['Port'] = 48123; $cfg['LegacyHints'] = @(); $cfg['RequireDb'] = $false
$cfg['BindTimeoutSec'] = $Bind; $cfg['BindUncertainPollSec'] = 1; $cfg['BindUncertainDefiniteSamples'] = 2
function script:Read-HLListenerFamily {
  param([int]$AddressFamily, [int]$Port)
  $mod = (Get-Content -Raw -LiteralPath (Join-Path $Root 'mod.txt')).Trim()
  $lg = Join-Path $Root 'logs/launcher.log'; $cp = 0
  if (Test-Path -LiteralPath $lg) { $mt = [regex]::Match((Get-Content -Raw -LiteralPath $lg), 'child spawned pid=(\\d+)'); if ($mt.Success) { $cp = [int]$mt.Groups[1].Value } }
  switch ($mod) {
    'cocuk' { if ($cp) { return @($cp) }; return @() }
    'yok' { return @() }
    'yabanci' { return @(424242) }
    'yabanci-sonra' { if ($cp) { return @(424242) }; return @() }
    'kismi' { if ($AddressFamily -eq 23) { return @() }; if ($cp) { return @($cp) }; return @() }
    'karisik' { if ($AddressFamily -eq 23) { if ($cp) { return @(424242) }; return @() }; if ($cp) { return @($cp) }; return @() }
    'sonra-hata' { if ($cp) { throw (New-Object System.InvalidOperationException 'ENJEKTE sorgu hatasi') }; return @() }
    default { throw (New-Object System.InvalidOperationException 'ENJEKTE sorgu hatasi') }
  }
}
$code = $(if ($Hedef -eq 'api') { Invoke-HLApiMain -Cfg $cfg } else { Invoke-HLWebMain -Cfg $cfg })
Write-Output ('HLTEST_EXIT=' + $code)
`;

const BIND_STATE_PS1 = `param([Parameter(Mandatory)][string]$Launcher)
$ErrorActionPreference = 'Stop'
. $Launcher
$f = [string[]]@('V4', 'V6')
function D($v4, $v6, $ok = $true) { (Get-HLBindState -Probe @{ Ok = $ok; V4 = @($v4); V6 = @($v6); Note = 'n' } -ChildPid 7 -Families $f).State }
$o = [ordered]@{ exact = (D @(7) @(7)); yok = (D @() @()); yabanci = (D @(9) @(9)); kismi = (D @(7) @()); karisik = (D @(7) @(9)); belirsiz = (D @() @() $false) }
$p = Get-HLListenerProbe -Port 48123
$o.gercekOk = [bool]$p.Ok; $o.gercekNotBos = [bool]$p.Note
Write-Output ('HLTEST_JSON=' + ($o | ConvertTo-Json -Compress))
`;

const roots: string[] = [];
const sonlandir: ChildProcess[] = [];

function kok(mod: string): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'k1-launcher-'));
  roots.push(root);
  fs.mkdirSync(path.join(root, 'logs'));
  fs.writeFileSync(path.join(root, 'entry.js'), ENTRY_JS);
  fs.writeFileSync(path.join(root, 'driver.ps1'), DRIVER_PS1);
  fs.writeFileSync(path.join(root, 'mod.txt'), mod);
  return root;
}
function argv(root: string, hedef: string, o: { bind?: number; sure?: number; kod?: number }): string[] {
  return ['-NoProfile', '-NonInteractive', '-File', path.join(root, 'driver.ps1'), '-Launcher', path.join(OPS, `start-${hedef}.ps1`), '-Root', root, '-NodeExe', process.execPath, '-Hedef', hedef,
    '-Bind', String(o.bind ?? 5), '-Sure', String(o.sure ?? 0), '-Kod', String(o.kod ?? 0)];
}
const gunluk = (root: string): string => { const f = path.join(root, 'logs', 'launcher.log'); return fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : ''; };
const cocukPid = (root: string): number => Number(/child spawned pid=(\d+)/.exec(gunluk(root))?.[1] ?? 0);
const yasiyor = (p: number): boolean => { try { process.kill(p, 0); return true; } catch { return false; } };
const kilitYok = (root: string): boolean => !fs.existsSync(path.join(root, 'logs', 'launch.lock'));

function kos(hedef: string, mod: string, o: { bind?: number; sure?: number; kod?: number } = {}): { exit: number; root: string; log: string } {
  const root = kok(mod);
  const r = spawnSync('pwsh', argv(root, hedef, o), { encoding: 'utf8', timeout: 90_000 });
  const m = /HLTEST_EXIT=(-?\d+)/.exec(String(r.stdout));
  if (!m) throw new Error(`driver HLTEST_EXIT basmadi status=${r.status}\n${r.stdout}\n${r.stderr}\n${gunluk(root)}`);
  return { exit: Number(m[1]), root, log: gunluk(root) };
}
function arkada(hedef: string, mod: string, o: { bind?: number; sure?: number; kod?: number } = {}, env?: NodeJS.ProcessEnv): { root: string; bitti: Promise<number>; p: ChildProcess } {
  const root = kok(mod);
  const p = spawn('pwsh', argv(root, hedef, o), { env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  sonlandir.push(p);
  let out = ''; p.stdout?.on('data', (d) => { out += String(d); }); p.stderr?.on('data', (d) => { out += String(d); });
  const bitti = new Promise<number>((res, rej) => p.on('close', () => { const m = /HLTEST_EXIT=(-?\d+)/.exec(out); if (m) res(Number(m[1])); else rej(new Error(`HLTEST_EXIT yok\n${out}\n${gunluk(root)}`)); }));
  return { root, bitti, p };
}
async function bekle(kosul: () => boolean, ms: number, ad: string): Promise<void> {
  const son = Date.now() + ms;
  while (Date.now() < son) { if (kosul()) return; await new Promise((r) => setTimeout(r, 150)); }
  throw new Error(`zaman asimi: ${ad}`);
}

describe('F02-K1 — baslatici dinleyici sozlesmesi', () => {
  jest.setTimeout(150_000);

  afterAll(() => {
    for (const p of sonlandir) { try { p.kill(); } catch { /* bitmis */ } }
    for (const r of roots) { try { fs.rmSync(r, { recursive: true, force: true }); } catch { /* acik dosya */ } }
  });

  describe('kurulu uclu ile kaynak tutarliligi', () => {
    const pin = JSON.parse(fs.readFileSync(path.join(OPS, 'host', 'uclu-pin.json'), 'utf8'));
    const gen = fs.readFileSync(path.join(OPS, 'host', 'hukuk-task-host.gen.cs'), 'latin1');

    it('baslatici kaynaklari kurulu ucluyle bayt bayt ayni', () => {
      expect(sha(path.join(OPS, 'start-api.ps1'))).toBe(pin.api);
      expect(sha(path.join(OPS, 'start-web.ps1'))).toBe(pin.web);
    });

    it('host kaynagindaki derleme zamani pinleri baslaticilarla ayni; eski pin kalmadi', () => {
      expect(/SHA_PAPI = "([0-9A-F]{64})"/.exec(gen)?.[1]).toBe(pin.api);
      expect(/SHA_PWEB = "([0-9A-F]{64})"/.exec(gen)?.[1]).toBe(pin.web);
      expect(gen).not.toContain(pin.onceki.api);
      expect(gen).not.toContain(pin.onceki.web);
    });

    it('pin uretici: denetim gecer; uretilen gen.cs depodakiyle bayt bayt ayni; C:\\\\Ops hedefi reddedilir', () => {
      const betik = path.join(OPS, 'host', 'pin-uret.ps1');
      const d = spawnSync('pwsh', ['-NoProfile', '-NonInteractive', '-File', betik], { encoding: 'utf8', timeout: 60_000 });
      expect(d.status).toBe(0);
      expect(String(d.stdout)).toContain('PIN TUTARLI | F02-K1');
      const cik = fs.mkdtempSync(path.join(os.tmpdir(), 'k1-pin-')); roots.push(cik);
      const u = spawnSync('pwsh', ['-NoProfile', '-NonInteractive', '-File', betik, '-CiktiDizini', cik, '-DerlemeYok'], { encoding: 'utf8', timeout: 60_000 });
      expect(u.status).toBe(0);
      expect(sha(path.join(cik, 'hukuk-task-host.gen.cs'))).toBe(sha(path.join(OPS, 'host', 'hukuk-task-host.gen.cs')));
    });

    it.each(['api', 'web'])('%s: eski durum sorgusu yok, saf ASCII, CR yok, surum izi var', (h) => {
      const b = fs.readFileSync(path.join(OPS, `start-${h}.ps1`));
      const t = b.toString('latin1');
      expect(t).not.toContain('Get-NetTCPConnection');
      expect(t).not.toContain('\r');
      expect(b.every((x) => x < 128)).toBe(true);
      expect(t).toContain('launcher begin (R02 F02-K1)');
      expect(t).toContain('TCP_TABLE_OWNER_PID_LISTENER');
    });
  });

  describe.each(['api', 'web'])('%s: karar tablosu ve ham sinif', (h) => {
    it('EXACT / YOK / YABANCI / KISMI / karisik aile / BELIRSIZ; sinif yoksa Ok=false, hic "yok" denmez', () => {
      const root = kok('yok');
      const f = path.join(root, 'bs.ps1'); fs.writeFileSync(f, BIND_STATE_PS1);
      const r = spawnSync('pwsh', ['-NoProfile', '-NonInteractive', '-File', f, '-Launcher', path.join(OPS, `start-${h}.ps1`)], { encoding: 'utf8', timeout: 60_000 });
      const m = /HLTEST_JSON=(.*)/.exec(String(r.stdout));
      if (!m) throw new Error(`${r.stdout}\n${r.stderr}`);
      const o = JSON.parse(m[1]);
      expect(o).toMatchObject({ exact: 'EXACT', yok: 'YOK', yabanci: 'YABANCI', kismi: 'KISMI', karisik: 'YABANCI', belirsiz: 'BELIRSIZ' });
      if (process.platform === 'win32') { expect(o.gercekOk).toBe(true); } else { expect(o.gercekOk).toBe(false); expect(o.gercekNotBos).toBe(true); }
    });
  });

  describe.each(['api', 'web'])('%s: uctan uca karar yolu', (h) => {
    it('dogru cocuk dinliyor: STARTED bu pid, cikis kodu aynen, belirsizlik yok', () => {
      const r = kos(h, 'cocuk', { sure: 3, kod: 0 });
      expect(r.exit).toBe(0);
      expect(r.log).toContain('launcher begin (R02 F02-K1)');
      expect(r.log).toContain(`pid=${cocukPid(r.root)}`);
      expect(r.log).toMatch(/STARTED port=48123 pid=\d+/);
      expect(r.log).not.toMatch(/BIND_UNCERTAIN|PORT_BIND_TIMEOUT|child tree terminated/);
      expect(kilitYok(r.root)).toBe(true);
    });

    it('spawn oncesi sorgu hatasi: cikis 26, cocuk BASLATILMAZ, kilit birakilir', () => {
      const r = kos(h, 'hata');
      expect(r.exit).toBe(26);
      expect(r.log).toContain('LISTENER_QUERY_UNCERTAIN(pre-spawn)');
      expect(r.log).not.toContain('child spawned');
      expect(kilitYok(r.root)).toBe(true);
    });

    it('spawn sonrasi yabanci dinleyici: STARTED yok, kesin olcumle kendi cocugu sonlanir, cikis 16', () => {
      const r = kos(h, 'yabanci-sonra', { sure: 120 });
      expect(r.exit).toBe(16);
      expect(r.log).toContain('bind state YABANCI pid=424242');
      expect(r.log).not.toMatch(/STARTED port=/);
      expect(r.log).toContain('child tree terminated');
      expect(yasiyor(cocukPid(r.root))).toBe(false);
    });

    it('sorgu hatasi bind penceresinde: cocuk SONLANDIRILMAZ, iyilesince STARTED', async () => {
      const a = arkada(h, 'sonra-hata', { bind: 2, sure: 14, kod: 0 });
      await bekle(() => gunluk(a.root).includes('BIND_UNCERTAIN after'), 40_000, 'BIND_UNCERTAIN');
      await new Promise((r) => setTimeout(r, 2500));
      const p = cocukPid(a.root);
      expect(yasiyor(p)).toBe(true);
      expect(gunluk(a.root)).not.toMatch(/STARTED port=|child tree terminated/);
      expect(kilitYok(a.root)).toBe(false);
      fs.writeFileSync(path.join(a.root, 'mod.txt'), 'cocuk');
      await bekle(() => gunluk(a.root).includes(`STARTED port=48123 pid=${p}`), 20_000, 'STARTED');
      expect(await a.bitti).toBe(0);
      expect(gunluk(a.root)).not.toContain('PORT_BIND_TIMEOUT');
      expect(kilitYok(a.root)).toBe(true);
    });

    it('tek aile gorunuyor: KISMI, cocuk SONLANDIRILMAZ, STARTED yazilmaz', () => {
      const r = kos(h, 'kismi', { bind: 2, sure: 6, kod: 0 });
      expect(r.exit).toBe(0);
      expect(r.log).toContain('bind state KISMI eksik aile=V6');
      expect(r.log).toMatch(/BIND_UNCERTAIN after .*last=KISMI/);
      expect(r.log).not.toMatch(/STARTED port=|child tree terminated/);
    });
  });

  describe('api: kalan durumlar', () => {
    it('spawn oncesi yabanci dinleyici: cikis 12, cocuk baslatilmaz', () => {
      const r = kos('api', 'yabanci');
      expect(r.exit).toBe(12);
      expect(r.log).toMatch(/PORT_IDENTITY_CONFLICT identity=\w+ pid=424242/);
      expect(r.log).not.toContain('child spawned');
    });

    it('yalniz kurulu baglanti (sinifta satir yok): YOK, kesin olcumle cikis 16', () => {
      const r = kos('api', 'yok', { sure: 120 });
      expect(r.exit).toBe(16);
      expect(r.log).toContain('bind state YOK');
      expect(r.log).toContain('PORT_BIND_TIMEOUT');
      expect(r.log).not.toContain('BIND_UNCERTAIN');
    });

    it('diger ailede yabanci: kabul edilmez, cikis 16', () => {
      const r = kos('api', 'karisik', { sure: 120 });
      expect(r.exit).toBe(16);
      expect(r.log).toContain('bind state YABANCI pid=424242');
      expect(r.log).not.toMatch(/STARTED port=/);
    });

    it('cocuk erken cikar: kod aynen, sonlandirma yok', () => {
      const r = kos('api', 'cocuk', { sure: 0, kod: 7 });
      expect(r.exit).toBe(7);
      expect(r.log).not.toContain('child tree terminated');
    });

    it('belirsizlikte cocuk kendi cikar: kod aynen, sonlandirma yok', () => {
      const r = kos('api', 'sonra-hata', { bind: 2, sure: 6, kod: 5 });
      expect(r.exit).toBe(5);
      expect(r.log).toContain('child exit code=5 after bind uncertainty (EXITED)');
      expect(r.log).not.toMatch(/STARTED port=|child tree terminated/);
    });

    it('sorgu iyilesir ama cocuk dinlemiyor: yalniz ardisik kesin olcumle sonlanir, cikis 16', async () => {
      const a = arkada('api', 'sonra-hata', { bind: 2, sure: 120 });
      await bekle(() => gunluk(a.root).includes('BIND_UNCERTAIN after'), 40_000, 'BIND_UNCERTAIN');
      expect(yasiyor(cocukPid(a.root))).toBe(true);
      fs.writeFileSync(path.join(a.root, 'mod.txt'), 'yok');
      expect(await a.bitti).toBe(16);
      expect(gunluk(a.root)).toMatch(/NOT_BOUND state=YOK .*samples=2/);
      expect(gunluk(a.root)).toContain('child tree terminated');
      expect(yasiyor(cocukPid(a.root))).toBe(false);
    });

    it('belirsizlikte host olur: cocuk geride kalmaz', async () => {
      const uyuyan = spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { stdio: 'ignore' });
      sonlandir.push(uyuyan);
      await new Promise((r) => setTimeout(r, 400));
      const a = arkada('api', 'sonra-hata', { bind: 2, sure: 120 }, { HL_HOST_PID: String(uyuyan.pid) });
      await bekle(() => gunluk(a.root).includes('BIND_UNCERTAIN after'), 40_000, 'BIND_UNCERTAIN');
      const p = cocukPid(a.root);
      expect(yasiyor(p)).toBe(true);
      uyuyan.kill();
      await a.bitti;
      expect(gunluk(a.root)).toContain('host exited - killing exact-owned child tree');
      expect(yasiyor(p)).toBe(false);
      expect(gunluk(a.root)).not.toMatch(/STARTED port=/);
    });
  });
});
