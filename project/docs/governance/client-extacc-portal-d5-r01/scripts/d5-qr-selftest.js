'use strict';
/*
 * EXTACC D-5 QR DENEMESİ ÖZ-TESTİ — CANLIYA DOKUNMAZ, DB KULLANMAZ, AĞ İSTEĞİ YAPMAZ, KONSOLA QR ÇİZMEZ.
 * NE ÖLÇER:
 *   V  d5-qr-test.js `validateQrTarget`: tam yol kabul; yanlış yol / http / userinfo / sorgu / fragment / origin uyuşmazlığı / TLS kapalı ret
 *   E  beklenen origin kuralı h5-url-live-run.js `expectedOriginOf` ile AYNI sonuç verir (kural kopyası sapmamış)
 *   M  `main` sahte gösterimle süreç içinde: rette konsol AÇILMAZ; kabulde QR yalnız doğrulanmış adresle çizilir; konsolsuz 4
 *   P  GERÇEK süreç (node d5-qr-test.js), konsolsuz (detached) ve casus ön-yüklemeyle: yanlış yolda çıkış 4 + CONOUT$ açma denemesi 0;
 *      doğru yolda konsol açma denemesi 1 (casusun GÖRDÜĞÜNÜN kanıtı) + "yerel konsol yok" 4; ağ çağrısı 0; dosya yazması 0
 *   S  statik: ağ modülü/host literali yok; require ağacı 3 dosya; extacc-qr-test.js DEĞİŞMEDİ (EXTACC bloğundaki pinle eşit)
 * KULLANIM: node d5-qr-selftest.js
 * ÇIKIŞ   : 0 hepsi PASS · 1 FAIL var · 2 ölçülemedi
 */
const { spawn, execFileSync } = require('child_process');
const fs = require('fs'); const path = require('path'); const os = require('os'); const crypto = require('crypto');

const HERE = __dirname; const GOV = path.resolve(HERE, '..', '..');
const QR = path.join(HERE, 'd5-qr-test.js');
const H5_RUN = path.join(GOV, 'client-h5-intake-url-r01', 'scripts', 'h5-url-live-run.js');
const REQTREE = path.join(GOV, 'client-h5-intake-url-r01', 'scripts', 'h5-url-selftest-reqtree.js');
const EXA_QR = path.join(GOV, 'client-extacc-intake-chain-r01', 'scripts', 'extacc-qr-test.js');
const EXA_BLOCK = path.join(GOV, 'client-extacc-intake-chain-r01', 'scripts', 'extacc-owner-live-block.ps1');

const STARTED_UTC = new Date().toISOString();
const rows = []; const check = (id, desc, ok, obs) => rows.push({ id, sonuc: ok ? 'PASS' : 'FAIL', aciklama: desc, gozlem: obs });
const shaFile = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex').toUpperCase();

// Sentetik originler (.invalid: ayrılmış alan adı; gerçek host DEĞİL). Canlı alan adı bu dosyada YOKTUR.
const ORIGIN = 'https://portal.ornek.invalid';
const OK_PATH = '/portal/forgot-password';
const envOf = (url, over) => Object.assign({ D5_EXPECT_BASE_URL: ORIGIN, D5_QRTEST_URL: url }, over || {});

// Görev tanımındaki ZORUNLU yanlış yollar + ek varyantlar. [etiket, ham adres, beklenen ret nedeni]
const BAD_PATHS = [
  ['/portal/login', `${ORIGIN}/portal/login`, 'yol'],
  ['/portal/reset-password', `${ORIGIN}/portal/reset-password`, 'yol'],
  ['/portal/forgot-password/ (sondaki /)', `${ORIGIN}/portal/forgot-password/`, 'yol'],
  ['/PORTAL/forgot-password (büyük harf)', `${ORIGIN}/PORTAL/forgot-password`, 'yol'],
  ['/auth/forgot-password', `${ORIGIN}/auth/forgot-password`, 'yol'],
  ['kodlanmış %2D', `${ORIGIN}/portal/forgot%2Dpassword`, 'yol'],
  ['kodlanmış %66 (f)', `${ORIGIN}/portal/%66orgot-password`, 'yol'],
  ['kodlanmış %2F sonda', `${ORIGIN}/portal/forgot-password%2F`, 'yol'],
  ['kodlanmış %2F ortada', `${ORIGIN}/portal%2Fforgot-password`, 'yol'],
  ['/portal/Forgot-Password', `${ORIGIN}/portal/Forgot-Password`, 'yol'],
  ['çift //', `${ORIGIN}/portal//forgot-password`, 'yol'],
  ['alt yol', `${ORIGIN}/portal/forgot-password/x`, 'yol'],
  ['/api/portal/forgot-password', `${ORIGIN}/api/portal/forgot-password`, 'yol'],
  ['/portal/documents', `${ORIGIN}/portal/documents`, 'yol'],
  ['/portal/messages', `${ORIGIN}/portal/messages`, 'yol'],
  ['kök /', `${ORIGIN}/`, 'yol'],
  ['yolsuz', `${ORIGIN}`, 'yol'],
  ['yol parametresi ;x', `${ORIGIN}/portal/forgot-password;x`, 'yol'],
  ['sonda boşluk kodlu %20', `${ORIGIN}/portal/forgot-password%20`, 'yol'],
  // URL ayrıştırıcısının sessizce `/portal/forgot-password` yaptığı girdiler: yol kapısını geçer, KANONİK kapıda yakalanır
  ['./ parçası', `${ORIGIN}/portal/./forgot-password`, 'kanonik'],
  ['../ parçası', `${ORIGIN}/portal/x/../forgot-password`, 'kanonik'],
  ['ters bölü', `${ORIGIN}\\portal\\forgot-password`, 'kanonik'],
  ['kodlanmış nokta %2e', `${ORIGIN}/portal/%2e/forgot-password`, 'kanonik'],
  ['sonda ham boşluk', `${ORIGIN}/portal/forgot-password `, 'kanonik'],
  ['başta ham boşluk', ` ${ORIGIN}/portal/forgot-password`, 'kanonik'],
  ['sekme/yeni satır', `${ORIGIN}/portal/forgot-\tpassword`, 'kanonik'],
  ['büyük harf şema/host', `HTTPS://PORTAL.ORNEK.INVALID/portal/forgot-password`, 'kanonik'],
  ['varsayılan port :443', `${ORIGIN}:443/portal/forgot-password`, 'kanonik'],
];
const BAD_OTHER = [
  ['http şeması', envOf(`http://portal.ornek.invalid${OK_PATH}`), 4, 'sema'],
  ['userinfo kullanıcı@', envOf(`https://kisi@portal.ornek.invalid${OK_PATH}`), 4, 'userinfo'],
  ['userinfo kullanıcı:parola@', envOf(`https://kisi:gizli@portal.ornek.invalid${OK_PATH}`), 4, 'userinfo'],
  ['userinfo boş @', envOf(`https://@portal.ornek.invalid${OK_PATH}`), 4, 'userinfo'],
  ['userinfo ile host gizleme', envOf(`https://portal.ornek.invalid@baska.invalid${OK_PATH}`), 4, 'userinfo'],
  ['sorgu ?x=1', envOf(`${ORIGIN}${OK_PATH}?x=1`), 4, 'sorgu'],
  ['sorgu ?email=', envOf(`${ORIGIN}${OK_PATH}?email=a`), 4, 'sorgu'],
  ['boş sorgu ?', envOf(`${ORIGIN}${OK_PATH}?`), 4, 'sorgu'],
  ['fragment #token=', envOf(`${ORIGIN}${OK_PATH}#token=abc`), 4, 'fragment'],
  ['boş fragment #', envOf(`${ORIGIN}${OK_PATH}#`), 4, 'fragment'],
  ['origin: başka host', envOf(`https://baska.invalid${OK_PATH}`), 4, 'origin'],
  ['origin: alt alan adı', envOf(`https://x.portal.ornek.invalid${OK_PATH}`), 4, 'origin'],
  ['origin: sonek saldırısı', envOf(`https://portal.ornek.invalid.baska.invalid${OK_PATH}`), 4, 'origin'],
  ['origin: port eklendi', envOf(`${ORIGIN}:8443${OK_PATH}`), 4, 'origin'],
  ['origin: benzer host', envOf(`https://portal-ornek.invalid${OK_PATH}`), 4, 'origin'],
  ['adres boş', envOf(''), 4, 'adres-yok'],
  ['adres tanımsız', { D5_EXPECT_BASE_URL: ORIGIN }, 4, 'adres-yok'],
  ['adres ayrıştırılamıyor', envOf('bu bir adres degil'), 4, 'ayristirma'],
  ['yalnız yol', envOf(OK_PATH), 4, 'ayristirma'],
  ['javascript: şeması', envOf('javascript:alert(1)'), 4, 'sema'],
  ['beklenen origin tanımsız', { D5_QRTEST_URL: `${ORIGIN}${OK_PATH}` }, 4, 'beklenen-origin'],
  ['beklenen origin http', envOf(`${ORIGIN}${OK_PATH}`, { D5_EXPECT_BASE_URL: 'http://portal.ornek.invalid' }), 4, 'beklenen-origin'],
  ['beklenen origin yollu', envOf(`${ORIGIN}${OK_PATH}`, { D5_EXPECT_BASE_URL: `${ORIGIN}/portal` }), 4, 'beklenen-origin'],
  ['beklenen origin sorgulu', envOf(`${ORIGIN}${OK_PATH}`, { D5_EXPECT_BASE_URL: `${ORIGIN}/?a=1` }), 4, 'beklenen-origin'],
  ['beklenen origin userinfo', envOf(`${ORIGIN}${OK_PATH}`, { D5_EXPECT_BASE_URL: 'https://kisi@portal.ornek.invalid' }), 4, 'beklenen-origin'],
  ['TLS doğrulaması kapalı', envOf(`${ORIGIN}${OK_PATH}`, { NODE_TLS_REJECT_UNAUTHORIZED: '0' }), 1, 'tls'],
  ['TLS kapalı + yanlış yol (TLS önce)', envOf(`${ORIGIN}/portal/login`, { NODE_TLS_REJECT_UNAUTHORIZED: '0' }), 1, 'tls'],
];

/** Casus ön-yükleme: CONOUT$ açma denemelerini, ağ çağrılarını ve dosya yazma girişimlerini sayar; çıkışta JSON yazar. */
const SPY_SRC = `'use strict';
const fs = require('fs'); const net = require('net'); const dns = require('dns');
const out = process.env.D5QT_SPY_OUT; const write = fs.writeFileSync.bind(fs);
const seen = { loaded: true, conout: 0, conoutFlags: [], net: 0, dns: 0, fsWrite: [] };
const isCon = (p) => /CONOUT\\$/i.test(String(p));
const oOpen = fs.openSync;
fs.openSync = function (p, flags) { if (isCon(p)) { seen.conout++; seen.conoutFlags.push(String(flags)); } else if (flags && /[wa+]/.test(String(flags))) seen.fsWrite.push('openSync'); return oOpen.apply(this, arguments); };
for (const k of ['writeFileSync', 'appendFileSync', 'mkdirSync', 'createWriteStream', 'writeFile', 'appendFile', 'rmSync', 'unlinkSync', 'renameSync']) {
  const o = fs[k]; fs[k] = function () { seen.fsWrite.push(k); return o.apply(this, arguments); };
}
const oConn = net.Socket.prototype.connect; net.Socket.prototype.connect = function () { seen.net++; return oConn.apply(this, arguments); };
const oLook = dns.lookup; dns.lookup = function () { seen.dns++; return oLook.apply(this, arguments); };
process.on('exit', (code) => { seen.exit = code; try { write(out, JSON.stringify(seen)); } catch (e) { /* ölçülemedi: dosya yok → test FAIL */ } });
`;

function runProc(dir, name, env) {
  return new Promise((resolve) => {
    const spyOut = path.join(dir, `${name}.spy.json`);
    const e = Object.assign({}, process.env, { D5QT_SPY_OUT: spyOut });
    for (const k of ['NODE_OPTIONS', 'NODE_TLS_REJECT_UNAUTHORIZED', 'NODE_EXTRA_CA_CERTS', 'D5_QRTEST_URL', 'D5_EXPECT_BASE_URL', 'EXA_QRTEST_URL']) delete e[k];
    Object.assign(e, env);
    // detached + windowsHide: çocuk sürecin KONSOLU YOKTUR (d5-selftest Z11 ile aynı kalıp) → QR hiçbir pencereye çizilemez
    const c = spawn(process.execPath, ['-r', path.join(dir, 'spy.js'), QR], { env: e, detached: true, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let so = ''; let se = ''; c.stdout.on('data', (d) => { so += d; }); c.stderr.on('data', (d) => { se += d; });
    c.on('close', (code) => {
      let spy = null; try { spy = JSON.parse(fs.readFileSync(spyOut, 'utf8')); } catch (err) { spy = null; }
      fs.writeFileSync(path.join(dir, `${name}.log`), `# çıkış=${code}\n# stdout\n${so}\n# stderr\n${se}\n`, 'utf8');
      resolve({ code, so, se, spy });
    });
  });
}

/** Sahte gösterim: çağrıları kaydeder; konsola/dosyaya YAZMAZ. */
function fakeDisplay(opts = {}) {
  const calls = { open: 0, render: [], show: [], close: 0 };
  return { calls,
    openConsole() { calls.open++; if (opts.noConsole) throw new Error('konsol açılamadı (test)'); return { fake: true }; },
    renderQr(t) { calls.render.push(t); return { lines: ['<qr-satırı>'], modules: 33 }; },
    async show(con, lines) { calls.show.push(lines); if (opts.showThrows) throw new Error('yazım hatası (test)'); },
    close() { calls.close++; } };
}
async function runMain(QT, env, disp) {
  const cap = { out: [], err: [] }; const oe = console.error; const ol = console.log;
  console.error = (...a) => cap.err.push(a.join(' ')); console.log = (...a) => cap.out.push(a.join(' '));
  let code; let threw = null;
  try { code = await QT.main(env, disp); } catch (e) { threw = String((e && e.message) || e); } finally { console.error = oe; console.log = ol; }
  return { code, threw, out: cap.out.join('\n'), err: cap.err.join('\n') };
}

(async () => {
  if (!fs.existsSync(QR)) { console.log('OLCULEMEDI: d5-qr-test.js yok'); process.exit(2); }
  const QT = require(QR);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'd5-qr-selftest-'));
  fs.writeFileSync(path.join(dir, 'spy.js'), SPY_SRC, 'utf8');

  // ---------------------------------------------------------------- V: doğrulama (saf fonksiyon)
  const okCases = [
    ['alan adı origin', envOf(`${ORIGIN}${OK_PATH}`), `${ORIGIN}${OK_PATH}`],
    ['beklenen origin sondaki / ile', envOf(`${ORIGIN}${OK_PATH}`, { D5_EXPECT_BASE_URL: `${ORIGIN}/` }), `${ORIGIN}${OK_PATH}`],
    ['portlu origin (öz-test dış ucu biçimi)', { D5_EXPECT_BASE_URL: 'https://localhost:8456', D5_QRTEST_URL: `https://localhost:8456${OK_PATH}` }, `https://localhost:8456${OK_PATH}`],
    ['TLS değişkeni 1 (açık)', envOf(`${ORIGIN}${OK_PATH}`, { NODE_TLS_REJECT_UNAUTHORIZED: '1' }), `${ORIGIN}${OK_PATH}`],
  ];
  const okBad = okCases.filter(([, env, href]) => { const v = QT.validateQrTarget(env); return !(v.ok === true && v.code === 0 && v.href === href && v.reason === null); });
  check('V-1', `kabul: TAM yol ${OK_PATH} (origin = beklenen origin; kanonik) — ${okCases.length} durum`, okBad.length === 0 && QT.QR_PATH === OK_PATH, `kabul edilmeyen=${okBad.map((c) => c[0]).join(',') || 'yok'} · QR_PATH=${QT.QR_PATH}`);

  const pathRes = BAD_PATHS.map(([label, url, reason]) => ({ label, reason, v: QT.validateQrTarget(envOf(url)) }));
  const pathWrong = pathRes.filter((r) => !(r.v.ok === false && r.v.code === 4 && r.v.href === null && r.v.reason === r.reason));
  check('V-2', `ret: yanlış yol → çıkış 4 (zorunlu 6 yol + kodlanmış/normalleşen varyantlar) — ${BAD_PATHS.length} durum; hiçbiri adres DÖNDÜRMEZ`, pathWrong.length === 0 && BAD_PATHS.length >= 25,
    `yanlış sonuç=${pathWrong.map((r) => `${r.label}→ok=${r.v.ok}/kod=${r.v.code}/neden=${r.v.reason}`).join(' | ') || 'yok'} · neden dağılımı=yol:${pathRes.filter((r) => r.v.reason === 'yol').length},kanonik:${pathRes.filter((r) => r.v.reason === 'kanonik').length}`);
  const mandatory = ['/portal/login', '/portal/reset-password', '/portal/forgot-password/', '/PORTAL/forgot-password', '/auth/forgot-password', '/portal/forgot%2Dpassword'];
  const manRes = mandatory.map((p) => ({ p, v: QT.validateQrTarget(envOf(ORIGIN + p)) }));
  check('V-3', 'ret: görev tanımındaki 6 yanlış yolun HER BİRİ ayrı ayrı çıkış 4 / neden "yol"', manRes.every((r) => r.v.ok === false && r.v.code === 4 && r.v.reason === 'yol'), manRes.map((r) => `${r.p}=${r.v.code}/${r.v.reason}`).join(' · '));

  const othRes = BAD_OTHER.map(([label, env, code, reason]) => ({ label, code, reason, v: QT.validateQrTarget(env) }));
  const othWrong = othRes.filter((r) => !(r.v.ok === false && r.v.code === r.code && r.v.reason === r.reason && r.v.href === null));
  check('V-4', `ret: http / userinfo / sorgu / fragment / origin uyuşmazlığı / boş-bozuk adres / geçersiz beklenen origin → 4; TLS kapalı → 1 — ${BAD_OTHER.length} durum`, othWrong.length === 0,
    `yanlış sonuç=${othWrong.map((r) => `${r.label}→kod=${r.v.code}/neden=${r.v.reason}`).join(' | ') || 'yok'}`);
  const allRej = [...pathRes.map((r) => r.v), ...othRes.map((r) => r.v)];
  check('V-5', 'ret mesajları adresi/host\'u YAZMAZ (log dosyasına alan adı düşmez); her rette neden + açıklama dolu', allRej.every((v) => v.why && v.reason && !/ornek\.invalid|baska\.invalid|localhost/.test(v.why)), `ret sayısı=${allRej.length}`);
  check('V-6', 'girdi nesnesi DEĞİŞTİRİLMEZ; tanımsız/boş ortam güvenle reddedilir (istisna yok)', (() => { const e = Object.freeze(envOf(`${ORIGIN}${OK_PATH}`)); const a = QT.validateQrTarget(e); const b = QT.validateQrTarget(undefined); const c = QT.validateQrTarget({}); return a.ok && !b.ok && b.code === 4 && !c.ok && c.code === 4; })(), 'dondurulmuş nesne + undefined + {}');

  // ---------------------------------------------------------------- E: origin kuralı eşitliği (h5 expectedOriginOf)
  const H5 = require(H5_RUN);
  const originInputs = ['https://portal.ornek.invalid', 'https://portal.ornek.invalid/', 'HTTPS://PORTAL.ORNEK.INVALID', 'https://localhost:8456', 'https://portal.ornek.invalid:443',
    'http://portal.ornek.invalid', 'https://portal.ornek.invalid/portal', 'https://portal.ornek.invalid/?a=1', 'https://portal.ornek.invalid/#x', 'https://kisi@portal.ornek.invalid',
    'https://kisi:gizli@portal.ornek.invalid', '', null, undefined, 'bozuk', 'ftp://portal.ornek.invalid', 'https://', 'https://portal.ornek.invalid//', ' https://portal.ornek.invalid ', 0, {}];
  const diff = originInputs.filter((i) => QT.expectedOriginOf(i) !== H5.expectedOriginOf(i));
  check('E-1', `beklenen origin kuralı h5-url-live-run.js expectedOriginOf ile AYNI sonuç — ${originInputs.length} girdi`, typeof H5.expectedOriginOf === 'function' && diff.length === 0 && QT.expectedOriginOf('https://portal.ornek.invalid/') === 'https://portal.ornek.invalid' && QT.expectedOriginOf('https://portal.ornek.invalid/portal') === null,
    `farklı=${diff.length} · kabul edilen=${originInputs.filter((i) => QT.expectedOriginOf(i)).length}`);

  // ---------------------------------------------------------------- M: main (sahte gösterim, süreç içinde)
  const d1 = fakeDisplay(); const m1 = await runMain(QT, envOf(`${ORIGIN}/portal/login`), d1);
  check('M-1', 'main: yanlış yol → 4; konsol AÇILMADI (openConsole 0), QR üretilmedi (renderQr 0), gösterim yok (show 0); hata metni adresi yazmaz', m1.code === 4 && d1.calls.open === 0 && d1.calls.render.length === 0 && d1.calls.show.length === 0 && d1.calls.close === 0 && /REDDEDİLDİ \(yol\)/.test(m1.err) && !/ornek\.invalid/.test(m1.err + m1.out),
    `kod=${m1.code} · open=${d1.calls.open} render=${d1.calls.render.length} show=${d1.calls.show.length}`);
  let mAll = 0; let mBad = [];
  for (const [label, url] of BAD_PATHS) { const d = fakeDisplay(); const r = await runMain(QT, envOf(url), d); mAll++; if (!(r.code === 4 && d.calls.open === 0 && d.calls.render.length === 0 && d.calls.show.length === 0)) mBad.push(label); }
  for (const [label, env, code] of BAD_OTHER) { const d = fakeDisplay(); const r = await runMain(QT, env, d); mAll++; if (!(r.code === code && d.calls.open === 0 && d.calls.render.length === 0 && d.calls.show.length === 0)) mBad.push(label); }
  check('M-2', `main: TÜM ret durumlarında (${mAll}) konsol açma denemesi 0 ve QR üretimi 0`, mBad.length === 0 && mAll === BAD_PATHS.length + BAD_OTHER.length, `ihlal=${mBad.join(',') || 'yok'}`);
  const d3 = fakeDisplay(); const m3 = await runMain(QT, envOf(`${ORIGIN}${OK_PATH}`), d3);
  const shown = (d3.calls.show[0] || []); const urls = shown.join('\n').match(/https?:\/\/[^\s]+/g) || [];
  check('M-3', 'main: doğru yol → 0; konsol 1 kez açıldı/kapandı; QR YALNIZ doğrulanmış adresle üretildi; ekranda tek adres o; stdout adresi yazmaz (log\'a düşmez)',
    m3.code === 0 && d3.calls.open === 1 && d3.calls.close === 1 && JSON.stringify(d3.calls.render) === JSON.stringify([`${ORIGIN}${OK_PATH}`]) && urls.length === 1 && urls[0] === `${ORIGIN}${OK_PATH}` && /formu GÖNDERMEYİN/.test(shown[0] || '') && !/ornek\.invalid/.test(m3.out) && /yol=\/portal\/forgot-password/.test(m3.out),
    `kod=${m3.code} · open=${d3.calls.open} close=${d3.calls.close} render=${d3.calls.render.length} ekrandaki adres=${urls.length}`);
  const d4 = fakeDisplay({ noConsole: true }); const m4 = await runMain(QT, envOf(`${ORIGIN}${OK_PATH}`), d4);
  check('M-4', 'main: doğru yol ama konsol YOK → 4 "yerel konsol yok"; QR üretilmedi; gösterim yok', m4.code === 4 && d4.calls.open === 1 && d4.calls.render.length === 0 && d4.calls.show.length === 0 && /yerel konsol yok/.test(m4.err), `kod=${m4.code} · open=${d4.calls.open} render=${d4.calls.render.length}`);
  const d5 = fakeDisplay({ showThrows: true }); const m5 = await runMain(QT, envOf(`${ORIGIN}${OK_PATH}`), d5);
  check('M-5', 'main: gösterim yazımı hata verirse 0 DÖNMEZ (istisna) ve konsol yine kapatılır', m5.code === undefined && !!m5.threw && d5.calls.close === 1, `kod=${m5.code} · istisna=${m5.threw} · close=${d5.calls.close}`);

  // ---------------------------------------------------------------- P: gerçek süreç (konsolsuz + casus)
  const p1 = await runProc(dir, 'p1-yanlis-yol-login', { D5_QRTEST_URL: `${ORIGIN}/portal/login`, D5_EXPECT_BASE_URL: ORIGIN });
  check('P-1', 'süreç: yanlış yol (/portal/login) → çıkış 4; casus yüklendi ve CONOUT$ açma denemesi 0 (konsol AÇILMADAN durdu); ağ 0; dosya yazması 0; "yerel konsol yok" DEĞİL "yol" reddi',
    p1.code === 4 && !!p1.spy && p1.spy.loaded === true && p1.spy.exit === 4 && p1.spy.conout === 0 && p1.spy.net === 0 && p1.spy.dns === 0 && p1.spy.fsWrite.length === 0 && /REDDEDİLDİ \(yol\)/.test(p1.se) && !/yerel konsol yok/.test(p1.se) && p1.so === '',
    `çıkış=${p1.code} · casus=${JSON.stringify(p1.spy)}`);
  const pm = [];
  for (let i = 0; i < mandatory.length; i++) { const r = await runProc(dir, `p2-${i}`, { D5_QRTEST_URL: ORIGIN + mandatory[i], D5_EXPECT_BASE_URL: ORIGIN }); pm.push({ p: mandatory[i], r }); }
  check('P-2', 'süreç: 6 zorunlu yanlış yolun HER BİRİ → çıkış 4, CONOUT$ açma denemesi 0, ağ 0, dosya yazması 0', pm.every((x) => x.r.code === 4 && x.r.spy && x.r.spy.loaded && x.r.spy.conout === 0 && x.r.spy.net === 0 && x.r.spy.dns === 0 && x.r.spy.fsWrite.length === 0),
    pm.map((x) => `${x.p}=${x.r.code}/conout:${x.r.spy ? x.r.spy.conout : 'casus-yok'}`).join(' · '));
  const p3 = await runProc(dir, 'p3-dogru-yol-konsolsuz', { D5_QRTEST_URL: `${ORIGIN}${OK_PATH}`, D5_EXPECT_BASE_URL: ORIGIN });
  check('P-3', 'süreç: DOĞRU yol, konsolsuz → kapılar geçti, CONOUT$ açma denemesi TAM 1 (r+) — casusun gördüğünün kanıtı — ve "yerel konsol yok" çıkış 4; ağ 0; dosya yazması 0; stdout boş (adres log\'a düşmedi)',
    p3.code === 4 && !!p3.spy && p3.spy.conout === 1 && JSON.stringify(p3.spy.conoutFlags) === '["r+"]' && p3.spy.net === 0 && p3.spy.dns === 0 && p3.spy.fsWrite.length === 0 && /yerel konsol yok/.test(p3.se) && !/REDDEDİLDİ \(/.test(p3.se) && p3.so === '' && !/ornek\.invalid/.test(p3.se),
    `çıkış=${p3.code} · casus=${JSON.stringify(p3.spy)}`);
  const pOther = [
    ['http', { D5_QRTEST_URL: `http://portal.ornek.invalid${OK_PATH}`, D5_EXPECT_BASE_URL: ORIGIN }, 4, 'sema'],
    ['userinfo', { D5_QRTEST_URL: `https://kisi:gizli@portal.ornek.invalid${OK_PATH}`, D5_EXPECT_BASE_URL: ORIGIN }, 4, 'userinfo'],
    ['sorgu', { D5_QRTEST_URL: `${ORIGIN}${OK_PATH}?x=1`, D5_EXPECT_BASE_URL: ORIGIN }, 4, 'sorgu'],
    ['fragment', { D5_QRTEST_URL: `${ORIGIN}${OK_PATH}#token=abc`, D5_EXPECT_BASE_URL: ORIGIN }, 4, 'fragment'],
    ['origin', { D5_QRTEST_URL: `https://baska.invalid${OK_PATH}`, D5_EXPECT_BASE_URL: ORIGIN }, 4, 'origin'],
    ['beklenen-origin', { D5_QRTEST_URL: `${ORIGIN}${OK_PATH}` }, 4, 'beklenen-origin'],
    ['adres-yok', { D5_EXPECT_BASE_URL: ORIGIN }, 4, 'adres-yok'],
    ['tls', { D5_QRTEST_URL: `${ORIGIN}${OK_PATH}`, D5_EXPECT_BASE_URL: ORIGIN, NODE_TLS_REJECT_UNAUTHORIZED: '0' }, 1, 'tls'],
    ['eski değişken (EXA_QRTEST_URL) tek başına', { EXA_QRTEST_URL: `${ORIGIN}${OK_PATH}`, D5_EXPECT_BASE_URL: ORIGIN }, 4, 'adres-yok'],
  ];
  const po = [];
  for (const [label, env, code, reason] of pOther) { const r = await runProc(dir, `p4-${label.replace(/[^a-z0-9-]/gi, '_')}`, env); po.push({ label, code, reason, r }); }
  const poBad = po.filter((x) => !(x.r.code === x.code && x.r.spy && x.r.spy.loaded && x.r.spy.conout === 0 && x.r.spy.net === 0 && x.r.spy.dns === 0 && x.r.spy.fsWrite.length === 0 && x.r.se.includes(`REDDEDİLDİ (${x.reason})`)));
  check('P-4', `süreç: http / userinfo / sorgu / fragment / origin / beklenen origin yok / adres yok → 4 · TLS kapalı → 1 · eski EXA_QRTEST_URL tek başına KABUL EDİLMEZ — ${pOther.length} durum; hepsinde CONOUT$ 0, ağ 0, yazma 0`, poBad.length === 0,
    po.map((x) => `${x.label}=${x.r.code}/conout:${x.r.spy ? x.r.spy.conout : 'casus-yok'}`).join(' · '));
  const procAll = [p1, ...pm.map((x) => x.r), p3, ...po.map((x) => x.r)];
  check('P-5', 'süreç: hiçbir koşumda ağ çağrısı (soket/DNS) ve dosya yazması YOK; casus her koşumda yüklendi (kör ölçüm değil)', procAll.every((r) => r.spy && r.spy.loaded === true && r.spy.net === 0 && r.spy.dns === 0 && r.spy.fsWrite.length === 0),
    `koşum=${procAll.length} · casus yüklü=${procAll.filter((r) => r.spy && r.spy.loaded).length} · ağ=${procAll.reduce((a, r) => a + (r.spy ? r.spy.net + r.spy.dns : 0), 0)} · yazma=${procAll.reduce((a, r) => a + (r.spy ? r.spy.fsWrite.length : 0), 0)}`);

  // ---------------------------------------------------------------- S: statik
  const srcFull = fs.readFileSync(QR, 'utf8'); const code = srcFull.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
  const reqs = [...code.matchAll(/require\(([^)]*)\)/g)].map((m) => m[1].trim());
  check('S-1', 'kaynak: tek require (extacc-display); http/https/net/dns/child_process/fs modülü ve fetch YOK; `require.main === module` koruması var; doğrulama dışa verilir',
    JSON.stringify(reqs) === JSON.stringify(["'../../client-extacc-intake-chain-r01/scripts/extacc-display'"]) && !/\bfetch\s*\(/.test(code) && !/require\('(https?|net|dns|child_process|fs|tls)'\)/.test(code) && /require\.main === module/.test(code) && /module\.exports = \{[^}]*validateQrTarget[^}]*\}/.test(code),
    `require=${reqs.join(',')}`);
  check('S-2', 'kaynak (yorumlar DAHİL): alan adı / IP / kullanıcı yolu literali YOK; kabul edilen yol sabiti tek ve `/portal/forgot-password`',
    !/https?:\/\/[A-Za-z0-9]/.test(srcFull) && !/\b\d{1,3}(\.\d{1,3}){3}\b/.test(srcFull) && !/[A-Za-z]:\\Users\\/.test(srcFull) && (code.match(/const QR_PATH = '([^']+)'/) || [])[1] === OK_PATH && (code.match(/'\/portal\/[a-z-]+'/g) || []).length === 1,
    `yol sabiti=${(code.match(/const QR_PATH = '([^']+)'/) || [])[1]}`);
  const iGate = code.indexOf('validateQrTarget(env)', code.indexOf('async function main')); const iOpen = code.indexOf('openConsole()'); const iRender = code.indexOf('renderQr(');
  check('S-3', 'kaynak sırası: main içinde doğrulama → (ret ise dönüş) → openConsole → renderQr; renderQr yalnız doğrulanmış `v.href` ile', iGate > 0 && iGate < iOpen && iOpen < iRender && /renderQr\(v\.href\)/.test(code) && (code.match(/openConsole\(\)/g) || []).length === 1, `doğrulama@${iGate} konsol@${iOpen} qr@${iRender}`);
  const tree = JSON.parse(execFileSync(process.execPath, [REQTREE, QR], { encoding: 'utf8' }));
  const expTree = ['client-extacc-intake-chain-r01/scripts/extacc-display.js', 'client-extacc-intake-chain-r01/scripts/vendor/qrcode-generator-1.4.4/qrcode.js', 'client-extacc-portal-d5-r01/scripts/d5-qr-test.js'];
  check('S-4', 'require ağacı (ölçüldü): d5-qr-test.js + extacc-display.js + vendor qrcode.js — başka governance dosyası YÜKLENMEZ; yüklemek main\'i ÇALIŞTIRMAZ', JSON.stringify(tree) === JSON.stringify(expTree), `yüklenen=${tree.length} · ${tree.join(',')}`);
  const exaPin = ((fs.readFileSync(EXA_BLOCK, 'utf8').match(/extacc-qr-test\.js'\s*=\s*'([0-9A-F]{64})'/) || [])[1]) || null; const exaSha = shaFile(EXA_QR);
  check('S-5', 'extacc-qr-test.js DEĞİŞTİRİLMEDİ: dosya sha256 = EXTACC owner bloğundaki pin; hâlâ yalnız /portal/login kabul eder', !!exaPin && exaPin === exaSha && /u\.pathname !== '\/portal\/login'/.test(fs.readFileSync(EXA_QR, 'utf8')), `pin=${(exaPin || '').slice(0, 12)} dosya=${exaSha.slice(0, 12)}`);
  const wb = fs.readFileSync(QR);
  check('S-6', 'dosya biçimi: UTF-8 (BOM yok), LF satır sonu', !(wb[0] === 0xef && wb[1] === 0xbb) && !wb.includes(0x0d), `CR=${wb.filter((b) => b === 0x0d).length}`);

  console.log('');
  for (const r of rows) console.log(`${r.sonuc}  ${r.id.padEnd(5)} ${r.aciklama}\n        ${r.gozlem}`);
  const fail = rows.filter((r) => r.sonuc === 'FAIL').length;
  console.log(`\nEXTACC D-5 QR DENEMESİ ÖZ-TESTİ: PASS ${rows.length - fail} / ${rows.length}`);
  console.log(`  test edilen betik: d5-qr-test.js sha256=${shaFile(QR)} · koşum başlangıcı (UTC)=${STARTED_UTC} · node=${process.version}`);
  console.log(`  doğrulama durumu: kabul ${okCases.length} · yanlış yol ${BAD_PATHS.length} · diğer ret ${BAD_OTHER.length} · gerçek süreç koşumu ${procAll.length}`);
  console.log(`  kanıt dizini: ${dir.replace(/^([A-Za-z]:\\Users\\)[^\\]+/, '$1<kullanıcı>')}`);
  console.log('  (sentetik .invalid origin; canlı alan adı/DB/API/DNS/tünel/e-posta KULLANILMADI; konsola QR ÇİZİLMEDİ)');
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => { console.log('OLCULEMEDI: ' + String((e && e.stack) || e).slice(0, 600)); process.exit(2); });
