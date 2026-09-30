'use strict';
/*
 * EXTACC D-6 R01 — PORTAL BELGE AKIŞI CANLI KABULÜ (client-extacc-d8-staff-surface-r01 §4) + portal erişim kapanışı (D-4 R03).
 *
 * AKIŞ   : kurulum + makbuz → personel (elev1) ile sentetik müvekkile portal hesabı (`.invalid` adres; gönderim YOK) → koşucu
 *          portal oturumu S1 (yerel) → dosya listesi DIŞ HTTPS = yalnız bu koşumun dosyası (dış zincir kapısı) →
 *          D6-1 koşucunun KENDİ multipart yüklemesi DIŞ uçtan (≤50 KB sentetik PDF, içinde runId; type/title/caseId) 201 + DB satırı
 *          (clientId/tenantId/fileName/filePath/fileSize/mimeType/status) + diskte dosya (üç durumlu stat: var/yok/olculemez — erişim
 *          reddi "yok" SAYILMAZ; koşucu dosya SİLMEZ) →
 *          D6-2 liste yerel + dış 200 = yalnız bu belge → D6-3 dış indirme 200, içerik sha256 = yüklenen → D6-6 personel bekleyen
 *          liste (YEREL API, salt okuma) belgeyi görür → D6-4 kapsam dışı belge (foreignClientId için Prisma ile yazılmış sentetik satır;
 *          dosya yok) indirme 404 + silme 404 + satır dokunulmamış → [GÖSTERİM KAPISI] → QR /portal/documents + e-posta + GEÇİCİ PAROLA
 *          yalnız owner konsolunda → owner TELEFONDAN girer, listeyi/indirmeyi görür (telefon yüklemesi opsiyonel; yaptıysa koşucu
 *          silme adımından ÖNCE telefondan silmesini bekler) → D6-5 koşucu DELETE dış 200 → satır YOK + dosya YOK + liste boş →
 *          owner listeyi yeniler (boş) → kapanış.
 * KAPANIŞ: D-4 R03 kuralları (P6-C1..C5, C2V; DB ve HTTP ayrı; sürüm kendisiyle karşılaştırılmaz; belirsiz oluşturma bekler) +
 *          P6-C-DOC belge kalıntısı (bu müvekkilin PortalDocument satırı 0 ve bilinen dosyalar diskte yok) + P6-FOREIGN-CLEAN
 *          (sentetik yabancı satır Prisma ile temizlenir ve AÇIKÇA raporlanır) + U-CLOSE/U-ISO + P6-D9. Audit/log kayıtları KALIR
 *          ve "saklandı" diye raporlanır. Kalan belge varsa DELETE personel oturumuyla YAPILAMAZ (ürün ucu yok) → "sentetik belge
 *          kaldı" satırı, çıkış 6; Recover'da D6_RESIDUE_CLEANUP=1 (owner kararı) satırları Prisma ile siler, dosyaları SİLMEZ (listeler).
 * YAN ETKİ (kaynak HY_WT_R27 portal.controller/service): upload/list/download/delete yalnız PortalDocument + disk + API log satırı;
 *          bildirim/e-posta/outbox/audit/event YOK. admin approve/reject PortalNotification yazar (uygulama içi) — ÇAĞRILMAZ.
 * YAPMAZ : forgot/reset/change-password · mesaj · admin approve/reject · dosya silme (yalnız ürün DELETE'i) · 503 teşhisi.
 * ÇIKIŞ  : 0 PASS · 2 FAIL · 3 ÖLÇÜLEMEYEN · 1 DURDU · 4 KİMLİK/HEDEF REDDİ · 7 KANIT YAZILAMADI · 5 PERSONEL/DOSYA KAPANIŞI ·
 *          6 PORTAL KAPANIŞI (erişim ya da belge kalıntısı) DOĞRULANMADI (öncelik 6 > 5 > 7 > 1 > 2 > 3 > 0).
 */
const fs = require('fs'); const crypto = require('crypto'); const path = require('path');
const H5 = require('../../client-h5-intake-url-r01/scripts/h5-url-live-run');
const I13 = require('../../client-live-acceptance-i13-r01/scripts/i13-lib');
const { assertReceiptIdentity } = require('../../client-live-acceptance-i12-r01/scripts/i12-live-identity');
const DISPLAY = require('../../client-extacc-intake-chain-r01/scripts/extacc-display');
const { L, isolationFingerprint, closeAccess, dbName } = I13;
const { scrub, addSecret, expectedOriginOf, errText, writeJson, writeEvidenceOrDemote } = H5;

const RECEIPT_RECORD = 'EXTACC-D6-SETUP-RECEIPT';
const GO_RE = /^OWNER-GO-CLIENT-EXTACC-D6-\d{8}-R\d{2}$/;
// Koşucunun ÇAĞIRMADIĞI uçlar (kaynak + çağrı listesi denetimi): parola akışları, mesajlar, belge onay/ret (bildirim yazar).
const FORBIDDEN = [/\/portal\/forgot-password/, /\/portal\/reset-password/, /\/portal\/change-password/, /\/portal\/messages/, /\/admin\/documents\/[^/]+\/(approve|reject)/];
const MAX_PDF_BYTES = 50 * 1024;

// CANLI SÜRELER SABİT (bağlı DB `hukuk_db` ise ortam yok sayılır); izole testler kısaltabilir.
const LIVE_PARAMS = Object.freeze({ D6_WAIT_MS: 20 * 60 * 1000, D6_POLL_MS: 5000, D6_VIEW_MS: 120000, D6_HTTP_TIMEOUT_MS: 15000, D6_CALL_TIMEOUT_MS: 30000,
  D6_LATE_CREATE_MS: 120000, D6_RESIDUE_WAIT_MS: 5 * 60 * 1000 });
function effectiveParams(env) {
  const live = dbName(env.AH_DATABASE_URL || '') === 'hukuk_db' || (env.D6_EXPECT_DB || '') === 'hukuk_db';
  const p = { live };
  for (const k of Object.keys(LIVE_PARAMS)) { const v = Number(env[k]); p[k] = live ? LIVE_PARAMS[k] : (Number.isFinite(v) && v > 0 ? v : LIVE_PARAMS[k]); }
  return p;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sha256 = (b) => crypto.createHash('sha256').update(b).digest('hex');

function commonGates(env) {
  if (env.NODE_TLS_REJECT_UNAUTHORIZED === '0') return { code: 1, why: 'NODE_TLS_REJECT_UNAUTHORIZED=0 — TLS doğrulaması kapalıyken koşulmaz' };
  const display = env.D6_DISPLAY || 'conout';
  if (display !== 'conout' && display !== 'none') return { code: 4, why: 'D6_DISPLAY conout|none olmalı' };
  if (display === 'none' && ((env.D6_EXPECT_DB || '') === 'hukuk_db' || dbName(env.AH_DATABASE_URL || '') === 'hukuk_db')) return { code: 4, why: 'D6_DISPLAY=none canlı DB ile kullanılamaz' };
  const bound = dbName(env.AH_DATABASE_URL || '');
  if (!env.D6_EXPECT_DB || env.D6_EXPECT_DB !== bound) return { code: 4, why: `beklenen DB '${env.D6_EXPECT_DB || ''}' != bağlı '${bound || ''}'` };
  if (!env.D6_API_BASE || env.D6_API_BASE !== env.D6_EXPECT_API) return { code: 4, why: 'API adresi beyanı eşleşmiyor' };
  if (!expectedOriginOf(env.D6_EXPECT_BASE_URL)) return { code: 4, why: 'D6_EXPECT_BASE_URL https:// şemalı, yolsuz bir origin olmalı' };
  // İZOLE MOD SERTLEŞTİRMESİ (inceleme R01): bağlı DB canlı değilse API adresi loopback + 8080 DIŞI açık port olmalı — yanlış beyanla
  // izole koşumdan canlı API'ye (8080) tek bir giriş denemesi bile gitmez. (D-5 koşucusunda bu kapı yok; ayrı kayıt.)
  if ((env.D6_EXPECT_DB || '') !== 'hukuk_db') {
    let u = null; try { u = new URL(env.D6_API_BASE); } catch (e) { u = null; }
    if (!u || !/^(127\.0\.0\.1|localhost)$/.test(u.hostname) || !u.port || u.port === '8080') return { code: 4, why: 'izole mod (canlı olmayan DB): D6_API_BASE 127.0.0.1/localhost ve 8080 DIŞI açık bir port olmalı' };
  }
  return null;
}
function runGates(env) {
  const c = commonGates(env); if (c) return c;
  if (env.D6_LIVE_CONFIRM !== '1') return { code: 3, why: 'D6_LIVE_CONFIRM=1 gerekli' };
  if (!(env.D6_LIVE_GO_REF && GO_RE.test(env.D6_LIVE_GO_REF.trim()))) return { code: 3, why: 'D6_LIVE_GO_REF biçimi (OWNER-GO-CLIENT-EXTACC-D6-YYYYMMDD-RNN) gerekli' };
  const runId = String(env.D6_RUNID || '').toLowerCase();
  if (!/^[0-9a-f]{8}$/.test(runId)) return { code: 2, why: 'D6_RUNID 8 hex olmalı' };
  if (env.D6_EXPECT_TENANT_SLUG !== `${L.AH.TENANT_PREFIX}${runId}`) return { code: 4, why: 'hedef slug beyanı runId ile eşleşmiyor' };
  return { code: 0, runId, origin: expectedOriginOf(env.D6_EXPECT_BASE_URL), display: env.D6_DISPLAY || 'conout' };
}

/** Portal durumu (salt okuma). */
async function portalState(prisma, clientId) {
  const u = await prisma.clientPortalUser.findUnique({ where: { clientId }, select: { email: true, isActive: true, tokenVersion: true, loginCount: true, lastLoginAt: true } });
  const c = await prisma.client.findUnique({ where: { id: clientId }, select: { hasPortalAccess: true } });
  return { exists: !!u, email: u ? u.email : null, isActive: u ? u.isActive : null, tokenVersion: u ? u.tokenVersion : null, loginCount: u ? u.loginCount : null,
    lastLoginAt: u && u.lastLoginAt ? u.lastLoginAt.toISOString() : null, hasPortalAccess: c ? c.hasPortalAccess : null };
}
/** Bu müvekkilin belge satırları (salt okuma; filePath yalnız varlık kontrolü için okunur). */
async function docRows(prisma, clientId) {
  return prisma.portalDocument.findMany({ where: { clientId }, orderBy: { createdAt: 'asc' }, select: { id: true, tenantId: true, caseId: true, type: true, title: true, fileName: true, filePath: true, fileSize: true, mimeType: true, status: true } });
}
/**
 * ÜÇ DURUMLU DOSYA YOKLAMASI (inceleme R01): 'var' · 'yok' (ENOENT/ENOTDIR) · 'olculemez' (EACCES/EPERM/EBUSY/… — erişim reddi
 * "yok" SAYILMAZ). `fs.existsSync` erişim hatasında da false döndürdüğünden "diskte dosya YOK" ölçütleri sahte PASS üretebilirdi;
 * Windows'ta ölçüldü: dosya F + üst dizin RD reddi → statSync EPERM, existsSync false. `statFn` yalnız öz-test enjeksiyonu içindir.
 */
function fileState(p, statFn) {
  if (!p) return { state: 'yok', code: null };
  try { (statFn || fs.statSync)(p); return { state: 'var', code: null }; }
  catch (e) { const c = (e && e.code) || 'HATA'; return (c === 'ENOENT' || c === 'ENOTDIR') ? { state: 'yok', code: c } : { state: 'olculemez', code: c }; }
}
const caseListMatches = (body, caseId, fileNumber) => Array.isArray(body) && body.length === 1 && body[0] && body[0].id === caseId && body[0].fileNumber === fileNumber;
const docListMatches = (body, docId) => Array.isArray(body) && body.length === 1 && body[0] && body[0].id === docId;

/** ≤50 KB sentetik PDF; içinde runId (kişisel veri yok). Geçerli xref ile tek sayfa. */
function buildPdf(runId) {
  const text = `D6-${runId}`;
  const content = `BT /F1 18 Tf 20 50 Td (${text}) Tj ET`;
  const objs = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 240 100] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
  let out = `%PDF-1.4\n%D6 sentetik belge ${text} ${crypto.randomBytes(8).toString('hex')}\n`; const offs = [];
  objs.forEach((o, i) => { offs.push(Buffer.byteLength(out)); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = Buffer.byteLength(out);
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offs.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('') + `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  const buf = Buffer.from(out, 'latin1'); if (buf.length > MAX_PDF_BYTES) throw new Error('sentetik PDF 50 KB sınırını aştı'); return buf;
}
/** Elle multipart/form-data gövdesi (alanlar + tek dosya). */
function multipart(fields, file) {
  const b = `----D6Boundary${crypto.randomBytes(12).toString('hex')}`; const parts = [];
  for (const [k, v] of Object.entries(fields)) parts.push(Buffer.from(`--${b}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`, 'utf8'));
  parts.push(Buffer.from(`--${b}\r\nContent-Disposition: form-data; name="file"; filename="${file.name}"\r\nContent-Type: ${file.type}\r\n\r\n`, 'utf8'), file.data, Buffer.from(`\r\n--${b}--\r\n`, 'utf8'));
  return { body: Buffer.concat(parts), contentType: `multipart/form-data; boundary=${b}` };
}
/** Ham HTTP (ikili gövde). İstemci zaman aşımı sunucuyu İPTAL ETMEZ → belirsiz sonuç. */
async function httpRaw(method, url, { token, contentType, body, timeoutMs = 30000 } = {}) {
  const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), timeoutMs); const started = Date.now();
  try {
    const headers = Object.assign({}, token ? { authorization: `Bearer ${token}` } : {}, contentType ? { 'content-type': contentType } : {});
    const res = await fetch(url, { method, headers, body, signal: ctl.signal });
    const buf = Buffer.from(await res.arrayBuffer()); let json = null; try { json = JSON.parse(buf.toString('utf8')); } catch (e) { json = null; }
    return { status: res.status, buf, json, headers: { type: res.headers.get('content-type') || '', disposition: res.headers.get('content-disposition') || '' }, elapsedMs: Date.now() - started, indeterminate: false };
  } catch (e) { return { status: null, buf: null, json: null, headers: {}, elapsedMs: Date.now() - started, indeterminate: true, indeterminateReason: e && e.name === 'AbortError' ? `istemci timeout (${timeoutMs} ms)` : `taşıma hatası: ${errText(e, 100)}` }; }
  finally { clearTimeout(timer); }
}

/**
 * BELGE KALINTISI (P6-C-DOC): bu müvekkilin PortalDocument satırı 0 VE bilinen dosyalar (makbuz + o anki satırlar) diskte yok.
 * Koşucu dosya SİLMEZ. `cleanup` (Recover, owner kararı) satırları Prisma ile siler; dosyalar listelenir, silinmez.
 */
async function documentResidue(R, prisma, receipt, knownFiles, cleanup) {
  const res = { rowsBefore: null, rows: null, rowsDeletedByPrisma: 0, filesLeftOnDisk: [], filesAccessError: [], cleanupRequested: !!cleanup };
  let rows; try { rows = await docRows(prisma, receipt.clientId); } catch (e) { R.unmeasured('P6-C-DOC', 'belge kalıntısı', `okunamadı: ${errText(e, 120)}`); res.error = errText(e, 120); return res; }
  res.rowsBefore = rows.length; const known = new Set([...(knownFiles || []), ...rows.map((r) => r.filePath)].filter(Boolean));
  if (cleanup && rows.length) {
    const d = await prisma.portalDocument.deleteMany({ where: { clientId: receipt.clientId } }); res.rowsDeletedByPrisma = d.count;
    res.note = 'OWNER KARARI: kalan belge satırları Prisma ile silindi (ürün ucu dışı); dosyalar diskte BIRAKILDI — elle silinir';
    rows = await docRows(prisma, receipt.clientId);
  }
  res.rows = rows.length; res.knownFilesChecked = known.size;
  const states = [...known].map((p) => Object.assign({ p }, fileState(p)));
  res.filesLeftOnDisk = states.filter((s) => s.state === 'var').map((s) => path.basename(s.p));
  res.filesAccessError = states.filter((s) => s.state === 'olculemez').map((s) => `${path.basename(s.p)}:${s.code}`);
  const desc = 'belge kalıntısı YOK: bu müvekkilin PortalDocument satırı 0 · bilinen dosyalar diskte yok (üç durumlu yoklama; koşucu dosya silmez)';
  const obs = `satır=${res.rows}${res.rowsDeletedByPrisma ? ` (Prisma ile silinen ${res.rowsDeletedByPrisma})` : ''} · kontrol edilen dosya=${known.size} · diskte kalan=${res.filesLeftOnDisk.length}`;
  // Erişim reddi "yok" SAYILMAZ: PASS verilmez, ÖLÇÜLEMEYEN yazılır (kova okunabilirliği owner tarafından düzeltilir; Preflight de ölçer).
  if (res.filesAccessError.length) R.unmeasured('P6-C-DOC', desc, `${obs} · dosya erişimi ÖLÇÜLEMEDİ (${res.filesAccessError.join(',')}) — "yok" sayılmadı`);
  else R.check('P6-C-DOC', desc, rows.length === 0 && res.filesLeftOnDisk.length === 0, `${obs}${rows.length ? ' · SENTETİK BELGE KALDI (ürün DELETE\'i personel oturumuyla yapılamaz)' : ''}`);
  return res;
}
/** Sentetik yabancı belge satırı (D6-4 için Prisma ile yazıldı) Prisma ile temizlenir — AÇIKÇA raporlanır. */
async function foreignCleanup(R, prisma, receipt) {
  const res = { deleted: 0, remaining: null };
  try {
    if (receipt.foreignDocumentId) { const d = await prisma.portalDocument.deleteMany({ where: { id: receipt.foreignDocumentId, clientId: receipt.foreignClientId, tenantId: receipt.foreignTenantId } }); res.deleted = d.count; }
    res.remaining = await prisma.portalDocument.count({ where: { clientId: receipt.foreignClientId } });
    R.check('P6-FOREIGN-CLEAN', 'sentetik YABANCI belge satırı Prisma ile temizlendi (ürün ucu dışı; dosyası hiç yoktu) — yabancı müvekkilde satır 0', res.remaining === 0, `silinen=${res.deleted} kalan=${res.remaining}${receipt.foreignDocumentId ? '' : ' · yabancı satır hiç yazılmamıştı'}`);
  } catch (e) { res.error = errText(e, 120); R.unmeasured('P6-FOREIGN-CLEAN', 'yabancı satır temizliği', res.error); }
  return res;
}

/** PORTAL ERİŞİM KAPANIŞI — D-4 R03 ile aynı kurallar + belge kalıntısı. */
async function closePortal(R, prisma, base, origin, receipt, P, opts) {
  const o = opts || {}; const v = (id) => (R.rows.find((r) => r.id === id) || {}).verdict;
  const res = { ok: false, dbClosed: false, httpVerified: false, httpFailed: false, identity: null, disableCalls: [], productFinding: null, lateCreate: null, docResidue: null };
  const ident = await assertReceiptIdentity(prisma, receipt); res.identity = ident.ok ? 'OK' : ident.reason;
  if (!ident.ok) { res.note = 'kimlik bağı DOĞRULANMADI — hiçbir yazma yapılmadı'; R.check('P6-C1', 'portal erişimi yetkili uçla kapatıldı', false, res.note); return res; }
  let st0 = await portalState(prisma, receipt.clientId);
  if (!st0.exists && o.createUncertain) {
    const t0 = Date.now(); while (!st0.exists && Date.now() - t0 < P.D6_LATE_CREATE_MS) { await sleep(P.D6_POLL_MS); st0 = await portalState(prisma, receipt.clientId); }
    res.lateCreate = st0.exists ? `hesap ilk sorguda YOKTU, ~${Math.round((Date.now() - t0) / 1000)} sn sonra GÖRÜLDÜ — kapatılıyor` : `hesap ${Math.round(P.D6_LATE_CREATE_MS / 1000)} sn görülmedi — geç oluşma DIŞLANAMADI`;
  }
  res.before = st0;
  if (!st0.exists) {
    if (o.createUncertain) {
      // Geç oluşma DIŞLANAMADI: kapanış doğrulanmaz; belge kalıntısı yine de ölçülür (hesap yokken yükleme yapılmamıştır → satır 0 beklenir).
      res.lateCreateRisk = true; R.unmeasured('P6-C1', 'portal erişimi yetkili uçla kapatıldı', `${res.lateCreate}; kapanış DOĞRULANMADI`);
      res.docResidue = await documentResidue(R, prisma, receipt, o.knownFiles, o.residueCleanup); return res;
    }
    res.ok = true; res.dbClosed = true; res.note = o.absentNote || 'portal hesabı yok (oluşturma isteği gönderilmedi ya da kesin reddedildi)';
    R.check('P6-C1', 'portal erişimi yetkili uçla kapatıldı', true, res.note);
    res.docResidue = await documentResidue(R, prisma, receipt, o.knownFiles, o.residueCleanup); res.ok = res.ok && v('P6-C-DOC') === 'PASS'; res.dbClosed = res.ok; return res;
  }
  let disabledNow = false;
  if (st0.isActive || st0.hasPortalAccess) {
    for (let i = 0; i < 2; i++) {
      if ((!o.session || !o.session.token) && o.sessionProvider) { try { o.session = await o.sessionProvider(); res.disableCalls.push('personel oturumu kapatma için açıldı'); } catch (e) { res.disableCalls.push(`personel oturumu açılamadı: ${errText(e, 100)}`); } }
      if (!o.session || !o.session.token) { res.disableCalls.push('personel oturumu YOK'); break; }
      const r = await L.AH.httpJson('POST', `${base}/portal/admin/disable-user`, { token: o.session.token, body: { clientId: receipt.clientId }, timeoutMs: P.D6_CALL_TIMEOUT_MS });
      res.disableCalls.push(r.indeterminate ? 'belirsiz' : `HTTP ${r.status}`);
      if (!r.indeterminate && r.status >= 200 && r.status < 300) { disabledNow = true; break; }
      const now = await portalState(prisma, receipt.clientId); if (!now.isActive && !now.hasPortalAccess) { res.disableCalls.push('DB: kapalı görüldü'); break; }
      if (!r.indeterminate && r.status < 500) break;
    }
  } else res.disableCalls.push('çağrılmadı — hesap zaten pasif ve erişim kapalı');
  const st1 = await portalState(prisma, receipt.clientId); res.after = st1;
  const flags = st1.isActive === false && st1.hasPortalAccess === false;
  R.check('P6-C1', 'portal erişimi YETKİLİ uçla kapatıldı (admin/disable-user) ya da zaten kapalıydı', disabledNow || (!st0.isActive && !st0.hasPortalAccess) || flags, `çağrılar=${JSON.stringify(res.disableCalls)}${res.lateCreate ? ' · ' + res.lateCreate : ''}`);
  R.check('P6-C2', 'DB: portal kullanıcısı pasif · müvekkil portal erişimi kapalı', flags, `isActive=${st1.isActive} hasPortalAccess=${st1.hasPortalAccess}`);
  const issued = Number.isInteger(o.issuedVersion) ? o.issuedVersion : null; const openBefore = st0.isActive || st0.hasPortalAccess;
  const ref = issued !== null ? { value: issued, source: 'oturumların verildiği sürüm' } : (openBefore ? { value: st0.tokenVersion, source: 'bu kapanıştan hemen önceki sürüm' } : null);
  res.version = { before: st0.tokenVersion, after: st1.tokenVersion, issued, ref };
  const vdesc = 'DB: tokenVersion, oturumların verildiği (ya da kapanış öncesi) sürümden BÜYÜK';
  if (!ref) R.unmeasured('P6-C2V', vdesc, `hesap zaten kapalıydı ve verilme sürümü bilinmiyor — mevcut sürüm (${st1.tokenVersion}) kendisiyle karşılaştırılmaz`);
  else R.check('P6-C2V', vdesc, typeof st1.tokenVersion === 'number' && st1.tokenVersion > ref.value, `${ref.source}=${ref.value} → şimdiki=${st1.tokenVersion}`);
  const tmo = P.D6_HTTP_TIMEOUT_MS; let creds = o.creds || null;
  if (!creds && o.credsForClosed && flags) { try { creds = await o.credsForClosed(st1); res.measureCreds = 'pasif hesaba YALNIZ ölçüm için yeni rastgele parola yazıldı (hesap pasif kaldı)'; } catch (e) { res.measureCreds = `ölçüm parolası kurulamadı: ${errText(e, 120)}`; } }
  const nl = creds ? await L.AH.httpJson('POST', `${base}/portal/login`, { body: { email: creds.email, password: creds.password }, timeoutMs: tmo }) : null;
  const nd = creds ? await L.AH.httpJson('POST', `${origin}/api/portal/login`, { body: { email: creds.email, password: creds.password }, timeoutMs: tmo }) : null;
  const judge401 = (id, desc, r) => { if (!r) return R.unmeasured(id, desc, `kimlik bilgisi yok${res.measureCreds ? ' (' + res.measureCreds + ')' : ''} — ölçülemez`); if (r.indeterminate) return R.unmeasured(id, desc, 'yanıt alınamadı'); if (r.status === 503 || r.status === 429) return R.unmeasured(id, desc, `HTTP ${r.status} — neden UNKNOWN`); return R.check(id, desc, r.status === 401, `HTTP ${r.status}`); };
  judge401('P6-C3L', 'kapanış sonrası YENİ portal girişi YEREL 401', nl); judge401('P6-C3D', 'kapanış sonrası YENİ portal girişi DIŞ HTTPS 401', nd);
  // Mevcut oturum: belge listesi ucu (bu paketin korumalı ucu) yerel + dış
  const el = o.portalToken ? await L.AH.httpJson('GET', `${base}/portal/documents`, { token: o.portalToken, timeoutMs: tmo }) : null;
  const ed = o.portalToken ? await L.AH.httpJson('GET', `${origin}/api/portal/documents`, { token: o.portalToken, timeoutMs: tmo }) : null;
  const judgeSession = (id, desc, r) => { if (!r) return R.unmeasured(id, desc, o.noSessionWhy || 'koşumda portal oturumu alınmadı — mevcut oturum ölçülemez'); if (r.indeterminate) return R.unmeasured(id, desc, 'yanıt alınamadı'); if (r.status === 200) { res.productFinding = 'ÜRÜN BULGUSU: portal erişimi kapatıldıktan sonra MEVCUT oturum belge listesine erişmeye devam ediyor'; return R.check(id, desc, false, 'HTTP 200 — MEVCUT OTURUM KAPANMADI (ürün bulgusu)'); } if (r.status === 503 || r.status === 429) return R.unmeasured(id, desc, `HTTP ${r.status} — neden UNKNOWN`); return R.check(id, desc, r.status === 401, `HTTP ${r.status}`); };
  judgeSession('P6-C4L', 'kapanış sonrası MEVCUT portal oturumu belge listesinde YEREL 401', el); judgeSession('P6-C4D', 'kapanış sonrası MEVCUT portal oturumu belge listesinde DIŞ HTTPS 401', ed);
  const st2 = await portalState(prisma, receipt.clientId);
  R.check('P6-C5', 'HTTP ölçümlerinden SONRA DB hâlâ kapalı (pasif + erişim kapalı + sürüm geri gitmedi)', st2.isActive === false && st2.hasPortalAccess === false && st2.tokenVersion === st1.tokenVersion, `isActive=${st2.isActive} hasPortalAccess=${st2.hasPortalAccess} sürüm=${st2.tokenVersion}`);
  res.docResidue = await documentResidue(R, prisma, receipt, o.knownFiles, o.residueCleanup);
  const httpIds = ['P6-C3L', 'P6-C3D', 'P6-C4L', 'P6-C4D'];
  res.dbClosed = v('P6-C2') === 'PASS' && v('P6-C2V') !== 'FAIL' && v('P6-C5') === 'PASS' && v('P6-C-DOC') === 'PASS';
  res.httpFailed = httpIds.some((id) => v(id) === 'FAIL'); res.httpVerified = httpIds.every((id) => v(id) === 'PASS'); res.httpUnmeasured = httpIds.filter((id) => v(id) === 'UNMEASURED');
  const required = ['P6-C3L', 'P6-C3D'].concat(o.sessionRequired === false ? [] : ['P6-C4L', 'P6-C4D']);
  res.ok = res.dbClosed && v('P6-C2V') === 'PASS' && !res.httpFailed && required.every((id) => v(id) === 'PASS') && !res.productFinding;
  return res;
}
function exitCodeOf(out, s) { if (!(out.portalClose && out.portalClose.ok)) return 6; if (!(out.closure && out.closure.ok)) return 5; if (out.fatal) return 1; if (s.fail > 0) return 2; if (s.unmeasured > 0) return 3; return 0; }
function recoverExitCode(out, s) { const pc = out.portalClose || {}; if (!pc.dbClosed || pc.httpFailed || pc.productFinding || pc.lateCreateRisk) return 6; if (!(out.closure && out.closure.ok)) return 5; if (out.fatal) return 1; if (s.fail > 0) return 2; if (s.unmeasured > 0) return 3; return 0; }
function recoveryAdvice(out, receiptPath) {
  const need = []; const pc = out.portalClose || {}; const dr = pc.docResidue || {};
  if (!pc.ok) {
    if (pc.productFinding) need.push('PORTAL: mevcut oturum kapanmadı (ÜRÜN BULGUSU — Recover düzeltemez; token 7 gün geçerli)');
    else if (pc.lateCreateRisk) need.push('PORTAL: oluşturma belirsiz (geç oluşma DIŞLANAMADI), hesap görülmedi — birkaç dakika sonra Recover BİR KEZ');
    else if ((dr.filesAccessError || []).length) need.push(`BELGE: diskteki dosya erişimi ÖLÇÜLEMEDİ (${dr.filesAccessError.join(',')}) — kalıntı "yok" SAYILMADI; belge kovası (HUKUK_DATA_ROOT/portal-documents) okunabilirliği düzeltildikten sonra Recover BİR KEZ`);
    else if (dr.rows > 0 || (dr.filesLeftOnDisk || []).length) need.push(`BELGE: sentetik belge KALDI (satır=${dr.rows} · diskte dosya=${(dr.filesLeftOnDisk || []).length}) — ürün DELETE'i personel oturumuyla yapılamaz; Recover'da D6_RESIDUE_CLEANUP=1 (owner kararı) satırları Prisma ile siler, dosyalar elle silinir`);
    else if (pc.dbClosed) need.push(`PORTAL: DB kapalı ama HTTP reddi doğrulanmadı (ölçülemeyen: ${(pc.httpUnmeasured || []).join(',') || '-'})`);
    else need.push('PORTAL ERİŞİMİ kapandığı doğrulanmadı');
  }
  if (!(out.closure && out.closure.ok)) need.push('PERSONEL/DOSYA KAPANIŞI doğrulanmadı');
  if (!need.length) return { gerekli: false };
  let onDisk = false; try { onDisk = !!receiptPath && fs.existsSync(receiptPath); } catch (e) { onDisk = false; }
  return { gerekli: true, neden: need, makbuz: receiptPath || null, makbuzDiskte: onDisk, adim: 'Owner bloğu `-Mode Recover -ReceiptFile <makbuz>` ile; kabul ölçütleri tekrarlanmaz. Belge kalıntısı için owner kararı sorulur.' };
}

// ------------------------------------------------------------------ RUN
async function runMode() {
  const g = runGates(process.env); if (g.code !== 0) { console.error(`REDDEDİLDİ: ${g.why}`); process.exit(g.code); }
  const { runId, origin } = g; const base = process.env.D6_API_BASE;
  const pw = process.env.D6_LIVE_LOGIN_PW; const receiptPath = process.env.D6_RECEIPT; const evid = process.env.D6_EVID_FILE;
  if (!pw || !receiptPath || !evid) { console.error('REDDEDİLDİ: D6_LIVE_LOGIN_PW + D6_RECEIPT + D6_EVID_FILE gerekli.'); process.exit(2); }
  addSecret(pw); addSecret(process.env.D6_LIVE_GO_REF); addSecret(process.env.AH_DATABASE_URL);
  const P = effectiveParams(process.env);
  let con = null;
  if (g.display === 'conout') { try { con = DISPLAY.openConsole(); } catch (e) { console.error(`REDDEDİLDİ: yerel konsol yok — ${errText(e, 120)} (hiçbir yazma yapılmadı)`); process.exit(4); } }
  const R = new L.Results(); const prisma = L.AH.loadPrisma(); const bcrypt = require(process.env.AH_BCRYPT_PATH);
  // Owner ekranı: canlıda YALNIZ yerel konsol. Gösterimsiz izole testte (display=none; canlı DB ile kapı reddeder) satırlar test dosyasına yazılır.
  const showOwner = async (lines) => { if (con) return DISPLAY.show(con, lines); if (g.display === 'none' && process.env.D6_TEST_DISPLAY_SINK) fs.appendFileSync(process.env.D6_TEST_DISPLAY_SINK, lines.join('\n') + '\n'); };
  const portalPw = 'D6p!' + crypto.randomBytes(12).toString('base64url'); addSecret(portalPw);
  const portalEmail = `portal-d6-${runId}@ah-harness.invalid`; const fileNumber = `I3-${runId}`;
  const pdf = buildPdf(runId); const pdfSha = sha256(pdf); const docFileName = `d6-${runId}.pdf`; const docTitle = `D6-${runId}`;
  const out = { record: 'EXTACC-D6-PORTAL-DOCUMENTS-LIVE-RUN', revision: 'R01', runId, apiBase: base, expectedOrigin: origin, params: P, calledEndpoints: [], upload: { fileName: docFileName, bytes: pdf.length, sha256: pdfSha, title: docTitle } };
  const call = (m, p) => out.calledEndpoints.push(`${m} ${p.replace(base, '<API>').replace(origin, '<DIŞ>')}`);
  let receipt = null; let fatal = null; let session = null; let portalToken = null; let stopped = null; let displayed = false; let createOutcome = null; let issuedVersion = null;
  let docId = null; let docPath = null; const knownFiles = [];
  const v = (id) => (R.rows.find((r) => r.id === id) || {}).verdict;
  try {
    out.isolationBefore = await isolationFingerprint(prisma, []);
    const st = await L.setupI3(prisma, bcrypt, runId, await bcrypt.hash(pw, 10));
    receipt = { record: RECEIPT_RECORD, runId, tenantId: st.tenantId, tenantSlug: st.slug, foreignTenantId: st.foreignTenantId, clientId: st.clientId, foreignClientId: st.foreignClientId, caseId: st.caseId,
      elevUserId: st.actors.elev1.id, elevEmail: st.actors.elev1.email, portalEmail, createdAt: new Date().toISOString() };
    out.receipt = receipt;
    const saveReceipt = (why) => { try { writeJson(receiptPath, receipt); return true; } catch (e) { out.receiptWriteError = errText(e, 160); if (why) throw new Error(why); return false; } };
    saveReceipt('makbuz yazılamadı — portal hesabı AÇILMADI');
    call('POST', `${base}/auth/login`); session = await L.AH.login(base, st.actors.elev1.email, pw, st.slug); if (session && session.token) addSecret(session.token);
    if (!session.ok) throw new Error(`elev1 oturum açamadı (HTTP ${session.status ?? 'belirsiz'})`);
    R.check('P6-00', 'ÖLÇÜM GEÇERLİ: elev1 ADMIN değil', st.actors.elev1.role !== 'ADMIN', `elev1:${st.actors.elev1.role}`);
    out.auditBefore = await prisma.auditLog.count({ where: { tenantId: st.tenantId } });

    receipt.createAttemptedAt = new Date().toISOString();
    try { writeJson(receiptPath, receipt); } catch (e) { out.receiptWriteError = errText(e, 160); delete receipt.createAttemptedAt; throw new Error('makbuza oluşturma denemesi yazılamadı — portal hesabı İSTENMEDİ'); }
    createOutcome = 'attempted'; call('POST', `${base}/portal/admin/create-user`);
    const cu = await L.AH.httpJson('POST', `${base}/portal/admin/create-user`, { token: session.token, body: { clientId: st.clientId, email: portalEmail, password: portalPw }, timeoutMs: P.D6_CALL_TIMEOUT_MS });
    createOutcome = cu.indeterminate || cu.status >= 500 ? 'uncertain' : (cu.status >= 200 && cu.status < 300 ? 'ok' : 'rejected');
    receipt.createOutcome = createOutcome; saveReceipt(null);
    if (cu.indeterminate) R.unmeasured('P6-01', 'sentetik müvekkile portal hesabı yetkili uçla açıldı (gönderim yok)', 'yanıt alınamadı — hesap SONRADAN oluşmuş olabilir (kapanış bekler)');
    else R.check('P6-01', 'sentetik müvekkile portal hesabı yetkili uçla açıldı (gönderim yok)', cu.status >= 200 && cu.status < 300, `HTTP ${cu.status}`);
    const s1 = await portalState(prisma, st.clientId);
    const p02 = createOutcome === 'ok' && s1.exists && s1.isActive === true && s1.hasPortalAccess === true && s1.email === portalEmail;
    R.check('P6-02', 'DB: portal hesabı aktif · müvekkil portal erişimi açık · e-posta doğru', p02, `var=${s1.exists} aktif=${s1.isActive} erişim=${s1.hasPortalAccess} e-posta eşit=${s1.email === portalEmail}`);
    if (!p02) stopped = 'portal hesabı beklenen durumda değil — belge akışı KOŞULMADI, giriş bilgisi GÖSTERİLMEDİ';
    else { issuedVersion = s1.tokenVersion; receipt.portalIssuedTokenVersion = s1.tokenVersion; if (!saveReceipt(null)) stopped = 'makbuza oturum sürümü yazılamadı — belge akışı KOŞULMADI'; }

    if (!stopped) {
      call('POST', `${base}/portal/login`);
      const pl = await L.AH.httpJson('POST', `${base}/portal/login`, { body: { email: portalEmail, password: portalPw }, timeoutMs: P.D6_HTTP_TIMEOUT_MS });
      portalToken = pl.body && typeof pl.body.token === 'string' ? pl.body.token : null; if (portalToken) addSecret(portalToken);
      R.check('P6-03L', 'koşucu portal girişi YEREL 201 + oturum', !pl.indeterminate && pl.status === 201 && !!portalToken, pl.indeterminate ? 'yanıt yok' : `HTTP ${pl.status}`);
      if (portalToken) {
        call('GET', '<DIŞ>/api/portal/cases'); const cd = await L.AH.httpJson('GET', `${origin}/api/portal/cases`, { token: portalToken, timeoutMs: P.D6_HTTP_TIMEOUT_MS });
        if (cd.indeterminate || cd.status === 503) { R.unmeasured('P6-04D', 'dosya listesi DIŞ HTTPS 200', cd.indeterminate ? 'yanıt yok' : 'HTTP 503 — neden UNKNOWN'); stopped = 'dış zincir ölçülemedi — belge akışı KOŞULMADI'; }
        else R.check('P6-04D', 'dosya listesi DIŞ HTTPS 200 ve YALNIZ bu koşumun dosyası (dış zincir kapısı)', cd.status === 200 && caseListMatches(cd.body, st.caseId, fileNumber), `HTTP ${cd.status}`);
      } else stopped = 'portal oturumu alınamadı — belge akışı KOŞULMADI';
      if (!stopped && v('P6-04D') !== 'PASS') stopped = 'dış zincir kapısı PASS değil — belge akışı KOŞULMADI';
    }

    // ---- D6-1 YÜKLEME (DIŞ uçtan, koşucunun kendi multipart'ı)
    if (!stopped) {
      receipt.uploadAttemptedAt = new Date().toISOString();
      try { writeJson(receiptPath, receipt); } catch (e) { out.receiptWriteError = errText(e, 160); delete receipt.uploadAttemptedAt; throw new Error('makbuza yükleme denemesi yazılamadı — yükleme YAPILMADI'); }
      const mp = multipart({ type: 'DIGER', title: docTitle, description: `EXTACC D-6 sentetik belge ${runId}`, caseId: st.caseId }, { name: docFileName, type: 'application/pdf', data: pdf });
      call('POST', '<DIŞ>/api/portal/documents/upload (multipart)');
      const up = await httpRaw('POST', `${origin}/api/portal/documents/upload`, { token: portalToken, contentType: mp.contentType, body: mp.body, timeoutMs: P.D6_CALL_TIMEOUT_MS });
      receipt.uploadOutcome = up.indeterminate ? 'uncertain' : (up.status === 201 ? 'ok' : (up.status >= 500 ? 'uncertain' : 'rejected'));
      const upBody = up.json && typeof up.json === 'object' ? up.json : null;
      docId = upBody && typeof upBody.id === 'string' ? upBody.id : null; if (docId) receipt.documentId = docId; saveReceipt(null);
      if (up.indeterminate) R.unmeasured('D6-1', 'dış multipart yükleme 201', `yanıt alınamadı (${up.indeterminateReason}) — belge sonradan oluşmuş olabilir (kapanış kalıntı ölçer)`);
      else R.check('D6-1', 'koşucunun DIŞ HTTPS multipart yüklemesi 201 + yanıtta belge id/title/fileName/status=PENDING', up.status === 201 && !!docId && upBody.title === docTitle && upBody.fileName === docFileName && upBody.status === 'PENDING', `HTTP ${up.status} · id=${docId ? 'var' : 'yok'}`);
      const rows = await docRows(prisma, st.clientId); const row = docId ? rows.find((r) => r.id === docId) : (rows.length === 1 ? rows[0] : null);
      if (row) { docId = docId || row.id; docPath = row.filePath; knownFiles.push(docPath); receipt.documentId = docId; receipt.documentFile = docPath; saveReceipt(null); }
      const fst = row ? fileState(row.filePath) : { state: 'yok', code: null }; const onDisk = fst.state === 'var';
      const rowOk = !!row; // clientId kapsamı: satır `where clientId` ile sorgulandı
      R.check('D6-1D', 'DB: PortalDocument satırı — clientId (sorgu) · tenantId · caseId · fileName · fileSize=bayt · mimeType=application/pdf · status=PENDING · filePath diskte VAR (stat)',
        rowOk && rows.length === 1 && row.tenantId === st.tenantId && row.caseId === st.caseId && row.fileName === docFileName && row.fileSize === pdf.length && row.mimeType === 'application/pdf' && row.status === 'PENDING' && onDisk,
        row ? `satır=${rows.length} tenant=${row.tenantId === st.tenantId} case=${row.caseId === st.caseId} ad=${row.fileName === docFileName} boyut=${row.fileSize}/${pdf.length} mime=${row.mimeType} durum=${row.status} diskte=${fst.state}${fst.code ? '(' + fst.code + ')' : ''} dosya=${path.basename(row.filePath)}` : `satır YOK (toplam ${rows.length})`);
      if (!docId) stopped = 'yükleme sonucu belge yok — liste/indirme/silme ÖLÇÜLEMEZ, giriş bilgisi GÖSTERİLMEDİ';
    }
    // ---- D6-2 LİSTE · D6-3 İNDİRME · D6-6 PERSONEL BEKLEYEN · D6-4 KAPSAM DIŞI
    if (!stopped) {
      // Kapsam dışı satır ÖNCE yazılır: yabancı tenant'ın müvekkiline Prisma ile sentetik satır (dosya YOK, yol var olmayan işaret) —
      // böylece liste ölçütleri (D6-2) kapsam sızıntısını da görebilir.
      const fdoc = await prisma.portalDocument.create({ data: { clientId: st.foreignClientId, tenantId: st.foreignTenantId, type: 'DIGER', title: `D6-FOREIGN-${runId}`, fileName: `d6-foreign-${runId}.pdf`, filePath: `D6-FOREIGN-NO-FILE-${runId}`, fileSize: 1, mimeType: 'application/pdf' }, select: { id: true } });
      receipt.foreignDocumentId = fdoc.id; saveReceipt(null);
      call('GET', `${base}/portal/documents`); const ll = await L.AH.httpJson('GET', `${base}/portal/documents`, { token: portalToken, timeoutMs: P.D6_HTTP_TIMEOUT_MS });
      call('GET', '<DIŞ>/api/portal/documents'); const ld = await L.AH.httpJson('GET', `${origin}/api/portal/documents`, { token: portalToken, timeoutMs: P.D6_HTTP_TIMEOUT_MS });
      R.check('D6-2L', 'belge listesi YEREL 200 ve YALNIZ bu koşumun belgesi', ll.status === 200 && docListMatches(ll.body, docId), `HTTP ${ll.status} · kayıt=${Array.isArray(ll.body) ? ll.body.length : '-'}`);
      if (ld.indeterminate || ld.status === 503) R.unmeasured('D6-2D', 'belge listesi DIŞ HTTPS 200', ld.indeterminate ? 'yanıt yok' : 'HTTP 503 — neden UNKNOWN');
      else R.check('D6-2D', 'belge listesi DIŞ HTTPS 200 ve YALNIZ bu koşumun belgesi (yanıtta filePath YOK)', ld.status === 200 && docListMatches(ld.body, docId) && !('filePath' in (ld.body[0] || {})), `HTTP ${ld.status} · kayıt=${Array.isArray(ld.body) ? ld.body.length : '-'}`);
      call('GET', '<DIŞ>/api/portal/documents/:id/download'); const dl = await httpRaw('GET', `${origin}/api/portal/documents/${docId}/download`, { token: portalToken, timeoutMs: P.D6_CALL_TIMEOUT_MS });
      if (dl.indeterminate || dl.status === 503) R.unmeasured('D6-3', 'dış indirme 200', dl.indeterminate ? 'yanıt yok' : 'HTTP 503 — neden UNKNOWN');
      else R.check('D6-3', 'dış HTTPS indirme 200 · içerik sha256 = yüklenen · content-disposition dosya adını taşır', dl.status === 200 && !!dl.buf && sha256(dl.buf) === pdfSha && /attachment/i.test(dl.headers.disposition) && dl.headers.disposition.includes(docFileName),
        `HTTP ${dl.status} · bayt=${dl.buf ? dl.buf.length : '-'} · sha eşit=${!!dl.buf && sha256(dl.buf) === pdfSha} · type=${dl.headers.type.split(';')[0]}`);
      call('GET', `${base}/portal/admin/documents/pending (personel, salt okuma)`); const pd = await L.AH.httpJson('GET', `${base}/portal/admin/documents/pending`, { token: session.token, timeoutMs: P.D6_HTTP_TIMEOUT_MS });
      if (pd.indeterminate) R.unmeasured('D6-6', 'personel bekleyen belge listesi (yerel)', 'yanıt yok');
      else R.check('D6-6', 'personel bekleyen belge listesi YEREL 200 ve bu belgeyi içeriyor (onay/ret ÇAĞRILMAZ)', pd.status === 200 && Array.isArray(pd.body) && pd.body.some((d) => d && d.id === docId) && pd.body.every((d) => d && d.tenantId === st.tenantId), `HTTP ${pd.status} · kayıt=${Array.isArray(pd.body) ? pd.body.length : '-'}`);
      call('GET', '<DIŞ>/api/portal/documents/:foreignId/download'); const fd = await httpRaw('GET', `${origin}/api/portal/documents/${fdoc.id}/download`, { token: portalToken, timeoutMs: P.D6_HTTP_TIMEOUT_MS });
      call('DELETE', '<DIŞ>/api/portal/documents/:foreignId'); const fx = await L.AH.httpJson('DELETE', `${origin}/api/portal/documents/${fdoc.id}`, { token: portalToken, timeoutMs: P.D6_HTTP_TIMEOUT_MS });
      const judge404 = (id, desc, r) => { if (r.indeterminate) return R.unmeasured(id, desc, 'yanıt yok'); if (r.status === 503) return R.unmeasured(id, desc, 'HTTP 503 — neden UNKNOWN'); return R.check(id, desc, r.status === 404, `HTTP ${r.status}${r.status === 200 ? ' — KAPSAM DIŞI BELGEYE ERİŞİLDİ (ürün bulgusu)' : ''}`); };
      judge404('D6-4A', 'kapsam dışı (yabancı müvekkil) belge indirme DIŞ 404', fd); judge404('D6-4B', 'kapsam dışı (yabancı müvekkil) belge silme DIŞ 404', fx);
      const fstill = await prisma.portalDocument.count({ where: { id: fdoc.id, clientId: st.foreignClientId } });
      R.check('D6-4C', 'yabancı satır DOKUNULMADI (silme denemesi sonrası hâlâ var)', fstill === 1, `satır=${fstill}`);
      // GÖSTERİM KAPISI: yükleme/liste/indirme ve kapsam dışı 404'ler PASS değilse (sızıntı = ürün bulgusu) QR/parola GÖSTERİLMEZ, telefon BEKLENMEZ.
      const GATE = ['P6-03L', 'P6-04D', 'D6-1', 'D6-1D', 'D6-2D', 'D6-3', 'D6-4A', 'D6-4B'];
      out.displayGate = GATE.map((id) => `${id}=${v(id) || 'YOK'}`);
      if (!GATE.every((id) => v(id) === 'PASS')) stopped = `gösterim öncesi zorunlu kontroller PASS değil (${GATE.filter((id) => v(id) !== 'PASS').join(',')}) — giriş bilgisi GÖSTERİLMEDİ, telefon BEKLENMEDİ`;
    }
    // ---- OWNER TELEFONU
    let baseline = null; let loginSeen = false;
    if (!stopped) {
      baseline = await portalState(prisma, st.clientId); out.baseline = { loginCount: baseline.loginCount, tokenVersion: baseline.tokenVersion };
      const qr = DISPLAY.renderQr(`${origin}/portal/documents`);
      await showOwner(['============ EXTACC D-6 (1/2) — YALNIZ OWNER EKRANI (kayda ALINMAZ) ============', 'TELEFON: Wi-Fi KAPALI, mobil veri AÇIK, gizli sekme. QR portal BELGELER sayfasını açar (giriş istenir).', '', ...qr.lines, '', `${origin}/portal/documents`, '',
        'Giriş bilgisi (yalnız bu koşum için; koşum sonunda kapatma adımı çalışır):', `    E-posta : ${portalEmail}`, `    Parola  : ${portalPw}`, '',
        `Girişten sonra belge listesinde YALNIZ "${docTitle}" başlıklı belge görünmeli; indirin (açılan PDF'de ${docTitle} yazar).`,
        'Telefondan yükleme OPSİYONELDİR; yaparsanız koşucu silme adımından ÖNCE onu telefondan SİLMENİZİ bekler.',
        `Girişi BİR KEZ yapın. Giriş algılanınca ${Math.round(P.D6_VIEW_MS / 1000)} sn inceleme süresi verilir; sonra koşucu kendi belgesini siler ve 2. ekran gelir.`, `Bekleme: en fazla ${Math.round(P.D6_WAIT_MS / 60000)} dk.`]);
      displayed = true; R.check('P6-DISP', 'giriş bilgisi + QR yalnız yerel konsola gösterildi', true, g.display === 'conout' ? 'CONOUT$' : 'gösterimsiz izole test');
      const t0 = Date.now();
      for (;;) { const s = await portalState(prisma, st.clientId); if (typeof s.loginCount === 'number' && s.loginCount > baseline.loginCount) { loginSeen = true; out.phoneLogin = { loginCountDelta: s.loginCount - baseline.loginCount }; break; } if (Date.now() - t0 >= P.D6_WAIT_MS) break; await sleep(P.D6_POLL_MS); }
      out.wait = { loginSeen, elapsedMs: Date.now() - t0, windowMs: P.D6_WAIT_MS };
      if (loginSeen) { R.check('P6-WAIT', 'koşucu dışında BAŞARILI portal girişi pencere içinde görüldü (DB loginCount; cihaz/ağ owner beyanı)', out.phoneLogin.loginCountDelta >= 1, `artış=${out.phoneLogin.loginCountDelta} · ~${Math.round((Date.now() - t0) / 1000)} sn`);
        await showOwner(['', `Giriş algılandı. ${Math.round(P.D6_VIEW_MS / 1000)} sn inceleme süresi: listeyi ve indirmeyi şimdi deneyin.`]); await sleep(P.D6_VIEW_MS); }
      else R.unmeasured('P6-WAIT', 'başarılı portal girişi pencere içinde görüldü', 'giriş görülmedi — owner beyanı ile ayrılır (açılamadı / denenmedi / başarısız)');
      // Telefon yüklemesi (opsiyonel) varsa: koşucu KENDİ silmesinden önce owner'ın telefondan silmesini bekler (ürün ucu; koşucu başkasının belgesini silmez).
      let extra = (await docRows(prisma, st.clientId)).filter((r) => r.id !== docId); out.phoneUploadsSeen = extra.length;
      if (extra.length) {
        await showOwner(['', `D6-RESIDUE-WAIT: telefondan yüklenen ${extra.length} belge görüldü. Koşucu silme adımına geçmeden ÖNCE bunları TELEFONDAN silin (en fazla ${Math.round(P.D6_RESIDUE_WAIT_MS / 60000)} dk).`]);
        const t1 = Date.now(); for (;;) { extra = (await docRows(prisma, st.clientId)).filter((r) => r.id !== docId); if (!extra.length || Date.now() - t1 >= P.D6_RESIDUE_WAIT_MS) break; await sleep(P.D6_POLL_MS); }
        for (const r of extra) knownFiles.push(r.filePath);
        R.check('P6-PHONE-DOC', 'telefondan yüklenen belgeler koşucu silmesinden ÖNCE telefondan silindi (ürün DELETE\'i)', extra.length === 0, `kalan=${extra.length}${extra.length ? ' — kapanışta belge kalıntısı olarak ölçülür' : ''}`);
      } else R.check('P6-PHONE-DOC', 'telefondan yükleme yapılmadı ya da yapıldıysa silindi (koşucu silmesinden önce ek belge yok)', true, 'ek belge yok');
    }
    // ---- D6-5 SİLME (koşucunun kendi belgesi; ürün DELETE'i — dosyayı ürün siler)
    if (docId && !fatal) {
      call('DELETE', '<DIŞ>/api/portal/documents/:id'); const dx = await L.AH.httpJson('DELETE', `${origin}/api/portal/documents/${docId}`, { token: portalToken, timeoutMs: P.D6_CALL_TIMEOUT_MS });
      if (dx.indeterminate || dx.status === 503) R.unmeasured('D6-5', 'koşucu belgesi DIŞ DELETE 200', dx.indeterminate ? 'yanıt yok' : 'HTTP 503 — neden UNKNOWN');
      else R.check('D6-5', 'koşucu belgesi DIŞ HTTPS DELETE 200 (ürün ucu; koşucu dosya silmez)', dx.status === 200, `HTTP ${dx.status}`);
      const left = await prisma.portalDocument.count({ where: { id: docId } }); const fsd = fileState(docPath);
      if (fsd.state === 'olculemez') R.unmeasured('D6-5D', 'DB satırı YOK + diskte dosya YOK (üç durumlu yoklama)', `satır=${left} · dosya erişimi ÖLÇÜLEMEDİ (${fsd.code}) — "yok" sayılmadı`);
      else R.check('D6-5D', 'DB satırı YOK + diskte dosya YOK (üç durumlu yoklama; erişim reddi "yok" sayılmaz)', left === 0 && fsd.state === 'yok', `satır=${left} diskte=${fsd.state === 'var'}`);
      const l2 = await L.AH.httpJson('GET', `${origin}/api/portal/documents`, { token: portalToken, timeoutMs: P.D6_HTTP_TIMEOUT_MS });
      if (l2.indeterminate || l2.status === 503) R.unmeasured('D6-5L', 'silme sonrası dış liste', l2.indeterminate ? 'yanıt yok' : 'HTTP 503');
      else R.check('D6-5L', 'silme sonrası DIŞ liste 200 ve bu belge yok', l2.status === 200 && Array.isArray(l2.body) && !l2.body.some((d) => d && d.id === docId), `HTTP ${l2.status} · kayıt=${Array.isArray(l2.body) ? l2.body.length : '-'}`);
      if (displayed && loginSeen) { await showOwner(['', '============ EXTACC D-6 (2/2) ============', 'Koşucu kendi belgesini SİLDİ. Telefonda belge listesini ŞİMDİ yenileyin: liste BOŞ olmalı.', `${Math.round(P.D6_VIEW_MS / 1000)} sn sonra kapatma adımı çalışır ve ekran temizlenir.`]); await sleep(P.D6_VIEW_MS); }
    } else if (!stopped && !docId) for (const [id, d] of [['D6-5', 'silme'], ['D6-5D', 'silme sonrası DB/disk'], ['D6-5L', 'silme sonrası liste']]) R.unmeasured(id, d, 'belge yok');
    if (stopped) for (const [id, d] of [['D6-2L', 'liste yerel'], ['D6-2D', 'liste dış'], ['D6-3', 'indirme'], ['D6-6', 'personel bekleyen liste'], ['D6-4A', 'kapsam dışı indirme'], ['D6-4B', 'kapsam dışı silme'], ['D6-4C', 'yabancı satır'], ['P6-DISP', 'giriş bilgisi gösterildi'], ['P6-WAIT', 'telefon girişi'], ['P6-PHONE-DOC', 'telefon yüklemesi'], ['D6-5', 'silme'], ['D6-5D', 'silme sonrası DB/disk'], ['D6-5L', 'silme sonrası liste']]) if (!v(id)) R.unmeasured(id, d, stopped);
  } catch (e) { fatal = errText(e, 300); }
  finally {
    if (con) { try { await DISPLAY.clear(con); } catch (e) { out.displayClearError = errText(e, 120); } DISPLAY.close(con); }
    try {
      out.portalClose = receipt ? await closePortal(R, prisma, base, origin, receipt, P, { session, creds: createOutcome ? { email: portalEmail, password: portalPw } : null, portalToken, issuedVersion, knownFiles,
        sessionRequired: !!portalToken || displayed, createUncertain: createOutcome === 'attempted' || createOutcome === 'uncertain',
        noSessionWhy: displayed ? 'gösterim yapıldı ama koşucu oturumu yok — mevcut oturum ölçülemez' : 'koşumda portal oturumu alınmadı — mevcut oturum ölçülemez' }) : { ok: true, nothingCreated: true };
      out.createOutcome = createOutcome;
    } catch (e) { out.portalClose = { ok: false, reason: errText(e, 200) }; }
    if (receipt) { try { out.foreignCleanup = await foreignCleanup(R, prisma, receipt); } catch (e) { out.foreignCleanup = { error: errText(e, 160) }; } }
    try { out.closure = receipt ? await closeAccess(prisma, receipt) : { ok: true, nothingToClose: true }; } catch (e) { out.closure = { ok: false, reason: errText(e, 200) }; }
    if (receipt) R.check('U-CLOSE', 'personel kullanıcıları pasif (tokenVersion++) + Case CLOSED', !!(out.closure && out.closure.ok), JSON.stringify(out.closure || {}));
    if (receipt) { try { const a = await prisma.auditLog.count({ where: { tenantId: receipt.tenantId } }); out.auditRetained = { tenantAuditRows: a, before: out.auditBefore ?? null, note: 'audit/log kayıtları SAKLANDI (silinmedi); belge uçları audit yazmaz — fark portal hesabı aç/kapa kaynaklıdır' }; } catch (e) { out.auditRetained = { error: errText(e, 120) }; } }
    if (receipt) R.check('P6-D9', 'PORTAL kapanışı birleşik: DB kapalı + gerekli HTTP reddi + belge kalıntısı YOK + yabancı satır temiz + personel/dosya kapanışı',
      !!(out.portalClose && out.portalClose.ok) && !!(out.closure && out.closure.ok) && v('P6-FOREIGN-CLEAN') === 'PASS', `portal=${!!(out.portalClose && out.portalClose.ok)} personel=${!!(out.closure && out.closure.ok)} yabancı=${v('P6-FOREIGN-CLEAN')}${out.portalClose && out.portalClose.productFinding ? ' · ' + out.portalClose.productFinding : ''}`);
    out.productFinding = out.portalClose ? out.portalClose.productFinding || null : null; out.forbiddenEndpointCalled = out.calledEndpoints.some((c) => FORBIDDEN.some((re) => re.test(c)));
    try { const after = receipt ? await isolationFingerprint(prisma, [receipt.tenantId, receipt.foreignTenantId]) : null; out.isolationAfter = after; const b = out.isolationBefore;
      if (after && b) R.check('U-ISO', 'bu koşumun iki sentetik tenantı DIŞINDAKİ tenantlarda kullanıcı/müvekkil SAYILARI önce/sonra aynı (yalnız sayı)', after.digest === b.digest, `önce=${b.digest}/${b.tenants} sonra=${after.digest}/${after.tenants}`); else R.unmeasured('U-ISO', 'sayım dağılımı', 'ölçülemedi'); } catch (e) { R.unmeasured('U-ISO', 'sayım dağılımı', `okunamadı: ${errText(e, 120)}`); }
    const s = R.summary(`EXTACC D-6 PORTAL BELGE AKIŞI (runId=${runId})`);
    out.fatal = fatal; out.stopped = stopped; out.displayed = displayed; out.pass = s.pass; out.fail = s.fail; out.unmeasured = s.unmeasured;
    out.results = R.rows.map((r) => ({ id: r.id, verdict: r.verdict, observed: r.observed })); out.recovery = recoveryAdvice(out, receipt ? receiptPath : null);
    if (out.recovery.gerekli) console.error(`KURTARMA/İNCELEME GEREKLİ: ${out.recovery.neden.join(' · ')}`);
    out.exitCode = exitCodeOf(out, s); out.exitCode = writeEvidenceOrDemote(evid, out); await prisma.$disconnect().catch(() => {}); process.exitCode = out.exitCode;
  }
}
// ------------------------------------------------------------------ RECOVER — kabul ölçütleri KOŞULMAZ
async function recoverMode() {
  const c = commonGates(process.env); if (c) { console.error(`REDDEDİLDİ: ${c.why}`); process.exit(c.code); }
  if (process.env.D6_RECOVER_CONFIRM !== '1') { console.error('REDDEDİLDİ: D6_RECOVER_CONFIRM=1 gerekli'); process.exit(3); }
  const base = process.env.D6_API_BASE; const origin = expectedOriginOf(process.env.D6_EXPECT_BASE_URL); const pw = process.env.D6_LIVE_LOGIN_PW; const evid = process.env.D6_EVID_FILE; const receiptPath = process.env.D6_RECEIPT;
  if (!pw || !evid || !receiptPath) { console.error('REDDEDİLDİ: D6_LIVE_LOGIN_PW + D6_EVID_FILE + D6_RECEIPT gerekli'); process.exit(2); }
  addSecret(pw); addSecret(process.env.AH_DATABASE_URL); const P = effectiveParams(process.env);
  let receipt; try { receipt = JSON.parse(fs.readFileSync(receiptPath, 'utf8')); } catch (e) { console.error('REDDEDİLDİ: makbuz okunamadı'); process.exit(4); }
  if (!receipt || receipt.record !== RECEIPT_RECORD || !receipt.elevUserId || !receipt.elevEmail) { console.error('REDDEDİLDİ: makbuz biçimi/alanları eksik'); process.exit(4); }
  if (process.env.D6_RUNID && String(process.env.D6_RUNID).toLowerCase() !== String(receipt.runId).toLowerCase()) { console.error('REDDEDİLDİ: runId makbuzla eşleşmiyor'); process.exit(4); }
  const R = new L.Results(); const prisma = L.AH.loadPrisma(); const bcrypt = require(process.env.AH_BCRYPT_PATH);
  const out = { record: 'EXTACC-D6-RECOVER', revision: 'R01', runId: receipt.runId, note: 'kabul ölçütleri KOŞULMADI; yalnız kapanış', residueCleanupRequested: process.env.D6_RESIDUE_CLEANUP === '1' };
  let session = null; let before = null;
  const createUncertain = !!receipt.createAttemptedAt && receipt.createOutcome !== 'ok' && receipt.createOutcome !== 'rejected';
  out.createEvidence = { attemptedAt: receipt.createAttemptedAt || null, outcome: receipt.createOutcome || null, uncertain: createUncertain };
  out.uploadEvidence = { attemptedAt: receipt.uploadAttemptedAt || null, outcome: receipt.uploadOutcome || null, documentId: receipt.documentId ? 'var' : null };
  const elevOf = () => prisma.user.findFirst({ where: { id: receipt.elevUserId, tenantId: receipt.tenantId, email: receipt.elevEmail }, select: { id: true } });
  const openStaffSession = async () => { if (session && session.token) return session; const elev = await elevOf(); if (!elev) throw new Error('makbuzdaki kullanıcı sentetik tenantta yok'); await prisma.user.update({ where: { id: elev.id }, data: { passwordHash: await bcrypt.hash(pw, 10), isActive: true } }); out.temporaryAccess = 'sentetik personele geçici erişim; kapanışta yeniden kapatıldı'; session = await L.AH.login(base, receipt.elevEmail, pw, receipt.tenantSlug); if (session && session.token) addSecret(session.token); return session; };
  try { const ident = await assertReceiptIdentity(prisma, receipt); if (!ident.ok) { console.error(`REDDEDİLDİ: kimlik bağı doğrulanmadı (${ident.reason}) — HİÇBİR yazma yapılmadı`); await prisma.$disconnect().catch(() => {}); process.exit(4); }
    before = await portalState(prisma, receipt.clientId);
    if (before.exists && (before.isActive || before.hasPortalAccess)) { if (!(await elevOf())) { console.error('REDDEDİLDİ: makbuzdaki kullanıcı yok — yazma yapılmadı'); await prisma.$disconnect().catch(() => {}); process.exit(4); } await openStaffSession(); } } catch (e) { out.fatal = errText(e, 200); }
  const issued = Number.isInteger(receipt.portalIssuedTokenVersion) ? receipt.portalIssuedTokenVersion : null; out.versionEvidence = { issuedFromReceipt: issued, beforeRecover: before ? before.tokenVersion : null };
  const knownFiles = [receipt.documentFile, ...(Array.isArray(receipt.residueFiles) ? receipt.residueFiles : [])].filter(Boolean);
  // Kalan satırların dosya yolları makbuza yazılır: Prisma temizliğinden sonra da (bir sonraki Recover) diskte kontrol edilebilsin.
  try { const rows = await docRows(prisma, receipt.clientId); const paths = [...new Set([...knownFiles, ...rows.map((r) => r.filePath)])]; if (paths.length) { receipt.residueFiles = paths; try { writeJson(receiptPath, receipt); } catch (e) { out.receiptWriteError = errText(e, 120); } } for (const p of paths) if (!knownFiles.includes(p)) knownFiles.push(p); } catch (e) { out.residueReadError = errText(e, 120); }
  try { out.portalClose = await closePortal(R, prisma, base, origin, receipt, P, { session, sessionProvider: openStaffSession, issuedVersion: issued, sessionRequired: true, createUncertain, knownFiles, residueCleanup: process.env.D6_RESIDUE_CLEANUP === '1',
    absentNote: receipt.createAttemptedAt ? `Recover anında portal hesabı YOK (oluşturma sonucu kesin: ${receipt.createOutcome})` : 'portal hesabı yok; makbuzda oluşturma denemesi kaydı yok',
    noSessionWhy: 'Recover: koşumun oturumu saklanmaz (sır) — mevcut oturum reddi Recover\'da ÖLÇÜLEMEZ; Run kanıtındaki P6-C4 satırlarına bakın',
    credsForClosed: async (st) => { const tmp = 'D6r!' + crypto.randomBytes(12).toString('base64url'); addSecret(tmp); const u = await prisma.clientPortalUser.updateMany({ where: { clientId: receipt.clientId, isActive: false }, data: { passwordHash: await bcrypt.hash(tmp, 10) } }); if (u.count !== 1) throw new Error(`pasif hesap sayısı ${u.count}`); return { email: st.email, password: tmp }; } }); } catch (e) { out.portalClose = { ok: false, reason: errText(e, 200) }; }
  try { out.foreignCleanup = await foreignCleanup(R, prisma, receipt); } catch (e) { out.foreignCleanup = { error: errText(e, 160) }; }
  try { out.closure = await closeAccess(prisma, receipt); } catch (e) { out.closure = { ok: false, reason: errText(e, 200) }; }
  R.check('U-CLOSE', 'personel kullanıcıları pasif + Case CLOSED', !!(out.closure && out.closure.ok), JSON.stringify(out.closure || {}));
  try { out.auditRetained = { tenantAuditRows: await prisma.auditLog.count({ where: { tenantId: receipt.tenantId } }), note: 'audit/log kayıtları SAKLANDI (silinmedi)' }; } catch (e) { out.auditRetained = { error: errText(e, 120) }; }
  const s = R.summary(`EXTACC D-6 KURTARMA (runId=${receipt.runId})`); out.results = R.rows.map((r) => ({ id: r.id, verdict: r.verdict, observed: r.observed }));
  out.exitCode = recoverExitCode(out, s); out.recovery = recoveryAdvice(out, receiptPath);
  const dres = (out.portalClose && out.portalClose.docResidue) || {};
  if (out.recovery.gerekli && out.exitCode === 3) out.recovery.adim = 'Recover TEKRARLANMAZ: DB kapalı; ölçülemeyen satırlar Run kanıtıyla değerlendirilir.';
  else if (out.recovery.gerekli && (dres.filesAccessError || []).length) out.recovery.adim = 'Belge kovasının okunabilirliği (ACL) OWNER tarafından düzeltilir; sonra Recover BİR KEZ daha (satır silme kararı yeniden sorulur; dosya erişimi "yok" sayılmadı).';
  else if (out.recovery.gerekli && (dres.filesLeftOnDisk || []).length && dres.rows === 0) out.recovery.adim = 'Satırlar temiz; diskte kalan dosya(lar) OWNER tarafından elle silindikten sonra Recover BİR KEZ daha (makbuzdaki residueFiles yeniden ölçülür).';
  out.exitCode = writeEvidenceOrDemote(evid, out); await prisma.$disconnect().catch(() => {}); process.exitCode = out.exitCode;
}
if (require.main === module) { const mode = String(process.env.D6_MODE || 'run').toLowerCase(); if (mode === 'run') runMode(); else if (mode === 'recover') recoverMode(); else { console.error(`REDDEDİLDİ: bilinmeyen D6_MODE '${mode}'`); process.exit(1); } }
module.exports = { commonGates, runGates, LIVE_PARAMS, effectiveParams, FORBIDDEN, RECEIPT_RECORD, MAX_PDF_BYTES, buildPdf, multipart, caseListMatches, docListMatches, recoverExitCode, exitCodeOf, fileState };
void scrub;
