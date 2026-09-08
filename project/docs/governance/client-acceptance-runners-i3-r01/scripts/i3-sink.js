/*
 * İ3 — YOL B İÇİN YEREL SMTP YAKALAMA (İ1a sink'inden AYRI, onu DEĞİŞTİRMEZ)
 *
 * NEDEN AYRI: İ1a sink'i tek modda çalışır ve BAĞLANTI saymaz. H5-01 üç sonucu (kabul /
 * doğrulanabilir ret / belirsiz) ayrı ayrı ölçmek için modun koşum sırasında değişmesini,
 * H5-01b ise "otomatik tekrar gönderim yok" iddiası için SAĞLAYICI KONUŞMA SAYISINI ister.
 *
 * Modlar (mod dosyası ile canlı değiştirilir — süreç yeniden başlatılmaz):
 *   ''        → mesajı kabul eder (250) ve diske yazar            → ACCEPTED
 *   'reject'  → MAIL FROM'a 550 döner (doğrulanabilir ret)        → REJECTED
 *   'reset'   → DATA aşamasında bağlantıyı koparır (ECONNRESET)     → INDETERMINATE
 *   'hang'    → hiç yanıt vermez (istemci timeout'a düşer)          → INDETERMINATE (yavaş)
 *
 * `reset` bilerek varsayılan belirsizlik yoludur: `ECONNRESET` üründe TRANSPORT_NEVER_SENT
 * kümesinde DEĞİLDİR (`email-provider.service.ts:76-84` — veri gönderilmiş olabilir), bu yüzden
 * `classifyTransportError` onu INDETERMINATE sayar. `hang` aynı sonucu üretir ama istemci
 * timeout'unu bekletir; ölçüm hızı için `reset` tercih edilir.
 *
 * YALNIZ loopback'e bağlanır; `HOST` sabittir. Hiçbir baytı dışarı iletmez.
 */
'use strict';
const net = require('net');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.I3_SMTP_PORT || 2526);
const HOST = '127.0.0.1'; // SABİT — dışarı açılamaz
const DIR = process.env.I3_SMTP_CAPTURE || path.join(process.cwd(), 'i3-smtp-capture');
const MODE_FILE = path.join(DIR, 'mode');

fs.mkdirSync(DIR, { recursive: true });
if (!fs.existsSync(MODE_FILE)) fs.writeFileSync(MODE_FILE, '', 'utf8');

const readMode = () => {
  try { return fs.readFileSync(MODE_FILE, 'utf8').trim(); } catch (e) { return ''; }
};

let connSeq = 0;
let msgSeq = 0;

const server = net.createServer((sock) => {
  // Her BAĞLANTI ayrı dosyaya işaretlenir: "otomatik tekrar gönderim yok" iddiası bu sayımla
  // ölçülür (reddedilen/yanıtsız denemeler de sayılır — yalnız yakalanan mesajlar değil).
  connSeq += 1;
  const mode = readMode();
  fs.writeFileSync(path.join(DIR, `conn-${String(connSeq).padStart(4, '0')}.log`),
    `mode=${mode}\nat=${new Date().toISOString()}\n`, 'utf8');

  let buf = '';
  let inData = false;
  let msg = { from: null, to: [], data: '' };
  const say = (line) => { if (mode !== 'hang') sock.write(line + '\r\n'); };

  say('220 i3-sink ESMTP (loopback only)');

  sock.on('data', (chunk) => {
    buf += chunk.toString('utf8');
    let i;
    while ((i = buf.indexOf('\r\n')) >= 0) {
      const line = buf.slice(0, i);
      buf = buf.slice(i + 2);

      if (inData) {
        if (line === '.') {
          inData = false;
          msgSeq += 1;
          fs.writeFileSync(path.join(DIR, `msg-${String(msgSeq).padStart(4, '0')}.eml`),
            `X-I3-Sink: captured-locally\nX-I3-To: ${msg.to.join(', ')}\n\n${msg.data}`, 'utf8');
          say('250 2.0.0 Ok: queued locally (NOT delivered anywhere)');
          msg = { from: null, to: [], data: '' };
        } else { msg.data += line + '\n'; }
        continue;
      }

      const up = line.toUpperCase();
      if (up.startsWith('EHLO') || up.startsWith('HELO')) { say('250-i3-sink'); say('250 8BITMIME'); }
      else if (up.startsWith('MAIL FROM')) {
        if (mode === 'reject') { say('550 5.7.1 Rejected by sink (test)'); continue; }
        msg.from = line.slice(line.indexOf(':') + 1).trim();
        say('250 2.1.0 Ok');
      } else if (up.startsWith('RCPT TO')) {
        msg.to.push(line.slice(line.indexOf(':') + 1).trim());
        say('250 2.1.5 Ok');
      } else if (up === 'DATA') {
        if (mode === 'reset') { sock.destroy(); return; } // ECONNRESET → INDETERMINATE
        inData = true; say('354 End data with <CR><LF>.<CR><LF>');
      }
      else if (up === 'QUIT') { say('221 2.0.0 Bye'); sock.end(); }
      else if (up === 'RSET') { msg = { from: null, to: [], data: '' }; say('250 2.0.0 Ok'); }
      else { say('250 2.0.0 Ok'); }
    }
  });

  sock.on('error', () => { /* istemci kopmasi normaldir */ });
});

server.listen(PORT, HOST, () => {
  console.log(JSON.stringify({
    record: 'I3-SMTP-SINK-READY', host: HOST, port: PORT, captureDir: DIR,
    note: 'loopback only — hicbir mesaj disariya iletilmez; mod dosyasi ile canli degistirilir',
  }));
});

process.on('SIGTERM', () => server.close(() => process.exit(0)));
process.on('SIGINT', () => server.close(() => process.exit(0)));
