'use strict';
/*
 * EXTACC D-7 ÖZ-TEST — SAHTE PORTAL API + SAHTE DIŞ HTTPS SUNUCU. YALNIZ DISPOSABLE DB. CANLIYA DOKUNMAZ.
 *
 * d5-fake-portal-api.js'in D-7 genişlemesi. NE GERÇEK: disposable PostgreSQL + canlı sürümün Prisma istemcisi; hesap, mesaj,
 * bildirim, sürüm ve kapanış GERÇEK tablolara (ClientPortalUser/Client/PortalMessage/PortalNotification) yazılır; dış sunucu GERÇEK
 * TLS. NE SAHTE: Nest API'si. Mesaj mantığı ürün kaynağından taklit edilir (portal.service.ts R27: sendMessageFromClient →
 * resolveCaseReference(client) 400 "Geçersiz dosya referansı" · sendMessageFromOffice → müvekkil 404 + resolveCaseReference(office)
 * + PortalMessage OFFICE + PortalNotification MESAJ · getMessages clientId+tenantId asc 50 · unread-count OFFICE&!isRead ·
 * mark-read updateMany · admin GET `{ client, messages }` döner (getClientMessages; çıplak dizi DEĞİL) ve müvekkil mesajlarını okundu
 * işaretler). E-POSTA/AUDIT/OUTBOX YOK (kaynakla aynı).
 *
 * env: D7F_DB_URL, D7F_PRISMA_ROOT, D7F_BCRYPT, D7F_API_PORT (8200), D7F_EXT_PORT (8459), D7F_CERT, D7F_KEY
 * Kontrol uçları (yalnız 127.0.0.1): POST /__scenario · POST /__reset · GET /__calls · GET /__ext · GET /__secrets · POST /__release
 * Senaryolar: create normal|fail|late|hold · disable normal|fail|failOnce · guard normal|stale (KUSUR: kapalı hesabın oturumu geçer) ·
 *             ext normal|503 · extLogin normal|503 · wrongPw normal|acceptAny · cases normal|leak ·
 *             send normal|fail|foreignAccept (KUSUR: caseId doğrulanmaz, satır yazılır 201) ·
 *             list normal|leak (KUSUR: aynı tenantta BAŞKA müvekkilin mesajı da döner; ilk gönderimde tuzak satır yazılır) ·
 *             reply normal|fail|noNotify (bildirim satırı üretilmez)|hang (YANITSIZ: personel POST'u hiç yanıtlanmaz, satır yazılmaz) ·
 *             markRead normal|noop (KUSUR: okundu işaretlenmez) · unread normal|hang (YANITSIZ: unread-count hiç yanıtlanmaz)
 * KOŞUCU YASAĞI: forgot-password/reset-password/change-password/documents çağrıları FORBIDDEN olarak işaretlenir (500).
 */
const http = require('http'); const https = require('https'); const fs = require('fs'); const path = require('path'); const crypto = require('crypto');

const { PrismaClient } = require(path.join(process.env.D7F_PRISMA_ROOT));
const bcrypt = require(process.env.D7F_BCRYPT);
const prisma = new PrismaClient({ datasources: { db: { url: process.env.D7F_DB_URL } } });
const API_PORT = Number(process.env.D7F_API_PORT || 8200);
const EXT_PORT = Number(process.env.D7F_EXT_PORT || 8459);
const EXT_ORIGIN = `https://localhost:${EXT_PORT}`;
const CASE_REF_INVALID = 'Geçersiz dosya referansı';
const MSG_SELECT = { id: true, content: true, senderType: true, senderName: true, isRead: true, createdAt: true };

const DEFAULT = { create: 'normal', disable: 'normal', guard: 'normal', ext: 'normal', extLogin: 'normal', wrongPw: 'normal', cases: 'normal', send: 'normal', list: 'normal', reply: 'normal', markRead: 'normal', unread: 'normal' };
const HANG = () => new Promise(() => {}); // yanıtsız taklidi: istek asla yanıtlanmaz (istemci zaman aşımı → indeterminate)
const LATE_CREATE_MS = 3000;
const heldCreates = [];
let scenario = Object.assign({}, DEFAULT); let disableFailed = 0; let leakSeeded = new Set();
let calls = []; let extCalls = [];
const secrets = { jwts: [], portalJwts: [], portalPasswords: [], loginPasswords: [], leakContents: [] };

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
  const u = await prisma.user.findUnique({ where: { id: c.uid }, select: { id: true, tenantId: true, isActive: true, tokenVersion: true, name: true } });
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
/** resolveCaseReference taklidi (kaynak R27): verilmemişse undefined; biçimsiz/kapsam dışı/bulunmayan → 400 (varlık sızdırılmaz). */
async function resolveCaseRef(caseId, scope) {
  if (caseId === undefined || caseId === null || caseId === '') return undefined;
  if (typeof caseId !== 'string' || caseId.length > 64) throw Object.assign(new Error(CASE_REF_INVALID), { status: 400 });
  if (scope.actor === 'client' && scenario.send === 'foreignAccept') return caseId; // KUSUR TAKLİDİ — doğrulama yok
  const found = await prisma.case.findFirst({ where: { id: caseId, tenantId: scope.tenantId, ...(scope.actor === 'client' ? { showToClient: true } : {}), OR: [{ clientId: scope.clientId }, { caseClients: { some: { clientId: scope.clientId } } }] }, select: { id: true } });
  if (!found) throw Object.assign(new Error(CASE_REF_INVALID), { status: 400 });
  return found.id;
}
const httpErr = (e) => ({ status: e && e.status ? e.status : 500, body: { message: e && e.status ? e.message : 'Internal server error' } });

/** Müvekkil mesajı: yalnız PortalMessage satırı (bildirim/e-posta/audit YOK — kaynakla aynı). */
async function sendFromClient(req, body) {
  const pu = await portalUser(req); if (!pu) return { status: 401, body: { message: 'Unauthorized' } };
  if (scenario.send === 'fail') return { status: 500, body: { message: 'Internal server error' } };
  try {
    const caseRef = await resolveCaseRef(body.caseId, { actor: 'client', clientId: pu.clientId, tenantId: pu.tenantId });
    if (scenario.list === 'leak' && !leakSeeded.has(pu.clientId)) {
      // KUSUR TAKLİDİ için tuzak: aynı tenanttaki BAŞKA müvekkile ait bir mesaj satırı (içerik gizli sayılır; kanıta girmemeli).
      const other = await prisma.client.findFirst({ where: { tenantId: pu.tenantId, id: { not: pu.clientId } }, select: { id: true } });
      if (other) { const leak = 'LEAK-' + crypto.randomBytes(8).toString('hex'); secrets.leakContents.push(leak);
        await prisma.portalMessage.create({ data: { clientId: other.id, tenantId: pu.tenantId, content: leak, senderType: 'CLIENT', senderId: other.id, senderName: 'Müvekkil' } }); leakSeeded.add(pu.clientId); }
    }
    const m = await prisma.portalMessage.create({ data: { clientId: pu.clientId, tenantId: pu.tenantId, caseId: caseRef, content: String(body.content || ''), senderType: 'CLIENT', senderId: pu.clientId, senderName: 'Müvekkil' }, select: MSG_SELECT });
    return { status: 201, body: m };
  } catch (e) { return httpErr(e); }
}
async function listMessages(req) {
  const pu = await portalUser(req); if (!pu) return { status: 401, body: { message: 'Unauthorized' } };
  const where = scenario.list === 'leak' ? { tenantId: pu.tenantId } : { clientId: pu.clientId, tenantId: pu.tenantId }; // leak: KUSUR — müvekkil kapsamı yok
  return { status: 200, body: await prisma.portalMessage.findMany({ where, orderBy: { createdAt: 'asc' }, take: 50, select: MSG_SELECT }) };
}
async function unreadCount(req) {
  const pu = await portalUser(req); if (!pu) return { status: 401, body: { message: 'Unauthorized' } };
  if (scenario.unread === 'hang') return HANG();
  return { status: 200, body: { count: await prisma.portalMessage.count({ where: { clientId: pu.clientId, tenantId: pu.tenantId, senderType: 'OFFICE', isRead: false } }) } };
}
async function markRead(req) {
  const pu = await portalUser(req); if (!pu) return { status: 401, body: { message: 'Unauthorized' } };
  if (scenario.markRead !== 'noop') await prisma.portalMessage.updateMany({ where: { clientId: pu.clientId, tenantId: pu.tenantId, senderType: 'OFFICE', isRead: false }, data: { isRead: true, readAt: new Date() } });
  return { status: 201, body: { success: true } };
}
/** Personel yanıtı: müvekkil tenantta değilse 404; PortalMessage OFFICE + PortalNotification MESAJ (e-posta YOK). */
async function sendFromOffice(u, clientId, body) {
  if (scenario.reply === 'fail') return { status: 500, body: { message: 'Internal server error' } };
  if (scenario.reply === 'hang') return HANG();
  const client = await prisma.client.findFirst({ where: { id: clientId, tenantId: u.tenantId }, select: { id: true } });
  if (!client) return { status: 404, body: { message: 'Müvekkil bulunamadı' } };
  try {
    const caseRef = await resolveCaseRef(body.caseId, { actor: 'office', clientId, tenantId: u.tenantId });
    const m = await prisma.portalMessage.create({ data: { clientId, tenantId: u.tenantId, caseId: caseRef, content: String(body.content || ''), senderType: 'OFFICE', senderId: u.id, senderName: u.name || 'Büro' } });
    if (scenario.reply !== 'noNotify') await prisma.portalNotification.create({ data: { clientId, caseId: caseRef, type: 'MESAJ', title: 'Yeni Mesaj', message: `${u.name || 'Büro'} size bir mesaj gönderdi.`, linkUrl: '/portal/messages' } });
    return { status: 201, body: m };
  } catch (e) { return httpErr(e); }
}
/** Personel GET (kaynak getClientMessages): müvekkil 404 · liste · müvekkil mesajları okundu · DÖNÜŞ `{ client, messages }` (çıplak dizi DEĞİL). */
async function adminClientMessages(u, clientId) {
  const client = await prisma.client.findFirst({ where: { id: clientId, tenantId: u.tenantId } });
  if (!client) return { status: 404, body: { message: 'Müvekkil bulunamadı' } };
  const messages = await prisma.portalMessage.findMany({ where: { clientId, tenantId: u.tenantId }, orderBy: { createdAt: 'asc' }, take: 50 });
  await prisma.portalMessage.updateMany({ where: { clientId, tenantId: u.tenantId, senderType: 'CLIENT', isRead: false }, data: { isRead: true, readAt: new Date() } });
  return { status: 200, body: { client, messages } };
}

async function apiHandler(req, res) {
  const p = new URL(req.url, 'http://127.0.0.1').pathname;
  if (p.startsWith('/__')) {
    if (req.method === 'POST' && p === '/__scenario') { scenario = Object.assign({}, DEFAULT, await readBody(req)); disableFailed = 0; leakSeeded = new Set(); return send(res, 200, scenario); }
    if (req.method === 'POST' && p === '/__reset') { calls = []; extCalls = []; for (const k of Object.keys(secrets)) secrets[k] = []; return send(res, 200, { ok: true }); }
    if (p === '/__calls') return send(res, 200, calls);
    if (p === '/__ext') return send(res, 200, extCalls);
    if (p === '/__secrets') return send(res, 200, secrets);
    if (req.method === 'POST' && p === '/__release') { let n = 0; while (heldCreates.length) { await heldCreates.shift()(); n++; } return send(res, 200, { released: n }); }
    return send(res, 404, {});
  }
  const body = req.method === 'POST' ? await readBody(req) : {};
  calls.push({ method: req.method, path: p, bodyKeys: Object.keys(body || {}).sort() });
  if (/^\/api\/portal\/(forgot-password|reset-password|change-password|documents)/.test(p)) { calls[calls.length - 1].forbidden = true; return send(res, 500, { message: 'FORBIDDEN_PORTAL_ENDPOINT_CALLED' }); }
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
        ? await prisma.clientPortalUser.update({ where: { id: existing.id }, data: { isActive: true, email: body.email, passwordHash, tokenVersion: { increment: 1 } } })
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
    await prisma.$transaction(async (tx) => {
      await tx.clientPortalUser.updateMany({ where: { clientId: body.clientId }, data: { isActive: false, tokenVersion: { increment: 1 }, resetToken: null, resetTokenExp: null } });
      await tx.client.update({ where: { id: body.clientId }, data: { hasPortalAccess: false } });
    });
    return send(res, 201, { success: true });
  }
  const am = p.match(/^\/api\/portal\/admin\/messages\/([^/]+)$/);
  if (am && am[1] === 'clients' && req.method === 'GET') {
    const u = await staffUser(req); if (!u) return send(res, 401, { message: 'Unauthorized' });
    return send(res, 200, await prisma.client.findMany({ where: { tenantId: u.tenantId, hasPortalAccess: true }, select: { id: true, displayName: true, type: true } }));
  }
  if (am && req.method === 'GET') { const u = await staffUser(req); if (!u) return send(res, 401, { message: 'Unauthorized' }); const r = await adminClientMessages(u, am[1]); return send(res, r.status, r.body); }
  if (am && req.method === 'POST') { const u = await staffUser(req); if (!u) return send(res, 401, { message: 'Unauthorized' }); const r = await sendFromOffice(u, am[1], body); return send(res, r.status, r.body); }
  if (req.method === 'POST' && p === '/api/portal/login') { const r = await portalLogin(body); return send(res, r.status, r.body); }
  if (req.method === 'GET' && p === '/api/portal/cases') { const r = await portalCases(req); return send(res, r.status, r.body); }
  if (req.method === 'GET' && p === '/api/portal/messages') { const r = await listMessages(req); return send(res, r.status, r.body); }
  if (req.method === 'POST' && p === '/api/portal/messages') { const r = await sendFromClient(req, body); return send(res, r.status, r.body); }
  if (req.method === 'GET' && p === '/api/portal/messages/unread-count') { const r = await unreadCount(req); return send(res, r.status, r.body); }
  if (req.method === 'POST' && p === '/api/portal/messages/mark-read') { const r = await markRead(req); return send(res, r.status, r.body); }
  return send(res, 404, { message: 'Not Found' });
}

/** Dış sunucu: kenar izin listesinin portal/mesaj parçası; admin ve gerisi 403 (Caddyfile şablonu). */
async function extHandler(req, res) {
  const p = new URL(req.url, EXT_ORIGIN).pathname; extCalls.push({ method: req.method, path: p });
  if (scenario.ext === '503') return send(res, 503, 'unavailable');
  if (/^\/api\/portal\/admin(\/|$)/.test(p)) return send(res, 403, 'forbidden');
  if (req.method === 'GET' && (p === '/portal/login' || p === '/portal/messages')) return send(res, 200, '<!doctype html><title>portal</title>');
  if (req.method === 'POST' && p === '/api/portal/login') { if (scenario.extLogin === '503') return send(res, 503, 'unavailable'); const r = await portalLogin(await readBody(req)); return send(res, r.status, r.body); }
  if (req.method === 'GET' && p === '/api/portal/cases') { const r = await portalCases(req); return send(res, r.status, r.body); }
  if (req.method === 'GET' && p === '/api/portal/messages') { const r = await listMessages(req); return send(res, r.status, r.body); }
  if (req.method === 'POST' && p === '/api/portal/messages') { const r = await sendFromClient(req, await readBody(req)); return send(res, r.status, r.body); }
  if (req.method === 'GET' && p === '/api/portal/messages/unread-count') { const r = await unreadCount(req); return send(res, r.status, r.body); }
  if (req.method === 'POST' && p === '/api/portal/messages/mark-read') { const r = await markRead(req); return send(res, r.status, r.body); }
  return send(res, 403, 'forbidden');
}

const tls = { cert: fs.readFileSync(process.env.D7F_CERT), key: fs.readFileSync(process.env.D7F_KEY) };
const wrap = (h) => (req, res) => Promise.resolve(h(req, res)).catch(() => { try { send(res, 500, { message: 'fake error' }); } catch (x) { /* yanıt zaten kapandı */ } });
http.createServer(wrap(apiHandler)).listen(API_PORT, '127.0.0.1');
https.createServer(tls, wrap(extHandler)).listen(EXT_PORT, '127.0.0.1');
console.log(`d7-fake-portal-api hazır api=${API_PORT} ext=${EXT_PORT}`);
