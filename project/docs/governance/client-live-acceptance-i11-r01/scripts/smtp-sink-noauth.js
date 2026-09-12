/*
 * İ11 / Yöntem T — YEREL SMTP YAKALAYICI (AUTH İLAN ETMEYEN sürüm; repo DIŞI test aracı).
 *
 * NEDEN AUTH İLAN ETMEZ: canlı `.env`'deki SMTP_USER/SMTP_PASS pencere boyunca DEĞİŞTİRİLMEZ.
 * Sunucu EHLO yanıtında AUTH ilan etmezse nodemailer AUTH komutunu HİÇ göndermez (ölçüldü) →
 * canlı SMTP parolası yerel sürece bile iletilmez. AUTH komutu yine de gelirse 502 ile reddedilir.
 *
 * Yalnız 127.0.0.1'e bağlanır; gelen DATA'yı dosyaya yazar; HİÇBİR iletiyi DIŞARI göndermez.
 *   SINK_PORT=2526 SINK_LOG=<dosya> node smtp-sink-noauth.js
 */
'use strict';
const net = require('net');
const fs = require('fs');

const PORT = Number(process.env.SINK_PORT || 2526);
const LOG = process.env.SINK_LOG;
if (!LOG) { console.error('SINK_LOG zorunlu'); process.exit(2); }
if ([25, 465, 587, 8080, 3002, 5432].includes(PORT)) { console.error('yasak port'); process.exit(2); }

let seq = 0;
const server = net.createServer((sock) => {
  let buf = '';
  let inData = false;
  let data = '';
  const env = { from: null, to: [] };
  sock.setEncoding('utf8');
  sock.write('220 i11-sink-noauth ESMTP\r\n');
  sock.on('data', (chunk) => {
    if (inData) {
      data += chunk;
      const end = data.indexOf('\r\n.\r\n');
      if (end >= 0) {
        const body = data.slice(0, end);
        seq += 1;
        fs.appendFileSync(LOG, `${JSON.stringify({ t: new Date().toISOString(), seq, envelope: env, raw: body })}\n`);
        inData = false; data = '';
        sock.write('250 2.0.0 Ok: queued (SINK — DISARI GONDERILMEDI)\r\n');
      }
      return;
    }
    buf += chunk;
    let idx;
    while ((idx = buf.indexOf('\r\n')) >= 0) {
      const line = buf.slice(0, idx); buf = buf.slice(idx + 2);
      const up = line.toUpperCase();
      // AUTH ILAN EDILMEZ: 250-AUTH satiri YOK -> istemci parolayi HIC gondermez.
      if (up.startsWith('EHLO') || up.startsWith('HELO')) sock.write('250-i11-sink-noauth\r\n250 8BITMIME\r\n');
      else if (up.startsWith('AUTH')) sock.write('502 5.5.1 AUTH desteklenmiyor (SINK)\r\n');
      else if (up.startsWith('MAIL FROM')) { env.from = line.slice(10).trim(); sock.write('250 2.1.0 Ok\r\n'); }
      else if (up.startsWith('RCPT TO')) { env.to.push(line.slice(8).trim()); sock.write('250 2.1.5 Ok\r\n'); }
      else if (up.startsWith('DATA')) { inData = true; sock.write('354 End data with <CR><LF>.<CR><LF>\r\n'); }
      else if (up.startsWith('QUIT')) { sock.write('221 2.0.0 Bye\r\n'); sock.end(); }
      else if (up.startsWith('RSET') || up.startsWith('NOOP')) sock.write('250 2.0.0 Ok\r\n');
      else sock.write('250 2.0.0 Ok\r\n');
    }
  });
  sock.on('error', () => {});
}).listen(PORT, '127.0.0.1', () => {
  fs.appendFileSync(LOG, `${JSON.stringify({ t: new Date().toISOString(), action: 'LISTEN', port: PORT, auth: false })}\n`);
  console.log(`smtp-sink-noauth 127.0.0.1:${PORT} — AUTH ILAN EDILMIYOR — kayit ${LOG}`);
});
process.on('SIGTERM', () => server.close());
