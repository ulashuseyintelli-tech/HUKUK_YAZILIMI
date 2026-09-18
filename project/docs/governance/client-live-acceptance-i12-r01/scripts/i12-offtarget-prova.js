/*
 * İ12 — HEDEF-DIŞI MESAJ KAPISI: ZARF (RCPT TO) + BAŞLIK · HEDEFLİ İZOLE PROVA
 *
 * Bu prova SENTETİK DOSYA değil, GERÇEK SMTP KONUŞMALARI kullanır: aynı ağaçtaki GERÇEK `i3-sink.js`
 * geçici bir loopback portunda başlatılır, ona gerçek SMTP konuşmaları (ham soket + ürünün kullandığı
 * nodemailer ile Bcc) yapılır, ardından `i12-live-measure-online.scanOffTarget` GERÇEK fonksiyonu
 * koşulur (kopya mantık YOK). DB/API/canlı ortam GEREKTİRMEZ; canlıya DOKUNMAZ.
 *
 * Ölçülen sözleşme (owner: "envelope RCPT TO alıcılarını kapsa; eksik/okunamayan zarf kanıtı PASS değil"):
 *   E1  izinli zarf + izinli başlık                          → PASS (bakılan sayılar > 0)
 *   E2  izinli `To:` başlığı + izin DIŞI zarf alıcısı (Bcc)   → FAIL; yakalama ZARFTAN, başlıktan DEĞİL
 *   E3  nodemailer `bcc:` (ürünün taşıma kütüphanesi)        → Bcc başlıkta YOK, zarfta VAR → FAIL
 *   E4  `reset` modu: DATA'ya ulaşmayan deneme               → msg yok ama conn `rcpt=` yakalar → FAIL
 *   E5  işaretsiz conn kaydı (eski sink)                      → ÖLÇÜLEMEDİ (PASS DEĞİL)
 *   E6  zarfsız teslim kaydı (`X-I3-To` yok)                  → ÖLÇÜLEMEDİ (PASS DEĞİL)
 *   E7  okunamayan dizin                                      → null (ÖLÇÜLEMEDİ)
 *   E8  sink DIŞARI AKTARMAZ: dinleme 127.0.0.1'de, teslim sırasında loopback DIŞI uç bağlantı 0
 *
 * KULLANIM: node i12-offtarget-prova.js   [I12_NODEMAILER_PATH=<nodemailer.js>]   (çıkış 0 = hepsi PASS)
 */
'use strict';
const fs = require('fs'); const os = require('os'); const path = require('path'); const net = require('net');
const { spawn, execFileSync } = require('child_process');
const { scanOffTarget } = require('./i12-live-measure-online');

const SINK = path.resolve(__dirname, '../../client-acceptance-runners-i3-r01/scripts/i3-sink.js');
const RUN = 'r0env01';
const OK_DELIV = `deliv-${RUN}@ah-harness.invalid`;
const OK_FD = `fd-${RUN}@ah-harness.invalid`;
const OFF = 'gercek.muvekkil@ornekhukuk.com.tr';
const ALLOWED = new Set([OK_DELIV, OK_FD, `alici-${RUN}@ah-harness.invalid`]);

let pass = 0, fail = 0; const rows = [];
function check(id, desc, ok, observed) {
  ok ? pass++ : fail++;
  rows.push({ id, verdict: ok ? 'PASS' : 'FAIL', desc, observed });
  console.log(`${ok ? 'PASS' : 'FAIL'} | ${id} — ${desc}\n       ${observed}`);
}
const freePort = () => new Promise((res) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });

function startSink(port, dir) {
  return new Promise((res, rej) => {
    const c = spawn(process.execPath, [SINK], { env: { ...process.env, I3_SMTP_PORT: String(port), I3_SMTP_CAPTURE: dir }, stdio: ['ignore', 'pipe', 'pipe'] });
    let o = ''; const t = setTimeout(() => rej(new Error('sink hazır olmadı')), 5000);
    c.stdout.on('data', (d) => { o += d; if (o.includes('I3-SMTP-SINK-READY')) { clearTimeout(t); res(c); } });
    c.on('error', (e) => { clearTimeout(t); rej(e); });
  });
}
const setMode = (dir, m) => fs.writeFileSync(path.join(dir, 'mode'), m, 'utf8');

/** Ham SMTP konuşması: zarf alıcıları `rcpts`, başlıkta YALNIZ `headerTo`. `hold` verilirse EHLO sonrası bekletir. */
function smtp(port, { rcpts, headerTo, hold }) {
  return new Promise((resolve) => {
    const s = net.connect(port, '127.0.0.1'); let buf = ''; let step = 0; const out = [];
    const send = (l) => s.write(l + '\r\n');
    const script = [
      () => send('EHLO prova.local'),
      async () => { if (hold) await hold(); send('MAIL FROM:<noreply@ah-harness.invalid>'); },
      ...rcpts.map((r) => () => send(`RCPT TO:<${r}>`)),
      () => send('DATA'),
      () => { send(`From: noreply@ah-harness.invalid\r\nTo: ${headerTo}\r\nSubject: prova\r\n\r\ngovde\r\n.`); },
      () => send('QUIT'),
    ];
    s.on('data', async (d) => {
      buf += d.toString(); const lines = buf.split('\r\n'); buf = lines.pop();
      for (const l of lines) { out.push(l); if (/^\d{3} /.test(l) && step < script.length) { const fn = script[step++]; await fn(); } }
    });
    s.on('close', () => resolve(out)); s.on('error', () => resolve(out));
    setTimeout(() => { s.destroy(); resolve(out); }, 4000);
  });
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const port = await freePort();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'i12env-'));
  const sink = await startSink(port, dir);
  try {
    // ── E8: dışarı aktarım yok — teslim sırasında sink sürecinin TCP uçları ölçülür ──
    let tcp = null;
    await smtp(port, { rcpts: [OK_DELIV], headerTo: OK_DELIV, hold: async () => {
      try {
        const js = execFileSync('powershell', ['-NoProfile', '-Command',
          `Get-NetTCPConnection -OwningProcess ${sink.pid} -ErrorAction SilentlyContinue | Select-Object State,LocalAddress,LocalPort,RemoteAddress,RemotePort | ConvertTo-Json -Compress`], { encoding: 'utf8' });
        tcp = js.trim() ? [].concat(JSON.parse(js)) : [];
      } catch (e) { tcp = null; }
    } });
    await wait(300);

    // ── E1: izinli (ayrı temiz dizin: yalnız izinli konuşma) ──
    const cleanDir = fs.mkdtempSync(path.join(os.tmpdir(), 'i12envA-')); const cleanPort = await freePort(); const cleanSink = await startSink(cleanPort, cleanDir);
    await smtp(cleanPort, { rcpts: [OK_DELIV], headerTo: OK_DELIV }); await wait(300);
    const r1 = scanOffTarget(cleanDir, ALLOWED); cleanSink.kill();
    check('E1', 'izinli zarf + izinli başlık → temiz; tarayıcı BAKTIĞINI kanıtlar (msg/conn/zarf > 0)',
      r1 && r1.offTarget.length === 0 && r1.evidenceGaps.length === 0 && r1.msgs >= 1 && r1.conns >= 1 && r1.envelopeRecipients >= 1,
      JSON.stringify(r1 && { msgs: r1.msgs, conns: r1.conns, zarf: r1.envelopeRecipients, baslik: r1.headerRecipients, off: r1.offTarget, gaps: r1.evidenceGaps }));

    // ── E2: izinli To: + izin DIŞI zarf (Bcc) ──
    const d2 = fs.mkdtempSync(path.join(os.tmpdir(), 'i12envB-')); const p2 = await freePort(); const s2 = await startSink(p2, d2);
    await smtp(p2, { rcpts: [OK_DELIV, OFF], headerTo: OK_DELIV }); await wait(300); s2.kill();
    const r2 = scanOffTarget(d2, ALLOWED);
    const offHits = (r2 && r2.offTarget.filter((x) => x.includes(OFF))) || [];
    check('E2', 'izinli `To:` + izin DIŞI zarf alıcısı (Bcc) → FAIL; yakalama ZARFTAN, başlıktan DEĞİL',
      r2 && offHits.length >= 1 && offHits.every((x) => /\[(zarf|rcpt)\]/.test(x)) && !offHits.some((x) => x.includes('[baslik]')),
      JSON.stringify(r2 && r2.offTarget));

    // ── E3: nodemailer bcc (ürünün taşıma kütüphanesi) ──
    const NM = process.env.I12_NODEMAILER_PATH || (() => { try { return require.resolve('nodemailer', { paths: [path.resolve(__dirname, '../../../../apps/api')] }); } catch (e) { return null; } })();
    if (!NM) { check('E3', 'nodemailer bcc → zarfta yakalanır', false, 'nodemailer ÇÖZÜLEMEDİ (I12_NODEMAILER_PATH ver) — atlanmadı, FAIL sayıldı'); }
    else {
      const nodemailer = require(NM);
      const d3 = fs.mkdtempSync(path.join(os.tmpdir(), 'i12envC-')); const p3 = await freePort(); const s3 = await startSink(p3, d3);
      const tr = nodemailer.createTransport({ host: '127.0.0.1', port: p3, secure: false, ignoreTLS: true });
      let info = null; try { info = await tr.sendMail({ from: 'noreply@ah-harness.invalid', to: OK_DELIV, bcc: OFF, subject: 'bcc prova', text: 'govde' }); } catch (e) { info = { err: e.message }; }
      await wait(300); s3.kill();
      const r3 = scanOffTarget(d3, ALLOWED);
      const emlTxt = fs.readdirSync(d3).filter((f) => f.startsWith('msg-')).map((f) => fs.readFileSync(path.join(d3, f), 'utf8')).join('\n');
      const bccInHeader = /^Bcc:/im.test(emlTxt.split('\n\n').slice(1).join('\n\n')) || new RegExp(`^(To|Cc):.*${OFF.replace(/\./g, '\\.')}`, 'im').test(emlTxt);
      const hit = r3 && r3.offTarget.some((x) => x.includes(OFF) && /\[(zarf|rcpt)\]/.test(x));
      check('E3', 'nodemailer `bcc:` → Bcc BAŞLIKTA YOK, ZARFTA VAR; kapı ZARFTAN yakalar → FAIL',
        hit && !bccInHeader,
        `accepted=${JSON.stringify(info && info.accepted)} · başlıkta-bcc=${bccInHeader} · off=${JSON.stringify(r3 && r3.offTarget)}`);
    }

    // ── E4: reset modu (DATA'ya ulaşmayan deneme) ──
    const d4 = fs.mkdtempSync(path.join(os.tmpdir(), 'i12envD-')); const p4 = await freePort(); const s4 = await startSink(p4, d4);
    setMode(d4, 'reset'); await wait(150);
    await smtp(p4, { rcpts: [OFF], headerTo: OK_DELIV }); await wait(300); s4.kill();
    const r4 = scanOffTarget(d4, ALLOWED);
    check('E4', '`reset` (DATA\'da kopan) deneme: msg dosyası YOK ama conn `rcpt=` izin dışı alıcıyı YAKALAR → FAIL',
      r4 && r4.msgs === 0 && r4.conns >= 1 && r4.offTarget.some((x) => x.includes(OFF) && x.includes('[rcpt]')),
      JSON.stringify(r4 && { msgs: r4.msgs, conns: r4.conns, off: r4.offTarget }));

    // ── E5: işaretsiz conn (eski sink) → ÖLÇÜLEMEDİ ──
    const d5 = fs.mkdtempSync(path.join(os.tmpdir(), 'i12envE-'));
    fs.writeFileSync(path.join(d5, 'conn-0001.log'), 'mode=\nat=2026-01-01T00:00:00Z\n', 'utf8');
    const r5 = scanOffTarget(d5, ALLOWED);
    check('E5', 'envelope=v1 işaretsiz conn kaydı (eski sink) → kanıt EKSİK = ÖLÇÜLEMEDİ (PASS DEĞİL)',
      r5 && r5.offTarget.length === 0 && r5.evidenceGaps.some((g) => /eski sink/.test(g)), JSON.stringify(r5 && r5.evidenceGaps));

    // ── E6: zarfsız teslim kaydı → ÖLÇÜLEMEDİ ──
    const d6 = fs.mkdtempSync(path.join(os.tmpdir(), 'i12envF-'));
    fs.writeFileSync(path.join(d6, 'msg-0001.eml'), `X-I3-Sink: captured-locally\n\nTo: ${OK_DELIV}\nSubject: x\n\ngovde\n`, 'utf8');
    const r6 = scanOffTarget(d6, ALLOWED);
    check('E6', '`X-I3-To` (zarf) OLMAYAN teslim kaydı → kanıt EKSİK = ÖLÇÜLEMEDİ (başlık temiz olsa bile PASS DEĞİL)',
      r6 && r6.offTarget.length === 0 && r6.evidenceGaps.some((g) => /ZARF-YOK/.test(g)), JSON.stringify(r6 && r6.evidenceGaps));

    // ── E7: okunamayan dizin ──
    const r7 = scanOffTarget(path.join(os.tmpdir(), 'i12env-OLMAYAN-xyz'), ALLOWED);
    check('E7', 'okunamayan dizin → null (ÖLÇÜLEMEDİ)', r7 === null, `donus=${r7 === null ? 'null' : 'dolu'}`);

    // ── E8 değerlendirmesi ──
    const nonLoop = (tcp || []).filter((c) => !['127.0.0.1', '0.0.0.0', '::', '::1'].includes(String(c.RemoteAddress)));
    const listen = (tcp || []).filter((c) => String(c.State) === 'Listen' || c.State === 2);
    check('E8', 'sink DIŞARI AKTARMAZ: dinleme yalnız 127.0.0.1 · teslim anında loopback-dışı uç bağlantı 0',
      Array.isArray(tcp) && tcp.length >= 1 && nonLoop.length === 0 && listen.every((c) => String(c.LocalAddress) === '127.0.0.1'),
      `sink pid=${sink.pid} · uç sayısı=${tcp ? tcp.length : 'OKUNAMADI'} · loopback-dışı=${nonLoop.length} · dinleme=${JSON.stringify(listen.map((c) => `${c.LocalAddress}:${c.LocalPort}`))}`);
  } finally { try { sink.kill(); } catch (e) { /* */ } }

  console.log(JSON.stringify({ record: 'I12-ENVELOPE-OFFTARGET-PROVA', pass, fail }, null, 1));
  process.exitCode = fail > 0 ? 1 : 0;
})();
