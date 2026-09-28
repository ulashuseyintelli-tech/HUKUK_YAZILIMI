'use strict';
/*
 * EXTACC D-4 ÖZ-TEST — SAHTE PORTAL API + SAHTE DIŞ HTTPS SUNUCU. YALNIZ DISPOSABLE DB. CANLIYA DOKUNMAZ.
 *
 * NE GERÇEK : disposable PostgreSQL (canlı şemanın migration'ları) + canlı sürümün Prisma istemcisi; portal hesabı,
 *             giriş sayacı, devre dışı bırakma ve kapanış GERÇEK tablolara yazılır. Dış sunucu GERÇEK TLS ile çalışır.
 * NE SAHTE  : Nest API'si. Uçlar ürünün yanıt BİÇİMİNİ ve portal mantığını taklit eder (kaynak: portal.service.ts
 *             createPortalUser / login / disablePortalUser / getClientCases + portal-auth.guard.ts). Ürünün kendi
 *             yetki kuralları (isApproverEligible, hız sınırı, tenant yaşam döngüsü) burada ÖLÇÜLMEZ.
 *
 * env: D4F_DB_URL, D4F_PRISMA_ROOT, D4F_BCRYPT, D4F_API_PORT, D4F_EXT_PORT, D4F_CERT, D4F_KEY
 * Kontrol uçları (yalnız 127.0.0.1): POST /__scenario · POST /__reset · GET /__calls · GET /__ext · GET /__secrets ·
 *                                   POST /__release (create=hold ile bekletilen hesap kayıtlarını ŞİMDİ yazar)
 * Senaryolar: create normal|fail|late (yanıt YOK, kayıt sabit 3 sn sonra)|hold (yanıt YOK, kayıt yalnız /__release ile) ·
 *             disable normal|fail|failOnce · guard normal|stale (ÜRÜN KUSURU TAKLİDİ: portal oturumu DB'ye bakmadan kabul
 *             edilir) · ext normal|503 · extLogin normal|503 (yalnız dış giriş ucu) · wrongPw normal|acceptAny (KUSUR
 *             TAKLİDİ: parola denetlenmez) · cases normal|leak (başka müvekkilin dosyası da döner)
 */
const http = require('http'); const https = require('https'); const fs = require('fs'); const path = require('path');

const { PrismaClient } = require(path.join(process.env.D4F_PRISMA_ROOT));
const bcrypt = require(process.env.D4F_BCRYPT);
const prisma = new PrismaClient({ datasources: { db: { url: process.env.D4F_DB_URL } } });
const API_PORT = Number(process.env.D4F_API_PORT || 8197);
const EXT_PORT = Number(process.env.D4F_EXT_PORT || 8455);
const EXT_ORIGIN = `https://localhost:${EXT_PORT}`;

const DEFAULT = { create: 'normal', disable: 'normal', guard: 'normal', ext: 'normal', extLogin: 'normal', wrongPw: 'normal', cases: 'normal' };
const LATE_CREATE_MS = 3000; // create=late: sabit gecikme (istekten gelen değer süreyi belirlemez)
const heldCreates = [];       // create=hold: /__reset bu listeyi SİLMEZ
let scenario = Object.assign({}, DEFAULT); let disableFailed = 0;
let calls = []; let extCalls = []; const secrets = { jwts: [], portalJwts: [], portalPasswords: [], loginPasswords: [] };

function send(res, status, obj) {
  const body = obj === undefined ? '' : (typeof obj === 'string' ? obj : JSON.stringify(obj));
  res.writeHead(status, { 'content-type': typeof obj === 'string' ? 'text/html; charset=utf-8' : 'application/json' });
  res.end(body);
}
async function readBody(req) { return new Promise((ok) => { let b = ''; req.on('data', (c) => { b += c; }); req.on('end', () => { try { ok(b ? JSON.parse(b) : {}); } catch (e) { ok({ __invalid: true }); } }); }); }
const claimOf = (req, prefix) => {
  const h = String(req.headers.authorization || ''); if (!h.startsWith(`Bearer ${prefix}`)) return null;
  try { return JSON.parse(Buffer.from(h.slice(`Bearer ${prefix}`.length), 'base64url').toString('utf8')); } catch (e) { return null; }
};
async function staffUser(req) {
  const c = claimOf(req, 'fake.'); if (!c) return null;
  const u = await prisma.user.findUnique({ where: { id: c.uid }, select: { id: true, tenantId: true, isActive: true, tokenVersion: true } });
  return (!u || !u.isActive || u.tenantId !== c.tid || u.tokenVersion !== c.tv) ? null : u;
}
/** portal-auth.guard.ts taklidi: tür + DB'de aktif + müvekkil/tenant bağı + tokenVersion eşitliği (guard=stale → kusur taklidi). */
async function portalUser(req) {
  const c = claimOf(req, 'pfake.'); if (!c || c.type !== 'portal') return null;
  if (scenario.guard === 'stale') return { clientId: c.cid, tenantId: c.tid }; // KUSUR TAKLİDİ — yalnız negatif test
  const u = await prisma.clientPortalUser.findUnique({ where: { id: c.sub }, select: { isActive: true, clientId: true, tokenVersion: true, client: { select: { tenantId: true } } } });
  if (!u || !u.isActive || u.clientId !== c.cid || u.client.tenantId !== c.tid || u.tokenVersion !== c.tv) return null;
  return { clientId: u.clientId, tenantId: u.client.tenantId };
}

async function portalLogin(body) {
  secrets.loginPasswords.push(String(body.password || '')); // YALNIZ TEST: sızıntı taraması için (Recover ölçüm parolası dahil)
  const u = await prisma.clientPortalUser.findFirst({ where: { email: String(body.email || ''), isActive: true }, select: { id: true, clientId: true, email: true, passwordHash: true, tokenVersion: true, client: { select: { tenantId: true, displayName: true } } } });
  if (!u || (scenario.wrongPw !== 'acceptAny' && !(await bcrypt.compare(String(body.password || ''), u.passwordHash)))) return { status: 401, body: { message: 'Geçersiz e-posta veya şifre' } };
  await prisma.clientPortalUser.update({ where: { id: u.id }, data: { lastLoginAt: new Date(), loginCount: { increment: 1 } } });
  const token = 'pfake.' + Buffer.from(JSON.stringify({ sub: u.id, cid: u.clientId, tid: u.client.tenantId, tv: u.tokenVersion, type: 'portal' })).toString('base64url');
  secrets.portalJwts.push(token);
  return { status: 201, body: { token, user: { id: u.id, email: u.email, clientId: u.clientId, clientName: u.client.displayName } } };
}
async function portalCases(req) {
  const pu = await portalUser(req); if (!pu) return { status: 401, body: { message: 'Unauthorized' } };
  // leak: YALNIZ negatif test — kapsam dışı dosyaları da döndüren hatalı sunucu (tüm I3 sentetik dosyaları).
  const where = scenario.cases === 'leak' ? { fileNumber: { startsWith: 'I3-' } } : { tenantId: pu.tenantId, showToClient: true, OR: [{ clientId: pu.clientId }, { caseClients: { some: { clientId: pu.clientId } } }] };
  return { status: 200, body: await prisma.case.findMany({ where, select: { id: true, fileNumber: true, caseStatus: true, createdAt: true }, orderBy: { createdAt: 'desc' }, take: 20 }) };
}

async function apiHandler(req, res) {
  const p = new URL(req.url, 'http://127.0.0.1').pathname;
  if (p.startsWith('/__')) {
    if (req.method === 'POST' && p === '/__scenario') { scenario = Object.assign({}, DEFAULT, await readBody(req)); disableFailed = 0; return send(res, 200, scenario); }
    if (req.method === 'POST' && p === '/__reset') { calls = []; extCalls = []; secrets.jwts = []; secrets.portalJwts = []; secrets.portalPasswords = []; secrets.loginPasswords = []; return send(res, 200, { ok: true }); }
    if (p === '/__calls') return send(res, 200, calls);
    if (p === '/__ext') return send(res, 200, extCalls);
    if (p === '/__secrets') return send(res, 200, secrets);
    if (req.method === 'POST' && p === '/__release') { let n = 0; while (heldCreates.length) { await heldCreates.shift()(); n++; } return send(res, 200, { released: n }); }
    return send(res, 404, {});
  }
  const body = req.method === 'POST' ? await readBody(req) : {};
  calls.push({ method: req.method, path: p, bodyKeys: Object.keys(body || {}).sort() });
  // GÖNDERİM YAPABİLECEK / KAPSAM DIŞI portal uçları — koşucu ASLA çağırmamalı.
  if (/^\/api\/portal\/(forgot-password|reset-password|change-password|documents|messages)/.test(p)) { calls[calls.length - 1].forbidden = true; return send(res, 500, { message: 'FORBIDDEN_PORTAL_ENDPOINT_CALLED' }); }
  if (req.method === 'POST' && p === '/api/auth/login') {
    const t = await prisma.tenant.findFirst({ where: { slug: body.tenantSlug }, select: { id: true } });
    const u = t ? await prisma.user.findFirst({ where: { tenantId: t.id, email: body.email }, select: { id: true, tenantId: true, isActive: true, tokenVersion: true, passwordHash: true } }) : null;
    if (!u || !u.isActive || !u.passwordHash || !(await bcrypt.compare(String(body.password || ''), u.passwordHash))) return send(res, 401, { message: 'Unauthorized' });
    const jwt = 'fake.' + Buffer.from(JSON.stringify({ uid: u.id, tid: u.tenantId, tv: u.tokenVersion })).toString('base64url');
    secrets.jwts.push(jwt); return send(res, 201, { access_token: jwt });
  }
  if (req.method === 'POST' && p === '/api/portal/admin/create-user') {
    const u = await staffUser(req); if (!u) return send(res, 401, { message: 'Unauthorized' });
    if (scenario.create === 'fail') return send(res, 500, { message: 'Internal server error' });
    const client = await prisma.client.findFirst({ where: { id: body.clientId, tenantId: u.tenantId }, select: { id: true } });
    if (!client) return send(res, 404, { message: 'Müvekkil bulunamadı' });
    const dup = await prisma.clientPortalUser.findFirst({ where: { email: body.email, isActive: true, clientId: { not: body.clientId } } });
    if (dup) return send(res, 409, { message: 'Bu e-posta başka bir aktif portal kullanıcısında kayıtlı' });
    const existing = await prisma.clientPortalUser.findUnique({ where: { clientId: body.clientId } });
    if (existing && existing.isActive) return send(res, 409, { message: 'Bu müvekkil için portal hesabı zaten mevcut' });
    // YALNIZ TEST: 'telefon' taklidi geçici parolayı konsol yerine buradan alır (koşucu parolayı hiçbir kanala yazmaz).
    secrets.portalPasswords.push(String(body.password || ''));
    const passwordHash = await bcrypt.hash(String(body.password || ''), 10);
    const write = async () => {
      const pu = existing
        ? await prisma.clientPortalUser.update({ where: { id: existing.id }, data: { isActive: true, email: body.email, passwordHash, tokenVersion: { increment: 1 } } })
        : await prisma.clientPortalUser.create({ data: { clientId: body.clientId, email: body.email, passwordHash } });
      await prisma.client.update({ where: { id: body.clientId }, data: { hasPortalAccess: true, portalUserId: pu.id } });
      return pu;
    };
    // Belirsiz oluşturma: istek kabul edilir, yanıt VERİLMEZ; kayıt sonra yazılır (geç oluşma).
    if (scenario.create === 'late') { setTimeout(() => { write().catch(() => {}); }, LATE_CREATE_MS); return; }
    if (scenario.create === 'hold') { heldCreates.push(write); return; }
    const pu = await write();
    return send(res, 201, { id: pu.id, email: pu.email, clientId: pu.clientId });
  }
  if (req.method === 'POST' && p === '/api/portal/admin/disable-user') {
    const u = await staffUser(req); if (!u) return send(res, 401, { message: 'Unauthorized' });
    if (scenario.disable === 'fail' || (scenario.disable === 'failOnce' && disableFailed === 0)) { disableFailed++; return send(res, 500, { message: 'Internal server error' }); }
    const client = await prisma.client.findFirst({ where: { id: body.clientId, tenantId: u.tenantId }, select: { id: true } });
    if (!client) return send(res, 404, { message: 'Müvekkil bulunamadı' });
    await prisma.$transaction(async (tx) => {
      await tx.clientPortalUser.updateMany({ where: { clientId: body.clientId }, data: { isActive: false, tokenVersion: { increment: 1 } } });
      await tx.client.update({ where: { id: body.clientId }, data: { hasPortalAccess: false } });
    });
    return send(res, 201, { success: true });
  }
  if (req.method === 'POST' && p === '/api/portal/login') { const r = await portalLogin(body); return send(res, r.status, r.body); }
  if (req.method === 'GET' && p === '/api/portal/cases') { const r = await portalCases(req); return send(res, r.status, r.body); }
  return send(res, 404, { message: 'Not Found' });
}

/** Dış sunucu: Caddy izin listesinin portal parçası (GET /portal/login · POST /api/portal/login · GET /api/portal/cases); gerisi 403. */
async function extHandler(req, res) {
  const p = new URL(req.url, EXT_ORIGIN).pathname; extCalls.push({ method: req.method, path: p });
  if (scenario.ext === '503') return send(res, 503, 'unavailable');
  if (req.method === 'GET' && p === '/portal/login') return send(res, 200, '<!doctype html><title>portal</title>');
  if (req.method === 'POST' && p === '/api/portal/login') { if (scenario.extLogin === '503') return send(res, 503, 'unavailable'); const r = await portalLogin(await readBody(req)); return send(res, r.status, r.body); }
  if (req.method === 'GET' && p === '/api/portal/cases') { const r = await portalCases(req); return send(res, r.status, r.body); }
  return send(res, 403, 'forbidden');
}

const tls = { cert: fs.readFileSync(process.env.D4F_CERT), key: fs.readFileSync(process.env.D4F_KEY) };
const wrap = (h) => (req, res) => Promise.resolve(h(req, res)).catch(() => { try { send(res, 500, { message: 'fake error' }); } catch (x) { /* yanıt zaten kapandı */ } });
http.createServer(wrap(apiHandler)).listen(API_PORT, '127.0.0.1');
https.createServer(tls, wrap(extHandler)).listen(EXT_PORT, '127.0.0.1');
console.log(`d4-fake-portal-api hazır api=${API_PORT} ext=${EXT_PORT}`);
