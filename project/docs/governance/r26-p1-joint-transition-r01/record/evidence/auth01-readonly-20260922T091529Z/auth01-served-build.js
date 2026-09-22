'use strict';
/*
 * OFFICE-AUTH-01 — sunulan build bagi (B duzeltmesi). YALNIZ GET, kimliksiz; tarayici yok, yazma yok.
 * Test edilen uc sayfanin HTML'i alinir; HTML'in referans verdigi her /_next/static/*.js indirilir ve
 * sha256'si canli diskteki .next dosyasiyla karsilastirilir. Ayrica sunulan JS'de 7 elemanli PUBLIC_PATHS
 * literali ve HTML'de BUILD_ID aranir. (A turu B satiri _buildManifest istegi varsaydigi icin OLCUM KUSURUYDU.)
 * Kullanim: node auth01-served-build.js <cikti.json>
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const OUT = process.argv[2];
const BASE = 'http://localhost:3002';
const NX = 'C:/Development/HUKUK_YAZILIMI/HY_W4_RELEASE23/project/apps/web/.next';
const EXP_BUILD_ID = '5waeMoFGGMTLAYmn9oJvW';
const NEW_LIT = '"/auth/account-recovery","/auth/forgot-password","/auth/reset-password","/auth/accept-invite"';
const OLD_LIT = '["/","/auth/login","/auth/register","/auth/account-recovery"]';
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex').toUpperCase();

(async () => {
  const pages = ['/auth/reset-password', '/auth/accept-invite', '/dashboard'];
  const res = { record: 'OFFICE-AUTH01-SERVED-BUILD', tsUtc: new Date().toISOString(), base: BASE, expBuildId: EXP_BUILD_ID, pages: [] };
  const seen = new Map();
  for (const p of pages) {
    const r = await fetch(BASE + p, { method: 'GET', redirect: 'manual' });
    const html = await r.text();
    const srcs = [...new Set([...html.matchAll(/\/_next\/static\/[^"'\s)]+?\.js/g)].map((m) => m[0]))];
    res.pages.push({ path: p, status: r.status, htmlHasBuildId: html.includes(EXP_BUILD_ID), scripts: srcs.length });
    for (const s of srcs) if (!seen.has(s)) seen.set(s, null);
  }
  let match = 0, mismatch = 0, missing = 0, newLit = 0, oldLit = 0;
  const detail = [];
  for (const s of seen.keys()) {
    const r = await fetch(BASE + s, { method: 'GET' });
    const buf = Buffer.from(await r.arrayBuffer());
    const disk = path.join(NX, decodeURIComponent(s.replace(/^\/_next\//, '')));
    const served = sha(buf);
    let state;
    if (!fs.existsSync(disk)) { missing++; state = 'DISKTE-YOK'; }
    else if (sha(fs.readFileSync(disk)) === served) { match++; state = 'ESIT'; }
    else { mismatch++; state = 'FARKLI'; }
    const t = buf.toString('utf8');
    const hasNew = t.includes(NEW_LIT); const hasOld = t.includes(OLD_LIT);
    if (hasNew) newLit++; if (hasOld) oldLit++;
    if (hasNew || hasOld || state !== 'ESIT') detail.push({ src: s, status: r.status, state, hasNew, hasOld });
  }
  const anyBuildId = res.pages.some((x) => x.htmlHasBuildId);
  Object.assign(res, { servedScripts: seen.size, diskEqual: match, diskDifferent: mismatch, diskMissing: missing,
    servedWithNewPublicPaths: newLit, servedWithOldPublicPaths: oldLit, htmlContainsBuildId: anyBuildId, detail });
  res.verdict = (seen.size > 0 && match === seen.size && newLit >= 1 && oldLit === 0) ? 'PASS' : 'FAIL';
  fs.writeFileSync(OUT, JSON.stringify(res, null, 1));
  console.log(JSON.stringify({ pages: res.pages, servedScripts: seen.size, diskEqual: match, diskDifferent: mismatch, diskMissing: missing,
    servedWithNewPublicPaths: newLit, servedWithOldPublicPaths: oldLit, htmlContainsBuildId: anyBuildId, verdict: res.verdict }));
  if (res.verdict !== 'PASS') process.exitCode = 1;
})().catch((e) => { console.error('HATA', e.message); process.exitCode = 1; });
