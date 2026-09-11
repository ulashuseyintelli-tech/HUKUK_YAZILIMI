/*
 * OFFICE AK KABUL — DUZENEGIN KENDI NEGATIF KONTROLLERI (YALNIZ DISPOSABLE)
 *
 * Duzenegin kapilari ve karar fonksiyonlari, kabul adimlarinin TUKETTIGI AYNI kodla sinanir (kopya
 * mantik YOK). API gerekmez; DB kontrolleri disposable DB'de kendi `off-ak-<runId>` alanini kurar.
 *   NC-01..05  G-0: canli jetonsuz · GO ref bicimi · disposable+canli API portu · canli+test API portu ·
 *              allowlist disi DB adi/portu/host'u  -> hepsi YAZMADAN ONCE durur
 *   NC-06      G-1: off-acc-/cl-acc-/f04-acc-/ah- ve gercek slug'lar reddedilir
 *   NC-07      kesin ret: 401/400/500/belirsiz/yanlis kod RET SAYILMAZ; birebir 403 sayilir
 *   NC-08      G-4: sir alani sonuc dosyasina yazilamaz
 *   NC-09      bos gozlem kumesi "degismedi" SAYILMAZ (ObservationError)
 *   NC-10      goruntu karsilastirici tek alan degisimini YAKALAR (mutasyon kaniti), geri alinca esit
 *   NC-11      kapatma: bilinmeyen runId -> "alan YOK" aranarak olculur, yazma 0
 *   NC-12      kapatma: ikinci kosum alreadyClosed, yazma 0; tokenVersion bir kez artar
 *   NC-13      I-3 yabanci tenant sayi ozeti: kendi alani haric, yabanci tenant'taki ekleme yakalanir
 */
'use strict';
const L = require('./ak-lib');
const { closeByRunId } = require('./ak-99-close');

const results = [];
const rec = (id, desc, ok, observed) => { results.push({ id, desc, ok: !!ok, observed }); console.log(`  ${ok ? 'OK  ' : 'FAIL'} ${id} ${desc}\n       ${observed}`); };

function withEnv(over, fn) {
  const keys = Object.keys(over); const prev = {};
  for (const k of keys) { prev[k] = process.env[k]; if (over[k] === undefined) delete process.env[k]; else process.env[k] = over[k]; }
  try { return fn(); } finally { for (const k of keys) { if (prev[k] === undefined) delete process.env[k]; else process.env[k] = prev[k]; } }
}
function throwsGate(over) {
  try { withEnv(over, () => L.assertRunEnvironment()); return { threw: false, msg: 'KAPI GECILDI' }; }
  catch (e) { return { threw: e instanceof L.EnvironmentGateError, msg: e.message }; }
}

(async () => {
  const env = L.assertRunEnvironment();
  if (env.environment !== 'disposable') throw new Error('ak-negative YALNIZ disposable ortamda kosar');
  const DB = process.env.AK_DATABASE_URL;
  const LIVEDB = 'postgresql://x:y@127.0.0.1:5432/hukuk_db';

  console.log('\n[NC] G-0 ortam kapilari');
  let r = throwsGate({ AK_ENVIRONMENT: 'live', AK_CONFIRM_LIVE: undefined, AK_OWNER_GO_REF: 'OWNER-GO-OFFICE-AK-20260911-R01', AK_DATABASE_URL: LIVEDB, AK_API_BASE_URL: 'http://127.0.0.1:8080/api' });
  rec('NC-01', 'canli + jeton YOK -> durur', r.threw, r.msg);
  r = throwsGate({ AK_ENVIRONMENT: 'live', AK_CONFIRM_LIVE: L.LIVE_CONFIRM_TOKEN, AK_OWNER_GO_REF: 'OWNER-GO-OFFICE-A07-20260911-R01', AK_DATABASE_URL: LIVEDB, AK_API_BASE_URL: 'http://127.0.0.1:8080/api' });
  rec('NC-02', 'canli + GO ref bicimi yanlis -> durur', r.threw, r.msg);
  r = throwsGate({ AK_ENVIRONMENT: 'disposable', AK_DATABASE_URL: DB, AK_API_BASE_URL: 'http://127.0.0.1:8080/api' });
  rec('NC-03', 'disposable DB + CANLI API portu 8080 -> durur', r.threw, r.msg);
  r = throwsGate({ AK_ENVIRONMENT: 'live', AK_CONFIRM_LIVE: L.LIVE_CONFIRM_TOKEN, AK_OWNER_GO_REF: 'OWNER-GO-OFFICE-AK-20260911-R01', AK_DATABASE_URL: LIVEDB, AK_API_BASE_URL: 'http://127.0.0.1:8102/api' });
  rec('NC-04', 'canli DB + test API portu -> durur', r.threw, r.msg);
  const bad = [
    DB.replace('hukuk_office_ak_acc_test', 'hukuk_db'), DB.replace(':5441/', ':5432/'),
    DB.replace('127.0.0.1', '10.34.25.53'), 'postgresql://x:y@127.0.0.1:5439/hukuk_fix1_test',
  ];
  const badRes = bad.map((u) => throwsGate({ AK_ENVIRONMENT: 'disposable', AK_DATABASE_URL: u, AK_API_BASE_URL: 'http://127.0.0.1:8102/api' }));
  rec('NC-05', 'allowlist disi DB adi / portu / host / baska prova DB -> 4/4 durur', badRes.every((x) => x.threw), badRes.map((x) => x.msg.replace(/^G-0: /, '')).join(' | '));

  console.log('\n[NC] G-1 tenant oneki');
  const slugs = ['off-acc-1234abcd', 'cl-acc-1234abcd', 'f04-acc-1234abcd', 'ah-x', 'telli-hukuk', 'demo-firma', 'off-akx'];
  const slugRes = slugs.map((s) => { try { L.assertOwnSlug(s); return false; } catch (e) { return true; } });
  let okOwn = true; try { L.assertOwnSlug('off-ak-1234abcd'); } catch (e) { okOwn = false; }
  rec('NC-06', `${slugs.length} yabanci slug reddedilir, kendi slug kabul`, slugRes.every(Boolean) && okOwn, `ret ${slugRes.filter(Boolean).length}/${slugs.length} · off-ak- kabul=${okOwn}`);

  console.log('\n[NC] kesin ret karari');
  const v = { code: 'OFFICE_WRITE_DENIED_VIEWER' };
  const cases = [
    [{ status: 403, body: { code: 'OFFICE_WRITE_DENIED_VIEWER', message: 'x' } }, v, true],
    [{ status: 403, body: { statusCode: 403, message: { code: 'OFFICE_WRITE_DENIED_VIEWER' } } }, v, true],
    [{ status: 403, body: { code: 'OFFICE_F01_AUTHORIZATION_REQUIRED' } }, v, false],
    [{ status: 401, body: { code: 'OFFICE_WRITE_DENIED_VIEWER' } }, v, false],
    [{ status: 400, body: { message: ['x'] } }, v, false],
    [{ status: 500, body: {} }, v, false],
    [{ status: null, indeterminate: true, indeterminateReason: 'timeout' }, v, false],
    [{ status: 201, body: { id: 'x' } }, v, false],
    [{ status: 403, body: { message: 'PARTNER/MANAGER ... yalnız PARTNER veya ADMIN tarafından atanabilir.' } }, { textIncludes: 'yalnız PARTNER veya ADMIN tarafından atanabilir', notCode: 'OFFICE_F01_AUTHORIZATION_REQUIRED' }, true],
    [{ status: 403, body: { message: 'OFFICE_F01_AUTHORIZATION_REQUIRED' } }, { textIncludes: 'yalnız PARTNER veya ADMIN tarafından atanabilir' }, false],
  ];
  const cr = cases.map(([res, exp, want]) => L.isExactReject(res, exp) === want);
  rec('NC-07', 'kesin ret: 10 vakada beklenen karar', cr.every(Boolean), `dogru ${cr.filter(Boolean).length}/10`);

  console.log('\n[NC] G-4');
  let g4 = false; try { L.assertNoSecrets({ a: { password: 'p' } }); } catch (e) { g4 = /G-4/.test(e.message); }
  let g4t = false; try { L.assertNoSecrets({ tokens: { admin: 'eyJ' } }); } catch (e) { g4t = /G-4/.test(e.message); }
  rec('NC-08', 'parola ve token alani yazilamaz', g4 && g4t, `password=${g4} token=${g4t}`);

  console.log('\n[NC] DB: gozlem kumesi ve karsilastirici (kendi off-ak- alani)');
  const prisma = L.loadPrisma();
  try {
    const runId = L.newRunId(); const slug = L.slugFor(runId);
    const t = await prisma.tenant.create({ data: { name: `AK NC ${runId}`, slug }, select: { id: true } });
    let emptyOk = false;
    try { await L.snapshotTenant(prisma, t.id); } catch (e) { emptyOk = e instanceof L.ObservationError; }
    rec('NC-09', 'bos gozlem kumesi -> ObservationError ("degismedi" SAYILMAZ)', emptyOk, `ObservationError=${emptyOk}`);
    const o = await prisma.office.create({ data: { tenantId: t.id, name: 'NC', autoGreetingEnabled: false }, select: { id: true } });
    await prisma.user.create({ data: { tenantId: t.id, email: `off-ak-${runId}-nc@office-acceptance.invalid`, name: 'NC', surname: 'NC', passwordHash: 'x', role: 'USER' } });
    const lw = await prisma.lawyer.create({ data: { tenantId: t.id, officeId: o.id, name: 'NC', surname: runId }, select: { id: true } });
    const a = await L.snapshotTenant(prisma, t.id);
    await prisma.lawyer.update({ where: { id: lw.id }, data: { title: 'NC-MUTASYON' } });
    const b = await L.snapshotTenant(prisma, t.id);
    await prisma.lawyer.update({ where: { id: lw.id }, data: { title: null } });
    const d = L.diffSnapshots(a, b);
    rec('NC-10', 'tek alan degisimi yakalanir (lawyer~id)', d.length === 1 && d[0] === `lawyer~${lw.id}` && a.digest !== b.digest, `fark=${d.join(',')}`);

    const unknown = await closeByRunId(prisma, 'ffffffff');
    rec('NC-11', 'bilinmeyen runId -> found=false, yazma 0', unknown.found === false && unknown.verified === true, JSON.stringify(unknown));

    const c1 = await closeByRunId(prisma, runId);
    const tv1 = (await prisma.user.findFirst({ where: { tenantId: t.id }, select: { tokenVersion: true } })).tokenVersion;
    const c2 = await closeByRunId(prisma, runId);
    const tv2 = (await prisma.user.findFirst({ where: { tenantId: t.id }, select: { tokenVersion: true } })).tokenVersion;
    rec('NC-12', 'kapatma tekrar guvenli: 2. kosum alreadyClosed, tokenVersion bir kez artar',
      c1.verified && c1.usersDeactivated === 1 && c2.alreadyClosed && c2.usersDeactivated === 0 && tv1 === 1 && tv2 === 1,
      `1.: deaktive ${c1.usersDeactivated} · 2.: alreadyClosed=${c2.alreadyClosed} deaktive ${c2.usersDeactivated} · tokenVersion ${tv1}->${tv2}`);

    // I-3 karsilastiricisinin mutasyon kaniti: kendi alanina eklenen satir ozeti DEGISTIRMEZ, yabanci
    // tenant'a eklenen satir DEGISTIRIR (kendi alani gercekten haric, yabanci gercekten sayiliyor).
    const runId2 = L.newRunId();
    const t2 = await prisma.tenant.create({ data: { name: `AK NC yabanci ${runId2}`, slug: L.slugFor(runId2) }, select: { id: true } });
    const mkU = (tenantId, tag) => prisma.user.create({ data: { tenantId, email: `off-ak-${runId}-${tag}@office-acceptance.invalid`, name: 'NC', surname: tag, passwordHash: 'x', role: 'USER', isActive: false } });
    const f0 = await L.foreignFingerprint(prisma, [slug]);
    await mkU(t.id, 'nc-own');
    const f1 = await L.foreignFingerprint(prisma, [slug]);
    await mkU(t2.id, 'nc-foreign');
    const f2 = await L.foreignFingerprint(prisma, [slug]);
    rec('NC-13', 'I-3 ozeti: kendi alanina ekleme DEGISTIRMEZ, yabanci tenanta ekleme DEGISTIRIR',
      f0.digest === f1.digest && f1.digest !== f2.digest && f2.totals.user === f1.totals.user + 1,
      `kendi: ${f0.digest.slice(0, 12)}=${f1.digest.slice(0, 12)} · yabanci: ${f1.digest.slice(0, 12)}->${f2.digest.slice(0, 12)} · user ${f1.totals.user}->${f2.totals.user}`);
  } finally { await prisma.$disconnect().catch(() => {}); }

  const pass = results.filter((x) => x.ok).length;
  console.log(`\nNEGATIF KONTROLLER: ${pass}/${results.length}`);
  const out = { record: 'OFFICE-AK-NEGATIVE-R01', at: new Date().toISOString(), pass, total: results.length, results };
  if (process.env.AK_NEGATIVE_RESULT_FILE) L.writeJsonNoSecrets(process.env.AK_NEGATIVE_RESULT_FILE, out);
  process.exitCode = pass === results.length ? 0 : 1;
})().catch((e) => { console.error('NEGATIF KONTROL HATASI:', e && e.stack ? e.stack : e); process.exitCode = 2; });
