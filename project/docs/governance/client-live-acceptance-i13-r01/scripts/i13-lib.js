'use strict';
/*
 * İ13 — ortak yardımcılar (canlı H2 kabulü). Yeni mekanizma YOK: kurulum İ3 `setupI3`, kimlik bağı İ12
 * `assertReceiptIdentity`, ölçüm İ3 `i3-h2-address` (runH2). Burada yalnız erişim kapanışı + izolasyon + kapılar var.
 */
const path = require('path');
const I3 = path.resolve(__dirname, '../../client-acceptance-runners-i3-r01/scripts');
const L = require(path.join(I3, 'i3-lib'));
const { assertReceiptIdentity } = require('../../client-live-acceptance-i12-r01/scripts/i12-live-identity');
const crypto = require('crypto');

function dbName(u) { try { return decodeURIComponent(new URL(u).pathname.replace(/^\//, '').split('/')[0]); } catch (e) { return null; } }

/** Canlı giriş kapıları — biri bile sağlanmazsa YAZMA YOK (exit 3 = onay, 4 = hedef/kimlik). */
function liveGates(env) {
  if (env.I13_LIVE_CONFIRM !== '1') return { code: 3, why: 'I13_LIVE_CONFIRM=1 gerekli' };
  if (!(env.I13_LIVE_GO_REF && /^OWNER-GO-CLIENT-I13-\d{8}-R\d{2}$/.test(env.I13_LIVE_GO_REF.trim()))) return { code: 3, why: 'I13_LIVE_GO_REF biçimi (OWNER-GO-CLIENT-I13-YYYYMMDD-RNN) gerekli' };
  const runId = String(env.I13_RUNID || '').toLowerCase();
  if (!/^[0-9a-f]{8}$/.test(runId)) return { code: 2, why: 'I13_RUNID 8 hex olmalı' };
  const bound = dbName(env.AH_DATABASE_URL || '');
  if (!env.I13_EXPECT_DB || env.I13_EXPECT_DB !== bound) return { code: 4, why: `beklenen DB '${env.I13_EXPECT_DB || ''}' != bağlı '${bound || ''}'` };
  if (env.I13_EXPECT_TENANT_SLUG !== `${L.AH.TENANT_PREFIX}${runId}`) return { code: 4, why: 'hedef slug beyanı runId\'den türetilen ile eşleşmiyor' };
  if (!env.I13_API_BASE || env.I13_API_BASE !== env.I13_EXPECT_API) return { code: 4, why: 'API adresi beyanı eşleşmiyor' };
  return { code: 0, runId };
}

/** Sentetik tenant'lar HARİÇ tüm tenant'ların client/user dağılım parmak izi (salt-okuma). */
async function isolationFingerprint(prisma, excludeIds) {
  const ex = new Set(excludeIds.filter(Boolean));
  const [clients, users] = await Promise.all([
    prisma.client.groupBy({ by: ['tenantId'], _count: { _all: true } }),
    prisma.user.groupBy({ by: ['tenantId'], _count: { _all: true } }),
  ]);
  const acc = new Map();
  for (const r of clients) if (!ex.has(r.tenantId)) acc.set(r.tenantId, { c: r._count._all, u: 0 });
  for (const r of users) if (!ex.has(r.tenantId)) { const e = acc.get(r.tenantId) || { c: 0, u: 0 }; e.u = r._count._all; acc.set(r.tenantId, e); }
  const rows = [...acc.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([id, v]) => `${id}:${v.c}:${v.u}`);
  return { tenants: rows.length, digest: crypto.createHash('sha256').update(rows.join('|')).digest('hex').slice(0, 16) };
}

/**
 * NİHAİ ERİŞİM KAPANIŞI — önce kimlik bağı (hedef/yabancı ID↔slug↔runId); doğrulanmazsa SIFIR YAZMA.
 * Hedef+yabancı: tüm kullanıcılar isActive=false + tokenVersion++ · hedef Case ACTIVE→CLOSED (cron maruziyeti).
 * Kanıt satırları SİLİNMEZ. Tekrarı güvenlidir.
 */
async function closeAccess(prisma, receipt) {
  const ident = await assertReceiptIdentity(prisma, receipt);
  if (!ident.ok) return { ok: false, wroteNothing: true, reason: ident.reason };
  const out = { ok: false, tenants: [] };
  for (const t of [ident.target, ident.foreign].filter(Boolean)) {
    await prisma.user.updateMany({ where: { tenantId: t.id }, data: { isActive: false, tokenVersion: { increment: 1 } } });
    const cases = await prisma.case.updateMany({ where: { tenantId: t.id, status: 'ACTIVE' }, data: { status: 'CLOSED' } });
    const active = await prisma.user.count({ where: { tenantId: t.id, isActive: true } });
    const activeCases = await prisma.case.count({ where: { tenantId: t.id, status: 'ACTIVE' } });
    out.tenants.push({ slug: t.slug, activeUsers: active, casesClosedNow: cases.count, activeCases, ok: active === 0 && activeCases === 0 });
  }
  out.ok = out.tenants.length > 0 && out.tenants.every((x) => x.ok);
  return out;
}

module.exports = { L, I3, liveGates, isolationFingerprint, closeAccess, dbName };
