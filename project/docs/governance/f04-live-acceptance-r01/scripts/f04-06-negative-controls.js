/*
 * F04 CANLI KABUL — ADIM 6: NEGATIF KONTROLLER (YALNIZ DISPOSABLE ORTAM)
 *
 * Paketin YESIL vermesi tek basina yeterli degildir: bozuk durumlari GERCEKTEN reddettigini de
 * gostermek gerekir. Bu harness her senaryoyu bilerek uretir ve ilgili adimin FAIL/nonzero
 * dondurdugunu dogrular.
 *
 *   NC-1  yarida kesilen kurulum        -> atomiklik: HICBIR satir kalmaz
 *   NC-2  geciken kilit gozlemi (butce) -> A2 FAIL, kilit BIRAKILIR
 *   NC-3  basarisiz kilit gozlemi       -> "kilit yok" DEGIL, OLCULEMEDI + nonzero
 *   NC-4  on kosul saglanmiyor          -> posting BASLATILMAZ
 *   NC-5  cift/yanlis journal           -> verify V-2 FAIL
 *   NC-6  eksik audit                   -> verify V-6 FAIL
 *   NC-7  sayilamayan bildirim          -> "bildirim yok" DEGIL, OLCULEMEDI + nonzero
 *
 * ORTAM KAPISI: `F04_ENVIRONMENT=disposable` ZORUNLUDUR. Bu harness veri bozar ve tablo adi
 * degistirir; canli veritabaninda CALISTIRILAMAZ.
 */
'use strict';
const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');
const L = require('./f04-lib');

const HERE = __dirname;
const ENVIRONMENT = (process.env.F04_ENVIRONMENT || 'live').toLowerCase();

const results = [];
function rec(id, desc, expected, observed, ok) {
  results.push({ id, desc, ok, expected, observed });
  console.log(`  ${ok ? 'OK  ' : 'FAIL'} ${id.padEnd(5)} ${desc}\n         beklenen=${expected}\n         gozlenen=${observed}`);
}

function run(script, env, extra = {}) {
  const r = spawnSync(process.execPath, [path.join(HERE, script)], {
    env: { ...process.env, ...env }, encoding: 'utf8', timeout: 180000, ...extra,
  });
  return { code: r.status, out: `${r.stdout || ''}${r.stderr || ''}` };
}

(async () => {
  if (ENVIRONMENT !== 'disposable') {
    throw new Error(`negatif kontroller YALNIZ disposable ortamda calisir (F04_ENVIRONMENT='${ENVIRONMENT}')`);
  }
  const password = L.requireLoginPassword();
  const dbUrl = L.requireEnv('F04_DATABASE_URL');
  const stateDir = path.dirname(process.env.F04_STATE_FILE || path.join(process.cwd(), 'f04-state.json'));
  const prisma = L.loadPrisma();

  const purgeEnv = (stateFile) => ({
    F04_STATE_FILE: stateFile, F04_TEARDOWN_MODE: 'purge',
    F04_ENVIRONMENT: 'disposable', F04_CONFIRM_PURGE: 'YES-DELETE-SYNTHETIC-F04-TENANT',
  });

  try {
    // ── NC-1: yarida kesilen kurulum → atomiklik ──
    console.log('\n[NC-1] yarida kesilen kurulum (F04_ABORT_AFTER=CaseClient)');
    const abortRunId = require('crypto').randomBytes(4).toString('hex');
    const nc1State = path.join(stateDir, 'nc1-state.json');
    const r1 = run('f04-01-setup.js', {
      F04_STATE_FILE: nc1State, F04_RUN_ID: abortRunId, F04_ABORT_AFTER: 'CaseClient',
    });
    const leftover = await prisma.tenant.findFirst({ where: { slug: `f04-acc-${abortRunId}` }, select: { id: true } });
    rec('NC-1', 'kurulum yarida kesilirse HICBIR satir kalmaz (atomiklik)',
      'setup nonzero + tenant OLUSMAZ + durum dosyasi yazilmaz',
      `exit=${r1.code} · tenant=${leftover ? 'KALDI (!!)' : 'YOK'} · state=${fs.existsSync(nc1State) ? 'YAZILDI (!!)' : 'yazilmadi'}`,
      r1.code !== 0 && !leftover && !fs.existsSync(nc1State));

    // Her senaryo KENDI tenant'ini kurar: bir A2 kosumu (butce dolsa bile) posting'i tetikleyip
    // dispositionu POSTED yapabilir; ortak taban kullanilirsa sonraki senaryonun on kosulu bozulur
    // (provada bizzat gozlendi — NC-3 bu yuzden yanlislikla FAIL vermisti).
    const created = [];
    const freshTenant = (tag) => {
      const f = path.join(stateDir, `nc-${tag}-state.json`);
      if (fs.existsSync(f)) fs.unlinkSync(f);
      const r = run('f04-01-setup.js', { F04_STATE_FILE: f, F04_LOGIN_PASSWORD: password });
      if (r.code !== 0) throw new Error(`'${tag}' kurulumu basarisiz:\n${r.out.slice(-800)}`);
      created.push(f);
      return f;
    };

    // ── NC-2: geciken kilit gozlemi (ortak butce dolar) ──
    console.log('\n[NC-2] geciken kilit gozlemi - ortak butce 1 ms (kendi tenant)');
    const nc2State = freshTenant('nc2');
    const r2 = run('f04-02-a2-race.js', {
      F04_STATE_FILE: nc2State, F04_LOGIN_PASSWORD: password, F04_LOCK_BUDGET_MS: '1',
    });
    const budgetMsg = /butce doldu/i.test(r2.out);
    const leak2 = await prisma.$queryRawUnsafe(
      `SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname = current_database()
        AND state = 'idle in transaction' AND state_change < now() - interval '10 seconds'`,
    );
    rec('NC-2', 'butce dolarsa A2 FAIL eder ve kilit BIRAKILIR',
      'nonzero cikis + "butce doldu" + kilit sizintisi 0',
      `exit=${r2.code} · butceMesaji=${budgetMsg} · sizinti=${leak2[0].n}`,
      r2.code !== 0 && budgetMsg && leak2[0].n === 0);

    // ── NC-3: basarisiz kilit gozlemi → OLCULEMEDI (kilit "yok" DEGIL) ──
    console.log('\n[NC-3] basarisiz kilit gozlemi — gozlem baglantisi gecersiz');
    const nc3State = freshTenant('nc3');
    const r3 = run('f04-02-a2-race.js', {
      F04_STATE_FILE: nc3State, F04_LOGIN_PASSWORD: password,
      F04_OBSERVER_DATABASE_URL: 'postgresql://nobody:nobody@127.0.0.1:1/does_not_exist?schema=public',
    });
    const unmeasuredMsg = /OLCULEMEDI/.test(r3.out) && /ZORUNLU OLCUM YAPILAMADI/.test(r3.out);
    const noFalseNegative = !/kilit SIZINTISI yok/.test(r3.out) || /OLCULEMEDI/.test(r3.out);
    rec('NC-3', 'gozlem hatasi "kilit yok"a DONUSTURULMEZ',
      'nonzero cikis + OLCULEMEDI ibaresi + yanlis "yok" iddiasi YOK',
      `exit=${r3.code} · olculemediIbaresi=${unmeasuredMsg} · yanlisYokIddiasi=${!noFalseNegative}`,
      r3.code !== 0 && unmeasuredMsg && noFalseNegative);

    // ── Pozitif kosum: NC-5..NC-7 icin gercek finansal ayak izi uret ──
    console.log('\n[TABAN] A2 pozitif kosumu (finansal ayak izi uretiliyor)');
    const baseState = freshTenant('base');
    const st = JSON.parse(fs.readFileSync(baseState, 'utf8'));
    console.log(`         taban tenant: ${st.slug}`);
    const rp = run('f04-02-a2-race.js', { F04_STATE_FILE: baseState, F04_LOGIN_PASSWORD: password });
    if (rp.code !== 0) throw new Error(`taban A2 basarisiz:\n${rp.out.slice(-1200)}`);
    const rv = run('f04-03-verify.js', { F04_STATE_FILE: baseState, F04_LOGIN_PASSWORD: password });
    rec('NC-0', 'bozulmamis kosum verify PASS verir (pozitif taban)',
      'exit=0', `exit=${rv.code}`, rv.code === 0);

    // ── NC-4: on kosul saglanmiyor → posting BASLATILMAZ ──
    console.log('\n[NC-4] on kosul saglanmiyor (disposition zaten POSTED)');
    const beforeJournals = await prisma.accountingJournalEntry.count({ where: { tenantId: st.tenantId } });
    const r4 = run('f04-02-a2-race.js', { F04_STATE_FILE: baseState, F04_LOGIN_PASSWORD: password });
    const afterJournals = await prisma.accountingJournalEntry.count({ where: { tenantId: st.tenantId } });
    const notStarted = /ON KOSUL SAGLANMADI/.test(r4.out) && !/A2-3/.test(r4.out);
    rec('NC-4', 'on kosul FAIL ise posting BASLATILMAZ',
      'nonzero cikis + "ON KOSUL SAGLANMADI" + journal sayisi DEGISMEZ',
      `exit=${r4.code} · postingBaslatilmadi=${notStarted} · journal ${beforeJournals}→${afterJournals}`,
      r4.code !== 0 && notStarted && beforeJournals === afterJournals);

    // ── NC-5: cift/yanlis journal → verify V-2 FAIL ──
    console.log('\n[NC-5] fazladan/yanlis journal enjekte ediliyor');
    // ONCE urunun KENDI korumasini olc: ayni kaynak icin ikinci `posted` journal
    // `@@unique([tenantId, sourceType, sourceId, sourceAction])` ile DB seviyesinde ENGELLENIR.
    let dbGuardBlocked = false;
    try {
      await prisma.accountingJournalEntry.create({
        data: {
          tenantId: st.tenantId, entryType: 'COLLECTION_DISTRIBUTION_POSTED',
          sourceType: 'COLLECTION_DISPOSITION_LINE', sourceId: st.lineId, sourceAction: 'posted',
          idempotencyKey: `nc5-exact-duplicate-${Date.now()}`, metadata: { negativeControl: true },
        },
        select: { id: true },
      });
    } catch (e) {
      dbGuardBlocked = /Unique constraint/i.test(String(e && e.message));
    }
    console.log(`         urun korumasi (ayni kaynakta ikinci 'posted' journal): `
      + `${dbGuardBlocked ? 'DB SEVIYESINDE ENGELLENDI' : 'ENGELLENMEDI (!!)'}`);

    // Sonra V-2'nin FAZLADAN journal'i yakaladigini goster: farkli kaynak, ayni tur.
    const dup = await prisma.accountingJournalEntry.create({
      data: {
        tenantId: st.tenantId, entryType: 'COLLECTION_DISTRIBUTION_POSTED',
        sourceType: 'COLLECTION_DISPOSITION_LINE', sourceId: st.dispositionId, sourceAction: 'posted',
        idempotencyKey: `nc5-extra-${Date.now()}`, metadata: { negativeControl: true },
      },
      select: { id: true },
    });
    const r5 = run('f04-03-verify.js', { F04_STATE_FILE: baseState, F04_LOGIN_PASSWORD: password });
    const v2Fail = /FAIL\s+V-2/.test(r5.out);
    await prisma.accountingJournalEntry.delete({ where: { id: dup.id } });
    rec('NC-5', 'fazladan/yanlis journal V-2 ile REDDEDILIR',
      'nonzero cikis + V-2 FAIL (ayrica ayni kaynakta cift journal DB ile engellenir)',
      `exit=${r5.code} · V-2 FAIL=${v2Fail} · DB unique korumasi=${dbGuardBlocked ? 'CALISTI' : 'CALISMADI'}`,
      r5.code !== 0 && v2Fail && dbGuardBlocked);

    // ── NC-6: eksik audit → verify V-6 FAIL ──
    console.log('\n[NC-6] audit kaydi siliniyor');
    const auditRows = await prisma.auditLog.findMany({ where: { tenantId: st.tenantId }, select: { id: true } });
    const savedAudit = await prisma.auditLog.findMany({ where: { tenantId: st.tenantId } });
    await prisma.auditLog.deleteMany({ where: { tenantId: st.tenantId } });
    const r6 = run('f04-03-verify.js', { F04_STATE_FILE: baseState, F04_LOGIN_PASSWORD: password });
    const v6Fail = /FAIL\s+V-6/.test(r6.out);
    for (const a of savedAudit) {
      const { id, ...rest } = a;
      await prisma.auditLog.create({ data: { id, ...rest } }).catch(() => {});
    }
    const restored = await prisma.auditLog.count({ where: { tenantId: st.tenantId } });
    rec('NC-6', 'eksik audit V-6 ile REDDEDILIR',
      'nonzero cikis + V-6 FAIL', `exit=${r6.code} · V-6 FAIL=${v6Fail} · audit geri yuklendi ${restored}/${auditRows.length}`,
      r6.code !== 0 && v6Fail);

    // ── NC-7: sayilamayan bildirim → OLCULEMEDI (bildirim "yok" DEGIL) ──
    console.log('\n[NC-7] bildirim tablosu gecici olarak erisilemez kilaniyor');
    let renamed = false;
    try {
      await prisma.$executeRawUnsafe('ALTER TABLE "NotificationQueue" RENAME TO "NotificationQueue_nc7"');
      renamed = true;
      const r7 = run('f04-03-verify.js', { F04_STATE_FILE: baseState, F04_LOGIN_PASSWORD: password });
      const v9Unmeasured = /V-9/.test(r7.out) && /OLCULEMEDI/.test(r7.out);
      const noFalseClaim = !/OK\s+V-9/.test(r7.out);
      rec('NC-7', 'sayilamayan bildirim "bildirim yok"a DONUSTURULMEZ',
        'nonzero cikis + V-9 OLCULEMEDI + yanlis "yok" iddiasi YOK',
        `exit=${r7.code} · V-9 olculemedi=${v9Unmeasured} · yanlisYokIddiasi=${!noFalseClaim}`,
        r7.code !== 0 && v9Unmeasured && noFalseClaim);
    } finally {
      if (renamed) await prisma.$executeRawUnsafe('ALTER TABLE "NotificationQueue_nc7" RENAME TO "NotificationQueue"');
    }

    // ── temizlik: negatif kontrol tenant'i ──
    console.log('\n[TEMIZLIK] taban tenant purge ediliyor');
    for (const f of created) {
      const rc = run('f04-04-teardown.js', purgeEnv(f));
      console.log(`         ${path.basename(f)}: exit=${rc.code} · ${/TEMIZ/.test(rc.out) ? 'TEMIZ' : 'KALINTI OLABILIR'}`);
    }

    const okN = results.filter((r) => r.ok).length;
    console.log(`\nNEGATIF KONTROLLER: ${okN}/${results.length} ${okN === results.length ? 'PASS' : 'FAIL'}`);
    console.log(JSON.stringify({
      record: 'F04-NEGATIVE-CONTROLS', environment: ENVIRONMENT,
      result: `${okN}/${results.length}`,
      cases: results.map((r) => ({ id: r.id, ok: r.ok })),
    }, null, 1));
    process.exitCode = okN === results.length ? 0 : 2;
  } finally {
    await prisma.$disconnect().catch(() => {});
  }
})().catch((e) => { console.error('\nNEGATIF KONTROL HATASI:', e && e.stack ? e.stack : e); process.exitCode = 1; });
