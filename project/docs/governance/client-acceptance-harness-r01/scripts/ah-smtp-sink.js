/*
 * CLIENT KABUL ALTYAPISI (İ1a) — YEREL SMTP YAKALAMA SUNUCUSU
 *
 * NEDEN: ".invalid adres kullandım" tek başına dış gönderim engeli DEĞİLDİR. Gerçek engel,
 * taşıma katmanının **loopback'e bağlanması** ve gerçek sağlayıcıya giden bir yolun
 * BULUNMAMASIDIR. Bu sunucu 127.0.0.1'de dinler, SMTP konuşmasını karşılar ve mesajı diske
 * yazar; hiçbir baytı dışarı iletmez.
 *
 * KULLANIM
 *   node ah-smtp-sink.js            # 127.0.0.1:<AH_SMTP_PORT|2525>, yakalananlar AH_SMTP_CAPTURE
 *   AH_SMTP_FAIL=reject  ...        # her gönderimi 550 ile REDDEDER (kesin ret senaryosu)
 *   AH_SMTP_FAIL=hang    ...        # yanıt vermez (belirsiz sonuç senaryosu)
 *
 * Sunucu YALNIZ loopback'e bağlanır; `host` parametresi sabittir ve dışarıdan değiştirilemez.
 */
'use strict';
const net = require('net');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.AH_SMTP_PORT || 2525);
const HOST = '127.0.0.1'; // SABİT — dışarı açılamaz
const CAPTURE_DIR = process.env.AH_SMTP_CAPTURE || path.join(process.cwd(), 'smtp-capture');
const FAIL_MODE = (process.env.AH_SMTP_FAIL || '').toLowerCase(); // '' | 'reject' | 'hang'

fs.mkdirSync(CAPTURE_DIR, { recursive: true });

let captured = 0;

const server = net.createServer((sock) => {
  let buf = '';
  let inData = false;
  let message = { from: null, to: [], data: '' };

  const say = (line) => { if (FAIL_MODE !== 'hang') sock.write(line + '\r\n'); };

  say('220 ah-smtp-sink ESMTP (loopback only)');

  sock.on('data', (chunk) => {
    buf += chunk.toString('utf8');
    let idx;
    while ((idx = buf.indexOf('\r\n')) >= 0) {
      const line = buf.slice(0, idx);
      buf = buf.slice(idx + 2);

      if (inData) {
        if (line === '.') {
          inData = false;
          captured += 1;
          const file = path.join(CAPTURE_DIR, `msg-${Date.now()}-${captured}.eml`);
          fs.writeFileSync(file, [
            `X-AH-Sink: captured-locally`,
            `X-AH-From: ${message.from}`,
            `X-AH-To: ${message.to.join(', ')}`,
            '',
            message.data,
          ].join('\n'), 'utf8');
          say('250 2.0.0 Ok: queued locally (NOT delivered anywhere)');
          message = { from: null, to: [], data: '' };
        } else {
          message.data += line + '\n';
        }
        continue;
      }

      const up = line.toUpperCase();
      if (up.startsWith('EHLO') || up.startsWith('HELO')) {
        say('250-ah-smtp-sink');
        say('250 8BITMIME');
      } else if (up.startsWith('MAIL FROM')) {
        if (FAIL_MODE === 'reject') { say('550 5.7.1 Rejected by sink (test)'); continue; }
        message.from = line.slice(line.indexOf(':') + 1).trim();
        say('250 2.1.0 Ok');
      } else if (up.startsWith('RCPT TO')) {
        message.to.push(line.slice(line.indexOf(':') + 1).trim());
        say('250 2.1.5 Ok');
      } else if (up === 'DATA') {
        inData = true;
        say('354 End data with <CR><LF>.<CR><LF>');
      } else if (up === 'QUIT') {
        say('221 2.0.0 Bye');
        sock.end();
      } else if (up === 'RSET') {
        message = { from: null, to: [], data: '' };
        say('250 2.0.0 Ok');
      } else {
        say('250 2.0.0 Ok');
      }
    }
  });

  sock.on('error', () => { /* istemci kopmasi normaldir */ });
});

server.listen(PORT, HOST, () => {
  console.log(JSON.stringify({
    record: 'AH-SMTP-SINK-READY',
    host: HOST, port: PORT, failMode: FAIL_MODE || 'none',
    captureDir: CAPTURE_DIR,
    note: 'loopback only — hicbir mesaj disariya iletilmez',
  }));
});

process.on('SIGTERM', () => server.close(() => process.exit(0)));
process.on('SIGINT', () => server.close(() => process.exit(0)));
