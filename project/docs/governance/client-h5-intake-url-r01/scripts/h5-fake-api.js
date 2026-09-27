'use strict';
/*
 * H5-URL R02 ÖZ-TEST — SAHTE API + SAHTE DIŞ HTTPS SUNUCU. YALNIZ DISPOSABLE DB. CANLIYA DOKUNMAZ.
 *
 * NE GERÇEK : disposable PostgreSQL (canlı şemanın migration'ları) ve canlı sürümün Prisma istemcisi; bağlantı
 *             kaydı, iptal ve kapanış GERÇEK tablolara yazılır. Dış sunucu GERÇEK TLS ile çalışır; istemci sertifikayı
 *             doğrular (test sertifikası NODE_EXTRA_CA_CERTS ile güvenilir kılınır, doğrulama KAPATILMAZ).
 * NE SAHTE  : Nest API'si. Uçlar ürünün yanıt BİÇİMİNİ taklit eder; ürünün kendi yetki/iş kuralları burada
 *             ÖLÇÜLMEZ. Bu sunucunun amacı kabul betiğinin davranışını (hangi ucu çağırdığı, URL kapısı, zaman aşımı,
 *             iptal hatası, kapanış sırası, sır sızıntısı) gerçek DB durumlarına karşı ölçmektir.
 *
 * argv/env: H5F_DB_URL, H5F_PRISMA_ROOT, H5F_BCRYPT, H5F_API_PORT, H5F_EXT_PORT, H5F_FOREIGN_PORT, H5F_CERT, H5F_KEY
 * Kontrol uçları (yalnız 127.0.0.1): POST /__scenario · POST /__reset · GET /__calls · GET /__ext · GET /__foreign
 *                                   GET /__secrets (üretilen ham token + JWT listesi; sızıntı taraması için)
 */
const http = require('http'); const https = require('https'); const fs = require('fs'); const crypto = require('crypto');
const path = require('path');

const { PrismaClient } = require(path.join(process.env.H5F_PRISMA_ROOT));
const bcrypt = require(process.env.H5F_BCRYPT);
const prisma = new PrismaClient({ datasources: { db: { url: process.env.H5F_DB_URL } } });

const API_PORT = Number(process.env.H5F_API_PORT || 8196);
const EXT_PORT = Number(process.env.H5F_EXT_PORT || 8453);
const FOREIGN_PORT = Number(process.env.H5F_FOREIGN_PORT || 8454);
const EXT_ORIGIN = `https://localhost:${EXT_PORT}`;
const FOREIGN_ORIGIN = `https://localhost:${FOREIGN_PORT}`;

let scenario = { create: 'normal', revoke: 'normal', public: 'normal', page: 'normal' };
let calls = []; let extCalls = []; let foreignCalls = []; const secrets = { rawTokens: [], jwts: [] };
const mask = (p) => p.replace(/\/intake\/[^/?]+/g, '/intake/<token>');

function send(res, status, obj, headers) {
  const body = obj === undefined ? '' : (typeof obj === 'string' ? obj : JSON.stringify(obj));
  res.writeHead(status, Object.assign({ 'content-type': typeof obj === 'string' ? 'text/html; charset=utf-8' : 'application/json' }, headers || {}));
  res.end(body);
}
async function readBody(req) { return new Promise((ok) => { let b = ''; req.on('data', (c) => { b += c; }); req.on('end', () => { try { ok(b ? JSON.parse(b) : {}); } catch (e) { ok({ __invalid: true }); } }); }); }

async function authUser(req) {
  const h = String(req.headers.authorization || '');
  if (!h.startsWith('Bearer fake.')) return null;
  let claim; try { claim = JSON.parse(Buffer.from(h.slice('Bearer fake.'.length), 'base64url').toString('utf8')); } catch (e) { return null; }
  const u = await prisma.user.findUnique({ where: { id: claim.uid }, select: { id: true, tenantId: true, isActive: true, tokenVersion: true } });
  if (!u || !u.isActive || u.tenantId !== claim.tid || u.tokenVersion !== claim.tv) return null;
  return u;
}

async function publicValidate(token) {
  if (scenario.public === '503') return { status: 503 };
  const tokenHash = crypto.createHash('sha256').update(String(token)).digest('hex');
  const l = await prisma.clientIntakeLink.findFirst({ where: { tokenHash }, select: { status: true, expiresAt: true, useCount: true, maxUses: true, scope: true } });
  if (!l || l.status !== 'ACTIVE' || (l.expiresAt && l.expiresAt.getTime() <= Date.now()) || l.useCount >= l.maxUses) return { status: 404 };
  return { status: 200, body: { data: { scope: l.scope } } };
}

const PUBLIC_SELECT = { id: true, tenantId: true, caseId: true, clientId: true, status: true, scope: true, expiresAt: true, maxUses: true, useCount: true, createdById: true, createdAt: true };

async function apiHandler(req, res) {
  const url = new URL(req.url, 'http://127.0.0.1'); const p = url.pathname;
  if (p.startsWith('/__')) {
    if (req.method === 'POST' && p === '/__scenario') { scenario = Object.assign({ create: 'normal', revoke: 'normal', public: 'normal', page: 'normal' }, await readBody(req)); return send(res, 200, scenario); }
    if (req.method === 'POST' && p === '/__reset') { calls = []; extCalls = []; foreignCalls = []; secrets.rawTokens = []; secrets.jwts = []; return send(res, 200, { ok: true }); }
    if (p === '/__calls') return send(res, 200, calls);
    if (p === '/__ext') return send(res, 200, extCalls);
    if (p === '/__foreign') return send(res, 200, foreignCalls);
    if (p === '/__secrets') return send(res, 200, secrets);
    return send(res, 404, {});
  }
  const body = (req.method === 'POST') ? await readBody(req) : {};
  calls.push({ method: req.method, path: mask(p), bodyKeys: Object.keys(body || {}).sort() });

  // GÖNDERİM YAPAN UÇLAR — kabul betiği bunları ASLA çağırmamalı.
  if (req.method === 'POST' && (/^\/api\/client-intake-links\/case\//.test(p) || /\/create-and-deliver$/.test(p))) {
    calls[calls.length - 1].forbidden = true; return send(res, 500, { message: 'FORBIDDEN_DISPATCH_ENDPOINT_CALLED' });
  }
  if (req.method === 'POST' && p === '/api/auth/login') {
    const t = await prisma.tenant.findFirst({ where: { slug: body.tenantSlug }, select: { id: true } });
    const u = t ? await prisma.user.findFirst({ where: { tenantId: t.id, email: body.email }, select: { id: true, tenantId: true, isActive: true, tokenVersion: true, passwordHash: true } }) : null;
    if (!u || !u.isActive || !u.passwordHash || !(await bcrypt.compare(String(body.password || ''), u.passwordHash))) return send(res, 401, { message: 'Unauthorized' });
    const jwt = 'fake.' + Buffer.from(JSON.stringify({ uid: u.id, tid: u.tenantId, tv: u.tokenVersion })).toString('base64url');
    secrets.jwts.push(jwt);
    return send(res, 201, { access_token: jwt });
  }
  let m = p.match(/^\/api\/clients\/([^/]+)\/cases\/([^/]+)\/intake-links$/);
  if (req.method === 'POST' && m) {
    const u = await authUser(req); if (!u) return send(res, 401, { message: 'Unauthorized' });
    if (Object.prototype.hasOwnProperty.call(body, 'clientId')) return send(res, 400, { message: 'property clientId should not exist' });
    if (!Array.isArray(body.scope) || body.scope.length === 0) return send(res, 400, { message: 'scope' });
    const [, clientId, caseId] = m;
    const cc = await prisma.caseClient.findFirst({ where: { caseId, clientId, case: { tenantId: u.tenantId }, client: { tenantId: u.tenantId } }, select: { id: true } });
    if (!cc) return send(res, 404, { message: 'boundary' });
    const raw = crypto.randomBytes(32).toString('base64url'); secrets.rawTokens.push(raw);
    const link = await prisma.clientIntakeLink.create({
      data: { tenantId: u.tenantId, caseId, clientId, tokenHash: crypto.createHash('sha256').update(raw).digest('hex'), status: 'ACTIVE', scope: body.scope, maxUses: 1, createdById: u.id },
      select: PUBLIC_SELECT,
    });
    if (scenario.create === 'timeout') return; // kayıt OLUŞTU, yanıt HİÇ gelmez
    const originForUrl = scenario.create === 'badurl' ? FOREIGN_ORIGIN : EXT_ORIGIN;
    return send(res, 201, { data: { link, rawToken: raw, intakeUrl: `${originForUrl}/intake/${raw}` } });
  }
  m = p.match(/^\/api\/client-intake-links\/([^/]+)\/revoke$/);
  if (req.method === 'POST' && m) {
    const u = await authUser(req); if (!u) return send(res, 401, { message: 'Unauthorized' });
    if (scenario.revoke === 'fail') return send(res, 500, { message: 'Internal server error' });
    const l = await prisma.clientIntakeLink.findFirst({ where: { id: m[1], tenantId: u.tenantId }, select: { id: true, status: true } });
    if (!l) return send(res, 404, { message: 'İntake linki bulunamadı' });
    if (l.status !== 'ACTIVE') return send(res, 400, { message: `Yalnız ACTIVE link iptal edilebilir (durum: ${l.status})` });
    const upd = await prisma.clientIntakeLink.update({ where: { id: l.id }, data: { status: 'REVOKED' }, select: PUBLIC_SELECT });
    return send(res, 201, upd);
  }
  m = p.match(/^\/api\/client-intake-links\/([^/]+)$/);
  if (req.method === 'GET' && m) {
    const u = await authUser(req); if (!u) return send(res, 401, { message: 'Unauthorized' });
    const l = await prisma.clientIntakeLink.findFirst({ where: { id: m[1], tenantId: u.tenantId }, select: PUBLIC_SELECT });
    return l ? send(res, 200, l) : send(res, 404, {});
  }
  m = p.match(/^\/api\/public\/intake\/([^/]+)$/);
  if (req.method === 'GET' && m) { const r = await publicValidate(m[1]); return send(res, r.status, r.body || { message: 'Geçersiz bağlantı' }); }
  return send(res, 404, { message: 'Not Found' });
}

async function extHandler(req, res) {
  const p = new URL(req.url, EXT_ORIGIN).pathname; extCalls.push({ method: req.method, path: mask(p) });
  let m = p.match(/^\/intake\/([^/]+)$/);
  if (req.method === 'GET' && m) {
    if (scenario.page === 'redirect') return send(res, 302, '', { location: `${FOREIGN_ORIGIN}/landing` });
    return send(res, 200, '<!doctype html><title>intake</title>');
  }
  m = p.match(/^\/api\/public\/intake\/([^/]+)$/);
  if (req.method === 'GET' && m) { const r = await publicValidate(m[1]); return send(res, r.status, r.body || { message: 'Geçersiz bağlantı' }); }
  return send(res, 403, 'forbidden');
}
function foreignHandler(req, res) { foreignCalls.push({ method: req.method, path: mask(new URL(req.url, FOREIGN_ORIGIN).pathname) }); send(res, 200, 'foreign'); }

const tls = { cert: fs.readFileSync(process.env.H5F_CERT), key: fs.readFileSync(process.env.H5F_KEY) };
const wrap = (h) => (req, res) => Promise.resolve(h(req, res)).catch((e) => { try { send(res, 500, { message: 'fake error' }); } catch (x) { /* yanıt zaten kapandı */ } });
http.createServer(wrap(apiHandler)).listen(API_PORT, '127.0.0.1');
https.createServer(tls, wrap(extHandler)).listen(EXT_PORT, '127.0.0.1');
https.createServer(tls, foreignHandler).listen(FOREIGN_PORT, '127.0.0.1');
console.log(`h5-fake-api hazır api=${API_PORT} ext=${EXT_PORT} foreign=${FOREIGN_PORT}`);
