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
 *             scope normal|<N|S|U>:<accept|429|503|hang> (R05: YALNIZ o kapsam dışı denemeye uygulanır — N yabancı tenant dosyası · S aynı tenantta başka
 *                   müvekkilin dosyası · U bulunmayan kimlik; deneme mesaj içeriğinin son ekinden tanınır. accept = KUSUR: doğrulama yok, satır yazılır 201
 *                   (U'da dosyasız satır); 429 / 503 = o kodla yanıt, satır yok; hang = YANITSIZ, satır yok) ·
 *             list normal|leak (KUSUR: aynı tenantta BAŞKA müvekkilin mesajı da döner; ilk gönderimde tuzak satır yazılır) ·
 *             reply normal|fail|noNotify (bildirim satırı üretilmez)|hang (YANITSIZ: personel POST'u hiç yanıtlanmaz, satır yazılmaz) ·
 *             markRead normal|noop (KUSUR: okundu işaretlenmez) · unread normal|hang (YANITSIZ: unread-count hiç yanıtlanmaz)
 * R03 senaryoları (D-6 R03 kalıbı): staffAuth normal|expireOnDisable (İLK disable-user çağrısı anında o ana dek verilmiş TÜM personel token'ları
 *             geçersiz olur → 401; yeni giriş YENİ token verir — personel token süresinin kapanış sırasında dolması taklidi; yazma YOK) ·
 *             disable forbidden (her çağrı 403; ürün: yetki reddi yazmadan önce döner) | notFound (her çağrı 404) ·
 *             relogin normal|reject|rateLimit (`expireOnDisable` token'ları geçersiz kıldıktan SONRAKİ personel girişleri 401 ya da 429 — ürünün giriş
 *             hız sınırı taklidi; koşum başındaki giriş etkilenmez). Personel token'ları benzersizdir (sıra no).
 * R03-c senaryosu: reopen normal|afterDisable — başarılı disable-user çağrısından SONRA YEREL API'ye gelen İLK mesaj listesi isteğinde (koşucunun
 *             kapanıştaki P7-C4L ölçümü) o müvekkilin portal hesabı DB'de YENİDEN AÇILIR (isActive=true + hasPortalAccess=true; R03-c'de sürüm DEĞİŞMİYORDU — R03-d aşağıda) —
 *             "hesap HTTP ölçümleri sırasında yeniden açıldı" taklidi (P7-C2 PASS, P7-C5 FAIL). guard 'stale' ile birlikte oturum 200 alır.
 * R03-d     : reopen afterDisable artık ÜRÜN GİBİ sürümü ARTIRIR (HY_WT_R27 portal.service.ts reactivate: tokenVersion increment) — guard normal iken
 *             eski oturum 401 (sürüm farkı), guard stale iken 200 · reopen afterDisableRevert (AYRI test varyantı): yeniden açarken sürümü kapatma
 *             ÖNCESİ değere (oturumun verildiği sürüm) GERİ döndürür — guard normal iken eski oturum 200 alır ("adayı DEĞİL" dalı).
 * R03-e     : (D-6 R03-e ile aynı) portal token'ı ürün gibi ÜÇ parçalı JWT biçiminde (payload claim adları ürünle aynı: sub · clientId · tenantId · type ·
 *             tokenVersion; imza sahte) — koşucu tokenVersion claim'ini İMZASIZ okur. portalToken opaque → iki parçalı eski biçim (koşucu claim'i okuyamaz → s1).
 *             login bumpBeforeSign → İLK portal girişinde token imzalanmadan ÖNCE sürüm +1 (claim ≠ koşucunun girişten önce okuduğu s1).
 *             pwChange onDisable → İLK disable-user çağrısında, işlemeden ÖNCE sürüm +1, isActive DEĞİŞMEZ ("Şifre Değiştir" taklidi: ürün changePassword
 *             sürümü artırır) · rowDelete onDisable → disable-user portal kullanıcı SATIRINI siler + erişim bayrağını kapatır, 201 (ürün dışı satır silme) ·
 *             disable passiveOnly → yalnız isActive=false, sürüm ARTMAZ, hasPortalAccess DEĞİŞMEZ, 201 (ürün dışı kapatma) · reopen afterDisableNoBump →
 *             yeniden açmada sürüm DEĞİŞMEZ (ürün dışı yeniden açma). Bu varyantlar ürünün kendisi DEĞİLDİR; koşucunun sınıflamasını sınar.
 * R03-f     : (D-6 R03-f ile aynı) portalToken badClaim → üç parçalı JWT ama `tokenVersion` claim'i GEÇERSİZ (-1; tam sayı ≥ 0 değil). Ürünün imzaladığı
 *             token'da claim DB'deki tam sayıdır (portal.service.ts:443) — bu varyant ürün değildir, koşucunun TG hücresini sınar. Guard NORMAL taklidi artık
 *             ürün guard'ı gibi claim'i doğrular: tam sayı ≥ 0 değilse DB'ye bakmadan reddeder (portal-auth.guard.ts:42-45, :98-104); claim yoksa 0 (değişmedi).
 *             Guard 'stale' kusur taklidi claim'e bakmaz (değişmedi).
 * R03-g     : (D-6 R03-g ile aynı) Guard NORMAL taklidi ürün guard'ı gibi JWT olmayan token'ı (portalToken opaque: iki parçalı) DB'ye bakmadan reddeder
 *             (portal-auth.guard.ts:36 verifyAsync) — R03-e/f'de normal taklit opaque token'ı kabul ediyordu; bu ürün davranışı DEĞİLDİ (ürünün verdiği token
 *             jwtService.sign ile JWT'dir, portal.service.ts:438-446). Guard 'stale' kusur taklidi değişmedi. reopenOn extLogin → yeniden açma tetiği (reopen
 *             afterDisable* ile) başarılı disable-user'dan SONRAKİ İLK DIŞ portal girişi YANITLANDIKTAN sonra (o giriş kapalı hesabı görür); Recover'ın HTTP
 *             ölçümleri yalnız yeni giriştir (P7-C3L yerel, P7-C3D dış) — mesaj listesi isteği yoktur. Varsayılan reopenOn messages (önceki davranış AYNEN).
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

const DEFAULT = { create: 'normal', disable: 'normal', guard: 'normal', ext: 'normal', extLogin: 'normal', wrongPw: 'normal', cases: 'normal', send: 'normal', scope: 'normal', list: 'normal', reply: 'normal', markRead: 'normal', unread: 'normal',
  staffAuth: 'normal', relogin: 'normal', reopen: 'normal', portalToken: 'jwt', login: 'normal', pwChange: 'normal', rowDelete: 'normal', reopenOn: 'messages' };
// R03-c: reopen afterDisable — kapatılan müvekkil (başarılı disable-user) ve yeniden açmanın yapılıp yapılmadığı (tek sefer)
let reopenClientId = null; let reopenDone = false; let reopenRevertTv = null;   // R03-d: kapatma ÖNCESİ sürüm (afterDisableRevert)
const REOPEN_MODES = ['afterDisable', 'afterDisableRevert', 'afterDisableNoBump'];
let loginBumped = false; let pwChanged = false;   // R03-e: tek seferlik varyantlar
// R03: personel token'ları benzersizdir (sıra no) — yeniden giriş YENİ token verir; `expireOnDisable` ile geçersiz kılınanlar burada tutulur.
let jwtSeq = 0; let staffExpired = false; const expiredStaffJwts = new Set();
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
  if (expiredStaffJwts.has(String(req.headers.authorization || '').replace(/^Bearer /, ''))) return null;   // R03: süresi dolmuş token taklidi
  const c = claimOf(req, 'fake.'); if (!c) return null;
  const u = await prisma.user.findUnique({ where: { id: c.uid }, select: { id: true, tenantId: true, isActive: true, tokenVersion: true, name: true } });
  return (!u || !u.isActive || u.tenantId !== c.tid || u.tokenVersion !== c.tv) ? null : u;
}
// R03-e: portal token'ı — JWT biçimi (`pfake.<payload>.<imza>`; ürün claim adları) ya da opaque (`pfake.<payload>`; eski kısa adlar) → ortak biçim.
// Ürün guard'ı gibi: tokenVersion claim'i yoksa 0.
function portalClaimOf(req) {
  const h = String(req.headers.authorization || ''); if (!h.startsWith('Bearer pfake.')) return null;
  const parts = h.slice('Bearer '.length).split('.');
  try {
    if (parts.length === 3) { const p = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')); return { sub: p.sub, cid: p.clientId, tid: p.tenantId, type: p.type, tv: p.tokenVersion === undefined ? 0 : p.tokenVersion, jwt: true }; }
    if (parts.length === 2) return Object.assign(JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')), { jwt: false });   // R03-g: opaque = JWT DEĞİL
  } catch (e) { return null; }
  return null;
}
async function portalUser(req) {
  const c = portalClaimOf(req); if (!c || c.type !== 'portal') return null;
  if (scenario.guard === 'stale') return { clientId: c.cid, tenantId: c.tid }; // KUSUR TAKLİDİ — yalnız negatif test
  if (c.jwt !== true) return null;   // R03-g: ürün guard'ı gibi JWT olmayan token → DB'ye bakmadan ret (portal-auth.guard.ts:36 verifyAsync)
  if (!(Number.isInteger(c.tv) && c.tv >= 0)) return null;   // R03-f: ürün guard'ı gibi geçersiz claim → DB'ye bakmadan ret (portal-auth.guard.ts:42-45)
  const u = await prisma.clientPortalUser.findUnique({ where: { id: c.sub }, select: { isActive: true, clientId: true, tokenVersion: true, client: { select: { tenantId: true } } } });
  if (!u || !u.isActive || u.clientId !== c.cid || u.client.tenantId !== c.tid || u.tokenVersion !== c.tv) return null;
  return { clientId: u.clientId, tenantId: u.client.tenantId };
}

async function portalLogin(body) {
  secrets.loginPasswords.push(String(body.password || ''));
  const u = await prisma.clientPortalUser.findFirst({ where: { email: String(body.email || ''), isActive: true }, select: { id: true, clientId: true, email: true, passwordHash: true, tokenVersion: true, client: { select: { tenantId: true, displayName: true } } } });
  if (!u || (scenario.wrongPw !== 'acceptAny' && !(await bcrypt.compare(String(body.password || ''), u.passwordHash)))) return { status: 401, body: { message: 'Geçersiz e-posta veya şifre' } };
  await prisma.clientPortalUser.update({ where: { id: u.id }, data: { lastLoginAt: new Date(), loginCount: { increment: 1 } } });
  // R03-e: login bumpBeforeSign — İLK portal girişinde token imzalanmadan ÖNCE sürüm +1 (claim ≠ koşucunun girişten önce okuduğu s1)
  if (scenario.login === 'bumpBeforeSign' && !loginBumped) { loginBumped = true; const b = await prisma.clientPortalUser.update({ where: { id: u.id }, data: { tokenVersion: { increment: 1 } }, select: { tokenVersion: true } }); u.tokenVersion = b.tokenVersion; }
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  // R03-f: badClaim → claim GEÇERSİZ (-1) — ürün değil; koşucunun TG hücresi için
  const tvClaim = scenario.portalToken === 'badClaim' ? -1 : u.tokenVersion;
  const token = scenario.portalToken === 'opaque' ? 'pfake.' + b64({ sub: u.id, cid: u.clientId, tid: u.client.tenantId, tv: u.tokenVersion, type: 'portal' })
    : `pfake.${b64({ sub: u.id, clientId: u.clientId, tenantId: u.client.tenantId, type: 'portal', tokenVersion: tvClaim })}.${crypto.randomBytes(8).toString('hex')}`;
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
  // R05: kapsam dışı denemenin türü (koşucunun içerik son eki) — `scope` düğmesi yalnız eşleşen denemeye uygulanır.
  const c = String(body.content || ''); const kind = !body.caseId ? null : (/-FOREIGN$/.test(c) ? 'N' : (/-SAMETENANT$/.test(c) ? 'S' : (/-UNKNOWN$/.test(c) ? 'U' : null)));
  const scopeIs = (x) => !!kind && scenario.scope === `${kind}:${x}`;
  if (scopeIs('429')) return { status: 429, body: { message: 'Too Many Requests' } };
  if (scopeIs('503')) return { status: 503, body: { message: 'Service Unavailable' } };
  if (scopeIs('hang')) return HANG();
  try {
    // scope <tür>:accept → KUSUR TAKLİDİ: doğrulama yok (U'da dosya yoktur: satır dosyasız yazılır)
    const caseRef = scopeIs('accept') ? (kind === 'U' ? undefined : body.caseId) : await resolveCaseRef(body.caseId, { actor: 'client', clientId: pu.clientId, tenantId: pu.tenantId });
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

// R03-c/d/e: yeniden açma (KUSUR/DIŞ MÜDAHALE TAKLİDİ; tek sefer). R03-g: tetik noktası reopenOn ile seçilir; yazım AYNI.
const reopenPending = () => REOPEN_MODES.includes(scenario.reopen) && !!reopenClientId && !reopenDone;
async function doReopen() {
  reopenDone = true;
  // R03-e: afterDisableNoBump — sürüm DEĞİŞMEZ (ürün dışı yeniden açma; ürün yeniden açması :315'te sürümü artırır)
  const tvData = scenario.reopen === 'afterDisableRevert' && Number.isInteger(reopenRevertTv) ? { tokenVersion: reopenRevertTv } : (scenario.reopen === 'afterDisableNoBump' ? {} : { tokenVersion: { increment: 1 } });
  await prisma.clientPortalUser.updateMany({ where: { clientId: reopenClientId }, data: Object.assign({ isActive: true }, tvData) });
  await prisma.client.update({ where: { id: reopenClientId }, data: { hasPortalAccess: true } });
}

async function apiHandler(req, res) {
  const p = new URL(req.url, 'http://127.0.0.1').pathname;
  if (p.startsWith('/__')) {
    if (req.method === 'POST' && p === '/__scenario') { scenario = Object.assign({}, DEFAULT, await readBody(req)); disableFailed = 0; leakSeeded = new Set(); staffExpired = false; expiredStaffJwts.clear(); reopenClientId = null; reopenDone = false; reopenRevertTv = null; loginBumped = false; pwChanged = false; return send(res, 200, scenario); }
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
    // R03: token'lar geçersiz kılındıktan sonraki (kapanıştaki) yeniden giriş reddi / hız sınırı taklidi — yazma YOK
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
    // R03: expireOnDisable — İLK kapatma çağrısı anında o ana dek verilmiş tüm personel token'ları geçersizleşir (süre dolumu taklidi; yazma YOK).
    if (scenario.staffAuth === 'expireOnDisable' && !staffExpired) { staffExpired = true; for (const j of secrets.jwts) expiredStaffJwts.add(j); }
    // R03-e: pwChange onDisable — İLK kapatma çağrısında, işlemeden ÖNCE sürüm +1 (isActive değişmez; "Şifre Değiştir" taklidi — ürün changePassword :587)
    if (scenario.pwChange === 'onDisable' && !pwChanged) { pwChanged = true; await prisma.clientPortalUser.updateMany({ where: { clientId: body.clientId }, data: { tokenVersion: { increment: 1 } } }); }
    const u = await staffUser(req); if (!u) return send(res, 401, { message: 'Unauthorized' });
    if (scenario.disable === 'forbidden') return send(res, 403, { message: 'Portal erişimi yönetimi için yetki yok' });   // ürün: yazmadan ÖNCE 403
    if (scenario.disable === 'notFound') return send(res, 404, { message: 'Müvekkil bulunamadı' });
    if (scenario.disable === 'fail' || (scenario.disable === 'failOnce' && disableFailed === 0)) { disableFailed++; return send(res, 500, { message: 'Internal server error' }); }
    const client = await prisma.client.findFirst({ where: { id: body.clientId, tenantId: u.tenantId }, select: { id: true } });
    if (!client) return send(res, 404, { message: 'Müvekkil bulunamadı' });
    // R03-e: ürün DIŞI kapatma taklitleri — rowDelete onDisable (satır silinir + erişim bayrağı kapanır) · disable passiveOnly (yalnız isActive=false; sürüm ARTMAZ)
    if (scenario.rowDelete === 'onDisable') { await prisma.clientPortalUser.deleteMany({ where: { clientId: body.clientId } }); await prisma.client.update({ where: { id: body.clientId }, data: { hasPortalAccess: false } }); return send(res, 201, { success: true }); }
    if (scenario.disable === 'passiveOnly') { await prisma.clientPortalUser.updateMany({ where: { clientId: body.clientId }, data: { isActive: false } }); return send(res, 201, { success: true }); }
    if (REOPEN_MODES.includes(scenario.reopen)) { const pre = await prisma.clientPortalUser.findUnique({ where: { clientId: body.clientId }, select: { tokenVersion: true } }); reopenRevertTv = pre ? pre.tokenVersion : null; }
    await prisma.$transaction(async (tx) => {
      await tx.clientPortalUser.updateMany({ where: { clientId: body.clientId }, data: { isActive: false, tokenVersion: { increment: 1 }, resetToken: null, resetTokenExp: null } });
      await tx.client.update({ where: { id: body.clientId }, data: { hasPortalAccess: false } });
    });
    if (REOPEN_MODES.includes(scenario.reopen)) reopenClientId = body.clientId;
    return send(res, 201, { success: true });
  }
  // R03-c: reopen — kapanıştan sonraki İLK yerel mesaj listesi isteğinde hesap DB'de yeniden açılır (KUSUR/DIŞ MÜDAHALE TAKLİDİ).
  // R03-d: afterDisable sürümü ÜRÜN GİBİ artırır (reactivate: tokenVersion increment); afterDisableRevert sürümü kapatma ÖNCESİ değere geri döndürür.
  // R03-g: tetik reopenOn'a bağlı — messages (varsayılan; önceki davranış) burada, extLogin dış sunucuda (extHandler).
  if (scenario.reopenOn !== 'extLogin' && reopenPending() && req.method === 'GET' && p === '/api/portal/messages') await doReopen();
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
  if (req.method === 'POST' && p === '/api/portal/login') {
    if (scenario.extLogin === '503') return send(res, 503, 'unavailable');
    const r = await portalLogin(await readBody(req));
    if (scenario.reopenOn === 'extLogin' && reopenPending()) await doReopen();   // R03-g: giriş kapalı hesabı gördükten SONRA yeniden açma
    return send(res, r.status, r.body);
  }
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
