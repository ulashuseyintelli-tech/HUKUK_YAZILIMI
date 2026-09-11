/*
 * OFFICE AK KABUL — TEK YURUTUCU
 *
 *   G-0 -> runId (yazmadan ONCE kayda gecer) -> kurulum (12 satir) -> 4 login -> AK-2 + AK-1a
 *   -> finally: KAPANIS (runId ile) + dagitilmis JWT'lerin 401'i + izolasyon olcumu -> hukum
 *
 * CIKIS KODLARI: 0 PASS · 1 FAIL · 2 OLCULEMEDI/kosum hatasi · 3 KAPANIS DOGRULANAMADI · 4 G-0 (yazma YOK)
 * SIR: parola bu surecin BELLEGINDE uretilir; hicbir dosyaya/ciktiya yazilmaz. Token'lar da oyle.
 * Yalniz disposable: AK_ABORT_AFTER=<adim> (finally kapanis kaniti), AK_SKIP_CLOSE=1 (bagimsiz kurtarma kaniti).
 */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const L = require('./ak-lib');
const { setup, bystanderSnapshot } = require('./ak-setup');
const { runCases } = require('./ak-cases');
const { closeByRunId } = require('./ak-99-close');

(async () => {
  let env;
  try { env = L.assertRunEnvironment(); } catch (e) {
    console.error(`G-0 DURDU (yazma YOK): ${e.message}`); process.exitCode = 4; return;
  }
  const runId = String(process.env.AK_RUN_ID || L.newRunId()).toLowerCase();
  const slug = L.slugFor(runId);
  L.assertOwnSlug(slug);
  const disposable = env.environment === 'disposable';
  const abortAfter = disposable ? (process.env.AK_ABORT_AFTER || null) : null;
  const skipClose = disposable && process.env.AK_SKIP_CLOSE === '1';

  // Kosan arac kimligi sonuc dosyasina baglanir (belgedeki SHA tablosuyla eslestirilir).
  const toolSha = (rel) => crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname, rel))).digest('hex').toUpperCase();
  const tools = {};
  for (const f of ['ak-lib.js', 'ak-setup.js', 'ak-cases.js', 'ak-99-close.js', 'ak-run.js', '../../office-delivery-r01/scripts/ow-lib.js']) tools[path.basename(f)] = toolSha(f);
  const result = {
    record: 'OFFICE-AK-ACCEPTANCE-R01', package: 'office-live-acceptance-ak-r01', environment: env, tools,
    runId, slug, startedAt: new Date().toISOString(), stage: 'kurulum-oncesi',
    recovery: `AK_RUN_ID=${runId} node ak-99-close.js`,
    note: disposable ? 'DISPOSABLE PROVA — canli kabul YERINE GECMEZ' : `CANLI KOSUM · GO ${env.goRef}`,
  };
  L.writeJsonNoSecrets(L.resultFile(), result);
  console.log(`KOSUM KIMLIGI (yazmadan ONCE kayda gecti): runId=${runId} tenant=${slug} ortam=${env.environment}`);
  console.log(`KURTARMA (her kosulda): ${result.recovery}`);

  const password = crypto.randomBytes(18).toString('base64url'); // yalniz bellek
  const prisma = L.loadPrisma();
  const bcrypt = L.loadBcrypt();
  const R = L.makeRecorder('OFFICE AK KABUL');
  let st = null; let tokens = null; let runError = null; let close = null;
  const postClose = []; const isolation = {};
  const ownSlugs = [slug]; // I-3: yalniz ana kabul alani haric; seyirci (varsa) YABANCI sayilir
  try {
    L.step('S', 'kurulum — 12 satir, tek transaction');
    const s = await setup({ prisma, bcrypt, runId, password, env, abortAfter });
    st = s.state;
    L.saveState({ ...st, environment: env, createdAt: new Date().toISOString() });
    // I-3 temel olcumu: kurulumdan SONRA, ilk API cagrisindan ONCE (kurulumun 12 satiri tek tx'te
    // yalniz kendi tenant'ina yazar — A5 tum-DB envanteri). Olculemezse kabul baslamaz.
    isolation.foreignBefore = await L.foreignFingerprint(prisma, ownSlugs);
    L.log(`      yabanci tenant sayi ozeti (I-3 temel): ${isolation.foreignBefore.tenants} tenant · ${isolation.foreignBefore.digest.slice(0, 16)} · ${JSON.stringify(isolation.foreignBefore.totals)}`);
    result.stage = 'kurulum-tamam';
    result.setup = { tenantId: st.tenantId, writtenRows: st.writtenRows, bystander: st.bystander ? st.bystander.slug : null };
    L.writeJsonNoSecrets(L.resultFile(), result);
    const base = L.apiBase();
    tokens = {
      admin: s.adminToken,
      partner: await L.login(base, st.partnerEmail, password, slug),
      manager: await L.login(base, st.managerEmail, password, slug),
      viewer: await L.login(base, st.viewerEmail, password, slug),
    };
    result.stage = 'kabul';
    await runCases({ prisma, st, tokens, R, abortAfter });
    result.stage = 'kabul-tamam';
  } catch (e) {
    runError = e;
    console.error(`\nKOSUM HATASI (kapanis yine calisir): ${e && e.message}`);
  } finally {
    if (skipClose) {
      console.log('\nAK_SKIP_CLOSE=1 (yalniz disposable) — kapanis ATLANDI; kurtarma ak-99-close.js ile');
    } else {
      L.step('K', 'kapanis (runId ile) — erisim sonlandirilir, audit KORUNUR');
      try { close = await closeByRunId(prisma, runId); } catch (e) { close = { verified: false, error: e.message }; }
      if (tokens) {
        for (const [actor, token] of Object.entries(tokens)) {
          const r = await L.httpJson('GET', `${L.apiBase()}/lawyers`, { token });
          postClose.push({ actor, status: r.status, indeterminate: r.indeterminate });
        }
      }
    }
    if (st) {
      const ids = [st.adminUserId, st.partnerUserId, st.managerUserId, st.viewerUserId];
      try {
        isolation.foreignAuditByActors = await prisma.auditLog.count({ where: { userId: { in: ids }, tenantId: { not: st.tenantId } } });
      } catch (e) { isolation.foreignAuditByActors = `OLCULEMEDI: ${e.message}`; }
      if (st.bystander) {
        try {
          const now = await bystanderSnapshot(prisma, st.bystander.tenantId);
          isolation.bystanderUnchanged = now.digest === st.bystander.baseline.digest;
          isolation.bystanderCounts = now.counts;
        } catch (e) { isolation.bystanderUnchanged = `OLCULEMEDI: ${e.message}`; }
      }
      if (isolation.foreignBefore) {
        try { isolation.foreignAfter = await L.foreignFingerprint(prisma, ownSlugs); } catch (e) { isolation.foreignAfter = `OLCULEMEDI: ${e.message}`; }
      }
    }
    await prisma.$disconnect().catch(() => {});
  }

  // ── kapanis ve izolasyon olcutleri ──
  if (st) {
    if (skipClose) R.unmeasured('K-1', 'kapanis', 'AK_SKIP_CLOSE — bagimsiz kurtarma ile kapatilacak');
    else {
      R.ok('K-1', 'kapanis dogrulandi (aktif kullanici 0, aktif dava 0, audit korundu)', !!(close && close.verified), JSON.stringify(close));
      const all401 = tokens && postClose.length === 4 && postClose.every((p) => !p.indeterminate && p.status === 401);
      if (!tokens) R.unmeasured('K-2', 'dagitilmis JWT gecersiz', 'token alinmadan durdu');
      else R.ok('K-2', 'dagitilmis 4 JWT kapanistan sonra 401', all401, JSON.stringify(postClose));
    }
    if (typeof isolation.foreignAuditByActors === 'number') {
      R.ok('I-1', 'aktorlerin BASKA tenant\'ta audit izi 0', isolation.foreignAuditByActors === 0, `sayi=${isolation.foreignAuditByActors}`);
    } else R.unmeasured('I-1', 'aktorlerin baska tenant\'ta audit izi', String(isolation.foreignAuditByActors));
    const fa = isolation.foreignAfter; const fb = isolation.foreignBefore;
    if (fb && fb.tenants === 0) {
      // KOR olcum PASS SAYILMAZ: bakilacak yabanci tenant yoksa "degismedi" iddiasi bos kalir.
      R.unmeasured('I-3', 'yabanci tenant sayi ozeti', 'yabanci tenant 0 — olcum KOR');
    } else if (fa && typeof fa === 'object') {
      R.ok('I-3', 'yabanci tenant sayi ozeti ilk API cagrisi oncesi = kapanis sonrasi (satir eklenmedi/silinmedi/tasinmadi)',
        fa.digest === fb.digest, `${fb.tenants} tenant · ${fb.digest.slice(0, 16)} -> ${fa.digest.slice(0, 16)} · ${JSON.stringify(fa.totals)}`);
    } else R.unmeasured('I-3', 'yabanci tenant sayi ozeti', String(fa));
    if (st.bystander) {
      if (typeof isolation.bystanderUnchanged === 'boolean') {
        R.ok('I-2', 'seyirci tenant kurulumdan beri DEGISMEDI', isolation.bystanderUnchanged, JSON.stringify(isolation.bystanderCounts));
      } else R.unmeasured('I-2', 'seyirci tenant', String(isolation.bystanderUnchanged));
    }
  }

  const sum = R.summary();
  const realFail = sum.fail - sum.unmeasured;
  let verdict; let code;
  if (!skipClose && st && !(close && close.verified)) { verdict = 'KAPANIS_DOGRULANAMADI'; code = 3; }
  else if (realFail > 0) { verdict = 'FAIL'; code = 1; }
  else if (runError || sum.unmeasured > 0 || !st) { verdict = 'OLCULEMEDI'; code = 2; }
  else { verdict = 'PASS'; code = 0; }

  Object.assign(result, {
    stage: 'bitti', finishedAt: new Date().toISOString(), verdict,
    pass: sum.pass, fail: realFail, unmeasured: sum.unmeasured, total: sum.total,
    runError: runError ? String(runError.message || runError) : null,
    results: sum.results, close, postClose, isolation,
  });
  L.writeJsonNoSecrets(L.resultFile(), result);
  console.log(`\nHUKUM: ${verdict} · PASS ${sum.pass}/${sum.total} · FAIL ${realFail} · OLCULEMEDI ${sum.unmeasured}`
    + ` · kapanis ${close ? (close.verified ? 'DOGRULANDI' : 'DOGRULANAMADI') : 'YOK'} · sonuc dosyasi ${L.resultFile()}`);
  process.exitCode = code;
})().catch((e) => { console.error('YURUTUCU HATASI:', e && e.stack ? e.stack : e); process.exitCode = 2; });
