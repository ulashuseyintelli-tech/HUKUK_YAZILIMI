/*
 * İ12 — CANLI PREFLIGHT (SALT-OKUMA) · kimlik doğrulama kapısı; İLK YAZMADAN ÖNCE koşar.
 *
 * Owner kuralı: "İlk yazmadan önce GO/ref biçim-tüketim kontrolü, beklenen DB host/port/adı, gerçek API↔DB
 * bağı ve kurulum makbuzuna bağlı sentetik tenant/runId eşleşmesi doğrulanır. Eksik kimlikte YAZMA BAŞLAMAZ."
 * Bu betik HİÇBİR yazma yapmaz (yalnız git grep + prisma findUnique + API login round-trip). TÜM kapılar
 * fail-closed; herhangi biri geçmezse exit≠0 → çağıran zincir (pencere-aç/ölçüm) BAŞLAMAZ.
 *
 * KAPILAR:
 *   1. GO/ref BİÇİM: I12_LIVE_GO_REF `^OWNER-GO-CLIENT-I12-\d{8}-R\d{2}$`. TÜKETİM: repoda `git grep -F` ile
 *      literal ref sayısı 0 olmalı (daha önce yazılmış/tüketilmiş ref REDDEDİLİR — İ11 K-REF deseni).
 *   2. BEKLENEN DB KİMLİĞİ: AH_DATABASE_URL host+port+ad, I12_EXPECT_DB_HOST/PORT/NAME ile TAM eşleşmeli.
 *   3. KURULUM MAKBUZU: I12_SETUP_RECEIPT JSON {runId,tenantId,tenantSlug,loginEmail}; runId+slug beklenenle
 *      eşleşmeli VE DB'de tenantId→slug makbuzla aynı olmalı (sentetik hedef makbuza bağlanır).
 *   4. GERÇEK API↔DB BAĞI: verifyApiBoundToSameDatabase (login round-trip; 429 "başka DB" SAYILMAZ) bound=true.
 *
 * KULLANIM: node i12-live-preflight.js
 * ENV: I12_LIVE_GO_REF · I12_EXPECT_DB_HOST · I12_EXPECT_DB_PORT · I12_EXPECT_DB_NAME · I12_EXPECT_TENANT_SLUG ·
 *      I12_EXPECT_RUNID · I12_SETUP_RECEIPT · AH_DATABASE_URL · AH_API_BASE_URL · AH_LOGIN_PASSWORD ·
 *      I12_REPO_DIR (git grep kökü; varsayılan process.cwd())
 */
'use strict';
const fs = require('fs'); const path = require('path'); const { execFileSync } = require('child_process');
const I3 = path.resolve(__dirname, '../../client-acceptance-runners-i3-r01/scripts');
const L = require(path.join(I3, 'i3-lib'));
const REF_RE = /^OWNER-GO-CLIENT-I12-\d{8}-R\d{2}$/;
function dbId(u) { try { const p = new URL(u); return { host: p.hostname.toLowerCase(), port: Number(p.port || 5432), name: decodeURIComponent(p.pathname.replace(/^\//, '').split('/')[0]) }; } catch (e) { return null; } }

(async () => {
  const checks = []; const add = (id, ok, detail) => checks.push({ id, ok: !!ok, detail });
  const ref = process.env.I12_LIVE_GO_REF || '';
  const repo = process.env.I12_REPO_DIR || process.cwd();

  // 1) GO/ref BİÇİM + TÜKETİM (git grep — literal; 0 isabet = tüketilmemiş)
  const fmtOk = REF_RE.test(ref);
  let consumeOk = false, hits = -1;
  if (fmtOk) {
    try { const out = execFileSync('git', ['-C', repo, 'grep', '-F', '--', ref], { encoding: 'utf8' }); hits = out.split(/\r?\n/).filter(Boolean).length; }
    catch (e) { hits = (e.status === 1) ? 0 : -1; } // git grep: exit 1 = eşleşme yok (temiz)
    consumeOk = hits === 0;
  }
  add('GO_REF_FORMAT', fmtOk, fmtOk ? 'biçim OK' : `biçim HATALI (${ref ? 'verildi' : 'boş'})`);
  add('GO_REF_UNCONSUMED', fmtOk && consumeOk, hits < 0 ? 'git grep HATASI' : `repo literal isabet=${hits} (0 olmalı)`);

  // 2) BEKLENEN DB KİMLİĞİ (host+port+ad)
  const id = dbId(process.env.AH_DATABASE_URL || '');
  const dbOk = !!id && id.host === (process.env.I12_EXPECT_DB_HOST || '').toLowerCase()
    && id.port === Number(process.env.I12_EXPECT_DB_PORT) && id.name === process.env.I12_EXPECT_DB_NAME;
  add('DB_IDENTITY', dbOk, id ? `bağlı ${id.host}:${id.port}/${id.name} vs beklenen ${process.env.I12_EXPECT_DB_HOST}:${process.env.I12_EXPECT_DB_PORT}/${process.env.I12_EXPECT_DB_NAME}` : 'AH_DATABASE_URL çözülemedi');

  // 3) KURULUM MAKBUZU → sentetik tenant/runId eşleşmesi (DB salt-okuma)
  let receipt = null; try { receipt = JSON.parse(fs.readFileSync(process.env.I12_SETUP_RECEIPT || '', 'utf8')); } catch (e) {}
  const prisma = L.AH.loadPrisma();
  let receiptOk = false, rdetail = 'makbuz okunamadı';
  if (receipt) {
    const runOk = receipt.runId && receipt.runId === process.env.I12_EXPECT_RUNID;
    const slugOk = receipt.tenantSlug && receipt.tenantSlug === process.env.I12_EXPECT_TENANT_SLUG;
    let dbSlugOk = false;
    try { const t = await prisma.tenant.findUnique({ where: { id: receipt.tenantId }, select: { slug: true } }); dbSlugOk = !!t && t.slug === receipt.tenantSlug; } catch (e) {}
    receiptOk = runOk && slugOk && dbSlugOk;
    rdetail = `runId ${runOk ? 'OK' : 'UYUŞMAZ'} · slug ${slugOk ? 'OK' : 'UYUŞMAZ'} · DB tenant→slug ${dbSlugOk ? 'OK' : 'UYUŞMAZ/YOK'}`;
  }
  add('SETUP_RECEIPT_TENANT_RUNID', receiptOk, rdetail);

  // 4) GERÇEK API↔DB BAĞI (login round-trip; SALT-OKUMA)
  let bindOk = false, bdetail = 'AH_API_BASE_URL/AH_LOGIN_PASSWORD/makbuz eksik';
  if (process.env.AH_API_BASE_URL && process.env.AH_LOGIN_PASSWORD && receipt && receipt.loginEmail) {
    try { const r = await L.AH.verifyApiBoundToSameDatabase(prisma, process.env.AH_API_BASE_URL, receipt.loginEmail, process.env.AH_LOGIN_PASSWORD, receipt.tenantSlug); bindOk = !!r.bound; bdetail = r.reason; }
    catch (e) { bdetail = 'bağ ölçümü HATASI: ' + (e && e.message ? e.message : e); }
  }
  add('API_DB_BINDING', bindOk, bdetail);

  await prisma.$disconnect().catch(() => {});
  const allOk = checks.every((c) => c.ok);
  console.log(JSON.stringify({ record: 'I12-LIVE-PREFLIGHT', ok: allOk, goRefProvided: !!ref, checks }, null, 1));
  if (!allOk) { console.error('PREFLIGHT REDDETTİ — eksik/uyuşmaz kimlik; YAZMA BAŞLAMAZ.'); process.exit(5); }
})();
