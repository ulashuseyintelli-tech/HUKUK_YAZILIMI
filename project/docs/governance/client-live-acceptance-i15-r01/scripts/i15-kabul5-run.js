'use strict';
/*
 * İ15 — F04 KABUL-5 CANLI KOŞUMU (tenant sınırı). MEVCUT F04 paketini (`f04-live-acceptance-r01`) yeniden kullanır:
 * kurulum `f04-01-setup.js` (İ5b onarımlı), nihai erişim kapanışı `f04-09-close-access.js` (yalnız runId ile).
 * Sınır denemesi burada SIKI kodla ölçülür: `f04-05` `status >= 400`'ü kabul ediyordu (500 de geçerdi) — İ3 dersi:
 * yetki/kapsam reddi YALNIZ 403 veya 404; genel 5xx / belirsiz PASS SAYILMAZ.
 *
 * Sıra: kapılar → izolasyon ÖNCE → kurulum A + kurulum B (her biri 11 satır; İLK YAZMA) → A aktörü login →
 *       A token'ı ile B'nin dağıtımına POST /post → 403|404 + B'de iz 0 (durum · postedAt · journal · APPLY · ledger)
 *       → finally: A ve B için f04-09 (kullanıcı pasif + tokenVersion++) + Case ACTIVE→CLOSED → A login 401 → izolasyon SONRA.
 * Posting YAPILMAZ (A'nın kendi dağıtımı da post edilmez) → finansal yazma yok; A2 YENİDEN KOŞULMAZ (#2549 korunur).
 * Çıkış: 0 PASS · 2 FAIL · 3 ÖLÇÜLEMEYEN · 1 DURDU · 5 kapanış doğrulanmadı.
 * Env: I15_LIVE_CONFIRM · I15_LIVE_GO_REF · I15_EXPECT_DB · I15_API_BASE · I15_EXPECT_API · I15_EVID_FILE · I15_WORK_DIR ·
 *      F04_DATABASE_URL · F04_PRISMA_ROOT · F04_BCRYPT_PATH · F04_ENVIRONMENT(live|disposable)
 */
const fs = require('fs'); const path = require('path'); const crypto = require('crypto');
const { spawnSync } = require('child_process');
const F04 = path.resolve(__dirname, '../../f04-live-acceptance-r01/scripts');
const L = require(path.join(F04, 'f04-lib'));

function dbName(u) { try { return decodeURIComponent(new URL(u).pathname.replace(/^\//, '').split('/')[0]); } catch (e) { return null; } }
const rows = [];
const add = (id, verdict, desc, observed) => { rows.push({ id, verdict, desc, observed }); console.log(`  ${verdict.padEnd(10)} ${id.padEnd(9)} ${desc}\n             ${observed}`); };

async function fingerprint(prisma, exclude) {
  const ex = new Set(exclude.filter(Boolean));
  const [c, u, d] = await Promise.all([
    prisma.client.groupBy({ by: ['tenantId'], _count: { _all: true } }),
    prisma.user.groupBy({ by: ['tenantId'], _count: { _all: true } }),
    prisma.collectionDisposition.groupBy({ by: ['tenantId', 'status'], _count: { _all: true } }),
  ]);
  const acc = [];
  for (const r of c) if (!ex.has(r.tenantId)) acc.push(`c:${r.tenantId}:${r._count._all}`);
  for (const r of u) if (!ex.has(r.tenantId)) acc.push(`u:${r.tenantId}:${r._count._all}`);
  for (const r of d) if (!ex.has(r.tenantId)) acc.push(`d:${r.tenantId}:${r.status}:${r._count._all}`);
  acc.sort();
  return crypto.createHash('sha256').update(acc.join('|')).digest('hex').slice(0, 16);
}

(async () => {
  const E = process.env;
  if (E.I15_LIVE_CONFIRM !== '1') { console.error('REDDEDİLDİ: I15_LIVE_CONFIRM=1 gerekli.'); process.exit(3); }
  if (!(E.I15_LIVE_GO_REF && /^OWNER-GO-CLIENT-I15-\d{8}-R\d{2}$/.test(E.I15_LIVE_GO_REF.trim()))) { console.error('REDDEDİLDİ: I15_LIVE_GO_REF biçimi (OWNER-GO-CLIENT-I15-YYYYMMDD-RNN).'); process.exit(3); }
  if (!E.I15_EXPECT_DB || E.I15_EXPECT_DB !== dbName(E.F04_DATABASE_URL || '')) { console.error('REDDEDİLDİ: beklenen DB bağlı DB ile eşleşmiyor.'); process.exit(4); }
  if (!E.I15_API_BASE || E.I15_API_BASE !== E.I15_EXPECT_API) { console.error('REDDEDİLDİ: API adresi beyanı eşleşmiyor.'); process.exit(4); }
  if (!['live', 'disposable'].includes(E.F04_ENVIRONMENT)) { console.error('REDDEDİLDİ: F04_ENVIRONMENT live|disposable.'); process.exit(4); }
  if (!E.I15_EVID_FILE || !E.I15_WORK_DIR) { console.error('REDDEDİLDİ: I15_EVID_FILE + I15_WORK_DIR gerekli.'); process.exit(2); }
  const base = E.I15_API_BASE.replace(/\/+$/, '');
  const pw = 'F04k5!' + crypto.randomBytes(18).toString('base64url');   // YALNIZ bellekte + alt süreç ortamında
  const ridA = crypto.randomBytes(4).toString('hex'); const ridB = crypto.randomBytes(4).toString('hex');
  const stA = path.join(E.I15_WORK_DIR, `f04-state-${ridA}.json`); const stB = path.join(E.I15_WORK_DIR, `f04-state-${ridB}.json`);
  const out = { record: 'I15-KABUL5-RUN', runIdA: ridA, runIdB: ridB, apiBase: base, environment: E.F04_ENVIRONMENT };
  const run = (script, extra) => {
    const r = spawnSync(process.execPath, [path.join(F04, script)], { env: { ...E, F04_API_BASE_URL: base, F04_LOGIN_PASSWORD: pw, ...extra }, encoding: 'utf8', timeout: 120000 });
    return { code: r.status === null ? 124 : r.status, tail: String(r.stdout || '').split(/\r?\n/).filter(Boolean).slice(-2).join(' | ').slice(0, 200) };
  };
  const prisma = L.loadPrisma();
  let fatal = null; let a = null; let b = null; let tokenA = null;
  try {
    out.isolationBefore = await fingerprint(prisma, []);
    const sa = run('f04-01-setup.js', { F04_RUN_ID: ridA, F04_STATE_FILE: stA }); out.setupA = sa;
    if (sa.code !== 0) throw new Error(`kurulum A exit ${sa.code}`);
    const sb = run('f04-01-setup.js', { F04_RUN_ID: ridB, F04_STATE_FILE: stB }); out.setupB = sb;
    if (sb.code !== 0) throw new Error(`kurulum B exit ${sb.code}`);
    a = JSON.parse(fs.readFileSync(stA, 'utf8')); b = JSON.parse(fs.readFileSync(stB, 'utf8'));
    L.assertOwnSlug(a.slug); L.assertOwnSlug(b.slug);
    await L.assertOwnTenant(prisma, a.tenantId); await L.assertOwnTenant(prisma, b.tenantId);
    if (a.tenantId === b.tenantId) throw new Error('A ve B aynı tenant');
    const snapB = async () => ({
      disp: await prisma.collectionDisposition.findUniqueOrThrow({ where: { id: b.dispositionId }, select: { status: true, postedAt: true } }),
      journal: await prisma.accountingJournalEntry.count({ where: { tenantId: b.tenantId } }),
      apps: await prisma.collectionDispositionExpenseApplication.count({ where: { tenantId: b.tenantId } }),
      ledger: await prisma.balanceLedger.count({ where: { tenantId: b.tenantId } }),
      audit: await prisma.auditLog.count({ where: { tenantId: b.tenantId } }),
    });
    const before = await snapB();
    add('K5-0', before.disp.status === 'DISTRIBUTION_APPROVED' && !before.disp.postedAt ? 'PASS' : 'FAIL', 'B dağıtımı post edilmemiş durumda (ön koşul)',
      `status=${before.disp.status} postedAt=${before.disp.postedAt ? 'VAR' : 'YOK'} journal=${before.journal} apps=${before.apps} ledger=${before.ledger}`);
    const lg = await L.httpJson('POST', `${base}/auth/login`, { body: { email: a.userEmail, password: pw, tenantSlug: a.slug } });
    const lb = lg.body || {}; tokenA = lb.token || lb.access_token || lb.accessToken || (lb.data && (lb.data.token || lb.data.access_token || lb.data.accessToken)) || null;
    if (!tokenA) throw new Error(`A login HTTP ${lg.status}`);
    const res = await L.httpJson('POST', `${base}/collection-dispositions/${b.dispositionId}/post`, { token: tokenA });
    const code = res.body && (res.body.code || (res.body.error && res.body.error.code) || res.body.message);
    out.crossPost = { status: res.status, code: String(code || '').slice(0, 80) };
    if (res.indeterminate || res.status === null) add('K5-1', 'UNMEASURED', 'çapraz tenant post reddi', `HTTP belirsiz (${res.reason || 'taşıma'})`);
    else add('K5-1', [403, 404].includes(res.status) ? 'PASS' : 'FAIL', 'A token\'ı ile B dağıtımına post: YALNIZ 403/404 (5xx/2xx/diğer 4xx PASS değil)', `HTTP ${res.status} · code=${out.crossPost.code}`);
    const after = await snapB();
    const same = after.disp.status === before.disp.status && !after.disp.postedAt && ['journal', 'apps', 'ledger', 'audit'].every((k) => after[k] === before[k]);
    add('K5-2', same ? 'PASS' : 'FAIL', 'B\'de finansal/audit iz OLUŞMADI',
      `status=${after.disp.status} postedAt=${after.disp.postedAt ? 'VAR' : 'YOK'} journal ${before.journal}→${after.journal} · apps ${before.apps}→${after.apps} · ledger ${before.ledger}→${after.ledger} · audit ${before.audit}→${after.audit}`);
  } catch (e) { fatal = e && e.message ? e.message : String(e); console.error(`\nDURDU: ${fatal}`); }
  finally {
    // NİHAİ KAPANIŞ — her iki runId için (durum dosyası olmasa da; f04-09 alanı runId'den bulur)
    out.closure = {};
    for (const [lbl, rid] of [['A', ridA], ['B', ridB]]) {
      const c = run('f04-09-close-access.js', { F04_RUN_ID: rid }); out.closure[lbl] = c;
      try {
        const t = await prisma.tenant.findFirst({ where: { slug: `f04-acc-${rid}` }, select: { id: true, slug: true } });
        if (t) {
          L.assertOwnSlug(t.slug);
          const cc = await prisma.case.updateMany({ where: { tenantId: t.id, status: 'ACTIVE' }, data: { status: 'CLOSED' } });
          const act = await prisma.user.count({ where: { tenantId: t.id, isActive: true } });
          const actCase = await prisma.case.count({ where: { tenantId: t.id, status: 'ACTIVE' } });
          out.closure[lbl] = { ...c, casesClosedNow: cc.count, activeUsers: act, activeCases: actCase, ok: c.code === 0 && act === 0 && actCase === 0 };
        } else out.closure[lbl] = { ...c, fieldExists: false, ok: c.code === 0 };
      } catch (e) { out.closure[lbl] = { ...c, ok: false, error: String(e.message || e).slice(0, 120) }; }
    }
    const closureOk = Object.values(out.closure).every((x) => x.ok);
    if (a) {
      const lg2 = await L.httpJson('POST', `${base}/auth/login`, { body: { email: a.userEmail, password: pw, tenantSlug: a.slug } });
      const me = tokenA ? await L.httpJson('GET', `${base}/auth/me`, { token: tokenA }) : { status: null };
      const obs = `closure.ok=${closureOk} login=${lg2.status} me=${me.status}`;
      if (!closureOk) add('K5-CLOSE', 'FAIL', 'nihai kapanış (DB)', obs);
      else if (typeof lg2.status !== 'number' || (tokenA && typeof me.status !== 'number')) add('K5-CLOSE', 'UNMEASURED', 'nihai kapanış HTTP kanıtı', `yoklama belirsiz · ${obs}`);
      else add('K5-CLOSE', lg2.status === 401 && (!tokenA || me.status === 401) ? 'PASS' : 'FAIL', 'nihai kapanış: A ve B kullanıcıları pasif + Case CLOSED · login 401 · eski token 401', obs);
      try {
        const fp = await fingerprint(prisma, [a.tenantId, b && b.tenantId]);
        add('K5-ISO', fp === out.isolationBefore ? 'PASS' : 'FAIL', 'sentetik OLMAYAN tenant\'ların client/user/dağılım-durum parmak izi DEĞİŞMEDİ', `önce=${out.isolationBefore} sonra=${fp}`);
      } catch (e) { add('K5-ISO', 'UNMEASURED', 'izolasyon', String(e.message || e).slice(0, 120)); }
    }
    await prisma.$disconnect().catch(() => {});
    out.fatal = fatal; out.results = rows;
    const f = rows.filter((r) => r.verdict === 'FAIL').length; const u = rows.filter((r) => r.verdict === 'UNMEASURED').length;
    out.summary = { pass: rows.length - f - u, fail: f, unmeasured: u };
    fs.writeFileSync(E.I15_EVID_FILE, JSON.stringify(out, null, 1), 'utf8');
    console.log(`\nİ15 KABUL-5: PASS ${out.summary.pass} · FAIL ${f} · ÖLÇÜLEMEYEN ${u}`);
    process.exitCode = !closureOk ? 5 : fatal ? 1 : f ? 2 : u ? 3 : 0;
  }
})();
