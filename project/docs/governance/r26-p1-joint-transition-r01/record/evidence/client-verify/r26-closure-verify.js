'use strict';
/**
 * R26 B2 — CLIENT BAĞIMSIZ KAPANIŞ DOĞRULAMASI. i16-closure-verify.js'in KOPYASI; YALNIZ sabitler değişti
 *  (dosya adları, 6 zorunlu satır, GO ref biçimi, V0 dar kabul). DB/izolasyon mantığı AYNEN. r26-live-portal-login KULLANILMAZ.
 *  V0 dar kabul: r26-dar-kabul-after.json sonuc=PASS, engellenen 0
 *  V1 kanıt: 6 zorunlu satırın tamamı PASS · fail=0 · unmeasured=0 · fatal yok · runId eşit
 *  V2 manifest: SHA256-MANIFEST.txt her satırı dosyayla eşit · manifest dışı dosya yok
 *  V3 DB (READ ONLY tx): hedef ah-<runId> / yabancı ah-<runId>-x slug bağı · aktif kullanıcı 0 · ACTIVE case 0 · aktif portal kullanıcısı 0
 *  V4 izolasyon: sentetik iki tenant HARİÇ client/user dağılım parmak izi = koşum öncesi parmak izi
 *  V5 GO ref: tüketim kaydı yalnız sha256 (literalWritten=false) · kanıt dizininde GO ref literali YOK
 * DB URL canlı .env'den SÜREÇ İÇİNDE okunur; hiçbir yere yazılmaz. Okuma hatası = UNMEASURED (PASS sayılmaz).
 * Env: EVDIR · ENVF · PRISMA_ROOT · OUT
 */
const fs = require('fs'); const path = require('path'); const crypto = require('crypto');
const E = process.env; const out = { record: 'R26-B2-CLOSURE-VERIFY', checks: [], verdict: 'UNMEASURED' };
const add = (id, verdict, observed) => { out.checks.push({ id, verdict, observed }); console.log(`${verdict.padEnd(10)} ${id} · ${observed}`); };
const rd = (p) => JSON.parse(fs.readFileSync(p, 'utf8').replace(/^﻿/, ''));
const sha = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex').toUpperCase();
const REQUIRED = ['PL-0', 'PL-1', 'PL-2', 'PL-GUARD', 'PL-CLOSE', 'PL-ISO'];
function envGet(file, key) {
  const hits = [];
  for (const l of fs.readFileSync(file, 'utf8').replace(/^﻿/, '').split(/\r?\n/)) { const m = /^\s*([A-Za-z0-9_]+)\s*=\s*(.*)$/.exec(l); if (m && m[1] === key) hits.push(m[2].trim().replace(/^["']|["']$/g, '')); }
  if (hits.length !== 1) throw new Error(`${key} geçiş sayısı ${hits.length}`);
  return hits[0];
}
(async () => {
  const ev = rd(path.join(E.EVDIR, 'r26-portal-login-evidence.json')); const rc = rd(path.join(E.EVDIR, 'r26-setup-receipt.json'));
  // V0
  try { const dk = rd(path.join(E.EVDIR, 'r26-dar-kabul-after.json')); add('V0-DAR-KABUL', dk.sonuc === 'PASS' && dk.blockedNonGet === 0 && dk.valid === true ? 'PASS' : 'FAIL', `sonuc=${dk.sonuc} engellenen=${dk.blockedNonGet} satir=${(dk.rows || []).map((x) => x.id + ':' + x.verdict).join(',')}`); }
  catch (e) { add('V0-DAR-KABUL', 'UNMEASURED', `okunamadı: ${String(e.message).slice(0, 120)}`); }
  const runId = rc.runId; out.runId = runId;
  // V1
  const rows = ev.results || [];
  const nonPass = rows.filter((r) => r.verdict !== 'PASS').map((r) => `${r.id}:${r.verdict}`);
  const missing = REQUIRED.filter((id) => !rows.some((r) => r.id === id && r.verdict === 'PASS'));
  const v1 = rows.some((r) => r.verdict === 'FAIL') ? 'FAIL' : (nonPass.length || missing.length || ev.fatal || ev.fail || ev.unmeasured || ev.runId !== runId || rows.length !== 6) ? 'UNMEASURED' : 'PASS';
  add('V1-EVIDENCE', v1, `portalLogin=${ev.closurePortalLogin} staffLogin=${ev.closureLogin} me=${ev.closureMe} satır=${rows.length} pass=${ev.pass} fail=${ev.fail} unmeasured=${ev.unmeasured} fatal=${ev.fatal || '-'} PASS-olmayan=[${nonPass}] eksik=[${missing}] runId-eşit=${ev.runId === runId}`);
  // V2
  try {
    const man = fs.readFileSync(path.join(E.EVDIR, 'SHA256-MANIFEST.txt'), 'utf8').split(/\r?\n/).filter(Boolean).map((l) => l.split(/\s+/));
    const listed = new Set(man.map((m) => m[1]));
    const bad = man.filter(([h, n]) => !fs.existsSync(path.join(E.EVDIR, n)) || sha(path.join(E.EVDIR, n)) !== h.toUpperCase()).map((m) => m[1]);
    const extra = fs.readdirSync(E.EVDIR).filter((n) => n !== 'SHA256-MANIFEST.txt' && !listed.has(n));
    add('V2-MANIFEST', bad.length ? 'FAIL' : extra.length ? 'UNMEASURED' : 'PASS', `satır=${man.length} uyuşmayan=[${bad}] manifest-dışı=[${extra}]`);
  } catch (e) { add('V2-MANIFEST', 'UNMEASURED', `okunamadı: ${String(e.message).slice(0, 120)}`); }
  // V5
  try {
    const gc = rd(path.join(E.EVDIR, 'goref-consumed.json'));
    const lit = fs.readdirSync(E.EVDIR).filter((n) => /OWNER-GO-CLIENT-R26-\d{8}-R\d{2}/.test(fs.readFileSync(path.join(E.EVDIR, n), 'latin1')));
    add('V5-GOREF', lit.length ? 'FAIL' : (gc.literalWritten === false && /^[0-9A-F]{64}$/.test(gc.goRefSha256) && gc.runId === runId) ? 'PASS' : 'UNMEASURED', `literal içeren dosya=[${lit}] literalWritten=${gc.literalWritten} sha-biçimi=${/^[0-9A-F]{64}$/.test(gc.goRefSha256)} çıkış=${gc.exitCode}`);
  } catch (e) { add('V5-GOREF', 'UNMEASURED', `okunamadı: ${String(e.message).slice(0, 120)}`); }
  // V3 + V4
  let prisma;
  try {
    const { PrismaClient } = require(E.PRISMA_ROOT);
    prisma = new PrismaClient({ datasources: { db: { url: envGet(E.ENVF, 'DATABASE_URL') } }, log: [] });
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
      const db = await tx.$queryRawUnsafe('select current_database() as d');
      out.db = db[0].d;
      for (const [lbl, tid, slug] of [['target', rc.tenantId, `ah-${runId}`], ['foreign', rc.foreignTenantId, `ah-${runId}-x`]]) {
        const t = await tx.tenant.findUnique({ where: { id: tid }, select: { slug: true } });
        const au = await tx.user.count({ where: { tenantId: tid, isActive: true } });
        const tu = await tx.user.count({ where: { tenantId: tid } });
        const ac = await tx.case.count({ where: { tenantId: tid, status: 'ACTIVE' } });
        const ap = await tx.clientPortalUser.count({ where: { isActive: true, client: { tenantId: tid } } });
        const ok = !!t && t.slug === slug && au === 0 && ac === 0 && ap === 0;
        add(`V3-ACCESS-${lbl}`, !t || t.slug !== slug ? 'FAIL' : ok ? 'PASS' : 'FAIL', `db=${out.db} slug=${t && t.slug} (beklenen ${slug}) kullanıcı aktif/toplam=${au}/${tu} ACTIVE case=${ac} aktif portal=${ap}`);
      }
      const ex = new Set([rc.tenantId, rc.foreignTenantId]);
      const cl = await tx.client.groupBy({ by: ['tenantId'], _count: { _all: true } });
      const us = await tx.user.groupBy({ by: ['tenantId'], _count: { _all: true } });
      const acc = new Map();
      for (const r of cl) if (!ex.has(r.tenantId)) acc.set(r.tenantId, { c: r._count._all, u: 0 });
      for (const r of us) if (!ex.has(r.tenantId)) { const x = acc.get(r.tenantId) || { c: 0, u: 0 }; x.u = r._count._all; acc.set(r.tenantId, x); }
      const rowsIso = [...acc.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([id, v]) => `${id}:${v.c}:${v.u}`);
      const dig = crypto.createHash('sha256').update(rowsIso.join('|')).digest('hex').slice(0, 16);
      const b = ev.isolationBefore || {};
      add('V4-ISOLATION', dig === b.digest && rowsIso.length === b.tenants ? 'PASS' : 'UNMEASURED', `şimdi tenants=${rowsIso.length} digest=${dig} · koşum-öncesi tenants=${b.tenants} digest=${b.digest} (fark gerçek kullanımdan da olabilir → PASS sayılmaz, incelenir)`);
    });
  } catch (e) { add('V3/V4-DB', 'UNMEASURED', `DB okunamadı: ${String(e.message || e).slice(0, 160)}`); }
  finally { if (prisma) await prisma.$disconnect(); }
  out.verdict = out.checks.some((c) => c.verdict === 'FAIL') ? 'FAIL' : out.checks.every((c) => c.verdict === 'PASS') ? 'PASS' : 'UNMEASURED';
  out.atUtc = new Date().toISOString();
  fs.writeFileSync(E.OUT, JSON.stringify(out, null, 1));
  console.log('SONUC', out.verdict);
})().catch((e) => { console.error('HATA', e.message); process.exitCode = 1; });
