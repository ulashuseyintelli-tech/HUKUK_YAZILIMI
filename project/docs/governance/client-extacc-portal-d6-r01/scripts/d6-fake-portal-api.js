'use strict';
/*
 * EXTACC D-6 ÖZ-TEST — SAHTE PORTAL API + SAHTE DIŞ HTTPS SUNUCU + BELGE UÇLARI. YALNIZ DISPOSABLE DB. CANLIYA DOKUNMAZ.
 *
 * d5-fake-portal-api.js'in D-6 genişlemesi. NE GERÇEK: disposable PostgreSQL + canlı sürümün Prisma istemcisi; hesap, sürüm,
 * PortalDocument satırları GERÇEK tablolara yazılır; dosyalar D6F_DATA_ROOT/portal-documents/<tenantId>/ altına GERÇEKTEN yazılır ve
 * ürün DELETE'i gibi silinir; dış sunucu GERÇEK TLS. NE SAHTE: Nest API'si (multipart ayrıştırma basit ama doğru: boundary, alanlar,
 * tek dosya; uzantı filtresi .pdf/.jpg/.jpeg/.png/.doc/.docx; 10 MB sınırı). Ürünün hız sınırı ve tenant yaşam döngüsü ÖLÇÜLMEZ.
 *
 * env: D6F_DB_URL, D6F_PRISMA_ROOT, D6F_BCRYPT, D6F_API_PORT, D6F_EXT_PORT, D6F_CERT, D6F_KEY, D6F_DATA_ROOT
 * Kontrol uçları (yalnız 127.0.0.1): POST /__scenario · POST /__reset · GET /__calls · GET /__ext · GET /__secrets · POST /__release
 * Senaryolar: create normal|fail|late|hold · disable normal|fail|failOnce · guard normal|stale · ext normal|503 · extLogin normal|503 ·
 *             cases normal|leak · upload normal|fail (500, dosya yok) · list normal|leak (tenant'ın tüm belgeleri) ·
 *             download normal|leak (clientId kapsamı yok) · delete normal|fail (500)|noUnlink (satır silinir, dosya KALIR)|leak (kapsam yok) ·
 *             pending normal|fail
 * R03 senaryoları: staffAuth normal|expireOnDisable (ilk disable-user çağrısında o ana dek verilmiş TÜM personel token'ları geçersiz olur →
 *             401; yeni giriş yeni token verir — token süresinin kapanış sırasında dolması taklidi) · disable forbidden (her çağrı 403; ürün:
 *             yetki reddi yazmadan önce döner) | notFound (her çağrı 404) · upload denyUntilNext (dosya yazılır + satır; ardından dosya F +
 *             dizin RD ACL REDDİ; bir sonraki indirme/silme isteğinde reddi kaldırır) | noFile (satır yazılır, dosya YAZILMAZ — doğrulanmış yokluk)
 *             · delete failDeny (500; satır + dosya KALIR ve dosya F + dizin RD REDDİ) | noUnlinkDeny (satır silinir, dosya KALIR ve REDDİ).
 *             ACL reddi bu sürecin kullanıcısına (USERNAME) gerçek `icacls` ile yazılır; YALNIZ /__lift (ve denyUntilNext'te bir sonraki
 *             indirme/silme isteği) kaldırır — /__reset ve /__scenario kaldırmaz (aynı ret altında Recover ölçülebilsin).
 * R03-b senaryosu: relogin normal|reject|rateLimit — `expireOnDisable` token'ları geçersiz kıldıktan SONRAKİ personel girişleri 401 (reject) ya da
 *             429 (rateLimit; ürünün giriş hız sınırı taklidi) döner; koşum başındaki giriş etkilenmez.
 * KOŞUCU YASAĞI: forgot/reset/change-password, messages, admin approve/reject çağrıları FORBIDDEN işaretlenir (500).
 */
const http = require('http'); const https = require('https'); const fs = require('fs'); const path = require('path'); const crypto = require('crypto');
const { execFileSync } = require('child_process');

const { PrismaClient } = require(path.join(process.env.D6F_PRISMA_ROOT));
const bcrypt = require(process.env.D6F_BCRYPT);
const prisma = new PrismaClient({ datasources: { db: { url: process.env.D6F_DB_URL } } });
const API_PORT = Number(process.env.D6F_API_PORT || 8199);
const EXT_PORT = Number(process.env.D6F_EXT_PORT || 8458);
const EXT_ORIGIN = `https://localhost:${EXT_PORT}`;
const DATA_ROOT = process.env.D6F_DATA_ROOT;
const ALLOWED_EXT = ['.pdf', '.jpg', '.jpeg', '.png', '.doc', '.docx']; const MAX_UPLOAD = 10 * 1024 * 1024;
const DOC_SELECT = { id: true, type: true, title: true, description: true, fileName: true, fileSize: true, mimeType: true, status: true, createdAt: true }; // PORTAL_DOCUMENT_CLIENT_SELECT

const DEFAULT = { create: 'normal', disable: 'normal', guard: 'normal', ext: 'normal', extLogin: 'normal', cases: 'normal', upload: 'normal', list: 'normal', download: 'normal', delete: 'normal', pending: 'normal', staffAuth: 'normal', relogin: 'normal' };
const LATE_CREATE_MS = 3000; const heldCreates = [];
let scenario = Object.assign({}, DEFAULT); let disableFailed = 0;
let calls = []; let extCalls = [];
const secrets = { jwts: [], portalJwts: [], portalPasswords: [], loginPasswords: [] };
// R03: personel token'ları benzersizdir (sıra no) — yeniden giriş YENİ token verir; `expireOnDisable` ile geçersiz kılınanlar burada tutulur.
let jwtSeq = 0; let staffExpired = false; const expiredStaffJwts = new Set();
// R03: gerçek ACL reddi (icacls) — kaldırılacak dizin/dosya listesi. Kaldırma sırası: dizin, sonra dosya (öz-testteki Z6-b ile aynı).
const ACL_USER = process.env.USERNAME || ''; let denied = []; let liftOnNextDocRequest = false;
const icacls = (args) => { try { execFileSync('icacls', args, { stdio: 'ignore', windowsHide: true }); return true; } catch (e) { return false; } };
function denyFile(file) { const dir = path.dirname(file); const ok = !!ACL_USER && icacls([file, '/deny', `${ACL_USER}:(F)`]) && icacls([dir, '/deny', `${ACL_USER}:(RD)`]); denied.push({ file, dir }); return ok; }
function liftAll() { let n = 0; for (const d of denied) { icacls([d.dir, '/remove:d', ACL_USER]); icacls([d.file, '/remove:d', ACL_USER]); n++; } denied = []; liftOnNextDocRequest = false; return n; }

function send(res, status, obj, extraHeaders) {
  const body = obj === undefined ? '' : (Buffer.isBuffer(obj) ? obj : (typeof obj === 'string' ? obj : JSON.stringify(obj)));
  const type = Buffer.isBuffer(obj) ? 'application/octet-stream' : (typeof obj === 'string' ? 'text/html; charset=utf-8' : 'application/json');
  res.writeHead(status, Object.assign({ 'content-type': type }, extraHeaders || {})); res.end(body);
}
function readRaw(req) { return new Promise((ok) => { const c = []; req.on('data', (d) => c.push(d)); req.on('end', () => ok(Buffer.concat(c))); }); }
async function readBody(req) { const b = await readRaw(req); try { return b.length ? JSON.parse(b.toString('utf8')) : {}; } catch (e) { return { __invalid: true }; } }
/** Content-Type başlığından boundary değeri — düzenli ifade YOK (doğrusal tarama; ReDoS riski yok). Tırnaklı/tırnaksız; en çok 200 karakter. */
function boundaryOf(contentType) {
  const s = String(contentType || ''); const i = s.toLowerCase().indexOf('boundary='); if (i === -1) return null;
  let v = s.slice(i + 'boundary='.length); const semi = v.indexOf(';'); if (semi !== -1) v = v.slice(0, semi); v = v.trim();
  if (v.startsWith('"')) { const e = v.indexOf('"', 1); if (e === -1) return null; v = v.slice(1, e); }
  return v.length > 0 && v.length <= 200 ? v : null;
}
/** Basit multipart/form-data ayrıştırıcı: boundary ile böler; alanlar metin, dosya ikili (Buffer). */
function parseMultipart(buf, contentType) {
  const b = boundaryOf(contentType); if (!b) return null;
  const delim = Buffer.from(`--${b}`); const fields = {}; let file = null; let pos = buf.indexOf(delim);
  while (pos !== -1) {
    const next = buf.indexOf(delim, pos + delim.length); if (next === -1) break;
    let part = buf.subarray(pos + delim.length, next); if (part.subarray(0, 2).toString() === '\r\n') part = part.subarray(2);
    const hEnd = part.indexOf('\r\n\r\n'); if (hEnd === -1) { pos = next; continue; }
    const headers = part.subarray(0, hEnd).toString('utf8'); let content = part.subarray(hEnd + 4); if (content.subarray(content.length - 2).toString() === '\r\n') content = content.subarray(0, content.length - 2);
    const name = (/name="([^"]*)"/.exec(headers) || [])[1]; const filename = (/filename="([^"]*)"/.exec(headers) || [])[1]; const ctype = (/content-type:\s*([^\r\n]+)/i.exec(headers) || [])[1];
    if (filename !== undefined) file = { fieldname: name, originalname: filename, mimetype: (ctype || 'application/octet-stream').trim(), data: content }; else if (name) fields[name] = content.toString('utf8');
    pos = next;
  }
  return { fields, file };
}
const claimOf = (req, prefix) => { const h = String(req.headers.authorization || ''); if (!h.startsWith(`Bearer ${prefix}`)) return null; try { return JSON.parse(Buffer.from(h.slice(`Bearer ${prefix}`.length), 'base64url').toString('utf8')); } catch (e) { return null; } };
async function staffUser(req) {
  if (expiredStaffJwts.has(String(req.headers.authorization || '').replace(/^Bearer /, ''))) return null;   // R03: süresi dolmuş token taklidi
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
  if (!u || !(await bcrypt.compare(String(body.password || ''), u.passwordHash))) return { status: 401, body: { message: 'Geçersiz e-posta veya şifre' } };
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
// ---- BELGELER (ürün: portal.controller.ts / portal.service.ts taklidi)
const bucketDir = (tenantId) => { const d = path.join(DATA_ROOT, 'portal-documents', tenantId); fs.mkdirSync(d, { recursive: true }); return d; };
const contained = (tenantId, p) => { const dir = path.resolve(bucketDir(tenantId)) + path.sep; return path.resolve(p).toLowerCase().startsWith(dir.toLowerCase()); };
async function listDocs(req) {
  const pu = await portalUser(req); if (!pu) return { status: 401, body: { message: 'Unauthorized' } };
  const where = scenario.list === 'leak' ? { title: { startsWith: 'D6-' } } : { clientId: pu.clientId, tenantId: pu.tenantId }; // leak: KUSUR TAKLİDİ — kapsam yok
  return { status: 200, body: await prisma.portalDocument.findMany({ where, orderBy: { createdAt: 'desc' }, select: DOC_SELECT }) };
}
async function uploadDoc(req) {
  const pu = await portalUser(req); if (!pu) return { status: 401, body: { message: 'Unauthorized' } };
  const raw = await readRaw(req); const mp = parseMultipart(raw, req.headers['content-type']);
  if (!mp || !mp.file) return { status: 400, body: { message: 'Dosya yüklenmedi' } };
  if (!ALLOWED_EXT.includes(path.extname(mp.file.originalname).toLowerCase())) return { status: 400, body: { message: 'Desteklenmeyen dosya formatı' } };
  if (mp.file.data.length > MAX_UPLOAD) return { status: 413, body: { message: 'File too large' } };
  if (scenario.upload === 'fail') return { status: 500, body: { message: 'Internal server error' } };
  let caseId; if (mp.fields.caseId) { const found = await prisma.case.findFirst({ where: { id: mp.fields.caseId, tenantId: pu.tenantId, showToClient: true, OR: [{ clientId: pu.clientId }, { caseClients: { some: { clientId: pu.clientId } } }] }, select: { id: true } }); if (!found) return { status: 400, body: { message: 'PORTAL_CASE_REFERENCE_INVALID' } }; caseId = found.id; }
  const name = `portal-${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(mp.file.originalname).toLowerCase()}`; const target = path.join(bucketDir(pu.tenantId), name);
  if (scenario.upload !== 'noFile') fs.writeFileSync(target, mp.file.data);   // noFile: KUSUR TAKLİDİ — satır var, dosya YOK (doğrulanmış yokluk)
  const doc = await prisma.portalDocument.create({ data: { clientId: pu.clientId, tenantId: pu.tenantId, caseId, type: mp.fields.type || 'DIGER', title: mp.fields.title || mp.file.originalname, description: mp.fields.description, fileName: mp.file.originalname, filePath: target, fileSize: mp.file.data.length, mimeType: mp.file.mimetype }, select: DOC_SELECT });
  // denyUntilNext: yanıt dönmeden ÖNCE dosya + dizin ACL reddi — koşucunun D6-1D stat'ı reddi görür; bir sonraki indirme/silme isteği kaldırır.
  if (scenario.upload === 'denyUntilNext') { denyFile(target); liftOnNextDocRequest = true; }
  return { status: 201, body: doc };
}
async function downloadDoc(req, id) {
  if (liftOnNextDocRequest) liftAll();
  const pu = await portalUser(req); if (!pu) return { status: 401, body: { message: 'Unauthorized' } };
  const doc = await prisma.portalDocument.findFirst({ where: scenario.download === 'leak' ? { id } : { id, clientId: pu.clientId } });
  if (!doc) return { status: 404, body: { message: 'Belge bulunamadı' } };
  const readable = contained(pu.tenantId, doc.filePath) && fs.existsSync(doc.filePath);
  // leak: KUSUR TAKLİDİ — kapsam dışı satır (dosyası olmasa da) 200 + içerikle SIZAR; koşucunun "HTTP 200 — KAPSAM DIŞI" dalı böyle ölçülür.
  if (scenario.download === 'leak' && !readable) return { status: 200, body: Buffer.from(`LEAK-${doc.id}`), headers: { 'content-type': 'application/pdf', 'content-disposition': `attachment; filename="${doc.fileName}"` } };
  if (!readable) return { status: 400, body: { message: 'Dosya bulunamadı' } };
  return { status: 200, body: fs.readFileSync(doc.filePath), headers: { 'content-type': 'application/pdf', 'content-disposition': `attachment; filename="${doc.fileName}"` } };
}
async function deleteDoc(req, id) {
  if (liftOnNextDocRequest) liftAll();
  const pu = await portalUser(req); if (!pu) return { status: 401, body: { message: 'Unauthorized' } };
  if (scenario.delete === 'fail') return { status: 500, body: { message: 'Internal server error' } };
  const doc = await prisma.portalDocument.findFirst({ where: scenario.delete === 'leak' ? { id } : { id, clientId: pu.clientId } });
  if (!doc) return { status: 404, body: { message: 'Belge bulunamadı' } };
  // failDeny: KUSUR + DEPOLAMA ERİŞİM REDDİ — 500, satır ve dosya KALIR, dosya + dizin okunamaz (doğrulanmış satır kalıntısı + erişim hatası birlikte)
  // ACL reddi YALNIZ bu sürecin geçici kovasındaki dosyaya yazılır (contained) — test dışına asla.
  if (scenario.delete === 'failDeny') { if (doc.filePath && contained(pu.tenantId, doc.filePath) && fs.existsSync(doc.filePath)) denyFile(doc.filePath); return { status: 500, body: { message: 'Internal server error' } }; }
  if (doc.status !== 'PENDING') return { status: 400, body: { message: 'Onaylanmış veya reddedilmiş belgeler silinemez' } };
  await prisma.portalDocument.delete({ where: { id } });
  // noUnlinkDeny: satır silinir, dosya KALIR ve okunamaz (yalnız erişim hatası; doğrulanmış kalıntı YOK)
  if (scenario.delete === 'noUnlinkDeny') { if (doc.filePath && contained(pu.tenantId, doc.filePath) && fs.existsSync(doc.filePath)) denyFile(doc.filePath); return { status: 200, body: { success: true } }; }
  if (scenario.delete !== 'noUnlink' && doc.filePath && contained(pu.tenantId, doc.filePath) && fs.existsSync(doc.filePath)) fs.unlinkSync(doc.filePath); // noUnlink: KUSUR — dosya kalır
  return { status: 200, body: { success: true } };
}
async function pendingDocs(req) {
  const u = await staffUser(req); if (!u) return { status: 401, body: { message: 'Unauthorized' } };
  if (scenario.pending === 'fail') return { status: 500, body: { message: 'Internal server error' } };
  return { status: 200, body: await prisma.portalDocument.findMany({ where: { tenantId: u.tenantId, status: 'PENDING' }, orderBy: { createdAt: 'asc' } }) };
}
const DOC_RE = /^\/api\/portal\/documents\/([^/]+)(\/download)?$/;
async function documentsRoute(req, p) {
  if (req.method === 'GET' && p === '/api/portal/documents') return listDocs(req);
  if (req.method === 'POST' && p === '/api/portal/documents/upload') return uploadDoc(req);
  const m = DOC_RE.exec(p); if (!m) return null;
  if (req.method === 'GET' && m[2]) return downloadDoc(req, m[1]);
  if (req.method === 'DELETE' && !m[2]) return deleteDoc(req, m[1]);
  return null;
}
const reply = (res, r) => send(res, r.status, r.body, r.headers);

async function apiHandler(req, res) {
  const p = new URL(req.url, 'http://127.0.0.1').pathname;
  if (p.startsWith('/__')) {
    if (req.method === 'POST' && p === '/__scenario') { scenario = Object.assign({}, DEFAULT, await readBody(req)); disableFailed = 0; staffExpired = false; expiredStaffJwts.clear(); liftOnNextDocRequest = false; return send(res, 200, scenario); }
    if (req.method === 'POST' && p === '/__reset') { calls = []; extCalls = []; for (const k of Object.keys(secrets)) secrets[k] = []; return send(res, 200, { ok: true }); }
    // ACL reddi YALNIZ açıkça kaldırılır (/__lift) ya da denyUntilNext'te bir sonraki belge isteğinde — böylece aynı ret altında Recover koşulabilir.
    if (req.method === 'POST' && p === '/__lift') return send(res, 200, { lifted: liftAll() });
    if (p === '/__calls') return send(res, 200, calls);
    if (p === '/__ext') return send(res, 200, extCalls);
    if (p === '/__secrets') return send(res, 200, secrets);
    if (req.method === 'POST' && p === '/__release') { let n = 0; while (heldCreates.length) { await heldCreates.shift()(); n++; } return send(res, 200, { released: n }); }
    return send(res, 404, {});
  }
  const isJson = /application\/json/.test(String(req.headers['content-type'] || ''));
  const body = req.method === 'POST' && isJson ? await readBody(req) : {};
  calls.push({ method: req.method, path: p, bodyKeys: Object.keys(body || {}).sort() });
  if (/^\/api\/portal\/(forgot-password|reset-password|change-password|messages)/.test(p) || /^\/api\/portal\/admin\/documents\/[^/]+\/(approve|reject)$/.test(p)) { calls[calls.length - 1].forbidden = true; return send(res, 500, { message: 'FORBIDDEN_PORTAL_ENDPOINT_CALLED' }); }
  if (req.method === 'POST' && p === '/api/auth/login') {
    // R03-b: token'lar geçersiz kılındıktan sonraki (kapanıştaki) yeniden giriş reddi / hız sınırı taklidi — yazma YOK
    if (staffExpired && scenario.relogin === 'reject') return send(res, 401, { message: 'Unauthorized' });
    if (staffExpired && scenario.relogin === 'rateLimit') return send(res, 429, { message: 'Too Many Requests' });
    const t = await prisma.tenant.findFirst({ where: { slug: body.tenantSlug }, select: { id: true } });
    const u = t ? await prisma.user.findFirst({ where: { tenantId: t.id, email: body.email }, select: { id: true, tenantId: true, isActive: true, tokenVersion: true, passwordHash: true } }) : null;
    if (!u || !u.isActive || !u.passwordHash || !(await bcrypt.compare(String(body.password || ''), u.passwordHash))) return send(res, 401, { message: 'Unauthorized' });
    const jwt = 'fake.' + Buffer.from(JSON.stringify({ uid: u.id, tid: u.tenantId, tv: u.tokenVersion, n: ++jwtSeq })).toString('base64url');
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
      const pu = existing ? await prisma.clientPortalUser.update({ where: { id: existing.id }, data: { isActive: true, email: body.email, passwordHash, tokenVersion: { increment: 1 } } })
        : await prisma.clientPortalUser.create({ data: { clientId: body.clientId, email: body.email, passwordHash } });
      await prisma.client.update({ where: { id: body.clientId }, data: { hasPortalAccess: true, portalUserId: pu.id } }); return pu;
    };
    if (scenario.create === 'late') { setTimeout(() => { write().catch(() => {}); }, LATE_CREATE_MS); return; }
    if (scenario.create === 'hold') { heldCreates.push(write); return; }
    const pu = await write(); return send(res, 201, { id: pu.id, email: pu.email, clientId: pu.clientId });
  }
  if (req.method === 'POST' && p === '/api/portal/admin/disable-user') {
    // R03: expireOnDisable — İLK kapatma çağrısı anında o ana dek verilmiş tüm personel token'ları geçersizleşir (süre dolumu taklidi; yazma YOK).
    if (scenario.staffAuth === 'expireOnDisable' && !staffExpired) { staffExpired = true; for (const j of secrets.jwts) expiredStaffJwts.add(j); }
    const u = await staffUser(req); if (!u) return send(res, 401, { message: 'Unauthorized' });
    if (scenario.disable === 'forbidden') return send(res, 403, { message: 'Portal erişimi yönetimi için yetki yok' });   // ürün: yazmadan ÖNCE 403
    if (scenario.disable === 'notFound') return send(res, 404, { message: 'Müvekkil bulunamadı' });
    if (scenario.disable === 'fail' || (scenario.disable === 'failOnce' && disableFailed === 0)) { disableFailed++; return send(res, 500, { message: 'Internal server error' }); }
    const client = await prisma.client.findFirst({ where: { id: body.clientId, tenantId: u.tenantId }, select: { id: true } });
    if (!client) return send(res, 404, { message: 'Müvekkil bulunamadı' });
    await prisma.$transaction(async (tx) => { await tx.clientPortalUser.updateMany({ where: { clientId: body.clientId }, data: { isActive: false, tokenVersion: { increment: 1 }, resetToken: null, resetTokenExp: null } }); await tx.client.update({ where: { id: body.clientId }, data: { hasPortalAccess: false } }); });
    return send(res, 201, { success: true });
  }
  if (req.method === 'GET' && p === '/api/portal/admin/documents/pending') return reply(res, await pendingDocs(req));
  if (req.method === 'POST' && p === '/api/portal/login') return reply(res, await portalLogin(body));
  if (req.method === 'GET' && p === '/api/portal/cases') return reply(res, await portalCases(req));
  const d = await documentsRoute(req, p); if (d) return reply(res, d);
  return send(res, 404, { message: 'Not Found' });
}
/** Dış sunucu: kenar izin listesinin portal parçası (giriş + belgeler + dosya listesi); gerisi 403 (admin uçları dahil). */
async function extHandler(req, res) {
  const p = new URL(req.url, EXT_ORIGIN).pathname; extCalls.push({ method: req.method, path: p });
  if (scenario.ext === '503') return send(res, 503, 'unavailable');
  if (req.method === 'GET' && (p === '/portal/login' || p === '/portal/documents')) return send(res, 200, '<!doctype html><title>portal</title>');
  if (req.method === 'POST' && p === '/api/portal/login') { if (scenario.extLogin === '503') return send(res, 503, 'unavailable'); return reply(res, await portalLogin(await readBody(req))); }
  if (req.method === 'GET' && p === '/api/portal/cases') return reply(res, await portalCases(req));
  const d = await documentsRoute(req, p); if (d) return reply(res, d);
  return send(res, 403, 'forbidden');
}

const tls = { cert: fs.readFileSync(process.env.D6F_CERT), key: fs.readFileSync(process.env.D6F_KEY) };
const wrap = (h) => (req, res) => Promise.resolve(h(req, res)).catch(() => { try { send(res, 500, { message: 'fake error' }); } catch (x) { /* yanıt zaten kapandı */ } });
http.createServer(wrap(apiHandler)).listen(API_PORT, '127.0.0.1');
https.createServer(tls, wrap(extHandler)).listen(EXT_PORT, '127.0.0.1');
console.log(`d6-fake-portal-api hazır api=${API_PORT} ext=${EXT_PORT}`);
