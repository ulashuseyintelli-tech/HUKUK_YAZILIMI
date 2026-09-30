'use strict';
/*
 * EXTACC D-5 ÖZ-TEST — SAHTE PORTAL API + SAHTE DIŞ HTTPS SUNUCU + SAHTE POSTA KUTUSU. YALNIZ DISPOSABLE DB. CANLIYA DOKUNMAZ.
 *
 * d4-fake-portal-api.js'in D-5 genişlemesi. NE GERÇEK: disposable PostgreSQL + canlı sürümün Prisma istemcisi; hesap, token,
 * parola hash'i, sürüm, kapanış GERÇEK tablolara yazılır; dış sunucu GERÇEK TLS. NE SAHTE: Nest API'si ve e-posta sağlayıcısı.
 * Sıfırlama mantığı ürün kaynağından taklit edilir (portal.service.ts createResetToken / resetPassword / disablePortalUser,
 * D5-SEC-R01 sonrası): token sha256 özeti DB'de, ham token yalnız "e-postada" (buradaki sahte posta kutusunda, /__mail),
 * süre 1 saat, sıfırlama TEK atomik updateMany (isActive:true + süre + özet) ile parola + tokenVersion++ + token NULL,
 * kapatma token'ı NULL'a çeker. Ürünün hız sınırı ve tenant yaşam döngüsü burada ÖLÇÜLMEZ.
 *
 * env: D5F_DB_URL, D5F_PRISMA_ROOT, D5F_BCRYPT, D5F_API_PORT, D5F_EXT_PORT, D5F_CERT, D5F_KEY
 * Kontrol uçları (yalnız 127.0.0.1): POST /__scenario · POST /__reset · GET /__calls · GET /__ext · GET /__secrets · GET /__mail
 *                                   · POST /__release
 * Senaryolar: create normal|fail|late|hold · disable normal|fail|failOnce|keepToken (KUSUR TAKLİDİ: kapatma token'ı silmez) ·
 *             forgot normal|noWrite (token yazılmaz, posta yok)|fail · reset normal|reuse (KUSUR: token tüketilmez)|noBump (KUSUR:
 *             sürüm artmaz)|fail · guard normal|stale · ext normal|503 · extLogin normal|503 · wrongPw normal|acceptAny · cases normal|leak
 * KOŞUCU YASAĞI: API tarafındaki forgot-password YALNIZ `.invalid` adresle çağrılabilir (gönderimsiz bilinmeyen-adres kontrolü);
 *                başka adresle çağrı, reset-password/change-password/documents/messages çağrıları FORBIDDEN olarak işaretlenir.
 */
const http = require('http'); const https = require('https'); const fs = require('fs'); const path = require('path'); const crypto = require('crypto');

const { PrismaClient } = require(path.join(process.env.D5F_PRISMA_ROOT));
const bcrypt = require(process.env.D5F_BCRYPT);
const prisma = new PrismaClient({ datasources: { db: { url: process.env.D5F_DB_URL } } });
const API_PORT = Number(process.env.D5F_API_PORT || 8198);
const EXT_PORT = Number(process.env.D5F_EXT_PORT || 8456);
const EXT_ORIGIN = `https://localhost:${EXT_PORT}`;
const PORTAL_PASSWORD_MIN_LENGTH = 8; // D5-SEC-R01 API politikası

const DEFAULT = { create: 'normal', disable: 'normal', forgot: 'normal', reset: 'normal', guard: 'normal', ext: 'normal', extLogin: 'normal', wrongPw: 'normal', cases: 'normal' };
const LATE_CREATE_MS = 3000;
const heldCreates = [];
let scenario = Object.assign({}, DEFAULT); let disableFailed = 0;
let calls = []; let extCalls = []; let mail = [];
const secrets = { jwts: [], portalJwts: [], portalPasswords: [], loginPasswords: [], rawTokens: [], newPasswords: [] };

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
async function portalUser(req) {
  const c = claimOf(req, 'pfake.'); if (!c || c.type !== 'portal') return null;
  if (scenario.guard === 'stale') return { clientId: c.cid, tenantId: c.tid }; // KUSUR TAKLİDİ — yalnız negatif test
  const u = await prisma.clientPortalUser.findUnique({ where: { id: c.sub }, select: { isActive: true, clientId: true, tokenVersion: true, client: { select: { tenantId: true } } } });
  if (!u || !u.isActive || u.clientId !== c.cid || u.client.tenantId !== c.tid || u.tokenVersion !== c.tv) return null;
  return { clientId: u.clientId, tenantId: u.client.tenantId };
}

async function portalLogin(body) {
  secrets.loginPasswords.push(String(body.password || ''));
  const u = await prisma.clientPortalUser.findFirst({ where: { email: String(body.email || ''), isActive: true }, select: { id: true, clientId: true, email: true, passwordHash: true, tokenVersion: true, client: { select: { tenantId: true, displayName: true } } } });
  if (!u || (scenario.wrongPw !== 'acceptAny' && !(await bcrypt.compare(String(body.password || ''), u.passwordHash)))) return { status: 401, body: { message: 'Geçersiz e-posta veya şifre' } };
  await prisma.clientPortalUser.update({ where: { id: u.id }, data: { lastLoginAt: new Date(), loginCount: { increment: 1 } } });
  const token = 'pfake.' + Buffer.from(JSON.stringify({ sub: u.id, cid: u.clientId, tid: u.client.tenantId, tv: u.tokenVersion, type: 'portal' })).toString('base64url');
  secrets.portalJwts.push(token);
  return { status: 201, body: { token, user: { id: u.id, email: u.email, clientId: u.clientId, clientName: u.client.displayName } } };
}
async function portalCases(req) {
  const pu = await portalUser(req); if (!pu) return { status: 401, body: { message: 'Unauthorized' } };
  const where = scenario.cases === 'leak' ? { fileNumber: { startsWith: 'I3-' } } : { tenantId: pu.tenantId, showToClient: true, OR: [{ clientId: pu.clientId }, { caseClients: { some: { clientId: pu.clientId } } }] };
  return { status: 200, body: await prisma.case.findMany({ where, select: { id: true, fileNumber: true, caseStatus: true, createdAt: true }, orderBy: { createdAt: 'desc' }, take: 20 }) };
}
/** createResetToken taklidi: aktif hesap → ham token üret, sha256 özeti KOŞULLU (isActive:true) yaz, "e-posta" sahte kutuya düşer. Dış cevap hep {success:true}. */
async function forgot(body) {
  if (scenario.forgot === 'fail') return { status: 500, body: { message: 'Internal server error' } };
  const email = String(body.email || '');
  const u = await prisma.clientPortalUser.findFirst({ where: { email, isActive: true }, select: { id: true } });
  if (!u || scenario.forgot === 'noWrite') return { status: 201, body: { success: true } };
  const rawToken = crypto.randomBytes(32).toString('hex'); const resetToken = crypto.createHash('sha256').update(rawToken, 'utf8').digest('hex');
  const written = await prisma.clientPortalUser.updateMany({ where: { id: u.id, isActive: true }, data: { resetToken, resetTokenExp: new Date(Date.now() + 3600000) } });
  if (written.count !== 1) return { status: 201, body: { success: true } };
  secrets.rawTokens.push(rawToken);
  mail.push({ to: email, url: `${EXT_ORIGIN}/portal/reset-password#token=${encodeURIComponent(rawToken)}`, at: new Date().toISOString() }); // YALNIZ TEST: gerçek gönderim yok
  return { status: 201, body: { success: true } };
}
/** resetPassword taklidi: politika (8) token tüketilmeden; TEK atomik updateMany (özet + süre + isActive:true) → parola + sürüm++ + token NULL. */
async function reset(body) {
  if (scenario.reset === 'fail') return { status: 500, body: { message: 'Internal server error' } };
  const token = String(body.token || ''); const pw = String(body.password || '');
  if (pw.length < PORTAL_PASSWORD_MIN_LENGTH) return { status: 400, body: { message: `Şifre en az ${PORTAL_PASSWORD_MIN_LENGTH} karakter olmalıdır` } };
  secrets.newPasswords.push(pw);
  const data = { passwordHash: await bcrypt.hash(pw, 10) };
  if (scenario.reset !== 'reuse') { data.resetToken = null; data.resetTokenExp = null; }      // reuse: KUSUR — token tüketilmez
  if (scenario.reset !== 'noBump') data.tokenVersion = { increment: 1 };                        // noBump: KUSUR — eski oturumlar düşmez
  const r = await prisma.clientPortalUser.updateMany({ where: { resetToken: crypto.createHash('sha256').update(token, 'utf8').digest('hex'), resetTokenExp: { gt: new Date() }, isActive: true }, data });
  if (r.count === 0) return { status: 400, body: { message: 'Geçersiz veya süresi dolmuş token' } };
  return { status: 201, body: { success: true } };
}

async function apiHandler(req, res) {
  const p = new URL(req.url, 'http://127.0.0.1').pathname;
  if (p.startsWith('/__')) {
    if (req.method === 'POST' && p === '/__scenario') { scenario = Object.assign({}, DEFAULT, await readBody(req)); disableFailed = 0; return send(res, 200, scenario); }
    if (req.method === 'POST' && p === '/__reset') { calls = []; extCalls = []; mail = []; for (const k of Object.keys(secrets)) secrets[k] = []; return send(res, 200, { ok: true }); }
    if (p === '/__calls') return send(res, 200, calls);
    if (p === '/__ext') return send(res, 200, extCalls);
    if (p === '/__secrets') return send(res, 200, secrets);
    if (p === '/__mail') return send(res, 200, mail);
    if (req.method === 'POST' && p === '/__release') { let n = 0; while (heldCreates.length) { await heldCreates.shift()(); n++; } return send(res, 200, { released: n }); }
    return send(res, 404, {});
  }
  const body = req.method === 'POST' ? await readBody(req) : {};
  calls.push({ method: req.method, path: p, bodyKeys: Object.keys(body || {}).sort() });
  // Koşucunun ASLA çağırmaması gereken uçlar; forgot-password YALNIZ `.invalid` adresle (gönderimsiz kontrol) serbesttir.
  if (/^\/api\/portal\/(reset-password|change-password|documents|messages)/.test(p) || (p === '/api/portal/forgot-password' && !/\.invalid$/i.test(String(body.email || '')))) {
    calls[calls.length - 1].forbidden = true; return send(res, 500, { message: 'FORBIDDEN_PORTAL_ENDPOINT_CALLED' });
  }
  if (req.method === 'POST' && p === '/api/portal/forgot-password') { const r = await forgot(body); return send(res, r.status, r.body); }
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
    secrets.portalPasswords.push(String(body.password || ''));
    const passwordHash = await bcrypt.hash(String(body.password || ''), 10);
    const write = async () => {
      const pu = existing
        ? await prisma.clientPortalUser.update({ where: { id: existing.id }, data: { isActive: true, email: body.email, passwordHash, tokenVersion: { increment: 1 }, resetToken: null, resetTokenExp: null } })
        : await prisma.clientPortalUser.create({ data: { clientId: body.clientId, email: body.email, passwordHash } });
      await prisma.client.update({ where: { id: body.clientId }, data: { hasPortalAccess: true, portalUserId: pu.id } });
      return pu;
    };
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
    const data = { isActive: false, tokenVersion: { increment: 1 } };
    if (scenario.disable !== 'keepToken') { data.resetToken = null; data.resetTokenExp = null; } // keepToken: KUSUR — D5-SEC-R01 öncesi davranış
    await prisma.$transaction(async (tx) => {
      await tx.clientPortalUser.updateMany({ where: { clientId: body.clientId }, data });
      await tx.client.update({ where: { id: body.clientId }, data: { hasPortalAccess: false } });
    });
    return send(res, 201, { success: true });
  }
  if (req.method === 'POST' && p === '/api/portal/login') { const r = await portalLogin(body); return send(res, r.status, r.body); }
  if (req.method === 'GET' && p === '/api/portal/cases') { const r = await portalCases(req); return send(res, r.status, r.body); }
  return send(res, 404, { message: 'Not Found' });
}

/** Dış sunucu: kenar izin listesinin portal parçası (giriş + şifremi unuttum + sıfırlama + dosya listesi); gerisi 403. */
async function extHandler(req, res) {
  const p = new URL(req.url, EXT_ORIGIN).pathname; extCalls.push({ method: req.method, path: p });
  if (scenario.ext === '503') return send(res, 503, 'unavailable');
  if (req.method === 'GET' && (p === '/portal/login' || p === '/portal/forgot-password' || p === '/portal/reset-password')) return send(res, 200, '<!doctype html><title>portal</title>');
  if (req.method === 'POST' && p === '/api/portal/login') { if (scenario.extLogin === '503') return send(res, 503, 'unavailable'); const r = await portalLogin(await readBody(req)); return send(res, r.status, r.body); }
  if (req.method === 'POST' && p === '/api/portal/forgot-password') { const r = await forgot(await readBody(req)); return send(res, r.status, r.body); }
  if (req.method === 'POST' && p === '/api/portal/reset-password') { const r = await reset(await readBody(req)); return send(res, r.status, r.body); }
  if (req.method === 'GET' && p === '/api/portal/cases') { const r = await portalCases(req); return send(res, r.status, r.body); }
  return send(res, 403, 'forbidden');
}

const tls = { cert: fs.readFileSync(process.env.D5F_CERT), key: fs.readFileSync(process.env.D5F_KEY) };
const wrap = (h) => (req, res) => Promise.resolve(h(req, res)).catch(() => { try { send(res, 500, { message: 'fake error' }); } catch (x) { /* yanıt zaten kapandı */ } });
http.createServer(wrap(apiHandler)).listen(API_PORT, '127.0.0.1');
https.createServer(tls, wrap(extHandler)).listen(EXT_PORT, '127.0.0.1');
console.log(`d5-fake-portal-api hazır api=${API_PORT} ext=${EXT_PORT}`);
