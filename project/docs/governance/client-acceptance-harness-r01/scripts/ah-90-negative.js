/*
 * CLIENT KABUL ALTYAPISI (İ1a) — NEGATİF KONTROLLER
 *
 * Pozitif koşum "her şey yolundayken çalıştığını" gösterir; bu betik **korumaların gerçekten
 * kapandığını** gösterir. Her senaryo ayrı bir alt süreçte koşar ve iki şey birden ölçülür:
 * beklenen RET **ve** kalıcı durumda yazma OLMADIĞI.
 *
 * Ölçülen korumalar:
 *   NC-1..NC-5  G-0 ortam kapısı — üretim benzeri bağlantı, allowlist dışı port/ad, loopback
 *               olmayan API, çözümlenemeyen URL → **yazma BAŞLAMAZ**
 *   NC-6        Yarıda kesilen kurulum ATOMİK geri alınır (yetim kayıt yok)
 *   NC-7        Yasak/başka-programa ait tenant slug'ı → G-1 reddi
 *   NC-8        Sır alanı durum dosyasına yazılamaz → G-4 reddi
 *   NC-9        Durum dosyası kaybolursa koşum `runId` ile bulunur ve güvenle sonlandırılır
 *
 * Bu betik ÖLÇÜM yapar; ürün kodunu değiştirmez.
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const L = require('./ah-lib');

const results = [];
function chk(id, desc, ok, observed) {
  results.push({ id, desc, ok, observed });
  console.log(`  ${ok ? 'OK  ' : 'FAIL'} ${id.padEnd(6)} ${desc}\n         ${observed}`);
}

function run(file, env, args) {
  const r = spawnSync(process.execPath, [path.join(__dirname, file), ...(args || [])], {
    env, encoding: 'utf8', cwd: process.cwd(),
  });
  return { code: r.status, out: `${r.stdout || ''}${r.stderr || ''}` };
}

(async () => {
  L.assertDisposableEnvironment(); // bu betiğin KENDİ ortamı da disposable olmalı
  const goodDb = L.requireEnv('AH_DATABASE_URL');
  const goodApi = L.requireEnv('AH_API_BASE_URL');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ah-neg-'));

  const prisma = L.loadPrisma();
  try {
    L.step('NC', 'negatif kontroller — korumalar gercekten kapaniyor mu?');

    const tenantsBefore = await prisma.tenant.count();
    const usersBefore = await prisma.user.count();
    const baseEnv = {
      ...process.env,
      AH_LOGIN_PASSWORD: 'Ah!negative-control-only-9z',
      AH_STATE_FILE: path.join(tmp, 'state.json'),
      AH_SMTP_CAPTURE: path.join(tmp, 'capture'),
    };

    // ── NC-1..NC-5: G-0 ORTAM KAPISI ──
    const envCases = [
      ['NC-1', 'uretim benzeri UZAK veritabani host\'u',
        { AH_DATABASE_URL: 'postgresql://u:p@10.0.0.5:5439/hukuk_fix1_test' }, 'loopback DEGIL'],
      ['NC-2', 'allowlist DISI port (5432)',
        { AH_DATABASE_URL: 'postgresql://u:p@127.0.0.1:5432/hukuk_fix1_test' }, 'allowlist'],
      ['NC-3', 'allowlist DISI veritabani adi',
        { AH_DATABASE_URL: 'postgresql://u:p@127.0.0.1:5439/hukuk_prod' }, 'allowlist'],
      ['NC-4', 'loopback OLMAYAN API kokü',
        { AH_API_BASE_URL: 'http://192.168.1.50:8080' }, 'loopback DEGIL'],
      ['NC-5', 'cozumlenemeyen baglanti dizesi (ortam BELIRSIZ)',
        { AH_DATABASE_URL: 'bu-bir-url-degil' }, 'BELIRSIZ'],
    ];
    for (const [id, desc, override, expectFragment] of envCases) {
      const env = { ...baseEnv, AH_DATABASE_URL: goodDb, AH_API_BASE_URL: goodApi, ...override };
      const r = run('ah-01-setup.js', env);
      const tenantsNow = await prisma.tenant.count();
      const blocked = r.code !== 0 && /ORTAM KAPISI|G-0/.test(r.out);
      chk(id, `${desc} → YAZMA BASLAMAZ`,
        blocked && tenantsNow === tenantsBefore,
        `cikis ${r.code} · kapi mesaji=${blocked ? 'VAR' : 'YOK'} · tenant sayisi DEGISMEDI=`
        + `${tenantsNow === tenantsBefore} · beklenen gerekce "${expectFragment}"=`
        + `${new RegExp(expectFragment).test(r.out)}`);
    }

    // ── NC-6: YARIDA KESİLEN KURULUM ATOMİK GERİ ALINIR ──
    const abortRunId = L.newRunId();
    const rAbort = run('ah-01-setup.js', {
      ...baseEnv, AH_DATABASE_URL: goodDb, AH_API_BASE_URL: goodApi,
      AH_RUN_ID: abortRunId, AH_ABORT_AFTER: 'user',
    });
    const orphanTenant = await prisma.tenant.findFirst({
      where: { slug: `${L.TENANT_PREFIX}${abortRunId}` }, select: { id: true },
    });
    const orphanUsers = await prisma.user.count({
      where: { email: { endsWith: `-${abortRunId}@ah-harness.invalid` } },
    });
    chk('NC-6', 'yarida kesilen kurulum ATOMIK geri alinir (yetim kayit YOK)',
      rAbort.code !== 0 && !orphanTenant && orphanUsers === 0,
      `cikis ${rAbort.code} · yetim tenant=${orphanTenant ? 'VAR(!)' : 'YOK'} · yetim kullanici=${orphanUsers}`);

    // ── NC-7: YASAK SLUG ──
    let g1Blocked = false; let g1Note = '';
    try { L.assertOwnSlug('telli-hukuk'); g1Note = 'REDDEDILMEDI(!)'; }
    catch (e) { g1Blocked = /G-1/.test(e.message); g1Note = e.message.slice(0, 80); }
    let g1Blocked2 = false;
    try { L.assertOwnSlug('demo-firma'); }
    catch (e) { g1Blocked2 = /G-1/.test(e.message); }
    chk('NC-7', 'korunan/baska-programa ait tenant slug\'i REDDEDILIR',
      g1Blocked && g1Blocked2, `telli-hukuk → ${g1Note} · demo-firma reddedildi=${g1Blocked2}`);

    // ── NC-8: SIR ALANI DURUM DOSYASINA YAZILAMAZ ──
    const secretProbe = path.join(tmp, 'secret-state.json');
    const prevStateFile = process.env.AH_STATE_FILE;
    process.env.AH_STATE_FILE = secretProbe;
    let g4Blocked = false; let g4Note = '';
    try { L.saveState({ runId: 'deadbeef', password: 'gizli' }); g4Note = 'YAZILDI(!)'; }
    catch (e) { g4Blocked = /G-4/.test(e.message); g4Note = e.message.slice(0, 60); }
    let tokenBlocked = false;
    try { L.saveState({ runId: 'deadbeef', token: 'jwt...' }); }
    catch (e) { tokenBlocked = /G-4/.test(e.message); }
    if (prevStateFile) process.env.AH_STATE_FILE = prevStateFile; else delete process.env.AH_STATE_FILE;
    chk('NC-8', 'parola/token durum dosyasina YAZILAMAZ',
      g4Blocked && tokenBlocked && !fs.existsSync(secretProbe),
      `parola → ${g4Note} · token reddedildi=${tokenBlocked} · dosya olusmadi=${!fs.existsSync(secretProbe)}`);

    // ── NC-9: DURUM DOSYASI KAYBOLURSA KOŞUM runId İLE BULUNUR ──
    const liveRunId = L.newRunId();
    const stateFile = path.join(tmp, `state-${liveRunId}.json`);
    const setupEnv = {
      ...baseEnv, AH_DATABASE_URL: goodDb, AH_API_BASE_URL: goodApi,
      AH_RUN_ID: liveRunId, AH_STATE_FILE: stateFile,
    };
    // Hız sınırı dayanıklılığı: `login-rate-limit.guard.ts` IP başına 10 deneme/dakika uygular.
    // Bu betik NC-1..NC-8 boyunca login harcamaz, ama arka arkaya koşumlarda önceki koşumun
    // penceresi hâlâ dolu olabilir. Kurulum bu nedenle düşerse (429) pencere boşaltılıp BİR KEZ
    // tekrar denenir — ilk deneme zaten geri alındığı için slug yeniden kullanılabilir.
    // Sınır AŞILDIYSA pencere değil BLOK işler: `login-rate-limit.guard.ts:19` blok süresi
    // 5 dakikadır, yani sabit 60 sn beklemek YETMEZ. Sunucu kalan süreyi `retryAfter` ile
    // bildirir; kurulum onu mesajına yazar. Burada tahmin YERİNE o değer kullanılır.
    const PAUSE_MS = Number(process.env.AH_NEG_PAUSE_MS ?? 61000);
    const MAX_WAIT_MS = Number(process.env.AH_NEG_MAX_WAIT_MS ?? 360000);
    let rSetup = run('ah-01-setup.js', setupEnv);
    let retried = false;
    if (rSetup.code !== 0 && /hiz siniri/.test(rSetup.out) && PAUSE_MS > 0) {
      const m = rSetup.out.match(/~(\d+) sn sonra/);
      const waitMs = Math.min(m ? (Number(m[1]) + 5) * 1000 : PAUSE_MS, MAX_WAIT_MS);
      console.log(`  (NC-9: hiz siniri blogu aktif — sunucunun bildirdigi sure bekleniyor,`
        + ` ${(waitMs / 1000).toFixed(0)} sn)`);
      await new Promise((r) => setTimeout(r, waitMs));
      rSetup = run('ah-01-setup.js', setupEnv);
      retried = true;
    }
    let nc9ok = false;
    let nc9note = `kurulum cikis ${rSetup.code}${retried ? ' (hiz siniri sonrasi tekrar)' : ''}`
      + (rSetup.code !== 0
        ? ` — ${(rSetup.out.split('\n').filter((l) => /HATASI|DOGRULANAMADI/.test(l))[0] || '').trim().slice(0, 120)}`
        : '');
    if (rSetup.code === 0 && fs.existsSync(stateFile)) {
      fs.unlinkSync(stateFile); // durum dosyasını KAYBET
      const rRec = run('ah-00-recover.js', setupEnv);
      const recovered = rRec.code === 0 && fs.existsSync(stateFile);
      // Sonlandırma 6 login ister; V-1 kanıtı için hesapların HÂLÂ açık olması gerekir, bu yüzden
      // revoke tekrar çalıştırılamaz. Pencere ÖNCEDEN boşaltılır ki V-1/V-2 429'a düşmesin.
      if (PAUSE_MS > 0) {
        console.log(`  (NC-9: sonlandirma oncesi pencere bosaltiliyor, ${(PAUSE_MS / 1000).toFixed(0)} sn)`);
        await new Promise((r) => setTimeout(r, PAUSE_MS));
      }
      const rRev = run('ah-04-revoke.js', setupEnv);
      const activeLeft = await prisma.user.count({
        where: { email: { endsWith: `-${liveRunId}@ah-harness.invalid` }, isActive: true },
      });
      nc9ok = recovered && rRev.code === 0 && activeLeft === 0;
      const failedLines = rRev.out.split('\n')
        .filter((l) => /FAIL|OLCULEMEDI|BELIRSIZ/.test(l)).slice(0, 2)
        .map((l) => l.trim().slice(0, 150));
      nc9note = `kurtarma cikis ${rRec.code} · durum yeniden yazildi=${recovered}`
        + ` · sonlandirma cikis ${rRev.code} · acik kalan hesap=${activeLeft}`
        + (failedLines.length ? `\n         sonlandirma detayi: ${failedLines.join(' | ')}` : '');
    }
    chk('NC-9', 'durum dosyasi kaybolursa kosum runId ile BULUNUR ve GUVENLE sonlandirilir',
      nc9ok, nc9note);

    // ── NC-10: ORTAM DOĞRULANAMAZSA COMMIT EDİLEN KURULUM GERİ ALINIR ──
    // G-0 (env allowlist) GEÇER — hedef loopback'tir — ama o portta API YOKTUR. Kurulum bu yüzden
    // yazmayı COMMIT eder, sonra "API aynı veritabanına bağlı mı?" sorusunu yanıtlayamaz.
    // Beklenen: kalıcı yazma BIRAKILMAZ (tenant geri alınır) ve betik sıfırdan farklı çıkar.
    const deadRunId = L.newRunId();
    const rDead = run('ah-01-setup.js', {
      ...baseEnv, AH_DATABASE_URL: goodDb,
      AH_API_BASE_URL: 'http://127.0.0.1:8098/api', // loopback ama DINLEYICI YOK
      AH_RUN_ID: deadRunId,
    });
    const deadTenant = await prisma.tenant.findFirst({
      where: { slug: `${L.TENANT_PREFIX}${deadRunId}` }, select: { id: true },
    });
    const deadUsers = await prisma.user.count({
      where: { email: { endsWith: `-${deadRunId}@ah-harness.invalid` } },
    });
    chk('NC-10', 'ortam DOGRULANAMAZSA commit edilen kurulum GERI ALINIR',
      rDead.code !== 0 && !deadTenant && deadUsers === 0 && /GERI ALINIYOR/.test(rDead.out),
      `cikis ${rDead.code} · geri alma mesaji=${/GERI ALINIYOR/.test(rDead.out) ? 'VAR' : 'YOK'}`
      + ` · kalan tenant=${deadTenant ? 'VAR(!)' : 'YOK'} · kalan kullanici=${deadUsers}`);

    // ── Genel izolasyon: negatif kontroller komşu veriye dokunmadı ──
    const tenantsAfter = await prisma.tenant.count();
    const usersAfter = await prisma.user.count();
    const expectedNewTenants = 1; // yalnız NC-9'un koşumu kalır
    chk('NC-X', 'negatif kontroller BEKLENEN DISINDA kayit uretmedi',
      tenantsAfter - tenantsBefore === expectedNewTenants && usersAfter - usersBefore === 3,
      `tenant ${tenantsBefore}→${tenantsAfter} (beklenen +${expectedNewTenants}) · `
      + `kullanici ${usersBefore}→${usersAfter} (beklenen +3)`);

    const okN = results.filter((r) => r.ok).length;
    console.log(`\nNEGATIF KONTROLLER: ${okN}/${results.length} ${okN === results.length ? 'PASS' : 'FAIL'}`);
    console.log(JSON.stringify({
      record: 'AH-NEGATIVE-CONTROLS', result: `${okN}/${results.length}`, secretsPrinted: false,
    }, null, 1));
    process.exitCode = okN === results.length ? 0 : 2;
  } finally {
    await prisma.$disconnect().catch(() => {});
  }
})().catch((e) => { console.error('\nNEGATIF KONTROL HATASI:', e && e.message ? e.message : e); process.exitCode = 1; });
