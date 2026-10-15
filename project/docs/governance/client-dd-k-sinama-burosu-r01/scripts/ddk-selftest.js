/*
 * CLIENT DD (K) R01 — KOŞUCU ÖZ-TESTİ. CANLI VERİTABANINA BAĞLANMAZ, YAZMAZ. Konsola giriş bilgisi ÇİZMEZ (DDK_DISPLAY=none).
 *
 * KULLANIM: DDKT_DB_URL=postgresql://<kullanıcı>:<parola>@127.0.0.1:5451/ddk_test  (şema uygulanmış TEK KULLANIMLIK veritabanı)
 *           DDKT_PRISMA_ROOT=<@prisma/client dizini>  DDKT_BCRYPT_PATH=<bcrypt dizini>
 *           node ddk-selftest.js
 * Kapı: yalnız 127.0.0.1:5451/ddk_test kabul edilir (koşucunun sınama kimliği); başka her adres → test BAŞLAMAZ.
 *
 * G1 – G13 kapı birim testleri (saf işlev; veritabanı yok) — canlı kapı reddi, adres hileleri, gösterim kapısı dahil
 * U1       sır taraması işlevi parola / GO ref / adres geçen metni yakalar
 * S1       kaynak sırası: ana akış kapılardan ve konsol açılışından ÖNCE veritabanına bağlanmaz
 * T1       Kur: dört satır + geri okuma + makbuz (parola / özet YOK)
 * T2       çakışma reddi: aynı runId ile ikinci Kur → çıkış 4, yeni satır YOK
 * T3       Kapat: kullanıcı pasif + tokenVersion +1; avukat / müvekkil / büro DEĞİŞMEZ
 * T4       Kapat — sahte makbuz (slug runId'den türemiyor) → çıkış 4, yazma YOK
 * T5       Kapat — makbuz gerçek (ah- öneksiz) bir büroyu gösteriyor → çıkış 4, yazma YOK
 * T6       sır taraması: makbuz / kanıt / çıktıda parola, parola özeti ve veritabanı adresi YOK (GO ref yalnız canlıda verilir → U1)
 * T7       ikinci Kapat: çıkış 0 · yazma YOK · tokenVersion yeniden ARTMAZ
 * T8       Kapat — büroda ikinci kullanıcı var → çıkış 4 (TENANT_USER_COUNT), yazma YOK
 * T9       Kapat — makbuz e-postası runId'den türeyen personel e-postası değil → çıkış 4 (RECEIPT_FIELDS), yazma YOK
 * T10      Kur — makbuz yazılamıyor (dosya zaten var) → çıkış 7 · dört satır YAZILDI (belgede tanımlı durum) · NOT satırı
 * T11      Kur — gösterim conout, süreçte konsol YOK (ayrık süreç) → çıkış 4 · büro / satır YOK · makbuz / kanıt YOK
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawnSync, spawn } = require('child_process');

const RUN = path.join(__dirname, 'ddk-setup-run.js');
const M = require(RUN);

const results = [];
const check = (id, ad, ok, detail) => { results.push({ id, ad, ok: !!ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  [${id}] ${ad}${ok || !detail ? '' : ` — ${detail}`}`); };

// ---- G: kapı birim testleri (veritabanı YOK) ----
const LIVE_URL = 'postgresql://kullanici:parola@127.0.0.1:5432/hukuk_db';
const TEST_URL = 'postgresql://kullanici:parola@127.0.0.1:5451/ddk_test';
const base = (o) => ({ DDK_MODE: 'kapat', DDK_EVID_FILE: 'e.json', DDK_RECEIPT: 'r.json', ...o });
const GOOD_GO = 'OWNER-GO-CLIENT-DDK-20261015-R01';
const LIVE_OK = { AH_DATABASE_URL: LIVE_URL, DDK_EXPECT_DB: 'hukuk_db', DDK_LIVE_CONFIRM: '1', DDK_LIVE_GO_REF: GOOD_GO };
const KUR = { DDK_MODE: 'kur', DDK_RUNID: 'a1b2c3d4', DDK_LOGIN_PW: 'Ddk!uzun-parola-12' };
const gt = (env) => M.gates(env);
check('G1', 'canlı kimlik + doğru GO var ama onay YOK → 3', gt(base({ AH_DATABASE_URL: LIVE_URL, DDK_EXPECT_DB: 'hukuk_db', DDK_LIVE_GO_REF: GOOD_GO })).code === 3);
check('G2', 'canlı kimlik + onay + GO biçimi bozuk → 3', gt(base({ ...LIVE_OK, DDK_LIVE_GO_REF: 'OWNER-GO-CLIENT-DDK-2026-R1' })).code === 3);
check('G3', 'canlı kimlik + onay + doğru GO biçimi → kapı geçer (bağlanmadan)', gt(base(LIVE_OK)).code === 0);
check('G4', 'izinli olmayan kimlik (127.0.0.1:5432/baska_db) → 4', gt(base({ AH_DATABASE_URL: 'postgresql://k:p@127.0.0.1:5432/baska_db', DDK_EXPECT_DB: 'baska_db' })).code === 4);
check('G5', 'beyan edilen DB bağlı DB ile aynı değil → 4', gt(base({ AH_DATABASE_URL: TEST_URL, DDK_EXPECT_DB: 'hukuk_db' })).code === 4);
check('G6', 'canlı adı sınama portunda (127.0.0.1:5451/hukuk_db) → 4', gt(base({ ...LIVE_OK, AH_DATABASE_URL: 'postgresql://k:p@127.0.0.1:5451/hukuk_db' })).code === 4);
check('G7', 'canlı ad başka makinede (10.0.0.5:5432/hukuk_db) → 4', gt(base({ ...LIVE_OK, AH_DATABASE_URL: 'postgresql://k:p@10.0.0.5:5432/hukuk_db' })).code === 4);
check('G8', 'Kur: parola kısa / yok → 2', gt(base({ DDK_MODE: 'kur', DDK_RUNID: 'a1b2c3d4', DDK_DISPLAY: 'none', AH_DATABASE_URL: TEST_URL, DDK_EXPECT_DB: 'ddk_test' })).code === 2);
check('G9', 'Kur: runId 8 hex değil → 2', gt(base({ ...KUR, DDK_RUNID: 'xyz', DDK_DISPLAY: 'none', AH_DATABASE_URL: TEST_URL, DDK_EXPECT_DB: 'ddk_test' })).code === 2);
check('G10', 'sınama adresinde hedef değiştiren sorgu parametresi (?host= / ?port= / ?options=) ya da # → 2; bağlantı ayarı parametreleri (schema, connection_limit …) kabul',
  gt(base({ AH_DATABASE_URL: `${TEST_URL}?host=10.0.0.5`, DDK_EXPECT_DB: 'ddk_test' })).code === 2
  && gt(base({ AH_DATABASE_URL: `${TEST_URL}?port=5432`, DDK_EXPECT_DB: 'ddk_test' })).code === 2
  && gt(base({ AH_DATABASE_URL: `${TEST_URL}#x`, DDK_EXPECT_DB: 'ddk_test' })).code === 2
  && gt(base({ AH_DATABASE_URL: `${TEST_URL}?options=-c%20x`, DDK_EXPECT_DB: 'ddk_test' })).code === 2
  && gt(base({ AH_DATABASE_URL: `${TEST_URL}?schema=public&connection_limit=5&pool_timeout=10`, DDK_EXPECT_DB: 'ddk_test' })).code === 0);
check('G11', 'canlı ad başka yazımla (localhost / [::1] / port yazılmamış 5432 dışı) → 4; port yazılmamış 127.0.0.1/hukuk_db = canlı → onay ister (3)',
  gt(base({ ...LIVE_OK, AH_DATABASE_URL: 'postgresql://k:p@localhost:5432/hukuk_db' })).code === 4
  && gt(base({ ...LIVE_OK, AH_DATABASE_URL: 'postgresql://k:p@[::1]:5432/hukuk_db' })).code === 4
  && gt(base({ AH_DATABASE_URL: 'postgresql://k:p@127.0.0.1/hukuk_db', DDK_EXPECT_DB: 'hukuk_db' })).code === 3);
check('G12', 'Kur canlıda DDK_DISPLAY=none → 4; geçersiz gösterim → 2; canlıda varsayılan gösterim conout',
  gt(base({ ...LIVE_OK, ...KUR, DDK_DISPLAY: 'none' })).code === 4
  && gt(base({ ...LIVE_OK, ...KUR, DDK_DISPLAY: 'stdout' })).code === 2
  && gt(base({ ...LIVE_OK, ...KUR })).display === 'conout');
check('G13', 'NODE_TLS_REJECT_UNAUTHORIZED=0 → 2', gt(base({ ...LIVE_OK, NODE_TLS_REJECT_UNAUTHORIZED: '0' })).code === 2);

// ---- U1: sır taraması işlevi ----
check('U1', 'sır taraması: parola / GO ref / adres geçen metni yakalar, temiz metni geçirir',
  M.containsSecret(`x ${GOOD_GO} y`, ['p1', GOOD_GO]) && M.containsSecret('..Ddk!abc..', ['Ddk!abc']) && M.containsSecret(`u=${LIVE_URL}`, [LIVE_URL])
  && !M.containsSecret('temiz metin', ['Ddk!abc', GOOD_GO, LIVE_URL, undefined]));

// ---- S1: kaynak sırası ----
{
  const src = fs.readFileSync(RUN, 'utf8');
  const main = src.slice(src.indexOf('async function main()'));
  const iGate = main.indexOf('gates(env)'); const iCon = main.indexOf('DISPLAY.openConsole()'); const iLoad = main.indexOf('AH.loadPrisma()');
  check('S1', 'ana akışta kapı → konsol → veritabanı bağlantısı sırası; kapı / konsol reddinde dönüş',
    iGate > 0 && iCon > iGate && iLoad > iCon && /if \(g\.code !== EXIT\.OK\) \{[\s\S]*?return;/.test(main.slice(iGate, iCon))
    && /openConsole\(\); \} catch \(e\) \{[\s\S]*?return;/.test(main.slice(iCon - 20, iLoad)));
}

// ---- T: tek kullanımlık veritabanı ----
const DBURL = process.env.DDKT_DB_URL || '';
const id = M.dbIdentity(DBURL);
if (!id || id.host !== '127.0.0.1' || id.port !== '5451' || id.name !== 'ddk_test') {
  console.log('OLCULEMEDI: DDKT_DB_URL 127.0.0.1:5451/ddk_test olmalı — veritabanı senaryoları BAŞLAMADI');
  finish(2);
}
const PRISMA_ROOT = process.env.DDKT_PRISMA_ROOT; const BCRYPT = process.env.DDKT_BCRYPT_PATH;
if (!PRISMA_ROOT || !BCRYPT) { console.log('OLCULEMEDI: DDKT_PRISMA_ROOT / DDKT_BCRYPT_PATH gerekli'); finish(2); }
const { PrismaClient } = require(PRISMA_ROOT);
const prisma = new PrismaClient({ datasources: { db: { url: DBURL } }, log: [] });
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ddk-selftest-'));

function runRunner(extra) {
  const env = { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, AH_DATABASE_URL: DBURL, AH_PRISMA_ROOT: PRISMA_ROOT, AH_BCRYPT_PATH: BCRYPT,
    DDK_EXPECT_DB: 'ddk_test', DDK_DISPLAY: 'none', ...extra };
  const r = spawnSync(process.execPath, [RUN], { env, encoding: 'utf8', timeout: 120000 });
  return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
}
const fileText = (p) => { try { return fs.readFileSync(p, 'utf8'); } catch (e) { return ''; } };
const userState = (uid) => prisma.user.findUnique({ where: { id: uid }, select: { isActive: true, tokenVersion: true } });

(async () => {
  let code = 0;
  try {
    const runId = crypto.randomBytes(4).toString('hex');
    const pw = 'Ddk!' + crypto.randomBytes(18).toString('base64url');
    const receipt = path.join(dir, 'makbuz.json');
    const ev1 = path.join(dir, 'kur-evidence.json');
    const r1 = runRunner({ DDK_MODE: 'kur', DDK_RUNID: runId, DDK_LOGIN_PW: pw, DDK_RECEIPT: receipt, DDK_EVID_FILE: ev1 });
    const rc = fs.existsSync(receipt) ? JSON.parse(fileText(receipt)) : null;
    const t = await prisma.tenant.findUnique({ where: { slug: `ah-${runId}` }, select: { id: true, lifecycle: true } });
    const counts = t ? { u: await prisma.user.count({ where: { tenantId: t.id } }), l: await prisma.lawyer.count({ where: { tenantId: t.id } }),
      c: await prisma.client.count({ where: { tenantId: t.id } }), s: await prisma.staffMember.count({ where: { tenantId: t.id } }) } : null;
    const lw = rc ? await prisma.lawyer.findUnique({ where: { id: rc.lawyerId }, select: { userId: true, lawyerRank: true } }) : null;
    const cl = rc ? await prisma.client.findUnique({ where: { id: rc.clientId }, select: { tckn: true, vkn: true, identityNo: true, type: true, displayName: true } }) : null;
    check('T1', 'Kur: çıkış 0 · dört satır (1 büro · 1 kullanıcı · 1 PARTNER avukat bağlı · 1 kimliksiz müvekkil, görünen ad dolu) · geri okuma PASS · makbuz',
      r1.code === 0 && !!t && t.lifecycle === 'ACTIVE' && counts && counts.u === 1 && counts.l === 1 && counts.c === 1 && counts.s === 0
      && !!rc && rc.tenantId === t.id && lw && lw.userId === rc.userId && lw.lawyerRank === 'PARTNER' && cl && cl.type === 'PERSON' && !cl.tckn && !cl.vkn && !cl.identityNo
      && cl.displayName === `DDK Sinama Muvekkil ${runId}` && /PASS {2}user parola özeti/.test(r1.out) && !/FAIL/.test(r1.out), `çıkış ${r1.code}`);

    // T2 — çakışma
    const before = await prisma.tenant.count({ where: { slug: { startsWith: 'ah-' } } });
    const r2 = runRunner({ DDK_MODE: 'kur', DDK_RUNID: runId, DDK_LOGIN_PW: pw, DDK_RECEIPT: path.join(dir, 'makbuz2.json'), DDK_EVID_FILE: path.join(dir, 'kur2-evidence.json') });
    const after = await prisma.tenant.count({ where: { slug: { startsWith: 'ah-' } } });
    const u2 = t ? await prisma.user.count({ where: { tenantId: t.id } }) : -1;
    check('T2', 'çakışma reddi: aynı runId → çıkış 4 · yeni büro / kullanıcı YOK · makbuz yazılmadı',
      r2.code === 4 && after === before && u2 === 1 && !fs.existsSync(path.join(dir, 'makbuz2.json')) && /SLUG_CLASH/.test(r2.out), `çıkış ${r2.code}`);

    // T3 — kapat
    const uB = rc ? await userState(rc.userId) : null;
    const lB = rc ? await prisma.lawyer.findUnique({ where: { id: rc.lawyerId }, select: { isActive: true, userId: true } }) : null;
    const cB = rc ? await prisma.client.findUnique({ where: { id: rc.clientId }, select: { isActive: true, hasPortalAccess: true } }) : null;
    const r3 = runRunner({ DDK_MODE: 'kapat', DDK_RECEIPT: receipt, DDK_EVID_FILE: path.join(dir, 'kapat-evidence.json') });
    const uA = rc ? await userState(rc.userId) : null;
    const lA = rc ? await prisma.lawyer.findUnique({ where: { id: rc.lawyerId }, select: { isActive: true, userId: true } }) : null;
    const cA = rc ? await prisma.client.findUnique({ where: { id: rc.clientId }, select: { isActive: true, hasPortalAccess: true } }) : null;
    const tA = t ? await prisma.tenant.findUnique({ where: { id: t.id }, select: { lifecycle: true } }) : null;
    check('T3', 'Kapat: çıkış 0 · kullanıcı pasif · tokenVersion +1 · avukat / müvekkil / büro DEĞİŞMEDİ',
      r3.code === 0 && uB && uA && uB.isActive === true && uA.isActive === false && uA.tokenVersion === uB.tokenVersion + 1
      && JSON.stringify(lB) === JSON.stringify(lA) && JSON.stringify(cB) === JSON.stringify(cA) && tA && tA.lifecycle === 'ACTIVE', `çıkış ${r3.code}`);

    // T4 — sahte makbuz: slug runId'den türemiyor (e-posta da sahte runId'den türetilir: alan kapısını geçip kimlik bağına takılmalı)
    const forged = path.join(dir, 'makbuz-sahte.json');
    fs.writeFileSync(forged, JSON.stringify({ ...rc, runId: 'deadbeef', userEmail: M.setupRows('deadbeef').user.email }));
    const uT4b = await userState(rc.userId);
    const r4 = runRunner({ DDK_MODE: 'kapat', DDK_RECEIPT: forged, DDK_EVID_FILE: path.join(dir, 'kapat-sahte-evidence.json') });
    const uT4a = await userState(rc.userId);
    check('T4', "Kapat — sahte makbuz (slug runId'den türemiyor) → çıkış 4 · kullanıcı DEĞİŞMEDİ",
      r4.code === 4 && JSON.stringify(uT4b) === JSON.stringify(uT4a) && /RET: IDENTITY/.test(r4.out), `çıkış ${r4.code}`);

    // T5 — makbuz gerçek (ah- öneksiz) bir büroyu gösteriyor
    const realT = await prisma.tenant.create({ data: { name: 'Gercek Buro Sinama', slug: `gercek-${runId}` }, select: { id: true } });
    const realU = await prisma.user.create({ data: { tenantId: realT.id, email: `gercek-${runId}@ornek.invalid`, name: 'G', surname: 'B', role: 'USER', passwordHash: 'x' }, select: { id: true } });
    const realRc = path.join(dir, 'makbuz-gercek.json');
    fs.writeFileSync(realRc, JSON.stringify({ record: M.RECORD_RECEIPT, runId: runId, tenantId: realT.id, tenantSlug: `ah-${runId}`, userId: realU.id,
      userEmail: M.setupRows(runId).user.email, lawyerId: 'x', clientId: 'x' }));
    const r5 = runRunner({ DDK_MODE: 'kapat', DDK_RECEIPT: realRc, DDK_EVID_FILE: path.join(dir, 'kapat-gercek-evidence.json') });
    const realUa = await userState(realU.id);
    check('T5', 'Kapat — makbuz ah- öneksiz büroyu gösteriyor → çıkış 4 · o büronun kullanıcısı DEĞİŞMEDİ',
      r5.code === 4 && realUa.isActive === true && realUa.tokenVersion === 0 && /RET: IDENTITY/.test(r5.out), `çıkış ${r5.code}`);

    // T6 — sır taraması
    const hash = (await prisma.user.findUnique({ where: { id: rc.userId }, select: { passwordHash: true } })).passwordHash;
    const texts = [receipt, ev1, path.join(dir, 'kapat-evidence.json')].map(fileText).join('\n') + r1.out + r3.out;
    check('T6', 'sır taraması: makbuz / kanıt / çıktıda parola, parola özeti ve veritabanı adresi YOK',
      texts.length > 0 && !texts.includes(pw) && !texts.includes(hash) && !texts.includes(DBURL) && !/passwordHash/.test(fileText(receipt)));

    // T7 — ikinci Kapat
    const uT7b = await userState(rc.userId);
    const r7 = runRunner({ DDK_MODE: 'kapat', DDK_RECEIPT: receipt, DDK_EVID_FILE: path.join(dir, 'kapat2-evidence.json') });
    const uT7a = await userState(rc.userId);
    check('T7', 'ikinci Kapat: çıkış 0 · yazma YOK · tokenVersion yeniden ARTMADI',
      r7.code === 0 && uT7b.isActive === false && JSON.stringify(uT7b) === JSON.stringify(uT7a) && /zaten pasif/.test(r7.out), `çıkış ${r7.code}`);

    // T8 — büroda ikinci kullanıcı
    const runId8 = crypto.randomBytes(4).toString('hex');
    const rcp8 = path.join(dir, 'makbuz8.json');
    const r8k = runRunner({ DDK_MODE: 'kur', DDK_RUNID: runId8, DDK_LOGIN_PW: pw, DDK_RECEIPT: rcp8, DDK_EVID_FILE: path.join(dir, 'kur8-evidence.json') });
    const m8 = fs.existsSync(rcp8) ? JSON.parse(fileText(rcp8)) : null;
    if (m8) await prisma.user.create({ data: { tenantId: m8.tenantId, email: `ikinci-${runId8}@${M.MAIL_DOMAIN}`, name: 'I', surname: 'K', role: 'USER', passwordHash: 'x' } });
    const uT8b = m8 ? await userState(m8.userId) : null;
    const r8 = runRunner({ DDK_MODE: 'kapat', DDK_RECEIPT: rcp8, DDK_EVID_FILE: path.join(dir, 'kapat8-evidence.json') });
    const uT8a = m8 ? await userState(m8.userId) : null;
    check('T8', 'Kapat — büroda ikinci kullanıcı → çıkış 4 (TENANT_USER_COUNT) · kullanıcı DEĞİŞMEDİ',
      r8k.code === 0 && !!m8 && r8.code === 4 && /TENANT_USER_COUNT/.test(r8.out) && uT8b && uT8b.isActive === true && JSON.stringify(uT8b) === JSON.stringify(uT8a), `kur ${r8k.code} · kapat ${r8.code}`);

    // T9 — makbuz e-postası türetilmiş değerle aynı değil
    const rcp9 = path.join(dir, 'makbuz9.json');
    fs.writeFileSync(rcp9, JSON.stringify({ ...m8, userEmail: `baska-${runId8}@${M.MAIL_DOMAIN}` }));
    const r9 = runRunner({ DDK_MODE: 'kapat', DDK_RECEIPT: rcp9, DDK_EVID_FILE: path.join(dir, 'kapat9-evidence.json') });
    const uT9a = m8 ? await userState(m8.userId) : null;
    check('T9', 'Kapat — makbuz e-postası runId\'den türemiyor → çıkış 4 (RECEIPT_FIELDS) · kullanıcı DEĞİŞMEDİ',
      r9.code === 4 && /RECEIPT_FIELDS/.test(r9.out) && JSON.stringify(uT8b) === JSON.stringify(uT9a), `çıkış ${r9.code}`);

    // T10 — makbuz yazılamıyor
    const runId10 = crypto.randomBytes(4).toString('hex');
    const rcp10 = path.join(dir, 'makbuz10.json');
    fs.writeFileSync(rcp10, 'var');
    const r10 = runRunner({ DDK_MODE: 'kur', DDK_RUNID: runId10, DDK_LOGIN_PW: pw, DDK_RECEIPT: rcp10, DDK_EVID_FILE: path.join(dir, 'kur10-evidence.json') });
    const t10 = await prisma.tenant.findUnique({ where: { slug: `ah-${runId10}` }, select: { id: true } });
    const ev10 = fileText(path.join(dir, 'kur10-evidence.json'));
    check('T10', 'Kur — makbuz yazılamıyor → çıkış 7 · dört satır YAZILDI · NOT satırı · kanıtta kimlikler var · makbuz dosyası değişmedi',
      r10.code === 7 && !!t10 && /NOT: dört satır YAZILDI/.test(r10.out) && ev10.includes(t10.id) && fileText(rcp10) === 'var', `çıkış ${r10.code}`);

    // T11 — konsolsuz süreçte conout: konsol açılamaz → veritabanına bağlanmadan dur
    const runId11 = crypto.randomBytes(4).toString('hex');
    const r11 = await new Promise((resolve) => {
      const env = { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, AH_DATABASE_URL: DBURL, AH_PRISMA_ROOT: PRISMA_ROOT, AH_BCRYPT_PATH: BCRYPT,
        DDK_EXPECT_DB: 'ddk_test', DDK_DISPLAY: 'conout', DDK_MODE: 'kur', DDK_RUNID: runId11, DDK_LOGIN_PW: pw,
        DDK_RECEIPT: path.join(dir, 'makbuz11.json'), DDK_EVID_FILE: path.join(dir, 'kur11-evidence.json') };
      const ch = spawn(process.execPath, [RUN], { env, detached: true, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
      let o = ''; ch.stdout.on('data', (d) => { o += d; }); ch.stderr.on('data', (d) => { o += d; });
      const to = setTimeout(() => { try { ch.kill(); } catch (e) { /* yok */ } }, 60000);
      ch.on('close', (c) => { clearTimeout(to); resolve({ code: c, out: o }); });
    });
    const t11 = await prisma.tenant.findUnique({ where: { slug: `ah-${runId11}` }, select: { id: true } });
    check('T11', 'Kur — conout, süreçte konsol YOK → çıkış 4 · büro YOK · makbuz / kanıt YOK',
      r11.code === 4 && !t11 && /yerel konsol açılamadı/.test(r11.out) && !fs.existsSync(path.join(dir, 'makbuz11.json')) && !fs.existsSync(path.join(dir, 'kur11-evidence.json')), `çıkış ${r11.code}`);
  } catch (e) {
    console.log(`HATA: ${e && e.message ? e.message.split('\n')[0] : e}`); code = 1;
  } finally {
    try { await prisma.$disconnect(); } catch (e) { /* yok sayılır */ }
  }
  finish(code);
})();

function finish(code) {
  const fail = results.filter((r) => !r.ok).length;
  console.log(`\nOZET: ${results.length - fail} / ${results.length} PASS · ${fail} FAIL`);
  process.exit(code || (fail ? 1 : 0));
}
