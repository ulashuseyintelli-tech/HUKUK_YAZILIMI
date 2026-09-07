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
    // ── NC-8: BELIRSIZ HTTP sonucu → tamamlanma kaniti yoksa BELIRSIZ kalir, POST TEKRARLANMAZ ──
    console.log('\n[NC-8] belirsiz HTTP sonucu (istemci timeout 1 ms)');
    const nc8State = freshTenant('nc8');
    const r8 = run('f04-02-a2-race.js', {
      F04_STATE_FILE: nc8State, F04_LOGIN_PASSWORD: password,
      // Istek sunucuya ULASIP kilitte beklesin, sonra istemci tarafi abort etsin:
      // kilit butcesinden KISA ama baglanti kurulacak kadar UZUN.
      // Kilit ~3.1 s tutulur; istemci 800 ms'de abort eder. Boylece istek SUNUCUYA ULASIR,
      // kilitte BEKLER ve istemci tarafi kesilir -> sunucu islemi DEVAM EDER (belirsiz sonuc).
      F04_POSTING_TIMEOUT_MS: '800',
      F04_LOCK_BUDGET_MS: '3500', F04_MIN_HOLD_AFTER_OBSERVE_MS: '3000',
    });
    const noResend = /tekrar gonderim=YOK/.test(r8.out) || /TEKRAR GONDERILMEDI/.test(r8.out);
    const noFalseNegative8 = !/GERCEKLESMEDI/.test(r8.out);
    const indeterminateHandled = /BELIRSIZ/.test(r8.out);
    rec('NC-8', 'belirsiz sonuc BELIRSIZ birakilir; POST TEKRARLANMAZ',
      'BELIRSIZ isaretlenir + tekrar gonderim YOK + "gerceklesmedi" iddiasi YOK',
      `exit=${r8.code} · belirsizIsaretlendi=${indeterminateHandled} · tekrarYok=${noResend}`
      + ` · yanlisGerceklesmediIddiasi=${!noFalseNegative8}`,
      indeterminateHandled && noResend && noFalseNegative8);

    // ── NC-9: A2 basarisiz olsa da erisim `finally` ile KAPANIR (tek yurutucu) ──
    console.log('\n[NC-9] tek yurutucu: A2 basarisiz olsa da erisim kapanir');
    const nc9State = path.join(stateDir, 'nc-nc9-state.json');
    if (fs.existsSync(nc9State)) fs.unlinkSync(nc9State);
    const r9 = run('f04-run.js', {
      F04_STATE_FILE: nc9State, F04_LOGIN_PASSWORD: password, F04_LOCK_BUDGET_MS: '1',
    });
    if (fs.existsSync(nc9State)) {
      const s9 = JSON.parse(fs.readFileSync(nc9State, 'utf8'));
      created.push(nc9State);
      const t9 = await prisma.tenant.findFirst({ where: { slug: s9.slug }, select: { id: true } });
      const active9 = t9 ? await prisma.user.count({ where: { tenantId: t9.id, isActive: true } }) : -1;
      const journals9 = t9 ? await prisma.accountingJournalEntry.count({ where: { tenantId: t9.id } }) : -1;
      rec('NC-9', 'A2 basarisiz olsa da erisim `finally` ile KAPANIR',
        'kosum nonzero + aktif kullanici 0 + finansal kanit yerinde',
        `exit=${r9.code} · aktifKullanici=${active9} · journal=${journals9}`,
        r9.code !== 0 && active9 === 0);
    } else {
      rec('NC-9', 'A2 basarisiz olsa da erisim `finally` ile KAPANIR',
        'durum dosyasi olusur ve hesap kapanir', `exit=${r9.code} · durum dosyasi YOK`, false);
    }

    // ── NC-10: durum dosyasi kaybolsa bile runId ile kurtarilip hesap KAPATILIR ──
    console.log('\n[NC-10] durum dosyasi silindi -> runId ile kurtarma + kapatma');
    const nc10State = freshTenant('nc10');
    const s10 = JSON.parse(fs.readFileSync(nc10State, 'utf8'));
    fs.unlinkSync(nc10State); // durum dosyasi KAYBOLDU
    const rec10 = run('f04-00-recover-state.js', { F04_STATE_FILE: nc10State, F04_RUN_ID: s10.runId }).code;
    const rev10 = run('f04-04-teardown.js', {
      F04_STATE_FILE: nc10State, F04_LOGIN_PASSWORD: password, F04_TEARDOWN_MODE: 'revoke-access',
    }).code;
    const t10 = await prisma.tenant.findFirst({ where: { slug: s10.slug }, select: { id: true } });
    const active10 = t10 ? await prisma.user.count({ where: { tenantId: t10.id, isActive: true } }) : -1;
    rec('NC-10', 'durum dosyasi kaybolsa da runId ile kurtarilip hesap KAPATILIR',
      'kurtarma exit 0 + revoke exit 0 + aktif kullanici 0',
      `kurtarma=${rec10} · revoke=${rev10} · aktifKullanici=${active10} · runId=${s10.runId}`,
      rec10 === 0 && rev10 === 0 && active10 === 0);

    // ── NC-11: envanter olculemese bile hesap KAPATILIR; kapanis dogrulanamazsa EKSIK ──
    console.log('\n[NC-11] envanter olcum hatasi -> kapatma engellenmez, eksik raporlanir');
    const nc11State = freshTenant('nc11');
    const s11 = JSON.parse(fs.readFileSync(nc11State, 'utf8'));
    let renamed11 = false;
    let r11 = null;
    try {
      await prisma.$executeRawUnsafe('ALTER TABLE "AuditLog" RENAME TO "AuditLog_nc11"');
      renamed11 = true;
      r11 = run('f04-04-teardown.js', {
        F04_STATE_FILE: nc11State, F04_LOGIN_PASSWORD: password, F04_TEARDOWN_MODE: 'revoke-access',
      });
    } finally {
      if (renamed11) await prisma.$executeRawUnsafe('ALTER TABLE "AuditLog_nc11" RENAME TO "AuditLog"');
    }
    const t11 = await prisma.tenant.findFirst({ where: { slug: s11.slug }, select: { id: true } });
    const active11 = t11 ? await prisma.user.count({ where: { tenantId: t11.id, isActive: true } }) : -1;
    const reportedIncomplete = !!(r11 && /DOGRULANAMADI|EKSIK/.test(r11.out));
    rec('NC-11', 'envanter olculemese de hesap KAPATILIR, kapanis EKSIK raporlanir',
      'aktif kullanici 0 + "DOGRULANAMADI/EKSIK" ibaresi + nonzero cikis',
      `exit=${r11 && r11.code} · aktifKullanici=${active11} · eksikRaporlandi=${reportedIncomplete}`,
      active11 === 0 && reportedIncomplete && !!r11 && r11.code !== 0);

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
