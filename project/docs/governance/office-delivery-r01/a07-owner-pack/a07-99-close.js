/*
 * A-07 OWNER PAKETI — 99 KAPANIS / KURTARMA (TEK BASINA CALISIR)
 *
 * Owner GO'su: "KAPANIS (basarisizlikta DA, finally/recovery yolunda): bayragi kapat ·
 * API'yi yeniden baslat · sentetik erisimi revoke et · UCUNU DE DOGRULA."
 *
 * TEK BASINA calisir: kosum ortasinda surec olurse, terminal kapanirsa veya `finally`
 * hic calismazsa owner BU BETIGI TEK BASINA kosar. Durum dosyasina IHTIYAC DUYMAZ —
 * her seyi tenant slug'indan ve DOSYADAKI GERCEKTEN turetir.
 *
 * F04 DERSI: kapatma karari CIKIS KODUNA veya bellekteki bir bayrak degiskenine DEGIL,
 * OLCUME dayanir. "Acmadim, o halde kapatmama gerek yok" VARSAYILMAZ.
 *
 * --dry-run : hicbir sey degistirmez; yapacagi islerin yapilabilir oldugunu DOGRULAR.
 */
'use strict';
const path = require('path');
const fs = require('fs');

const HERE = __dirname;
const SCRIPTS = path.resolve(HERE, '..', 'scripts');
const L = require(path.join(SCRIPTS, 'ow-lib'));
const SVC = require(path.join(SCRIPTS, 'ow-service'));
const DEPS = require('./a07-deps');
// Kurtarma betigi HER ORTAMDA calisabilmeli: bagimlilik yolu sabit gomulu DEGIL.
DEPS.resolveAll();

const DRY = process.argv.includes('--dry-run');
const SLUG = process.env.A07_TENANT_SLUG || 'off-acc-f851d975';

(async () => {
  const R = L.makeRecorder(DRY ? 'A-07 KAPANIS (KURU KOSUM)' : 'A-07 KAPANIS');
  const base = L.requireEnv('OW_API_BASE_URL').replace(/\/+$/, '');
  L.assertRunEnvironment();
  L.assertOwnSlug(SLUG);

  let failure = null;

  // ── 1) BAYRAK: dosyadaki GERCEGE bak ──
  L.step('CL-1', 'bayrak durumu OLCULUYOR (varsayim yok)');
  const before = SVC.readFlagFile();
  L.log(`      dosyada enabled=${before.enabled} · satir var mi=${before.present} · ${before.path}`);

  if (DRY) {
    let writable = false; let err = '';
    try { const fd = fs.openSync(before.path, 'r+'); fs.closeSync(fd); writable = true; }
    catch (e) { err = (e && e.code) || String(e); }
    R.ok('CL-1.dry', 'EnvFile YAZILABILIR (kapatma yapilabilir) — degisiklik YOK',
      writable, writable ? 'r+ acildi/kapatildi' : `YAZILAMAZ (${err})`);
  } else if (before.enabled) {
    L.step('CL-2', 'bayrak KAPATILIYOR + API yeniden baslatiliyor');
    SVC.setFlagFile(false);
    try {
      const r = await SVC.restartApiAndVerify(base, { label: 'KAPANIS-RESTART' });
      R.ok('CL-2.restart', 'API yeniden baslatildi ve TOPARLANDI (PID degisti + istek isliyor)',
        true, `PID ${r.oldPid} -> ${r.newPid} · hazir ${r.readyMs} ms`);
    } catch (e) {
      failure = `restart/toparlanma BASARISIZ: ${e && e.message}`;
      R.ok('CL-2.restart', 'API yeniden baslatildi ve TOPARLANDI', false, failure);
    }
  } else {
    R.ok('CL-2.noop', 'bayrak zaten KAPALI — kapatilacak bir sey yok', true, 'dosyada satir yok/false');
  }

  // ── 3) SENTETIK ERISIM: revoke ──
  const prisma = L.loadPrisma();
  let adminEmail = null;
  try {
    const t = await prisma.tenant.findFirst({ where: { slug: SLUG }, select: { id: true } });
    if (!t) {
      R.ok('CL-3.tenant', 'sentetik tenant bulundu', false, `slug=${SLUG} YOK`);
      failure = failure || 'tenant bulunamadi';
    } else {
      await L.assertOwnTenant(prisma, t.id); // G-2
      const T = { tenantId: t.id };
      const users = await prisma.user.findMany({ where: T, select: { id: true, email: true, role: true, isActive: true } });
      const active = users.filter((u) => u.isActive);
      adminEmail = (users.find((u) => u.role === 'ADMIN') || {}).email || null;

      if (DRY) {
        R.ok('CL-3.dry', 'revoke edilecek satirlar OLCULDU (degisiklik YOK)', true,
          `toplam=${users.length} · su an aktif=${active.length}`);
      } else if (active.length) {
        L.step('CL-3', 'sentetik erisim IPTAL ediliyor (kanit satirlarina DOKUNULMAZ)');
        for (const u of active) {
          await prisma.user.update({
            where: { id: u.id },
            data: { isActive: false, tokenVersion: { increment: 1 } },
          });
        }
        const after = await prisma.user.findMany({ where: T, select: { isActive: true } });
        const stillActive = after.filter((u) => u.isActive).length;
        R.ok('CL-3.revoke', 'sentetik User satirlari devre disi (mevcut JWT de gecersiz)',
          stillActive === 0, `iptal edilen=${active.length} · hala aktif=${stillActive}`);
        if (stillActive !== 0) failure = failure || 'erisim iptali dogrulanamadi';
      } else {
        R.ok('CL-3.noop', 'aktif sentetik kullanici YOK — erisim zaten kapali', true, `toplam=${users.length}`);
      }

      // Kanit satirlari KORUNDU mu
      const inv = {
        audit: await prisma.auditLog.count({ where: T }),
        approval: await prisma.officeApprovalRequest.count({ where: T }),
        history: await prisma.caseStatusHistory.count({ where: { case: { tenantId: t.id } } }),
      };
      R.ok('CL-4.preserve', 'audit / onay / yurutme izi kayitlari KORUNDU (silinmedi)',
        inv.approval >= 1, JSON.stringify(inv));
    }
  } catch (e) {
    failure = failure || `erisim iptali hatasi: ${e && e.message}`;
    R.ok('CL-3.revoke', 'sentetik erisim iptali', false, failure);
  } finally {
    await prisma.$disconnect().catch(() => {});
  }

  // ── 5) UCUNU DE UCTAN DOGRULA ──
  L.step('CL-5', 'UC KANIT uctan dogrulaniyor: bayrak KAPALI · erisim IPTAL · servis TOPARLANDI');
  const answering = await SVC.apiAnswering(base);
  R.ok('CL-5.service', 'servis TOPARLANDI (istek isliyor)', answering, `bos govde -> ${answering ? '400' : 'CEVAP YOK'}`);

  const flagNow = SVC.readFlagFile();
  R.ok('CL-5.flag', 'bayrak KAPALI (dosya duzeyi)', flagNow.enabled === false, `enabled=${flagNow.enabled}`);

  if (adminEmail && !DRY) {
    // Erisim IPTAL kaniti: login DENENIR ve 401 beklenir. Parola bilinmese de
    // "Hesabiniz devre disi birakilmis" yolu 401 doner; 200 gelirse IPTAL EDILMEMISTIR.
    const probe = await L.httpJson('POST', `${base}/auth/login`, {
      body: { email: adminEmail, password: 'A07-CLOSED-PROBE-not-a-secret', tenantSlug: SLUG },
      timeoutMs: 20000,
    });
    R.ok('CL-5.access', 'sentetik ADMIN login REDDEDILIYOR (erisim IPTAL)',
      probe.status === 401, `HTTP ${probe.status}${probe.status === 429 ? ' — rate-limit; IPTAL KANITI DEGIL' : ''}`);
    if (probe.status === 429) failure = failure || 'erisim iptali uctan dogrulanamadi (429)';
  }

  const sum = R.summary();
  if (DRY) {
    console.log('\nKURU KOSUM — hicbir sey degistirilmedi. Kapanis yolu ' + (sum.fail === 0 ? 'HAZIR.' : 'HAZIR DEGIL!'));
  } else if (sum.fail > 0 || failure) {
    console.error('\n!!! KAPANIS DOGRULANAMADI — ELLE MUDAHALE GEREKIR:');
    console.error(`    1) ${SVC.FLAG_KEY} satirini EnvFile'dan kaldirin: ${flagNow.path}`);
    console.error('    2) Restart-ScheduledTask -TaskName ' + SVC.TASK_NAME);
    console.error('    3) Bu betigi TEKRAR kosun (guvenlidir, idempotenttir).');
  }
  process.exitCode = (sum.fail === 0 && !failure) ? 0 : 1;
})().catch((e) => {
  console.error('\nKAPANIS HATASI:', e && e.stack ? e.stack : e);
  console.error('ELLE: EnvFile bayrak satirini kaldirin + Restart-ScheduledTask HukukPlatform-API');
  process.exitCode = 1;
});
