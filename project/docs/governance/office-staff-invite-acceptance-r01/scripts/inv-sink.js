/*
 * OFFICE PERSONEL DAVETI — YEREL E-POSTA YAKALAYICISI (loopback SABIT)
 *
 * NE: 127.0.0.1'de dinler, SMTP konusmasini kabul eder, mesaji diske yazar. HICBIR MESAJI ILETMEZ.
 * NE DEGIL: bir posta sunucusu. Dis baglanti KURMAZ; yalniz dinler.
 *
 * SIR KAPILARI (olculmus gerekcelerle):
 *   - AUTH ILAN EDILMEZ ve AUTH komutu 503 ile REDDEDILIR.
 *     Olcum (2026-09-23, nodemailer): sunucu AUTH ilan etmezse istemci kimlik bilgisini HIC gondermez;
 *     ilan ederse `AUTH PLAIN <base64>` gonderir ve kimlik bilgisi cozulebilir. Bu yuzden ilan YOK.
 *   - Komut satirlari diske YAZILMAZ; yalnizca zarf ozeti (from/rcpt) ve mesaj govdesi yazilir.
 *   - STARTTLS ilan edilmez (yukseltme denemesi 454 alir; tasima loopback'te kalir).
 *
 * YAKALAMA DOSYALARI SIR TASIR: davet baglantisindaki HAM TOKEN govdededir. Dizin kanit dizini DEGILDIR;
 * kosum sonunda silinir ve silinme dogrulanir (`inv-run.js` purgeCapture).
 *
 * KULLANIM: INV_SINK_DIR=<dizin> INV_SINK_PORT=<port> node inv-sink.js
 */
'use strict';
const fs = require('fs');
const net = require('net');
const path = require('path');

const HOST = '127.0.0.1'; // SABIT — disariya acilamaz
const PORT = parseInt(process.env.INV_SINK_PORT || '2527', 10);
const DIR = process.env.INV_SINK_DIR;
if (!DIR) throw new Error('INV_SINK_DIR tanimli degil');
if (PORT === 465) throw new Error('465 KULLANILAMAZ: urun bu portta TLS bekler (secure = PORT===465)');
fs.mkdirSync(DIR, { recursive: true });

let msgSeq = 0;
const server = net.createServer((sock) => {
  let buf = '';
  let inData = false;
  let msg = { from: null, to: [], data: '' };
  const say = (s) => sock.write(s + '\r\n');
  say('220 inv-sink (yerel yakalayici; hicbir mesaj iletilmez)');
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
          const file = path.join(DIR, `inv-msg-${String(msgSeq).padStart(4, '0')}.eml`);
          // Zarf ozeti (alici denetimi icin) + govde. Komut satirlari YAZILMAZ.
          fs.writeFileSync(file, `X-INV-From: ${msg.from}\r\nX-INV-Rcpt: ${msg.to.join(', ')}\r\n${msg.data}`, 'utf8');
          msg = { from: null, to: [], data: '' };
          say('250 2.0.0 Ok: yerel olarak yazildi (HICBIR YERE iletilmedi)');
        } else {
          msg.data += line + '\r\n';
        }
        continue;
      }
      const up = line.toUpperCase();
      if (up.startsWith('EHLO') || up.startsWith('HELO')) {
        say('250-inv-sink');
        say('250 8BITMIME'); // AUTH ve STARTTLS BILEREK ilan EDILMEZ
      } else if (up.startsWith('AUTH')) {
        say('503 5.5.1 AUTH desteklenmiyor — kimlik bilgisi KABUL EDILMEZ');
      } else if (up === 'STARTTLS') {
        say('454 4.7.0 STARTTLS desteklenmiyor');
      } else if (up.startsWith('MAIL FROM')) {
        msg.from = (line.match(/<([^>]*)>/) || [])[1] || null;
        say('250 2.1.0 Ok');
      } else if (up.startsWith('RCPT TO')) {
        const r = (line.match(/<([^>]*)>/) || [])[1];
        if (r) msg.to.push(r);
        say('250 2.1.5 Ok');
      } else if (up === 'DATA') {
        inData = true;
        say('354 Govdeyi girin; sonunda tek nokta');
      } else if (up === 'RSET') {
        msg = { from: null, to: [], data: '' };
        say('250 2.0.0 Ok');
      } else if (up === 'QUIT') {
        say('221 2.0.0 Bye');
        sock.end();
      } else {
        say('250 2.0.0 Ok');
      }
    }
  });
  sock.on('error', () => { /* istemci koptu; yakalayici ayakta kalir */ });
});

server.listen(PORT, HOST, () => {
  console.log(JSON.stringify({
    record: 'INV-SMTP-SINK-READY', host: HOST, port: PORT, captureDir: DIR,
    note: 'yalniz loopback; AUTH ilan EDILMEZ; hicbir mesaj disariya iletilmez',
  }));
});
