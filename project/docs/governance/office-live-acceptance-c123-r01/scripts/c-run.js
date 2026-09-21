/*
 * OFFICE C123 KABUL — TEK YURUTUCU
 *
 *   G-0 -> G-6 (artefakt bagi) -> runId (yazmadan ONCE kayda gecer) -> kurulum (tek tx) -> 5 login
 *   -> C1 + C2 + C3 -> finally: KAPANIS (runId ile) + dagitilmis JWT'lerin 401'i + izolasyon olcumu -> hukum
 *
 * CIKIS KODLARI: 0 PASS · 1 FAIL · 2 OLCULEMEDI/kosum hatasi · 3 KAPANIS DOGRULANAMADI · 4 G-0/G-6 (yazma YOK)
 * SIR: parola bu surecin BELLEGINDE uretilir; hicbir dosyaya/ciktiya yazilmaz. Token'lar da oyle.
 * Yalniz disposable: C123_ABORT_AFTER=<adim> (finally kapanis kaniti), C123_SKIP_CLOSE=1 (bagimsiz kurtarma kaniti),
 *   C123_SHAPES_OUT=<dosya> (pozitif adimlarin olculen fark sekilleri; belge §5 icin).
 */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const L = require('./c-lib');
const { setup } = require('./c-setup');
const { runCases } = require('./c-cases');
const { closeByRunId } = require('./c-99-close');

(async () => {
  let env; let dist;
  try { env = L.assertRunEnvironment(); dist = L.assertDistBinding(); } catch (e) {
    console.error(`${e.gate || 'G-0'} DURDU (yazma YOK): ${e.message}`); process.exitCode = 4; return;
  }
  const runId = String(process.env.C123_RUN_ID || L.newRunId()).toLowerCase();
  const slug = L.slugFor(runId);
  L.assertOwnSlug(slug);
  const disposable = env.environment === 'disposable';
  const abortAfter = disposable ? (process.env.C123_ABORT_AFTER || null) : null;
  const skipClose = disposable && process.env.C123_SKIP_CLOSE === '1';

  const toolSha = (rel) => crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname, rel))).digest('hex').toUpperCase();
  const tools = {};
  for (const f of ['c-lib.js', 'c-setup.js', 'c-cases.js', 'c-99-close.js', 'c-run.js', 'c-dist-pins.json', 'c-expect-shapes.json', '../../office-delivery-r01/scripts/ow-lib.js']) tools[path.basename(f)] = toolSha(f);
  const result = {
    record: 'OFFICE-C123-ACCEPTANCE-R01', package: 'office-live-acceptance-c123-r01', environment: env,
    distBinding: { root: dist.root, ok: dist.ok, files: Object.fromEntries(Object.entries(dist.files).map(([k, v]) => [k, v.match])) },
    tools, runId, slug, startedAt: new Date().toISOString(), stage: 'kurulum-oncesi',
    recovery: `C123_RUN_ID=${runId} node c-99-close.js`,
    note: disposable ? 'DISPOSABLE PROVA — canli kabul YERINE GECMEZ' : `CANLI KOSUM · GO ${env.goRef}`,
  };
  L.writeJsonNoSecrets(L.resultFile(), result);
  console.log(`KOSUM KIMLIGI (yazmadan ONCE kayda gecti): runId=${runId} tenant=${slug} ortam=${env.environment}`);
  console.log(`ARTEFAKT BAGI (G-6): ${Object.keys(dist.files).length} dosya pinle ESIT`);
  console.log(`KURTARMA (her kosulda): ${result.recovery}`);

  const password = crypto.randomBytes(18).toString('base64url'); // yalniz bellek
  const prismaModule = L.loadPrismaModule();
  const plan = L.scopePlan(prismaModule);
  const prisma = L.loadPrisma();
  const bcrypt = L.loadBcrypt();
  const R = L.makeRecorder('OFFICE C123 KABUL');
  const shapes = {};
  let st = null; let tokens = null; let runError = null; let close = null;
  const postClose = []; const isolation = {};
  try {
    L.step('S', `kurulum — tek transaction (olcum plani: ${plan.direct.length} tenantId'li + ${plan.child.length} bagli tablo; kapsam disi ${plan.unscoped.length})`);
    const s = await setup({ prisma, bcrypt, runId, password, env, abortAfter });
    st = s.state;
    L.saveState({ ...st, environment: env, createdAt: new Date().toISOString() });
    isolation.foreignBefore = await L.foreignFingerprint(prisma, [slug]);
    L.log(`      yabanci tenant sayi ozeti (I-3 temel): ${isolation.foreignBefore.tenants} tenant · ${isolation.foreignBefore.digest.slice(0, 16)}`);
    result.stage = 'kurulum-tamam';
    result.setup = { tenantId: st.tenantId, writtenRows: st.writtenRows.length, scopePlan: { direct: plan.direct.length, child: plan.child.length, unscoped: plan.unscoped } };
    L.writeJsonNoSecrets(L.resultFile(), result);
    const base = L.apiBase();
    tokens = { admin: s.adminToken };
    for (const k of ['viewer', 'elev1', 'elev2', 'elev3']) tokens[k] = await L.login(base, st.actors[k].email, password, slug);
    result.stage = 'kabul';
    await runCases({ prisma, plan, st, tokens, R, env, abortAfter, shapesOut: shapes });
    result.stage = 'kabul-tamam';
  } catch (e) {
    runError = e;
    console.error(`\nKOSUM HATASI (kapanis yine calisir): ${e && e.message}`);
  } finally {
    if (skipClose) console.log('\nC123_SKIP_CLOSE=1 (yalniz disposable) — kapanis ATLANDI; kurtarma c-99-close.js ile');
    else {
      L.step('K', 'kapanis (runId ile) — erisim sonlandirilir, bekleyen talepler iptal, audit KORUNUR');
      try { close = await closeByRunId(prisma, runId); } catch (e) { close = { verified: false, error: e.message }; }
      if (tokens) {
        for (const [actor, token] of Object.entries(tokens)) {
          const r = await L.httpJson('GET', `${L.apiBase()}/lawyers`, { token });
          postClose.push({ actor, status: r.status, indeterminate: r.indeterminate });
        }
      }
    }
    if (st) {
      const ids = Object.values(st.actors).map((a) => a.id);
      try { isolation.foreignAuditByActors = await prisma.auditLog.count({ where: { userId: { in: ids }, tenantId: { not: st.tenantId } } }); } catch (e) { isolation.foreignAuditByActors = `OLCULEMEDI: ${e.message}`; }
      if (isolation.foreignBefore) {
        try { isolation.foreignAfter = await L.foreignFingerprint(prisma, [slug]); } catch (e) { isolation.foreignAfter = `OLCULEMEDI: ${e.message}`; }
      }
    }
    await prisma.$disconnect().catch(() => {});
  }

  if (st) {
    if (skipClose) R.unmeasured('K-1', 'kapanis', 'C123_SKIP_CLOSE — bagimsiz kurtarma ile kapatilacak');
    else {
      R.ok('K-1', 'kapanis dogrulandi (aktif kullanici 0, aktif dava 0, bekleyen talep 0, audit korundu)', !!(close && close.verified), JSON.stringify(close));
      const n = tokens ? Object.keys(tokens).length : 0;
      if (!tokens) R.unmeasured('K-2', 'dagitilmis JWT gecersiz', 'token alinmadan durdu');
      else R.ok('K-2', `dagitilmis ${n} JWT kapanistan sonra 401`, postClose.length === n && postClose.every((p) => !p.indeterminate && p.status === 401), JSON.stringify(postClose));
    }
    if (typeof isolation.foreignAuditByActors === 'number') R.ok('I-1', "aktorlerin BASKA tenant'ta audit izi 0", isolation.foreignAuditByActors === 0, `sayi=${isolation.foreignAuditByActors}`);
    else R.unmeasured('I-1', "aktorlerin baska tenant'ta audit izi", String(isolation.foreignAuditByActors));
    const fa = isolation.foreignAfter; const fb = isolation.foreignBefore;
    if (fb && fb.tenants === 0) R.unmeasured('I-3', 'yabanci tenant sayi ozeti', 'yabanci tenant 0 — olcum KOR');
    else if (fa && typeof fa === 'object') {
      R.ok('I-3', 'yabanci tenant sayi ozeti kurulum sonrasi = kapanis sonrasi', fa.digest === fb.digest,
        `${fb.tenants} tenant · ${fb.digest.slice(0, 16)} -> ${fa.digest.slice(0, 16)} · ${JSON.stringify(fa.totals)}`);
    } else R.unmeasured('I-3', 'yabanci tenant sayi ozeti', String(fa));
  }

  const sum = R.summary();
  const realFail = sum.fail - sum.unmeasured;
  let verdict; let code;
  if (!skipClose && st && !(close && close.verified)) { verdict = 'KAPANIS_DOGRULANAMADI'; code = 3; }
  else if (realFail > 0) { verdict = 'FAIL'; code = 1; }
  else if (runError || sum.unmeasured > 0 || !st) { verdict = 'OLCULEMEDI'; code = 2; }
  else { verdict = 'PASS'; code = 0; }
  if (disposable && process.env.C123_SHAPES_OUT) fs.writeFileSync(process.env.C123_SHAPES_OUT, JSON.stringify(shapes, null, 1) + '\n', 'utf8');

  Object.assign(result, {
    stage: 'bitti', finishedAt: new Date().toISOString(), verdict,
    pass: sum.pass, fail: realFail, unmeasured: sum.unmeasured, total: sum.total,
    runError: runError ? String(runError.message || runError) : null,
    results: sum.results, measuredShapes: shapes, close, postClose, isolation,
  });
  L.writeJsonNoSecrets(L.resultFile(), result);
  console.log(`\nHUKUM: ${verdict} · PASS ${sum.pass}/${sum.total} · FAIL ${realFail} · OLCULEMEDI ${sum.unmeasured}`
    + ` · kapanis ${close ? (close.verified ? 'DOGRULANDI' : 'DOGRULANAMADI') : 'YOK'} · sonuc dosyasi ${L.resultFile()}`);
  process.exitCode = code;
})().catch((e) => { console.error('YURUTUCU HATASI:', e && e.stack ? e.stack : e); process.exitCode = 2; });
